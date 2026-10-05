// Nachgestellte CDP-Antworten; kein Browser und kein Netzwerkzugriff.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { dateiauswahlAbbrechen, pruefeBox320, pruefeWebadapter } from './webadapter.mjs';
import { pruefung } from './auswertung.mjs';
import { Messfehler } from './fehler.mjs';
import { Cdp } from '../emulator/rahmen.mjs';

// Die wirklichen Browserausdrücke des Webadapter-Moduls werden ausgewertet;
// nur CDP und das Prüfdokument sind nachgestellt, keine ersetzte Klickfunktion.
for (const [fall, optionen, status, art] of [
  ['gesperrter Berechnen-Button', { gesperrt: true }, 'nicht bestanden', 'element-gesperrt'],
  ['fehlender Berechnen-Button', { fehlt: true }, 'nicht bestanden', 'element-fehlt'],
  ['gesperrter Speichern-Button', { speichernGesperrt: true }, 'nicht bestanden', 'element-gesperrt'],
  ['fehlende Statusanzeige', { statusFehlt: true }, 'nicht bestanden', 'element-fehlt'],
  ['CDP-Störung', { cdpFehler: true }, 'ungültig', null],
  ['Ausdruckstörung', { ausdruckFehler: true }, 'ungültig', null],
  ['fehlende Ausdruckbestätigung', { antwortFehlt: true }, 'ungültig', null],
  ['fehlender Fokus', { fokus: false }, 'ungültig', null],
]) test(`Echtes Webadapter-Modul: W4 bei ${fall} ergibt ${status}`, async () => {
  const protokoll = { ergebnisse: [] }, aufrufe = [];
  const element = { disabled: optionen.gesperrt, matches: () => false, getAttribute: () => null, scrollIntoView() {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 40 }), contains: () => true };
  const sandbox = { location: { href: 'about:blank' }, document: {
    querySelector: selector => selector === '#schedule-form button[type="submit"]' ? optionen.fehlt ? null : element
      : selector === '#storage-status' ? optionen.statusFehlt ? null : { textContent: 'Lokales Projekt geladen.' }
        : selector === '#save-json' ? { disabled: optionen.speichernGesperrt, matches: () => false, getAttribute: () => null } : {},
    elementFromPoint: () => element, hasFocus: () => optionen.fokus !== false,
  } };
  const cdp = { events: [], send: async (name, params) => {
    aufrufe.push(name);
    if (name === 'Runtime.evaluate') {
      if (optionen.cdpFehler) throw new Error('CDP unterbrochen');
      if (optionen.antwortFehlt) return {};
      if (optionen.ausdruckFehler) return { exceptionDetails: { text: 'Ausdruck nicht auswertbar' } };
      try { return { result: { value: runInNewContext(params.expression, sandbox) } }; }
      catch (e) { return { exceptionDetails: { text: e.message } }; }
    }
    return { identifier: 'instrumentierung' };
  } };
  await pruefeWebadapter({ cdp, protokoll, basisUrl: 'http://127.0.0.1:1234', ausgabe,
    navigieren: async () => {}, pruefung: async (id, beschreibung, fn) => {
      if (id === 'W4') return pruefung(protokoll, id, beschreibung, fn);
    } });
  const r = protokoll.ergebnisse[0];
  assert.equal(r.id, 'W4'); assert.equal(r.status, status);
  if (art) assert.equal(r.befund.art, art);
  assert.ok(!aufrufe.includes('Input.dispatchMouseEvent'), 'Fehlende/gesperrte Elemente und Messstörungen lösen keinen Klick aus');
});

