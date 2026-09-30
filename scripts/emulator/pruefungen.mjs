// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzipSync, inflateSync } from 'node:zlib';
import {
  evaluiereNetz, evaluiereNavigation, evaluiereSicherung, evaluiereActivity, evaluiereProcNet, evaluiereNetstats,
} from '../emulator-auswertung.mjs';

const TRANSPORT = 'com.android.localtransport/.LocalTransport';
const ABLAGE = '/data/data/com.android.localtransport/files/1/_full';
const PROTOKOLLE = ['tcp', 'tcp6', 'udp', 'udp6'];
const quote = (s) => `'${String(s).replaceAll("'", "'\\''")}'`;
const count = (ctx) => typeof ctx.netz.count === 'function' ? ctx.netz.count() : ctx.netz.count;
const ungueltig = (grund) => ({ status: 'ungültig', grund });

function paketPruefen(paket) {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(paket)) throw new Error('Ungültige App-ID.');
  return paket;
}

async function uid(ctx, paket) {
  paketPruefen(paket);
  const raw = await ctx.shell(`pm list packages -U ${paket}`);
  await ctx.save(`uid-${paket}.txt`, raw);
  const zeile = raw.split(/\r?\n/).find((s) => s.startsWith(`package:${paket} `));
  const treffer = zeile?.match(/\buid:(\d+)\s*$/);
  if (!treffer) throw new Error(`UID von ${paket} nicht lesbar.`);
  return Number(treffer[1]);
}

async function procNet(ctx) {
  const tabellen = {};
  for (const name of PROTOKOLLE) tabellen[name] = await ctx.shell(`cat /proc/net/${name}`);
  return tabellen;
}

async function verbinden(ctx, paket, neu = false) {
  if (neu) await ctx.stop(paket);
  await ctx.start(paket);
  await ctx.sleep(4000);
  const cdp = await ctx.cdp(paket);
  for (const domain of ['Runtime', 'Network', 'Log', 'Page']) await cdp.send(`${domain}.enable`);
  return cdp;
}

/** Das Textformat entspricht den aufgezeichneten CDP-Ereignissen. */
export function cdpZeilen(events) {
  return events.flatMap(({ method, params: p = {} }) => {
    switch (method) {
      case 'Network.loadingFailed': return [`loadingFailed type=${p.type} errorText=${p.errorText}${p.blockedReason ? ` blockedReason=${p.blockedReason}` : ''}${p.canceled ? ' canceled' : ''}`];
      case 'Network.requestWillBeSent': return [`requestWillBeSent ${p.request?.method} ${p.request?.url} type=${p.type}`];
      case 'Network.webSocketCreated': return [`webSocketCreated ${p.url}`];
      case 'Network.webSocketClosed': return ['webSocketClosed'];
      case 'Log.entryAdded': return [`Log ${p.entry?.source}/${p.entry?.level}: ${p.entry?.text}${p.entry?.url ? ` url=${p.entry.url}` : ''}`];
      case 'Runtime.exceptionThrown': return [`exception: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`];
      case 'Runtime.consoleAPICalled': return [`console.${p.type}: ${(p.args || []).map((a) => a.value ?? a.description).join(' ')}`];
      default: return [];
    }
  });
}

