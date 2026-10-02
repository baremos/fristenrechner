#!/usr/bin/env node
// Windows-Emulatorprüfung. Ausführung und Auswertung sind getrennt; Import startet nichts.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { findeJdk } from './werkzeuge.mjs';
import { befund, zusammenfassen, rueckgabewert, zaehleBefunde, evaluiereActivity, evaluiereReleaseFlags, evaluiereUnixSockets, evaluiereInstallation, evaluiereReleaseStart, evaluiereRuhe, SICHTPRUEFUNGEN, sichtpruefungAusstehend } from './emulator-auswertung.mjs';
import { APP, GEGEN, SERIAL, Cdp, argumente, dateiNoetig, echterPfad, innen, mitAufraeumen, netzmelder, pause, prozess, schreiber, sha256, websocketPruefen } from './emulator/rahmen.mjs';
import { baueVarianten, signiereRelease, TESTEMPFANGER } from './emulator/bauen.mjs';
import { dateien } from './emulator/dateien.mjs';
import { menue } from './emulator/menue.mjs';
import { ablaufA, ablaufA8, ablaufA10, datumBefehl, fehlerseite } from './emulator/oberflaeche.mjs';
import { netz, navigation, sicherung, netzGueltigkeit } from './emulator/pruefungen.mjs';

export { argumente, mitAufraeumen } from './emulator/rahmen.mjs';
export const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Die Windows-Konsole des Emulators liefert auch CR CR LF.
export const avdName = text => text.split(/\r*\n/)[0].trim();

export async function geraeteDaten(ctx, api, phasen) {
  const installation = api === 24 && phasen.every(p => p === 'installation');
  const geraet = { api: String(api), fingerprint: await ctx.shell('getprop ro.build.fingerprint'), buildType: await ctx.shell('getprop ro.build.type'), webview: await ctx.shell('dumpsys webviewupdate'), packages: await ctx.shell('pm list packages -f -U') };
  if (installation && /Error: Unknown option: -U/.test(geraet.packages)) {
    geraet.packagesMitUid = geraet.packages;
    geraet.packages = await ctx.shell('pm list packages -f');
  }
  geraet.webviewVerfuegbar = /Current WebView package \(name, version\): \([^,]+, \d+(?:\.\d+)*\)/.test(geraet.webview);
  geraet.paketUidsVerfuegbar = /\buid:\d+/.test(geraet.packages);
  ctx.save('geraet.json', geraet);
  if (!geraet.fingerprint || !/^[a-z][a-z0-9_-]*$/.test(geraet.buildType ?? '') || !/^package:\/.+=\S+/m.test(geraet.packages) || (!installation && (!geraet.webviewVerfuegbar || !geraet.paketUidsVerfuegbar))) {
    throw new Error('Gerätefingerabdruck, Build-Typ, WebView-Version oder Paket-UIDs nicht vollständig lesbar.');
  }
  return geraet;
}

