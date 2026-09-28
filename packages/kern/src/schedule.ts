/**
 * Terminketten-Berechnung des Fristenrechners: `calculateSchedule`.
 *
 * Reine Funktion, wirft nie — ungültige Eingaben führen zu Warnungen und einem
 * bestmöglichen (ggf. leeren) Ergebnis. Jede Rechenregel ist eigenständig
 * gegen GWB/VgV und die EU-Fristen-VO (EWG, Euratom) Nr. 1182/71 verifiziert.
 *
 * Fristberechnung:
 *  - KT-Fristen (Angebots-/Teilnahmefristen): Tag der Absendung zählt nicht
 *    mit (Art. 3 Abs. 1 VO 1182/71; VgV-Wortlaut „ab dem Tag nach der
 *    Absendung") ⇒ Fristende = Start + n Kalendertage; fällt es auf
 *    Sa/So/Feiertag, verschiebt es sich auf den nächsten Arbeitstag
 *    (Art. 3 Abs. 4 VO 1182/71).
 *  - Wartefrist des § 134 Abs. 2 GWB: vorsorgliche Auslegung (seit
 *    Kern 1.3.0) — ein Fristende an Sa/So/Feiertag wird entsprechend Art. 3
 *    Abs. 4 VO 1182/71 auf den nächsten Arbeitstag verlängert. Der
 *    frühestmögliche Zuschlag liegt am Folgetag und wird praktisch auf den
 *    nächsten Arbeitstag gelegt.
 *  - AT-Fristen (interne Bearbeitung): WORKDAY-Semantik.
 */

import type {
  Bundesland,
  Meilenstein,
  PhasenBlock,
  ScheduleInput,
  ScheduleResult,
  TerminMitDauer,
  Vergabeordnung,
} from './api.js';
import {
  addArbeitstage,
  addTage,
  ALLE_BUNDESLAENDER,
  aufArbeitstagVerschieben,
  aufVorherigenArbeitstag,
  istGueltigesISODate,
} from './kalender.js';
import {
  ALLE_VERFAHRENSARTEN,
  defaultFristen,
  mindestAngebotsfristKT,
  mindestTeilnahmefristKT,
  RECHTSSTAND,
  RECHTSSTAND_DATUM,
  REGELVERSION,
  VERGABEORDNUNGEN,
  verfahrensProfil,
  WERTE,
} from './fristen.js';

