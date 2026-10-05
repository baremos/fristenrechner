// Nachgestellte Browser-/Page-CDP-Daten, kein Browser und kein Netz.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { browserDownload, echterMausklick, exportInstrumentationQuelle } from './download.mjs';
import { pruefung } from './auswertung.mjs';
import { browserErgebnis, messbefehl } from './fehler.mjs';

test('Messbefehl erhält einen strukturierten Produktbefund; fehlende oder ungültige Ausdruckbelege bleiben Messfehler', async () => {
  const berichten = antwort => pruefung({ ergebnisse: [] }, 'W4', 'Ausdruck', () => messbefehl(() => browserErgebnis(antwort, { produktbefund: true })));
  const produkt = await berichten({ result: { value: { produktabweichung: { art: 'element-gesperrt', selector: '#berechnen' } } } });
  assert.equal(produkt.status, 'nicht bestanden'); assert.equal(produkt.befund.art, 'element-gesperrt');
  for (const antwort of [null, {}, { result: {} }, { result: { value: { produktabweichung: { art: 'unbekannt' } } } },
    { exceptionDetails: { text: 'Ausdruck gestört' } }]) assert.equal((await berichten(antwort)).status, 'ungültig');
});

test('Gewöhnliche Werte behalten auch gültige oder ungültige Produktmarker unverändert', () => {
  for (const value of [{ produktabweichung: { art: 'element-gesperrt', selector: '#feld' } },
    { produktabweichung: { art: 'beliebig' } }]) {
    assert.equal(browserErgebnis({ result: { value } }), value);
  }
});

test('exceptionDetails haben auch neben einem gültigen Produktmarker in beiden Aufrufwegen Vorrang', async () => {
  const antwort = { result: { value: { produktabweichung: { art: 'element-gesperrt', selector: '#feld' } } },
    exceptionDetails: { text: 'Messausdruck gestört' } };
  for (const produktbefund of [false, true]) {
    const r = await pruefung({ ergebnisse: [] }, 'W4', 'Ausdruck', () => browserErgebnis(antwort, { produktbefund }));
    assert.equal(r.status, 'ungültig'); assert.equal(r.befund, undefined);
    assert.match(r.meldung, /Messausdruck gestört/);
  }
});

const beginn = (params = {}) => ({ method: 'Browser.downloadWillBegin', params: {
  guid: 'download-1', frameId: 'frame', url: 'blob:http://127.0.0.1:1234/datei', suggestedFilename: 'probe.xlsx', ...params,
} });
const fortschritt = (state = 'completed', guid = 'download-1') => ({ method: 'Browser.downloadProgress', params: { guid, state } });
function probe({ ereignisse = [beginn(), fortschritt()], vorher = [], steuerungsfehler = false, kontexte = ['eigener-kontext'] } = {}) {
  let zeit = 0;
  const aufrufe = [], nachweis = {};
  const browserCdp = { events: [...vorher], send: async (method, params) => {
    aufrufe.push({ method, params });
    if (method === 'Target.getBrowserContexts') return { browserContextIds: kontexte };
    if (steuerungsfehler) throw new Error('Richtlinie nicht bestätigt');
  } };
  const kontext = { browserCdp, ausgabe: resolve('scratchpad/tmp-v6a-r9'), browserContextId: 'eigener-kontext', frameId: 'frame', endung: 'xlsx', nachweis,
    aktivieren: async () => { aufrufe.push({ method: 'echte Aktivierung' }); browserCdp.events.push(...ereignisse); return { fokus: true }; } };
  return { kontext, nachweis, aufrufe, optionen: { jetzt: () => zeit, warten: async ms => { zeit += ms; }, fristMs: 100 } };
}

