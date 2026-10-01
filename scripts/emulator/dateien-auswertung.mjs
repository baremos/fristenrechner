// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';

// Schema 1 beschreibt Beobachtungen, keine vorweggenommenen Prüfergebnisse.
export const DATEIEN_SCHEMA = 1;
export const DATEI_MIME = Object.freeze({ json: 'application/json;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' });
const APP = 'de.baremos.fristenrechner';
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && !!v.trim();
const zahl = v => Number.isSafeInteger(v) && v >= 0;
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mimePasst = (mime, format) => mime === DATEI_MIME[format] || (format === 'json' && mime === 'application/json');
const bool = v => typeof v === 'boolean';
const gleich = isDeepStrictEqual;
const befund = (status, grund, details) => ({ status, grund, ...(details === undefined ? {} : { details }) });
const ok = (g, d) => befund('bestanden', g, d);
const nein = (g, d) => befund('nicht bestanden', g, d);
const ungueltig = (g, d) => befund('ungültig', g, d);
const grenze = (g, d) => befund('dokumentierte Grenze', g, d);
const fehlt = (o, felder) => !obj(o) || felder.some(k => !Object.hasOwn(o, k));
const appOben = v => text(v) && (v.startsWith(`${APP}/`) || new RegExp(`(?:topResumedActivity|mResumedActivity)[^\\r\\n]* ${APP.replaceAll('.', '\\.')}\\/`).test(v));
const pfad = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(v) && !v.split('/').some(s => !s || s === '.' || s === '..');

export function erzeugeDateiBeleg(bytes, name, mime, quelle) {
  const inhalt = Buffer.from(bytes);
  return { name, mime, bytes: inhalt.length, sha256: sha(inhalt), base64: inhalt.toString('base64'), ...(quelle ? { quelle } : {}) };
}

function dateiBytes(d) {
  if (!obj(d) || !text(d.name) || /[/\\:\u0000-\u001f\u007f]/.test(d.name) || !text(d.mime) || !zahl(d.bytes) || !hash(d.sha256) || typeof d.base64 !== 'string' || d.base64.length > 6 * 1024 * 1024) throw new Error('Dateibeleg braucht Name, MIME, Größe, SHA-256 und Rohbytes.');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(d.base64)) throw new Error('Rohbytes sind kein kanonisches Base64.');
  const b = Buffer.from(d.base64, 'base64');
  if (b.toString('base64') !== d.base64 || b.length !== d.bytes || sha(b) !== d.sha256) throw new Error('Größe oder SHA-256 stimmt nicht mit den Rohbytes überein.');
  return b;
}

/** ZIP-Verzeichnis und lokale Einträge statt eines bloßen Fundes des Dateinamens. */
function xlsxStruktur(b) {
  if (b.length < 22 || b.readUInt32LE(0) !== 0x04034b50) return false;
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { end = i; break; }
  }
  if (end < 0 || b.readUInt16LE(end + 4) !== 0 || b.readUInt16LE(end + 6) !== 0 || b.readUInt16LE(end + 8) !== b.readUInt16LE(end + 10)) return false;
  const count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), start = b.readUInt32LE(end + 16);
  if (!count || start + size !== end) return false;
  let p = start; const namen = new Set();
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || b.readUInt32LE(p) !== 0x02014b50) return false;
    const n = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), loc = b.readUInt32LE(p + 42), komprimiert = b.readUInt32LE(p + 20);
    if (p + 46 + n + extra + comment > end || loc + 30 > start || b.readUInt32LE(loc) !== 0x04034b50) return false;
    const name = b.subarray(p + 46, p + 46 + n).toString('utf8'), ln = b.readUInt16LE(loc + 26), le = b.readUInt16LE(loc + 28);
    if (loc + 30 + ln + le + komprimiert > start || namen.has(name) || b.subarray(loc + 30, loc + 30 + ln).toString('utf8') !== name) return false;
    namen.add(name); p += 46 + n + extra + comment;
  }
  return p === end && namen.has('[Content_Types].xml');
}

export function pruefeDateiStruktur(format, bytes) {
  const b = Buffer.from(bytes);
  try {
    if (format === 'json') { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b)); return true; }
    if (format === 'xlsx') return xlsxStruktur(b);
    if (format === 'pdf') return b.subarray(0, 5).toString('ascii') === '%PDF-' && /%%EOF\s*$/.test(b.subarray(-64).toString('ascii'));
  } catch { return false; }
  return false;
}

