// The hoard: the collected teeth drawn as a physical stash on the banner.
// Pure module — no DOM at module scope; painters receive a 2d-context-shaped
// object. Tier math is closed-form and unit-tested; scenes are quiet
// ground-line silhouettes that read as "more than the last tier".

// Which tier a tooth count sits in, and how far through it (log10-linear).
// Returns null below the first tier (0, negatives, NaN). The last tier spans
// 3 decades then clamps at 1 — Infinity lands there at progress 1.
export function tierFor(count, tiers) {
  if (!(count >= tiers[0].min)) return null;
  let index = tiers.length - 1;
  for (let i = 0; i < tiers.length; i++) {
    if (count < tiers[i].min) { index = i - 1; break; }
  }
  const lgMin = Math.log10(tiers[index].min);
  const lgNext = index + 1 < tiers.length
    ? Math.log10(tiers[index + 1].min) : lgMin + 3;
  const progress = Math.max(0, Math.min(1, (Math.log10(count) - lgMin) / (lgNext - lgMin)));
  return { id: tiers[index].id, index, progress };
}

// How many shapes a tier shows at `progress`, and how full the newest one is.
export function shapesFor(progress, units) {
  const raw = progress * units;
  const shown = Math.min(units, Math.floor(raw) + 1);
  const fill = Math.min(1, raw - (shown - 1));
  return { shown, fill };
}

// Slot centers fan outward from the tap button: right, left, right… Each
// slot clears the button's center gap and clamps inside the canvas.
export function slotXs(w, centerGapPx, units, px) {
  const xs = [];
  const halfGap = centerGapPx / 2;
  for (let i = 0; i < units; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const step = Math.floor(i / 2);
    const x = w / 2 + side * (halfGap + px * (0.7 + 1.3 * step));
    xs.push(side === 1
      ? Math.min(w - px * 0.6, Math.max(w / 2 + halfGap, x))
      : Math.max(px * 0.6, Math.min(w / 2 - halfGap, x)));
  }
  return xs;
}

// ---- painters (one per tier; c is a 2d context, g the ground line y) ----

function paintSack(c, x, g, px, fill, colors) {
  c.fillStyle = colors.accent;
  c.beginPath();
  c.moveTo(x - px * 0.38, g);
  c.quadraticCurveTo(x - px * 0.5, g - px * 0.55, x - px * 0.16, g - px * 0.72);
  c.quadraticCurveTo(x, g - px * 0.86, x + px * 0.16, g - px * 0.72);
  c.quadraticCurveTo(x + px * 0.5, g - px * 0.55, x + px * 0.38, g);
  c.closePath();
  c.fill();
  c.strokeStyle = colors.glow;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - px * 0.18, g - px * 0.7);
  c.quadraticCurveTo(x, g - px * 0.62, x + px * 0.18, g - px * 0.7);
  c.stroke();
  c.fillStyle = colors.glow;
  const peek = Math.round(1 + fill * 4);
  for (let i = 0; i < peek; i++) {
    const tx = x + (i - (peek - 1) / 2) * px * 0.12;
    c.beginPath();
    c.arc(tx, g - px * (0.74 + 0.05 * ((i * 7) % 3)), px * 0.05, 0, 7);
    c.fill();
  }
}

