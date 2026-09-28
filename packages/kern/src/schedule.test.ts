import { describe, expect, it } from 'vitest';
import type { ScheduleInput } from './api.js';
import { defaultFristen } from './fristen.js';
import { addArbeitstage } from './kalender.js';
import { calculateSchedule } from './schedule.js';

function basisInput(aenderungen: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    verfahrensart: 'offen',
    bundesland: 'NW',
    bekanntmachung: '2026-09-01',
    optionen: {
      elektronischeAbgabe: true,
      ortsbegehung: false,
      dringlichkeit: false,
      versandBieterinformation: 'elektronisch',
      teststellung: { aktiv: false, dauerAT: 0 },
    },
    interneFristen: {
      bewertungAT: 10,
      aufklaerungEntscheidungAT: 5,
      internerZuschlagAT: 3,
      teststellungAuswertungAT: 5,
    },
    ...aenderungen,
  };
}

function datumVon(result: ReturnType<typeof calculateSchedule>, id: string): string | undefined {
  return result.meilensteine.find((m) => m.id === id)?.datum;
}

/** Arbeitstage addieren (NW, WORKDAY-Semantik) — Referenz für Ketten-Erwartungen. */
function addArbeitstageTest(iso: string, at: number): string {
  return addArbeitstage(iso, at, 'NW');
}

describe('defaultFristen', () => {
  const optionen = basisInput().optionen;

  it('VgV, offenes Verfahren: 35 KT, elektronisch 30, Dringlichkeit 15', () => {
    expect(defaultFristen('vgv', 'offen', { ...optionen, elektronischeAbgabe: false }).angebotsfristKT).toBe(35);
    expect(defaultFristen('vgv', 'offen', optionen).angebotsfristKT).toBe(30);
    expect(defaultFristen('vgv', 'offen', { ...optionen, elektronischeAbgabe: false, ortsbegehung: true }).angebotsfristKT).toBe(40);
    expect(defaultFristen('vgv', 'offen', { ...optionen, dringlichkeit: true, ortsbegehung: true }).angebotsfristKT).toBe(15);
    expect(defaultFristen('vgv', 'offen', optionen).teilnahmefristKT).toBeUndefined();
  });

  it('VgV, nicht offenes Verfahren: Teilnahme 30/15, Angebot 30/25/10', () => {
    const standard = defaultFristen('vgv', 'nicht_offen_mit_tnw', { ...optionen, elektronischeAbgabe: false });
    expect(standard.teilnahmefristKT).toBe(30);
    expect(standard.angebotsfristKT).toBe(30);
    expect(defaultFristen('vgv', 'nicht_offen_mit_tnw', optionen).angebotsfristKT).toBe(25);
    const dringlich = defaultFristen('vgv', 'nicht_offen_mit_tnw', { ...optionen, dringlichkeit: true });
    expect(dringlich.teilnahmefristKT).toBe(15);
    expect(dringlich.angebotsfristKT).toBe(10);
  });

  it('Wartefrist folgt der Versandart (§ 134 Abs. 2 GWB)', () => {
    expect(defaultFristen('vgv', 'offen', optionen).wartefristKT).toBe(10);
    expect(defaultFristen('vgv', 'offen', { ...optionen, versandBieterinformation: 'postalisch' }).wartefristKT).toBe(15);
  });

  it('Verhandlungsrunden nur beim Verhandlungsverfahren mit TNW vorbelegt', () => {
    const vv = defaultFristen('vgv', 'verhandlung_mit_tnw', optionen);
    // 10 KT seit Kern 1.3.1 (zuvor 20 KT)
    expect(vv.optimiertesAngebotKT).toBe(10);
    expect(vv.finalesAngebotKT).toBe(10);
    expect(defaultFristen('vgv', 'offen', optionen).optimiertesAngebotKT).toBeUndefined();
    expect(defaultFristen('vgv', 'verhandlung_ohne_tnw', optionen).optimiertesAngebotKT).toBeUndefined();
  });

  it('VOB/A-EU: Werte wie VgV (offen 35/30/15; zweistufig 30/25/15/10)', () => {
    expect(defaultFristen('vob_a_eu', 'offen', { ...optionen, elektronischeAbgabe: false }).angebotsfristKT).toBe(35);
    expect(defaultFristen('vob_a_eu', 'offen', optionen).angebotsfristKT).toBe(30);
    expect(defaultFristen('vob_a_eu', 'offen', { ...optionen, dringlichkeit: true }).angebotsfristKT).toBe(15);
    const zweistufig = defaultFristen('vob_a_eu', 'nicht_offen_mit_tnw', optionen);
    expect(zweistufig.teilnahmefristKT).toBe(30);
    expect(zweistufig.angebotsfristKT).toBe(25);
    const dringlich = defaultFristen('vob_a_eu', 'verhandlung_mit_tnw', { ...optionen, dringlichkeit: true });
    expect(dringlich.teilnahmefristKT).toBe(15);
    expect(dringlich.angebotsfristKT).toBe(10);
  });

  it('VOB/A-EU, Verhandlungsverfahren ohne TNW: kein elektronischer Abschlag', () => {
    // § 10b EU Abs. 4 wird über § 10c EU Abs. 1 nur auf das Verfahren MIT
    // Teilnahmewettbewerb übertragen — der Default bleibt bei 30 KT
    expect(defaultFristen('vob_a_eu', 'verhandlung_ohne_tnw', optionen).angebotsfristKT).toBe(30);
    // bei Dringlichkeit Vorschlag = gesetzliche Untergrenze (§ 10c EU Abs. 2)
    expect(defaultFristen('vob_a_eu', 'verhandlung_ohne_tnw', { ...optionen, dringlichkeit: true }).angebotsfristKT).toBe(10);
  });

  it('SektVO: offen 35/30/15; zweistufig 30 + Angebots-Praxiswert 30 ohne E-Verkürzung, keine Dringlichkeitsfristen', () => {
    expect(defaultFristen('sektvo', 'offen', { ...optionen, elektronischeAbgabe: false }).angebotsfristKT).toBe(35);
    expect(defaultFristen('sektvo', 'offen', optionen).angebotsfristKT).toBe(30);
    expect(defaultFristen('sektvo', 'offen', { ...optionen, dringlichkeit: true }).angebotsfristKT).toBe(15);
    const zweistufig = defaultFristen('sektvo', 'nicht_offen_mit_tnw', optionen);
    expect(zweistufig.teilnahmefristKT).toBe(30);
    expect(zweistufig.angebotsfristKT).toBe(30); // keine elektronische Verkürzung in § 15 SektVO
    const dringlich = defaultFristen('sektvo', 'verhandlung_mit_tnw', { ...optionen, dringlichkeit: true });
    expect(dringlich.teilnahmefristKT).toBe(30); // § 15 SektVO kennt keine Dringlichkeitsverkürzung
    expect(dringlich.angebotsfristKT).toBe(30);
    // Auch ohne TNW kein Dringlichkeits-Sprung
    expect(defaultFristen('sektvo', 'verhandlung_ohne_tnw', { ...optionen, dringlichkeit: true }).angebotsfristKT).toBe(30);
  });

  it('VSVgV: Teilnahme 37/−7 elektronisch, dringlich 15 bzw. 10; Angebot nicht offen 40/−5, dringlich 10', () => {
    const papier = defaultFristen('vsvgv', 'nicht_offen_mit_tnw', { ...optionen, elektronischeAbgabe: false });
    expect(papier.teilnahmefristKT).toBe(37);
    expect(papier.angebotsfristKT).toBe(40);
    const elektronisch = defaultFristen('vsvgv', 'nicht_offen_mit_tnw', optionen);
    expect(elektronisch.teilnahmefristKT).toBe(30); // § 20 Abs. 4 Satz 1 VSVgV
    expect(elektronisch.angebotsfristKT).toBe(35); // § 20 Abs. 4 Satz 2 VSVgV
    const dringlichPapier = defaultFristen('vsvgv', 'nicht_offen_mit_tnw', { ...optionen, elektronischeAbgabe: false, dringlichkeit: true });
    expect(dringlichPapier.teilnahmefristKT).toBe(15);
    expect(dringlichPapier.angebotsfristKT).toBe(10);
    const dringlichElektronisch = defaultFristen('vsvgv', 'nicht_offen_mit_tnw', { ...optionen, dringlichkeit: true });
    expect(dringlichElektronisch.teilnahmefristKT).toBe(10); // § 20 Abs. 2 Satz 2 VSVgV
    // Verhandlungsverfahren: Erstangebots-Praxiswert bleibt bei Dringlichkeit
    // unverändert — § 20 Abs. 3 VSVgV gilt nur für das nicht offene
    // Verfahren
    const vvDringlich = defaultFristen('vsvgv', 'verhandlung_mit_tnw', { ...optionen, dringlichkeit: true });
    expect(vvDringlich.teilnahmefristKT).toBe(10);
    expect(vvDringlich.angebotsfristKT).toBe(30);
  });
});

describe('calculateSchedule — offenes Verfahren (handgerechnetes Referenzbeispiel)', () => {
  // Bekanntmachung Di 01.09.2026, elektronisch (30 KT), NW, Bewertung 10 AT,
  // Aufklärung 5 AT, interner Zuschlag 3 AT, Wartefrist 10 KT.
  const result = calculateSchedule(basisInput());

  it('berechnet die komplette Terminkette korrekt', () => {
    expect(datumVon(result, 'bekanntmachung')).toBe('2026-09-01');
    expect(datumVon(result, 'bieterfragen_ende')).toBe('2026-09-23'); // 01.10. − 8 KT (Mi)
    expect(datumVon(result, 'klarstellung_versand')).toBe('2026-09-24'); // 01.10. − 7 KT (Do)
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-10-01'); // 01.09. + 30 KT (Do)
    expect(datumVon(result, 'bewertung_ende')).toBe('2026-10-15'); // + 10 AT
    expect(datumVon(result, 'zuschlagsempfehlung')).toBe('2026-10-22'); // + 5 AT
    expect(datumVon(result, 'interner_zuschlag')).toBe('2026-10-27'); // + 3 AT
    // Default: Versand am Tag der internen Zuschlagsentscheidung
    expect(datumVon(result, 'bieterinformation')).toBe('2026-10-27');
    expect(result.meilensteine.find((m) => m.id === 'bieterinformation')!.rechenweg).toContain(
      'am Tag der internen Zuschlagsentscheidung'
    );
  });

  it('Zuschlag: rechnerischer Folgetag Sa → nächster Arbeitstag Mo', () => {
    expect(datumVon(result, 'wartefrist_ende')).toBe('2026-11-06'); // Fr (10 KT ab 27.10.)
    expect(datumVon(result, 'zuschlag')).toBe('2026-11-09'); // Folgetag Sa → Arbeitstag Mo
  });

  it('liefert chronologisch sortierte Meilensteine und Phasenblöcke', () => {
    const daten = result.meilensteine.map((m) => m.datum);
    expect([...daten].sort()).toEqual(daten);
    expect(result.phasen.map((p) => p.id)).toEqual(['einholung', 'bewertung', 'zuschlag']);
    const einholung = result.phasen[0];
    expect(einholung.von).toBe('2026-09-01');
    expect(einholung.bis).toBe('2026-10-01');
    expect(einholung.meilensteine).toEqual(['bekanntmachung', 'bieterfragen_ende', 'klarstellung_versand', 'angebotsabgabe']);
  });

  it('Zuschlagsempfehlung gehört zur Bewertungsphase', () => {
    const empfehlung = result.meilensteine.find((m) => m.id === 'zuschlagsempfehlung')!;
    expect(empfehlung.phase).toBe('bewertung');
    // Zuschlagsphase beginnt erst mit der internen Zuschlagsentscheidung
    const zuschlagBlock = result.phasen.find((p) => p.id === 'zuschlag')!;
    expect(zuschlagBlock.meilensteine[0]).toBe('interner_zuschlag');
  });

  it('trägt Normen und Rechenwege', () => {
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.rechtsgrundlage).toBe('§ 15 Abs. 2 VgV');
    expect(abgabe.rechenweg).toContain('30 Kalendertage');
    const warte = result.meilensteine.find((m) => m.id === 'wartefrist_ende')!;
    expect(warte.rechtsgrundlage).toContain('§ 134 Abs. 2');
    expect(result.rechtsstand).toContain('2026');
  });
});

