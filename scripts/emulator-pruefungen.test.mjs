import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, deflateSync } from 'node:zlib';
import { leseArchiv, leseLocalTransportArchiv, angriffe, navigationen, cdpZeilen, netz, navigation, sicherung } from './emulator/pruefungen.mjs';

const fixture = new URL('./emulator/fixtures/localtransport-ausschnitt.tar', import.meta.url);
const MARKER = 'P6WERTGEGENdoklhku3';
const APP = 'de.baremos.fristenrechner';
const GEGEN = `${APP}.gegenprobe`;

test('LocalTransport: echter TAR-Ausschnitt mit Marker und LevelDB-Pfad', async () => {
  const b = await readFile(fixture);
  const r = leseArchiv(b, MARKER);
  assert.equal(r.kompression, 'keine');
  assert.equal(r.marker, true);
  assert.equal(r.eintraege.length, 1);
  assert.match(r.eintraege[0].name, /app_webview\/Default\/Local Storage\/leveldb\/000003\.log$/);
  assert.equal(leseArchiv(b, 'nicht-vorhandener-wert').marker, false);
});

test('LocalTransport: gzip und zlib werden vor der Prüfung entpackt', async () => {
  const b = await readFile(fixture);
  for (const [name, komprimiert] of [['gzip', gzipSync(b)], ['zlib', deflateSync(b)]]) {
    const r = leseArchiv(komprimiert, MARKER);
    assert.equal(r.kompression, name);
    assert.equal(r.marker, true);
    assert.equal(r.entpackteBytes, b.length);
  }
});

test('LocalTransport: falsche Prüfsumme, Länge und unbekanntes Format werden abgelehnt', async () => {
  const b = await readFile(fixture);
  const korrupt = Buffer.from(b); korrupt[0] ^= 1;
  assert.throws(() => leseArchiv(korrupt, MARKER), /Prüfsumme/);
  assert.throws(() => leseArchiv(b.subarray(0, 1024), MARKER), /Ende fehlt/);
  assert.throws(() => leseArchiv(b.subarray(0, 1023), MARKER), /Format/);
  assert.throws(() => leseArchiv(Buffer.from('kein Archiv'), MARKER), /Format/);
  assert.throws(() => leseArchiv(Buffer.from([0x1f, 0x8b, 0x01]), MARKER));
});

test('LocalTransport: Daten nach TAR-Ende sind kein gültiges Archiv', async () => {
  const b = await readFile(fixture);
  const korrupt = Buffer.from(b); korrupt[korrupt.length - 1] = 1;
  assert.throws(() => leseArchiv(korrupt, MARKER), /TAR-Ende/);
});

for (const api of [30, 36]) test(`LocalTransport API ${api}: echte Einträge vom 30.09.2026 enden ohne TAR-Nullblöcke`, async () => {
  const name = `./emulator/fixtures/localtransport-api${api}-20260930`;
  const b = await readFile(new URL(`${name}.tar`, import.meta.url));
  const meta = JSON.parse(await readFile(new URL(`${name}.json`, import.meta.url), 'utf8'));
  assert.throws(() => leseArchiv(b, meta.marker), /TAR-Ende fehlt/);
  const r = leseArchiv(b, meta.marker, { localTransport: true });
  assert.equal(r.ende, 'LocalTransport-Dateiende');
  assert.equal(r.marker, true);
  assert.equal(r.eintraege.length, 2);
  assert.equal(r.eintraege.at(-1).groesse, 127);
  assert.match(r.eintraege.at(-1).name, /WebViewChromiumPrefs.xml$/);
  // Die Archivvorlage ist ein Ausschnitt: echte Bytezählungen dürfen ihn nicht als ganze Datei bestätigen.
  assert.throws(() => leseLocalTransportArchiv(b, meta.marker, meta), /Bytezahl/);
  const angepasst = {
    ...meta,
    backupAusgabe: meta.backupAusgabe.replace(new RegExp(`progress: ${meta.archivBytes}/`), `progress: ${b.length}/`),
    pullAusgabe: meta.pullAusgabe.replace(`(${meta.archivBytes} bytes`, `(${b.length} bytes`),
  };
  assert.equal(leseLocalTransportArchiv(b, meta.marker, angepasst).marker, true);
  for (const patch of [{ pullAusgabe: '' }, { backupAusgabe: '' }, { backupAusgabe: angepasst.backupAusgabe.replace(`Package ${meta.paket} with result: Success`, `Package ${meta.paket} with result: Error`) }, { paket: 'de.andere.app' }]) {
    assert.throws(() => leseLocalTransportArchiv(b, meta.marker, { ...angepasst, ...patch }));
  }
  assert.throws(() => leseArchiv(b.subarray(0, b.length - 512), meta.marker, { localTransport: true }), /Abgeschnittener/);
  const shellCrLf = Buffer.from(b.toString('latin1').replaceAll('\n', '\r\n'), 'latin1');
  assert.throws(() => leseArchiv(shellCrLf, meta.marker, { localTransport: true }));
});

