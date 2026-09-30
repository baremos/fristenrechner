// Gerätelauf mit eigenen Dateien und ersetzten Android-Prozessen. Ein Gerät ist nicht nötig.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KONTROLLSOCKET, PROBEN, argumente, evaluiereDevtoolsVerbindung, evaluiereSocketProben, geraetZustand, holeDevtoolsVersion, lauf, main, probeGueltig, prozessStart, unguenstigster } from './geraet-lauf.mjs';
import { APP, innen } from './emulator/rahmen.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(repo, 'scratchpad', 'paket-2.5-geraet', 'tmp');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'geraet-lauf-test-'));
test.after(() => {
  assert.ok(innen(realpathSync(basis), realpathSync(arbeit)));
  assert.ok(relative(basis, arbeit).startsWith('geraet-lauf-test-'));
  rmSync(arbeit, { recursive: true, force: true });
});

const SERIE = 'R58TEST0123';
const nurWindows = { skip: process.platform !== 'win32' };

test('Argumente: Pflichtangaben, Emulator, unerwartete Zeichen und eigene APK-Pfade', () => {
  const ziel = join(arbeit, 'argumente');
  const o = argumente(['--seriennummer', SERIE, '--ausgabe', ziel], repo);
  assert.equal(o.seriennummer, SERIE);
  assert.equal(o.appBehalten, false);
  assert.ok(o.debug.endsWith('app-debug.apk') && o.release.endsWith('app-release-unsigned.apk'));
  assert.equal(argumente(['--seriennummer', '192.168.0.5:5555', '--ausgabe', ziel, '--app-behalten'], repo).appBehalten, true);
  const eigene = argumente(['--seriennummer', SERIE, '--ausgabe', ziel, '--apk-debug', join(arbeit, 'a.apk'), '--apk-release', join(arbeit, 'b.apk')], repo);
  assert.deepEqual([eigene.debug, eigene.release], [join(arbeit, 'a.apk'), join(arbeit, 'b.apk')]);
  assert.throws(() => argumente(['--ausgabe', ziel], repo), /Pflichtargument fehlt: --seriennummer/);
  assert.throws(() => argumente(['--seriennummer', SERIE], repo), /Pflichtargument fehlt: --ausgabe/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe'], repo), /Wert fehlt: --ausgabe/);
  assert.throws(() => argumente(['--seriennummer', '--ausgabe', ziel], repo), /Wert fehlt: --seriennummer/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe', ziel, '--apk-debug'], repo), /Wert fehlt: --apk-debug/);
  assert.throws(() => argumente(['--seriennummer', 'emulator-5554', '--ausgabe', ziel], repo), /emulator-lauf\.mjs/);
  assert.throws(() => argumente(['--seriennummer', 'a b', '--ausgabe', ziel], repo), /unerwartete Zeichen/);
  assert.throws(() => argumente(['--seriennummer', '-s', '--ausgabe', ziel], repo), /unerwartete Zeichen/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe', ziel, '--wipe-data'], repo), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--seriennummer', SERIE, '--ausgabe', ziel], repo), /doppelt/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe', join(repo, 'docs', 'geraet')], repo), /nur unter scratchpad/);
});

test('main meldet Argumentfehler mit Rückgabewert 64', async () => {
  const alt = console.error; const zeilen = [];
  console.error = z => zeilen.push(z);
  try { assert.equal(await main(['--seriennummer', SERIE]), 64); }
  finally { console.error = alt; }
  assert.match(zeilen.join('\n'), /Argumentfehler: Pflichtargument fehlt: --ausgabe[\s\S]*Aufruf: node scripts\/geraet-lauf\.mjs/);
});

test('adb devices: Zustand nur bei genau einer Zeile für die Seriennummer', () => {
  const geraete = `List of devices attached\r\n${SERIE}\tdevice\r\nemulator-5554\toffline\r\n\r\n`;
  assert.equal(geraetZustand(geraete, SERIE), 'device');
  assert.equal(geraetZustand(geraete, 'emulator-5554'), 'offline');
  assert.equal(geraetZustand(geraete, 'R58'), null);
  assert.equal(geraetZustand(`${SERIE}\tunauthorized\n`, SERIE), 'unauthorized');
  assert.equal(geraetZustand(`${SERIE}\tdevice\n${SERIE}\tdevice\n`, SERIE), null);
});

test('Mehrere Proben: das ungünstigste Ergebnis gilt', () => {
  const b = status => ({ status, grund: status });
  assert.equal(unguenstigster([b('bestanden'), b('dokumentierte Grenze')]).status, 'dokumentierte Grenze');
  assert.equal(unguenstigster([b('bestanden'), b('ungültig'), b('dokumentierte Grenze')]).status, 'ungültig');
  assert.equal(unguenstigster([b('ungültig'), b('nicht bestanden'), b('bestanden')]).status, 'nicht bestanden');
  assert.equal(unguenstigster([b('bestanden'), b('bestanden')]).status, 'bestanden');
  assert.equal(unguenstigster([]).status, 'ungültig');
});

// Zeile aus /proc/<pid>/stat, wie am Abbild fr-api36 beobachtet (gekürzt): Feld 22 ist die Startzeit.
const stat = (pid, start, name = 'emos.fristenrechner') => `${pid} (${name}) S 300 300 0 0 -1 1077952832 9000 0 12 0 40 20 0 0 10 -10 45 0 ${start} 15000000000 30000 18446744073709551615 1 1 0 0 0 0 4612 1 1073775864 0 0 0 17 3 0 0 0 0 0`;

test('Startzeit aus /proc/<pid>/stat: Feld 22, auch bei Klammern und Leerzeichen im Namen', () => {
  assert.equal(prozessStart(stat('4321', '987654'), '4321'), '987654');
  assert.equal(prozessStart(stat('4321', '987654', 'a b) (c'), '4321'), '987654');
  assert.equal(prozessStart(stat('4321', '987654'), '4322'), null);
  assert.equal(prozessStart('4321 (kurz) S 1 2', '4321'), null);
  assert.equal(prozessStart('', '4321'), null);
  assert.equal(prozessStart(stat('4321', 'x'), '4321'), null);
  assert.equal(prozessStart(undefined, '4321'), null);
  assert.equal(prozessStart(stat('4321', '1'), ''), null);
});

// Wie am Abbild fr-api36 beobachtet: Der Abruf an einem Socket, den es nicht gibt, endet mit UND_ERR_SOCKET.
const KEIN_SOCKET = { art: 'fehler', name: 'TypeError', code: 'UND_ERR_SOCKET', meldung: 'fetch failed', ms: 90, weiterleitungBelegt: true };
const ANTWORT = { art: 'antwort', status: 200, browser: 'Chrome/140.0.7339.51', paket: APP, ms: 170, weiterleitungBelegt: true };
const ZEIT = { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000, weiterleitungBelegt: true };
const K = '4321@987654';
const guteProbe = (mehr = {}) => ({ pidVor: '4321', pidNach: '4321', kennungVor: K, kennungNach: K, vordergrundVor: true, vordergrundNach: true, abruf: KEIN_SOCKET, kontrolle: KEIN_SOCKET, ...mehr });
const drei = (...abweichend) => [0, 1, 2].map(i => abweichend[i] ?? guteProbe());

test('Probe am Release-Build: derselbe Prozess wie beim Startbeleg, davor und danach, App im Vordergrund', () => {
  assert.equal(probeGueltig(guteProbe(), K), null);
  assert.match(probeGueltig(guteProbe({ kennungNach: '' }), K), /läuft während der Probe nicht/);
  assert.match(probeGueltig(guteProbe({ kennungVor: '' }), K), /läuft während der Probe nicht/);
  assert.match(probeGueltig(guteProbe({ kennungVor: '4321@', kennungNach: '4321@' }), K), /Startzeit ist nicht lesbar/);
  assert.match(probeGueltig(guteProbe({ kennungNach: '5000@987654' }), K), /gewechselt/);
  // Gleiche Nummer, andere Startzeit: ein neu gestarteter Prozess.
  assert.match(probeGueltig(guteProbe({ kennungNach: '4321@999999' }), K), /gewechselt/);
  assert.match(probeGueltig(guteProbe({ kennungVor: '5000@1', kennungNach: '5000@1' }), K), /anderen Prozess als der Beleg von Start und Formular/);
  assert.match(probeGueltig(guteProbe(), ''), /anderen Prozess als der Beleg/);
  assert.match(probeGueltig(guteProbe({ vordergrundNach: false }), K), /nicht im Vordergrund/);
  assert.match(probeGueltig(guteProbe({ vordergrundVor: undefined }), K), /nicht im Vordergrund/);
  assert.match(probeGueltig({ fehler: 'ADB-Weiterleitung nicht bestätigt.' }, K), /Die Messung brach ab: ADB-Weiterleitung/);
  assert.match(probeGueltig(null, K), /fehlt/);
});

test('Devtools-Verbindung: Antwort geht vor, sonst zählen Gegenprobe, Start, Prozess und Kontrollsocket', () => {
  const s = (mehr = {}) => evaluiereDevtoolsVerbindung({ gegenprobeErreichbar: true, debugKontrolle: KEIN_SOCKET, startBelegt: true, kennung: K, proben: drei(), buildType: 'user', ...mehr }).status;
  assert.equal(s(), 'bestanden');
  assert.equal(PROBEN, 3);
  assert.equal(s({ proben: drei(undefined, guteProbe({ abruf: ANTWORT })) }), 'nicht bestanden');
  // Eine belegte Antwort wird durch spätere unbrauchbare oder fehlende Proben nicht abgeschwächt.
  assert.equal(s({ proben: [guteProbe({ abruf: ANTWORT }), guteProbe({ kennungNach: '' })] }), 'nicht bestanden');
  assert.equal(s({ proben: [guteProbe({ abruf: ANTWORT }), { fehler: 'ADB-Weiterleitung nicht bestätigt.' }] }), 'nicht bestanden');
  assert.equal(s({ proben: [guteProbe({ abruf: ANTWORT })], gegenprobeErreichbar: false, startBelegt: false, debugKontrolle: null }), 'nicht bestanden');
  assert.equal(s({ gegenprobeErreichbar: false }), 'ungültig');
  assert.equal(s({ startBelegt: false }), 'ungültig');
  assert.equal(s({ proben: [] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe(), guteProbe()] }), 'ungültig');
  assert.equal(s({ proben: drei(undefined, guteProbe({ kennungNach: '' })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ kennungNach: '4321@999999' })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ vordergrundVor: false })) }), 'ungültig');
  assert.equal(s({ proben: drei(undefined, undefined, { fehler: 'abgebrochen' }) }), 'ungültig');
  // Drei in sich stabile, aber verschiedene Prozesse: Der Startbeleg gilt nur für den ersten.
  assert.equal(s({ proben: drei(undefined, guteProbe({ kennungVor: '6000@2', kennungNach: '6000@2' }), guteProbe({ kennungVor: '7000@3', kennungNach: '7000@3' })) }), 'ungültig');
  assert.equal(s({ kennung: '' }), 'ungültig');
  // Etwas antwortet, aber nicht als Devtools; oder der Abruf scheitert anders als am Kontrollsocket.
  assert.equal(s({ proben: drei(guteProbe({ abruf: { art: 'unerwartet', status: 200, grund: 'kein JSON', ms: 5, weiterleitungBelegt: true } })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ abruf: { ...KEIN_SOCKET, code: 'ECONNRESET' } })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ abruf: ZEIT })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ abruf: null })) }), 'ungültig');
  // Gleiche Fehler auf beiden Seiten genügen nicht: Niemand hört am Port des Rechners, oder die Zeit läuft ab.
  const verweigert = { ...KEIN_SOCKET, code: 'ECONNREFUSED' };
  assert.equal(s({ proben: drei(guteProbe({ abruf: verweigert, kontrolle: verweigert })) }), 'ungültig');
  assert.equal(s({ proben: [0, 1, 2].map(() => guteProbe({ abruf: verweigert, kontrolle: verweigert })), debugKontrolle: verweigert }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ abruf: ZEIT, kontrolle: ZEIT })) }), 'ungültig');
  // Ohne belegte Weiterleitung sagt ein gescheiterter Abruf nichts über das Gerät.
  const unbelegt = { ...KEIN_SOCKET, weiterleitungBelegt: false };
  assert.equal(s({ proben: drei(guteProbe({ abruf: unbelegt })) }), 'ungültig');
  assert.equal(s({ proben: drei(guteProbe({ kontrolle: unbelegt })) }), 'ungültig');
  // Der Kontrollabruf muss so enden wie in der Debugphase, in der der Weg nachweislich funktionierte.
  assert.equal(s({ proben: drei(guteProbe({ kontrolle: ANTWORT })) }), 'ungültig');
  assert.equal(s({ debugKontrolle: { ...KEIN_SOCKET, code: 'ECONNRESET' } }), 'ungültig');
  assert.equal(s({ debugKontrolle: ZEIT }), 'ungültig');
  assert.equal(s({ debugKontrolle: undefined }), 'ungültig');
  assert.equal(s({ buildType: 'userdebug' }), 'dokumentierte Grenze');
  assert.equal(s({ buildType: 'eng', proben: drei(guteProbe({ abruf: ANTWORT })) }), 'dokumentierte Grenze');
  assert.equal(s({ buildType: undefined }), 'ungültig');
  assert.equal(evaluiereDevtoolsVerbindung(null).status, 'ungültig');
});

