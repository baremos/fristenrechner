// SPDX-License-Identifier: Apache-2.0
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quellvertrag, dateiMethodenVertrag, formularWerte, datumBefehl, ablaufA, ablaufA8, ablaufA10, domAriaNamen, evaluiereDomAria, ueberlaufMessung, tastaturTippPunkt } from './emulator/oberflaeche.mjs';
import { runInNewContext } from 'node:vm';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cdpFehler = JSON.parse(readFileSync(join(wurzel, 'scripts/emulator/fixtures/cdp-fehler-2026-09-30.json'), 'utf8'));
const axZeitgrenze = cdpFehler.api36.find(e => e.meldung.startsWith('A10:')).meldung.split(' – ')[1];
const tmp = process.env.TMP ?? join(wurzel, 'scratchpad/paket-2.6/tmp');
mkdirSync(tmp, { recursive: true });
const arbeit = mkdtempSync(join(tmp, 'oberflaeche-test-'));
// Der Ordner entsteht ausschließlich unter der bekannten Testwurzel.
after(() => {
  assert.equal(dirname(resolve(arbeit)), resolve(tmp));
  rmSync(arbeit, { recursive: true, force: true });
});
const quelldateien = [
  'packages/oberflaeche/src/Fristenrechner.astro', 'app/src/pages/index.astro',
  'packages/oberflaeche/src/fristenrechner-ui.ts', 'packages/kern/src/fristen.ts',
  'packages/oberflaeche/src/web-plattform.ts',
  'app/src/adapters/dateiausgabe.ts',
  'app/src/adapters/dateiimport.ts', 'app/src/adapters/dateiablauf-vertrag.ts', 'app/src/adapters/app-plattform.ts',
  'docs/datenschutz.md',
  'app/android/app/src/main/java/de/baremos/fristenrechner/io/DateiablaufPlugin.java',
];
let nummer = 0;
function quellkopie(datei, ersetzen, durch) {
  const ordner = join(arbeit, String(++nummer));
  for (const name of quelldateien) {
    const ziel = join(ordner, name);
    mkdirSync(dirname(ziel), { recursive: true });
    let inhalt = readFileSync(join(wurzel, name), 'utf8');
    if (name === datei) {
      const vorher = inhalt;
      inhalt = inhalt.replace(ersetzen, durch);
      assert.notEqual(inhalt, vorher, 'Gegenprobe muss die Quelldatei tatsächlich verändern.');
    }
    writeFileSync(ziel, inhalt);
  }
  return ordner;
}

