import {
  calculateSchedule,
  defaultFristen,
  erstelleProjektDatei,
  parseProjektDatei,
  VERGABEORDNUNGEN,
  verfahrenFuer,
  type Bundesland,
  type Meilenstein,
  type PhasenBlock,
  type ProjektDatei,
  type ScheduleInput,
  type ScheduleResult,
  type Verfahrensart,
  type Vergabeordnung,
} from '@baremos/fristenrechner-kern';

import { regelstandText } from './fristenrechner-export-data';
import { leerenUndAnhaengen } from './dom';
import { PlattformFehler, pruefeProjektGroesse, MAX_PROJEKT_BYTES, type AusgabeFormat, type AusgabeWeg, type RechnerOptionen } from './plattform';
import { speicherWarteschlange } from './speicher-warteschlange';
import { ausgabeBeschriftung, runDateiAusgabe } from './fristenrechner-export-action';
export * from './plattform';
export { erzeugeWebPlattform, erzeugeWebSpeicher, webZeit, WEB_SPEICHERSCHLUESSEL } from './web-plattform';
export { webTexte, webExportInhalt } from './web-vorgaben';
export { projektAlsDatei, safeFilename } from './projekt-datei';

const KERN_1_9_VERSION = '1.9.0';
const aktiveSeiten = new WeakSet<Document>();

const phaseLabels: Record<Meilenstein['phase'], string> = {
  einholung: 'Angebotsphase',
  teilnahmewettbewerb: 'Teilnahmewettbewerb',
  verhandlung: 'Verhandlungsphase',
  bewertung: 'Bewertung',
  teststellung: 'Teststellung',
  zuschlag: 'Zuschlag',
};

const phaseColors: Record<Meilenstein['phase'], string> = {
  einholung: '#a7303c',
  teilnahmewettbewerb: '#76528f',
  verhandlung: '#315f8c',
  bewertung: '#2f6f73',
  teststellung: '#a56721',
  zuschlag: '#4d6b3c',
};

const typeLabels: Record<Meilenstein['fristTyp'], string> = {
  gesetzlich: 'Gesetzliche Frist',
  praxis: 'Praxiswert',
  intern: 'Interne Planung',
  eingabe: 'Eingabe',
};

function field<T extends HTMLInputElement | HTMLSelectElement>(form: HTMLFormElement, name: string): T {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) {
    throw new Error(`Formularfeld ${name} fehlt.`);
  }
  return element as T;
}

