// SPDX-License-Identifier: Apache-2.0
// Eigene Probedateien, nachgestelltes ADB/CDP; kein Emulator und kein Netz.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { deflateSync } from 'node:zlib';
import { APP, innen } from './emulator/rahmen.mjs';
import { MESSUNG } from './emulator/menue-ui.mjs';
import { scrollruheQuelle } from './browser/emulation.mjs';
import { argumente, PROFILE, PROBEDATEN, BILDER, DEMO_BEFEHLE, Grenze, demoModus, aufloesung, dichte, pngPruefen, formularQuelle,
  sichtvorlage, auswertung, nachauswerten, lauf, main, layoutruhe } from './store-screenshots.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(repo, 'scratchpad', 'store-screenshots-tests');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'lauf-'));
test.after(() => {
  assert.ok(innen(realpathSync(basis), realpathSync(arbeit)));
  assert.match(relative(realpathSync(basis), realpathSync(arbeit)), /^lauf-[^/\\]+$/);
  rmSync(arbeit, { recursive: true, force: true });
});
const debug = join(arbeit, 'probe.apk'), ziel = join(arbeit, 'ausgabe');
writeFileSync(debug, 'Eigene nachgestellte APK; niemals installierbar.');
const args = (ausgabe = ziel) => ['--api', '36', '--apk-debug', debug, '--ausgabe', ausgabe];
const hash = b => createHash('sha256').update(b).digest('hex');

test('Argumente erhalten Pfade und verändern die Eingabeliste nicht', () => {
  const argv = args(join(arbeit, 'mit Leerzeichen')), original = [...argv];
  assert.deepEqual(argumente(argv), { api: 36, debug, ausgabe: argv.at(-1), profil: 'telefon', nurArgumente: false, auswerten: false });
  assert.deepEqual(argv, original);
  assert.equal(argumente([...argv, '--nur-argumente']).nurArgumente, true);
  assert.deepEqual(argumente(['--auswerten', '--ausgabe', ziel]), { ausgabe: ziel, auswerten: true });
});

for (const profil of ['telefon', 'tablet-7', 'tablet-10']) test(`Argumente akzeptieren Profil ${profil} auch bei der Argumentprobe`, async () => {
  assert.equal(argumente([...args(), '--profil', profil]).profil, profil);
  const argv = [...args(), '--profil', profil, '--nur-argumente'];
  assert.equal(argumente(argv).profil, profil);
  const logs = [];
  assert.equal(await main(argv, { laufFn: async () => assert.fail('Argumentprobe darf keinen Lauf starten.'), log: s => logs.push(s), error: assert.fail }), 0);
  assert.equal(JSON.parse(logs[0]).profil, profil);
});

for (const [name, argv] of [
  ['keine Argumente', []], ['API 30', args().map(v => v === '36' ? '30' : v)],
  ['fehlender APK-Wert', ['--api', '36', '--apk-debug', '--ausgabe', ziel]],
  ['fehlende Ausgabe', args().slice(0, -2)], ['unbekannter Schalter', [...args(), '--unbekannt']],
  ['loser Wert', [...args(), 'extra']], ['doppelte API', [...args(), '--api', '36']],
  ['doppelter Schalter', [...args(), '--nur-argumente', '--nur-argumente']],
  ['unbekanntes Profil', [...args(), '--profil', 'tablet-8']], ['fehlender Profilwert', [...args(), '--profil']],
  ['doppeltes Profil', [...args(), '--profil', 'telefon', '--profil', 'telefon']],
  ['Auswertung mit API', [...args(), '--auswerten']], ['Auswertung mit Argumentprobe', ['--auswerten', '--ausgabe', ziel, '--nur-argumente']],
  ['Auswertung mit Profil', ['--auswerten', '--ausgabe', ziel, '--profil', 'tablet-7']],
  ['Ausgabe außerhalb scratchpad', args(join(repo, 'docs', 'verboten'))],
  ['scratchpad-Wurzel', args(join(repo, 'scratchpad'))], ['Worktree-Wurzel', args(repo)],
  ['fremder Worktree', args(join(dirname(repo), 'fremd', 'scratchpad', 'lauf'))],
  ['APK außerhalb Worktree', ['--api', '36', '--apk-debug', join(dirname(repo), 'fremd.apk'), '--ausgabe', ziel]],
  ['falsche APK-Endung', ['--api', '36', '--apk-debug', join(arbeit, 'probe.txt'), '--ausgabe', ziel]],
]) test(`Argumente verwerfen ${name}`, () => assert.throws(() => argumente(argv)));

test('Eine Junction kann scratchpad nicht in einen geschützten Ordner umleiten', t => {
  const modell = join(arbeit, 'modell'), scratch = join(modell, 'scratchpad'), docs = join(modell, 'docs');
  mkdirSync(scratch, { recursive: true }); mkdirSync(docs);
  const link = join(scratch, 'link');
  try { symlinkSync(docs, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(e.code)) { t.skip(`Verknüpfung nicht verfügbar: ${e.code}`); return; } throw e; }
  assert.throws(() => argumente(['--api', '36', '--apk-debug', join(modell, 'probe.apk'), '--ausgabe', join(link, 'lauf')], modell), /scratchpad/);
  assert.equal(existsSync(join(docs, 'lauf')), false);
});

test('Probedaten enthalten feste gültige Kalenderdaten und ausschließlich neutrale Projektangaben', () => {
  assert.ok(Object.isFrozen(PROBEDATEN));
  assert.deepEqual(Object.fromEntries(['kunde', 'projektname', 'vergabenummer'].map(k => [k, PROBEDATEN[k]])), {
    kunde: 'Musterstadt', projektname: 'Beschaffung von IT-Ausstattung', vergabenummer: '2026-0042',
  });
  assert.equal(PROBEDATEN.vergabeordnung, 'vgv'); assert.equal(PROBEDATEN.verfahrensart, 'offen');
  assert.equal(PROBEDATEN.bekanntmachung, '2026-11-02'); assert.equal(PROBEDATEN.bindefristArt, 'tage');
  const daten = Object.entries(PROBEDATEN).filter(([key, value]) => /bekanntmachung|Termin|Start$/.test(key) && value);
  assert.ok(daten.length > 0);
  for (const [key, datum] of daten) {
    assert.match(datum, /^\d{4}-\d{2}-\d{2}$/, key);
    assert.equal(new Date(datum).toISOString().slice(0, 10), datum, key);
  }
  assert.equal(Object.keys(PROBEDATEN).some(k => /person|name|kontakt|email|telefon/i.test(k) && k !== 'projektname'), false);
  for (const key of ['dringlichkeit', 'ortsbegehung', 'teststellungAktiv', 'praesentationAktiv', 'verhandlungRunde1Aktiv', 'verhandlungRunde2Aktiv']) assert.equal(PROBEDATEN[key], false);
});

test('Formulareingabe löst reguläre Ereignisse und Submit aus, ohne den Speicher direkt zu setzen', () => {
  const events = [], daten = { kunde: 'Musterstadt', elektronischeAbgabe: true, bewertungAT: 10 };
  const felder = Object.fromEntries(Object.keys(daten).map(name => [name, { dispatchEvent: e => events.push([name, e.type, e.bubbles]) }]));
  const form = { elements: { namedItem: name => felder[name] }, checkValidity: () => true, requestSubmit: () => events.push('submit') };
  const document = { querySelector: s => { assert.equal(s, '#schedule-form'); return form; }, activeElement: { blur: () => events.push('blur') } };
  class Event { constructor(type, init) { this.type = type; this.bubbles = init.bubbles; } }
  assert.equal(runInNewContext(formularQuelle(daten), { document, Event }), true);
  assert.equal(felder.kunde.value, 'Musterstadt'); assert.equal(felder.elektronischeAbgabe.checked, true); assert.equal(felder.bewertungAT.value, '10');
  assert.deepEqual(events, [...Object.keys(daten).flatMap(k => [[k, 'input', true], [k, 'change', true]]), 'submit', 'blur']);
  form.checkValidity = () => false;
  assert.throws(() => runInNewContext(formularQuelle(daten), { document, Event }), /ungültig/);
  delete felder.kunde;
  assert.throws(() => runInNewContext(formularQuelle(daten), { document, Event }), /Formularfeld fehlt/);
});

