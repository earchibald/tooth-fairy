// Regression tests for defects found by the adversarial review pass.
// Each test names the failure it prevents.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { createState } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick, runOffline } from '../js/engine/tick.js';
import { nextCost } from '../js/engine/math.js';

const cfg = buildConstants();
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });

function playing(seed = 1) {
  const s = createState(seed);
  s.tapShown = true;
  s.act = 1;
  s.upgrades.babyfae = true;
  return s;
}

test('sandman actually tiptoes: same estate wakes without it, not with it', () => {
  const estate = () => {
    const s = playing();
    s.units.mouse = 40;
    s.buys.mouse = 40;
    s.wakes = 1;            // past the scripted first wake; threshold is 100
    s.tiptoeShown = true;
    return s;
  };
  const bare = estate();
  for (let i = 0; i < 4000; i++) tick(bare, cfg, noStory);
  assert.ok(bare.wakes > 1, 'control: the estate wakes without the sandman');

  const covered = estate();
  covered.upgrades.sandman = true;
  let autoTiptoes = 0;
  for (let i = 0; i < 4000; i++) {
    tick(covered, cfg, noStory);
    if (covered.sfx.some((e) => e.type === 'tiptoe' && e.auto)) autoTiptoes++;
    covered.sfx = [];
  }
  assert.ok(autoTiptoes > 0, 'sandman fired');
  assert.ok(covered.wakes < bare.wakes, 'sandman reduces wakes');
});

test('offline neither wakes nor leaves stir primed to wake on return', () => {
  const s = playing();
  s.units.mouse = 40;       // noise far above hush
  s.buys.mouse = 40;
  s.stirShown = true;
  s.upgrades.dreamledger = true;
  runOffline(s, cfg, noStory, 2 * 3600);
  assert.equal(s.wakes, 0, 'no wake during replay');
  assert.ok(s.stir < cfg.STIR.FIRST_WAKE_AT, `stir ${s.stir} not primed`);
});

test('dismissBeat refuses a stale id, so double-activation cannot eat the next beat', () => {
  const s = playing();
  s.beatQueue = ['first', 'second'];
  dispatch(s, cfg, 'dismissBeat', { id: 'first' });
  assert.deepEqual(s.beatQueue, ['second']);
  // A second activation of the already-dismissed beat must refuse.
  dispatch(s, cfg, 'dismissBeat', { id: 'first' });
  assert.deepEqual(s.beatQueue, ['second']);
  assert.ok(!s.beatsSeen.includes('second'));
  dispatch(s, cfg, 'dismissBeat');   // no arg refuses too
  assert.deepEqual(s.beatQueue, ['second']);
});

test('notes inventory is capped, so a long absence cannot bank hours of belief', () => {
  const s = playing();
  s.units.scout = 10;
  s.buys.scout = 10;
  s.upgrades.dreamledger = true;
  s.upgrades.nightledger = true;
  s.upgrades.lucidcontract = true;
  runOffline(s, cfg, noStory, 24 * 3600);
  assert.ok(s.notes <= cfg.NOTES.CAP, `notes ${s.notes} <= ${cfg.NOTES.CAP}`);
});

test('sprite price tracks the active swarm, not lifetime buys', () => {
  const s = playing();
  s.act = 2;
  s.teeth = 1e9;
  tick(s, cfg, noStory);
  dispatch(s, cfg, 'buyUnit', { unit: 'sprite' });
  const firstSpend = 1e9 - s.teeth;
  // Let the sprite die, then buy again: same price as the first.
  for (let i = 0; i <= cfg.UNITS.sprite.lifeTicks + 1; i++) tick(s, cfg, noStory);
  assert.equal(s.units.sprite, 0);
  const before = s.teeth;
  dispatch(s, cfg, 'buyUnit', { unit: 'sprite' });
  assert.equal(before - s.teeth, firstSpend);
  assert.equal(s.buys.sprite, 2);
});

test('malformed quantities can never leave teeth non-finite', () => {
  const s = playing();
  s.teeth = 1e6;
  s.revealed['unit:scout'] = true;
  dispatch(s, cfg, 'buyUnit', { unit: 'scout', n: NaN });      // coerces to 1
  assert.ok(Number.isFinite(s.teeth));
  assert.equal(s.units.scout, 1);
  dispatch(s, cfg, 'buyUnit', { unit: 'scout', n: Infinity }); // refused
  assert.ok(Number.isFinite(s.teeth));
  assert.equal(s.units.scout, 1);
});

test('a stunned ferry delivers no lumps and reports no rate', async () => {
  const { effectiveRatePerSec } = await import('../js/engine/predicates.js');
  const s = playing();
  s.units.ferry = 2;
  s.buys.ferry = 2;
  s.stunUnit = 'ferry';
  s.stunTicks = cfg.UNITS.ferry.lumpEveryTicks + 10;
  const before = s.teeth;
  for (let i = 0; i < cfg.UNITS.ferry.lumpEveryTicks + 2; i++) tick(s, cfg, noStory);
  assert.equal(s.teeth, before, 'no lump while stunned');
});

test('zero lumpEveryTicks cannot hang the tick', () => {
  const zeroCfg = buildConstants({ UNITS: { ferry: { lumpEveryTicks: 0 } } });
  const s = playing();
  s.units.ferry = 1;
  s.buys.ferry = 1;
  tick(s, zeroCfg, noStory);   // must return, not loop forever
  assert.ok(true);
});

test('belief can actually reach the streak cap', () => {
  const s = playing();
  s.units.phantom = 5;        // silent production
  s.buys.phantom = 5;
  for (let i = 0; i < 5 * 3600; i++) tick(s, cfg, noStory); // one quiet hour
  assert.ok(s.belief >= cfg.BELIEF.STREAK_CAP - 1,
    `belief ${s.belief.toFixed(1)} reaches ~${cfg.BELIEF.STREAK_CAP}`);
});

test('array knob overrides round-trip through buildConstants', () => {
  const c = buildConstants({ MULT_THRESHOLDS: [5, 25, 50] });
  assert.deepEqual(c.MULT_THRESHOLDS, [5, 25, 50]);
});

test('helpers fill the stage outline without taps', () => {
  const s = playing();
  s.units.scout = 10;          // 10/s continuous
  s.buys.scout = 10;
  s.outline.size = 8;
  const before = s.outline.filled + s.outline.setsDone * 100;
  for (let i = 0; i < 25; i++) tick(s, cfg, noStory);   // 5s of production
  const after = s.outline.filled + s.outline.setsDone * 100;
  assert.ok(after > before, 'passive production advanced the outline');
});

test('passive outline fill is capped per tick and never loops forever', () => {
  const s = playing();
  s.units.ministry = 100;      // absurd rate: 6e6/s
  s.buys.ministry = 100;
  s.outline.size = 64;
  tick(s, cfg, noStory);
  // One tick may fill at most HELPER_FILL_CAP slots (across set completions).
  const filledTotal = s.outline.setsDone * 64 + s.outline.filled;
  assert.ok(filledTotal <= cfg.OUTLINE.HELPER_FILL_CAP,
    `filled ${filledTotal} <= cap ${cfg.OUTLINE.HELPER_FILL_CAP}`);
});

test('offline replay never touches the outline', () => {
  const s = playing();
  s.units.scout = 10;
  s.buys.scout = 10;
  s.upgrades.dreamledger = true;
  const before = JSON.stringify(s.outline);
  runOffline(s, cfg, noStory, 3600);
  assert.equal(JSON.stringify(s.outline), before);
});