describe('calculateSchedule — Fristverschiebung und Warnungen', () => {
  it('verschiebt ein Angebotsfristende von Sa/Feiertag auf den nächsten Arbeitstag', () => {
    // 03.09.2026 (Do) + 30 KT = 03.10.2026 (Tag der Deutschen Einheit, Samstag) → Mo 05.10.
    const result = calculateSchedule(basisInput({ bekanntmachung: '2026-09-03' }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.datum).toBe('2026-10-05');
    expect(abgabe.rechenweg).toContain('nächster Arbeitstag');
  });

  it('warnt bei Unterschreitung der gesetzlichen Mindest-Angebotsfrist', () => {
    const result = calculateSchedule(basisInput({ fristen: { angebotsfristKT: 25 } }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.warnungen.join(' ')).toContain('Mindestfrist von 30 KT');
    expect(abgabe.warnungen.join(' ')).toContain('§ 15');
  });

  it('warnt bei Klarstellungsfrist unter dem gesetzlichen Minimum (§ 20 Abs. 3 VgV)', () => {
    const result = calculateSchedule(basisInput({ fristen: { klarstellungVorAngebotKT: 5 } }));
    const ks = result.meilensteine.find((m) => m.id === 'klarstellung_versand')!;
    expect(ks.warnungen.join(' ')).toContain('§ 20 Abs. 3');
  });

  it('4-KT-Klarstellungsminimum nur bei gesetzlich beschleunigten Verfahren', () => {
    // Offenes Verfahren + Dringlichkeit: Minimum 4 KT ⇒ 5 KT sind zulässig
    const beschleunigt = basisInput({ fristen: { klarstellungVorAngebotKT: 5 } });
    beschleunigt.optionen.dringlichkeit = true;
    const okErgebnis = calculateSchedule(beschleunigt);
    expect(okErgebnis.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen).toEqual([]);

    // VV ohne TNW + Dringlichkeit: kein Fall des § 20 Abs. 3 ⇒ Minimum bleibt 6 KT
    const ohneTnw = basisInput({ verfahrensart: 'verhandlung_ohne_tnw', fristen: { klarstellungVorAngebotKT: 5 } });
    ohneTnw.optionen.dringlichkeit = true;
    const warnErgebnis = calculateSchedule(ohneTnw);
    expect(
      warnErgebnis.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen.join(' ')
    ).toContain('spätestens 6 KT');
  });

  it('warnt, wenn die Bindefrist vor dem frühestmöglichen Zuschlag abläuft', () => {
    const result = calculateSchedule(basisInput({ fristen: { bindefrist: { termin: '2026-10-30' } } }));
    expect(result.warnungen.join(' ')).toContain('Bindefrist');
    expect(datumVon(result, 'bindefrist_ende')).toBe('2026-10-30');
  });

  it('meldet Dringlichkeit als Dokumentationspflicht', () => {
    const input = basisInput();
    input.optionen.dringlichkeit = true;
    expect(calculateSchedule(input).warnungen.join(' ')).toContain('Dringlichkeit');
  });
});

describe('calculateSchedule — zweistufige Verfahren und Verhandlungsrunden', () => {
  it('nicht offenes Verfahren: Teilnahmewettbewerb vor der Angebotsphase', () => {
    const input = basisInput({ verfahrensart: 'nicht_offen_mit_tnw' });
    input.interneFristen.teilnahmeBewertungAT = 5;
    const result = calculateSchedule(input);

    // 01.09. + 30 KT = 01.10. (Do, AT) → Teilnahmefristende
    expect(datumVon(result, 'teilnahmefrist_ende')).toBe('2026-10-01');
    // + 5 AT = 08.10. → Bewertungsende; Versand der Aufforderung +1 AT (seit
    // Kern 1.9.0) = Fr 09.10.; + 25 KT (elektronisch) = 03.11. (Di, AT)
    expect(datumVon(result, 'teilnahme_bewertung_ende')).toBe('2026-10-08');
    expect(datumVon(result, 'angebotsaufforderung')).toBe('2026-10-09');
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-11-03');
    expect(result.phasen[0].id).toBe('teilnahmewettbewerb');
    const tf = result.meilensteine.find((m) => m.id === 'teilnahmefrist_ende')!;
    expect(tf.rechtsgrundlage).toBe('§ 16 Abs. 2 VgV');
  });

  it('Verhandlungsverfahren mit TNW: Erstangebot → optimierte → finale Angebote, Bewertung ab letzter Runde', () => {
    const result = calculateSchedule(basisInput({ verfahrensart: 'verhandlung_mit_tnw' }));
    const erst = datumVon(result, 'angebotsabgabe')!;
    const optimiert = datumVon(result, 'optimiertes_angebot')!;
    const final = datumVon(result, 'finales_angebot')!;
    expect(erst < optimiert && optimiert < final).toBe(true);
    const bewertung = result.meilensteine.find((m) => m.id === 'bewertung_ende')!;
    expect(bewertung.abhaengigVon).toEqual(['finales_angebot']);
  });

  it('0 KT entfernt Verhandlungsrunden auch bei verhandlung_mit_tnw', () => {
    const result = calculateSchedule(
      basisInput({ verfahrensart: 'verhandlung_mit_tnw', fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 0 } })
    );
    expect(datumVon(result, 'optimiertes_angebot')).toBeUndefined();
    expect(datumVon(result, 'finales_angebot')).toBeUndefined();
    const bewertung = result.meilensteine.find((m) => m.id === 'bewertung_ende')!;
    expect(bewertung.abhaengigVon).toEqual(['angebotsabgabe']);
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.label).toContain('Angebotsfrist');
    expect(abgabe.label).not.toContain('Erstangebot');
  });

  it('Verhandlungsverfahren ohne TNW: einstufig, Praxisfrist ohne Norm, Hinweis auf § 14 Abs. 4 VgV', () => {
    const result = calculateSchedule(basisInput({ verfahrensart: 'verhandlung_ohne_tnw' }));
    expect(datumVon(result, 'teilnahmefrist_ende')).toBeUndefined();
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.fristTyp).toBe('praxis');
    expect(abgabe.rechtsgrundlage).toBeUndefined();
    expect(result.warnungen.join(' ')).toContain('§ 14 Abs. 4 VgV');
  });
});

