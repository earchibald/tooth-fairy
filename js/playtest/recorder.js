// DOM-free microphone recorder for the playtest feedback panel. Every side
// effect and the clock are injected (deps: { getUserMedia, MediaRecorderCtor,
// now }) so this module is node-testable without a browser: Node has no
// MediaRecorder and no microphone.
//
// UI contract this serves is simpler than a full recording studio: click to
// record, click to stop and submit, or click cancel to discard. There is no
// pause/resume, so duration is a plain start-to-stop elapsed time.

export function pickMime(MediaRecorderCtor) {
  if (typeof MediaRecorderCtor === 'undefined' || !MediaRecorderCtor) return null;
  if (MediaRecorderCtor.isTypeSupported('audio/mp4')) return { mime: 'audio/mp4', ext: 'm4a' };
  if (MediaRecorderCtor.isTypeSupported('audio/webm;codecs=opus')) {
    return { mime: 'audio/webm;codecs=opus', ext: 'webm' };
  }
  return null;
}

export function createRecorder(deps) {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let picked = null;
  let startedAtMs = null;
  let starting = null; // in-flight start() promise, so a second click joins it

  function releaseStream() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    recorder = null;
  }

  function reset() {
    releaseStream();
    chunks = [];
    picked = null;
    startedAtMs = null;
  }

  async function doStart() {
    const mimePick = pickMime(deps.MediaRecorderCtor);
    if (!mimePick) {
      throw new Error('no supported recording mime type');
    }
    let mediaStream;
    try {
      mediaStream = await deps.getUserMedia({ audio: true });
    } catch (err) {
      reset();
      throw err;
    }
    stream = mediaStream;
    picked = mimePick;
    chunks = [];
    try {
      recorder = new deps.MediaRecorderCtor(stream, { mimeType: picked.mime });
    } catch (err) {
      reset();
      throw err;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    startedAtMs = deps.now();
    recorder.start(1000);
    return true;
  }

  function start() {
    if (recorder && recorder.state === 'recording') return Promise.resolve(true);
    if (starting) return starting;
    starting = doStart().finally(() => {
      starting = null;
    });
    return starting;
  }

  function isRecording() {
    return !!(recorder && recorder.state === 'recording');
  }

  function durationMs() {
    if (startedAtMs === null) return 0;
    return deps.now() - startedAtMs;
  }

  function stop() {
    if (!isRecording()) return Promise.resolve(null);
    const mime = picked.mime;
    const ext = picked.ext;
    const elapsed = durationMs();
    return new Promise((resolve) => {
      const finish = () => {
        const blob = new Blob(chunks, { type: mime });
        reset();
        resolve({ blob, mime, ext, durationMs: elapsed });
      };
      recorder.onstop = finish;
      recorder.stop();
    });
  }

  function cancel() {
    if (!recorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      const finish = () => {
        reset();
        resolve(null);
      };
      if (recorder.state === 'inactive') {
        finish();
        return;
      }
      recorder.onstop = finish;
      recorder.stop();
    });
  }

  return { start, stop, cancel, isRecording, durationMs };
}
