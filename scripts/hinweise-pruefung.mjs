// Inventarprüfung und optionale Abgleiche; Erfolg bleibt ohne Konsolenausgabe.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gruppen, leseInventar, leseQuelle, leseRepositorydatei, pruefeFormat, pruefeHinweisdatei, relativerPfad } from './hinweise-dritter.mjs';
import { leseQuellXml } from './app-pruefungen.mjs';
import { findeJdk, windows } from './werkzeuge.mjs';

function eindeutig(liste, kennung, art) {
  const gesehen = new Set();
  for (const e of liste) {
    const id = kennung(e);
    if (gesehen.has(id)) throw new Error(`Hinweise Dritter: doppelter ${art}: ${id}.`);
    gesehen.add(id);
  }
}

function gegenseitig(ist, soll, art) {
  const fehler = [];
  for (const id of [...ist].sort()) if (!soll.has(id)) fehler.push(`${art}: nicht im Inventar: ${id}.`);
  for (const id of [...soll].sort()) if (!ist.has(id)) fehler.push(`${art}: Inventareintrag fehlt im Modell: ${id}.`);
  return fehler;
}

function leseProtokoll(datei) {
  try { return JSON.parse(readFileSync(datei, 'utf8')); }
  catch { throw new Error('Bündelabgleich: Modulprotokoll fehlt oder ist ungültig.'); }
}

export function pruefeBuendel(i, protokoll) {
  if (protokoll?.formatVersion !== 1 || protokoll.umgebung !== 'client' || !Array.isArray(protokoll.chunks) || !protokoll.chunks.length) {
    throw new Error('Bündelabgleich: Client-Modulprotokoll im Format 1 erwartet.');
  }
  const orte = new Set(), virtuelle = new Set();
  eindeutig(protokoll.chunks, c => c.datei, 'Chunk');
  for (const c of protokoll.chunks) {
    relativerPfad(c.datei);
    if (!Array.isArray(c.module) || !Array.isArray(c.imports) || !Array.isArray(c.dynamischeImports)
        || typeof c.einstieg !== 'boolean' || typeof c.dynamischerEinstieg !== 'boolean') throw new Error('Bündelabgleich: unvollständiger Chunk.');
    for (const id of [...c.imports, ...c.dynamischeImports]) relativerPfad(id);
    eindeutig(c.module, m => m.id, 'Modul');
    for (const m of c.module) {
      if (typeof m.id !== 'string' || !Number.isFinite(m.renderedLength) || m.renderedLength < 0) throw new Error('Bündelabgleich: ungültiger Moduleintrag.');
      if (m.id.startsWith('virtuell:')) {
        relativerPfad(m.id.slice('virtuell:'.length));
        if (m.renderedLength > 0) virtuelle.add(m.id);
        continue;
      }
      relativerPfad(m.id.split('?')[0]);
      if (m.renderedLength === 0) continue;
      // Letzter node_modules-Abschnitt: verschachtelte Versionen sind eigene Orte.
      const muster = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g;
      const funde = [...m.id.matchAll(muster)];
      if (funde.length) {
        const f = funde.at(-1);
        orte.add(m.id.slice(0, f.index + f[0].length));
      }
    }
  }
  const erwartet = new Set([...i.npm, ...i.buildHilfscode].filter(e => e.imBuendel && e.ort).map(e => e.ort));
  // Virtuelle Hilfen gehören zum Werkzeugpaket, ohne eigenes node_modules-Modul.
  for (const e of i.buildHilfscode.filter(e => e.imBuendel)) {
    if (e.module.some(id => virtuelle.has(id)) && e.ort) orte.add(e.ort);
  }
  const hilfen = new Set(i.buildHilfscode.filter(e => e.imBuendel).flatMap(e => e.module));
  return [...gegenseitig(orte, erwartet, 'Bündelabgleich'), ...gegenseitig(virtuelle, hilfen, 'Hilfscodeabgleich')];
}