test('Browser-Richtlinie mit Kontext und Ereignissen wird vor genau einer Aktivierung bestätigt; GUID und beide Ereignisse bleiben erhalten', async () => {
  const p = probe();
  assert.equal((await browserDownload(p.kontext, p.optionen)).guid, 'download-1');
  assert.deepEqual(p.aufrufe, [
    { method: 'Target.getBrowserContexts', params: {} },
    { method: 'Browser.setDownloadBehavior', params: { behavior: 'allowAndName', downloadPath: p.kontext.ausgabe, eventsEnabled: true, browserContextId: 'eigener-kontext' } },
    { method: 'echte Aktivierung' },
  ]);
  assert.equal(p.nachweis.steuerung.bestaetigt, true);
  assert.equal(p.nachweis.abschluss.params.state, 'completed');
  assert.equal(p.nachweis.ereignisse.length, 2);
});

test('Default-Kontext bekommt keinen erfundenen browserContextId und keinen Page-Fallback', async () => {
  const p = probe({ kontexte: [] }); delete p.kontext.browserContextId;
  await browserDownload(p.kontext, p.optionen);
  assert.ok(!Object.hasOwn(p.aufrufe[1].params, 'browserContextId'));
  assert.ok(p.aufrufe.every(a => a.method !== 'Page.setDownloadBehavior'));
});

test('Unbestätigte Richtlinie löst weder Exportklick noch Page-Fallback aus', async () => {
  const p = probe({ steuerungsfehler: true });
  await assert.rejects(browserDownload(p.kontext, p.optionen), /Richtlinie nicht bestätigt/);
  assert.equal(p.aufrufe.length, 2);
  assert.equal(p.nachweis.steuerung.bestaetigt, false);
});

test('Gemeldete Standardkontext-ID wird nicht als isolierter Kontext an die Downloadsteuerung geschickt', async () => {
  const p = probe({ kontexte: [] });
  await browserDownload(p.kontext, p.optionen);
  assert.ok(!Object.hasOwn(p.aufrufe[1].params, 'browserContextId'));
  assert.equal(p.nachweis.steuerung.kontext.targetContextId, 'eigener-kontext');
  assert.equal(p.nachweis.steuerung.kontext.art, 'Standardkontext');
});

test('Fehlende Target-Kontext-ID bei vorhandenen isolierten Kontexten erlaubt keinen beliebigen Downloadkontext', async () => {
  const p = probe(); delete p.kontext.browserContextId;
  await assert.rejects(browserDownload(p.kontext, p.optionen), /Downloadkontext.*eindeutig/);
  assert.equal(p.aufrufe.length, 1);
});

for (const [name, ereignisse, erwartet] of [
  ['fehlender Beginn', [], /Beginn des xlsx/],
  ['fehlender Abschluss', [beginn()], /Abschluss des xlsx/],
  ['abgebrochener Download', [beginn(), fortschritt('canceled')], /Download vollständig/],
  ['Abschluss einer anderen GUID', [beginn(), fortschritt('completed', 'anderer')], /Abschluss des xlsx/],
  ['falscher Frame', [beginn({ frameId: 'downloads-hub' }), fortschritt()], /Frame der Prüfseite/],
  ['fremder Ursprung', [beginn({ url: 'https://extern.invalid/datei' }), fortschritt()], /lokaler Ressource/],
  ['falsches Format', [beginn({ suggestedFilename: 'probe.pdf' }), fortschritt()], /Dateiendung xlsx/],
  ['Pfad in GUID', [beginn({ guid: '../fremd' }), fortschritt()], /sichere Downloadkennung/],
]) test(`${name} besteht nicht; Nachweis bleibt auch bei Fehler und es gibt keinen Wiederholungsklick`, async () => {
  const p = probe({ ereignisse });
  await assert.rejects(browserDownload(p.kontext, p.optionen), erwartet);
  assert.equal(p.aufrufe.filter(a => a.method === 'echte Aktivierung').length, 1);
  assert.deepEqual(p.nachweis.ereignisse, ereignisse);
  assert.ok(p.nachweis.fehler);
});

