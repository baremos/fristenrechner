// Aufruf: node --test scripts/signing.test.mjs
// Prüft scripts/werkzeuge.mjs, scripts/signing/signieren.mjs und scripts/signing/apk-signieren.mjs.
// Die Tests zum Signieren brauchen ein JDK 21, die Build-Tools und die Plattform aus
// dem Projekt-SDK. Fehlt eines davon, entfallen sie. Der Schlüssel der Tests entsteht
// in einem temporären Ordner und wird mit ihm gelöscht.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findeJdk, standardSdk, vergleiche, vorgabe, windows } from './werkzeuge.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const endung = windows ? '.exe' : '';
const scratchpad = resolve(hier, '../scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'signieren-'));
// Unveränderte Skriptkopien in einer eigenen Testwurzel: So bleiben alle Proben
// unter scratchpad und die Testschlüssel außerhalb des geschützten Testprojekts.
// Die Git-Suche endet vor dem umgebenden Repository; es entstehen keine Git-Daten.
const wurzel = join(arbeit, 'projekt');
for (const datei of ['signing/signieren.mjs', 'signing/apk-signieren.mjs', 'werkzeuge.mjs', 'toolchain.json']) {
  const ziel = join(wurzel, 'scripts', datei);
  mkdirSync(dirname(ziel), { recursive: true });
  copyFileSync(join(hier, datei), ziel);
}
const skript = join(wurzel, 'scripts/signing/apk-signieren.mjs');
const { Abbruch, geschuetzteOrdner, liegtIn, pruefeAusgabe, signiere: kern, werkzeugmeldung } =
  await import(pathToFileURL(join(wurzel, 'scripts/signing/signieren.mjs')).href);
const testUmgebung = { ...process.env, GIT_CEILING_DIRECTORIES: arbeit };
const imRepo = join(wurzel, 'scratchpad', `signieren-test-${process.pid}`);
const inDerWurzel = join(wurzel, `..signieren-test-${process.pid}.p12`);
test.after(() => {
  rmSync(arbeit, { recursive: true, force: true });
  rmSync(imRepo, { recursive: true, force: true });
  rmSync(inDerWurzel, { force: true });
});
const summe = (pfad) => createHash('sha256').update(readFileSync(pfad)).digest('hex');

// ---------- ohne Werkzeuge ----------

test('vergleiche ordnet Versionen nach Zahlen', () => {
  assert.ok(vergleiche('21.0.12', '21.0.8') > 0);
  assert.ok(vergleiche('8.14.5', '8.14.10') < 0);
  assert.equal(vergleiche('35.0.0', '35'), 0);
  assert.equal(vergleiche('24.21.0', '24.21.0'), 0);
});

test('findeJdk meldet ein übersprungenes JAVA_HOME und sucht weiter', () => {
  const ohne = findeJdk({ ...process.env, JAVA_HOME: '' });
  const mit = findeJdk({ ...process.env, JAVA_HOME: join(tmpdir(), 'gibt-es-nicht') });
  assert.equal(mit.uebersprungen.length, 1);
  assert.match(mit.uebersprungen[0], /^JAVA_HOME \(.*gibt-es-nicht\): java fehlt$/);
  assert.equal(mit.pfad, ohne.pfad);
});

test('standardSdk liegt im Benutzerbereich und endet auf den festgelegten Ordner', () => {
  const ort = standardSdk({ LOCALAPPDATA: join(tmpdir(), 'lokal'), XDG_DATA_HOME: join(tmpdir(), 'lokal') });
  assert.equal(ort, join(tmpdir(), 'lokal', ...vorgabe.android.sdkOrdner.split('/')));
});

test('liegtIn: Namen mit führenden Punkten sind kein Aufstieg', () => {
  const ordner = join(tmpdir(), 'repo');
  assert.equal(liegtIn(ordner, ordner), true);
  assert.equal(liegtIn(ordner, join(ordner, 'schluessel.p12')), true);
  assert.equal(liegtIn(ordner, join(ordner, '..geheim')), true);
  assert.equal(liegtIn(ordner, join(ordner, '..geheim', 'schluessel.p12')), true);
  assert.equal(liegtIn(ordner, join(ordner, 'unter', '...', 'x')), true);
  assert.equal(liegtIn(ordner, join(tmpdir(), 'schluessel.p12')), false);
  assert.equal(liegtIn(ordner, join(tmpdir(), 'repo-daneben', 'x')), false);
  assert.equal(liegtIn(ordner, tmpdir()), false);
  if (windows) {
    assert.equal(liegtIn('C:\\dev\\repo', 'c:\\DEV\\Repo\\x.p12'), true);
    assert.equal(liegtIn('C:\\dev\\repo', 'D:\\dev\\repo\\x.p12'), false);
    assert.equal(liegtIn('C:\\dev\\repo', '\\\\rechner\\freigabe\\x.p12'), false);
  }
});

test('geschuetzteOrdner nimmt den Hauptordner und jeden Worktree auf', () => {
  const haupt = mkdtempSync(join(arbeit, 'haupt-'));
  const neben = mkdtempSync(join(arbeit, 'neben-'));
  const git = () => ({ status: 0, stdout: `worktree ${haupt}\nHEAD 0123\nbranch refs/heads/main\n\nworktree ${neben}\nHEAD 4567\n\nworktree ${join(arbeit, 'gibt-es-nicht')}\n` });
  const mit = geschuetzteOrdner(git, haupt);
  assert.equal(mit.mitGit, true);
  assert.equal(mit.ordner.length, 2);
  assert.ok(mit.ordner.some((o) => liegtIn(o, join(neben, 'schluessel.p12'))));
  const ohne = geschuetzteOrdner(() => ({ status: 128, stdout: '' }), haupt);
  assert.equal(ohne.mitGit, false);
  assert.equal(ohne.ordner.length, 1);
  const fehlt = geschuetzteOrdner(() => ({ status: null, error: new Error('ENOENT') }), haupt);
  assert.equal(fehlt.mitGit, false);
});

const FINGER = 'ab'.repeat(32);
const AUSGABE = [
  'Verifies',
  'Verified using v1 scheme (JAR signing): false',
  'Verified using v2 scheme (APK Signature Scheme v2): true',
  'Verified using v3 scheme (APK Signature Scheme v3): true',
  'Verified using v3.1 scheme (APK Signature Scheme v3.1): false',
  'Verified using v4 scheme (APK Signature Scheme v4): false',
  'Verified for SourceStamp: false',
  'Number of signers: 1',
  'Signer #1 certificate DN: CN=Test, O=Probe, C=DE',
  `Signer #1 certificate SHA-256 digest: ${FINGER}`,
  'Signer #1 certificate SHA-1 digest: 00',
  'Signer #1 key algorithm: RSA',
  'Signer #1 key size (bits): 4096',
  `Signer #1 public key SHA-256 digest: ${'cd'.repeat(32)}`,
];
const mit = (aendern) => {
  const zeilen = [...AUSGABE];
  aendern(zeilen);
  return zeilen.join('\n');
};

test('pruefeAusgabe: Gutfall, auch mit Zeilenenden von Windows', () => {
  const ergebnis = pruefeAusgabe(AUSGABE.join('\r\n'), FINGER);
  assert.deepEqual(ergebnis.verfahren, { v1: false, v2: true, v3: true, 'v3.1': false, v4: false });
  assert.equal(ergebnis.zertifikat, FINGER);
  assert.equal(ergebnis.name, 'CN=Test, O=Probe, C=DE');
});

for (const [name, aendern, muster] of [
  ['v3.1 meldet true', (z) => { z[4] = z[4].replace('false', 'true'); }, /Signaturverfahren v3\.1: erwartet false/],
  ['zusätzliches Verfahren v3.2 mit true', (z) => z.splice(5, 0, 'Verified using v3.2 scheme (APK Signature Scheme v3.2): true'), /Unbekanntes Signaturverfahren in der Prüfung: v3\.2/],
  ['zusätzliches Verfahren v3.2 mit false', (z) => z.splice(5, 0, 'Verified using v3.2 scheme (APK Signature Scheme v3.2): false'), /Unbekanntes Signaturverfahren in der Prüfung: v3\.2/],
  ['zweite, widersprechende Zeile zu v2', (z) => z.splice(3, 0, 'Verified using v2 scheme (APK Signature Scheme v2): false'), /Signaturverfahren v2 ist doppelt genannt/],
  ['zweite, gleiche Zeile zu v3', (z) => z.push(z[3]), /Signaturverfahren v3 ist doppelt genannt/],
  ['Angabe zu v3.1 fehlt', (z) => z.splice(4, 1), /Signaturverfahren v3\.1: keine Angabe/],
  ['v1 meldet true', (z) => { z[1] = z[1].replace('false', 'true'); }, /Signaturverfahren v1: erwartet false/],
  ['v2 meldet false', (z) => { z[2] = z[2].replace('true', 'false'); }, /Signaturverfahren v2: erwartet true/],
  ['v4 meldet true', (z) => { z[5] = z[5].replace('false', 'true'); }, /Signaturverfahren v4: erwartet false/],
  ['Wert weder true noch false', (z) => { z[2] = z[2].replace('true', 'yes'); }, /Zeile der Prüfung nicht lesbar/],
  ['Zeile mit anderem Aufbau', (z) => z.push('Verified by magic: true'), /Zeile der Prüfung nicht lesbar/],
  ['SourceStamp meldet true', (z) => { z[6] = 'Verified for SourceStamp: true'; }, /SourceStamp/],
  ['SourceStamp doppelt', (z) => z.push('Verified for SourceStamp: false'), /SourceStamp ist doppelt/],
  ['Verifies fehlt', (z) => z.shift(), /nicht genau einmal/],
  ['Verifies doppelt', (z) => z.push('Verifies'), /nicht genau einmal/],
  ['zwei Signaturen', (z) => { z[7] = 'Number of signers: 2'; }, /nicht genau eine Signatur/],
  ['Zeilen eines zweiten Signierers', (z) => z.push('Signer #2 certificate DN: CN=Fremd'), /nicht genau eine Signatur/],
  ['Zahl der Signaturen doppelt', (z) => z.push('Number of signers: 1'), /steht 2-mal/],
  ['RSA mit 2048 Bit', (z) => { z[12] = 'Signer #1 key size (bits): 2048'; }, /nicht RSA mit 4096 Bit/],
  ['anderes Verfahren des Schlüssels', (z) => { z[11] = 'Signer #1 key algorithm: EC'; }, /nicht RSA mit 4096 Bit/],
  ['anderer Fingerabdruck', (z) => { z[9] = `Signer #1 certificate SHA-256 digest: ${'00'.repeat(32)}`; }, /Fingerabdruck des Zertifikats weicht ab/],
  ['Fingerabdruck doppelt', (z) => z.push(`Signer #1 certificate SHA-256 digest: ${FINGER}`), /steht 2-mal/],
  ['Warnung in der Ausgabe', (z) => z.push('WARNING: META-INF/x not protected by signature.'), /apksigner verify meldet: WARNING/],
  ['Fehler in der Ausgabe', (z) => z.push('ERROR: etwas'), /apksigner verify meldet: ERROR/],
  ['leere Ausgabe', (z) => z.splice(0, z.length), /nicht genau einmal/],
]) {
  test(`pruefeAusgabe scheitert: ${name}`, () => {
    assert.throws(() => pruefeAusgabe(mit(aendern), FINGER), (fehler) => fehler instanceof Abbruch && fehler.code === 1 && muster.test(fehler.message));
  });
}

test('pruefeAusgabe scheitert: Text auf der Fehlerausgabe', () => {
  for (const daneben of ['WARNING: etwas', 'ERROR: etwas', 'irgendein Hinweis', '\n\n  spät  \n']) {
    assert.throws(() => pruefeAusgabe(AUSGABE.join('\n'), FINGER, daneben),
      (fehler) => fehler instanceof Abbruch && fehler.code === 1 && /schreibt auf die Fehlerausgabe/.test(fehler.message), daneben);
  }
  assert.equal(pruefeAusgabe(AUSGABE.join('\n'), FINGER, '\r\n  \n').zertifikat, FINGER);
});

test('werkzeugmeldung: ohne Stacktrace, ohne private Pfade, höchstens drei Zeilen', () => {
  const ort = join(tmpdir(), 'privat', 'kennwort.txt');
  const zeilen = werkzeugmeldung({
    stdout: 'Zeile auf der Ausgabe\n',
    stderr: ['Failed to load signer "signer #1"',
      `java.io.IOException: Failed to read Keystore password for signer #1 : end of file reached in ${ort}`,
      '\tat com.android.apksigner.PasswordRetriever.getPasswords(PasswordRetriever.java:175)',
      '\tat com.android.apksigner.ApkSignerTool.main(ApkSignerTool.java:94)',
      'Caused by: java.lang.Exception: Grund', '\t... 9 more', 'vierte Zeile'].join('\r\n'),
  }, [[ort, '<Kennwortdatei>'], [null, '<fehlt>']]);
  assert.deepEqual(zeilen, ['Failed to load signer "signer #1"',
    'java.io.IOException: Failed to read Keystore password for signer #1 : end of file reached in <Kennwortdatei>',
    'Caused by: java.lang.Exception: Grund']);
  assert.deepEqual(werkzeugmeldung({ stdout: null, stderr: undefined }), []);
});

// Der Arbeitsordner eines Laufs entsteht im Temp-Ordner. Die Tests geben dem Skript
// einen eigenen vor, damit sich prüfen lässt, was liegen bleibt.
const tempFuer = (name) => {
  const ordner = join(arbeit, `temp-${name}`);
  mkdirSync(ordner, { recursive: true });
  return ordner;
};
const reste = (temp) => readdirSync(temp).filter((n) => n.startsWith('fristenrechner-signieren-')).map((n) => join(temp, n));

function aufruf(argumente, temp = tempFuer('allgemein')) {
  const lauf = spawnSync(process.execPath, [skript, ...argumente], { encoding: 'utf8', cwd: wurzel,
    env: { ...testUmgebung, TEMP: temp, TMP: temp, TMPDIR: temp } });
  return { code: lauf.status, text: `${lauf.stdout}${lauf.stderr}` };
}

for (const [name, argumente, muster] of [
  ['Kennwort als Argument mit Wert dahinter', ['--kennwort', 'geheim-4711'], /^Fehler: Unbekanntes Argument: --kennwort\s*$/],
  ['Kennwort als Argument mit Gleichheitszeichen', ['--kennwort=geheim-4711'], /^Fehler: Unbekanntes Argument: --kennwort\s*$/],
  ['Wert ohne Namen', ['geheim-4711'], /^Fehler: Unbekanntes Argument an Stelle 1\.\s*$/],
  ['Name in Großbuchstaben mit Wert', ['--APK=geheim-4711'], /^Fehler: Unbekanntes Argument an Stelle 1\.\s*$/],
]) {
  test(`Aufruf: ${name}, die Meldung nennt den Wert nicht`, () => {
    const { code, text } = aufruf(argumente);
    assert.equal(code, 64, text);
    assert.match(text, muster);
    assert.ok(!text.includes('geheim-4711'));
  });
}

test('Aufruf: Pflichtangabe fehlt, Wert fehlt, Angabe doppelt', () => {
  assert.match(aufruf(['--apk', 'a', '--aus', 'b', '--schluessel', 'c', '--alias', 'd']).text, /--fingerabdruck fehlt/);
  assert.match(aufruf(['--apk', 'a', '--alias']).text, /Zu --alias fehlt der Wert/);
  assert.match(aufruf(['--apk', 'a', '--alias', '']).text, /Zu --alias fehlt der Wert/);
  assert.match(aufruf(['--apk', 'a', '--apk', 'b']).text, /--apk ist doppelt angegeben/);
  assert.equal(aufruf([]).code, 64);
});

// ---------- mit Werkzeugen ----------

const jdk = findeJdk();
const sdk = process.env.ANDROID_HOME ?? standardSdk();
const werkzeuge = join(sdk, 'build-tools', vorgabe.android.buildTools);
const plattform = join(sdk, 'platforms', `android-${vorgabe.android.compileSdk}`, 'android.jar');
const fehlt = !jdk.pfad ? 'JDK 21 fehlt'
  : !existsSync(join(werkzeuge, 'lib', 'apksigner.jar')) || !existsSync(join(werkzeuge, `aapt2${endung}`)) ? `Build-Tools ${vorgabe.android.buildTools} fehlen`
    : !existsSync(plattform) ? `Plattform android-${vorgabe.android.compileSdk} fehlt`
      : false;
const nurMitWerkzeug = { skip: fehlt };

let schluessel;
let kennwort;
let fingerabdruck;
let apk;
let unausgerichtet;

function vorbereiten() {
  if (schluessel) return;
  kennwort = join(arbeit, 'kennwort.txt');
  writeFileSync(kennwort, 'nur-fuer-den-test-1234');
  const datei = join(arbeit, 'test.p12');
  const keytool = join(jdk.pfad, 'bin', `keytool${endung}`);
  let lauf = spawnSync(keytool, ['-genkeypair', '-alias', 'test', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '2',
    '-storetype', 'PKCS12', '-keystore', datei, '-storepass:file', kennwort, '-dname', 'CN=Test, O=Probe, C=DE'], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  lauf = spawnSync(keytool, ['-list', '-v', '-storetype', 'PKCS12', '-keystore', datei, '-storepass:file', kennwort], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  fingerabdruck = /SHA256: ([0-9A-F:]{95})/.exec(lauf.stdout)[1];

  // Eine kleine echte APK ohne Code: aapt2 übersetzt das Manifest, zipalign richtet aus.
  const manifest = join(arbeit, 'AndroidManifest.xml');
  writeFileSync(manifest, [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="de.beispiel.signiertest">',
    `  <uses-sdk android:minSdkVersion="${vorgabe.android.minSdk}" android:targetSdkVersion="${vorgabe.android.targetSdk}" />`,
    '  <application android:label="Signiertest" android:hasCode="false" />',
    '</manifest>', ''].join('\n'));
  const roh = join(arbeit, 'probe-roh.apk');
  lauf = spawnSync(join(werkzeuge, `aapt2${endung}`), ['link', '-o', roh, '--manifest', manifest, '-I', plattform,
    '--version-code', '1', '--version-name', '1.0'], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  apk = join(arbeit, 'probe-unsigniert.apk');
  lauf = spawnSync(join(werkzeuge, `zipalign${endung}`), ['-p', '4', roh, apk], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);

  // Für die Gegenprobe zur Ausrichtung: ungepackte Einträge mit Namen verschiedener
  // Länge. Mindestens einer beginnt nicht an einer durch 4 teilbaren Stelle.
  const inhalt = join(arbeit, 'inhalt');
  mkdirSync(inhalt);
  for (const name of ['a.txt', 'bb.txt', 'ccc.txt', 'dddd.txt']) writeFileSync(join(inhalt, name), `${name}\n`);
  unausgerichtet = join(arbeit, 'probe-unausgerichtet.apk');
  lauf = spawnSync(join(jdk.pfad, 'bin', `jar${endung}`), ['--create', '--file', unausgerichtet, '--no-manifest', '--no-compress', '-C', inhalt, '.'], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  schluessel = datei;
}

// Über die Befehlszeile, wie ein Mensch das Skript aufruft.
function signiere(angaben, { ohne = [], temp } = {}) {
  vorbereiten();
  const vorgaben = { '--apk': apk, '--schluessel': schluessel, '--alias': 'test', '--fingerabdruck': fingerabdruck,
    '--kennwort-datei': kennwort, '--sdk': sdk, ...angaben };
  return aufruf(Object.entries(vorgaben).filter(([name]) => !ohne.includes(name)).flat(), temp);
}

// Über den Kern, mit einem Eingriff vor und nach jedem Aufruf eines Werkzeugs. So lassen
// sich Änderungen nachstellen, die ein anderer Vorgang während des Laufs vornimmt.
function mitEingriff(angaben, eingriff, { davor = () => undefined, temp = tempFuer('kern') } = {}) {
  vorbereiten();
  const meldungen = [];
  const aufrufe = [];
  const ausfuehren = (programm, argumente, optionen) => {
    aufrufe.push({ programm, argumente, optionen });
    davor(programm, argumente);
    const lauf = spawnSync(programm, argumente, { ...optionen, env: testUmgebung, stdio: 'pipe', encoding: 'utf8' });
    return eingriff(programm, argumente, lauf) ?? lauf;
  };
  try {
    const ergebnis = kern({ apk, schluessel, alias: 'test', fingerabdruck, kennwortDatei: kennwort, sdk, ...angaben },
      { ausfuehren, melde: (text) => meldungen.push(text), temp });
    return { ergebnis, meldungen, aufrufe };
  } catch (fehler) {
    return { fehler, meldungen, aufrufe };
  }
}
const eigenerOrdner = (name) => {
  const ordner = join(arbeit, name);
  mkdirSync(ordner);
  return ordner;
};
const ohneStacktrace = (text) => !/^\s+at\s/m.test(text) && !/\.java:\d+\)/.test(text);

test('Signieren: Gutfall', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(eigenerOrdner('gut'), 'gut.apk');
  const temp = tempFuer('gut');
  const vorher = summe(apk);
  const { code, text } = signiere({ '--aus': aus }, { temp });
  assert.equal(code, 0, text);
  assert.match(text, /Verfahren {2}v1 false, v2 true, v3 true, v3\.1 false, v4 false, Ausrichtung erhalten/);
  assert.match(text, new RegExp(`Fingerabdruck ${fingerabdruck.replaceAll(':', '').toLowerCase()}`));
  assert.match(text, /ERGEBNIS: signiert und geprüft\s*$/);
  assert.deepEqual(readdirSync(dirname(aus)), ['gut.apk']);
  assert.deepEqual(reste(temp), []);
  assert.equal(summe(apk), vorher);
  assert.ok(!text.includes(readFileSync(kennwort, 'utf8')), 'Das Kennwort steht in der Ausgabe.');
  assert.ok(!text.includes(schluessel), 'Der Ort der Schlüsseldatei steht in der Ausgabe.');
  assert.ok(!text.includes(kennwort), 'Der Ort der Kennwortdatei steht in der Ausgabe.');
  // Unabhängig vom Skript: apksigner prüft die veröffentlichte Datei.
  const lauf = spawnSync(join(jdk.pfad, 'bin', `java${endung}`), ['-jar', join(werkzeuge, 'lib', 'apksigner.jar'), 'verify', '-Werr', aus], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
});

test('Signieren: Fingerabdruck ohne Doppelpunkte und in kleinen Buchstaben', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(arbeit, 'gut-klein.apk');
  const { code, text } = signiere({ '--aus': aus, '--fingerabdruck': fingerabdruck.replaceAll(':', '').toLowerCase() });
  assert.equal(code, 0, text);
  assert.ok(existsSync(aus));
});

test('Signieren: zwei Läufe ergeben dieselbe Datei', nurMitWerkzeug, () => {
  const eins = join(arbeit, 'gleich-1.apk');
  const zwei = join(arbeit, 'gleich-2.apk');
  assert.equal(signiere({ '--aus': eins }).code, 0);
  assert.equal(signiere({ '--aus': zwei }).code, 0);
  assert.equal(summe(eins), summe(zwei));
});

test('Signieren: falscher Fingerabdruck, die ungeprüfte Datei bleibt im eigenen Ordner liegen', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('falsch'), 'falsch.apk');
  const temp = tempFuer('falsch');
  const { code, text } = signiere({ '--aus': aus, '--fingerabdruck': '0'.repeat(64) }, { temp });
  assert.equal(code, 1, text);
  assert.match(text, /Der Fingerabdruck des Zertifikats weicht ab/);
  assert.deepEqual(readdirSync(dirname(aus)), []);
  const ordner = reste(temp);
  assert.equal(ordner.length, 1);
  assert.deepEqual(readdirSync(ordner[0]), ['falsch.apk.ungeprueft']);
  assert.ok(text.includes(join(ordner[0], 'falsch.apk.ungeprueft')), text);
});

test('Signieren: vorhandene Ausgabe wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('besteht'), 'besteht.apk');
  const temp = tempFuer('besteht');
  writeFileSync(aus, 'schon da');
  const { code, text } = signiere({ '--aus': aus }, { temp });
  assert.equal(code, 64, text);
  assert.match(text, /besteht schon/);
  assert.equal(readFileSync(aus, 'utf8'), 'schon da');
  assert.deepEqual(readdirSync(dirname(aus)), ['besteht.apk']);
  assert.deepEqual(reste(temp), []);
});

