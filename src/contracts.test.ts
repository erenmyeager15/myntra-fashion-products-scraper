import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('keeps live pricing, resource limits, request timeout, and proxy cleanup aligned', () => {
    const actor = JSON.parse(readFileSync(new URL('../.actor/actor.json', import.meta.url), 'utf8'));
    const schema = JSON.parse(readFileSync(new URL('../INPUT_SCHEMA.json', import.meta.url), 'utf8'));
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

    assert.equal(actor.pricingInfo.pricingPerEvent.actorChargeEvents['product-scraped'].eventPriceUsd, 0.0015);
    assert.equal(actor.defaultRunOptions.memoryMbytes, 512);
    assert.equal(actor.defaultRunOptions.timeoutSecs, 3600);
    assert.equal(schema.properties.maxResults.maximum, 500);
    assert.equal(schema.properties.searchQueries.maxItems, 5);
    assert.equal(schema.properties.categoryPaths.maxItems, 5);
    assert.match(main, /AbortSignal\.timeout\(45_000\)/);
    assert.match(main, /await dispatcher\.close\(\)/);
    assert.match(main, /classifyRunOutcome/);
});