export function angriffe(port, marke, zufall) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Netzmelder-Port.');
  if (!/^[a-z0-9-]+$/i.test(marke) || !/^[a-z0-9-]+$/i.test(zufall)) throw new Error('Ungültige Messkennung.');
  const u = `https://10.0.2.2:${port}/${marke}`;
  return {
    fetch: `fetch('${u}-fetch',{cache:'no-store'}).then(r=>'ok '+r.status,e=>'abgelehnt: '+e.name+': '+e.message)`,
    xhr: `new Promise(res=>{const x=new XMLHttpRequest();x.open('GET','${u}-xhr');x.timeout=8000;x.onload=()=>res('load '+x.status);x.onerror=()=>res('error readyState='+x.readyState+' status='+x.status);x.ontimeout=()=>res('timeout');x.send()})`,
    image: `new Promise(res=>{const i=new Image();i.onload=()=>res('load');i.onerror=()=>res('error');i.src='${u}-image';setTimeout(()=>res('kein Ereignis nach 8 s'),8000)})`,
    iframe: `new Promise(res=>{const f=document.createElement('iframe');f.onload=()=>{let h;try{h=f.contentWindow.location.href}catch(e){h='nicht lesbar ('+e.name+')'}res('load, href='+h)};f.onerror=()=>res('error');f.src='${u}-iframe';document.body.appendChild(f);setTimeout(()=>res('kein Ereignis nach 8 s'),8000)})`,
    websocket: `new Promise(res=>{const w=new WebSocket('wss://10.0.2.2:${port}/${marke}-ws');w.onopen=()=>{res('open');w.close()};w.onclose=e=>res('close code='+e.code+' wasClean='+e.wasClean);setTimeout(()=>{res('kein Ereignis nach 8 s');w.close()},8000)})`,
    sendBeacon: `new Promise(res=>{const r=navigator.sendBeacon('${u}-beacon','x');setTimeout(()=>res('Rueckgabe '+r),4000)})`,
    eventSource: `new Promise(res=>{const s=new EventSource('${u}-es');s.onopen=()=>{res('open');s.close()};s.onerror=()=>{res('error readyState='+s.readyState);s.close()};setTimeout(()=>{res('kein Ereignis nach 8 s');s.close()},8000)})`,
    prefetch: `new Promise(res=>{const l=document.createElement('link');l.rel='prefetch';l.href='${u}-prefetch';l.onload=()=>res('load');l.onerror=()=>res('error');document.head.appendChild(l);setTimeout(()=>res('kein Ereignis nach 8 s'),8000)})`,
    capacitorHttp: `Capacitor.nativePromise('CapacitorHttp','request',{url:'${u}-caphttp',method:'GET',connectTimeout:8000,readTimeout:8000}).then(r=>'ok '+JSON.stringify(r),e=>'abgelehnt: message='+(e&&e.message)+' code='+(e&&e.code))`,
    invalid: `fetch('https://fr-probe-${zufall}-${marke}.invalid/',{cache:'no-store'}).then(r=>'ok '+r.status,e=>'abgelehnt: '+e.name+': '+e.message)`,
  };
}

async function messen(ctx, cdp, name, ausdruck) {
  const vorher = count(ctx);
  const eventIndex = cdp.events.length;
  const start = await cdp.evaluate(`(window.__emulatorMessung=(${ausdruck}),'gestartet')`);
  await ctx.sleep(800);
  const tabellen = await procNet(ctx);
  const ergebnis = await cdp.evaluate('window.__emulatorMessung');
  await ctx.sleep(1500);
  return { name, start, ergebnis, annahmen: count(ctx) - vorher, tabellen, cdp: cdpZeilen(cdp.events.slice(eventIndex)) };
}

/** Gegenprobe für jede Beobachtungsphase, auch vom Release-Lauf verwendbar. */
export async function netzGueltigkeit(ctx, name) {
  await ctx.stop(ctx.app);
  const cdp = await verbinden(ctx, ctx.gegen, true);
  const messung = await messen(ctx, cdp, 'fetch', angriffe(ctx.netz.port, name, randomUUID()).fetch);
  await ctx.save(`netz-gueltigkeit-${name}.json`, messung);
  await ctx.stop(ctx.gegen);
  await ctx.sleep(1000);
  return messung;
}

