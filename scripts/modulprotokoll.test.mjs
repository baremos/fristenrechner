import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'vite';
import { modulprotokoll } from '../app/astro.config.mjs';
import { pruefeStilOderAsset, zerlegeKennung } from './modulprotokoll.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad/tmp-v8-r3');
mkdirSync(basis, { recursive: true });
const ort = mkdtempSync(join(basis, 'modul-test-'));
test.after(() => rmSync(ort, { recursive: true, force: true }));
const chunk = (datei, ids) => ({ type: 'chunk', fileName: datei, code: 'Probe', isEntry: true, isDynamicEntry: false,
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
  for (const c of Object.values(b)) { mkdirSync(join(ort, 'app/dist'), { recursive: true }); writeFileSync(join(ort, 'app/dist', c.fileName), c.code); }
  p.abschliessen();
  const bytes = readFileSync(datei);
  assert.equal(JSON.stringify(b), vorher);
  assert.ok(!bytes.toString().includes('\r'));
  assert.ok(!bytes.toString().includes(ort.replaceAll('\\', '/')));
  const bericht = JSON.parse(bytes);
  assert.deepEqual(bericht.chunks.map(c => c.datei), ['a.js', 'z.js']);
  assert.deepEqual(bericht.chunks[1].imports, ['a.js', 'z.js']);
  assert.deepEqual(bericht.chunks[1].module.map(m => m.id), ['node_modules/probe/index.js', 'virtuell:vite/preload-helper.js']);
  p.entwerte();
  p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: b.a, z: b.z });
  p.abschliessen();
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

for (const id of [
  'node_modules/probe/index.js?quelle=/privat/modul.js',
  'node_modules/probe/index.js?quelle=C:/privat/modul.js',
  'node_modules/probe/index.js?quelle=C:modul.js',
  'node_modules/probe/index.js?quelle=//server/freigabe/modul.js',
  'node_modules/probe/index.js?quelle=%2F%2Fserver%2Ffreigabe',
  'node_modules/probe/index.js?quelle=\\\\?\\C:\\privat\\modul.js',
  '\0//server/freigabe/modul.js', '\0\\\\?\\C:\\privat\\modul.js',
  '//server/freigabe/modul.js', 'C:modul.js',
]) test(`Abfragepfad Plugin-Gegenprobe: ${JSON.stringify(id)}`, () => {
  const p = modulprotokoll(ort); p.entwerte();
  assert.throws(() => p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', [id]) }), /Kennung außerhalb/);
  assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json')));
  assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json.tmp')));
});

for (const id of ['node_modules/fremd/stil.css', 'node_modules/fremd/bild.svg', 'node_modules/fremd/index.js?url']) {
  for (const umgebung of ['client', 'ssr']) test(`Stil-/Asset-Schutz Plugin-Gegenprobe: Graph ${umgebung}, ${id}, null JS-Bytes`, () => {
    const p = modulprotokoll(ort); p.entwerte();
    const b = { a: chunk('a.js', []) }; b.a.modules[id] = { renderedLength: 0 };
    assert.throws(() => p.generateBundle.call({ environment: { name: umgebung }, getModuleIds: () => [id] }, {}, b), /Stil- oder Asset-Modul/);
    assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json')));
  });
}

test('Build-Abschluss: nur Abschluss veröffentlicht; Abbruch entwertet den alten Stand', () => {
  const p = modulprotokoll(ort, { astro: true });
  const datei = join(ort, 'app/.astro/module-client.json');
  writeFileSync(datei, 'alt'); p.entwerte();
  assert.ok(!existsSync(datei));
  p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', []) });
  assert.ok(!existsSync(datei));
  assert.equal(JSON.parse(readFileSync(datei + '.tmp')).abgeschlossen, false);
  p.buildEnd(new Error('Abbruch'));
  assert.throws(() => p.abschliessen(), /kein vollständiger Client-Build/);
  assert.ok(!existsSync(datei));
});

test('Build-Abschluss: mehrere Client-Ausgaben werden gesammelt; gleiche Dateinamen scheitern', () => {
  const p = modulprotokoll(ort); p.entwerte();
  for (const datei of ['erster.js', 'zweiter.js']) {
    const c = chunk(datei, []); c.imports = [];
    p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: c });
    writeFileSync(join(ort, 'app/dist', datei), c.code);
  }
  p.abschliessen();
  const bericht = JSON.parse(readFileSync(join(ort, 'app/.astro/module-client.json')));
  assert.deepEqual(bericht.chunks.map(c => c.datei), ['erster.js', 'zweiter.js']);
  assert.equal(bericht.chunks[0].groesse, 5);
  assert.equal(bericht.chunks[0].sha256, createHash('sha256').update('Probe').digest('hex'));
  p.entwerte();
  p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', []) });
  assert.throws(() => p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', []) }), /doppelte Client-Ausgabedatei/);
  assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json')));
});

