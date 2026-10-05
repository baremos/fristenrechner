import test from 'node:test';
import assert from 'node:assert/strict';
import { netlogLesen, netzNachweis } from './netz-auswertung.mjs';
import { auswerten } from './auswertung.mjs';
import { ERGEBNISKATALOG } from './ergebniskatalog.mjs';

const namen = ['URL_REQUEST_START_JOB', 'HTTP_STREAM_JOB_CONTROLLER_BOUND', 'HTTP_STREAM_JOB_CONTROLLER_PROXY_SERVER_RESOLVED',
  'URL_REQUEST_DELEGATE_CONNECTED', 'HTTP_TRANSACTION_READ_RESPONSE_HEADERS', 'TCP_CONNECT', 'SOCKET_BYTES_SENT',
  'UDP_CONNECT', 'UDP_BYTES_SENT', 'SOCKET_ALIVE', 'HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK', 'SOCKET_CONNECT',
  'QUIC_SESSION', 'QUIC_SESSION_PACKET_SENT', 'HTTP_TRANSACTION_SEND_TUNNEL_HEADERS', 'HTTP_TRANSACTION_READ_TUNNEL_RESPONSE_HEADERS',
  'TCP_CONNECT_ATTEMPT', 'WEBSOCKET_ALIVE', 'HTTP_CACHE_READ_INFO', 'QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE',
  'CANCELLED', 'REQUEST_ALIVE', 'HTTP_STREAM_JOB_CONTROLLER', 'HTTP_STREAM_JOB'];
const typen = Object.fromEntries(namen.map((name, i) => [name, 100 + i * 7]));
const log = events => ({ constants: { logEventTypes: typen, logEventPhase: { PHASE_BEGIN: 1, PHASE_END: 2, PHASE_NONE: 0 },
  logSourceType: { URL_REQUEST: 1, SOCKET: 2, UDP_SOCKET: 3, UDP_CLIENT_SOCKET: 4, HTTP_STREAM_JOB_CONTROLLER: 5, HTTP_STREAM_JOB: 6 },
  netError: { ERR_SOCKET_NOT_CONNECTED: -15, ERR_CONNECTION_RESET: -101, ERR_NAME_NOT_RESOLVED: -105 } }, events });
const e = (name, id, phase = 0, params, type = 1) => ({ type: typen[name], source: { id, type }, phase, params, time: '123' });
const start = (params = {}, id = 1) => e('URL_REQUEST_START_JOB', id, 1, {
  url: 'https://browser.example/update', method: 'GET', initiator: 'not an origin', request_type: 'other', ...params });
const ende = (net_error = -15, id = 1) => e('URL_REQUEST_START_JOB', id, 2, { net_error });
const proxy = (id = 1, port = 54321) => [
  e('HTTP_STREAM_JOB_CONTROLLER_BOUND', id, 0, { source_dependency: { id: id + 10, type: 5 } }),
  e('HTTP_STREAM_JOB_CONTROLLER_PROXY_SERVER_RESOLVED', id + 10, 0, { proxy_chain: `[127.0.0.1:${port}]` }, 5),
];

// Konstruierte Hintergrundanfrage ohne Request-Job-Abschluss, Sperr- oder
// Verbindungsbeleg. Späte CANCELLED-/Lebensdauer-Enden ändern das nicht.
test('Beim Messende offene Hintergrundanfrage bleibt ungeklärt und macht den Netznachweis ungültig', () => {
  const events = [e('REQUEST_ALIVE', 1, 1), start(),
    e('HTTP_STREAM_JOB_CONTROLLER', 11, 1, {}, 5), ...proxy(),
    e('HTTP_STREAM_JOB', 21, 1, {}, 6),
    e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 11, 0, { source_dependency: { id: 21, type: 6 } }, 5),
    e('CANCELLED', 1), e('HTTP_STREAM_JOB', 21, 2, {}, 6),
    e('HTTP_STREAM_JOB_CONTROLLER', 11, 2, {}, 5), e('REQUEST_ALIVE', 1, 2)];
  events.forEach((event, i) => { event.time = i < 7 ? '90' : '150'; });
  const r = netzNachweis(netlogLesen(JSON.stringify(log(events))));
  assert.equal(r.hintergrundanfragen[0].status, 'unklar');
  assert.equal(r.hintergrundanfragen[0].beleg, null);
  assert.equal(r.verbindungen.length, 0);
  assert.equal(r.unklar.length, 1);
  assert.match(r.unklar[0].grund, /ohne belegte Sperre oder Verbindung/);
  const protokoll = { phase: 'webadapter', ergebnisse: [
    ...ERGEBNISKATALOG.webadapter.map(id => ({ id, status: 'bestanden' })),
    ...(r.unklar.length ? [{ id: 'NETZ-NACHWEIS', status: 'ungültig' }] : []),
  ] };
  assert.equal(auswerten(protokoll).code, 2);
});

