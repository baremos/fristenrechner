#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Native Store-Bilder aus einer frischen Debug-Installation im laufenden fr-api36.
// Import startet weder Prozesse noch einen Emulator. Keine externen Netzaufrufe.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { APP, SERIAL, Cdp, echterPfad, innen, pause, prozess, schreiber, sha256 } from './emulator/rahmen.mjs';
import { ansichtsKnoten, avdName, leseAnsichtsbaum, systemDialog, stelleEinstellungZurueck } from './emulator-lauf.mjs';
import { befund, zusammenfassen, rueckgabewert } from './emulator-auswertung.mjs';
import { scrollruheQuelle } from './browser/emulation.mjs';
import { MENUE_ZIELE, menueOeffnungBestaetigen } from './emulator/menue-ui.mjs';
import { imeSichtbar } from './emulator/menue-auswertung.mjs';

export const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const muss = (wert, grund) => { if (!wert) throw new Error(grund); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class Grenze extends Error {}

// Ausschließlich erfundene Organisations-/Sachangaben; keine Personendaten.
// Reihenfolge: Verordnung, Verfahren, Optionen, danach die festen Fristen.
export const PROBEDATEN = Object.freeze({
  kunde: 'Musterstadt', projektname: 'Beschaffung von IT-Ausstattung', vergabenummer: '2026-0042',
  vergabeordnung: 'vgv', verfahrensart: 'offen', bundesland: 'BE', bekanntmachung: '2026-11-02',
  elektronischeAbgabe: true, ortsbegehung: false, dringlichkeit: false,
  teststellungAktiv: false, praesentationAktiv: false, verhandlungRunde1Aktiv: false, verhandlungRunde2Aktiv: false,
  versandBieterinformation: 'elektronisch', abgabeUhrzeit: '', angebotsaufforderungTermin: '',
  teststellungStart: '', praesentationStart: '', verhandlungRunde1Start: '', verhandlungRunde2Start: '',
  teststellungDauerAT: 5, teststellungAuswertungAT: 3, praesentationDauerAT: 2,
  verhandlungRunde1DauerAT: 3, verhandlungRunde2DauerAT: 3,
  teilnahmeBewertungAT: '', aufforderungVersandAT: 1, zwischenbewertungAT: '', einladungVersandAT: 1,
  vuAnpassungRunde1AT: 2, vuAnpassungRunde2AT: 2, bewertungAT: 10, aufklaerungEntscheidungAT: 5,
  internerZuschlagAT: 3, infoVersandAT: 0, bindefristArt: 'tage', bindefristTage: 60, bindefristTermin: '',
  teilnahmefristKT: '', bewerberfragenVorTeilnahmeKT: '', angebotsfristKT: 30,
  bieterfragenVorAngebotKT: 8, klarstellungVorAngebotKT: 7, optimiertesAngebotKT: '', finalesAngebotKT: '', wartefristKT: 10,
});
export const BILDER = Object.freeze([
  { id: 'formular', bild: '01-formular.png', anker: '#schedule-form', kriterium: 'Formular oben mit Musterstadt, Projektname, Vergabenummer und gewähltem Verfahren; Felder lesbar.' },
  { id: 'terminplan', bild: '02-terminplan.png', anker: '#table-heading', kriterium: 'Terminplantabelle mit Überschrift „Termine und Rechenwege“ und berechneten Terminen lesbar; keine Warnungen oder Konflikte.' },
  { id: 'zeitschiene', bild: '03-zeitschiene.png', anker: '#timeline-heading', kriterium: 'Zeitschiene mit berechneten Terminen lesbar; keine Warnungen oder Konflikte.' },
  { id: 'dateiaktionen', bild: '04-dateiaktionen.png', anker: '#schedule-form', kriterium: 'Bottom Sheet „Dateiaktionen“ geöffnet, Anfang der Aktionsliste und Schließen sichtbar; kein Systemdialog.' },
].map(Object.freeze));

export function argumente(argv, basis = wurzel) {
  const o = {}, flags = ['--nur-argumente', '--auswerten'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    muss([...flags, '--api', '--apk-debug', '--ausgabe'].includes(a), `Unbekanntes Argument: ${a}`);
    muss(!Object.hasOwn(o, a), `Argument doppelt: ${a}`);
    if (flags.includes(a)) o[a] = true;
    else { muss(argv[i + 1] && !argv[i + 1].startsWith('--'), `Wert fehlt: ${a}`); o[a] = argv[++i]; }
  }
  muss(o['--ausgabe'], 'Pflichtargument fehlt: --ausgabe');
  const scratch = echterPfad(join(basis, 'scratchpad')), ausgabe = echterPfad(resolve(basis, o['--ausgabe']));
  muss(innen(echterPfad(basis), scratch) && innen(scratch, ausgabe) && ausgabe !== scratch, 'Ausgabe muss unter scratchpad/ dieses Worktrees liegen.');
  if (o['--auswerten']) {
    muss(!o['--api'] && !o['--apk-debug'] && !o['--nur-argumente'], '--auswerten ist nur mit --ausgabe kombinierbar.');
    return { ausgabe, auswerten: true };
  }
  muss(o['--api'] === '36', '--api muss 36 sein.');
  muss(o['--apk-debug'], 'Pflichtargument fehlt: --apk-debug');
  const debug = echterPfad(resolve(basis, o['--apk-debug']));
  muss(innen(echterPfad(basis), debug) && /\.apk$/i.test(debug), 'Debug-APK muss als .apk in diesem Worktree liegen.');
  return { api: 36, debug, ausgabe, nurArgumente: o['--nur-argumente'] === true, auswerten: false };
}

const einstellungZurueck = (ctx, table, key, wert) => stelleEinstellungZurueck({ ...ctx, sleep: ctx.sleep ?? (async () => {}) }, table, key, wert);

export const DEMO_BEFEHLE = Object.freeze([
  'settings put global sysui_demo_allowed 1',
  'am broadcast -a com.android.systemui.demo --es command enter',
  'am broadcast -a com.android.systemui.demo --es command clock --es hhmm 1000',
  'am broadcast -a com.android.systemui.demo --es command battery --es level 100 --es plugged false',
  'am broadcast -a com.android.systemui.demo --es command network --es wifi show --es level 4 --es fully true --es mobile hide --es airplane hide',
  'am broadcast -a com.android.systemui.demo --es command notifications --es visible false',
]);
export async function demoModus(ctx, arbeit) {
  const beleg = { vorher: {}, befehle: [], wiederherstellung: [], wiederhergestellt: false };
  for (const key of ['sysui_demo_allowed', 'sysui_tuner_demo_on']) {
    beleg.vorher[key] = await ctx.shell(`settings get global ${key}`);
    muss(/^(?:null|0|1)$/.test(beleg.vorher[key]), `Demo-Ausgangszustand ${key} nicht lesbar.`);
  }
  ctx.save('demo-modus.json', beleg);
  if (beleg.vorher.sysui_tuner_demo_on === '1') throw new Grenze('Demo-Modus war bereits aktiv; sein bisheriger Bildinhalt lässt sich nicht rekonstruieren. Nichts geändert.');
  let fehler, ergebnis;
  try {
    for (const befehl of DEMO_BEFEHLE) {
      const schritt = { befehl }; beleg.befehle.push(schritt);
      schritt.antwort = await ctx.shell(befehl);
      if (befehl.startsWith('am broadcast')) muss(/Broadcast completed: result=0/.test(schritt.antwort), 'Demo-Broadcast nicht bestätigt.');
      ctx.save('demo-modus.json', beleg);
    }
    muss(await ctx.shell('settings get global sysui_demo_allowed') === '1', 'Demo-Freigabe nicht wirksam.');
    await ctx.sleep?.(700);
    ergebnis = await arbeit();
  } catch (e) { fehler = e; }
  finally {
    // Ein Signal darf die Wiederherstellung nicht mit dem abgebrochenen
    // Arbeitssignal abbrechen. Derselbe Weg gilt für Fehler im Demo-Setup.
    const restore = { ...ctx, shell: ctx.restoreShell ?? ctx.shell, sleep: ctx.restoreSleep ?? ctx.sleep };
    // Jeder Restore wird auch nach einem gescheiterten vorherigen Schritt versucht.
    for (const [name, fn] of [
      ['demo exit', async () => { const antwort = await restore.shell('am broadcast -a com.android.systemui.demo --es command exit'); muss(/Broadcast completed: result=0/.test(antwort), 'Demo exit nicht bestätigt.'); return antwort; }],
      ...['sysui_tuner_demo_on', 'sysui_demo_allowed'].map(key => [key, () => einstellungZurueck(restore, 'global', key, beleg.vorher[key])]),
    ]) {
      try { beleg.wiederherstellung.push({ name, nachher: await fn(), ok: true }); }
      catch (e) { beleg.wiederherstellung.push({ name, ok: false, fehler: e.message }); }
    }
    beleg.wiederhergestellt = beleg.wiederherstellung.every(s => s.ok);
    ctx.save('demo-modus.json', beleg);
  }
  if (!beleg.wiederhergestellt) throw new Error([fehler?.message, 'Demo-Modus nicht vollständig wiederhergestellt.'].filter(Boolean).join(' '));
  if (fehler) throw fehler;
  return ergebnis;
}

export function aufloesung(text) {
  const physical = /^Physical size: (\d+)x(\d+)\s*$/m.exec(text), override = /^Override size: (\d+)x(\d+)\s*$/m.exec(text);
  muss(physical, 'Physische Auflösung nicht lesbar.');
  const nativ = { breite: Number(physical[1]), hoehe: Number(physical[2]) };
  const wirksam = override ? { breite: Number(override[1]), hoehe: Number(override[2]) } : nativ;
  muss(nativ.breite === 1080 && nativ.hoehe === 2400 && gleich(nativ, wirksam), 'Erwartet wird die native Auflösung 1080 × 2400 ohne abweichende Übersteuerung.');
  return { roh: text, nativ, wirksam };
}

// Keine Bildbearbeitung: Container, Maße und entpackbare Scanlines prüfen.
export function pngPruefen(bytes) {
  muss(Buffer.isBuffer(bytes) && bytes.length > 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Kein PNG.');
  let kopf, ende = false, pos = 8; const idat = [];
  while (pos + 12 <= bytes.length) {
    const n = bytes.readUInt32BE(pos), typ = bytes.toString('ascii', pos + 4, pos + 8);
    muss(pos + n + 12 <= bytes.length, 'PNG abgeschnitten.');
    const d = bytes.subarray(pos + 8, pos + 8 + n);
    if (pos === 8) muss(typ === 'IHDR', 'PNG-Kopf fehlt.');
    if (typ === 'IHDR') {
      muss(!kopf && n === 13 && d[8] === 8 && [2, 6].includes(d[9]) && d[10] === 0 && d[11] === 0 && d[12] === 0, 'PNG-Kodierung nicht unterstützt.');
      kopf = { breite: d.readUInt32BE(0), hoehe: d.readUInt32BE(4), kanaele: d[9] === 6 ? 4 : 3 };
      muss(kopf.breite === 1080 && kopf.hoehe === 2400, 'PNG ist nicht 1080 × 2400 im Hochformat.');
    }
    if (typ === 'IDAT') idat.push(d);
    pos += n + 12;
    if (typ === 'IEND') { muss(n === 0 && pos === bytes.length, 'Ungültiger PNG-Abschluss.'); ende = true; break; }
  }
  muss(kopf && ende && idat.length, 'PNG unvollständig.');
  const zeile = kopf.breite * kopf.kanaele + 1, laenge = zeile * kopf.hoehe;
  const roh = inflateSync(Buffer.concat(idat), { maxOutputLength: laenge });
  muss(roh.length === laenge, 'PNG-Pixellänge weicht ab.');
  for (let y = 0; y < kopf.hoehe; y++) muss(roh[y * zeile] <= 4, 'Ungültiger PNG-Zeilenfilter.');
  return { breite: kopf.breite, hoehe: kopf.hoehe };
}

// Reguläre Formularereignisse statt localStorage-/Produktfunktions-Eingriffen.
export function formularQuelle(daten = PROBEDATEN) {
  return `(() => {
    const f = document.querySelector('#schedule-form'); if (!f) throw Error('Formular fehlt.');
    for (const [name, wert] of Object.entries(${JSON.stringify(daten)})) {
      const e = f.elements.namedItem(name); if (!e) throw Error('Formularfeld fehlt: '+name);
      if (typeof wert === 'boolean') e.checked = wert; else e.value = String(wert);
      e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true}));
    }
    if (!f.checkValidity()) throw Error('Formular ungültig.');
    f.requestSubmit(); document.activeElement?.blur(); return true;
  })()`;
}
const WARNFREI = `(() => {
  const f=document.querySelector('#schedule-form'), ergebnis=document.querySelector('#schedule-results');
  const werte=f && Object.fromEntries(Object.keys(${JSON.stringify(PROBEDATEN)}).map(k=>{const e=f.elements.namedItem(k);return [k,e?.type==='checkbox'?e.checked:e?.value]}));
  const stoerungen=['#result-warnings','#result-konflikte','#app-startfehler','#app-rechtsstand-hinweis'].filter(s=>{const e=document.querySelector(s);return !e||!e.hidden});
  return {werte,stoerungen,ergebnisSichtbar:!!ergebnis&&!ergebnis.hidden,
    zeilen:document.querySelectorAll('#schedule-table-body tr').length,
    meldung:document.querySelector('#form-message')?.textContent,
    speicher:document.querySelector('#storage-status')?.textContent};
})()`;
function formularPruefen(m) {
  muss(m?.ergebnisSichtbar && m.zeilen === 11 && m.stoerungen?.length === 0 && m.meldung === 'Terminplan aktualisiert.'
    && m.speicher === 'Zuletzt automatisch gespeichert: gerade eben.', 'Ergebnis, Speichern oder Warnungsfreiheit nicht bestätigt.');
  muss(Object.entries(PROBEDATEN).every(([k, v]) => m.werte?.[k] === (typeof v === 'boolean' ? v : String(v))), 'Formular weicht von den festen Probedaten ab.');
}

// streng: jede ungültige Probe ist ein Fehler (Nachprüfung nach der Aufnahme).
// Sonst setzt eine ungültige Probe nur die Zählung zurück (Stabilisierung vor der Aufnahme).
export async function layoutruhe(c, selector, { streng = false } = {}) {
  const messung = `(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Anker fehlt');const r=e.getBoundingClientRect();
    return {x:scrollX,y:scrollY,breite:innerWidth,hoehe:innerHeight,dichte:devicePixelRatio,dokumentHoehe:document.documentElement.scrollHeight,
      anker:{x:r.x,y:r.y,breite:r.width,hoehe:r.height},bodyTop:document.body.style.top,
      menueUnterkante:document.querySelector('.fr-menue-leiste').getBoundingClientRect().bottom,
      innereRollstaende:[...document.querySelectorAll('.table-scroll,.fr-menue-liste')].map(e=>({x:e.scrollLeft,y:e.scrollTop}))};})()`;
  const proben = [], start = Date.now(); let letzte, stabil = 0, letzterMangel, referenzScroll;
  await c.evaluate('document.fonts.ready.then(()=>true)');
  while (Date.now() - start < 5000) {
    const scroll = await c.evaluate(scrollruheQuelle, 4000), lage = await c.evaluate(messung);
    // Eine einzelne Probe während des Rollens oder vor der Layoutruhe zählt nicht;
    // erst drei gleiche, gültige Proben in Folge bestätigen den Rollstand.
    const gueltig = scroll?.bestaetigt && [lage.x, lage.y, lage.breite, lage.hoehe, lage.dichte, lage.dokumentHoehe, ...Object.values(lage.anker)].every(Number.isFinite)
      && lage.breite > 0 && lage.hoehe > 0 && lage.anker.breite > 0 && lage.anker.hoehe > 0
      && lage.anker.y >= lage.menueUnterkante - 1 && lage.anker.y < lage.hoehe;
    // Streng: Auch eine Bewegung, die wieder zur Ausgangslage zurückkehrt, verwirft die Aufnahme.
    // Maßstab ist das erste Einzelbild der ersten Scrollruhe-Messung: jedes spätere Einzelbild
    // jeder Messung, jede Lageprobe und der Rollstand der Lageprobe müssen damit übereinstimmen;
    // so bleibt auch eine Bewegung zwischen zwei Messungen nicht unbemerkt. Leere Messungen zählen als Fehler.
    let bewegt = false;
    if (streng) {
      if (!Array.isArray(scroll?.proben) || scroll.proben.length === 0) bewegt = true;
      else {
        referenzScroll ??= scroll.proben[0];
        bewegt = scroll.proben.some(q => q.offen !== 0 || ['x', 'y', 'breite', 'hoehe'].some(k => q[k] !== referenzScroll[k]))
          || lage.x !== referenzScroll.x || lage.y !== referenzScroll.y
          || (letzte !== undefined && !gleich(letzte, lage));
      }
    }
    if (!gueltig || bewegt) {
      letzterMangel = { lage, scroll }; letzte = undefined; stabil = 0; proben.push({ lage, scroll, stabil, ungueltig: true });
      if (streng) {
        const fehler = new Error(`${bewegt && gueltig ? 'Bewegung nach der Aufnahme beobachtet' : 'Scroll-/Layoutmessung nach der Aufnahme ungültig oder Anker verdeckt'}: ${JSON.stringify({ lage, scroll })}`);
        fehler.proben = proben; throw fehler;
      }
    } else {
      stabil = gleich(letzte, lage) ? stabil + 1 : 1;
      proben.push({ lage, scroll, stabil });
      if (stabil >= 3) return { bestaetigt: true, erforderlicheProben: 3, pauseMs: 50, dauerMs: Date.now() - start, lage, proben };
      letzte = lage;
    }
    await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,50))))');
  }
  const fehler = new Error(letzterMangel
    ? `Scroll-/Layoutmessung ungültig oder Anker verdeckt: ${JSON.stringify(letzterMangel)}`
    : `Layout nicht zur Ruhe gekommen: ${JSON.stringify(proben.slice(-3))}`);
  fehler.proben = proben; throw fehler;
}

