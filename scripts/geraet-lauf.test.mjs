// Gerätelauf mit eigenen Dateien und ersetzten Android-Prozessen. Ein Gerät ist nicht nötig.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KONTROLLSOCKET, argumente, evaluiereDevtoolsVerbindung, evaluiereSocketProben, geraetZustand, holeDevtoolsVersion, lauf, main, probeGueltig, unguenstigster } from './geraet-lauf.mjs';
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
  const liste = `List of devices attached\r\n${SERIE}\tdevice\r\nemulator-5554\toffline\r\n\r\n`;
  assert.equal(geraetZustand(liste, SERIE), 'device');
  assert.equal(geraetZustand(liste, 'emulator-5554'), 'offline');
  assert.equal(geraetZustand(liste, 'R58'), null);
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

// Wie am Abbild fr-api36 beobachtet: Der Abruf an einem Socket, den es nicht gibt, endet mit UND_ERR_SOCKET.
const KEIN_SOCKET = { art: 'fehler', name: 'TypeError', code: 'UND_ERR_SOCKET', meldung: 'fetch failed', ms: 90 };
const ANTWORT = { art: 'antwort', status: 200, browser: 'Chrome/140.0.7339.51', paket: APP, ms: 170 };
const guteProbe = (mehr = {}) => ({ pidVor: '4321', pidNach: '4321', vordergrundVor: true, vordergrundNach: true, abruf: KEIN_SOCKET, kontrolle: KEIN_SOCKET, ...mehr });

test('Probe am Release-Build: gleicher Prozess vor und nach der Probe, App im Vordergrund', () => {
  assert.equal(probeGueltig(guteProbe()), null);
  assert.match(probeGueltig(guteProbe({ pidNach: '' })), /läuft während der Probe nicht/);
  assert.match(probeGueltig(guteProbe({ pidVor: '' })), /läuft während der Probe nicht/);
  assert.match(probeGueltig(guteProbe({ pidNach: '5000' })), /gewechselt/);
  assert.match(probeGueltig(guteProbe({ vordergrundNach: false })), /nicht im Vordergrund/);
  assert.match(probeGueltig(guteProbe({ vordergrundVor: undefined })), /nicht im Vordergrund/);
  assert.match(probeGueltig(null), /fehlt/);
});

test('Devtools-Verbindung: Antwort geht vor, sonst zählen Gegenprobe, Start, Prozess und Kontrollsocket', () => {
  const s = (mehr = {}) => evaluiereDevtoolsVerbindung({ gegenprobeErreichbar: true, startBelegt: true, proben: [guteProbe(), guteProbe(), guteProbe()], buildType: 'user', ...mehr }).status;
  assert.equal(s(), 'bestanden');
  assert.equal(s({ proben: [guteProbe(), guteProbe({ abruf: ANTWORT })] }), 'nicht bestanden');
  // Eine belegte Antwort wird durch eine später unbrauchbare Probe nicht abgeschwächt.
  assert.equal(s({ proben: [guteProbe({ abruf: ANTWORT }), guteProbe({ pidNach: '' })] }), 'nicht bestanden');
  assert.equal(s({ proben: [guteProbe({ abruf: ANTWORT })], gegenprobeErreichbar: false, startBelegt: false }), 'nicht bestanden');
  assert.equal(s({ gegenprobeErreichbar: false }), 'ungültig');
  assert.equal(s({ startBelegt: false }), 'ungültig');
  assert.equal(s({ proben: [] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe(), guteProbe({ pidNach: '' })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ pidNach: '5000' })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ vordergrundVor: false })] }), 'ungültig');
  // Etwas antwortet, aber nicht als Devtools; oder der Abruf scheitert anders als am Kontrollsocket.
  assert.equal(s({ proben: [guteProbe({ abruf: { art: 'unerwartet', status: 200, grund: 'kein JSON', ms: 5 } })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ abruf: { ...KEIN_SOCKET, code: 'ECONNREFUSED' } })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ abruf: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000 } })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ abruf: null })] }), 'ungültig');
  // Ohne eindeutig gescheiterten Abruf am Kontrollsocket ist der Verbindungsweg nicht belegt.
  assert.equal(s({ proben: [guteProbe({ kontrolle: ANTWORT })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ kontrolle: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000 }, abruf: { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'timeout', ms: 3000 } })] }), 'ungültig');
  assert.equal(s({ buildType: 'userdebug' }), 'dokumentierte Grenze');
  assert.equal(s({ buildType: 'eng', proben: [guteProbe({ abruf: ANTWORT })] }), 'dokumentierte Grenze');
  assert.equal(s({ buildType: undefined }), 'ungültig');
  assert.equal(evaluiereDevtoolsVerbindung(null).status, 'ungültig');
});

