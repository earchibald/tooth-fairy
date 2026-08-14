import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildContracts } from '../js/config/contracts.js';
import { createState, serialize, deserialize } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick, runOffline } from '../js/engine/tick.js';

const cfg = buildConstants();
const contracts = buildContracts();
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

test('the barge manifest share clamps to manifestCap when mults.barge and count push it past the cap', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.units.barge = 10; s.buys.barge = 10;
  s.mults.barge = 1;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  const manifest = s.bargeManifest;
  assert.ok(manifest > 0);
  const before = s.teeth;
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  // Uncapped would be manifestFrac(0.05) * barges(10) * 2^mults(2) = 1.0 — way
  // past manifestCap(0.25). If the clamp were missing or bypassed, the payout
  // would be 4x this, so an unclamped-expectation assertion would fail here.
  const uncapped = cfg.UNITS.barge.manifestFrac * 10 * Math.pow(2, 1);
  assert.ok(uncapped > cfg.UNITS.barge.manifestCap, 'test setup must actually exceed the cap');
  assert.ok(Math.abs((s.teeth - before) - manifest * cfg.UNITS.barge.manifestCap) < 10,
    'payout uses the clamped cap, not the raw frac * barges * mults');
  assert.equal(s.sailings, 1);
});

test('a unique upgrade doubles its unit', () => {
  const plain = nightPlaying();
  plain.units.scout = 10; plain.buys.scout = 10;
  for (let i = 0; i < 10; i++) tick(plain, cfg, noStory);

  const upgraded = nightPlaying();
  upgraded.units.scout = 10; upgraded.buys.scout = 10;
  upgraded.upgrades.sockradar = true;
  for (let i = 0; i < 10; i++) tick(upgraded, cfg, noStory);

  const ratio = upgraded.teeth / plain.teeth;
  assert.ok(ratio > 1.9 && ratio < 2.1, `scout output ratio ${ratio.toFixed(2)} ≈ 2`);
});

test('night and sailings triggers gate river beats', () => {
  const s = nightPlaying();
  const beat = { id: 'x', trigger: { type: 'sailings', count: 2 } };
  const script2 = { beats: [beat], asides: [], whispers: {}, notes: [] };
  s.sailings = 1;
  tick(s, cfg, script2);
  assert.ok(!s.beatQueue.includes('x'));
  s.sailings = 2;
  tick(s, cfg, script2);
  assert.ok(s.beatQueue.includes('x'));
});

test('manifestii doubles the barge manifest share within the clamp', () => {
  const s = nightPlaying();
  s.units.scout = 10; s.buys.scout = 10;
  s.units.barge = 2; s.buys.barge = 2;
  s.upgrades.manifestii = true;
  for (let i = 0; i < cfg.NIGHT.LENGTH_TICKS + 2; i++) tick(s, cfg, noStory);
  const manifest = s.bargeManifest;
  assert.ok(manifest > 0);
  const before = s.teeth;
  const gapTicks = Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000));
  for (let i = 0; i < gapTicks + 2; i++) tick(s, cfg, noStory);
  const frac = Math.min(cfg.UNITS.barge.manifestCap, cfg.UNITS.barge.manifestFrac * 2 * cfg.UPGRADES.manifestii.manifestMult);
  assert.ok(Math.abs((s.teeth - before) - manifest * frac) < 10);
});

test('only one pact signs per night', () => {
  const s = nightPlaying();
  s.act = 3;
  s.revealed['unit:pact'] = true;
  s.teeth = 1e12;
  assert.ok(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }));
  assert.equal(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }), false, 'second refuses');
  const gapAndNight = cfg.NIGHT.LENGTH_TICKS +
    Math.ceil(cfg.NIGHT.MIN_GAP_S / (cfg.TICK_MS / 1000)) + 4;
  s.units.scout = 1; s.buys.scout = 1;      // burn the night productively
  for (let i = 0; i < gapAndNight; i++) tick(s, cfg, noStory);
  assert.ok(dispatch(s, cfg, 'buyUnit', { unit: 'pact' }), 'new night, new signature');
});