test('Vollständiges NetLog wird samt Abschluss bestätigt, einschließlich BOM und Formatierung', () => {
  const daten = log([start(), ende()]);
  const gelesen = netlogLesen('\uFEFF' + JSON.stringify(daten, null, 2));
  assert.deepEqual(gelesen.events, daten.events);
  assert.equal(gelesen.netlogAbschluss.vollstaendig, true);
  assert.equal(netzNachweis(gelesen).unklar.length, 0);
});

test('Abschneiden nach Ereignis, Komma, mitten im nächsten Ereignis oder vor Footer erhält vollständige Ereignisse', () => {
  const daten = log([start(), ende()]);
  const text = JSON.stringify(daten);
  const prefix = text.slice(0, text.lastIndexOf(']}'));
  for (const rest of ['', ',', ',\n', ',{"params":{"url":"https://', ']']) {
    const gelesen = netlogLesen(prefix + rest);
    assert.deepEqual(gelesen.events, daten.events, rest);
    assert.equal(gelesen.netlogAbschluss.vollstaendig, false);
    const r = netzNachweis(gelesen);
    assert.equal(r.hintergrundanfragen[0].status, 'blockiert');
    assert.equal(r.verbindungen.length, 0);
    assert.ok(r.unklar.some(e => /abgeschnitten/.test(e.grund)));
    assert.equal(r.grenzen[0].ereignisse, 2);
    assert.match(r.grenzen[0].grund, /Kein vollständiger Netznachweis/);
  }
});

test('NetLog-Präfixleser beachtet verschachtelte JSON-Werte, Klammern und Escapes in Zeichenketten', () => {
  const daten = log([start({ text: 'Klammer } ], Komma , Anführungszeichen " und Backslash \\',
    nested: { array: [1, { text: 'events":[' }, [false, null]] } }), ende()]);
  const prefix = JSON.stringify(daten).slice(0, -2);
  assert.deepEqual(netlogLesen(prefix + ',{"params":').events, daten.events);
  assert.equal(netzNachweis(netlogLesen(prefix)).hintergrundanfragen[0].status, 'blockiert');
});

test('Jeder Schnitt im letzten Ereignis übernimmt ausschließlich die vorherigen vollständigen Ereignisse', () => {
  const daten = log([start(), ende(), start({ url: 'https://browser.example/weitere' }, 2)]);
  const text = JSON.stringify(daten), letztes = JSON.stringify(daten.events[2]);
  const pos = text.lastIndexOf(letztes);
  for (let i = 0; i < letztes.length; i++) {
    const gelesen = netlogLesen(text.slice(0, pos + i));
    assert.equal(gelesen.events.length, 2, `Schnitt ${i}`);
    assert.ok(netzNachweis(gelesen).unklar.length > 0);
  }
});

test('Abgeschnittenes NetLog mit externer Verbindung behält den Fehler; spätere Unvollständigkeit verdeckt ihn nicht', () => {
  const daten = log([e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443' }, 2)]);
  const r = netzNachweis(netlogLesen(JSON.stringify(daten).slice(0, -2) + ',{"type":'));
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.verbindungen[0].ziel, '203.0.113.1:443');
  assert.ok(r.unklar.length > 0);
});

test('Abgeschnittener externer Verbindungsabschluss und abgeschnittene Konstanten werden niemals grün', () => {
  const daten = log([e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2)]);
  const r = netzNachweis(netlogLesen(JSON.stringify(daten).slice(0, -2) + ',{"phase":2,"source":'));
  assert.equal(r.verbindungen.length, 0);
  assert.ok(r.unklar.some(e => /ohne Abschluss/.test(e.grund)));
  assert.throws(() => netlogLesen('{"constants":{"logEventTypes":'), /Kopf.*abgeschnitten/);
});