export async function netz(ctx) {
  const appUid = await uid(ctx, ctx.app);
  const gegenUid = await uid(ctx, ctx.gegen);
  const ergebnis = { appUid, gegenUid, app: [], gegen: [], grenzen: [
    'Aussage nur zur UID der App; Verkehr von WebView und System wird nicht bewertet.',
    'DNS-Anfragen sind mit dumpsys dnsresolver nicht nachweisbar; .invalid belegt nur die aufgezeichnete Fehlermeldung.',
  ] };
  ergebnis.vorher = await netzGueltigkeit(ctx, 'vorher');
  if (ergebnis.vorher.annahmen < 1) {
    ctx.befund('netz', ungueltig('Die Gegenprobe erreicht den Netzmelder vor der App-Phase nicht.'));
    await ctx.save('netz.json', ergebnis);
    return ergebnis;
  }
  const cdp = await verbinden(ctx, ctx.app, true);
  ergebnis.procVorher = await procNet(ctx);
  ergebnis.netstatsVorher = await ctx.shell('dumpsys netstats detail');
  for (const [name, ausdruck] of Object.entries(angriffe(ctx.netz.port, 'app', randomUUID()))) {
    const messung = await messen(ctx, cdp, name, ausdruck);
    ergebnis.app.push(messung);
    await ctx.save(`netz-app-${name}.json`, messung);
  }
  ergebnis.procNachher = await procNet(ctx);
  ergebnis.netstatsNachher = await ctx.shell('dumpsys netstats detail');
  await ctx.save('netz-netstats-vorher.txt', ergebnis.netstatsVorher);
  await ctx.save('netz-netstats-nachher.txt', ergebnis.netstatsNachher);
  await ctx.stop(ctx.app);
  // Ein frischer Prozess je Angriffsweg verhindert Annahmen aus dem Vorgänger.
  for (const [name, ausdruck] of Object.entries(angriffe(ctx.netz.port, 'gegen', randomUUID()))) {
    const gegen = await verbinden(ctx, ctx.gegen, true);
    const messung = await messen(ctx, gegen, name, ausdruck);
    ergebnis.gegen.push(messung);
    await ctx.save(`netz-gegen-${name}.json`, messung);
    await ctx.stop(ctx.gegen);
    await ctx.sleep(1000);
  }
  ergebnis.nachher = await netzGueltigkeit(ctx, 'nachher');
  ctx.befund('netz', evaluiereNetz(ergebnis));
  if (ctx.api === 36) ctx.befund('netz-netstats', evaluiereNetstats({ api: ctx.api, uid: appUid, gegenUid, vorher: ergebnis.netstatsVorher, nachher: ergebnis.netstatsNachher }));
  else ergebnis.grenzen.push('netstats auf API 30 enthält in der Probe keine auswertbaren UID-Zeilen; der Nebenbeleg wird dort nicht bewertet.');
  const gegenprobe = { uid: gegenUid, tabellen: ergebnis.vorher.tabellen };
  for (const [name, tabellen] of [['vorher', ergebnis.procVorher], ...ergebnis.app.map((m) => [m.name, m.tabellen]), ['nachher', ergebnis.procNachher]]) {
    ctx.befund(`netz-proc-${name}`, evaluiereProcNet({ uid: appUid, tabellen, gegenprobe }));
  }
  await ctx.save('netz.json', ergebnis);
  return ergebnis;
}

export function navigationen(port) {
  const u = `https://10.0.2.2:${port}`;
  return {
    href: `location.href='${u}/n-href'`,
    open: `window.open('${u}/n-open')`,
    blank: `(()=>{const a=document.createElement('a');a.href='${u}/n-blank';a.target='_blank';a.textContent='Navigation';document.body.appendChild(a);a.click()})()`,
    mailto: "location.href='mailto:probe@example.invalid'",
    tel: "location.href='tel:0'",
    intent: "location.href='intent://x'",
    file: "location.href='file:///sdcard/'",
    content: "location.href='content://x'",
    data: "location.href='data:text/html,x'",
  };
}

async function navigationMessen(ctx, paket, name, ausdruck, rolle) {
  const cdp = await verbinden(ctx, paket, true);
  const vor = count(ctx);
  const pidText = (await ctx.shell(`pidof ${paket}`)).trim();
  const pidVor = /^\d+$/.test(pidText) ? Number(pidText) : undefined;
  await ctx.shell('logcat -c');
  const eventIndex = cdp.events.length;
  await cdp.evaluate(`(setTimeout(()=>{${ausdruck}},100),'ausgeloest')`);
  await ctx.sleep(4000);
  const activity = await ctx.shell('dumpsys activity activities');
  const activityBefund = evaluiereActivity(activity, paket);
  const pidResult = await ctx.adb(['shell', 'pidof', paket]);
  let ort;
  try { ort = await cdp.evaluate('({origin:location.origin,href:location.href})'); }
  catch (error) { ort = { fehler: error.message }; }
  const logcat = await ctx.shell('logcat -d -v brief');
  const messung = {
    activity, oben: activityBefund.details?.oben, pidVor,
    pidNach: pidResult.code === 0 && /^\d+$/.test(pidResult.out.trim()) ? Number(pidResult.out.trim()) : undefined, ort,
    annahmen: count(ctx) - vor, logcat, cdp: cdpZeilen(cdp.events.slice(eventIndex)),
  };
  await ctx.save(`navigation-${rolle}-${name}.json`, messung);
  await ctx.save(`navigation-${rolle}-${name}-logcat.txt`, logcat);
  await ctx.shot(`navigation-${rolle}-${name}.png`, { ui: false });
  await ctx.stop(paket);
  // Nur die beiden bekannten Empfänger der Testabbilder beenden.
  for (const fremd of ['org.chromium.webview_shell', 'com.android.dialer']) await ctx.stop(fremd);
  return messung;
}

