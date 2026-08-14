// A competent, deliberately not-optimal player. Shared by playthrough,
// pacing, and reachability tests so they all measure the same kind of player.
// Policy: hoard toward the best revealed tier; trickle cheap buys under 25%
// of the bank; tiptoe early but not forever; read every note.

import { createState, departTown } from '../engine/state.js';
import { dispatch } from '../engine/actions.js';
import { tick, runOffline } from '../engine/tick.js';
import { nextCost, starsAtLifetime } from '../engine/math.js';

const BUY_PRIORITY = ['starwrights', 'ministry', 'pact', 'barge', 'ferry', 'owl',
  'phantom', 'sprite', 'bunny', 'mouse', 'scout'];
const UPGRADE_IDS = ['babyfae', 'pincers', 'tweezers', 'gloves', 'starlight',
  'afterglow', 'sandman', 'dreamledger', 'nightledger', 'lucidcontract',
  'sockradar', 'madrid', 'encore', 'feltslippers', 'lighthouse', 'manifestii',
  'notary', 'annexforms', 'moonclippers'];
const SKY_PRIORITY = ['mouseletter', 'oldroads', 'packedlight', 'lullabythread', 'starcharts', 'ferrytoken'];

// When run with { prestige: true }, on postEnd the bot buys affordable sky
// cards in priority order, then departs. departTown returns a brand-new
// state object (it cannot be swapped in place), so runBot's loop adopts it:
// `const next = departTown(...); if (next) state = next;`.
export function runBot(cfg, script, { maxTicks = 200000, seed = 1, tapsPerTick = 1, onTick, contracts, prestige = false } = {}) {
  let state = createState(seed);
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
      if (state.postEnd) {
        // Give the engine one more tick so an afterBeat-chained beat
        // (e.g. end-town after end-sky) gets queued before we stop.
        tick(state, cfg, script, { contracts });
        if (prestige && state.postEnd && !state.beatQueue.length) {
          for (const id2 of SKY_PRIORITY) {
            if (!state.sky[id2] && state.stars >= cfg.SKY[id2].cost) dispatch(state, cfg, 'buySky', { id: id2 });
          }
          events.push(`(town ${state.town} done: +${starsAtLifetime(state.lifetime, cfg)} stars)`);
          const next = departTown(state, cfg);
          if (next) state = next;
          continue;
        }
        if (!state.beatQueue.length) break;
      }
      continue; // the game pauses while a beat is open
    }
    if (state.nightShown && state.nightPhase === 'dawn') {
      runOffline(state, cfg, script, cfg.NIGHT.MIN_GAP_S + 60, contracts);
      events.push({ tick: state.tick, beat: '(slept)' });
      continue;
    }
    if (state.nightShown && state.contractPicked === null && state.contractBoard.length && contracts) {
      const best = state.contractBoard
        .map((id) => contracts.pool.find((c) => c.id === id))
        .sort((a, b) => (b.reward.burstS || 0) - (a.reward.burstS || 0))[0];
      dispatch(state, cfg, 'pickContract', { id: best.id });
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
    tick(state, cfg, script, { contracts });
    state.sfx.length = 0; // transient feedback, unread headless
    if (onTick) onTick(state);
  }
  return { state, events, steps };
}
