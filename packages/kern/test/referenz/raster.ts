/**
 * Raster der Referenzfälle: jede Vergabeordnung mit jeder Verfahrensart, dazu
 * zwölf Eingabeprofile und Starttermine rund um Feiertage, Jahreswechsel und
 * Schaltjahr. Das Raster ist fest, es enthält keinen Zufall. Kombinationen,
 * die eine Vergabeordnung nicht kennt, gehören dazu: Der Rechenkern meldet sie
 * und liefert ein leeres Ergebnis.
 */
import type {
  Bundesland,
  FristWerte,
  InterneFristen,
  Optionen,
  ScheduleInput,
  Verfahrensart,
  Vergabeordnung,
} from './kern.js';

export interface Referenzfall {
  id: string;
  input: ScheduleInput;
}

export const ORDNUNGEN: readonly Vergabeordnung[] = [
  'vgv',
  'vob_a_eu',
  'sektvo',
  'vsvgv',
  'konzvgv',
  'uvgo',
  'vob_a_1',
];

export const ARTEN: readonly Verfahrensart[] = [
  'offen',
  'nicht_offen_mit_tnw',
  'beschraenkt_ohne_tnw',
  'verhandlung_ohne_tnw',
  'verhandlung_mit_tnw',
];

export const LAENDER: readonly Bundesland[] = [
  'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
  'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH',
];

export const STARTTERMINE: readonly string[] = [
  '2026-09-01', // Dienstag ohne Besonderheit
  '2026-09-03', // 30 KT später: Tag der Deutschen Einheit an einem Samstag
  '2026-10-02', // Reformationstag und Allerheiligen, je nach Land
  '2026-11-24', // 30 KT später: Heiligabend
  '2026-12-01', // 30 KT später: Silvester, danach Jahreswechsel
  '2027-03-13', // Start an einem Samstag, Ostern und Pfingsten 2027
  '2027-04-23', // 1. Mai, Christi Himmelfahrt, Fronleichnam
  '2028-01-31', // Schaltjahr mit dem 29.02.2028
];

/** Kalendertage addieren, unabhängig vom Rechenkern. */
export function plusTage(iso: string, tage: number): string {
  const [jahr, monat, tag] = iso.split('-').map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

function optionen(aenderungen: Partial<Optionen> = {}): Optionen {
  return {
    elektronischeAbgabe: true,
    ortsbegehung: false,
    dringlichkeit: false,
    versandBieterinformation: 'elektronisch',
    teststellung: { aktiv: false, dauerAT: 0 },
    ...aenderungen,
  };
}

function intern(aenderungen: Partial<InterneFristen> = {}): InterneFristen {
  return {
    bewertungAT: 10,
    aufklaerungEntscheidungAT: 5,
    internerZuschlagAT: 3,
    teststellungAuswertungAT: 5,
    ...aenderungen,
  };
}

interface Profil {
  name: string;
  eingabe: (start: string) => {
    optionen: Optionen;
    interneFristen: InterneFristen;
    fristen?: FristWerte;
    angebotsaufforderung?: string;
  };
}

export const PROFILE: readonly Profil[] = [
  {
    name: 'standard',
    eingabe: () => ({ optionen: optionen(), interneFristen: intern() }),
  },
  {
    name: 'papier',
    eingabe: () => ({
      optionen: optionen({ elektronischeAbgabe: false, ortsbegehung: true, versandBieterinformation: 'postalisch' }),
      interneFristen: intern(),
    }),
  },
  {
    name: 'dringlich',
    eingabe: () => ({
      optionen: optionen({ dringlichkeit: true }),
      interneFristen: intern({ bewertungAT: 5, aufklaerungEntscheidungAT: 2, internerZuschlagAT: 1 }),
    }),
  },
  {
    name: 'uhrzeit',
    eingabe: () => ({
      optionen: optionen({ abgabeUhrzeit: '10:00' }),
      interneFristen: intern({ infoVersandAT: 1, teilnahmeBewertungAT: 5 }),
    }),
  },
  {
    name: 'teststellung',
    eingabe: () => ({
      optionen: optionen({
        teststellung: { aktiv: true, dauerAT: 10 },
        praesentation: { aktiv: true, dauerAT: 2 },
      }),
      interneFristen: intern(),
    }),
  },
  {
    name: 'zwei-runden',
    eingabe: () => ({
      optionen: optionen({
        praesentation: { aktiv: true, dauerAT: 2 },
        verhandlungRunde1: { aktiv: true, dauerAT: 3 },
        verhandlungRunde2: { aktiv: true, dauerAT: 2 },
      }),
      fristen: { optimiertesAngebotKT: 10, finalesAngebotKT: 10 },
      interneFristen: intern({ zwischenbewertungAT: 4 }),
    }),
  },
  {
    name: 'nur-final',
    eingabe: () => ({
      optionen: optionen({ verhandlungRunde1: { aktiv: true, dauerAT: 3 } }),
      fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 12 },
      interneFristen: intern({ vuAnpassungRunde1AT: 3, einladungVersandAT: 0 }),
    }),
  },
  {
    name: 'kurz',
    eingabe: () => ({
      optionen: optionen(),
      fristen: {
        angebotsfristKT: 8,
        teilnahmefristKT: 10,
        bieterfragenVorAngebotKT: 5,
        bewerberfragenVorTeilnahmeKT: 3,
        klarstellungVorAngebotKT: 3,
        wartefristKT: 5,
      },
      interneFristen: intern(),
    }),
  },
  {
    name: 'bindefrist',
    eingabe: () => ({
      optionen: optionen(),
      fristen: { bindefrist: { tage: 60 } },
      interneFristen: intern({ aufforderungVersandAT: 0 }),
    }),
  },
  {
    name: 'feste-termine',
    eingabe: (start) => ({
      optionen: optionen({ teststellung: { aktiv: true, dauerAT: 5, start: plusTage(start, 150) } }),
      fristen: { bindefrist: { termin: plusTage(start, 200) } },
      interneFristen: intern(),
      angebotsaufforderung: plusTage(start, 50),
    }),
  },
  {
    name: 'konflikt',
    eingabe: (start) => ({
      optionen: optionen({
        teststellung: { aktiv: true, dauerAT: 5, start: plusTage(start, 20) },
        verhandlungRunde1: { aktiv: true, dauerAT: 2, start: plusTage(start, 15) },
      }),
      fristen: { bindefrist: { termin: plusTage(start, 20) } },
      interneFristen: intern(),
      angebotsaufforderung: plusTage(start, 10),
    }),
  },
  {
    name: 'ungueltig',
    eingabe: () => ({
      optionen: optionen({ abgabeUhrzeit: '25:00' }),
      fristen: { angebotsfristKT: -3, wartefristKT: 1.5 },
      interneFristen: intern(),
      angebotsaufforderung: 'kein-datum',
    }),
  },
];

