import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryUrl, buildSearchUrl, normalizeCategoryPath, normalizeInput, slugifyQuery } from './input.js';

test('normalizes empty input to a one-result Residential India sample', () => {
    const input = normalizeInput({});

    assert.deepEqual(input.searchQueries, ['tshirts']);
    assert.deepEqual(input.categoryPaths, []);
    assert.equal(input.maxResults, 1);
    assert.equal(input.sortBy, 'recommended');
    assert.deepEqual(input.proxyConfiguration, {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'IN',
    });
});

test('cleans filters, clamps max results, and preserves proxy-off input', () => {
    const input = normalizeInput({
        searchQueries: [' tshirts ', 'tshirts', ' women kurtas '],
        categoryPaths: [' /men-tshirts/ '],
        maxResults: 900,
        sortBy: 'price_desc',
        proxyConfiguration: { useApifyProxy: false },
    });

    assert.deepEqual(input.searchQueries, ['tshirts', 'women kurtas']);
    assert.deepEqual(input.categoryPaths, ['/men-tshirts/']);
    assert.equal(input.maxResults, 500);
    assert.equal(input.sortBy, 'price_desc');
    assert.deepEqual(input.proxyConfiguration, { useApifyProxy: false });
});

test('rejects empty and overly broad target sets', () => {
    assert.throws(() => normalizeInput({ searchQueries: [], categoryPaths: [] }), /at least one/);
    assert.throws(
        () => normalizeInput({
            searchQueries: ['a', 'b', 'c', 'd', 'e'],
            categoryPaths: ['f', 'g', 'h', 'i', 'j', 'k'],
        }),
        /at most 5/,
    );
});

test('normalizes URLs and builds Myntra listing URLs', () => {
    assert.equal(slugifyQuery('Women Kurtas'), 'women-kurtas');
    assert.equal(normalizeCategoryPath('https://www.myntra.com/men-tshirts/'), 'men-tshirts');
    assert.equal(normalizeCategoryPath('/women-kurtas-kurtis-suits/'), 'women-kurtas-kurtis-suits');

    const searchUrl = new URL(buildSearchUrl('Women Kurtas', 2, 'discount'));
    assert.equal(searchUrl.origin + searchUrl.pathname, 'https://www.myntra.com/women-kurtas');
    assert.equal(searchUrl.searchParams.get('rawQuery'), 'Women Kurtas');
    assert.equal(searchUrl.searchParams.get('p'), '2');
    assert.equal(searchUrl.searchParams.get('sort'), 'discount');

    const categoryUrl = new URL(buildCategoryUrl('men-tshirts', 1, 'recommended'));
    assert.equal(categoryUrl.toString(), 'https://www.myntra.com/men-tshirts');
});