const KOPF = 'Num       RefCount Protocol Flags    Type St Inode Path';
const zeile = pfad => `0000000000000000: 00000002 00000000 00010000 0001 01 12345 ${pfad}`;
const liste = (...mehr) => [KOPF, zeile('/dev/socket/logdw'), zeile('@jdwp-control'), ...mehr].join('\n') + '\n';

test('Socketliste: Fund geht vor, sonst zählen Gegenprobe, Lesbarkeit, Start und Prozess', () => {
  const s = (mehr = {}) => evaluiereSocketProben({ debugSocketNachgewiesen: true, startBelegt: true, proben: [guteProbe({ text: liste() }), guteProbe({ text: liste() })], buildType: 'user', ...mehr }).status;
  assert.equal(s(), 'bestanden');
  assert.equal(s({ proben: [guteProbe({ text: liste() }), guteProbe({ text: liste(zeile('@webview_devtools_remote_4321')), pidNach: '' })], startBelegt: false }), 'nicht bestanden');
  assert.equal(s({ debugSocketNachgewiesen: false }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ text: null })] }), 'ungültig');
  assert.equal(s({ startBelegt: false }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ text: liste(), pidNach: '' })] }), 'ungültig');
  assert.equal(s({ proben: [guteProbe({ text: liste(), vordergrundNach: false })] }), 'ungültig');
  assert.equal(s({ proben: [] }), 'ungültig');
  assert.equal(s({ buildType: 'userdebug' }), 'dokumentierte Grenze');
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
  // Die Gegenseite nimmt an und schließt sofort: so verhält sich die Weiterleitung ohne Socket.
  const zu = await mitServer(tcpServer(socket => socket.destroy()), holeDevtoolsVersion);
  assert.equal(zu.art, 'fehler'); assert.equal(zu.name, 'TypeError'); assert.equal(typeof zu.code, 'string');
  const haengt = await mitServer(tcpServer(() => {}), port => holeDevtoolsVersion(port, 200));
  assert.deepEqual([haengt.art, haengt.name], ['fehler', 'TimeoutError']);
  let frei;
  await mitServer(tcpServer(() => {}), async port => { frei = port; });
  const niemand = await holeDevtoolsVersion(frei, 1000);
  assert.deepEqual([niemand.art, niemand.name, niemand.code], ['fehler', 'TypeError', 'ECONNREFUSED']);
});

const paket = flags => `Packages:\n  Package [${APP}] (1a2b3c):\n    versionCode=100 minSdk=30 targetSdk=36\n    flags=[ ${flags} ]\n`;
const baum = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Fristenrechner Vergabe" bounds="[0,0][100,50]" /><node text="Vergabeordnung" bounds="[0,60][100,100]" /></hierarchy>`;
const REMOTE = '/data/local/tmp/fristenrechner-emulator.xml';
const PFAD = `/data/app/~~Zufall==/${APP}-Zufall==/base.apk`;

