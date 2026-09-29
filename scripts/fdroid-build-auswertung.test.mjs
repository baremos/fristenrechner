// Ausschließlich nachgestellte Protokolle und ZIP-Dateien, keine echten Builds.
// Die vorläufigen Meldungstexte müssen am ersten Build in Debian geprüft werden.
// Jede Prüfung enthält einen gültigen Fall und eine abzuweisende Gegenprobe.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const scratchpad = resolve(hier, '..', 'scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'fdroid-build-auswertung-'));
const skript = join(hier, 'fdroid', 'build-auswerten.py');
const APPID = 'de.beispiel.probe';
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-B', '-c',
  'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { windowsHide: true }).status === 0);
const umgebung = { ...process.env, TEMP: arbeit, TMP: arbeit, TMPDIR: arbeit, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
const optionen = { skip: python ? false : 'Python ab 3.9 fehlt' };
const kopf = (text, stufe = 'INFO') => `2026-09-29 16:00:00,000 ${stufe}: ${text}\n`;
const BEGINN = kopf(`Building version 1.0 (1) of ${APPID}`);
const SCANNER = kopf('Scanning source for common problems...');
const ERFOLG = kopf(`Successfully built version 1.0 of ${APPID}`);
const ENDE = kopf('Finished');
const LOG = BEGINN + SCANNER + ERFOLG + ENDE;

test.after(() => {
  const unter = relative(scratchpad, arbeit);
  assert.ok(unter && !unter.startsWith('..') && !isAbsolute(unter));
  rmSync(arbeit, { recursive: true, force: true });
});

function pythonAufruf(argumente) {
  const ergebnis = spawnSync(python, ['-B', ...argumente], {
    encoding: 'utf8', env: umgebung, windowsHide: true,
  });
  assert.equal(ergebnis.error, undefined, String(ergebnis.error));
  return { code: ergebnis.status, text: ergebnis.stdout + ergebnis.stderr };
}

function zip(pfad, eintraege = [['AndroidManifest.xml', 'manifest'], ['classes.dex', 'dex\n035\0']]) {
  const ergebnis = pythonAufruf(['-c',
    'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_STORED) as z:\n for name,text in json.loads(sys.argv[2]): z.writestr(name,text)\n',
    pfad, JSON.stringify(eintraege)]);
  assert.equal(ergebnis.code, 0, ergebnis.text);
}

function vorbereiten(protokoll = LOG) {
  const lauf = mkdtempSync(join(arbeit, 'lauf-'));
  mkdirSync(join(lauf, 'unsigned'));
  const apk = join(lauf, 'unsigned', `${APPID}_1.apk`);
  zip(apk);
  writeFileSync(join(lauf, 'build.log'), protokoll);
  return { lauf, apk };
}

function auswerten(fall, argumente = [fall.lauf, APPID, '1.0', '1', '0']) {
  return pythonAufruf([skript, ...argumente]);
}

function positiv(fall = vorbereiten()) {
  const ergebnis = auswerten(fall);
  assert.equal(ergebnis.code, 0, ergebnis.text);
  assert.match(ergebnis.text, /ERGEBNIS: keine Beanstandung\s*$/);
  const bericht = JSON.parse(readFileSync(join(fall.lauf, 'auswertung.json'), 'utf8'));
  assert.equal(bericht.bestanden, true);
  assert.deepEqual(bericht.beanstandungen, []);
  assert.equal(bericht.app_id, APPID);
  assert.equal(bericht.version_name, '1.0');
  assert.equal(bericht.version_code, '1');
  assert.equal(bericht.rueckgabewert_build, 0);
  const inhalt = readFileSync(fall.apk);
  assert.equal(bericht.apk.bytes, inhalt.length);
  assert.equal(bericht.apk.sha256, createHash('sha256').update(inhalt).digest('hex'));
  assert.match(bericht.protokollformat, /vorläufig/);
  return fall;
}

function negativ(fall, muster, argumente) {
  const ergebnis = auswerten(fall, argumente);
  assert.equal(ergebnis.code, 1, ergebnis.text);
  assert.match(ergebnis.text, muster);
  assert.match(ergebnis.text, /ERGEBNIS: [1-9][0-9]* Beanstandungen\s*$/);
  const bericht = JSON.parse(readFileSync(join(fall.lauf, 'auswertung.json'), 'utf8'));
  assert.equal(bericht.bestanden, false);
  assert.ok(bericht.beanstandungen.length > 0);
  return ergebnis;
}

function paar(name, aendern, muster, erfolgreich = LOG) {
  test(`Build-Auswertung: ${name}`, optionen, () => {
    positiv(vorbereiten(erfolgreich));
    const fall = vorbereiten();
    const argumente = aendern(fall);
    negativ(fall, muster, argumente);
  });
}

paar('Rückgabe 0 und Gegenprobe 1', ({ lauf }) => [lauf, APPID, '1.0', '1', '1'], /Rückgabewert 1/);
paar('Protokoll vorhanden und Gegenprobe fehlend', ({ lauf }) => rmSync(join(lauf, 'build.log')), /Protokoll ist nicht lesbar/);
paar('Protokoll UTF-8 und Gegenprobe ungültige Bytes', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), Buffer.from([0xff])), /Protokoll ist nicht lesbar/);
paar('reguläres Protokoll und Gegenprobe Ordner', ({ lauf }) => {
  rmSync(join(lauf, 'build.log')); mkdirSync(join(lauf, 'build.log'));
}, /Protokoll ist nicht lesbar/);

