import { describe, expect, it, vi } from 'vitest';
import type { PluginListenerHandle } from '@capacitor/core';
import { erzeugeMenueZurueck, type MenueZurueckPlugin } from '../src/adapters/menue-zurueck';
import { erzeugeAppPlattform } from '../src/adapters/app-plattform';
import { PluginFake } from './dateiablauf-fake';

function tor() {
  let weiter!: () => void;
  const promise = new Promise<void>(resolve => { weiter = resolve; });
  return { promise, weiter };
}
class MenueFake implements MenueZurueckPlugin {
  aufrufe: { aktiv: boolean; folge: number }[] = [];
  reihenfolge: string[] = [];
  empfangen?: (e: { folge: number }) => void;
  registrierung?: Promise<void>;
  antwort?: Promise<void>;
  registrierFehler = false;
  setzenFehler = false;
  remove = vi.fn(async () => {});
  async addListener(name: 'zurueck', fn: (e: { folge: number }) => void): Promise<PluginListenerHandle> {
    expect(name).toBe('zurueck');
    this.reihenfolge.push('registrieren');
    if (this.registrierFehler) throw new Error('Brückenfehler');
    this.empfangen = fn;
    await this.registrierung;
    this.reihenfolge.push('registriert');
    return { remove: this.remove };
  }
  async setzen(wert: { aktiv: boolean; folge: number }): Promise<void> {
    expect(Reflect.ownKeys(wert).sort()).toEqual(['aktiv', 'folge']);
    expect(typeof wert.aktiv).toBe('boolean');
    expect(Number.isSafeInteger(wert.folge) && wert.folge >= 1).toBe(true);
    expect(wert.folge).toBeGreaterThan(this.aufrufe[this.aufrufe.length - 1]?.folge ?? 0);
    this.aufrufe.push(wert);
    this.reihenfolge.push(`setzen:${wert.folge}`);
    await this.antwort;
    if (this.setzenFehler) throw new Error('Brückenfehler');
  }
  sende(folge: number) { this.empfangen?.({ folge }); }
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('Menü-Zurück', () => {
  it('registriert erst bei der ersten Aktivierung und bestätigt den Listener vorher', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), halt = tor();
    const ab = a.beobachten(() => {});
    expect(p.reihenfolge).toEqual([]);
    p.registrierung = halt.promise;
    const lauf = a.setzen(true);
    await tick(); expect(p.aufrufe).toEqual([]);
    halt.weiter(); await lauf;
    await a.setzen(false); await a.setzen(true);
    expect(p.reihenfolge).toEqual(['registrieren', 'registriert', 'setzen:1', 'setzen:2', 'setzen:3']);
    ab(); a.dispose(); await tick();
    expect(p.aufrufe).toEqual([{ aktiv: true, folge: 1 }, { aktiv: false, folge: 2 }, { aktiv: true, folge: 3 }, { aktiv: false, folge: 4 }]);
    expect(p.remove).toHaveBeenCalledTimes(1);
  });

  it('setzt die Folge desselben Plugins in einer neuen Adapterinstanz fort', async () => {
    // Java nimmt bis zum Dokumentwechsel nur höhere Folgen an.
    const p = new MenueFake(), erste = erzeugeMenueZurueck(p);
    await erste.setzen(true); await erste.setzen(false); erste.dispose(); await tick();
    const zweite = erzeugeMenueZurueck(p), ereignis = vi.fn();
    zweite.beobachten(ereignis);
    await zweite.setzen(true);
    expect(p.aufrufe.map(a => a.folge)).toEqual([1, 2, 3, 4]);
    p.sende(4); await tick();
    expect(ereignis).toHaveBeenCalledTimes(1);
    zweite.dispose(); await tick();
    expect(p.aufrufe[p.aufrufe.length - 1]).toEqual({ aktiv: false, folge: 5 });
  });

