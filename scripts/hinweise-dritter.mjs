#!/usr/bin/env node
// Offline-Generator. Quellen ausschließlich innerhalb der angegebenen Repositorywurzel.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzelVorgabe = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = x => typeof x === 'string' && x.trim().length > 0;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const sortiere = (liste, feld) => [...liste].sort((a, b) => a[feld] < b[feld] ? -1 : a[feld] > b[feld] ? 1 : 0);
export const gruppen = i => [i.npm, i.eingebettet, i.buildHilfscode, i.android.projektmodule, i.android.maven, i.ausnahmen];
// Zusatztexte bleiben unabhängig von dem Wortlaut einer fest gebundenen Ausnahme.
const inhalte = e => [e, ...(e.bestandteile ?? []), ...(e.zusatzhinweise ?? [])];

function pruefeFelder(e, felder, art) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`Hinweise Dritter: ${art} muss ein Objekt sein.`);
  for (const feld of Object.keys(e)) if (!felder.includes(feld)) throw new Error(`Hinweise Dritter: nicht vorgesehenes Feld in ${art}: ${feld}.`);
}

function pruefeStruktur(i) {
  pruefeFelder(i, ['formatVersion', 'beschreibung', 'apache', 'npm', 'eingebettet', 'buildHilfscode', 'android', 'ausnahmen'], 'Inventar');
  pruefeFelder(i.android, ['projektmodule', 'maven'], 'Android-Gruppe');
  const quelle = (q, art) => pruefeFelder(q, ['datei', 'sha256'], art);
  quelle(i.apache, 'Apache-Quelle');
  const gemeinsam = ['lizenz', 'status', 'lizenzentscheidung', 'entschiedeneAusnahme', 'lizenzdatei', 'behaelter', 'originale', 'belege', 'wortlaut', 'lizenztext', 'bestandteile', 'zusatzhinweise'];
  for (const [liste, felder, art] of [
    [i.npm, ['paket', 'version', 'ort', 'imBuendel'], 'npm-Eintrag'],
    [i.eingebettet, ['name', 'paket', 'version', 'ort', 'quelle', 'ohneLizenzangabe'], 'eingebetteter Eintrag'],
    [i.buildHilfscode, ['paket', 'version', 'ort', 'imBuendel', 'module', 'versionsbeleg', 'anmerkung', 'herkunft'], 'Hilfscode'],
    [i.android.projektmodule, ['name', 'paket', 'version', 'ort', 'versionsbeleg', 'herkunft'], 'Projektmodul'],
    [i.android.maven, ['gruppe', 'name', 'version', 'herkunft'], 'Maven-Eintrag'],
    [i.ausnahmen, ['paket', 'version', 'ort', 'grund'], 'Lockfile-Ausnahme'],
  ]) for (const e of liste) {
    pruefeFelder(e, [...gemeinsam, ...felder], art);
    // Zusatzinhalte nur dort, wo die Auslieferungsprüfung sie auch sieht: nicht bei
    // Lockfile-Ausnahmen und nicht bei Einträgen außerhalb des Bündels.
    const ausgeliefert = liste === i.ausnahmen ? false : felder.includes('imBuendel') ? e.imBuendel === true : true;
    for (const feld of ['bestandteile', 'zusatzhinweise']) {
      if (e[feld] === undefined) continue;
      if (!ausgeliefert) throw new Error(`Hinweise Dritter: Zusatzinhalte nur bei ausgelieferten Einträgen: ${art}.`);
      if (!Array.isArray(e[feld])) throw new Error('Hinweise Dritter: Zusatztexte müssen Listen sein.');
    }
    for (const b of e.bestandteile ?? []) {
      pruefeFelder(b, ['name', 'lizenz', 'version', 'quelle', 'wortlaut', 'originale', 'belege', 'lizenztext', 'herkunftsbeleg', 'lizenzbeleg', 'artefaktbeleg'], 'Bestandteil');
      if (!text(b.name) || !text(b.lizenz)) throw new Error('Hinweise Dritter: Bestandteil unvollständig.');
    }
    for (const z of e.zusatzhinweise ?? []) {
      pruefeFelder(z, ['wortlaut', 'originale'], 'Zusatzhinweis');
      if (!text(z.wortlaut) || !Array.isArray(z.originale) || !z.originale.length) throw new Error('Hinweise Dritter: Zusatzhinweis ohne gebundenen Originalwortlaut.');
    }
    for (const t of inhalte(e)) {
      for (const feld of ['originale', 'belege']) {
        if (t[feld] !== undefined && !Array.isArray(t[feld])) throw new Error('Hinweise Dritter: Originale und Belege müssen Listen sein.');
      }
      for (const q of t.originale ?? []) pruefeFelder(q, ['datei', 'sha256', 'quellkarteQuelle', 'von', 'bis', 'auszugSha256'], 'Originalquelle');
      for (const q of [...(t.belege ?? []), ...[t.lizenzdatei, t.behaelter, t.lizenztext].filter(Boolean)]) quelle(q, 'Textquelle');
      if (t.herkunftsbeleg) pruefeFelder(t.herkunftsbeleg, ['quelle', 'groesse', 'sha256', 'zeile', 'von', 'bis', 'auszugSha256'], 'Herkunftsbeleg');
      if (t.lizenzbeleg) pruefeFelder(t.lizenzbeleg, ['quelle', 'groesse', 'sha256'], 'Lizenzbeleg');
      if (t.artefaktbeleg) {
        const a = t.artefaktbeleg;
        pruefeFelder(a, ['jar', 'jarSha256', 'klasse', 'klasseSha256', 'sourceFile', 'apk', 'dex', 'klassendeskriptor', 'alsKlasseDefiniert', 'minifyEnabled'], 'Artefaktbeleg');
        pruefeFelder(a.apk, ['datei', 'bytes', 'sha256'], 'APK-Beleg');
        if (!Array.isArray(a.dex)) throw new Error('Hinweise Dritter: DEX-Belege müssen eine Liste sein.');
        for (const q of a.dex) quelle(q, 'DEX-Beleg');
      }
    }
    if (e.versionsbeleg) {
      pruefeFelder(e.versionsbeleg, ['art', 'datei', 'sha256', 'settings'], 'Versionsbeleg');
      if (e.versionsbeleg.settings) quelle(e.versionsbeleg.settings, 'Settings-Beleg');
    }
    for (const feld of ['lizenzentscheidung', 'entschiedeneAusnahme']) if (e[feld]) {
      pruefeFelder(e[feld], feld === 'lizenzentscheidung' ? ['angabe', 'grund', 'beleg'] : ['angabe', 'beleg', 'datum', 'entscheidung'], 'Lizenzentscheidung');
      quelle(e[feld].beleg, 'Entscheidungsbeleg');
    }
  }
}

