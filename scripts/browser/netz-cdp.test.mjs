import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserCdp, seitenNetzStarten } from './netz-cdp.mjs';
import { browserOberflaecheBeleg } from './browser-oberflaeche.mjs';
import { auswerten } from './auswertung.mjs';

function kanal() {
  const ws = new EventTarget();
  ws.senden = [];
  ws.send = text => ws.senden.push(JSON.parse(text));
  ws.close = () => {};
  ws.empfangen = m => ws.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(m) }));
  return ws;
}
function mock({ fehler } = {}) {
  const ws = kanal(), aufrufe = [];
  const cdp = { ws, send: async (method, params, timeout, sessionId) => {
    aufrufe.push({ method, params, sessionId, timeout });
    if (fehler === method) throw new Error('nachgestellter Fehler');
    if (method === 'Target.setAutoAttach' && !sessionId) ws.empfangen({ method: 'Target.attachedToTarget',
      params: { sessionId: 'seite', targetInfo: { targetId: 'pruefseite', type: 'page', url: 'about:blank' } } });
    return {};
  } };
  return { cdp, aufrufe, protokoll: { netzanfragen: [] } };
}

test('Flacher CDP-Transport erhält sessionId, Antwort und gemeinsame Befehlskennungen', async () => {
  const ws = kanal(), cdp = new BrowserCdp(ws);
  const eins = cdp.send('Network.enable', {}, 1000, 'worker');
  const zwei = cdp.send('Browser.getVersion', {}, 1000);
  assert.deepEqual(ws.senden[0], { id: 1, method: 'Network.enable', params: {}, sessionId: 'worker' });
  assert.equal(ws.senden[1].id, 2);
  ws.empfangen({ id: 2, result: { product: 'Probe' } });
  ws.empfangen({ id: 1, sessionId: 'worker', result: { fertig: true } });
  assert.deepEqual(await eins, { fertig: true });
  assert.deepEqual(await zwei, { product: 'Probe' });
  cdp.close();
});

test('BrowserCdp.close nach Browser.close-Antwort ruft den WebSocket-close auf und löst offene Target-Befehle', async () => {
  const ws = kanal(), cdp = new BrowserCdp(ws);
  let geschlossen = 0;
  ws.close = () => { geschlossen++; ws.dispatchEvent(new Event('close')); };
  const offen = cdp.send('Network.enable', {}, 1000, 'leer');
  const verworfen = assert.rejects(offen, /Verbindung geschlossen/);
  const ende = cdp.send('Browser.close');
  ws.empfangen({ id: 2, result: {} }); await ende;
  assert.equal(cdp.closed, false); assert.equal(geschlossen, 0);
  cdp.close(); await verworfen;
  assert.equal(geschlossen, 1); assert.equal(cdp.closed, true); assert.equal(cdp.pending.size, 0);
});

test('Ende eines Workers schließt nicht die Browserverbindung oder andere Sitzungen', async () => {
  const ws = kanal(), cdp = new BrowserCdp(ws);
  const worker = cdp.send('Network.enable', {}, 1000, 'worker');
  const erwartet = assert.rejects(worker, /Target wurde/);
  const seite = cdp.send('Network.enable', {}, 1000, 'seite');
  ws.empfangen({ method: 'Inspector.detached', sessionId: 'worker', params: { reason: 'target_closed' } });
  assert.equal(cdp.closed, false);
  ws.empfangen({ id: 2, sessionId: 'seite', result: {} });
  await erwartet; await seite;
  cdp.close();
});