test('Signieren: eine fremde Datei mit der Endung .ungeprueft bleibt unberührt', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('rest'), 'rest.apk');
  writeFileSync(`${aus}.ungeprueft`, 'Rest eines früheren Laufs');
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 0, text);
  assert.equal(readFileSync(`${aus}.ungeprueft`, 'utf8'), 'Rest eines früheren Laufs');
  assert.deepEqual(readdirSync(dirname(aus)).sort(), ['rest.apk', 'rest.apk.ungeprueft']);
});

test('Signieren: falscher Alias, es bleibt nichts liegen, die Meldung nennt den Ort des Schlüssels nicht', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('alias'), 'alias.apk');
  const temp = tempFuer('alias');
  const { code, text } = signiere({ '--aus': aus, '--alias': 'gibtesnicht' }, { temp });
  assert.equal(code, 1, text);
  assert.match(text, /apksigner hat nicht signiert\./);
  assert.match(text, /apksigner: Failed to load signer "signer #1": <Schlüsseldatei> entry "gibtesnicht" does not contain a key/);
  assert.ok(!text.includes(schluessel), text);
  assert.ok(ohneStacktrace(text), text);
  assert.deepEqual(readdirSync(dirname(aus)), []);
  assert.deepEqual(reste(temp), []);
});

