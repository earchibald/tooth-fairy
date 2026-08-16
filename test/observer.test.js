import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { createState } from '../js/engine/state.js';
import { tick } from '../js/engine/tick.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();

test('a clean short run produces no violations and counts ticks', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  for (let i = 0; i < 120; i++) { tick(s, cfg, script, {}); obs.onTick(s); }
  const { violations, stats } = obs.report();
  assert.deepEqual(violations, []);
  assert.equal(stats.ticks, 120);
  // Samples land on ticks 1, 51, 101 of the observation.
  assert.equal(stats.samples.length, 3);
});

test('repeated polls of the same tick are ignored (browser polling)', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  tick(s, cfg, script, {});
  obs.onTick(s);
  obs.onTick(s);
  obs.onTick(s);
  assert.equal(obs.report().stats.ticks, 1);
});

test('corruptions are caught', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  tick(s, cfg, script, {});
  obs.onTick(s);

  s.tick++; s.teeth = NaN;
  obs.onTick(s);
  s.tick++; s.teeth = 0; s.stir = 150;
  obs.onTick(s);
  s.tick++; s.stir = 0; s.units.mouse = -2;
  obs.onTick(s);
  s.tick++; s.units.mouse = 0; s.beatQueue.push('no-such-beat');
  obs.onTick(s);
  s.beatQueue.pop();
  s.tick -= 3; // regression within the same town
  obs.onTick(s);

  const rules = obs.report().violations.map((v) => v.rule);
  assert.ok(rules.includes('finite:teeth'), rules.join(','));
  assert.ok(rules.includes('range:stir'));
  assert.ok(rules.includes('units:mouse'));
  assert.ok(rules.includes('beat:unknown-queued'));
  assert.ok(rules.includes('tick:regressed'));
});

test('a town change resets the monotonic trackers', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  s.tick = 5000; s.lifetime = 9e9; s.town = 1;
  obs.onTick(s);
  const s2 = createState(2);
  s2.tick = 1; s2.lifetime = 0; s2.town = 2;
  obs.onTick(s2);
  assert.deepEqual(obs.report().violations, []);
});

test('pressure and loom stats accumulate', () => {
  const obs = createObserver(cfg, script);
  const s = createState(1);
  s.units.bunny = 40; // noise 120 >> hush 10
  for (let i = 0; i < 10; i++) { s.tick++; s.stir = 5; obs.onTick(s); }
  s.loom = 1; s.stir = 0; s.tick++; obs.onTick(s);
  const { stats } = obs.report();
  const act = stats.perAct[s.act];
  assert.equal(act.pressureTicks, 11);
  assert.equal(act.stirTicks, 10);
  assert.equal(act.maxStir, 5);
  assert.deepEqual(stats.loomBuys, [{ tick: s.tick, level: 1 }]);
});