async function webadapterProbe(id, { sperre, feldwert, sperreVorFokus, sperreNachFokus, keineAuswahl = false,
  freigabeFehlt = false, beiAktivierung = () => {}, nachKeyUp = () => {}, messantwort, keineMessantwort = false } = {}) {
  const protokoll = { ergebnisse: [] }, aufrufe = [], befehle = [];
  const fieldset = { disabled: sperre === 'fieldset' };
  let ariaGesperrt = sperre === 'aria', klickZiel;
  const elemente = new Map();
  for (const selector of ['[data-fristenrechner]', '#save-json', '#storage-status', '#open-json', '#import-message',
    '#export-excel', '#export-pdf', '#reset-project', '[name="projektname"]', '[name="kunde"]', '[name="vergabenummer"]']) {
    const element = { id: selector.slice(1), disabled: false, value: '',
      textContent: selector === '#storage-status' ? 'Lokales Projekt geladen.' : '',
      matches: pseudo => { assert.equal(pseudo, ':disabled'); return selector === '#open-json' && fieldset.disabled; },
      getAttribute: name => { assert.equal(name, 'aria-disabled'); return selector === '#open-json' && ariaGesperrt ? 'true' : null; },
      scrollIntoView() { klickZiel = element; },
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 40 }), contains: hit => hit === element,
    };
    elemente.set(selector, element);
  }
  const document = { querySelector: selector => elemente.get(selector), getElementById: id => elemente.get(`#${id}`),
    elementFromPoint: () => klickZiel, hasFocus: () => true, activeElement: null };
  const sandbox = { location: { href: 'about:blank' }, document,
    localStorage: { getItem: () => JSON.stringify({ input: { projekt: {} } }) } };
  // Wirkliche Cdp-Instanz mit nachgestelltem Transport, ohne WebSocket/Netz.
  const ws = new EventTarget(), cdp = new Cdp(ws);
  ws.close = () => ws.dispatchEvent(new Event('close'));
  const senden = cdp.send.bind(cdp);
  cdp.send = (name, params, timeout) => {
    aufrufe.push(name); befehle.push({ name, params, timeout });
    return senden(name, params, timeout);
  };
  ws.send = text => {
    const { id, method, params } = JSON.parse(text);
    if (keineMessantwort && method === 'Runtime.evaluate' && params.expression === '"browser-lauf-messbereit"') return;
    antworten(method, params).then(result => {
      ws.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id, result }) }));
      // Erst nach der zugeordneten erfolgreichen Antwort verliert der Kanal
      // die Verbindung; keyUp selbst bleibt eine bestätigte Bedienung.
      if (method === 'Input.dispatchKeyEvent' && params.type === 'keyUp') {
        assert.equal(cdp.pending.has(id), false);
        nachKeyUp(cdp);
      }
    }, error => ws.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ id, error: { code: -32000, message: error.message } }),
    })));
  };
  async function antworten(name, params) {
    if (name === 'Runtime.evaluate') {
      if (messantwort && params.expression === '"browser-lauf-messbereit"') return messantwort();
      try {
        const value = runInNewContext(params.expression, sandbox);
        return { result: { type: typeof value, value } };
      }
      catch (e) { return { exceptionDetails: { text: e.message } }; }
    }
    if (name === 'DOM.getDocument') return { root: { nodeId: 1 } };
    if (name === 'DOM.querySelector') return { nodeId: 2 };
    if (name === 'Page.bringToFront') {
      if (sperreVorFokus === 'aria') ariaGesperrt = true;
      if (sperreVorFokus === 'fieldset') fieldset.disabled = true;
    }
    if (name === 'DOM.focus') {
      document.activeElement = elemente.get('#open-json');
      if (sperreNachFokus === 'aria') ariaGesperrt = true;
      if (sperreNachFokus === 'fieldset') fieldset.disabled = true;
    }
    if ((name === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased' && klickZiel === elemente.get('#open-json'))
        || (name === 'Input.dispatchKeyEvent' && ['Enter', ' '].includes(params.key) && params.type === 'keyDown' && document.activeElement === elemente.get('#open-json'))) {
      if (!keineAuswahl) cdp.events.push({ method: 'Page.fileChooserOpened', params: { backendNodeId: 2 } });
      ariaGesperrt = true; // Das Produkt sperrt weitere Aktivierungen während der Auswahl.
      beiAktivierung();
    }
    if (name === 'Input.insertText') elemente.get('[name="projektname"]').value = feldwert ?? params.text;
    if (name === 'DOM.setFileInputFiles') {
      const projekt = JSON.parse(readFileSync(params.files[0], 'utf8')).input.projekt;
      for (const [name, value] of Object.entries(projekt)) elemente.get(`[name="${name}"]`).value = value;
      elemente.get('#import-message').textContent = 'Projekt geöffnet.';
      ariaGesperrt = freigabeFehlt;
    }
    return { identifier: 'instrumentierung' };
  }
  let aufraeumfehler;
  try {
    await pruefeWebadapter({ cdp, protokoll, basisUrl: 'http://127.0.0.1:1234', ausgabe,
      navigieren: async () => {}, pruefung: async (kennung, beschreibung, fn) => {
        if (kennung === id) return pruefung(protokoll, kennung, beschreibung, fn);
      } });
  } catch (e) {
    if (!cdp.closed) throw e;
    aufraeumfehler = e;
  } finally { cdp.close(); }
  return { r: protokoll.ergebnisse[0], aufrufe, befehle, elemente, aufraeumfehler };
}

