# tooth fairy — user manual

An incremental clicker about teeth, belief, and who moves the pillow.
This manual covers the three ways to use the app: play the game, tune it
with the Dev Suite, and report on it with the QA (playtest) panel.

| Mode | URL | Who it is for |
|---|---|---|
| Play | https://earchibald.github.io/tooth-fairy/ | Players |
| Dev Suite | append `?dev=1` (automatic on localhost) | Designers and developers |
| QA panel | append `?playtest=1` | Playtesters |

Modes combine: `?dev=1&playtest=1` is valid.

---

## 1. Gameplay

You are something that wants teeth and does not know why. Tap the tooth.
The numbers go up. The memory comes back in fragments.

### Controls

| Input | Action |
|---|---|
| Click the tooth, `Space`, or `t` | Tap — collect teeth |
| `s` | Tiptoe |
| `n` | Read a note |
| `1`–`9` | Buy the shop card with that number chip |
| `[` / `]` or `←` / `→` | Cycle interface tabs |
| `j` | Jump to the log tab |
| `Esc` | Close any open overlay |

While a story card is up, `Space` and `Enter` do nothing global. Respond
with a click, or tab to the response button and press `Enter`.

### The night cycle

A night is approximately 35 minutes of productive play. A dawn meter
counts down the remaining night; idle time does not burn it.

1. At dawn, production stops and taps pause. The night is stamped into the log.
2. A dusk gap of minimum 2 hours of real time follows. Time away counts.
   The offline ledgers earn during the gap, within their caps.
3. At dusk, the contract board offers 2–3 jobs. Your pick resolves by the
   next dawn.

Streaks at 3, 7, and 14 nights pay a lasting bonus.

### Interface tabs

| Tab | Content |
|---|---|
| tonight | Current state and contracts |
| log | History of nights |
| roost | Settings, shop, and acknowledgements |
| sky | Constellations — appears after your first star |

### Another town (prestige)

Finishing a town banks stars: the square root of lifetime teeth, plus 10
stars for reaching the ending. Each star adds +2% production, forever, in
every town that follows. Spend stars in the sky shop at the top of the
roost tab.

On the sky tab, trace stars into five constellation figures. A finished
figure permanently changes the rules — faster taps, quieter crew, shorter
dawns, brighter stars, one extra star every departure — and is drawn into
the ending sky.

### URL flags

| Flag | Effect |
|---|---|
| `?dev=1` | Dev Suite (automatic on localhost) |
| `?playtest=1` | QA panel |
| `?speed=N` | Wall-clock dilation (0.1–1000) |
| `?mute=1` | Silence, without changing the saved preference |
| `?autopilot=1` | Bot plays the game (`&policy=`, `&rngSeed=` optional) |

---

## 2. Dev Suite

Every tunable — story beats, the difficulty matrix, every player-visible
name, animation timings, sound gains — has a live control.

### Open and close

On localhost, or with `?dev=1`, a purple **dev** chip appears in the game
header. Click it to open the full-screen panel. Click **✕** to close.
The game keeps running underneath.

### How edits work — the override layer

Edits drive the live game immediately and persist in localStorage as a
partial diff over frozen defaults. Only changed keys persist; a reload
keeps them. **Copy all overrides** exports the diff as JSON. To commit a
tuning permanently, paste the values into the matching `js/config/*.js`
defaults.

Numeric edits are validated, never clamped: a bad value shows red and is
rejected. A positive default does not accept zero or less, unless a
slider range says otherwise.

### Tabs

