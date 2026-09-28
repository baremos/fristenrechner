/**
 * Fristenrechner Vergabe — öffentliche API des Rechenkerns
 *
 * Oberflächen bauen ausschließlich gegen diese Datei.
 * Vereinbarungen:
 *  - Datumswerte ausschließlich als ISO-String `YYYY-MM-DD`, keine Date-Objekte
 *  - reine Funktion `calculateSchedule(input): ScheduleResult` ohne Seiteneffekte
 *  - Meilensteine mit stabiler ID, Phase, Abhängigkeiten, Fristtyp, Quelle, Warnungen
 *  - versioniertes JSON-Schema für Import/Export (`ProjektDatei`)
 *
 * Gesetzliche Werte tragen ihre Rechtsgrundlage, Praxiswerte sind als solche
 * gekennzeichnet (siehe `fristen.ts`). Regelversion und Rechtsstand stehen in
 * jedem Ergebnis und in jeder Projektdatei.
 */

/** ISO-Datum `YYYY-MM-DD` (lokale Zeitzone irrelevant — reine Kalenderarithmetik). */
export type ISODate = string;

/**
 * Vergabeordnung (Rechtsrahmen) — bestimmt die hinterlegten Mindestfristen
 * und Normzitate (Oberschwelle seit Kern 1.5.0, Unterschwelle und
 * Konzessionen seit Kern 1.6.0):
 *
 *  Oberschwellenbereich (GWB Teil 4, Wartefrist § 134 GWB):
 *  - `vgv`      Liefer-/Dienstleistungen, klassische Auftraggeber (VgV)
 *  - `vob_a_eu` Bauleistungen, 2. Abschnitt der VOB/A (EU-Vergabe)
 *  - `sektvo`   Sektorenauftraggeber (SektVO)
 *  - `vsvgv`    Verteidigung und Sicherheit (VSVgV)
 *  - `konzvgv`  Konzessionen (KonzVgV)
 *
 *  Unterschwellenbereich (kein GWB Teil 4 — KEINE Wartefrist § 134 GWB;
 *  landesrechtliche Informations-/Wartepflichten möglich, siehe Hinweise):
 *  - `uvgo`     Liefer-/Dienstleistungen (UVgO)
 *  - `vob_a_1`  Bauleistungen, 1. Abschnitt der VOB/A
 */
export type Vergabeordnung =
  | 'vgv'
  | 'vob_a_eu'
  | 'sektvo'
  | 'vsvgv'
  | 'konzvgv'
  | 'uvgo'
  | 'vob_a_1';

/**
 * Verfahrensarten (strukturelle Schlüssel — die angezeigten Namen kommen aus
 * dem jeweiligen Verfahrensprofil, z. B. heißt `offen` in der UVgO
 * „Öffentliche Ausschreibung"). Nicht jede Verfahrensart ist in jeder
 * Vergabeordnung verfügbar — maßgeblich sind die Profile in `VERFAHREN`.
 *
 *  - `offen`               einstufig, öffentliche Bekanntmachung, kein Verhandeln
 *  - `nicht_offen_mit_tnw` zweistufig (Teilnahmewettbewerb), kein Verhandeln
 *  - `beschraenkt_ohne_tnw` einstufig ohne Bekanntmachung (Aufforderung an
 *                          ausgewählte Unternehmen), kein Verhandeln — nur
 *                          Unterschwelle (Beschränkte Ausschreibung ohne TNW)
 *  - `verhandlung_mit_tnw` zweistufig, Verhandlungen zulässig
 *  - `verhandlung_ohne_tnw` einstufig ohne Bekanntmachung, Verhandlungen
 *                          zulässig (UVgO: Verhandlungsvergabe ohne TNW;
 *                          VOB/A 1: Freihändige Vergabe)
 *
 * Hinweis: Ein „nicht offenes Verfahren ohne Teilnahmewettbewerb" gibt es im
 * Oberschwellenbereich nicht (§ 119 Abs. 2 Satz 1 GWB: das nicht offene
 * Verfahren erfordert stets einen Teilnahmewettbewerb). Die einstufige
 * Variante mit Verhandlungen heißt hier wie im Gesetz Verhandlungsverfahren
 * ohne Teilnahmewettbewerb (§ 14 Abs. 4 VgV). Im Unterschwellenbereich
 * existiert die einstufige Variante ohne Verhandlungen dagegen als
 * „Beschränkte Ausschreibung ohne Teilnahmewettbewerb"
 * (`beschraenkt_ohne_tnw`, seit Kern 1.6.0).
 */
