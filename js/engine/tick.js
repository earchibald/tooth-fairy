// The deterministic tick. dt is TICK_MS; offline replay runs this same loop
// with scaled dtTicks, beats and wakes muted, and a rate factor applied —
// one code path, two behaviours proven by the same tests.

import {
  baseRatePerSec, beliefMult, pactNet, tiptoeFactor, multFactor,
  noiseLevel, hushCapacity, revealChecks, effectiveRatePerSec, contractMult,
} from './predicates.js';
import { UNIT_IDS, actAtLeast } from './state.js';
import { completeOutlineSet } from './actions.js';
import { mulberry32 } from './rng.js';

// Draws the night's contract board, deterministic from seed + night. Called
// at reveal and each dusk.
export function drawBoard(state, cfg, contracts) {
  if (!contracts) { state.contractBoard = []; return; }
  const eligible = contracts.pool.filter((c) => actAtLeast(state.act, c.minAct));
  const rand = mulberry32((state.seed ^ (state.night * 2654435761)) >>> 0);
  const deck = eligible.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.contractBoard = deck.slice(0, cfg.CONTRACTS.PER_NIGHT).map((c) => c.id);
  state.contractPicked = null;
  state.contractDone = false;
}

function completeContract(state, cfg, c, offline) {
  state.contractDone = true;
  state.contractStreak++;
  if (c.reward.belief) state.belief = Math.min(100, state.belief + c.reward.belief);
  if (c.reward.burstS) {
    const burst = effectiveRatePerSec(state, cfg) * c.reward.burstS;
    state.teeth += burst;
    state.lifetime += burst;
    state.nightStats.teeth += burst;
  }
  if (!offline) state.sfx.push({ type: 'contract', id: c.id, fragment: c.reward.fragment || null });
}

// Dawn: stamp the night, rest until dusk. Dusk: begin the next night.
function toDawn(state, cfg, offline, contracts) {
  if (contracts && state.contractPicked && !state.contractDone) {
    const c = contracts.pool.find((x) => x.id === state.contractPicked);
    const met = c && (
      (c.type === 'quiet' && state.nightStats.wakes === 0) ||
      (c.type === 'calm' && state.stir < c.n));
    if (met) completeContract(state, cfg, c, offline);
    else state.contractStreak = 0;   // an accepted, failed contract breaks the streak
  }
  state.nightPhase = 'dawn';
  state.duskGapS = cfg.NIGHT.MIN_GAP_S;
  state.bargeManifest = state.nightStats.teeth;
  state.nightLedger.push({
    night: state.night,
    teeth: Math.floor(state.nightStats.teeth),
    wakes: state.nightStats.wakes,
    contractsDone: state.contractDone ? 1 : 0,
    sailed: (state.units.barge || 0) > 0,
  });
  if (state.nightLedger.length > cfg.NIGHT.LEDGER_CAP) state.nightLedger.shift();
  if (!offline) state.sfx.push({ type: 'dawn' });
}

function toDusk(state, cfg, offline, contracts) {
  const barges = state.units.barge || 0;
  if (barges > 0 && state.bargeManifest > 0) {
    const def = cfg.UNITS.barge;
    const frac = Math.min(def.manifestCap,
      def.manifestFrac * barges * Math.pow(2, state.mults.barge || 0) *
      (state.upgrades.manifestii ? cfg.UPGRADES.manifestii.manifestMult : 1));
    const lump = state.bargeManifest * frac;
    state.teeth += lump;
    state.lifetime += lump;
    state.sailings++;
    if (!offline) state.sfx.push({ type: 'sail', amount: lump });
  }
  state.bargeManifest = 0;
  state.night++;
  state.nightPhase = 'night';
  state.nightTicksLeft = cfg.NIGHT.LENGTH_TICKS;
  state.nightStats = { teeth: 0, wakes: 0, notes: 0, tiptoes: 0 };
  drawBoard(state, cfg, contracts);
  if (!offline) state.sfx.push({ type: 'dusk' });
}