function fmtDE(iso: string): string {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

const PHASEN_LABELS: Record<Meilenstein['phase'], string> = {
  teilnahmewettbewerb: 'Teilnahmewettbewerb',
  einholung: 'Angebotsphase',
  verhandlung: 'Verhandlungsphase',
  bewertung: 'Bewertung',
  teststellung: 'Teststellung',
  zuschlag: 'Zuschlag',
};

function leeresErgebnis(warnungen: string[]): ScheduleResult {
  return {
    meilensteine: [],
    phasen: [],
    warnungen,
    konflikte: [],
    fruehesteStarts: {},
    regelversion: REGELVERSION,
    rechtsstand: RECHTSSTAND,
    rechtsstandDatum: RECHTSSTAND_DATUM,
  };
}

/** Reine Funktion; wirft nie, ungültige Eingaben ⇒ `warnungen` + bestmögliches Ergebnis. */
export function calculateSchedule(input: ScheduleInput): ScheduleResult {
  try {
    return berechne(input);
  } catch (fehler) {
    return leeresErgebnis([
      `Interner Fehler bei der Berechnung: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    ]);
  }
}

function berechne(input: ScheduleInput): ScheduleResult {
  const warnungen: string[] = [];
  // Harte Eingabekonflikte fester Starttermine + frühestmögliche Termine je
  // aktiver Option (seit Kern 1.4.0)
  const konflikte: ScheduleResult['konflikte'] = [];
  const fruehesteStarts: ScheduleResult['fruehesteStarts'] = {};

  if (!input || typeof input !== 'object') {
    return leeresErgebnis(['Keine Eingabedaten übergeben.']);
  }
  // Fehlender Wert = VgV (Projektdateien aus Kern < 1.5.0 kannten nur die VgV)
  const vergabeordnung: Vergabeordnung = input.vergabeordnung ?? 'vgv';
  const voProfil = VERGABEORDNUNGEN[vergabeordnung];
  if (!voProfil) {
    return leeresErgebnis([`Unbekannte Vergabeordnung: "${String(input.vergabeordnung)}".`]);
  }
  const profil = verfahrensProfil(vergabeordnung, input.verfahrensart);
  if (!profil) {
    const bekannt = ALLE_VERFAHRENSARTEN.includes(input.verfahrensart);
    return leeresErgebnis([
      bekannt
        ? `Die Verfahrensart „${String(input.verfahrensart)}" ist in der ${voProfil.kurz} nicht vorgesehen.`
        : `Unbekannte Verfahrensart: "${String(input.verfahrensart)}".`,
    ]);
  }
  if (typeof input.bekanntmachung !== 'string' || !istGueltigesISODate(input.bekanntmachung)) {
    return leeresErgebnis(['Ungültiges oder fehlendes Startdatum (Absendung der Bekanntmachung).']);
  }

  let land: Bundesland = input.bundesland;
  if (!ALLE_BUNDESLAENDER.includes(land)) {
    warnungen.push(
      `Unbekanntes Bundesland "${String(input.bundesland)}" — es werden nur bundesweite Feiertage berücksichtigt.`
    );
  }

  const optionen = input.optionen ?? {
    elektronischeAbgabe: false,
    ortsbegehung: false,
    dringlichkeit: false,
    versandBieterinformation: 'elektronisch' as const,
    teststellung: { aktiv: false, dauerAT: 0 },
  };
  if (!input.optionen) warnungen.push('Keine Optionen übergeben — es gelten die Standardannahmen.');

  // Abgabe-Uhrzeit (seit Kern 1.8.0): Ist für die Abgabe eine Uhrzeit bestimmt
  // (z. B. 10:00 statt Fristablauf 24:00 Uhr), wird jeder Abgabe-/
  // Eingangstermin auf den nächsten Arbeitstag NACH dem rechnerischen
  // Fristende gelegt, damit die volle Frist gewahrt bleibt. Ungültige Werte
  // werden mit Warnung ignoriert (Fristablauf dann 24:00 Uhr).
  let abgabeUhrzeit: string | undefined;
  const uhrzeitRoh = optionen.abgabeUhrzeit;
  if (uhrzeitRoh !== undefined && uhrzeitRoh !== null && uhrzeitRoh !== '') {
    if (typeof uhrzeitRoh === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeitRoh)) {
      abgabeUhrzeit = uhrzeitRoh;
    } else {
      warnungen.push(
        `Ungültige Abgabe-Uhrzeit („${String(uhrzeitRoh)}") — erwartet wird HH:MM (z. B. 10:00); ` +
          'die Abgabetermine bleiben unverschoben (Fristablauf 24:00 Uhr).'
      );
    }
  }
  /** Label-Zusatz der Abgabe-/Eingangstermine bei gesetzter Uhrzeit. */
  const uhrzeitZusatz = abgabeUhrzeit !== undefined ? ` bis ${abgabeUhrzeit} Uhr` : '';

  /** Ganzzahl ≥ 0 erzwingen; sonst Warnung + Rückfall. */
  function ganz(wert: unknown, fallback: number, name: string): number {
    if (wert === undefined || wert === null) return fallback;
    if (typeof wert !== 'number' || !Number.isInteger(wert) || wert < 0) {
      warnungen.push(`Ungültiger Wert für ${name} („${String(wert)}") — verwendet wird ${fallback}.`);
      return fallback;
    }
    return wert;
  }

  const defaults = defaultFristen(vergabeordnung, input.verfahrensart, optionen);
  const f = input.fristen ?? {};
  const eff = {
    angebotsfristKT: ganz(f.angebotsfristKT, defaults.angebotsfristKT, 'Angebotsfrist'),
    teilnahmefristKT:
      defaults.teilnahmefristKT === undefined
        ? undefined
        : ganz(f.teilnahmefristKT, defaults.teilnahmefristKT, 'Teilnahmefrist'),
    bieterfragenVorAngebotKT: ganz(f.bieterfragenVorAngebotKT, defaults.bieterfragenVorAngebotKT, 'Bieterfragen-Frist'),
    // undefined ⇒ einstufiges Verfahren ohne Teilnahmewettbewerb (Kern 1.9.0)
    bewerberfragenVorTeilnahmeKT:
      defaults.bewerberfragenVorTeilnahmeKT === undefined
        ? undefined
        : ganz(f.bewerberfragenVorTeilnahmeKT, defaults.bewerberfragenVorTeilnahmeKT, 'Bewerberfragen-Frist'),
    klarstellungVorAngebotKT: ganz(f.klarstellungVorAngebotKT, defaults.klarstellungVorAngebotKT, 'Klarstellungs-Frist'),
    // undefined ⇒ keine Wartepflicht (Unterschwelle, seit Kern 1.6.0)
    wartefristKT:
      defaults.wartefristKT === undefined ? undefined : ganz(f.wartefristKT, defaults.wartefristKT, 'Wartefrist'),
    optimiertesAngebotKT:
      f.optimiertesAngebotKT !== undefined
        ? ganz(f.optimiertesAngebotKT, WERTE.optimiertesAngebotKT, 'Frist optimierte Angebote')
        : defaults.optimiertesAngebotKT,
    finalesAngebotKT:
      f.finalesAngebotKT !== undefined
        ? ganz(f.finalesAngebotKT, WERTE.finalesAngebotKT, 'Frist finale Angebote')
        : defaults.finalesAngebotKT,
  };

  const iF = input.interneFristen ?? ({} as ScheduleInput['interneFristen']);
  if (!input.interneFristen) warnungen.push('Keine internen Fristen übergeben — verwendet wird jeweils 0 Arbeitstage.');
  const intern = {
    bewertungAT: ganz(iF.bewertungAT, 0, 'Bewertungszeitraum'),
    aufklaerungEntscheidungAT: ganz(iF.aufklaerungEntscheidungAT, 0, 'Aufklärung/Entscheidungsfindung'),
    internerZuschlagAT: ganz(iF.internerZuschlagAT, 0, 'interner Zuschlag'),
    teststellungAuswertungAT: ganz(iF.teststellungAuswertungAT, 0, 'Auswertung der Teststellung'),
    teilnahmeBewertungAT: ganz(iF.teilnahmeBewertungAT, ganz(iF.bewertungAT, 0, 'Bewertungszeitraum'), 'Bewertung der Teilnahmeanträge'),
    // Default 0 = Versand am Tag der internen Zuschlagsentscheidung.
    infoVersandAT: ganz(iF.infoVersandAT, 0, 'Versand der Bieterinformation'),
    // Bewertung vor Präsentation/Verhandlungsrunde; Default: bewertungAT.
    zwischenbewertungAT: ganz(iF.zwischenbewertungAT, ganz(iF.bewertungAT, 0, 'Bewertungszeitraum'), 'Zwischenbewertung'),
    // Seit Kern 1.9.0: Versand einer Aufforderung standardmäßig 1 AT nach dem
    // Bewertungs-/Vorbereitungsende; Einladung zur Bieterverhandlung 1 AT
    // nach Bewertungsende; Anpassung der Vergabeunterlagen 2 AT vor jeder
    // weiteren Angebotsrunde — auch ohne Verhandlungstermin (Praxiswerte).
    aufforderungVersandAT: ganz(iF.aufforderungVersandAT, WERTE.aufforderungVersandAT, 'Versand der Aufforderung'),
    einladungVersandAT: ganz(iF.einladungVersandAT, WERTE.einladungVersandAT, 'Versand der Einladung zur Bieterverhandlung'),
    vuAnpassungRunde1AT: ganz(iF.vuAnpassungRunde1AT, WERTE.vuAnpassungAT, 'Anpassung der Vergabeunterlagen nach Runde 1'),
    vuAnpassungRunde2AT: ganz(iF.vuAnpassungRunde2AT, WERTE.vuAnpassungAT, 'Anpassung der Vergabeunterlagen nach Runde 2'),
  };

  const meilensteine: Meilenstein[] = [];
  const merken = (m: Meilenstein): Meilenstein => {
    meilensteine.push(m);
    return m;
  };

  // Normzitat der Feiertagsverschiebung je Vergabeordnung (Kern 1.6.0):
  // Oberschwelle = EU-Fristen-VO; UVgO = § 54 UVgO i. V. m. § 193 BGB;
  // VOB/A 1. Abschnitt ohne eigene Regel (§ 193 BGB entsprechend)
  const verschiebungsNorm = voProfil.fristverschiebungNorm ?? 'Art. 3 Abs. 4 VO (EWG) 1182/71';
  // Fristende = Ablauf des letzten Fristtags (24:00 Uhr) — Grundlage der
  // Uhrzeit-Verschiebung (Kern 1.8.0); Zitat je Vergabeordnung
  const fristendeNorm = voProfil.fristendeNorm ?? 'Art. 3 Abs. 2 Buchst. b VO (EWG) 1182/71';

  /**
   * Kalendertagsfrist ab Absendetag: Ende = Start + n KT, Sa/So/Feiertag →
   * nächster Arbeitstag. Mit Abgabe-Uhrzeit (Kern 1.8.0) liegt der
   * Abgabetermin einen Arbeitstag HINTER dem so bestimmten Fristende: Die
   * Frist läuft erst mit dem letzten Fristtag um 24:00 Uhr ab — ein
   * Schlusstermin z. B. um 10:00 Uhr desselben Tages würde sie verkürzen.
   */
  function ktTermin(start: string, kt: number): { datum: string; rechenweg: string } {
    const rechnerisch = addTage(start, kt);
    const fristende = aufArbeitstagVerschieben(rechnerisch, land);
    let rechenweg = `${kt} Kalendertage ab ${fmtDE(start)} (Tag nach der Absendung zählt als Tag 1) → ${fmtDE(rechnerisch)}`;
    if (fristende !== rechnerisch) {
      rechenweg += `; Sa/So/Feiertag → nächster Arbeitstag ${fmtDE(fristende)} (${verschiebungsNorm})`;
    }
    if (abgabeUhrzeit === undefined) return { datum: fristende, rechenweg };
    const datum = aufArbeitstagVerschieben(addTage(fristende, 1), land);
    rechenweg +=
      `; Abgabe bis ${abgabeUhrzeit} Uhr statt Fristablauf 24:00 Uhr (${fristendeNorm}) → ` +
      `nächster Arbeitstag ${fmtDE(datum)}, damit die volle Frist gewahrt bleibt`;
    return { datum, rechenweg };
  }

  /** Arbeitstagsfrist (WORKDAY-Semantik: Starttag zählt nicht mit). */
  function atTermin(start: string, at: number): { datum: string; rechenweg: string } {
    const datum = addArbeitstage(start, at, land);
    return { datum, rechenweg: `${at} Arbeitstage nach ${fmtDE(start)} → ${fmtDE(datum)}` };
  }

  /**
   * Versandtermin (Aufforderung, Einladung) n AT nach einem Bezugstermin;
   * 0 AT = Versand am Bezugstag (Kern 1.9.0).
   */
  function versandTermin(start: string, at: number, bezug: string): { datum: string; rechenweg: string } {
    if (at > 0) {
      const t = atTermin(start, at);
      return { datum: t.datum, rechenweg: `${t.rechenweg} (Versand ${at} AT nach ${bezug})` };
    }
    return { datum: start, rechenweg: `Versand am Tag ${bezug} (${fmtDE(start)})` };
  }

  /**
   * Praxis-Hinweis für Abgabe-/Eingangstermine am 24.12. oder 31.12.: formal
   * Arbeitstage (keine gesetzlichen Feiertage), faktisch vielerorts
   * Betriebsruhe — die automatische Feiertagsverschiebung greift hier nicht.
   */
  function abgabetagHinweis(datum: string): string[] {
    const monatTag = datum.slice(5);
    if (monatTag !== '12-24' && monatTag !== '12-31') return [];
    return [
      `Der Abgabetermin ${fmtDE(datum)} fällt auf ${monatTag === '12-24' ? 'Heiligabend' : 'Silvester'} — ` +
        'formal ein Arbeitstag, faktisch vielerorts Betriebsruhe; die Frist sollte angepasst werden.',
    ];
  }

  // --- Start & ggf. Teilnahmewettbewerb --------------------------------------

  const startphase = profil.zweistufig ? 'teilnahmewettbewerb' : 'einholung';
  const bekanntmachung = merken({
    id: 'bekanntmachung',
    label:
      profil.startAufforderung === true
        ? 'Absendung der Aufforderung zur Angebotsabgabe'
        : 'Absendung der Auftragsbekanntmachung',
    phase: startphase,
    datum: input.bekanntmachung,
    fristTyp: 'eingabe',
    abhaengigVon: [],
    rechenweg: 'Nutzereingabe (Starttermin des Verfahrens)',
    warnungen: [],
  });

  let angebotsstart = bekanntmachung; // Auslöser der Angebotsfrist

  if (profil.zweistufig && profil.teilnahmefrist && eff.teilnahmefristKT !== undefined) {
    const t = ktTermin(bekanntmachung.datum, eff.teilnahmefristKT);
    const tWarn: string[] = [...abgabetagHinweis(t.datum)];
    const tp = profil.teilnahmefrist;
    const tNorm = (optionen.dringlichkeit && tp.dringlichkeitKT !== undefined ? tp.normDringlichkeit : undefined) ?? tp.norm;
    const minT = mindestTeilnahmefristKT(vergabeordnung, input.verfahrensart, optionen);
    if (minT !== undefined && eff.teilnahmefristKT < minT) {
      if (tp.absolutMinKT !== undefined && eff.teilnahmefristKT >= tp.absolutMinKT) {
        // SektVO-Staffel: „in der Regel mindestens 30, keinesfalls weniger
        // als 15 Tage" — Werte dazwischen nur im begründeten Ausnahmefall
        tWarn.push(
          `Teilnahmefrist von ${eff.teilnahmefristKT} KT unterschreitet die Regelfrist von ${minT} KT (${tNorm}) — ` +
            `zulässig nur im begründeten Ausnahmefall, keinesfalls weniger als ${tp.absolutMinKT} KT.`
        );
      } else if (tp.absolutMinKT !== undefined) {
        tWarn.push(
          `Teilnahmefrist von ${eff.teilnahmefristKT} KT unterschreitet die absolute Untergrenze von ${tp.absolutMinKT} KT (${tNorm}).`
        );
      } else {
        tWarn.push(`Teilnahmefrist von ${eff.teilnahmefristKT} KT unterschreitet die gesetzliche Mindestfrist von ${minT} KT (${tNorm}).`);
      }
    }
    const teilnahmeEnde = merken({
      id: 'teilnahmefrist_ende',
      label: `Ablauf der Teilnahmefrist (Eingang der Teilnahmeanträge${uhrzeitZusatz})`,
      phase: 'teilnahmewettbewerb',
      datum: t.datum,
      // Unterschwelle: kein gesetzlicher Zahlwert („ausreichende
      // Bewerbungsfrist") — der Wert ist ein Praxisvorschlag (Kern 1.6.0)
      fristTyp: tp.typ === 'praxis' ? 'praxis' : 'gesetzlich',
      abhaengigVon: ['bekanntmachung'],
      rechtsgrundlage: tp.typ === 'praxis' ? undefined : tNorm,
      rechenweg:
        tp.typ === 'praxis'
          ? `${t.rechenweg} (Praxiswert; ${tp.norm} verlangt nur eine ausreichende Frist ohne Zahlwert)`
          : t.rechenweg,
      warnungen: tWarn,
    });

    // Ende der Bewerberfragen (seit Kern 1.9.0): n KT vor Ablauf der
    // Teilnahmefrist, an Sa/So/Feiertag auf den vorherigen Arbeitstag vorgezogen
    // — Rückwärtsregel wie bei den Bieterfragen. 0 KT = Meilenstein entfällt
    // (Konvention wie bei den Angebotsrunden).
    if (eff.bewerberfragenVorTeilnahmeKT !== undefined && eff.bewerberfragenVorTeilnahmeKT > 0) {
      const bwRechnerisch = addTage(teilnahmeEnde.datum, -eff.bewerberfragenVorTeilnahmeKT);
      const bwDatum = aufVorherigenArbeitstag(bwRechnerisch, land);
      merken({
        id: 'bewerberfragen_ende',
        label: 'Ende der Frist für Bewerberfragen',
        phase: 'teilnahmewettbewerb',
        datum: bwDatum,
        fristTyp: 'praxis',
        abhaengigVon: ['teilnahmefrist_ende'],
        rechenweg:
          `${eff.bewerberfragenVorTeilnahmeKT} Kalendertage vor Ablauf der Teilnahmefrist (${fmtDE(teilnahmeEnde.datum)}) → ${fmtDE(bwRechnerisch)}` +
          (bwDatum !== bwRechnerisch ? `; kein Arbeitstag → vorheriger Arbeitstag ${fmtDE(bwDatum)}` : '') +
          ' (Praxiswert)',
        warnungen: [],
      });
    }

    // Frühestmöglicher fester Aufforderungstermin = Ablauf der Teilnahmefrist
    // (min-Attribut der UI; gleichtägiger Versand zulässig) — Kern 1.7.0
    fruehesteStarts.angebotsaufforderung = teilnahmeEnde.datum;
    const aufforderungsWunsch = input.angebotsaufforderung;
    if (aufforderungsWunsch !== undefined && istGueltigesISODate(aufforderungsWunsch)) {
      // Fester Termin: ersetzt die Berechnung aus teilnahmeBewertungAT;
      // zu früh ⇒ harter Startkonflikt (Muster seit Kern 1.4.0)
      if (aufforderungsWunsch < teilnahmeEnde.datum) {
        konflikte.push({
          option: 'angebotsaufforderung',
          gewaehlt: aufforderungsWunsch,
          fruehestens: teilnahmeEnde.datum,
          text:
            `Der gewählte Termin der Aufforderung zur Angebotsabgabe (${fmtDE(aufforderungsWunsch)}) liegt vor dem ` +
            `Ablauf der Teilnahmefrist (${fmtDE(teilnahmeEnde.datum)}) — frühestmöglich ist der ${fmtDE(teilnahmeEnde.datum)}.`,
        });
      }
      angebotsstart = merken({
        id: 'angebotsaufforderung',
        label: 'Versand der Aufforderung zur Angebotsabgabe',
        phase: 'teilnahmewettbewerb',
        datum: aufforderungsWunsch,
        fristTyp: 'eingabe',
        abhaengigVon: ['teilnahmefrist_ende'],
        rechenweg:
          'Nutzereingabe (fester Termin) — die Bewertung der Teilnahmeanträge muss bis dahin abgeschlossen sein',
        warnungen: [],
      });
    } else {
      if (aufforderungsWunsch !== undefined) {
        warnungen.push(
          `Ungültiger Termin für die Aufforderung zur Angebotsabgabe („${String(aufforderungsWunsch)}") — ` +
            'berechnet wird das Ende der Teilnahmeantrags-Bewertung.'
        );
      }
      // Seit Kern 1.9.0: Bewertungsende und Versand der Aufforderung sind
      // getrennte Meilensteine; der Versand liegt standardmäßig 1 AT nach
      // dem Bewertungsende.
      const bew = atTermin(teilnahmeEnde.datum, intern.teilnahmeBewertungAT);
      const bewertungTeilnahme = merken({
        id: 'teilnahme_bewertung_ende',
        label: 'Bewertung der Teilnahmeanträge abgeschlossen',
        phase: 'teilnahmewettbewerb',
        datum: bew.datum,
        fristTyp: 'intern',
        abhaengigVon: ['teilnahmefrist_ende'],
        rechenweg: `${bew.rechenweg} (interne Bearbeitungszeit)`,
        warnungen: [],
      });
      const auff = versandTermin(bewertungTeilnahme.datum, intern.aufforderungVersandAT, 'dem Ende der Bewertung der Teilnahmeanträge');
      angebotsstart = merken({
        id: 'angebotsaufforderung',
        label: 'Versand der Aufforderung zur Angebotsabgabe',
        phase: 'teilnahmewettbewerb',
        datum: auff.datum,
        fristTyp: 'intern',
        abhaengigVon: ['teilnahme_bewertung_ende'],
        rechenweg: auff.rechenweg,
        warnungen: [],
      });
    }
  } else if (input.angebotsaufforderung !== undefined) {
    warnungen.push(
      'Ein fester Termin für die Aufforderung zur Angebotsabgabe ist nur bei Verfahren mit vorgeschaltetem ' +
        'Teilnahmewettbewerb möglich — er wird ignoriert.'
    );
  }

  // --- Angebotsfrist ---------------------------------------------------------

  // 0 KT = Runde bewusst entfernt
  const hatRunden = (eff.optimiertesAngebotKT ?? 0) > 0 || (eff.finalesAngebotKT ?? 0) > 0;

  const a = ktTermin(angebotsstart.datum, eff.angebotsfristKT);
  const aWarn: string[] = [...abgabetagHinweis(a.datum)];
  const minA = mindestAngebotsfristKT(vergabeordnung, input.verfahrensart, optionen);
  const ap = profil.angebotsfrist;
  if (minA !== undefined && eff.angebotsfristKT < minA) {
    // Praxis-Profile mit gesetzlicher Untergrenze (SektVO) tragen die Norm in
    // normMindest; gesetzliche Profile in norm/normDringlichkeit
    const norm =
      ap.typ === 'gesetzlich'
        ? (optionen.dringlichkeit && ap.normDringlichkeit ? ap.normDringlichkeit : ap.norm)
        : ap.normMindest;
    let text: string;
    if (ap.einvernehmenMinKT === 0) {
      // SektVO-Muster (§ 15 Abs. 3): die Mindestfrist gilt nur OHNE
      // einvernehmliche Festlegung; mit Einvernehmen nennt die Norm keine
      // Untergrenze — ein Satz ohne inneren Widerspruch
      text =
        `Angebotsfrist von ${eff.angebotsfristKT} KT unterschreitet die ohne einvernehmliche Festlegung geltende ` +
        `Mindestfrist von ${minA} KT (${norm}) — kürzer nur im gegenseitigen Einvernehmen mit allen Bewerbern` +
        (ap.einvernehmenZusatz ? ` (${ap.einvernehmenZusatz})` : '') +
        '.';
    } else {
      text = `Angebotsfrist von ${eff.angebotsfristKT} KT unterschreitet die gesetzliche Mindestfrist von ${minA} KT (${norm}).`;
      if (
        !optionen.dringlichkeit &&
        ap.einvernehmenMinKT !== undefined &&
        eff.angebotsfristKT >= ap.einvernehmenMinKT
      ) {
        const details = [ap.normEinvernehmen, `Untergrenze ${ap.einvernehmenMinKT} KT`, ap.einvernehmenZusatz]
          .filter(Boolean)
          .join('; ');
        text += ` Zulässig nur bei einvernehmlicher Festlegung mit allen Bewerbern (${details}).`;
      }
    }
    aWarn.push(text);
  }
  const angebotsabgabe = merken({
    id: 'angebotsabgabe',
    label: hatRunden
      ? `Ablauf der Erstangebotsfrist (Abgabe der Erstangebote${uhrzeitZusatz})`
      : `Ablauf der Angebotsfrist (Angebotsabgabe${uhrzeitZusatz})`,
    phase: 'einholung',
    datum: a.datum,
    fristTyp: ap.typ,
    abhaengigVon: [angebotsstart.id],
    rechtsgrundlage: ap.typ === 'gesetzlich'
      ? (optionen.dringlichkeit && ap.normDringlichkeit ? ap.normDringlichkeit : ap.norm)
      : undefined,
    rechenweg:
      ap.typ === 'praxis'
        ? `${a.rechenweg} (Praxiswert${
            ap.mindestKT !== undefined
              ? ap.einvernehmenMinKT === 0
                // SektVO-Muster: das Minimum gilt nur ohne einvernehmliche
                // Festlegung — nicht auf feste Untergrenzen wie § 10 Abs. 1
                // VOB/A übertragen
                ? `; ohne einvernehmliche Festlegung mindestens ${ap.mindestKT} KT, ${ap.normMindest}`
                : `; gesetzliches Minimum ${ap.mindestKT} KT, ${ap.normMindest}`
              : ', keine gesetzliche Mindestfrist'
          })`
        : a.rechenweg,
    warnungen: aWarn,
  });

  // --- Bieterfragen & letzte Klarstellung (rückwärts von der Angebotsfrist) --

  const bfRechnerisch = addTage(angebotsabgabe.datum, -eff.bieterfragenVorAngebotKT);
  const bfDatum = aufVorherigenArbeitstag(bfRechnerisch, land);
  merken({
    id: 'bieterfragen_ende',
    label: 'Ende der Frist für Bieterfragen',
    phase: 'einholung',
    datum: bfDatum,
    fristTyp: 'praxis',
    abhaengigVon: ['angebotsabgabe'],
    rechenweg:
      `${eff.bieterfragenVorAngebotKT} Kalendertage vor Ablauf der Angebotsfrist (${fmtDE(angebotsabgabe.datum)}) → ${fmtDE(bfRechnerisch)}` +
      (bfDatum !== bfRechnerisch ? `; kein Arbeitstag → vorheriger Arbeitstag ${fmtDE(bfDatum)}` : '') +
      ' (Praxiswert)',
    warnungen: [],
  });

  const ksRechnerisch = addTage(angebotsabgabe.datum, -eff.klarstellungVorAngebotKT);
  const ksDatum = aufVorherigenArbeitstag(ksRechnerisch, land);
  const ksWarn: string[] = [];
  // Das verkürzte Minimum (4 KT) gilt nur in den gesetzlich beschleunigten
  // Verfahren — also wenn die Verfahrensart eine gesetzliche
  // Dringlichkeits-Angebotsfrist kennt; nicht z. B. beim
  // Verhandlungsverfahren ohne TNW.
  // Ein verfahrensspezifisches Profil-Override ersetzt die generische Regel —
  // VSVgV: § 20 Abs. 5 gibt dem nicht offenen Verfahren stets 6 KT, dem
  // beschleunigten Verhandlungsverfahren 4 KT. Ohne `klarstellung` der
  // Vergabeordnung gibt es kein gesetzliches Minimum (Unterschwelle, seit
  // Kern 1.6.0).
  const ks = voProfil.klarstellung;
  const ksMin =
    profil.klarstellung !== undefined
      ? (optionen.dringlichkeit && profil.klarstellung.mindestDringlichKT !== undefined
          ? profil.klarstellung.mindestDringlichKT
          : profil.klarstellung.mindestKT)
      : ks === undefined
        ? undefined
        : optionen.dringlichkeit &&
            ap.typ === 'gesetzlich' &&
            ap.dringlichkeitKT !== undefined &&
            ks.mindestDringlichKT !== undefined
          ? ks.mindestDringlichKT
          : ks.mindestKT;
  if (ksMin !== undefined && ks !== undefined && eff.klarstellungVorAngebotKT < ksMin) {
    ksWarn.push(
      `Letzte Auskünfte nur ${eff.klarstellungVorAngebotKT} KT vor Ablauf der Angebotsfrist — ` +
        `${ks.norm} verlangt spätestens ${ksMin} KT; andernfalls ist die Angebotsfrist zu verlängern.`
    );
  }
  merken({
    id: 'klarstellung_versand',
    label: 'Versand der letzten Auskünfte/Klarstellungen',
    phase: 'einholung',
    datum: ksDatum,
    fristTyp: 'praxis',
    abhaengigVon: ['angebotsabgabe'],
    rechenweg:
      `${eff.klarstellungVorAngebotKT} Kalendertage vor Ablauf der Angebotsfrist → ${fmtDE(ksRechnerisch)}` +
      (ksDatum !== ksRechnerisch ? `; kein Arbeitstag → vorheriger Arbeitstag ${fmtDE(ksDatum)}` : '') +
      (ksMin !== undefined && ks !== undefined
        ? ` (Praxiswert; gesetzliches Minimum ${ksMin} KT, ${ks.norm})`
        : ' (Praxiswert; kein gesetzliches Minimum)'),
    warnungen: ksWarn,
  });

  // --- Bieterpräsentation & Bieterverhandlungen (optional; als Termin MIT
  // Dauer erkennbar) ----------------------------------------------------------

  /**
   * Zeitraum-Termin: Start-Meilenstein trägt `bis`/`dauerAT`, dazu ein
   * Ende-Meilenstein. Dauer in WORKDAY-Semantik (Starttag zählt mit, wie
   * Teststellung). Liefert den Ende-Meilenstein oder undefined.
   */
  function zeitraumTermin(args: {
    idPrefix: 'praesentation' | 'verhandlung1' | 'verhandlung2';
    /** Formularfeld-Zuordnung für Startkonflikte/min-Attribute (Kern 1.4.0). */
    optionKey: 'praesentation' | 'verhandlungRunde1' | 'verhandlungRunde2';
    phase: Meilenstein['phase'];
    labelStart: string;
    labelEnde: string;
    opt: TerminMitDauer | undefined;
    anker: Meilenstein;
    ankerText: string;
    startWarnungen?: string[];
  }): Meilenstein | undefined {
    const opt = args.opt;
    if (!opt || opt.aktiv !== true) return undefined;
    // Frühestmöglicher fester Start = Datum des Ankers (gleichtägiger Start
    // war schon immer zulässig) — für min-Attribute der Datumsfelder
    fruehesteStarts[args.optionKey] = args.anker.datum;
    const dauer = ganz(opt.dauerAT, 0, `Dauer „${args.labelStart}"`);
    let startDatum: string;
    let startRechenweg: string;
    let startTyp: Meilenstein['fristTyp'] = 'intern';
    const startWarn = [...(args.startWarnungen ?? [])];
    if (opt.start !== undefined && istGueltigesISODate(opt.start)) {
      startDatum = opt.start;
      startRechenweg = 'Nutzereingabe (fester Starttermin)';
      startTyp = 'eingabe';
      if (opt.start < args.anker.datum) {
        // Harter Eingabekonflikt statt Warnung (Kern 1.4.0): die UI zeigt
        // dann keinen Terminplan an
        konflikte.push({
          option: args.optionKey,
          gewaehlt: opt.start,
          fruehestens: args.anker.datum,
          text: `Der gewählte Starttermin „${args.labelStart}" (${fmtDE(opt.start)}) liegt vor ${args.ankerText} (${fmtDE(args.anker.datum)}) — frühestmöglich ist der ${fmtDE(args.anker.datum)}.`,
        });
      }
    } else {
      if (opt.start !== undefined) {
        warnungen.push(
          `Ungültiger Starttermin („${String(opt.start)}") für „${args.labelStart}" — berechnet wird der nächste Arbeitstag nach ${args.ankerText}.`
        );
      }
      const s = atTermin(args.anker.datum, 1);
      startDatum = s.datum;
      startRechenweg = `${s.rechenweg} (nächster Arbeitstag nach ${args.ankerText})`;
    }
    const endeDatum = dauer > 0 ? addArbeitstage(startDatum, dauer - 1, land) : startDatum;
    merken({
      id: `${args.idPrefix}_start`,
      label: args.labelStart,
      phase: args.phase,
      datum: startDatum,
      fristTyp: startTyp,
      abhaengigVon: [args.anker.id],
      rechenweg: startRechenweg,
      warnungen: startWarn,
      bis: endeDatum,
      dauerAT: dauer,
    });
    return merken({
      id: `${args.idPrefix}_ende`,
      label: args.labelEnde,
      phase: args.phase,
      datum: endeDatum,
      fristTyp: 'intern',
      abhaengigVon: [`${args.idPrefix}_start`],
      rechenweg: `Dauer ${dauer} Arbeitstage (Starttag zählt mit) → ${fmtDE(endeDatum)}`,
      warnungen: dauer === 0 ? [`Dauer „${args.labelStart}" ist 0 Arbeitstage.`] : [],
    });
  }

  // Verhandlungsverbots-Hinweis je Vergabeordnung/Verfahrensart aus dem
  // Profil (seit Kern 1.5.0 — zuvor fest kodierte VgV-Normzitate)
  const verbotsWarnung: string[] = profil.verhandlungsverbot ? [profil.verhandlungsverbot] : [];

  const v1 = optionen.verhandlungRunde1;
  const v2 = optionen.verhandlungRunde2;
  const hatOptimiert = (eff.optimiertesAngebotKT ?? 0) > 0;
  const hatFinal = (eff.finalesAngebotKT ?? 0) > 0;
  // Maximal 2 Runden; jede Runde braucht eine nachfolgende Angebotsrunde.
  // Runde 1 genügt EINE weitere Angebotsrunde — „optimierte Angebote" oder
  // (Eingabeweise „optimiert leer, final 10") direkt „finale Angebote".
  // Runde 2 setzt eine aktive Runde 1 und BEIDE Angebotsrunden voraus.
  const hatV1 = v1?.aktiv === true && (hatOptimiert || hatFinal);
  const hatV2 = v2?.aktiv === true && hatV1 && hatOptimiert && hatFinal;
  if (v1?.aktiv === true && !hatOptimiert && !hatFinal) {
    warnungen.push(
      'Verhandlungsrunde 1 ist geplant, aber es ist weder eine Frist für die optimierten noch für die finalen Angebote gesetzt — die Runde wird nicht eingeplant (Frist „optimierte Angebote" oder „finale Angebote" ergänzen).'
    );
  }
  if (v2?.aktiv === true && !hatV1) {
    warnungen.push(
      'Verhandlungsrunde 2 setzt eine aktive Verhandlungsrunde 1 voraus — die Runde wird nicht eingeplant.'
    );
  } else if (v2?.aktiv === true && !(hatOptimiert && hatFinal)) {
    warnungen.push(
      'Verhandlungsrunde 2 setzt beide Angebotsrunden voraus (Fristen „optimierte Angebote" UND „finale Angebote") — die Runde wird nicht eingeplant.'
    );
  }
  // Verbotshinweis auch dann, wenn die Runden mangels Fristen NICHT eingeplant
  // werden (sonst trägt ihn der Runde-1-Start-Meilenstein).
  if ((v1?.aktiv === true || v2?.aktiv === true) && !hatV1 && verbotsWarnung.length > 0) {
    warnungen.push(...verbotsWarnung);
  }

  // --- Verhandlungsphase (nur bei Angebotsrunden): Bewertung der Erstangebote
  // → Präsentation → Einladung → Runde 1 → Anpassung der Vergabeunterlagen →
  // Aufforderung → optimierte Angebote → Bewertung → Einladung → Runde 2 →
  // Anpassung → Aufforderung → finale Angebote. Die Angebotsfristen laufen seit
  // Kern 1.9.0 ab dem Versand der Aufforderung (bis 1.8.0 ab dem Ende der
  // Verhandlungsrunde). --------------------------------------------------------

  let letzteAbgabe = angebotsabgabe;

  /**
   * Einladung zur Bieterverhandlung n AT nach dem Bezugstermin (Bewertungsende
   * bzw. Präsentationsende) — seit Kern 1.9.0.
   */
  function einladung(idPrefix: 'verhandlung1' | 'verhandlung2', runde: 1 | 2, anker: Meilenstein, ankerText: string): Meilenstein {
    const e = versandTermin(anker.datum, intern.einladungVersandAT, ankerText);
    return merken({
      id: `${idPrefix}_einladung`,
      label: `Versand der Einladung zur Bieterverhandlung (Runde ${runde})`,
      phase: 'verhandlung',
      datum: e.datum,
      fristTyp: 'intern',
      abhaengigVon: [anker.id],
      rechenweg: e.rechenweg,
      warnungen: [],
    });
  }

  /**
   * Weitere Angebotsrunde (optimiert/final), seit Kern 1.9.0: Anker (Ende
   * der Verhandlungsrunde bzw. Bewertungsende) → Anpassung der
   * Vergabeunterlagen → Versand der Aufforderung → Frist ab dem Versand.
   * Liefert den Abgabe-Meilenstein.
   */
  function angebotsrunde(args: {
    idPrefix: 'optimiertes_angebot' | 'finales_angebot';
    /** Genitiv-Plural für die Labels, z. B. „optimierten Angebote". */
    angebote: string;
    anker: Meilenstein;
    ankerText: string;
    vuAnpassungAT: number;
    fristKT: number;
    /** Zusatz im Rechenweg (z. B. Hinweis auf die Benennung bei einer einzigen weiteren Runde). */
    hinweis?: string;
  }): Meilenstein {
    let vorbereitung = args.anker;
    let vorbereitungText = args.ankerText;
    if (args.vuAnpassungAT > 0) {
      const vu = atTermin(args.anker.datum, args.vuAnpassungAT);
      vorbereitung = merken({
        id: `${args.idPrefix}_vorbereitung_ende`,
        label: `Anpassung der Vergabeunterlagen für die ${args.angebote} abgeschlossen`,
        phase: 'verhandlung',
        datum: vu.datum,
        fristTyp: 'intern',
        abhaengigVon: [args.anker.id],
        rechenweg: `${vu.rechenweg} (interne Bearbeitungszeit nach ${args.ankerText})`,
        warnungen: [],
      });
      vorbereitungText = 'dem Ende der Anpassung der Vergabeunterlagen';
    }
    const auff = versandTermin(vorbereitung.datum, intern.aufforderungVersandAT, vorbereitungText);
    const aufforderung = merken({
      id: `${args.idPrefix}_aufforderung`,
      label: `Versand der Aufforderung zur Abgabe der ${args.angebote}`,
      phase: 'verhandlung',
      datum: auff.datum,
      fristTyp: 'intern',
      abhaengigVon: [vorbereitung.id],
      rechenweg: auff.rechenweg,
      warnungen: [],
    });
    const o = ktTermin(aufforderung.datum, args.fristKT);
    return merken({
      id: args.idPrefix,
      label: `Abgabe der ${args.angebote}${abgabeUhrzeit !== undefined ? ` (bis ${abgabeUhrzeit} Uhr)` : ''}`,
      phase: 'verhandlung',
      datum: o.datum,
      fristTyp: 'praxis',
      abhaengigVon: [aufforderung.id],
      rechenweg: `${o.rechenweg} (Praxiswert; läuft ab dem Versand der Aufforderung${args.hinweis ? `; ${args.hinweis}` : ''})`,
      warnungen: abgabetagHinweis(o.datum),
    });
  }

  if (hatRunden) {
    // Benennung: Gibt es nach Runde 1 keine weitere Runde, sind die
    // Angebote nach Runde 1 die finalen Angebote — Eingabefeld/ID bleiben
    // „optimiertes Angebot", das Label sagt „finale Angebote".
    const einzigeRunde = hatOptimiert && !hatFinal;
    // Ohne festen Verhandlungstermin terminiert der Kern Einladung → nächster
    // Arbeitstag → Runde (Startkonflikt-/min-Mechanik der Zeitraum-Termine,
    // Kern 1.4.0).

    // Bewertung der Erstangebote — Voraussetzung jeder weiteren Angebotsrunde
    // (bis Kern 1.8.0 nur bei Präsentation/Verhandlung erzeugt).
    const zb = atTermin(angebotsabgabe.datum, intern.zwischenbewertungAT);
    let anker: Meilenstein = merken({
      id: 'zwischenbewertung_erstangebote',
      label: 'Bewertung der Erstangebote abgeschlossen',
      phase: 'verhandlung',
      datum: zb.datum,
      fristTyp: 'intern',
      abhaengigVon: [angebotsabgabe.id],
      rechenweg: `${zb.rechenweg} (interne Bearbeitungszeit; Voraussetzung für Präsentation, Verhandlung und die nächste Angebotsrunde)`,
      warnungen: [],
    });
    let ankerText = 'der Bewertung der Erstangebote';
    const praesEnde = zeitraumTermin({
      idPrefix: 'praesentation',
      phase: 'verhandlung',
      optionKey: 'praesentation',
      labelStart: 'Beginn der Bieterpräsentationen',
      labelEnde: 'Ende der Bieterpräsentationen',
      opt: optionen.praesentation,
      anker,
      ankerText,
    });
    if (praesEnde !== undefined) {
      anker = praesEnde;
      ankerText = 'dem Ende der Bieterpräsentationen';
    }
    let v1Ende: Meilenstein | undefined;
    if (hatV1) {
      const einladung1 = einladung('verhandlung1', 1, anker, ankerText);
      v1Ende = zeitraumTermin({
        idPrefix: 'verhandlung1',
        optionKey: 'verhandlungRunde1',
        phase: 'verhandlung',
        labelStart: 'Beginn der Bieterverhandlungen (Runde 1)',
        labelEnde: 'Ende der Bieterverhandlungen (Runde 1)',
        opt: v1,
        anker: einladung1,
        ankerText: 'dem Versand der Einladung zur Bieterverhandlung (Runde 1)',
        startWarnungen: verbotsWarnung,
      });
    }

    if (eff.optimiertesAngebotKT !== undefined && eff.optimiertesAngebotKT > 0) {
      letzteAbgabe = angebotsrunde({
        idPrefix: 'optimiertes_angebot',
        angebote: einzigeRunde ? 'finalen Angebote' : 'optimierten Angebote',
        anker: v1Ende ?? anker,
        ankerText: v1Ende !== undefined ? 'dem Ende der Verhandlungsrunde 1' : ankerText,
        vuAnpassungAT: intern.vuAnpassungRunde1AT,
        fristKT: eff.optimiertesAngebotKT,
        hinweis: einzigeRunde
          ? 'einzige weitere Angebotsrunde — Eingabe über das Feld „optimierte Angebote"'
          : undefined,
      });
    }

    if (eff.finalesAngebotKT !== undefined && eff.finalesAngebotKT > 0) {
      let anker2: Meilenstein;
      let anker2Text: string;
      const nachOptimierten = letzteAbgabe.id === 'optimiertes_angebot';
      if (nachOptimierten) {
        const zb2 = atTermin(letzteAbgabe.datum, intern.zwischenbewertungAT);
        anker2 = merken({
          id: 'zwischenbewertung_optimierte',
          label: 'Bewertung der optimierten Angebote abgeschlossen',
          phase: 'verhandlung',
          datum: zb2.datum,
          fristTyp: 'intern',
          abhaengigVon: [letzteAbgabe.id],
          rechenweg: `${zb2.rechenweg} (interne Bearbeitungszeit; Voraussetzung für Verhandlungsrunde 2 bzw. die finale Angebotsrunde)`,
          warnungen: [],
        });
        anker2Text = 'der Bewertung der optimierten Angebote';
      } else {
        // Finale Angebote als einzige weitere Runde (Eingabe „optimiert leer,
        // final n"): nach Verhandlungsrunde 1, sonst nach der Bewertung der
        // Erstangebote bzw. der Präsentation
        anker2 = v1Ende ?? anker;
        anker2Text = v1Ende !== undefined ? 'dem Ende der Verhandlungsrunde 1' : ankerText;
      }
      if (hatV2) {
        const einladung2 = einladung('verhandlung2', 2, anker2, anker2Text);
        const v2Ende = zeitraumTermin({
          idPrefix: 'verhandlung2',
          optionKey: 'verhandlungRunde2',
          phase: 'verhandlung',
          labelStart: 'Beginn der Bieterverhandlungen (Runde 2)',
          labelEnde: 'Ende der Bieterverhandlungen (Runde 2)',
          opt: v2,
          anker: einladung2,
          ankerText: 'dem Versand der Einladung zur Bieterverhandlung (Runde 2)',
          startWarnungen: verbotsWarnung,
        });
        if (v2Ende !== undefined) {
          anker2 = v2Ende;
          anker2Text = 'dem Ende der Verhandlungsrunde 2';
        }
      }
      letzteAbgabe = angebotsrunde({
        idPrefix: 'finales_angebot',
        angebote: 'finalen Angebote',
        anker: anker2,
        ankerText: anker2Text,
        // Anpassung vor der zweiten weiteren Angebotsrunde (nach optimierten
        // Angeboten) — auch ohne Verhandlungsrunde 2; ohne optimierte Runde
        // ist es die Anpassung vor der ersten weiteren Runde
        vuAnpassungAT: nachOptimierten ? intern.vuAnpassungRunde2AT : intern.vuAnpassungRunde1AT,
        fristKT: eff.finalesAngebotKT,
      });
    }
  }

  // --- Bewertung & Teststellung ---------------------------------------------
  // Ohne Verhandlungsrunden dient die Bieterpräsentation der Verifikation der
  // Angebotsbewertung: Vorbewertung → Präsentation → Bewertung abgeschlossen.

  let bewertungEnde: Meilenstein;
  let nichtRundenPraesEnde: Meilenstein | undefined;
  if (!hatRunden && optionen.praesentation?.aktiv === true) {
    const vb = atTermin(letzteAbgabe.datum, intern.zwischenbewertungAT);
    const vorbewertung = merken({
      id: 'vorbewertung_ende',
      label: 'Vorbewertung der Angebote abgeschlossen',
      phase: 'bewertung',
      datum: vb.datum,
      fristTyp: 'intern',
      abhaengigVon: [letzteAbgabe.id],
      rechenweg: `${vb.rechenweg} (interne Bearbeitungszeit; Grundlage der Bieterpräsentation)`,
      warnungen: [],
    });
    nichtRundenPraesEnde = zeitraumTermin({
      idPrefix: 'praesentation',
      optionKey: 'praesentation',
      phase: 'bewertung',
      labelStart: 'Beginn der Bieterpräsentationen',
      labelEnde: 'Ende der Bieterpräsentationen',
      opt: optionen.praesentation,
      anker: vorbewertung,
      ankerText: 'der Vorbewertung der Angebote',
    });
  }
  if (nichtRundenPraesEnde !== undefined) {
    const fin = atTermin(nichtRundenPraesEnde.datum, 1);
    bewertungEnde = merken({
      id: 'bewertung_ende',
      label: 'Bewertung der Angebote abgeschlossen',
      phase: 'bewertung',
      datum: fin.datum,
      fristTyp: 'intern',
      abhaengigVon: ['praesentation_ende'],
      rechenweg: `${fin.rechenweg} (Finalisierung der Bewertung nach der Bieterpräsentation)`,
      warnungen: [],
    });
  } else {
    const bew = atTermin(letzteAbgabe.datum, intern.bewertungAT);
    bewertungEnde = merken({
      id: 'bewertung_ende',
      label: 'Bewertung der Angebote abgeschlossen',
      phase: 'bewertung',
      datum: bew.datum,
      fristTyp: 'intern',
      abhaengigVon: [letzteAbgabe.id],
      rechenweg: `${bew.rechenweg} (interne Bearbeitungszeit)`,
      warnungen: [],
    });
  }

  let zuschlagsBasis = bewertungEnde;
  if (optionen.teststellung?.aktiv) {
    const dauer = ganz(optionen.teststellung.dauerAT, 0, 'Dauer der Teststellung');
    // Versand n AT nach dem Bewertungsende (Kern 1.9.0: gemeinsamer Default
    // `aufforderungVersandAT`; zuvor fest 1 AT)
    const auff = versandTermin(bewertungEnde.datum, intern.aufforderungVersandAT, 'dem Ende der Angebotsbewertung');
    const aufforderung = merken({
      id: 'teststellung_aufforderung',
      label: 'Aufforderung zur Teststellung',
      phase: 'teststellung',
      datum: auff.datum,
      fristTyp: 'intern',
      abhaengigVon: ['bewertung_ende'],
      rechenweg: auff.rechenweg,
      warnungen: [],
    });

    let startDatum: string;
    let startRechenweg: string;
    let startTyp: Meilenstein['fristTyp'] = 'intern';
    const startWarn: string[] = [];
    const wunsch = optionen.teststellung.start;
    // Frühestmöglicher fester Start für min-Attribut/Konfliktprüfung (1.4.0)
    fruehesteStarts.teststellung = aufforderung.datum;
    if (wunsch !== undefined && istGueltigesISODate(wunsch)) {
      startDatum = wunsch;
      startRechenweg = 'Nutzereingabe (fester Starttermin)';
      startTyp = 'eingabe';
      if (wunsch < aufforderung.datum) {
        // Harter Eingabekonflikt statt Warnung (Kern 1.4.0)
        konflikte.push({
          option: 'teststellung',
          gewaehlt: wunsch,
          fruehestens: aufforderung.datum,
          text: `Der gewählte Starttermin der Teststellung (${fmtDE(wunsch)}) liegt vor der Aufforderung zur Teststellung (${fmtDE(aufforderung.datum)}) — frühestmöglich ist der ${fmtDE(aufforderung.datum)}.`,
        });
      }
    } else {
      if (wunsch !== undefined) {
        warnungen.push(`Ungültiger Starttermin der Teststellung („${String(wunsch)}") — berechnet wird der nächste Arbeitstag nach der Aufforderung.`);
      }
      const s = atTermin(aufforderung.datum, 1);
      startDatum = s.datum;
      startRechenweg = `${s.rechenweg} (nächster Arbeitstag nach der Aufforderung)`;
    }
    const endeDatum = dauer > 0 ? addArbeitstage(startDatum, dauer - 1, land) : startDatum;
    merken({
      id: 'teststellung_start',
      label: 'Beginn der Teststellung',
      phase: 'teststellung',
      datum: startDatum,
      fristTyp: startTyp,
      abhaengigVon: ['teststellung_aufforderung'],
      rechenweg: startRechenweg,
      warnungen: startWarn,
      bis: endeDatum,
      dauerAT: dauer,
    });

    const ende = merken({
      id: 'teststellung_ende',
      label: 'Ende der Teststellung',
      phase: 'teststellung',
      datum: endeDatum,
      fristTyp: 'intern',
      abhaengigVon: ['teststellung_start'],
      rechenweg: `Dauer ${dauer} Arbeitstage (Starttag zählt mit) → ${fmtDE(endeDatum)}`,
      warnungen: dauer === 0 ? ['Dauer der Teststellung ist 0 Arbeitstage.'] : [],
    });

    const ausw = atTermin(ende.datum, intern.teststellungAuswertungAT);
    zuschlagsBasis = merken({
      id: 'teststellung_auswertung',
      label: 'Auswertung der Teststellung abgeschlossen',
      phase: 'teststellung',
      datum: ausw.datum,
      fristTyp: 'intern',
      abhaengigVon: ['teststellung_ende'],
      rechenweg: `${ausw.rechenweg} (interne Bearbeitungszeit)`,
      warnungen: [],
    });
  }

  // --- Zuschlag: Empfehlung → intern → § 134-Information → Wartefrist --------

  const empf = atTermin(zuschlagsBasis.datum, intern.aufklaerungEntscheidungAT);
  const empfehlung = merken({
    id: 'zuschlagsempfehlung',
    label: 'Aufklärung/Entscheidungsfindung abgeschlossen (Zuschlagsempfehlung)',
    // Phase „Bewertung" statt „Zuschlag": die Entscheidungsfindung gehört
    // inhaltlich zur Bewertung; die Zuschlagsphase beginnt mit der internen
    // Zuschlagsentscheidung.
    phase: 'bewertung',
    datum: empf.datum,
    fristTyp: 'intern',
    abhaengigVon: [zuschlagsBasis.id],
    rechenweg: `${empf.rechenweg} (interne Bearbeitungszeit)`,
    warnungen: [],
  });

  const intZ = atTermin(empfehlung.datum, intern.internerZuschlagAT);
  const internerZuschlag = merken({
    id: 'interner_zuschlag',
    label: 'Interne Zuschlagsentscheidung',
    phase: 'zuschlag',
    datum: intZ.datum,
    fristTyp: 'intern',
    abhaengigVon: ['zuschlagsempfehlung'],
    rechenweg: `${intZ.rechenweg} (interne Bearbeitungszeit)`,
    warnungen: [],
  });

  let zuschlag: Meilenstein;
  if (voProfil.wartepflicht && eff.wartefristKT !== undefined) {
    const info =
      intern.infoVersandAT > 0
        ? atTermin(internerZuschlag.datum, intern.infoVersandAT)
        : {
            datum: internerZuschlag.datum,
            rechenweg: `am Tag der internen Zuschlagsentscheidung (${fmtDE(internerZuschlag.datum)})`,
          };
    const bieterinformation = merken({
      id: 'bieterinformation',
      label: 'Versand der Information an die nicht berücksichtigten Bieter (§ 134 Abs. 1 GWB)',
      phase: 'zuschlag',
      datum: info.datum,
      fristTyp: 'intern',
      abhaengigVon: ['interner_zuschlag'],
      rechenweg:
        `${info.rechenweg}${intern.infoVersandAT > 0 ? ' (interne Bearbeitungszeit)' : ''} — ` +
        'Versand in Textform an alle betroffenen Bieter/Bewerber (§ 134 Abs. 1 GWB)',
      warnungen: [],
    });

    const wartefristNorm = WERTE.wartefrist[optionen.versandBieterinformation === 'postalisch' ? 'postalisch' : 'elektronisch'];
    const wfWarn: string[] = [];
    if (eff.wartefristKT < wartefristNorm.wert) {
      wfWarn.push(
        `Wartefrist von ${eff.wartefristKT} KT unterschreitet die gesetzliche Frist von ${wartefristNorm.wert} KT (${wartefristNorm.norm}).`
      );
    }
    // Vorsorgliche Auslegung: Fällt das Wartefrist-Ende auf Sa/So/Feiertag, wird
    // es entsprechend Art. 3 Abs. 4 VO 1182/71 auf den nächsten Arbeitstag
    // verlängert (§ 82 VgV selbst gilt nur für VgV-Fristen). Ob die
    // Verlängerung geboten ist, wird unterschiedlich beurteilt. Der Rechner
    // wählt den späteren Termin.
    const wfRechnerisch = addTage(bieterinformation.datum, eff.wartefristKT);
    const wfEnde = aufArbeitstagVerschieben(wfRechnerisch, land);
    const wartefristEnde = merken({
      id: 'wartefrist_ende',
      label: 'Ablauf der Wartefrist (§ 134 Abs. 2 GWB)',
      phase: 'zuschlag',
      datum: wfEnde,
      fristTyp: 'gesetzlich',
      abhaengigVon: ['bieterinformation'],
      rechtsgrundlage: wartefristNorm.norm,
      rechenweg:
        `${eff.wartefristKT} Kalendertage; die Frist beginnt am Tag nach der Absendung (§ 134 Abs. 2 Satz 3 GWB) → ${fmtDE(wfRechnerisch)}` +
        (wfEnde !== wfRechnerisch
          ? `; Sa/So/Feiertag → vorsorglich auf den nächsten Arbeitstag ${fmtDE(wfEnde)} verlängert ` +
            '(entsprechend Art. 3 Abs. 4 VO (EWG) 1182/71)'
          : '. Stillhaltefrist (§ 134 Abs. 2 GWB)'),
      warnungen: wfWarn,
    });

    const zuschlagRechnerisch = addTage(wartefristEnde.datum, 1);
    const zuschlagDatum = aufArbeitstagVerschieben(zuschlagRechnerisch, land);
    zuschlag = merken({
      id: 'zuschlag',
      label: 'Frühestmöglicher Zuschlag (Vertragsschluss)',
      phase: 'zuschlag',
      datum: zuschlagDatum,
      fristTyp: 'gesetzlich',
      abhaengigVon: ['wartefrist_ende'],
      rechtsgrundlage: '§ 134 Abs. 2 GWB',
      rechenweg:
        `Frühestens am Tag nach Ablauf der Wartefrist (${fmtDE(zuschlagRechnerisch)})` +
        (zuschlagDatum !== zuschlagRechnerisch ? `; auf den nächsten Arbeitstag gelegt → ${fmtDE(zuschlagDatum)}` : ''),
      warnungen: [],
    });
  } else {
    // Unterschwellenbereich (seit Kern 1.6.0): keine Informations- und
    // Wartepflicht nach § 134 GWB — der Zuschlag ist am Tag der internen
    // Zuschlagsentscheidung möglich. Landesvergabegesetze können abweichende
    // Informations-/Wartepflichten vorsehen (Hinweis im Profil).
    zuschlag = merken({
      id: 'zuschlag',
      label: 'Frühestmöglicher Zuschlag (Vertragsschluss)',
      phase: 'zuschlag',
      datum: internerZuschlag.datum,
      fristTyp: 'praxis',
      abhaengigVon: ['interner_zuschlag'],
      rechenweg:
        'Am Tag der internen Zuschlagsentscheidung möglich — unterhalb der EU-Schwellenwerte gilt die ' +
        'Informations- und Wartepflicht des § 134 GWB nicht; landesrechtliche Informations-/Wartepflichten ' +
        'sind gesondert zu prüfen.',
      warnungen: [],
    });
  }

  // --- Bindefrist ------------------------------------------------------------

  let bindefrist: ScheduleResult['bindefrist'];
  if (f.bindefrist !== undefined && f.bindefrist !== null && typeof f.bindefrist === 'object') {
    const b = f.bindefrist;
    let datum: string | undefined;
    let rechenweg = '';
    if (typeof b.tage === 'number' && Number.isInteger(b.tage) && b.tage > 0) {
      datum = addTage(letzteAbgabe.datum, b.tage);
      rechenweg = `${b.tage} Kalendertage ab Angebotsabgabe (${fmtDE(letzteAbgabe.datum)}) → ${fmtDE(datum)}`;
      bindefrist = { termin: datum, tage: b.tage, basis: letzteAbgabe.datum };
    } else if (typeof b.termin === 'string' && istGueltigesISODate(b.termin)) {
      datum = b.termin;
      // Seit Kern 1.9.0: auch bei festem Endtermin die Dauer ausweisen
      const tage = Math.round((Date.parse(`${datum}T00:00:00Z`) - Date.parse(`${letzteAbgabe.datum}T00:00:00Z`)) / 86_400_000);
      rechenweg = `Nutzereingabe (fester Endtermin) — ${tage} Kalendertage ab Angebotsabgabe (${fmtDE(letzteAbgabe.datum)})`;
      bindefrist = { termin: datum, tage, basis: letzteAbgabe.datum };
      if (tage < 0) {
        warnungen.push(
          `Die Bindefrist (${fmtDE(datum)}) endet vor der letzten Angebotsabgabe (${fmtDE(letzteAbgabe.datum)}) — Endtermin prüfen.`
        );
      }
    } else {
      warnungen.push('Ungültige Bindefrist-Angabe — sie wird ignoriert.');
    }
    if (datum !== undefined) {
      const bWarn: string[] = [];
      if (zuschlag.datum > datum) {
        const text =
          `Der frühestmögliche Zuschlag (${fmtDE(zuschlag.datum)}) liegt nach Ablauf der Bindefrist (${fmtDE(datum)}) — ` +
          'Bindefrist verlängern oder Verfahrenszeiten straffen.';
        bWarn.push(text);
        warnungen.push(text);
      }
      merken({
        id: 'bindefrist_ende',
        label: 'Ablauf der Binde-/Zuschlagsfrist',
        phase: 'zuschlag',
        datum,
        fristTyp: 'eingabe',
        abhaengigVon: [letzteAbgabe.id],
        rechenweg,
        warnungen: bWarn,
      });
    }
  }

  // --- Globale Hinweise, Sortierung, Phasenblöcke ----------------------------

  warnungen.push(...voProfil.hinweise, ...profil.hinweise);
  if (optionen.dringlichkeit) {
    // Nur EINER der beiden Hinweise — der generische Verkürzungs-Hinweis
    // wäre bei Ordnungen ohne Dringlichkeitsfristen (UVgO, KonzVgV, SektVO
    // zweistufig, Freihändige Vergabe) widersprüchlich
    const hatDringlichkeitsfristen =
      profil.angebotsfrist.dringlichkeitKT !== undefined ||
      profil.teilnahmefrist?.dringlichkeitKT !== undefined;
    if (hatDringlichkeitsfristen) {
      warnungen.push(
        'Beschleunigtes Verfahren: Die verkürzten Fristen setzen eine hinreichend begründete Dringlichkeit voraus — Begründung im Vergabevermerk dokumentieren.'
      );
    } else {
      warnungen.push(
        `Die ${voProfil.kurz} sieht für diese Verfahrensart keine gesonderten Dringlichkeitsfristen vor — die Fristwerte bleiben unverändert.`
      );
    }
  }

  meilensteine.sort((x, y) => x.datum.localeCompare(y.datum));

  // Chronologische Segmentierung: neuer Block bei jedem Phasenwechsel — eine
  // Phase kann mehrfach erscheinen (z. B. Bewertung → Teststellung → Bewertung
  // mit der Zuschlagsempfehlung). Die Blöcke sind damit per Konstruktion
  // chronologisch, ein Nachsortieren entfällt.
  const phasen: PhasenBlock[] = [];
  for (const m of meilensteine) {
    let block = phasen.length > 0 && phasen[phasen.length - 1].id === m.phase ? phasen[phasen.length - 1] : undefined;
    if (!block) {
      block = { id: m.phase, label: PHASEN_LABELS[m.phase], von: m.datum, bis: m.datum, meilensteine: [] };
      phasen.push(block);
    }
    if (m.datum < block.von) block.von = m.datum;
    if (m.datum > block.bis) block.bis = m.datum;
    block.meilensteine.push(m.id);
  }

  return {
    meilensteine,
    phasen,
    warnungen,
    konflikte,
    fruehesteStarts,
    regelversion: REGELVERSION,
    rechtsstand: RECHTSSTAND,
    rechtsstandDatum: RECHTSSTAND_DATUM,
    bindefrist,
  };
}
