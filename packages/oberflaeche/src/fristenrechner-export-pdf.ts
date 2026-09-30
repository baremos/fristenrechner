import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { ScheduleInput, ScheduleResult } from '@baremos/fristenrechner-kern';
import type { AusgabeDatei, ExportInhalt, ExportZeit } from './plattform';
import {
  exportFileSuffix,
  exportHinweis,
  formatExportDate,
  phaseLabels,
  procedureLabel,
  projectHeader,
  pruefeExportInhalt,
  regimeShortLabel,
  regelstandText,
  stateLabels,
  typeLabels,
  uniqueWarnings,
} from './fristenrechner-export-data';

type PdfWithLastTable = JsPdfDocument & {
  lastAutoTable?: { finalY?: number };
};

const ACCENT: [number, number, number] = [167, 48, 60];
const DARK: [number, number, number] = [52, 52, 56];
const MUTED: [number, number, number] = [93, 93, 98];

// Phasenfarben wie in der Web-Zeitschiene (fristenrechner-ui.ts phaseColors)
const PHASE_RGB: Record<string, [number, number, number]> = {
  einholung: [167, 48, 60],
  teilnahmewettbewerb: [118, 82, 143],
  verhandlung: [49, 95, 140],
  bewertung: [47, 111, 115],
  teststellung: [165, 103, 33],
  zuschlag: [77, 107, 60],
};

