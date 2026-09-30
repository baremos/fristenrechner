// Kern von apk-signieren.mjs: Signieren, Prüfen und Veröffentlichen einer APK.
// Festlegungen: docs/signierung.md, S5 bis S7, S9 und S12.
// Alle Aufrufe fremder Programme laufen über die Funktion "ausfuehren", damit
// Tests Ausgaben und gleichzeitige Änderungen nachstellen können.
//
// Schutzgrenze, siehe docs/signierung.md, Abschnitt „Was das Skript absichert“:
// Das Skript fängt Versehen ab und Änderungen, die zwischen zwei Prüfsummen
// sichtbar werden. Gegen einen Vorgang mit den Rechten desselben Benutzers, der
// Dateien gezielt im Takt der Prüfung tauscht, schützt es nicht. Ein solcher
// Vorgang könnte auch die Schlüsseldatei lesen oder die Werkzeuge ersetzen.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findeJdk, standardSdk, vorgabe, windows } from '../werkzeuge.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Jedes Verfahren, das apksigner nennt, muss hier stehen und den Wert haben.
// Nennt eine spätere Fassung ein weiteres Verfahren, scheitert die Prüfung.
export const VERFAHREN = { v1: false, v2: true, v3: true, 'v3.1': false, v4: false };
export const LAENGE = 4096;

export class Abbruch extends Error {
  constructor(code, text) {
    super(text);
    this.code = code;
  }
}

const summeVon = (inhalt) => createHash('sha256').update(inhalt).digest('hex');
export const summe = (pfad) => summeVon(readFileSync(pfad));

// Eigene Leseprüfung der unsignierten APK: Lesefehler ergeben 66.
// Für die vorläufig signierte Datei setzt der Aufrufer den Fehler auf 1 um.
function gelesen(pfad, bezeichnung) {
  try {
    return readFileSync(pfad);
  } catch (fehler) {
    throw new Abbruch(66, `${bezeichnung} lässt sich nicht lesen (${fehler.code ?? 'Fehler'}).`);
  }
}

// Meldung eines Werkzeugs ohne Stacktrace und ohne die Orte privater Dateien.
// ersatz: Paare aus Pfad und Platzhalter.
export function werkzeugmeldung(lauf, ersatz = []) {
  let text = `${lauf.stderr ?? ''}\n${lauf.stdout ?? ''}`;
  for (const [pfad, platzhalter] of ersatz) {
    if (pfad) text = text.replaceAll(pfad, platzhalter);
  }
  return text.split(/\r?\n/).map((z) => z.trim())
    .filter((z) => z !== '' && !/^at\s/.test(z) && !/^\.\.\. \d+ more$/.test(z))
    .slice(0, 3);
}

function aufgeloest(pfad, bezeichnung) {
  try {
    return realpathSync.native(pfad);
  } catch (fehler) {
    throw new Abbruch(66, `${bezeichnung} lässt sich nicht auflösen (${fehler.code ?? 'Fehler'}).`);
  }
}

