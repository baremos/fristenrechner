import { expect, it, vi } from 'vitest';
import { pdfAlsDatei } from '../src/fristenrechner-export-pdf';
import { webExportInhalt } from '../src/web-vorgaben';
import { beispiel, eingabe, ergebnis, ZEITPUNKT, KALENDERTAG } from './beispiel';
import { calculateSchedule, REGELVERSION, RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';

const zeit = { zeitpunkt: ZEITPUNKT, kalendertag: KALENDERTAG };
const pdfText = (bytes: Uint8Array) => Array.from(bytes, byte => String.fromCharCode(byte)).join('');

it('PDF-Datei entsteht ohne Browser und zeigt Metadaten und Seitenzahlen', async () => {
  const datei = await pdfAlsDatei(eingabe, ergebnis, zeit, webExportInhalt);
  const inhalt = pdfText(datei.bytes);
  expect(datei.name).toBe('BAREMOS-IT_fristenplan-test-2026-01.pdf');
  expect(datei.mime).toBe('application/pdf');
  expect(inhalt).toMatch(/^%PDF-/);
  expect(inhalt).toContain(`Regelversion: ${REGELVERSION}`);
  expect(inhalt).toContain(RECHTSSTAND_DATUM);
  expect(inhalt).toContain('29.09.2026');
  expect(inhalt).toContain('BAREMOS IT GmbH');
  expect(inhalt).not.toContain('©');
  const seiten = inhalt.match(/\/Type \/Page\b/g)!.length;
  expect(seiten).toBeGreaterThan(1);
  expect(inhalt).toContain(`Seite ${seiten} von ${seiten}`);
  expect(inhalt).toContain('Zeitschiene');
});
it('PDF ohne Bindefrist und ohne Phasen bleibt erzeugbar', async () => {
  const input = beispiel({ fristen: {}, projekt: {} });
  const result = calculateSchedule(input);
  result.phasen = []; result.warnungen = [];
  const inhalt = pdfText((await pdfAlsDatei(input, result, zeit, webExportInhalt)).bytes);
  expect(inhalt).toContain(`Regelversion: ${REGELVERSION}`);
  expect(inhalt).not.toContain('(Zeitschiene)');
});
it('PDF bleibt bei gleichen Zeit- und Zufallswerten bytegleich zu Teil 1', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ZEITPUNKT));
  // Verschiedene Werte erhalten jsPDFs interne Ereigniskennungen eindeutig.
  let zufall = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => 0.25 + (++zufall) / 1000000);
  try {
    const datei = await pdfAlsDatei(eingabe, ergebnis, zeit, webExportInhalt);
    // Nur die Darstellung derselben Erstellungszeit in der Zeitzone des Rechners
    // wird für den plattformübergreifenden Referenzvergleich vereinheitlicht.
    const text = pdfText(datei.bytes).replace(/\/CreationDate \([^)]*\)/, "/CreationDate (D:20260929003000+02'00')");
    const bytes = Uint8Array.from(text, zeichen => zeichen.charCodeAt(0));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    expect(Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join(''))
      .toBe('51dc7fefde40f8e17423ff52347f4509868cee6a5ebeeb4e5d1cb6fd24e6ae9d');
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});
it('PDF verwendet den übergebenen Kalendertag und die Inhalte des Gastgebers', async () => {
  const inhalt = { herausgeber: 'Beispielverlag', titel: 'Terminplan', dateiPraefix: 'BEISPIEL_' };
  const datei = await pdfAlsDatei(beispiel({ projekt: {} }), ergebnis, { zeitpunkt: ZEITPUNKT, kalendertag: '2026-09-30' }, inhalt);
  const text = pdfText(datei.bytes);
  expect(datei.name).toBe('BEISPIEL_fristenplan-2026-09-30.pdf');
  expect(text).toContain('Beispielverlag');
  expect(text).toContain('(Terminplan)');
  expect(text).toContain('30.09.2026');
  expect(text).not.toContain('BAREMOS');
  expect(text).not.toContain('baremos.de');
});
it('PDF weist eine Exportadresse ohne HTTPS zurück', async () => {
  await expect(pdfAlsDatei(eingabe, ergebnis, zeit, { ...webExportInhalt, adresse: { text: 'Beispiel', href: 'http://example.org' } })).rejects.toThrow(/HTTPS/);
});