test('Signieren: leere Kennwortdatei, die Meldung nennt ihren Ort nicht und enthält keinen Stacktrace', nurMitWerkzeug, () => {
  const leer = join(eigenerOrdner('leer'), 'leeres-kennwort.txt');
  writeFileSync(leer, '');
  const aus = join(dirname(leer), 'leer.apk');
  const { code, text } = signiere({ '--aus': aus, '--kennwort-datei': leer });
  assert.equal(code, 1, text);
  assert.match(text, /apksigner hat nicht signiert\./);
  assert.match(text, /end of file reached in <Kennwortdatei>/);
  assert.ok(!text.includes(leer) && !text.includes('leeres-kennwort'), text);
  assert.ok(ohneStacktrace(text), text);
  assert.ok(!existsSync(aus));
});

test('Signieren: falsches Kennwort, die Meldung enthält keinen Stacktrace', nurMitWerkzeug, () => {
  const falsch = join(eigenerOrdner('kennwort'), 'falsches-kennwort.txt');
  writeFileSync(falsch, 'ein-anderes-kennwort-5678');
  const aus = join(dirname(falsch), 'kennwort.apk');
  const { code, text } = signiere({ '--aus': aus, '--kennwort-datei': falsch });
  assert.equal(code, 1, text);
  assert.match(text, /keystore password was incorrect/);
  assert.ok(!text.includes('ein-anderes-kennwort-5678') && !text.includes(falsch) && !text.includes(schluessel), text);
  assert.ok(ohneStacktrace(text), text);
  assert.ok(!existsSync(aus));
});

