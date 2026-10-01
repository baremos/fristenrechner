// SPDX-License-Identifier: Apache-2.0
// Bedienhilfen für die wirkliche Android-Auswahl. Kein Zugriff auf Produktmethoden.
import { createHash } from 'node:crypto';

export const DATEIPROBE = 'org.example.dateiprobe';
export const FORMATE = Object.freeze({
  json: { speichern: 'save-json', teilen: 'share-json', mime: 'application/json;charset=utf-8', label: 'Projekt exportieren', shareLabel: 'Projekt teilen' },
  xlsx: { speichern: 'export-excel', teilen: 'share-excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel exportieren', shareLabel: 'Excel teilen' },
  pdf: { speichern: 'export-pdf', teilen: 'share-pdf', mime: 'application/pdf', label: 'PDF exportieren', shareLabel: 'PDF teilen' },
});
export const quote = s => `'${String(s).replaceAll("'", "'\\''")}'`;
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dekodiere = s => s.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dez) => String.fromCodePoint(parseInt(hex || dez, hex ? 16 : 10))).replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

/** ctx.uiBaum validiert zuvor den vollständigen Baum; hier werden nur Attribute gelesen. */
export function knoten(xml) {
  if (typeof xml !== 'string' || !/^\s*(?:<\?xml[^?]*\?>\s*)?<hierarchy\b/.test(xml) || !/<\/hierarchy>\s*$/.test(xml) || /<!/.test(xml)) throw new Error('Unvollständiger Ansichtsbaum.');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([n]) => {
    const a = {};
    // Werte mit doppelten Anführungszeichen schreibt uiautomator in einfache.
    for (const [, key, doppelt, einfach] of n.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) {
      if (Object.hasOwn(a, key)) throw new Error('Doppeltes Attribut im Ansichtsbaum.');
      a[key] = dekodiere(doppelt ?? einfach);
    }
    return a;
  });
}
export function flaeche(k) {
  const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(k?.bounds || '');
  if (!m) return null;
  const [l, o, r, u] = m.slice(1).map(Number);
  if (![l, o, r, u].every(Number.isSafeInteger) || r <= l || u <= o) return null;
  return { l, o, r, u, x: Math.floor((l + r) / 2), y: Math.floor((o + u) / 2) };
}
export function fokusRichtung(alle, name) {
  const titel = alle.find(k => k.text === name && flaeche(k));
  const fokus = alle.find(k => k.focused === 'true' && /:id\/item_root$/.test(k['resource-id'] || ''));
  const ziel = flaeche(titel), ist = flaeche(fokus);
  if (ziel && ist && ist.o <= ziel.y && ziel.y <= ist.u) return 'KEYCODE_ENTER';
  if (ziel && ist) return ist.o > ziel.y ? 'KEYCODE_DPAD_UP' : 'KEYCODE_DPAD_DOWN';
  // Eine fokussierte Zeile ohne Fläche liegt unter der Navigationsleiste (beobachtet 2026-10-01 auf
  // fr-api30): bei sichtbarem Titel zurück nach oben, sonst weiter nach unten, die Liste rollt schrittweise nach.
  // „Ende“ springt dabei nicht nach: Ein schon fokussierter letzter Eintrag bleibt verdeckt.
  if (fokus && !ist) return ziel ? 'KEYCODE_DPAD_UP' : 'KEYCODE_DPAD_DOWN';
  return 'KEYCODE_DPAD_DOWN';
}
export async function tippe(ctx, k) {
  const p = flaeche(k);
  if (!p || k.enabled === 'false') throw new Error('Bedienelement hat keine betätigbare Fläche.');
  await ctx.shell(`input tap ${p.x} ${p.y}`);
}
export async function warte(ctx, fn, versuche = 20, pause = 500) {
  for (let i = 0; i < versuche; i++) { const wert = await fn(i); if (wert) return wert; await ctx.sleep(pause); }
  throw new Error('Erwarteter Zustand wurde innerhalb der Messfrist nicht erreicht.');
}
export async function oben(ctx) {
  for (let versuch = 0; ; versuch++) {
    const text = await ctx.shell('dumpsys activity activities');
    const zeile = text.split('\n').find(s => /topResumedActivity|mResumedActivity/.test(s));
    if (zeile) return zeile.trim();
    // Während eines Activity-Wechsels fehlt die Zeile kurz (beobachtet 2026-10-01 beim Start der Teilen-Auswahl).
    if (versuch >= 4) throw new Error('Vorderste Activity nicht lesbar.');
    await (ctx.sleep ? ctx.sleep(300) : Promise.resolve());
  }
}
export async function bild(ctx, name) {
  // Der bestehende Rahmen schließt ausschließlich den belegten SystemUI-Dialog mit Wait.
  await ctx.shot(`${name}.png`);
  return ctx.uiBaum(name);
}
export async function auswahl(ctx, name) {
  const xml = await warte(ctx, async i => {
    await ctx.shot(`${name}-warten-${i}.png`);
    const x = await ctx.uiBaum(`${name}-warten-${i}`);
    return /documentsui/.test(x) ? x : null;
  }, 10, 750);
  return xml;
}
async function listenansicht(ctx, xml, name) {
  const liste = knoten(xml).find(k => /documentsui/.test(k.package) && /^(List view|Listenansicht)$/.test(k['content-desc'] || '') && flaeche(k));
  if (liste) { await tippe(ctx, liste); await ctx.sleep(700); return ctx.uiBaum(`${name}-liste`); }
  return xml;
}
export async function wurzel(ctx, xml, name, label) {
  const roots = knoten(xml).find(k => /Show roots|Wurzeln anzeigen|Stammverzeichnisse/i.test(k['content-desc'] || '') && flaeche(k));
  if (!roots) throw new Error('Die Wurzelliste der Android-Auswahl fehlt.');
  await tippe(ctx, roots); await ctx.sleep(700);
  xml = await ctx.uiBaum(`${name}-wurzeln`);
  const ziel = knoten(xml).find(k => k.text === label && k['resource-id'] === 'android:id/title' && /documentsui/.test(k.package) && flaeche(k));
  if (!ziel) throw new Error(`Die Wurzel ${label} fehlt in der Android-Auswahl.`);
  await tippe(ctx, ziel); await ctx.sleep(1000);
  return listenansicht(ctx, await ctx.uiBaum(`${name}-wurzel`), name);
}
/** Listenzeilen werden mit D-Pad fokussiert und erst nach Flächenvergleich geöffnet. */
export async function zeileOeffnen(ctx, name, datei, xml, { schliessen = true } = {}) {
  xml = await listenansicht(ctx, xml, name);
  // Die Auswahl erinnert sich an den letzten Fokus. Pos1 setzt den Fokus auf die erste Zeile und rollt die
  // Liste an den Anfang (beobachtet 2026-10-01 auf fr-api30); eine Wischgeste nähme der Liste den Fokus.
  // Dann vorwärts suchen; kein Tipp auf Zeilen oder Vorschau-Schaltflächen.
  await ctx.shell('input keyevent KEYCODE_MOVE_HOME'); await ctx.sleep(400);
  let letzte = null, unveraendert = 0;
  for (let i = 0; i < 80; i++) {
    xml = await ctx.uiBaum(`${name}-fokus-${i}`);
    const alle = knoten(xml), richtung = fokusRichtung(alle, datei);
    if (richtung === 'KEYCODE_ENTER') {
      await ctx.save(`${name}-zeile.json`, { datei, titel: alle.find(k => k.text === datei && flaeche(k)), fokus: alle.find(k => k.focused === 'true' && /item_root$/.test(k['resource-id'] || '')) });
      await ctx.shot(`${name}-fokus.png`);
      await ctx.shell('input keyevent KEYCODE_ENTER');
      if (schliessen) await warte(ctx, async () => !/documentsui/.test(await oben(ctx)), 20, 500);
      else await ctx.sleep(700);
      return;
    }
    // Bleibt der Baum trotz Taste gleich, hängt die Liste; Ende und Pos1 rollen sie wieder an.
    const signatur = `${richtung}|${alle.find(k => k.focused === 'true')?.bounds}|${alle.filter(k => k['resource-id'] === 'android:id/title').map(k => `${k.text}${k.bounds}`).join(',')}`;
    unveraendert = signatur === letzte ? unveraendert + 1 : 0; letzte = signatur;
    const taste = unveraendert >= 2 ? (unveraendert % 2 ? 'KEYCODE_MOVE_HOME' : 'KEYCODE_MOVE_END') : richtung;
    await ctx.shell(`input keyevent ${taste}`); await ctx.sleep(400);
  }
  throw new Error(`Datei ${datei} ließ sich nicht eindeutig fokussieren.`);
}
export async function oeffnen(ctx, name, datei, root = 'Downloads') {
  let xml = await auswahl(ctx, name);
  xml = await wurzel(ctx, xml, name, root);
  try { await zeileOeffnen(ctx, name, datei, xml); }
  catch (error) {
    if (root !== 'Downloads') throw error;
    // Nicht indizierte Dateien können über den internen Speicher gewählt werden.
    xml = await ctx.uiBaum(`${name}-download-fehlt`);
    const roots = knoten(xml).find(k => /Show roots|Wurzeln anzeigen/i.test(k['content-desc'] || '') && flaeche(k));
    if (!roots) throw error;
    await tippe(ctx, roots); await ctx.sleep(600);
    xml = await ctx.uiBaum(`${name}-geraetespeicher-wurzeln`);
    const geraet = knoten(xml).find(k => k['resource-id'] === 'android:id/title' && /SDK built for|Internal storage|Interner Speicher|Android Emulator/i.test(k.text || '') && flaeche(k));
    if (!geraet) throw error;
    await tippe(ctx, geraet); await ctx.sleep(600);
    await zeileOeffnen(ctx, `${name}-ordner`, 'Download', await ctx.uiBaum(`${name}-geraet`), { schliessen: false });
    await zeileOeffnen(ctx, name, datei, await ctx.uiBaum(`${name}-download`));
  }
}
export async function speichern(ctx, name) {
  let xml = await auswahl(ctx, name);
  // Immer eine definierte lokale Wurzel. Die Auswahl kann noch beim Testprovider stehen.
  xml = await wurzel(ctx, xml, name, 'Downloads');
  const alle = knoten(xml);
  const titel = alle.find(k => k.class === 'android.widget.EditText' && /documentsui/.test(k.package));
  const save = alle.find(k => /documentsui/.test(k.package) && k.class === 'android.widget.Button' && /^(Save|Speichern)$/i.test(k.text) && flaeche(k));
  if (!titel || !save || save.enabled !== 'true') throw new Error('Name oder freigegebene Save-Schaltfläche fehlt.');
  await ctx.save(`${name}-auswahl.json`, { name: titel.text, save });
  await ctx.shot(`${name}-auswahl.png`);
  await tippe(ctx, save);
  await warte(ctx, async () => !/documentsui/.test(await oben(ctx)), 20, 500);
  return titel.text;
}
export async function nativeSchaltflaeche(ctx, name, text, paket, { scroll = false } = {}) {
  for (let i = 0; i < (scroll ? 18 : 1); i++) {
    const xml = await ctx.uiBaum(`${name}-suchen-${i}`);
    const k = knoten(xml).find(k => (k.text === text || k['content-desc'] === text) && (!paket || k.package === paket) && flaeche(k) && k.enabled !== 'false');
    if (k) { await tippe(ctx, k); await ctx.sleep(500); return xml; }
    if (scroll) {
      const rahmen = knoten(xml).map(flaeche).filter(Boolean).sort((a,b) => (b.r-b.l)*(b.u-b.o)-(a.r-a.l)*(a.u-a.o))[0];
      if (!rahmen) break;
      await ctx.shell(`input swipe ${rahmen.x} ${Math.floor(rahmen.u * 0.8)} ${rahmen.x} ${Math.floor(rahmen.u * 0.3)} 450`); await ctx.sleep(300);
    }
  }
  throw new Error(`Schaltfläche ${text} nicht sichtbar oder gesperrt.`);
}

