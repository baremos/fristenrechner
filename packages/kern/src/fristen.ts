/**
 * Fristwerte und Verfahrensprofile des Fristenrechners.
 *
 * Jeder gesetzliche Wert trägt seine Norm und ist gegen die jeweilige
 * Vergabeordnung (VgV, VOB/A-EU, SektVO, VSVgV) und das GWB verifiziert.
 * Praxiswerte sind als solche gekennzeichnet und frei überschreibbar.
 * Bei Widersprüchen gilt: Gesetz vor externer Referenz vor Praxiswert.
 *
 * Rechtsstand VgV/GWB verifiziert 2026-07-17 gegen gesetze-im-internet.de
 * (VgV Stand Art. 9 G v. 12.5.2026, GWB Stand Art. 15 Abs. 7 G v. 3.7.2026)
 * und das Gesetz v. 12.05.2026 (BGBl. 2026 I Nr. 137, in Kraft 01.07.2026,
 * im Folgenden „Änderungsgesetz 2026"): Die Fristwerte der §§ 15–17 VgV und
 * § 134 Abs. 1–2 GWB sind unverändert. VOB/A-EU, SektVO und VSVgV
 * verifiziert 2026-07-30 gegen die Primärquellen. Zur Regelprüfung vom
 * 2026-10-22 und ihren Prüflücken siehe docs/regelpruefungen.md.
 */

import type { ISODate, Optionen, Verfahrensart, Vergabeordnung } from './api.js';

// Regelversionen:
// 1.9.1: VOB/A-EU Ausgabe 2026; Hinweis auf den ausdrücklich angegebenen
// späteren Veröffentlichungstag (§ 12 EU Abs. 3 Nr. 4 Satz 4 VOB/A).
// Rechtsstand 2026-10-22. Keine Änderung an Fristwerten, Rechenlogik oder
// Projektdatei-Schema; bei gleicher Eingabe bleiben die Termine gleich.
// 1.9.0: Meilenstein „Ende Bewerberfragen" im Teilnahmewettbewerb
// (`bewerberfragenVorTeilnahmeKT`, Default 8). Versand der Aufforderung zur
// Angebotsabgabe/Teststellung/nächsten Angebotsrunde standardmäßig 1 AT
// nach dem Bewertungs- bzw. Vorbereitungsende (`aufforderungVersandAT`,
// bisher 0 bzw. fest 1) — neuer Meilenstein `teilnahme_bewertung_ende`.
// Verhandlungsverfahren: Einladung zur Bieterverhandlung
// (`einladungVersandAT`, Default 1), Anpassung der Vergabeunterlagen vor
// jeder weiteren Angebotsrunde (`vuAnpassungRunde1AT`/`vuAnpassungRunde2AT`,
// Default 2, auch ohne Verhandlungstermin), expliziter Versand der
// Aufforderung zur nächsten Angebotsrunde, Bewertung vor jeder weiteren
// Runde; Angebote nach der einzigen weiteren Runde heißen „finale Angebote".
// Bindefrist im Ergebnis stets als Endtermin UND Dauer
// (`ScheduleResult.bindefrist`). Projektdateien aus 1.8.0 bleiben lesbar;
// ihre Terminpläne verschieben sich durch die neuen Defaults (Aufforderung
// +1 AT, VU-Anpassung +2 AT je Runde).
// 1.8.0: Optionale Abgabe-Uhrzeit (`optionen.abgabeUhrzeit`): Ist für die
// Abgabe eine Uhrzeit bestimmt (z. B. 10:00 statt Fristablauf 24:00 Uhr),
// legt der Kern jeden Abgabe-/Eingangstermin auf den nächsten Arbeitstag
// NACH dem rechnerischen Fristende, damit die volle Frist gewahrt bleibt.
// 1.7.0: Zweistufige Verfahren — optionaler FESTER Termin für den Versand
// der Aufforderung zur Angebotsabgabe (`angebotsaufforderung` im Input); zu
// frühe Termine erzeugen einen Startkonflikt (Muster 1.4.0),
// `fruehesteStarts.angebotsaufforderung` liefert das min-Attribut.
// 1.6.0: Unterschwellenbereich (UVgO, VOB/A 1. Abschnitt) + Konzessionen
// (KonzVgV). Neue Verfahrensart `beschraenkt_ohne_tnw`; Wartepflicht
// (§ 134 GWB) je Vergabeordnung schaltbar (Unterschwelle: keine Wartefrist,
// Zuschlag direkt nach der internen Entscheidung); Klarstellungs-Minimum
// optional (Unterschwelle kennt keine numerischen Auskunftsfristen).
// 1.5.0: Vergabeordnungs-Dimension (VgV, VOB/A-EU, SektVO, VSVgV);
// Verfahrensprofile je Vergabeordnung, Normzitate und Klarstellungs-Minima
// rechtsrahmenspezifisch. Projektdateien ohne `vergabeordnung` gelten als
// VgV (bisheriger Alleinumfang).
// 1.4.0: Startkonflikte strukturiert (`konflikte`) + frühestmögliche feste
// Starttermine (`fruehesteStarts`) im Ergebnis: harte Validierung statt
// Warnung, min-Attribute in der UI.
// 1.3.1: Vorschlagswerte optimiertes/finales Angebot 20 → 10 KT
// (reine Default-Änderung, keine Rechenlogik)

/**
 * Regelversion: Stand der Fristenregeln im Rechenkern. Sie steht in jedem
 * Ergebnis und in jeder Projektdatei. Von der Version des Pakets ist sie
 * unabhängig.
 */
export const REGELVERSION = '1.9.1';

/** Gleichbedeutend mit `REGELVERSION`; bleibt für bestehende Aufrufer erhalten. */
export const RECHENKERN_VERSION = REGELVERSION;

/**
 * Rechtsstand als Datum (ISO `JJJJ-MM-TT`): Tag, bis zu dem die Rechtslage
 * geprüft und bestätigt ist. Wird bei jeder fachlichen Aktualisierung und bei
 * jeder Regelprüfung ohne Änderung mitgepflegt.
 */
export const RECHTSSTAND_DATUM: ISODate = '2026-10-22';

/**
 * Rechtsstand als Anzeigetext, passend zu `RECHTSSTAND_DATUM`. Wird bei jeder
 * fachlichen Aktualisierung mitgepflegt.
 */
export const RECHTSSTAND = 'Oktober 2026';

interface TeilnahmefristProfil {
  /**
   * 'praxis': kein gesetzlicher Zahlwert (Unterschwelle: „ausreichende
   * Bewerbungsfrist") — der Meilenstein erscheint als Praxiswert ohne
   * Rechtsgrundlage und ohne Mindestfrist-Warnung. Default: 'gesetzlich'.
   */
  typ?: 'gesetzlich' | 'praxis';
  standardKT: number;
  norm: string;
  /** Abschlag (negativ) bei elektronischer Bekanntmachung — nur VSVgV (§ 20 Abs. 2 VSVgV). */
  elektronischKT?: number;
  normElektronisch?: string;
  /** Verkürzte Frist bei hinreichend begründeter Dringlichkeit; undefined ⇒ keine gesonderte Dringlichkeitsfrist. */
  dringlichkeitKT?: number;
  /** Dringlichkeitsfrist bei elektronischer Bekanntmachung (VSVgV: 10 statt 15 KT). */
  dringlichkeitElektronischKT?: number;
  normDringlichkeit?: string;
  /**
   * Absolute Untergrenze unterhalb der Regelfrist (SektVO: „in der Regel
   * mindestens 30, keinesfalls weniger als 15 Tage") — Werte dazwischen sind
   * nur im begründeten Ausnahmefall zulässig (abgestufte Warnung).
   */
  absolutMinKT?: number;
}