for (const sperre of ['aria', 'fieldset']) for (const id of ['W6', 'W12-Enter']) {
  test(`Echtes Webadapter-Modul: ${id} bei ${sperre}-Sperre ergibt Produktabweichung vor Bedienung/Fokus`, async () => {
    const { r, aufrufe, elemente } = await webadapterProbe(id, { sperre });
    assert.equal(elemente.get('#open-json').disabled, false, 'Eigene disabled-Eigenschaft ist ausdrücklich frei');
    assert.equal(r.status, 'nicht bestanden');
    assert.equal(r.befund.art, 'element-gesperrt'); assert.equal(r.befund.selector, '#open-json');
    assert.ok(aufrufe.every(name => !name.startsWith('Input.') && !['DOM.focus', 'DOM.setFileInputFiles'].includes(name)));
  });
}

for (const sperre of ['aria', 'fieldset']) for (const zeitpunkt of ['VorFokus', 'NachFokus']) test(`W12-Enter prüft ${sperre}-Sperre erneut ${zeitpunkt}`, async () => {
  const { r, aufrufe } = await webadapterProbe('W12-Enter', { [`sperre${zeitpunkt}`]: sperre });
  assert.equal(aufrufe.includes('DOM.focus'), zeitpunkt === 'NachFokus');
  assert.ok(!aufrufe.includes('Input.dispatchKeyEvent'));
  assert.equal(r.status, 'nicht bestanden'); assert.equal(r.befund.art, 'element-gesperrt');
});

for (const id of ['W6', 'W12-Enter']) test(`Echtes Webadapter-Modul: freies Dateifeld lässt ${id} bestehen`, async () => {
  const { r, aufrufe } = await webadapterProbe(id);
  assert.equal(r.status, 'bestanden'); assert.ok(aufrufe.includes('DOM.setFileInputFiles'));
});

test('W6 erkennt eine nach Import verbliebene aria-Sperre bei der gemeinsamen Freigabeprüfung', async () => {
  const { r } = await webadapterProbe('W6', { freigabeFehlt: true });
  assert.equal(r.status, 'nicht bestanden'); assert.match(r.meldung, /Dateiaktionen nach Import freigegeben/);
});

for (const feldwert of [{ produktabweichung: { art: 'beliebig' } },
  { produktabweichung: { art: 'element-gesperrt', selector: '#frei-erfunden' } }]) {
  test(`W2 reicht Feldwert mit Markerart ${feldwert.produktabweichung.art} als gewöhnliche Daten durch`, async () => {
    const { r } = await webadapterProbe('W2', { feldwert });
    assert.equal(r.status, 'nicht bestanden'); assert.equal(r.befund, undefined);
    assert.match(r.meldung, /Eingabe in projektname/);
    assert.ok(!r.meldung.includes('Browserausdruck liefert keinen gültigen Produktbefund'));
  });
}