function transfer(m) {
  if (!Object.hasOwn(DATEI_MIME, m.format)) return ungueltig('Dateiformat fehlt oder ist unbekannt.');
  if (m.variante === 'debug' && m.referenz?.quelle !== 'bruecke') return ungueltig('Debug-Referenz muss vor dem Transport an der Brücke erfasst sein.');
  if (m.variante === 'release' && m.referenz?.quelle !== 'bruecke') return ungueltig('Release braucht ebenfalls Referenzbytes von der Brücke der unveränderten APK.');
  let r, z;
  try { r = dateiBytes(m.referenz); z = dateiBytes(m.ziel); } catch (e) { return ungueltig(e.message); }
  const erwarteterName = m.referenz.name.replace(new RegExp(`\\.${m.format}$`), ` (${m.kopie})\.${m.format}`);
  if (!mimePasst(m.ziel.mime, m.format) || !mimePasst(m.referenz.mime, m.format) || !m.referenz.name.endsWith(`.${m.format}`) ||
      (m.ziel.name !== m.referenz.name && !(zahl(m.kopie) && m.kopie > 0 && m.ziel.name === erwarteterName))) return nein('Name oder MIME des Ziels entspricht nicht dem Auftrag.');
  if (!r.equals(z)) return nein('Zielbytes unterscheiden sich von der vor dem Transport gesicherten Referenz.', { referenz: m.referenz.sha256, ziel: m.ziel.sha256 });
  if (!pruefeDateiStruktur(m.format, z)) return nein('Die übertragenen Bytes haben nicht die erforderliche Dateistruktur.');
  return ok('Name, MIME, Größe, Dateistruktur und SHA-256 der Zielbytes stimmen mit der Referenz überein.', { bytes: z.length, sha256: m.ziel.sha256 });
}

function determinismus(m) {
  if (!['json', 'xlsx'].includes(m.format) || !Array.isArray(m.exporte) || m.exporte.length !== 2) return ungueltig('Determinismus braucht genau zwei JSON- oder XLSX-Exporte.');
  if (m.exporte.some(e => e?.quelle !== 'bruecke')) return ungueltig('Beide Referenzen müssen an der Brücke erfasst sein.');
  if (m.format === 'json' && (typeof m.zeitFixiert !== 'string' || !Number.isFinite(Date.parse(m.zeitFixiert)))) return ungueltig('JSON-Determinismus braucht den für beide Aufträge extern festgehaltenen Zeitpunkt.');
  if (m.format === 'xlsx') {
    if (!Array.isArray(m.tage) || m.tage.length !== 2 || !m.tage.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0, 10) === v)) return ungueltig('Kalendertage der XLSX-Erstellung fehlen.');
    if (m.tage[0] !== m.tage[1]) return grenze('XLSX-Vergleich überschreitet den Kalendertag; innerhalb eines Tages wiederholen.');
  }
  let a, b; try { [a, b] = m.exporte.map(dateiBytes); } catch (e) { return ungueltig(e.message); }
  if (!m.exporte.every(e => mimePasst(e.mime, m.format)) || !pruefeDateiStruktur(m.format, a) || !pruefeDateiStruktur(m.format, b)) return nein('Determinismusbelege haben falschen MIME-Typ oder ungültige Struktur.');
  return a.equals(b) ? ok('Zwei Exporte desselben Stands sind bytegleich.', { sha256: sha(a) }) : nein('Zwei Exporte desselben Stands sind nicht bytegleich.');
}

function speichernSonderfall(m) {
  if (['erneut', 'gleicher-name'].includes(m.name)) {
    if (m.name === 'gleicher-name' && !(zahl(m.kopie) && m.kopie > 0)) return ungueltig('Die tatsächlich erzeugte Namenergänzung wurde nicht aufgezeichnet.');
    return transfer(m);
  }
  if (m.name !== 'abbruch') return ungueltig('Unbekannter Speichern-Sonderfall.');
  const d = m.messung;
  if (fehlt(d, ['antwortStatus', 'downloadVor', 'downloadNach', 'aktionenFrei']) || !Array.isArray(d.downloadVor) || !Array.isArray(d.downloadNach) || !bool(d.aktionenFrei)) return ungueltig('Abbruch braucht Antwort, Download-Inventare und Zustand der Aktionen.');
  return d.antwortStatus === 'abgebrochen' && gleich([...d.downloadVor].sort(), [...d.downloadNach].sort()) && d.aktionenFrei ? ok('Abbruch ohne neue Zieldatei; nächste Aktion ist freigegeben.') : nein('Abbruch hinterließ eine Zieldatei oder eine gesperrte Aktion.');
}

