import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL, DEFAULT_WHISPER_CPP_MODEL, INSTALL_HELP,
  outputBaseName, ffmpegArgs, mlxWhisperArgs, whisperCliArgs,
  detectBackend, transcribeFile, parseArgs,
} from '../scripts/transcribe.mjs';

test('outputBaseName strips only the extension, preserving a -v<k> suffix', () => {
  assert.equal(outputBaseName('tf-session-1700000000000-aaaa-v2.m4a'), 'tf-session-1700000000000-aaaa-v2');
  assert.equal(outputBaseName('/some/dir/tf-session-1700000000000-aaaa-v10.webm'), 'tf-session-1700000000000-aaaa-v10');
});

test('ffmpegArgs converts to mono 16k PCM WAV', () => {
  assert.deepEqual(ffmpegArgs('in.m4a', '/tmp/out.wav'), [
    '-v', 'error', '-y', '-i', 'in.m4a', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '/tmp/out.wav',
  ]);
});

test('mlxWhisperArgs passes --model explicitly, defaulting to whisper-base.en-mlx', () => {
  const args = mlxWhisperArgs('/tmp/out.wav', 'out', 'sess-v1');
  assert.deepEqual(args, [
    '/tmp/out.wav', '--model', DEFAULT_MODEL, '--output-dir', 'out',
    '--output-format', 'json', '--output-name', 'sess-v1',
  ]);
});

test('mlxWhisperArgs honours an explicit --model override', () => {
  const args = mlxWhisperArgs('/tmp/out.wav', 'out', 'sess-v1', 'mlx-community/whisper-tiny-mlx');
  assert.ok(args.includes('mlx-community/whisper-tiny-mlx'));
});

test('whisperCliArgs builds the -oj fallback invocation', () => {
  const args = whisperCliArgs('/tmp/out.wav', 'out', 'sess-v1');
  assert.deepEqual(args, ['-m', DEFAULT_WHISPER_CPP_MODEL, '-f', '/tmp/out.wav', '-oj', '-of', 'out/sess-v1']);
});

test('detectBackend prefers mlx_whisper over whisper-cli', () => {
  const which = (cmd) => cmd === 'mlx_whisper' || cmd === 'whisper-cli';
  assert.equal(detectBackend({ which }), 'mlx');
});

test('detectBackend falls back to whisper-cli when mlx_whisper is absent', () => {
  const which = (cmd) => cmd === 'whisper-cli';
  assert.equal(detectBackend({ which }), 'cpp');
});

test('detectBackend returns null when neither backend is installed', () => {
  assert.equal(detectBackend({ which: () => false }), null);
});

test('transcribeFile runs ffmpeg then mlx_whisper when mlx is available', () => {
  const calls = [];
  const runner = (cmd, args) => { calls.push([cmd, args]); return ''; };
  const which = (cmd) => cmd === 'mlx_whisper';
  const result = transcribeFile('tf-session-1-v1.m4a', { outDir: 'out', model: 'my-model' }, {
    which, runner, tmpWav: () => '/tmp/fixed.wav',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'ffmpeg');
  assert.deepEqual(calls[0][1], ffmpegArgs('tf-session-1-v1.m4a', '/tmp/fixed.wav'));
  assert.equal(calls[1][0], 'mlx_whisper');
  assert.deepEqual(calls[1][1], mlxWhisperArgs('/tmp/fixed.wav', 'out', 'tf-session-1-v1', 'my-model'));
  assert.equal(result.backend, 'mlx');
  assert.equal(result.jsonPath, 'out/tf-session-1-v1.json');
});

test('transcribeFile falls back to whisper-cli when mlx_whisper is not installed', () => {
  const calls = [];
  const runner = (cmd, args) => { calls.push([cmd, args]); return ''; };
  const which = (cmd) => cmd === 'whisper-cli';
  const result = transcribeFile('tf-session-1-v2.webm', { outDir: 'out' }, {
    which, runner, tmpWav: () => '/tmp/fixed2.wav',
  });
  assert.equal(calls[1][0], 'whisper-cli');
  assert.deepEqual(calls[1][1], whisperCliArgs('/tmp/fixed2.wav', 'out', 'tf-session-1-v2'));
  assert.equal(result.backend, 'cpp');
});

test('transcribeFile passes DEFAULT_WHISPER_CPP_MODEL to whisperCliArgs when --model was not overridden', () => {
  const calls = [];
  const runner = (cmd, args) => { calls.push([cmd, args]); return ''; };
  const which = (cmd) => cmd === 'whisper-cli';
  transcribeFile('tf-session-1-v3.webm', { outDir: 'out' }, {
    which, runner, tmpWav: () => '/tmp/fixed3.wav',
  });
  assert.deepEqual(
    calls[1][1],
    whisperCliArgs('/tmp/fixed3.wav', 'out', 'tf-session-1-v3', DEFAULT_WHISPER_CPP_MODEL),
  );
});

test("transcribeFile maps an explicit --model override onto whisper-cli's -m flag", () => {
  const calls = [];
  const runner = (cmd, args) => { calls.push([cmd, args]); return ''; };
  const which = (cmd) => cmd === 'whisper-cli';
  transcribeFile('tf-session-1-v4.webm', { outDir: 'out', model: 'some/other-model' }, {
    which, runner, tmpWav: () => '/tmp/fixed4.wav',
  });
  assert.deepEqual(
    calls[1][1],
    whisperCliArgs('/tmp/fixed4.wav', 'out', 'tf-session-1-v4', 'some/other-model'),
  );
  const mIndex = calls[1][1].indexOf('-m');
  assert.equal(calls[1][1][mIndex + 1], 'some/other-model');
});

test('transcribeFile throws naming both install commands when neither backend is installed', () => {
  assert.throws(
    () => transcribeFile('a.m4a', { outDir: 'out' }, { which: () => false, runner: () => '' }),
    (err) => {
      assert.match(err.message, /pipx install mlx-whisper/);
      assert.match(err.message, /brew install whisper-cpp/);
      return true;
    },
  );
  assert.equal(INSTALL_HELP.includes('pipx install mlx-whisper'), true);
  assert.equal(INSTALL_HELP.includes('brew install whisper-cpp'), true);
});

test('parseArgs collects files and honours --out/--model', () => {
  const out = parseArgs(['a.m4a', 'b.webm', '--out', 'dest', '--model', 'my-model']);
  assert.deepEqual(out, { files: ['a.m4a', 'b.webm'], outDir: 'dest', model: 'my-model' });
});

test('parseArgs defaults --out to "." and --model to DEFAULT_MODEL', () => {
  const out = parseArgs(['a.m4a']);
  assert.equal(out.outDir, '.');
  assert.equal(out.model, DEFAULT_MODEL);
});

test('parseArgs refuses when no files are given', () => {
  assert.throws(() => parseArgs(['--out', 'dest']), /usage/);
});
