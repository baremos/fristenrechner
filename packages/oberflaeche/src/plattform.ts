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
/** ok bestätigt nur den jeweiligen Adapterweg, niemals einen Versand an Empfänger. */
export type DateiErgebnis = { status: 'ok' } | { status: 'abgebrochen' };
export const FEHLERCODES = ['nicht-verfuegbar', 'kein-speicher', 'zu-gross', 'lesen', 'schreiben', 'kein-ziel'] as const;
export type Fehlercode = typeof FEHLERCODES[number];
export type AusgabeFormat = 'projekt' | 'excel' | 'pdf';
export type AusgabeWeg = 'exportieren' | 'teilen';
export type DateiAktion =
  | { art: 'ausgabe'; format: AusgabeFormat; weg: AusgabeWeg }
  | { art: 'import' }
  | { art: 'neues-projekt' };
export interface DateiAktionsZustand {
  readonly geladen: boolean;
  readonly beschaeftigt: boolean;
  readonly hatErgebnis: boolean;
  readonly kannTeilen: boolean;
  readonly beendet: boolean;
}
export interface RechnerAktionen {
  /** Nicht erlaubte Aufrufe lösen ohne Wirkung auf; Fehler erscheinen in der Aktionsregion. */
  ausgeben(format: AusgabeFormat, weg: AusgabeWeg): Promise<void>;
  projektImportieren(): Promise<void>;
  neuesProjekt(): Promise<void>;
  zustand(): Readonly<DateiAktionsZustand>;
  istErlaubt(aktion: DateiAktion): boolean;
  beobachten(fn: (zustand: Readonly<DateiAktionsZustand>) => void): () => void;
}
export interface RechnerInstanz {
  readonly aktionen: RechnerAktionen;
  dispose(): void;
}
export type ImportBedienung = 'dateifeld' | 'schaltflaeche';
/** Platz des Hinweiskastens mit Datenschutztext und Speicherstatus: über dem Formular (Vorgabe) oder unter dem rechtlichen Hinweis. */
export type HinweisPosition = 'oben' | 'unten';
export type AusgabeTexte = Partial<Record<AusgabeWeg, Partial<Record<AusgabeFormat, string>>>>;
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
  /** Web: zum Speichern bereitgestellt; native Adapter können geschlossenes Schreiben bestätigen. */
  exportieren(datei: AusgabeDatei): Promise<DateiErgebnis>;
  /** Vollständige Datei und gestartete Teilen-Auswahl; keine Versandbestätigung. */
  teilen?: (datei: AusgabeDatei) => Promise<DateiErgebnis>;
}
/** Optionaler Zurück-Weg des Gastgebers, ohne Web-Historie. */
export interface MenueZurueck {
  /** Öffnen/Schließen wartet nicht auf die native Bestätigung; Fehler bleiben ohne Projektmeldung. */
  setzen(aktiv: boolean): Promise<void>;
  beobachten(fn: () => void): () => void;
  dispose(): void;
}
export interface Plattform {
  zurueck?: MenueZurueck;
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
  /** Optional je Weg/Format. exportErfolg bleibt der Rückfall für exportieren. */
  ausgabeErfolg?: AusgabeTexte;
  ausgabeFehler?: AusgabeTexte;
  erzeugungsFehler?: Partial<Record<AusgabeFormat, string>>;
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
