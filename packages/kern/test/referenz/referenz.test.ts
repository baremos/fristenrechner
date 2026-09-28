/**
 * Referenzprüfung: Der Rechenkern rechnet das feste Raster und vergleicht das
 * Ergebnis mit den hinterlegten Dateien. Die Dateien tragen die Regelversion
 * im Namen. Wer eine Regel ändert, hebt die Regelversion an, schreibt die
 * Dateien mit `npm run referenz:schreiben` neu und prüft die Unterschiede.
 */
import { describe, expect, it } from 'vitest';
import { textverzeichnis, zeile } from './abbild.js';
import { calculateSchedule, defaultFristen, feiertage, RECHTSSTAND_DATUM, REGELVERSION } from './kern.js';
import {
  ARTEN,
  FEIERTAGS_JAHRE,
  LAENDER,
  ORDNUNGEN,
  PROFILE,
  referenzfaelle,
  STARTTERMINE,
  VORGABE_OPTIONEN,
} from './raster.js';

const KOPF = `# Regelversion ${REGELVERSION}, Rechtsstand ${RECHTSSTAND_DATUM}`;
const faelle = referenzfaelle();
const ergebnisse = faelle.map((fall) => calculateSchedule(fall.input));

function datei(zeilen: readonly string[]): string {
  return [...zeilen, ''].join('\n');
}

describe(`Referenz der Regelversion ${REGELVERSION}`, () => {
  it('das Raster ist vollständig und eindeutig', () => {
    expect(faelle).toHaveLength(ORDNUNGEN.length * ARTEN.length * PROFILE.length * 3 + ARTEN.length);
    expect(new Set(faelle.map((fall) => fall.id)).size).toBe(faelle.length);
    expect(new Set(faelle.map((fall) => fall.input.bundesland))).toEqual(new Set(LAENDER));
    expect(new Set(faelle.map((fall) => fall.input.bekanntmachung))).toEqual(new Set(STARTTERMINE));
  });

  it('jede Vergabeordnung liefert Termine', () => {
    for (const ordnung of ORDNUNGEN) {
      const mitTerminen = faelle.filter(
        (fall, i) => fall.input.vergabeordnung === ordnung && ergebnisse[i].meilensteine.length > 0
      );
      expect(mitTerminen.length, ordnung).toBeGreaterThan(0);
    }
  });

  it('jedes Ergebnis nennt Regelversion und Rechtsstand', () => {
    for (const ergebnis of ergebnisse) {
      expect(ergebnis.regelversion).toBe(REGELVERSION);
      expect(ergebnis.rechtsstandDatum).toBe(RECHTSSTAND_DATUM);
      expect(ergebnis.rechtsstand).not.toBe('');
    }
  });

  it('Termine, Struktur und Texte entsprechen der Referenz', async () => {
    const zeilen = [
      KOPF,
      '# Je Zeile: Fall | Termine in der Reihenfolge der Meilensteine | Fingerabdruck der Struktur (s) und der Texte (t)',
      '# Fall: Vergabeordnung/Verfahrensart/Profil/Starttermin/Land. Ein Zeitraum steht als Beginn~Ende.',
      ...faelle.map((fall, i) => zeile(fall.id, ergebnisse[i])),
    ];
    await expect(datei(zeilen)).toMatchFileSnapshot(`./referenz-${REGELVERSION}.txt`);
  });

  it('die Texte entsprechen dem Textverzeichnis', async () => {
    const zeilen = [
      KOPF,
      '# Alle Texte, die der Rechenkern im Raster ausgibt, je Art sortiert.',
      '# Platzhalter: TT.MM.JJJJ für ein Datum, n für die gezählten Tage einer Eingabe.',
      ...textverzeichnis(ergebnisse),
    ];
    await expect(datei(zeilen)).toMatchFileSnapshot(`./texte-${REGELVERSION}.txt`);
  });

  it('die Vorschlagswerte entsprechen der Referenz', async () => {
    const zeilen = [KOPF, '# Je Zeile: Vergabeordnung/Verfahrensart/Optionen: Vorschlagswerte der Fristen'];
    for (const ordnung of ORDNUNGEN) {
      for (const art of ARTEN) {
        for (const { name, optionen } of VORGABE_OPTIONEN) {
          const werte = Object.entries(defaultFristen(ordnung, art, optionen))
            .filter(([, wert]) => wert !== undefined)
            .map(([feld, wert]) => `${feld}=${JSON.stringify(wert)}`);
          zeilen.push(`${ordnung}/${art}/${name}: ${werte.length > 0 ? werte.join(' ') : '-'}`);
        }
      }
    }
    await expect(datei(zeilen)).toMatchFileSnapshot(`./vorgaben-${REGELVERSION}.txt`);
  });

  it('die Feiertage entsprechen der Referenz', async () => {
    const zeilen = [KOPF, '# Je Zeile: Land Jahr: Feiertage. Ein Stern kennzeichnet Feiertage, die nur in Teilen des Landes gelten.'];
    for (const land of LAENDER) {
      for (const jahr of FEIERTAGS_JAHRE) {
        const tage = feiertage(land, jahr).map((f) => `${f.datum} ${f.name}${f.landesweit ? '' : '*'}`);
        zeilen.push(`${land} ${jahr}: ${tage.join('; ')}`);
      }
    }
    await expect(datei(zeilen)).toMatchFileSnapshot(`./feiertage-${REGELVERSION}.txt`);
  });
});
