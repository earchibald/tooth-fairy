// The contract board: 2-3 job cards at dusk, pick one, watch it resolve.
// Cards rebuild on board/pick/done changes; the live progress lines are
// targeted writes so the per-frame cost stays flat.
import { attachTip } from './tooltip.js';
import { fmt } from '../engine/math.js';

export function createBoard(container, { names, contracts, dispatch }) {
  const root = document.createElement('div');
  root.className = 'board';
  root.dataset.testid = 'contract-board';
  root.hidden = true;
  attachTip(root, names.tips.board);
  const title = document.createElement('div');
  title.className = 'boardTitle';
  title.textContent = names.ui.boardTitle;
  root.appendChild(title);
  const hint = document.createElement('div');
  hint.className = 'boardHint';
  hint.textContent = names.ui.boardHint;
  root.appendChild(hint);
  const row = document.createElement('div');
  row.className = 'boardRow';
  root.appendChild(row);
  container.appendChild(root);
  let sig = '';
  const progressEls = new Map();   // contract id -> .jobProgress node
  const progressCache = new Map(); // contract id -> last rendered text

  function goalText(c) {
    switch (c.type) {
      case 'gather': return names.ui.goalGather.replace('{n}', fmt(c.n));
      case 'notes': return names.ui.goalNotes.replace('{n}', String(c.n));
      case 'tiptoes': return names.ui.goalTiptoes.replace('{n}', String(c.n));
      case 'quiet': return names.ui.goalQuiet;
      case 'calm': return names.ui.goalCalm.replace('{n}', String(c.n));
      default: return '';
    }
  }

  function progressText(c, state, done) {
    if (done) return 'done ✓';
    const ns = state.nightStats;
    switch (c.type) {
      case 'gather': return fmt(Math.floor(ns.teeth)) + '/' + fmt(c.n);
      case 'notes': return ns.notes + '/' + c.n;
      case 'tiptoes': return ns.tiptoes + '/' + c.n;
      case 'quiet': return 'wakes tonight: ' + ns.wakes;
      case 'calm': return 'stir now: ' + Math.round(state.stir);
      default: return '';
    }
  }

  function update(state) {
    const show = state.nightShown && state.contractBoard.length > 0 &&
      state.nightPhase === 'night';
    root.hidden = !show;
    if (!show) { sig = ''; return; }
    const next = state.contractBoard.join(',') + ':' + state.contractPicked +
      ':' + state.contractDone;
    if (next !== sig) {
      sig = next;
      progressEls.clear();
      progressCache.clear();
      while (row.firstChild) row.removeChild(row.firstChild);
      for (const id of state.contractBoard) {
        const c = contracts.pool.find((x) => x.id === id);
        if (!c) continue;
        const card = document.createElement('button');
        card.className = 'jobCard';
        card.dataset.testid = 'job-' + id;
        const text = document.createElement('div');
        text.className = 'jobText';
        text.textContent = c.text;
        card.appendChild(text);
        const goal = document.createElement('div');
        goal.className = 'jobGoal';
        goal.textContent = goalText(c);
        card.appendChild(goal);
        const progress = document.createElement('div');
        progress.className = 'jobProgress';
        card.appendChild(progress);
        progressEls.set(id, progress);
        const reward = document.createElement('div');
        reward.className = 'jobReward';
        reward.textContent = names.ui.pays + (c.reward.belief ? `belief +${c.reward.belief}`
          : c.reward.burstS ? `${c.reward.burstS}s of the flow, at once`
          : 'a letter worth keeping');
        card.appendChild(reward);
        const picked = state.contractPicked === id;
        card.classList.toggle('picked', picked);
        card.classList.toggle('done', picked && state.contractDone);
        card.disabled = state.contractPicked !== null && !picked;
        card.addEventListener('click', () => dispatch('pickContract', { id }));
        row.appendChild(card);
      }
    }
    for (const [id, node] of progressEls) {
      const c = contracts.pool.find((x) => x.id === id);
      if (!c) continue;
      const done = state.contractPicked === id && state.contractDone;
      const txt = progressText(c, state, done);
      if (progressCache.get(id) !== txt) {
        progressCache.set(id, txt);
        node.textContent = txt;
        node.classList.toggle('bad', c.type === 'quiet' && state.nightStats.wakes > 0);
      }
    }
  }
  return { update };
}
