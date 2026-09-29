// Echte anonymisierte Protokolle vom 2026-09-29 und gezielte Gegenproben.
// ZIP-Dateien als APK-Ersatz; kein neuer Build und kein Android-Nachweis.
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
const APPID = 'de.baremos.fristenrechner.probe';
const COMMIT = 'd27fb91d6584822b4803ac30cf79f9e1049e9a38';
const umgebung = { ...process.env, TEMP: arbeit, TMP: arbeit, TMPDIR: arbeit, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-B', '-c',
  'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { windowsHide: true, env: umgebung }).status === 0);
const optionen = { skip: python ? false : 'Python ab 3.9 fehlt' };
const kopf = (text, stufe = 'INFO') => `2026-09-29 16:00:00,000 ${stufe}: ${text}\n`;
const BEGINN = kopf(`Building version 1.0 (1) of ${APPID}`);
const SCANNER = kopf('Scanning source for common problems...');
const ERFOLG = kopf(`Successfully built version 1.0 of ${APPID} from ${COMMIT}`);
const APP_ERFOLG = kopf(`success: ${APPID}`);
const ENDE = kopf('Finished');
const ZUSAMMEN = kopf('1 build succeeded');
const LOG = BEGINN + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;

test.after(() => {
  const unter = relative(scratchpad, arbeit);
  assert.ok(unter && !unter.startsWith('..') && !isAbsolute(unter));
  rmSync(arbeit, { recursive: true, force: true });
});

function pythonAufruf(argumente, timeout) {
  const ergebnis = spawnSync(python, ['-B', ...argumente], {
    encoding: 'utf8', env: umgebung, windowsHide: true, timeout,
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
  writeFileSync(join(lauf, 'lauf.json'), JSON.stringify({ commit: COMMIT, scandeleteVersuch: false }));
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
  assert.match(bericht.protokollformat, /fdroidserver 2\.4\.2.*2026-09-29/);
  assert.equal(bericht.commit, COMMIT);
  for (const meldung of bericht.bekannte_meldungen.liste) {
    assert.ok(ergebnis.text.includes(`Bekannte Meldung ${meldung.art}: ${meldung.anzahl} (höchstens ${meldung.maximal_pro_lauf} je Lauf)`));
  }
  for (const stelle of bericht.bekannte_meldungen.stellen) {
    if (stelle.art === 'gradle_flatdir') {
      assert.ok(['app', 'capacitor-cordova-android-plugins'].includes(stelle.projekt));
    } else if (stelle.art !== 'fehlender_bauordner_vor_quelle') {
      assert.equal(stelle.projekt, null);
    }
  }
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

for (const [name, marker] of [['Beginn', BEGINN], ['Scanner-Beginn', SCANNER], ['Erfolg', ERFOLG], ['App-Erfolg', APP_ERFOLG], ['Ende', ENDE], ['Zusammenfassung', ZUSAMMEN]]) {
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
paar('Reihenfolge und Gegenprobe Erfolg vor Scanner', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + ERFOLG + SCANNER + APP_ERFOLG + ENDE + ZUSAMMEN), /Reihenfolge/);
paar('Ende zuletzt und Gegenprobe spätere Meldung', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG + kopf('weiter')), /Nach dem Ende/);
paar('Ende zuletzt und Gegenprobe spätere Folgezeile', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG + 'weiter\n'), /Nach dem Ende/);

for (const stufe of ['WARNING', 'ERROR', 'CRITICAL']) {
  paar(`Stufe im Meldungstext erlaubt und Gegenprobe ${stufe}`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Hinweis', stufe) + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
  }, new RegExp(`Protokoll, ${stufe}: Hinweis`), BEGINN + kopf(`Text mit ${stufe}: als Beispiel`, 'DEBUG') + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
}
for (const meldung of ['WARNING: etwas', 'ERROR: etwas', 'CRITICAL: etwas', 'Traceback (most recent call last):', 'FAILURE: Build failed with an exception.', 'BUILD FAILED in 2s']) {
  paar(`normale Folgezeile und Gegenprobe ${meldung}`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + meldung + '\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN), /Protokoll, Zeile ohne Kopf/, BEGINN + kopf('> /opt/gradlew.py assembleRelease', 'DEBUG') + '> Task :app:assembleRelease\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
}
paar('normaler Vorspann und Gegenprobe Traceback', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), 'Traceback (most recent call last):\n' + LOG), /Protokoll, Zeile ohne Kopf/, '\n' + LOG);
paar('normale DEBUG-Meldung und Gegenprobe Traceback', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Traceback (most recent call last):', 'DEBUG') + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN), /Protokoll, DEBUG: Traceback/, BEGINN + kopf('Details', 'DEBUG') + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
paar('mehrzeilige Meldung und Gegenprobe mehrzeilige Warnung', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Abbruch', 'WARNING') + 'Traceback (most recent call last):\nDetail\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN), /WARNING: Abbruch \(dazu 2 Folgezeilen\)/, BEGINN + kopf('> /opt/gradlew.py assembleRelease', 'DEBUG') + '> Task :app:preBuild UP-TO-DATE\n> Task :app:assembleRelease\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);

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

const echt = [1, 2, 3].map((n) => readFileSync(join(hier, 'fdroid', 'fixtures', `fdroid-2.4.2-lauf${n}.txt`), 'utf8'));
const weitereWarnungen = echt[2].split('\n').filter((z) => /^(npm warn |Warning: SDK processing\.|w: file:)/.test(z));
assert.equal(weitereWarnungen.length, 4);
const [UUID, SDK, KOTLIN, LEGACY] = weitereWarnungen;
const bekannteListe = JSON.parse(readFileSync(join(hier, 'fdroid', 'bekannte-meldungen.json'), 'utf8'));
const prebuild = kopf('> bash -e -u -o pipefail -x -c -- cd ../..; npm ci --ignore-scripts --no-audit --no-fund;', 'DEBUG');
const kotlinTask = '> Task :capacitor-filesystem:compileReleaseKotlin\n';
const warnungsProbe = (text, kontext) => BEGINN
  + prebuild + '       @capacitor/filesystem@8.1.3\n'
  + (kontext === 'prebuild' ? '' : kopf('> /opt/gradlew.py assembleRelease', 'DEBUG') + kotlinTask)
  + text + '\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;

for (const [name, warnung, kontext, anders] of [
  ['andere uuid-Version', UUID, 'prebuild', UUID.replace('uuid@7.0.3:', 'uuid@7.0.4:')],
  ['andere veraltete npm-Abhängigkeit', UUID, 'prebuild', UUID.replace('uuid@7.0.3:', 'anderes-paket@7.0.3:')],
  ['anderer npm-Wortlaut', UUID, 'prebuild', UUID.replace('in 2028', 'in 2029')],
  ['SDK-Leser Version 4', SDK, 'gradle', SDK.replace('up to 3', 'up to 4')],
  ['SDK-Format Version 5', SDK, 'gradle', SDK.replace('version 4 was', 'version 5 was')],
  ['andere Kotlin-Datei', KOTLIN, 'gradle', KOTLIN.replace('FilesystemPlugin.kt', 'AnderesPlugin.kt')],
  ['andere Kotlin-Zeile', KOTLIN, 'gradle', KOTLIN.replace(':335:31', ':336:31')],
  ['andere Kotlin-Spalte', KOTLIN, 'gradle', KOTLIN.replace(':335:31', ':335:32')],
  ['anderer Kotlin-Wortlaut', KOTLIN, 'gradle', KOTLIN.replace('is deprecated.', 'is deprecated!')],
  ['andere Kotlin-Warnung', KOTLIN, 'gradle', 'w: Eine neue Warnung des Compilers'],
]) {
  paar(`bekannte Warnung und Gegenprobe ${name}`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), warnungsProbe(anders, kontext));
  }, /Zeile ohne Kopf/, warnungsProbe(warnung, kontext));
}

