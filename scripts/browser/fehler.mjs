// Steuerung und Messung liefern bei fehlenden Belegen keinen Produktbefund.
export class Messfehler extends Error {
  constructor(meldung, optionen) { super(meldung, optionen); this.name = 'Messfehler'; }
}

export async function messbefehl(fn) {
  try { return await fn(); }
  catch (ursache) {
    if (ursache instanceof Messfehler) throw ursache;
    throw new Messfehler(ursache.message, { cause: ursache });
  }
}
