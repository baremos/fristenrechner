// Aufruf: node --test scripts/fdroid-auswertung.test.mjs
// Prüft scripts/fdroid/scanner-auswerten.py mit nachgestellten Ausgaben des
// Scanners von F-Droid. Braucht Python 3. Fehlt es, entfallen die Tests.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const skript = join(hier, 'fdroid', 'scanner-auswerten.py');
const APPID = 'de.beispiel.probe';

const python = ['python3', 'python'].find((name) => {
  const lauf = spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)']);
  return lauf.status === 0;
});

const arbeit = mkdtempSync(join(tmpdir(), 'fdroid-auswertung-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

function werteAus({ json, protokoll, rueckgabe = '0', versionName = '1.0', versionCode = '1' }) {
  const lauf = mkdtempSync(join(arbeit, 'lauf-'));
  if (json !== undefined) writeFileSync(join(lauf, 'scanner.json'), json);
  if (protokoll !== undefined) writeFileSync(join(lauf, 'scanner.log'), protokoll);
  const ergebnis = spawnSync(python, [skript, lauf, APPID, versionName, versionCode, rueckgabe], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  return { code: ergebnis.status, text: ergebnis.stdout + ergebnis.stderr };
}

const BEGINN = '2026-09-28 16:00:00,000 INFO: ...scanning version 1.0\n';
const ENDE = '2026-09-28 16:00:01,000 INFO: Finished\n';
const befund = (inhalt) => JSON.stringify({ [APPID]: { 1: { infos: [], warnings: [], errors: [], ...inhalt } } });
const HINWEISE = befund({ infos: [['Removing gradlew at android/gradlew', 'android/gradlew']] });

const faelle = [
  { name: 'leeres JSON, Prüfung vollständig', json: '{}', protokoll: BEGINN + ENDE, code: 0, muster: /keine Beanstandung/ },
  { name: 'nur Hinweise, Prüfung vollständig', json: HINWEISE, protokoll: BEGINN + ENDE, code: 0, muster: /Hinweis: Removing gradlew/ },
  {
    name: 'Fehler im JSON, dieselbe Meldung im Protokoll zählt einmal',
    json: befund({ errors: [['Java JAR file', 'a/b.jar']] }),
    protokoll: `${BEGINN}2026-09-28 16:00:00,500 ERROR: Found Java JAR file at a/b.jar\n2026-09-28 16:00:00,600 WARNING: Scanner found 1 problems in x:1:\n${ENDE}`,
    code: 1,
    muster: /Fehler: Java JAR file \(a\/b\.jar\)\r?\nERGEBNIS: 1 Beanstandungen/,
  },
  { name: 'Warnung im JSON', json: befund({ warnings: [['etwas', 'a/b']] }), protokoll: BEGINN + ENDE, code: 1, muster: /Warnung: etwas/ },
  {
    name: 'abgefangener Abbruch steht nur im Protokoll',
    json: HINWEISE,
    protokoll: `${BEGINN}2026-09-28 16:00:00,500 WARNING: VCS error while scanning app x: Git checkout failed\n${ENDE}`,
    code: 1,
    muster: /Protokoll: VCS error while scanning app/,
  },
  {
    name: 'unbekannter Fehler mit Traceback',
    json: '{}',
    protokoll: `${BEGINN}2026-09-28 16:00:00,500 WARNING: Could not scan app x due to unknown error: Traceback (most recent call last):\n  File "x.py", line 1\n${ENDE}`,
    code: 1,
    muster: /Could not scan app/,
  },
  {
    name: 'Fehler nur im Protokoll',
    json: '{}',
    protokoll: `${BEGINN}2026-09-28 16:00:00,500 ERROR: Found Java JAR file at a/b.jar\n${ENDE}`,
    code: 1,
    muster: /Protokoll: Found Java JAR file/,
  },
  { name: 'Beginn der Prüfung fehlt', json: '{}', protokoll: ENDE, code: 1, muster: /Beginn der Prüfung/ },
  { name: 'Ende der Prüfung fehlt', json: '{}', protokoll: BEGINN, code: 1, muster: /Ende der Prüfung/ },
  { name: 'anderer Versionsname im Protokoll', json: '{}', protokoll: BEGINN.replace('1.0', '2.0') + ENDE, code: 1, muster: /Beginn der Prüfung/ },
  { name: 'Rückgabewert des Scanners ist nicht 0', json: '{}', protokoll: BEGINN + ENDE, rueckgabe: '1', code: 1, muster: /Rückgabewert 1/ },
  { name: 'JSON ist ungültig', json: '{', protokoll: BEGINN + ENDE, code: 1, muster: /nicht lesbar/ },
  { name: 'JSON fehlt', protokoll: BEGINN + ENDE, code: 1, muster: /nicht lesbar/ },
  { name: 'Protokoll fehlt', json: '{}', code: 1, muster: /Protokoll des Scanners ist nicht lesbar/ },
  { name: 'JSON ist eine Liste', json: '[]', protokoll: BEGINN + ENDE, code: 1, muster: /nicht lesbar/ },
  { name: 'JSON nennt eine andere App', json: JSON.stringify({ 'andere.app': { 1: { infos: [], warnings: [], errors: [] } } }), protokoll: BEGINN + ENDE, code: 1, muster: /nicht lesbar/ },
  { name: 'JSON nennt eine andere Version', json: JSON.stringify({ [APPID]: { 2: { infos: [], warnings: [], errors: [] } } }), protokoll: BEGINN + ENDE, code: 1, muster: /andere Version: 2/ },
];

for (const fall of faelle) {
  test(`Auswertung des Scanners: ${fall.name}`, { skip: python ? false : 'Python 3 fehlt' }, () => {
    const { code, text } = werteAus(fall);
    assert.equal(code, fall.code, text);
    assert.match(text, fall.muster);
    assert.match(text, fall.code === 0 ? /ERGEBNIS: keine Beanstandung\s*$/ : /ERGEBNIS: \d+ Beanstandungen\s*$/);
  });
}

test('Auswertung des Scanners: falsche Zahl von Angaben', { skip: python ? false : 'Python 3 fehlt' }, () => {
  const lauf = spawnSync(python, [skript, arbeit], { encoding: 'utf8' });
  assert.equal(lauf.status, 64);
});
