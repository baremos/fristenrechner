import type { ExportInhalt, GastgeberTexte } from './plattform';

/** Inhalte des bisherigen Web-Gastgebers; andere Gastgeber übergeben eigene Werte. */
export const webTexte: GastgeberTexte = {
  datenschutzTitel: 'Ihre Daten bleiben lokal.',
  datenschutzText: 'Eingaben werden nur in diesem Browser verarbeitet und nicht an BAREMOS IT oder Dritte übertragen.',
  speicherNichtVerfuegbar: 'Lokales Speichern ist in diesem Browser nicht verfügbar.',
  exportErfolg: 'Die Datei wurde erstellt und zum Speichern bereitgestellt.',
  importBeschriftung: 'Projekt importieren',
};
export const webExportInhalt: ExportInhalt = {
  herausgeber: 'BAREMOS IT GmbH',
  titel: 'Fristenrechner Vergabe & Terminplanung',
  adresse: { text: 'www.baremos.de/de/vergabe/fristenrechner/', href: 'https://www.baremos.de/de/vergabe/fristenrechner/' },
  dateiPraefix: 'BAREMOS-IT_',
};
