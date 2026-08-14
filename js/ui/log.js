import { fmt } from '../engine/math.js';

export function createLog(panel, { names }) {
  const stamps = document.createElement('div');
  stamps.className = 'logStamps';
  const entries = document.createElement('div');
  entries.className = 'logEntries';
  panel.append(stamps, entries);
  let sig = '';

  function update(state, script) {
    const next = state.beatsSeen.length + ':' + state.night + ':' +
      state.nightPhase + ':' + state.nightLedger.length + ':' +
      state.townLedger.length + ':' + state.town;
    if (next === sig) return;
    sig = next;
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
