/**
 * Abbild eines Ergebnisses für die Referenzdateien. Termine stehen lesbar in
 * der Datei, Struktur und Texte als Fingerabdruck. Die Texte selbst stehen
 * einmal im Textverzeichnis, mit Platzhaltern für Datumswerte.
 */
import type { ScheduleResult } from './kern.js';

const FNV_BASIS = 0xcbf29ce484222325n;
const FNV_PRIMZAHL = 0x100000001b3n;
const BITS_64 = 0xffffffffffffffffn;

/**
 * Fingerabdruck mit 64 Bit (FNV-1a) über die UTF-16-Einheiten eines Textes,
 * niederwertiges Byte zuerst. Er erkennt Änderungen, er schützt nicht vor
 * absichtlicher Täuschung.
 */
export function fingerabdruck(text: string): string {
  let wert = FNV_BASIS;
  for (let i = 0; i < text.length; i++) {
    const einheit = text.charCodeAt(i);
    wert = ((wert ^ BigInt(einheit & 0xff)) * FNV_PRIMZAHL) & BITS_64;
    wert = ((wert ^ BigInt(einheit >> 8)) * FNV_PRIMZAHL) & BITS_64;
  }
  return wert.toString(16).padStart(16, '0');
}

function struktur(ergebnis: ScheduleResult): string {
  const starts = Object.entries(ergebnis.fruehesteStarts).sort(([a], [b]) => (a < b ? -1 : 1));
  const bindefrist = ergebnis.bindefrist;
  return JSON.stringify([
    ergebnis.meilensteine.map((m) => [
      m.id,
      m.phase,
      m.fristTyp,
      m.abhaengigVon,
      m.rechtsgrundlage ?? null,
      m.dauerAT ?? null,
    ]),
    ergebnis.phasen.map((p) => [p.id, p.von, p.bis, p.meilensteine]),
    ergebnis.konflikte.map((k) => [k.option, k.gewaehlt, k.fruehestens]),
    starts,
    bindefrist === undefined ? null : [bindefrist.termin, bindefrist.tage, bindefrist.basis],
  ]);
}

function texte(ergebnis: ScheduleResult): string {
  return JSON.stringify([
    ergebnis.meilensteine.map((m) => [m.label, m.rechenweg, m.warnungen]),
    ergebnis.phasen.map((p) => p.label),
    ergebnis.konflikte.map((k) => k.text),
    ergebnis.warnungen,
    ergebnis.rechtsstand,
  ]);
}

/** Eine Zeile der Referenzdatei: Fall, Termine, Fingerabdrücke. */
export function zeile(id: string, ergebnis: ScheduleResult): string {
  const termine = ergebnis.meilensteine.map((m) => (m.bis === undefined ? m.datum : `${m.datum}~${m.bis}`));
  return [
    id,
    termine.length > 0 ? termine.join(' ') : '-',
    `s:${fingerabdruck(struktur(ergebnis))} t:${fingerabdruck(texte(ergebnis))}`,
  ].join(' | ');
}

/**
 * Ersetzt Datumswerte und die gezählten Tage einer Eingabe durch Platzhalter.
 * Zahlen, die eine Regel nennt (etwa eine Mindestfrist), bleiben stehen.
 */
export function muster(text: string): string {
  return text
    .replace(/\d{2}\.\d{2}\.\d{4}/g, 'TT.MM.JJJJ')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'JJJJ-MM-TT')
    .replace(/^-?\d+ (?=Kalendertage|Arbeitstage)/, 'n ')
    .replace(/Dauer \d+ (?=Arbeitstage)/, 'Dauer n ')
    .replace(/— -?\d+ (?=Kalendertage ab Angebotsabgabe)/, '— n ')
    .replace(/verwendet wird \d+/, 'verwendet wird n');
}

/** Sammelt alle Texte der Ergebnisse, je Art sortiert und ohne Wiederholung. */
export function textverzeichnis(ergebnisse: readonly ScheduleResult[]): string[] {
  const arten = new Map<string, Set<string>>();
  const merke = (art: string, text: string): void => {
    const menge = arten.get(art) ?? new Set<string>();
    menge.add(muster(text));
    arten.set(art, menge);
  };
  for (const ergebnis of ergebnisse) {
    merke('Rechtsstand', ergebnis.rechtsstand);
    for (const p of ergebnis.phasen) merke('Phase', p.label);
    for (const m of ergebnis.meilensteine) {
      merke('Meilenstein', m.label);
      merke('Rechenweg', m.rechenweg);
      if (m.rechtsgrundlage !== undefined) merke('Rechtsgrundlage', m.rechtsgrundlage);
      for (const w of m.warnungen) merke('Warnung am Termin', w);
    }
    for (const k of ergebnis.konflikte) merke('Konflikt', k.text);
    for (const w of ergebnis.warnungen) merke('Hinweis', w);
  }
  const zeilen: string[] = [];
  for (const art of [...arten.keys()].sort()) {
    zeilen.push('', `## ${art}`);
    for (const text of [...(arten.get(art) ?? [])].sort()) zeilen.push(text);
  }
  return zeilen;
}
