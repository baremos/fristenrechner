// Neue Phasen ergänzen hier ihre Pflichtkennungen; alle-v6a bleibt unverändert.
const gemeinsam = ['JS', 'ENDE', 'NETZ', 'NETZ-VERBINDUNGEN'];
export const ERGEBNISKATALOG = Object.freeze({
  vertrag: Object.freeze([...Array.from({ length: 9 }, (_, i) => `V${i + 1}`), 'V-VERTRAG', ...gemeinsam]),
  webadapter: Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5-json', 'W5-xlsx', 'W5-pdf', 'W6', 'W7', 'W8',
    'W9', 'W10', 'W11', 'W12-Enter', 'W12-Leertaste', 'BOX-320', ...gemeinsam]),
});
// Diese Kennungen sind ausschließlich zusätzliche ungültige Rahmenbelege.
export const RAHMENFEHLER = Object.freeze(['LAUF', 'NETZ-CDP', 'NETZ-NACHWEIS', 'AUFRAEUMEN']);
