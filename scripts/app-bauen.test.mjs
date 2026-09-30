// Tests der Argumente und Ablaufsteuerung, ohne Astro, Capacitor oder Gradle zu starten.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { androidQuellen, argumente, baue, findeNpm } from './app-bauen.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad', 'paket-2.5-c3');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'app-bauen-test-'));
test.after(() => {
  assert.ok(relative(basis, arbeit).startsWith('app-bauen-test-'));
  rmSync(arbeit, { recursive: true, force: true });
});

function schreibe(datei, inhalt) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, inhalt);
}

function probe({ fehlerBei, prozessFehler, ausnahmeBei, ohneApk = false } = {}) {
  const ort = mkdtempSync(join(arbeit, 'probe-'));
  const config = { webDir: 'dist', server: { errorPath: 'startfehler.html' } };
  schreibe(join(ort, 'app', 'capacitor.config.json'), JSON.stringify(config));
  const npm = join(ort, 'werkzeuge', 'npm-cli.js');
  schreibe(npm, '// Testdatei, wird nicht ausgeführt.');
  const schritte = [];
  const prozesse = [];
  const meldungen = [];
  const fehler = [];
  const pruefaufrufe = [];
  function pruefung(name, args) {
    schritte.push(name);
    pruefaufrufe.push({ name, args });
    if (ausnahmeBei === name) throw new Error(`Gegenprobe Ausnahme ${name}`);
    return fehlerBei === name ? [`Gegenprobe ${name}`] : [];
  }
  const optionen = {
    wurzel: ort,
    umgebung: { npm_execpath: npm, ASTRO_TELEMETRY_DISABLED: '0', CI: '0', ANDERES: 'bleibt' },
    node: process.execPath,
    ausgabe: (text) => meldungen.push(text),
    fehlerausgabe: (text) => fehler.push(text),
    pruefungen: {
      pruefeKonfiguration: (...args) => pruefung('K1', args),
      pruefeDist: (...args) => ({ fehler: pruefung('K2', args), bericht: { dateien: 2, besonderheit: 'Bericht der Gegenprobe' } }),
      pruefeSync: (...args) => pruefung('K3', args),
      pruefeGradle: (...args) => pruefung('K4', args),
      pruefeApk: (...args) => pruefung('K5', args),
    },
    spawn: (programm, args, opts) => {
      const name = args[0] === npm ? 'Kern' : args[0].endsWith('astro.mjs') ? (args[1] === 'check' ? 'Check' : 'Astro') : args[0].endsWith('capacitor') ? 'Sync' : 'Gradle';
      schritte.push(name);
      prozesse.push({ name, programm, args, ...opts });
      if (ausnahmeBei === name) throw new Error(`Gegenprobe Ausnahme ${name}`);
      if (fehlerBei === name) return prozessFehler ?? { status: 7 };
      if (name === 'Gradle' && !ohneApk) {
        const debug = args[args.indexOf('--aufgabe') + 1].endsWith('Debug');
        schreibe(join(ort, 'app', 'android', 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release-unsigned.apk'), 'APK-Gegenprobe');
      }
      return { status: 0 };
    },
  };
  return { ort, npm, config, schritte, prozesse, meldungen, fehler, pruefaufrufe, optionen };
}

test('Argumente: Android verwendet ohne weitere Angaben assembleDebug', () => {
  assert.deepEqual(argumente(['--android']), { modus: 'android', aufgabe: 'assembleDebug', streng: false, bericht: false });
});

for (const aufgabe of ['assembleDebug', 'assembleRelease', ':app:assembleDebug', ':app:assembleRelease']) {
  test(`Argumente: ${aufgabe}, streng und Bericht auch vor dem Arbeitsgang`, () => {
    assert.deepEqual(argumente(['--streng', '--aufgabe', aufgabe, '--bericht', '--android']), { modus: 'android', aufgabe, streng: true, bericht: true });
  });
}

for (const [args, grund] of [
  [[], /Arbeitsgang fehlt/],
  [['--unbekannt'], /Unbekanntes Argument/],
  [['--web', '--android'], /Genau einen Arbeitsgang/],
  [['--android', '--android'], /mehrfach/],
  [['--android', '--streng', '--streng'], /mehrfach/],
  [['--android', '--bericht', '--bericht'], /mehrfach/],
  [['--android', '--aufgabe'], /Wert für --aufgabe fehlt/],
  [['--android', '--aufgabe', '--streng'], /Wert für --aufgabe fehlt/],
  [['--android', '--aufgabe', 'assembleDebug', '--aufgabe', 'assembleRelease'], /mehrfach/],
  [['--android', '--aufgabe', 'clean'], /keine eindeutig zugeordnete APK/],
  [['--android', '--aufgabe', 'assemble'], /keine eindeutig zugeordnete APK/],
  [['--android', '--aufgabe', 'assembleDebug --scan'], /keine eindeutig zugeordnete APK/],
  [['--web', '--streng'], /nur mit --android/],
  [['--check', '--aufgabe', 'assembleRelease'], /nur mit --android/],
  [['--pruefen', '--streng'], /nur mit --android/],
  [['--android-quellen', '--aufgabe', 'assembleDebug'], /nur mit --android/],
]) {
  test(`Argumente Gegenprobe: ${args.join(' ') || '(leer)'}`, (t) => {
    const p = probe();
    assert.equal(baue(args, p.optionen), 1);
    assert.match(p.fehler.join('\n'), grund);
    assert.deepEqual(p.schritte, []);
    t.diagnostic(p.fehler.join('\n'));
  });
}

const reihenfolge = ['Kern', 'Astro', 'K1', 'K2', 'Sync', 'K3', 'K4', 'Gradle', 'K5'];
for (const aufgabe of ['assembleDebug', 'assembleRelease', ':app:assembleDebug', ':app:assembleRelease']) {
  test(`Android ${aufgabe}: vollständige Reihenfolge, Argumente, Umgebung und richtige APK`, () => {
    const p = probe();
    assert.equal(baue(['--android', '--aufgabe', aufgabe, '--streng', '--bericht'], p.optionen), 0, p.fehler.join('\n'));
    assert.deepEqual(p.schritte, reihenfolge);
    for (const lauf of p.prozesse) {
      assert.equal(lauf.programm, process.execPath);
      assert.equal(lauf.env.ASTRO_TELEMETRY_DISABLED, '1');
      assert.equal(lauf.env.CI, '1');
      assert.equal(lauf.env.ANDERES, 'bleibt');
      assert.equal(lauf.stdio, 'inherit');
    }
    assert.equal(p.optionen.umgebung.CI, '0');
    assert.equal(p.optionen.umgebung.ASTRO_TELEMETRY_DISABLED, '0');
    assert.deepEqual(p.prozesse.map(({ cwd }) => cwd), [p.ort, join(p.ort, 'app'), join(p.ort, 'app'), p.ort]);
    assert.deepEqual(p.prozesse.map(({ args }) => args), [
      [p.npm, 'run', 'build', '--workspace', 'packages/kern'],
      [join(p.ort, 'scripts', 'astro.mjs'), 'build'],
      [join(p.ort, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android'],
      [join(p.ort, 'scripts', 'android-build.mjs'), '--projekt', 'app/android', '--aufgabe', aufgabe, '--streng'],
    ]);
    const debug = aufgabe.endsWith('Debug');
    assert.deepEqual(p.pruefaufrufe, [
      { name: 'K1', args: [p.config, { publicOrdner: join(p.ort, 'app', 'public') }] },
      { name: 'K2', args: [join(p.ort, 'app', 'dist'), { fehlerseite: 'startfehler.html', quellOrdner: [join(p.ort, 'packages', 'kern', 'src'), join(p.ort, 'packages', 'oberflaeche', 'src')] }] },
      { name: 'K3', args: [{ wurzel: p.ort, umgebung: p.prozesse[0].env }] },
      { name: 'K4', args: [{ wurzel: p.ort }] },
      { name: 'K5', args: [join(p.ort, 'app', 'android', 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release-unsigned.apk'), { wurzel: p.ort, debug, umgebung: p.prozesse[0].env }] },
    ]);
    assert.ok(p.meldungen.some((text) => text.includes('Bericht der Gegenprobe')));
  });
}

test('Android ohne --streng gibt den Schalter nicht an android-build weiter', () => {
  const p = probe();
  assert.equal(baue(['--android'], p.optionen), 0);
  assert.ok(!p.prozesse.at(-1).args.includes('--streng'));
});

for (const schritt of reihenfolge) {
  test(`Ablauf Gegenprobe: ${schritt} meldet Fehler, kein Folgeschritt startet`, (t) => {
    const p = probe({ fehlerBei: schritt });
    assert.equal(baue(['--android'], p.optionen), 1);
    assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf(schritt) + 1));
    assert.match(p.fehler.join('\n'), schritt.startsWith('K') && schritt !== 'Kern' ? new RegExp(`Gegenprobe ${schritt}`) : /Rückgabewert 7/);
    t.diagnostic(p.fehler.join('\n'));
  });
}

for (const [name, prozessFehler, meldung] of [
  ['Startfehler', { status: null, error: { code: 'ENOENT' } }, /ENOENT/],
  ['Signalabbruch', { status: null, signal: 'SIGTERM' }, /Rückgabewert null/],
]) {
  test(`Ablauf Gegenprobe: ${name} wird zum Abbruch`, (t) => {
    const p = probe({ fehlerBei: 'Sync', prozessFehler });
    assert.equal(baue(['--android'], p.optionen), 1);
    assert.deepEqual(p.schritte, reihenfolge.slice(0, 5));
    assert.match(p.fehler.join('\n'), meldung);
    t.diagnostic(p.fehler.join('\n'));
  });
}

for (const schritt of ['K1', 'K2', 'K3', 'K4', 'K5', 'Sync', 'Gradle']) {
  test(`Ablauf Gegenprobe: Ausnahme in ${schritt} beendet die Kette`, (t) => {
    const p = probe({ ausnahmeBei: schritt });
    assert.equal(baue(['--android'], p.optionen), 1);
    assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf(schritt) + 1));
    assert.match(p.fehler.join('\n'), new RegExp(`Gegenprobe Ausnahme ${schritt}`));
    t.diagnostic(p.fehler.join('\n'));
  });
}

test('Ablauf Gegenprobe: erfolgreicher Gradle-Rückgabewert ohne APK reicht nicht', (t) => {
  const p = probe({ ohneApk: true });
  assert.equal(baue(['--android'], p.optionen), 1);
  assert.deepEqual(p.schritte, reihenfolge.slice(0, -1));
  assert.match(p.fehler.join('\n'), /Erzeugte APK fehlt/);
  t.diagnostic(p.fehler.join('\n'));
});

for (const [modus, erwartet] of [['--web', ['Kern', 'Astro', 'K1', 'K2']], ['--check', ['Check']], ['--pruefen', ['K1', 'K2']]]) {
  test(`${modus} führt nur die zugehörigen Schritte aus`, () => {
    const p = probe();
    assert.equal(baue([modus], p.optionen), 0);
    assert.deepEqual(p.schritte, erwartet);
  });
}

test('--check gibt einen Fehlercode von Astro zurück', (t) => {
  const p = probe({ fehlerBei: 'Check' });
  assert.equal(baue(['--check'], p.optionen), 1);
  assert.match(p.fehler.join('\n'), /Typprüfung der App ist gescheitert.*Rückgabewert 7/);
  t.diagnostic(p.fehler.join('\n'));
});

test('Ungültige Konfiguration beendet --pruefen vor K1', (t) => {
  const p = probe();
  schreibe(join(p.ort, 'app', 'capacitor.config.json'), '{');
  assert.equal(baue(['--pruefen'], p.optionen), 1);
  assert.deepEqual(p.schritte, []);
  assert.match(p.fehler.join('\n'), /JSON/);
  t.diagnostic(p.fehler.join('\n'));
});

const settings = "// Von Capacitor erzeugte Form\ninclude ':capacitor-android'\nproject(':capacitor-android').projectDir = new File('../../node_modules/@capacitor/android/capacitor')\n";
function quellenProbe(inhalt = settings) {
  const p = probe();
  const datei = join(p.ort, 'app', 'android', 'capacitor.settings.gradle');
  const quellOrdner = join(p.ort, 'node_modules', '@capacitor', 'android', 'capacitor');
  mkdirSync(quellOrdner, { recursive: true });
  schreibe(datei, inhalt);
  schreibe(join(quellOrdner, 'build', 'bleibt.txt'), 'bleibt');
  return { ...p, datei, quellOrdner };
}

test('--android-quellen gibt relative Quellordner aus, baut und löscht nichts', () => {
  const p = quellenProbe();
  assert.equal(baue(['--android-quellen'], p.optionen), 0, p.fehler.join('\n'));
  assert.deepEqual(p.meldungen, ['node_modules/@capacitor/android/capacitor']);
  assert.deepEqual(p.schritte, []);
  assert.equal(readFileSync(join(p.quellOrdner, 'build', 'bleibt.txt'), 'utf8'), 'bleibt');
  assert.equal(readFileSync(p.datei, 'utf8'), settings);
});

test('Android-Quellen lesen auch doppelte Anführungszeichen und CRLF', () => {
  const p = quellenProbe(settings.replaceAll("'", '"').replaceAll('\n', '\r\n'));
  assert.deepEqual(androidQuellen(p.ort), ['node_modules/@capacitor/android/capacitor']);
});

for (const [name, inhalt, grund] of [
  ['unbekannter Code', `${settings}throw new Error('nicht ausführen')\n`, /Unbekannte Zeilenform/],
  ['Interpolation', settings.replace('../../node_modules', '${andererOrdner}/node_modules'), /Unbekannte Zeilenform/],
  ['fehlende Zuordnung', "include ':capacitor-android'\n", /nicht vollständig zugeordnet/],
  ['fehlendes include', settings.replace("include ':capacitor-android'\n", ''), /nicht vollständig zugeordnet/],
  ['leere Datei', '', /nicht vollständig zugeordnet/],
  ['doppeltes include', `${settings}include ':capacitor-android'\n`, /Modul mehrfach/],
  ['doppelte Zuordnung', `${settings}${settings.split('\n')[2]}\n`, /Quellordner eines Moduls mehrfach/],
  ['Verlassen des Repositorys', settings.replace('../../node_modules/@capacitor/android/capacitor', '../../..'), /außerhalb des Repositorys/],
  ['fehlender Quellordner', settings.replace('/android/capacitor', '/fehlt/capacitor'), /ENOENT/],
]) {
  test(`Android-Quellen Gegenprobe: ${name}`, (t) => {
    const p = quellenProbe(inhalt);
    assert.equal(baue(['--android-quellen'], p.optionen), 1);
    assert.match(p.fehler.join('\n'), grund);
    assert.deepEqual(p.meldungen, []);
    assert.deepEqual(p.schritte, []);
    t.diagnostic(p.fehler.join('\n'));
  });
}

test('npm_execpath hat Vorrang', () => {
  const p = probe();
  assert.equal(findeNpm(p.optionen.umgebung, join(p.ort, 'fehlt', 'node')), p.npm);
});

test('Direkter Node-Aufruf findet npm aus dem Node-Archiv', () => {
  const p = probe();
  const npm = join(p.ort, 'werkzeuge', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  schreibe(npm, '// Gegenprobe');
  assert.equal(findeNpm({}, join(p.ort, 'werkzeuge', 'node.exe')), realpathSync(npm));
});

test('Direkter Node-Aufruf findet npm in einer Linux-Installation', () => {
  const p = probe();
  const npm = join(p.ort, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  schreibe(npm, '// Gegenprobe');
  assert.equal(findeNpm({}, join(p.ort, 'bin', 'node')), realpathSync(npm));
});

test('npm-Skript mit Node-Shebang im Suchpfad wird gefunden', () => {
  const p = probe();
  const npm = join(p.ort, 'bin', 'npm');
  schreibe(npm, '#!/usr/bin/env node\n// Gegenprobe\n');
  assert.equal(findeNpm({ PATH: dirname(npm) }, join(p.ort, 'anders', 'node')), realpathSync(npm));
});

test('npm Gegenprobe: Shell-Skript wird nicht an Node übergeben', (t) => {
  const p = probe();
  schreibe(join(p.ort, 'bin', 'npm'), '#!/bin/sh\nexit 0\n');
  assert.throws(() => findeNpm({}, join(p.ort, 'bin', 'node')), /npm nicht gefunden/);
  t.diagnostic('npm nicht gefunden.');
});

test('npm Gegenprobe: fehlender npm_execpath beendet den Ablauf vor dem Kern', (t) => {
  const p = probe();
  p.optionen.umgebung.npm_execpath = join(p.ort, 'gibt-es-nicht.js');
  assert.equal(baue(['--android'], p.optionen), 1);
  assert.deepEqual(p.schritte, []);
  assert.match(p.fehler.join('\n'), /npm_execpath nennt eine fehlende Datei/);
  t.diagnostic(p.fehler.join('\n'));
});

test('Programmaufruf mit ungültigen Argumenten endet mit 1 und Hilfe', () => {
  const lauf = spawnSync(process.execPath, [join(wurzel, 'scripts', 'app-bauen.mjs'), '--android', '--aufgabe', 'clean'], {
    encoding: 'utf8', env: { ...process.env, CI: '1', ASTRO_TELEMETRY_DISABLED: '1' },
  });
  assert.equal(lauf.status, 1);
  assert.match(lauf.stderr, /keine eindeutig zugeordnete APK/);
  assert.match(lauf.stderr, /Aufruf: node scripts\/app-bauen\.mjs/);
});