test('Quellvertrag liest das öffentliche Formular und seine Regelanzeige', () => {
  const q = quellvertrag(wurzel);
  assert.equal(q.storage, 'baremos-fristenrechner-projekt-v1');
  assert.match(q.datum, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(q.text, /^Regelversion: .+ · Rechtsstand: .+ \(\d{4}-\d{2}-\d{2}\)$/);
  assert.equal(quellvertrag(quellkopie()).text, q.text);
});

test('Datei-Quellvertrag schließt zusätzliche Diagnose- und URI-Methoden aus', () => {
  const java = readFileSync(join(wurzel, quelldateien.at(-1)), 'utf8');
  assert.equal(dateiMethodenVertrag(java).length, 8);
  assert.throws(() => dateiMethodenVertrag(java + '\n@PluginMethod public void leseBeliebigeUri(PluginCall call) {}'), /Testmethoden/);
  assert.throws(() => dateiMethodenVertrag(java.replace('public void teilen', 'public void diagnose')), /Testmethoden/);
  assert.throws(() => dateiMethodenVertrag(java.replace('@PluginMethod public void teilen', '@PluginMethod(returnType = "none") public void teilen')), /Testmethoden/);
  assert.equal(dateiMethodenVertrag(java + '\n// @PluginMethod public void diagnose(PluginCall call) {}').length, 8);
});
for (const [titel, datei, ersetzen, durch] of [
  ['Formularfeld fehlt', quelldateien[0], 'name="projektname"', 'name="anderes_feld"'],
  ['Ergebnistabelle fehlt', quelldateien[0], 'id="schedule-table-body"', 'id="andere_tabelle"'],
  ['App-Fehlerfalle fehlt', quelldateien[1], 'id="app-startfehler"', 'id="anderer_hinweis"'],
  ['Datenschutzquelle ersetzt', quelldateien[1], "from '../../../docs/datenschutz.md'", "from '../../../docs/anderes.md'"],
  ['Datenschutzabschnitt fehlt', quelldateien[1], 'id="app-datenschutz"', 'id="anderer_abschnitt"'],
  ['Datenschutzinhalt fehlt', quelldateien[1], '<Datenschutz />', '<p>Leerer Ersatz</p>'],
  ['Datenschutzdokument leer', 'docs/datenschutz.md', /^#[\s\S]+/, ''],
  ['Speicherschlüssel fehlt', quelldateien[4], 'const WEB_SPEICHERSCHLUESSEL =', 'const ANDERER_KEY ='],
  ['Webadapter nutzt anderen Schlüssel', quelldateien[4], 'getItem(WEB_SPEICHERSCHLUESSEL)', "getItem('anderer-schluessel')"],
  ['Initialisierung fehlt', quelldateien[1], 'initFristenrechner(root,', 'andereInitialisierung(root,'],
  ['App-Plattform nicht komponiert', quelldateien[1], 'erzeugeAppPlattform(root)', 'anderePlattform(root)'],
  ['Web-Plattform wieder komponiert', quelldateien[1], 'erzeugeAppPlattform(root)', 'erzeugeWebPlattform(root)'],
  ['Import wieder als Dateifeld', quelldateien[1], 'importBedienung="schaltflaeche"', 'importBedienung="dateifeld"'],
  ['Native Ausgabe nicht komponiert', quelldateien[8], 'ausgabe: erzeugeNativeDateiAusgabe(plugin, sperre)', 'ausgabe: andereAusgabe()'],
  ['Import und Dialog anders komponiert', quelldateien[8], '...erzeugeNativeProjektEingabe(plugin, sperre)', '...andereEingabe(plugin, sperre)'],
  ['Speicher anders komponiert', quelldateien[8], 'speicher: erzeugeWebSpeicher(fenster)', 'speicher: andererSpeicher(fenster)'],
  ['Uhr anders komponiert', quelldateien[8], 'zeit: webZeit', 'zeit: andereZeit'],
  ['Ausgabe ohne gemeinsame Sperre', quelldateien[8], 'erzeugeNativeDateiAusgabe(plugin, sperre)', 'erzeugeNativeDateiAusgabe(plugin)'],
  ['Import ohne gemeinsame Sperre', quelldateien[8], 'erzeugeNativeProjektEingabe(plugin, sperre)', 'erzeugeNativeProjektEingabe(plugin)'],
  ['Sperre bei dispose nicht geschlossen', quelldateien[8], 'sperre.dispose()', 'andereAktion()'],
  ['Gemeinsamer Speicher der Website fehlt', quelldateien[4], 'speicher: erzeugeWebSpeicher(fenster)', 'speicher: andererSpeicher(fenster)'],
  ['Gemeinsame Uhr der Website fehlt', quelldateien[4], 'zeit: webZeit', 'zeit: andereZeit'],
  ['Adapterimport fehlt', quelldateien[1], "from '../adapters/app-plattform'", "from '../adapters/andere'"],
  ['Pluginregistrierung anders', quelldateien[7], "registerPlugin<DateiablaufPlugin>('Dateiablauf')", "registerPlugin<DateiablaufPlugin>('AnderesPlugin')"],
  ['Speichererfolg anders', quelldateien[1], 'PDF gespeichert.', 'PDF heruntergeladen.'],
  ['Teilenerfolg anders', quelldateien[1], 'PDF zum Teilen bereitgestellt.', 'PDF geteilt.'],
  ...['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'speichernUnter', 'teilen', 'ausgabeVerwerfen'].map(name => [
    `Native Methode ${name} fehlt`, quelldateien[5], `await plugin.${name}({`, 'await plugin.andereMethode({',
  ]),
  ...['projektWaehlen', 'zuruecksetzenBestaetigen'].flatMap(name => [
    [`Native Methode ${name} fehlt`, quelldateien[6], `await plugin.${name}()`, 'await plugin.andereMethode()'],
    [`Native Methode ${name} übergibt Felder`, quelldateien[6], `await plugin.${name}()`, `await plugin.${name}({ pfad })`],
  ]),
  ['Importmeldung fehlt', quelldateien[0], 'id="import-message"', 'id="andere-meldung"'],
  ['Rücksetzmeldung fehlt', quelldateien[0], 'id="reset-message"', 'id="andere-meldung"'],
  ['Importstatus nicht live', quelldateien[0], 'id="import-message" class="action-message" role="status" aria-live="polite"', 'id="import-message"'],
  ['UI liest Rücksetzmeldung nicht', quelldateien[2], "('#reset-message')", "('#andere-meldung')"],
  ['Regelkonstante fehlt', quelldateien[3], 'export const REGELVERSION', 'export const ANDERE_VERSION'],
]) test(`Quellvertrag: ${titel} muss abbrechen`, () => {
  assert.throws(() => quellvertrag(quellkopie(datei, ersetzen, durch)), /geändert|nicht gefunden|nicht im Quelltext/);
});

test('Gerätedatum verwendet UTC und behält Sekunden, Jahreswechsel und Schalttag', () => {
  assert.equal(datumBefehl(Date.parse('2027-01-01T00:03:04Z') / 1000), 'date -u 010100032027.04');
  assert.equal(datumBefehl(Date.parse('2028-02-29T12:00:00Z') / 1000), 'date -u 022912002028.00');
});
for (const wert of [undefined, null, '17', 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) test(`Gerätedatum lehnt ungültige Zeit ${String(wert)} ab`, () => {
  assert.throws(() => datumBefehl(wert), /Gerätezeit/);
});

/** Registriert die Phasen; kein Android-Befehl und kein CDP-Aufruf verlässt diesen Ersatz. */
async function umgebung({ evaluate, shell, send, uiBaum, events = [] } = {}) {
  const schritte = new Map(), befunde = new Map(), gespeicherte = new Map(), aufrufe = [];
  let clock = 0, display = 0;
  const cdp = {
    events,
    evaluate: async (code) => { aufrufe.push(['evaluate', code]); if (!evaluate) throw new Error('Unerwarteter CDP-Aufruf.'); return evaluate(code); },
    send: async (name, args) => { aufrufe.push(['send', name, args]); return send ? send(name, args) : {}; },
  };
  const ctx = {
    wurzel, app: 'de.baremos.fristenrechner', debug: 'app-debug.apk',
    install: async (...args) => { aufrufe.push(['install', ...args]); },
    start: async (...args) => { aufrufe.push(['start', ...args]); },
    stop: async (...args) => { aufrufe.push(['stop', ...args]); },
    sleep: async (ms) => { aufrufe.push(['sleep', ms]); },
    save: (name, wert) => { gespeicherte.set(name, wert); },
    befund: (name, wert) => { befunde.set(name, wert); },
    pruefung: async (name, fn) => { schritte.set(name, fn); },
    cdp: async (...args) => { aufrufe.push(['cdp', ...args]); return cdp; },
    shot: async (...args) => { aufrufe.push(['shot', ...args]); },
    uiBaum: async (...args) => { aufrufe.push(['uiBaum', ...args]); return uiBaum ? uiBaum(...args) : tastaturXml(); },
    shell: async (code) => { aufrufe.push(['shell', code]); if (code === 'dumpsys webviewupdate' && !shell) return 'Current WebView package (name, version): (com.android.webview, 133.0.6943.127)'; if (!shell) throw new Error('Unerwarteter Shell-Aufruf.'); return shell(code); },
    restoreClock: async () => { clock++; aufrufe.push(['restoreClock']); },
    restoreDisplay: async () => { display++; aufrufe.push(['restoreDisplay']); },
  };
  await ablaufA(ctx);
  return { ctx, schritte, befunde, gespeicherte, aufrufe, clock: () => clock, display: () => display };
}
const status = (befund, soll) => assert.equal(befund.status, soll, befund.grund);
const folge = (werte) => { let index = 0; return () => { assert.ok(index < werte.length, 'Kein unerwarteter zusätzlicher CDP-Aufruf.'); return structuredClone(werte[index++]); }; };

test('Ablauf A installiert und startet, registriert alle zehn Prüfungen', async () => {
  const u = await umgebung();
  assert.deepEqual([...u.schritte.keys()].sort(), ['A1', 'A10', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']);
  assert.deepEqual(u.aufrufe.map((a) => a[0]), ['install', 'start']);
});
test('A1 prüft Startzustand und verlangt eine wirksame Fehlerfalle', async () => {
  const u = await umgebung({ evaluate: folge([{ origin: 'https://localhost', fehlerVersteckt: true, formular: true }, true]) });
  status(await u.schritte.get('A1')(), 'bestanden');
  status(u.befunde.get('A1-Gegenprobe'), 'bestanden');
  assert.equal(u.aufrufe.filter((a) => a[0] === 'send' && a[1] === 'Page.reload').length, 2);
  assert.ok(u.gespeicherte.has('a1-start.json'));
});
for (const gp of [false, undefined, 'true', {}]) test(`A1 unbekannte oder wirkungslose Gegenprobe (${String(gp)}) besteht nicht`, async () => {
  const u = await umgebung({ evaluate: folge([{ origin: 'https://localhost', fehlerVersteckt: true, formular: true }, gp]) });
  await u.schritte.get('A1')();
  status(u.befunde.get('A1-Gegenprobe'), 'ungültig');
});
test('A1 sichtbare Fehlerfalle und Runtime-Ausnahme scheitern', async () => {
  const u = await umgebung({ evaluate: folge([{ origin: 'https://localhost', fehlerVersteckt: false, formular: true }, true]), events: [{ method: 'Runtime.exceptionThrown' }] });
  status(await u.schritte.get('A1')(), 'nicht bestanden');
});
test('A1 unvollständiger Startzustand ergibt ungültig', async () => {
  const u = await umgebung({ evaluate: folge([{ origin: 'https://localhost' }, true]) });
  status(await u.schritte.get('A1')(), 'ungültig');
});

function berechnung(patch = {}) {
  return { regel: quellvertrag(wurzel).text, zeilen: 4, speicher: { input: { projekt: { projektname: formularWerte.projektname } } }, ...patch };
}
test('A2 Formularberechnung prüft Regelanzeige und gespeichertes Projekt', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, berechnung()]) });
  status(await u.schritte.get('A2')(), 'bestanden');
  assert.ok(u.aufrufe.find((a) => a[0] === 'evaluate' && a[1].includes('checkValidity()') && a[1].includes('button[type="submit"]')));
});
for (const [name, patch, erwartet] of [
  ['falscher Regelstand', { regel: 'unbekannt' }, 'nicht bestanden'],
  ['keine berechneten Termine', { zeilen: 0 }, 'nicht bestanden'],
  ['unbekanntes Zählformat', { zeilen: '4' }, 'ungültig'],
  ['Speicher fehlt', { speicher: null }, 'ungültig'],
  ['anderes gespeichertes Projekt', { speicher: { input: { projekt: { projektname: 'Anderes Projekt' } } } }, 'nicht bestanden'],
]) test(`A2 ${name} besteht nicht`, async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, berechnung(patch)]) });
  status(await u.schritte.get('A2')(), erwartet);
});
for (const wert of [undefined, {}, { path: 5 }]) test('A3 unbekannte Brückenantwort ist ungültig', async () => {
  const u = await umgebung({ evaluate: () => wert });
  status(await u.schritte.get('A3')(), 'ungültig');
});

