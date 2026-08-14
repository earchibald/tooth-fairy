import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick, runOffline } from '../js/engine/tick.js';

const cfg = buildConstants();
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });

function nightPlaying() {
  const s = createState(1);
  s.tapShown = true;
  s.act = 2;
  s.upgrades.babyfae = true;
  dispatch(s, cfg, 'applyBeatEffects', { effects: { revealNight: true } });
  return s;
}

test('night is inert until revealed', () => {
  const s = createState(1);
  s.tapShown = true;
  for (let i = 0; i < 500; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 1);
});

test('productive ticks burn the night; dawn stops production and taps', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  const ticks = cfg.NIGHT.LENGTH_TICKS;
  for (let i = 0; i < ticks + 5; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  const before = s.teeth;
  for (let i = 0; i < 25; i++) tick(s, cfg, noStory);
  assert.equal(s.teeth, before, 'no production at dawn');
  assert.equal(dispatch(s, cfg, 'tap'), false, 'tap refused at dawn');
});

test('idle ticks do not burn the night', () => {
  const s = nightPlaying();                 // no units, no taps
  const left = s.nightTicksLeft;
  for (let i = 0; i < 100; i++) tick(s, cfg, noStory);
  assert.equal(s.nightTicksLeft, left);
});

test('the dusk gap ends dawn and starts the next night with a ledger stamp', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  assert.equal(s.nightLedger.length, 1);
  assert.equal(s.nightLedger[0].night, 1);
  assert.ok(s.nightLedger[0].teeth > 0);
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 2);
  assert.ok(s.nightStats.teeth < s.nightLedger[0].teeth / 10, 'stats reset at dusk');
});

test('night stats track the night', () => {
  const s = nightPlaying();
  s.units.scout = 5; s.buys.scout = 5;
  for (let i = 0; i < 50; i++) tick(s, cfg, noStory);
  assert.ok(s.nightStats.teeth > 0);
  dispatch(s, cfg, 'tap');
  const t = s.nightStats.teeth;
  tick(s, cfg, noStory);
  assert.ok(s.nightStats.teeth >= t);
});

test('absence advances the dusk gap even without any ledger', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.nightPhase, 'dawn');
  const before = s.teeth;
  runOffline(s, cfg, noStory, cfg.NIGHT.MIN_GAP_S + 120);
  assert.equal(s.nightPhase, 'night');
  assert.equal(s.night, 2);
  assert.equal(Math.floor(s.teeth), Math.floor(before), 'no ledger, no earnings');
});

test('with a ledger, a long absence plays nights and earns within caps', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.upgrades.dreamledger = true;
  const gain = runOffline(s, cfg, noStory, 3600);
  assert.ok(gain.teeth > 0);
  assert.ok(s.nightTicksLeft < cfg.NIGHT.LENGTH_TICKS, 'offline burned night time');
});

test('new units produce and reveal in act order', () => {
  const s = nightPlaying();
  s.units.bunny = 2; s.buys.bunny = 2;
  s.units.owl = 1; s.buys.owl = 1;
  const before = s.teeth;
  for (let i = 0; i < 10; i++) tick(s, cfg, noStory);
  assert.ok(s.teeth > before);
  s.teeth = 1e9; s.lifetime = 1e9; s.act = 3; s.buys.ministry = 1;
  tick(s, cfg, noStory);
  assert.ok(s.revealed['unit:starwrights']);
});

test('the barge pays a fraction of last night at dusk and counts a sailing', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.units.barge = 2; s.buys.barge = 2;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  const manifest = s.bargeManifest;
  assert.ok(manifest > 0);
  const before = s.teeth;
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  const frac = Math.min(cfg.UNITS.barge.manifestCap, cfg.UNITS.barge.manifestFrac * 2);
  assert.ok(Math.abs((s.teeth - before) - manifest * frac) < 10);
  assert.equal(s.sailings, 1);
});
