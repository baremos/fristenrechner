// Rahmenprüfung mit eigenen Dateien und ersetzten Android-Prozessen.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lauf, variantePlan, avdName, geraeteDaten, stelleEinstellungZurueck } from './emulator-lauf.mjs';
import { APP, argumente, ausgabePruefen, echterPfad, innen, mitAufraeumen, prozess, schreiber, websocketPruefen } from './emulator/rahmen.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(repo, 'scratchpad', 'paket-2.5-c4', 'tmp');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'emulator-lauf-test-'));
test.after(() => {
  assert.ok(innen(realpathSync(basis), realpathSync(arbeit)));
  assert.ok(relative(basis, arbeit).startsWith('emulator-lauf-test-'));
  rmSync(arbeit, { recursive: true, force: true });
});

const ausgabe = join(arbeit, 'argument-ausgabe');
const args = (api = '36', phase = 'a', ziel = ausgabe) => ['--api', api, '--ablauf', phase, '--ausgabe', ziel];

const rahmenFixture = JSON.parse(readFileSync(join(repo, 'scripts/emulator/fixtures/rahmen-api24-api30.json'), 'utf8'));
test('Emulatorkonsole erkennt die echte Windows-Ausgabe mit CR CR LF', () => {
  assert.equal(rahmenFixture.avdNameApi30, 'fr-api30\r\r\nOK\r\r\n');
  assert.equal(avdName(rahmenFixture.avdNameApi30), 'fr-api30');
  assert.equal(avdName('fr-api36\nOK\n'), 'fr-api36');
  assert.notEqual(avdName('KO: unknown command\r\r\n'), 'fr-api30');
});

test('API-24-Installation fordert keine nicht verfügbaren WebView- und UID-Metadaten', async () => {
  const original = rahmenFixture.api24;
  const calls = [];
  const ctx = { save() {}, shell: async command => {
    calls.push(command);
    return ({ 'getprop ro.build.fingerprint': original.fingerprint, 'dumpsys webviewupdate': original.webview,
      'pm list packages -f -U': original.packagesMitUid,
      // Nur dieser Fallback ist konstruiert: der echte Lauf kam nicht bis hier.
      'pm list packages -f': 'package:/system/app/WebView/WebView.apk=com.android.webview' })[command];
  } };
  const d = await geraeteDaten(ctx, 24, ['installation']);
  assert.equal(d.webviewVerfuegbar, false);
  assert.equal(d.paketUidsVerfuegbar, false);
  assert.ok(calls.includes('pm list packages -f'));
  await assert.rejects(geraeteDaten(ctx, 30, ['a']), /nicht vollständig lesbar/);
  await assert.rejects(geraeteDaten(ctx, 24, ['installation', 'a']), /nicht vollständig lesbar/);
});

test('Wiederverwendung und gezielte A8/A10-Läufe benötigen keinen Variantenbau', () => {
  assert.equal(argumente([...args('30', 'b'), '--varianten', arbeit], repo).variantenOrdner, echterPfad(arbeit));
  assert.deepEqual(variantePlan(['a8', 'a10']), []);
});

for (const [vorher, antworten, gueltig] of [
  ['null', ['1.0', 'null'], true], ['null', ['1.0', '1.0', '1.0'], true],
  ['null', ['1.3', '1.3', '1.3'], false], ['1.0', ['1.0'], true],
  ['1.3', ['1.0', '1.0', '1.0'], false], ['0', ['', '', ''], false],
]) test(`Schriftgröße ${vorher}: Rücklesen ${antworten.join('/')} wird ${gueltig ? 'belegt' : 'abgelehnt'}`, async () => {
  const calls = [], gelesen = [...antworten], belege = [];
  const ctx = { shell: async c => { calls.push(c); return c.startsWith('settings get') ? gelesen.shift() : ''; }, sleep: async () => {}, save: (_name, d) => belege.push(d) };
  const p = stelleEinstellungZurueck(ctx, 'system', 'font_scale', vorher);
  if (gueltig) assert.equal((await p).korrekt, true); else await assert.rejects(p, /nicht wiederhergestellt/);
  assert.equal(belege.at(-1).korrekt, gueltig);
  if (vorher === 'null') assert.equal(calls[0], 'settings put system font_scale 1.0');
});