function pruefeInhaltsbestand(i) {
  const jspdf = i.npm.find(e => e.paket === 'jspdf');
  if (i.npm.some(e => e.paket === 'jspdf' && e.version !== '4.2.1')) throw new Error('Hinweise Dritter: Pflichtangaben für diese jsPDF-Version sind nicht gepflegt.');
  if (jspdf && !jspdf.originale?.some(q => q.datei === `${jspdf.ort}/dist/jspdf.es.min.js`
      && q.von === 0 && q.bis === 2700
      && q.sha256 === '761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83')) {
    throw new Error('Hinweise Dritter: vollständiger jsPDF-Bündelkopf fehlt.');
  }
  const kotlin = i.android.maven.find(e => e.gruppe === 'org.jetbrains.kotlin' && e.name === 'kotlin-stdlib');
  if (i.android.maven.some(e => e.gruppe === 'org.jetbrains.kotlin' && e.name === 'kotlin-stdlib' && e.version !== '2.0.21')) throw new Error('Hinweise Dritter: Pflichtangaben für diese Kotlin-Version sind nicht gepflegt.');
  if (kotlin) for (const [name, lizenz, quelle, auszugSha256] of [
    ['GWT-Ableitung', 'Apache-2.0', 'libraries/stdlib/src/kotlin/collections', '52d5885aa15f3f1a7f193256bca9cf95ea5ab7736697c6964b2882f4f140edb0'],
    ['Guava-Ableitung', 'Apache-2.0', 'libraries/stdlib/jvm/src/kotlin/util/UnsignedJVM.kt', '0078015de8eb05b76c05f9e6d336eed66951fd6a0d8de23f6bd0762885be6764'],
    ['Boost-Ableitung', 'BSL-1.0', 'libraries/stdlib/jvm/src/kotlin/util/MathJVM.kt', 'd40f1aa4be444e73ba61e59bbcbfc2b49d4ebede33ddde77d7b00878073bfcd3'],
  ]) {
    const b = kotlin.bestandteile?.filter(b => b.name === name);
    if (b?.length !== 1 || b[0].lizenz !== lizenz || b[0].quelle !== quelle
        || b[0].herkunftsbeleg?.quelle !== 'https://raw.githubusercontent.com/JetBrains/kotlin/v2.0.21/license/README.md'
        || b[0].herkunftsbeleg?.sha256 !== '8a82f8702ea943f008c84a61b8df7b053b7d36cfa293e3abd59f839b728a5999'
        || b[0].herkunftsbeleg?.auszugSha256 !== auszugSha256) {
      throw new Error(`Hinweise Dritter: Kotlin-Bestandteil fehlt oder weicht ab: ${name}.`);
    }
  }
}

