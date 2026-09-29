// Regel für den Hinweis „Eine neuere Version kann vorliegen“: Er erscheint ab dem
// Tag nach Rechtsstand plus zwölf Monate. Fehlt dieser Kalendertag im Zielmonat
// (29. Februar), gilt der letzte Tag des Monats. Es zählt das Datum des Geräts.

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

function zerlege(iso: string): [number, number, number] {
  const teile = ISO_DATUM.exec(iso);
  if (!teile) throw new Error(`Kein Datum im Format JJJJ-MM-TT: ${iso}`);
  const [jahr, monat, tag] = [Number(teile[1]), Number(teile[2]), Number(teile[3])];
  if (monat < 1 || monat > 12 || tag < 1 || tag > tageImMonat(jahr, monat)) {
    throw new Error(`Kein gültiges Datum: ${iso}`);
  }
  return [jahr, monat, tag];
}

function iso(jahr: number, monat: number, tag: number): string {
  return `${String(jahr).padStart(4, '0')}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/** Letzter Tag ohne Hinweis: derselbe Kalendertag zwölf Monate später; fehlt er, der letzte Tag dieses Monats. */
export function hinweisGrenze(rechtsstandISO: string): string {
  const [jahr, monat, tag] = zerlege(rechtsstandISO);
  return iso(jahr + 1, monat, Math.min(tag, tageImMonat(jahr + 1, monat)));
}

/** true, wenn heuteISO (örtliches Kalenderdatum) nach der Grenze liegt. */
export function rechtsstandHinweisNoetig(heuteISO: string, rechtsstandISO: string): boolean {
  zerlege(heuteISO);
  return heuteISO > hinweisGrenze(rechtsstandISO);
}

/** Örtliches Kalenderdatum als JJJJ-MM-TT, ohne Zeitzonenrechnung. */
export function heuteLokal(jetzt: Date = new Date()): string {
  return iso(jetzt.getFullYear(), jetzt.getMonth() + 1, jetzt.getDate());
}
