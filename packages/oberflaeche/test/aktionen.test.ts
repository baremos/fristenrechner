import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erstelleProjektDatei } from '@baremos/fristenrechner-kern';
import {
  initFristenrechner, erzeugeWebPlattform, webExportInhalt, webTexte,
  type Auswahl, type DateiAktion, type DateiAktionsZustand, type DateiErgebnis, type Plattform, type RechnerAktionen,
} from '@baremos/fristenrechner-ui/ui';
import { beispiel } from './beispiel';
import { erstelleTestDom, TestElement, TestInput, TestSelect } from './ui-testdom';
import * as pdfModul from '../src/fristenrechner-export-pdf';
import * as excelModul from '../src/fristenrechner-export-excel';

const zeit = { zeitpunkt: '2026-09-30T10:00:00.000Z', kalendertag: '2026-09-30' };
const aufraeumen: (() => void)[] = [];
const meldungen = ['export-message', 'excel-message', 'pdf-message', 'import-message', 'reset-message'];
const dateiAktionen: { id: string; aktion: DateiAktion }[] = [
  ...(['exportieren', 'teilen'] as const).flatMap(weg => (['projekt', 'excel', 'pdf'] as const).map(format => ({
    id: weg === 'teilen' ? 'share-' + (format === 'projekt' ? 'json' : format) : format === 'projekt' ? 'save-json' : 'export-' + format,
    aktion: { art: 'ausgabe' as const, format, weg },
  }))),
  { id: 'open-json', aktion: { art: 'import' } }, { id: 'reset-project', aktion: { art: 'neues-projekt' } },
];
function aufrufen(api: RechnerAktionen, aktion: DateiAktion): Promise<void> {
  return aktion.art === 'ausgabe' ? api.ausgeben(aktion.format, aktion.weg)
    : aktion.art === 'import' ? api.projektImportieren() : api.neuesProjekt();
}
function offen<T>() {
  let resolve!: (wert: T) => void; let reject!: (fehler: Error) => void;
  const promise = new Promise<T>((ok, fehler) => { resolve = ok; reject = fehler; });
  return { promise, resolve, reject };
}
const json = (name = 'Vorher') => JSON.stringify(erstelleProjektDatei(beispiel({ projekt: { projektname: name } }), zeit.zeitpunkt));
const warten = () => vi.advanceTimersByTimeAsync(0);
function vorbereiten(teilen = true) {
  const dom = erstelleTestDom();
  const fenster = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    atob: globalThis.atob, btoa: globalThis.btoa,
    matchMedia: () => ({ matches: true }), confirm: () => true,
    localStorage: { getItem: () => json(), setItem: vi.fn(), removeItem: vi.fn() },
  });
  Object.assign(dom.dokument, { defaultView: fenster });
  vi.stubGlobal('document', dom.dokument); vi.stubGlobal('window', fenster);
  vi.stubGlobal('Element', TestElement); vi.stubGlobal('HTMLInputElement', TestInput); vi.stubGlobal('HTMLSelectElement', TestSelect);
  const lesen = vi.fn(async (): Promise<string | null> => json());
  const schreiben = vi.fn(async (_text: string) => {}); const entfernen = vi.fn(async () => {});
  const waehlen = vi.fn<Plattform['import']['waehlen']>(async () => ({ status: 'ok', wert: { name: 'projekt.json', text: json('Importiert') } }));
  const exportieren = vi.fn<Plattform['ausgabe']['exportieren']>(async () => ({ status: 'ok' }));
  const teilenFn = vi.fn<NonNullable<Plattform['ausgabe']['teilen']>>(async () => ({ status: 'ok' }));
  const bestaetigen = vi.fn(async () => true);
  const plattform: Plattform = {
    speicher: { lesen, schreiben, entfernen }, import: { waehlen },
    ausgabe: { exportieren, ...(teilen ? { teilen: teilenFn } : {}) },
    zeit: vi.fn(() => zeit), zuruecksetzenBestaetigen: bestaetigen,
  };
  const start = () => {
    const instanz = initFristenrechner(dom.root as unknown as HTMLElement, { plattform, texte: webTexte, exportInhalt: webExportInhalt });
    aufraeumen.push(() => instanz.dispose()); return instanz;
  };
  const anzahl = () => exportieren.mock.calls.length + teilenFn.mock.calls.length + waehlen.mock.calls.length + bestaetigen.mock.calls.length;
  const status = () => meldungen.map(id => dom.el(id).textContent);
  return { ...dom, fenster, plattform, lesen, schreiben, entfernen, waehlen, exportieren, teilenFn, bestaetigen, start, anzahl, status };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(zeit.zeitpunkt)); });
