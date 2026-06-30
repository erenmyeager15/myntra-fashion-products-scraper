import assert from 'node:assert/strict';
import test from 'node:test';
import type { MyntraProduct } from './types.js';
import { extractMyxData, productsFromMyx, toRecord } from './routes.js';

test('extracts embedded Myntra product payload', () => {
    const html = '<html><script>window.__myx = {"searchData":{"results":{"products":[{"productId":123,"productName":"Test Tee","landingPageUrl":"/tshirts/test/123/buy"}]}}};</script></html>';
    const data = extractMyxData(html);
    const products = productsFromMyx(data);

    assert.equal(products.length, 1);
    assert.equal(products[0].productId, 123);
});

test('maps Myntra product fields to the public dataset record', () => {
    const product: MyntraProduct = {
        productId: 42867022,
        productName: 'UMILDO Boys Brand Logo Los Angeles Lakers Printed Dri-FIT T-shirt',
        brand: 'UMILDO',
        category: 'Tshirts',
        price: 640,
        mrp: 1299,
        rating: 4.2,
        ratingCount: 124,
        sizes: '4-6Y, 6-8Y, 8-10Y',
        searchImage: '//assets.myntassets.com/assets/images/example.jpg',
        landingPageUrl: '/tshirts/umildo/umildo-boys-brand-logo/42867022/buy',
        inventoryInfo: [{ available: true }],
    };

    const record = toRecord(product, 'tshirts', null, 1);

    assert.ok(record);
    assert.equal(record.source, 'myntra');
    assert.equal(record.searchQuery, 'tshirts');
    assert.equal(record.position, 1);
    assert.equal(record.productId, '42867022');
    assert.equal(record.brand, 'UMILDO');
    assert.equal(record.price, 640);
    assert.equal(record.mrp, 1299);
    assert.equal(record.discountPercent, 51);
    assert.equal(record.currency, 'INR');
    assert.equal(record.packSize, '4-6Y, 6-8Y, 8-10Y');
    assert.equal(record.inStock, true);
    assert.equal(record.productUrl, 'https://www.myntra.com/tshirts/umildo/umildo-boys-brand-logo/42867022/buy');
    assert.equal(record.imageUrl, 'https://assets.myntassets.com/assets/images/example.jpg');
});

test('drops invalid placeholder image URLs and requires title plus URL', () => {
    const product: MyntraProduct = {
        productId: 1,
        productName: 'Test Product',
        brand: undefined,
        category: undefined,
        searchImage: 'Proxied Content',
        landingPageUrl: '/test/1/buy',
    };
    const record = toRecord(product, null, 'men-tshirts', 2);

    assert.ok(record);
    assert.equal(record.searchQuery, 'men-tshirts');
    assert.equal(record.brand, 'N/A');
    assert.equal(record.category, 'N/A');
    assert.equal(record.packSize, 'N/A');
    assert.equal(record.imageUrl, null);
    assert.equal(toRecord({ productName: 'No URL' }, 'q', null, 1), null);
});