const geraeteTag = '2026-09-30';
const geloeschteWerte = () => ({ kunde: '', projektname: '', vergabenummer: '', vergabeordnung: 'vgv', verfahrensart: 'offen', bundesland: 'BE', bekanntmachung: geraeteTag });
test('A4 beweist Wiederherstellung und Verlust nach pm clear in dieser Reihenfolge', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, formularWerte, geloeschteWerte(), geraeteTag]), shell: () => 'Success\n' });
  status(await u.schritte.get('A4')(), 'bestanden');
  const relevante = u.aufrufe.filter((a) => ['stop', 'start', 'shell'].includes(a[0])).slice(1);
  assert.deepEqual(relevante.map((a) => a[0]), ['stop', 'start', 'stop', 'shell', 'start']);
  assert.equal(relevante[3][1], 'pm clear de.baremos.fristenrechner');
  assert.ok(u.gespeicherte.has('a4-persistenz.json'));
});
test('A4 verlorene Eingaben nach force-stop scheitern', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, geloeschteWerte(), geloeschteWerte(), geraeteTag]), shell: () => 'Success' });
  status(await u.schritte.get('A4')(), 'nicht bestanden');
});
test('A4 erhaltene Eingaben nach pm clear scheitern', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, formularWerte, formularWerte, geraeteTag]), shell: () => 'Success' });
  status(await u.schritte.get('A4')(), 'nicht bestanden');
});
test('A4 unbekannte pm-clear-Ausgabe bricht ab', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, formularWerte]), shell: () => 'unbekannt' });
  await assert.rejects(u.schritte.get('A4')(), /pm clear nicht bestätigt/);
});
for (const feld of ['vergabeordnung', 'bundesland', 'bekanntmachung']) test(`A4 nach pm clear erhaltenes Feld ${feld} scheitert`, async () => {
  const geloescht = geloeschteWerte(); geloescht[feld] = formularWerte[feld];
  const u = await umgebung({ evaluate: folge([formularWerte, formularWerte, geloescht, geraeteTag]), shell: () => 'Success' });
  status(await u.schritte.get('A4')(), 'nicht bestanden');
});
test('A4 fehlendes Gerätedatum nach pm clear bricht ab', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte, formularWerte, geloeschteWerte(), undefined]), shell: () => 'Success' });
  await assert.rejects(u.schritte.get('A4')(), /Gerätedatum nach pm clear nicht lesbar/);
});

