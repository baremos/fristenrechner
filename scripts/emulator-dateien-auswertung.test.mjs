// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DATEI_MIME, erzeugeDateiBeleg, pruefeDateiStruktur, evaluiereDateiFall, dateiFallId, pruefeDateienAbdeckung, werteDateienAus } from './emulator/dateien-auswertung.mjs';
import { werteLaufAus } from './emulator-auswertung.mjs';

const OK = 'bestanden', NEIN = 'nicht bestanden', UNGUELTIG = 'ungültig', GRENZE = 'dokumentierte Grenze';
const status = (b, s) => assert.equal(b.status, s, b.grund);
const fixture = name => JSON.parse(readFileSync(new URL(`./emulator/fixtures/${name}`, import.meta.url), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const grund = (fall = 'D1', name = 'speichern', format = 'json') => ({ schema: 1, fall, name, variante: 'debug', ...(format ? { format } : {}), umgebung: { picker: true, empfaenger: true, provider: true }, belege: ['dateien/probe.json'] });
const projekt = { projektname: 'Projekt Ä', vergabenummer: '42' };
function zip() {
  const name = Buffer.from('[Content_Types].xml'), data = Buffer.from('<Types/>');
  const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(name.length, 26);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(c.length + name.length, 12); end.writeUInt32LE(l.length + name.length + data.length, 16);
  return Buffer.concat([l, name, data, c, name, end]);
}
const roh = format => format === 'json' ? Buffer.from(JSON.stringify(projekt)) : format === 'xlsx' ? zip() : Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF\n');
function transfer(format = 'json', fall = 'D1', name = 'speichern') {
  const b = roh(format), d = erzeugeDateiBeleg(b, `projekt.${format}`, DATEI_MIME[format], 'bruecke');
  return { ...grund(fall, name, format), referenz: d, ziel: { ...d, quelle: undefined } };
}
function importFall(name = 'import') {
  const hash = sha(roh('json'));
  return { ...grund('D6', name), messung: { auswahl: 'documentsui', quelleDatei: 'dateien/quelle.bin', bytes: roh('json').length, quelleSha256: hash, brueckeSha256: hash, projektVor: { projektname: 'Alt' }, projektNach: projekt, projektErwartet: projekt, gespeichertNach: projekt, aufrufe: 1, aktionenFrei: true, abgebrochen: false } };
}
function provider(name) {
  const zuGross = name.startsWith('zu-gross'), size = zuGross ? 1048577 : 1048576;
  const metadata = name.endsWith('unbekannt') ? null : name.endsWith('falsch-klein') ? 1 : name.endsWith('falsch-gross') ? 2097152 : size;
  const m = importFall(name); m.fall = 'D7';
  Object.assign(m.messung, { bytes: size, ergebnis: zuGross ? 'zu-gross' : 'ok', mehrbyte: true, providerGroesse: metadata, provider: { format: 1, id: name, name: `${name}.json`, angeboteneBytes: size, angegebeneGroesse: metadata, sha256: sha(roh('json')), geleseneBytes: size, geschlossen: true, streamFehler: false } });
  if (zuGross) Object.assign(m.messung, { projektNach: m.messung.projektVor, gespeichertNach: m.messung.projektVor });
  return m;
}
function grants(format = 'json') {
  const uri = `content://de.baremos.fristenrechner.exportdateien/export/auftrag/projekt.${format}`, bytes = roh(format);
  const pfade = { schreiben: uri, nachbar: 'content://de.baremos.fristenrechner.exportdateien/export/auftrag/nachbar.json', projekt: 'content://de.baremos.fristenrechner.exportdateien/export/../../shared_prefs/CapacitorStorage.xml' };
  return { format: 1, uri, name: `projekt.${format}`, mime: DATEI_MIME[format], intentMime: DATEI_MIME[format], groesse: bytes.length, angegebeneGroesse: bytes.length, sha256: sha(bytes), schreibenVerweigert: true, nachbarVerweigert: true, projektVerweigert: true, ...Object.fromEntries(['schreiben', 'nachbar', 'projekt'].map(k => [k, { uri: pfade[k], modus: k === 'schreiben' ? 'w' : 'r', verweigert: true, fehler: 'SecurityException' }])) };
}

for (const format of ['json', 'xlsx', 'pdf']) test(`D1 ${format}: Bytes, Hash, Größe und echte Struktur müssen zusammenpassen`, () => {
  const m = transfer(format); status(evaluiereDateiFall(m), OK);
  const p = structuredClone(m); p.ziel.sha256 = '0'.repeat(64); status(evaluiereDateiFall(p), UNGUELTIG);
  const z = structuredClone(m); z.ziel = erzeugeDateiBeleg(Buffer.concat([roh(format), Buffer.from('x')]), `projekt.${format}`, DATEI_MIME[format]); status(evaluiereDateiFall(z), NEIN);
  const n = structuredClone(m); n.ziel.name = `falsch.${format}`; status(evaluiereDateiFall(n), NEIN);
  const mime = structuredClone(m); mime.ziel.mime = 'text/plain'; status(evaluiereDateiFall(mime), NEIN);
  const cache = structuredClone(m); cache.referenz.quelle = 'cache'; status(evaluiereDateiFall(cache), UNGUELTIG);
  const groesse = structuredClone(m); groesse.ziel.bytes++; status(evaluiereDateiFall(groesse), UNGUELTIG);
  const ohne = structuredClone(m); delete ohne.ziel.base64; status(evaluiereDateiFall(ohne), UNGUELTIG);
});

for (const f of ['schema', 'fall', 'variante', 'name', 'umgebung', 'belege']) test(`Dateifall ohne ${f} wird nicht als Erfolg übernommen`, () => { const m = transfer(); delete m[f]; status(evaluiereDateiFall(m), UNGUELTIG); });

test('Base64, Pfade, Format und eingebettete Erfolgsbehauptungen werden streng geprüft', () => {
  for (const path of ['../extern.json', '/extern.json', 'C:/extern.json', 'dateien\\probe.json', 'dateien//probe.json', 'dateien/./probe.json']) { const m = transfer(); m.belege = [path]; status(evaluiereDateiFall(m), UNGUELTIG); }
  for (const base64 of ['eA', 'eA==\n', '!!!!', 'eB==']) { const m = transfer(); m.ziel.base64 = base64; status(evaluiereDateiFall(m), UNGUELTIG); }
  const m = transfer(); delete m.ziel; m.status = 'bestanden'; m.meldung = 'Projektdatei gespeichert.'; status(evaluiereDateiFall(m), UNGUELTIG);
  status(evaluiereDateiFall(null), UNGUELTIG);
  status(evaluiereDateiFall({ ...transfer(), format: 'exe' }), UNGUELTIG);
  assert.equal(dateiFallId(transfer()), 'dateien-debug-D1-speichern-json');
});

test('Struktur verlangt gültiges UTF-8/JSON, ZIP-Verzeichnis und vollständige PDF-Marker', () => {
  assert.equal(pruefeDateiStruktur('json', Buffer.from('{}')), true);
  assert.equal(pruefeDateiStruktur('json', Buffer.from([123, 34, 195, 40, 34, 58, 49, 125])), false);
  assert.equal(pruefeDateiStruktur('json', Buffer.from('{')), false);
  assert.equal(pruefeDateiStruktur('xlsx', Buffer.from('PK [Content_Types].xml')), false);
  const bad = zip(); bad.writeUInt32LE(9999999, bad.length - 6); assert.equal(pruefeDateiStruktur('xlsx', bad), false);
  assert.equal(pruefeDateiStruktur('xlsx', zip().subarray(0, -1)), false);
  assert.equal(pruefeDateiStruktur('pdf', Buffer.from('%PDF-1.7')), false);
  assert.equal(pruefeDateiStruktur('pdf', Buffer.from('%PDF-1.7\n%%EOF junk')), false);
  assert.equal(pruefeDateiStruktur('exe', Buffer.from('MZ')), false);
});

test('C3-Messwerte ohne ursprüngliche Rohbytes sind keine neue Hash-Abnahme', () => {
  for (const d of fixture('dateien-c3-api30.json').speichern) {
    const m = { ...grund('D1', 'speichern', d.format), referenz: { ...d, name: `projekt.${d.format}`, quelle: 'bruecke' }, ziel: { ...d, name: `projekt.${d.format}` } };
    status(evaluiereDateiFall(m), UNGUELTIG);
  }
});

test('D1 Release verlangt ebenfalls die unveränderte Brückenreferenz', () => {
  const m = transfer(); m.variante = 'release'; status(evaluiereDateiFall(m), OK);
  m.referenz.quelle = 'release-cache-vor-uebergabe'; status(evaluiereDateiFall(m), UNGUELTIG);
});

for (const format of ['json', 'xlsx']) test(`D2 ${format}: gleicher Stand, Datum und unveränderte Bytes`, () => {
  const { referenz } = transfer(format), m = { ...grund('D2', 'determinismus', format), exporte: [referenz, { ...referenz }], zeitFixiert: '2026-10-01T10:00:00.000Z', tage: ['2026-10-01', '2026-10-01'] };
  status(evaluiereDateiFall(m), OK);
  const a = structuredClone(m); a.exporte[1] = erzeugeDateiBeleg(format === 'json' ? Buffer.from('{"x":1}') : Buffer.from('wrong'), `projekt.${format}`, DATEI_MIME[format], 'bruecke'); status(evaluiereDateiFall(a), NEIN);
  const fehlt = structuredClone(m); fehlt.exporte.pop(); status(evaluiereDateiFall(fehlt), UNGUELTIG);
  if (format === 'xlsx') { m.tage[1] = '2026-10-02'; status(evaluiereDateiFall(m), GRENZE); m.tage[0] = '2026-99-99'; status(evaluiereDateiFall(m), UNGUELTIG); }
  else { delete m.zeitFixiert; status(evaluiereDateiFall(m), UNGUELTIG); }
});

test('D3 Abbruch, Name mit Kopiezahl und offener Schließfehler sind getrennte Fälle', () => {
  const m = { ...grund('D3', 'abbruch'), messung: { antwortStatus: 'abgebrochen', downloadVor: ['alt.json'], downloadNach: ['alt.json'], aktionenFrei: true } }; status(evaluiereDateiFall(m), OK);
  m.messung.downloadNach.push('neu.json'); status(evaluiereDateiFall(m), NEIN);
  const erneut = transfer('json', 'D3', 'erneut'); status(evaluiereDateiFall(erneut), OK);
  const kopie = transfer('json', 'D3', 'gleicher-name'); kopie.kopie = 1; kopie.ziel.name = 'projekt (1).json'; status(evaluiereDateiFall(kopie), OK);
  kopie.kopie = 2; status(evaluiereDateiFall(kopie), NEIN);
  const offen = { ...grund('D3', 'schliessfehler'), grenze: { code: 'nicht-provozierbar', produktUnveraendert: true, grund: 'Der lokale Anbieter bietet keinen einstellbaren Fehler beim Schließen.' } }; status(evaluiereDateiFall(offen), GRENZE);
  offen.grenze.produktUnveraendert = false; status(evaluiereDateiFall(offen), UNGUELTIG);
});

test('D4 historische Auswahl, Einzelziel und fehlender Empfänger unterscheiden sich', () => {
  for (const f of fixture('dateien-c3-api30.json').teilen) {
    const m = { ...grund('D4', 'rueckkehr', f.format), messung: { ...f, obenVor: 'de.baremos.fristenrechner/.MainActivity', obenNach: fixture('dateien-c4-api30.json').obenNach, erneuterAuftrag: true } };
    status(evaluiereDateiFall(m), f.modus === 'ohne-empfaenger' ? GRENZE : OK);
    m.messung.erneuterAuftrag = false; status(evaluiereDateiFall(m), NEIN);
  }
});

for (const format of ['json', 'xlsx', 'pdf']) test(`D5 ${format}: empfangene Bytes und tatsächliche Sicherheitsablehnungen`, () => {
  const m = transfer(format, 'D5', 'empfang'); m.grants = grants(format); status(evaluiereDateiFall(m), OK);
  const p = structuredClone(m); p.grants.schreiben.fehler = 'FileNotFoundException'; status(evaluiereDateiFall(p), NEIN);
  const q = structuredClone(m); q.grants.projektVerweigert = false; status(evaluiereDateiFall(q), NEIN);
  const u = structuredClone(m); delete u.grants.nachbar; status(evaluiereDateiFall(u), UNGUELTIG);
  m.umgebung.empfaenger = false; status(evaluiereDateiFall(m), UNGUELTIG);
});

for (const name of ['import', 'erneut', 'wieder-oeffnen']) test(`D6 ${name}: Brückenhash, Formular und Speicher`, () => {
  const m = importFall(name); status(evaluiereDateiFall(m), OK);
  const falsch = structuredClone(m); falsch.messung.brueckeSha256 = '0'.repeat(64); status(evaluiereDateiFall(falsch), NEIN);
  const doppelt = structuredClone(m); doppelt.messung.aufrufe = 2; status(evaluiereDateiFall(doppelt), NEIN);
  m.messung.auswahl = 'setInputFiles'; status(evaluiereDateiFall(m), UNGUELTIG);
});

test('D6 Abbruch darf keine Quelle oder Projektänderung vortäuschen', () => {
  const m = importFall('abbruch'); Object.assign(m.messung, { abgebrochen: true, projektNach: m.messung.projektVor, gespeichertNach: m.messung.projektVor }); status(evaluiereDateiFall(m), OK);
  m.messung.gespeichertNach = projekt; status(evaluiereDateiFall(m), NEIN);
});

for (const name of ['grenze', 'zu-gross', 'grenze-unbekannt', 'zu-gross-unbekannt', 'grenze-falsch-klein', 'zu-gross-falsch-klein', 'grenze-falsch-gross']) test(`D7 ${name}: Bytegrenze unabhängig von Metadaten`, () => {
  const m = provider(name); status(evaluiereDateiFall(m), OK);
  const missing = structuredClone(m); delete missing.messung.provider; status(evaluiereDateiFall(missing), UNGUELTIG);
  const bytes = structuredClone(m); bytes.messung.bytes++; status(evaluiereDateiFall(bytes), UNGUELTIG);
  const falsche = structuredClone(m); falsche.messung.ergebnis = name.startsWith('grenze') ? 'zu-gross' : 'ok'; status(evaluiereDateiFall(falsche), NEIN);
  m.messung.mehrbyte = false; status(evaluiereDateiFall(m), UNGUELTIG);
});

for (const [name, code] of Object.entries({ leer: 'format', format: 'format', utf8: 'lesen', schema: 'schema', lesefehler: 'lesen', bom: 'ok' })) test(`D8 ${name}: Inhalt und Streamfehler getrennt`, () => {
  const m = importFall(name); m.fall = 'D8'; Object.assign(m.messung, { bytes: name === 'leer' ? 0 : 100, ergebnis: code });
  m.messung.provider = { format: 1, id: name, name: `${name}.json`, angeboteneBytes: m.messung.bytes, sha256: m.messung.quelleSha256, geleseneBytes: m.messung.bytes, geschlossen: true, streamFehler: false };
  if (name !== 'bom') Object.assign(m.messung, { projektNach: m.messung.projektVor, gespeichertNach: m.messung.projektVor });
  // Das Dokument „lesefehler“ ist 512 KiB groß, der Stream scheitert nach 256 KiB (Lesevorgriff des Kernels).
  if (name === 'lesefehler') { m.messung.bytes = 524288; Object.assign(m.messung.provider, { angeboteneBytes: 524288, streamFehler: true, geleseneBytes: 262144 }); }
  if (name === 'bom') { m.umgebung.provider = false; m.messung.quelleSha256 = 'f'.repeat(64); m.messung.quelleOhneBomSha256 = m.messung.brueckeSha256; }
  status(evaluiereDateiFall(m), OK);
  if (name === 'lesefehler') { m.messung.provider.streamFehler = false; status(evaluiereDateiFall(m), UNGUELTIG); }
  else if (name === 'bom') { delete m.messung.quelleOhneBomSha256; status(evaluiereDateiFall(m), NEIN); }
  else { m.messung.ergebnis = 'ok'; status(evaluiereDateiFall(m), NEIN); }
});

for (const api of [30, 36]) for (const name of ['abbrechen', 'zurueck', 'bestaetigen']) test(`D9 API ${api} ${name}: aufgezeichnete deutschen Texte und Fokus`, () => {
  const m = { ...grund('D9', name, null), messung: { dialog: fixture(`dateien-c4-api${api}.json`).dialog, projektVor: projekt, projektNach: name === 'bestaetigen' ? {} : projekt, gespeichertNach: name === 'bestaetigen' ? {} : projekt, aktionenFrei: true, resetAufrufe: 1 } };
  status(evaluiereDateiFall(m), OK);
  m.messung.dialog.fokus = 'android:id/button1'; status(evaluiereDateiFall(m), NEIN);
});

for (const api of [30, 36]) test(`D10 API ${api}: aufgezeichnete neue Seite bei gleicher PID ist erforderlich`, () => {
  const m = { ...grund('D10', 'neuerstellung-dialog', null), messung: { ...fixture(`dateien-c4-api${api}.json`).neuerstellung, hakenNach: false, projektVor: projekt, projektNach: projekt, aktionenFrei: true, importAufrufe: 0, resetAufrufe: 0, auswahlVor: true, auswahlNach: false } };
  status(evaluiereDateiFall(m), OK);
  m.messung.seiteNach = m.messung.seiteVor; status(evaluiereDateiFall(m), NEIN);
});

for (const name of ['neuerstellung-auswahl', 'hintergrund-auswahl', 'force-stop-auswahl', 'drehung-auswahl']) test(`D10 ${name}: Prozess-, Seiten- und Hakenidentität`, () => {
  const neu = name.startsWith('neuerstellung'), stop = name.startsWith('force-stop');
  const m = { ...grund('D10', name, null), messung: { pidVor: 10, pidNach: stop ? 20 : 10, seiteVor: 'vor', seiteNach: neu || stop ? 'nach' : 'vor', hakenNach: !neu && !stop, projektVor: projekt, projektNach: projekt, aktionenFrei: true, importAufrufe: 0, resetAufrufe: 0, auswahlVor: true, auswahlNach: !stop, fontScale: { vor: '1.0', waehrend: '1.15', nach: '1.0' }, rotation: { vor: 0, waehrend: 1, nach: 0 } } };
  status(evaluiereDateiFall(m), OK);
  const dup = structuredClone(m); dup.messung.importAufrufe = 2; status(evaluiereDateiFall(dup), NEIN);
  m.messung.hakenNach = !m.messung.hakenNach; status(evaluiereDateiFall(m), NEIN);
});

test('D11: alter und frischer Grant, Kontrollbereich und Widerruf sind Pflicht', () => {
  const jetzt = 1000000000, alt = jetzt - 3600000, frisch = jetzt + 23 * 3600000, danach = jetzt + 25 * 3600000, uri = grants().uri;
  const m = { ...grund('D11', 'cache', null), messung: { altId: 'alt', frischId: 'frisch', altVor: true, altNach: false, frischVor: true, frischNach: true, fremdVor: 'a'.repeat(64), fremdNach: 'a'.repeat(64), prefsVor: `<map><long name="alt" value="${jetzt}"/><long name="frisch" value="${frisch}"/></map>`, prefsGealtert: `<map><long name="alt" value="${alt}"/><long name="frisch" value="${frisch}"/></map>`, prefsNach: `<map><long name="frisch" value="${frisch}"/></map>`, startListe: 'alt\nfrisch', zeit: { jetzt, gealtert: alt, beimStart: jetzt, beimTeilen: danach }, dateizeitGealtert: alt, pidVor: 100, pidNach: 100, zugriffVor: { uri, lesenVerweigert: false, pruefung: { geoeffnet: true } }, widerruf: { uri, lesenVerweigert: true, pruefung: { verweigert: true, fehler: 'SecurityException' } } } };
  status(evaluiereDateiFall(m), OK);
  for (const [feld, wert] of [['pidNach', 101], ['dateizeitGealtert', danach], ['startListe', 'frisch']]) { const p = structuredClone(m); p.messung[feld] = wert; status(evaluiereDateiFall(p), UNGUELTIG); }
  const missing = structuredClone(m); missing.messung.widerruf.pruefung.fehler = 'FileNotFoundException'; status(evaluiereDateiFall(missing), UNGUELTIG);
  const ungeoeffnet = structuredClone(m); ungeoeffnet.messung.zugriffVor.pruefung.geoeffnet = false; status(evaluiereDateiFall(ungeoeffnet), UNGUELTIG);
  for (const feld of ['altNach', 'frischNach']) { const p = structuredClone(m); p.messung[feld] = !p.messung[feld]; status(evaluiereDateiFall(p), NEIN); }
  m.messung.fremdNach = 'b'.repeat(64); status(evaluiereDateiFall(m), NEIN);
  delete m.messung.prefsGealtert; status(evaluiereDateiFall(m), UNGUELTIG);
});

test('D12 kann nicht durch ein beliebiges boolesches bestanden-Feld bestehen', () => { status(evaluiereDateiFall({ ...grund('D12', 'netz', null), bestanden: true }), UNGUELTIG); });

test('Pflichtumfang zählt jedes Format, Providerdokument und Release getrennt', () => {
  status(pruefeDateienAbdeckung(null), UNGUELTIG);
  const unvollstaendig = pruefeDateienAbdeckung([transfer()]); status(unvollstaendig, UNGUELTIG);
  for (const fehlt of ['D5-json', 'D7-grenze-falsch-klein', 'D10-force-stop-auswahl', 'release-D1-json', 'release-D5-json', 'release-D6-json']) assert.ok(unvollstaendig.details.fehlt.includes(fehlt));
  const faelle = [];
  for (const format of ['json', 'xlsx', 'pdf']) for (const fall of ['D1', 'D4', 'D5']) faelle.push(grund(fall, 'test', format));
  for (const format of ['json', 'xlsx']) faelle.push(grund('D2', 'test', format));
  for (const [fall, namen] of Object.entries({ D3: ['abbruch', 'erneut', 'gleicher-name', 'schliessfehler'], D6: ['import', 'erneut', 'abbruch', 'wieder-oeffnen'], D7: ['grenze', 'zu-gross', 'grenze-unbekannt', 'zu-gross-unbekannt', 'grenze-falsch-klein', 'zu-gross-falsch-klein', 'grenze-falsch-gross'], D8: ['leer', 'format', 'utf8', 'schema', 'lesefehler', 'bom'], D9: ['abbrechen', 'zurueck', 'bestaetigen'], D10: ['neuerstellung-dialog', 'neuerstellung-auswahl', 'hintergrund-auswahl', 'force-stop-auswahl', 'drehung-auswahl'], D11: ['cache'] })) for (const name of namen) faelle.push(grund(fall, name));
  for (const fall of ['D1', 'D5', 'D6']) faelle.push({ ...grund(fall, 'test'), variante: 'release' });
  status(pruefeDateienAbdeckung(faelle), OK);
});

async function lauf(t) {
  const tmp = resolve('scratchpad/paket-2.6/tmp'); await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'dateien-auswertung-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'dateien')); await writeFile(join(dir, 'dateien', 'probe.json'), '{}');
  return dir;
}
async function schreibeLauf(dir, faelle, extras = {}) { await writeFile(join(dir, 'dateien-roh.json'), JSON.stringify({ schema: 1, api: 30, faelle, ...extras })); }

test('Offline-Neuauswertung lädt Bytes selbst und meldet fehlenden Pflichtumfang', async t => {
  const dir = await lauf(t), m = transfer();
  delete m.ziel.base64; m.ziel.datei = 'dateien/ziel.json'; await writeFile(join(dir, 'dateien', 'ziel.json'), roh('json')); await schreibeLauf(dir, [m]);
  const befunde = await werteDateienAus(dir); status(befunde[0], OK); status(befunde.at(-1), UNGUELTIG);
  await writeFile(join(dir, 'dateien', 'ziel.json'), '{}'); status((await werteDateienAus(dir))[0], UNGUELTIG);
});

test('Offline-Neuauswertung verwirft fehlende, leere, doppelte und flüchtende Belege', async t => {
  const dir = await lauf(t); status((await werteDateienAus(dir))[0], UNGUELTIG);
  const m = transfer(); m.belege = ['fehlt.xml']; await schreibeLauf(dir, [m]); status((await werteDateienAus(dir))[0], UNGUELTIG);
  m.belege = ['leer.xml']; await writeFile(join(dir, 'leer.xml'), ''); await schreibeLauf(dir, [m]); status((await werteDateienAus(dir))[0], UNGUELTIG);
  m.belege = ['../fremd.xml']; await schreibeLauf(dir, [m]); status((await werteDateienAus(dir))[0], UNGUELTIG);
  await schreibeLauf(dir, [transfer(), transfer()]); assert.ok((await werteDateienAus(dir)).some(b => b.id === 'dateien-schema' && b.status === UNGUELTIG));
  await schreibeLauf(dir, [], { api: 24 }); status((await werteDateienAus(dir))[0], UNGUELTIG);
  await schreibeLauf(dir, [], { schema: 2 }); status((await werteDateienAus(dir))[0], UNGUELTIG);
});

test('Offline-Neuauswertung prüft eingebettete gegen gezogene Bytes', async t => {
  const dir = await lauf(t), m = transfer(); m.ziel.datei = 'dateien/ziel.json'; await writeFile(join(dir, 'dateien', 'ziel.json'), '{}'); await schreibeLauf(dir, [m]); status((await werteDateienAus(dir))[0], UNGUELTIG);
});

test('Offline-Neuauswertung prüft Importquelle selbst, einschließlich leerem Prüfdokument', async t => {
  const dir = await lauf(t), m = importFall(); await writeFile(join(dir, 'dateien/quelle.bin'), roh('json')); await schreibeLauf(dir, [m]);
  status((await werteDateienAus(dir))[0], OK);
  await writeFile(join(dir, 'dateien/quelle.bin'), '{}'); status((await werteDateienAus(dir))[0], UNGUELTIG);
  const leer = importFall('leer'); leer.fall = 'D8'; leer.belege.push('dateien/quelle.bin');
  Object.assign(leer.messung, { bytes: 0, quelleSha256: sha(Buffer.alloc(0)), ergebnis: 'format', projektNach: leer.messung.projektVor, gespeichertNach: leer.messung.projektVor,
    provider: { format: 1, id: 'leer', name: 'leer.json', angeboteneBytes: 0, sha256: sha(Buffer.alloc(0)), geleseneBytes: 0, geschlossen: true } });
  await writeFile(join(dir, 'dateien/quelle.bin'), ''); await schreibeLauf(dir, [leer]); status((await werteDateienAus(dir))[0], OK);
});

test('Offline-Neuauswertung ersetzt alte Erfolgsbefunde ohne Rohfälle und erkennt die falsche API', async t => {
  const dir = await lauf(t), m = transfer();
  await writeFile(join(dir, 'ergebnis.json'), JSON.stringify({ auswahl: { api: 36, phasen: ['dateien'] }, ergebnis: 'bestanden', code: 0, befund: [{ id: dateiFallId(m), status: OK, grund: 'Alter Erfolg' }] }));
  await schreibeLauf(dir, [m]);
  const bericht = await werteLaufAus(dir);
  status(bericht.nachher.befund.find(b => b.id === 'dateien-schema'), UNGUELTIG);
  status(bericht.nachher.befund.find(b => b.id === dateiFallId(m)), UNGUELTIG);
  assert.ok(!bericht.unveraendertUebernommen.includes(dateiFallId(m)));
  assert.ok(bericht.nachher.befund.some(b => b.id === 'sicherung-geraetewechsel' && b.status === UNGUELTIG));
});

test('Gesamtauswertung integriert Datei- und fehlende Netzbelege ohne ursprüngliche Erfolge zu erfinden', async t => {
  const dir = await lauf(t); await writeFile(join(dir, 'ergebnis.json'), JSON.stringify({ auswahl: { api: 30, phasen: ['dateien'] }, ergebnis: 'ungültig', code: 2, befund: [] }));
  await schreibeLauf(dir, [transfer()]); const bericht = await werteLaufAus(dir);
  status(bericht.nachher.befund.find(b => b.id === dateiFallId(transfer())), OK);
  for (const id of ['dateien-abdeckung', 'D12-netz-debug', 'D12-netz-release', 'sicherung-standard']) status(bericht.nachher.befund.find(b => b.id === id), UNGUELTIG);
  assert.equal(bericht.nachher.code, 2);
});
