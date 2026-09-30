// Gerätelauf mit eigenen Dateien und ersetzten Android-Prozessen. Ein Gerät ist nicht nötig.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { argumente, evaluiereDevtoolsVerbindung, geraetZustand, lauf, unguenstigster } from './geraet-lauf.mjs';
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

test('Argumente: Pflichtangaben, Emulator und unerwartete Zeichen', () => {
  const ziel = join(arbeit, 'argumente');
  const o = argumente(['--seriennummer', SERIE, '--ausgabe', ziel], repo);
  assert.equal(o.seriennummer, SERIE);
  assert.equal(o.appBehalten, false);
  assert.ok(o.debug.endsWith('app-debug.apk') && o.release.endsWith('app-release-unsigned.apk'));
  assert.equal(argumente(['--seriennummer', '192.168.0.5:5555', '--ausgabe', ziel, '--app-behalten'], repo).appBehalten, true);
  assert.throws(() => argumente(['--ausgabe', ziel], repo), /Pflichtargument fehlt: --seriennummer/);
  assert.throws(() => argumente(['--seriennummer', SERIE], repo), /Pflichtargument fehlt: --ausgabe/);
  assert.throws(() => argumente(['--seriennummer', 'emulator-5554', '--ausgabe', ziel], repo), /emulator-lauf\.mjs/);
  assert.throws(() => argumente(['--seriennummer', 'a b', '--ausgabe', ziel], repo), /unerwartete Zeichen/);
  assert.throws(() => argumente(['--seriennummer', '-s', '--ausgabe', ziel], repo), /Wert fehlt|unerwartete Zeichen/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe', ziel, '--wipe-data'], repo), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--seriennummer', SERIE, '--ausgabe', ziel], repo), /doppelt/);
  assert.throws(() => argumente(['--seriennummer', SERIE, '--ausgabe', join(repo, 'docs', 'geraet')], repo), /nur unter scratchpad/);
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

test('Devtools-Verbindung: Gegenprobe, laufender Prozess und Build-Typ sind Voraussetzung', () => {
  const zu = [{ pid: '4321', erreichbar: false }, { pid: '4321', erreichbar: false }];
  const s = m => evaluiereDevtoolsVerbindung(m).status;
  assert.equal(s({ gegenprobeErreichbar: true, proben: zu, buildType: 'user' }), 'bestanden');
  assert.equal(s({ gegenprobeErreichbar: true, proben: [...zu, { pid: '4321', erreichbar: true }], buildType: 'user' }), 'nicht bestanden');
  assert.equal(s({ gegenprobeErreichbar: false, proben: zu, buildType: 'user' }), 'ungültig');
  assert.equal(s({ gegenprobeErreichbar: true, proben: [], buildType: 'user' }), 'ungültig');
  assert.equal(s({ gegenprobeErreichbar: true, proben: [{ pid: '', erreichbar: false }], buildType: 'user' }), 'ungültig');
  assert.equal(s({ gegenprobeErreichbar: true, proben: [{ pid: '4321' }], buildType: 'user' }), 'ungültig');
  assert.equal(s({ gegenprobeErreichbar: true, proben: zu }), 'ungültig');
  assert.equal(s({ gegenprobeErreichbar: true, proben: zu, buildType: 'userdebug' }), 'dokumentierte Grenze');
  assert.equal(s({ gegenprobeErreichbar: true, proben: [{ pid: '4321', erreichbar: true }], buildType: 'eng' }), 'dokumentierte Grenze');
  assert.equal(s(null), 'ungültig');
});

