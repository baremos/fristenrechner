#!/usr/bin/env node
// Prüft npm-Lizenzen offline. Führt weder npm noch Installationsskripte aus.
// Aufruf: node scripts/check-licenses.mjs [--json] [--wurzel <Ordner>]
//                                      [--packliste <npm-pack-JSON>]
//                                      [--buendel <Modulprotokoll>]
//                                      [--gradle-modell <Release-Lint-Modell>] [--streng]
// Regeln und Grenzen: docs/lizenzen.md, Daten: check-licenses.json.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefeInventar } from './hinweise-pruefung.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
export let vorgabe;
let vorgabeFehler;
try { vorgabe = leseJson(join(hier, 'check-licenses.json'), resolve(hier, '..')); }
catch (e) { vorgabeFehler = e; }
const objekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const gleich = (a, b) => JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));

function sortiert(x) {
  if (Array.isArray(x)) return x.map(sortiert);
  if (!objekt(x)) return x;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortiert(x[k])]));
}

function anzeigePfad(datei, wurzel) {
  const pfad = relative(wurzel, datei).replaceAll('\\', '/');
  // Externe Packlisten können auf einem anderen Laufwerk liegen. Auch dann
  // weder einen absoluten Pfad noch die fremde Ordnerstruktur ausgeben.
  return isAbsolute(pfad) || pfad.split('/').includes('..')
    ? `[außerhalb der Wurzel]/${basename(datei)}` : pfad || '.';
}

function dateizugriff(datei, wurzel, beschreibung, lesen) {
  try { return lesen(); }
  catch (e) {
    const grund = e.code === 'ENOENT' ? 'fehlt' : 'ist nicht lesbar';
    throw new Error(`${beschreibung} ${grund}: ${anzeigePfad(datei, wurzel)}`, { cause: e });
  }
}