for (const [art, warnung, kontext] of [
  ['npm_uuid_7_0_3', UUID, 'prebuild'],
  ['android_sdk_xml_3_4', SDK, 'gradle'],
  ['kotlin_filesystem_downloadfile', KOTLIN, 'gradle'],
]) {
  test(`Build-Auswertung: ${art} sichtbar; Gegenprobe einmal zu oft`, optionen, () => {
    const fall = positiv(vorbereiten(warnungsProbe(warnung, kontext)));
    const b = bericht(fall);
    assert.equal(b.bekannte_meldungen.liste.find((m) => m.art === art).anzahl, 1);
    const doppelt = vorbereiten(warnungsProbe(`${warnung}\n${warnung}`, kontext));
    negativ(doppelt, new RegExp(`Bekannte Meldung ${art}: 2 Vorkommen, erlaubt sind höchstens 1`));
    assert.equal(bericht(doppelt).bekannte_meldungen.liste.find((m) => m.art === art).anzahl, 2);
  });
  paar(`${art} und unbekannte Folgezeile`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), warnungsProbe(`${warnung}\nNeue Ausgabe`, kontext));
  }, /Zeile ohne Kopf: Neue Ausgabe/, warnungsProbe(warnung, kontext));
  paar(`${art} im richtigen Kontext`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), BEGINN + kopf('Details', 'DEBUG') + warnung + '\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
  }, /Zeile ohne Kopf/, warnungsProbe(warnung, kontext));
  for (const stufe of ['WARNING', 'ERROR']) {
    paar(`${art} mit fremdem ${stufe}-Kopf`, ({ lauf }) => {
      writeFileSync(join(lauf, 'build.log'), BEGINN + kopf(warnung, stufe) + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
    }, new RegExp(`Protokoll, ${stufe}:`), warnungsProbe(warnung, kontext));
  }
}

test('Build-Auswertung: fehlende bekannte Meldungen sind sichtbar und zulässig', optionen, () => {
  const fall = positiv();
  const liste = bericht(fall).bekannte_meldungen.liste;
  assert.equal(liste.length, bekannteListe.length);
  assert.equal(new Set(liste.map((m) => m.art)).size, liste.length);
  for (const meldung of liste) {
    assert.equal(meldung.anzahl, 0);
    assert.ok(meldung.muster && meldung.herkunft && meldung.grund && meldung.kontext);
    assert.equal(meldung.beobachtet_am, '2026-09-29');
    assert.ok(Number.isInteger(meldung.maximal_pro_lauf) && meldung.maximal_pro_lauf > 0);
  }
  assert.deepEqual(liste.map(({ anzahl, ...eintrag }) => eintrag), bekannteListe);
  const falsch = vorbereiten(LOG.replace(SCANNER, kopf('Neue Warnung', 'WARNING') + SCANNER));
  negativ(falsch, /WARNING: Neue Warnung/);
});

paar('Kotlin mit wechselndem Laufpfad', ({ lauf }) => {
  writeFileSync(join(lauf, 'build.log'), warnungsProbe(KOTLIN.replace('/node_modules/', '/andere_module/'), 'gradle'));
}, /Zeile ohne Kopf/, warnungsProbe(KOTLIN.replace('/opt/probe/lauf/', '/tmp/anderer-lauf/'), 'gradle'));
paar('Kotlin nur für Filesystem 8.1.3', ({ lauf }) => {
  writeFileSync(join(lauf, 'build.log'), warnungsProbe(KOTLIN, 'gradle').replace('       @capacitor/filesystem@8.1.3\n', ''));
}, /Zeile ohne Kopf: w:/, warnungsProbe(KOTLIN, 'gradle'));
// Fehlende bekannte Meldungen sind zulässig; ohne Legacy bleiben acht statt neun.
const ohneLegacyWarnung = echt[2].replace(LEGACY + '\n', '');
function versuch(protokoll, scandeleteVersuch = true) {
  const fall = vorbereiten(protokoll);
  writeFileSync(join(fall.lauf, 'lauf.json'), JSON.stringify({ commit: COMMIT, scandeleteVersuch }));
  return fall;
}
function bericht(fall) { return JSON.parse(readFileSync(join(fall.lauf, 'auswertung.json'), 'utf8')); }

