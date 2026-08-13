// The deterministic tick. dt is TICK_MS; offline replay runs this same loop
// with scaled dtTicks, beats and wakes muted, and a rate factor applied —
// one code path, two behaviours proven by the same tests.

import {
  baseRatePerSec, beliefMult, pactNet, tiptoeFactor, multFactor,
  noiseLevel, hushCapacity, revealChecks,
} from './predicates.js';
import { UNIT_IDS } from './state.js';

function triggerMet(state, cfg, trig) {
  switch (trig.type) {
    case 'start': return true;
    case 'afterBeat': return state.beatsSeen.includes(trig.id);
    case 'outline': return state.outline.setsDone >= trig.set;
    case 'lifetime': return state.lifetime >= trig.value;
    case 'buy': return state.buys[trig.unit] >= trig.count;
    case 'upgrade': return !!state.upgrades[trig.id];
    case 'loom': return state.loom >= trig.level;
    case 'wake': return state.wakes >= trig.count;
    case 'noteRead': return state.notesRead >= trig.count;
    case 'stirReveal': return state.stirShown;
    case 'taps': return state.taps >= trig.count;
    case 'tiptoes': return state.tiptoes >= trig.count;
    // The player summons the wall: the ending needs the ministry (monotone,
    // never spendable-down) plus a lifetime cushion, so it is caused, not waited for.
    case 'ending': return state.buys.ministry >= 1 && state.lifetime >= cfg.ENDING.LIFETIME;
    default: return false;
  }
}

