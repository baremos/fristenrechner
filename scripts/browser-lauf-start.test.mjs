// Aufruf: node --test scripts/browser-lauf-start.test.mjs
// Der Browserstart wird ersetzt; kein Browser und keine Prozesssuche.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pruefeBrowserstart, starteBrowserProzess, wurzel } from './browser-lauf.mjs';
import { auswerten } from './browser/auswertung.mjs';
import { ungueltigePhase } from './browser/phasenprotokoll.mjs';

test('Browserstart entfernt ausschließlich die Kompatibilitätsvariable in jeder Schreibweise aus der Kindumgebung', () => {
  const env = Object.freeze({ __COMPAT_LAYER: 'Probe', __compat_layer: '', __Compat_Layer: 'Weitere Probe',
    __COMPAT_LAYER_EXTRA: 'bleibt', ANDERE_VARIABLE: 'bleibt ebenfalls' });
  const argumente = ['about:blank'], bericht = {}, child = { pid: 12345 };
  let aufrufe = 0;
  const ergebnis = starteBrowserProzess('browser', argumente, bericht, { env, starten: (programm, args, optionen) => {
    aufrufe++;
    assert.equal(programm, 'browser');
    assert.equal(args, argumente);
    assert.deepEqual(optionen, { cwd: wurzel, env: { __COMPAT_LAYER_EXTRA: 'bleibt', ANDERE_VARIABLE: 'bleibt ebenfalls' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    assert.notEqual(optionen.env, env);
    return child;
  } });
  assert.equal(aufrufe, 1);
  assert.equal(ergebnis, child);
  assert.deepEqual(bericht.start, { programm: 'browser', argumente, prozessId: 12345,
    entfernteUmgebungsvariablen: ['__COMPAT_LAYER', '__compat_layer', '__Compat_Layer'] });
  assert.equal(env.__COMPAT_LAYER, 'Probe');
  assert.equal(env.__compat_layer, '');
  assert.equal(env.__Compat_Layer, 'Weitere Probe');
  assert.doesNotMatch(JSON.stringify(bericht), /Probe|bleibt/);
});

test('Browserstart ohne Kompatibilitätsvariable kopiert die vollständige Umgebung und protokolliert eine leere Liste', () => {
  const env = Object.freeze({ ANDERE_VARIABLE: 'bleibt', LEERE_VARIABLE: '' }), bericht = {};
  starteBrowserProzess('browser', [], bericht, { env, starten: (_programm, _args, optionen) => {
    assert.deepEqual(optionen.env, env);
    assert.notEqual(optionen.env, env);
    return { pid: 12345 };
  } });
  assert.deepEqual(bericht.start.entfernteUmgebungsvariablen, []);
});

test('Code 0 vor dem Browserstart nennt einen möglichen Neustart und die Phase bleibt ungültig', () => {
  for (const beendet of [false, true]) {
    let fehler;
    try { pruefeBrowserstart({ child: { exitCode: 0, signalCode: null }, beendet }); }
    catch (e) { fehler = e; }
    assert.equal(fehler?.message, 'Browserprozess endete vor dem Start mit Code 0; möglicher Neustart des Browsers.');
    const bericht = ungueltigePhase({ phase: 'vertrag', browser: 'edge' }, fehler, 'Phasenmessung');
    assert.equal(bericht.ergebnisse[0].status, 'ungültig');
    assert.equal(auswerten(bericht).code, 2);
  }
});

test('Fehlercode und Signal vor dem Browserstart werden nicht als möglicher Neustart bezeichnet', () => {
  for (const child of [{ exitCode: 1, signalCode: null }, { exitCode: null, signalCode: 'SIGTERM' }]) {
    assert.throws(() => pruefeBrowserstart({ child, beendet: false }), { message: 'Browser vorzeitig beendet.' });
  }
});

test('Startfehler bleiben erhalten; laufender Browser und Abbruch behalten ihren bisherigen Ablauf', () => {
  const child = { exitCode: null, signalCode: null }, startFehler = new Error('Start nicht möglich');
  assert.doesNotThrow(() => pruefeBrowserstart({ child, beendet: false }));
  assert.throws(() => pruefeBrowserstart({ child: { exitCode: 0 }, beendet: true, startFehler }), fehler => fehler === startFehler);
  assert.throws(() => pruefeBrowserstart({ child, beendet: false, signal: { aborted: true } }), { message: 'Browser vorzeitig beendet.' });
});
