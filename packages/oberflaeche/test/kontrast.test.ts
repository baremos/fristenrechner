import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const komponente = readFileSync(new URL('../src/Fristenrechner.astro', import.meta.url), 'utf8');
const bedienlogik = readFileSync(new URL('../src/fristenrechner-ui.ts', import.meta.url), 'utf8');
type RGB = [number, number, number];
type Farbpaar = { selector: string; vordergrund: RGB; hintergrund: RGB; schwelle: number };

function deklaration(css: string, selector: string, eigenschaft: string): string {
  const werte: string[] = [];
  for (const [, selektoren, inhalt] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selektoren.split(',').some(wert => wert.trim() === selector)) continue;
    for (const [, name, wert] of inhalt.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
      if (name === eigenschaft) werte.push(wert.trim());
    }
  }
  if (werte.length !== 1) throw new Error(`Keine eindeutige CSS-Deklaration: ${selector} / ${eigenschaft}`);
  return werte[0];
}

function rgb(wert: string): RGB {
  // Nur Vorgabefarben; abweichende Gastgeberwerte brauchen eine Browsermessung.
  const farbe = /^var\(--[\w-]+,\s*(#[\da-f]{3}(?:[\da-f]{3})?)\)$/i.exec(wert)?.[1] ?? wert;
  if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(farbe)) throw new Error(`Unbekannte Farbe: ${wert}`);
  const hex = farbe.length === 4 ? [...farbe.slice(1)].map(zeichen => zeichen + zeichen).join('') : farbe.slice(1);
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB;
}

function rand(wert: string): RGB {
  const farbe = /^\d+px solid (.+)$/.exec(wert)?.[1];
  if (!farbe) throw new Error(`Unbekannter Rahmen: ${wert}`);
  return rgb(farbe);
}

function kontrast(a: RGB, b: RGB): number {
  const luminanz = (farbe: RGB) => farbe.map(kanal => {
    const srgb = kanal / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }).reduce((summe, kanal, index) => summe + kanal * [0.2126, 0.7152, 0.0722][index], 0);
  const helligkeitA = luminanz(a);
  const helligkeitB = luminanz(b);
  return (Math.max(helligkeitA, helligkeitB) + 0.05) / (Math.min(helligkeitA, helligkeitB) + 0.05);
}

function phasenfarben(quelle: string, name: string): Record<string, string> {
  const inhalt = new RegExp(`const ${name}:[^=]+=[ \\t]*\\{([\\s\\S]*?)\\};`).exec(quelle)?.[1];
  if (!inhalt) throw new Error(`Phasenfarben fehlen: ${name}`);
  return Object.fromEntries([...inhalt.matchAll(/(\w+): '(#[\da-f]{6})'/gi)].map(([, phase, farbe]) => [phase, farbe]));
}

// Geschlossenes Inventar der 40 Feldselektoren und ihrer äußeren Hintergründe.
const felder = [
  'kunde', 'projektname', 'vergabenummer', 'vergabeordnung', 'verfahrensart', 'bundesland',
  'bekanntmachung', 'angebotsaufforderungTermin', 'abgabeUhrzeit', 'versandBieterinformation',
  'teststellungDauerAT', 'teststellungStart', 'teststellungAuswertungAT',
  'praesentationDauerAT', 'praesentationStart',
  'verhandlungRunde1DauerAT', 'verhandlungRunde1Start', 'verhandlungRunde2DauerAT', 'verhandlungRunde2Start',
  'teilnahmeBewertungAT', 'aufforderungVersandAT', 'zwischenbewertungAT', 'einladungVersandAT',
  'vuAnpassungRunde1AT', 'vuAnpassungRunde2AT', 'bewertungAT', 'aufklaerungEntscheidungAT',
  'internerZuschlagAT', 'infoVersandAT', 'bindefristArt', 'bindefristTermin', 'bindefristTage',
  'teilnahmefristKT', 'bewerberfragenVorTeilnahmeKT', 'angebotsfristKT', 'bieterfragenVorAngebotKT',
  'klarstellungVorAngebotKT', 'optimiertesAngebotKT', 'finalesAngebotKT', 'wartefristKT',
];
const bedingteFelder = new Set([
  'teststellungDauerAT', 'teststellungStart', 'teststellungAuswertungAT',
  'praesentationDauerAT', 'praesentationStart',
  'verhandlungRunde1DauerAT', 'verhandlungRunde1Start', 'verhandlungRunde2DauerAT', 'verhandlungRunde2Start',
]);
const phasen = ['einholung', 'teilnahmewettbewerb', 'verhandlung', 'bewertung', 'teststellung', 'zuschlag'];

function farbpaare(css: string, ui: string): Farbpaar[] {
  const lesen = (selector: string, eigenschaft: string) => deklaration(css, `.fristenrechner ${selector}`, eigenschaft);
  const weiss = rgb(lesen('form', 'background'));
  const panel = rgb(lesen('.conditional-panel', 'background'));
  const feldrahmen = rand(lesen('input', 'border'));
  const knopfrahmen = rand(lesen('.button', 'border'));
  const knopfhintergrund = rgb(lesen('.button', 'background'));
  const hover = rgb(lesen('.button:hover', 'border-color'));
  const fokus = rand(lesen('input:focus-visible', 'outline'));
  const phasenFarben = phasenfarben(ui, 'phaseColors');
  const textFarben = { ...phasenFarben, ...phasenfarben(ui, 'phaseOrderColors') };
  const mischung = /^color-mix\(in srgb, var\(--phase-color, (#[\da-f]{6})\) (\d+(?:\.\d+)?)%, white\)$/.exec(lesen('.timeline-phase > header', 'background'));
  if (!mischung || Number(mischung[2]) > 100) throw new Error('Unbekannter Phasenkartenhintergrund');
  const anteil = Number(mischung[2]) / 100;
  const paar = (selector: string, vordergrund: RGB, hintergrund: RGB, schwelle: number): Farbpaar => ({ selector, vordergrund, hintergrund, schwelle });

  return [
    ...felder.map(name => paar(`[name="${name}"]`, feldrahmen, bedingteFelder.has(name) ? panel : weiss, 3.2)),
    ...['#save-json', '#open-json', '#export-excel', '#export-pdf'].flatMap(selector => [
      paar(selector, knopfrahmen, weiss, 3.2),
      paar(`${selector}:hover (Rahmen)`, hover, weiss, 3.2),
      paar(`${selector}:hover (Text)`, rgb(lesen('.button:hover', 'color')), knopfhintergrund, 4.7),
    ]),
    ...phasen.map(phase => paar(`span.timeline-phase-order (${phase})`, rgb(textFarben[phase]),
      rgb(phasenFarben[phase]).map(kanal => kanal * anteil + 255 * (1 - anteil)) as RGB, 4.7)),
    paar('div.table-scroll (außen)', rand(lesen('.table-scroll', 'border')), rgb(lesen('.results', 'background')), 3.2),
    paar('div.table-scroll (Kopfzellen)', rand(lesen('.table-scroll', 'border')), rgb(lesen('th', 'background')), 3.2),
    paar('input:focus-visible (weiß)', fokus, weiss, 3.2),
    paar('input:focus-visible (bedingte Karte)', fokus, panel, 3.2),
    paar('.file-button:focus-within', rand(lesen('.file-button:focus-within', 'outline')), weiss, 3.2),
    paar('.notice-warning (Kante)', rand(lesen('.notice-warning', 'border-left')), rgb(lesen('.notice-warning', 'background')), 3.2),
    paar('.notice-error (Kante)', rand(lesen('.notice-error', 'border-left')), rgb(lesen('.notice-error', 'background')), 3.2),
    paar('.milestone-warning (Text)', rgb(lesen('.milestone-warning', 'color')), weiss, 4.7),
    paar('.project-file-meta--migration (Text)', rgb(lesen('.project-file-meta--migration', 'color')), rgb(lesen('.project-file-meta--migration', 'background')), 4.7),
  ];
}

function pruefen(paar: Farbpaar): void {
  const verhaeltnis = kontrast(paar.vordergrund, paar.hintergrund);
  if (verhaeltnis < paar.schwelle) throw new Error(`${paar.selector}: ${verhaeltnis.toFixed(5)}:1 < ${paar.schwelle}:1`);
}

it.each(farbpaare(komponente, bedienlogik))('$selector erreicht mindestens $schwelle:1', pruefen);

it('bindet die geprüften Farben ausschließlich an die kleine Phasenbeschriftung', () => {
  expect(bedienlogik).toContain("const order = makeTextElement('span', `Phase ${index + 1}`, 'timeline-phase-order');");
  expect(bedienlogik).toContain('order.style.color = phaseOrderColors[phase.id];');
  expect(bedienlogik).toMatch(/header\.append\(\s*order,/);
  expect(bedienlogik).toContain("item.style.setProperty('--phase-color', phaseColors[phase.id]);");
  expect(bedienlogik).toMatch(/const phaseOrderColors:[^=]+=\s*\{\s*\.\.\.phaseColors,/);
  expect(Object.keys(phasenfarben(bedienlogik, 'phaseColors'))).toEqual(phasen);
  expect(felder).toHaveLength(40);
  for (const name of felder) expect(komponente).toContain(`name="${name}"`);
  expect(deklaration(komponente, '.fristenrechner input', 'border')).toBe(deklaration(komponente, '.fristenrechner select', 'border'));
  expect(deklaration(komponente, '.fristenrechner input:focus-visible', 'outline')).toBe('3px solid var(--color-accent, #a7303c)');
});

it.each([
  { name: 'Feldrahmen', von: '#8a8a8e', alt: '#99999d', anzahl: 40, selector: '[name="kunde"]' },
  { name: 'Dateiknöpfe', von: '#8f8f93', alt: '#96969a', anzahl: 4, selector: '#save-json' },
  { name: 'Phasenbeschriftung', von: '#9a5f1f', alt: '#a56721', anzahl: 1, selector: 'span.timeline-phase-order (teststellung)' },
  { name: 'Tabellenrahmen', von: '#878783', alt: '#d7d7d3', anzahl: 2, selector: 'div.table-scroll (außen)' },
])('Gegenprobe: alte Farbe für $name scheitert', ({ von, alt, anzahl, selector }) => {
  const paare = farbpaare(komponente.replace(von, alt), bedienlogik.replace(von, alt));
  expect(paare.filter(paar => kontrast(paar.vordergrund, paar.hintergrund) < paar.schwelle)).toHaveLength(anzahl);
  expect(() => paare.forEach(pruefen)).toThrow(selector);
});

it.each([
  { a: '#000000', b: '#ffffff', wert: 21 },
  { a: '#ffffff', b: '#ffffff', wert: 1 },
  { a: '#99999d', b: '#f7f7f6', wert: 2.64806469 },
])('berechnet WCAG-Kontrast für $a auf $b', ({ a, b, wert }) => {
  expect(kontrast(rgb(a), rgb(b))).toBeCloseTo(wert, 6);
});
