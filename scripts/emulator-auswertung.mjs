// SPDX-License-Identifier: Apache-2.0
import { pathToFileURL } from 'node:url';
export { evaluiereDateiFall, dateiFallId } from './emulator/dateien-auswertung.mjs';
// Die einzelnen Auswerter sind rein; der optionale CLI liest vorhandene Rohbelege.
export const STATUS = Object.freeze({ bestanden: 'bestanden', fehler: 'nicht bestanden', ungueltig: 'ungültig', grenze: 'dokumentierte Grenze', sicht: 'Sichtprüfung ausstehend' });
export const SICHTPRUEFUNGEN = Object.freeze({
  A8: Object.freeze(['a8-schrift-1-3.png', 'a8-schrift-2-0.png', 'a8-nacht.png', 'a8-gedreht.png', 'a8-tastatur.png']),
  'B-Sichtprüfung': Object.freeze(['b-start.png']),
});
const APP = 'de.baremos.fristenrechner';
const GEGEN = `${APP}.gegenprobe`;
const text = (v) => typeof v === 'string';
const texte = (v) => Array.isArray(v) && v.every(text);
const zahl = (v) => Number.isSafeInteger(v) && v >= 0;
const objekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ok = (grund, details) => befund(STATUS.bestanden, grund, details);
const nein = (grund, details) => befund(STATUS.fehler, grund, details);
const ungueltig = (grund, details) => befund(STATUS.ungueltig, grund, details);
const grenze = (grund, details) => befund(STATUS.grenze, grund, details);

export function befund(status, grund, details) {
  if (!Object.values(STATUS).includes(status) || !text(grund) || !grund.trim()) {
    return { status: STATUS.ungueltig, grund: 'Befund hat ein unbekanntes Format.' };
  }
  return { status, grund, ...(details === undefined ? {} : { details }) };
}

export function zusammenfassen(befunde) {
  if (!Array.isArray(befunde) || !befunde.length || befunde.some((b) => !objekt(b) || !Object.values(STATUS).includes(b.status) || !text(b.grund))) {
    return ungueltig('Befunde fehlen oder haben ein unbekanntes Format.');
  }
  if (befunde.some((b) => b.status === STATUS.fehler)) return nein('Mindestens eine Prüfung ist nicht bestanden.', befunde);
  if (befunde.some((b) => b.status === STATUS.ungueltig)) return ungueltig('Mindestens eine Messung ist ungültig.', befunde);
  if (befunde.some((b) => b.status === STATUS.sicht)) return befund(STATUS.sicht, 'Messungen auswertbar; mindestens eine Sichtprüfung steht aus. Dokumentierte Grenzen bleiben gesondert ausgewiesen.', befunde);
  if (befunde.some((b) => b.status === STATUS.grenze)) return grenze('Ausführbare Prüfungen bestanden; dokumentierte Grenzen bleiben unbelegt.', befunde);
  return ok('Alle Prüfungen bestanden.', befunde);
}

export function rueckgabewert(befunde) {
  return { [STATUS.bestanden]: 0, [STATUS.fehler]: 1, [STATUS.ungueltig]: 2, [STATUS.grenze]: 3, [STATUS.sicht]: 4 }[zusammenfassen(befunde).status];
}

export function sichtpruefungAusstehend(bilder) {
  if (!texte(bilder) || !bilder.length) return ungueltig('Bildliste für die Sichtprüfung fehlt.');
  return befund(STATUS.sicht, `Sichtprüfung ausstehend: ${bilder.join(', ')}.`, { ausstehend: [...bilder], geprueft: [] });
}