/** Nur im Debug-WebView per Devtools gesetzt; kein Bestandteil der Produkt-App. */
export function brueckenHaken() {
  if (window.__dateien) return 'vorhanden';
  var cap = window.Capacitor;
  if (!cap || typeof cap.toNative !== 'function') throw Error('Capacitor.toNative fehlt');
  var p = window.__dateien = { aufrufe: [], antworten: [], bloecke: {}, gesehen: {} };
  var alt = cap.toNative;
  cap.toNative = function(plugin, methode, optionen) {
    if (plugin === 'Dateiablauf') {
      var o = optionen || {};
      p.aufrufe.push({ methode: methode, optionen: o });
      if (methode === 'ausgabeBlock') (p.bloecke[o.auftragId] || (p.bloecke[o.auftragId] = [])).push(o.base64);
    }
    return alt.apply(this, arguments);
  };
  function merk(r) {
    if (!r || r.pluginId !== 'Dateiablauf') return;
    var id = String(r.callbackId) + ':' + r.methodName;
    if (p.gesehen[id]) return;
    p.gesehen[id] = true;
    p.antworten.push({ methode: r.methodName, success: r.success, data: r.data, error: r.error });
  }
  var altFrom = cap.fromNative;
  cap.fromNative = function(r) { merk(r); return altFrom.apply(this, arguments); };
  if (window.androidBridge && typeof window.androidBridge.onmessage === 'function') {
    var altOn = window.androidBridge.onmessage;
    window.androidBridge.onmessage = function(ev) { try { merk(JSON.parse(ev.data)); } catch (_) {} return altOn.apply(this, arguments); };
  }
  return 'gesetzt';
}
export function lesbarerZustand(storage) {
  var f = document.querySelector('#schedule-form');
  var werte = {};
  Array.from(f ? f.elements : []).forEach(function(e) { if (e.name) werte[e.name] = e.type === 'checkbox' ? e.checked : e.value; });
  var text = function(id) { var e = document.getElementById(id); return e ? e.textContent : null; };
  var gespeicherterText = localStorage.getItem(storage), gespeichert = null;
  try { gespeichert = JSON.parse(gespeicherterText); } catch (_) {}
  return { werte: werte, gespeichert: gespeichert, gespeicherterText: gespeicherterText,
    meldungen: { import: text('import-message'), reset: text('reset-message'), json: text('export-message'), xlsx: text('excel-message'), pdf: text('pdf-message'), speicher: text('storage-status') },
    fokus: document.activeElement && document.activeElement.id,
    aktionenFrei: Array.from(document.querySelectorAll('#open-json,#reset-project,.export-actions button')).every(function(b) { return !b.disabled; }),
    haken: !!window.__dateien, bruecke: window.__dateien || null };
}
export function ausgabeReferenz(zustand, start = 0) {
  const h = zustand.bruecke;
  const beginne = h?.aufrufe.slice(start).filter(a => a.methode === 'ausgabeBeginnen');
  if (beginne?.length !== 1) throw new Error('Kein eindeutiger Ausgabeauftrag an der Brücke.');
  const antwort = h.antworten.filter(a => a.methode === 'ausgabeBeginnen' && a.success).at(-1);
  const id = antwort?.data?.auftragId;
  if (!id || !Array.isArray(h.bloecke[id]) || h.bloecke[id].some(s => typeof s !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))) throw new Error('Ausgabeblöcke fehlen oder sind kein Base64.');
  // Jeder Block ist einzeln kodiert; Padding darf nicht durch Zusammenfügen verschwinden.
  const bytes = Buffer.concat(h.bloecke[id].map(s => Buffer.from(s, 'base64')));
  const o = beginne[0].optionen;
  if (bytes.length !== o.anzahlBytes) throw new Error('Gesammelte Brückenbytes passen nicht zur angekündigten Größe.');
  return { id, bytes, name: o.name, mime: o.mime, sha256: hash(bytes) };
}
