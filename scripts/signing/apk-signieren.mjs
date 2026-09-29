#!/usr/bin/env node
// Signiert eine unsignierte APK außerhalb des Gradle-Builds und prüft das Ergebnis.
// Festlegungen: docs/signierung.md, S5 bis S7, S9 und S12.
//
// Aufruf:
//   node scripts/signing/apk-signieren.mjs --apk <unsignierte.apk> --aus <signierte.apk>
//       --schluessel <Datei.p12> --alias <Alias> --fingerabdruck <SHA-256 des Zertifikats>
//       [--kennwort-datei <Datei>] [--sdk <Ordner>]
//
//   --fingerabdruck   erwarteter Fingerabdruck des Zertifikats, mit oder ohne Doppelpunkte
//   --kennwort-datei  Datei mit dem Kennwort in der ersten Zeile. Ohne die Angabe fragt
//                     apksigner im Dialog. Ein Kennwort als Argument gibt es nicht.
//
// Das Skript
// - lehnt Schlüssel- und Kennwortdateien ab, die im Repository liegen,
// - überschreibt und löscht nichts und lässt die unsignierte Datei unverändert,
// - signiert mit v2 und v3, ohne v1 und v4, und erhält die Ausrichtung,
// - schreibt zuerst nach <signierte.apk>.ungeprueft und benennt erst nach
//   bestandener Prüfung um.
//
// Rückgabewert: 0 bei Erfolg, 64 bei falschem Aufruf, 66 bei fehlender Eingabe,
// 69 bei fehlendem Werkzeug, 1 bei gescheitertem Signieren oder Prüfen.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findeJdk, standardSdk, vorgabe, windows } from '../werkzeuge.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERFAHREN = { v1: false, v2: true, v3: true, v4: false };
const LAENGE = 4096;

function abbruch(code, text) {
  console.error(`Fehler: ${text}`);
  process.exit(code);
}

function argumente(argv) {
  const namen = { '--apk': 'apk', '--aus': 'aus', '--schluessel': 'schluessel', '--alias': 'alias',
    '--fingerabdruck': 'fingerabdruck', '--kennwort-datei': 'kennwortDatei', '--sdk': 'sdk' };
  const werte = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = namen[argv[i]];
    if (!name) abbruch(64, `Unbekanntes Argument: ${argv[i]}`);
    if (argv[i + 1] === undefined || argv[i + 1] === '') abbruch(64, `Zu ${argv[i]} fehlt der Wert.`);
    if (name in werte) abbruch(64, `${argv[i]} ist doppelt angegeben.`);
    werte[name] = argv[i + 1];
  }
  for (const pflicht of ['--apk', '--aus', '--schluessel', '--alias', '--fingerabdruck']) {
    if (!(namen[pflicht] in werte)) abbruch(64, `${pflicht} fehlt.`);
  }
  return werte;
}

