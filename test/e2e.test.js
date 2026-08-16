import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('observed full run: zero violations, stir stays a live system', () => {
  const obs = createObserver(cfg, script);
  const { state } = runBot(cfg, script,
    { maxTicks: 400000, seed: 11, contracts, onTick: obs.onTick });
  const { violations, stats } = obs.report();
  assert.deepEqual(violations, []);
  assert.ok(state.postEnd, 'run completes');

  // Pressure: from act 2 on, noise beats hush at least a quarter of the time.
  let t = 0, p = 0;
  for (const a of [2, 3]) {
    if (stats.perAct[a]) { t += stats.perAct[a].ticks; p += stats.perAct[a].pressureTicks; }
  }
  assert.ok(p / t >= 0.25, `pressure fraction ${(p / t).toFixed(3)} >= 0.25`);

  // Stir is alive to the end.
  const lastTick = stats.samples.at(-1).tick;
  const tail = stats.samples.filter((s) => s.tick >= lastTick * 0.75);
  assert.ok(tail.some((s) => s.stir > 0), 'stir > 0 somewhere in the final quarter');

  // The catastrophe fires but stays survivable.
  assert.ok(state.wakes >= 1 && state.wakes <= 12, `wakes ${state.wakes} in [1,12]`);

  // The loom chase continues and never permanently ends the system.
  assert.ok(state.loom >= 4, `loom level ${state.loom} >= 4`);
  const lastBuy = stats.loomBuys.at(-1).tick;
  assert.ok(stats.samples.some((s) => s.tick > lastBuy && s.noise > s.hush),
    'noise climbs back above hush after the final loom buy');
});

test('observed two-town prestige run stays clean', () => {
  const obs = createObserver(cfg, script);
  runBot(cfg, script,
    { maxTicks: 900000, seed: 12, contracts, prestige: true, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
});