export function relativerPfad(pfad) {
  if (!text(pfad) || /[\\:\x00-\x1f]/.test(pfad)
      || pfad.split('/').some(x => !x || x === '.' || x === '..')) {
    throw new Error('Hinweise Dritter: ungültiger relativer Pfad.');
  }
  return pfad;
}

function innerhalb(basis, datei) {
  const rel = relative(basis, datei);
  return !isAbsolute(rel) && !rel.split(/[\\/]/).includes('..');
}

export function leseQuelle(wurzel, quelle, paketort) {
  relativerPfad(quelle.datei);
  if (!hash(quelle.sha256)) throw new Error('Hinweise Dritter: SHA-256 fehlt oder ist ungültig.');
  const bytes = leseRepositorydatei(wurzel, quelle.datei, paketort);
  if (!bytes.length) throw new Error('Hinweise Dritter: leere Quelldatei.');
  if (createHash('sha256').update(bytes).digest('hex') !== quelle.sha256) {
    throw new Error(`Hinweise Dritter: Quelle ${paketort ? paketort + '/' : ''}${quelle.datei} hat abweichenden SHA-256.`);
  }
  return bytes;
}

export function leseRepositorydatei(wurzel, datei, paketort) {
  relativerPfad(datei);
  if (paketort) relativerPfad(paketort);
  try {
    const basis = realpathSync(wurzel);
    const ordner = realpathSync(paketort ? join(wurzel, paketort) : wurzel);
    const pfad = realpathSync(join(ordner, datei));
    if (!innerhalb(basis, ordner) || !innerhalb(ordner, pfad)) throw new Error();
    return readFileSync(pfad);
  } catch {
    throw new Error(`Hinweise Dritter: Quelle ${paketort ? paketort + '/' : ''}${datei} fehlt, ist nicht lesbar oder liegt außerhalb der Wurzel.`);
  }
}

export function leseInventar(wurzel) {
  try { return JSON.parse(leseRepositorydatei(wurzel, 'scripts/hinweise-dritter.json').toString('utf8')); }
  catch { throw new Error('Hinweise Dritter: Inventar fehlt oder ist ungültig.'); }
}

