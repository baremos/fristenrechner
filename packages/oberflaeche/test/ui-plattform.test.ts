import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as kern from '@baremos/fristenrechner-kern';
import { initFristenrechner } from '../src/fristenrechner-ui';
import { MAX_PROJEKT_BYTES, PlattformFehler, type Auswahl, type DateiErgebnis, type Plattform, type MenueOption } from '../src/plattform';
import { webExportInhalt, webTexte } from '../src/web-vorgaben';
import { beispiel, vob2026Hinweis } from './beispiel';
import { erstelleTestDom, TestElement, TestInput, TestSelect } from './ui-testdom';

const exporte = vi.hoisted(() => ({ excel: vi.fn(), pdf: vi.fn() }));
vi.mock('../src/fristenrechner-export-excel', () => ({ excelAlsDatei: exporte.excel }));
vi.mock('../src/fristenrechner-export-pdf', () => ({ pdfAlsDatei: exporte.pdf }));

const zeit = { zeitpunkt: '2026-09-30T10:00:00.000Z', kalendertag: '2026-09-30' };
const instanzen: { dispose(): void }[] = [];
function offen<T>() {
  let resolve!: (wert: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fehler) => { resolve = ok; reject = fehler; });
  return { promise, resolve, reject };
}
async function warten(): Promise<void> { await vi.advanceTimersByTimeAsync(0); }
function json(name = 'Geladen'): string {
  return JSON.stringify(kern.erstelleProjektDatei(beispiel({ projekt: { projektname: name } }), zeit.zeitpunkt));
}

function vorbereiten(gespeichert: string | null = null, menue?: MenueOption) {
  const dom = erstelleTestDom();
  vi.stubGlobal('document', dom.dokument);
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('HTMLInputElement', TestInput);
  vi.stubGlobal('HTMLSelectElement', TestSelect);
  const fenster = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    matchMedia: vi.fn(() => ({ matches: true })),
    innerHeight: 915, scrollX: 0, scrollY: 237,
    scrollTo: vi.fn(), getComputedStyle: () => ({ fontSize: '16px' }),
  });
  dom.dokument.defaultView = fenster;
  vi.stubGlobal('window', fenster);
  const schreiben = vi.fn(async (text: string) => { gespeichert = text; });
  const lesen = vi.fn(async () => gespeichert);
  const entfernen = vi.fn(async () => { gespeichert = null; });
  const waehlen = vi.fn<Plattform['import']['waehlen']>(async () => ({ status: 'abgebrochen' }));
  const exportieren = vi.fn<Plattform['ausgabe']['exportieren']>(async () => ({ status: 'ok' }));
  const bestaetigen = vi.fn(async () => true);
  const plattform: Plattform = {
    speicher: { lesen, schreiben, entfernen }, import: { waehlen }, ausgabe: { exportieren },
    zeit: vi.fn(() => zeit), zuruecksetzenBestaetigen: bestaetigen,
  };
  const start = () => {
    const instanz = initFristenrechner(dom.root as unknown as HTMLElement, { plattform, texte: webTexte, exportInhalt: webExportInhalt, menue });
    instanzen.push(instanz); return instanz;
  };
  const aendern = (name: string, wert: string, ereignis = 'input') => {
    dom.feld(name).value = wert; dom.senden(dom.feld(name), ereignis);
  };
  const auswaehlen = (text: string) => {
    waehlen.mockResolvedValue({ status: 'ok', wert: { name: 'projekt.json', text } });
    dom.click('open-json');
  };
  return { ...dom, plattform, schreiben, lesen, entfernen, waehlen, exportieren, bestaetigen, start, aendern, auswaehlen, gespeichert: () => gespeichert };
}