export type Verfahrensart =
  | 'offen'
  | 'nicht_offen_mit_tnw'
  | 'beschraenkt_ohne_tnw'
  | 'verhandlung_ohne_tnw'
  | 'verhandlung_mit_tnw';

/** ISO-3166-2-DE-Kürzel des Bundeslands (Sitz der Vergabestelle). */
export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

/** Einheit einer Frist. KT = Kalendertage, AT = Arbeitstage (Mo–Fr ohne Feiertage). */
export type Einheit = 'KT' | 'AT';

/** Herkunft/Verbindlichkeit eines Termins. */
export type FristTyp =
  | 'gesetzlich'   // unmittelbar aus GWB/VgV/EU-Recht, mit Rechtsgrundlage
  | 'praxis'       // Praxiswert, änderbar, ohne Normbindung
  | 'intern'       // frei geplante interne Bearbeitungszeit
  | 'eingabe';     // vom Nutzer direkt gesetzter Termin

export interface ProjektKopf {
  kunde?: string;
  projektname?: string;
  vergabenummer?: string;
}

/**
 * Termin mit Dauer (z. B. Teststellung, Bieterpräsentation, Verhandlung).
 * WORKDAY-Semantik: der Starttag zählt als erster Arbeitstag
 * (Ende = WORKDAY(Start, Dauer−1)).
 */
export interface TerminMitDauer {
  aktiv: boolean;
  /** Dauer in Arbeitstagen — der Starttag zählt als erster Arbeitstag. */
  dauerAT: number;
  /** Optionaler fester Starttermin; sonst berechnet der Kern den Default. */
  start?: ISODate;
}

/** Verfahrens-Optionen; die Auswirkungen hängen von Vergabeordnung und Verfahrensart ab. */
export interface Optionen {
  /** Elektronische Angebotsabgabe zulässig (Fristverkürzung, z. B. § 15 Abs. 4 VgV). */
  elektronischeAbgabe: boolean;
  /** Ortsbesichtigung/Einsichtnahme erforderlich (§ 20 Abs. 2 VgV: auskömmliche Fristbemessung). */
  ortsbegehung: boolean;
  /** Hinreichend begründete Dringlichkeit (verkürzte Mindestfristen). */
  dringlichkeit: boolean;
  /** Versandart der Bieterinformation nach § 134 GWB — bestimmt die Wartefrist (elektronisch/Fax: 10 KT, postalisch: 15 KT). */
  versandBieterinformation: 'elektronisch' | 'postalisch';
  /**
   * Uhrzeit des Abgabe-/Eingangstermins im Format `HH:MM` (z. B. "10:00"),
   * seit Kern 1.8.0. Ohne Angabe endet jede Kalendertagsfrist mit Ablauf
   * ihres letzten Tages (24:00 Uhr — Art. 3 Abs. 2 Buchst. b VO 1182/71 bzw.
   * § 188 Abs. 1 BGB); der bisherige Rechenweg bleibt dann unverändert. Mit
   * Uhrzeit läge der Schlusstermin VOR dem Ablauf des letzten Fristtags —
   * damit die volle Frist gewahrt bleibt, legt der Kern jeden Abgabe-/
   * Eingangstermin (Teilnahmeanträge, (Erst-)Angebote, optimierte und finale
   * Angebote) auf den nächsten Arbeitstag NACH dem rechnerischen Fristende;
   * alle Folgetermine verschieben sich entsprechend.
   */
  abgabeUhrzeit?: string;
  /** Teststellung/Proof of Concept nach Angebotsbewertung; Default-Start: nächster Arbeitstag nach der Aufforderung. */
  teststellung: TerminMitDauer;
  /**
   * Bieterpräsentation als Termin MIT Dauer; setzt die vorherige Bewertung
   * der Angebote voraus — sie dient der Verifikation der Angebotsbewertung.
   * Verortung: im Verhandlungsverfahren nach der Bewertung der Erstangebote
   * (Phase „verhandlung"), sonst nach dem Bewertungsende (Phase
   * „bewertung"). In allen Verfahrensarten zulässig — im offenen/nicht
   * offenen Verfahren nur als reine Aufklärung ohne Änderung der Angebote
   * (§ 15 Abs. 5 VgV; nicht offen: § 16 Abs. 9 VgV).
   */
  praesentation?: TerminMitDauer;
  /**
   * Verhandlungsrunde 1: zeigt Optimierungspotentiale auf; setzt die Bewertung
   * der Erstangebote voraus. Kette seit Kern 1.9.0: Bewertung der
   * Erstangebote → Versand der Einladung (`einladungVersandAT`) → Runde
   * (Default-Start: nächster Arbeitstag nach der Einladung) → Anpassung der
   * Vergabeunterlagen (`vuAnpassungRunde1AT`) → Versand der Aufforderung
   * (`aufforderungVersandAT`) → die KT-Frist der nächsten Angebotsrunde läuft
   * ab dem Versand der Aufforderung. Die nächste Runde sind die optimierten
   * Angebote (`optimiertesAngebotKT` > 0) oder — Eingabeweise „optimiert leer,
   * final n" — direkt die finalen Angebote. Außerhalb des Verhandlungsverfahrens
   * erzeugt `aktiv: true` eine Warnung (Verhandlungsverbot, § 15 Abs. 5 Satz 2
   * VgV; nicht offen: § 16 Abs. 9 VgV). Maximal 2 Runden.
   */
  verhandlungRunde1?: TerminMitDauer;
  /**
   * Verhandlungsrunde 2 (nur mit optimierten UND finalen Angeboten); setzt
   * die Bewertung der optimierten Angebote voraus. Kette wie Runde 1
   * (Einladung → Runde → `vuAnpassungRunde2AT` → Aufforderung → finale
   * Angebote ab dem Versand der Aufforderung).
   */
  verhandlungRunde2?: TerminMitDauer;
}