function demoProbe(vorher = 'null', { aktiv = '0', fehlerBei, exitFehler = false, restoreFalsch = false } = {}) {
  const zustand = { sysui_demo_allowed: vorher, sysui_tuner_demo_on: aktiv }, calls = [], saved = new Map();
  let exit = false;
  const ctx = { save: (name, value) => saved.set(name, structuredClone(value)), sleep: async () => {}, shell: async command => {
    calls.push(command);
    if (command === fehlerBei) throw new Error('Nachgestellter ADB-Fehler');
    if (command.startsWith('settings get global ')) return restoreFalsch && exit && command.endsWith('sysui_demo_allowed') ? '1' : zustand[command.split(' ').at(-1)];
    if (command.startsWith('settings put global ')) { const a = command.split(' '); zustand[a[3]] = a[4]; return ''; }
    if (command.startsWith('settings delete global ')) { zustand[command.split(' ').at(-1)] = 'null'; return 'Deleted 1 rows'; }
    if (command.startsWith('am broadcast ')) {
      if (command.endsWith('command exit')) { exit = true; if (exitFehler) throw new Error('Demo exit fehlgeschlagen'); }
      return 'Broadcasting: Intent { act=com.android.systemui.demo }\nBroadcast completed: result=0';
    }
    throw new Error(`Unbekannter Befehl: ${command}`);
  } };
  return { ctx, calls, saved, zustand };
}
for (const vorher of ['null', '0', '1']) test(`Demo-Modus bereinigt die Leiste und stellt Ausgangswert ${vorher} wieder her`, async () => {
  const p = demoProbe(vorher);
  assert.equal(await demoModus(p.ctx, async () => { p.calls.push('aufnahme'); return 42; }), 42);
  assert.deepEqual(p.calls.slice(0, 2), ['settings get global sysui_demo_allowed', 'settings get global sysui_tuner_demo_on']);
  assert.deepEqual(p.calls.slice(2, 2 + DEMO_BEFEHLE.length), [...DEMO_BEFEHLE]);
  assert.ok(DEMO_BEFEHLE.some(c => c.includes('command clock --es hhmm 1000')));
  assert.ok(DEMO_BEFEHLE.some(c => c.includes('command battery --es level 100 --es plugged false')));
  assert.ok(DEMO_BEFEHLE.some(c => c.includes('command network --es wifi show --es level 4')));
  assert.ok(DEMO_BEFEHLE.some(c => c.includes('command notifications --es visible false')));
  assert.ok(p.calls.indexOf('aufnahme') < p.calls.findIndex(c => c.endsWith('command exit')));
  assert.ok(p.calls.includes(vorher === 'null' ? 'settings delete global sysui_demo_allowed' : `settings put global sysui_demo_allowed ${vorher}`));
  assert.equal(p.zustand.sysui_demo_allowed, vorher);
  const beleg = p.saved.get('demo-modus.json');
  assert.equal(beleg.vorher.sysui_demo_allowed, vorher); assert.equal(beleg.wiederhergestellt, true);
  assert.equal(beleg.befehle.length, DEMO_BEFEHLE.length); assert.equal(beleg.wiederherstellung.length, 3);
});

for (const fehlerBei of ['arbeit', ...DEMO_BEFEHLE]) test(`Demo-Restore läuft auch bei Fehler in ${fehlerBei}`, async () => {
  const p = demoProbe('null', { fehlerBei }); let gearbeitet = false;
  await assert.rejects(demoModus(p.ctx, async () => { gearbeitet = true; throw new Error('Arbeitsfehler'); }), /Fehler|fehler/);
  assert.equal(gearbeitet, fehlerBei === 'arbeit');
  assert.equal(p.zustand.sysui_demo_allowed, 'null');
  assert.equal(p.saved.get('demo-modus.json').wiederhergestellt, true);
});

test('Aktiver Demo-Modus ist dokumentierte Grenze ohne Änderungen; unlesbarer Zustand ist ungültig', async () => {
  const p = demoProbe('1', { aktiv: '1' });
  await assert.rejects(demoModus(p.ctx, () => assert.fail('Keine Aufnahme')), Grenze);
  assert.ok(p.calls.every(c => c.startsWith('settings get')));
  const kaputt = demoProbe('unbekannt');
  await assert.rejects(demoModus(kaputt.ctx, () => assert.fail()), /nicht lesbar/);
  assert.ok(kaputt.calls.every(c => c.startsWith('settings get')));
});

test('Gescheitertes demo exit verhindert die übrigen Restores nicht und bleibt im Beleg', async () => {
  const p = demoProbe('0', { exitFehler: true });
  await assert.rejects(demoModus(p.ctx, async () => { throw Error('Aufnahmefehler'); }), /Aufnahmefehler.*nicht vollständig wiederhergestellt/);
  assert.equal(p.zustand.sysui_demo_allowed, '0');
  assert.deepEqual(p.saved.get('demo-modus.json').wiederherstellung.map(s => s.ok), [false, true, true]);
});
test('Restore prüft den gelesenen Wert und begrenzt erfolglose Versuche auf drei', async () => {
  const p = demoProbe('null', { restoreFalsch: true });
  await assert.rejects(demoModus(p.ctx, async () => {}), /nicht vollständig wiederhergestellt/);
  assert.equal(p.calls.filter(c => c === 'settings delete global sysui_demo_allowed').length, 3);
  assert.equal(p.saved.get('demo-modus.json').wiederhergestellt, false);
});

// Kleine eigene PNG-Fixture: gültiger Container und komprimierte schwarze RGB-Pixel.
function png({ breite = 1080, hoehe = 2400, filter = 0, gekuerzt = false, pixel = 0 } = {}) {
  const crc = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (typ, data) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(typ, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b; };
  const kopf = Buffer.alloc(13); kopf.writeUInt32BE(breite); kopf.writeUInt32BE(hoehe, 4); kopf[8] = 8; kopf[9] = 2;
  const roh = Buffer.alloc(hoehe * (breite * 3 + 1) - (gekuerzt ? 1 : 0), pixel);
  for (let y = 0; y < hoehe; y++) roh[y * (breite * 3 + 1)] = filter;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', kopf), chunk('IDAT', deflateSync(roh)), chunk('IEND', Buffer.alloc(0))]);
}
const bildBytes = png(), bildHash = hash(bildBytes);
const tabletBytes = png({ hoehe: 1920 });
const bildFuerProfil = profil => profil === 'telefon' ? bildBytes : tabletBytes;
const bildmasse = profil => ({ breite: PROFILE[profil].breite, hoehe: PROFILE[profil].hoehe });
const groessenAntwort = override => `Physical size: 1080x2400${override === null ? '' : `\nOverride size: ${override}`}`;
const dichteAntwort = (override, nativ = 440) => `Physical density: ${nativ}${override === null ? '' : `\nOverride density: ${override}`}`;
test('Native Auflösung und PNG müssen unabhängig 1080 × 2400 bestätigen', () => {
  assert.deepEqual(aufloesung('Physical size: 1080x2400\r\n').wirksam, { breite: 1080, hoehe: 2400 });
  assert.deepEqual(pngPruefen(bildBytes), { breite: 1080, hoehe: 2400 });
  for (const roh of ['', 'Physical size: 2400x1080', 'Physical size: 1080x2400\nOverride size: 540x1200']) assert.throws(() => aufloesung(roh));
  for (const bytes of [Buffer.from('kein PNG'), bildBytes.subarray(0, -3), Buffer.concat([bildBytes, Buffer.from('extra')]), png({ breite: 2400, hoehe: 1080 }), png({ filter: 5 }), png({ gekuerzt: true })]) assert.throws(() => pngPruefen(bytes));
});

