// Tests der Argumente und Ablaufsteuerung, ohne Astro, Capacitor oder Gradle zu starten.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { androidQuellen, argumente, baue, findeNpm, pruefeBuildHinweise } from './app-bauen.mjs';
import { pruefeProjekt } from './check-licenses.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad', 'test-app-bauen');
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
  const vorher = { wurzel: ort, status: [], dateien: [] };
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
    hinweisePruefung: () => [],
    pruefungen: {
      pruefeKonfiguration: (...args) => pruefung('K1', args),
      pruefeDist: (...args) => ({ fehler: pruefung('K2', args), bericht: { dateien: 2, besonderheit: 'Bericht der Gegenprobe' } }),
      leseAndroidZustand: (...args) => {
        const fehler = pruefung('Zustand', args);
        if (fehler.length) throw new Error(fehler.join('\n'));
        return vorher;
      },
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
  return { ort, npm, config, schritte, prozesse, meldungen, fehler, pruefaufrufe, vorher, optionen };
}

test('Argumente: Android verwendet ohne weitere Angaben assembleDebug', () => {
  assert.deepEqual(argumente(['--android']), { modus: 'android', aufgabe: 'assembleDebug', streng: false, bericht: false, ohneTestgruppe: false });
});

for (const aufgabe of ['assembleDebug', 'assembleRelease', ':app:assembleDebug', ':app:assembleRelease']) {
  test(`Argumente: ${aufgabe}, streng und Bericht auch vor dem Arbeitsgang`, () => {
    assert.deepEqual(argumente(['--streng', '--aufgabe', aufgabe, '--bericht', '--android']), { modus: 'android', aufgabe, streng: true, bericht: true, ohneTestgruppe: false });
  });
}

for (const [args, grund] of [
  [[], /Arbeitsgang fehlt/],
  [['--unbekannt'], /Unbekanntes Argument/],
  [['--web', '--android'], /Genau einen Arbeitsgang/],
  [['--android', '--android'], /mehrfach/],
  [['--android', '--streng', '--streng'], /mehrfach/],
  [['--android', '--ohne-testgruppe', '--ohne-testgruppe'], /mehrfach/],
  ...['--web', '--check', '--pruefen', '--android-quellen'].map((modus) => [[modus, '--ohne-testgruppe'], /nur mit --android/]),
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
    assert.equal(p.fehler.filter((text) => text.startsWith('Aufruf:')).length, 1);
    assert.deepEqual(p.schritte, []);
    t.diagnostic(p.fehler.join('\n'));
  });
}

const reihenfolge = ['Kern', 'Astro', 'K1', 'K2', 'Zustand', 'Sync', 'K3', 'K4', 'Gradle', 'K5'];
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
      { name: 'Zustand', args: [{ wurzel: p.ort, umgebung: p.prozesse[0].env }] },
      { name: 'K3', args: [{ wurzel: p.ort, umgebung: p.prozesse[0].env }] },
      { name: 'K4', args: [{ wurzel: p.ort, umgebung: p.prozesse[0].env }] },
      { name: 'K5', args: [join(p.ort, 'app', 'android', 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release-unsigned.apk'), { wurzel: p.ort, debug, umgebung: p.prozesse[0].env }] },
    ]);
    assert.ok(p.meldungen.some((text) => text.includes('Bericht der Gegenprobe')));
  });
}

test('Android ohne --streng gibt den Schalter nicht an android-build weiter', () => {
  const p = probe();
  assert.equal(baue(['--android'], p.optionen), 0);
  assert.ok(!p.prozesse.at(-1).args.includes('--streng'));
  assert.ok(!p.prozesse.at(-1).args.includes('--ohne-testgruppe'));
  assert.equal(p.pruefaufrufe.find(({ name }) => name === 'K3').args[0].vorher, p.vorher);
});

test('Hinweise: Bündel nach K2, Pflichtbeleg nach Sync, Gradle-Modell nach Release-Build', () => {
  const p = probe();
  const aufrufe = [];
  p.optionen.hinweisePruefung = (wurzel, optionen) => {
    aufrufe.push({ wurzel, optionen, letzter: p.schritte.at(-1) });
    return [];
  };
  assert.equal(baue(['--android', '--aufgabe', ':app:assembleRelease'], p.optionen), 0);
  assert.deepEqual(aufrufe, [
    { wurzel: p.ort, optionen: { buendel: join(p.ort, 'app/.astro/module-client.json') }, letzter: 'K2' },
    { wurzel: p.ort, optionen: { nachAndroidSync: true }, letzter: 'K3' },
    { wurzel: p.ort, optionen: { nachAndroidSync: true, gradleModell: join(p.ort, 'app/android/app/build/intermediates/lint_vital_report_lint_model/release/generateReleaseLintVitalReportModel/release-artifact-dependencies.xml') }, letzter: 'Gradle' },
  ]);
  assert.ok(!p.meldungen.some(s => /Hinweise|Bündel|Gradle-Abgleich/.test(s)));
  assert.deepEqual(p.fehler, []);
});
test('Hinweise: fehlender oder abweichender Pflichtbeleg nach Sync stoppt vor Gradle', () => {
  const p = probe();
  p.optionen.hinweisePruefung = (_wurzel, o) => o.nachAndroidSync ? ['Hinweise Dritter: Gradle-Beleg fehlt oder weicht ab.'] : [];
  assert.equal(baue(['--android'], p.optionen), 1);
  assert.equal(p.schritte.at(-1), 'K3');
  assert.ok(!p.schritte.includes('Gradle'));
});

