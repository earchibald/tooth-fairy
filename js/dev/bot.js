// A competent, deliberately not-optimal player. Shared by playthrough,
// pacing, and reachability tests so they all measure the same kind of player.
// Policy: hoard toward the best revealed tier; trickle cheap buys under 25%
// of the bank; tiptoe early but not forever; read every note.

import { createState } from '../engine/state.js';
import { dispatch } from '../engine/actions.js';
import { tick } from '../engine/tick.js';
import { nextCost } from '../engine/math.js';

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
      dispatch(state, cfg, 'dismissBeat', { id });
      events.push({ tick: state.tick, beat: id });
      if (state.postEnd) break;
      continue; // the game pauses while a beat is open
    }
    for (let i = 0; i < tapsPerTick; i++) dispatch(state, cfg, 'tap');
    if (state.stir > 75) dispatch(state, cfg, 'tiptoe');
    if (state.notes > 0) dispatch(state, cfg, 'readNote');
    for (const id of UPGRADE_IDS) {
      if (!state.upgrades[id]) dispatch(state, cfg, 'buyUpgrade', { id });
    }
    if (state.revealed.loom && state.stir > 40) dispatch(state, cfg, 'buyLoom');

    // Hoard toward the best revealed tier; meanwhile only buy units that
    // repay their cost within ~5 minutes — they accelerate the save.
    const top = BUY_PRIORITY.find((u) => state.revealed['unit:' + u]);
    for (const unit of BUY_PRIORITY) {
      if (!state.revealed['unit:' + unit]) continue;
      const def = cfg.UNITS[unit];
      const cost = nextCost(def.base, def.growth, state.buys[unit]);
      const mult = Math.pow(2, state.mults[unit] || 0);
      const rate = (def.rate || (def.lumpAmount / (def.lumpEveryTicks * cfg.TICK_MS / 1000))) * mult;
      // Mortal units can only ever repay their own lifetime of production.
      const lifeCap = def.lifeTicks
        ? rate * (def.lifeTicks * cfg.TICK_MS / 1000) *
          (1 + (state.upgrades.afterglow ? def.afterglowFrac : 0))
        : Infinity;
      if (unit === top || (cost / rate <= 450 && cost < lifeCap)) {
        dispatch(state, cfg, 'buyUnit', { unit });
      }
    }
    for (const unit of BUY_PRIORITY) dispatch(state, cfg, 'buyMult', { unit });
    tick(state, cfg, script);
    state.sfx.length = 0; // transient feedback, unread headless
    if (onTick) onTick(state);
  }
  return { state, events, steps };
}