for (const [profil, hoehe, override] of [['telefon', 2400, null], ['tablet-7', 1920, 320], ['tablet-10', 1920, 240]]) {
  test(`Auflösung und Dichte prüfen Profil ${profil} mit genau den vorgesehenen Overrides`, () => {
    const groesse = groessenAntwort(profil === 'telefon' ? null : '1080x1920'), dpi = dichteAntwort(override);
    assert.deepEqual(aufloesung(groesse, profil), { roh: groesse, nativ: { breite: 1080, hoehe: 2400 }, wirksam: { breite: 1080, hoehe } });
    assert.deepEqual(dichte(dpi, profil), { roh: dpi, nativ: 440, wirksam: override ?? 440 });
    for (const roh of [groesse.replace('Physical size: 1080x2400', 'Physical size: 1080x1920'), groessenAntwort('1920x1080'),
      groessenAntwort('1080x1921'), `${groesse}\nOverride size: 1080x1920`, `${groesse}\nPhysical size: 1080x2400`, `${groesse}\nunbekannt`]) {
      assert.throws(() => aufloesung(roh, profil), undefined, roh);
    }
    for (const roh of [dpi.replace('Physical density: 440', 'Physical density: 0'), dichteAntwort(241),
      `${dpi}\nOverride density: 320`, `${dpi}\nPhysical density: 440`, `${dpi}\nunbekannt`, 'Physical density: 440\nOverride density: unlesbar']) {
      assert.throws(() => dichte(roh, profil), undefined, roh);
    }
    if (profil === 'telefon') {
      assert.throws(() => aufloesung(groessenAntwort('1080x2400'), profil));
      assert.throws(() => dichte(dichteAntwort(440), profil));
    } else {
      assert.throws(() => aufloesung(groessenAntwort(null), profil));
      assert.throws(() => dichte(dichteAntwort(null), profil));
      assert.throws(() => dichte(dichteAntwort(profil === 'tablet-7' ? 240 : 320), profil));
    }
  });
  test(`PNG-Prüfung verlangt die Bildmaße von ${profil}`, () => {
    assert.deepEqual(pngPruefen(bildFuerProfil(profil), bildmasse(profil)), bildmasse(profil));
    assert.throws(() => pngPruefen(profil === 'telefon' ? tabletBytes : bildBytes, bildmasse(profil)));
    assert.throws(() => pngPruefen(png({ breite: PROFILE[profil].hoehe, hoehe: 1080 }), bildmasse(profil)));
  });
}

test('Anzeigeparser verwerfen unbekannte Profile und unvollständige oder mehrdeutige Zeilen', () => {
  assert.throws(() => aufloesung(groessenAntwort(null), 'unbekannt'));
  assert.throws(() => dichte(dichteAntwort(null), 'unbekannt'));
  for (const roh of ['', 'Override density: 320', 'Physical density: -1', 'Physical density: 1.5', 'Physical density: 440 extra',
    'Physical density: 440\nOverride density:', 'Physical density: 440\nOverride density: 440 extra']) assert.throws(() => dichte(roh));
  for (const roh of ['Override size: 1080x1920', 'Physical size: 1080x2400 extra', 'Physical size: 1080x2400\nOverride size:',
    'Physical size: 1080x2400\nOverride size: 1080x2400 extra']) assert.throws(() => aufloesung(roh));
});

function protokoll(profil = 'telefon') {
  return { schema: 1, art: 'store-screenshots', api: 36, avd: 'fr-api36', profil, erwarteteBildmasse: bildmasse(profil),
    werkzeuge: { node: '22.23.2', adb: 'ADB-Probe', emulator: 'Emulator-Probe' },
    aufloesung: aufloesung(groessenAntwort(profil === 'telefon' ? null : '1080x1920'), profil), dichte: dichte(dichteAntwort(PROFILE[profil].dichte), profil),
    ...(profil === 'telefon' ? {} : { ruecksetzung: { aufloesung: aufloesung(groessenAntwort(null)), dichte: dichte(dichteAntwort(null)) } }),
    apk: { sha256: hash(readFileSync(debug)) }, probedaten: structuredClone(PROBEDATEN),
    dauerMs: 123, befund: [], demo: { wiederhergestellt: true }, bilder: BILDER.map(b => ({ ...b, sha256: hash(bildFuerProfil(profil)), ...bildmasse(profil),
      rollstand: { bestaetigt: true, lage: { x: 0, y: 100 } }, dauerMs: 10 })) };
}
function sicht(p, ergebnis = 'bestanden') {
  const s = sichtvorlage(p.bilder);
  if (ergebnis !== 'Sichtprüfung ausstehend') for (const v of s.pruefungen) Object.assign(v, { ergebnis, wer: 'Prüfperson', wann: '2026-10-18', bemerkung: 'Nachgestellte menschliche Sichtentscheidung.' });
  return s;
}

test('Protokoll und Schema-2-Vorlage bleiben ohne menschlichen Vermerk in Stufe 4', () => {
  const p = protokoll(), s = sichtvorlage(p.bilder), original = JSON.stringify(p);
  assert.equal(s.schema, 2); assert.equal(s.pruefungen.length, 4);
  assert.ok(s.pruefungen.every(v => v.belegart === 'Gerätevollbild' && v.sha256 === bildHash && v.wer === '' && v.wann === '' && v.bemerkung === ''));
  assert.equal(auswertung(p, s).rueckgabewert, 4);
  assert.equal(auswertung(p, sicht(p)).rueckgabewert, 0);
  assert.equal(auswertung(p, sicht(p, 'nicht bestanden')).rueckgabewert, 1);
  assert.equal(JSON.stringify(p), original);
  p.befund.push({ status: 'dokumentierte Grenze', grund: 'Nachgestellte Grenze.' });
  assert.equal(auswertung(p, s).rueckgabewert, 4); assert.equal(auswertung(p, sicht(p)).rueckgabewert, 3);
  p.befund.push({ status: 'ungültig', grund: 'Aufräumen fehlgeschlagen.' });
  assert.equal(auswertung(p, s).rueckgabewert, 2);
});

for (const [name, patch] of [
  ['Schema', p => p.schema = 2], ['AVD', p => p.avd = 'fr-api30'], ['Werkzeugversion', p => delete p.werkzeuge.adb],
  ['fehlendes Profil', p => delete p.profil], ['unbekanntes Profil', p => p.profil = 'tablet-8'],
  ['fehlende erwartete Bildmaße', p => delete p.erwarteteBildmasse], ['fehlende Dichte', p => delete p.dichte],
  ['Auflösung', p => p.aufloesung.wirksam.breite = 540], ['APK-Hash', p => p.apk.sha256 = 'falsch'], ['Probedaten', p => p.probedaten.kunde = 'Andere Organisation'],
  ['Dauer', p => p.dauerMs = -1], ['Demo-Restore', p => p.demo.wiederhergestellt = false], ['fehlendes Bild', p => p.bilder.pop()],
  ['doppeltes Bild', p => p.bilder[1] = p.bilder[0]], ['Bildhash', p => delete p.bilder[0].sha256], ['Bildmaße', p => p.bilder[0].hoehe = 1080],
  ['fehlende Rollruhe', p => p.bilder[0].rollstand.bestaetigt = false], ['fehlender Rollstand', p => delete p.bilder[0].rollstand.lage.y],
]) test(`Protokollfehler ${name} kann auch mit positiver Sichtung nicht bestehen`, () => {
  const p = protokoll(), s = sicht(p); patch(p); assert.equal(auswertung(p, s).rueckgabewert, 2);
});
for (const [name, patch] of [
  ['falsches Schema', s => s.schema = 1], ['fehlender Vermerk', s => s.pruefungen.pop()],
  ['veränderter Hash', s => s.pruefungen[0].sha256 = 'b'.repeat(64)], ['verändertes Kriterium', s => s.pruefungen[0].kriterium = 'anders'],
  ['unbekannter Status', s => s.pruefungen[0].ergebnis = 'gut'], ['fehlende Prüfperson', s => s.pruefungen[0].wer = ''],
  ['ungültiges Datum', s => s.pruefungen[0].wann = '2026-02-30'], ['fehlende Bemerkung', s => s.pruefungen[0].bemerkung = ''],
  ['Steuerzeichen', s => s.pruefungen[0].wer = 'Prüf\nperson'], ['halbfertiger Vermerk', s => s.pruefungen[0].ergebnis = 'Sichtprüfung ausstehend'],
]) test(`Sichtprüfung verwirft ${name}`, () => { const p = protokoll(), s = sicht(p); patch(s); assert.equal(auswertung(p, s).rueckgabewert, 2); });

test('Dokumentierter Abbruch trägt 3, technische Fehler 2; fehlendes Protokoll besteht nie', () => {
  for (const [status, code] of [['dokumentierte Grenze', 3], ['ungültig', 2]]) {
    assert.equal(auswertung({ schema: 1, art: 'store-screenshots', profil: 'telefon', befund: [], abbruch: { status, grund: 'Nachgestellter Abbruch.' } }).rueckgabewert, code);
  }
  for (const p of [null, undefined, {}, false]) assert.equal(auswertung(p).rueckgabewert, 2);
  assert.equal(auswertung({ schema: 1, art: 'store-screenshots', befund: [], abbruch: { status: 'dokumentierte Grenze', grund: 'Nachgestellte Grenze.' } }).rueckgabewert, 2);
});