const KOPF = 'Num       RefCount Protocol Flags    Type St Inode Path';
const zeile = pfad => `0000000000000000: 00000002 00000000 00010000 0001 01 12345 ${pfad}`;
const liste = (...mehr) => [KOPF, zeile('/dev/socket/logdw'), zeile('@jdwp-control'), ...mehr].join('\n') + '\n';

test('Socketliste: Fund geht vor, sonst zählen Gegenprobe, Lesbarkeit, Start und Prozess', () => {
  const gut = () => guteProbe({ text: liste() });
  const s = (mehr = {}) => evaluiereSocketProben({ debugSocketNachgewiesen: true, startBelegt: true, kennung: K, proben: [gut(), gut(), gut()], buildType: 'user', ...mehr }).status;
  const eigener = guteProbe({ text: liste(zeile('@webview_devtools_remote_4321')) });
  assert.equal(s(), 'bestanden');
  assert.equal(s({ proben: [gut(), { ...eigener, kennungNach: '' }], startBelegt: false }), 'nicht bestanden');
  // Der Socket des eigenen Prozesses zählt auch ohne wirksame Gegenprobe.
  assert.equal(s({ proben: [eigener], debugSocketNachgewiesen: false }), 'nicht bestanden');
  // Ein Devtools-Socket eines anderen Prozesses zählt nur mit wirksamer Gegenprobe als Fund.
  const fremder = guteProbe({ text: liste(zeile('@webview_devtools_remote_9999')) });
  assert.equal(s({ proben: [gut(), fremder, gut()] }), 'nicht bestanden');
  assert.equal(s({ proben: [gut(), fremder, gut()], debugSocketNachgewiesen: false }), 'ungültig');
  assert.equal(s({ debugSocketNachgewiesen: false }), 'ungültig');
  assert.equal(s({ proben: [gut(), guteProbe({ text: null }), gut()] }), 'ungültig');
  assert.equal(s({ startBelegt: false }), 'ungültig');
  assert.equal(s({ proben: [gut(), gut()] }), 'ungültig');
  assert.equal(s({ proben: [gut(), guteProbe({ text: liste(), kennungNach: '' }), gut()] }), 'ungültig');
  assert.equal(s({ proben: [gut(), gut(), guteProbe({ text: liste(), kennungVor: '6000@2', kennungNach: '6000@2' })] }), 'ungültig');
  assert.equal(s({ proben: [gut(), gut(), guteProbe({ text: liste(), vordergrundNach: false })] }), 'ungültig');
  assert.equal(s({ proben: [gut(), gut(), { fehler: 'abgebrochen' }] }), 'ungültig');
  assert.equal(s({ proben: [] }), 'ungültig');
  assert.equal(s({ buildType: 'userdebug' }), 'dokumentierte Grenze');
  assert.equal(s({ buildType: '' }), 'ungültig');
});

