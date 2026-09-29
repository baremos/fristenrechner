// Aufruf: node --test scripts/signing.test.mjs
// Prüft scripts/signing/apk-signieren.mjs und scripts/werkzeuge.mjs.
// Die Tests zum Signieren brauchen ein JDK 21 und die Build-Tools des Projekt-SDK.
// Fehlt eines davon, entfallen sie. Der Schlüssel der Tests entsteht in einem
// temporären Ordner und wird mit ihm gelöscht.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findeJdk, standardSdk, vergleiche, vorgabe, windows } from './werkzeuge.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');
const skript = join(hier, 'signing', 'apk-signieren.mjs');

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

const jdk = findeJdk();
const sdk = process.env.ANDROID_HOME ?? standardSdk();
const werkzeuge = join(sdk, 'build-tools', vorgabe.android.buildTools);
const endung = windows ? '.exe' : '';
const plattform = join(sdk, 'platforms', `android-${vorgabe.android.compileSdk}`, 'android.jar');
const fehlt = !jdk.pfad ? 'JDK 21 fehlt'
  : !existsSync(join(werkzeuge, 'lib', 'apksigner.jar')) || !existsSync(join(werkzeuge, `aapt2${endung}`)) ? `Build-Tools ${vorgabe.android.buildTools} fehlen`
    : !existsSync(plattform) ? `Plattform android-${vorgabe.android.compileSdk} fehlt`
      : false;

const arbeit = mkdtempSync(join(tmpdir(), 'signieren-'));
const imRepo = join(wurzel, 'scratchpad', `signieren-test-${process.pid}`);
test.after(() => {
  rmSync(arbeit, { recursive: true, force: true });
  rmSync(imRepo, { recursive: true, force: true });
});

const summe = (pfad) => createHash('sha256').update(readFileSync(pfad)).digest('hex');
let schluessel;
let kennwort;
let fingerabdruck;
let apk;
let unausgerichtet;

function vorbereiten() {
  if (schluessel) return;
  kennwort = join(arbeit, 'kennwort.txt');
  writeFileSync(kennwort, 'nur-fuer-den-test-1234');
  schluessel = join(arbeit, 'test.p12');
  const keytool = join(jdk.pfad, 'bin', `keytool${endung}`);
  let lauf = spawnSync(keytool, ['-genkeypair', '-alias', 'test', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '2',
    '-storetype', 'PKCS12', '-keystore', schluessel, '-storepass:file', kennwort, '-dname', 'CN=Test, O=Probe, C=DE'], { encoding: 'utf8' });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  lauf = spawnSync(keytool, ['-list', '-v', '-storetype', 'PKCS12', '-keystore', schluessel, '-storepass:file', kennwort], { encoding: 'utf8' });
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
}

function signiere(angaben, { ohne = [] } = {}) {
  vorbereiten();
  const vorgaben = { '--apk': apk, '--schluessel': schluessel, '--alias': 'test', '--fingerabdruck': fingerabdruck,
    '--kennwort-datei': kennwort, '--sdk': sdk, ...angaben };
  const argumente = Object.entries(vorgaben).filter(([name]) => !ohne.includes(name)).flat();
  const lauf = spawnSync(process.execPath, [skript, ...argumente], { encoding: 'utf8' });
  return { code: lauf.status, text: `${lauf.stdout}${lauf.stderr}` };
}

const nurMitWerkzeug = { skip: fehlt };

test('Signieren: Gutfall', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(arbeit, 'gut.apk');
  const vorher = summe(apk);
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 0, text);
  assert.match(text, /Verfahren {2}v1 false, v2 true, v3 true, v4 false, Ausrichtung erhalten/);
  assert.match(text, new RegExp(`Fingerabdruck ${fingerabdruck.replaceAll(':', '').toLowerCase()}`));
  assert.match(text, /ERGEBNIS: signiert und geprüft\s*$/);
  assert.ok(existsSync(aus));
  assert.ok(!existsSync(`${aus}.ungeprueft`));
  assert.equal(summe(apk), vorher);
  assert.ok(!text.includes(readFileSync(kennwort, 'utf8')), 'Das Kennwort steht in der Ausgabe.');
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

test('Signieren: falscher Fingerabdruck, die ungeprüfte Datei bleibt liegen', nurMitWerkzeug, () => {
  const aus = join(arbeit, 'falsch.apk');
  const { code, text } = signiere({ '--aus': aus, '--fingerabdruck': '0'.repeat(64) });
  assert.equal(code, 1, text);
  assert.match(text, /Der Fingerabdruck des Zertifikats weicht ab/);
  assert.ok(!existsSync(aus));
  assert.ok(existsSync(`${aus}.ungeprueft`));
});

