#!/usr/bin/env node
// scripts/transcribe.mjs — transcribe playtest voice notes to Whisper JSON.
// Zero dependencies; shells out to ffmpeg plus one of two local Whisper
// backends. All side effects are injectable so this is node-testable
// without ever invoking ffmpeg or Whisper for real.
//
// usage:
//   node scripts/transcribe.mjs <audio...> [--out dir] [--model M]
//
// For each input file:
//   1. ffmpeg -v error -y -i <in> -ac 1 -ar 16000 -c:a pcm_s16le <tmp>.wav
//      Use ffmpeg, never afconvert: despite the .m4a name, Chrome's
//      MediaRecorder writes a fragmented MP4 carrying OPUS, which
//      CoreAudio (and so afconvert) cannot open.
//   2. mlx_whisper <wav> --model <model> --output-dir <out>
//        --output-format json --output-name <basename>
//      falls back to:
//      whisper-cli -m ~/.cache/whisper/ggml-base.en.bin -f <wav> -oj -of <out>/<basename>
//   3. The output basename preserves the input's -v<k> suffix (everything
//      before the extension), so scripts/playtest-merge.mjs can recover
//      the entry index from the transcript filename.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MODEL = 'mlx-community/whisper-base.en-mlx';
export const DEFAULT_WHISPER_CPP_MODEL = join(process.env.HOME || '', '.cache/whisper/ggml-base.en.bin');

export const INSTALL_HELP =
  'no Whisper backend installed: run `pipx install mlx-whisper` or `brew install whisper-cpp`';

// Strip the extension only — everything else (including a trailing
// -v<k>) survives into the transcript's basename.
export function outputBaseName(inputPath) {
  return basename(inputPath).replace(/\.[^./]+$/, '');
}

export function ffmpegArgs(input, wavPath) {
  return ['-v', 'error', '-y', '-i', input, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath];
}

export function mlxWhisperArgs(wavPath, outDir, baseName, model = DEFAULT_MODEL) {
  return [wavPath, '--model', model, '--output-dir', outDir, '--output-format', 'json', '--output-name', baseName];
}

export function whisperCliArgs(wavPath, outDir, baseName, modelPath = DEFAULT_WHISPER_CPP_MODEL) {
  return ['-m', modelPath, '-f', wavPath, '-oj', '-of', join(outDir, baseName)];
}

// Returns 'mlx', 'cpp', or null. `which(cmd)` is injected so tests never
// touch the real PATH.
export function detectBackend({ which }) {
  if (which('mlx_whisper')) return 'mlx';
  if (which('whisper-cli')) return 'cpp';
  return null;
}

function defaultWhich(cmd) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function defaultRunner(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

// Transcribes one file. deps: { which, runner, tmpWav, model }.
// Returns { input, backend, outDir, baseName, jsonPath }.
export function transcribeFile(input, { outDir, model = DEFAULT_MODEL } = {}, deps = {}) {
  const which = deps.which || defaultWhich;
  const runner = deps.runner || defaultRunner;
  const backend = detectBackend({ which });
  if (!backend) throw new Error(INSTALL_HELP);

  const baseName = outputBaseName(input);
  const wavPath = deps.tmpWav ? deps.tmpWav(input) : join(tmpdir(), `${baseName}-${process.pid}.wav`);

  runner('ffmpeg', ffmpegArgs(input, wavPath));

  if (backend === 'mlx') {
    runner('mlx_whisper', mlxWhisperArgs(wavPath, outDir, baseName, model));
  } else {
    runner('whisper-cli', whisperCliArgs(wavPath, outDir, baseName));
  }

  return { input, backend, outDir, baseName, jsonPath: join(outDir, `${baseName}.json`) };
}

export function parseArgs(argv) {
  const out = { files: [], outDir: '.', model: DEFAULT_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') { out.outDir = argv[++i]; if (!out.outDir) throw new Error('--out needs a directory'); }
    else if (arg === '--model') { out.model = argv[++i]; if (!out.model) throw new Error('--model needs a value'); }
    else out.files.push(arg);
  }
  if (out.files.length === 0) {
    throw new Error('usage: transcribe.mjs <audio...> [--out dir] [--model M]');
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tmpDir = mkdtempSync(join(tmpdir(), 'tf-transcribe-'));
  try {
    for (const input of opts.files) {
      const result = transcribeFile(input, { outDir: opts.outDir, model: opts.model }, {
        tmpWav: () => join(tmpDir, `${outputBaseName(input)}.wav`),
      });
      console.log(`${result.input} -> ${result.jsonPath} (${result.backend === 'mlx' ? opts.model : 'whisper-cli'})`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }
}
