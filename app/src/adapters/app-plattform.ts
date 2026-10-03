import { erzeugeWebSpeicher, webZeit, type Plattform } from '@baremos/fristenrechner-ui/ui';
import { dateiablauf, erzeugeNativeAuftragsSperre, type DateiablaufPlugin } from './dateiablauf-vertrag';
import { erzeugeNativeDateiAusgabe } from './dateiausgabe';
import { erzeugeNativeProjektEingabe } from './dateiimport';
import { erzeugeMenueZurueck, menueZurueck, type MenueZurueckPlugin } from './menue-zurueck';

/** Der Gastgeber besitzt den Adapter und beendet seine nativen Wege mit dispose. */
export function erzeugeAppPlattform(root: HTMLElement, plugin: DateiablaufPlugin = dateiablauf,
  zurueckPlugin: MenueZurueckPlugin = menueZurueck): Plattform & { dispose(): void } {
  const doc = root.ownerDocument;
  const fenster = doc.defaultView!;
  const sperre = erzeugeNativeAuftragsSperre();
  const zurueck = erzeugeMenueZurueck(zurueckPlugin);
  let beendet = false;
  const eingabe = erzeugeNativeProjektEingabe(plugin, sperre, () => {
    const aktiv = doc.activeElement as HTMLElement | null;
    return () => {
      // Der native Dialog kann den Bedienungshilfen-Fokus auf die WebView legen,
      // obwohl der DOM-Fokus unverändert blieb. Nur dieses Ziel erneut melden.
      try {
        if (!beendet && aktiv?.isConnected && doc.activeElement === aktiv
          && aktiv !== doc.body && aktiv !== doc.documentElement
          && typeof aktiv.blur === 'function' && typeof aktiv.focus === 'function') {
          aktiv.blur();
          // Ein blur-Handler darf inzwischen ein anderes Ziel gewählt haben.
          if (!beendet && aktiv.isConnected && doc.activeElement === doc.body) aktiv.focus({ preventScroll: true });
        }
      } catch { /* Eine fehlgeschlagene Fokusmeldung ändert die Dialogentscheidung nicht. */ }
    };
  });
  return {
    zurueck,
    speicher: erzeugeWebSpeicher(fenster),
    zeit: webZeit,
    ausgabe: erzeugeNativeDateiAusgabe(plugin, sperre),
    ...eingabe,
    dispose() { beendet = true; sperre.dispose(); zurueck.dispose(); },
  };
}