function teilen(m) {
  const d = m.messung ?? m;
  if (!Object.hasOwn(DATEI_MIME, m.format) || !['auswahl', 'direkt', 'ohne-empfaenger'].includes(d.modus) || !text(d.obenVor) || !text(d.obenTeilen) || !text(d.obenNach) || !obj(d.antwort) || !bool(d.erneuterAuftrag)) return ungueltig('Teilen braucht MIME, Activity-Folge, Brückenantwort und erneuten Auftrag.');
  if (!appOben(d.obenVor) || !appOben(d.obenNach) || !d.erneuterAuftrag || d.antwort.status !== 'bereitgestellt') return nein('Teilen hat keine belegte Rückkehr oder lässt den nächsten Auftrag nicht zu.');
  if (d.modus === 'ohne-empfaenger') return text(d.hinweis) ? grenze('Android hat keinen geeigneten Empfänger. Rückkehr ist belegt, Empfang ist nicht belegt.', { hinweis: d.hinweis }) : ungueltig('Hinweis zum fehlenden Empfänger fehlt.');
  if (appOben(d.obenTeilen)) return ungueltig('Weder Android-Auswahl noch direkte Empfänger-Activity nachgewiesen.');
  return ok('Teilen öffnet Auswahl oder Empfänger und gibt den nächsten Auftrag nach der Rückkehr frei.');
}

function empfang(m) {
  const t = transfer(m); if (t.status !== 'bestanden') return t;
  const d = m.grants ?? m.empfang;
  if (fehlt(d, ['schreibenVerweigert', 'nachbarVerweigert', 'projektVerweigert']) || !['schreibenVerweigert', 'nachbarVerweigert', 'projektVerweigert'].every(k => bool(d[k]))) return ungueltig('Empfänger hat URI-Schreibzugriff und benachbarte Pfade nicht vollständig geprüft.');
  if (!text(m.uri ?? d.uri) || !(m.uri ?? d.uri).startsWith(`content://${APP}.exportdateien/`)) return ungueltig('Empfänger hat keine URI des Exportproviders aufgezeichnet.');
  if (d.format !== 1 || d.name !== m.ziel.name || d.mime !== m.ziel.mime || !mimePasst(d.intentMime, m.format) || d.groesse !== m.ziel.bytes || d.angegebeneGroesse !== m.ziel.bytes || d.sha256 !== m.ziel.sha256) return ungueltig('Empfängerbericht und gezogene Datei stimmen in Name, MIME, Größe und Hash nicht überein.');
  if (['schreiben', 'nachbar', 'projekt'].some(k => !obj(d[k]) || !text(d[k].uri) || !bool(d[k].verweigert) || !text(d[k].fehler))) return ungueltig('Zugriffsversuche brauchen URI, Ergebnis und Ausnahmeklasse.');
  const uri = m.uri ?? d.uri, nachbar = uri.slice(0, uri.lastIndexOf('/') + 1) + 'nachbar.json';
  if (d.schreiben.uri !== uri || !['w', 'rw'].includes(d.schreiben.modus) || d.nachbar.uri !== nachbar || d.nachbar.modus !== 'r' || !d.projekt.uri.startsWith(`content://${APP}.exportdateien/`) || !decodeURIComponent(d.projekt.uri).includes('/../../shared_prefs/') || d.projekt.modus !== 'r') return ungueltig('Schreib-, Nachbar- oder Projektversuch betrifft nicht die vom empfangenen URI abgeleiteten Zugriffe.');
  if (['schreiben', 'nachbar', 'projekt'].some(k => d[k].fehler !== 'SecurityException' || !d[k].verweigert)) return nein('Nur eine Sicherheitsablehnung belegt den geschützten URI-Zugriff; fehlende Dateien genügen nicht.');
  return Object.values({ schreiben: d.schreibenVerweigert, nachbar: d.nachbarVerweigert, projekt: d.projektVerweigert }).every(Boolean) ? ok('Empfänger liest identische Bytes; Schreibzugriff sowie Nachbar- und Projektzugriff sind verweigert.', t.details) : nein('Der Empfänger erhält einen unzulässigen Zugriff.');
}