/** Starttermine je Kombination: drei der acht, reihum. */
const TERMINE_JE_KOMBINATION = 3;

export function referenzfaelle(): Referenzfall[] {
  const faelle: Referenzfall[] = [];
  let zaehler = 0;
  for (const vergabeordnung of ORDNUNGEN) {
    for (const verfahrensart of ARTEN) {
      for (const profil of PROFILE) {
        for (let k = 0; k < TERMINE_JE_KOMBINATION; k++) {
          const bekanntmachung = STARTTERMINE[(zaehler + k * 3) % STARTTERMINE.length];
          const bundesland = LAENDER[(zaehler * 5 + k * 7) % LAENDER.length];
          faelle.push({
            id: `${vergabeordnung}/${verfahrensart}/${profil.name}/${bekanntmachung}/${bundesland}`,
            input: { vergabeordnung, verfahrensart, bundesland, bekanntmachung, ...profil.eingabe(bekanntmachung) },
          });
        }
        zaehler += 1;
      }
    }
  }
  // Eingaben ohne Vergabeordnung, wie sie ältere Projektdateien enthalten
  for (const verfahrensart of ARTEN) {
    const bekanntmachung = '2026-09-01';
    faelle.push({
      id: `ohne-ordnung/${verfahrensart}/standard/${bekanntmachung}/NW`,
      input: { verfahrensart, bundesland: 'NW', bekanntmachung, optionen: optionen(), interneFristen: intern() },
    });
  }
  return faelle;
}

/** Optionen für die Vorschlagswerte: jede Verkürzung und Verlängerung einzeln. */
export const VORGABE_OPTIONEN: readonly { name: string; optionen: Optionen }[] = [
  { name: 'elektronisch', optionen: optionen() },
  { name: 'papier', optionen: optionen({ elektronischeAbgabe: false }) },
  { name: 'papier+ortsbegehung', optionen: optionen({ elektronischeAbgabe: false, ortsbegehung: true }) },
  { name: 'elektronisch+dringlich', optionen: optionen({ dringlichkeit: true }) },
  { name: 'papier+dringlich', optionen: optionen({ elektronischeAbgabe: false, dringlichkeit: true }) },
  { name: 'postalische-information', optionen: optionen({ versandBieterinformation: 'postalisch' }) },
];

/** Jahre für die Feiertage: der Zeitraum, den die Starttermine berühren, und zwei weitere. */
export const FEIERTAGS_JAHRE: readonly number[] = [2026, 2027, 2028, 2029, 2030];
