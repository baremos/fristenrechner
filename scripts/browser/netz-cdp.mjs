// CDP-Zuordnung erfolgt über Targets/Sitzungen, niemals über Domain-Whitelists.
import { anfrageBewerten, netzErlaubt } from './auswertung.mjs';
import { browserOberflaecheBeleg } from './browser-oberflaeche.mjs';
import { Messfehler } from './fehler.mjs';

// Flache Target-Sitzungen benutzen dieselbe Verbindung und denselben ID-Raum.
// Der Emulator-CDP bleibt unverändert; dessen send() kennt keine sessionId.
export class BrowserCdp {
  constructor(ws) {
    this.ws = ws; this.next = 0; this.pending = new Map(); this.events = []; this.closed = false;
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch { this.close(); return; }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.no(new Messfehler(`CDP ${m.error.code}: ${m.error.message}`)); else p.ok(m.result);
      } else if (m.method) {
        this.events.push({ zeit: new Date().toISOString(), ...m });
        const geloest = m.method === 'Target.detachedFromTarget' ? m.params.sessionId
          : m.method === 'Inspector.detached' ? m.sessionId : null;
        if (geloest) {
          for (const [id, p] of this.pending) if (p.sessionId === geloest) {
            clearTimeout(p.timer); this.pending.delete(id); p.no(new Messfehler('CDP-Target wurde während eines Befehls beendet.'));
          }
        } else if (m.method === 'Inspector.detached') this.close();
      }
    });
    ws.addEventListener('close', () => this.verwerfen());
  }
  static async connect(url) {
    if (!/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[A-Za-z0-9-]+$/.test(url)) throw new Error('Nichtlokale Browser-CDP-Adresse.');
    return new Promise((ok, no) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); no(new Error('Browser-CDP: Zeitüberschreitung')); }, 10000);
      ws.addEventListener('open', () => { clearTimeout(timer); ok(new BrowserCdp(ws)); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); no(new Error('Browser-CDP nicht erreichbar')); }, { once: true });
    });
  }
  send(method, params = {}, timeoutMs = 30000, sessionId) {
    if (this.closed) return Promise.reject(new Messfehler('CDP-Verbindung geschlossen'));
    return new Promise((ok, no) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        // Ein stummes Edge-Target darf andere Sitzungen und Browser.close nicht
        // mitreißen. Späte Antworten haben keine wartende Befehlskennung mehr.
        this.pending.delete(id); no(new Messfehler(`CDP-Zeitüberschreitung: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { ok, no, timer, sessionId });
      try { this.ws.send(JSON.stringify({ id, method, params, sessionId })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); no(new Messfehler(e.message, { cause: e })); }
    });
  }
  verwerfen() {
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.no(new Messfehler('CDP-Verbindung geschlossen')); }
    this.pending.clear();
  }
  close() { this.verwerfen(); this.ws.close(); }
}

// Auch neue Frames, Popups und (verschachtelte) Worker werden vor Fortsetzung
// ihrer Ausführung angehalten und überwacht. Im frischen Profil werden alle
// Web-Targets streng behandelt; Erweiterungs-/Browser-Hintergrundtargets nicht.
export async function seitenNetzStarten(cdp, protokoll, seitenTargetId, basisUrl) {
  const targets = new Map(), historie = new Map(), offen = new Set(), fehler = [];
  const entdeckt = new Map(), aktiv = new Map(), geloest = [];
  let geplantesEnde = false;
  const leer = url => url === '' || url === 'about:blank';
  const webTypen = ['page', 'iframe', 'worker', 'shared_worker', 'service_worker'];
  const autoAttach = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [...webTypen.map(type => ({ type, exclude: false })), { exclude: true }] };
  protokoll.netzTargets = [];
  protokoll.netzEntdeckteTargets = [];
  protokoll.netzSitzungsabgaenge = [];
  const senden = async (method, params, sessionId) => {
    const target = targets.get(sessionId);
    if (target) target.offeneBefehle = (target.offeneBefehle ?? 0) + 1;
    try { return await cdp.send(method, params, 10000, sessionId); }
    finally { if (target) target.offeneBefehle--; }
  };
  const verfolgen = promise => {
    const auftrag = promise.catch(e => fehler.push(e.message)).finally(() => offen.delete(auftrag));
    offen.add(auftrag);
  };
  const leerseiteVerwerfen = (target, grund) => {
    if (!target?.leerseitenBeleg) return;
    target.browserLeerseite = false;
    target.leerseitenBeleg.verworfen = grund;
    fehler.push(`Web-Target ohne belegte Seitenzuordnung: page ${target.targetId}; ${grund}`);
  };
  const oberflaecheMerken = (target, beleg) => {
    if (target.leerseitenBeleg?.verworfen || target.oberflaechenVerworfen) return;
    target.browserLeerseite = false;
    target.browserOberflaeche = true;
    target.seite = false;
    target.hintergrund = true;
    target.browserOberflaechenBeleg = beleg;
  };
  const adresseMerken = info => {
    if (webTypen.includes(info.type) && !entdeckt.has(info.targetId)) {
      const beleg = { targetId: info.targetId, type: info.type, entdecktVorMessende: !geplantesEnde, angehaengt: false };
      entdeckt.set(info.targetId, beleg); protokoll.netzEntdeckteTargets.push(beleg);
    }
    const beleg = browserOberflaecheBeleg(info.url);
    const adresse = beleg?.url ?? info.url;
    const h = historie.get(info.targetId) ?? { adressen: [], navigiert: false };
    if (!h.adressen.includes(adresse)) h.adressen.push(adresse);
    if (!leer(info.url)) h.navigiert = true;
    historie.set(info.targetId, h);
    for (const target of targets.values()) if (target.targetId === info.targetId) {
      target.url = adresse;
      if (beleg) oberflaecheMerken(target, beleg);
      else if (target.browserOberflaeche && !leer(info.url)) {
        target.browserOberflaeche = false;
        target.hintergrund = false;
        // Eine lokale Web-Seite bekommt wieder die strenge Seitenüberwachung.
        // file: und data: haben keinen belegten 127.0.0.1-Ursprung.
        const lokal = /^(?:https?:|blob:https?:)/.test(info.url)
          && netzErlaubt(info.url.startsWith('blob:') ? info.url.slice(5) : info.url);
        if (lokal) {
          target.seite = true;
          target.lokaleNavigation = adresse;
          const befehle = target.leerseitenBeleg?.befehle;
          if (befehle && (befehle.length < 4 || befehle.some(b => b.status !== 'bestätigt'))) {
            fehler.push(`Browser-Oberfläche navigiert lokal ohne vollständige CDP-Sperre: ${target.targetId}`);
          }
        } else {
          target.oberflaechenVerworfen = true;
          fehler.push(`Browser-Oberfläche navigiert außerhalb 127.0.0.1: ${adresse}`);
        }
      } else if (!leer(info.url) && target.leerseitenBeleg && !target.browserOberflaeche && !target.lokaleNavigation) {
        target.leerseitenBeleg.navigiert = true;
        leerseiteVerwerfen(target, `Browser-Leerseite navigiert: ${info.url}`);
      }
    }
    return h;
  };
  const erfassen = (m, url, zusatz = {}) => {
    url = browserOberflaecheBeleg(url)?.url ?? url;
    const target = targets.get(m.sessionId);
    if (!target) fehler.push(`Netzereignis ohne bestätigtes Web-Target: ${m.sessionId ?? 'ohne Sitzung'}`);
    const sammlung = target?.seite ? protokoll.netzanfragen : target?.hintergrund
      ? (protokoll.browserTargetAnfragen ??= []) : (protokoll.netzNichtZugeordnet ??= []);
    sammlung.push({ quelle: target?.seite ? 'Seiten-CDP' : target?.hintergrund ? 'Browser-Target-CDP' : 'CDP-ohne-Seitenzuordnung', zeit: new Date().toISOString(),
      sessionId: m.sessionId, targetId: target?.targetId, targetTyp: target?.type,
      frameId: m.params.frameId ?? null, url, ereignis: m.method, ...zusatz });
  };
  const nachricht = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { fehler.push('Ungültige CDP-Nachricht bei der Netzüberwachung.'); return; }
    const p = m.params;
    if (['Target.targetCreated', 'Target.targetInfoChanged'].includes(m.method)) adresseMerken(p.targetInfo);
    if (m.method === 'Target.targetDestroyed') {
      for (const target of targets.values()) if (target.targetId === p.targetId) {
        target.beendet = true;
        if (!target.abgang) {
          target.abgang = { sessionId: target.sessionId, targetId: target.targetId, ereignis: m.method, geplantesEnde,
            messbereit: Boolean(target.messbereit), offeneAnfragen: [...(aktiv.get(target.sessionId) ?? [])], offeneBefehle: target.offeneBefehle ?? 0 };
          geloest.push(target); protokoll.netzSitzungsabgaenge.push(target.abgang);
        }
      }
    }
    const bekannt = targets.get(m.sessionId);
    const verloreneSitzung = m.method === 'Target.detachedFromTarget' ? p.sessionId : m.method === 'Inspector.detached' ? m.sessionId : null;
    if (verloreneSitzung) {
      const target = targets.get(verloreneSitzung);
      if (!target) { if (!geplantesEnde) fehler.push(`Unbekannte Messsitzung gelöst: ${verloreneSitzung}`); }
      else if (!target.abgang) {
        target.abgang = { sessionId: verloreneSitzung, targetId: target.targetId, ereignis: m.method, geplantesEnde,
          messbereit: Boolean(target.messbereit), offeneAnfragen: [...(aktiv.get(verloreneSitzung) ?? [])], offeneBefehle: target.offeneBefehle ?? 0 };
        geloest.push(target); protokoll.netzSitzungsabgaenge.push(target.abgang);
      }
    }
    if (m.method === 'Inspector.targetCrashed' || m.method === 'Target.targetCrashed') {
      fehler.push(`Target abgestürzt: ${p.targetId ?? bekannt?.targetId ?? 'unbekannt'}`);
    }
    if (bekannt && m.method === 'Network.requestWillBeSent') (aktiv.get(m.sessionId) ?? aktiv.set(m.sessionId, new Set()).get(m.sessionId)).add(`anfrage:${p.requestId}`);
    if (bekannt && ['Network.loadingFinished', 'Network.loadingFailed'].includes(m.method)) aktiv.get(m.sessionId)?.delete(`anfrage:${p.requestId}`);
    if (bekannt && ['Network.webSocketCreated', 'Network.webTransportCreated'].includes(m.method)) {
      const art = m.method === 'Network.webSocketCreated' ? 'webSocket' : 'webTransport';
      (aktiv.get(m.sessionId) ?? aktiv.set(m.sessionId, new Set()).get(m.sessionId)).add(`${art}:${p.requestId ?? p.transportId}`);
    }
    if (bekannt && ['Network.webSocketClosed', 'Network.webTransportClosed'].includes(m.method)) {
      const art = m.method === 'Network.webSocketClosed' ? 'webSocket' : 'webTransport';
      aktiv.get(m.sessionId)?.delete(`${art}:${p.requestId ?? p.transportId}`);
    }
    if (bekannt?.browserLeerseite && (m.method?.startsWith('Network.') || m.method === 'Fetch.requestPaused')) {
      bekannt.leerseitenBeleg.netzereignisse++;
      leerseiteVerwerfen(bekannt, `Browser-Leerseite mit Netzereignis: ${m.method}`);
    }
    if (m.method === 'Page.frameNavigated' && !p.frame.parentId && bekannt) {
      adresseMerken({ targetId: bekannt.targetId, url: p.frame.url });
    }
    if (m.method === 'Target.attachedToTarget') {
      if (!webTypen.includes(p.targetInfo.type)) {
        fehler.push(`Unerwartetes angehaltenes Target: ${p.targetInfo.type}`); return;
      }
      const eltern = targets.get(m.sessionId);
      const opener = [...targets.values()].find(t => t.targetId === p.targetInfo.openerId);
      let lokalerWorker = false;
      if (basisUrl && ['shared_worker', 'service_worker'].includes(p.targetInfo.type)) {
        try { lokalerWorker = new URL(p.targetInfo.url).origin === basisUrl; } catch { /* bleibt unbekannt */ }
      }
      const beleg = browserOberflaecheBeleg(p.targetInfo.url);
      const seite = !beleg && (p.targetInfo.targetId === seitenTargetId || eltern?.seite === true || opener?.seite === true || lokalerWorker);
      const hintergrund = !seite && (Boolean(beleg) || eltern?.hintergrund === true || /^chrome-extension:\/\//.test(p.targetInfo.url));
      const h = adresseMerken(p.targetInfo);
      // Der Läufer öffnet nur seitenTargetId. Popups/Frames/Worker bekommen
      // über Eltern/opener eine Seitenzuordnung, niemals diese Ausnahme.
      const browserLeerseite = !seite && !hintergrund && p.targetInfo.type === 'page'
        && !m.sessionId && !p.targetInfo.openerId && leer(p.targetInfo.url) && !h.navigiert;
      const target = { ...p.targetInfo, url: beleg?.url ?? p.targetInfo.url, seite, hintergrund, browserLeerseite,
        browserOberflaeche: Boolean(beleg), sessionId: p.sessionId, elternSitzung: m.sessionId ?? null };
      if (beleg) target.browserOberflaechenBeleg = beleg;
      if (beleg && h.adressen.some(url => !leer(url) && !browserOberflaecheBeleg(url)
          && !netzErlaubt(url))) {
        target.oberflaechenVerworfen = true;
        fehler.push(`Browser-Oberfläche mit zuvor beobachteter Navigation außerhalb 127.0.0.1: ${target.targetId}`);
      }
      if (browserLeerseite) target.leerseitenBeleg = { einordnung: 'Browser-Leerseite', anfangsUrl: p.targetInfo.url,
        adressen: h.adressen, navigiert: false, netzereignisse: 0, vomLaeuferGeoeffnet: false,
        grund: 'Unabhängiges leeres page-Target im frischen Browserprofil; fortlaufende Target-Discovery, CDP und vollständiges NetLog erforderlich.',
        befehle: [] };
      targets.set(p.sessionId, target);
      entdeckt.get(p.targetInfo.targetId).angehaengt = true;
      protokoll.netzTargets.push(target);
      if (!seite && !hintergrund && !browserLeerseite) fehler.push(`Web-Target ohne belegte Seitenzuordnung: ${p.targetInfo.type} ${p.targetInfo.targetId}`);
      verfolgen((async () => {
        if (browserLeerseite) {
          // Sofort freigeben: Edge kann Network.enable auf einer internen
          // Leerseite unbeantwortet lassen. Die Browserverbindung bleibt offen.
          target.leerseitenBeleg.freigabe = { waitingForDebugger: p.waitingForDebugger ?? null, timeoutMs: 1000 };
          try {
            await cdp.send('Runtime.runIfWaitingForDebugger', {}, 1000, p.sessionId);
            target.leerseitenBeleg.freigabe.status = 'bestätigt';
          } catch (e) {
            target.leerseitenBeleg.freigabe.status = 'nicht bestätigt';
            target.leerseitenBeleg.freigabe.meldung = e.message;
            // Bei nachweislich nicht wartendem Target ist keine Freigabe nötig.
            if (p.waitingForDebugger !== false && !target.beendet) throw e;
          }
          for (const [method, params] of [['Network.enable', {}], ['Page.enable', {}],
            ['Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }], ['Target.setAutoAttach', autoAttach]]) {
            try {
              await cdp.send(method, params, 1000, p.sessionId);
              target.leerseitenBeleg.befehle.push({ method, timeoutMs: 1000, status: 'bestätigt' });
            } catch (e) {
              target.leerseitenBeleg.befehle.push({ method, timeoutMs: 1000, status: 'nicht bestätigt', meldung: e.message });
              // Für Leerseiten und Browser-Oberfläche gilt vollständiges NetLog
              // als zusätzlicher Pflichtnachweis; lokale Web-Navigation braucht
              // wieder alle bestätigten CDP-Sperrbefehle.
            }
          }
          target.messbereit = true;
          return;
        }
        await senden('Network.enable', {}, p.sessionId);
        if (p.targetInfo.type === 'page') await senden('Page.enable', {}, p.sessionId);
        await senden('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, p.sessionId);
        // Rekursion ist nötig: Auto-Attach am Browser allein erfasst keine Enkel.
        await senden('Target.setAutoAttach', autoAttach, p.sessionId);
        await senden('Runtime.runIfWaitingForDebugger', {}, p.sessionId);
        target.messbereit = true;
      })());
    }
    if (m.method === 'Network.requestWillBeSent') erfassen(m, p.request.url,
      { methode: p.request.method, typ: p.type, requestId: p.requestId });
    if (m.method === 'Network.loadingFailed' && bekannt?.hintergrund) {
      const anfrage = protokoll.browserTargetAnfragen?.findLast(a => a.sessionId === m.sessionId && a.requestId === p.requestId);
      if (anfrage) erfassen(m, anfrage.url, { requestId: p.requestId, fehler: p.errorText, gesperrt: Boolean(p.blockedReason) });
    }
    if (m.method === 'Network.webSocketCreated' || m.method === 'Network.webTransportCreated') erfassen(m, p.url);
    if (m.method === 'Fetch.requestPaused') {
      const erlaubt = anfrageBewerten(p.request.url).erlaubt
        || Boolean(bekannt?.browserOberflaeche && browserOberflaecheBeleg(p.request.url));
      if (!erlaubt) erfassen(m, p.request.url, { methode: p.request.method, gesperrt: true });
      verfolgen(senden(erlaubt ? 'Fetch.continueRequest' : 'Fetch.failRequest', erlaubt
        ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: 'BlockedByClient' }, m.sessionId));
    }
  };
  const bereit = async () => {
    while (offen.size) await Promise.all([...offen]);
    for (const t of entdeckt.values()) if (t.entdecktVorMessende && !t.angehaengt) fehler.push(`Entdecktes Web-Target ohne Messsitzung: ${t.type} ${t.targetId}`);
    for (const target of geloest) {
      const a = target.abgang;
      const workerEnde = ['worker', 'shared_worker', 'service_worker'].includes(target.type) && target.beendet
        && a.messbereit && !a.offeneAnfragen.length && a.offeneBefehle === 0;
      a.erwartet = a.geplantesEnde || workerEnde;
      a.beleg = a.geplantesEnde ? 'Geplantes Browserende nach abgeschlossener Messung'
        : workerEnde ? 'Target zerstört; Workerüberwachung bestätigt, keine offenen Anfragen oder Befehle bei Abgang' : 'Kein belegter regulärer Messabschluss';
      if (!a.erwartet) fehler.push(`Unerwarteter Verlust der Messsitzung: ${target.type} ${target.targetId} (${a.sessionId})`);
    }
    if (fehler.length) throw new Messfehler(`Seiten-Netzüberwachung unvollständig: ${[...new Set(fehler)].join('; ')}`);
  };
  const verbindungEnde = () => { if (!geplantesEnde) fehler.push('Browser-CDP-Verbindung vor geplantem Messende verloren.'); };
  cdp.ws.addEventListener('message', nachricht);
  cdp.ws.addEventListener('close', verbindungEnde);
  try {
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    await cdp.send('Target.setAutoAttach', autoAttach);
    await bereit();
    if (![...targets.values()].some(t => t.targetId === seitenTargetId)) throw new Error('Seiten-Target wurde nicht vor Navigation an die Netzüberwachung gebunden.');
  } catch (e) { cdp.ws.removeEventListener('message', nachricht); cdp.ws.removeEventListener('close', verbindungEnde); throw e; }
  return { bereit, endePlanen: async () => {
    // Auch bei schon ungültiger Messung muss das eigene Browserende möglich sein.
    try { await bereit(); } finally { geplantesEnde = true; protokoll.netzMessende = new Date().toISOString(); }
  }, close: () => { cdp.ws.removeEventListener('message', nachricht); cdp.ws.removeEventListener('close', verbindungEnde); } };
}