function importPruefen(m) {
  const d = m.messung;
  if (fehlt(d, ['auswahl', 'projektVor', 'projektNach', 'gespeichertNach', 'aktionenFrei', 'aufrufe']) || d.auswahl !== 'documentsui' || !bool(d.aktionenFrei) || !zahl(d.aufrufe) || !obj(d.projektVor) || !obj(d.projektNach) || !obj(d.gespeichertNach)) return ungueltig('Import braucht echte Dokumentauswahl, Formular, Speicher und Aufrufzahl.');
  if (!d.aktionenFrei || d.aufrufe !== 1) return nein('Import hat eine gesperrte Aktion oder mehr beziehungsweise weniger als einen Auftrag hinterlassen.');
  if (m.name === 'abbruch') return d.abgebrochen === true && gleich(d.projektVor, d.projektNach) && gleich(d.projektVor, d.gespeichertNach) ? ok('Importabbruch bewahrt Formular und Speicher.') : nein('Abbruch verändert das Projekt oder liefert keinen Abbruchstatus.');
  if (!['import', 'erneut', 'wieder-oeffnen'].includes(m.name) && m.fall === 'D6') return ungueltig('Unbekannter Import-Teilfall.');
  if (!hash(d.quelleSha256) || !hash(d.brueckeSha256) || !obj(d.projektErwartet)) return ungueltig('Import braucht Referenzhash, empfangenen Texthash und erwarteten Projektstand.');
  if ((d.quelleOhneBomSha256 ?? d.quelleSha256) !== d.brueckeSha256 || !gleich(d.projektErwartet, d.projektNach) || !gleich(d.projektErwartet, d.gespeichertNach)) return nein('Importierte Bytes, Formular oder gespeicherter Projektstand stimmen nicht mit der Quelle überein.');
  return ok('Import über die Dokumentauswahl übernimmt die erwarteten Bytes und den erwarteten gespeicherten Projektstand.');
}

const PROVIDER_GROESSEN = Object.freeze({ grenze: 1048576, 'zu-gross': 1048577, 'grenze-unbekannt': null, 'zu-gross-unbekannt': null, 'grenze-falsch-klein': 1, 'zu-gross-falsch-klein': 1, 'grenze-falsch-gross': 2097152 });
function fehlerImport(m) {
  const d = m.messung;
  if (fehlt(d, ['bytes', 'ergebnis', 'projektVor', 'projektNach', 'gespeichertNach', 'aktionenFrei', 'aufrufe', 'auswahl']) || !zahl(d.bytes) || !text(d.ergebnis) || !obj(d.projektVor) || !obj(d.projektNach) || !obj(d.gespeichertNach) || d.auswahl !== 'documentsui' || !bool(d.aktionenFrei) || !zahl(d.aufrufe)) return ungueltig('Fehlerimport ist nicht vollständig aufgezeichnet.');
  if (m.name !== 'bom' && (!obj(d.provider) || d.provider.format !== 1 || d.provider.id !== m.name || d.provider.name !== `${m.name}.json` || d.provider.angeboteneBytes !== d.bytes || !hash(d.quelleSha256) || d.provider.sha256 !== d.quelleSha256 || d.provider.geschlossen !== true || !zahl(d.provider.geleseneBytes))) return ungueltig('Die ausgewählte Providerquelle ist nicht durch Namen, Bytezahl, Hash und Streamabschluss belegt.');
  if (m.fall === 'D7') {
    if (!obj(d.provider) || d.provider.format !== 1 || d.provider.id !== m.name || d.provider.angeboteneBytes !== d.bytes || !zahl(d.provider.geleseneBytes) || d.provider.geleseneBytes > 1048577 || d.provider.geleseneBytes !== d.bytes || d.provider.geschlossen !== true || d.provider.streamFehler !== false || !hash(d.provider.sha256) || !gleich(d.provider.angegebeneGroesse, d.providerGroesse)) return ungueltig('Testprovider hat Quelle, Größenmetadaten und abgeschlossenen Stream nicht passend aufgezeichnet.');
    if (!Object.hasOwn(PROVIDER_GROESSEN, m.name) || !Object.hasOwn(d, 'providerGroesse') || !gleich(d.providerGroesse, PROVIDER_GROESSEN[m.name])) return ungueltig('Die Größenangabe des Testproviders fehlt oder entspricht nicht dem gewählten Prüfdokument.');
    const zuGross = m.name.startsWith('zu-gross');
    if (d.bytes !== (zuGross ? 1048577 : 1048576) || d.mehrbyte !== true) return ungueltig('Grenzdatei hat nicht die verlangte Bytezahl oder enthält keinen belegten UTF-8-Mehrbytewert.');
    if (!zuGross) return d.ergebnis === 'ok' ? importPruefen(m) : nein('Datei mit genau 1 MiB wird trotz gültigem Inhalt abgelehnt.');
    if (d.ergebnis !== 'zu-gross') return nein('Die Größenprüfung weist 1 MiB plus ein Byte nicht als zu groß zurück.');
  } else {
    const erwartung = { leer: ['format', 'schema'], format: ['format'], utf8: ['lesen'], schema: ['schema'], lesefehler: ['lesen'], bom: ['ok'] }[m.name];
    if (!erwartung) return ungueltig('Unbekannter fehlerhafter Import.');
    if (m.name === 'leer' && d.bytes !== 0) return ungueltig('Leere Prüfdokumentdatei ist nicht leer.');
    if (!erwartung.includes(d.ergebnis)) return nein('Der Import liefert nicht die erwartete Ablehnung.');
    if (m.name === 'lesefehler' && (!obj(d.provider) || d.provider.format !== 1 || d.provider.id !== 'lesefehler' || d.provider.streamFehler !== true || d.provider.geleseneBytes !== 262144 || d.bytes !== 524288 || d.provider.geschlossen !== true)) return ungueltig('Der erwartete Fehler nach 262 144 Streambytes eines 524 288 Bytes großen Dokuments ist nicht im Provider belegt.');
    if (m.name === 'bom') return importPruefen(m);
  }
  if (!d.aktionenFrei || d.aufrufe !== 1 || !gleich(d.projektVor, d.projektNach) || !gleich(d.projektVor, d.gespeichertNach)) return nein('Abgelehnter Import verändert den vorhandenen Stand oder blockiert weitere Aktionen.');
  return ok('Fehlerhafte Quelle wird abgelehnt; Formular und gespeichertes Projekt bleiben erhalten.');
}

