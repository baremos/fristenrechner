import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { MenueZurueck } from '@baremos/fristenrechner-ui/ui';

export interface MenueZurueckPlugin {
  setzen(vorgabe: { aktiv: boolean; folge: number }): Promise<void>;
  addListener(name: 'zurueck', fn: (ereignis: { folge: number }) => void): Promise<PluginListenerHandle>;
}
export const menueZurueck = registerPlugin<MenueZurueckPlugin>('MenueZurueck');

/** Erst bei Verwendung registrieren; Brückenfehler verändern keine Projektdaten. */
export function erzeugeMenueZurueck(plugin: MenueZurueckPlugin = menueZurueck): MenueZurueck {
  let folge = 0;
  let aktiv = false;
  let beendet = false;
  let registrierung: Promise<void> | undefined;
  let listener: PluginListenerHandle | undefined;
  const beobachter = new Set<() => void>();

  async function abmelden(handle: PluginListenerHandle): Promise<void> {
    try { await handle.remove(); }
    catch { /* Auch bei Brückenfehlern bleiben späte Ereignisse wirkungslos. */ }
  }

  function empfangen(ereignis: { folge: number }): void {
    if (beendet || !aktiv || typeof ereignis !== 'object' || ereignis === null
      || Reflect.ownKeys(ereignis).length !== 1 || !Number.isSafeInteger(ereignis.folge)
      || ereignis.folge !== folge) return;
    aktiv = false;
    for (const fn of [...beobachter]) {
      if (beendet || !beobachter.has(fn)) continue;
      try { fn(); } catch { /* Ein Beobachter darf die übrigen nicht unterbrechen. */ }
    }
  }

  async function registrieren(): Promise<void> {
    if (!registrierung) {
      registrierung = plugin.addListener('zurueck', empfangen).then(async handle => {
        if (beendet) await abmelden(handle);
        else listener = handle;
      });
    }
    try { await registrierung; }
    catch (error) { registrierung = undefined; throw error; }
  }

  async function uebertragen(aktiv: boolean, folge: number): Promise<void> {
    try {
      if (aktiv) {
        await registrieren();
        if (beendet || folge !== aktuelleFolge()) return;
      }
      await plugin.setzen({ aktiv, folge });
    } catch {
      // Keine Projektfehlermeldung und kein abgelehntes Promise für den Gastgeber.
      // Öffnen/Schließen bleibt unabhängig von der Bestätigung der Brücke.
      if (folge === aktuelleFolge()) deaktivieren();
    }
  }
  const aktuelleFolge = () => folge;
  const deaktivieren = () => { aktiv = false; };

  return {
    async setzen(wert) {
      if (beendet || folge === Number.MAX_SAFE_INTEGER) return;
      aktiv = wert;
      await uebertragen(wert, ++folge);
    },
    beobachten(fn) {
      if (!beendet) beobachter.add(fn);
      return () => { beobachter.delete(fn); };
    },
    dispose() {
      if (beendet) return;
      beendet = true;
      aktiv = false;
      beobachter.clear();
      if (folge < Number.MAX_SAFE_INTEGER) void uebertragen(false, ++folge);
      if (listener) { void abmelden(listener); listener = undefined; }
    },
  };
}
