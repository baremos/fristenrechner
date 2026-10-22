import { describe, expect, it } from 'vitest';
import { RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';
import { heuteLokal, hinweisGrenze, rechtsstandHinweisNoetig } from '../src/rechtsstand-hinweis';

describe('Grenze für den Hinweis zum Rechtsstand', () => {
  it('liegt zwölf Monate nach dem Rechtsstand', () => {
    expect(hinweisGrenze('2026-07-17')).toBe('2027-07-17');
    expect(hinweisGrenze('2026-01-31')).toBe('2027-01-31');
    expect(hinweisGrenze('2026-12-31')).toBe('2027-12-31');
  });

  it('nimmt den Monatsletzten, wenn der Tag im Zielmonat fehlt', () => {
    expect(hinweisGrenze('2028-02-29')).toBe('2029-02-28');
    expect(hinweisGrenze('2031-02-28')).toBe('2032-02-28');
  });

  it('lehnt ungültige Angaben ab', () => {
    for (const falsch of ['', '2026-7-17', '17.07.2026', '2026-13-01', '2026-02-30', '2027-02-29', '2026-07-17T00:00']) {
      expect(() => hinweisGrenze(falsch), falsch).toThrow();
    }
  });
});

describe('Hinweis nötig', () => {
  it('erscheint für den Rechtsstand vom 22. Oktober 2026 erst am 23. Oktober 2027', () => {
    expect(RECHTSSTAND_DATUM).toBe('2026-10-22');
    expect(hinweisGrenze(RECHTSSTAND_DATUM)).toBe('2027-10-22');
    expect(rechtsstandHinweisNoetig('2027-10-22', RECHTSSTAND_DATUM)).toBe(false);
    expect(rechtsstandHinweisNoetig('2027-10-23', RECHTSSTAND_DATUM)).toBe(true);
  });

  it('erscheint erst am Tag nach der Grenze', () => {
    expect(rechtsstandHinweisNoetig('2027-07-17', '2026-07-17')).toBe(false);
    expect(rechtsstandHinweisNoetig('2027-07-18', '2026-07-17')).toBe(true);
  });

  it('gilt über den Jahreswechsel', () => {
    expect(rechtsstandHinweisNoetig('2027-12-31', '2026-12-31')).toBe(false);
    expect(rechtsstandHinweisNoetig('2028-01-01', '2026-12-31')).toBe(true);
  });

  it('erscheint am 1. März nach einem Rechtsstand vom 29. Februar', () => {
    expect(rechtsstandHinweisNoetig('2029-02-28', '2028-02-29')).toBe(false);
    expect(rechtsstandHinweisNoetig('2029-03-01', '2028-02-29')).toBe(true);
  });

  it('erscheint nicht vor dem Rechtsstand', () => {
    expect(rechtsstandHinweisNoetig('2025-01-01', '2026-07-17')).toBe(false);
    expect(rechtsstandHinweisNoetig('2026-07-17', '2026-07-17')).toBe(false);
  });

  it('lehnt ein ungültiges Tagesdatum ab', () => {
    expect(() => rechtsstandHinweisNoetig('2027-7-18', '2026-07-17')).toThrow();
  });
});

describe('Datum des Geräts', () => {
  it('nimmt die Ortsfelder, ohne Umrechnung in UTC', () => {
    expect(heuteLokal(new Date(2027, 6, 17, 23, 59))).toBe('2027-07-17');
    expect(heuteLokal(new Date(2027, 6, 18, 0, 1))).toBe('2027-07-18');
    expect(heuteLokal(new Date(2027, 11, 31, 23, 59))).toBe('2027-12-31');
    expect(heuteLokal(new Date(2028, 0, 1, 0, 0))).toBe('2028-01-01');
  });
});
