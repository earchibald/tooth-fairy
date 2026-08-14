// The landing float must agree with the rate readout: one batch per second of
// credited income, carrying exactly that second's teeth.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeBatcher } from '../js/ui/conveyor.js';

test('a batch cuts every ticksPerBatch credits carrying exactly their sum', () => {
  // 6/s at 200ms ticks: 1.2 teeth per credit, 5 credits per second.
  const b = makeBatcher(5);
  const batches = [];
  for (let i = 0; i < 15; i++) {
    const out = b.credit(1.2, true);
    if (out != null) batches.push(out);
  }
  assert.equal(batches.length, 3);
  for (const amount of batches) assert.equal(amount.toFixed(1), '6.0');
});

test('a blocked launch keeps pooling and pays the full sum later', () => {
  const b = makeBatcher(5);
  const batches = [];
  for (let i = 0; i < 8; i++) {
    const out = b.credit(1, i >= 7);   // in-flight cap blocks until credit 8
    if (out != null) batches.push(out);
  }
  assert.deepEqual(batches, [8]);      // nothing lost, nothing double-counted
});