for (const [api, phasen] of [
  ['36', ['a', 'a8', 'a10', 'b', 'netz', 'navigation', 'sicherung', 'alle']],
  ['30', ['a', 'a8', 'a10', 'b', 'netz', 'navigation', 'sicherung', 'fehlerseite', 'alle']],
  ['24', ['installation', 'alle']],
]) {
  test(`Argumente erlauben genau die vorgesehenen Phasen für API ${api}`, () => {
    for (const phase of phasen) {
      const o = argumente(args(api, phase), repo);
      assert.equal(o.api, Number(api));
      assert.equal(o.ablauf, phase);
      assert.equal(o.wipeData, false);
      assert.equal(o.ausgabe, echterPfad(ausgabe));
    }
  });
}

test('Alle wiederholt integrierte Netz- und Navigationsphasen nicht doppelt', () => {
  assert.deepEqual(argumente(args('36', 'alle'), repo).phasen, ['a', 'b', 'sicherung']);
  assert.deepEqual(argumente(args('30', 'alle'), repo).phasen, ['a', 'b', 'sicherung', 'fehlerseite']);
  assert.deepEqual(argumente(args('24', 'alle'), repo).phasen, ['installation']);
  assert.deepEqual(variantePlan(['a', 'b', 'netz', 'navigation', 'sicherung']), ['gegenprobe']);
  assert.deepEqual(variantePlan(['installation']), []);
  assert.deepEqual(variantePlan(['fehlerseite']), ['fehlerseite', 'ohne-fehlerseite']);
});

test('Wipe ist nur ausdrücklich aktiv und APK-Dateien bleiben getrennte Eingaben', () => {
  const debug = join(arbeit, 'andere-debug.apk'), release = join(arbeit, 'andere-release.apk');
  const o = argumente([...args(), '--wipe-data', '--apk-debug', debug, '--apk-release', release], repo);
  assert.equal(o.wipeData, true);
  assert.equal(o.debug, debug);
  assert.equal(o.release, release);
  assert.equal(argumente(args(), repo).debug, join(repo, 'app/android/app/build/outputs/apk/debug/app-debug.apk'));
  assert.equal(argumente(args(), repo).release, join(repo, 'app/android/app/build/outputs/apk/release/app-release-unsigned.apk'));
});

for (const [name, argv, muster] of [
  ['keine Argumente', [], /Pflichtargument fehlt: --api/],
  ['Ablauf fehlt', ['--api', '36', '--ausgabe', ausgabe], /Pflichtargument fehlt: --ablauf/],
  ['Ausgabe fehlt', ['--api', '36', '--ablauf', 'a'], /Pflichtargument fehlt: --ausgabe/],
  ['API-Wert fehlt', ['--api'], /Wert fehlt: --api/],
  ['Ausgabewert fehlt', ['--api', '36', '--ablauf', 'a', '--ausgabe'], /Wert fehlt: --ausgabe/],
  ['API 29', args('29'), /--api muss/],
  ['API 036', args('036'), /--api muss/],
  ['falscher Ablauf', args('36', 'unbekannt'), /nicht vorgesehen/],
  ['Fehlerseite auf API 36', args('36', 'fehlerseite'), /nicht vorgesehen/],
  ['Installation auf API 30', args('30', 'installation'), /nicht vorgesehen/],
  ['Oberfläche auf API 24', args('24', 'a'), /nicht vorgesehen/],
  ['unbekannter Schalter', [...args(), '--fremd'], /Unbekanntes Argument/],
  ['doppelte API', [...args(), '--api', '30'], /Argument doppelt/],
  ['doppelte Ausgabe', [...args(), '--ausgabe', ausgabe], /Argument doppelt/],
  ['doppeltes Wipe', [...args(), '--wipe-data', '--wipe-data'], /Argument doppelt/],
  ['Wipe mit Wert', [...args(), '--wipe-data', 'false'], /Unbekanntes Argument/],
]) test(`Argumentfehler: ${name}`, () => assert.throws(() => argumente(argv, repo), muster));

