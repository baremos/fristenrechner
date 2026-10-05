// Gegenproben des echten main()-Rahmens mit nachgestellten Ausführungsschritten.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { main, wurzel } from '../browser-lauf.mjs';
import { auswerten, gesamtAuswerten } from './auswertung.mjs';
import { bauen } from './bauen.mjs';
import { ERGEBNISKATALOG } from './ergebniskatalog.mjs';

const basis = resolve('scratchpad/tmp-v6a-r6');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'rahmen-tests-'));
test.after(() => {
  const rest = relative(realpathSync(basis), realpathSync(arbeit));
  assert.ok(rest.startsWith('rahmen-tests-') && !isAbsolute(rest) && !rest.includes(sep));
  rmSync(arbeit, { recursive: true, force: true });
});
const vollstaendig = (phase, status = 'bestanden') => ({ phase,
  ergebnisse: ERGEBNISKATALOG[phase].map(id => ({ id, status })) });
function probe({ fehlt, codes = {}, aufraeumfehler = false } = {}) {
  const aufrufe = [];
  const hilfen = {
    prozess: async (_name, args) => ({ code: 0, out: args[0] === 'rev-parse' ? 'a'.repeat(40) : '', err: '' }),
    browserFinden: name => name === fehlt ? undefined : 'nachgestelltes Programm',
    bauen: async () => { aufrufe.push('bauen'); return { dist: arbeit, htmlHash: 'b'.repeat(64) }; },
    serverStarten: async () => { aufrufe.push('server'); return { basisUrl: 'http://127.0.0.1:1234', anfragen: [], close: async () => {
      aufrufe.push('aufraeumen'); if (aufraeumfehler) throw new Error('Serverende nicht bestätigt');
    } }; },
    phaseAusfuehren: async ({ browser, phase, signal }) => {
      assert.equal(signal.aborted, false); aufrufe.push(`${browser}/${phase}`);
      const p = vollstaendig(phase);
      const code = codes[`${browser}/${phase}`] ?? 0;
      if (code !== 0) p.ergebnisse[0].status = code === 2 ? 'ungültig' : 'nicht bestanden';
      p.auswertung = { code: 0 }; // main muss die tatsächlichen Fälle selbst auswerten.
      return p;
    },
  };
  return { hilfen, aufrufe };
}
const argv = (name, browser = 'beide', phase = 'alle-v6a') => ['--phase', phase, '--browser', browser, '--ausgabe', join(arbeit, name)];
const bericht = name => JSON.parse(readFileSync(join(arbeit, name, 'protokoll.json'), 'utf8'));

test('Fehlender Chrome lässt Edge zur Befundsuche laufen, macht beide Phasen und Gesamtlauf ungültig', async () => {
  const p = probe({ fehlt: 'chrome' });
  assert.equal(await main(argv('browser-fehlt'), p.hilfen), 2);
  assert.deepEqual(p.aufrufe, ['bauen', 'server', 'edge/vertrag', 'edge/webadapter', 'aufraeumen']);
  const r = bericht('browser-fehlt');
  assert.deepEqual(r.nichtInstalliert, ['chrome']);
  assert.equal(r.status, 'ungültig');
  assert.ok(r.auswertung.kombinationsfehler.includes('Browser/Phase fehlt: chrome/webadapter'));
});

for (const [name, codes, code] of [['bestanden', {}, 0], ['produktfehler', { 'chrome/webadapter': 1 }, 1],
  ['messfehler', { 'edge/vertrag': 2, 'chrome/webadapter': 1 }, 2]]) {
  test(`main aggregiert alle vier Browser/Phasen: ${name}, Code ${code}`, async () => {
    const p = probe({ codes });
    assert.equal(await main(argv(name), p.hilfen), code);
    assert.equal(bericht(name).laeufe.length, 4);
    assert.deepEqual(bericht(name).auswertung.kombinationsfehler, []);
    assert.equal(p.aufrufe.at(-1), 'aufraeumen');
  });
}