async function mitServer(server, fn) {
  // Offene Verbindungen selbst beenden: Ein Server, der nie antwortet, schlösse sonst nicht.
  const verbindungen = new Set();
  server.on('connection', socket => { verbindungen.add(socket); socket.on('close', () => verbindungen.delete(socket)); });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  try { return await fn(server.address().port); }
  finally { for (const socket of verbindungen) socket.destroy(); await new Promise(r => server.close(r)); }
}

test('Abruf der Versionsauskunft: Antwort, unerwartete Antwort, Abbruch der Gegenseite, Zeitüberschreitung', async () => {
  const http = antwort => httpServer((req, res) => { assert.equal(req.url, '/json/version'); antwort(res); });
  const gut = await mitServer(http(res => res.end(JSON.stringify({ Browser: 'Chrome/133.0.6943.137', 'Android-Package': APP }))), holeDevtoolsVersion);
  assert.deepEqual({ ...gut, ms: 0 }, { art: 'antwort', status: 200, browser: 'Chrome/133.0.6943.137', paket: APP, ms: 0 });
  const ohnePaket = await mitServer(http(res => res.end('{"Browser":"Chrome/83"}')), holeDevtoolsVersion);
  assert.equal(ohnePaket.art, 'antwort'); assert.equal(ohnePaket.paket, null);
  for (const antwort of [res => res.end('{"Protocol-Version":"1.3"}'), res => res.end('kein JSON'), res => res.end('null'), res => { res.statusCode = 500; res.end('{"Browser":"Chrome/83"}'); }]) {
    const r = await mitServer(http(antwort), holeDevtoolsVersion);
    assert.equal(r.art, 'unerwartet');
    assert.equal(typeof r.status, 'number');
  }
  // Der Antwortkopf ist schon da, dann bricht der Körper ab: Etwas hat geantwortet, aber keine Auskunft geliefert.
  const halb = await mitServer(http(res => { res.writeHead(200, { 'content-length': '100' }); res.write('{"Bro'); setTimeout(() => res.socket.destroy(), 100); }), holeDevtoolsVersion);
  assert.deepEqual([halb.art, halb.status], ['unerwartet', 200]);
  assert.match(halb.grund, /Antwort nicht lesbar/);
  // Die Gegenseite nimmt an und schließt sofort: so verhält sich die Weiterleitung ohne Socket.
  const zu = await mitServer(tcpServer(socket => socket.destroy()), holeDevtoolsVersion);
  assert.equal(zu.art, 'fehler'); assert.equal(zu.name, 'TypeError'); assert.ok(['UND_ERR_SOCKET', 'ECONNRESET'].includes(zu.code), zu.code);
  const haengt = await mitServer(tcpServer(() => {}), port => holeDevtoolsVersion(port, 200));
  assert.deepEqual([haengt.art, haengt.name], ['fehler', 'TimeoutError']);
  let frei;
  await mitServer(tcpServer(() => {}), async port => { frei = port; });
  const niemand = await holeDevtoolsVersion(frei, 1000);
  assert.deepEqual([niemand.art, niemand.name, niemand.code], ['fehler', 'TypeError', 'ECONNREFUSED']);
});

const paket = flags => `Packages:\n  Package [${APP}] (1a2b3c):\n    versionCode=100 minSdk=30 targetSdk=36\n    flags=[ ${flags} ]\n`;
const formular = paket => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Fristenrechner Vergabe" package="${paket}" bounds="[0,0][100,50]" /><node text="Vergabeordnung" package="${paket}" bounds="[0,60][100,100]" /></hierarchy>`;
const baum = formular(APP);
const REMOTE = '/data/local/tmp/fristenrechner-emulator.xml';
const PFAD = `/data/app/~~Zufall==/${APP}-Zufall==/base.apk`;
const VERWEIGERT = { art: 'fehler', name: 'TypeError', code: 'ECONNREFUSED', meldung: 'fetch failed', ms: 3 };