function triggerMet(state, cfg, trig) {
  switch (trig.type) {
    case 'start': return true;
    case 'afterBeat': return state.beatsSeen.includes(trig.id);
    case 'outline': return state.outline.setsDone >= trig.set;
    case 'lifetime': return state.lifetime >= trig.value && actAtLeast(state.act, trig.minAct || 0);
    case 'buy': return state.buys[trig.unit] >= trig.count;
    case 'upgrade': return !!state.upgrades[trig.id];
    case 'loom': return state.loom >= trig.level;
    case 'wake': return state.wakes >= trig.count;
    case 'noteRead': return state.notesRead >= trig.count;
    case 'stirReveal': return state.stirShown;
    case 'taps': return state.taps >= trig.count;
    case 'tiptoes': return state.tiptoes >= trig.count;
    case 'night': return state.night >= trig.count;
    case 'sailings': return state.sailings >= trig.count;
    // The player summons the wall: the ending needs the ministry (monotone,
    // never spendable-down) plus a lifetime cushion, so it is caused, not waited for.
    case 'ending': return state.buys.ministry >= 1 && state.lifetime >= cfg.ENDING.LIFETIME;
    default: return false;
  }
}

export function tick(state, cfg, script, opts) {
  const dtTicks = (opts && opts.dtTicks) || 1;
  const offline = !!(opts && opts.offline);
  const rateFactor = (opts && opts.rateFactor !== undefined) ? opts.rateFactor : 1;
  const contracts = opts && opts.contracts;
  const dt = (cfg.TICK_MS / 1000) * dtTicks;

  state.tick += dtTicks;

  if (state.nightShown && state.contractBoard.length === 0 &&
      state.contractPicked === null && state.nightPhase === 'night' && contracts) {
    drawBoard(state, cfg, contracts);
  }

  const atDawn = state.nightShown && state.nightPhase === 'dawn';
  if (atDawn) {
    state.duskGapS -= dt;
    if (state.duskGapS <= 0) toDusk(state, cfg, offline, contracts);
  }

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
                   def.afterglowFrac * multFactor(state, 'sprite', cfg);
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
  const ferryStunned = state.stunUnit === 'ferry' && state.stunTicks > 0;
  if (state.units.ferry > 0 && cfg.UNITS.ferry.lumpEveryTicks > 0 && !ferryStunned) {
    state.ferryPhase += dtTicks;
    const def = cfg.UNITS.ferry;
    while (state.ferryPhase >= def.lumpEveryTicks) {
      state.ferryPhase -= def.lumpEveryTicks;
      lump += def.lumpAmount * state.units.ferry * multFactor(state, 'ferry', cfg);
      ferrySpike = def.noiseSpike * state.units.ferry;
      if (!offline) state.sfx.push({ type: 'ferry' });
    }
  } else if (state.units.ferry === 0) {
    state.ferryPhase = 0;
  }

  if (atDawn) { lump = 0; burst = 0; ferrySpike = 0; }

  // Production.
  const continuous = atDawn ? 0 : baseRatePerSec(state, cfg) * dt;
  const produced = (continuous + lump + burst) *
    beliefMult(state) * pactNet(state, cfg) * tiptoeFactor(state, cfg) *
    contractMult(state, cfg) * rateFactor;
  if (produced > 0) {
    state.teeth += produced;
    state.lifetime += produced;
    if (!offline) state.sfx.push({ type: 'income', amount: produced });
  }

  if (produced > 0) state.nightStats.teeth += produced;

  // Productive ticks burn the night; idle ones do not.
  if (state.nightShown && state.nightPhase === 'night' &&
      (produced > 0 || state.tapsThisTick > 0)) {
    state.nightTicksLeft -= dtTicks;
    if (state.nightTicksLeft <= 0) toDawn(state, cfg, offline, contracts);
  }

  // Threshold contracts complete mid-night, judged against this night's stats.
  if (contracts && state.contractPicked && !state.contractDone) {
    const c = contracts.pool.find((x) => x.id === state.contractPicked);
    const ns = state.nightStats;
    const met = c && (
      (c.type === 'gather' && ns.teeth >= c.n) ||
      (c.type === 'notes' && ns.notes >= c.n) ||
      (c.type === 'tiptoes' && ns.tiptoes >= c.n));
    if (met) completeContract(state, cfg, c, offline);
  }

  // Helpers fill the stage outline too: each whole automated tooth fills a
  // slot, capped per tick so a huge rate reads as a steady pour, not a strobe.
  // Excess whole teeth are dropped — the fill is feedback, not a ledger.
  if (!offline && produced > 0 && state.tapShown && !state.ended) {
    state.outlineAccum += produced;
    let fill = Math.floor(state.outlineAccum);
    state.outlineAccum -= fill;
    fill = Math.min(fill, cfg.OUTLINE.HELPER_FILL_CAP);
    while (fill > 0) {
      const take = Math.min(fill, state.outline.size - state.outline.filled);
      state.outline.filled += take;
      fill -= take;
      if (state.outline.filled >= state.outline.size) completeOutlineSet(state, cfg);
      else if (take === 0) break;
    }
  }

  // Notes accrue while the operation moves.
  const active = produced > 0 || state.tapsThisTick > 0;
  if (active && state.act >= 1) {
    state.noteAccumS += dt;
    if (state.noteAccumS >= cfg.NOTES.EVERY_S) {
      state.noteAccumS -= cfg.NOTES.EVERY_S;
      // The pillow only holds so many: an inventory cap keeps a long absence
      // from banking hours of belief.
      state.notes = Math.min(cfg.NOTES.CAP, state.notes + 1);
      state.notesShown = true;
      if (!offline) state.sfx.push({ type: 'noteArrive' });
    }
  }

  // Stir and wakes. Stir never moves before its meter is revealed — a meter
  // the player has not been shown must not be punishing them invisibly.
  const noise = noiseLevel(state, cfg) + ferrySpike;
  const hush = hushCapacity(state, cfg);
  if (!state.stirShown && noise >= cfg.STIR.REVEAL_NOISE) state.stirShown = true;
  if (state.settleTicks > 0) {
    state.settleTicks = Math.max(0, state.settleTicks - dtTicks);
  } else if (state.stirShown) {
    if (noise > hush && !offline) {
      // Offline never accrues stir — otherwise "offline never wakes a house"
      // would only defer the wake to the first tick after the return screen.
      state.stir = Math.min(100, state.stir + (noise - hush) * cfg.STIR.RATE * dt);
    } else {
      state.stir = Math.max(0, state.stir - cfg.STIR.FALL_RATE * dt);
    }
  }

  // The sandman tiptoes for you: paid automation of the free ugly verb.
  if (!offline && state.upgrades.sandman && state.stirShown &&
      state.stir >= cfg.TIPTOE.SANDMAN_AT && state.tiptoeTicks === 0 &&
      state.settleTicks === 0) {
    state.tiptoeTicks = cfg.TIPTOE.TICKS;
    state.tiptoes++;
    state.sfx.push({ type: 'tiptoe', auto: true });
  }

  const wakeAt = state.wakes === 0 ? cfg.STIR.FIRST_WAKE_AT : cfg.STIR.WAKE_AT;
  if (!offline && state.stirShown && state.stir >= wakeAt) {
    let worst = null;
    let worstNoise = 0;
    for (const u of UNIT_IDS) {
      const n = cfg.UNITS[u].noise * state.units[u];
      if (n > worstNoise) { worstNoise = n; worst = u; }
    }
    state.wakes++;
    state.nightStats.wakes++;
    state.belief = Math.max(0, state.belief - cfg.STIR.WAKE_BELIEF_COST);
    state.stir = cfg.STIR.WAKE_RESET;
    state.settleTicks = cfg.STIR.SETTLE_TICKS;
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

// Offline catch-up: the same tick loop. Time (nights, dusk gaps) always
// passes for the full absence; EARNINGS require the ledger and its caps.
export function runOffline(state, cfg, script, elapsedS, contracts) {
  if (elapsedS < 10) return { teeth: 0, seconds: 0 };
  const capHours = state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineCapHours
    : state.upgrades.nightledger ? cfg.UPGRADES.nightledger.offlineCapHours
    : state.upgrades.dreamledger ? cfg.UPGRADES.dreamledger.offlineCapHours : 0;
  const rate = !state.upgrades.dreamledger ? 0
    : state.upgrades.lucidcontract ? cfg.UPGRADES.lucidcontract.offlineRate
    : cfg.UPGRADES.dreamledger.offlineRate;
  const earnS = Math.min(elapsedS, capHours * 3600);
  const totalTicks = Math.floor(elapsedS / (cfg.TICK_MS / 1000));
  if (totalTicks < 1) return { teeth: 0, seconds: 0 };
  const steps = Math.min(cfg.OFFLINE.MAX_STEPS, totalTicks);
  const dtScale = totalTicks / steps;
  const earnTicks = Math.floor(earnS / (cfg.TICK_MS / 1000));
  const before = state.teeth;
  state.offlineReplay = true;
  let done = 0;
  for (let i = 0; i < steps; i++) {
    const stillEarning = done < earnTicks;
    tick(state, cfg, script, {
      dtTicks: dtScale, offline: true, rateFactor: stillEarning ? rate : 0, contracts,
    });
    done += dtScale;
  }
  state.offlineReplay = false;
  state.sfx = [];
  return { teeth: state.teeth - before, seconds: earnS };
}
