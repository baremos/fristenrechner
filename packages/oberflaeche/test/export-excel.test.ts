import { expect, it } from 'vitest';
import { calculateSchedule, REGELVERSION, RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';
import { beschreibeMappe, createScheduleExcel } from '../src/fristenrechner-export-excel';
import { datumZuSeriennummer } from '../src/xlsx-schreiber';
import { beispiel, eingabe, ergebnis, ZEITPUNKT, KALENDERTAG } from './beispiel';
import { leseArchiv, pruefeTerminplanTeile } from './struktur.mjs';

const exportieren = () => createScheduleExcel(eingabe, ergebnis, ZEITPUNKT, KALENDERTAG);
it('Export erfüllt die Struktur des Schreibers ohne fremden Leser', () => {
  const bericht = pruefeTerminplanTeile(leseArchiv(exportieren()));
  expect(bericht.zellen).toBeGreaterThan(300);
  expect(bericht.stile).toBeGreaterThan(10);
});
it('Kopf trimmt Projektdaten und enthält die Metadaten des Ergebnisses', () => {
  const m = beschreibeMappe(eingabe, ergebnis, ZEITPUNKT, KALENDERTAG);
  const werte = m.blatt.zeilen.flatMap(r => r.zellen.map(c => c.wert));
  for (const wert of ['Beispiel & Partner <Test>', 'Geräte\nund Zubehör', 'TEST-2026/01', REGELVERSION]) expect(werte).toContain(wert);
  expect(werte).toContain(`${ergebnis.rechtsstand} (${RECHTSSTAND_DATUM})`);
  expect(werte).toContainEqual({ datum: KALENDERTAG });
  expect(eingabe.projekt?.kunde).toBe('  Beispiel & Partner <Test>  ');
});
it('Kalendertag ist unabhängig vom UTC-Tag des Zeitpunkts', () => {
  const teile = leseArchiv(exportieren());
  expect(teile.get('docProps/core.xml')).toContain(ZEITPUNKT);
  expect(teile.get('xl/worksheets/sheet1.xml')).toContain(`<v>${datumZuSeriennummer(KALENDERTAG)}</v>`);
});
it('Alle Meilensteine, Warnungen und Bindefrist gelangen in die Mappe', () => {
  const m = beschreibeMappe(eingabe, ergebnis, ZEITPUNKT, KALENDERTAG);
  const werte = m.blatt.zeilen.flatMap(r => r.zellen.map(c => c.wert));
  for (const milestone of ergebnis.meilensteine) {
    expect(werte).toContain(milestone.label);
    expect(werte).toContain(milestone.rechenweg);
    expect(werte).toContainEqual({ datum: milestone.datum });
  }
  for (const warnung of ergebnis.warnungen) expect(werte).toContain(`• ${warnung}`);
  expect(werte).toContainEqual({ datum: ergebnis.bindefrist!.termin });
  expect(m.blatt.fusszeile).not.toContain('©');
});
it('Ohne Bindefrist und Warnungen bleibt die Struktur vollständig', () => {
  const input = beispiel({ fristen: {}, projekt: undefined });
  const result = calculateSchedule(input);
  result.warnungen = []; result.meilensteine.forEach(m => { m.warnungen = []; });
  const bytes = createScheduleExcel(input, result, ZEITPUNKT, KALENDERTAG);
  pruefeTerminplanTeile(leseArchiv(bytes));
  expect(leseArchiv(bytes).get('xl/worksheets/sheet1.xml')).toContain('Keine Warnungen.');
});
it('Feste Referenz vergleicht Prüfsumme und alle XML-Teile', async () => {
  const bytes = exportieren();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  await expect(sha + '\n').toMatchFileSnapshot('./referenz/terminplan.sha256');
  const teile = leseArchiv(bytes);
  await expect(JSON.stringify([...teile.keys()], null, 2) + '\n').toMatchFileSnapshot('./referenz/teile.json');
  for (const [name, xml] of teile) await expect(xml, name).toMatchFileSnapshot(`./referenz/xml/${name}`);
});
it('Beschädigte CRC, Verknüpfungen, Zellformate und Zelladressen werden erkannt', () => {
  const bytes = exportieren();
  const kaputt = new Uint8Array(bytes); kaputt[14] ^= 1;
  expect(() => leseArchiv(kaputt)).toThrow();
  for (const [name, von, nach] of [
    ['xl/_rels/workbook.xml.rels', 'Target="styles.xml"', 'Target="fehlt.xml"'],
    ['xl/worksheets/sheet1.xml', 's="1"', 's="999"'],
    ['xl/worksheets/sheet1.xml', 'r="A1"', 'r="B1"'],
    ['xl/worksheets/sheet1.xml', 'fitToPage="1"', 'fitToPage="0"'],
  ]) {
    const teile = leseArchiv(bytes);
    const original = teile.get(name)!;
    expect(original).toContain(von);
    teile.set(name, original.replace(von, nach));
    expect(() => pruefeTerminplanTeile(teile)).toThrow();
  }
});