test('Signieren: Ausgabe gleich Eingabe', nurMitWerkzeug, () => {
  vorbereiten();
  const vorher = summe(apk);
  const { code, text } = signiere({ '--aus': apk });
  assert.equal(code, 64, text);
  assert.equal(summe(apk), vorher);
});

test('Signieren: Schlüssel und Kennwort im Arbeitsordner werden abgelehnt', nurMitWerkzeug, () => {
  vorbereiten();
  mkdirSync(imRepo, { recursive: true });
  const drinnen = join(imRepo, 'schluessel.p12');
  copyFileSync(schluessel, drinnen);
  let lauf = signiere({ '--aus': join(arbeit, 'repo-1.apk'), '--schluessel': drinnen });
  assert.equal(lauf.code, 64, lauf.text);
  assert.match(lauf.text, /Die Schlüsseldatei liegt in einem Arbeitsordner des Repositorys/);
  const wort = join(imRepo, 'kennwort.txt');
  writeFileSync(wort, 'egal');
  lauf = signiere({ '--aus': join(arbeit, 'repo-2.apk'), '--kennwort-datei': wort });
  assert.equal(lauf.code, 64, lauf.text);
  assert.match(lauf.text, /Die Kennwortdatei liegt in einem Arbeitsordner des Repositorys/);
  assert.ok(!existsSync(join(arbeit, 'repo-1.apk')) && !existsSync(join(arbeit, 'repo-2.apk')));
});

