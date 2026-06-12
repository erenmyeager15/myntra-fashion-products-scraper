# Myntra Fashion Products Scraper

Scrape public Myntra fashion search and category pages into a clean product dataset. The Actor collects brand, product title, price, MRP, discount amount, discount percentage, rating, rating count, sizes, gender, category, color, product image, and product URL.

The Actor reads Myntra's public server-rendered listing payload. It does not require login and does not extract private customer, seller, or contact data. Direct Myntra gateway APIs are gated, so this Actor uses the public product data embedded in listing pages. Myntra can hide product data from datacenter cloud traffic, so residential India proxy is enabled by default.

## Input

| Field | Description | Default |
|---|---|---|
| `searchQueries` | Fashion searches such as tshirts, jeans, sneakers, sarees | `["tshirts"]` |
| `categoryPaths` | Optional category paths or full Myntra category URLs | `[]` |
| `maxResults` | Maximum products saved across all targets | `10` |
| `sortBy` | Recommended, popularity, price, new, discount, rating | `recommended` |
| `proxyConfiguration` | Apify proxy settings | Residential, India |

```json
{
  "searchQueries": ["tshirts"],
  "categoryPaths": ["men-tshirts"],
  "maxResults": 10,
  "sortBy": "recommended",
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

## Output

```json
{
  "source": "myntra",
  "searchQuery": "tshirts",
  "categoryPath": null,
  "position": 1,
  "productId": 42692474,
  "brand": "KASSUALLY",
  "title": "KASSUALLY Janata GenZ Oversized Graphic Cotton T-Shirt",
  "additionalInfo": "Unisex Printed T-shirt",
  "gender": "Unisex",
  "category": "Tshirts",
  "primaryColour": "Grey",
  "price": 589,
  "priceDisplay": "INR 589",
  "mrp": 1299,
  "mrpDisplay": "INR 1,299",
  "discountAmount": 710,
  "discountPercent": 55,
  "discountDisplayLabel": "(55% OFF)",
  "rating": 0,
  "ratingCount": 0,
  "sizes": ["S", "M", "L", "XL", "XXL"],
  "imageUrl": "https://assets.myntassets.com/assets/images/...",
  "productUrl": "https://www.myntra.com/tshirts/kassually/.../42692474/buy",
  "scrapedAt": "2026-06-13T00:30:00.000Z"
}
```

## Use Cases

- Fashion catalog monitoring
- E-commerce price tracking
- Brand assortment research
- Discount and rating analysis
- Marketplace trend reports

## Pricing

| Event | Price |
|---|---|
| `product-scraped` | $0.002 per saved product |

The Actor charges only after a clean product record is saved. Apify platform usage is billed separately.

## Notes

Myntra page structure can change. If a cloud run returns no rows, keep residential proxy enabled, retry with a smaller `maxResults`, or test a category path such as `men-tshirts`.

## License

Apache-2.0
