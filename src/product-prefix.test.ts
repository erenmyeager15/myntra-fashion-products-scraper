import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProductPrefix, readRequestedPayload } from './product-prefix.js';
import { readBoundedHtml } from './transport.js';

const row = (id: number) => ({ productId: id, productName: `Tee ${id}`, landingPageUrl: `/tee/${id}/buy`, price: id });
const prefix = (products: unknown[]) => '<script>window.__myx={"searchData":{"results":{"products":['
    + products.map(p => JSON.stringify(p)).join(',') + ',';
const key = (p: { productId?: string | number }) => p.productId ? String(p.productId) : null;

test('returns complete requested rows without the array or payload tail', () => {
    assert.deepEqual(extractProductPrefix(prefix([row(1)]), 1, key)?.products, [row(1)]);
    assert.equal(extractProductPrefix(prefix([row(1)]), 2, key), null);
});

test('retains source row order but does not count duplicate or rejected rows toward the cap', () => {
    const source = prefix([row(1), row(1), {}, row(2)]);
    assert.deepEqual(extractProductPrefix(source, 2, key)?.products, [row(1), row(1), {}, row(2)]);
    assert.equal(extractProductPrefix(source, 3, key), null);
});

test('uses only the exact searchData/results/products object path', () => {
    assert.equal(extractProductPrefix('<script>window.__myx={"unrelated":{"products":[' + JSON.stringify(row(1)) + ',', 1, key), null);
    const nested = '<script>window.__myx={"settings":{"searchData":{"results":{"products":[{"productId":99}]}}},'
        + '"searchData":{"metadata":{"products":[]},"results":{"offset":0,"products":[' + JSON.stringify(row(1)) + ',';
    assert.deepEqual(extractProductPrefix(nested, 1, key)?.products, [row(1)]);
});

test('rejects truncated rows, malformed paths and JavaScript-expression prefixes', () => {
    assert.equal(extractProductPrefix(prefix([row(1)]).slice(0, -3), 1, key), null);
    assert.equal(extractProductPrefix('<script>window.__myx={"searchData":broken,"results":{"products":[]}};', 1, key), null);
    const expression = '<script>window.__myx={"searchData":{"results":{"products":[' + JSON.stringify(row(1)) + '.missing,';
    assert.equal(extractProductPrefix(expression, 1, key), null);
    assert.equal(extractProductPrefix(prefix([row(1)]), 0, key), null);
});

test('handles nested product fields and escaped braces/quotes without dropping original fields', () => {
    const product = { ...row(1), productName: 'Brace } and "quote"', images: [{ src: 'https://example.com/a.jpg' }],
        inventoryInfo: [{ available: true, label: 'S' }] };
    assert.deepEqual(extractProductPrefix(prefix([product]), 1, key)?.products, [product]);
});

test('a small run cancels after its complete row rather than downloading later products', async () => {
    const chunks = [prefix([row(1)]), JSON.stringify(row(2)) + 'tail'.repeat(20000)];
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(Buffer.from(chunks[pulls++])); },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const html = await readBoundedHtml(new Response(body), 4096, value => extractProductPrefix(value, 1, key) !== null);
    assert.deepEqual(extractProductPrefix(html, 1, key)?.products, [row(1)]);
    assert.equal(pulls, 1);
    assert.equal(cancelled, true);
});

test('detects a product delimiter split across small chunks before the next size checkpoint', async () => {
    const source = prefix([row(1)]);
    const chunks = [source.slice(0, -1), ',', 'unused'.repeat(15000)];
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(Buffer.from(chunks[pulls++])); },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const html = await readBoundedHtml(new Response(body), 4096,
        value => readRequestedPayload(value, 1, new Set()).kind !== 'invalid');
    assert.equal(html, source);
    assert.equal(pulls, 2);
    assert.equal(cancelled, true);
});

test('the active reader counts only valid records not already saved on preceding pages', () => {
    const source = prefix([row(1), { ...row(2), landingPageUrl: 'https://example.com/product' }, row(3), row(3), row(4)]);
    const payload = readRequestedPayload(source, 2, new Set(['1']));
    assert.equal(payload.kind, 'products');
    assert.equal(payload.stoppedAtProductLimit, true);
    assert.equal(payload.products.length, 5);
    assert.equal(readRequestedPayload(source, 3, new Set(['1'])).kind, 'invalid');
    assert.equal(readRequestedPayload(source, 0, new Set()).kind, 'invalid');
});

test('only full valid empty payloads can report a clean empty result', () => {
    const empty = '<script>window.__myx={"searchData":{"results":{"products":[]}}};';
    assert.deepEqual(readRequestedPayload(empty, 1, new Set()),
        { kind: 'empty', products: [], stoppedAtProductLimit: false });
    assert.equal(readRequestedPayload(empty.slice(0, -3), 1, new Set()).kind, 'invalid');
    assert.equal(readRequestedPayload('<html>blocked</html>', 1, new Set()).kind, 'invalid');
    const complete = '<script>window.__myx={"searchData":{"results":{"products":[' + JSON.stringify(row(1)) + ']}}};';
    assert.equal(readRequestedPayload(complete, 1, new Set()).stoppedAtProductLimit, false);
});
