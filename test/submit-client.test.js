import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBrokerSink, createFileSink, pickSink } from '../js/submit/client.js';

function submission(files) {
  return { sessionId: 'sess-1', files };
}

function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('createBrokerSink: throws "submissions disabled" when env is inactive', async () => {
  const sink = createBrokerSink({ enabled: false, brokerUrl: '' }, { fetch: async () => { throw new Error('should not fetch'); } });
  await assert.rejects(
    () => sink.export(submission([{ name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' }])),
    /submissions disabled/,
  );
});

test('createBrokerSink: grant refusal surfaces the broker\'s reason', async () => {
  const calls = [];
  const fetchStub = async (url, opts) => {
    calls.push({ url, opts });
    return jsonRes(403, { reason: 'quota exceeded' });
  };
  const sink = createBrokerSink({ enabled: true, brokerUrl: 'https://broker.example/grant', token: 't' }, { fetch: fetchStub });
  await assert.rejects(
    () => sink.export(submission([{ name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' }])),
    /grant refused: quota exceeded/,
  );
});

test('createBrokerSink: audio/webm;codecs=opus normalises to audio/webm in the grant request', async () => {
  let sentContentType = null;
  const fetchStub = async (url, opts) => {
    if (url === 'https://broker.example/grant') {
      sentContentType = JSON.parse(opts.body).contentType;
      return jsonRes(200, { url: 'https://s3.example/upload', fields: { key: 'v1.webm' } });
    }
    return jsonRes(200, {});
  };
  const sink = createBrokerSink({ enabled: true, brokerUrl: 'https://broker.example/grant', token: 't' }, { fetch: fetchStub });
  await sink.export(submission([
    { name: 'v1.webm', blob: new Blob(['audio-bytes']), contentType: 'audio/webm;codecs=opus' },
  ]));
  assert.equal(sentContentType, 'audio/webm');
});

test('createBrokerSink: an upload failure throws with its HTTP status', async () => {
  const fetchStub = async (url) => {
    if (url === 'https://broker.example/grant') {
      return jsonRes(200, { url: 'https://s3.example/upload', fields: { key: 'a.txt' } });
    }
    if (url === 'https://s3.example/upload') return jsonRes(500, {});
    throw new Error(`unexpected fetch ${url}`);
  };
  const sink = createBrokerSink({ enabled: true, brokerUrl: 'https://broker.example/grant', token: 't' }, { fetch: fetchStub });
  await assert.rejects(
    () => sink.export(submission([{ name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' }])),
    /upload failed \(500\)/,
  );
});

test('createBrokerSink: progress fires start and done per file', async () => {
  const fetchStub = async (url) => {
    if (url === 'https://broker.example/grant') {
      return jsonRes(200, { url: 'https://s3.example/upload', fields: { key: 'x' } });
    }
    return jsonRes(200, {});
  };
  const sink = createBrokerSink({ enabled: true, brokerUrl: 'https://broker.example/grant', token: 't' }, { fetch: fetchStub });
  const events = [];
  await sink.export(submission([
    { name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' },
    { name: 'b.txt', blob: new Blob(['yy']), contentType: 'text/plain' },
  ]), (p) => events.push(p));
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((e) => [e.phase, e.name]), [
    ['start', 'a.txt'], ['done', 'a.txt'], ['start', 'b.txt'], ['done', 'b.txt'],
  ]);
  assert.equal(events[3].done, 2);
  assert.equal(events[3].total, 2);
});

test('createFileSink: single file skips zipping and goes straight to download', async () => {
  const downloaded = [];
  const zipCalled = [];
  const sink = createFileSink({
    zip: async (files, name) => { zipCalled.push(name); return { name, files }; },
    download: async (file) => downloaded.push(file),
  });
  await sink.export(submission([{ name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' }]));
  assert.equal(zipCalled.length, 0);
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].name, 'a.txt');
});

test('createFileSink: multiple files are zipped into one archive before download', async () => {
  const downloaded = [];
  const sink = createFileSink({
    zip: async (files, name) => new File([], name, { type: 'application/zip' }),
    download: async (file) => downloaded.push(file),
  });
  await sink.export(submission([
    { name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' },
    { name: 'b.webm', blob: new Blob(['y']), contentType: 'audio/webm' },
  ]));
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].name, 'sess-1.zip');
});

test('pickSink: chooses the broker sink only when enabled with a URL', async () => {
  // Distinguish sinks by which side effect they invoke: fetch that throws
  // if called proves a file sink was picked; zip/download that throw if
  // called prove a broker sink was picked.
  const oneFile = submission([{ name: 'a.txt', blob: new Blob(['x']), contentType: 'text/plain' }]);
  const netOnly = {
    fetch: async () => jsonRes(200, { url: 'https://s3.example/upload', fields: {} }),
    zip: async () => { throw new Error('file sink should not be used'); },
    download: async () => { throw new Error('file sink should not be used'); },
  };
  const localOnly = {
    fetch: async () => { throw new Error('broker sink should not be used'); },
    zip: async () => { throw new Error('unexpected zip for a single file'); },
    download: async () => 'saved',
  };

  const broker = pickSink({ enabled: true, brokerUrl: 'https://broker.example/grant', token: 't' }, netOnly);
  await assert.doesNotReject(() => broker.export(oneFile));

  const fileDisabled = pickSink({ enabled: false, brokerUrl: 'https://broker.example/grant' }, localOnly);
  await assert.doesNotReject(() => fileDisabled.export(oneFile));

  const fileNoUrl = pickSink({ enabled: true, brokerUrl: '' }, localOnly);
  await assert.doesNotReject(() => fileNoUrl.export(oneFile));

  const fileNoEnv = pickSink(undefined, localOnly);
  await assert.doesNotReject(() => fileNoEnv.export(oneFile));
});
