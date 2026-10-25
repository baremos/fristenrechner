import { expect, it } from 'vitest';
import { parse, type AnyNode, type Declaration } from 'postcss';

// Die App verlangt mindestens Chromium 83; neuere Laufzeitfunktionen dürfen nicht in die Quellen gelangen.
const neuereFunktionen = /\b(?:replaceChildren|findLast|findLastIndex|replaceAll|hasOwn|structuredClone)\b|\.\s*at\s*\(/;
const quellen = import.meta.glob<string>('../src/**/*', { eager: true, query: '?raw', import: 'default' });

type Stilregel = { selektor: string; kontext: string; deklarationen: Declaration[] };

function stilregeln(css: string): Stilregel[] {
  const regeln: Stilregel[] = [];
  parse(css).walkRules(regel => {
    const kontexte: string[] = [];
    for (let eltern: AnyNode | undefined = regel.parent; eltern; eltern = eltern.parent) {
      if (eltern.type === 'atrule') kontexte.unshift(`@${eltern.name} ${eltern.params}`);
    }
    const deklarationen = regel.nodes.filter((knoten): knoten is Declaration => knoten.type === 'decl');
    for (const selektor of regel.selectors) regeln.push({ selektor, kontext: kontexte.join(' / '), deklarationen });
  });
  return regeln;
}

// Gleiche Selektoren über Media-Kontexte und Opt-ins am Rechner abgleichen.
// Das ist eine vorsichtige Quellprüfung, keine vollständige Browserkaskade:
// Unbekannte Abstände ohne belegte Grid-Darstellung müssen geprüft werden.
function nichtAlsGridBelegteAbstaende(css: string): string[] {
  const regeln = stilregeln(css);
  const basis = (selektor: string): string => selektor.replace(/\.fristenrechner(?:\[data-[^\]]+\])+/g, '.fristenrechner');
  return regeln.flatMap(regel => {
    const darstellungen = regeln
      .filter(kandidat => basis(kandidat.selektor) === basis(regel.selektor))
      .flatMap(kandidat => kandidat.deklarationen.filter(wert => wert.prop === 'display').map(wert => wert.value));
    const istGrid = darstellungen.some(wert => /^(?:inline-)?grid$/.test(wert))
      && !darstellungen.some(wert => /^(?:inline-)?flex$/.test(wert));
    if (istGrid) return [];
    return regel.deklarationen
      .filter(wert => /^(?:grid-)?(?:(?:row|column)-)?gap$/.test(wert.prop))
      .map(wert => JSON.stringify([regel.kontext, regel.selektor, wert.prop, wert.value]));
  });
}

it('führt keine neuen Abstände ohne belegte Grid-Darstellung ein', () => {
  // Unveränderter Flex-gap-Altbestand von doku-arbeitsdateien, deklarationsgenau.
  // Neue Regeln dürfen diese Ausnahmen nicht durch andere Selektoren oder Werte erweitern.
  const altbestand = [
    ['', '.fristenrechner .form-header', 'gap', '1rem'],
    ['', '.fristenrechner .results-header', 'gap', '1rem'],
    ['', '.fristenrechner .section-heading-row', 'gap', '1rem'],
    ['', '.fristenrechner .check-card', 'gap', '0.65rem'],
    ['', '.fristenrechner .form-actions', 'gap', '0.65rem'],
    ['', '.fristenrechner .print-footer', 'gap', '1rem'],
    ['@media print', '.fristenrechner .print-page-header', 'gap', '1.2cm'],
  ].map(wert => `../src/Fristenrechner.astro:${JSON.stringify(wert)}`);
  const gefunden = Object.entries(quellen).flatMap(([pfad, quelle]) => {
    if (!/\.(?:astro|css)$/.test(pfad)) return [];
    const css = pfad.endsWith('.css') ? quelle : [...quelle.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(treffer => treffer[1]).join('\n');
    return nichtAlsGridBelegteAbstaende(css).map(wert => `${pfad}:${wert}`);
  });
  expect(gefunden.filter(wert => !altbestand.includes(wert))).toEqual([]);
});

it.each([
  '.neu { display: flex; gap: 1rem; }',
  '.neu { display: inline-flex; column-gap: 1rem; }',
  '.neu { display: flex; } @media screen { .neu { row-gap: 1rem; } }',
  '.fristenrechner .neu { display: flex; } @media screen { .fristenrechner[data-ansicht="kompakt"] .neu { gap: 1rem; } }',
  '.neu { display: grid; gap: 1rem; } @media screen { .neu { display: flex; } }',
  '.neu { gap: 1rem; }',
])('erkennt unbelegte Abstände auch bei verteilten Deklarationen: %s', css => {
  expect(nichtAlsGridBelegteAbstaende(css)).toHaveLength(1);
});

it.each([
  '.neu { display: grid; gap: 1rem; }',
  '.neu { display: inline-grid; row-gap: 1rem; }',
  '.neu { display: grid; } @media screen { .neu { column-gap: 1rem; } }',
  '.fristenrechner .neu { display: grid; } @media screen { .fristenrechner[data-ansicht="kompakt"] .neu { gap: 1rem; } }',
])('erlaubt die von Chromium 83 unterstützten Grid-Abstände: %s', css => {
  expect(nichtAlsGridBelegteAbstaende(css)).toEqual([]);
});

it('verwendet in keiner Quelle eine der ausgeschlossenen Laufzeitfunktionen', () => {
  const dateien = Object.entries(quellen);
  expect(dateien.length).toBeGreaterThan(0);
  const treffer = dateien
    .filter(([, quelle]) => neuereFunktionen.test(quelle))
    .map(([pfad]) => pfad);
  expect(treffer).toEqual([]);
});

it.each([
  'el.replaceChildren(knoten)',
  'werte.at(0)',
  'werte.at(-1)',
  'werte. at (0)',
  'werte.\nat\n(0)',
  'werte.findLast(pruefen)',
  'werte.findLastIndex(pruefen)',
  'text.replaceAll("a", "b")',
  'Object.hasOwn(objekt, "name")',
  'structuredClone(objekt)',
])('Gegenprobe erkennt %s', quelle => {
  expect(neuereFunktionen.test(quelle)).toBe(true);
});

it.each([
  { werte: [], erstes: undefined, letztes: undefined },
  { werte: ['eins'], erstes: 'eins', letztes: 'eins' },
  { werte: ['eins', 'zwei'], erstes: 'eins', letztes: 'zwei' },
])('Indexzugriff liefert für $werte die bisherigen Randwerte', ({ werte, erstes, letztes }) => {
  expect(werte[0]).toBe(erstes);
  expect(werte[werte.length - 1]).toBe(letztes);
});
