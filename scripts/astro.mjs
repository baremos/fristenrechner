#!/usr/bin/env node
// Startet die Kommandozeile von Astro mit abgeschalteter Telemetrie.
// Astro meldet sonst bei build, check und sync Nutzungsdaten an
// https://telemetry.astro.build, außer ASTRO_TELEMETRY_DISABLED ist gesetzt
// (@astrojs/telemetry 3.3.3, dist/index.js und dist/post.js). Das Skript setzt
// die Variable für jeden Lauf und schreibt nichts in das Benutzerprofil.
//
// Aufruf: node scripts/astro.mjs <Befehl von Astro> [...]
// Rückgabewert: der von Astro, 1 wenn Astro nicht startet.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASTRO = join(wurzel, 'node_modules', 'astro', 'bin', 'astro.mjs');

// Umgebung für Astro: alles wie beim Aufrufer, die Telemetrie abgeschaltet.
export function umgebungFuerAstro(umgebung = process.env) {
  return { ...umgebung, ASTRO_TELEMETRY_DISABLED: '1' };
}

export function starte(argumente, { astro = ASTRO, umgebung = process.env, stdio = 'inherit' } = {}) {
  const lauf = spawnSync(process.execPath, [astro, ...argumente], { env: umgebungFuerAstro(umgebung), stdio });
  if (lauf.error) {
    console.error(`Fehler: Astro ließ sich nicht starten (${lauf.error.code ?? lauf.error.name}).`);
    return 1;
  }
  return lauf.status ?? 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exit(starte(process.argv.slice(2)));
}
