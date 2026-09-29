#!/usr/bin/env node
// Baut und prüft die App.
//   --web    Rechenkern bauen, Seite der App mit Astro bauen, danach K1 und K2
//   --check  Typprüfung der App mit astro check
// Astro läuft immer über scripts/astro.mjs, also ohne Telemetrie. Jeder
// Rückgabewert wird geprüft. Rückgabewert: 0 bei Erfolg, sonst 1.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefeDist, pruefeKonfiguration } from './app-pruefungen.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(wurzel, 'app');
const umgebung = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', CI: '1' };

function lauf(titel, programm, argumente, ordner) {
  console.log(`== ${titel}`);
  const ergebnis = spawnSync(programm, argumente, { cwd: ordner, env: umgebung, stdio: 'inherit' });
  if (ergebnis.error || ergebnis.status !== 0) {
    console.error(`Fehler: ${titel} ist gescheitert (${ergebnis.error?.code ?? `Rückgabewert ${ergebnis.status}`}).`);
    return false;
  }
  return true;
}

function kernBauen() {
  // npm setzt npm_execpath, wenn das Skript über npm run läuft.
  const npm = process.env.npm_execpath;
  if (!npm) {
    console.error('Fehler: Aufruf über npm erwartet (npm run build --workspace app), npm_execpath fehlt.');
    return false;
  }
  return lauf('Rechenkern bauen', process.execPath, [npm, 'run', 'build', '--workspace', 'packages/kern'], wurzel);
}

function pruefen() {
  const config = JSON.parse(readFileSync(join(app, 'capacitor.config.json'), 'utf8'));
  const k1 = pruefeKonfiguration(config, { publicOrdner: join(app, 'public') });
  console.log(`== K1 Konfiguration: ${k1.length ? `${k1.length} Fehler` : 'bestanden'}`);
  for (const f of k1) console.error(`K1: ${f}`);
  const { fehler: k2, bericht } = pruefeDist(join(app, config.webDir), {
    fehlerseite: config.server.errorPath,
    quellOrdner: [join(wurzel, 'packages', 'kern', 'src'), join(wurzel, 'packages', 'oberflaeche', 'src')],
  });
  console.log(`== K2 dist: ${bericht.dateien} Dateien, ${k2.length ? `${k2.length} Fehler` : 'bestanden'}`);
  for (const f of k2) console.error(`K2: ${f}`);
  if (process.argv.includes('--bericht')) console.log(JSON.stringify(bericht, null, 2));
  return k1.length === 0 && k2.length === 0;
}

const schalter = process.argv.slice(2).filter((a) => a !== '--bericht');
let ok;
if (schalter.length === 1 && schalter[0] === '--web') {
  ok = kernBauen()
    && lauf('Seite der App bauen', process.execPath, [join(wurzel, 'scripts', 'astro.mjs'), 'build'], app)
    && pruefen();
} else if (schalter.length === 1 && schalter[0] === '--check') {
  ok = lauf('Typprüfung der App', process.execPath, [join(wurzel, 'scripts', 'astro.mjs'), 'check'], app);
} else if (schalter.length === 1 && schalter[0] === '--pruefen') {
  ok = pruefen();
} else {
  console.error('Aufruf: node scripts/app-bauen.mjs --web | --check | --pruefen [--bericht]');
  ok = false;
}
process.exit(ok ? 0 : 1);