// Stellt adb, aapt2, apksigner und den Abruf nach. Jeder Aufruf wird mit seiner vollständigen Argumentliste geprüft.
function geraeteProbe(wahl = {}) {
  const { buildType = 'user', unixLesbar = true, releaseSocket = false, releaseDevtools = releaseSocket, releaseAbruf = KEIN_SOCKET,
    schonInstalliert = false, root = false, zustand = 'device', api = '35', qemu = '', appBehalten = false, fremdesPaket = null,
    installFehler = null, installHalb = null, pullAbweichung = false, forwardFehler = false, debugFlags = 'DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA',
    releaseFlags = 'HAS_CODE ALLOW_CLEAR_USER_DATA', releasePids = [], fremdeActivityAb = Infinity, ansicht = baum, debugDevtools = true,
    signalBeimBaum = false, startFehler = false } = wahl;
  const ort = mkdtempSync(join(arbeit, 'geraet-'));
  const local = join(ort, 'local'), sdk = join(local, 'fristenrechner/android-sdk');
  const adb = join(sdk, 'platform-tools/adb.exe'), aapt2 = join(sdk, 'build-tools/35.0.0/aapt2.exe');
  mkdirSync(dirname(adb), { recursive: true }); writeFileSync(adb, 'Wird niemals ausgeführt.');
  const debug = join(ort, 'debug.apk'), release = join(ort, 'release.apk'), debugKey = join(ort, 'debug.keystore');
  writeFileSync(debug, 'Debug-Testdatei'); writeFileSync(release, 'Release-Testdatei'); writeFileSync(debugKey, 'kein Schlüssel');
  const optionen = { seriennummer: SERIE, ausgabe: join(ort, 'ausgabe'), appBehalten, debug, release };
  const signiert = join(optionen.ausgabe, 'release-debug-signiert.apk');
  const java = 'java-nachgestellt.exe';
  const app = { apk: null, debug: false, laeuft: false };
  const calls = [], weiterleitungen = new Map();
  let port = 40000, releasePidAufruf = 0, activityAufruf = 0;
  const ok = out => ({ code: 0, out, err: '' });
  const art = apk => (apk === debug ? 'debug' : apk === signiert ? 'release' : null);
  const run = async (exe, argv, opts = {}) => {
    calls.push({ exe, args: argv });
    if (exe === java) {
      if (argv.includes('sign')) { assert.equal(argv.at(-1), release); writeFileSync(argv[argv.indexOf('--out') + 1], `${readFileSync(release, 'utf8')} signiert`); return ok(''); }
      assert.ok(argv.includes('verify'));
      return ok('Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\n');
    }
    if (exe === aapt2) {
      assert.deepEqual(argv.slice(0, 2), ['dump', 'packagename']); assert.equal(argv.length, 3); assert.ok(art(argv[2]), `aapt2 mit unerwarteter Datei: ${argv[2]}`);
      return ok(`${fremdesPaket === art(argv[2]) ? 'com.example.fremd' : APP}\r\n`);
    }
    assert.equal(exe, adb);
    if (argv[0] === 'devices') { assert.equal(argv.length, 1); return ok(`List of devices attached\n${SERIE}\t${zustand}\n\n`); }
    assert.deepEqual(argv.slice(0, 2), ['-s', SERIE]);
    const a = argv.slice(2), text = a.join(' ');
    if (a[0] === 'install') {
      assert.equal(a.length, 2); assert.ok(art(a[1]), 'Installation einer unerwarteten Datei');
      assert.equal(app.apk, null, 'Installation über ein vorhandenes Paket');
      if (installFehler === art(a[1])) return { code: 1, out: 'Failure [INSTALL_FAILED_VERIFICATION_FAILURE]\n', err: '' };
      Object.assign(app, { apk: a[1], debug: a[1] === debug, laeuft: false });
      return installHalb === art(a[1]) ? { code: 1, out: '', err: 'adb: Verbindung während der Rückmeldung verloren' } : ok('Performing Streamed Install\nSuccess\n');
    }
    if (text === `uninstall ${APP}`) { Object.assign(app, { apk: null, laeuft: false }); return ok('Success\n'); }
    if (a[0] === 'pull') { assert.equal(a.length, 3); assert.equal(a[1], PFAD); if (pullAbweichung) writeFileSync(a[2], 'anderer Inhalt'); else copyFileSync(app.apk, a[2]); return ok('1 file pulled'); }
    if (text === 'exec-out screencap -p') { assert.equal(opts.binary, true); return { code: 0, out: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), err: '' }; }
    if (a[0] === 'logcat') { assert.match(text, /^logcat -d -v time --pid=\d+$/); return ok('Protokoll der App'); }
    if (a[0] === 'forward') {
      if (a[1] === '--remove') { assert.equal(a.length, 3); const p = a[2].replace(/^tcp:/, ''); assert.ok(weiterleitungen.has(p), 'Unbekannte Weiterleitung entfernt'); weiterleitungen.delete(p); return ok(''); }
      assert.equal(a.length, 3); assert.equal(a[1], 'tcp:0');
      assert.match(a[2], new RegExp(`^localabstract:(?:webview_devtools_remote_\\d+|${KONTROLLSOCKET})$`));
      if (forwardFehler) return { code: 1, out: '', err: 'adb: error: cannot bind listener' };
      weiterleitungen.set(String(++port), a[2].replace(/^localabstract:/, '')); return ok(`${port}\n`);
    }
    assert.deepEqual([a[0], a.length], ['shell', 2], `Unerwarteter ADB-Aufruf: ${text}`);
    const c = a[1];
    const eigenschaften = { 'ro.build.fingerprint': `samsung/a17xx/a17:15/AP3A.240905.015/A176BXXU1AYH1:${buildType}/release-keys`, 'ro.build.type': buildType, 'ro.build.version.sdk': api, 'ro.build.version.release': '15', 'ro.product.manufacturer': 'samsung', 'ro.product.model': 'SM-A176B', 'ro.build.version.oneui': '70000', 'ro.kernel.qemu': '', 'ro.boot.qemu': qemu };
    if (c.startsWith('getprop ')) { assert.ok(Object.hasOwn(eigenschaften, c.slice(8)), c); return ok(`${eigenschaften[c.slice(8)]}\n`); }
    if (c === 'dumpsys webviewupdate') return ok('Current WebView package (name, version): (com.google.android.webview, 140.0.7339.51)\n');
    if (c === 'id') return ok(root ? 'uid=0(root) gid=0(root)' : 'uid=2000(shell) gid=2000(shell)');
    if (c === `pm list packages ${APP}`) return ok(app.apk || schonInstalliert ? `package:${APP}\n` : '');
    if (c === `pm path ${APP}`) return ok(`package:${PFAD}\n`);
    if (c === `am start -W -n ${APP}/de.baremos.fristenrechner.MainActivity`) { assert.ok(app.apk); if (startFehler) return ok('Starting: Intent\nError: Activity class does not exist.\n'); app.laeuft = true; return ok('Starting: Intent\nStatus: ok\nLaunchState: COLD\n'); }
    if (c === `pidof ${APP}`) {
      if (!app.laeuft) return { code: 1, out: '', err: '' };
      const pid = app.debug ? '4321' : releasePids[releasePidAufruf++] ?? '4321';
      return pid === '' ? { code: 1, out: '', err: '' } : ok(`${pid}\n`);
    }
    if (/^ps -o PID,STIME,ETIME,ARGS -p \d+$/.test(c)) return ok(`  PID STIME     ELAPSED ARGS\n ${c.split(' ').at(-1)} 18:40:01    0:12 ${APP}\n`);
    if (c === 'cat /proc/net/unix') {
      if (!unixLesbar) return { code: 1, out: '', err: 'cat: /proc/net/unix: Permission denied' };
      return ok(liste(...(app.laeuft && (app.debug || releaseSocket) ? [zeile('@webview_devtools_remote_4321')] : [])));
    }
    if (c === `dumpsys package ${APP}`) return ok(paket(app.debug ? debugFlags : releaseFlags));
    if (c === 'dumpsys activity activities') {
      const fremd = !app.debug && ++activityAufruf >= fremdeActivityAb;
      return ok(`  topResumedActivity=ActivityRecord{1a2b3c u0 ${fremd ? 'com.sec.android.app.launcher/.Launcher' : `${APP}/.MainActivity`} t12}\n`);
    }
    if (c === `rm -f ${REMOTE}`) return ok('');
    if (c === `uiautomator dump ${REMOTE}`) { if (signalBeimBaum) process.emit('SIGINT'); return ok(`UI hierchary dumped to: ${REMOTE}\n`); }
    if (c === `cat ${REMOTE}`) return ok(ansicht);
    throw new Error(`Unbekannter nachgestellter Shell-Befehl: ${c}`);
  };
  // Antwortet wie die Devtools, wenn die WebView der laufenden App das Debugging zulässt; sonst wie ohne Socket.
  const holen = async p => {
    assert.ok(weiterleitungen.has(p), 'Abruf ohne Weiterleitung');
    const socket = weiterleitungen.get(p);
    if (socket === KONTROLLSOCKET) return KEIN_SOCKET;
    if (app.laeuft && app.debug) return debugDevtools ? ANTWORT : KEIN_SOCKET;
    return app.laeuft && releaseDevtools ? ANTWORT : releaseAbruf;
  };
  return { local, optionen, run, java, debugKey, holen, calls, app, weiterleitungen, signiert, sleep: async () => {} };
}

