import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';

const cfg = buildConstants();

for (const seed of [11, 12, 13]) {
  test(`a full run lands in the 2-3 day envelope (seed ${seed})`, () => {
    const { state } = runBot(cfg, buildScript(), { maxTicks: 900000, seed, contracts: buildContracts() });
    assert.ok(state.postEnd, 'run completes');
    assert.ok(state.night >= 5 && state.night <= 9, `nights ${state.night} in [5,9]`);
    const activeH = (state.night * cfg.NIGHT.LENGTH_TICKS * cfg.TICK_MS) / 3600000;
    const gapsH = ((state.night - 1) * cfg.NIGHT.MIN_GAP_S) / 3600;
    assert.ok(activeH + gapsH >= 12, `min wall time ${(activeH + gapsH).toFixed(1)}h >= 12h`);
  });
}