test('Signieren: Schlüssel in der Wurzel mit zwei Punkten am Anfang des Namens wird abgelehnt', nurMitWerkzeug, () => {
  vorbereiten();
  copyFileSync(schluessel, inDerWurzel);
  const { code, text } = signiere({ '--aus': join(arbeit, 'punkte.apk'), '--schluessel': inDerWurzel });
  assert.equal(code, 64, text);
  assert.match(text, /Die Schlüsseldatei liegt in einem Arbeitsordner des Repositorys/);
});

test('Signieren: Schlüssel in einem anderen Worktree wird abgelehnt', nurMitWerkzeug, () => {
  const { fehler } = mitEingriff({ aus: join(arbeit, 'worktree.apk') }, (programm) => (programm === 'git'
    ? { status: 0, stdout: `worktree ${wurzel}\nHEAD 0123\n\nworktree ${arbeit}\nHEAD 4567\n` } : undefined));
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 64);
  assert.match(fehler.message, /Die Schlüsseldatei liegt in einem Arbeitsordner des Repositorys/);
  assert.ok(!existsSync(join(arbeit, 'worktree.apk')));
});

test('Signieren: ohne Auskunft von Git läuft das Skript und sagt es', nurMitWerkzeug, () => {
  const aus = join(arbeit, 'ohne-git.apk');
  const { ergebnis, fehler, meldungen } = mitEingriff({ aus }, (programm) => (programm === 'git' ? { status: 128, stdout: '' } : undefined));
  assert.equal(fehler, undefined, String(fehler));
  assert.equal(ergebnis.aus, aus);
  assert.ok(meldungen.some((m) => /Git gibt keine Auskunft/.test(m)));
});

test('Signieren: Pfad im Namensraum von Windows', { skip: fehlt || (windows ? false : 'nur unter Windows') }, () => {
  vorbereiten();
  const aus = join(arbeit, 'namensraum.apk');
  const { code, text } = signiere({ '--aus': aus, '--schluessel': `\\\\?\\${schluessel}` });
  assert.ok([0, 64, 66].includes(code), text);
  assert.ok(!/\n\s+at /.test(text), text);
});

test('Signieren: Eingabe ohne Ausrichtung wird abgelehnt', nurMitWerkzeug, () => {
  vorbereiten();
  const geprueft = spawnSync(join(werkzeuge, `zipalign${endung}`), ['-c', '4', unausgerichtet]);
  assert.notEqual(geprueft.status, 0, 'Die Probedatei ist wider Erwarten ausgerichtet.');
  const aus = join(eigenerOrdner('ausrichtung'), 'ausrichtung.apk');
  const { code, text } = signiere({ '--aus': aus, '--apk': unausgerichtet });
  assert.equal(code, 1, text);
  assert.match(text, /Die Ausrichtung der unsignierten Datei stimmt nicht/);
  assert.deepEqual(readdirSync(dirname(aus)), []);
});

test('Signieren: fehlende Eingabe', nurMitWerkzeug, () => {
  const { code, text } = signiere({ '--aus': join(arbeit, 'ohne.apk'), '--apk': join(arbeit, 'gibt-es-nicht.apk') });
  assert.equal(code, 66, text);
});

test('Signieren: Der Ordner der Ausgabe fehlt oder ist eine Datei', nurMitWerkzeug, () => {
  const ordner = eigenerOrdner('zielordner');
  const temp = tempFuer('zielordner');
  const stattOrdner = join(ordner, 'eine-datei');
  writeFileSync(stattOrdner, 'kein Ordner');
  for (const aus of [join(stattOrdner, 'aus.apk'), join(ordner, 'gibt-es-nicht', 'aus.apk')]) {
    const { code, text } = signiere({ '--aus': aus }, { temp });
    assert.equal(code, 66, text);
    assert.match(text, /^Fehler: Der Ordner für die signierte Datei fehlt oder ist kein Ordner\.\s*$/);
  }
  assert.deepEqual(readdirSync(ordner), ['eine-datei']);
  assert.deepEqual(reste(temp), []);
});

test('Signieren: Der Arbeitsordner lässt sich nicht anlegen', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('ohne-temp'), 'aus.apk');
  const { fehler } = mitEingriff({ aus }, () => undefined, { temp: join(arbeit, 'diesen-temp-gibt-es-nicht') });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 1);
  assert.match(fehler.message, /^Der Arbeitsordner lässt sich nicht anlegen \(ENOENT\)\.$/);
  assert.deepEqual(readdirSync(dirname(aus)), []);
});