for (const [name, aendern] of [
  ['Commit fehlt', (lauf) => writeFileSync(join(lauf, 'lauf.json'), JSON.stringify({ scandeleteVersuch: false }))],
  ['Commit verkürzt', (lauf) => writeFileSync(join(lauf, 'lauf.json'), JSON.stringify({ commit: COMMIT.slice(0, 7), scandeleteVersuch: false }))],
  ['Kennzeichnung als Text', (lauf) => writeFileSync(join(lauf, 'lauf.json'), JSON.stringify({ commit: COMMIT, scandeleteVersuch: 'false' }))],
  ['Kennzeichnung fehlt', (lauf) => writeFileSync(join(lauf, 'lauf.json'), JSON.stringify({ commit: COMMIT }))],
  ['Laufangaben fehlen', (lauf) => rmSync(join(lauf, 'lauf.json'))],
  ['Laufangaben ungültiges JSON', (lauf) => writeFileSync(join(lauf, 'lauf.json'), '{')],
  ['Laufangaben als Liste', (lauf) => writeFileSync(join(lauf, 'lauf.json'), '[]')],
]) {
  paar(`Laufangaben vorhanden und Gegenprobe ${name}`, ({ lauf }) => aendern(lauf), /Laufangaben sind nicht prüfbar/);
}
paar('Commit bei Erfolg und Gegenprobe fremder Commit', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(`from ${COMMIT}`, `from ${'f'.repeat(40)}`)), /Unerwartete Build-Meldung/);
paar('Commit bei Erfolg und Gegenprobe ohne Commit', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG.replace(` from ${COMMIT}`, '')), /Unerwartete Build-Meldung/);
paar('unbekannte kopflose Zeile bleibt Befund', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), BEGINN + 'Unbekannte Ausgabe\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN), /Zeile ohne Kopf: Unbekannte Ausgabe/);
paar('unbekannter Vorspann bleibt Befund', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), 'Unbekannter Vorspann\n' + LOG), /Zeile ohne Kopf: Unbekannter Vorspann/);
paar('bekannte Abschluss-DEBUG-Ausgabe und Gegenprobe anderer Inhalt', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), LOG + kopf('neue Abschlussmeldung', 'DEBUG')), /Nach dem Ende/, LOG + kopf('skip deploying full build logs: not enabled in config', 'DEBUG'));

const NOPATH = kopf(`NoSuchPathError: build/${APPID}`, 'WARNING');
const QUELLE = kopf(`Getting source for revision ${COMMIT}`);
const mitNopath = BEGINN + NOPATH + QUELLE + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;
test('Build-Auswertung: NoSuchPathError bleibt bei Überschreitung vollständig gezählt', optionen, () => {
  positiv(vorbereiten(mitNopath));
  const fall = vorbereiten(mitNopath.replace(NOPATH, NOPATH + NOPATH));
  negativ(fall, /fehlender_bauordner_vor_quelle: 2 Vorkommen, erlaubt sind höchstens 1/);
  assert.equal(bericht(fall).bekannte_meldungen.liste.find((m) => m.art === 'fehlender_bauordner_vor_quelle').anzahl, 2);
});
for (const [name, anders] of [
  ['falscher Pfad', mitNopath.replace(`NoSuchPathError: build/${APPID}`, 'NoSuchPathError: build/de.andere.app')],
  ['zweimal', mitNopath.replace(NOPATH, NOPATH + NOPATH)],
  ['nach Quelle', mitNopath.replace(NOPATH + QUELLE, QUELLE + NOPATH)],
  ['vor Beginn', NOPATH + mitNopath.replace(NOPATH, '')],
  ['Quelle fehlt', mitNopath.replace(QUELLE, '')],
  ['falscher Quellencommit', mitNopath.replace(QUELLE, QUELLE.replace(COMMIT, 'f'.repeat(40)))],
  ['INFO zwischen Warnung und Quelle', mitNopath.replace(NOPATH, NOPATH + kopf('weitere Tätigkeit'))],
  ['zusätzliche Folgezeile', mitNopath.replace(NOPATH, NOPATH + 'Details\n')],
]) {
  paar(`NoSuchPathError eng erfasst und Gegenprobe ${name}`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), anders), /Protokoll, WARNING: NoSuchPathError/, mitNopath);
}

const FLATDIR = "WARNING: Using flatDir should be avoided because it doesn't support any meta-data formats.\n";
const GRADLE = kopf('> /opt/gradlew.py clean', 'DEBUG') + '> Configure project :app\n' + FLATDIR;
const mitFlatdir = BEGINN + GRADLE + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;
test('Build-Auswertung: vier flatDir-Meldungen erlaubt; Gegenprobe fünftes Vorkommen', optionen, () => {
  const projekte = ['app', 'capacitor-cordova-android-plugins'].map((p) => `> Configure project :${p}\n${FLATDIR}`).join('');
  const protokoll = BEGINN + ['clean', 'assembleRelease'].map((phase) => kopf(`> /opt/gradlew.py ${phase}`, 'DEBUG') + projekte).join('') + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;
  const ok = positiv(vorbereiten(protokoll));
  assert.equal(bericht(ok).bekannte_meldungen.anzahl, 4);
  const fall = vorbereiten(protokoll.replace(SCANNER, '> Configure project :app\n' + FLATDIR + SCANNER));
  negativ(fall, /gradle_flatdir: 5 Vorkommen, erlaubt sind höchstens 4/);
  assert.equal(bericht(fall).bekannte_meldungen.anzahl, 5);
});
for (const [name, anders] of [
  ['falscher Wortlaut', mitFlatdir.replace(FLATDIR, FLATDIR.replace('formats.', 'formats!'))],
  ['zweimal im Projekt', mitFlatdir.replace(FLATDIR, FLATDIR + '> Configure project :app\n' + FLATDIR)],
  ['fremdes Projekt', mitFlatdir.replace('Configure project :app', 'Configure project :andere')],
  ['außerhalb Gradle', mitFlatdir.replace(kopf('> /opt/gradlew.py clean', 'DEBUG'), kopf('Details', 'DEBUG'))],
  ['ohne Projekt', mitFlatdir.replace('> Configure project :app\n', '')],
]) {
  paar(`flatDir eng erfasst und Gegenprobe ${name}`, ({ lauf }) => writeFileSync(join(lauf, 'build.log'), anders), /Zeile ohne Kopf: WARNING: Using flatDir/, mitFlatdir);
}

test('Build-Auswertung: echter Lauf 1 scheitert trotz Rückgabe 0; Gegenprobe vollständiger Erfolg', optionen, () => {
  positiv();
  const fall = vorbereiten(echt[0]);
  rmSync(fall.apk);
  negativ(fall, /TypeError: str expected, not NoneType/);
  assert.equal(bericht(fall).rueckgabewert_build, 0);
  assert.ok(bericht(fall).beanstandungen.some((z) => z.includes('Erfolg genau einmal nennen, gefunden: 0')));
});

