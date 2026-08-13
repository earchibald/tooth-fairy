import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants, DEFAULTS } from '../js/config/constants.js';
import { buildScript, SCRIPT_DEFAULTS } from '../js/config/script.js';
import { createState, serialize, deserialize } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick, runOffline } from '../js/engine/tick.js';
import { bulkCost, nextCost, maxAffordable } from '../js/engine/math.js';

const cfg = buildConstants();
const script = buildScript();
// Mechanics tests run without the story so beats cannot pause the game mid-test.
const noStory = Object.freeze({ beats: [], asides: [], whispers: {}, notes: [] });

function freshPlaying(seed = 1) {
  // A state past the tutorial: tap enabled, act 1, babyfae owned.
  const s = createState(seed);
  s.tapShown = true;
  s.counterShown = true;
  s.act = 1;
  s.upgrades.babyfae = true;
  return s;
}

test('bulk cost matches iterated next-cost sum', () => {
  const base = 50;
  const growth = 1.15;
  for (const owned of [0, 3, 17]) {
    for (const n of [1, 2, 10]) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += base * Math.pow(growth, owned + i);
      const closed = bulkCost(base, growth, owned, n);
      assert.ok(Math.abs(closed - sum) <= n + 1, `owned=${owned} n=${n}: ${closed} vs ${sum}`);
    }
  }
});

test('maxAffordable buys exactly what it claims', () => {
  for (const teeth of [0, 49, 50, 400, 12345, 9e6]) {
    const n = maxAffordable(50, 1.15, 4, teeth);
    if (n > 0) assert.ok(bulkCost(50, 1.15, 4, n) <= teeth);
    assert.ok(bulkCost(50, 1.15, 4, n + 1) > teeth);
  }
});

test('tap respects the per-tick cap and awards tap power', () => {
  const s = freshPlaying();
  s.teeth = 0;
  for (let i = 0; i < 5; i++) dispatch(s, cfg, 'tap');
  // babyfae doubles the base tap; cap is 2 landed taps per tick
  assert.equal(s.teeth, 2 * cfg.TAP.BASE * 2 * (1 + s.belief / 100));
  tick(s, cfg, noStory);
  dispatch(s, cfg, 'tap');
  assert.ok(s.taps === 3);
});

test('purchases guard at the reducer: unrevealed and unaffordable refuse silently', () => {
  const s = freshPlaying();
  s.teeth = 1e9;
  const before = s.teeth;
  dispatch(s, cfg, 'buyUnit', { unit: 'scout' });   // not revealed yet
  assert.equal(s.teeth, before);
  tick(s, cfg, noStory);                              // reveal check runs
  assert.ok(s.revealed['unit:scout']);
  dispatch(s, cfg, 'buyUnit', { unit: 'scout' });
  assert.equal(s.units.scout, 1);
  s.teeth = 0;
  dispatch(s, cfg, 'buyUnit', { unit: 'scout' });
  assert.equal(s.units.scout, 1);
});

test('sprites expire and afterglow pays a burst', () => {
  const s = freshPlaying();
  s.act = 2;
  s.teeth = 1e9;
  tick(s, cfg, noStory);
  dispatch(s, cfg, 'buyUnit', { unit: 'sprite' });
  assert.equal(s.units.sprite, 1);
  s.upgrades.afterglow = true;
  const lifetimeBefore = s.lifetime;
  for (let i = 0; i <= cfg.UNITS.sprite.lifeTicks + 1; i++) tick(s, cfg, noStory);
  assert.equal(s.units.sprite, 0);
  const def = cfg.UNITS.sprite;
  const expectMin = def.rate * (def.lifeTicks * cfg.TICK_MS / 1000) * (1 + def.afterglowFrac);
  assert.ok(s.lifetime - lifetimeBefore >= expectMin,
    `${s.lifetime - lifetimeBefore} >= ${expectMin}`);
});

test('ferry delivers lumps on its cadence', () => {
  const s = freshPlaying();
  s.units.ferry = 1;
  s.buys.ferry = 1;
  const before = s.teeth;
  for (let i = 0; i < cfg.UNITS.ferry.lumpEveryTicks + 1; i++) tick(s, cfg, noStory);
  assert.ok(s.teeth - before >= cfg.UNITS.ferry.lumpAmount);
});

