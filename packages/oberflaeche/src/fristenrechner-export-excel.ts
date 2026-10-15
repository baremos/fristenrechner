import type { ScheduleInput, ScheduleResult } from '@baremos/fristenrechner-kern';
import type { AusgabeDatei, ExportInhalt, ExportZeit } from './plattform';
import {
  exportFileSuffix,
  exportHaftungshinweis,
  exportHinweis,
  formatExportDate,
  phaseLabels,
  procedureLabel,
  pruefeExportInhalt,
  regimeLabel,
  stateLabels,
  typeLabels,
  uniqueWarnings,
} from './fristenrechner-export-data';
import { adresse, FUSS, fussText, MAX_FUSSZEILE, schreibeXlsx, type XlsxMappe, type XlsxWert, type XlsxStil, type XlsxZeile } from './xlsx-schreiber';

const AKZENT = 'FFA7303C';
const AKZENT_HELL = 'FFF7EAEC';
const WARNUNG = 'FFFFF2DD';
const WARNUNG_HELL = 'FFFFF9F0';
const RAHMEN = 'FFD7D7D3';
const GRAU = 'FF68686C';
const DATUMSFORMAT = 'dd.mm.yyyy';
const SPALTEN = 8;
const TABELLENKOPF = ['Von', 'Bis', 'Dauer (AT)', 'Termin', 'Phase', 'Fristtyp', 'Rechtsgrundlage', 'Rechenweg'];

const linie = { art: 'thin' as const, farbe: RAHMEN };
const rundum = { links: linie, rechts: linie, oben: linie, unten: linie };
const obenMitUmbruch = { vertikal: 'top' as const, umbruch: true };

const STIL: Record<string, XlsxStil> = {
  titel: { schrift: { fett: true, farbe: 'FFFFFFFF', groesse: 15 }, fuellung: AKZENT, ausrichtung: { vertikal: 'center' } },
  adresse: { schrift: { kursiv: true, farbe: GRAU, groesse: 9 } },
  kopfName: { schrift: { fett: true, farbe: 'FF343438' } },
  kopfWert: { ausrichtung: obenMitUmbruch },
  kopfDatum: { ausrichtung: { ...obenMitUmbruch, horizontal: 'left' }, zahlenformat: DATUMSFORMAT },
  tabellenkopf: { schrift: { fett: true, farbe: 'FFFFFFFF' }, fuellung: AKZENT, ausrichtung: { vertikal: 'center', umbruch: true } },
  warnungKopf: { schrift: { fett: true, farbe: 'FF704510' }, fuellung: WARNUNG },
  warnung: { fuellung: WARNUNG_HELL, ausrichtung: obenMitUmbruch },
  hinweis: { schrift: { kursiv: true, farbe: GRAU, groesse: 9 }, fuellung: AKZENT_HELL, ausrichtung: { umbruch: true } },
};

/** Stil einer Tabellenzelle: Datumsformat in den ersten beiden Spalten, jede zweite Zeile gefüllt. */
function tabellenStil(datum: boolean, gefuellt: boolean): XlsxStil {
  return {
    ...(datum ? { zahlenformat: DATUMSFORMAT } : {}),
    ...(gefuellt ? { fuellung: AKZENT_HELL } : {}),
    rahmen: rundum,
    ausrichtung: obenMitUmbruch,
  };
}

const datum = (iso: string) => ({ datum: iso });