test('Signieren: fehlendes SDK', nurMitWerkzeug, () => {
  const { code, text } = signiere({ '--aus': join(arbeit, 'sdk.apk'), '--sdk': join(arbeit, 'kein-sdk') });
  assert.equal(code, 69, text);
  assert.match(text, /Das Werkzeug fehlt/);
});

// ---------- Änderungen während des Laufs ----------

test('Vorprüfung: fehlende Schlüssel- und Kennwortdatei ergeben 66', nurMitWerkzeug, () => {
  for (const name of ['--schluessel', '--kennwort-datei']) {
    const aus = join(arbeit, `fehlt-${name}.apk`);
    const { code, text } = signiere({ '--aus': aus, [name]: join(arbeit, 'fehlt') });
    assert.equal(code, 66, text);
    assert.ok(!existsSync(aus));
  }
});

for (const feld of ['apk', 'schluessel', 'kennwortDatei']) {
  test(`Werkzeugfehler: ${feld} verschwindet unmittelbar vor sign, Code 1`, nurMitWerkzeug, () => {
    vorbereiten();
    const eingabe = join(eigenerOrdner(`vor-sign-${feld}`), 'eingabe');
    copyFileSync({ apk, schluessel, kennwortDatei: kennwort }[feld], eingabe);
    const aus = join(dirname(eingabe), 'aus.apk');
    let entfernt = false;
    const { fehler } = mitEingriff({ [feld]: eingabe, aus }, () => undefined, {
      davor: (_programm, argumente) => {
        if (argumente.includes('sign')) { rmSync(eingabe); entfernt = true; }
      },
    });
    assert.ok(entfernt);
    assert.ok(fehler instanceof Abbruch, String(fehler));
    assert.equal(fehler.code, 1);
    assert.match(fehler.message, /apksigner hat nicht signiert/);
    assert.ok(!existsSync(aus));
  });
}

for (const feld of ['schluessel', 'kennwortDatei']) {
  test(`Werkzeugfehler: simulierte Lesesperre für ${feld} ergibt 1`, nurMitWerkzeug, () => {
    vorbereiten();
    const aus = join(arbeit, `gesperrt-${feld}.apk`);
    const pfad = feld === 'schluessel' ? schluessel : kennwort;
    let simuliert = false;
    const { fehler } = mitEingriff({ aus }, (_programm, argumente) => {
      if (!argumente.includes('sign')) return;
      simuliert = true;
      return { status: 1, stdout: '', stderr: `java.io.FileNotFoundException: ${pfad} (Access is denied)` };
    });
    assert.ok(simuliert);
    assert.equal(fehler.code, 1);
    assert.match(fehler.message, /apksigner hat nicht signiert/);
    assert.ok(!fehler.message.includes(pfad));
    assert.ok(!existsSync(aus));
  });
}

for (const ersetzen of [false, true]) {
  test(`Ausgabeordner nach Vorprüfung ${ersetzen ? 'ersetzt' : 'entfernt'}: Code 1`, nurMitWerkzeug, () => {
    const ordner = eigenerOrdner(`ordner-spaet-${ersetzen}`);
    const aus = join(ordner, 'aus.apk');
    const { fehler } = mitEingriff({ aus }, (_programm, argumente) => {
      if (!argumente.includes('verify')) return;
      rmSync(ordner, { recursive: true });
      if (ersetzen) writeFileSync(ordner, 'fremde Datei');
    });
    assert.ok(fehler instanceof Abbruch, String(fehler));
    assert.equal(fehler.code, 1);
    assert.match(fehler.message, /Ausgabedatei lässt sich nicht anlegen/);
    assert.ok(!existsSync(aus));
    if (ersetzen) assert.equal(readFileSync(ordner, 'utf8'), 'fremde Datei');
  });
}

function dateisystemEingriff(t, methode, eingriff) {
  const original = fs[methode];
  t.mock.method(fs, methode, (...args) => eingriff(original, ...args));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

for (const fall of ['Teilschreiben', 'Leseprüfung', 'Prüfsumme']) {
  test(`Eigene Ausgabe bei Fehler entfernen: ${fall}`, nurMitWerkzeug, (t) => {
    const aus = join(eigenerOrdner(`schreibfehler-${fall}`), 'aus.apk');
    const temp = tempFuer(`schreibfehler-${fall}`);
    let fd;
    let teilGeschrieben = false;
    let ausgeloest = false;
    dateisystemEingriff(t, 'openSync', (original, pfad, ...args) => {
      const offen = original(pfad, ...args);
      if (pfad === aus) fd = offen;
      return offen;
    });
    if (fall === 'Teilschreiben') {
      dateisystemEingriff(t, 'writeSync', (original, datei, buffer, offset, laenge, position) => {
        if (datei !== fd) return original(datei, buffer, offset, laenge, position);
        if (!teilGeschrieben) {
          const geschrieben = original(datei, buffer, offset, 16, position);
          assert.equal(statSync(aus).size, 16);
          teilGeschrieben = true;
          return geschrieben;
        }
        ausgeloest = true;
        throw Object.assign(new Error('Simulierter voller Datenträger'), { code: 'ENOSPC' });
      });
    } else {
      dateisystemEingriff(t, 'readFileSync', (original, pfad, ...args) => {
        if (pfad !== aus) return original(pfad, ...args);
        ausgeloest = true;
        if (fall === 'Prüfsumme') return Buffer.from('abweichender Inhalt');
        throw Object.assign(new Error('Simulierter Lesefehler'), { code: 'EIO' });
      });
    }
    const { fehler } = mitEingriff({ aus }, () => undefined, { temp });
    assert.ok(ausgeloest);
    assert.ok(fehler instanceof Abbruch, String(fehler));
    assert.equal(fehler.code, 1);
    assert.match(fehler.message, /eigene Ausgabedatei ist wieder entfernt/);
    if (fall === 'Teilschreiben') assert.match(fehler.message, /ENOSPC/);
    assert.ok(!existsSync(aus));
    assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
    assert.equal(reste(temp).length, 1);
  });
}

test('Scheitert das Entfernen der eigenen Ausgabe, nennt der Fehler ihren Ort', nurMitWerkzeug, (t) => {
  const aus = join(eigenerOrdner('aufraeumfehler'), 'aus.apk');
  dateisystemEingriff(t, 'readFileSync', (original, pfad, ...args) => pfad === aus
    ? Buffer.from('abweichender Inhalt') : original(pfad, ...args));
  dateisystemEingriff(t, 'rmSync', (original, pfad, ...args) => {
    if (pfad === aus) throw Object.assign(new Error('Simulierte Sperre'), { code: 'EACCES' });
    return original(pfad, ...args);
  });
  const { fehler } = mitEingriff({ aus }, () => undefined);
  assert.equal(fehler.code, 1);
  assert.match(fehler.message, /unvollständige Ausgabe lässt sich nicht entfernen \(EACCES\)/);
  assert.ok(fehler.message.includes(aus));
  assert.ok(existsSync(aus));
});

test('Eingriff: Die Ausgabe entsteht während der Prüfung, sie wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('wettlauf-ziel'), 'ziel.apk');
  const temp = tempFuer('wettlauf-ziel');
  const { fehler } = mitEingriff({ aus }, (programm, argumente) => {
    if (argumente.includes('verify')) writeFileSync(aus, 'von jemand anderem');
  }, { temp });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 1);
  assert.match(fehler.message, /lässt sich nicht anlegen \(EEXIST\)/);
  assert.equal(readFileSync(aus, 'utf8'), 'von jemand anderem');
  assert.equal(reste(temp).length, 1);
});

