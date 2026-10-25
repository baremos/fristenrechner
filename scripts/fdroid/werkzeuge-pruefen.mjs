#!/usr/bin/env node
// Prüft im F-Droid-Rezept, ob die aus Quelltext gebauten Werkzeuge des Web-Builds zum Lockfile passen.
// Das Rezept nennt seine srclibs mit festem Tag. Ändert eine neue Fassung das Lockfile, bricht der Build
// hier mit einer klaren Meldung ab, statt später mit falscher Bindung oder abweichender APK.
// Aufruf: node scripts/fdroid/werkzeuge-pruefen.mjs rolldown@v1.2.9 astro-compiler-rs@v0.4.1 \
//   satteri@satteri-v0.10.5 lightningcss@v1.33.0 esbuild@v0.28.2
// Rückgabewerte: 0 alles passt, 1 Abweichung, 64 falscher Aufruf.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzelVorgabe = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// srclib-Name → npm-Paket im Lockfile und Form des Git-Tags im Quellrepository.
export const WERKZEUGE = Object.freeze({
  rolldown: { paket: 'rolldown', tag: (version) => `v${version}` },
  'astro-compiler-rs': { paket: '@astrojs/compiler-binding', tag: (version) => `v${version}` },
  satteri: { paket: 'satteri', tag: (version) => `satteri-v${version}` },
  lightningcss: { paket: 'lightningcss', tag: (version) => `v${version}` },
  esbuild: { paket: 'esbuild', tag: (version) => `v${version}` },
});

export class Aufruffehler extends Error {}

export function lockVersion(lock, paket) {
  const version = lock?.packages?.[`node_modules/${paket}`]?.version;
  return typeof version === 'string' && version ? version : null;
}

export function zerlegeAngabe(angabe) {
  const text = String(angabe);
  const trenner = text.indexOf('@');
  const name = trenner > 0 ? text.slice(0, trenner) : '';
  const tag = trenner > 0 ? text.slice(trenner + 1) : '';
  if (!name || !tag || tag.includes('@')) throw new Aufruffehler(`Angabe „${text}“ hat nicht die Form name@tag.`);
  if (!Object.hasOwn(WERKZEUGE, name)) throw new Aufruffehler(`Unbekannte srclib „${name}“. Bekannt: ${Object.keys(WERKZEUGE).join(', ')}.`);
  return { name, tag };
}

export function pruefeWerkzeuge(angaben, lock) {
  if (!Array.isArray(angaben) || angaben.length === 0) throw new Aufruffehler('Keine srclibs angegeben.');
  const zerlegt = angaben.map(zerlegeAngabe);
  const namen = new Set();
  for (const { name } of zerlegt) {
    if (namen.has(name)) throw new Aufruffehler(`srclib „${name}“ ist doppelt angegeben.`);
    namen.add(name);
  }
  const befunde = [];
  const passend = [];
  for (const { name, tag } of zerlegt) {
    const { paket, tag: tagZu } = WERKZEUGE[name];
    const version = lockVersion(lock, paket);
    if (!version) {
      befunde.push(`${name}@${tag}: Das Lockfile enthält ${paket} nicht. Die srclib aus dem Rezept entfernen.`);
      continue;
    }
    const erwartet = tagZu(version);
    if (erwartet !== tag) befunde.push(`${name}@${tag}: Das Lockfile verlangt ${paket} ${version}. Im Rezept ${name}@${erwartet} eintragen.`);
    else passend.push(`${paket} ${version}`);
  }
  for (const [name, { paket, tag: tagZu }] of Object.entries(WERKZEUGE)) {
    if (namen.has(name)) continue;
    const version = lockVersion(lock, paket);
    if (version) befunde.push(`${name}: Das Lockfile enthält ${paket} ${version}, das Rezept nennt keine srclib dafür. ${name}@${tagZu(version)} ergänzen.`);
  }
  return { befunde, passend };
}

export function main(argv, {
  wurzel = wurzelVorgabe, lesen = readFileSync, ausgabe = console.log, fehlerausgabe = console.error,
} = {}) {
  try {
    const lock = JSON.parse(lesen(join(wurzel, 'package-lock.json'), 'utf8'));
    const { befunde, passend } = pruefeWerkzeuge(argv, lock);
    if (befunde.length) {
      fehlerausgabe('Werkzeugprüfung: Rezept und Lockfile passen nicht zusammen.');
      for (const befund of befunde) fehlerausgabe(`- ${befund}`);
      return 1;
    }
    ausgabe(`Werkzeugprüfung bestanden: ${passend.join(', ')}.`);
    return 0;
  } catch (fehler) {
    if (fehler instanceof Aufruffehler) {
      fehlerausgabe(`Werkzeugprüfung: ${fehler.message}`);
      fehlerausgabe('Aufruf: node scripts/fdroid/werkzeuge-pruefen.mjs name@tag …');
      return 64;
    }
    fehlerausgabe(`Werkzeugprüfung: ${fehler.message}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
