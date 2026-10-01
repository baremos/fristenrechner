import { describe, expect, it } from 'vitest';
import { FEHLERCODES, MAX_PROJEKT_BYTES, PlattformFehler, type Fehlercode } from '@baremos/fristenrechner-ui/ui';
import { erzeugeNativeProjektEingabe } from '../src/adapters/dateiimport';
import { halteAn, PluginFake } from './dateiablauf-fake';

const vorgabe = { mime: 'application/json' as const, endungen: ['.json'] as const, maxBytes: MAX_PROJEKT_BYTES };
const lesenText = 'Die Projektdatei konnte nicht gelesen werden.';
const groesseText = 'Die Projektdatei ist größer als 1 MiB.';
const fehlermeldungen: Record<Fehlercode, string> = {
  'nicht-verfuegbar': 'Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.',
  'kein-speicher': 'Der Zwischenspeicher für Dateien ist voll. Bitte versuchen Sie es später erneut.',
  'zu-gross': 'Die Datei ist zu groß. Erlaubt sind höchstens 2 MiB für PDF und 1 MiB für Excel- und Projektdateien.',
  lesen: 'Die Datei konnte nicht gelesen werden.',
  schreiben: 'Die Datei konnte nicht vollständig geschrieben werden. Bitte versuchen Sie es erneut.',
  'kein-ziel': 'Es ist keine passende App zum Speichern oder Teilen verfügbar.',
};

describe('Nativer Projektimport', () => {
  it('öffnet die Auswahl ohne Felder und liefert Name und Text unverändert', async () => {
    const plugin = new PluginFake();
    plugin.projekt = { status: 'ok', name: 'Änderung.json', text: ' { "name": "Geräte" }\n' };
    await expect(erzeugeNativeProjektEingabe(plugin).import.waehlen(vorgabe)).resolves.toEqual({
      status: 'ok', wert: { name: 'Änderung.json', text: ' { "name": "Geräte" }\n' },
    });
    expect(plugin.aufrufe).toEqual(['projektWaehlen']);
  });

  it('gibt Abbruch zurück und erlaubt eine erneute Auswahl', async () => {
    const plugin = new PluginFake();
    const adapter = erzeugeNativeProjektEingabe(plugin);
    plugin.projekt = { status: 'abgebrochen' };
    await expect(adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'abgebrochen' });
    plugin.projekt = { status: 'ok', name: 'projekt.json', text: '{}' };
    await expect(adapter.import.waehlen(vorgabe)).resolves.toEqual({ status: 'ok', wert: { name: 'projekt.json', text: '{}' } });
    expect(plugin.aufrufe).toEqual(['projektWaehlen', 'projektWaehlen']);
  });

  it.each(FEHLERCODES)('erhält Fehlercode %s mit dem deutschen Plugintext; zu-gross nennt die Projektdatei', async code => {
    const plugin = new PluginFake();
    plugin.eingriff = () => { throw { code, message: fehlermeldungen[code] }; };
    const fehler = await erzeugeNativeProjektEingabe(plugin).import.waehlen(vorgabe).catch(error => error);
    expect(fehler).toBeInstanceOf(PlattformFehler);
    // Der native Text zu zu-gross beschreibt die Ausgabegrenzen; der Import zeigt den Text der Oberfläche.
    expect(fehler).toMatchObject({ code, message: code === 'zu-gross' ? groesseText : fehlermeldungen[code] });
  });

  it.each([
    { code: 'EACCES', message: '/private/datei: permission denied' },
    new Error('/private/datei: permission denied'),
    { code: 'lesen' }, { code: 'lesen', message: '' }, { code: 'lesen', message: ' ' },
    { code: 'lesen', message: 1 }, { code: 1, message: '/private/datei' },
    undefined, null, '/private/datei: permission denied',
  ])('ersetzt unbrauchbare Fehlerdaten durch den festen Lesefehler: %j', async fehler => {
    const plugin = new PluginFake();
    plugin.eingriff = () => { throw fehler; };
    await expect(erzeugeNativeProjektEingabe(plugin).import.waehlen(vorgabe))
      .rejects.toMatchObject({ name: 'PlattformFehler', code: 'lesen', message: lesenText });
  });

  it.each([
    undefined, null, false, 'ok', [], {}, { status: 'bereitgestellt' }, { status: 'ok' },
    { status: 'ok', name: 1, text: '{}' }, { status: 'ok', name: '', text: '{}' },
    { status: 'ok', name: 'projekt.json', text: 1 },
    { status: 'ok', name: 'projekt.json', text: '{}', uri: 'content://probe' },
    { status: 'abgebrochen', text: '{}' },
    Object.create({ status: 'ok', name: 'projekt.json', text: '{}' }),
    Object.assign(['probe'], { status: 'ok', name: 'projekt.json', text: '{}' }),
    { status: 'ok', name: 'projekt.json', text: '{}', [Symbol('probe')]: true },
  ])('lehnt eine unerwartete Ergebnisform ab: %j', async projekt => {
    const plugin = new PluginFake();
    plugin.projekt = projekt;
    await expect(erzeugeNativeProjektEingabe(plugin).import.waehlen(vorgabe))
      .rejects.toMatchObject({ code: 'lesen', message: lesenText });
  });

  it.each([
    { maxBytes: MAX_PROJEKT_BYTES, bytes: MAX_PROJEKT_BYTES, ok: true },
    { maxBytes: MAX_PROJEKT_BYTES, bytes: MAX_PROJEKT_BYTES + 1, ok: false },
    { maxBytes: MAX_PROJEKT_BYTES * 2, bytes: MAX_PROJEKT_BYTES, ok: true },
    { maxBytes: MAX_PROJEKT_BYTES * 2, bytes: MAX_PROJEKT_BYTES + 1, ok: false },
    { maxBytes: 64, bytes: 64, ok: true },
    { maxBytes: 64, bytes: 65, ok: false },
  ])('prüft $bytes UTF-8-Bytes mit Vorgabe $maxBytes (zulässig: $ok)', async ({ maxBytes, bytes, ok }) => {
    const plugin = new PluginFake();
    const text = 'ä'.repeat(Math.floor(bytes / 2)) + (bytes % 2 ? 'a' : '');
    expect(new TextEncoder().encode(text).byteLength).toBe(bytes);
    plugin.projekt = { status: 'ok', name: 'projekt.json', text };
    const lauf = erzeugeNativeProjektEingabe(plugin).import.waehlen({ ...vorgabe, maxBytes });
    if (ok) await expect(lauf).resolves.toEqual({ status: 'ok', wert: { name: 'projekt.json', text } });
    else await expect(lauf).rejects.toMatchObject({ code: 'zu-gross', message: groesseText });
  });

  it('gibt die Sperre nach einem Lesefehler frei', async () => {
    const plugin = new PluginFake();
    const adapter = erzeugeNativeProjektEingabe(plugin);
    plugin.eingriff = () => { throw new Error('Probe'); };
    await expect(adapter.import.waehlen(vorgabe)).rejects.toMatchObject({ code: 'lesen' });
    plugin.eingriff = () => {};
    expect((await adapter.import.waehlen(vorgabe)).status).toBe('ok');
  });

  it.each([NaN, -1, Infinity, -Infinity, 1.5, undefined, '1'])('lehnt eine ungültige Größenvorgabe vor der Auswahl ab: %s', async maxBytes => {
    const plugin = new PluginFake();
    await expect(erzeugeNativeProjektEingabe(plugin).import.waehlen({ ...vorgabe, maxBytes: maxBytes as number }))
      .rejects.toMatchObject({ code: 'lesen', message: lesenText });
    expect(plugin.aufrufe).toEqual([]);
  });

  it('behält die geprüfte Größenvorgabe auch bei einer späteren Änderung des Aufrufers', async () => {
    const plugin = new PluginFake();
    const halt = halteAn(plugin, 'projektWaehlen');
    const begrenzt = { ...vorgabe, maxBytes: 1 };
    const lauf = erzeugeNativeProjektEingabe(plugin).import.waehlen(begrenzt);
    await halt.erreicht;
    begrenzt.maxBytes = NaN;
    halt.weiter.erfuellen();
    await expect(lauf).rejects.toMatchObject({ code: 'zu-gross', message: groesseText });
  });

  it('meldet kein Ergebnis, solange der native Leser wartet', async () => {
    const plugin = new PluginFake();
    const halt = halteAn(plugin, 'projektWaehlen');
    let beendet = false;
    const lauf = erzeugeNativeProjektEingabe(plugin).import.waehlen(vorgabe).then(ergebnis => { beendet = true; return ergebnis; });
    await halt.erreicht;
    expect(beendet).toBe(false);
    halt.weiter.erfuellen();
    expect((await lauf).status).toBe('ok');
  });
});

