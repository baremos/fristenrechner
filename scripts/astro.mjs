#!/usr/bin/env node
// Startet die Kommandozeile von Astro mit abgeschalteter Telemetrie.
// Astro 7.3.3 meldet bei build und bei sync Nutzungsdaten an
// https://telemetry.astro.build, bei check nur nach bestimmten Fehlern
// (@astrojs/telemetry 3.3.3, dist/index.js und dist/post.js). Kein Versand,
// wenn ASTRO_TELEMETRY_DISABLED oder TELEMETRY_DISABLED einen Wert hat oder im
// Benutzerprofil "enabled: false" steht. Das Skript setzt ASTRO_TELEMETRY_DISABLED
// für jeden Lauf und schreibt selbst nichts in das Profil. Durchgereichte Befehle
// wie "astro telemetry" ändern das Profil trotzdem.
//
// Aufruf: node scripts/astro.mjs <Befehl von Astro> [...]
// Rückgabewert: der von Astro, 1 wenn Astro fehlt oder nicht startet.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASTRO = join(wurzel, 'node_modules', 'astro', 'bin', 'astro.mjs');

// Umgebung für Astro: alles wie beim Aufrufer, die Telemetrie abgeschaltet.
export function umgebungFuerAstro(umgebung = process.env) {
  return { ...umgebung, ASTRO_TELEMETRY_DISABLED: '1' };
}

export function starte(argumente, { astro = ASTRO, umgebung = process.env, stdio = 'inherit' } = {}) {
  if (!existsSync(astro)) {
    console.error('Fehler: Astro ist nicht installiert. Zuerst npm ci in der Wurzel des Repositorys.');
    return 1;
  }
  const lauf = spawnSync(process.execPath, [astro, ...argumente], { env: umgebungFuerAstro(umgebung), stdio });
  if (lauf.error) {
    console.error(`Fehler: Astro ließ sich nicht starten (${lauf.error.code ?? lauf.error.name}).`);
    return 1;
  }
  return lauf.status ?? 1;
}

if (import.meta.main) process.exit(starte(process.argv.slice(2)));