// Wahr, wenn pfad der Ordner selbst ist oder darin liegt. Beide Angaben sind
// aufgelöste Pfade. Ein Name wie "..geheim" ist kein Aufstieg.
export function liegtIn(ordner, pfad) {
  const rel = relative(ordner, pfad);
  if (rel === '') return true;
  return !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

// Alle Arbeitsordner des Repositorys: der Ordner des Skripts und, soweit Git
// Auskunft gibt, der Hauptordner und jeder Worktree.
export function geschuetzteOrdner(ausfuehren = spawnSync, start = wurzel) {
  const ordner = [aufgeloest(start, 'Der Ordner des Skripts')];
  const lauf = ausfuehren('git', ['-C', start, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const mitGit = lauf.status === 0 && typeof lauf.stdout === 'string';
  if (mitGit) {
    for (const zeile of lauf.stdout.split(/\r?\n/)) {
      if (!zeile.startsWith('worktree ')) continue;
      const pfad = zeile.slice('worktree '.length);
      if (existsSync(pfad)) ordner.push(aufgeloest(pfad, 'Ein Arbeitsordner des Repositorys'));
    }
  }
  return { ordner: [...new Set(ordner)], mitGit };
}

// Wertet die Ausgabe von "apksigner verify --verbose --print-certs" aus.
// Jede Angabe muss genau einmal vorkommen und den erwarteten Wert haben.
// Im Gutfall schreibt apksigner nichts auf die Fehlerausgabe. Steht dort
// etwas, scheitert die Prüfung.
export function pruefeAusgabe(ausgabe, fingerabdruck, fehlerausgabe = '') {
  const daneben = `${fehlerausgabe}`.split(/\r?\n/).map((z) => z.trim()).find((z) => z !== '');
  if (daneben) throw new Abbruch(1, `apksigner verify schreibt auf die Fehlerausgabe: ${daneben}`);
  const zeilen = ausgabe.split(/\r?\n/).map((z) => z.trimEnd()).filter((z) => z !== '');
  const meldung = zeilen.find((z) => /^(WARNING|ERROR)\b/.test(z));
  if (meldung) throw new Abbruch(1, `apksigner verify meldet: ${meldung}`);
  if (zeilen.filter((z) => z === 'Verifies').length !== 1) throw new Abbruch(1, 'apksigner verify meldet nicht genau einmal „Verifies“.');

  const gefunden = new Map();
  let stempel = null;
  for (const zeile of zeilen) {
    if (!zeile.startsWith('Verified ')) continue;
    const quelle = /^Verified for SourceStamp: (true|false)$/.exec(zeile);
    if (quelle) {
      if (stempel !== null) throw new Abbruch(1, 'Die Angabe zum SourceStamp ist doppelt.');
      stempel = quelle[1];
      continue;
    }
    const treffer = /^Verified using (\S+) scheme \([^()]*\): (true|false)$/.exec(zeile);
    if (!treffer) throw new Abbruch(1, `Zeile der Prüfung nicht lesbar: ${zeile}`);
    if (gefunden.has(treffer[1])) throw new Abbruch(1, `Signaturverfahren ${treffer[1]} ist doppelt genannt.`);
    gefunden.set(treffer[1], treffer[2] === 'true');
  }
  for (const name of gefunden.keys()) {
    if (!Object.hasOwn(VERFAHREN, name)) throw new Abbruch(1, `Unbekanntes Signaturverfahren in der Prüfung: ${name}.`);
  }
  for (const [name, soll] of Object.entries(VERFAHREN)) {
    if (!gefunden.has(name)) throw new Abbruch(1, `Signaturverfahren ${name}: keine Angabe in der Prüfung.`);
    if (gefunden.get(name) !== soll) throw new Abbruch(1, `Signaturverfahren ${name}: erwartet ${soll}, gefunden ${gefunden.get(name)}.`);
  }
  if (stempel === 'true') throw new Abbruch(1, 'Die Datei trägt einen SourceStamp. Festgelegt ist keiner.');

  const einmal = (anfang) => {
    const treffer = zeilen.filter((z) => z.startsWith(anfang));
    if (treffer.length !== 1) throw new Abbruch(1, `Die Angabe „${anfang}“ steht ${treffer.length}-mal in der Prüfung, erwartet ist einmal.`);
    return treffer[0].slice(anfang.length).trim();
  };
  if (zeilen.some((z) => /^Signer #(?!1\b)/.test(z)) || einmal('Number of signers:') !== '1') {
    throw new Abbruch(1, 'Die Datei trägt nicht genau eine Signatur.');
  }
  if (einmal('Signer #1 key algorithm:') !== 'RSA' || einmal('Signer #1 key size (bits):') !== String(LAENGE)) {
    throw new Abbruch(1, `Der Schlüssel ist nicht RSA mit ${LAENGE} Bit.`);
  }
  const zertifikat = einmal('Signer #1 certificate SHA-256 digest:');
  if (zertifikat !== fingerabdruck) throw new Abbruch(1, `Der Fingerabdruck des Zertifikats weicht ab: ${zertifikat}.`);
  return { verfahren: Object.fromEntries(gefunden), zertifikat, name: einmal('Signer #1 certificate DN:') };
}

function datei(pfad, bezeichnung) {
  const voll = resolve(pfad);
  if (!existsSync(voll) || !statSync(voll).isFile()) throw new Abbruch(66, `${bezeichnung} fehlt oder ist keine Datei.`);
  return voll;
}

// Signiert, prüft und veröffentlicht. Erkannte Fehler werfen Abbruch mit dem
// Rückgabewert; unerwartete Dateisystemfehler bildet die CLI auf 1 ab.
// temp: Ordner, in dem der Arbeitsordner des Laufs entsteht.
export function signiere(werte, { ausfuehren = spawnSync, melde = console.log, umgebung = process.env, temp = tmpdir() } = {}) {
  const fingerabdruck = String(werte.fingerabdruck).replaceAll(':', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerabdruck)) throw new Abbruch(64, '--fingerabdruck ist kein SHA-256 aus 64 Hexadezimalziffern.');
  if (!/^[A-Za-z0-9._-]+$/.test(werte.alias)) throw new Abbruch(64, '--alias enthält Zeichen, die das Skript nicht zulässt.');

  const apk = datei(werte.apk, 'Die unsignierte Datei');
  const schluessel = datei(werte.schluessel, 'Die Schlüsseldatei');
  const kennwortDatei = werte.kennwortDatei === undefined ? null : datei(werte.kennwortDatei, 'Die Kennwortdatei');

  const schutz = geschuetzteOrdner(ausfuehren);
  for (const [pfad, name] of [[schluessel, 'Schlüsseldatei'], [kennwortDatei, 'Kennwortdatei']]) {
    if (pfad === null) continue;
    const echt = aufgeloest(pfad, `Die ${name}`);
    if (schutz.ordner.some((ordner) => liegtIn(ordner, echt))) {
      throw new Abbruch(64, `Die ${name} liegt in einem Arbeitsordner des Repositorys. Schlüssel und Kennwörter gehören nicht dorthin.`);
    }
  }

  const aus = resolve(werte.aus);
  if (aus === apk) throw new Abbruch(64, '--aus nennt die unsignierte Datei. Die signierte Datei ist eine eigene Datei.');
  if (existsSync(aus)) throw new Abbruch(64, 'Die Ausgabedatei besteht schon, das Skript überschreibt nichts.');
  if (!statSync(dirname(aus), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Abbruch(66, 'Der Ordner für die signierte Datei fehlt oder ist kein Ordner.');
  }

  const jdk = findeJdk(umgebung);
  if (!jdk.pfad) throw new Abbruch(69, `Kein JDK ${vorgabe.jdk.hauptversion} gefunden. JAVA_HOME setzen oder ein JDK nach docs/toolchain.md installieren.`);
  const java = join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java');
  const sdk = resolve(werte.sdk ?? umgebung.ANDROID_HOME ?? standardSdk(umgebung));
  const werkzeuge = join(sdk, 'build-tools', vorgabe.android.buildTools);
  const jar = join(werkzeuge, 'lib', 'apksigner.jar');
  const zipalign = join(werkzeuge, windows ? 'zipalign.exe' : 'zipalign');
  for (const werkzeug of [jar, zipalign]) {
    if (!existsSync(werkzeug)) throw new Abbruch(69, `Das Werkzeug fehlt: ${werkzeug}. Das Projekt-SDK nach docs/toolchain.md einrichten.`);
  }
  // Dieselben Angaben zum Speicher wie in der Hülle apksigner aus den Build-Tools.
  const apksigner = (argumente, optionen) => ausfuehren(java, ['-Xmx1024M', '-Xss1m', '-jar', jar, ...argumente], optionen);
  const ausgerichtet = (pfad) => ausfuehren(zipalign, ['-c', '4', pfad], { encoding: 'utf8' }).status === 0;

  const version = apksigner(['--version'], { encoding: 'utf8' });
  melde(`JDK        ${jdk.version}  ${jdk.pfad}`);
  melde(`Build-Tools ${vorgabe.android.buildTools}, apksigner ${`${version.stdout ?? ''}`.trim() || 'ohne Angabe'}`);
  melde(`Eingabe    ${apk}`);
  for (const h of jdk.hinweise) melde(`Hinweis: ${h}`);
  if (!schutz.mitGit) melde('Hinweis: Git gibt keine Auskunft über weitere Arbeitsordner. Geprüft ist nur der Ordner des Skripts.');

  const vorher = summeVon(gelesen(apk, 'Die unsignierte Datei'));
  if (!ausgerichtet(apk)) {
    throw new Abbruch(1, 'Die Ausrichtung der unsignierten Datei stimmt nicht. Das Skript richtet nicht selbst aus, das ist ein eigener Schritt mit zipalign vor dem Signieren.');
  }

  // Eigener Ordner für diesen Lauf im Temp-Ordner des Benutzers. Unter Linux und
  // macOS legt mkdtemp ihn nur für den Benutzer an, das prüft das Skript nach.
  // Unter Windows gelten die Rechte des Temp-Ordners, das Skript prüft sie nicht.
  let arbeit;
  try {
    arbeit = mkdtempSync(join(temp, 'fristenrechner-signieren-'));
  } catch (fehler) {
    throw new Abbruch(1, `Der Arbeitsordner lässt sich nicht anlegen (${fehler.code ?? 'Fehler'}).`);
  }
  if (!windows && (statSync(arbeit).mode & 0o077) !== 0) {
    rmSync(arbeit, { recursive: true, force: true });
    throw new Abbruch(1, 'Der Arbeitsordner ist nicht nur für den Benutzer zugänglich.');
  }
  const vorlaeufig = join(arbeit, `${basename(aus)}.ungeprueft`);
  const gescheitert = (text, code = 1) => new Abbruch(code, `${text} Die ungeprüfte Datei bleibt liegen: ${vorlaeufig}`);
  const privat = [[schluessel, '<Schlüsseldatei>'], [kennwortDatei, '<Kennwortdatei>']];

  // Mit Kennwortdatei fängt das Skript die Ausgabe von apksigner ab und gibt sie
  // gekürzt weiter. Ohne Kennwortdatei fragt apksigner im Dialog, dafür braucht
  // es die Konsole, und seine Meldungen erscheinen unverändert.
  const signieren = apksigner(['sign',
    '--ks', schluessel, '--ks-type', 'PKCS12', '--ks-key-alias', werte.alias,
    ...(kennwortDatei ? ['--ks-pass', `file:${kennwortDatei}`] : []),
    '--v1-signing-enabled', String(VERFAHREN.v1), '--v2-signing-enabled', String(VERFAHREN.v2),
    '--v3-signing-enabled', String(VERFAHREN.v3), '--v4-signing-enabled', String(VERFAHREN.v4),
    '--alignment-preserved', 'true', '--out', vorlaeufig, apk],
  kennwortDatei ? { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] } : { stdio: 'inherit' });
  const gemeldet = kennwortDatei ? werkzeugmeldung(signieren, privat) : [];
  if (signieren.status !== 0 || !existsSync(vorlaeufig)) {
    rmSync(arbeit, { recursive: true, force: true });
    throw new Abbruch(1, ['apksigner hat nicht signiert.', ...gemeldet.map((z) => `  apksigner: ${z}`)].join('\n'));
  }
  for (const zeile of gemeldet) melde(`Hinweis von apksigner: ${zeile}`);

  // Die signierte Datei ist keine Eingabe: Lässt sie sich nicht lesen, endet der Lauf mit 1.
  const lies = () => {
    try {
      return gelesen(vorlaeufig, 'Die signierte Datei');
    } catch (fehler) {
      throw gescheitert(fehler.message);
    }
  };
  const signiert = summeVon(lies());
  // -Werr: Warnungen lassen die Prüfung scheitern. Ab API 24 prüfen, damit
  // apksigner v2 und v3 verifiziert; ab der Manifest-Mindest-API 30 würde es v2
  // überspringen. Dies ändert nur den Prüfbereich, nicht die Mindest-API der App.
  const pruefung = apksigner(['verify', '--verbose', '--print-certs', '-Werr', '--min-sdk-version', '24', vorlaeufig], { encoding: 'utf8' });
  if (pruefung.status !== 0) {
    const zeilen = werkzeugmeldung(pruefung, privat);
    const erste = zeilen.find((z) => /^(WARNING|ERROR)\b/.test(z)) ?? zeilen[0] ?? 'ohne Meldung';
    throw gescheitert(`apksigner verify scheitert: ${erste}`);
  }
  let ergebnis;
  try {
    ergebnis = pruefeAusgabe(`${pruefung.stdout ?? ''}`, fingerabdruck, `${pruefung.stderr ?? ''}`);
  } catch (fehler) {
    throw fehler instanceof Abbruch ? gescheitert(fehler.message) : fehler;
  }
  if (!ausgerichtet(vorlaeufig)) throw gescheitert('Die Ausrichtung der signierten Datei stimmt nicht.');
  let eingabe;
  try {
    eingabe = gelesen(apk, 'Die unsignierte Datei');
  } catch (fehler) {
    throw gescheitert(fehler.message, fehler.code);
  }
  if (summeVon(eingabe) !== vorher) throw gescheitert('Die unsignierte Datei hat sich verändert.');

  // Veröffentlicht wird aus dem Speicher: genau die Bytes, deren Prüfsumme vor und
  // nach der Prüfung gleich ist. Besteht das Ziel inzwischen, scheitert das Anlegen.
  const inhalt = lies();
  if (summeVon(inhalt) !== signiert) throw gescheitert('Die signierte Datei hat sich während der Prüfung verändert.');
  let ausgabe;
  try {
    ausgabe = openSync(aus, 'wx');
  } catch (fehler) {
    throw gescheitert(`Die Ausgabedatei lässt sich nicht anlegen (${fehler.code ?? 'Fehler'}), das Skript überschreibt nichts.`);
  }
  // Erst nach erfolgreichem exklusivem Öffnen gehört das Ziel diesem Lauf.
  // Auch ein Teil-Schreibfehler oder eine fehlgeschlagene Leseprüfung räumt es auf.
  try {
    try {
      writeFileSync(ausgabe, inhalt);
    } finally {
      closeSync(ausgabe);
    }
    if (summe(aus) !== signiert) throw new Abbruch(1, 'Die Ausgabedatei war nicht die geprüfte Datei.');
  } catch (fehler) {
    const grund = fehler instanceof Abbruch ? fehler.message
      : `Schreiben oder Prüfen der Ausgabedatei gescheitert (${fehler.code ?? 'Fehler'}).`;
    try {
      rmSync(aus, { force: true });
    } catch (aufraeumfehler) {
      throw gescheitert(`${grund} Die eigene unvollständige Ausgabe lässt sich nicht entfernen (${aufraeumfehler.code ?? 'Fehler'}): ${aus}.`);
    }
    throw gescheitert(`${grund} Die eigene Ausgabedatei ist wieder entfernt.`);
  }
  rmSync(arbeit, { recursive: true, force: true });

  const v = ergebnis.verfahren;
  melde(`Verfahren  v1 ${v.v1}, v2 ${v.v2}, v3 ${v.v3}, v3.1 ${v['v3.1']}, v4 ${v.v4}, Ausrichtung erhalten`);
  melde(`Zertifikat ${ergebnis.name}`);
  melde(`Fingerabdruck ${ergebnis.zertifikat}`);
  melde(`Ausgabe    ${aus}`);
  melde(`           ${statSync(aus).size} Bytes, SHA-256 ${signiert}`);
  melde('ERGEBNIS: signiert und geprüft');
  return { aus, summe: signiert, ...ergebnis };
}