function dialog(m) {
  const d = m.messung;
  if (!['abbrechen', 'zurueck', 'bestaetigen'].includes(m.name) || fehlt(d, ['dialog', 'projektVor', 'projektNach', 'gespeichertNach', 'aktionenFrei', 'resetAufrufe']) || !obj(d.dialog) || !obj(d.projektVor) || !obj(d.projektNach) || !obj(d.gespeichertNach) || !bool(d.aktionenFrei) || !zahl(d.resetAufrufe)) return ungueltig('Dialogbeleg ist unvollständig.');
  if (d.dialog.frage !== 'Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?' || String(d.dialog.abbrechen).toLocaleLowerCase('de') !== 'abbrechen' || String(d.dialog.bestaetigen).toLocaleLowerCase('de') !== 'zurücksetzen' || d.dialog.fokus !== 'android:id/button2') return nein('Deutscher Dialog oder anfänglicher Fokus auf Abbrechen entspricht nicht dem Vertrag.');
  if (!d.aktionenFrei || d.resetAufrufe !== 1) return nein('Dialog wird mehrmals aufgerufen oder gibt die Aktionen nicht frei.');
  if (m.name === 'bestaetigen') {
    const leer = o => Object.values(o).every(v => v === '' || v === null || v === undefined);
    return !gleich(d.projektVor, d.projektNach) && leer(d.projektNach) && leer(d.gespeichertNach) ? ok('Bestätigung setzt Formular und gespeicherten Projektstand zurück.') : nein('Bestätigung hinterlässt keinen neuen leeren Projektstand.');
  }
  return gleich(d.projektVor, d.projektNach) && gleich(d.projektVor, d.gespeichertNach) ? ok('Abbrechen oder Zurück bewahrt das vorhandene Projekt bei freigegebenen Aktionen.') : nein('Dialogabbruch verändert Formular oder Speicher.');
}

function lebenszyklus(m) {
  const d = m.messung;
  if (!['neuerstellung-dialog', 'neuerstellung-auswahl', 'hintergrund-auswahl', 'force-stop-auswahl', 'drehung-auswahl'].includes(m.name) || fehlt(d, ['pidVor', 'pidNach', 'seiteVor', 'seiteNach', 'hakenNach', 'projektVor', 'projektNach', 'aktionenFrei', 'importAufrufe', 'resetAufrufe', 'auswahlVor', 'auswahlNach']) || ![d.pidVor, d.pidNach].every(v => zahl(v) && v > 0) || ![d.seiteVor, d.seiteNach].every(text) || ![d.hakenNach, d.aktionenFrei, d.auswahlVor, d.auswahlNach].every(bool) || ![d.importAufrufe, d.resetAufrufe].every(zahl) || !obj(d.projektVor) || !obj(d.projektNach)) return ungueltig('Lebenszyklus braucht Prozess, Seitenkennung, Haken, offenen Auftrag und Projektzustand.');
  if (!d.auswahlVor || !d.aktionenFrei || !gleich(d.projektVor, d.projektNach) || d.importAufrufe > 1 || d.resetAufrufe > 1) return nein('Lebenszyklus verliert den Projektstand, wiederholt einen Auftrag oder hinterlässt eine Sperre.');
  if (m.name.startsWith('neuerstellung')) {
    if (!obj(d.fontScale) || !text(String(d.fontScale.vor ?? '')) || d.fontScale.vor === d.fontScale.waehrend || String(d.fontScale.vor) !== String(d.fontScale.nach)) return ungueltig('font_scale-Wechsel und Wiederherstellung fehlen.');
    if (d.pidVor !== d.pidNach || d.seiteVor === d.seiteNach || d.hakenNach || d.importAufrufe !== 0 || d.resetAufrufe !== 0) return nein('Neuerstellung ist nicht als neue WebView im gleichen Prozess ohne wiederholten Auftrag belegt.');
  } else if (m.name === 'force-stop-auswahl') {
    if (d.pidVor === d.pidNach || d.seiteVor === d.seiteNach || d.hakenNach || d.importAufrufe !== 0 || d.resetAufrufe !== 0 || d.auswahlNach) return nein('Neustart nach force-stop ist nicht frei von alten Aufträgen.');
  } else {
    if (m.name === 'drehung-auswahl' && (!obj(d.rotation) || d.rotation.vor === d.rotation.waehrend || d.rotation.vor !== d.rotation.nach)) return ungueltig('Drehung und Wiederherstellung fehlen.');
    if (d.pidVor !== d.pidNach || d.seiteVor !== d.seiteNach || !d.hakenNach) return nein('Hintergrund oder Drehung erstellt die Activity unerwartet neu.');
  }
  return ok('Lebenszyklus und anschließende Freigabe sind ohne Doppelauftrag und Projektverlust belegt.');
}