test('Seite, OOPIF und verschachtelte Worker sind vor Freigabe abgesichert', async () => {
  const { cdp, aufrufe, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  for (const type of ['iframe', 'worker', 'shared_worker', 'service_worker']) {
    cdp.ws.empfangen({ method: 'Target.attachedToTarget', sessionId: 'seite', params: {
      sessionId: type, targetInfo: { targetId: `target-${type}`, type, url: 'blob:http://127.0.0.1/a' } } });
  }
  await monitor.bereit();
  for (const sessionId of ['seite', 'iframe', 'worker', 'shared_worker', 'service_worker']) {
    assert.deepEqual(aufrufe.filter(a => a.sessionId === sessionId).map(a => a.method),
      ['Network.enable', ...(sessionId === 'seite' ? ['Page.enable'] : []), 'Fetch.enable', 'Target.setAutoAttach', 'Runtime.runIfWaitingForDebugger']);
    cdp.ws.empfangen({ method: 'Network.requestWillBeSent', sessionId, params: {
      request: { url: 'https://extern.invalid/datei', method: 'GET' }, frameId: 'frame', requestId: sessionId } });
    cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId, params: {
      request: { url: 'https://extern.invalid/datei', method: 'GET' }, requestId: sessionId } });
  }
  await monitor.bereit();
  assert.equal(protokoll.netzanfragen.filter(a => a.gesperrt).length, 5);
  assert.equal(aufrufe.filter(a => a.method === 'Fetch.failRequest').length, 5);
  assert.equal(protokoll.netzanfragen.find(a => a.sessionId === 'worker').targetTyp, 'worker');
  assert.equal(protokoll.netzTargets.find(a => a.type === 'iframe').elternSitzung, 'seite');
  monitor.close();
});

test('Lokale Anfragen sowie Daten und Blobs werden freigegeben, fremde WebSockets erfasst', async () => {
  const { cdp, aufrufe, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  for (const url of ['http://127.0.0.1/datei', 'data:text/plain,probe', 'blob:http://127.0.0.1/id']) {
    cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'seite', params: { request: { url }, requestId: url } });
  }
  cdp.ws.empfangen({ method: 'Network.webSocketCreated', sessionId: 'seite', params: { url: 'wss://extern.invalid/' } });
  cdp.ws.empfangen({ method: 'Network.webTransportCreated', sessionId: 'seite', params: { url: 'https://extern.invalid/' } });
  await monitor.bereit();
  assert.equal(aufrufe.filter(a => a.method === 'Fetch.continueRequest').length, 3);
  assert.equal(protokoll.netzanfragen.length, 2);
  monitor.close();
});

test('Fehlende Hauptseite und gescheiterte Netzaktivierung sind ungültiger Nachweis', async () => {
  const eins = mock();
  await assert.rejects(seitenNetzStarten(eins.cdp, eins.protokoll, 'andere-seite'), /nicht vor Navigation/);
  const zwei = mock({ fehler: 'Fetch.enable' });
  await assert.rejects(seitenNetzStarten(zwei.cdp, zwei.protokoll, 'pruefseite'), /unvollständig/);
  assert.ok(!zwei.aufrufe.some(a => a.method === 'Runtime.runIfWaitingForDebugger'));
});

test('Befehls-Timeout auf Edge-Leerseite erhält Browser.close und andere Sitzungen; späte Antwort wird ignoriert', async () => {
  const ws = kanal(), cdp = new BrowserCdp(ws);
  await assert.rejects(cdp.send('Network.enable', {}, 5, 'leer'), /Zeitüberschreitung/);
  assert.equal(cdp.closed, false);
  ws.empfangen({ id: 1, result: {} });
  const ende = cdp.send('Browser.close', {}, 1000);
  ws.empfangen({ id: 2, result: {} });
  await ende;
  assert.equal(cdp.pending.size, 0);
  cdp.close();
});

const anhaengen = (cdp, info, eltern) => cdp.ws.empfangen({ method: 'Target.attachedToTarget', sessionId: eltern,
  params: { sessionId: 'leer', waitingForDebugger: true, targetInfo: { targetId: 'browser-leer', type: 'page', url: '', ...info } } });

