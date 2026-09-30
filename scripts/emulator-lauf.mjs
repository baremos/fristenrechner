#!/usr/bin/env node
// Windows-Emulatorprüfung. Ausführung und Auswertung sind getrennt; Import startet nichts.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { findeJdk } from './werkzeuge.mjs';
import { befund, zusammenfassen, rueckgabewert, zaehleBefunde, evaluiereActivity, evaluiereReleaseFlags, evaluiereUnixSockets, evaluiereInstallation, evaluiereReleaseStart, evaluiereRuhe } from './emulator-auswertung.mjs';
import { APP, GEGEN, SERIAL, Cdp, argumente, dateiNoetig, echterPfad, innen, mitAufraeumen, netzmelder, pause, prozess, schreiber, sha256, websocketPruefen } from './emulator/rahmen.mjs';
import { baueVarianten, signiereRelease } from './emulator/bauen.mjs';
import { ablaufA, ablaufA8, ablaufA10, datumBefehl, fehlerseite } from './emulator/oberflaeche.mjs';
import { netz, navigation, sicherung, netzGueltigkeit } from './emulator/pruefungen.mjs';

export { argumente, mitAufraeumen } from './emulator/rahmen.mjs';
export const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Die Windows-Konsole des Emulators liefert auch CR CR LF.
export const avdName = text => text.split(/\r*\n/)[0].trim();

export async function geraeteDaten(ctx, api, phasen) {
  const installation = api === 24 && phasen.every(p => p === 'installation');
  const geraet = { api: String(api), fingerprint: await ctx.shell('getprop ro.build.fingerprint'), webview: await ctx.shell('dumpsys webviewupdate'), packages: await ctx.shell('pm list packages -f -U') };
  if (installation && /Error: Unknown option: -U/.test(geraet.packages)) {
    geraet.packagesMitUid = geraet.packages;
    geraet.packages = await ctx.shell('pm list packages -f');
  }
  geraet.webviewVerfuegbar = /Current WebView package \(name, version\): \([^,]+, \d+(?:\.\d+)*\)/.test(geraet.webview);
  geraet.paketUidsVerfuegbar = /\buid:\d+/.test(geraet.packages);
  ctx.save('geraet.json', geraet);
  if (!geraet.fingerprint || !/^package:\/.+=\S+/m.test(geraet.packages) || (!installation && (!geraet.webviewVerfuegbar || !geraet.paketUidsVerfuegbar))) {
    throw new Error('Gerätefingerabdruck, WebView-Version oder Paket-UIDs nicht vollständig lesbar.');
  }
  return geraet;
}

export async function stelleEinstellungZurueck(ctx, table, key, value) {
  if (typeof value !== 'string' || !/^(?:null|-?\d+(?:\.\d+)?)$/.test(value)) throw new Error(`Ursprüngliche Einstellung ${key} nicht lesbar.`);
  const standardSchrift = key === 'font_scale' && value === 'null';
  // Den wirksamen Standard zuerst setzen: eine Löschung allein kann asynchron
  // wieder als 1.0 erscheinen. Ein anderer Schriftfaktor ist nie ausreichend.
  if (standardSchrift) await ctx.shell('settings put system font_scale 1.0');
  let aktuell;
  for (let versuch = 0; versuch < 3; versuch++) {
    await ctx.shell(value === 'null' ? `settings delete ${table} ${key}` : `settings put ${table} ${key} ${value}`);
    await ctx.sleep(250);
    aktuell = await ctx.shell(`settings get ${table} ${key}`);
    if (aktuell === value || (value !== 'null' && /^-?\d+(?:\.\d+)?$/.test(aktuell) && Number(aktuell) === Number(value))) break;
  }
  const korrekt = aktuell === value || (value !== 'null' && /^-?\d+(?:\.\d+)?$/.test(aktuell) && Number(aktuell) === Number(value)) || (standardSchrift && /^1(?:\.0+)?$/.test(aktuell));
  const beleg = { table, key, vorher: value, nachher: aktuell, wirksamerStandard: standardSchrift && aktuell !== 'null', korrekt };
  ctx.save(`wiederherstellung-${key}.json`, beleg);
  if (!korrekt) throw new Error(`Einstellung ${key} wurde nicht wiederhergestellt (vorher ${value}, nachher ${aktuell}).`);
  return beleg;
}

