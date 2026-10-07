import assert from 'node:assert/strict';
import test from 'node:test';
import { createHtmlFetcher, readBoundedHtml } from './transport.js';
import { classifyMyxPayload, extractMyxData } from './routes.js';

const hasCompleteProducts = (html: string) => classifyMyxPayload(extractMyxData(html)).kind !== 'invalid';
const emptyPayload = '<script>window.__myx={"searchData":{"results":{"products":[]}}};</script>';

test('recovers an HTTP 200 page missing product data with a fresh client', async () => {
    let clients = 0;
    const sleeps: number[] = [];
    const transport = createHtmlFetcher(async () => {
        const id = ++clients;
        return { fetch: async () => new Response(id === 1 ? '<html>No product data</html>' : emptyPayload) };
    }, async (ms) => { sleeps.push(ms); }, hasCompleteProducts);
    assert.equal((await transport.fetch('https://www.myntra.com/tshirts')).html, emptyPayload);
    assert.equal(clients, 2);
    assert.deepEqual(sleeps, [1000]);
    assert.equal((await transport.fetch('https://www.myntra.com/jeans')).html, emptyPayload);
    assert.equal(clients, 2);
});

test('bounds HTTP 200 invalid-payload recovery without converting failure into an empty result', async () => {
    let calls = 0;
    const transport = createHtmlFetcher(async () => ({ fetch: async () => {
        calls++;
        return new Response('<html>No product data</html>');
    } }), async () => {}, hasCompleteProducts);
    const result = await transport.fetch('https://www.myntra.com/tshirts');
    assert.equal(result.html, null);
    assert.match(result.error!, /without a valid product payload/);
    assert.equal(calls, 3);
});

test('direct-mode attempt limit avoids repeating the known missing-payload response', async () => {
    let calls = 0;
    const transport = createHtmlFetcher(async () => ({ fetch: async () => {
        calls++;
        return new Response('<html>No product data</html>');
    } }), async () => assert.fail('Unexpected retry'), hasCompleteProducts, { maxAttempts: 1 });
    assert.equal((await transport.fetch('https://www.myntra.com/tshirts')).html, null);
    assert.equal(calls, 1);
});

test('stops before retrying when the spending limit is reached', async () => {
    let calls = 0;
    const transport = createHtmlFetcher(async () => ({ fetch: async () => {
        calls++;
        return new Response('', { status: 429 });
    } }), async () => {}, hasCompleteProducts, { canAttempt: () => calls === 0 });
    const result = await transport.fetch('https://www.myntra.com/tshirts');
    assert.equal(result.spendingLimitReached, true);
    assert.equal(calls, 1);
});

test('recovers a disconnected response stream with a fresh client', async () => {
    let clients = 0;
    const transport = createHtmlFetcher(async () => {
        const id = ++clients;
        return { fetch: async () => id === 1
            ? new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Connection reset')); } }))
            : new Response(emptyPayload) };
    }, async () => {}, hasCompleteProducts);
    assert.equal((await transport.fetch('https://www.myntra.com/tshirts')).html, emptyPayload);
    assert.equal(clients, 2);
});

test('does not redownload an oversized response', async () => {
    let calls = 0;
    const transport = createHtmlFetcher(async () => ({ fetch: async () => {
        calls++;
        return new Response('small', { headers: { 'content-length': String(9 * 1024 * 1024) } });
    } }), async () => assert.fail('Unexpected retry'), hasCompleteProducts);
    assert.match((await transport.fetch('https://www.myntra.com/tshirts')).error!, /byte limit/);
    assert.equal(calls, 1);
});

test('an oversized-response cleanup error preserves the byte-limit stop without retries', async () => {
    let calls = 0;
    const transport = createHtmlFetcher(async () => ({ fetch: async () => {
        calls++;
        const body = new ReadableStream<Uint8Array>({ cancel() { throw new Error('Cleanup failed'); } });
        return new Response(body, { headers: { 'content-length': String(9 * 1024 * 1024) } });
    } }), async () => assert.fail('Oversized data must not be redownloaded'), hasCompleteProducts);
    assert.match((await transport.fetch('https://www.myntra.com/tshirts')).error!, /byte limit/);
    assert.equal(calls, 1);
});

test('stops reading only after a complete valid product payload, cancelling the HTML tail', async () => {
    const payload = '<script>window.__myx={"searchData":{"results":{"products":[{"productId":1}]}}};</script>';
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) { pulls++; controller.enqueue(Buffer.from(pulls === 1 ? payload : 'unneeded markup')); },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    assert.equal(await readBoundedHtml(new Response(body), 4096, hasCompleteProducts), payload);
    assert.equal(pulls, 1);
    assert.equal(cancelled, true);
});

