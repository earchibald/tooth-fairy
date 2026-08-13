// The story. Pure data: no imports, no DOM, no functions in records.
// Registers: 'memory' (the fairy, lowercase, spare) · 'ledger' (fae bureaucracy,
// mono, counted) · responses are the player's voice (lowercase snark).
// Trigger types: start · afterBeat{id} · outline{set} · lifetime{value} ·
// buy{unit,count} · upgrade{id} · loom{level} · wake{count} · noteRead{count} ·
// stirReveal · ending
// A beat pauses the game until its response is pressed. Beats never fire offline.

export const SCRIPT_DEFAULTS = Object.freeze({
  beats: [
    // ---- ACT 0 · WHAT (opening, per original spec, verbatim where quoted) ----
    { id: 'a0-icon',  act: 0, register: 'memory', stage: 'icon', text: '',
      response: 'what', trigger: { type: 'start' } },
    { id: 'a0-few',   act: 0, register: 'memory', stage: 'few', text: '',
      response: 'what the', trigger: { type: 'afterBeat', id: 'a0-icon' } },
    { id: 'a0-pile',  act: 0, register: 'memory', stage: 'pile', text: '',
      response: '...', trigger: { type: 'afterBeat', id: 'a0-few' } },
    { id: 'a0-why',   act: 0, register: 'memory', text: '...teeth...',
      response: 'why do i want teeth', trigger: { type: 'afterBeat', id: 'a0-pile' },
      effects: { showTap: true } },
    { id: 'a0-fairy', act: 0, register: 'memory', text: 'fairy.',
      response: 'alright', trigger: { type: 'outline', set: 3 } },
    { id: 'a0-toothfairy', act: 0, register: 'memory', text: 'TOOTH. fairy.',
      response: 'yeah ok', trigger: { type: 'afterBeat', id: 'a0-fairy' } },
    { id: 'a0-getteeth', act: 0, register: 'memory', text: "Let's get some TEETH.",
      response: 'hell yeah', trigger: { type: 'afterBeat', id: 'a0-toothfairy' },
      effects: { act: 1 } },

    // ---- ACT 1 · THE ROUNDS ----
    { id: 'a1-babyfae', act: 1, register: 'memory',
      text: "there's a small one following me now. she has my eyes. one of them, anyway.",
      response: 'she can stay', trigger: { type: 'upgrade', id: 'babyfae' } },
    { id: 'a1-wings', act: 1, register: 'memory',
      text: 'wings. i had— have. wings. and apparently... staff.',
      response: 'good for you', trigger: { type: 'buy', unit: 'scout', count: 1 } },
    { id: 'a1-rounds', act: 1, register: 'memory',
      text: 'the rounds. that was the word. you do the rounds, you check the pillows, you keep the ledger.',
      response: 'the ledger?', trigger: { type: 'buy', unit: 'scout', count: 5 } },
    { id: 'a1-protocol', act: 1, register: 'memory',
      text: "pillow protocol: lift, don't slide. a slide makes a sound. a sound makes a morning.",
      response: 'noted', trigger: { type: 'lifetime', value: 300 } },
    { id: 'a1-coin', act: 1, register: 'memory',
      text: "you're supposed to leave something. a coin. i left a button once. she kept it. they keep everything.",
      response: 'classy', trigger: { type: 'lifetime', value: 800 } },
    { id: 'a1-flashlight', act: 1, register: 'memory',
      text: 'one of them sleeps with a flashlight under the pillow. waiting for me. i like that one.',
      response: 'noted', trigger: { type: 'buy', unit: 'mouse', count: 1 } },
    { id: 'a1-notes', act: 1, register: 'memory',
      text: "they leave notes. 'dear tooth fairy.' i can't read them yet. i will.",
      response: 'why not', trigger: { type: 'lifetime', value: 1500 } },

    // ---- ACT 2 · THE OPERATION ----
    { id: 'a2-stir', act: 2, register: 'memory',
      text: 'the houses are starting to stir. we are many now, and many is loud.',
      response: 'hush then', trigger: { type: 'stirReveal' }, effects: { act: 2 } },
    { id: 'a2-tiptoe', act: 2, register: 'memory',
      text: "i can tiptoe. we all can. it's slow and it's humiliating and it works.",
      response: 'tiptoe it is', trigger: { type: 'afterBeat', id: 'a2-stir' },
      effects: { revealTiptoe: true } },
    { id: 'a2-firstwake', act: 2, register: 'memory',
      text: 'the flashlight. i knew it would be the flashlight. small beam, big eyes. we regarded each other. i took the tooth anyway.',
      response: 'professional', trigger: { type: 'wake', count: 1 } },
    { id: 'a2-loom', act: 2, register: 'memory',
      text: 'the loom hums under the floorboards. the houses sleep deeper. the needles know a lullaby i almost remember.',
      response: 'almost?', trigger: { type: 'loom', level: 1 } },
    { id: 'a2-sprite', act: 2, register: 'memory',
      text: "the mayflies clock in knowing. ninety seconds of forever, they call it. i don't watch the end.",
      response: 'grim little guys', trigger: { type: 'buy', unit: 'sprite', count: 1 } },
    { id: 'a2-afterglow', act: 2, register: 'memory',
      text: 'now when they go, they go like sparklers. they asked for this. in writing.',
      response: 'in writing??', trigger: { type: 'upgrade', id: 'afterglow' } },
    { id: 'a2-ferry', act: 2, register: 'memory',
      text: 'yes. it is a ferry for teeth. the river was already there, which raises questions i am not asking.',
      response: 'fair enough', trigger: { type: 'buy', unit: 'ferry', count: 1 } },
    { id: 'a2-firstnote', act: 2, register: 'memory',
      text: "'dear tooth fairy. i know it's you. i won't tell.' ...huh.",
      response: 'kids are alright', trigger: { type: 'noteRead', count: 1 } },
    { id: 'a2-doorway', act: 2, register: 'memory',
      text: "there's someone in the doorway. tall. tired. holding a tooth between finger and thumb like it's evidence. they're not surprised to see me.",
      response: 'uh oh', trigger: { type: 'lifetime', value: 800000 } },

    // ---- ACT 3 · THE FOLD ----
    { id: 'a3-fold', act: 3, register: 'memory',
      text: "they've known. of course they've known. who did i think moved the pillow back? who left the porch light off on purpose?",
      response: 'the parents', trigger: { type: 'lifetime', value: 1000000 },
      effects: { act: 3 } },
    { id: 'a3-firstpact', act: 3, register: 'memory',
      text: "the first signature is neat. careful. grown-up. they kept the flashlight, you know. it's on the nightstand now. for their kid.",
      response: 'oh.', trigger: { type: 'buy', unit: 'pact', count: 1 } },
    { id: 'a3-ledger', act: 3, register: 'ledger',
      text: 'pact registered. houses: 3. stir: falling. the ministry sends its regards and form 32-b.',
      response: 'bureaucracy!', trigger: { type: 'buy', unit: 'pact', count: 3 } },
    { id: 'a3-phonetree', act: 3, register: 'memory',
      text: "they have a phone tree. they had it before phones. i don't ask what it was a tree of.",
      response: "don't ask", trigger: { type: 'buy', unit: 'pact', count: 5 } },
    { id: 'a3-ministry', act: 3, register: 'memory',
      text: "the ministry always existed. i just kept losing the door. it's behind the coats. it was always behind the coats.",
      response: 'naturally', trigger: { type: 'buy', unit: 'ministry', count: 1 } },

    // ---- ENDING ----
    { id: 'end-remember', act: 3, register: 'memory',
      text: "i remember what they're for now. come see.",
      response: 'show me', trigger: { type: 'ending' }, effects: { ending: true } },
    { id: 'end-sky', act: 3, register: 'memory',
      text: 'every tooth becomes a star. it always did. the sky is the ledger, and the ledger is full of children who grew up brave enough to lose things. keep going. there is room.',
      response: 'keep going', trigger: { type: 'afterBeat', id: 'end-remember' },
      effects: { postEnd: true } },
  ],

  // One-shot stage asides: non-pausing, fade after a beat's read time.
  asides: [
    { id: 'as-scout2',  trigger: { type: 'buy', unit: 'scout', count: 2 },
      text: 'two of them compare socks.' },
    { id: 'as-scout10', trigger: { type: 'buy', unit: 'scout', count: 10 },
      text: 'the scouts have a union now. their demands are reasonable.' },
    { id: 'as-scout25', trigger: { type: 'buy', unit: 'scout', count: 25 },
      text: 'the scouts hold a jamboree. attendance: mandatory. fun: also mandatory.' },
    { id: 'as-mouse5',  trigger: { type: 'buy', unit: 'mouse', count: 5 },
      text: 'the mice have opinions about the scouts.' },
    { id: 'as-sprite10', trigger: { type: 'buy', unit: 'sprite', count: 10 },
      text: 'the mayflies hold tiny retirement parties. constantly.' },
    { id: 'as-ferry5',  trigger: { type: 'buy', unit: 'ferry', count: 5 },
      text: 'the ferries form a modest armada. the river copes.' },
    { id: 'as-tap1000', trigger: { type: 'taps', count: 1000 },
      text: 'your tapping finger has developed a reputation.' },
    { id: 'as-tiptoe3', trigger: { type: 'tiptoes', count: 3 },
      text: 'you are getting good at the humiliating part.' },
  ],

  // Idle whispers: ambient stage lines, per act. Small pools, no filler.
  whispers: {
    1: ['a window, unlatched, on purpose.',
        'somewhere a molar wiggles.',
        'sock. sock. sock. tooth.',
        'the moon keeps minutes.'],
    2: ['the houses breathe slow.',
        'a nightlight negotiates with the dark.',
        'the ferry horn, one town over. softly.',
        'ninety seconds of forever.'],
    3: ['the phone tree rustles.',
        'a porch light goes dark, politely.',
        'form 32-b, in triplicate.',
        'the sky is patient.'],
  },

  // Notes the children leave. READ A NOTE shows the next one; recycles.
  notes: [
    "dear tooth fairy. i know it's you. i won't tell.",
    'dear tooth fairy. this one has a filling. sorry.',
    "dear tooth fairy. my brother says you're not real. his tooth is under his pillow. do your worst.",
    'dear tooth fairy. i pulled it myself. invoice attached.',
    'dear tooth fairy. do you take grown-up teeth? asking for my dad.',
    'dear tooth fairy. i left the window open. it gets cold. be quick.',
    'dear tooth fairy. what do you DO with them?',
  ],
});

// Overrides: { beats: {id: {text, response, ...}}, addedBeats: [...],
//              asides: {id: {...}}, addedAsides: [...], whispers: {act: [...]},
//              notes: [...] } — the Script tab writes only what changed.
export function buildScript(o) {
  if (!o || typeof o !== 'object') return SCRIPT_DEFAULTS;
  const patch = (list, edits, added) => {
    let out = list.map((b) => (edits && edits[b.id] ? { ...b, ...edits[b.id] } : b));
    if (edits) out = out.filter((b) => !edits[b.id] || !edits[b.id].removed);
    if (Array.isArray(added)) out = out.concat(added.filter((b) => b && b.id));
    return out;
  };
  return Object.freeze({
    beats: patch(SCRIPT_DEFAULTS.beats, o.beats, o.addedBeats),
    asides: patch(SCRIPT_DEFAULTS.asides, o.asides, o.addedAsides),
    whispers: { ...SCRIPT_DEFAULTS.whispers, ...(o.whispers || {}) },
    notes: Array.isArray(o.notes) && o.notes.length ? o.notes : SCRIPT_DEFAULTS.notes,
  });
}
