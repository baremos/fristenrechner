// Aufruf: node --test scripts/browser-lauf.test.mjs
// Kein Browser; HTTP-Prüfungen ausschließlich über 127.0.0.1.
import './browser/prozessende.test.mjs';
import './browser/download.test.mjs';
import './browser/webadapter.test.mjs';
import './browser/netz-cdp.test.mjs';
import './browser/netz-auswertung.test.mjs';
import './browser/rahmen.test.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ausgabeVorbereiten, browserArgumente, browserKandidaten, lokalerServer, verbindeFrischeSeite } from './browser-lauf.mjs';
import {
  anfrageBewerten, argumente, auswerten, netlogAnfragen, netzErlaubt,
  neuesProtokoll, pruefung,
} from './browser/auswertung.mjs';
import { ERGEBNISKATALOG } from './browser/ergebniskatalog.mjs';

const basis = ['--phase', 'vertrag', '--ausgabe', 'scratchpad/browser-probe'];

test('Diagnose ist ein einzelner optionaler Schalter ohne Wert; normale Optionen bleiben gleich', () => {
  assert.deepEqual(argumente([...basis, '--diagnose']), { ...argumente(basis), diagnose: true });
  assert.throws(() => argumente([...basis, '--diagnose', '--diagnose']), /Argument doppelt.*--diagnose/);
  assert.throws(() => argumente([...basis, '--diagnose', 'true']), /Unbekanntes Argument/);
});
const protokoll = (daten = {}) => neuesProtokoll({
  commit: 'a'.repeat(40), arbeitsstand: 'geändert', phase: 'vertrag', browser: 'edge', ...daten,
});

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testBasis = join(wurzel, 'scratchpad/test-browser');
mkdirSync(testBasis, { recursive: true });
const temp = realpathSync(testBasis);
const arbeit = mkdtempSync(join(temp, 'browser-tests-'));
test.after(() => {
  // Nur den selbst erzeugten, tatsächlich in der Temp-Basis liegenden Ordner löschen.
  const rest = relative(realpathSync(temp), realpathSync(arbeit));
  assert.ok(rest.startsWith('browser-tests-') && !isAbsolute(rest) && !rest.includes(sep));
  rmSync(arbeit, { recursive: true, force: true });
});

function testRepository(name) {
  const repo = join(arbeit, name);
  mkdirSync(join(repo, 'scratchpad'), { recursive: true });
  return repo;
}

test('Die Gastgeberkomponente entspricht dem Astro-Beispiel der README wortgleich', () => {
  const lesen = datei => readFileSync(join(wurzel, datei), 'utf8').replace(/\r\n/g, '\n');
  const readme = lesen('packages/oberflaeche/README.md');
  const beispiel = /^```astro\n([\s\S]*?)^```$/m.exec(readme);
  assert.ok(beispiel, 'Astro-Codeblock in der README vorhanden');
  assert.equal(lesen('scripts/browser/probeseite/src/components/ReadmeBeispiel.astro'), beispiel[1]);
});