test('Signieren: vorhandene Ausgabe wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(arbeit, 'besteht.apk');
  writeFileSync(aus, 'schon da');
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 64, text);
  assert.match(text, /besteht schon/);
  assert.equal(readFileSync(aus, 'utf8'), 'schon da');
});

test('Signieren: vorhandene ungeprüfte Datei wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(arbeit, 'rest.apk');
  writeFileSync(`${aus}.ungeprueft`, 'Rest eines früheren Laufs');
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 64, text);
  assert.equal(readFileSync(`${aus}.ungeprueft`, 'utf8'), 'Rest eines früheren Laufs');
  assert.ok(!existsSync(aus));
});

test('Signieren: falscher Alias', nurMitWerkzeug, () => {
  const aus = join(arbeit, 'alias.apk');
  const { code, text } = signiere({ '--aus': aus, '--alias': 'gibtesnicht' });
  assert.equal(code, 1, text);
  assert.ok(!existsSync(aus));
});

test('Signieren: Ausgabe gleich Eingabe', nurMitWerkzeug, () => {
  vorbereiten();
  const vorher = summe(apk);
  const { code, text } = signiere({ '--aus': apk });
  assert.equal(code, 64, text);
  assert.equal(summe(apk), vorher);
});

test('Signieren: Schlüssel und Kennwort im Repository werden abgelehnt', nurMitWerkzeug, () => {
  vorbereiten();
  mkdirSync(imRepo, { recursive: true });
  const drinnen = join(imRepo, 'schluessel.p12');
  writeFileSync(drinnen, readFileSync(schluessel));
  let lauf = signiere({ '--aus': join(arbeit, 'repo-1.apk'), '--schluessel': drinnen });
  assert.equal(lauf.code, 64, lauf.text);
  assert.match(lauf.text, /Die Schlüsseldatei liegt im Repository/);
  const wort = join(imRepo, 'kennwort.txt');
  writeFileSync(wort, 'egal');
  lauf = signiere({ '--aus': join(arbeit, 'repo-2.apk'), '--kennwort-datei': wort });
  assert.equal(lauf.code, 64, lauf.text);
  assert.match(lauf.text, /Die Kennwortdatei liegt im Repository/);
  assert.ok(!existsSync(join(arbeit, 'repo-1.apk')) && !existsSync(join(arbeit, 'repo-2.apk')));
});

for (const [name, angaben, ohne, muster] of [
  ['Kennwort als Argument gibt es nicht', { '--kennwort': 'geheim' }, [], /Unbekanntes Argument: --kennwort/],
  ['Pflichtangabe fehlt', {}, ['--fingerabdruck'], /--fingerabdruck fehlt/],
  ['Fingerabdruck zu kurz', { '--fingerabdruck': 'abcd' }, [], /kein SHA-256/],
  ['Alias mit Leerzeichen', { '--alias': 'a b' }, [], /--alias enthält Zeichen/],
  ['Wert fehlt', { '--alias': '' }, [], /Zu --alias fehlt der Wert/],
]) {
  test(`Signieren, falscher Aufruf: ${name}`, nurMitWerkzeug, () => {
    const aus = join(arbeit, `aufruf-${name.replaceAll(/[^a-z]/gi, '')}.apk`);
    const { code, text } = signiere({ '--aus': aus, ...angaben }, { ohne });
    assert.equal(code, 64, text);
    assert.match(text, muster);
    assert.ok(!existsSync(aus));
  });
}

test('Signieren: Eingabe ohne Ausrichtung wird abgelehnt', nurMitWerkzeug, () => {
  vorbereiten();
  const geprueft = spawnSync(join(werkzeuge, `zipalign${endung}`), ['-c', '4', unausgerichtet]);
  assert.notEqual(geprueft.status, 0, 'Die Probedatei ist wider Erwarten ausgerichtet.');
  const aus = join(arbeit, 'ausrichtung.apk');
  const { code, text } = signiere({ '--aus': aus, '--apk': unausgerichtet });
  assert.equal(code, 1, text);
  assert.match(text, /Die Ausrichtung der unsignierten Datei stimmt nicht/);
  assert.ok(!existsSync(aus) && !existsSync(`${aus}.ungeprueft`));
});

test('Signieren: fehlende Eingabe', nurMitWerkzeug, () => {
  const { code, text } = signiere({ '--aus': join(arbeit, 'ohne.apk'), '--apk': join(arbeit, 'gibt-es-nicht.apk') });
  assert.equal(code, 66, text);
});

test('Signieren: fehlendes SDK', nurMitWerkzeug, () => {
  const { code, text } = signiere({ '--aus': join(arbeit, 'sdk.apk'), '--sdk': join(arbeit, 'kein-sdk') });
  assert.equal(code, 69, text);
  assert.match(text, /Das Werkzeug fehlt/);
});