describe('calculateSchedule — Bieterinformation, Präsentation & Verhandlung', () => {
  it('infoVersandAT verschiebt den Versand der Bieterinformation; Wartefrist-Ende am Samstag rückt risikoarm auf Montag (Kern 1.3.0)', () => {
    const input = basisInput();
    input.interneFristen.infoVersandAT = 1;
    const result = calculateSchedule(input);
    expect(datumVon(result, 'bieterinformation')).toBe('2026-10-28'); // interner Zuschlag 27.10. + 1 AT
    expect(datumVon(result, 'wartefrist_ende')).toBe('2026-11-09'); // rechnerisch Sa 07.11. → nächster Arbeitstag Mo (wie OLG Bremen, 2 Verg 1/22)
    expect(datumVon(result, 'zuschlag')).toBe('2026-11-10'); // Folgetag Di
  });

  it('Wartefrist-Ende an einem Feiertag rückt auf den nächsten Arbeitstag (Pfingstmontag, Kern 1.3.0)', () => {
    // Kette: Bekanntmachung Sa 13.03.2027 + 30 KT (elektronisch) = Mo 12.04.
    // → Bewertung +10 AT = Mo 26.04. → Aufklärung +5 AT = Mo 03.05.
    // → interner Zuschlag +3 AT (Christi Himmelfahrt 06.05. übersprungen)
    //   = Fr 07.05. = Info-Versand
    // → Wartefrist +10 KT = Mo 17.05.2027 (Pfingstmontag) → Di 18.05.
    const result = calculateSchedule(basisInput({ bekanntmachung: '2027-03-13' }));
    expect(datumVon(result, 'bieterinformation')).toBe('2027-05-07');
    expect(datumVon(result, 'wartefrist_ende')).toBe('2027-05-18');
    expect(datumVon(result, 'zuschlag')).toBe('2027-05-19');
  });

  it('offenes Verfahren: Vorbewertung → Präsentation → Bewertung abgeschlossen', () => {
    const input = basisInput();
    input.optionen.praesentation = { aktiv: true, dauerAT: 3 };
    const result = calculateSchedule(input);
    // Angebotsabgabe Do 01.10. → Vorbewertung +10 AT (Default bewertungAT) = Do 15.10.
    expect(datumVon(result, 'vorbewertung_ende')).toBe('2026-10-15');
    const start = result.meilensteine.find((m) => m.id === 'praesentation_start')!;
    expect(start.datum).toBe('2026-10-16'); // nächster AT nach der Vorbewertung
    expect(start.bis).toBe('2026-10-20'); // 3 AT inkl. Starttag (Fr, Mo, Di)
    expect(start.dauerAT).toBe(3);
    expect(start.phase).toBe('bewertung');
    expect(start.warnungen).toEqual([]); // Aufklärung ist auch im offenen Verfahren zulässig
    // Bewertung abgeschlossen: 1 AT nach dem Präsentationsende, Kette hängt daran
    const bewertung = result.meilensteine.find((m) => m.id === 'bewertung_ende')!;
    expect(bewertung.datum).toBe('2026-10-21');
    expect(bewertung.abhaengigVon).toEqual(['praesentation_ende']);
  });

  it('Verhandlungsverfahren: Bewertung der Erstangebote → Präsentation → Runde 1 → optimierte Angebote ab Verhandlungsende', () => {
    const input = basisInput({ verfahrensart: 'verhandlung_mit_tnw' });
    input.optionen.praesentation = { aktiv: true, dauerAT: 2 };
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 5 };
    const result = calculateSchedule(input);

    const zb = result.meilensteine.find((m) => m.id === 'zwischenbewertung_erstangebote')!;
    expect(zb.phase).toBe('verhandlung');
    expect(zb.abhaengigVon).toEqual(['angebotsabgabe']);

    const praes = result.meilensteine.find((m) => m.id === 'praesentation_start')!;
    expect(praes.abhaengigVon).toEqual(['zwischenbewertung_erstangebote']);
    expect(praes.phase).toBe('verhandlung');

    // Kern 1.9.0: Einladung zur Verhandlung nach dem Präsentationsende, Runde 1 danach
    const einladung = result.meilensteine.find((m) => m.id === 'verhandlung1_einladung')!;
    expect(einladung.abhaengigVon).toEqual(['praesentation_ende']);
    const v1Start = result.meilensteine.find((m) => m.id === 'verhandlung1_start')!;
    expect(v1Start.abhaengigVon).toEqual(['verhandlung1_einladung']);
    expect(v1Start.warnungen).toEqual([]); // im Verhandlungsverfahren zulässig
    expect(v1Start.dauerAT).toBe(5);

    // Kette nach Runde 1: Anpassung der Vergabeunterlagen →
    // Versand der Aufforderung → optimierte Angebote laufen ab dem Versand
    const vu = result.meilensteine.find((m) => m.id === 'optimiertes_angebot_vorbereitung_ende')!;
    expect(vu.abhaengigVon).toEqual(['verhandlung1_ende']);
    const aufforderung = result.meilensteine.find((m) => m.id === 'optimiertes_angebot_aufforderung')!;
    expect(aufforderung.abhaengigVon).toEqual(['optimiertes_angebot_vorbereitung_ende']);
    const optimiert = result.meilensteine.find((m) => m.id === 'optimiertes_angebot')!;
    expect(optimiert.abhaengigVon).toEqual(['optimiertes_angebot_aufforderung']);
    expect(optimiert.phase).toBe('verhandlung');
    expect(datumVon(result, 'verhandlung1_ende')! < vu.datum && vu.datum < aufforderung.datum && aufforderung.datum < optimiert.datum).toBe(true);

    // Phasenreihenfolge mit eigenem Verhandlungsblock
    expect(result.phasen.map((p) => p.id)).toEqual(['teilnahmewettbewerb', 'einholung', 'verhandlung', 'bewertung', 'zuschlag']);
  });

  it('Verhandlungsrunde 2: Bewertung der optimierten Angebote → Runde 2 → finale Angebote ab Verhandlungsende', () => {
    const input = basisInput({ verfahrensart: 'verhandlung_mit_tnw' });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 3 };
    input.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 3 };
    const result = calculateSchedule(input);

    const zb2 = result.meilensteine.find((m) => m.id === 'zwischenbewertung_optimierte')!;
    expect(zb2.abhaengigVon).toEqual(['optimiertes_angebot']);
    // Kern 1.9.0: Einladung → Runde 2 → Anpassung VU → Aufforderung → finale Angebote
    expect(result.meilensteine.find((m) => m.id === 'verhandlung2_einladung')!.abhaengigVon).toEqual(['zwischenbewertung_optimierte']);
    const v2Start = result.meilensteine.find((m) => m.id === 'verhandlung2_start')!;
    expect(v2Start.abhaengigVon).toEqual(['verhandlung2_einladung']);
    expect(result.meilensteine.find((m) => m.id === 'finales_angebot_vorbereitung_ende')!.abhaengigVon).toEqual(['verhandlung2_ende']);
    const finales = result.meilensteine.find((m) => m.id === 'finales_angebot')!;
    expect(finales.abhaengigVon).toEqual(['finales_angebot_aufforderung']);
    expect(finales.phase).toBe('verhandlung');
    // Endbewertung hängt an den finalen Angeboten
    const bewertung = result.meilensteine.find((m) => m.id === 'bewertung_ende')!;
    expect(bewertung.abhaengigVon).toEqual(['finales_angebot']);
  });

  it('Verbotswarnung greift auch bei Runde 1 mit nur finaler Angebotsfrist (seit 1.9.0 wird die Runde eingeplant)', () => {
    // offen + Runde 1 aktiv, nur finale Angebotsfrist gesetzt: seit Kern 1.9.0
    // genügt eine weitere Angebotsrunde — die Runde wird eingeplant, die
    // § 15-Abs.-5-Warnung erscheint am Runden-Start.
    const input = basisInput({ fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 20 } });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    const result = calculateSchedule(input);
    expect(datumVon(result, 'verhandlung1_start')).toBeDefined();
    expect(result.meilensteine.find((m) => m.id === 'verhandlung1_start')!.warnungen.join(' ')).toContain('§ 15 Abs. 5');
    expect(result.meilensteine.find((m) => m.id === 'finales_angebot_vorbereitung_ende')!.abhaengigVon).toEqual(['verhandlung1_ende']);
  });

  it('Verhandlungsrunde ohne zugehörige Angebotsfrist bzw. Runde 2 ohne Runde 1 wird nicht eingeplant', () => {
    // Runde 1 im Verfahren ohne Runden-Fristen (offen): Verbot + fehlende Frist
    const offen = basisInput();
    offen.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    const rOffen = calculateSchedule(offen);
    expect(datumVon(rOffen, 'verhandlung1_start')).toBeUndefined();
    expect(rOffen.warnungen.join(' ')).toContain('§ 15 Abs. 5');
    expect(rOffen.warnungen.join(' ')).toContain('optimierte Angebote');

    // nicht offen: § 16 Abs. 9
    const nichtOffen = basisInput({ verfahrensart: 'nicht_offen_mit_tnw' });
    nichtOffen.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    expect(calculateSchedule(nichtOffen).warnungen.join(' ')).toContain('§ 16 Abs. 9');

    // Runde 2 ohne aktive Runde 1
    const ohneR1 = basisInput({ verfahrensart: 'verhandlung_mit_tnw' });
    ohneR1.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 2 };
    const rOhneR1 = calculateSchedule(ohneR1);
    expect(datumVon(rOhneR1, 'verhandlung2_start')).toBeUndefined();
    expect(rOhneR1.warnungen.join(' ')).toContain('setzt eine aktive Verhandlungsrunde 1');
  });

  it('fester Starttermin vor dem Anker erzeugt einen Startkonflikt (Kern 1.4.0)', () => {
    const input = basisInput();
    input.optionen.praesentation = { aktiv: true, dauerAT: 2, start: '2026-09-15' };
    const result = calculateSchedule(input);
    const start = result.meilensteine.find((m) => m.id === 'praesentation_start')!;
    expect(start.datum).toBe('2026-09-15');
    expect(start.fristTyp).toBe('eingabe');
    expect(result.konflikte).toHaveLength(1);
    expect(result.konflikte[0].option).toBe('praesentation');
    expect(result.konflikte[0].gewaehlt).toBe('2026-09-15');
    expect(result.konflikte[0].fruehestens).toBe(result.fruehesteStarts.praesentation);
    expect(result.konflikte[0].text).toContain('frühestmöglich');
  });

  it('fruehesteStarts nennt aktive Optionen; gültige Termine erzeugen keinen Konflikt', () => {
    const input = basisInput();
    input.optionen.praesentation = { aktiv: true, dauerAT: 2 };
    input.optionen.teststellung = { aktiv: true, dauerAT: 5 };
    const result = calculateSchedule(input);
    expect(result.konflikte).toHaveLength(0);
    expect(result.fruehesteStarts.praesentation).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.fruehesteStarts.teststellung).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.fruehesteStarts.verhandlungRunde1).toBeUndefined();

    // Fester Start AM frühestmöglichen Tag bleibt konfliktfrei
    const okInput = basisInput();
    okInput.optionen.praesentation = { aktiv: true, dauerAT: 2, start: result.fruehesteStarts.praesentation };
    expect(calculateSchedule(okInput).konflikte).toHaveLength(0);
  });

  it('aktive, aber nicht eingeplante Runde: kein fruehesteStarts-Eintrag, kein Konflikt, dafür Warnung', () => {
    // seit Kern 1.9.0 genügt EINE weitere Angebotsrunde — hier beide auf 0
    const input = basisInput({ verfahrensart: 'verhandlung_mit_tnw', fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 0 } });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 3, start: '2020-01-01' };
    const result = calculateSchedule(input);
    expect(result.fruehesteStarts.verhandlungRunde1).toBeUndefined();
    expect(result.konflikte).toHaveLength(0);
    expect(result.warnungen.join(' ')).toContain('wird nicht eingeplant');
  });
});

describe('calculateSchedule — Teststellung', () => {
  it('fügt die Teststellungskette ein und hängt den Zuschlag daran', () => {
    const input = basisInput();
    input.optionen.teststellung = { aktiv: true, dauerAT: 10 };
    const result = calculateSchedule(input);

    // Bewertung 15.10. → Aufforderung 16.10. (Fr) → Start Mo 19.10. → Ende (10 AT inkl. Start) Fr 30.10.
    expect(datumVon(result, 'teststellung_aufforderung')).toBe('2026-10-16');
    expect(datumVon(result, 'teststellung_start')).toBe('2026-10-19');
    expect(datumVon(result, 'teststellung_ende')).toBe('2026-10-30');
    const start = result.meilensteine.find((m) => m.id === 'teststellung_start')!;
    expect(start.bis).toBe('2026-10-30'); // Zeitraum auch am Start-Meilenstein (UI-Darstellung von–bis)
    expect(start.dauerAT).toBe(10);
    // Auswertung + 5 AT → Fr 06.11.
    expect(datumVon(result, 'teststellung_auswertung')).toBe('2026-11-06');
    const empfehlung = result.meilensteine.find((m) => m.id === 'zuschlagsempfehlung')!;
    expect(empfehlung.abhaengigVon).toEqual(['teststellung_auswertung']);
  });

  it('meldet Starttermine vor der Aufforderung als Startkonflikt (Kern 1.4.0)', () => {
    const input = basisInput();
    input.optionen.teststellung = { aktiv: true, dauerAT: 5, start: '2026-10-01' };
    const result = calculateSchedule(input);
    const start = result.meilensteine.find((m) => m.id === 'teststellung_start')!;
    expect(start.datum).toBe('2026-10-01');
    expect(result.konflikte).toHaveLength(1);
    expect(result.konflikte[0].option).toBe('teststellung');
    expect(result.konflikte[0].text).toContain('vor der Aufforderung');
    expect(result.konflikte[0].fruehestens).toBe(result.fruehesteStarts.teststellung);
  });

  it('Phasenblöcke bleiben mit Teststellung chronologisch: Bewertung erscheint segmentiert erneut', () => {
    const input = basisInput();
    input.optionen.teststellung = { aktiv: true, dauerAT: 10 };
    const result = calculateSchedule(input);
    // Bewertung → Teststellung → Bewertung (Zuschlagsempfehlung) → Zuschlag
    expect(result.phasen.map((p) => p.id)).toEqual(['einholung', 'bewertung', 'teststellung', 'bewertung', 'zuschlag']);
    const zweiterBewertungsBlock = result.phasen[3];
    expect(zweiterBewertungsBlock.meilensteine).toEqual(['zuschlagsempfehlung']);
    // Blöcke chronologisch: jeder Block beginnt frühestens am Ende des vorigen
    for (let i = 1; i < result.phasen.length; i++) {
      expect(result.phasen[i].von >= result.phasen[i - 1].bis).toBe(true);
    }
  });
});

