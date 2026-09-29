#!/usr/bin/env node
// Prüft die Werkzeuge gegen scripts/toolchain.json und startet den Gradle-Build
// eines Android-Projekts. Das Skript ändert keine Einstellungen des Rechners:
// JAVA_HOME und ANDROID_HOME gelten nur für den gestarteten Build.
//
// Aufruf:
//   node scripts/android-build.mjs [--projekt <Ordner>] [--aufgabe <Gradle-Aufgabe>]
//                                  [--sdk <Ordner>] [--nur-pruefen] [--streng]
//
// Vorgaben: --projekt app/android, --aufgabe assembleDebug
//
// Ort des SDK, in dieser Reihenfolge: --sdk, sdk.dir in local.properties des
// Projekts, ANDROID_HOME, Standardordner des Projekt-SDK.
//
// --streng macht aus jedem Hinweis einen Abbruch. Für Release-Builds.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findeJdk as sucheJdk, standardSdk, vergleiche, vorgabe, windows } from './werkzeuge.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');
const hinweise = [];

function argumente(argv) {
  const werte = { projekt: join('app', 'android'), aufgabe: 'assembleDebug', sdk: null, nurPruefen: false, streng: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--nur-pruefen') werte.nurPruefen = true;
    else if (a === '--streng') werte.streng = true;
    else if (a === '--projekt' && argv[i + 1]) werte.projekt = argv[(i += 1)];
    else if (a === '--aufgabe' && argv[i + 1]) werte.aufgabe = argv[(i += 1)];
    else if (a === '--sdk' && argv[i + 1]) werte.sdk = argv[(i += 1)];
    else abbruch(`Unbekanntes Argument: ${a}`);
  }
  return werte;
}

function abbruch(text) {
  console.error(`Fehler: ${text}`);
  process.exit(1);
}

function pruefeNode() {
  const version = process.versions.node;
  const { referenz, bereiche } = vorgabe.node;
  const passt = bereiche.some((b) => vergleiche(version, b.mindestens) >= 0 && vergleiche(version, b.unter) < 0);
  if (!passt) {
    const text = bereiche.map((b) => `ab ${b.mindestens} und unter ${b.unter}`).join(' oder ');
    abbruch(`Node ${version} gefunden, unterstützt ist ${text}.`);
  }
  if (version !== referenz) hinweise.push(`Node ${version} weicht von der Referenzversion ${referenz} ab.`);
  return version;
}

// Die Suche selbst liegt in werkzeuge.mjs. Hier stehen nur Ausgabe und Abbruch.
function findeJdk() {
  const jdk = sucheJdk();
  for (const text of jdk.uebersprungen) console.log(`Übersprungen: ${text}`);
  if (!jdk.pfad) {
    abbruch(`Kein JDK ${vorgabe.jdk.hauptversion} gefunden. JAVA_HOME setzen oder ein JDK nach docs/toolchain.md installieren.`);
  }
  hinweise.push(...jdk.hinweise);
  return { pfad: jdk.pfad, version: jdk.version };
}

// Liest sdk.dir so, wie Gradle local.properties liest: Trennzeichen "=", ":" oder
// Leerraum, Maskierung mit "\". Relative Werte gelten ab dem Projektordner.
// Fortsetzungszeilen werden abgelehnt, damit kein anderer Wert gilt als gelesen.
function sdkDir(projekt) {
  const datei = join(projekt, 'local.properties');
  if (!existsSync(datei)) return null;
  let wert = null;
  for (const roh of readFileSync(datei, 'utf8').split(/\r\n|\r|\n/)) {
    const zeile = roh.replace(/^[ \t\f]+/, '');
    if (zeile === '' || zeile.startsWith('#') || zeile.startsWith('!')) continue;
    // Gilt für jeden Eintrag: Eine Fortsetzung könnte sdk.dir über zwei Zeilen verteilen.
    if (/(?:^|[^\\])(?:\\\\)*\\$/.test(zeile)) {
      abbruch(`${datei} verwendet eine Fortsetzungszeile. Bitte jeden Eintrag in eine Zeile schreiben.`);
    }
    const treffer = /^((?:\\.|[^\\=: \t\f])*)[ \t\f]*[=:]?[ \t\f]*(.*)$/.exec(zeile);
    if (!treffer || entmaskiere(treffer[1]) !== 'sdk.dir') continue;
    wert = entmaskiere(treffer[2]);
  }
  if (wert === null) return null;
  if (wert === '') abbruch(`sdk.dir in ${datei} ist leer.`);
  return resolve(projekt, wert);
}

