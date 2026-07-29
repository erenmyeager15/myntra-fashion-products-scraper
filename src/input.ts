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
const MAX_TARGET_LENGTH = 200;
const ALLOWED_SORTS = new Set(['recommended', 'popularity', 'price_asc', 'price_desc', 'new', 'discount', 'rating']);

export function normalizeInput(input: ActorInput | null | undefined): NormalizedInput {
    const raw = input ?? {};
    const searchQueries = uniqueStrings(raw.searchQueries ?? ['tshirts'], 'searchQueries');
    const categoryPaths = uniqueCategoryPaths(raw.categoryPaths ?? []);
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
    const input = pathOrUrl.trim();
    if (!input) throw new Error('Myntra category paths cannot be blank.');

    let pathname = input;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
        let parsed: URL;
        try {
            parsed = new URL(input);
        } catch {
            throw new Error(`Invalid Myntra category URL: "${pathOrUrl}".`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname.toLowerCase().replace(/^www\./, '') !== 'myntra.com') {
            throw new Error(`Only myntra.com category URLs are accepted: "${pathOrUrl}".`);
        }
        pathname = parsed.pathname;
    } else if (input.includes('://')) {
        throw new Error(`Invalid Myntra category path: "${pathOrUrl}".`);
    }

    try {
        pathname = decodeURIComponent(pathname);
    } catch {
        throw new Error(`Invalid encoded Myntra category path: "${pathOrUrl}".`);
    }

    const normalized = pathname
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\/{2,}/g, '/');

    if (!normalized || normalized.length > MAX_TARGET_LENGTH || normalized.includes('..') || !/^[a-z0-9][a-z0-9/_-]*$/.test(normalized)) {
        throw new Error(`Invalid Myntra category path: "${pathOrUrl}".`);
    }

    return normalized;
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

function uniqueStrings(values: unknown, fieldName: string): string[] {
    if (!Array.isArray(values)) throw new Error(`${fieldName} must be an array of strings.`);
    const unique = new Map<string, string>();
    for (const value of values) {
        if (typeof value !== 'string') throw new Error(`${fieldName} must contain only strings.`);
        const normalized = value.trim().replace(/\s+/g, ' ');
        if (!normalized) continue;
        if (normalized.length > MAX_TARGET_LENGTH) throw new Error(`${fieldName} entries must be at most ${MAX_TARGET_LENGTH} characters.`);
        const key = normalized.toLocaleLowerCase('en-US');
        if (!unique.has(key)) unique.set(key, normalized);
    }
    return [...unique.values()];
}

function uniqueCategoryPaths(values: unknown): string[] {
    const rawPaths = uniqueStrings(values, 'categoryPaths');
    return Array.from(new Set(rawPaths.map((value) => normalizeCategoryPath(value))));
}

function normalizeMaxResults(value: unknown): number {
    if (value === null || value === undefined || value === '') return 1;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > MAX_RESULTS) {
        throw new Error(`maxResults must be an integer from 1 to ${MAX_RESULTS}.`);
    }
    return number;
}

function normalizeSort(value: unknown): SortBy {
    if (value === null || value === undefined || value === '') return 'recommended';
    if (typeof value !== 'string') throw new Error('sortBy must be a string.');
    const normalized = value.trim().toLowerCase();
    if (!ALLOWED_SORTS.has(normalized)) throw new Error(`Unsupported sortBy value: "${value}".`);
    return normalized as SortBy;
}

function normalizeProxyConfiguration(value: ActorInput['proxyConfiguration'] | undefined): ActorInput['proxyConfiguration'] {
    if (value === undefined) return { ...DEFAULT_PROXY };
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('proxyConfiguration must be an object.');
    }

    if (value.proxyUrls !== undefined && !Array.isArray(value.proxyUrls)) {
        throw new Error('proxyConfiguration.proxyUrls must be an array of URLs.');
    }
    const proxyUrls = (value.proxyUrls ?? []).map((proxyUrl) => {
        if (typeof proxyUrl !== 'string') throw new Error('proxyConfiguration.proxyUrls must contain only strings.');
        const normalized = proxyUrl.trim();
        try {
            const parsed = new URL(normalized);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported');
        } catch {
            throw new Error('Every custom proxy URL must be a valid HTTP or HTTPS URL.');
        }
        return normalized;
    });
    if (proxyUrls.length > 0) return { useApifyProxy: false, proxyUrls: Array.from(new Set(proxyUrls)) };
    if (value.useApifyProxy === false) return { useApifyProxy: false };

    if (value.apifyProxyGroups !== undefined && !Array.isArray(value.apifyProxyGroups)) {
        throw new Error('proxyConfiguration.apifyProxyGroups must be an array of strings.');
    }
    const groupsWereProvided = value.apifyProxyGroups !== undefined;
    const groups = (value.apifyProxyGroups ?? ['RESIDENTIAL'])
        .map((group) => {
            if (typeof group !== 'string' || !group.trim()) throw new Error('Apify Proxy groups must be non-empty strings.');
            return group.trim().toUpperCase();
        });
    if (groupsWereProvided && groups.length === 0) {
        return {
            useApifyProxy: true,
            apifyProxyGroups: [],
        };
    }
    const countryValue = value.apifyProxyCountry ?? 'IN';
    if (typeof countryValue !== 'string') throw new Error('Apify Proxy country must be a two-letter country code.');
    const country = countryValue.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Apify Proxy country must be a two-letter country code.');

    return {
        useApifyProxy: true,
        apifyProxyGroups: Array.from(new Set(groups)),
        apifyProxyCountry: country,
    };
}