function imRepository(pfad) {
  const rel = relative(realpathSync(wurzel), realpathSync(pfad));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function datei(pfad, bezeichnung) {
  const voll = resolve(pfad);
  if (!existsSync(voll) || !statSync(voll).isFile()) abbruch(66, `${bezeichnung} fehlt oder ist keine Datei: ${voll}`);
  return voll;
}

const summe = (pfad) => createHash('sha256').update(readFileSync(pfad)).digest('hex');

const werte = argumente(process.argv.slice(2));
const fingerabdruck = werte.fingerabdruck.replaceAll(':', '').toLowerCase();
if (!/^[0-9a-f]{64}$/.test(fingerabdruck)) abbruch(64, '--fingerabdruck ist kein SHA-256 aus 64 Hexadezimalziffern.');
if (!/^[A-Za-z0-9._-]+$/.test(werte.alias)) abbruch(64, '--alias enthält Zeichen, die das Skript nicht zulässt.');

const apk = datei(werte.apk, 'Die unsignierte Datei');
const schluessel = datei(werte.schluessel, 'Die Schlüsseldatei');
const kennwortDatei = werte.kennwortDatei === undefined ? null : datei(werte.kennwortDatei, 'Die Kennwortdatei');
if (imRepository(schluessel)) abbruch(64, 'Die Schlüsseldatei liegt im Repository. Schlüssel gehören nicht in den Arbeitsordner.');
if (kennwortDatei && imRepository(kennwortDatei)) abbruch(64, 'Die Kennwortdatei liegt im Repository. Kennwörter gehören nicht in den Arbeitsordner.');

const aus = resolve(werte.aus);
const vorlaeufig = `${aus}.ungeprueft`;
if (aus === apk) abbruch(64, '--aus nennt die unsignierte Datei. Die signierte Datei ist eine eigene Datei.');
for (const ziel of [aus, vorlaeufig]) {
  if (existsSync(ziel)) abbruch(64, `Die Datei besteht schon, das Skript überschreibt nichts: ${ziel}`);
}
if (!existsSync(dirname(aus))) abbruch(66, `Der Ordner für die signierte Datei fehlt: ${dirname(aus)}`);

const jdk = findeJdk();
if (!jdk.pfad) abbruch(69, `Kein JDK ${vorgabe.jdk.hauptversion} gefunden. JAVA_HOME setzen oder ein JDK nach docs/toolchain.md installieren.`);
const java = join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java');
const sdk = resolve(werte.sdk ?? process.env.ANDROID_HOME ?? standardSdk());
const werkzeuge = join(sdk, 'build-tools', vorgabe.android.buildTools);
const apksigner = join(werkzeuge, 'lib', 'apksigner.jar');
const zipalign = join(werkzeuge, windows ? 'zipalign.exe' : 'zipalign');
for (const werkzeug of [apksigner, zipalign]) {
  if (!existsSync(werkzeug)) abbruch(69, `Das Werkzeug fehlt: ${werkzeug}. Das Projekt-SDK nach docs/toolchain.md einrichten.`);
}

function ausgerichtet(pfad) {
  return spawnSync(zipalign, ['-c', '4', pfad], { encoding: 'utf8' }).status === 0;
}

const version = spawnSync(java, ['-jar', apksigner, '--version'], { encoding: 'utf8' });
console.log(`JDK        ${jdk.version}  ${jdk.pfad}`);
console.log(`Build-Tools ${vorgabe.android.buildTools}, apksigner ${`${version.stdout}`.trim() || 'ohne Angabe'}`);
console.log(`Eingabe    ${apk}`);
for (const h of jdk.hinweise) console.log(`Hinweis: ${h}`);

const vorher = summe(apk);
if (!ausgerichtet(apk)) abbruch(1, 'Die Ausrichtung der unsignierten Datei stimmt nicht. Das Skript richtet nicht selbst aus.');

const signieren = spawnSync(java, ['-jar', apksigner, 'sign',
  '--ks', schluessel, '--ks-type', 'PKCS12', '--ks-key-alias', werte.alias,
  ...(kennwortDatei ? ['--ks-pass', `file:${kennwortDatei}`] : []),
  '--v1-signing-enabled', String(VERFAHREN.v1), '--v2-signing-enabled', String(VERFAHREN.v2),
  '--v3-signing-enabled', String(VERFAHREN.v3), '--v4-signing-enabled', String(VERFAHREN.v4),
  '--alignment-preserved', 'true', '--out', vorlaeufig, apk], { stdio: 'inherit' });
if (signieren.status !== 0 || !existsSync(vorlaeufig)) abbruch(1, 'apksigner hat nicht signiert.');

// Ab hier bleibt bei einem Fehler die Datei mit der Endung .ungeprueft liegen.
function gescheitert(text) {
  abbruch(1, `${text} Die ungeprüfte Datei bleibt liegen: ${vorlaeufig}`);
}

const pruefung = spawnSync(java, ['-jar', apksigner, 'verify', '--verbose', '--print-certs', vorlaeufig], { encoding: 'utf8' });
if (pruefung.status !== 0) gescheitert(`apksigner verify scheitert: ${`${pruefung.stdout}${pruefung.stderr}`.trim().split(/\r?\n/)[0]}`);
const zeilen = pruefung.stdout.split(/\r?\n/);
const wert = (anfang) => zeilen.find((z) => z.startsWith(anfang))?.slice(anfang.length).trim();
if (!zeilen.includes('Verifies')) gescheitert('apksigner verify meldet kein „Verifies“.');
const gefunden = {
  v1: wert('Verified using v1 scheme (JAR signing):'),
  v2: wert('Verified using v2 scheme (APK Signature Scheme v2):'),
  v3: wert('Verified using v3 scheme (APK Signature Scheme v3):'),
  v4: wert('Verified using v4 scheme (APK Signature Scheme v4):'),
};
for (const [name, soll] of Object.entries(VERFAHREN)) {
  if (gefunden[name] !== String(soll)) gescheitert(`Signaturverfahren ${name}: erwartet ${soll}, gefunden ${gefunden[name] ?? 'keine Angabe'}.`);
}
if (wert('Number of signers:') !== '1') gescheitert('Die Datei trägt nicht genau eine Signatur.');
if (wert('Signer #1 key algorithm:') !== 'RSA' || wert('Signer #1 key size (bits):') !== String(LAENGE)) {
  gescheitert(`Der Schlüssel ist nicht RSA mit ${LAENGE} Bit.`);
}
const zertifikat = wert('Signer #1 certificate SHA-256 digest:');
if (zertifikat !== fingerabdruck) gescheitert(`Der Fingerabdruck des Zertifikats weicht ab: ${zertifikat ?? 'keine Angabe'}.`);
if (!ausgerichtet(vorlaeufig)) gescheitert('Die Ausrichtung der signierten Datei stimmt nicht.');
if (summe(apk) !== vorher) gescheitert('Die unsignierte Datei hat sich verändert.');

renameSync(vorlaeufig, aus);
console.log(`Verfahren  v1 ${gefunden.v1}, v2 ${gefunden.v2}, v3 ${gefunden.v3}, v4 ${gefunden.v4}, Ausrichtung erhalten`);
console.log(`Zertifikat ${wert('Signer #1 certificate DN:')}`);
console.log(`Fingerabdruck ${zertifikat}`);
console.log(`Ausgabe    ${aus}`);
console.log(`           ${statSync(aus).size} Bytes, SHA-256 ${summe(aus)}`);
console.log('ERGEBNIS: signiert und geprüft');