function datumAntworten({ versteckt = [true, false] } = {}) {
  const grenze = new Date(`${quellvertrag(wurzel).datum}T12:00:00Z`);
  grenze.setUTCFullYear(grenze.getUTCFullYear() + 1);
  const danach = new Date(grenze); danach.setUTCDate(danach.getUTCDate() + 1);
  return [grenze.getTime() / 1000, { tag: grenze.toISOString().slice(0, 10), hidden: versteckt[0] }, danach.getTime() / 1000, { tag: danach.toISOString().slice(0, 10), hidden: versteckt[1] }];
}
const datumShell = (code) => code.startsWith('pidof ') ? '1234' : '';
test('A5 Grenze und Folgetag ohne Prozessneustart; Uhr anschließend zurückgesetzt', async () => {
  const u = await umgebung({ evaluate: folge(datumAntworten()), shell: datumShell });
  status(await u.schritte.get('A5')(), 'bestanden');
  assert.equal(u.clock(), 1);
  assert.equal(u.aufrufe.at(-1)[0], 'restoreClock');
  assert.equal(u.aufrufe.filter((a) => a[0] === 'shell' && a[1].startsWith('date -u ')).length, 2);
});
test('A5 falsche Hinweisgrenze scheitert und setzt die Uhr dennoch zurück', async () => {
  const u = await umgebung({ evaluate: folge(datumAntworten({ versteckt: [true, true] })), shell: datumShell });
  status(await u.schritte.get('A5')(), 'nicht bestanden');
  assert.equal(u.clock(), 1);
});
test('A5 Ausfall beim Stellen der Uhr führt durch finally', async () => {
  const u = await umgebung({ evaluate: folge(datumAntworten()), shell: (code) => { if (code.startsWith('date -u ')) throw new Error('Geräteuhr nicht erreichbar'); return datumShell(code); } });
  await assert.rejects(u.schritte.get('A5')(), /Geräteuhr nicht erreichbar/);
  assert.equal(u.clock(), 1);
});
test('A5 Ausfall der DOM-Abfrage nach Datumwechsel führt durch finally', async () => {
  let n = 0;
  const u = await umgebung({ evaluate: () => { if (n++ > 0) throw new Error('CDP getrennt'); return Date.parse('2027-07-17T12:00:00Z') / 1000; }, shell: datumShell });
  await assert.rejects(u.schritte.get('A5')(), /CDP getrennt/);
  assert.equal(u.clock(), 1);
});
test('A5 leere Prozesskennung darf keinen erfolgreichen Ablauf liefern', async () => {
  const u = await umgebung({ evaluate: folge(datumAntworten()), shell: () => '' });
  try { assert.notEqual((await u.schritte.get('A5')()).status, 'bestanden'); }
  catch (error) { if (error instanceof assert.AssertionError) throw error; assert.match(error.message, /PID|Prozess|Kennung/i); }
});
test('A5 Fehler beim Wiederherstellen kann keinen Erfolg liefern', async () => {
  const u = await umgebung({ evaluate: folge(datumAntworten()), shell: datumShell });
  u.ctx.restoreClock = async () => { throw new Error('Wiederherstellung fehlgeschlagen'); };
  await assert.rejects(u.schritte.get('A5')(), /Wiederherstellung fehlgeschlagen/);
});
test('A8 stellt Anzeigeeinstellungen auch nach einem Zwischenfehler zurück', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte]), shell: () => { throw new Error('Einstellung nicht erreichbar'); } });
  await assert.rejects(u.schritte.get('A8')(), /Einstellung nicht erreichbar/);
  assert.equal(u.display(), 1);
});

