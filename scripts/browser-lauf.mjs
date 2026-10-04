#!/usr/bin/env node
// Browserprüfungen getrennt von npm test. Keine Installation, kein fremdes Netz.
// Aufruf: node scripts/browser-lauf.mjs --phase alle-v6a --browser beide --ausgabe scratchpad/browser-1
// Rückgabewerte: 0 bestanden, 1 nicht bestanden, 2 ungültig, 64 falscher Aufruf.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { closeSync, existsSync, mkdirSync, openSync, readSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, ausgabePruefen, echterPfad, innen, pause, prozess } from './emulator/rahmen.mjs';
import { argumente, anfrageBewerten, auswerten, neuesProtokoll, pruefung } from './browser/auswertung.mjs';
import { bauen } from './browser/bauen.mjs';
import { pruefeWebadapter } from './browser/webadapter.mjs';
import { beendeBrowserProzess, beobachteBrowserProzess, browserProzessIdentitaet } from './browser/prozessende.mjs';
import { BrowserCdp, seitenNetzStarten } from './browser/netz-cdp.mjs';
import { netlogLesen, netzNachweis } from './browser/netz-auswertung.mjs';

export const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export { argumente, anfrageBewerten, auswerten, neuesProtokoll } from './browser/auswertung.mjs';

function repositories() {
  const repos = [wurzel], git = join(wurzel, '.git');
  if (existsSync(git) && statSync(git).isFile()) {
    const m = /^gitdir: (.+)/.exec(readFileSync(git, 'utf8'));
    if (m) {
      const dir = resolve(wurzel, m[1].trim());
      repos.push(dirname(resolve(dir, readFileSync(join(dir, 'commondir'), 'utf8').trim())));
    }
  }
  return repos;
}

export function ausgabeVorbereiten(pfad, repos = repositories()) {
  const ausgabe = ausgabePruefen(pfad, repos);
  if (existsSync(ausgabe) && (!statSync(ausgabe).isDirectory() || readdirSync(ausgabe).length)) throw new Error('Der Ausgabeordner muss neu oder leer sein.');
  mkdirSync(ausgabe, { recursive: true });
  return ausgabe;
}

export function browserKandidaten(browser, plattform = process.platform, env = process.env) {
  if (plattform === 'win32') {
    const teile = browser === 'edge' ? ['Microsoft', 'Edge', 'Application', 'msedge.exe'] : ['Google', 'Chrome', 'Application', 'chrome.exe'];
    return [...new Set([env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean).map(base => join(base, ...teile)))];
  }
  if (plattform === 'linux') return browser === 'edge'
    ? ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  return [];
}

