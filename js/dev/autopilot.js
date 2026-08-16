// Plays the real page: real DOM clicks against the live document, the real
// frame/tick loops, the URL's ?speed clock. Dev instrument only — main.js
// imports this solely when ?autopilot=1. It verifies what the headless bot
// cannot: buttons, cards, tabs, meters, and the render loop under load.

import { createObserver } from './observer.js';
import { fmt } from '../engine/math.js';
import { steadyPolicy, chaosPolicy, wrongPolicy, mulberry32 } from './policies.js';

const POLL_MS = 50; // At high ?speed= the poll interval IS the player's reaction time in game-seconds, so it must stay small.
const TAPS_PER_POLL = 4; // 40 pointerdown events/s — deliberately over the engine cap

export function startAutopilot({ maxMinutes = 10, policyName = 'steady', rngSeed = 1 } = {}) {
  const game = window.game;
  const { cfg, script } = game;
  const policy = policyName === 'chaos' ? chaosPolicy(rngSeed)
    : policyName === 'wrong' ? wrongPolicy() : steadyPolicy();
  // DOM-side randomness (roost-button coin flips) gets its own stream so it
  // cannot desync the policy's decision sequence from a headless run.
  const domRng = mulberry32(rngSeed + 1);
  const obs = createObserver(cfg, script);
  const domIssues = [];
  const consoleErrors = [];
  const startedAt = performance.now();
  let polls = 0;
  let beatWait = -1;

  const origError = console.error;
  console.error = (...args) => {
    if (consoleErrors.length < 50) consoleErrors.push(args.map(String).join(' '));
    origError.apply(console, args);
  };
  const onWindowError = (e) => {
    if (consoleErrors.length < 50) consoleErrors.push(String(e.message));
  };
  window.addEventListener('error', onWindowError);

  const $ = (sel) => document.querySelector(sel);
  const click = (node) => { if (node && !node.disabled) node.click(); };

  // A check can catch the one-frame gap between an engine tick and the next
  // render. Only a mismatch seen on two CONSECUTIVE checks is real.
  // The beat card waits a real-time settle gap (vfx.beats.settleMs) that
  // does not scale with ?speed=, and occluded windows render on a 400 ms
  // fallback — so the hidden-card direction gets one extra strike.
  const strikesNeeded = (what) => what.startsWith('beat-visibility') ? 3 : 2;
  const strikes = new Map();
  function issue(state, what, detail) {
    const n = (strikes.get(what) || 0) + 1;
    strikes.set(what, n);
    if (n >= strikesNeeded(what) && domIssues.length < 50) {
      domIssues.push({ tick: state.tick, what, detail });
    }
  }

  function domCheck(state) {
    const failed = new Set();
    const record = (what, detail) => { failed.add(what); issue(state, what, detail); };
    const beatOpen = !!$('.beatCard.show');
    if (beatOpen !== state.beatQueue.length > 0) {
      // Keyed by queue head: chained beats each settle their own real-time
      // pause — only the SAME beat staying hidden accumulates strikes.
      record('beat-visibility:' + (state.beatQueue[0] || 'none'),
        'card ' + beatOpen + ' queue ' + state.beatQueue.length);
    }
    const stirMeter = $('.meter.stir');
    if (stirMeter && stirMeter.hidden === !!state.stirShown) {
      record('stir-visibility', 'hidden ' + stirMeter.hidden + ' shown ' + state.stirShown);
    }
    // The counter races the render loop while ticks flow; compare it only
    // while the engine is paused on an open beat (DOM settled since pause).
    if (state.beatQueue.length > 0) {
      const count = $('[data-testid="tooth-count"]');
      if (count && count.textContent !== fmt(state.teeth)) {
        record('counter-mismatch', count.textContent + ' != ' + fmt(state.teeth));
      }
    }
    for (const what of strikes.keys()) if (!failed.has(what)) strikes.delete(what);
  }

  function finish(reason) {
    clearInterval(timer);
    console.error = origError;
    window.removeEventListener('error', onWindowError);
    const { violations, stats } = obs.report();
    const minutes = (performance.now() - startedAt) / 60000;
    window.__autopilot = { done: true, reason, minutes, polls, policy: policy.name,
      violations, domIssues, consoleErrors, stats };
    const bad = violations.length + domIssues.length + consoleErrors.length;
    console.log('[autopilot] ' + reason + ' after ' + minutes.toFixed(1) + ' min, tick ' +
      game.state.tick + ' — ' + (bad ? bad + ' PROBLEMS' : 'clean'));
  }

  const timer = setInterval(() => {
    const state = game.state;
    polls++;
    obs.onTick(state);
    window.__autopilot = { done: false, polls, tick: state.tick, act: state.act };
    if ((performance.now() - startedAt) / 60000 > maxMinutes) { finish('time'); return; }
    if (state.postEnd && !state.beatQueue.length) { finish('postEnd'); return; }

    // Checks run before actions so the paused-on-a-beat counter check
    // happens before the beat is dismissed.
    if (polls % 10 === 0) domCheck(state);

    // Story first — the engine pauses while a beat is open. Chaos idles a
    // few polls first, like a reader; steady and wrong answer immediately.
    const beatBtn = $('.beatCard.show [data-testid="beat-response"]');
    if (beatBtn) {
      if (beatWait < 0) beatWait = policy.beatDelayTicks();
      if (beatWait > 0) { beatWait--; return; }
      beatWait = -1;
      click(beatBtn); return;
    }

    // Dawn rest: the one thing a real player does by walking away.
    if (state.nightShown && state.nightPhase === 'dawn') {
      game.debug.offline(cfg.NIGHT.MIN_GAP_S + 60);
      return;
    }
    if (state.nightShown && state.contractPicked === null && state.contractBoard.length) {
      const board = state.contractBoard.map((id) => game.contracts.pool.find((c) => c.id === id));
      click($('[data-testid="job-' + policy.pickContract(board) + '"]') || $('[data-testid^="job-"]'));
    }

    const tapBtn = $('[data-testid="tap"]');
    if (tapBtn) {
      // Steady keeps the historical 4/poll burst (the engine cap is under
      // test); other policies bring their own appetite.
      const taps = policy.name === 'steady' ? TAPS_PER_POLL : policy.tapsPerTick(state);
      for (let i = 0; i < taps; i++) {
        tapBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
    }
    // Steady's threshold sits far below the policy's 75 because the
    // autopilot senses stir with up to a poll of lag.
    if (policy.name === 'steady' ? state.stir > 45 : policy.shouldTiptoe(state)) {
      click($('[data-testid="tiptoe"]'));
    }
    if (state.notes > 0 && policy.shouldReadNote(state)) click($('[data-testid="log-read-note"]'));
    for (const b of document.querySelectorAll('[data-testid="roost"] button')) {
      if (policy.name === 'wrong' && b.dataset.testid === 'buy-loom') continue;
      if (policy.name === 'chaos' && domRng() < 0.5) continue;
      click(b);
    }

    if (polls % 50 === 0) {
      const tabs = [...document.querySelectorAll('[data-testid^="tab-"]')];
      if (tabs.length) click(tabs[(polls / 50) % tabs.length]);
    }
  }, POLL_MS);

  return { stop: () => finish('stopped') };
}