for (const id of ['W6', 'W12-Enter', 'W12-Leertaste']) test(`${id}: antwortender Seitenkanal ohne Dateiauswahl bleibt Produktabweichung`, async t => {
  let zeit = 0, bedient = false;
  const jetzt = Date.now;
  t.mock.method(Date, 'now', () => bedient ? (zeit += 5000) : jetzt());
  // Die Uhr läuft erst nach der Dateifeld-Aktivierung schneller; alle echten
  // Webadapter-Ausdrücke und CDP-Antwortprüfungen bleiben unverändert.
  const { r, befehle, aufraeumfehler } = await webadapterProbe(id, { keineAuswahl: true, beiAktivierung: () => { bedient = true; } });
  assert.equal(r.status, 'nicht bestanden'); assert.match(r.meldung, /Dateiauswahl nach/);
  const messung = befehle.filter(b => b.params?.expression === '"browser-lauf-messbereit"');
  assert.deepEqual(messung, [{ name: 'Runtime.evaluate', params: {
    expression: '"browser-lauf-messbereit"', returnByValue: true, userGesture: false,
  }, timeout: 5000 }]);
  assert.equal(aufraeumfehler, undefined);
});

test('N6: echter Webadapter und echte Cdp-Instanz werten Kanalverlust nach bestätigtem keyUp schon im Teilfall als ungültig', async t => {
  let zeit = 0, bedient = false, keyUpBestaetigt = false;
  const jetzt = Date.now;
  t.mock.method(Date, 'now', () => bedient ? (zeit += 5000) : jetzt());
  const { r, befehle, aufraeumfehler } = await webadapterProbe('W12-Enter', {
    keineAuswahl: true, beiAktivierung: () => { bedient = true; },
    nachKeyUp: cdp => { keyUpBestaetigt = true; cdp.ws.dispatchEvent(new Event('close')); },
  });
  assert.equal(keyUpBestaetigt, true);
  assert.equal(r.id, 'W12-Enter'); assert.equal(r.status, 'ungültig');
  assert.match(r.meldung, /CDP-Verbindung geschlossen/);
  assert.ok(befehle.some(b => b.params?.expression === '"browser-lauf-messbereit"'));
  assert.ok(aufraeumfehler instanceof Messfehler);
  assert.match(aufraeumfehler.message, /Aufräumen unvollständig/);
});

for (const [name, antwort, meldung] of [
  ['falscher Rückgabewert', { result: { type: 'string', value: 'falsch' } }, /Messfähigkeit.*nicht bestätigt/],
  ['fehlender Antwortbeleg', {}, /ohne Messergebnis/],
  ['Ausdruckstörung', { exceptionDetails: { text: 'Messung gestört' } }, /Messung gestört/],
  ['Produktmarker statt Messantwort', { result: { value: { produktabweichung: { art: 'element-gesperrt', selector: '#open-json' } } } }, /Messfähigkeit.*nicht bestätigt/],
]) test(`W12-Enter: ${name} nach Wartezeit ergibt ungültig`, async t => {
  let zeit = 0, bedient = false;
  const jetzt = Date.now;
  t.mock.method(Date, 'now', () => bedient ? (zeit += 5000) : jetzt());
  const { r, aufraeumfehler } = await webadapterProbe('W12-Enter', {
    keineAuswahl: true, beiAktivierung: () => { bedient = true; }, messantwort: () => antwort,
  });
  assert.equal(r.status, 'ungültig'); assert.match(r.meldung, meldung);
  assert.equal(r.befund, undefined); assert.equal(aufraeumfehler, undefined);
});