function numberValue(form: HTMLFormElement, name: string, fallback = 0): number {
  const value = field<HTMLInputElement>(form, name).value;
  if (value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(form: HTMLFormElement, name: string): number | undefined {
  const value = field<HTMLInputElement>(form, name).value;
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function todayISO(today = new Date()): string {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function isVersionBefore(version: string, target: string): boolean {
  const parse = (value: string): [number, number, number] | undefined => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
  };
  const current = parse(version);
  const expected = parse(target);
  if (!current || !expected) return false;
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== expected[index]) return current[index] < expected[index];
  }
  return false;
}

function makeTextElement(tag: keyof HTMLElementTagNameMap, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function appendMilestoneDate(container: HTMLElement, milestone: Meilenstein): void {
  const start = document.createElement('time');
  start.dateTime = milestone.datum;
  start.textContent = formatDate(milestone.datum);
  container.append(start);

  if (milestone.bis !== undefined && milestone.dauerAT !== undefined) {
    const end = document.createElement('time');
    end.dateTime = milestone.bis;
    end.textContent = formatDate(milestone.bis);
    container.append(document.createTextNode(' – '), end, document.createTextNode(` (${milestone.dauerAT} AT)`));
  }
}

export function initFristenrechner(root: HTMLElement, optionen: RechnerOptionen): { dispose(): void } {
  const seite = root.ownerDocument;
  if (aktiveSeiten.has(seite) || seite.querySelectorAll('[data-fristenrechner]').length > 1) {
    throw new Error('Es ist nur ein Fristenrechner je Seite und eine Initialisierung erlaubt.');
  }
  const { plattform, texte } = optionen;
  const form = root.querySelector<HTMLFormElement>('#schedule-form');
  const results = root.querySelector<HTMLElement>('#schedule-results');
  const tableBody = root.querySelector<HTMLTableSectionElement>('#schedule-table-body');
  const timeline = root.querySelector<HTMLOListElement>('#timeline');
  const resultSummary = root.querySelector<HTMLElement>('#result-summary');
  const resultRegelstand = root.querySelector<HTMLElement>('#result-regelstand');
  const resultBindefrist = root.querySelector<HTMLElement>('#result-bindefrist');
  const resultWarnings = root.querySelector<HTMLElement>('#result-warnings');
  const resultKonflikte = root.querySelector<HTMLElement>('#result-konflikte');
  const timelineSection = root.querySelector<HTMLElement>('.timeline-section');
  const tableSection = root.querySelector<HTMLElement>('.table-section');
  const formMessage = root.querySelector<HTMLElement>('#form-message');
  const storageStatus = root.querySelector<HTMLElement>('#storage-status');
  const projectFileMeta = root.querySelector<HTMLElement>('#project-file-meta');
  const printCustomer = root.querySelector<HTMLElement>('#print-customer');
  const printProject = root.querySelector<HTMLElement>('#print-project');
  const teststellungPanel = root.querySelector<HTMLElement>('[data-teststellung]');
  const praesentationPanel = root.querySelector<HTMLElement>('[data-praesentation]');
  const verhandlungRunde1Panel = root.querySelector<HTMLElement>('[data-verhandlung-runde1]');
  const verhandlungRunde2Panel = root.querySelector<HTMLElement>('[data-verhandlung-runde2]');
  const teilnahmeField = root.querySelector<HTMLElement>('[data-teilnahme-field]');
  const bewerberfragenField = root.querySelector<HTMLElement>('[data-bewerberfragen-field]');
  const teilnahmeBewertungField = root.querySelector<HTMLElement>('[data-teilnahme-bewertung-field]');
  const zwischenbewertungField = root.querySelector<HTMLElement>('[data-zwischenbewertung-field]');
  const einladungVersandField = root.querySelector<HTMLElement>('[data-einladung-versand-field]');
  const vuAnpassungRunde1Field = root.querySelector<HTMLElement>('[data-vu-anpassung-runde1-field]');
  const vuAnpassungRunde2Field = root.querySelector<HTMLElement>('[data-vu-anpassung-runde2-field]');
  const verhandlungsFelder = Array.from(root.querySelectorAll<HTMLElement>('[data-verhandlungs-field]'));
  const startLabel = root.querySelector<HTMLElement>('[data-start-label]');
  const bindefristTageField = root.querySelector<HTMLElement>('[data-bindefrist-tage]');
  const bindefristTerminField = root.querySelector<HTMLElement>('[data-bindefrist-termin]');
  const exportMessage = root.querySelector<HTMLElement>('#export-message');
  const importMessage = root.querySelector<HTMLElement>('#import-message');
  const resetMessage = root.querySelector<HTMLElement>('#reset-message');
  const excelMessage = root.querySelector<HTMLElement>('#excel-message');
  const pdfMessage = root.querySelector<HTMLElement>('#pdf-message');
  const importAktion = root.querySelector<HTMLInputElement | HTMLButtonElement>('[data-project-import]');
  const resetButton = root.querySelector<HTMLButtonElement>('#reset-project');
  const exportActions = root.querySelector<HTMLElement>('.export-actions');
  const saveJsonButton = root.querySelector<HTMLButtonElement>('#save-json');
  const excelButton = root.querySelector<HTMLButtonElement>('#export-excel');
  const pdfButton = root.querySelector<HTMLButtonElement>('#export-pdf');
  const resultActionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-requires-result]'));
  const elektronischLabel = root.querySelector<HTMLElement>('[data-elektronisch-label]');
  const elektronischHinweis = root.querySelector<HTMLElement>('[data-elektronisch-hinweis]');
  const bieterinfoField = root.querySelector<HTMLElement>('[data-bieterinfo-field]');
  const infoVersandField = root.querySelector<HTMLElement>('[data-infoversand-field]');
  const wartefristField = root.querySelector<HTMLElement>('[data-wartefrist-field]');
  const dringlichkeitHinweis = root.querySelector<HTMLElement>('[data-dringlichkeit-hinweis]');
  const aufforderungField = root.querySelector<HTMLElement>('[data-aufforderung-field]');

  if (!form || !results || !tableBody || !timeline || !resultSummary || !resultRegelstand || !resultBindefrist
    || !resultWarnings || !resultKonflikte || !timelineSection || !tableSection || !formMessage || !storageStatus || !projectFileMeta || !printCustomer || !printProject || !teststellungPanel
    || !praesentationPanel || !verhandlungRunde1Panel || !verhandlungRunde2Panel
    || !teilnahmeField || !bewerberfragenField || !teilnahmeBewertungField || !zwischenbewertungField
    || !einladungVersandField || !vuAnpassungRunde1Field || !vuAnpassungRunde2Field
    || verhandlungsFelder.length !== 2 || !startLabel
    || !bindefristTageField || !bindefristTerminField || !exportMessage || !exportActions
    || !saveJsonButton || !excelButton || !pdfButton
    || ![saveJsonButton, excelButton, pdfButton].every(button => resultActionButtons.includes(button))
    || root.querySelectorAll('[data-project-import]').length !== 1
    || !elektronischLabel || !elektronischHinweis
    || !bieterinfoField || !infoVersandField || !wartefristField || !dringlichkeitHinweis
    || !aufforderungField || !importMessage || !resetMessage || !excelMessage || !pdfMessage || !importAktion || !resetButton) {
    throw new Error('Die Oberfläche des Fristenrechners ist unvollständig.');
  }

  aktiveSeiten.add(seite);
  let disposed = false;
  let geladen = false;
  let speichernGesperrt = false;
  let aenderungen = 0;
  let projektAktion = false;
  let dateiAuftrag = false;
  let speichernVorgemerkt = false;
  const abmelden: (() => void)[] = [];
  const speicher = speicherWarteschlange(plattform.speicher);
  const hoeren = (ziel: EventTarget, typ: string, fn: (event: Event) => void): void => {
    ziel.addEventListener(typ, fn);
    abmelden.push(() => ziel.removeEventListener(typ, fn));
  };
  let currentInput: ScheduleInput | undefined;
  let currentResult: ScheduleResult | undefined;
  let saveTimer: number | undefined;

  const setResultActionsEnabled = (enabled: boolean): void => {
    resultActionButtons.forEach((button) => {
      button.disabled = !enabled || dateiAuftrag || !geladen;
    });
    resetButton.disabled = dateiAuftrag || !geladen;
    // Ein Dateifeld darf während seines Klicks nicht disabled werden: sonst
    // kann der Browser die gerade angeforderte Auswahl unterdrücken. Weitere
    // Klicks sperrt der Handler mit preventDefault; der App-Button wird disabled.
    if (importAktion instanceof HTMLInputElement) {
      if (dateiAuftrag || !geladen) importAktion.setAttribute('aria-disabled', 'true');
      else importAktion.removeAttribute('aria-disabled');
    } else importAktion.disabled = dateiAuftrag || !geladen;
  };
  const dateiAuftragBeginnen = (): boolean => {
    if (dateiAuftrag || !geladen || disposed) return false;
    dateiAuftrag = true;
    setResultActionsEnabled(Boolean(currentResult));
    return true;
  };
  const dateiAuftragBeenden = (): void => {
    dateiAuftrag = false;
    if (!disposed) setResultActionsEnabled(Boolean(currentResult));
  };

  const readInput = (): ScheduleInput => {
    const vergabeordnung = field<HTMLSelectElement>(form, 'vergabeordnung').value as Vergabeordnung;
    const verfahrensart = field<HTMLSelectElement>(form, 'verfahrensart').value as Verfahrensart;
    const twoStage = verfahrensart === 'nicht_offen_mit_tnw' || verfahrensart === 'verhandlung_mit_tnw';
    const bindefristArt = field<HTMLSelectElement>(form, 'bindefristArt').value;
    const bindefristTage = optionalNumber(form, 'bindefristTage');
    const bindefristTermin = field<HTMLInputElement>(form, 'bindefristTermin').value || undefined;
    const teststellungStart = field<HTMLInputElement>(form, 'teststellungStart').value || undefined;
    const praesentationStart = field<HTMLInputElement>(form, 'praesentationStart').value || undefined;
    const verhandlungRunde1Start = field<HTMLInputElement>(form, 'verhandlungRunde1Start').value || undefined;
    const verhandlungRunde2Start = field<HTMLInputElement>(form, 'verhandlungRunde2Start').value || undefined;
    const teilnahmeBewertungAT = optionalNumber(form, 'teilnahmeBewertungAT');
    // Abgabe-Uhrzeit (Kern 1.8.0): leer = Fristablauf 24:00 Uhr — dann das
    // Feld gar nicht mitgeben, damit Rechenweg und Projektdatei unverändert
    // bleiben
    const abgabeUhrzeit = field<HTMLInputElement>(form, 'abgabeUhrzeit').value || undefined;
    const zwischenbewertungAT = optionalNumber(form, 'zwischenbewertungAT');
    const isNegotiated = verfahrensart === 'verhandlung_ohne_tnw' || verfahrensart === 'verhandlung_mit_tnw';
    const optimiertesAngebotKT = optionalNumber(form, 'optimiertesAngebotKT');
    const finalesAngebotKT = optionalNumber(form, 'finalesAngebotKT');
    const optimierteRundeAktiv = isNegotiated && optimiertesAngebotKT !== undefined && optimiertesAngebotKT > 0;
    const finaleRundeAktiv = isNegotiated && finalesAngebotKT !== undefined && finalesAngebotKT > 0;
    const runde1Aktiv = isNegotiated && field<HTMLInputElement>(form, 'verhandlungRunde1Aktiv').checked;
    const runde2Aktiv = runde1Aktiv && field<HTMLInputElement>(form, 'verhandlungRunde2Aktiv').checked;
    // Seit Kern 1.9.0 ist die Zwischenbewertung Voraussetzung jeder weiteren
    // Angebotsrunde — auch ohne Präsentation oder Bieterverhandlung. Ein
    // ausgeblendeter Restwert darf den Kern weiterhin nicht erreichen.
    const zwischenbewertungRelevant = field<HTMLInputElement>(form, 'praesentationAktiv').checked
      || runde1Aktiv
      || optimierteRundeAktiv;
    // Fester Aufforderungstermin nur bei Verfahren mit Teilnahmewettbewerb
    // (Kern 1.7.0) — Restwerte aus anderen Verfahrensarten nicht mitgeben
    const angebotsaufforderung = twoStage
      ? field<HTMLInputElement>(form, 'angebotsaufforderungTermin').value || undefined
      : undefined;

    return {
      vergabeordnung,
      verfahrensart,
      bundesland: field<HTMLSelectElement>(form, 'bundesland').value as Bundesland,
      bekanntmachung: field<HTMLInputElement>(form, 'bekanntmachung').value,
      ...(angebotsaufforderung ? { angebotsaufforderung } : {}),
      optionen: {
        elektronischeAbgabe: field<HTMLInputElement>(form, 'elektronischeAbgabe').checked,
        ortsbegehung: field<HTMLInputElement>(form, 'ortsbegehung').checked,
        dringlichkeit: field<HTMLInputElement>(form, 'dringlichkeit').checked,
        versandBieterinformation: field<HTMLSelectElement>(form, 'versandBieterinformation').value as 'elektronisch' | 'postalisch',
        ...(abgabeUhrzeit ? { abgabeUhrzeit } : {}),
        teststellung: {
          aktiv: field<HTMLInputElement>(form, 'teststellungAktiv').checked,
          dauerAT: numberValue(form, 'teststellungDauerAT', 0),
          ...(teststellungStart ? { start: teststellungStart } : {}),
        },
        praesentation: {
          aktiv: field<HTMLInputElement>(form, 'praesentationAktiv').checked,
          dauerAT: numberValue(form, 'praesentationDauerAT', 0),
          ...(praesentationStart ? { start: praesentationStart } : {}),
        },
        // Runden nur im Verhandlungsverfahren — normalisiert auch Werte aus
        // Projektdateien mit unpassender Verfahrensart
        verhandlungRunde1: {
          aktiv: isNegotiated && field<HTMLInputElement>(form, 'verhandlungRunde1Aktiv').checked,
          dauerAT: numberValue(form, 'verhandlungRunde1DauerAT', 0),
          ...(verhandlungRunde1Start ? { start: verhandlungRunde1Start } : {}),
        },
        verhandlungRunde2: {
          aktiv: isNegotiated && field<HTMLInputElement>(form, 'verhandlungRunde2Aktiv').checked,
          dauerAT: numberValue(form, 'verhandlungRunde2DauerAT', 0),
          ...(verhandlungRunde2Start ? { start: verhandlungRunde2Start } : {}),
        },
      },
      fristen: {
        angebotsfristKT: optionalNumber(form, 'angebotsfristKT'),
        teilnahmefristKT: optionalNumber(form, 'teilnahmefristKT'),
        bieterfragenVorAngebotKT: optionalNumber(form, 'bieterfragenVorAngebotKT'),
        ...(twoStage ? { bewerberfragenVorTeilnahmeKT: optionalNumber(form, 'bewerberfragenVorTeilnahmeKT') } : {}),
        klarstellungVorAngebotKT: optionalNumber(form, 'klarstellungVorAngebotKT'),
        wartefristKT: optionalNumber(form, 'wartefristKT'),
        ...(isNegotiated && optimiertesAngebotKT !== undefined ? { optimiertesAngebotKT } : {}),
        ...(isNegotiated && finalesAngebotKT !== undefined ? { finalesAngebotKT } : {}),
        ...(bindefristArt === 'termin' && bindefristTermin
          ? { bindefrist: { termin: bindefristTermin } }
          : bindefristArt === 'tage' && bindefristTage !== undefined
            ? { bindefrist: { tage: bindefristTage } }
            : {}),
      },
      interneFristen: {
        bewertungAT: numberValue(form, 'bewertungAT', 0),
        aufklaerungEntscheidungAT: numberValue(form, 'aufklaerungEntscheidungAT', 0),
        internerZuschlagAT: numberValue(form, 'internerZuschlagAT', 0),
        teststellungAuswertungAT: numberValue(form, 'teststellungAuswertungAT', 0),
        infoVersandAT: numberValue(form, 'infoVersandAT', 0),
        aufforderungVersandAT: numberValue(form, 'aufforderungVersandAT', 1),
        ...(isNegotiated ? { einladungVersandAT: numberValue(form, 'einladungVersandAT', 1) } : {}),
        // Anpassung nach Runde 1 = vor der ERSTEN weiteren Angebotsrunde (optimiert
        // oder — Eingabeweise „optimiert leer, final n" — direkt final); nach
        // Runde 2 nur mit beiden Angebotsrunden (Kern 1.9.0)
        ...(optimierteRundeAktiv || finaleRundeAktiv ? { vuAnpassungRunde1AT: numberValue(form, 'vuAnpassungRunde1AT', 2) } : {}),
        ...(optimierteRundeAktiv && finaleRundeAktiv ? { vuAnpassungRunde2AT: numberValue(form, 'vuAnpassungRunde2AT', 2) } : {}),
        ...(twoStage && teilnahmeBewertungAT !== undefined ? { teilnahmeBewertungAT } : {}),
        ...(zwischenbewertungRelevant && zwischenbewertungAT !== undefined ? { zwischenbewertungAT } : {}),
      },
      projekt: {
        kunde: field<HTMLInputElement>(form, 'kunde').value.trim() || undefined,
        projektname: field<HTMLInputElement>(form, 'projektname').value.trim() || undefined,
        vergabenummer: field<HTMLInputElement>(form, 'vergabenummer').value.trim() || undefined,
      },
    };
  };

  const setInput = (input: ScheduleInput): void => {
    const defaults = defaultFristen(input.vergabeordnung ?? 'vgv', input.verfahrensart, input.optionen);
    // Vergabeordnung vor der Verfahrensart setzen: sie bestimmt die
    // verfügbaren Verfahrensart-Optionen (ältere Projektdateien ohne
    // Vergabeordnung sind VgV, Kern < 1.5.0)
    field<HTMLSelectElement>(form, 'vergabeordnung').value = input.vergabeordnung ?? 'vgv';
    updateVerfahrensartOptionen();
    field<HTMLSelectElement>(form, 'verfahrensart').value = input.verfahrensart;
    field<HTMLSelectElement>(form, 'bundesland').value = input.bundesland;
    field<HTMLInputElement>(form, 'bekanntmachung').value = input.bekanntmachung;
    field<HTMLInputElement>(form, 'angebotsaufforderungTermin').value = input.angebotsaufforderung ?? '';
    field<HTMLInputElement>(form, 'elektronischeAbgabe').checked = input.optionen.elektronischeAbgabe;
    field<HTMLInputElement>(form, 'ortsbegehung').checked = input.optionen.ortsbegehung;
    field<HTMLInputElement>(form, 'dringlichkeit').checked = input.optionen.dringlichkeit;
    field<HTMLSelectElement>(form, 'versandBieterinformation').value = input.optionen.versandBieterinformation;
    field<HTMLInputElement>(form, 'abgabeUhrzeit').value = input.optionen.abgabeUhrzeit ?? '';
    field<HTMLInputElement>(form, 'teststellungAktiv').checked = input.optionen.teststellung.aktiv;
    field<HTMLInputElement>(form, 'teststellungDauerAT').value = String(input.optionen.teststellung.dauerAT);
    field<HTMLInputElement>(form, 'teststellungStart').value = input.optionen.teststellung.start ?? '';
    field<HTMLInputElement>(form, 'praesentationAktiv').checked = input.optionen.praesentation?.aktiv ?? false;
    field<HTMLInputElement>(form, 'praesentationDauerAT').value = String(input.optionen.praesentation?.dauerAT ?? 2);
    field<HTMLInputElement>(form, 'praesentationStart').value = input.optionen.praesentation?.start ?? '';
    field<HTMLInputElement>(form, 'verhandlungRunde1Aktiv').checked = input.optionen.verhandlungRunde1?.aktiv ?? false;
    field<HTMLInputElement>(form, 'verhandlungRunde1DauerAT').value = String(input.optionen.verhandlungRunde1?.dauerAT ?? 3);
    field<HTMLInputElement>(form, 'verhandlungRunde1Start').value = input.optionen.verhandlungRunde1?.start ?? '';
    field<HTMLInputElement>(form, 'verhandlungRunde2Aktiv').checked = input.optionen.verhandlungRunde2?.aktiv ?? false;
    field<HTMLInputElement>(form, 'verhandlungRunde2DauerAT').value = String(input.optionen.verhandlungRunde2?.dauerAT ?? 3);
    field<HTMLInputElement>(form, 'verhandlungRunde2Start').value = input.optionen.verhandlungRunde2?.start ?? '';
    field<HTMLInputElement>(form, 'kunde').value = input.projekt?.kunde ?? '';
    field<HTMLInputElement>(form, 'projektname').value = input.projekt?.projektname ?? '';
    field<HTMLInputElement>(form, 'vergabenummer').value = input.projekt?.vergabenummer ?? '';
    field<HTMLInputElement>(form, 'bewertungAT').value = String(input.interneFristen.bewertungAT);
    field<HTMLInputElement>(form, 'aufklaerungEntscheidungAT').value = String(input.interneFristen.aufklaerungEntscheidungAT);
    field<HTMLInputElement>(form, 'internerZuschlagAT').value = String(input.interneFristen.internerZuschlagAT);
    field<HTMLInputElement>(form, 'teststellungAuswertungAT').value = String(input.interneFristen.teststellungAuswertungAT);
    field<HTMLInputElement>(form, 'infoVersandAT').value = String(input.interneFristen.infoVersandAT ?? 0);
    field<HTMLInputElement>(form, 'aufforderungVersandAT').value = String(input.interneFristen.aufforderungVersandAT ?? 1);
    field<HTMLInputElement>(form, 'einladungVersandAT').value = String(input.interneFristen.einladungVersandAT ?? 1);
    field<HTMLInputElement>(form, 'vuAnpassungRunde1AT').value = String(input.interneFristen.vuAnpassungRunde1AT ?? 2);
    field<HTMLInputElement>(form, 'vuAnpassungRunde2AT').value = String(input.interneFristen.vuAnpassungRunde2AT ?? 2);
    field<HTMLInputElement>(form, 'teilnahmeBewertungAT').value = input.interneFristen.teilnahmeBewertungAT?.toString() ?? '';
    field<HTMLInputElement>(form, 'zwischenbewertungAT').value = input.interneFristen.zwischenbewertungAT?.toString() ?? '';
    field<HTMLInputElement>(form, 'angebotsfristKT').value = input.fristen?.angebotsfristKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'teilnahmefristKT').value = input.fristen?.teilnahmefristKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'bieterfragenVorAngebotKT').value = input.fristen?.bieterfragenVorAngebotKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'bewerberfragenVorTeilnahmeKT').value = input.fristen?.bewerberfragenVorTeilnahmeKT?.toString()
      ?? defaults.bewerberfragenVorTeilnahmeKT?.toString()
      ?? '';
    field<HTMLInputElement>(form, 'klarstellungVorAngebotKT').value = input.fristen?.klarstellungVorAngebotKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'wartefristKT').value = input.fristen?.wartefristKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'optimiertesAngebotKT').value = input.fristen?.optimiertesAngebotKT?.toString()
      ?? defaults.optimiertesAngebotKT?.toString()
      ?? '';
    field<HTMLInputElement>(form, 'finalesAngebotKT').value = input.fristen?.finalesAngebotKT?.toString()
      ?? defaults.finalesAngebotKT?.toString()
      ?? '';
    const bindefrist = input.fristen?.bindefrist;
    const usesTermin = Boolean(bindefrist && 'termin' in bindefrist && bindefrist.termin);
    field<HTMLSelectElement>(form, 'bindefristArt').value = usesTermin ? 'termin' : 'tage';
    field<HTMLInputElement>(form, 'bindefristTage').value = bindefrist && 'tage' in bindefrist
      ? bindefrist.tage?.toString() ?? ''
      : '';
    field<HTMLInputElement>(form, 'bindefristTermin').value = bindefrist && 'termin' in bindefrist
      ? bindefrist.termin ?? ''
      : '';
    updateConditionalFields();
  };

  /**
   * Verfahrensart-Optionen zur gewählten Vergabeordnung (die VSVgV kennt
   * z. B. kein offenes Verfahren). Bleibt die bisherige Auswahl verfügbar,
   * wird sie beibehalten, sonst gilt die erste Verfahrensart der Ordnung.
   */
  const updateVerfahrensartOptionen = (): void => {
    const vergabeordnung = field<HTMLSelectElement>(form, 'vergabeordnung').value as Vergabeordnung;
    const auswahl = field<HTMLSelectElement>(form, 'verfahrensart');
    const vorher = auswahl.value;
    const arten = verfahrenFuer(vergabeordnung);
    leerenUndAnhaengen(auswahl,
      ...arten.map((art) => {
        const option = document.createElement('option');
        option.value = art;
        option.textContent = VERGABEORDNUNGEN[vergabeordnung].verfahren[art]?.label ?? art;
        return option;
      }),
    );
    auswahl.value = arten.includes(vorher as Verfahrensart) ? vorher : arten[0];
  };

  const updateConditionalFields = (): void => {
    const updateOptionalPanel = (panel: HTMLElement, checkboxName: string): void => {
      const active = field<HTMLInputElement>(form, checkboxName).checked;
      panel.hidden = !active;
      panel.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        input.disabled = !active;
      });
    };
    const procedure = field<HTMLSelectElement>(form, 'verfahrensart').value;
    const twoStage = procedure === 'nicht_offen_mit_tnw' || procedure === 'verhandlung_mit_tnw';
    const isNegotiated = procedure === 'verhandlung_ohne_tnw' || procedure === 'verhandlung_mit_tnw';

    // Titel/Hilfetext der Elektronisch-Option je Vergabeordnung (VSVgV:
    // E-Bekanntmachung + E-Vergabeunterlagen statt E-Angebotsabgabe)
    const vergabeordnung = field<HTMLSelectElement>(form, 'vergabeordnung').value as Vergabeordnung;
    const voProfil = VERGABEORDNUNGEN[vergabeordnung] ?? VERGABEORDNUNGEN.vgv;
    elektronischLabel.textContent = voProfil.elektronischLabel;
    elektronischHinweis.textContent = voProfil.elektronischHinweis;

    // Wartepflicht-Felder (§ 134 GWB) nur im Oberschwellenbereich —
    // Unterschwelle kennt weder Bieterinformations-Versandart noch
    // Wartefrist (Kern 1.6.0)
    bieterinfoField.hidden = !voProfil.wartepflicht;
    field<HTMLSelectElement>(form, 'versandBieterinformation').disabled = !voProfil.wartepflicht;
    infoVersandField.hidden = !voProfil.wartepflicht;
    field<HTMLInputElement>(form, 'infoVersandAT').disabled = !voProfil.wartepflicht;
    wartefristField.hidden = !voProfil.wartepflicht;
    field<HTMLInputElement>(form, 'wartefristKT').disabled = !voProfil.wartepflicht;

    // Verhandlungsrunden gibt es nur im Verhandlungsverfahren — im offenen
    // und nicht offenen Verfahren wird nicht verhandelt . Die Sperre steht VOR den Panel-Updates, damit ein beim
    // Verfahrenswechsel entfernter Haken im selben Lauf auch Panels und
    // Zwischenbewertung nachzieht.
    const runde1Checkbox = field<HTMLInputElement>(form, 'verhandlungRunde1Aktiv');
    runde1Checkbox.disabled = !isNegotiated;
    if (!isNegotiated) runde1Checkbox.checked = false;

    updateOptionalPanel(teststellungPanel, 'teststellungAktiv');
    updateOptionalPanel(praesentationPanel, 'praesentationAktiv');
    updateOptionalPanel(verhandlungRunde1Panel, 'verhandlungRunde1Aktiv');

    const runde1Aktiv = runde1Checkbox.checked;
    const runde2Aktiv = field<HTMLInputElement>(form, 'verhandlungRunde2Aktiv');
    runde2Aktiv.disabled = !runde1Aktiv;
    if (!runde1Aktiv) runde2Aktiv.checked = false;
    updateOptionalPanel(verhandlungRunde2Panel, 'verhandlungRunde2Aktiv');

    // Startlabel aus dem Profil: einstufige Verfahren ohne Bekanntmachung
    // (Verhandlungsvergabe/Freihändige Vergabe/Beschränkte ohne TNW) starten
    // mit der Aufforderung zur Angebotsabgabe (Kern 1.6.0)
    const artProfil = voProfil.verfahren[procedure as Verfahrensart];
    startLabel.textContent = artProfil?.startAufforderung === true
      ? 'Absendung der Aufforderung zur Angebotsabgabe'
      : 'Absendung der Bekanntmachung';

    // Dringlichkeits-Hilfetext je Verfahrensart: nicht jede Ordnung kennt
    // Dringlichkeitsfristen
    const hatDringlichkeitsfristen = artProfil !== undefined
      && (artProfil.angebotsfrist.dringlichkeitKT !== undefined
        || artProfil.teilnahmefrist?.dringlichkeitKT !== undefined);
    dringlichkeitHinweis.textContent = hatDringlichkeitsfristen
      ? 'Verkürzte Mindestfristen prüfen'
      : 'Keine gesonderten Dringlichkeitsfristen in dieser Verfahrensart';
    teilnahmeField.hidden = !twoStage;
    field<HTMLInputElement>(form, 'teilnahmefristKT').disabled = !twoStage;
    bewerberfragenField.hidden = !twoStage;
    field<HTMLInputElement>(form, 'bewerberfragenVorTeilnahmeKT').disabled = !twoStage;

    // Fester Aufforderungstermin nur bei Verfahren mit Teilnahmewettbewerb
    // (Kern 1.7.0); ist er gesetzt, ersetzt er die Berechnung aus der
    // TNA-Bewertungszeit — die Zeile wird dann ausgeblendet
    const aufforderungTermin = field<HTMLInputElement>(form, 'angebotsaufforderungTermin');
    aufforderungField.hidden = !twoStage;
    aufforderungTermin.disabled = !twoStage;
    const hatFestenAufforderungstermin = twoStage && aufforderungTermin.value !== '';
    teilnahmeBewertungField.hidden = !twoStage || hatFestenAufforderungstermin;
    field<HTMLInputElement>(form, 'teilnahmeBewertungAT').disabled = !twoStage || hatFestenAufforderungstermin;

    // Kern 1.9.0: Bewertung vor jeder weiteren Angebotsrunde, zusätzlich vor
    // Präsentation/Verhandlung. Es bleiben nur Zeiten sichtbar, die sich aus
    // Vergabeart, Fristwerten und Optionen ergeben.
    const praesentationAktiv = field<HTMLInputElement>(form, 'praesentationAktiv').checked;
    const optimiertesAngebotKT = optionalNumber(form, 'optimiertesAngebotKT');
    const finalesAngebotKT = optionalNumber(form, 'finalesAngebotKT');
    const optimierteRundeAktiv = isNegotiated && optimiertesAngebotKT !== undefined && optimiertesAngebotKT > 0;
    const finaleRundeAktiv = isNegotiated && finalesAngebotKT !== undefined && finalesAngebotKT > 0;
    const zwischenbewertungRelevant = praesentationAktiv
      || runde1Aktiv
      || optimierteRundeAktiv;
    zwischenbewertungField.hidden = !zwischenbewertungRelevant;
    field<HTMLInputElement>(form, 'zwischenbewertungAT').disabled = !zwischenbewertungRelevant;

    einladungVersandField.hidden = !runde1Aktiv;
    field<HTMLInputElement>(form, 'einladungVersandAT').disabled = !runde1Aktiv;
    // Runde-1-Anpassung vor der ersten weiteren Angebotsrunde, Runde-2-Anpassung
    // nur mit optimierten UND finalen Angeboten (wie der Kern)
    const ersteWeitereRunde = optimierteRundeAktiv || finaleRundeAktiv;
    const zweiteWeitereRunde = optimierteRundeAktiv && finaleRundeAktiv;
    vuAnpassungRunde1Field.hidden = !ersteWeitereRunde;
    field<HTMLInputElement>(form, 'vuAnpassungRunde1AT').disabled = !ersteWeitereRunde;
    vuAnpassungRunde2Field.hidden = !zweiteWeitereRunde;
    field<HTMLInputElement>(form, 'vuAnpassungRunde2AT').disabled = !zweiteWeitereRunde;

    verhandlungsFelder.forEach((feld) => {
      feld.hidden = !isNegotiated;
      feld.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        input.disabled = !isNegotiated;
      });
    });

    const bindefristArt = field<HTMLSelectElement>(form, 'bindefristArt').value;
    const usesTermin = bindefristArt === 'termin';
    bindefristTageField.hidden = usesTermin;
    bindefristTerminField.hidden = !usesTermin;
    field<HTMLInputElement>(form, 'bindefristTage').disabled = usesTermin;
    field<HTMLInputElement>(form, 'bindefristTermin').disabled = !usesTermin;
  };

  const updateDefaultFields = (): void => {
    const input = readInput();
    const defaults = defaultFristen(input.vergabeordnung ?? 'vgv', input.verfahrensart, input.optionen);
    field<HTMLInputElement>(form, 'angebotsfristKT').value = String(defaults.angebotsfristKT);
    field<HTMLInputElement>(form, 'teilnahmefristKT').value = defaults.teilnahmefristKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'bieterfragenVorAngebotKT').value = String(defaults.bieterfragenVorAngebotKT);
    field<HTMLInputElement>(form, 'bewerberfragenVorTeilnahmeKT').value = defaults.bewerberfragenVorTeilnahmeKT?.toString() ?? '';
    field<HTMLInputElement>(form, 'klarstellungVorAngebotKT').value = String(defaults.klarstellungVorAngebotKT);
    // undefined ⇒ keine Wartepflicht (Unterschwelle) — Feld ist ausgeblendet
    field<HTMLInputElement>(form, 'wartefristKT').value = defaults.wartefristKT?.toString() ?? '';
    // Standard 10 KT für optimierte/finale Angebotsrunde im
    // Verhandlungsverfahren ; außerhalb bleibt
    // das Feld leer und ausgeblendet
    const negotiated = input.verfahrensart === 'verhandlung_ohne_tnw' || input.verfahrensart === 'verhandlung_mit_tnw';
    field<HTMLInputElement>(form, 'optimiertesAngebotKT').value = defaults.optimiertesAngebotKT?.toString() ?? (negotiated ? '10' : '');
    field<HTMLInputElement>(form, 'finalesAngebotKT').value = defaults.finalesAngebotKT?.toString() ?? (negotiated ? '10' : '');
    updateConditionalFields();
  };

  const renderWarnings = (result: ScheduleResult): void => {
    const warnings = [
      ...result.warnungen,
      ...result.meilensteine.flatMap((milestone) => milestone.warnungen),
    ].filter((value, index, all) => all.indexOf(value) === index);
    leerenUndAnhaengen(resultWarnings);
    resultWarnings.hidden = warnings.length === 0;
    if (!warnings.length) return;

    const list = document.createElement('ul');
    warnings.forEach((warning) => list.append(makeTextElement('li', warning)));
    resultWarnings.append(list);
  };

  const renderTimeline = (result: ScheduleResult): void => {
    leerenUndAnhaengen(timeline);
    if (!result.phasen.length) return;

    const milestonesById = new Map(result.meilensteine.map((milestone) => [milestone.id, milestone]));
    result.phasen.forEach((phase, index) => {
      const item = document.createElement('li');
      item.className = 'timeline-phase';
      item.style.setProperty('--phase-color', phaseColors[phase.id]);

      const header = document.createElement('header');
      header.append(
        makeTextElement('span', `Phase ${index + 1}`, 'timeline-phase-order'),
        makeTextElement('strong', phase.label),
      );
      const range = document.createElement('span');
      range.append(createDateRange(phase));
      header.append(range);

      const milestoneList = document.createElement('ol');
      milestoneList.className = 'timeline-milestones';
      phase.meilensteine.forEach((milestoneId) => {
        const milestone = milestonesById.get(milestoneId);
        if (!milestone) return;
        const milestoneItem = document.createElement('li');
        const date = makeTextElement('span', '', 'milestone-date');
        appendMilestoneDate(date, milestone);
        milestoneItem.append(date, makeTextElement('span', milestone.label));
        milestoneList.append(milestoneItem);
      });

      item.append(header, milestoneList);
      timeline.append(item);
    });
  };

  const createDateRange = (phase: PhasenBlock): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    const start = document.createElement('time');
    start.dateTime = phase.von;
    start.textContent = formatDate(phase.von);
    fragment.append(start);
    if (phase.bis !== phase.von) {
      const end = document.createElement('time');
      end.dateTime = phase.bis;
      end.textContent = formatDate(phase.bis);
      fragment.append(document.createTextNode(' – '), end);
    }
    return fragment;
  };

  const renderTable = (result: ScheduleResult): void => {
    leerenUndAnhaengen(tableBody);
    const phaseNames = new Map(result.phasen.map((phase) => [phase.id, phase.label]));
    result.meilensteine.forEach((milestone) => {
      const row = document.createElement('tr');
      const dateCell = document.createElement('td');
      appendMilestoneDate(dateCell, milestone);

      const labelCell = document.createElement('td');
      labelCell.append(makeTextElement('span', milestone.label, 'milestone-label'));
      milestone.warnungen.forEach((warning) => {
        labelCell.append(makeTextElement('div', warning, 'milestone-warning'));
      });

      const typeCell = document.createElement('td');
      typeCell.append(makeTextElement('span', typeLabels[milestone.fristTyp], 'type-badge'));
      typeCell.append(document.createElement('br'), document.createTextNode(
        phaseNames.get(milestone.phase) ?? phaseLabels[milestone.phase],
      ));

      const detailCell = document.createElement('td');
      detailCell.append(document.createTextNode(milestone.rechenweg));
      if (milestone.rechtsgrundlage) {
        detailCell.append(document.createElement('br'), makeTextElement('strong', milestone.rechtsgrundlage));
      }
      row.append(dateCell, labelCell, typeCell, detailCell);
      tableBody.append(row);
    });
  };

  const persist = (input: ScheduleInput): void => {
    if (disposed || !geladen || speichernGesperrt) return;
    if (projektAktion) { speichernVorgemerkt = true; return; }
    try {
      const json = JSON.stringify(erstelleProjektDatei(input, plattform.zeit().zeitpunkt));
      void speicher.schreiben(json).then(() => {
        if (!disposed) storageStatus.textContent = 'Zuletzt automatisch gespeichert: gerade eben.';
      }, () => { if (!disposed) storageStatus.textContent = texte.speicherNichtVerfuegbar; });
    } catch {
      storageStatus.textContent = texte.speicherNichtVerfuegbar;
    }
  };

  // min-Attribute der festen Starttermine aus den frühestmöglichen Terminen
  // des Kerns: Der Kalender bietet zu frühe Daten gar nicht erst an. Getippte oder durch andere
  // Eingaben veraltete Werte fängt die Konfliktprüfung ab.
  const setzeStartMinima = (result: ScheduleResult): void => {
    const zuordnung = [
      ['teststellung', 'teststellungStart'],
      ['praesentation', 'praesentationStart'],
      ['verhandlungRunde1', 'verhandlungRunde1Start'],
      ['verhandlungRunde2', 'verhandlungRunde2Start'],
      ['angebotsaufforderung', 'angebotsaufforderungTermin'],
    ] as const;
    for (const [option, feldName] of zuordnung) {
      const eingabe = field<HTMLInputElement>(form, feldName);
      const fruehestens = result.fruehesteStarts[option];
      if (fruehestens) {
        eingabe.min = fruehestens;
      } else {
        eingabe.removeAttribute('min');
      }
    }
  };

  const renderKonflikte = (result: ScheduleResult): boolean => {
    leerenUndAnhaengen(resultKonflikte);
    resultKonflikte.hidden = result.konflikte.length === 0;
    if (!result.konflikte.length) return false;
    resultKonflikte.append(makeTextElement('p', 'Kein Terminplan berechenbar — bitte die festen Starttermine korrigieren:'));
    const list = document.createElement('ul');
    result.konflikte.forEach((konflikt) => list.append(makeTextElement('li', konflikt.text)));
    resultKonflikte.append(list);
    return true;
  };

  /** Rendert das Ergebnis; liefert false, wenn wegen Startkonflikten kein
      Terminplan angezeigt wird. */
  const render = (input: ScheduleInput, shouldPersist = true): boolean => {
    const result = calculateSchedule(input);
    resultRegelstand.textContent = regelstandText(result);
    currentInput = input;
    setzeStartMinima(result);
    if (renderKonflikte(result)) {
      // Harte Eingabekonflikte: keinen (unsinnigen) Terminplan anzeigen
      // und keine Exporte anbieten;
      // die ganzen Sektionen verbergen — eine leere Tabelle samt Kopfzeile
      // wäre irreführend.
      currentResult = undefined;
      setResultActionsEnabled(false);
      resultWarnings.hidden = true;
      leerenUndAnhaengen(resultWarnings);
      resultBindefrist.hidden = true;
      resultBindefrist.textContent = '';
      leerenUndAnhaengen(timeline);
      leerenUndAnhaengen(tableBody);
      timelineSection.hidden = true;
      tableSection.hidden = true;
      const projectLabel = input.projekt?.projektname || input.projekt?.vergabenummer || 'Unbenanntes Projekt';
      printCustomer.textContent = input.projekt?.kunde?.trim() || '—';
      printProject.textContent = input.projekt?.projektname?.trim() || '—';
      resultSummary.textContent = `${projectLabel} · Kein Terminplan — feste Starttermine prüfen.`;
      if (shouldPersist) persist(input);
      return false;
    }
    timelineSection.hidden = false;
    tableSection.hidden = false;
    currentResult = result;
    setResultActionsEnabled(true);
    renderWarnings(result);
    renderTimeline(result);
    renderTable(result);
    if (result.bindefrist) {
      resultBindefrist.hidden = false;
      resultBindefrist.textContent = `Bindefrist: Endtermin ${formatDate(result.bindefrist.termin)} · Dauer ${result.bindefrist.tage} KT ab Angebotsabgabe ${formatDate(result.bindefrist.basis)}.`;
    } else {
      resultBindefrist.hidden = true;
      resultBindefrist.textContent = '';
    }
    const start = result.phasen[0]?.von ?? result.meilensteine[0]?.datum;
    const end = result.phasen[result.phasen.length - 1]?.bis ?? result.meilensteine[result.meilensteine.length - 1]?.datum;
    const projectLabel = input.projekt?.projektname || input.projekt?.vergabenummer || 'Unbenanntes Projekt';
    printCustomer.textContent = input.projekt?.kunde?.trim() || '—';
    printProject.textContent = input.projekt?.projektname?.trim() || '—';
    resultSummary.textContent = start && end
      ? `${projectLabel} · ${result.meilensteine.length} Meilensteine · ${formatDate(start)} bis ${formatDate(end)}`
      : `${projectLabel} · Noch kein belastbarer Terminplan.`;
    if (shouldPersist) persist(input);
    return true;
  };

  const showProjectFileMeta = (file: ProjektDatei): void => {
    projectFileMeta.hidden = false;
    const migrationHint = isVersionBefore(file.rechenkernVersion, KERN_1_9_VERSION);
    projectFileMeta.classList.toggle('project-file-meta--migration', migrationHint);
    leerenUndAnhaengen(projectFileMeta, document.createTextNode(
      `Projektdatei: Rechenkern ${file.rechenkernVersion} · Rechtsstand: ${file.rechtsstand}`,
    ));
    if (migrationHint) {
      projectFileMeta.append(
        document.createElement('br'),
        makeTextElement('strong', 'Hinweis: '),
        document.createTextNode('Rechenkern 1.9.0 verwendet neue Standardwerte für Versand- und Anpassungszeiten; dadurch können sich Termine verschieben.'),
      );
    }
  };

  const schedulePersist = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (disposed || !field<HTMLInputElement>(form, 'bekanntmachung').value) return;
      persist(readInput());
    }, 350);
  };

  hoeren(form, 'submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const erfolgreich = render(readInput());
    // Statuszeile konfliktabhängig — keine falsche Erfolgsmeldung in der
    // aria-live-Region
    formMessage.textContent = erfolgreich
      ? 'Terminplan aktualisiert.'
      : 'Kein Terminplan berechenbar — bitte die festen Starttermine korrigieren.';
    results.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });

  hoeren(form, 'input', () => { aenderungen += 1; schedulePersist(); });
  hoeren(form, 'change', (event) => {
    aenderungen += 1;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    if (target.name === 'vergabeordnung') {
      // Erst die verfügbaren Verfahrensarten nachziehen, dann Felder/Defaults
      updateVerfahrensartOptionen();
    }
    if (['vergabeordnung', 'verfahrensart', 'elektronischeAbgabe', 'ortsbegehung', 'dringlichkeit', 'versandBieterinformation'].includes(target.name)) {
      updateConditionalFields();
      updateDefaultFields();
    }
    if (['teststellungAktiv', 'praesentationAktiv', 'verhandlungRunde1Aktiv', 'verhandlungRunde2Aktiv', 'bindefristArt', 'angebotsaufforderungTermin', 'optimiertesAngebotKT', 'finalesAngebotKT'].includes(target.name)) {
      updateConditionalFields();
    }
    if (field<HTMLInputElement>(form, 'bekanntmachung').value) {
      // Statuszeile nachziehen: eine erfolgreiche Live-Neuberechnung räumt
      // eine stehengebliebene Konfliktmeldung ab
      const erfolgreich = render(readInput(), false);
      schedulePersist();
      formMessage.textContent = erfolgreich
        ? ''
        : 'Kein Terminplan berechenbar — bitte die festen Starttermine korrigieren.';
    }
  });

  const groessenOderFehler = (error: unknown, sonst: string): string =>
    error instanceof PlattformFehler && error.code === 'zu-gross' ? error.message : sonst;
  const stoppeSpeichern = async (): Promise<void> => {
    window.clearTimeout(saveTimer);
    await speicher.beruhigen();
  };
  const projektAktionBeenden = (): void => {
    projektAktion = false;
    if (speichernVorgemerkt && !disposed) {
      speichernVorgemerkt = false;
      schedulePersist();
    }
  };

  hoeren(resetButton, 'click', async () => {
    if (!dateiAuftragBeginnen()) return;
    projektAktion = true;
    try {
      if (!await plattform.zuruecksetzenBestaetigen() || disposed) return;
      resetMessage.textContent = 'Projekt wird zurückgesetzt …';
      await stoppeSpeichern();
      if (disposed) return;
      await speicher.entfernen();
      if (disposed) return;
      form.reset();
      field<HTMLInputElement>(form, 'bekanntmachung').value = plattform.zeit().kalendertag;
      // reset() stellt die Vergabeordnung auf VgV zurück; die per DOM
      // ersetzten Verfahrensart-Optionen tragen aber kein defaultSelected —
      // ohne explizites Setzen bliebe z. B. nach einem VSVgV-Projekt
      // „nicht offen" stehen statt des Ausgangswerts „offen"
      field<HTMLSelectElement>(form, 'vergabeordnung').value = 'vgv';
      updateVerfahrensartOptionen();
      field<HTMLSelectElement>(form, 'verfahrensart').value = 'offen';
      updateConditionalFields();
      updateDefaultFields();
      render(readInput(), false);
      speichernGesperrt = false;
      // Der neue Stand wird vor dem Freigeben weiterer Projektaktionen geschrieben.
      await speicher.schreiben(JSON.stringify(erstelleProjektDatei(readInput(), plattform.zeit().zeitpunkt)));
      if (disposed) return;
      formMessage.textContent = '';
      importMessage.textContent = '';
      resetMessage.textContent = 'Neues Projekt angelegt.';
      storageStatus.textContent = 'Zuletzt automatisch gespeichert: gerade eben.';
      projectFileMeta.hidden = true;
      projectFileMeta.textContent = '';
      projectFileMeta.classList.remove('project-file-meta--migration');
    } catch {
      if (!disposed) resetMessage.textContent = 'Das Projekt konnte nicht vollständig zurückgesetzt und gespeichert werden. Bitte versuchen Sie es erneut.';
    } finally {
      projektAktionBeenden();
      dateiAuftragBeenden();
    }
  });

  hoeren(importAktion, 'click', async (event) => {
    if (!dateiAuftragBeginnen()) { event.preventDefault(); return; }
    projektAktion = true;
    const vorher = importMessage.textContent;
    let geoeffnet = false;
    importMessage.textContent = 'Projektdatei auswählen …';
    try {
      const auswahl = await plattform.import.waehlen({ mime: 'application/json', endungen: ['.json'], maxBytes: MAX_PROJEKT_BYTES });
      if (disposed) return;
      if (auswahl.status === 'abgebrochen') { importMessage.textContent = vorher; return; }
      pruefeProjektGroesse(auswahl.wert.text);
      const parsed = parseProjektDatei(auswahl.wert.text);
      if (!parsed.ok) { importMessage.textContent = parsed.fehler.join(' '); return; }
      await stoppeSpeichern();
      if (disposed) return;
      setInput(parsed.datei.input);
      geoeffnet = true;
      // Über das Formular normalisiert rendern — readInput wendet die
      // Relevanz-Guards an (z. B. zwischenbewertungAT ohne Präsentation,
      // Verhandlung und optimierte Angebotsrunde), damit Restwerte aus der
      // Datei weder den Kern erreichen noch reexportiert werden
      render(readInput(), false);
      showProjectFileMeta(parsed.datei);
      formMessage.textContent = currentResult ? '' : 'Kein Terminplan berechenbar — bitte die festen Starttermine korrigieren.';
      resetMessage.textContent = '';
      speichernGesperrt = false;
      await speicher.schreiben(JSON.stringify(erstelleProjektDatei(readInput(), plattform.zeit().zeitpunkt)));
      if (disposed) return;
      importMessage.textContent = `Projektdatei geöffnet (Rechenkern ${parsed.datei.rechenkernVersion}, Rechtsstand: ${parsed.datei.rechtsstand}).`;
      storageStatus.textContent = 'Zuletzt automatisch gespeichert: gerade eben.';
    } catch (error) {
      if (!disposed) {
        importMessage.textContent = geoeffnet
          ? 'Die Projektdatei ist geöffnet, konnte aber nicht automatisch gespeichert werden. Exportieren Sie die Eingaben zur Sicherung.'
          : groessenOderFehler(error, 'Die Projektdatei konnte nicht vollständig geladen und gespeichert werden. Bitte versuchen Sie es erneut.');
        if (geoeffnet) storageStatus.textContent = texte.speicherNichtVerfuegbar;
      }
    } finally { projektAktionBeenden(); dateiAuftragBeenden(); }
  });

  const ausgabeAktionen: { format: AusgabeFormat; button: HTMLButtonElement; message: HTMLElement }[] = [
    { format: 'projekt', button: saveJsonButton, message: exportMessage },
    { format: 'excel', button: excelButton, message: excelMessage },
    { format: 'pdf', button: pdfButton, message: pdfMessage },
  ];
  const bindeAusgabe = (format: AusgabeFormat, weg: AusgabeWeg, button: HTMLButtonElement, message: HTMLElement): void => {
    hoeren(button, 'click', async () => {
      if (!currentInput || !currentResult || !dateiAuftragBeginnen()) return;
      try {
        await runDateiAusgabe(format, weg, button, message,
          () => ({ input: currentInput!, result: currentResult!, zeit: plattform.zeit() }), optionen, () => !disposed);
      } finally { dateiAuftragBeenden(); }
    });
  };
  for (const { format, button, message } of ausgabeAktionen) {
    bindeAusgabe(format, 'exportieren', button, message);
    if (plattform.ausgabe.teilen) {
      const teilen = seite.createElement('button');
      teilen.setAttribute('type', 'button');
      teilen.setAttribute('id', format === 'projekt' ? 'share-json' : `share-${format}`);
      teilen.setAttribute('data-file-share', format);
      teilen.setAttribute('data-requires-result', '');
      teilen.className = 'button button-secondary';
      teilen.textContent = ausgabeBeschriftung(format, 'teilen');
      exportActions.append(teilen);
      resultActionButtons.push(teilen);
      bindeAusgabe(format, 'teilen', teilen, message);
      abmelden.push(() => teilen.remove());
    }
  }
  field<HTMLInputElement>(form, 'bekanntmachung').value = plattform.zeit().kalendertag;
  updateVerfahrensartOptionen();
  updateConditionalFields();
  updateDefaultFields();
  render(readInput(), false);
  storageStatus.textContent = 'Gespeichertes Projekt wird geladen …';
  void (async () => {
    try {
      const saved = await plattform.speicher.lesen();
      if (disposed) return;
      if (saved !== null) {
        pruefeProjektGroesse(saved);
        const parsed = parseProjektDatei(saved);
        if (!parsed.ok) {
          speichernGesperrt = true;
          storageStatus.textContent = 'Das gespeicherte Projekt konnte nicht gelesen werden und bleibt erhalten. Importieren Sie eine Projektdatei oder setzen Sie das Projekt zurück. ' + parsed.fehler.join(' ');
          return;
        }
        if (aenderungen === 0) {
          setInput(parsed.datei.input);
          // normalisiert wie beim Import einer Projektdatei
          render(readInput(), false);
          showProjectFileMeta(parsed.datei);
          // TT.MM.JJJJ mit führenden Nullen — toLocaleString('de-DE') allein
          // liefert z. B. „23.7.2026“
          storageStatus.textContent = `Lokales Projekt geladen (${new Intl.DateTimeFormat('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }).format(new Date(parsed.datei.gespeichertAm))} Uhr).`;
          return;
        }
      }
      geladen = true;
      persist(readInput());
    } catch (error) {
      speichernGesperrt = true;
      if (!disposed) {
        storageStatus.textContent = error instanceof PlattformFehler && error.code === 'zu-gross'
          ? error.message + ' Ein vorhandenes Projekt bleibt erhalten. Importieren Sie eine Projektdatei oder setzen Sie das Projekt zurück.'
          : texte.speicherNichtVerfuegbar + ' Ein vorhandenes Projekt bleibt erhalten. Sie können weiter rechnen und die Eingaben als Projektdatei exportieren.';
      }
    } finally { geladen = true; if (!disposed) setResultActionsEnabled(Boolean(currentResult)); }
  })();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(saveTimer);
      abmelden.forEach(fn => fn());
      // Während eines bereits begonnenen Schreibvorgangs darf keine neue Instanz
      // denselben Speicher übernehmen. Wartende alte Aufträge werden verworfen.
      void speicher.dispose().then(() => aktiveSeiten.delete(seite));
    },
  };
}
