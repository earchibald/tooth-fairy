import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { createState, departTown, serialize, deserialize } from '../js/engine/state.js';
import { dispatch } from '../js/engine/actions.js';
import { tick } from '../js/engine/tick.js';

const cfg = buildConstants();

function endedState() {
  const s = createState(7);
  s.act = 3; s.postEnd = true; s.ended = true;
  s.lifetime = cfg.STARS.PIVOT;           // exactly 10 stars
  s.night = 7;
  s.units.scout = 50; s.loom = 5; s.notes = 3; s.contractStreak = 8;
  s.upgrades.lucidcontract = true;
  return s;
}

test('departTown: banks meta, resets the run, null before postEnd', () => {
  const before = createState(7);
  assert.equal(departTown(before, cfg), null);
  const s = endedState();
  const next = departTown(s, cfg);
  assert.equal(next.town, 2);
  assert.equal(next.stars, 10);
  assert.equal(next.starsEarned, 10);
  assert.equal(next.lifetimeAllTowns, cfg.STARS.PIVOT);
  assert.equal(next.townLedger.length, 1);
  assert.deepEqual(next.townLedger[0],
    { town: 1, nights: 7, lifetime: cfg.STARS.PIVOT, stars: 10 });
  // run state resets
  assert.equal(next.lifetime, 0);
  assert.equal(next.units.scout, 0);
  assert.equal(next.loom, 0);
  assert.equal(next.upgrades.lucidcontract, undefined);
  assert.equal(next.contractStreak, 0);   // no starcharts
  assert.notEqual(next.seed, s.seed);
  // town 2 skips the amnesia opening
  assert.equal(next.act, 1);
  assert.ok(next.tapShown && next.counterShown && next.revealed['unit:scout']);
});

test('departTown: sky start effects apply', () => {
  const s = endedState();
  s.sky = { oldroads: true, mouseletter: true, packedlight: true, starcharts: true };
  const next = departTown(s, cfg);
  assert.ok(next.upgrades.babyfae && next.upgrades.pincers);
  assert.equal(next.units.scout, cfg.SKY.mouseletter.scouts);
  assert.equal(next.buys.scout, cfg.SKY.mouseletter.scouts);
  assert.ok(next.upgrades.dreamledger);
  assert.equal(next.contractStreak, 8);   // starcharts carries the streak
  assert.deepEqual(next.sky, s.sky);      // the shop purchases persist
});

test('buySky: guards stars and one-shot; devGrantStars grants', () => {
  const s = createState(1);
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });
  assert.equal(s.sky.oldroads, undefined);      // cannot afford
  dispatch(s, cfg, 'devGrantStars', { n: 10 });
  assert.equal(s.stars, 10);
  assert.equal(s.starsEarned, 10);
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });
  assert.equal(s.sky.oldroads, true);
  assert.equal(s.stars, 10 - cfg.SKY.oldroads.cost);
  const left = s.stars;
  dispatch(s, cfg, 'buySky', { id: 'oldroads' });  // one-shot
  assert.equal(s.stars, left);
  dispatch(s, cfg, 'buySky', { id: 'nonsense' });  // unknown id refused
  assert.equal(s.stars, left);
});

test('beats honor minTown/maxTown (synthetic script)', () => {
  const script = { beats: [
    { id: 'only-t1', trigger: { type: 'start' }, maxTown: 1 },
    { id: 'only-t2', trigger: { type: 'start' }, minTown: 2 },
  ], asides: [], whispers: {}, notes: [] };
  const s1 = createState(1);
  tick(s1, cfg, script, {});
  assert.deepEqual(s1.beatQueue, ['only-t1']);
  const s2 = createState(1);
  s2.town = 2;
  tick(s2, cfg, script, {});
  assert.deepEqual(s2.beatQueue, ['only-t2']);
});

test('save v3: v2 fixture normalizes to town 1 / 0 stars and round-trips', () => {
  const v2 = { v: 2, savedAt: 1, state: { v: 2, seed: 5, act: 2, teeth: 100,
    lifetime: 5000, units: { scout: 3 }, beatsSeen: ['a0-icon'], beatQueue: [] } };
  const parsed = deserialize(JSON.stringify(v2));
  assert.ok(parsed);
  assert.equal(parsed.state.v, 4);
  assert.equal(parsed.state.town, 1);
  assert.equal(parsed.state.stars, 0);
  assert.deepEqual(parsed.state.sky, {});
  assert.deepEqual(parsed.state.townLedger, []);
  const again = deserialize(serialize(parsed.state));
  assert.equal(again.state.town, 1);
});
