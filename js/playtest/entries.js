// DOM-free playtest entry model. `rand` is injected (zero-arg () => [0,1))
// so session ids stay deterministic under test. Guard-and-refuse for user
// input (blank text returns null); throw only for programming errors
// (editing a voice entry as text).

export function newSessionId(nowMs, rand) {
  const suffix = (rand().toString(36) + '0000').slice(2, 6);
  return `${nowMs}-${suffix}`;
}

export function makeTextEntry({ id, text, markerStart, markerEnd, trail, createdAt, seq }) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  return {
    id,
    kind: 'text',
    seq,
    createdAt,
    editedAt: null,
    edited: false,
    text,
    markerStart,
    markerEnd,
    trail,
  };
}

export function makeVoiceEntry({
  id, blob, mime, ext, durationMs, markerStart, markerEnd, trail, createdAt, seq,
}) {
  return {
    id,
    kind: 'voice',
    seq,
    createdAt,
    editedAt: null,
    edited: false,
    blob,
    mime,
    ext,
    durationMs,
    markerStart,
    markerEnd,
    trail,
  };
}

export function editText(entry, text, editedAt) {
  if (entry.kind !== 'text') {
    throw new Error(`editText: entry ${entry.id} is kind "${entry.kind}", not "text"`);
  }
  return {
    ...entry,
    text,
    editedAt,
    edited: true,
  };
}

// 1-based index among voice entries only, in seq order. -1 if not a voice
// entry (or not found) in the given list.
export function voiceIndex(entries, id) {
  const voices = entries.filter((e) => e.kind === 'voice').sort((a, b) => a.seq - b.seq);
  const i = voices.findIndex((e) => e.id === id);
  return i === -1 ? -1 : i + 1;
}
