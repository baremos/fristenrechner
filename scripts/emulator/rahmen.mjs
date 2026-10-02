// Prozess- und Dateizugriffe des Emulatorlaufs. Keine Ausführung beim Import.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const APP = 'de.baremos.fristenrechner';
export const GEGEN = `${APP}.gegenprobe`;
export const SERIAL = 'emulator-5554';
export const pause = ms => new Promise(r => setTimeout(r, ms));
export const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export const innen = (base, path) => { const r = relative(base, path); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); };

// Bestehende Vorfahren auflösen: auch Junctions dürfen die Schreibgrenze nicht umgehen.
export function echterPfad(path) {
  const absolut = resolve(path);
  if (existsSync(absolut)) return realpathSync(absolut);
  return join(echterPfad(dirname(absolut)), absolut.slice(dirname(absolut).length + 1));
}

export function ausgabePruefen(path, repos) {
  const aus = echterPfad(path);
  const wurzeln = repos.map(echterPfad);
  for (const repo of wurzeln) {
    if (innen(aus, repo)) throw new Error('Der Ausgabeordner darf kein Repository oder dessen Vorfahr sein.');
  }
  const naechste = wurzeln.filter(repo => innen(repo, aus)).sort((a, b) => b.length - a.length)[0];
  if (naechste && !innen(join(naechste, 'scratchpad'), aus)) throw new Error('Ausgaben im Repository sind nur unter scratchpad erlaubt.');
  return aus;
}