export async function navigation(ctx) {
  const ergebnis = {};
  await ctx.stop(ctx.app);
  await ctx.stop(ctx.gegen);
  for (const [name, ausdruck] of Object.entries(navigationen(ctx.netz.port))) {
    const app = await navigationMessen(ctx, ctx.app, name, ausdruck, 'app');
    const gegen = await navigationMessen(ctx, ctx.gegen, name, ausdruck, 'gegen');
    ergebnis[name] = { name, app, gegen, appPaket: ctx.app, gegenPaket: ctx.gegen };
    ctx.befund(`navigation-${name}`, evaluiereNavigation(ergebnis[name]));
  }
  await ctx.save('navigation.json', ergebnis);
  return ergebnis;
}

/** TAR wird nur gelesen; keine Einträge werden in das Dateisystem entpackt. */
export function leseArchiv(eingang, marker, { localTransport = false } = {}) {
  let buf = Buffer.from(eingang);
  let kompression = 'keine';
  const limit = { maxOutputLength: 64 * 1024 * 1024 };
  if (buf[0] === 0x1f && buf[1] === 0x8b) { buf = gunzipSync(buf, limit); kompression = 'gzip'; }
  else if (buf[0] === 0x78 && ((buf[0] << 8) + buf[1]) % 31 === 0) { buf = inflateSync(buf, limit); kompression = 'zlib'; }
  if (buf.length < 1024 || buf.length % 512 !== 0) throw new Error('Unbekanntes oder unvollständiges TAR-Format.');
  const eintraege = [];
  let offset = 0;
  let ende = false;
  let markerGefunden = false;
  while (offset + 512 <= buf.length) {
    const h = buf.subarray(offset, offset + 512);
    if (h.every((b) => b === 0)) {
      if (offset + 1024 > buf.length || !buf.subarray(offset).every((b) => b === 0)) throw new Error('Ungültiges TAR-Ende.');
      ende = true;
      break;
    }
    const feld = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const oktal = (a, b) => {
      const s = feld(a, b).trim();
      if (!/^[0-7]+$/.test(s)) throw new Error('Unlesbares TAR-Zahlenfeld.');
      return parseInt(s, 8);
    };
    const summe = h.reduce((s, b, i) => s + (i >= 148 && i < 156 ? 32 : b), 0);
    if (oktal(148, 156) !== summe) throw new Error('TAR-Prüfsumme stimmt nicht.');
    const groesse = oktal(124, 136);
    const prefix = feld(345, 500);
    const name = `${prefix ? `${prefix}/` : ''}${feld(0, 100)}`;
    const typ = String.fromCharCode(h[156] || 48);
    if (!name || !['0', '5'].includes(typ) || name.startsWith('/') || name.split('/').includes('..')) throw new Error('Unbekannter TAR-Eintrag.');
    const datenanfa = offset + 512;
    const naechster = datenanfa + Math.ceil(groesse / 512) * 512;
    if (!Number.isSafeInteger(groesse) || naechster > buf.length) throw new Error('Abgeschnittener TAR-Eintrag.');
    const daten = buf.subarray(datenanfa, datenanfa + groesse);
    if (marker && (daten.includes(Buffer.from(marker)) || daten.includes(Buffer.from(marker, 'utf16le')))) markerGefunden = true;
    eintraege.push({ name, groesse, typ });
    offset = naechster;
  }
  if (!ende && !(localTransport && kompression === 'keine' && offset === buf.length && eintraege.length)) throw new Error('TAR-Ende fehlt.');
  return { bytes: eingang.length, entpackteBytes: buf.length, kompression, ende: ende ? 'TAR-Nullblöcke' : 'LocalTransport-Dateiende', eintraege, marker: markerGefunden };
}