test('Angriffe enthalten alle zehn Wege und keine unverschlüsselte Netzadresse', () => {
  const a = angriffe(12345, 'app', 'abc');
  assert.deepEqual(Object.keys(a), ['fetch', 'xhr', 'image', 'iframe', 'websocket', 'sendBeacon', 'eventSource', 'prefetch', 'capacitorHttp', 'invalid']);
  assert.ok(Object.values(a).every((s) => !s.includes('http:')));
  assert.match(a.invalid, /fr-probe-abc-app\.invalid/);
  assert.match(a.capacitorHttp, /CapacitorHttp/);
  assert.throws(() => angriffe(0, 'app', 'abc'), /Port/);
  assert.throws(() => angriffe(12345, "app'", 'abc'), /Messkennung/);
  for (const s of Object.values(a)) assert.doesNotThrow(() => new Function(`return (${s})`));
});

test('Navigation umfasst alle neun Wege; CDP-Ereignisse bleiben wörtlich erhalten', () => {
  assert.deepEqual(Object.keys(navigationen(12345)), ['href', 'open', 'blank', 'mailto', 'tel', 'intent', 'file', 'content', 'data']);
  const r = cdpZeilen([
    { method: 'Network.loadingFailed', params: { type: 'Document', errorText: 'net::ERR_CACHE_MISS' } },
    { method: 'Log.entryAdded', params: { entry: { source: 'security', level: 'error', text: 'Not allowed to navigate top frame to data URL: data:text/html,x' } } },
  ]);
  assert.deepEqual(r, [
    'loadingFailed type=Document errorText=net::ERR_CACHE_MISS',
    'Log security/error: Not allowed to navigate top frame to data URL: data:text/html,x',
  ]);
});

test('Netz: unwirksame Gegenprobe beendet die Messung vor den Angriffen der App', async () => {
  const aufrufe = []; const befunde = [];
  const ctx = {
    app: APP, gegen: GEGEN, netz: { count: 0, port: 12345 },
    shell: async (s) => {
      if (s.startsWith('pm list packages -U ')) return `package:${s.split(' ').at(-1)} uid:10150`;
      if (s.startsWith('cat /proc/net/')) return 'Messdaten';
      throw new Error(s);
    },
    start: async (p) => aufrufe.push(`start ${p}`), stop: async (p) => aufrufe.push(`stop ${p}`),
    sleep: async () => {}, save: async () => {},
    cdp: async () => ({ events: [], send: async () => {}, evaluate: async () => 'gestartet' }),
    befund: (id, b) => befunde.push({ id, ...b }),
  };
  await netz(ctx);
  assert.equal(befunde[0].status, 'ungültig');
  assert.ok(!aufrufe.includes(`start ${APP}`));
  assert.ok(aufrufe.includes(`stop ${GEGEN}`));
});