describe('calculateSchedule — Vergabeordnungen VOB/A-EU, SektVO, VSVgV (Kern 1.5.0)', () => {
  it('ohne vergabeordnung gilt VgV (Projektdateien aus Kern < 1.5.0)', () => {
    const result = calculateSchedule(basisInput());
    expect(result.meilensteine.find((m) => m.id === 'angebotsabgabe')!.rechtsgrundlage).toBe('§ 15 Abs. 2 VgV');
  });

  it('VOB/A-EU, offenes Verfahren: gleiche Kette wie VgV, VOB/A-Normzitate', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_eu' }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.datum).toBe('2026-10-01'); // 01.09. + 30 KT (elektronisch)
    expect(abgabe.rechtsgrundlage).toBe('§ 10a EU Abs. 1 VOB/A');
  });

  it('VOB/A-EU, Verhandlungsverfahren ohne TNW: echte Untergrenze 10 KT (§ 10c EU Abs. 2 — anders als VgV)', () => {
    const result = calculateSchedule(basisInput({
      vergabeordnung: 'vob_a_eu',
      verfahrensart: 'verhandlung_ohne_tnw',
      fristen: { angebotsfristKT: 8 },
    }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.fristTyp).toBe('praxis');
    expect(abgabe.warnungen.join(' ')).toContain('Mindestfrist von 10 KT');
    expect(abgabe.warnungen.join(' ')).toContain('§ 10c EU Abs. 2 VOB/A');
    expect(result.warnungen.join(' ')).toContain('§ 3a EU Abs. 3 VOB/A');
  });

  it('SektVO, zweistufig: gestufte Teilnahmefrist-Warnung (Regel 30, Untergrenze 15, § 15 Abs. 2 SektVO)', () => {
    const regel = calculateSchedule(basisInput({
      vergabeordnung: 'sektvo',
      verfahrensart: 'nicht_offen_mit_tnw',
      fristen: { teilnahmefristKT: 20 },
    }));
    const regelWarnung = regel.meilensteine.find((m) => m.id === 'teilnahmefrist_ende')!.warnungen.join(' ');
    expect(regelWarnung).toContain('Regelfrist von 30 KT');
    expect(regelWarnung).toContain('Ausnahmefall');
    expect(regelWarnung).toContain('§ 15 Abs. 2 SektVO');

    const untergrenze = calculateSchedule(basisInput({
      vergabeordnung: 'sektvo',
      verfahrensart: 'nicht_offen_mit_tnw',
      fristen: { teilnahmefristKT: 10 },
    }));
    expect(
      untergrenze.meilensteine.find((m) => m.id === 'teilnahmefrist_ende')!.warnungen.join(' ')
    ).toContain('absolute Untergrenze von 15 KT');
  });

  it('SektVO, zweistufig: Angebotsfrist ist Praxiswert mit Untergrenze 10 KT und Einvernehmens-Hinweis (§ 15 Abs. 3 SektVO)', () => {
    const result = calculateSchedule(basisInput({
      vergabeordnung: 'sektvo',
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { angebotsfristKT: 8, optimiertesAngebotKT: 0, finalesAngebotKT: 0 },
    }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.fristTyp).toBe('praxis');
    expect(abgabe.rechtsgrundlage).toBeUndefined();
    expect(abgabe.rechenweg).toContain('mindestens 10 KT');
    // Widerspruchsfreie Formulierung: die 10 KT
    // gelten nur OHNE einvernehmliche Festlegung
    const warnung = abgabe.warnungen.join(' ');
    expect(warnung).toContain('ohne einvernehmliche Festlegung geltende Mindestfrist von 10 KT (§ 15 Abs. 3 SektVO)');
    expect(warnung).toContain('gegenseitigen Einvernehmen');
    expect(warnung).not.toContain('Untergrenze 0 KT');
    expect(warnung).not.toContain('unterschreitet die gesetzliche Mindestfrist');
  });

  it('SektVO, zweistufig + Dringlichkeit: Hinweis, dass es keine gesonderten Dringlichkeitsfristen gibt', () => {
    const input = basisInput({ vergabeordnung: 'sektvo', verfahrensart: 'nicht_offen_mit_tnw' });
    input.optionen.dringlichkeit = true;
    const result = calculateSchedule(input);
    expect(result.warnungen.join(' ')).toContain('keine gesonderten Dringlichkeitsfristen');
    // Fristwerte bleiben die Regelwerte
    expect(datumVon(result, 'teilnahmefrist_ende')).toBe('2026-10-01'); // 01.09. + 30 KT
  });

  it('VSVgV, nicht offenes Verfahren (handgerechnet): Teilnahme 30 KT elektronisch, Angebot 35 KT', () => {
    const input = basisInput({ vergabeordnung: 'vsvgv', verfahrensart: 'nicht_offen_mit_tnw' });
    input.interneFristen.teilnahmeBewertungAT = 5;
    const result = calculateSchedule(input);
    // 01.09. + 30 KT (37 − 7 elektronisch) = Do 01.10.
    expect(datumVon(result, 'teilnahmefrist_ende')).toBe('2026-10-01');
    const tf = result.meilensteine.find((m) => m.id === 'teilnahmefrist_ende')!;
    expect(tf.rechtsgrundlage).toBe('§ 20 Abs. 2 Satz 1 VSVgV');
    // + 5 AT = Do 08.10. Bewertungsende, Versand +1 AT (Kern 1.9.0) = Fr 09.10.
    // → + 35 KT (40 − 5 elektronisch) = Fr 13.11.
    expect(datumVon(result, 'angebotsaufforderung')).toBe('2026-10-09');
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-11-13');
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.rechtsgrundlage).toBe('§ 20 Abs. 3 Satz 1 VSVgV');
  });

  it('VSVgV: Dringlichkeits-Teilnahmefrist 15 KT, elektronisch 10 KT (§ 20 Abs. 2 Satz 2 VSVgV)', () => {
    const papier = basisInput({ vergabeordnung: 'vsvgv', verfahrensart: 'verhandlung_mit_tnw' });
    papier.optionen.dringlichkeit = true;
    papier.optionen.elektronischeAbgabe = false;
    expect(datumVon(calculateSchedule(papier), 'teilnahmefrist_ende')).toBe('2026-09-16'); // + 15 KT

    const elektronisch = basisInput({ vergabeordnung: 'vsvgv', verfahrensart: 'verhandlung_mit_tnw' });
    elektronisch.optionen.dringlichkeit = true;
    expect(datumVon(calculateSchedule(elektronisch), 'teilnahmefrist_ende')).toBe('2026-09-11'); // + 10 KT
  });

  it('VSVgV kennt kein offenes Verfahren — leeres Ergebnis mit Meldung', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'vsvgv' }));
    expect(result.meilensteine).toEqual([]);
    expect(result.warnungen.join(' ')).toContain('in der VSVgV nicht vorgesehen');
  });

  it('unbekannte Vergabeordnung ⇒ leeres Ergebnis mit Meldung', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'vol_a' as never }));
    expect(result.meilensteine).toEqual([]);
    expect(result.warnungen.join(' ')).toContain('Unbekannte Vergabeordnung');
  });

  it('Klarstellungs-Minimum trägt das Normzitat der jeweiligen Vergabeordnung', () => {
    const sektvo = calculateSchedule(basisInput({ vergabeordnung: 'sektvo', fristen: { klarstellungVorAngebotKT: 5 } }));
    expect(
      sektvo.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen.join(' ')
    ).toContain('§ 16 Abs. 3 Nr. 1 SektVO');
    const vob = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_eu', fristen: { klarstellungVorAngebotKT: 5 } }));
    expect(
      vob.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen.join(' ')
    ).toContain('§ 12a EU Abs. 3, § 10a/10b EU Abs. 6 Nr. 1 VOB/A');
  });

  it('VSVgV-Klarstellungsminimum nach dem Wortlaut des § 20 Abs. 5: nicht offen stets 6 KT, beschleunigtes Verhandlungsverfahren 4 KT', () => {
    const klarstellungsWarnung = (result: ReturnType<typeof calculateSchedule>): string =>
      result.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen.join(' ');

    // Nicht offenes Verfahren + Dringlichkeit: Minimum bleibt 6 KT ⇒ 5 KT warnen
    const nichtOffen = basisInput({
      vergabeordnung: 'vsvgv',
      verfahrensart: 'nicht_offen_mit_tnw',
      fristen: { klarstellungVorAngebotKT: 5 },
    });
    nichtOffen.optionen.dringlichkeit = true;
    expect(klarstellungsWarnung(calculateSchedule(nichtOffen))).toContain('spätestens 6 KT');

    // Beschleunigtes Verhandlungsverfahren: Minimum 4 KT ⇒ 5 KT sind zulässig …
    const vvOk = basisInput({
      vergabeordnung: 'vsvgv',
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { klarstellungVorAngebotKT: 5, optimiertesAngebotKT: 0, finalesAngebotKT: 0 },
    });
    vvOk.optionen.dringlichkeit = true;
    expect(calculateSchedule(vvOk).meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen).toEqual([]);

    // … 3 KT nicht
    const vvWarnt = basisInput({
      vergabeordnung: 'vsvgv',
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { klarstellungVorAngebotKT: 3, optimiertesAngebotKT: 0, finalesAngebotKT: 0 },
    });
    vvWarnt.optionen.dringlichkeit = true;
    expect(klarstellungsWarnung(calculateSchedule(vvWarnt))).toContain('spätestens 4 KT');

    // Ohne Dringlichkeit gilt auch im Verhandlungsverfahren 6 KT
    const vvNormal = basisInput({
      vergabeordnung: 'vsvgv',
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { klarstellungVorAngebotKT: 5, optimiertesAngebotKT: 0, finalesAngebotKT: 0 },
    });
    expect(klarstellungsWarnung(calculateSchedule(vvNormal))).toContain('spätestens 6 KT');

    // Ohne TNW gibt es kein beschleunigtes Verfahren (§ 20 Abs. 2 Satz 2
    // nennt nur nicht offen + VV mit TNW) — konservativ bleiben 6 KT, und
    // der Angebotsvorschlag bleibt 30 KT
    const ohneTnw = basisInput({
      vergabeordnung: 'vsvgv',
      verfahrensart: 'verhandlung_ohne_tnw',
      fristen: { klarstellungVorAngebotKT: 5 },
    });
    ohneTnw.optionen.dringlichkeit = true;
    const ohneTnwErgebnis = calculateSchedule(ohneTnw);
    expect(klarstellungsWarnung(ohneTnwErgebnis)).toContain('spätestens 6 KT');
    expect(defaultFristen('vsvgv', 'verhandlung_ohne_tnw', ohneTnw.optionen).angebotsfristKT).toBe(30);
  });

  it('Verhandlungsverbots-Hinweis nutzt die Normzitate der Vergabeordnung (VOB/A: § 15 EU Abs. 3)', () => {
    const input = basisInput({ vergabeordnung: 'vob_a_eu' });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    const result = calculateSchedule(input);
    expect(result.warnungen.join(' ')).toContain('§ 15 EU Abs. 3 VOB/A');
  });
});