test('Nächste Repositorywurzel erlaubt ihren Scratchpad und sperrt andere eigene Pfade', () => {
  const haupt = join(arbeit, 'projekt'), worktree = join(haupt, '.worktrees/pruefung');
  mkdirSync(worktree, { recursive: true });
  const repos = [haupt, worktree];
  assert.equal(ausgabePruefen(join(worktree, 'scratchpad/lauf'), repos), echterPfad(join(worktree, 'scratchpad/lauf')));
  assert.equal(ausgabePruefen(join(haupt, 'scratchpad/lauf'), repos), echterPfad(join(haupt, 'scratchpad/lauf')));
  assert.equal(ausgabePruefen(join(arbeit, 'extern/lauf'), repos), echterPfad(join(arbeit, 'extern/lauf')));
  for (const verboten of [haupt, worktree, arbeit, join(haupt, 'docs/lauf'), join(worktree, 'scripts/lauf'), join(haupt, 'scratchpad-anders/lauf')]) {
    assert.throws(() => ausgabePruefen(verboten, repos), /Ausgaben im Repository|Repository oder dessen Vorfahr/);
  }
});

test('Vorhandene Junctions oder Symlinks können die Schreibgrenze nicht umgehen', t => {
  const ort = mkdtempSync(join(arbeit, 'links-'));
  const projekt = join(ort, 'projekt'), geschuetzt = join(projekt, 'docs'), scratch = join(projekt, 'scratchpad');
  mkdirSync(geschuetzt, { recursive: true }); mkdirSync(scratch);
  const link = join(scratch, 'link');
  try { symlinkSync(geschuetzt, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(e.code)) { t.skip(`Dateiverknüpfungen nicht verfügbar: ${e.code}`); return; } throw e; }
  assert.throws(() => ausgabePruefen(join(link, 'ausgabe'), [projekt]), /nur unter scratchpad/);
  assert.throws(() => schreiber(scratch)('link/datei.txt', 'verboten'), /Ungültiger Ausgabepfad/);
  assert.equal(existsSync(join(geschuetzt, 'datei.txt')), false);
  assert.throws(() => schreiber(scratch)('../docs/datei.txt', 'verboten'), /Ungültiger Ausgabepfad/);
  assert.equal(schreiber(scratch)('gut/datei.txt', 'zulässig'), join(scratch, 'gut/datei.txt'));
});

test('WebSocket muss als eingebaute Funktion vorhanden sein', () => {
  assert.doesNotThrow(() => websocketPruefen(function WebSocket() {}));
  assert.throws(() => websocketPruefen(null), /WebSocket fehlt/);
  assert.throws(() => websocketPruefen({}), /WebSocket fehlt/);
});

for (const arbeitScheitert of [false, true]) {
  test(`Aufräumen versucht jeden Schritt bei Arbeitsfehler=${arbeitScheitert}`, async () => {
    const aufrufe = [], berichtet = [];
    const arbeitFn = async () => { aufrufe.push('arbeit'); if (arbeitScheitert) throw new Error('Arbeitsfehler'); return 17; };
    const schritte = [
      ['App', async () => { aufrufe.push('App'); throw new Error('Deinstallation fehlgeschlagen'); }],
      ['Einstellungen', async () => { aufrufe.push('Einstellungen'); }],
      ['Emulator', async () => { aufrufe.push('Emulator'); throw new Error('Beenden fehlgeschlagen'); }],
      ['Weiterleitungen', async () => { aufrufe.push('Weiterleitungen'); }],
    ];
    const p = mitAufraeumen(arbeitFn, schritte, (name, e) => berichtet.push([name, e?.message ?? null]));
    if (arbeitScheitert) await assert.rejects(p, /Arbeitsfehler/); else assert.equal(await p, 17);
    assert.deepEqual(aufrufe, ['arbeit', 'App', 'Einstellungen', 'Emulator', 'Weiterleitungen']);
    assert.deepEqual(berichtet, [['App', 'Deinstallation fehlgeschlagen'], ['Einstellungen', null], ['Emulator', 'Beenden fehlgeschlagen'], ['Weiterleitungen', null]]);
  });
}

