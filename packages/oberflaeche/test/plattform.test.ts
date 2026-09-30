import { describe, expect, it, vi } from 'vitest';
import { MAX_PROJEKT_BYTES, PlattformFehler, pruefeProjektGroesse, type ProjektSpeicher } from '../src/plattform';
import { speicherWarteschlange } from '../src/speicher-warteschlange';

function offen() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fehler) => { resolve = ok; reject = fehler; });
  return { promise, resolve, reject };
}

function speicher(): ProjektSpeicher {
  return { lesen: vi.fn(async () => null), schreiben: vi.fn(async () => {}), entfernen: vi.fn(async () => {}) };
}

describe('Größe der Projektdatei in UTF-8', () => {
  it('akzeptiert leeren Text und genau 1 MiB ASCII', () => {
    expect(MAX_PROJEKT_BYTES).toBe(1_048_576);
    expect(() => pruefeProjektGroesse('')).not.toThrow();
    expect(() => pruefeProjektGroesse('a'.repeat(MAX_PROJEKT_BYTES))).not.toThrow();
  });

  it('weist bereits ein ASCII-Byte über der Grenze mit dem Fehlercode zurück', () => {
    expect(() => pruefeProjektGroesse('a'.repeat(MAX_PROJEKT_BYTES + 1))).toThrow(PlattformFehler);
    try { pruefeProjektGroesse('a'.repeat(MAX_PROJEKT_BYTES + 1)); }
    catch (error) { expect(error).toMatchObject({ code: 'zu-gross', name: 'PlattformFehler' }); }
  });

  it('zählt UTF-8-Bytes statt JavaScript-Zeichen', () => {
    expect(() => pruefeProjektGroesse('ä'.repeat(MAX_PROJEKT_BYTES / 2))).not.toThrow();
    expect(() => pruefeProjektGroesse('ä'.repeat(MAX_PROJEKT_BYTES / 2) + 'a')).toThrow(PlattformFehler);
    expect(() => pruefeProjektGroesse('😀', 4)).not.toThrow();
    expect(() => pruefeProjektGroesse('😀', 3)).toThrow(PlattformFehler);
  });

  it('wendet auch eine kleinere Byte-Grenze an, ohne JSON zu parsen', () => {
    expect(() => pruefeProjektGroesse('kein JSON', 9)).not.toThrow();
    expect(() => pruefeProjektGroesse('kein JSON', 8)).toThrow(PlattformFehler);
  });
});

describe('Speicherwarteschlange', () => {
  it('beginnt neuere Schreibvorgänge erst nach Abschluss der älteren', async () => {
    const erster = offen();
    const adapter = speicher();
    vi.mocked(adapter.schreiben).mockImplementationOnce(() => erster.promise);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('eins');
    const zwei = queue.schreiben('zwei');
    const drei = queue.schreiben('drei');
    await Promise.resolve();
    expect(adapter.schreiben).toHaveBeenCalledTimes(1);
    erster.resolve();
    await Promise.all([eins, zwei, drei]);
    expect(vi.mocked(adapter.schreiben).mock.calls).toEqual([['eins'], ['zwei'], ['drei']]);
  });

  it('meldet Schreibfehler an den Aufrufer und arbeitet danach weiter', async () => {
    const adapter = speicher();
    const fehler = new PlattformFehler('kein-speicher', 'Probe');
    vi.mocked(adapter.schreiben).mockRejectedValueOnce(fehler);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('eins');
    const erwartet = expect(eins).rejects.toBe(fehler);
    const zwei = queue.schreiben('zwei');
    await erwartet;
    await zwei;
    expect(vi.mocked(adapter.schreiben).mock.calls).toEqual([['eins'], ['zwei']]);
  });

  it('verwirft vor der Barriere wartende Schreibaufträge und wartet auf den laufenden', async () => {
    const erster = offen();
    const adapter = speicher();
    vi.mocked(adapter.schreiben).mockImplementationOnce(() => erster.promise);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('läuft');
    await Promise.resolve();
    const alt = queue.schreiben('veraltet');
    let ruhig = false;
    const barriere = queue.beruhigen().then(() => { ruhig = true; });
    await Promise.resolve();
    expect(ruhig).toBe(false);
    erster.resolve();
    await Promise.all([eins, alt, barriere]);
    const entfernen = queue.entfernen();
    const neu = queue.schreiben('neues Projekt');
    await Promise.all([entfernen, neu]);
    expect(vi.mocked(adapter.schreiben).mock.calls).toEqual([['läuft'], ['neues Projekt']]);
    expect(adapter.entfernen).toHaveBeenCalledTimes(1);
    const loeschAufruf = vi.mocked(adapter.entfernen).mock.invocationCallOrder[0]!;
    expect(loeschAufruf).toBeGreaterThan(vi.mocked(adapter.schreiben).mock.invocationCallOrder[0]!);
    expect(loeschAufruf).toBeLessThan(vi.mocked(adapter.schreiben).mock.invocationCallOrder[1]!);
  });

  it('lässt eine Barriere auch nach einem fehlgeschlagenen laufenden Auftrag abschließen', async () => {
    const erster = offen();
    const adapter = speicher();
    vi.mocked(adapter.schreiben).mockImplementationOnce(() => erster.promise);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('läuft');
    const erwartet = expect(eins).rejects.toThrow('Probe');
    await Promise.resolve();
    const alt = queue.schreiben('veraltet');
    const barriere = queue.beruhigen();
    erster.reject(new Error('Probe'));
    await erwartet;
    await Promise.all([alt, barriere]);
    await queue.schreiben('danach');
    expect(vi.mocked(adapter.schreiben).mock.calls).toEqual([['läuft'], ['danach']]);
  });

  it('führt Entfernen erst nach einem laufenden Schreiben aus und reicht Löschfehler weiter', async () => {
    const erster = offen();
    const adapter = speicher();
    vi.mocked(adapter.schreiben).mockImplementationOnce(() => erster.promise);
    const fehler = new PlattformFehler('schreiben', 'Probe');
    vi.mocked(adapter.entfernen).mockRejectedValueOnce(fehler);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('eins');
    const loeschen = queue.entfernen();
    const erwartet = expect(loeschen).rejects.toBe(fehler);
    const zwei = queue.schreiben('zwei');
    await Promise.resolve();
    expect(adapter.entfernen).not.toHaveBeenCalled();
    erster.resolve();
    await eins;
    await erwartet;
    await zwei;
    expect(vi.mocked(adapter.schreiben).mock.calls).toEqual([['eins'], ['zwei']]);
  });

  it('beendet dispose erst nach dem laufenden Auftrag und verwirft wartende sowie spätere Schreibaufträge', async () => {
    const erster = offen();
    const adapter = speicher();
    vi.mocked(adapter.schreiben).mockImplementationOnce(() => erster.promise);
    const queue = speicherWarteschlange(adapter);
    const eins = queue.schreiben('läuft');
    await Promise.resolve();
    const zwei = queue.schreiben('wartet');
    let beendet = false;
    const ende = queue.dispose().then(() => { beendet = true; });
    const drei = queue.schreiben('zu spät');
    await Promise.resolve();
    expect(beendet).toBe(false);
    erster.resolve();
    await Promise.all([eins, zwei, drei, ende]);
    await queue.dispose();
    expect(adapter.schreiben).toHaveBeenCalledExactlyOnceWith('läuft');
  });
});