for (const url of ['', 'about:blank']) test(`Browser-Leerseite ${JSON.stringify(url)} wird sofort freigegeben und mit begrenzter Netzprobe belegt`, async () => {
  const { cdp, protokoll, aufrufe } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  const send = cdp.send;
  cdp.send = (...args) => args[0] === 'Network.enable' && args[3] === 'leer'
    ? (aufrufe.push({ method: args[0], sessionId: args[3], timeout: args[2] }), Promise.reject(new Error('CDP-Zeitüberschreitung: Network.enable')))
    : send(...args);
  anhaengen(cdp, { url, attached: true, browserContextId: 'kontext' });
  await monitor.bereit();
  const t = protokoll.netzTargets.find(t => t.sessionId === 'leer');
  assert.equal(t.browserLeerseite, true);
  assert.equal(t.seite, false);
  assert.equal(t.leerseitenBeleg.einordnung, 'Browser-Leerseite');
  assert.equal(t.leerseitenBeleg.netzereignisse, 0);
  assert.equal(t.leerseitenBeleg.vomLaeuferGeoeffnet, false);
  assert.equal(t.leerseitenBeleg.freigabe.status, 'bestätigt');
  cdp.ws.empfangen({ id: 999, sessionId: 'leer', result: {} });
  await monitor.bereit();
  assert.equal(t.leerseitenBeleg.netzereignisse, 0, 'CDP-Antworten sind keine Netzereignisse');
  assert.match(t.leerseitenBeleg.befehle[0].meldung, /Zeitüberschreitung/);
  const befehle = aufrufe.filter(a => a.sessionId === 'leer');
  assert.equal(befehle[0].method, 'Runtime.runIfWaitingForDebugger');
  assert.ok(befehle.every(a => a.timeout === 1000));
  assert.equal(aufrufe[0].method, 'Target.setDiscoverTargets');
  assert.equal(aufrufe.find(a => a.method === 'Target.setAutoAttach').params.waitForDebuggerOnStart, true);
  monitor.close();
});

for (const waitingForDebugger of [true, false]) test(`Gescheiterte Freigabe bei waitingForDebugger=${waitingForDebugger} wird nach dem Wartezustand bewertet`, async () => {
  const { cdp, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  const send = cdp.send;
  cdp.send = (...args) => args[0] === 'Runtime.runIfWaitingForDebugger' && args[3] === 'leer'
    ? Promise.reject(new Error('Freigabe fehlgeschlagen')) : send(...args);
  cdp.ws.empfangen({ method: 'Target.attachedToTarget', params: { sessionId: 'leer', waitingForDebugger,
    targetInfo: { targetId: 'browser-leer', type: 'page', url: '' } } });
  if (waitingForDebugger) await assert.rejects(monitor.bereit(), /Freigabe fehlgeschlagen/);
  else await monitor.bereit();
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').leerseitenBeleg.freigabe.status, 'nicht bestätigt');
  monitor.close();
});

for (const methode of ['Target.targetInfoChanged', 'Page.frameNavigated']) test(`Browser-Leerseite navigiert extern über ${methode}: Einordnung dauerhaft verworfen`, async () => {
  const { cdp, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  anhaengen(cdp, {}); await monitor.bereit();
  const params = methode === 'Target.targetInfoChanged'
    ? { targetInfo: { targetId: 'browser-leer', type: 'page', url: 'https://extern.invalid/' } }
    : { frame: { id: 'rahmen', url: 'https://extern.invalid/' } };
  cdp.ws.empfangen({ method: methode, sessionId: 'leer', params });
  await assert.rejects(monitor.bereit(), /Leerseite navigiert.*https:\/\/extern/);
  cdp.ws.empfangen({ method: 'Target.targetInfoChanged', params: {
    targetInfo: { targetId: 'browser-leer', type: 'page', url: 'about:blank' } } });
  await assert.rejects(monitor.bereit(), /ohne belegte Seitenzuordnung/);
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').browserLeerseite, false);
  monitor.close();
});

for (const methode of ['Network.requestWillBeSent', 'Network.webSocketCreated', 'Network.webTransportCreated', 'Network.loadingFinished', 'Fetch.requestPaused']) {
  test(`Auch eine weiterhin leere Seite mit ${methode} verliert die Ausnahme`, async () => {
    const { cdp, protokoll } = mock();
    const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
    anhaengen(cdp, {}); await monitor.bereit();
    cdp.ws.empfangen({ method: methode, sessionId: 'leer', params: {
      url: 'http://127.0.0.1:1234/', request: { url: 'http://127.0.0.1:1234/', method: 'GET' }, requestId: 'netz' } });
    await assert.rejects(monitor.bereit(), /Leerseite mit Netzereignis/);
    assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').leerseitenBeleg.netzereignisse, 1);
    monitor.close();
  });
}

test('Vor dem Attach beobachtete Navigation verhindert nachträgliche Leerseiten-Ausnahme', async () => {
  const { cdp, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  cdp.ws.empfangen({ method: 'Target.targetCreated', params: {
    targetInfo: { targetId: 'browser-leer', type: 'page', url: 'https://extern.invalid/' } } });
  anhaengen(cdp, {});
  await assert.rejects(monitor.bereit(), /ohne belegte Seitenzuordnung/);
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').browserLeerseite, false);
  monitor.close();
});

for (const info of [{ url: 'http://127.0.0.1:1234/' }, { url: 'https://extern.invalid/' },
  { url: 'about:blank#fragment' }, { url: undefined }, { type: 'worker' }, { openerId: 'unbekannt' }]) {
  test(`Keine pauschale Ausnahme für unbekanntes Target ${JSON.stringify(info)}`, async () => {
    const { cdp, protokoll } = mock();
    const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
    anhaengen(cdp, info); await assert.rejects(monitor.bereit(), /ohne belegte Seitenzuordnung/);
    assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').browserLeerseite, false);
    monitor.close();
  });
}

test('Leeres Popup der Prüfseite bleibt streng überwachte Seite', async () => {
  const { cdp, protokoll, aufrufe } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  anhaengen(cdp, { openerId: 'pruefseite' }); await monitor.bereit();
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').seite, true);
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').browserLeerseite, false);
  assert.equal(aufrufe.find(a => a.sessionId === 'leer').method, 'Network.enable');
  monitor.close();
});

test('Neue Überwachungs- und Sperrfehler gehen nicht als Hintergrundverkehr verloren', async () => {
  const { cdp, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  const send = cdp.send;
  cdp.send = (...args) => args[0] === 'Fetch.failRequest' ? Promise.reject(new Error('Sperre fehlgeschlagen')) : send(...args);
  cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'seite', params: { request: { url: 'https://extern.invalid' }, requestId: '1' } });
  await assert.rejects(monitor.bereit(), /Sperre fehlgeschlagen/);
  monitor.close();
});

test('Unabhängiges Browser-Web-Target bleibt ungeklärt statt still zur Prüfseite zu gehören', async () => {
  const { cdp, protokoll } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite', 'http://127.0.0.1:1234');
  cdp.ws.empfangen({ method: 'Target.attachedToTarget', params: { sessionId: 'fremd',
    targetInfo: { targetId: 'hintergrund', type: 'service_worker', url: 'https://browser.invalid/sw.js' } } });
  await assert.rejects(monitor.bereit(), /ohne belegte Seitenzuordnung/);
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'fremd').seite, false);
  monitor.close();
});

