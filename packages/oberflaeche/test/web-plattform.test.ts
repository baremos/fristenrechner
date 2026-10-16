import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROJEKT_BYTES, type AusgabeDatei, type Auswahl } from '../src/plattform';
import { erzeugeWebPlattform, erzeugeWebSpeicher, webZeit, WEB_SPEICHERSCHLUESSEL } from '../src/web-plattform';

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
  override dispatchEvent(event: Event): boolean {
    // Node setzt die Phase schon zwischen Capture- und weiteren Listenern zurück.
    // Das DOM behält sie bis zum Ende der Auslieferung bei.
    Object.defineProperty(event, 'eventPhase', { value: Event.AT_TARGET, configurable: true });
    try { return super.dispatchEvent(event); }
    finally { Object.defineProperty(event, 'eventPhase', { value: Event.NONE, configurable: true }); }
  }
  async dispatchMitMikrotasks(event: Event): Promise<void> {
    // Node fügt zwischen Listenern keine Browser-Mikrotask-Prüfpunkte ein.
    Object.defineProperty(event, 'eventPhase', { value: Event.AT_TARGET, configurable: true });
    try {
      for (const handler of this.handlers.get(event.type) ?? []) {
        if (typeof handler === 'function') handler.call(this, event); else handler.handleEvent(event);
        await Promise.resolve();
      }
    } finally { Object.defineProperty(event, 'eventPhase', { value: Event.NONE }); }
  }
}

function nutzerEreignis(typ = 'click', eigenschaften: Record<string, unknown> = {}): Event {
  const event = new Event(typ);
  Object.defineProperty(event, 'isTrusted', { value: true, configurable: true });
  Object.assign(event, eigenschaften);
  return event;
}

function umgebung(vorAdapter?: (fenster: Ziel) => void) {
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
  vorAdapter?.(fenster);
  const adapter = erzeugeWebPlattform(root as unknown as HTMLElement);
  return { adapter, feld, fenster, localStorage, werte, root, dokument, link };
}

