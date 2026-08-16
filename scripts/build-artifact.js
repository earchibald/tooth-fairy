#!/usr/bin/env node
// Bundle the whole game into one self-contained artifact page. Zero deps.
//
// The transform is deliberately dumb and loudly guarded: this codebase uses
// named exports only, no live bindings, literal dynamic imports. If a future
// edit breaks an invariant, fail the build with the file named — never emit
// a silently-wrong bundle.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

function die(msg) { throw new Error('[build-artifact] ' + msg); }

export function build() {
  // ---- collect the module graph ----
  const sources = new Map();    // relPath -> source
  const staticDeps = new Map(); // relPath -> [relPath]

  function resolveSpec(fromRel, spec) {
    if (!spec.startsWith('.')) die(fromRel + ' imports bare specifier ' + spec);
    return rel(resolve(join(ROOT, dirname(fromRel)), spec));
  }

  function load(relPath) {
    if (sources.has(relPath)) return;
    const abs = join(ROOT, relPath);
    if (!existsSync(abs)) die('missing module ' + relPath);
    const src = readFileSync(abs, 'utf8');
    for (const bad of [/export\s+default/, /export\s+(let|var)\s/, /import\s*\*\s*as/]) {
      if (bad.test(src)) die(relPath + ' violates bundler invariant ' + bad);
    }
    sources.set(relPath, src);
    const deps = [];
    const importRe = /(?:^|\n)\s*(?:import\s*(?:\{[^}]*\}\s*from\s*)?|export\s*\{[^}]*\}\s*from\s*)['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(importRe)) deps.push(resolveSpec(relPath, m[1]));
    staticDeps.set(relPath, deps);
    for (const d of deps) load(d);
    // Dynamic imports join the graph but are not topo edges. A target that does
    // not exist yet (js/embed/boot.js before Task 7) is skipped quietly: the
    // rewritten call resolves to undefined and the caller's .catch handles it.
    for (const m of src.matchAll(/import\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
      const target = resolveSpec(relPath, m[2]);
      if (existsSync(join(ROOT, target))) load(target);
    }
    if (/import\(\s*[^'"`)]/.test(src)) die(relPath + ': non-literal dynamic import');
  }

  load('js/main.js');
  // Embed modules ship whenever present (chat lands in a later task).
  if (existsSync(join(ROOT, 'js/embed'))) {
    for (const f of readdirSync(join(ROOT, 'js/embed'))) {
      if (f.endsWith('.js')) load('js/embed/' + f);
    }
  }

  // ---- topo order (static edges only; cycles are a build error) ----
  const order = [];
  const mark = new Map(); // 0 visiting, 1 done
  function visit(p, chain) {
    if (mark.get(p) === 1) return;
    if (mark.get(p) === 0) die('import cycle: ' + [...chain, p].join(' -> '));
    mark.set(p, 0);
    for (const d of staticDeps.get(p)) visit(d, [...chain, p]);
    mark.set(p, 1);
    order.push(p);
  }
  for (const p of sources.keys()) visit(p, []);
  const eager = order.filter((p) => p !== 'js/main.js'); // main runs via TF_START

  // ---- transform one module body ----
  function transform(relPath, src) {
    let out = src;
    // export { a, b as c } from './x.js'
    out = out.replace(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
      const dep = resolveSpec(relPath, spec);
      return names.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return `__exp.${alias} = __modules[${JSON.stringify(dep)}].${orig};`;
      }).join(' ');
    });
    // import { a, b as c } from './x.js'
    out = out.replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
      const dep = resolveSpec(relPath, spec);
      const parts = names.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return orig === alias ? orig : `${orig}: ${alias}`;
      }).filter(Boolean);
      return `const { ${parts.join(', ')} } = __modules[${JSON.stringify(dep)}];`;
    });
    // bare side-effect import
    out = out.replace(/import\s*['"]([^'"]+)['"];?/g, () => '');
    // export declarations -> plain declaration + registration appended at end
    const names = [];
    out = out.replace(/export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g,
      (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
    // export { a, b as c };   (local list)
    out = out.replace(/export\s*\{([^}]*)\};?/g, (_, list) =>
      list.split(',').map((n) => {
        if (!n.trim()) return '';
        const [orig, alias = orig] = n.split(/\s+as\s+/).map((s) => s.trim());
        return `__exp.${alias} = ${orig};`;
      }).join(' '));
    // dynamic import -> registry promise
    out = out.replace(/import\(\s*(['"`])([^'"`]+)\1\s*\)/g, (_, __q, spec) =>
      `Promise.resolve(__modules[${JSON.stringify(resolveSpec(relPath, spec))}])`);
    // import.meta.url -> stable fake file URL (sound.js only uses it as a URL base)
    out = out.replace(/import\.meta\.url/g, JSON.stringify('file:///bundle/' + relPath));
    if (/(^|[^.\w'"`])import[\s(]/.test(out)) die(relPath + ': unhandled import syntax survived transform');
    if (/(^|\n)\s*export\s/.test(out)) die(relPath + ': unhandled export syntax survived transform');
    return out + '\n' + names.map((n) => `__exp.${n} = ${n};`).join('\n');
  }

  // ---- emit bundle.js ----
  let js = `// GENERATED by scripts/build-artifact.js — do not edit.\n(function (global) {\nconst __modules = {};\n`;
  for (const p of eager) {
    js += `\n// ---- ${p} ----\n__modules[${JSON.stringify(p)}] = (function () {\nconst __exp = {};\n`
        + transform(p, sources.get(p))
        + `\nreturn __exp;\n})();\n`;
  }
  js += `\nglobal.TF_MODULES = __modules;\nglobal.TF_START = function () {\n`
      + transform('js/main.js', sources.get('js/main.js'))
      + `\n};\n})(typeof window !== 'undefined' ? window : globalThis);\n`;

  // The bundle is inlined inside a <script> tag; any literal script terminator
  // in a game string would truncate the page. Fail loudly rather than emit it.
  if (/<\/script/i.test(js)) die('emitted bundle contains a literal </script sequence');

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/bundle.js'), js);

  // ---- emit the artifact page ----
  const gameCss = readFileSync(join(ROOT, 'css/main.css'), 'utf8');
  const wavB64 = readFileSync(join(ROOT, 'assets/microtick.wav')).toString('base64');
  const versionMatch = readFileSync(join(ROOT, 'js/version.js'), 'utf8').match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
  const version = versionMatch ? 'v' + versionMatch[1] : '';
  const versionSuffix = version ? ' ' + version : '';

  const shellCss = `
/* ---- dev-suite shell: full-desktop, panel left, game right ---- */
html.tf-embed, html.tf-embed body { position: static; overflow: hidden;
  width: 100%; height: 100%; margin: 0; background: #07090f; }
#tf-shell { display: grid; grid-template-columns: 1fr 500px; height: 100vh; }
#tf-dev { min-width: 0; overflow: hidden; border-right: 1px solid #ffffff22;
  display: flex; flex-direction: column; background: #0b0e17; }
#tf-dev .tf-brand { font: 11px/1 ui-monospace, Menlo, monospace; color: #6a7188;
  letter-spacing: 0.14em; text-transform: uppercase; padding: 8px 12px 0; }
#tf-dev .devPanel--docked { flex: 1; min-height: 0; }
#tf-game { display: flex; align-items: stretch; justify-content: center;
  background: #07090f; overflow: hidden; }
#tf-game #app { width: 480px; max-width: 480px; height: 100vh; margin: 0; }
`;

  const shell = `<title>tooth fairy · dev suite${versionSuffix}</title>
<style>
${gameCss}
${shellCss}
</style>
<div id="tf-shell">
  <div id="tf-dev">
    <div class="tf-brand">tooth fairy · dev suite${versionSuffix} · [ ] cycle tabs · shift+1..8 jump · \` chat</div>
  </div>
  <div id="tf-game"><div id="app" data-act="0"></div></div>
</div>
<div id="tf-chat-root"></div>
<script>
document.documentElement.classList.add('tf-embed');
// Storage shim: the artifact sandbox may deny localStorage; the game and the
// override layer degrade to session-lifetime memory rather than crashing.
try { localStorage.getItem('tf-probe'); } catch (e) {
  const mem = new Map();
  try {
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    } });
  } catch (e2) { /* hopeless; the game guards its own storage writes */ }
}
window.TF_EMBED = true;
window.TF_TAP_CLIP_B64 = ${JSON.stringify(wavB64)};
</scr` + `ipt>
<script>
${js}
TF_START();
</scr` + `ipt>
`;
  writeFileSync(join(ROOT, 'dist/dev-suite.html'), shell);
  writeFileSync(join(ROOT, 'dist/dev-suite-local.html'),
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"></head><body>\n${shell}\n</body></html>\n`);
  return ['dist/bundle.js', 'dist/dev-suite.html', 'dist/dev-suite-local.html'];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('[build-artifact] wrote ' + build().join(', '));
}