for (const [name, argv, meldung] of [
  ['fehlend', [], /Pflichtargument fehlt/],
  ['falsche API', args('23', 'installation', join(arbeit, 'cli-falsch-api')), /--api muss/],
  ['falscher Ablauf', args('24', 'a', join(arbeit, 'cli-falsch-ablauf')), /nicht vorgesehen/],
  ['doppelter Schalter', [...args('30', 'a', join(arbeit, 'cli-doppelt')), '--api', '30'], /Argument doppelt/],
  ['geschützter Ausgabepfad', args('30', 'a', join(repo, 'docs/emulator-test-verboten')), /nur unter scratchpad/],
]) {
  test(`CLI endet bei ${name} mit 64 vor allen Seiteneffekten`, () => {
    const ziel = argv[argv.indexOf('--ausgabe') + 1];
    const vor = ziel ? existsSync(ziel) : false;
    const r = spawnSync(process.execPath, [join(repo, 'scripts/emulator-lauf.mjs'), ...argv], {
      cwd: repo, env: { ...process.env, TEMP: basis, TMP: basis, ASTRO_TELEMETRY_DISABLED: '1', CI: '1' }, encoding: 'utf8', windowsHide: true, timeout: 20000,
    });
    assert.equal(r.status, 64, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, meldung);
    assert.match(r.stderr, /Aufruf: node scripts\/emulator-lauf.mjs/);
    assert.equal(r.stdout, '');
    if (ziel) assert.equal(existsSync(ziel), vor);
  });
}

function schreibe(datei, inhalt) { mkdirSync(dirname(datei), { recursive: true }); writeFileSync(datei, inhalt); }

function geraeteProbe({ installCode = 1, rootFehler = false, vorhandenerEmulator = false, uninstallFehler = false, wipeData = false, startFehler = false, avdErreichbar = true, logcatExit = false } = {}) {
  const ort = mkdtempSync(join(arbeit, 'geraet-'));
  const local = join(ort, 'local'), sdk = join(local, 'fristenrechner/android-sdk');
  const avd = join(local, 'fristenrechner/avd/fr-api24.avd');
  for (const tool of ['platform-tools/adb.exe', 'emulator/emulator.exe']) schreibe(join(sdk, tool), 'Wird niemals ausgeführt.');
  schreibe(join(avd, 'snapshots/alt.txt'), 'wird bei eigenem Emulator aufgeräumt');
  const debug = join(ort, 'eingang.apk'); schreibe(debug, 'APK-Testdatei');
  const optionen = { api: 24, ablauf: 'installation', phasen: ['installation'], ausgabe: join(ort, 'ausgabe'), debug, wipeData };
  const calls = []; let installiert = false, logcatChild;
  const ok = out => ({ code: 0, out, err: '' });
  const run = async (exe, argv, opts) => {
    calls.push({ art: 'run', exe, args: argv, opts });
    if (exe === 'taskkill.exe') {
      assert.deepEqual(argv, ['/PID', '12345', '/T', '/F']);
      return ok('Eigener nachgestellter Prozessbaum beendet.');
    }
    if (exe === 'tasklist.exe') return ok(vorhandenerEmulator ? '"emulator.exe","99"\n' : '');
    assert.equal(exe, join(sdk, 'platform-tools/adb.exe'));
    if (argv[0] === 'devices') return ok(vorhandenerEmulator ? 'List of devices attached\nemulator-5554 device\n' : 'List of devices attached\n');
    assert.deepEqual(argv.slice(0, 2), ['-s', 'emulator-5554']);
    const a = argv.slice(2);
    if (a[0] === 'root' || a[0] === 'wait-for-device') return ok('');
    if (a.join(' ') === 'emu avd name') return avdErreichbar ? ok('fr-api24\r\r\nOK\r\r\n') : { code: 1, out: '', err: 'noch nicht erreichbar' };
    if (a.join(' ') === 'emu kill') return ok('OK');
    if (a[0] === 'logcat') return ok('aufgezeichnet');
    if (a[0] === 'install') {
      if (logcatExit) logcatChild.emit('exit', 17, null);
      installiert = installCode === 0;
      return { code: installCode, out: installiert ? 'Success\n' : 'Failure [INSTALL_FAILED_OLDER_SDK: Requires newer sdk version #30]\n', err: '' };
    }
    if (a[0] === 'uninstall') {
      if (uninstallFehler) return { code: 1, out: '', err: 'nachgestellter Fehler' };
      installiert = false; return ok('Success\n');
    }
    assert.equal(a[0], 'shell', `Unerwarteter ADB-Aufruf: ${a.join(' ')}`);
    const c = a[1];
    if (c === 'getprop sys.boot_completed') { if (startFehler) throw new Error('Nachgestellter Startabbruch'); return ok('1'); }
    if (c === 'id') return ok(rootFehler ? 'uid=2000(shell)' : 'uid=0(root)');
    if (c === 'getprop ro.build.version.sdk') return ok('24');
    if (c === 'getprop ro.build.fingerprint') return ok('test/device/fingerprint');
    if (c === 'dumpsys webviewupdate') return ok('');
    if (c === 'pm list packages -f -U') return ok('Error: Unknown option: -U');
    if (c === 'pm list packages -f') return ok('package:/system/app/WebView/WebView.apk=com.android.webview');
    if (c.startsWith('pm list packages ')) return ok(installiert && c === `pm list packages ${APP}` ? `package:${APP}` : '');
    throw new Error(`Unbekannter nachgestellter Shell-Befehl: ${c}`);
  };
  const launch = (exe, argv, opts) => {
    calls.push({ art: 'launch', exe, args: argv, opts });
    assert.ok([join(sdk, 'platform-tools/adb.exe'), join(sdk, 'emulator/emulator.exe')].includes(exe));
    const child = new EventEmitter(); child.pid = 12345; child.exitCode = null;
    if (argv.includes('logcat')) { logcatChild = child; child.pid = 12346; }
    child.kill = () => { calls.push({ art: 'kill', exe }); return true; };
    return child;
  };
  const sleep = async ms => { calls.push({ art: 'sleep', ms }); };
  return { local, avd, optionen, run, launch, sleep, calls };
}