// Stellt adb, aapt2, apksigner und den Abruf nach. Aufrufe von adb und aapt2 werden mit ihrer vollständigen
// Argumentliste geprüft, die von apksigner mit den Argumenten, auf die es ankommt.
function geraeteProbe(wahl = {}) {
  const { buildType = 'user', unixLesbar = true, debugSocket = true, releaseSocket = false, releaseDevtools = releaseSocket, releaseAbruf = KEIN_SOCKET,
    releaseKontrolle = KEIN_SOCKET, schonInstalliert = false, root = false, zustand = 'device', api = '35', qemu = '', appBehalten = false, fremdesPaket = null,
    installFehler = null, installHalb = null, installHalbVerzoegert = 0, installVorhanden = false, fremdNachDebug = false, fremdNachUninstall = false, uninstallOhneErgebnis = false, signalBeiInstallation = false, installVerzoegert = 0, fremdNachSignal = 0, signalNachAbruf = false, pullAbweichung = false,
    forwardFehlerAb = Infinity, listeOhneWeiterleitung = false, deinstallationFehler = false,
    debugFlags = 'DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA', releaseFlags = 'HAS_CODE ALLOW_CLEAR_USER_DATA',
    releasePids = [], starts = {}, statFehler = false, fremdeActivityAb = Infinity, ansicht = baum, debugDevtools = true,
    signalBeimBaum = false, startFehler = false } = wahl;
  const ort = mkdtempSync(join(arbeit, 'geraet-'));
  const local = join(ort, 'local'), sdk = join(local, 'fristenrechner/android-sdk');
  const adb = join(sdk, 'platform-tools/adb.exe'), aapt2 = join(sdk, 'build-tools/35.0.0/aapt2.exe'), apksigner = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar');
  mkdirSync(dirname(adb), { recursive: true }); writeFileSync(adb, 'Wird niemals ausgeführt.');
  const debug = join(ort, 'debug.apk'), release = join(ort, 'release.apk'), debugKey = join(ort, 'debug.keystore');
  writeFileSync(debug, 'Debug-Testdatei'); writeFileSync(release, 'Release-Testdatei'); writeFileSync(debugKey, 'kein Schlüssel');
  const optionen = { seriennummer: SERIE, ausgabe: join(ort, 'ausgabe'), appBehalten, debug, release };
  const signiert = join(optionen.ausgabe, 'release-debug-signiert.apk');
  const java = 'java-nachgestellt.exe';
  const app = { apk: null, debug: false, laeuft: false };
  const calls = [], weiterleitungen = new Map();
  let port = 40000, releasePidAufruf = 0, activityAufruf = 0, forwardAufruf = 0, fremdGesetzt = false, listAufrufe = 0, ausstehend = null;
  const ok = out => ({ code: 0, out, err: '' });
  const art = apk => (apk === debug ? 'debug' : apk === signiert ? 'release' : null);
  const run = async (exe, argv, opts = {}) => {
    calls.push({ exe, args: argv });
    if (exe === java) {
      assert.deepEqual(argv.slice(0, 2), ['-jar', apksigner]);
      if (argv[2] === 'sign') {
        const wert = name => argv[argv.indexOf(name) + 1];
        assert.deepEqual([wert('--ks'), wert('--ks-key-alias'), wert('--v2-signing-enabled'), wert('--v3-signing-enabled'), wert('--alignment-preserved'), wert('--out'), argv.at(-1)], [debugKey, 'androiddebugkey', 'true', 'true', 'true', signiert, release]);
        assert.match(wert('--ks-pass'), /^file:/); assert.match(wert('--key-pass'), /^file:/);
        writeFileSync(signiert, `${readFileSync(release, 'utf8')} signiert`); return ok('');
      }
      assert.deepEqual(argv.slice(2), ['verify', '--verbose', '--print-certs', '--min-sdk-version', '24', signiert]);
      return ok('Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\n');
    }
    if (exe === aapt2) {
      assert.deepEqual(argv.slice(0, 2), ['dump', 'packagename']); assert.equal(argv.length, 3); assert.ok(art(argv[2]), `aapt2 mit unerwarteter Datei: ${argv[2]}`);
      // Zwischen der Deinstallation des Debug-Builds und der Release-Installation kommt das Paket von außen.
      if (fremdNachDebug && art(argv[2]) === 'release' && !fremdGesetzt) { fremdGesetzt = true; Object.assign(app, { apk: 'fremd', debug: false, laeuft: false }); }
      return ok(`${fremdesPaket === art(argv[2]) ? 'com.example.fremd' : APP}\r\n`);
    }
    assert.equal(exe, adb);
    if (argv[0] === 'devices') { assert.equal(argv.length, 1); return ok(`List of devices attached\n${SERIE}\t${zustand}\n\n`); }
    assert.deepEqual(argv.slice(0, 2), ['-s', SERIE]);
    const a = argv.slice(2), text = a.join(' ');
    if (a[0] === 'install') {
      assert.equal(a.length, 2); assert.ok(art(a[1]), 'Installation einer unerwarteten Datei');
      if (installVorhanden && art(a[1]) === 'release') { Object.assign(app, { apk: 'fremd', debug: false, laeuft: false }); return { code: 1, out: `Failure [INSTALL_FAILED_ALREADY_EXISTS: Attempt to re-install ${APP} without first uninstalling.]\n`, err: '' }; }
      assert.equal(app.apk, null, 'Installation über ein vorhandenes Paket');
      if (installFehler === art(a[1])) return { code: 1, out: 'Failure [INSTALL_FAILED_VERIFICATION_FAILURE]\n', err: '' };
      if (signalBeiInstallation) {
        // Der Aufruf wird abgebrochen; auf dem Gerät kann die Installation noch laufen und später fertig werden.
        if (fremdNachSignal > 0) ausstehend = { apk: 'fremd', nach: listAufrufe + fremdNachSignal };
        else if (installVerzoegert === Infinity) { /* erscheint nie */ } else if (installVerzoegert > 0) ausstehend = { apk: a[1], nach: listAufrufe + installVerzoegert }; else Object.assign(app, { apk: a[1], debug: a[1] === debug, laeuft: false });
        process.emit('SIGINT'); return { code: null, out: '', err: 'Prozesslauf unterbrochen' };
      }
      if (installHalb === art(a[1])) {
        // Die Rückmeldung reißt ab; die Installation auf dem Gerät läuft trotzdem, sofort oder verzögert.
        if (installHalbVerzoegert > 0) ausstehend = { apk: a[1], nach: listAufrufe + installHalbVerzoegert }; else Object.assign(app, { apk: a[1], debug: a[1] === debug, laeuft: false });
        return { code: 1, out: '', err: 'adb: Verbindung während der Rückmeldung verloren' };
      }
      Object.assign(app, { apk: a[1], debug: a[1] === debug, laeuft: false });
      return ok('Performing Streamed Install\nSuccess\n');
    }
    if (text === `uninstall ${APP}`) {
      if (deinstallationFehler) return { code: 1, out: 'Failure [DELETE_FAILED_INTERNAL_ERROR]\n', err: '' };
      // Unmittelbar nach der Deinstallation kann dasselbe Paket von außen installiert werden.
      Object.assign(app, fremdNachUninstall ? { apk: 'fremd', debug: false, laeuft: false } : { apk: null, laeuft: false });
      // Die Bestätigung geht verloren, obwohl das Gerät deinstalliert hat.
      if (uninstallOhneErgebnis) return { code: null, out: '', err: 'Prozesslauf unterbrochen' };
      return ok('Success\n');
    }
    if (a[0] === 'pull') {
      assert.equal(a.length, 3); assert.equal(a[1], PFAD); assert.ok(app.apk, 'pull ohne installiertes Paket');
      if (pullAbweichung || app.apk === 'fremd') writeFileSync(a[2], 'anderer Inhalt'); else copyFileSync(app.apk, a[2]);
      return ok('1 file pulled');
    }
    if (text === 'exec-out screencap -p') { assert.equal(opts.binary, true); return { code: 0, out: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), err: '' }; }
    if (a[0] === 'logcat') { assert.match(text, /^logcat -d -v time --pid=\d+$/); return ok('Protokoll der App'); }
    if (a[0] === 'forward') {
      if (text === 'forward --list') return ok(listeOhneWeiterleitung ? '' : [...weiterleitungen].map(([p, s]) => `${SERIE} tcp:${p} localabstract:${s}`).join('\n') + '\n');
      if (a[1] === '--remove') { assert.equal(a.length, 3); const p = a[2].replace(/^tcp:/, ''); assert.ok(weiterleitungen.has(p), 'Unbekannte Weiterleitung entfernt'); weiterleitungen.delete(p); return ok(''); }
      assert.equal(a.length, 3); assert.equal(a[1], 'tcp:0');
      assert.match(a[2], new RegExp(`^localabstract:(?:webview_devtools_remote_\\d+|${KONTROLLSOCKET})$`));
      if (++forwardAufruf >= forwardFehlerAb) return { code: 1, out: '', err: 'adb: error: cannot bind listener' };
      weiterleitungen.set(String(++port), a[2].replace(/^localabstract:/, '')); return ok(`${port}\n`);
    }
    assert.deepEqual([a[0], a.length], ['shell', 2], `Unerwarteter ADB-Aufruf: ${text}`);
    const c = a[1];
    const eigenschaften = { 'ro.build.fingerprint': `samsung/a17xx/a17:15/AP3A.240905.015/A176BXXU1AYH1:${buildType}/release-keys`, 'ro.build.type': buildType, 'ro.build.version.sdk': api, 'ro.build.version.release': '15', 'ro.product.manufacturer': 'samsung', 'ro.product.model': 'SM-A176B', 'ro.build.version.oneui': '70000', 'ro.kernel.qemu': '', 'ro.boot.qemu': qemu };
    if (c.startsWith('getprop ')) { assert.ok(Object.hasOwn(eigenschaften, c.slice(8)), c); return ok(`${eigenschaften[c.slice(8)]}\n`); }
    if (c === 'dumpsys webviewupdate') return ok('Current WebView package (name, version): (com.google.android.webview, 140.0.7339.51)\n');
    if (c === 'id') return ok(root ? 'uid=0(root) gid=0(root)' : 'uid=2000(shell) gid=2000(shell)');
    if (c === `pm list packages ${APP}`) {
      if (ausstehend && ++listAufrufe >= ausstehend.nach) { Object.assign(app, { apk: ausstehend.apk, debug: ausstehend.apk === debug, laeuft: false }); ausstehend = null; } else if (!ausstehend) listAufrufe++;
      return ok(app.apk || schonInstalliert ? `package:${APP}\n` : '');
    }
    if (c === `pm path ${APP}`) return ok(`package:${PFAD}\n`);
    if (c === `am start -W -n ${APP}/de.baremos.fristenrechner.MainActivity`) { assert.ok(app.apk); if (startFehler) return ok('Starting: Intent\nError: Activity class does not exist.\n'); app.laeuft = true; return ok('Starting: Intent\nStatus: ok\nLaunchState: COLD\n'); }
    if (c === `pidof ${APP}`) {
      if (!app.laeuft) return { code: 1, out: '', err: '' };
      const pid = app.debug ? '4321' : releasePids[releasePidAufruf++] ?? '4321';
      return pid === '' ? { code: 1, out: '', err: '' } : ok(`${pid}\n`);
    }
    const lies = /^cat \/proc\/(\d+)\/stat$/.exec(c);
    if (lies) {
      if (statFehler) return { code: 1, out: '', err: `cat: /proc/${lies[1]}/stat: Permission denied` };
      const start = starts[lies[1]];
      // Eine Liste gibt die Startzeit je Aufruf vor; der letzte Wert gilt für alle weiteren Aufrufe.
      return ok(`${stat(lies[1], Array.isArray(start) ? (start.length > 1 ? start.shift() : start[0]) : start ?? '987654')}\n`);
    }
    if (c === 'cat /proc/net/unix') {
      if (!unixLesbar) return { code: 1, out: '', err: 'cat: /proc/net/unix: Permission denied' };
      return ok(liste(...(app.laeuft && ((app.debug && debugSocket) || (!app.debug && releaseSocket)) ? [zeile('@webview_devtools_remote_4321')] : [])));
    }
    if (c === `dumpsys package ${APP}`) return ok(paket(app.debug ? debugFlags : releaseFlags));
    if (c === 'dumpsys activity activities') {
      const fremd = !app.debug && ++activityAufruf >= fremdeActivityAb;
      return ok(`  topResumedActivity=ActivityRecord{1a2b3c u0 ${fremd ? 'com.sec.android.app.launcher/.Launcher' : `${APP}/.MainActivity`} t12}\n`);
    }
    if (c === `rm -f ${REMOTE}`) return ok('');
    if (c === `uiautomator dump ${REMOTE}`) { if (signalBeimBaum) process.emit('SIGINT'); return ok(`UI hierchary dumped to: ${REMOTE}\n`); }
    // Eine Liste gibt den Ansichtsbaum je Abzug vor; der letzte Wert gilt für alle weiteren Abzüge.
    if (c === `cat ${REMOTE}`) return ok(Array.isArray(ansicht) ? (ansicht.length > 1 ? ansicht.shift() : ansicht[0]) : ansicht);
    throw new Error(`Unbekannter nachgestellter Shell-Befehl: ${c}`);
  };
  // Antwortet wie die Devtools, wenn die WebView der laufenden App das Debugging zulässt; sonst wie ohne Socket.
  let releaseAbrufNr = 0;
  const holen = async p => {
    assert.ok(weiterleitungen.has(p), 'Abruf ohne Weiterleitung');
    const socket = weiterleitungen.get(p);
    if (socket === KONTROLLSOCKET) return app.debug ? KEIN_SOCKET : releaseKontrolle;
    if (app.laeuft && app.debug) return debugDevtools ? ANTWORT : KEIN_SOCKET;
    const nr = ++releaseAbrufNr;
    const offen = Array.isArray(releaseDevtools) ? releaseDevtools.includes(nr) : releaseDevtools;
    // Unterbrechung genau nach der ersten erhaltenen Antwort am Release-Build.
    if (app.laeuft && offen && signalNachAbruf && nr === 1) process.emit('SIGINT');
    return app.laeuft && offen ? ANTWORT : releaseAbruf;
  };
  // Virtuelle Uhr: Das nachgestellte Warten lässt die Zeit vergehen, ohne zu warten.
  const uhr = { ms: 1_700_000_000_000 };
  return { local, optionen, run, java, debugKey, holen, calls, app, weiterleitungen, signiert, uhr, sleep: async ms => { uhr.ms += ms; }, jetzt: () => uhr.ms };
}

