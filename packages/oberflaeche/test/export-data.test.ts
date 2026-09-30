import { describe, expect, it, vi } from 'vitest';
import { VERGABEORDNUNGEN, calculateSchedule, erstelleProjektDatei, REGELVERSION, RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';
import { exportRegime, regimeLabel, regimeShortLabel, procedureLabel, stateLabels, phaseLabels, typeLabels, formatExportDate, formatCreatedDate, toExcelDate, uniqueWarnings, exportFileSuffix, projectHeader, regelstandText, pruefeExportInhalt } from '../src/fristenrechner-export-data';
import { webExportInhalt } from '../src/web-vorgaben';
import { todayISO, formatDate, isVersionBefore, safeFilename } from '../src/fristenrechner-ui';
import { beispiel, eingabe, ergebnis } from './beispiel';

describe('Exportdaten', () => {
  it('ältere Eingaben ohne Ordnung bleiben VgV', () => {
    expect(exportRegime(beispiel({ vergabeordnung: undefined }))).toBe('vgv');
  });
  for (const [ordnung, profil] of Object.entries(VERGABEORDNUNGEN)) {
    it(`Beschriftungen stammen für ${ordnung} aus dem Kern`, () => {
      for (const [art, verfahren] of Object.entries(profil.verfahren)) {
        const input = beispiel({ vergabeordnung: ordnung as typeof eingabe.vergabeordnung, verfahrensart: art as typeof eingabe.verfahrensart });
        expect(regimeLabel(input)).toBe(profil.label);
        expect(regimeShortLabel(input)).toBe(profil.kurz);
        expect(procedureLabel(input)).toBe(verfahren.label);
      }
    });
  }
  it('Beschriftungen decken Länder, Phasen und Fristtypen ab', () => {
    expect(Object.keys(stateLabels)).toHaveLength(16);
    for (const m of ergebnis.meilensteine) {
      expect(phaseLabels[m.phase]).toBeTruthy();
      expect(typeLabels[m.fristTyp]).toBeTruthy();
    }
  });
  it('Datum wird ohne Verschiebung und mit führenden Nullen angezeigt', () => {
    for (const format of [formatExportDate, formatDate]) {
      expect(format('2026-07-03')).toBe('03.07.2026');
      expect(format('2024-02-29')).toBe('29.02.2024');
      expect(format('')).toBe('');
      expect(format('unbekannt')).toBe('unbekannt');
    }
    expect(formatCreatedDate(new Date(2026, 8, 29, 0, 30))).toBe('29.09.2026');
    expect(toExcelDate('2026-07-03')).toEqual(new Date('2026-07-03T00:00:00Z'));
    expect(toExcelDate('')).toBe('');
  });
  it('Warnungen bleiben in Reihenfolge, Duplikate entfallen', () => {
    const result = structuredClone(ergebnis);
    result.warnungen = ['eins', 'zwei', 'eins'];
    result.meilensteine = [{ ...result.meilensteine[0], warnungen: ['zwei', 'drei'] }];
    expect(uniqueWarnings(result)).toEqual(['eins', 'zwei', 'drei']);
  });
  it('Dateiname verwendet Vergabenummer oder den örtlichen Tag', () => {
    expect(exportFileSuffix(eingabe, '2026-01-02')).toBe('test-2026-01');
    expect(exportFileSuffix(beispiel({ projekt: { vergabenummer: '   ' } }), '2026-01-02')).toBe('2026-01-02');
    expect(exportFileSuffix(beispiel({ projekt: { vergabenummer: '???' } }), '2026-01-02')).toBe('terminplan');
    expect(exportFileSuffix(beispiel({ projekt: { vergabenummer: 'Ä-Ö_Ü' } }), '2026-01-02')).toBe('a-o_u');
  });
  it.each(['http://example.org', 'javascript:alert(1)', 'data:text/html,test', '/kontakt', 'keine-adresse'])('Exportadresse %s wird abgewiesen', href => {
    expect(() => pruefeExportInhalt({ ...webExportInhalt, adresse: { text: 'Kontakt', href } })).toThrow();
  });
  it('Exportadresse ist optional und HTTPS bleibt zugelassen', () => {
    expect(() => pruefeExportInhalt(webExportInhalt)).not.toThrow();
    expect(() => pruefeExportInhalt({ ...webExportInhalt, adresse: undefined })).not.toThrow();
  });
  it('Kopf entfernt nur Leerraum am Rand', () => {
    expect(projectHeader(eingabe)).toBe('Kunde: Beispiel & Partner <Test> - Projekt: Geräte\nund Zubehör - Vergabenummer: TEST-2026/01');
    expect(projectHeader(beispiel({ projekt: {} }))).toBe('Kunde: — - Projekt: —');
  });
  it('Berechnung und Projektdatei beziehen Metadaten aus dem Kern', () => {
    expect(regelstandText(ergebnis)).toContain(`Regelversion: ${REGELVERSION}`);
    expect(regelstandText(ergebnis)).toContain(RECHTSSTAND_DATUM);
    const file = erstelleProjektDatei(eingabe, '2026-09-29T10:00:00Z');
    expect(file.rechenkernVersion).toBe(ergebnis.regelversion);
    expect(file.rechtsstandDatum).toBe(ergebnis.rechtsstandDatum);
    expect(regelstandText({ ...ergebnis, regelversion: '2.0.0', rechtsstandDatum: '2027-01-01', rechtsstand: 'Januar 2027' })).toBe('Regelversion: 2.0.0 · Rechtsstand: Januar 2027 (2027-01-01)');
  });
  it('Metadaten stehen auch an einem Ergebnis mit Konflikten', () => {
    const input = beispiel();
    input.optionen.teststellung.start = '2026-01-01';
    const result = calculateSchedule(input);
    expect(result.konflikte.length).toBeGreaterThan(0);
    expect(regelstandText(result)).toContain(REGELVERSION);
  });
});

describe('Hilfen der Bedienlogik ohne Browser', () => {
  it.each([
    ['1.8.9', '1.9.0', true], ['1.9.0', '1.9.0', false], ['1.10.0', '1.9.0', false],
    ['2.0.0', '1.9.0', false], [' 1.8.0 ', '1.9.0', true], ['1.8.0+test', '1.9.0', true],
    ['ungueltig', '1.9.0', false], ['1.8.0', 'ungueltig', false],
  ])('Versionsvergleich %s zu %s', (a, b, erwartet) => expect(isVersionBefore(a, b)).toBe(erwartet));
  it('Projektdateiname entfernt Pfadzeichen und hat einen Ersatznamen', () => {
    expect(safeFilename('../../Ä Ö/TEST')).toBe('a-o-test');
    expect(safeFilename('???')).toBe('vergabe-terminplan');
  });
  it('Starttag folgt den örtlichen Kalenderfeldern', () => {
    expect(todayISO(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
      expect(todayISO()).toBe('2026-12-31');
    } finally { vi.useRealTimers(); }
  });
});