async function nachgestellterLauf(p) {
  const alt = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = p.local;
  try { return await lauf(p.optionen, { run: p.run, launch: p.launch, sleep: p.sleep }); }
  finally { if (alt === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = alt; }
}

test('Installationslauf startet nur ersetzte Prozesse und räumt in überprüfter Reihenfolge auf', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ wipeData: true });
  assert.equal(await nachgestellterLauf(p), 0);
  const result = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
  assert.equal(result.ergebnis, 'bestanden');
  assert.equal(result.aufraeumen.every(r => r.status === 'bestanden'), true);
  const emu = p.calls.find(c => c.art === 'launch' && c.exe.endsWith('emulator.exe'));
  for (const flag of ['-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-no-metrics', '-wipe-data']) assert.ok(emu.args.includes(flag));
  assert.equal(emu.args[emu.args.indexOf('-port') + 1], '5554');
  assert.equal(emu.opts.windowsHide, true);
  assert.ok(innen(p.optionen.ausgabe, emu.opts.env.TEMP));
  assert.equal(emu.opts.env.TEMP, emu.opts.env.TMP);
  const pos = predicate => p.calls.findIndex(predicate);
  const shell = text => c => c.art === 'run' && c.args?.includes(text);
  assert.ok(pos(shell('getprop sys.boot_completed')) < pos(shell('id')));
  assert.ok(pos(shell('id')) < pos(c => c.art === 'run' && c.args.includes('install')));
  assert.ok(pos(c => c.art === 'run' && c.args.includes('install')) < pos(c => c.art === 'kill'));
  assert.ok(pos(c => c.art === 'kill') < pos(c => c.art === 'run' && c.args.join(' ').endsWith('emu kill')));
  assert.equal(existsSync(join(p.avd, 'snapshots')), false);
  assert.ok(existsSync(join(p.optionen.ausgabe, 'zusammenfassung.txt')));
  assert.equal(p.calls.some(c => c.art === 'run' && c.args.includes('uninstall')), false);
});

test('Unerwartet erfolgreiche Installation wird beanstandet und wieder deinstalliert', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ installCode: 0 });
  assert.equal(await nachgestellterLauf(p), 1);
  assert.ok(p.calls.some(c => c.art === 'run' && c.args.includes('uninstall')));
  const emu = p.calls.find(c => c.art === 'launch' && c.exe.endsWith('emulator.exe'));
  assert.equal(emu.args.includes('-wipe-data'), false);
  assert.equal(existsSync(join(p.avd, 'snapshots')), false);
});

test('Deinstallationsfehler verhindert die nachfolgenden Aufräumschritte nicht', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ installCode: 0, uninstallFehler: true });
  assert.equal(await nachgestellterLauf(p), 1);
  const r = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
  assert.equal(r.aufraeumen.find(a => a.name === 'App deinstallieren').status, 'nicht bestanden');
  assert.equal(r.aufraeumen.find(a => a.name === 'Emulator beenden').status, 'bestanden');
  assert.equal(r.aufraeumen.find(a => a.name === 'Snapshots löschen').status, 'bestanden');
});