/** _full enthält TAR-Einträge ohne Abschlussblöcke. EOF gilt nur mit vollständigem Transportbeleg. */
export function leseLocalTransportArchiv(eingang, marker, { paket, backupAusgabe, pullAusgabe }) {
  paketPruefen(paket);
  const zeilen = String(backupAusgabe).split(/\r?\n/);
  const erfolg = zeilen.filter((z) => z.startsWith(`Package ${paket} with result: `));
  const fortschritt = zeilen.filter((z) => z.startsWith(`Package ${paket} with progress: `)).at(-1)?.match(/with progress: (\d+)\/\d+$/);
  const pull = String(pullAusgabe).match(/: 1 file pulled, 0 skipped\.[^\r\n]*\((\d+) bytes in [\d.]+s\)/);
  if (erfolg.length !== 1 || erfolg[0] !== `Package ${paket} with result: Success` || !zeilen.includes('Backup finished with result: Success') ||
      !fortschritt || !pull || Number(fortschritt[1]) !== eingang.length || Number(pull[1]) !== eingang.length) {
    throw new Error('LocalTransport-Abschluss oder übertragene Bytezahl nicht vollständig belegt.');
  }
  const archiv = leseArchiv(eingang, marker, { localTransport: true });
  if (archiv.eintraege.some((e) => !e.name.startsWith(`apps/${paket}/`))) throw new Error('LocalTransport enthält Einträge eines unerwarteten Pakets.');
  return archiv;
}

async function markerImOrdner(ordner, marker) {
  for (const eintrag of await readdir(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isSymbolicLink()) throw new Error('Unerwartete Verknüpfung im Datenbeleg.');
    if (eintrag.isDirectory()) { if (await markerImOrdner(pfad, marker)) return true; }
    else if (eintrag.isFile()) {
      const buf = await readFile(pfad);
      if (buf.includes(Buffer.from(marker)) || buf.includes(Buffer.from(marker, 'utf16le'))) return true;
    }
  }
  return false;
}

async function wertSchreiben(ctx, paket, rolle) {
  const marker = `EMULATOR${randomUUID().replaceAll('-', '')}`;
  const cdp = await verbinden(ctx, paket, true);
  const gelesen = await cdp.evaluate(`(localStorage.setItem('emulator-sicherung',${JSON.stringify(marker)}),localStorage.getItem('emulator-sicherung'))`);
  if (gelesen !== marker) throw new Error('Sicherungsmarker nicht aus localStorage zurückgelesen.');
  await ctx.sleep(6000);
  await ctx.shell('input keyevent KEYCODE_HOME');
  await ctx.sleep(3000);
  await ctx.stop(paket);
  await ctx.sleep(2000);
  const ziel = join(ctx.ausgabe, 'sicherung', `${rolle}-leveldb`);
  await mkdir(ziel, { recursive: true });
  const pull = await ctx.adb(['pull', `/data/data/${paket}/app_webview/Default/Local Storage/leveldb`, ziel]);
  await ctx.save(`sicherung-${rolle}-pull.txt`, `${pull.out}\n${pull.err}`);
  if (pull.code !== 0 || !(await markerImOrdner(ziel, marker))) throw new Error(`Sicherungsmarker im Datenbereich von ${rolle} fehlt.`);
  return marker;
}