afterEach(async () => {
  aufraeumen.splice(0).reverse().forEach(fn => fn()); await warten();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('Öffentliche Aktionen und bisherige Schaltflächen', () => {
  it.each(dateiAktionen)('$id liefert über beide Wege dieselben Bytes, Daten, Zeiten und Statusregionen', async ({ id, aktion }) => {
    const ergebnisse = [];
    for (const weg of ['ui', 'api']) {
      let zufall = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => 0.25 + (++zufall) / 1000000);
      const env = vorbereiten(); const instanz = env.start(); await warten();
      const pdf = vi.spyOn(pdfModul, 'pdfAlsDatei'); pdf.mockClear();
      const excel = vi.spyOn(excelModul, 'excelAlsDatei'); excel.mockClear();
      vi.mocked(env.plattform.zeit).mockClear();
      if (weg === 'ui') env.click(id); else void aufrufen(instanz.aktionen, aktion);
      expect(instanz.aktionen.zustand().beschaeftigt).toBe(true);
      const fortschritt = env.status(); const knopf = env.el(id).textContent;
      await vi.waitFor(() => expect(instanz.aktionen.zustand().beschaeftigt).toBe(false));
      if (aktion.art === 'ausgabe' && aktion.format === 'pdf') await expect(pdf.mock.results[0]!.value).resolves.toHaveProperty('bytes');
      expect(env.anzahl()).toBe(1);
      if (aktion.art === 'ausgabe') {
        expect(env.plattform.zeit).toHaveBeenCalledTimes(1);
        expect(env.schreiben).not.toHaveBeenCalled();
        expect(env.entfernen).not.toHaveBeenCalled();
        if (aktion.format === 'pdf') expect(pdf).toHaveBeenCalledTimes(1);
        if (aktion.format === 'excel') expect(excel).toHaveBeenCalledTimes(1);
      }
      ergebnisse.push({
        ausgaben: env.exportieren.mock.calls, teilen: env.teilenFn.mock.calls,
        importe: env.waehlen.mock.calls, bestaetigungen: env.bestaetigen.mock.calls,
        schreiben: env.schreiben.mock.calls, entfernen: env.entfernen.mock.calls,
        pdf: pdf.mock.calls, excel: excel.mock.calls,
        zeiten: vi.mocked(env.plattform.zeit).mock.results, status: env.status(), fortschritt, knopf,
        formular: env.root.querySelectorAll('input,select').map(feld => [feld.name, feld.value, feld.checked]),
      });
      instanz.dispose(); await warten();
    }
    expect(ergebnisse[1]).toEqual(ergebnisse[0]);
  });

  for (const startweg of ['ui', 'api']) {
    for (const ende of ['Erfolg', 'Abbruch', 'Fehler']) {
      it.each(dateiAktionen)(`${startweg}: $id sperrt UI und API bis ${ende} und gibt danach frei`, async ({ id, aktion }) => {
        const env = vorbereiten();
        const ausgabe = offen<DateiErgebnis>(); const auswahl = offen<Auswahl<{ name: string; text: string }>>(); const bestaetigung = offen<boolean>();
        env.exportieren.mockReturnValue(ausgabe.promise); env.teilenFn.mockReturnValue(ausgabe.promise);
        env.waehlen.mockReturnValue(auswahl.promise); env.bestaetigen.mockReturnValue(bestaetigung.promise);
        const { aktionen } = env.start(); await warten();
        meldungen.forEach(id => { env.el(id).textContent = 'Vorher ' + id; });
        if (startweg === 'ui') env.click(id); else void aufrufen(aktionen, aktion);
        await vi.waitFor(() => expect(env.anzahl()).toBe(1));
        const status = env.status();
        for (const andere of dateiAktionen) {
          expect(aktionen.istErlaubt(andere.aktion)).toBe(false);
          await expect(aufrufen(aktionen, andere.aktion)).resolves.toBeUndefined();
          if (andere.id === 'open-json') expect(env.click(andere.id)).toBe(false);
          else { expect(env.el(andere.id).disabled).toBe(true); env.click(andere.id); }
        }
        await warten(); expect(env.anzahl()).toBe(1); expect(env.status()).toEqual(status);
        if (ende === 'Fehler') {
          const lauf = aktion.art === 'ausgabe' ? ausgabe : aktion.art === 'import' ? auswahl : bestaetigung;
          lauf.reject(new Error('Probe'));
        } else {
          ausgabe.resolve({ status: ende === 'Abbruch' ? 'abgebrochen' : 'ok' });
          auswahl.resolve(ende === 'Abbruch' ? { status: 'abgebrochen' } : { status: 'ok', wert: { name: 'projekt.json', text: json('Neu') } });
          bestaetigung.resolve(ende === 'Erfolg');
        }
        await vi.waitFor(() => expect(aktionen.zustand().beschaeftigt).toBe(false));
        if (ende === 'Abbruch') expect(env.status()).toEqual(meldungen.map(id => 'Vorher ' + id));
        for (const andere of dateiAktionen) expect(aktionen.istErlaubt(andere.aktion)).toBe(true);
        env.exportieren.mockResolvedValue({ status: 'ok' });
        if (startweg === 'ui') await aktionen.ausgeben('projekt', 'exportieren'); else { env.click('save-json'); await warten(); }
        expect(env.anzahl()).toBe(2);
      });
    }
  }

  it('lässt während des Ladens und ohne Teilen-Fähigkeit keine unzulässige Aktion beginnen', async () => {
    const env = vorbereiten(false); const laden = offen<string | null>(); env.lesen.mockReturnValue(laden.promise);
    const { aktionen } = env.start(); const vorher = env.status();
    for (const { id, aktion } of dateiAktionen) {
      expect(aktionen.istErlaubt(aktion)).toBe(false); await aufrufen(aktionen, aktion);
      if (!id.startsWith('share-')) env.click(id);
    }
    expect(env.anzahl()).toBe(0); expect(env.status()).toEqual(vorher);
    laden.resolve(json()); await warten();
    for (const format of ['projekt', 'excel', 'pdf'] as const) await aktionen.ausgeben(format, 'teilen');
    expect(env.anzahl()).toBe(0); expect(env.status()).toEqual(vorher);
    expect(aktionen.zustand().kannTeilen).toBe(false);
    await aktionen.ausgeben('projekt', 'exportieren'); expect(env.anzahl()).toBe(1);
  });

  it('sperrt alle sechs Ausgaben bei fehlendem Ergebnis und gibt sie nach Korrektur frei', async () => {
    const env = vorbereiten(); const { aktionen } = env.start(); await warten();
    env.feld('verfahrensart').value = 'nicht_offen_mit_tnw'; env.senden(env.feld('verfahrensart'), 'change');
    env.feld('angebotsaufforderungTermin').value = '2026-01-01'; env.senden(env.feld('angebotsaufforderungTermin'), 'change');
    expect(aktionen.zustand().hatErgebnis).toBe(false);
    for (const { id, aktion } of dateiAktionen.filter(e => e.aktion.art === 'ausgabe')) {
      expect(aktionen.istErlaubt(aktion)).toBe(false); await aufrufen(aktionen, aktion); env.click(id);
    }
    expect(env.anzahl()).toBe(0);
    expect(aktionen.istErlaubt({ art: 'import' })).toBe(true);
    expect(aktionen.istErlaubt({ art: 'neues-projekt' })).toBe(true);
    env.feld('angebotsaufforderungTermin').value = ''; env.senden(env.feld('angebotsaufforderungTermin'), 'change');
    await aktionen.ausgeben('projekt', 'exportieren'); expect(env.anzahl()).toBe(1);
  });
});

describe('Zustandsbeobachtung und Lebensdauer', () => {
  it('liefert sofort den Stand, nur Änderungen, unabhängige Abmeldungen und einmal beendet', async () => {
    const env = vorbereiten(); const instanz = env.start();
    const staende: Readonly<DateiAktionsZustand>[] = []; const fn = vi.fn(stand => staende.push(stand));
    const abmelden = instanz.aktionen.beobachten(fn);
    expect(staende).toHaveLength(1); expect(staende[0]!.geladen).toBe(false); expect(Object.isFrozen(staende[0])).toBe(true);
    await warten(); expect(staende).toHaveLength(2); expect(staende[1]!.geladen).toBe(true);
    env.senden(env.feld('projektname'), 'change'); expect(staende).toHaveLength(2);
    const zweiter = vi.fn(); const abmelden2 = instanz.aktionen.beobachten(zweiter);
    abmelden(); abmelden(); await instanz.aktionen.ausgeben('projekt', 'exportieren');
    expect(staende).toHaveLength(2); expect(zweiter.mock.calls.map(([s]) => s.beschaeftigt)).toEqual([false, true, false]);
    abmelden2();
    const ende = vi.fn(); instanz.aktionen.beobachten(ende);
    instanz.dispose(); instanz.dispose();
    expect(ende.mock.calls.map(([s]) => s.beendet)).toEqual([false, true]);
    const spaet = vi.fn(); instanz.aktionen.beobachten(spaet); expect(spaet).not.toHaveBeenCalled();
    expect(instanz.aktionen.zustand()).toMatchObject({ beendet: true, beschaeftigt: false });
  });

  it('lässt Fehler und Abmeldung eines Beobachters weder Sperre noch andere Beobachter beschädigen', async () => {
    const env = vorbereiten(); const instanz = env.start(); await warten();
    instanz.aktionen.beobachten(() => { throw new Error('Beobachter'); });
    const anderer = vi.fn(); let abmelden = () => {};
    instanz.aktionen.beobachten(stand => { if (stand.beschaeftigt) abmelden(); });
    abmelden = instanz.aktionen.beobachten(anderer);
    await instanz.aktionen.ausgeben('projekt', 'exportieren');
    expect(anderer).toHaveBeenCalledTimes(1); expect(env.anzahl()).toBe(1);
    expect(instanz.aktionen.zustand().beschaeftigt).toBe(false);
  });

  it.each(dateiAktionen)('$id übernimmt nach dispose kein spätes Ergebnis und hinterlässt keine UI-Listener', async ({ aktion }) => {
    const env = vorbereiten(); const ausgabe = offen<DateiErgebnis>(); const auswahl = offen<Auswahl<{ name: string; text: string }>>(); const bestaetigung = offen<boolean>();
    env.exportieren.mockReturnValue(ausgabe.promise); env.teilenFn.mockReturnValue(ausgabe.promise);
    env.waehlen.mockReturnValue(auswahl.promise); env.bestaetigen.mockReturnValue(bestaetigung.promise);
    const instanz = env.start(); await warten(); const observer = vi.fn(); instanz.aktionen.beobachten(observer);
    const lauf = aufrufen(instanz.aktionen, aktion); await vi.waitFor(() => expect(env.anzahl()).toBe(1));
    instanz.dispose(); const text = env.root.textContent; const stand = instanz.aktionen.zustand(); const anzahl = observer.mock.calls.length;
    expect(env.root.querySelectorAll('input,select,button,form').reduce((summe, el) => summe + el.listenerAnzahl(), 0)).toBe(0);
    for (const andere of dateiAktionen) { expect(instanz.aktionen.istErlaubt(andere.aktion)).toBe(false); await aufrufen(instanz.aktionen, andere.aktion); }
    ausgabe.resolve({ status: 'ok' }); auswahl.resolve({ status: 'ok', wert: { name: 'spaet.json', text: json('Zu spät') } }); bestaetigung.resolve(true);
    await lauf; await warten();
    expect(env.root.textContent).toBe(text); expect(env.schreiben).not.toHaveBeenCalled(); expect(env.entfernen).not.toHaveBeenCalled();
    expect(env.anzahl()).toBe(1); expect(observer).toHaveBeenCalledTimes(anzahl); expect(instanz.aktionen.zustand()).toEqual(stand);
    expect(observer.mock.calls.filter(([s]) => s.beendet)).toHaveLength(1);
  });

  it('hält auch den Zustand nach dispose während des Ladens fest', async () => {
    const env = vorbereiten(); const laden = offen<string | null>(); env.lesen.mockReturnValue(laden.promise);
    const instanz = env.start(); const observer = vi.fn(); instanz.aktionen.beobachten(observer); instanz.dispose();
    const stand = instanz.aktionen.zustand(); const text = env.root.textContent;
    laden.resolve(json()); await warten();
    expect(instanz.aktionen.zustand()).toEqual(stand); expect(env.root.textContent).toBe(text); expect(observer).toHaveBeenCalledTimes(2);
  });

  it('startet keinen Adapter mehr, wenn ein Beobachter beim Sperren die Instanz beendet', async () => {
    const env = vorbereiten(); const instanz = env.start(); await warten();
    const spaeter = vi.fn();
    instanz.aktionen.beobachten(stand => { if (stand.beschaeftigt) instanz.dispose(); });
    instanz.aktionen.beobachten(spaeter);
    await instanz.aktionen.projektImportieren();
    expect(env.anzahl()).toBe(0);
    expect(spaeter.mock.calls.map(([stand]) => stand.beendet)).toEqual([false, true]);
  });

  it('verändert nach dispose aus einer Ergebnisbeobachtung weder Importansicht noch Speicher', async () => {
    const env = vorbereiten(); const instanz = env.start(); await warten();
    env.feld('angebotsaufforderungTermin').value = '2026-01-01';
    env.senden(env.feld('angebotsaufforderungTermin'), 'change');
    expect(instanz.aktionen.zustand().hatErgebnis).toBe(false);
    let textBeimBeenden = '';
    instanz.aktionen.beobachten(stand => {
      if (stand.hatErgebnis && !stand.beendet) { instanz.dispose(); textBeimBeenden = env.root.textContent; }
    });
    await instanz.aktionen.projektImportieren(); await warten();
    expect(instanz.aktionen.zustand().beendet).toBe(true);
    expect(env.root.textContent).toBe(textBeimBeenden);
    expect(env.schreiben).not.toHaveBeenCalled();
  });
});

describe('Unmittelbare Aktivierung des Web-Dateifelds', () => {
  it.each(['ui', 'api'])('%s verwendet den echten Web-Adapter ohne rekursiven Import und mit genau einer Auswahl', async weg => {
    const env = vorbereiten(false);
    const feld = Object.assign(env.el('open-json'), { files: [] as { name: string; size: number; text(): Promise<string> }[], click: vi.fn() });
    const aktivierungen: boolean[] = [];
    feld.click.mockImplementation(() => { aktivierungen.push(env.click('open-json')); });
    const web = erzeugeWebPlattform(env.root as unknown as HTMLElement); aufraeumen.push(() => web.dispose());
    const waehlen = vi.spyOn(web.import, 'waehlen'); env.plattform.import = web.import;
    const { aktionen } = env.start(); await warten();
    if (weg === 'ui') { expect(env.click('open-json')).toBe(true); expect(feld.click).not.toHaveBeenCalled(); }
    else { void aktionen.projektImportieren(); expect(feld.click).toHaveBeenCalledTimes(1); expect(aktivierungen).toEqual([true]); }
    // Diese Prüfungen laufen noch im selben Stapel, bevor ein Promise fortsetzt.
    expect(waehlen).toHaveBeenCalledTimes(1); expect(aktionen.zustand().beschaeftigt).toBe(true);
    expect(env.click('open-json')).toBe(false); await warten(); expect(env.click('open-json')).toBe(false);
    const text = json('Aus dem Dateifeld'); feld.files = [{ name: 'projekt.json', size: text.length, text: async () => text }];
    env.senden(feld, 'change'); await warten();
    expect(waehlen).toHaveBeenCalledTimes(1); expect(env.feld('projektname').value).toBe('Aus dem Dateifeld');
    expect(aktionen.zustand().beschaeftigt).toBe(false);
    web.dispose();
  });

  it('erlaubt höchstens einen synchronen Adapterklick und keinen späteren, auch bei synchronem Fehler', async () => {
    const env = vorbereiten(); const { aktionen } = env.start(); await warten();
    env.waehlen.mockImplementationOnce(() => {
      expect(env.click('open-json')).toBe(true);
      expect(env.click('open-json')).toBe(false);
      throw new Error('Synchroner Adapterfehler');
    });
    await aktionen.projektImportieren(); expect(env.waehlen).toHaveBeenCalledTimes(1);
    const auswahl = offen<Auswahl<{ name: string; text: string }>>(); env.waehlen.mockReturnValueOnce(auswahl.promise);
    const lauf = aktionen.projektImportieren();
    expect(env.click('open-json')).toBe(false);
    auswahl.resolve({ status: 'abgebrochen' }); await lauf;
    expect(aktionen.zustand().beschaeftigt).toBe(false);
  });
});