function cache(m) {
  const d = m.messung;
  if (fehlt(d, ['altId', 'frischId', 'altVor', 'altNach', 'frischVor', 'frischNach', 'fremdVor', 'fremdNach', 'prefsVor', 'prefsGealtert', 'prefsNach', 'widerruf']) || ![d.altId, d.frischId, d.prefsVor, d.prefsGealtert, d.prefsNach].every(text) || ![d.altVor, d.altNach, d.frischVor, d.frischNach].every(bool) || !hash(d.fremdVor) || !hash(d.fremdNach) || !obj(d.widerruf) || !bool(d.widerruf.lesenVerweigert)) return ungueltig('Cachebeleg braucht Bestände, Präferenzen, fremden Kontrollhash und späteren URI-Zugriff.');
  if (d.altId === d.frischId || d.prefsVor === d.prefsGealtert) return ungueltig('Alte und frische Freigabe oder synthetische Alterung sind nicht unterscheidbar.');
  if (!text(d.startListe) || ![d.altId, d.frischId].every(id => d.startListe.split(/\r?\n/).includes(id)) || !obj(d.zeit) || !['jetzt', 'gealtert', 'beimStart', 'beimTeilen'].every(k => zahl(d.zeit[k])) || !zahl(d.dateizeitGealtert) || !zahl(d.pidVor) || d.pidVor <= 0 || !zahl(d.pidNach) || !obj(d.zugriffVor) || d.zugriffVor.pruefung?.geoeffnet !== true || d.zugriffVor.lesenVerweigert !== false) return ungueltig('Cachebereinigung braucht vorhandene Dateien und lesbaren alten Grant vor dem Teilen sowie Prozess- und Zeitbelege.');
  if (d.pidVor !== d.pidNach) return ungueltig('Ein Prozessneustart kann den Grant unabhängig von der Bereinigung widerrufen.');
  const zeit = d.zeit, tag = 24 * 60 * 60 * 1000;
  if (zeit.beimStart - zeit.gealtert >= tag || zeit.beimStart < zeit.gealtert || zeit.beimTeilen - zeit.gealtert <= tag || zeit.beimTeilen - d.dateizeitGealtert <= tag || zeit.beimTeilen <= zeit.beimStart) return ungueltig('Zeitbelege zeigen nicht den Wechsel von frischer zu abgelaufener Freigabe.');
  const pref = (xml, id) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
    const treffer = [...xml.matchAll(new RegExp(`<long\\s+name="${id}"\\s+value="(\\d+)"\\s*/>`, 'g'))];
    return treffer.length === 1 ? Number(treffer[0][1]) : null;
  };
  const original = pref(d.prefsVor, d.altId), gealtert = pref(d.prefsGealtert, d.altId), frisch = pref(d.prefsNach, d.frischId);
  if (original === null || gealtert !== zeit.gealtert || gealtert >= original || frisch === null || zeit.beimTeilen - frisch >= tag || zeit.beimTeilen < frisch || pref(d.prefsNach, d.altId) !== null) return ungueltig('Präferenzrohtexte belegen nicht die gezielte Alterung und Entfernung allein der alten Freigabe.');
  if (d.widerruf.uri !== d.zugriffVor.uri || !text(d.widerruf.uri) || d.widerruf.pruefung?.fehler !== 'SecurityException' || d.widerruf.pruefung?.verweigert !== true) return ungueltig('Späterer Zugriff auf dieselbe zuvor lesbare URI muss durch Sicherheitsablehnung scheitern.');
  return d.altVor && !d.altNach && d.frischVor && d.frischNach && d.fremdVor === d.fremdNach && d.widerruf.lesenVerweigert ? ok('Nächstes Teilen bereinigt die gealterte Freigabe im gleichen Prozess und widerruft ihren Zugriff; frische Datei und Kontrollbereich bleiben erhalten.') : nein('Cachebereinigung entfernt frische/fremde Daten oder lässt alte Freigaben lesbar.');
}

