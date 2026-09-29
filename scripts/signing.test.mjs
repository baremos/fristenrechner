// Aufruf: node --test scripts/signing.test.mjs
// Prüft scripts/werkzeuge.mjs, scripts/signing/signieren.mjs und scripts/signing/apk-signieren.mjs.
// Die Tests zum Signieren brauchen ein JDK 21, die Build-Tools und die Plattform aus
// dem Projekt-SDK. Fehlt eines davon, entfallen sie. Der Schlüssel der Tests entsteht
// in einem temporären Ordner und wird mit ihm gelöscht.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Abbruch, geschuetzteOrdner, liegtIn, pruefeAusgabe, signiere as kern } from './signing/signieren.mjs';
import { findeJdk, standardSdk, vergleiche, vorgabe, windows } from './werkzeuge.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');
const skript = join(hier, 'signing', 'apk-signieren.mjs');
const endung = windows ? '.exe' : '';
const arbeit = mkdtempSync(join(tmpdir(), 'signieren-'));
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

function aufruf(argumente) {
  const lauf = spawnSync(process.execPath, [skript, ...argumente], { encoding: 'utf8' });
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
function signiere(angaben, { ohne = [] } = {}) {
  vorbereiten();
  const vorgaben = { '--apk': apk, '--schluessel': schluessel, '--alias': 'test', '--fingerabdruck': fingerabdruck,
    '--kennwort-datei': kennwort, '--sdk': sdk, ...angaben };
  return aufruf(Object.entries(vorgaben).filter(([name]) => !ohne.includes(name)).flat());
}

// Über den Kern, mit einem Eingriff nach jedem Aufruf eines Werkzeugs. So lassen sich
// Änderungen nachstellen, die ein anderer Vorgang während des Laufs vornimmt.
function mitEingriff(angaben, eingriff) {
  vorbereiten();
  const meldungen = [];
  const ausfuehren = (programm, argumente, optionen) => {
    const lauf = spawnSync(programm, argumente, { ...optionen, stdio: 'pipe', encoding: 'utf8' });
    return eingriff(programm, argumente, lauf) ?? lauf;
  };
  try {
    const ergebnis = kern({ apk, schluessel, alias: 'test', fingerabdruck, kennwortDatei: kennwort, sdk, ...angaben },
      { ausfuehren, melde: (text) => meldungen.push(text) });
    return { ergebnis, meldungen };
  } catch (fehler) {
    return { fehler, meldungen };
  }
}
const arbeitsordner = (aus) => readdirSync(dirname(aus)).filter((n) => n.startsWith('.signieren-')).map((n) => join(dirname(aus), n));
const eigenerOrdner = (name) => {
  const ordner = join(arbeit, name);
  mkdirSync(ordner);
  return ordner;
};

test('Signieren: Gutfall', nurMitWerkzeug, () => {
  vorbereiten();
  const aus = join(eigenerOrdner('gut'), 'gut.apk');
  const vorher = summe(apk);
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 0, text);
  assert.match(text, /Verfahren {2}v1 false, v2 true, v3 true, v3\.1 false, v4 false, Ausrichtung erhalten/);
  assert.match(text, new RegExp(`Fingerabdruck ${fingerabdruck.replaceAll(':', '').toLowerCase()}`));
  assert.match(text, /ERGEBNIS: signiert und geprüft\s*$/);
  assert.deepEqual(readdirSync(dirname(aus)), ['gut.apk']);
  assert.equal(summe(apk), vorher);
  assert.ok(!text.includes(readFileSync(kennwort, 'utf8')), 'Das Kennwort steht in der Ausgabe.');
  assert.ok(!text.includes(schluessel), 'Der Ort der Schlüsseldatei steht in der Ausgabe.');
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
  const { code, text } = signiere({ '--aus': aus, '--fingerabdruck': '0'.repeat(64) });
  assert.equal(code, 1, text);
  assert.match(text, /Der Fingerabdruck des Zertifikats weicht ab/);
  assert.ok(!existsSync(aus));
  const ordner = arbeitsordner(aus);
  assert.equal(ordner.length, 1);
  assert.deepEqual(readdirSync(ordner[0]), ['falsch.apk.ungeprueft']);
});

test('Signieren: vorhandene Ausgabe wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('besteht'), 'besteht.apk');
  writeFileSync(aus, 'schon da');
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 64, text);
  assert.match(text, /besteht schon/);
  assert.equal(readFileSync(aus, 'utf8'), 'schon da');
  assert.deepEqual(readdirSync(dirname(aus)), ['besteht.apk']);
});

test('Signieren: eine fremde Datei mit der Endung .ungeprueft bleibt unberührt', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('rest'), 'rest.apk');
  writeFileSync(`${aus}.ungeprueft`, 'Rest eines früheren Laufs');
  const { code, text } = signiere({ '--aus': aus });
  assert.equal(code, 0, text);
  assert.equal(readFileSync(`${aus}.ungeprueft`, 'utf8'), 'Rest eines früheren Laufs');
  assert.deepEqual(readdirSync(dirname(aus)).sort(), ['rest.apk', 'rest.apk.ungeprueft']);
});

test('Signieren: falscher Alias, es bleibt nichts liegen', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('alias'), 'alias.apk');
  const { code, text } = signiere({ '--aus': aus, '--alias': 'gibtesnicht' });
  assert.equal(code, 1, text);
  assert.deepEqual(readdirSync(dirname(aus)), []);
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

test('Signieren: fehlendes SDK', nurMitWerkzeug, () => {
  const { code, text } = signiere({ '--aus': join(arbeit, 'sdk.apk'), '--sdk': join(arbeit, 'kein-sdk') });
  assert.equal(code, 69, text);
  assert.match(text, /Das Werkzeug fehlt/);
});

// ---------- Änderungen während des Laufs ----------

test('Eingriff: Die Ausgabe entsteht während der Prüfung, sie wird nicht überschrieben', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('wettlauf-ziel'), 'ziel.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente) => {
    if (argumente.includes('verify')) writeFileSync(aus, 'von jemand anderem');
  });
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.equal(fehler.code, 1);
  assert.match(fehler.message, /lässt sich nicht anlegen \(EEXIST\)/);
  assert.equal(readFileSync(aus, 'utf8'), 'von jemand anderem');
  assert.equal(arbeitsordner(aus).length, 1);
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

test('Eingriff: apksigner nennt ein weiteres Verfahren', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('verfahren'), 'verfahren.apk');
  const { fehler } = mitEingriff({ aus }, (programm, argumente, lauf) => (argumente.includes('verify')
    ? { ...lauf, stdout: lauf.stdout.replace('Verified using v4', 'Verified using v3.2 scheme (APK Signature Scheme v3.2): true\nVerified using v4') } : undefined));
  assert.ok(fehler instanceof Abbruch, String(fehler));
  assert.match(fehler.message, /Unbekanntes Signaturverfahren in der Prüfung: v3\.2/);
  assert.ok(!existsSync(aus));
});

test('Eingriff: ohne Eingriff besteht der Lauf über den Kern', nurMitWerkzeug, () => {
  const aus = join(eigenerOrdner('kern'), 'kern.apk');
  const { ergebnis, fehler } = mitEingriff({ aus }, () => undefined);
  assert.equal(fehler, undefined, String(fehler));
  assert.equal(ergebnis.summe, summe(aus));
  assert.deepEqual(readdirSync(dirname(aus)), ['kern.apk']);
});