test('Build-Hinweise bleiben nach Ablauf der Pflegeausnahme unabhängig von der Systemuhr', t => {
  const Datum = globalThis.Date;
  t.mock.method(globalThis, 'Date', class extends Datum {
    constructor(...args) { super(...(args.length ? args : ['2027-09-30T00:00:00Z'])); }
  });
  assert.deepEqual(pruefeBuildHinweise(wurzel), []);
  assert.throws(() => pruefeProjekt(wurzel), /Einzelausnahme abgelaufen: rgbcolor/);
});
for (const modus of ['--web', '--android']) {
  test(`Hinweise: ${modus} bricht beim Bündelfehler nach K2 ab`, () => {
    const p = probe(); p.optionen.hinweisePruefung = () => ['Bündelabgleich: Gegenprobe'];
    assert.equal(baue([modus], p.optionen), 1);
    assert.deepEqual(p.schritte, ['Kern', 'Astro', 'K1', 'K2']);
    assert.deepEqual(p.fehler, ['Fehler: Bündelabgleich: Gegenprobe']);
  });
}
test('Hinweise: Gradle-Abgleich scheitert vor K5; Debug braucht kein Release-Modell', () => {
  const p = probe();
  p.optionen.hinweisePruefung = (_wurzel, o) => o.gradleModell ? ['Gradle-Abgleich: Gegenprobe'] : [];
  assert.equal(baue(['--android', '--aufgabe', 'assembleRelease'], p.optionen), 1);
  assert.equal(p.schritte.at(-1), 'Gradle');
  assert.deepEqual(p.fehler, ['Fehler: Gradle-Abgleich: Gegenprobe']);
  const d = probe();
  d.optionen.hinweisePruefung = (_wurzel, o) => { assert.ok(!o.gradleModell); return []; };
  assert.equal(baue(['--android'], d.optionen), 0);
});

test('Hinweise: fehlendes Release-Modell wird nach assembleRelease im selben Lauf gelesen und beendet die Kette', () => {
  const p = probe();
  p.optionen.hinweisePruefung = (_wurzel, o) => {
    if (o.gradleModell) {
      assert.equal(p.schritte.at(-1), 'Gradle');
      readFileSync(o.gradleModell);
    }
    return [];
  };
  assert.equal(baue(['--android', '--aufgabe', 'assembleRelease'], p.optionen), 1);
  assert.equal(p.schritte.at(-1), 'Gradle');
  assert.match(p.fehler.join('\n'), /ENOENT/);
  assert.ok(!p.schritte.includes('K5'));
});

test('Protokollentwertung: schon vor dem Kern-Build werden altes Protokoll und Zwischendatei entwertet', () => {
  const p = probe({ fehlerBei: 'Kern' });
  const datei = join(p.ort, 'app/.astro/module-client.json');
  schreibe(datei, '{"abgeschlossen":true}'); schreibe(datei + '.tmp', 'alt');
  assert.equal(baue(['--web'], p.optionen), 1);
  for (const pfad of [datei, datei + '.tmp']) assert.throws(() => readFileSync(pfad), { code: 'ENOENT' });
});

for (const streng of [false, true]) {
  test(`Android reicht --ohne-testgruppe weiter, streng=${streng}`, () => {
    const p = probe();
    const args = ['--ohne-testgruppe', '--android', ...(streng ? ['--streng'] : [])];
    assert.equal(argumente(args).ohneTestgruppe, true);
    assert.equal(baue(args, p.optionen), 0, p.fehler.join('\n'));
    assert.deepEqual(p.prozesse.at(-1).args, [
      join(p.ort, 'scripts', 'android-build.mjs'), '--projekt', 'app/android', '--aufgabe', 'assembleDebug',
      ...(streng ? ['--streng'] : []), '--ohne-testgruppe',
    ]);
    assert.deepEqual(p.schritte, reihenfolge);
  });
}

test('Android ohne --streng weist auf vorhandene Änderungen hin und reicht den Zustand an K3 weiter', (t) => {
  const p = probe();
  p.vorher.status.push(' M app/android/MainActivity.java', '?? app/android/Neu.java');
  assert.equal(baue(['--android'], p.optionen), 0, p.fehler.join('\n'));
  assert.deepEqual(p.schritte, reihenfolge);
  assert.match(p.meldungen.join('\n'), /Arbeitskopie unter app\/android enthält Änderungen:[\s\S]*MainActivity.java[\s\S]*Neu.java/);
  assert.equal(p.pruefaufrufe.find(({ name }) => name === 'K3').args[0].vorher, p.vorher);
  t.diagnostic(p.meldungen.find((text) => text.startsWith('Arbeitskopie')));
});