export function schreibeHinweise(wurzel) {
  const bytes = erzeugeHinweise(wurzel);
  const datei = join(wurzel, 'app/src/hinweise-dritter.txt');
  try {
    const basis = realpathSync(wurzel);
    const eltern = realpathSync(dirname(datei));
    const ziel = lstatSync(datei, { throwIfNoEntry: false }) ? realpathSync(datei) : join(eltern, 'hinweise-dritter.txt');
    if (!innerhalb(basis, eltern) || !innerhalb(basis, ziel)) throw new Error();
    writeFileSync(ziel, bytes);
  } catch { throw new Error('Hinweise Dritter: Ausgabeort nicht schreibbar oder außerhalb der Wurzel.'); }
}

export function pruefeFormat(i) {
  if (i?.formatVersion !== 2 || !i.android || !gruppen(i).every(Array.isArray)) {
    throw new Error('Hinweise Dritter: Inventarformat 2 mit allen Gruppen erwartet.');
  }
  if (!i.apache || i.apache.datei !== 'LICENSE' || !hash(i.apache.sha256)) {
    throw new Error('Hinweise Dritter: Apache-Quelle LICENSE mit SHA-256 erwartet.');
  }
  // Dieselbe flache Form gilt vor Ausgabe und Lizenzprüfung, in jedem Modus.
  pruefeStruktur(i);
  for (const liste of gruppen(i)) {
    for (const e of liste) {
      if (!['platzhalter', 'vollstaendig'].includes(e?.status)) throw new Error('Hinweise Dritter: Status fehlt oder ist ungültig.');
      if (!text(e.lizenz)) throw new Error('Hinweise Dritter: Lizenzwahl fehlt.');
      if (e.lizenzentscheidung && (e.status !== 'platzhalter' || e.lizenzentscheidung.angabe !== e.lizenz
          || !text(e.lizenzentscheidung.grund) || !e.lizenzentscheidung.beleg)) {
        throw new Error('Hinweise Dritter: offene Lizenzentscheidung benötigt unveränderte Angabe, Platzhalterstatus, Grund und Beleg.');
      }
      if (e.lizenzdatei) { relativerPfad(e.lizenzdatei.datei); if (!hash(e.lizenzdatei.sha256)) throw new Error('Hinweise Dritter: Lizenzhash ungültig.'); }
      if (e.behaelter) { relativerPfad(e.behaelter.datei); if (!hash(e.behaelter.sha256)) throw new Error('Hinweise Dritter: Behälterhash ungültig.'); }
      for (const quelle of [...(e.originale ?? []), ...(e.belege ?? [])]) {
        relativerPfad(quelle.datei);
        if (!hash(quelle.sha256)) throw new Error('Hinweise Dritter: Originalbeleg ohne SHA-256.');
      }
      if (e.originale && (!Array.isArray(e.originale) || !e.originale.length)) throw new Error('Hinweise Dritter: Originalbelege fehlen.');
      if (e.wortlaut !== undefined && e.wortlaut !== null && (!text(e.wortlaut) || e.wortlaut.includes('\r') || e.wortlaut.startsWith('\uFEFF'))) {
        throw new Error('Hinweise Dritter: Wortlaut muss nichtleeres UTF-8 mit LF ohne BOM sein.');
      }
    }
  }
  for (const e of [...i.npm, ...i.buildHilfscode]) {
    if (!text(e.paket) || !text(e.version) || typeof e.imBuendel !== 'boolean') throw new Error('Hinweise Dritter: Paket, Version oder Bündelmarkierung fehlt.');
    if (e.ort !== null) relativerPfad(e.ort);
    if (i.npm.includes(e) && !e.ort) throw new Error('Hinweise Dritter: npm-Paketort fehlt.');
    if (i.npm.includes(e) && !e.lizenzdatei) throw new Error('Hinweise Dritter: Lizenzdatei mit SHA-256 für npm-Paket fehlt.');
    if (e.status !== 'platzhalter' && !e.lizenzdatei && !text(e.wortlaut)) throw new Error('Hinweise Dritter: vollständiger Pakettext fehlt.');
    if (e.lizenzdatei && !e.ort) throw new Error('Hinweise Dritter: Lizenzdatei ohne Paketort.');
    if (i.buildHilfscode.includes(e) && (!Array.isArray(e.module) || !e.module.length || !e.module.every(text))) throw new Error('Hinweise Dritter: Hilfsmodulkennungen fehlen.');
    if (i.buildHilfscode.includes(e) && e.status !== 'platzhalter' && !text(e.wortlaut)) throw new Error('Hinweise Dritter: Hilfscodewortlaut fehlt.');
    if (e.ort === null && !e.versionsbeleg) throw new Error('Hinweise Dritter: Null-Ort-Eintrag ohne Versionsbeleg.');
  }
  for (const e of i.eingebettet) {
    if (!text(e.name) || !text(e.paket) || !text(e.quelle)) throw new Error('Hinweise Dritter: eingebetteter Anteil unvollständig.');
    relativerPfad(e.ort);
    if (!e.behaelter || (e.status !== 'platzhalter' && !text(e.wortlaut))) throw new Error('Hinweise Dritter: Behälter oder vollständiger Wortlaut fehlt.');
  }
  for (const e of i.android.projektmodule) {
    if (!text(e.name) || !text(e.version)) throw new Error('Hinweise Dritter: Projektmodul unvollständig.');
    if (e.ort !== null) relativerPfad(e.ort);
    if (e.lizenzdatei && !e.ort) throw new Error('Hinweise Dritter: Projektlizenz ohne Ort.');
    if (e.status !== 'platzhalter' && !e.lizenzdatei && !text(e.wortlaut)) throw new Error('Hinweise Dritter: Projektmodultext fehlt.');
    if (e.ort === null && !e.versionsbeleg) throw new Error('Hinweise Dritter: Null-Ort-Eintrag ohne Versionsbeleg.');
  }
  for (const e of i.android.maven) {
    if (![e.gruppe, e.name, e.version].every(text) || (e.status !== 'platzhalter' && e.lizenz !== 'Apache-2.0' && !text(e.wortlaut))) throw new Error('Hinweise Dritter: Maven-Artefakt unvollständig.');
  }
  for (const e of i.ausnahmen) {
    relativerPfad(e.ort);
    if (![e.paket, e.version, e.grund].every(text)) throw new Error('Hinweise Dritter: Ausnahme ohne Paket, Version oder Begründung.');
  }
  for (const e of gruppen(i).flat().flatMap(inhalte)) {
    for (const q of [...(e.originale ?? []), ...(e.belege ?? []), ...(e.lizenztext ? [e.lizenztext] : [])]) {
      relativerPfad(q.datei);
      if (!hash(q.sha256)) throw new Error('Hinweise Dritter: Zusatzquelle ohne SHA-256.');
    }
    if (e.wortlaut !== undefined && e.wortlaut !== null && (!text(e.wortlaut) || /\r|^\uFEFF/.test(e.wortlaut))) throw new Error('Hinweise Dritter: Zusatzwortlaut muss nichtleeres UTF-8 mit LF ohne BOM sein.');
    if (/\bBSL-1\.0\b/i.test(e.lizenz ?? '') && e.lizenztext?.sha256 !== '8d8291caf1cee26d23acf3eb67c9f9a2d58f1c681b16a4fbe8cbfb9e3c0b5a9b') throw new Error('Hinweise Dritter: BSL-1.0 benötigt den vollständigen Boost-Lizenztext.');
    if (e.herkunftsbeleg) {
      const q = e.herkunftsbeleg;
      if (!hash(q.sha256) || !hash(q.auszugSha256) || !Number.isSafeInteger(q.groesse)
          || !Number.isSafeInteger(q.von) || !Number.isSafeInteger(q.bis) || q.von < 0 || q.bis > q.groesse
          || q.bis - q.von !== Buffer.byteLength(e.wortlaut ?? '')
          || createHash('sha256').update(e.wortlaut ?? '').digest('hex') !== q.auszugSha256) throw new Error('Hinweise Dritter: Herkunftsauszug weicht vom protokollierten Wortlaut ab.');
    }
  }
  pruefeInhaltsbestand(i);
  return i;
}

