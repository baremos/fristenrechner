#!/usr/bin/env node
// Baut und prüft die App. Jeder Fehler beendet die Kette vor dem nächsten Schritt.
// --web: Kern, Astro, K1, K2. --android: zusätzlich Sync, K3, K4, Gradle, K5.
// --android-quellen gibt die von Capacitor eingebundenen Quellordner aus.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as appPruefungen from './app-pruefungen.mjs';

const wurzelVorgabe = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const aufruf = 'Aufruf: node scripts/app-bauen.mjs --web | --check | --pruefen | --android [--aufgabe assembleDebug|assembleRelease] [--streng] | --android-quellen [--bericht]';

export function argumente(argv) {
  const werte = { modus: null, aufgabe: 'assembleDebug', streng: false, bericht: false };
  const gesehen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (gesehen.has(a)) throw new Error(`Argument mehrfach angegeben: ${a}`);
    gesehen.add(a);
    if (['--web', '--check', '--pruefen', '--android', '--android-quellen'].includes(a)) {
      if (werte.modus) throw new Error('Genau einen Arbeitsgang angeben.');
      werte.modus = a.slice(2);
    } else if (a === '--bericht') werte.bericht = true;
    else if (a === '--streng') werte.streng = true;
    else if (a === '--aufgabe') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Wert für --aufgabe fehlt.');
      werte.aufgabe = argv[++i];
    } else throw new Error(`Unbekanntes Argument: ${a}`);
  }
  if (!werte.modus) throw new Error('Arbeitsgang fehlt.');
  if (werte.modus !== 'android' && (werte.streng || gesehen.has('--aufgabe'))) {
    throw new Error('--aufgabe und --streng sind nur mit --android zulässig.');
  }
  // K5 benötigt eine eindeutige APK und die zugehörige Debug-Eigenschaft.
  if (!/^(?::app:)?assemble(?:Debug|Release)$/.test(werte.aufgabe)) {
    throw new Error('--aufgabe unterstützt assembleDebug und assembleRelease, auch mit :app:-Präfix; andere Aufgaben liefern keine eindeutig zugeordnete APK.');
  }
  return werte;
}

