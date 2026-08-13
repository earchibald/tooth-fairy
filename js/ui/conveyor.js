// The cornflower motif strip beside the tooth button. One inbound tooth per
// credited batch, launched to land as the numbers move — never a cosmetic
// swarm. The rAF loop parks when nothing is in flight.

import { toothPath2D } from './tooth.js';

export function createConveyor(canvas, vfx, onLand) {
  const path = toothPath2D();
  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx2d = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  const sprites = [];        // {born, fromLeft, amount}
  let pool = 0;              // credited teeth waiting to become a sprite
  let poolSince = 0;
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

  function drawStatic() {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    const size = vfx.motif.toothPx;
    const gap = size * 1.5;
    const y = h / 2;
    for (let x = (scroll % gap) - gap; x < w + gap; x += gap) {
      drawTooth(x, y, size, null, 0.16);
    }
  }

  function frame(now) {
    if (!running) return;
    // Pace to ~60fps so per-frame drift constants hold on 120 Hz displays.
    if (now - lastDraw < 15) { requestAnimationFrame(frame); return; }
    lastDraw = now;
    scroll += vfx.motif.scrollPxPerS / 60;
    drawStatic();
    const y = h / 2;
    const size = vfx.motif.toothPx;
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i];
      const t = (now - s.born) / vfx.motif.inboundMs;
      if (t >= 1) {
        sprites.splice(i, 1);
        if (onLand) onLand(s.amount);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 2.2);
      const startX = s.fromLeft ? -size : w + size;
      const x = startX + (w / 2 - startX) * ease;
      drawTooth(x, y - Math.sin(t * Math.PI) * 7, size, vfx.motif.inboundColor, 0.5 + t * 0.5);
    }
    if (sprites.length || pool > 0) requestAnimationFrame(frame);
    else { running = false; drawStatic(); }
  }

  function wake() {
    if (!running) { running = true; lastDraw = 0; requestAnimationFrame(frame); }
  }

  return {
    // Credit `amount` teeth of automated income toward the next inbound sprite.
    credit(amount, now) {
      if (reducedMotion) { if (onLand) onLand(amount); return; }
      pool += amount;
      if (!poolSince) poolSince = now;
      if (sprites.length < vfx.motif.inboundMax &&
          (now - poolSince >= vfx.motif.batchWindowMs || sprites.length === 0)) {
        sprites.push({ born: now, fromLeft: (side = !side), amount: pool });
        pool = 0;
        poolSince = 0;
      }
      wake();
    },
    redraw: drawStatic,
    destroy() { ro.disconnect(); running = false; },
  };
}