test('Beschädigte vollständige Ereignisse und falsche Trenner werden nicht als bloßes Abschneiden repariert', () => {
  const prefix = JSON.stringify(log([start()])).slice(0, -2);
  for (const rest of [',{"type":ungültig}', ',,', ' {"type":1}', ',{"params":]}']) {
    assert.throws(() => netlogLesen(prefix + rest));
  }
});

test('NetLog-Namen statt fester Zahlen; fehlgeschlagene Hintergrundanfrage wird mit Ziel protokolliert', () => {
  const r = netzNachweis(log([start(), ende()]));
  assert.equal(r.hintergrundanfragen[0].status, 'blockiert');
  assert.equal(r.hintergrundanfragen[0].ziel, 'https://browser.example/update');
  assert.equal(r.hintergrundanfragen[0].fehler, 'ERR_SOCKET_NOT_CONNECTED');
  assert.equal(r.verbindungen.length + r.unklar.length, 0);
});

test('Seitenanfrage bleibt trotz gescheitertem Netzversuch ein strenger Seitenbefund', () => {
  const r = netzNachweis(log([start(), ende()]), [{ url: 'https://browser.example/update', targetId: 'seite' }]);
  assert.equal(r.seitenverdacht.length, 1);
  assert.equal(r.hintergrundanfragen.length, 0);
});

test('Gleiche CDP-URL ohne Zuordnung der konkreten Anfrage bleibt ungeklärt, auch mit abweichendem Initiator', () => {
  const url = 'https://browser.example/update';
  const daten = log([start({ initiator: 'edge://downloads-hub/', request_type: 'main frame' }), ende()]);
  assert.ok(netzNachweis(daten).unklar.length > 0, 'Ohne CDP-Beleg bleibt diese Anfrage ungeklärt');
  const r = netzNachweis(daten, [], [{ url, targetId: 'downloads', quelle: 'Browser-Target-CDP' }]);
  assert.equal(r.hintergrundanfragen.length, 0);
  assert.ok(r.unklar.some(e => /weder Seite noch Browserhintergrund/.test(e.grund)));
  const andere = netzNachweis(log([start({ initiator: 'https://anderer.example', request_type: 'other' }), ende()]), [], [{ url }]);
  assert.equal(andere.hintergrundanfragen.length, 0);
  assert.ok(andere.unklar.length > 0);
});

test('Gleiche URL in Seite und Oberfläche bleibt durch die Seitenspur ein Seitenfehler', () => {
  const url = 'https://browser.example/update';
  const daten = log([start({ initiator: 'edge://downloads-hub/' }), ende()]);
  const r = netzNachweis(daten, [{ url }], [{ url }]);
  assert.equal(r.seitenverdacht.length, 1); assert.equal(r.hintergrundanfragen.length, 0);
});

