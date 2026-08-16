import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickMime, createRecorder } from '../js/playtest/recorder.js';

// --- pickMime ---------------------------------------------------------

function fakeCtor({ mp4 = false, webm = false } = {}) {
  return {
    isTypeSupported(type) {
      if (type === 'audio/mp4') return mp4;
      if (type === 'audio/webm;codecs=opus') return webm;
      return false;
    },
  };
}

test('pickMime: prefers audio/mp4 when supported', () => {
  const got = pickMime(fakeCtor({ mp4: true, webm: true }));
  assert.deepEqual(got, { mime: 'audio/mp4', ext: 'm4a' });
});

test('pickMime: falls back to webm/opus when mp4 unsupported', () => {
  const got = pickMime(fakeCtor({ mp4: false, webm: true }));
  assert.deepEqual(got, { mime: 'audio/webm;codecs=opus', ext: 'webm' });
});

test('pickMime: returns null when nothing is supported', () => {
  const got = pickMime(fakeCtor({ mp4: false, webm: false }));
  assert.equal(got, null);
});

test('pickMime: returns null when MediaRecorderCtor is undefined', () => {
  assert.equal(pickMime(undefined), null);
});

// --- createRecorder -----------------------------------------------------

function fakeTrack() {
  return { stopped: false, stop() { this.stopped = true; } };
}

function fakeStream(tracks) {
  return { getTracks: () => tracks };
}

// A fake MediaRecorder that records the stream/options it was built with,
// and lets the test drive ondataavailable/onstop by calling start()/stop().
// isTypeSupported mirrors the mime-probe fakes above so createRecorder's
// internal pickMime() call resolves deterministically.
function makeFakeRecorderCtor({ mp4 = true, webm = true } = {}) {
  let lastInstance = null;
  function FakeMediaRecorder(stream, opts) {
    this.stream = stream;
    this.mimeType = opts.mimeType;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    lastInstance = this;
  }
  FakeMediaRecorder.prototype.start = function start() {
    this.state = 'recording';
  };
  FakeMediaRecorder.prototype.stop = function stop() {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  };
  FakeMediaRecorder.isTypeSupported = (type) => {
    if (type === 'audio/mp4') return mp4;
    if (type === 'audio/webm;codecs=opus') return webm;
    return false;
  };
  FakeMediaRecorder.getLast = () => lastInstance;
  return FakeMediaRecorder;
}

function makeDeps({ tracks = [fakeTrack()], denyMic = false } = {}) {
  const stream = fakeStream(tracks);
  const MediaRecorderCtor = makeFakeRecorderCtor();
  let clock = 0;
  return {
    tracks,
    stream,
    MediaRecorderCtor,
    deps: {
      getUserMedia: async () => {
        if (denyMic) {
          const err = new Error('Permission denied');
          err.name = 'NotAllowedError';
          throw err;
        }
        return stream;
      },
      MediaRecorderCtor,
      now: () => clock,
    },
    advance(ms) {
      clock += ms;
    },
  };
}

test('createRecorder: full start/stop cycle returns accumulated chunks and duration', async () => {
  const { deps, MediaRecorderCtor, advance } = makeDeps();
  const recorder = createRecorder(deps);

  const startP = recorder.start();
  // start() resolves once the fake MediaRecorder has actually started.
  await startP;
  assert.equal(recorder.isRecording(), true);

  const inst = MediaRecorderCtor.getLast();
  assert.equal(inst.mimeType, 'audio/mp4');

  advance(500);
  inst.ondataavailable({ data: new Blob(['a'.repeat(10)]) });
  advance(700);
  inst.ondataavailable({ data: new Blob(['b'.repeat(20)]) });
  // Empty chunks must be ignored.
  inst.ondataavailable({ data: new Blob([]) });

  const result = await recorder.stop();
  assert.equal(result.mime, 'audio/mp4');
  assert.equal(result.ext, 'm4a');
  // Measured: clock advanced 500 + 700 = 1200ms between start and stop.
  assert.equal(result.durationMs, 1200);
  assert.equal(recorder.isRecording(), false);
});