/** Ein Prüfvermerk gilt nur für die unveränderten PNG-Dateien dieses Laufordners. */
export async function leseSichtpruefung(lauf, bilder) {
  const { readFile, lstat, realpath } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const wurzel = await realpath(lauf);
  const datei = async (name) => {
    if (!/^[a-z0-9][a-z0-9._-]*\.(?:png|json)$/.test(name)) throw new Error('Nur einfache Dateinamen im Laufordner sind erlaubt.');
    const pfad = join(wurzel, name), info = await lstat(pfad);
    if (!info.isFile() || info.isSymbolicLink() || dirname(await realpath(pfad)) !== wurzel) throw new Error(`Keine reguläre Datei im Laufordner: ${name}.`);
    return readFile(pfad);
  };
  let daten = { schema: 1, pruefungen: [] }, vorhanden = false;
  try {
    const roh = await datei('sichtpruefung.json');
    if (roh.length > 1024 * 1024) throw new Error('Sichtprüfprotokoll ist zu groß.');
    daten = JSON.parse(roh.toString('utf8')); vorhanden = true;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!objekt(daten) || daten.schema !== 1 || !Array.isArray(daten.pruefungen)) throw new Error('Unbekanntes Format von sichtpruefung.json.');
  const gesehen = new Set(), pruefungen = [];
  const textfeld = (v, max) => text(v) && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
  for (const p of daten.pruefungen) {
    if (!objekt(p) || !bilder.includes(p.bild) || gesehen.has(p.bild)) throw new Error('Unbekanntes oder doppelt geprüftes Bild.');
    if (![STATUS.bestanden, STATUS.fehler].includes(p.ergebnis) || !textfeld(p.wer, 200) || !textfeld(p.bemerkung, 4000) ||
        !text(p.wann) || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(p.wann) || !Number.isFinite(Date.parse(p.wann)) ||
        new Date(p.wann).toISOString().slice(0, 10) !== p.wann.slice(0, 10) || !/^[a-f0-9]{64}$/.test(p.sha256 ?? '')) throw new Error(`Unvollständiger oder ungültiger Prüfvermerk: ${p.bild}.`);
    gesehen.add(p.bild); pruefungen.push({ ...p });
  }
  const bilddaten = [];
  for (const bild of bilder) {
    const inhalt = await datei(bild);
    if (inhalt.length < 24 || !inhalt.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Kein lesbarer PNG-Beleg: ${bild}.`);
    const sha256 = createHash('sha256').update(inhalt).digest('hex'), pruefung = pruefungen.find(p => p.bild === bild);
    if (pruefung && pruefung.sha256 !== sha256) throw new Error(`Prüfsumme stimmt nicht mit dem Bild überein: ${bild}.`);
    bilddaten.push({ bild, sha256 });
  }
  return { datei: vorhanden ? 'sichtpruefung.json' : null, pruefungen, bilder: bilddaten, ausstehend: bilder.filter(bild => !gesehen.has(bild)) };
}

export function zaehleBefunde(befunde) {
  return Object.fromEntries(Object.values(STATUS).map((status) => [status, befunde.filter((b) => b.status === status).length]));
}

/** Rohtext von dumpsys activity activities. Fokus ist ausdrücklich kein Ersatz. */
export function evaluiereActivity(ausgabe, paket = APP) {
  if (!text(ausgabe) || !text(paket) || !paket) return ungueltig('Activity-Ausgabe fehlt.');
  const lies = (muster) => [...ausgabe.matchAll(muster)].map((m) => m[1]);
  let oben = lies(/\btopResumedActivity\s*=\s*ActivityRecord\{[^\r\n}]*?\bu\d+\s+([\w.]+\/[\w.$]+)(?:\s|})/g);
  if (!oben.length) oben = lies(/\bmResumedActivity\s*[:=]\s*ActivityRecord\{[^\r\n}]*?\bu\d+\s+([\w.]+\/[\w.$]+)(?:\s|})/g);
  const eindeutig = [...new Set(oben)];
  if (eindeutig.length !== 1) return ungueltig('Keine eindeutige oberste Activity in der Ausgabe.');
  const details = { oben: eindeutig[0] };
  return eindeutig[0].split('/')[0] === paket ? ok('Erwartetes Paket ist oben.', details) : nein('Eine fremde Activity ist oben.', details);
}

export const NETZWEGE = Object.freeze(['fetch', 'xhr', 'image', 'iframe', 'websocket', 'sendBeacon', 'eventSource', 'prefetch', 'capacitorHttp', 'invalid']);
/** Annahmen sind ausschließlich die im abgegrenzten Messfenster gezählten TCP-Annahmen. */
export function evaluiereNetz(messung) {
  if (!objekt(messung) || !zahl(messung.vorher?.annahmen) || !zahl(messung.nachher?.annahmen)) return ungueltig('Gültigkeitsmessung des Netzmelders fehlt.');
  if (messung.vorher.annahmen === 0 || messung.nachher.annahmen === 0) return ungueltig('Gegenprobe vor oder nach der App hatte keine Wirkung.');
  for (const gruppe of ['app', 'gegen']) {
    const werte = messung[gruppe];
    if (!Array.isArray(werte) || werte.length !== NETZWEGE.length || new Set(werte.map((v) => v?.name)).size !== NETZWEGE.length ||
      werte.some((v) => !objekt(v) || !NETZWEGE.includes(v.name) || !zahl(v.annahmen) || !texte(v.cdp) || !text(v.ergebnis))) {
      return ungueltig(`Angriffswege oder Messwerte fehlen: ${gruppe}.`);
    }
  }
  const befunde = [];
  for (const name of NETZWEGE) {
    const app = messung.app.find((v) => v.name === name);
    const gegen = messung.gegen.find((v) => v.name === name);
    if (name !== 'invalid' && gegen.annahmen === 0) {
      befunde.push(ungueltig(`${name}: Gegenprobe erreicht den Netzmelder nicht.`)); continue;
    }
    if (app.annahmen !== 0) { befunde.push(nein(`${name}: Netzmelder hat Verbindungen angenommen.`, { annahmen: app.annahmen })); continue; }
    const cdp = app.cdp.join('\n');
    if (name === 'capacitorHttp') {
      if (!app.ergebnis.includes('socket failed: EPERM (Operation not permitted)')) befunde.push(ungueltig('capacitorHttp: bekannter Ablehnungsgrund fehlt.'));
      else befunde.push(ok('capacitorHttp: kein Zugriff auf den Netzmelder; EPERM beobachtet.'));
    } else if (name === 'websocket') {
      befunde.push(cdp.includes('net::ERR_ACCESS_DENIED') ? ok('websocket: kein Zugriff; ERR_ACCESS_DENIED beobachtet.') : ungueltig('websocket: bekannter Ablehnungsgrund fehlt.'));
    } else if (!/^loadingFailed type=\w+ errorText=net::ERR_CACHE_MISS$/m.test(cdp)) {
      befunde.push(ungueltig(`${name}: loadingFailed mit ERR_CACHE_MISS fehlt.`));
    } else if (name === 'invalid') {
      if (!/^loadingFailed type=\w+ errorText=net::ERR_NAME_NOT_RESOLVED$/m.test(gegen.cdp.join('\n'))) befunde.push(ungueltig('DNS-Gegenprobe zeigt nicht ERR_NAME_NOT_RESOLVED.'));
      else befunde.push(ok('Nur Fehlervergleich für .invalid: App ERR_CACHE_MISS, Gegenprobe ERR_NAME_NOT_RESOLVED; kein Nachweis über DNS-Verkehr.'));
    } else befunde.push(ok(`${name}: keine Annahme; loadingFailed beobachtet.`));
  }
  return zusammenfassen(befunde);
}

/** Eine dokumentierte Grenze verlangt vollständige Messwerte und den bekannten Sperrgrund. */
export function evaluiereNavigation(messung) {
  const { name, app, gegen, appPaket = APP, gegenPaket = GEGEN } = messung ?? {};
  if (!['href', 'open', 'blank', 'mailto', 'tel', 'intent', 'file', 'content', 'data'].includes(name)) return ungueltig('Unbekannter Navigationsweg.');
  for (const [art, m] of [['App', app], ['Gegenprobe', gegen]]) {
    if (!objekt(m) || !text(m.oben) || !objekt(m.ort) || !text(m.ort.href) || !text(m.ort.origin) || !zahl(m.pidVor) || !zahl(m.pidNach) || !m.pidVor || !m.pidNach || !zahl(m.annahmen) || !text(m.logcat) || !texte(m.cdp)) {
      return ungueltig(`${art}: Navigation wurde nicht vollständig aufgezeichnet.`);
    }
  }
  if (![`${appPaket}/.MainActivity`, `${appPaket}/${APP}.MainActivity`].includes(app.oben) || app.pidVor !== app.pidNach || app.ort.origin !== 'https://localhost' || app.ort.href !== 'https://localhost/' || app.annahmen !== 0) {
    return nein('App hat ihren Zustand verlassen oder der Netzmelder wurde erreicht.');
  }
  if (['file', 'content', 'data'].includes(name)) {
    const marker = name === 'data' ? 'Not allowed to navigate top frame to data URL: data:' : `Not allowed to load local resource: ${name}:`;
    if (![app, gegen].every((m) => m.cdp.some((z) => z.includes(marker)) || m.logcat.includes(marker))) return ungueltig(`${name}: Renderer-Meldung fehlt.`);
    return grenze(`${name}: Chromium sperrt App und Gegenprobe; keine wirksame Gegenprobe für das Plugin.`, { rendererSperre: true });
  }
  const protokoll = ['href', 'open', 'blank'].includes(name) ? 'https' : name;
  const sperre = new RegExp(`(?:^|\\n)[^\\n]*D/Navigationssperre\\(\\s*\\d+\\): gesperrt: ${protokoll}(?:\\r?$)`, 'm');
  if (!sperre.test(app.logcat)) return ungueltig(`${name}: Zeile der Navigationssperre fehlt.`);
  if (['mailto', 'intent'].includes(name) && gegen.oben.split('/')[0] === gegenPaket) return grenze(`${name}: Gegenprobe öffnet keinen Empfänger; Pluginwirkung nur teilweise beobachtet.`);
  const ziel = name === 'tel' ? 'com.android.dialer/' : 'org.chromium.webview_shell/';
  if (['href', 'open', 'blank', 'tel'].includes(name) && !gegen.oben.startsWith(ziel)) return ungueltig(`${name}: Gegenprobe öffnet die erwartete fremde Activity nicht.`);
  if (['href', 'open', 'blank'].includes(name) && gegen.annahmen === 0) return ungueltig(`${name}: Browser der Gegenprobe erreicht den Netzmelder nicht.`);
  return ok(`${name}: App bleibt lokal, Gegenprobe öffnet eine fremde Activity.`);
}

function backupErgebnis(ausgabe, paket) {
  if (!text(ausgabe) || !/^Running incremental backup for 1 requested packages\.\r?$/m.test(ausgabe) || !/^Backup finished with result: Success\r?$/m.test(ausgabe)) return null;
  const treffer = [...ausgabe.matchAll(new RegExp(`^Package ${esc(paket)} with result: (.+)\\r?$`, 'gm'))].map((m) => m[1].trim());
  return treffer.length === 1 ? treffer[0] : null;
}

export function evaluiereSicherung(messung) {
  if (!objekt(messung) || typeof messung.deviceTransfer !== 'boolean' || typeof messung.appStopped !== 'boolean' || typeof messung.gegenStopped !== 'boolean' ||
      !texte(messung.appDateien) || !texte(messung.gegenDateien) || typeof messung.appMarker !== 'boolean' || typeof messung.gegenMarker !== 'boolean' ||
      typeof messung.appArchivLesbar !== 'boolean' || typeof messung.gegenArchivLesbar !== 'boolean' || (messung.deviceTransfer && !text(messung.logcat))) return ungueltig('Sicherungsnachweis ist unvollständig.');
  if (messung.appStopped || messung.gegenStopped) return ungueltig('App oder Gegenprobe war vor backupnow gestoppt.');
  if (!messung.appArchivLesbar || !messung.gegenArchivLesbar) return ungueltig('Ablage oder Archiv des LocalTransport war nicht lesbar.');
  const app = backupErgebnis(messung.appAusgabe, messung.appPaket ?? APP);
  const gegen = backupErgebnis(messung.gegenAusgabe, messung.gegenPaket ?? GEGEN);
  if (!app || !gegen) return ungueltig('Paketbezogenes Ergebnis von backupnow fehlt oder ist unlesbar.');
  if (gegen !== 'Success' || !messung.gegenMarker || !messung.gegenDateien.some((z) => z.includes('/app_webview/Default/Local Storage/leveldb/'))) return ungueltig('Gegenprobe hat keine nachweisbare Sicherung des Markers erzeugt.');
  if (messung.appDateien.length || messung.appMarker) return nein('Daten der App liegen beim LocalTransport.');
  const erwartet = messung.deviceTransfer ? "Transport rejected package because it wasn't able to process it at the time" : 'Backup is not allowed';
  if (app === 'Success') return nein('backupnow meldet eine erfolgreiche Sicherung der App.');
  if (app !== erwartet) return ungueltig('Unbekannter Ablehnungsgrund der App.', { ergebnis: app });
  if (messung.deviceTransfer && (!messung.logcat.includes('Found valid data-extraction-rules; parsing xml resource.') || !messung.logcat.includes(`Initiating full-data transport backup of ${messung.appPaket ?? APP} `))) return ungueltig('Gerätewechsel: Nachweis des Starts und des Lesens der Ausschlussregeln fehlt.');
  return ok('Keine Daten der App beim LocalTransport; Gegenprobe enthält den Marker.');
}

export function evaluiereReleaseFlags(messung) {
  const { dumpsys } = objekt(messung) ? messung : {};
  if (!text(dumpsys)) return ungueltig('dumpsys package fehlt.');
  const treffer = [...dumpsys.matchAll(/^\s*flags=\[\s*([A-Z_0-9 ]*?)\s*\]\s*$/gm)];
  if (treffer.length !== 1 || !/^\s*versionCode=\d+ minSdk=\d+ targetSdk=\d+(?:\s|$)/m.test(dumpsys)) return ungueltig('Eindeutiger Paketabschnitt mit benannten Flags fehlt.');
  const flags = treffer[0][1].split(/\s+/).filter(Boolean);
  if (!flags.includes('HAS_CODE')) return ungueltig('Erwartetes Flag HAS_CODE fehlt.');
  const verbotene = ['DEBUGGABLE', 'ALLOW_BACKUP'].filter((flag) => flags.includes(flag));
  return verbotene.length ? nein('Release enthält unzulässige Flags.', { flags: verbotene }) : ok('Release ohne DEBUGGABLE und ALLOW_BACKUP.');
}

export function evaluiereUnixSockets(messung) {
  const { text: ausgabe, debugSocketNachgewiesen, buildType } = objekt(messung) ? messung : {};
  if (!text(ausgabe) || debugSocketNachgewiesen !== true) return ungueltig('Unix-Socket-Ausgabe oder wirksame Debug-Gegenprobe fehlt.');
  if (!text(buildType) || !/^[a-z][a-z0-9_-]*$/.test(buildType)) return ungueltig('Build-Typ des Geräts fehlt oder ist unlesbar.');
  const zeilen = ausgabe.trim().split(/\r?\n/);
  if (!/^Num\s+RefCount\s+Protocol\s+Flags\s+Type\s+St\s+Inode\s+Path\s*$/.test(zeilen.shift() ?? '')) return ungueltig('Unbekannter Kopf von /proc/net/unix.');
  if (zeilen.some((z) => !/^[\da-f]+:\s+[\da-f]+\s+[\da-f]+\s+[\da-f]+\s+[\da-f]+\s+[\da-f]+\s+\d+(?:\s+.*)?$/i.test(z))) return ungueltig('Unlesbare Zeile in /proc/net/unix.');
  const sockets = zeilen.filter((z) => /(?:@|\b)webview_devtools_remote(?:_\d+)?\b/.test(z));
  if (buildType !== 'user') return grenze(`Build-Typ ${buildType}: WebView-Debugging lässt sich hier nicht als Release-Eigenschaft prüfen; Nachweis auf einem echten Gerät mit Build-Typ user ausstehend.`, { buildType, sockets });
  return sockets.length ? nein('Ein Devtools-Socket der WebView ist offen.', { buildType, sockets }) : ok('Kein Devtools-Socket in /proc/net/unix.', { buildType });
}

/** Header und Datensätze werden geprüft, bevor nach der UID gefiltert wird. */
function procAdresse(hex, ipv6) {
  if (!(ipv6 ? /^[\da-f]{32}$/i : /^[\da-f]{8}$/i).test(hex)) return null;
  // Die Testabbilder sind x86_64: /proc/net gibt jedes 32-Bit-Wort in Hostreihenfolge aus.
  const netzfolge = hex.toUpperCase().match(/.{8}/g).map((wort) => wort.match(/../g).reverse().join('')).join('');
  const nulladresse = /^0+$/.test(netzfolge);
  const loopback = ipv6 ? netzfolge === '00000000000000000000000000000001' || /^00000000000000000000FFFF7F[\dA-F]{6}$/.test(netzfolge) : /^7F[\dA-F]{6}$/.test(netzfolge);
  return { nulladresse, loopback };
}

function procNet(tabellen, uid) {
  if (!objekt(tabellen) || !zahl(uid) || !uid) return null;
  const funde = [];
  for (const typ of ['tcp', 'tcp6', 'udp', 'udp6']) {
    if (!text(tabellen[typ])) return null;
    const zeilen = tabellen[typ].trim().split(/\r?\n/);
    if (!/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\s+tx_queue\s+rx_queue\s+tr\s+tm->when\s+retrnsmt\s+uid\s+timeout\s+inode(?:\s|$)/.test(zeilen.shift() ?? '')) return null;
    for (const zeile of zeilen) {
      const m = /^\s*\d+:\s+([\da-f]+):[\da-f]{4}\s+([\da-f]+):[\da-f]{4}\s+[\da-f]{2}\s+[\da-f]+:[\da-f]+\s+[\da-f]+:[\da-f]+\s+[\da-f]+\s+(\d+)\s+\d+\s+\d+(?:\s+.*)?$/i.exec(zeile);
      if (!m) return null;
      const lokal = procAdresse(m[1], typ.endsWith('6')), fern = procAdresse(m[2], typ.endsWith('6'));
      if (!lokal || !fern) return null;
      const loopback = (lokal.loopback && (fern.loopback || fern.nulladresse)) || (lokal.nulladresse && fern.loopback);
      if (Number(m[3]) === uid) funde.push({ typ, zeile, loopback });
    }
  }
  return funde;
}

export function evaluiereProcNet(messung) {
  const { uid, tabellen, gegenprobe } = objekt(messung) ? messung : {};
  const app = procNet(tabellen, uid);
  const gegen = procNet(gegenprobe?.tabellen, gegenprobe?.uid);
  if (!app || !gegen) return ungueltig('/proc/net-Ausgabe fehlt oder ist unlesbar.');
  if (!gegen.some((v) => !v.loopback)) return ungueltig('Keine externe Verbindung der Gegenprobe in /proc/net beobachtet.');
  const extern = app.filter((v) => !v.loopback);
  return extern.length ? nein('Offene Netz-Sockets der App-UID außerhalb von Loopback beobachtet.', extern) : ok('Keine offenen Netz-Sockets der App-UID außerhalb von Loopback im Messzeitpunkt; andere UIDs werden nicht bewertet.', { loopback: app.length });
}

function netstatsTabelle(ausgabe) {
  if (!text(ausgabe)) return null;
  const abschnitte = [...ausgabe.matchAll(/^  mAppUidStatsMap:\r?\n([\s\S]*?)(?=^  m[A-Za-z]+:)/gm)];
  if (abschnitte.length !== 1) return null;
  const zeilen = abschnitte[0][1].trim().split(/\r?\n/);
  if (!/^uid rxBytes rxPackets txBytes txPackets$/.test(zeilen.shift() ?? '')) return null;
  const werte = new Map();
  for (const z of zeilen) {
    const m = /^\s*(\d+) (\d+) (\d+) (\d+) (\d+)\s*$/.exec(z);
    if (!m || m.slice(1).some((v) => !Number.isSafeInteger(Number(v))) || werte.has(Number(m[1]))) return null;
    werte.set(Number(m[1]), m.slice(2).map(Number));
  }
  return werte;
}

export function evaluiereNetstats(messung) {
  const { api, uid, vorher, nachher, gegenUid } = objekt(messung) ? messung : {};
  if (api === 30) return ungueltig('API 30: netstats enthält in der Probe keine auswertbaren UID-Zeilen.', { grenze: true });
  if (api !== 36 || !zahl(uid) || !uid || !zahl(gegenUid) || !gegenUid || uid === gegenUid) return ungueltig('API oder UIDs für netstats fehlen.');
  const vor = netstatsTabelle(vorher), nach = netstatsTabelle(nachher);
  if (!vor || !nach) return ungueltig('Tabelle mAppUidStatsMap fehlt, ist abgeschnitten oder unlesbar.');
  if (![vor, nach].every((t) => t.get(gegenUid)?.some((v) => v > 0))) return ungueltig('Gegenprobe ist nicht in beiden netstats-Tabellen nachgewiesen.');
  const basis = vor.get(uid) ?? [0, 0, 0, 0];
  if (vor.has(uid) && !nach.has(uid)) return ungueltig('App-UID ist nach der Messung aus netstats verschwunden.');
  const ende = nach.get(uid) ?? [0, 0, 0, 0];
  const delta = ende.map((v, i) => v - basis[i]);
  if (delta.some((v) => v < 0)) return ungueltig('Zähler der App-UID sind während der Messung zurückgegangen.', { basis, ende });
  const details = { basis, ende, delta, hinweis: 'Die Aussage gilt für die Änderung zwischen den zwei Messzeitpunkten; frühere Zähler können zu einer vorherigen Nutzung der UID gehören.' };
  if (delta.some((v) => v > 0)) return nein('netstats weist zusätzlichen Netzverkehr der App-UID im Messfenster aus.', details);
  return ok('Keine Zählerzunahme der App-UID in netstats; Gegenprobe hat Netzverkehr.', details);
}

export function evaluiereFehlerseite(messung) {
  const { ort, ausnahmen, logcat, erwarteterText } = objekt(messung) ? messung : {};
  if (!objekt(ort) || !text(ort.pathname) || !text(ort.text) || !Array.isArray(ausnahmen) || !text(logcat) || !text(erwarteterText) || !erwarteterText.trim()) return ungueltig('Beobachtung der Fehlerseite ist unvollständig.');
  if (ort.pathname !== '/startfehler.html' || !ort.text.includes(erwarteterText) || ausnahmen.length || /\bSyntaxError\b|\bFATAL EXCEPTION\b/.test(logcat)) return nein('Fehlerseite fehlt, ist nicht sichtbar oder ein Skriptfehler wurde beobachtet.');
  if (!logcat.includes('Handling local request: https://localhost/startfehler.html')) return ungueltig('Lokaler Abruf der Fehlerseite fehlt im Protokoll.');
  return ok('Fehlerseite lokal geladen, sichtbarer Text vorhanden, keine Skriptausnahme.');
}

export function evaluiereInstallation(messung) {
  const { code, ausgabe } = objekt(messung) ? messung : {};
  if (!Number.isInteger(code) || !text(ausgabe) || !ausgabe.trim()) return ungueltig('Ergebnis der Installation fehlt.');
  if (code === 0) return nein('Installation auf dem ausgeschlossenen API-Level war erfolgreich.');
  if (!/Failure \[INSTALL_FAILED_OLDER_SDK(?::[^\r\n\]]*)?\]/.test(ausgabe)) return ungueltig('Installation scheiterte ohne den erwarteten Grund INSTALL_FAILED_OLDER_SDK.');
  return ok('Installation wegen älterem API-Level abgelehnt.');
}

export function evaluiereUeberlauf(messung) {
  const { scrollWidth, clientWidth } = objekt(messung) ? messung : {};
  if (!zahl(scrollWidth) || !zahl(clientWidth) || clientWidth === 0 || scrollWidth === 0) return ungueltig('Breiten der sichtbaren Seite fehlen.');
  const details = { scrollWidth, clientWidth, ...(Array.isArray(messung.ueberlaufElemente) ? { ueberlaufElemente: messung.ueberlaufElemente } : {}) };
  return scrollWidth > clientWidth ? nein('Waagerechter Überlauf.', details) : ok('Kein waagerechter Überlauf.', details);
}

export function evaluiereBarrierebaum(antwort, { webviewVersion = antwort?.webviewVersion } = {}) {
  if (!objekt(antwort) || !Array.isArray(antwort.nodes) || !antwort.nodes.length || antwort.nodes.some((n) => !objekt(n) || typeof n.ignored !== 'boolean' || !text(n.nodeId) || (n.properties !== undefined && (!Array.isArray(n.properties) || n.properties.some((p) => !objekt(p)))))) return ungueltig('WebView liefert keinen auswertbaren Barrierebaum; auf dem Gerät nachzuprüfen.');
  const sichtbar = antwort.nodes.filter((n) => !n.ignored);
  const kinder = new Set(antwort.nodes.flatMap(n => Array.isArray(n.childIds) ? n.childIds : []));
  // Nur WebView 83 ist mit dem alten Rollennamen belegt. Ein WebArea-Kind
  // oder ein unbekannter Versionsstand darf keine fehlende Wurzel ersetzen.
  const wurzelRolle = /^83\./.test(webviewVersion ?? '') ? 'WebArea' : 'RootWebArea';
  const wurzeln = sichtbar.filter(n => n.role?.value === wurzelRolle && !n.parentId && !kinder.has(n.nodeId));
  if (wurzeln.length !== 1) return ungueltig('Eindeutige Wurzel des Barrierebaums fehlt.', { webviewVersion, erwartet: wurzelRolle });
  const rollen = ['button', 'textbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'slider', 'listbox', 'searchbox', 'switch', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'treeitem', 'Date', 'DateTime', 'InputTime', 'DisclosureTriangle'];
  const bedienung = sichtbar.filter((n) => n !== wurzeln[0] && (rollen.includes(n.role?.value) || n.properties?.some((p) => p.name === 'focusable' && p.value?.value === true)));
  if (!bedienung.length) return ungueltig('Keine Bedienelemente im Barrierebaum.');
  const ohneNamen = bedienung.filter(n => !text(n.name?.value) || !n.name.value.trim()).map(n => {
    const eltern = antwort.nodes.find(p => p.nodeId === n.parentId || p.childIds?.includes(n.nodeId));
    const dom = antwort.domKnoten?.find(d => d.backendDOMNodeId === n.backendDOMNodeId);
    return { nodeId: n.nodeId, rolle: n.role?.value, elternName: eltern?.name?.value ?? '',
      elternRolle: eltern?.role?.value ?? '', backendDOMNodeId: n.backendDOMNodeId,
      dom: dom ?? { hinweis: 'DOM-Beschreibung nicht aufgezeichnet; backendDOMNodeId ist der Bezug zum DOM.' } };
  });
  if (ohneNamen.length) {
    const beschreibung = ohneNamen.map(n => {
      const attribute = Array.isArray(n.dom.attributes) ? n.dom.attributes : [];
      const attr = name => { const i = attribute.indexOf(name); return i >= 0 ? attribute[i + 1] : ''; };
      const dom = n.dom.nodeName ? `${n.dom.nodeName.toLowerCase()}${attr('id') ? `#${attr('id')}` : ''}${attr('class') ? `.${attr('class').trim().replace(/\s+/g, '.')}` : ''}` : 'Beschreibung nicht aufgezeichnet';
      return `Knoten ${n.nodeId}, Rolle ${n.rolle}, Elternname „${n.elternName}“, DOM ${dom} (backendDOMNodeId ${n.backendDOMNodeId ?? 'fehlt'})`;
    });
    return nein(`Bedienelemente ohne zugänglichen Namen: ${beschreibung.join('; ')}.`, ohneNamen);
  }
  return ok('Barrierebaum mit benannten Bedienelementen; ersetzt keinen TalkBack-Lauf.');
}

/** Für durch CDP selbst erhobene, explizite Soll-Ist-Werte (keine Textmarker-Erkennung). */
export function evaluiereBeobachtungen(beobachtungen) {
  const skalar = (v) => v === null || typeof v === 'boolean' || text(v) || (typeof v === 'number' && Number.isFinite(v));
  if (!Array.isArray(beobachtungen) || !beobachtungen.length || beobachtungen.some((b) => !objekt(b) || !text(b.name) || !b.name.trim() || !skalar(b.ist) || !skalar(b.soll))) return ungueltig('Soll-Ist-Beobachtungen fehlen oder haben ein unbekanntes Format.');
  return zusammenfassen(beobachtungen.map((b) => Object.is(b.ist, b.soll) ? ok(b.name, { ist: b.ist, soll: b.soll }) : nein(b.name, { ist: b.ist, soll: b.soll })));
}

export function evaluiereBruecke(wert) {
  return objekt(wert) && text(wert.path) ? ok('WebView-Brücke liefert path.', wert) : ungueltig('Brückenantwort ohne lesbaren path.', wert);
}

export function evaluiereFehlerfalleGegenprobe(wert) {
  return wert === true ? ok('Fehlerfalle reagiert auf das Fehlerereignis eigener Herkunft.') : ungueltig('Fehlerfalle reagiert nicht nachweisbar auf die Gegenprobe.');
}

function ansichtsTexte(xml) {
  if (!text(xml)) return null;
  const inhalt = xml.trim().replace(/^<\?xml\s[^?]*\?>\s*/, '');
  const teile = inhalt.match(/<[^>]*>|[^<]+/g) ?? [];
  const stapel = [], sichtbar = [];
  let wurzeln = 0;
  for (const teil of teile) {
    if (!teil.startsWith('<')) { if (teil.trim()) return null; continue; }
    const ende = /^<\/(hierarchy|node)\s*>$/.exec(teil);
    if (ende) { if (stapel.pop() !== ende[1]) return null; continue; }
    const anfang = /^<(hierarchy|node)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>$/.exec(teil);
    if (!anfang) return null;
    const [, art, roh, selbst] = anfang;
    if (art === 'hierarchy') { if (stapel.length || wurzeln++) return null; }
    else if (!stapel.length) return null;
    const attribute = {};
    for (const m of roh.matchAll(/\s+([\w:-]+)="([^"<>]*)"/g)) {
      if (Object.hasOwn(attribute, m[1])) return null;
      attribute[m[1]] = m[2].replace(/&(?:amp|lt|gt|quot|apos);/g, (s) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[s]);
    }
    if (art === 'node') {
      const grenzen = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attribute.bounds ?? '');
      if (!grenzen || (attribute['visible-to-user'] !== undefined && !['true', 'false'].includes(attribute['visible-to-user']))) return null;
      if (attribute['visible-to-user'] !== 'false' && Number(grenzen[3]) > Number(grenzen[1]) && Number(grenzen[4]) > Number(grenzen[2])) {
        sichtbar.push(attribute.text ?? '', attribute['content-desc'] ?? '');
      }
    }
    if (!selbst) stapel.push(art);
  }
  return wurzeln === 1 && stapel.length === 0 && sichtbar.length ? sichtbar : null;
}

export function evaluiereReleaseStart(messung) {
  const texte = ansichtsTexte(messung?.xml);
  if (!texte) return ungueltig('Native Ansicht ist unvollständig oder nicht lesbar.');
  if (texte.some((s) => s.includes('Im Fristenrechner ist ein Fehler aufgetreten'))) return nein('Fehlerfalle sichtbar.');
  if (!texte.some((s) => s.includes('Fristenrechner Vergabe')) || !texte.some((s) => /Vergabeverfahren konfigurieren|Vergabeordnung/.test(s))) return ungueltig('Native Ansicht bestätigt die Formularanzeige nicht; Bild prüfen.');
  return ok('Formular in der nativen Ansicht, Fehlerfalle nicht sichtbar.');
}

export function evaluiereTastatur(ausgabe) {
  if (objekt(ausgabe)) {
    const { inputMethod, fenster, nachher } = ausgabe;
    if (!text(inputMethod) || !text(fenster)) return ungueltig('Eingabedienst oder Fensterbeleg der Tastatur fehlt.');
    const signal = (name) => [...inputMethod.matchAll(new RegExp(`\\b${name}=(true|false)\\b`, 'g'))].map(m => m[1]);
    const shown = signal('mInputShown'), view = signal('mIsInputViewShown');
    if (!shown.length || !view.length || new Set([...shown, ...view]).size !== 1) return ungueltig('Eingabedienst und Tastaturansicht bestätigen keinen eindeutigen gemeinsamen Zustand.');
    if (shown[0] === 'false') return nein('Eingabedienst und Tastaturansicht melden die Tastatur als verborgen.');
    // "window windows" nennt den Eingabeempfänger der Tastatur je nach Android-
    // Version anders: API 30 "mInputMethodInputTarget in display# 0", API 36
    // "imeInputTarget in display# 0" (Lauf vom 2026-09-30). mCurrentFocus steht
    // in beiden Ausgaben nicht und dient nur als Rückfall für andere Formate.
    // Ein IME-Fensterfokus allein belegt keinen Empfänger für die Eingabe.
    const empfaengerKopf = '(?:mInputMethodInputTarget in display# \\d+ |imeInputTarget in display# \\d+ |mImeInputTarget=)';
    const empfaenger = [...fenster.matchAll(new RegExp(`^\\s*${empfaengerKopf}Window\\{[^\\r\\n}]*?\\bu\\d+\\s+([^\\r\\n}]+)\\}`, 'gm'))].map(m => m[1].trim());
    const fokus = [...fenster.matchAll(/^\s*mCurrentFocus=Window\{[^\r\n}]*?\bu\d+\s+([^\r\n}]+)\}/gm)].map(m => m[1].trim());
    const empfaengerZeilen = fenster.match(new RegExp(`^\\s*${empfaengerKopf}[^\\r\\n]*$`, 'gm')) ?? [];
    const ziele = empfaengerZeilen.length ? empfaenger : fokus;
    const fokusquelle = empfaengerZeilen.length ? 'IME-Eingabeempfänger' : 'mCurrentFocus';
    if (nachher?.aktivesElement?.name !== 'projektname' || nachher.aktivesElement.tag !== 'input' ||
        (empfaengerZeilen.length && empfaenger.length !== empfaengerZeilen.length) || !ziele.length || new Set(ziele).size !== 1 ||
        ![`${APP}/.MainActivity`, `${APP}/${APP}.MainActivity`].includes(ziele[0])) return ungueltig('Fokus auf Projektname und App-Fenster ist nicht gemeinsam belegt.');
    // API 30/36: sichtbare IME-Inset-Fläche. Eine leere Fläche kann trotz
    // mInputShown=true auftreten, wenn die Hardwaretastatur aktiv ist.
    const flaechen = [...fenster.matchAll(/\b(?:type=ime|type=ITYPE_IME)\s+frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]([^\r\n]*?)\bvisible=(true|false)\b/g)]
      .map(m => {
        const sichtbar = /\bvisibleFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(m[5]);
        return { breite: Number(m[3]) - Number(m[1]), hoehe: Number(m[4]) - Number(m[2]), sichtbar: m[6] === 'true',
          ...(sichtbar ? { sichtbareBreite: Number(sichtbar[3]) - Number(sichtbar[1]), sichtbareHoehe: Number(sichtbar[4]) - Number(sichtbar[2]) } : {}) };
      });
    for (const m of fenster.matchAll(/\bInsetsSource: \{mType=ITYPE_IME, mFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\], mVisible=(true|false)\}/g)) {
      flaechen.push({ breite: Number(m[3]) - Number(m[1]), hoehe: Number(m[4]) - Number(m[2]), sichtbar: m[5] === 'true' });
    }
    if (!flaechen.length) {
      for (const abschnitt of fenster.split(/(?=^\s*Window #\d+ Window\{)/m)) {
        if (!/^\s*Window #\d+ Window\{[^\r\n}]*\bInputMethod\}/.test(abschnitt)) continue;
        const frame = /(?:mFrame=|\bframe=)\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(abschnitt);
        if (frame && /\bisOnScreen=true\b/.test(abschnitt) && /\bisVisible=true\b/.test(abschnitt)) flaechen.push({ breite: Number(frame[3]) - Number(frame[1]), hoehe: Number(frame[4]) - Number(frame[2]), sichtbar: true });
      }
    }
    if (!flaechen.length || flaechen.some(f => !f.sichtbar || f.hoehe <= 0 || f.breite <= 0 || f.sichtbareHoehe <= 0 || f.sichtbareBreite <= 0)) return ungueltig('Keine eindeutig sichtbare Tastaturfläche mit positiver Höhe aufgezeichnet.', { flaechen });
    return ok('Tastaturansicht und Eingabedienst sichtbar; IME-Fläche mit positiver Höhe und Fokus auf Projektname belegt.', { flaechen, fokusquelle, eingabeziel: ziele[0], vorher: ausgabe.vorher, nachher });
  }
  if (!text(ausgabe)) return ungueltig('Ausgabe des Eingabedienstes fehlt.');
  const werte = [...ausgabe.matchAll(/\b(?:mInputShown|mIsInputViewShown)=(true|false)\b/g)].map((m) => m[1]);
  if (!werte.length || new Set(werte).size > 1) return ungueltig('Sichtbarkeit der Tastatur ist nicht eindeutig belegt.');
  return werte[0] === 'true' ? ungueltig('Eingabedienst meldet die Tastatur als sichtbar; unabhängiger Beleg der sichtbaren Fensterfläche und des Fokus fehlt.') : nein('Tastatur wird vom Eingabedienst als verborgen gemeldet.');
}

export function evaluiereFehlerseiteGegenprobe(messung) {
  if (!text(messung?.logcat)) return ungueltig('Protokoll der Gegenprobe ohne Fehlerseite fehlt.');
  const anfragen = (messung.logcat.match(/^[^\r\n]*\bE\/Capacitor\(\s*\d+\): Unable to open asset URL: https:\/\/localhost\/startfehler\.html\r?$/gm) ?? []).length;
  return anfragen > 1 ? ok('Entfernte Fehlerseite löst die beobachtete Fehlerschleife aus.', { anfragen }) : ungueltig('Gegenprobe ohne Fehlerseite zeigt keine belegte Fehlerschleife.', { anfragen });
}

export function evaluiereZurueck(ausgabe, paket = APP) {
  const activity = evaluiereActivity(ausgabe, paket);
  if (activity.status === STATUS.ungueltig) return activity;
  return activity.status === STATUS.bestanden ? nein('App nach Zurück weiter im Vordergrund.', activity.details) : ok('Zurück verlässt die App.', activity.details);
}

export function evaluiereRuhe(messung) {
  if (!objekt(messung) || !zahl(messung.vorher?.annahmen) || !zahl(messung.nachher?.annahmen) || ['ruhe', 'hintergrund', 'rueckkehr'].some((k) => !zahl(messung[k]))) return ungueltig('Messwerte der Releasephase fehlen oder sind unlesbar.');
  if (messung.vorher.annahmen === 0 || messung.nachher.annahmen === 0) return ungueltig('Gegenprobe vor oder nach der Releasephase ohne Wirkung.');
  if (messung.hintergrund < messung.ruhe || messung.rueckkehr < messung.hintergrund) return ungueltig('Kumulative Netzmelderzähler gehen während der Releasephase zurück.');
  return evaluiereBeobachtungen([{ name: '60 s Ruhe', ist: messung.ruhe, soll: 0 }, { name: 'Hintergrund', ist: messung.hintergrund, soll: 0 }, { name: 'Rückkehr', ist: messung.rueckkehr, soll: 0 }]);
}

/** Vorhandene Rohbelege erneut lesen; ursprüngliche Befunde und nicht gelaufene Schritte bleiben sichtbar. */
export async function werteLaufAus(lauf) {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const lesen = (name) => readFile(join(lauf, name), 'utf8');
  const json = async (name) => JSON.parse(await lesen(name));
  const original = await json('ergebnis.json');
  if (!Array.isArray(original.befund)) throw new Error('Lauf enthält keine Befundliste.');
  const befunde = structuredClone(original.befund), neuAusgewertet = [], zusaetzlich = [];
  const setzen = (id, wert, quellen) => {
    const index = befunde.findIndex((b) => b.id === id), eintrag = { id, ...wert };
    if (index < 0) { befunde.push(eintrag); zusaetzlich.push(id); } else befunde[index] = eintrag;
    const neuIndex = neuAusgewertet.findIndex(n => n.id === id);
    if (neuIndex < 0) neuAusgewertet.push({ id, quellen }); else neuAusgewertet[neuIndex] = { id, quellen };
  };
  const vorhanden = new Set(await readdir(lauf));
  const neu = async (id, quellen, auswerten) => {
    try { setzen(id, await auswerten(), quellen); }
    catch (e) { setzen(id, ungueltig(`Rohbeleg nicht auswertbar: ${e.message}`), quellen); }
  };
  const dateienAngefordert = vorhanden.has('dateien-roh.json') || original.auswahl?.ablauf === 'dateien' || original.auswahl?.phasen?.includes('dateien') || original.befund.some(b => b.id?.startsWith('dateien-'));
  if (dateienAngefordert) {
    const { werteDateienAus } = await import('./emulator/dateien-auswertung.mjs');
    const dateibefunde = await werteDateienAus(lauf, 'dateien-roh.json', original.auswahl?.api);
    for (const { id, ...wert } of dateibefunde) setzen(id, wert, ['dateien-roh.json']);
    for (const b of original.befund.filter(b => b.id?.startsWith('dateien-'))) {
      if (!dateibefunde.some(n => n.id === b.id)) setzen(b.id, ungueltig('Der ursprüngliche Dateibefund hat keinen vollständigen Rohfall in dateien-roh.json.'), ['dateien-roh.json']);
    }
    const { evalDateienNetz } = await import('./emulator/dateien-netz.mjs');
    for (const variante of ['debug', 'release']) {
      const name = `dateien-netz-${variante}.json`;
      await neu(`D12-netz-${variante}`, [name], async () => evalDateienNetz(await json(name)));
    }
    for (const phase of original.auswahl?.api === 36 ? ['standard', 'geraetewechsel'] : ['standard']) {
      const name = `sicherung-${phase}-app-backupnow.txt`;
      if (!vorhanden.has(name)) setzen(`sicherung-${phase}`, ungueltig('Dateiphase enthält keinen Rohbeleg der erforderlichen Sicherungsprüfung.'), [name]);
    }
  }
  if (vorhanden.has('b-unix.txt')) await neu('B-Socket', ['b-unix.txt', 'b-debug-unix.txt', 'geraet.json'], async () => {
    const g = await json('geraet.json');
    const buildType = g.buildType ?? /:([^/:]+)\/[^/]+$/.exec(g.fingerprint ?? '')?.[1];
    const wert = evaluiereUnixSockets({ text: await lesen('b-unix.txt'), debugSocketNachgewiesen: /@webview_devtools_remote_\d+\b/.test(await lesen('b-debug-unix.txt')), buildType });
    return { ...wert, details: { ...wert.details, buildTypeQuelle: g.buildType ? 'getprop ro.build.type' : 'Historischer Gerätefingerabdruck; ro.build.type damals nicht gesondert erhoben.' } };
  });
  if (vorhanden.has('b-package.txt')) await neu('B-Flags', ['b-package.txt'], async () => evaluiereReleaseFlags({ dumpsys: await lesen('b-package.txt') }));
  for (const name of ['schrift-1-3', 'schrift-2-0', 'nacht', 'gedreht', 'tastatur']) {
    if (vorhanden.has(`a8-${name}.json`)) await neu(`A8-${name}`, [`a8-${name}.json`], async () => evaluiereUeberlauf(await json(`a8-${name}.json`)));
  }
  if (vorhanden.has('a8-tastatur-nachweis.json')) await neu('A8-Tastatur', ['a8-tastatur-nachweis.json'], async () => evaluiereTastatur(await json('a8-tastatur-nachweis.json')));
  else if (vorhanden.has('a8-tastatur.txt')) await neu('A8-Tastatur', ['a8-tastatur.txt'], async () => evaluiereTastatur(await lesen('a8-tastatur.txt')));
  if (vorhanden.has('ohne-fehlerseite-logcat.txt')) await neu('ohne-fehlerseite', ['ohne-fehlerseite-logcat.txt', 'adb.jsonl'], async () => {
    const logcat = await lesen('ohne-fehlerseite-logcat.txt');
    const adb = (await lesen('adb.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
    const normal = s => s.replaceAll('\r\n', '\n').trim();
    if (!adb.some(a => a.code === 0 && a.args?.[0] === 'logcat' && a.args.includes('-d') && text(a.out) && normal(a.out) === normal(logcat))) throw new Error('logcat-Rohtext ist nicht durch einen erfolgreichen ADB-Aufruf belegt.');
    return evaluiereFehlerseiteGegenprobe({ logcat });
  });
  if (vorhanden.has('a10-barrierebaum.json')) await neu('A10', ['a10-barrierebaum.json', 'geraet.json'], async () => {
    const g = await json('geraet.json');
    const webviewVersion = /Current WebView package \(name, version\): \([^,]+, (\d+(?:\.\d+)+)\)/.exec(g.webview ?? '')?.[1];
    return evaluiereBarrierebaum(await json('a10-barrierebaum.json'), { webviewVersion });
  });
  const navigationen = new Set(original.befund.filter((b) => b.id.startsWith('navigation-')).map((b) => b.id.slice('navigation-'.length)));
  for (const name of ['href', 'open', 'blank', 'mailto', 'tel', 'intent', 'file', 'content', 'data']) {
    if (vorhanden.has(`navigation-app-${name}.json`) && vorhanden.has(`navigation-gegen-${name}.json`)) navigationen.add(name);
  }
  for (const name of navigationen) {
    const quellen = [`navigation-app-${name}.json`, `navigation-gegen-${name}.json`];
    try { setzen(`navigation-${name}`, evaluiereNavigation({ name, app: await json(quellen[0]), gegen: await json(quellen[1]) }), quellen); }
    catch (e) { setzen(`navigation-${name}`, ungueltig(`Rohbeleg der Navigation nicht lesbar: ${e.message}`), quellen); }
  }
  if (vorhanden.has('netz.json')) {
    try {
      const n = await json('netz.json');
      setzen('netz', evaluiereNetz(n), ['netz.json']);
      const gegenprobe = { uid: n.gegenUid, tabellen: n.vorher?.tabellen };
      for (const [name, tabellen] of [['vorher', n.procVorher], ...(n.app ?? []).map((m) => [m.name, m.tabellen]), ['nachher', n.procNachher]]) {
        setzen(`netz-proc-${name}`, evaluiereProcNet({ uid: n.appUid, tabellen, gegenprobe }), ['netz.json']);
      }
      if (original.auswahl?.api === 36) setzen('netz-netstats', evaluiereNetstats({ api: 36, uid: n.appUid, gegenUid: n.gegenUid, vorher: n.netstatsVorher, nachher: n.netstatsNachher }), ['netz.json']);
    } catch (e) { setzen('netz', ungueltig(`Netz-Rohbeleg nicht lesbar: ${e.message}`), ['netz.json']); }
  }
  if (vorhanden.has('sicherung-standard-app-backupnow.txt')) {
    const { leseLocalTransportArchiv } = await import('./emulator/pruefungen.mjs');
    const adb = (await lesen('adb.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
    const marker = await json('sicherung-marker.json');
    const phasen = original.auswahl?.api === 36 ? ['standard', 'geraetewechsel'] : ['standard'];
    for (const phase of phasen) {
      const prefix = `sicherung-${phase}`, quellen = ['adb.jsonl', 'sicherung-marker.json'];
      if (!vorhanden.has(`${prefix}-app-backupnow.txt`)) {
        setzen(`sicherung-${phase}`, ungueltig('Diese Sicherungsphase wurde im ursprünglichen Lauf nicht ausgeführt.'), []);
        continue;
      }
      try {
        const daten = { deviceTransfer: phase === 'geraetewechsel' };
        for (const [rolle, paket] of [['app', APP], ['gegen', GEGEN]]) {
          daten[`${rolle}Paket`] = paket;
          const name = (suffix) => `${prefix}-${rolle}-${suffix}.txt`;
          const zustand = await lesen(name('package')), ausgabe = await lesen(name('backupnow'));
          const full = await lesen(name('ablage')), delta = await lesen(name('delta'));
          quellen.push(name('package'), name('backupnow'), name('ablage'), name('delta'));
          const ablage = '/data/data/com.android.localtransport/files/1/';
          // Entspricht genau ctx.shell: CRLF wird LF, äußerer Leerraum entfernt.
          const shellBelegt = (befehl, out) => adb.some((a) => a.code === 0 && a.args?.[0] === 'shell' && a.args[1] === befehl && typeof a.out === 'string' && a.out.replaceAll('\r\n', '\n').trim() === out);
          for (const [befehl, out] of [[`dumpsys package ${paket}`, zustand], [`bmgr backupnow ${paket}`, ausgabe], [`ls -1 ${ablage}_full`, full], [`ls -1 ${ablage}_delta`, delta]]) {
            if (!shellBelegt(befehl, out)) throw new Error('Rohtext ist nicht durch einen erfolgreichen ADB-Aufruf belegt.');
          }
          const stopped = zustand.match(/\bUser 0:[^\r\n]*\bstopped=(true|false)\b/);
          daten[`${rolle}Stopped`] = stopped ? stopped[1] === 'true' : undefined;
          daten[`${rolle}Ausgabe`] = ausgabe;
          const dateien = delta.split(/\r?\n/).includes(paket) ? [`LocalTransport/_delta/${paket}`] : [];
          daten[`${rolle}Marker`] = false;
          if (full.split(/\r?\n/).includes(paket)) {
            const archivName = `sicherung/${phase}-${rolle}.tar`, pullText = await lesen(name('pull'));
            const pull = adb.find((a) => a.code === 0 && a.args?.[0] === 'pull' && a.args[1] === `${ablage}_full/${paket}` && `${a.out}\n${a.err}` === pullText);
            if (!pull) throw new Error('Binäre Übertragung nicht durch adb pull belegt.');
            const archiv = leseLocalTransportArchiv(await readFile(join(lauf, archivName)), marker[rolle], { paket, backupAusgabe: ausgabe, pullAusgabe: pullText });
            dateien.push(...archiv.eintraege.map((e) => e.name));
            daten[`${rolle}Marker`] = archiv.marker;
            daten[`${rolle}Archiv`] = archiv;
            quellen.push(archivName, name('pull'));
          }
          daten[`${rolle}Dateien`] = dateien;
          daten[`${rolle}ArchivLesbar`] = true;
        }
        if (vorhanden.has(`${prefix}-logcat.txt`)) { daten.logcat = await lesen(`${prefix}-logcat.txt`); quellen.push(`${prefix}-logcat.txt`); }
        setzen(`sicherung-${phase}`, evaluiereSicherung(daten), quellen);
      } catch (e) { setzen(`sicherung-${phase}`, ungueltig(`Sicherungs-Rohbeleg nicht auswertbar: ${e.message}`), quellen); }
    }
    // Der damalige Abbruch bleibt ein Laufbefund; erfolgreiche Neuauswertung ist kein neuer Gerätelauf.
    const laufbefund = befunde.find((b) => b.id === 'ablauf-sicherung');
    if (laufbefund) laufbefund.grund += ' Einzelphasen wurden getrennt aus den erhaltenen Rohbelegen neu ausgewertet; der Lauf wurde nicht wiederholt.';
  }
  const sichtgruppen = Object.entries(SICHTPRUEFUNGEN).filter(([id]) => original.befund.some(b => b.id === id &&
    (b.status === STATUS.sicht || (b.status === STATUS.ungueltig &&
      (b.grund === 'Bilder für Systemleisten, Verdeckung und Lesbarkeit müssen noch gesichtet werden.' ||
       b.grund === 'Startbild, Systemleisten und Fehlerfalle im Bildschirmfoto noch manuell prüfen.')))));
  let sichtpruefung;
  if (sichtgruppen.length || vorhanden.has('sichtpruefung.json')) {
    const bilder = sichtgruppen.flatMap(([, liste]) => liste);
    for (const [id, liste] of sichtgruppen) setzen(id, sichtpruefungAusstehend(liste), liste);
    try {
      sichtpruefung = await leseSichtpruefung(lauf, bilder);
      for (const [id, liste] of sichtgruppen) {
        const geprueft = sichtpruefung.pruefungen.filter(p => liste.includes(p.bild));
        const ausstehend = liste.filter(bild => !geprueft.some(p => p.bild === bild));
        const details = { ausstehend, geprueft };
        const negativ = geprueft.filter(p => p.ergebnis === STATUS.fehler);
        const wert = negativ.length ? nein(`Sichtprüfung nicht bestanden: ${negativ.map(p => p.bild).join(', ')}.`, details) :
          ausstehend.length ? { ...sichtpruefungAusstehend(ausstehend), details } : ok('Alle Bilder dieser Gruppe geprüft; Sichtprüfung bestanden.', details);
        setzen(id, wert, [...liste, ...(sichtpruefung.datei ? [sichtpruefung.datei] : [])]);
      }
    } catch (e) {
      sichtpruefung = { datei: vorhanden.has('sichtpruefung.json') ? 'sichtpruefung.json' : null, pruefungen: [], ausstehend: bilder, fehler: e.message };
      setzen('Sichtprüfprotokoll', ungueltig(`Sichtprüfung nicht auswertbar: ${e.message}`), ['sichtpruefung.json', ...bilder]);
    }
  }
  return {
    schema: 2, art: 'Neuauswertung vorhandener Rohbelege', datum: new Date().toISOString(),
    vorher: { ergebnis: original.ergebnis, code: original.code, anzahl: zaehleBefunde(original.befund), befund: original.befund },
    nachher: { ergebnis: zusammenfassen(befunde).status, code: rueckgabewert(befunde), anzahl: zaehleBefunde(befunde), befund: befunde },
    aufraeumen: original.aufraeumen ?? [], zaehlung: 'Einzelbefunde ohne Aufräumen und ohne Gesamtergebnis.',
    neuAusgewertet, zusaetzlich, ...(sichtpruefung ? { sichtpruefung } : {}),
    unveraendertUebernommen: original.befund.filter((b) => !neuAusgewertet.some((n) => n.id === b.id)).map((b) => b.id),
    hinweis: 'Nur aufgeführte Rohbelege wurden neu ausgewertet. Übrige Befunde stammen aus dem ursprünglichen Lauf. Nicht ausgeführte Schritte brauchen einen neuen Lauf. Rückgabewert 3 kennzeichnet ausschließlich dokumentierte Grenzen. Rückgabewert 4 kennzeichnet ausstehende Sichtprüfungen und kann zusätzlich dokumentierte Grenzen enthalten. Fehler (1) und ungültige Messungen oder Prüfvermerke (2) haben Vorrang. Nur 0 bedeutet vollständig bestanden.',
  };
}

export async function auswertungCli(args) {
  const { mkdir, writeFile, realpath } = await import('node:fs/promises');
  const { resolve, relative, isAbsolute, dirname, join } = await import('node:path');
  const optionen = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--lauf', '--ausgabe'].includes(args[i]) || !args[i + 1] || optionen[args[i]]) throw new Error('Aufruf: node scripts/emulator-auswertung.mjs --lauf <Laufordner> --ausgabe <neuer Ordner>');
    optionen[args[i]] = args[i + 1];
  }
  if (!optionen['--lauf'] || !optionen['--ausgabe']) throw new Error('--lauf und --ausgabe sind erforderlich.');
  const lauf = await realpath(resolve(optionen['--lauf']));
  const ausgabe = resolve(optionen['--ausgabe']);
  const innerhalb = (ziel) => { const r = relative(lauf, ziel); return !r || (!r.startsWith('..') && !isAbsolute(r)); };
  if (innerhalb(ausgabe) || innerhalb(await realpath(dirname(ausgabe)))) throw new Error('Ausgabe darf nicht im ursprünglichen Laufordner liegen.');
  const bericht = await werteLaufAus(lauf);
  await mkdir(ausgabe); // Existierende Ausgabeordner werden niemals überschrieben.
  await writeFile(join(ausgabe, 'ergebnis.json'), JSON.stringify(bericht, null, 2) + '\n', { flag: 'wx' });
  const zeilen = [bericht.art, `Vorher: ${bericht.vorher.ergebnis}; Rückgabewert ${bericht.vorher.code}; ${JSON.stringify(bericht.vorher.anzahl)}`,
    `Nachher: ${bericht.nachher.ergebnis}; Rückgabewert ${bericht.nachher.code}; ${JSON.stringify(bericht.nachher.anzahl)}`,
    ...bericht.nachher.befund.map((b) => `${b.id}: ${b.status} – ${b.grund}`),
    ...(bericht.sichtpruefung?.pruefungen ?? []).map(p => `Sichtprüfung ${p.bild}: ${p.ergebnis}; wer: ${p.wer}; wann: ${p.wann}; SHA-256: ${p.sha256}; ${p.bemerkung}`), '', bericht.hinweis];
  await writeFile(join(ausgabe, 'zusammenfassung.txt'), zeilen.join('\n') + '\n', { flag: 'wx' });
  return bericht;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  auswertungCli(process.argv.slice(2)).then((b) => {
    console.log(`Neuauswertung: ${b.nachher.ergebnis}; Rückgabewert ${b.nachher.code}`); process.exitCode = b.nachher.code;
  }).catch((e) => { console.error(e.message); process.exitCode = 2; });
}
