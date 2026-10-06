// Ein Arbeitsblatt mit den Merkmalen des Terminplans, ausschließlich Schreiben.
import { zipSync } from 'fflate';

export interface XlsxSchrift { fett?: boolean; kursiv?: boolean; groesse?: number; farbe?: string }
export interface XlsxLinie { art: 'thin' | 'medium' | 'thick' | 'hair' | 'dotted' | 'dashed' | 'double'; farbe: string }
export interface XlsxStil {
  schrift?: XlsxSchrift;
  fuellung?: string;
  zahlenformat?: string;
  rahmen?: Partial<Record<'links' | 'rechts' | 'oben' | 'unten', XlsxLinie>>;
  ausrichtung?: { horizontal?: 'left' | 'center' | 'right'; vertikal?: 'top' | 'center' | 'bottom'; umbruch?: boolean };
}
export type XlsxWert = string | number | { datum: string } | null | undefined;
export interface XlsxZelle { spalte: number; wert?: XlsxWert; stil?: XlsxStil }
export interface XlsxZeile { nr: number; zellen: XlsxZelle[]; hoehe?: number }
export interface XlsxBlatt {
  name: string;
  zeilen: XlsxZeile[];
  standardZeilenhoehe?: number;
  spaltenbreiten?: number[];
  fixierteZeilen?: number;
  autofilter?: string;
  verbunden?: string[];
  hyperlinks?: { zelle: string; ziel: string }[];
  fusszeile?: string;
  seite?: {
    papier: number;
    ausrichtung: 'portrait' | 'landscape';
    einpassen?: { breite: number; hoehe: number };
    raender: { links: number; rechts: number; oben: number; unten: number; kopf: number; fuss: number };
  };
}
export interface XlsxMappe {
  eigenschaften: { erstelltAm: string; geaendertAm?: string; ersteller?: string; betreff?: string; firma?: string };
  blatt: XlsxBlatt;
}
export type XlsxTeil = [name: string, inhalt: string];
type StilTabelle = ReturnType<typeof neueStilTabelle>;

const XML_KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_TABELLE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_BEZUG = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PAKET_BEZUG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_INHALTSTYPEN = 'http://schemas.openxmlformats.org/package/2006/content-types';
const TYP = 'application/vnd.openxmlformats-officedocument';
const MAX_ZEILE = 1048576;
const MAX_SPALTE = 16384;
const MAX_TEXT = 32767;
export const MAX_FUSSZEILE = 255;
const ERSTES_EIGENES_ZAHLENFORMAT = 164;
/** Fester Zeitstempel der ZIP-Einträge, als Felder der Ortszeit (fflate liest Ortszeit). */
const ZIP_ZEIT = [1980, 0, 1, 0, 0, 0] as const;
const ZIP_STUFE = 6;

function fehler(text: string): never {
  throw new Error(`xlsx-schreiber: ${text}`);
}

// ---------------------------------------------------------------- XML

/** Vereinheitlicht Zeilenenden und entfernt Zeichen, die XML 1.0 nicht zulässt. */
function bereinige(wert: unknown): string {
  return String(wert)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDFFF]/gu, ''); // mit Schalter u: nur einzelne Surrogate
}

function text(wert: unknown): string {
  return bereinige(wert).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(wert: unknown): string {
  return text(wert).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;');
}

/** Text einer Zelle: Folgen wie _x000D_ liest Excel als Zeichencode, der Unterstrich davor wird maskiert. */
function zellText(wert: string): string {
  if (bereinige(wert).length > MAX_TEXT) fehler(`Text einer Zelle ist länger als ${MAX_TEXT} Zeichen`);
  const maskiert = text(wert).replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_');
  const erhalten = /^\s|\s$|\n|\t| {2}/.test(maskiert) ? ' xml:space="preserve"' : '';
  return `<t${erhalten}>${maskiert}</t>`;
}

function zahl(wert: number, name: string): string {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) fehler(`${name} ist keine endliche Zahl: ${String(wert)}`);
  return String(wert);
}

// ---------------------------------------------------------------- Adressen

