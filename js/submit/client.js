// Portable submission client. Two sinks share one interface —
// `sink.export(submission, onProgress) -> Promise<string>` — over one
// generic input type:
//
//   submission = { sessionId, files: [ { name, blob, contentType } ] }
//
// No side effect is read off the global: fetch, the zip function, and the
// download callback are all injected via `deps`, so both sinks are driven
// from plain Node with no network and no DOM. See README.md for the full
// contract this package promises to any consumer.

function baseType(type) {
  return (type || '').split(';')[0].trim();
}

function toFiles(submission) {
  return submission.files.map((f) => new File([f.blob], f.name, { type: f.contentType }));
}

// createBrokerSink(env, deps) — deps.fetch is required (falls back to the
// global fetch when present, e.g. in a browser). Per file: POST
// {token, sessionId, filename, size, contentType} to env.brokerUrl,
// receive {url, fields}, upload the file straight to that URL via
// FormData. No retry loop — a failed submission leaves the caller's data
// wherever it already lives; that is a deliberate choice, not an
// oversight. `contentType` is normalised with baseType() before it is
// sent: a broker that validates strictly (e.g. against S3 presigned-post
// conditions) will reject a codec suffix like ";codecs=opus" with 415.
export function createBrokerSink(env, deps = {}) {
  const doFetch = deps.fetch || (typeof fetch === 'function' ? fetch : undefined);
  return {
    async export(submission, onProgress) {
      if (!env.enabled || !env.brokerUrl) throw new Error('submissions disabled');
      const files = toFiles(submission);
      const total = files.length;
      const totalBytes = files.reduce((n, f) => n + f.size, 0);
      let done = 0;
      const report = (phase, file) => {
        if (typeof onProgress !== 'function') return;
        onProgress({ done, total, totalBytes, name: file.name, bytes: file.size, phase });
      };
      for (const file of files) {
        report('start', file);
        const contentType = baseType(file.type);
        const grantRes = await doFetch(env.brokerUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: env.token,
            sessionId: submission.sessionId,
            filename: file.name,
            size: file.size,
            contentType,
          }),
        });
        if (!grantRes.ok) {
          let reason = `grant failed (${grantRes.status})`;
          try {
            const body = await grantRes.json();
            if (body && body.reason) reason = `grant refused: ${body.reason}`;
          } catch {
            // keep the status-based reason
          }
          throw new Error(reason);
        }
        const { url, fields } = await grantRes.json();
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        form.append('file', file);
        const upload = await doFetch(url, { method: 'POST', body: form });
        if (!upload.ok) throw new Error(`upload failed (${upload.status})`);
        done++;
        report('done', file);
      }
      return 'submitted';
    },
  };
}

// createFileSink(deps) — deps.zip(files, zipName) -> Promise<File-like> and
// deps.download(file) are both required. Packs the submission's files into
// one archive (via the injected `zip`, e.g. this package's zip.js) and
// hands it to `download`. Always available — needs no server, no network.
export function createFileSink(deps = {}) {
  const { zip, download } = deps;
  return {
    async export(submission, onProgress) {
      const files = toFiles(submission);
      const total = files.length;
      const report = (phase, name) => {
        if (typeof onProgress !== 'function') return;
        onProgress({ done: phase === 'done' ? total : 0, total, name, phase });
      };
      const zipName = `${submission.sessionId}.zip`;
      report('start', zipName);
      const bundle = files.length > 1 ? await zip(files, zipName) : files[0];
      await download(bundle);
      report('done', bundle.name);
      return 'saved';
    },
  };
}

// pickSink(env, deps) — the broker sink when submissions are configured
// and turned on, otherwise the always-available file sink.
export function pickSink(env, deps) {
  if (env && env.enabled && env.brokerUrl) return createBrokerSink(env, deps);
  return createFileSink(deps);
}
