import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluiereProcNet, evaluiereUnixSockets, evaluiereTastatur } from './emulator-auswertung.mjs';

for (const api of [30, 36]) {
  const f = JSON.parse(readFileSync(new URL(`./emulator/fixtures/proc-2026-09-30-api${api}.json`, import.meta.url), 'utf8'));
  test(`Echte /proc-Köpfe vom 30.09., API ${api}: UID-Prüfung und Debug-Gegenprobe`, () => {
    assert.equal(evaluiereProcNet({ uid: f.appUid, tabellen: f.procVorher, gegenprobe: { uid: f.gegenUid, tabellen: f.gegenTabellen } }).status, 'bestanden');
    assert.equal(evaluiereProcNet({ uid: f.gegenUid, tabellen: f.gegenTabellen, gegenprobe: { uid: f.gegenUid, tabellen: f.gegenTabellen } }).status, 'nicht bestanden');
    // Der angenommene user-Build ist eine Gegenprobe zum ursprünglichen Abbild.
    assert.equal(evaluiereUnixSockets({ text: f.unix, debugSocketNachgewiesen: true, buildType: 'user' }).status, 'nicht bestanden');
    assert.equal(evaluiereUnixSockets({ text: f.unix.split('\n').slice(1).join('\n'), debugSocketNachgewiesen: true, buildType: 'user' }).status, 'ungültig');
  });
}

test('Tastatur API 30, vierte Serie: IME-Eingabeempfänger ersetzt fehlenden mCurrentFocus', () => {
  const f = JSON.parse(readFileSync(new URL('./emulator/fixtures/tastatur-api30-r4.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(f.fenster, /mCurrentFocus/);
  const b = evaluiereTastatur(f);
  assert.equal(b.status, 'bestanden', b.grund);
  assert.equal(b.details.fokusquelle, 'IME-Eingabeempfänger');
  assert.deepEqual(b.details.flaechen, [{ breite: 1080, hoehe: 901, sichtbar: true }]);
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster + '\n  mCurrentFocus=Window{123 u0 InputMethod}' }).status, 'bestanden');
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replaceAll('de.baremos.fristenrechner', 'andere.app') }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replace(/mInputMethodInputTarget[^\n]*/, 'mInputMethodInputTarget in display# 0 null') + '\n  mCurrentFocus=Window{123 u0 de.baremos.fristenrechner/.MainActivity}' }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replace('mVisible=true} }', 'mVisible=false} }') }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, nachher: { aktivesElement: { tag: 'input', name: 'anderesFeld' } } }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, inputMethod: f.inputMethod.replace('mIsInputViewShown=true', 'mIsInputViewShown=false') }).status, 'ungültig');
});

test('Tastatur API 36, fünfte Serie: imeInputTarget nennt den Eingabeempfänger, die Fläche kommt aus dem IME-Fenster', () => {
  const f = JSON.parse(readFileSync(new URL('./emulator/fixtures/tastatur-api36-r5.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(f.fenster, /mCurrentFocus|mInputMethodInputTarget/);
  const b = evaluiereTastatur(f);
  assert.equal(b.status, 'bestanden', b.grund);
  assert.equal(b.details.fokusquelle, 'IME-Eingabeempfänger');
  assert.deepEqual(b.details.flaechen, [{ breite: 1080, hoehe: 2272, sichtbar: true }]);
  // Gegenproben: fremde App als Eingabeempfänger, kein Empfänger, IME-Fenster nicht sichtbar, anderes Feld, Tastaturansicht verborgen.
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replaceAll('de.baremos.fristenrechner', 'andere.app') }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replace(/\s*imeInputTarget[^\n]*/, '') }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, fenster: f.fenster.replace('isVisible=true', 'isVisible=false') }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, nachher: { aktivesElement: { tag: 'input', name: 'anderesFeld' } } }).status, 'ungültig');
  assert.equal(evaluiereTastatur({ ...f, inputMethod: f.inputMethod.replace('mIsInputViewShown=true', 'mIsInputViewShown=false') }).status, 'ungültig');
});
