// Workshop: batcher regression, ramp math, particle lifecycles, dev server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBatcher, rampFactor, makeParticles } from '../js/ui/juice.js';
import { buildVfx } from '../js/config/vfx.js';

test('batcher exposes pending pool so the frame loop can keep running', () => {
  const b = makeBatcher(3);
  assert.equal(b.pending(), false);
  assert.equal(b.credit(5, true), null);
  assert.equal(b.pending(), true);          // pool holds 5, no batch yet
  assert.equal(b.credit(5, true), null);
  assert.equal(b.credit(5, true), 15);      // third credit cuts the batch
  assert.equal(b.pending(), false);
  b.credit(2, false);                       // canLaunch false: pool keeps filling
  b.credit(2, false);
  b.credit(2, false);
  assert.equal(b.pending(), true);
});

test('rampFactor: log-linear between anchors, clamped, degenerate-safe', () => {
  assert.equal(rampFactor(0, 10, 1e9, 3), 1);
  assert.equal(rampFactor(-5, 10, 1e9, 3), 1);
  assert.equal(rampFactor(10, 10, 1e9, 3), 1);
  assert.equal(rampFactor(1e9, 10, 1e9, 3), 3);
  assert.equal(rampFactor(1e12, 10, 1e9, 3), 3);
  // geometric midpoint of 10..1e9 is 10^5 -> halfway factor
  assert.ok(Math.abs(rampFactor(1e5, 10, 1e9, 3) - 2) < 1e-9);
  // degenerate anchors (lo >= hi): 1 below hi, max at/above hi
  assert.equal(rampFactor(5, 100, 100, 3), 1);
  assert.equal(rampFactor(100, 100, 100, 3), 3);
  assert.equal(rampFactor(500, 100, 10, 3), 3);
});

test('particles: spawn, live, expire', () => {
  const p = makeParticles(10);
  p.spawnSparks(50, 50, 1000, { count: 4, size: 2, spreadPx: 20, lifeMs: 400 }, () => 0.5);
  p.spawnRipple(50, 50, 1000, { ms: 300, size: 40 });
  p.spawnSweep(1000, { ms: 700, alpha: 0.2 });
  assert.equal(p.step(1100), 6);
  assert.equal(p.step(1350), 5);            // ripple (300ms) gone; sparks+sweep remain
  assert.equal(p.step(1800), 0);            // sweep (700ms) gone
});

test('particles: pool cap drops oldest, never grows past max', () => {
  const p = makeParticles(5);
  p.spawnSparks(0, 0, 0, { count: 9, size: 1, spreadPx: 10, lifeMs: 100 }, () => 0.5);
  assert.equal(p.step(1), 5);
});

test('vfx.juice defaults exist with the spec values', () => {
  const vfx = buildVfx();
  assert.equal(vfx.juice.tapPop.scale, 1.12);
  assert.equal(vfx.juice.tapGlow.ms, 260);
  assert.equal(vfx.juice.tapSparks.count, 6);
  assert.equal(vfx.juice.inbound.trailPerS, 14);
  assert.equal(vfx.juice.landSparks.count, 5);
  assert.equal(vfx.juice.buySweep.alpha, 0.22);
  assert.equal(vfx.juice.ramp.rateHi, 1e9);
});