async function archivHolen(ctx, paket, rolle, phase, marker, backupAusgabe) {
  // Zuerst muss das Verzeichnis lesbar sein. Ein Fehler darf nicht als fehlende Datei gelten.
  const liste = await ctx.shell(`ls -1 ${ABLAGE}`);
  await ctx.save(`sicherung-${phase}-${rolle}-ablage.txt`, liste);
  const deltaListe = await ctx.shell('ls -1 /data/data/com.android.localtransport/files/1/_delta');
  await ctx.save(`sicherung-${phase}-${rolle}-delta.txt`, deltaListe);
  const delta = deltaListe.split(/\r?\n/).includes(paket)
    ? [{ name: `LocalTransport/_delta/${paket}`, groesse: null, typ: '5' }] : [];
  if (!liste.split(/\r?\n/).includes(paket)) return { lesbar: true, vorhanden: delta.length > 0, eintraege: delta, marker: false };
  const ziel = join(ctx.ausgabe, 'sicherung', `${phase}-${rolle}.tar`);
  const pull = await ctx.adb(['pull', `${ABLAGE}/${paket}`, ziel]);
  await ctx.save(`sicherung-${phase}-${rolle}-pull.txt`, `${pull.out}\n${pull.err}`);
  if (pull.code !== 0) throw new Error('LocalTransport-Datei lässt sich nicht lesen.');
  const archiv = leseLocalTransportArchiv(await readFile(ziel), marker, { paket, backupAusgabe, pullAusgabe: `${pull.out}\n${pull.err}` });
  return { lesbar: true, vorhanden: true, ...archiv, eintraege: [...archiv.eintraege, ...delta] };
}

async function sicherungsPhase(ctx, name, marker) {
  const daten = { deviceTransfer: name === 'geraetewechsel', appPaket: ctx.app, gegenPaket: ctx.gegen };
  await ctx.shell('logcat -c');
  for (const [rolle, paket] of [['app', ctx.app], ['gegen', ctx.gegen]]) {
    const wipe = await ctx.shell(`bmgr wipe ${TRANSPORT} ${paket}`);
    await ctx.save(`sicherung-${name}-${rolle}-wipe.txt`, wipe);
    if (!wipe.includes(`Wiped backup data for ${paket} on ${TRANSPORT}`)) throw new Error('LocalTransport wurde nicht nachweisbar geleert.');
    await ctx.start(paket);
    await ctx.sleep(4000);
    await ctx.shell('input keyevent KEYCODE_HOME');
    await ctx.sleep(2000);
    const zustand = await ctx.shell(`dumpsys package ${paket}`);
    await ctx.save(`sicherung-${name}-${rolle}-package.txt`, zustand);
    const treffer = zustand.match(/\bUser 0:[^\r\n]*\bstopped=(true|false)\b/);
    daten[`${rolle}Stopped`] = treffer ? treffer[1] === 'true' : undefined;
    if (daten[`${rolle}Stopped`] !== false) throw new Error(`${rolle}: stopped=false vor backupnow nicht nachgewiesen.`);
    daten[`${rolle}Ausgabe`] = await ctx.shell(`bmgr backupnow ${paket}`, { timeoutMs: 180000 });
    await ctx.save(`sicherung-${name}-${rolle}-backupnow.txt`, daten[`${rolle}Ausgabe`]);
  }
  await ctx.sleep(2000);
  for (const [rolle, paket] of [['app', ctx.app], ['gegen', ctx.gegen]]) {
    const archiv = await archivHolen(ctx, paket, rolle, name, marker[rolle], daten[`${rolle}Ausgabe`]);
    daten[`${rolle}Archiv`] = archiv;
    daten[`${rolle}ArchivLesbar`] = archiv.lesbar;
    daten[`${rolle}Dateien`] = archiv.eintraege.map((e) => e.name);
    daten[`${rolle}Marker`] = archiv.marker;
  }
  daten.logcat = await ctx.shell('logcat -d -v brief');
  await ctx.save(`sicherung-${name}-logcat.txt`, daten.logcat);
  await ctx.save(`sicherung-${name}.json`, daten);
  ctx.befund(`sicherung-${name}`, evaluiereSicherung(daten));
  return daten;
}