async function nachgestellterLauf(p) {
  const alt = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = p.local;
  try { return await lauf(p.optionen, { run: p.run, sleep: p.sleep, java: p.java, debugKey: p.debugKey, holen: p.holen, jetzt: p.jetzt }); }
  finally { if (alt === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = alt; }
}
const ergebnis = p => JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
const status = (p, id) => ergebnis(p).befund.find(b => b.id === id)?.status;
const grund = (p, id) => ergebnis(p).befund.find(b => b.id === id)?.grund;
const adbAufrufe = (p, befehl) => p.calls.filter(c => c.args[2] === befehl);
const aufgeraeumt = p => ergebnis(p).aufraeumen.map(r => [r.name, r.status]);
const ALLES_AUFGERAEUMT = [['App deinstallieren', 'bestanden'], ['Ansichtsdatei entfernen', 'bestanden'], ['ADB-Weiterleitungen entfernen', 'bestanden']];

test('Gerät mit Build-Typ user: alle Befunde bestanden, App danach entfernt', nurWindows, async () => {
  const p = geraeteProbe();
  assert.equal(await nachgestellterLauf(p), 0);
  const e = ergebnis(p);
  assert.equal(e.ergebnis, 'bestanden');
  assert.deepEqual(e.befund.map(b => [b.id, b.status]), [['G-Gerät', 'bestanden'], ['G-Devtools-Gegenprobe', 'bestanden'], ['G-Socket-Gegenprobe', 'bestanden'], ['G-Flags-Gegenprobe', 'bestanden'], ['G-Activity', 'bestanden'], ['G-Start', 'bestanden'], ['G-Flags', 'bestanden'], ['G-Socket', 'bestanden'], ['G-Devtools', 'bestanden']]);
  assert.match(e.befund[0].grund, /samsung SM-A176B, Android 15 \(API 35\), Build-Typ user, WebView 140\.0\.7339\.51/);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
  assert.equal(p.app.apk, null);
  assert.equal(p.weiterleitungen.size, 0);
  assert.equal(e.appInstalliert, false);
  // Installiert wurden genau der Debug-Build und die signierte Kopie des Release-Builds, ohne Ersetzen.
  assert.deepEqual(adbAufrufe(p, 'install').map(c => c.args.slice(2)), [['install', p.optionen.debug], ['install', p.signiert]]);
  assert.deepEqual(e.installationen.map(i => [i.name, i.eingang === i.installiert]), [['debug', true], ['release', true]]);
  const beleg = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'g-proben.json'), 'utf8'));
  assert.deepEqual([beleg.kennung, beleg.startBelegt, beleg.proben.length], [K, true, 3]);
  assert.equal(beleg.proben.every(x => x.kennungVor === K && x.kennungNach === K && x.vordergrundVor && x.vordergrundNach && x.socketlisteLesbar && x.abruf.code === 'UND_ERR_SOCKET' && x.abruf.weiterleitungBelegt && x.kontrolle.code === 'UND_ERR_SOCKET'), true);
  assert.ok(readFileSync(join(p.optionen.ausgabe, 'g-start.png')).length > 8);
  assert.match(readFileSync(join(p.optionen.ausgabe, 'zusammenfassung.txt'), 'utf8'), /Rückgabewert 0/);
  // Das Kennwort des Debug-Schlüssels steht nie in einem Prozessargument, die Kennwortdatei ist wieder weg.
  assert.equal(p.calls.some(c => c.args.includes('android')), false);
  assert.throws(() => readFileSync(join(p.optionen.ausgabe, 'tmp', 'debug-signierung.txt')), /ENOENT/);
});