export function dateiFallId(m) { return `dateien-${m?.variante ?? 'unbekannt'}-${m?.fall ?? 'unbekannt'}-${m?.name ?? 'unbekannt'}${m?.format ? `-${m.format}` : ''}`; }

export function evaluiereDateiFall(m) {
  try {
    if (!obj(m) || m.schema !== DATEIEN_SCHEMA || !/^D(?:[1-9]|1[0-2])$/.test(m.fall ?? '') || !['debug', 'release'].includes(m.variante) || !/^[a-z0-9][a-z0-9-]*$/.test(m.name ?? '') || !obj(m.umgebung) || !Array.isArray(m.belege) || !m.belege.length || !m.belege.every(pfad)) return ungueltig('Dateifall hat kein vollständiges Schema 1 oder keine gültigen Rohbelegpfade.');
    if (Object.hasOwn(m, 'fehler')) return ungueltig(`Fall wurde nicht vollständig ausgeführt: ${text(m.fehler) ? m.fehler : 'unbekannter Laufabbruch'}`);
    if (m.grenze) {
      if (m.fall === 'D3' && m.name === 'schliessfehler' && m.grenze.code === 'nicht-provozierbar' && m.grenze.produktUnveraendert === true && text(m.grenze.grund)) return grenze(`Schließfehler bleibt offen: ${m.grenze.grund}`);
      return ungueltig('Dieser Fall erlaubt keine pauschale Umgebungsgrenze.');
    }
    const benoetigt = m.fall === 'D5' || m.fall === 'D11' ? ['empfaenger'] : (m.fall === 'D7' || (m.fall === 'D8' && m.name !== 'bom')) ? ['picker', 'provider'] : ['D1', 'D3', 'D6', 'D8', 'D10'].includes(m.fall) ? ['picker'] : [];
    if (benoetigt.some(k => m.umgebung[k] !== true)) return ungueltig('Benötigte Dokumentauswahl, Testprovider oder Testempfänger fehlt.');
    switch (m.fall) {
      case 'D1': return transfer(m);
      case 'D2': return determinismus(m);
      case 'D3': return speichernSonderfall(m);
      case 'D4': return teilen(m);
      case 'D5': return empfang(m);
      case 'D6': return importPruefen(m);
      case 'D7': case 'D8': return fehlerImport(m);
      case 'D9': return dialog(m);
      case 'D10': return lebenszyklus(m);
      case 'D11': return cache(m);
      case 'D12': return ungueltig('Netz- und Sicherungsrohbelege werden durch die gesonderten Auswerter geprüft.');
      default: return ungueltig('Unbekannter Dateifall.');
    }
  } catch (e) { return ungueltig(`Dateifall ist nicht auswertbar: ${e.message}`); }
}

// Pflichtumfang verhindert, dass eine Teilmenge als abgeschlossene Dateiphase gilt.
export function pruefeDateienAbdeckung(faelle) {
  if (!Array.isArray(faelle)) return ungueltig('Fallliste fehlt.');
  const fehlt = [], da = (f, n, format, v = 'debug') => faelle.some(m => m?.fall === f && (!n || m.name === n) && (!format || m.format === format) && m.variante === v);
  for (const f of ['json', 'xlsx', 'pdf']) for (const id of ['D1', 'D4', 'D5']) if (!da(id, null, f)) fehlt.push(`${id}-${f}`);
  for (const f of ['json', 'xlsx']) if (!da('D2', null, f)) fehlt.push(`D2-${f}`);
  for (const [id, namen] of Object.entries({ D3: ['abbruch', 'erneut', 'gleicher-name', 'schliessfehler'], D6: ['import', 'erneut', 'abbruch', 'wieder-oeffnen'], D7: Object.keys(PROVIDER_GROESSEN), D8: ['leer', 'format', 'utf8', 'schema', 'lesefehler', 'bom'], D9: ['abbrechen', 'zurueck', 'bestaetigen'], D10: ['neuerstellung-dialog', 'neuerstellung-auswahl', 'hintergrund-auswahl', 'force-stop-auswahl', 'drehung-auswahl'], D11: ['cache'] })) for (const n of namen) if (!da(id, n)) fehlt.push(`${id}-${n}`);
  for (const id of ['D1', 'D5', 'D6']) if (!da(id, null, 'json', 'release')) fehlt.push(`release-${id}-json`);
  return fehlt.length ? ungueltig('Dateiphase ist nicht vollständig ausgeführt.', { fehlt }) : ok('Alle verpflichtenden Datei-Teilfälle einschließlich Release sind als Rohbelege vorhanden.');
}