export function spaltenName(nummer: number): string {
  if (!Number.isInteger(nummer) || nummer < 1 || nummer > MAX_SPALTE) fehler(`Spalte außerhalb 1 bis ${MAX_SPALTE}: ${nummer}`);
  let name = '';
  for (let n = nummer; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function adresse(zeile: number, spalte: number): string {
  if (!Number.isInteger(zeile) || zeile < 1 || zeile > MAX_ZEILE) fehler(`Zeile außerhalb 1 bis ${MAX_ZEILE}: ${zeile}`);
  return `${spaltenName(spalte)}${zeile}`;
}

function leseAdresse(wert: string) {
  const treffer = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(wert);
  if (!treffer) fehler(`keine Zelladresse: ${wert}`);
  let spalte = 0;
  for (const zeichen of treffer[1]) spalte = spalte * 26 + zeichen.charCodeAt(0) - 64;
  const zeile = Number(treffer[2]);
  adresse(zeile, spalte);
  return { zeile, spalte };
}

function leseBereich(wert: string) {
  const teile = String(wert).split(':');
  if (teile.length !== 2) fehler(`kein Bereich: ${wert}`);
  const von = leseAdresse(teile[0]);
  const bis = leseAdresse(teile[1]);
  if (von.zeile > bis.zeile || von.spalte > bis.spalte) fehler(`Bereich verkehrt herum: ${wert}`);
  return { von, bis };
}

// ---------------------------------------------------------------- Datum

/**
 * Kalenderdatum JJJJ-MM-TT zur Seriennummer des Systems 1900.
 * Gerechnet wird aus den Kalenderfeldern, ohne Ortszeit. Tage vor dem
 * 01.03.1900 sind ausgeschlossen (erfundener 29.02.1900 im System 1900).
 */
export function datumZuSeriennummer(iso: string): number {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!treffer) fehler(`kein Datum JJJJ-MM-TT: ${String(iso)}`);
  const [jahr, monat, tag] = treffer.slice(1).map(Number);
  const zeit = Date.UTC(jahr, monat - 1, tag);
  const probe = new Date(zeit);
  if (probe.getUTCFullYear() !== jahr || probe.getUTCMonth() !== monat - 1 || probe.getUTCDate() !== tag) {
    fehler(`Datum gibt es nicht: ${iso}`);
  }
  const nummer = zeit / 86400000 + 25569;
  if (nummer < 61) fehler(`Datum vor dem 01.03.1900: ${iso}`);
  return nummer;
}

// ---------------------------------------------------------------- Stile

const RAHMENARTEN = ['thin', 'medium', 'thick', 'hair', 'dotted', 'dashed', 'double'];
const HORIZONTAL = ['left', 'center', 'right'];
const VERTIKAL = ['top', 'center', 'bottom']; // „mittig“ heißt im Format center
const SEITENLAGE = ['portrait', 'landscape'];

function farbe(wert: string, name: string): string {
  if (!/^[0-9A-F]{8}$/.test(String(wert))) fehler(`${name}: Farbe braucht acht Hexziffern AARRGGBB, erhalten ${String(wert)}`);
  return wert;
}

function auswahl(wert: string, erlaubt: string[], name: string): string {
  if (!erlaubt.includes(wert)) fehler(`${name}: erlaubt sind ${erlaubt.join(', ')}, erhalten ${String(wert)}`);
  return wert;
}

/** Sammelt Schriften, Füllungen, Rahmen und Zellformate und entdoppelt sie. */
function neueStilTabelle() {
  const schriften = [schriftXml({ groesse: 11 })];
  // Die Füllungen 0 (none) und 1 (gray125) sind vom Format belegt.
  const fuellungen = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const rahmen = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const zahlenformate: string[] = [];
  // Zellformat 0 ist die Vorgabe.
  const formate = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const bekannt = new Map<string, number>();

  function index(liste: string[], xml: string): number {
    const vorhanden = liste.indexOf(xml);
    return vorhanden >= 0 ? vorhanden : liste.push(xml) - 1;
  }

  function schriftXml(s: XlsxSchrift): string {
    let xml = '<font>';
    if (s.fett) xml += '<b/>';
    if (s.kursiv) xml += '<i/>';
    if (s.groesse !== undefined) xml += `<sz val="${zahl(s.groesse, 'Schriftgröße')}"/>`;
    if (s.farbe !== undefined) xml += `<color rgb="${farbe(s.farbe, 'Schrift')}"/>`;
    return `${xml}</font>`;
  }

  function rahmenXml(r: NonNullable<XlsxStil['rahmen']>): string {
    const seite = (name: string, feld: keyof typeof r) => (r[feld]
      ? `<${name} style="${auswahl(r[feld].art, RAHMENARTEN, 'Rahmenart')}"><color rgb="${farbe(r[feld].farbe, 'Rahmen')}"/></${name}>`
      : `<${name}/>`);
    // Reihenfolge nach CT_Border: left, right, top, bottom, diagonal
    return `<border>${seite('left', 'links')}${seite('right', 'rechts')}${seite('top', 'oben')}${seite('bottom', 'unten')}<diagonal/></border>`;
  }

  function zahlenformatNummer(code: string): number {
    if (code === 'General') return 0;
    let platz = zahlenformate.indexOf(code);
    if (platz < 0) platz = zahlenformate.push(code) - 1;
    return ERSTES_EIGENES_ZAHLENFORMAT + platz;
  }

  /** Liefert den Index des Zellformats zu einem Stil. Ohne Stil gilt die Vorgabe 0. */
  function stilIndex(stil?: XlsxStil): number {
    if (!stil) return 0;
    const schluessel = JSON.stringify(stil);
    const vorhanden = bekannt.get(schluessel);
    if (vorhanden !== undefined) return vorhanden;
    const nf = stil.zahlenformat !== undefined ? zahlenformatNummer(stil.zahlenformat) : 0;
    const f = stil.schrift ? index(schriften, schriftXml(stil.schrift)) : 0;
    const fl = stil.fuellung !== undefined
      ? index(fuellungen, `<fill><patternFill patternType="solid"><fgColor rgb="${farbe(stil.fuellung, 'Füllung')}"/></patternFill></fill>`)
      : 0;
    const r = stil.rahmen ? index(rahmen, rahmenXml(stil.rahmen)) : 0;
    let xml = `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${r}" xfId="0"`;
    if (nf) xml += ' applyNumberFormat="1"';
    if (f) xml += ' applyFont="1"';
    if (fl) xml += ' applyFill="1"';
    if (r) xml += ' applyBorder="1"';
    const a = stil.ausrichtung;
    if (a) {
      let ausrichtung = '';
      if (a.horizontal) ausrichtung += ` horizontal="${auswahl(a.horizontal, HORIZONTAL, 'Ausrichtung')}"`;
      if (a.vertikal) ausrichtung += ` vertical="${auswahl(a.vertikal, VERTIKAL, 'Ausrichtung')}"`;
      if (a.umbruch) ausrichtung += ' wrapText="1"';
      xml += ` applyAlignment="1"><alignment${ausrichtung}/></xf>`;
    } else {
      xml += '/>';
    }
    const nummer = index(formate, xml);
    bekannt.set(schluessel, nummer);
    return nummer;
  }

  function xml() {
    const liste = (name: string, eintraege: string[]) => `<${name} count="${eintraege.length}">${eintraege.join('')}</${name}>`;
    const nf = zahlenformate.map((code, i) => `<numFmt numFmtId="${ERSTES_EIGENES_ZAHLENFORMAT + i}" formatCode="${attr(code)}"/>`);
    // Reihenfolge nach CT_Stylesheet
    return `${XML_KOPF}<styleSheet xmlns="${NS_TABELLE}">`
      + (nf.length ? liste('numFmts', nf) : '')
      + liste('fonts', schriften)
      + liste('fills', fuellungen)
      + liste('borders', rahmen)
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + liste('cellXfs', formate)
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }

  return { stilIndex, xml };
}

// ---------------------------------------------------------------- Blatt

function pruefeBlattname(name: string): string {
  if (typeof name !== 'string' || name.length < 1 || name.length > 31) fehler('Blattname braucht 1 bis 31 Zeichen');
  if (/[\\/?*[\]:]/.test(name) || name.startsWith("'") || name.endsWith("'")) fehler(`Blattname enthält unzulässige Zeichen: ${name}`);
  if (bereinige(name) !== name) fehler('Blattname enthält Steuerzeichen');
  return name;
}

function zelleXml(zeile: number, zelle: XlsxZelle, stile: StilTabelle): string {
  const stil = stile.stilIndex(zelle.stil);
  const kopf = `<c r="${adresse(zeile, zelle.spalte)}"${stil ? ` s="${stil}"` : ''}`;
  const wert = zelle.wert;
  if (wert === undefined || wert === null || wert === '') return `${kopf}/>`;
  if (typeof wert === 'string') return `${kopf} t="inlineStr"><is>${zellText(wert)}</is></c>`;
  if (typeof wert === 'number') return `${kopf}><v>${zahl(wert, `Zelle ${adresse(zeile, zelle.spalte)}`)}</v></c>`;
  if (typeof wert === 'object' && typeof wert.datum === 'string') {
    // Datum als Seriennummer ohne Zelltyp, das Format kommt aus dem Stil.
    if (!zelle.stil || zelle.stil.zahlenformat === undefined) fehler(`Datum ohne Zahlenformat in ${adresse(zeile, zelle.spalte)}`);
    return `${kopf}><v>${datumZuSeriennummer(wert.datum)}</v></c>`;
  }
  return fehler(`Wert in ${adresse(zeile, zelle.spalte)} wird nicht unterstützt`);
}

function blattXml(blatt: XlsxBlatt, stile: StilTabelle) {
  let kleinsteSpalte = MAX_SPALTE + 1;
  let groessteSpalte = 0;
  let vorigeZeile = 0;
  const zeilenXml: string[] = [];
  for (const zeile of blatt.zeilen ?? []) {
    if (!Number.isInteger(zeile.nr) || zeile.nr <= vorigeZeile) fehler(`Zeilen müssen aufsteigend und eindeutig sein: ${zeile.nr}`);
    adresse(zeile.nr, 1);
    vorigeZeile = zeile.nr;
    let vorigeSpalte = 0;
    let zellen = '';
    for (const zelle of zeile.zellen ?? []) {
      if (!Number.isInteger(zelle.spalte) || zelle.spalte <= vorigeSpalte) fehler(`Zellen müssen je Zeile aufsteigend sein: Zeile ${zeile.nr}`);
      vorigeSpalte = zelle.spalte;
      kleinsteSpalte = Math.min(kleinsteSpalte, zelle.spalte);
      groessteSpalte = Math.max(groessteSpalte, zelle.spalte);
      zellen += zelleXml(zeile.nr, zelle, stile);
    }
    const hoehe = zeile.hoehe !== undefined ? ` ht="${zahl(zeile.hoehe, 'Zeilenhöhe')}" customHeight="1"` : '';
    zeilenXml.push(`<row r="${zeile.nr}"${hoehe}>${zellen}</row>`);
  }
  const ersteZeile = blatt.zeilen?.length ? blatt.zeilen[0].nr : 1;
  const bereich = groessteSpalte
    ? `${adresse(ersteZeile, kleinsteSpalte)}:${adresse(vorigeZeile, groessteSpalte)}`
    : 'A1';

  const seite = blatt.seite;
  const einpassen = Boolean(seite?.einpassen);
  const bezuege: string[] = [];

  // Reihenfolge nach CT_Worksheet: sheetPr, dimension, sheetViews, sheetFormatPr, cols,
  // sheetData, autoFilter, mergeCells, hyperlinks, pageMargins, pageSetup, headerFooter
  let xml = `${XML_KOPF}<worksheet xmlns="${NS_TABELLE}" xmlns:r="${NS_BEZUG}">`;
  if (einpassen) xml += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
  xml += `<dimension ref="${bereich}"/>`;

  xml += '<sheetViews><sheetView workbookViewId="0">';
  if (blatt.fixierteZeilen !== undefined && blatt.fixierteZeilen !== 0) {
    if (!Number.isInteger(blatt.fixierteZeilen) || blatt.fixierteZeilen < 1) fehler('fixierteZeilen muss eine ganze Zahl ab 1 sein');
    const darunter = adresse(blatt.fixierteZeilen + 1, 1);
    xml += `<pane ySplit="${blatt.fixierteZeilen}" topLeftCell="${darunter}" activePane="bottomLeft" state="frozen"/>`
      + `<selection pane="bottomLeft" activeCell="${darunter}" sqref="${darunter}"/>`;
  }
  xml += '</sheetView></sheetViews>';

  xml += blatt.standardZeilenhoehe !== undefined
    ? `<sheetFormatPr defaultRowHeight="${zahl(blatt.standardZeilenhoehe, 'Standardhöhe')}" customHeight="1"/>`
    : '<sheetFormatPr defaultRowHeight="15"/>';

  if ((blatt.spaltenbreiten?.length ?? 0) > MAX_SPALTE) fehler('Zu viele Spaltenbreiten');
  if (blatt.spaltenbreiten?.length) {
    xml += '<cols>';
    blatt.spaltenbreiten.forEach((breite, i) => {
      if (breite < 0 || breite > 255) fehler('Spaltenbreite außerhalb 0 bis 255');
      if (breite !== undefined && breite !== null) xml += `<col min="${i + 1}" max="${i + 1}" width="${zahl(breite, 'Spaltenbreite')}" customWidth="1"/>`;
    });
    xml += '</cols>';
  }

  xml += zeilenXml.length ? `<sheetData>${zeilenXml.join('')}</sheetData>` : '<sheetData/>';

  if (blatt.autofilter) {
    leseBereich(blatt.autofilter);
    xml += `<autoFilter ref="${blatt.autofilter}"/>`;
  }

  if (blatt.verbunden?.length) {
    blatt.verbunden.forEach(leseBereich);
    xml += `<mergeCells count="${blatt.verbunden.length}">${blatt.verbunden.map((b) => `<mergeCell ref="${b}"/>`).join('')}</mergeCells>`;
  }

  if (blatt.hyperlinks?.length) {
    xml += '<hyperlinks>';
    blatt.hyperlinks.forEach((link, i) => {
      leseAdresse(link.zelle);
      if (typeof link.ziel !== 'string' || link.ziel.length < 1 || link.ziel.length > 2079) fehler(`Ziel des Hyperlinks in ${link.zelle} braucht 1 bis 2079 Zeichen`);
      // Das Ziel steht in der Beziehungsdatei, nicht im Blatt.
      bezuege.push(`<Relationship Id="rId${i + 1}" Type="${NS_BEZUG}/hyperlink" Target="${attr(link.ziel)}" TargetMode="External"/>`);
      xml += `<hyperlink ref="${link.zelle}" r:id="rId${i + 1}"/>`;
    });
    xml += '</hyperlinks>';
  }

  if (seite) {
    const r = seite.raender;
    // Alle sechs Ränder sind Pflicht.
    xml += `<pageMargins left="${zahl(r.links, 'Rand')}" right="${zahl(r.rechts, 'Rand')}" top="${zahl(r.oben, 'Rand')}" bottom="${zahl(r.unten, 'Rand')}" header="${zahl(r.kopf, 'Rand')}" footer="${zahl(r.fuss, 'Rand')}"/>`;
    xml += `<pageSetup paperSize="${zahl(seite.papier, 'Papier')}" orientation="${auswahl(seite.ausrichtung, SEITENLAGE, 'Seitenlage')}"`;
    // fitToWidth und fitToHeight wirken nur zusammen mit pageSetUpPr fitToPage.
    if (seite.einpassen) xml += ` fitToWidth="${zahl(seite.einpassen.breite, 'Einpassen')}" fitToHeight="${zahl(seite.einpassen.hoehe, 'Einpassen')}"`;
    xml += '/>';
  }

  if (blatt.fusszeile !== undefined) {
    if (bereinige(blatt.fusszeile).length > MAX_FUSSZEILE) fehler(`Fußzeile ist länger als ${MAX_FUSSZEILE} Zeichen`);
    xml += `<headerFooter><oddFooter>${text(blatt.fusszeile)}</oddFooter></headerFooter>`;
  }

  xml += '</worksheet>';
  return { xml, bezuege };
}

/** Text für Kopf- oder Fußzeile: ein wörtliches & wird verdoppelt, weil & einen Code einleitet. */
export function fussText(wert: string): string {
  return String(wert).replace(/&/g, '&&');
}

/** Codes der Fußzeile. */
export const FUSS = Object.freeze({ LINKS: '&L', MITTE: '&C', RECHTS: '&R', SEITE: '&P', SEITEN: '&N' });

// ---------------------------------------------------------------- Mappe

function zeitpunkt(wert: string): string {
  // Der Zeitpunkt kommt von außen, als UTC mit Sekunden.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(wert))) fehler(`Zeitpunkt braucht die Form JJJJ-MM-TTThh:mm:ssZ: ${String(wert)}`);
  const probe = new Date(wert);
  if (!Number.isFinite(probe.getTime()) || probe.toISOString().replace('.000Z', 'Z') !== wert) {
    fehler(`Zeitpunkt gibt es nicht: ${wert}`);
  }
  return wert;
}

function bezuegeXml(eintraege: string[]): string {
  return `${XML_KOPF}<Relationships xmlns="${NS_PAKET_BEZUG}">${eintraege.join('')}</Relationships>`;
}

/**
 * Erzeugt alle Teile der Datei als Text, in der Reihenfolge der ZIP-Einträge.
 * @returns {Array<[string, string]>}
 */
export function erzeugeTeile(mappe: XlsxMappe): XlsxTeil[] {
  const blatt = mappe.blatt;
  const name = pruefeBlattname(blatt.name);
  const e = mappe.eigenschaften;
  const erstellt = zeitpunkt(e.erstelltAm);
  const geaendert = zeitpunkt(e.geaendertAm ?? e.erstelltAm);
  const stile = neueStilTabelle();
  const { xml: blattText, bezuege } = blattXml(blatt, stile);

  const inhaltstypen = `${XML_KOPF}<Types xmlns="${NS_INHALTSTYPEN}">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/xl/workbook.xml" ContentType="${TYP}.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYP}.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="${TYP}.spreadsheetml.styles+xml"/>`
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + `<Override PartName="/docProps/app.xml" ContentType="${TYP}.extended-properties+xml"/>`
    + '</Types>';

  const wurzelBezuege = bezuegeXml([
    `<Relationship Id="rId1" Type="${NS_BEZUG}/officeDocument" Target="xl/workbook.xml"/>`,
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    `<Relationship Id="rId3" Type="${NS_BEZUG}/extended-properties" Target="docProps/app.xml"/>`,
  ]);

  let kern = `${XML_KOPF}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"`
    + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
  if (e.ersteller) kern += `<dc:creator>${text(e.ersteller)}</dc:creator>`;
  if (e.betreff) kern += `<dc:subject>${text(e.betreff)}</dc:subject>`;
  kern += `<dcterms:created xsi:type="dcterms:W3CDTF">${erstellt}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${geaendert}</dcterms:modified></cp:coreProperties>`;

  let app = `${XML_KOPF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">`;
  if (e.firma) app += `<Company>${text(e.firma)}</Company>`;
  app += '</Properties>';

  // Reihenfolge nach CT_Workbook: workbookPr, bookViews, sheets, definedNames, calcPr
  let arbeitsmappe = `${XML_KOPF}<workbook xmlns="${NS_TABELLE}" xmlns:r="${NS_BEZUG}"><workbookPr/>`
    + `<sheets><sheet name="${attr(name)}" sheetId="1" r:id="rId1"/></sheets>`;
  arbeitsmappe += '</workbook>';

  const mappenBezuege = bezuegeXml([
    `<Relationship Id="rId1" Type="${NS_BEZUG}/worksheet" Target="worksheets/sheet1.xml"/>`,
    `<Relationship Id="rId2" Type="${NS_BEZUG}/styles" Target="styles.xml"/>`,
  ]);

  const teile: XlsxTeil[] = [
    ['[Content_Types].xml', inhaltstypen],
    ['_rels/.rels', wurzelBezuege],
    ['docProps/core.xml', kern],
    ['docProps/app.xml', app],
    ['xl/workbook.xml', arbeitsmappe],
    ['xl/_rels/workbook.xml.rels', mappenBezuege],
    ['xl/styles.xml', stile.xml()],
    ['xl/worksheets/sheet1.xml', blattText],
  ];
  if (bezuege.length) teile.push(['xl/worksheets/_rels/sheet1.xml.rels', bezuegeXml(bezuege)]);
  return teile;
}

/** Zeitstempel der ZIP-Einträge aus Feldern der Ortszeit, damit er in jeder Zeitzone gleich gelesen wird. */
function zipZeit() {
  const zeit = new Date(...ZIP_ZEIT);
  const gelesen = [zeit.getFullYear(), zeit.getMonth(), zeit.getDate(), zeit.getHours(), zeit.getMinutes(), zeit.getSeconds()];
  if (gelesen.join() !== ZIP_ZEIT.join()) fehler('fester Zeitstempel lässt sich in dieser Zeitzone nicht bilden');
  return zeit;
}

/**
 * Packt Teile zu einer Datei. Feste Reihenfolge, fester Zeitstempel, feste Stufe.
 * Die Kompression wird synchron ausgeführt.
 */
export function packeTeile(teile: XlsxTeil[]): Uint8Array<ArrayBuffer> {
  const kodierer = new TextEncoder();
  const eintraege: Record<string, Uint8Array> = {};
  for (const [name, inhalt] of teile) eintraege[name] = kodierer.encode(inhalt);
  return new Uint8Array(zipSync(eintraege, { level: ZIP_STUFE, mtime: zipZeit() }));
}

/**
 * Schreibt eine Arbeitsmappe mit einem Blatt.
 * @returns {Uint8Array} Inhalt der XLSX-Datei
 */
export function schreibeXlsx(mappe: XlsxMappe): Uint8Array<ArrayBuffer> {
  return packeTeile(erzeugeTeile(mappe));
}
