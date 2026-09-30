import { PlattformFehler, type AusgabeDatei, type AusgabeFormat, type AusgabeWeg, type RechnerOptionen, type ExportZeit } from './plattform';
import { projektAlsDatei } from './projekt-datei';
import type { ScheduleInput, ScheduleResult } from '@baremos/fristenrechner-kern';

export type ScheduleExportKind = 'excel' | 'pdf';

const labels = {
  projekt: {
    idle: 'Projekt exportieren', teilen: 'Projekt teilen', loading: 'Projektdatei wird erstellt …',
    progress: 'Projektdatei wird erstellt …', name: 'Projektdatei',
    error: 'Die Projektdatei konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
  },
  excel: {
    idle: 'Excel exportieren', teilen: 'Excel teilen', loading: 'Excel wird erstellt …',
    progress: 'Excel-Export wird geladen und erstellt …', name: 'Excel-Datei',
    error: 'Der Excel-Export konnte nicht geladen oder erstellt werden. Bitte versuchen Sie es erneut.',
  },
  pdf: {
    idle: 'PDF exportieren', teilen: 'PDF teilen', loading: 'PDF wird erstellt …',
    progress: 'PDF-Export wird geladen und erstellt …', name: 'PDF-Datei',
    error: 'Der PDF-Export konnte nicht geladen oder erstellt werden. Bitte versuchen Sie es erneut.',
  },
};

export function ausgabeBeschriftung(format: AusgabeFormat, weg: AusgabeWeg): string {
  return weg === 'teilen' ? labels[format].teilen : labels[format].idle;
}

/** Ein Auftrag erzeugt genau eine Datei und übergibt sie genau einem Ausgabeweg. */
export async function runDateiAusgabe(
  kind: AusgabeFormat,
  weg: AusgabeWeg,
  button: HTMLButtonElement,
  message: HTMLElement,
  erfassen: () => { input: ScheduleInput; result?: ScheduleResult; zeit: ExportZeit },
  optionen: RechnerOptionen,
  istAktiv: () => boolean = () => true,
): Promise<void> {
  const copy = labels[kind];
  const vorher = message.textContent;
  button.disabled = true;
  button.textContent = copy.loading;
  message.textContent = copy.progress;
  let transport = false;
  try {
    // Vor dem ersten await festhalten: spätere Eingaben gehören zum nächsten Auftrag.
    const { input, result, zeit } = erfassen();
    let datei: AusgabeDatei;
    if (kind === 'projekt') {
      datei = projektAlsDatei(input, zeit);
    } else {
      if (!result) throw new Error('Ein berechneter Terminplan fehlt.');
      if (kind === 'excel') {
        const { excelAlsDatei } = await import('./fristenrechner-export-excel');
        if (!istAktiv()) return;
        datei = excelAlsDatei(input, result, zeit, optionen.exportInhalt);
      } else {
        const { pdfAlsDatei } = await import('./fristenrechner-export-pdf');
        if (!istAktiv()) return;
        datei = await pdfAlsDatei(input, result, zeit, optionen.exportInhalt);
      }
    }
    if (!istAktiv()) return;
    transport = true;
    const adapter = optionen.plattform.ausgabe;
    const ausgeben = adapter[weg];
    if (!ausgeben) throw new PlattformFehler('nicht-verfuegbar', 'Der Ausgabeweg ist nicht verfügbar.');
    const ausgabe = await ausgeben.call(adapter, datei);
    if (istAktiv()) {
      message.textContent = ausgabe.status === 'abgebrochen' ? vorher
        : optionen.texte.ausgabeErfolg?.[weg]?.[kind]
          ?? (weg === 'exportieren' ? optionen.texte.exportErfolg : `Die ${copy.name} wurde zum Teilen bereitgestellt.`);
    }
  } catch (error) {
    if (istAktiv()) {
      message.textContent = !transport && error instanceof PlattformFehler && error.code === 'zu-gross'
        ? error.message
        : transport
          ? optionen.texte.ausgabeFehler?.[weg]?.[kind]
            ?? `Die ${copy.name} konnte nicht zum ${weg === 'teilen' ? 'Teilen' : 'Speichern'} bereitgestellt werden. Bitte versuchen Sie es erneut.`
          : optionen.texte.erzeugungsFehler?.[kind] ?? copy.error;
    }
  } finally {
    if (istAktiv()) { button.textContent = ausgabeBeschriftung(kind, weg); button.disabled = false; }
  }
}

/** Bestehender Einstieg für Terminplan-Exporte. */
export function runScheduleExport(
  kind: ScheduleExportKind,
  button: HTMLButtonElement,
  message: HTMLElement,
  input: ScheduleInput,
  result: ScheduleResult,
  optionen: RechnerOptionen,
  zeit: ExportZeit,
  istAktiv: () => boolean = () => true,
): Promise<void> {
  return runDateiAusgabe(kind, 'exportieren', button, message, () => ({ input, result, zeit }), optionen, istAktiv);
}
