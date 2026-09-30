import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as kern from '@baremos/fristenrechner-kern';
import { initFristenrechner } from '../src/fristenrechner-ui';
import { MAX_PROJEKT_BYTES, PlattformFehler, type Auswahl, type DateiErgebnis, type Plattform } from '../src/plattform';
import { webExportInhalt, webTexte } from '../src/web-vorgaben';
import { beispiel } from './beispiel';
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

function vorbereiten(gespeichert: string | null = null) {
  const dom = erstelleTestDom();
  vi.stubGlobal('document', dom.dokument);
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('HTMLInputElement', TestInput);
  vi.stubGlobal('HTMLSelectElement', TestSelect);
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    matchMedia: vi.fn(() => ({ matches: true })),
  });
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
    const instanz = initFristenrechner(dom.root as unknown as HTMLElement, { plattform, texte: webTexte, exportInhalt: webExportInhalt });
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