test('v1 saves migrate: night fields defaulted, migration beat queued once', () => {
  const s = nightPlaying();
  s.act = 2;
  const raw = JSON.parse(serialize(s));
  raw.state.v = 1;
  delete raw.state.night; delete raw.state.nightPhase; delete raw.state.contractBoard;
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.state.v, 4);
  assert.equal(back.state.night, 1);
  assert.ok(back.state.beatQueue.includes('mig-nights'));
  // Without this, a migrated act>=2 save that already saw a2-hush would also
  // queue a2-night on its first tick (its afterBeat trigger is already met),
  // firing a second back-to-back revealNight beat that refills the night meter.
  assert.ok(back.state.beatsSeen.includes('a2-night'),
    'a2-night is pre-seen so it can never double-fire alongside mig-nights');
});

test('act-0 v1 save migrates without queuing mig-nights or marking a2-night seen', () => {
  const s = createState(1);
  s.act = 0;
  const raw = JSON.parse(serialize(s));
  raw.state.v = 1;
  delete raw.state.night; delete raw.state.nightPhase; delete raw.state.contractBoard;
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.state.v, 4, 'v upgraded to 4');
  assert.equal(back.state.act, 0, 'act remains 0');
  assert.ok(!back.state.beatQueue.includes('mig-nights'),
    'act-0 save does not queue mig-nights migration beat');
  assert.ok(!back.state.beatsSeen.includes('a2-night'),
    'act-0 save does not suppress a2-night so night can reveal naturally later');
});

test('act>=1 v1 save queues mig-nights and marks a2-night seen to avoid double reveal', () => {
  const s = nightPlaying();
  s.act = 1;
  const raw = JSON.parse(serialize(s));
  raw.state.v = 1;
  delete raw.state.night; delete raw.state.nightPhase; delete raw.state.contractBoard;
  const back = deserialize(JSON.stringify(raw));
  assert.equal(back.state.v, 4, 'v upgraded to 4');
  assert.equal(back.state.act, 1, 'act is 1');
  assert.ok(back.state.beatQueue.includes('mig-nights'),
    'act>=1 save queues mig-nights migration beat');
  assert.ok(back.state.beatsSeen.includes('a2-night'),
    'act>=1 save marks a2-night seen to prevent double reveal with mig-nights');
});

test('nightStats resets at reveal, so pre-reveal production does not inflate night 1', () => {
  const s = createState(1);
  s.tapShown = true;
  s.act = 1;
  s.upgrades.babyfae = true;
  s.units.scout = 10; s.buys.scout = 10;
  for (let i = 0; i < 500; i++) tick(s, cfg, noStory);
  assert.ok(s.nightStats.teeth > 0, 'pre-reveal production accrued into nightStats');
  dispatch(s, cfg, 'applyBeatEffects', { effects: { revealNight: true } });
  assert.equal(s.nightStats.teeth, 0, 'reveal wipes pre-reveal accrual');
});

test('a gather contract crossed on the exact tick the night ends completes cleanly: full streak, a real burst', () => {
  const c = contracts.pool.find((x) => x.id === 'c-gather-s');
  const s = nightPlaying();
  s.units.scout = 50; s.buys.scout = 50;
  s.contractBoard = [c.id];
  dispatch(s, cfg, 'pickContract', { id: c.id });
  assert.equal(s.contractPicked, c.id);
  s.nightTicksLeft = 1;               // this tick is the night's last
  s.nightStats.teeth = c.n - 1;       // this tick's own production crosses n
  const teethBefore = s.teeth;
  tick(s, cfg, noStory, { contracts });
  assert.equal(s.nightPhase, 'dawn', 'the night did end on this tick');
  assert.equal(s.contractDone, true, 'threshold crossed by this tick completes it');
  assert.equal(s.contractStreak, 1, 'no reset-then-1: a clean first completion');
  const gain = s.teeth - teethBefore;
  assert.ok(gain > 500, `burstS reward paid a real burst (gain ${gain})`);
});

test('a notes contract cannot complete during dawn, even though reading notes still works then', () => {
  const c = contracts.pool.find((x) => x.id === 'c-notes');
  const s = nightPlaying();
  s.contractBoard = [c.id];
  dispatch(s, cfg, 'pickContract', { id: c.id });
  s.nightPhase = 'dawn';
  s.duskGapS = 1000;      // stays in dawn across this tick
  s.notesShown = true;
  s.notes = 5;
  assert.ok(dispatch(s, cfg, 'readNote'));
  assert.ok(dispatch(s, cfg, 'readNote'));
  assert.equal(s.nightStats.notes, 2, 'readNote still works at dawn');
  tick(s, cfg, noStory, { contracts });
  assert.equal(s.nightPhase, 'dawn', 'sanity: still dawn after the tick');
  assert.equal(s.contractDone, false, 'a notes contract must not complete during dawn');
});
