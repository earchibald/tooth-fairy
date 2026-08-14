// Every player-visible name and label outside the story script.
// One term, one casing, everywhere — the UI reads only from here.
// The dev panel's Names tab edits an override layer over these defaults.

export const NAME_DEFAULTS = Object.freeze({
  units: Object.freeze({
    scout:    Object.freeze({ name: 'TOOTH SCOUT',       flavor: 'checks under pillows. mostly finds socks.' }),
    mouse:    Object.freeze({ name: 'PILLOW MOUSE',      flavor: 'an old colleague from madrid. very professional.' }),
    bunny:    Object.freeze({ name: 'DUST BUNNY',        flavor: 'lives under the bed. always has. finally on payroll.' }),
    sprite:   Object.freeze({ name: 'MAYFLY SPRITE',     flavor: 'burns bright. burns out. knows it. does not care.' }),
    phantom:  Object.freeze({ name: 'FLOSS PHANTOM',     flavor: 'makes no sound at all. charges accordingly.' }),
    owl:      Object.freeze({ name: 'ATTIC OWL',         flavor: 'sees everything. says nothing. bills monthly.' }),
    ferry:    Object.freeze({ name: 'TOOTH FERRY',       flavor: 'yes, it is spelled like that. no, nobody laughs anymore.' }),
    barge:    Object.freeze({ name: 'MOLAR BARGE',       flavor: 'sails at dawn with the night\'s manifest. pays on return.' }),
    pact:     Object.freeze({ name: 'PARENT PACT',       flavor: 'they were doing it anyway. now it is official.' }),
    ministry: Object.freeze({ name: 'MINISTRY OF MOLARS', flavor: 'form 32-b: request for additional night.' }),
    starwrights: Object.freeze({ name: 'STARWRIGHTS',    flavor: 'they take the teeth upstairs. don\'t ask about the ladder.' }),
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
    sockradar:    Object.freeze({ name: 'SOCK RADAR',        flavor: 'filters the false positives. scouts weep with gratitude.' }),
    madrid:       Object.freeze({ name: 'MADRID CONNECTIONS', flavor: 'she made some calls. do not ask on which phone.' }),
    encore:       Object.freeze({ name: 'ENCORE',            flavor: 'the mayflies negotiated a longer forever.' }),
    feltslippers: Object.freeze({ name: 'FELT SLIPPERS',     flavor: 'the phantoms were already silent. now they are smug about it.' }),
    lighthouse:   Object.freeze({ name: 'LIGHTHOUSE MOTH',   flavor: 'guides the ferries. paid in porchlight.' }),
    manifestii:   Object.freeze({ name: 'MANIFEST, PART II', flavor: 'the barge found a second hold. do not ask where.' }),
    notary:       Object.freeze({ name: 'NIGHT NOTARY',      flavor: 'stamps twice. legally distinct thumps.' }),
    annexforms:   Object.freeze({ name: 'ANNEX FORMS',       flavor: 'form 32-c: request for additional additional night.' }),
    moonclippers: Object.freeze({ name: 'MOON CLIPPERS',     flavor: 'crescent-shaped. self-sharpening. taps twice as deep.' }),
  }),
  loom: Object.freeze({ name: 'LULLABY LOOM', flavor: 'weaves a hush you can stack.' }),
  multName: 'apiece',            // threshold upgrade label suffix: "×2 apiece"
  multNames: Object.freeze({
    scout: 'SCOUT GOGGLES', mouse: 'MOUSE MAPS', bunny: 'BROOM DODGING',
    sprite: 'BRIGHTER WICKS', phantom: 'DEEPER SILENCE', owl: 'WIDER EYES',
    ferry: 'SECOND DECK', barge: 'DEEPER HOLD', pact: 'PHONE TREE',
    ministry: 'ANNEX WING', starwrights: 'TALLER LADDER',
  }),
  verbs: Object.freeze({
    tiptoe: 'TIPTOE', readNote: 'READ A NOTE', journal: 'JOURNAL',
  }),
  tabs: Object.freeze({ tonight: 'tonight', log: 'the log', roost: 'the roost' }),
  meters: Object.freeze({
    teeth: 'TEETH', notes: 'notes', belief: 'BELIEF', stir: 'STIR',
    noise: 'noise', hush: 'hush',
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
    stirHint: 'the crew makes noise. hush is how much the night absorbs. noise above hush builds STIR; at 100 someone wakes — belief drops and the loudest crew lies low. tiptoe halves noise. the loom raises hush.',
    beliefHint: 'belief scales every tooth: ×0.5 at 0, ×1.5 at 100. quiet productive nights and reading notes raise it. wakes cut it.',
    boardTitle: 'tonight’s jobs',
    roostNew: 'new at the roost — ',
    morningTitle: 'the morning after night {n}',
    duskIn: 'dusk in about {m} min',
    dawnSoon: 'dawn soon',
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
