// The dev-suite chat agent. Deterministic on purpose: the artifact runtime
// has no LLM capability, so the agent is the contract made conversational —
// generated knob packs in, knob edits and Claude Code prompt packages out.
// It never sees game source; docs/dev-suite/SDLC.md owns keeping packs true.

import { getPath } from '../dev/ovstore.js';

const SET_VERBS = /\b(set|change|make|put|turn)\b/;
const UP_VERBS = /\b(increase|raise|bump|boost)\b/;
const DOWN_VERBS = /\b(decrease|lower|reduce|drop)\b/;
const CODE_VERBS = /\b(add|implement|create|build|refactor|remove|rename|fix|improve|rewrite)\b/;

function tokens(s) {
  return String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'on', 'in', 'is',
  'it', 'this', 'that', 'what', 'which', 'does', 'do', 'set', 'change', 'make',
  'put', 'turn', 'reset', 'double', 'halve', 'increase', 'decrease', 'raise',
  'lower', 'reduce', 'bump', 'boost', 'drop', 'by', 'and', 'please', 'can',
  'you', 'tab', 'gain']);

function knobTokens(k) {
  const t = new Set();
  for (const seg of k.path) for (const w of tokens(String(seg))) t.add(w);
  return t;
}

// Score = how many meaningful query words hit this knob's path vocabulary.
// Exact word overlap only; ties are surfaced to the user, never guessed at.
export function matchKnobs(text, packs, tab) {
  const words = tokens(text).filter((w) => !STOP.has(w) && !/^[\d.]+%?$/.test(w));
  const scored = [];
  for (const k of packs.knobs) {
    if (tab && k.tab !== tab) continue;
    const kt = knobTokens(k);
    let score = 0;
    for (const w of words) if (kt.has(w)) score++;
    if (score > 0) scored.push({ k, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function parseValue(text) {
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*%?/g);
  if (!m) return null;
  const last = m[m.length - 1].trim();
  return { n: parseFloat(last), pct: last.endsWith('%') };
}

function fmtPath(k) { return k.path.join('.'); }

function knobLine(k, live) {
  const cur = getPath(live[k.ovKey], k.path);
  const range = k.min !== undefined ? ` (range ${k.min}–${k.max})` : '';
  return `${k.tab} · ${fmtPath(k)} — current ${JSON.stringify(cur)}, default ${JSON.stringify(k.def)}${range}`;
}

const TAB_ORDER = ['Workshop', 'Hoard', 'Script', 'Balance', 'Names', 'VFX', 'State', 'Pacing'];

export function buildPrompt({ tab, request, packs, overrides, matchedKnobs }) {
  const pack = packs.tabs[tab] || packs.tabs['Dev Suite'];
  const knobList = (matchedKnobs && matchedKnobs.length
    ? matchedKnobs
    : packs.knobs.filter((k) => k.tab === tab).slice(0, 40))
    .map((k) => `- ${fmtPath(k)} (default ${JSON.stringify(k.def)}${k.min !== undefined ? `, range ${k.min}–${k.max}` : ''})`)
    .join('\n');
  const ovs = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v && Object.keys(v).length));
  const body = `# Dev Suite change request — ${tab} tab

Repo: /Users/earchibald/work/tooth-fairy (tooth-fairy, vanilla ESM, zero deps, no innerHTML)

## Request (verbatim from the dev-suite chat)
${request}

## Tab context
${pack ? pack.summary : ''}

Visual: ${pack ? pack.visual : ''}

Files: ${pack ? pack.files : ''}

## Knob contract (paths this tab owns)
${knobList || '(no knobs — this tab is not knob-driven)'}

## Current override diff (live tuning state when this was written)
\`\`\`json
${JSON.stringify(ovs, null, 2)}
\`\`\`

## SDLC — after implementing
1. npm test (all green; add tests for new pure logic)
2. If knobs/tabs changed: update docs/dev-suite/agents/, then node scripts/gen-agent-packs.js
3. node scripts/build-artifact.js
4. Republish dist/dev-suite.html to the existing artifact (same URL)
`;
  return { filename: `dev-suite-request-${tab.toLowerCase().replace(/\s+/g, '-')}.md`, body };
}

// Shared set-resolution: given already-scored knob matches, either apply the
// top match (identical value parsing for reset/double/halve/±%/absolute), ask
// to disambiguate a tie, or ask for a value. `noteTab` (used by the
// suite-wide fallback from tab scope) names the owning tab in the reply so
// the user knows the knob was not on their active tab.
function resolveSet(matches, { lower, isReset, isDouble, isHalve, val, live, noteTab }) {
  const [best, second] = matches;
  if (second && second.score === best.score) {
    return { reply: 'Which one?\n' + matches.slice(0, 5)
      .map((s) => '• ' + knobLine(s.k, live)).join('\n') };
  }
  const k = best.k;
  const cur = getPath(live[k.ovKey], k.path);
  let value;
  if (isReset) value = k.def;
  else if (isDouble) value = typeof cur === 'number' ? cur * 2 : cur;
  else if (isHalve) value = typeof cur === 'number' ? cur / 2 : cur;
  else if (val && val.pct && (UP_VERBS.test(lower) || DOWN_VERBS.test(lower))) {
    const sign = DOWN_VERBS.test(lower) ? -1 : 1;
    value = typeof cur === 'number' ? +(cur * (1 + sign * val.n / 100)).toPrecision(6) : cur;
  } else if (val && (UP_VERBS.test(lower) || DOWN_VERBS.test(lower))) {
    const sign = DOWN_VERBS.test(lower) ? -1 : 1;
    value = typeof cur === 'number' ? cur + sign * val.n : cur;
  } else if (val) value = val.n;
  else return { reply: 'Give me a value: e.g. "set ' + fmtPath(k) + ' to 0.5", '
    + '"raise it 20%", or "reset it". Current: ' + knobLine(k, live) };
  const tabNote = noteTab ? `${k.tab} tab; ` : '';
  const action = { type: 'set', ovKey: k.ovKey, path: k.path, value, tab: k.tab };
  if (k.min !== undefined) action.min = k.min;
  return {
    reply: `Setting ${fmtPath(k)} → ${JSON.stringify(value)} (${tabNote}was ${JSON.stringify(cur)}, default ${JSON.stringify(k.def)}).`,
    action,
  };
}

export function respond({ text, scope, tab, packs, live, overrides }) {
  const effTab = scope === 'suite' ? null : tab;
  const lower = text.toLowerCase();
  const isReset = /\breset\b/.test(lower);
  const isDouble = /\bdouble\b/.test(lower);
  const isHalve = /\b(halve|half)\b/.test(lower);
  const val = parseValue(text);
  const wantsSet = SET_VERBS.test(lower) || UP_VERBS.test(lower) || DOWN_VERBS.test(lower)
    || isReset || isDouble || isHalve;
  const matches = matchKnobs(text, packs, effTab);

  // Code-change requests outrank knob edits: "add a slider for X" mentions
  // knob words but asks for new code.
  if (CODE_VERBS.test(lower) && !wantsSet) {
    const p = buildPrompt({ tab: tab || 'Dev Suite', request: text, packs, overrides,
      matchedKnobs: matches.slice(0, 8).map((s) => s.k) });
    return {
      reply: 'That needs a code change — I built a prompt package with this '
        + 'tab’s contract and your live tuning state. Copy it (or save it) '
        + 'and hand it to Claude Code in the repo; the package ends with the '
        + 'rebuild/republish steps.',
      action: { type: 'prompt', ...p },
    };
  }

  if (wantsSet && matches.length) {
    return resolveSet(matches, { lower, isReset, isDouble, isHalve, val, live });
  }

  // Tab scope with no in-scope knob hit: an explicit set request may still
  // name a knob owned by another tab (e.g. "set sound tap to 0.5" while the
  // Script tab is active but the knob lives on VFX). Re-run suite-wide
  // before giving up, so a clear single match still applies.
  if (wantsSet && !matches.length && scope !== 'suite' && effTab) {
    const suiteMatches = matchKnobs(text, packs, null);
    if (suiteMatches.length) {
      return resolveSet(suiteMatches, { lower, isReset, isDouble, isHalve, val, live, noteTab: true });
    }
  }

  // In suite scope, only a "set"-style request should resolve straight to a
  // knob (handled above); a bare informational query routes to the tab whose
  // summary/capabilities prose best matches, not to any knob whose path
  // happens to share a word with the question.
  if (matches.length && scope !== 'suite') {
    return { reply: 'Matches:\n' + matches.slice(0, 6)
      .map((s) => '• ' + knobLine(s.k, live)).join('\n')
      + '\n\nSay "set <knob> to <value>" and I will apply it live.' };
  }

  if (scope === 'suite') {
    // Overview routing: score the query against each tab's pack prose.
    const words = tokens(text).filter((w) => !STOP.has(w));
    let best = null;
    for (const [name, p] of Object.entries(packs.tabs)) {
      if (name === 'Dev Suite') continue;
      const hay = new Set(tokens(p.summary + ' ' + p.capabilities + ' ' + p.visual));
      let score = 0;
      for (const w of words) if (hay.has(w)) score++;
      if (!best || score > best.score) best = { name, p, score };
    }
    if (best && best.score > 0) {
      return {
        reply: `${best.name} — ${best.p.summary}\n\nSwitch there (Shift+`
          + `${TAB_ORDER.indexOf(best.name) + 1}) and ask its agent in the `
          + '"Current tab" chat for specifics.',
        action: { type: 'showTab', tab: best.name },
      };
    }
    const suite = packs.tabs['Dev Suite'];
    return { reply: (suite ? suite.summary + '\n\n' : '')
      + Object.entries(packs.tabs).filter(([n]) => n !== 'Dev Suite')
        .map(([n, p]) => `• ${n} — ${p.summary.split('\n')[0]}`).join('\n') };
  }

  const pack = packs.tabs[tab];
  return { reply: (pack ? pack.summary + '\n\n' + pack.capabilities : 'No pack for this tab.')
    + '\n\nAsk about a knob by name, tell me to set one, or describe a code '
    + 'change and I will package a prompt for Claude Code.' };
}