export function tick(state, cfg, script, opts) {
  const dtTicks = (opts && opts.dtTicks) || 1;
  const offline = !!(opts && opts.offline);
  const rateFactor = (opts && opts.rateFactor) || 1;
  const dt = (cfg.TICK_MS / 1000) * dtTicks;

  state.tick += dtTicks;

  // Sprites expire; afterglow pays half their lifetime yield as a burst.
  let burst = 0;
  if (state.spriteExpiries.length) {
    const def = cfg.UNITS.sprite;
    const still = [];
    for (const at of state.spriteExpiries) {
      if (at <= state.tick) {
        state.units.sprite = Math.max(0, state.units.sprite - 1);
        if (state.upgrades.afterglow) {
          burst += def.rate * (def.lifeTicks * cfg.TICK_MS / 1000) *
                   def.afterglowFrac * multFactor(state, 'sprite');
        }
        if (!offline) state.sfx.push({ type: 'expire' });
      } else {
        still.push(at);
      }
    }
    state.spriteExpiries = still;
  }

  // Ferry docks on a fixed cadence and delivers a lump.
  let lump = 0;
  let ferrySpike = 0;
  if (state.units.ferry > 0) {
    state.ferryPhase += dtTicks;
    const def = cfg.UNITS.ferry;
    while (state.ferryPhase >= def.lumpEveryTicks) {
      state.ferryPhase -= def.lumpEveryTicks;
      lump += def.lumpAmount * state.units.ferry * multFactor(state, 'ferry');
      ferrySpike = def.noiseSpike * state.units.ferry;
      if (!offline) state.sfx.push({ type: 'ferry' });
    }
  } else {
    state.ferryPhase = 0;
  }

  // Production.
  const continuous = baseRatePerSec(state, cfg) * dt;
  const produced = (continuous + lump + burst) *
    beliefMult(state) * pactNet(state, cfg) * tiptoeFactor(state, cfg) * rateFactor;
  if (produced > 0) {
    state.teeth += produced;
    state.lifetime += produced;
    if (!offline) state.sfx.push({ type: 'income', amount: produced });
  }

  // Notes accrue while the operation moves.
  const active = produced > 0 || state.tapsThisTick > 0;
  if (active && state.act >= 1) {
    state.noteAccumS += dt;
    if (state.noteAccumS >= cfg.NOTES.EVERY_S) {
      state.noteAccumS -= cfg.NOTES.EVERY_S;
      state.notes++;
      state.notesShown = true;
      if (!offline) state.sfx.push({ type: 'noteArrive' });
    }
  }

  // Stir and wakes.
  const noise = noiseLevel(state, cfg) + ferrySpike;
  const hush = hushCapacity(state, cfg);
  if (noise > hush) {
    state.stir = Math.min(100, state.stir + (noise - hush) * cfg.STIR.RATE * dt);
  } else {
    state.stir = Math.max(0, state.stir - cfg.STIR.FALL_RATE * dt);
  }
  if (!state.stirShown && noise >= cfg.STIR.REVEAL_NOISE) state.stirShown = true;

  const wakeAt = state.wakes === 0 ? cfg.STIR.FIRST_WAKE_AT : cfg.STIR.WAKE_AT;
  if (!offline && state.stir >= wakeAt) {
    let worst = null;
    let worstNoise = 0;
    for (const u of UNIT_IDS) {
      const n = cfg.UNITS[u].noise * state.units[u];
      if (n > worstNoise) { worstNoise = n; worst = u; }
    }
    state.wakes++;
    state.belief = Math.max(0, state.belief - cfg.STIR.WAKE_BELIEF_COST);
    state.stir = cfg.STIR.WAKE_RESET;
    if (worst) { state.stunUnit = worst; state.stunTicks = cfg.STIR.STUN_TICKS; }
    state.sfx.push({ type: 'wake', unit: worst });
  }
  if (state.stunTicks > 0) {
    state.stunTicks = Math.max(0, state.stunTicks - dtTicks);
    if (state.stunTicks === 0) state.stunUnit = null;
  }
  if (state.tiptoeTicks > 0) state.tiptoeTicks = Math.max(0, state.tiptoeTicks - dtTicks);

  // Belief drifts home; quiet productive streaks build it.
  state.belief += (50 - state.belief) * cfg.BELIEF.DRIFT_PER_S * dt;
  if (noise <= hush && produced > 0 && state.belief < cfg.BELIEF.STREAK_CAP) {
    state.belief = Math.min(cfg.BELIEF.STREAK_CAP, state.belief + cfg.BELIEF.STREAK_PER_S * dt);
  }
  if (!state.beliefShown && state.act >= 2) state.beliefShown = true;

  // Sticky reveals: evaluate once, celebrate arrivals.
  const checks = revealChecks(state, cfg);
  for (const key of Object.keys(checks)) {
    if (checks[key] && !state.revealed[key]) {
      state.revealed[key] = true;
      if (!offline) state.sfx.push({ type: 'reveal', key });
    }
  }

  // Story triggers (never offline).
  if (!offline) {
    for (const beat of script.beats) {
      if (state.beatsSeen.includes(beat.id) || state.beatQueue.includes(beat.id)) continue;
      if (triggerMet(state, cfg, beat.trigger)) state.beatQueue.push(beat.id);
    }
    for (const aside of script.asides) {
      if (state.asidesSeen.includes(aside.id)) continue;
      if (triggerMet(state, cfg, aside.trigger)) {
        state.asidesSeen.push(aside.id);
        state.sfx.push({ type: 'aside', id: aside.id });
      }
    }
  }

  state.tapsThisTick = 0;
  state.uiSeq++;
}

// Offline catch-up: the same tick loop, capped in steps and by the ledger cap.
export function runOffline(state, cfg, script, elapsedS) {
  if (!state.upgrades.dreamledger || elapsedS < 10) return { teeth: 0, seconds: 0 };
  const capHours = state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineCapHours
    : state.upgrades.nightledger ? cfg.UPGRADES.nightledger.offlineCapHours
    : cfg.UPGRADES.dreamledger.offlineCapHours;
  const rate = state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineRate
    : cfg.UPGRADES.dreamledger.offlineRate;
  const effS = Math.min(elapsedS, capHours * 3600);
  const totalTicks = Math.floor(effS / (cfg.TICK_MS / 1000));
  if (totalTicks < 1) return { teeth: 0, seconds: 0 };
  const steps = Math.min(cfg.OFFLINE.MAX_STEPS, totalTicks);
  const dtScale = totalTicks / steps;
  const before = state.teeth;
  state.offlineReplay = true;
  for (let i = 0; i < steps; i++) {
    tick(state, cfg, script, { dtTicks: dtScale, offline: true, rateFactor: rate });
  }
  state.offlineReplay = false;
  state.sfx = [];
  return { teeth: state.teeth - before, seconds: effS };
}