for (const profil of ['telefon', 'tablet-7', 'tablet-10']) test(`Auswertung bindet Profil ${profil} an native und wirksame Anzeige, Dichte und Bildmaße`, () => {
  const p = protokoll(profil); assert.equal(auswertung(p, sicht(p)).rueckgabewert, 0);
  for (const patch of [
    p => delete p.profil, p => p.profil = profil === 'telefon' ? 'tablet-7' : 'telefon',
    p => p.bilder[0].hoehe = profil === 'telefon' ? 1920 : 2400,
    p => p.erwarteteBildmasse.hoehe = profil === 'telefon' ? 1920 : 2400,
    p => p.aufloesung.nativ.hoehe = 1920, p => p.aufloesung.wirksam.hoehe = profil === 'telefon' ? 1920 : 2400,
    p => p.aufloesung.roh = groessenAntwort('1920x1080'), p => p.dichte.nativ = 441, p => p.dichte.wirksam = 441,
    p => p.dichte.roh = dichteAntwort(241),
  ]) {
    const falsch = protokoll(profil), s = sicht(falsch); patch(falsch);
    assert.equal(auswertung(falsch, s).rueckgabewert, 2, JSON.stringify(falsch));
  }
  const abbruch = protokoll(profil); abbruch.bilder[0].hoehe = 1;
  abbruch.abbruch = { status: 'dokumentierte Grenze', grund: 'Nachgestellte Grenze.' };
  assert.equal(auswertung(abbruch).rueckgabewert, 2);
});

for (const profil of ['tablet-7', 'tablet-10']) test(`Auswertung von ${profil} verlangt widerspruchsfreie Belege beider Rücksetzungen`, () => {
  for (const patch of [
    p => delete p.ruecksetzung, p => delete p.ruecksetzung.aufloesung, p => delete p.ruecksetzung.dichte,
    p => p.ruecksetzung.aufloesung = p.aufloesung, p => p.ruecksetzung.dichte = p.dichte,
    p => p.ruecksetzung.dichte = dichte(dichteAntwort(null, 441)), p => p.ruecksetzung.dichte.wirksam = 441,
    p => p.ruecksetzung.aufloesung.wirksam.hoehe = 1920,
  ]) {
    const p = protokoll(profil); patch(p); assert.equal(auswertung(p, sicht(p)).rueckgabewert, 2, JSON.stringify(p));
  }
});

test('Neuauswertung bindet die Sichtentscheidung an unveränderte PNG- und Demo-Belege', () => {
  const ordner = join(arbeit, 'neuauswertung'); mkdirSync(ordner);
  const p = protokoll(), roh = JSON.stringify(p);
  writeFileSync(join(ordner, 'protokoll.json'), roh); writeFileSync(join(ordner, 'demo-modus.json'), JSON.stringify(p.demo));
  writeFileSync(join(ordner, 'sichtpruefung.json'), JSON.stringify(sicht(p)));
  for (const b of BILDER) writeFileSync(join(ordner, b.bild), bildBytes);
  assert.equal(nachauswerten(ordner).rueckgabewert, 0); assert.equal(readFileSync(join(ordner, 'protokoll.json'), 'utf8'), roh);
  writeFileSync(join(ordner, BILDER[0].bild), png({ pixel: 1 }));
  assert.throws(() => nachauswerten(ordner), /prüfsumme/i);
  writeFileSync(join(ordner, BILDER[0].bild), bildBytes); writeFileSync(join(ordner, 'demo-modus.json'), '{}');
  assert.throws(() => nachauswerten(ordner), /Demo-Beleg verändert/);
});

for (const profil of ['telefon', 'tablet-7', 'tablet-10']) test(`Neuauswertung prüft die PNG-Dateien gegen Profil ${profil}`, () => {
  const ordner = mkdtempSync(join(arbeit, 'neuauswertung-profil-')), p = protokoll(profil), bytes = bildFuerProfil(profil);
  const speichern = () => {
    writeFileSync(join(ordner, 'protokoll.json'), JSON.stringify(p));
    writeFileSync(join(ordner, 'sichtpruefung.json'), JSON.stringify(sicht(p)));
  };
  speichern(); writeFileSync(join(ordner, 'demo-modus.json'), JSON.stringify(p.demo));
  for (const b of BILDER) writeFileSync(join(ordner, b.bild), bytes);
  assert.equal(nachauswerten(ordner).rueckgabewert, 0);
  const fremd = profil === 'telefon' ? tabletBytes : bildBytes;
  writeFileSync(join(ordner, BILDER[0].bild), fremd); p.bilder[0].sha256 = hash(fremd); speichern();
  assert.throws(() => nachauswerten(ordner), /PNG/);
  writeFileSync(join(ordner, BILDER[0].bild), bytes); p.bilder[0].sha256 = hash(bytes); delete p.profil; speichern();
  assert.throws(() => nachauswerten(ordner), /Profil/);
});

for (const profil of ['tablet-7', 'tablet-10']) test(`Abgebrochene Teilaufnahme von ${profil} bleibt an Profil, Dichte und tatsächliche PNG-Datei gebunden`, () => {
  const ordner = mkdtempSync(join(arbeit, 'teilaufnahme-')), p = protokoll(profil);
  p.bilder = p.bilder.slice(0, 1); p.abbruch = { status: 'dokumentierte Grenze', grund: 'Nachgestellte Grenze nach dem ersten Bild.' };
  const speichern = () => writeFileSync(join(ordner, 'protokoll.json'), JSON.stringify(p));
  speichern(); writeFileSync(join(ordner, BILDER[0].bild), tabletBytes);
  assert.equal(auswertung(p).rueckgabewert, 3); assert.equal(nachauswerten(ordner).rueckgabewert, 3);
  for (const patch of [p => p.dichte.wirksam = 441, p => delete p.dichte, p => p.bilder[0].bild = BILDER[1].bild,
    p => p.bilder.push(p.bilder[0]), p => p.aufloesung.wirksam.hoehe = 2400]) {
    const falsch = structuredClone(p); patch(falsch); assert.equal(auswertung(falsch).rueckgabewert, 2);
  }
  writeFileSync(join(ordner, BILDER[0].bild), bildBytes); p.bilder[0].sha256 = bildHash; speichern();
  assert.throws(() => nachauswerten(ordner), /PNG/);
  // Reguläre einzelne Probedatei im eigens angelegten Laufordner entfernen.
  rmSync(join(ordner, BILDER[0].bild));
  assert.throws(() => nachauswerten(ordner), /ENOENT/);
  writeFileSync(join(ordner, BILDER[0].bild), tabletBytes); p.bilder = []; speichern();
  assert.throws(() => nachauswerten(ordner), /prüfsumme/i);
});

