export type SortBy = 'recommended' | 'popularity' | 'price_asc' | 'price_desc' | 'new' | 'discount' | 'rating';

export interface ActorInput {
    searchQueries?: string[];
    categoryPaths?: string[];
    maxResults?: number;
    sortBy?: SortBy;
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        apifyProxyCountry?: string;
        proxyUrls?: string[];
    };
}

export interface NormalizedInput {
    searchQueries: string[];
    categoryPaths: string[];
    maxResults: number;
    sortBy: SortBy;
    proxyConfiguration?: ActorInput['proxyConfiguration'];
}

export interface MyntraProduct {
    landingPageUrl?: string;
    productId?: number;
    product?: string;
    productName?: string;
    brand?: string;
    additionalInfo?: string;
    gender?: string;
    category?: string;
    primaryColour?: string;
    price?: number;
    mrp?: number;
    discount?: number;
    discountDisplayLabel?: string;
    rating?: number;
    ratingCount?: number;
    sizes?: string;
    searchImage?: string;
    images?: { view?: string; src?: string }[];
    inventoryInfo?: { label?: string; brandSizeLabel?: string; available?: boolean }[];
}

export interface ProductRecord {
    source: 'myntra';
    searchQuery: string;
    position: number;
    productId: string | null;
    title: string;
    brand: string;
    price: number | null;
    mrp: number | null;
    discountPercent: number | null;
    currency: string;
    packSize: string;
    category: string;
    rating: number | null;
    ratingCount: number | null;
    inStock: boolean | null;
    productUrl: string | null;
    imageUrl: string | null;
    scrapedAt: string;
}