interface AngebotsfristProfil {
  typ: 'gesetzlich' | 'praxis';
  norm?: string;
  standardKT: number;
  /** Abschlag bei elektronischer Angebotsabgabe (negativ), 0 falls nicht vorgesehen. */
  elektronischKT: number;
  normElektronisch?: string;
  /** Praxis-Zuschlag bei erforderlicher Ortsbesichtigung (die Vergabeordnungen verlangen auskömmliche Bemessung). */
  ortsbegehungKT: number;
  /** Verkürzte Frist bei hinreichend begründeter Dringlichkeit (ersetzt Standard + Modifikatoren). */
  dringlichkeitKT?: number;
  normDringlichkeit?: string;
  /**
   * Gesetzliche Untergrenze bei `typ: 'praxis'` (SektVO: Angebotsfrist im
   * Einvernehmen frei, ohne Einvernehmen mindestens 10 KT) — bei
   * `typ: 'gesetzlich'` ergibt sich das Minimum aus standardKT/Modifikatoren.
   */
  mindestKT?: number;
  normMindest?: string;
  /**
   * Untergrenze bei einvernehmlicher Fristfestlegung mit allen Bewerbern
   * (z. B. § 16 Abs. 6 / § 17 Abs. 7 VgV) — nur zweistufige Verfahren.
   */
  einvernehmenMinKT?: number;
  normEinvernehmen?: string;
  /** Einschränkung der Einvernehmensregel, z. B. „nicht für oberste Bundesbehörden". */
  einvernehmenZusatz?: string;
}

export interface VerfahrensProfil {
  label: string;
  zweistufig: boolean;
  /**
   * Einstufige Verfahren ohne öffentliche Bekanntmachung: der Starttermin
   * ist die Absendung der Aufforderung zur Angebotsabgabe (Beschriftung in
   * UI/Ergebnis); default false = Absendung der (Auftrags-)Bekanntmachung.
   */
  startAufforderung?: boolean;
  /** Verhandlungsverfahren mit TNW: zusätzliche Angebotsrunden (optimiert/final) vorbelegen. */
  verhandlungsrunden: boolean;
  teilnahmefrist?: TeilnahmefristProfil;
  angebotsfrist: AngebotsfristProfil;
  /**
   * Warnung, wenn Bieterverhandlungsrunden in dieser Verfahrensart aktiviert
   * werden (offenes/nicht offenes Verfahren: Verhandlungsverbot, nur
   * Aufklärung zulässig); undefined ⇒ Verhandlungen zulässig.
   */
  verhandlungsverbot?: string;
  /**
   * Verfahrensspezifisches Klarstellungs-Minimum — ersetzt die generische
   * Regel der Vergabeordnung (Norm bleibt die der Ordnung). Nötig für die
   * VSVgV: § 20 Abs. 5 ordnet die 4 KT dem beschleunigten
   * VERHANDLUNGSverfahren zu, dem nicht offenen Verfahren stets 6 KT.
   */
  klarstellung?: { mindestKT: number; mindestDringlichKT?: number };
  /** Verfahrensbezogene Hinweise, die immer im Ergebnis erscheinen. */
  hinweise: string[];
}

export interface VergabeordnungProfil {
  /** Vollständiger Anzeigename, z. B. „VOB/A-EU — Bauleistungen". */
  label: string;
  /** Kurzform für Exporte/Zusammenfassungen, z. B. „VOB/A-EU". */
  kurz: string;
  /** Titel der Option „elektronisch" in dieser Ordnung (UI-Checkbox). */
  elektronischLabel: string;
  /** Beschreibung der Option „elektronisch" in dieser Ordnung (UI-Hilfetext). */
  elektronischHinweis: string;
  /** Verfügbare Verfahrensarten mit ihren Fristprofilen (Reihenfolge = UI-Reihenfolge). */
  verfahren: Partial<Record<Verfahrensart, VerfahrensProfil>>;
  /**
   * Informations- und Wartepflicht des § 134 GWB (GWB Teil 4). false im
   * Unterschwellenbereich (UVgO, VOB/A 1. Abschnitt): dort entfallen
   * Bieterinformations- und Wartefrist-Meilensteine, der Zuschlag ist am
   * Tag der internen Zuschlagsentscheidung möglich (seit Kern 1.6.0).
   */
  wartepflicht: boolean;
  /**
   * Normzitat für die Verschiebung eines Fristendes von Sa/So/Feiertag auf
   * den nächsten Arbeitstag. Default: EU-Fristen-VO (Oberschwelle); die
   * UVgO verweist stattdessen auf die §§ 186–193 BGB (§ 54 UVgO), der
   * 1. Abschnitt der VOB/A regelt die Berechnung nicht (BGB entsprechend).
   */
  fristverschiebungNorm?: string;
  /**
   * Normzitat für das Fristende mit Ablauf des letzten Fristtags (24:00 Uhr)
   * — Grundlage der Uhrzeit-Verschiebung (Kern 1.8.0). Default:
   * EU-Fristen-VO (Oberschwelle); Unterschwelle: § 188 Abs. 1 BGB.
   */
  fristendeNorm?: string;
  /**
   * Zusätzliche Auskünfte/Klarstellungen: spätester Versand vor
   * Angebotsfristablauf. undefined ⇒ kein gesetzliches numerisches Minimum
   * (Unterschwellenbereich) — der Praxiswert bleibt ohne Warnprüfung.
   */
  klarstellung?: {
    mindestKT: number;
    /** Verkürztes Minimum in den gesetzlich beschleunigten Verfahren; undefined ⇒ immer mindestKT. */
    mindestDringlichKT?: number;
    norm: string;
  };
  /** Ordnungsbezogene Hinweise, die immer im Ergebnis erscheinen. */
  hinweise: string[];
}

/**
 * Verfahrensprofile je Vergabeordnung; jede Zahl ist eigenständig gegen die
 * jeweilige Vergabeordnung geprüft (Normzitate).
 *
 * Ein „nicht offenes Verfahren ohne Teilnahmewettbewerb" gibt es im
 * Oberschwellenbereich nicht (§ 119 Abs. 2 Satz 1 GWB: das nicht offene
 * Verfahren erfordert stets einen Teilnahmewettbewerb). Die einstufige
 * Variante ist das Verhandlungsverfahren ohne Teilnahmewettbewerb
 * (§ 14 Abs. 4 VgV); so heißt es hier auch.
 */