function laufProbe({ screenshotFehler = false, appVorhanden = false, avd = 'fr-api36', dumpCode = 0, signalBeiUhr = false,
  nachherVerdeckt = false, nachherBewegt = false, nachherVersetzt = false, pfadAntwort, apkFremd = false,
  profil = 'telefon', groesseVorher = null, dichteVorher = null, groesseNachSetzen = '1080x1920', dichteNachSetzen = PROFILE[profil].dichte,
  fehlerBeimSetzen, signalBeimSetzen, resetFehler, resetGroesseFalsch = false, resetDichteFalsch = false, nativeDichteNachReset = 440,
  anzeigeAntwort, alteAnzeigeProben = 0, falscheBildmasse = false } = {}) {
  const ausgabe = mkdtempSync(join(arbeit, 'emulator-')), calls = [], urls = [], cdpCalls = [], pausen = [];
  let screencaps = 0, verdecktGeliefert = false, bewegtGeliefert = false, nachherScrollAufrufe = 0;
  let groessenOverride = groesseVorher, dichteOverride = dichteVorher, nativeDichte = 440, anzeigeProben = 0;
  const settings = new Map([['system font_scale', '1.3'], ['system accelerometer_rotation', '1'], ['system user_rotation', '1'], ['system time_12_24', 'null'],
    ['global sysui_demo_allowed', 'null'], ['global sysui_tuner_demo_on', '0']]);
  let installiert = appVorhanden, geschlossen = false, nacht = 'yes';
  const ok = out => ({ code: 0, out, err: '' });
  const run = async (exe, argv, options) => {
    calls.push({ exe, argv, options });
    assert.equal(options.env.TEMP, join(ausgabe, 'tmp')); assert.equal(options.env.TMP, options.env.TEMP);
    if (exe.endsWith('emulator.exe')) { assert.deepEqual(argv, ['-version']); return ok('Android emulator version 36.2.12'); }
    if (exe.endsWith('aapt2.exe')) return ok(argv[1] === 'packagename' ? APP : 'application-debuggable');
    if (argv[0] === 'version') return ok('Android Debug Bridge version 1.0.41');
    assert.deepEqual(argv.slice(0, 2), ['-s', 'emulator-5554']); const a = argv.slice(2);
    if (a.join(' ') === 'emu avd name') return ok(`${avd}\r\r\nOK\r\r\n`);
    if (a[0] === 'install') { installiert = true; return ok('Success'); }
    if (a[0] === 'uninstall') { installiert = false; return ok('Success'); }
    if (a[0] === 'forward') return ok(a[1] === '--remove' ? '' : '32123');
    if (a[0] === 'exec-out') {
      if (a[1] === 'cat') return ok(apkFremd ? Buffer.from('Fremde Bytes, nicht die eigene APK.') : readFileSync(debug));
      assert.deepEqual(a, ['exec-out', 'screencap', '-p']); assert.equal(options.binary, true);
      screencaps++;
      const bytes = falscheBildmasse ? bildFuerProfil(profil === 'telefon' ? 'tablet-7' : 'telefon') : bildFuerProfil(profil);
      return screenshotFehler ? { code: 1, out: Buffer.alloc(0), err: 'Nachgestellter Aufnahmefehler' } : ok(bytes);
    }
    assert.equal(a[0], 'shell'); const command = a[1];
    if (command === 'wm size') return ok(groessenAntwort(groessenOverride));
    if (command === 'wm density') return ok(dichteAntwort(dichteOverride, nativeDichte));
    if (command === 'wm size 1080x1920' || /^wm density (?:320|240)$/.test(command)) {
      const art = command.split(' ')[1];
      assert.notEqual(profil, 'telefon');
      if (art === 'size') groessenOverride = groesseNachSetzen;
      else { assert.equal(command, `wm density ${PROFILE[profil].dichte}`); dichteOverride = dichteNachSetzen; }
      if (signalBeimSetzen === art) process.emit('SIGINT');
      return fehlerBeimSetzen === art ? { code: 1, out: '', err: 'Nachgestellter Setzfehler nach der Zustandsänderung.' } : ok('');
    }
    if (command === 'wm size reset' || command === 'wm density reset') {
      const art = command.split(' ')[1];
      if (resetFehler === art) return { code: 1, out: '', err: 'Nachgestellter Rücksetzfehler.' };
      if (art === 'size' && !resetGroesseFalsch) groessenOverride = null;
      if (art === 'density') { if (!resetDichteFalsch) dichteOverride = null; nativeDichte = nativeDichteNachReset; }
      return ok('');
    }
    if (command === 'dumpsys window') {
      const cur = !installiert && ++anzeigeProben <= alteAnzeigeProben ? '1080x2400' : groessenOverride ?? '1080x2400';
      const geometrie = !installiert && anzeigeAntwort !== undefined ? anzeigeAntwort
        : `  Display: mDisplayId=0 (organized)\n    init=1080x2400 440dpi mMinSizeOfResizeableTaskDp=220 cur=${cur} app=${cur}\n    deferred=false mLayoutNeeded=false`;
      return ok(`${geometrie}\n  mCurrentFocus=Window{2 u0 ${APP}/.MainActivity}`);
    }
    if (command.startsWith('settings get ')) return ok(settings.get(command.slice(13)) ?? '0');
    if (command.startsWith('settings put ')) { const s = command.slice(13).split(' '); settings.set(s.slice(0, 2).join(' '), s[2]); return ok(''); }
    if (command.startsWith('settings delete ')) { settings.set(command.slice(16), 'null'); return ok('Deleted 1 rows'); }
    if (command.startsWith('am broadcast ')) {
      if (signalBeiUhr && command.includes('command clock')) process.emit('SIGINT');
      return ok('Broadcast completed: result=0');
    }
    if (command === 'cmd uimode night') return ok(`Night mode: ${nacht}`);
    if (command.startsWith('cmd uimode night ')) { nacht = command.split(' ').at(-1); return ok(`Night mode: ${nacht}`); }
    if (command.startsWith('am start ')) return ok('Status: ok');
    if (command === `pm list packages ${APP}`) return ok(installiert ? `package:${APP}` : '');
    // Pfadform von Android 11 und neuer, mit Tilden und Gleichheitszeichen wie im Emulator fr-api36 beobachtet.
    if (command === `pm path ${APP}`) return ok(installiert ? (pfadAntwort ?? `package:/data/app/~~Probe0123456789ABCDEFGHIJ==/${APP}-ProbeKLMNOPQRSTUVWXYZ0123==/base.apk`) : '');
    if (command === `pidof ${APP}`) return ok('1234');
    if (command === 'cat /proc/net/unix') return ok('Num RefCount Protocol Flags Type St Inode Path\n0 2 0 10000 1 01 42 @webview_devtools_remote_1234');
    if (command.startsWith('uiautomator dump ')) return { code: dumpCode, out: '', err: dumpCode === 137 ? 'Killed' : '' };
    if (command.startsWith('rm -f /data/local/tmp/')) return ok('');
    if (command.startsWith('cat /data/local/tmp/')) return ok(`<hierarchy rotation="0"><node class="android.webkit.WebView" package="${APP}" bounds="[0,60][1080,2340]" /></hierarchy>`);
    const antworten = { 'getprop ro.kernel.qemu': '1', 'getprop ro.build.version.sdk': '36', 'getprop sys.boot_completed': '1',
      'getprop ro.build.fingerprint': 'probe/fingerprint', 'dumpsys webviewupdate': 'WebView-Probe', 'getprop persist.sys.locale': 'de-DE',
      'getprop persist.sys.timezone': 'Europe/Berlin', date: 'Sun Oct 18 10:00:00 CEST 2026', 'dumpsys activity activities': `topResumedActivity=ActivityRecord{1 ${APP}/.MainActivity}`,
      'dumpsys input_method': 'mInputShown=false mWindowVisible=false mDecorViewVisible=false' };
    assert.ok(Object.hasOwn(antworten, command), `Unerwarteter Shell-Befehl: ${command}`); return ok(antworten[command]);
  };
  const c = { close: () => { geschlossen = true; }, send: async method => { cdpCalls.push(method); assert.equal(method, 'Runtime.enable'); }, evaluate: async expression => {
    cdpCalls.push(expression);
    if (expression === MESSUNG) return { hidden: false, sheet: { width: 360, height: 600 }, anzahl: 8, liste: { scrollTop: 0 } };
    if (expression === scrollruheQuelle) {
      const ruhig = { x: 0, y: 100, breite: 393, hoehe: 5000, zeit: 1, offen: 0 };
      if (screencaps === 1) nachherScrollAufrufe++;
      // Genau einmal nach der ersten Aufnahme: Bewegung, die zur Ausgangslage zurückkehrt.
      if (nachherBewegt && screencaps === 1 && !bewegtGeliefert) { bewegtGeliefert = true; return { bestaetigt: true, proben: [{ ...ruhig, y: 90 }, { ...ruhig, y: 95 }, ...Array(7).fill(ruhig)] }; }
      // Bewegung zwischen zwei Messungen: die zweite Messung nach der Aufnahme ist in sich ruhig, aber versetzt.
      if (nachherVersetzt && screencaps === 1 && nachherScrollAufrufe === 2) return { bestaetigt: true, proben: Array(7).fill({ ...ruhig, y: 90 }) };
      return { bestaetigt: true, proben: Array(7).fill(ruhig) };
    }
    if (expression.includes('window.scrollTo(')) return 100;
    if (expression.includes('innereRollstaende:')) {
      const lage = { x: 0, y: 100, breite: 393, hoehe: 850, dichte: 2.75, dokumentHoehe: 5000,
        anker: { x: 0, y: 60, breite: 380, hoehe: 100 }, bodyTop: '', menueUnterkante: 56, innereRollstaende: [{ x: 0, y: 0 }] };
      // Genau eine verdeckte Probe direkt nach der ersten Aufnahme; danach wieder ruhig.
      if (nachherVerdeckt && screencaps === 1 && !verdecktGeliefert) { verdecktGeliefert = true; return { ...lage, anker: { ...lage.anker, y: 0 } }; }
      return lage;
    }
    if (expression.includes('stoerungen=')) return { werte: Object.fromEntries(Object.entries(PROBEDATEN).map(([k, v]) => [k, typeof v === 'boolean' ? v : String(v)])),
      stoerungen: [], ergebnisSichtbar: true, zeilen: 11, meldung: 'Terminplan aktualisiert.', speicher: 'Zuletzt automatisch gespeichert: gerade eben.' };
    return true;
  } };
  return { ausgabe, calls, cdpCalls, settings, urls, pausen, get geschlossen() { return geschlossen; }, get installiert() { return installiert; },
    get anzeige() { return { groessenOverride, dichteOverride, nativeDichte, anzeigeProben }; },
    start: () => lauf({ api: 36, debug, ausgabe, profil }, { run, sleep: async ms => { pausen.push(ms); }, connect: async url => { urls.push(url); return c; },
      getJson: async url => { urls.push(url); return [{ id: 'probe_1', type: 'page', url: 'https://localhost/', webSocketDebuggerUrl: 'ws://fremdes-ziel.invalid/' }]; } }) };
}