/**
 * Überschreibbare Fristwerte. Jeder Wert hat einen verifizierten Default
 * (siehe `defaultFristen(verfahrensart, optionen)`); die UI zeigt Default an
 * und lässt Überschreiben zu — Unterschreiten gesetzlicher Mindestfristen
 * erzeugt eine Warnung im Ergebnis, wird aber nicht blockiert.
 */
export interface FristWerte {
  /** Angebotsfrist (bzw. Erstangebotsfrist) in KT ab Fristauslöser. */
  angebotsfristKT?: number;
  /** Teilnahmefrist in KT (nur zweistufige Verfahren). */
  teilnahmefristKT?: number;
  /** Ende Bieterfragen: KT vor Ablauf der (Erst-)Angebotsfrist. */
  bieterfragenVorAngebotKT?: number;
  /**
   * Ende Bewerberfragen im Teilnahmewettbewerb: KT vor Ablauf der
   * Teilnahmefrist (nur zweistufige Verfahren; Praxiswert, Default 8,
   * seit Kern 1.9.0).
   */
  bewerberfragenVorTeilnahmeKT?: number;
  /** Versand letzter Auskünfte/Klarstellungen: KT vor Ablauf der Angebotsfrist. */
  klarstellungVorAngebotKT?: number;
  /** Wartefrist § 134 GWB in KT — Default folgt aus `versandBieterinformation`; Override nur nach oben sinnvoll. */
  wartefristKT?: number;
  /**
   * Verhandlungsverfahren: Frist für optimierte Angebote in KT (Praxiswert,
   * keine Norm). Seit Kern 1.9.0 läuft sie ab dem Versand der Aufforderung
   * (`optimiertes_angebot_aufforderung`), der auf das Ende der
   * Verhandlungsrunde 1 bzw. — ohne geplante Runde — auf die Bewertung der
   * Erstangebote folgt (jeweils + Anpassung der Vergabeunterlagen +
   * `aufforderungVersandAT`). 0 = Runde entfällt. Ist keine Frist für finale
   * Angebote gesetzt, heißen diese Angebote im Ergebnis „finale Angebote".
   */
  optimiertesAngebotKT?: number;
  /**
   * Verhandlungsverfahren: Frist für finale Angebote in KT (Praxiswert,
   * keine Norm). Läuft ab dem Versand der Aufforderung
   * (`finales_angebot_aufforderung`) nach dem Ende der Verhandlungsrunde 2
   * bzw. der Bewertung der optimierten Angebote; ohne optimierte Runde
   * („optimiert leer, final n") nach Verhandlungsrunde 1 bzw. der Bewertung
   * der Erstangebote. 0 = Runde entfällt.
   */
  finalesAngebotKT?: number;
  /** Bindefrist: ENTWEDER Dauer in KT ab (letzter) Angebotsabgabe ODER fester Endtermin (XOR, typseitig erzwungen). */
  bindefrist?: { tage: number; termin?: never } | { termin: ISODate; tage?: never };
}

