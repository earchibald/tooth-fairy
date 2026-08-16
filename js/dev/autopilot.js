// Plays the real page: real DOM clicks against the live document, the real
// frame/tick loops, the URL's ?speed clock. Dev instrument only — main.js
// imports this solely when ?autopilot=1. It verifies what the headless bot
// cannot: buttons, cards, tabs, meters, and the render loop under load.

import { createObserver } from './observer.js';
import { fmt } from '../engine/math.js';

const POLL_MS = 100;
const TAPS_PER_POLL = 4; // 40 pointerdown events/s — deliberately over the engine cap

export function startAutopilot({ maxMinutes = 10 } = {}) {
  const game = window.game;
  const { cfg, script } = game;
  const obs = createObserver(cfg, script);
  const domIssues = [];
  const consoleErrors = [];
  const startedAt = performance.now();
  let polls = 0;

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
  const strikes = new Map();
  function issue(state, what, detail) {
    if (strikes.get(what)) {
      if (domIssues.length < 50) domIssues.push({ tick: state.tick, what, detail });
    }
    strikes.set(what, true);
  }

  function domCheck(state) {
    const failed = new Set();
    const record = (what, detail) => { failed.add(what); issue(state, what, detail); };
    const beatOpen = !!$('.beatCard.show');
    if (beatOpen !== state.beatQueue.length > 0) {
      record('beat-visibility', 'card ' + beatOpen + ' queue ' + state.beatQueue.length);
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
    window.__autopilot = { done: true, reason, minutes, polls,
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

    // Story first — the engine pauses while a beat is open.
    const beatBtn = $('.beatCard.show [data-testid="beat-response"]');
    if (beatBtn) { click(beatBtn); return; }

    // Dawn rest: the one thing a real player does by walking away.
    if (state.nightShown && state.nightPhase === 'dawn') {
      game.debug.offline(cfg.NIGHT.MIN_GAP_S + 60);
      return;
    }
    if (state.nightShown && state.contractPicked === null) click($('[data-testid^="job-"]'));

    const tapBtn = $('[data-testid="tap"]');
    if (tapBtn) {
      for (let i = 0; i < TAPS_PER_POLL; i++) {
        tapBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
    }
    if (state.stir > 75) click($('[data-testid="tiptoe"]'));
    if (state.notes > 0) click($('[data-testid="log-read-note"]'));
    for (const b of document.querySelectorAll('[data-testid="roost"] button')) click(b);

    if (polls % 50 === 0) {
      const tabs = [...document.querySelectorAll('[data-testid^="tab-"]')];
      if (tabs.length) click(tabs[(polls / 50) % tabs.length]);
    }
  }, POLL_MS);

  return { stop: () => finish('stopped') };
}