describe('calculateSchedule — KonzVgV, UVgO, VOB/A 1. Abschnitt (Kern 1.6.0)', () => {
  it('defaultFristen KonzVgV: einstufig 30 KT ohne E-Abschlag; mehrstufig 30/22 mit −5 elektronisch', () => {
    const optionen = basisInput().optionen;
    expect(defaultFristen('konzvgv', 'offen', optionen).angebotsfristKT).toBe(30); // −5 gilt nur im mehrstufigen Verfahren
    const mehrstufig = defaultFristen('konzvgv', 'verhandlung_mit_tnw', optionen);
    expect(mehrstufig.teilnahmefristKT).toBe(30);
    expect(mehrstufig.angebotsfristKT).toBe(17); // 22 − 5 (§ 27 Abs. 4 Satz 2 KonzVgV)
    expect(defaultFristen('konzvgv', 'verhandlung_mit_tnw', { ...optionen, elektronischeAbgabe: false }).angebotsfristKT).toBe(22);
    expect(mehrstufig.wartefristKT).toBe(10); // Wartepflicht über § 154 Nr. 4 i. V. m. § 134 GWB
  });

  it('defaultFristen Unterschwelle: Praxiswerte, keine Wartefrist, VOB/A-Dringlichkeit = 10-KT-Untergrenze', () => {
    const optionen = basisInput().optionen;
    const uvgo = defaultFristen('uvgo', 'offen', optionen);
    expect(uvgo.angebotsfristKT).toBe(21);
    expect(uvgo.wartefristKT).toBeUndefined();
    // UVgO kennt keine Dringlichkeitsfristen — der Vorschlag bleibt
    expect(defaultFristen('uvgo', 'offen', { ...optionen, dringlichkeit: true }).angebotsfristKT).toBe(21);
    const vob = defaultFristen('vob_a_1', 'offen', { ...optionen, dringlichkeit: true });
    expect(vob.angebotsfristKT).toBe(10); // § 10 Abs. 1 Satz 1 VOB/A: auch bei Dringlichkeit nicht unter 10 KT
    expect(vob.wartefristKT).toBeUndefined();
    // Verhandlungsvergabe mit TNW: Angebotsrunden vorbelegt
    expect(defaultFristen('uvgo', 'verhandlung_mit_tnw', optionen).optimiertesAngebotKT).toBe(10);
  });

  it('UVgO, Öffentliche Ausschreibung (handgerechnet): keine Bieterinformation, keine Wartefrist, Zuschlag am Tag der internen Entscheidung', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'uvgo' }));
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-09-22'); // 01.09. + 21 KT (Praxiswert)
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.fristTyp).toBe('praxis');
    expect(abgabe.rechtsgrundlage).toBeUndefined();
    expect(abgabe.warnungen).toEqual([]);
    expect(datumVon(result, 'bewertung_ende')).toBe('2026-10-06');
    expect(datumVon(result, 'interner_zuschlag')).toBe('2026-10-16');
    // Keine § 134-Meilensteine im Unterschwellenbereich
    expect(datumVon(result, 'bieterinformation')).toBeUndefined();
    expect(datumVon(result, 'wartefrist_ende')).toBeUndefined();
    const zuschlag = result.meilensteine.find((m) => m.id === 'zuschlag')!;
    expect(zuschlag.datum).toBe('2026-10-16'); // Tag der internen Zuschlagsentscheidung
    expect(zuschlag.fristTyp).toBe('praxis');
    expect(zuschlag.rechenweg).toContain('§ 134 GWB');
    // Landesrechts-Hinweis aus dem Ordnungs-Profil
    expect(result.warnungen.join(' ')).toContain('Landesvergabegesetze');
    // Klarstellung ohne gesetzliches Minimum
    const ks = result.meilensteine.find((m) => m.id === 'klarstellung_versand')!;
    expect(ks.rechenweg).toContain('kein gesetzliches Minimum');
    expect(ks.warnungen).toEqual([]);
  });

  it('UVgO: Feiertagsverschiebung zitiert § 54 UVgO i. V. m. § 193 BGB statt der EU-Fristen-VO', () => {
    // 05.09.2026 (Sa) + 21 KT = 26.09.2026 (Sa) → Mo 28.09.
    const result = calculateSchedule(basisInput({ vergabeordnung: 'uvgo', bekanntmachung: '2026-09-05' }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.datum).toBe('2026-09-28');
    expect(abgabe.rechenweg).toContain('§ 54 UVgO i. V. m. § 193 BGB');
    expect(abgabe.rechenweg).not.toContain('1182/71');
  });

  it('VOB/A 1. Abschnitt: 10-KT-Untergrenze warnt (§ 10 Abs. 1 Satz 1), Freihändige Vergabe ohne Untergrenze', () => {
    const zuKurz = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_1', fristen: { angebotsfristKT: 8 } }));
    const abgabe = zuKurz.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.warnungen.join(' ')).toContain('Mindestfrist von 10 KT (§ 10 Abs. 1 Satz 1 VOB/A)');

    // Freihändige Vergabe: § 10 Abs. 1 gilt nach der Systematik des
    // § 10 Abs. 6 nicht — 8 KT erzeugen keine Mindestfrist-Warnung
    const freihaendig = calculateSchedule(basisInput({
      vergabeordnung: 'vob_a_1',
      verfahrensart: 'verhandlung_ohne_tnw',
      fristen: { angebotsfristKT: 8 },
    }));
    expect(freihaendig.meilensteine.find((m) => m.id === 'angebotsabgabe')!.warnungen).toEqual([]);
    expect(freihaendig.warnungen.join(' ')).toContain('§ 3a Abs. 3 VOB/A');
  });

  it('Beschränkte Ausschreibung ohne TNW: einstufig, Start = Aufforderung zur Angebotsabgabe', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_1', verfahrensart: 'beschraenkt_ohne_tnw' }));
    const start = result.meilensteine.find((m) => m.id === 'bekanntmachung')!;
    expect(start.label).toBe('Absendung der Aufforderung zur Angebotsabgabe');
    expect(datumVon(result, 'teilnahmefrist_ende')).toBeUndefined();
    expect(result.warnungen.join(' ')).toContain('§ 3a Abs. 2');
    // In der VgV existiert die Verfahrensart nicht
    const vgv = calculateSchedule(basisInput({ verfahrensart: 'beschraenkt_ohne_tnw' }));
    expect(vgv.meilensteine).toEqual([]);
    expect(vgv.warnungen.join(' ')).toContain('in der VgV nicht vorgesehen');
  });

  it('Unterschwellige Teilnahmefrist ist Praxiswert ohne Rechtsgrundlage und ohne Mindestfrist-Warnung', () => {
    const result = calculateSchedule(basisInput({
      vergabeordnung: 'uvgo',
      verfahrensart: 'nicht_offen_mit_tnw',
      fristen: { teilnahmefristKT: 3 },
    }));
    const tf = result.meilensteine.find((m) => m.id === 'teilnahmefrist_ende')!;
    expect(tf.fristTyp).toBe('praxis');
    expect(tf.rechtsgrundlage).toBeUndefined();
    expect(tf.rechenweg).toContain('§ 13 Abs. 1 UVgO');
    expect(tf.warnungen).toEqual([]); // kein gesetzlicher Zahlwert ⇒ keine Warnung
  });

  it('VOB/A-1-Rechenweg nennt das Minimum ohne Einvernehmens-Floskel; SektVO behält sie', () => {
    const vob = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_1' }));
    const vobAbgabe = vob.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(vobAbgabe.rechenweg).toContain('gesetzliches Minimum 10 KT, § 10 Abs. 1 Satz 1 VOB/A');
    expect(vobAbgabe.rechenweg).not.toContain('einvernehmlich');
    const beschraenkt = calculateSchedule(basisInput({ vergabeordnung: 'vob_a_1', verfahrensart: 'beschraenkt_ohne_tnw' }));
    expect(beschraenkt.meilensteine.find((m) => m.id === 'angebotsabgabe')!.rechenweg).not.toContain('einvernehmlich');
    // SektVO: Einvernehmens-Mechanik bleibt korrekt benannt
    const sektvo = calculateSchedule(basisInput({
      vergabeordnung: 'sektvo',
      verfahrensart: 'nicht_offen_mit_tnw',
    }));
    expect(
      sektvo.meilensteine.find((m) => m.id === 'angebotsabgabe')!.rechenweg
    ).toContain('ohne einvernehmliche Festlegung mindestens 10 KT');
  });

  it('Dringlichkeit erzeugt genau EINEN Hinweis — Verkürzung ODER „keine gesonderten Fristen"', () => {
    const uvgo = basisInput({ vergabeordnung: 'uvgo' });
    uvgo.optionen.dringlichkeit = true;
    const uvgoErgebnis = calculateSchedule(uvgo);
    expect(uvgoErgebnis.warnungen.join(' ')).toContain('keine gesonderten Dringlichkeitsfristen');
    expect(uvgoErgebnis.warnungen.join(' ')).not.toContain('Die verkürzten Fristen');

    const vgv = basisInput();
    vgv.optionen.dringlichkeit = true;
    const vgvErgebnis = calculateSchedule(vgv);
    expect(vgvErgebnis.warnungen.join(' ')).toContain('Die verkürzten Fristen');
    expect(vgvErgebnis.warnungen.join(' ')).not.toContain('keine gesonderten Dringlichkeitsfristen');
  });

  it('KonzVgV: Wartefrist bleibt Teil der Kette; Klarstellungs-Minimum 6 KT nach § 18 KonzVgV', () => {
    const result = calculateSchedule(basisInput({ vergabeordnung: 'konzvgv', fristen: { klarstellungVorAngebotKT: 5 } }));
    expect(datumVon(result, 'wartefrist_ende')).toBeDefined();
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.rechtsgrundlage).toBe('§ 27 Abs. 3 KonzVgV');
    expect(
      result.meilensteine.find((m) => m.id === 'klarstellung_versand')!.warnungen.join(' ')
    ).toContain('§ 18 KonzVgV');
    expect(result.warnungen.join(' ')).toContain('§ 154 Nr. 4');
  });
});

