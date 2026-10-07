export const MAX_HTML_BYTES = 8 * 1024 * 1024;
export const MAX_ATTEMPTS = 3;

class ResponseTooLargeError extends Error {}

interface FetchOptions {
    maxAttempts?: number;
    canAttempt?: () => boolean;
}

export interface HtmlResponse {
    status: number;
    ok: boolean;
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
}

export async function readBoundedHtml(response: HtmlResponse, limit = MAX_HTML_BYTES,
    isComplete?: (html: string) => boolean): Promise<string> {
    if (!response.body) throw new Error('Empty response body');
    const declared = Number(response.headers.get('content-length'));
    if (declared > limit) {
        await response.body.cancel();
        throw new ResponseTooLargeError(`Response exceeds ${limit} byte limit`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let nextProbe = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit) {
                await reader.cancel();
                throw new ResponseTooLargeError(`Response exceeds ${limit} byte limit`);
            }
            chunks.push(value);
            if (isComplete && total >= nextProbe) {
                const html = Buffer.concat(chunks, total).toString('utf8');
                // Exponential probing bounds repeated copies/parses on large pages.
                nextProbe = Math.max(32 * 1024, total * 2);
                if (isComplete(html)) {
                    await reader.cancel();
                    return html;
                }
            }
        }
    } catch (failure) {
        await reader.cancel().catch(() => {});
        throw failure;
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks, total).toString('utf8');
}

/** Reuse a working connection/proxy; replace it only after a transient failure. */
export function createHtmlFetcher(createClient: () => Promise<{ fetch(url: string): Promise<HtmlResponse> }>,
    sleep: (ms: number) => Promise<void>, isComplete?: (html: string) => boolean,
    options: FetchOptions = {}) {
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    const maxAttempts = Math.max(1, Math.min(MAX_ATTEMPTS, options.maxAttempts ?? MAX_ATTEMPTS));
    return {
        reset() { client = undefined; },
        async fetch(url: string): Promise<{ html: string | null; error?: string; spendingLimitReached?: boolean }> {
            let error = 'Request failed';
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (options.canAttempt && !options.canAttempt()) {
                    return { html: null, error: 'Stopped at the user\'s spending limit', spendingLimitReached: true };
                }
                try {
                    client ??= await createClient();
                    const response = await client.fetch(url);
                    if (response.ok) {
                        const html = await readBoundedHtml(response, MAX_HTML_BYTES, isComplete);
                        if (!isComplete || isComplete(html)) return { html };
                        // Some unusable/challenge pages return HTTP 200. Replace their
                        // connection just as for HTTP blocking, within the same retry cap.
                        error = 'Myntra returned a page without a valid product payload';
                    } else {
                        await response.body?.cancel();
                        error = `Myntra returned HTTP ${response.status}`;
                        if (![401, 403, 408, 429, 529].includes(response.status) && response.status < 500) {
                            client = undefined;
                            return { html: null, error };
                        }
                    }
                } catch (failure) {
                    error = (failure as Error).message;
                    if (failure instanceof ResponseTooLargeError) {
                        client = undefined;
                        return { html: null, error };
                    }
                }
                client = undefined;
                if (attempt + 1 < maxAttempts) await sleep(1000 * (attempt + 1));
            }
            return { html: null, error };
        },
    };
}
