// Gemeinsamer Aufruf des JDK-Parsers; kein eigener XML-Leser.
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findeJdk, vorgabe, windows } from './werkzeuge.mjs';

// Wie SdkPruefung.java direkt aus der Quelle starten, ohne Compile-Schritt.
// Ein Aufruf startet genau einen Parser. Textwerte sind nur ausdrücklich erlaubt.
export function leseQuellXml(datei, java, umgebung = process.env, { textwerte = false } = {}) {
  if (!java) {
    const jdk = findeJdk(umgebung);
    if (!jdk.pfad) throw new Error(`Kein JDK ${vorgabe.jdk.hauptversion} für die XML-Quellprüfung gefunden. Siehe docs/toolchain.md.`);
    java = join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java');
  }
  const lauf = spawnSync(java, [fileURLToPath(new URL('XmlQuelle.java', import.meta.url)), datei, ...(textwerte ? ['--textwerte'] : [])], {
    encoding: 'utf8', env: umgebung, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  });
  if (lauf.error || lauf.status !== 0) {
    throw new Error(`${basename(datei)}: XML-Quellprüfung fehlgeschlagen (${lauf.error?.code ?? `Rückgabewert ${lauf.status}`}).`);
  }
  return JSON.parse(lauf.stdout);
}
