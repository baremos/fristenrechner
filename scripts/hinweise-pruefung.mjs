// Inventarprüfung und optionale Abgleiche; Erfolg bleibt ohne Konsolenausgabe.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gruppen, leseInventar, leseQuelle, leseRepositorydatei, pruefeFormat, pruefeHinweisdatei, relativerPfad } from './hinweise-dritter.mjs';
import { leseQuellXml } from './app-pruefungen.mjs';
import { findeJdk, windows } from './werkzeuge.mjs';
import { paketort, pruefeStilOderAsset, zerlegeKennung } from './modulprotokoll.mjs';
import { istUebergangsangabe } from './hinweise-uebergang.mjs';

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

export function pruefeBuendel(i, protokoll, dist) {
  if (protokoll?.formatVersion !== 2 || protokoll.umgebung !== 'client' || protokoll.abgeschlossen !== true
      || !Array.isArray(protokoll.chunks) || !protokoll.chunks.length
      || !Array.isArray(protokoll.cssAssets) || !Array.isArray(protokoll.modulgraph)) {
    throw new Error('Bündelabgleich: abgeschlossenes Client-Modulprotokoll im Format 2 erwartet.');
  }
  if (!dist) throw new Error('Bündelabgleich: dist für Artefaktabgleich fehlt.');
  const orte = new Set(), virtuelle = new Set();
  const ausgaben = [...protokoll.chunks, ...protokoll.cssAssets];
  eindeutig(ausgaben, c => c.datei, 'Ausgabedatei');
  for (const c of ausgaben) {
    relativerPfad(c.datei);
    if (!Number.isSafeInteger(c.groesse) || c.groesse < 0 || !/^[a-f0-9]{64}$/.test(c.sha256)) throw new Error('Bündelabgleich: Ausgabebeleg fehlt.');
    let bytes;
    try { bytes = leseRepositorydatei(dist, c.datei); }
    catch { throw new Error('Bündelabgleich: protokollierte Ausgabedatei fehlt oder liegt außerhalb dist.'); }
    if (bytes.length !== c.groesse || createHash('sha256').update(bytes).digest('hex') !== c.sha256) throw new Error('Bündelabgleich: Ausgabedatei hat abweichende Größe oder SHA-256.');
  }
  function dateien(rel = '') {
    return readdirSync(join(dist, rel), { withFileTypes: true }).flatMap(e => {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) throw new Error('Bündelabgleich: Verknüpfung in dist.');
      return e.isDirectory() ? dateien(p) : [p];
    });
  }
  const distDateien = dateien();
  const dateifehler = [
    ...gegenseitig(new Set(distDateien.filter(p => /\.(?:[cm]?js)$/.test(p))), new Set(protokoll.chunks.map(c => c.datei)), 'JS-Ausgabeabgleich'),
    ...gegenseitig(new Set(distDateien.filter(p => p.endsWith('.css'))), new Set(protokoll.cssAssets.map(c => c.datei)), 'CSS-Ausgabeabgleich'),
  ];
  eindeutig(protokoll.modulgraph, id => id, 'Graphmodul');
  for (const id of protokoll.modulgraph) { zerlegeKennung(id); pruefeStilOderAsset(id); }
  for (const c of protokoll.chunks) {
    relativerPfad(c.datei);
    if (!Array.isArray(c.module) || !Array.isArray(c.imports) || !Array.isArray(c.dynamischeImports)
        || typeof c.einstieg !== 'boolean' || typeof c.dynamischerEinstieg !== 'boolean') throw new Error('Bündelabgleich: unvollständiger Chunk.');
    for (const id of [...c.imports, ...c.dynamischeImports]) {
      relativerPfad(id);
      if (!protokoll.chunks.some(c => c.datei === id)) throw new Error('Bündelabgleich: Import ohne protokollierte Ausgabedatei.');
    }
    eindeutig(c.module, m => m.id, 'Modul');
    for (const m of c.module) {
      if (typeof m.id !== 'string' || !Number.isFinite(m.renderedLength) || m.renderedLength < 0) throw new Error('Bündelabgleich: ungültiger Moduleintrag.');
      zerlegeKennung(m.id); pruefeStilOderAsset(m.id);
      if (!protokoll.modulgraph.includes(m.id)) throw new Error('Bündelabgleich: Chunkmodul fehlt im Modulgraphen.');
      if (m.id.startsWith('virtuell:')) {
        if (m.renderedLength > 0) virtuelle.add(m.id);
        continue;
      }
      if (m.renderedLength === 0) continue;
      // Letzter node_modules-Abschnitt: verschachtelte Versionen sind eigene Orte.
      const ort = paketort(m.id);
      if (ort) orte.add(ort);
    }
  }
  const erwartet = new Set([...i.npm, ...i.buildHilfscode].filter(e => e.imBuendel && e.ort).map(e => e.ort));
  // Virtuelle Hilfen gehören zum Werkzeugpaket, ohne eigenes node_modules-Modul.
  for (const e of i.buildHilfscode.filter(e => e.imBuendel)) {
    if (e.module.some(id => virtuelle.has(id)) && e.ort) orte.add(e.ort);
  }
  const hilfen = new Set(i.buildHilfscode.filter(e => e.imBuendel).flatMap(e => e.module));
  return [...dateifehler, ...gegenseitig(orte, erwartet, 'Bündelabgleich'), ...gegenseitig(virtuelle, hilfen, 'Hilfscodeabgleich')];
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
  function attribute(knoten, erlaubt) {
    if (Object.keys(knoten.attribute ?? {}).some(a => !erlaubt.includes(a))) throw new Error('Gradle-Abgleich: unbekanntes Attribut.');
  }
  attribute(baum, []); attribute(root, []);
  eindeutig(root.kinder, e => e.name, 'Modellabschnitt');
  for (const abschnitt of root.kinder) {
    if (!['compile', 'package'].includes(abschnitt.name)) throw new Error('Gradle-Abgleich: unbekanntes Wurzelkind.');
    attribute(abschnitt, ['roots']);
    for (const e of abschnitt.kinder) {
      if (e.name !== 'dependency' || e.kinder.length) throw new Error('Gradle-Abgleich: unbekannte Knotenform.');
      attribute(e, ['name', 'simpleName']);
      if (typeof e.attribute.name !== 'string' || !e.attribute.name) throw new Error('Gradle-Abgleich: Abhängigkeitsname fehlt.');
    }
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

function pruefeVersionsbeleg(wurzel, e, protokoll) {
  const b = e.versionsbeleg;
  if (!b) throw new Error('Hinweise Dritter: Null-Ort-Eintrag ohne Versionsbeleg.');
  const inhalt = leseQuelle(wurzel, b).toString('utf8');
  if (b.art === 'oxc-modulkennung') {
    const kennung = /#region \\0(@oxc-project\+runtime)@([^/\s]+)\/helpers\//g;
    const funde = [...inhalt.matchAll(kennung)];
    if (!funde.length || e.paket !== '@oxc-project/runtime' || funde.some(f => f[2] !== e.version)) throw new Error('Hinweise Dritter: Hilfscode-Identität oder Version weicht vom Quellenbeleg ab.');
    const vorsatz = `virtuell:@oxc-project+runtime@${e.version}/helpers/`;
    if (!e.module.every(id => id.startsWith(vorsatz))
        || (protokoll && protokoll.chunks.flatMap(c => c.module).some(m => m.id.startsWith('virtuell:@oxc-project+runtime@') && !m.id.startsWith(vorsatz)))) {
      throw new Error('Hinweise Dritter: Hilfscode-Version weicht von Modulkennungen ab.');
    }
  } else if (b.art === 'gradle-projekt') {
    const settings = leseQuelle(wurzel, b.settings).toString('utf8');
    const funde = [...settings.matchAll(/project\(':([^']+)'\)\.projectDir\s*=\s*new File\('\.\/([^']+)\/'\)/g)];
    const projekt = funde.find(f => `app/android/${f[2]}/build.gradle` === b.datei);
    const versionen = [...inhalt.matchAll(/\bversionName\s+["']([^"']+)["']/g)];
    if (!projekt || projekt[1] !== e.name || !settings.includes(`include ':${e.name}'`)
        || versionen.length !== 1 || versionen[0][1] !== e.version) throw new Error('Hinweise Dritter: Projektmodul-Identität oder Version weicht vom Gradle-Beleg ab.');
  } else throw new Error('Hinweise Dritter: unbekannte Versionsbelegform.');
}

export function pruefeInventar(wurzel, pakete, { buendel, gradleModell, streng = false, pruefeAusdruck, umgebung = process.env } = {}) {
  const fehler = [];
  const offeneLizenzen = [];
  let platzhalter = 0;
  try {
    const i = pruefeFormat(leseInventar(wurzel));
    const protokoll = buendel ? leseProtokoll(buendel) : null;
    platzhalter = gruppen(i).flat().filter(e => e.status === 'platzhalter').length;
    if (streng && platzhalter) fehler.push(`Hinweise Dritter: ${platzhalter} Platzhalter im strengen Modus.`);
    const abdeckung = [...i.npm, ...i.android.projektmodule.filter(e => e.ort), ...i.ausnahmen];
    eindeutig(abdeckung, e => e.ort, 'Lockfile-Ort');
    eindeutig(i.buildHilfscode, e => e.paket, 'Hilfscode');
    eindeutig(i.eingebettet, e => e.name, 'eingebetteter Anteil');
    eindeutig(i.android.projektmodule, e => e.name, 'Projektmodul');
    eindeutig(i.android.maven, e => `${e.gruppe}:${e.name}:${e.version}`, 'Maven-Eintrag');
    // Eine einzige Auslieferungsregel für alle tatsächlich ausgelieferten Gruppen.
    const ausgeliefert = [
      ['npm', i.npm.filter(e => e.imBuendel)], ['eingebettet', i.eingebettet],
      ['buildHilfscode', i.buildHilfscode.filter(e => e.imBuendel)],
      ['android.projektmodule', i.android.projektmodule], ['android.maven', i.android.maven],
    ];
    for (const [gruppe, eintraege] of ausgeliefert) for (const e of eintraege) {
      const paket = e.gruppe ? `${e.gruppe}:${e.name}` : e.paket ? `${e.paket}${e.name ? '/' + e.name : ''}` : e.name;
      let unbekannt = false;
      try {
        let entscheidung;
        try { entscheidung = pruefeAusdruck(e.lizenz, 'ausgeliefert'); }
        catch { unbekannt = true; }
        if (e.lizenzentscheidung) {
          if (!istUebergangsangabe(gruppe, e)) throw new Error();
          // Sichtbarer Entscheidungsbedarf, keine Freigabe und kein neuer SPDX-Wert.
          leseQuelle(wurzel, e.lizenzentscheidung.beleg);
          offeneLizenzen.push({ paket, angabe: e.lizenz, gruppe });
          if (!streng) continue;
          throw new Error();
        }
        if (unbekannt || !entscheidung?.zulaessig) throw new Error();
      } catch { fehler.push(`Hinweise Dritter: Lizenz für ausgeliefert unbekannt oder nicht zugelassen: ${paket} | ${e.lizenz} | ${gruppe}.`); }
    }
    for (const e of [...i.buildHilfscode, ...i.android.projektmodule].filter(e => e.ort === null)) {
      try { pruefeVersionsbeleg(wurzel, e, protokoll); }
      catch (f) { fehler.push(f.message); }
    }
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
        const bereich = i.buildHilfscode.includes(e) && e.imBuendel ? 'ausgeliefert' : p.bereich;
        if (!pruefeAusdruck(angabe, bereich, e.lizenz).zulaessig) throw new Error();
        const manifest = JSON.parse(leseRepositorydatei(wurzel, 'package.json', e.ort).toString('utf8'));
        if (manifest.name !== e.paket || manifest.version !== e.version) fehler.push(`Hinweise Dritter: Paketmanifest weicht ab: ${e.ort}.`);
        const lokal = p.ausnahme && manifest.license === p.ausnahme.angabe ? p.ausnahme.lizenz : manifest.license;
        if (!pruefeAusdruck(lokal, bereich, e.lizenz).zulaessig) throw new Error();
      } catch { fehler.push(`Hinweise Dritter: Lizenzwahl oder Paketmanifest nicht passend: ${e.ort}.`); }
    }
    // Auch Platzhalter dürfen vorhandene Quellhashes nicht umgehen.
    for (const e of gruppen(i).flat()) {
      for (const quelle of [e.lizenzdatei, e.behaelter].filter(Boolean)) {
        try { leseQuelle(wurzel, quelle, e.ort); } catch (e) { fehler.push(e.message); }
      }
    }
    try { pruefeHinweisdatei(wurzel, i); } catch (e) { fehler.push(e.message); }
    if (buendel) fehler.push(...pruefeBuendel(i, protokoll, join(wurzel, 'app/dist')));
    if (gradleModell) fehler.push(...pruefeGradleModell(i, gradleModell, { umgebung }));
  } catch (e) { fehler.push(e.message); }
  return { fehler: [...new Set(fehler)], platzhalter, offeneLizenzen };
}