export function pruefeGradleModell(i, datei, { umgebung = process.env, lesen = leseQuellXml } = {}) {
  const jdk = findeJdk(umgebung);
  if (!jdk.pfad) throw new Error('Gradle-Abgleich: kein JDK für den XML-Parser gefunden.');
  const baum = lesen(datei, join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java'), umgebung);
  const root = baum.kinder?.[0];
  const teile = root?.kinder?.filter(e => e.name === 'package');
  if (baum.name !== '#' || baum.kinder.length !== 1 || root.name !== 'dependencies' || teile.length !== 1) {
    throw new Error('Gradle-Abgleich: genau ein package-Abschnitt im Abhängigkeitsmodell erwartet.');
  }
  const ist = new Set(), projekte = new Set();
  for (const e of teile[0].kinder) {
    if (e.name !== 'dependency' || e.kinder.length) throw new Error('Gradle-Abgleich: unbekannte Knotenform.');
    const name = e.attribute.name;
    const projekt = /^:@@:([A-Za-z0-9_-]+)::release$/.exec(name);
    const artefakt = /^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([A-Za-z0-9_.+-]+)@(aar|jar)$/.exec(name);
    const ziel = projekt ? projekte : ist;
    const id = projekt ? projekt[1] : artefakt ? `${artefakt[1]}:${artefakt[2]}:${artefakt[3]}` : null;
    if (!id || ziel.has(id)) throw new Error('Gradle-Abgleich: unbekannte oder doppelte Abhängigkeit.');
    ziel.add(id);
  }
  if (!ist.size && !projekte.size) throw new Error('Gradle-Abgleich: package-Abschnitt ist leer.');
  return [
    ...gegenseitig(ist, new Set(i.android.maven.map(e => `${e.gruppe}:${e.name}:${e.version}`)), 'Gradle-Abgleich'),
    ...gegenseitig(projekte, new Set(i.android.projektmodule.map(e => e.name)), 'Gradle-Projektabgleich'),
  ];
}

export function pruefeInventar(wurzel, pakete, { buendel, gradleModell, streng = false, pruefeAusdruck, umgebung = process.env } = {}) {
  const fehler = [];
  let platzhalter = 0;
  try {
    const i = pruefeFormat(leseInventar(wurzel));
    platzhalter = gruppen(i).flat().filter(e => e.status === 'platzhalter').length;
    if (streng && platzhalter) fehler.push(`Hinweise Dritter: ${platzhalter} Platzhalter im strengen Modus.`);
    const abdeckung = [...i.npm, ...i.android.projektmodule.filter(e => e.ort), ...i.ausnahmen];
    eindeutig(abdeckung, e => e.ort, 'Lockfile-Ort');
    eindeutig(i.buildHilfscode, e => e.paket, 'Hilfscode');
    eindeutig(i.eingebettet, e => e.name, 'eingebetteter Anteil');
    eindeutig(i.android.projektmodule, e => e.name, 'Projektmodul');
    eindeutig(i.android.maven, e => `${e.gruppe}:${e.name}:${e.version}`, 'Maven-Eintrag');
    for (const p of pakete.filter(p => p.bereich === 'ausgeliefert')) {
      if (!abdeckung.some(e => e.ort === p.pfad)) fehler.push(`Hinweise Dritter: ausgelieferter Ort fehlt: ${p.pfad}.`);
    }
    for (const e of [...abdeckung, ...i.buildHilfscode.filter(e => e.ort)]) {
      const p = pakete.find(p => p.pfad === e.ort);
      if (!p || (i.ausnahmen.includes(e) && p.bereich !== 'ausgeliefert')) {
        fehler.push(`Hinweise Dritter: ${i.ausnahmen.includes(e) ? 'Ausnahme' : 'Inventareintrag'} ohne Treffer: ${e.ort}.`);
        continue;
      }
      if (p.name !== e.paket || p.version !== e.version) fehler.push(`Hinweise Dritter: Paketname oder Version weicht ab: ${e.ort}.`);
      try {
        // Vorhandene, belegte Metadatenausnahmen bleiben auch hier wirksam.
        const angabe = p.ausnahme?.lizenz ?? p.lizenz;
        if (!pruefeAusdruck(angabe, p.bereich, e.lizenz).zulaessig) throw new Error();
        const manifest = JSON.parse(leseRepositorydatei(wurzel, 'package.json', e.ort).toString('utf8'));
        if (manifest.name !== e.paket || manifest.version !== e.version) fehler.push(`Hinweise Dritter: Paketmanifest weicht ab: ${e.ort}.`);
        const lokal = p.ausnahme && manifest.license === p.ausnahme.angabe ? p.ausnahme.lizenz : manifest.license;
        if (!pruefeAusdruck(lokal, p.bereich, e.lizenz).zulaessig) throw new Error();
      } catch { fehler.push(`Hinweise Dritter: Lizenzwahl oder Paketmanifest nicht passend: ${e.ort}.`); }
    }
    // Auch Platzhalter dürfen vorhandene Quellhashes nicht umgehen.
    for (const e of gruppen(i).flat()) {
      for (const quelle of [e.lizenzdatei, e.behaelter].filter(Boolean)) {
        try { leseQuelle(wurzel, quelle, e.ort); } catch (e) { fehler.push(e.message); }
      }
    }
    try { pruefeHinweisdatei(wurzel, i); } catch (e) { fehler.push(e.message); }
    if (buendel) fehler.push(...pruefeBuendel(i, leseProtokoll(buendel)));
    if (gradleModell) fehler.push(...pruefeGradleModell(i, gradleModell, { umgebung }));
  } catch (e) { fehler.push(e.message); }
  return { fehler: [...new Set(fehler)], platzhalter };
}
