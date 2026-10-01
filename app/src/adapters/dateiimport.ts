import {
  MAX_PROJEKT_BYTES, PlattformFehler, pruefeProjektGroesse,
  type DateiImport, type Plattform,
} from '@baremos/fristenrechner-ui/ui';
import {
  dateiablauf, erzeugeNativeAuftragsSperre, transportFehler,
  type DateiablaufPlugin, type NativeAuftragsSperre,
} from './dateiablauf-vertrag';

function hatGenauFelder(wert: unknown, felder: readonly string[]): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
    && Reflect.ownKeys(wert).length === felder.length
    && felder.every(feld => Object.prototype.hasOwnProperty.call(wert, feld));
}

export function erzeugeNativeProjektEingabe(
  plugin: DateiablaufPlugin = dateiablauf,
  sperre: NativeAuftragsSperre = erzeugeNativeAuftragsSperre(),
): Pick<Plattform, 'import' | 'zuruecksetzenBestaetigen'> {
  const dateiImport: DateiImport = {
    async waehlen(vorgabe) {
      try {
        return await sperre.ausfuehren(async () => {
          const maxBytes = vorgabe.maxBytes;
          if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new Error();
          const grenze = Math.min(MAX_PROJEKT_BYTES, maxBytes);
          const ergebnis: unknown = await plugin.projektWaehlen();
          if (hatGenauFelder(ergebnis, ['status']) && ergebnis.status === 'abgebrochen') {
            return { status: 'abgebrochen' as const };
          }
          if (!hatGenauFelder(ergebnis, ['status', 'name', 'text']) || ergebnis.status !== 'ok'
            || typeof ergebnis.name !== 'string' || ergebnis.name === '' || typeof ergebnis.text !== 'string') {
            throw new Error();
          }
          pruefeProjektGroesse(ergebnis.text, grenze);
          return { status: 'ok' as const, wert: { name: ergebnis.name, text: ergebnis.text } };
        });
      } catch (error) {
        const fehler = transportFehler(error, 'Die Projektdatei konnte nicht gelesen werden.', 'lesen');
        // Der native Text zu zu-gross nennt die Grenzen der Ausgabe; beim Import gilt
        // derselbe Text wie im Web-Adapter und in pruefeProjektGroesse.
        throw fehler.code === 'zu-gross' ? new PlattformFehler('zu-gross', 'Die Projektdatei ist größer als 1 MiB.') : fehler;
      }
    },
  };
  return {
    import: dateiImport,
    async zuruecksetzenBestaetigen() {
      try {
        return await sperre.ausfuehren(async () => {
          const ergebnis: unknown = await plugin.zuruecksetzenBestaetigen();
          return hatGenauFelder(ergebnis, ['bestaetigt']) && ergebnis.bestaetigt === true;
        });
      } catch {
        // Auch ein nicht anzeigbarer oder gesperrter Dialog erteilt keine Zustimmung.
        return false;
      }
    },
  };
}