test('Erfolgreiche externe Oberflächenverbindung bleibt trotz späterem Fehler Verbindungsbefund', () => {
  const url = 'https://browser.example/update';
  const r = netzNachweis(log([start({ initiator: 'edge://downloads-hub/' }),
    e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 1, 0, { source_dependency: { id: 4, type: 2 } }),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443' }, 2), ende(-101)]), [], [{ url }]);
  assert.equal(r.hintergrundanfragen.length, 0);
  assert.ok(r.unklar.length > 0);
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.verbindungen[0].ziel, '203.0.113.1:443');
});

test('Internes Schema allein verdeckt keine externe Transportverbindung', () => {
  const r = netzNachweis(log([start({ url: 'edge://downloads-hub/' }), ende(),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443' }, 2)]));
  assert.equal(r.seitenverdacht.length + r.hintergrundanfragen.length, 0);
  assert.equal(r.verbindungen.length, 1);
});

for (const params of [
  { initiator: 'http://127.0.0.1:8080' },
  { network_isolation_key: 'http://127.0.0.1 http://127.0.0.1' },
  { site_for_cookies: 'SiteForCookies: {site=http://127.0.0.1; schemefully_same=true}' },
]) test(`NetLog entdeckt externe Seitenspur ${Object.keys(params)[0]} auch ohne CDP-Treffer`, () => {
  const r = netzNachweis(log([start(params), ende()]));
  assert.equal(r.seitenverdacht.length, 1);
  assert.equal(r.hintergrundanfragen.length, 0);
});

test('Reset allein genügt nicht, Reset am belegten lokalen Proxy schon', () => {
  const ohne = netzNachweis(log([start(), ende(-101)]));
  assert.equal(ohne.hintergrundanfragen[0].status, 'unklar');
  assert.equal(ohne.unklar.length, 1);
  const mit = netzNachweis(log([start(), ...proxy(), ende(-101)]));
  assert.equal(mit.hintergrundanfragen[0].status, 'blockiert');
  assert.equal(mit.unklar.length, 0);
});

test('Proxy-Fallback auf DIRECT ist kein belegter lokaler Sperrweg', () => {
  const r = netzNachweis(log([start(), ...proxy(), e('HTTP_STREAM_JOB_CONTROLLER_PROXY_SERVER_RESOLVED', 11, 0, { proxy_chain: '[direct://]' }, 5), ende(-101)]));
  assert.equal(r.hintergrundanfragen[0].status, 'unklar');
});

test('Belegte externe HTTP-Verbindung gewinnt gegen einen späteren Fehler', () => {
  const r = netzNachweis(log([start(), e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 1, 0, { source_dependency: { id: 4, type: 2 } }),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443' }, 2),
    e('URL_REQUEST_DELEGATE_CONNECTED', 1, 1), ende(-101)]));
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.hintergrundanfragen[0].status, 'verbunden');
});

test('CONNECTED am nachgewiesenen lokalen Proxy mit Fehlerabschluss bleibt blockiert', () => {
  const r = netzNachweis(log([start({ url: 'http://browser.example/update' }), ...proxy(),
    e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 11, 0, { source_dependency: { id: 4, type: 2 } }, 5),
    e('TCP_CONNECT', 4, 2, { remote_address: '127.0.0.1:54321' }, 2),
    e('URL_REQUEST_DELEGATE_CONNECTED', 1, 1), ende(-101)]));
  assert.equal(r.verbindungen.length, 0);
  assert.equal(r.unklar.length, 0);
  assert.equal(r.hintergrundanfragen[0].status, 'blockiert');
});

test('CONNECTED ohne belegten Transport zum Sperrproxy bleibt unklar, auch bei Fehler', () => {
  for (const weg of [[], proxy(), [...proxy(),
    e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 11, 0, { source_dependency: { id: 4, type: 2 } }, 5),
    e('TCP_CONNECT', 4, 2, { remote_address: '127.0.0.1:54322' }, 2)]]) {
    const r = netzNachweis(log([start(), ...weg, e('URL_REQUEST_DELEGATE_CONNECTED', 1, 1), ende(-15)]));
    assert.equal(r.verbindungen.length, 0);
    assert.equal(r.unklar.length, 1);
    assert.equal(r.hintergrundanfragen[0].status, 'unklar');
  }
});

test('HTTP-Header ohne Transportbeleg (etwa Cache) behaupten keine externe Verbindung', () => {
  const r = netzNachweis(log([start(), e('HTTP_CACHE_READ_INFO', 1, 1), e('HTTP_CACHE_READ_INFO', 1, 2),
    e('HTTP_TRANSACTION_READ_RESPONSE_HEADERS', 1, 0, { headers: ['HTTP/1.1 200 OK'] }), ende(0)]));
  assert.equal(r.verbindungen.length, 0);
  assert.equal(r.hintergrundanfragen[0].status, 'unklar');
  assert.equal(r.unklar.length, 1);
});

test('Externer TCP-Erfolg wird auch ohne URL-Anfrage entdeckt', () => {
  const r = netzNachweis(log([e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443', local_address: '192.0.2.1:1234' }, 2)]));
  assert.equal(r.verbindungen.length, 1);
});

test('Externer TCP-Erfolg bleibt bei später fehlgeschlagener HTTP-Anfrage verbunden', () => {
  const r = netzNachweis(log([start(), e('HTTP_STREAM_JOB_CONTROLLER_BOUND', 1, 0, { source_dependency: { id: 4, type: 2 } }),
    e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2),
    e('TCP_CONNECT', 4, 2, { remote_address: '203.0.113.1:443' }, 2), ende(-15)]));
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.hintergrundanfragen[0].status, 'verbunden');
});

test('Erfolgreicher externer TCP_CONNECT_ATTEMPT zählt auch bei späterem Adressfehler', () => {
  const r = netzNachweis(log([e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2),
    e('TCP_CONNECT_ATTEMPT', 4, 1, { address: '203.0.113.1:443' }, 2), e('TCP_CONNECT_ATTEMPT', 4, 2, {}, 2),
    e('TCP_CONNECT', 4, 2, { get_address_net_error: -15 }, 2)]));
  assert.equal(r.verbindungen.length, 1);
});

