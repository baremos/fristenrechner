// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Cdp } from './emulator/rahmen.mjs';

function websocket() {
  const events = new Map(), gesendet = [];
  let geschlossen = 0;
  return {
    addEventListener: (name, fn) => events.set(name, fn),
    send: data => gesendet.push(JSON.parse(data)),
    close: () => { geschlossen++; events.get('close')?.(); },
    antwort: data => events.get('message')({ data: JSON.stringify(data) }),
    ende: () => events.get('close')(),
    gesendet, geschlossen: () => geschlossen,
  };
}

test('CDP-Timeout verwirft die alte Seite und lehnt weitere Befehle sofort ab', async () => {
  const ws = websocket(), c = new Cdp(ws);
  await assert.rejects(c.send('Runtime.evaluate', {}, 5), /CDP-Zeitüberschreitung: Runtime.evaluate/);
  assert.equal(c.closed, true);
  assert.equal(ws.geschlossen(), 1);
  assert.equal(c.pending.size, 0);
  await assert.rejects(c.send('Accessibility.enable'), /CDP-Verbindung geschlossen/);
  assert.equal(ws.gesendet.length, 1);
});

test('CDP entfernt offene Befehle beim Schließen und bei Inspector.detached', async () => {
  for (const art of ['close', 'Inspector.detached']) {
    const ws = websocket(), c = new Cdp(ws);
    const erwartet = assert.rejects(c.send('Runtime.evaluate'), /CDP-Verbindung geschlossen/);
    if (art === 'close') ws.ende(); else ws.antwort({ method: art, params: { reason: 'target_closed' } });
    await erwartet;
    assert.equal(c.closed, true);
    assert.equal(c.pending.size, 0);
  }
});

test('CDP-Protokollfehler einer nicht verfügbaren Methode schließen die Sitzung nicht', async () => {
  const ws = websocket(), c = new Cdp(ws);
  const erwartet = assert.rejects(c.send('Accessibility.enable'), /CDP -32601: method not found/);
  ws.antwort({ id: 1, error: { code: -32601, message: 'method not found' } });
  await erwartet;
  assert.equal(c.closed, false);
  c.close();
});

test('CDP übergibt erfolgreiche Antworten und speichert Ereignisse', async () => {
  const ws = websocket(), c = new Cdp(ws);
  const wert = c.evaluate('1');
  ws.antwort({ method: 'Runtime.executionContextCreated', params: { context: { id: 2 } } });
  ws.antwort({ id: 1, result: { result: { type: 'number', value: 1 } } });
  assert.equal(await wert, 1);
  assert.equal(c.events[0].method, 'Runtime.executionContextCreated');
  c.close();
});
