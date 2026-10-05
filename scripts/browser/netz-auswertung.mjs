// Reine NetLog-Auswertung. CDP-Anfragen der Seite bleiben ein eigener strenger
// Nachweis; ein fehlgeschlagener Browser-Hintergrundversuch ist kein Seitenfehler.
import { anfrageBewerten } from './auswertung.mjs';
import { browserOberflaecheBeleg } from './browser-oberflaeche.mjs';

// Nur syntaktisch vollständige Ereignisse übernehmen. Keine Regex-Reparatur:
// Klammern/Kommas in Zeichenketten, Escapes und verschachtelte params beachten.
function wertEnde(text, start) {
  const stapel = [];
  let zitat = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (zitat) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') { zitat = false; if (!stapel.length) return i + 1; }
    } else if (c === '"') zitat = true;
    else if (c === '{' || c === '[') stapel.push(c);
    else if (c === '}' || c === ']') {
      if (!stapel.length || stapel.pop() !== (c === '}' ? '{' : '[')) throw new Error('NetLog enthält widersprüchliche JSON-Klammern.');
      if (!stapel.length) return i + 1;
    } else if (!stapel.length && /[,\s]/.test(c)) return i;
  }
  return zitat || stapel.length ? null : text.length;
}

export function netlogLesen(roh) {
  const text = String(roh).replace(/^\uFEFF/, '');
  try {
    const daten = JSON.parse(text);
    return { ...daten, netlogAbschluss: { vollstaendig: true, ereignisse: daten.events?.length ?? 0 } };
  } catch { /* Ein vollständiger Kopf und Ereignispräfix können erhalten sein. */ }
  const weiss = pos => { while (/\s/.test(text[pos] ?? '') && pos < text.length) pos++; return pos; };
  let pos = weiss(0);
  if (text[pos++] !== '{') throw new Error('NetLog hat keinen vollständigen JSON-Kopf.');
  let daten;
  while (pos < text.length) {
    pos = weiss(pos);
    if (text[pos] !== '"') throw new Error('NetLog-Kopf ist unvollständig oder ungültig.');
    const ende = wertEnde(text, pos);
    if (ende === null) throw new Error('NetLog-Kopf ist abgeschnitten.');
    const key = JSON.parse(text.slice(pos, ende));
    pos = weiss(ende);
    if (text[pos++] !== ':') throw new Error('NetLog-Kopf enthält keine gültige Schlüsselzuordnung.');
    pos = weiss(pos);
    if (key === 'events') {
      if (text[pos] !== '[') throw new Error('NetLog-Ereignisse sind keine Liste.');
      daten = JSON.parse(text.slice(0, pos) + '[]}');
      pos++; break;
    }
    const wert = wertEnde(text, pos);
    if (wert === null) throw new Error('NetLog-Kopf ist abgeschnitten.');
    JSON.parse(text.slice(pos, wert));
    pos = weiss(wert);
    if (text[pos++] !== ',') throw new Error('NetLog-Ereignisliste fehlt im vollständigen Kopf.');
  }
  if (!daten) throw new Error('NetLog-Ereignisliste fehlt.');
  let listeGeschlossen = false;
  while (pos < text.length) {
    pos = weiss(pos);
    if (pos === text.length) break;
    if (text[pos] === ']') { listeGeschlossen = true; pos++; break; }
    if (text[pos] !== '{') throw new Error('NetLog enthält ein ungültiges Ereignis.');
    const ende = wertEnde(text, pos);
    if (ende === null) break;
    daten.events.push(JSON.parse(text.slice(pos, ende)));
    pos = weiss(ende);
    if (pos === text.length) break;
    if (text[pos] === ']') { listeGeschlossen = true; pos++; break; }
    if (text[pos++] !== ',') throw new Error('NetLog enthält einen ungültigen Ereignistrenner.');
  }
  daten.netlogAbschluss = { vollstaendig: false, ereignisse: daten.events.length, listeGeschlossen,
    restZeichen: text.length - pos,
    grund: 'NetLog am Ende abgeschnitten: vollständige Ereignisse ausgewertet; fehlende Ereignisse/Abschlussdaten sind nicht auszuschließen. Kein vollständiger Netznachweis, auch nach bestätigtem Prozessende.' };
  return daten;
}

