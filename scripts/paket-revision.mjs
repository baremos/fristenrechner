// Liest die Revision eines installierten Pakets des Android SDK.
//
// package.xml schreibt das Installationswerkzeug aus der Paketliste von Google.
// source.properties stammt aus dem Archiv und nennt bei einzelnen Paketen einen
// älteren Stand. Die Datei gilt deshalb nur, wenn package.xml fehlt.
// Eine vorhandene Beschreibung, die unlesbar ist oder ein anderes Paket nennt,
// ist ein Fehler. Es gibt dann keinen Rückgriff auf die andere Datei.
//
// Node bringt keinen XML-Leser mit, und die Skripte kommen ohne Fremdbibliothek
// aus. Der Leser hier versteht deshalb nur, was package.xml braucht: Elemente,
// Attribute, Text, Kommentare und Namensräume. Alles andere ist ein Fehler.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = '[A-Za-z_][\\w.-]*(?::[A-Za-z_][\\w.-]*)?';
const WERT = '"[^"<]*"|\'[^\'<]*\'';
const ANGABE = `(?:"[^"<]*"|'[^'<]*')`;
const KOPF = new RegExp(
  `^\\uFEFF?(?:<\\?xml\\s+version\\s*=\\s*${ANGABE}(?:\\s+encoding\\s*=\\s*${ANGABE})?(?:\\s+standalone\\s*=\\s*${ANGABE})?\\s*\\?>)?`,
);
// Reihenfolge der Gruppen: Kommentar, Beginn (Name, Attribute, leer), Ende (Name), Text
const TEIL = new RegExp(
  `(<!--(?:(?!--)[\\s\\S])*-->)|<(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:${WERT}))*)\\s*(/?)>|</(${NAME})\\s*>|([^<]+)`,
  'y',
);
const ATTRIBUT = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g');
const ZEICHEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function ungueltig(grund) {
  return new Error(`Die Datei ist kein gültiges XML: ${grund}.`);
}

function entschluessle(text) {
  if (text.includes(']]>')) throw ungueltig('unerlaubte Zeichenfolge');
  return text.replace(/&([^;&<]*);?/g, (alles, inhalt) => {
    if (!alles.endsWith(';')) throw ungueltig('unvollständige Zeichenangabe');
    if (Object.hasOwn(ZEICHEN, inhalt)) return ZEICHEN[inhalt];
    const zahl = /^#(\d+)$/.exec(inhalt) ?? /^#x([0-9a-fA-F]+)$/.exec(inhalt);
    if (!zahl) throw ungueltig('unbekannte Zeichenangabe');
    const wert = parseInt(zahl[1], inhalt.startsWith('#x') ? 16 : 10);
    if (wert === 0 || wert > 0x10ffff) throw ungueltig('unerlaubte Zeichenangabe');
    return String.fromCodePoint(wert);
  });
}

function vorsilbe(name) {
  return name.includes(':') ? name.slice(0, name.indexOf(':')) : '';
}

