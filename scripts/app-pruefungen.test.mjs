// Tests der Prüfungen K1 bis K5 mit Gegenproben, die scheitern müssen.
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { after, test } from 'node:test';
import { analysiereSkript, attributeVon, dateistamm, leseAndroidZustand, leseApkEintraege, ohneGradleKommentare, pruefeApk, pruefeDist, pruefeGradle, pruefeKonfiguration, pruefeSync, skriptArt, VORGABE } from './app-pruefungen.mjs';
import { standardSdk, windows } from './werkzeuge.mjs';

const echteKonfiguration = JSON.parse(readFileSync(new URL('../app/capacitor.config.json', import.meta.url), 'utf8'));
const projekt = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratchpad = join(projekt, 'scratchpad/paket-2.5-c3');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'app-pruefungen-'));
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
  // Befunde aus Runde 3: Textinhalt, fremde Namensräume, eingebettete Dokumente, eval
  ['<!-- im Titel', { 'index.html': '<!doctype html><html><head><title><!--</title></head><body><script>eval("1")</script></body></html>' }, /1 × eval ohne Eintrag/],
  ['<!-- in noscript', { 'index.html': seite('<noscript><!--</noscript><script>eval("1")</script>') }, /1 × eval ohne Eintrag/],
  ['<!-- in textarea', { 'index.html': seite('<textarea><!--</textarea><script>eval("1")</script>') }, /1 × eval ohne Eintrag/],
  ['SVG im HTML', { 'index.html': seite('<svg><style><script>eval("1")</script></style></svg>') }, /<svg> ist im HTML der App nicht erlaubt/],
  ['MathML im HTML', { 'index.html': seite('<math><mi>x</mi></math>') }, /<math> ist im HTML der App nicht erlaubt/],
  ['CDATA im HTML', { 'index.html': seite('<![CDATA[<!--]]><script>eval("1")</script>') }, /CDATA ist im HTML der App nicht erlaubt/],
  ['srcdoc mit Skript', { 'index.html': seite('<iframe srcdoc="&lt;script>eval(\'1\')&lt;/script>"></iframe>') }, /srcdoc ist nicht erlaubt/],
  ['iframe mit Adresse', { 'index.html': seite('<iframe src="https://example.invalid/"></iframe>') }, /src="https:\/\/example\.invalid\/" verweist nach außen/],
  ['eval über Destrukturierung', { '_astro/haupt.AbCdEfGh.js': 'const { eval: e } = globalThis; e("1");' }, /1 × eval ohne Eintrag/],
  ['eval über berechnete Destrukturierung', { '_astro/haupt.AbCdEfGh.js': 'const { ["eval"]: e } = globalThis; e("1");' }, /1 × eval ohne Eintrag/],
  ['eval über Reflect.get', { '_astro/haupt.AbCdEfGh.js': 'const e = Reflect.get(globalThis, "eval"); e("1");' }, /1 × eval ohne Eintrag/],
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
  ['dynamischerCode mit wortlaut statt name', (v) => { v.dynamischerCode[0].wortlaut = v.dynamischerCode[0].name; delete v.dynamischerCode[0].name; }],
  ['adressen mit name statt wortlaut', (v) => { v.adressen[0].name = v.adressen[0].wortlaut; delete v.adressen[0].wortlaut; }],
  ['laufzeitAusnahmen mit leerem Namen', (v) => { v.laufzeitAusnahmen[0].name = ''; }],
  ['adressen mit leerer Datei', (v) => { v.adressen[0].datei = ' '; }],
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

// K3 und K4 ------------------------------------------------------------------

const gegenproben = [];
after(() => writeFileSync(join(scratchpad, 'gegenproben-k3-k5.json'), JSON.stringify(gegenproben, null, 2) + '\n'));
function erwartetFehler(titel, fehler, muster) {
  const passende = fehler.filter((f) => muster.test(f));
  assert.ok(passende.length, `Erwartet ${muster}, erhalten:\n${fehler.join('\n')}`);
  gegenproben.push({ titel, erwartet: String(muster), meldungen: passende });
}
const toolchain = JSON.parse(readFileSync(join(projekt, 'scripts/toolchain.json'), 'utf8'));
const appVersion = JSON.parse(readFileSync(join(projekt, 'app/package.json'), 'utf8')).version;
const codeFuer = (version) => version.split('.').reduce((a, n, i) => a + Number(n) * [10000, 100, 1][i], 0);
function schreibe(w, name, text) {
  mkdirSync(dirname(join(w, name)), { recursive: true });
  writeFileSync(join(w, name), text);
}
function syncProbe() {
  const w = ordner({
    'app/dist/index.html': '<head></head>',
    'app/dist/dateien/a.js': 'const x = 1;',
    'app/capacitor.config.json': JSON.stringify(echteKonfiguration),
    'app/android/app/src/main/assets/public/index.html': '<head></head>',
    'app/android/app/src/main/assets/public/dateien/a.js': 'const x = 1;',
    'app/android/app/src/main/assets/public/cordova.js': '',
    'app/android/app/src/main/assets/public/cordova_plugins.js': '',
    'app/android/app/src/main/assets/capacitor.plugins.json': '[]\n',
    'app/android/app/src/main/assets/capacitor.config.json': JSON.stringify(echteKonfiguration, null, 2),
    'app/android/app/src/main/res/xml/config.xml': VORGABE.sync.configXml,
    // Ein neu angelegtes Testrepository braucht keinen Testcommit. Nur Android
    // wird von K3 abgefragt; die positiven Quelldateien sind hier ausgeschlossen.
    '.gitignore': '/app/android/\n',
  });
  const git = spawnSync('git', ['init', '--quiet', w], { encoding: 'utf8', windowsHide: true });
  assert.equal(git.status, 0, git.stderr);
  return w;
}