describe('calculateSchedule — fester Termin der Angebotsaufforderung (Kern 1.7.0)', () => {
  it('fester Termin ersetzt die TNA-Bewertungszeit und startet die Angebotsfrist (handgerechnet)', () => {
    const input = basisInput({ verfahrensart: 'nicht_offen_mit_tnw', angebotsaufforderung: '2026-10-15' });
    input.interneFristen.teilnahmeBewertungAT = 5; // wird durch den festen Termin ersetzt
    const result = calculateSchedule(input);
    const auff = result.meilensteine.find((m) => m.id === 'angebotsaufforderung')!;
    expect(auff.datum).toBe('2026-10-15');
    expect(auff.fristTyp).toBe('eingabe');
    expect(auff.label).toBe('Versand der Aufforderung zur Angebotsabgabe');
    expect(auff.rechenweg).toContain('Nutzereingabe');
    // Angebotsfrist läuft ab dem festen Termin: 15.10. + 25 KT (elektronisch) = Mo 09.11.
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-11-09');
    expect(result.konflikte).toHaveLength(0);
    // min-Attribut: frühestmöglich ist der Ablauf der Teilnahmefrist
    expect(result.fruehesteStarts.angebotsaufforderung).toBe('2026-10-01');
  });

  it('Termin vor dem Teilnahmefristende ⇒ harter Startkonflikt; gleichtägig ist zulässig', () => {
    const zuFrueh = calculateSchedule(
      basisInput({ verfahrensart: 'verhandlung_mit_tnw', angebotsaufforderung: '2026-09-15' })
    );
    expect(zuFrueh.konflikte).toHaveLength(1);
    expect(zuFrueh.konflikte[0].option).toBe('angebotsaufforderung');
    expect(zuFrueh.konflikte[0].fruehestens).toBe('2026-10-01');
    expect(zuFrueh.konflikte[0].text).toContain('Ablauf der Teilnahmefrist');

    const gleichtaegig = calculateSchedule(
      basisInput({ verfahrensart: 'verhandlung_mit_tnw', angebotsaufforderung: '2026-10-01' })
    );
    expect(gleichtaegig.konflikte).toHaveLength(0);
  });

  it('ohne festen Termin: fruehesteStarts gesetzt, Berechnung wie bisher; ungültiger Termin ⇒ Warnung + Rückfall', () => {
    const ohne = basisInput({ verfahrensart: 'nicht_offen_mit_tnw' });
    ohne.interneFristen.teilnahmeBewertungAT = 5;
    const ohneErgebnis = calculateSchedule(ohne);
    expect(ohneErgebnis.fruehesteStarts.angebotsaufforderung).toBe('2026-10-01');
    // + 5 AT Bewertung = 08.10., Versand +1 AT (Kern 1.9.0) = 09.10.
    expect(datumVon(ohneErgebnis, 'angebotsaufforderung')).toBe('2026-10-09');

    const kaputt = basisInput({ verfahrensart: 'nicht_offen_mit_tnw', angebotsaufforderung: 'quatsch' });
    kaputt.interneFristen.teilnahmeBewertungAT = 5;
    const kaputtErgebnis = calculateSchedule(kaputt);
    expect(kaputtErgebnis.warnungen.join(' ')).toContain('Ungültiger Termin für die Aufforderung');
    expect(datumVon(kaputtErgebnis, 'angebotsaufforderung')).toBe('2026-10-09');
  });

  it('einstufige Verfahren ignorieren den festen Termin mit Warnung', () => {
    const result = calculateSchedule(basisInput({ angebotsaufforderung: '2026-10-15' }));
    expect(result.warnungen.join(' ')).toContain('nur bei Verfahren mit vorgeschaltetem Teilnahmewettbewerb');
    expect(result.konflikte).toHaveLength(0);
    expect(result.fruehesteStarts.angebotsaufforderung).toBeUndefined();
    expect(datumVon(result, 'angebotsaufforderung')).toBeUndefined();
  });
});

describe('calculateSchedule — Abgabe-Uhrzeit (Kern 1.8.0)', () => {
  function mitUhrzeit(aenderungen: Partial<ScheduleInput> = {}, uhrzeit = '10:00'): ScheduleInput {
    const input = basisInput(aenderungen);
    input.optionen = { ...input.optionen, abgabeUhrzeit: uhrzeit };
    return input;
  }

  it('legt den Abgabetermin einen Arbeitstag hinter das Fristende; Folgetermine ziehen mit', () => {
    // Referenzbeispiel: 01.09. + 30 KT = Fristende Do 01.10. (24:00 Uhr)
    // → Abgabe bis 10:00 Uhr erst am Fr 02.10.
    const result = calculateSchedule(mitUhrzeit());
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.datum).toBe('2026-10-02');
    expect(abgabe.label).toBe('Ablauf der Angebotsfrist (Angebotsabgabe bis 10:00 Uhr)');
    expect(abgabe.rechenweg).toContain('Abgabe bis 10:00 Uhr statt Fristablauf 24:00 Uhr');
    expect(abgabe.rechenweg).toContain('Art. 3 Abs. 2 Buchst. b VO (EWG) 1182/71');
    // Rückwärts- und Folgetermine rechnen ab dem tatsächlichen Abgabetermin
    expect(datumVon(result, 'bieterfragen_ende')).toBe('2026-09-24'); // 02.10. − 8 KT (Do)
    expect(datumVon(result, 'bewertung_ende')).toBe('2026-10-16'); // + 10 AT ab Fr 02.10.
  });

  it('Fristende Fr → Abgabe mit Uhrzeit erst am Mo (Arbeitstagslogik beim Folgetag)', () => {
    // 02.09. (Mi) + 30 KT = Fristende Fr 02.10. → Folgetag Sa → Abgabe Mo 05.10.
    const result = calculateSchedule(mitUhrzeit({ bekanntmachung: '2026-09-02' }));
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-10-05');
  });

  it('erst Sa/So/Feiertag-Verschiebung, dann Uhrzeit-Folgetag (Reihenfolge der Regeln)', () => {
    // 03.09. + 30 KT = Sa 03.10. (Tag der Deutschen Einheit) → Fristende Mo
    // 05.10. (24:00 Uhr) → Abgabe bis 10:00 Uhr erst Di 06.10.
    const result = calculateSchedule(mitUhrzeit({ bekanntmachung: '2026-09-03' }));
    const abgabe = result.meilensteine.find((m) => m.id === 'angebotsabgabe')!;
    expect(abgabe.datum).toBe('2026-10-06');
    expect(abgabe.rechenweg).toContain('Sa/So/Feiertag → nächster Arbeitstag 05.10.2026');
    expect(abgabe.rechenweg).toContain('nächster Arbeitstag 06.10.2026');
  });

  it('verschiebt alle Abgabe-/Eingangstermine: Teilnahmeanträge, Erst-, optimierte und finale Angebote', () => {
    const beispiel = (uhrzeit?: string): ScheduleInput => {
      const input = basisInput({
        verfahrensart: 'verhandlung_mit_tnw',
        fristen: { optimiertesAngebotKT: 10, finalesAngebotKT: 10 },
      });
      if (uhrzeit !== undefined) input.optionen = { ...input.optionen, abgabeUhrzeit: uhrzeit };
      return input;
    };
    const ohne = calculateSchedule(beispiel());
    const mit = calculateSchedule(beispiel('12:00'));
    for (const id of ['teilnahmefrist_ende', 'angebotsabgabe', 'optimiertes_angebot', 'finales_angebot']) {
      const datumOhne = datumVon(ohne, id)!;
      const datumMit = datumVon(mit, id)!;
      // Jeder Termin liegt mit Uhrzeit später (die Kette verschiebt sich mit;
      // durch Wochenenden/Feiertage teils um mehr als einen Kalendertag)
      expect(datumMit > datumOhne, `${id}: ${datumMit} > ${datumOhne}`).toBe(true);
      expect(mit.meilensteine.find((m) => m.id === id)!.label).toContain('bis 12:00 Uhr');
      expect(mit.meilensteine.find((m) => m.id === id)!.rechenweg).toContain('volle Frist gewahrt');
    }
  });

  it('Unterschwelle zitiert das BGB-Fristende (§ 188 Abs. 1 BGB)', () => {
    const result = calculateSchedule(mitUhrzeit({ vergabeordnung: 'uvgo', verfahrensart: 'offen' }));
    expect(result.meilensteine.find((m) => m.id === 'angebotsabgabe')!.rechenweg).toContain('§ 188 Abs. 1 BGB');
  });

  it('Mindestfrist-Warnung bleibt an der Fristdauer hängen, nicht am Termin', () => {
    // 25 KT < 30 KT Minimum — Warnung unabhängig von der Uhrzeit-Verschiebung
    const result = calculateSchedule(mitUhrzeit({ fristen: { angebotsfristKT: 25 } }));
    expect(result.meilensteine.find((m) => m.id === 'angebotsabgabe')!.warnungen.join(' ')).toContain(
      'Mindestfrist von 30 KT'
    );
  });

  it('ignoriert ungültige Uhrzeiten mit Warnung; leerer Wert bleibt stumm', () => {
    for (const kaputt of ['25:00', '10:60', '10 Uhr', '9:00']) {
      const result = calculateSchedule(mitUhrzeit({}, kaputt));
      expect(result.warnungen.join(' ')).toContain('Ungültige Abgabe-Uhrzeit');
      expect(datumVon(result, 'angebotsabgabe')).toBe('2026-10-01'); // unverschoben
    }
    const leer = calculateSchedule(mitUhrzeit({}, ''));
    expect(leer.warnungen.join(' ')).not.toContain('Ungültige Abgabe-Uhrzeit');
    expect(datumVon(leer, 'angebotsabgabe')).toBe('2026-10-01');
    expect(leer.meilensteine.find((m) => m.id === 'angebotsabgabe')!.label).toBe(
      'Ablauf der Angebotsfrist (Angebotsabgabe)'
    );
  });

  it('Wartefrist und Zuschlag verschieben sich nur über die Kette, nicht doppelt', () => {
    // Referenzbeispiel + Uhrzeit: alles einen Arbeitstag später als im
    // handgerechneten Beispiel (Bieterinfo Mi 28.10. statt Di 27.10.,
    // Wartefrist-Ende + Zuschlag folgen § 134 GWB unverändert)
    const result = calculateSchedule(mitUhrzeit());
    expect(datumVon(result, 'interner_zuschlag')).toBe('2026-10-28');
    expect(datumVon(result, 'bieterinformation')).toBe('2026-10-28');
    expect(datumVon(result, 'wartefrist_ende')).toBe('2026-11-09'); // 10 KT ab 28.10. = Sa 07.11. → Mo
    expect(datumVon(result, 'zuschlag')).toBe('2026-11-10');
  });
});

describe('calculateSchedule — Robustheit (wirft nie)', () => {
  it('liefert bei ungültigen Eingaben ein leeres Ergebnis mit Warnung', () => {
    expect(calculateSchedule(basisInput({ bekanntmachung: 'quatsch' })).meilensteine).toEqual([]);
    expect(calculateSchedule(null as unknown as ScheduleInput).warnungen.length).toBeGreaterThan(0);
    expect(calculateSchedule({} as ScheduleInput).meilensteine).toEqual([]);
  });

  it('fängt kaputte Zahlwerte mit Warnung + Rückfall ab', () => {
    const result = calculateSchedule(basisInput({ fristen: { angebotsfristKT: -3 } }));
    expect(result.warnungen.join(' ')).toContain('Ungültiger Wert');
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-10-01'); // Rückfall auf Default 30 KT
  });
});

