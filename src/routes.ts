import type { MyntraProduct, ProductRecord } from './types.js';

const MYNTRA_ORIGIN = 'https://www.myntra.com';

const cleanString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || null;
};

const numberOrNull = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string') {
        const normalized = value.trim().replace(/,/g, '');
        if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }
    return null;
};

const idOrNull = (value: unknown): string | null => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
    return null;
};

const textOrNA = (value: unknown): string => cleanString(value) ?? 'N/A';

const httpsUrl = (value: string | null | undefined): string | null => {
    const cleaned = cleanString(value);
    if (!cleaned) return null;
    if (cleaned.toLowerCase() === 'proxied content') return null;
    try {
        const url = cleaned.startsWith('//')
            ? new URL(`https:${cleaned}`)
            : new URL(cleaned, `${MYNTRA_ORIGIN}/`);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        url.protocol = 'https:';
        return url.toString();
    } catch {
        return null;
    }
};

const discountPercentFromLabel = (label: string | null): number | null => {
    if (!label) return null;
    const match = label.match(/(\d+)\s*%/);
    if (!match) return null;
    const value = Number(match[1]);
    return value <= 100 ? value : null;
};

const splitSizes = (value: string | null | undefined): string[] => {
    const cleaned = cleanString(value);
    if (!cleaned) return [];
    return cleaned.split(',').map((size) => size.trim()).filter(Boolean);
};

const packSizeFromProduct = (product: MyntraProduct): string => {
    const sizes = splitSizes(product.sizes);
    return sizes.length > 0 ? sizes.join(', ') : 'N/A';
};

const stockFromProduct = (product: MyntraProduct): boolean | null => {
    const availability = product.inventoryInfo
        ?.map((item) => item.available)
        .filter((value): value is boolean => typeof value === 'boolean');
    if (!availability || availability.length === 0) return null;
    if (availability.some(Boolean)) return true;
    return availability.length === product.inventoryInfo?.length ? false : null;
};

const bestImage = (product: MyntraProduct): string | null => {
    const search = httpsUrl(product.searchImage);
    if (search) return search;
    const image = product.images?.find((item) => item.view === 'search' && item.src)
        ?? product.images?.find((item) => item.view === 'default' && item.src)
        ?? product.images?.find((item) => item.src);
    return httpsUrl(image?.src);
};

const productUrl = (product: MyntraProduct): string | null => {
    const landing = cleanString(product.landingPageUrl);
    if (!landing) return null;
    const url = httpsUrl(landing);
    if (!url) return null;
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().replace(/^www\./, '') !== 'myntra.com') return null;
    return parsed.toString();
};

export function extractMyxData(html: string): unknown | null {
    const assignments = /window\.__myx\s*=\s*/g;
    let firstParsed: unknown | null = null;
    // A bootstrap object can precede the actual catalog. Bound the scan and
    // prefer an explicitly present products array, including a valid empty one.
    for (let candidate = 0; candidate < 32; candidate++) {
        const assignment = assignments.exec(html);
        if (!assignment) break;
        const bodyStart = assignment.index + assignment[0].length;
        if (html[bodyStart] !== '{') continue;
        const scriptEnd = html.indexOf('</script>', bodyStart);
        const limit = scriptEnd < 0 ? html.length : scriptEnd;
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = bodyStart; index < limit; index++) {
            const char = html[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                assignments.lastIndex = index + 1;
                const trailer = html.slice(index + 1, index + 81).trimStart();
                // Only a terminated JSON assignment is complete; never accept
                // the object prefix of an expression or execute source scripts.
                if (trailer[0] !== ';' && !/^<\/script\s*>/i.test(trailer)) break;
                try {
                    const parsed: unknown = JSON.parse(html.slice(bodyStart, index + 1));
                    if (classifyMyxPayload(parsed).kind !== 'invalid') return parsed;
                    firstParsed ??= parsed;
                } catch { /* A later assignment may contain the valid catalog. */ }
                break;
            }
        }
    }
    return firstParsed;
}

export function productsFromMyx(data: unknown): MyntraProduct[] {
    if (!data || typeof data !== 'object') return [];
    const root = data as { searchData?: { results?: { products?: unknown } } };
    const products = root.searchData?.results?.products;
    return Array.isArray(products) ? products as MyntraProduct[] : [];
}

export type MyxPayloadClassification =
    | { kind: 'products'; products: MyntraProduct[] }
    | { kind: 'empty'; products: [] }
    | { kind: 'invalid'; products: []; reason: string };

export function classifyMyxPayload(data: unknown): MyxPayloadClassification {
    if (!data || typeof data !== 'object') {
        return { kind: 'invalid', products: [], reason: 'window.__myx was missing or was not valid JSON' };
    }
    const root = data as { searchData?: { results?: { products?: unknown } } };
    const products = root.searchData?.results?.products;
    if (!Array.isArray(products)) {
        return { kind: 'invalid', products: [], reason: 'window.__myx did not contain searchData.results.products' };
    }
    if (products.length === 0) return { kind: 'empty', products: [] };
    return { kind: 'products', products: products as MyntraProduct[] };
}

export function toRecord(product: MyntraProduct, searchQuery: string | null, categoryPath: string | null, position: number): ProductRecord | null {
    if (!product || typeof product !== 'object') return null;
    product = { ...product,
        images: Array.isArray(product.images) ? product.images.filter((item) => item && typeof item === 'object') : [],
        inventoryInfo: Array.isArray(product.inventoryInfo) ? product.inventoryInfo.map((item) => item && typeof item === 'object' ? item : {}) : [],
    };
    const title = cleanString(product.productName) ?? cleanString(product.product);
    const url = productUrl(product);
    if (!title || !url) return null;

    const price = numberOrNull(product.price);
    const mrp = numberOrNull(product.mrp);
    const discountPercent = mrp !== null && price !== null && mrp > price
        ? Math.round(((mrp - price) / mrp) * 100)
        : discountPercentFromLabel(cleanString(product.discountDisplayLabel));
    const productId = idOrNull(product.productId);

    return {
        source: 'myntra',
        searchQuery: cleanString(searchQuery) ?? cleanString(categoryPath) ?? 'N/A',
        position,
        productId,
        title,
        brand: textOrNA(product.brand),
        price,
        mrp,
        discountPercent,
        currency: 'INR',
        packSize: packSizeFromProduct(product),
        category: textOrNA(product.category),
        rating: numberOrNull(product.rating),
        ratingCount: numberOrNull(product.ratingCount),
        inStock: stockFromProduct(product),
        productUrl: url,
        imageUrl: bestImage(product),
        scrapedAt: new Date().toISOString(),
        colour: cleanString(product.primaryColour),
        gender: cleanString(product.gender),
        sizes: [...new Set(splitSizes(product.sizes))],
        sizeAvailability: (product.inventoryInfo ?? []).map((item) => ({
            size: cleanString(item.brandSizeLabel) ?? cleanString(item.label),
            available: typeof item.available === 'boolean' ? item.available : null,
        })),
        images: [...new Set([bestImage(product), ...(product.images ?? []).map((item) => httpsUrl(item.src))]
            .filter((value): value is string => value !== null))],
        discountAmount: price !== null && mrp !== null && mrp >= price ? Math.round((mrp - price) * 100) / 100 : null,
    };
}
