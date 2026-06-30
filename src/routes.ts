import type { MyntraProduct, ProductRecord } from './types.js';

const MYNTRA_ORIGIN = 'https://www.myntra.com';

const cleanString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || null;
};

const numberOrNull = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
};

const textOrNA = (value: unknown): string => cleanString(value) ?? 'N/A';

const httpsUrl = (value: string | null | undefined): string | null => {
    const cleaned = cleanString(value);
    if (!cleaned) return null;
    if (cleaned.toLowerCase() === 'proxied content') return null;
    if (cleaned.startsWith('//')) return `https:${cleaned}`;
    if (cleaned.startsWith('http://')) return `https://${cleaned.slice('http://'.length)}`;
    if (cleaned.startsWith('https://')) return cleaned;
    return `${MYNTRA_ORIGIN}/${cleaned.replace(/^\/+/, '')}`;
};

const discountPercentFromLabel = (label: string | null): number | null => {
    if (!label) return null;
    const match = label.match(/(\d+)\s*%/);
    return match ? Number(match[1]) : null;
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
    return availability.some(Boolean);
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
    return httpsUrl(landing);
};

export function extractMyxData(html: string): unknown | null {
    const marker = 'window.__myx = ';
    const start = html.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = start + marker.length;
    const end = html.indexOf('</script>', bodyStart);
    if (end < 0) return null;
    const raw = html.slice(bodyStart, end).trim().replace(/;$/, '');
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function productsFromMyx(data: unknown): MyntraProduct[] {
    if (!data || typeof data !== 'object') return [];
    const root = data as { searchData?: { results?: { products?: unknown } } };
    const products = root.searchData?.results?.products;
    return Array.isArray(products) ? products as MyntraProduct[] : [];
}

export function toRecord(product: MyntraProduct, searchQuery: string | null, categoryPath: string | null, position: number): ProductRecord | null {
    const title = cleanString(product.productName) ?? cleanString(product.product);
    const url = productUrl(product);
    if (!title || !url) return null;

    const price = numberOrNull(product.price);
    const mrp = numberOrNull(product.mrp);
    const discountPercent = mrp !== null && price !== null && mrp > price
        ? Math.round(((mrp - price) / mrp) * 100)
        : discountPercentFromLabel(cleanString(product.discountDisplayLabel));
    const productId = numberOrNull(product.productId);

    return {
        source: 'myntra',
        searchQuery: cleanString(searchQuery) ?? cleanString(categoryPath) ?? 'N/A',
        position,
        productId: productId !== null ? String(productId) : null,
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
    };
}
