import { erzeugeWebSpeicher, webZeit, type Plattform } from '@baremos/fristenrechner-ui/ui';
import { dateiablauf, erzeugeNativeAuftragsSperre, type DateiablaufPlugin } from './dateiablauf-vertrag';
import { erzeugeNativeDateiAusgabe } from './dateiausgabe';
import { erzeugeNativeProjektEingabe } from './dateiimport';
import { erzeugeMenueZurueck, menueZurueck, type MenueZurueckPlugin } from './menue-zurueck';

/** Der Gastgeber besitzt den Adapter und beendet seine nativen Wege mit dispose. */
export function erzeugeAppPlattform(root: HTMLElement, plugin: DateiablaufPlugin = dateiablauf,
  zurueckPlugin: MenueZurueckPlugin = menueZurueck): Plattform & { dispose(): void } {
  const fenster = root.ownerDocument.defaultView!;
  const sperre = erzeugeNativeAuftragsSperre();
  const zurueck = erzeugeMenueZurueck(zurueckPlugin);
  return {
    zurueck,
    speicher: erzeugeWebSpeicher(fenster),
    zeit: webZeit,
    ausgabe: erzeugeNativeDateiAusgabe(plugin, sperre),
    ...erzeugeNativeProjektEingabe(plugin, sperre),
    dispose() { sperre.dispose(); zurueck.dispose(); },
  };
}