// Liefert das Wurzelelement. Jeder Knoten trägt name (ohne Vorsilbe), raum
// (Namensraum, leer für keinen), attribute, kinder, text und gemischt.
export function leseXml(text) {
  const wurzel = { name: null, raum: '', raeume: { xml: 'http://www.w3.org/XML/1998/namespace' }, attribute: {}, kinder: [], text: '', gemischt: false };
  const stapel = [wurzel];
  TEIL.lastIndex = KOPF.exec(text)[0].length;
  while (TEIL.lastIndex < text.length) {
    const stelle = TEIL.lastIndex;
    const treffer = TEIL.exec(text);
    if (!treffer) throw ungueltig(`unerwarteter Inhalt an Stelle ${stelle}`);
    const [, kommentar, beginn, attribute, leer, ende, inhalt] = treffer;
    const oben = stapel.at(-1);
    if (kommentar !== undefined) {
      oben.gemischt = true;
    } else if (inhalt !== undefined) {
      oben.text += entschluessle(inhalt);
    } else if (ende !== undefined) {
      if (stapel.length < 2 || oben.voll !== ende) throw ungueltig(`unerwartetes Ende von ${ende}`);
      stapel.pop();
    } else {
      const knoten = { voll: beginn, name: beginn.slice(beginn.indexOf(':') + 1), raeume: { ...oben.raeume }, attribute: {}, kinder: [], text: '', gemischt: false };
      const angaben = [];
      for (const [, bezeichnung, doppelt, einfach] of attribute.matchAll(ATTRIBUT)) {
        if (angaben.some((a) => a.bezeichnung === bezeichnung)) throw ungueltig(`Attribut ${bezeichnung} ist mehrfach vorhanden`);
        angaben.push({ bezeichnung, wert: entschluessle(doppelt ?? einfach) });
      }
      for (const { bezeichnung, wert } of angaben) {
        if (bezeichnung === 'xmlns') knoten.raeume[''] = wert;
        else if (vorsilbe(bezeichnung) === 'xmlns') knoten.raeume[bezeichnung.slice(6)] = wert;
      }
      for (const { bezeichnung, wert } of angaben) {
        const v = vorsilbe(bezeichnung);
        if (v !== '' && v !== 'xmlns' && !knoten.raeume[v]) throw ungueltig(`Vorsilbe ${v} ist nicht erklärt`);
        knoten.attribute[bezeichnung] = wert;
      }
      const v = vorsilbe(beginn);
      if (v !== '' && !knoten.raeume[v]) throw ungueltig(`Vorsilbe ${v} ist nicht erklärt`);
      knoten.raum = knoten.raeume[v] ?? '';
      oben.kinder.push(knoten);
      if (!leer) stapel.push(knoten);
    }
  }
  if (stapel.length !== 1) throw ungueltig(`${stapel.at(-1).voll} ist nicht geschlossen`);
  if (wurzel.kinder.length !== 1 || wurzel.text.trim() !== '') throw ungueltig('genau ein Wurzelelement erwartet');
  return wurzel.kinder[0];
}

export function revisionAusXml(text, name) {
  const ohneRaum = (knoten, bezeichnung) => knoten.kinder.filter((k) => k.name === bezeichnung && k.raum === '');
  const pakete = ohneRaum(leseXml(text), 'localPackage');
  if (pakete.length !== 1) throw new Error('Die Datei beschreibt nicht genau ein Paket.');
  if (pakete[0].attribute.path !== name) throw new Error(`Die Datei beschreibt '${pakete[0].attribute.path ?? ''}'.`);
  const revisionen = ohneRaum(pakete[0], 'revision');
  if (revisionen.length !== 1) throw new Error('Die Datei nennt nicht genau eine Revision.');
  // Fehlt ein Feld, gilt der Ersatzwert. Ohne Ersatzwert ist das Feld Pflicht.
  const feld = (bezeichnung, ersatz) => {
    const knoten = ohneRaum(revisionen[0], bezeichnung);
    if (knoten.length === 0 && ersatz !== undefined) return ersatz;
    if (knoten.length === 0) throw new Error(`Feld ${bezeichnung} fehlt.`);
    if (knoten.length > 1) throw new Error(`Feld ${bezeichnung} ist mehrfach vorhanden.`);
    const wert = knoten[0].text.trim();
    if (knoten[0].kinder.length > 0 || knoten[0].gemischt || !/^[0-9]+$/.test(wert)) {
      throw new Error(`Feld ${bezeichnung} ist keine Zahl.`);
    }
    return wert;
  };
  const vorschau = feld('preview', '');
  return [feld('major'), feld('minor', '0'), feld('micro', '0')].join('.') + (vorschau ? ` rc${vorschau}` : '');
}

// Liefert die Revision des Pakets im Ordner oder null, wenn es fehlt.
export function revision(ordner, name) {
  const xml = join(ordner, 'package.xml');
  if (existsSync(xml)) {
    try {
      return revisionAusXml(readFileSync(xml, 'utf8'), name);
    } catch (fehler) {
      throw new Error(`${xml}: ${fehler.message}`);
    }
  }
  const datei = join(ordner, 'source.properties');
  if (!existsSync(datei)) return null;
  const inhalt = readFileSync(datei, 'utf8');
  const pfad = /^Pkg\.Path\s*=\s*(.+?)\s*$/m.exec(inhalt);
  if (pfad && pfad[1] !== name) throw new Error(`${datei}: Die Datei beschreibt '${pfad[1]}'.`);
  const treffer = /^Pkg\.Revision\s*=\s*(.+?)\s*$/m.exec(inhalt);
  return treffer ? treffer[1] : null;
}
