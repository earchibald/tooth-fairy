// Every player-visible name and label outside the story script.
// One term, one casing, everywhere — the UI reads only from here.
// The dev panel's Names tab edits an override layer over these defaults.

export const NAME_DEFAULTS = Object.freeze({
  units: Object.freeze({
    scout:    Object.freeze({ name: 'TOOTH SCOUT',       flavor: 'checks under pillows. mostly finds socks.' }),
    mouse:    Object.freeze({ name: 'PILLOW MOUSE',      flavor: 'an old colleague from madrid. very professional.' }),
    sprite:   Object.freeze({ name: 'MAYFLY SPRITE',     flavor: 'burns bright. burns out. knows it. does not care.' }),
    phantom:  Object.freeze({ name: 'FLOSS PHANTOM',     flavor: 'makes no sound at all. charges accordingly.' }),
    ferry:    Object.freeze({ name: 'TOOTH FERRY',       flavor: 'yes, it is spelled like that. no, nobody laughs anymore.' }),
    pact:     Object.freeze({ name: 'PARENT PACT',       flavor: 'they were doing it anyway. now it is official.' }),
    ministry: Object.freeze({ name: 'MINISTRY OF MOLARS', flavor: 'form 32-b: request for additional night.' }),
  }),
  upgrades: Object.freeze({
    babyfae:      Object.freeze({ name: 'BABY FAE',        flavor: 'small. eager. counts on her fingers. two per tap now.' }),
    pincers:      Object.freeze({ name: 'POLISHED PINCERS', flavor: 'the grip of a professional.' }),
    tweezers:     Object.freeze({ name: 'SILVER TWEEZERS',  flavor: 'surgical. gleaming. slightly show-offy.' }),
    gloves:       Object.freeze({ name: 'MOONLIT GLOVES',   flavor: 'woven from the quiet part of the night.' }),
    starlight:    Object.freeze({ name: 'STARLIGHT FINGERS', flavor: 'each tap borrows a little from the whole operation.' }),
    afterglow:    Object.freeze({ name: 'AFTERGLOW',        flavor: 'a sprite that ends well leaves something behind.' }),
    sandman:      Object.freeze({ name: 'SANDMAN CONTRACT', flavor: 'he tiptoes so you do not have to.' }),
    dreamledger:  Object.freeze({ name: 'DREAM LEDGER',     flavor: 'the night keeps its own books while you are gone.' }),
    nightledger:  Object.freeze({ name: 'NIGHT LEDGER',     flavor: 'a bigger book. a longer night.' }),
    lucidcontract:Object.freeze({ name: 'LUCID CONTRACT',   flavor: 'the dream signs for itself now.' }),
  }),
  loom: Object.freeze({ name: 'LULLABY LOOM', flavor: 'weaves a hush you can stack.' }),
  multName: 'apiece',            // threshold upgrade label suffix: "×2 apiece"
  multNames: Object.freeze({
    scout: 'SCOUT GOGGLES', mouse: 'MOUSE MAPS', sprite: 'BRIGHTER WICKS',
    phantom: 'DEEPER SILENCE', ferry: 'SECOND DECK', pact: 'PHONE TREE',
    ministry: 'ANNEX WING',
  }),
  verbs: Object.freeze({
    tiptoe: 'TIPTOE', readNote: 'READ A NOTE', journal: 'JOURNAL',
  }),
  meters: Object.freeze({
    teeth: 'TEETH', notes: 'notes', belief: 'BELIEF', stir: 'STIR',
    perSec: '/s',
  }),
  ui: Object.freeze({
    buy: 'gather', level: 'lv', owned: 'roaming', cost: 'costs',
    offlineTitle: 'while you were gone',
    offlineButton: 'good work everyone',
    settings: 'settings', reset: 'forget everything', resetConfirm: 'type FORGET to confirm',
    exportSave: 'copy the night', importSave: 'restore a night',
    mute: 'hush the sounds', endingContinue: 'the sky keeps filling',
    wakeAside: 'someone woke. belief slips. {unit} lies low.',
    tiptoeHint: 'half speed, half noise, fifteen seconds. always allowed. never pretty.',
  }),
});

// Deep-copies defaults into a live-mutable object; unknown keys ignored.
function merge(defaults, overrides) {
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  if (Array.isArray(defaults)) return defaults.slice();
  const out = {};
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (d && typeof d === 'object') out[k] = merge(d, src[k]);
    else out[k] = (k in src) ? src[k] : d;
  }
  return out;
}

export function buildNames(overrides) {
  return merge(NAME_DEFAULTS, overrides);
}