test('Nachgestellter Lauf erzeugt vier native Bilder mit Protokoll und räumt seine Installation auf', async () => {
  const p = laufProbe(), e = await p.start(); assert.equal(e.rueckgabewert, 4, JSON.stringify(e));
  const prot = JSON.parse(readFileSync(join(p.ausgabe, 'protokoll.json'), 'utf8'));
  assert.equal(prot.bilder.length, 4); assert.equal(prot.apk.sha256, hash(readFileSync(debug)));
  assert.equal(prot.avd, 'fr-api36'); assert.equal(prot.demo.wiederhergestellt, true);
  assert.ok(prot.bilder.every(b => b.sha256 === bildHash && b.rollstand.bestaetigt && b.rollstand.proben.length === 3 && b.dauerMs >= 0));
  assert.equal(p.calls.filter(c => c.argv.includes('screencap')).length, 4);
  assert.ok(p.cdpCalls.every(c => !c.includes('Page.captureScreenshot')));
  assert.deepEqual(p.urls, ['http://127.0.0.1:32123/json/list', 'ws://127.0.0.1:32123/devtools/page/probe_1']);
  assert.equal(p.geschlossen, true); assert.equal(p.installiert, false);
  assert.equal(p.settings.get('system font_scale'), '1.3'); assert.equal(p.settings.get('system time_12_24'), 'null');
  assert.ok(prot.aufraeumen.every(s => s.ok)); assert.equal(nachauswerten(p.ausgabe).rueckgabewert, 4);
  assert.equal(prot.profil, 'telefon'); assert.deepEqual(prot.erwarteteBildmasse, { breite: 1080, hoehe: 2400 });
  assert.equal(p.calls.some(c => c.argv.some(a => /^wm (?:size|density) /.test(a))), false);
});

const shellBefehle = p => p.calls.filter(c => c.argv[2] === 'shell').map(c => c.argv[3]);
const leseProtokoll = p => JSON.parse(readFileSync(join(p.ausgabe, 'protokoll.json'), 'utf8'));

for (const profil of ['tablet-7', 'tablet-10']) test(`Nachgestellter Lauf ${profil} setzt beide Overrides vor der Installation und bestätigt beide Resets`, async () => {
  const p = laufProbe({ profil }), e = await p.start(); assert.equal(e.rueckgabewert, 4, JSON.stringify(e));
  const prot = leseProtokoll(p), befehle = shellBefehle(p), install = p.calls.findIndex(c => c.argv.includes('install'));
  assert.equal(prot.profil, profil); assert.deepEqual(prot.erwarteteBildmasse, { breite: 1080, hoehe: 1920 });
  assert.deepEqual(prot.aufloesung, aufloesung(groessenAntwort('1080x1920'), profil));
  assert.deepEqual(prot.dichte, dichte(dichteAntwort(PROFILE[profil].dichte), profil));
  assert.deepEqual(prot.ruecksetzung, { aufloesung: aufloesung(groessenAntwort(null)), dichte: dichte(dichteAntwort(null)) });
  assert.ok(prot.bilder.every(b => b.breite === 1080 && b.hoehe === 1920 && b.sha256 === hash(tabletBytes)));
  for (const befehl of ['wm size 1080x1920', `wm density ${PROFILE[profil].dichte}`]) {
    const i = p.calls.findIndex(c => c.argv.includes(befehl)); assert.ok(i >= 0 && i < install, befehl);
    assert.equal(befehle.filter(b => b === befehl).length, 1);
  }
  assert.ok(befehle.indexOf('wm density') < befehle.findIndex(b => b.startsWith('settings put ')));
  assert.ok(befehle.indexOf('wm size') < befehle.indexOf('wm density'));
  assert.ok(befehle.indexOf('wm density reset') < befehle.indexOf('wm size reset'));
  for (const art of ['size', 'density']) assert.equal(befehle[befehle.indexOf(`wm ${art} reset`) + 1], `wm ${art}`);
  assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null); assert.equal(p.anzeige.nativeDichte, 440);
  assert.ok(p.pausen.filter(ms => ms === 200).length >= 2); assert.ok(prot.aufraeumen.every(s => s.ok));
  assert.equal(nachauswerten(p.ausgabe).rueckgabewert, 4);
});

for (const profil of ['telefon', 'tablet-7', 'tablet-10']) test(`Fremde Overrides vor ${profil} sind eine Grenze ohne Änderungen`, async () => {
  for (const override of [{ groesseVorher: '720x1280' }, { groesseVorher: '1080x2400' }, { groesseVorher: '1080x1920' },
    { dichteVorher: 440 }, { dichteVorher: 320 }, { groesseVorher: '1080x1920', dichteVorher: 240 }]) {
    const p = laufProbe({ profil, ...override }), e = await p.start(); assert.equal(e.rueckgabewert, 3, JSON.stringify(e));
    assert.equal(leseProtokoll(p).abbruch.status, 'dokumentierte Grenze');
    assert.ok(shellBefehle(p).includes('wm size')); assert.ok(shellBefehle(p).includes('wm density'));
    assert.equal(shellBefehle(p).some(b => /^(?:wm (?:size|density) |settings (?:put|delete) |am |cmd uimode night )/.test(b)), false);
    assert.equal(p.calls.some(c => c.argv.includes('install') || c.argv.includes('uninstall')), false);
    assert.equal(p.anzeige.groessenOverride, override.groesseVorher ?? null);
    assert.equal(p.anzeige.dichteOverride, override.dichteVorher ?? null);
  }
});

for (const profil of ['tablet-7', 'tablet-10']) test(`Fehlende oder falsche Overrides nach dem Setzen machen ${profil} ungültig`, async () => {
  for (const falsch of [{ groesseNachSetzen: null }, { groesseNachSetzen: '1080x2400' }, { groesseNachSetzen: '1080x1921' },
    { dichteNachSetzen: null }, { dichteNachSetzen: 440 }, { dichteNachSetzen: profil === 'tablet-7' ? 240 : 320 }]) {
    const p = laufProbe({ profil, ...falsch }), e = await p.start(); assert.equal(e.rueckgabewert, 2, JSON.stringify(e));
    assert.equal(p.calls.some(c => c.argv.includes('install')), false);
    for (const art of ['size', 'density']) assert.ok(shellBefehle(p).includes(`wm ${art} reset`));
    assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null);
  }
});

for (const profil of ['tablet-7', 'tablet-10']) test(`Aufnahmefehler nach der Umstellung setzt ${profil} vollständig zurück`, async () => {
  const p = laufProbe({ profil, screenshotFehler: true }), e = await p.start(); assert.equal(e.rueckgabewert, 2);
  for (const art of ['size', 'density']) assert.ok(shellBefehle(p).includes(`wm ${art} reset`));
  assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null); assert.equal(p.installiert, false);
  assert.ok(leseProtokoll(p).aufraeumen.every(s => s.ok));
});

