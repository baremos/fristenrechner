#!/usr/bin/env node
// Prüft npm-Lizenzen offline. Führt weder npm noch Code aus Abhängigkeiten aus.
// Aufruf: node scripts/check-licenses.mjs [--json] [--wurzel <Ordner>]
//                                      [--packliste <npm-pack-JSON>]
// Regeln und Grenzen: docs/lizenzen.md, Daten: check-licenses.json.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
export const vorgabe = JSON.parse(readFileSync(join(hier, 'check-licenses.json'), 'utf8'));
const objekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const gleich = (a, b) => JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));

function sortiert(x) {
  if (Array.isArray(x)) return x.map(sortiert);
  if (!objekt(x)) return x;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortiert(x[k])]));
}

function leseJson(datei) {
  return JSON.parse(readFileSync(datei, 'utf8').replace(/^\uFEFF/, ''));
}

function pruefePfad(pfad) {
  if (typeof pfad !== 'string' || /[\\:\x00-\x1f]/.test(pfad)
      || pfad.split('/').some((teil) => !teil || teil === '.' || teil === '..')) {
    throw new Error(`Ungültiger relativer Paketpfad: ${pfad}`);
  }
  return pfad;
}

// Ein kleiner Parser für SPDX-AND/OR und Klammern; AND bindet stärker als OR.
// Zuerst den ganzen Ausdruck prüfen, danach auswerten: Unbekanntes darf auch
// in einem nicht gewählten OR-Zweig nicht unbemerkt bleiben.
export function pruefeAusdruck(text, bereich) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Lizenzangabe fehlt oder ist kein SPDX-Text.');
  const teile = text.match(/[A-Za-z0-9][A-Za-z0-9.+:-]*|[()]|[^\s]/g) ?? [];
  const kennungen = new Map(Object.keys(vorgabe.lizenzen).map((id) => [id.toLowerCase(), id]));
  let index = 0;
  function atom() {
    const teil = teile[index++];
    if (teil === '(') {
      const wert = oder();
      if (teile[index++] !== ')') throw new Error(`Schließende Klammer fehlt: ${text}`);
      return wert;
    }
    const id = kennungen.get(teil?.toLowerCase());
    if (!id) throw new Error(`Unbekannte oder nicht geprüfte Lizenz: ${teil ?? '(Ende)'}`);
    return { id };
  }
  function kette(operator, naechstes) {
    const kinder = [naechstes()];
    while (teile[index] === operator) { index++; kinder.push(naechstes()); }
    if (kinder.length === 1) return kinder[0];
    // Gleiche Gruppierung und Reihenfolge sind für AND bzw. OR unerheblich.
    return { operator, kinder: kinder.flatMap((k) => k.operator === operator ? k.kinder : [k]) };
  }
  function und() { return kette('AND', atom); }
  function oder() { return kette('OR', und); }
  const baum = oder();
  if (index !== teile.length) throw new Error(`Nicht unterstützter oder ungültiger SPDX-Ausdruck: ${text}`);
  function normalisiere(knoten) {
    return knoten.id ?? `(${knoten.kinder.map(normalisiere).sort().join(` ${knoten.operator} `)})`;
  }
  function auswerten(knoten) {
    if (knoten.id) return vorgabe.lizenzen[knoten.id].includes(bereich) ? [knoten.id] : null;
    const kinder = knoten.kinder.map(auswerten);
    if (knoten.operator === 'OR') return kinder.find((k) => k !== null) ?? null;
    return kinder.every((k) => k !== null) ? [...new Set(kinder.flat())] : null;
  }
  const auswahl = auswerten(baum);
  return { normalisiert: normalisiere(baum), zulaessig: auswahl !== null, auswahl: auswahl ?? [] };
}

function workspacePfade(wurzel, muster) {
  if (!Array.isArray(muster)) throw new Error('workspaces muss eine Liste sein.');
  return [...new Set(muster.flatMap((p) => {
    pruefePfad(p);
    if (!p.includes('*')) return [p];
    if (!p.endsWith('/*') || p.slice(0, -2).includes('*')) {
      throw new Error(`Workspace-Muster nicht unterstützt: ${p}; unterstützt sind Pfade und Ordner/*.`);
    }
    const basis = p.slice(0, -2);
    return readdirSync(join(wurzel, basis), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(wurzel, basis, e.name, 'package.json')))
      .map((e) => `${basis}/${e.name}`);
  }))].sort();
}