describe('calculateSchedule — Abgabetermine an Heiligabend/Silvester', () => {
  function warnungenVon(result: ReturnType<typeof calculateSchedule>, id: string): string {
    return (result.meilensteine.find((m) => m.id === id)?.warnungen ?? []).join(' ');
  }

  it('warnt bei Angebotsabgabe am 24.12. (Arbeitstag, keine Feiertagsverschiebung)', () => {
    // 24.11.2026 + 30 KT (elektronisch) = Do 24.12.2026 — Arbeitstag, bleibt stehen
    const result = calculateSchedule(basisInput({ bekanntmachung: '2026-11-24' }));
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-12-24');
    expect(warnungenVon(result, 'angebotsabgabe')).toContain('Heiligabend');
  });

  it('warnt bei Angebotsabgabe am 31.12.', () => {
    // 01.12.2026 + 30 KT = Do 31.12.2026
    const result = calculateSchedule(basisInput({ bekanntmachung: '2026-12-01' }));
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-12-31');
    expect(warnungenVon(result, 'angebotsabgabe')).toContain('Silvester');
  });

  it('warnt bei finalen Angeboten am 24.12. (Verhandlungsverfahren mit zwei Runden)', () => {
    const result = calculateSchedule(basisInput({
      verfahrensart: 'verhandlung_mit_tnw',
      bundesland: 'BE',
      bekanntmachung: '2026-07-23',
      fristen: { teilnahmefristKT: 30, angebotsfristKT: 30, optimiertesAngebotKT: 20, finalesAngebotKT: 20 },
      optionen: {
        elektronischeAbgabe: false,
        ortsbegehung: false,
        dringlichkeit: false,
        versandBieterinformation: 'elektronisch',
        teststellung: { aktiv: false, dauerAT: 0 },
        praesentation: { aktiv: true, dauerAT: 2 },
        verhandlungRunde1: { aktiv: true, dauerAT: 3 },
        verhandlungRunde2: { aktiv: true, dauerAT: 3 },
      },
      interneFristen: {
        bewertungAT: 10,
        aufklaerungEntscheidungAT: 5,
        internerZuschlagAT: 3,
        teststellungAuswertungAT: 0,
        // Kette wie Kern 1.8.0 (ohne Einladungs-/Anpassungs-/Versandtage), damit
        // die Heiligabend-Konstellation erhalten bleibt
        aufforderungVersandAT: 0,
        einladungVersandAT: 0,
        vuAnpassungRunde1AT: 0,
        vuAnpassungRunde2AT: 0,
      },
    }));
    expect(datumVon(result, 'finales_angebot')).toBe('2026-12-24');
    expect(warnungenVon(result, 'finales_angebot')).toContain('Heiligabend');
    // Wartefrist-Ende rechnerisch So 31.01.2027 → risikoarm Mo 01.02.,
    // frühester Zuschlag Di 02.02. (Kern 1.3.0)
    expect(datumVon(result, 'wartefrist_ende')).toBe('2027-02-01');
    expect(datumVon(result, 'zuschlag')).toBe('2027-02-02');
  });

  it('keine Heiligabend/Silvester-Warnung bei unkritischen Terminen', () => {
    const result = calculateSchedule(basisInput());
    const alle = result.meilensteine.flatMap((m) => m.warnungen).join(' ');
    expect(alle).not.toContain('Heiligabend');
    expect(alle).not.toContain('Silvester');
  });
});

