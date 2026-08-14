// Action reducers. Every guard lives here, not on buttons; a refused action
// mutates nothing and pushes no sfx, so refusal is silent by construction.

import { bulkCost, nextCost, maxAffordable } from './math.js';
import {
  tapPower, beliefMult, multTier, multOwned, loomCost, revealChecks,
} from './predicates.js';
import { UNIT_IDS } from './state.js';

function bump(state) { state.uiSeq++; }

export function completeOutlineSet(state, cfg) {
  state.outline.setsDone++;
  state.outline.filled = 0;
  state.outline.size = Math.min(cfg.OUTLINE.MAX_SIZE, state.outline.size * 2);
  if (state.outline.setsDone >= 1) state.counterShown = true;
  state.sfx.push({ type: 'fillset' });
}

export const ACTIONS = {
  tap(state, cfg) {
    if (!state.tapShown || state.beatQueue.length) return;
    if (state.tapsThisTick >= cfg.TAP.MAX_PER_TICK) return;
    state.tapsThisTick++;
    state.taps++;
    const gain = tapPower(state, cfg) * beliefMult(state);
    state.teeth += gain;
    state.lifetime += gain;
    state.outline.filled++;
    state.sfx.push({ type: 'tap', gain });
    if (state.outline.filled >= state.outline.size) completeOutlineSet(state, cfg);
    bump(state);
  },

  buyUnit(state, cfg, arg) {
    const { unit } = arg;
    let n = arg.n || 1;
    if (!UNIT_IDS.includes(unit) || !state.revealed['unit:' + unit]) return;
    const def = cfg.UNITS[unit];
    // Sprites expire, so their price tracks the ACTIVE swarm, not lifetime
    // buys — the burst tool stays repurchasable and its real cost is noise.
    // The night only holds so many: an explicit swarm cap keeps re-buying
    // from becoming a mandatory chore that pins noise forever.
    const basis = unit === 'sprite' ? state.units.sprite : state.buys[unit];
    if (unit === 'sprite') {
      const cap = def.swarmCap + (state.mults.sprite || 0) * def.capPerMult;
      n = Math.min(n, cap - state.units.sprite);
      if (n < 1) return;
    }
    if (arg.max) n = maxAffordable(def.base, def.growth, basis, state.teeth);
    if (!Number.isFinite(n) || n < 1) return;
    const cost = bulkCost(def.base, def.growth, basis, n);
    if (state.teeth < cost) return;
    state.teeth -= cost;
    state.units[unit] += n;
    state.buys[unit] += n;
    if (unit === 'sprite') {
      for (let i = 0; i < n; i++) state.spriteExpiries.push(state.tick + def.lifeTicks);
    }
    state.sfx.push({ type: 'buy', unit, n });
    bump(state);
  },

  buyMult(state, cfg, arg) {
    const { unit } = arg;
    if (!UNIT_IDS.includes(unit)) return;
    const tier = multTier(state, unit, cfg);
    if (!tier) return;
    if (multOwned(state, unit) < tier.threshold) return;
    if (state.teeth < tier.cost) return;
    state.teeth -= tier.cost;
    state.mults[unit]++;
    state.sfx.push({ type: 'buy', unit, mult: true });
    bump(state);
  },

  buyUpgrade(state, cfg, arg) {
    const { id } = arg;
    const def = cfg.UPGRADES[id];
    if (!def || state.upgrades[id] || !state.revealed['up:' + id]) return;
    if (state.teeth < def.cost) return;
    state.teeth -= def.cost;
    state.upgrades[id] = true;
    state.sfx.push({ type: 'buy', upgrade: id });
    bump(state);
  },

  buyLoom(state, cfg) {
    if (!state.revealed.loom) return;
    const cost = loomCost(state, cfg);
    if (state.teeth < cost) return;
    state.teeth -= cost;
    state.loom++;
    state.sfx.push({ type: 'buy', loom: state.loom });
    bump(state);
  },

  tiptoe(state, cfg) {
    if (!state.tiptoeShown || state.tiptoeTicks > 0) return;
    state.tiptoeTicks = cfg.TIPTOE.TICKS;
    state.tiptoes++;
    state.sfx.push({ type: 'tiptoe' });
    bump(state);
  },

  readNote(state, cfg) {
    if (!state.notesShown || state.notes < 1 || state.act < 2) return;
    state.notes--;
    state.notesRead++;
    state.noteIdx++;
    state.belief = Math.min(100, state.belief + cfg.BELIEF.NOTE_VALUE);
    state.sfx.push({ type: 'note' });
    bump(state);
  },

  dismissBeat(state, cfg, arg) {
    // Guard at the reducer: only the beat actually at the head may be
    // dismissed, so a double-activation cannot swallow the next beat.
    if (!arg || state.beatQueue[0] !== arg.id) return;
    const id = state.beatQueue.shift();
    if (!id) return;
    if (!state.beatsSeen.includes(id)) state.beatsSeen.push(id);
    state.sfx.push({ type: 'beatDismiss', id });
    bump(state);
  },

  applyBeatEffects(state, cfg, arg) {
    // Called by the loop with the beat's effects object at dismiss time.
    const fx = arg && arg.effects;
    if (!fx) return;
    if (fx.showTap) state.tapShown = true;
    if (fx.revealTiptoe) state.tiptoeShown = true;
    if (fx.act && fx.act > state.act) state.act = fx.act;
    if (fx.ending) state.ended = true;
    if (fx.postEnd) state.postEnd = true;
    bump(state);
  },

  openJournal(state) {
    state.journalOpens++;
    bump(state);
  },

  // Dev-panel reducers. Harmless in a free game; the panel is the only caller.
  devGrant(state, cfg, arg) {
    const n = Math.max(0, Number(arg && arg.n) || 0);
    state.teeth += n;
    state.lifetime += n;
    bump(state);
  },
  devQueueBeat(state, cfg, arg) {
    if (!arg || !arg.id || state.beatQueue.includes(arg.id)) return;
    state.beatQueue.push(arg.id);
    bump(state);
  },
  devSet(state, cfg, arg) {
    if (!arg) return;
    if (typeof arg.belief === 'number') state.belief = Math.max(0, Math.min(100, arg.belief));
    if (typeof arg.stir === 'number') state.stir = Math.max(0, Math.min(100, arg.stir));
    if (typeof arg.notes === 'number') state.notes = Math.max(0, Math.floor(arg.notes));
    if (typeof arg.act === 'number') state.act = arg.act;
    bump(state);
  },
};

export function dispatch(state, cfg, action, arg) {
  const fn = ACTIONS[action];
  if (!fn) return false;
  const before = state.uiSeq;
  fn(state, cfg, arg);
  return state.uiSeq !== before;
}

export { nextCost, bulkCost, maxAffordable };
