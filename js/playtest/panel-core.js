// DOM-free formatting and assembly helpers for the playtest panel. Kept
// separate from panel.js (the DOM shell) so this logic is node-testable —
// the repo has no jsdom, so anything worth asserting on lives here instead.

// mm:ss elapsed, for the live recording timer.
export function formatClockMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// HH:MM:SS wall-clock time (local), for the queue item header line.
export function formatWallClock(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// `t=<gameS>s act <act> night <night>`, from a marker.js captureMarker() result.
export function formatMarkerLine(marker) {
  if (!marker) return '';
  return `t=${Math.round(marker.gameS)}s act ${marker.act} night ${marker.night}`;
}

export function entryIcon(kind) {
  return kind === 'voice' ? '\u{1F3A4}' : '\u{1F4DD}';
}

// `#<seq>`, kind icon, clock time, marker line — the queue item header.
export function formatEntryHeader(entry) {
  return `#${entry.seq} ${entryIcon(entry.kind)} ${formatWallClock(entry.createdAt)} ` +
    formatMarkerLine(entry.markerStart);
}

// `2/5 tf-session-…-v1.m4a`, from a submit sink's onProgress payload.
export function formatProgress(p) {
  if (!p) return '';
  return `${p.done}/${p.total} ${p.name}`;
}

// A text entry's markerStart fires on the first keystroke into an empty
// textarea, never again for the rest of that draft.
export function shouldStartTextMarker(prevValue, newValue) {
  return prevValue === '' && newValue !== '';
}

// The seq counter after restoring queued entries from the store: never below
// the session's own seqNext, and never below one past the highest seq among
// restored entries (guards against id/seq collisions after a reload).
export function nextSeq(sessionSeqNext, restoredEntries) {
  if (!restoredEntries || !restoredEntries.length) return sessionSeqNext;
  return Math.max(sessionSeqNext, ...restoredEntries.map((e) => e.seq + 1));
}

export function buildGameInfo(state, version) {
  return { version, seed: state.seed, act: state.act, town: state.town, tick: state.tick };
}

// Assembles the bundle object bundle.js's bundleFilenames()/bundleToJsonl()
// consume. Pure passthrough/shape function — the caller (panel.js) gathers
// each field (serialize(state), navigator.userAgent, window size, ...).
export function buildBundle({ sessionId, startedAt, endedAt, game, save, ua, viewport, entries }) {
  return { sessionId, startedAt, endedAt, game, save, ua, viewport, entries: entries || [] };
}