/** Zeitpunkte und der örtliche Kalendertag kommen ausdrücklich vom Aufrufer. */
export function beschreibeMappe(input: ScheduleInput, result: ScheduleResult, erstelltAm: string, erstellungsdatum: string, inhalt: ExportInhalt): XlsxMappe {
  pruefeExportInhalt(inhalt);
  const zeilen = new Map<number, XlsxZeile>();
  const verbunden: string[] = [];
  const hyperlinks: { zelle: string; ziel: string }[] = [];

  function zeile(nr: number): XlsxZeile {
    if (!zeilen.has(nr)) zeilen.set(nr, { nr, zellen: [] });
    return zeilen.get(nr)!;
  }
  function setze(nr: number, spalte: number, wert: XlsxWert, stil: XlsxStil): void {
    zeile(nr).zellen.push({ spalte, wert, stil });
  }
  /** Verbundener Bereich in einer Zeile. Der Stil steht an jeder Zelle des Bereichs. */
  function verbinde(nr: number, von: number, bis: number, wert: XlsxWert, stil: XlsxStil): void {
    setze(nr, von, wert, stil);
    for (let spalte = von + 1; spalte <= bis; spalte += 1) setze(nr, spalte, null, stil);
    verbunden.push(`${adresse(nr, von)}:${adresse(nr, bis)}`);
  }

  verbinde(1, 1, SPALTEN, `${inhalt.herausgeber} – ${inhalt.titel}`, STIL.titel);
  zeile(1).hoehe = 27;
  verbinde(2, 1, SPALTEN, inhalt.adresse?.text ?? '', STIL.adresse);
  if (inhalt.adresse) hyperlinks.push({ zelle: 'A2', ziel: inhalt.adresse.href });

  const kopf: Array<[string, XlsxWert]> = [
    ['Kunde / Vergabestelle', input.projekt?.kunde?.trim() ?? ''],
    ['Projekt', input.projekt?.projektname?.trim() ?? ''],
    ['Vergabenummer', input.projekt?.vergabenummer?.trim() ?? ''],
    ['Vergabeordnung', regimeLabel(input)],
    ['Verfahrensart', procedureLabel(input)],
    ['Bundesland', stateLabels[input.bundesland]],
    ...(result.bindefrist
      ? [
          ['Bindefrist-Endtermin', datum(result.bindefrist.termin)],
          ['Bindefrist-Dauer', `${result.bindefrist.tage} KT ab Angebotsabgabe ${formatExportDate(result.bindefrist.basis)}`],
        ] as Array<[string, XlsxWert]>
      : []),
    ['Rechtsstand', `${result.rechtsstand} (${result.rechtsstandDatum})`],
    ['Regelversion', result.regelversion],
    ['Erstellungsdatum', datum(erstellungsdatum)],
  ];
  kopf.forEach(([name, wert], index) => {
    const nr = index + 4;
    setze(nr, 1, name, STIL.kopfName);
    verbinde(nr, 2, SPALTEN, wert, typeof wert === 'object' ? STIL.kopfDatum : STIL.kopfWert);
  });

  const kopfzeile = 5 + kopf.length;
  TABELLENKOPF.forEach((titel, index) => setze(kopfzeile, index + 1, titel, STIL.tabellenkopf));
  zeile(kopfzeile).hoehe = 23;

  const phasenNamen = new Map(result.phasen.map((phase) => [phase.id, phase.label]));
  result.meilensteine.forEach((m, index) => {
    const nr = kopfzeile + index + 1;
    const gefuellt = (nr - kopfzeile) % 2 === 0;
    const werte = [
      datum(m.datum),
      m.bis ? datum(m.bis) : '',
      m.dauerAT ?? '',
      m.label,
      phasenNamen.get(m.phase) ?? phaseLabels[m.phase],
      typeLabels[m.fristTyp],
      m.rechtsgrundlage ?? '',
      m.rechenweg,
    ];
    werte.forEach((wert, spalte) => setze(nr, spalte + 1, wert, tabellenStil(spalte < 2, gefuellt)));
  });
  const letzteZeile = kopfzeile + result.meilensteine.length;

  const warnungKopf = letzteZeile + 2;
  verbinde(warnungKopf, 1, SPALTEN, 'Warnungen', STIL.warnungKopf);
  const warnungen = uniqueWarnings(result);
  const warnzeilen = warnungen.length > 0 ? warnungen : ['Keine Warnungen.'];
  warnzeilen.forEach((warnung, index) => verbinde(warnungKopf + index + 1, 1, SPALTEN, `• ${warnung}`, STIL.warnung));

  const hinweiszeile = warnungKopf + warnzeilen.length + 2;
  verbinde(hinweiszeile, 1, SPALTEN, exportHinweis(inhalt), STIL.hinweis);
  if (inhalt.adresse) hyperlinks.push({ zelle: adresse(hinweiszeile, 1), ziel: inhalt.adresse.href });

  const fussMitte = [inhalt.adresse?.text ?? '', exportHaftungshinweis].filter(Boolean).map(fussText).join('\n');
  const fusszeile = `${FUSS.LINKS}${fussText(inhalt.herausgeber)}${FUSS.MITTE}${fussMitte}${FUSS.RECHTS}Seite ${FUSS.SEITE} von ${FUSS.SEITEN}`;
  // Einschließlich Steuerzeichen und verdoppelter &; der feste Hinweis bleibt vollständig.
  // Die rohe Länge einschließlich Steuerzeichen bleibt bewusst unter der Grenze des Schreibers.
  if (fusszeile.length >= MAX_FUSSZEILE) throw new Error(`Die Excel-Fußzeile muss unter ${MAX_FUSSZEILE} Zeichen bleiben.`);

  return {
    eigenschaften: {
      ersteller: inhalt.herausgeber,
      firma: inhalt.herausgeber,
      betreff: inhalt.titel,
      erstelltAm,
    },
    blatt: {
      name: 'Terminplan',
      standardZeilenhoehe: 18,
      spaltenbreiten: [22, 16, 12, 36, 23, 20, 30, 44],
      zeilen: [...zeilen.values()].sort((a, b) => a.nr - b.nr),
      verbunden,
      hyperlinks,
      fixierteZeilen: kopfzeile,
      autofilter: `${adresse(kopfzeile, 1)}:${adresse(letzteZeile, SPALTEN)}`,
      seite: {
        papier: 9,
        ausrichtung: 'portrait',
        einpassen: { breite: 1, hoehe: 0 },
        raender: { links: 0.4, rechts: 0.4, oben: 0.55, unten: 0.55, kopf: 0.2, fuss: 0.2 },
      },
      fusszeile,
    },
  };
}

/** Ohne Browser prüfbarer Export. */
export function createScheduleExcel(input: ScheduleInput, result: ScheduleResult, erstelltAm: string, erstellungsdatum: string, inhalt: ExportInhalt): Uint8Array<ArrayBuffer> {
  return schreibeXlsx(beschreibeMappe(input, result, erstelltAm, erstellungsdatum, inhalt));
}

export function excelAlsDatei(input: ScheduleInput, result: ScheduleResult, zeit: ExportZeit, inhalt: ExportInhalt): AusgabeDatei {
  return {
    name: `${inhalt.dateiPraefix}fristenplan-${exportFileSuffix(input, zeit.kalendertag)}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: createScheduleExcel(input, result, zeit.zeitpunkt.replace(/\.\d{3}Z$/, 'Z'), zeit.kalendertag, inhalt),
  };
}