function originaltext(bytes) {
  // Hash immer an den Quellbytes, erst danach ausschließlich Zeilenenden ändern.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('Hinweise Dritter: Lizenzquelle mit BOM.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'); }
  catch { throw new Error('Hinweise Dritter: Lizenzquelle ist kein UTF-8.'); }
}

export function pruefeOriginale(wurzel, e) {
  for (const q of e.belege ?? []) leseQuelle(wurzel, q);
  if (!e.originale) return;
  const texte = e.originale.map(q => {
    let bytes = leseQuelle(wurzel, q);
    if (q.quellkarteQuelle !== undefined) {
      const karte = JSON.parse(originaltext(bytes));
      const index = karte.sources?.indexOf(q.quellkarteQuelle);
      if (index < 0 || typeof karte.sourcesContent?.[index] !== 'string') throw new Error('Hinweise Dritter: Originalquelle fehlt in der Quellkarte.');
      bytes = Buffer.from(karte.sourcesContent[index], 'utf8');
    }
    if (q.von !== undefined || q.bis !== undefined) {
      if (!Number.isSafeInteger(q.von) || !Number.isSafeInteger(q.bis) || q.von < 0 || q.bis <= q.von || q.bis > bytes.length) throw new Error('Hinweise Dritter: ungültiger Originalauszug.');
      bytes = bytes.subarray(q.von, q.bis);
    }
    if (!hash(q.auszugSha256) || createHash('sha256').update(bytes).digest('hex') !== q.auszugSha256) throw new Error('Hinweise Dritter: Originalauszug hat abweichenden SHA-256.');
    return originaltext(bytes);
  });
  if (e.wortlaut !== texte.join('\n\n')) throw new Error('Hinweise Dritter: Wortlaut weicht vom Original ab.');
}