test('Offener Devtools-Socket im Release-Build ist ein Fehler', nurWindows, async () => {
  const p = geraeteProbe({ releaseSocket: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools'), status(p, 'G-Flags')], ['nicht bestanden', 'nicht bestanden', 'bestanden']);
  assert.equal(p.app.apk, null);
});

test('Socket des eigenen Prozesses im Release-Build bleibt ein Fehler, auch ohne wirksame Gegenprobe', nurWindows, async () => {
  const p = geraeteProbe({ debugSocket: false, releaseSocket: true, releaseDevtools: false });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Socket-Gegenprobe'), status(p, 'G-Socket')], ['ungültig', 'nicht bestanden']);
  assert.match(grund(p, 'G-Socket'), /Devtools-Socket des Prozesses der App/);
});

test('Antwortende Devtools im Release-Build sind ein Fehler, auch ohne Eintrag in der Socketliste', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'nicht bestanden']);
  assert.equal(p.weiterleitungen.size, 0);
});

test('Antwort erhalten, danach Prozess weg: bleibt ein Fehler', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: true, releasePids: ['4321', '4321', '4321', '4321', '4321', ''] });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(status(p, 'G-Devtools'), 'nicht bestanden');
});

test('Antwort in der ersten Probe, danach scheitert die Weiterleitung: Die Antwort wird bewertet', nurWindows, async () => {
  // Weiterleitungen: eine je Versuch der Gegenprobe (hier einer), Kontrolle, dann je Probe zwei. Die fünfte scheitert.
  const p = geraeteProbe({ releaseDevtools: [1], forwardFehlerAb: 5 });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Devtools'), status(p, 'G-Socket'), status(p, 'Laufrahmen')], ['nicht bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'Laufrahmen'), /ADB-Weiterleitung nicht bestätigt/);
  assert.equal(p.app.apk, null);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

for (const [name, wahl, muster] of [
  ['JSON ohne Versionsauskunft', { releaseAbruf: { art: 'unerwartet', status: 200, grund: 'Antwort ist keine Versionsauskunft der Devtools.', text: '{}', ms: 4 } }, /anders als am Kontrollsocket/],
  ['Zeitüberschreitung', { releaseAbruf: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'The operation was aborted due to timeout', ms: 3000 } }, /anders als am Kontrollsocket/],
  ['anderer Verbindungsfehler als am Kontrollsocket', { releaseAbruf: VERWEIGERT }, /anders als am Kontrollsocket/],
  ['niemand hört am Port, bei App und Kontrollsocket gleich', { releaseAbruf: VERWEIGERT, releaseKontrolle: VERWEIGERT }, /Kontrollsocket endete nicht wie in der Debugphase/],
  ['Zeitüberschreitung bei App und Kontrollsocket', { releaseAbruf: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000 }, releaseKontrolle: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000 } }, /Kontrollsocket endete nicht wie in der Debugphase/],
]) test(`Release-Abruf nicht eindeutig (${name}): ungültig statt bestanden`, nurWindows, async () => {
  const p = geraeteProbe(wahl);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), muster);
});

test('Weiterleitung steht nicht in adb forward --list: Verbindungsprüfung ungültig', nurWindows, async () => {
  const p = geraeteProbe({ listeOhneWeiterleitung: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Devtools-Gegenprobe'), status(p, 'G-Devtools'), status(p, 'G-Socket')], ['ungültig', 'ungültig', 'bestanden']);
});

test('Nicht lesbares /proc/net/unix macht die Socketprüfung ungültig; die Verbindungsprüfung hängt nicht daran', nurWindows, async () => {
  const p = geraeteProbe({ unixLesbar: false });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Socket-Gegenprobe'), status(p, 'G-Socket'), status(p, 'G-Devtools-Gegenprobe'), status(p, 'G-Devtools')], ['ungültig', 'ungültig', 'bestanden', 'bestanden']);
  assert.match(grund(p, 'G-Socket-Gegenprobe'), /nicht lesbar/);
});

test('Debug-Build ohne antwortende Devtools: Gegenprobe ausgeschöpft, Verbindungsprüfung ungültig', nurWindows, async () => {
  const p = geraeteProbe({ debugDevtools: false });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Devtools-Gegenprobe'), status(p, 'G-Socket-Gegenprobe'), status(p, 'G-Devtools'), status(p, 'G-Socket')], ['ungültig', 'bestanden', 'ungültig', 'bestanden']);
  assert.equal(p.calls.filter(c => c.args[3] === 'tcp:0' && c.args[4].includes('webview_devtools_remote_')).length, 20 + 3);
});

// Aufrufe von pidof am Release-Build: Startbeleg davor und danach, dann je Probe davor und danach.
for (const [name, wahl, muster] of [
  ['stirbt während der letzten Probe', { releasePids: ['4321', '4321', '4321', '4321', '4321', '4321', '4321', ''] }, /Probe 3: Der Prozess der App läuft während der Probe nicht/],
  ['läuft schon beim Startbeleg nicht', { releasePids: [''] }, /Start und Formular der Release-Kopie sind nicht für einen durchgehend laufenden Prozess belegt/],
  ['wechselt während der zweiten Probe', { releasePids: ['4321', '4321', '4321', '4321', '4321', '5000'] }, /Probe 2: Der Prozess der App hat während der Probe gewechselt/],
  ['wechselt zwischen Startbeleg und erster Probe', { releasePids: ['4321', '4321', '5000', '5000', '5000', '5000', '5000', '5000'] }, /Probe 1: Die Probe betrifft einen anderen Prozess als der Beleg von Start und Formular/],
  ['ist in jeder Probe ein anderer, in sich stabiler Prozess', { releasePids: ['4321', '4321', '5000', '5000', '6000', '6000', '7000', '7000'] }, /Probe 1: Die Probe betrifft einen anderen Prozess/],
  ['wechselt zwischen zweiter und dritter Probe', { releasePids: ['4321', '4321', '4321', '4321', '4321', '4321', '7000', '7000'] }, /Probe 3: Die Probe betrifft einen anderen Prozess/],
  // Die Startzeit wird am Release-Build gelesen: Startbeleg davor und danach, dann je Probe davor und danach.
  ['startet während der ersten Probe unter derselben Nummer neu', { starts: { 4321: ['987654', '987654', '987654', '999999'] } }, /Probe 1: Der Prozess der App hat während der Probe gewechselt/],
  ['startet zwischen erster und zweiter Probe unter derselben Nummer neu', { starts: { 4321: ['987654', '987654', '987654', '987654', '999999'] } }, /Probe 2: Die Probe betrifft einen anderen Prozess als der Beleg von Start und Formular/],
  ['startet während des Startbelegs unter derselben Nummer neu', { starts: { 4321: ['987654', '999999'] } }, /Start und Formular der Release-Kopie sind nicht für einen durchgehend laufenden Prozess belegt/],
  ['hat keine lesbare Startzeit', { statFehler: true }, /Start und Formular der Release-Kopie sind nicht für einen durchgehend laufenden Prozess belegt/],
]) test(`Prozess der App ${name}: kein Bestehen`, nurWindows, async () => {
  const p = geraeteProbe(wahl);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Socket-Gegenprobe'), status(p, 'G-Devtools-Gegenprobe'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), muster);
});

test('Fremde Activity oben beim Start: Start nicht belegt, Debugging-Prüfungen ungültig', nurWindows, async () => {
  const p = geraeteProbe({ fremdeActivityAb: 1 });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Activity'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['nicht bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), /Start und Formular/);
});

