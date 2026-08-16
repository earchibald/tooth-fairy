// Pure, engine-free bundle assembly. Builds the JSONL wire format for a
// playtest session out of a plain `bundle` object; never imports
// js/engine, so this stays node-testable and the caller (js/playtest/
// submit.js today, js/playtest/panel.js in a later task) owns fetching
// `serialize(state)` and handing in the base64 string.
//
// bundle shape (all fields required unless noted):
// {
//   sessionId,               // store.openSession().id
//   startedAt, endedAt,      // ms epoch
//   game: { version, seed, act, town, tick },
//   save,                    // base64 of serialize(state), caller-computed
//   ua, viewport,            // navigator.userAgent, { w, h }
//   entries: [ entry, ... ], // entries.js shapes, any order (sorted here by seq)
// }
//
// entry.trail is the array produced by marker.js's createTrail().window()
// (or [] when no trail was captured) and is emitted verbatim as the
// "trail" line's samples.

import { voiceIndex } from './entries.js';

function sortedBySeq(entries) {
  return entries.slice().sort((a, b) => a.seq - b.seq);
}

// Voice entries in seq order — the numbering source of truth. Computed
// fresh from whatever entries the bundle carries, so numbering is frozen
// at build time: a later delete of an already-uploaded entry can't
// renumber it, because that entry is simply absent from a *new* bundle.
export function voiceEntriesInOrder(entries) {
  return sortedBySeq(entries).filter((e) => e.kind === 'voice');
}

function audioFilename(sessionId, entry, entries) {
  const k = voiceIndex(entries, entry.id);
  return `tf-session-${sessionId}-v${k}.${entry.ext}`;
}

export function bundleFilenames(bundle) {
  const entries = bundle.entries || [];
  return {
    events: `tf-session-${bundle.sessionId}.jsonl`,
    audio: voiceEntriesInOrder(entries).map((e) => audioFilename(bundle.sessionId, e, entries)),
  };
}

export function bundleToJsonl(bundle) {
  const entries = sortedBySeq(bundle.entries || []);
  const lines = [];

  lines.push(JSON.stringify({
    type: 'header',
    v: 1,
    sessionId: bundle.sessionId,
    startedAt: bundle.startedAt,
    endedAt: bundle.endedAt,
    game: bundle.game,
    save: bundle.save,
    ua: bundle.ua,
    viewport: bundle.viewport,
  }));

  for (const entry of entries) {
    const line = {
      type: 'entry',
      id: entry.id,
      seq: entry.seq,
      kind: entry.kind,
      createdAt: entry.createdAt,
      editedAt: entry.editedAt,
      edited: entry.edited,
      markerStart: entry.markerStart,
      markerEnd: entry.markerEnd,
    };
    if (entry.kind === 'voice') {
      line.audioFile = audioFilename(bundle.sessionId, entry, bundle.entries || []);
      line.durationMs = entry.durationMs;
    } else {
      line.text = entry.text;
    }
    lines.push(JSON.stringify(line));
  }

  for (const entry of entries) {
    lines.push(JSON.stringify({ type: 'trail', entryId: entry.id, samples: entry.trail || [] }));
  }

  return lines.join('\n') + '\n';
}