export const VERGABEORDNUNGEN: Record<Vergabeordnung, VergabeordnungProfil> = {
  vgv: {
    label: 'VgV — Liefer- und Dienstleistungen (klassische Auftraggeber)',
    kurz: 'VgV',
    wartepflicht: true,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis: 'Bei den gesetzlichen Mindestfristen berücksichtigen',
    klarstellung: {
      mindestKT: 6,
      mindestDringlichKT: 4,
      norm: '§ 20 Abs. 3 Satz 1 Nr. 1 VgV',
    },
    hinweise: [],
    verfahren: {
      offen: {
        label: 'Offenes Verfahren',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 15 Abs. 2 VgV',
          standardKT: 35,
          elektronischKT: -5,
          normElektronisch: '§ 15 Abs. 4 VgV',
          ortsbegehungKT: 5,
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 15 Abs. 3 VgV',
        },
        verhandlungsverbot:
          'Verhandlungen sind im offenen Verfahren unzulässig (§ 15 Abs. 5 Satz 2 VgV) — zulässig ist nur die Aufklärung über Angebot oder Eignung (§ 15 Abs. 5 Satz 1 VgV).',
        hinweise: [],
      },
      nicht_offen_mit_tnw: {
        label: 'Nicht offenes Verfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          standardKT: 30,
          norm: '§ 16 Abs. 2 VgV',
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 16 Abs. 3 VgV',
        },
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 16 Abs. 5 VgV',
          standardKT: 30,
          elektronischKT: -5,
          normElektronisch: '§ 16 Abs. 8 VgV',
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          normDringlichkeit: '§ 16 Abs. 7 VgV',
          einvernehmenMinKT: 10,
          normEinvernehmen: '§ 16 Abs. 6 VgV',
          einvernehmenZusatz: 'nicht für oberste Bundesbehörden',
        },
        verhandlungsverbot:
          'Verhandlungen sind auch im nicht offenen Verfahren unzulässig (§ 16 Abs. 9 i. V. m. § 15 Abs. 5 Satz 2 VgV) — zulässig ist nur die Aufklärung.',
        hinweise: [],
      },
      verhandlung_ohne_tnw: {
        label: 'Verhandlungsverfahren ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        // Eine Angebotsrunde; weitere Runden über die optionalen
        // Fristwerte (optimiertesAngebotKT/finalesAngebotKT) zuschaltbar.
        verhandlungsrunden: false,
        angebotsfrist: {
          // Keine gesetzliche Mindestfrist: § 17 Abs. 6 VgV gilt nur „mit
          // Teilnahmewettbewerb"; für den Dringlichkeitsfall stellt § 17 Abs. 15
          // Satz 2 VgV (i. d. F. des Änderungsgesetzes 2026) das ausdrücklich
          // klar. Es gilt das Angemessenheitsgebot des § 20 Abs. 1 VgV.
          // 30 KT = Praxiswert.
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: -5,
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
        },
        hinweise: [
          'Verhandlungsverfahren ohne Teilnahmewettbewerb: nur in den Fällen des § 14 Abs. 4 VgV zulässig; ' +
            'Zulässigkeitsgrund dokumentieren. Es gibt keine gesetzliche Mindest-Angebotsfrist — ' +
            'die Frist muss angemessen sein (§ 20 Abs. 1 VgV).',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Verhandlungsverfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        teilnahmefrist: {
          standardKT: 30,
          norm: '§ 17 Abs. 2 VgV',
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 17 Abs. 3 VgV',
        },
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 17 Abs. 6 VgV',
          standardKT: 30,
          elektronischKT: -5,
          normElektronisch: '§ 17 Abs. 9 VgV',
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          normDringlichkeit: '§ 17 Abs. 8 VgV',
          einvernehmenMinKT: 10,
          normEinvernehmen: '§ 17 Abs. 7 VgV',
          einvernehmenZusatz: 'nicht für oberste Bundesbehörden',
        },
        hinweise: [],
      },
    },
  },

  // Verifiziert 2026-10-22: VOB/A Ausgabe 2026, 2. Abschnitt,
  // Bekanntmachung vom 22.07.2026, BAnz AT 24.08.2026 B6, S. 1 (Ausgabe),
  // S. 22–23 (§§ 10a–10c EU), S. 26 (§ 12 EU Abs. 3 Nr. 4).
  // Einzelabgleich: docs/normabgleich-vob-a-2026.md. Fristwerte unverändert,
  // neuer Bezugszeitpunkt in § 12 EU Abs. 3 Nr. 4 Satz 4 (Hinweis unten).
  // Abweichungen zur VgV:
  // keine Einvernehmensregel für die Angebotsfrist; das
  // Verhandlungsverfahren ohne TNW hat eine echte Mindestfrist von 10 KT
  // (§ 10c EU Abs. 2 VOB/A).
  vob_a_eu: {
    label: 'VOB/A-EU — Bauleistungen (2. Abschnitt)',
    kurz: 'VOB/A-EU',
    wartepflicht: true,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis: 'Bei den gesetzlichen Mindestfristen berücksichtigen',
    klarstellung: {
      mindestKT: 6,
      // 4 KT im beschleunigten Verfahren: § 10a EU Abs. 6 Nr. 1 bzw.
      // § 10b EU Abs. 6 Nr. 1 VOB/A
      mindestDringlichKT: 4,
      norm: '§ 12a EU Abs. 3, § 10a/10b EU Abs. 6 Nr. 1 VOB/A',
    },
    hinweise: [
      'VOB/A-EU: Abgebildet ist der 2. Abschnitt der VOB/A (EU-weite Vergabe von Bauleistungen ab Erreichen des Schwellenwerts), Ausgabe 2026.',
      'Wird bei der Übermittlung der Auftragsbekanntmachung an das Amt für Veröffentlichungen der EU ein späterer Tag zur Veröffentlichung angegeben, kommt es für die Fristberechnung auf diesen Tag an (§ 12 EU Abs. 3 Nr. 4 VOB/A). In diesem Fall den angegebenen Veröffentlichungstag als Absendung der Bekanntmachung eintragen.',
    ],
    verfahren: {
      offen: {
        label: 'Offenes Verfahren',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 10a EU Abs. 1 VOB/A',
          standardKT: 35,
          elektronischKT: -5,
          normElektronisch: '§ 10a EU Abs. 4 VOB/A',
          ortsbegehungKT: 5,
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 10a EU Abs. 3 VOB/A',
        },
        verhandlungsverbot:
          'Verhandlungen sind im offenen Verfahren unstatthaft (§ 15 EU Abs. 3 VOB/A) — zulässig ist nur die Aufklärung (§ 15 EU Abs. 1 VOB/A).',
        hinweise: [],
      },
      nicht_offen_mit_tnw: {
        label: 'Nicht offenes Verfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          standardKT: 30,
          norm: '§ 10b EU Abs. 1 VOB/A',
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 10b EU Abs. 5 Nr. 1 VOB/A',
        },
        angebotsfrist: {
          // Keine Einvernehmensregel wie § 16 Abs. 6 VgV — die VOB/A-EU
          // kennt nur die festen Mindestfristen (verifiziert 2026-10-22:
          // BAnz AT 24.08.2026 B6, S. 22–23, § 10b EU Abs. 2–5).
          typ: 'gesetzlich',
          norm: '§ 10b EU Abs. 2 VOB/A',
          standardKT: 30,
          elektronischKT: -5,
          normElektronisch: '§ 10b EU Abs. 4 VOB/A',
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          normDringlichkeit: '§ 10b EU Abs. 5 Nr. 2 VOB/A',
        },
        verhandlungsverbot:
          'Verhandlungen sind auch im nicht offenen Verfahren unstatthaft (§ 15 EU Abs. 3 VOB/A) — zulässig ist nur die Aufklärung (§ 15 EU Abs. 1 VOB/A).',
        hinweise: [],
      },
      verhandlung_ohne_tnw: {
        label: 'Verhandlungsverfahren ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Anders als in der VgV gibt es eine echte Untergrenze: „auch bei
          // Dringlichkeit … nicht unter zehn Kalendertagen" (§ 10c EU Abs. 2).
          // Kein elektronischer Abschlag: § 10b EU Abs. 4 wird über
          // § 10c EU Abs. 1 nur auf das Verhandlungsverfahren MIT
          // Teilnahmewettbewerb übertragen.
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          // Bei Dringlichkeit Vorschlag = gesetzliche Untergrenze
          dringlichkeitKT: 10,
          mindestKT: 10,
          normMindest: '§ 10c EU Abs. 2 VOB/A',
        },
        hinweise: [
          'Verhandlungsverfahren ohne Teilnahmewettbewerb: nur in den Fällen des § 3a EU Abs. 3 VOB/A zulässig; ' +
            'Zulässigkeitsgrund dokumentieren. Die Angebotsfrist muss ausreichend sein und darf auch bei ' +
            'Dringlichkeit 10 KT nicht unterschreiten (§ 10c EU Abs. 2 VOB/A).',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Verhandlungsverfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        // § 10c EU Abs. 1 VOB/A: „entsprechend den §§ 10 EU und 10b EU zu
        // verfahren" — Werte identisch mit dem nicht offenen Verfahren.
        teilnahmefrist: {
          standardKT: 30,
          norm: '§ 10c EU Abs. 1 i. V. m. § 10b EU Abs. 1 VOB/A',
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 10c EU Abs. 1 i. V. m. § 10b EU Abs. 5 Nr. 1 VOB/A',
        },
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 10c EU Abs. 1 i. V. m. § 10b EU Abs. 2 VOB/A',
          standardKT: 30,
          elektronischKT: -5,
          normElektronisch: '§ 10c EU Abs. 1 i. V. m. § 10b EU Abs. 4 VOB/A',
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          normDringlichkeit: '§ 10c EU Abs. 1 i. V. m. § 10b EU Abs. 5 Nr. 2 VOB/A',
        },
        hinweise: [],
      },
    },
  },

  // Verifiziert 2026-07-30 gegen gesetze-im-internet.de (SektVO Stand
  // „zuletzt geändert durch Art. 10 G v. 12.5.2026 I Nr. 137" — das
  // Änderungsgesetz 2026 hat die Fristnormen §§ 13–16, 36 SektVO nicht
  // geändert).
  // Besonderheit: Nicht offenes Verfahren und Verhandlungsverfahren mit TNW
  // teilen sich die Fristnorm des § 15 SektVO.
  sektvo: {
    label: 'SektVO — Sektorenauftraggeber (Wasser, Energie, Verkehr)',
    kurz: 'SektVO',
    wartepflicht: true,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis:
      'Verkürzt nur im offenen Verfahren die gesetzliche Mindestfrist (§ 14 Abs. 4 SektVO)',
    klarstellung: {
      mindestKT: 6,
      // 4 KT nur „in Fällen hinreichend begründeter Dringlichkeit nach § 14
      // Absatz 3" — also nur im beschleunigten offenen Verfahren.
      mindestDringlichKT: 4,
      norm: '§ 16 Abs. 3 Nr. 1 SektVO',
    },
    hinweise: [],
    verfahren: {
      offen: {
        label: 'Offenes Verfahren',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 14 Abs. 2 SektVO',
          standardKT: 35,
          elektronischKT: -5,
          normElektronisch: '§ 14 Abs. 4 SektVO',
          ortsbegehungKT: 5,
          dringlichkeitKT: 15,
          normDringlichkeit: '§ 14 Abs. 3 SektVO',
        },
        // Kein ausdrückliches Verbots-Pendant zu § 15 Abs. 5 VgV in der
        // SektVO — Warnung daher ohne Normzitat (Wesen des offenen Verfahrens).
        verhandlungsverbot:
          'Verhandlungen sind im offenen Verfahren nicht vorgesehen — zulässig ist nur die Aufklärung über Angebot oder Eignung.',
        hinweise: [],
      },
      nicht_offen_mit_tnw: {
        label: 'Nicht offenes Verfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          // „mindestens 30 Tage … Sie darf auf keinen Fall weniger als
          // 15 Tage betragen." Keine gesonderte Dringlichkeitsverkürzung.
          standardKT: 30,
          norm: '§ 15 Abs. 2 SektVO',
          absolutMinKT: 15,
        },
        angebotsfrist: {
          // Einvernehmliche Festlegung möglich; ohne Einvernehmen mindestens
          // 10 KT (§ 15 Abs. 3 SektVO). Keine elektronische Verkürzung
          // (die gibt es nur in § 14 Abs. 4 für das offene Verfahren).
          // 30 KT = Praxiswert.
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          mindestKT: 10,
          normMindest: '§ 15 Abs. 3 SektVO',
          einvernehmenMinKT: 0,
          normEinvernehmen: '§ 15 Abs. 3 SektVO',
          einvernehmenZusatz: 'dieselbe Frist für alle ausgewählten Bewerber',
        },
        verhandlungsverbot:
          'Verhandlungen sind im nicht offenen Verfahren nicht vorgesehen — zulässig ist nur die Aufklärung über Angebot oder Eignung.',
        hinweise: [],
      },
      verhandlung_ohne_tnw: {
        label: 'Verhandlungsverfahren ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Keine gesetzliche Mindestfrist (§§ 14, 15 SektVO gelten hier
          // nicht); es gilt das Angemessenheitsgebot des § 16 Abs. 1 SektVO.
          // Kein Dringlichkeits-Vorschlagswert: die SektVO kennt hier keine
          // verkürzte Frist, und anders als beim VgV-Pendant gibt es keinen
          // Praxiswert.
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Verhandlungsverfahren ohne Teilnahmewettbewerb: nur in den Fällen des § 13 Abs. 2 SektVO zulässig; ' +
            'Zulässigkeitsgrund dokumentieren. Es gibt keine gesetzliche Mindest-Angebotsfrist — ' +
            'die Frist muss angemessen sein (§ 16 Abs. 1 SektVO).',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Verhandlungsverfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        teilnahmefrist: {
          standardKT: 30,
          norm: '§ 15 Abs. 2 SektVO',
          absolutMinKT: 15,
        },
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          mindestKT: 10,
          normMindest: '§ 15 Abs. 3 SektVO',
          einvernehmenMinKT: 0,
          normEinvernehmen: '§ 15 Abs. 3 SektVO',
          einvernehmenZusatz: 'dieselbe Frist für alle ausgewählten Bewerber',
        },
        hinweise: [],
      },
    },
  },

  // Verifiziert 2026-07-30 gegen gesetze-im-internet.de (VSVgV Stand
  // „zuletzt geändert durch Art. 13 G v. 12.5.2026 I Nr. 137" — das
  // Änderungsgesetz 2026 hat die Mindestfristen des § 20 VSVgV nicht
  // geändert; neu ist nur § 20 Abs. 2 Satz 3: bei angegebenem späteren
  // EU-Veröffentlichungstag zählt dieser statt der Absendung. Das bildet der
  // Rechner bewusst nicht ab).
  vsvgv: {
    label: 'VSVgV — Verteidigung und Sicherheit',
    kurz: 'VSVgV',
    wartepflicht: true,
    elektronischLabel: 'Elektronische Vergabe',
    elektronischHinweis:
      'Elektronische Bekanntmachung (−7 KT Teilnahmefrist) und elektronisch frei verfügbare Vergabeunterlagen (−5 KT Angebotsfrist), § 20 Abs. 4 VSVgV',
    klarstellung: {
      mindestKT: 6,
      mindestDringlichKT: 4,
      norm: '§ 20 Abs. 5 VSVgV',
    },
    hinweise: [
      'VSVgV: kein offenes Verfahren — frei wählbar sind das nicht offene Verfahren und das Verhandlungsverfahren mit Teilnahmewettbewerb (§ 11 Abs. 1 VSVgV). ' +
        'Für verteidigungs- oder sicherheitsspezifische Bauaufträge gilt im Wesentlichen der 3. Abschnitt der VOB/A (VOB/A-VS, § 2 Abs. 2 VSVgV), den der Rechner nicht abbildet.',
    ],
    verfahren: {
      nicht_offen_mit_tnw: {
        label: 'Nicht offenes Verfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          standardKT: 37,
          norm: '§ 20 Abs. 2 Satz 1 VSVgV',
          elektronischKT: -7,
          normElektronisch: '§ 20 Abs. 4 Satz 1 VSVgV',
          dringlichkeitKT: 15,
          dringlichkeitElektronischKT: 10,
          normDringlichkeit: '§ 20 Abs. 2 Satz 2 VSVgV',
        },
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 20 Abs. 3 Satz 1 VSVgV',
          standardKT: 40,
          // −5 KT bei elektronisch frei, direkt und vollständig verfügbaren
          // Vergabeunterlagen ab Veröffentlichung der Bekanntmachung
          elektronischKT: -5,
          normElektronisch: '§ 20 Abs. 4 Satz 2 VSVgV',
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          normDringlichkeit: '§ 20 Abs. 3 Satz 2 VSVgV',
        },
        verhandlungsverbot:
          'Verhandlungen im nicht offenen Verfahren sind unzulässig (§ 11 Abs. 2 VSVgV) — zulässig ist nur die Aufklärung.',
        // § 20 Abs. 5 VSVgV: „im Falle des nicht offenen Verfahrens
        // spätestens sechs Tage oder im Falle des beschleunigten
        // Verhandlungsverfahrens spätestens vier Tage" — das nicht offene
        // Verfahren behält also auch beschleunigt die 6 KT (konservativ
        // ggü. Art. 34 RL 2009/81/EG).
        klarstellung: { mindestKT: 6 },
        hinweise: [],
      },
      verhandlung_ohne_tnw: {
        label: 'Verhandlungsverfahren ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Keine gesetzliche Mindestfrist (§ 20 Abs. 3 VSVgV gilt nur für
          // das nicht offene Verfahren); Angemessenheitsgebot § 20 Abs. 1.
          // Kein Dringlichkeits-Vorschlagswert (kein Beleg in der Norm).
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        // Stets 6 KT: Ohne Teilnahmewettbewerb gibt es kein beschleunigtes
        // Verfahren i. S. d. § 20 Abs. 2 Satz 2 VSVgV — die 4 KT des § 20
        // Abs. 5 gelten nur für das beschleunigte Verhandlungsverfahren mit
        // TNW.
        klarstellung: { mindestKT: 6 },
        hinweise: [
          'Verhandlungsverfahren ohne Teilnahmewettbewerb: nur in den begründeten Ausnahmefällen des § 12 Abs. 1 VSVgV zulässig; ' +
            'Zulässigkeitsgrund dokumentieren (§ 12 Abs. 2 VSVgV). Es gibt keine gesetzliche Mindest-Angebotsfrist — ' +
            'die Frist muss angemessen sein (§ 20 Abs. 1 VSVgV).',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Verhandlungsverfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        teilnahmefrist: {
          standardKT: 37,
          norm: '§ 20 Abs. 2 Satz 1 VSVgV',
          elektronischKT: -7,
          normElektronisch: '§ 20 Abs. 4 Satz 1 VSVgV',
          dringlichkeitKT: 15,
          dringlichkeitElektronischKT: 10,
          normDringlichkeit: '§ 20 Abs. 2 Satz 2 VSVgV',
        },
        angebotsfrist: {
          // Keine gesetzliche Mindestfrist für Erstangebote im
          // Verhandlungsverfahren (§ 20 Abs. 3 VSVgV nennt nur das nicht
          // offene Verfahren) — Praxiswert; Angemessenheit § 20 Abs. 1 VSVgV.
          // Kein Dringlichkeits-Vorschlagswert (kein Beleg in der Norm) — nur
          // die Teilnahmefrist verkürzt sich gesetzlich (§ 20 Abs. 2 Satz 2).
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        // 4 KT im beschleunigten Verhandlungsverfahren (§ 20 Abs. 5 VSVgV)
        klarstellung: { mindestKT: 6, mindestDringlichKT: 4 },
        hinweise: [],
      },
    },
  },

  // Verifiziert 2026-07-30 gegen gesetze-im-internet.de (KonzVgV Stand
  // „zuletzt geändert durch Art. 11 G v. 12.5.2026 I Nr. 137" — das
  // Änderungsgesetz 2026 hat die Fristnormen §§ 18, 27 KonzVgV nicht
  // geändert).
  // Die KonzVgV kennt keinen Verfahrensarten-Katalog (§ 12 Abs. 1: freie
  // Ausgestaltung, ein- oder mehrstufig, Verhandlungen zulässig) — der
  // Rechner bildet die drei praktischen Grundformen ab.
  konzvgv: {
    label: 'KonzVgV — Konzessionen (Bau- und Dienstleistungskonzessionen)',
    kurz: 'KonzVgV',
    // Wartefrist über § 154 Nr. 4 GWB i. V. m. § 134 GWB („entsprechend
    // anzuwenden")
    wartepflicht: true,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis:
      'Verkürzt nur die Erstangebotsfrist im mehrstufigen Verfahren (§ 27 Abs. 4 Satz 2 KonzVgV)',
    klarstellung: {
      // § 18 KonzVgV kennt keine verkürzte 4-KT-Variante
      mindestKT: 6,
      norm: '§ 18 KonzVgV',
    },
    hinweise: [
      'KonzVgV: Das Vergabeverfahren ist frei gestaltbar (§ 12 Abs. 1 KonzVgV, ein- oder mehrstufig); ' +
        'Verhandlungen sind zulässig (§ 12 Abs. 2 KonzVgV) — Konzessionsgegenstand, Mindestanforderungen und ' +
        'Zuschlagskriterien dürfen dabei nicht geändert werden. Die Wartefrist gilt über § 154 Nr. 4 i. V. m. § 134 GWB.',
    ],
    verfahren: {
      offen: {
        label: 'Einstufiges Verfahren (Angebote auf die Konzessionsbekanntmachung)',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          // § 27 Abs. 3: 30 KT für Teilnahmeanträge MIT oder ohne Angebot —
          // im einstufigen Verfahren zugleich die Angebotsfrist. Die
          // 5-KT-Verkürzung des Abs. 4 Satz 2 gilt nur für Erstangebote im
          // mehrstufigen Verfahren.
          typ: 'gesetzlich',
          norm: '§ 27 Abs. 3 KonzVgV',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Verhandlungen sind auch im einstufigen Verfahren zulässig (§ 12 Abs. 2 KonzVgV) — für geplante ' +
            'Verhandlungsrunden mit erneuter Angebotsabgabe im Rechner das mehrstufige Verfahren wählen.',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Mehrstufiges Verfahren mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        teilnahmefrist: {
          // Keine Dringlichkeits- oder E-Verkürzung in § 27 Abs. 3
          standardKT: 30,
          norm: '§ 27 Abs. 3 KonzVgV',
        },
        angebotsfrist: {
          typ: 'gesetzlich',
          norm: '§ 27 Abs. 4 Satz 1 KonzVgV',
          standardKT: 22,
          elektronischKT: -5,
          normElektronisch: '§ 27 Abs. 4 Satz 2 KonzVgV',
          ortsbegehungKT: 5,
        },
        hinweise: [],
      },
      verhandlung_ohne_tnw: {
        label: 'Vergabe ohne Konzessionsbekanntmachung (§ 20 KonzVgV)',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Ohne Bekanntmachung greifen die Mindestfristen des § 27
          // Abs. 3/4 nicht; es gilt das Angemessenheitsgebot (§ 27 Abs. 1).
          typ: 'praxis',
          standardKT: 30,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Vergabe ohne Konzessionsbekanntmachung: nur in den Ausnahmefällen des § 20 KonzVgV zulässig ' +
            '(z. B. nur ein Unternehmen kommt in Betracht, ausschließliche Rechte); Zulässigkeitsgrund ' +
            'dokumentieren. Es gibt keine gesetzliche Mindest-Angebotsfrist — die Frist muss angemessen sein ' +
            '(§ 27 Abs. 1 KonzVgV).',
        ],
      },
    },
  },

  // Verifiziert 2026-07-30 gegen das amtliche BAnz-PDF (UVgO v. 02.02.2017,
  // BAnz AT 07.02.2017 B1 — seither nicht novelliert; die vom
  // Änderungsgesetz 2026 angestoßene UVgO-Neufassung liegt nur als Entwurf
  // vom 30.06.2026 vor). Die UVgO kennt KEINE numerischen Mindestfristen
  // (§ 13 Abs. 1: Angemessenheit), keine E-/Dringlichkeitsverkürzungen, keine
  // numerische Auskunftsregel und keine Wartepflicht (§ 46 Abs. 1:
  // Unterrichtung über die ERFOLGTE Zuschlagserteilung). Fristberechnung:
  // § 54 UVgO i. V. m. §§ 186–193 BGB. Fristvorschläge = Praxiswerte.
  uvgo: {
    label: 'UVgO — Liefer- und Dienstleistungen (unterhalb der Schwellenwerte)',
    kurz: 'UVgO',
    wartepflicht: false,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis: 'Keine gesetzliche Fristverkürzung in der UVgO',
    fristverschiebungNorm: '§ 54 UVgO i. V. m. § 193 BGB',
    fristendeNorm: '§ 54 UVgO i. V. m. § 188 Abs. 1 BGB',
    hinweise: [
      'UVgO (unterhalb der EU-Schwellenwerte): keine Informations- und Wartepflicht nach § 134 GWB — ' +
        'die Unterrichtung der Bewerber und Bieter erfolgt nach § 46 UVgO nach der Zuschlagserteilung. ' +
        'Einzelne Landesvergabegesetze kennen eigene Vorabinformations-/Wartepflichten (z. B. Sachsen-Anhalt, ' +
        'Thüringen) — landesrechtlich prüfen.',
      'Alle Fristvorschläge sind Praxiswerte: Die UVgO kennt keine numerischen Mindestfristen, verlangt aber ' +
        'angemessene Fristen (§ 13 Abs. 1 UVgO); bei nachgereichten wesentlichen Informationen oder geänderten ' +
        'Vergabeunterlagen sind Fristen angemessen zu verlängern (§ 13 Abs. 4 UVgO).',
    ],
    verfahren: {
      offen: {
        label: 'Öffentliche Ausschreibung',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          // 21 KT = Praxiswert; keine gesetzliche Untergrenze
          typ: 'praxis',
          standardKT: 21,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        verhandlungsverbot:
          'Verhandlungen sind bei der Öffentlichen Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung.',
        hinweise: [],
      },
      nicht_offen_mit_tnw: {
        label: 'Beschränkte Ausschreibung mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          // § 13 Abs. 1 UVgO: nur angemessene Teilnahmefrist —
          // 10 KT = Praxiswert
          typ: 'praxis',
          standardKT: 10,
          norm: '§ 13 Abs. 1 UVgO',
        },
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        verhandlungsverbot:
          'Verhandlungen sind bei der Beschränkten Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung.',
        hinweise: [],
      },
      beschraenkt_ohne_tnw: {
        label: 'Beschränkte Ausschreibung ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        verhandlungsverbot:
          'Verhandlungen sind bei der Beschränkten Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung.',
        hinweise: [
          'Beschränkte Ausschreibung ohne Teilnahmewettbewerb: nur in den Fällen des § 8 Abs. 3 UVgO zulässig; ' +
            'Zulässigkeitsgrund dokumentieren. Grundsätzlich sind mindestens drei Unternehmen zur Angebotsabgabe ' +
            'aufzufordern (§ 11 Abs. 1 UVgO).',
        ],
      },
      verhandlung_ohne_tnw: {
        label: 'Verhandlungsvergabe ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Verhandlungsvergabe: nur in den Fällen des § 8 Abs. 4 UVgO zulässig; Zulässigkeitsgrund ' +
            'dokumentieren. Ohne Teilnahmewettbewerb sind grundsätzlich mindestens drei Unternehmen ' +
            'aufzufordern (§ 12 Abs. 2 UVgO); in den Fällen des § 8 Abs. 4 Nr. 9 bis 14 genügt ein Unternehmen ' +
            '(§ 12 Abs. 3 UVgO).',
        ],
      },
      verhandlung_mit_tnw: {
        label: 'Verhandlungsvergabe mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: true,
        teilnahmefrist: {
          typ: 'praxis',
          standardKT: 10,
          norm: '§ 13 Abs. 1 UVgO',
        },
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Verhandlungsvergabe: nur in den Fällen des § 8 Abs. 4 UVgO zulässig; Zulässigkeitsgrund dokumentieren.',
        ],
      },
    },
  },

  // Verifiziert 2026-07-30: VOB/A Abschnitt 1 i. d. F. 2019, § 3a neu
  // gefasst zum 01.01.2026 (BAnz AT 16.12.2025 B7, mit Wertgrenzen für
  // Direktauftrag, Freihändige Vergabe und Beschränkte Ausschreibung ohne
  // TNW). Einzige numerische Frist: Angebotsfrist „auch bei Dringlichkeit
  // nicht unter zehn Kalendertagen" (§ 10 Abs. 1 Satz 1) — nach der
  // Systematik des § 10 Abs. 6 gilt sie NICHT für die Freihändige Vergabe
  // (Auslegung). Keine Wartepflicht (§ 134 GWB gilt nur ab den
  // EU-Schwellenwerten; § 19 Abs. 1 VOB/A: Unterrichtung i. d. R. nach
  // Zuschlag). Fristvorschläge = Praxiswerte.
  vob_a_1: {
    label: 'VOB/A 1. Abschnitt — Bauleistungen (unterhalb der Schwellenwerte)',
    kurz: 'VOB/A',
    wartepflicht: false,
    elektronischLabel: 'Elektronische Angebotsabgabe',
    elektronischHinweis: 'Keine gesetzliche Fristverkürzung im 1. Abschnitt der VOB/A',
    // Der 1. Abschnitt regelt die Fristberechnung nicht; die §§ 186–193 BGB
    // gelten entsprechend (Verschiebung: § 193 BGB)
    fristverschiebungNorm: '§ 193 BGB (entsprechend)',
    fristendeNorm: '§ 188 Abs. 1 BGB (entsprechend)',
    // Keine numerische Auskunftsregel: § 12a Abs. 4 VOB/A verlangt nur
    // „unverzüglich" — daher kein gesetzliches Klarstellungs-Minimum
    hinweise: [
      'VOB/A 1. Abschnitt (unterhalb der EU-Schwellenwerte): keine Informations- und Wartepflicht nach ' +
        '§ 134 GWB — die Unterrichtung nicht berücksichtigter Bieter richtet sich nach § 19 VOB/A ' +
        '(in der Regel nach Zuschlagserteilung). Einzelne Landesvergabegesetze kennen eigene ' +
        'Vorabinformations-/Wartepflichten (z. B. MV, SN, ST, TH) — landesrechtlich prüfen.',
      'Bindefrist: Sie beginnt mit dem Ablauf der Angebotsfrist und soll 30 Kalendertage nur in ' +
        'begründeten Fällen überschreiten (§ 10 Abs. 4 und 5 VOB/A).',
    ],
    verfahren: {
      offen: {
        label: 'Öffentliche Ausschreibung',
        zweistufig: false,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Kein gesetzlicher Regelwert — nur die 10-KT-Untergrenze;
          // 21 KT = Praxiswert
          typ: 'praxis',
          standardKT: 21,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          mindestKT: 10,
          normMindest: '§ 10 Abs. 1 Satz 1 VOB/A',
        },
        verhandlungsverbot:
          'Verhandlungen sind bei Öffentlicher Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung (§ 15 VOB/A).',
        hinweise: [],
      },
      nicht_offen_mit_tnw: {
        label: 'Beschränkte Ausschreibung mit Teilnahmewettbewerb',
        zweistufig: true,
        verhandlungsrunden: false,
        teilnahmefrist: {
          // § 10 Abs. 3 VOB/A: nur „ausreichende Bewerbungsfrist" —
          // 10 KT = Praxiswert
          typ: 'praxis',
          standardKT: 10,
          norm: '§ 10 Abs. 3 VOB/A',
        },
        angebotsfrist: {
          // 14 KT = Praxiswert (begrenzter Bieterkreis)
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          mindestKT: 10,
          normMindest: '§ 10 Abs. 1 Satz 1 VOB/A',
        },
        verhandlungsverbot:
          'Verhandlungen sind bei Beschränkter Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung (§ 15 VOB/A).',
        hinweise: [],
      },
      beschraenkt_ohne_tnw: {
        label: 'Beschränkte Ausschreibung ohne Teilnahmewettbewerb',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
          dringlichkeitKT: 10,
          mindestKT: 10,
          normMindest: '§ 10 Abs. 1 Satz 1 VOB/A',
        },
        verhandlungsverbot:
          'Verhandlungen sind bei Beschränkter Ausschreibung nicht vorgesehen — zulässig ist nur die Aufklärung (§ 15 VOB/A).',
        hinweise: [
          'Beschränkte Ausschreibung ohne Teilnahmewettbewerb: zulässig bis zur Wertgrenze des § 3a VOB/A oder in den ' +
            'Fällen des § 3a Abs. 2 Nr. 2–3 VOB/A (Stand 01.01.2026); Zulässigkeitsgrund dokumentieren.',
        ],
      },
      verhandlung_ohne_tnw: {
        label: 'Freihändige Vergabe',
        zweistufig: false,
        startAufforderung: true,
        verhandlungsrunden: false,
        angebotsfrist: {
          // Die 10-KT-Untergrenze des § 10 Abs. 1 gilt hier nach der
          // Systematik des § 10 Abs. 6 nicht (nur Abs. 4/5 entsprechend) —
          // keine gesetzliche Untergrenze, 14 KT = Praxiswert
          typ: 'praxis',
          standardKT: 14,
          elektronischKT: 0,
          ortsbegehungKT: 5,
        },
        hinweise: [
          'Freihändige Vergabe: zulässig bis zur Wertgrenze des § 3a VOB/A oder in den Fällen des § 3a Abs. 3 VOB/A ' +
            '(Stand 01.01.2026); Zulässigkeitsgrund dokumentieren. Verhandlungen sind zulässig; eine gesetzliche ' +
            'Mindest-Angebotsfrist besteht nicht.',
        ],
      },
    },
  },
};