test('Abgeschnittener externer TCP_CONNECT_ATTEMPT ohne TCP_CONNECT-Hülle bleibt unklar', () => {
  const r = netzNachweis(log([e('TCP_CONNECT_ATTEMPT', 4, 1, { address: '203.0.113.1:443' }, 2)]));
  assert.equal(r.verbindungen.length, 0);
  assert.equal(r.unklar.length, 1);
  assert.match(r.unklar[0].grund, /TCP_CONNECT_ATTEMPT ohne Abschluss/);
});

test('Lokaler TCP-Erfolg und lokales Proxy-CONNECT sind kein externer Erfolg', () => {
  const r = netzNachweis(log([e('TCP_CONNECT', 4, 1, { address_list: ['127.0.0.1:54321'] }, 2),
    e('TCP_CONNECT', 4, 2, { remote_address: '127.0.0.1:54321' }, 2),
    e('HTTP_TRANSACTION_SEND_TUNNEL_HEADERS', 4, 0, { line: 'CONNECT browser.example:443 HTTP/1.1\r\n' }, 2),
    e('SOCKET_BYTES_SENT', 4, 0, { byte_count: 220 }, 2)]));
  assert.equal(r.verbindungen.length + r.unklar.length, 0);
});

test('Bestätigter externer Proxy-Tunnel wird trotz lokalem TCP-Endpunkt entdeckt', () => {
  const r = netzNachweis(log([e('TCP_CONNECT', 4, 2, { remote_address: '127.0.0.1:54321' }, 2),
    e('HTTP_TRANSACTION_SEND_TUNNEL_HEADERS', 4, 0, { line: 'CONNECT browser.example:443 HTTP/1.1\r\n' }, 2),
    e('HTTP_TRANSACTION_READ_TUNNEL_RESPONSE_HEADERS', 4, 0, { headers: ['HTTP/1.1 200 Connection established'] }, 2)]));
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.verbindungen[0].ziel, 'browser.example:443');
});

test('Fehlgeschlagener TCP-Versuch ist kein Erfolg, fehlender Abschluss bleibt unklar', () => {
  const begin = e('TCP_CONNECT', 4, 1, { address_list: ['203.0.113.1:443'] }, 2);
  assert.equal(netzNachweis(log([begin, e('TCP_CONNECT', 4, 2, { net_error: -102 }, 2)])).verbindungen.length, 0);
  assert.equal(netzNachweis(log([begin])).unklar.length, 1);
  assert.equal(netzNachweis(log([begin, e('TCP_CONNECT', 4, 2, {}, 2)])).unklar.length, 1);
});

function routenprobe(zusaetzlich = []) {
  return [e('SOCKET_ALIVE', 4, 1, { source_dependency: { id: 5, type: 4 } }, 3),
    e('SOCKET_ALIVE', 5, 1, { source_dependency: { id: 6, type: 2 } }, 4),
    e('UDP_CONNECT', 4, 1, { address: '[2001:db8::1]:443' }, 3), e('UDP_CONNECT', 4, 2, {}, 3),
    ...zusaetzlich, e('SOCKET_ALIVE', 4, 2, {}, 3),
    e('HOST_RESOLVER_MANAGER_IPV6_REACHABILITY_CHECK', 6, 0, { ipv6_available: true }, 2)];
}

test('Vollständige IPv6-Routenprobe ohne Datagramm wird als Grenze dokumentiert', () => {
  const r = netzNachweis(log(routenprobe()));
  assert.equal(r.verbindungen.length + r.unklar.length, 0);
  assert.equal(r.grenzen.length, 1);
});

