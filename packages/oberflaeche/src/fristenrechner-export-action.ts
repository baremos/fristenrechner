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
): Promise<void> {
  const copy = labels[kind];
  button.disabled = true;
  button.textContent = copy.loading;
  message.textContent = copy.progress;
  try {
    if (kind === 'excel') {
      const { exportScheduleExcel } = await import('./fristenrechner-export-excel');
      await exportScheduleExcel(input, result);
    } else {
      const { exportSchedulePdf } = await import('./fristenrechner-export-pdf');
      await exportSchedulePdf(input, result);
    }
    message.textContent = copy.success;
  } catch (error) {
    console.error(`${kind.toUpperCase()}-Export fehlgeschlagen.`, error);
    message.textContent = copy.error;
  } finally {
    button.textContent = copy.idle;
    button.disabled = false;
  }
}
