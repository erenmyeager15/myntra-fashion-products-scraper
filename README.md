# Myntra Scraper - Fashion Products, Prices & Discounts

Scrape public Myntra fashion search and category pages and export clean product data to JSON, CSV, Excel, XML, or RSS from the Apify dataset. No Myntra login or API key is required.

This scraper extracts product titles, brands, prices, MRP, discounts, ratings, sizes, categories, stock hints, product URLs, image URLs, and timestamps for any search term or category path.

For a low-cost first run, use the default sample input: `tshirts`, one product, recommended sort, and Residential India proxy.

## What It Extracts

This upgrade adds `colour`, `gender`, deduplicated `sizes`, `sizeAvailability`, `images`, and `discountAmount` from the existing listing response, without extra product-detail requests. Listed sizes are not necessarily in stock: only explicit inventory flags set availability, and unknown values remain `null`.

`RUN_SUMMARY` reports saved products, parsed/failed targets, partial results and spending-limit stops. Successful HTTP connections are reused; transient failures and HTTP 200 pages missing product data replace the client/proxy with at most three attempts. Each attempt checks the spending limit. Interrupted streams can recover; oversized responses are not downloaded repeatedly. Responses are limited to 8 MiB while streaming. Partial results are not proof that every requested target succeeded.

The parser accepts a complete, terminated JSON product assignment without waiting for the rest of its script or page. It can find the catalog after an initialization-only assignment, and it checks chunk boundaries so a small final chunk is not missed. Stream-cleanup errors do not discard valid data or cause an oversized response to be downloaded again. These safeguards are regression-tested locally; their effect on billed proxy traffic and live reliability still requires cloud verification.

- Source, search query, and result position
- Myntra product ID
- Product title and brand
- Current price, MRP, discount percentage, and currency
- Star rating and rating count
- Listed sizes in `packSize` and `sizes`; explicit size-level stock flags in `sizeAvailability`
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
| `product-scraped` | `$0.0015` per product | Charged once for each clean Myntra product record saved to the dataset. |

**Scheduled pricing change:** From October 21, 2026 at 12:09 UTC (17:39 IST), the start event becomes `$0.002` (0.2 cents), with a minimum of one event and additional events depending on allocated memory. Product pricing stays `$1.50` per 1,000 products, and platform usage remains included. The start event is charged even when a run fails or returns no products.

Example product-event cost across runs: 1,000 saved products cost `$1.50`; 10,000 saved products cost `$15.00`. Add the applicable start events for each run; these examples exclude start charges and are not single-run result limits.

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

Provide at least one search query or one category path. Duplicate search terms and equivalent category URL/path inputs are removed before requests begin. The Actor rejects more than 10 total search/category targets per run, non-Myntra category URLs, invalid sort values, and out-of-range result limits instead of silently changing them.

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

The following record came from a successful Actor run on July 29, 2026. Product availability and prices can change after collection.

```json
{
  "source": "myntra",
  "searchQuery": "tshirts",
  "position": 1,
  "productId": "41225110",
  "title": "VERO AMORE Printed Round Neck Lounge Tshirts",
  "brand": "VERO AMORE",
  "price": 385,
  "mrp": 1399,
  "discountPercent": 72,
  "currency": "INR",
  "packSize": "M, L, XL, XXL, 3XL",
  "category": "Lounge Tshirts",
  "rating": 0,
  "ratingCount": 0,
  "inStock": true,
  "productUrl": "https://www.myntra.com/lounge-tshirts/vero+amore/vero-amore-printed-round-neck-lounge-tshirts-/41225110/buy",
  "imageUrl": "https://assets.myntassets.com/assets/images/2026/APRIL/8/F0Qyqm09_de8490ecf5ed43b088db587be14d9011.jpg",
  "scrapedAt": "2026-07-29T11:03:33.837Z"
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

The Actor builds Myntra search or category listing URLs, fetches server-rendered pages with a lightweight Chrome TLS fingerprint through optional proxy settings, reads the embedded `window.__myx` product payload, deduplicates by product ID, normalizes catalog and price fields, and writes clean records to the Apify dataset. HTTP attempts have a 45-second timeout and blocked/transient responses receive bounded retries.

If every requested target returns a valid empty product array, the run succeeds with an empty dataset. When no products are saved and any target fails, the run exits with a failed status and records its target diagnostics. Successful products from a partially failed run remain available and are identified in the summary.

Residential India is the cloud configuration verified by owner tests. Explicit direct and custom-proxy inputs are respected. Direct mode makes one attempt per page and reports how to enable Residential India if product data is unavailable; it does not silently enable a paid proxy. A direct cloud test on October 7, 2026 returned no usable products, so direct mode is not promised to work in cloud.

## Known Limits

- Myntra can change page structure or embedded payloads.
- Some products do not expose rating, rating count, stock, or size data.
- Very narrow category paths or queries may return no products.
- Residential India proxy is enabled by default because direct and datacenter cloud traffic can receive incomplete pages.
- Pagination is bounded to 20 pages per target, two stagnant pages, 500 total saved products, and at most 10 targets per run.
- This Actor is not affiliated with Myntra.

## Responsible Use

This Actor is intended for lawful collection of publicly available product information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
