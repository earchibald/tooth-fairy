import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';
import { steadyPolicy, chaosPolicy } from '../js/dev/policies.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

// Pins the policy refactor: an explicit steadyPolicy must equal the default
// (historical) behavior state-for-state. Seed 11 is the tuned e2e seed.
test('explicit steadyPolicy matches the default run exactly', () => {
  const a = runBot(cfg, script, { maxTicks: 50000, seed: 11, contracts });
  const b = runBot(cfg, script,
    { maxTicks: 50000, seed: 11, contracts, policy: steadyPolicy() });
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.events, b.events);
});

test('same chaos seed gives the same run; different seed diverges', () => {
  const a = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(3) });
  const b = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(3) });
  const c = runBot(cfg, script,
    { maxTicks: 30000, seed: 11, contracts, policy: chaosPolicy(4) });
  assert.deepEqual(a.state, b.state);
  assert.notDeepEqual(a.state, c.state);
});

test('explicit tapsPerTick option overrides the policy hook', () => {
  const a = runBot(cfg, script,
    { maxTicks: 5000, seed: 2, contracts, tapsPerTick: 3, policy: steadyPolicy() });
  const b = runBot(cfg, script, { maxTicks: 5000, seed: 2, contracts, tapsPerTick: 3 });
  assert.deepEqual(a.state, b.state);
});
