import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { chaosPolicy, wrongPolicy } from '../js/dev/policies.js';
import { createObserver } from '../js/dev/observer.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('chaos playthrough: random choices stay clean and complete', () => {
  const obs = createObserver(cfg, script);
  // Measured: completes at tick 1122868 (postEnd true); 2500000 is >=2x headroom.
  const { state } = runBot(cfg, script,
    { maxTicks: 2500000, seed: 21, policy: chaosPolicy(1), contracts, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
  // Measured: postEnd true at tick 1122868, act 3.
  assert.ok(state.postEnd, 'chaos run completes');
  // Measured: wakes 1506.
  assert.ok(state.wakes >= 1, `wakes ${state.wakes} >= 1`);
});

test('wrong playthrough: the engine survives deliberately bad play', () => {
  const obs = createObserver(cfg, script);
  // Measured: completes at tick 1127179 (postEnd true); 2500000 is >=2x headroom.
  const { state } = runBot(cfg, script,
    { maxTicks: 2500000, seed: 22, policy: wrongPolicy(), contracts, onTick: obs.onTick });
  assert.deepEqual(obs.report().violations, []);
  // Measured: wakes 1634 (bad play is punished harder than the steady ceiling of 12).
  assert.ok(state.wakes > 12, `wakes ${state.wakes} > 12`);
  // Never a soft-lock: the run finishes, or the game demonstrably kept
  // moving deep past act 1. Measured lifetime 600046110914; floor is half that.
  assert.ok(state.postEnd || state.lifetime > 300000000000,
    `postEnd ${state.postEnd} lifetime ${state.lifetime}`);
});
