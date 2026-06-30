# Myntra Scraper - Fashion Products, Prices & Discounts

Scrape public Myntra fashion search and category pages and export clean product data to JSON, CSV, Excel, XML, or RSS from the Apify dataset. No Myntra login or API key is required.

This scraper extracts product titles, brands, prices, MRP, discounts, ratings, sizes, categories, stock hints, product URLs, image URLs, and timestamps for any search term or category path.

For a low-cost first run, use the default sample input: `tshirts`, one product, recommended sort, and Residential India proxy.

## What It Extracts

- Source, search query, and result position
- Myntra product ID
- Product title and brand
- Current price, MRP, discount percentage, and currency
- Star rating and rating count
- Available sizes in `packSize`
- Category and stock flag where available
- Product URL and image URL
- ISO scrape timestamp

## Use Cases

- Fashion catalog and assortment monitoring across brands and categories
- Myntra price and discount tracking
- Brand and competitor research for sizing and pricing
- Rating and discount analysis for fashion dashboards
- Marketplace trend reports over time

## Pricing

| Event | Price | Notes |
| --- | ---: | --- |
| `apify-actor-start` | `$0.00005` per GB | Charged when the Actor starts. A 512 MB run charges the minimum one start event. |
| `product-scraped` | `$0.002` per product | Charged once for each clean Myntra product record saved to the dataset. |

Example product-event cost: 1,000 saved products cost `$2.00`; 10,000 saved products cost `$20.00`. Start events are tiny but still included in paid runs.

Failed, blocked, duplicate, or empty records are not charged as `product-scraped` events. The Actor stops before further Myntra requests when the user's maximum run cost is reached.

To control cost, start with one query and `maxResults: 1`. Increase volume only after the sample output looks right. Residential India proxy is enabled by default because Myntra can hide product data from datacenter traffic.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `searchQueries` | string array | `["tshirts"]` | Fashion searches such as `tshirts`, `jeans`, `sneakers`, `sarees`, or `kurtas`. Up to 5 items. |
| `categoryPaths` | string array | `[]` | Optional Myntra category paths or URLs, such as `men-tshirts`. Up to 5 items. |
| `maxResults` | integer | `1` | Maximum products saved across all targets, up to 500. |
| `sortBy` | string | `recommended` | `recommended`, `popularity`, `price_asc`, `price_desc`, `new`, `discount`, or `rating`. |
| `proxyConfiguration` | object | Residential India | Apify Proxy settings. |

Provide at least one search query or one category path. The Actor rejects more than 10 total search/category targets per run.

## Example Input

```json
{
  "searchQueries": ["tshirts"],
  "categoryPaths": [],
  "maxResults": 1,
  "sortBy": "recommended",
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

### Category path example

```json
{
  "searchQueries": [],
  "categoryPaths": ["men-tshirts"],
  "maxResults": 10,
  "sortBy": "discount",
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "IN"
  }
}
```

## Output Dataset

```json
{
  "source": "myntra",
  "searchQuery": "tshirts",
  "position": 1,
  "productId": "42867022",
  "title": "UMILDO Boys Brand Logo Los Angeles Lakers Printed Dri-FIT T-shirt",
  "brand": "UMILDO",
  "price": 640,
  "mrp": 1299,
  "discountPercent": 51,
  "currency": "INR",
  "packSize": "4-6Y, 6-8Y, 8-10Y, 10-12Y, 12-14Y",
  "category": "Tshirts",
  "rating": 0,
  "ratingCount": 0,
  "inStock": null,
  "productUrl": "https://www.myntra.com/tshirts/umildo/umildo-boys-brand-logo-los-angeles-lakers-printed-dri-fit-t-shirt/42867022/buy",
  "imageUrl": "https://assets.myntassets.com/assets/images/2026/JUNE/6/example.jpg",
  "scrapedAt": "2026-06-12T19:56:55.975Z"
}
```

## API Example

```bash
curl -X POST "https://api.apify.com/v2/acts/fascinating_lentil~myntra-fashion-products-scraper/runs?token=YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"searchQueries":["tshirts"],"categoryPaths":[],"maxResults":1,"sortBy":"recommended","proxyConfiguration":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"IN"}}'
```

```js
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_API_TOKEN' });
const run = await client.actor('fascinating_lentil/myntra-fashion-products-scraper').call({
  searchQueries: ['tshirts'],
  categoryPaths: [],
  maxResults: 1,
  sortBy: 'recommended',
  proxyConfiguration: {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'IN',
  },
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(`Got ${items.length} Myntra products`);
```

## How It Works

The Actor builds Myntra search or category listing URLs, fetches server-rendered pages through optional proxy settings, reads the embedded `window.__myx` product payload, deduplicates by product ID, normalizes catalog and price fields, and writes clean records to the Apify dataset.

If no products are saved, the run fails with a clear message instead of appearing successful with an empty dataset.

## Known Limits

- Myntra can change page structure or embedded payloads.
- Some products do not expose rating, rating count, stock, or size data.
- Very narrow category paths or queries may return no products.
- Residential India proxy is recommended for cloud reliability.
- This Actor is not affiliated with Myntra.

## Responsible Use

This Actor is intended for lawful collection of publicly available product information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