| Tab | Purpose |
|---|---|
| Workshop | The juice studio. Sliders for tap pop, glow, sparks, trails, sweep, scale ramp. Preview buttons fire the real feedback paths without playing. Keys `1`–`5` preview, `A` sequence, `R` repeat. |
| Hoard | Preview any stash tier (sack → moons) at any tooth count. Tune per-tier shape knobs and whole-hoard knobs. Preview never touches game state. |
| Script | Edit story beats, asides, per-act whispers, and the children's notes. `▶` plays a beat; duplicated beats are born dormant until armed. Act-jump includes act 2.5. |
| Balance | The difficulty scaling matrix — every `DEFAULTS` constant in one flat list, night and contract knobs included. |
| Names | Every player-visible label outside the script. Renames need a reload to reach shop cards, which are built once at boot. |
| VFX | Visual and audio knobs beyond the Workshop: palettes, beat timing, ceremony, twinkle, constellation geometry, and per-cue sound gains. **Test sounds** plays each cue in sequence. |
| State | Direct engine control: grant teeth and stars, drag meters, jump acts, skip to dawn or dusk, advance time, simulate 8 h offline, reload at a speed multiplier, live JSON state view. |
| Pacing | Runs the real engine headless with a competent-not-optimal bot and reports act timing, reveal cadence, dead time, and unreached beats — the numbers the test suite asserts. |

### Workshop server

**Save to project** and **release** on the Workshop tab need the local
workshop server:

    node scripts/workshop-server.js        # http://127.0.0.1:8123/?dev=1

### Dev Suite artifact

`node scripts/build-artifact.js` bundles the game plus Dev Suite into
`dist/dev-suite.html`, a self-contained page: panel on the left, live game
on the right, and a chat agent that explains settings, applies
natural-language tuning, and packages code requests for local Claude Code.

Artifact-only hotkeys:

| Keys | Action |
|---|---|
| `[` / `]` | Cycle dev tabs |
| `Shift+1`–`8` | Direct-select a tab |
| `` ` `` (backquote) | Toggle the chat |
| `Ctrl+←` / `Ctrl+→` | Switch chat tabs |
| `Esc` | Dismiss the chat |

Game hotkeys are off inside the artifact. Process notes live in
`docs/dev-suite/SDLC.md`.

### Scripted play

`window.game` exposes the live state, `dispatch`, and
`debug.{advanceTicks, runUntil, grant, offline}` in the console.

---

## 3. QA panel (playtest)

A tester queues text and voice notes during live play, each stamped with
a gameplay marker, then submits the session afterward. Open the game with
`?playtest=1`. The panel is a fixed column right of the game, desktop
only (window ≥ 1100 px wide). It never pauses the game.

### Controls

| Control | What it does |
|---|---|
| `● record` / `■ stop & submit` | Records a voice note. Marks the start on record, the end on stop. |
| `cancel` (while recording) | Discards the clip and releases the microphone. Nothing is queued. |
| Text box + `submit` | Queues a typed note. Marks the start on the first keystroke, the end on submit. |
| Queue entry | Text entries are editable; voice entries are replayable. `delete` asks to confirm; shift-click skips the confirm. |
| `submit session` (header or footer) | Uploads or downloads everything queued so far. Entries stay in IndexedDB either way. |
| `new session` (footer) | Ends the current session and starts a fresh one. |

Entries persist in IndexedDB (`tf-playtest`) and survive a reload.

### How markers work

Every entry carries its start/end markers plus a 180-second rolling trail
of gameplay markers, sampled every 2 seconds. A tester describes a moment
**after** it happens, so the end marker is when they stopped talking —
the trail is what lets an analyst find the real moment.

### What "submit session" produces

| Infrastructure state | Result |
|---|---|
| No broker deployed (default) | Downloads a zip — `<sessionId>.zip` with the events jsonl and every voice recording — or the bare `<sessionId>.jsonl` when there is no audio |
| Broker deployed | Uploads straight to S3 through a token-gated broker. No AWS keys touch the browser. |

The broker is `submission-broker/`, a reusable Terraform module plus
Lambda. It has deliberately not been applied: it creates a real S3 bucket
and a public Function URL, which is the owner's call.

### Analyzing a session

Use the `analyze-playtest` skill (`.claude/skills/analyze-playtest/`), or
run its scripts directly:

| Script | Role |
|---|---|
| `scripts/submissions.mjs` | List, pull, or remove submissions from S3 |
| `scripts/transcribe.mjs` | Whisper transcription of voice notes |
| `scripts/playtest-merge.mjs` | Merge events and transcripts into a markdown report |

Full design: `docs/superpowers/specs/2026-08-16-playtest-feedback-panel.md`.