function liegtDarunter(basis, pfad) {
  const rel = relative(basis, pfad);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

// Ausschließlich die beiden von Capacitor erzeugten Zeilenformen lesen, kein
// Groovy ausführen. Unbekannte Formen ergeben keine unvollständige Behalten-Liste.
export function androidQuellen(wurzel) {
  const projekt = join(wurzel, 'app', 'android');
  const datei = join(projekt, 'capacitor.settings.gradle');
  const module = new Set();
  const ordner = new Map();
  for (const roh of readFileSync(datei, 'utf8').split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile || zeile.startsWith('//')) continue;
    const einbinden = /^include\s+(['"])(:[A-Za-z0-9_-]+)\1\s*;?$/.exec(zeile);
    if (einbinden) {
      if (module.has(einbinden[2])) throw new Error('Android-Quellen: Modul mehrfach eingebunden.');
      module.add(einbinden[2]);
      continue;
    }
    const zuordnung = /^project\((['"])(:[A-Za-z0-9_-]+)\1\)\.projectDir\s*=\s*new File\((['"])([^'"\\$\r\n]+)\3\)\s*;?$/.exec(zeile);
    if (!zuordnung) throw new Error('Android-Quellen: Unbekannte Zeilenform in capacitor.settings.gradle.');
    const [, , modul, , pfad] = zuordnung;
    if (ordner.has(modul)) throw new Error('Android-Quellen: Quellordner eines Moduls mehrfach angegeben.');
    const absolut = resolve(projekt, pfad);
    if (!liegtDarunter(wurzel, absolut) || !liegtDarunter(realpathSync(wurzel), realpathSync(absolut))) {
      throw new Error('Android-Quellen: Quellordner liegt außerhalb des Repositorys.');
    }
    if (!statSync(absolut).isDirectory()) throw new Error('Android-Quellen: Quellordner ist kein Verzeichnis.');
    ordner.set(modul, relative(wurzel, absolut).split(sep).join('/'));
  }
  if (module.size === 0 || module.size !== ordner.size || [...module].some((modul) => !ordner.has(modul))) {
    throw new Error('Android-Quellen: Module und Quellordner sind nicht vollständig zugeordnet.');
  }
  return [...new Set(ordner.values())].sort();
}

export function findeNpm(umgebung, node = process.execPath) {
  if (umgebung.npm_execpath) {
    if (!existsSync(umgebung.npm_execpath)) throw new Error('npm_execpath nennt eine fehlende Datei.');
    return umgebung.npm_execpath;
  }
  // Auch den dokumentierten direkten Aufruf mit node unterstützen. Die Node-
  // Archive und die üblichen Linux-Installationen legen npm neben Node ab.
  const basis = dirname(node);
  for (const kandidat of [join(basis, 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(basis, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(basis, 'npm')]) {
    if (!existsSync(kandidat) || !statSync(kandidat).isFile()) continue;
    // Eine eventuelle Shell-Datei namens npm nicht an Node weiterreichen.
    if (kandidat.endsWith('npm-cli.js') || /^#![^\r\n]*\bnode(?:\s|$)/.test(readFileSync(kandidat, 'utf8'))) return realpathSync(kandidat);
  }
  throw new Error('npm nicht gefunden. Aufruf über npm run build --workspace app oder npm neben Node installieren.');
}

// Die ersetzbaren Funktionen erlauben Tests der gesamten Reihenfolge ohne Build.
export function baue(argv, {
  wurzel = wurzelVorgabe, umgebung = process.env, node = process.execPath,
  spawn = spawnSync, pruefungen = appPruefungen, ausgabe = console.log, fehlerausgabe = console.error,
} = {}) {
  let werte;
  try {
    werte = argumente(argv);
  } catch (fehler) {
    fehlerausgabe(`Fehler: ${fehler.message}`);
    fehlerausgabe(aufruf);
    return 1;
  }
  try {
    const app = join(wurzel, 'app');
    const env = { ...umgebung, ASTRO_TELEMETRY_DISABLED: '1', CI: '1' };
    function lauf(titel, args, cwd) {
      ausgabe(`== ${titel}`);
      const ergebnis = spawn(node, args, { cwd, env, stdio: 'inherit' });
      if (ergebnis.error || ergebnis.status !== 0) {
        fehlerausgabe(`Fehler: ${titel} ist gescheitert (${ergebnis.error?.code ?? `Rückgabewert ${ergebnis.status}`}).`);
        return false;
      }
      return true;
    }
    function pruefung(name, fehler, bericht) {
      ausgabe(`== ${name}: ${fehler.length ? `${fehler.length} Fehler` : 'bestanden'}`);
      for (const f of fehler) fehlerausgabe(`${name.split(' ')[0]}: ${f}`);
      if (werte.bericht && bericht) ausgabe(JSON.stringify(bericht, null, 2));
      return fehler.length === 0;
    }
    function pruefeWeb() {
      const config = JSON.parse(readFileSync(join(app, 'capacitor.config.json'), 'utf8'));
      if (!pruefung('K1 Konfiguration', pruefungen.pruefeKonfiguration(config, { publicOrdner: join(app, 'public') }))) return false;
      const { fehler, bericht } = pruefungen.pruefeDist(join(app, config.webDir), {
        fehlerseite: config.server.errorPath,
        quellOrdner: [join(wurzel, 'packages', 'kern', 'src'), join(wurzel, 'packages', 'oberflaeche', 'src')],
      });
      return pruefung(`K2 dist (${bericht.dateien} Dateien)`, fehler, bericht);
    }
    if (werte.modus === 'android-quellen') {
      for (const quelle of androidQuellen(wurzel)) ausgabe(quelle);
      return 0;
    }
    if (werte.modus === 'check') return lauf('Typprüfung der App', [join(wurzel, 'scripts', 'astro.mjs'), 'check'], app) ? 0 : 1;
    if (werte.modus === 'pruefen') return pruefeWeb() ? 0 : 1;
    const npm = findeNpm(umgebung, node);
    if (!lauf('Rechenkern bauen', [npm, 'run', 'build', '--workspace', 'packages/kern'], wurzel)
      || !lauf('Seite der App bauen', [join(wurzel, 'scripts', 'astro.mjs'), 'build'], app)
      || !pruefeWeb()) return 1;
    if (werte.modus === 'web') return 0;
    const vorher = pruefungen.leseAndroidZustand({ wurzel, umgebung: env });
    if (vorher.status.length) {
      if (werte.streng) {
        fehlerausgabe(`K3: git status --porcelain -- app/android ist vor dem Sync nicht leer:\n${vorher.status.join('\n')}`);
        return 1;
      }
      ausgabe(`Arbeitskopie unter app/android enthält Änderungen:\n${vorher.status.join('\n')}\nK3 prüft, dass der Sync diesen Zustand unverändert lässt.`);
    }
    if (!lauf('Android synchronisieren', [join(wurzel, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android'], app)
      || !pruefung('K3 Sync', pruefungen.pruefeSync({ wurzel, umgebung: env, ...(werte.streng ? {} : { vorher }) }))
      || !pruefung('K4 Gradle', pruefungen.pruefeGradle({ wurzel }))) return 1;
    const args = [join(wurzel, 'scripts', 'android-build.mjs'), '--projekt', 'app/android', '--aufgabe', werte.aufgabe];
    if (werte.streng) args.push('--streng');
    if (!lauf('Android bauen', args, wurzel)) return 1;
    const debug = werte.aufgabe.endsWith('Debug');
    const apk = join(app, 'android', 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release-unsigned.apk');
    if (!existsSync(apk) || !statSync(apk).isFile()) throw new Error(`Erzeugte APK fehlt: ${relative(wurzel, apk)}`);
    ausgabe(`APK: ${relative(wurzel, apk).split(sep).join('/')}`);
    return pruefung('K5 APK', pruefungen.pruefeApk(apk, { wurzel, debug, umgebung: env })) ? 0 : 1;
  } catch (fehler) {
    fehlerausgabe(`Fehler: ${fehler.message}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = baue(process.argv.slice(2));