for (const [name, marker] of [['Beginn', BEGINN], ['Scanner-Beginn', SCANNER], ['Erfolg', ERFOLG], ['Ende', ENDE]]) {
  paar(`${name} vorhanden und Gegenprobe fehlend`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(marker, '')), new RegExp(`${name} genau einmal.*0`));
  paar(`${name} einmal und Gegenprobe doppelt`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(marker, marker + marker)), new RegExp(`${name} genau einmal.*2`));
  paar(`${name} in INFO und Gegenprobe DEBUG`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(marker, marker.replace('INFO:', 'DEBUG:'))), /Unerwartete Build-Meldung/);
  paar(`${name} mit Kopf und Gegenprobe Folgezeile`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(marker, marker.replace(/^.* INFO: /, ''))), new RegExp(`${name} genau einmal.*0`));
}
for (const [name, marker, anders] of [
  ['App-ID bei Beginn', BEGINN, BEGINN.replace(APPID, 'de.andere.app')],
  ['Versionsname bei Beginn', BEGINN, BEGINN.replace('1.0', '2.0')],
  ['Versionscode bei Beginn', BEGINN, BEGINN.replace('(1)', '(2)')],
  ['App-ID bei Erfolg', ERFOLG, ERFOLG.replace(APPID, 'de.andere.app')],
  ['Versionsname bei Erfolg', ERFOLG, ERFOLG.replace('1.0', '2.0')],
  ['Wortlaut des Scanner-Beginns', SCANNER, SCANNER.replace('common problems...', 'something else...')],
]) {
  paar(`${name} passt und Gegenprobe abweichend`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(marker, anders)), /Unerwartete Build-Meldung/);
}
paar('ein Stand und Gegenprobe zusätzlicher fremder Stand', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN.replace(APPID, 'de.andere.app') + LOG), /Unerwartete Build-Meldung/);
paar('Reihenfolge und Gegenprobe Erfolg vor Scanner', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + ERFOLG + SCANNER + ENDE), /Reihenfolge/);
paar('Ende zuletzt und Gegenprobe spätere Meldung', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG + kopf('weiter')), /Nach dem Ende/);
paar('Ende zuletzt und Gegenprobe spätere Folgezeile', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG + 'weiter\n'), /Nach dem Ende/);