function paintJar(c, x, g, px, level, colors) {
  const neck = px * 0.30;
  const belly = px * 0.46;
  const h2 = px * 1.05;
  const mouthY = g - h2;
  // Glass body: shoulders bow out from the mouth, the base tucks in — no
  // straight-sided rectangle (it read as a battery).
  c.strokeStyle = colors.accent;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - neck, mouthY);
  c.bezierCurveTo(x - belly, mouthY + px * 0.16, x - belly, g - px * 0.18,
    x - belly * 0.8, g);
  c.lineTo(x + belly * 0.8, g);
  c.bezierCurveTo(x + belly, g - px * 0.18, x + belly, mouthY + px * 0.16,
    x + neck, mouthY);
  c.stroke();
  // Screw lid: a flat cap OVERHANGING the mouth, a narrower band above it —
  // wider than the neck so it can't read as a battery terminal.
  c.fillStyle = colors.accent;
  c.fillRect(x - neck * 1.25, mouthY - px * 0.10, neck * 2.5, px * 0.10);
  c.fillRect(x - neck * 0.9, mouthY - px * 0.16, neck * 1.8, px * 0.06);
  // Contents: teeth as stacked pebbles up to the fill line, never a solid
  // charge-bar slab.
  if (level > 0) {
    c.fillStyle = colors.glow;
    const top = g - (h2 - px * 0.18) * level;
    const rowW = belly * 0.62;
    for (let yy = g - px * 0.10; yy >= top; yy -= px * 0.13) {
      for (let i = 0; i < 3; i++) {
        const jx = x - rowW + rowW * i +
          ((((i * 7 + Math.round(yy)) % 3) - 1) * px * 0.04);
        c.beginPath();
        c.arc(jx, yy, px * 0.055, 0, 7);
        c.fill();
      }
    }
  }
  // Glass shine on the upper-left shoulder.
  c.strokeStyle = colors.glow;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - belly * 0.62, mouthY + px * 0.30);
  c.quadraticCurveTo(x - belly * 0.72, mouthY + px * 0.52,
    x - belly * 0.66, g - px * 0.30);
  c.stroke();
}

function paintChest(c, x, g, px, level, colors) {
  const w2 = px * 0.55;
  const bh = px * 0.5;
  const lid = Math.min(w2, px * 0.3);
  c.strokeStyle = colors.accent;
  c.lineWidth = 1.5;
  c.strokeRect(x - w2, g - bh, w2 * 2, bh);
  c.beginPath();
  c.moveTo(x - w2, g - bh);
  c.quadraticCurveTo(x, g - bh - lid, x + w2, g - bh);
  c.stroke();
  const fh = (bh - 3) * level;
  if (fh > 0) {
    c.fillStyle = colors.glow;
    c.fillRect(x - w2 + 1.5, g - 1.5 - fh, w2 * 2 - 3, fh);
  }
}

function paintPile(c, x, g, px, level, colors) {
  const r = px * (0.4 + 0.6 * level);
  c.fillStyle = colors.glow;
  c.beginPath();
  c.moveTo(x - r, g);
  c.quadraticCurveTo(x, g - r * 1.4, x + r, g);
  c.closePath();
  c.fill();
}

function paintWarehouse(c, x, g, px, level, colors) {
  const w2 = px * 0.6;
  const bh = px * (0.5 + 0.5 * level);
  c.fillStyle = colors.accent;
  c.fillRect(x - w2, g - bh, w2 * 2, bh);
  c.beginPath();
  c.moveTo(x - w2, g - bh);
  c.lineTo(x, g - bh - px * 0.22);
  c.lineTo(x + w2, g - bh);
  c.closePath();
  c.fill();
  c.fillStyle = colors.glow;
  c.fillRect(x - px * 0.1, g - px * 0.22, px * 0.2, px * 0.22);
}

function paintSilo(c, x, g, px, level, colors) {
  const w2 = px * 0.28;
  const sh = px * (0.55 + 0.45 * level);
  c.fillStyle = colors.accent;
  c.fillRect(x - w2, g - sh, w2 * 2, sh);
  c.beginPath();
  c.arc(x, g - sh, w2, Math.PI, 0);
  c.fill();
  c.fillStyle = colors.glow;
  c.fillRect(x - w2, g - sh * 0.85, w2 * 2, 2);
}

function paintMountain(c, x, g, px, level, colors) {
  const hpk = px * (0.5 + 0.5 * level);
  const w2 = hpk * 0.9;
  c.fillStyle = colors.accent;
  c.beginPath();
  c.moveTo(x - w2, g);
  c.lineTo(x, g - hpk);
  c.lineTo(x + w2, g);
  c.closePath();
  c.fill();
  c.fillStyle = colors.glow;
  c.beginPath();
  c.moveTo(x - w2 * 0.28, g - hpk * 0.72);
  c.lineTo(x, g - hpk);
  c.lineTo(x + w2 * 0.28, g - hpk * 0.72);
  c.closePath();
  c.fill();
}