beforeEach(() => {
  vi.useFakeTimers();
  exporte.excel.mockImplementation(() => ({ name: 'terminplan.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: new Uint8Array([1, 2, 3]) }));
  exporte.pdf.mockImplementation(async () => ({ name: 'terminplan.pdf', mime: 'application/pdf', bytes: new Uint8Array([4, 5, 6]) }));
});
afterEach(async () => {
  instanzen.splice(0).forEach(instanz => instanz.dispose());
  await warten();
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('Initialisierung und Speicher über die Plattform', () => {
  it.each([undefined, 'standard', 'kompakt'])('setzt Tabellenrollen und Phasenhülle nur in der kompakten Ansicht (%s)', async ansicht => {
    const env = vorbereiten();
    if (ansicht !== undefined) env.root.dataset.ansicht = ansicht;
    env.start(); await warten();
    const pruefen = () => {
      const zeilen = env.el('schedule-table-body').kinder;
      expect(zeilen.length).toBeGreaterThan(0);
      for (const zeile of zeilen) {
        expect(zeile.getAttribute('role')).toBe(ansicht === 'kompakt' ? 'row' : null);
        expect(zeile.kinder).toHaveLength(4);
        for (const zelle of zeile.kinder) expect(zelle.getAttribute('role')).toBe(ansicht === 'kompakt' ? 'cell' : null);
        expect(zeile.kinder[2]!.querySelectorAll('.milestone-phase')).toHaveLength(ansicht === 'kompakt' ? 1 : 0);
      }
    };
    pruefen();
    env.aendern('projektname', 'Neu berechnet');
    env.senden(env.el('schedule-form'), 'submit'); await warten();
    pruefen();
  });

  it('rendert mit Plattformzeit und speichert bei leerem Speicher ein gültiges Projekt', async () => {
    const env = vorbereiten(); env.start(); await warten();
    expect(env.lesen).toHaveBeenCalledTimes(1);
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    expect(env.feld('bekanntmachung').value).toBe(zeit.kalendertag);
    expect(JSON.parse(env.gespeichert()!).input.bundesland).toBe('BE');
    expect(JSON.parse(env.gespeichert()!).input.optionen.elektronischeAbgabe).toBe(true);
    expect(kern.parseProjektDatei(env.gespeichert()!).ok).toBe(true);
    expect(JSON.parse(env.gespeichert()!).gespeichertAm).toBe(zeit.zeitpunkt);
    expect(env.el('result-summary').textContent).toContain('Meilensteine');
    expect(env.el('schedule-table-body').kinder.length).toBeGreaterThan(0);
    expect(env.el('storage-status').textContent).toContain('gespeichert');
  });

  it('lädt ein gültiges Projekt samt Metadaten, ohne es automatisch umzuschreiben', async () => {
    const vorher = json();
    const env = vorbereiten(vorher); env.start(); await warten();
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.gespeichert()).toBe(vorher);
    expect(env.el('project-file-meta').hidden).toBe(false);
    expect(env.el('project-file-meta').textContent).toContain('Rechenkern');
    expect(env.el('storage-status').textContent).toContain('Lokales Projekt geladen');
  });

  it('importiert VOB/A-EU aus 1.9.0 mit neuen Hinweisen und Regelstand ohne alte Standardwert-Warnung', async () => {
    const projekt = kern.erstelleProjektDatei(beispiel({ vergabeordnung: 'vob_a_eu' }), zeit.zeitpunkt);
    projekt.rechenkernVersion = '1.9.0'; projekt.rechtsstand = 'Juli 2026'; projekt.rechtsstandDatum = '2026-07-17';
    const env = vorbereiten(); env.start(); await warten();
    env.auswaehlen(JSON.stringify(projekt)); await warten();
    expect(env.el('project-file-meta').textContent).toBe('Projektdatei: Rechenkern 1.9.0 · Rechtsstand: Juli 2026');
    expect(env.el('project-file-meta').classList.contains('project-file-meta--migration')).toBe(false);
    expect(env.el('result-regelstand').textContent).toBe('Regelversion: 1.9.1 · Rechtsstand: Oktober 2026 (2026-10-22)');
    expect(env.el('result-warnings').textContent).toContain('Ausgabe 2026');
    expect(env.el('result-warnings').textContent).toContain(vob2026Hinweis);
    const gespeichert = JSON.parse(env.gespeichert()!);
    expect(gespeichert.rechenkernVersion).toBe('1.9.1');
    expect(gespeichert.rechtsstandDatum).toBe('2026-10-22');
    expect(gespeichert.input.bekanntmachung).toBe(projekt.input.bekanntmachung);
  });

  it('speichert nach 350 ms den letzten Eingabestand und verschiebt den Timer bei erneuter Eingabe', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.aendern('projektname', 'Erster Stand');
    await vi.advanceTimersByTimeAsync(300);
    expect(env.schreiben).not.toHaveBeenCalled();
    env.aendern('projektname', 'Letzter Stand');
    await vi.advanceTimersByTimeAsync(349);
    expect(env.schreiben).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Letzter Stand');
  });

  it.each(['ungültig', 'zu groß', 'Speicher nicht verfügbar', 'Lesefehler', 'unbekannter Lesefehler'])('erhält den Startspeicher bei %s und lässt Berechnung zu', async fall => {
    const vorher = fall === 'zu groß' ? 'ä'.repeat(MAX_PROJEKT_BYTES / 2) + 'a' : '{kaputt';
    const env = vorbereiten(vorher);
    if (fall === 'Speicher nicht verfügbar') env.lesen.mockRejectedValue(new PlattformFehler('nicht-verfuegbar', 'Probe'));
    if (fall === 'Lesefehler') env.lesen.mockRejectedValue(new PlattformFehler('lesen', 'Probe'));
    if (fall === 'unbekannter Lesefehler') env.lesen.mockRejectedValue(new Error('Probe'));
    env.start(); await warten();
    env.aendern('projektname', 'Neue Eingabe');
    env.senden(env.el('schedule-form'), 'submit');
    await vi.advanceTimersByTimeAsync(350);
    expect(env.el('result-summary').textContent).toContain('Neue Eingabe');
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.gespeichert()).toBe(vorher);
    expect(env.el('storage-status').textContent).toContain('bleibt erhalten');
    if (fall === 'zu groß') expect(env.el('storage-status').textContent).toContain('1 MiB');
    if (fall === 'ungültig' || fall === 'zu groß') {
      expect(env.el('storage-status').textContent).toContain('Importieren Sie eine Projektdatei oder setzen Sie das Projekt zurück');
    } else {
      expect(env.el('storage-status').textContent).toContain('weiter rechnen');
      expect(env.el('storage-status').textContent).toContain('als Projektdatei exportieren');
      expect(env.el('storage-status').textContent).not.toContain('Importieren');
      expect(env.el('storage-status').textContent).not.toContain('zurück');
      env.click('save-json'); await warten();
      const exportiert = new TextDecoder().decode(env.exportieren.mock.calls[0]![0].bytes);
      expect(JSON.parse(exportiert).input.projekt.projektname).toBe('Neue Eingabe');
    }
  });

  it('meldet einen Schreibfehler und speichert beim nächsten Versuch wieder', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.schreiben.mockRejectedValueOnce(new PlattformFehler('kein-speicher', 'Probe'));
    env.aendern('projektname', 'Erster Versuch'); await vi.advanceTimersByTimeAsync(350);
    expect(env.el('storage-status').textContent).toBe(webTexte.speicherNichtVerfuegbar);
    env.aendern('projektname', 'Zweiter Versuch'); await vi.advanceTimersByTimeAsync(350);
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Zweiter Versuch');
    expect(env.el('storage-status').textContent).toContain('gespeichert');
  });
});

describe('Import und geordnete Projektaktionen', () => {
  it('hält bei Importabbruch Eingaben und Speicher unverändert und zeigt keinen Fehler', async () => {
    const vorher = json(); const env = vorbereiten(vorher); env.start(); await warten();
    env.click('open-json'); await warten();
    expect(env.waehlen).toHaveBeenCalledExactlyOnceWith({ mime: 'application/json', endungen: ['.json'], maxBytes: MAX_PROJEKT_BYTES });
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.gespeichert()).toBe(vorher);
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.el('import-message').textContent).toBe('');
  });

  it('weist UTF-8-Text über 1 MiB sichtbar vor dem Kern-Parser zurück', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const parser = vi.spyOn(kern, 'parseProjektDatei');
    env.auswaehlen('ä'.repeat(MAX_PROJEKT_BYTES / 2) + 'a'); await warten();
    expect(parser).not.toHaveBeenCalled();
    expect(env.el('import-message').textContent).toContain('1 MiB');
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.schreiben).not.toHaveBeenCalled();
  });

  it('meldet ungültiges JSON und übernimmt erst eine folgende gültige Auswahl', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.auswaehlen('{kaputt'); await warten();
    expect(env.el('import-message').textContent).not.toBe('');
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.schreiben).not.toHaveBeenCalled();
    env.auswaehlen(json('Importiert')); await warten();
    expect(env.feld('projektname').value).toBe('Importiert');
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Importiert');
    expect(env.el('import-message').textContent).toContain('geöffnet');
    expect(env.el('project-file-meta').textContent).toContain('Rechenkern');
  });

  it('gibt Import nach einem Adapterfehler wieder frei', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.waehlen.mockRejectedValueOnce(new PlattformFehler('lesen', 'Probe'));
    env.click('open-json'); await warten();
    expect(env.el('import-message').textContent).toContain('nicht vollständig');
    env.auswaehlen(json('Danach')); await warten();
    expect(env.feld('projektname').value).toBe('Danach');
  });

  it('holt vor einem abgebrochenen Import fälliges Speichern nach', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const auswahl = offen<Auswahl<{ name: string; text: string }>>();
    env.waehlen.mockReturnValue(auswahl.promise);
    env.aendern('projektname', 'Während Auswahl');
    env.click('open-json');
    await vi.advanceTimersByTimeAsync(350);
    expect(env.schreiben).not.toHaveBeenCalled();
    auswahl.resolve({ status: 'abgebrochen' }); await warten();
    expect(env.el('import-message').textContent).toBe('');
    await vi.advanceTimersByTimeAsync(350);
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Während Auswahl');
  });

  it('holt während des Import-Schreibens geänderte Eingaben nach', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const schreiben = offen<void>();
    env.schreiben.mockImplementationOnce(() => schreiben.promise);
    env.auswaehlen(json('Importiert')); await warten();
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    env.aendern('projektname', 'Nach Import geändert');
    await vi.advanceTimersByTimeAsync(350);
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    schreiben.resolve(); await warten(); await vi.advanceTimersByTimeAsync(350);
    expect(env.schreiben).toHaveBeenCalledTimes(2);
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Nach Import geändert');
  });

  it('wartet vor dem Import auf laufendes Schreiben und verwirft alte wartende Aufträge', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const alt = offen<void>();
    env.schreiben.mockImplementationOnce(() => alt.promise);
    env.aendern('projektname', 'Läuft', 'change'); await vi.advanceTimersByTimeAsync(350);
    env.aendern('projektname', 'Wartet', 'change'); await vi.advanceTimersByTimeAsync(350);
    env.auswaehlen(json('Importiert')); await warten();
    expect(env.feld('projektname').value).toBe('Wartet');
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    alt.resolve(); await warten();
    expect(env.schreiben).toHaveBeenCalledTimes(2);
    expect(env.schreiben.mock.calls.map(([text]) => JSON.parse(text).input.projekt.projektname)).toEqual(['Läuft', 'Importiert']);
    expect(env.feld('projektname').value).toBe('Importiert');
  });

  it('verhindert eine zweite Projektaktion während der Auswahl', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const auswahl = offen<Auswahl<{ name: string; text: string }>>();
    env.waehlen.mockReturnValue(auswahl.promise);
    env.click('open-json'); env.click('open-json'); env.click('reset-project');
    expect(env.waehlen).toHaveBeenCalledTimes(1);
    expect(env.bestaetigen).not.toHaveBeenCalled();
    auswahl.resolve({ status: 'abgebrochen' }); await warten();
    env.click('reset-project'); await warten();
    expect(env.bestaetigen).toHaveBeenCalledTimes(1);
  });

  it.each(['Import', 'Reset'])('räumt nach erfolgreichem %s den vorherigen Speicherfehler ab', async aktion => {
    const env = vorbereiten('{kaputt'); env.start(); await warten();
    expect(env.el('storage-status').textContent).toContain('bleibt erhalten');
    if (aktion === 'Import') env.auswaehlen(json('Importiert')); else env.click('reset-project');
    await warten();
    expect(env.el('storage-status').textContent).toBe('Zuletzt automatisch gespeichert: gerade eben.');
    expect(env.el('storage-status').textContent).not.toContain('bleibt erhalten');
    expect(kern.parseProjektDatei(env.gespeichert()!).ok).toBe(true);
  });
});

