import { afterEach, expect, it, vi } from 'vitest';
import { runScheduleExport, type ScheduleExportKind } from '../src/fristenrechner-export-action';
import { eingabe, ergebnis } from './beispiel';
const mocks = vi.hoisted(() => ({ excel: vi.fn(), pdf: vi.fn() }));
vi.mock('../src/fristenrechner-export-excel', () => ({ exportScheduleExcel: mocks.excel }));
vi.mock('../src/fristenrechner-export-pdf', () => ({ exportSchedulePdf: mocks.pdf }));
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

it.each(['excel', 'pdf'] as ScheduleExportKind[])('Exportstatus für %s: Start, Erfolg und Ende', async kind => {
  const button = { disabled: false, textContent: '' } as HTMLButtonElement;
  const message = { textContent: '' } as HTMLElement;
  let fertig!: () => void;
  mocks[kind].mockImplementation(() => new Promise<void>(resolve => { fertig = resolve; }));
  const lauf = runScheduleExport(kind, button, message, eingabe, ergebnis);
  expect(button.disabled).toBe(true);
  expect(message.textContent).toContain('wird geladen');
  await vi.waitFor(() => expect(fertig).toBeTypeOf('function'));
  expect(mocks[kind]).toHaveBeenCalledWith(eingabe, ergebnis);
  fertig(); await lauf;
  expect(button.disabled).toBe(false);
  expect(button.textContent).toContain('exportieren');
  expect(message.textContent).toContain('wurde erstellt');
});
it.each(['excel', 'pdf'] as ScheduleExportKind[])('Fehler bei %s gibt die Bedienung wieder frei', async kind => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks[kind].mockRejectedValue(new Error('Probe'));
  const button = { disabled: false, textContent: '' } as HTMLButtonElement;
  const message = { textContent: '' } as HTMLElement;
  await runScheduleExport(kind, button, message, eingabe, ergebnis);
  expect(button.disabled).toBe(false);
  expect(message.textContent).toContain('Bitte versuchen Sie es erneut');
});