/** Keine Pfadflucht, symbolischen Links oder unbeschränkten Einlesevorgänge. */
export async function werteDateienAus(lauf, dateiname = 'dateien-roh.json', erwarteteApi) {
  const wurzel = await realpath(lauf);
  async function lesen(name, maximum = 8 * 1024 * 1024) {
    if (!pfad(name)) throw new Error('Rohbelegpfad ist nicht relativ und einfach.');
    const ziel = resolve(wurzel, ...name.split('/'));
    let aktueller = wurzel;
    for (const teil of name.split('/')) { aktueller = resolve(aktueller, teil); if ((await lstat(aktueller)).isSymbolicLink()) throw new Error('Verknüpfungen sind keine Rohbelege.'); }
    const echt = await realpath(ziel), rel = relative(wurzel, echt), info = await lstat(ziel);
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !info.isFile() || info.size > maximum) throw new Error('Rohbeleg liegt außerhalb des Laufs oder ist zu groß.');
    return readFile(ziel);
  }
  let daten;
  try { daten = JSON.parse((await lesen(dateiname, 64 * 1024 * 1024)).toString('utf8')); }
  catch (e) { return [{ id: 'dateien-schema', ...ungueltig(`Dateirohbelege fehlen oder sind unlesbar: ${e.message}`) }]; }
  if (!obj(daten) || daten.schema !== DATEIEN_SCHEMA || ![30, 36].includes(daten.api) || !Array.isArray(daten.faelle) || daten.faelle.length > 200) return [{ id: 'dateien-schema', ...ungueltig('Dateirohbelege haben kein gültiges Schema 1 mit API 30 oder 36.') }];
  if (erwarteteApi !== undefined && daten.api !== erwarteteApi) return [{ id: 'dateien-schema', ...ungueltig('API der Datei-Rohbelege weicht vom ursprünglichen Lauf ab.') }];
  const befunde = [], gesehen = new Set();
  for (const original of daten.faelle) {
    const m = structuredClone(original), id = dateiFallId(m);
    if (gesehen.has(id)) { befunde.push({ id: 'dateien-schema', ...ungueltig(`Doppelter Dateifall: ${id}.`) }); continue; }
    gesehen.add(id);
    try {
      if (!Array.isArray(m.belege) || !m.belege.length) throw new Error('Rohbelegliste fehlt.');
      for (const name of m.belege) { const inhalt = await lesen(name); if (!inhalt.length && !(name === m.messung?.quelleDatei && m.fall === 'D8' && m.name === 'leer' && m.messung.bytes === 0)) throw new Error(`Leerer Rohbeleg: ${name}.`); }
      if (['D6', 'D7', 'D8'].includes(m.fall) && m.name !== 'abbruch' && !m.fehler) {
        const quelle = await lesen(m.messung?.quelleDatei);
        if (quelle.length !== m.messung.bytes || sha(quelle) !== m.messung.quelleSha256) throw new Error('Importquellenbytes passen nicht zur gemessenen Größe und Prüfsumme.');
        if (m.messung.quelleOhneBomSha256 && m.name !== 'schema') {
          const ohneBom = quelle.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? quelle.subarray(3) : quelle;
          if (sha(ohneBom) !== m.messung.quelleOhneBomSha256) throw new Error('Texthash nach BOM-Entfernung passt nicht zur Quelldatei.');
        }
      }
      for (const d of [m.referenz, m.ziel, ...(m.exporte ?? [])].filter(Boolean)) {
        if (d.datei) { const bytes = await lesen(d.datei); if (d.base64 !== undefined && d.base64 !== bytes.toString('base64')) throw new Error('Eingebettete Bytes weichen von der gezogenen Datei ab.'); d.base64 = bytes.toString('base64'); }
      }
      befunde.push({ id, ...evaluiereDateiFall(m) });
    } catch (e) { befunde.push({ id, ...ungueltig(`Rohbelege des Dateifalls nicht lesbar: ${e.message}`) }); }
  }
  befunde.push({ id: 'dateien-abdeckung', ...pruefeDateienAbdeckung(daten.faelle) });
  return befunde;
}