test('W12-Enter: ausbleibende Messantwort am echten CDP-Kanal ergibt ungültig', async t => {
  let zeit = 0, bedient = false;
  const jetzt = Date.now;
  t.mock.method(Date, 'now', () => bedient ? (zeit += 5000) : jetzt());
  const { r, aufraeumfehler } = await webadapterProbe('W12-Enter', {
    keineAuswahl: true, beiAktivierung: () => { bedient = true; }, keineMessantwort: true,
  });
  assert.equal(r.status, 'ungültig'); assert.match(r.meldung, /CDP-Zeitüberschreitung: Runtime.evaluate/);
  assert.ok(aufraeumfehler instanceof Messfehler);
});

function abbruchProbe(neueEreignisse, alteEreignisse = []) {
  const aufrufe = [];
  const ereignisse = [...alteEreignisse];
  const kontext = {
    send: async (name, parameter) => { aufrufe.push({ name, parameter }); },
    aktivieren: async () => {
      assert.deepEqual(aufrufe.at(-1), { name: 'Page.setInterceptFileChooserDialog', parameter: { enabled: true, cancel: true } });
      aufrufe.push({ name: 'Input.dispatchMouseEvent' });
      ereignisse.push(...neueEreignisse);
    },
    wert: async ausdruck => {
      if (ausdruck === 'globalThis.__browserLaufDateifeldEreignisse.length') return ereignisse.length;
      const anfang = /^globalThis\.__browserLaufDateifeldEreignisse\.slice\((\d+)\)$/.exec(ausdruck);
      assert.ok(anfang, `Unbekannter Messausdruck: ${ausdruck}`);
      return ereignisse.slice(Number(anfang[1]));
    },
    bis: async (lesen, beschreibung) => {
      const ergebnis = await lesen();
      if (!ergebnis) throw new Error(`Zeitüberschreitung: ${beschreibung}`);
      return ergebnis;
    },
  };
  return { kontext, aufrufe };
}

test('W8 verlangt browserseitiges cancel nach Input und schaltet danach auf normale Dateiauswahl zurück', async () => {
  const ereignis = { typ: 'cancel', isTrusted: true, dateien: 0 };
  const { kontext, aufrufe } = abbruchProbe([ereignis]);
  assert.deepEqual(await dateiauswahlAbbrechen(kontext), [ereignis]);
  assert.deepEqual(aufrufe, [
    { name: 'Page.setInterceptFileChooserDialog', parameter: { enabled: true, cancel: true } },
    { name: 'Input.dispatchMouseEvent' },
    { name: 'Page.setInterceptFileChooserDialog', parameter: { enabled: true, cancel: false } },
  ]);
});

for (const [name, neueEreignisse, alteEreignisse] of [
  ['ignoriertem CDP-Abbruchparameter', [], []],
  ['bloßer leerer Änderung der Dateiliste', [{ typ: 'change', isTrusted: true, dateien: 0 }], []],
  ['synthetischem cancel', [{ typ: 'cancel', isTrusted: false, dateien: 0 }], []],
  ['cancel eines früheren Dialogs', [], [{ typ: 'cancel', isTrusted: true, dateien: 0 }]],
]) {
  test(`W8 weist fehlenden Abbruchnachweis bei ${name} als Steuerungsfehler aus`, async () => {
    const { kontext, aufrufe } = abbruchProbe(neueEreignisse, alteEreignisse);
    await assert.rejects(dateiauswahlAbbrechen(kontext), /CDP-Steuerung: echtes cancel-Ereignis/);
    assert.deepEqual(aufrufe.at(-1), { name: 'Page.setInterceptFileChooserDialog', parameter: { enabled: true, cancel: false } });
    assert.ok(aufrufe.every(e => e.name !== 'DOM.setFileInputFiles'));
  });
}

