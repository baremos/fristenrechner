#!/usr/bin/env node
// Prüfung auf einem echten Gerät über USB, ohne Root. Sie ergänzt den Emulatorlauf um
// das, was nur ein Gerät mit Build-Typ user zeigt: ob das Debugging der WebView im
// Release-Build aus ist. Ausführung unter Windows; Import startet nichts.
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { findeJdk } from './werkzeuge.mjs';
import { befund, zusammenfassen, rueckgabewert, zaehleBefunde, evaluiereActivity, evaluiereReleaseFlags, evaluiereUnixSockets, evaluiereReleaseStart } from './emulator-auswertung.mjs';
import { APP, ausgabePruefen, dateiNoetig, mitAufraeumen, pause, prozess, schreiber, sha256 } from './emulator/rahmen.mjs';
import { signiereRelease } from './emulator/bauen.mjs';
import { ANSICHT_REMOTE, ansichtsKnoten, leseAnsichtsbaum, repositories } from './emulator-lauf.mjs';

export const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVITY = `${APP}/de.baremos.fristenrechner.MainActivity`;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const RANG = ['nicht bestanden', 'ungültig', 'dokumentierte Grenze', 'bestanden'];
// Diesen Socket gibt es auf keinem Gerät. Der Abruf dorthin zeigt, wie „kein Socket“ auf diesem Weg aussieht.
export const KONTROLLSOCKET = 'fristenrechner_geraetelauf_ohne_socket';
export const PROBEN = 3;
// So endet ein Abruf, den die Weiterleitung annimmt und das Gerät sofort wieder schließt. Andere Fehler
// (niemand hört am Port des Rechners, Zeitüberschreitung) sagen nichts über das Gerät.
const CODES_OHNE_SOCKET = ['UND_ERR_SOCKET', 'ECONNRESET'];

