// Steuerung und Messung liefern bei fehlenden Belegen keinen Produktbefund.
export class Messfehler extends Error {
  constructor(meldung, optionen) { super(meldung, optionen); this.name = 'Messfehler'; }
}

export class Produktabweichung extends Error {
  constructor(befund) {
    super(`${befund.art === 'element-fehlt' ? 'Bedienelement fehlt' : 'Bedienelement ist gesperrt'}: ${befund.selector}`);
    this.name = 'Produktabweichung'; this.befund = befund;
  }
}

export function produktbefundPruefen(wert) {
  const befund = wert?.produktabweichung;
  if (!befund) return wert;
  if (!['element-fehlt', 'element-gesperrt'].includes(befund.art) || typeof befund.selector !== 'string' || !befund.selector) {
    throw new Messfehler('Browserausdruck liefert keinen gültigen Produktbefund.');
  }
  throw new Produktabweichung(befund);
}

export function browserErgebnis(antwort) {
  if (antwort?.exceptionDetails) throw new Messfehler(`Browserausdruck fehlgeschlagen: ${antwort.exceptionDetails.exception?.description ?? antwort.exceptionDetails.text}`);
  if (!antwort?.result || typeof antwort.result !== 'object'
      || (!Object.hasOwn(antwort.result, 'value') && antwort.result.type !== 'undefined')) throw new Messfehler('Browserausdruck ohne Messergebnis.');
  return produktbefundPruefen(antwort.result.value);
}

export async function messbefehl(fn) {
  try { return await fn(); }
  catch (ursache) {
    if (ursache instanceof Messfehler || ursache instanceof Produktabweichung) throw ursache;
    throw new Messfehler(ursache.message, { cause: ursache });
  }
}