test('stir rises past hush, wakes fire, belief pays, stun lands', () => {
  const s = freshPlaying();
  s.units.mouse = 40; // noise 80 >> hush 6
  s.buys.mouse = 40;
  let guard = 0;
  while (s.wakes === 0 && guard++ < 5000) tick(s, cfg, noStory);
  assert.ok(s.wakes >= 1, 'a wake fired');
  assert.ok(s.belief < 50);
  assert.equal(s.stunUnit, 'mouse');
  assert.ok(s.stirShown);
});

test('tiptoe halves production and noise while active', () => {
  const s = freshPlaying();
  s.tiptoeShown = true;
  s.units.scout = 10;
  s.buys.scout = 10;
  tick(s, cfg, noStory);
  const t0 = s.teeth;
  tick(s, cfg, noStory);
  const normalGain = s.teeth - t0;
  dispatch(s, cfg, 'tiptoe');
  const t1 = s.teeth;
  tick(s, cfg, noStory);
  const tiptoeGain = s.teeth - t1;
  assert.ok(tiptoeGain < normalGain * 0.6, `${tiptoeGain} < ${normalGain} * 0.6`);
});

test('offline is gated on the dream ledger and capped', () => {
  const s = freshPlaying();
  s.units.scout = 10;
  s.buys.scout = 10;
  const none = runOffline(s, cfg, noStory, 3600);
  assert.equal(none.teeth, 0);
  s.upgrades.dreamledger = true;
  const some = runOffline(s, cfg, noStory, 3600);
  assert.ok(some.teeth > 0);
  assert.equal(some.seconds, 3600);
  const capped = runOffline(s, cfg, noStory, 100 * 3600);
  assert.equal(capped.seconds, cfg.UPGRADES.dreamledger.offlineCapHours * 3600);
  assert.equal(s.wakes, 0, 'offline never wakes a house');
  assert.equal(s.beatQueue.length, 0, 'offline never consumes story');
});

test('determinism: same seed, same script → deep-equal states', () => {
  const run = () => {
    const s = freshPlaying(42);
    for (let i = 0; i < 500; i++) {
      dispatch(s, cfg, 'tap');
      tick(s, cfg, script);
      if (s.beatQueue.length) {
        const beat = script.beats.find((b) => b.id === s.beatQueue[0]);
        dispatch(s, cfg, 'applyBeatEffects', { effects: beat && beat.effects });
        dispatch(s, cfg, 'dismissBeat');
      }
    }
    s.sfx = [];
    return s;
  };
  assert.deepEqual(run(), run());
});

test('save round-trip preserves the run', () => {
  const s = freshPlaying(7);
  s.teeth = 1234.5;
  s.units.scout = 3;
  s.buys.scout = 3;
  s.beatsSeen.push('a0-icon');
  const back = deserialize(serialize(s));
  assert.ok(back);
  assert.equal(back.state.teeth, 1234.5);
  assert.equal(back.state.units.scout, 3);
  assert.ok(back.state.beatsSeen.includes('a0-icon'));
  assert.equal(deserialize('garbage'), null);
});

test('config override layer merges without inventing keys', () => {
  const c = buildConstants({ UNITS: { scout: { base: 99 } }, NONSENSE: 1 });
  assert.equal(c.UNITS.scout.base, 99);
  assert.equal(c.UNITS.scout.growth, DEFAULTS.UNITS.scout.growth);
  assert.equal(c.NONSENSE, undefined);
  assert.equal(DEFAULTS.UNITS.scout.base, 50, 'defaults untouched');
});

test('script override patches beats and keeps order', () => {
  const s2 = buildScript({ beats: { 'a0-fairy': { text: 'FAIRY?' } } });
  const beat = s2.beats.find((b) => b.id === 'a0-fairy');
  assert.equal(beat.text, 'FAIRY?');
  assert.equal(beat.response, 'alright');
  assert.equal(s2.beats.length, SCRIPT_DEFAULTS.beats.length);
});

test('script beat ids are unique', () => {
  const ids = script.beats.map((b) => b.id);
  assert.equal(ids.length, new Set(ids).size);
});