export async function sicherung(ctx) {
  paketPruefen(ctx.app); paketPruefen(ctx.gegen);
  const vorher = {
    enabled: await ctx.shell('bmgr enabled'),
    activated: await ctx.shell('bmgr activated'),
    transports: await ctx.shell('bmgr list transports'),
    parameter: (await ctx.shell('settings get secure backup_local_transport_parameters')).trim(),
    parserLog: (await ctx.shell('getprop log.tag.BackupXmlParserLogging')).trim(),
  };
  await ctx.save('sicherung-zustand-vorher.json', vorher);
  const transport = vorher.transports.split(/\r?\n/).map((s) => s.trim()).find((s) => s.startsWith('*'))?.slice(1).trim();
  const enabled = vorher.enabled.match(/^Backup Manager currently (enabled|disabled)\s*$/m)?.[1];
  const activated = vorher.activated.match(/^Backup Manager currently (activated|deactivated)\s*$/m)?.[1];
  if (!transport || !enabled || !activated) throw new Error('Sicherungsdienst-Zustand nicht vollständig lesbar; keine Änderung vorgenommen.');
  const ergebnis = { vorher, phasen: {} };
  let wiederhergestellt = false;
  const aufraeumen = async () => {
    if (wiederhergestellt) return;
    const befehle = [
      `bmgr wipe ${TRANSPORT} ${ctx.app}`, `bmgr wipe ${TRANSPORT} ${ctx.gegen}`,
      vorher.parameter === 'null' || vorher.parameter === '' ? 'settings delete secure backup_local_transport_parameters' : `settings put secure backup_local_transport_parameters ${quote(vorher.parameter)}`,
      `bmgr transport ${quote(transport)}`,
      `bmgr enable ${enabled === 'enabled'}`,
      `bmgr activate ${activated === 'activated'}`,
      `setprop log.tag.BackupXmlParserLogging ${quote(vorher.parserLog)}`,
    ];
    const fehler = [];
    for (const befehl of befehle) {
      try { await ctx.shell(befehl); } catch (error) { fehler.push(error.message); }
    }
    const nachher = {};
    for (const [name, befehl] of [
      ['enabled', 'bmgr enabled'], ['activated', 'bmgr activated'], ['transports', 'bmgr list transports'],
      ['parameter', 'settings get secure backup_local_transport_parameters'], ['parserLog', 'getprop log.tag.BackupXmlParserLogging'],
    ]) {
      try { nachher[name] = (await ctx.shell(befehl)).trim(); }
      catch (error) { fehler.push(`${name}: ${error.message}`); }
    }
    for (const name of ['enabled', 'activated', 'parameter', 'parserLog']) {
      if (nachher[name] !== vorher[name].trim()) fehler.push(`${name}: Ausgangszustand nach Rückbau nicht bestätigt.`);
    }
    const transportNachher = nachher.transports?.split(/\r?\n/).map((s) => s.trim()).find((s) => s.startsWith('*'))?.slice(1).trim();
    if (transportNachher !== transport) fehler.push('Ausgewählter Transport nach Rückbau stimmt nicht.');
    await ctx.save('sicherung-zustand-nachher.json', nachher);
    await ctx.save('sicherung-rueckbau.json', { fehler });
    wiederhergestellt = fehler.length === 0;
    if (fehler.length) throw new Error(`Sicherungsdienst nicht vollständig zurückgesetzt: ${fehler.join('; ')}`);
  };
  ctx.defer(aufraeumen);
  try {
    const marker = { app: await wertSchreiben(ctx, ctx.app, 'app'), gegen: await wertSchreiben(ctx, ctx.gegen, 'gegen') };
    await ctx.save('sicherung-marker.json', marker);
    if (activated === 'deactivated') await ctx.shell('bmgr activate true');
    await ctx.shell('bmgr enable true');
    await ctx.shell(`bmgr transport ${TRANSPORT}`);
    await ctx.shell('setprop log.tag.BackupXmlParserLogging VERBOSE');
    await ctx.shell('settings delete secure backup_local_transport_parameters');
    ergebnis.phasen.standard = await sicherungsPhase(ctx, 'standard', marker);
    if (ctx.api === 36) {
      await ctx.shell('settings put secure backup_local_transport_parameters is_device_transfer=true');
      const gesetzt = (await ctx.shell('settings get secure backup_local_transport_parameters')).trim();
      if (gesetzt !== 'is_device_transfer=true') throw new Error('Gerätewechsel-Parameter wurde nicht übernommen.');
      ergebnis.phasen.geraetewechsel = await sicherungsPhase(ctx, 'geraetewechsel', marker);
    }
    await ctx.save('sicherung.json', ergebnis);
    return ergebnis;
  } finally {
    await aufraeumen();
  }
}
