// One flat JSON-serializable state object. Reducers and tick mutate it;
// nothing else does. `sfx` is a transient event queue the renderer drains —
// feedback fires on effect, never on intent.

export const UNIT_IDS = ['scout', 'mouse', 'bunny', 'sprite', 'phantom', 'owl',
  'ferry', 'barge', 'pact', 'ministry', 'starwrights'];

// Acts progress in story order, not numeric order: the river (25) sits
// between act 2 and act 3, so raw `>=` comparisons break across that
// boundary (25 > 3). Use these wherever "at least act N" or "raise the
// act" logic needs the STORY order rather than the numeric value.
export const ACT_ORDER = [0, 1, 2, 25, 3];
export function actRank(act) {
  const i = ACT_ORDER.indexOf(act);
  return i === -1 ? act : i;
}
export function actAtLeast(act, min) {
  return actRank(act) >= actRank(min);
}

const zeroUnits = () => Object.fromEntries(UNIT_IDS.map((u) => [u, 0]));

export function createState(seed = 1) {
  return {
    v: 2,
    seed: seed >>> 0 || 1,
    rngState: seed >>> 0 || 1,
    tick: 0,
    act: 0,

    teeth: 0,
    lifetime: 0,
    taps: 0,
    tapsThisTick: 0,

    notes: 0,
    notesRead: 0,
    noteAccumS: 0,
    noteIdx: 0,
    notesShown: false,

    belief: 50,
    beliefShown: false,

    stir: 0,
    stirShown: false,
    wakes: 0,
    settleTicks: 0,           // post-wake grace: the house re-settles, stir frozen
    stunUnit: null,
    stunTicks: 0,

    tiptoeTicks: 0,
    tiptoes: 0,
    tiptoeShown: false,

    units: zeroUnits(),
    buys: zeroUnits(),          // lifetime purchases (sprite owned decays; buys never)
    spriteExpiries: [],         // absolute expiry ticks
    ferryPhase: 0,
    mults: zeroUnits(),         // ×2 springboard tiers bought per unit
    upgrades: {},               // flag id -> true
    loom: 0,

    revealed: {},               // sticky card reveals, id -> true
    tapShown: false,
    counterShown: false,

    outline: { size: 1, filled: 0, setsDone: 0 },
    outlineAccum: 0,            // fractional helper teeth waiting to fill an outline slot

    night: 1,
    nightPhase: 'night',
    nightShown: false,
    nightTicksLeft: 0,          // set from cfg at reveal and at each dusk
    duskGapS: 0,
    nightStats: { teeth: 0, wakes: 0, notes: 0, tiptoes: 0 },
    pactsTonight: 0,           // a signature is a ceremony, not a bulk buy: max 1/night
    nightLedger: [],
    sailings: 0,                // lifetime completed sailings (river act)
    bargeManifest: 0,           // teeth logged for the barge this night

    contractBoard: [],
    contractPicked: null,
    contractDone: false,
    contractStreak: 0,

    beatsSeen: [],
    beatQueue: [],
    asidesSeen: [],
    journalOpens: 0,

    ended: false,
    postEnd: false,
    offlineReplay: false,

    uiSeq: 0,
    sfx: [],
  };
}

export function serialize(state) {
  return JSON.stringify({ v: state.v, savedAt: Date.now(), state });
}

// Normalizing deserialize: missing fields take fresh-state defaults so old
// saves always load. Returns null over throwing.
export function deserialize(raw) {
  try {
    const wrapped = JSON.parse(raw);
    if (!wrapped || typeof wrapped !== 'object' || !wrapped.state) return null;
    const fresh = createState(wrapped.state.seed || 1);
    const s = { ...fresh, ...wrapped.state };
    s.units = { ...fresh.units, ...(wrapped.state.units || {}) };
    s.buys = { ...fresh.buys, ...(wrapped.state.buys || {}) };
    s.mults = { ...fresh.mults, ...(wrapped.state.mults || {}) };
    s.upgrades = { ...(wrapped.state.upgrades || {}) };
    s.revealed = { ...(wrapped.state.revealed || {}) };
    s.outline = { ...fresh.outline, ...(wrapped.state.outline || {}) };
    s.spriteExpiries = Array.isArray(wrapped.state.spriteExpiries) ? wrapped.state.spriteExpiries : [];
    s.nightStats = { ...fresh.nightStats, ...(wrapped.state.nightStats || {}) };
    s.nightLedger = Array.isArray(wrapped.state.nightLedger) ? wrapped.state.nightLedger : [];
    s.beatsSeen = Array.isArray(wrapped.state.beatsSeen) ? wrapped.state.beatsSeen : [];
    s.beatQueue = Array.isArray(wrapped.state.beatQueue) ? wrapped.state.beatQueue : [];
    s.asidesSeen = Array.isArray(wrapped.state.asidesSeen) ? wrapped.state.asidesSeen : [];
    s.contractBoard = Array.isArray(wrapped.state.contractBoard) ? wrapped.state.contractBoard : [];
    s.sfx = [];               // never replay feedback from a save
    s.tapsThisTick = 0;
    s.offlineReplay = false;
    if ((wrapped.state.v || 1) < 2) {
      s.v = 2;
      if (s.act >= 1) {
        if (!s.beatQueue.includes('mig-nights')) s.beatQueue.push('mig-nights');
        // A migrated act>=1 save that already saw a2-hush would otherwise queue
        // both mig-nights (above) and, on the next tick, a2-night (its
        // afterBeat a2-hush trigger is already satisfied) — two back-to-back
        // revealNight beats. Mark the ordinary reveal beat seen so it never
        // fires; mig-nights alone carries the reveal for migrated saves.
        if (!s.beatsSeen.includes('a2-night')) s.beatsSeen.push('a2-night');
      }
    }
    return { state: s, savedAt: wrapped.savedAt || Date.now() };
  } catch {
    return null;
  }
}
