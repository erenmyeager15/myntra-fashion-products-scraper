import { Actor, log } from 'apify';
import { ProxyAgent } from 'undici';
import type { ProductRecord } from './types.js';
import { wasPushedRecordSaved } from './billing.js';
import { buildCategoryUrl, buildSearchUrl, normalizeCategoryPath, normalizeInput } from './input.js';
import { extractMyxData, productsFromMyx, toRecord } from './routes.js';

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

    async function fetchHtml(url: string): Promise<string | null> {
        for (let attempt = 0; attempt < 4; attempt++) {
            let dispatcher: ProxyAgent | undefined;
            if (proxyConfiguration) {
                const proxyUrl = await proxyConfiguration.newUrl();
                if (proxyUrl) dispatcher = new ProxyAgent(proxyUrl);
            }

            try {
                const res = await fetch(url, { headers, ...(dispatcher ? { dispatcher } : {}) } as any);
                if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 529) {
                    log.warning(`Blocked/rate-limited with HTTP ${res.status}: ${url}`);
                    await sleep(1500 * (attempt + 1));
                    continue;
                }
                if (!res.ok) {
                    log.warning(`HTTP ${res.status}: ${url}`);
                    return null;
                }
                return await res.text();
            } catch (error) {
                log.warning(`Request failed for ${url}: ${(error as Error).message}`);
                await sleep(1000 * (attempt + 1));
            }
        }
        return null;
    }

    let saved = 0;
    let spendingLimitReached = false;
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

    async function scrapeTarget(urlBuilder: (page: number) => string, searchQuery: string | null, categoryPath: string | null): Promise<void> {
        let page = 1;
        let position = 1;
        let stagnantPages = 0;

        while (saved < input.maxResults && page <= 20 && stagnantPages < 2 && !spendingLimitReached) {
            const url = urlBuilder(page);
            log.info(`Fetching Myntra page ${page}: ${url}`);
            const before = saved;
            const html = await fetchHtml(url);
            if (!html) break;

            const data = extractMyxData(html);
            const products = productsFromMyx(data);
            if (products.length === 0) {
                log.warning(`No products parsed from ${url}. Myntra layout may have changed or blocked the request.`);
                break;
            }

            const records = products
                .map((product, index) => toRecord(product, searchQuery, categoryPath, position + index))
                .filter((record): record is ProductRecord => record !== null);
            await pushRecords(records);

            if (spendingLimitReached) break;

            log.info(`Parsed ${records.length} product(s); saved ${saved}/${input.maxResults}.`);

            if (saved === before) stagnantPages++;
            else stagnantPages = 0;
            position += products.length;
            page++;
            if (saved < input.maxResults) {
                await sleep(700 + Math.floor(Math.random() * 1000));
            }
        }
    }

    for (const query of input.searchQueries) {
        if (saved >= input.maxResults || spendingLimitReached) break;
        await scrapeTarget((page) => buildSearchUrl(query, page, input.sortBy), query, null);
    }

    for (const category of input.categoryPaths) {
        if (saved >= input.maxResults || spendingLimitReached) break;
        const normalized = normalizeCategoryPath(category);
        await scrapeTarget((page) => buildCategoryUrl(category, page, input.sortBy), null, normalized);
    }

    if (saved === 0 && !spendingLimitReached) {
        throw new Error('No Myntra products were saved. Try a broader search query, category path, lower filters, or Residential India proxy.');
    }

    if (!spendingLimitReached) {
        await Actor.setStatusMessage(`Finished with ${saved} unique Myntra products`);
    }
    log.info(`Myntra scrape finished. ${saved} products saved.`);
} catch (error) {
    log.exception(error instanceof Error ? error : new Error(String(error)), 'Myntra scraper failed');
    throw error;
} finally {
    await Actor.exit();
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