async function nachgestellterLauf(p) {
  const alt = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = p.local;
  try { return await lauf(p.optionen, { run: p.run, sleep: p.sleep, java: p.java, debugKey: p.debugKey, holen: p.holen }); }
  finally { if (alt === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = alt; }
}
const ergebnis = p => JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
const status = (p, id) => ergebnis(p).befund.find(b => b.id === id)?.status;
const grund = (p, id) => ergebnis(p).befund.find(b => b.id === id)?.grund;
const adbAufrufe = (p, befehl) => p.calls.filter(c => c.args[2] === befehl);

test('Gerät mit Build-Typ user: alle Befunde bestanden, App danach entfernt', nurWindows, async () => {
  const p = geraeteProbe();
  assert.equal(await nachgestellterLauf(p), 0);
  const e = ergebnis(p);
  assert.equal(e.ergebnis, 'bestanden');
  assert.deepEqual(e.befund.map(b => [b.id, b.status]), [['G-Gerät', 'bestanden'], ['G-Devtools-Gegenprobe', 'bestanden'], ['G-Socket-Gegenprobe', 'bestanden'], ['G-Flags-Gegenprobe', 'bestanden'], ['G-Activity', 'bestanden'], ['G-Start', 'bestanden'], ['G-Flags', 'bestanden'], ['G-Socket', 'bestanden'], ['G-Devtools', 'bestanden']]);
  assert.match(e.befund[0].grund, /samsung SM-A176B, Android 15 \(API 35\), Build-Typ user, WebView 140\.0\.7339\.51/);
  assert.deepEqual(e.aufraeumen.map(r => [r.name, r.status]), [['App deinstallieren', 'bestanden'], ['Ansichtsdatei entfernen', 'bestanden'], ['ADB-Weiterleitungen entfernen', 'bestanden']]);
  assert.equal(p.app.apk, null);
  assert.equal(p.weiterleitungen.size, 0);
  assert.equal(e.appInstalliert, false);
  // Installiert wurden genau der Debug-Build und die signierte Kopie des Release-Builds, ohne Ersetzen.
  assert.deepEqual(adbAufrufe(p, 'install').map(c => c.args.slice(2)), [['install', p.optionen.debug], ['install', p.signiert]]);
  assert.deepEqual(e.installationen.map(i => [i.name, i.eingang === i.installiert]), [['debug', true], ['release', true]]);
  const proben = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'g-proben.json'), 'utf8'));
  assert.equal(proben.length, 3);
  assert.equal(proben.every(x => x.pidVor === '4321' && x.pidNach === '4321' && x.vordergrundVor && x.vordergrundNach && x.socketlisteLesbar && x.abruf.code === 'UND_ERR_SOCKET' && x.kontrolle.code === 'UND_ERR_SOCKET'), true);
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

