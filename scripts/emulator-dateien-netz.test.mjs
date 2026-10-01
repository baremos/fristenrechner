// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { evalDateienNetz, mitDateienNetz } from './emulator/dateien-netz.mjs';

const header = 'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode';
const tabellen = () => Object.fromEntries(['tcp', 'tcp6', 'udp', 'udp6'].map(k => [k, header]));
const gegen = () => ({ ...tabellen(), tcp: header + '\n0: 1002000A:93EC 0202000A:E5D5 01 00000000:00000000 00:00000000 00000000 10150 0 17117' });
const stats = bytes => `  mAppUidStatsMap:\nuid rxBytes rxPackets txBytes txPackets\n10150 1 1 1 1\n10151 ${bytes} 0 0 0\n  mOther:\n`;
function messung(api = 36) { return { schema: 1, api, variante: 'debug', paket: 'de.baremos.fristenrechner', uid: 10151, gegenUid: 10150, annahmen: 0, start: 1000, ende: 4000, abgeschlossen: true,
  vorher: { annahmen: 1, tabellen: gegen() }, nachher: { annahmen: 1 }, fehler: [], proben: [{ zeit: 1000, tabellen: tabellen() }, { zeit: 4000, tabellen: tabellen() }], netstatsVorher: stats(0), netstatsNachher: stats(0) }; }
test('D12 bewertet das gesamte Fenster und unterscheidet API30-Zählergrenze', () => {
  assert.equal(evalDateienNetz(messung()).status, 'bestanden');
  assert.equal(evalDateienNetz(messung(30)).status, 'dokumentierte Grenze');
});
for (const [name, aendern] of [
  ['fehlende Probe', m => { m.proben = []; }], ['fehlender Beginn', m => { m.start = 999; }],
  ['kaputte Probe', m => { m.proben[0] = null; }],
  ['fehlendes Ende', m => { m.ende++; }], ['lange Lücke', m => { m.ende = m.proben[1].zeit = 20000; }],
  ['Messabbruch', m => { m.abgeschlossen = false; }], ['fehlerhafte Probe', m => { m.fehler.push('ADB fehlgeschlagen'); }],
  ['keine Gegenprobe', m => { m.vorher.annahmen = 0; }], ['unlesbare Tabelle', m => { m.proben[1].tabellen.udp = ''; }],
  ['keine UID-Zähler', m => { m.netstatsNachher = ''; }], ['gleiche UID', m => { m.uid = m.gegenUid; }],
]) test(`D12 verweigert Bestehen: ${name}`, () => { const m = messung(); aendern(m); assert.equal(evalDateienNetz(m).status, 'ungültig'); });
test('D12 erkennt Verkehr in Zwischenprobe, Netzmelder und UID-Zählern', () => {
  const m = messung(); m.proben[1].tabellen.tcp = gegen().tcp.replace('10150', '10151');
  assert.equal(evalDateienNetz(m).status, 'nicht bestanden');
  const n = messung(); n.annahmen = 1; assert.equal(evalDateienNetz(n).status, 'nicht bestanden');
  const z = messung(); z.netstatsNachher = stats(10); assert.equal(evalDateienNetz(z).status, 'nicht bestanden');
});
test('D12 sichert Rohfehler auch vor der ersten Dateibewegung', async () => {
  const saved = [], befunde = []; let ausgefuehrt = false;
  const ctx = { api: 30, app: 'de.baremos.fristenrechner', gegen: 'de.baremos.fristenrechner.gegenprobe', shell: async () => 'unlesbar', save: (...a) => saved.push(a), befund: (...a) => befunde.push(a) };
  await assert.rejects(mitDateienNetz(ctx, 'debug', async () => { ausgefuehrt = true; }), /UID fehlt/);
  assert.equal(ausgefuehrt, false); assert.equal(saved[0][0], 'dateien-netz-debug.json');
  assert.equal(befunde[0][1].status, 'ungültig');
});
