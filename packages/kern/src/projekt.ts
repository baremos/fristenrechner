/**
 * Projektdatei-Validierung des Fristenrechners: Import/Export des
 * versionierten JSON-Schemas (`ProjektDatei`). Die Datei kommt aus einem
 * lokalen Speicher oder aus einer vom Nutzer gewählten Datei und ist als
 * Fremdeingabe zu behandeln: alles wird geprüft, Fehlermeldungen sind
 * nutzerfreundlich deutsch.
 */

import type {
  Bundesland,
  ProjektDatei,
  ScheduleInput,
  Verfahrensart,
  Vergabeordnung,
} from './api.js';
import { ALLE_BUNDESLAENDER, istGueltigesISODate } from './kalender.js';
import { ALLE_VERFAHRENSARTEN, RECHTSSTAND, RECHTSSTAND_DATUM, REGELVERSION, verfahrensProfil } from './fristen.js';

export const VERFAHRENSARTEN: Verfahrensart[] = ALLE_VERFAHRENSARTEN;

export const VERGABEORDNUNGEN_LISTE: Vergabeordnung[] = [
  'vgv',
  'vob_a_eu',
  'sektvo',
  'vsvgv',
  'konzvgv',
  'uvgo',
  'vob_a_1',
];

type Unbekannt = Record<string, unknown>;

