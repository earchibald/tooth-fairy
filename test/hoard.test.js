import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, shapesFor, slotXs, drawHoard, glintPoint, hoardSig } from '../js/ui/hoard.js';

const TIERS = [
  { id: 'sack',       min: 1,    units: 1,  px: 34 },
  { id: 'jars',       min: 1e2,  units: 7,  px: 22 },
  { id: 'chests',     min: 1e4,  units: 6,  px: 30 },
  { id: 'piles',      min: 1e6,  units: 5,  px: 40 },
  { id: 'warehouses', min: 1e9,  units: 6,  px: 52 },
  { id: 'silos',      min: 1e12, units: 9,  px: 58 },
  { id: 'mountains',  min: 1e15, units: 5,  px: 72 },
  { id: 'moons',      min: 1e18, units: 6,  px: 18 },
];

const VFX = { hoard: { alpha: 0.5, glintPerS: 0.8, centerGapPx: 72, tiers: TIERS } };
const COLORS = { accent: '#7b96c9', glow: '#a8c0ea' };

test('tierFor: below the first tier nothing exists', () => {
  assert.equal(tierFor(0, TIERS), null);
  assert.equal(tierFor(0.5, TIERS), null);
  assert.equal(tierFor(-5, TIERS), null);
  assert.equal(tierFor(NaN, TIERS), null);
});

test('tierFor: every threshold lands its tier at progress 0', () => {
  for (const t of TIERS) {
    const r = tierFor(t.min, TIERS);
    assert.equal(r.id, t.id);
    assert.equal(r.progress, 0);
  }
});

test('tierFor: 99 is still the sack, part-way through', () => {
  const r = tierFor(99, TIERS);
  assert.equal(r.id, 'sack');
  assert.ok(r.progress > 0.9 && r.progress < 1);
});

test('tierFor: the last tier spans 3 decades then clamps', () => {
  assert.ok(tierFor(1e19, TIERS).progress < 1);
  assert.equal(tierFor(1e21, TIERS).progress, 1);
  assert.equal(tierFor(1e30, TIERS).progress, 1);
  const inf = tierFor(Infinity, TIERS);
  assert.equal(inf.id, 'moons');
  assert.equal(inf.progress, 1);
});

test('tierFor: progress is monotonic in count', () => {
  let prev = -1;
  for (let e = 0; e <= 24; e += 0.25) {
    const r = tierFor(Math.pow(10, e), TIERS);
    const global = r.index + r.progress;
    assert.ok(global >= prev, `10^${e} went backward`);
    prev = global;
  }
});

test('shapesFor: endpoints and midpoint', () => {
  assert.deepEqual(shapesFor(0, 7), { shown: 1, fill: 0 });
  assert.deepEqual(shapesFor(1, 7), { shown: 7, fill: 1 });
  assert.deepEqual(shapesFor(0.5, 7), { shown: 4, fill: 0.5 });
  assert.deepEqual(shapesFor(0.6, 1), { shown: 1, fill: 0.6 });
});

test('slotXs: slots stay inside the canvas and outside the center gap', () => {
  const w = 800;
  const gap = 72;
  const xs = slotXs(w, gap, 9, 58);
  assert.equal(xs.length, 9);
  for (const x of xs) {
    assert.ok(x >= 0 && x <= w);
    assert.ok(Math.abs(x - w / 2) >= gap / 2, `${x} inside the gap`);
  }
});

function stubCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push(name); };
  return {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    save: rec('save'), restore: rec('restore'),
    beginPath: rec('beginPath'), closePath: rec('closePath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    fill: rec('fill'), stroke: rec('stroke'),
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
  };
}

test('drawHoard: every tier paints something', () => {
  for (const t of TIERS) {
    const c = stubCtx();
    drawHoard(c, { w: 800, h: 96, count: t.min * 30, vfx: VFX, colors: COLORS });
    const painted = c.calls.some((n) =>
      n === 'fill' || n === 'stroke' || n === 'fillRect' || n === 'strokeRect');
    assert.ok(painted, `${t.id} painted nothing`);
    assert.equal(c.calls.filter((n) => n === 'save').length,
      c.calls.filter((n) => n === 'restore').length, `${t.id} unbalanced save/restore`);
  }
});

test('drawHoard: zero paints nothing, Infinity does not throw', () => {
  const c0 = stubCtx();
  drawHoard(c0, { w: 800, h: 96, count: 0, vfx: VFX, colors: COLORS });
  assert.equal(c0.calls.length, 0);
  const cInf = stubCtx();
  drawHoard(cInf, { w: 800, h: 96, count: Infinity, vfx: VFX, colors: COLORS });
  assert.ok(cInf.calls.length > 0);
});

test('hoardSig: empty string below the first tier', () => {
  assert.equal(hoardSig(0, TIERS), '');
  assert.equal(hoardSig(0.5, TIERS), '');
  assert.equal(hoardSig(-5, TIERS), '');
  assert.equal(hoardSig(NaN, TIERS), '');
});

test('hoardSig: same bucket, same signature', () => {
  assert.equal(hoardSig(50, TIERS), hoardSig(50.0001, TIERS));
});

test('hoardSig: different signature across a tier boundary', () => {
  assert.notEqual(hoardSig(99, TIERS), hoardSig(100, TIERS));
});

test('hoardSig: different signature across a fill step', () => {
  assert.notEqual(hoardSig(150, TIERS), hoardSig(900, TIERS));
});

test('hoardSig: Infinity is stable and matches any count at or beyond 1e21', () => {
  const sigInf = hoardSig(Infinity, TIERS);
  assert.equal(sigInf, hoardSig(1e21, TIERS));
  assert.equal(sigInf, hoardSig(1e24, TIERS));
  assert.equal(sigInf, hoardSig(1e30, TIERS));
});

test('glintPoint: null when empty, on-stash when not, deterministic rand', () => {
  assert.equal(glintPoint({ w: 800, h: 96, count: 0, vfx: VFX, rand: () => 0.5 }), null);
  const p = glintPoint({ w: 800, h: 96, count: 5e2, vfx: VFX, rand: () => 0.5 });
  assert.ok(p && p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 96);
  const p2 = glintPoint({ w: 800, h: 96, count: 5e2, vfx: VFX, rand: () => 0.5 });
  assert.deepEqual(p, p2);
});
