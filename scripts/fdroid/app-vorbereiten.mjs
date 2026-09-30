#!/usr/bin/env node
// Die vorhandenen K1-K4-Prüfungen ausführen; Gradle startet danach F-Droid.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidQuellen } from '../app-bauen.mjs';
import * as appPruefungen from '../app-pruefungen.mjs';

const wurzelVorgabe = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function dateiManifest(ordner) {
  if (lstatSync(ordner).isSymbolicLink()) throw new Error('Das Web-Manifest darf keine Verweise enthalten.');
  const basis = realpathSync(ordner);
  const dateien = [];
  function lesen(pfad) {
    if (lstatSync(pfad).isSymbolicLink()) throw new Error('Das Web-Manifest darf keine Verweise enthalten.');
    for (const name of readdirSync(pfad).sort()) {
      const datei = join(pfad, name);
      const info = lstatSync(datei);
      if (info.isSymbolicLink()) throw new Error('Das Web-Manifest darf keine Verweise enthalten.');
      if (info.isDirectory()) lesen(datei);
      else if (info.isFile()) dateien.push({ pfad: relative(basis, datei).split(sep).join('/'), bytes: info.size, sha256: createHash('sha256').update(readFileSync(datei)).digest('hex') });
      else throw new Error('Das Web-Manifest enthält einen unbekannten Dateityp.');
    }
  }
  lesen(basis);
  if (!dateien.length) throw new Error('Das Web-Bündel ist leer.');
  return { schemaVersion: 1, zeitpunkt: 'nach-sync-vor-bereinigung', dateien };
}

export function vorbereiten(argv, {
  wurzel = wurzelVorgabe, umgebung = process.env, spawn = spawnSync,
  pruefungen = appPruefungen, quellen = androidQuellen, manifest = dateiManifest,
  schreiben = writeFileSync, ausgabe = console.log, fehlerausgabe = console.error,
} = {}) {
  try {
    if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--nach-scanner')) throw new Error('Erlaubt ist nur --nach-scanner oder kein Argument.');
    if (argv[0] === '--nach-scanner') {
      const behalten = quellen(wurzel);
      for (const quelle of behalten) {
        if (!lstatSync(join(wurzel, quelle, 'build.gradle')).isFile()) throw new Error(`Android-Quelle fehlt nach dem Scanner: ${quelle}`);
      }
      ausgabe(`Android-Quellen nach dem Scanner vorhanden: ${behalten.join(', ')}`);
      return 0;
    }
    const lauf = umgebung.FR_FDROID_LAUF;
    if (!lauf || !isAbsolute(lauf) || !lstatSync(lauf).isDirectory()) throw new Error('FR_FDROID_LAUF muss den vorhandenen absoluten Laufordner nennen.');
    const env = { ...umgebung, ASTRO_TELEMETRY_DISABLED: '1', CI: '1' };
    const aufruf = (args, cwd) => {
      const ergebnis = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
      if (ergebnis.error || ergebnis.status !== 0) throw new Error(`Vorbereitung gescheitert: ${args[0]} (${ergebnis.error?.code ?? ergebnis.status}).`);
    };
    aufruf([join(wurzel, 'scripts/app-bauen.mjs'), '--web'], wurzel);
    // F-Droid darf vor prebuild eigene Dateien wie local.properties anlegen.
    // K3 vergleicht deshalb den vollständigen Zustand vor und nach cap sync.
    const vorher = pruefungen.leseAndroidZustand({ wurzel, umgebung: env });
    aufruf([join(wurzel, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'], join(wurzel, 'app'));
    for (const [name, pruefen] of [
      ['K3 Sync', () => pruefungen.pruefeSync({ wurzel, vorher, umgebung: env })],
      ['K4 Gradle', () => pruefungen.pruefeGradle({ wurzel, umgebung: env })],
    ]) {
      const fehler = pruefen();
      if (fehler.length) throw new Error(`${name}: ${fehler.join('\n')}`);
      ausgabe(`${name}: bestanden`);
    }
    schreiben(join(lauf, 'web-vor-bereinigung.json'), `${JSON.stringify(manifest(join(wurzel, 'app/android/app/src/main/assets/public')), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return 0;
  } catch (fehler) {
    fehlerausgabe(`F-Droid-Vorbereitung: ${fehler.message}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = vorbereiten(process.argv.slice(2));
