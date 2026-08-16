import { fmt } from '../engine/math.js';

export function createLog(panel, { names, dispatch }) {
  // Notes live here too: read the next one, and keep every one already read —
  // the stage aside is transient, the log remembers.
  const noteBar = document.createElement('div');
  noteBar.className = 'logNotes';
  const readBtn = document.createElement('button');
  readBtn.className = 'chip';
  readBtn.dataset.testid = 'log-read-note';
  readBtn.hidden = true;
  readBtn.addEventListener('click', () => dispatch('readNote'));
  noteBar.appendChild(readBtn);
  const noteList = document.createElement('div');
  noteList.className = 'logNoteList';
  const stamps = document.createElement('div');
  stamps.className = 'logStamps';
  const entries = document.createElement('div');
  entries.className = 'logEntries';
  panel.append(noteBar, noteList, stamps, entries);
  let sig = '';

  function update(state, script) {
    const next = state.beatsSeen.length + ':' + state.night + ':' +
      state.nightPhase + ':' + state.nightLedger.length + ':' +
      state.townLedger.length + ':' + state.town + ':' +
      state.notes + ':' + state.notesRead + ':' +
      (state.notesShown && state.act >= 2);
    if (next === sig) return;
    sig = next;
    const canRead = state.notesShown && state.act >= 2;
    readBtn.hidden = !canRead;
    if (canRead) {
      readBtn.textContent = names.verbs.readNote + ' (' + state.notes + ')';
      readBtn.disabled = state.notes < 1;
    }
    while (noteList.firstChild) noteList.removeChild(noteList.firstChild);
    const pool = script.notes;
    // Note k (read order) recycles through the pool; older repeats add nothing.
    const kept = Math.min(state.notesRead, pool.length);
    if (kept > 0) {
      const head = document.createElement('div');
      head.className = 'logNotesHead';
      head.textContent = names.ui.notesKept;
      noteList.appendChild(head);
      for (let k = state.notesRead - 1; k >= state.notesRead - kept; k--) {
        const row = document.createElement('div');
        row.className = 'logNote';
        row.textContent = pool[k % pool.length];
        noteList.appendChild(row);
      }
    }
    while (stamps.firstChild) stamps.removeChild(stamps.firstChild);
    for (const t of state.townLedger.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'stamp townStamp';
      row.textContent =
        `town ${t.town} — ${t.nights} nights · ${fmt(t.lifetime)} gathered · ${t.stars}★`;
      stamps.appendChild(row);
    }
    for (const st of state.nightLedger.slice().reverse()) {
      const row = document.createElement('div');
      row.className = 'stamp';
      row.textContent =
        `night ${st.night} · ${fmt(st.teeth)} teeth · wakes ${st.wakes}` +
        ` · contracts ${st.contractsDone}${st.sailed ? ' · sailed' : ''}`;
      stamps.appendChild(row);
    }
    while (entries.firstChild) entries.removeChild(entries.firstChild);
    for (const id of state.beatsSeen) {
      const beat = script.beats.find((b) => b.id === id);
      if (!beat || (!beat.text && !beat.response)) continue;
      const e = document.createElement('div');
      e.className = 'journalEntry' + (beat.register === 'ledger' ? ' ledger' : '');
      if (beat.text) {
        const t = document.createElement('div');
        t.className = 'jt';
        t.textContent = beat.text;
        e.appendChild(t);
      }
      const r = document.createElement('div');
      r.className = 'jr';
      r.textContent = beat.response;
      e.appendChild(r);
      entries.appendChild(e);
    }
    if (!entries.firstChild && !stamps.firstChild) {
      const empty = document.createElement('div');
      empty.className = 'jt';
      empty.textContent = '(nothing yet. get some teeth.)';
      entries.appendChild(empty);
    }
  }
  return { update };
}