test('W8 hebt den automatischen Abbruch auch bei fehlgeschlagener Aktivierung wieder auf', async () => {
  const { kontext, aufrufe } = abbruchProbe([]);
  kontext.aktivieren = async () => { throw new Error('CDP Input fehlgeschlagen'); };
  await assert.rejects(dateiauswahlAbbrechen(kontext), /Input fehlgeschlagen/);
  assert.deepEqual(aufrufe.at(-1), { name: 'Page.setInterceptFileChooserDialog', parameter: { enabled: true, cancel: false } });
});

const testBasis = resolve('scratchpad/tmp-v6a-r9');
mkdirSync(testBasis, { recursive: true });
const temp = realpathSync(testBasis);
const ausgabe = mkdtempSync(join(temp, 'webadapter-tests-'));
test.after(() => {
  const rest = relative(temp, realpathSync(ausgabe));
  assert.ok(rest.startsWith('webadapter-tests-') && !isAbsolute(rest) && !rest.includes(sep));
  rmSync(ausgabe, { recursive: true, force: true });
});

const layout = (rechts = 312, aenderungen = {}) => ({
  innerWidth: 320, visualViewportWidth: 320, clientWidth: 320, scrollWidth: Math.max(320, rechts), scrollX: 0,
  wurzel: { links: 8, rechts: 312, breite: 304, boxSizing: 'content-box' },
  stack: { links: 8, rechts, breite: rechts - 8, boxSizing: 'content-box' },
  timeline: { links: 8, rechts, breite: rechts - 8, boxSizing: 'content-box' },
  ...aenderungen,
});

function boxProbe(ohne, mit = layout()) {
  const aufrufe = [];
  const protokoll = {};
  let gegenprobe = false;
  const kontext = {
    ausgabe, protokoll,
    send: async (name, parameter) => {
      aufrufe.push({ name, parameter });
      return name === 'Page.captureScreenshot' ? { data: Buffer.from('Nachgestellte PNG-Daten').toString('base64') } : {};
    },
    wert: async ausdruck => {
      if (ausdruck.includes('const element=')) return gegenprobe ? mit : ohne;
      if (ausdruck.includes("s.id='browser-lauf-box-sizing'")) { gegenprobe = true; return; }
      assert.equal(ausdruck, 'scrollTo(0,0)');
    },
    frisch: async () => { aufrufe.push({ name: 'Probeseite frisch' }); },
    berechnen: async () => { aufrufe.push({ name: 'Berechnen' }); },
  };
  return { kontext, aufrufe, protokoll };
}

test('BOX-320 misst 320 Pixel nutzbare Layoutbreite und stellt die Emulation anschließend zurück', async () => {
  const { kontext, aufrufe, protokoll } = boxProbe(layout());
  const messung = await pruefeBox320(kontext);
  assert.deepEqual(aufrufe.slice(0, 2), [
    { name: 'Emulation.setScrollbarsHidden', parameter: { hidden: true } },
    { name: 'Emulation.setDeviceMetricsOverride', parameter: { width: 320, height: 900, deviceScaleFactor: 1, mobile: false } },
  ]);
  assert.equal(messung.ohneGlobaleRegel.clientWidth, 320);
  assert.equal(protokoll.messungen[0], messung);
  assert.deepEqual(messung.bilder, ['box-320-ohne.png', 'box-320-mit.png']);
  assert.equal(readFileSync(join(ausgabe, 'box-320-ohne.png'), 'utf8'), 'Nachgestellte PNG-Daten');
  assert.deepEqual(aufrufe.slice(-2), [
    { name: 'Emulation.clearDeviceMetricsOverride', parameter: undefined },
    { name: 'Emulation.setScrollbarsHidden', parameter: { hidden: false } },
  ]);
  assert.equal(protokoll.befunde, undefined);
});

