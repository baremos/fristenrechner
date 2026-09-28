import { describe, expect, it } from 'vitest';
import {
  addArbeitstage,
  addTage,
  aufArbeitstagVerschieben,
  feiertage,
  istArbeitstag,
  istGueltigesISODate,
  ostersonntag,
  pruefeISODate,
  tageZwischen,
  wochentag,
} from './kalender.js';

describe('Grundarithmetik', () => {
  it('addiert Kalendertage über Monats-, Jahres- und Schaltjahresgrenzen', () => {
    expect(addTage('2026-01-31', 1)).toBe('2026-02-01');
    expect(addTage('2026-12-31', 1)).toBe('2027-01-01');
    expect(addTage('2028-02-28', 1)).toBe('2028-02-29'); // Schaltjahr
    expect(addTage('2026-02-28', 1)).toBe('2026-03-01'); // kein Schaltjahr
    expect(addTage('2026-03-15', -20)).toBe('2026-02-23');
  });

  it('rechnet Differenzen konsistent zu addTage', () => {
    expect(tageZwischen('2026-09-01', '2026-10-06')).toBe(35);
    expect(tageZwischen('2026-10-06', '2026-09-01')).toBe(-35);
    expect(addTage('2026-09-01', 35)).toBe('2026-10-06');
  });

  it('kennt Wochentage (2026-07-17 ist ein Freitag)', () => {
    expect(wochentag('2026-07-17')).toBe(5);
    expect(wochentag('2026-07-18')).toBe(6);
    expect(wochentag('2026-07-19')).toBe(0);
  });

  it('validiert ISO-Daten strikt', () => {
    expect(istGueltigesISODate('2026-07-17')).toBe(true);
    expect(istGueltigesISODate('2026-02-30')).toBe(false);
    expect(istGueltigesISODate('2026-13-01')).toBe(false);
    expect(istGueltigesISODate('26-01-01')).toBe(false);
    expect(istGueltigesISODate('2026-7-1')).toBe(false);
    expect(() => pruefeISODate('kein-datum')).toThrow();
  });
});

describe('Bewegliche Feiertage', () => {
  it('berechnet Ostersonntag (Meeus/Jones/Butcher)', () => {
    expect(ostersonntag(2024)).toBe('2024-03-31');
    expect(ostersonntag(2025)).toBe('2025-04-20');
    expect(ostersonntag(2026)).toBe('2026-04-05');
    expect(ostersonntag(2027)).toBe('2027-03-28');
  });

  it('berechnet den Buß- und Bettag (Mittwoch vor dem 23.11.)', () => {
    const sn2025 = feiertage('SN', 2025).find((f) => f.name === 'Buß- und Bettag');
    const sn2026 = feiertage('SN', 2026).find((f) => f.name === 'Buß- und Bettag');
    expect(sn2025?.datum).toBe('2025-11-19');
    expect(sn2026?.datum).toBe('2026-11-18');
    expect(wochentag(sn2026!.datum)).toBe(3); // Mittwoch
  });
});

