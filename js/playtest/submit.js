// The thin bridge between game-shaped playtest bundles and the portable,
// game-agnostic js/submit/ package. This is the only module allowed to
// know about both vocabularies at once.

import { bundleFilenames, bundleToJsonl, voiceEntriesInOrder } from './bundle.js';
import { pickSink } from '../submit/client.js';

// toSubmission(bundle) -> { sessionId, files: [ { name, blob, contentType } ] }
// File order: the jsonl first, then one file per voice entry in the same
// seq order bundleFilenames() numbered them in.
export function toSubmission(bundle) {
  const names = bundleFilenames(bundle);
  const jsonl = bundleToJsonl(bundle);
  const files = [
    { name: names.events, blob: new Blob([jsonl], { type: 'text/plain' }), contentType: 'text/plain' },
  ];
  const voices = voiceEntriesInOrder(bundle.entries || []);
  voices.forEach((entry, i) => {
    files.push({ name: names.audio[i], blob: entry.blob, contentType: entry.mime });
  });
  return { sessionId: bundle.sessionId, files };
}

// submitSession(bundle, deps) — deps: { env, fetch, zip, download, onProgress }.
// Converts the bundle to a submission, picks a sink via pickSink(env, deps),
// and streams deps.onProgress upward unchanged.
export async function submitSession(bundle, deps = {}) {
  const submission = toSubmission(bundle);
  const sink = pickSink(deps.env, deps);
  return sink.export(submission, deps.onProgress);
}
