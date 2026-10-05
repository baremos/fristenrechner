import type {
  Bundesland,
  Meilenstein,
  ScheduleInput,
  ScheduleResult,
  Vergabeordnung,
} from '@baremos/fristenrechner-kern';
import { VERGABEORDNUNGEN } from '@baremos/fristenrechner-kern';
import type { ExportInhalt } from './plattform';

/** Fester Pakethinweis für PDF und Excel; kein austauschbarer Gastgebertext. */
export const exportHaftungshinweis = 'Unverbindliche Rechenhilfe. Ersetzt keine Rechtsberatung. Alle Angaben ohne Gewähr.';

/** Exportadressen sind optional und verwenden ausschließlich HTTPS. */
export function pruefeExportInhalt(inhalt: ExportInhalt): void {
  if (inhalt.adresse && new URL(inhalt.adresse.href).protocol !== 'https:') {
    throw new Error('Die Exportadresse muss HTTPS verwenden.');
  }
}

export function exportHinweis(inhalt: ExportInhalt): string {
  return `Erstellt mit dem Fristenrechner der ${inhalt.herausgeber}${inhalt.adresse ? ` · ${inhalt.adresse.text}` : ''}`;
}

/** Vergabeordnung eines Inputs; Projektdateien aus Kern < 1.5.0 sind VgV. */
export function exportRegime(input: ScheduleInput): Vergabeordnung {
  return input.vergabeordnung ?? 'vgv';
}

/** Anzeigename der Vergabeordnung (aus den Kern-Profilen — seit Kern 1.6.0 keine Label-Duplikate mehr). */
export function regimeLabel(input: ScheduleInput): string {
  return VERGABEORDNUNGEN[exportRegime(input)]?.label ?? exportRegime(input);
}

export function regimeShortLabel(input: ScheduleInput): string {
  return VERGABEORDNUNGEN[exportRegime(input)]?.kurz ?? exportRegime(input);
}

/** Verfahrensname je Vergabeordnung (z. B. heißt `offen` in der UVgO „Öffentliche Ausschreibung"). */
export function procedureLabel(input: ScheduleInput): string {
  return VERGABEORDNUNGEN[exportRegime(input)]?.verfahren[input.verfahrensart]?.label ?? input.verfahrensart;
}

export const stateLabels: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

export const phaseLabels: Record<Meilenstein['phase'], string> = {
  einholung: 'Angebotsphase',
  teilnahmewettbewerb: 'Teilnahmewettbewerb',
  verhandlung: 'Verhandlungsphase',
  bewertung: 'Bewertung',
  teststellung: 'Teststellung',
  zuschlag: 'Zuschlag',
};

export const typeLabels: Record<Meilenstein['fristTyp'], string> = {
  gesetzlich: 'Gesetzliche Frist',
  praxis: 'Praxiswert',
  intern: 'Interne Planung',
  eingabe: 'Eingabe',
};

export function formatExportDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Erstellungsdatum im Export-Kopf — zweistellig wie alle Termindaten. */
export function formatCreatedDate(value: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

export function toExcelDate(value: string): Date | string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day));
}

export function uniqueWarnings(result: ScheduleResult): string[] {
  return [
    ...result.warnungen,
    ...result.meilensteine.flatMap((milestone) => milestone.warnungen),
  ].filter((warning, index, all) => all.indexOf(warning) === index);
}

export function exportFileSuffix(input: ScheduleInput, kalendertag: string): string {
  const value = input.projekt?.vergabenummer?.trim() || kalendertag;
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'terminplan';
}

export function projectHeader(input: ScheduleInput): string {
  const customer = input.projekt?.kunde?.trim() || '—';
  const project = input.projekt?.projektname?.trim() || '—';
  const reference = input.projekt?.vergabenummer?.trim();
  return `Kunde: ${customer} - Projekt: ${project}${reference ? ` - Vergabenummer: ${reference}` : ''}`;
}

/** Metadaten stammen aus dem Ergebnis des Rechenkerns. */
export function regelstandText(result: ScheduleResult): string {
  return `Regelversion: ${result.regelversion} · Rechtsstand: ${result.rechtsstand} (${result.rechtsstandDatum})`;
}
