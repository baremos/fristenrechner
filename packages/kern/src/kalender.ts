/**
 * Kalender-Engine des Fristenrechners: Datumsarithmetik auf ISO-Strings,
 * gesetzliche Feiertage je Bundesland, Arbeitstagslogik.
 *
 * Bewusst ohne Date-Objekte im API-Umfang (reine Kalenderarithmetik, keine
 * Zeitzonen); intern wird UTC-Epoch nur für Wochentag/Differenz genutzt.
 *
 * Fachliche Regeln: Feiertagslisten nach den Feiertagsgesetzen der Länder;
 * Teilgebiets-Feiertage (z. B. Fronleichnam in Teilen Sachsens) tragen
 * `landesweit: false` und zählen bei der Arbeitstagsberechnung NICHT als
 * Feiertag (konservativ: keine Fristverlängerung, die nur in Teilgebieten
 * gälte).
 */

import type { Bundesland, Feiertag, ISODate } from './api.js';

// ---------------------------------------------------------------------------
// Grundarithmetik
// ---------------------------------------------------------------------------

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Wirft bei syntaktisch oder kalendarisch ungültigem Datum. */
export function pruefeISODate(iso: string): void {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Ungültiges Datum (erwartet YYYY-MM-DD): "${iso}"`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Kalendarisch ungültiges Datum: "${iso}"`);
  }
}

export function istGueltigesISODate(iso: string): boolean {
  try {
    pruefeISODate(iso);
    return true;
  } catch {
    return false;
  }
}

