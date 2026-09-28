import { describe, expect, it } from 'vitest';
import type { ProjektDatei } from './api.js';
import { parseProjektDatei } from './projekt.js';

function gueltigeDatei(): ProjektDatei {
  return {
    version: 1,
    gespeichertAm: '2026-07-17T10:00:00.000Z',
    rechenkernVersion: '1.0.0',
    rechtsstand: 'Juli 2026',
    input: {
      verfahrensart: 'offen',
      bundesland: 'NW',
      bekanntmachung: '2026-09-01',
      optionen: {
        elektronischeAbgabe: true,
        ortsbegehung: false,
        dringlichkeit: false,
        versandBieterinformation: 'elektronisch',
        teststellung: { aktiv: false, dauerAT: 10 },
      },
      interneFristen: {
        bewertungAT: 10,
        aufklaerungEntscheidungAT: 5,
        internerZuschlagAT: 3,
        teststellungAuswertungAT: 5,
      },
      projekt: { kunde: 'Stadt Musterstadt', projektname: 'ERP', vergabenummer: '2026-001' },
    },
  };
}

function alsJson(mutation: (datei: Record<string, any>) => void = () => {}): string {
  const datei = gueltigeDatei() as unknown as Record<string, any>;
  mutation(datei);
  return JSON.stringify(datei);
}

