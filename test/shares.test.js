import { test } from 'node:test';
import assert from 'node:assert';
import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { unitRateShares } from '../js/engine/predicates.js';

const cfg = buildConstants(null);

test('all zeros when nothing produces', () => {
  const sh = unitRateShares(createState(1), cfg);
  for (const k of Object.keys(sh)) assert.equal(sh[k], 0);
});

test('mixed roster normalizes to 1 with both families present', () => {
  const s = createState(1);
  s.units.scout = 10;
  s.units.mouse = 2;
  const sh = unitRateShares(s, cfg);
  const sum = Object.values(sh).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(sh.flyers > 0);
  assert.ok(sh.grounders > 0);
  assert.equal(sh.river, 0);
});

test('ferry lump cadence counts as river rate', () => {
  const s = createState(1);
  s.units.ferry = 2;
  const sh = unitRateShares(s, cfg);
  assert.ok(sh.river > 0.999);
});

test('a stunned unit contributes nothing', () => {
  const s = createState(1);
  s.units.scout = 5;
  s.stunUnit = 'scout';
  s.stunTicks = 10;
  const sh = unitRateShares(s, cfg);
  assert.equal(sh.flyers, 0);
});