function leseJson(datei, wurzel) {
  try {
    return JSON.parse(readFileSync(datei, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    // SyntaxError-Texte können Ausschnitte privater Dateiinhalte enthalten.
    throw new Error(`JSON-Datei ${anzeigePfad(datei, wurzel)} ist nicht lesbar oder ungültig: ${e.code ?? 'JSON-Syntaxfehler'}`, { cause: e });
  }
}

function pruefePfad(pfad) {
  if (typeof pfad !== 'string' || /[\\:\x00-\x1f]/.test(pfad)
      || pfad.split('/').some((teil) => !teil || teil === '.' || teil === '..')) {
    throw new Error('Ungültiger relativer Paketpfad.');
  }
  return pfad;
}

// Ein kleiner Parser für SPDX-AND/OR und Klammern; AND bindet stärker als OR.
// Zuerst den ganzen Ausdruck prüfen, danach auswerten: Unbekanntes darf auch
// in einem nicht gewählten OR-Zweig nicht unbemerkt bleiben.
export function pruefeAusdruck(text, bereich, wahl) {
  if (vorgabeFehler) throw vorgabeFehler;
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
  let auswahl = auswerten(baum);
  if (wahl !== undefined) {
    const gewaehlt = pruefeAusdruck(wahl, bereich);
    if (gewaehlt.normalisiert.includes(' OR ') || !gewaehlt.zulaessig) throw new Error('Ungültige Lizenzwahl.');
    const soll = [...gewaehlt.auswahl].sort();
    function moeglich(knoten, erlaubt) {
      if (knoten.id) return erlaubt.includes(knoten.id) ? [new Set([knoten.id])] : [];
      const kinder = knoten.kinder.map(k => moeglich(k, erlaubt));
      if (knoten.operator === 'OR') return kinder.flat();
      return kinder.reduce((a, b) => a.flatMap(x => b.map(y => new Set([...x, ...y]))), [new Set()]);
    }
    auswahl = moeglich(baum, soll).some(s => gleich([...s].sort(), soll)) ? gewaehlt.auswahl : null;
  }
  return { normalisiert: normalisiere(baum), zulaessig: auswahl !== null, auswahl: auswahl ?? [] };
}

// Ausnahmen berichtigen ausschließlich geprüfte Metadaten einer festen Version.
// Sie erweitern weder die Bereichsregeln noch die Syntax des SPDX-Parsers.
function pruefeAusnahmen(ausnahmen, stichtag) {
  const datum = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!datum(stichtag)) throw new Error('Stichtag der Ausnahmen muss ein gültiges ISO-Datum sein.');
  if (!Array.isArray(ausnahmen)) throw new Error('einzelausnahmen muss eine Liste sein.');
  const maxMonate = vorgabe.einzelausnahmenMaxMonate;
  if (!Number.isSafeInteger(maxMonate) || maxMonate <= 0) {
    throw new Error('einzelausnahmenMaxMonate muss eine positive ganze Zahl sein.');
  }
  const grenze = new Date(stichtag);
  const tag = grenze.getUTCDate();
  // Letzter Tag des Zielmonats, dann auf den ursprünglichen Tag begrenzen.
  grenze.setUTCMonth(grenze.getUTCMonth() + maxMonate + 1, 0);
  if (!Number.isFinite(grenze.getTime()) || grenze.getUTCFullYear() > 9999) {
    throw new Error('einzelausnahmenMaxMonate ergibt für den Stichtag keine gültige ISO-Datumsgrenze.');
  }
  grenze.setUTCDate(Math.min(tag, grenze.getUTCDate()));
  const spaetestens = grenze.toISOString().slice(0, 10);
  const gesehen = new Set();
  for (const a of ausnahmen) {
    if (!objekt(a) || typeof a.paket !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(a.paket)
        || typeof a.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(a.version)
        || !(a.angabe === null || typeof a.angabe === 'string')
        || !['ausgeliefert', 'bereitgestellt', 'entwicklung'].includes(a.bereich)
        || typeof a.begruendung !== 'string' || !a.begruendung.trim()
        || !objekt(a.beleg) || typeof a.beleg.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.beleg.sha256)
        || typeof a.beleg.quelle !== 'string' || !/^https:\/\/[^\s]+$/.test(a.beleg.quelle)
        || !datum(a.gueltigBis)) throw new Error('Ungültige Einzelausnahme: Pflichtfelder, feste Version, Beleg und Befristung prüfen.');
    pruefePfad(a.paket);
    pruefePfad(a.beleg.datei);
    if (a.gueltigBis < stichtag) throw new Error(`Einzelausnahme abgelaufen: ${a.paket}@${a.version} (${a.gueltigBis}).`);
    if (a.gueltigBis > spaetestens) {
      throw new Error(`Einzelausnahme zu lange gültig: ${a.paket}@${a.version}; höchstens ${maxMonate} Kalendermonate ab Stichtag, bis ${spaetestens}.`);
    }
    let bekannt = false;
    try { pruefeAusdruck(a.angabe, a.bereich); bekannt = true; } catch { /* Fehlende oder ungeprüfte Metadaten. */ }
    if (bekannt) throw new Error(`Einzelausnahme darf bekannte SPDX-Angaben nicht ersetzen: ${a.paket}@${a.version}.`);
    if (!pruefeAusdruck(a.lizenz, a.bereich).zulaessig) throw new Error(`Festgestellte Lizenz der Einzelausnahme ist für ${a.bereich} nicht zugelassen.`);
    const schluessel = JSON.stringify([a.paket, a.version, a.angabe, a.bereich]);
    if (gesehen.has(schluessel)) throw new Error(`Doppelte Einzelausnahme: ${a.paket}@${a.version}.`);
    gesehen.add(schluessel);
  }
}

