export interface ActorInput {
    searchQueries?: string[];
    categoryPaths?: string[];
    maxResults?: number;
    sortBy?: 'recommended' | 'popularity' | 'price_asc' | 'price_desc' | 'new' | 'discount' | 'rating';
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        apifyProxyCountry?: string;
        proxyUrls?: string[];
    };
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
    searchQuery: string | null;
    categoryPath: string | null;
    position: number;
    productId: number | null;
    brand: string | null;
    title: string | null;
    additionalInfo: string | null;
    gender: string | null;
    category: string | null;
    primaryColour: string | null;
    price: number | null;
    priceDisplay: string | null;
    mrp: number | null;
    mrpDisplay: string | null;
    discountAmount: number | null;
    discountPercent: number | null;
    discountDisplayLabel: string | null;
    rating: number | null;
    ratingCount: number | null;
    sizes: string[];
    imageUrl: string | null;
    productUrl: string | null;
    scrapedAt: string;
}