function utc(iso: ISODate): number {
  const m = ISO_RE.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmt(epochUtc: number): ISODate {
  const d = new Date(epochUtc);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const TAG_MS = 86_400_000;

/** Kalendertage addieren (n darf negativ sein). */
export function addTage(iso: ISODate, n: number): ISODate {
  return fmt(utc(iso) + n * TAG_MS);
}

/** Differenz b − a in Kalendertagen. */
export function tageZwischen(a: ISODate, b: ISODate): number {
  return Math.round((utc(b) - utc(a)) / TAG_MS);
}

/** Wochentag: 0 = Sonntag … 6 = Samstag. */
export function wochentag(iso: ISODate): number {
  return new Date(utc(iso)).getUTCDay();
}

export function istWochenende(iso: ISODate): boolean {
  const w = wochentag(iso);
  return w === 0 || w === 6;
}

/** Jahr eines ISO-Datums. */
export function jahrVon(iso: ISODate): number {
  return Number(iso.slice(0, 4));
}

// ---------------------------------------------------------------------------
// Bewegliche Feiertage
// ---------------------------------------------------------------------------

/** Ostersonntag (gregorianisch) nach Meeus/Jones/Butcher. */
export function ostersonntag(jahr: number): ISODate {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${jahr}-${p(monat)}-${p(tag)}`;
}

/** Buß- und Bettag: Mittwoch vor dem 23. November. */
function bussUndBettag(jahr: number): ISODate {
  const nov22 = `${jahr}-11-22`;
  const abstandZuMittwoch = (wochentag(nov22) - 3 + 7) % 7;
  return addTage(nov22, -abstandZuMittwoch);
}

// ---------------------------------------------------------------------------
// Feiertage je Bundesland
// ---------------------------------------------------------------------------

type Regel = {
  name: string;
  /** Fester Termin `MM-DD` oder Offset in Tagen relativ zum Ostersonntag. */
  datum: string | { ostern: number } | { bussUndBettag: true };
  /** undefined ⇒ bundesweit. */
  laender?: Partial<Record<Bundesland, { landesweit: boolean }>>;
};

const ALLE: Bundesland[] = [
  'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
  'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH',
];

function inLaendern(laender: Bundesland[], landesweit = true) {
  return Object.fromEntries(laender.map((l) => [l, { landesweit }]));
}

/** Gesetzliche Feiertage nach den Feiertagsgesetzen der Länder. */
const REGELN: Regel[] = [
  { name: 'Neujahr', datum: '01-01' },
  { name: 'Heilige Drei Könige', datum: '01-06', laender: inLaendern(['BW', 'BY', 'ST']) },
  { name: 'Internationaler Frauentag', datum: '03-08', laender: inLaendern(['BE', 'MV']) },
  { name: 'Karfreitag', datum: { ostern: -2 } },
  { name: 'Ostersonntag', datum: { ostern: 0 }, laender: inLaendern(['BB']) },
  { name: 'Ostermontag', datum: { ostern: 1 } },
  { name: 'Tag der Arbeit', datum: '05-01' },
  { name: 'Christi Himmelfahrt', datum: { ostern: 39 } },
  { name: 'Pfingstsonntag', datum: { ostern: 49 }, laender: inLaendern(['BB']) },
  { name: 'Pfingstmontag', datum: { ostern: 50 } },
  {
    name: 'Fronleichnam',
    datum: { ostern: 60 },
    laender: {
      ...inLaendern(['BW', 'BY', 'HE', 'NW', 'RP', 'SL']),
      ...inLaendern(['SN', 'TH'], false), // nur in Teilen mit überwiegend katholischer Bevölkerung
    },
  },
  { name: 'Augsburger Friedensfest', datum: '08-08', laender: inLaendern(['BY'], false) }, // nur Stadt Augsburg
  {
    name: 'Mariä Himmelfahrt',
    datum: '08-15',
    laender: { ...inLaendern(['SL']), ...inLaendern(['BY'], false) }, // BY: nur überwiegend katholische Gemeinden
  },
  { name: 'Weltkindertag', datum: '09-20', laender: inLaendern(['TH']) },
  { name: 'Tag der Deutschen Einheit', datum: '10-03' },
  {
    name: 'Reformationstag',
    datum: '10-31',
    laender: inLaendern(['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']),
  },
  { name: 'Allerheiligen', datum: '11-01', laender: inLaendern(['BW', 'BY', 'NW', 'RP', 'SL']) },
  { name: 'Buß- und Bettag', datum: { bussUndBettag: true }, laender: inLaendern(['SN']) },
  { name: 'Erster Weihnachtsfeiertag', datum: '12-25' },
  { name: 'Zweiter Weihnachtsfeiertag', datum: '12-26' },
];

/** Gesetzliche Feiertage eines Bundeslands im Jahr, chronologisch sortiert. */
export function feiertage(bundesland: Bundesland, jahr: number): Feiertag[] {
  const liste: Feiertag[] = [];
  for (const regel of REGELN) {
    const geltung = regel.laender === undefined
      ? { landesweit: true }
      : regel.laender[bundesland];
    if (!geltung) continue;
    let datum: ISODate;
    if (typeof regel.datum === 'string') datum = `${jahr}-${regel.datum}`;
    else if ('ostern' in regel.datum) datum = addTage(ostersonntag(jahr), regel.datum.ostern);
    else datum = bussUndBettag(jahr);
    liste.push({ datum, name: regel.name, landesweit: geltung.landesweit });
  }
  return liste.sort((a, b) => a.datum.localeCompare(b.datum));
}

const feiertagsCache = new Map<string, Set<ISODate>>();

/** Landesweite Feiertage als Set (gecacht) — Basis der Arbeitstagslogik. */
function landesweiteFeiertage(bundesland: Bundesland, jahr: number): Set<ISODate> {
  const key = `${bundesland}:${jahr}`;
  let set = feiertagsCache.get(key);
  if (!set) {
    set = new Set(feiertage(bundesland, jahr).filter((f) => f.landesweit).map((f) => f.datum));
    feiertagsCache.set(key, set);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Arbeitstagslogik
// ---------------------------------------------------------------------------

/** Arbeitstag = Mo–Fr und kein landesweiter gesetzlicher Feiertag. */
export function istArbeitstag(datum: ISODate, bundesland: Bundesland): boolean {
  if (istWochenende(datum)) return false;
  return !landesweiteFeiertage(bundesland, jahrVon(datum)).has(datum);
}

/** Das Datum selbst, falls Arbeitstag — sonst der nächste Arbeitstag danach. */
export function aufArbeitstagVerschieben(datum: ISODate, bundesland: Bundesland): ISODate {
  let d = datum;
  while (!istArbeitstag(d, bundesland)) d = addTage(d, 1);
  return d;
}

/** Das Datum selbst, falls Arbeitstag — sonst der letzte Arbeitstag davor (für Rückwärtsfristen). */
export function aufVorherigenArbeitstag(datum: ISODate, bundesland: Bundesland): ISODate {
  let d = datum;
  while (!istArbeitstag(d, bundesland)) d = addTage(d, -1);
  return d;
}

/**
 * n Arbeitstage addieren (WORKDAY-Semantik: der Starttag zählt nicht
 * mit; Ergebnis ist der n-te Arbeitstag nach `start`). n = 0 ⇒ `start`;
 * negatives n rechnet rückwärts.
 */
export function addArbeitstage(start: ISODate, n: number, bundesland: Bundesland): ISODate {
  if (!Number.isInteger(n)) throw new Error(`Arbeitstage müssen ganzzahlig sein: ${n}`);
  let d = start;
  const schritt = n >= 0 ? 1 : -1;
  let rest = Math.abs(n);
  while (rest > 0) {
    d = addTage(d, schritt);
    if (istArbeitstag(d, bundesland)) rest--;
  }
  return d;
}

export { ALLE as ALLE_BUNDESLAENDER };