test('BOX-320 lässt eine verbliebene 15-Pixel-Bildlaufleiste nicht als 320-Pixel-Layout bestehen', async () => {
  const { kontext, aufrufe, protokoll } = boxProbe(layout(300, { clientWidth: 305, visualViewportWidth: 305 }));
  await assert.rejects(pruefeBox320(kontext), /320 CSS-Pixel nutzbare Layoutbreite/);
  assert.equal(protokoll.messungen[0].ohneGlobaleRegel.clientWidth, 305);
  assert.equal(protokoll.befunde, undefined, 'Ungültige Messbreite ist noch kein box-sizing-Befund');
  assert.deepEqual(aufrufe.at(-1), { name: 'Emulation.setScrollbarsHidden', parameter: { hidden: false } });
});

test('BOX-320 lässt einen verschobenen Ausschnitt keinen rechten Überlauf verbergen', async () => {
  const { kontext, protokoll } = boxProbe(layout(312, { scrollX: 28 }));
  await assert.rejects(pruefeBox320(kontext), /Überlaufmessung beginnt am linken Viewportrand/);
  assert.equal(protokoll.messungen[0].ohneGlobaleRegel.scrollX, 28);
  assert.equal(protokoll.befunde, undefined);
});

test('BOX-320 sichert Überlauf und wirksame Gegenprobe vor dem Produktbefund', async () => {
  const { kontext, protokoll } = boxProbe(layout(348), layout(312, { timeline: { links: 8, rechts: 312, breite: 304, boxSizing: 'border-box' } }));
  await assert.rejects(pruefeBox320(kontext), /28 Pixel über den Viewport/);
  assert.equal(protokoll.befunde[0].id, 'WEB-BOX-SIZING');
  assert.match(protokoll.befunde[0].gegenprobe, /innerhalb des Viewports/);
  assert.equal(protokoll.messungen[0].mitGlobalerRegel.timeline.boxSizing, 'border-box');
  assert.deepEqual(protokoll.befunde[0].bilder, ['box-320-ohne.png', 'box-320-mit.png']);
});

test('W8-Messstörung wird ungültig; BOX-320-Produktüberlauf bleibt nicht bestanden', async () => {
  const bericht = { ergebnisse: [] };
  const abbruch = abbruchProbe([]);
  const w8 = await pruefung(bericht, 'W8', 'Abbruchnachweis', () => dateiauswahlAbbrechen(abbruch.kontext));
  assert.equal(w8.status, 'ungültig');
  const box = boxProbe(layout(329));
  const ergebnis = await pruefung(bericht, 'BOX-320', 'Überlauf', () => pruefeBox320(box.kontext));
  assert.equal(ergebnis.status, 'nicht bestanden');
  const steuerung = abbruchProbe([]);
  steuerung.kontext.send = async () => { throw new Error('CDP-Störung'); };
  await assert.rejects(dateiauswahlAbbrechen(steuerung.kontext), Messfehler);
});

test('BOX-320 behauptet bei unwirksamer Gegenprobe keine bestätigte box-sizing-Ursache', async () => {
  const { kontext, protokoll } = boxProbe(layout(348), layout(330));
  await assert.rejects(pruefeBox320(kontext), /28 Pixel über den Viewport/);
  assert.match(protokoll.befunde[0].gegenprobe, /beseitigt den Überlauf nicht vollständig/);
});

test('BOX-320 räumt die Bildlaufleisten auch bei einem Fehler im Zurücksetzen der Maße auf', async () => {
  const { kontext, aufrufe } = boxProbe(layout());
  const senden = kontext.send;
  kontext.send = async (name, parameter) => {
    if (name === 'Emulation.clearDeviceMetricsOverride') throw new Error('Maße zurücksetzen fehlgeschlagen');
    return senden(name, parameter);
  };
  await assert.rejects(pruefeBox320(kontext), /Maße zurücksetzen fehlgeschlagen/);
  assert.deepEqual(aufrufe.at(-1), { name: 'Emulation.setScrollbarsHidden', parameter: { hidden: false } });
});
