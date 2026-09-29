import { calculateSchedule, type ScheduleInput } from '@baremos/fristenrechner-kern';

/** Frei erfundene Daten für alle Exportprüfungen. */
export function beispiel(aenderungen: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    vergabeordnung: 'vgv',
    verfahrensart: 'verhandlung_mit_tnw',
    bundesland: 'BW',
    bekanntmachung: '2026-10-01',
    projekt: { kunde: '  Beispiel & Partner <Test>  ', projektname: '  Geräte\nund Zubehör  ', vergabenummer: '  TEST-2026/01  ' },
    optionen: {
      elektronischeAbgabe: true, ortsbegehung: false, dringlichkeit: false,
      versandBieterinformation: 'elektronisch',
      teststellung: { aktiv: true, dauerAT: 5 },
      praesentation: { aktiv: true, dauerAT: 2 },
      verhandlungRunde1: { aktiv: true, dauerAT: 3 },
    },
    interneFristen: {
      bewertungAT: 10, aufklaerungEntscheidungAT: 5, internerZuschlagAT: 3,
      teststellungAuswertungAT: 3, infoVersandAT: 0,
      aufforderungVersandAT: 1, einladungVersandAT: 1,
      vuAnpassungRunde1AT: 2, vuAnpassungRunde2AT: 2,
    },
    fristen: { angebotsfristKT: 20, klarstellungVorAngebotKT: 4, optimiertesAngebotKT: 10, finalesAngebotKT: 10, bindefrist: { tage: 60 } },
    ...aenderungen,
  };
}
export const ZEITPUNKT = '2026-09-28T22:30:00Z';
export const KALENDERTAG = '2026-09-29';
export const eingabe = beispiel();
export const ergebnis = calculateSchedule(eingabe);