/** Verfahrensprofile je Vergabeordnung (Sicht auf `VERGABEORDNUNGEN`). */
export const VERFAHREN: Record<Vergabeordnung, Partial<Record<Verfahrensart, VerfahrensProfil>>> = {
  vgv: VERGABEORDNUNGEN.vgv.verfahren,
  vob_a_eu: VERGABEORDNUNGEN.vob_a_eu.verfahren,
  sektvo: VERGABEORDNUNGEN.sektvo.verfahren,
  vsvgv: VERGABEORDNUNGEN.vsvgv.verfahren,
  konzvgv: VERGABEORDNUNGEN.konzvgv.verfahren,
  uvgo: VERGABEORDNUNGEN.uvgo.verfahren,
  vob_a_1: VERGABEORDNUNGEN.vob_a_1.verfahren,
};

/** Profil einer Verfahrensart in einer Vergabeordnung; undefined, wenn dort nicht verfügbar (z. B. VSVgV + offen). */
export function verfahrensProfil(
  vergabeordnung: Vergabeordnung,
  verfahrensart: Verfahrensart
): VerfahrensProfil | undefined {
  return VERGABEORDNUNGEN[vergabeordnung]?.verfahren[verfahrensart];
}

/** Verfügbare Verfahrensarten einer Vergabeordnung (Definitionsreihenfolge = UI-Reihenfolge). */
export function verfahrenFuer(vergabeordnung: Vergabeordnung): Verfahrensart[] {
  return Object.keys(VERGABEORDNUNGEN[vergabeordnung].verfahren) as Verfahrensart[];
}

