#!/usr/bin/env node
// scripts/playtest-merge.mjs — merge a submitted playtest session
// (tf-session-<id>.jsonl, per js/playtest/bundle.js) with Whisper
// transcripts of its voice notes into one readable markdown timeline.
// Zero dependencies. Library + CLI.
//
// usage:
//   node scripts/playtest-merge.mjs <events.jsonl> [transcript.json ...] [--out file]
//
// IMPORTANT — the whole point of the trail: a tester describes something
// AFTER it happens. markerEnd is when they stopped talking, not when the
// thing happened. Look 15-90s earlier in the trail before concluding
// where a complaint lands. That warning is baked into every report's
// header (see WARNING below) because it is easy to forget under deadline.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WARNING =
  'A tester describes something **after** it happens. `markerEnd` is when they stopped '
  + 'talking, not when the thing happened. Look 15–90 s earlier in the trail before you '
  + 'conclude where a complaint lands.';

// bundleToJsonl() (js/playtest/bundle.js) always ends the file with a
// trailing newline, so any consumer that splits on \n must skip the
// resulting blank line or it throws on the last "line".
export function parseJsonl(text) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  let header = null;
  const entries = [];
  const trails = new Map();
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Error(`not valid JSON: ${line.slice(0, 80)}`);
    }
    if (obj.type === 'header') header = obj;
    else if (obj.type === 'entry') entries.push(obj);
    else if (obj.type === 'trail') trails.set(obj.entryId, obj.samples || []);
  }
  if (!header) throw new Error('missing header line (type:"header")');
  entries.sort((a, b) => a.seq - b.seq);
  return { header, entries, trails };
}

// Accepts both Whisper JSON shapes: whisper.cpp -oj gives .transcription
// with offsets in ms; mlx_whisper --output-format json gives .segments
// with start/end in seconds. Ported from
// alignment-issues/scripts/session-merge.mjs:108-130.
export function parseWhisper(json) {
  if (Array.isArray(json.transcription)) {
    return json.transcription
      .map((seg) => ({
        startMs: seg.offsets ? seg.offsets.from : 0,
        endMs: seg.offsets ? seg.offsets.to : 0,
        text: (seg.text || '').trim(),
      }))
      .filter((seg) => seg.text !== '');
  }
  if (Array.isArray(json.segments)) {
    return json.segments
      .map((seg) => ({
        startMs: Math.round(seg.start * 1000),
        endMs: Math.round(seg.end * 1000),
        text: (seg.text || '').trim(),
      }))
      .filter((seg) => seg.text !== '');
  }
  throw new Error('unrecognized Whisper JSON shape (need .transcription or .segments)');
}

// The session id itself can contain a "-v"-looking substring, so recover
// the voice index from the LAST -v<digits>. match in the basename, not
// the first.
export function voiceIndexFromName(name) {
  const matches = [...basename(name).matchAll(/-v(\d+)\./g)];
  if (matches.length === 0) return null;
  return parseInt(matches[matches.length - 1][1], 10);
}

export function fmtClock(epochMs) {
  const d = new Date(epochMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtNum(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Loads transcript files, keyed by the voice index recovered from each
// filename. `readFile` is injected so this is node-testable without disk.
export function loadTranscripts(files, { readFile = readFileSync } = {}) {
  const byIndex = new Map();
  for (const file of files) {
    const idx = voiceIndexFromName(file);
    if (idx === null) continue;
    const json = JSON.parse(readFile(file, 'utf8'));
    byIndex.set(idx, parseWhisper(json));
  }
  return byIndex;
}

function transcriptText(segments) {
  return segments.map((s) => s.text).join(' ').trim();
}

function trailTable(samples) {
  if (!samples || samples.length === 0) return null;
  const rows = samples.map((m) => `| ${Math.round(m.gameS)}s | ${m.act} | ${m.night} | ${fmtNum(m.teeth)} | ${fmtNum(m.belief)} | ${fmtNum(m.stir)} |`);
  return [
    '| t | act | night | teeth | belief | stir |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function renderEntry(entry, samples, segments) {
  const out = [];
  const clock = fmtClock(entry.markerEnd ? entry.markerEnd.atMs : entry.createdAt);
  const dur = entry.kind === 'voice' && typeof entry.durationMs === 'number'
    ? ` · ${(entry.durationMs / 1000).toFixed(1)} s`
    : '';
  out.push(`### #${entry.seq} · ${entry.kind} · ${clock}${dur}`);
  out.push('');

  if (entry.markerStart && entry.markerEnd) {
    const teethStart = fmtNum(entry.markerStart.teeth);
    const teethEnd = fmtNum(entry.markerEnd.teeth);
    out.push(
      `window: t=${Math.round(entry.markerStart.gameS)}s … t=${Math.round(entry.markerEnd.gameS)}s`
      + ` · act ${entry.markerEnd.act} · night ${entry.markerEnd.night}`
      + ` · teeth ${teethStart} → ${teethEnd}`,
    );
    out.push('');
  }

  if (entry.kind === 'text') {
    out.push(`> ${(entry.text || '').split('\n').join('\n> ')}`);
  } else if (segments && segments.length) {
    out.push(`> ${transcriptText(segments)}`);
  } else {
    out.push('> *(no transcript available)*');
  }
  out.push('');

  const table = trailTable(samples);
  if (table) {
    out.push('<details><summary>trail (180 s before submit)</summary>');
    out.push('');
    out.push(table);
    out.push('');
    out.push('</details>');
    out.push('');
  }

  return out.join('\n');
}

export function renderReport(header, entries, trails, transcriptsByIndex) {
  const out = [];
  out.push(`# Playtest session ${header.sessionId}`);
  out.push('');
  out.push(`> ${WARNING}`);
  out.push('');
  out.push(`- started: ${new Date(header.startedAt).toLocaleString()}`);
  out.push(`- ended: ${new Date(header.endedAt).toLocaleString()}`);
  out.push(`- entries: ${entries.length}`);
  out.push('');

  let voiceSeen = 0;
  for (const entry of entries) {
    let segments;
    if (entry.kind === 'voice') {
      voiceSeen += 1;
      segments = transcriptsByIndex.get(voiceSeen);
    }
    out.push(renderEntry(entry, trails.get(entry.id), segments));
  }
  return out.join('\n');
}

export function parseArgs(argv) {
  let out = null;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { out = argv[++i]; if (!out) throw new Error('--out needs a file'); continue; }
    files.push(argv[i]);
  }
  const eventsPath = files.find((f) => f.endsWith('.jsonl'));
  if (!eventsPath) {
    throw new Error('usage: playtest-merge.mjs <events.jsonl> [transcript.json ...] [--out file]');
  }
  const transcriptPaths = files.filter((f) => f !== eventsPath);
  return { eventsPath, transcriptPaths, out };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { header, entries, trails } = parseJsonl(readFileSync(opts.eventsPath, 'utf8'));
  const transcriptsByIndex = loadTranscripts(opts.transcriptPaths, {});
  const md = renderReport(header, entries, trails, transcriptsByIndex);
  if (opts.out) writeFileSync(opts.out, md);
  else process.stdout.write(md + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }
}
