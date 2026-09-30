import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluiereProcNet, evaluiereUnixSockets } from './emulator-auswertung.mjs';

for (const api of [30, 36]) {
  const f = JSON.parse(readFileSync(new URL(`./emulator/fixtures/proc-2026-09-30-api${api}.json`, import.meta.url), 'utf8'));
  test(`Echte /proc-Köpfe vom 30.09., API ${api}: UID-Prüfung und Debug-Gegenprobe`, () => {
    assert.equal(evaluiereProcNet({ uid: f.appUid, tabellen: f.procVorher, gegenprobe: { uid: f.gegenUid, tabellen: f.gegenTabellen } }).status, 'bestanden');
    assert.equal(evaluiereProcNet({ uid: f.gegenUid, tabellen: f.gegenTabellen, gegenprobe: { uid: f.gegenUid, tabellen: f.gegenTabellen } }).status, 'nicht bestanden');
    assert.equal(evaluiereUnixSockets({ text: f.unix, debugSocketNachgewiesen: true }).status, 'nicht bestanden');
    assert.equal(evaluiereUnixSockets({ text: f.unix.split('\n').slice(1).join('\n'), debugSocketNachgewiesen: true }).status, 'ungültig');
  });
}