export function erzeugeHinweise(wurzel, inventar = leseInventar(wurzel)) {
  const i = pruefeFormat(inventar);
  const apacheBytes = leseQuelle(wurzel, i.apache);
  const apache = originaltext(apacheBytes);
  const zeilen = [];
  // Nicht ausgelieferte Einträge bleiben geprüft, aber ohne Nutzertext.
  for (const e of gruppen(i).flat()) {
    if (e.lizenzdatei) leseQuelle(wurzel, e.lizenzdatei, e.ort);
    if (e.behaelter) leseQuelle(wurzel, e.behaelter, e.ort);
    for (const t of inhalte(e)) {
      pruefeOriginale(wurzel, t);
      if (t.lizenztext) leseQuelle(wurzel, t.lizenztext);
    }
  }
  function abschnitt(titel, liste, feld, beschreibung) {
    zeilen.push(titel);
    for (const e of sortiere(liste, feld)) {
      zeilen.push(beschreibung(e) + (e.ohneLizenzangabe ? '' : ` · ${e.lizenz}`));
      if (e.ohneLizenzangabe) zeilen.push('Die Quelle nennt für diesen Bestandteil keine Lizenz. Wiedergegeben ist der Hinweis aus jsPDF.');
      const bytes = e.lizenzdatei ? leseQuelle(wurzel, e.lizenzdatei, e.ort) : null;
      if (e.behaelter) leseQuelle(wurzel, e.behaelter, e.ort);
      const quelltext = bytes ? originaltext(bytes) : null;
      if (e.lizenz === 'Apache-2.0' && bytes && !bytes.equals(apacheBytes)) throw new Error('Hinweise Dritter: Apache-Lizenzdatei weicht vom gemeinsamen Text ab; Zusatzhinweise getrennt pflegen.');
      if (quelltext?.includes(apache) && quelltext !== apache) throw new Error('Hinweise Dritter: Apache-Text in Lizenzdatei muss getrennt von Zusatzhinweisen stehen.');
      if (e.lizenz !== 'Apache-2.0' && quelltext !== apache && quelltext && !i.buildHilfscode.includes(e)) zeilen.push(quelltext);
      // Nur den doppelten Haupttext auslassen; Zusatzinhalte immer ausgeben.
      if (text(e.wortlaut) && !(e.lizenz === 'Apache-2.0' && e.wortlaut === apache)) {
        if (e.wortlaut.includes(apache)) throw new Error('Hinweise Dritter: Apache-Text muss getrennt von Zusatzhinweisen stehen.');
        zeilen.push(e.wortlaut);
      }
      for (const z of e.zusatzhinweise ?? []) zeilen.push(z.wortlaut);
      if (e.lizenztext) zeilen.push(originaltext(leseQuelle(wurzel, e.lizenztext)));
      for (const b of e.bestandteile ?? []) {
        zeilen.push(`${b.name} · ${b.lizenz}`);
        if (text(b.wortlaut)) zeilen.push(b.wortlaut);
        if (b.lizenztext) zeilen.push(originaltext(leseQuelle(wurzel, b.lizenztext)));
      }
    }
  }
  const eingebettet = paket => i.eingebettet.filter(e => e.paket === paket);
  const identitaet = e => `${e.name} · ${e.paket}${e.version ? '@' + e.version : ''}`;
  abschnitt('Im Web-Teil der App enthalten', [...i.npm, ...i.eingebettet.filter(e => !['jspdf', 'jspdf-autotable'].includes(e.paket))], 'ort', e => e.name ? identitaet(e) : `${e.paket}@${e.version}`);
  abschnitt('In jsPDF eingebettete Bestandteile', eingebettet('jspdf'), 'name', identitaet);
  abschnitt('In jsPDF-AutoTable eingebettete Bestandteile', eingebettet('jspdf-autotable'), 'name', identitaet);
  abschnitt('Vom Build-Werkzeug eingefügter Hilfscode', i.buildHilfscode.filter(e => e.imBuendel), 'paket', e => `${e.paket}@${e.version}`);
  abschnitt('Android-Bestandteile', [
    ...i.android.projektmodule.map(e => ({ ...e, kennung: `${e.name}@${e.version}` })),
    ...i.android.maven.map(e => ({ ...e, kennung: `${e.gruppe}:${e.name}:${e.version}` })),
  ], 'kennung', e => e.kennung);
  zeilen.push('Lizenztexte', 'Apache-2.0', apache);
  const ausgabe = zeilen.join('\n\n');
  return Buffer.from(ausgabe + (ausgabe.endsWith('\n') ? '' : '\n'), 'utf8');
}

export function pruefeHinweisdatei(wurzel, inventar) {
  const soll = erzeugeHinweise(wurzel, inventar);
  let ist;
  try { ist = leseRepositorydatei(wurzel, 'app/src/hinweise-dritter.txt'); }
  catch { throw new Error('Hinweise Dritter: erzeugte Hinweisdatei fehlt.'); }
  if (!ist.equals(soll)) throw new Error('Hinweise Dritter: Hinweisdatei ist veraltet; Generator mit --schreiben aufrufen.');
}

function haupt(argv) {
  try {
    if (argv.length !== 1 || !['--schreiben', '--pruefen'].includes(argv[0])) throw new Error('Aufruf: node scripts/hinweise-dritter.mjs --schreiben | --pruefen');
    if (argv[0] === '--schreiben') schreibeHinweise(wurzelVorgabe);
    else pruefeHinweisdatei(wurzelVorgabe);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
if (import.meta.main) haupt(process.argv.slice(2));
