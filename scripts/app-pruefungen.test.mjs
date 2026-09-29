// Tests der Prüfungen K1 und K2 der App mit Gegenproben, die scheitern müssen.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { analysiereSkript, dateistamm, pruefeDist, pruefeKonfiguration, VORGABE } from './app-pruefungen.mjs';

const echteKonfiguration = JSON.parse(readFileSync(new URL('../app/capacitor.config.json', import.meta.url), 'utf8'));
const arbeit = mkdtempSync(join(tmpdir(), 'app-pruefungen-'));
after(() => rmSync(arbeit, { recursive: true, force: true }));

let zaehler = 0;
function ordner(dateien) {
  const wurzel = join(arbeit, `f${++zaehler}`);
  for (const [name, inhalt] of Object.entries(dateien)) {
    const pfad = join(wurzel, ...name.split('/'));
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, inhalt);
  }
  return wurzel;
}

const kopie = () => structuredClone(echteKonfiguration);
function setze(objekt, pfad, wert) {
  const teile = pfad.split('.');
  let o = objekt;
  for (const t of teile.slice(0, -1)) o = o[t] ??= {};
  o[teile.at(-1)] = wert;
  return objekt;
}

// K1 -------------------------------------------------------------------------

test('K1: die eingecheckte Konfiguration besteht', () => {
  const pub = ordner({ 'startfehler.html': '<!doctype html><head></head>' });
  assert.deepEqual(pruefeKonfiguration(echteKonfiguration, { publicOrdner: pub }), []);
});

const falsche = [
  ['server.url', 'http://10.0.2.2:3000'],
  ['server.cleartext', true],
  ['server.allowNavigation', ['*']],
  ['android.allowMixedContent', true],
  ['android.useLegacyBridge', true],
  ['android.webContentsDebuggingEnabled', false],
  ['android.buildOptions', {}],
  ['loggingBehavior', 'production'],
  ['android.loggingBehavior', 'none'],
  ['plugins.CapacitorHttp.enabled', true],
  ['plugins.CapacitorCookies.enabled', true],
  ['server.hostname', 'app'],
  ['server.androidScheme', 'http'],
  ['server.errorPath', 'fehlt.html'],
  ['appId', 'de.baremos.anders'],
  ['webDir', 'www'],
  ['includePlugins', '@capacitor/share'],
  ['android.minWebViewVersion', 60],
  ['android.minWebViewVersion', '83'],
];
for (const [pfad, wert] of falsche) {
  test(`K1 Gegenprobe: ${pfad} = ${JSON.stringify(wert)}`, () => {
    const pub = ordner({ 'startfehler.html': 'x' });
    const fehler = pruefeKonfiguration(setze(kopie(), pfad, wert), { publicOrdner: pub });
    assert.ok(fehler.length > 0);
    assert.ok(fehler.some((f) => f.includes(pfad.split('.').at(-1)) || f.includes('Fehlerseite')), fehler.join('\n'));
  });
}

test('K1 Gegenprobe: Fehlerseite fehlt in public', () => {
  const fehler = pruefeKonfiguration(echteKonfiguration, { publicOrdner: ordner({ 'andere.html': 'x' }) });
  assert.deepEqual(fehler, ['Die Fehlerseite startfehler.html fehlt im Ordner public.']);
});

test('K1 Gegenprobe: keine Konfiguration', () => {
  assert.equal(pruefeKonfiguration(null).length, 1);
  assert.equal(pruefeKonfiguration([]).length, 1);
});

// K2: Skripte ----------------------------------------------------------------

test('Dateistamm ohne Hash von Vite', () => {
  assert.equal(dateistamm('_astro/jspdf.es.min.DrSiKu-u.js'), 'jspdf.es.min');
  assert.equal(dateistamm('_astro/Fristenrechner.astro_astro_type_script_index_0_lang.DWQGDAA6.js'), 'Fristenrechner.astro_astro_type_script_index_0_lang');
  assert.equal(dateistamm('_astro/ohne-hash.js'), 'ohne-hash');
});

const syntaxFunde = [
  ['a ||= b;', 'logische Zuweisung'],
  ['a &&= b;', 'logische Zuweisung'],
  ['a ??= b;', 'logische Zuweisung'],
  ['class K { #m() {} }', 'private Methode'],
  ['class K { get #g() { return 1; } }', 'privater Accessor'],
  ['class K { #x; static t(o) { return #x in o; } }', '#x in'],
  ['class K { static { this.a = 1; } }', 'statischer Block'],
  ['await Promise.resolve();', 'Top-Level-await'],
  ['for await (const x of y) {}', 'Top-Level-await'],
  ['const r = /a/d;', 'RegExp-Flag d'],
  ['const r = /[a]/v;', 'RegExp-Flag v'],
  ['import d from "./d.json" with { type: "json" };', 'Import-Attribute'],
  ['export { a as "b c" } from "./x.js";', 'Modulname als Zeichenkette'],
];
for (const [quelltext, merkmal] of syntaxFunde) {
  test(`Syntax über Chromium 83 erkannt: ${quelltext}`, () => {
    assert.equal(analysiereSkript(quelltext, 'module').syntax[merkmal], 1);
  });
}

