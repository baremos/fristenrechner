// Reine Auswertung: keine Browser-, Datei- oder Prozesszugriffe beim Import.
export const PHASEN = ['vertrag', 'webadapter'];
// Die benannte Gruppe bleibt auch nach Ergänzung späterer Phasen auf V6a begrenzt.
export const PHASENGRUPPEN = { 'alle-v6a': ['vertrag', 'webadapter'] };
export const HTML_HASH = 'e6465ae87407c4e1e53036ecae4f9f2ac7e1f90b90fb5362483436fab41e8898';

export function argumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!['--phase', '--ausgabe', '--browser', '--diagnose'].includes(name)) throw new Error(`Unbekanntes Argument: ${name}`);
    if (Object.hasOwn(werte, name)) throw new Error(`Argument doppelt: ${name}`);
    if (name === '--diagnose') { werte[name] = true; continue; }
    if (!argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw new Error(`Wert fehlt: ${name}`);
    werte[name] = argv[++i];
  }
  for (const name of ['--phase', '--ausgabe']) if (!werte[name]) throw new Error(`Pflichtargument fehlt: ${name}`);
  if (![...PHASEN, ...Object.keys(PHASENGRUPPEN)].includes(werte['--phase'])) throw new Error(`--phase muss ${[...PHASEN, ...Object.keys(PHASENGRUPPEN)].join(', ')} sein.`);
  const browser = werte['--browser'] ?? 'beide';
  if (!['edge', 'chrome', 'beide'].includes(browser)) throw new Error('--browser muss edge, chrome oder beide sein.');
  return { phase: werte['--phase'], phasen: [...(PHASENGRUPPEN[werte['--phase']] ?? [werte['--phase']])], browser, ausgabe: werte['--ausgabe'],
    ...(werte['--diagnose'] ? { diagnose: true } : {}) };
}

// Ausschließlich die ausgeschriebene IPv4-Adresse ist erlaubt, keine alternativen
// Schreibweisen, Benutzerdaten, localhost oder andere Loopback-Adressen.
export function netzErlaubt(adresse) {
  if (typeof adresse !== 'string' || !/^(?:https?|wss?):\/\/127\.0\.0\.1(?::[0-9]+)?(?:[/?#]|$)/.test(adresse)) return false;
  try { const url = new URL(adresse); return url.hostname === '127.0.0.1' && !url.username && !url.password; }
  catch { return false; }
}

export function anfrageBewerten(adresse) {
  if (netzErlaubt(adresse)) return { erlaubt: true, art: 'lokales Netz' };
  if (typeof adresse === 'string' && adresse.startsWith('blob:') && netzErlaubt(adresse.slice(5))) return { erlaubt: true, art: 'lokaler Blob' };
  if (typeof adresse === 'string' && adresse.startsWith('data:')) return { erlaubt: true, art: 'eingebettete Daten' };
  return { erlaubt: false, art: 'unerlaubte Adresse' };
}

export function neuesProtokoll({ commit, arbeitsstand, phase, browser, version = null }) {
  return { schema: 1, beginn: new Date().toISOString(), commit, arbeitsstand, phase, browser, version,
    ergebnisse: [], konsolenmeldungen: [], netzanfragen: [], befunde: [], messungen: [], grenzen: [] };
}

// Ungültige/fehlende Nachweise dürfen auch neben einem echten Fehler nicht als
// vollständig ausgeführter Lauf erscheinen. Rückgabewerte wie die übrigen Läufer.
export function auswerten(protokoll) {
  const ergebnisse = protokoll.ergebnisse ?? [];
  const ungueltig = !ergebnisse.length || ergebnisse.some(e => !['bestanden', 'nicht bestanden'].includes(e.status));
  const fehler = ergebnisse.filter(e => e.status === 'nicht bestanden').length;
  const netzfehler = (protokoll.netzanfragen ?? []).filter(e => !anfrageBewerten(e.url).erlaubt).length;
  const code = ungueltig ? 2 : fehler || netzfehler ? 1 : 0;
  return { status: code === 2 ? 'ungültig' : code === 1 ? 'nicht bestanden' : 'bestanden', code,
    bestanden: ergebnisse.filter(e => e.status === 'bestanden').length, fehler, netzfehler };
}

export async function pruefung(protokoll, id, beschreibung, fn) {
  if (protokoll.ergebnisse.some(e => e.id === id)) throw new Error(`Prüfkennung doppelt: ${id}`);
  const beginn = Date.now();
  let ergebnis;
  try { ergebnis = { id, beschreibung, status: 'bestanden', details: await fn() ?? null }; }
  catch (error) { ergebnis = { id, beschreibung, status: 'nicht bestanden', meldung: error.message }; }
  ergebnis.dauerMs = Date.now() - beginn;
  protokoll.ergebnisse.push(ergebnis);
  return ergebnis;
}

// NetLog enthält zusätzlich den Browser-Hintergrundverkehr, den die Seiten-CDP-
// Sitzung nicht sieht. Nur echte URL-Anfragen, keine beliebigen URL-Zeichenketten.
export function netlogAnfragen(daten) {
  if (!daten?.constants?.logEventTypes || !Array.isArray(daten.events)) throw new Error('NetLog ist unvollständig.');
  const typen = daten.constants.logEventTypes;
  const ids = new Set(['URL_REQUEST_START_JOB', 'WEBSOCKET_ALIVE'].map(name => typen[name]).filter(id => id !== undefined));
  if (!ids.size) throw new Error('NetLog enthält keine bekannten Anfragetypen.');
  return daten.events.filter(e => ids.has(e.type) && typeof e.params?.url === 'string')
    .map(e => ({ quelle: 'Browser-NetLog', zeit: e.time, url: e.params.url, methode: e.params.method ?? null }));
}
