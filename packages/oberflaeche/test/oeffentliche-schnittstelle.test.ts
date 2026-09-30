import { expect, it } from 'vitest';
import {
  FEHLERCODES, MAX_PROJEKT_BYTES, PlattformFehler, WEB_SPEICHERSCHLUESSEL, pruefeProjektGroesse,
  type AusgabeDatei, type AusgabeFormat, type AusgabeWeg, type DateiErgebnis, type DateiImport,
  type DateiAusgabe, type Fehlercode, type GastgeberTexte, type ImportBedienung, type Plattform, type ProjektSpeicher,
} from '@baremos/fristenrechner-ui/ui';

it('stellt den App-Adaptern Konstanten und Typen über den öffentlichen Einstieg bereit', () => {
  const bedienung: ImportBedienung = 'schaltflaeche';
  const format: AusgabeFormat = 'projekt'; const weg: AusgabeWeg = 'teilen'; const code: Fehlercode = 'zu-gross';
  const datei: AusgabeDatei = { name: 'probe.json', mime: 'application/json;charset=utf-8', bytes: new Uint8Array([123, 125]) };
  const ergebnis: DateiErgebnis = { status: 'abgebrochen' };
  const speicher: ProjektSpeicher = { lesen: async () => null, schreiben: async () => {}, entfernen: async () => {} };
  const importieren: DateiImport = { waehlen: async () => ({ status: 'abgebrochen' }) };
  const ausgabe: DateiAusgabe = { exportieren: async () => ergebnis };
  const plattform: Plattform = { speicher, import: importieren, ausgabe, zeit: () => ({ zeitpunkt: '', kalendertag: '' }), zuruecksetzenBestaetigen: async () => false };
  const texte: GastgeberTexte = { datenschutzTitel: '', datenschutzText: '', speicherNichtVerfuegbar: '', exportErfolg: '', importBeschriftung: '', ausgabeErfolg: { teilen: { projekt: '' } } };
  expect([bedienung, format, weg, datei.bytes.length, plattform.ausgabe, texte.exportErfolg]).toEqual(['schaltflaeche', 'projekt', 'teilen', 2, ausgabe, '']);
  expect(WEB_SPEICHERSCHLUESSEL).toBe('baremos-fristenrechner-projekt-v1');
  expect(MAX_PROJEKT_BYTES).toBe(1_048_576);
  expect(FEHLERCODES).toEqual(['nicht-verfuegbar', 'kein-speicher', 'zu-gross', 'lesen', 'schreiben', 'kein-ziel']);
  expect(new PlattformFehler(code, 'Probe').code).toBe(code);
  expect(() => pruefeProjektGroesse('a'.repeat(MAX_PROJEKT_BYTES + 1))).toThrow(PlattformFehler);
});
