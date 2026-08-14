// Constellations: tracing stars into figures for permanent bonuses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState, deserialize, departTown } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { figureDone } from '../js/engine/math.js';

const cfg = buildConstants();

test('traceStar spends one star and places it; done flag on completion', () => {
  const s = createState(1);
  s.stars = 5;
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.stars, 4);
  assert.equal(s.constellations.littlest, 1);
  assert.equal(s.sfx.at(-1).type, 'trace');
  assert.equal(s.sfx.at(-1).done, false);
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.constellations.littlest, cfg.CONSTELLATIONS.littlest.slots);
  assert.equal(s.sfx.at(-1).done, true);
  assert.ok(figureDone(s, cfg, 'littlest'));
});

test('traceStar refuses silently: unknown id, complete figure, broke', () => {
  const s = createState(1);
  s.stars = 1;
  const seqBefore = s.uiSeq;
  dispatch(s, cfg, 'traceStar', { id: 'nonsense' });
  assert.equal(s.stars, 1);
  s.constellations.littlest = cfg.CONSTELLATIONS.littlest.slots;
  dispatch(s, cfg, 'traceStar', { id: 'littlest' });
  assert.equal(s.stars, 1);
  s.stars = 0;
  dispatch(s, cfg, 'traceStar', { id: 'fieldmouse' });
  assert.equal(s.constellations.fieldmouse, undefined);
  assert.equal(s.uiSeq, seqBefore);
  assert.equal(s.sfx.length, 0);
});

test('figureDone: false below slots, true at slots, false for unknown', () => {
  const s = createState(1);
  s.constellations.quietloom = cfg.CONSTELLATIONS.quietloom.slots - 1;
  assert.equal(figureDone(s, cfg, 'quietloom'), false);
  s.constellations.quietloom = cfg.CONSTELLATIONS.quietloom.slots;
  assert.equal(figureDone(s, cfg, 'quietloom'), true);
  assert.equal(figureDone(s, cfg, 'nonsense'), false);
});

test('departTown carries figures and littlest pays its departure bonus', () => {
  const s = createState(1);
  s.postEnd = true;
  s.lifetime = cfg.STARS.PIVOT;                    // exactly 10 stars
  s.constellations = { littlest: cfg.CONSTELLATIONS.littlest.slots, fieldmouse: 2 };
  const next = departTown(s, cfg);
  const expect = 10 + cfg.CONSTELLATIONS.littlest.departBonus;
  assert.equal(next.stars, expect);
  assert.equal(next.starsEarned, expect);
  assert.equal(next.townLedger[0].stars, expect);
  assert.deepEqual(next.constellations,
    { littlest: cfg.CONSTELLATIONS.littlest.slots, fieldmouse: 2 });
});

test('departTown without littlest pays the plain formula', () => {
  const s = createState(1);
  s.postEnd = true;
  s.lifetime = cfg.STARS.PIVOT;
  const next = departTown(s, cfg);
  assert.equal(next.stars, 10);
});

test('v3 save (no constellations) loads with empty map at v4', () => {
  const s = createState(7);
  delete s.constellations;
  s.v = 3;
  const raw = JSON.stringify({ v: 3, savedAt: 123, state: s });
  const loaded = deserialize(raw);
  assert.ok(loaded);
  assert.deepEqual(loaded.state.constellations, {});
  assert.equal(loaded.state.v, 4);
});
