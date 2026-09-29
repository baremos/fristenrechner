// Gemeinsame Suche nach JDK und Android SDK für die Skripte in diesem Ordner.
// Versionen und Orte: scripts/toolchain.json, erläutert in docs/toolchain.md.
// Die Funktionen ändern nichts am Rechner und geben nichts aus.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
export const vorgabe = JSON.parse(readFileSync(join(hier, 'toolchain.json'), 'utf8'));
export const windows = process.platform === 'win32';

// Vergleicht zwei Versionen aus Zahlen und Punkten. Fehlende Stellen zählen als 0.
export function vergleiche(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Liefert die Version, wenn der Ordner ein vollständiges JDK der festgelegten
// Hauptversion und Kennung enthält. Sonst den Grund, warum er nicht passt.
export function pruefeJdk(javaHome) {
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

// Sucht das JDK: zuerst JAVA_HOME, dann die üblichen Ordner, neueste Namen zuerst.
// Liefert Pfad, Version, Hinweise und den Grund, falls JAVA_HOME übersprungen wurde.
// Ohne Treffer: null im Feld pfad.
export function findeJdk(umgebung = process.env) {
  const kandidaten = [];
  if (umgebung.JAVA_HOME) kandidaten.push(umgebung.JAVA_HOME);
  const programme = umgebung.ProgramFiles ?? 'C:\\Program Files';
  const ordner = windows
    ? [join(programme, 'Eclipse Adoptium'), join(programme, 'Microsoft'), join(programme, 'Android', 'openjdk')]
    : ['/usr/lib/jvm'];
  for (const o of ordner) {
    if (!existsSync(o)) continue;
    for (const name of readdirSync(o).sort().reverse()) kandidaten.push(join(o, name));
  }
  const uebersprungen = [];
  for (const k of kandidaten) {
    const ergebnis = pruefeJdk(k);
    if (ergebnis.version) {
      const hinweise = [];
      // Für Release-Builds ist der Patchstand festgelegt. Ein Zusatz wie 21.0.12.1 zählt dazu.
      const stand = ergebnis.version.split(/[^\d.]/)[0].split('.').slice(0, 3).join('.');
      if (vergleiche(stand, vorgabe.jdk.release) !== 0) {
        hinweise.push(`JDK ${ergebnis.version} weicht vom Stand für Release-Builds ${vorgabe.jdk.release} ab.`);
      }
      return { pfad: k, version: ergebnis.version, hinweise, uebersprungen };
    }
    if (k === umgebung.JAVA_HOME) uebersprungen.push(`JAVA_HOME (${k}): ${ergebnis.grund}`);
  }
  return { pfad: null, version: null, hinweise: [], uebersprungen };
}

// Standardordner des Projekt-SDK im Benutzerbereich.
export function standardSdk(umgebung = process.env) {
  const teile = vorgabe.android.sdkOrdner.split('/');
  if (windows && umgebung.LOCALAPPDATA) return join(umgebung.LOCALAPPDATA, ...teile);
  return join(umgebung.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), ...teile);
}