test('Fremde Activity erst während der Proben: Proben ungültig', nurWindows, async () => {
  // Aufrufe am Release-Build: zwei für den Startbeleg, dann je Probe zwei. Ab dem fünften liegt eine andere App oben.
  const p = geraeteProbe({ fremdeActivityAb: 5 });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Activity'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Socket'), /Probe 2: Die App liegt während der Probe nicht im Vordergrund/);
});

const abzuege = p => p.calls.filter(c => c.args[3] === `uiautomator dump ${REMOTE}`).length;
// Wie am Abbild fr-api36 beobachtet: Der erste Abzug zeigt die WebView noch ohne Inhalt.
const leereWebView = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="" class="android.webkit.WebView" package="${APP}" bounds="[0,128][1080,2274]" /></hierarchy>`;

test('Ansicht ohne Formular: nach drei Abzügen Start nicht belegt, Debugging-Prüfungen ungültig', nurWindows, async () => {
  const p = geraeteProbe({ ansicht: `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Sperrbildschirm" bounds="[0,0][100,50]" /></hierarchy>` });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Start'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['ungültig', 'ungültig', 'ungültig']);
  assert.equal(abzuege(p), 3);
});

test('WebView liefert ihren Inhalt erst im zweiten Abzug des Ansichtsbaums: Start belegt', nurWindows, async () => {
  const p = geraeteProbe({ ansicht: [leereWebView, baum] });
  assert.equal(await nachgestellterLauf(p), 0);
  assert.equal(status(p, 'G-Start'), 'bestanden');
  assert.equal(abzuege(p), 2);
});

test('Formular im ersten Abzug: kein weiterer Abzug', nurWindows, async () => {
  const p = geraeteProbe();
  assert.equal(await nachgestellterLauf(p), 0);
  assert.equal(abzuege(p), 1);
});

test('Formulartexte aus einem fremden Paket belegen den Start nicht', nurWindows, async () => {
  const p = geraeteProbe({ ansicht: formular('com.example.fremd') });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Start'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['ungültig', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Start'), /nicht aus dem eigenen Paket/);
});

test('Paket kommt unmittelbar nach der Deinstallation des Debug-Builds von außen: bleibt unberührt', nurWindows, async () => {
  const p = geraeteProbe({ fremdNachUninstall: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /nach der bestätigten Deinstallation vorhanden; es gilt als fremd/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, 'fremd');
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Unterbrochene Installation wird auf dem Gerät erst später fertig: Das Aufräumen wartet und entfernt sie', nurWindows, async () => {
  const p = geraeteProbe({ signalBeiInstallation: true, installVerzoegert: 4 });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, null);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Unterbrochene Installation erscheint nicht: Das Aufräumen meldet den ungeklärten Zustand', nurWindows, async () => {
  const p = geraeteProbe({ signalBeiInstallation: true, installVerzoegert: Infinity });
  // Ein gescheiterter Aufräumschritt ist ein Fehler des Laufs, kein bloß ungültiger Befund.
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(adbAufrufe(p, 'uninstall').length, 0);
  assert.equal(aufgeraeumt(p)[0][1], 'nicht bestanden');
  assert.match(grund(p, 'Aufräumen: App deinstallieren'), /innerhalb von 60 Sekunden nicht erschienen/);
  assert.equal(p.calls.filter(c => c.args[3] === `pm list packages ${APP}`).length >= 30, true);
  assert.ok(p.uhr.ms - 1_700_000_000_000 >= 60000 && p.uhr.ms - 1_700_000_000_000 < 62000, 'Das Warten dauert 60 Sekunden der virtuellen Uhr');
});

test('Abgerissene Rückmeldung mit Fehlercode, Installation wird später fertig: Das Aufräumen wartet und entfernt sie', nurWindows, async () => {
  const p = geraeteProbe({ installHalb: 'debug', installHalbVerzoegert: 5 });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, null);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Nach der unterbrochenen Installation erscheint ein fremdes Paket: bleibt unberührt', nurWindows, async () => {
  // Die Installation des Laufs kam nie an; stattdessen erscheint dasselbe Paket mit anderem Inhalt.
  const p = geraeteProbe({ signalBeiInstallation: true, installVerzoegert: Infinity, fremdNachSignal: 3 });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(adbAufrufe(p, 'uninstall').length, 0);
  assert.equal(p.app.apk, 'fremd');
  assert.match(grund(p, 'Aufräumen: App deinstallieren'), /nicht die eigene Datei \(andere Prüfsumme\)\. Es gilt als fremd und bleibt unberührt/);
});

test('Deinstallation ohne Bestätigung, danach fremdes Paket: bleibt unberührt', nurWindows, async () => {
  const p = geraeteProbe({ uninstallOhneErgebnis: true, fremdNachUninstall: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.match(grund(p, 'Laufrahmen'), /Deinstallation fehlgeschlagen/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, 'fremd');
  assert.match(grund(p, 'Aufräumen: App deinstallieren'), /nicht die eigene Datei/);
});

test('Eigene Formulartexte ohne Fläche neben sichtbaren fremden: Start nicht belegt', nurWindows, async () => {
  const gemischt = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Fristenrechner Vergabe" package="${APP}" bounds="[0,0][0,0]" /><node text="Vergabeordnung" package="${APP}" bounds="[0,60][0,60]" /><node text="Fristenrechner Vergabe" package="com.example.fremd" bounds="[0,0][100,50]" /><node text="Vergabeordnung" package="com.example.fremd" bounds="[0,60][100,100]" /></hierarchy>`;
  const p = geraeteProbe({ ansicht: gemischt });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Start'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['ungültig', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Start'), /nicht aus dem eigenen Paket/);
});

test('Unterbrechung direkt nach einer Antwort der Devtools: Die Antwort wird bewertet', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: [1], signalNachAbruf: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Devtools'), status(p, 'Laufrahmen')], ['nicht bestanden', 'ungültig']);
  assert.equal(p.app.apk, null);
  assert.equal(p.weiterleitungen.size, 0);
});

test('Release-Kopie mit DEBUGGABLE ist ein Fehler', nurWindows, async () => {
  const p = geraeteProbe({ releaseFlags: 'DEBUGGABLE HAS_CODE' });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(status(p, 'G-Flags'), 'nicht bestanden');
});