test('createRecorder: stop() blob contains the accumulated chunks, in order, empties dropped', async () => {
  const { deps, MediaRecorderCtor } = makeDeps();
  const recorder = createRecorder(deps);
  await recorder.start();
  const inst = MediaRecorderCtor.getLast();
  inst.ondataavailable({ data: new Blob(['AAA']) });
  inst.ondataavailable({ data: new Blob([]) }); // dropped: zero-size
  inst.ondataavailable({ data: new Blob(['BB']) });
  const result = await recorder.stop();
  assert.equal(await result.blob.text(), 'AAABB');
});

test('createRecorder: cancel discards chunks and resolves null', async () => {
  const { deps, MediaRecorderCtor } = makeDeps();
  const recorder = createRecorder(deps);
  await recorder.start();
  const inst = MediaRecorderCtor.getLast();
  inst.ondataavailable({ data: { size: 10 } });

  const result = await recorder.cancel();
  assert.equal(result, null);
  assert.equal(recorder.isRecording(), false);
});

test('createRecorder: stop() releases every track on the stream', async () => {
  const tracks = [fakeTrack(), fakeTrack()];
  const { deps } = makeDeps({ tracks });
  const recorder = createRecorder(deps);
  await recorder.start();
  await recorder.stop();
  assert.ok(tracks.every((t) => t.stopped), 'every track stopped after stop()');
});

test('createRecorder: cancel() releases every track on the stream', async () => {
  const tracks = [fakeTrack(), fakeTrack()];
  const { deps } = makeDeps({ tracks });
  const recorder = createRecorder(deps);
  await recorder.start();
  await recorder.cancel();
  assert.ok(tracks.every((t) => t.stopped), 'every track stopped after cancel()');
});

test('createRecorder: getUserMedia rejection leaves the recorder idle and retryable', async () => {
  const { deps } = makeDeps({ denyMic: true });
  const recorder = createRecorder(deps);

  await assert.rejects(() => recorder.start());
  assert.equal(recorder.isRecording(), false);

  // Retry succeeds once permission is no longer denied.
  deps.getUserMedia = async () => fakeStream([fakeTrack()]);
  await recorder.start();
  assert.equal(recorder.isRecording(), true);
});

test('createRecorder: start() while already recording resolves the existing session', async () => {
  const { deps, MediaRecorderCtor } = makeDeps();
  const recorder = createRecorder(deps);
  await recorder.start();
  const firstInst = MediaRecorderCtor.getLast();

  await recorder.start(); // second call should not open a new microphone
  assert.equal(MediaRecorderCtor.getLast(), firstInst);
  assert.equal(recorder.isRecording(), true);
});

test('createRecorder: stop() while idle resolves null', async () => {
  const { deps } = makeDeps();
  const recorder = createRecorder(deps);
  const result = await recorder.stop();
  assert.equal(result, null);
});

test('createRecorder: cancel() while idle resolves null', async () => {
  const { deps } = makeDeps();
  const recorder = createRecorder(deps);
  const result = await recorder.cancel();
  assert.equal(result, null);
});

test('createRecorder: falls back to webm/opus mime when mp4 unsupported', async () => {
  const tracks = [fakeTrack()];
  const stream = fakeStream(tracks);
  const MediaRecorderCtor = makeFakeRecorderCtor({ mp4: false, webm: true });
  const recorder = createRecorder({
    getUserMedia: async () => stream,
    MediaRecorderCtor,
    now: () => 0,
  });
  await recorder.start();
  const inst = MediaRecorderCtor.getLast();
  assert.equal(inst.mimeType, 'audio/webm;codecs=opus');
});

test('createRecorder: start() rejects when no supported mime exists', async () => {
  const tracks = [fakeTrack()];
  const stream = fakeStream(tracks);
  const MediaRecorderCtor = makeFakeRecorderCtor({ mp4: false, webm: false });
  const recorder = createRecorder({
    getUserMedia: async () => stream,
    MediaRecorderCtor,
    now: () => 0,
  });
  await assert.rejects(() => recorder.start());
  assert.equal(recorder.isRecording(), false);
});
