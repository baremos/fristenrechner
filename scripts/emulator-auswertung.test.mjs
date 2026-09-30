// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  befund, zusammenfassen, rueckgabewert, zaehleBefunde, NETZWEGE, evaluiereActivity, evaluiereNetz,
  evaluiereNavigation, evaluiereSicherung, evaluiereReleaseFlags, evaluiereUnixSockets,
  evaluiereProcNet, evaluiereNetstats, evaluiereFehlerseite, evaluiereInstallation, evaluiereUeberlauf,
  evaluiereBarrierebaum, evaluiereBeobachtungen,
  evaluiereBruecke, evaluiereFehlerfalleGegenprobe, evaluiereReleaseStart, evaluiereTastatur,
  evaluiereFehlerseiteGegenprobe, evaluiereZurueck, evaluiereRuhe, werteLaufAus, auswertungCli,
} from './emulator-auswertung.mjs';

const fixture = (name) => readFileSync(new URL(`./emulator/fixtures/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));
const status = (b, erwartet) => assert.equal(b.status, erwartet, b.grund);
const OK = 'bestanden', NEIN = 'nicht bestanden', UNGUELTIG = 'ungültig', GRENZE = 'dokumentierte Grenze';

test('Befunde und Rückgabewerte verlangen vollständige Statuswerte', () => {
  status(befund('unbekannt', 'Test'), UNGUELTIG);
  status(zusammenfassen([]), UNGUELTIG);
  status(zusammenfassen([{}]), UNGUELTIG);
  assert.equal(rueckgabewert([befund(OK, 'Beleg')]), 0);
  assert.equal(rueckgabewert([befund(NEIN, 'Beleg')]), 1);
  assert.equal(rueckgabewert([befund(UNGUELTIG, 'Beleg')]), 2);
  assert.equal(rueckgabewert([befund(NEIN, 'Beleg'), befund(UNGUELTIG, 'Beleg')]), 1);
  assert.equal(rueckgabewert([befund(OK, 'Beleg'), befund(GRENZE, 'Bekannte fehlende Gegenprobe')]), 3);
  assert.equal(rueckgabewert([befund(UNGUELTIG, 'Nicht ausführbar'), befund(GRENZE, 'Bekannte fehlende Gegenprobe')]), 2);
  assert.equal(rueckgabewert([befund(NEIN, 'Fehler'), befund(GRENZE, 'Bekannte fehlende Gegenprobe')]), 1);
  assert.deepEqual(zaehleBefunde([befund(OK, 'Beleg'), befund(GRENZE, 'Grund')]), { bestanden: 1, 'nicht bestanden': 0, 'ungültig': 0, 'dokumentierte Grenze': 1 });
});

for (const api of [30, 36]) test(`Navigation vom 30.09.2026 API ${api}: dokumentierte Grenzen brauchen echte vollständige Gegenproben`, () => {
  const alle = json(`navigation-api${api}-20260930.json`);
  assert.equal(alle.length, api === 30 ? 9 : 7);
  for (const m of alle) {
    status(evaluiereNavigation(m), ['href', 'open', 'blank', 'tel'].includes(m.name) ? OK : GRENZE);
    const fehlt = structuredClone(m); delete fehlt.gegen;
    status(evaluiereNavigation(fehlt), UNGUELTIG);
    if (['file', 'content', 'data'].includes(m.name)) {
      const ohneGrund = structuredClone(m); ohneGrund.gegen.cdp = []; ohneGrund.gegen.logcat = '';
      status(evaluiereNavigation(ohneGrund), UNGUELTIG);
    }
  }
});

test('Neuauswertung bewahrt Originale, trennt Grenzen und erfindet keine nicht ausgeführten Navigationen', async (t) => {
  const tmp = resolve('scratchpad/paket-2.5-c4/tmp'); await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'offline-auswertung-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lauf = join(dir, 'lauf'); await mkdir(lauf);
  const m = json('navigation-api36-20260930.json').find((m) => m.name === 'intent');
  const original = { ergebnis: UNGUELTIG, code: 2, befund: [{ id: 'navigation-intent', status: UNGUELTIG, grund: 'Bisherige Grenze' }, { id: 'A6', status: UNGUELTIG, grund: 'uiautomator abgebrochen' }], aufraeumen: [{ name: 'Emulator', status: 'bestanden' }] };
  const roh = JSON.stringify(original); await writeFile(join(lauf, 'ergebnis.json'), roh);
  for (const rolle of ['app', 'gegen']) await writeFile(join(lauf, `navigation-${rolle}-intent.json`), JSON.stringify(m[rolle]));
  const direkt = await werteLaufAus(lauf);
  assert.deepEqual(direkt.nachher.anzahl, { bestanden: 0, 'nicht bestanden': 0, 'ungültig': 1, 'dokumentierte Grenze': 1 });
  assert.equal(direkt.nachher.code, 2);
  assert.deepEqual(direkt.unveraendertUebernommen, ['A6']);
  assert.deepEqual(direkt.zusaetzlich, []);
  assert.equal(direkt.aufraeumen.length, 1);
  const ausgabe = join(dir, 'neu');
  await auswertungCli(['--lauf', lauf, '--ausgabe', ausgabe]);
  assert.ok((await stat(join(ausgabe, 'zusammenfassung.txt'))).isFile());
  assert.equal(await readFile(join(lauf, 'ergebnis.json'), 'utf8'), roh);
  await assert.rejects(auswertungCli(['--lauf', lauf, '--ausgabe', ausgabe]), /EEXIST/);
  await assert.rejects(auswertungCli(['--lauf', lauf, '--ausgabe', join(lauf, 'neu')]), /ursprünglichen/);
  // Der CLI muss auch beim dynamischen Archivimport fertig werden, ohne Top-Level-Await-Zyklus.
  await writeFile(join(lauf, 'sicherung-standard-app-backupnow.txt'), 'unvollständige Vorlage');
  await writeFile(join(lauf, 'sicherung-marker.json'), '{}');
  await writeFile(join(lauf, 'adb.jsonl'), JSON.stringify({ code: 0, args: ['shell', 'unbekannt'], out: '' }));
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./emulator-auswertung.mjs', import.meta.url)), '--lauf', lauf, '--ausgabe', join(dir, 'cli')], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(cli.status, 2, cli.stderr);
  assert.doesNotMatch(cli.stderr, /unsettled|top-level await/i);
  const gespeichert = JSON.parse(await readFile(join(dir, 'cli', 'ergebnis.json'), 'utf8'));
  assert.equal(gespeichert.nachher.befund.find((b) => b.id === 'sicherung-standard').status, UNGUELTIG);
});

test('Sicherungs-Neuauswertung gleicht CRLF aus ADB genau mit ctx.shell ab', async (t) => {
  const tmp = resolve('scratchpad/paket-2.5-c4/tmp'); await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'offline-sicherung-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const app = 'de.baremos.fristenrechner', gegen = `${app}.gegenprobe`, adb = [];
  const meta = json('localtransport-api30-20260930.json');
  const archiv = await readFile(new URL('./emulator/fixtures/localtransport-api30-20260930.tar', import.meta.url));
  await mkdir(join(dir, 'sicherung'));
  await writeFile(join(dir, 'sicherung/standard-gegen.tar'), archiv);
  await writeFile(join(dir, 'ergebnis.json'), JSON.stringify({ auswahl: { api: 30 }, ergebnis: UNGUELTIG, code: 2, befund: [{ id: 'ablauf-sicherung', status: UNGUELTIG, grund: 'TAR-Ende fehlt.' }] }));
  await writeFile(join(dir, 'sicherung-marker.json'), JSON.stringify({ app: 'MARKER', gegen: meta.marker }));
  for (const [rolle, paket] of [['app', app], ['gegen', gegen]]) {
    const backup = rolle === 'app' ? json('sicherung-api30-standard.json').appAusgabe : meta.backupAusgabe.replace(new RegExp(`progress: ${meta.archivBytes}/`), `progress: ${archiv.length}/`);
    for (const [suffix, befehl, text] of [
      ['package', `dumpsys package ${paket}`, 'User 0: installed=true stopped=false'],
      ['backupnow', `bmgr backupnow ${paket}`, backup],
      ['ablage', 'ls -1 /data/data/com.android.localtransport/files/1/_full', gegen],
      ['delta', 'ls -1 /data/data/com.android.localtransport/files/1/_delta', '@pm@'],
    ]) {
      const out = text.replaceAll('\r\n', '\n').trim().replaceAll('\n', '\r\n') + '\r\n';
      adb.push({ code: 0, args: ['shell', befehl], out, err: '' });
      await writeFile(join(dir, `sicherung-standard-${rolle}-${suffix}.txt`), out.replaceAll('\r\n', '\n').trim());
    }
  }
  const pull = meta.pullAusgabe.replace(`(${meta.archivBytes} bytes`, `(${archiv.length} bytes`);
  await writeFile(join(dir, 'sicherung-standard-gegen-pull.txt'), pull);
  adb.push({ code: 0, args: ['pull', `/data/data/com.android.localtransport/files/1/_full/${gegen}`, 'unbenutzt'], out: '', err: pull.slice(1) });
  const schreibeAdb = () => writeFile(join(dir, 'adb.jsonl'), adb.map((a) => JSON.stringify(a)).join('\n'));
  await schreibeAdb();
  const vorher = await werteLaufAus(dir);
  status(vorher.nachher.befund.find((b) => b.id === 'sicherung-standard'), OK);
  assert.equal(vorher.nachher.code, 2, 'Der ursprüngliche abgebrochene Lauf bleibt ausstehend.');
  adb.find((a) => a.args[1] === `dumpsys package ${app}`).out = 'User 0: installed=true stopped=true\r\n';
  await schreibeAdb();
  status((await werteLaufAus(dir)).nachher.befund.find((b) => b.id === 'sicherung-standard'), UNGUELTIG);
});

for (const api of [30, 36]) {
  test(`Netz API ${api}: alle echten Angriffswege samt Gegenproben`, () => status(evaluiereNetz(json(`netz-api${api}.json`)), OK));
  for (const name of NETZWEGE) {
    test(`Netz API ${api}: ${name}, eine Annahme der App muss scheitern`, () => {
      const m = json(`netz-api${api}.json`); m.app.find((v) => v.name === name).annahmen = 1;
      status(evaluiereNetz(m), NEIN);
    });
    if (name !== 'invalid') test(`Netz API ${api}: ${name}, Gegenprobe ohne Wirkung ist ungültig`, () => {
      const m = json(`netz-api${api}.json`); m.gegen.find((v) => v.name === name).annahmen = 0;
      status(evaluiereNetz(m), UNGUELTIG);
    });
  }
  for (const name of ['iframe', 'sendBeacon']) test(`Netz API ${api}: ${name}, irreführendes Seitenergebnis reicht nicht`, () => {
    const m = json(`netz-api${api}.json`); m.app.find((v) => v.name === name).cdp = [];
    status(evaluiereNetz(m), UNGUELTIG);
  });
  test(`Netz API ${api}: DNS-Gegenprobe, Vollständigkeit und Nachmessung`, () => {
    let m = json(`netz-api${api}.json`); m.gegen.find((v) => v.name === 'invalid').cdp = [];
    status(evaluiereNetz(m), UNGUELTIG);
    m = json(`netz-api${api}.json`); m.app.pop(); status(evaluiereNetz(m), UNGUELTIG);
    m = json(`netz-api${api}.json`); m.app[0].annahmen = '0'; status(evaluiereNetz(m), UNGUELTIG);
    m = json(`netz-api${api}.json`); m.nachher.annahmen = 0; status(evaluiereNetz(m), UNGUELTIG);
    m = json(`netz-api${api}.json`); m.app[1] = m.app[0]; status(evaluiereNetz(m), UNGUELTIG);
  });

  for (const m of json(`navigation-api${api}.json`)) {
    test(`Navigation API ${api}: ${m.name}, echte Beobachtung und Grenze`, () => {
      status(evaluiereNavigation(m), ['href', 'open', 'blank', 'tel'].includes(m.name) ? OK : GRENZE);
    });
    test(`Navigation API ${api}: ${m.name}, fremde Activity und PID-Wechsel scheitern`, () => {
      const n = structuredClone(m); n.app.oben = 'org.chromium.webview_shell/.WebViewBrowserActivity';
      status(evaluiereNavigation(n), NEIN);
      n.app.oben = m.app.oben; n.app.pidNach++; status(evaluiereNavigation(n), NEIN);
    });
    test(`Navigation API ${api}: ${m.name}, fehlende Messung ist ungültig`, () => {
      const n = structuredClone(m); delete n.app.annahmen; status(evaluiereNavigation(n), UNGUELTIG);
    });
    if (['href', 'open', 'blank', 'tel'].includes(m.name)) test(`Navigation API ${api}: ${m.name}, wirkungslose Gegenprobe`, () => {
      const n = structuredClone(m); n.gegen.oben = 'de.baremos.fristenrechner.gegenprobe/.MainActivity';
      status(evaluiereNavigation(n), UNGUELTIG);
    });
  }
  test(`Activity API ${api}: Originalzeilen liefern Paket; fremdes Paket scheitert`, () => {
    const m = json(`navigation-api${api}.json`)[0];
    status(evaluiereActivity(m.app.activity), OK);
    const fremd = evaluiereActivity(m.gegen.activity); status(fremd, NEIN); assert.equal(fremd.details.oben, m.gegen.oben);
    status(evaluiereActivity('mCurrentFocus=Window{0 u0 de.baremos.fristenrechner/.MainActivity}'), UNGUELTIG);
  });
  test(`Releaseflags API ${api}: echte Debugflags scheitern, abgeleitete Releaseflags bestehen`, () => {
    const d = fixture(`flags-debug-api${api}.txt`);
    status(evaluiereReleaseFlags({ dumpsys: d }), NEIN);
    status(evaluiereReleaseFlags({ dumpsys: fixture(`flags-gegen-api${api}.txt`).replace('DEBUGGABLE ', '') }), NEIN);
    status(evaluiereReleaseFlags({ dumpsys: d.replace('DEBUGGABLE ', '') }), OK);
    status(evaluiereReleaseFlags({ dumpsys: d.replace('flags=[', 'unbekannt=[') }), UNGUELTIG);
    status(evaluiereReleaseFlags({ dumpsys: '' }), UNGUELTIG);
    status(evaluiereReleaseFlags({ dumpsys: d + d }), UNGUELTIG);
  });
}

for (const name of ['sicherung-api30-standard.json', 'sicherung-api36-standard.json', 'sicherung-api36-geraetewechsel.json']) {
  test(`Sicherung ${name}: echte Ausgaben und Gegenprobe`, () => status(evaluiereSicherung(json(name)), OK));
  test(`Sicherung ${name}: Appdaten beim Transport scheitern`, () => {
    const m = json(name); m.appDateien.push('apps/de.baremos.fristenrechner/r/app_webview/Default/Local Storage/leveldb/000003.log');
    status(evaluiereSicherung(m), NEIN);
  });
  for (const feld of ['appStopped', 'gegenStopped', 'gegenMarker', 'appArchivLesbar', 'gegenArchivLesbar']) test(`Sicherung ${name}: ${feld}, Messung ungültig`, () => {
    const m = json(name); m[feld] = !m[feld]; status(evaluiereSicherung(m), UNGUELTIG);
  });
  test(`Sicherung ${name}: fehlende oder unbekannte Ergebniszeile`, () => {
    const m = json(name); m.appAusgabe = 'Backup finished with result: Success'; status(evaluiereSicherung(m), UNGUELTIG);
    m.appAusgabe = json(name).appAusgabe.replace(/with result: (Backup is not allowed|Transport rejected[^\n]+)/, 'with result: Unbekannt');
    status(evaluiereSicherung(m), UNGUELTIG);
    m.appAusgabe = json(name).appAusgabe; m.gegenAusgabe = m.appAusgabe; status(evaluiereSicherung(m), UNGUELTIG);
  });
}
test('Gerätewechsel braucht den Nachweis des Regelparsers', () => {
  const m = json('sicherung-api36-geraetewechsel.json'); m.logcat = ''; status(evaluiereSicherung(m), UNGUELTIG);
});
test('backupnow akzeptiert die überlieferten Zeilen auch mit CRLF', () => {
  const m = json('sicherung-api30-standard.json');
  m.appAusgabe = m.appAusgabe.replaceAll('\n', '\r\n');
  m.gegenAusgabe = m.gegenAusgabe.replaceAll('\n', '\r\n');
  status(evaluiereSicherung(m), OK);
});

// Kein echter Rohheader in der Probe überliefert: nur die Socket-Zeile stammt aus dem Lauf.
const procHeader = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode';
const procTabellen = (zeilen = {}) => Object.fromEntries(['tcp', 'tcp6', 'udp', 'udp6'].map((k) => [k, procHeader + '\n' + (zeilen[k] ?? []).join('\n')]));
test('/proc/net: echte Socket-Zeile, UID-Begrenzung und Gegenprobe', () => {
  const g = json('proc-net-gegen-api30.json');
  const m = { uid: g.uid + 1, tabellen: procTabellen(g.zeilen), gegenprobe: { uid: g.uid, tabellen: procTabellen(g.zeilen) } };
  status(evaluiereProcNet(m), OK);
  m.uid = g.uid; status(evaluiereProcNet(m), NEIN);
  m.gegenprobe.tabellen = procTabellen(); status(evaluiereProcNet(m), UNGUELTIG);
  m.tabellen.tcp = 'Permission denied'; status(evaluiereProcNet(m), UNGUELTIG);
});

for (const [name, typ, lokal, fern, erwartet] of [
  ['IPv4 localhost', 'tcp', '0100007F', '0200007F', OK],
  ['IPv4 Loopback-Listener', 'tcp', '0100007F', '00000000', OK],
  ['IPv4 an alle Adressen gebunden', 'udp', '00000000', '00000000', NEIN],
  ['IPv4 externes Ziel', 'tcp', '0100007F', '0202000A', NEIN],
  ['IPv6 localhost', 'tcp6', '00000000000000000000000001000000', '00000000000000000000000001000000', OK],
  ['IPv6 Loopback-Listener', 'udp6', '00000000000000000000000001000000', '00000000000000000000000000000000', OK],
  ['IPv6 externes Ziel', 'tcp6', '00000000000000000000000001000000', 'B80D0120000000000000000001000000', NEIN],
  ['IPv4-mapped localhost', 'tcp6', '0000000000000000FFFF00000100007F', '0000000000000000FFFF00000200007F', OK],
  ['IPv4-mapped externes Ziel', 'tcp6', '0000000000000000FFFF00000100007F', '0000000000000000FFFF00000202000A', NEIN],
  ['Unbekannte IPv4-Länge', 'tcp', '0001', '0200007F', UNGUELTIG],
  ['IPv4-Form in IPv6-Tabelle', 'tcp6', '0100007F', '0200007F', UNGUELTIG],
]) test(`/proc/net: ${name}`, () => {
  const g = json('proc-net-gegen-api30.json');
  const uid = g.uid + 1;
  const zeile = `0: ${lokal}:ABCD ${fern}:0035 01 00000000:00000000 00:00000000 00000000 ${uid} 0 123 1`;
  status(evaluiereProcNet({ uid, tabellen: procTabellen({ [typ]: [zeile] }), gegenprobe: { uid: g.uid, tabellen: procTabellen(g.zeilen) } }), erwartet);
});

test('netstats API 36: echter Tabellenausschnitt; Appverkehr scheitert', () => {
  const m = { api: 36, uid: 10151, gegenUid: 10150, vorher: fixture('netstats-api36-vor.txt'), nachher: fixture('netstats-api36-nach.txt') };
  status(evaluiereNetstats(m), OK);
  status(evaluiereNetstats({ ...m, uid: 1020 }), NEIN);
  const unveraendert = evaluiereNetstats({ ...m, uid: 10143 });
  status(unveraendert, OK); assert.deepEqual(unveraendert.details.delta, [0, 0, 0, 0]);
  status(evaluiereNetstats({ ...m, vorher: m.vorher.replace(/    10143 5749 11 1652 12\r?\n/, ''), uid: 10143 }), NEIN);
  status(evaluiereNetstats({ ...m, nachher: m.nachher.replace(/    10143 5749 11 1652 12\r?\n/, ''), uid: 10143 }), UNGUELTIG);
  status(evaluiereNetstats({ ...m, nachher: m.nachher.replace('10143 5749 11 1652 12', '10143 5748 11 1652 12'), uid: 10143 }), UNGUELTIG);
  status(evaluiereNetstats({ ...m, gegenUid: 10999 }), UNGUELTIG);
  status(evaluiereNetstats({ ...m, nachher: m.nachher.replace('  mStatsMapA:', '') }), UNGUELTIG);
  status(evaluiereNetstats({ ...m, vorher: 'mAppUidStatsMap: OK' }), UNGUELTIG);
  status(evaluiereNetstats({ ...m, api: 30 }), UNGUELTIG);
});

// Konstruierte Ergänzungen zu den echten Aufzeichnungen der dritten Serie.
test('Unix-Sockets: Header ist Pflicht; offene WebView und fehlende Gegenprobe', () => {
  const header = 'Num       RefCount Protocol Flags    Type St Inode Path\n';
  const socket = '0000000000000000: 00000002 00000000 00010000 0001 01 30122 @webview_devtools_remote_2365\n';
  status(evaluiereUnixSockets({ text: header, debugSocketNachgewiesen: true, buildType: 'user' }), OK);
  status(evaluiereUnixSockets({ text: header + socket, debugSocketNachgewiesen: true, buildType: 'user' }), NEIN);
  status(evaluiereUnixSockets({ text: '', debugSocketNachgewiesen: true }), UNGUELTIG);
  status(evaluiereUnixSockets({ text: header, debugSocketNachgewiesen: false }), UNGUELTIG);
  status(evaluiereUnixSockets({ text: header + 'kaputt', debugSocketNachgewiesen: true }), UNGUELTIG);
});

test('Release API 30: echter userdebug-Socket ist Grenze, fehlender Typ bleibt ungültig', () => {
  const roh = json('release-api30-r3.json');
  const m = { ...roh, debugSocketNachgewiesen: /@webview_devtools_remote_\d+/.test(roh.debugUnix), buildType: 'userdebug' };
  status(evaluiereReleaseFlags(roh), OK);
  for (const buildType of ['userdebug', 'eng']) status(evaluiereUnixSockets({ ...m, buildType }), GRENZE);
  status(evaluiereUnixSockets({ ...m, buildType: 'user' }), NEIN);
  status(evaluiereUnixSockets({ ...m, buildType: undefined }), UNGUELTIG);
  status(evaluiereUnixSockets({ ...m, text: 'kaputt' }), UNGUELTIG);
  status(evaluiereUnixSockets({ ...m, debugSocketNachgewiesen: false }), UNGUELTIG);
});

for (const api of [30, 36]) test(`AX API ${api}: echte Wurzel und Diagnose des unbenannten Rollbereichs`, () => {
  const m = json(`barrierebaum-api${api}-r3.json`);
  const wert = evaluiereBarrierebaum(m);
  status(wert, NEIN);
  assert.equal(wert.details.length, 1);
  assert.equal(wert.details[0].rolle, 'generic');
  assert.equal(wert.details[0].elternName, 'Termine und Rechenwege');
  assert.ok(wert.details[0].backendDOMNodeId > 0);
  // Die Korrektur ist eine Gegenprobe, keine Gerätebeobachtung.
  const knoten = m.nodes.find(n => n.nodeId === wert.details[0].nodeId);
  m.domKnoten = [{ backendDOMNodeId: knoten.backendDOMNodeId, nodeName: 'DIV', attributes: ['class', 'table-scroll', 'tabindex', '0'] }];
  assert.equal(evaluiereBarrierebaum(m).details[0].dom.nodeName, 'DIV');
  knoten.role.value = 'group'; knoten.name.value = 'Termine und Rechenwege';
  status(evaluiereBarrierebaum(m), OK);
  if (api === 30) {
    status(evaluiereBarrierebaum(m, { webviewVersion: '133.0.6943.137' }), UNGUELTIG);
    delete m.webviewVersion; status(evaluiereBarrierebaum(m), UNGUELTIG);
    m.webviewVersion = '83.0.4103.120'; m.nodes[0].parentId = 'fremder-knoten'; status(evaluiereBarrierebaum(m), UNGUELTIG);
  } else {
    m.nodes[0].role.value = 'WebArea'; status(evaluiereBarrierebaum(m), UNGUELTIG);
  }
});

test('Tastatur API 36: widersprüchliche Anzeige und Nullhöhe bleiben ungültig', () => {
  const inputMethod = fixture('tastatur-api36-r3.txt'), fenster = fixture('tastatur-fenster-api36-r3.txt');
  const nachher = { aktivesElement: { tag: 'input', name: 'projektname' } };
  status(evaluiereTastatur(inputMethod), UNGUELTIG);
  status(evaluiereTastatur({ inputMethod, fenster, nachher }), UNGUELTIG);
  const sichtbar = inputMethod.replace('mIsInputViewShown=false', 'mIsInputViewShown=true');
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster, nachher }), UNGUELTIG);
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster: fenster.replace('frame=[0,2400]', 'frame=[0,1600]'), nachher }), UNGUELTIG);
  const mitHoehe = fenster.replaceAll('[0,2400][1080,2400]', '[0,1600][1080,2400]');
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster: mitHoehe, nachher }), OK);
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster: mitHoehe.replace('visible=true', 'visible=false'), nachher }), UNGUELTIG);
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster: mitHoehe, nachher: {} }), UNGUELTIG);
  status(evaluiereTastatur({ inputMethod: sichtbar, fenster: mitHoehe.replaceAll('de.baremos.fristenrechner', 'fremde.app'), nachher }), UNGUELTIG);
});

test('Neuauswertung der dritten Serie belegt Version und bewahrt Abbrüche', async (t) => {
  const tmp = resolve('scratchpad/paket-2.5-c4/tmp'); await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'offline-r3-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const roh = json('release-api30-r3.json'), ax = json('barrierebaum-api30-r3.json');
  delete ax.webviewVersion;
  await writeFile(join(dir, 'ergebnis.json'), JSON.stringify({ code: 2, ergebnis: UNGUELTIG, befund: [{ id: 'A10', status: UNGUELTIG, grund: 'Wurzel fehlt.' }, { id: 'A8', status: UNGUELTIG, grund: 'Zeitüberschreitung' }] }));
  await writeFile(join(dir, 'geraet.json'), JSON.stringify({ fingerprint: roh.fingerprint, webview: 'Current WebView package (name, version): (com.android.webview, 83.0.4103.120)' }));
  await writeFile(join(dir, 'a10-barrierebaum.json'), JSON.stringify(ax));
  await writeFile(join(dir, 'b-unix.txt'), roh.text); await writeFile(join(dir, 'b-debug-unix.txt'), roh.debugUnix);
  const e = await werteLaufAus(dir);
  status(e.nachher.befund.find(b => b.id === 'A10'), NEIN);
  status(e.nachher.befund.find(b => b.id === 'B-Socket'), GRENZE);
  status(e.nachher.befund.find(b => b.id === 'A8'), UNGUELTIG);
  assert.match(e.nachher.befund.find(b => b.id === 'B-Socket').details.buildTypeQuelle, /Historischer/);
  assert.equal(e.nachher.code, 1);
});
test('Fehlerseite aus echter Probe; falscher Pfad, fehlender Text und Syntaxfehler', () => {
  const m = json('fehlerseite-api30.json'); status(evaluiereFehlerseite(m), OK);
  for (const patch of [{ ort: { ...m.ort, pathname: '/' } }, { ort: { ...m.ort, text: '' } }, { ausnahmen: [{ text: 'SyntaxError' }] }, { logcat: m.logcat + '\nSyntaxError' }]) status(evaluiereFehlerseite({ ...m, ...patch }), NEIN);
  status(evaluiereFehlerseite({ ...m, logcat: '' }), UNGUELTIG);
});
test('API 24: formale Fehlerkennung; erfolgreiche Installation scheitert', () => {
  status(evaluiereInstallation(json('installation-api24-r3.json')), OK);
  status(evaluiereInstallation({ code: 1, ausgabe: 'Failure [INSTALL_FAILED_OLDER_SDK: Requires newer sdk version #30 (current version is #24)]' }), OK);
  status(evaluiereInstallation({ code: 0, ausgabe: 'Success' }), NEIN);
  status(evaluiereInstallation({ code: 1, ausgabe: 'adb: device offline' }), UNGUELTIG);
  status(evaluiereInstallation({ code: 1, ausgabe: 'INSTALL_FAILED_OLDER_SDK' }), UNGUELTIG);
});
test('Überlauf: sichtbare Maße erforderlich, Überlauf scheitert', () => {
  for (const api of [30, 36]) status(evaluiereUeberlauf(json(`ueberlauf-api${api}-r3.json`)), NEIN);
  status(evaluiereUeberlauf({ scrollWidth: 400, clientWidth: 400 }), OK);
  status(evaluiereUeberlauf({ scrollWidth: 401, clientWidth: 400 }), NEIN);
  status(evaluiereUeberlauf({ scrollWidth: 0, clientWidth: 0 }), UNGUELTIG);
  status(evaluiereUeberlauf({ scrollWidth: '400', clientWidth: 400 }), UNGUELTIG);
});
test('Barrierebaum: Namen; fehlender Baum ist eine Grenze und kein Bestehen', () => {
  const nodes = [{ nodeId: '1', ignored: false, role: { value: 'RootWebArea' } }, { nodeId: '2', ignored: false, role: { value: 'button' }, name: { value: 'Berechnen' } }];
  status(evaluiereBarrierebaum({ nodes }), OK);
  status(evaluiereBarrierebaum({ error: { code: -32601 } }), UNGUELTIG);
  status(evaluiereBarrierebaum({ nodes: [] }), UNGUELTIG);
  nodes[1].name.value = ''; status(evaluiereBarrierebaum({ nodes }), NEIN);
  nodes[1].role.value = 'spinbutton'; status(evaluiereBarrierebaum({ nodes }), NEIN);
  nodes[1].role.value = 'generic'; nodes[1].properties = [{ name: 'focusable', value: { type: 'boolean', value: true } }];
  status(evaluiereBarrierebaum({ nodes }), NEIN);
});
test('Eigene UI-Messwerte: nur vollständige skalare Soll-Ist-Paare', () => {
  status(evaluiereBeobachtungen([{ name: 'Formularwert', ist: 'Test', soll: 'Test' }]), OK);
  status(evaluiereBeobachtungen([{ name: 'Formularwert', ist: '', soll: 'Test' }]), NEIN);
  status(evaluiereBeobachtungen([{ name: 'Formularwert', soll: 'Test' }]), UNGUELTIG);
  status(evaluiereBeobachtungen([]), UNGUELTIG);
});
test('Alle Auswerter behandeln fehlende Daten als ungültig', () => {
  for (const auswerter of [evaluiereActivity, evaluiereNetz, evaluiereNavigation, evaluiereSicherung, evaluiereReleaseFlags, evaluiereUnixSockets, evaluiereProcNet, evaluiereNetstats, evaluiereFehlerseite, evaluiereInstallation, evaluiereUeberlauf, evaluiereBarrierebaum, evaluiereBeobachtungen, evaluiereBruecke, evaluiereFehlerfalleGegenprobe, evaluiereReleaseStart, evaluiereTastatur, evaluiereFehlerseiteGegenprobe, evaluiereZurueck, evaluiereRuhe]) {
    for (const wert of [undefined, null, false, 17, {}, 'unbekannt']) status(auswerter(wert), UNGUELTIG);
  }
});

test('Navigation: ausgeschriebene MainActivity gilt, andere Klasse im App-Paket scheitert', () => {
  const m = json('navigation-api36.json')[0];
  m.app.oben = 'de.baremos.fristenrechner/de.baremos.fristenrechner.MainActivity'; status(evaluiereNavigation(m), OK);
  m.app.oben = 'de.baremos.fristenrechner/.OtherActivity'; status(evaluiereNavigation(m), NEIN);
});
test('Brückenantwort muss einen lesbaren path enthalten', () => {
  status(evaluiereBruecke({ path: '' }), OK);
  status(evaluiereBruecke({ path: '/assets' }), OK);
  status(evaluiereBruecke({ path: false }), UNGUELTIG);
});
test('Fehlerfalle-Gegenprobe verlangt strikt true', () => {
  status(evaluiereFehlerfalleGegenprobe(true), OK);
  for (const v of [false, 1, 'true', [], {}]) status(evaluiereFehlerfalleGegenprobe(v), UNGUELTIG);
});
const ansicht = (...namen) => `<hierarchy rotation="0">${namen.map((name) => `<node text="${name}" content-desc="" bounds="[0,0][400,800]"/>`).join('')}</hierarchy>`;
test('Release-Start: vollständiger UIA-Baum mit Formular, Fehlerfalle scheitert', () => {
  const xml = ansicht('Fristenrechner Vergabe', 'Vergabeordnung');
  status(evaluiereReleaseStart({ xml }), OK);
  status(evaluiereReleaseStart({ xml: ansicht('Fristenrechner Vergabe', 'Vergabeordnung', 'Im Fristenrechner ist ein Fehler aufgetreten') }), NEIN);
  for (const unlesbar of [xml.slice(0, -12), '<hierarchy>Fristenrechner Vergabe Vergabeordnung</hierarchy>', xml.replace('text="Vergabeordnung"', 'unbekannt="Vergabeordnung"'), xml.replace('text="Vergabeordnung"', 'text="Vergabeordnung" visible-to-user="false"'), xml.replace('</hierarchy>', '</node></hierarchy>')]) status(evaluiereReleaseStart({ xml: unlesbar }), UNGUELTIG);
});
test('Tastatur: sichtbarer, verborgener und unbekannter Zustand sind getrennt', () => {
  status(evaluiereTastatur('  mInputShown=true'), UNGUELTIG);
  status(evaluiereTastatur('  mIsInputViewShown=true'), UNGUELTIG);
  status(evaluiereTastatur('  mInputShown=false'), NEIN);
  status(evaluiereTastatur('mInputShown=true\nmIsInputViewShown=false'), UNGUELTIG);
  status(evaluiereTastatur('mInputShown=unknown'), UNGUELTIG);
  status(evaluiereTastatur('unbekannt_mInputShown=true'), UNGUELTIG);
});
test('Fehlerseiten-Gegenprobe: zwei echte Fehlerzeilen, fehlende Wirkung und fremde URL', () => {
  const logcat = fixture('fehlerseite-gegenprobe-api30.txt');
  status(evaluiereFehlerseiteGegenprobe({ logcat }), OK);
  status(evaluiereFehlerseiteGegenprobe({ logcat: logcat.split('\n')[0] }), UNGUELTIG);
  status(evaluiereFehlerseiteGegenprobe({ logcat: logcat.replaceAll('https://localhost/startfehler.html', 'https://localhost/fremd.html') }), UNGUELTIG);
  status(evaluiereFehlerseiteGegenprobe({ logcat: 'Unable to open asset URL: https://localhost/startfehler.html\n'.repeat(2) }), UNGUELTIG);
});
test('Zurück: fremde oberste Activity, verbliebene App und unbekannter Zustand', () => {
  const n = json('navigation-api36.json')[0];
  status(evaluiereZurueck(n.gegen.activity), OK);
  status(evaluiereZurueck(n.app.activity), NEIN);
  status(evaluiereZurueck('mCurrentFocus=Window{1 u0 de.baremos.fristenrechner/.MainActivity}'), UNGUELTIG);
});
test('Release-Ruhe: wirksame Gegenproben und Nullzählung in allen Phasen', () => {
  const m = { vorher: { annahmen: 2 }, nachher: { annahmen: 2 }, ruhe: 0, hintergrund: 0, rueckkehr: 0 };
  status(evaluiereRuhe(m), OK);
  status(evaluiereRuhe({ ...m, rueckkehr: 1 }), NEIN);
  status(evaluiereRuhe({ ...m, vorher: { annahmen: 0 } }), UNGUELTIG);
  status(evaluiereRuhe({ ...m, nachher: { annahmen: 0 } }), UNGUELTIG);
  status(evaluiereRuhe({ ...m, ruhe: 2, hintergrund: 1, rueckkehr: 1 }), UNGUELTIG);
  for (const v of [undefined, -1, '0', 0.5, Infinity, NaN]) status(evaluiereRuhe({ ...m, rueckkehr: v }), UNGUELTIG);
});