test('K3: bytegleicher Baum, zwei leere Dateien und geparstes JSON bestehen', () => {
  assert.deepEqual(pruefeSync({ wurzel: syncProbe() }), []);
});
const mainPfad = 'app/android/app/src/main/';
for (const [titel, aendern, muster] of [
  ['dritte zusätzliche Datei', (w) => schreibe(w, mainPfad + 'assets/public/zusatz.js', ''), /zusatz.js: zusätzliche Datei/],
  ...VORGABE.sync.leereDateien.flatMap((name) => [
    [`${name} enthält Bytes`, (w) => schreibe(w, mainPfad + 'assets/public/' + name, 'x'), new RegExp(`${name}: muss genau 0 Bytes`)],
    [`${name} fehlt`, (w) => rmSync(join(w, mainPfad, 'assets/public', name)), new RegExp(`${name}: Datei fehlt`)],
  ]),
  ['Quelldatei fehlt', (w) => rmSync(join(w, mainPfad, 'assets/public/dateien/a.js')), /dateien\/a.js: Datei fehlt/],
  ['Quelldatei geändert', (w) => schreibe(w, mainPfad + 'assets/public/dateien/a.js', 'anders'), /dateien\/a.js: Inhalt weicht/],
  ['Pluginliste nicht leer', (w) => schreibe(w, mainPfad + 'assets/capacitor.plugins.json', '[{}]'), /capacitor.plugins.json muss inhaltlich \[\]/],
  ['Konfiguration abweichend', (w) => schreibe(w, mainPfad + 'assets/capacitor.config.json', '{}'), /capacitor.config.json weicht inhaltlich/],
  ['Konfiguration ungültiges JSON', (w) => schreibe(w, mainPfad + 'assets/capacitor.config.json', '{'), /K3 Dateien:/],
  ['config.xml geändert', (w) => schreibe(w, mainPfad + 'res/xml/config.xml', VORGABE.sync.configXml.replace('origin="*"', 'origin="x"')), /config.xml weicht/],
  ['config.xml zusätzlicher Zeilenumbruch', (w) => schreibe(w, mainPfad + 'res/xml/config.xml', VORGABE.sync.configXml + '\n'), /config.xml weicht/],
  ['reservierter Cordova-Name in dist', (w) => schreibe(w, 'app/dist/cordova.js', ''), /reservierter Name/],
  ['Git-Status nicht leer', (w) => schreibe(w, '.gitignore', ''), /git status.*ist nicht leer/],
  ['Quellarchiv ohne .git in umgebendem Repository', (w) => rmSync(join(w, '.git'), { recursive: true }), /Kein zugehöriges Git-Repository/],
]) {
  test(`K3 Gegenprobe: ${titel}`, () => {
    const w = syncProbe(); aendern(w);
    erwartetFehler(`K3 ${titel}`, pruefeSync({ wurzel: w }), muster);
  });
}

const androidQuelle = 'app/android/app/src/main/java/MainActivity.java';
function syncZustandsProbe() {
  const w = syncProbe();
  schreibe(w, '.gitignore', '/app/android/app/src/main/assets/\n/app/android/app/src/main/res/xml/config.xml\n/app/android/build/\n');
  schreibe(w, androidQuelle, 'class MainActivity {}\n');
  const git = (...argumente) => {
    const r = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...argumente], {
      cwd: w, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    return r.stdout.trim();
  };
  git('config', 'core.autocrlf', 'false');
  git('add', '--', '.gitignore', 'app/android');
  // Der Test braucht einen sauberen Ausgangsstand. Git-Objekte und HEAD entstehen
  // ausschließlich im isolierten Repository unter scratchpad, ohne Commit-Hooks.
  git('update-ref', 'HEAD', git('commit-tree', git('write-tree'), '-m', 'Teststand'));
  assert.deepEqual(leseAndroidZustand({ wurzel: w }).status, []);
  return w;
}