for (const stufe of ['WARNING', 'ERROR', 'CRITICAL']) {
  paar(`Stufe im Meldungstext erlaubt und Gegenprobe ${stufe}`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Hinweis', stufe) + SCANNER + ERFOLG + ENDE);
  }, new RegExp(`Protokoll, ${stufe}: Hinweis`), BEGINN + kopf(`Text mit ${stufe}: als Beispiel`, 'DEBUG') + SCANNER + ERFOLG + ENDE);
}
for (const meldung of ['WARNING: etwas', 'ERROR: etwas', 'CRITICAL: etwas', 'Traceback (most recent call last):', 'FAILURE: Build failed with an exception.', 'BUILD FAILED in 2s']) {
  paar(`normale Folgezeile und Gegenprobe ${meldung}`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + meldung + '\n' + SCANNER + ERFOLG + ENDE), /Protokoll, Zeile ohne Kopf/, BEGINN + '> Task :app:assembleRelease\n' + SCANNER + ERFOLG + ENDE);
}
paar('normaler Vorspann und Gegenprobe Traceback', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), 'Traceback (most recent call last):\n' + LOG), /Protokoll, Zeile ohne Kopf/, 'Vorbereitung\n' + LOG);
paar('normale DEBUG-Meldung und Gegenprobe Traceback', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Traceback (most recent call last):', 'DEBUG') + SCANNER + ERFOLG + ENDE), /Protokoll, DEBUG: Traceback/, BEGINN + kopf('Details', 'DEBUG') + SCANNER + ERFOLG + ENDE);
paar('mehrzeilige Meldung und Gegenprobe mehrzeilige Warnung', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Abbruch', 'WARNING') + 'Traceback (most recent call last):\nDetail\n' + SCANNER + ERFOLG + ENDE), /WARNING: Abbruch \(dazu 2 Folgezeilen\)/, BEGINN + kopf('Details', 'DEBUG') + 'eins\nzwei\n' + SCANNER + ERFOLG + ENDE);

paar('APK vorhanden und Gegenprobe fehlend', ({ apk }) => rmSync(apk), /APK ist nicht prüfbar/);
paar('APK am erwarteten Ort und Gegenprobe anderer Name', ({ apk }) => renameSync(apk, apk.replace('_1.apk', '_2.apk')), /APK ist nicht prüfbar/);
paar('reguläre APK und Gegenprobe Ordner', ({ apk }) => { rmSync(apk); mkdirSync(apk); }, /Kein regulärer Dateityp/);
paar('APK mit Inhalt und Gegenprobe leer', ({ apk }) => writeFileSync(apk, ''), /APK ist leer/);
paar('ZIP und Gegenprobe Textdatei', ({ apk }) => writeFileSync(apk, 'kein ZIP'), /APK ist nicht prüfbar/);
paar('ZIP vollständig und Gegenprobe abgeschnitten', ({ apk }) => writeFileSync(apk, readFileSync(apk).subarray(0, 20)), /APK ist nicht prüfbar/);
paar('ZIP-Prüfsumme und Gegenprobe beschädigter Inhalt', ({ apk }) => {
  const daten = readFileSync(apk); const position = daten.indexOf(Buffer.from('manifest'));
  assert.ok(position > 0); daten[position] ^= 1; writeFileSync(apk, daten);
}, /CRC|Prüfsumme/);
paar('ZIP-Einträge eindeutig und Gegenprobe doppelt', ({ apk }) => zip(apk, [['AndroidManifest.xml', 'eins'], ['AndroidManifest.xml', 'zwei'], ['classes.dex', 'dex']]), /doppelte ZIP-Einträge/);
for (const name of ['AndroidManifest.xml', 'classes.dex']) {
  const anders = name === 'AndroidManifest.xml' ? 'classes.dex' : 'AndroidManifest.xml';
  paar(`${name} vorhanden und Gegenprobe fehlend`, ({ apk }) => zip(apk, [[anders, 'inhalt']]), /ZIP-Eintrag .* fehlt/);
  paar(`${name} mit Inhalt und Gegenprobe leer`, ({ apk }) => zip(apk, [[name, ''], [anders, 'inhalt']]), /ZIP-Eintrag .* leer/);
  paar(`${name} regulär im ZIP und Gegenprobe Verweis`, ({ apk }) => {
    const ergebnis = pythonAufruf(['-c',
      'import stat,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1], "w") as z:\n i=zipfile.ZipInfo(sys.argv[2]); i.create_system=3; i.external_attr=(stat.S_IFLNK | 0o777) << 16; z.writestr(i,"ziel"); z.writestr(sys.argv[3],"inhalt")\n',
      apk, name, anders]);
    assert.equal(ergebnis.code, 0, ergebnis.text);
  }, /ZIP-Eintrag .* Verweis/);
}

test('Build-Auswertung: Ordner innerhalb des Laufs und Gegenprobe Verweis nach außen', optionen, () => {
  positiv();
  const fall = vorbereiten();
  const draussen = mkdtempSync(join(arbeit, 'ausserhalb-'));
  renameSync(fall.apk, join(draussen, `${APPID}_1.apk`));
  rmSync(join(fall.lauf, 'unsigned'), { recursive: true });
  symlinkSync(draussen, join(fall.lauf, 'unsigned'), process.platform === 'win32' ? 'junction' : 'dir');
  negativ(fall, /Verweis statt Datei oder Ordner/);
});

test('Build-Auswertung: regulärer APK-Pfad und Gegenprobe Verweis', optionen, () => {
  positiv();
  const fall = vorbereiten();
  const draussen = mkdtempSync(join(arbeit, 'verweisziel-'));
  const datei = join(draussen, 'probe.apk');
  renameSync(fall.apk, datei);
  // Ein Verzeichnisverweis braucht unter Windows keine Rechte für Dateiverweise.
  symlinkSync(process.platform === 'win32' ? draussen : datei, fall.apk, process.platform === 'win32' ? 'junction' : 'file');
  negativ(fall, /Verweis statt Datei oder Ordner/);
});

test('Build-Auswertung: regulärer Laufordner und Gegenprobe Verweis', optionen, () => {
  positiv();
  const fall = vorbereiten();
  const verweis = join(arbeit, 'lauf-verweis');
  symlinkSync(fall.lauf, verweis, process.platform === 'win32' ? 'junction' : 'dir');
  const ergebnis = auswerten(fall, [verweis, APPID, '1.0', '1', '0']);
  assert.equal(ergebnis.code, 1, ergebnis.text);
  assert.match(ergebnis.text, /Laufordner ist nicht prüfbar/);
  assert.equal(existsSync(join(fall.lauf, 'auswertung.json')), false);
});

test('Build-Auswertung: neuer Bericht und Gegenprobe vorhandener Bericht bleibt unverändert', optionen, () => {
  const fall = positiv();
  const vorher = readFileSync(join(fall.lauf, 'auswertung.json'));
  const ergebnis = auswerten(fall);
  assert.equal(ergebnis.code, 1, ergebnis.text);
  assert.match(ergebnis.text, /Bericht konnte nicht neu geschrieben werden/);
  assert.deepEqual(readFileSync(join(fall.lauf, 'auswertung.json')), vorher);
});

for (const [name, argumente] of [
  ['fehlende Angaben', (lauf) => [lauf]],
  ['App-ID mit Elternpfad', (lauf) => [lauf, '../andere', '1.0', '1', '0']],
  ['leerer Versionsname', (lauf) => [lauf, APPID, '', '1', '0']],
  ['Zeilenwechsel im Versionsnamen', (lauf) => [lauf, APPID, '1.0\nINFO: Finished', '1', '0']],
  ['ungültiger Versionscode', (lauf) => [lauf, APPID, '1.0', '../1', '0']],
  ['ungültige Rückgabe', (lauf) => [lauf, APPID, '1.0', '1', '256']],
]) {
  test(`Build-Auswertung: gültige Angaben und Gegenprobe ${name}`, optionen, () => {
    positiv(); const fall = vorbereiten(); const ergebnis = auswerten(fall, argumente(fall.lauf));
    assert.equal(ergebnis.code, 64, ergebnis.text);
    assert.equal(existsSync(join(fall.lauf, 'auswertung.json')), false);
  });
}
