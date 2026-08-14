import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('the bot reaches the ending and sees the whole spine', () => {
  const { state, steps } = runBot(cfg, script, { maxTicks: 400000, seed: 1, contracts });
  assert.ok(state.postEnd, `postEnd after ${steps} steps, lifetime ${state.lifetime}`);
  assert.ok(state.ended);
  // Every act transition happened.
  assert.equal(state.act, 3);
  // The catastrophe provably fires.
  assert.ok(state.wakes >= 1, 'at least one wake event');
  // Notes flowed and were read.
  assert.ok(state.notesRead >= 1);
});

test('every beat is reachable by the bot', () => {
  const { state } = runBot(cfg, script, { maxTicks: 600000, seed: 2, contracts });
  const missing = script.beats.filter((b) => !state.beatsSeen.includes(b.id));
  assert.deepEqual(missing.map((b) => b.id), [], 'unreached beats');
});

test('every aside is reachable by the bot', () => {
  const { state } = runBot(cfg, script, { maxTicks: 600000, seed: 3, contracts });
  const missing = script.asides.filter((a) => !state.asidesSeen.includes(a.id));
  assert.deepEqual(missing.map((a) => a.id), [], 'unreached asides');
});

test('story ordering: the tutorial spine plays in exact script order', () => {
  const { events } = runBot(cfg, script, { maxTicks: 400000, seed: 4, contracts });
  const spine = ['a0-icon', 'a0-few', 'a0-pile', 'a0-why', 'a0-fairy',
    'a0-toothfairy', 'a0-getteeth'];
  assert.deepEqual(
    events.filter((e) => e.beat !== '(slept)').slice(0, spine.length).map((e) => e.beat),
    spine,
  );
  // No act-2 beat may fire before the act-2 transition beat is dismissed.
  const order = events.map((e) => e.beat);
  const stirAt = order.indexOf('a2-stir');
  for (const id of ['a2-firstwake', 'a2-sprite', 'a2-ferry', 'r-doorway']) {
    assert.ok(order.indexOf(id) > stirAt, `${id} after a2-stir`);
  }
  assert.ok(order.indexOf('a3-fold') > order.indexOf('r-doorway'), 'a3-fold after r-doorway');
});

test('run length lands in a wide sane envelope for a fast bot', () => {
  const { state } = runBot(cfg, script, { maxTicks: 400000, seed: 5, tapsPerTick: 2, contracts });
  const minutes = (state.tick * cfg.TICK_MS) / 60000;
  // Tripwire on the act's shape, not a lock on its tuning.
  assert.ok(minutes > 10, `game-time minutes ${minutes.toFixed(1)} > 10`);
  assert.ok(minutes < 3000, `game-time minutes ${minutes.toFixed(1)} < 3000`);
});