const KOPF = 'Num       RefCount Protocol Flags    Type St Inode Path';
const zeile = pfad => `0000000000000000: 00000002 00000000 00010000 0001 01 12345 ${pfad}`;
const paket = flags => `Packages:\n  Package [${APP}] (1a2b3c):\n    versionCode=1 minSdk=30 targetSdk=36\n    flags=[ ${flags} ]\n`;
const baum = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node text="Fristenrechner Vergabe" bounds="[0,0][100,50]" /><node text="Vergabeordnung" bounds="[0,60][100,100]" /></hierarchy>`;
const REMOTE = '/data/local/tmp/fristenrechner-emulator.xml';

function geraeteProbe({ buildType = 'user', unixLesbar = true, releaseSocket = false, releaseDevtools = releaseSocket, schonInstalliert = false, root = false, zustand = 'device', api = '35', qemu = '', prozessWeg = false, appBehalten = false } = {}) {
  const ort = mkdtempSync(join(arbeit, 'geraet-'));
  const local = join(ort, 'local'), sdk = join(local, 'fristenrechner/android-sdk');
  const adb = join(sdk, 'platform-tools/adb.exe');
  mkdirSync(dirname(adb), { recursive: true }); writeFileSync(adb, 'Wird niemals ausgeführt.');
  const debug = join(ort, 'debug.apk'), release = join(ort, 'release.apk'), debugKey = join(ort, 'debug.keystore');
  writeFileSync(debug, 'Debug-Testdatei'); writeFileSync(release, 'Release-Testdatei'); writeFileSync(debugKey, 'kein Schlüssel');
  const optionen = { seriennummer: SERIE, ausgabe: join(ort, 'ausgabe'), appBehalten, debug, release };
  const java = 'java-nachgestellt.exe';
  const zustandApp = { apk: null, debug: false, laeuft: false };
  const calls = [], weiterleitungen = new Set();
  const ok = out => ({ code: 0, out, err: '' });
  const run = async (exe, argv, opts = {}) => {
    calls.push({ exe, args: argv });
    if (exe === java) {
      if (argv.includes('sign')) { const aus = argv[argv.indexOf('--out') + 1]; writeFileSync(aus, `${readFileSync(argv.at(-1), 'utf8')} signiert`); return ok(''); }
      assert.ok(argv.includes('verify'));
      return ok('Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\n');
    }
    assert.equal(exe, adb);
    if (argv[0] === 'devices') return ok(`List of devices attached\n${SERIE}\t${zustand}\n\n`);
    assert.deepEqual(argv.slice(0, 2), ['-s', SERIE]);
    const a = argv.slice(2);
    if (a[0] === 'install') { assert.equal(a[1], '-r'); Object.assign(zustandApp, { apk: a[2], debug: a[2] === debug, laeuft: false }); return ok('Performing Streamed Install\nSuccess\n'); }
    if (a[0] === 'uninstall') { assert.equal(a[1], APP); Object.assign(zustandApp, { apk: null, laeuft: false }); return ok('Success\n'); }
    if (a[0] === 'pull') { copyFileSync(zustandApp.apk, a[2]); return ok('1 file pulled'); }
    if (a[0] === 'exec-out') { assert.equal(opts.binary, true); return { code: 0, out: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), err: '' }; }
    if (a[0] === 'forward') {
      if (a[1] === 'tcp:0') { assert.equal(a[2], 'localabstract:webview_devtools_remote_4321'); weiterleitungen.add('40001'); return ok('40001\n'); }
      assert.deepEqual(a.slice(1), ['--remove', 'tcp:40001']); weiterleitungen.delete('40001'); return ok('');
    }
    if (a[0] === 'logcat') { assert.ok(a.includes('--pid=4321')); return ok('Protokoll der App'); }
    assert.equal(a[0], 'shell', `Unerwarteter ADB-Aufruf: ${a.join(' ')}`);
    const c = a[1];
    const eigenschaften = { 'ro.build.fingerprint': `samsung/a17xx/a17:15/AP3A.240905.015/A176BXXU1AYH1:${buildType}/release-keys`, 'ro.build.type': buildType, 'ro.build.version.sdk': api, 'ro.build.version.release': '15', 'ro.product.manufacturer': 'samsung', 'ro.product.model': 'SM-A176B', 'ro.kernel.qemu': '', 'ro.boot.qemu': qemu };
    if (c.startsWith('getprop ')) { assert.ok(Object.hasOwn(eigenschaften, c.slice(8)), c); return ok(`${eigenschaften[c.slice(8)]}\n`); }
    if (c === 'dumpsys webviewupdate') return ok('Current WebView package (name, version): (com.google.android.webview, 140.0.7339.51)\n');
    if (c === 'id') return ok(root ? 'uid=0(root) gid=0(root)' : 'uid=2000(shell) gid=2000(shell)');
    if (c === `pm list packages ${APP}`) return ok(zustandApp.apk || schonInstalliert ? `package:${APP}\n` : '');
    if (c === `pm path ${APP}`) return ok(`package:/data/app/~~Zufall==/${APP}-Zufall==/base.apk\n`);
    if (c === `am start -W -n ${APP}/de.baremos.fristenrechner.MainActivity`) { assert.ok(zustandApp.apk); zustandApp.laeuft = true; return ok('Starting: Intent\nStatus: ok\nLaunchState: COLD\n'); }
    if (c === `pidof ${APP}`) return zustandApp.laeuft && !(prozessWeg && !zustandApp.debug) ? ok('4321\n') : { code: 1, out: '', err: '' };
    if (c === 'cat /proc/net/unix') {
      if (!unixLesbar) return { code: 1, out: '', err: 'cat: /proc/net/unix: Permission denied' };
      const socket = zustandApp.laeuft && (zustandApp.debug || releaseSocket) ? [zeile('@webview_devtools_remote_4321')] : [];
      return ok([KOPF, zeile('/dev/socket/logdw'), zeile('@jdwp-control'), ...socket].join('\n') + '\n');
    }
    if (c === `dumpsys package ${APP}`) return ok(paket(zustandApp.debug ? 'DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA' : 'HAS_CODE ALLOW_CLEAR_USER_DATA'));
    if (c === 'dumpsys activity activities') return ok(`  topResumedActivity=ActivityRecord{1a2b3c u0 ${APP}/.MainActivity t12}\n`);
    if (c === `rm -f ${REMOTE}`) return ok('');
    if (c === `uiautomator dump ${REMOTE}`) return ok(`UI hierchary dumped to: ${REMOTE}\n`);
    if (c === `cat ${REMOTE}`) return ok(baum);
    throw new Error(`Unbekannter nachgestellter Shell-Befehl: ${c}`);
  };
  // Antwortet wie die Devtools, wenn die WebView der laufenden App das Debugging zulässt.
  const holen = async port => {
    assert.equal(port, '40001'); assert.ok(weiterleitungen.has(port));
    if (zustandApp.laeuft && (zustandApp.debug || releaseDevtools)) return { Browser: 'Chrome/140.0.7339.51' };
    throw new Error('fetch failed');
  };
  return { local, optionen, run, java, debugKey, holen, calls, zustandApp, weiterleitungen, sleep: async () => {} };
}

async function nachgestellterLauf(p) {
  const alt = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = p.local;
  try { return await lauf(p.optionen, { run: p.run, sleep: p.sleep, java: p.java, debugKey: p.debugKey, holen: p.holen }); }
  finally { if (alt === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = alt; }
}
const ergebnis = p => JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
const status = (p, id) => ergebnis(p).befund.find(b => b.id === id)?.status;

test('Gerät mit Build-Typ user: alle Befunde bestanden, App danach entfernt', nurWindows, async () => {
  const p = geraeteProbe();
  assert.equal(await nachgestellterLauf(p), 0);
  const e = ergebnis(p);
  assert.equal(e.ergebnis, 'bestanden');
  assert.deepEqual(e.befund.map(b => [b.id, b.status]), [['G-Gerät', 'bestanden'], ['G-Devtools-Gegenprobe', 'bestanden'], ['G-Socket-Gegenprobe', 'bestanden'], ['G-Flags-Gegenprobe', 'bestanden'], ['G-Activity', 'bestanden'], ['G-Start', 'bestanden'], ['G-Flags', 'bestanden'], ['G-Socket', 'bestanden'], ['G-Devtools', 'bestanden']]);
  assert.match(e.befund[0].grund, /samsung SM-A176B, Android 15 \(API 35\), Build-Typ user, WebView 140\.0\.7339\.51/);
  assert.equal(e.aufraeumen.every(r => r.status === 'bestanden'), true);
  assert.equal(p.zustandApp.apk, null);
  assert.equal(p.weiterleitungen.size, 0);
  assert.equal(e.appInstalliert, false);
  // Installiert wurden genau der Debug-Build und die signierte Kopie des Release-Builds, in dieser Reihenfolge.
  const installiert = p.calls.filter(c => c.args[2] === 'install').map(c => c.args[4]);
  assert.deepEqual(installiert, [p.optionen.debug, join(p.optionen.ausgabe, 'release-debug-signiert.apk')]);
  assert.equal(e.installationen.every(i => i.eingang === i.installiert), true);
  assert.deepEqual(JSON.parse(readFileSync(join(p.optionen.ausgabe, 'g-pids.json'), 'utf8')), ['4321', '4321', '4321']);
  assert.ok(readFileSync(join(p.optionen.ausgabe, 'g-start.png')).length > 8);
  assert.match(readFileSync(join(p.optionen.ausgabe, 'zusammenfassung.txt'), 'utf8'), /Rückgabewert 0/);
  // Das Kennwort des Debug-Schlüssels steht nie in einem Prozessargument, die Kennwortdatei ist wieder weg.
  assert.equal(p.calls.some(c => c.args.includes('android')), false);
  assert.throws(() => readFileSync(join(p.optionen.ausgabe, 'tmp', 'debug-signierung.txt')), /ENOENT/);
});

test('Offener Devtools-Socket im Release-Build ist ein Fehler', nurWindows, async () => {
  const p = geraeteProbe({ releaseSocket: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(status(p, 'G-Socket'), 'nicht bestanden');
  assert.equal(status(p, 'G-Devtools'), 'nicht bestanden');
  assert.equal(status(p, 'G-Flags'), 'bestanden');
  assert.equal(p.zustandApp.apk, null);
});

test('Nicht lesbares /proc/net/unix macht die Socketprüfung ungültig, nicht bestanden', nurWindows, async () => {
  const p = geraeteProbe({ unixLesbar: false });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(status(p, 'G-Socket-Gegenprobe'), 'ungültig');
  assert.equal(status(p, 'G-Socket'), 'ungültig');
  // Die Verbindungsprüfung hängt nicht an der Socketliste.
  assert.equal(status(p, 'G-Devtools-Gegenprobe'), 'bestanden');
  assert.equal(status(p, 'G-Devtools'), 'bestanden');
  assert.match(ergebnis(p).befund.find(b => b.id === 'G-Socket-Gegenprobe').grund, /nicht lesbar/);
});

test('Ohne laufenden Prozess der App gilt ein fehlender Socket nicht als Beleg', nurWindows, async () => {
  const p = geraeteProbe({ prozessWeg: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(status(p, 'G-Socket-Gegenprobe'), 'bestanden');
  assert.equal(status(p, 'G-Socket'), 'ungültig');
  assert.equal(status(p, 'G-Devtools'), 'ungültig');
});

test('Antwortende Devtools im Release-Build sind ein Fehler, auch ohne Eintrag in der Socketliste', nurWindows, async () => {
  const p = geraeteProbe({ releaseDevtools: true });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.equal(status(p, 'G-Socket'), 'bestanden');
  assert.equal(status(p, 'G-Devtools'), 'nicht bestanden');
  assert.equal(p.weiterleitungen.size, 0);
});

test('Build-Typ userdebug bleibt eine dokumentierte Grenze', nurWindows, async () => {
  const p = geraeteProbe({ buildType: 'userdebug' });
  assert.equal(await nachgestellterLauf(p), 3);
  assert.equal(status(p, 'G-Socket'), 'dokumentierte Grenze');
  assert.equal(status(p, 'G-Devtools'), 'dokumentierte Grenze');
});

test('Vorhandene Installation: Abbruch ohne Installation und ohne Deinstallation', nurWindows, async () => {
  const p = geraeteProbe({ schonInstalliert: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(ergebnis(p).befund.find(b => b.id === 'Laufrahmen').grund, /schon installiert/);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].includes(c.args[2])), false);
});

for (const [name, wahl, muster] of [
  ['Nicht zugelassener Rechner', { zustand: 'unauthorized' }, /USB-Debugging bestätigen/],
  ['Gerät nicht bereit', { zustand: 'offline' }, /nicht angeschlossen oder nicht bereit \(offline\)/],
  ['Root-Shell', { root: true }, /läuft als root/],
  ['Emulator mit fremder Seriennummer', { qemu: '1' }, /ist ein Emulator/],
  ['Zu alte Android-Version', { api: '29' }, /mindestens API 30/],
]) test(`${name}: Abbruch vor jeder Installation`, nurWindows, async () => {
  const p = geraeteProbe(wahl);
  assert.equal(await nachgestellterLauf(p), 2);
  assert.match(ergebnis(p).befund.find(b => b.id === 'Laufrahmen').grund, muster);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].includes(c.args[2])), false);
});

test('--app-behalten lässt nur den Release-Build auf dem Gerät', nurWindows, async () => {
  const p = geraeteProbe({ appBehalten: true });
  assert.equal(await nachgestellterLauf(p), 0);
  assert.equal(p.zustandApp.apk, join(p.optionen.ausgabe, 'release-debug-signiert.apk'));
  assert.equal(ergebnis(p).appInstalliert, true);
  assert.match(readFileSync(join(p.optionen.ausgabe, 'zusammenfassung.txt'), 'utf8'), /auf dem Gerät geblieben/);
});

test('Nicht leerer Ausgabeordner wird abgelehnt', nurWindows, async () => {
  const p = geraeteProbe();
  mkdirSync(p.optionen.ausgabe, { recursive: true }); writeFileSync(join(p.optionen.ausgabe, 'alt.txt'), 'früherer Lauf');
  await assert.rejects(nachgestellterLauf(p), /nicht leer/);
  assert.equal(p.calls.length, 0);
});