test('Navigation: echte Messwerte laufen durch die Prozessschnittstelle und behalten belegte Grenzen', async () => {
  const messungen = JSON.parse(await readFile(new URL('./emulator/fixtures/navigation-api30.json', import.meta.url), 'utf8'));
  const befund = []; const aufrufe = [];
  let index = -1, paket, wert, zaehler = 0;
  const ctx = {
    app: APP, gegen: GEGEN,
    netz: { port: 12345, count: () => zaehler },
    stop: async (p) => { aufrufe.push(`stop ${p}`); },
    start: async (p) => { paket = p; if (p === APP) index++; wert = messungen[index][p === APP ? 'app' : 'gegen']; aufrufe.push(`start ${p}`); },
    sleep: async () => {}, save: async () => {}, shot: async () => {},
    befund: (id, b) => befund.push({ id, ...b }),
    cdp: async () => ({
      events: [], send: async () => {},
      evaluate: async (s) => {
        if (s.includes('setTimeout')) { zaehler += wert.annahmen; return 'ausgeloest'; }
        return wert.ort;
      },
    }),
    shell: async (s) => {
      if (s.startsWith('pidof ')) return String(wert.pidVor);
      if (s === 'dumpsys activity activities') return wert.activity;
      if (s === 'logcat -c') return '';
      if (s === 'logcat -d -v brief') return [wert.logcat, ...wert.cdp].join('\n');
      throw new Error(s);
    },
    adb: async ([shell, befehl, p]) => {
      assert.deepEqual([shell, befehl, p], ['shell', 'pidof', paket]);
      return { code: 0, out: String(wert.pidNach), err: '' };
    },
  };
  await navigation(ctx);
  assert.equal(befund.length, 9);
  assert.equal(befund.filter((b) => b.status === 'bestanden').length, 4);
  assert.equal(befund.filter((b) => b.status === 'dokumentierte Grenze').length, 5);
  assert.equal(aufrufe.filter((s) => s === 'stop org.chromium.webview_shell').length, 18);
  for (const p of [APP, GEGEN]) assert.equal(aufrufe.filter((s) => s === `start ${p}`).length, 9);
});