test('Build-Auswertung: echter Lauf 2 hat zehn Scannerfehler; Gegenprobe vollständiger Erfolg', optionen, () => {
  positiv();
  const fall = versuch(echt[1], false);
  rmSync(fall.apk);
  negativ(fall, /Can't build due to 10 errors while scanning/);
  assert.equal(bericht(fall).beanstandungen.filter((z) => z.startsWith('Protokoll, ERROR: Found ')).length, 10);
  assert.deepEqual(bericht(fall).entfernte_dateien.stellen.map((z) => z.pfad), ['android/gradle/wrapper/gradle-wrapper.jar']);
});

test('Build-Auswertung: echter Lauf 3 besteht mit neun bekannten Meldungen; Gegenprobe andere Stelle der Legacy-Warnung', optionen, () => {
  const b = bericht(positiv(versuch(echt[2])));
  assert.equal(b.beanstandungen.length, 0);
  assert.equal(b.bekannte_meldungen.anzahl, 9);
  assert.equal(b.bekannte_meldungen.stellen.filter((z) => z.art === 'gradle_flatdir').length, 4);
  assert.equal(b.bekannte_meldungen.stellen.filter((z) => z.art === 'kotlin_filesystem_legacy_typ').length, 1);
  assert.equal(b.entfernte_dateien.anzahl, 11);
  assert.equal(b.entfernte_dateien.stellen.filter((z) => z.pfad.startsWith('node_modules/')).length, 10);
  assert.ok(b.bekannte_meldungen.stellen.every((z) => Number.isInteger(z.zeile) && z.zeile > 0));
  // Ohne die Legacy-Warnung besteht der Lauf ebenfalls, mit acht bekannten Meldungen.
  assert.equal(bericht(positiv(versuch(ohneLegacyWarnung))).bekannte_meldungen.anzahl, 8);
  for (const [von, nach] of [
    ['LegacyFilesystemImplementation.kt:66:29', 'LegacyFilesystemImplementation.kt:67:29'],
    ['LegacyFilesystemImplementation.kt:66:29', 'AndereImplementation.kt:66:29'],
    ["inferred type is 'String?'", "inferred type is 'Int?'"],
  ]) {
    assert.ok(echt[2].includes(von), von);
    const fall = versuch(echt[2].replace(von, nach));
    negativ(fall, /Protokoll, Zeile ohne Kopf: w: file:/);
    assert.equal(bericht(fall).beanstandungen.length, 1);
  }
  // Dieselbe Warnung ein zweites Mal überschreitet die erlaubte Zahl.
  const zeile = echt[2].split('\n').find((z) => z.includes('LegacyFilesystemImplementation.kt:66:29'));
  negativ(versuch(echt[2].replace(zeile, `${zeile}\n${zeile}`)), /kotlin_filesystem_legacy_typ|LegacyFilesystemImplementation/);
});

test('Build-Auswertung: Dauer des Web-Builds in Sekunden; Gegenprobe andere Einheit', optionen, () => {
  // Beobachtet am 2026-09-29: derselbe Build meldet einmal 398ms, einmal 1.53s.
  assert.ok(echt[2].includes('398ms'));
  positiv(versuch(echt[2].replace('398ms', '1.53s')));
  const fall = versuch(echt[2].replace('398ms', '1.53min'));
  negativ(fall, /Protokoll, Zeile ohne Kopf: .*page\(s\) built in/);
  assert.equal(bericht(fall).beanstandungen.length, 1);
});

// Formate aus den festgelegten Werkzeugquellen, einschließlich Rundungsgrenzen.
// Datei- und Zeilenbelege sowie Herkunft der lokalen Quellen: docs/fdroid-build.md.
const zeitformate = [
  {
    werkzeug: 'Gradle 8.14.5', kontext: kopf('> /opt/gradlew.py assembleRelease', 'DEBUG'),
    zeilen: [(d) => `BUILD SUCCESSFUL in ${d}`],
    grenzen: [
      ['0ms', '-1ms', '-0ms', '00ms'], ['999ms', '1000ms'],
      ['1s', '0s', '01s'], ['59s', '60s'],
      ['1m', '0m', '01m'], ['59m', '60m'],
      ['1m 1s', '1m 0s', '1m 01s'], ['59m 59s', '59m 60s', '60m 59s'],
      ['1h', '0h', '01h'], ['25h', '1d'],
      ['1h 1s', '1h 0s', '1h 01s'], ['1h 59s', '1h 60s'],
      ['1h 1m', '1h 0m', '1h 01m'], ['1h 59m', '1h 60m'],
      ['1h 1m 1s', '1h 1m 0s', '1h 0m 1s'],
      ['25h 59m 59s', '25h 60m 59s', '25h 59m 60s'],
    ],
    ungueltig: ['1.00s'],
  },
  {
    werkzeug: 'npm 11.19.0', kontext: prebuild,
    zeilen: [(d) => `added 394 packages in ${d}`],
    grenzen: [
      ['0ms', '-0ms', '00ms'],
      ['1ms', '01ms'], ['-1ms', '-01ms'],
      ['999ms', '1000ms'], ['-999ms', '-1000ms'],
      ...['s', 'm'].flatMap((einheit) => [
        [`1${einheit}`, `0${einheit}`, `01${einheit}`],
        [`-1${einheit}`, `-0${einheit}`, `-01${einheit}`],
        [`60${einheit}`, `61${einheit}`], [`-60${einheit}`, `-61${einheit}`],
      ]),
      ['1h', '0h', '01h'], ['-1h', '-0h', '-01h'],
      ['24h', '25h'], ['-24h', '-25h'],
      ['1d', '0d', '01d'], ['-1d', '-0d', '-01d'],
      ['5000d', '5000.0d'], ['-5000d', '-5000.0d'],
    ],
    ungueltig: ['1w', '1.2s', '1m 1s'],
  },
  {
    werkzeug: 'Astro 7.3.3', kontext: prebuild,
    zeilen: [
      (d) => `16:30:00 [types] Generated ${d}`,
      (d) => `16:30:00 [build] ✓ Completed in ${d}.`,
      (d) => `16:30:00 ✓ Completed in ${d}.`,
      (d) => `16:30:00   ├─ /index.html (+${d}) `,
      (d) => `16:30:00 [build] 1 page(s) built in ${d}`,
    ],
    grenzen: [
      ['0ms', '-1ms', '-0ms', '00ms'], ['999ms', '0999ms'], ['1000ms', '1001ms'],
      ['1.00s', '0.99s', '01.00s'], ['59.99s', '060.00s'], ['60.00s', '60.01s'],
      ['1m 0s', '0m 0s', '1m 00s'], ['1m 1s', '1m 01s'],
      ['1m 59s', '01m 59s'], ['1m 60s', '1m 61s'], ['120m 5s', '120m 05s'],
    ],
    ungueltig: ['1h', '1s', '1.2s', '1m', '1m 61s', '-1ms'],
  },
  {
    werkzeug: 'Vite 8.3.0', kontext: prebuild,
    zeilen: [(d) => `16:30:00 [vite] ✓ built in ${d}`],
    grenzen: [
      ['0ms', '-0ms', '00ms'], ['999ms', '1000ms'],
      ['-1ms', '-01ms'], ['-1000ms', '-01000ms'], ['-5000ms', '-5000.0ms'],
      ['1.00s', '0.99s', '01.00s'], ['59.99s', '060.00s'], ['60.00s', '60.01s'],
      ['1m', '0m', '01m'], ['1m 1s', '1m 0s', '1m 01s'], ['1m 59s', '1m 60s'],
      ['2m', '2m 0s'], ['120m 5s', '120m 05s'],
    ],
    ungueltig: ['1h', '1s', '1.2s', '1m 0s', '1m 60s', '-1.00s'],
  },
  {
    werkzeug: 'Capacitor 8.5.2 Aufgaben', kontext: prebuild,
    zeilen: [
      'Copying web assets from dist to android/app/src/main/assets/public',
      'Creating capacitor.config.json in android/app/src/main/assets',
      'copy android', 'Updating Android plugins', 'update android',
    ].map((aufgabe) => (d) => `✔ ${aufgabe} in ${d}`),
    grenzen: [
      ['0.00μs', '-0.01μs', '-0.00μs', '00.00μs'],
      ['999.99μs', '0999.99μs'], ['1000.00μs', '1000.01μs'],
      ['1.00ms', '0.99ms', '01.00ms'], ['999.99ms', '0999.99ms'],
      ['1000.00ms', '1000.01ms'], ['1.00s', '0.99s', '01.00s'],
      ['120.50s', '120.5s'],
    ],
    ungueltig: ['1.00ns', '1.00m', '1s', '1.2ms', '-1.00ms'],
  },
  {
    werkzeug: 'Capacitor 8.5.2 Sync', kontext: prebuild,
    zeilen: [(d) => `[info] Sync finished in ${d}`],
    grenzen: [
      ['0s', '-0s', '00s', '0.0s'], ['1s', '01s', '1.0s'], ['-1s', '-01s', '-1.0s'],
      ['0.1s', '0.10s'], ['-0.1s', '-0.10s'],
      ['0.01s', '0.010s'], ['-0.01s', '-0.010s'],
      ['0.001s', '0.0001s'], ['-0.001s', '-0.0001s'],
      ['1.5s', '1.50s'], ['-1.5s', '-1.50s'],
      ['1.001s', '1.0010s'], ['120s', '0120s'],
    ],
    ungueltig: ['1ms', '1m', '0.0001s'],
  },
];
for (const { werkzeug, kontext, zeilen, grenzen, ungueltig } of zeitformate) {
  for (const zeile of zeilen) {
    test(`Build-Auswertung: ${werkzeug}: ${zeile('<Dauer>')}`, optionen, () => {
      const fall = vorbereiten();
      const pruefen = (text, erlaubt, kopfzeile = kontext) => {
        rmSync(join(fall.lauf, 'auswertung.json'), { force: true });
        writeFileSync(join(fall.lauf, 'build.log'), BEGINN + kopfzeile + text + '\n'
          + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN);
        if (erlaubt) positiv(fall);
        else {
          negativ(fall, /Protokoll, Zeile ohne Kopf/);
          assert.equal(bericht(fall).beanstandungen.length, 1);
        }
      };
      for (const [dauer, ...jenseits] of grenzen) {
        pruefen(zeile(dauer), true);
        // Gültiger Randwert und die Gegenproben unmittelbar daneben.
        for (const gegenprobe of jenseits) pruefen(zeile(gegenprobe), false);
        // Zusatz direkt nach der Dauer, auch innerhalb von Punkt/Klammer.
        pruefen(zeile(`${dauer} Zusatz`), false);
        pruefen(zeile(`${dauer} warning: neue Warnung`), false);
      }
      for (const dauer of ungueltig) pruefen(zeile(dauer), false);
      pruefen(`${zeile(grenzen[0][0])} warning: neue Warnung`, false);
      pruefen(zeile(grenzen[0][0]), false, kopf('Details', 'DEBUG'));
    });
  }
}

const gradleKontext = kopf('> /opt/gradlew.py assembleRelease', 'DEBUG');
const zeilenProtokoll = (text, kontext = prebuild) => BEGINN + kontext + text + '\n'
  + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;
const andereZiffern = [
  ['Arabisch-Indisch', '٠١٢٣٤٥٦٧٨٩'],
  ['Vollbreite', '０１２３４５６７８９'],
  ['Devanagari', '०१२३४५६७८९'],
];
const ziffernErsetzen = (text, alphabet) => text.replace(/[0-9]/g, (z) => alphabet[Number(z)]);
const asciiZeilen = [
  ['Paketzahl', 'added 394 packages in 9s', '394', prebuild],
  ['Dateizahl', 'Inventar vor dem Scanner: 5 Dateien; eingebettetes WASM nicht vollständig erfasst.', '5', prebuild],
  ['Aufgabenzahl', '188 actionable tasks: 188 executed', '188', gradleKontext],
  ['Seitenzahl', '16:30:00 [build] 1 page(s) built in 1.53s', '1 page', prebuild],
  ...[
    '[build] output: "static"', '[build] mode: "static"', '[build] directory: /opt/probe/dist/',
    '[build] Collecting build info...', '[build] Building static entrypoints...',
    '[build] Rearranging server assets...', '[build] Complete!', '[types] Generated 1.00s',
    '[build] ✓ Completed in 1.00s.', '✓ Completed in 1.00s.', '[vite] ✓ built in 1.00s',
    '  ├─ /index.html (+1.00s) ', '[build] 1 page(s) built in 1.00s',
  ].map((text) => [`Uhrzeit ${text}`, `16:30:00 ${text}`, '16:30:00', prebuild]),
];
for (const [name, zeile, zahl, kontext] of asciiZeilen) {
  test(`Build-Auswertung: ASCII ${name}; Gegenproben in drei Ziffernschriften`, optionen, () => {
    positiv(vorbereiten(zeilenProtokoll(zeile, kontext)));
    for (const [, alphabet] of andereZiffern) {
      const anders = zeile.replace(zahl, ziffernErsetzen(zahl, alphabet));
      negativ(vorbereiten(zeilenProtokoll(anders, kontext)), /Protokoll, Zeile ohne Kopf/);
    }
  });
}
for (const [name, alphabet] of andereZiffern) {
  paar(`ASCII im Protokollkopf; Gegenprobe ${name}`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), LOG.replace('2026-09-29', ziffernErsetzen('2026-09-29', alphabet)));
  }, /Beginn genau einmal.*0/);
  paar(`Regressionsschutz: Zusammenfassung mit fremder Ziffer bleibt unerwartet (${name})`, ({ lauf }) => {
    writeFileSync(join(lauf, 'build.log'), LOG.replace('1 build succeeded', `${alphabet[1]} build succeeded`));
  }, /Unerwartete Build-Meldung/);
}
test('Build-Auswertung: Zusammenfassung mit Zahl; Gegenprobe zusätzlicher Marker x build succeeded', optionen, () => {
  positiv();
  const fall = vorbereiten(LOG.replace(SCANNER, SCANNER + kopf('x build succeeded')));
  negativ(fall, /Unerwartete Build-Meldung: INFO: x build succeeded/);
  assert.equal(bericht(fall).beanstandungen.length, 1);
});