/** Alle bekannten Verfahrensart-Schlüssel (unabhängig von der Vergabeordnung). */
export const ALLE_VERFAHRENSARTEN: Verfahrensart[] = [
  'offen',
  'nicht_offen_mit_tnw',
  'beschraenkt_ohne_tnw',
  'verhandlung_ohne_tnw',
  'verhandlung_mit_tnw',
];

/** Verfahrensunabhängige Werte. */
export const WERTE = {
  /** Praxiswert: Ende der Bieterfragen vor Ablauf der (Erst-)Angebotsfrist. */
  bieterfragenVorAngebotKT: 8,
  /** Praxiswert: Ende der Bewerberfragen vor Ablauf der Teilnahmefrist (seit Kern 1.9.0). */
  bewerberfragenVorTeilnahmeKT: 8,
  /** Versand einer Aufforderung n AT nach Bewertungs-/Vorbereitungsende. */
  aufforderungVersandAT: 1,
  /** Versand der Einladung zur Bieterverhandlung n AT nach Bewertungsende. */
  einladungVersandAT: 1,
  /**
   * Anpassung der Vergabeunterlagen nach einer Verhandlungsrunde —
   * Praxiswert, symmetrisch für beide Runden.
   */
  vuAnpassungAT: 2,
  /** Praxiswert; gesetzliches Minimum je Vergabeordnung (`VERGABEORDNUNGEN[vo].klarstellung`). */
  klarstellungVorAngebotKT: 7,
  /** Wartefrist § 134 Abs. 2 GWB nach Versandart der Bieterinformation (gilt in allen Vergabeordnungen, GWB Teil 4). */
  wartefrist: {
    elektronisch: { wert: 10, norm: '§ 134 Abs. 2 Satz 2 GWB' },
    postalisch: { wert: 15, norm: '§ 134 Abs. 2 Satz 1 GWB' },
  },
  /** Vorschlagswerte für die zusätzlichen Angebotsrunden im
      Verhandlungsverfahren — 10 KT (seit Kern 1.3.1; zuvor 20 KT). */
  optimiertesAngebotKT: 10,
  finalesAngebotKT: 10,
} as const;