function repositories() {
  const repos = [wurzel], git = join(wurzel, '.git');
  if (existsSync(git)) {
    try {
      const m = /^gitdir: (.+)/.exec(readFileSync(git, 'utf8'));
      if (m) {
        const dir = resolve(wurzel, m[1].trim());
        const common = resolve(dir, readFileSync(join(dir, 'commondir'), 'utf8').trim());
        repos.push(dirname(common));
      }
    } catch (e) { if (e.code !== 'EISDIR') throw e; }
  }
  return repos;
}

export function variantePlan(phasen) {
  return [...new Set([
    ...(phasen.some(p => ['a', 'b', 'netz', 'navigation', 'sicherung'].includes(p)) ? ['gegenprobe'] : []),
    ...(phasen.includes('fehlerseite') ? ['fehlerseite', 'ohne-fehlerseite'] : []),
  ])];
}

export async function ablaufB(ctx) {
  // Der Debug-Build ist die konkrete Gegenprobe für Flags und Socket-Erkennung.
  await ctx.uninstall(ctx.app); await ctx.install(ctx.debug, ctx.app); await ctx.start(ctx.app);
  await ctx.cdp(ctx.app);
  const debugUnix = await ctx.shell('cat /proc/net/unix');
  const debugPackage = await ctx.shell(`dumpsys package ${ctx.app}`);
  ctx.save('b-debug-unix.txt', debugUnix); ctx.save('b-debug-package.txt', debugPackage);
  const debugSocketNachgewiesen = /@webview_devtools_remote_\d+\b/.test(debugUnix);
  const flagsGegen = evaluiereReleaseFlags({ dumpsys: debugPackage, paket: ctx.app });
  ctx.befund('B-Flags-Gegenprobe', flagsGegen.status === 'nicht bestanden' && /\bDEBUGGABLE\b/.test(debugPackage)
    ? befund('bestanden', 'Debug-Build wird als Gegenprobe zurückgewiesen.') : befund('ungültig', 'Debug-Gegenprobe für Paketkennzeichen ohne Wirkung.'));
  await ctx.uninstall(ctx.app);
  const apk = await signiereRelease(ctx, ctx.release);
  await ctx.install(apk, ctx.app);
  const vorher = await netzGueltigkeit(ctx, 'release-vorher');
  const countVorher = ctx.netz.count;
  await ctx.start(ctx.app); await ctx.sleep(5000);
  await ctx.shot('b-start.png');
  const xml = await ctx.uiBaum('b-start');
  const releasePackage = await ctx.shell(`dumpsys package ${ctx.app}`);
  const unix = await ctx.shell('cat /proc/net/unix');
  ctx.save('b-package.txt', releasePackage); ctx.save('b-unix.txt', unix);
  ctx.befund('B-Flags', evaluiereReleaseFlags({ dumpsys: releasePackage, paket: ctx.app }));
  ctx.befund('B-Socket', evaluiereUnixSockets({ text: unix, debugSocketNachgewiesen }));
  ctx.befund('B-Start', evaluiereReleaseStart({ xml }));
  for (let i = 0; i < 3; i++) { ctx.log(`Release: Ruhebeobachtung ${i * 20}–${(i + 1) * 20} s`); await ctx.sleep(20000); }
  const ruhe = ctx.netz.count - countVorher;
  await ctx.shell('input keyevent KEYCODE_HOME'); await ctx.sleep(5000);
  const hintergrund = ctx.netz.count - countVorher;
  await ctx.start(ctx.app); await ctx.sleep(5000);
  const rueckkehr = ctx.netz.count - countVorher;
  const nachher = await netzGueltigkeit(ctx, 'release-nachher');
  ctx.save('b-netz.json', { vorher, nachher, ruhe, hintergrund, rueckkehr });
  ctx.befund('B-Netz', evaluiereRuhe({ vorher, nachher, ruhe, hintergrund, rueckkehr }));
  ctx.befund('B-Sichtprüfung', befund('ungültig', 'Startbild, Systemleisten und Fehlerfalle im Bildschirmfoto noch manuell prüfen.'));
}

