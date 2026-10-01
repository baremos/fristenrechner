import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJEKT_BYTES, WEB_SPEICHERSCHLUESSEL, type AusgabeDatei } from '@baremos/fristenrechner-ui/ui';
import { erzeugeAppPlattform } from '../src/adapters/app-plattform';
import { halteAn, PluginFake, type Methode } from './dateiablauf-fake';

const vorgabe = { mime: 'application/json' as const, endungen: ['.json'] as const, maxBytes: MAX_PROJEKT_BYTES };
const datei: AusgabeDatei = { name: 'projekt.json', mime: 'application/json;charset=utf-8', bytes: new TextEncoder().encode('{}') };
const sperrFehler = { code: 'nicht-verfuegbar', message: 'Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.' };

function umgebung(plugin = new PluginFake()) {
  const werte = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string): string | null => werte.get(key) ?? null),
    setItem: vi.fn((key: string, text: string) => { werte.set(key, text); }),
    removeItem: vi.fn((key: string) => { werte.delete(key); }),
  };
  const fenster = {
    localStorage,
    confirm: vi.fn(() => { throw new Error('Die App darf keinen Web-Dialog öffnen.'); }),
  };
  const root = {
    ownerDocument: { defaultView: fenster },
    querySelector: vi.fn(() => { throw new Error('Die App darf kein Dateifeld bedienen.'); }),
  };
  const adapter = erzeugeAppPlattform(root as unknown as HTMLElement, plugin);
  return { adapter, plugin, werte, localStorage, fenster, root };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('App-Plattform: WebView-Speicher und Ortszeit', () => {
  it('liest, schreibt und entfernt unter dem unveränderten Schlüssel', async () => {
    const env = umgebung();
    expect(WEB_SPEICHERSCHLUESSEL).toBe('baremos-fristenrechner-projekt-v1');
    expect(await env.adapter.speicher.lesen()).toBeNull();
    await env.adapter.speicher.schreiben('{"projekt":1}');
    expect(await env.adapter.speicher.lesen()).toBe('{"projekt":1}');
    expect(env.localStorage.getItem).toHaveBeenLastCalledWith(WEB_SPEICHERSCHLUESSEL);
    expect(env.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(WEB_SPEICHERSCHLUESSEL, '{"projekt":1}');
    await env.adapter.speicher.entfernen();
    expect(env.localStorage.removeItem).toHaveBeenCalledExactlyOnceWith(WEB_SPEICHERSCHLUESSEL);
    expect(await env.adapter.speicher.lesen()).toBeNull();
    expect(env.plugin.aufrufe).toEqual([]);
    env.adapter.dispose();
  });

  it.each([
    ['lesen', 'getItem', 'nicht-verfuegbar', 'Der lokale Speicher konnte nicht gelesen werden.'],
    ['schreiben', 'setItem', 'kein-speicher', 'Das Projekt konnte nicht gespeichert werden.'],
    ['entfernen', 'removeItem', 'schreiben', 'Das gespeicherte Projekt konnte nicht entfernt werden.'],
  ] as const)('behält beim %s Fehlercode und Text des Web-Adapters', async (aktion, methode, code, message) => {
    const env = umgebung();
    env.localStorage[methode].mockImplementation(() => { throw new Error('/private/probe'); });
    const lauf = aktion === 'schreiben' ? env.adapter.speicher.schreiben('{}') : env.adapter.speicher[aktion]();
    await expect(lauf).rejects.toMatchObject({ name: 'PlattformFehler', code, message });
    env.adapter.dispose();
  });

  it.each([
    ['lesen', 'nicht-verfuegbar', 'Der lokale Speicher konnte nicht gelesen werden.'],
    ['schreiben', 'kein-speicher', 'Das Projekt konnte nicht gespeichert werden.'],
    ['entfernen', 'schreiben', 'Das gespeicherte Projekt konnte nicht entfernt werden.'],
  ] as const)('fängt beim %s auch einen gesperrten localStorage-Zugriff ab', async (aktion, code, message) => {
    const env = umgebung();
    Object.defineProperty(env.fenster, 'localStorage', { get() { throw new Error('/private/probe'); } });
    const lauf = aktion === 'schreiben' ? env.adapter.speicher.schreiben('{}') : env.adapter.speicher[aktion]();
    await expect(lauf).rejects.toMatchObject({ name: 'PlattformFehler', code, message });
    env.adapter.dispose();
  });

  it.each([MAX_PROJEKT_BYTES, MAX_PROJEKT_BYTES + 1])('prüft %i UTF-8-Bytes beim Lesen, ohne den gespeicherten Text zu ändern', async bytes => {
    const env = umgebung();
    const text = 'ä'.repeat(Math.floor(bytes / 2)) + (bytes % 2 ? 'a' : '');
    env.werte.set(WEB_SPEICHERSCHLUESSEL, text);
    if (bytes <= MAX_PROJEKT_BYTES) await expect(env.adapter.speicher.lesen()).resolves.toBe(text);
    else await expect(env.adapter.speicher.lesen()).rejects.toMatchObject({ code: 'zu-gross', message: 'Die Projektdatei ist größer als 1 MiB.' });
    expect(env.werte.get(WEB_SPEICHERSCHLUESSEL)).toBe(text);
    expect(env.localStorage.setItem).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it.each([new Date(2026, 8, 30, 0, 15, 20), new Date(2026, 0, 1, 23, 45, 30)])(
    'liefert ISO-Zeitpunkt und Kalenderfelder der Ortszeit: %s', datum => {
      vi.useFakeTimers();
      vi.setSystemTime(datum);
      const env = umgebung();
      const kalendertag = datum.getMonth() === 8 ? '2026-09-30' : '2026-01-01';
      expect(env.adapter.zeit()).toEqual({ zeitpunkt: datum.toISOString(), kalendertag });
      env.adapter.dispose();
    },
  );
});

type Weg = 'exportieren' | 'teilen' | 'importieren' | 'bestaetigen';
const wege: Weg[] = ['exportieren', 'teilen', 'importieren', 'bestaetigen'];
const methode: Record<Weg, Methode> = {
  exportieren: 'ausgabeBeginnen', teilen: 'ausgabeBeginnen', importieren: 'projektWaehlen', bestaetigen: 'zuruecksetzenBestaetigen',
};
function starten(adapter: ReturnType<typeof erzeugeAppPlattform>, weg: Weg) {
  if (weg === 'importieren') return adapter.import.waehlen(vorgabe);
  if (weg === 'bestaetigen') return adapter.zuruecksetzenBestaetigen();
  return weg === 'teilen' ? adapter.ausgabe.teilen!(datei) : adapter.ausgabe.exportieren(datei);
}

describe('App-Plattform: Komposition und gemeinsame native Sperre', () => {
  it('öffnet Import und Bestätigung ausschließlich nativ, ohne Klick auf das Importelement', async () => {
    const env = umgebung();
    await expect(env.adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'ok', wert: { name: 'projekt.json', text: '{}' } });
    await expect(env.adapter.zuruecksetzenBestaetigen()).resolves.toBe(true);
    expect(env.root.querySelector).not.toHaveBeenCalled();
    expect(env.fenster.confirm).not.toHaveBeenCalled();
    expect(env.plugin.aufrufe).toEqual(['projektWaehlen', 'zuruecksetzenBestaetigen']);
    env.adapter.dispose();
  });

  it.each(wege.flatMap(erster => wege.map(zweiter => ({ erster, zweiter })) ))(
    'sperrt $zweiter, während $erster wartet, und lässt danach wieder Aufträge zu', async ({ erster, zweiter }) => {
      const env = umgebung();
      const halt = halteAn(env.plugin, methode[erster]);
      const ersterLauf = starten(env.adapter, erster);
      await halt.erreicht;
      if (zweiter === 'bestaetigen') await expect(starten(env.adapter, zweiter)).resolves.toBe(false);
      else await expect(starten(env.adapter, zweiter)).rejects.toMatchObject(sperrFehler);
      expect(env.plugin.aufrufe).toEqual([methode[erster]]);
      halt.weiter.erfuellen();
      if (erster === 'bestaetigen') await expect(ersterLauf).resolves.toBe(true);
      else await expect(ersterLauf).resolves.toMatchObject({ status: 'ok' });
      env.plugin.eingriff = () => {};
      if (zweiter === 'bestaetigen') await expect(starten(env.adapter, zweiter)).resolves.toBe(true);
      else await expect(starten(env.adapter, zweiter)).resolves.toMatchObject({ status: 'ok' });
      env.adapter.dispose();
    },
  );

  it.each(['importieren', 'bestaetigen'] as const)('hält die Sperre gegen %s bis zum Ende des Verwerfens', async zweiter => {
    const env = umgebung();
    const halt = halteAn(env.plugin, 'ausgabeVerwerfen');
    const warten = env.plugin.eingriff;
    env.plugin.eingriff = async aktuell => {
      if (aktuell === 'ausgabeBlock') throw { code: 'kein-speicher', message: 'Der Zwischenspeicher für Dateien ist voll. Bitte versuchen Sie es später erneut.' };
      await warten(aktuell);
    };
    const lauf = env.adapter.ausgabe.exportieren(datei).catch(error => error);
    await halt.erreicht;
    const aufrufe = [...env.plugin.aufrufe];
    if (zweiter === 'bestaetigen') await expect(starten(env.adapter, zweiter)).resolves.toBe(false);
    else await expect(starten(env.adapter, zweiter)).rejects.toMatchObject(sperrFehler);
    expect(env.plugin.aufrufe).toEqual(aufrufe);
    halt.weiter.erfuellen();
    expect(await lauf).toMatchObject({ code: 'kein-speicher' });
    env.plugin.eingriff = () => {};
    expect((await env.adapter.import.waehlen(vorgabe)).status).toBe('ok');
    env.adapter.dispose();
  });

  it('sperrt nach dispose neue native Aufträge und bestätigt niemals ein Zurücksetzen', async () => {
    const env = umgebung();
    env.adapter.dispose();
    env.adapter.dispose();
    for (const weg of wege) {
      if (weg === 'bestaetigen') await expect(starten(env.adapter, weg)).resolves.toBe(false);
      else await expect(starten(env.adapter, weg)).rejects.toMatchObject(sperrFehler);
    }
    expect(env.plugin.aufrufe).toEqual([]);
  });

  it.each(['importieren', 'bestaetigen'] as const)('übernimmt nach dispose kein verspätetes Ergebnis beim %s', async weg => {
    const env = umgebung();
    const halt = halteAn(env.plugin, methode[weg]);
    const lauf = starten(env.adapter, weg);
    await halt.erreicht;
    env.adapter.dispose();
    halt.weiter.erfuellen();
    if (weg === 'bestaetigen') await expect(lauf).resolves.toBe(false);
    else await expect(lauf).rejects.toMatchObject(sperrFehler);
  });
});