describe('Zurücksetzen über die Plattform', () => {
  it('ändert bei abgelehnter Bestätigung weder Formular noch Speicher', async () => {
    const vorher = json(); const env = vorbereiten(vorher); env.start(); await warten();
    env.bestaetigen.mockResolvedValue(false);
    env.click('reset-project'); await warten();
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.gespeichert()).toBe(vorher);
    expect(env.entfernen).not.toHaveBeenCalled();
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.el('reset-project').disabled).toBe(false);
    expect(env.el('reset-message').textContent).toBe('');
  });

  it('löscht nach Bestätigung vor dem Schreiben der Ausgangswerte und entfernt Dateimetadaten', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.click('reset-project'); await warten();
    expect(env.entfernen).toHaveBeenCalledTimes(1);
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    expect(env.entfernen.mock.invocationCallOrder[0]).toBeLessThan(env.schreiben.mock.invocationCallOrder[0]!);
    expect(env.feld('projektname').value).toBe('');
    expect(env.feld('bekanntmachung').value).toBe(zeit.kalendertag);
    expect(env.feld('vergabeordnung').value).toBe('vgv');
    expect(env.feld('verfahrensart').value).toBe('offen');
    expect(env.el('project-file-meta').hidden).toBe(true);
    expect(env.el('project-file-meta').textContent).toBe('');
    expect(env.el('reset-message').textContent).toBe('Neues Projekt angelegt.');
  });

  it('holt während einer abgelehnten asynchronen Bestätigung fälliges Speichern nach', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    const bestaetigung = offen<boolean>(); env.bestaetigen.mockReturnValue(bestaetigung.promise);
    env.click('reset-project'); env.aendern('projektname', 'Neue Eingabe');
    await vi.advanceTimersByTimeAsync(350);
    expect(env.schreiben).not.toHaveBeenCalled();
    bestaetigung.resolve(false); await warten(); await vi.advanceTimersByTimeAsync(350);
    expect(JSON.parse(env.gespeichert()!).input.projekt.projektname).toBe('Neue Eingabe');
    expect(env.entfernen).not.toHaveBeenCalled();
  });

  it('meldet Löschfehler, erhält die Eingaben und erlaubt einen neuen Versuch', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.entfernen.mockRejectedValueOnce(new PlattformFehler('schreiben', 'Probe'));
    env.click('reset-project'); await warten();
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.el('reset-message').textContent).toContain('nicht vollständig');
    expect(env.el('reset-project').disabled).toBe(false);
    env.click('reset-project'); await warten();
    expect(env.feld('projektname').value).toBe('');
    expect(env.el('reset-message').textContent).toBe('Neues Projekt angelegt.');
  });
});

describe('Initialisierung und dispose', () => {
  it('weist doppelte Initialisierung und zwei Komponenten ab, lässt einen sauberen Neustart zu', async () => {
    const env = vorbereiten(json()); const instanz = env.start(); await warten();
    expect(() => env.start()).toThrow('nur ein Fristenrechner');
    instanz.dispose(); await warten();
    const zweite = erstelleTestDom(env.dokument);
    expect(() => env.start()).toThrow('nur ein Fristenrechner');
    zweite.root.remove();
    expect(() => env.start()).not.toThrow(); await warten();
  });

  it('verhindert verspätete DOM- und Speicheränderungen nach dispose während des Ladens', async () => {
    const env = vorbereiten(); const laden = offen<string | null>(); env.lesen.mockReturnValue(laden.promise);
    const instanz = env.start(); instanz.dispose();
    const text = env.root.textContent;
    laden.resolve(json()); await warten();
    expect(env.root.textContent).toBe(text);
    expect(env.feld('projektname').value).toBe('');
    expect(env.schreiben).not.toHaveBeenCalled();
  });

  it('entfernt Listener und den ausstehenden Speichertimer', async () => {
    const env = vorbereiten(json()); const instanz = env.start(); await warten();
    env.aendern('projektname', 'Noch nicht gespeichert');
    instanz.dispose();
    for (const id of ['schedule-form', 'reset-project', 'save-json', 'open-json']) expect(env.el(id).listenerAnzahl()).toBe(0);
    expect(env.root.querySelector('.export-actions')!.listenerAnzahl()).toBe(0);
    env.click('reset-project'); env.click('open-json');
    await vi.advanceTimersByTimeAsync(1000);
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.bestaetigen).not.toHaveBeenCalled();
    expect(env.waehlen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wartet mit erneuter Initialisierung auf den laufenden Schreibvorgang und verwirft wartende Aufträge', async () => {
    const env = vorbereiten(json()); const instanz = env.start(); await warten();
    const schreiben = offen<void>(); env.schreiben.mockReturnValueOnce(schreiben.promise);
    env.aendern('projektname', 'Läuft', 'change'); await vi.advanceTimersByTimeAsync(350);
    env.aendern('projektname', 'Wartet', 'change'); await vi.advanceTimersByTimeAsync(350);
    instanz.dispose();
    const text = env.root.textContent;
    expect(() => env.start()).toThrow('nur ein Fristenrechner');
    schreiben.resolve(); await warten();
    expect(env.schreiben).toHaveBeenCalledTimes(1);
    expect(env.root.textContent).toBe(text);
    expect(() => env.start()).not.toThrow(); await warten();
  });

  it.each(['Import', 'Reset'])('übernimmt nach dispose kein verspätetes Ergebnis von %s', async aktion => {
    const env = vorbereiten(json()); const instanz = env.start(); await warten();
    const auswahl = offen<Auswahl<{ name: string; text: string }>>();
    const bestaetigung = offen<boolean>();
    env.waehlen.mockReturnValue(auswahl.promise); env.bestaetigen.mockReturnValue(bestaetigung.promise);
    env.click(aktion === 'Import' ? 'open-json' : 'reset-project');
    instanz.dispose(); const text = env.root.textContent;
    auswahl.resolve({ status: 'ok', wert: { name: 'import.json', text: json('Zu spät') } });
    bestaetigung.resolve(true); await warten();
    expect(env.root.textContent).toBe(text);
    expect(env.feld('projektname').value).toBe('Geladen');
    expect(env.schreiben).not.toHaveBeenCalled();
    expect(env.entfernen).not.toHaveBeenCalled();
  });
});

