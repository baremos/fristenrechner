import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJEKT_BYTES, type AusgabeDatei, type Auswahl } from '../src/plattform';
import { erzeugeWebPlattform, WEB_SPEICHERSCHLUESSEL } from '../src/web-plattform';

// Diese Stubs prüfen Ereignisse und Adapteraufrufe; sie bilden keinen nativen
// Dateidialog, Browserdownload oder das Fokusverhalten einer WebView nach.
class Ziel extends EventTarget {
  private readonly handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(typ: string, handler: EventListenerOrEventListenerObject | null, optionen?: AddEventListenerOptions | boolean): void {
    if (handler) {
      const gruppe = this.handlers.get(typ) ?? new Set<EventListenerOrEventListenerObject>();
      gruppe.add(handler); this.handlers.set(typ, gruppe);
    }
    super.addEventListener(typ, handler, optionen);
  }
  override removeEventListener(typ: string, handler: EventListenerOrEventListenerObject | null, optionen?: EventListenerOptions | boolean): void {
    if (handler) this.handlers.get(typ)?.delete(handler);
    super.removeEventListener(typ, handler, optionen);
  }
  anzahl(typ: string): number { return this.handlers.get(typ)?.size ?? 0; }
}

function umgebung() {
  let wert = '';
  const feld = Object.assign(new Ziel(), {
    files: [] as { name: string; size: number; text(): Promise<string> }[],
    accept: '',
    click: vi.fn(() => { feld.dispatchEvent(new Event('click')); }),
  });
  Object.defineProperty(feld, 'value', {
    get: () => wert,
    set: (neu: string) => { wert = neu; if (neu === '') feld.files = []; },
  });
  const werte = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string): string | null => werte.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { werte.set(key, value); }),
    removeItem: vi.fn((key: string) => { werte.delete(key); }),
  };
  const fenster = Object.assign(new Ziel(), {
    localStorage,
    setTimeout: vi.fn((funktion: () => void, dauer: number) => globalThis.setTimeout(funktion, dauer)),
    clearTimeout: vi.fn((id: ReturnType<typeof setTimeout> | undefined) => { globalThis.clearTimeout(id); }),
    confirm: vi.fn(() => true),
  });
  const link = { href: '', download: '', hidden: false, click: vi.fn(), remove: vi.fn() };
  const dokument = { defaultView: fenster, createElement: vi.fn(() => link) };
  const root = { ownerDocument: dokument, querySelector: vi.fn(() => feld), append: vi.fn() };
  const adapter = erzeugeWebPlattform(root as unknown as HTMLElement);
  return { adapter, feld, fenster, localStorage, werte, root, dokument, link };
}

function datei(text = '{}', name = 'projekt.json', size = new TextEncoder().encode(text).byteLength) {
  return { name, size, text: vi.fn(async () => text) };
}
const vorgabe = { mime: 'application/json' as const, endungen: ['.json'] as const, maxBytes: MAX_PROJEKT_BYTES };
type Umgebung = ReturnType<typeof umgebung>;
function aufgeraeumt(env: Umgebung): void {
  expect(env.feld.anzahl('change')).toBe(0);
  expect(env.feld.anzahl('cancel')).toBe(0);
  expect(env.fenster.anzahl('focus')).toBe(0);
  expect(Reflect.get(env.feld, 'value')).toBe('');
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Web-Speicher', () => {
  it('liest, schreibt und entfernt unter dem bisherigen Schlüssel', async () => {
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
    env.adapter.dispose();
  });

  it.each([
    ['lesen', 'getItem', 'nicht-verfuegbar'],
    ['schreiben', 'setItem', 'kein-speicher'],
    ['entfernen', 'removeItem', 'schreiben'],
  ] as const)('übersetzt einen Fehler beim %s in den Plattformfehler', async (aktion, methode, code) => {
    const env = umgebung();
    env.localStorage[methode].mockImplementation(() => { throw new Error('Probe'); });
    const lauf = aktion === 'schreiben' ? env.adapter.speicher.schreiben('{}') : env.adapter.speicher[aktion]();
    await expect(lauf).rejects.toMatchObject({ name: 'PlattformFehler', code });
    env.adapter.dispose();
  });

  it('weist auch UTF-8-Text über 1 MiB aus localStorage zurück, ohne ihn zu verändern', async () => {
    const env = umgebung();
    const text = 'ä'.repeat(MAX_PROJEKT_BYTES / 2) + 'a';
    env.werte.set(WEB_SPEICHERSCHLUESSEL, text);
    await expect(env.adapter.speicher.lesen()).rejects.toMatchObject({ code: 'zu-gross' });
    expect(env.werte.get(WEB_SPEICHERSCHLUESSEL)).toBe(text);
    expect(env.localStorage.setItem).not.toHaveBeenCalled();
    env.adapter.dispose();
  });
});

