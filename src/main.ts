import { Actor, log } from 'apify';
import { ProxyAgent } from 'undici';
import type { ActorInput, ProductRecord } from './types.js';
import { extractMyxData, productsFromMyx, toRecord } from './routes.js';

await Actor.init();

const input = ((await Actor.getInput<ActorInput>()) ?? {}) as ActorInput;
const {
    searchQueries = ['tshirts'],
    categoryPaths = [],
    maxResults = 10,
    sortBy = 'recommended',
    proxyConfiguration: proxyInput,
} = input;

const queries = searchQueries.map((item) => item.trim()).filter(Boolean);
const categories = categoryPaths.map((item) => item.trim()).filter(Boolean);

if (queries.length === 0 && categories.length === 0) {
    throw new Error('Provide at least one search query or category path.');
}

const proxyConfiguration = (proxyInput?.useApifyProxy || proxyInput?.proxyUrls?.length)
    ? await Actor.createProxyConfiguration(proxyInput)
    : undefined;

const headers: Record<string, string> = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

function slugifyQuery(query: string): string {
    return query.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || encodeURIComponent(query);
}

function normalizeCategoryPath(pathOrUrl: string): string {
    try {
        const parsed = new URL(pathOrUrl);
        return parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    } catch {
        return pathOrUrl.replace(/^https?:\/\/www\.myntra\.com\//i, '').replace(/^\/+/, '').replace(/\/+$/, '');
    }
}

function buildSearchUrl(query: string, page: number): string {
    const url = new URL(`https://www.myntra.com/${slugifyQuery(query)}`);
    url.searchParams.set('rawQuery', query);
    if (page > 1) url.searchParams.set('p', String(page));
    if (sortBy !== 'recommended') url.searchParams.set('sort', sortBy);
    return url.toString();
}

function buildCategoryUrl(pathOrUrl: string, page: number): string {
    const path = normalizeCategoryPath(pathOrUrl);
    const url = new URL(`https://www.myntra.com/${path}`);
    if (page > 1) url.searchParams.set('p', String(page));
    if (sortBy !== 'recommended') url.searchParams.set('sort', sortBy);
    return url.toString();
}

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
                await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
                continue;
            }
            if (!res.ok) {
                log.warning(`HTTP ${res.status}: ${url}`);
                return null;
            }
            return await res.text();
        } catch (error) {
            log.warning(`Request failed for ${url}: ${(error as Error).message}`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    return null;
}

let saved = 0;
const seen = new Set<string>();

async function pushRecords(records: ProductRecord[]): Promise<void> {
    for (const record of records) {
        if (saved >= maxResults) return;
        const key = record.productId !== null ? String(record.productId) : record.productUrl ?? record.title ?? '';
        if (seen.has(key)) continue;
        seen.add(key);
        await Actor.pushData(record);
        await Actor.charge({ eventName: 'product-scraped' }).catch(() => null);
        saved++;
    }
}

async function scrapeTarget(urlBuilder: (page: number) => string, searchQuery: string | null, categoryPath: string | null): Promise<void> {
    let page = 1;
    let position = 1;
    let stagnantPages = 0;

    while (saved < maxResults && page <= 20 && stagnantPages < 2) {
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
        log.info(`Parsed ${records.length} product(s); saved ${saved}/${maxResults}.`);

        if (saved === before) stagnantPages++;
        else stagnantPages = 0;
        position += products.length;
        page++;
        await new Promise((resolve) => setTimeout(resolve, 700 + Math.floor(Math.random() * 1000)));
    }
}

for (const query of queries) {
    if (saved >= maxResults) break;
    await scrapeTarget((page) => buildSearchUrl(query, page), query, null);
}

for (const category of categories) {
    if (saved >= maxResults) break;
    const normalized = normalizeCategoryPath(category);
    await scrapeTarget((page) => buildCategoryUrl(category, page), null, normalized);
}

log.info(`Myntra scrape finished. ${saved} products saved.`);
await Actor.exit();