test('Browser-Erweiterungsworker wird getrennt protokolliert und weiter am Netz gesperrt', async () => {
  const { cdp, protokoll, aufrufe } = mock();
  const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite', 'http://127.0.0.1:1234');
  cdp.ws.empfangen({ method: 'Target.attachedToTarget', params: { sessionId: 'extension',
    targetInfo: { targetId: 'hintergrund', type: 'service_worker', url: 'chrome-extension://extension/sw.js' } } });
  await monitor.bereit();
  cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'extension', params: {
    request: { url: 'https://browser.invalid/update', method: 'GET' }, requestId: 'bg' } });
  await monitor.bereit();
  assert.equal(protokoll.netzanfragen.length, 0);
  assert.equal(protokoll.browserTargetAnfragen[0].gesperrt, true);
  assert.ok(aufrufe.some(a => a.method === 'Fetch.failRequest' && a.sessionId === 'extension'));
  monitor.close();
});

for (const schema of ['edge:', 'chrome:', 'devtools:', 'chrome-untrusted:']) {
  test(`${schema} belegt Browser-Oberfläche ohne Parameter und Fragment`, async () => {
    const url = `${schema}//downloads-hub/?privat=probe#fragment`;
    assert.deepEqual(browserOberflaecheBeleg(url), { einordnung: 'Browser-Oberfläche', schema, url: `${schema}//downloads-hub/` });
    const { cdp, protokoll, aufrufe } = mock();
    const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
    anhaengen(cdp, { url }); await monitor.bereit();
    const t = protokoll.netzTargets.find(t => t.sessionId === 'leer');
    assert.equal(t.seite, false); assert.equal(t.hintergrund, true); assert.equal(t.browserOberflaeche, true);
    assert.deepEqual(t.browserOberflaechenBeleg, browserOberflaecheBeleg(url));
    assert.doesNotMatch(JSON.stringify(t), /privat|fragment/);
    cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'leer', params: { requestId: 'intern', request: { url } } });
    cdp.ws.empfangen({ method: 'Network.requestWillBeSent', sessionId: 'leer', params: {
      requestId: 'intern', type: 'Document', request: { url } } });
    await monitor.bereit();
    assert.equal(aufrufe.find(a => a.params.requestId === 'intern').method, 'Fetch.continueRequest');
    assert.equal(protokoll.netzanfragen.length, 0);
    assert.equal(protokoll.browserTargetAnfragen[0].url, `${schema}//downloads-hub/`);
    monitor.close();
  });
}
for (const url of ['https://edge.example/', 'blob:edge://downloads-hub/id', 'data:text/html,edge://downloads-hub/',
  'chrome-extension://id/page', 'about:blank', undefined]) test(`Kein Browser-Oberflächenbeleg für ${url}`, () => {
  assert.equal(browserOberflaecheBeleg(url), null);
});