/** Interne Bearbeitungszeiten in Arbeitstagen. */
export interface InterneFristen {
  bewertungAT: number;
  aufklaerungEntscheidungAT: number;
  internerZuschlagAT: number;
  teststellungAuswertungAT: number;
  /** Bewertung der Teilnahmeanträge (nur zweistufige Verfahren); Default: bewertungAT. */
  teilnahmeBewertungAT?: number;
  /**
   * Interne Bearbeitungszeit (AT) zwischen interner Zuschlagsentscheidung und
   * Absendung der Bieterinformation nach § 134 Abs. 1 GWB.
   * Default 0 = Versand am Tag der internen Zuschlagsentscheidung.
   */
  infoVersandAT?: number;
  /**
   * Bewertung der Erst- bzw. optimierten Angebote (AT) vor Präsentation/
   * Verhandlungsrunde im Verhandlungsverfahren: Präsentation und Verhandlung
   * setzen die Angebotsbewertung voraus.
   * Default: `bewertungAT`.
   */
  zwischenbewertungAT?: number;
  /**
   * Versand einer Aufforderung (zur Angebotsabgabe nach dem Teilnahme-
   * wettbewerb, zur Teststellung, zur Abgabe optimierter/finaler Angebote)
   * n AT nach dem jeweiligen Bewertungs- bzw. Vorbereitungsende.
   * Default 1 (bis Kern 1.8.0 fiel der Versand der Angebotsaufforderung auf
   * den Tag des Bewertungsendes). 0 = Versand am selben Tag.
   */
  aufforderungVersandAT?: number;
  /**
   * Versand der Einladung zur Bieterverhandlung n AT nach dem Ende der
   * Bewertung der (Erst-/optimierten) Angebote bzw. der Bieterpräsentation
   * (seit Kern 1.9.0). Default 1.
   */
  einladungVersandAT?: number;
  /**
   * Anpassung der Vergabeunterlagen (AT) vor der ERSTEN weiteren
   * Angebotsrunde (optimierte Angebote bzw. — Eingabeweise „optimiert leer,
   * final n" — direkt finale Angebote): nach dem Ende der Verhandlungsrunde 1
   * oder, ohne geplante Runde, nach der Bewertung der Erstangebote (seit
   * Kern 1.9.0; die Anpassung gilt unabhängig vom Verhandlungstermin).
   * Default 2 (Praxiswert).
   */
  vuAnpassungRunde1AT?: number;
  /**
   * Anpassung der Vergabeunterlagen (AT) vor der ZWEITEN weiteren
   * Angebotsrunde (finale Angebote nach optimierten Angeboten): nach dem
   * Ende der Verhandlungsrunde 2 oder, ohne geplante Runde 2, nach der
   * Bewertung der optimierten Angebote (die Anpassung gilt auch ohne
   * Verhandlungstermin). Ohne optimierte Runde nicht verwendet.
   * Default 2 (Praxiswert).
   */
  vuAnpassungRunde2AT?: number;
}