test('Syntax bis Chromium 83 bleibt ohne Fund', () => {
  const a = analysiereSkript('const x = o?.a ?? 1; class K { #p = 1; static s = 2; get p() { return this.#p; } } async function f() { await g(); for await (const y of z) {} } const n = 1_000;', 'module');
  assert.deepEqual(a.syntax, {});
  assert.deepEqual(a.fehler, []);
});

test('Top-Level-await im klassischen Skript wird gezählt, nicht als Lesefehler gemeldet', () => {
  const a = analysiereSkript('await x;', 'script');
  assert.equal(a.syntax['Top-Level-await'], 1);
  assert.deepEqual(a.fehler, []);
});

test('Laufzeitfunktionen werden als Eigenschaft, hinter ?. und als Zeichenkette erkannt', () => {
  const a = analysiereSkript('e.replaceChildren(); l?.at(0); l.at(-1); o["findLast"](f); const n = "hasOwn"; structuredClone(x); new WeakRef(o);', 'module');
  assert.deepEqual(a.laufzeit, { replaceChildren: 1, at: 2, findLast: 1, hasOwn: 1, structuredClone: 1, WeakRef: 1 });
});

test('Gleichnamige Variablen und Schlüssel zählen nicht als Laufzeitfunktion', () => {
  const a = analysiereSkript('let at = 1; const o = { at: 2, replaceChildren: 3 }; function f(at) { return at; }', 'module');
  assert.deepEqual(a.laufzeit, {});
});

test('Adressen in Zeichenketten und Template-Stücken, auch ohne Schema', () => {
  const a = analysiereSkript('const a = "<x xmlns=\\"http://example.invalid/ns\\">"; const b = `https://${c}`; const d = "www.example.invalid/pfad/";', 'module');
  assert.deepEqual(a.adressen, ['http://example.invalid/ns', 'https://', 'www.example.invalid/pfad/']);
});

test('Nicht lesbares Skript ist ein Fehler', () => {
  assert.equal(analysiereSkript('const = ;', 'module').fehler.length, 1);
});

// K2: Ordner -----------------------------------------------------------------

const SAUBER = {
  'index.html': '<!doctype html><html><head><link rel="stylesheet" href="/_astro/a.AbCdEfGh.css"><script>window.x = 1;</script></head><body><script type="module" src="/_astro/haupt.AbCdEfGh.js"></script><pre>http://www.apache.org/licenses/</pre></body></html>',
  'startfehler.html': '<!doctype html><html><head><style>body{margin:0}</style></head><body><p>Text</p></body></html>',
  '_astro/haupt.AbCdEfGh.js': 'export const a = 1;',
  '_astro/a.AbCdEfGh.css': '.a{background:url(data:image/png;base64,AA==)}',
};

test('K2: sauberer Ordner besteht', () => {
  const { fehler, bericht } = pruefeDist(ordner(SAUBER));
  assert.deepEqual(fehler, []);
  assert.equal(bericht.dateien, 4);
});

