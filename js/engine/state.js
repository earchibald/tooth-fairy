// One flat JSON-serializable state object. Reducers and tick mutate it;
// nothing else does. `sfx` is a transient event queue the renderer drains —
// feedback fires on effect, never on intent.

export const UNIT_IDS = ['scout', 'mouse', 'sprite', 'phantom', 'ferry', 'pact', 'ministry'];

const zeroUnits = () => ({ scout: 0, mouse: 0, sprite: 0, phantom: 0, ferry: 0, pact: 0, ministry: 0 });

export function createState(seed = 1) {
  return {
    v: 1,
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
    s.beatsSeen = Array.isArray(wrapped.state.beatsSeen) ? wrapped.state.beatsSeen : [];
    s.beatQueue = Array.isArray(wrapped.state.beatQueue) ? wrapped.state.beatQueue : [];
    s.asidesSeen = Array.isArray(wrapped.state.asidesSeen) ? wrapped.state.asidesSeen : [];
    s.sfx = [];               // never replay feedback from a save
    s.tapsThisTick = 0;
    s.offlineReplay = false;
    return { state: s, savedAt: wrapped.savedAt || Date.now() };
  } catch {
    return null;
  }
}
