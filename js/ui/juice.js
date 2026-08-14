// Banner juice: pure batching, the rate-driven intensity ramp, and particle
// pools (sparks, ripples, sweeps). No DOM at module scope — node-importable;
// draw() is the only function that touches a canvas context.

// Pure batching: pools one credit per productive tick and cuts a batch every
// ticksPerBatch credits. pending() lets the render loop know teeth are still
// pooled so it never parks with income in flight (a stale direct `pool` read
// once froze the banner for the session).
export function makeBatcher(ticksPerBatch) {
  let pool = 0;
  let ticks = 0;
  return {
    // Returns the finished batch amount, or null while pooling.
    credit(amount, canLaunch) {
      pool += amount;
      ticks++;
      if (ticks < ticksPerBatch || !canLaunch) return null;
      const batch = pool;
      pool = 0;
      ticks = 0;
      return batch;
    },
    pending() { return pool > 0; },
  };
}

// Log-linear intensity: 1 at rateLo, `max` at rateHi, clamped outside.
// Degenerate anchors (lo >= hi) step at hi. Non-positive rates read as calm.
export function rampFactor(rate, lo, hi, max) {
  if (!(rate > 0)) return 1;
  if (!(lo > 0) || !(hi > lo)) return rate >= hi && hi > 0 ? max : 1;
  if (rate <= lo) return 1;
  if (rate >= hi) return max;
  const t = (Math.log10(rate) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return 1 + t * (max - 1);
}

// One pool for every transient the banner draws. Oldest die first at the cap
// so a storm can never grow the list without bound.
export function makeParticles(maxCount = 240) {
  const list = [];   // {kind, x, y, vx, vy, born, life, size, alpha}

  function push(p) {
    if (list.length >= maxCount) list.shift();
    list.push(p);
  }

  return {
    spawnSparks(x, y, now, cfg, rand = Math.random) {
      for (let i = 0; i < cfg.count; i++) {
        const angle = rand() * Math.PI * 2;
        const speed = (0.4 + rand() * 0.6) * cfg.spreadPx;
        push({
          kind: 'spark', x, y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - cfg.spreadPx * 0.3,
          born: now, life: cfg.lifeMs, size: cfg.size * (0.7 + rand() * 0.6),
        });
      }
    },
    spawnRipple(x, y, now, cfg) {
      push({ kind: 'ripple', x, y, born: now, life: cfg.ms, size: cfg.size });
    },
    spawnSweep(now, cfg) {
      push({ kind: 'sweep', born: now, life: cfg.ms, alpha: cfg.alpha });
    },
    // Prunes expired particles; returns the live count.
    step(now) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (now - list[i].born >= list[i].life) list.splice(i, 1);
      }
      return list.length;
    },
    // Draws over the caller's transformed context. w/h are CSS-pixel bounds
    // (sweeps span them). Returns the live count so the loop can park.
    draw(ctx2d, now, colors, w, h) {
      const n = this.step(now);
      for (const p of list) {
        const t = (now - p.born) / p.life;
        ctx2d.save();
        if (p.kind === 'spark') {
          ctx2d.globalAlpha = 1 - t;
          ctx2d.fillStyle = colors.spark;
          ctx2d.beginPath();
          ctx2d.arc(p.x + p.vx * t, p.y + p.vy * t, p.size * (1 - t * 0.5), 0, 7);
          ctx2d.fill();
        } else if (p.kind === 'ripple') {
          ctx2d.globalAlpha = (1 - t) * 0.6;
          ctx2d.strokeStyle = colors.ripple;
          ctx2d.lineWidth = 1.5;
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, 6 + p.size * t, 0, 7);
          ctx2d.stroke();
        } else if (p.kind === 'sweep') {
          const x = -0.2 * w + t * 1.4 * w;
          const grad = ctx2d.createLinearGradient(x - w * 0.15, 0, x + w * 0.15, 0);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(0.5, colors.sweep);
          grad.addColorStop(1, 'transparent');
          ctx2d.globalAlpha = p.alpha * Math.sin(Math.min(1, t) * Math.PI);
          ctx2d.fillStyle = grad;
          ctx2d.fillRect(x - w * 0.15, 0, w * 0.3, h);
        }
        ctx2d.restore();
      }
      return n;
    },
  };
}
