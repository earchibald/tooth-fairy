// A competent, deliberately not-optimal player. Shared by playthrough,
// pacing, and reachability tests so they all measure the same kind of player.
// Policy: hoard toward the best revealed tier; trickle cheap buys under 25%
// of the bank; tiptoe early but not forever; read every note.

import { createState } from '../../js/engine/state.js';
import { dispatch } from '../../js/engine/actions.js';
import { tick } from '../../js/engine/tick.js';
import { nextCost } from '../../js/engine/math.js';
import { effectiveRatePerSec } from '../../js/engine/predicates.js';

const BUY_PRIORITY = ['ministry', 'pact', 'ferry', 'phantom', 'sprite', 'mouse', 'scout'];
const UPGRADE_IDS = ['babyfae', 'pincers', 'tweezers', 'gloves', 'starlight',
  'afterglow', 'sandman', 'dreamledger', 'nightledger', 'lucidcontract'];

export function runBot(cfg, script, { maxTicks = 200000, seed = 1, tapsPerTick = 1, onTick } = {}) {
  const state = createState(seed);
  const events = [];
  let steps = 0;
  while (steps < maxTicks) {
    steps++;
    if (state.beatQueue.length) {
      const id = state.beatQueue[0];
      const beat = script.beats.find((b) => b.id === id);
      dispatch(state, cfg, 'applyBeatEffects', { effects: beat && beat.effects });
      dispatch(state, cfg, 'dismissBeat');
      events.push({ tick: state.tick, beat: id });
      if (state.postEnd) break;
      continue; // the game pauses while a beat is open
    }
    for (let i = 0; i < tapsPerTick; i++) dispatch(state, cfg, 'tap');
    if (state.stir > 60 && state.tiptoes < 5) dispatch(state, cfg, 'tiptoe');
    if (state.notes > 0) dispatch(state, cfg, 'readNote');
    for (const id of UPGRADE_IDS) {
      if (!state.upgrades[id]) dispatch(state, cfg, 'buyUpgrade', { id });
    }
    if (state.revealed.loom && state.stir > 50) dispatch(state, cfg, 'buyLoom');

    const top = BUY_PRIORITY.find((u) => state.revealed['unit:' + u]);
    const pocket = Math.max(state.teeth * 0.25, effectiveRatePerSec(state, cfg) * 30);
    for (const unit of BUY_PRIORITY) {
      if (!state.revealed['unit:' + unit]) continue;
      const cost = nextCost(cfg.UNITS[unit].base, cfg.UNITS[unit].growth, state.buys[unit]);
      if (unit === top || cost <= pocket) {
        dispatch(state, cfg, 'buyUnit', { unit });
      }
    }
    for (const unit of BUY_PRIORITY) dispatch(state, cfg, 'buyMult', { unit });
    tick(state, cfg, script);
    if (onTick) onTick(state);
  }
  return { state, events, steps };
}