describe('parseProjektDatei', () => {
  it('akzeptiert eine vollständige gültige Datei', () => {
    const ergebnis = parseProjektDatei(alsJson());
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) {
      expect(ergebnis.datei.input.verfahrensart).toBe('offen');
      expect(ergebnis.datei.rechenkernVersion).toBe('1.0.0');
    }
  });

  it('akzeptiert optionale Felder: fristen mit Bindefrist als Dauer ODER Termin', () => {
    expect(parseProjektDatei(alsJson((d) => { d.input.fristen = { bindefrist: { tage: 60 } }; })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.fristen = { bindefrist: { termin: '2026-12-15' } }; })).ok).toBe(true);
  });

  it('akzeptiert Präsentation/Verhandlungsrunden/infoVersandAT/zwischenbewertungAT', () => {
    const ok = parseProjektDatei(alsJson((d) => {
      d.input.optionen.praesentation = { aktiv: true, dauerAT: 3 };
      d.input.optionen.verhandlungRunde1 = { aktiv: true, dauerAT: 5, start: '2026-10-12' };
      d.input.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 3 };
      d.input.interneFristen.infoVersandAT = 2;
      d.input.interneFristen.zwischenbewertungAT = 7;
    }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.datei.input.optionen.praesentation?.dauerAT).toBe(3);
      expect(ok.datei.input.optionen.verhandlungRunde2?.dauerAT).toBe(3);
      expect(ok.datei.input.interneFristen.infoVersandAT).toBe(2);
      expect(ok.datei.input.interneFristen.zwischenbewertungAT).toBe(7);
    }
  });

  it('akzeptiert die Felder aus Kern 1.9.0 (Bewerberfragen, Versand-/Anpassungszeiten) und lehnt ungültige Werte ab', () => {
    const ok = parseProjektDatei(alsJson((d) => {
      d.input.verfahrensart = 'nicht_offen_mit_tnw';
      d.input.fristen = { bewerberfragenVorTeilnahmeKT: 6 };
      d.input.interneFristen.aufforderungVersandAT = 0;
      d.input.interneFristen.einladungVersandAT = 2;
      d.input.interneFristen.vuAnpassungRunde1AT = 3;
      d.input.interneFristen.vuAnpassungRunde2AT = 1;
    }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.datei.input.fristen?.bewerberfragenVorTeilnahmeKT).toBe(6);
      expect(ok.datei.input.interneFristen.aufforderungVersandAT).toBe(0);
      expect(ok.datei.input.interneFristen.vuAnpassungRunde2AT).toBe(1);
    }
    expect(parseProjektDatei(alsJson((d) => { d.input.fristen = { bewerberfragenVorTeilnahmeKT: -1 }; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.aufforderungVersandAT = 'morgen'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.vuAnpassungRunde1AT = 1.5; })).ok).toBe(false);
    // Altdateien ohne die neuen Felder bleiben gültig
    expect(parseProjektDatei(alsJson()).ok).toBe(true);
  });

  it('lehnt ungültige Präsentations-/Verhandlungsangaben ab', () => {
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.praesentation = { aktiv: true }; })).ok).toBe(false); // dauerAT fehlt
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.verhandlungRunde1 = 'ja'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.verhandlungRunde2 = { aktiv: true, dauerAT: 5, start: '2026-13-01' }; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.infoVersandAT = -1; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.zwischenbewertungAT = 2.5; })).ok).toBe(false);
  });

  it('Vergabeordnung: optional (fehlend = VgV), gültige Werte akzeptiert, ungültige abgelehnt (Kern 1.5.0/1.6.0)', () => {
    // fehlende Vergabeordnung: Datei aus Kern < 1.5.0 bleibt lesbar
    expect(parseProjektDatei(alsJson()).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'vob_a_eu'; })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'sektvo'; })).ok).toBe(true);
    // seit Kern 1.6.0 gültig: KonzVgV + Unterschwelle
    expect(parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'konzvgv'; })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'uvgo'; })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'vob_a_1'; })).ok).toBe(true);
    const ungueltig = parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'vol_a'; }));
    expect(ungueltig.ok).toBe(false);
    if (!ungueltig.ok) expect(ungueltig.fehler.join('\n')).toContain('input.vergabeordnung');
  });

  it('lehnt Verfahrensarten ab, die es in der Vergabeordnung nicht gibt (VSVgV + offen)', () => {
    const ergebnis = parseProjektDatei(alsJson((d) => { d.input.vergabeordnung = 'vsvgv'; }));
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fehler.join('\n')).toContain('nicht vorgesehen');
    expect(parseProjektDatei(alsJson((d) => {
      d.input.vergabeordnung = 'vsvgv';
      d.input.verfahrensart = 'nicht_offen_mit_tnw';
    })).ok).toBe(true);
  });

  it('beschraenkt_ohne_tnw nur im Unterschwellenbereich (Kern 1.6.0)', () => {
    expect(parseProjektDatei(alsJson((d) => {
      d.input.vergabeordnung = 'uvgo';
      d.input.verfahrensart = 'beschraenkt_ohne_tnw';
    })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => {
      d.input.vergabeordnung = 'vob_a_1';
      d.input.verfahrensart = 'beschraenkt_ohne_tnw';
    })).ok).toBe(true);
    // in der VgV (auch als Default ohne vergabeordnung) nicht vorgesehen
    const vgv = parseProjektDatei(alsJson((d) => { d.input.verfahrensart = 'beschraenkt_ohne_tnw'; }));
    expect(vgv.ok).toBe(false);
    if (!vgv.ok) expect(vgv.fehler.join('\n')).toContain('nicht vorgesehen');
  });

  it('fester Aufforderungstermin: optionales Datum (Kern 1.7.0)', () => {
    expect(parseProjektDatei(alsJson((d) => {
      d.input.verfahrensart = 'nicht_offen_mit_tnw';
      d.input.angebotsaufforderung = '2026-10-15';
    })).ok).toBe(true);
    expect(parseProjektDatei(alsJson((d) => { d.input.angebotsaufforderung = '2026-13-01'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.angebotsaufforderung = 'demnächst'; })).ok).toBe(false);
  });

  it('Abgabe-Uhrzeit: optionales HH:MM (Kern 1.8.0)', () => {
    // Altdateien ohne das Feld bleiben lesbar (kein Pflichtfeld)
    expect(parseProjektDatei(alsJson()).ok).toBe(true);
    const ok = parseProjektDatei(alsJson((d) => { d.input.optionen.abgabeUhrzeit = '10:00'; }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.datei.input.optionen.abgabeUhrzeit).toBe('10:00');
    // 24:00 ist keine Uhrzeit — Fristablauf am Tagesende heißt: Feld weglassen
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.abgabeUhrzeit = '24:00'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.abgabeUhrzeit = '10:60'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.abgabeUhrzeit = '9:00'; })).ok).toBe(false); // ohne führende Null
    expect(parseProjektDatei(alsJson((d) => { d.input.optionen.abgabeUhrzeit = 1000; })).ok).toBe(false);
  });

  it('lehnt kaputtes JSON und Nicht-Objekte verständlich ab', () => {
    expect(parseProjektDatei('{kaputt')).toEqual({ ok: false, fehler: ['Die Datei ist kein gültiges JSON.'] });
    expect(parseProjektDatei('[1,2]').ok).toBe(false);
    expect(parseProjektDatei('"text"').ok).toBe(false);
  });

  it('lehnt fremde Schema-Versionen mit Migrationshinweis ab', () => {
    const ergebnis = parseProjektDatei(alsJson((d) => { d.version = 2; }));
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fehler[0]).toContain('Schema-Version');
  });

  it('meldet fehlende Pflichtfelder mit Pfadangabe', () => {
    const ergebnis = parseProjektDatei(alsJson((d) => {
      delete d.rechenkernVersion;
      delete d.input.optionen.versandBieterinformation;
      delete d.input.interneFristen.bewertungAT;
    }));
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) {
      expect(ergebnis.fehler.join('\n')).toContain('rechenkernVersion');
      expect(ergebnis.fehler.join('\n')).toContain('input.optionen.versandBieterinformation');
      expect(ergebnis.fehler.join('\n')).toContain('input.interneFristen.bewertungAT');
    }
  });

  it('lehnt ungültige Werte ab (Datum, Auswahl, Zahlbereich, Bindefrist-XOR)', () => {
    expect(parseProjektDatei(alsJson((d) => { d.input.bekanntmachung = '2026-02-30'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.verfahrensart = 'freihaendig'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.bundesland = 'XX'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.bewertungAT = -1; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.interneFristen.bewertungAT = 2.5; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.fristen = { bindefrist: { tage: 60, termin: '2026-12-15' } }; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.input.fristen = { bindefrist: {} }; })).ok).toBe(false);
  });

  it('begrenzt Textlängen (Schutz vor Müll-Importen)', () => {
    const ergebnis = parseProjektDatei(alsJson((d) => { d.input.projekt.kunde = 'x'.repeat(501); }));
    expect(ergebnis.ok).toBe(false);
  });

  it('verlangt für gespeichertAm einen ISO-Zeitstempel', () => {
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = 'gestern Abend'; })).ok).toBe(false);
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17'; })).ok).toBe(false); // Datum ohne Zeit
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T18:30:00+02:00'; })).ok).toBe(true);
  });

  it('lehnt normalisierbare Schein-Zeitstempel ab (Date.parse-Falle)', () => {
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-02-30T12:00:00Z'; })).ok).toBe(false); // 30. Februar
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T25:00:00Z'; })).ok).toBe(false); // Stunde 25
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T12:61:00Z'; })).ok).toBe(false); // Minute 61
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T12:00:00+15:00'; })).ok).toBe(false); // Offset > 14 h
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T12:00:00+14:30'; })).ok).toBe(false); // 14 h nur mit :00
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2026-07-17T12:00:00+14:00'; })).ok).toBe(true); // Grenzfall Kiritimati
    expect(parseProjektDatei(alsJson((d) => { d.gespeichertAm = '2028-02-29T00:00:00.123Z'; })).ok).toBe(true); // Schalttag + Millisekunden
  });
});
