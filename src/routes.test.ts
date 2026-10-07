import assert from 'node:assert/strict';
import test from 'node:test';
import type { MyntraProduct } from './types.js';
import { classifyMyxPayload, extractMyxData, productsFromMyx, toRecord } from './routes.js';

test('returns source size/colour detail without assuming unknown inventory is sold out', () => {
    const record = toRecord({ productName: 'Tee', landingPageUrl: '/tee/123/buy',
        primaryColour: 'Blue', gender: 'Unisex', sizes: 'S,M,S', price: 80, mrp: 100,
        inventoryInfo: [{ label: 'S', available: false }, { brandSizeLabel: 'M' }],
        images: [{ src: '//assets.myntassets.com/blue.jpg' }, { src: '//assets.myntassets.com/blue.jpg' }],
    }, 'tee', null, 1)!;
    assert.equal(record.inStock, null);
    assert.equal(record.colour, 'Blue');
    assert.equal(record.gender, 'Unisex');
    assert.deepEqual(record.sizes, ['S', 'M']);
    assert.deepEqual(record.sizeAvailability, [{ size: 'S', available: false }, { size: 'M', available: null }]);
    assert.equal(record.discountAmount, 20);
    assert.equal(record.images.length, 1);
});

test('extracts embedded Myntra product payload', () => {
    const html = '<html><script>window.__myx={"searchData":{"results":{"products":[{"productId":123,"productName":"Test Tee","landingPageUrl":"/tshirts/test/123/buy"}]}}};</script></html>';
    const data = extractMyxData(html);
    const products = productsFromMyx(data);

    assert.equal(products.length, 1);
    assert.equal(products[0].productId, 123);
    assert.equal(classifyMyxPayload(data).kind, 'products');
    assert.equal(classifyMyxPayload({ searchData: { results: { products: [] } } }).kind, 'empty');
    assert.equal(classifyMyxPayload({ searchData: { results: {} } }).kind, 'invalid');
    assert.equal(extractMyxData('<html>No payload</html>'), null);
});

test('extracts only balanced JSON when the script contains more JavaScript', () => {
    const data = { searchData: { results: { products: [{ productName: 'Brace } and "quote"', landingPageUrl: '/item/1/buy' }] } } };
    assert.deepEqual(extractMyxData(`<script>window.__myx = ${JSON.stringify(data)}; window.other = true;</script>`), data);
    assert.equal(extractMyxData('<script>window.__myx = {bad};</script>'), null);
    assert.equal(toRecord(null as unknown as MyntraProduct, 'x', null, 1), null);
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
    assert.equal(toRecord({ productName: 'External URL', landingPageUrl: 'https://example.com/product' }, 'q', null, 1), null);
});

test('normalizes numeric-string product fields without fabricating invalid IDs', () => {
    const record = toRecord({
        productId: '0042867022',
        productName: 'Numeric Tee',
        landingPageUrl: '/numeric-tee/42867022/buy',
        price: '640' as unknown as number,
        mrp: '1,299' as unknown as number,
        rating: '4.2' as unknown as number,
    }, 'tee', null, 1);

    assert.ok(record);
    assert.equal(record.productId, '0042867022');
    assert.equal(record.price, 640);
    assert.equal(record.mrp, 1299);
    assert.equal(record.rating, 4.2);
    assert.equal(toRecord({ productId: 'not-an-id', productName: 'No ID', landingPageUrl: '/no-id/buy' }, 'q', null, 1)?.productId, null);
    assert.equal(toRecord({ productName: 'Bad price', landingPageUrl: '/bad-price/buy', price: -1 }, 'q', null, 1)?.price, null);
});