for (const [titel, vorbereiten, aendern, gleicherStatus] of [
  ['saubere eingecheckte Datei verändert', () => {}, (w) => schreibe(w, androidQuelle, 'class Neu {}\n'), false],
  ['schon geänderte Datei weiter verändert', (w) => schreibe(w, androidQuelle, 'class Vorher {}\n'), (w) => schreibe(w, androidQuelle, 'class Nachher {}\n'), true],
  ['unversionierte Datei angelegt', () => {}, (w) => schreibe(w, 'app/android/neue Datei.txt', 'neu'), false],
  ['schon unversionierte Datei weiter verändert', (w) => schreibe(w, 'app/android/neue Datei.txt', 'vorher'), (w) => schreibe(w, 'app/android/neue Datei.txt', 'nachher'), true],
  ['eingecheckte Datei gelöscht', () => {}, (w) => rmSync(join(w, androidQuelle)), false],
]) {
  test(`K3 Zustandsvergleich Gegenprobe: ${titel}`, () => {
    const w = syncZustandsProbe(); vorbereiten(w);
    const vorher = leseAndroidZustand({ wurzel: w });
    aendern(w);
    if (gleicherStatus) assert.deepEqual(leseAndroidZustand({ wurzel: w }).status, vorher.status, 'Statuszeilen allein würden die Änderung übersehen.');
    erwartetFehler(`K3 vor/nach ${titel}`, pruefeSync({ wurzel: w, vorher }), /cap sync hat den Zustand.*verändert: "app\/android\//);
    erwartetFehler(`K3 streng ${titel}`, pruefeSync({ wurzel: w }), /git status.*ist nicht leer/);
  });
}

for (const [titel, aendern] of [
  ['geänderte eingecheckte Datei', (w) => schreibe(w, androidQuelle, 'class Vorher {}\n')],
  ['unversionierte Datei mit Leerzeichen und Umlaut', (w) => schreibe(w, 'app/android/Änderung vor Sync.txt', 'vorher')],
  ['gelöschte eingecheckte Datei', (w) => rmSync(join(w, androidQuelle))],
]) {
  test(`K3: unveränderter vorheriger Zustand besteht normal, scheitert streng (${titel})`, () => {
    const w = syncZustandsProbe(); aendern(w);
    const vorher = leseAndroidZustand({ wurzel: w });
    assert.ok(vorher.status.length);
    assert.ok(vorher.status.every((s) => !s.includes('\0')));
    assert.deepEqual(pruefeSync({ wurzel: w, vorher }), []);
    gegenproben.push({ titel: `K3 vor/nach unverändert: ${titel}`, meldungen: [], bestanden: true, status: vorher.status });
    erwartetFehler(`K3 streng unverändert: ${titel}`, pruefeSync({ wurzel: w }), /git status.*ist nicht leer/);
  });
}

test('K3: ausgeschlossene Build-Ausgaben ändern den erfassten Zustand nicht', () => {
  const w = syncZustandsProbe();
  const vorher = leseAndroidZustand({ wurzel: w });
  schreibe(w, 'app/android/build/ausgabe.bin', 'neuer Build');
  assert.deepEqual(leseAndroidZustand({ wurzel: w }), vorher);
  assert.deepEqual(pruefeSync({ wurzel: w, vorher }), []);
  assert.deepEqual(pruefeSync({ wurzel: w }), []);
});

test('K3: Snapshot aus einer anderen Arbeitskopie wird abgewiesen', () => {
  const w = syncZustandsProbe();
  const vorher = leseAndroidZustand({ wurzel: syncZustandsProbe() });
  erwartetFehler('K3 fremder Snapshot', pruefeSync({ wurzel: w, vorher }), /Zustand vor cap sync.*nicht zu dieser Arbeitskopie/);
});

test('K3: Git-Fehler beim Lesen des Zustands wird nicht als sauber behandelt', () => {
  const w = syncZustandsProbe();
  writeFileSync(join(w, '.git/index'), 'kein Git-Index');
  assert.throws(() => leseAndroidZustand({ wurzel: w }), /git status ist fehlgeschlagen/);
  erwartetFehler('K3 ungültiger Git-Index', pruefeSync({ wurzel: w }), /git status ist fehlgeschlagen/);
});

test('K3: Dateinamen mit Zeilenumbruch bleiben ein Eintrag und werden lesbar ausgegeben', { skip: windows }, () => {
  const w = syncZustandsProbe();
  const pfad = 'app/android/Name\nmit Zeilenumbruch.txt';
  schreibe(w, pfad, 'vorher');
  const vorher = leseAndroidZustand({ wurzel: w });
  assert.deepEqual(vorher.status, [`?? ${JSON.stringify(pfad)}`]);
  assert.deepEqual(pruefeSync({ wurzel: w, vorher }), []);
  schreibe(w, pfad, 'nachher');
  erwartetFehler('K3 Dateiname mit Zeilenumbruch', pruefeSync({ wurzel: w, vorher }), /Name\\nmit Zeilenumbruch/);
});

test('K3: geänderter Dateimodus fällt auch ohne Inhaltsänderung auf', { skip: windows }, () => {
  const w = syncZustandsProbe();
  chmodSync(join(w, androidQuelle), 0o644);
  const vorher = leseAndroidZustand({ wurzel: w });
  chmodSync(join(w, androidQuelle), 0o755);
  erwartetFehler('K3 geänderter Dateimodus', pruefeSync({ wurzel: w, vorher }), /cap sync hat den Zustand.*MainActivity/);
});

test('K3: Symlink-Ziel wird erfasst, die verlinkte Datei nicht gelesen', { skip: windows }, () => {
  const w = syncZustandsProbe();
  const pfad = 'app/android/verknuepft';
  schreibe(w, 'ziel.txt', 'vorher');
  symlinkSync('../../ziel.txt', join(w, pfad));
  const vorher = leseAndroidZustand({ wurzel: w });
  assert.equal(vorher.dateien.find((d) => d.pfad === pfad).typ, 'symlink');
  schreibe(w, 'ziel.txt', 'nachher');
  assert.deepEqual(pruefeSync({ wurzel: w, vorher }), []);
  rmSync(join(w, pfad));
  symlinkSync('../../anderes-ziel.txt', join(w, pfad));
  erwartetFehler('K3 geändertes Symlink-Ziel', pruefeSync({ wurzel: w, vorher }), /cap sync hat den Zustand.*verknuepft/);
});

function gradleProbe() {
  const w = ordner({ 'scripts/toolchain.json': JSON.stringify(toolchain), 'app/package.json': JSON.stringify({ version: appVersion }) });
  for (const datei of ['app/build.gradle', 'build.gradle', 'variables.gradle', 'gradle/wrapper/gradle-wrapper.properties']) {
    const ziel = join(w, 'app/android', datei);
    mkdirSync(dirname(ziel), { recursive: true });
    copyFileSync(join(projekt, 'app/android', datei), ziel);
  }
  schreibe(w, 'app/android/gradlew', '#!/bin/sh\nexit 0\n');
  probeGit(w, 'init', '--quiet');
  probeGit(w, 'add', '--chmod=+x', '--', 'app/android/gradlew');
  return w;
}
function probeGit(w, ...argumente) {
  const lauf = spawnSync('git', argumente, { cwd: w, encoding: 'utf8', windowsHide: true });
  assert.equal(lauf.status, 0, lauf.error?.message ?? lauf.stderr);
  return lauf.stdout;
}
function ersetze(w, datei, von, nach) {
  const pfad = join(w, datei);
  const alt = readFileSync(pfad, 'utf8');
  assert.notEqual(alt.replace(von, nach), alt, `Teständerung fehlt: ${von}`);
  writeFileSync(pfad, alt.replace(von, nach));
}

test('K4: eingecheckte Gradle-Werte, SDK-Bindungen und bin-Wrapper bestehen', () => {
  assert.deepEqual(pruefeGradle({ wurzel: gradleProbe() }), []);
});
test('K4: Wrappermodus 100644 scheitert, git update-index --chmod=+x behebt ihn', () => {
  const w = gradleProbe();
  probeGit(w, 'update-index', '--chmod=-x', '--', 'app/android/gradlew');
  assert.match(probeGit(w, 'ls-files', '-s', '--', 'app/android/gradlew'), /^100644 /);
  erwartetFehler('K4 Wrappermodus 100644', pruefeGradle({ wurzel: w }), /Dateimodus im Git-Index muss 100755 sein, gefunden 100644\. Beheben mit: git update-index --chmod=\+x -- app\/android\/gradlew/);
  probeGit(w, 'update-index', '--chmod=+x', '--', 'app/android/gradlew');
  assert.match(probeGit(w, 'ls-files', '-s', '--', 'app/android/gradlew'), /^100755 /);
  assert.deepEqual(pruefeGradle({ wurzel: w }), []);
});
for (const [titel, aendern, muster] of [
  ['Wrapper fehlt im Index', (w) => probeGit(w, 'update-index', '--force-remove', '--', 'app/android/gradlew'), /app\/android\/gradlew: ein eindeutiger Eintrag ohne Konflikt im Git-Index fehlt/],
  ['Quellarchiv ohne .git in umgebendem Repository', (w) => rmSync(join(w, '.git'), { recursive: true }), /Kein zugehöriges Git-Repository: K4 kann den Dateimodus/],
  ['ungültiger Git-Index', (w) => schreibe(w, '.git/index', 'kein Git-Index'), /git ls-files ist fehlgeschlagen/],
]) {
  test(`K4 Gegenprobe: ${titel}`, () => {
    const w = gradleProbe(); aendern(w);
    erwartetFehler(`K4 ${titel}`, pruefeGradle({ wurzel: w }), muster);
  });
}
test('K4 Gegenprobe: Git lässt sich nicht starten, kein stilles Bestehen', () => {
  const w = gradleProbe();
  const umgebung = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATH'));
  umgebung.PATH = w;
  erwartetFehler('K4 Git nicht ausführbar', pruefeGradle({ wurzel: w, umgebung }), /git rev-parse ist fehlgeschlagen:.*ENOENT/);
});
for (const datei of VORGABE.gradle.dateienMitVerboten) {
  for (const verboten of VORGABE.gradle.verboten) {
    for (const form of [verboten, `def x = "https://beispiel.invalid/${verboten}"`, `def x = '/* ${verboten} */'`, `def x = '''// ${verboten}'''`, `def x = $/https://beispiel.invalid/${verboten}/$`, `def x = /a ${verboten}/`]) {
      test(`K4 Gegenprobe: ${datei}: ${form}`, () => {
        const w = gradleProbe();
        const pfad = `app/android/${datei}`;
        schreibe(w, pfad, readFileSync(join(w, pfad), 'utf8') + `\n${form}\n`);
        erwartetFehler(`K4 ${datei} ${form}`, pruefeGradle({ wurzel: w }), new RegExp(`${verboten} ist nicht erlaubt`));
      });
    }
    test(`K4: ${datei}: ${verboten} in echten Kommentaren ist kein Fund`, () => {
      const w = gradleProbe();
      const pfad = `app/android/${datei}`;
      schreibe(w, pfad, readFileSync(join(w, pfad), 'utf8') + `\n// ${verboten}\n/* ${verboten}\n${verboten} */\n`);
      assert.deepEqual(pruefeGradle({ wurzel: w }), []);
    });
  }
}
for (const [titel, datei, von, nach, muster] of [
  ...['minSdk', 'compileSdk', 'targetSdk'].map((name) => [name, 'variables.gradle', new RegExp(`(${name}Version\\s*=\\s*)\\d+`), '$199', new RegExp(`${name}Version muss`)]),
  ...['minSdk', 'compileSdk', 'targetSdk'].map((name) => [`${name} in App überschrieben`, 'app/build.gradle', `rootProject.ext.${name}Version`, '99', new RegExp(`${name}.*muss`)]),
  ['buildToolsVersion', 'app/build.gradle', toolchain.android.buildTools, '1.0.0', /buildToolsVersion muss/],
  ['versionName', 'app/build.gradle', `versionName "${appVersion}"`, 'versionName "8.9.10"', /versionName muss/],
  ['versionCode', 'app/build.gradle', /versionCode \d+/, 'versionCode 999', /versionCode muss/],
  ['versionCode fehlt', 'app/build.gradle', /versionCode \d+/, '// versionCode 100', /versionCode muss/],
  ['versionCode doppelt', 'app/build.gradle', /versionCode \d+/, `versionCode ${codeFuer(appVersion)}\nversionCode ${codeFuer(appVersion)}`, /versionCode muss/],
  ['versionCode zweite Inline-Zuweisung', 'app/build.gradle', /versionCode \d+/, `versionCode ${codeFuer(appVersion)}\nif (true) { versionCode 999 }`, /versionCode muss/],
  ['versionCode nur in mehrzeiliger Zeichenkette', 'app/build.gradle', /versionCode \d+/, `def text = '''\nversionCode ${codeFuer(appVersion)}\n'''`, /versionCode muss/],
  ['versionName nur in mehrzeiliger Zeichenkette', 'app/build.gradle', /versionName "[^"]+"/, `versionName unbekannt\ndef text = '''\nversionName "${appVersion}"\n'''`, /versionName muss/],
  ['Wrapper all', 'gradle/wrapper/gradle-wrapper.properties', '-bin.zip', '-all.zip', /distributionUrl muss/],
  ['Wrapper fremde Herkunft', 'gradle/wrapper/gradle-wrapper.properties', 'services.gradle.org', 'beispiel.invalid', /distributionUrl muss/],
  ['Wrapper Prüfsumme', 'gradle/wrapper/gradle-wrapper.properties', toolchain.gradle.sha256.bin, '0'.repeat(64), /distributionSha256Sum muss/],
  ['Wrapper Prüfsumme fehlt', 'gradle/wrapper/gradle-wrapper.properties', /^distributionSha256Sum=.*$/m, '# fehlt', /distributionSha256Sum muss/],
]) {
  test(`K4 Gegenprobe: ${titel}`, () => {
    const w = gradleProbe(); ersetze(w, `app/android/${datei}`, von, nach);
    erwartetFehler(`K4 ${titel}`, pruefeGradle({ wurzel: w }), muster);
  });
}
for (const version of ['1.100.0', '1.0.100', '1.0.0-beta', '999999999.0.0']) {
  test(`K4 Gegenprobe: Versionsschema ${version}`, () => {
    const w = gradleProbe(); schreibe(w, 'app/package.json', JSON.stringify({ version }));
    erwartetFehler(`K4 Versionsschema ${version}`, pruefeGradle({ wurzel: w }), /app\/package.json:/);
  });
}
test('K4: Versionsformel Haupt*10000 + Neben*100 + Patch', () => {
  const w = gradleProbe(); schreibe(w, 'app/package.json', '{"version":"2.3.4"}');
  ersetze(w, 'app/android/app/build.gradle', /versionCode \d+/, 'versionCode 20304');
  ersetze(w, 'app/android/app/build.gradle', /versionName "[^"]+"/, 'versionName "2.3.4"');
  assert.deepEqual(pruefeGradle({ wurzel: w }), []);
});
test('K4: nicht geschlossene Kommentare und Zeichenketten werden abgelehnt', () => {
  assert.throws(() => ohneGradleKommentare('/* x'), /Nicht abgeschlossener/);
  assert.throws(() => ohneGradleKommentare('"x'), /Nicht abgeschlossene/);
});
for (const kommentar of ['//', '/*']) {
  test(`K4 Gegenprobe: verschachtelte GString-Interpolation mit ${kommentar}`, () => {
    const w = gradleProbe();
    const pfad = 'app/android/app/build.gradle';
    schreibe(w, pfad, readFileSync(join(w, pfad), 'utf8') + '\ndef text = "${"' + kommentar + '"} signingConfig"\n');
    erwartetFehler(`K4 GString ${kommentar}`, pruefeGradle({ wurzel: w }), /Gradle-Interpolation.*wird nicht unterstützt/);
  });
}

// K5: echte Ressourcen und binäre Manifeste aus aapt2, synthetische DEX-Bytes.
// Die Tests übersetzen keinen Java-Code und führen Gradle nicht aus.
const sdk = process.env.ANDROID_HOME ?? standardSdk();
const aapt2 = join(sdk, 'build-tools', toolchain.android.buildTools, windows ? 'aapt2.exe' : 'aapt2');
const plattform = join(sdk, 'platforms', `android-${toolchain.android.compileSdk}`, 'android.jar');
const fehlt = !existsSync(aapt2) ? `Build-Tools ${toolchain.android.buildTools} mit aapt2 fehlen`
  : !existsSync(plattform) ? `Plattform android-${toolchain.android.compileSdk} fehlt` : false;
const nurMitSdk = { skip: fehlt };

// Einfacher ZIP-Schreiber nur für Testdaten. AndroidManifest.xml und resources.arsc
// stammen weiterhin aus aapt2 link; danach kommen synthetische APK-Einträge dazu.
function schreibeZip(pfad, eintraege) {
  const teile = []; const verzeichnis = []; let offset = 0;
  for (const [name, text] of eintraege) {
    const inhalt = Buffer.isBuffer(text) ? text : Buffer.from(text);
    const n = Buffer.from(name); const crc = crc32(inhalt);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50); lokal.writeUInt16LE(20, 4); lokal.writeUInt32LE(crc, 14);
    lokal.writeUInt32LE(inhalt.length, 18); lokal.writeUInt32LE(inhalt.length, 22); lokal.writeUInt16LE(n.length, 26);
    const zentral = Buffer.alloc(46);
    zentral.writeUInt32LE(0x02014b50); zentral.writeUInt16LE(20, 4); zentral.writeUInt16LE(20, 6);
    zentral.writeUInt32LE(crc, 16); zentral.writeUInt32LE(inhalt.length, 20); zentral.writeUInt32LE(inhalt.length, 24);
    zentral.writeUInt16LE(n.length, 28); zentral.writeUInt32LE(offset, 42);
    teile.push(lokal, n, inhalt); verzeichnis.push(zentral, n); offset += lokal.length + n.length + inhalt.length;
  }
  const ende = Buffer.alloc(22); ende.writeUInt32LE(0x06054b50);
  ende.writeUInt16LE(eintraege.size ?? eintraege.length, 8); ende.writeUInt16LE(eintraege.size ?? eintraege.length, 10);
  ende.writeUInt32LE(verzeichnis.reduce((n, b) => n + b.length, 0), 12); ende.writeUInt32LE(offset, 16);
  writeFileSync(pfad, Buffer.concat([...teile, ...verzeichnis, ende]));
}
function aapt(args) {
  const r = spawnSync(aapt2, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `aapt2 ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
}
function apkProbe(optionen = {}) {
  const w = ordner({
    'scripts/toolchain.json': JSON.stringify(toolchain), 'app/package.json': JSON.stringify({ version: appVersion }),
    'app/capacitor.config.json': JSON.stringify(echteKonfiguration), 'app/dist/index.html': '<head></head>',
    'res/values/strings.xml': '<resources><string name="titel">Test</string></resources>',
    'res/values-de/strings.xml': '<resources><string name="titel">Deutsch</string></resources>',
  });
  const erlaubt = VORGABE.apk.berechtigung;
  const ausschluesse = VORGABE.apk.sicherungsDomaenen.map((domain) => `<exclude domain="${domain}" path="."/>`).join('');
  let regeln = `<data-extraction-rules><cloud-backup>${ausschluesse}</cloud-backup><device-transfer>${ausschluesse}</device-transfer></data-extraction-rules>`;
  if (optionen.regeln) regeln = optionen.regeln(regeln);
  schreibe(w, 'res/xml/data_extraction_rules.xml', regeln);
  if (optionen.regelVariante) schreibe(w, 'res/xml-v31/data_extraction_rules.xml', '<data-extraction-rules><cloud-backup/><device-transfer/></data-extraction-rules>');
  if (optionen.sprache) schreibe(w, 'res/values-en/strings.xml', '<resources><string name="titel">English</string></resources>');
  let manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="de.baremos.fristenrechner" android:versionCode="${codeFuer(appVersion)}" android:versionName="${appVersion}">
<uses-sdk android:minSdkVersion="${toolchain.android.minSdk}" android:targetSdkVersion="${toolchain.android.targetSdk}"/>
<permission android:name="${erlaubt}" android:protectionLevel="signature"/><uses-permission android:name="${erlaubt}"/>
<application android:label="@string/titel" android:allowBackup="false" android:dataExtractionRules="@xml/data_extraction_rules"${optionen.debug === false ? '' : ' android:debuggable="true"'}>
<meta-data android:name="android.webkit.WebView.MetricsOptOut" android:value="true"/>
<meta-data android:name="android.webkit.WebView.EnableSafeBrowsing" android:value="false"/>
<activity android:name="de.baremos.fristenrechner.MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity>
<receiver android:name="androidx.profileinstaller.ProfileInstallReceiver" android:exported="true" android:permission="android.permission.DUMP"/>
<provider android:name="androidx.startup.InitializationProvider" android:exported="false" android:authorities="de.baremos.test"/>
</application></manifest>`;
  if (optionen.manifest) manifest = optionen.manifest(manifest);
  schreibe(w, 'AndroidManifest.xml', manifest);
  aapt(['compile', '--dir', join(w, 'res'), '-o', join(w, 'ressourcen.zip')]);
  const apk = join(w, 'probe.apk');
  aapt(['link', '-o', apk, '--manifest', join(w, 'AndroidManifest.xml'), '-I', plattform, join(w, 'ressourcen.zip')]);
  const eintraege = leseApkEintraege(apk);
  eintraege.set('classes.dex', Buffer.from('dex\n035\0synthetische Testbytes'));
  eintraege.set('assets/public/index.html', Buffer.from('<head></head>'));
  for (const name of VORGABE.sync.leereDateien) eintraege.set(`assets/public/${name}`, Buffer.alloc(0));
  eintraege.set('assets/capacitor.plugins.json', Buffer.from('[]\n'));
  eintraege.set('assets/capacitor.config.json', Buffer.from(JSON.stringify(echteKonfiguration)));
  optionen.eintraege?.(eintraege);
  schreibeZip(apk, eintraege);
  return { w, apk };
}
for (const debug of [true, false]) {
  test(`K5: gültige synthetische ${debug ? 'Debug' : 'Release'}-APK besteht`, nurMitSdk, () => {
    const { w, apk } = apkProbe({ debug });
    assert.deepEqual(pruefeApk(apk, { wurzel: w, debug, sdk }), []);
  });
}
const manifestAendern = (von, nach) => ({ manifest: (text) => { assert.ok(text.includes(von)); return text.replace(von, nach); } });
const permissionTag = `<uses-permission android:name="${VORGABE.apk.berechtigung}"/>`;
const faelleApk = [
  ['INTERNET statt erlaubter Berechtigung', manifestAendern(permissionTag, '<uses-permission android:name="android.permission.INTERNET"/>'), /Berechtigungen: erwartet ausschließlich/],
  ['zweite Berechtigung INTERNET', manifestAendern(permissionTag, permissionTag + '<uses-permission android:name="android.permission.INTERNET"/>'), /Berechtigungen: erwartet ausschließlich/],
  ['zweite Berechtigung CAMERA', manifestAendern(permissionTag, permissionTag + '<uses-permission android:name="android.permission.CAMERA"/>'), /Berechtigungen: erwartet ausschließlich/],
  ['Berechtigung fehlt', manifestAendern(permissionTag, ''), /Berechtigungen: erwartet ausschließlich/],
  ['zusätzliche deklarierte Berechtigung', manifestAendern('</manifest>', '<permission android:name="de.baremos.test.EXTRA"/></manifest>'), /Berechtigungen: erwartet ausschließlich/],
  ['Berechtigung mit maxSdkVersion', manifestAendern(permissionTag, permissionTag.replace('/>', ' android:maxSdkVersion="30"/>')), /genau eine unbedingte uses-permission/],
  ['Paket anders', manifestAendern('package="de.baremos.fristenrechner"', 'package="de.baremos.anders"'), /Paket und Versionen/],
  ['versionCode anders', manifestAendern(`android:versionCode="${codeFuer(appVersion)}"`, 'android:versionCode="9"'), /Paket und Versionen/],
  ['versionName anders', manifestAendern(`android:versionName="${appVersion}"`, 'android:versionName="9.0.0"'), /Paket und Versionen/],
  ['minSdk anders', manifestAendern(`android:minSdkVersion="${toolchain.android.minSdk}"`, 'android:minSdkVersion="29"'), /minSdk: erwartet/],
  ['targetSdk anders', manifestAendern(`android:targetSdkVersion="${toolchain.android.targetSdk}"`, 'android:targetSdkVersion="35"'), /targetSdk: erwartet/],
  ['allowBackup=true', manifestAendern('android:allowBackup="false"', 'android:allowBackup="true"'), /allowBackup muss false/],
  ['allowBackup fehlt', manifestAendern('android:allowBackup="false"', ''), /allowBackup muss false/],
  ['usesCleartextTraffic=true', manifestAendern('<application ', '<application android:usesCleartextTraffic="true" '), /usesCleartextTraffic darf nur/],
  ['dataExtractionRules fehlt', manifestAendern('android:dataExtractionRules="@xml/data_extraction_rules"', ''), /dataExtractionRules muss/],
  ['zusätzliche Sicherungsvariante ab API 31', { regelVariante: true }, /zusätzliche Varianten sind nicht erlaubt/],
  ['cloud-backup ein Ausschluss fehlt', { regeln: (r) => r.replace('<exclude domain="root" path="."/>', '') }, /dataExtractionRules cloud-backup:/],
  ['device-transfer ein Ausschluss fehlt', { regeln: (r) => r.replace('<device-transfer><exclude domain="root" path="."/>', '<device-transfer>') }, /dataExtractionRules device-transfer:/],
  ['Sicherungsregel anderer Pfad', { regeln: (r) => r.replace('path="."', 'path="anders"') }, /dataExtractionRules cloud-backup:/],
  ['zusätzliche include-Regel', { regeln: (r) => r.replace('</cloud-backup>', '<include domain="root" path="."/></cloud-backup>') }, /dataExtractionRules cloud-backup:/],
  ['zweite Sprache', { sprache: true }, /Sprachen: erwartet/],
  ['fehlendes MetricsOptOut', manifestAendern('<meta-data android:name="android.webkit.WebView.MetricsOptOut" android:value="true"/>', ''), /WebView-Metadatum android.webkit.WebView.MetricsOptOut/],
  ['MetricsOptOut=false', manifestAendern('MetricsOptOut" android:value="true"', 'MetricsOptOut" android:value="false"'), /WebView-Metadatum android.webkit.WebView.MetricsOptOut/],
  ['EnableSafeBrowsing=true', manifestAendern('EnableSafeBrowsing" android:value="false"', 'EnableSafeBrowsing" android:value="true"'), /WebView-Metadatum android.webkit.WebView.EnableSafeBrowsing/],
  ['Metadatum unter falschem Elternknoten', manifestAendern('<meta-data android:name="android.webkit.WebView.MetricsOptOut" android:value="true"/>', '<service android:name="de.baremos.Falsch" android:exported="false"><meta-data android:name="android.webkit.WebView.MetricsOptOut" android:value="true"/></service>'), /WebView-Metadatum android.webkit.WebView.MetricsOptOut/],
  ['EmojiCompatInitializer', manifestAendern('</application>', `<meta-data android:name="${VORGABE.apk.verbotenerInitializer}" android:value="androidx.startup"/></application>`), /Initializer .* ist nicht erlaubt/],
  ['zusätzlicher Export', manifestAendern('</application>', '<service android:name="de.baremos.Extra" android:exported="true"/></application>'), /Exportierte Komponenten/],
  ['MainActivity nicht exportiert', manifestAendern('MainActivity" android:exported="true"', 'MainActivity" android:exported="false"'), /Exportierte Komponenten/],
  ['Receiver ohne DUMP', manifestAendern('android:permission="android.permission.DUMP"', ''), /Exportierte Komponenten/],
  ['Receiver andere Berechtigung', manifestAendern('android:permission="android.permission.DUMP"', 'android:permission="android.permission.INTERNET"'), /Exportierte Komponenten/],
  ['Komponente implizit exportiert', manifestAendern('InitializationProvider" android:exported="false"', 'InitializationProvider"'), /exported muss ausdrücklich/],
  ['Debug ohne debuggable', { debug: false }, /debuggable: erwartet true/],
  ['Release mit debuggable', { alsRelease: true }, /debuggable: erwartet fehlend oder false/],
  ...VORGABE.apk.verboteneDexBytes.flatMap((bytes) => ['classes.dex', 'classes2.dex', 'classes-extra.dex'].map((name) => [`${bytes} in ${name}`, { eintraege: (e) => e.set(name, Buffer.from(`dex\0${bytes}Probe;`)) }, /verbotene Bytefolge/])),
  ['lib-Eintrag', { eintraege: (e) => e.set('lib/x86_64/probe', Buffer.from('x')) }, /Native Bibliothek/],
  ['so außerhalb lib', { eintraege: (e) => e.set('assets/probe.so', Buffer.from('x')) }, /Native Bibliothek/],
  ['keine DEX-Datei', { eintraege: (e) => e.delete('classes.dex') }, /Keine classes\*\.dex/],
  ['dritte Datei in assets/public', { eintraege: (e) => e.set('assets/public/extra.js', Buffer.alloc(0)) }, /extra.js: zusätzliche Datei/],
  ['Datei in assets/public fehlt', { eintraege: (e) => e.delete('assets/public/index.html') }, /index.html: Datei fehlt/],
  ['Datei in assets/public geändert', { eintraege: (e) => e.set('assets/public/index.html', Buffer.from('x')) }, /index.html: Inhalt weicht/],
  ...VORGABE.sync.leereDateien.flatMap((name) => [
    [`${name} mit Inhalt`, { eintraege: (e) => e.set(`assets/public/${name}`, Buffer.from('x')) }, /muss genau 0 Bytes/],
    [`${name} fehlt`, { eintraege: (e) => e.delete(`assets/public/${name}`) }, /Datei fehlt/],
  ]),
  ['Pluginliste nicht leer', { eintraege: (e) => e.set('assets/capacitor.plugins.json', Buffer.from('[{}]')) }, /capacitor.plugins.json muss/],
  ['Pluginliste fehlt', { eintraege: (e) => e.delete('assets/capacitor.plugins.json') }, /capacitor.plugins.json muss/],
  ['Konfiguration anders', { eintraege: (e) => e.set('assets/capacitor.config.json', Buffer.from('{}')) }, /capacitor.config.json weicht/],
];
for (const [titel, optionen, muster] of faelleApk) {
  test(`K5 Gegenprobe: ${titel}`, nurMitSdk, () => {
    const { w, apk } = apkProbe(optionen);
    erwartetFehler(`K5 ${titel}`, pruefeApk(apk, { wurzel: w, debug: !optionen.alsRelease, sdk }), muster);
  });
}
test('K5 Gegenprobe: aapt2 fehlt, kein stilles Bestehen', () => {
  erwartetFehler('K5 aapt2 fehlt', pruefeApk('fehlt.apk', { wurzel: projekt, debug: true, sdk: join(arbeit, 'ohne-sdk') }), /aapt2 .* fehlt; K5 ist nicht ausgeführt/);
});
test('K5 Gegenprobe: Build-Art nicht angegeben', () => {
  erwartetFehler('K5 Build-Art fehlt', pruefeApk('fehlt.apk', { wurzel: projekt }), /Build-Art muss/);
});
test('K5 Gegenprobe: aapt2 meldet fehlerhafte APK', nurMitSdk, () => {
  const w = ordner({ 'kaputt.apk': 'kein ZIP' });
  erwartetFehler('K5 APK kaputt', pruefeApk(join(w, 'kaputt.apk'), { wurzel: projekt, debug: true, sdk }), /aapt2 permissions fehlgeschlagen/);
});
test('ZIP: doppelte Namen und CRC-Fehler werden abgelehnt', () => {
  const w = ordner({ 'probe.apk': '' }); const p = join(w, 'probe.apk');
  schreibeZip(p, [['a', 'x'], ['a', 'y']]);
  assert.throws(() => leseApkEintraege(p), /doppelter.*ZIP-Name/);
  schreibeZip(p, new Map([['a', Buffer.from('x')]]));
  const b = readFileSync(p); b[31] ^= 1; writeFileSync(p, b);
  assert.throws(() => leseApkEintraege(p), /ZIP-Prüfsumme/);
});
for (const trennzeichen of ['=', ':', ' ']) {
  test(`K5: local.properties (${JSON.stringify(trennzeichen)}) hat Vorrang vor ANDROID_HOME`, nurMitSdk, () => {
    const { w, apk } = apkProbe();
    schreibe(w, 'app/android/local.properties', '# Kommentar\nsdk.dir' + trennzeichen + sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n');
    assert.deepEqual(pruefeApk(apk, { wurzel: w, debug: true, umgebung: { ...process.env, ANDROID_HOME: join(arbeit, 'fehlt') } }), []);
    if (windows) assert.deepEqual(pruefeApk(apk, { wurzel: w, debug: true, sdk: sdk.toUpperCase() }), []);
    erwartetFehler('K5 SDK-Konflikt', pruefeApk(apk, { wurzel: w, debug: true, sdk: join(arbeit, 'anderes-sdk') }), /SDK-Angabe weicht/);
  });
}
for (const [text, muster] of [['sdk.dir=', /sdk.dir.*ist leer/], ['sdk.dir=foo\\\nbar', /Fortsetzungszeile/]]) {
  test(`K5 Gegenprobe: local.properties ${JSON.stringify(text)}`, () => {
    const w = ordner({ 'app/android/local.properties': text, 'scripts/toolchain.json': JSON.stringify(toolchain), 'app/package.json': JSON.stringify({ version: appVersion }) });
    erwartetFehler('K5 local.properties ungültig', pruefeApk('fehlt.apk', { wurzel: w, debug: true }), muster);
  });
}