test('A9 prüft oberste Activity; Fokus allein reicht nicht', async () => {
  const u = await umgebung({ shell: (code) => code.startsWith('dumpsys') ? 'mCurrentFocus=Window{1 u0 de.baremos.fristenrechner/.MainActivity}' : '' });
  status(await u.schritte.get('A9')(), 'ungültig');
});
test('A9 App im Vordergrund nach Zurück scheitert', async () => {
  const u = await umgebung({ shell: (code) => code.startsWith('dumpsys') ? 'topResumedActivity=ActivityRecord{1 u0 de.baremos.fristenrechner/.MainActivity t1}' : '' });
  status(await u.schritte.get('A9')(), 'nicht bestanden');
});
const namen = [{ element: 'button', typ: 'submit', name: 'Berechnen', quelle: 'text' }];
test('A10 fehlender Barrierebaum bleibt ungültig', async () => {
  const u = await umgebung({ send: () => ({}), evaluate: () => namen });
  status(await u.schritte.get('A10')(), 'ungültig');
});

test('A8 und A10 lassen sich ohne andere Prüfungen registrieren', async () => {
  const schritte = [];
  const ctx = { pruefung: async (name) => { schritte.push(name); } };
  await ablaufA8(ctx); await ablaufA10(ctx);
  assert.deepEqual(schritte, ['A8', 'A10']);
});