test('Eingriff: Die signierte Datei wird nach der Prüfung ausgetauscht', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('wettlauf-tausch'), 'tausch.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente) => {
    const ziel = argumente.at(-1);
    if (argumente[0] === '-c' && ziel.endsWith('.ungeprueft')) writeFileSync(ziel, 'ausgetauschter Inhalt');
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.match(fehler.message, /während der Prüfung verändert/);
  assert.ok(!existsSync(aus));
});

test('Eingriff: Die signierte Datei wird während der Prüfung ausgetauscht', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('wettlauf-pruefung'), 'pruefung.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente) => {
    if (argumente.includes('verify')) writeFileSync(argumente.at(-1), 'ausgetauschter Inhalt');
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.ok(!existsSync(aus));
});

test('Eingriff: Die unsignierte Datei ändert sich während des Laufs', nurMitWerkzeug, () => {
  vorbereiten();
  const eingabe = join(eigenerOrdner('wettlauf-eingabe'), 'eingabe.apk');
  copyFileSync(apk, eingabe);
  const aus = join(dirname(eingabe), 'aus.apk');
  const { fehler } = mitEingriff({ apk: eingabe, aus }, (programm, argumente) => {
    if (argumente.includes('verify')) writeFileSync(eingabe, 'verändert');
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.match(fehler.message, /Die unsignierte Datei hat sich verändert/);
  assert.ok(!existsSync(aus));
});

test('Eingriff: Die unsignierte Datei verschwindet während des Laufs', nurMitWerkzeug, () => {
  vorbereiten();
  const eingabe = join(eigenerOrdner('wettlauf-weg'), 'eingabe.apk');
  copyFileSync(apk, eingabe);
  const aus = join(dirname(eingabe), 'aus.apk');
  const { fehler } = mitEingriff({ apk: eingabe, aus }, (programm, argumente) => {
    if (argumente.includes('verify')) rmSync(eingabe);
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 66);
  assert.match(fehler.message, /^Die unsignierte Datei lässt sich nicht lesen \(ENOENT\)\. Die ungeprüfte Datei bleibt liegen: /);
  assert.ok(!existsSync(aus));
});

// ---------- Ausgaben der Werkzeuge ----------

test('Ausgabe: apksigner nennt ein weiteres Verfahren', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('verfahren'), 'verfahren.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente, lauf) => (argumente.includes('verify')
    ? { ...lauf, stdout: lauf.stdout.replace('Verified using v4', 'Verified using v3.2 scheme (APK Signature Scheme v3.2): true\nVerified using v4') } : undefined));
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.match(fehler.message, /Unbekanntes Signaturverfahren in der Prüfung: v3\.2/);
  assert.ok(!existsSync(aus));
});

for (const zeile of ['WARNING: etwas ist ungeschützt', 'ERROR: etwas ist falsch']) {
  test(`Ausgabe: apksigner verify endet mit 0 und schreibt „${zeile}“ auf die Fehlerausgabe`, nurMitWerkzeug, () => {
    const aus = join(eigenerOrdner(`stderr-${zeile.slice(0, 4).toLowerCase()}`), 'aus.apk');
    const { fehler } = mitEingriff({ aus }, (programm, argumente, lauf) => (argumente.includes('verify') ? { ...lauf, stderr: `${zeile}\n` } : undefined));
    assert.ok(fehler instanceof Abbruch, String(fehler));
    assert.equal(fehler.code, 1);
    assert.ok(fehler.message.startsWith(`apksigner verify schreibt auf die Fehlerausgabe: ${zeile}`), fehler.message);
    assert.ok(!existsSync(aus));
  });
}

test('Ausgabe: apksigner verify endet mit 1, die Meldung nennt den Grund', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('verify-1'), 'aus.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente, lauf) => (argumente.includes('verify')
    ? { ...lauf, status: 1, stderr: 'WARNING: META-INF/x not protected by signature.\n' } : undefined));
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.ok(fehler.message.startsWith('apksigner verify scheitert: WARNING: META-INF/x not protected by signature.'), fehler.message);
  assert.ok(!existsSync(aus));
});

test('Ausgabe: apksigner verify lehnt die Datei ab, die Meldung nennt den Fehler', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(eigenerOrdner('verify-unsigniert'), 'aus.apk');
  // Nach dem Signieren liegt die unsignierte Datei an der Stelle der signierten und bleibt dort.
  const { fehler } = mitEingriff({ aus }, (programm, argumente) => {
    if (argumente.includes('sign')) copyFileSync(apk, argumente.at(-2));
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 1);
  assert.ok(fehler.message.startsWith('apksigner verify scheitert: ERROR: '), fehler.message);
  assert.ok(!existsSync(aus));
});

test('Ausgabe: Das Skript ruft apksigner verify mit -Werr ab API 24 auf, für die Datei, die es signiert hat', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('werr'), 'aus.apk');
  const { fehler, aufrufe } = mitEingriff({ aus }, () => undefined);
  assert.equal(fehler, undefined, String(fehler));
  const pruefungen = aufrufe.filter((a) => a.argumente.includes('verify'));
  assert.equal(pruefungen.length, 1);
  assert.ok(pruefungen[0].argumente.includes('-Werr'));
  const minSdkIndex = pruefungen[0].argumente.indexOf('--min-sdk-version');
  assert.ok(minSdkIndex >= 0);
  assert.equal(pruefungen[0].argumente[minSdkIndex + 1], '24');
  assert.equal(pruefungen[0].argumente.at(-1), aufrufe.find((a) => a.argumente.includes('sign')).argumente.at(-2));
});

