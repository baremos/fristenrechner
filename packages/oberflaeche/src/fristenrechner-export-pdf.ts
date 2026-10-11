import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { ScheduleInput, ScheduleResult } from '@baremos/fristenrechner-kern';
import type { AusgabeDatei, ExportInhalt, ExportZeit } from './plattform';
import {
  exportFileSuffix,
  exportHaftungshinweis,
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
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = (): number => pdf.getFontSize() * pdf.getLineHeightFactor() / pdf.internal.scaleFactor;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const footerLines = inhalt.adresse ? [inhalt.adresse.text, exportHaftungshinweis] : [exportHaftungshinweis];
  const footerLineHeight = lineHeight();
  const footerBlockHeight = (footerLines.length - 1) * footerLineHeight;
  // Unterste Grundlinie: bisherige erste Fußzeile (13,5 mm Rand) plus eine
  // 8-pt-Zeile. Ohne Adresse entfällt die obere Zeile. Die bisherigen Abstände
  // von 4,5 mm zur Trennlinie und 5 mm zum Inhalt bleiben erhalten.
  const footerLastY = pageHeight - 13.5 + footerLineHeight;
  const footerFirstY = footerLastY - footerBlockHeight;
  const footerMiddleY = footerFirstY + footerBlockHeight / 2;
  const footerDividerY = footerFirstY - 4.5;
  const bottomLimit = footerDividerY - 5;
  const tableMarginBottom = pageHeight - bottomLimit;
  // Der mittige Block und die seitlichen Texte müssen ohne Umbruch und ohne
  // Überlagerung in die Fußzeile passen; Schrift und Wortlaut bleiben fest.
  const footerCenterWidth = Math.max(...footerLines.map(text => pdf.getTextWidth(text)));
  const footerSideWidth = (pageWidth - footerCenterWidth) / 2 - 12;
  if (footerLines.some(text => /[\r\n]/.test(text)) || /[\r\n]/.test(inhalt.herausgeber)
    || !Number.isFinite(bottomLimit) || bottomLimit <= 0
    || pdf.getTextWidth(inhalt.herausgeber) >= footerSideWidth) {
    throw new Error('Der PDF-Fußzeilenblock passt nicht auf die Seite.');
  }
  const headerLines: string[] = pdf.splitTextToSize(projectHeader(input), pageWidth - 24);
  // Bis zwei Kopfzeilen gelten die bisherigen Positionen; jede weitere zählt voll.
  const headerOffset = Math.max(0, headerLines.length - 2) * lineHeight();
  const pageStartY = 25 + headerOffset;
  const tableMarginTop = 21 + headerOffset;

  const drawPageChrome = (pageDocument: JsPdfDocument, pageNumber: number, totalPages: number): void => {
    const pageWidth = pageDocument.internal.pageSize.getWidth();
    pageDocument.setFont('helvetica', 'normal');
    pageDocument.setTextColor(...DARK);
    pageDocument.setFontSize(8);
    pageDocument.text(headerLines, 12, 9.5);
    pageDocument.setDrawColor(184, 184, 181);
    pageDocument.setLineWidth(0.25);
    pageDocument.line(12, 17 + headerOffset, pageWidth - 12, 17 + headerOffset);

    pageDocument.line(12, footerDividerY, pageWidth - 12, footerDividerY);
    pageDocument.setTextColor(...MUTED);
    const pageLabel = `Seite ${pageNumber} von ${totalPages}`;
    if (pageDocument.getTextWidth(pageLabel) >= footerSideWidth) {
      throw new Error('Der PDF-Fußzeilenblock passt nicht auf die Seite.');
    }
    pageDocument.text(inhalt.herausgeber, 12, footerMiddleY);
    pageDocument.text(footerLines, pageWidth / 2, footerFirstY, { align: 'center' });
    pageDocument.text(pageLabel, pageWidth - 12, footerMiddleY, { align: 'right' });
  };

  let headerY = pageStartY;
  // Die längere der beiden Spalten bestimmt den Zeilenversatz der nächsten Reihe.
  const drawHeaderRow = (leftText: string, width: number, rightText?: string): void => {
    const leftLines: string[] = pdf.splitTextToSize(leftText, width);
    const rightLines: string[] = rightText === undefined ? [] : pdf.splitTextToSize(rightText, 90);
    const extraHeight = (Math.max(leftLines.length, rightLines.length) - 1) * lineHeight();
    if (!Number.isFinite(headerY + extraHeight) || headerY + extraHeight >= bottomLimit) {
      throw new Error('Der PDF-Kopfblock passt nicht auf die erste Seite.');
    }
    pdf.text(leftLines, 12, headerY);
    if (rightText !== undefined) pdf.text(rightLines, 108, headerY);
    headerY += 7 + extraHeight;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...ACCENT);
  pdf.setFontSize(15);
  drawHeaderRow(inhalt.titel, 186);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...DARK);
  pdf.setFontSize(8.5);
  drawHeaderRow(
    `Verfahrensart: ${regimeShortLabel(input)} · ${procedureLabel(input)}`,
    91,
    `Bundesland: ${stateLabels[input.bundesland]}`,
  );
  drawHeaderRow(`Erstellungsdatum: ${formatExportDate(zeit.kalendertag)}`, 91, `Rechtsstand: ${result.rechtsstand}`);
  drawHeaderRow(regelstandText(result), 186);
  if (result.bindefrist) {
    pdf.setFont('helvetica', 'bold');
    drawHeaderRow(
      `Bindefrist: Endtermin ${formatExportDate(result.bindefrist.termin)} · Dauer ${result.bindefrist.tage} KT ab Angebotsabgabe ${formatExportDate(result.bindefrist.basis)}`,
      186,
    );
    pdf.setFont('helvetica', 'normal');
  }
  const tableStartY = headerY + 2;
  if (tableStartY >= bottomLimit) throw new Error('Unter dem PDF-Kopfblock bleibt kein Platz für die Tabelle.');

  const phaseNames = new Map(result.phasen.map((phase) => [phase.id, phase.label]));
  autoTable(pdf, {
    startY: tableStartY,
    margin: { top: tableMarginTop, right: 12, bottom: tableMarginBottom, left: 12 },
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
      margin: { top: tableMarginTop, right: 12, bottom: tableMarginBottom, left: 12 },
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
  // Tabellenübersicht — Darstellung wie die
  // Web-Zeitschiene: farbiger Phasenkopf, Zeitraum, Meilensteinliste.
  if (result.phasen.length > 0) {
    const milestonesById = new Map(result.meilensteine.map((milestone) => [milestone.id, milestone]));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const left = 12;
    const width = pageWidth - 24;
    pdf.addPage();
    let y = pageStartY;
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
      if (pageStartY + blockHoehe > bottomLimit) {
        throw new Error('Der PDF-Zeitschienenblock passt nicht auf eine Seite.');
      }
      if (y + blockHoehe > bottomLimit) {
        pdf.addPage();
        y = pageStartY;
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
    drawPageChrome(pdf, pageNumber, totalPages);
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