// Auflösung anhand der Lockfile-Orte, einschließlich verschachtelter Pakete,
// npm-Aliasse und Workspace-Links. Kein Rückgriff auf globale Installationen.
function findePaket(pakete, von, name) {
  if (!/^(?:@[^/]+\/)?[^/]+$/.test(name)) throw new Error(`Ungültiger Paketname: ${name}`);
  pruefePfad(name);
  let ort = von;
  while (true) {
    if (posix.basename(ort) !== 'node_modules') {
      const kandidat = posix.join(ort, 'node_modules', name);
      if (pakete[kandidat]) return pakete[kandidat].link ? pakete[kandidat].resolved : kandidat;
    }
    if (!ort) return null;
    const parent = posix.dirname(ort);
    ort = parent === '.' ? '' : parent;
  }
}

function kanten(manifest, mitDev = false) {
  const liste = [];
  for (const feld of ['dependencies', 'optionalDependencies', 'peerDependencies', ...(mitDev ? ['devDependencies'] : [])]) {
    if (manifest[feld] !== undefined && !objekt(manifest[feld])) throw new Error(`${feld} muss ein Objekt sein.`);
    for (const [name, version] of Object.entries(manifest[feld] ?? {})) {
      if (typeof version !== 'string' || !version) throw new Error(`Versionsangabe fehlt: ${name}`);
      // npm lässt optionalDependencies den Eintrag in dependencies ersetzen.
      if (feld === 'dependencies' && Object.hasOwn(manifest.optionalDependencies ?? {}, name)) continue;
      liste.push({ name, art: feld, optionalerPeer: feld === 'peerDependencies' && manifest.peerDependenciesMeta?.[name]?.optional === true });
    }
  }
  return liste;
}

function dateihinweise(ordner) {
  const binaer = [];
  const hinweise = [];
  const muster = new RegExp(vorgabe.binaerdateien, 'i');
  const hinweismuster = new RegExp(vorgabe.hinweisdateien, 'i');
  function besuche(rel = '') {
    for (const eintrag of readdirSync(join(ordner, rel), { withFileTypes: true })) {
      const p = posix.join(rel, eintrag.name);
      // Keine fremden Paketbäume oder symbolischen Verknüpfungen verfolgen.
      if (eintrag.isDirectory() && eintrag.name !== 'node_modules') besuche(p);
      else if (eintrag.isFile()) {
        if (muster.test(eintrag.name)) binaer.push(p);
        if (hinweismuster.test(eintrag.name)) hinweise.push(p);
      }
    }
  }
  besuche();
  return { binaer: binaer.sort(), hinweise: hinweise.sort() };
}

// Nimmt die unveränderte JSON-Ausgabe von npm pack --dry-run --json entgegen.
// npm wird bewusst außerhalb dieses Skripts mit --offline --ignore-scripts
// aufgerufen. Die Liste ersetzt nicht die Sichtung des späteren .tgz-Inhalts.
export function pruefePackliste(liste, workspaces, wurzel) {
  const fehler = [];
  const gesehen = new Set();
  const erwartet = workspaces.filter((w) => w.pfad.startsWith('packages/'));
  if (!Array.isArray(liste) || !liste.length) return ['Packliste muss eine nicht leere JSON-Liste sein.'];
  for (const paket of liste) {
    const workspace = erwartet.find((w) => w.name === paket?.name);
    if (!workspace) { fehler.push(`Unbekanntes npm-Paket in der Packliste: ${paket?.name}`); continue; }
    if (gesehen.has(paket.name)) fehler.push(`Doppeltes npm-Paket in der Packliste: ${paket.name}`);
    gesehen.add(paket.name);
    if (paket.version !== workspace.version) fehler.push(`${paket.name}: Version der Packliste weicht vom Manifest ab.`);
    if (!Array.isArray(paket.files)) { fehler.push(`${paket.name}: Dateiliste fehlt.`); continue; }
    const pfade = paket.files.map((f) => f?.path);
    if (new Set(pfade).size !== pfade.length) fehler.push(`${paket.name}: Doppelte Dateipfade in der Packliste.`);
    if (!pfade.includes('package.json')) fehler.push(`${paket.name}: package.json fehlt in der Packliste.`);
    for (const datei of vorgabe.paketHinweise) {
      const eintrag = paket.files.find((f) => f?.path === datei);
      if (!eintrag) { fehler.push(`${paket.name}: ${datei} fehlt in der Packliste.`); continue; }
      try {
        const original = readFileSync(join(wurzel, datei));
        const kopie = readFileSync(join(wurzel, workspace.pfad, datei));
        if (!original.length || !kopie.equals(original)) fehler.push(`${paket.name}: ${datei} stimmt nicht mit der Wurzeldatei überein.`);
        if (eintrag.size !== kopie.length) fehler.push(`${paket.name}: Größe von ${datei} in der Packliste weicht ab.`);
      } catch { fehler.push(`${paket.name}: ${datei} ist im Paketordner oder in der Wurzel nicht lesbar.`); }
    }
  }
  for (const w of erwartet) if (!gesehen.has(w.name)) fehler.push(`${w.name}: npm-Packliste fehlt.`);
  return fehler;
}