export function argumente(argv, wurzelOrdner, repos = [wurzelOrdner]) {
  const o = {};
  const mitWert = new Set(['--seriennummer', '--ausgabe', '--apk-debug', '--apk-release']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== '--app-behalten' && !mitWert.has(a)) throw new Error(`Unbekanntes Argument: ${a}`);
    if (Object.hasOwn(o, a)) throw new Error(`Argument doppelt: ${a}`);
    if (a === '--app-behalten') { o[a] = true; continue; }
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Wert fehlt: ${a}`);
    o[a] = argv[++i];
  }
  for (const a of ['--seriennummer', '--ausgabe']) if (!o[a]) throw new Error(`Pflichtargument fehlt: ${a}`);
  const seriennummer = o['--seriennummer'];
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(seriennummer)) throw new Error('--seriennummer enthält unerwartete Zeichen.');
  if (/^emulator-\d+$/.test(seriennummer)) throw new Error('Für Emulatoren ist scripts/emulator-lauf.mjs vorgesehen.');
  return {
    seriennummer, ausgabe: ausgabePruefen(o['--ausgabe'], repos), appBehalten: o['--app-behalten'] === true,
    debug: resolve(o['--apk-debug'] ?? join(wurzelOrdner, 'app/android/app/build/outputs/apk/debug/app-debug.apk')),
    release: resolve(o['--apk-release'] ?? join(wurzelOrdner, 'app/android/app/build/outputs/apk/release/app-release-unsigned.apk')),
  };
}

// Zustand des Geräts in der Ausgabe von adb devices: device, unauthorized, offline oder null.
export function geraetZustand(ausgabe, seriennummer) {
  const zeilen = ausgabe.split(/\r?\n/).map(z => /^(\S+)\s+(\S+)\s*$/.exec(z)).filter(Boolean);
  const treffer = zeilen.filter(m => m[1] === seriennummer);
  return treffer.length === 1 ? treffer[0][2] : null;
}

// Mehrere Proben derselben Prüfung: Es gilt das ungünstigste Ergebnis.
export function unguenstigster(befunde) {
  if (!befunde.length) return befund('ungültig', 'Keine Probe vorhanden.');
  return [...befunde].sort((a, b) => RANG.indexOf(a.status) - RANG.indexOf(b.status))[0];
}

// Startzeit eines Prozesses aus /proc/<pid>/stat: Feld 22, Ticks seit dem Systemstart. Zusammen mit der
// Prozessnummer unterscheidet sie einen neu gestarteten Prozess auch dann, wenn er dieselbe Nummer erhält.
// Der Name in Klammern kann Leerzeichen und Klammern enthalten; gezählt wird deshalb ab der letzten Klammer.
export function prozessStart(stat, pid) {
  if (typeof stat !== 'string' || typeof pid !== 'string' || !/^\d+$/.test(pid) || !stat.startsWith(`${pid} (`)) return null;
  const ende = stat.lastIndexOf(')');
  const start = stat.slice(ende + 1).trim().split(/\s+/)[19];
  return /^\d+$/.test(start ?? '') ? start : null;
}

// Die Formulartexte müssen aus Knoten des eigenen Pakets stammen; die Ansicht kann auch fremde Fenster enthalten.
// Es zählen nur Knoten, die zugleich dem eigenen Paket gehören, sichtbar sind und eine Fläche haben.
export function formularAusEigenemPaket(xml) {
  const knoten = ansichtsKnoten(xml);
  if (!knoten) return false;
  const sichtbar = k => {
    const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(k.bounds ?? '');
    return m !== null && Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]) && k['visible-to-user'] !== 'false';
  };
  const texte = knoten.filter(k => k.package === APP && sichtbar(k)).map(k => `${k.text ?? ''} ${k['content-desc'] ?? ''}`);
  return texte.some(t => t.includes('Fristenrechner Vergabe')) && texte.some(t => /Vergabeverfahren konfigurieren|Vergabeordnung/.test(t));
}

// Fragt die Versionsauskunft der Devtools ab und wirft nie. Drei Ausgänge:
// antwort (gültige Auskunft), unerwartet (etwas antwortet, aber anders), fehler (kein Abruf möglich).
export async function holeDevtoolsVersion(port, timeoutMs = 3000) {
  const beginn = Date.now();
  const dauer = () => Date.now() - beginn;
  let antwort;
  try { antwort = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) { return { art: 'fehler', name: e.name, code: e.cause?.code ?? null, meldung: e.message, ms: dauer() }; }
  let text;
  try { text = await antwort.text(); }
  catch (e) { return { art: 'unerwartet', status: antwort.status, grund: `Antwort nicht lesbar: ${e.name}`, ms: dauer() }; }
  let daten = null;
  try { daten = JSON.parse(text); } catch { /* Kein JSON: unten als unerwartet gemeldet. */ }
  if (antwort.status === 200 && daten !== null && typeof daten === 'object' && typeof daten.Browser === 'string') {
    return { art: 'antwort', status: 200, browser: daten.Browser, paket: typeof daten['Android-Package'] === 'string' ? daten['Android-Package'] : null, ms: dauer() };
  }
  return { art: 'unerwartet', status: antwort.status, grund: 'Antwort ist keine Versionsauskunft der Devtools.', text: text.slice(0, 200), ms: dauer() };
}

const objekt = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const pidGueltig = pid => typeof pid === 'string' && /^\d+$/.test(pid);
const kennungGueltig = k => typeof k === 'string' && /^\d+@\d+$/.test(k);
const buildTypLesbar = t => typeof t === 'string' && /^[a-z][a-z0-9_-]*$/.test(t);
// „Kein Socket“ gilt nur, wenn die Weiterleitung nachweislich bestand und die Gegenseite die Verbindung schloss.
const ohneSocket = a => objekt(a) && a.art === 'fehler' && a.name === 'TypeError' && CODES_OHNE_SOCKET.includes(a.code) && a.weiterleitungBelegt === true;

// Voraussetzungen einer Probe am Release-Build: derselbe Prozess wie beim Beleg von Start und Formular,
// vor und nach der Probe, und die App im Vordergrund. kennung ist Prozessnummer@Startzeit.
export function probeGueltig(p, kennung) {
  if (!objekt(p)) return 'Probe fehlt oder ist unlesbar.';
  if (typeof p.fehler === 'string') return `Die Messung brach ab: ${p.fehler}`;
  if (!kennungGueltig(p.kennungVor) || !kennungGueltig(p.kennungNach)) return 'Der Prozess der App läuft während der Probe nicht, oder seine Startzeit ist nicht lesbar.';
  if (p.kennungVor !== p.kennungNach) return 'Der Prozess der App hat während der Probe gewechselt.';
  if (!kennungGueltig(kennung) || p.kennungVor !== kennung) return 'Die Probe betrifft einen anderen Prozess als der Beleg von Start und Formular.';
  if (p.vordergrundVor !== true || p.vordergrundNach !== true) return 'Die App liegt während der Probe nicht im Vordergrund.';
  return null;
}

function probenMangel(proben, kennung, anzahl) {
  if (proben.length !== anzahl) return `Es liegen ${proben.length} von ${anzahl} Proben vor.`;
  for (const [i, p] of proben.entries()) {
    const mangel = probeGueltig(p, kennung);
    if (mangel) return `Probe ${i + 1}: ${mangel}`;
  }
  return null;
}

// Zweiter Beleg neben der Socketliste: Lässt sich eine Verbindung zu den Devtools der WebView aufbauen?
// Eine erhaltene Antwort geht jeder anderen Bewertung vor. „Bestanden“ verlangt, dass der Abruf am Prozess der
// App so endet wie der Abruf an einem Socket, den es nicht gibt: in derselben Probe und wie schon in der
// Debugphase, in der die Devtools über denselben Weg geantwortet haben. Das belegt, wie der Verbindungsversuch
// endet; dass kein Socket vorhanden ist, belegt die Socketliste.
export function evaluiereDevtoolsVerbindung(messung) {
  const { gegenprobeErreichbar, debugKontrolle, startBelegt, kennung, proben, buildType, anzahl = PROBEN } = objekt(messung) ? messung : {};
  if (!buildTypLesbar(buildType)) return befund('ungültig', 'Build-Typ des Geräts fehlt oder ist unlesbar.');
  if (!Array.isArray(proben) || proben.some(p => !objekt(p))) return befund('ungültig', 'Proben der Devtools-Verbindung fehlen oder sind unlesbar.');
  if (buildType !== 'user') return befund('dokumentierte Grenze', `Build-Typ ${buildType}: WebView-Debugging lässt sich hier nicht als Release-Eigenschaft prüfen.`, { buildType, proben });
  if (proben.some(p => p.abruf?.art === 'antwort')) return befund('nicht bestanden', 'Die Devtools der WebView sind im Release-Build erreichbar.', { buildType, proben });
  if (gegenprobeErreichbar !== true) return befund('ungültig', 'Im Debug-Build kam keine Verbindung zu den Devtools zustande; die Gegenprobe ist ohne Wirkung.');
  if (!ohneSocket(debugKontrolle)) return befund('ungültig', 'Der Kontrollabruf in der Debugphase endete nicht wie an einem Socket, den es nicht gibt; der Verbindungsweg ist nicht belegt.', { debugKontrolle });
  if (startBelegt !== true) return befund('ungültig', 'Start und Formular der Release-Kopie sind nicht für einen durchgehend laufenden Prozess belegt; die Verbindungsprüfung sagt dann nichts aus.');
  const mangel = probenMangel(proben, kennung, anzahl);
  if (mangel) return befund('ungültig', mangel, { proben });
  for (const [i, p] of proben.entries()) {
    if (!ohneSocket(p.kontrolle) || p.kontrolle.code !== debugKontrolle.code) return befund('ungültig', `Probe ${i + 1}: Der Abruf am Kontrollsocket endete nicht wie in der Debugphase; der Verbindungsweg ist nicht belegt.`, { proben, debugKontrolle });
    if (!ohneSocket(p.abruf) || p.abruf.code !== p.kontrolle.code) return befund('ungültig', `Probe ${i + 1}: Der Abruf am Prozess der App endete anders als am Kontrollsocket (${p.abruf?.art ?? 'fehlt'}); nicht eindeutig.`, { proben });
  }
  return befund('bestanden', 'Keine Antwort der Devtools im Release-Build: Der Abruf endet in jeder Probe wie an einem Socket, den es nicht gibt; im Debug-Build kam die Verbindung über denselben Weg zustande.', { buildType });
}

// Socketliste je Probe. Ein gefundener Socket geht jeder anderen Bewertung vor; der Socket des eigenen
// Prozesses zählt auch dann, wenn die Gegenprobe am Debug-Build ohne Wirkung war.
export function evaluiereSocketProben(messung) {
  const { debugSocketNachgewiesen, startBelegt, kennung, proben, buildType, anzahl = PROBEN } = objekt(messung) ? messung : {};
  if (!buildTypLesbar(buildType)) return befund('ungültig', 'Build-Typ des Geräts fehlt oder ist unlesbar.');
  if (!Array.isArray(proben) || proben.some(p => !objekt(p))) return befund('ungültig', 'Proben der Socketliste fehlen oder sind unlesbar.');
  if (buildType !== 'user') return befund('dokumentierte Grenze', `Build-Typ ${buildType}: WebView-Debugging lässt sich hier nicht als Release-Eigenschaft prüfen; Nachweis auf einem echten Gerät mit Build-Typ user ausstehend.`, { buildType });
  for (const [i, p] of proben.entries()) {
    const pids = [p.pidVor, p.pidNach].filter(pidGueltig);
    if (typeof p.text === 'string' && pids.some(pid => new RegExp(`@webview_devtools_remote_${pid}\\b`).test(p.text))) {
      return befund('nicht bestanden', `Probe ${i + 1}: Der Devtools-Socket des Prozesses der App steht in /proc/net/unix.`, { buildType, pids });
    }
  }
  const einzeln = proben.map(p => evaluiereUnixSockets({ text: typeof p.text === 'string' ? p.text : undefined, debugSocketNachgewiesen, buildType }));
  const fund = einzeln.find(b => b.status === 'nicht bestanden');
  if (fund) return fund;
  if (einzeln.length && unguenstigster(einzeln).status !== 'bestanden') return unguenstigster(einzeln);
  if (startBelegt !== true) return befund('ungültig', 'Start und Formular der Release-Kopie sind nicht für einen durchgehend laufenden Prozess belegt; die Socketliste sagt dann nichts aus.');
  const mangel = probenMangel(proben, kennung, anzahl);
  if (mangel) return befund('ungültig', mangel);
  return befund('bestanden', 'Kein Devtools-Socket in /proc/net/unix, in jeder Probe.', { buildType });
}

export async function geraeteDaten(ctx) {
  const lies = name => ctx.shell(`getprop ${name}`);
  const geraet = {
    fingerprint: await lies('ro.build.fingerprint'), buildType: await lies('ro.build.type'), api: await lies('ro.build.version.sdk'),
    android: await lies('ro.build.version.release'), hersteller: await lies('ro.product.manufacturer'), modell: await lies('ro.product.model'),
    oberflaeche: await lies('ro.build.version.oneui'),
    qemu: [await lies('ro.kernel.qemu'), await lies('ro.boot.qemu')].includes('1') ? '1' : '', webview: await ctx.shell('dumpsys webviewupdate'), id: await ctx.shell('id'),
  };
  geraet.webviewVersion = /Current WebView package \(name, version\): \([^,]+, (\d+(?:\.\d+)*)\)/.exec(geraet.webview)?.[1] ?? null;
  ctx.save('geraet.json', geraet);
  if (!geraet.fingerprint || !buildTypLesbar(geraet.buildType) || !/^\d+$/.test(geraet.api) || !geraet.webviewVersion) {
    throw new Error('Gerätefingerabdruck, Build-Typ, API oder WebView-Version nicht vollständig lesbar.');
  }
  return geraet;
}

export async function lauf(optionen, { run = prozess, sleep = pause, java, debugKey = join(homedir(), '.android/debug.keystore'), holen = holeDevtoolsVersion, jetzt = Date.now } = {}) {
  if (process.platform !== 'win32') throw new Error('Der Gerätelauf ist für das eingerichtete Windows-Testsystem vorgesehen.');
  if (existsSync(optionen.ausgabe) && readdirSync(optionen.ausgabe).length) throw new Error('Ausgabeordner ist nicht leer; bitte einen neuen Ordner wählen.');
  mkdirSync(optionen.ausgabe, { recursive: true });
  const save = schreiber(optionen.ausgabe);
  const tmp = join(optionen.ausgabe, 'tmp'); mkdirSync(tmp, { recursive: true });
  const sdk = join(process.env.LOCALAPPDATA, 'fristenrechner/android-sdk');
  const env = { ...process.env, TEMP: tmp, TMP: tmp, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  const adbExe = join(sdk, 'platform-tools/adb.exe');
  const daten = { schema: 1, art: 'gerät', beginn: new Date().toISOString(), auswahl: optionen, node: process.version, befund: [], installationen: [], aufraeumen: [], grenzen: [
    'Der Lauf prüft Installation, Start, Paketkennzeichen und das Debugging der WebView (Socketliste und Verbindungsversuch). Netz, Navigation, Sicherung und Darstellung prüft der Emulatorlauf.',
    'Die Proben sind Stichproben zu drei Zeitpunkten. Zwischen den Zeitpunkten ist der Prozess über Nummer und Startzeit als derselbe belegt, sein Verhalten dazwischen nicht.',
    'Die Socketliste erfasst alle Apps des Geräts. Ein Devtools-Socket der WebView einer anderen App führt ebenfalls zu „nicht bestanden“ und ist über die aufgezeichneten Prozessnummern zu klären.',
    'Das Bild g-start.png ist ein ergänzender Rohbeleg und von Hand zu sichten.',
    'Die Release-Datei ist für diesen Lauf mit dem Debug-Schlüssel der Android-Werkzeuge signiert. Diese Signatur dient keinem Vertrieb.',
    'Bedienung mit TalkBack und die Dateiabläufe sind nicht Teil dieses Laufs.',
  ] };
  // eigen: Der Lauf hat eine Installation begonnen, nachdem das Paket nachweislich fehlte, und sie noch nicht
  // wieder entfernt. fremdVorhanden: Das Paket war da, ohne dass der Lauf es installiert hat; es bleibt unberührt.
  let befehlNummer = 0, pullNummer = 0, verbunden = false, eigen = false, installOffen = false, eigeneDatei = null, fremdVorhanden = false, releaseInstalliert = false, ansichtBenutzt = false, abbruch = false, cleaning = false;
  const forwards = new Set();
  const controller = new AbortController();
  const signal = () => { abbruch = true; controller.abort(); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  const ctx = { ...optionen, wurzel, app: APP, sdk, env, ausgabe: optionen.ausgabe, save, debugKey,
    log(message) { const z = `${new Date().toISOString()} ${message}`; console.log(z); appendFileSync(join(optionen.ausgabe, 'lauf.log'), `${z}\n`); },
    async sleep(ms) { for (let rest = ms; rest > 0; rest -= 1000) { if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.'); await sleep(Math.min(rest, 1000)); } },
    befund(id, wert) { daten.befund.push({ id, ...wert }); ctx.log(`${id}: ${wert.status} – ${wert.grund}`); save('ergebnis.json', daten); },
    async command(exe, args, name, opts = {}) {
      if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.');
      const r = await run(exe, args, { env, signal: cleaning ? undefined : controller.signal, ...opts });
      save(`${name}.txt`, `${r.out}\n${r.err}`);
      if (r.code !== 0) throw new Error(`${name}: Prozess fehlgeschlagen (${r.code}). Rohbeleg: ${name}.txt`);
      return r;
    },
    async adb(args, opt = {}) {
      if (abbruch && !cleaning) throw new Error('Lauf unterbrochen.');
      const r = await run(adbExe, ['-s', optionen.seriennummer, ...args], { env, signal: cleaning ? undefined : controller.signal, ...opt });
      if (!opt.binary) appendFileSync(join(optionen.ausgabe, 'adb.jsonl'), JSON.stringify({ nr: ++befehlNummer, zeit: new Date().toISOString(), args, ...r }) + '\n');
      return r;
    },
    async shell(command, opt = {}) {
      const r = await ctx.adb(['shell', command], opt);
      if (r.code !== 0) throw new Error(`ADB-Shell fehlgeschlagen (${r.code}): ${command}: ${r.err}`);
      return r.out.replaceAll('\r\n', '\n').trim();
    },
    async installiert() { return (await ctx.shell(`pm list packages ${APP}`)).split('\n').includes(`package:${APP}`); },
    // Installiert nur Dateien des eigenen Pakets und ersetzt nichts. Ein Paket, das schon da ist, bleibt unberührt.
    async install(apk, name) {
      const id = (await ctx.command(ctx.aapt2, ['dump', 'packagename', apk], `${name}-paketname`)).out.trim();
      if (id !== APP) throw new Error(`Die Datei für ${name} gehört zum Paket „${id}“, erwartet ist ${APP}. Nichts installiert.`);
      if (await ctx.installiert()) { fremdVorhanden = true; throw new Error(`Das Paket ${APP} ist vor der Installation schon vorhanden. Nichts installiert; das vorhandene Paket bleibt unberührt.`); }
      // Ab hier gehört ein vorhandenes Paket zu diesem Lauf, auch wenn der Aufruf unterbrochen wird:
      // Es fehlte eben noch, und installiert wird ohne Ersetzen. Das Aufräumen klärt den Zustand und
      // deinstalliert nur, wenn die installierte Datei bytegleich zu dieser Eingabe ist.
      if (abbruch) throw new Error('Lauf unterbrochen.');
      eigen = true; installOffen = true; eigeneDatei = apk;
      const r = await ctx.adb(['install', apk], { timeoutMs: 180000 });
      const ausgabe = `${r.out}${r.err}`;
      // Nur eine Erfolgsmeldung oder eine benannte Ablehnung des Paketmanagers ist ein Ergebnis. Alles andere
      // (kein Rückgabewert, abgerissene Verbindung) lässt offen, ob die Installation auf dem Gerät noch zu Ende läuft.
      installOffen = !(r.code === 0 && /^Success\s*$/m.test(r.out)) && !/Failure \[INSTALL_FAILED_[A-Z_]+/.test(ausgabe);
      if (r.code !== 0 && /INSTALL_FAILED_ALREADY_EXISTS/.test(ausgabe)) { eigen = false; fremdVorhanden = true; }
      if (r.code !== 0 || !/^Success\s*$/m.test(r.out)) throw new Error(`Installation fehlgeschlagen: ${r.out} ${r.err}`.trim());
      const installiert = await ctx.installiertePruefsumme();
      const eingang = sha256(apk);
      daten.installationen.push({ name, eingang, installiert });
      save('installationen.json', daten.installationen);
      if (installiert !== eingang) throw new Error('Installierte APK weicht von der Eingabedatei ab.');
    },
    // SHA-256 der installierten APK, oder null, wenn sie sich nicht lesen lässt.
    async installiertePruefsumme() {
      const m = /^package:(\/[^\r\n]+\.apk)$/.exec(await ctx.shell(`pm path ${APP}`));
      if (!m) return null;
      const ziel = join(tmp, `installiert-${++pullNummer}.apk`);
      const pull = await ctx.adb(['pull', m[1], ziel]);
      if (pull.code !== 0 || !existsSync(ziel)) return null;
      const summe = sha256(ziel);
      rmSync(ziel);
      return summe;
    },
    // Nur für Installationen dieses Laufs: Deinstalliert wird ausschließlich ein Paket, dessen Datei bytegleich zur
    // eigenen Eingabe ist. Mit der bestätigten Deinstallation ist die Berechtigung verbraucht, noch vor der Nachkontrolle.
    async uninstall() {
      if (!eigen) throw new Error('Deinstallation ohne eigene Installation.');
      if (await ctx.installiert()) {
        const installiert = await ctx.installiertePruefsumme();
        if (installiert === null || installiert !== sha256(eigeneDatei)) {
          eigen = false; fremdVorhanden = true;
          throw new Error(`Das installierte Paket ${APP} ist nicht die eigene Datei (${installiert ? 'andere Prüfsumme' : 'nicht lesbar'}). Es gilt als fremd und bleibt unberührt.`);
        }
        const r = await ctx.adb(['uninstall', APP]);
        if (r.code !== 0 || !/^Success\s*$/m.test(r.out)) throw new Error('Deinstallation fehlgeschlagen.');
        eigen = false;
        if (await ctx.installiert()) { fremdVorhanden = true; throw new Error('Das Paket ist nach der bestätigten Deinstallation vorhanden; es gilt als fremd und bleibt unberührt.'); }
      }
      eigen = false;
    },
    async start() {
      const out = await ctx.shell(`am start -W -n ${ACTIVITY}`);
      if (!/^Status: ok$/m.test(out)) throw new Error(`Activity-Start nicht bestätigt: ${out}`);
      await ctx.sleep(5000);
    },
    async uiBaum(name, opt = {}) { ansichtBenutzt = true; return leseAnsichtsbaum(ctx, name, opt); },
    // Leer, wenn der Prozess der App nicht läuft.
    async pid() {
      const r = await ctx.adb(['shell', `pidof ${APP}`]);
      const pid = r.out.trim();
      return r.code === 0 && /^\d+$/.test(pid) ? pid : '';
    },
    // Prozess (Nummer und Startzeit) und oberste Activity zu einem Zeitpunkt, mit Rohbelegen.
    async zustand(name) {
      const pid = await ctx.pid();
      const activity = await ctx.adb(['shell', 'dumpsys activity activities']);
      save(`${name}-activity.txt`, activity.out);
      const stat = pid === '' ? null : await ctx.adb(['shell', `cat /proc/${pid}/stat`]);
      const start = stat && stat.code === 0 ? prozessStart(stat.out.trim(), pid) : null;
      const stand = { zeit: new Date().toISOString(), pid, start, kennung: start === null ? '' : `${pid}@${start}`, vordergrund: activity.code === 0 && evaluiereActivity(activity.out, APP).status === 'bestanden' };
      save(`${name}.json`, { ...stand, stat: stat ? { code: stat.code, out: stat.out.trim(), err: stat.err } : null });
      return { ...stand, activity: activity.code === 0 ? activity.out : '' };
    },
    // Leitet einen freien Port des Rechners auf einen abstrakten Socket des Geräts und fragt die Version ab.
    // Die Weiterleitung lässt sich auch ohne Socket anlegen; erst der Abruf zeigt, ob jemand antwortet.
    async devtools(socket, name) {
      const f = await ctx.adb(['forward', 'tcp:0', `localabstract:${socket}`]);
      const port = f.out.trim();
      if (f.code !== 0 || !/^\d+$/.test(port)) throw new Error('ADB-Weiterleitung nicht bestätigt.');
      forwards.add(port);
      const liste = await ctx.adb(['forward', '--list']);
      const weiterleitungBelegt = liste.code === 0 && liste.out.split(/\r?\n/).some(z => z.trim() === `${optionen.seriennummer} tcp:${port} localabstract:${socket}`);
      const abruf = { ...await holen(port), weiterleitungBelegt };
      save(`${name}.json`, { zeit: new Date().toISOString(), socket, port, abruf });
      // Eine erhaltene Antwort darf nicht verloren gehen, wenn der Lauf genau jetzt unterbrochen wird:
      // Das Entfernen übernimmt sonst das Aufräumen.
      let entfernt = false;
      try { entfernt = (await ctx.adb(['forward', '--remove', `tcp:${port}`])).code === 0; }
      catch (e) { if (!abbruch) throw e; }
      if (entfernt) forwards.delete(port);
      save(`${name}.json`, { zeit: new Date().toISOString(), socket, port, abruf, weiterleitungEntfernt: entfernt });
      return abruf;
    },
    // Auf einem unveränderten Gerät kann das Lesen scheitern; das ist dann kein Abbruch, sondern ein ungültiger Befund.
    async unix(name) {
      const r = await ctx.adb(['shell', 'cat /proc/net/unix']);
      save(`${name}.txt`, r.out);
      save(`${name}.meta.json`, { zeit: new Date().toISOString(), code: r.code, err: r.err });
      return r.code === 0 ? r.out.replaceAll('\r\n', '\n') : null;
    },
  };
  const cleanup = [
    ['App deinstallieren', async () => {
      if (!verbunden) return;
      if (installOffen) {
        // Ein Installationsaufruf ohne Ergebnis kann auf dem Gerät noch zu Ende laufen. Bis zu 60 Sekunden abwarten.
        const ende = jetzt() + 60000;
        let da = await ctx.installiert();
        while (!da && jetzt() < ende) { await ctx.sleep(2000); da = await ctx.installiert(); }
        if (!da) throw new Error(`Ein Installationsversuch blieb ohne Ergebnis, und das Paket ${APP} ist innerhalb von 60 Sekunden nicht erschienen. Bitte später prüfen, ob es installiert wurde.`);
        installOffen = false;
      }
      if (optionen.appBehalten && releaseInstalliert) { ctx.log('Die App bleibt auf Wunsch installiert: Release-Build, mit dem Debug-Schlüssel signiert.'); return; }
      if (eigen) await ctx.uninstall();
      // Ein Paket, das sich der Lauf nicht zurechnen kann, entfernt er nicht. Er meldet es aber.
      if (!fremdVorhanden && await ctx.installiert()) throw new Error(`Das Paket ${APP} ist nach dem Lauf vorhanden, ohne dass der Lauf es sich zurechnen kann. Bitte von Hand prüfen.`);
    }],
    ['Ansichtsdatei entfernen', async () => { if (verbunden && ansichtBenutzt) await ctx.shell(`rm -f ${ANSICHT_REMOTE}`); }],
    ['ADB-Weiterleitungen entfernen', async () => {
      const offen = [];
      for (const port of forwards) { const r = await ctx.adb(['forward', '--remove', `tcp:${port}`]); if (r.code !== 0) offen.push(port); }
      if (offen.length) throw new Error(`Weiterleitungen nicht entfernt: ${offen.join(', ')}`);
    }],
  ];
  try {
    await mitAufraeumen(async () => {
      try {
        dateiNoetig(adbExe); dateiNoetig(optionen.debug); dateiNoetig(optionen.release);
        daten.apkEingang = { debug: sha256(optionen.debug), release: sha256(optionen.release) };
        const jdk = java ? { pfad: java } : findeJdk();
        if (!jdk.pfad) throw new Error('Das eingerichtete JDK 21 fehlt.');
        ctx.java = java ?? join(jdk.pfad, 'bin/java.exe');
        ctx.apksigner = join(sdk, 'build-tools/35.0.0/lib/apksigner.jar');
        ctx.aapt2 = join(sdk, 'build-tools/35.0.0/aapt2.exe');
        const devices = await run(adbExe, ['devices'], { env });
        save('geraete-vorher.txt', devices.out);
        if (devices.code !== 0) throw new Error('adb devices ist fehlgeschlagen.');
        const zustand = geraetZustand(devices.out, optionen.seriennummer);
        if (zustand === 'unauthorized') throw new Error('Das Gerät hat diesen Rechner noch nicht zugelassen. Am Gerät die Abfrage zum USB-Debugging bestätigen.');
        if (zustand !== 'device') throw new Error(`Das Gerät ${optionen.seriennummer} ist nicht angeschlossen oder nicht bereit (${zustand ?? 'nicht gefunden'}).`);
        verbunden = true;
        // Bis zur Klärung gilt ein vorhandenes Paket als fremd; so meldet das Aufräumen nach einem frühen Abbruch nichts Falsches.
        fremdVorhanden = true;
        const geraet = daten.geraet = ctx.geraet = await geraeteDaten(ctx);
        if (/uid=0\(root\)/.test(geraet.id)) throw new Error('Die ADB-Shell läuft als root. Der Gerätelauf ist für ein unverändertes Gerät vorgesehen.');
        if (geraet.qemu === '1') throw new Error('Das Gerät ist ein Emulator. Dafür ist scripts/emulator-lauf.mjs vorgesehen.');
        if (Number(geraet.api) < 30) throw new Error(`Das Gerät hat API ${geraet.api}. Die App verlangt mindestens API 30.`);
        if (await ctx.installiert()) throw new Error(`Das Paket ${APP} ist schon installiert. Lauf abgebrochen, vorhandene Daten bleiben erhalten.`);
        fremdVorhanden = false;
        ctx.befund('G-Gerät', befund('bestanden', `${geraet.hersteller} ${geraet.modell}, Android ${geraet.android} (API ${geraet.api}), Build-Typ ${geraet.buildType}, WebView ${geraet.webviewVersion}.`));
        await ctx.unix('g-unix-vorher');

        // Der Debug-Build ist die Gegenprobe: Auf diesem Gerät müssen Kennzeichen, Socket und Verbindung erkennbar sein.
        ctx.log('Gegenprobe mit dem Debug-Build.');
        await ctx.install(optionen.debug, 'debug'); await ctx.start();
        let debugSocketNachgewiesen = false, lesbar = true, gegenprobeErreichbar = false;
        for (let i = 0; i < 20 && ((lesbar && !debugSocketNachgewiesen) || !gegenprobeErreichbar); i++) {
          if (i) await ctx.sleep(1000);
          const pid = await ctx.pid();
          if (lesbar && !debugSocketNachgewiesen) {
            const text = await ctx.unix('g-debug-unix');
            lesbar = text !== null;
            debugSocketNachgewiesen = lesbar && pid !== '' && new RegExp(`@webview_devtools_remote_${pid}\\b`).test(text);
          }
          if (!gegenprobeErreichbar && pid !== '') {
            const abruf = await ctx.devtools(`webview_devtools_remote_${pid}`, 'g-debug-devtools');
            // Die Auskunft muss von der eigenen App stammen, soweit sie das Paket nennt.
            gegenprobeErreichbar = abruf.art === 'antwort' && abruf.weiterleitungBelegt && (abruf.paket === null || abruf.paket === APP);
          }
        }
        const debugKontrolle = await ctx.devtools(KONTROLLSOCKET, 'g-debug-kontrolle');
        const gegenprobeWirksam = gegenprobeErreichbar && ohneSocket(debugKontrolle);
        ctx.befund('G-Devtools-Gegenprobe', gegenprobeWirksam
          ? befund('bestanden', 'Im Debug-Build antworten die Devtools der WebView, und der Abruf am Kontrollsocket endet wie ohne Socket; die Verbindungsprüfung wirkt auf diesem Gerät.')
          : befund('ungültig', 'Im Debug-Build kam keine eindeutige Verbindung zu den Devtools zustande, oder der Kontrollabruf endete nicht wie ohne Socket; die Verbindungsprüfung ist auf diesem Gerät nicht belegt.'));
        ctx.befund('G-Socket-Gegenprobe', debugSocketNachgewiesen
          ? befund('bestanden', 'Im Debug-Build ist der Devtools-Socket der WebView sichtbar; die Erkennung wirkt auf diesem Gerät.')
          : befund('ungültig', lesbar ? 'Im Debug-Build wurde kein Devtools-Socket gefunden; die Erkennung ist auf diesem Gerät nicht belegt.' : '/proc/net/unix ist auf diesem Gerät nicht lesbar; die Socketprüfung ist hier nicht möglich.'));
        const debugPackage = await ctx.shell(`dumpsys package ${APP}`);
        save('g-debug-package.txt', debugPackage);
        const flagsGegenWirksam = evaluiereReleaseFlags({ dumpsys: debugPackage, paket: APP }).status === 'nicht bestanden' && /\bDEBUGGABLE\b/.test(debugPackage);
        ctx.befund('G-Flags-Gegenprobe', flagsGegenWirksam
          ? befund('bestanden', 'Debug-Build wird als Gegenprobe zurückgewiesen.') : befund('ungültig', 'Debug-Gegenprobe für Paketkennzeichen ohne Wirkung.'));
        await ctx.uninstall();

        ctx.log('Release-Build.');
        const apk = await signiereRelease(ctx, optionen.release);
        await ctx.install(apk, 'release'); releaseInstalliert = true;
        await ctx.start();
        // Der Beleg von Start und Formular gilt für einen Prozess: Nummer und Startzeit davor und danach.
        const startVor = await ctx.zustand('g-start-vor');
        const obersteActivity = evaluiereActivity(startVor.activity, APP);
        ctx.befund('G-Activity', obersteActivity);
        const bild = await ctx.adb(['exec-out', 'screencap', '-p'], { binary: true });
        if (bild.code === 0 && Buffer.isBuffer(bild.out) && bild.out.subarray(0, 8).equals(PNG)) save('g-start.png', bild.out);
        else ctx.log('Bildschirmfoto nicht lesbar; der Lauf geht ohne Bild weiter.');
        // Die WebView gibt ihren Inhalt erst an den Ansichtsbaum, nachdem er einmal angefragt wurde:
        // Der erste Abzug zeigt dann nur den leeren WebView-Knoten. Deshalb bis zu drei Abzüge.
        let start = evaluiereReleaseStart({ xml: '' });
        for (let versuch = 0; versuch < 3 && start.status === 'ungültig'; versuch++) {
          if (versuch) await ctx.sleep(2000);
          let xml = '';
          try { xml = await ctx.uiBaum(`g-start-${versuch}`, { timeoutMs: 60000 }); } catch (e) { if (abbruch) throw e; ctx.log(`Ansichtsbaum: ${e.message}`); }
          start = evaluiereReleaseStart({ xml });
          if (start.status === 'bestanden' && !formularAusEigenemPaket(xml)) start = befund('ungültig', 'Die Formulartexte in der nativen Ansicht stammen nicht aus dem eigenen Paket.');
        }
        const startNach = await ctx.zustand('g-start-nach');
        ctx.befund('G-Start', start);
        const kennung = startVor.kennung;
        const startBelegt = obersteActivity.status === 'bestanden' && start.status === 'bestanden' && kennung !== '' && startNach.kennung === kennung && startNach.vordergrund;
        const releasePackage = await ctx.shell(`dumpsys package ${APP}`);
        save('g-package.txt', releasePackage);
        const flags = evaluiereReleaseFlags({ dumpsys: releasePackage, paket: APP });
        // Ein gefundenes Kennzeichen bleibt ein Fehler; „bestanden“ verlangt die wirksame Gegenprobe.
        ctx.befund('G-Flags', flags.status === 'bestanden' && !flagsGegenWirksam ? befund('ungültig', 'Kennzeichen unauffällig, aber die Gegenprobe am Debug-Build war ohne Wirkung.') : flags);
        // Je Probe: Zustand davor, Socketliste, Abruf am Prozess der App, Abruf am Kontrollsocket, Zustand danach.
        // Scheitert ein Schritt, bleiben die schon erhobenen Belege erhalten und werden bewertet.
        const proben = [];
        let messfehler = null;
        for (let i = 0; i < PROBEN && !messfehler; i++) {
          const p = {};
          proben.push(p);
          try {
            if (i) await ctx.sleep(5000);
            const vor = await ctx.zustand(`g-probe-${i}-vor`);
            Object.assign(p, { pidVor: vor.pid, kennungVor: vor.kennung, vordergrundVor: vor.vordergrund });
            p.text = await ctx.unix(`g-unix-${i}`);
            p.abruf = vor.pid === '' ? null : await ctx.devtools(`webview_devtools_remote_${vor.pid}`, `g-devtools-${i}`);
            p.kontrolle = await ctx.devtools(KONTROLLSOCKET, `g-kontrolle-${i}`);
            const nach = await ctx.zustand(`g-probe-${i}-nach`);
            Object.assign(p, { pidNach: nach.pid, kennungNach: nach.kennung, vordergrundNach: nach.vordergrund });
          } catch (e) { p.fehler = e.message; messfehler = e; }
        }
        save('g-proben.json', { kennung, startBelegt, proben: proben.map(({ text, ...rest }) => ({ ...rest, socketlisteLesbar: typeof text === 'string' })) });
        ctx.befund('G-Socket', evaluiereSocketProben({ debugSocketNachgewiesen, startBelegt, kennung, proben, buildType: geraet.buildType }));
        ctx.befund('G-Devtools', evaluiereDevtoolsVerbindung({ gegenprobeErreichbar: gegenprobeWirksam, debugKontrolle, startBelegt, kennung, proben: proben.map(({ text, ...rest }) => rest), buildType: geraet.buildType }));
        if (messfehler) throw messfehler;
        const pid = await ctx.pid();
        if (pid !== '') { const r = await ctx.adb(['logcat', '-d', '-v', 'time', `--pid=${pid}`]); save('g-logcat.txt', `${r.out}\n${r.err}`); }
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
    daten.appInstalliert = optionen.appBehalten && releaseInstalliert;
    save('ergebnis.json', daten);
    save('zusammenfassung.txt', [`Gerätelauf, Ergebnis: ${daten.ergebnis}; Rückgabewert ${daten.code}`, `Einzelbefunde: ${Object.entries(daten.anzahl).map(([status, n]) => `${n} ${status}`).join(', ')}`, ...daten.befund.map(b => `${b.id}: ${b.status} – ${b.grund}`), '', ...daten.grenzen, '', ...daten.aufraeumen.map(a => `Aufräumen ${a.name}: ${a.status}${a.fehler ? ` – ${a.fehler}` : ''}`), ...(daten.appInstalliert ? ['', 'Die App ist auf dem Gerät geblieben (--app-behalten).'] : [])].join('\n') + '\n');
  }
  return daten.code;
}

export async function main(argv = process.argv.slice(2)) {
  let optionen;
  try { optionen = argumente(argv, wurzel, repositories()); }
  catch (e) { console.error(`Argumentfehler: ${e.message}\nAufruf: node scripts/geraet-lauf.mjs --seriennummer <Seriennummer aus adb devices> --ausgabe <Ordner> [--apk-debug <Datei>] [--apk-release <Datei>] [--app-behalten]`); return 64; }
  try { return await lauf(optionen); }
  catch (e) { console.error(`Messung ungültig: ${e.message}`); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
