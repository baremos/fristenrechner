import { describe, expect, it } from 'vitest';
import type { ScheduleInput } from './api.js';
import {
  calculateSchedule,
  erstelleProjektDatei,
  parseProjektDatei,
  RECHENKERN_VERSION,
  RECHTSSTAND,
  RECHTSSTAND_DATUM,
  REGELVERSION,
} from './api.js';
import { istGueltigesISODate } from './kalender.js';

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function eingabe(): ScheduleInput {
  return {
    vergabeordnung: 'vgv',
    verfahrensart: 'offen',
    bundesland: 'NW',
    bekanntmachung: '2026-09-01',
    optionen: {
      elektronischeAbgabe: true,
      ortsbegehung: false,
      dringlichkeit: false,
      versandBieterinformation: 'elektronisch',
      teststellung: { aktiv: false, dauerAT: 0 },
    },
    interneFristen: {
      bewertungAT: 10,
      aufklaerungEntscheidungAT: 5,
      internerZuschlagAT: 3,
      teststellungAuswertungAT: 5,
    },
  };
}

describe('Regelversion und Rechtsstand', () => {
  it('nennt den Stand der Regelprüfung vom 2026-10-22', () => {
    expect(REGELVERSION).toBe('1.9.1');
    expect(RECHTSSTAND_DATUM).toBe('2026-10-22');
    expect(RECHTSSTAND).toBe('Oktober 2026');
  });

  it('die Regelversion ist eine Versionsnummer', () => {
    expect(REGELVERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RECHENKERN_VERSION).toBe(REGELVERSION);
  });

  it('der Rechtsstand ist ein gültiges Datum im ISO-Format', () => {
    expect(RECHTSSTAND_DATUM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(istGueltigesISODate(RECHTSSTAND_DATUM)).toBe(true);
  });

  it('der Anzeigetext beginnt mit Monat und Jahr des Datums', () => {
    const [jahr, monat] = RECHTSSTAND_DATUM.split('-');
    expect(RECHTSSTAND.startsWith(`${MONATE[Number(monat) - 1]} ${jahr}`)).toBe(true);
  });

  it('der Anzeigetext nennt keine Schwellenwerte', () => {
    expect(RECHTSSTAND).not.toMatch(/schwellenwert/i);
  });

  it('jedes Ergebnis nennt Regelversion und Rechtsstand, auch das leere', () => {
    const ergebnisse = [
      calculateSchedule(eingabe()),
      calculateSchedule({ ...eingabe(), bekanntmachung: 'kein-datum' }),
      calculateSchedule({ ...eingabe(), vergabeordnung: 'vsvgv' }),
    ];
    expect(ergebnisse[0].meilensteine.length).toBeGreaterThan(0);
    expect(ergebnisse[1].meilensteine).toEqual([]);
    expect(ergebnisse[2].meilensteine).toEqual([]);
    for (const ergebnis of ergebnisse) {
      expect(ergebnis.regelversion).toBe(REGELVERSION);
      expect(ergebnis.rechtsstand).toBe(RECHTSSTAND);
      expect(ergebnis.rechtsstandDatum).toBe(RECHTSSTAND_DATUM);
    }
  });
});

describe('Projektdatei mit Regelversion und Rechtsstand', () => {
  const ZEIT = '2026-09-28T10:00:00Z';

  it('eine neue Projektdatei trägt Regelversion, Anzeigetext und Datum', () => {
    const datei = erstelleProjektDatei(eingabe(), ZEIT);
    expect(datei.rechenkernVersion).toBe(REGELVERSION);
    expect(datei.rechtsstand).toBe(RECHTSSTAND);
    expect(datei.rechtsstandDatum).toBe(RECHTSSTAND_DATUM);
    const gelesen = parseProjektDatei(JSON.stringify(datei));
    expect(gelesen.ok).toBe(true);
    if (gelesen.ok) expect(gelesen.datei).toEqual(datei);
  });

  it('eine Projektdatei ohne das Datum bleibt lesbar', () => {
    const alt: Record<string, unknown> = { ...erstelleProjektDatei(eingabe(), ZEIT) };
    delete alt.rechtsstandDatum;
    const gelesen = parseProjektDatei(JSON.stringify(alt));
    expect(gelesen.ok).toBe(true);
    if (gelesen.ok) expect(gelesen.datei.rechtsstandDatum).toBeUndefined();
  });

  it('liest 1.9.0 unverändert ein und speichert die Neuberechnung mit 1.9.1', () => {
    const alt = {
      ...erstelleProjektDatei({ ...eingabe(), vergabeordnung: 'vob_a_eu' }, ZEIT),
      rechenkernVersion: '1.9.0',
      rechtsstand: 'Juli 2026',
      rechtsstandDatum: '2026-07-17',
    };
    const gelesen = parseProjektDatei(JSON.stringify(alt));
    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) throw new Error(gelesen.fehler.join('\n'));
    expect(gelesen.datei).toEqual(alt);
    const ergebnis = calculateSchedule(gelesen.datei.input);
    expect(ergebnis.regelversion).toBe('1.9.1');
    expect(ergebnis.meilensteine.find((m) => m.id === 'angebotsabgabe')?.datum).toBe('2026-10-01');
    const neu = erstelleProjektDatei(gelesen.datei.input, ZEIT);
    expect(neu.input).toEqual(alt.input);
    expect(neu.rechenkernVersion).toBe('1.9.1');
    expect(neu.rechtsstandDatum).toBe('2026-10-22');
  });

  it('ein ungültiges Datum wird abgelehnt, auch ein leerer Wert', () => {
    for (const wert of ['Juli 2026', '2026-02-30', '17.07.2026', '', 20260717, null]) {
      const datei = { ...erstelleProjektDatei(eingabe(), ZEIT), rechtsstandDatum: wert };
      const gelesen = parseProjektDatei(JSON.stringify(datei));
      expect(gelesen.ok, String(wert)).toBe(false);
      if (!gelesen.ok) expect(gelesen.fehler.join('\n')).toContain('rechtsstandDatum');
    }
  });
});