export function sichtvorlage(bilder) {
  // Schema 2 übernimmt Prüfvermerke und Hashbindung der Browserprüfung.
  // Eigene Belegart: ganze Gerätebilder einschließlich Systemleisten, keine Elementausschnitte.
  return { schema: 2, art: 'store-screenshots', beurteilt: 'Die unveränderten Gerätevollbilder einschließlich Statusleiste (10:00, Akku 100 %, WLAN, keine Benachrichtigungen), ohne Tastatur, Dialog oder private Daten.',
    anleitung: { ausfuellen: 'Nur ergebnis, wer, wann, bemerkung ändern. Alle Belege unverändert lassen.', ergebnis: ['bestanden', 'nicht bestanden'], wer: 'Prüfperson (Pflicht).', wann: 'Datum JJJJ-MM-TT oder ISO-Zeit in UTC (Pflicht).', bemerkung: 'Begründung, einschließlich Statusleiste und Lesbarkeit (Pflicht).' },
    pruefungen: bilder.map(({ id, bild, kriterium, sha256 }) => ({ id, bild, kriterium, sha256, belegart: 'Gerätevollbild', vollbild: { datei: bild, sha256 }, ergebnis: 'Sichtprüfung ausstehend', wer: '', wann: '', bemerkung: '' })) };
}
export function auswertung(p, sicht) {
  let befunde = [];
  try {
    muss(p?.schema === 1 && p.art === 'store-screenshots' && Array.isArray(p.befund), 'Protokollform ungültig.');
    befunde = [...p.befund];
    if (p.abbruch) {
      muss(['ungültig', 'dokumentierte Grenze'].includes(p.abbruch.status), 'Abbruchstatus ungültig.');
      befunde.push(p.abbruch);
    } else {
      muss(p.api === 36 && p.avd === 'fr-api36' && p.aufloesung?.wirksam?.breite === 1080 && p.aufloesung?.wirksam?.hoehe === 2400
        && /^[a-f0-9]{64}$/.test(p.apk?.sha256 ?? '') && ['node', 'adb', 'emulator'].every(k => typeof p.werkzeuge?.[k] === 'string' && p.werkzeuge[k].trim())
        && gleich(p.probedaten, PROBEDATEN) && Number.isFinite(p.dauerMs) && p.dauerMs >= 0 && p.demo?.wiederhergestellt === true, 'Protokoll unvollständig.');
      muss(Array.isArray(p.bilder) && p.bilder.length === BILDER.length, 'Vier Bildbelege fehlen.');
      for (const [i, b] of p.bilder.entries()) {
        muss(Object.entries(BILDER[i]).every(([k, v]) => b[k] === v) && /^[a-f0-9]{64}$/.test(b.sha256 ?? '')
          && b.breite === 1080 && b.hoehe === 2400 && b.rollstand?.bestaetigt === true
          && Number.isFinite(b.rollstand.lage?.x) && Number.isFinite(b.rollstand.lage?.y) && Number.isFinite(b.dauerMs) && b.dauerMs >= 0, 'Bildprotokoll ungültig.');
      }
      const original = sichtvorlage(p.bilder);
      muss(sicht?.schema === 2 && sicht.art === original.art && sicht.pruefungen?.length === BILDER.length, 'Sichtprüfung fehlt oder hat ein falsches Schema.');
      for (const [i, v] of sicht.pruefungen.entries()) {
        const { ergebnis, wer, wann, bemerkung, ...beleg } = v;
        const { ergebnis: _e, wer: _w, wann: _d, bemerkung: _b, ...erwartet } = original.pruefungen[i];
        muss(gleich(beleg, erwartet), 'Sichtbeleg verändert.');
        muss(['bestanden', 'nicht bestanden', 'Sichtprüfung ausstehend'].includes(ergebnis), 'Unbekannter Sichtstatus.');
        if (ergebnis === 'Sichtprüfung ausstehend') muss(wer === '' && wann === '' && bemerkung === '', 'Unvollständiger Sichtvermerk.');
        else muss([wer, bemerkung].every(t => typeof t === 'string' && t.trim() && t.length <= 4000 && !/[\u0000-\u001f\u007f]/.test(t))
          && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(wann ?? '') && Number.isFinite(Date.parse(wann)) && new Date(wann).toISOString().slice(0, 10) === wann.slice(0, 10), 'Sichtvermerk braucht Prüfperson, gültiges Datum und Bemerkung.');
        befunde.push({ id: v.id, ...befund(ergebnis, ergebnis === 'Sichtprüfung ausstehend' ? v.kriterium : bemerkung) });
      }
    }
  } catch (e) { befunde.push(befund('ungültig', e.message)); }
  return { befund: befunde, gesamt: zusammenfassen(befunde), rueckgabewert: rueckgabewert(befunde) };
}

