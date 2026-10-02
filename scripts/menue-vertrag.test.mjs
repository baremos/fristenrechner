import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { analysiereSkript, pruefeDist, pruefeMenueQuelle } from './app-pruefungen.mjs';

const quelle = `const menu = registerPlugin('MenueZurueck');
function adapter(p = menu) {
  function senden(aktiv, folge) { return p.setzen({ aktiv, folge }); }
  function registrieren() { return p.addListener('zurueck', empfangen); }
  function abmelden(handle) { return handle.remove(); }
}`;
test('K2 Menü: genau Registrierung, setzen, zurueck und remove', () => {
  const a = analysiereSkript(quelle, 'module');
  assert.deepEqual(a.fehler, []);
  assert.deepEqual(a.menue, { registrierung: 1, setzen: 1, addListener: 1, remove: 1 });
  assert.deepEqual(a.dateiausgabe, {});
});
test('K2 Menü: zwei gültige Kopien in getrennten Bündeln werden abgewiesen', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'menue-vertrag-'));
  try {
    for (const datei of ['eins.js', 'zwei.js']) writeFileSync(join(ordner, datei), quelle);
    assert.ok(pruefeDist(ordner).fehler.some(f => /MenueZurueck.setzen: insgesamt/.test(f)));
  } finally { assert.equal(dirname(resolve(ordner)), resolve(tmpdir())); rmSync(ordner, { recursive: true, force: true }); }
});
for (const [titel, vorher, nachher] of [
  ['Registrierung fehlt', "registerPlugin('MenueZurueck')", 'anderesPlugin'],
  ['Registrierung doppelt', "registerPlugin('MenueZurueck')", "[registerPlugin('MenueZurueck'), registerPlugin('MenueZurueck')]"],
  ['Feld fehlt', '{ aktiv, folge }', '{ aktiv }'],
  ['Feld zusätzlich', '{ aktiv, folge }', '{ aktiv, folge, pfad }'],
  ['Feld doppelt', '{ aktiv, folge }', '{ aktiv, folge, folge }'],
  ['Felder ausgebreitet', '{ aktiv, folge }', '{ ...vorgabe }'],
  ['Zweites Argument', '{ aktiv, folge }', '{ aktiv, folge }, true'],
  ['zweite Aufrufstelle', 'return p.setzen({ aktiv, folge });', 'p.setzen({ aktiv, folge }); return p.setzen({ aktiv, folge });'],
  ['fremde Methode', 'p.setzen', 'p.diagnose'],
  ['berechnete Methode', 'p.setzen', 'p[methode]'],
  ['fremdes Ereignis', "p.addListener('zurueck'", "p.addListener('weiter'"],
  ['weiteres Ereignis', "return p.addListener('zurueck', empfangen);", "p.addListener('anders', empfangen); return p.addListener('zurueck', empfangen);"],
  ['Abmelden fehlt', 'handle.remove()', 'handle.vergessen()'],
  ['Abmelden mit Argument', 'handle.remove()', 'handle.remove(true)'],
  ['setzen fehlt', 'return p.setzen({ aktiv, folge });', ''],
  ['Listener fehlt', "return p.addListener('zurueck', empfangen);", ''],
]) test(`K2 Menü Gegenprobe: ${titel}`, () => {
  assert.ok(analysiereSkript(quelle.replace(vorher, nachher), 'module').fehler.some(f => /MenueZurueck/.test(f)));
});

const java = readFileSync(new URL('../app/android/app/src/main/java/de/baremos/fristenrechner/MenueZurueckPlugin.java', import.meta.url), 'utf8');
test('Native Menüquelle besteht', () => assert.deepEqual(pruefeMenueQuelle(java), []));
for (const [titel, vorher, nachher] of [
  ['anfangs aktiv', 'OnBackPressedCallback(false)', 'OnBackPressedCallback(true)'],
  ['zweiter Callback', 'private long folge', 'private OnBackPressedCallback zweiter = new OnBackPressedCallback(false) {}; private long folge'],
  ['Deaktivieren zu spät', 'setEnabled(false);', ''],
  ['Aufbewahrung', 'notifyListeners("zurueck", ereignis, false)', 'notifyListeners("zurueck", ereignis, true)'],
  ['anderes Ereignis', 'notifyListeners("zurueck"', 'notifyListeners("anders"'],
  ['Dokumentwechsel nicht abgeräumt', 'public void onPageStarted', 'public void anders'],
  ['Zerstörung nicht abgeräumt', 'protected void handleOnDestroy', 'protected void anders'],
  ['keine Lebensdauerbindung', 'addCallback(getActivity(), callback)', 'addCallback(callback)'],
  ['gleiche Folge zugelassen', 'neueFolge > folge', 'neueFolge >= folge'],
  ['Felder ungeprüft', 'daten.length() != 2', 'daten.length() < 2'],
  ['Text statt Zahl', 'folgeWert instanceof Number', 'folgeWert instanceof String'],
  ['WebView Navigation', 'call.resolve();', 'webView.goBack(); call.resolve();'],
  ['Pause deaktiviert', 'public void load()', 'public void handleOnPause()'],
  ['fremde Pluginmethode', 'public void setzen', 'public void diagnose'],
]) test(`Native Menüquelle Gegenprobe: ${titel}`, () => {
  const neu = java.replace(vorher, nachher); assert.notEqual(neu, java);
  assert.notEqual(pruefeMenueQuelle(neu).length, 0);
});