const navigiereTarget = (cdp, methode, url) => cdp.ws.empfangen({ method: methode, sessionId: 'leer', params:
  methode === 'Page.frameNavigated' ? { frame: { id: 'haupt', url } }
    : { targetInfo: { targetId: 'browser-leer', type: 'page', url } } });

for (const methode of ['Target.targetInfoChanged', 'Page.frameNavigated']) {
  test(`Edge-Downloadseite im zuvor leeren Target über ${methode} wird Browser-Oberfläche`, async () => {
    const { cdp, protokoll, aufrufe } = mock();
    const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
    anhaengen(cdp, {}); await monitor.bereit();
    navigiereTarget(cdp, methode, 'edge://downloads-hub/?privat=probe#fragment');
    for (const method of ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.dataReceived',
      'Network.loadingFinished', 'Network.resourceChangedPriority']) cdp.ws.empfangen({ method, sessionId: 'leer', params: {
      request: { url: 'edge://downloads-hub/' }, requestId: 'intern' } });
    cdp.ws.empfangen({ method: 'Network.requestWillBeSent', sessionId: 'leer', params: {
      requestId: 'extern', request: { url: 'https://browser.invalid/update', method: 'GET' } } });
    cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'leer', params: {
      requestId: 'fetch-extern', request: { url: 'https://browser.invalid/update', method: 'GET' } } });
    cdp.ws.empfangen({ method: 'Network.loadingFailed', sessionId: 'leer', params: {
      requestId: 'extern', errorText: 'net::ERR_BLOCKED_BY_CLIENT', blockedReason: 'inspector' } });
    await monitor.bereit();
    const t = protokoll.netzTargets.find(t => t.sessionId === 'leer');
    assert.equal(t.browserOberflaeche, true); assert.equal(t.browserLeerseite, false);
    assert.equal(t.browserOberflaechenBeleg.schema, 'edge:');
    assert.equal(t.leerseitenBeleg.verworfen, undefined);
    assert.doesNotMatch(JSON.stringify(t), /privat|fragment/);
    assert.equal(protokoll.netzanfragen.length, 0);
    assert.equal(protokoll.browserTargetAnfragen.filter(a => a.gesperrt).length, 2);
    assert.ok(aufrufe.some(a => a.method === 'Fetch.failRequest' && a.params.requestId === 'fetch-extern'));
    protokoll.ergebnisse = [{ id: 'PROBE', status: 'bestanden' }];
    assert.equal(auswerten(protokoll).code, 0, 'Blockierte Oberflächenversuche sind kein Seitenfehler');
    monitor.close();
  });
  for (const url of ['http://extern.invalid/', 'https://extern.invalid/', 'file:///C:/probe.html',
    'data:text/html,probe', 'blob:https://extern.invalid/id', 'http://localhost/', 'http://127.1/']) {
    test(`Browser-Oberfläche navigiert über ${methode} zu ${url}: dauerhafter Fehler`, async () => {
      const { cdp, protokoll } = mock();
      const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
      anhaengen(cdp, { url: 'edge://downloads-hub/' }); await monitor.bereit();
      navigiereTarget(cdp, methode, url);
      await assert.rejects(monitor.bereit(), /Browser-Oberfläche navigiert außerhalb 127/);
      navigiereTarget(cdp, methode, 'edge://downloads-hub/');
      await assert.rejects(monitor.bereit(), /Browser-Oberfläche navigiert außerhalb 127/);
      assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').browserOberflaeche, false);
      monitor.close();
    });
  }
}