test('main sichert Aufräumfehler als ungültigen Gesamtbericht und entfernt die Signalhandler', async () => {
  const p = probe({ aufraeumfehler: true });
  const vorher = ['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s));
  assert.equal(await main(argv('aufraeumfehler'), p.hilfen), 2);
  assert.match(bericht('aufraeumfehler').aufraeumfehler, /Serverende/);
  assert.equal(bericht('aufraeumfehler').auswertung.code, 2);
  assert.equal(bericht('aufraeumfehler').laeufe.length, 4);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s)), vorher);
});

test('Abbruch während der letzten Phase bleibt trotz vollständigem Ergebniskatalog ungültig', async () => {
  const p = probe(), ausfuehren = p.hilfen.phaseAusfuehren;
  p.hilfen.phaseAusfuehren = async args => {
    const r = await ausfuehren(args);
    if (args.browser === 'chrome' && args.phase === 'webadapter') process.emit('SIGINT');
    return r;
  };
  assert.equal(await main(argv('letzter-abbruch'), p.hilfen), 2);
  assert.equal(bericht('letzter-abbruch').laeufe.length, 4);
  assert.equal(bericht('letzter-abbruch').auswertung.code, 2);
});

test('Abbruch während des Builds erreicht das Bausignal; weder Server noch Browserphase starten', async () => {
  const p = probe();
  p.hilfen.bauen = async (_wurzel, _ausgabe, { signal }) => {
    const abbruch = new Promise(r => signal.addEventListener('abort', r, { once: true }));
    process.emit('SIGINT'); await abbruch;
    assert.equal(signal.aborted, true);
    return { dist: arbeit };
  };
  assert.equal(await main(argv('bauabbruch'), p.hilfen), 2);
  assert.deepEqual(p.aufrufe, []);
  assert.match(bericht('bauabbruch').fehler, /während des Builds unterbrochen/);
});

test('bauen bricht nach dem unterbrochenen ersten Baubefehl ab und erhält dessen Log', async () => {
  const controller = new AbortController(), ausgabe = join(arbeit, 'baubefehl');
  mkdirSync(ausgabe);
  let aufrufe = 0;
  await assert.rejects(bauen(wurzel, ausgabe, { signal: controller.signal, prozess: async (_programm, _args, { signal }) => {
    assert.equal(signal, controller.signal); aufrufe++; controller.abort();
    return { code: null, out: 'Teilbau', err: 'unterbrochen' };
  } }), /Bau unterbrochen/);
  assert.equal(aufrufe, 1);
  assert.equal(readFileSync(join(ausgabe, 'kern-build.log'), 'utf8'), 'Teilbauunterbrochen');
});

test('NETZ allein ohne W-Fälle, unbekannte und doppelte Kennungen sind ungültig', () => {
  const nurNetz = auswerten({ phase: 'webadapter', ergebnisse: [{ id: 'NETZ', status: 'bestanden' }] });
  assert.equal(nurNetz.code, 2);
  assert.ok(nurNetz.katalogfehler.includes('Pflichtkennung fehlt: W8'));
  for (const id of ['UNBEKANNT', 'W8']) {
    const p = vollstaendig('webadapter'); p.ergebnisse.push({ id, status: 'bestanden' });
    assert.equal(auswerten(p).code, 2);
  }
  assert.equal(auswerten(vollstaendig('vertrag')).code, 0);
  assert.equal(auswerten(vollstaendig('webadapter')).code, 0);
});

test('Fehlende, doppelte oder fremde Browser/Phase invalidieren auch sonst bestandene Kombinationen', () => {
  const r = { optionen: { browser: 'beide', phasen: ['vertrag', 'webadapter'] }, laeufe:
    ['edge', 'chrome'].flatMap(browser => ['vertrag', 'webadapter'].map(phase => ({ browser, phase, code: 0 }))) };
  assert.equal(gesamtAuswerten(r).code, 0);
  assert.equal(gesamtAuswerten({ ...r, laeufe: r.laeufe.slice(1) }).code, 2);
  assert.equal(gesamtAuswerten({ ...r, laeufe: [...r.laeufe, r.laeufe[0]] }).code, 2);
  assert.equal(gesamtAuswerten({ ...r, laeufe: [...r.laeufe, { browser: 'edge', phase: 'unbekannt', code: 0 }] }).code, 2);
});
