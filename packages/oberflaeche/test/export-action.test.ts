import { afterEach, expect, it, vi } from 'vitest';
import { runScheduleExport, type ScheduleExportKind } from '../src/fristenrechner-export-action';
import { eingabe, ergebnis, ZEITPUNKT, KALENDERTAG } from './beispiel';
import { webTexte, webExportInhalt } from '../src/web-vorgaben';
import type { RechnerOptionen, AusgabeDatei } from '../src/plattform';
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