test('Oberflächen-Subframe-Navigation wird nicht als Haupttarget-Adresse übernommen', async () => {
  const { cdp, protokoll } = mock(); const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  anhaengen(cdp, { url: 'edge://downloads-hub/' }); await monitor.bereit();
  cdp.ws.empfangen({ method: 'Page.frameNavigated', sessionId: 'leer', params: {
    frame: { id: 'kind', parentId: 'haupt', url: 'chrome-untrusted://downloads/' } } });
  await monitor.bereit();
  assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').url, 'edge://downloads-hub/');
  monitor.close();
});

test('Rückkehr über about:blank hebt die externe Navigationsgrenze nicht auf', async () => {
  const { cdp, protokoll } = mock(); const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  anhaengen(cdp, { url: 'edge://downloads-hub/' }); await monitor.bereit();
  navigiereTarget(cdp, 'Target.targetInfoChanged', 'about:blank');
  navigiereTarget(cdp, 'Target.targetInfoChanged', 'https://extern.invalid/');
  await assert.rejects(monitor.bereit(), /Browser-Oberfläche navigiert außerhalb 127/);
  monitor.close();
});

test('Vor Attach beobachtete externe Navigation kann nicht mit internem Schema verdeckt werden', async () => {
  const { cdp, protokoll } = mock(); const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  cdp.ws.empfangen({ method: 'Target.targetCreated', params: {
    targetInfo: { targetId: 'browser-leer', type: 'page', url: 'https://extern.invalid/' } } });
  anhaengen(cdp, { url: 'edge://downloads-hub/' });
  await assert.rejects(monitor.bereit(), /zuvor beobachteter Navigation/);
  monitor.close();
});

for (const fehlerhaft of [false, true]) test(`Navigation zu 127.0.0.1 braucht vollständige CDP-Sperre (Fehler=${fehlerhaft})`, async () => {
  const { cdp, protokoll } = mock(); const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  const send = cdp.send;
  if (fehlerhaft) cdp.send = (...args) => args[0] === 'Fetch.enable' && args[3] === 'leer'
    ? Promise.reject(new Error('keine Sperre')) : send(...args);
  anhaengen(cdp, {}); await monitor.bereit();
  navigiereTarget(cdp, 'Target.targetInfoChanged', 'edge://downloads-hub/');
  navigiereTarget(cdp, 'Target.targetInfoChanged', 'http://127.0.0.1:1234/');
  if (fehlerhaft) await assert.rejects(monitor.bereit(), /lokal ohne vollständige CDP-Sperre/);
  else {
    await monitor.bereit();
    cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'leer', params: {
      requestId: 'extern', request: { url: 'https://extern.invalid/' } } });
    await monitor.bereit();
    assert.equal(protokoll.netzanfragen[0].gesperrt, true);
    assert.equal(protokoll.netzTargets.find(t => t.sessionId === 'leer').seite, true);
    protokoll.ergebnisse = [{ id: 'PROBE', status: 'bestanden' }];
    assert.equal(auswerten(protokoll).code, 1, 'Externe Anfrage einer lokalen Web-Seite bleibt Seitenfehler');
  }
  monitor.close();
});

test('Gescheiterte Netzsperre einer Browser-Oberfläche bleibt ungültiger Nachweis', async () => {
  const { cdp, protokoll } = mock(); const monitor = await seitenNetzStarten(cdp, protokoll, 'pruefseite');
  anhaengen(cdp, { url: 'edge://downloads-hub/' }); await monitor.bereit();
  const send = cdp.send;
  cdp.send = (...args) => args[0] === 'Fetch.failRequest' ? Promise.reject(new Error('Sperre fehlgeschlagen')) : send(...args);
  cdp.ws.empfangen({ method: 'Fetch.requestPaused', sessionId: 'leer', params: {
    requestId: 'extern', request: { url: 'https://extern.invalid/' } } });
  await assert.rejects(monitor.bereit(), /Sperre fehlgeschlagen/); monitor.close();
});