async function sicherungsKontext(t, optionen = {}) {
  const tmp = resolve('scratchpad/paket-2.5-c4/tmp');
  await mkdir(tmp, { recursive: true });
  const ausgabe = await mkdtemp(join(tmp, 'emulator-sicherung-test-'));
  t.after(() => rm(ausgabe, { recursive: true, force: true }));
  const aufrufe = []; const deferred = []; const befunde = [];
  let marker, parameter = 'null';
  const ctx = {
    api: 36, app: APP, gegen: GEGEN, ausgabe,
    defer: (f) => deferred.push(f), save: async () => {}, sleep: async () => {},
    stop: async (p) => { aufrufe.push(`stop ${p}`); },
    start: async (p) => { aufrufe.push(`start ${p}`); if (optionen.startFehler) throw new Error('Start absichtlich fehlgeschlagen'); },
    befund: (id, b) => befunde.push({ id, ...b }),
    cdp: async () => ({ events: [], send: async () => {}, evaluate: async (s) => { marker = s.match(/setItem\('emulator-sicherung',"([^"]+)"\)/)?.[1]; return marker; } }),
    adb: async ([befehl, quelle, ziel]) => {
      assert.equal(befehl, 'pull');
      assert.match(quelle, /Local Storage\/leveldb$/);
      await writeFile(join(ziel, 'daten.log'), marker);
      return { code: 0, out: '', err: '' };
    },
    shell: async (s) => {
      aufrufe.push(s);
      if (s === 'bmgr enabled') return 'Backup Manager currently disabled';
      if (s === 'bmgr activated') return 'Backup Manager currently activated';
      if (s === 'bmgr list transports') return '  * com.android.localtransport/.LocalTransport';
      if (s === 'settings get secure backup_local_transport_parameters') return parameter;
      if (s === 'settings put secure backup_local_transport_parameters is_device_transfer=true') { parameter = 'is_device_transfer=true'; return ''; }
      if (s === 'settings delete secure backup_local_transport_parameters') { parameter = 'null'; return ''; }
      if (s === 'getprop log.tag.BackupXmlParserLogging') return '';
      if (s.startsWith('bmgr wipe ')) return `Wiped backup data for ${s.split(' ').at(-1)} on com.android.localtransport/.LocalTransport`;
      if (s.startsWith('dumpsys package ')) return `User 0: installed=true stopped=${optionen.gestoppt ?? false} hidden=false`;
      if (s.startsWith('bmgr backupnow ')) return `Running incremental backup for 1 requested packages.\nPackage ${s.split(' ').at(-1)} with result: Backup is not allowed\nBackup finished with result: Success`;
      if (s.startsWith('ls -1 ')) return '';
      if (optionen.restoreFehler && s === 'bmgr enable false') throw new Error('Rückbau absichtlich fehlgeschlagen');
      return '';
    },
  };
  return { ctx, aufrufe, deferred, befunde };
}

test('Sicherung: nach Startfehler werden alle Einstellungen wiederhergestellt', async (t) => {
  const { ctx, aufrufe, deferred } = await sicherungsKontext(t, { startFehler: true });
  await assert.rejects(sicherung(ctx), /Start absichtlich/);
  assert.ok(aufrufe.includes('bmgr enable false'));
  assert.ok(aufrufe.includes('bmgr activate true'));
  assert.ok(aufrufe.includes("setprop log.tag.BackupXmlParserLogging ''"));
  assert.ok(!aufrufe.some((s) => s.startsWith('bmgr backupnow ')));
  assert.equal(deferred.length, 1);
  const anzahl = aufrufe.length;
  await deferred[0]();
  assert.equal(aufrufe.length, anzahl, 'Erfolgreicher Rückbau ist idempotent');
});

test('Sicherung: ein Fehler im Rückbau verhindert keine weiteren Rückbauschritte', async (t) => {
  const { ctx, aufrufe } = await sicherungsKontext(t, { startFehler: true, restoreFehler: true });
  await assert.rejects(sicherung(ctx), /nicht vollständig zurückgesetzt/);
  assert.ok(aufrufe.indexOf('bmgr activate true') > aufrufe.indexOf('bmgr enable false'));
  assert.ok(aufrufe.includes("setprop log.tag.BackupXmlParserLogging ''"));
});

test('Sicherung: stopped=true stoppt vor backupnow; der Rückbau läuft trotzdem', async (t) => {
  const { ctx, aufrufe } = await sicherungsKontext(t, { gestoppt: true });
  await assert.rejects(sicherung(ctx), /stopped=false/);
  assert.ok(!aufrufe.some((s) => s.startsWith('bmgr backupnow ')));
  assert.ok(aufrufe.includes('bmgr enable false'));
});

test('Sicherung: vor jeder Standard- und Gerätewechselprobe wird die App gestartet', async (t) => {
  const { ctx, aufrufe, befunde } = await sicherungsKontext(t);
  await sicherung(ctx);
  assert.equal(aufrufe.filter((s) => s.startsWith('bmgr backupnow ')).length, 4);
  for (let i = 0; i < aufrufe.length; i++) {
    if (!aufrufe[i].startsWith('bmgr backupnow ')) continue;
    const paket = aufrufe[i].split(' ').at(-1);
    assert.equal(aufrufe[i - 1], `dumpsys package ${paket}`);
    assert.equal(aufrufe[i - 2], 'input keyevent KEYCODE_HOME');
    assert.equal(aufrufe[i - 3], `start ${paket}`);
  }
  assert.equal(befunde.length, 2);
  assert.ok(befunde.every((b) => b.status === 'ungültig'), 'Gegenprobe ohne Archiv kann nicht bestehen');
});
