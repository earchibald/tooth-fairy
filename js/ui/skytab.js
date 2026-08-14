// The sky tab: five figures traced star by star. Tracing spends stars;
// a completed figure draws its lines in and its bonus applies forever.

import { figureDone } from '../engine/math.js';
import { attachTip } from './tooltip.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSkyTab(root, { cfg, names, vfx, dispatch }) {
  root.classList.add('skyPanel');
  root.dataset.testid = 'sky-panel';

  const balance = document.createElement('div');
  balance.className = 'skyBalance';
  balance.dataset.testid = 'sky-balance';
  root.appendChild(balance);

  const bonusInfo = {
    littlest: `complete: +${cfg.CONSTELLATIONS.littlest.departBonus}★ at every departure`,
    fieldmouse: `complete: taps gather ×${cfg.CONSTELLATIONS.fieldmouse.tapMult}, every town`,
    quietloom: `complete: the crew is ${Math.round((1 - cfg.CONSTELLATIONS.quietloom.noiseFactor) * 100)}% quieter`,
    ferryman: `complete: dawn rest is ${cfg.CONSTELLATIONS.ferryman.gapFactor === 0.5 ? 'half as long' : '×' + cfg.CONSTELLATIONS.ferryman.gapFactor}`,
    toothfairy: `complete: each star pays +${((cfg.STARS.RATE_PER_STAR + cfg.CONSTELLATIONS.toothfairy.rateBonus) * 100).toFixed(0)}% instead of +${(cfg.STARS.RATE_PER_STAR * 100).toFixed(0)}%`,
  };

  const cards = [];
  for (const id of Object.keys(cfg.CONSTELLATIONS)) {
    const def = cfg.CONSTELLATIONS[id];
    const pat = vfx.constellations[id];
    const n = names.constellations[id];

    const card = document.createElement('div');
    card.className = 'card constCard';
    card.dataset.testid = 'const-' + id;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'constArt');
    const lines = [];
    for (const [a, b] of pat.edges) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', pat.points[a][0]);
      line.setAttribute('y1', pat.points[a][1]);
      line.setAttribute('x2', pat.points[b][0]);
      line.setAttribute('y2', pat.points[b][1]);
      line.setAttribute('class', 'constEdge');
      svg.appendChild(line);
      lines.push(line);
    }
    const dots = [];
    for (const [x, y] of pat.points) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      dot.setAttribute('class', 'constDot');
      svg.appendChild(dot);
      dots.push(dot);
    }

    const body = document.createElement('div');
    body.className = 'constBody';
    const name = document.createElement('div');
    name.className = 'cardName';
    name.textContent = n.name;
    const progress = document.createElement('span');
    progress.className = 'lv';
    name.appendChild(progress);
    const info = document.createElement('div');
    info.className = 'cardInfo';
    info.textContent = bonusInfo[id] || '';
    const flavor = document.createElement('div');
    flavor.className = 'cardFlavor';
    flavor.textContent = n.flavor;
    const buys = document.createElement('div');
    buys.className = 'cardBuys';
    const btn = document.createElement('button');
    btn.className = 'buyBtn';
    btn.dataset.testid = 'trace-' + id;
    const label = document.createElement('span');
    label.textContent = names.ui.trace;
    const cost = document.createElement('small');
    cost.textContent = '★ 1';
    btn.append(label, cost);
    btn.addEventListener('click', () => dispatch('traceStar', { id }));
    attachTip(btn, names.tips.trace);
    buys.appendChild(btn);
    body.append(name, info, flavor, buys);
    card.append(svg, body);
    root.appendChild(card);

    cards.push({ id, def, card, dots, lines, progress, btn, cache: {} });
  }

  return {
    update(state) {
      const bal = '★ ' + state.stars;
      if (balance.textContent !== bal) balance.textContent = bal;
      for (const c of cards) {
        const placed = (state.constellations && state.constellations[c.id]) || 0;
        const done = figureDone(state, cfg, c.id);
        const sig = placed + ':' + (state.stars >= 1);
        if (c.cache.sig === sig) continue;
        c.cache.sig = sig;
        for (let i = 0; i < c.dots.length; i++) {
          c.dots[i].setAttribute('class', i < placed ? 'constDot lit' : 'constDot');
        }
        for (const line of c.lines) {
          line.setAttribute('class', done ? 'constEdge lit' : 'constEdge');
        }
        c.progress.textContent = `${placed}/${c.def.slots} ★`;
        c.progress.hidden = false;
        c.card.classList.toggle('done', done);
        c.btn.hidden = done;
        c.btn.disabled = state.stars < 1;
      }
    },
  };
}
