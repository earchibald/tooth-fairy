// A competent, deliberately not-optimal player. Shared by playthrough,
// pacing, and reachability tests so they all measure the same kind of player.
// Strategy lives in a policy object (js/dev/policies.js); the default
// steadyPolicy reproduces the historical fixed bot decision-for-decision —
// the tuned e2e runs depend on that byte-level equivalence.

import { createState, departTown } from '../engine/state.js';
import { dispatch } from '../engine/actions.js';
import { tick, runOffline } from '../engine/tick.js';
import { nextCost, starsAtLifetime, figureDone } from '../engine/math.js';
import { steadyPolicy, BUY_PRIORITY } from './policies.js';

const UPGRADE_IDS = ['babyfae', 'pincers', 'tweezers', 'gloves', 'starlight',
  'afterglow', 'sandman', 'dreamledger', 'nightledger', 'lucidcontract',
  'sockradar', 'madrid', 'encore', 'feltslippers', 'lighthouse', 'manifestii',
  'notary', 'annexforms', 'moonclippers'];
const SKY_PRIORITY = ['mouseletter', 'oldroads', 'packedlight', 'lullabythread', 'starcharts', 'ferrytoken'];

const TRACE_PRIORITY = ['littlest', 'fieldmouse', 'quietloom', 'ferryman', 'toothfairy'];

// Leftover stars go into figures, cheapest story first. Exported so tests
// can prove the policy without a full multi-town run.
export function botTrace(state, cfg) {
  for (const id of TRACE_PRIORITY) {
    while (state.stars >= 1 &&
           (state.constellations[id] || 0) < cfg.CONSTELLATIONS[id].slots) {
      dispatch(state, cfg, 'traceStar', { id });
    }
  }
}

// When run with { prestige: true }, on postEnd the bot buys affordable sky
// cards in priority order, then departs. departTown returns a brand-new
// state object (it cannot be swapped in place), so runBot's loop adopts it:
// `const next = departTown(...); if (next) state = next;`.
export function runBot(cfg, script, { maxTicks = 200000, seed = 1, tapsPerTick, onTick, contracts, prestige = false, policy = steadyPolicy() } = {}) {
  let state = createState(seed);
  const events = [];
  let steps = 0;
  let beatWait = -1; // -1 while no beat is pending a policy delay draw
  while (steps < maxTicks) {
    steps++;
    if (state.beatQueue.length) {
      if (beatWait < 0) beatWait = policy.beatDelayTicks();
      if (beatWait > 0) { beatWait--; continue; }
      beatWait = -1;
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
          botTrace(state, cfg);
          const gained = starsAtLifetime(state.lifetime, cfg) +
            (figureDone(state, cfg, 'littlest') ? cfg.CONSTELLATIONS.littlest.departBonus : 0);
          events.push(`(town ${state.town} done: +${gained} stars)`);
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
      const board = state.contractBoard.map((id) => contracts.pool.find((c) => c.id === id));
      dispatch(state, cfg, 'pickContract', { id: policy.pickContract(board) });
    }
    const taps = tapsPerTick !== undefined ? tapsPerTick : policy.tapsPerTick(state);
    for (let i = 0; i < taps; i++) dispatch(state, cfg, 'tap');
    if (policy.shouldTiptoe(state)) dispatch(state, cfg, 'tiptoe');
    if (state.notes > 0 && policy.shouldReadNote(state)) dispatch(state, cfg, 'readNote');
    for (const id of UPGRADE_IDS) {
      if (!state.upgrades[id] && policy.shouldBuyUpgrade(state, id)) dispatch(state, cfg, 'buyUpgrade', { id });
    }
    if (policy.shouldBuyLoom(state)) dispatch(state, cfg, 'buyLoom');

    // The policy decides which units to take; the quote hands it the steady
    // payback math (cost, rate, mortal life cap, best revealed tier) so
    // policies can honor, ignore, or invert the rule without recomputing it.
    const top = BUY_PRIORITY.find((u) => state.revealed['unit:' + u]);
    for (const unit of policy.unitOrder(state)) {
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
      if (policy.shouldBuyUnit(state, unit, { cost, rate, lifeCap, top })) {
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
