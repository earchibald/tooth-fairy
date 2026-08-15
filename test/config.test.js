// Config modules must parse and import: the game suite never touched
// names.js, so a corrupted string literal once shipped green. Importing
// every config module here makes "the game cannot boot" a test failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildNames } from '../js/config/names.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { buildVfx, VFX_DEFAULTS } from '../js/config/vfx.js';
import { TUNED } from '../js/config/tuned.js';
import { NAME_DEFAULTS } from '../js/config/names.js';

test('every config module imports and builds', () => {
  const cfg = buildConstants();
  const names = buildNames();
  assert.ok(cfg.STARS && cfg.SKY);
  assert.ok(buildScript(null).beats.length > 0);
  assert.ok(buildContracts().pool.length > 0);
  assert.ok(buildVfx().palettes);
  assert.equal(names.ui.depart, 'another town');
  for (const id of Object.keys(cfg.SKY)) {
    assert.ok(names.sky[id] && names.sky[id].name, `names.sky.${id} missing`);
  }

  const vfx = buildVfx();
  assert.equal(names.tabs.sky, 'the sky');
  for (const id of Object.keys(cfg.CONSTELLATIONS)) {
    assert.ok(names.constellations[id] && names.constellations[id].name,
      `names.constellations.${id} missing`);
    const pat = vfx.constellations[id];
    assert.ok(pat, `vfx.constellations.${id} missing`);
    assert.equal(pat.points.length, cfg.CONSTELLATIONS[id].slots,
      `vfx.constellations.${id}: points must equal slots`);
    for (const [a, b] of pat.edges) {
      assert.ok(a >= 0 && a < pat.points.length && b >= 0 && b < pat.points.length,
        `vfx.constellations.${id}: edge [${a},${b}] out of range`);
    }
  }
  const beats = buildScript(null).beats;
  for (const id of ['sky-trace', 'sky-figure']) {
    const beat = beats.find((b) => b.id === id);
    assert.ok(beat, `beat ${id} missing`);
    assert.equal(beat.minTown, 2, `beat ${id} must carry minTown 2`);
  }

  assert.ok(TUNED && typeof TUNED === 'object' && !Array.isArray(TUNED));
  // Tuned values sit between code defaults and local overrides; stale keys
  // are dropped by the merge, never invented.
  const everyKey = (def, built) => {
    for (const k of Object.keys(def)) {
      assert.ok(k in built, `buildVfx dropped ${k}`);
      if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) everyKey(def[k], built[k]);
    }
  };
  everyKey(VFX_DEFAULTS, buildVfx());
  assert.ok(!('bogusKey' in buildVfx({ bogusKey: 1 })));
});

test('hoard tiers: ascending mins from 1, names cover every id', () => {
  const tiers = VFX_DEFAULTS.hoard.tiers;
  assert.equal(tiers[0].min, 1);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].min > tiers[i - 1].min, `tier ${i} min not ascending`);
  }
  for (const t of tiers) {
    assert.ok(t.units >= 1 && t.px > 0, `tier ${t.id} bad units/px`);
    assert.equal(typeof NAME_DEFAULTS.hoard[t.id], 'string', `no name for ${t.id}`);
  }
});

test('vfx merge: numeric-keyed override reaches inside the tiers array', () => {
  const vfx = buildVfx({ hoard: { tiers: { 3: { units: 9 } } } });
  assert.equal(vfx.hoard.tiers[3].units, 9);
  assert.equal(vfx.hoard.tiers[3].id, VFX_DEFAULTS.hoard.tiers[3].id);
  assert.equal(vfx.hoard.tiers[2].units, VFX_DEFAULTS.hoard.tiers[2].units);
  assert.equal(vfx.hoard.tiers.length, VFX_DEFAULTS.hoard.tiers.length);
  assert.ok(Array.isArray(vfx.hoard.tiers));
});

test('vfx merge: unaffected arrays still deep-copy', () => {
  const vfx = buildVfx({});
  assert.notEqual(vfx.constellations.littlest.points,
    VFX_DEFAULTS.constellations.littlest.points);
  assert.deepEqual(vfx.constellations.littlest.points,
    [...VFX_DEFAULTS.constellations.littlest.points].map((p) => [...p]));
});