async function createSchedulePdf(input: ScheduleInput, result: ScheduleResult, zeit: ExportZeit, inhalt: ExportInhalt): Promise<JsPdfDocument> {
  pruefeExportInhalt(inhalt);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.setCreationDate(new Date(zeit.zeitpunkt));

  const drawPageChrome = (pageDocument: JsPdfDocument): void => {
    const pageWidth = pageDocument.internal.pageSize.getWidth();
    const pageHeight = pageDocument.internal.pageSize.getHeight();
    pageDocument.setFont('helvetica', 'normal');
    pageDocument.setTextColor(...DARK);
    pageDocument.setFontSize(8);
    const headerLines = pageDocument.splitTextToSize(projectHeader(input), pageWidth - 24).slice(0, 2);
    pageDocument.text(headerLines, 12, 9.5);
    pageDocument.setDrawColor(184, 184, 181);
    pageDocument.setLineWidth(0.25);
    pageDocument.line(12, 17, pageWidth - 12, 17);

    pageDocument.line(12, pageHeight - 18, pageWidth - 12, pageHeight - 18);
    pageDocument.setFontSize(6.8);
    pageDocument.setTextColor(...MUTED);
    pageDocument.text(
      exportHinweis(inhalt),
      pageWidth / 2,
      pageHeight - 13.5,
      { align: 'center', maxWidth: pageWidth - 24 },
    );
    pageDocument.setFontSize(8);
    pageDocument.text(inhalt.herausgeber, 12, pageHeight - 8.5);
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...ACCENT);
  pdf.setFontSize(15);
  pdf.text(inhalt.titel, 12, 25);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...DARK);
  pdf.setFontSize(8.5);
  pdf.text(
    `Verfahrensart: ${regimeShortLabel(input)} · ${procedureLabel(input)}`,
    12,
    32,
    { maxWidth: 91 },
  );
  pdf.text(`Bundesland: ${stateLabels[input.bundesland]}`, 108, 32, { maxWidth: 90 });
  pdf.text(`Erstellungsdatum: ${formatExportDate(zeit.kalendertag)}`, 12, 39, { maxWidth: 91 });
  pdf.text(`Rechtsstand: ${result.rechtsstand}`, 108, 39, { maxWidth: 90 });
  pdf.text(regelstandText(result), 12, 46, { maxWidth: 186 });
  const tableStartY = result.bindefrist ? 62 : 55;
  if (result.bindefrist) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(
      `Bindefrist: Endtermin ${formatExportDate(result.bindefrist.termin)} · Dauer ${result.bindefrist.tage} KT ab Angebotsabgabe ${formatExportDate(result.bindefrist.basis)}`,
      12,
      53,
      { maxWidth: 186 },
    );
    pdf.setFont('helvetica', 'normal');
  }

  const phaseNames = new Map(result.phasen.map((phase) => [phase.id, phase.label]));
  autoTable(pdf, {
    startY: tableStartY,
    margin: { top: 21, right: 12, bottom: 23, left: 12 },
    head: [['Datum / Zeitraum', 'Termin', 'Phase', 'Rechtsgrundlage / Fristtyp']],
    body: result.meilensteine.map((milestone) => [
      milestone.bis !== undefined && milestone.dauerAT !== undefined
        ? `${formatExportDate(milestone.datum)} – ${formatExportDate(milestone.bis)}\n${milestone.dauerAT} AT`
        : formatExportDate(milestone.datum),
      milestone.label,
      phaseNames.get(milestone.phase) ?? phaseLabels[milestone.phase],
      [milestone.rechtsgrundlage, typeLabels[milestone.fristTyp]].filter(Boolean).join('\n'),
    ]),
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [215, 215, 211],
      lineWidth: 0.2,
      textColor: DARK,
    },
    headStyles: {
      fillColor: ACCENT,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 248, 247] },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 65 },
      2: { cellWidth: 35 },
      3: { cellWidth: 52 },
    },
  });

  const warnings = uniqueWarnings(result);
  if (warnings.length > 0) {
    const finalY = (pdf as PdfWithLastTable).lastAutoTable?.finalY ?? tableStartY;
    autoTable(pdf, {
      startY: finalY + 7,
      margin: { top: 21, right: 12, bottom: 23, left: 12 },
      head: [['Warnungen']],
      body: warnings.map((warning) => [warning]),
      theme: 'grid',
      showHead: 'firstPage',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.5,
        overflow: 'linebreak',
        lineColor: [218, 178, 126],
        lineWidth: 0.2,
        textColor: DARK,
        fillColor: [255, 248, 239],
      },
      headStyles: {
        fillColor: [165, 103, 33],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
    });
  }

  // Zeitschiene mit den Phasenblöcken auf eigener Seite nach der
  // Tabellenübersicht  — Darstellung wie die
  // Web-Zeitschiene: farbiger Phasenkopf, Zeitraum, Meilensteinliste.
  if (result.phasen.length > 0) {
    const milestonesById = new Map(result.meilensteine.map((milestone) => [milestone.id, milestone]));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const bottomLimit = pdf.internal.pageSize.getHeight() - 23;
    const left = 12;
    const width = pageWidth - 24;
    pdf.addPage();
    let y = 25;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...ACCENT);
    pdf.setFontSize(12);
    pdf.text('Zeitschiene', left, y);
    y += 7;

    result.phasen.forEach((phase, index) => {
      const zeilen = phase.meilensteine
        .map((id) => milestonesById.get(id))
        .filter((milestone): milestone is NonNullable<typeof milestone> => milestone !== undefined)
        .map((milestone) => {
          const zeitraum = milestone.bis !== undefined && milestone.dauerAT !== undefined
            ? `${formatExportDate(milestone.datum)} – ${formatExportDate(milestone.bis)} (${milestone.dauerAT} AT)`
            : formatExportDate(milestone.datum);
          return `•  ${zeitraum}: ${milestone.label}`;
        });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      const umgebrochen = zeilen.flatMap((zeile) => pdf.splitTextToSize(zeile, width - 6) as string[]);
      const blockHoehe = 6.5 + 4.5 + umgebrochen.length * 4 + 4;
      if (y + blockHoehe > bottomLimit) {
        pdf.addPage();
        y = 25;
      }

      const farbe = PHASE_RGB[phase.id] ?? ACCENT;
      pdf.setFillColor(...farbe);
      pdf.rect(left, y, width, 6.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`Phase ${index + 1} · ${phase.label}`, left + 2, y + 4.5);
      pdf.setFont('helvetica', 'normal');
      const zeitraumText = phase.von === phase.bis
        ? formatExportDate(phase.von)
        : `${formatExportDate(phase.von)} – ${formatExportDate(phase.bis)}`;
      pdf.text(zeitraumText, left + width - 2, y + 4.5, { align: 'right' });
      y += 6.5 + 5;

      pdf.setTextColor(...DARK);
      pdf.setFontSize(8.5);
      umgebrochen.forEach((zeile) => {
        pdf.text(zeile, left + 2, y);
        y += 4;
      });
      y += 4;
    });
  }

  const totalPages = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);
    drawPageChrome(pdf);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(`Seite ${pageNumber} von ${totalPages}`, pageWidth - 12, pageHeight - 8.5, { align: 'right' });
  }
  return pdf;
}

export async function pdfAlsDatei(input: ScheduleInput, result: ScheduleResult, zeit: ExportZeit, inhalt: ExportInhalt): Promise<AusgabeDatei> {
  const pdf = await createSchedulePdf(input, result, zeit, inhalt);
  return {
    name: `${inhalt.dateiPraefix}fristenplan-${exportFileSuffix(input, zeit.kalendertag)}.pdf`,
    mime: 'application/pdf',
    bytes: new Uint8Array(pdf.output('arraybuffer')),
  };
}