export function browserArgumente(profil, netlog, proxyPort) {
  // Primärquellverweise (offline nicht neu abgerufen):
  // [C] https://chromium.googlesource.com/chromium/src/+/main/chrome/common/chrome_switches.cc
  // [D] https://chromium.googlesource.com/chromium/src/+/main/content/public/common/content_switches.cc
  // [E] https://chromium.googlesource.com/chromium/src/+/main/extensions/common/switches.cc
  // [N] https://chromium.googlesource.com/chromium/src/+/main/components/network_session_configurator/common/network_switches.cc
  // [P] https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md
  // Die Namen sind zusätzlich in den lokalen Browser-154-DLLs nachgewiesen
  // (scratchpad/v6a-r2-schalterbeleg.json). Das belegt keine vollständige Wirkung
  // in Edge: nur NetLog/CDP entscheiden über den Netzbefund. Keine geratenen
  // Edge-Anmelde-, Copilot- oder Rewards-Features und keine unbelegten Altflags.
  return [
    '--headless=new', // [C] Reproduzierbare Steuerung ohne sichtbare Fenster.
    '--remote-debugging-port=0', // [D] Freier CDP-Port; Chromium bindet standardmäßig Loopback.
    `--user-data-dir=${profil}`, // [C] Neues eigenes Profil, keine Übernahme des Nutzerprofils.
    '--no-first-run', // [C] Erststartdialog/-aufgaben auslassen.
    '--no-default-browser-check', // [C] Keine Prüfung auf Standardbrowserstellung.
    '--disable-background-networking', // [C] Hintergrund-Netzdienste im Test vermindern.
    // https://chromium.googlesource.com/chromium/src/+/main/components/component_updater/component_updater_switches.cc
    '--disable-component-update', // Keine automatischen Komponentenaktualisierungen.
    // https://chromium.googlesource.com/chromium/src/+/main/components/sync/base/command_line_switches.cc
    '--disable-sync', // Synchronisationsdienst nicht starten.
    '--disable-extensions', // [E] Keine regulären Erweiterungen aktivieren.
    '--disable-component-extensions-with-background-pages', // [E] Zusätzlich Komponentenerweiterungen mit Hintergrundseiten deaktivieren.
    '--disable-default-apps', // [C] Keine Standard-Apps im neuen Profil installieren.
    // https://chromium.googlesource.com/chromium/src/+/main/components/domain_reliability/switches.cc
    '--disable-domain-reliability', // Keine Domain-Reliability-Meldungen.
    '--disable-breakpad', // [C] Crash-Berichterstattung für diesen Testprozess deaktivieren.
    '--metrics-recording-only', // [C] Metriken allenfalls lokal aufzeichnen, nicht berichten.
    // Feature-Definitionen: chrome/browser/media/router/media_router_feature.cc;
    // components/optimization_guide/core/optimization_guide_features.cc;
    // components/autofill/core/common/autofill_features.cc (je im Chromium-Quellbaum).
    '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication', // Discovery, Optimierungshinweise und Autofill-Serververkehr vermindern.
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', // [N] Fremde DNS-Auflösung sperren.
    `--proxy-server=http://127.0.0.1:${proxyPort}`, // [P] Ausschließlich eigener verwerfender Proxy.
    '--proxy-bypass-list=<-loopback>;127.0.0.1', // [P] Implizite Loopbackausnahmen entfernen, nur 127.0.0.1 freigeben.
    '--disable-quic', // [N] Keine QUIC-Verbindungen am HTTP-Proxy vorbei.
    '--window-size=1280,900', // [C] Ausgangsgröße; BOX-320 setzt und belegt eigene CDP-Metriken.
    `--log-net-log=${netlog}`, // [N] Transportbelege auch für Browser-Hintergrunddienste sichern.
    'about:blank', // Vor Überwachung noch keine Prüfseite laden.
  ];
}

export async function lokalerServer(dist) {
  const anfragen = [];
  const server = createServer((req, res) => {
    anfragen.push({ zeit: new Date().toISOString(), methode: req.method, pfad: req.url });
    const beenden = code => { res.writeHead(code); res.end(); };
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '') || !['GET', 'HEAD'].includes(req.method)) return beenden(403);
      let pfad = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (pfad === '/favicon.ico') return beenden(204);
      if (pfad.includes('\\') || pfad.includes('\0')) return beenden(403);
      if (pfad.endsWith('/')) pfad += 'index.html';
      let datei = resolve(dist, `.${pfad}`);
      if (!innen(dist, datei) || !innen(echterPfad(dist), echterPfad(datei))) return beenden(403);
      if (existsSync(datei) && statSync(datei).isDirectory()) datei = join(datei, 'index.html');
      if (!innen(echterPfad(dist), echterPfad(datei))) return beenden(403);
      if (!existsSync(datei) || !statSync(datei).isFile()) return beenden(404);
      const typ = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' }[extname(datei)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(datei));
    } catch { beenden(400); }
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  return { basisUrl: `http://127.0.0.1:${server.address().port}`, anfragen,
    close: async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); } };
}

