// Reine Entscheidungsregeln. Unvollständige Messungen sind keine Produktbefunde.
import { Messfehler } from './fehler.mjs';

export class Abweichung extends Error {
  constructor(meldung, befund) { super(meldung); this.name = 'Abweichung'; this.befund = befund; }
}
export function bestaetige(bedingung, meldung) {
  if (!bedingung) throw new Messfehler(meldung);
}
export function verlange(bedingung, meldung, befund) {
  if (!bedingung) throw new Abweichung(meldung, befund);
}
export const KONTRAST = Object.freeze({ text: 4.5, gross: 3, bedienelement: 3, fokus: 3 });
// WCAG 2.x: 18 pt = 24 CSS-px; fett ab 14 pt = 56/3 CSS-px (700).
export function textSchwelle(groesse, gewicht) {
  bestaetige(Number.isFinite(groesse) && groesse > 0 && Number.isFinite(gewicht) && gewicht >= 1, 'Textgröße oder Schriftgewicht nicht bestimmbar.');
  return groesse >= 24 || (groesse >= 56 / 3 && gewicht >= 700) ? KONTRAST.gross : KONTRAST.text;
}
export function farbe(css) {
  // CSSOM kann color(srgb ...) liefern, insbesondere bei color-mix(). Andere
  // Farbräume werden ausdrücklich nicht geraten oder still geklemmt.
  const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(css ?? '');
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(css ?? '');
  bestaetige(rgb || srgb, `Nicht unterstützte berechnete Farbe: ${css}`);
  const m = rgb ?? srgb, faktor = rgb ? 255 : 1;
  const c = [Number(m[1]) / faktor, Number(m[2]) / faktor, Number(m[3]) / faktor, m[4] === undefined ? 1 : Number(m[4])];
  bestaetige(c.every(v => Number.isFinite(v) && v >= 0 && v <= 1), `Farbe außerhalb sRGB: ${css}`);
  return c;
}
export function schichten(vorne, hinten) {
  bestaetige([vorne, hinten].every(c => Array.isArray(c) && c.length === 4 && c.every(v => Number.isFinite(v) && v >= 0 && v <= 1)), 'Ungültige Farbschicht.');
  const a = vorne[3] + hinten[3] * (1 - vorne[3]);
  return a === 0 ? [0, 0, 0, 0] : [...vorne.slice(0, 3).map((v, i) => (v * vorne[3] + hinten[i] * hinten[3] * (1 - vorne[3])) / a), a];
}
function luminanz(c) {
  const linear = c.slice(0, 3).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function kontrast(vorne, hinten) {
  bestaetige(hinten?.[3] === 1, 'Hintergrund ist nicht deckend bestimmt.');
  const a = luminanz(schichten(vorne, hinten)), b = luminanz(hinten);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// Kette vom Element bis html. Gruppendeckkraft wird von innen nach außen
// zusammengesetzt, auch ein durchscheinender Elternhintergrund wird erfasst.
export function farbpaar(kette, vordergrund) {
  bestaetige(Array.isArray(kette) && kette.length > 0, 'Hintergrundschichtung fehlt.');
  let pixel = farbe(vordergrund), grund = [0, 0, 0, 0];
  for (const s of kette) {
    bestaetige((s.bild === 'none' || (pixel[3] === 1 && grund[3] === 1)) && s.filter === 'none' && s.mischung === 'normal' && s.schatten === 'none',
      `Hintergrund oder Textwirkung nicht eindeutig: ${s.selector} (Bild, Filter, Mischung oder Textschatten).`);
    bestaetige(Number.isFinite(s.deckkraft) && s.deckkraft >= 0 && s.deckkraft <= 1, 'Deckkraft nicht bestimmbar.');
    const bg = farbe(s.farbe);
    pixel = schichten(pixel, bg); grund = schichten(grund, bg);
    pixel[3] *= s.deckkraft; grund[3] *= s.deckkraft;
  }
  // Im eigenen Standardsmodus-Dokument ist der leere Browser-Canvas weiß.
  return [schichten(pixel, [1, 1, 1, 1]), schichten(grund, [1, 1, 1, 1])];
}
export function pruefeLayout(m) {
  bestaetige(m && Number.isFinite(m.clientWidth) && m.clientWidth > 0 && Number.isFinite(m.scrollWidth)
    && Array.isArray(m.elemente) && m.elemente.length > 0, 'Layoutmessung fehlt oder hat Breite 0.');
  const befunde = [];
  for (const e of m.elemente) {
    bestaetige(!e.unbestimmt,`Visuelle Zuordnung für Layout fehlt: ${e.selector}`);
    bestaetige([e.links, e.rechts, e.breite, e.hoehe, e.innenBreite, e.innenHoehe, e.inhaltBreite, e.inhaltHoehe].every(Number.isFinite)
      && e.breite >= 0 && e.hoehe > 0, `Ungültiges Elementrechteck: ${e.selector}`);
    // Ein br erzeugt einen Zeilenwechsel, aber keine eigene horizontale Fläche.
    // Seine Textnachbarn und der umgebende Inhalt bleiben im Inventar pflichtig.
    if(e.tag==='BR'&&e.breite===0&&e.innenBreite===0&&e.inhaltBreite===0&&!e.textAbgeschnitten)continue;
    bestaetige(e.breite>0,`Ungültiges Elementrechteck: ${e.selector}`);
    // Ausschließlich echte Nachfahren der Datentabelle sind ausgenommen.
    if (e.tabellenInnenraum) continue;
    if (e.links < -1 || e.rechts > m.clientWidth + 1) befunde.push({ art: 'überragend', ...e });
    // Texteingabefelder rollen ihren Inhalt nativ. Ihre Außenfläche bleibt
    // vollständig pflichtig; Knöpfe/Labels/sonstiger Text sind nicht ausgenommen.
    if (!e.texteingabe && ((!e.datentabelle||!e.horizontalRollbar)&&e.inhaltBreite > e.innenBreite + 1 || e.inhaltHoehe > e.innenHoehe + 1)) befunde.push({ art: 'abgeschnitten', ...e });
    if (e.textAbgeschnitten) befunde.push({ art: 'Text außerhalb der Fläche', ...e });
    if (e.horizontalRollbar && !e.datentabelle && !e.texteingabe) befunde.push({ art: 'unzulässiger Rollbereich', ...e });
  }
  if (m.scrollWidth > m.clientWidth + 1) befunde.push({ art: 'Seitenüberlauf', clientWidth: m.clientWidth, scrollWidth: m.scrollWidth });
  verlange(!befunde.length, `${befunde.length} Layoutabweichungen.`, befunde);
  return { elemente: m.elemente.length, befunde };
}
export function pruefeReihenfolge(erwartet, vorwaerts, rueckwaerts) {
  bestaetige(Array.isArray(erwartet) && erwartet.length > 0 && new Set(erwartet).size === erwartet.length
    && Array.isArray(vorwaerts) && Array.isArray(rueckwaerts), 'Fokusinventar oder Messfolge fehlt.');
  verlange(JSON.stringify(vorwaerts) === JSON.stringify(erwartet) && JSON.stringify(rueckwaerts) === JSON.stringify([...erwartet].reverse()),
    'Tab-Reihenfolge weicht von der sichtbaren Dokumentreihenfolge ab oder enthält eine Falle.', { erwartet, vorwaerts, rueckwaerts });
}
export function pruefeEmulation(ist, soll) {
  bestaetige(ist && soll && Object.keys(soll).length > 0, 'Emulationsbestätigung fehlt.');
  for (const [k, v] of Object.entries(soll)) bestaetige(typeof v === 'number' ? Number.isFinite(ist[k]) && Math.abs(ist[k] - v) < 0.02 : ist[k] === v,
    `Emulation nicht bestätigt: ${k}, erwartet ${v}, gemessen ${ist[k]}`);
  return ist;
}