describe('Ausgabe über die Plattform', () => {
  it.each(['excel', 'pdf'] as const)('verdrahtet %s mit festem Eingabestand, Byte-Ausgabe und eigenem Status', async art => {
    // Byte-Inhalt und Bibliotheken werden in den Exporttests geprüft; hier sind
    // ausschließlich UI-Steuerung und Weitergabe an den Ausgabeadapter Gegenstand.
    const env = vorbereiten(json()); env.start(); await warten();
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    env.click('export-' + art);
    await vi.waitFor(() => expect(env.exportieren).toHaveBeenCalledTimes(1));
    expect(exporte[art]).toHaveBeenCalledTimes(1);
    expect(exporte[art].mock.calls[0]![0].projekt.projektname).toBe('Geladen');
    expect(exporte[art].mock.calls[0]![2]).toEqual(zeit);
    expect(exporte[art].mock.calls[0]![3]).toEqual(webExportInhalt);
    env.click('export-' + art);
    env.aendern('projektname', 'Während Export geändert', 'change');
    expect(env.el('export-' + art).disabled).toBe(true);
    expect(exporte[art].mock.calls[0]![0].projekt.projektname).toBe('Geladen');
    expect(env.exportieren).toHaveBeenCalledTimes(1);
    expect(env.exportieren.mock.calls[0]![0].bytes).toEqual(new Uint8Array(art === 'excel' ? [1, 2, 3] : [4, 5, 6]));
    ausgabe.resolve({ status: 'ok' }); await warten();
    expect(env.el('export-' + art).disabled).toBe(false);
    expect(env.el(art + '-message').textContent).toBe(webTexte.exportErfolg);
    expect(env.el('export-message').textContent).toBe('');
    expect(env.el(art === 'excel' ? 'pdf-message' : 'excel-message').textContent).toBe('');
  });

  it('erzeugt Projektbytes mit dem festgehaltenen Stand und zeigt einen eigenen Status', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.click('save-json'); await warten();
    expect(env.exportieren).toHaveBeenCalledTimes(1);
    const datei = env.exportieren.mock.calls[0]![0];
    expect(datei.mime).toBe('application/json;charset=utf-8');
    expect(JSON.parse(new TextDecoder().decode(datei.bytes)).input.projekt.projektname).toBe('Geladen');
    expect(env.el('export-message').textContent).toBe(webTexte.exportErfolg);
    expect(env.el('import-message').textContent).toBe('');
    expect(env.el('save-json').disabled).toBe(false);
  });

  it.each(['abgebrochen', 'Plattformfehler', 'unbekannter Fehler'])('meldet Ausgabe-%s passend und gibt den Projektbutton frei', async fall => {
    const env = vorbereiten(json()); env.start(); await warten();
    if (fall === 'abgebrochen') env.exportieren.mockResolvedValue({ status: 'abgebrochen' });
    else if (fall === 'Plattformfehler') env.exportieren.mockRejectedValue(new PlattformFehler('kein-ziel', 'Es ist keine passende App zum Speichern oder Teilen verfügbar.'));
    else env.exportieren.mockRejectedValue(new Error('EIO: /privater/pfad/projekt.json'));
    env.click('save-json'); await warten();
    expect(env.el('save-json').disabled).toBe(false);
    if (fall === 'abgebrochen') expect(env.el('export-message').textContent).toBe('');
    else if (fall === 'Plattformfehler') expect(env.el('export-message').textContent).toBe('Es ist keine passende App zum Speichern oder Teilen verfügbar.');
    else expect(env.el('export-message').textContent).toBe('Die Projektdatei konnte nicht zum Speichern bereitgestellt werden. Bitte versuchen Sie es erneut.');
  });

  it('verhindert Doppelklick und späte Statusänderung nach dispose während der Projektausgabe', async () => {
    const env = vorbereiten(json()); const instanz = env.start(); await warten();
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    env.click('save-json'); env.click('save-json');
    expect(env.exportieren).toHaveBeenCalledTimes(1);
    expect(env.el('save-json').disabled).toBe(true);
    instanz.dispose(); const text = env.root.textContent;
    ausgabe.resolve({ status: 'ok' }); await warten();
    expect(env.root.textContent).toBe(text);
  });
});

describe('Gemeinsame Dateiaktionen und optionale Fähigkeiten', () => {
  const aktionen = ['save-json', 'export-excel', 'export-pdf', 'share-json', 'share-excel', 'share-pdf', 'open-json', 'reset-project'] as const;

  it('ergänzt beim Web-Vertrag keine Teilen-Aktion und erlaubt weitere Ergebnisaktionen', async () => {
    const env = vorbereiten(json());
    const extra = env.dokument.createElement('button');
    extra.setAttribute('data-requires-result', ''); env.root.append(extra);
    env.start(); await warten();
    expect(env.root.querySelectorAll('[data-file-share]')).toHaveLength(0);
    expect(extra.disabled).toBe(false);
  });

  it.each(['save-json', 'export-excel', 'export-pdf'])('weist eine fehlende erforderliche Aktion %s ab', id => {
    const env = vorbereiten(); env.el(id).remove();
    expect(env.start).toThrow('unvollständig');
  });

  it('weist mehrere Importelemente ab', () => {
    const env = vorbereiten();
    const extra = env.dokument.createElement('button'); extra.setAttribute('data-project-import', ''); env.root.append(extra);
    expect(env.start).toThrow('unvollständig');
  });

  it('bietet bei Teilen-Fähigkeit genau drei Aktionen und entfernt sie bei dispose', async () => {
    const env = vorbereiten(json()); env.plattform.ausgabe.teilen = vi.fn<NonNullable<Plattform['ausgabe']['teilen']>>(async () => ({ status: 'ok' }));
    const instanz = env.start(); await warten();
    expect(env.root.querySelectorAll('[data-file-share]').map(el => el.textContent)).toEqual(['Projekt teilen', 'Excel teilen', 'PDF teilen']);
    instanz.dispose(); await warten();
    expect(env.root.querySelectorAll('[data-file-share]')).toHaveLength(0);
    env.start(); await warten();
    expect(env.root.querySelectorAll('[data-file-share]')).toHaveLength(3);
  });

  it.each(['projekt', 'excel', 'pdf'] as const)('übergibt %s einmal an Teilen, mit einer Zeit und einem festen Stand', async format => {
    const env = vorbereiten(json());
    const ausgabe = offen<DateiErgebnis>();
    const teilen = vi.fn<NonNullable<Plattform['ausgabe']['teilen']>>(() => ausgabe.promise); env.plattform.ausgabe.teilen = teilen;
    env.start(); await warten(); vi.mocked(env.plattform.zeit).mockClear();
    env.click(format === 'projekt' ? 'share-json' : 'share-' + format);
    await vi.waitFor(() => expect(teilen).toHaveBeenCalledTimes(1));
    expect(env.plattform.zeit).toHaveBeenCalledTimes(1);
    expect(env.exportieren).not.toHaveBeenCalled();
    const datei = teilen.mock.calls[0]![0];
    env.aendern('projektname', 'Nächster Auftrag', 'change');
    if (format === 'projekt') {
      expect(JSON.parse(new TextDecoder().decode(datei.bytes)).input.projekt.projektname).toBe('Geladen');
    } else {
      expect(exporte[format]).toHaveBeenCalledTimes(1);
      expect(exporte[format].mock.calls[0]![0].projekt.projektname).toBe('Geladen');
      expect(exporte[format].mock.calls[0]![2]).toEqual(zeit);
    }
    ausgabe.resolve({ status: 'ok' }); await warten();
    expect(env.el(format === 'projekt' ? 'export-message' : format + '-message').textContent).toBe(
      `Die ${format === 'projekt' ? 'Projektdatei' : format === 'excel' ? 'Excel-Datei' : 'PDF-Datei'} wurde zum Teilen bereitgestellt.`);
  });

  it.each(aktionen)('%s sperrt alle Dateiaktionen bis zum Abbruch und gibt sie danach frei', async id => {
    const env = vorbereiten(json());
    const ausgabe = offen<DateiErgebnis>(); const auswahl = offen<Auswahl<{ name: string; text: string }>>(); const bestaetigung = offen<boolean>();
    const teilen = vi.fn<NonNullable<Plattform['ausgabe']['teilen']>>(() => ausgabe.promise);
    env.plattform.ausgabe.teilen = teilen;
    env.exportieren.mockReturnValue(ausgabe.promise); env.waehlen.mockReturnValue(auswahl.promise); env.bestaetigen.mockReturnValue(bestaetigung.promise);
    env.start(); await warten();
    const meldungen = ['export-message', 'excel-message', 'pdf-message', 'import-message', 'reset-message'];
    meldungen.forEach(id => { env.el(id).textContent = 'Vorherige Meldung ' + id; });
    env.click(id); await warten();
    const anzahl = () => env.exportieren.mock.calls.length + teilen.mock.calls.length + env.waehlen.mock.calls.length + env.bestaetigen.mock.calls.length;
    expect(anzahl()).toBe(1);
    for (const andere of aktionen) {
      if (andere === 'open-json') expect(env.el(andere).attribute.get('aria-disabled')).toBe('true');
      else expect(env.el(andere).disabled).toBe(true);
      env.click(andere);
    }
    await warten(); expect(anzahl()).toBe(1);
    ausgabe.resolve({ status: 'abgebrochen' }); auswahl.resolve({ status: 'abgebrochen' }); bestaetigung.resolve(false); await warten();
    for (const aktion of aktionen) expect(env.el(aktion).disabled).toBe(false);
    expect(env.el('open-json').attribute.has('aria-disabled')).toBe(false);
    for (const meldung of meldungen) expect(env.el(meldung).textContent).toBe('Vorherige Meldung ' + meldung);
    expect(env.feld('projektname').value).toBe('Geladen'); expect(env.gespeichert()).toBe(json());
    env.exportieren.mockResolvedValue({ status: 'ok' }); env.click('save-json'); await warten();
    expect(anzahl()).toBe(2);
  });

  it('sperrt einen Importbutton und nutzt denselben Importvertrag', async () => {
    const env = vorbereiten(json()); env.el('open-json').remove();
    const button = env.dokument.createElement('button'); button.setAttribute('id', 'open-json'); button.setAttribute('data-project-import', ''); env.root.append(button);
    const auswahl = offen<Auswahl<{ name: string; text: string }>>(); env.waehlen.mockReturnValue(auswahl.promise);
    env.start(); await warten(); env.click('open-json');
    expect(button.disabled).toBe(true); env.click('open-json'); expect(env.waehlen).toHaveBeenCalledTimes(1);
    auswahl.resolve({ status: 'ok', wert: { name: 'projekt.json', text: json('Vom Button') } }); await warten();
    expect(button.disabled).toBe(false); expect(env.feld('projektname').value).toBe('Vom Button');
  });

  it('meldet nach geöffnetem Import einen Speicherfehler ehrlich und lässt den Export zu', async () => {
    const vorher = json(); const env = vorbereiten(vorher); env.start(); await warten();
    env.el('form-message').textContent = 'Kein Terminplan berechenbar — bitte die festen Starttermine korrigieren.';
    env.el('reset-message').textContent = 'Neues Projekt angelegt.';
    env.schreiben.mockRejectedValueOnce(new PlattformFehler('kein-speicher', 'Probe'));
    env.auswaehlen(json('Geöffnet')); await warten();
    expect(env.feld('projektname').value).toBe('Geöffnet'); expect(env.gespeichert()).toBe(vorher);
    expect(env.el('import-message').textContent).toBe('Die Projektdatei ist geöffnet, konnte aber nicht automatisch gespeichert werden. Exportieren Sie die Eingaben zur Sicherung.');
    expect(env.el('storage-status').textContent).toBe(webTexte.speicherNichtVerfuegbar);
    expect(env.el('form-message').textContent).toBe(''); expect(env.el('reset-message').textContent).toBe('');
    env.click('save-json'); await warten();
    expect(JSON.parse(new TextDecoder().decode(env.exportieren.mock.calls[0]![0].bytes)).input.projekt.projektname).toBe('Geöffnet');
    env.auswaehlen(json('Danach')); await warten(); expect(env.feld('projektname').value).toBe('Danach');
  });

  it('weist einen zu großen Projektexport vor dem Transport ab und gibt die Aktionen frei', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    env.aendern('projektname', 'ä'.repeat(MAX_PROJEKT_BYTES / 2), 'change');
    env.click('save-json'); await warten();
    expect(env.exportieren).not.toHaveBeenCalled(); expect(env.el('export-message').textContent).toBe('Die Projektdatei ist größer als 1 MiB.');
    expect(env.el('save-json').disabled).toBe(false); expect(env.el('export-excel').disabled).toBe(false);
    env.aendern('projektname', 'Passt', 'change'); env.click('save-json'); await warten(); expect(env.exportieren).toHaveBeenCalledTimes(1);
  });

  it('gibt bei einem Fehler der Exportzeit alle Aktionen wieder frei', async () => {
    const env = vorbereiten(json()); env.start(); await warten();
    vi.mocked(env.plattform.zeit).mockImplementationOnce(() => { throw new Error('Uhr'); });
    env.click('export-pdf'); await warten();
    expect(env.exportieren).not.toHaveBeenCalled(); expect(env.el('pdf-message').textContent).toContain('nicht geladen oder erstellt');
    expect(env.el('save-json').disabled).toBe(false); env.click('save-json'); await warten(); expect(env.exportieren).toHaveBeenCalledTimes(1);
  });
});

