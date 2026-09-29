import { expect, it } from 'vitest';
import quelle from '../src/xlsx-schreiber.ts?raw';
import { adresse, datumZuSeriennummer, erzeugeTeile, fussText, schreibeXlsx, spaltenName, type XlsxMappe, type XlsxBlatt, type XlsxWert, type XlsxStil } from '../src/xlsx-schreiber';
import { leseArchiv } from './struktur.mjs';

const zeit = '2026-09-29T10:00:00Z';
function mappe(blatt: Partial<XlsxBlatt> = {}): XlsxMappe {
  return { eigenschaften: { erstelltAm: zeit }, blatt: { name: 'Blatt', zeilen: [], ...blatt } };
}
function mitWert(wert: XlsxWert, stil?: XlsxStil): XlsxMappe {
  return mappe({ zeilen: [{ nr: 1, zellen: [{ spalte: 1, wert, stil }] }] });
}
const teil = (m: XlsxMappe, name = 'xl/worksheets/sheet1.xml') => new Map(erzeugeTeile(m)).get(name)!;

it.each([['1900-03-01', 61], ['1970-01-01', 25569], ['2000-01-01', 36526], ['2024-02-29', 45351], ['2026-10-01', 46296], ['9999-12-31', 2958465]])('Seriennummer für %s', (tag, nummer) => expect(datumZuSeriennummer(tag)).toBe(nummer));
it.each(['2026-02-30', '2026-13-01', '1900-02-28', '2026-1-1', '', '2026-10-01T00:00:00Z'])('Ungültiges Kalenderdatum %s abweisen', tag => expect(() => datumZuSeriennummer(tag)).toThrow());
it('Sommerzeitwechsel verändern keine Kalenderdifferenz', () => {
  expect(datumZuSeriennummer('2026-03-30') - datumZuSeriennummer('2026-03-29')).toBe(1);
  expect(datumZuSeriennummer('2026-10-26') - datumZuSeriennummer('2026-10-25')).toBe(1);
});
it('Spalten und Zeilen haben die Grenzen des Dateiformats', () => {
  expect([1, 26, 27, 16384].map(spaltenName)).toEqual(['A', 'Z', 'AA', 'XFD']);
  expect(adresse(1048576, 16384)).toBe('XFD1048576');
  for (const n of [0, -1, 1.5, 16385]) expect(() => spaltenName(n)).toThrow();
  for (const n of [0, -1, 1.5, 1048577]) expect(() => adresse(n, 1)).toThrow();
  expect(() => erzeugeTeile(mappe({ zeilen: [{ nr: 1048577, zellen: [] }] }))).toThrow();
});
it('Text wird als Text maskiert, auch bei Formelzeichen', () => {
  const xml = teil(mitWert('=1+1 & <Test> "ü" 😀 _x000D_'));
  expect(xml).toContain('<t>=1+1 &amp; &lt;Test&gt; "ü" 😀 _x005F_x000D_</t>');
  expect(xml).not.toContain('<f>');
});
it('Leerraum bleibt erhalten, ungültige XML-Zeichen entfallen', () => {
  expect(teil(mitWert(' vorn\r\nhinten \t'))).toContain('<t xml:space="preserve"> vorn\nhinten \t</t>');
  expect(teil(mitWert('a\u0000b\uD800c'))).toContain('<t>abc</t>');
  expect(teil(mitWert('x'.repeat(32767)))).toContain('x'.repeat(32767));
  expect(() => teil(mitWert('x'.repeat(32768)))).toThrow(/32767/);
});
it('Leere Zelle hat keinen leeren Inline-Text', () => {
  for (const v of ['', null, undefined]) expect(teil(mitWert(v))).toContain('<c r="A1"/>');
});
it('Nur endliche Zahlen oder Kalenderdaten mit Zahlenformat', () => {
  expect(teil(mitWert(0))).toContain('<v>0</v>');
  expect(teil(mitWert(-0.5))).toContain('<v>-0.5</v>');
  for (const v of [NaN, Infinity, -Infinity]) expect(() => teil(mitWert(v))).toThrow();
  expect(() => teil(mitWert({ datum: '2026-10-01' }))).toThrow(/Zahlenformat/);
  expect(teil(mitWert({ datum: '2026-10-01' }, { zahlenformat: 'dd.mm.yyyy' }))).toContain('<v>46296</v>');
  for (const v of [true, new Date(0), [], { text: 'x' }]) expect(() => teil(mitWert(v as unknown as XlsxWert))).toThrow();
});
it('Gleiche Stile erhalten dieselbe Kennung', () => {
  const stil: XlsxStil = { schrift: { fett: true, kursiv: true, farbe: 'FF000000' }, fuellung: 'FFA7303C', ausrichtung: { vertikal: 'top', umbruch: true } };
  const m = mappe({ zeilen: [{ nr: 1, zellen: [{ spalte: 1, wert: 'a', stil }, { spalte: 2, wert: 'b', stil: structuredClone(stil) }] }] });
  expect(teil(m)).toContain('<c r="A1" s="1"');
  expect(teil(m)).toContain('<c r="B1" s="1"');
  expect(teil(m, 'xl/styles.xml')).toContain('<fills count="3">');
  expect(teil(m, 'xl/styles.xml')).toContain('<cellXfs count="2">');
});
it('Ungültige Stile und Blattnamen werden abgewiesen', () => {
  for (const stil of [{ fuellung: 'rot' }, { schrift: { groesse: NaN } }, { ausrichtung: { vertikal: 'middle' } }]) {
    expect(() => teil(mitWert('x', stil as XlsxStil))).toThrow();
  }
  for (const name of ['', 'x'.repeat(32), 'a/b', 'a\\b', "'Plan", 'Plan\u0001']) expect(() => erzeugeTeile(mappe({ name }))).toThrow();
});
it('Zeilen und Zellen müssen aufsteigen, Bereiche müssen gültig sein', () => {
  expect(() => erzeugeTeile(mappe({ zeilen: [{ nr: 2, zellen: [] }, { nr: 1, zellen: [] }] }))).toThrow();
  expect(() => erzeugeTeile(mappe({ zeilen: [{ nr: 1, zellen: [{ spalte: 2 }, { spalte: 1 }] }] }))).toThrow();
  for (const bereich of ['A1', 'B2:A1', 'A0:B1']) expect(() => erzeugeTeile(mappe({ verbunden: [bereich] }))).toThrow();
  expect(() => erzeugeTeile(mappe({ fixierteZeilen: -1 }))).toThrow();
  expect(() => erzeugeTeile(mappe({ spaltenbreiten: [256] }))).toThrow();
});
it('Hyperlinks stehen nur in der Beziehungsdatei', () => {
  const m = mappe({ hyperlinks: [{ zelle: 'A1', ziel: 'https://example.org/?a=1&b="2"' }] });
  expect(teil(m)).toContain('<hyperlink ref="A1" r:id="rId1"/>');
  expect(teil(m, 'xl/worksheets/_rels/sheet1.xml.rels')).toContain('Target="https://example.org/?a=1&amp;b=&quot;2&quot;" TargetMode="External"');
  expect(() => erzeugeTeile(mappe({ hyperlinks: [{ zelle: 'A1', ziel: 'x'.repeat(2080) }] }))).toThrow();
});
it('Fußzeile trennt wörtliche Zeichen von Seitenzahlcodes', () => {
  expect(fussText('A & B')).toBe('A && B');
  expect(teil(mappe({ fusszeile: '&LA && B&RSeite &P von &N' }))).toContain('&amp;LA &amp;&amp; B&amp;RSeite &amp;P von &amp;N');
  expect(() => teil(mappe({ fusszeile: 'x'.repeat(256) }))).toThrow();
});
it.each(['', '2026-09-29', '2026-02-30T10:00:00Z', '2026-09-29T25:00:00Z', '2026-09-29T10:00:00.000Z'])('Zeitpunkt %s wird abgewiesen', wert => {
  const m = mappe(); m.eigenschaften.erstelltAm = wert;
  expect(() => erzeugeTeile(m)).toThrow(/Zeitpunkt/);
});
it('Schlanke Eigenschaften und feste ZIP-Einträge', () => {
  const m = mitWert('Beispiel');
  const a = schreibeXlsx(m);
  const summe = (b: Uint8Array) => Array.from(b);
  expect(summe(a)).toEqual(summe(schreibeXlsx(m)));
  expect(summe(a)).not.toEqual(summe(schreibeXlsx(mitWert('Anders'))));
  const teile = leseArchiv(a);
  expect([...teile.entries()]).toEqual(erzeugeTeile(m));
  expect([...teile.keys()]).toHaveLength(8);
  const xml = [...teile.values()].join('');
  expect(xml).not.toMatch(/<definedNames|<Application|<cp:lastModifiedBy|<name |<family |theme/);
});
it('Schreiber hat genau einen Import und keine veränderliche Zeitquelle', () => {
  expect(quelle.match(/^import .+$/gm)).toEqual(["import { zipSync } from 'fflate';"]);
  expect(quelle).not.toMatch(/Date\.now|new Date\(\s*\)|Math\.random|\bIntl\b|toLocale|\bprocess\.|\bnavigator\b/);
});