test('Rahmenfehler nach Systemstart räumt den eigenen Emulator auf und ergibt ungültig', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ rootFehler: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(p.calls.some(c => c.art === 'run' && c.args.includes('install')), false);
  assert.ok(p.calls.some(c => c.art === 'run' && c.args.join(' ').endsWith('emu kill')));
  assert.equal(existsSync(join(p.avd, 'snapshots')), false);
});

test('Vorhandener Emulator verhindert Start und bleibt unberührt', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ vorhandenerEmulator: true });
  assert.equal(await nachgestellterLauf(p), 2);
  assert.equal(p.calls.some(c => c.art === 'launch' || c.art === 'kill'), false);
  assert.equal(p.calls.some(c => c.args?.includes('emu') || c.args?.includes('install')), false);
  assert.equal(existsSync(join(p.avd, 'snapshots/alt.txt')), true);
});

test('Vorhandene Laufbelege werden ohne Prozessstart zurückgewiesen', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe();
  const beleg = join(p.optionen.ausgabe, 'ergebnis.json');
  schreibe(beleg, 'bestehender Beleg');
  await assert.rejects(nachgestellterLauf(p), /Ausgabeordner ist nicht leer/);
  assert.equal(readFileSync(beleg, 'utf8'), 'bestehender Beleg');
  assert.deepEqual(p.calls, []);
});

for (const avdErreichbar of [true, false]) {
  test(`Startfehler vor Gerätezuordnung räumt über ${avdErreichbar ? 'AVD-Identität' : 'eigene Prozesskennung'} auf`, { skip: process.platform !== 'win32' }, async () => {
    const p = geraeteProbe({ startFehler: true, avdErreichbar });
    assert.equal(await nachgestellterLauf(p), 2);
    const r = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
    assert.equal(r.befund.find(b => b.id === 'Laufrahmen').status, 'ungültig');
    assert.match(r.befund.find(b => b.id === 'Laufrahmen').grund, /Startabbruch/);
    assert.equal(r.aufraeumen.find(a => a.name === 'Emulator beenden').status, 'bestanden');
    assert.equal(p.calls.some(c => c.art === 'run' && c.args?.includes('install')), false);
    assert.equal(p.calls.some(c => c.art === 'run' && c.args?.includes('id')), false);
    assert.equal(p.calls.some(c => c.art === 'run' && c.exe === 'taskkill.exe'), !avdErreichbar);
    assert.equal(p.calls.some(c => c.art === 'run' && c.args?.join(' ').endsWith('emu kill')), avdErreichbar);
    assert.equal(existsSync(join(p.avd, 'snapshots')), false);
  });
}

test('Vorzeitig beendetes logcat macht die ansonsten erfolgreiche Messung ungültig', { skip: process.platform !== 'win32' }, async () => {
  const p = geraeteProbe({ logcatExit: true });
  assert.equal(await nachgestellterLauf(p), 2);
  const r = JSON.parse(readFileSync(join(p.optionen.ausgabe, 'ergebnis.json'), 'utf8'));
  assert.equal(r.befund.find(b => b.id === 'ablauf-installation').status, 'bestanden');
  assert.equal(r.befund.find(b => b.id === 'Logcat').status, 'ungültig');
  assert.match(r.befund.find(b => b.id === 'Logcat').grund, /endete vor dem Aufräumen.*Code 17/);
  assert.equal(r.aufraeumen.find(a => a.name === 'Emulator beenden').status, 'bestanden');
  assert.equal(existsSync(join(p.avd, 'snapshots')), false);
});

test('Abbruchsignal beendet nur den gestarteten Node-Prozesslauf und meldet Unterbrechung', async () => {
  const controller = new AbortController();
  const pending = prozess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    env: { ...process.env, TEMP: basis, TMP: basis }, timeoutMs: 10000, signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(), 150);
  try {
    const r = await pending;
    assert.equal(r.code, null);
    assert.match(r.err, /Prozesslauf unterbrochen/);
    assert.doesNotMatch(r.err, /Zeitüberschreitung/);
  } finally { clearTimeout(timer); }
  const normal = await prozess(process.execPath, ['-e', 'process.stdout.write("fertig")'], { env: { ...process.env, TEMP: basis, TMP: basis }, timeoutMs: 10000 });
  assert.equal(normal.code, 0);
  assert.equal(normal.out, 'fertig');
});
