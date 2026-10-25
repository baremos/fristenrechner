import { expect, it } from 'vitest';
import {
  FEHLERCODES, MAX_PROJEKT_BYTES, PlattformFehler, WEB_SPEICHERSCHLUESSEL, pruefeProjektGroesse, pruefeAnsicht, pruefeFarbschema, initFristenrechner,
  type AusgabeDatei, type AusgabeFormat, type AusgabeWeg, type DateiErgebnis, type DateiImport,
  type DateiAusgabe, type Ansicht, type Farbschema, type Fehlercode, type GastgeberTexte, type HinweisPosition, type ImportBedienung, type Plattform, type ProjektSpeicher,
  type DateiAktion, type DateiAktionsZustand, type RechnerAktionen, type RechnerInstanz, type MenueZurueck,
} from '@baremos/fristenrechner-ui/ui';

it('stellt den App-Adaptern Konstanten und Typen über den öffentlichen Einstieg bereit', () => {
  const bedienung: ImportBedienung = 'schaltflaeche';
  const hinweis: HinweisPosition = 'unten';
  expect(hinweis).toBe('unten');
  const ansicht: Ansicht = 'kompakt';
  expect(pruefeAnsicht(ansicht)).toBe('kompakt');
  expect(pruefeAnsicht()).toBe('standard');
  expect(pruefeAnsicht('standard')).toBe('standard');
  expect(() => pruefeAnsicht('unbekannt' as unknown as Ansicht)).toThrow('Unbekannte Ansicht.');
  const schema: Farbschema = 'system';
  expect(pruefeFarbschema(schema)).toBe('system');
  expect(pruefeFarbschema()).toBe('hell');
  expect(pruefeFarbschema('hell')).toBe('hell');
  expect(() => pruefeFarbschema('dunkel' as unknown as Farbschema)).toThrow('Unbekanntes Farbschema.');
  const format: AusgabeFormat = 'projekt'; const weg: AusgabeWeg = 'teilen'; const code: Fehlercode = 'zu-gross';
  const datei: AusgabeDatei = { name: 'probe.json', mime: 'application/json;charset=utf-8', bytes: new Uint8Array([123, 125]) };
  const ergebnis: DateiErgebnis = { status: 'abgebrochen' };
  const speicher: ProjektSpeicher = { lesen: async () => null, schreiben: async () => {}, entfernen: async () => {} };
  const importieren: DateiImport = { waehlen: async () => ({ status: 'abgebrochen' }) };
  const ausgabe: DateiAusgabe = { exportieren: async () => ergebnis };
  const plattform: Plattform = { speicher, import: importieren, ausgabe, zeit: () => ({ zeitpunkt: '', kalendertag: '' }), zuruecksetzenBestaetigen: async () => false };
  expect(plattform.zurueck).toBeUndefined();
  const zurueck: MenueZurueck = { setzen: async (_aktiv) => {}, beobachten: (_fn) => () => {}, dispose() {} };
  const appPlattform: Plattform = { ...plattform, zurueck };
  expect(appPlattform.zurueck).toBe(zurueck);
  const texte: GastgeberTexte = { datenschutzTitel: '', datenschutzText: '', speicherNichtVerfuegbar: '', exportErfolg: '', importBeschriftung: '', ausgabeErfolg: { teilen: { projekt: '' } } };
  expect([bedienung, format, weg, datei.bytes.length, plattform.ausgabe, texte.exportErfolg]).toEqual(['schaltflaeche', 'projekt', 'teilen', 2, ausgabe, '']);
  expect(WEB_SPEICHERSCHLUESSEL).toBe('baremos-fristenrechner-projekt-v1');
  expect(MAX_PROJEKT_BYTES).toBe(1_048_576);
  expect(FEHLERCODES).toEqual(['nicht-verfuegbar', 'kein-speicher', 'zu-gross', 'lesen', 'schreiben', 'kein-ziel']);
  expect(new PlattformFehler(code, 'Probe').code).toBe(code);
  expect(() => pruefeProjektGroesse('a'.repeat(MAX_PROJEKT_BYTES + 1))).toThrow(PlattformFehler);
});

it('exportiert die gemeinsame Aktionsschnittstelle und bleibt mit dispose-Aufrufern kompatibel', () => {
  const aktion: DateiAktion = { art: 'ausgabe', format: 'pdf', weg: 'teilen' };
  const stand: DateiAktionsZustand = { geladen: true, beschaeftigt: false, hatErgebnis: true, kannTeilen: true, beendet: false };
  const aktionen: RechnerAktionen = {
    ausgeben: async (_format, _weg) => {}, projektImportieren: async () => {}, neuesProjekt: async () => {},
    zustand: () => stand, istErlaubt: auswahl => auswahl.art === 'ausgabe',
    beobachten: fn => { fn(stand); return () => {}; },
  };
  const instanz: RechnerInstanz = { aktionen, dispose() {} };
  const bisherigerAufrufer: { dispose(): void } = instanz;
  const initialisieren: (...args: Parameters<typeof initFristenrechner>) => RechnerInstanz = initFristenrechner;
  expect(initialisieren).toBe(initFristenrechner);
  expect(bisherigerAufrufer.dispose).toBe(instanz.dispose);
  expect(instanz.aktionen.istErlaubt(aktion)).toBe(true);
  expect(instanz.aktionen.zustand()).toEqual(stand);
});