/** Effektive Teilnahmefrist eines Profils für Optionen (Default und zugleich Regel-Minimum). */
function teilnahmefristEffektivKT(t: TeilnahmefristProfil, optionen: Optionen): number {
  if (optionen.dringlichkeit && t.dringlichkeitKT !== undefined) {
    return optionen.elektronischeAbgabe && t.dringlichkeitElektronischKT !== undefined
      ? t.dringlichkeitElektronischKT
      : t.dringlichkeitKT;
  }
  return t.standardKT + (optionen.elektronischeAbgabe ? (t.elektronischKT ?? 0) : 0);
}

/** Gesetzliche Mindest-Angebotsfrist für Warnprüfungen; undefined ⇒ kein gesetzliches Minimum. */
export function mindestAngebotsfristKT(
  vergabeordnung: Vergabeordnung,
  verfahrensart: Verfahrensart,
  optionen: Optionen
): number | undefined {
  const profil = verfahrensProfil(vergabeordnung, verfahrensart)?.angebotsfrist;
  if (!profil) return undefined;
  if (profil.typ !== 'gesetzlich') return profil.mindestKT;
  if (optionen.dringlichkeit && profil.dringlichkeitKT !== undefined) return profil.dringlichkeitKT;
  return profil.standardKT + (optionen.elektronischeAbgabe ? profil.elektronischKT : 0);
}