test('Antwortende Devtools im Release-Build sind ein Fehler, auch ohne Eintrag in der Socketliste', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'nicht bestanden']);
  assert.equal(p.weiterleitungen.size, 0);
});

test('Antwort erhalten, danach Prozess weg: bleibt ein Fehler', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: true, releasePids: ['4321', '4321', '4321', ''] });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(status(p, 'G-Devtools'), 'nicht bestanden');
});

for (const [name, releaseAbruf] of [
  ['JSON ohne Versionsauskunft', { art: 'unerwartet', status: 200, grund: 'Antwort ist keine Versionsauskunft der Devtools.', text: '{}', ms: 4 }],
  ['Zeitüberschreitung', { art: 'fehler', name: 'TimeoutError', code: null, meldung: 'The operation was aborted due to timeout', ms: 3000 }],
  ['anderer Verbindungsfehler als am Kontrollsocket', { art: 'fehler', name: 'TypeError', code: 'ECONNREFUSED', meldung: 'fetch failed', ms: 3 }],
]) test(`Release-Abruf nicht eindeutig (${name}): ungültig statt bestanden`, nurWindows, async () => {
  const p = geraeteProbe({ releaseAbruf });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), /anders als am Kontrollsocket/);
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

for (const [name, releasePids, muster] of [
  ['stirbt während der letzten Probe', ['4321', '4321', '4321', '4321', '4321', ''], /Probe 3: Der Prozess der App läuft während der Probe nicht/],
  ['läuft schon vor der ersten Probe nicht', [''], /Probe 1: Der Prozess der App läuft während der Probe nicht/],
  ['wechselt während der zweiten Probe', ['4321', '4321', '4321', '5000'], /Probe 2: Der Prozess der App hat während der Probe gewechselt/],
]) test(`Prozess der App ${name}: kein Bestehen`, nurWindows, async () => {
  const p = geraeteProbe({ releasePids });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Socket-Gegenprobe'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), muster);
});

