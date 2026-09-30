import type { RechnerOptionen, ExportZeit } from './plattform';
import type { ScheduleInput, ScheduleResult } from '@baremos/fristenrechner-kern';

export type ScheduleExportKind = 'excel' | 'pdf';

const labels: Record<ScheduleExportKind, {
  idle: string;
  loading: string;
  progress: string;
  success: string;
  error: string;
}> = {
  excel: {
    idle: 'Excel exportieren',
    loading: 'Excel wird erstellt …',
    progress: 'Excel-Export wird geladen und erstellt …',
    success: 'Excel-Datei wurde erstellt.',
    error: 'Der Excel-Export konnte nicht geladen oder erstellt werden. Bitte versuchen Sie es erneut.',
  },
  pdf: {
    idle: 'PDF exportieren',
    loading: 'PDF wird erstellt …',
    progress: 'PDF-Export wird geladen und erstellt …',
    success: 'PDF-Datei wurde erstellt.',
    error: 'Der PDF-Export konnte nicht geladen oder erstellt werden. Bitte versuchen Sie es erneut.',
  },
};

export async function runScheduleExport(
  kind: ScheduleExportKind,
  button: HTMLButtonElement,
  message: HTMLElement,
  input: ScheduleInput,
  result: ScheduleResult,
  optionen: RechnerOptionen,
  zeit: ExportZeit,
  istAktiv: () => boolean = () => true,
): Promise<void> {
  const copy = labels[kind];
  button.disabled = true;
  button.textContent = copy.loading;
  message.textContent = copy.progress;
  try {
    let datei;
    if (kind === 'excel') {
      const { excelAlsDatei } = await import('./fristenrechner-export-excel');
      if (!istAktiv()) return;
      datei = excelAlsDatei(input, result, zeit, optionen.exportInhalt);
    } else {
      const { pdfAlsDatei } = await import('./fristenrechner-export-pdf');
      if (!istAktiv()) return;
      datei = await pdfAlsDatei(input, result, zeit, optionen.exportInhalt);
    }
    if (!istAktiv()) return;
    const ausgabe = await optionen.plattform.ausgabe.exportieren(datei);
    if (istAktiv()) message.textContent = ausgabe.status === 'ok' ? optionen.texte.exportErfolg : '';
  } catch {
    if (istAktiv()) message.textContent = copy.error;
  } finally {
    if (istAktiv()) { button.textContent = copy.idle; button.disabled = false; }
  }
}