export function argumente(argv, wurzel, repos = [wurzel]) {
  const o = {};
  const erlaubt = new Set(['--api', '--ablauf', '--ausgabe', '--apk-debug', '--apk-release', '--varianten', '--wipe-data', '--nur-argumente']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!erlaubt.has(a)) throw new Error(`Unbekanntes Argument: ${a}`);
    if (Object.hasOwn(o, a)) throw new Error(`Argument doppelt: ${a}`);
    if (a === '--wipe-data' || a === '--nur-argumente') o[a] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Wert fehlt: ${a}`);
      o[a] = argv[++i];
    }
  }
  for (const a of ['--api', '--ablauf', '--ausgabe']) if (!o[a]) throw new Error(`Pflichtargument fehlt: ${a}`);
  if (!['36', '30', '24'].includes(o['--api'])) throw new Error('--api muss 36, 30 oder 24 sein.');
  const api = Number(o['--api']);
  const moeglich = api === 24 ? ['installation'] : ['a', 'a8', 'a10', 'b', 'netz', 'navigation', 'dateien', 'menue', 'sicherung', ...(api === 30 ? ['fehlerseite'] : [])];
  const ablauf = o['--ablauf'];
  if (ablauf !== 'alle' && !moeglich.includes(ablauf)) throw new Error(`--ablauf ${ablauf} ist für API ${api} nicht vorgesehen (${[...moeglich, 'alle'].join(', ')}).`);
  return {
    api, ablauf, ausgabe: ausgabePruefen(o['--ausgabe'], repos), wipeData: o['--wipe-data'] === true, nurArgumente: o['--nur-argumente'] === true,
    variantenOrdner: o['--varianten'] ? echterPfad(o['--varianten']) : undefined,
    // A enthält Netz und Navigation bereits; bei alle nicht doppelt ausführen.
    phasen: ablauf === 'alle' ? (api === 24 ? ['installation'] : ['a', 'b', 'dateien', 'menue', 'sicherung', ...(api === 30 ? ['fehlerseite'] : [])]) : ablauf === 'dateien' ? ['dateien', 'sicherung'] : [ablauf],
    debug: resolve(o['--apk-debug'] ?? join(wurzel, 'app/android/app/build/outputs/apk/debug/app-debug.apk')),
    release: resolve(o['--apk-release'] ?? join(wurzel, 'app/android/app/build/outputs/apk/release/app-release-unsigned.apk')),
  };
}

export function websocketPruefen(ws = globalThis.WebSocket) {
  if (typeof ws !== 'function') throw new Error('Der eingebaute WebSocket fehlt. Node 22.23.2 oder 24.21.0 ohne --no-experimental-websocket verwenden.');
}

export function prozess(programm, args, { env = process.env, cwd, timeoutMs = 120000, binary = false, signal } = {}) {
  return new Promise(resolveResult => {
    let child;
    try { child = spawn(programm, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
    catch (e) { resolveResult({ code: null, out: binary ? Buffer.alloc(0) : '', err: e.message }); return; }
    const out = [], err = []; let grund = '', bytes = 0, killPromise;
    function beenden(ursache) {
      if (killPromise) return;
      grund = ursache;
      killPromise = new Promise(fertig => {
        if (process.platform !== 'win32' || !child.pid) { child.kill(); fertig(); return; }
        // Gradle kann trotz --no-daemon einen einzelnen Daemon als Kind starten.
        const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
        const frist = setTimeout(() => { kill.kill(); child.kill(); fertig(); }, 10000);
        kill.on('error', () => { clearTimeout(frist); child.kill(); fertig(); });
        kill.on('close', code => { clearTimeout(frist); if (code !== 0) child.kill(); fertig(); });
      });
    }
    const timer = setTimeout(() => beenden('Zeitüberschreitung'), timeoutMs);
    const unterbrechen = () => beenden('Prozesslauf unterbrochen');
    signal?.addEventListener('abort', unterbrechen, { once: true });
    if (signal?.aborted) unterbrechen();
    child.stdout.on('data', d => { bytes += d.length; if (bytes > 256 * 1024 * 1024) beenden('Ausgabe zu groß'); else out.push(d); });
    child.stderr.on('data', d => { bytes += d.length; if (bytes > 256 * 1024 * 1024) beenden('Ausgabe zu groß'); else err.push(d); });
    child.on('error', e => { grund = e.message; });
    child.on('close', async code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', unterbrechen);
      await killPromise;
      resolveResult({ code: grund ? null : code, out: binary ? Buffer.concat(out) : Buffer.concat(out).toString('utf8'), err: [Buffer.concat(err).toString('utf8'), grund].filter(Boolean).join('\n') });
    });
  });
}

// Jeder Aufräumschritt wird versucht, auch wenn sein Vorgänger fehlschlägt.
export async function aufraeumen(schritte, berichten) {
  for (const [name, fn] of schritte) {
    try { await fn(); berichten(name, null); }
    catch (e) { berichten(name, e); }
  }
}

export async function mitAufraeumen(arbeit, schritte, berichten) {
  try { return await arbeit(); }
  finally { await aufraeumen(schritte, berichten); }
}

export async function netzmelder(datei) {
  const annahmen = [], sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    const e = { zeit: new Date().toISOString(), ersteBytes: '' };
    annahmen.push(e);
    appendFileSync(datei, `${e.zeit} ANNAHME\n`);
    socket.once('data', d => { e.ersteBytes = d.subarray(0, 16).toString('hex'); appendFileSync(datei, `${e.zeit} erste Bytes ${e.ersteBytes}\n`); });
    socket.on('error', () => {});
    const t = setTimeout(() => socket.destroy(), 3000);
    socket.on('close', () => { clearTimeout(t); sockets.delete(socket); });
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  appendFileSync(datei, `Netzmelder hört auf 127.0.0.1:${server.address().port}\n`);
  return { port: server.address().port, annahmen, get count() { return annahmen.length; }, async close() { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); } };
}

export class Cdp {
  constructor(ws) {
    this.ws = ws; this.next = 0; this.pending = new Map(); this.events = []; this.closed = false;
    ws.addEventListener('message', ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { this.close(); return; }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.no(new Error(`CDP ${m.error.code}: ${m.error.message}`)); else p.ok(m.result);
      } else if (m.method) {
        this.events.push({ zeit: new Date().toISOString(), ...m });
        if (m.method === 'Inspector.detached') this.close();
      }
    });
    ws.addEventListener('close', () => this.verwerfen());
  }
  static async connect(url) {
    websocketPruefen();
    return new Promise((ok, no) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); no(new Error('CDP-Verbindung: Zeitüberschreitung')); }, 10000);
      ws.addEventListener('open', () => { clearTimeout(timer); ok(new Cdp(ws)); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); no(new Error('CDP-WebSocket nicht erreichbar')); }, { once: true });
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP-Verbindung geschlossen'));
    return new Promise((ok, no) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id); no(new Error(`CDP-Zeitüberschreitung: ${method}`));
        // Eine veraltete WebView-Seite darf nicht für die nächste Prüfung im
        // Cache bleiben und dort eine weitere Zeitüberschreitung verursachen.
        this.close();
      }, timeoutMs);
      this.pending.set(id, { ok, no, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); no(e); }
    });
  }
  async evaluate(expression, timeoutMs) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`Ausdruck fehlgeschlagen: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  verwerfen() {
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.no(new Error('CDP-Verbindung geschlossen')); }
    this.pending.clear();
  }
  close() { this.verwerfen(); this.ws.close(); }
}

export function schreiber(ausgabe) {
  return (name, wert) => {
    const ziel = resolve(ausgabe, name);
    if (!innen(ausgabe, ziel) || ziel === ausgabe || !innen(ausgabe, echterPfad(ziel))) throw new Error('Ungültiger Ausgabepfad.');
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, typeof wert === 'string' || Buffer.isBuffer(wert) ? wert : `${JSON.stringify(wert, null, 2)}\n`);
    return ziel;
  };
}

export function dateiNoetig(pfad) {
  if (!existsSync(pfad) || !statSync(pfad).isFile()) throw new Error(`Datei fehlt: ${pfad}`);
  return pfad;
}