test('Unwirksame Gegenprobe der Kennzeichen macht G-Flags ungültig', nurWindows, async () => {
  const p = geraeteProbe({ debugFlags: 'HAS_CODE ALLOW_CLEAR_USER_DATA' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Flags-Gegenprobe'), status(p, 'G-Flags')], ['ungültig', 'ungültig']);
});

test('Build-Typ userdebug bleibt eine dokumentierte Grenze', nurWindows, async () => {
  const p = geraeteProbe({ buildType: 'userdebug' });
  assert.equal(await nachgestellterLauf(p), 3);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools')], ['dokumentierte Grenze', 'dokumentierte Grenze']);
});

test('Vorhandene Installation: Abbruch ohne Installation und ohne Deinstallation', nurWindows, async () => {
  const p = geraeteProbe({ schonInstalliert: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /schon installiert/);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].includes(c.args[2])), false);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

for (const [name, wahl, muster] of [
  ['Nicht zugelassener Rechner', { zustand: 'unauthorized' }, /USB-Debugging bestätigen/],
  ['Gerät nicht bereit', { zustand: 'offline' }, /nicht angeschlossen oder nicht bereit \(offline\)/],
  ['Root-Shell', { root: true }, /läuft als root/],
  ['Root-Shell bei vorhandener Installation', { root: true, schonInstalliert: true }, /läuft als root/],
  ['Emulator mit fremder Seriennummer', { qemu: '1' }, /ist ein Emulator/],
  ['Zu alte Android-Version', { api: '29' }, /mindestens API 30/],
  ['Unlesbarer Build-Typ', { buildType: '' }, /nicht vollständig lesbar/],
  ['Debug-Datei eines fremden Pakets', { fremdesPaket: 'debug' }, /gehört zum Paket „com\.example\.fremd“.*Nichts installiert/],
]) test(`${name}: Abbruch vor jeder Installation`, nurWindows, async () => {
  const p = geraeteProbe(wahl);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), muster);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].includes(c.args[2])), false);
  assert.equal(ergebnis(p).aufraeumen.every(r => r.status === 'bestanden'), true);
});

test('Release-Datei eines fremden Pakets: nicht installiert, Debug-Build ist wieder entfernt', nurWindows, async () => {
  const p = geraeteProbe({ fremdesPaket: 'release' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /für release gehört zum Paket „com\.example\.fremd“/);
  assert.deepEqual(adbAufrufe(p, 'install').map(c => c.args[3]), [p.optionen.debug]);
  assert.equal(p.app.apk, null);
});

test('Abgelehnte Installation: nichts installiert, also auch keine Deinstallation', nurWindows, async () => {
  const p = geraeteProbe({ installFehler: 'debug' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Installation fehlgeschlagen: Failure \[INSTALL_FAILED_VERIFICATION_FAILURE\]/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 0);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Installation meldet Fehler, das Paket ist aber da: Der Lauf räumt seine eigene Installation auf', nurWindows, async () => {
  const p = geraeteProbe({ installHalb: 'debug' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Installation fehlgeschlagen/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, null);
});

test('Unterbrechung unmittelbar nach der Installation: Die eigene Installation wird entfernt', nurWindows, async () => {
  const p = geraeteProbe({ signalBeiInstallation: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, null);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Paket kommt zwischen Debug-Deinstallation und Release-Installation von außen: bleibt unberührt', nurWindows, async () => {
  const p = geraeteProbe({ fremdNachDebug: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /vor der Installation schon vorhanden\. Nichts installiert; das vorhandene Paket bleibt unberührt/);
  // Deinstalliert wurde nur der eigene Debug-Build.
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.deepEqual(adbAufrufe(p, 'install').map(c => c.args[3]), [p.optionen.debug]);
  assert.equal(p.app.apk, 'fremd');
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
});

test('Installation scheitert, weil das Paket inzwischen vorhanden ist: bleibt unberührt', nurWindows, async () => {
  const p = geraeteProbe({ installVorhanden: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /INSTALL_FAILED_ALREADY_EXISTS/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, 'fremd');
});

test('Deinstallation scheitert: Das Aufräumen meldet den Rest', nurWindows, async () => {
  const p = geraeteProbe({ deinstallationFehler: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(aufgeraeumt(p)[0][1], 'nicht bestanden');
  assert.equal(status(p, 'Aufräumen: App deinstallieren'), 'nicht bestanden');
  assert.equal(p.app.apk, p.optionen.debug);
});

test('Installierte Datei weicht von der Eingabe ab: ungültig; das Paket gilt nicht als eigenes und bleibt', nurWindows, async () => {
  const p = geraeteProbe({ pullAbweichung: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.match(grund(p, 'Laufrahmen'), /weicht von der Eingabedatei ab/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 0);
  assert.equal(p.app.apk, p.optionen.debug);
  assert.match(grund(p, 'Aufräumen: App deinstallieren'), /nicht die eigene Datei \(andere Prüfsumme\)/);
});

test('Start nicht bestätigt: ungültig, App entfernt', nurWindows, async () => {
  const p = geraeteProbe({ startFehler: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Activity-Start nicht bestätigt/);
  assert.equal(p.app.apk, null);
});

test('Weiterleitung lässt sich von Anfang an nicht anlegen: ungültig, App entfernt', nurWindows, async () => {
  const p = geraeteProbe({ forwardFehlerAb: 1 });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /ADB-Weiterleitung nicht bestätigt/);
  assert.equal(p.app.apk, null);
});

test('--app-behalten lässt nur den Release-Build auf dem Gerät', nurWindows, async () => {
  const p = geraeteProbe({ appBehalten: true });
  assert.equal(await nachgestellterLauf(p), 0);
  assert.equal(p.app.apk, p.signiert);
  assert.equal(ergebnis(p).appInstalliert, true);
  assert.match(readFileSync(join(p.optionen.ausgabe, 'zusammenfassung.txt'), 'utf8'), /auf dem Gerät geblieben/);
});

test('--app-behalten nach einem Fehler vor der Release-Installation: Der Debug-Build bleibt nicht liegen', nurWindows, async () => {
  const p = geraeteProbe({ appBehalten: true, fremdesPaket: 'release' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(p.app.apk, null);
  assert.equal(ergebnis(p).appInstalliert, false);
});

test('Unterbrechung während des Ansichtsbaums: App, Ansichtsdatei und Weiterleitungen werden aufgeräumt', nurWindows, async () => {
  const p = geraeteProbe({ signalBeimBaum: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual(aufgeraeumt(p), ALLES_AUFGERAEUMT);
  assert.equal(p.app.apk, null);
  assert.equal(p.weiterleitungen.size, 0);
  // Der letzte Aufruf auf dem Gerät ist das Entfernen der Ansichtsdatei in der Aufräumphase.
  const geraet = p.calls.filter(c => c.args[0] === '-s').map(c => c.args.slice(2).join(' '));
  assert.equal(geraet.at(-1), `shell rm -f ${REMOTE}`);
  assert.ok(geraet.lastIndexOf(`uninstall ${APP}`) > geraet.indexOf(`shell uiautomator dump ${REMOTE}`));
});

test('Nicht leerer Ausgabeordner wird abgelehnt', nurWindows, async () => {
  const p = geraeteProbe();
  mkdirSync(p.optionen.ausgabe, { recursive: true }); writeFileSync(join(p.optionen.ausgabe, 'alt.txt'), 'früherer Lauf');
  await assert.rejects(nachgestellterLauf(p), /nicht leer/);
  assert.equal(p.calls.length, 0);
});

test('Fehlende APK-Datei: ungültig ohne Zugriff auf das Gerät', nurWindows, async () => {
  const p = geraeteProbe();
  rmSync(p.optionen.release);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Datei fehlt/);
  assert.equal(p.calls.length, 0);
});
