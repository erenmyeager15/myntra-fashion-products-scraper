# Myntra Scraper - Fashion Products, Prices & Discounts

Scrape public Myntra fashion search and category pages and export clean data to JSON, CSV, Excel, XML, or RSS from the Apify Dataset — no login and no API key required. This Myntra scraper extracts brand, product title, price, MRP, discount, rating, reviews, sizes, gender, color, image, and product URL for any search term or category.

Built with Node.js 20, TypeScript, and the Apify SDK. It reads the public product data embedded in Myntra's server-rendered listing pages over lightweight HTTP requests through Apify residential proxies (India), with retries and resilient extraction so cloud runs stay reliable. It does not require login and does not collect private customer, seller, or contact data.

## What It Extracts

- Brand and product title
- Myntra product ID
- Current price (number and display text)
- MRP and discount amount
- Discount percentage and discount label
- Star rating and rating count
- Available sizes
- Gender, category, and primary color
- Product image URL
- Result position, search query, and category path
- Product URL and scrape timestamp

## Use Cases

1. Fashion catalog and assortment monitoring across brands and categories.
2. E-commerce price and discount tracking on Myntra listings.
3. Brand and competitor research for sizing, colors, and pricing.
4. Discount and rating analysis to surface the best fashion deals.
5. Marketplace trend reports and dashboards over time.

## Pricing

This Actor uses Apify Pay Per Event pricing. You pay only for clean records delivered to the dataset — failed, blocked, or empty results are not billed.

| Event name | Price per event | 1,000 results | 10,000 results |
| --- | ---: | ---: | ---: |
| `product-scraped` | $0.002 | $2.00 | $20.00 |

Apify platform usage (compute and proxy) is billed separately.

## Input

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `searchQueries` | array | yes* | `["tshirts"]` | Fashion searches such as tshirts, jeans, sneakers, sarees, or kurtas. |
| `categoryPaths` | array | no | `[]` | Optional Myntra category paths or URLs, e.g. `men-tshirts`. |
| `maxResults` | integer | no | `10` | Maximum products saved across all targets. |
| `sortBy` | string | no | `recommended` | Sort order: recommended, popularity, price, new, discount, or rating. |
| `proxyConfiguration` | object | no | Residential, IN | Apify proxy settings. Residential India recommended. |

\* Provide at least one `searchQueries` entry or one `categoryPaths` entry.

## Example Input

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

## Sample Output

```json
{
  "source": "myntra",
  "searchQuery": "tshirts",
  "categoryPath": null,
  "position": 1,
  "productId": 42867022,
  "brand": "UMILDO",
  "title": "UMILDO Boys Brand Logo Los Angeles Lakers Printed Dri-FIT T-shirt",
  "additionalInfo": "NBA Basketball Tank Top",
  "gender": "Boys",
  "category": "Tshirts",
  "primaryColour": "Yellow",
  "price": 640,
  "priceDisplay": "INR 640",
  "mrp": 1299,
  "mrpDisplay": "INR 1,299",
  "discountAmount": 659,
  "discountPercent": 51,
  "discountDisplayLabel": "(51% OFF)",
  "rating": 0,
  "ratingCount": 0,
  "sizes": ["4-6Y", "6-8Y", "8-10Y", "10-12Y", "12-14Y"],
  "imageUrl": "https://assets.myntassets.com/assets/images/2026/JUNE/6/crI0Zovt_715f76dee3524abab99b218a3ff3ddbc.jpg",
  "productUrl": "https://www.myntra.com/tshirts/umildo/umildo-boys-brand-logo-los-angeles-lakers-printed-dri-fit-t-shirt/42867022/buy",
  "scrapedAt": "2026-06-12T19:56:55.975Z"
}
```

## How It Works

1. Validates the search queries and category paths and builds Myntra listing URLs (with optional sort).
2. Fetches server-rendered pages through Apify residential proxies, retrying on 401/403/429/529 blocks.
3. Reads the embedded `window.__myx` product payload and cleans brand, price, MRP, discount, sizes, and rating fields.
4. Deduplicates by product ID across pages and targets.
5. Charges `product-scraped` only after a clean record is saved, then writes to the Apify Dataset.

## How to Scrape Myntra (Step by Step)

1. Click **Try for free** / **Run**.
2. Enter one or more search terms in `searchQueries` (for example, `tshirts` or `sneakers`), or add a `categoryPaths` entry such as `men-tshirts`.
3. Set `maxResults` (start small to test) and pick a `sortBy` order.
4. Keep residential India proxy enabled for reliable results.
5. Run, then export results as CSV, JSON, or Excel, or pull them via the Apify API.

## Reliability & Anti-Bot Handling

- Apify residential proxy support, pinned to India by default.
- Retries on transient failures and 401/403/429/529 responses.
- Field-level fallback to `null` when optional data is unavailable.
- Charges only for clean, saved records — never for blocked or empty pages.

## Known Limits

- Myntra's embedded listing payload can change; if a run returns no rows, keep residential proxy enabled, lower `maxResults`, or try a category path such as `men-tshirts`.
- Rating and rating count are `0` for products that have not yet been rated on Myntra.

## Legal and Ethical Use

Use this Actor for legitimate research, price monitoring, and analysis. You are responsible for complying with Myntra's terms, privacy laws, and local regulations wherever you use the data.

## License

Apache-2.0. See `LICENSE`.
