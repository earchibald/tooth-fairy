# submit

A standalone, reusable submission client. Vanilla ESM, zero dependencies,
no build step. This directory does not know what a "session" contains or
who is producing it — it only knows how to move a named list of files from
a browser to one of two places: a small upload broker, or a local
download. Drop this whole directory into any other vanilla-ESM project
with no edits and it works the same way there.

Do not import anything from outside this directory into it. Its vocabulary
is `submission`, `session`, `file` — nothing app-specific.

## Tests live outside this directory

The two test files exercising this package — `test/submit-zip.test.js` and
`test/submit-client.test.js` — live at the parent repo's `test/` root, not
inside `js/submit/`, because that repo's test runner (`node --test`) only
looks there. Moving this directory into another project means moving those
two files alongside it and fixing their imports: they currently read
`../js/submit/...`; from the new location they need whatever relative path
reaches the moved directory.

## Input type

Every function in this package takes the same shape:

```js
// submission
{
  sessionId: string,
  files: [
    { name: string, blob: Blob, contentType: string },
    // ...
  ],
}
```

## Sinks

```js
createBrokerSink(env, deps) -> { export(submission, onProgress) }
createFileSink(deps)        -> { export(submission, onProgress) }
pickSink(env, deps)         -> sink
```

`env` is the `SUBMIT_ENV` shape from `env.js`:

```js
{ enabled: boolean, brokerUrl: string, token: string }
```

`deps` supplies every side effect: `deps.fetch` for the broker sink,
`deps.zip` + `deps.download` for the file sink. Nothing is read off a
global, so both sinks run under plain `node --test` with no network and
no DOM.

`pickSink(env, deps)` returns the broker sink when `env.enabled &&
env.brokerUrl`, otherwise the file sink — callers do not need to branch
themselves.

## Consumer example

```js
import { pickSink } from './client.js';
import { zipFiles } from './zip.js';
import { SUBMIT_ENV } from './env.js';

const submission = {
  sessionId: 'abc123',
  files: [{ name: 'log.jsonl', blob: myBlob, contentType: 'text/plain' }],
};

const sink = pickSink(SUBMIT_ENV, { fetch, zip: zipFiles, download: saveFile });
const result = await sink.export(submission, (p) => console.log(p.phase, p.name));
```
