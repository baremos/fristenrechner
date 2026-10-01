import { registerPlugin } from '@capacitor/core';
import {
  FEHLERCODES, PlattformFehler,
  type AusgabeDatei, type Fehlercode,
} from '@baremos/fristenrechner-ui/ui';

/** Ausschließlich der native Transportvertrag; keine Dateipfade oder Inhalte in Meldungen. */
export interface DateiablaufPlugin {
  ausgabeBeginnen(vorgabe: { name: string; mime: AusgabeDatei['mime']; anzahlBytes: number }): Promise<{ auftragId: string }>;
  ausgabeBlock(block: { auftragId: string; offset: number; base64: string }): Promise<void>;
  ausgabeAbschliessen(auftrag: { auftragId: string }): Promise<void>;
  speichernUnter(auftrag: { auftragId: string }): Promise<{ status: 'ok' | 'abgebrochen' }>;
  teilen(auftrag: { auftragId: string }): Promise<{ status: 'bereitgestellt' }>;
  ausgabeVerwerfen(auftrag: { auftragId: string }): Promise<void>;
  projektWaehlen(): Promise<{ status: 'ok'; name: string; text: string } | { status: 'abgebrochen' }>;
  zuruecksetzenBestaetigen(): Promise<{ bestaetigt: boolean }>;
}

export const dateiablauf = registerPlugin<DateiablaufPlugin>('Dateiablauf');

function nichtVerfuegbar(): PlattformFehler {
  return new PlattformFehler('nicht-verfuegbar', 'Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.');
}

/** Die App teilt dieselbe Sperre zwischen Ausgabe, Import und Bestätigung. */
export function erzeugeNativeAuftragsSperre() {
  let belegt = false;
  let geschlossen = false;
  return {
    async ausfuehren<T>(aktion: () => Promise<T>): Promise<T> {
      if (belegt || geschlossen) throw nichtVerfuegbar();
      belegt = true;
      try {
        const ergebnis = await aktion();
        // Ein abgebauter Gastgeber übernimmt keine verspäteten Ergebnisse.
        if (geschlossen) throw nichtVerfuegbar();
        return ergebnis;
      } finally {
        belegt = false;
      }
    },
    dispose() { geschlossen = true; },
  };
}
export type NativeAuftragsSperre = ReturnType<typeof erzeugeNativeAuftragsSperre>;

export function transportFehler(error: unknown, fallback: string, fallbackCode: Fehlercode = 'schreiben'): PlattformFehler {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const { code, message } = error;
    if (typeof code === 'string' && typeof message === 'string' && message.trim() !== '') {
      const bekannt = FEHLERCODES.find(wert => wert === code);
      // DateiablaufFehler liefert ausschließlich eigene deutsche Texte und enthält
      // bei data.zielrestMoeglich bereits den Hinweis auf einen möglichen Zielrest.
      if (bekannt) return new PlattformFehler(bekannt, message);
    }
  }
  return new PlattformFehler(fallbackCode, fallback);
}