describe('Feiertage je Bundesland', () => {
  const namen = (land: Parameters<typeof feiertage>[0], jahr: number) =>
    feiertage(land, jahr).map((f) => f.name);

  it('führt die 9 bundesweiten Feiertage überall', () => {
    for (const land of ['BW', 'BE', 'HH', 'SN'] as const) {
      const n = namen(land, 2026);
      for (const erwartet of [
        'Neujahr', 'Karfreitag', 'Ostermontag', 'Tag der Arbeit', 'Christi Himmelfahrt',
        'Pfingstmontag', 'Tag der Deutschen Einheit', 'Erster Weihnachtsfeiertag', 'Zweiter Weihnachtsfeiertag',
      ]) {
        expect(n, `${erwartet} fehlt in ${land}`).toContain(erwartet);
      }
    }
  });

  it('Bayern: Dreikönig/Fronleichnam/Allerheiligen landesweit, Mariä Himmelfahrt und Friedensfest nur Teilgebiet', () => {
    const by = feiertage('BY', 2026);
    expect(by.find((f) => f.name === 'Heilige Drei Könige')?.landesweit).toBe(true);
    expect(by.find((f) => f.name === 'Fronleichnam')?.landesweit).toBe(true);
    expect(by.find((f) => f.name === 'Allerheiligen')?.landesweit).toBe(true);
    expect(by.find((f) => f.name === 'Mariä Himmelfahrt')?.landesweit).toBe(false);
    expect(by.find((f) => f.name === 'Augsburger Friedensfest')?.landesweit).toBe(false);
    expect(by.find((f) => f.name === 'Reformationstag')).toBeUndefined();
  });

  it('Sachsen: Reformationstag + Buß- und Bettag landesweit, Fronleichnam nur Teilgebiet', () => {
    const sn = feiertage('SN', 2026);
    expect(sn.find((f) => f.name === 'Reformationstag')?.landesweit).toBe(true);
    expect(sn.find((f) => f.name === 'Buß- und Bettag')?.landesweit).toBe(true);
    expect(sn.find((f) => f.name === 'Fronleichnam')?.landesweit).toBe(false);
  });

  it('Berlin/MV: Frauentag; Brandenburg: Oster- und Pfingstsonntag; Thüringen: Weltkindertag', () => {
    expect(namen('BE', 2026)).toContain('Internationaler Frauentag');
    expect(namen('MV', 2026)).toContain('Internationaler Frauentag');
    expect(namen('BB', 2026)).toEqual(expect.arrayContaining(['Ostersonntag', 'Pfingstsonntag']));
    expect(namen('TH', 2026)).toContain('Weltkindertag');
    expect(namen('HH', 2026)).not.toContain('Fronleichnam');
  });

  it('liefert chronologisch sortierte Listen mit korrektem Fronleichnam 2026', () => {
    const nw = feiertage('NW', 2026);
    const daten = nw.map((f) => f.datum);
    expect([...daten].sort()).toEqual(daten);
    expect(nw.find((f) => f.name === 'Fronleichnam')?.datum).toBe('2026-06-04');
  });
});

describe('Arbeitstagslogik', () => {
  it('Wochenenden und landesweite Feiertage sind keine Arbeitstage', () => {
    expect(istArbeitstag('2026-07-18', 'NW')).toBe(false); // Samstag
    expect(istArbeitstag('2026-07-17', 'NW')).toBe(true); // Freitag
    expect(istArbeitstag('2026-05-01', 'HH')).toBe(false); // Tag der Arbeit (Freitag)
    expect(istArbeitstag('2026-06-04', 'NW')).toBe(false); // Fronleichnam in NW
    expect(istArbeitstag('2026-06-04', 'HH')).toBe(true); // … aber nicht in HH
    expect(istArbeitstag('2025-10-31', 'SN')).toBe(false); // Reformationstag (Freitag)
    expect(istArbeitstag('2025-10-31', 'BW')).toBe(true);
  });

  it('Teilgebiets-Feiertage zählen nicht als Feiertag (konservativ)', () => {
    // Fronleichnam 2026 in Sachsen: nur Teilgebiet ⇒ Arbeitstag
    expect(istArbeitstag('2026-06-04', 'SN')).toBe(true);
  });

  it('verschiebt auf den nächsten Arbeitstag (über Osterblock 2026)', () => {
    // Karfreitag 03.04. → Sa → Ostersonntag → Ostermontag → Di 07.04.
    expect(aufArbeitstagVerschieben('2026-04-03', 'BW')).toBe('2026-04-07');
    expect(aufArbeitstagVerschieben('2026-07-17', 'BW')).toBe('2026-07-17'); // Arbeitstag bleibt
  });

  it('addiert Arbeitstage nach WORKDAY-Semantik', () => {
    // 01.04.2026 (Mi) + 2 AT: Do 02.04. (1), Karfreitag/Wochenende/Ostermontag übersprungen, Di 07.04. (2)
    expect(addArbeitstage('2026-04-01', 2, 'BW')).toBe('2026-04-07');
    expect(addArbeitstage('2026-04-01', 0, 'BW')).toBe('2026-04-01');
    expect(addArbeitstage('2026-07-17', 1, 'NW')).toBe('2026-07-20'); // Fr → Mo
    expect(addArbeitstage('2026-07-20', -1, 'NW')).toBe('2026-07-17'); // rückwärts
    expect(() => addArbeitstage('2026-07-17', 1.5, 'NW')).toThrow();
  });
});