const lokal = adresse => typeof adresse === 'string' && /^127\.0\.0\.1:[0-9]+$/.test(adresse);
const schluessel = quelle => `${quelle?.type}:${quelle?.id}`;
const negativ = params => Object.entries(params ?? {}).some(([k, v]) => /(?:^|_)net_error$/.test(k) && typeof v === 'number' && v < 0);
const datenEreignis = name => /^(?:SOCKET_BYTES_(?:SENT|RECEIVED)|UDP_BYTES_(?:SENT|RECEIVED)|QUIC_SESSION_PACKET_(?:SENT|RECEIVED)|QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE|QUIC_SESSION_HANDSHAKE_DONE_FRAME_RECEIVED)$/.test(name);
export const BROWSERENDE_ABBRUCH = 'beim Browserende abgebrochen, keine Verbindung';

/**
 * Fehlende Abschlüsse/Zuordnung ergeben unklar, niemals stillschweigend grün.
 * NetLog-Namen werden aus constants gelesen: Chromium vergibt die Zahlen neu.
 * UDP connect() ist verbindungslos und kein Beleg für versandte Datagramme.
 * Die abgeschlossene IPV6_REACHABILITY_CHECK-Sequenz wird deshalb getrennt
 * dokumentiert; UDP_BYTES_* / QUIC_SESSION_PACKET_* bleiben Verbindungsbelege.
 * Quellenformate: Chromium net/log/net_log_event_type_list.h sowie
 * net/dns/host_resolver_manager.cc (StartIPv6ReachabilityCheck).
 */