const tastaturXml = (patch = '') => `<hierarchy><node class="android.widget.EditText" package="de.baremos.fristenrechner" text="Gespeichertes Testprojekt" enabled="true" bounds="[10,100][110,150]" ${patch}/></hierarchy>`;
async function anzeigeUmgebung({ rotationZurueck = false, tippenFehler = false } = {}) {
  let schrift = '1.0', rotation = '0', nacht = 'no', tastatur = '0', getippt = false, setRotation = 0;
  return umgebung({
    evaluate: (code) => {
      if (code.includes('checkValidity()')) return formularWerte;
      if (code.includes('ueberlaufMessung')) return { scrollWidth: 400, clientWidth: 400, ueberlaufElemente: [] };
      if (code.includes('ausrichtung:screen.orientation')) return { breite: rotation === '1' ? 800 : 400, hoehe: rotation === '1' ? 400 : 800, ausrichtung: rotation === '1' ? 'landscape-primary' : 'portrait-primary' };
      if (code.includes('tastaturViewport')) return { innerHeight: getippt ? 400 : 700, clientHeight: getippt ? 400 : 700, visualViewportHeight: getippt ? 400 : 700, aktivesElement: getippt ? { tag: 'input', id: '', name: 'projektname' } : { tag: 'body', id: '', name: '' } };
      return undefined;
    },
    shell: (code) => {
      assert.ok(!code.includes(';'), 'Anzeigewechsel werden einzeln ausgeführt.');
      if (code.startsWith('settings put system font_scale ')) schrift = code.split(' ').at(-1);
      if (code.startsWith('settings put system user_rotation ')) {
        rotation = code.split(' ').at(-1);
        if (rotation === '1' && rotationZurueck && ++setRotation === 1) rotation = '0';
      }
      if (code.startsWith('cmd uimode night ')) nacht = code.split(' ').at(-1);
      if (code.startsWith('settings put secure show_ime_with_hard_keyboard ')) tastatur = code.split(' ').at(-1);
      if (code === 'settings get secure show_ime_with_hard_keyboard') return tastatur;
      if (code === 'settings get system font_scale') return schrift;
      if (code === 'settings get system user_rotation') return rotation;
      if (code === 'cmd uimode night') return `Night mode: ${nacht}`;
      if (code === 'dumpsys input_method') return 'mInputShown=true\nmIsInputViewShown=true';
      if (code === 'dumpsys window windows') return 'Window #0 Window{abc u0 InputMethod}:\n  mFrame=[0,1200][1080,2300]\n  isOnScreen=true isVisible=true\n  mCurrentFocus=Window{def u0 de.baremos.fristenrechner/de.baremos.fristenrechner.MainActivity}';
      if (code.startsWith('input tap ')) { if (tippenFehler) throw new Error('Nativer Tipp fehlgeschlagen.'); getippt = true; }
      return '';
    },
  });
}

test('A8 verbindet neu, tippt mit nativen Koordinaten und stellt alle Einstellungen zurück', async () => {
  const u = await anzeigeUmgebung();
  status(await u.schritte.get('A8')(), 'Sichtprüfung ausstehend');
  assert.equal(u.aufrufe.filter(a => a[0] === 'cdp' && a[2]?.neu === true).length, 5);
  assert.equal(u.aufrufe.filter(a => a[0] === 'shot').length, 5);
  assert.equal(u.display(), 1);
  assert.equal(u.aufrufe.filter(a => a[0] === 'send' && a[1] === 'Input.dispatchTouchEvent').length, 0);
  assert.ok(u.aufrufe.some(a => a[0] === 'shell' && a[1] === 'input tap 60 125'));
  assert.deepEqual(u.gespeicherte.get('a8-tastatur-wiederherstellung.json'), { vorher: '0', nachher: '0' });
  for (const [name, b] of u.befunde) status(b, 'bestanden');
});

test('A8 wiederholt eine zurückgesetzte Rotation und belegt den zweiten Wert', async () => {
  const u = await anzeigeUmgebung({ rotationZurueck: true });
  await u.schritte.get('A8')();
  assert.deepEqual(u.gespeicherte.get('a8-gedreht-einstellungen.json').versuche, [{ versuch: 1, rotation: '0' }, { versuch: 2, rotation: '1' }]);
  status(u.befunde.get('A8-gedreht-Einstellungen'), 'bestanden');
});

test('A8 räumt die zusätzliche IME-Einstellung auch bei einem fehlgeschlagenen Tipp auf', async () => {
  const u = await anzeigeUmgebung({ tippenFehler: true });
  await assert.rejects(u.schritte.get('A8')(), /Nativer Tipp fehlgeschlagen/);
  assert.deepEqual(u.gespeicherte.get('a8-tastatur-wiederherstellung.json'), { vorher: '0', nachher: '0' });
  assert.equal(u.display(), 1);
});

