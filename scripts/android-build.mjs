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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');
const vorgabe = JSON.parse(readFileSync(join(hier, 'toolchain.json'), 'utf8'));
const windows = process.platform === 'win32';
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

function vergleiche(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function gleicheRevision(a, b) {
  const zahlen = /^[\d.]+$/;
  return zahlen.test(a) && zahlen.test(b) ? vergleiche(a, b) === 0 : a === b;
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

// Liefert die Version, wenn der Ordner ein vollständiges JDK der festgelegten
// Hauptversion und Kennung enthält. Sonst den Grund, warum er nicht passt.
function pruefeJdk(javaHome) {
  const endung = windows ? '.exe' : '';
  for (const programm of ['java', 'javac']) {
    if (!existsSync(join(javaHome, 'bin', programm + endung))) return { grund: `${programm} fehlt` };
  }
  const lauf = spawnSync(join(javaHome, 'bin', `java${endung}`), ['-version'], { encoding: 'utf8' });
  if (lauf.status !== 0) return { grund: 'Versionsabfrage schlägt fehl' };
  const ausgabe = `${lauf.stderr}${lauf.stdout}`;
  const treffer = /version "([^"]+)"/.exec(ausgabe);
  if (!treffer) return { grund: 'Version nicht lesbar' };
  const teile = treffer[1].split('.');
  const haupt = Number(teile[0] === '1' ? teile[1] : teile[0]);
  if (haupt !== vorgabe.jdk.hauptversion) return { grund: `Hauptversion ${haupt}` };
  if (!ausgabe.includes(vorgabe.jdk.kennung)) return { grund: `keine ${vorgabe.jdk.kennung}-Distribution` };
  return { version: treffer[1] };
}

function findeJdk() {
  const kandidaten = [];
  if (process.env.JAVA_HOME) kandidaten.push(process.env.JAVA_HOME);
  const programme = process.env.ProgramFiles ?? 'C:\\Program Files';
  const ordner = windows
    ? [join(programme, 'Eclipse Adoptium'), join(programme, 'Microsoft'), join(programme, 'Android', 'openjdk')]
    : ['/usr/lib/jvm'];
  for (const o of ordner) {
    if (!existsSync(o)) continue;
    for (const name of readdirSync(o).sort().reverse()) kandidaten.push(join(o, name));
  }
  for (const k of kandidaten) {
    const ergebnis = pruefeJdk(k);
    if (ergebnis.version) {
      // Für Release-Builds ist der Patchstand festgelegt. Ein Zusatz wie 21.0.12.1 zählt dazu.
      const stand = ergebnis.version.split(/[^\d.]/)[0].split('.').slice(0, 3).join('.');
      if (vergleiche(stand, vorgabe.jdk.release) !== 0) {
        hinweise.push(`JDK ${ergebnis.version} weicht vom Stand für Release-Builds ${vorgabe.jdk.release} ab.`);
      }
      return { pfad: k, version: ergebnis.version };
    }
    if (k === process.env.JAVA_HOME) console.log(`Übersprungen: JAVA_HOME (${k}): ${ergebnis.grund}`);
  }
  abbruch(`Kein JDK ${vorgabe.jdk.hauptversion} gefunden. JAVA_HOME setzen oder ein JDK nach docs/toolchain.md installieren.`);
}

function standardSdk() {
  const teile = vorgabe.android.sdkOrdner.split('/');
  if (windows && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, ...teile);
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), ...teile);
}

function revision(ordner) {
  const datei = join(ordner, 'source.properties');
  if (!existsSync(datei)) return null;
  const treffer = /^Pkg\.Revision\s*=\s*(.+?)\s*$/m.exec(readFileSync(datei, 'utf8'));
  return treffer ? treffer[1] : null;
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

function findeSdk(projekt, angabe) {
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

  // Fehlt ein Paket der Gruppe "build" oder weicht ein Paket ab, das in die App
  // eingeht, bricht der Lauf ab. Alles andere wird als Hinweis gemeldet.
  for (const paket of vorgabe.android.pakete) {
    const gefunden = revision(join(pfad, ...paket.ordner.split('/')));
    if (gefunden === null) {
      const text = `Im SDK unter ${pfad} fehlt das Paket ${paket.name}.`;
      if (paket.gruppe === 'build') abbruch(text);
      hinweise.push(text);
    } else if (!gleicheRevision(gefunden, paket.revision)) {
      const text = `${paket.name}: Revision ${gefunden} gefunden, festgelegt ist ${paket.revision}.`;
      if (paket.gehtInDieApp) abbruch(text);
      hinweise.push(text);
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
const sdk = findeSdk(projekt, werte.sdk ? resolve(werte.sdk) : null);
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
const lauf = windows
  ? spawnSync('cmd.exe', ['/d', '/c', 'gradlew.bat', werte.aufgabe], { cwd: projekt, env: umgebung, stdio: 'inherit' })
  : spawnSync('./gradlew', [werte.aufgabe], { cwd: projekt, env: umgebung, stdio: 'inherit' });
process.exit(lauf.status ?? 1);