export function systemDialog({ activity = '', xml = '' }) {
  return /^\s*m(?:CurrentFocus|FocusedWindow)=.*Application Not Responding:\s*com\.android\.systemui\b/im.test(activity)
    || /System UI isn.t responding|Systemoberfläche[^"<>]*(?:reagiert|antwortet) nicht/i.test(xml);
}

// Nur vollständig geschlossene UI-Automator-Bäume sind als Tippgrundlage geeignet.
// Fremde XML-Konstrukte und doppelte Attribute werden nicht ausgewertet.
export function ansichtsKnoten(xml) {
  if (typeof xml !== 'string') return null;
  const inhalt = xml.trim().replace(/^<\?xml\s[^?]*\?>\s*/, '');
  if (!/^<hierarchy\b/.test(inhalt) || !/<\/hierarchy>$/.test(inhalt)) return null;
  const stapel = [], knoten = [];
  const teile = inhalt.match(/<[^>]*>|[^<]+/g) ?? [];
  if (teile.join('') !== inhalt) return null;
  let wurzeln = 0;
  for (const teil of teile) {
    if (!teil.startsWith('<')) { if (teil.trim()) return null; continue; }
    const ende = /^<\/(hierarchy|node)\s*>$/.exec(teil);
    if (ende) { if (stapel.pop() !== ende[1]) return null; continue; }
    // uiautomator setzt einen Wert in einfache Anführungszeichen, wenn er doppelte enthält
    // (beobachtet 2026-10-01 bei einer Meldung der Oberfläche mit „"999"“).
    const anfang = /^<(hierarchy|node)((?:\s+[\w:-]+=(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>$/.exec(teil);
    if (!anfang) return null;
    const [, art, roh, selbst] = anfang;
    if (art === 'hierarchy') { if (stapel.length || wurzeln++) return null; }
    else if (!stapel.length) return null;
    const attribute = {};
    for (const [, key, doppelt, einfach] of roh.matchAll(/\s+([\w:-]+)=(?:"([^"<>]*)"|'([^'<>]*)')/g)) {
      if (Object.hasOwn(attribute, key)) return null;
      attribute[key] = doppelt ?? einfach;
    }
    if (art === 'node') knoten.push(attribute);
    if (!selbst) stapel.push(art);
  }
  return wurzeln === 1 && stapel.length === 0 ? knoten : null;
}

export function systemWaitPunkt(xml) {
  const knoten = ansichtsKnoten(xml);
  // Der Fokus kann gegenüber dem Baum veraltet sein. Deshalb muss auch der
  // aktuelle native Dialogtitel die Systemoberfläche bezeichnen.
  const titel = knoten?.filter(a => a.package === 'android' && a.class === 'android.widget.TextView'
    && a['resource-id'] === 'android:id/alertTitle'
    && /^(?:System UI isn(?:'|&apos;)t responding|Systemoberfläche (?:reagiert|antwortet) nicht)$/.test(a.text ?? ''));
  if (titel?.length !== 1) return null;
  const treffer = knoten.filter(a => a.text === 'Wait' || a.text === 'Warten');
  if (treffer?.length !== 1) return null;
  const a = treffer[0];
  if (a.package !== 'android' || a.class !== 'android.widget.Button' || a.clickable !== 'true' || a.enabled !== 'true' || a['visible-to-user'] === 'false') return null;
  const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(a.bounds ?? '');
  if (!m) return null;
  const bounds = m.slice(1).map(Number), [l, o, r, u] = bounds;
  if (!bounds.every(Number.isSafeInteger) || r <= l || u <= o) return null;
  return { text: a.text, bounds, x: l + Math.floor((r - l) / 2), y: o + Math.floor((u - o) / 2) };
}

export const ANSICHT_REMOTE = '/data/local/tmp/fristenrechner-emulator.xml';

// Nur im aktuellen Lauf ausdrücklich übernommene Dateien, niemals der ganze
// Download-Ordner: dort können Belege anderer Läufe liegen.
export async function dateienAufraeumen(ctx) {
  const befunde = [], fehler = [];
  for (const pfad of ctx.dateienDateien ?? []) {
    try {
      if (typeof pfad !== 'string' || !/^\/sdcard\/Download\/[^/\\\x00-\x1f]+$/.test(pfad) || ['.', '..'].includes(pfad.slice('/sdcard/Download/'.length))) throw new Error('Ungültiger Dateipfad für das Aufräumen.');
      const q = `'${pfad.replaceAll("'", "'\\''")}'`;
      await ctx.shell(`rm -f -- ${q}`);
      const nachher = await ctx.shell(`if [ -e ${q} ]; then echo vorhanden; else echo entfernt; fi`);
      if (nachher !== 'entfernt') throw new Error('Datei nach dem Aufräumen noch vorhanden.');
      befunde.push({ pfad, entfernt: true });
    } catch (e) { befunde.push({ pfad, entfernt: false, fehler: e.message }); fehler.push(e.message); }
  }
  ctx.save('dateien-aufraeumen.json', { schema: 1, dateien: befunde });
  if (fehler.length) throw new Error(fehler.join('; '));
}

export async function leseAnsichtsbaum(ctx, name, { timeoutMs = 120000 } = {}) {
  const remote = ANSICHT_REMOTE;
  // Während die Oberfläche sich ändert, liefert uiautomator gelegentlich keinen
  // Baum („null root node“, beobachtet 2026-10-01 auf fr-api30 beim Öffnen der
  // Dateiauswahl). Bis zu drei Versuche; jeder wird mit seinem Ergebnis belegt.
  const versuche = [];
  try {
    for (let versuch = 1; versuch <= 3; versuch++) {
      // Eine alte Datei darf nach einem erfolglosen dump nicht als neuer Beleg gelten.
      await ctx.shell(`rm -f ${remote}`, { timeoutMs });
      const dump = await ctx.adb(['shell', `uiautomator dump ${remote}`], { timeoutMs });
      const lesen = await ctx.adb(['shell', `cat ${remote}`], { timeoutMs });
      const xml = lesen.out.replaceAll('\r\n', '\n').trim();
      ctx.save(`${name}-ansicht.xml`, xml);
      const vollstaendig = ansichtsKnoten(xml) !== null;
      const gueltig = [0, 137].includes(dump.code) && lesen.code === 0 && vollstaendig;
      versuche.push({ versuch, dump, lesen: { code: lesen.code, err: lesen.err }, vollstaendig, gueltig });
      ctx.save(`${name}-uiautomator.json`, { ...versuche.at(-1), versuche });
      if (gueltig) return xml;
      if (versuch < 3) await (ctx.sleep ? ctx.sleep(700) : Promise.resolve());
    }
    const letzter = versuche.at(-1);
    throw new Error(`Ansichtsbaum nicht lesbar (dump ${letzter.dump.code}, Lesen ${letzter.lesen.code}, vollständig ${letzter.vollstaendig}; ${versuche.length} Versuche).`);
  } finally { await ctx.shell(`rm -f ${remote}`, { timeoutMs }); }
}

// Die App kann die oberste Activity sein, obwohl der ANR-Dialog darüber liegt.
// Nur die eindeutig belegte Wait-Schaltfläche wird betätigt, höchstens dreimal.
export async function warteAufSystemoberflaeche(ctx, name, { ui = false, maxVersuche = 3 } = {}) {
  if (!Number.isInteger(maxVersuche) || maxVersuche < 0 || maxVersuche > 3) throw new Error('Ungültige Anzahl der Wait-Versuche.');
  const versuche = [];
  for (let versuch = 0; versuch <= maxVersuche; versuch++) {
    const belegName = `${name}-systemui-${versuch}`;
    const activity = await ctx.shell('dumpsys activity activities', { timeoutMs: 10000 });
    ctx.save(`${belegName}.activity.txt`, activity);
    const baumLesen = ui || versuch > 0 || systemDialog({ activity });
    const beleg = { versuch, activity: `${belegName}.activity.txt`, ...(baumLesen ? { xml: `${belegName}-ansicht.xml` } : {}) };
    versuche.push(beleg);
    let xml = '';
    try { if (baumLesen) xml = await ctx.uiBaum(belegName, { timeoutMs: 10000 }); }
    catch (e) { beleg.ergebnis = `Ansichtsbaum fehlt: ${e.message}`; ctx.save(`${name}-systemui.json`, versuche); throw e; }
    const verdeckt = systemDialog({ activity, xml });
    beleg.verdeckt = verdeckt;
    beleg.ergebnis = verdeckt ? 'Systemdialog sichtbar' : 'Kein Systemdialog sichtbar';
    if (versuch > 0) versuche[versuch - 1].nachpruefung = { verdeckt, activity: beleg.activity, xml: beleg.xml, ergebnis: beleg.ergebnis };
    ctx.save(`${name}-systemui.json`, versuche);
    if (!verdeckt) {
      if (versuch > 0) ctx.befund('Systemdialog mit Wait geschlossen', befund('bestanden', `${name}: nach ${versuch} Wait-Betätigungen nicht mehr sichtbar; Rohbeleg ${name}-systemui.json.`, { pruefort: name, versuche: versuch, beleg: `${name}-systemui.json` }));
      return { activity, xml, waitVersuche: versuch };
    }
    if (versuch === maxVersuche) throw new Error(`Dialog der Systemoberfläche nach ${maxVersuche} Wait-Versuchen weiterhin sichtbar; Prüfung ungültig.`);
    const punkt = systemWaitPunkt(xml);
    if (!punkt) {
      beleg.ergebnis = 'Keine eindeutige betätigbare Schaltfläche mit genau Wait oder Warten und aktuellem SystemUI-Dialogtitel gefunden';
      ctx.save(`${name}-systemui.json`, versuche);
      throw new Error('Aktueller SystemUI-Dialogtitel oder Wait/Warten-Knoten mit eindeutigen bounds nicht gefunden; kein Tippen, Prüfung ungültig.');
    }
    beleg.tipp = punkt;
    ctx.save(`${name}-systemui.json`, versuche);
    try { await ctx.shell(`input tap ${punkt.x} ${punkt.y}`, { timeoutMs: 10000 }); beleg.ergebnis = 'Wait betätigt; Nachprüfung folgt'; }
    catch (e) { beleg.ergebnis = `Wait-Eingabe fehlgeschlagen: ${e.message}`; ctx.save(`${name}-systemui.json`, versuche); throw e; }
    ctx.save(`${name}-systemui.json`, versuche);
    ctx.log(`Systemdialog: ${punkt.text} an belegten Koordinaten ${punkt.x},${punkt.y} betätigt (${versuch + 1}/3); Nachprüfung in 10 Sekunden.`);
    await ctx.sleep(10000);
  }
}

export async function bildschirmfoto(ctx, name, { ui = true } = {}) {
  const basis = name.replace(/\.png$/, '');
  let benutzt = (await warteAufSystemoberflaeche(ctx, basis, { ui })).waitVersuche;
  for (let aufnahme = 0; aufnahme <= 3; aufnahme++) {
    const r = await ctx.adb(['exec-out', 'screencap', '-p'], { binary: true });
    if (r.code !== 0 || !Buffer.isBuffer(r.out) || !r.out.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Bildschirmfoto nicht lesbar.');
    // Erst nach der Nachprüfung als gültiges Zielbild ablegen. Verdeckte Bilder
    // behalten einen gesonderten Rohbeleg und werden nach Wait neu aufgenommen.
    const nachher = await warteAufSystemoberflaeche(ctx, `${basis}-nach-bild-${aufnahme}`, { ui, maxVersuche: 3 - benutzt });
    if (nachher.waitVersuche === 0) {
      ctx.save(name, r.out); ctx.save(`${name}.activity.txt`, nachher.activity);
      if (ui) ctx.save(`${basis}-ansicht.xml`, nachher.xml);
      return;
    }
    ctx.save(`${basis}-vor-wait-${aufnahme}.png`, r.out);
    benutzt += nachher.waitVersuche;
  }
  throw new Error('Bildschirmfoto nach Wait nicht belegbar.');
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

export function repositories() {
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
    ...(phasen.some(p => ['a', 'b', 'netz', 'navigation', 'sicherung', 'dateien'].includes(p)) ? ['gegenprobe'] : []),
    ...(phasen.includes('dateien') ? ['testempfaenger'] : []),
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
  ctx.befund('B-Socket', evaluiereUnixSockets({ text: unix, debugSocketNachgewiesen, buildType: ctx.geraet.buildType }));
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
  ctx.befund('B-Sichtprüfung', sichtpruefungAusstehend(SICHTPRUEFUNGEN['B-Sichtprüfung']));
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
  let befehlNummer = 0, startNummer = 0, logcatFehler = null;
  const controller = new AbortController();
  const signal = () => { abbruch = true; controller.abort(); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  const ctx = { ...optionen, wurzel, app: APP, gegen: GEGEN, sdk, env, ausgabe: optionen.ausgabe, save, dateienDateien: new Set(),
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
      const { activity: top } = await warteAufSystemoberflaeche(ctx, `start-${++startNummer}`);
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
      let socket, socketPid;
      for (let i = 0; i < 25; i++) {
        const pid = (await ctx.shell(`pidof ${pkg}`)).trim();
        const text = await ctx.shell('cat /proc/net/unix');
        if (/^\d+$/.test(pid) && new RegExp(`@webview_devtools_remote_${pid}\\b`).test(text)) { socket = `webview_devtools_remote_${pid}`; socketPid = pid; break; }
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
      c.pageId = seite.id; c.pid = socketPid;
      try { for (const d of ['Runtime', 'Page', 'Network', 'Log']) await c.send(`${d}.enable`); }
      catch (e) { c.close(); throw e; }
      verbindungen.set(pkg, c);
      save(`cdp-${pkg}.json`, { socket, liste });
      await ctx.sleep(1200);
      return c;
    },
    async uiBaum(name, opt = {}) { return leseAnsichtsbaum(ctx, name, opt); },
    async shot(name, opt = {}) { return bildschirmfoto(ctx, name, opt); },
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
    ['Dateiprüfung: Download-Dateien', async () => { if (deviceOwned) await dateienAufraeumen(ctx); }],
    ['Testempfänger deinstallieren', async () => { if (deviceOwned && owned.has(TESTEMPFANGER)) await ctx.uninstall(TESTEMPFANGER); }],
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
        if (optionen.phasen.some(p => ['b', 'dateien', 'menue'].includes(p))) dateiNoetig(optionen.release);
        daten.apkEingang = { debug: sha256(optionen.debug), ...(optionen.phasen.some(p => ['b', 'dateien', 'menue'].includes(p)) ? { release: sha256(optionen.release) } : {}) };
        const devices = await run(adbExe, ['devices'], { env });
        const tasks = await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { env });
        save('geraete-vorher.txt', devices.out); save('prozesse-vorher.txt', tasks.out);
        if (devices.code !== 0 || tasks.code !== 0) throw new Error('Laufende Emulatoren konnten nicht sicher geprüft werden.');
        if (/emulator-\d+\s/.test(devices.out) || /qemu-system|"emulator\.exe"/i.test(tasks.out)) throw new Error('Es läuft bereits ein Emulator. Vorher beenden.');
        if (variantePlan(optionen.phasen).length || optionen.phasen.includes('menue')) {
          const jdk = findeJdk(); if (!jdk.pfad) throw new Error('Das eingerichtete JDK 21 fehlt.');
          ctx.java = join(jdk.pfad, 'bin/java.exe'); ctx.debugKey = join(homedir(), '.android/debug.keystore');
          ctx.apksigner = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar');
          if (variantePlan(optionen.phasen).length) ctx.varianten = await baueVarianten(ctx, variantePlan(optionen.phasen));
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
        await warteAufSystemoberflaeche(ctx, 'systemstart');
        const root = await ctx.adb(['root']); if (root.code !== 0) throw new Error('adb root nicht verfügbar.');
        const wait = await ctx.adb(['wait-for-device']); if (wait.code !== 0) throw new Error('Gerät nach adb root nicht erreichbar.');
        const id = await ctx.shell('id'); if (!/uid=0\(root\)/.test(id)) throw new Error('Root-Shell nicht bestätigt.');
        const api = await ctx.shell('getprop ro.build.version.sdk'); if (api !== String(optionen.api)) throw new Error('API des gestarteten Geräts stimmt nicht.');
        daten.geraet = { ...await geraeteDaten(ctx, optionen.api, optionen.phasen), id };
        ctx.geraet = daten.geraet;
        save('geraet.json', daten.geraet);
        for (const pkg of [APP, GEGEN, ...(optionen.phasen.includes('dateien') ? [TESTEMPFANGER] : [])]) if ((await ctx.shell(`pm list packages ${pkg}`)).split('\n').includes(`package:${pkg}`)) throw new Error(`Paket ${pkg} ist schon installiert. Lauf abgebrochen, vorhandene Daten bleiben erhalten.`);
        logcatFd = openSync(join(optionen.ausgabe, 'logcat.txt'), 'w');
        logcat = launch(adbExe, ['-s', SERIAL, 'logcat', '-v', 'time'], { env, windowsHide: true, stdio: ['ignore', logcatFd, logcatFd] });
        logcat.on('error', e => { logcatFehler = `Fortlaufendes logcat: ${e.message}`; });
        logcat.on('exit', (code, sig) => { if (!cleaning) logcatFehler = `Fortlaufendes logcat endete vor dem Aufräumen (Code ${code}, Signal ${sig}).`; });
        await ctx.sleep(200); if (logcatFehler || !logcat.pid) throw new Error('Fortlaufendes logcat kann nicht gestartet werden.');
        if (optionen.phasen.some(p => ['a', 'a8', 'dateien', 'menue'].includes(p))) {
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
            else if (phase === 'dateien') await dateien(ctx);
            else if (phase === 'menue') await menue(ctx);
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
    daten.sichtpruefungAusstehend = daten.befund.filter(b => b.status === 'Sichtprüfung ausstehend');
    daten.abnahme = 'Code 3: nur dokumentierte Grenzen; jede Einschränkung ausdrücklich bewerten und akzeptieren oder ergänzend belegen. Code 2: Messungen ungültig. Code 4: Sichtprüfung ausstehend; verhindert Code 0, macht auswertbare Messungen aber nicht ungültig. Kein vollständiges Bestehen.';
    save('ergebnis.json', daten);
    save('zusammenfassung.txt', [`API ${optionen.api}, Ablauf ${optionen.ablauf}`, `Ergebnis: ${daten.ergebnis}; Rückgabewert ${daten.code}`, `Einzelbefunde: ${Object.entries(daten.anzahl).map(([status, n]) => `${n} ${status}`).join(', ')}`, ...daten.befund.map(b => `${b.id}: ${b.status} – ${b.grund}`), '', daten.abnahme, '', ...daten.grenzen, '', ...daten.aufraeumen.map(a => `Aufräumen ${a.name}: ${a.status}${a.fehler ? ` – ${a.fehler}` : ''}`)].join('\n') + '\n');
  }
  return daten.code;
}

export async function main(argv = process.argv.slice(2)) {
  let optionen;
  try { optionen = argumente(argv, wurzel, repositories()); }
  catch (e) { console.error(`Argumentfehler: ${e.message}\nAufruf: node scripts/emulator-lauf.mjs --api 36|30|24 --ablauf a|a8|a10|b|netz|navigation|dateien|menue|sicherung|fehlerseite|installation|alle --ausgabe <Ordner> [--apk-debug <Datei>] [--apk-release <Datei>] [--varianten <Ordner>] [--wipe-data] [--nur-argumente]`); return 64; }
  if (optionen.nurArgumente) {
    console.log(JSON.stringify({ ...optionen, varianten: variantePlan(optionen.phasen), emulatorGestartet: false, hinweis: 'Nur Argumentprüfung; keine APK-Prüfung, kein Build, kein Emulatorstart und keine Ausgabe angelegt.' }, null, 2));
    return 0;
  }
  try { return await lauf(optionen); }
  catch (e) { console.error(`Messung ungültig: ${e.message}`); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
