import { expect, it } from 'vitest';
import { createSchedulePdf } from '../src/fristenrechner-export-pdf';
import { beispiel, eingabe, ergebnis } from './beispiel';
import { calculateSchedule, REGELVERSION, RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';

it('PDF entsteht ohne Browser und zeigt Metadaten und Seitenzahlen', async () => {
  const pdf = await createSchedulePdf(eingabe, ergebnis, new Date(2026, 8, 29, 0, 30));
  const inhalt = pdf.output();
  expect(inhalt).toMatch(/^%PDF-/);
  expect(inhalt).toContain(`Regelversion: ${REGELVERSION}`);
  expect(inhalt).toContain(RECHTSSTAND_DATUM);
  expect(inhalt).toContain('29.09.2026');
  expect(inhalt).toContain('BAREMOS IT GmbH');
  expect(inhalt).not.toContain('©');
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(inhalt).toContain(`Seite ${pdf.getNumberOfPages()} von ${pdf.getNumberOfPages()}`);
  expect(inhalt).toContain('Zeitschiene');
});
it('PDF ohne Bindefrist und ohne Phasen bleibt erzeugbar', async () => {
  const input = beispiel({ fristen: {}, projekt: {} });
  const result = calculateSchedule(input);
  result.phasen = []; result.warnungen = [];
  const pdf = await createSchedulePdf(input, result, new Date(2026, 8, 29));
  expect(pdf.output()).toContain(`Regelversion: ${REGELVERSION}`);
  expect(pdf.output()).not.toContain('(Zeitschiene)');
});
