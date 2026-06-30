import type { ActorInput, NormalizedInput, SortBy } from './types.js';

const MYNTRA_ORIGIN = 'https://www.myntra.com';
const DEFAULT_PROXY = {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'IN',
};
const MAX_TARGETS_PER_FIELD = 5;
const MAX_TOTAL_TARGETS = 10;
const MAX_RESULTS = 500;
const ALLOWED_SORTS = new Set(['recommended', 'popularity', 'price_asc', 'price_desc', 'new', 'discount', 'rating']);

export function normalizeInput(input: ActorInput | null | undefined): NormalizedInput {
    const raw = input ?? {};
    const searchQueries = uniqueStrings(raw.searchQueries ?? ['tshirts']);
    const categoryPaths = uniqueStrings(raw.categoryPaths ?? []);
    const totalTargets = searchQueries.length + categoryPaths.length;

    if (totalTargets === 0) {
        throw new Error('Provide at least one search query or category path.');
    }
    if (searchQueries.length > MAX_TARGETS_PER_FIELD || categoryPaths.length > MAX_TARGETS_PER_FIELD) {
        throw new Error(`Use at most ${MAX_TARGETS_PER_FIELD} search queries and ${MAX_TARGETS_PER_FIELD} category paths per run.`);
    }
    if (totalTargets > MAX_TOTAL_TARGETS) {
        throw new Error(`Too many Myntra search/category targets (${totalTargets}). The maximum is ${MAX_TOTAL_TARGETS} per run.`);
    }

    return {
        searchQueries,
        categoryPaths,
        maxResults: normalizeMaxResults(raw.maxResults),
        sortBy: normalizeSort(raw.sortBy),
        proxyConfiguration: normalizeProxyConfiguration(raw.proxyConfiguration),
    };
}

export function slugifyQuery(query: string): string {
    return query.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || encodeURIComponent(query);
}

export function normalizeCategoryPath(pathOrUrl: string): string {
    try {
        const parsed = new URL(pathOrUrl);
        if (!/myntra\.com$/i.test(parsed.hostname.replace(/^www\./i, ''))) {
            throw new Error('not myntra');
        }
        return parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    } catch {
        return pathOrUrl.replace(/^https?:\/\/www\.myntra\.com\//i, '').replace(/^\/+/, '').replace(/\/+$/, '');
    }
}

export function buildSearchUrl(query: string, page: number, sortBy: SortBy): string {
    const url = new URL(`${MYNTRA_ORIGIN}/${slugifyQuery(query)}`);
    url.searchParams.set('rawQuery', query);
    if (page > 1) url.searchParams.set('p', String(page));
    if (sortBy !== 'recommended') url.searchParams.set('sort', sortBy);
    return url.toString();
}

export function buildCategoryUrl(pathOrUrl: string, page: number, sortBy: SortBy): string {
    const path = normalizeCategoryPath(pathOrUrl);
    const url = new URL(`${MYNTRA_ORIGIN}/${path}`);
    if (page > 1) url.searchParams.set('p', String(page));
    if (sortBy !== 'recommended') url.searchParams.set('sort', sortBy);
    return url.toString();
}

function uniqueStrings(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const normalized = values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
    return Array.from(new Set(normalized));
}

function normalizeMaxResults(value: unknown): number {
    if (value === null || value === undefined || value === '') return 1;
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error('Max results must be a number.');
    }
    return Math.max(1, Math.min(MAX_RESULTS, Math.floor(number)));
}

function normalizeSort(value: unknown): SortBy {
    if (typeof value !== 'string') return 'recommended';
    const normalized = value.trim().toLowerCase();
    return ALLOWED_SORTS.has(normalized) ? normalized as SortBy : 'recommended';
}

function normalizeProxyConfiguration(value: ActorInput['proxyConfiguration'] | undefined): ActorInput['proxyConfiguration'] {
    if (value === undefined) return DEFAULT_PROXY;
    if (value.proxyUrls?.length) return value;
    if (!value.useApifyProxy) return { ...value, useApifyProxy: false };
    return {
        ...value,
        useApifyProxy: true,
        apifyProxyGroups: value.apifyProxyGroups?.length ? value.apifyProxyGroups : ['RESIDENTIAL'],
        apifyProxyCountry: value.apifyProxyCountry ?? 'IN',
    };
}
