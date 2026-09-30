import { registerPlugin } from '@capacitor/core';
import {
  FEHLERCODES, PlattformFehler,
  type AusgabeDatei, type AusgabeWeg, type DateiAusgabe, type DateiErgebnis,
} from '@baremos/fristenrechner-ui/ui';

/** Ausschließlich der native Transportvertrag; keine Dateipfade oder Inhalte in Meldungen. */
export interface DateiablaufPlugin {
  ausgabeBeginnen(vorgabe: { name: string; mime: AusgabeDatei['mime']; anzahlBytes: number }): Promise<{ auftragId: string }>;
  ausgabeBlock(block: { auftragId: string; offset: number; base64: string }): Promise<void>;
  ausgabeAbschliessen(auftrag: { auftragId: string }): Promise<void>;
  speichernUnter(auftrag: { auftragId: string }): Promise<{ status: 'ok' | 'abgebrochen' }>;
  teilen(auftrag: { auftragId: string }): Promise<{ status: 'bereitgestellt' }>;
  ausgabeVerwerfen(auftrag: { auftragId: string }): Promise<void>;
}

const dateiablauf = registerPlugin<DateiablaufPlugin>('Dateiablauf');
const BLOCK_BYTES = 65_536;
const grenzen = {
  'application/pdf': 2 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 1024 * 1024,
  'application/json;charset=utf-8': 1024 * 1024,
} satisfies Record<AusgabeDatei['mime'], number>;
const namen = {
  'application/pdf': 'PDF-Datei',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel-Datei',
  'application/json;charset=utf-8': 'Projektdatei',
} satisfies Record<AusgabeDatei['mime'], string>;

/** Kodiert nur den aktuellen Block, ohne Binärstring, Argumentstapel oder neuere Web-APIs. */
function base64Block(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    text += alphabet[a >>> 2]! + alphabet[((a & 3) << 4) | (b >>> 4)]!
      + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >>> 6)]! : '=')
      + (i + 2 < bytes.length ? alphabet[c & 63]! : '=');
  }
  return text;
}

function transportFehler(error: unknown, fallback: string): PlattformFehler {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const { code, message } = error;
    if (typeof code === 'string' && typeof message === 'string' && message.trim() !== '') {
      const bekannt = FEHLERCODES.find(wert => wert === code);
      // DateiablaufFehler liefert ausschließlich eigene deutsche Texte und enthält
      // bei data.zielrestMoeglich bereits den Hinweis auf einen möglichen Zielrest.
      if (bekannt) return new PlattformFehler(bekannt, message);
    }
  }
  return new PlattformFehler('schreiben', fallback);
}

export function erzeugeNativeDateiAusgabe(plugin: DateiablaufPlugin = dateiablauf): DateiAusgabe {
  let belegt = false;

  async function ausgeben(datei: AusgabeDatei, weg: AusgabeWeg): Promise<DateiErgebnis> {
    if (belegt) {
      throw new PlattformFehler('nicht-verfuegbar', 'Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.');
    }
    belegt = true;
    let auftragId: string | undefined;
    const fallback = `Die ${namen[datei.mime]} konnte nicht zum ${weg === 'teilen' ? 'Teilen' : 'Speichern'} bereitgestellt werden. Bitte versuchen Sie es erneut.`;
    try {
      if (datei.bytes.byteLength > grenzen[datei.mime]) {
        throw new PlattformFehler('zu-gross', 'Die Datei ist zu groß. Erlaubt sind höchstens 2 MiB für PDF und 1 MiB für Excel- und Projektdateien.');
      }
      if (datei.bytes.byteLength === 0) throw new PlattformFehler('schreiben', fallback);
      // Der Auftrag behält auch bei späteren Änderungen des Aufrufers seine Bytes.
      const bytes = datei.bytes.slice();
      const beginn = await plugin.ausgabeBeginnen({ name: datei.name, mime: datei.mime, anzahlBytes: bytes.byteLength });
      if (typeof beginn?.auftragId !== 'string' || beginn.auftragId === '') throw new Error();
      auftragId = beginn.auftragId;
      for (let offset = 0; offset < bytes.byteLength; offset += BLOCK_BYTES) {
        const base64 = base64Block(bytes.subarray(offset, offset + BLOCK_BYTES));
        await plugin.ausgabeBlock({ auftragId, offset, base64 });
      }
      await plugin.ausgabeAbschliessen({ auftragId });
      if (weg === 'exportieren') {
        const ergebnis = await plugin.speichernUnter({ auftragId });
        if (ergebnis?.status !== 'ok' && ergebnis?.status !== 'abgebrochen') throw new Error();
        return { status: ergebnis.status };
      }
      const ergebnis = await plugin.teilen({ auftragId });
      if (ergebnis?.status !== 'bereitgestellt') throw new Error();
      return { status: 'ok' };
    } catch (error) {
      if (auftragId !== undefined) {
        try { await plugin.ausgabeVerwerfen({ auftragId }); }
        catch { /* Der ursprüngliche Fehler bleibt maßgeblich. */ }
      }
      throw transportFehler(error, fallback);
    } finally {
      belegt = false;
    }
  }

  return {
    exportieren: datei => ausgeben(datei, 'exportieren'),
    teilen: datei => ausgeben(datei, 'teilen'),
  };
}