function entmaskiere(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, z) => {
    if (z.length === 5) return String.fromCharCode(parseInt(z.slice(1), 16));
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[z] ?? z;
  });
}

// Prüft die Pakete mit scripts/SdkPruefung.java. Das Programm läuft mit dem JDK
// des Builds. Das Einrichtungsskript ruft dasselbe Programm auf.
function pruefePakete(sdk, javaHome) {
  const java = join(javaHome, 'bin', windows ? 'java.exe' : 'java');
  const angaben = vorgabe.android.pakete.flatMap((p) => [p.name, p.ordner, p.revision]);
  const lauf = spawnSync(java, [join(hier, 'SdkPruefung.java'), sdk, ...angaben], { encoding: 'utf8' });
  if (lauf.status !== 0) {
    abbruch(`Die Prüfung der Pakete ist fehlgeschlagen. ${`${lauf.stderr ?? ''}${lauf.error?.message ?? ''}`.trim()}`);
  }
  const zeilen = lauf.stdout.split(/\r?\n/).filter((zeile) => zeile !== '').map((zeile) => zeile.split('\t'));
  if (zeilen.length !== vorgabe.android.pakete.length || zeilen.some((zeile, i) => zeile.length !== 4 || zeile[1] !== vorgabe.android.pakete[i].name)) {
    abbruch('Die Prüfung der Pakete hat eine unerwartete Ausgabe geliefert.');
  }
  return zeilen.map(([status, , gefunden, meldung], i) => ({ paket: vorgabe.android.pakete[i], status, gefunden, meldung }));
}

function findeSdk(projekt, angabe, javaHome) {
  let pfad = angabe;
  let herkunft = '--sdk';
  const lokal = sdkDir(projekt);
  // Gradle zieht sdk.dir dem Wert von ANDROID_HOME vor. Ein abweichendes --sdk bliebe wirkungslos.
  if (pfad && lokal && lokal.toLowerCase() !== pfad.toLowerCase()) {
    abbruch(`--sdk nennt ${pfad}, sdk.dir in local.properties nennt ${lokal}. Gradle würde sdk.dir verwenden.`);
  }
  if (!pfad && lokal) {
    pfad = lokal;
    herkunft = 'sdk.dir in local.properties';
  }
  if (!pfad && process.env.ANDROID_HOME) {
    pfad = resolve(process.env.ANDROID_HOME);
    herkunft = 'ANDROID_HOME';
  }
  if (!pfad) {
    pfad = standardSdk();
    herkunft = 'Standardordner';
  }
  if (!existsSync(pfad)) {
    abbruch(`Kein Android SDK unter ${pfad} (${herkunft}). Das Projekt-SDK nach docs/toolchain.md einrichten.`);
  }

  // Fehlt ein Paket der Gruppe "build", ist seine Beschreibung ungültig oder weicht
  // ein Paket ab, das in die App eingeht, bricht der Lauf ab. Alles andere wird
  // als Hinweis gemeldet.
  for (const { paket, status, gefunden, meldung } of pruefePakete(pfad, javaHome)) {
    if (status === 'OK') continue;
    if (status === 'UNGUELTIG') {
      const text = `Die Beschreibung des Pakets ${paket.name} ist ungültig: ${meldung}`;
      if (paket.gruppe === 'build') abbruch(text);
      hinweise.push(text);
    } else if (status === 'FEHLT') {
      const text = `Im SDK unter ${pfad} fehlt das Paket ${paket.name}.`;
      if (paket.gruppe === 'build') abbruch(text);
      hinweise.push(text);
    } else if (status === 'ABWEICHUNG') {
      const text = `${paket.name}: Revision ${gefunden} gefunden, festgelegt ist ${paket.revision}.`;
      if (paket.gehtInDieApp) abbruch(text);
      hinweise.push(text);
    } else {
      abbruch(`Die Prüfung der Pakete meldet den unbekannten Status ${status}.`);
    }
  }
  return pfad;
}

