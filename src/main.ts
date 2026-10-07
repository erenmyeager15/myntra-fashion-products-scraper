import { Actor, log } from 'apify';
import { Impit } from 'impit';
import type { ProductRecord } from './types.js';
import { wasPushedRecordSaved } from './billing.js';
import { buildCategoryUrl, buildSearchUrl, normalizeCategoryPath, normalizeInput } from './input.js';
import { classifyRunOutcome } from './outcome.js';
import { classifyMyxPayload, extractMyxData, toRecord } from './routes.js';
import { createHtmlFetcher } from './transport.js';

interface TargetResult {
    parsed: boolean;
    failure?: string;
}

await Actor.init();

try {
    const input = normalizeInput(await Actor.getInput());

    log.info('Starting Myntra Fashion Product Scraper', {
        searchQueries: input.searchQueries,
        categoryPaths: input.categoryPaths,
        maxResults: input.maxResults,
        sortBy: input.sortBy,
    });

    const proxyConfiguration = (input.proxyConfiguration?.useApifyProxy || input.proxyConfiguration?.proxyUrls?.length)
        ? await Actor.createProxyConfiguration(input.proxyConfiguration)
        : undefined;

    const headers: Record<string, string> = {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-IN,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    };

    const transport = createHtmlFetcher(async () => {
        const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
        return new Impit({
            browser: 'chrome',
            headers,
            maxRedirects: 5,
            proxyUrl,
            timeout: 45_000,
        });
    }, sleep, (html) => classifyMyxPayload(extractMyxData(html)).kind !== 'invalid', {
        maxAttempts: proxyConfiguration ? 3 : 1,
        canAttempt: canFetch,
    });
    const charging = Actor.getChargingManager();
    function canFetch(): boolean {
        return !charging.getPricingInfo().isPayPerEvent
            || charging.calculateMaxEventChargeCountWithinLimit('product-scraped') >= 1;
    }

    let saved = 0;
    let spendingLimitReached = false;
    let parsedTargetCount = 0;
    let failedTargetCount = 0;
    const targetFailures: string[] = [];
    const seen = new Set<string>();

    async function pushRecords(records: ProductRecord[]): Promise<void> {
        for (const record of records) {
            if (saved >= input.maxResults || spendingLimitReached) return;
            const key = record.productId !== null ? String(record.productId) : record.productUrl ?? record.title;
            if (seen.has(key)) continue;

            const chargeResult = await Actor.pushData(record, 'product-scraped');
            const recordWasSaved = wasPushedRecordSaved(chargeResult);
            if (recordWasSaved) {
                seen.add(key);
                saved += 1;
            }

            if (chargeResult.eventChargeLimitReached) {
                spendingLimitReached = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${saved} products`);
                log.warning('User spending limit reached; stopping before more Myntra requests.');
                return;
            }
        }
    }

    async function scrapeTarget(urlBuilder: (page: number) => string, searchQuery: string | null, categoryPath: string | null): Promise<TargetResult> {
        let page = 1;
        let position = 1;
        let stagnantPages = 0;
        let parsedAnyPage = false;

        while (saved < input.maxResults && page <= 20 && stagnantPages < 2 && !spendingLimitReached) {
            if (!canFetch()) {
                spendingLimitReached = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${saved} products`);
                return { parsed: parsedAnyPage };
            }
            const url = urlBuilder(page);
            log.info(`Fetching Myntra page ${page}: ${url}`);
            const before = saved;
            const response = await transport.fetch(url);
            if (response.spendingLimitReached) {
                spendingLimitReached = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${saved} products`);
                return { parsed: parsedAnyPage };
            }
            if (!response.html) {
                const advice = proxyConfiguration ? ''
                    : ' Direct cloud requests may omit product data. Enable Residential India proxy in proxyConfiguration and retry.';
                return { parsed: parsedAnyPage, failure: `${response.error ?? `No response from ${url}`}.${advice}` };
            }

            const data = extractMyxData(response.html);
            const payload = classifyMyxPayload(data);
            if (payload.kind === 'invalid') {
                transport.reset();
                return { parsed: parsedAnyPage, failure: `${payload.reason}: ${url}` };
            }
            if (payload.kind === 'empty') {
                log.info(`Myntra returned a valid empty product list on page ${page}: ${url}`);
                return { parsed: true };
            }
            const products = payload.products;

            const records = products
                .map((product, index) => toRecord(product, searchQuery, categoryPath, position + index))
                .filter((record): record is ProductRecord => record !== null);
            if (records.length === 0) {
                return { parsed: parsedAnyPage, failure: `Myntra returned product rows but none had a valid title and Myntra product URL: ${url}` };
            }
            parsedAnyPage = true;
            await pushRecords(records);

            if (spendingLimitReached) return { parsed: true };

            log.info(`Parsed ${records.length} product(s); saved ${saved}/${input.maxResults}.`);

            if (saved === before) stagnantPages++;
            else stagnantPages = 0;
            position += products.length;
            page++;
            if (saved < input.maxResults) {
                await sleep(700 + Math.floor(Math.random() * 1000));
            }
        }

        return { parsed: parsedAnyPage };
    }

    function recordTargetResult(label: string, result: TargetResult): void {
        if (result.parsed) parsedTargetCount++;
        if (result.failure) {
            failedTargetCount++;
            targetFailures.push(`${label}: ${result.failure}`);
            log.warning(`Myntra target ended with an error: ${label}: ${result.failure}`);
        }
    }

    for (const query of input.searchQueries) {
        if (saved >= input.maxResults || spendingLimitReached) break;
        const result = await scrapeTarget((page) => buildSearchUrl(query, page, input.sortBy), query, null);
        recordTargetResult(`search "${query}"`, result);
    }

    for (const category of input.categoryPaths) {
        if (saved >= input.maxResults || spendingLimitReached) break;
        const normalized = normalizeCategoryPath(category);
        const result = await scrapeTarget((page) => buildCategoryUrl(normalized, page, input.sortBy), null, normalized);
        recordTargetResult(`category "${normalized}"`, result);
    }

    await Actor.setValue('RUN_SUMMARY', {
        savedProducts: saved, parsedTargetCount, failedTargetCount, spendingLimitReached,
        partial: saved > 0 && failedTargetCount > 0,
        maxResultsReached: saved >= input.maxResults,
        targetFailures,
    });
    const outcome = classifyRunOutcome(saved, spendingLimitReached, parsedTargetCount, failedTargetCount);
    if (targetFailures.length > 0) {
        log.warning(`Completed with ${targetFailures.length} target issue(s). First issue: ${targetFailures[0]}`);
    }

    if (outcome === 'empty') {
        await Actor.setStatusMessage('Finished successfully: valid Myntra pages returned no products');
        log.warning('Valid Myntra product payloads were parsed, but the selected targets returned no products.');
    } else if (outcome === 'results') {
        await Actor.setStatusMessage(`Finished with ${saved} unique Myntra products`);
    }
    log.info(`Myntra scrape finished. ${saved} products saved; ${parsedTargetCount} target(s) parsed; ${failedTargetCount} target issue(s).`);
    await Actor.exit();
} catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    log.exception(failure, 'Myntra scraper failed');
    await Actor.fail(failure.message);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