test('Build-Auswertung: Inventarzeile und Gegenprobe mit 64.000 wiederholten Trennern unter Zeitgrenze', optionen, () => {
  // Der frühere offene Pfad konnte jeden Trenner wieder verschlucken. 1,9 MB
  // müssen ohne den quadratischen Suchlauf innerhalb von fünf Sekunden enden.
  const ergebnis = pythonAufruf(['-c', [
    'import runpy,sys',
    'pruefen = runpy.run_path(sys.argv[1])["normale_folgezeile"]',
    'assert pruefen("+ python3 /opt/probe/npm-inventar.py node_modules /opt/probe/npm-vorgebaut-vor-web.json", "prebuild", "de.baremos.fristenrechner.probe")',
    'angriff = "+ python3 " + "/npm-inventar.py node_modules " * 64000 + "x"',
    'assert not pruefen(angriff, "prebuild", "de.baremos.fristenrechner.probe")',
  ].join('\n'), skript], 5000);
  assert.equal(ergebnis.code, 0, ergebnis.text);
});

const pfadZeilen = [
  ['Gradle-Cache', gradleKontext, (p) => `CACHEDIR set to ${p}/fdroid-cache`],
  ['Gradle-Cache-Nutzung', gradleKontext, (p) => `Using cache directory ${p}/fdroid-cache`],
  ['Gradle-Aufruf', gradleKontext, (p) => `Running ${p}/fdroid-cache/versions/8.14.5/bin/gradle clean`],
  ['Gradle-Bericht', gradleKontext, (p) => `[Incubating] Problems report is available at: file://${p}/android/build/reports/problems/problems-report.html`],
  ['Lockfile-Kopie', prebuild, (p) => `+ cp package-lock.json ${p}/package-lock-minimal-app.json`],
  ['Inventarskript', prebuild, (p) => `+ python3 ${p}/npm-inventar.py node_modules /opt/probe/npm-vorgebaut-vor-web.json`],
  ['Inventarziel', prebuild, (p) => `+ python3 /opt/probe/npm-inventar.py node_modules ${p}/npm-vorgebaut-nach-web.json`],
  ['Astro-Ausgabeordner', prebuild, (p) => `16:30:00 [build] directory: ${p}/dist/`],
];
for (const [name, kontext, zeile] of pfadZeilen) {
  test(`Build-Auswertung: Pfad ${name}; Gegenproben mit Warnung und Steuerzeichen`, optionen, () => {
    positiv(vorbereiten(zeilenProtokoll(zeile('/opt/probe-lauf_1/@paket+cache%20'), kontext)));
    for (const zusatz of [' warning: neue Warnung ', '/warning:neu', ' BUILD FAILED in 5s ', '\x1b[2K', '\b', '\t', '\x7f', '\u009b', '\u00a0']) {
      const falsch = zeilenProtokoll(zeile(`/opt/probe${zusatz}/lauf`), kontext);
      negativ(vorbereiten(falsch), /Protokoll, Zeile ohne Kopf/);
    }
  });
}
paar('Gradle-Kontext mit engem Pfad und Gegenprobe Warnung im Skriptpfad', ({ lauf }) => {
  writeFileSync(join(lauf, 'build.log'), zeilenProtokoll('> Task :app:assembleRelease',
    kopf('> /opt/probe warning: neu /gradlew.py assembleRelease', 'DEBUG')));
}, /Protokoll, Zeile ohne Kopf/, zeilenProtokoll('> Task :app:assembleRelease', gradleKontext));
test('Build-Auswertung: Scannerpfad und Gegenprobe Warnung oder Steuerzeichen im Pfad', optionen, () => {
  positiv(versuch(LOG.replace(SCANNER, SCANNER + kopf('Removing binary at node_modules/test/datei'))));
  for (const zusatz of [' warning: neu ', '\x1b[2K', '\b', '\t']) {
    negativ(versuch(LOG.replace(SCANNER, SCANNER + kopf(`Removing binary at node_modules/test${zusatz}/datei`))), /Scanner-Entfernung/);
  }
});

