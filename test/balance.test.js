import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { noiseLevel, hushCapacity, loomHush } from '../js/engine/predicates.js';

const cfg = buildConstants();

test('loom hush diminishes geometrically and asymptotes', () => {
  const s = createState(1);
  s.loom = 0;
  assert.equal(loomHush(s, cfg), 0);
  assert.equal(hushCapacity(s, cfg), cfg.STIR.HUSH_BASE);
  s.loom = 1;
  assert.equal(loomHush(s, cfg), cfg.LOOM.hushPerLevel);
  s.loom = 2;
  assert.ok(Math.abs(loomHush(s, cfg) -
    cfg.LOOM.hushPerLevel * (1 + cfg.LOOM.hushFalloff)) < 1e-9);
  s.loom = 500;
  const cap = cfg.LOOM.hushPerLevel / (1 - cfg.LOOM.hushFalloff);
  assert.ok(loomHush(s, cfg) < cap, 'below the asymptote');
  assert.ok(loomHush(s, cfg) > cap * 0.999, 'near the asymptote');
});

test('scale noise: a silent late-game operation still hums', () => {
  const s = createState(1);
  s.units.ministry = 20; // 1.2e6 teeth/s from noise-0 units
  const rate = 20 * cfg.UNITS.ministry.rate;
  const expected = cfg.STIR.SCALE_NOISE_PER_LOG10 *
    (Math.log10(rate) - cfg.STIR.SCALE_NOISE_FREE_LOG10);
  assert.ok(Math.abs(noiseLevel(s, cfg) - expected) < 1e-9);
});

test('scale noise obeys tiptoe like unit noise', () => {
  const s = createState(1);
  s.units.ministry = 20;
  const loud = noiseLevel(s, cfg);
  s.tiptoeTicks = 10;
  assert.ok(Math.abs(noiseLevel(s, cfg) - loud * cfg.TIPTOE.FACTOR) < 1e-9);
});

test('below the free decade the scale term is zero', () => {
  const s = createState(1);
  s.units.mouse = 5; // 50 teeth/s < 10^SCALE_NOISE_FREE_LOG10
  assert.ok(Math.abs(noiseLevel(s, cfg) - 5 * cfg.UNITS.mouse.noise) < 1e-9);
});