/** Gesetzliche Mindest-Teilnahmefrist (Regel-Minimum); undefined bei einstufigen Verfahren oder reinen Praxiswerten. */
export function mindestTeilnahmefristKT(
  vergabeordnung: Vergabeordnung,
  verfahrensart: Verfahrensart,
  optionen: Optionen
): number | undefined {
  const t = verfahrensProfil(vergabeordnung, verfahrensart)?.teilnahmefrist;
  if (!t || t.typ === 'praxis') return undefined;
  return teilnahmefristEffektivKT(t, optionen);
}

/** Verifizierte Default-Fristwerte für Vergabeordnung + Verfahrensart + Optionen (UI-Vorbelegung). */
export function defaultFristen(
  vergabeordnung: Vergabeordnung,
  verfahrensart: Verfahrensart,
  optionen: Optionen
) {
  // Wartefrist nur bei Wartepflicht (§ 134 GWB, Oberschwelle) — im
  // Unterschwellenbereich gibt es keinen Wartefrist-Vorschlagswert
  const wartefristKT = VERGABEORDNUNGEN[vergabeordnung]?.wartepflicht
    ? WERTE.wartefrist[optionen.versandBieterinformation].wert
    : undefined;
  const profil = verfahrensProfil(vergabeordnung, verfahrensart);
  if (!profil) {
    // Ungültige Kombination (z. B. VSVgV + offen) — die UI verhindert das;
    // defensiv leere Defaults statt Absturz.
    return {
      angebotsfristKT: 0,
      teilnahmefristKT: undefined,
      bieterfragenVorAngebotKT: WERTE.bieterfragenVorAngebotKT,
      bewerberfragenVorTeilnahmeKT: undefined,
      klarstellungVorAngebotKT: WERTE.klarstellungVorAngebotKT,
      wartefristKT,
      optimiertesAngebotKT: undefined,
      finalesAngebotKT: undefined,
    };
  }
  const a = profil.angebotsfrist;

  // Dringlichkeit ersetzt die Standardfrist samt Modifikatoren; sonst
  // Standard + elektronisch + Ortsbegehung.
  const angebotsfristKT =
    optionen.dringlichkeit && a.dringlichkeitKT !== undefined
      ? a.dringlichkeitKT
      : a.standardKT +
        (optionen.elektronischeAbgabe ? a.elektronischKT : 0) +
        (optionen.ortsbegehung ? a.ortsbegehungKT : 0);

  return {
    angebotsfristKT,
    teilnahmefristKT: profil.teilnahmefrist
      ? teilnahmefristEffektivKT(profil.teilnahmefrist, optionen)
      : undefined,
    bieterfragenVorAngebotKT: WERTE.bieterfragenVorAngebotKT,
    // Bewerberfragen nur bei vorgeschaltetem Teilnahmewettbewerb (Kern 1.9.0)
    bewerberfragenVorTeilnahmeKT: profil.teilnahmefrist ? WERTE.bewerberfragenVorTeilnahmeKT : undefined,
    klarstellungVorAngebotKT: WERTE.klarstellungVorAngebotKT,
    wartefristKT,
    optimiertesAngebotKT: profil.verhandlungsrunden ? WERTE.optimiertesAngebotKT : undefined,
    finalesAngebotKT: profil.verhandlungsrunden ? WERTE.finalesAngebotKT : undefined,
  };
}