test('Build-Auswertung: Beanstandung zeigt Rand-Leerraum und Steuerzeichen in Text und JSON', optionen, () => {
  positiv(vorbereiten(zeilenProtokoll('BUILD SUCCESSFUL in 5s', gradleKontext)));
  const faelle = [
    ['BUILD SUCCESSFUL in 5s ', 'BUILD SUCCESSFUL in 5s\\x20'],
    ['BUILD SUCCESSFUL in 5s  ', 'BUILD SUCCESSFUL in 5s\\x20\\x20'],
    ['  BUILD SUCCESSFUL in 5s', '\\x20\\x20BUILD SUCCESSFUL in 5s'],
    ['BUILD SUCCESSFUL in 5s\t', 'BUILD SUCCESSFUL in 5s\\t'],
    ['BUILD SUCCESSFUL in 5s\x1f', 'BUILD SUCCESSFUL in 5s\\x1f'],
    ['BUILD SUCCESSFUL in 5s\u00a0', 'BUILD SUCCESSFUL in 5s\\xa0'],
    ['BUILD SUCCESSFUL in 5s\x1b[8m warning: verborgen\x1b[28m', 'BUILD SUCCESSFUL in 5s\\x1b[8m warning: verborgen\\x1b[28m'],
    ['BUILD SUCCESSFUL in 5s\\t', 'BUILD SUCCESSFUL in 5s\\\\t'],
  ];
  for (const [roh, sichtbar] of faelle) {
    const fall = vorbereiten(zeilenProtokoll(roh, gradleKontext));
    const ergebnis = negativ(fall, /Protokoll, Zeile ohne Kopf/);
    const meldungen = bericht(fall).beanstandungen;
    assert.equal(meldungen.length, 1);
    assert.ok(meldungen[0].includes(sichtbar), `${JSON.stringify(roh)}: ${meldungen[0]}`);
    assert.ok(ergebnis.text.includes(sichtbar), ergebnis.text);
    assert.doesNotMatch(ergebnis.text, /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/);
    assert.doesNotMatch(meldungen[0], /[\x00-\x1f\x7f]/);
  }
  const vorspann = vorbereiten('  unbekannt\t\n' + LOG);
  negativ(vorspann, /\\x20\\x20unbekannt\\t/);
  assert.ok(bericht(vorspann).beanstandungen[0].includes('\\x20\\x20unbekannt\\t'));
  const kopfFall = vorbereiten(LOG.replace(SCANNER, kopf('Warnung\x1b[8m verborgen\x1b[28m\t', 'WARNING') + SCANNER));
  const kopfErgebnis = negativ(kopfFall, /WARNING: Warnung\\x1b\[8m verborgen\\x1b\[28m\\t/);
  assert.doesNotMatch(kopfErgebnis.text, /\x1b/);
});

const trennzeichen = [
  ['CR', '\r', '\\r'], ['VT', '\x0b', '\\x0b'], ['FF', '\x0c', '\\x0c'],
  ['FS', '\x1c', '\\x1c'], ['GS', '\x1d', '\\x1d'], ['RS', '\x1e', '\\x1e'],
  ['NEL', '\x85', '\\x85'], ['LS', '\u2028', '\\u2028'], ['PS', '\u2029', '\\u2029'],
];
for (const stufe of ['INFO', 'DEBUG']) {
  test(`Build-Auswertung: druckbarer ${stufe}-Kopf; Gegenproben mit Trenner und WARNING-Kopf`, optionen, () => {
    positiv(vorbereiten(LOG.replace(SCANNER, kopf('Details', stufe) + SCANNER)));
    for (const [name, roh, sichtbar] of [...trennzeichen, ['ESC[2K', '\x1b[2K', '\\x1b[2K']]) {
      const text = `Details${roh}${kopf('Neue Warnung', 'WARNING').trimEnd()}`;
      const fall = vorbereiten(LOG.replace(SCANNER, kopf(text, stufe) + SCANNER));
      const ergebnis = negativ(fall, new RegExp(`Protokoll, ${stufe} mit Steuer- oder Trennzeichen:`));
      const meldungen = bericht(fall).beanstandungen;
      assert.equal(meldungen.length, 1, name);
      const erwartet = `Details${sichtbar}2026-09-29 16:00:00,000 WARNING: Neue Warnung`;
      assert.ok(meldungen[0].includes(erwartet), meldungen[0]);
      assert.ok(ergebnis.text.includes(erwartet), ergebnis.text);
      assert.equal(meldungen[0].includes(roh), false, name);
      assert.equal(ergebnis.text.replaceAll('\r\n', '\n').includes(roh), false, name);
    }
  });
}

test('Build-Auswertung: LF und CRLF trennen Gradle-Zeilen; andere Trenner bleiben sichtbar in einer Zeile', optionen, () => {
  const task = '> Task :app:assembleRelease';
  positiv(vorbereiten(zeilenProtokoll(task, gradleKontext)));
  positiv(vorbereiten(zeilenProtokoll(`${task}\r`, gradleKontext)));
  positiv(vorbereiten(zeilenProtokoll(task, gradleKontext).replaceAll('\n', '\r\n')));
  for (const [name, roh, sichtbar] of trennzeichen) {
    const fall = vorbereiten(zeilenProtokoll(`${task}${roh}> Task :app:preBuild`, gradleKontext));
    const ergebnis = negativ(fall, /Protokoll, Zeile ohne Kopf/);
    const erwartet = `Protokoll, Zeile ohne Kopf: ${task}${sichtbar}> Task :app:preBuild (Zeile 3)`;
    assert.deepEqual(bericht(fall).beanstandungen, [erwartet], name);
    assert.ok(ergebnis.text.includes(erwartet), ergebnis.text);
  }
});

test('Build-Auswertung: Schluss ohne LF bleibt gültig; Gegenprobe einzelnes CR am Dateiende', optionen, () => {
  const abschluss = LOG + kopf('skip deploying full build logs: not enabled in config', 'DEBUG').trimEnd();
  positiv(vorbereiten(abschluss));
  const fall = vorbereiten(`${abschluss}\r`);
  const ergebnis = negativ(fall, /DEBUG mit Steuer- oder Trennzeichen: .*config\\r/);
  const meldungen = bericht(fall).beanstandungen;
  assert.equal(meldungen.length, 2);
  assert.ok(meldungen.some((text) => text.includes('config\\r')));
  assert.ok(meldungen.some((text) => text.startsWith('Nach dem Ende')));
  assert.equal(ergebnis.text.replaceAll('\r\n', '\n').includes('\r'), false);
});

test('Build-Auswertung: bekannte Unicode-Zeichen bleiben lesbar; verwechselbare Zeichen werden escaped', optionen, () => {
  const capacitor = '\u2714 copy android in 724.58\u03bcs';
  positiv(vorbereiten(zeilenProtokoll(capacitor)));
  const faelle = [
    [capacitor.replace('\u03bc', '\u00b5'), '\u00b5', '\u2714 copy android in 724.58\\xb5s', prebuild],
    ...[
      ['\u2800', '\\u2800'], ['\u3164', '\\u3164'], ['\u115f', '\\u115f'],
      ['\u034f', '\\u034f'], ['\ufe0f', '\\ufe0f'], ['\u0338', '\\u0338'], ['\u0421', '\\u0421'],
    ].map(([roh, sichtbar]) => [`BUILD SUCCESSFUL in 5s${roh}`, roh, `BUILD SUCCESSFUL in 5s${sichtbar}`, gradleKontext]),
    [`${capacitor} Zusatz`, null, `${capacitor} Zusatz`, prebuild],
  ];
  for (const [zeile, roh, sichtbar, kontext] of faelle) {
    const fall = vorbereiten(zeilenProtokoll(zeile, kontext));
    const ergebnis = negativ(fall, /Protokoll, Zeile ohne Kopf/);
    const meldungen = bericht(fall).beanstandungen;
    assert.equal(meldungen.length, 1);
    assert.ok(meldungen[0].includes(sichtbar), meldungen[0]);
    assert.ok(ergebnis.text.includes(sichtbar), ergebnis.text);
    if (roh) {
      assert.equal(meldungen[0].includes(roh), false);
      assert.equal(ergebnis.text.includes(roh), false);
    }
  }
});

const leerraumZeilen = [
  ['   ', '\\x20\\x20\\x20'], ['\t', '\\t'], ['\x0b\x0c', '\\x0b\\x0c'],
  ['\x1f\x1e', '\\x1f\\x1e'], ['\x1b[8m\x85', '\\x1b[8m\\x85'],
  ['\u2028\u3000', '\\u2028\\u3000'], ['\r\r', '\\r'],
];
for (const [name, protokoll, nachEnde] of [
  ['Vorspann', (zeile) => `${zeile}\n${LOG}`, false],
  ['Gradle-Folgezeile', (zeile) => zeilenProtokoll(zeile, gradleKontext), false],
  ['nach Finished', (zeile) => LOG.replace(ENDE, `${ENDE}${zeile}\n`), true],
  ['nach Zusammenfassung', (zeile) => `${LOG}${zeile}\n`, true],
  ['nach Abschluss-DEBUG', (zeile) => LOG + kopf('skip deploying full build logs: not enabled in config', 'DEBUG') + `${zeile}\n`, true],
]) {
  test(`Build-Auswertung: leere Zeile ${name} erlaubt; reiner Leer- und Steuerraum wird beanstandet`, optionen, () => {
    positiv(vorbereiten(protokoll('')));
    if (name === 'Gradle-Folgezeile') positiv(vorbereiten(protokoll('\x1b[31m\x1b[0m')));
    for (const [roh, sichtbar] of leerraumZeilen) {
      const fall = vorbereiten(protokoll(roh));
      const ergebnis = negativ(fall, /Protokoll, Zeile ohne Kopf/);
      const meldungen = bericht(fall).beanstandungen;
      assert.equal(meldungen.length, nachEnde ? 2 : 1, JSON.stringify(roh));
      assert.ok(meldungen[0].includes(sichtbar), meldungen[0]);
      assert.ok(ergebnis.text.includes(sichtbar), ergebnis.text);
      assert.equal(meldungen.some((text) => text.startsWith('Nach dem Ende')), nachEnde);
    }
  });
}

test('Build-Auswertung: leere DEBUG-Folgezeile vor Quelle erlaubt; Leerraum hebt NoSuchPath-Ausnahme auf', optionen, () => {
  const protokoll = (zeile) => mitNopath.replace(QUELLE, kopf('Details', 'DEBUG') + `${zeile}\n` + QUELLE);
  positiv(vorbereiten(protokoll('')));
  for (const [roh, sichtbar] of leerraumZeilen) {
    const fall = vorbereiten(protokoll(roh));
    const ergebnis = negativ(fall, /Protokoll, WARNING: NoSuchPathError/);
    const meldungen = bericht(fall).beanstandungen;
    assert.equal(meldungen.length, 2);
    assert.ok(meldungen.some((text) => text.startsWith('Protokoll, Zeile ohne Kopf:') && text.includes(sichtbar)));
    assert.ok(ergebnis.text.includes(sichtbar), ergebnis.text);
  }
});

test('Build-Auswertung: Lauf 3 mit scandelete und Gegenprobe ohne Kennzeichnung', optionen, () => {
  const richtig = positiv(versuch(echt[2]));
  assert.equal(bericht(richtig).bekannte_meldungen.anzahl, 9);
  const fall = versuch(echt[2], false);
  negativ(fall, /11 Dateien entfernt.*nicht als scandelete-Versuch/);
  assert.equal(bericht(fall).entfernte_dateien.anzahl, 11);
  assert.equal(bericht(fall).beanstandungen.length, 1);
  assert.deepEqual(bericht(fall).bekannte_meldungen, bericht(richtig).bekannte_meldungen);
});

for (const [name, aendern] of [
  ['Entfernung vor dem Scanner', (text) => text.replace(SCANNER, kopf('Removing binary at node_modules/test/datei') + SCANNER)],
  ['Entfernung außerhalb node_modules', (text) => text.replace(SCANNER, SCANNER + kopf('Removing binary at src/datei'))],
  ['Entfernung mit Elternpfad', (text) => text.replace(SCANNER, SCANNER + kopf('Removing binary at node_modules/../datei'))],
  ['unbekannte Entfernung', (text) => text.replace(SCANNER, SCANNER + kopf('Removing unknown type at node_modules/test/datei'))],
]) {
  test(`Build-Auswertung: Scanner-Entfernung eng erfasst und Gegenprobe ${name}`, optionen, () => {
    positiv(versuch(LOG.replace(SCANNER, SCANNER + kopf('Removing binary at node_modules/test/datei'))));
    negativ(versuch(aendern(LOG)), /Scanner-Entfernung/);
  });
}

const farbigeAusgabe = BEGINN + kopf('> /opt/gradlew.py assembleRelease', 'DEBUG') + '\u001b[32m> Task :app:assembleRelease\u001b[39m\n' + SCANNER + ERFOLG + APP_ERFOLG + ENDE + ZUSAMMEN;
paar('bekannte Ausgabe mit SGR-Farbcodes und Gegenprobe unbekannter Steuerbefehl', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), farbigeAusgabe.replace('\u001b[32m', '\u001b[2J')), /Zeile ohne Kopf/, farbigeAusgabe);
paar('Farbcode verdeckt keine Warnung', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), farbigeAusgabe.replace('> Task :app:assembleRelease', 'WARNING: weitere Warnung')), /Zeile ohne Kopf:.*WARNING: weitere Warnung/, farbigeAusgabe);
paar('bekannte Capacitor-Ausgabe eng gefasst und Gegenprobe geänderter Dateiname', ({ lauf }) => writeFileSync(join(lauf, 'build.log'), echt[2].replace('Creating capacitor.config.json', 'Creating capacitorXconfigYjson')), /Zeile ohne Kopf:.*capacitorXconfigYjson/);