test('A8 behält den CDP-Fehler, wenn zusätzlich die Wiederherstellung scheitert', async () => {
  const u = await umgebung({ evaluate: folge([formularWerte]), shell: () => { throw new Error('CDP-Zeitüberschreitung: Runtime.evaluate'); } });
  u.ctx.restoreDisplay = async () => { throw new Error('Einstellung font_scale wurde nicht wiederhergestellt.'); };
  await assert.rejects(u.schritte.get('A8')(), /CDP-Zeitüberschreitung: Runtime.evaluate; Wiederherstellung: Einstellung font_scale/);
  status(u.befunde.get('A8-Wiederherstellung'), 'ungültig');
});

test('A10 verbindet neu, belegt DOM und aktiviert Accessibility vor der Baumabfrage', async () => {
  const u = await umgebung({ evaluate: () => namen });
  await u.schritte.get('A10')();
  assert.deepEqual(u.aufrufe.filter(a => a[0] === 'cdp').map(a => a[2]), [{ neu: true }]);
  assert.deepEqual(u.aufrufe.filter(a => a[0] === 'send').map(a => a[1]), ['Accessibility.enable', 'Accessibility.getFullAXTree']);
  status(u.befunde.get('A10-DOM-ARIA'), 'bestanden');
  assert.deepEqual(u.gespeicherte.get('a10-dom-aria.json'), namen);
});

for (const fehler of [axZeitgrenze, 'CDP-Zeitüberschreitung: Accessibility.enable', 'CDP -32601: method not found']) {
  test(`A10 dokumentiert die Grenze bei erreichbarem DOM: ${fehler}`, async () => {
    const u = await umgebung({ evaluate: () => namen, send: () => { throw new Error(fehler); } });
    status(await u.schritte.get('A10')(), 'dokumentierte Grenze');
    status(u.befunde.get('A10-DOM-ARIA'), 'bestanden');
    assert.deepEqual(u.gespeicherte.get('a10-barrierebaum-fehler.json'), { fehler, domErreichbar: true });
  });
}

test('A10 allgemein nicht erreichbares CDP wird nicht zur dokumentierten AX-Grenze', async () => {
  const u = await umgebung({ evaluate: () => { throw new Error('CDP-Zeitüberschreitung: Runtime.evaluate'); } });
  await assert.rejects(u.schritte.get('A10')(), /CDP-Zeitüberschreitung: Runtime.evaluate/);
  assert.equal(u.aufrufe.filter(a => a[0] === 'send').length, 0);
});

test('A10 unerwartete AX-Fehler bleiben ungültige Ausführung', async () => {
  const u = await umgebung({ evaluate: () => namen, send: () => { throw new Error('CDP-Verbindung geschlossen'); } });
  await assert.rejects(u.schritte.get('A10')(), /CDP-Verbindung geschlossen/);
});

test('DOM-Namenprobe erkennt label, ARIA und unbenannte Elemente ohne Eingabewert als Namen zu verwenden', () => {
  const element = (attributes = {}, patch = {}) => ({
    tagName: 'INPUT', type: 'text', value: 'Kein Name', labels: [], getClientRects: () => [{}], closest: () => null,
    getAttribute: name => attributes[name] ?? null, ...patch,
  });
  const controls = [element({}, { labels: [{ textContent: ' Projektname ' }] }), element({ 'aria-label': 'Suche' }), element({ 'aria-labelledby': 'beschriftung' }), element()];
  const ergebnis = JSON.parse(JSON.stringify(runInNewContext(`(${domAriaNamen.toString()})()`, {
    document: { querySelectorAll: () => controls, getElementById: id => id === 'beschriftung' ? { textContent: ' Auswahl ' } : null },
    getComputedStyle: () => ({ visibility: 'visible' }),
  })));
  assert.deepEqual(ergebnis.map(n => [n.name, n.quelle]), [['Projektname', 'label'], ['Suche', 'aria-label'], ['Auswahl', 'aria-labelledby'], ['', '']]);
  status(evaluiereDomAria(ergebnis), 'nicht bestanden');
  status(evaluiereDomAria(ergebnis.slice(0, 3)), 'bestanden');
});

for (const unbekannt of [null, [], [{}], [{ element: 'input', name: 1, quelle: 'label' }]]) {
  test('DOM-Namenprobe benötigt vollständige Daten', () => status(evaluiereDomAria(unbekannt), 'ungültig'));
}

