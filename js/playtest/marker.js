// DOM-free playtest marker capture. Read-only over engine state: never
// touches state.rngState and never calls engine RNG. `clock` is injected
// so this module stays config-free and node-testable.

export function captureMarker(state, clock) {
  const atMs = clock.nowMs;
  const sessionMs = clock.nowMs - clock.sessionStartMs;
  const gameS = (state.tick * clock.tickMs) / 1000;
  return {
    atMs,
    sessionMs,
    tick: state.tick,
    gameS,
    act: state.act,
    town: state.town,
    night: state.night,
    nightPhase: state.nightPhase,
    teeth: state.teeth,
    lifetime: state.lifetime,
    taps: state.taps,
    wakes: state.wakes,
    tiptoes: state.tiptoes,
    belief: state.belief,
    stir: state.stir,
    stars: state.stars,
    beats: state.beatsSeen.length,
    ended: state.ended,
  };
}

// Ring-buffer sampler: sample(state, clock) records a marker at most once
// per `everyMs`, driven by an explicit clock so tests control time. Samples
// older than `spanMs` (relative to the most recent sample) are evicted.
export function createTrail({ everyMs = 2000, spanMs = 180000 } = {}) {
  let buffer = [];
  let lastAtMs = null;

  function evict(nowMs) {
    buffer = buffer.filter((m) => m.atMs >= nowMs - spanMs);
  }

  function sample(state, clock) {
    if (lastAtMs !== null && clock.nowMs - lastAtMs < everyMs) return;
    lastAtMs = clock.nowMs;
    buffer.push(captureMarker(state, clock));
    evict(clock.nowMs);
  }

  function windowFn(atMs) {
    const lo = atMs - spanMs;
    return buffer.filter((m) => m.atMs >= lo && m.atMs <= atMs);
  }

  function all() {
    return buffer.slice();
  }

  return { sample, window: windowFn, all };
}
