import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { starsAtLifetime } from '../js/engine/math.js';
import { skyMult, hushCapacity, effectiveRatePerSec } from '../js/engine/predicates.js';
import { createState } from '../js/engine/state.js';

const cfg = buildConstants();

test('starsAtLifetime: 0 early, 10 at the pivot, sublinear past it', () => {
  assert.equal(starsAtLifetime(0, cfg), 0);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT / 200, cfg), 0);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT, cfg), 10);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT * 4, cfg), 20);
  assert.equal(starsAtLifetime(cfg.STARS.PIVOT * 2, cfg), 14); // floor(10*sqrt(2))
});

test('skyMult: +2% per star earned, tolerant of missing field', () => {
  const s = createState(1);
  assert.equal(skyMult(s, cfg), 1);
  s.starsEarned = 10;
  assert.equal(skyMult(s, cfg), 1.2);
  delete s.starsEarned;
  assert.equal(skyMult(s, cfg), 1);
});

test('lullabythread raises hush; skyMult raises the rate readout', () => {
  const s = createState(1);
  const base = hushCapacity(s, cfg);
  s.sky = { lullabythread: true };
  assert.equal(hushCapacity(s, cfg), base + cfg.SKY.lullabythread.hush);
  s.units.scout = 10;
  s.revealed['unit:scout'] = true;
  const before = effectiveRatePerSec(s, cfg);
  s.starsEarned = 10;
  assert.ok(Math.abs(effectiveRatePerSec(s, cfg) - before * 1.2) < 1e-9);
});
