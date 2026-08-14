// One tip mechanism for mouse and touch. Desktop gets title=; touch gets a
// long-press card. Copy lives in names.tips — never inline.
let tipEl = null;

function showCard(text, x, y) {
  hideCard();
  tipEl = document.createElement('div');
  tipEl.className = 'tipCard';
  tipEl.textContent = text;
  document.body.appendChild(tipEl);
  const pad = 8;
  const w = Math.min(280, window.innerWidth - pad * 2);
  tipEl.style.maxWidth = w + 'px';
  tipEl.style.left = Math.min(x, window.innerWidth - w - pad) + 'px';
  tipEl.style.top = Math.max(pad, y - 8) + 'px';
  setTimeout(hideCard, 4000);
}

function hideCard() {
  if (tipEl) { tipEl.remove(); tipEl = null; }
}

export function attachTip(el, text) {
  if (!text) return;
  el.title = text;
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text);
  let timer = null;
  el.addEventListener('pointerdown', (e) => {
    timer = setTimeout(() => showCard(text, e.clientX, e.clientY), 600);
  });
  for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) {
    el.addEventListener(evt, () => { clearTimeout(timer); });
  }
}
