import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRunOutcome } from './outcome.js';

test('classifies result, valid-empty, and budget-limited runs', () => {
    assert.equal(classifyRunOutcome(1, false, 1, 0), 'results');
    assert.equal(classifyRunOutcome(0, false, 1, 0), 'empty');
    assert.equal(classifyRunOutcome(0, true, 0, 0), 'budget-limited');
});

test('fails when every target was blocked or malformed', () => {
    assert.throws(() => classifyRunOutcome(0, false, 0, 2), /Failed targets: 2/);
    assert.throws(() => classifyRunOutcome(0, false, 1, 1), /1 target\(s\) failed/);
});