function moonSkyY(h, i, px) {
  return h * 0.32 + (((i * 13) % 3) - 1) * px * 0.4;
}

function paintMoon(c, x, y, px, alpha, colors) {
  c.fillStyle = colors.glow;
  c.beginPath();
  c.arc(x, y, px * 0.5, 0, 7);
  c.fill();
  c.fillStyle = colors.accent;
  c.globalAlpha = alpha * 0.35;
  c.beginPath();
  c.arc(x - px * 0.15, y - px * 0.1, px * 0.12, 0, 7);
  c.fill();
  c.globalAlpha = alpha;
}

// Draws the whole hoard for `count` teeth. Quiet by default (vfx.hoard.alpha);
// scenes anchor to a ground line just above the canvas bottom and keep the
// tap button's center gap clear. The moons tier keeps a faint mountain ridge
// under its risen moons. `scale` multiplies every tier's px (the stage draws
// at stageScale); `centerGapPx`/`alpha` override the vfx.hoard defaults —
// pass 0 to mean 0, the fallbacks apply only when omitted.
export function drawHoard(ctx2d, { w, h, count, vfx, colors, scale = 1, centerGapPx, alpha }) {
  const hv = vfx.hoard;
  const t = tierFor(count, hv.tiers);
  if (!t) return;
  const def = hv.tiers[t.index];
  const px = def.px * scale;
  const gap = centerGapPx ?? hv.centerGapPx;
  const a = alpha ?? hv.alpha;
  const { shown, fill } = shapesFor(t.progress, def.units);
  const xs = slotXs(w, gap, def.units, px);
  const g = h - 2;
  ctx2d.save();
  ctx2d.globalAlpha = a;
  if (t.id === 'moons') {
    ctx2d.globalAlpha = a * 0.5;
    const ridge = slotXs(w, gap, 5, 40 * scale);
    for (const x of ridge) paintMountain(ctx2d, x, g, 40 * scale, 1, colors);
    ctx2d.globalAlpha = a;
    for (let i = 0; i < shown; i++) {
      const newest = i === shown - 1;
      const skyY = moonSkyY(h, i, px);
      const y = newest ? skyY + (g - skyY) * (1 - fill) : skyY;
      paintMoon(ctx2d, xs[i], y, px, a, colors);
    }
    ctx2d.restore();
    return;
  }
  const painters = {
    sack: paintSack, jars: paintJar, chests: paintChest, piles: paintPile,
    warehouses: paintWarehouse, silos: paintSilo, mountains: paintMountain,
  };
  const paint = painters[t.id];
  for (let i = 0; i < shown; i++) {
    const level = i === shown - 1 ? fill : 1;
    paint(ctx2d, xs[i], g, px, level, colors);
  }
  ctx2d.restore();
}

// A cheap signature of what the hoard would draw: redraws only when this
// changes. Quantizes the newest shape's fill to 1/64.
export function hoardSig(count, tiers) {
  const t = tierFor(count, tiers);
  if (!t) return '';
  const { shown, fill } = shapesFor(t.progress, tiers[t.index].units);
  return t.index + ':' + shown + ':' + Math.round(fill * 64);
}

// A point on the current stash for a glint particle, or null when the hoard
// is empty. `rand` is injected so tests pin the output.
export function glintPoint({ w, h, count, vfx, rand }) {
  const hv = vfx.hoard;
  const t = tierFor(count, hv.tiers);
  if (!t) return null;
  const def = hv.tiers[t.index];
  const { shown } = shapesFor(t.progress, def.units);
  const xs = slotXs(w, hv.centerGapPx, def.units, def.px);
  const i = Math.min(shown - 1, Math.floor(rand() * shown));
  const x = xs[i] + (rand() - 0.5) * def.px * 0.6;
  const y = t.id === 'moons'
    ? moonSkyY(h, i, def.px) + (rand() - 0.5) * def.px * 0.5
    : (h - 2) - rand() * def.px * 0.7;
  return {
    x: Math.max(0, Math.min(w, x)),
    y: Math.max(0, Math.min(h, y)),
  };
}
