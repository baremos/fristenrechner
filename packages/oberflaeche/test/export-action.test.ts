import { afterEach, expect, it, vi } from 'vitest';
import { runDateiAusgabe, runScheduleExport, type ScheduleExportKind } from '../src/fristenrechner-export-action';
import { eingabe, ergebnis, ZEITPUNKT, KALENDERTAG } from './beispiel';
import { webTexte, webExportInhalt } from '../src/web-vorgaben';
import { PlattformFehler, type RechnerOptionen, type AusgabeDatei, type AusgabeFormat, type AusgabeWeg } from '../src/plattform';
const mocks = vi.hoisted(() => ({ excel: vi.fn(), pdf: vi.fn() }));
vi.mock('../src/fristenrechner-export-excel', () => ({ excelAlsDatei: mocks.excel }));
vi.mock('../src/fristenrechner-export-pdf', () => ({ pdfAlsDatei: mocks.pdf }));
const zeit = { zeitpunkt: ZEITPUNKT, kalendertag: KALENDERTAG };
const datei: AusgabeDatei = { name: 'probe.pdf', mime: 'application/pdf', bytes: new Uint8Array([1, 2]) };
function setup() {
  const ausgeben = vi.fn().mockResolvedValue({ status: 'ok' });
  const optionen: RechnerOptionen = {
    texte: webTexte, exportInhalt: webExportInhalt,
    plattform: {
      speicher: { lesen: vi.fn(), schreiben: vi.fn(), entfernen: vi.fn() },
      import: { waehlen: vi.fn() }, ausgabe: { exportieren: ausgeben },
      zeit: () => zeit, zuruecksetzenBestaetigen: vi.fn(),
    },
  };
  const button = { disabled: false, textContent: '' } as HTMLButtonElement;
  const message = { textContent: '' } as HTMLElement;
  return { ausgeben, optionen, button, message };
}
afterEach(() => { vi.resetAllMocks(); });

