import { performance } from 'node:perf_hooks';

// TargetInfo.pid (Edge) bezeichnet den Renderer, nicht den Browser. Nur der
// browser-Eintrag von SystemInfo.getProcessInfo darf mit der Spawn-PID verglichen werden.
export function browserProzessIdentitaet(pid, daten) {
  const browser = Array.isArray(daten?.processInfo) ? daten.processInfo.filter(p => p?.type === 'browser') : [];
  const browserPid = browser.length === 1 ? browser[0].id : null;
  return { methode: 'SystemInfo.getProcessInfo', spawnPid: pid, browserPid,
    bestaetigt: Number.isSafeInteger(pid) && pid > 0 && browserPid === pid };
}

// Beide Pipes sofort und auch während Browser.close lesen. end (Pipe) und exit
// (Prozess) sind getrennte Ereignisse: Nachkommen können Pipe-Handles noch halten.
export function beobachteBrowserProzess(child, { diagnose = false, jetzt = () => performance.now() } = {}) {
  const start = jetzt(), teile = [];
  const daten = { stdout: { bytes: 0, ende: false }, stderr: { bytes: 0, ende: false }, exit: null, close: null };
  if (diagnose) daten.ereignisse = [];
  const merken = (ereignis, zusatz = {}) => {
    const nachMs = jetzt() - start;
    if (diagnose) daten.ereignisse.push({ ereignis, zeit: new Date().toISOString(), nachMs, ...zusatz });
    return nachMs;
  };
  for (const name of ['stdout', 'stderr']) {
    const stream = child[name];
    daten[name].gelesen = Boolean(stream);
    stream?.on('data', d => {
      const bytes = Buffer.from(d);
      teile.push(bytes); daten[name].bytes += bytes.length;
      daten[name].letzteDatenNachMs = jetzt() - start;
    });
    stream?.once('end', () => { daten[name].ende = true; daten[name].endeNachMs = merken(`${name}.end`); });
    stream?.once('close', () => { daten[name].closeNachMs = merken(`${name}.close`); });
    stream?.on('error', e => { daten[name].fehler = e.code ?? e.message; merken(`${name}.error`); });
  }
  child.once('exit', (code, signal) => { daten.exit = { code, signal, nachMs: merken('child.exit', { code, signal }) }; });
  child.once('close', (code, signal) => { daten.close = { code, signal, nachMs: merken('child.close', { code, signal }) }; });
  merken('spawn', { pid: child.pid });
  return { daten, text: () => Buffer.concat(teile).toString('utf8') };
}

// Signal 0 prüft nur die eigene PID, ohne Signal oder langsame Prozessliste.
// ESRCH belegt Abwesenheit; EPERM belegt Existenz ohne ausreichendes Recht.
export function prozessPidPruefen(pid, kill = process.kill.bind(process)) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) {
    return { vorhanden: null, code: null, fehler: 'Keine gültige eigene Browser-Prozesskennung vorhanden.' };
  }
  try {
    return kill(pid, 0) === true ? { vorhanden: true, code: null }
      : { vorhanden: null, code: null, fehler: 'process.kill(pid, 0) lieferte keine bestätigte Antwort.' };
  } catch (e) {
    if (e.code === 'ESRCH') return { vorhanden: false, code: 'ESRCH' };
    if (e.code === 'EPERM') return { vorhanden: true, code: 'EPERM' };
    return { vorhanden: null, code: e.code ?? null, fehler: 'process.kill(pid, 0) konnte die Existenz nicht prüfen.' };
  }
}