  it('verwirft eine während der Registrierung geschlossene Öffnung', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), halt = tor(); p.registrierung = halt.promise;
    const lauf = a.setzen(true);
    await a.setzen(false);
    halt.weiter(); await lauf;
    expect(p.aufrufe).toEqual([{ aktiv: false, folge: 2 }]);
  });

  it('registriert bei überlappenden Öffnungen einmal und sendet nur die aktuelle Folge', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), halt = tor(); p.registrierung = halt.promise;
    const erster = a.setzen(true), zweiter = a.setzen(true);
    halt.weiter(); await Promise.all([erster, zweiter]);
    expect(p.aufrufe).toEqual([{ aktiv: true, folge: 2 }]);
    expect(p.reihenfolge.filter(x => x === 'registrieren')).toHaveLength(1);
  });

  it('nimmt ein aktuelles Ereignis schon vor der setzen-Antwort genau einmal an', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), fn = vi.fn(), halt = tor(); p.antwort = halt.promise;
    a.beobachten(fn); const lauf = a.setzen(true); await tick();
    p.sende(1); p.sende(1); expect(fn).toHaveBeenCalledTimes(1);
    halt.weiter(); await lauf; p.sende(1); expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignoriert späte, zukünftige, doppelte und inaktive Ereignisse', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), fn = vi.fn(); a.beobachten(fn);
    await a.setzen(true); await a.setzen(false); p.sende(1); p.sende(2);
    await a.setzen(true); p.sende(1); p.sende(4); expect(fn).not.toHaveBeenCalled();
    p.sende(3); p.sende(3); expect(fn).toHaveBeenCalledTimes(1);
    await a.setzen(true); p.sende(3); p.sende(4); expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([null, undefined, {}, { folge: '1' }, { folge: 1, extra: true }, [], { folge: NaN }])('ignoriert ungültige Ereignisse: %j', async wert => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), fn = vi.fn(); a.beobachten(fn); await a.setzen(true);
    p.empfangen?.(wert as { folge: number }); expect(fn).not.toHaveBeenCalled();
    p.sende(1); expect(fn).toHaveBeenCalledTimes(1);
  });

  it('meldet Beobachter ab und lässt einen werfenden Beobachter nicht dazwischenkommen', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), weg = vi.fn(), fn = vi.fn();
    a.beobachten(() => { throw new Error('Beobachter'); }); a.beobachten(weg)(); a.beobachten(fn);
    await a.setzen(true); p.sende(1); expect(weg).not.toHaveBeenCalled(); expect(fn).toHaveBeenCalledOnce();
  });

  it.each([false, true])('dispose während Registrierung: Fehler beim Abmelden %s', async fehler => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), halt = tor(), fn = vi.fn();
    if (fehler) p.remove.mockRejectedValue(new Error('Brücke'));
    p.registrierung = halt.promise; a.beobachten(fn); const lauf = a.setzen(true);
    a.dispose(); a.dispose(); halt.weiter(); await lauf; await tick();
    await a.setzen(true); a.beobachten(fn); p.sende(1);
    expect(p.aufrufe).toEqual([{ aktiv: false, folge: 2 }]);
    expect(p.remove).toHaveBeenCalledTimes(1); expect(fn).not.toHaveBeenCalled();
  });

  it('dispose deaktiviert sofort auch bei ausstehender Aktivierungsantwort', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), halt = tor(), fn = vi.fn();
    p.antwort = halt.promise; a.beobachten(fn); const lauf = a.setzen(true); await tick();
    a.dispose(); p.sende(1); halt.weiter(); await lauf; await tick(); await a.setzen(true);
    expect(p.aufrufe).toEqual([{ aktiv: true, folge: 1 }, { aktiv: false, folge: 2 }]);
    expect(fn).not.toHaveBeenCalled(); expect(p.remove).toHaveBeenCalledTimes(1);
  });

  it('fängt eine gescheiterte Registrierung ab und kann sie erneut versuchen', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p); p.registrierFehler = true;
    await expect(a.setzen(true)).resolves.toBeUndefined(); expect(p.aufrufe).toEqual([]);
    p.registrierFehler = false; await a.setzen(true);
    expect(p.aufrufe).toEqual([{ aktiv: true, folge: 2 }]);
  });

  it('fängt auch synchrones Werfen der Brücke ab', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p);
    p.addListener = () => { throw new Error('Brücke'); };
    await expect(a.setzen(true)).resolves.toBeUndefined();
    p.setzen = () => { throw new Error('Brücke'); };
    await expect(a.setzen(false)).resolves.toBeUndefined(); a.dispose(); await tick();
  });

  it('fängt setzen- und Abmeldefehler ohne Projektfehler ab', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), fn = vi.fn(); a.beobachten(fn);
    p.setzenFehler = true; p.remove.mockRejectedValue(new Error('Brücke'));
    await expect(a.setzen(true)).resolves.toBeUndefined(); p.sende(1);
    expect(fn).not.toHaveBeenCalled();
    await expect(a.setzen(false)).resolves.toBeUndefined(); a.dispose(); await tick();
    expect(p.remove).toHaveBeenCalledOnce();
  });

  it('eine späte Fehlerantwort setzt eine neuere Öffnung nicht außer Kraft', async () => {
    const p = new MenueFake(), a = erzeugeMenueZurueck(p), fn = vi.fn(), halt = tor(); a.beobachten(fn);
    const original = p.setzen.bind(p);
    p.setzen = async wert => { await original(wert); if (wert.folge === 1) { await halt.promise; throw new Error('Spät'); } };
    const lauf = a.setzen(true); await tick(); await a.setzen(true); halt.weiter(); await lauf;
    p.sende(2); expect(fn).toHaveBeenCalledOnce();
  });

  it('die App komponiert und beendet den Menüadapter', async () => {
    const p = new MenueFake();
    const root = { ownerDocument: { defaultView: {} } } as unknown as HTMLElement;
    const app = erzeugeAppPlattform(root, new PluginFake(), p);
    expect(app.zurueck).toBeDefined(); expect(p.reihenfolge).toEqual([]);
    await app.zurueck!.setzen(true); app.dispose(); await tick();
    expect(p.aufrufe).toEqual([{ aktiv: true, folge: 1 }, { aktiv: false, folge: 2 }]);
    expect(p.remove).toHaveBeenCalledOnce();
  });
});