export interface ScheduleInput {
  /**
   * Vergabeordnung; fehlt der Wert (Projektdateien aus Kern < 1.5.0), gilt
   * `vgv` — das war bis dahin der einzige abgebildete Rechtsrahmen.
   */
  vergabeordnung?: Vergabeordnung;
  verfahrensart: Verfahrensart;
  bundesland: Bundesland;
  /** Starttermin = Tag der Absendung der (Auftrags-)Bekanntmachung bzw. der Aufforderung (ohne TNW). */
  bekanntmachung: ISODate;
  /**
   * Nur zweistufige Verfahren: optionaler FESTER Termin für den Versand der
   * Aufforderung zur Angebotsabgabe (Start der Angebotsphase), seit
   * Kern 1.7.0. Ohne Angabe berechnet der Kern den Termin aus
   * Teilnahmefristende + `teilnahmeBewertungAT` (Meilenstein
   * `teilnahme_bewertung_ende`) + `aufforderungVersandAT` (seit Kern 1.9.0,
   * Default 1 AT). Liegt der feste Termin vor dem Ablauf der Teilnahmefrist,
   * entsteht ein `Startkonflikt` (Muster seit Kern 1.4.0); der
   * frühestmögliche Termin steht in `fruehesteStarts.angebotsaufforderung`
   * (min-Attribut der UI).
   */
  angebotsaufforderung?: ISODate;
  optionen: Optionen;
  /** Leer ⇒ verifizierte Defaults. */
  fristen?: FristWerte;
  interneFristen: InterneFristen;
  projekt?: ProjektKopf;
}

export interface Meilenstein {
  /**
   * Stabile, verfahrensunabhängig eindeutige ID (z. B. "angebotsabgabe").
   * Seit Kern 1.9.0 zusätzlich: `bewerberfragen_ende`, `teilnahme_bewertung_ende`
   * (Bewertung der Teilnahmeanträge, davon getrennt `angebotsaufforderung` =
   * Versand), `verhandlung1_einladung`/`verhandlung2_einladung`,
   * `optimiertes_angebot_vorbereitung_ende`/`finales_angebot_vorbereitung_ende`
   * (Anpassung der Vergabeunterlagen) und `optimiertes_angebot_aufforderung`/
   * `finales_angebot_aufforderung`; `zwischenbewertung_erstangebote` bzw.
   * `zwischenbewertung_optimierte` erscheinen vor jeder weiteren Angebotsrunde.
   */
  id: string;
  label: string;
  phase: 'einholung' | 'teilnahmewettbewerb' | 'verhandlung' | 'bewertung' | 'teststellung' | 'zuschlag';
  datum: ISODate;
  fristTyp: FristTyp;
  /** IDs der Meilensteine, aus denen dieser berechnet wurde. */
  abhaengigVon: string[];
  /** Exakte Norm, nur bei fristTyp 'gesetzlich' (z. B. "§ 15 Abs. 2 VgV"). */
  rechtsgrundlage?: string;
  /** Transparenter Rechenweg, z. B. "35 KT ab 01.09.2026; Fristende Sa → nächster Arbeitstag (Mo 07.10.2026)". */
  rechenweg: string;
  /** Warnungen zu genau diesem Termin (z. B. "unterschreitet gesetzliche Mindestfrist"). */
  warnungen: string[];
  /**
   * Nur bei Terminen mit Dauer (Teststellung, Präsentation, Verhandlung),
   * gesetzt auf dem Start-Meilenstein: letzter Tag des Zeitraums.
   * Die UI stellt solche Meilensteine als Zeitraum „von–bis (n AT)" dar.
   */
  bis?: ISODate;
  /** Nur zusammen mit `bis`: Dauer in Arbeitstagen (Starttag zählt mit). */
  dauerAT?: number;
}

/**
 * Phasen-Gruppierung für die Zeitschiene.
 * Chronologisch segmentiert: Bei jedem Phasenwechsel beginnt ein neuer Block —
 * dieselbe Phase kann daher mehrfach vorkommen (z. B. Bewertung →
 * Teststellung → Bewertung mit der Zuschlagsempfehlung).
 */
export interface PhasenBlock {
  id: Meilenstein['phase'];
  label: string;
  von: ISODate;
  bis: ISODate;
  /** IDs der enthaltenen Meilensteine in chronologischer Reihenfolge. */
  meilensteine: string[];
}

/**
 * Harter Eingabekonflikt eines festen Starttermins (seit Kern 1.4.0): Der
 * gewählte Termin liegt vor seiner fachlichen Voraussetzung — anders als bei
 * `warnungen` sollte die UI dann KEINEN Terminplan anzeigen.
 */