test('Beide Probeseiten haben eine Standardsmodus-Hülle ohne zusätzliche Gastgeberstile', () => {
  for (const seite of ['index', 'vertrag']) {
    const quelle = readFileSync(join(wurzel, 'scripts/browser/probeseite/src/pages', `${seite}.astro`), 'utf8').replace(/\r\n/g, '\n');
    assert.match(quelle, /^---\n[\s\S]*?\n---\n\s*<!doctype html>\s*<html\s+lang="de">/i, seite);
    assert.match(quelle, /<meta\s+name="viewport"\s+content="width=device-width, initial-scale=1"\s*\/>/, seite);
    assert.match(quelle, /<body>[\s\S]*<\/body>\s*<\/html>\s*$/, seite);
    assert.doesNotMatch(quelle, /<style\b|\bbox-sizing\s*:|\brel\s*=\s*["']stylesheet["']|\bimport\b[^;\n]*\.css\b/i, seite);
  }
});

test('Pflichtargumente wählen genau eine Phase und beide Browser als Vorgabe', () => {
  assert.deepEqual(argumente(basis), {
    phase: 'vertrag', phasen: ['vertrag'], browser: 'beide', ausgabe: 'scratchpad/browser-probe',
  });
});

test('Sammelphase bleibt auf V6a beschränkt und erhält einen Pfad mit Leerzeichen', () => {
  const eingabe = ['--browser', 'chrome', '--ausgabe', 'scratchpad/Probe mit Leerzeichen', '--phase', 'alle-v6a'];
  const vorher = [...eingabe];
  const ergebnis = argumente(eingabe);
  assert.deepEqual(ergebnis.phasen, ['vertrag', 'webadapter']);
  assert.equal(ergebnis.browser, 'chrome');
  assert.equal(ergebnis.ausgabe, 'scratchpad/Probe mit Leerzeichen');
  assert.deepEqual(eingabe, vorher);
  ergebnis.phasen.push('unbeauftragt');
  assert.deepEqual(argumente(eingabe).phasen, ['vertrag', 'webadapter']);
});

test('Webadapter lässt sich einzeln mit Edge auswählen', () => {
  assert.deepEqual(argumente(['--phase', 'webadapter', '--ausgabe', 'lauf', '--browser', 'edge']).phasen, ['webadapter']);
  assert.equal(argumente([...basis, '--browser', 'edge']).browser, 'edge');
});

for (const [name, eingabe, meldung] of [
  ['ohne Argumente', [], /Pflichtargument/],
  ['ohne Ausgabe', ['--phase', 'vertrag'], /Pflichtargument.*--ausgabe/],
  ['ohne Phase', ['--ausgabe', 'lauf'], /Pflichtargument.*--phase/],
  ['Phase ohne Wert', ['--phase'], /Wert fehlt.*--phase/],
  ['Ausgabe ohne Wert', ['--phase', 'vertrag', '--ausgabe'], /Wert fehlt.*--ausgabe/],
  ['Browser ohne Wert', [...basis, '--browser'], /Wert fehlt.*--browser/],
  ['Schalter statt Wert', ['--phase', '--ausgabe', 'lauf'], /Wert fehlt.*--phase/],
  ['leerer Wert', ['--phase', 'vertrag', '--ausgabe', '  '], /Wert fehlt.*--ausgabe/],
  ['unbekannter Schalter', [...basis, '--fremd', 'ja'], /Unbekanntes Argument/],
  ['loses Argument', [...basis, 'fremd'], /Unbekanntes Argument/],
  ['Doppelphase', [...basis, '--phase', 'webadapter'], /Argument doppelt.*--phase/],
  ['Doppelausgabe', [...basis, '--ausgabe', 'anders'], /Argument doppelt.*--ausgabe/],
  ['Doppelbrowser', [...basis, '--browser', 'edge', '--browser', 'chrome'], /Argument doppelt.*--browser/],
  ['unbekannte Phase', ['--phase', 'unbekannt', '--ausgabe', 'lauf'], /--phase muss/],
  ['unbekannte Sammelphase', ['--phase', 'alle-unbekannt', '--ausgabe', 'lauf'], /--phase muss/],
  ['nicht automatisierter Browser', [...basis, '--browser', 'firefox'], /--browser muss/],
]) {
  test(`Argumente verwerfen ${name}`, () => assert.throws(() => argumente(eingabe), meldung));
}

test('Protokoll bewahrt Herkunft und Version und erzeugt unabhängige Sammlungen', () => {
  const davor = Date.now();
  const eins = protokoll({ version: 'Chrome/140.0.0.0' });
  const zwei = protokoll();
  assert.equal(eins.commit, 'a'.repeat(40));
  assert.equal(eins.arbeitsstand, 'geändert');
  assert.equal(eins.phase, 'vertrag');
  assert.equal(eins.browser, 'edge');
  assert.equal(eins.version, 'Chrome/140.0.0.0');
  assert.equal(zwei.version, null);
  assert.ok(Date.parse(eins.beginn) >= davor && Date.parse(eins.beginn) <= Date.now());
  for (const feld of ['ergebnisse', 'konsolenmeldungen', 'netzanfragen', 'befunde', 'messungen', 'grenzen']) {
    eins[feld].push({ nachweis: feld });
    assert.deepEqual(zwei[feld], [], `Geteilte Sammlung: ${feld}`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(eins)), eins);
});

test('Asynchrone Einzelprüfung übernimmt ihren Nachweis erst nach Abschluss', async () => {
  const bericht = protokoll();
  let fertig;
  const nachweis = { datei: 'probe.xlsx', bytes: 321 };
  const warten = new Promise(resolve => { fertig = resolve; });
  const lauf = pruefung(bericht, 'W1', 'Datei herunterladen', async () => { await warten; return nachweis; });
  assert.equal(bericht.ergebnisse.length, 0);
  fertig();
  const ergebnis = await lauf;
  assert.equal(ergebnis.status, 'bestanden');
  assert.equal(ergebnis.id, 'W1');
  assert.equal(ergebnis.beschreibung, 'Datei herunterladen');
  assert.deepEqual(ergebnis.details, nachweis);
  assert.ok(ergebnis.dauerMs >= 0);
  assert.deepEqual(bericht.ergebnisse, [ergebnis]);
});

test('Fehlgeschlagene Prüfung bleibt sichtbar und verhindert keine Folgeprüfung', async () => {
  const bericht = protokoll();
  await pruefung(bericht, 'W1', 'Fehlender Download', async () => { throw new Error('Datei fehlt'); });
  await pruefung(bericht, 'W2', 'Nächste Prüfung', () => {});
  assert.deepEqual(bericht.ergebnisse.map(e => [e.id, e.status]), [['W1', 'nicht bestanden'], ['W2', 'bestanden']]);
  assert.equal(bericht.ergebnisse[0].meldung, 'Datei fehlt');
  assert.equal(bericht.ergebnisse[1].details, null);
  assert.equal(auswerten(bericht).code, 2, 'Fehlende Vertragsfälle bleiben ungültig');
});

test('Doppelte Prüfkennungen werden vor einem zweiten Seiteneffekt abgewiesen', async () => {
  const bericht = protokoll();
  await pruefung(bericht, 'W1', 'Erste Prüfung', () => {});
  let aufgerufen = false;
  await assert.rejects(pruefung(bericht, 'W1', 'Zweite Prüfung', () => { aufgerufen = true; }), /Prüfkennung doppelt.*W1/);
  assert.equal(aufgerufen, false);
  assert.equal(bericht.ergebnisse.length, 1);
});

test('Vollständig bestandene Ergebnisse mit lokalen Ressourcen ergeben Code 0', () => {
  assert.deepEqual(auswerten({
    phase: 'vertrag', ergebnisse: ERGEBNISKATALOG.vertrag.map(id => ({ id, status: 'bestanden' })),
    netzanfragen: [{ url: 'http://127.0.0.1:41123/' }, { url: 'blob:http://127.0.0.1:41123/datei' }, { url: 'data:image/png;base64,AA==' }],
  }), { status: 'bestanden', code: 0, bestanden: 14, grenzen:0, fehler: 0, netzfehler: 0, katalogfehler: [] });
});

test('Eine fremde Anfrage lässt auch sonst bestandene Prüfungen scheitern', () => {
  assert.deepEqual(auswerten({
    phase: 'vertrag', ergebnisse: ERGEBNISKATALOG.vertrag.map(id => ({ id, status: 'bestanden' })),
    netzanfragen: [{ url: 'http://127.0.0.1:4321/' }, { url: 'https://fremd.invalid/' }],
  }), { status: 'nicht bestanden', code: 1, bestanden: 14, grenzen:0, fehler: 0, netzfehler: 1, katalogfehler: [] });
});

test('Auswertung zählt fachliche Fehler und Netzfehler getrennt', () => {
  assert.deepEqual(auswerten({
    phase: 'vertrag', ergebnisse: ERGEBNISKATALOG.vertrag.map((id, i) => ({ id, status: i < 2 ? 'nicht bestanden' : 'bestanden' })),
    netzanfragen: [{ url: 'https://fremd.invalid/' }, { url: 'file:///probe.html' }],
  }), { status: 'nicht bestanden', code: 1, bestanden: 12, grenzen:0, fehler: 2, netzfehler: 2, katalogfehler: [] });
});

for (const ergebnisse of [undefined, [], [{ status: 'übersprungen' }], [{}]]) {
  test(`Fehlende gültige Nachweise ergeben Code 2: ${JSON.stringify(ergebnisse)}`, () => {
    const auswertung = auswerten({ ergebnisse });
    assert.equal(auswertung.code, 2);
    assert.equal(auswertung.status, 'ungültig');
  });
}

test('Unvollständige Ausführung hat Vorrang vor daneben erkannten Fehlern', () => {
  const ergebnis = auswerten({
    ergebnisse: [{ status: 'nicht bestanden' }, { status: 'abgebrochen' }],
    netzanfragen: [{ url: 'https://fremd.invalid/' }],
  });
  assert.equal(ergebnis.code, 2);
  assert.equal(ergebnis.fehler, 1);
  assert.equal(ergebnis.netzfehler, 1);
});

for (const url of [
  'http://127.0.0.1', 'http://127.0.0.1:43210/_astro/seite.js',
  'https://127.0.0.1/probe?weiter=https://fremd.invalid#anker',
  'ws://127.0.0.1:43210/devtools/page/1', 'wss://127.0.0.1:443/',
]) {
  test(`Netzregel erlaubt ausschließlich lokalen Ursprung: ${url}`, () => assert.equal(netzErlaubt(url), true));
}

for (const url of [
  'https://fremd.invalid/', 'http://localhost:1234/', 'http://127.0.0.2/',
  'http://[::1]/', 'http://2130706433/', 'http://0x7f000001/', 'http://127.1/',
  'http://0177.0.0.1/', 'http://127.0.0.1.fremd.invalid/', 'http://127.0.0.10/',
  'http://127.0.0.1@fremd.invalid/', 'http://127.0.0.1:80@fremd.invalid/',
  'http://benutzer@127.0.0.1/', 'http://benutzer:passwort@127.0.0.1/',
  'http://127.0.0.1%2efremd.invalid/', 'http://127.0.0.1:99999/',
  '//127.0.0.1/', '/lokal', 'file:///probe.html', 'ftp://127.0.0.1/',
  'http:\\127.0.0.1\\', ' http://127.0.0.1/', '', null, undefined, 123,
]) {
  test(`Netzregel verwirft fremde oder mehrdeutige Adresse: ${String(url)}`, () => assert.equal(netzErlaubt(url), false));
}

test('Daten und lokale Blobs sind Ressourcen, aber keine erlaubten Netzziele', () => {
  const daten = 'data:text/plain,https://fremd.invalid/';
  const blob = 'blob:http://127.0.0.1:43210/4c940941-6cf4-4d1a-aecb-26e94dfe98cd';
  assert.equal(netzErlaubt(daten), false);
  assert.equal(netzErlaubt(blob), false);
  assert.deepEqual(anfrageBewerten(daten), { erlaubt: true, art: 'eingebettete Daten' });
  assert.deepEqual(anfrageBewerten(blob), { erlaubt: true, art: 'lokaler Blob' });
  for (const url of ['blob:https://fremd.invalid/datei', 'blob:null/datei', 'blob:http://localhost/datei', 'blob:blob:http://127.0.0.1/datei', 'javascript:void(0)']) {
    assert.equal(anfrageBewerten(url).erlaubt, false, url);
  }
});

test('NetLog übernimmt nur echte Anfrageereignisse und erhält deren Herkunft', () => {
  const daten = {
    constants: { logEventTypes: { URL_REQUEST_START_JOB: 7, WEBSOCKET_ALIVE: 8, HTTP_CACHE_ENTRY: 9 } },
    events: [
      { type: 7, time: '100', params: { url: 'http://127.0.0.1:43210/', method: 'GET' } },
      { type: 8, time: '101', params: { url: 'ws://127.0.0.1:43210/devtools/page/1' } },
      { type: 9, time: '102', params: { url: 'https://nur-ein-text.invalid/' } },
      { type: 7, time: '103', params: { method: 'GET' } },
      { type: 7, time: '104', params: { url: 42 } },
      { type: 7, time: '105', params: { url: 'https://fremd.invalid/', method: 'POST' } },
    ],
  };
  const anfragen = netlogAnfragen(daten);
  assert.deepEqual(anfragen, [
    { quelle: 'Browser-NetLog', zeit: '100', url: 'http://127.0.0.1:43210/', methode: 'GET' },
    { quelle: 'Browser-NetLog', zeit: '101', url: 'ws://127.0.0.1:43210/devtools/page/1', methode: null },
    { quelle: 'Browser-NetLog', zeit: '105', url: 'https://fremd.invalid/', methode: 'POST' },
  ]);
  assert.equal(auswerten({ ergebnisse: [{ status: 'bestanden' }], netzanfragen: anfragen }).netzfehler, 1);
});

test('NetLog-Typnummern stammen aus dem Protokoll und dürfen auch null sein', () => {
  assert.equal(netlogAnfragen({
    constants: { logEventTypes: { URL_REQUEST_START_JOB: 0 } },
    events: [{ type: 0, time: '1', params: { url: 'http://127.0.0.1/' } }],
  }).length, 1);
  assert.deepEqual(netlogAnfragen({ constants: { logEventTypes: { URL_REQUEST_START_JOB: 101 } }, events: [] }), []);
});

for (const daten of [null, {}, { constants: { logEventTypes: {} }, events: [] }, { constants: { logEventTypes: { URL_REQUEST_START_JOB: 7 } } }, { constants: { logEventTypes: {} }, events: {} }]) {
  test(`Unvollständiges NetLog ist kein leerer erfolgreicher Nachweis: ${JSON.stringify(daten)}`, () => {
    assert.throws(() => netlogAnfragen(daten), /NetLog/);
  });
}

test('Neue und leere Ausgabeordner im Scratchpad sind zulässig', () => {
  const repo = testRepository('neue-ausgabe');
  const neu = join(repo, 'scratchpad', 'verschachtelt', 'lauf');
  const leer = join(repo, 'scratchpad', 'leer');
  mkdirSync(leer);
  assert.equal(ausgabeVorbereiten(neu, [repo]), realpathSync(neu));
  assert.ok(statSync(neu).isDirectory());
  assert.equal(ausgabeVorbereiten(leer, [repo]), realpathSync(leer));
});

test('Vorhandene Belege werden bei einer erneuten Ausgabe nicht überschrieben', () => {
  const repo = testRepository('belegte-ausgabe');
  const belegt = join(repo, 'scratchpad', 'belegt');
  mkdirSync(belegt);
  writeFileSync(join(belegt, 'protokoll.json'), 'bisheriger Beleg');
  assert.throws(() => ausgabeVorbereiten(belegt, [repo]), /neu oder leer/);
  assert.equal(readFileSync(join(belegt, 'protokoll.json'), 'utf8'), 'bisheriger Beleg');
  const datei = join(repo, 'scratchpad', 'datei');
  writeFileSync(datei, 'bleibt');
  assert.throws(() => ausgabeVorbereiten(datei, [repo]), /neu oder leer/);
  assert.equal(readFileSync(datei, 'utf8'), 'bleibt');
});

test('Repository, Vorfahren und Produktordner bleiben als Ausgabe gesperrt', () => {
  const repo = testRepository('gesperrte-ausgabe');
  for (const pfad of [repo, dirname(repo), join(repo, 'packages', 'neu'), join(repo, 'scratchpad-aehnlich'), join(repo, 'scratchpad', '..', 'src')]) {
    assert.throws(() => ausgabeVorbereiten(pfad, [repo]), /Repository|scratchpad/, pfad);
  }
  assert.equal(existsSync(join(repo, 'packages')), false);
  assert.equal(existsSync(join(repo, 'src')), false);
});

test('Bei verschachtelten Worktrees entscheidet das nächste Repository', () => {
  const haupt = testRepository('haupt-repository');
  const worktree = join(haupt, '.worktrees', 'probe');
  mkdirSync(worktree, { recursive: true });
  const ziel = join(worktree, 'scratchpad', 'lauf');
  assert.equal(ausgabeVorbereiten(ziel, [haupt, worktree]), realpathSync(ziel));
  assert.throws(() => ausgabeVorbereiten(join(haupt, 'src', 'lauf'), [haupt, worktree]), /scratchpad/);
});

test('Ein anderer Ausgabeort außerhalb des Repositorys ist zulässig', () => {
  const repo = testRepository('externes-repository');
  const ziel = join(arbeit, 'externe-ausgabe');
  assert.equal(ausgabeVorbereiten(ziel, [repo]), realpathSync(ziel));
});

test('Eine Junction aus dem Scratchpad umgeht die Grenze zum Produktordner nicht', () => {
  const repo = testRepository('junction-ausgabe');
  const ziel = join(repo, 'produkt');
  const link = join(repo, 'scratchpad', 'umleitung');
  mkdirSync(ziel);
  symlinkSync(ziel, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => ausgabeVorbereiten(join(link, 'lauf'), [repo]), /scratchpad/);
  assert.equal(existsSync(join(ziel, 'lauf')), false);
});

test('Browserkandidaten enthalten systemweite und benutzerspezifische Windows-Orte', () => {
  const env = { 'ProgramFiles(x86)': 'Programme-x86', ProgramFiles: 'Programme', LOCALAPPDATA: 'Lokale-Daten' };
  for (const [browser, teile] of [['edge', ['Microsoft', 'Edge', 'Application', 'msedge.exe']], ['chrome', ['Google', 'Chrome', 'Application', 'chrome.exe']]]) {
    const kandidaten = browserKandidaten(browser, 'win32', env);
    for (const basisPfad of Object.values(env)) assert.ok(kandidaten.includes(join(basisPfad, ...teile)), browser);
    assert.equal(new Set(kandidaten).size, kandidaten.length);
  }
  assert.equal(browserKandidaten('edge', 'win32', { ProgramFiles: 'Programme', 'ProgramFiles(x86)': 'Programme' }).length, 1);
  assert.deepEqual(browserKandidaten('edge', 'win32', {}), []);
});

test('Linux-Browserorte brauchen keine Windows-Umgebung und kein PATH-Programm', () => {
  assert.ok(browserKandidaten('edge', 'linux', {}).includes('/usr/bin/microsoft-edge-stable'));
  assert.ok(browserKandidaten('chrome', 'linux', {}).includes('/usr/bin/google-chrome'));
  for (const browser of ['edge', 'chrome']) assert.ok(browserKandidaten(browser, 'linux', {}).every(p => p.startsWith('/')));
  assert.deepEqual(browserKandidaten('chrome', 'unbekannt', {}), []);
});

test('Browserstart hält Profil, CDP, Namensauflösung und Proxy auf der vorgegebenen Grenze', () => {
  const profil = join(arbeit, 'Profil mit Leerzeichen');
  const netlog = join(arbeit, 'Netz mit Leerzeichen.json');
  const args = browserArgumente(profil, netlog, 43210);
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes(`--user-data-dir=${profil}`));
  assert.ok(args.includes(`--log-net-log=${netlog}`));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(args.includes('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'));
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:43210'));
  assert.ok(args.includes('--proxy-bypass-list=<-loopback>;127.0.0.1'));
  assert.ok(args.includes('--disable-component-extensions-with-background-pages'));
  for (const unbelegt of ['--remote-debugging-address', '--force-webrtc-ip-handling-policy', '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update', '--password-store', '--disable-background-mode']) {
    assert.ok(!args.some(a => a.split('=')[0] === unbelegt), unbelegt);
  }
  assert.ok(!args.some(a => a.includes('CertificateTransparencyComponentUpdater')));
  assert.ok(args.includes('--disable-quic'));
  assert.ok(args.includes('about:blank'));
});

test('Falscher Kommandozeilenaufruf endet ohne Browserstart mit Code 64', () => {
  const lauf = spawnSync(process.execPath, [join(wurzel, 'scripts', 'browser-lauf.mjs'), '--phase', 'tastatur'], {
    cwd: wurzel, encoding: 'utf8', env: process.env, timeout: 10000,
  });
  assert.equal(lauf.status, 64, `${lauf.stdout}${lauf.stderr}`);
  assert.match(lauf.stderr, /Aufruf: node scripts\/browser-lauf\.mjs/);
});

test('Lokaler Server liefert HTML und Modulskripte mit passenden Inhaltstypen', async t => {
  const dist = join(arbeit, 'server-dateien');
  mkdirSync(join(dist, '_astro'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<main>Probe</main>');
  writeFileSync(join(dist, 'vertrag.html'), '<main>Vertrag</main>');
  writeFileSync(join(dist, '_astro', 'probe.js'), 'globalThis.probe = true;');
  const server = await lokalerServer(dist);
  t.after(() => server.close());
  assert.match(server.basisUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  for (const [pfad, typ, inhalt] of [['/', /^text\/html/, '<main>Probe</main>'], ['/vertrag.html', /^text\/html/, '<main>Vertrag</main>'], ['/_astro/probe.js', /^text\/javascript/, 'globalThis.probe = true;']]) {
    const antwort = await fetch(`${server.basisUrl}${pfad}`);
    assert.equal(antwort.status, 200, pfad);
    assert.match(antwort.headers.get('content-type'), typ);
    assert.equal(await antwort.text(), inhalt);
  }
  const kopf = await fetch(`${server.basisUrl}/`, { method: 'HEAD' });
  assert.equal(kopf.status, 200);
  assert.equal(await kopf.text(), '');
  assert.equal((await fetch(`${server.basisUrl}/fehlt.html`)).status, 404);
  assert.equal((await fetch(`${server.basisUrl}/favicon.ico`)).status, 204);
  assert.equal(server.anfragen.length, 6);
});

test('Lokaler Server verwirft fremde Hostangaben, Schreibmethoden und Pfadumgehungen', async t => {
  const dist = join(arbeit, 'server-grenzen');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), 'lokal');
  writeFileSync(join(arbeit, 'nicht-ausliefern.txt'), 'außerhalb');
  const server = await lokalerServer(dist);
  t.after(() => server.close());
  // fetch setzt Host aus der URL; für diese Gegenprobe nur den Header verändern.
  const fremderHost = await new Promise((ok, nein) => {
    const req = request(`${server.basisUrl}/`, { headers: { Host: 'fremd.invalid' } }, res => {
      res.resume();
      res.once('end', () => ok(res.statusCode));
    });
    req.once('error', nein);
    req.end();
  });
  assert.equal(fremderHost, 403);
  assert.equal((await fetch(`${server.basisUrl}/`, { method: 'POST', body: 'Probe' })).status, 403);
  for (const pfad of ['/%2e%2e%2fnicht-ausliefern.txt', '/%5c..%5cnicht-ausliefern.txt', '/%00probe']) {
    const antwort = await fetch(`${server.basisUrl}${pfad}`);
    assert.equal(antwort.status, 403, pfad);
    assert.notEqual(await antwort.text(), 'außerhalb');
  }
});

test('Auch eine nachträglich angehängte index.html darf nicht über einen Symlink hinausführen', async t => {
  const dist = join(arbeit, 'server-symlink');
  mkdirSync(join(dist, 'unterordner'), { recursive: true });
  const fremd = join(arbeit, 'nicht-ausliefern.html');
  writeFileSync(fremd, 'außerhalb');
  try { symlinkSync(fremd, join(dist, 'unterordner', 'index.html'), 'file'); }
  catch (error) {
    if (error.code === 'EPERM') { t.skip('Dateisymlinks sind für diesen Benutzer nicht erlaubt.'); return; }
    throw error;
  }
  const server = await lokalerServer(dist);
  t.after(() => server.close());
  for (const pfad of ['/unterordner', '/unterordner/']) {
    const antwort = await fetch(`${server.basisUrl}${pfad}`);
    assert.equal(antwort.status, 403, pfad);
    assert.notEqual(await antwort.text(), 'außerhalb');
  }
});

test('Ersatzseite wird erst nach bestätigter Netzüberwachung verbunden; alte Messverbindung bleibt bei jedem Vorfehler erhalten',async()=>{
  const machen=(art='ok')=>{
    const auf=[],protokoll={netzTargets:[{targetId:'neu',messbereit:true}]},neu={send:async()=>({}),close:()=>auf.push('neu lösen')};
    const o={protokoll,cdp:{close:()=>auf.push('alt lösen'),send:async(m,p)=>{
      if(m==='Page.navigate'){auf.push('alt entladen');assert.equal(p.url,'about:blank');return art==='entladen'?{errorText:'Navigation fehlt'}:{};}
      return {result:{value:art==='altes-dokument'?'alte Seite':'about:blank'}};
    }},browserCdp:{send:async(m,p)=>{auf.push(m);assert.equal(p.url,'about:blank');return {targetId:art==='kennung'?'../fremd':'neu'};}},
      warten:async fn=>{auf.push('warten');assert.equal(await fn(),true);},netzMonitor:{seiteAnmelden:async id=>{auf.push('sperren');if(art==='sperre')throw new Error('Sperre fehlt');return {targetId:id,bestaetigt:art!=='bestaetigung'};}},
      verbinden:async id=>{assert.equal(id,'neu');auf.push('verbinden');if(art==='verbindung')throw new Error('Verbindung fehlt');return neu;}};
    return {o,auf,neu};
  };
  const {o,auf,neu}=machen();assert.equal(await verbindeFrischeSeite(o),neu);
  assert.deepEqual(auf,['Target.createTarget','warten','sperren','verbinden','alt entladen','warten','alt lösen']);assert.equal(o.protokoll.frischeSeiten[0].targetId,'neu');
  for(const art of ['kennung','sperre','bestaetigung','verbindung','entladen','altes-dokument']) {
    const n=machen(art);await assert.rejects(()=>verbindeFrischeSeite(n.o));assert.ok(!n.auf.includes('alt lösen'));assert.equal(n.o.protokoll.frischeSeiten,undefined);
    assert.equal(n.auf.includes('neu lösen'),['entladen','altes-dokument'].includes(art));
  }
});
