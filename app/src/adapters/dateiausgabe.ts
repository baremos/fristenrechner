import {
  PlattformFehler,
  type AusgabeDatei, type AusgabeWeg, type DateiAusgabe, type DateiErgebnis,
} from '@baremos/fristenrechner-ui/ui';
import {
  dateiablauf, erzeugeNativeAuftragsSperre, transportFehler,
  type DateiablaufPlugin, type NativeAuftragsSperre,
} from './dateiablauf-vertrag';
export type { DateiablaufPlugin } from './dateiablauf-vertrag';
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

export function erzeugeNativeDateiAusgabe(
  plugin: DateiablaufPlugin = dateiablauf,
  sperre: NativeAuftragsSperre = erzeugeNativeAuftragsSperre(),
): DateiAusgabe {
  async function ausgeben(datei: AusgabeDatei, weg: AusgabeWeg): Promise<DateiErgebnis> {
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
    }
  }

  return {
    exportieren: datei => sperre.ausfuehren(() => ausgeben(datei, 'exportieren')),
    teilen: datei => sperre.ausfuehren(() => ausgeben(datei, 'teilen')),
  };
}