test('Externe UDP-Datagramme dürfen auch bei einer Routenprobe nicht grün werden', () => {
  const r = netzNachweis(log(routenprobe([e('UDP_BYTES_SENT', 4, 0, { byte_count: 23 }, 3)])));
  assert.equal(r.verbindungen.length, 1);
  assert.equal(r.grenzen.length, 0);
});

test('UDP-connect ohne belegte Routenprobe oder ohne Socket-Abschluss bleibt unklar', () => {
  const plain = [e('UDP_CONNECT', 4, 1, { address: '[2001:db8::1]:443' }, 3), e('UDP_CONNECT', 4, 2, {}, 3)];
  assert.equal(netzNachweis(log(plain)).unklar.length, 1);
  const offen = routenprobe().filter(x => !(x.type === typen.SOCKET_ALIVE && x.phase === 2));
  assert.equal(netzNachweis(log(offen)).unklar.length, 1);
});

test('QUIC-Pakete an externen Peer werden entdeckt', () => {
  const r = netzNachweis(log([e('QUIC_SESSION', 9, 1, { peer_address: '203.0.113.1:443' }, 2),
    e('QUIC_SESSION_PACKET_SENT', 9, 0, { size: 123 }, 2)]));
  assert.equal(r.verbindungen.length, 1);
});

test('QUIC-Handshake zählt als Verbindung; unbekannter Peer verhindert grünes Ergebnis', () => {
  const gut = netzNachweis(log([e('QUIC_SESSION', 9, 1, { peer_address: '203.0.113.1:443' }, 2),
    e('QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE', 9, 0, {}, 2)]));
  assert.equal(gut.verbindungen.length, 1);
  const unbekannt = netzNachweis(log([e('QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE', 9, 0, {}, 2)]));
  assert.equal(unbekannt.unklar.length, 1);
});

test('WebSocket-URL geht nicht verloren und wird nicht vorschnell als verbunden gezählt', () => {
  const daten = log([e('WEBSOCKET_ALIVE', 1, 1, { url: 'wss://browser.example/socket' })]);
  const unbekannt = netzNachweis(daten);
  assert.equal(unbekannt.unklar.length, 1);
  assert.equal(unbekannt.verbindungen.length, 0);
  const seite = netzNachweis(daten, [{ url: 'wss://browser.example/socket' }]);
  assert.equal(seite.seitenverdacht.length, 1);
});

test('Bytes ohne Gegenendpunkt und unbekannte NetLog-Typen bleiben unklar', () => {
  assert.equal(netzNachweis(log([e('SOCKET_BYTES_SENT', 9, 0, { byte_count: 123 }, 2)])).unklar.length, 1);
  assert.equal(netzNachweis(log([{ ...e('SOCKET_BYTES_SENT', 9), type: 999999 }])).unklar.length, 1);
});

test('Unbekannte Zuordnung und fehlender Fehlerabschluss werden nicht als blockiert ausgegeben', () => {
  const unbekannt = netzNachweis(log([start({ initiator: 'https://unknown.example' }), ende()]));
  assert.equal(unbekannt.hintergrundanfragen.length, 0);
  assert.equal(unbekannt.unklar.length, 1);
  const offen = netzNachweis(log([start()]));
  assert.equal(offen.hintergrundanfragen[0].status, 'unklar');
  assert.equal(offen.unklar.length, 1);
});

test('Wiederholte Request-Jobs behalten getrennte Abschlüsse', () => {
  const r = netzNachweis(log([start(), ende(), start({ url: 'https://browser.example/zweiter' })]));
  assert.deepEqual(r.hintergrundanfragen.map(a => a.status), ['blockiert', 'unklar']);
});

test('Lokale Anfragen und eingebettete Daten sind kein Browser-Hintergrundversuch', () => {
  for (const url of ['http://127.0.0.1:54321/', 'blob:http://127.0.0.1:54321/id', 'data:text/plain,hallo']) {
    const r = netzNachweis(log([start({ url }), ende(0)]));
    assert.equal(r.hintergrundanfragen.length + r.unklar.length + r.seitenverdacht.length, 0);
  }
});

test('Leeres oder unvollständiges NetLog ist ungültig', () => {
  for (const daten of [null, {}, log([]), { constants: { logEventTypes: typen }, events: [start()] }]) {
    assert.ok(netzNachweis(daten).unklar.length > 0);
  }
});