export function nachauswerten(ordner) {
  const lesen = name => {
    const pfad = join(ordner, name);
    muss(lstatSync(pfad).isFile() && !lstatSync(pfad).isSymbolicLink() && echterPfad(dirname(pfad)) === echterPfad(ordner), 'Beleg ist keine reguläre Datei im Laufordner.');
    return readFileSync(pfad);
  };
  const p = JSON.parse(lesen('protokoll.json'));
  if (!p.abbruch) {
    for (const b of BILDER) { const bytes = lesen(b.bild); pngPruefen(bytes); muss(p.bilder?.find(x => x.bild === b.bild)?.sha256 === hash(bytes), 'Bildprüfsumme verändert.'); }
    muss(gleich(p.demo, JSON.parse(lesen('demo-modus.json'))), 'Demo-Beleg verändert.');
  }
  const ergebnis = auswertung(p, p.abbruch ? undefined : JSON.parse(lesen('sichtpruefung.json')));
  schreiber(ordner)('auswertung.json', ergebnis); return ergebnis;
}

async function verbinden(ctx, connect, getJson, forwards) {
  let socket;
  for (let i = 0; i < 25; i++) {
    const pid = await ctx.shell(`pidof ${APP}`), unix = await ctx.shell('cat /proc/net/unix');
    if (/^\d+$/.test(pid) && new RegExp(`@webview_devtools_remote_${pid}\\b`).test(unix)) { socket = `webview_devtools_remote_${pid}`; break; }
    await ctx.sleep(500);
  }
  muss(socket, 'Kein Devtools-Socket der Debug-WebView.');
  const port = (await ctx.adb(['forward', 'tcp:0', `localabstract:${socket}`])).out.trim();
  muss(/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536, 'ADB-Weiterleitung nicht bestätigt.'); forwards.add(port);
  let seite;
  for (let i = 0; i < 10; i++) {
    try {
      const liste = await getJson(`http://127.0.0.1:${port}/json/list`);
      const seiten = Array.isArray(liste) ? liste.filter(s => s.type === 'page' && /^https?:\/\/localhost\//.test(s.url)) : [];
      if (seiten.length === 1) { seite = seiten[0]; break; }
    } catch { /* WebView startet noch. */ }
    await ctx.sleep(500);
  }
  muss(seite && /^[A-Za-z0-9_-]+$/.test(seite.id), 'Keine eindeutige lokale App-Seite.');
  // Niemals eine vom Ziel gelieferte fremde WebSocket-Adresse verwenden.
  const c = await connect(`ws://127.0.0.1:${port}/devtools/page/${seite.id}`);
  try { await c.send('Runtime.enable'); ctx.save('cdp.json', { socket, port, id: seite.id, url: seite.url }); return c; }
  catch (e) { c.close(); throw e; }
}

export async function lauf(o, { run = prozess, connect = url => Cdp.connect(url), sleep = pause,
  getJson = async url => { const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3000) }); muss(r.ok, 'CDP-Zielliste fehlt.'); return r.json(); },
} = {}) {
  muss(!existsSync(o.ausgabe) || readdirSync(o.ausgabe).length === 0, 'Ausgabeordner ist nicht leer.');
  mkdirSync(o.ausgabe, { recursive: true });
  const save = schreiber(o.ausgabe), tmp = join(o.ausgabe, 'tmp'); mkdirSync(tmp);
  const env = { ...process.env, TEMP: tmp, TMP: tmp, ASTRO_TELEMETRY_DISABLED: '1', CI: '1' };
  const sdk = join(process.env.LOCALAPPDATA ?? '', 'fristenrechner/android-sdk');
  const adbExe = join(sdk, 'platform-tools/adb.exe'), emulatorExe = join(sdk, 'emulator/emulator.exe');
  const buildTools = JSON.parse(readFileSync(join(wurzel, 'scripts/toolchain.json'), 'utf8')).android.buildTools;
  const aapt = join(sdk, 'build-tools', buildTools, 'aapt2.exe');
  const start = Date.now(), p = { schema: 1, art: 'store-screenshots', beginn: new Date().toISOString(), api: o.api, seriennummer: SERIAL,
    werkzeuge: { node: process.version }, probedaten: PROBEDATEN, bilder: [], befund: [], aufraeumen: [], befehle: [],
    grenzen: ['Die Sichtprüfung beurteilt Bildinhalt und bereinigte Systemleisten. Broadcast-Erfolg allein belegt keine Pixel.',
      'Bytegleichheit ist erst durch Wiederholung prüfbar. WebView, Systemabbild, Dichte, Navigation, Sprach-/Zeiteinstellungen und Rasterung können Pixel ändern; Versionen und Geometrie werden festgehalten.',
      'Keine Freigabe zur Veröffentlichung. Kein Nachweis für andere Geräte oder Release-Builds.'] };
  let c, installBegonnen = false, cleaning = false; const forwards = new Set(), restores = [], controller = new AbortController();
  const signal = () => controller.abort(); process.once('SIGINT', signal); process.once('SIGTERM', signal);
  const ctx = { save, sleep: async ms => { if (controller.signal.aborted && !cleaning) throw new Error('Lauf unterbrochen.'); await sleep(ms); },
    async command(exe, args, opt = {}) {
      const { aufraeumen = false, erlaubteCodes = [0], ...prozessOpt } = opt;
      if (controller.signal.aborted && !cleaning && !aufraeumen) throw new Error('Lauf unterbrochen.');
      const r = await run(exe, args, { cwd: wurzel, env, timeoutMs: 30000, signal: cleaning || aufraeumen ? undefined : controller.signal, ...prozessOpt });
      p.befehle.push({ werkzeug: exe, args, code: r.code, out: opt.binary ? { bytes: r.out.length, sha256: hash(r.out) } : r.out, err: r.err }); save('protokoll.json', p);
      muss(erlaubteCodes.includes(r.code), `Befehl fehlgeschlagen (${r.code}): ${args.join(' ')}: ${r.err}`); return r;
    },
    // Der vorhandene Baumleser akzeptiert 137 nur mit anschließend vollständig
    // lesbarer XML-Datei; nie allein wegen des Rückgabewerts.
    adb: (args, opt) => ctx.command(adbExe, ['-s', SERIAL, ...args], {
      erlaubteCodes: args[0] === 'shell' && args[1]?.startsWith('uiautomator dump ') ? [0, 137] : [0], ...opt,
    }),
    shell: async (cmd, opt) => (await ctx.adb(['shell', cmd], opt)).out.replaceAll('\r\n', '\n').trim(),
    restoreShell: async cmd => ctx.shell(cmd, { aufraeumen: true }), restoreSleep: sleep,
  };
  const cleanup = async (name, fn) => {
    try { await fn(); p.aufraeumen.push({ name, ok: true }); }
    catch (e) { p.aufraeumen.push({ name, ok: false, fehler: e.message }); p.befund.push(befund('ungültig', `Aufräumen: ${name}: ${e.message}`)); }
  };
  try {
    muss([22, 24].includes(Number(process.versions.node.split('.')[0])), 'Node 22 oder 24 erforderlich.');
    muss(existsSync(o.debug) && lstatSync(o.debug).isFile(), 'Debug-APK fehlt.');
    p.apk = { datei: o.debug, sha256: sha256(o.debug) };
    p.werkzeuge.adb = (await ctx.command(adbExe, ['version'])).out.trim();
    p.werkzeuge.emulator = (await ctx.command(emulatorExe, ['-version'])).out.trim();
    p.avd = avdName((await ctx.adb(['emu', 'avd', 'name'])).out);
    muss(p.avd === 'fr-api36' && await ctx.shell('getprop ro.kernel.qemu') === '1' && await ctx.shell('getprop ro.build.version.sdk') === '36'
      && await ctx.shell('getprop sys.boot_completed') === '1', 'Nur der vollständig gestartete Emulator fr-api36 mit API 36 ist zulässig.');
    p.aufloesung = aufloesung(await ctx.shell('wm size'));
    p.umgebung = {};
    for (const [name, befehl] of Object.entries({ dichte: 'wm density', fingerprint: 'getprop ro.build.fingerprint', webview: 'dumpsys webviewupdate', sprache: 'getprop persist.sys.locale', zeitzone: 'getprop persist.sys.timezone', zeit: 'date', navigation: 'settings get secure navigation_mode' })) p.umgebung[name] = await ctx.shell(befehl);
    muss((await ctx.command(aapt, ['dump', 'packagename', o.debug])).out.trim() === APP, 'APK gehört nicht zum erwarteten Paket.');
    muss(/application-debuggable/.test((await ctx.command(aapt, ['dump', 'badging', o.debug])).out), 'APK ist kein Debug-Build.');
    muss(!(await ctx.shell(`pm list packages ${APP}`)).split('\n').includes(`package:${APP}`), 'App ist bereits installiert. Für bereinigte Probedaten wird ein Emulator ohne vorhandene App-Installation benötigt; nichts überschrieben.');
    p.einstellungen = [];
    for (const [table, key, wert] of [['system', 'font_scale', '1.0'], ['system', 'accelerometer_rotation', '0'], ['system', 'user_rotation', '0'], ['system', 'time_12_24', '24']]) {
      const vorher = await ctx.shell(`settings get ${table} ${key}`);
      muss(/^(?:null|-?\d+(?:\.\d+)?)$/.test(vorher), `Einstellung ${key} unlesbar.`);
      p.einstellungen.push({ table, key, vorher, gesetzt: wert });
      restores.push([key, () => einstellungZurueck(ctx, table, key, vorher)]);
      await ctx.shell(`settings put ${table} ${key} ${wert}`);
      const nachher = await ctx.shell(`settings get ${table} ${key}`);
      muss(Number(nachher) === Number(wert), `Einstellung ${key} nicht wirksam.`);
    }
    const nacht = /Night mode: (auto|no|yes|custom)/i.exec(await ctx.shell('cmd uimode night'))?.[1]?.toLowerCase();
    muss(nacht, 'Nachtmodus nicht lesbar.'); p.umgebung.nacht = nacht;
    restores.push(['Nachtmodus', async () => { await ctx.shell(`cmd uimode night ${nacht}`); muss(new RegExp(`Night mode: ${nacht}\\b`, 'i').test(await ctx.shell('cmd uimode night')), 'Nachtmodus nicht wiederhergestellt.'); }]);
    await ctx.shell('cmd uimode night no');
    await demoModus(ctx, async () => {
      installBegonnen = true;
      const install = await ctx.adb(['install', o.debug], { timeoutMs: 180000 }); muss(/^Success\s*$/m.test(install.out), 'Installation nicht bestätigt.');
      const startAntwort = await ctx.shell(`am start -W -n ${APP}/.MainActivity`); muss(/^Status: ok\s*$/m.test(startAntwort), 'App-Start nicht bestätigt.');
      await ctx.sleep(1500); c = await verbinden(ctx, connect, getJson, forwards);
      let bereit = false;
      for (let i = 0; i < 30; i++) { bereit = await c.evaluate(`!!document.querySelector(${JSON.stringify(MENUE_ZIELE.knopf)}) && !!document.querySelector('#schedule-form [type="submit"]')`); if (bereit) break; await ctx.sleep(300); }
      muss(bereit, 'Oberfläche nicht bereit.');
      await c.evaluate(formularQuelle());
      for (let i = 0; i < 30; i++) { p.formular = await c.evaluate(WARNFREI); if (p.formular.speicher === 'Zuletzt automatisch gespeichert: gerade eben.' && p.formular.zeilen === 11) break; await ctx.sleep(200); }
      formularPruefen(p.formular); save('formular.json', p.formular);
      for (const bild of BILDER) {
        const beginn = Date.now();
        await c.evaluate(`(() => { document.activeElement?.blur();document.querySelector(${JSON.stringify(bild.anker)}).scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});document.querySelectorAll('.table-scroll').forEach(e=>e.scrollLeft=0);return true;})()`);
        // scrollIntoView allein landete zwischen zwei Läufen um neun Gerätepixel verschieden. Der Rollstand wird deshalb
        // aus Ankerlage und Leistenunterkante fest abgeleitet (Anker 12 CSS-Pixel unter der Leiste) und auf Gerätepixel gerundet.
        const ruhe = await c.evaluate(scrollruheQuelle, 4000); muss(ruhe?.bestaetigt === true, 'Scrollruhe vor dem Rollziel nicht bestätigt.');
        const rollziel = await c.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(bild.anker)}); const unten=document.querySelector('.fr-menue-leiste').getBoundingClientRect().bottom;
          const ziel=Math.max(0, Math.round((e.getBoundingClientRect().top + window.scrollY - unten - 12) * devicePixelRatio) / devicePixelRatio);
          window.scrollTo({ top: ziel, left: 0, behavior: 'instant' }); return ziel; })()`);
        muss(Number.isFinite(rollziel) && rollziel >= 0, 'Rollziel nicht bestimmbar.');
        if (bild.id === 'dateiaktionen') {
          await layoutruhe(c, bild.anker);
          await c.evaluate(`document.querySelector(${JSON.stringify(MENUE_ZIELE.knopf)}).click()`);
          const sheet = await menueOeffnungBestaetigen(ctx, c); muss(sheet && !sheet.hidden && sheet.liste.scrollTop === 0, 'Dateiaktionen nicht geöffnet.');
          save('dateiaktionen.json', sheet);
        }
        const selector = bild.id === 'dateiaktionen' ? '.fr-menue-overlay [role="dialog"]' : bild.anker;
        const xml = await leseAnsichtsbaum(ctx, bild.id, { timeoutMs: 15000 });
        const activity = await ctx.shell('dumpsys activity activities'); save(`${bild.id}-activity.txt`, activity);
        muss(!systemDialog({ xml, activity }) && ansichtsKnoten(xml)?.some(k => k.package === APP && k.class === 'android.webkit.WebView'), 'App-WebView fehlt oder Systemdialog verdeckt sie.');
        const fensterPruefen = async suffix => {
          // Der vollständige Dump enthält mCurrentFocus; "window windows"
          // liefert auf API 36 nur imeInputTarget und reicht hier nicht.
          const fenster = await ctx.shell('dumpsys window'), tastatur = await ctx.shell('dumpsys input_method');
          save(`${bild.id}-${suffix}-fenster.txt`, fenster); save(`${bild.id}-${suffix}-tastatur.txt`, tastatur);
          muss(new RegExp(`mCurrentFocus=Window\\{[^\\r\\n]*\\b${APP.replaceAll('.', '\\.')}/`).test(fenster), 'App hat nicht den nativen Fensterfokus.');
          muss(!imeSichtbar(tastatur), 'Tastatur ist sichtbar.');
        };
        await fensterPruefen('vorher');
        const vor = await layoutruhe(c, selector);
        formularPruefen(await c.evaluate(WARNFREI));
        const r = await ctx.adb(['exec-out', 'screencap', '-p'], { binary: true }), masse = pngPruefen(r.out);
        await fensterPruefen('nachher');
        const nach = await layoutruhe(c, selector, { streng: true }); muss(gleich(vor.lage, nach.lage), 'Layout während der Aufnahme verändert.');
        save(bild.bild, r.out);
        p.bilder.push({ ...bild, ...masse, sha256: hash(r.out), rollziel, rollstand: vor, nachher: nach, dauerMs: Date.now() - beginn }); save('protokoll.json', p);
      }
      save('sichtpruefung.json', sichtvorlage(p.bilder));
    });
  } catch (e) {
    p.abbruch = befund(e instanceof Grenze ? 'dokumentierte Grenze' : 'ungültig', e.message);
    if (Array.isArray(e.proben)) p.abbruchProben = e.proben;
  }
  finally {
    cleaning = true;
    await cleanup('CDP schließen', async () => { c?.close(); });
    for (const port of forwards) await cleanup(`Weiterleitung ${port}`, () => ctx.adb(['forward', '--remove', `tcp:${port}`]));
    if (installBegonnen) await cleanup('Eigene Debug-Installation entfernen', async () => {
      const pfade = await ctx.shell(`pm path ${APP}`);
      if (!pfade) throw new Error('Installationsversuch ohne lesbaren Paketpfad; Zustand bitte prüfen.');
      // Android ab 11 legt Installationen unter /data/app/~~<Kennung>==/<Paket>-<Kennung>==/base.apk ab; die Tilde gehört zum Pfad.
      const treffer = /^package:(\/data\/app\/[A-Za-z0-9_+=.~/-]+\/base\.apk)$/.exec(pfade); muss(treffer && !treffer[1].includes('/../'), 'Installierte APK nicht eindeutig.');
      const bytes = (await ctx.adb(['exec-out', 'cat', treffer[1]], { binary: true })).out;
      muss(hash(bytes) === p.apk.sha256, 'Installiertes Paket ist nicht die eigene APK; bleibt unberührt.');
      const r = await ctx.adb(['uninstall', APP]); muss(/^Success\s*$/m.test(r.out), 'Deinstallation nicht bestätigt.');
      muss(!(await ctx.shell(`pm list packages ${APP}`)).split('\n').includes(`package:${APP}`), 'Paket nach Deinstallation noch vorhanden.');
    });
    for (const [name, fn] of restores.reverse()) await cleanup(name, fn);
    process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
    if (existsSync(join(o.ausgabe, 'demo-modus.json'))) p.demo = JSON.parse(readFileSync(join(o.ausgabe, 'demo-modus.json'), 'utf8'));
    p.ende = new Date().toISOString(); p.dauerMs = Date.now() - start; save('protokoll.json', p);
  }
  const ergebnis = auswertung(p, existsSync(join(o.ausgabe, 'sichtpruefung.json')) ? JSON.parse(readFileSync(join(o.ausgabe, 'sichtpruefung.json'), 'utf8')) : undefined);
  save('auswertung.json', ergebnis); return ergebnis;
}

export async function main(argv, { laufFn = lauf, log = console.log, error = console.error } = {}) {
  try {
    const o = argumente(argv);
    if (o.nurArgumente) { log(JSON.stringify(o, null, 2)); return 0; }
    const ergebnis = o.auswerten ? nachauswerten(o.ausgabe) : await laufFn(o);
    log(`${ergebnis.gesamt.status}; Rückgabewert ${ergebnis.rueckgabewert}; ${o.ausgabe}`); return ergebnis.rueckgabewert;
  } catch (e) { error(e.message); return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
