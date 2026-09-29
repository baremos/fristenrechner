import { expect, it } from 'vitest';

// Die App verlangt mindestens Chromium 83; neuere Laufzeitfunktionen dürfen nicht in die Quellen gelangen.
const neuereFunktionen = /\b(?:replaceChildren|findLast|findLastIndex|replaceAll|hasOwn|structuredClone)\b|\.\s*at\s*\(/;
const quellen = import.meta.glob<string>('../src/**/*', { eager: true, query: '?raw', import: 'default' });

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
