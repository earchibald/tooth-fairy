// The contract board: 2-3 job cards at dusk, pick one, watch it resolve.
import { attachTip } from './tooltip.js';

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
  const row = document.createElement('div');
  row.className = 'boardRow';
  root.appendChild(row);
  container.appendChild(root);
  let sig = '';

  function update(state) {
    const show = state.nightShown && state.contractBoard.length > 0 &&
      state.nightPhase === 'night';
    root.hidden = !show;
    if (!show) { sig = ''; return; }
    const next = state.contractBoard.join(',') + ':' + state.contractPicked +
      ':' + state.contractDone;
    if (next === sig) return;
    sig = next;
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
      const reward = document.createElement('div');
      reward.className = 'jobReward';
      reward.textContent = c.reward.belief ? `belief +${c.reward.belief}`
        : c.reward.burstS ? `${c.reward.burstS}s of the flow, at once`
        : 'a letter worth keeping';
      card.appendChild(reward);
      const picked = state.contractPicked === id;
      card.classList.toggle('picked', picked);
      card.classList.toggle('done', picked && state.contractDone);
      card.disabled = state.contractPicked !== null && !picked;
      card.addEventListener('click', () => dispatch('pickContract', { id }));
      row.appendChild(card);
    }
  }
  return { update };
}