// Der reservierte Proxy-Port verwirft jede Verbindung, ohne irgendein Ziel zu
// kontaktieren. So kann dort kein anderer lokaler Dienst als Proxy einspringen.
async function toterProxy() {
  const anfragen = [];
  const server = createNetServer(socket => {
    anfragen.push({ zeit: new Date().toISOString() }); socket.destroy();
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  return { port: server.address().port, anfragen, close: () => new Promise(r => server.close(r)) };
}

async function warten(fn, beschreibung, ms = 15000) {
  const beginn = Date.now();
  while (Date.now() - beginn < ms) { const r = await fn(); if (r) return r; await pause(50); }
  throw new Error(`Zeitüberschreitung: ${beschreibung}`);
}

async function laufPhase({ browser, programm, phase, ausgabe, basisUrl, commit, arbeitsstand, htmlHash, signal, diagnose = false }) {
  mkdirSync(ausgabe);
  const protokoll = neuesProtokoll({ commit, arbeitsstand, phase, browser });
  protokoll.htmlHash = htmlHash;
  protokoll.grenzen.push('Dateiauswahl und Downloads werden über CDP gesteuert; Fenster und Screenreader benötigen eine Handprüfung.');
  const pruefe = (id, text, fn) => pruefung(protokoll, id, text, fn);
  const netlogDatei = join(ausgabe, 'netz.json');
  let child, browserCdp, cdp, proxy, netzMonitor, beobachtung, beendet = false, startFehler;
  let abbruch;
  try {
    proxy = await toterProxy();
    const profil = join(ausgabe, 'profil');
    mkdirSync(profil);
    const args = browserArgumente(profil, netlogDatei, proxy.port);
    protokoll.start = { argumente: args, programm };
    child = spawn(programm, args, { cwd: wurzel, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    protokoll.start.prozessId = child.pid;
    child.on('error', e => { startFehler = e; });
    child.on('exit', () => { beendet = true; });
    beobachtung = beobachteBrowserProzess(child, { diagnose });
    abbruch = () => { cdp?.close(); }; // Browser.close und Prozessnachweis bleiben im finally möglich.
    signal?.addEventListener('abort', abbruch, { once: true });
    const portDatei = join(profil, 'DevToolsActivePort');
    const zeilen = await warten(() => {
      if (startFehler || beendet || signal?.aborted) throw startFehler ?? new Error('Browser vorzeitig beendet.');
      if (!existsSync(portDatei)) return false;
      let z;
      try { z = readFileSync(portDatei, 'utf8').trim().split(/\r?\n/); }
      catch (e) {
        // Windows kann die Datei während des ersten Schreibens kurz sperren.
        if (['EBUSY', 'EPERM', 'EACCES', 'ENOENT'].includes(e.code)) return false;
        throw e;
      }
      return /^\d+$/.test(z[0]) && z[1]?.startsWith('/devtools/browser/') ? z : false;
    }, 'Browserstart');
    browserCdp = await BrowserCdp.connect(`ws://127.0.0.1:${zeilen[0]}${zeilen[1]}`);
    protokoll.version = await browserCdp.send('Browser.getVersion');
    try {
      protokoll.prozessIdentitaet = browserProzessIdentitaet(child.pid, await browserCdp.send('SystemInfo.getProcessInfo', {}, 5000));
    } catch (e) {
      protokoll.prozessIdentitaet = { methode: 'SystemInfo.getProcessInfo', spawnPid: child.pid, bestaetigt: false, meldung: e.message };
    }
    if (!protokoll.prozessIdentitaet.bestaetigt) {
      // Keine Browserbefehle an eine nicht belegte Haupt-PID. Nur den eigenen
      // Spawn-Handle aufräumen, niemals die von CDP genannte abweichende PID.
      browserCdp.close(); browserCdp = null;
      throw new Error('Spawn-PID ist nicht als CDP-Browser-Hauptprozess bestätigt; siehe prozessIdentitaet.');
    }
    const targets = await (await fetch(`http://127.0.0.1:${zeilen[0]}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    const target = targets.find(t => t.type === 'page' && t.url === 'about:blank');
    if (!target?.webSocketDebuggerUrl) throw new Error('Leere Prüfseite im Browser fehlt.');
    // Die Adresse wird selbst aus dem bestätigten lokalen Port zusammengesetzt.
    const id = target.id;
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Ungültige CDP-Zielkennung.');
    protokoll.pruefTarget = { targetId: id, browserContextId: target.browserContextId ?? null };
    netzMonitor = await seitenNetzStarten(browserCdp, protokoll, id, basisUrl);
    protokoll.pruefTarget.browserContextId = protokoll.netzTargets.find(t => t.targetId === id)?.browserContextId ?? target.browserContextId ?? null;
    cdp = await Cdp.connect(`ws://127.0.0.1:${zeilen[0]}/devtools/page/${id}`);
    cdp.ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const p = m.params;
      if (['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(m.method)) protokoll.konsolenmeldungen.push({ zeit: new Date().toISOString(), methode: m.method, daten: p });
    });
    for (const domain of ['Page', 'Runtime', 'Log', 'DOM']) await cdp.send(`${domain}.enable`);
    await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const navigieren = async (pfad = '/') => {
      if (signal?.aborted) throw new Error('Lauf unterbrochen.');
      const url = new URL(pfad, basisUrl);
      if (url.origin !== basisUrl) throw new Error('Navigation außerhalb der Probeseite abgewiesen.');
      const start = cdp.events.length;
      const navigation = await cdp.send('Page.navigate', { url: url.href });
      if (navigation.errorText) throw new Error(`Navigation fehlgeschlagen: ${navigation.errorText}`);
      await warten(() => cdp.events.slice(start).some(e => e.method === 'Page.loadEventFired'), 'Seite laden');
      const vorhanden = await cdp.send('Runtime.evaluate', { expression: 'Boolean(document.querySelector("[data-fristenrechner]"))', returnByValue: true, userGesture: false });
      if (!vorhanden.result.value) throw new Error('Komponente fehlt in der gebauten Probeseite.');
      await pause(100);
    };
    // Neue Phasen ergänzen nur diese Zuordnung sowie PHASEN und ihre eigenen Module.
    const phasen = {
      vertrag: async () => {
        await navigieren('/vertrag.html');
        await pruefe('V-VERTRAG', 'Browser-Vertrag mit echten Exportfunktionen', async () => {
          const gruppen = await cdp.evaluate('browserVertrag.pruefeBedienung(document.querySelector("[data-fristenrechner]"))', 60000);
          if (!Array.isArray(gruppen) || gruppen.length !== 9) throw new Error('Die neun Vertragsgruppen sind nicht vollständig.');
          gruppen.forEach((beschreibung, i) => protokoll.ergebnisse.push({ id: `V${i + 1}`, beschreibung, status: 'bestanden' }));
          return { gruppen };
        });
      },
      webadapter: () => pruefeWebadapter({ cdp, browserCdp, basisUrl, ausgabe, protokoll, pruefung: pruefe, navigieren }),
    };
    await phasen[phase]();
    await netzMonitor.bereit();
    await pruefe('JS', 'Keine unbehandelte JavaScript-Ausnahme', () => {
      const fehler = protokoll.konsolenmeldungen.filter(m => m.methode === 'Runtime.exceptionThrown');
      if (fehler.length) throw new Error(`${fehler.length} unbehandelte JavaScript-Ausnahmen; siehe Konsolenprotokoll.`);
      return { ausnahmen: 0 };
    });
  } catch (e) {
    protokoll.ergebnisse.push({ id: 'LAUF', beschreibung: 'Vollständiger Phasenlauf', status: 'ungültig', meldung: e.message });
  } finally {
    signal?.removeEventListener('abort', abbruch);
    if (netzMonitor) {
      try { await netzMonitor.bereit(); }
      catch (e) { protokoll.ergebnisse.push({ id: 'NETZ-CDP', status: 'ungültig', meldung: e.message }); }
    }
    cdp?.close();
    const zustand = () => {
      // Nur den kurzen Dateischluss lesen, keine wiederholte NetLog-Auswertung.
      let netlog;
      try {
        const bytes = statSync(netlogDatei).size, fd = openSync(netlogDatei, 'r');
        const ende = Buffer.alloc(Math.min(bytes, 128));
        try { readSync(fd, ende, 0, ende.length, bytes - ende.length); }
        finally { closeSync(fd); }
        netlog = { bytes, dateischluss: /\]\s*}\s*$/.test(ende.toString('utf8')) };
      } catch (e) { netlog = { fehler: e.code ?? e.message }; }
      return { netlog, targets: protokoll.netzTargets?.map(t => ({ targetId: t.targetId, url: t.url, beendet: Boolean(t.beendet) })),
        websocket: browserCdp?.ws.readyState ?? null, pipes: beobachtung?.daten };
    };
    if (child?.pid) protokoll.ergebnisse.push(await beendeBrowserProzess({ browserCdp, child, beendet: () => beendet }, { diagnose, zustand }));
    // CDP bis zur Browser.close-Antwort, danach Transport lösen. NetLog bleibt
    // bis zum Prozessende Pflicht; seine Vollständigkeit wird unten geprüft.
    if (netzMonitor) {
      try { await netzMonitor.bereit(); }
      catch (e) {
        if (!protokoll.ergebnisse.some(r => r.id === 'NETZ-CDP')) protokoll.ergebnisse.push({ id: 'NETZ-CDP', status: 'ungültig', meldung: e.message });
      }
    }
    netzMonitor?.close();
    browserCdp?.close();
    // Nach einem Browserabsturz können geerbte Pipe-Handles den Node-Läufer
    // offen halten. Ein nicht bestätigtes Prozessende ist oben als Fehler erfasst.
    child?.stdout.destroy(); child?.stderr.destroy(); child?.unref();
    await proxy?.close();
    protokoll.proxyVerbindungen = proxy?.anfragen ?? [];
    protokoll.prozessBeobachtung = beobachtung?.daten ?? null;
    protokoll.downloadEreignisse = browserCdp?.events.filter(e => /^Browser\.download/.test(e.method)) ?? [];
    writeFileSync(join(ausgabe, 'browser.log'), beobachtung?.text() ?? '');
    try {
      const netlog = netlogLesen(readFileSync(netlogDatei, 'utf8'));
      protokoll.netlogAbschluss = netlog.netlogAbschluss;
      const nachweis = netzNachweis(netlog, protokoll.netzanfragen, protokoll.browserTargetAnfragen);
      protokoll.hintergrundanfragen = nachweis.hintergrundanfragen;
      protokoll.netzVerbindungen = nachweis.verbindungen;
      protokoll.netzUnklar = nachweis.unklar;
      protokoll.netzanfragen.push(...nachweis.seitenverdacht);
      protokoll.grenzen.push(...nachweis.grenzen);
      if (nachweis.hintergrundanfragen.some(a => a.status === 'blockiert')) protokoll.grenzen.push(
        'Blockierte Browser-Hintergrundversuche sind mit Ziel und Fehlerabschluss unter hintergrundanfragen dokumentiert; sie sind kein Seitenfehler. Der Nachweis gilt für CDP/NetLog dieses Prozesses, nicht als systemweite Firewallprüfung.');
      await pruefe('NETZ', 'Seite einschließlich Frames und Worker fragt ausschließlich 127.0.0.1, data: oder lokale blob: an', () => {
        const fremd = protokoll.netzanfragen.filter(e => !anfrageBewerten(e.url).erlaubt);
        if (fremd.length) throw new Error(`${fremd.length} unerlaubte Seitenanfragen (einschließlich gesperrter Versuche); siehe netzanfragen.`);
        return { anfragen: protokoll.netzanfragen.length };
      });
      await pruefe('NETZ-VERBINDUNGEN', 'Keine tatsächliche externe Browserverbindung in den auswertbaren NetLog-Ereignissen', () => {
        if (nachweis.verbindungen.length) throw new Error(`${nachweis.verbindungen.length} externe Verbindungen; siehe netzVerbindungen.`);
        return { externeVerbindungen: 0, netlogVollstaendig: netlog.netlogAbschluss.vollstaendig,
          blockierteHintergrundversuche: nachweis.hintergrundanfragen.filter(a => a.status === 'blockiert').length, proxyVerbindungen: protokoll.proxyVerbindungen.length };
      });
      if (nachweis.unklar.length) throw new Error(`${nachweis.unklar.length} ungeklärte Netzereignisse; siehe netzUnklar.`);
    } catch (e) { protokoll.ergebnisse.push({ id: 'NETZ-NACHWEIS', status: 'ungültig', meldung: e.message }); }
    protokoll.ende = new Date().toISOString();
    protokoll.auswertung = auswerten(protokoll);
    writeFileSync(join(ausgabe, 'protokoll.json'), JSON.stringify(protokoll, null, 2) + '\n');
  }
  return protokoll;
}

export async function main(argv) {
  let optionen, ausgabe;
  try { optionen = argumente(argv); ausgabe = ausgabeVorbereiten(optionen.ausgabe); }
  catch (e) { console.error(`${e.message}\nAufruf: node scripts/browser-lauf.mjs --phase <vertrag|webadapter|alle-v6a> --ausgabe <neuer-oder-leerer-Ordner> [--browser <edge|chrome|beide>] [--diagnose]`); return 64; }
  const bericht = { beginn: new Date().toISOString(), optionen, laeufe: [], nichtInstalliert: [] };
  let server;
  const controller = new AbortController();
  const abbrechen = () => controller.abort();
  process.once('SIGINT', abbrechen); process.once('SIGTERM', abbrechen);
  try {
    const git = await prozess('git', ['rev-parse', 'HEAD'], { cwd: wurzel });
    if (git.code !== 0 || !/^[a-f0-9]{40}$/.test(git.out.trim())) throw new Error('Commit konnte nicht bestimmt werden.');
    bericht.commit = git.out.trim();
    const status = await prozess('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: wurzel });
    if (status.code !== 0) throw new Error('Arbeitsstand konnte nicht bestimmt werden.');
    bericht.arbeitsstand = status.out.trim() || 'sauber';
    // Neue, noch nicht eingecheckte Läufer sind Teil des Nachweises.
    const dateien = await prozess('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: wurzel });
    if (dateien.code !== 0) throw new Error('Eingaben konnten nicht bestimmt werden.');
    bericht.eingaben = [...new Set(dateien.out.split('\0').filter(p => /^(scripts\/browser|packages\/(kern|oberflaeche)\/)/.test(p)))].filter(p => existsSync(join(wurzel, p)))
      .map(p => ({ datei: p, sha256: createHash('sha256').update(readFileSync(join(wurzel, p))).digest('hex') }));
    const gewuenscht = optionen.browser === 'beide' ? ['edge', 'chrome'] : [optionen.browser];
    const browser = gewuenscht.map(name => ({ browser: name, programm: browserKandidaten(name).find(p => existsSync(p) && statSync(p).isFile()) }));
    bericht.nichtInstalliert = browser.filter(b => !b.programm).map(b => b.browser);
    if (!browser.some(b => b.programm) || optionen.browser !== 'beide' && bericht.nichtInstalliert.length) throw new Error('Gewünschter Browser ist nicht installiert.');
    const bau = await bauen(wurzel, ausgabe);
    bericht.bau = bau;
    server = await lokalerServer(bau.dist);
    for (const b of browser.filter(b => b.programm)) for (const phase of optionen.phasen) {
      if (controller.signal.aborted) throw new Error('Lauf unterbrochen.');
      console.log(`${b.browser}: Phase ${phase} startet.`);
      const protokoll = await laufPhase({ ...b, phase, ausgabe: join(ausgabe, `${b.browser}-${phase}`), basisUrl: server.basisUrl,
        commit: bericht.commit, arbeitsstand: bericht.arbeitsstand, htmlHash: bau.htmlHash, signal: controller.signal, diagnose: optionen.diagnose });
      bericht.laeufe.push({ browser: b.browser, phase, version: protokoll.version, ...protokoll.auswertung, protokoll: `${b.browser}-${phase}/protokoll.json` });
      console.log(`${b.browser}: Phase ${phase}: ${protokoll.auswertung.status}.`);
    }
    bericht.code = bericht.laeufe.some(l => l.code === 2) ? 2 : bericht.laeufe.some(l => l.code === 1) ? 1 : 0;
  } catch (e) { bericht.fehler = e.message; bericht.code = e.rueckgabewert ?? 2; console.error(e.message); }
  finally {
    if (server) { bericht.serverAnfragen = server.anfragen; await server.close(); }
    process.removeListener('SIGINT', abbrechen); process.removeListener('SIGTERM', abbrechen);
    bericht.ende = new Date().toISOString();
    writeFileSync(join(ausgabe, 'protokoll.json'), JSON.stringify(bericht, null, 2) + '\n');
  }
  return bericht.code;
}

// main schließt Server und Browser und schreibt den Nachweis vor der Rückgabe.
// Auch nach einem abgestürzten Browser muss die Kommandozeile mit dem Code enden.
if (import.meta.main) process.exit(await main(process.argv.slice(2)));