test('Android mit --streng lehnt vorhandene Änderungen vor dem Sync ab', (t) => {
  const p = probe();
  p.vorher.status.push(' M app/android/MainActivity.java');
  assert.equal(baue(['--android', '--streng'], p.optionen), 1);
  assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf('Sync')));
  assert.match(p.fehler.join('\n'), /git status.*vor dem Sync nicht leer:[\s\S]*MainActivity.java/);
  assert.ok(!p.fehler.some((text) => text.startsWith('Aufruf:')));
  t.diagnostic(p.fehler.join('\n'));
});

test('Android mit --streng prüft K3 nach dem Sync ohne Vorzustand', (t) => {
  const p = probe({ fehlerBei: 'K3' });
  assert.equal(baue(['--android', '--streng'], p.optionen), 1);
  assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf('K3') + 1));
  assert.ok(!Object.hasOwn(p.pruefaufrufe.find(({ name }) => name === 'K3').args[0], 'vorher'));
  t.diagnostic(p.fehler.join('\n'));
});

for (const schritt of reihenfolge) {
  test(`Ablauf Gegenprobe: ${schritt} meldet Fehler, kein Folgeschritt startet`, (t) => {
    const p = probe({ fehlerBei: schritt });
    assert.equal(baue(['--android'], p.optionen), 1);
    assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf(schritt) + 1));
    assert.match(p.fehler.join('\n'), schritt === 'Zustand' || (schritt.startsWith('K') && schritt !== 'Kern') ? new RegExp(`Gegenprobe ${schritt}`) : /Rückgabewert 7/);
    assert.ok(!p.fehler.some((text) => text.startsWith('Aufruf:')));
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
    assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf('Sync') + 1));
    assert.match(p.fehler.join('\n'), meldung);
    t.diagnostic(p.fehler.join('\n'));
  });
}

for (const schritt of ['K1', 'K2', 'Zustand', 'K3', 'K4', 'K5', 'Sync', 'Gradle']) {
  test(`Ablauf Gegenprobe: Ausnahme in ${schritt} beendet die Kette`, (t) => {
    const p = probe({ ausnahmeBei: schritt });
    assert.equal(baue(['--android'], p.optionen), 1);
    assert.deepEqual(p.schritte, reihenfolge.slice(0, reihenfolge.indexOf(schritt) + 1));
    assert.match(p.fehler.join('\n'), new RegExp(`Gegenprobe Ausnahme ${schritt}`));
    assert.ok(!p.fehler.some((text) => text.startsWith('Aufruf:')));
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

test('npm-Skript mit Node-Shebang neben Node wird gefunden', () => {
  const p = probe();
  const npm = join(p.ort, 'bin', 'npm');
  schreibe(npm, '#!/usr/bin/env node\n// Gegenprobe\n');
  assert.equal(findeNpm({}, join(p.ort, 'bin', 'node')), realpathSync(npm));
});

for (const name of ['PATH', 'Path']) {
  test(`npm Gegenprobe: fremde Node-Installation in ${name} wird nicht durchsucht`, (t) => {
    const p = probe();
    const basis = join(p.ort, 'fremd');
    schreibe(join(basis, 'npm'), '#!/usr/bin/env node\n// Gegenprobe\n');
    schreibe(join(basis, 'node_modules', 'npm', 'bin', 'npm-cli.js'), '// Gegenprobe');
    assert.throws(() => findeNpm({ [name]: basis }, join(p.ort, 'anders', 'node')), /npm nicht gefunden/);
    t.diagnostic('npm nicht gefunden; fremde Installation im Suchpfad bleibt unberücksichtigt.');
  });
}

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

test('Fehlendes Build-Werkzeug endet mit 1 ohne Hilfe und berührt nur die Probekopie', () => {
  const p = probe();
  p.optionen.umgebung.npm_execpath = join(p.ort, 'fehlt', 'npm-cli.js');
  assert.equal(baue(['--web'], p.optionen), 1);
  assert.match(p.fehler.join('\n'), /npm_execpath nennt eine fehlende Datei/);
  assert.doesNotMatch(p.fehler.join('\n'), /Aufruf:/);
});

test('Import startet keine Build-Kette und gibt keine Aufrufhilfe aus', () => {
  const lauf = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/app-bauen.mjs'); console.log('Import bestanden');"], {
    cwd: wurzel, encoding: 'utf8', env: { ...process.env, CI: '1', ASTRO_TELEMETRY_DISABLED: '1' },
  });
  assert.equal(lauf.status, 0, lauf.stderr);
  assert.equal(lauf.stdout.trim(), 'Import bestanden');
  assert.equal(lauf.stderr, '');
});