export function netzNachweis(daten, seitenanfragen = [], { messende, prozessende } = {}) {
  const ergebnis = { hintergrundanfragen: [], beimBrowserendeAbgebrochen: [], verbindungen: [], unklar: [], grenzen: [], seitenverdacht: [] };
  if (daten?.netlogAbschluss?.vollstaendig === false) {
    ergebnis.grenzen.push({ quelle: 'Browser-NetLog', ...daten.netlogAbschluss });
    ergebnis.unklar.push({ grund: daten.netlogAbschluss.grund });
  }
  const c = daten?.constants;
  if (!c?.logEventTypes || !c?.logEventPhase || !Array.isArray(daten.events) || !daten.events.length) {
    ergebnis.unklar.push({ grund: 'NetLog fehlt, ist leer oder enthält keine auswertbaren Konstanten.' });
    return ergebnis;
  }
  const typen = new Map(Object.entries(c.logEventTypes).map(([name, id]) => [id, name]));
  const quellenTypen = new Map(Object.entries(c.logSourceType ?? {}).map(([name, id]) => [id, name]));
  const fehlerNamen = new Map(Object.entries(c.netError ?? {}).map(([name, id]) => [id, name]));
  const begin = c.logEventPhase.PHASE_BEGIN;
  const end = c.logEventPhase.PHASE_END;
  if (begin === undefined || end === undefined || c.logEventTypes.URL_REQUEST_START_JOB === undefined) {
    ergebnis.unklar.push({ grund: 'NetLog kennt die benötigten Phasen/Anfragetypen nicht.' });
    return ergebnis;
  }
  const gruppen = new Map();
  for (const roh of daten.events) {
    if (!typen.has(roh.type) || !Number.isInteger(roh.source?.id) || roh.source?.type === undefined) {
      ergebnis.unklar.push({ grund: 'NetLog-Ereignis hat einen unbekannten Typ oder keine Quelle.', typ: roh.type });
      continue;
    }
    const e = { ...roh, name: typen.get(roh.type) };
    const key = schluessel(e.source);
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(e);
  }
  const belege = new Set();
  const melden = (sammlung, e, ziel, grund) => {
    const key = `${sammlung}:${schluessel(e.source)}:${ziel}:${grund}`;
    if (belege.has(key)) return;
    belege.add(key);
    ergebnis[sammlung].push({ quelle: 'Browser-NetLog', sourceId: e.source.id, sourceTyp: quellenTypen.get(e.source.type) ?? e.source.type,
      zeit: e.time, ziel, ereignis: e.name, grund });
  };
  // Quellenabhängigkeiten werden nur vorwärts verfolgt. Andere URL_REQUESTs
  // dürfen nicht über gemeinsam benutzte Sockets einer Anfrage zugeschlagen werden.
  const quellenKette = start => {
    const gefunden = new Set();
    const offen = [start];
    let vollstaendig = true;
    while (offen.length) {
      const key = offen.pop();
      if (gefunden.has(key)) continue;
      const gruppe = gruppen.get(key) ?? [];
      if (!gruppe.length) vollstaendig = false;
      if (key !== start && gruppe.some(e => e.name === 'URL_REQUEST_START_JOB')) { vollstaendig = false; continue; }
      gefunden.add(key);
      for (const e of gruppe) if (e.params?.source_dependency) offen.push(schluessel(e.params.source_dependency));
    }
    return { keys: [...gefunden], vollstaendig, ereignisse: [...gefunden].flatMap(key => gruppen.get(key) ?? []) };
  };
  const abhaengigkeiten = start => quellenKette(start).ereignisse;

  const messendeMs = typeof messende === 'string' ? Date.parse(messende) : NaN;
  const offset = typeof c.timeTickOffset === 'number' ? c.timeTickOffset
    : typeof c.timeTickOffset === 'string' && c.timeTickOffset.trim() ? Number(c.timeTickOffset) : NaN;
  const zeitMs = e => typeof e?.time === 'string' && e.time.trim() && Number.isFinite(offset)
    && Number.isFinite(Number(e.time)) ? offset + Number(e.time) : NaN;
  const endeBestaetigt = prozessende?.status === 'bestanden'
    && prozessende.prozessPruefung?.proben?.at(-1)?.vorhanden === false
    && prozessende.exit?.status !== 'abnormal'
    && prozessende.nachkommen?.bekannteStatus !== 'Ende nicht bestätigt';
  const abbruchBeleg = (key, start, abschnitt) => {
    if (daten.netlogAbschluss?.vollstaendig !== true || !endeBestaetigt || !Number.isFinite(messendeMs)
        || !Number.isFinite(zeitMs(start))) return null;
    if (abschnitt.some(e => e.name === 'URL_REQUEST_START_JOB' && e.phase === end)) return null;
    const cancelled = abschnitt.find(e => e.name === 'CANCELLED' && e.phase === c.logEventPhase.PHASE_NONE && zeitMs(e) > messendeMs);
    const aliveEnde = abschnitt.find(e => e.name === 'REQUEST_ALIVE' && e.phase === end
      && abschnitt.indexOf(e) > abschnitt.indexOf(cancelled) && zeitMs(e) >= zeitMs(cancelled));
    if (!cancelled || !aliveEnde || zeitMs(cancelled) < zeitMs(start)) return null;
    const kette = quellenKette(key);
    const ids = new Set(kette.ereignisse.map(e => e.source.id));
    if (!kette.vollstaendig || ergebnis.unklar.some(e => ids.has(e.sourceId))) return null;
    // Diese enge Ausnahme belegt ausschließlich abgebrochene Anfrage-/Stream-
    // Quellen vor dem Transport. Weitere Quellentypen oder Transportereignisse
    // brauchen ihre bisherige Auswertung und werden hier nicht freigesprochen.
    const lebensdauer = { URL_REQUEST: 'REQUEST_ALIVE', HTTP_STREAM_JOB_CONTROLLER: 'HTTP_STREAM_JOB_CONTROLLER', HTTP_STREAM_JOB: 'HTTP_STREAM_JOB' };
    const quellen = [];
    for (const quelle of kette.keys) {
      const events = gruppen.get(quelle);
      const typ = quellenTypen.get(events?.[0]?.source.type);
      const name = lebensdauer[typ];
      if (!name) return null;
      const anfaenge = events.filter(e => e.name === name && e.phase === begin);
      const enden = events.filter(e => e.name === name && e.phase === end);
      if (anfaenge.length !== 1 || enden.length !== 1 || events.indexOf(enden[0]) <= events.indexOf(anfaenge[0])
          || !Number.isFinite(zeitMs(anfaenge[0])) || (zeitMs(anfaenge[0]) > zeitMs(start) && quelle === key)
          || zeitMs(anfaenge[0]) > zeitMs(enden[0])
          || zeitMs(enden[0]) < zeitMs(cancelled) || !Number.isFinite(zeitMs(enden[0]))) return null;
      quellen.push({ sourceId: events[0].source.id, sourceTyp: typ, beginn: anfaenge[0].time, ende: enden[0].time });
    }
    if (kette.ereignisse.some(e => /^(?:TCP_CONNECT|UDP_CONNECT|UDP_BYTES_|SSL_CONNECT|QUIC_|SOCKET_BYTES_|SOCKET_CONNECT|HOST_RESOLVER_|DNS_|HTTP_TRANSACTION_|URL_REQUEST_DELEGATE_CONNECTED)/.test(e.name))) return null;
    return { messende, cancelled: cancelled.time, requestAliveEnde: aliveEnde.time,
      cancelledUtc: new Date(zeitMs(cancelled)).toISOString(), requestAliveEndeUtc: new Date(zeitMs(aliveEnde)).toISOString(),
      netlogVollstaendig: true, prozessendeBestaetigt: true, quellen };
  };

  // Transportbelege erfassen auch Verbindungen ohne HTTP-Anfrage (z.B. UDP).
  for (const [key, gruppe] of gruppen) {
    const tcpStarts = [];
    const tcpVersuche = [];
    const udpStarts = [];
    let endpunkt;
    let tunnelZiel;
    for (const e of gruppe) {
      const p = e.params ?? {};
      if (e.name === 'TCP_CONNECT' && e.phase === begin) {
        tcpStarts.push(e);
        if (p.address_list?.length === 1) endpunkt = p.address_list[0];
      }
      if (e.name === 'TCP_CONNECT' && e.phase === end) {
        const start = tcpStarts.pop();
        endpunkt = p.remote_address ?? endpunkt;
        if (!negativ(p) && p.remote_address && !lokal(p.remote_address)) melden('verbindungen', e, p.remote_address, 'TCP-Verbindung hergestellt');
        else if (!negativ(p) && !p.remote_address && (!start || start.params?.address_list?.some(a => !lokal(a)))) {
          melden('unklar', e, endpunkt ?? null, 'TCP-Ende ohne belegten Gegenendpunkt');
        }
      }
      if (e.name === 'TCP_CONNECT_ATTEMPT' && e.phase === begin) tcpVersuche.push(e);
      if (e.name === 'TCP_CONNECT_ATTEMPT' && e.phase === end) {
        const start = tcpVersuche.pop();
        if (!negativ(p) && start?.params?.address && !lokal(start.params.address)) {
          melden('verbindungen', e, start.params.address, 'Externer TCP-Verbindungsversuch erfolgreich');
        }
      }
      if (e.name === 'UDP_CONNECT' && e.phase === begin) {
        udpStarts.push(e);
        endpunkt = p.address;
      }
      if (e.name === 'UDP_CONNECT' && e.phase === end) udpStarts.pop();
      if (e.name === 'SOCKET_CONNECT' && p.address) endpunkt = p.address;
      if (e.name === 'QUIC_SESSION' && e.phase === begin) endpunkt = p.peer_address ?? p.address ?? endpunkt;
      if (e.name === 'HTTP_TRANSACTION_SEND_TUNNEL_HEADERS') {
        tunnelZiel = /^CONNECT ([^ ]+) HTTP\//.exec(p.line ?? '')?.[1];
      }
      if (/^(?:HTTP_TRANSACTION_READ_TUNNEL_RESPONSE_HEADERS|HTTP_TRANSACTION_TUNNEL_READ_HEADERS)$/.test(e.name) && tunnelZiel && !lokal(tunnelZiel)) {
        const erfolgreich = p.headers?.some(h => /^HTTP\/\S+ 2[0-9][0-9](?: |$)/.test(h));
        if (erfolgreich) melden('verbindungen', e, tunnelZiel, 'Proxy hat externen CONNECT-Tunnel bestätigt');
      }
      if (datenEreignis(e.name) && (p.byte_count === undefined || p.byte_count > 0)) {
        const ziel = p.address ?? p.peer_address ?? endpunkt;
        if (typeof ziel !== 'string' || !ziel) melden('unklar', e, null, 'Datenübertragung ohne bekannten Gegenendpunkt');
        else if (!lokal(ziel)) melden('verbindungen', e, ziel, 'Daten mit externem Gegenendpunkt übertragen');
      }
    }
    for (const start of tcpStarts) if (start.params?.address_list?.some(a => !lokal(a))) {
      melden('unklar', start, start.params.address_list.join(', '), 'Externer TCP-Versuch ohne Abschluss');
    }
    for (const start of tcpVersuche) if (!lokal(start.params?.address)) {
      melden('unklar', start, start.params?.address ?? null, 'Externer TCP_CONNECT_ATTEMPT ohne Abschluss');
    }
    for (const start of udpStarts) if (!lokal(start.params?.address)) melden('unklar', start, start.params?.address, 'UDP-Versuch ohne Abschluss');
    const externeUdp = gruppe.filter(e => e.name === 'UDP_CONNECT' && e.phase === begin && !lokal(e.params?.address));
    if (externeUdp.length && !gruppe.some(e => datenEreignis(e.name))) {
      const verbunden = abhaengigkeiten(key);
      const routenprobe = verbunden.some(e => e.name === 'HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK');
      const geschlossen = gruppe.some(e => e.name === 'SOCKET_ALIVE' && e.phase === end);
      for (const e of externeUdp) {
        if (routenprobe && geschlossen && !udpStarts.length) {
          melden('grenzen', e, e.params.address, 'Abgeschlossene UDP-Routenprobe des Browsers ohne Datagramm; UDP-connect ist kein Netzwerk-Handshake');
        } else if (!negativ(gruppe.find(q => q.name === 'UDP_CONNECT' && q.phase === end)?.params)) {
          melden('unklar', e, e.params.address, 'UDP-connect ohne belegte Routenprobe oder Datenabschluss');
        }
      }
    }
  }

  const seitenUrls = new Set(seitenanfragen.map(a => a.url));
  for (const [key, gruppe] of gruppen) {
    const starts = gruppe.filter(e => e.name === 'URL_REQUEST_START_JOB' && e.phase === begin);
    const zugeordnet = abhaengigkeiten(key);
    for (let i = 0; i < starts.length; i++) {
      const e = starts[i];
      const p = e.params ?? {};
      if (anfrageBewerten(p.url).erlaubt || browserOberflaecheBeleg(p.url)) continue;
      const startIndex = gruppe.indexOf(e);
      const folgeIndex = i + 1 < starts.length ? gruppe.indexOf(starts[i + 1]) : gruppe.length;
      const abschnitt = gruppe.slice(startIndex, folgeIndex);
      const ende = abschnitt.find(q => q.name === 'URL_REQUEST_START_JOB' && q.phase === end);
      const seitenspur = seitenUrls.has(p.url) || [p.initiator, p.network_isolation_key, p.site_for_cookies]
        .some(s => typeof s === 'string' && /https?:\/\/127\.0\.0\.1(?:[: /;}]|$)/.test(s));
      const basis = { quelle: 'Browser-NetLog', sourceId: e.source.id, zeit: e.time, url: p.url, ziel: p.url, methode: p.method ?? null };
      if (seitenspur) ergebnis.seitenverdacht.push({ ...basis, grund: 'Externe Anfrage mit Seitenzuordnung' });
      // Nur die Initiator-/Typdaten dieses konkreten NetLog-Request-Jobs belegen
      // Browserhintergrund. CDP-URL-Gleichheit verbindet keine Anfragekennungen.
      // Jede Seitenspur hat Vorrang; andere Initiatoren bleiben ungeklärt.
      const zuordnung = !seitenspur && p.initiator === 'not an origin' && p.request_type === 'other';
      // Antwort-Header allein reichen nicht: Cache-Lesen bzw. lokale Proxy-
      // Antworten belegen keine Verbindung zum fremden Ziel. CONNECTED kann
      // bei HTTP nur die Verbindung zum Proxy meinen. Ausschlaggebend bleiben
      // unabhängige Transport-/Tunnelbelege, auch bei späteren Fehlern.
      const delegiert = abschnitt.some(q => q.name === 'URL_REQUEST_DELEGATE_CONNECTED');
      const quellenIds = new Set(zugeordnet.map(q => q.source.id));
      const transport = ergebnis.verbindungen.some(v => quellenIds.has(v.sourceId));
      const proxies = zugeordnet.filter(q => q.name === 'HTTP_STREAM_JOB_CONTROLLER_PROXY_SERVER_RESOLVED').map(q => q.params?.proxy_chain);
      const lokalerProxy = proxies.length > 0 && proxies.every(s => /^\[127\.0\.0\.1:[0-9]+\]$/.test(s ?? ''));
      const proxyAdressen = lokalerProxy ? new Set(proxies.map(s => s.slice(1, -1))) : new Set();
      const tcpErfolge = zugeordnet.filter(q => q.name === 'TCP_CONNECT' && q.phase === end && !negativ(q.params)
        && typeof q.params?.remote_address === 'string');
      const lokalerProxyTransport = lokalerProxy && tcpErfolge.length > 0
        && tcpErfolge.every(q => proxyAdressen.has(q.params.remote_address));
      const netError = ende?.params?.net_error;
      // Ein Reset allein beweist keine Sperre: nur zusammen mit dem lokalen
      // Proxyweg, ohne verbundene HTTP-Anfrage und ohne erfolgreichen Tunnel.
      const vorVerbindung = [-15, -102, -105, -106, -109, -111, -130, -137, -138].includes(netError);
      const tunnelErfolg = zugeordnet.some(q => /READ_TUNNEL_RESPONSE_HEADERS|TUNNEL_READ_HEADERS/.test(q.name)
        && q.params?.headers?.some(h => /^HTTP\/\S+ 2[0-9][0-9](?: |$)/.test(h)));
      const blockiert = !transport && !tunnelErfolg && typeof netError === 'number' && netError < 0
        && (delegiert ? lokalerProxyTransport : vorVerbindung || lokalerProxy);
      const abbruch = zuordnung && !blockiert && !transport && !tunnelErfolg ? abbruchBeleg(key, e, abschnitt) : null;
      if (abbruch) ergebnis.beimBrowserendeAbgebrochen.push({ ...basis, status: BROWSERENDE_ABBRUCH, beleg: abbruch });
      if (zuordnung) ergebnis.hintergrundanfragen.push({ ...basis, status: transport || tunnelErfolg ? 'verbunden' : blockiert ? 'blockiert' : abbruch ? BROWSERENDE_ABBRUCH : 'unklar',
        zuordnung: { initiator: p.initiator, requestType: p.request_type, sourceTyp: e.source.type },
        netError: netError ?? null, fehler: fehlerNamen.get(netError) ?? null, proxy: proxies,
        beleg: blockiert ? 'Fehlerabschluss vor Verbindung oder am belegten lokalen Sperrproxy' : abbruch });
      if (!zuordnung && !seitenspur) melden('unklar', e, p.url, 'Anfrage lässt sich weder Seite noch Browserhintergrund zuordnen');
      if (!blockiert && !abbruch && !transport && !tunnelErfolg) melden('unklar', e, p.url, 'Externe Anfrage ohne belegte Sperre, Verbindung oder Browserende-Abbruch');
    }
  }
  // WEBSOCKET_ALIVE ist kein URL_REQUEST_START_JOB. Die URL darf deshalb weder
  // untergehen noch allein als gelungene Verbindung gelten (ggf. vorher blockiert).
  for (const gruppe of gruppen.values()) for (const e of gruppe) {
    if (e.name !== 'WEBSOCKET_ALIVE' || typeof e.params?.url !== 'string' || anfrageBewerten(e.params.url).erlaubt) continue;
    if (seitenUrls.has(e.params.url)) ergebnis.seitenverdacht.push({ quelle: 'Browser-NetLog', sourceId: e.source.id,
      zeit: e.time, url: e.params.url, ziel: e.params.url, grund: 'Externer WebSocket mit Seitenzuordnung' });
    else melden('unklar', e, e.params.url, 'Externer WebSocket ohne belegte Seitenzuordnung und Verbindungsabschluss');
  }
  return ergebnis;
}