for (const art of ['size', 'density']) {
  test(`Fehler während wm ${art} nach einer Zustandsänderung führt den bereits registrierten Reset aus`, async () => {
    const p = laufProbe({ profil: 'tablet-7', fehlerBeimSetzen: art }), e = await p.start(); assert.equal(e.rueckgabewert, 2);
    assert.ok(shellBefehle(p).includes(`wm ${art} reset`));
    assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null);
    assert.equal(p.calls.some(c => c.argv.includes('install')), false);
  });
  test(`Signal während wm ${art} lässt die Rücksetzungen ohne abgebrochenes Prozesssignal laufen`, async () => {
    const vorher = process.listenerCount('SIGINT'), p = laufProbe({ profil: 'tablet-10', signalBeimSetzen: art }), e = await p.start();
    assert.equal(e.rueckgabewert, 2); assert.equal(process.listenerCount('SIGINT'), vorher);
    const reset = p.calls.findIndex(c => c.argv.includes(`wm ${art} reset`)); assert.ok(reset > 0);
    assert.ok(p.calls.slice(reset).every(c => c.options.signal === undefined));
    assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null);
    assert.equal(p.calls.some(c => c.argv.includes('install')), false);
  });
}

for (const profil of ['tablet-7', 'tablet-10']) test(`Unbestätigte Rücksetzungen machen ${profil} trotz vier Bildern ungültig`, async () => {
  for (const falsch of [{ resetGroesseFalsch: true }, { resetDichteFalsch: true }, { nativeDichteNachReset: 441 },
    { resetFehler: 'density' }, { resetFehler: 'size' }]) {
    const p = laufProbe({ profil, ...falsch }), e = await p.start(); assert.equal(e.rueckgabewert, 2, JSON.stringify(e));
    const prot = leseProtokoll(p); assert.equal(prot.bilder.length, 4);
    assert.ok(prot.aufraeumen.some(s => s.ok === false));
    for (const art of ['size', 'density']) assert.ok(shellBefehle(p).includes(`wm ${art} reset`));
    assert.equal(nachauswerten(p.ausgabe).rueckgabewert, 2);
  }
});

test('Anzeigeumstellung wartet auf drei gültige Display-0-Proben nach vorübergehend alter Größe', async () => {
  const p = laufProbe({ profil: 'tablet-7', alteAnzeigeProben: 2 }), e = await p.start(); assert.equal(e.rueckgabewert, 4, JSON.stringify(e));
  const vorInstallation = p.calls.slice(0, p.calls.findIndex(c => c.argv.includes('install')));
  assert.equal(vorInstallation.filter(c => c.argv.includes('dumpsys window')).length, 5);
  assert.ok(p.pausen.filter(ms => ms === 200).length >= 4);
});

for (const [name, anzeigeAntwort] of [
  ['dauerhaft alte Größe', 'Display: mDisplayId=0 (organized)\n  init=1080x2400 440dpi cur=1080x2400'],
  ['nur Display 1', 'Display: mDisplayId=1 (organized)\n  init=1080x2400 440dpi cur=1080x1920'],
  ['passendes Display 1 neben falschem Display 0', 'Display: mDisplayId=0 (organized)\n  init=1080x2400 440dpi cur=1080x2400\nDisplay: mDisplayId=1 (organized)\n  init=1080x2400 440dpi cur=1080x1920'],
  ['doppelte Display-0-Blöcke', 'Display: mDisplayId=0 (organized)\n  init=1080x2400 440dpi cur=1080x1920\nDisplay: mDisplayId=0 (organized)\n  init=1080x2400 440dpi cur=1080x1920'],
  ['mehrere cur-Angaben', 'Display: mDisplayId=0 (organized)\n  init=1080x2400 440dpi cur=1080x2400 cur=1080x1920'],
  ['fehlende Displaygeometrie', ''],
]) test(`Anzeigeumstellung verwirft ${name} und setzt beide Overrides zurück`, async () => {
  const p = laufProbe({ profil: 'tablet-10', anzeigeAntwort }), e = await p.start(); assert.equal(e.rueckgabewert, 2, JSON.stringify(e));
  assert.equal(p.calls.some(c => c.argv.includes('install')), false);
  assert.equal(shellBefehle(p).filter(c => c === 'dumpsys window').length, 20);
  assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null);
});

for (const profil of ['telefon', 'tablet-7', 'tablet-10']) test(`Lauf ${profil} verwirft nicht zum Profil passende screencap-Maße`, async () => {
  const p = laufProbe({ profil, falscheBildmasse: true }), e = await p.start(); assert.equal(e.rueckgabewert, 2);
  assert.equal(leseProtokoll(p).bilder.length, 0); assert.equal(existsSync(join(p.ausgabe, BILDER[0].bild)), false);
  assert.equal(p.anzeige.groessenOverride, null); assert.equal(p.anzeige.dichteOverride, null);
});

test('Aufnahmefehler liefert 2 und stellt Demo, Einstellungen, Weiterleitung und Paket zurück', async () => {
  const p = laufProbe({ screenshotFehler: true }), e = await p.start(); assert.equal(e.rueckgabewert, 2);
  assert.equal(p.installiert, false); assert.equal(p.geschlossen, true);
  assert.equal(p.settings.get('global sysui_demo_allowed'), 'null'); assert.equal(p.settings.get('system font_scale'), '1.3');
  assert.ok(p.calls.some(c => c.argv.includes('--remove')));
  assert.equal(existsSync(join(p.ausgabe, 'sichtpruefung.json')), false);
});
test('UIAutomator-Code 137 bleibt mit vollständigem lesbarem Ansichtsbaum auswertbar', async () => {
  const p = laufProbe({ dumpCode: 137 }), e = await p.start(); assert.equal(e.rueckgabewert, 4, JSON.stringify(e));
  assert.equal(p.calls.filter(c => c.argv.some(a => a.startsWith('uiautomator dump '))).length, 4);
  assert.equal(p.installiert, false);
});
test('Signalabbruch lässt Demo- und Einstellungs-Restore ohne abgebrochenes Prozesssignal zu', async () => {
  const vorher = process.listenerCount('SIGINT'), p = laufProbe({ signalBeiUhr: true }), e = await p.start();
  assert.equal(e.rueckgabewert, 2); assert.equal(process.listenerCount('SIGINT'), vorher);
  assert.equal(p.settings.get('global sysui_demo_allowed'), 'null'); assert.equal(p.settings.get('system font_scale'), '1.3');
  const exit = p.calls.findIndex(c => c.argv.some(a => a.endsWith('command exit')));
  assert.ok(exit > 0); assert.ok(p.calls.slice(exit).every(c => c.options.signal === undefined));
  assert.equal(p.calls.some(c => c.argv.includes('install')), false);
  const beleg = JSON.parse(readFileSync(join(p.ausgabe, 'demo-modus.json'), 'utf8'));
  assert.equal(beleg.wiederhergestellt, true);
});
for (const [name, o, muster] of [
  ['verdeckter Anker', { nachherVerdeckt: true }, /ungültig oder Anker verdeckt/],
  ['Bewegung mit Rückkehr zur Ausgangslage', { nachherBewegt: true }, /Bewegung nach der Aufnahme/],
  ['Versatz zwischen zwei Messungen', { nachherVersetzt: true }, /Bewegung nach der Aufnahme/],
]) test(`Nachprobe direkt nach der Aufnahme verwirft das Bild bei ${name}`, async () => {
  const p = laufProbe(o), e = await p.start(); assert.equal(e.rueckgabewert, 2, JSON.stringify(e));
  const prot = JSON.parse(readFileSync(join(p.ausgabe, 'protokoll.json'), 'utf8'));
  assert.equal(prot.bilder.length, 0); assert.match(prot.abbruch.grund, muster); assert.match(prot.abbruch.grund, /nach der Aufnahme/);
  assert.ok(Array.isArray(prot.abbruchProben) && prot.abbruchProben.length >= 1 && prot.abbruchProben.at(-1).ungueltig === true);
  assert.equal(existsSync(join(p.ausgabe, BILDER[0].bild)), false);
  assert.equal(p.installiert, false); assert.ok(prot.aufraeumen.every(s => s.ok));
});
for (const [name, o] of [
  ['Elternpfad', { pfadAntwort: 'package:/data/app/../fremd/base.apk' }],
  ['Leerzeichen', { pfadAntwort: 'package:/data/app/mit Leerzeichen/base.apk' }],
  ['mehreren Pfaden', { pfadAntwort: 'package:/data/app/a/base.apk\npackage:/data/app/b/base.apk' }],
  ['fremder Prüfsumme', { apkFremd: true }],
]) test(`Aufräumen deinstalliert nicht bei ${name}`, async () => {
  const p = laufProbe(o), e = await p.start(); assert.equal(e.rueckgabewert, 2, JSON.stringify(e));
  assert.equal(p.installiert, true); assert.equal(p.calls.some(c => c.argv.includes('uninstall')), false);
  const prot = JSON.parse(readFileSync(join(p.ausgabe, 'protokoll.json'), 'utf8'));
  assert.equal(prot.bilder.length, 4);
  assert.ok(prot.aufraeumen.some(s => s.name === 'Eigene Debug-Installation entfernen' && !s.ok));
});

