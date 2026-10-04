// Nachgestellte CDP-Antworten; kein Browser und kein Netzwerkzugriff.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import test from 'node:test';
import { dateiauswahlAbbrechen, pruefeBox320 } from './webadapter.mjs';

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

const temp = realpathSync(tmpdir());
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
