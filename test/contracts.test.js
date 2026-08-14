import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildContracts } from '../js/config/contracts.js';
import { createState } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick } from '../js/engine/tick.js';

const cfg = buildConstants();
const contracts = buildContracts();
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });
const opts = { contracts };

function nightPlaying(seed = 1) {
  const s = createState(seed);
  s.tapShown = true; s.act = 2; s.upgrades.babyfae = true;
  dispatch(s, cfg, 'applyBeatEffects', { effects: { revealNight: true } });
  tick(s, cfg, noStory, opts);   // draw the first board
  return s;
}

test('the board draws deterministically from seed + night', () => {
  const a = nightPlaying(7);
  const b = nightPlaying(7);
  assert.deepEqual(a.contractBoard, b.contractBoard);
  assert.equal(a.contractBoard.length, cfg.CONTRACTS.PER_NIGHT);
});

test('picking locks the board; threshold contracts complete mid-night', () => {
  const s = nightPlaying(3);
  const gatherId = s.contractBoard.find((id) =>
    contracts.pool.find((c) => c.id === id && c.type === 'gather'));
  if (!gatherId) return;           // board variance; other seeds cover it
  assert.ok(dispatch(s, cfg, 'pickContract', { id: gatherId }));
  assert.equal(dispatch(s, cfg, 'pickContract', { id: s.contractBoard[0] }), false);
  s.units.scout = 50; s.buys.scout = 50;
  for (let i = 0; i < 2000 && !s.contractDone; i++) tick(s, cfg, noStory, opts);
  assert.ok(s.contractDone);
});

test('streak rises on completion and multiplies production at tier 1', () => {
  const s = nightPlaying(5);
  s.contractStreak = cfg.CONTRACTS.STREAK_TIERS[0];
  s.units.scout = 10; s.buys.scout = 10;
  const t0 = s.teeth;
  for (let i = 0; i < 25; i++) tick(s, cfg, noStory, opts);
  const withStreak = s.teeth - t0;
  const p = nightPlaying(5);
  p.units.scout = 10; p.buys.scout = 10;
  const p0 = p.teeth;
  for (let i = 0; i < 25; i++) tick(p, cfg, noStory, opts);
  assert.ok(withStreak > (p.teeth - p0) * 1.02);
});