describe('calculateSchedule — Kern 1.9.0', () => {
  it('D: Ende Bewerberfragen 8 KT vor Ablauf der Teilnahmefrist, auf den vorherigen Arbeitstag vorgezogen', () => {
    const result = calculateSchedule(
      basisInput({ verfahrensart: 'nicht_offen_mit_tnw', bundesland: 'BE', bekanntmachung: '2026-10-02' })
    );
    // 02.10. + 30 KT = So 01.11. → Mo 02.11.; − 8 KT = So 25.10. → Fr 23.10.
    expect(datumVon(result, 'teilnahmefrist_ende')).toBe('2026-11-02');
    expect(datumVon(result, 'bewerberfragen_ende')).toBe('2026-10-23');
    const bw = result.meilensteine.find((m) => m.id === 'bewerberfragen_ende')!;
    expect(bw.phase).toBe('teilnahmewettbewerb');
    expect(bw.fristTyp).toBe('praxis');
    // einstufig: kein Bewerberfragen-Meilenstein
    expect(datumVon(calculateSchedule(basisInput()), 'bewerberfragen_ende')).toBeUndefined();
    // Wert überschreibbar
    const kurz = calculateSchedule(
      basisInput({ verfahrensart: 'nicht_offen_mit_tnw', bundesland: 'BE', bekanntmachung: '2026-10-02', fristen: { bewerberfragenVorTeilnahmeKT: 3 } })
    );
    expect(datumVon(kurz, 'bewerberfragen_ende')).toBe('2026-10-30'); // 02.11. − 3 = Fr 30.10.
  });

  it('E: Versand der Aufforderung standardmäßig 1 AT nach dem Bewertungsende, 0 = am selben Tag; gilt auch für die Teststellung', () => {
    const standard = basisInput({ verfahrensart: 'nicht_offen_mit_tnw' });
    standard.interneFristen.teilnahmeBewertungAT = 5;
    standard.optionen.teststellung = { aktiv: true, dauerAT: 5 };
    const r1 = calculateSchedule(standard);
    expect(datumVon(r1, 'teilnahme_bewertung_ende')).toBe('2026-10-08');
    expect(datumVon(r1, 'angebotsaufforderung')).toBe('2026-10-09');
    expect(r1.meilensteine.find((m) => m.id === 'angebotsaufforderung')!.abhaengigVon).toEqual(['teilnahme_bewertung_ende']);
    const bewertungEnde = datumVon(r1, 'bewertung_ende')!;
    expect(datumVon(r1, 'teststellung_aufforderung')! > bewertungEnde).toBe(true);

    const selberTag = basisInput({ verfahrensart: 'nicht_offen_mit_tnw' });
    selberTag.interneFristen.teilnahmeBewertungAT = 5;
    selberTag.interneFristen.aufforderungVersandAT = 0;
    selberTag.optionen.teststellung = { aktiv: true, dauerAT: 5 };
    const r0 = calculateSchedule(selberTag);
    expect(datumVon(r0, 'angebotsaufforderung')).toBe('2026-10-08');
    expect(datumVon(r0, 'teststellung_aufforderung')).toBe(datumVon(r0, 'bewertung_ende'));
  });

  it('G: Verhandlungsverfahren mit einer Runde — vollständige Kette (Sachsen, 10:00 Uhr)', () => {
    const result = calculateSchedule({
      vergabeordnung: 'vgv',
      verfahrensart: 'verhandlung_mit_tnw',
      bundesland: 'SN',
      bekanntmachung: '2026-08-20',
      optionen: {
        elektronischeAbgabe: true,
        ortsbegehung: false,
        dringlichkeit: false,
        versandBieterinformation: 'elektronisch',
        abgabeUhrzeit: '10:00',
        teststellung: { aktiv: false, dauerAT: 0 },
        // 1. Bieterverhandlung am 10.11., Zeitraum für Vorbereitung, Durchführung
        // und Nachbereitung 7 AT nach dem Termin ⇒ Dauer 8 AT (Starttag zählt mit)
        verhandlungRunde1: { aktiv: true, dauerAT: 8, start: '2026-11-10' },
      },
      fristen: {
        teilnahmefristKT: 30,
        angebotsfristKT: 25,
        bieterfragenVorAngebotKT: 8,
        klarstellungVorAngebotKT: 7,
        wartefristKT: 10,
        optimiertesAngebotKT: 10,
        finalesAngebotKT: 0,
        bindefrist: { termin: '2027-01-05' },
      },
      interneFristen: {
        teilnahmeBewertungAT: 4,
        zwischenbewertungAT: 3,
        einladungVersandAT: 1,
        vuAnpassungRunde1AT: 2,
        aufforderungVersandAT: 1,
        bewertungAT: 0,
        aufklaerungEntscheidungAT: 2,
        internerZuschlagAT: 5,
        infoVersandAT: 1,
        teststellungAuswertungAT: 0,
      },
    });
    const erwartet: Record<string, string> = {
      // 22.09. − 8 KT = Mo 14.09.; Bezug ist der tatsächliche Abgabetermin
      bewerberfragen_ende: '2026-09-14',
      teilnahmefrist_ende: '2026-09-22',
      teilnahme_bewertung_ende: '2026-09-28',
      angebotsaufforderung: '2026-09-29',
      angebotsabgabe: '2026-10-27',
      zwischenbewertung_erstangebote: '2026-10-30',
      verhandlung1_einladung: '2026-11-02',
      verhandlung1_start: '2026-11-10',
      verhandlung1_ende: '2026-11-20', // 8 AT ab 10.11., Buß- und Bettag 18.11. (nur Sachsen) zählt nicht
      optimiertes_angebot_vorbereitung_ende: '2026-11-24',
      optimiertes_angebot_aufforderung: '2026-11-25',
      optimiertes_angebot: '2026-12-08', // 25.11. + 10 KT = Sa 05.12. → Mo 07.12. → 10:00 Uhr → Di 08.12.
      bewertung_ende: '2026-12-08',
      zuschlagsempfehlung: '2026-12-10',
      interner_zuschlag: '2026-12-17',
      bieterinformation: '2026-12-18',
      wartefrist_ende: '2026-12-28',
      zuschlag: '2026-12-29',
      bindefrist_ende: '2027-01-05',
    };
    for (const [id, datum] of Object.entries(erwartet)) {
      expect(datumVon(result, id), id).toBe(datum);
    }
    // Bieterfragen/Klarstellung: Bezug ist der tatsächliche Abgabetermin (27.10.)
    expect(datumVon(result, 'bieterfragen_ende')).toBe('2026-10-19');
    expect(datumVon(result, 'klarstellung_versand')).toBe('2026-10-20');
    // Benennung: nach der einzigen weiteren Runde sind es die finalen Angebote
    const abgabe = result.meilensteine.find((m) => m.id === 'optimiertes_angebot')!;
    expect(abgabe.label).toContain('finalen Angebote');
    expect(abgabe.label).toContain('10:00 Uhr');
    expect(datumVon(result, 'finales_angebot')).toBeUndefined();
    // H: Bindefrist in beiden Formen
    expect(result.bindefrist).toEqual({ termin: '2027-01-05', tage: 28, basis: '2026-12-08' });
    expect(result.konflikte).toEqual([]);
  });

  it('G: finale Angebote ohne optimierte Runde hängen an der Bewertung der Erstangebote; zwei Runden benennen „optimierte" und „finale"', () => {
    const nurFinal = calculateSchedule(
      basisInput({ verfahrensart: 'verhandlung_mit_tnw', fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 10 } })
    );
    expect(datumVon(nurFinal, 'optimiertes_angebot')).toBeUndefined();
    expect(nurFinal.meilensteine.find((m) => m.id === 'finales_angebot_vorbereitung_ende')!.abhaengigVon).toEqual(['zwischenbewertung_erstangebote']);
    expect(nurFinal.meilensteine.find((m) => m.id === 'finales_angebot')!.abhaengigVon).toEqual(['finales_angebot_aufforderung']);

    const zwei = calculateSchedule(basisInput({ verfahrensart: 'verhandlung_mit_tnw' }));
    expect(zwei.meilensteine.find((m) => m.id === 'optimiertes_angebot')!.label).toContain('optimierten Angebote');
    expect(zwei.meilensteine.find((m) => m.id === 'finales_angebot')!.label).toContain('finalen Angebote');
    expect(zwei.meilensteine.find((m) => m.id === 'zwischenbewertung_optimierte')!.abhaengigVon).toEqual(['optimiertes_angebot']);
  });

  it('G: Eingabeweise „optimiert leer, final n" mit Runde 1 — Runde bleibt erhalten, finale Angebote folgen ihr', () => {
    const input = basisInput({
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { optimiertesAngebotKT: 0, finalesAngebotKT: 10 },
    });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 3 };
    input.interneFristen.vuAnpassungRunde1AT = 2;
    input.interneFristen.vuAnpassungRunde2AT = 0;
    const result = calculateSchedule(input);
    expect(datumVon(result, 'verhandlung1_start')).toBeDefined();
    expect(result.meilensteine.find((m) => m.id === 'verhandlung1_einladung')!.abhaengigVon).toEqual(['zwischenbewertung_erstangebote']);
    // Anpassung nach Runde 1 (2 AT) — nicht der Runde-2-Wert (0)
    const vu = result.meilensteine.find((m) => m.id === 'finales_angebot_vorbereitung_ende')!;
    expect(vu.abhaengigVon).toEqual(['verhandlung1_ende']);
    expect(datumVon(result, 'finales_angebot_aufforderung')! > vu.datum).toBe(true);
    expect(datumVon(result, 'optimiertes_angebot')).toBeUndefined();
    expect(result.warnungen.join(' ')).not.toContain('wird nicht eingeplant');

    // Runde 2 braucht beide Angebotsrunden
    input.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 2 };
    const zwei = calculateSchedule(input);
    expect(datumVon(zwei, 'verhandlung2_start')).toBeUndefined();
    expect(zwei.warnungen.join(' ')).toContain('beide Angebotsrunden');
  });

  it('G: ohne festen Verhandlungstermin folgt die Runde auf die Einladung', () => {
    const input = basisInput({ verfahrensart: 'verhandlung_mit_tnw', fristen: { optimiertesAngebotKT: 10, finalesAngebotKT: 0 } });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 3 };
    const result = calculateSchedule(input);
    const einladung = datumVon(result, 'verhandlung1_einladung')!;
    const start = result.meilensteine.find((m) => m.id === 'verhandlung1_start')!;
    expect(start.abhaengigVon).toEqual(['verhandlung1_einladung']);
    expect(start.datum > einladung).toBe(true);
    expect(result.fruehesteStarts.verhandlungRunde1).toBe(einladung);
    // inaktive Runde: keine Einladung, keine Runde — nur Anpassung + Aufforderung
    input.optionen.verhandlungRunde1 = { aktiv: false, dauerAT: 3 };
    const ohne = calculateSchedule(input);
    expect(datumVon(ohne, 'verhandlung1_einladung')).toBeUndefined();
    expect(ohne.meilensteine.find((m) => m.id === 'optimiertes_angebot_vorbereitung_ende')!.abhaengigVon).toEqual(['zwischenbewertung_erstangebote']);
  });

  it('G: Anpassung vor der zweiten weiteren Angebotsrunde gilt auch ohne Verhandlungsrunde 2', () => {
    const input = basisInput({ verfahrensart: 'verhandlung_mit_tnw', fristen: { optimiertesAngebotKT: 10, finalesAngebotKT: 10 } });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    input.optionen.verhandlungRunde2 = { aktiv: false, dauerAT: 2 };
    input.interneFristen.vuAnpassungRunde2AT = 7;
    const result = calculateSchedule(input);
    expect(datumVon(result, 'verhandlung2_start')).toBeUndefined();
    const zb2 = datumVon(result, 'zwischenbewertung_optimierte')!;
    const vu2 = result.meilensteine.find((m) => m.id === 'finales_angebot_vorbereitung_ende')!;
    expect(vu2.abhaengigVon).toEqual(['zwischenbewertung_optimierte']);
    expect(vu2.datum).toBe(addArbeitstageTest(zb2, 7));
    expect(result.warnungen.join(' ')).not.toContain('wird nicht eingeplant');
  });

  it('0-Grenzfälle: Bewerberfragen 0 = kein Meilenstein; Einladung 0 = am Bewertungsende; VU-Anpassung 0 = keine Vorbereitungs-Meilensteine', () => {
    const input = basisInput({
      verfahrensart: 'verhandlung_mit_tnw',
      fristen: { bewerberfragenVorTeilnahmeKT: 0, optimiertesAngebotKT: 10, finalesAngebotKT: 10 },
    });
    input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 2 };
    input.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 2 };
    input.interneFristen.einladungVersandAT = 0;
    input.interneFristen.vuAnpassungRunde1AT = 0;
    input.interneFristen.vuAnpassungRunde2AT = 0;
    const result = calculateSchedule(input);
    expect(datumVon(result, 'bewerberfragen_ende')).toBeUndefined();
    expect(datumVon(result, 'verhandlung1_einladung')).toBe(datumVon(result, 'zwischenbewertung_erstangebote'));
    expect(datumVon(result, 'verhandlung2_einladung')).toBe(datumVon(result, 'zwischenbewertung_optimierte'));
    expect(datumVon(result, 'optimiertes_angebot_vorbereitung_ende')).toBeUndefined();
    expect(datumVon(result, 'finales_angebot_vorbereitung_ende')).toBeUndefined();
    expect(result.meilensteine.find((m) => m.id === 'optimiertes_angebot_aufforderung')!.abhaengigVon).toEqual(['verhandlung1_ende']);
    expect(result.meilensteine.find((m) => m.id === 'finales_angebot_aufforderung')!.abhaengigVon).toEqual(['verhandlung2_ende']);
  });

  it('Altdatei: Eingaben aus Kern 1.8.0 (Runde 1 = 1 AT, optimierte Angebote 9 KT) rechnen unter 1.9.0 mit den neuen Defaults', () => {
    // Eingaben ohne die Felder aus Kern 1.9.0
    const result = calculateSchedule({
      vergabeordnung: 'vgv',
      verfahrensart: 'verhandlung_mit_tnw',
      bundesland: 'SN',
      bekanntmachung: '2026-08-20',
      optionen: {
        elektronischeAbgabe: true,
        ortsbegehung: false,
        dringlichkeit: false,
        versandBieterinformation: 'elektronisch',
        abgabeUhrzeit: '10:00',
        teststellung: { aktiv: false, dauerAT: 5 },
        praesentation: { aktiv: false, dauerAT: 2 },
        verhandlungRunde1: { aktiv: true, dauerAT: 1, start: '2026-11-10' },
        verhandlungRunde2: { aktiv: false, dauerAT: 3 },
      },
      fristen: {
        angebotsfristKT: 25,
        teilnahmefristKT: 30,
        bieterfragenVorAngebotKT: 8,
        klarstellungVorAngebotKT: 7,
        wartefristKT: 10,
        optimiertesAngebotKT: 9,
        finalesAngebotKT: 0,
        bindefrist: { termin: '2027-01-05' },
      },
      interneFristen: {
        bewertungAT: 3,
        aufklaerungEntscheidungAT: 2,
        internerZuschlagAT: 5,
        teststellungAuswertungAT: 3,
        infoVersandAT: 1,
        teilnahmeBewertungAT: 4,
      },
    });
    // Kern 1.8.0 lieferte: Aufforderung 28.09., Erstangebote 26.10., optimierte Angebote 20.11., Zuschlag 18.12.
    // Kern 1.9.0 (Defaults Aufforderung +1, Einladung +1, VU-Anpassung +2): Aufforderung 29.09.,
    // Erstangebote 27.10., Bewertung 30.10., Einladung 02.11., Runde 10.11., VU-Anpassung 12.11.,
    // Aufforderung 13.11., optimierte (= finale) Angebote 13.11. + 9 KT = So 22.11. → Mo 23.11. → 10:00 Uhr → Di 24.11.
    expect(datumVon(result, 'bewerberfragen_ende')).toBe('2026-09-14');
    expect(datumVon(result, 'angebotsaufforderung')).toBe('2026-09-29');
    expect(datumVon(result, 'angebotsabgabe')).toBe('2026-10-27');
    expect(datumVon(result, 'verhandlung1_einladung')).toBe('2026-11-02');
    expect(datumVon(result, 'verhandlung1_ende')).toBe('2026-11-10');
    expect(datumVon(result, 'optimiertes_angebot_vorbereitung_ende')).toBe('2026-11-12');
    expect(datumVon(result, 'optimiertes_angebot_aufforderung')).toBe('2026-11-13');
    expect(datumVon(result, 'optimiertes_angebot')).toBe('2026-11-24');
    expect(result.bindefrist).toEqual({ termin: '2027-01-05', tage: 42, basis: '2026-11-24' });
  });

  it('H: Bindefrist als Dauer ⇒ Endtermin berechnet; als Endtermin ⇒ Dauer berechnet; Endtermin vor der Abgabe ⇒ Warnung', () => {
    const tage = calculateSchedule(basisInput({ fristen: { bindefrist: { tage: 40 } } }));
    expect(tage.bindefrist).toEqual({ termin: '2026-11-10', tage: 40, basis: '2026-10-01' });
    expect(datumVon(tage, 'bindefrist_ende')).toBe('2026-11-10');

    const termin = calculateSchedule(basisInput({ fristen: { bindefrist: { termin: '2026-11-30' } } }));
    expect(termin.bindefrist).toEqual({ termin: '2026-11-30', tage: 60, basis: '2026-10-01' });
    expect(termin.meilensteine.find((m) => m.id === 'bindefrist_ende')!.rechenweg).toContain('60 Kalendertage');

    const zuFrueh = calculateSchedule(basisInput({ fristen: { bindefrist: { termin: '2026-09-15' } } }));
    expect(zuFrueh.bindefrist?.tage).toBe(-16);
    expect(zuFrueh.warnungen.join(' ')).toContain('endet vor der letzten Angebotsabgabe');

    expect(calculateSchedule(basisInput()).bindefrist).toBeUndefined();
  });
});
