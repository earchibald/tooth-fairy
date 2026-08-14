#!/usr/bin/env node
// The workshop server: serves the game AND accepts the Workshop tab's
// save/release. Node built-ins only. Binds loopback only — this is a dev
// tool, not a deployment.
//
//   node scripts/workshop-server.js [port]   (default 8123)

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

const TUNED_HEADER = '// Written by the Workshop (scripts/workshop-server.js). Do not hand-edit;\n' +
  '// tune in the Workshop tab and press "save to project".\n';

// Release steps in order. `git diff --cached --quiet` exits 0 when NOTHING
// is staged — for that step exit 0 means "stop cleanly: nothing to release"
// and exit 1 means "changes staged, continue". checkStopsWhenOk marks it.
export const RELEASE_STEPS = [
  { name: 'tests', cmd: 'node', args: ['--test', 'test/'], glob: true },
  { name: 'stage', cmd: 'git', args: ['add', 'js/config/tuned.js'] },
  { name: 'check', cmd: 'git', args: ['diff', '--cached', '--quiet'], checkStopsWhenOk: true },
  { name: 'commit', cmd: 'git', args: ['commit', '-m', 'Workshop: tune banner and tap juice'] },
  { name: 'push', cmd: 'git', args: ['push'] },
];

function defaultRunner(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 300000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: String(stdout || '') + String(stderr || '') });
      });
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body);
}

export function createWorkshopServer({ root, runner = defaultRunner }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        if (url.pathname === '/api/save-vfx') {
          let parsed;
          try { parsed = JSON.parse(await readBody(req, 64 * 1024)); }
          catch { return json(res, 400, { error: 'bad json or too large' }); }
          const vfx = parsed && parsed.vfx;
          if (!vfx || typeof vfx !== 'object' || Array.isArray(vfx) ||
              !Object.keys(vfx).length) {
            return json(res, 400, { error: 'body must be {vfx: {...}} and non-empty' });
          }
          const file = path.join(root, 'js', 'config', 'tuned.js');
          const src = TUNED_HEADER + 'export const TUNED = ' +
            JSON.stringify(vfx, null, 2) + ';\n';
          await fs.writeFile(file, src);
          return json(res, 200, { ok: true, file: 'js/config/tuned.js' });
        }
        if (url.pathname === '/api/release') {
          const steps = [];
          let ok = true;
          for (const step of RELEASE_STEPS) {
            // The test runner needs the glob expanded (no shell): list test/.
            let args = step.args;
            if (step.glob) {
              try {
                const files = (await fs.readdir(path.join(root, 'test'))).filter((f) => f.endsWith('.test.js'));
                if (files.length) args = ['--test', ...files.map((f) => path.join('test', f))];
              } catch { /* recording runners don't need real files */ }
            }
            const r = await runner(step.cmd, args, root);
            if (step.checkStopsWhenOk && r.ok) {
              steps.push({ name: step.name, ok: true, output: 'nothing to release' });
              return json(res, 200, { ok: true, steps, nothingToRelease: true });
            }
            if (step.checkStopsWhenOk && !r.ok) {
              steps.push({ name: step.name, ok: true, output: 'changes staged' });
              continue;
            }
            steps.push({ name: step.name, ok: r.ok, output: r.output.slice(-4000) });
            if (!r.ok) { ok = false; break; }
          }
          return json(res, 200, { ok, steps });
        }
        return json(res, 404, { error: 'unknown api' });
      }

      // ---- static ----
      if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
      let p = decodeURIComponent(url.pathname);
      if (p === '/') p = '/index.html';
      const file = path.resolve(root, '.' + p);
      if (!file.startsWith(path.resolve(root) + path.sep) && file !== path.resolve(root)) {
        return json(res, 403, { error: 'forbidden' });
      }
      let data;
      try { data = await fs.readFile(file); }
      catch { return json(res, 404, { error: 'not found' }); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(data);
    } catch (err) {
      return json(res, 500, { error: String(err && err.message || err) });
    }
  });
}

// CLI entry: `node scripts/workshop-server.js [port]`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const port = Number(process.argv[2]) || 8123;
  createWorkshopServer({ root }).listen(port, '127.0.0.1', () => {
    console.log(`workshop server: http://127.0.0.1:${port}/?dev=1`);
  });
}