test('Ereignisse früherer Exporte und veraltete Page.download-Ereignisse ergeben keinen Erfolg', async () => {
  const p = probe({ vorher: [beginn(), fortschritt()], ereignisse: [{ method: 'Page.downloadWillBegin', params: beginn().params }] });
  await assert.rejects(browserDownload(p.kontext, p.optionen), /Beginn des xlsx/);
  assert.deepEqual(p.nachweis.ereignisse, []);
});

test('Schnelle Ereignisse während der Klickantwort gehen nicht verloren; inProgress genügt nicht, verspäteter passender Abschluss schon', async () => {
  const p = probe({ ereignisse: [beginn(), fortschritt('inProgress')] });
  const warten = p.optionen.warten;
  p.optionen.warten = async ms => { await warten(ms); p.kontext.browserCdp.events.push(fortschritt()); };
  await browserDownload(p.kontext, p.optionen);
  assert.equal(p.nachweis.abschlussNachMs, 50);
});

function klickProbe({ fokus = true, ueberdeckt = false, breite = 80, fehlt = false, gesperrt = false } = {}) {
  const aufrufe = [];
  const element = { disabled: gesperrt, matches: () => false, getAttribute: () => null, scrollIntoView: () => aufrufe.push('scroll'), getBoundingClientRect: () => ({ x: 10, y: 20, width: breite, height: 40 }), contains: hit => hit === element };
  let aktiv = false;
  const document = { querySelector: selector => selector === '#export-excel' && !fehlt ? element : null,
    elementFromPoint: () => ueberdeckt ? {} : element, hasFocus: () => aktiv };
  return { aufrufe, kontext: { selector: '#export-excel',
    send: async (method, params) => { aufrufe.push({ method, params }); if (method === 'Page.bringToFront') aktiv = fokus; },
    wert: async expression => runInNewContext(expression, { document }),
  } };
}

for (const [optionen, art] of [[{ fehlt: true }, 'element-fehlt'], [{ gesperrt: true }, 'element-gesperrt']]) {
  test(`Strukturierter Klickbefund ${art} ist Produktabweichung ohne Input`, async () => {
    const p = klickProbe(optionen);
    const r = await pruefung({ ergebnisse: [] }, 'W5-xlsx', 'Bedienelement', () => echterMausklick(p.kontext));
    assert.equal(r.status, 'nicht bestanden');
    assert.equal(r.befund.art, art); assert.equal(r.befund.selector, '#export-excel');
    assert.ok(p.aufrufe.every(a => typeof a === 'string' || !a.method.startsWith('Input.')));
  });
}

test('Nach einem Download-Hub wird zuerst die Prüfseite aktiviert, danach Treffpunkt belegt und exakt einmal echte Eingabe gesendet', async () => {
  const p = klickProbe();
  const punkt = await echterMausklick(p.kontext);
  assert.equal(p.aufrufe[0].method, 'Page.bringToFront');
  assert.equal(punkt.fokus, true); assert.equal(punkt.treffer, true);
  assert.deepEqual(p.aufrufe.slice(-3).map(a => [a.method, a.params.type, a.params.x, a.params.y]), [
    ['Input.dispatchMouseEvent', 'mouseMoved', 50, 40],
    ['Input.dispatchMouseEvent', 'mousePressed', 50, 40],
    ['Input.dispatchMouseEvent', 'mouseReleased', 50, 40],
  ]);
});

for (const [name, optionen, erwartet] of [
  ['fehlender Fokus', { fokus: false }, /bestätigten Fokus/],
  ['Überdeckung', { ueberdeckt: true }, /ohne Überdeckung/],
  ['unsichtbares Bedienelement', { breite: 0 }, /Sichtbares Bedienelement/],
]) test(`Bei ${name} entsteht kein Input und kein synthetischer Ausweichklick`, async () => {
  const p = klickProbe(optionen);
  await assert.rejects(echterMausklick(p.kontext), erwartet);
  assert.ok(p.aufrufe.every(a => typeof a === 'string' || !a.method.startsWith('Input.')));
});

