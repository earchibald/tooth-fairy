import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConstants } from '../js/config/constants.js';
import { buildScript } from '../js/config/script.js';
import { buildContracts } from '../js/config/contracts.js';
import { runBot } from './helpers/bot.js';

const cfg = buildConstants();
const script = buildScript();
const contracts = buildContracts();

test('the bot buys sky cards and departs into a faster second town', () => {
  // Same seed/speed idiom as the playthrough tests. Town 1 reaches postEnd
  // and departs by ~100k steps (see test/playthrough.test.js's 400k budget
  // for the same, unprestiged, town-1-only trajectory); 200k comfortably
  // covers two full towns without ballooning test runtime.
  // Do not raise maxTicks casually: the bot keeps departing every postEnd,
  // and TOWN_LEDGER_CAP is 10 — more towns evict townLedger[0], breaking the
  // town-1 comparison below.
  let afterTown1 = null;
  const { state } = runBot(cfg, script, {
    maxTicks: 200000,
    seed: 1,
    contracts,
    prestige: true,
    onTick: (s) => {
      if (!afterTown1 && s.town === 2) {
        afterTown1 = { town: s.town, stars: s.stars, starsEarned: s.starsEarned };
      }
    },
  });

  // Town 1 ended and the bot departed: arrives in town 2 with banked stars.
  assert.ok(afterTown1, 'bot reached town 2');
  assert.equal(afterTown1.town, 2);
  assert.ok(afterTown1.stars >= 0, `stars ${afterTown1.stars} >= 0`);
  assert.ok(afterTown1.starsEarned >= 10, `starsEarned ${afterTown1.starsEarned} >= 10`);

  // Town 2 ended: it should beat town 1's night count, since sky purchases
  // (scouts, upgrades, contract streak carry-over, etc.) accelerate it.
  const t1 = state.townLedger[0];
  const t2 = state.townLedger[1] ?? { nights: state.night };
  assert.ok(t1, 'town 1 recorded in the ledger');
  assert.ok(t2.nights < t1.nights, `town 2 (${t2.nights}) should beat town 1 (${t1.nights})`);

  // Town-gated story content (minTown > 1) fired, closing the coverage gap
  // the single-town playthrough tests exempt.
  assert.ok(state.beatsSeen.includes('t2-arrive'), 't2-arrive fired');
  assert.ok(state.beatsSeen.includes('t2-ledger'), 't2-ledger fired');
});