test('Überlaufdiagnose benennt sichtbare Elemente, lässt Tabelleninhalt aus und prüft den Tabellenrahmen', () => {
  const element = (tag, rechts, patch = {}) => ({ tagName: tag, id: '', textContent: 'x'.repeat(200), getAttribute: () => '', getClientRects: () => [{}], closest: () => null, getBoundingClientRect: () => ({ left: 0, right: rechts, top: 0, bottom: 30, width: rechts, height: 30 }), ...patch });
  const rahmen = element('DIV', 420, { getAttribute: () => 'table-scroll' }); rahmen.closest = () => rahmen;
  const innen = element('TD', 900, { closest: () => rahmen });
  const hidden = element('H2', 800, { getClientRects: () => [] });
  const daten = JSON.parse(JSON.stringify(runInNewContext(`(${ueberlaufMessung.toString()})()`, {
    document: { documentElement: { clientWidth: 412, scrollWidth: 549 }, body: { scrollWidth: 549 }, querySelectorAll: () => [element('H1', 549), element('P', 400), rahmen, innen, hidden] },
    getComputedStyle: () => ({ visibility: 'visible' }),
  })));
  assert.deepEqual(daten.ueberlaufElemente.map(e => [e.tag, e.rechts]), [['h1', 549], ['div', 420]]);
  assert.equal(daten.ueberlaufElemente[0].text.length, 160);
  assert.equal(daten.scrollWidth, 549);
});

test('Überlaufdiagnose erkennt ein langes Wort außerhalb einer passend breiten Überschrift', () => {
  const text = { nodeType: 3, textContent: 'Fristenrechner', rechts: 549 };
  const h1 = { tagName: 'H1', id: '', textContent: text.textContent, childNodes: [text], getAttribute: () => '', getClientRects: () => [{}], closest: () => null, getBoundingClientRect: () => ({ left: 16, right: 396, top: 0, bottom: 100, width: 380, height: 100 }) };
  const daten = JSON.parse(JSON.stringify(runInNewContext(`(${ueberlaufMessung.toString()})()`, {
    document: { documentElement: { clientWidth: 412, scrollWidth: 549 }, body: { scrollWidth: 549 }, querySelectorAll: () => [h1], createRange: () => { let knoten; return { selectNodeContents: n => { knoten = n; }, getBoundingClientRect: () => ({ right: knoten.rechts }) }; } },
    getComputedStyle: () => ({ visibility: 'visible' }),
  })));
  assert.equal(daten.ueberlaufElemente.length, 1);
  assert.deepEqual([daten.ueberlaufElemente[0].rechts, daten.ueberlaufElemente[0].textRechts], [396, 549]);
});

test('Nativer Tipp benötigt genau ein sichtbares Projektfeld und keine DOM-Pixelrechnung', () => {
  assert.deepEqual(tastaturTippPunkt(tastaturXml(), 'de.baremos.fristenrechner'), { x: 60, y: 125, bounds: [10, 100, 110, 150] });
  for (const xml of ['', tastaturXml().replace('[10,100][110,150]', '[0,0][0,0]'), tastaturXml().replace('Gespeichertes Testprojekt', 'Anderes Projekt'), tastaturXml() + tastaturXml()]) {
    assert.throws(() => tastaturTippPunkt(xml, 'de.baremos.fristenrechner'), /nicht eindeutig sichtbar/);
  }
});

test('A10 sichert DOM-Knoten des unbenannten fokussierbaren Elements mit WebView-Version', async () => {
  const u = await umgebung({ evaluate: () => namen, send: (methode, params) => {
    if (methode === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: '1', ignored: false, role: { value: 'RootWebArea' }, name: { value: 'App' } }, { nodeId: '2', ignored: false, role: { value: 'generic' }, name: { value: '' }, backendDOMNodeId: 12, properties: [{ name: 'focusable', value: { value: true } }] }] };
    if (methode === 'DOM.describeNode') { assert.equal(params.backendNodeId, 12); return { node: { nodeName: 'DIV', attributes: ['class', 'table-scroll', 'tabindex', '0'] } }; }
    return {};
  } });
  await u.schritte.get('A10')();
  const baum = u.gespeicherte.get('a10-barrierebaum.json');
  assert.equal(baum.webviewVersion, '133.0.6943.127');
  assert.deepEqual(baum.domKnoten, [{ backendDOMNodeId: 12, nodeName: 'DIV', attributes: ['class', 'table-scroll', 'tabindex', '0'] }]);
});

test('DOM-Namenprobe zählt Tabelleninhalt nicht als Namen eines fokussierbaren Rollbereichs', () => {
  const rollen = [{ role: null, label: null }, { role: 'group', label: 'Termintabelle horizontal verschieben' }];
  const daten = JSON.parse(JSON.stringify(runInNewContext(`(${domAriaNamen.toString()})()`, {
    document: { querySelectorAll: () => rollen.map(({ role, label }) => ({ tagName: 'DIV', textContent: 'Termine Inhalt', getClientRects: () => [{}], closest: () => null, getAttribute: n => ({ role, 'aria-label': label }[n] || null) })), getElementById: () => null }, getComputedStyle: () => ({ visibility: 'visible' }),
  })));
  assert.equal(daten[0].name, '');
  assert.equal(daten[1].name, 'Termintabelle horizontal verschieben');
});