// Die CDP-Antwort ist kein Prozessnachweis: Chromium darf die Verbindung beim
// Schließen lösen. Auch ein fehlendes Node-exit-Ereignis beweist kein Weiterleben.
// Keine tasklist-Ersatzprüfung: Sie ist langsam und belegt keine PID-Identität.
export async function beendeBrowserProzess({ browserCdp, child, beendet },
  { kill = process.kill.bind(process), jetzt = () => performance.now(), warten = ms => new Promise(r => setTimeout(r, ms)),
    fristMs = 8000, intervallMs = 50, zwangFristMs = 1000, diagnose = false, zustand } = {}) {
  const beginn = jetzt();
  const ergebnis = { id: 'ENDE', beschreibung: 'Ende des eigenen Browserprozesses bestätigt',
    status: 'ungültig', prozessId: child?.pid ?? null,
    prozessPruefung: { methode: 'process.kill(pid, 0)', fristMs, intervallMs, proben: [] },
    identitaetsGrenze: 'Signal 0 unterscheidet keine PID-Wiederverwendung; keine Betriebssystem-Startzeit oder Elternbeziehung erhoben. Eine weiterhin belegte PID nach eigenem exit bleibt ungültig und wird nicht beendet. Zwang nur über das eigene ChildProcess-Objekt, niemals taskkill oder process.kill(pid, SIGKILL).' };
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0 || child.pid > 2147483647) {
    return { ...ergebnis, meldung: 'Keine gültige eigene Browser-Prozesskennung vorhanden.' };
  }
  if (![fristMs, zwangFristMs].every(v => Number.isFinite(v) && v >= 0)
      || !Number.isFinite(intervallMs) || intervallMs <= 0) throw new Error('Ungültige Frist für den Prozessnachweis.');
  const eigenesExit = () => beendet() || child.exitCode != null || child.signalCode != null;
  const zeiten = ergebnis.zeiten = { bezug: 'Beginn des Beendigungsablaufs', prozessAbwesendNachMs: null, nachZwang: false };
  const merken = (ereignis, zusatz = {}) => {
    if (diagnose) (ergebnis.diagnose ??= []).push({ ereignis, zeit: new Date().toISOString(), nachMs: jetzt() - beginn, ...zusatz });
  };
  const wsEnde = () => { zeiten.websocketEndeNachMs = jetzt() - beginn; merken('websocket.close'); };
  browserCdp?.ws?.addEventListener('close', wsEnde, { once: true });
  const abschliessen = (status, meldung) => {
    browserCdp?.ws?.removeEventListener('close', wsEnde);
    zeiten.gesamtMs = jetzt() - beginn;
    if (browserCdp?.ws) zeiten.websocketZustandAmEnde = browserCdp.ws.readyState;
    merken('nachweis.ende', { status });
    return { ...ergebnis, status, meldung };
  };
  let letzterZustand;
  const pruefenBis = async (frist, phase) => {
    const start = jetzt();
    while (true) {
      const probe = { phase, nachMs: jetzt() - start, nachCloseAufrufMs: jetzt() - beginn, ...prozessPidPruefen(child.pid, kill) };
      ergebnis.prozessPruefung.proben.push(probe);
      if (diagnose && zustand) {
        let aktuell;
        try { aktuell = zustand(); } catch (e) { aktuell = { fehler: e.code ?? e.message }; }
        const json = JSON.stringify(aktuell);
        if (json !== letzterZustand) { merken('zustand', JSON.parse(json)); letzterZustand = json; }
      }
      if (probe.vorhanden === false) {
        zeiten.prozessAbwesendNachMs = jetzt() - beginn; zeiten.nachZwang = phase === 'nach Zwang';
        merken('pid.ESRCH', { phase }); return probe;
      }
      const rest = frist - (jetzt() - start);
      if (rest <= 0) return probe;
      await warten(Math.min(intervallMs, rest));
    }
  };
  const schliessen = ergebnis.browserClose = { versucht: false, bestaetigt: false, fristMs };
  if (browserCdp && !browserCdp.closed) {
    schliessen.versucht = true;
    try { await browserCdp.send('Browser.close', {}, 5000); schliessen.bestaetigt = true; }
    catch (e) { schliessen.meldung = e.message; }
  } else schliessen.meldung = 'Keine offene Browser-CDP-Verbindung für Browser.close vorhanden.';
  zeiten.browserCloseAntwortNachMs = jetzt() - beginn;
  merken('Browser.close.antwort', { bestaetigt: schliessen.bestaetigt });
  // Antwort bestätigt nur den Befehl. Die eigene Verbindung (einschließlich
  // Auto-Attach/Fetch-Sitzungen) darf die Shutdown-Wartezeit nicht überdauern.
  // Nicht auf den WebSocket-Handschlag warten: er ist kein Prozessendnachweis.
  ergebnis.cdpTrennung = { versucht: Boolean(browserCdp), angefordert: false };
  try { if (browserCdp) { browserCdp.close(); ergebnis.cdpTrennung.angefordert = true; } }
  catch (e) { ergebnis.cdpTrennung.meldung = e.message; }
  zeiten.cdpTrennungNachMs = jetzt() - beginn;
  merken('cdp.close.angefordert', ergebnis.cdpTrennung);
  const vorher = await pruefenBis(fristMs, 'regulär');
  schliessen.prozessEndeBeobachtet = eigenesExit();
  if (vorher.vorhanden === false) return abschliessen('bestanden',
    'process.kill(pid, 0) bestätigt mit ESRCH die Abwesenheit der eigenen Browser-PID.');
  if (eigenesExit()) return abschliessen('ungültig',
    'Eigenes Prozessende beobachtet, aber PID nicht als abwesend bestätigt; mögliche PID-Wiederverwendung. Kein Zwangsabbruch.');
  // Node gibt im onexit den Prozesshandle frei. ChildProcess.kill benutzt den
  // vorhandenen Spawn-Handle und liefert false, wenn er bereits freigegeben ist.
  // Damit wird unter Windows kein neuer Prozess allein anhand seiner PID beendet.
  const zwang = ergebnis.zwang = { methode: 'ChildProcess.kill(SIGKILL)', versucht: true, bestaetigt: false };
  zeiten.zwangNachMs = jetzt() - beginn; merken('zwang.versucht');
  try { zwang.bestaetigt = child.kill('SIGKILL') === true; }
  catch (e) { zwang.fehler = e.code ?? 'Aufruffehler'; }
  const nachher = await pruefenBis(zwangFristMs, 'nach Zwang');
  ergebnis.prozessEndeNachZwang = nachher.vorhanden === false;
  if (nachher.vorhanden !== false) return abschliessen('ungültig', nachher.vorhanden
    ? 'Browser-PID nach dem Beendigungsversuch noch vorhanden; Prozessende nicht bestätigt.'
    : 'Das Ende der Browser-PID konnte mit process.kill(pid, 0) nicht bestätigt werden.');
  if (!zwang.bestaetigt && !zwang.fehler) return abschliessen('bestanden',
    'Eigener Prozesshandle bereits beendet; ESRCH bestätigt die Abwesenheit der Browser-PID.');
  return abschliessen('ungültig', zwang.bestaetigt
    ? 'Der Browser musste zwangsweise beendet werden; ESRCH bestätigt sein Ende.'
    : 'ESRCH bestätigt das Ende, aber der Zwangsaufruf meldete einen Fehler.');
}
