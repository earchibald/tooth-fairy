// The roost: purchase cards. Cards exist from boot, hidden until their
// predicate fires (the engine's sticky reveals), and update by targeted
// text writes — never a rebuild. Buttons print base numbers, never derived.

import { nextCost, maxAffordable, fmt } from '../engine/math.js';
import { multTier, multOwned, loomCost } from '../engine/predicates.js';
import { UNIT_IDS } from '../engine/state.js';
import { attachTip } from './tooltip.js';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function createRoost(root, { cfg, names, vfx, dispatch, onCeremony }) {
  root.classList.add('roost');
  root.dataset.testid = 'roost';
  const cards = [];   // {key, isVisible(state), node, update(state), actions:[{btn,run}]}

  function makeCard({ key, title, testid }) {
    const node = el('div', 'card');
    node.dataset.testid = testid;
    node.hidden = true;
    const name = el('div', 'cardName', title);
    const lv = el('span', 'lv');
    lv.hidden = true;
    name.appendChild(lv);
    const info = el('div', 'cardInfo');
    const flavor = el('div', 'cardFlavor');
    const buys = el('div', 'cardBuys');
    node.append(name, info, flavor, buys);
    root.appendChild(node);
    return { node, lv, info, flavor, buys };
  }

  function buyButton(label, testid) {
    const btn = el('button', 'buyBtn');
    btn.dataset.testid = testid;
    const key = el('span', 'key');
    key.hidden = true;
    const main = el('span', null, label);
    const cost = el('small');
    btn.append(key, main, cost);
    return { btn, cost, keyChip: key };
  }

  function unitInfo(unit) {
    const def = cfg.UNITS[unit];
    if (unit === 'barge') {
      return `${(def.manifestFrac * 100).toFixed(0)}% of each night's gathering apiece, paid at dusk`;
    }
    if (unit === 'ferry') {
      const secs = def.lumpEveryTicks * cfg.TICK_MS / 1000;
      return `${fmt(def.lumpAmount)} teeth every ${secs}s apiece`;
    }
    if (unit === 'sprite') {
      const secs = def.lifeTicks * cfg.TICK_MS / 1000;
      return `+${fmt(def.rate)}/s apiece · lives ${secs}s · swarm of ${def.swarmCap}`;
    }
    if (unit === 'pact') return `+${fmt(def.rate)}/s apiece · the house stays asleep`;
    return `+${fmt(def.rate)}/s apiece` + (def.noise ? '' : ' · silent');
  }

  // ---- the sky (star shop): permanent, star-priced, cross-town ----
  const skyInfo = {
    oldroads: 'new towns begin with baby fae and pincers',
    mouseletter: `new towns begin with ${cfg.SKY.mouseletter.scouts} tooth scouts`,
    packedlight: 'new towns begin with the dream ledger signed',
    lullabythread: `hush +${cfg.SKY.lullabythread.hush}, every town`,
    starcharts: 'the contract streak survives the move',
    ferrytoken: `barge manifest cap +${cfg.SKY.ferrytoken.cap * 100}%, every town`,
  };
  for (const id of Object.keys(cfg.SKY)) {
    const n = names.sky[id];
    const c = makeCard({ key: 'sky:' + id, title: n.name, testid: 'card-sky-' + id });
    c.node.classList.add('starCard');
    c.flavor.textContent = n.flavor;
    attachTip(c.node, names.tips.skyCard);
    const b = buyButton(names.ui.buy, 'buy-sky-' + id);
    b.btn.addEventListener('click', () => dispatch('buySky', { id }));
    c.buys.append(b.btn);
    c.info.textContent = skyInfo[id] || '';
    cards.push({
      key: 'sky:' + id,
      isVisible: (s) => (s.postEnd || s.town >= 2) && !s.sky[id],
      node: c.node,
      primary: { btn: b.btn, keyChip: b.keyChip, run: () => dispatch('buySky', { id }) },
      cache: {},
      update(s, cache) {
        const cost = cfg.SKY[id].cost;
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('cost', '★ ' + cost, (v) => { b.cost.textContent = v; });
        set('dis', s.stars < cost, (v) => { b.btn.disabled = v; });
      },
    });
  }

  // ---- unit cards, each followed by its springboard card ----
  for (const unit of UNIT_IDS) {
    const def = cfg.UNITS[unit];
    const n = names.units[unit];
    const c = makeCard({ key: 'unit:' + unit, title: n.name, testid: 'card-' + unit });
    c.flavor.textContent = n.flavor;
    attachTip(c.node, names.tips.unitCard);
    const one = buyButton(names.ui.buy, 'buy-' + unit);
    const max = buyButton('max', 'buy-' + unit + '-max');
    max.btn.classList.add('maxBtn');
    one.btn.addEventListener('click', () => dispatch('buyUnit', { unit }));
    max.btn.addEventListener('click', () => dispatch('buyUnit', { unit, max: true }));
    c.buys.append(one.btn, max.btn);
    cards.push({
      key: 'unit:' + unit,
      isVisible: (s) => !!s.revealed['unit:' + unit],
      node: c.node,
      primary: { btn: one.btn, keyChip: one.keyChip, run: () => dispatch('buyUnit', { unit }) },
      cache: {},
      update(s, cache) {
        const owned = s.units[unit];
        const basis = unit === 'sprite' ? s.units.sprite : s.buys[unit];
        const cost = nextCost(def.base, def.growth, basis);
        const canMax = maxAffordable(def.base, def.growth, basis, s.teeth);
        const mults = s.mults[unit];
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('lv', owned > 0 ? `${names.ui.owned} ${owned}${mults ? ' ·×' + (1 << mults) : ''}` : '',
          (v) => { c.lv.textContent = v; c.lv.hidden = !v; });
        set('info', unitInfo(unit), (v) => { c.info.textContent = v; });
        set('cost', fmt(cost), (v) => { one.cost.textContent = v; });
        set('dis1', s.teeth < cost, (v) => { one.btn.disabled = v; });
        set('maxN', canMax > 1 ? '×' + fmt(canMax) : '', (v) => {
          max.cost.textContent = v;
          max.btn.hidden = !v;
        });
      },
    });

    // Springboard (×2) card for this unit.
    const m = makeCard({ key: 'mult:' + unit, title: names.multNames[unit], testid: 'card-mult-' + unit });
    attachTip(m.node, names.tips.springboard);
    const mBuy = buyButton(names.ui.buy, 'buy-mult-' + unit);
    mBuy.btn.addEventListener('click', () => dispatch('buyMult', { unit }));
    m.buys.append(mBuy.btn);
    m.flavor.textContent = `every ${n.name.toLowerCase()} works twice as hard.`;
    cards.push({
      key: 'mult:' + unit,
      isVisible: (s) => {
        const tier = multTier(s, unit, cfg);
        return !!tier && multOwned(s, unit) >= tier.threshold;
      },
      node: m.node,
      primary: { btn: mBuy.btn, keyChip: mBuy.keyChip, run: () => dispatch('buyMult', { unit }) },
      cache: {},
      update(s, cache) {
        const tier = multTier(s, unit, cfg);
        if (!tier) return;
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('info', `×2 ${names.multName} · tier ${tier.tier + 1}`, (v) => { m.info.textContent = v; });
        set('cost', fmt(tier.cost), (v) => { mBuy.cost.textContent = v; });
        set('dis', s.teeth < tier.cost, (v) => { mBuy.btn.disabled = v; });
      },
    });
  }

  // ---- loom (leveled quiet) ----
  {
    const c = makeCard({ key: 'loom', title: names.loom.name, testid: 'card-loom' });
    c.flavor.textContent = names.loom.flavor;
    attachTip(c.node, names.tips.loom);
    const b = buyButton(names.ui.buy, 'buy-loom');
    b.btn.addEventListener('click', () => dispatch('buyLoom'));
    c.buys.append(b.btn);
    cards.push({
      key: 'loom',
      isVisible: (s) => !!s.revealed.loom,
      node: c.node,
      primary: { btn: b.btn, keyChip: b.keyChip, run: () => dispatch('buyLoom') },
      cache: {},
      update(s, cache) {
        const cost = loomCost(s, cfg);
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('lv', s.loom > 0 ? `${names.ui.level} ${s.loom}` : '',
          (v) => { c.lv.textContent = v; c.lv.hidden = !v; });
        set('info', `hush +${cfg.LOOM.hushPerLevel} apiece`, (v) => { c.info.textContent = v; });
        set('cost', fmt(cost), (v) => { b.cost.textContent = v; });
        set('dis', s.teeth < cost, (v) => { b.btn.disabled = v; });
      },
    });
  }

  // ---- flag upgrades ----
  const upgradeInfo = {
    babyfae: 'taps gather ×2',
    pincers: 'taps gather ×2 again',
    tweezers: 'taps gather ×2 again',
    gloves: 'taps gather ×2 again',
    starlight: `each tap adds ${cfg.UPGRADES.starlight.tapRateFrac * 100}% of the flow`,
    afterglow: 'a sprite pays half its life again when it goes',
    sandman: `tiptoes for you past stir ${cfg.TIPTOE.SANDMAN_AT}`,
    dreamledger: `offline gathering: ${cfg.UPGRADES.dreamledger.offlineRate * 100}% for ${cfg.UPGRADES.dreamledger.offlineCapHours}h`,
    nightledger: `offline window grows to ${cfg.UPGRADES.nightledger.offlineCapHours}h`,
    lucidcontract: `offline gathering: 100% for ${cfg.UPGRADES.lucidcontract.offlineCapHours}h`,
    sockradar: 'tooth scouts ×2', madrid: 'pillow mice ×2',
    encore: 'sprites live 50% longer', feltslippers: 'floss phantoms ×2',
    lighthouse: 'tooth ferries ×2', manifestii: 'barge manifest share ×2',
    notary: 'parent pacts ×2', annexforms: 'ministry ×2',
    moonclippers: 'taps gather ×2 again',
  };
  for (const id of Object.keys(cfg.UPGRADES)) {
    const n = names.upgrades[id];
    const c = makeCard({ key: 'up:' + id, title: n.name, testid: 'card-' + id });
    c.info.textContent = upgradeInfo[id] || '';
    c.flavor.textContent = n.flavor;
    attachTip(c.node, n.flavor);
    const b = buyButton(names.ui.buy, 'buy-' + id);
    b.btn.addEventListener('click', () => dispatch('buyUpgrade', { id }));
    c.buys.append(b.btn);
    cards.push({
      key: 'up:' + id,
      isVisible: (s) => !!s.revealed['up:' + id] && !s.upgrades[id],
      node: c.node,
      primary: { btn: b.btn, keyChip: b.keyChip, run: () => dispatch('buyUpgrade', { id }) },
      cache: {},
      update(s, cache) {
        const cost = cfg.UPGRADES[id].cost;
        const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
        set('cost', fmt(cost), (v) => { b.cost.textContent = v; });
        set('dis', s.teeth < cost, (v) => { b.btn.disabled = v; });
      },
    });
  }

  const everVisible = new Set();
  let booted = false;

  return {
    update(state) {
      // First frame after boot: mark already-visible cards seen, no ceremony.
      if (!booted) {
        booted = true;
        for (const card of cards) if (card.isVisible(state)) everVisible.add(card.key);
        everVisible.add('__boot');
      }
      let keyIdx = 0;
      for (const card of cards) {
        const vis = card.isVisible(state);
        if (vis && card.node.hidden) {
          card.node.hidden = false;
          if (everVisible.size && !everVisible.has(card.key)) {
            card.node.classList.add('arriving');
            if (onCeremony) onCeremony(card.key);
            setTimeout(() => card.node.classList.remove('arriving'), vfx.ceremony.dropMs + 100);
          }
          everVisible.add(card.key);
        } else if (!vis && !card.node.hidden) {
          card.node.hidden = true;
        }
        if (vis) {
          card.update(state, card.cache);
          if (keyIdx < 9) {
            keyIdx++;
            const label = String(keyIdx);
            if (card.cache.keyChip !== label) {
              card.cache.keyChip = label;
              card.primary.keyChip.textContent = label;
              card.primary.keyChip.hidden = false;
            }
            card.keySlot = keyIdx;
          } else {
            card.keySlot = 0;
            if (card.cache.keyChip) {
              card.cache.keyChip = '';
              card.primary.keyChip.hidden = true;
            }
          }
        } else {
          card.keySlot = 0;
        }
      }
    },
    pressKey(n) {
      const card = cards.find((c) => c.keySlot === n);
      if (card && !card.primary.btn.disabled) card.primary.run();
    },
  };
}