test('Stil-/Asset-Schutz: echter Vite-Build mit Fremd-CSS scheitert ohne gültiges Protokoll', async () => {
  const projekt = join(ort, 'css-probe');
  mkdirSync(join(projekt, 'app'), { recursive: true });
  mkdirSync(join(projekt, 'node_modules/fremd'), { recursive: true });
  writeFileSync(join(projekt, 'index.html'), '<script type="module" src="/main.js"></script>');
  writeFileSync(join(projekt, 'main.js'), 'import "./node_modules/fremd/stil.css";');
  writeFileSync(join(projekt, 'node_modules/fremd/stil.css'), 'body{color:red}');
  await assert.rejects(build({ root: projekt, configFile: false, logLevel: 'silent',
    build: { outDir: 'app/dist' }, plugins: [modulprotokoll(projekt)] }), /Stil- oder Asset-Modul/);
  assert.ok(!existsSync(join(projekt, 'app/.astro/module-client.json')));
});

for (const anhang of [
  '"//server/freigabe/modul.js"', '%22%2F%2Fserver%2Ffreigabe%2Fmodul.js%22',
  "'//server/freigabe/modul.js'", '%27%2F%2Fserver%2Ffreigabe%2Fmodul.js%27',
  '"/privat/modul.js"', '%22%2Fprivat%2Fmodul.js%22',
  '"C:/privat/modul.js"', '%22C%3A%2Fprivat%2Fmodul.js%22',
  '[//server/freigabe]', '{/privat/modul.js}', 'relative//server', 'relativeC:modul.js',
  'relative\\modul.js', 'relative%5Cmodul.js',
]) test(`Abfragepfad: zitierter, kodierter oder eingebetteter absoluter Inhalt ${anhang}`, () => {
  const id = 'node_modules/probe/index.js?quelle=' + anhang;
  assert.throws(() => zerlegeKennung(id), /Abfrageanhang/);
  const p = modulprotokoll(ort); p.entwerte();
  assert.throws(() => p.generateBundle.call({ environment: { name: 'client' } }, {}, { a: chunk('a.js', [id]) }), /Kennung außerhalb/);
  assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json')));
  assert.ok(!existsSync(join(ort, 'app/.astro/module-client.json.tmp')));
});

for (const [anhang, erlaubt] of [
  ['astro&type=script&index=0&lang.ts', true],
  ['astro&type=style&index=0&lang.css', false],
  ['astro&type=script&type=style', false],
  ['astro&type=script&url', false],
  ['astro&type=script&raw', false],
  ['astro&type=script&inline', false],
  ['type=script&index=0&lang.ts', false],
  ['astro&index=0&lang.ts', false],
]) test(`Astro-Teilmodul: ${anhang}, ${erlaubt ? 'Code erlaubt' : 'Stil oder unbekannte Form gesperrt'}`, () => {
  const id = 'node_modules/probe/Komponente.astro?' + anhang;
  const pruefen = () => pruefeStilOderAsset(id);
  if (erlaubt) assert.doesNotThrow(pruefen);
  else assert.throws(pruefen, /Stil- oder Asset-Modul/);
  const p = modulprotokoll(ort); p.entwerte();
  const graph = () => p.generateBundle.call({ environment: { name: 'client' }, getModuleIds: () => [id] }, {}, { a: chunk('a.js', [id]) });
  if (erlaubt) {
    graph();
    assert.deepEqual(JSON.parse(readFileSync(join(ort, 'app/.astro/module-client.json.tmp'))).modulgraph, [id]);
  } else assert.throws(graph, /Stil- oder Asset-Modul/);
});

test('Virtueller CommonJS-Proxy: absolute Pfade innerhalb der Wurzel zuerst relativieren', () => {
  const p = modulprotokoll(ort); p.entwerte();
  const intern = join(ort, 'app/src/modul.js');
  const ids = [...new Set([intern, intern.replaceAll('\\', '/')])].map(p => '\0' + p + '?commonjs-proxy');
  p.generateBundle.call({ environment: { name: 'client' }, getModuleIds: () => ids }, {}, { a: chunk('a.js', ids) });
  const bericht = JSON.parse(readFileSync(join(ort, 'app/.astro/module-client.json.tmp')));
  assert.deepEqual(bericht.modulgraph, ['virtuell:app/src/modul.js?commonjs-proxy']);
  assert.ok(bericht.chunks[0].module.every(m => m.id === 'virtuell:app/src/modul.js?commonjs-proxy'));
});