function datei(text = '{}', name = 'projekt.json', size = new TextEncoder().encode(text).byteLength) {
  return { name, size, text: vi.fn(async () => text) };
}
const vorgabe = { mime: 'application/json' as const, endungen: ['.json'] as const, maxBytes: MAX_PROJEKT_BYTES };
type Umgebung = ReturnType<typeof umgebung>;
function mitNutzergeste<T>(env: Umgebung, aufruf: () => T, event = nutzerEreignis()): T {
  let ergebnis!: T;
  env.fenster.addEventListener(event.type, () => { ergebnis = aufruf(); }, { once: true });
  env.fenster.dispatchEvent(event);
  return ergebnis;
}
function waehlenMitNutzergeste(env: Umgebung, optionen = vorgabe) {
  return mitNutzergeste(env, () => env.adapter.import.waehlen(optionen));
}
function aufgeraeumt(env: Umgebung): void {
  expect(env.feld.anzahl('change')).toBe(0);
  expect(env.feld.anzahl('cancel')).toBe(0);
  expect(env.fenster.anzahl('focus')).toBe(0);
  expect(Reflect.get(env.feld, 'value')).toBe('');
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Web-Speicher', () => {
  it('verwendet den gemeinsamen Speicher auch unabhängig vom Dateifeld', async () => {
    const env = umgebung();
    const speicher = erzeugeWebSpeicher(env.fenster as unknown as Window);
    await speicher.schreiben('{"projekt":2}');
    expect(await env.adapter.speicher.lesen()).toBe('{"projekt":2}');
    await env.adapter.speicher.entfernen();
    expect(await speicher.lesen()).toBeNull();
    expect(env.feld.click).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

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
    const lauf = waehlenMitNutzergeste(env);
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

  it.each([false, true])('öffnet bei einem direkten Feldklick mit Mikrotask-Prüfpunkten=%s keinen zweiten Dialog', async mikrotasks => {
    const env = umgebung(fenster => {
      Object.assign(fenster, { navigator: { userActivation: { isActive: false } } });
    });
    let lauf!: Promise<Auswahl<{ name: string; text: string }>>;
    const ausloesen = () => { lauf = env.adapter.import.waehlen(vorgabe); };
    env.feld.addEventListener('click', ausloesen);
    if (mikrotasks) await env.feld.dispatchMitMikrotasks(nutzerEreignis());
    else env.feld.dispatchEvent(nutzerEreignis());
    expect(env.feld.click).not.toHaveBeenCalled();
    expect(env.feld.anzahl('cancel')).toBe(1);
    env.feld.dispatchEvent(new Event('cancel'));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    env.feld.removeEventListener('click', ausloesen);
    env.adapter.dispose();
  });

  it('bricht ohne Nutzergeste ab, ohne Feld, Handler oder Vorgaben zu verändern', async () => {
    const env = umgebung();
    env.feld.files = [datei()];
    await expect(env.adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    expect(env.feld.files).toHaveLength(1);
    expect(env.feld.accept).toBe('');
    expect(env.feld.anzahl('change')).toBe(0);
    expect(env.feld.anzahl('cancel')).toBe(0);
    expect(env.fenster.anzahl('focus')).toBe(0);
    env.adapter.dispose();
  });

  it('beachtet die Browseraktivierung auch in einem früher registrierten Fenster-Capture-Listener', async () => {
    let env!: Umgebung; let lauf!: ReturnType<typeof env.adapter.import.waehlen>;
    env = umgebung(fenster => {
      Object.assign(fenster, { navigator: { userActivation: { isActive: true } } });
      fenster.addEventListener('click', () => { lauf = env.adapter.import.waehlen(vorgabe); }, true);
    });
    env.fenster.dispatchEvent(nutzerEreignis());
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.dispatchEvent(new Event('cancel'));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    env.adapter.dispose();
  });

  it('bricht bei erloschener Browseraktivierung auch während eines laufenden Nutzerereignisses ab', async () => {
    const env = umgebung(fenster => {
      Object.assign(fenster, { navigator: { userActivation: { isActive: false } } });
    });
    await expect(mitNutzergeste(env, () => env.adapter.import.waehlen(vorgabe))).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('nutzt bei navigator ohne userActivation die laufende erfasste Nutzergeste', async () => {
    const env = umgebung(fenster => { Object.assign(fenster, { navigator: {} }); });
    const lauf = waehlenMitNutzergeste(env);
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.dispatchEvent(new Event('cancel'));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    await expect(env.adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.adapter.dispose();
  });

  it('bricht ohne userActivation im früher registrierten Fenster-Capture-Listener ohne Klick ab', async () => {
    let env!: Umgebung; let lauf!: ReturnType<typeof env.adapter.import.waehlen>;
    env = umgebung(fenster => {
      Object.assign(fenster, { navigator: {} });
      fenster.addEventListener('click', () => { lauf = env.adapter.import.waehlen(vorgabe); }, true);
    });
    env.fenster.dispatchEvent(nutzerEreignis());
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it('wertet einen synthetischen Feldklick ohne Nutzergeste als Abbruch', async () => {
    const env = umgebung();
    let lauf!: ReturnType<typeof env.adapter.import.waehlen>;
    env.feld.addEventListener('click', () => { lauf = env.adapter.import.waehlen(vorgabe); });
    env.feld.click();
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    expect(env.feld.anzahl('cancel')).toBe(0);
    env.adapter.dispose();
  });

  it.each([
    ['click', {}], ['mousedown', {}], ['keydown', { key: 'Enter' }], ['keydown', { key: ' ' }],
    ['keydown', { key: 'Enter', ctrlKey: true }], ['keydown', { key: 'Enter', altKey: true }],
    ['keydown', { key: 'Enter', metaKey: true }],
    ['pointerdown', { pointerType: 'mouse' }], ['pointerup', { pointerType: 'touch' }], ['touchend', {}],
  ] as const)('erlaubt während %s den synchronen Gastgeberimport ohne userActivation', async (typ, eigenschaften) => {
    const env = umgebung();
    expect(Reflect.get(env.fenster, 'navigator')).toBeUndefined();
    const lauf = mitNutzergeste(env, () => env.adapter.import.waehlen(vorgabe), nutzerEreignis(typ, eigenschaften));
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.dispatchEvent(new Event('cancel'));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    env.adapter.dispose();
  });

  it.each([
    new Event('click'), nutzerEreignis('keydown', { key: 'Escape' }),
    nutzerEreignis('pointerdown', { pointerType: 'touch' }),
    nutzerEreignis('pointerup', { pointerType: 'mouse' }),
  ])('öffnet für das nicht aktivierende Ereignis %# keine Auswahl', async event => {
    const env = umgebung();
    await expect(mitNutzergeste(env, () => env.adapter.import.waehlen(vorgabe), event)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('lässt nach Ende der Nutzergeste auch vor dem nächsten Timer keine Aktivierung bestehen', async () => {
    const env = umgebung();
    mitNutzergeste(env, () => {});
    await Promise.resolve();
    await expect(env.adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it('erkennt eine synthetische erneute Auslieferung eines früheren Nutzerereignisses nicht als Nutzergeste', async () => {
    const env = umgebung(); const event = nutzerEreignis();
    mitNutzergeste(env, () => {}, event);
    // dispatchEvent setzt isTrusted bei erneuter Auslieferung im Browser zurück.
    Object.defineProperty(event, 'isTrusted', { value: false });
    await expect(mitNutzergeste(env, () => env.adapter.import.waehlen(vorgabe), event)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).not.toHaveBeenCalled();
    env.adapter.dispose();
  });

  it.each([false, true])('registriert mit userActivation und isActive=%s beim Erzeugen und dispose keine Fenster-Listener', isActive => {
    const registrieren = vi.fn(); const entfernen = vi.fn();
    const env = umgebung(fenster => {
      Object.assign(fenster, { navigator: { userActivation: { isActive } } });
      vi.spyOn(fenster, 'addEventListener').mockImplementation(registrieren);
      vi.spyOn(fenster, 'removeEventListener').mockImplementation(entfernen);
    });
    expect(registrieren).toHaveBeenCalledTimes(0);
    expect(env.feld.anzahl('click')).toBe(1);
    env.adapter.dispose(); env.adapter.dispose();
    expect(registrieren).toHaveBeenCalledTimes(0);
    expect(entfernen).toHaveBeenCalledTimes(0);
    expect(env.feld.anzahl('click')).toBe(0);
  });

  it('räumt ohne userActivation die Aktivierungslistener beim dispose auf', () => {
    const env = umgebung();
    const typen = ['click', 'keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend'];
    for (const typ of typen) expect(env.fenster.anzahl(typ)).toBe(1);
    env.adapter.dispose(); env.adapter.dispose();
    for (const typ of typen) expect(env.fenster.anzahl(typ)).toBe(0);
  });

  it('akzeptiert dieselbe Datei nach Abschluss erneut', async () => {
    const env = umgebung();
    const probe = datei();
    for (let nr = 0; nr < 2; nr += 1) {
      const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env);
    env.feld.dispatchEvent(new Event(typ));
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    env.adapter.dispose();
  });

  it('erkennt einen Abbruch über den focus-Fallback für Chromium 83', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env, { ...vorgabe, maxBytes: MAX_PROJEKT_BYTES * 2 });
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
    const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env);
    env.feld.files = [datei(text)];
    env.feld.dispatchEvent(new Event('change'));
    await expect(lauf).resolves.toMatchObject({ status: 'ok', wert: { text } });
    const klein = waehlenMitNutzergeste(env, { ...vorgabe, maxBytes: 1 });
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
    const lauf = waehlenMitNutzergeste(env);
    const erwartet = expect(lauf).rejects.toMatchObject({ code: 'lesen' });
    const probe = datei();
    probe.text.mockRejectedValue(new Error('Probe'));
    env.feld.files = [probe];
    env.feld.dispatchEvent(new Event('change'));
    await erwartet;
    aufgeraeumt(env);
    const danach = waehlenMitNutzergeste(env);
    env.feld.dispatchEvent(new Event('cancel'));
    expect((await danach).status).toBe('abgebrochen');
    env.adapter.dispose();
  });

  it('weist eine gleichzeitige Auswahl zurück und lässt die erste bestehen', async () => {
    const env = umgebung();
    const erster = waehlenMitNutzergeste(env);
    await expect(waehlenMitNutzergeste(env)).rejects.toMatchObject({ code: 'lesen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.feld.files = [datei()];
    env.feld.dispatchEvent(new Event('change'));
    expect((await erster).status).toBe('ok');
    env.adapter.dispose();
  });

  it('räumt bei dispose die offene Auswahl, Handler und Fallback-Timer auf', async () => {
    vi.useFakeTimers();
    const env = umgebung();
    const lauf = waehlenMitNutzergeste(env);
    env.fenster.dispatchEvent(new Event('focus'));
    env.adapter.dispose();
    await expect(lauf).resolves.toEqual({ status: 'abgebrochen' });
    aufgeraeumt(env);
    expect(env.feld.anzahl('click')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(waehlenMitNutzergeste(env)).resolves.toEqual({ status: 'abgebrochen' });
    expect(env.feld.click).toHaveBeenCalledTimes(1);
    env.adapter.dispose();
  });

  it('übernimmt nach dispose kein verspätetes Leseergebnis', async () => {
    const env = umgebung();
    let fertig!: (text: string) => void;
    const probe = datei();
    probe.text.mockImplementation(() => new Promise<string>(resolve => { fertig = resolve; }));
    const lauf = waehlenMitNutzergeste(env);
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
    const lauf = waehlenMitNutzergeste(env);
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
    expect(webZeit()).toEqual(env.adapter.zeit());
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