function pruefePaketlizenz(angabe, name, version, bereich, ordner, ausnahmen, wurzel) {
  try { return pruefeAusdruck(angabe, bereich); }
  catch (e) {
    const a = ausnahmen.find((a) => a.paket === name && a.version === version
      && a.bereich === bereich && a.angabe === (angabe ?? null));
    if (!a) throw e;
    // Ohne installierten, unveränderten Paketbeleg ist die Ausnahme unwirksam.
    const belegpfad = join(ordner, a.beleg.datei);
    const [paketpfad, beleg] = dateizugriff(belegpfad, wurzel, 'Beleg der Einzelausnahme',
      () => [realpathSync(ordner), realpathSync(belegpfad)]);
    const rel = relative(paketpfad, beleg);
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error('Beleg der Einzelausnahme liegt außerhalb des Pakets.');
    const inhalt = dateizugriff(belegpfad, wurzel, 'Beleg der Einzelausnahme', () => readFileSync(beleg));
    if (!inhalt.length || createHash('sha256').update(inhalt).digest('hex') !== a.beleg.sha256) {
      throw new Error(`Beleg der Einzelausnahme weicht ab: ${a.beleg.datei}`);
    }
    return { ...pruefeAusdruck(a.lizenz, bereich), ausnahme: a };
  }
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
    return dateizugriff(join(wurzel, basis), wurzel, 'Workspace-Ordner',
      () => readdirSync(join(wurzel, basis), { withFileTypes: true }))
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

function dateihinweise(ordner, wurzel) {
  const binaer = [];
  const hinweise = [];
  const muster = new RegExp(vorgabe.binaerdateien, 'i');
  const hinweismuster = new RegExp(vorgabe.hinweisdateien, 'i');
  function besuche(rel = '') {
    const dateien = dateizugriff(join(ordner, rel), wurzel, 'Paketordner',
      () => readdirSync(join(ordner, rel), { withFileTypes: true }));
    for (const eintrag of dateien) {
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
  if (vorgabeFehler) throw vorgabeFehler;
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

export function pruefeProjekt(wurzel, { packliste, ausnahmen = vorgabe?.einzelausnahmen,
  stichtag = new Date().toISOString().slice(0, 10), buendel, gradleModell, streng = false,
  inventarPruefung = pruefeInventar } = {}) {
  if (vorgabeFehler) throw vorgabeFehler;
  pruefeAusnahmen(ausnahmen, stichtag);
  const lock = leseJson(join(wurzel, 'package-lock.json'), wurzel);
  if (lock.lockfileVersion !== 3 || !objekt(lock.packages) || !objekt(lock.packages[''])) {
    throw new Error('Erwartet wird package-lock.json im Format 3 mit packages und Wurzeleintrag.');
  }
  const pakete = lock.packages;
  const root = leseJson(join(wurzel, 'package.json'), wurzel);
  const lokalePfade = ['', ...workspacePfade(wurzel, root.workspaces ?? [])];
  const lokale = new Map(lokalePfade.map((p) => [p, p ? leseJson(join(wurzel, p, 'package.json'), wurzel) : root]));
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
      return { ...kante, pfad: ziel };
    });
    graph.set(pfad, ziele);
  }
  function erreiche(starts) {
    const besucht = new Map();
    const offen = [...starts];
    for (let i = 0; i < offen.length; i++) {
      const { pfad: p, weg } = offen[i];
      if (p === null || besucht.has(p)) continue;
      besucht.set(p, weg);
      for (const k of graph.get(p) ?? []) {
        // Workspace-Peers starten einen eigenen Bereich. Fremde Peers erben
        // dagegen den Bereich ihres Pfads, auch innerhalb der Auslieferung.
        if (k.art === 'devDependencies' || (p !== '' && lokale.has(p) && k.art === 'peerDependencies')) continue;
        offen.push({ pfad: k.pfad, weg: [...weg, { von: p, ...k }] });
      }
    }
    return besucht;
  }
  const starts = (art, pfade) => pfade.flatMap((p) => graph.get(p)
    .filter((k) => k.art === art).map((k) => ({ pfad: k.pfad, weg: [{ von: p, ...k }] })));
  const ausgeliefert = erreiche(lokalePfade.map((pfad) => ({ pfad, weg: [] })));
  const bereitgestellt = erreiche(starts('peerDependencies', lokalePfade.filter(Boolean)));
  const entwicklung = erreiche(starts('devDependencies', lokalePfade));
  const liste = [];
  for (const [pfad, eintrag] of Object.entries(pakete).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (eintrag.link || lokale.has(pfad)) continue;
    const paketFehler = [];
    const bereich = ausgeliefert.has(pfad) ? 'ausgeliefert' : bereitgestellt.has(pfad) ? 'bereitgestellt' : 'entwicklung';
    if (!ausgeliefert.has(pfad) && !bereitgestellt.has(pfad) && !entwicklung.has(pfad)) paketFehler.push('Keinem Abhängigkeitspfad zugeordnet.');
    const name = eintrag.name ?? pfad.slice(pfad.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (typeof eintrag.version !== 'string' || !eintrag.version) paketFehler.push('Version fehlt.');
    const installationsskripte = eintrag.hasInstallScript ? ['Lockfile: hasInstallScript'] : [];
    const vorgebaut = vorgabe.vorgebautePakete.filter((r) => new RegExp(r.muster).test(name)).map((r) => r.grund);
    const ordner = join(wurzel, pfad);
    let lizenz;
    try {
      lizenz = pruefePaketlizenz(eintrag.license, name, eintrag.version, bereich, ordner, ausnahmen, wurzel);
      if (!lizenz.zulaessig) paketFehler.push(`Lizenz für ${bereich} nicht zugelassen: ${eintrag.license}`);
    } catch (e) { paketFehler.push(e.message); }
    let installiert = false;
    let lizenzInstalliert = null;
    let hinweisdateien = [];
    if (existsSync(ordner)) {
      try {
        const manifest = leseJson(join(ordner, 'package.json'), wurzel);
        installiert = true;
        lizenzInstalliert = manifest.license ?? null;
        if (manifest.name !== name) paketFehler.push(`Installierter Paketname weicht ab: ${manifest.name}`);
        if (manifest.version !== eintrag.version) paketFehler.push(`Installierte Version weicht ab: ${manifest.version}`);
        try {
          const lokal = pruefePaketlizenz(manifest.license, manifest.name, manifest.version, bereich, ordner, ausnahmen, wurzel);
          if (!lokal.zulaessig) paketFehler.push('Installierte Lizenz ist nicht zugelassen.');
          if (lizenz && lokal.normalisiert !== lizenz.normalisiert) paketFehler.push('Lizenzangaben in Lockfile und Installation weichen ab.');
          if ((lizenz?.ausnahme || lokal.ausnahme) && !gleich(eintrag.license ?? null, manifest.license ?? null)) {
            paketFehler.push('Einzelausnahme verlangt identische Rohangaben in Lockfile und Installation.');
          }
        } catch (e) { paketFehler.push(`Installierte Lizenz nicht prüfbar: ${e.message}`); }
        for (const s of vorgabe.installationsskripte) {
          if (Object.hasOwn(manifest.scripts ?? {}, s)) installationsskripte.push(`package.json: ${s}`);
        }
        if (existsSync(join(ordner, 'binding.gyp'))) installationsskripte.push('binding.gyp: möglicher node-gyp-Installationsschritt');
        const dateien = dateihinweise(ordner, wurzel);
        vorgebaut.push(...dateien.binaer.map((p) => `Datei: ${p}`));
        hinweisdateien = dateien.hinweise;
      } catch (e) { paketFehler.push(`Installation nicht vollständig prüfbar: ${e.message}`); }
    }
    liste.push({ pfad, name, version: eintrag.version ?? null, bereich,
      auchEntwicklung: bereich !== 'entwicklung' && entwicklung.has(pfad),
      auchBereitgestellt: bereich !== 'bereitgestellt' && bereitgestellt.has(pfad),
      wege: Object.fromEntries(Object.entries({ ausgeliefert, bereitgestellt, entwicklung })
        .filter(([, erreicht]) => erreicht.has(pfad)).map(([art, erreicht]) => [art, erreicht.get(pfad)])),
      lizenz: eintrag.license ?? null, auswahl: lizenz?.auswahl ?? [], ausnahme: lizenz?.ausnahme ?? null, installiert, lizenzInstalliert,
      installationsskripte, vorgebaut, hinweisdateien, abhaengigkeiten: graph.get(pfad), fehler: paketFehler });
    fehler.push(...paketFehler.map((f) => `${pfad}: ${f}`));
  }
  for (const a of ausnahmen) {
    if (!liste.some((p) => p.name === a.paket && p.version === a.version
      && p.bereich === a.bereich && p.lizenz === a.angabe)) {
      fehler.push(`Einzelausnahme trifft auf kein Paket zu: ${a.paket}@${a.version} (${a.bereich}).`);
    }
  }
  for (const datei of vorgabe.paketHinweise) {
    let original;
    try {
      original = readFileSync(join(wurzel, datei));
      if (!original.length) fehler.push(`${datei} in der Wurzel ist leer.`);
    }
    catch { fehler.push(`${datei} in der Wurzel fehlt oder ist nicht lesbar.`); }
    for (const w of workspaces.filter((w) => w.pfad.startsWith('packages/'))) {
      const pfad = `${w.pfad}/${datei}`;
      try {
        const kopie = readFileSync(join(wurzel, pfad));
        if (!kopie.length) fehler.push(`${pfad} ist leer.`);
        else if (original && !kopie.equals(original)) fehler.push(`${pfad} stimmt nicht mit der Wurzeldatei überein.`);
      } catch { fehler.push(`${pfad} fehlt oder ist nicht lesbar.`); }
    }
  }
  if (packliste !== undefined) fehler.push(...pruefePackliste(leseJson(packliste, wurzel), workspaces, wurzel));
  else hinweise.push('npm-Packlisten wurden nicht geprüft; dafür --packliste verwenden.');
  hinweise.push('Installationsskripte und vorgebaute Programme sind Hinweise für Paket 2.8, keine automatische F-Droid-Freigabe.');
  hinweise.push('Proprietäre Dienste, eingebettete Fremdanteile und vollständige Lizenztexte werden nicht automatisch bewertet.');
  const inventar = inventarPruefung(wurzel, liste, { buendel, gradleModell, streng, pruefeAusdruck });
  fehler.push(...inventar.fehler);
  hinweise.push(`Hinweise Dritter: ${inventar.platzhalter} Platzhalter; ${streng ? 'strenger Modus' : 'Normalmodus'}.`);
  const lizenzen = {};
  for (const p of liste) lizenzen[String(p.lizenz)] = (lizenzen[String(p.lizenz)] ?? 0) + 1;
  return { formatVersion: 2, stichtag, ok: fehler.length === 0,
    zusammenfassung: { pakete: liste.length, ausgeliefert: liste.filter((p) => p.bereich === 'ausgeliefert').length,
      bereitgestellt: liste.filter((p) => p.bereich === 'bereitgestellt').length,
      einzelausnahmen: liste.filter((p) => p.ausnahme !== null).length,
      entwicklung: liste.filter((p) => p.bereich === 'entwicklung').length, installiert: liste.filter((p) => p.installiert).length,
      nurLockfile: liste.filter((p) => !p.installiert).length, installationsskripte: liste.filter((p) => p.installationsskripte.length).length,
      vorgebaut: liste.filter((p) => p.vorgebaut.length).length, platzhalter: inventar.platzhalter, lizenzen },
    workspaces, packlisteGeprueft: packliste !== undefined, pakete: liste, hinweise, fehler };
}

export function menschenlesbar(bericht) {
  const s = bericht.zusammenfassung;
  const zeilen = s ? [
    `Lizenzprüfung: ${s.pakete} Fremdpakete; ${s.ausgeliefert} ausgeliefert, ${s.bereitgestellt} bereitgestellt, ${s.entwicklung} für Test und Build.`,
    `Gegenprüfung: ${s.installiert} installiert, ${s.nurLockfile} nur im Lockfile.`,
    `Lizenzen: ${Object.entries(s.lizenzen).map(([k, n]) => `${k}: ${n}`).join(', ')}`,
    `Installationsskripte: ${s.installationsskripte}; vorgebaute Programme: ${s.vorgebaut}.`,
    `Einzelausnahmen: ${s.einzelausnahmen}; Stichtag (UTC): ${bericht.stichtag}.`,
    ...bericht.pakete.map((p) => `${p.fehler.length ? 'FEHLER' : 'OK'} ${p.name}@${p.version} | ${p.lizenz} | ${p.bereich} | ${p.installiert ? 'gegengeprüft' : 'nur Lockfile'} | ${p.pfad}`
      + `${p.auswahl.length ? ` | gewählte Lizenz: ${p.auswahl.join(' AND ')}` : ''}`
      + `${p.ausnahme ? ` | Einzelausnahme bis ${p.ausnahme.gueltigBis}: ${p.ausnahme.beleg.datei}` : ''}`
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
  let buendel, gradleModell, streng = false;
  let bericht;
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--json') continue;
      if (a === '--streng') { streng = true; continue; }
      if (['--wurzel', '--packliste', '--buendel', '--gradle-modell'].includes(a) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        const wert = resolve(argv[++i]);
        if (a === '--wurzel') wurzel = wert;
        else if (a === '--packliste') packliste = wert;
        else if (a === '--buendel') buendel = wert;
        else gradleModell = wert;
      } else throw new Error('Unbekanntes oder unvollständiges Argument.');
    }
    bericht = pruefeProjekt(wurzel, { packliste, buendel, gradleModell, streng });
  } catch (e) { bericht = { formatVersion: 2, ok: false, hinweise: [], fehler: [e.message] }; }
  console.log(argv.includes('--json') ? JSON.stringify(bericht, null, 2) : menschenlesbar(bericht));
  process.exitCode = bericht.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) haupt(process.argv.slice(2));
