// The cornflower motif strip beside the tooth button. One inbound tooth per
// credited batch, launched to land as the numbers move — never a cosmetic
// swarm. The rAF loop parks when nothing is in flight.

import { toothPath2D } from './tooth.js';
import { makeBatcher, rampFactor, makeParticles } from './juice.js';
import { drawHoard, glintPoint, hoardSig } from './hoard.js';
export { makeBatcher } from './juice.js';

export function createConveyor(canvas, vfx, ticksPerBatch, onLand) {
  const path = toothPath2D();
  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx2d = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  const sprites = [];        // {born, fromLeft, amount, preview}
  const batcher = makeBatcher(ticksPerBatch);
  const previewBatcher = makeBatcher(ticksPerBatch);
  const parts = makeParticles();
  let rate = 0;
  let teeth = 0;
  let hoardPreview = null;
  // Live production mix by family; which archetype the next sprite flies.
  let shares = null;
  const STYLE_KEYS = ['flyers', 'grounders', 'mayflies', 'river', 'paper'];
  const STYLES = {
    flyers:    { speed: 1,    size: 1,    trail: 1 },
    grounders: { speed: 1,    size: 1,    trail: 1 },
    mayflies:  { speed: 1.4,  size: 0.85, trail: 2 },
    river:     { speed: 0.7,  size: 1.5,  trail: 1 },
    paper:     { speed: 0.85, size: 1,    trail: 1 },
  };
  function pickStyle() {
    if (!shares) return 'flyers';
    const r = Math.random();
    let acc = 0;
    for (const k of STYLE_KEYS) {
      acc += shares[k];
      if (r < acc) return k;
    }
    return 'flyers';
  }
  const hoardCount = () => hoardPreview ?? teeth;
  let lastHoardSig = hoardSig(hoardCount(), vfx.hoard.tiers);
  // When parked, only redraw the static frame (incl. getComputedStyle) if
  // what the hoard would actually show has changed — a changed teeth count
  // alone is not enough (most digit changes don't move a shape or a tier).
  function redrawIfHoardChanged() {
    const sig = hoardSig(hoardCount(), vfx.hoard.tiers);
    if (sig !== lastHoardSig) { lastHoardSig = sig; drawStatic(); }
  }
  let running = false;
  let lastDraw = 0;
  let scroll = 0;
  let side = false;

  const ro = new ResizeObserver(() => {
    dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    drawStatic();
  });
  ro.observe(canvas);

  function drawTooth(x, y, size, fill, alpha) {
    ctx2d.save();
    ctx2d.translate(x - size / 2, y - size / 2);
    ctx2d.scale(size / 100, size / 100);
    ctx2d.globalAlpha = alpha;
    if (fill) { ctx2d.fillStyle = fill; ctx2d.fill(path); }
    else { ctx2d.strokeStyle = vfx.motif.color; ctx2d.lineWidth = 7; ctx2d.stroke(path); }
    ctx2d.restore();
  }

  // Inbound sprite draw: one transform setup, two fills (glow ghost under
  // crisp). Replaces two full drawTooth calls (two save/translate/scale/fill
  // each) with a single save/translate/scale shared by both passes.
  function drawInboundSprite(x, y, size, fill, ghostAlpha, ghostBlur, crispAlpha) {
    ctx2d.save();
    ctx2d.translate(x - size / 2, y - size / 2);
    ctx2d.scale(size / 100, size / 100);
    ctx2d.fillStyle = fill;
    if (ghostAlpha > 0 && ghostBlur > 0) {
      ctx2d.shadowColor = vfx.motif.inboundColor;
      ctx2d.shadowBlur = ghostBlur;
      ctx2d.globalAlpha = ghostAlpha;
      ctx2d.fill(path);
    }
    ctx2d.shadowBlur = 0;
    ctx2d.globalAlpha = crispAlpha;
    ctx2d.fill(path);
    ctx2d.restore();
  }

  // Per-archetype trajectory. t is raw travel progress 0..1; returns {x, y}.
  function spritePos(s, t) {
    const size = vfx.motif.toothPx;
    const y0 = h / 2;
    const ease = 1 - Math.pow(1 - t, 2.2);
    const startX = s.fromLeft ? -size : w + size;
    const x = startX + (w / 2 - startX) * ease;
    switch (s.style) {
      case 'grounders': {
        // Rides the ground line with four small hops.
        const hop = Math.abs(Math.sin(t * Math.PI * 4)) * 6;
        return { x, y: y0 + size * 0.35 - hop };
      }
      case 'mayflies':
        return { x, y: y0 - Math.sin(t * Math.PI * 6) * 5 };
      case 'river':
        return { x, y: y0 };
      case 'paper': {
        // Drifts down from above, swaying like a slip of paper.
        const drop = (1 - t) * h * 0.4;
        return { x, y: y0 - drop + Math.sin(t * Math.PI * 5) * 10 * (1 - t) };
      }
      default: {
        // Flyers arc in high and settle to the line with a fading bob.
        const high = (1 - ease) * h * 0.35;
        return { x, y: y0 - high - Math.sin(t * Math.PI * 2) * 4 * (1 - t) };
      }
    }
  }

  function ramp(maxKey) {
    const r = vfx.juice.ramp;
    return rampFactor(rate, r.rateLo, r.rateHi, r[maxKey]);
  }

  function colors() {
    const css = getComputedStyle(canvas.closest('#app') || document.documentElement);
    return {
      spark: css.getPropertyValue('--glow').trim() || '#a8c0ea',
      ripple: css.getPropertyValue('--accent').trim() || '#7b96c9',
      sweep: '#e8d99a',
      accent: css.getPropertyValue('--accent').trim() || '#7b96c9',
      glow: css.getPropertyValue('--glow').trim() || '#a8c0ea',
    };
  }

  function drawStatic(cols) {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    const size = vfx.motif.toothPx;
    const gap = size * 1.5;
    const y = h / 2;
    for (let x = (scroll % gap) - gap; x < w + gap; x += gap) {
      drawTooth(x, y, size, null, 0.16);
    }
    drawHoard(ctx2d, { w, h, count: hoardCount(), vfx, colors: cols || colors() });
  }

  function frame(now) {
    if (!running) return;
    // Pace to ~60fps so per-frame drift constants hold on 120 Hz displays.
    if (now - lastDraw < 15) { requestAnimationFrame(frame); return; }
    lastDraw = now;
    scroll += (vfx.motif.scrollPxPerS * ramp('scrollHi')) / 60;
    const cols = colors();
    drawStatic(cols);
    const y = h / 2;
    const size = vfx.motif.toothPx;
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      const st = STYLES[s.style] || STYLES.flyers;
      const t = ((now - s.born) / vfx.motif.inboundMs) * st.speed;
      if (t >= 1) {
        sprites.splice(i, 1);
        parts.spawnSparks(w / 2, y, now, {
          count: Math.round(vfx.juice.landSparks.count * ramp('trailHi')),
          size: vfx.juice.landSparks.size, spreadPx: 22,
          lifeMs: vfx.juice.landSparks.lifeMs,
        });
        if (onLand) onLand(s.amount);
        continue;
      }
      const pos = spritePos(s, t);
      const gAlpha = Math.min(1, vfx.juice.inbound.glowAlpha * ramp('glowHi'));
      const gSize = size * ramp('sizeHi') * st.size;
      drawInboundSprite(pos.x, pos.y, gSize, vfx.motif.inboundColor,
        gAlpha, vfx.juice.inbound.glowSize * ramp('glowHi'), 0.5 + t * 0.5);
      // River wake: one low ripple at mid-crossing.
      if (s.style === 'river' && !s.rippled && t >= 0.5) {
        s.rippled = true;
        parts.spawnRipple(pos.x, pos.y + 4, now, { ms: 600, size: 18 });
      }
      // Sparkle trail: spawn probabilistically per frame so trailPerS holds.
      const perFrame = (vfx.juice.inbound.trailPerS * ramp('trailHi') * st.trail) / 60;
      if (Math.random() < perFrame) {
        parts.spawnSparks(pos.x, pos.y, now,
          { count: 1, size: 1.4, spreadPx: 8, lifeMs: vfx.juice.inbound.trailLife });
      }
    }
    // Glints alone must never keep this loop alive: they only spawn while
    // real inbound traffic (sprites) is in flight, so once traffic stops the
    // last glints decay and the loop parks — no self-sustaining glint chain.
    if (!reducedMotion && sprites.length > 0 && Math.random() < vfx.hoard.glintPerS / 60) {
      const p = glintPoint({ w, h, count: hoardCount(), vfx, rand: Math.random });
      if (p) {
        parts.spawnSparks(p.x, p.y, now,
          { count: 1, size: 1.3, spreadPx: 4, lifeMs: 700 });
      }
    }
    parts.draw(ctx2d, now, cols, w, h);
    // A pooled mid-batch credit does not by itself keep frames hot: nothing
    // drains the pool except a future credit(), which already calls wake().
    // A pending pool alone must never re-arm this loop.
    if (sprites.length || parts.step(now) > 0) requestAnimationFrame(frame);
    else {
      running = false;
      lastHoardSig = hoardSig(hoardCount(), vfx.hoard.tiers);
      drawStatic(cols);
    }
  }

  function wake() {
    if (!running) { running = true; lastDraw = 0; requestAnimationFrame(frame); }
  }

  return {
    // Credit `amount` teeth of automated income toward the next inbound sprite.
    // A sprite launches every ticksPerBatch credits, so it carries exactly one
    // batch window of income and its landing float matches the rate readout.
    credit(amount, now) {
      if (reducedMotion) { if (onLand) onLand(amount); return; }
      const realSpriteCount = sprites.filter(s => !s.preview).length;
      const batch = batcher.credit(amount, realSpriteCount < vfx.motif.inboundMax);
      if (batch != null) {
        sprites.push({ born: now, fromLeft: (side = !side), amount: batch, style: pickStyle() });
      }
      wake();
    },
    // Workshop preview: identical to credit() but routes through a dedicated
    // batcher/sprite flag so synthetic flow can never pollute real income —
    // flush() discards only this batcher and these sprites. Preview and real
    // launches never contend for slots — each maintains its own cap.
    creditPreview(amount, now) {
      if (reducedMotion) { if (onLand) onLand(amount); return; }
      const previewSpriteCount = sprites.filter(s => s.preview).length;
      const batch = previewBatcher.credit(amount, previewSpriteCount < vfx.motif.inboundMax);
      if (batch != null) {
        sprites.push({ born: now, fromLeft: (side = !side), amount: batch, preview: true, style: pickStyle() });
      }
      wake();
    },
    tapPulse(now) {
      if (reducedMotion) return;
      parts.spawnRipple(w / 2, h / 2, now, { ms: vfx.juice.tapGlow.ms + 200, size: 46 });
      parts.spawnSparks(w / 2, h / 2, now, vfx.juice.tapSparks);
      wake();
    },
    buySweep(now) {
      if (reducedMotion) return;
      parts.spawnSweep(now, vfx.juice.buySweep);
      wake();
    },
    setRate(rps) { rate = rps; },
    // Live production mix; which archetype the next launch flies.
    setShares(s) { shares = s; },
    // The hoard reads live teeth unless a Workshop preview overrides them.
    setTeeth(count) {
      if (count === teeth) return;
      teeth = count;
      if (!running) redrawIfHoardChanged();
    },
    setHoardPreview(countOrNull) {
      hoardPreview = countOrNull;
      if (!running) redrawIfHoardChanged();
    },
    redraw: drawStatic,
    // Discards only the preview batcher and removes in-flight preview
    // sprites — mid-flight synthetic teeth vanish on tab close; real pooled
    // income and real sprites are untouched.
    flush() {
      previewBatcher.discard();
      for (let i = sprites.length - 1; i >= 0; i--) {
        if (sprites[i].preview) sprites.splice(i, 1);
      }
    },
    destroy() { ro.disconnect(); running = false; },
  };
}
