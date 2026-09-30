/** Plattformverträge: Adapter transportieren Daten, der Kern prüft und berechnet sie. */
export type Kalendertag = string; // JJJJ-MM-TT, Kalenderfelder der Ortszeit
export interface ExportZeit {
  zeitpunkt: string;
  kalendertag: Kalendertag;
}
export interface AusgabeDatei {
  name: string;
  mime: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/json;charset=utf-8';
  bytes: Uint8Array<ArrayBuffer>;
}
export type Auswahl<T> = { status: 'ok'; wert: T } | { status: 'abgebrochen' };
export type DateiErgebnis = { status: 'ok' } | { status: 'abgebrochen' };
export type Fehlercode = 'nicht-verfuegbar' | 'kein-speicher' | 'zu-gross' | 'lesen' | 'schreiben' | 'kein-ziel';
export class PlattformFehler extends Error {
  constructor(readonly code: Fehlercode, message: string) { super(message); this.name = 'PlattformFehler'; }
}
export interface ProjektSpeicher {
  lesen(): Promise<string | null>;
  schreiben(json: string): Promise<void>;
  entfernen(): Promise<void>;
}
export interface DateiImport {
  waehlen(vorgabe: { mime: 'application/json'; endungen: readonly ['.json']; maxBytes: number }): Promise<Auswahl<{ name: string; text: string }>>;
}
export interface DateiAusgabe {
  exportieren(datei: AusgabeDatei): Promise<DateiErgebnis>;
  teilen?: (datei: AusgabeDatei) => Promise<DateiErgebnis>;
}
export interface Plattform {
  speicher: ProjektSpeicher;
  import: DateiImport;
  ausgabe: DateiAusgabe;
  zeit(): ExportZeit;
  zuruecksetzenBestaetigen(): Promise<boolean>;
}
export interface GastgeberTexte {
  datenschutzTitel: string;
  datenschutzText: string;
  speicherNichtVerfuegbar: string;
  exportErfolg: string;
  importBeschriftung: string;
}
export interface ExportInhalt {
  herausgeber: string;
  titel: string;
  adresse?: { text: string; href: string };
  dateiPraefix: string;
}
export interface RechnerOptionen {
  plattform: Plattform;
  texte: GastgeberTexte;
  exportInhalt: ExportInhalt;
}
export const MAX_PROJEKT_BYTES = 1024 * 1024;
export function pruefeProjektGroesse(text: string, maxBytes = MAX_PROJEKT_BYTES): void {
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new PlattformFehler('zu-gross', 'Die Projektdatei ist größer als 1 MiB.');
  }
}