test('Werkzeug Gegenprobe: v3 allein besteht verify ab API 24, die Ausgabeprüfung verlangt zusätzlich v2', nurMitWerkzeug, (t) => {
  vorbereiten();
  const ordner = eigenerOrdner('werkzeug-nur-v3');
  const java = join(jdk.pfad, 'bin', `java${endung}`);
  const jar = join(werkzeuge, 'lib', 'apksigner.jar');
  const nurV3 = join(ordner, 'nur-v3.apk');
  const signiert = spawnSync(java, ['-jar', jar, 'sign', '--ks', schluessel, '--ks-type', 'PKCS12', '--ks-key-alias', 'test', '--ks-pass', `file:${kennwort}`,
    '--v1-signing-enabled', 'false', '--v2-signing-enabled', 'false', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false', '--out', nurV3, apk], { encoding: 'utf8' });
  assert.equal(signiert.status, 0, `${signiert.stdout}${signiert.stderr}`);
  const lauf = spawnSync(java, ['-jar', jar, 'verify', '--verbose', '--print-certs', '-Werr', '--min-sdk-version', '24', nurV3], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  assert.match(lauf.stdout, /^Verified using v2 scheme .*: false$/m);
  assert.match(lauf.stdout, /^Verified using v3 scheme .*: true$/m);
  assert.throws(() => pruefeAusgabe(lauf.stdout, fingerabdruck.replaceAll(':', '').toLowerCase(), lauf.stderr), /Signaturverfahren v2: erwartet true, gefunden false/);
  t.diagnostic('Erwarteter Abbruch: Signaturverfahren v2: erwartet true, gefunden false.');
});

// Hält fest, worauf sich das Skript verlässt: Mit -Werr endet apksigner verify bei
// einer Warnung mit 1 und schreibt sie auf die Fehlerausgabe. Die Warnung entsteht
// hier durch einen Eintrag unter META-INF, den die Signatur v1 nicht schützt.
test('Werkzeug: apksigner verify -Werr endet bei einer Warnung mit 1', nurMitWerkzeug, () => {
  vorbereiten();
  const ordner = eigenerOrdner('werkzeug-werr');
  const java = join(jdk.pfad, 'bin', `java${endung}`);
  const jar = join(werkzeuge, 'lib', 'apksigner.jar');
  const v1 = join(ordner, 'v1.apk');
  let lauf = spawnSync(java, ['-jar', jar, 'sign', '--ks', schluessel, '--ks-type', 'PKCS12', '--ks-key-alias', 'test', '--ks-pass', `file:${kennwort}`,
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'false', '--v3-signing-enabled', 'false', '--min-sdk-version', '21', '--out', v1, apk], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  mkdirSync(join(ordner, 'zusatz', 'META-INF'), { recursive: true });
  writeFileSync(join(ordner, 'zusatz', 'META-INF', 'zusatz.txt'), 'ungeschützt\n');
  lauf = spawnSync(join(jdk.pfad, 'bin', `jar${endung}`), ['--update', '--file', v1, '-C', join(ordner, 'zusatz'), 'META-INF/zusatz.txt'], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  const pruefe = (weitere) => spawnSync(java, ['-jar', jar, 'verify', '--verbose', '--min-sdk-version', '21', '--max-sdk-version', '23', ...weitere, v1], { encoding: 'utf8' });
  const ohne = pruefe([]);
  assert.equal(ohne.status, 0, ohne.stderr);
  assert.match(ohne.stdout, /^WARNING: META-INF\/zusatz\.txt not protected by signature/m);
  const mitWerr = pruefe(['-Werr']);
  assert.equal(mitWerr.status, 1);
  assert.match(mitWerr.stderr, /^WARNING: META-INF\/zusatz\.txt not protected by signature/m);
});

test('Ausgabe: Hinweise von apksigner beim Signieren erscheinen gekürzt', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('hinweis'), 'aus.apk');
  const { fehler, meldungen } = mitEingriff({ aus }, (programm, argumente, lauf) => (argumente.includes('sign')
    ? { ...lauf, stderr: `Hinweis zu ${schluessel}\n\tat irgendwo.Klasse.methode(Klasse.java:1)\n` } : undefined));
  assert.equal(fehler, undefined, String(fehler));
  assert.ok(meldungen.includes('Hinweis von apksigner: Hinweis zu <Schlüsseldatei>'), meldungen.join('\n'));
  assert.ok(ohneStacktrace(meldungen.join('\n')));
});

// ---------- Kontrolle und Grenze ----------

test('Kontrolle: ohne Eingriff besteht der Lauf über den Kern', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('kern'), 'kern.apk');
  const temp = tempFuer('kontrolle');
  const { ergebnis, fehler } = mitEingriff({ aus }, () => undefined, { temp });
  assert.equal(fehler, undefined, String(fehler));
  assert.equal(ergebnis.summe, summe(aus));
  assert.deepEqual(readdirSync(dirname(aus)), ['kern.apk']);
  assert.deepEqual(reste(temp), []);
});

test('Arbeitsordner: liegt im Temp-Ordner und ist unter Linux und macOS nur für den Benutzer zugänglich', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('rechte'), 'aus.apk');
  const temp = tempFuer('rechte');
  let ordner;
  let rechte;
  const { fehler } = mitEingriff({ aus }, () => undefined, { temp,
    davor: (programm, argumente) => {
      if (!argumente.includes('verify')) return;
      ordner = dirname(argumente.at(-1));
      rechte = statSync(ordner).mode & 0o777;
    } });
  assert.equal(fehler, undefined, String(fehler));
  assert.equal(dirname(ordner), temp);
  assert.notEqual(dirname(ordner), dirname(aus));
  if (!windows) assert.equal(rechte, 0o700);
});

// Das Skript erkennt diesen Fall nicht. Der Test hält die Grenze fest, die
// docs/signierung.md beschreibt: Ein Vorgang mit den Rechten desselben Benutzers
// legt die unsignierte Datei an die Stelle der signierten, setzt nur für die Dauer
// der Prüfung die signierte ein und danach wieder die unsignierte.
test('Grenze: Ein Doppelwechsel im Takt der Prüfung bleibt unerkannt', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(eigenerOrdner('grenze'), 'aus.apk');
  let signiert;
  const { ergebnis, fehler } = mitEingriff({ aus }, (programm, argumente) => {
    const ziel = argumente.at(-1);
    if (argumente.includes('sign')) {
      const vorlaeufig = argumente.at(-2);
      signiert = readFileSync(vorlaeufig);
      copyFileSync(apk, vorlaeufig);
    }
    if (argumente.includes('verify')) copyFileSync(apk, ziel);
  }, { davor: (programm, argumente) => {
    if (argumente.includes('verify')) writeFileSync(argumente.at(-1), signiert);
  } });
  assert.equal(fehler, undefined, String(fehler));
  assert.equal(ergebnis.summe, summe(apk), 'Veröffentlicht ist die unsignierte Datei.');
  assert.equal(summe(aus), summe(apk));
  const lauf = spawnSync(join(jdk.pfad, 'bin', `java${endung}`), ['-jar', join(werkzeuge, 'lib', 'apksigner.jar'), 'verify', aus], { encoding: 'utf8' });
  assert.notEqual(lauf.status, 0, 'Eine unabhängige Prüfung der Ausgabe scheitert.');
});