const ruhigeScrollprobe = { x: 0, y: 100, breite: 393, hoehe: 5000, zeit: 1, offen: 0 };
function layoutProbe(lagen, { scroll = { bestaetigt: true, proben: Array(7).fill(ruhigeScrollprobe) } } = {}) {
  const grund = { x: 0, y: 100, breite: 393, hoehe: 850, dichte: 2.75, dokumentHoehe: 5000, anker: { x: 0, y: 60, breite: 380, hoehe: 100 }, bodyTop: '', menueUnterkante: 56, innereRollstaende: [] };
  const warteschlange = lagen.map(l => (typeof l === 'function' ? l(grund) : { ...grund, ...l }));
  let scrollAufrufe = 0;
  return { evaluate: async expression => {
    if (expression === scrollruheQuelle) return typeof scroll === 'function' ? scroll(++scrollAufrufe) : scroll;
    if (typeof expression === 'string' && expression.includes('innereRollstaende:')) { assert.ok(warteschlange.length, 'Keine Probe mehr vorgesehen'); return warteschlange.shift(); }
    return true;
  } };
}
const verdeckt = g => ({ ...g, anker: { ...g.anker, y: 0 } });
test('Layoutruhe vor der Aufnahme übergeht Zwischenproben und bestätigt erst drei gleiche gültige in Folge', async () => {
  const r = await layoutruhe(layoutProbe([verdeckt, {}, {}, {}]), '#schedule-form');
  assert.equal(r.bestaetigt, true); assert.equal(r.proben.length, 4); assert.equal(r.proben[0].ungueltig, true); assert.equal(r.lage.anker.y, 60);
  const r2 = await layoutruhe(layoutProbe([{}, {}, verdeckt, {}, {}, {}]), '#schedule-form');
  assert.deepEqual(r2.proben.map(p => p.stabil), [1, 2, 0, 1, 2, 3]);
  const r3 = await layoutruhe(layoutProbe([{ y: 90 }, {}, {}, {}]), '#schedule-form');
  assert.deepEqual(r3.proben.map(p => p.stabil), [1, 1, 2, 3]); assert.equal(r3.lage.y, 100);
});
test('Layoutruhe nach der Aufnahme verwirft jede ungültige Probe und jede beobachtete Bewegung sofort', async () => {
  await assert.rejects(layoutruhe(layoutProbe([verdeckt, {}, {}, {}]), '#schedule-form', { streng: true }), e => { assert.match(e.message, /nach der Aufnahme/); assert.equal(e.proben.length, 1); return true; });
  // Gültige äußere Zwischenlage, die zur Ausgangslage zurückkehrt.
  await assert.rejects(layoutruhe(layoutProbe([{ y: 90 }, {}, {}, {}]), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  // Bewegung nur innerhalb der Scrollruhe-Einzelbilder, Endlage unverändert.
  const bewegt = { bestaetigt: true, proben: [{ ...ruhigeScrollprobe, y: 90 }, { ...ruhigeScrollprobe, y: 95 }, ...Array(7).fill(ruhigeScrollprobe)] };
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: bewegt }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  const offen = { bestaetigt: true, proben: [{ ...ruhigeScrollprobe, offen: 1 }, ...Array(7).fill(ruhigeScrollprobe)] };
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: offen }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: { bestaetigt: true } }), '#schedule-form', { streng: true }), /nach der Aufnahme/);
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: { bestaetigt: true, proben: [] } }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  // Bewegung zwischen zwei in sich ruhigen Messungen (100, 90, 100) bei unveränderter Lageprobe.
  const versetzt = n => ({ bestaetigt: true, proben: Array(7).fill({ ...ruhigeScrollprobe, y: n === 2 ? 90 : 100 }) });
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: versetzt }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  // Lageprobe und Scrollmessung widersprechen sich im Rollstand oder in der Dokumenthöhe.
  await assert.rejects(layoutruhe(layoutProbe([{ y: 100 }, {}, {}], { scroll: { bestaetigt: true, proben: Array(7).fill({ ...ruhigeScrollprobe, y: 90 }) } }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  await assert.rejects(layoutruhe(layoutProbe([{ dokumentHoehe: 4990 }, { dokumentHoehe: 4990 }, { dokumentHoehe: 4990 }]), '#schedule-form', { streng: true }), e => { assert.match(e.message, /Bewegung nach der Aufnahme/); assert.equal(e.proben.length, 1); return true; });
  await assert.rejects(layoutruhe(layoutProbe([{}, {}, {}], { scroll: { bestaetigt: true, proben: Array(7).fill({ ...ruhigeScrollprobe, hoehe: 4990 }) } }), '#schedule-form', { streng: true }), /Bewegung nach der Aufnahme/);
  // Vor der Aufnahme bleiben dieselben Folgen zulässig, sobald sie zur Ruhe kommen.
  assert.equal((await layoutruhe(layoutProbe([{ y: 90 }, {}, {}, {}]), '#schedule-form')).bestaetigt, true);
  const r = await layoutruhe(layoutProbe([{}, {}, {}]), '#schedule-form', { streng: true }); assert.equal(r.proben.length, 3);
});
test('Layoutruhe meldet dauerhafte Mängel mit der abgelehnten Messung und speichert die Proben', async t => {
  let jetzt = 0; t.mock.method(Date, 'now', () => (jetzt += 1000));
  await assert.rejects(layoutruhe(layoutProbe(Array(12).fill(verdeckt)), '#schedule-form'), e => {
    assert.match(e.message, /ungültig oder Anker verdeckt/); assert.match(e.message, /"menueUnterkante":56/);
    assert.ok(e.proben.length >= 1 && e.proben.every(p => p.ungueltig === true)); return true;
  });
  await assert.rejects(layoutruhe(layoutProbe(Array(12).fill(0).map((_, i) => ({ y: 100 + i }))), '#schedule-form'), /nicht zur Ruhe/);
  await assert.rejects(layoutruhe(layoutProbe(Array(12).fill({}), { scroll: { bestaetigt: false } }), '#schedule-form'), /ungültig/);
  await assert.rejects(layoutruhe(layoutProbe(Array(12).fill(g => ({ ...g, anker: { ...g.anker, y: NaN } }))), '#schedule-form'), /ungültig/);
});

for (const o of [{ appVorhanden: true }, { avd: 'fremder-avd' }]) test(`Lauf verändert unpassende Umgebung nicht: ${JSON.stringify(o)}`, async () => {
  const p = laufProbe(o); assert.equal((await p.start()).rueckgabewert, 2);
  assert.equal(p.calls.some(c => ['install', 'uninstall'].some(a => c.argv.includes(a))), false);
  assert.equal(p.calls.some(c => c.argv.some(a => a.startsWith('settings put'))), false);
});

test('CLI gibt die Laufstufe zurück; Argumentprobe und ungültige Argumente starten keinen Lauf', async () => {
  const logs = [], errors = []; let starts = 0;
  for (const code of [0, 1, 2, 3, 4]) assert.equal(await main(args(), { laufFn: async () => { starts++; return { rueckgabewert: code, gesamt: { status: 'Nachgestellte Stufe' } }; }, log: s => logs.push(s), error: e => errors.push(e) }), code);
  assert.equal(starts, 5); assert.equal(errors.length, 0);
  const niemals = async () => assert.fail('Darf keinen Emulatorlauf starten');
  assert.equal(await main([...args(), '--nur-argumente'], { laufFn: niemals, log() {}, error() {} }), 0);
  assert.equal(await main([], { laufFn: niemals, log() {}, error: e => errors.push(e) }), 2);
  assert.equal(await main(args(), { laufFn: async () => { throw Error('Nachgestellter Fehler'); }, log() {}, error() {} }), 2);
});