describe('Web-Import', () => {
  it('verlangt das sichtbare Dateifeld mit der bisherigen Kennung', () => {
    const root = { querySelector: vi.fn(() => null) };
    expect(() => erzeugeWebPlattform(root as unknown as HTMLElement)).toThrow('Dateifeld');
    expect(root.querySelector).toHaveBeenCalledWith('#open-json');
  });

  it('liefert Dateiname und unveränderten Text und räumt die Handler auf', async () => {
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    expect(env.feld.accept).toBe('application/json,.json');
    const probe = datei(' { "name": "Geräte" }\n', 'Änderung.json');
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await expect(lauf).resolves.toEqual({ status: 'ok', wert: { name: 'Änderung.json', text: ' { "name": "Geräte" }\n' } });
    expect(probe.text).toHaveBeenCalledTimes(1);
    aufgeraeumt(env);
    expect(env.feld.anzahl('click')).toBe(1);
    env.adapter.dispose();
  });

  it('öffnet bei einem direkten Klick auf das sichtbare Dateifeld keinen zweiten Dialog', async () => {
    const env = umgebung();
    let lauf!: Promise<Auswahl<{ name: string; text: string }>>;
    const ausloesen = () => { lauf = env.adapter.import.waehlen(vorgabe); };
    env.feld.addEventListener('click', ausloesen);
    env.feld.click();
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.dispatchEvent(new Event('cancel'));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    env.feld.removeEventListener('click', ausloesen);
    env.adapter.dispose();
  });

  it('akzeptiert dieselbe Datei nach Abschluss erneut', async () => {
    const env = umgebung();
    const probe = datei();
    for (let nr = 0; nr < 2; nr += 1) {
      const lauf = env.adapter.import.waehlen(vorgabe);
      expect(env.feld.files).toEqual([]);
      env.feld.files = [probe];
      env.feld.dispatchEvent(new Event('change'));
      expect((await lauf).status).toBe('ok');
      aufgeraeumt(env);
    }
    expect(probe.text).toHaveBeenCalledTimes(2);
    env.adapter.dispose();
  });

  it.each(['cancel', 'change'])('behandelt %s ohne Datei als Abbruch', async typ => {
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.feld.dispatchEvent(new Event(typ));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('erkennt einen Abbruch über den focus-Fallback für Chromium 83', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.fenster.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    expect(vi.getTimerCount()).toBe(0);
    env.adapter.dispose();
  });

  it('liest im focus-Fallback eine gewählte Datei auch ohne change-Ereignis', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.feld.files = [datei()];
    env.fenster.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(lauf).resolves.toEqual({ status: 'ok', wert: { name: 'projekt.json', text: '{}' } });
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('bricht einen laufenden Lesevorgang beim focus-Fallback nicht ab und liest ihn nur einmal', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    let fertig!: (text: string) => void;
    const probe = datei();
    probe.text.mockImplementation(() => new Promise<string>(resolve => { fertig = resolve; }));
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    env.feld.dispatchEvent(new Event('change'));
    env.fenster.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
    expect(probe.text).toHaveBeenCalledTimes(1);
    fertig('{}');
    expect((await lauf).status).toBe('ok');
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('prüft die Dateigröße vor File.text und begrenzt auch großzügigere Vorgaben auf 1 MiB', async () => {
    const env = umgebung();
    const lauf = env.adapter.import.waehlen({ ...vorgabe, maxBytes: MAX_PROJEKT_BYTES * 2 });
    const erwartet = expect(lauf).rejects.toMatchObject({ code: 'zu-gross' });
    const probe = datei('{}', 'groß.json', MAX_PROJEKT_BYTES + 1);
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await erwartet;
    expect(probe.text).not.toHaveBeenCalled();
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('prüft nach dem Lesen erneut die UTF-8-Größe vor Übergabe an die Oberfläche', async () => {
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    const erwartet = expect(lauf).rejects.toMatchObject({ code: 'zu-gross' });
    const probe = datei('ä'.repeat(MAX_PROJEKT_BYTES / 2) + 'a', 'falsche-groesse.json', 2);
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await erwartet;
    expect(probe.text).toHaveBeenCalledTimes(1);
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('akzeptiert eine Datei genau an der Grenze und berücksichtigt kleinere Vorgaben', async () => {
    const env = umgebung();
    const text = 'a'.repeat(MAX_PROJEKT_BYTES);
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.feld.files = [datei(text)];
    env.feld.dispatchEvent(new Event('change'));
    await expect(lauf).resolves.toMatchObject({ status: 'ok', wert: { text } });
    const klein = env.adapter.import.waehlen({ ...vorgabe, maxBytes: 1 });
    const erwartet = expect(klein).rejects.toMatchObject({ code: 'zu-gross' });
    const probe = datei('{}');
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await erwartet;
    expect(probe.text).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it('meldet Lesefehler, räumt auf und erlaubt eine weitere Auswahl', async () => {
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    const erwartet = expect(lauf).rejects.toMatchObject({ code: 'lesen' });
    const probe = datei();
    probe.text.mockRejectedValue(new Error('Probe'));
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await erwartet;
    aufgeraeumt(env);
    const danach = env.adapter.import.waehlen(vorgabe);
    env.feld.dispatchEvent(new Event('cancel'));
    expect((await danach).status).toBe('abgebrochen');
    env.adapter.dispose();
  });

  it('weist eine gleichzeitige Auswahl zurück und lässt die erste bestehen', async () => {
    const env = umgebung();
    const erster = env.adapter.import.waehlen(vorgabe);
    await expect(env.adapter.import.waehlen(vorgabe)).rejects.toMatchObject({ code: 'lesen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.files = [datei()];
    env.feld.dispatchEvent(new Event('change'));
    expect((await erster).status).toBe('ok');
    env.adapter.dispose();
  });

  it('räumt bei dispose die offene Auswahl, Handler und Fallback-Timer auf', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.fenster.dispatchEvent(new Event('focus'));
    env.adapter.dispose();
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    expect(env.feld.anzahl('click')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(env.adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.adapter.dispose();
  });

  it('übernimmt nach dispose kein verspätetes Leseergebnis', async () => {
    const env = umgebung();
    let fertig!: (text: string) => void;
    const probe = datei();
    probe.text.mockImplementation(() => new Promise<string>(resolve => { fertig = resolve; }));
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    env.adapter.dispose();
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    fertig('{}');
    await Promise.resolve();
    aufgeraeumt(env);
  });

  it('hinterlässt auch nach mehrfacher Fokusrückkehr beim dispose keinen Timer', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = env.adapter.import.waehlen(vorgabe);
    env.fenster.dispatchEvent(new Event('focus'));
    env.fenster.dispatchEvent(new Event('focus'));
    env.adapter.dispose();
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Web-Ausgabe und Plattformdienste', () => {
  it.each([
    ['projekt.json', 'application/json;charset=utf-8'],
    ['terminplan.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['terminplan.pdf', 'application/pdf'],
  ] as const)('lädt %s mit denselben Bytes über einen Blob-Link und gibt die URL frei', async (name, mime) => {
    vi.useFakeTimers();
    const env = umgebung();
    let blob!: Blob;
    const erstellen = vi.spyOn(URL, 'createObjectURL').mockImplementation(wert => { blob = wert as Blob; return 'blob:probe'; });
    const freigeben = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const datei: AusgabeDatei = { name, mime, bytes: new Uint8Array([0, 1, 127, 195, 164, 255]) };
    await expect(env.adapter.ausgabe.exportieren(datei)).resolves.toEqual({ status: 'ok' });
    expect(erstellen).toHaveBeenCalledTimes(1);
    expect(blob.type).toBe(mime);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(datei.bytes);
    expect(env.dokument.createElement).toHaveBeenCalledExactlyOnceWith('a');
    expect(env.root.append).toHaveBeenCalledExactlyOnceWith(env.link);
    expect(env.link).toMatchObject({ href: 'blob:probe', download: name, hidden: true });
    expect(env.link.click).toHaveBeenCalledTimes(1);
    expect(env.link.remove).toHaveBeenCalledTimes(1);
    expect(freigeben).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(freigeben).toHaveBeenCalledExactlyOnceWith('blob:probe');
    expect(env.adapter.ausgabe.teilen).toBeUndefined();
    env.adapter.dispose();
  });

  it('meldet einen Downloadfehler und entfernt auch dann den Link und die URL', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:probe');
    const freigeben = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    env.link.click.mockImplementation(() => { throw new Error('Probe'); });
    await expect(env.adapter.ausgabe.exportieren({ name: 'probe.json', mime: 'application/json;charset=utf-8', bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'kein-ziel' });
    expect(env.link.remove).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(freigeben).toHaveBeenCalledExactlyOnceWith('blob:probe');
    env.adapter.dispose();
  });

  it('gibt bei fehlgeschlagener URL-Erstellung keine fremde URL frei', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('Probe'); });
    const freigeben = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await expect(env.adapter.ausgabe.exportieren({ name: 'probe.json', mime: 'application/json;charset=utf-8', bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'kein-ziel' });
    expect(env.link.remove).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(freigeben).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it('liefert ISO-Zeitpunkt und lokalen Kalendertag desselben Zeitpunkts', () => {
    vi.useFakeTimers();
    const datum = new Date(2026, 8, 30, 0, 15, 20);
    vi.setSystemTime(datum);
    const env = umgebung();
    expect(env.adapter.zeit()).toEqual({ zeitpunkt: datum.toISOString(), kalendertag: '2026-09-30' });
    env.adapter.dispose();
  });

  it.each([true, false])('gibt die Bestätigung zum Zurücksetzen unverändert als %s zurück', async zustimmung => {
    const env = umgebung();
    env.fenster.confirm.mockReturnValue(zustimmung);
    await expect(env.adapter.zuruecksetzenBestaetigen()).resolves.toBe(zustimmung);
    expect(env.fenster.confirm).toHaveBeenCalledExactlyOnceWith('Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?');
    env.adapter.dispose();
  });
});