function istObjekt(wert: unknown): wert is Unbekannt {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

class Pruefung {
  fehler: string[] = [];

  fehlt(pfad: string): void {
    this.fehler.push(`Pflichtfeld fehlt: ${pfad}`);
  }

  ungueltig(pfad: string, grund: string): void {
    this.fehler.push(`Ungültiger Wert bei ${pfad}: ${grund}`);
  }

  string(obj: Unbekannt, pfad: string, feld: string, pflicht: boolean, maxLaenge = 500): string | undefined {
    const wert = obj[feld];
    if (wert === undefined || wert === null) {
      if (pflicht) this.fehlt(`${pfad}${feld}`);
      return undefined;
    }
    if (typeof wert !== 'string') {
      this.ungueltig(`${pfad}${feld}`, 'Text erwartet');
      return undefined;
    }
    if (wert.length > maxLaenge) {
      this.ungueltig(`${pfad}${feld}`, `länger als ${maxLaenge} Zeichen`);
      return undefined;
    }
    return wert;
  }

  zahl(obj: Unbekannt, pfad: string, feld: string, pflicht: boolean): number | undefined {
    const wert = obj[feld];
    if (wert === undefined || wert === null) {
      if (pflicht) this.fehlt(`${pfad}${feld}`);
      return undefined;
    }
    if (typeof wert !== 'number' || !Number.isInteger(wert) || wert < 0 || wert > 3650) {
      this.ungueltig(`${pfad}${feld}`, 'ganze Zahl zwischen 0 und 3650 erwartet');
      return undefined;
    }
    return wert;
  }

  boolesch(obj: Unbekannt, pfad: string, feld: string): boolean {
    const wert = obj[feld];
    if (typeof wert !== 'boolean') {
      if (wert === undefined) this.fehlt(`${pfad}${feld}`);
      else this.ungueltig(`${pfad}${feld}`, 'ja/nein erwartet');
      return false;
    }
    return wert;
  }

  datum(obj: Unbekannt, pfad: string, feld: string, pflicht: boolean): string | undefined {
    const wert = this.string(obj, pfad, feld, pflicht, 10);
    if (wert === undefined) return undefined;
    if (!istGueltigesISODate(wert)) {
      this.ungueltig(`${pfad}${feld}`, `kein gültiges Datum (JJJJ-MM-TT): "${wert}"`);
      return undefined;
    }
    return wert;
  }

  auswahl<T extends string>(obj: Unbekannt, pfad: string, feld: string, erlaubt: readonly T[]): T | undefined {
    const wert = obj[feld];
    if (wert === undefined || wert === null) {
      this.fehlt(`${pfad}${feld}`);
      return undefined;
    }
    if (typeof wert !== 'string' || !(erlaubt as readonly string[]).includes(wert)) {
      this.ungueltig(`${pfad}${feld}`, `erwartet: ${erlaubt.join(' | ')}`);
      return undefined;
    }
    return wert as T;
  }
}

function pruefeScheduleInput(roh: unknown, p: Pruefung): ScheduleInput | undefined {
  if (!istObjekt(roh)) {
    p.ungueltig('input', 'Objekt erwartet');
    return undefined;
  }

  // Optional: Dateien aus Kern < 1.5.0 tragen keine Vergabeordnung — sie
  // gelten als VgV (damals einziger Rechtsrahmen).
  let vergabeordnung: Vergabeordnung = 'vgv';
  if (roh.vergabeordnung !== undefined) {
    vergabeordnung = p.auswahl(roh, 'input.', 'vergabeordnung', VERGABEORDNUNGEN_LISTE) ?? 'vgv';
  }
  const verfahrensart = p.auswahl(roh, 'input.', 'verfahrensart', VERFAHRENSARTEN);
  if (verfahrensart !== undefined && verfahrensProfil(vergabeordnung, verfahrensart) === undefined) {
    p.ungueltig(
      'input.verfahrensart',
      `die Verfahrensart „${verfahrensart}" ist in der gewählten Vergabeordnung nicht vorgesehen`
    );
  }
  p.auswahl(roh, 'input.', 'bundesland', ALLE_BUNDESLAENDER as readonly Bundesland[]);
  p.datum(roh, 'input.', 'bekanntmachung', true);
  // Fester Termin der Aufforderung zur Angebotsabgabe (Kern 1.7.0, nur
  // zweistufige Verfahren — der Kern ignoriert ihn sonst mit Warnung)
  p.datum(roh, 'input.', 'angebotsaufforderung', false);

  if (!istObjekt(roh.optionen)) {
    p.fehlt('input.optionen');
  } else {
    const o = roh.optionen;
    p.boolesch(o, 'input.optionen.', 'elektronischeAbgabe');
    p.boolesch(o, 'input.optionen.', 'ortsbegehung');
    p.boolesch(o, 'input.optionen.', 'dringlichkeit');
    p.auswahl(o, 'input.optionen.', 'versandBieterinformation', ['elektronisch', 'postalisch'] as const);
    // Abgabe-Uhrzeit (Kern 1.8.0, optional): "HH:MM" — Altdateien ohne das
    // Feld bleiben kompatibel (Fristablauf 24:00 Uhr, bisheriger Rechenweg)
    const abgabeUhrzeit = p.string(o, 'input.optionen.', 'abgabeUhrzeit', false, 5);
    if (abgabeUhrzeit !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(abgabeUhrzeit)) {
      p.ungueltig('input.optionen.abgabeUhrzeit', `keine gültige Uhrzeit (HH:MM): "${abgabeUhrzeit}"`);
    }
    if (!istObjekt(o.teststellung)) {
      p.fehlt('input.optionen.teststellung');
    } else {
      p.boolesch(o.teststellung, 'input.optionen.teststellung.', 'aktiv');
      p.zahl(o.teststellung, 'input.optionen.teststellung.', 'dauerAT', true);
      p.datum(o.teststellung, 'input.optionen.teststellung.', 'start', false);
    }
    // Optionale Zeitraum-Termine (max. 2 Verhandlungsrunden)
    for (const feld of ['praesentation', 'verhandlungRunde1', 'verhandlungRunde2'] as const) {
      if (o[feld] === undefined) continue;
      if (!istObjekt(o[feld])) {
        p.ungueltig(`input.optionen.${feld}`, 'Objekt erwartet');
        continue;
      }
      p.boolesch(o[feld], `input.optionen.${feld}.`, 'aktiv');
      p.zahl(o[feld], `input.optionen.${feld}.`, 'dauerAT', true);
      p.datum(o[feld], `input.optionen.${feld}.`, 'start', false);
    }
  }

  if (roh.fristen !== undefined) {
    if (!istObjekt(roh.fristen)) {
      p.ungueltig('input.fristen', 'Objekt erwartet');
    } else {
      const f = roh.fristen;
      for (const feld of ['angebotsfristKT', 'teilnahmefristKT', 'bieterfragenVorAngebotKT', 'bewerberfragenVorTeilnahmeKT', 'klarstellungVorAngebotKT', 'wartefristKT', 'optimiertesAngebotKT', 'finalesAngebotKT']) {
        p.zahl(f, 'input.fristen.', feld, false);
      }
      if (f.bindefrist !== undefined) {
        if (!istObjekt(f.bindefrist)) {
          p.ungueltig('input.fristen.bindefrist', 'Objekt erwartet');
        } else {
          const hatTage = f.bindefrist.tage !== undefined;
          const hatTermin = f.bindefrist.termin !== undefined;
          if (hatTage === hatTermin) {
            p.ungueltig('input.fristen.bindefrist', 'entweder "tage" oder "termin" angeben (genau eines)');
          } else if (hatTage) {
            p.zahl(f.bindefrist, 'input.fristen.bindefrist.', 'tage', true);
          } else {
            p.datum(f.bindefrist, 'input.fristen.bindefrist.', 'termin', true);
          }
        }
      }
    }
  }

  if (!istObjekt(roh.interneFristen)) {
    p.fehlt('input.interneFristen');
  } else {
    for (const feld of ['bewertungAT', 'aufklaerungEntscheidungAT', 'internerZuschlagAT', 'teststellungAuswertungAT']) {
      p.zahl(roh.interneFristen, 'input.interneFristen.', feld, true);
    }
    p.zahl(roh.interneFristen, 'input.interneFristen.', 'teilnahmeBewertungAT', false);
    p.zahl(roh.interneFristen, 'input.interneFristen.', 'infoVersandAT', false);
    p.zahl(roh.interneFristen, 'input.interneFristen.', 'zwischenbewertungAT', false);
    // Seit Kern 1.9.0: Versandzeiten und Anpassung der Vergabeunterlagen
    for (const feld of ['aufforderungVersandAT', 'einladungVersandAT', 'vuAnpassungRunde1AT', 'vuAnpassungRunde2AT']) {
      p.zahl(roh.interneFristen, 'input.interneFristen.', feld, false);
    }
  }

  if (roh.projekt !== undefined) {
    if (!istObjekt(roh.projekt)) {
      p.ungueltig('input.projekt', 'Objekt erwartet');
    } else {
      p.string(roh.projekt, 'input.projekt.', 'kunde', false);
      p.string(roh.projekt, 'input.projekt.', 'projektname', false);
      p.string(roh.projekt, 'input.projekt.', 'vergabenummer', false);
    }
  }

  return p.fehler.length === 0 ? (roh as unknown as ScheduleInput) : undefined;
}

/**
 * Strikte ISO-8601-Zeitstempel-Prüfung. Bewusst ohne `Date.parse`: das
 * normalisiert ungültige Kalendertage (30.02. → 02.03.) statt sie
 * abzulehnen; der Datumsteil läuft daher über die exakte
 * Kalender-Validierung, Zeit- und Offset-Teile über Bereichsprüfungen.
 */
function istGueltigerZeitstempel(wert: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(wert);
  if (!m) return false;
  if (!istGueltigesISODate(m[1])) return false;
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return false;
  if (m[4] !== undefined && Number(m[4]) > 59) return false;
  if (m[5] !== 'Z') {
    const offset = /^[+-](\d{2}):(\d{2})$/.exec(m[5])!;
    const stunden = Number(offset[1]);
    const minuten = Number(offset[2]);
    // Reale Zeitzonen-Offsets: bis ±14:00, bei Stunde 14 keine Minuten mehr.
    if (stunden > 14 || minuten > 59 || (stunden === 14 && minuten > 0)) return false;
  }
  return true;
}

/**
 * Baut eine speicher-/exportfertige Projektdatei. Der Zeitstempel kommt von
 * der UI (`new Date().toISOString()`), damit der Kern frei von Seiteneffekten
 * bleibt; Version und Rechtsstand stammen aus dem Kern.
 */
export function erstelleProjektDatei(input: ScheduleInput, gespeichertAm: string): ProjektDatei {
  return {
    version: 1,
    gespeichertAm,
    rechenkernVersion: REGELVERSION,
    rechtsstand: RECHTSSTAND,
    rechtsstandDatum: RECHTSSTAND_DATUM,
    input,
  };
}

/** Validiert (und migriert ggf.) eine importierte Projektdatei. */
export function parseProjektDatei(json: string):
  | { ok: true; datei: ProjektDatei }
  | { ok: false; fehler: string[] } {
  let roh: unknown;
  try {
    roh = JSON.parse(json);
  } catch {
    return { ok: false, fehler: ['Die Datei ist kein gültiges JSON.'] };
  }
  if (!istObjekt(roh)) {
    return { ok: false, fehler: ['Die Datei enthält kein Projekt-Objekt.'] };
  }

  if (roh.version !== 1) {
    return {
      ok: false,
      fehler: [
        `Unbekannte Schema-Version "${String(roh.version)}" — diese Version des Rechners liest nur Version 1. ` +
          'Bitte die Datei mit einer aktuellen Version des Terminplaners neu exportieren.',
      ],
    };
  }

  const p = new Pruefung();
  const gespeichertAm = p.string(roh, '', 'gespeichertAm', true, 40);
  if (gespeichertAm !== undefined && !istGueltigerZeitstempel(gespeichertAm)) {
    p.ungueltig('gespeichertAm', `kein gültiger ISO-Zeitstempel: "${gespeichertAm}"`);
  }
  p.string(roh, '', 'rechenkernVersion', true, 20);
  p.string(roh, '', 'rechtsstand', true, 120);
  p.datum(roh, '', 'rechtsstandDatum', false);
  const input = pruefeScheduleInput(roh.input ?? undefined, p);

  if (p.fehler.length > 0 || input === undefined) {
    return { ok: false, fehler: p.fehler };
  }
  return { ok: true, datei: roh as unknown as ProjektDatei };
}
