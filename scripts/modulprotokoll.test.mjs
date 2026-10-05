import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'vite';
import { modulprotokoll } from '../app/astro.config.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad/tmp-v8');
mkdirSync(basis, { recursive: true });
const ort = mkdtempSync(join(basis, 'modul-test-'));
test.after(() => rmSync(ort, { recursive: true, force: true }));
const chunk = (datei, ids) => ({ type: 'chunk', fileName: datei, isEntry: true, isDynamicEntry: false,
  imports: ['z.js', 'a.js'], dynamicImports: [], modules: Object.fromEntries(ids.map(id => [id, { renderedLength: 10, originalLength: 15 }])) });

test('Plugin: nur Client, keine Konsole, sortierte relative Kennungen, LF und deterministisch', t => {
  const p = modulprotokoll(ort);
  for (const methode of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, methode, () => assert.fail('Plugin gibt auf der Konsole aus'));
  const b = { z: chunk('z.js', [join(ort, 'node_modules/probe/index.js'), '\0vite/preload-helper.js']), a: chunk('a.js', [join(ort, 'app/src/index.ts')]) };
  p.generateBundle.call({ environment: { name: 'ssr' } }, {}, b);
  const datei = join(ort, 'app/.astro/module-client.json');
  assert.ok(!existsSync(datei));
  const vorher = JSON.stringify(b);
  p.generateBundle.call({ environment: { name: 'client' } }, {}, b);
  const bytes = readFileSync(datei);
  assert.equal(JSON.stringify(b), vorher);
  assert.ok(!bytes.toString().includes('\r'));
  assert.ok(!bytes.toString().includes(ort.replaceAll('\\', '/')));
  const bericht = JSON.parse(bytes);
  assert.deepEqual(bericht.chunks.map(c => c.datei), ['a.js', 'z.js']);
  assert.deepEqual(bericht.chunks[1].imports, ['a.js', 'z.js']);
  assert.deepEqual(bericht.chunks[1].module.map(m => m.id), ['node_modules/probe/index.js', 'virtuell:vite/preload-helper.js']);
  p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: b.a, z: b.z });
  assert.ok(readFileSync(datei).equals(bytes));
});
test('Plugin: absolute Kennungen außerhalb der Wurzel scheitern ohne Pfadausgabe', () => {
  const p = modulprotokoll(ort);
  for (const id of ['/fremd/geheim/modul.js', 'C:/fremd/geheim/modul.js', '\0C:/fremd/geheim/modul.js']) {
    assert.throws(() => p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', [id]) }),
      { message: 'Modulprotokoll: Kennung außerhalb der Repositorywurzel.' });
  }
});
function hashes(pfad, rel = '') {
  return readdirSync(join(pfad, rel), { withFileTypes: true }).flatMap(e => {
    const p = rel ? rel + '/' + e.name : e.name;
    return e.isDirectory() ? hashes(pfad, p) : [[p, createHash('sha256').update(readFileSync(join(pfad, p))).digest('hex')]];
  }).sort((a, b) => a[0] < b[0] ? -1 : 1);
}
test('Plugin: echter Offline-Vite-Build lässt dist bytegleich und schreibt nur nach .astro', async () => {
  const projekt = join(ort, 'vite-probe');
  mkdirSync(join(projekt, 'app'), { recursive: true });
  writeFileSync(join(projekt, 'index.html'), '<script type="module" src="/main.js"></script>');
  writeFileSync(join(projekt, 'main.js'), 'document.body.textContent = "Probe"; import("./zweiter.js");');
  writeFileSync(join(projekt, 'zweiter.js'), 'document.body.dataset.probe = "zwei";');
  const config = { root: projekt, configFile: false, logLevel: 'silent', build: { outDir: 'app/dist' } };
  await build(config);
  const ohne = hashes(join(projekt, 'app/dist'));
  await build({ ...config, plugins: [modulprotokoll(projekt)] });
  assert.deepEqual(hashes(join(projekt, 'app/dist')), ohne);
  assert.ok(existsSync(join(projekt, 'app/.astro/module-client.json')));
  assert.ok(!existsSync(join(projekt, 'app/dist/module-client.json')));
});
