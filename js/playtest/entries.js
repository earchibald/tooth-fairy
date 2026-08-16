// DOM-free playtest entry model. `rand` is injected (zero-arg () => [0,1))
// so session ids stay deterministic under test. Guard-and-refuse for user
// input (blank text returns null); throw only for programming errors
// (editing a voice entry as text).

export function newSessionId(nowMs, rand) {
  // Suffix must be exactly 4 base-36 characters [a-z0-9] for every rand() in [0, 1).
  // Math.random() can return exactly 0, so we cannot rely on decimal-point position
  // when stringifying. Instead, scale rand to [0, 36^4), floor to integer, and pad.
  const suffix = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0');
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

// 1-based index among voice entries only, computed from seq order.
// Returns -1 if the id is not a voice entry or not found.
export function voiceIndex(entries, id) {
  const voices = entries.filter((e) => e.kind === 'voice').sort((a, b) => a.seq - b.seq);
  const i = voices.findIndex((e) => e.id === id);
  return i === -1 ? -1 : i + 1;
}