function pruefeWrapper(projekt) {
  const ordner = join(projekt, 'gradle', 'wrapper');
  const datei = join(ordner, 'gradle-wrapper.properties');
  if (!existsSync(datei)) abbruch(`Kein Gradle-Wrapper unter ${datei}.`);
  const inhalt = readFileSync(datei, 'utf8');
  const url = /^distributionUrl=.*gradle-([\d.]+)-(all|bin)\.zip\s*$/m.exec(inhalt);
  if (!url) abbruch(`distributionUrl in ${datei} nicht lesbar.`);
  const [, version, art] = url;
  if (version !== vorgabe.gradle.version) {
    abbruch(`Gradle ${version} im Wrapper, festgelegt ist ${vorgabe.gradle.version}.`);
  }
  const summe = /^distributionSha256Sum=([0-9a-f]{64})\s*$/m.exec(inhalt);
  if (!summe) abbruch(`distributionSha256Sum fehlt in ${datei}.`);
  if (summe[1] !== vorgabe.gradle.sha256[art]) {
    abbruch(`distributionSha256Sum in ${datei} weicht von der festgelegten Prüfsumme ab.`);
  }
  const jar = join(ordner, 'gradle-wrapper.jar');
  if (!existsSync(jar)) abbruch(`gradle-wrapper.jar fehlt unter ${ordner}.`);
  const jarSumme = createHash('sha256').update(readFileSync(jar)).digest('hex');
  if (jarSumme !== vorgabe.gradle.sha256.wrapperJar) {
    abbruch('gradle-wrapper.jar weicht von der festgelegten Prüfsumme ab.');
  }
  return `${version} (${art})`;
}

const werte = argumente(process.argv.slice(2));
const projekt = resolve(wurzel, werte.projekt);
if (!existsSync(projekt)) abbruch(`Projektordner nicht gefunden: ${projekt}`);

const node = pruefeNode();
const jdk = findeJdk();
const sdk = findeSdk(projekt, werte.sdk ? resolve(werte.sdk) : null, jdk.pfad);
const gradle = pruefeWrapper(projekt);

console.log(`Node    ${node}`);
console.log(`JDK     ${jdk.version}  ${jdk.pfad}`);
console.log(`SDK     ${sdk}`);
console.log(`Gradle  ${gradle}`);
console.log(`Projekt ${projekt}`);
for (const h of hinweise) console.log(`Hinweis: ${h}`);
if (werte.streng && hinweise.length > 0) abbruch('Strenge Prüfung: Mindestens ein Werkzeug weicht von der Festlegung ab.');

if (werte.nurPruefen) process.exit(0);

const umgebung = { ...process.env, JAVA_HOME: jdk.pfad, ANDROID_HOME: sdk };
delete umgebung.ANDROID_SDK_ROOT;
// Mit ".\" aufrufen: Ist NoDefaultCurrentDirectoryInExePath gesetzt, sucht cmd.exe nicht im aktuellen Ordner.
const lauf = windows
  ? spawnSync('cmd.exe', ['/d', '/c', '.\\gradlew.bat', werte.aufgabe], { cwd: projekt, env: umgebung, stdio: 'inherit' })
  : spawnSync('./gradlew', [werte.aufgabe], { cwd: projekt, env: umgebung, stdio: 'inherit' });
process.exit(lauf.status ?? 1);
