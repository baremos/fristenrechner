#!/usr/bin/env node
// Offline-Generator. Quellen ausschließlich innerhalb der angegebenen Repositorywurzel.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzelVorgabe = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = x => typeof x === 'string' && x.trim().length > 0;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const sortiere = (liste, feld) => [...liste].sort((a, b) => a[feld] < b[feld] ? -1 : a[feld] > b[feld] ? 1 : 0);
export const gruppen = i => [i.npm, i.eingebettet, i.buildHilfscode, i.android.projektmodule, i.android.maven, i.ausnahmen];

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

export function pruefeFormat(i) {
  if (i?.formatVersion !== 1 || !i.android || !gruppen(i).every(Array.isArray)) {
    throw new Error('Hinweise Dritter: Inventarformat 1 mit allen Gruppen erwartet.');
  }
  if (!i.apache || i.apache.datei !== 'LICENSE' || !hash(i.apache.sha256)) {
    throw new Error('Hinweise Dritter: Apache-Quelle LICENSE mit SHA-256 erwartet.');
  }
  for (const liste of gruppen(i)) {
    for (const e of liste) {
      if (!['platzhalter', 'vollstaendig'].includes(e?.status)) throw new Error('Hinweise Dritter: Status fehlt oder ist ungültig.');
      if (!text(e.lizenz)) throw new Error('Hinweise Dritter: Lizenzwahl fehlt.');
      if (e.lizenzdatei) { relativerPfad(e.lizenzdatei.datei); if (!hash(e.lizenzdatei.sha256)) throw new Error('Hinweise Dritter: Lizenzhash ungültig.'); }
      if (e.behaelter) { relativerPfad(e.behaelter.datei); if (!hash(e.behaelter.sha256)) throw new Error('Hinweise Dritter: Behälterhash ungültig.'); }
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
  }
  for (const e of i.android.maven) {
    if (![e.gruppe, e.name, e.version].every(text) || (e.status !== 'platzhalter' && e.lizenz !== 'Apache-2.0' && !text(e.wortlaut))) throw new Error('Hinweise Dritter: Maven-Artefakt unvollständig.');
  }
  for (const e of i.ausnahmen) {
    relativerPfad(e.ort);
    if (![e.paket, e.version, e.grund].every(text)) throw new Error('Hinweise Dritter: Ausnahme ohne Paket, Version oder Begründung.');
  }
  return i;
}

function originaltext(bytes) {
  // Hash immer an den Quellbytes, erst danach ausschließlich Zeilenenden ändern.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('Hinweise Dritter: Lizenzquelle mit BOM.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'); }
  catch { throw new Error('Hinweise Dritter: Lizenzquelle ist kein UTF-8.'); }
}

export function erzeugeHinweise(wurzel, inventar = leseInventar(wurzel)) {
  const i = pruefeFormat(inventar);
  const apache = originaltext(leseQuelle(wurzel, i.apache));
  const zeilen = ['Hinweise zu Komponenten Dritter',
    ...(gruppen(i).flat().some(e => e.status === 'platzhalter')
      ? ['Stand: Werkzeuge vorhanden, Inhalte mit Platzhaltern, Einbindung in die App folgt.'] : []),
    'Apache-2.0 (gemeinsamer Lizenztext)', apache];
  function abschnitt(titel, liste, feld, beschreibung) {
    zeilen.push(titel);
    for (const e of sortiere(liste, feld)) {
      zeilen.push(beschreibung(e) + ` | Lizenz: ${e.lizenz}` + (e.imBuendel === false ? ' | nicht im aktuellen Bündel' : ''));
      if (e.status === 'platzhalter') zeilen.push('PLATZHALTER: Inhalt noch zu vervollständigen und zu prüfen.');
      const bytes = e.lizenzdatei ? leseQuelle(wurzel, e.lizenzdatei, e.ort) : null;
      if (e.behaelter) leseQuelle(wurzel, e.behaelter, e.ort);
      if (e.lizenz === 'Apache-2.0') zeilen.push('Lizenztext: siehe Apache-2.0 oben.');
      else if (bytes && !i.buildHilfscode.includes(e)) zeilen.push(originaltext(bytes));
      if (text(e.wortlaut)) {
        // Derselbe vollständige Apache-Text erhält ebenfalls nur den Verweis.
        if (e.lizenz === 'Apache-2.0' && e.wortlaut === apache) continue;
        if (e.wortlaut.includes(apache)) throw new Error('Hinweise Dritter: Apache-Text muss getrennt von Zusatzhinweisen stehen.');
        zeilen.push(e.wortlaut);
      }
    }
  }
  abschnitt('npm-Pakete im Web-Teil', i.npm, 'ort', e => `${e.paket}@${e.version}`);
  abschnitt('Eingebettete Anteile', i.eingebettet, 'name', e => `${e.name} in ${e.paket}: ${e.quelle}`);
  abschnitt('Vom Build eingefügter Hilfscode', i.buildHilfscode, 'paket', e => `${e.paket}@${e.version}`);
  abschnitt('Android-Projektmodule', i.android.projektmodule, 'name', e => `${e.name}@${e.version}`);
  abschnitt('Android-Maven-Artefakte', i.android.maven.map(e => ({ ...e, kennung: `${e.gruppe}:${e.name}:${e.version}` })), 'kennung', e => e.kennung);
  zeilen.push('Begründete Lockfile-Ausnahmen');
  for (const e of sortiere(i.ausnahmen, 'ort')) {
    zeilen.push(`${e.ort} | ${e.paket}@${e.version} | ${e.lizenz} | ${e.grund}`);
    if (e.status === 'platzhalter') zeilen.push('PLATZHALTER: Ausnahme noch abschließend zu prüfen.');
  }
  return Buffer.from(zeilen.join('\n\n') + '\n', 'utf8');
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
    if (argv[0] === '--schreiben') writeFileSync(join(wurzelVorgabe, 'app/src/hinweise-dritter.txt'), erzeugeHinweise(wurzelVorgabe));
    else pruefeHinweisdatei(wurzelVorgabe);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) haupt(process.argv.slice(2));
