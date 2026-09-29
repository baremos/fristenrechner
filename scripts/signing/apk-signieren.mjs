#!/usr/bin/env node
// Signiert eine unsignierte APK außerhalb des Gradle-Builds und prüft das Ergebnis.
// Festlegungen: docs/signierung.md, S5 bis S7, S9 und S12. Der Kern liegt in signieren.mjs.
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
// - lehnt Schlüssel- und Kennwortdateien ab, die in einem Arbeitsordner des
//   Repositorys liegen, auch im Hauptordner und in anderen Worktrees,
// - überschreibt nichts und lässt die unsignierte Datei unverändert,
// - signiert mit v2 und v3, ohne v1 und v4, und erhält die Ausrichtung,
// - arbeitet in einem eigenen Ordner neben der Ausgabe und legt die Ausgabe
//   erst nach bestandener Prüfung an. Scheitert die Prüfung, bleibt der Ordner
//   mit der ungeprüften Datei liegen.
//
// Rückgabewert: 0 bei Erfolg, 64 bei falschem Aufruf, 66 bei fehlender Eingabe,
// 69 bei fehlendem Werkzeug, 1 bei gescheitertem Signieren oder Prüfen.

import { Abbruch, signiere } from './signieren.mjs';

const NAMEN = { '--apk': 'apk', '--aus': 'aus', '--schluessel': 'schluessel', '--alias': 'alias',
  '--fingerabdruck': 'fingerabdruck', '--kennwort-datei': 'kennwortDatei', '--sdk': 'sdk' };
const PFLICHT = ['--apk', '--aus', '--schluessel', '--alias', '--fingerabdruck'];

// Meldungen nennen nie den Wert eines Arguments. Er könnte ein Kennwort sein.
function argumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 2) {
    const angabe = argv[i];
    const name = NAMEN[angabe];
    if (!name) {
      const bekannt = /^--[a-z-]+/.exec(angabe)?.[0];
      throw new Abbruch(64, bekannt ? `Unbekanntes Argument: ${bekannt}` : `Unbekanntes Argument an Stelle ${i + 1}.`);
    }
    if (argv[i + 1] === undefined || argv[i + 1] === '') throw new Abbruch(64, `Zu ${angabe} fehlt der Wert.`);
    if (name in werte) throw new Abbruch(64, `${angabe} ist doppelt angegeben.`);
    werte[name] = argv[i + 1];
  }
  for (const angabe of PFLICHT) {
    if (!(NAMEN[angabe] in werte)) throw new Abbruch(64, `${angabe} fehlt.`);
  }
  return werte;
}

try {
  signiere(argumente(process.argv.slice(2)));
} catch (fehler) {
  if (fehler instanceof Abbruch) {
    console.error(`Fehler: ${fehler.message}`);
    process.exit(fehler.code);
  }
  console.error(`Fehler: unerwarteter Abbruch (${fehler.code ?? fehler.name}).`);
  process.exit(1);
}