test('Downloadrichtlinie und Messfrist werden ungültig; falscher Dateityp bleibt Produktabweichung', async () => {
  for (const [optionen, status] of [[{ steuerungsfehler: true }, 'ungültig'], [{ ereignisse: [] }, 'ungültig'],
    [{ ereignisse: [beginn({ suggestedFilename: 'probe.pdf' }), fortschritt()] }, 'nicht bestanden']]) {
    const p = probe(optionen);
    assert.equal((await pruefung({ ergebnisse: [] }, 'W5-xlsx', 'Download', () => browserDownload(p.kontext, p.optionen))).status, status);
  }
});

for (const [name, ereignisse] of [['Beginn', []], ['Abschluss', [beginn()]]]) {
  for (const kanalverlust of [false, true]) test(`Fehlender Download-${name} bleibt bei ${kanalverlust ? 'verlorenem' : 'antwortendem'} Kanal ungültig`, async () => {
    const p = probe({ ereignisse });
    const senden = p.kontext.browserCdp.send, aktivieren = p.kontext.aktivieren;
    let geschlossen = false;
    p.kontext.browserCdp.send = (...args) => {
      if (geschlossen) throw new Error('CDP-Verbindung geschlossen');
      return senden(...args);
    };
    p.kontext.aktivieren = async () => {
      const klick = await aktivieren(); geschlossen = kanalverlust; return klick;
    };
    const r = await pruefung({ ergebnisse: [] }, 'W5-xlsx', 'Download', () => browserDownload(p.kontext, p.optionen));
    assert.equal(r.status, 'ungültig'); assert.match(r.meldung, new RegExp(`${name} des xlsx-Downloads`));
    assert.equal(p.aufrufe.filter(a => a.method === 'echte Aktivierung').length, 1);
  });
}

test('Fehlende Kontextantwort ist Messfehler und löst keinen Download aus', async () => {
  const p = probe(); p.kontext.browserCdp.send = async () => undefined;
  assert.equal((await pruefung({ ergebnisse: [] }, 'W5-xlsx', 'Download', () => browserDownload(p.kontext, p.optionen))).status, 'ungültig');
  assert.deepEqual(p.nachweis.ereignisse, []);
});

test('Exportinstrumentierung beobachtet echten Klick, Anker und Blob-Widerruf, ohne Originalaufrufe oder Rückgaben zu verändern', () => {
  let zeit = 0, klicks = 0, widerrufe = 0, callback;
  class Anker { click() { klicks++; return 'ursprünglicher Klick'; } }
  const sandbox = { HTMLAnchorElement: Anker, Date: { now: () => zeit }, URL: {
    createObjectURL: blob => { assert.equal(blob.size, 6234); return 'blob:http://127.0.0.1/xlsx'; },
    revokeObjectURL: url => { assert.equal(url, 'blob:http://127.0.0.1/xlsx'); widerrufe++; return 'widerrufen'; },
  }, document: { hasFocus: () => true, addEventListener: (typ, fn, capture) => {
    assert.equal(typ, 'click'); assert.equal(capture, true); callback = fn;
  } } };
  runInNewContext(exportInstrumentationQuelle, sandbox);
  callback({ isTrusted: true, target: { closest: () => ({ id: 'export-excel' }) } });
  const url = sandbox.URL.createObjectURL({ size: 6234, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const anker = new Anker(); anker.href = url; anker.download = 'probe.xlsx';
  assert.equal(anker.click(), 'ursprünglicher Klick');
  zeit = 1000;
  assert.equal(sandbox.URL.revokeObjectURL(url), 'widerrufen');
  assert.equal(klicks, 1); assert.equal(widerrufe, 1);
  assert.equal(sandbox.__browserLaufExportKlicks[0].isTrusted, true);
  assert.equal(sandbox.__browserLaufDownloadAnker[0].download, 'probe.xlsx');
  assert.equal(sandbox.__browserLaufBlobURLs[0].widerrufen, 1000);
  assert.equal(sandbox.__browserLaufBlobURLs[0].bytes, 6234);
});