export interface Startkonflikt {
  /** Betroffene Verfahrensoption (Zuordnung zum Formularfeld). */
  option: 'teststellung' | 'praesentation' | 'verhandlungRunde1' | 'verhandlungRunde2' | 'angebotsaufforderung';
  /** Gewählter (zu früher) Starttermin, ISO `JJJJ-MM-TT`. */
  gewaehlt: string;
  /** Frühestmöglicher Starttermin, ISO `JJJJ-MM-TT`. */
  fruehestens: string;
  /** Vollständig formulierte Meldung für die Anzeige. */
  text: string;
}

export interface ScheduleResult {
  meilensteine: Meilenstein[];
  /** Chronologische Phasenblöcke für die Zeitschienen-Darstellung. */
  phasen: PhasenBlock[];
  /** Meilenstein-übergreifende Hinweise (z. B. Rechtsstand, Dringlichkeitsbegründung nötig). */
  warnungen: string[];
  /** Harte Eingabekonflikte fester Starttermine (seit 1.4.0). */
  konflikte: Startkonflikt[];
  /** Frühestmöglicher fester Starttermin je EINGEPLANTER Option (ISO; seit
      1.4.0) — z. B. für `min`-Attribute der Datumsfelder. Aktive Optionen,
      die mangels zugehöriger Angebotsrunde nicht eingeplant werden (z. B.
      Verhandlungsrunde 1 ohne Frist für optimierte UND finale Angebote oder
      Runde 2 ohne beide Angebotsrunden, Kern 1.9.0), erhalten keinen Eintrag
      und keinen Startkonflikt — der Kern warnt dann separat („… die Runde
      wird nicht eingeplant"). */
  fruehesteStarts: Partial<Record<Startkonflikt['option'], string>>;
  /** Regelversion, mit der gerechnet wurde (siehe `REGELVERSION`). */
  regelversion: string;
  /** Rechtsstand der hinterlegten Werte als Anzeigetext. */
  rechtsstand: string;
  /** Rechtsstand als Datum: Tag, bis zu dem die Rechtslage geprüft und bestätigt ist. */
  rechtsstandDatum: ISODate;
  /**
   * Bindefrist in beiden Darstellungen (seit Kern 1.9.0): Endtermin
   * und Dauer in Kalendertagen ab der letzten Angebotsabgabe (`basis`) —
   * unabhängig davon, welche Form eingegeben wurde. undefined ohne
   * Bindefrist-Angabe.
   */
  bindefrist?: { termin: ISODate; tage: number; basis: ISODate };
}

// ---------------------------------------------------------------------------
// Rechenkern
// ---------------------------------------------------------------------------

export { calculateSchedule } from './schedule.js';
export {
  defaultFristen,
  RECHENKERN_VERSION,
  RECHTSSTAND,
  RECHTSSTAND_DATUM,
  REGELVERSION,
  VERFAHREN,
  VERGABEORDNUNGEN,
  verfahrenFuer,
  verfahrensProfil,
} from './fristen.js';

// ---------------------------------------------------------------------------
// Kalender-Hilfsfunktionen (für UI-Anzeige, z. B. Zeitschiene/Datepicker)
// ---------------------------------------------------------------------------

export interface Feiertag {
  datum: ISODate;
  name: string;
  /** false bei Teilgebiets-Feiertagen (z. B. Fronleichnam in Teilen Sachsens). */
  landesweit: boolean;
}

export { feiertage, istArbeitstag } from './kalender.js';

// ---------------------------------------------------------------------------
// Projektdatei (Speichern, JSON-Export/Import) — versioniert
// ---------------------------------------------------------------------------

export interface ProjektDatei {
  /** Schema-Version; Importer migriert ältere Versionen oder lehnt mit Meldung ab. */
  version: 1;
  gespeichertAm: string;      // ISO-Zeitstempel
  /** Regelversion, mit der gespeichert wurde (z. B. "1.0.0") — für Nachvollziehbarkeit und Migration. */
  rechenkernVersion: string;
  /** Rechtsstand der damals hinterlegten Werte (siehe ScheduleResult.rechtsstand). */
  rechtsstand: string;
  /** Rechtsstand als Datum; fehlt in Dateien aus der Zeit vor diesem Feld. */
  rechtsstandDatum?: ISODate;
  input: ScheduleInput;
}

export { erstelleProjektDatei, parseProjektDatei } from './projekt.js';