export function pruefeProjekt(wurzel, { packliste } = {}) {
  const lock = leseJson(join(wurzel, 'package-lock.json'));
  if (lock.lockfileVersion !== 3 || !objekt(lock.packages) || !objekt(lock.packages[''])) {
    throw new Error('Erwartet wird package-lock.json im Format 3 mit packages und Wurzeleintrag.');
  }
  const pakete = lock.packages;
  const root = leseJson(join(wurzel, 'package.json'));
  const lokalePfade = ['', ...workspacePfade(wurzel, root.workspaces ?? [])];
  const lokale = new Map(lokalePfade.map((p) => [p, p ? leseJson(join(wurzel, p, 'package.json')) : root]));
  const fehler = [];
  const hinweise = [];
  const workspaces = [...lokale].filter(([p]) => p).map(([pfad, m]) => ({ pfad, name: m.name, version: m.version }));
  for (const [pfad, manifest] of lokale) {
    const eintrag = pakete[pfad];
    if (!eintrag || eintrag.link) throw new Error(`${pfad || '.'}: Workspace oder Wurzel fehlt im Lockfile.`);
    for (const feld of ['name', 'version', 'license', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'workspaces']) {
      if (!gleich(manifest[feld], eintrag[feld])) fehler.push(`${pfad || '.'}: ${feld} weicht zwischen Manifest und Lockfile ab.`);
    }
    try {
      if (!pruefeAusdruck(manifest.license, 'ausgeliefert').zulaessig) fehler.push(`${pfad || '.'}: Eigene Lizenz ist nicht für die Auslieferung zugelassen.`);
    } catch (e) { fehler.push(`${pfad || '.'}: ${e.message}`); }
  }
  for (const [pfad, eintrag] of Object.entries(pakete)) {
    if (pfad) pruefePfad(pfad);
    if (!objekt(eintrag)) throw new Error(`${pfad}: Ungültiger Lockfile-Eintrag.`);
    if (eintrag.link) {
      pruefePfad(eintrag.resolved);
      if (!lokale.has(eintrag.resolved)) throw new Error(`${pfad}: Link außerhalb der bekannten Workspaces.`);
    } else if (!lokale.has(pfad) && !pfad.includes('node_modules/')) {
      throw new Error(`${pfad}: Unbekanntes lokales Paket im Lockfile.`);
    }
  }

  const graph = new Map();
  for (const [pfad, eintrag] of Object.entries(pakete)) {
    if (eintrag.link) continue;
    const ziele = kanten(lokale.get(pfad) ?? eintrag, lokale.has(pfad)).map((kante) => {
      const ziel = findePaket(pakete, pfad, kante.name);
      if (!ziel && !kante.optionalerPeer) fehler.push(`${pfad || '.'}: ${kante.art} ${kante.name} fehlt im Lockfile.`);
      return { name: kante.name, art: kante.art, pfad: ziel };
    });
    graph.set(pfad, ziele);
  }
  function erreiche(starts) {
    const besucht = new Set();
    const offen = [...starts];
    while (offen.length) {
      const p = offen.pop();
      if (p === null || besucht.has(p)) continue;
      besucht.add(p);
      for (const k of graph.get(p) ?? []) if (k.art !== 'devDependencies') offen.push(k.pfad);
    }
    return besucht;
  }
  const ausgeliefert = erreiche(lokalePfade);
  const entwicklung = erreiche([...lokale.keys()].flatMap((p) => graph.get(p)
    .filter((k) => k.art === 'devDependencies').map((k) => k.pfad)));
  const liste = [];
  for (const [pfad, eintrag] of Object.entries(pakete).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (eintrag.link || lokale.has(pfad)) continue;
    const paketFehler = [];
    const bereich = ausgeliefert.has(pfad) ? 'ausgeliefert' : 'entwicklung';
    if (!ausgeliefert.has(pfad) && !entwicklung.has(pfad)) paketFehler.push('Keinem Abhängigkeitspfad zugeordnet.');
    const name = eintrag.name ?? pfad.slice(pfad.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (typeof eintrag.version !== 'string' || !eintrag.version) paketFehler.push('Version fehlt.');
    const installationsskripte = eintrag.hasInstallScript ? ['Lockfile: hasInstallScript'] : [];
    const vorgebaut = vorgabe.vorgebautePakete.filter((r) => new RegExp(r.muster).test(name)).map((r) => r.grund);
    let lizenz;
    try {
      lizenz = pruefeAusdruck(eintrag.license, bereich);
      if (!lizenz.zulaessig) paketFehler.push(`Lizenz für ${bereich} nicht zugelassen: ${eintrag.license}`);
    } catch (e) { paketFehler.push(e.message); }
    const ordner = join(wurzel, pfad);
    let installiert = false;
    let lizenzInstalliert = null;
    let hinweisdateien = [];
    if (existsSync(ordner)) {
      try {
        const manifest = leseJson(join(ordner, 'package.json'));
        installiert = true;
        lizenzInstalliert = manifest.license ?? null;
        if (manifest.name !== name) paketFehler.push(`Installierter Paketname weicht ab: ${manifest.name}`);
        if (manifest.version !== eintrag.version) paketFehler.push(`Installierte Version weicht ab: ${manifest.version}`);
        const lokal = pruefeAusdruck(manifest.license, bereich);
        if (!lokal.zulaessig) paketFehler.push('Installierte Lizenz ist nicht zugelassen.');
        if (lizenz && lokal.normalisiert !== lizenz.normalisiert) paketFehler.push('Lizenzangaben in Lockfile und Installation weichen ab.');
        for (const s of vorgabe.installationsskripte) {
          if (Object.hasOwn(manifest.scripts ?? {}, s)) installationsskripte.push(`package.json: ${s}`);
        }
        if (existsSync(join(ordner, 'binding.gyp'))) installationsskripte.push('binding.gyp: möglicher node-gyp-Installationsschritt');
        const dateien = dateihinweise(ordner);
        vorgebaut.push(...dateien.binaer.map((p) => `Datei: ${p}`));
        hinweisdateien = dateien.hinweise;
      } catch (e) { paketFehler.push(`Installation nicht vollständig prüfbar: ${e.message}`); }
    }
    liste.push({ pfad, name, version: eintrag.version ?? null, bereich,
      auchEntwicklung: ausgeliefert.has(pfad) && entwicklung.has(pfad),
      lizenz: eintrag.license ?? null, auswahl: lizenz?.auswahl ?? [], installiert, lizenzInstalliert,
      installationsskripte, vorgebaut, hinweisdateien, abhaengigkeiten: graph.get(pfad), fehler: paketFehler });
    fehler.push(...paketFehler.map((f) => `${pfad}: ${f}`));
  }
  for (const datei of vorgabe.paketHinweise) {
    try { if (!readFileSync(join(wurzel, datei)).length) fehler.push(`${datei} in der Wurzel ist leer.`); }
    catch { fehler.push(`${datei} in der Wurzel fehlt oder ist nicht lesbar.`); }
    for (const w of workspaces.filter((w) => w.pfad.startsWith('packages/'))) {
      if (!existsSync(join(wurzel, w.pfad, datei))) hinweise.push(`${w.pfad}/${datei} fehlt; vor Stufe 3 ergänzen und Packliste prüfen.`);
    }
  }
  if (packliste !== undefined) fehler.push(...pruefePackliste(leseJson(packliste), workspaces, wurzel));
  else hinweise.push('npm-Packlisten wurden nicht geprüft; dafür --packliste verwenden.');
  hinweise.push('Installationsskripte und vorgebaute Programme sind Hinweise für Paket 2.8, keine automatische F-Droid-Freigabe.');
  hinweise.push('Proprietäre Dienste, eingebettete Fremdanteile und vollständige Lizenztexte werden nicht automatisch bewertet.');
  const lizenzen = {};
  for (const p of liste) lizenzen[String(p.lizenz)] = (lizenzen[String(p.lizenz)] ?? 0) + 1;
  return { formatVersion: 1, ok: fehler.length === 0,
    zusammenfassung: { pakete: liste.length, ausgeliefert: liste.filter((p) => p.bereich === 'ausgeliefert').length,
      entwicklung: liste.filter((p) => p.bereich === 'entwicklung').length, installiert: liste.filter((p) => p.installiert).length,
      nurLockfile: liste.filter((p) => !p.installiert).length, installationsskripte: liste.filter((p) => p.installationsskripte.length).length,
      vorgebaut: liste.filter((p) => p.vorgebaut.length).length, lizenzen },
    workspaces, packlisteGeprueft: packliste !== undefined, pakete: liste, hinweise, fehler };
}

export function menschenlesbar(bericht) {
  const s = bericht.zusammenfassung;
  const zeilen = s ? [
    `Lizenzprüfung: ${s.pakete} Fremdpakete; ${s.ausgeliefert} ausgeliefert, ${s.entwicklung} für Test und Build.`,
    `Gegenprüfung: ${s.installiert} installiert, ${s.nurLockfile} nur im Lockfile.`,
    `Lizenzen: ${Object.entries(s.lizenzen).map(([k, n]) => `${k}: ${n}`).join(', ')}`,
    `Installationsskripte: ${s.installationsskripte}; vorgebaute Programme: ${s.vorgebaut}.`,
    ...bericht.pakete.map((p) => `${p.fehler.length ? 'FEHLER' : 'OK'} ${p.name}@${p.version} | ${p.lizenz} | ${p.bereich} | ${p.installiert ? 'gegengeprüft' : 'nur Lockfile'} | ${p.pfad}`
      + `${p.auswahl.length ? ` | gewählte Lizenz: ${p.auswahl.join(' AND ')}` : ''}`
      + `${p.installationsskripte.length ? `\n  Installationsskript: ${p.installationsskripte.join('; ')}` : ''}`
      + `${p.vorgebaut.length ? `\n  Vorgebaut: ${p.vorgebaut.join('; ')}` : ''}`),
  ] : ['Lizenzprüfung konnte nicht abgeschlossen werden.'];
  zeilen.push(...bericht.hinweise.map((h) => `Hinweis: ${h}`), ...bericht.fehler.map((f) => `Fehler: ${f}`));
  zeilen.push(`ERGEBNIS: ${bericht.ok ? 'bestanden' : 'Nacharbeit nötig'}`);
  return zeilen.join('\n');
}

function haupt(argv) {
  let wurzel = resolve(hier, '..');
  let packliste;
  let bericht;
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--json') continue;
      if (['--wurzel', '--packliste'].includes(a) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        const wert = resolve(argv[++i]);
        if (a === '--wurzel') wurzel = wert;
        else packliste = wert;
      } else throw new Error(`Unbekanntes oder unvollständiges Argument: ${a}`);
    }
    bericht = pruefeProjekt(wurzel, { packliste });
  } catch (e) { bericht = { formatVersion: 1, ok: false, hinweise: [], fehler: [e.message] }; }
  console.log(argv.includes('--json') ? JSON.stringify(bericht, null, 2) : menschenlesbar(bericht));
  process.exitCode = bericht.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) haupt(process.argv.slice(2));