test('Fremde Activity oben beim Start: Start nicht belegt, Debugging-Prüfungen ungültig', nurWindows, async () => {
  const p = geraeteProbe({ fremdeActivityAb: 1 });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.deepEqual([status(p, 'G-Activity'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['nicht bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Devtools'), /Start und Formular/);
});

test('Fremde Activity erst während der Proben: Proben ungültig', nurWindows, async () => {
  // Aufrufe am Release-Build: 1 für G-Activity, dann je Probe zwei. Ab dem vierten liegt eine andere App oben.
  const p = geraeteProbe({ fremdeActivityAb: 4 });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Activity'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['bestanden', 'ungültig', 'ungültig']);
  assert.match(grund(p, 'G-Socket'), /Probe 2: Die App liegt während der Probe nicht im Vordergrund/);
});

test('Ansicht ohne Formular: Start nicht belegt, Debugging-Prüfungen ungültig', nurWindows, async () => {
  const p = geraeteProbe({ ansicht: `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Sperrbildschirm" bounds="[0,0][100,50]" /></hierarchy>` });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.deepEqual([status(p, 'G-Start'), status(p, 'G-Socket'), status(p, 'G-Devtools')], ['ungültig', 'ungültig', 'ungültig']);
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
});

for (const [name, wahl, muster] of [
  ['Nicht zugelassener Rechner', { zustand: 'unauthorized' }, /USB-Debugging bestätigen/],
  ['Gerät nicht bereit', { zustand: 'offline' }, /nicht angeschlossen oder nicht bereit \(offline\)/],
  ['Root-Shell', { root: true }, /läuft als root/],
  ['Emulator mit fremder Seriennummer', { qemu: '1' }, /ist ein Emulator/],
  ['Zu alte Android-Version', { api: '29' }, /mindestens API 30/],
  ['Unlesbarer Build-Typ', { buildType: '' }, /nicht vollständig lesbar/],
  ['Debug-Datei eines fremden Pakets', { fremdesPaket: 'debug' }, /gehört zum Paket „com\.example\.fremd“.*Nichts installiert/],
]) test(`${name}: Abbruch vor jeder Installation`, nurWindows, async () => {
  const p = geraeteProbe(wahl);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), muster);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].includes(c.args[2])), false);
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
});

test('Installation meldet Fehler, das Paket ist aber da: Der Lauf räumt seine eigene Installation auf', nurWindows, async () => {
  const p = geraeteProbe({ installHalb: 'debug' });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Installation fehlgeschlagen/);
  assert.equal(adbAufrufe(p, 'uninstall').length, 1);
  assert.equal(p.app.apk, null);
});

test('Installierte Datei weicht von der Eingabe ab: ungültig, App entfernt', nurWindows, async () => {
  const p = geraeteProbe({ pullAbweichung: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /weicht von der Eingabedatei ab/);
  assert.equal(p.app.apk, null);
});

test('Start nicht bestätigt: ungültig, App entfernt', nurWindows, async () => {
  const p = geraeteProbe({ startFehler: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(grund(p, 'Laufrahmen'), /Activity-Start nicht bestätigt/);
  assert.equal(p.app.apk, null);
});

test('Weiterleitung lässt sich nicht anlegen: ungültig, App entfernt', nurWindows, async () => {
  const p = geraeteProbe({ forwardFehler: true });
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
  const e = ergebnis(p);
  assert.deepEqual(e.aufraeumen.map(r => [r.name, r.status]), [['App deinstallieren', 'bestanden'], ['Ansichtsdatei entfernen', 'bestanden'], ['ADB-Weiterleitungen entfernen', 'bestanden']]);
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