describe('Native Bestätigung zum Zurücksetzen', () => {
  it.each([true, false])('ruft den Dialog ohne Felder auf und liefert %s', async bestaetigt => {
    const plugin = new PluginFake();
    plugin.bestaetigung = { bestaetigt };
    await expect(erzeugeNativeProjektEingabe(plugin).zuruecksetzenBestaetigen()).resolves.toBe(bestaetigt);
    expect(plugin.aufrufe).toEqual(['zuruecksetzenBestaetigen']);
  });

  it.each([
    undefined, null, true, 'true', [], {}, { bestaetigt: 'true' }, { bestaetigt: 1 },
    { bestaetigt: true, status: 'ok' }, Object.create({ bestaetigt: true }),
    Object.assign([], { bestaetigt: true }), { bestaetigt: true, [Symbol('probe')]: true },
  ])('verweigert bei unerwarteter Ergebnisform die Bestätigung: %j', async bestaetigung => {
    const plugin = new PluginFake();
    plugin.bestaetigung = bestaetigung;
    await expect(erzeugeNativeProjektEingabe(plugin).zuruecksetzenBestaetigen()).resolves.toBe(false);
  });

  it.each([...FEHLERCODES, 'EACCES', undefined])('verweigert bei Fehler %s die Bestätigung und gibt danach die Sperre frei', async code => {
    const plugin = new PluginFake();
    const adapter = erzeugeNativeProjektEingabe(plugin);
    plugin.eingriff = () => { throw { code, message: '/private/datei: permission denied' }; };
    await expect(adapter.zuruecksetzenBestaetigen()).resolves.toBe(false);
    plugin.eingriff = () => {};
    await expect(adapter.zuruecksetzenBestaetigen()).resolves.toBe(true);
  });

  it('gibt keine Zustimmung vor der nativen Antwort', async () => {
    const plugin = new PluginFake();
    const halt = halteAn(plugin, 'zuruecksetzenBestaetigen');
    let beendet = false;
    const lauf = erzeugeNativeProjektEingabe(plugin).zuruecksetzenBestaetigen().then(ergebnis => { beendet = true; return ergebnis; });
    await halt.erreicht;
    expect(beendet).toBe(false);
    halt.weiter.erfuellen();
    await expect(lauf).resolves.toBe(true);
  });
});