it.each(['excel', 'pdf'] as ScheduleExportKind[])('Exportstatus für %s: Start, Ausgabe und Ende', async kind => {
  const { button, message, optionen, ausgeben } = setup();
  let fertig!: (wert: { status: 'ok' }) => void;
  mocks[kind].mockReturnValue(datei);
  ausgeben.mockImplementation(() => new Promise(resolve => { fertig = resolve; }));
  const lauf = runScheduleExport(kind, button, message, eingabe, ergebnis, optionen, zeit);
  expect(button.disabled).toBe(true);
  expect(message.textContent).toContain('wird geladen');
  await vi.waitFor(() => expect(fertig).toBeTypeOf('function'));
  expect(mocks[kind]).toHaveBeenCalledWith(eingabe, ergebnis, zeit, webExportInhalt);
  expect(ausgeben).toHaveBeenCalledWith(datei);
  fertig({ status: 'ok' }); await lauf;
  expect(button.disabled).toBe(false);
  expect(button.textContent).toContain('exportieren');
  expect(message.textContent).toBe(webTexte.exportErfolg);
});
it.each(['excel', 'pdf'] as ScheduleExportKind[])('Fehler bei %s gibt die Bedienung wieder frei', async kind => {
  mocks[kind].mockImplementation(() => { throw new Error('Probe'); });
  const { button, message, optionen } = setup();
  await runScheduleExport(kind, button, message, eingabe, ergebnis, optionen, zeit);
  expect(button.disabled).toBe(false);
  expect(message.textContent).toContain('Bitte versuchen Sie es erneut');
});
it.each(['excel', 'pdf'] as ScheduleExportKind[])('Abbruch bei %s bleibt ohne Erfolgs- oder Fehlertext', async kind => {
  const { button, message, optionen, ausgeben } = setup();
  mocks[kind].mockReturnValue(datei);
  ausgeben.mockResolvedValue({ status: 'abgebrochen' });
  await runScheduleExport(kind, button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toBe('');
  expect(button.disabled).toBe(false);
});
it('dispose während PDF-Erzeugung verhindert Ausgabe und spätere DOM-Änderung', async () => {
  const { button, message, optionen, ausgeben } = setup();
  let fertig!: (wert: AusgabeDatei) => void;
  mocks.pdf.mockImplementation(() => new Promise(resolve => { fertig = resolve; }));
  let aktiv = true;
  const lauf = runScheduleExport('pdf', button, message, eingabe, ergebnis, optionen, zeit, () => aktiv);
  await vi.waitFor(() => expect(fertig).toBeTypeOf('function'));
  aktiv = false;
  message.textContent = 'entfernt';
  fertig(datei); await lauf;
  expect(ausgeben).not.toHaveBeenCalled();
  expect(message.textContent).toBe('entfernt');
});
it('Fehler bei der Ausgabe ist ein Exportfehler', async () => {
  const { button, message, optionen, ausgeben } = setup();
  mocks.excel.mockReturnValue(datei);
  ausgeben.mockRejectedValue(new Error('Ausgabe'));
  await runScheduleExport('excel', button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toContain('Bitte versuchen Sie es erneut');
  expect(button.disabled).toBe(false);
});

it.each(['excel', 'pdf'] as ScheduleExportKind[])('unterscheidet Erzeugungs- und Transportfehler bei %s', async kind => {
  const { button, message, optionen, ausgeben } = setup();
  mocks[kind].mockImplementationOnce(() => { throw new Error('Erzeugung'); });
  await runScheduleExport(kind, button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toContain('nicht geladen oder erstellt');
  expect(ausgeben).not.toHaveBeenCalled();
  mocks[kind].mockReturnValue(datei); ausgeben.mockRejectedValue(new Error('Transport'));
  await runScheduleExport(kind, button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toContain('nicht zum Speichern bereitgestellt');
  expect(message.textContent).not.toContain('erstellt');
});

it.each([
  new PlattformFehler('schreiben', 'Die Datei konnte nicht vollständig geschrieben werden. Bitte versuchen Sie es erneut. Am gewählten Speicherort kann eine unvollständige Datei liegen.'),
  new PlattformFehler('zu-gross', 'Die Datei ist zu groß. Erlaubt sind höchstens 2 MiB für PDF und 1 MiB für Excel- und Projektdateien.'),
])('zeigt den erklärten Transportfehler $code unverändert', async fehler => {
  const { button, message, optionen, ausgeben } = setup();
  mocks.pdf.mockResolvedValue(datei);
  ausgeben.mockRejectedValue(fehler);
  await runScheduleExport('pdf', button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toBe(fehler.message);
  expect(button.disabled).toBe(false);
});

it('übernimmt keine Betriebssystemmeldung aus einem unbekannten Transportfehler', async () => {
  const { button, message, optionen, ausgeben } = setup();
  mocks.pdf.mockResolvedValue(datei);
  ausgeben.mockRejectedValue(new Error('EIO: /privater/pfad/projekt.pdf'));
  await runScheduleExport('pdf', button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toBe('Die PDF-Datei konnte nicht zum Speichern bereitgestellt werden. Bitte versuchen Sie es erneut.');
});

it('gibt dem Gastgebertext Vorrang vor einer erklärten Transportfehlermeldung', async () => {
  const { button, message, optionen, ausgeben } = setup();
  mocks.pdf.mockResolvedValue(datei);
  optionen.texte = { ...webTexte, ausgabeFehler: { exportieren: { pdf: 'Hinweis des Gastgebers' } } };
  ausgeben.mockRejectedValue(new PlattformFehler('schreiben', 'Hinweis des Adapters'));
  await runScheduleExport('pdf', button, message, eingabe, ergebnis, optionen, zeit);
  expect(message.textContent).toBe('Hinweis des Gastgebers');
});

const wege: AusgabeWeg[] = ['exportieren', 'teilen'];
const formate: AusgabeFormat[] = ['projekt', 'excel', 'pdf'];
it.each(formate.flatMap(format => wege.map(weg => ({ format, weg }))))('getrennte Gastgebertexte für $format/$weg und Abbruch ohne Meldungsänderung', async ({ format, weg }) => {
  const { button, message, optionen, ausgeben } = setup();
  const teilen = vi.fn().mockResolvedValue({ status: 'ok' }); optionen.plattform.ausgabe.teilen = teilen;
  const adapter = weg === 'teilen' ? teilen : ausgeben;
  mocks.excel.mockReturnValue(datei); mocks.pdf.mockResolvedValue(datei);
  optionen.texte = { ...webTexte,
    ausgabeErfolg: { [weg]: { [format]: 'Bestätigt vom gewählten Adapter' } },
    ausgabeFehler: { [weg]: { [format]: 'Fehler des gewählten Adapters' } },
    erzeugungsFehler: { [format]: 'Fehler des gewählten Erzeugers' },
  };
  const erfassen = vi.fn(() => ({ input: eingabe, result: ergebnis, zeit }));
  await runDateiAusgabe(format, weg, button, message, erfassen, optionen);
  expect(erfassen).toHaveBeenCalledTimes(1); expect(adapter).toHaveBeenCalledTimes(1);
  expect(weg === 'teilen' ? ausgeben : teilen).not.toHaveBeenCalled();
  expect(message.textContent).toBe('Bestätigt vom gewählten Adapter');
  adapter.mockResolvedValueOnce({ status: 'abgebrochen' });
  await runDateiAusgabe(format, weg, button, message, erfassen, optionen);
  expect(message.textContent).toBe('Bestätigt vom gewählten Adapter'); expect(button.disabled).toBe(false);
  adapter.mockRejectedValueOnce(new Error('Transport'));
  await runDateiAusgabe(format, weg, button, message, erfassen, optionen);
  expect(message.textContent).toBe('Fehler des gewählten Adapters');
  erfassen.mockImplementationOnce(() => { throw new Error('Erzeugung'); });
  await runDateiAusgabe(format, weg, button, message, erfassen, optionen);
  expect(message.textContent).toBe('Fehler des gewählten Erzeugers'); expect(adapter).toHaveBeenCalledTimes(3);
});

it('fällt bei fehlender Teilen-Fähigkeit niemals auf Speichern zurück', async () => {
  const { button, message, optionen, ausgeben } = setup();
  await runDateiAusgabe('projekt', 'teilen', button, message, () => ({ input: eingabe, zeit }), optionen);
  expect(ausgeben).not.toHaveBeenCalled();
  expect(message.textContent).toBe('Der Ausgabeweg ist nicht verfügbar.');
  expect(button.disabled).toBe(false);
});
