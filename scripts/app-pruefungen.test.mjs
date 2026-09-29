// Tests der Prüfungen K1 und K2 der App mit Gegenproben, die scheitern müssen.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { analysiereSkript, attributeVon, dateistamm, pruefeDist, pruefeKonfiguration, skriptArt, VORGABE } from './app-pruefungen.mjs';

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

// Capacitor liest einige Einstellungen auch auf der obersten Ebene und wandelt
// "true" in true um (CapConfig.java, JSONObject.getBoolean).
const k1Varianten = [
  ['Wurzelfeld allowMixedContent', (c) => { c.allowMixedContent = true; }, /^allowMixedContent ist keine erlaubte Einstellung/],
  ['Wurzelfeld allowMixedContent als Text', (c) => { c.allowMixedContent = 'true'; }, /^allowMixedContent darf nur fehlen oder false sein/],
  ['android.allowMixedContent als Text', (c) => { c.android.allowMixedContent = 'true'; }, /^android\.allowMixedContent darf nur fehlen oder false sein/],
  ['android.useLegacyBridge als Text', (c) => { c.android.useLegacyBridge = 'TRUE'; }, /^android\.useLegacyBridge darf nur fehlen oder false sein/],
  ['CapacitorHttp als Text', (c) => { c.plugins.CapacitorHttp = { enabled: 'true' }; }, /^plugins\.CapacitorHttp\.enabled darf nur fehlen oder false sein/],
  ['CapacitorCookies als Text', (c) => { c.plugins.CapacitorCookies = { enabled: 'true' }; }, /^plugins\.CapacitorCookies\.enabled darf nur fehlen oder false sein/],
  ['unbekannter Schlüssel server.appStartPath', (c) => { c.server.appStartPath = 'x.html'; }, /^server\.appStartPath ist keine erlaubte Einstellung/],
  ['unbekannter Schlüssel zoomEnabled oben', (c) => { c.zoomEnabled = true; }, /^zoomEnabled ist keine erlaubte Einstellung/],
  ['unbekannter Schlüssel in SystemBars', (c) => { c.plugins.SystemBars.hidden = true; }, /^plugins\.SystemBars\.hidden ist keine erlaubte Einstellung/],
  ['server als Text', (c) => { c.server = 'x'; }, /^server muss ein Objekt sein/],
  ['includePlugins mit Zahl', (c) => { c.includePlugins = [1]; }, /^includePlugins muss eine Liste von Paketnamen sein/],
];
for (const [titel, aendern, muster] of k1Varianten) {
  test(`K1 Gegenprobe: ${titel}`, () => {
    const c = kopie();
    aendern(c);
    const fehler = pruefeKonfiguration(c, { publicOrdner: ordner({ 'startfehler.html': 'x' }) });
    assert.ok(fehler.some((f) => muster.test(f)), `erwartet ${muster}, erhalten:\n${fehler.join('\n')}`);
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
  // Adressen im HTML in allen Schreibweisen
  ['Zeichenreferenz im Schema', { 'index.html': seite('<img src="https&#58;//example.invalid/a">') }, /src="https&#58;\/\/example\.invalid\/a" verweist nach außen/],
  ['benannte Zeichenreferenz im Schema', { 'index.html': seite('<a href="https&colon;//example.invalid/">x</a>') }, /href="https&colon;\/\/example\.invalid\/" verweist nach außen/],
  ['srcset mit zweitem Kandidaten', { 'index.html': seite('<img srcset="/l.png 1x, https://example.invalid/a.png 2x">') }, /srcset="https:\/\/example\.invalid\/a\.png" verweist nach außen/],
  ['style in einfachen Anführungszeichen', { 'index.html': seite("<p style='background:url(https://example.invalid/a)'>x</p>") }, /style=: url\(https:\/\/example\.invalid\/a\)/],
  ['Tab im Schema', { 'index.html': seite('<a href="ht\ttps://example.invalid/">x</a>') }, /verweist nach außen/],
  ['Rückstrich statt Schrägstrich', { 'index.html': seite('<a href="/\\example.invalid/">x</a>') }, /verweist nach außen/],
  ['data: im src', { 'index.html': seite('<img src="data:image/png;base64,AA==">') }, /src="data:image\/png;base64,AA==" verweist nach außen/],
  ['unbekannte Zeichenreferenz', { 'index.html': seite('<a href="/x?a=1&foo;">x</a>') }, /Zeichenreferenz &foo; ist nicht auswertbar/],
  ['ping mit Liste', { 'index.html': seite('<a href="/x" ping="/p https://example.invalid/p">x</a>') }, /ping="https:\/\/example\.invalid\/p" verweist nach außen/],
  ['Ereignis-Attribut', { 'index.html': seite('<button onclick="f()">x</button>') }, /Ereignis-Attribut onclick ist nicht erlaubt/],
  ['meta refresh', { 'index.html': '<!doctype html><html><head><meta http-equiv="Refresh" content="0;url=/x"></head><body></body></html>' }, /meta http-equiv="refresh"/],
  // Skripttypen nach HTML
  ['Skript mit data-type ist klassisch', { 'index.html': seite('<script data-type="module">export const x = 1;</script>') }, /\(script\): Nicht lesbar/],
  ['klassisches Skript mit export', { 'index.html': seite('<script>export const x = 1;</script>') }, /\(script\): Nicht lesbar/],
  ['unbekannter Skripttyp', { 'index.html': seite('<script type="text/plain">x</script>') }, /Skripttyp "text\/plain" ist nicht erlaubt/],
  ['Typ mit Parameter', { 'index.html': seite('<script type="text/javascript; charset=utf-8">1</script>') }, /Skripttyp "text\/javascript; charset=utf-8" ist nicht erlaubt/],
  ['language-Attribut', { 'index.html': seite('<script language="vbscript">x</script>') }, /Skripttyp "vbscript" ist nicht erlaubt/],
  ['Modul mit Großschreibung und Leerraum', { 'index.html': seite('<script type=" MODULE ">let a; a ||= 1;</script>') }, /index\.html: 1 × logische Zuweisung/],
  ['Datenblock mit Adresse', { 'index.html': seite('<script type="application/json">{"u":"https://example.invalid/"}</script>') }, /index\.html: Adresse ohne Eintrag in app-pruefungen\.json: https:\/\/example\.invalid\//],
  ['Skript mit src und Inhalt', { 'index.html': seite('<script src="/_astro/x.js">1</script>') }, /Skript mit src und Inhalt/],
  // konstante Namen und Code aus Zeichenketten
  ['Template als Eigenschaftsname', { '_astro/haupt.AbCdEfGh.js': 'document.body[`replaceChildren`]();' }, /replaceChildren ohne Eintrag/],
  ['Reflect.get mit Template', { '_astro/haupt.AbCdEfGh.js': 'Reflect.get(a, `at`);' }, /1 × at ohne Eintrag/],
  ['eval', { '_astro/haupt.AbCdEfGh.js': 'eval("1");' }, /1 × eval ohne Eintrag in dynamischerCode/],
  ['window.eval', { '_astro/haupt.AbCdEfGh.js': 'window.eval("1");' }, /1 × eval ohne Eintrag in dynamischerCode/],
  ['new Function', { '_astro/haupt.AbCdEfGh.js': 'new Function("return 1");' }, /1 × Function ohne Eintrag in dynamischerCode/],
  ['setTimeout mit Text', { '_astro/haupt.AbCdEfGh.js': 'setTimeout("f()", 1);' }, /1 × setTimeout mit Text ohne Eintrag/],
  ['Function in index.es über der Höchstzahl', { '_astro/index.es.AbCdEfGh.js': 'Function("return this")(); Function("x")();' }, /2 × Function, erlaubt sind 1/],
  // Befunde aus Runde 2: Kommentarzeichen in Skript und Stil, Endtag mit Attribut,
  // kodierte Werte, Leerraum außerhalb von HTML, indirektes eval
  ['<!-- in einer Zeichenkette im Skript', { 'index.html': seite('<script>const x="<!--";a.replaceChildren();const y="-->";</script>') }, /index\.html: 1 × replaceChildren/],
  ['Skript im Kommentar-Mantel', { 'index.html': seite('<script><!--\nlet a; a ||= 1;\n//--></script>') }, /index\.html: 1 × logische Zuweisung/],
  ['Stil mit Kommentarzeichen', { 'index.html': '<!doctype html><html><head><style>/*<!--*/body{background:url(https://example.invalid/a)}/*-->*/</style></head><body></body></html>' }, /url\(https:\/\/example\.invalid\/a\)/],
  ['Endtag mit Attribut', { 'index.html': seite('<script>eval("1")</script x>') }, /1 × eval ohne Eintrag/],
  ['http-equiv kodiert', { 'index.html': '<!doctype html><html><head><meta http-equiv="re&#102;resh" content="0"></head><body></body></html>' }, /meta http-equiv="refresh"/],
  ['ping mit kodiertem Leerzeichen', { 'index.html': seite('<a href="/x" ping="/lokal&#32;https://example.invalid/p">x</a>') }, /ping="https:\/\/example\.invalid\/p" verweist nach außen/],
  ['geschütztes Leerzeichen vor =', { 'index.html': seite(`<script type${String.fromCharCode(0xa0)}="application/json">eval("1")</script>`) }, /1 × eval ohne Eintrag/],
  ['eval als Alias', { '_astro/haupt.AbCdEfGh.js': 'const e = eval; e("1");' }, /1 × eval ohne Eintrag/],
  ['eval im Kommaausdruck', { '_astro/haupt.AbCdEfGh.js': '(0, eval)("1");' }, /1 × eval ohne Eintrag/],
  ['eval mit ?.()', { '_astro/haupt.AbCdEfGh.js': 'eval?.("1");' }, /1 × eval ohne Eintrag/],
  ['Function im Kommaausdruck', { '_astro/haupt.AbCdEfGh.js': '(0, Function)("x");' }, /1 × Function ohne Eintrag/],
  ['Stil-Element mit Ereignis-Attribut', { 'index.html': '<!doctype html><html><head><style onload="x()">a{}</style></head><body></body></html>' }, /Ereignis-Attribut onload/],
  // CSS
  ['CSS mit image-set', { '_astro/a.AbCdEfGh.css': '.a{background:image-set("/a.png" 1x)}' }, /image-set\(\) ist nicht erlaubt/],
  ['CSS mit Escape', { '_astro/a.AbCdEfGh.css': '.a{background:u\\72 l(//example.invalid/a)}' }, /Escapes im CSS sind nicht auswertbar/],
  ['CSS mit url in einfachen Anführungszeichen', { '_astro/a.AbCdEfGh.css': ".a{background:url('https://example.invalid/b')}" }, /url\(https:\/\/example\.invalid\/b\)/],
];

function seite(body) {
  return `<!doctype html><html><head></head><body>${body}</body></html>`;
}

for (const [liste, aendern] of [
  ['dynamischerCode ohne Höchstzahl', (v) => { delete v.dynamischerCode[0].hoechstzahl; }],
  ['laufzeitAusnahmen mit Höchstzahl 0', (v) => { v.laufzeitAusnahmen[0].hoechstzahl = 0; }],
  ['adressen ohne Grund', (v) => { v.adressen[0].grund = ' '; }],
  ['dynamischerCode fehlt', (v) => { delete v.dynamischerCode; }],
]) {
  test(`K2 Gegenprobe Regeldatei: ${liste}`, () => {
    const vorgabe = structuredClone(VORGABE);
    aendern(vorgabe);
    const { fehler } = pruefeDist(ordner({ ...SAUBER, '_astro/index.es.AbCdEfGh.js': 'Function("a")(); Function("b")();' }), { vorgabe });
    assert.ok(fehler.some((f) => /^app-pruefungen\.json: /.test(f)), fehler.join('\n'));
  });
}

test('K2: Modul mit export und Datenblock bestehen', () => {
  const { fehler } = pruefeDist(ordner({ ...SAUBER, 'index.html': seite('<script type="module">export const x = 1;</script><script type="application/json">{"a":1}</script>') }));
  assert.deepEqual(fehler, []);
});

test('K2: Tags in Skripten und Kommentaren zählen nicht als Tags', () => {
  const { fehler } = pruefeDist(ordner({ ...SAUBER, 'index.html': seite('<!-- <a onclick="x">x</a> --><script>const s = "<a onclick=\\"x\\">";</script>') }));
  assert.deepEqual(fehler, []);
});

test('K2: Rückfall von core-js über Function mit Eintrag besteht', () => {
  const { fehler } = pruefeDist(ordner({ ...SAUBER, '_astro/index.es.AbCdEfGh.js': 'Function("return this")(); x instanceof Function;' }));
  assert.deepEqual(fehler, []);
});

test('Attribute: Namen klein, erstes gewinnt, alle Anführungsarten', () => {
  const a = attributeVon(' TYPE="module" type="text/plain" data-x=\'1\' src=/a.js defer');
  assert.deepEqual([...a], [['type', 'module'], ['data-x', '1'], ['src', '/a.js'], ['defer', '']]);
});

test('Skriptart nach HTML', () => {
  const art = (text) => skriptArt(attributeVon(text));
  assert.equal(art(''), 'script');
  assert.equal(art(' type=""'), 'script');
  assert.equal(art(' type="Text/JavaScript"'), 'script');
  assert.equal(art(' type=" module "'), 'module');
  assert.equal(art(' data-type="module"'), 'script');
  assert.equal(art(' type="application/json"'), 'daten');
  assert.equal(art(' type="text/plain"'), 'unbekannt');
  assert.equal(art(' language="javascript"'), 'script');
  assert.equal(art(' language="vbscript"'), 'unbekannt');
});
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
  for (const a of [...VORGABE.laufzeitAusnahmen, ...VORGABE.dynamischerCode, ...VORGABE.adressen]) {
    assert.equal(typeof a.datei, 'string');
    assert.ok(Number.isInteger(a.hoechstzahl) && a.hoechstzahl > 0);
    assert.ok(typeof a.grund === 'string' && a.grund.length > 10);
  }
  const namen = new Set(VORGABE.laufzeitNamen.map((n) => n.name));
  for (const a of VORGABE.laufzeitAusnahmen) assert.ok(namen.has(a.name), a.name);
  for (const n of VORGABE.laufzeitNamen) assert.ok(n.ab > VORGABE.konfiguration.minWebViewVersion, n.name);
});
