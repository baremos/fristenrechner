// Kern von apk-signieren.mjs: Signieren, Prüfen und Veröffentlichen einer APK.
// Festlegungen: docs/signierung.md, S5 bis S7, S9 und S12.
// Alle Aufrufe fremder Programme laufen über die Funktion "ausfuehren", damit
// Tests Ausgaben und gleichzeitige Änderungen nachstellen können.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
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

export const summe = (pfad) => createHash('sha256').update(readFileSync(pfad)).digest('hex');

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
export function pruefeAusgabe(ausgabe, fingerabdruck) {
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

// Signiert, prüft und veröffentlicht. Wirft Abbruch mit dem Rückgabewert.
export function signiere(werte, { ausfuehren = spawnSync, melde = console.log, umgebung = process.env } = {}) {
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
  if (!existsSync(dirname(aus))) throw new Abbruch(66, 'Der Ordner für die signierte Datei fehlt.');

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

  const vorher = summe(apk);
  if (!ausgerichtet(apk)) {
    throw new Abbruch(1, 'Die Ausrichtung der unsignierten Datei stimmt nicht. Das Skript richtet nicht selbst aus, das ist ein eigener Schritt mit zipalign vor dem Signieren.');
  }

  // Eigener Ordner für diesen Lauf. Niemand sonst kennt seinen Namen.
  const arbeit = mkdtempSync(join(dirname(aus), '.signieren-'));
  const vorlaeufig = join(arbeit, `${basename(aus)}.ungeprueft`);
  const gescheitert = (text) => new Abbruch(1, `${text} Die ungeprüfte Datei bleibt liegen: ${vorlaeufig}`);

  const signieren = apksigner(['sign',
    '--ks', schluessel, '--ks-type', 'PKCS12', '--ks-key-alias', werte.alias,
    ...(kennwortDatei ? ['--ks-pass', `file:${kennwortDatei}`] : []),
    '--v1-signing-enabled', String(VERFAHREN.v1), '--v2-signing-enabled', String(VERFAHREN.v2),
    '--v3-signing-enabled', String(VERFAHREN.v3), '--v4-signing-enabled', String(VERFAHREN.v4),
    '--alignment-preserved', 'true', '--out', vorlaeufig, apk], { stdio: 'inherit' });
  if (signieren.status !== 0 || !existsSync(vorlaeufig)) {
    rmSync(arbeit, { recursive: true, force: true });
    throw new Abbruch(1, 'apksigner hat nicht signiert.');
  }

  const signiert = summe(vorlaeufig);
  const pruefung = apksigner(['verify', '--verbose', '--print-certs', vorlaeufig], { encoding: 'utf8' });
  if (pruefung.status !== 0) {
    const erste = `${pruefung.stdout ?? ''}${pruefung.stderr ?? ''}`.trim().split(/\r?\n/)[0];
    throw gescheitert(`apksigner verify scheitert: ${erste}`);
  }
  let ergebnis;
  try {
    ergebnis = pruefeAusgabe(pruefung.stdout, fingerabdruck);
  } catch (fehler) {
    throw fehler instanceof Abbruch ? gescheitert(fehler.message) : fehler;
  }
  if (!ausgerichtet(vorlaeufig)) throw gescheitert('Die Ausrichtung der signierten Datei stimmt nicht.');
  if (summe(apk) !== vorher) throw gescheitert('Die unsignierte Datei hat sich verändert.');
  if (summe(vorlaeufig) !== signiert) throw gescheitert('Die signierte Datei hat sich während der Prüfung verändert.');

  // Veröffentlichen, ohne etwas zu ersetzen: Besteht das Ziel inzwischen, scheitert die Kopie.
  try {
    copyFileSync(vorlaeufig, aus, constants.COPYFILE_EXCL);
  } catch (fehler) {
    throw gescheitert(`Die Ausgabedatei lässt sich nicht anlegen (${fehler.code ?? 'Fehler'}), das Skript überschreibt nichts.`);
  }
  if (summe(aus) !== signiert) {
    // Die Datei hat dieser Lauf selbst angelegt. Unter dem endgültigen Namen bleibt nichts Ungeprüftes liegen.
    rmSync(aus, { force: true });
    throw gescheitert('Die Ausgabedatei war nicht die geprüfte Datei und ist wieder entfernt.');
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