export async function lauf(optionen, { run = prozess, launch = spawn, sleep = pause } = {}) {
  if (process.platform !== 'win32') throw new Error('Der Emulatorlauf ist für das eingerichtete Windows-Testsystem vorgesehen.');
  websocketPruefen();
  if (existsSync(optionen.ausgabe) && readdirSync(optionen.ausgabe).length) throw new Error('Ausgabeordner ist nicht leer; bitte einen neuen Ordner wählen.');
  mkdirSync(optionen.ausgabe, { recursive: true });
  const save = schreiber(optionen.ausgabe);
  const tmp = join(optionen.ausgabe, 'tmp'); mkdirSync(tmp, { recursive: true });
  const sdk = join(process.env.LOCALAPPDATA, 'fristenrechner/android-sdk');
  const avdHome = join(process.env.LOCALAPPDATA, 'fristenrechner/avd');
  const env = { ...process.env, TEMP: tmp, TMP: tmp, ASTRO_TELEMETRY_DISABLED: '1', CI: '1', ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: avdHome };
  const adbExe = join(sdk, 'platform-tools/adb.exe'), emulatorExe = join(sdk, 'emulator/emulator.exe');
  const daten = { schema: 2, beginn: new Date().toISOString(), auswahl: optionen, node: process.version, befund: [], installationen: [], aufraeumen: [], grenzen: [
    'Netzaussage auf App-UID und Messzeitraum begrenzt. WebView-Paket und Systemverkehr werden nicht bewertet.',
    'Screenshots und Barrierebaum ersetzen keine Prüfung mit TalkBack auf einem echten Gerät.',
  ] };
  const verbindungen = new Map(), forwards = new Set(), owned = new Set(), deferred = [];
  let emulator = null, emuFd = null, logcat = null, logcatFd = null, deviceOwned = false, gestartet = false, abbruch = false, cleaning = false, snapshot = null;
  let befehlNummer = 0, logcatFehler = null;
  const controller = new AbortController();
  const signal = () => { abbruch = true; controller.abort(); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  const ctx = { ...optionen, wurzel, app: APP, gegen: GEGEN, sdk, env, ausgabe: optionen.ausgabe, save,
    log(message) { const z = `${new Date().toISOString()} ${message}`; console.log(z); appendFileSync(join(optionen.ausgabe, 'lauf.log'), `${z}\n`); },
    async sleep(ms) { for (let rest = ms; rest > 0; rest -= 1000) { if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.'); await sleep(Math.min(rest, 1000)); } },
    befund(id, wert) { daten.befund.push({ id, ...wert }); ctx.log(`${id}: ${wert.status} – ${wert.grund}`); save('ergebnis.json', daten); },
    async pruefung(id, fn) { try { ctx.befund(id, await fn()); } catch (e) { ctx.befund(id, befund('ungültig', e.message)); } },
    defer(fn) { deferred.push(fn); },
    async command(exe, args, name, opts = {}) {
      if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.');
      const r = await run(exe, args, { env, signal: cleaning ? undefined : controller.signal, ...opts });
      save(`${name}.txt`, `${r.out}\n${r.err}`);
      if (r.code !== 0) throw new Error(`${name}: Prozess fehlgeschlagen (${r.code}). Rohbeleg: ${name}.txt`);
      return r;
    },
    async adb(args, opt = {}) {
      if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.');
      const r = await run(adbExe, ['-s', SERIAL, ...args], { env, signal: cleaning ? undefined : controller.signal, ...opt });
      if (!opt.binary) appendFileSync(join(optionen.ausgabe, 'adb.jsonl'), JSON.stringify({ nr: ++befehlNummer, zeit: new Date().toISOString(), args, ...r }) + '\n');
      return r;
    },
    async shell(command, opt = {}) {
      const r = await ctx.adb(['shell', command], opt);
      if (r.code !== 0) throw new Error(`ADB-Shell fehlgeschlagen (${r.code}): ${command}: ${r.err}`);
      return r.out.replaceAll('\r\n', '\n').trim();
    },
    async stop(pkg) { verbindungen.get(pkg)?.close(); verbindungen.delete(pkg); await ctx.shell(`am force-stop ${pkg}`); },
    async start(pkg) {
      const out = await ctx.shell(`am start -W -n ${pkg}/de.baremos.fristenrechner.MainActivity`);
      if (!/^Status: ok$/m.test(out)) throw new Error(`Activity-Start nicht bestätigt: ${out}`);
      await ctx.sleep(2000);
      const top = await ctx.shell('dumpsys activity activities');
      const a = evaluiereActivity(top, pkg);
      if (a.status !== 'bestanden') throw new Error(`Activity nicht oben: ${a.grund}`);
    },
    async install(apk, pkg) {
      owned.add(pkg);
      const r = await ctx.adb(['install', '-r', apk], { timeoutMs: 180000 });
      if (r.code !== 0 || !/^Success\s*$/m.test(r.out)) throw new Error(`Installation von ${pkg} fehlgeschlagen: ${r.out} ${r.err}`);
      const paths = await ctx.shell(`pm path ${pkg}`);
      const m = /^package:(\/[^\r\n]+\.apk)$/.exec(paths);
      if (!m) throw new Error('Installierte APK nicht eindeutig gefunden.');
      const ziel = join(optionen.ausgabe, `installiert-${daten.installationen.length}.apk`);
      const pull = await ctx.adb(['pull', m[1], ziel]);
      if (pull.code !== 0) throw new Error('Installierte APK konnte nicht zur Prüfsumme gelesen werden.');
      const installiert = sha256(ziel), eingang = sha256(apk);
      const packages = await ctx.shell('pm list packages -f -U');
      daten.installationen.push({ paket: pkg, eingang, installiert, packages });
      rmSync(ziel);
      if (installiert !== eingang) throw new Error('Installierte APK weicht von der Eingabedatei ab.');
      save('installationen.json', daten.installationen);
    },
    async uninstall(pkg) {
      verbindungen.get(pkg)?.close(); verbindungen.delete(pkg);
      const packages = await ctx.shell(`pm list packages ${pkg}`);
      if (!packages.split('\n').includes(`package:${pkg}`)) return;
      const r = await ctx.adb(['uninstall', pkg]);
      if (r.code !== 0 || !/^Success\s*$/m.test(r.out)) throw new Error(`Deinstallation von ${pkg} fehlgeschlagen.`);
      if ((await ctx.shell(`pm list packages ${pkg}`)).split('\n').includes(`package:${pkg}`)) throw new Error(`Paket ${pkg} ist nach Deinstallation noch vorhanden.`);
    },
    async cdp(pkg, { neu = false } = {}) {
      if (neu) { verbindungen.get(pkg)?.close(); verbindungen.delete(pkg); }
      if (verbindungen.get(pkg)?.closed) verbindungen.delete(pkg);
      if (verbindungen.has(pkg)) return verbindungen.get(pkg);
      let socket;
      for (let i = 0; i < 25; i++) {
        const pid = (await ctx.shell(`pidof ${pkg}`)).trim();
        const text = await ctx.shell('cat /proc/net/unix');
        if (/^\d+$/.test(pid) && new RegExp(`@webview_devtools_remote_${pid}\\b`).test(text)) { socket = `webview_devtools_remote_${pid}`; break; }
        await ctx.sleep(1000);
      }
      if (!socket) throw new Error(`Kein WebView-Devtools-Socket für ${pkg}.`);
      const f = await ctx.adb(['forward', 'tcp:0', `localabstract:${socket}`]);
      const port = f.out.trim();
      if (f.code !== 0 || !/^\d+$/.test(port)) throw new Error('ADB-Weiterleitung nicht bestätigt.');
      forwards.add(port);
      let liste;
      for (let i = 0; i < 10; i++) {
        try { liste = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json(); if (Array.isArray(liste) && liste.some(p => p.type === 'page')) break; } catch { /* WebView startet noch. */ }
        await ctx.sleep(1000);
      }
      const seite = Array.isArray(liste) && liste.find(p => p.type === 'page');
      if (!seite || !/^[A-Za-z0-9_-]+$/.test(seite.id)) throw new Error('CDP-Ziel nicht lesbar.');
      const c = await Cdp.connect(`ws://127.0.0.1:${port}/devtools/page/${seite.id}`);
      try { for (const d of ['Runtime', 'Page', 'Network', 'Log']) await c.send(`${d}.enable`); }
      catch (e) { c.close(); throw e; }
      verbindungen.set(pkg, c);
      save(`cdp-${pkg}.json`, { socket, liste });
      await ctx.sleep(1200);
      return c;
    },
    async uiBaum(name) {
      const remote = '/data/local/tmp/fristenrechner-emulator.xml';
      try {
        await ctx.shell(`uiautomator dump ${remote}`);
        const xml = await ctx.shell(`cat ${remote}`); save(`${name}-ansicht.xml`, xml);
        if (!xml.includes('<hierarchy') || !xml.includes('</hierarchy>')) throw new Error('Ansichtsbaum nicht lesbar.');
        return xml;
      } finally { await ctx.shell(`rm -f ${remote}`); }
    },
    async shot(name, { ui = true } = {}) {
      const r = await ctx.adb(['exec-out', 'screencap', '-p'], { binary: true });
      if (r.code !== 0 || !Buffer.isBuffer(r.out) || !r.out.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Bildschirmfoto nicht lesbar.');
      save(name, r.out);
      const top = await ctx.shell('dumpsys activity activities'); save(`${name}.activity.txt`, top);
      if (!ui) return;
      const xml = await ctx.uiBaum(name.replace(/\.png$/, ''));
      if (/System UI isn.t responding|Systemoberfläche.*(?:reagiert|antwortet) nicht/i.test(xml)) throw new Error('Dialog der Systemoberfläche verdeckt die App; Bild nicht gültig.');
    },
    async restoreClock() {
      if (!snapshot) return;
      const errors = [];
      try { await ctx.shell(datumBefehl(snapshot.epoch + Math.floor((Date.now() - snapshot.host) / 1000))); } catch (e) { errors.push(e.message); }
      for (const key of ['auto_time', 'auto_time_zone']) {
        try { await settingZurueck('global', key, snapshot[key]); } catch (e) { errors.push(e.message); }
      }
      if (errors.length) throw new Error(errors.join('; '));
    },
    async restoreDisplay() {
      if (!snapshot) return;
      const steps = [['system', 'font_scale'], ['system', 'accelerometer_rotation'], ['system', 'user_rotation']];
      const errors = [];
      for (const [table, key] of steps) { try { await settingZurueck(table, key, snapshot[key]); } catch (e) { errors.push(e.message); } }
      try {
        await ctx.shell(`cmd uimode night ${snapshot.nacht}`);
        if (!(await ctx.shell('cmd uimode night')).includes(`Night mode: ${snapshot.nacht}`)) throw new Error('Nachtmodus wurde nicht wiederhergestellt.');
      } catch (e) { errors.push(e.message); }
      if (errors.length) throw new Error(errors.join('; '));
    },
  };
  async function settingZurueck(table, key, value) {
    return stelleEinstellungZurueck(ctx, table, key, value);
  }
  const cleanup = [
    ['CDP schließen', async () => { for (const c of verbindungen.values()) c.close(); verbindungen.clear(); }],
    ['Zusätzliche Einstellungen', async () => { const errors = []; for (const f of deferred.reverse()) { try { await f(); } catch (e) { errors.push(e.message); } } if (errors.length) throw new Error(errors.join('; ')); }],
    ['App deinstallieren', async () => { if (deviceOwned && owned.has(APP)) await ctx.uninstall(APP); }],
    ['Gegenprobe deinstallieren', async () => { if (deviceOwned && owned.has(GEGEN)) await ctx.uninstall(GEGEN); }],
    ['Uhr zurückstellen', async () => { if (deviceOwned && snapshot) await ctx.restoreClock(); }],
    ['Darstellung zurückstellen', async () => { if (deviceOwned && snapshot) await ctx.restoreDisplay(); }],
    ['Logcat sichern', async () => {
      if (deviceOwned) { const r = await ctx.adb(['logcat', '-d', '-v', 'time']); save('logcat-ende.txt', r.out); }
      if (logcatFehler) ctx.befund('Logcat', befund('ungültig', logcatFehler));
      if (logcat) { logcat.kill(); await pause(300); }
      if (logcatFd !== null) { closeSync(logcatFd); logcatFd = null; }
    }],
    ['ADB-Weiterleitungen entfernen', async () => { const errors = []; for (const port of forwards) { const r = await ctx.adb(['forward', '--remove', `tcp:${port}`]); if (r.code !== 0) errors.push(port); } if (errors.length) throw new Error(`Weiterleitungen nicht entfernt: ${errors.join(', ')}`); }],
    ['Netzmelder schließen', async () => { if (ctx.netz) { save('netzmelder.json', ctx.netz.annahmen); await ctx.netz.close(); } }],
    ['Emulator beenden', async () => {
      if (!gestartet) return;
      // Ein abgebrochener Systemstart ist ebenfalls aufzuräumen. Identität zuerst,
      // sonst ausschließlich den noch lebenden eigenen Prozessbaum beenden.
      const avd = await ctx.adb(['emu', 'avd', 'name'], { timeoutMs: 10000 });
      if (avd.code === 0 && avdName(avd.out) === `fr-api${optionen.api}`) await ctx.adb(['emu', 'kill']);
      else if (emulator?.pid && emulator.exitCode === null) await run('taskkill.exe', ['/PID', String(emulator.pid), '/T', '/F'], { env, timeoutMs: 15000 });
      for (let i = 0; i < 30; i++) {
        const r = await run(adbExe, ['devices'], { env });
        const tasks = await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { env });
        if (!/emulator-\d+\s/.test(r.out) && !/qemu-system|"emulator\.exe"/i.test(tasks.out)) return;
        await pause(1000);
      }
      throw new Error('Emulator läuft noch; snapshots werden nicht gelöscht.');
    }],
    ['Snapshots löschen', async () => {
      if (!gestartet) return;
      const tasks = await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { env });
      if (tasks.code !== 0 || /qemu-system|"emulator\.exe"/i.test(tasks.out)) throw new Error('Emulatorende für Snapshot-Löschung nicht belegt.');
      const avd = echterPfad(join(avdHome, `fr-api${optionen.api}.avd`));
      const snap = echterPfad(join(avd, 'snapshots'));
      if (!innen(realpathSync(avdHome), avd) || avd === realpathSync(avdHome) || !innen(avd, snap) || snap === avd) throw new Error('Snapshot-Pfad außerhalb des Testgeräts.');
      if (existsSync(snap)) rmSync(snap, { recursive: true });
    }],
    ['Emulatorprotokoll schließen', async () => { if (emuFd !== null) { closeSync(emuFd); emuFd = null; } }],
  ];
  try {
    await mitAufraeumen(async () => {
      try {
        dateiNoetig(adbExe); dateiNoetig(emulatorExe); dateiNoetig(optionen.debug);
        if (optionen.phasen.includes('b')) dateiNoetig(optionen.release);
        daten.apkEingang = { debug: sha256(optionen.debug), ...(optionen.phasen.includes('b') ? { release: sha256(optionen.release) } : {}) };
        const devices = await run(adbExe, ['devices'], { env });
        const tasks = await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { env });
        save('geraete-vorher.txt', devices.out); save('prozesse-vorher.txt', tasks.out);
        if (devices.code !== 0 || tasks.code !== 0) throw new Error('Laufende Emulatoren konnten nicht sicher geprüft werden.');
        if (/emulator-\d+\s/.test(devices.out) || /qemu-system|"emulator\.exe"/i.test(tasks.out)) throw new Error('Es läuft bereits ein Emulator. Vorher beenden.');
        if (variantePlan(optionen.phasen).length) {
          const jdk = findeJdk(); if (!jdk.pfad) throw new Error('Das eingerichtete JDK 21 fehlt.');
          ctx.java = join(jdk.pfad, 'bin/java.exe'); ctx.debugKey = join(homedir(), '.android/debug.keystore');
          ctx.apksigner = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar');
          ctx.varianten = await baueVarianten(ctx, variantePlan(optionen.phasen));
        }
        ctx.netz = await netzmelder(join(optionen.ausgabe, 'netzmelder.log'));
        emuFd = openSync(join(optionen.ausgabe, 'emulator.log'), 'w');
        const args = ['-avd', `fr-api${optionen.api}`, '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot', '-no-metrics', '-gpu', 'swiftshader_indirect', '-port', '5554', '-tcpdump', join(optionen.ausgabe, 'netz.pcap'), ...(optionen.wipeData ? ['-wipe-data'] : [])];
        emulator = launch(emulatorExe, args, { env, windowsHide: true, stdio: ['ignore', emuFd, emuFd] });
        let emuError = null; emulator.on('error', e => { emuError = e; });
        gestartet = !!emulator.pid;
        ctx.log(`Emulator fr-api${optionen.api} startet; höchstens acht Minuten bis Systemstart.`);
        let bereit = false;
        const bootEnde = Date.now() + 480000;
        for (let i = 0; Date.now() < bootEnde; i++) {
          if (emuError) throw emuError;
          const r = await ctx.adb(['shell', 'getprop sys.boot_completed'], { timeoutMs: 10000 });
          if (r.code === 0 && r.out.trim() === '1') { bereit = true; break; }
          if (i % 6 === 0) ctx.log('Warte auf den Systemstart.');
          await ctx.sleep(5000);
        }
        if (!bereit) throw new Error('Systemstart nicht erreicht.');
        const avd = await ctx.adb(['emu', 'avd', 'name']);
        if (avd.code !== 0 || avdName(avd.out) !== `fr-api${optionen.api}`) throw new Error('Testgerät auf Port 5554 ist nicht das gestartete Abbild.');
        deviceOwned = true;
        ctx.log('System gestartet; 45 Sekunden für die Systemoberfläche.'); await ctx.sleep(45000);
        const root = await ctx.adb(['root']); if (root.code !== 0) throw new Error('adb root nicht verfügbar.');
        const wait = await ctx.adb(['wait-for-device']); if (wait.code !== 0) throw new Error('Gerät nach adb root nicht erreichbar.');
        const id = await ctx.shell('id'); if (!/uid=0\(root\)/.test(id)) throw new Error('Root-Shell nicht bestätigt.');
        const api = await ctx.shell('getprop ro.build.version.sdk'); if (api !== String(optionen.api)) throw new Error('API des gestarteten Geräts stimmt nicht.');
        daten.geraet = { ...await geraeteDaten(ctx, optionen.api, optionen.phasen), id };
        save('geraet.json', daten.geraet);
        for (const pkg of [APP, GEGEN]) if ((await ctx.shell(`pm list packages ${pkg}`)).split('\n').includes(`package:${pkg}`)) throw new Error(`Paket ${pkg} ist schon installiert. Lauf abgebrochen, vorhandene Daten bleiben erhalten.`);
        logcatFd = openSync(join(optionen.ausgabe, 'logcat.txt'), 'w');
        logcat = launch(adbExe, ['-s', SERIAL, 'logcat', '-v', 'time'], { env, windowsHide: true, stdio: ['ignore', logcatFd, logcatFd] });
        logcat.on('error', e => { logcatFehler = `Fortlaufendes logcat: ${e.message}`; });
        logcat.on('exit', (code, sig) => { if (!cleaning) logcatFehler = `Fortlaufendes logcat endete vor dem Aufräumen (Code ${code}, Signal ${sig}).`; });
        await ctx.sleep(200); if (logcatFehler || !logcat.pid) throw new Error('Fortlaufendes logcat kann nicht gestartet werden.');
        if (optionen.phasen.some(p => ['a', 'a8'].includes(p))) {
          const vorher = { epoch: Number(await ctx.shell('date +%s')), host: Date.now() };
          if (!Number.isSafeInteger(vorher.epoch) || vorher.epoch < 1) throw new Error('Gerätezeit nicht lesbar.');
          for (const [table, key] of [['global', 'auto_time'], ['global', 'auto_time_zone'], ['system', 'font_scale'], ['system', 'accelerometer_rotation'], ['system', 'user_rotation']]) {
            vorher[key] = await ctx.shell(`settings get ${table} ${key}`);
            if (!/^(?:null|-?\d+(?:\.\d+)?)$/.test(vorher[key])) throw new Error(`Einstellung ${key} nicht lesbar.`);
          }
          const night = await ctx.shell('cmd uimode night');
          vorher.nacht = /Night mode: (auto|no|yes|custom)/i.exec(night)?.[1]?.toLowerCase();
          if (!vorher.nacht) throw new Error('Ursprünglicher Nachtmodus nicht lesbar.');
          snapshot = vorher;
          save('einstellungen-vorher.json', snapshot);
        }
        if (ctx.varianten?.gegenprobe) await ctx.install(ctx.varianten.gegenprobe, GEGEN);
        for (const phase of optionen.phasen) {
          ctx.log(`Beginne ${phase}.`);
          await ctx.pruefung(`ablauf-${phase}`, async () => {
            if (phase === 'installation') {
              owned.add(APP);
              const r = await ctx.adb(['install', optionen.debug], { timeoutMs: 180000 });
              save('installation-api24.txt', `${r.out}\n${r.err}`);
              return evaluiereInstallation({ code: r.code, ausgabe: `${r.out}\n${r.err}` });
            }
            if (phase === 'a') await ablaufA(ctx);
            else if (phase === 'a8' || phase === 'a10') {
              await ctx.uninstall(APP); await ctx.install(optionen.debug, APP); await ctx.start(APP);
              await (phase === 'a8' ? ablaufA8 : ablaufA10)(ctx);
            }
            else if (phase === 'b') await ablaufB(ctx);
            else if (phase === 'fehlerseite') await fehlerseite(ctx);
            else {
              await ctx.uninstall(APP); await ctx.install(optionen.debug, APP);
              await ({ netz, navigation, sicherung }[phase])(ctx);
            }
            return befund('bestanden', 'Ablauf ausgeführt; maßgeblich sind zusätzlich sämtliche Einzelbefunde.');
          });
        }
      } finally { cleaning = true; }
    }, cleanup, (name, error) => {
      daten.aufraeumen.push({ name, status: error ? 'nicht bestanden' : 'bestanden', ...(error ? { fehler: error.message } : {}) });
      if (error) ctx.befund(`Aufräumen: ${name}`, befund('nicht bestanden', error.message));
    });
  } catch (e) { ctx.befund('Laufrahmen', befund('ungültig', e.message)); }
  finally {
    process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
    daten.ende = new Date().toISOString(); daten.ergebnis = zusammenfassen(daten.befund).status; daten.code = rueckgabewert(daten.befund);
    daten.anzahl = zaehleBefunde(daten.befund);
    daten.dokumentierteGrenzen = daten.befund.filter(b => b.status === 'dokumentierte Grenze');
    daten.ausstehend = daten.befund.filter(b => b.status === 'ungültig');
    daten.abnahme = 'Code 3: nur dokumentierte Grenzen; jede Einschränkung ausdrücklich bewerten und akzeptieren oder ergänzend belegen. Code 2: Messungen oder Sichtprüfungen ausstehend. Beides ist kein vollständiges Bestehen.';
    save('ergebnis.json', daten);
    save('zusammenfassung.txt', [`API ${optionen.api}, Ablauf ${optionen.ablauf}`, `Ergebnis: ${daten.ergebnis}; Rückgabewert ${daten.code}`, `Einzelbefunde: ${Object.entries(daten.anzahl).map(([status, n]) => `${n} ${status}`).join(', ')}`, ...daten.befund.map(b => `${b.id}: ${b.status} – ${b.grund}`), '', daten.abnahme, '', ...daten.grenzen, '', ...daten.aufraeumen.map(a => `Aufräumen ${a.name}: ${a.status}${a.fehler ? ` – ${a.fehler}` : ''}`)].join('\n') + '\n');
  }
  return daten.code;
}

export async function main(argv = process.argv.slice(2)) {
  let optionen;
  try { optionen = argumente(argv, wurzel, repositories()); }
  catch (e) { console.error(`Argumentfehler: ${e.message}\nAufruf: node scripts/emulator-lauf.mjs --api 36|30|24 --ablauf a|a8|a10|b|netz|navigation|sicherung|fehlerseite|installation|alle --ausgabe <Ordner> [--apk-debug <Datei>] [--apk-release <Datei>] [--varianten <Ordner>] [--wipe-data]`); return 64; }
  try { return await lauf(optionen); }
  catch (e) { console.error(`Messung ungültig: ${e.message}`); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