const k2Gegenproben = [
  ['logische Zuweisung im Modul', { '_astro/haupt.AbCdEfGh.js': 'let a; a ||= 1;' }, /logische Zuweisung/],
  ['replaceChildren', { '_astro/haupt.AbCdEfGh.js': 'document.body.replaceChildren();' }, /replaceChildren ohne Eintrag/],
  ['at hinter ?.', { '_astro/haupt.AbCdEfGh.js': 'export const x = l?.at(0);' }, /at ohne Eintrag/],
  ['Laufzeitausnahme über der Höchstzahl', { '_astro/jspdf.es.min.AbCdEfGh.js': 'a.at(1); a.at(2); a.at(3); a.at(4); a.at(5);' }, /5 × at, erlaubt sind 4/],
  ['Adresse ohne Eintrag', { '_astro/haupt.AbCdEfGh.js': 'fetch("https://example.invalid/g");' }, /Adresse ohne Eintrag/],
  ['erlaubte Adresse zu oft', { '_astro/html2canvas.AbCdEfGh.js': 'const a = "http://www.w3.org/2000/svg", b = "http://www.w3.org/2000/svg", c = "http://www.w3.org/2000/svg";' }, /3 × http:\/\/www\.w3\.org\/2000\/svg, erlaubt sind 2/],
  ['erlaubte Adresse in anderer Datei', { '_astro/haupt.AbCdEfGh.js': 'const a = "http://www.w3.org/2000/svg";' }, /Adresse ohne Eintrag/],
  ['Skript in der Fehlerseite', { 'startfehler.html': '<!doctype html><html><head></head><body><script>1</script></body></html>' }, /Fehlerseite darf kein Skript/],
  ['Fehlerseite fehlt', { 'startfehler.html': null }, /startfehler\.html fehlt in dist/],
  ['index.html fehlt', { 'index.html': null }, /index\.html fehlt in dist/],
  ['Source-Map', { '_astro/haupt.AbCdEfGh.js.map': '{}' }, /Source-Maps/],
  ['HTML ohne head', { 'startfehler.html': '<!doctype html><html><body><p>x</p></body></html>' }, /<head> fehlt/],
  ['src nach außen', { 'index.html': '<!doctype html><html><head></head><body><img src="https://example.invalid/b.png"></body></html>' }, /src="https:\/\/example\.invalid\/b\.png" verweist nach außen/],
  ['href mit mailto', { 'index.html': '<!doctype html><html><head></head><body><a href="mailto:x@example.invalid">x</a></body></html>' }, /href="mailto:/],
  ['action mit //', { 'index.html': '<!doctype html><html><head></head><body><form action=//example.invalid/f></form></body></html>' }, /action="\/\/example\.invalid\/f"/],
  ['CSS mit url nach außen', { '_astro/a.AbCdEfGh.css': '.a{background:url(https://example.invalid/b.png)}' }, /url\(https:/],
  ['CSS mit @import', { '_astro/a.AbCdEfGh.css': '@import "x.css";' }, /@import/],
  ['style-Element mit url', { 'index.html': '<!doctype html><html><head><style>.a{background:url("/bild.png")}</style></head><body></body></html>' }, /url\(\/bild\.png\)/],
  ['klassisches Inline-Skript mit Top-Level-await', { 'index.html': '<!doctype html><html><head><script>await x;</script></head><body></body></html>' }, /index\.html: 1 × Top-Level-await/],
  ['eingebettetes Modul mit logischer Zuweisung', { 'index.html': '<!doctype html><html><head></head><body><script type="module">let a; a ??= 1;</script></body></html>' }, /index\.html: 1 × logische Zuweisung/],
  ['eingebettetes Modul mit Laufzeitfunktion', { 'index.html': '<!doctype html><html><head></head><body><script type="module">document.body.replaceChildren();</script></body></html>' }, /index\.html: 1 × replaceChildren/],
];
for (const [titel, aenderung, muster] of k2Gegenproben) {
  test(`K2 Gegenprobe: ${titel}`, () => {
    const dateien = { ...SAUBER };
    for (const [name, inhalt] of Object.entries(aenderung)) {
      if (inhalt === null) delete dateien[name];
      else dateien[name] = inhalt;
    }
    const { fehler } = pruefeDist(ordner(dateien));
    assert.ok(fehler.some((f) => muster.test(f)), `erwartet ${muster}, erhalten:\n${fehler.join('\n')}`);
  });
}

test('K2: Laufzeitausnahme bis zur Höchstzahl besteht', () => {
  const { fehler } = pruefeDist(ordner({ ...SAUBER, '_astro/jspdf.es.min.AbCdEfGh.js': 'a.at(1); a.at(2); a.at(3); a.at(4);' }));
  assert.deepEqual(fehler, []);
});

test('K2: Verweis auf @capacitor in plattformfreien Quellen wird gemeldet', () => {
  const quellen = ordner({ 'ui.ts': "import { Capacitor } from '@capacitor/core';" });
  const { fehler } = pruefeDist(ordner(SAUBER), { quellOrdner: [quellen] });
  assert.ok(fehler.some((f) => /Verweis auf @capacitor/.test(f)), fehler.join('\n'));
  assert.deepEqual(pruefeDist(ordner(SAUBER), { quellOrdner: [ordner({ 'ui.ts': 'export {};' })] }).fehler, []);
});

test('K2: fehlender Ordner', () => {
  assert.match(pruefeDist(join(arbeit, 'gibt-es-nicht')).fehler[0], /fehlt/);
});

test('Regeldatei: jede Ausnahme und jede Adresse hat Datei, Höchstzahl und Grund', () => {
  for (const a of [...VORGABE.laufzeitAusnahmen, ...VORGABE.adressen]) {
    assert.equal(typeof a.datei, 'string');
    assert.ok(Number.isInteger(a.hoechstzahl) && a.hoechstzahl > 0);
    assert.ok(typeof a.grund === 'string' && a.grund.length > 10);
  }
  const namen = new Set(VORGABE.laufzeitNamen.map((n) => n.name));
  for (const a of VORGABE.laufzeitAusnahmen) assert.ok(namen.has(a.name), a.name);
  for (const n of VORGABE.laufzeitNamen) assert.ok(n.ab > VORGABE.konfiguration.minWebViewVersion, n.name);
});