describe('Dateiaktionen im Bottom Sheet (DOM-Vertrag, kein Layoutnachweis)', () => {
  const menue = { darstellung: 'bottom-sheet' } as const;
  const wege = [
    ['save-json', 'Projekt speichern unter'], ['export-excel', 'Excel speichern'], ['export-pdf', 'PDF speichern'],
    ['share-json', 'Projekt teilen'], ['share-excel', 'Excel teilen'], ['share-pdf', 'PDF teilen'],
    ['open-json', 'Projekt importieren'], ['reset-project', 'Neues Projekt'],
  ] as const;
  function ansicht(env: ReturnType<typeof vorbereiten>) {
    const knopf = env.dokument.querySelector('.fr-menue-leiste')!.querySelector('button[aria-controls]')!;
    const overlay = env.root.querySelector('.fr-menue-overlay')!;
    const sheet = overlay.querySelector('[role="dialog"]')!;
    const x = overlay.querySelector('[aria-label="Schließen"]')!;
    const liste = overlay.querySelector('.fr-menue-liste')!;
    const buttons = liste.querySelectorAll('button');
    const oeffnen = () => env.senden(knopf, 'click');
    const waehlen = (name: string) => env.senden(buttons.find(b => b.textContent === name)!, 'click');
    const taste = (key: string, shiftKey = false) => {
      const e = new Event('keydown', { cancelable: true }); Object.assign(e, { key, shiftKey }); env.dokument.dispatchEvent(e); return e;
    };
    return { knopf, overlay, sheet, x, liste, buttons, oeffnen, waehlen, taste };
  }
  function mitZurueck(env: ReturnType<typeof vorbereiten>) {
    let empfangen = () => {};
    const abmelden = vi.fn(); const setzen = vi.fn(async (_aktiv: boolean) => {});
    env.plattform.zurueck = { setzen, beobachten: fn => { empfangen = fn; return abmelden; }, dispose: vi.fn() };
    return { setzen, abmelden, empfangen: () => empfangen() };
  }
  it.each([undefined, 'aus'] as const)('erzeugt mit %s keine zusätzlichen Knoten, Attribute, Stile oder Listener', async option => {
    const env = vorbereiten(json(), option); const zurueck = mitZurueck(env);
    const vorher = env.root.querySelectorAll('style').length;
    const docListener = vi.spyOn(env.dokument, 'addEventListener');
    const winListener = vi.spyOn(window, 'addEventListener');
    const attribute = [...env.root.attribute];
    env.start(); await warten();
    expect(env.root.querySelectorAll('style')).toHaveLength(vorher);
    expect(env.dokument.querySelectorAll('.fr-menue-leiste,.fr-menue-overlay')).toHaveLength(0);
    expect([...env.root.attribute]).toEqual(attribute);
    expect(env.dokument.body.getAttribute('style')).toBeNull();
    expect(env.dokument.documentElement.getAttribute('style')).toBeNull();
    expect(env.dokument.querySelectorAll('.fr-menue-reserve')).toHaveLength(0);
    expect(docListener).not.toHaveBeenCalled(); expect(winListener).not.toHaveBeenCalled();
    expect(zurueck.setzen).not.toHaveBeenCalled();
    expect(env.el('project-file-meta').getAttribute('role')).toBe('status');
    expect(env.el('project-file-meta').getAttribute('aria-live')).toBe('polite');
  });
  it('weist eine unbekannte Darstellung vor jeder Änderung zurück', () => {
    const env = vorbereiten(json(), { darstellung: 'anders' } as unknown as MenueOption);
    expect(env.start).toThrow('Unbekannte Darstellung');
    expect(env.root.querySelectorAll('.fr-menue-overlay')).toHaveLength(0);
    expect(env.lesen).not.toHaveBeenCalled();
  });
  it('erfasst neue Hintergrundknoten und entfernt alle Beobachter und globalen Listener', async () => {
    let nachMutation = () => {};
    const disconnect = vi.fn(), observe = vi.fn();
    const groesseBeenden = vi.fn();
    vi.stubGlobal('MutationObserver', class {
      constructor(fn: () => void) { nachMutation = fn; }
      observe = observe; disconnect = disconnect;
    });
    vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = groesseBeenden; });
    const env = vorbereiten(json(), menue);
    const docAn = vi.spyOn(env.dokument, 'addEventListener'), docAb = vi.spyOn(env.dokument, 'removeEventListener');
    const winAn = vi.spyOn(window, 'addEventListener'), winAb = vi.spyOn(window, 'removeEventListener');
    const instanz = env.start(); await warten(); const a = ansicht(env); a.oeffnen();
    const gast = env.dokument.createElement('aside'), button = env.dokument.createElement('button');
    gast.append(button); env.dokument.body.append(gast); nachMutation();
    expect(gast.getAttribute('aria-hidden')).toBe('true'); expect(button.getAttribute('tabindex')).toBe('-1');
    expect(observe).toHaveBeenCalled(); instanz.dispose();
    expect(gast.getAttribute('aria-hidden')).toBeNull(); expect(button.getAttribute('tabindex')).toBeNull();
    expect(disconnect).toHaveBeenCalled(); expect(groesseBeenden).toHaveBeenCalledTimes(1);
    expect(docAb.mock.calls).toEqual(docAn.mock.calls); expect(winAb.mock.calls).toEqual(winAn.mock.calls);
    nachMutation(); expect(button.getAttribute('tabindex')).toBeNull();
  });
  it('schließt synchron auch bei einer ausstehenden oder abgelehnten Zurück-Bestätigung und bleibt nach dispose still', async () => {
    const env = vorbereiten(json(), menue), z = mitZurueck(env), bestaetigung = offen<void>();
    z.setzen.mockReturnValue(bestaetigung.promise);
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    const instanz = env.start(); await warten(); const a = ansicht(env);
    a.oeffnen(); a.waehlen('Projekt speichern unter'); expect(a.overlay.hidden).toBe(true);
    expect(env.exportieren).toHaveBeenCalledTimes(1); expect(env.dokument.activeElement).toBe(a.knopf);
    a.oeffnen(); instanz.dispose(); const text = env.el('export-message').textContent;
    ausgabe.resolve({ status: 'ok' }); bestaetigung.reject(new Error('Brücke')); await warten();
    expect(env.el('export-message').textContent).toBe(text);
    expect(env.root.querySelector('.fr-menue-overlay')).toBeNull(); z.empfangen();
    expect(z.setzen.mock.calls.map(c => c[0])).toEqual([true, false, true, false]);
  });
  it('hat genau eine Leiste, ein komponenteneigenes Overlay, eindeutige IDs und acht echte Aktionen', async () => {
    const env = vorbereiten(json(), menue); env.plattform.ausgabe.teilen = env.exportieren;
    const kollision = env.dokument.createElement('div'); kollision.id = 'fr-menue-1'; env.dokument.body.append(kollision);
    env.start(); await warten(); const a = ansicht(env);
    expect(env.dokument.querySelectorAll('.fr-menue-leiste')).toHaveLength(1);
    expect(env.root.querySelectorAll('.fr-menue-overlay')).toHaveLength(1);
    expect(a.buttons.map(b => b.textContent)).toEqual(wege.map(w => w[1]));
    const ids = env.dokument.querySelectorAll('[id]').map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.knopf.getAttribute('aria-controls')).toBe(a.sheet.id);
    expect(a.knopf.tagName).toBe('button');
    expect(a.knopf.getAttribute('aria-label')).toBe('Dateiaktionen');
    expect(a.knopf.getAttribute('aria-haspopup')).toBeNull();
    expect(a.knopf.getAttribute('aria-expanded')).toBe('false');
    expect(a.sheet.getAttribute('aria-modal')).toBe('true');
    expect(a.overlay.hidden).toBe(true); expect(env.root.querySelectorAll('[data-project-import]')).toHaveLength(1);
    expect(a.sheet.querySelectorAll('[role="status"]')).toHaveLength(0);
  });
  it.each(['verbunden', 'Overlay entfernt', 'Komponente entfernt'])('öffnet und sperrt den Hintergrund nur mit verbundenem Overlay: %s', async fall => {
    const env = vorbereiten(json(), menue), z = mitZurueck(env);
    const gast = env.dokument.createElement('section'), link = env.dokument.createElement('a');
    gast.setAttribute('aria-hidden', 'false'); link.setAttribute('href', '#ziel'); link.setAttribute('tabindex', '3');
    gast.append(link); env.dokument.body.append(gast);
    env.dokument.body.setAttribute('style', 'color: red;');
    env.start(); await warten(); const a = ansicht(env);
    const bodyStil = env.dokument.body.getAttribute('style'), htmlStil = env.dokument.documentElement.getAttribute('style');
    if (fall === 'Overlay entfernt') a.overlay.remove();
    if (fall === 'Komponente entfernt') env.root.remove();
    a.knopf.focus(); a.oeffnen();
    if (fall === 'verbunden') {
      expect(a.overlay.hidden).toBe(false); expect(a.knopf.getAttribute('aria-expanded')).toBe('true');
      expect(env.dokument.body.style.getPropertyValue('position')).toBe('fixed');
      expect(env.dokument.documentElement.style.getPropertyValue('overflow')).toBe('hidden');
      expect(gast.getAttribute('aria-hidden')).toBe('true'); expect(link.getAttribute('tabindex')).toBe('-1');
      expect(env.dokument.activeElement).toBe(a.sheet.querySelector('h2'));
      expect(z.setzen).toHaveBeenCalledExactlyOnceWith(true);
      env.senden(a.x, 'click');
    } else {
      expect(a.overlay.isConnected).toBe(false); expect(a.knopf.isConnected).toBe(true);
      expect(z.setzen).not.toHaveBeenCalled();
      expect(window.scrollTo).not.toHaveBeenCalled();
    }
    expect(a.overlay.hidden).toBe(true); expect(a.knopf.getAttribute('aria-expanded')).toBe('false');
    expect(a.knopf.getAttribute('tabindex')).toBeNull();
    expect(env.dokument.body.getAttribute('style')).toBe(bodyStil);
    expect(env.dokument.documentElement.getAttribute('style')).toBe(htmlStil);
    expect(gast.getAttribute('aria-hidden')).toBe('false'); expect(link.getAttribute('tabindex')).toBe('3');
    expect(env.dokument.activeElement).toBe(a.knopf);
  });
  it('lässt ohne Teilen-Fähigkeit die drei Einträge und die Gruppe weg', async () => {
    const env = vorbereiten(json(), menue); env.start(); await warten(); const a = ansicht(env);
    expect(a.buttons).toHaveLength(5);
    expect(a.liste.querySelectorAll('h3').map(h => h.textContent)).toEqual(['Speichern', 'Import']);
  });
  it('ordnet Reserve und Leiste vor der äußeren Seitenüberschrift an und sperrt die Leiste mit dem Hintergrund', async () => {
    const env = vorbereiten(json(), menue);
    const seitenTitel = env.dokument.createElement('h1'); seitenTitel.textContent = 'Fristenrechner Vergabe';
    env.dokument.body.insertBefore(seitenTitel, env.root);
    const instanz = env.start(); await warten(); const a = ansicht(env);
    const leiste = env.dokument.querySelector('.fr-menue-leiste')!;
    expect(env.dokument.body.children.slice(0, 4)).toEqual([
      env.dokument.querySelector('.fr-menue-reserve'), leiste, seitenTitel, env.root,
    ]);
    expect(leiste.children[0]!.textContent).toBe('Fristenrechner');
    expect(leiste.children[1]).toBe(a.knopf);
    expect(env.root.querySelector('.fr-menue-leiste')).toBeNull();
    for (let durchlauf = 0; durchlauf < 2; durchlauf++) {
      a.oeffnen();
      expect(leiste.getAttribute('aria-hidden')).toBe('true');
      expect(a.knopf.getAttribute('tabindex')).toBe('-1');
      expect(seitenTitel.getAttribute('aria-hidden')).toBe('true');
      env.senden(a.x, 'click');
      expect(leiste.getAttribute('aria-hidden')).toBeNull();
      expect(a.knopf.getAttribute('tabindex')).toBeNull();
      expect(env.dokument.activeElement).toBe(a.knopf);
    }
    instanz.dispose();
    expect(env.dokument.body.children).toEqual([seitenTitel, env.root]);
  });
  it.each(['X', 'Zurück', 'Speichern', 'Teilen'])('führt Dateimetadaten beim Schließen über %s als normalen Text und erhält neue Live-Meldungen', async weg => {
    const env = vorbereiten(json(), menue); const z = mitZurueck(env);
    env.plattform.ausgabe.teilen = env.exportieren;
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    const instanz = env.start(); await warten(); const a = ansicht(env);
    const meta = env.el('project-file-meta'), text = meta.textContent;
    const statusIds = ['storage-status', 'form-message', 'reset-message', 'export-message', 'import-message', 'excel-message', 'pdf-message'];
    const liveRegionen = () => {
      for (const id of statusIds) {
        expect(env.el(id).getAttribute('role')).toBe('status');
        expect(env.el(id).getAttribute('aria-live')).toBe('polite');
      }
      expect(meta.getAttribute('role')).toBeNull(); expect(meta.getAttribute('aria-live')).toBeNull();
      expect(meta.hidden).toBe(false); expect(meta.textContent).toBe(text);
    };
    liveRegionen(); a.oeffnen(); liveRegionen();
    if (weg === 'X') env.senden(a.x, 'click');
    else if (weg === 'Zurück') z.empfangen();
    else a.waehlen(weg === 'Speichern' ? 'Projekt speichern unter' : 'PDF teilen');
    expect(a.overlay.hidden).toBe(true); expect(meta.getAttribute('aria-hidden')).toBeNull(); liveRegionen();
    ausgabe.resolve({ status: 'ok' }); await warten(); liveRegionen();
    if (weg === 'Speichern') expect(env.el('export-message').textContent).toBe(webTexte.exportErfolg);
    if (weg === 'Teilen') expect(env.el('pdf-message').textContent).toBe('Die PDF-Datei wurde zum Teilen bereitgestellt.');
    instanz.dispose();
    expect(meta.getAttribute('role')).toBe('status'); expect(meta.getAttribute('aria-live')).toBe('polite');
  });
  it('erhält die Importansage mit Version und Rechtsstand bei nicht live geführten Dateimetadaten', async () => {
    const env = vorbereiten(json(), menue); env.start(); await warten(); const a = ansicht(env);
    env.waehlen.mockResolvedValue({ status: 'ok', wert: { name: 'projekt.json', text: json('Importiert') } });
    a.oeffnen(); a.waehlen('Projekt importieren'); await warten();
    expect(env.el('import-message').getAttribute('aria-live')).toBe('polite');
    expect(env.el('import-message').textContent).toContain('Projektdatei geöffnet (Rechenkern');
    expect(env.el('import-message').textContent).toContain('Rechtsstand:');
    expect(env.el('project-file-meta').hidden).toBe(false);
    expect(env.el('project-file-meta').getAttribute('role')).toBeNull();
  });
  it.each([menue, 'aus'] as const)('zeigt beim Import aus Rechenkern 1.8.0 den Migrationshinweis und führt die Metazeile abhängig vom Menü live: %j', async option => {
    const env = vorbereiten(json(), option); env.start(); await warten();
    const projekt = JSON.parse(json('Älteres Projekt')); projekt.rechenkernVersion = '1.8.0';
    env.waehlen.mockResolvedValue({ status: 'ok', wert: { name: 'projekt.json', text: JSON.stringify(projekt) } });
    if (option === 'aus') env.click('open-json');
    else { const a = ansicht(env); a.oeffnen(); a.waehlen('Projekt importieren'); }
    await warten();
    const meta = env.el('project-file-meta'), importMeldung = env.el('import-message');
    expect(env.feld('projektname').value).toBe('Älteres Projekt');
    expect(meta.hidden).toBe(false); expect(meta.getAttribute('aria-hidden')).toBeNull();
    expect(meta.textContent).toContain('Projektdatei: Rechenkern 1.8.0');
    expect(meta.textContent).toContain('Rechenkern 1.9.0 verwendet neue Standardwerte für Versand- und Anpassungszeiten; dadurch können sich Termine verschieben.');
    expect(meta.getAttribute('role')).toBe(option === 'aus' ? 'status' : null);
    expect(meta.getAttribute('aria-live')).toBe(option === 'aus' ? 'polite' : null);
    expect(importMeldung.getAttribute('role')).toBe('status'); expect(importMeldung.getAttribute('aria-live')).toBe('polite');
    expect(importMeldung.textContent).toContain('Projektdatei geöffnet (Rechenkern 1.8.0');
    expect(importMeldung.textContent).not.toContain('dadurch können sich Termine verschieben.');
  });
  it.each(wege)('%s hat über Sheet und bisherigen Button identische Daten, Zeit, Bytes, Adapter und Statusregionen', async (id, name) => {
    const stand = async (sheet: boolean) => {
      exporte.excel.mockClear(); exporte.pdf.mockClear();
      const env = vorbereiten(json(), menue); const zurueck = mitZurueck(env);
      env.plattform.ausgabe.teilen = env.exportieren;
      env.waehlen.mockResolvedValue({ status: 'ok', wert: { name: 'projekt.json', text: json('Importiert') } });
      const instanz = env.start(); await warten(); const a = ansicht(env);
      vi.mocked(env.plattform.zeit).mockClear();
      if (sheet) {
        a.oeffnen(); a.waehlen(name);
        expect(a.overlay.hidden).toBe(true); expect(env.dokument.activeElement).toBe(a.knopf);
        expect(env.el('schedule-form').getAttribute('aria-hidden')).toBeNull();
        expect(zurueck.setzen.mock.calls.map(c => c[0])).toEqual([true, false]);
      } else env.click(id);
      await warten();
      const ergebnis = {
        ausgabe: env.exportieren.mock.calls, import: env.waehlen.mock.calls, dialog: env.bestaetigen.mock.calls,
        excel: exporte.excel.mock.calls, pdf: exporte.pdf.mock.calls,
        zeit: vi.mocked(env.plattform.zeit).mock.calls, gespeichert: env.gespeichert(), projekt: env.feld('projektname').value,
        meldungen: ['export-message', 'excel-message', 'pdf-message', 'import-message', 'reset-message'].map(id => env.el(id).textContent),
      };
      instanz.dispose(); await warten(); return ergebnis;
    };
    expect(await stand(true)).toEqual(await stand(false));
  });
  it.each(['Button', 'Sheet'])('sperrt bei Start am %s beide Bedienorte bis zum Ende des Auftrags', async weg => {
    const env = vorbereiten(json(), menue); env.plattform.ausgabe.teilen = env.exportieren;
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    env.start(); await warten(); const a = ansicht(env);
    if (weg === 'Sheet') { a.oeffnen(); a.waehlen('Projekt speichern unter'); } else env.click('save-json');
    a.oeffnen(); expect(a.buttons.every(b => b.disabled)).toBe(true);
    expect(a.sheet.getAttribute('aria-describedby')).toBe(a.sheet.querySelector('.fr-menue-sperre')!.id);
    for (const [id, name] of wege) { env.click(id); a.waehlen(name); }
    await warten(); expect(env.exportieren).toHaveBeenCalledTimes(1); expect(env.waehlen).not.toHaveBeenCalled(); expect(env.bestaetigen).not.toHaveBeenCalled();
    expect(a.overlay.hidden).toBe(false); expect(a.x.disabled).toBe(false);
    ausgabe.resolve({ status: 'ok' }); await warten();
    expect(a.buttons.every(b => !b.disabled)).toBe(true); expect(a.sheet.getAttribute('aria-describedby')).toBeNull();
  });
  it('hält alle Aktionen während des Ladens und danach nur die Ausgaben ohne Ergebnis gesperrt', async () => {
    const env = vorbereiten(json(), menue); env.plattform.ausgabe.teilen = env.exportieren;
    const lesen = offen<string | null>(); env.lesen.mockReturnValue(lesen.promise); env.start(); const a = ansicht(env);
    expect(a.buttons.every(b => b.disabled)).toBe(true); lesen.resolve(null); await warten();
    env.aendern('verfahrensart', 'nicht_offen_mit_tnw', 'change');
    env.aendern('angebotsaufforderungTermin', '2026-01-01', 'change');
    expect(a.buttons.slice(0, 6).every(b => b.disabled)).toBe(true);
    expect(a.buttons.slice(6).every(b => !b.disabled)).toBe(true);
  });
  it.each(['X', 'Escape', 'Außentipp', 'Zurück'])('schließt über %s mit Fokus-Rückkehr und passender Zurück-Folge', async weg => {
    const env = vorbereiten(json(), menue); const z = mitZurueck(env); env.start(); await warten(); const a = ansicht(env);
    a.oeffnen(); expect(env.dokument.activeElement!.id).toBe(a.sheet.getAttribute('aria-labelledby'));
    if (weg === 'X') env.senden(a.x, 'click'); else if (weg === 'Escape') a.taste('Escape');
    else if (weg === 'Außentipp') env.senden(a.overlay, 'click'); else z.empfangen();
    expect(a.overlay.hidden).toBe(true); expect(a.knopf.getAttribute('aria-expanded')).toBe('false'); expect(env.dokument.activeElement).toBe(a.knopf);
    z.empfangen(); a.taste('Escape'); expect(z.setzen.mock.calls.map(c => c[0])).toEqual([true, false]);
  });
  it('führt Tab zyklisch, überspringt gesperrte Aktionen und fängt fremden Fokus ab', async () => {
    const env = vorbereiten(json(), menue); env.start(); await warten(); const a = ansicht(env); a.oeffnen();
    a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.x);
    a.taste('Tab', true); expect(env.dokument.activeElement).toBe(a.buttons[a.buttons.length - 1]);
    a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.x);
    env.feld('projektname').focus(); env.dokument.dispatchEvent(new Event('focusin'));
    expect(env.dokument.activeElement!.id).toBe(a.sheet.getAttribute('aria-labelledby'));
    const ausgabe = offen<DateiErgebnis>(); env.exportieren.mockReturnValue(ausgabe.promise);
    a.waehlen('Projekt speichern unter'); a.oeffnen(); a.taste('Tab'); a.taste('Tab');
    expect(env.dokument.activeElement).toBe(a.liste); a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.x);
    ausgabe.resolve({ status: 'abgebrochen' }); await warten();
  });
  it.each(['pointerdown', 'touchstart'])('wechselt zwischen Tastatur und %s für Leiste und Sheet, auch nach Fokus-Rückkehr', async eingabe => {
    const env = vorbereiten(json(), menue); const z = mitZurueck(env);
    const instanz = env.start(); await warten(); const a = ansicht(env);
    const leiste = env.dokument.querySelector('.fr-menue-leiste')!;
    const modus = (aktiv: boolean) => {
      expect(leiste.classList.contains('fr-menue-tastatur')).toBe(aktiv);
      expect(a.overlay.classList.contains('fr-menue-tastatur')).toBe(aktiv);
    };
    modus(false);
    a.taste('Tab'); modus(true); // Schon bei geschlossenem Menü.
    a.taste('Enter'); a.oeffnen(); modus(true);
    expect(env.dokument.activeElement!.id).toBe(a.sheet.getAttribute('aria-labelledby'));
    a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.x); modus(true);
    a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.liste); modus(true);
    a.taste('Tab'); expect(env.dokument.activeElement).toBe(a.buttons[0]); modus(true);
    a.taste('Escape'); expect(env.dokument.activeElement).toBe(a.knopf); modus(true);
    env.senden(a.knopf, eingabe); a.oeffnen(); modus(false);
    z.empfangen(); expect(env.dokument.activeElement).toBe(a.knopf); modus(false);
    a.oeffnen(); a.taste('Tab'); modus(true);
    env.senden(a.x, eingabe); env.senden(a.x, 'click'); modus(false);
    expect(env.dokument.activeElement).toBe(a.knopf);
    instanz.dispose(); a.taste('Tab'); modus(false); // Globale Listener entfernt.
  });
  it.each([true, false])('stellt Hintergrundattribute und Scrollstil exakt wieder her; dispose offen=%s räumt auf', async offen => {
    const env = vorbereiten(json(), menue); const z = mitZurueck(env);
    const gast = env.dokument.createElement('section'); gast.setAttribute('aria-hidden', 'false');
    const link = env.dokument.createElement('a'); link.setAttribute('href', '#ziel'); link.setAttribute('tabindex', '3'); gast.append(link); env.dokument.body.append(gast);
    env.el('schedule-form').setAttribute('aria-hidden', 'false');
    env.feld('projektname').setAttribute('tabindex', '0'); env.dokument.body.setAttribute('style', 'color: red;');
    env.dokument.documentElement.setAttribute('style', 'scroll-padding-top: 7px !important;');
    const instanz = env.start(); await warten(); const a = ansicht(env);
    const vorBody = env.dokument.body.getAttribute('style'); const vorHtml = env.dokument.documentElement.getAttribute('style');
    a.oeffnen(); expect(link.getAttribute('tabindex')).toBe('-1'); expect(gast.getAttribute('aria-hidden')).toBe('true');
    expect(env.root.hasAttribute('aria-hidden')).toBe(false); expect(a.overlay.hasAttribute('aria-hidden')).toBe(false);
    if (!offen) env.senden(a.x, 'click');
    instanz.dispose(); instanz.dispose();
    expect(gast.getAttribute('aria-hidden')).toBe('false'); expect(link.getAttribute('tabindex')).toBe('3');
    expect(env.el('schedule-form').getAttribute('aria-hidden')).toBe('false'); expect(env.feld('projektname').getAttribute('tabindex')).toBe('0');
    expect(env.el('save-json').getAttribute('tabindex')).toBeNull();
    expect(env.dokument.body.getAttribute('style')).toBe(vorBody);
    expect(vorHtml).not.toBeNull(); expect(env.dokument.documentElement.getAttribute('style')).toBe('scroll-padding-top: 7px !important;');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 237);
    expect(env.dokument.querySelectorAll('.fr-menue-overlay,.fr-menue-leiste,.fr-menue-reserve,.fr-menue-stil')).toHaveLength(0);
    expect(a.knopf.listenerAnzahl()).toBe(0); expect(a.x.listenerAnzahl()).toBe(0); expect(a.buttons.every(b => b.listenerAnzahl() === 0)).toBe(true);
    expect(z.abmelden).toHaveBeenCalledTimes(1);
    expect(z.setzen.mock.calls.map(c => c[0])).toEqual(offen ? [true, false] : [true, false, false]);
    expect(env.plattform.zurueck!.dispose).not.toHaveBeenCalled(); z.empfangen(); expect(z.setzen).toHaveBeenCalledTimes(offen ? 2 : 3);
  });
});