test('stops at a completed product assignment before the later script-close chunk', async () => {
    const payload = '<script>window.__myx={"searchData":{"results":{"products":[{"productId":1}]}}};';
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) { pulls++; controller.enqueue(Buffer.from(pulls === 1 ? payload : '</script>' + 'tail'.repeat(20000))); },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    assert.equal(await readBoundedHtml(new Response(body), 4096, hasCompleteProducts), payload);
    assert.equal(pulls, 1);
    assert.equal(cancelled, true);
});

test('detects the assignment terminator across chunks below the next exponential probe', async () => {
    const payload = '<script>window.__myx={"searchData":{"results":{"products":[{"productId":1}]}}};';
    const chunks = [payload.slice(0, -1), ';', '</script>' + 'tail'.repeat(20000)];
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(Buffer.from(chunks[pulls++])); },
    }, { highWaterMark: 0 });
    assert.equal(await readBoundedHtml(new Response(body), 4096, hasCompleteProducts), payload);
    assert.equal(pulls, 2);
});

test('a cleanup error after complete product data never redownloads the successful page', async () => {
    let clients = 0;
    let calls = 0;
    const transport = createHtmlFetcher(async () => {
        clients++;
        return { fetch: async () => {
            calls++;
            const body = new ReadableStream<Uint8Array>({
                pull(controller) { controller.enqueue(Buffer.from(emptyPayload)); },
                cancel() { throw new Error('Socket already closed during cleanup'); },
            }, { highWaterMark: 0 });
            return new Response(body);
        } };
    }, async () => assert.fail('Successful product data must not be retried'), hasCompleteProducts);
    assert.equal((await transport.fetch('https://www.myntra.com/tshirts')).html, emptyPayload);
    assert.equal(clients, 1);
    assert.equal(calls, 1);
});

test('split payload is never mistaken for a complete response', async () => {
    const chunks = ['<script>window.__myx={"searchData":', '{"results":{"products":[]}}};</script>'];
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close(); else controller.enqueue(Buffer.from(chunk));
    } });
    const html = await readBoundedHtml(new Response(body), 4096, hasCompleteProducts);
    assert.equal(classifyMyxPayload(extractMyxData(html)).kind, 'empty');
});

test('invalid product payload does not trigger early termination', async () => {
    const html = '<script>window.__myx={"challenge":true};</script><footer>still invalid</footer>';
    assert.equal(await readBoundedHtml(new Response(html), 4096, hasCompleteProducts), html);
    assert.equal(hasCompleteProducts(html), false);
});

test('reuses a successful client across pages and replaces a blocked client', async () => {
    let clients = 0;
    let calls = 0;
    const sleeps: number[] = [];
    const transport = createHtmlFetcher(async () => {
        clients++;
        return { fetch: async () => { calls++; return new Response('ok', { status: calls === 2 ? 403 : 200 }); } };
    }, async (ms) => { sleeps.push(ms); });
    assert.equal((await transport.fetch('https://www.myntra.com/shoes')).html, 'ok');
    assert.equal((await transport.fetch('https://www.myntra.com/shoes?p=2')).html, 'ok');
    assert.equal(clients, 2);
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [1000]);
    await transport.fetch('https://www.myntra.com/shoes?p=3');
    assert.equal(clients, 2);
});

test('bounds retries, does not sleep after last failure, and does not retry 404', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const transport = createHtmlFetcher(async () => ({ fetch: async () => { calls++; return new Response('', { status: 429 }); } }), async (ms) => { sleeps.push(ms); });
    assert.match((await transport.fetch('https://www.myntra.com/shoes')).error!, /429/);
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [1000, 2000]);
    calls = 0;
    const missing = createHtmlFetcher(async () => ({ fetch: async () => { calls++; return new Response('', { status: 404 }); } }), async () => assert.fail('Unexpected retry'));
    await missing.fetch('https://www.myntra.com/missing');
    assert.equal(calls, 1);
});

test('streaming byte bound handles missing and misleading content-length', async () => {
    await assert.rejects(readBoundedHtml(new Response('123456'), 5), /limit/);
    await assert.rejects(readBoundedHtml(new Response('123456', { headers: { 'content-length': '1' } }), 5), /limit/);
    await assert.rejects(readBoundedHtml(new Response('1', { headers: { 'content-length': '100' } }), 5), /limit/);
    assert.equal(await readBoundedHtml(new Response('12345'), 5), '12345');
});
