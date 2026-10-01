// SPDX-License-Identifier: Apache-2.0
// C5: Rohbelege aus wirklichen Dateiwegen auf dem exklusiven Testemulator.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { formularWerte, quellvertrag, datumBefehl } from './oberflaeche.mjs';
import { signiereRelease } from './bauen.mjs';
import { mitDateienNetz } from './dateien-netz.mjs';
import { evaluiereDateiFall } from '../emulator-auswertung.mjs';
import { dateiFallId, pruefeDateienAbdeckung } from './dateien-auswertung.mjs';
import { DATEIPROBE, FORMATE, hash, quote, knoten, flaeche, tippe, warte, oben, bild,
  auswahl, oeffnen, speichern, nativeSchaltflaeche, brueckenHaken, lesbarerZustand, ausgabeReferenz } from './dateien-ui.mjs';

const GRENZE = 1_048_576;
const DIALOG = { frage: 'Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?', abbrechen: 'Abbrechen', bestaetigen: 'Zurücksetzen' };
const safeName = s => /^[A-Za-z0-9_-]+$/.test(s);
const gleiche = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function gepolsterteProjektdatei(basis, bytes) {
  if (!Buffer.isBuffer(basis) || !Number.isSafeInteger(bytes) || bytes < basis.length || bytes > GRENZE + 1) throw new Error('Ungültige Größe der Projektprobe.');
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(basis));
  return Buffer.concat([basis, Buffer.alloc(bytes - basis.length, 0x20)]);
}
export function neueDownloads(vorher, nachher) {
  if (![vorher, nachher].every(a => Array.isArray(a) && a.every(s => typeof s === 'string' && s && !/[\r\n/\\\0]/.test(s) && s !== '.' && s !== '..'))) throw new Error('Unlesbare Download-Liste.');
  return nachher.filter(s => !vorher.includes(s));
}
export function altereFreigabe(xml, id, zeit) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isSafeInteger(zeit) || zeit <= 0) throw new Error('Ungültige Alterungsprobe.');
  const re = new RegExp(`(<long name="${id}" value=")(\\d+)("\\s*/>)`, 'g');
  if ([...xml.matchAll(re)].length !== 1) throw new Error('Freigabe nicht eindeutig in der Präferenzdatei.');
  return xml.replace(re, (_, a, _b, c) => `${a}${zeit}${c}`);
}
export function dateiDeskriptor(bytes, name, mime, quelle, datei) {
  return { name, mime, bytes: bytes.length, sha256: hash(bytes), base64: bytes.toString('base64'), ...(quelle ? { quelle } : {}), ...(datei ? { datei } : {}) };
}
/** Unabhängige Formular- und Speicherwerte; kein Erfolg nur aus einer Statuszeile. */
export function projektWerte(quelle, { formular = false, nurKopf = false } = {}) {
  const kopf = formular ? quelle : quelle?.projekt;
  const result = Object.fromEntries(['kunde', 'projektname', 'vergabenummer'].map(k => [k, kopf?.[k] ?? '']));
  if (!nurKopf) for (const k of ['vergabeordnung', 'verfahrensart', 'bundesland', 'bekanntmachung']) result[k] = quelle?.[k] ?? '';
  return result;
}
export function dokumentMetadaten(roh, name) {
  const zeilen = String(roh).split('\n').filter(z => /^Row: \d+ /.test(z));
  if (zeilen.length !== 1) throw new Error('Zielmetadaten sind nicht eindeutig lesbar.');
  const mime = /(?:^|, )mime_type=([^,\r\n]+)/.exec(zeilen[0])?.[1];
  const bytes = /(?:^|, )_size=(\d+)(?:,|$)/.exec(zeilen[0])?.[1];
  const n = /_display_name=(.*?)(?:, mime_type=|, _size=|$)/.exec(zeilen[0])?.[1];
  if (n !== name || !mime || bytes === undefined) throw new Error('Name, MIME oder Größe des tatsächlichen Ziels fehlen.');
  return { name: n, mime, bytes: Number(bytes) };
}

/** Die feste Uhr gilt nur für die externe Debugmessung, nicht für Produktquellen. */
export function festeUhr(iso) {
  var Original = window.__dateiOriginalDate || Date;
  window.__dateiOriginalDate = Original;
  var wert = Original.parse(iso);
  if (!isFinite(wert)) throw Error('Ungültige Messzeit');
  function MessDatum() {
    var a = Array.prototype.slice.call(arguments);
    if (!(this instanceof MessDatum)) return new Original(wert).toString();
    return a.length ? new (Function.prototype.bind.apply(Original, [null].concat(a)))() : new Original(wert);
  }
  MessDatum.prototype = Original.prototype;
  MessDatum.parse = Original.parse; MessDatum.UTC = Original.UTC; MessDatum.now = function() { return wert; };
  window.Date = MessDatum;
  return { iso: new Date().toISOString(), tag: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0') };
}

export class Sitzung {
  constructor(ctx, roh, variante, prefix, quelle) { this.ctx = ctx; this.roh = roh; this.variante = variante; this.prefix = prefix; this.quelle = quelle; this.dateien = new Set(); this.zeit = null; }
  async verbinden(neu = false) {
    this.c = await this.ctx.cdp(this.ctx.app, { neu });
    await this.c.evaluate(`(${brueckenHaken.toString()})()`);
    if (!this.zeit) this.zeit = await this.c.evaluate('new Date().toISOString()');
    this.uhr = await this.c.evaluate(`(${festeUhr.toString()})(${JSON.stringify(this.zeit)})`);
    return this.c;
  }
  async zustand(name) {
    const z = await this.c.evaluate(`(${lesbarerZustand.toString()})(${JSON.stringify(this.quelle.storage)})`);
    if (!z || !z.werte || !z.gespeichert) throw new Error('Formular oder gespeicherter Projektstand fehlt.');
    if (name) await this.ctx.save(`${name}-zustand.json`, z);
    return z;
  }
  async fuellen(werte = {}) {
    const w = { ...formularWerte, projektname: `${this.prefix} ä € 😀`, vergabenummer: this.prefix, ...werte };
    await this.c.evaluate(`(function(){var f=document.querySelector('#schedule-form');if(!f)throw Error('Formular fehlt');var w=${JSON.stringify(w)};Object.keys(w).forEach(function(n){var e=f.elements.namedItem(n);if(!e)throw Error('Feld fehlt '+n);e.value=w[n];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});if(!f.checkValidity())throw Error('Formular ungültig');f.querySelector('button[type="submit"]').click();return true;})()`);
    await this.ctx.sleep(1500);
  }
  async klick(id) {
    await this.c.evaluate(`(function(){var b=document.getElementById(${JSON.stringify(id)});if(!b||b.disabled)throw Error('Knopf fehlt oder gesperrt: '+${JSON.stringify(id)});b.focus();b.click();return true;})()`);
  }
  async rohFall(fall, name, fn, extras = {}) {
    if (!/^D(?:[1-9]|1[0-2])$/.test(fall) || !safeName(name)) throw new Error('Ungültige Fallkennung.');
    const key = `dateien/${this.variante}-${fall}-${name}`;
    const beleg = { schema: 1, fall, variante: this.variante, name, umgebung: {}, belege: [`${key}.json`], ...extras };
    try {
      // Pro Fall begrenzte Rohdaten. Die installierten Haken halten dasselbe
      // Objekt; nur die gesammelten Aufträge werden zurückgesetzt.
      await this.c.evaluate(`(function(){var p=window.__dateien;if(!p)throw Error('Brückenhaken fehlt');p.aufrufe.length=0;p.antworten.length=0;p.bloecke={};p.gesehen={};return true;})()`);
      Object.assign(beleg, await fn(key));
    }
    catch (e) {
      beleg.fehler = e.message;
      try { await bild(this.ctx, `${key}-fehler`); beleg.belege.push(`${key}-fehler.png`, `${key}-fehler-ansicht.xml`); } catch (_) { /* Ursprünglicher Fehler bleibt erhalten. */ }
    }
    this.roh.faelle.push(beleg);
    await this.ctx.save(`${key}.json`, beleg);
    await this.ctx.save('dateien-roh.json', this.roh);
    this.ctx.befund(dateiFallId(beleg), evaluiereDateiFall(beleg));
    if (beleg.fehler) {
      // Ein gescheiterter Fall darf keine modale Sperre in den nächsten tragen.
      await this.ctx.stop(this.ctx.app); await this.ctx.start(this.ctx.app); await this.verbinden(true);
    }
    return beleg;
  }
  async downloads() { return (await this.ctx.shell('ls -1 /sdcard/Download')).split('\n').filter(Boolean).sort(); }
  merken(name) {
    if (name !== basename(name) || /[\r\n/\\\0]/.test(name) || ['.', '..'].includes(name)) throw new Error('Unerwarteter Dateiname im Download-Ordner.');
    const remote = `/sdcard/Download/${name}`;
    this.dateien.add(remote); this.ctx.dateienDateien.add(remote);
    return remote;
  }
  async push(bytes, name, key) {
    const pfad = join(this.ctx.ausgabe, 'dateien', `${key}-${name}`);
    await writeFile(pfad, bytes);
    const remote = this.merken(name);
    const r = await this.ctx.adb(['push', pfad, remote]);
    if (r.code !== 0) throw new Error('Testdatei konnte nicht nach Download übertragen werden.');
    await this.ctx.save(`dateien/${key}-push.json`, r);
    return remote;
  }
  async holen(vorher, key, mime) {
    const neu = await warte(this.ctx, async () => {
      const d = neueDownloads(vorher, await this.downloads());
      for (const name of d) this.merken(name);
      return d.length ? d : null;
    }, 25, 400);
    if (neu.length !== 1) throw new Error('Mehrere neue Downloads; keine eindeutige Zuordnung zum Auftrag.');
    const datei = `${key}-ziel.${Object.keys(FORMATE).find(k => FORMATE[k].mime === mime) || 'bin'}`;
    const r = await this.ctx.adb(['pull', this.merken(neu[0]), join(this.ctx.ausgabe, datei)]);
    await this.ctx.save(`${key}-pull.json`, r);
    if (r.code !== 0) throw new Error('Gespeicherte Zieldatei kann nicht gezogen werden.');
    const uri = `content://com.android.externalstorage.documents/document/${encodeURIComponent(`primary:Download/${neu[0]}`)}`;
    const metadatenRoh = await this.ctx.shell(`content query --uri ${quote(uri)} --projection _display_name:mime_type:_size`);
    await this.ctx.save(`${key}-ziel-metadaten.txt`, metadatenRoh);
    const metadaten = dokumentMetadaten(metadatenRoh, neu[0]);
    const bytes = await readFile(join(this.ctx.ausgabe, datei));
    if (metadaten.bytes !== bytes.length) throw new Error('Zielgröße des Providers weicht von gezogenen Bytes ab.');
    return dateiDeskriptor(bytes, metadaten.name, metadaten.mime, null, datei);
  }
  async referenz(start, key) {
    const z = await this.zustand(`${key}-bruecke`), r = ausgabeReferenz(z, start);
    const datei = `${key}-referenz.${Object.keys(FORMATE).find(k => FORMATE[k].mime === r.mime) || 'bin'}`;
    await writeFile(join(this.ctx.ausgabe, datei), r.bytes);
    return { ...dateiDeskriptor(r.bytes, r.name, r.mime, 'bruecke', datei), auftragId: r.id };
  }
  async exportieren(format, key) {
    const vor = await this.downloads(), vorZ = await this.zustand(), start = vorZ.bruecke.aufrufe.length;
    const antwortenVor = vorZ.bruecke.antworten.filter(a => a.methode === 'speichernUnter').length;
    try {
      await this.klick(FORMATE[format].speichern);
      await auswahl(this.ctx, key);
      const referenz = await this.referenz(start, key);
      const angebotenerName = await speichern(this.ctx, key);
      await warte(this.ctx, async () => { const z = await this.zustand(), a = z.bruecke.antworten.filter(a => a.methode === 'speichernUnter'); return z.aktionenFrei && a.length === antwortenVor + 1 && a.at(-1)?.data?.status === 'ok'; });
      const ziel = await this.holen(vor, key, FORMATE[format].mime);
      const nach = await this.zustand(key); await bild(this.ctx, `${key}-danach`);
      const suffix = / \((\d+)\)(?=\.[^.]+$)/.exec(ziel.name);
      return { umgebung: { picker: true }, referenz, ziel, angebotenerName, ...(suffix ? { kopie: Number(suffix[1]) } : {}), tag: this.uhr.tag, zeitFixiert: this.zeit, antwort: nach.bruecke.antworten.filter(a => a.methode === 'speichernUnter').at(-1), aktionenFrei: nach.aktionenFrei,
        belege: [`${key}-bruecke-zustand.json`, `${key}-auswahl.json`, `${key}-ziel-metadaten.txt`, `${key}-danach.png`, referenz.datei, ziel.datei] };
    } finally {
      for (const name of neueDownloads(vor, await this.downloads())) this.merken(name);
    }
  }
  async importieren(key, name, basis, { provider = false, abbrechen = false } = {}) {
    const vor = await this.zustand(`${key}-vor`);
    await writeFile(join(this.ctx.ausgabe, `${key}-quelle.bin`), basis);
    if (provider) await this.ctx.shell(`run-as ${DATEIPROBE} rm -f files/provider.json`);
    await this.klick('open-json');
    const xml = await auswahl(this.ctx, key);
    if (abbrechen) await this.ctx.shell('input keyevent KEYCODE_BACK');
    // Der Testprovider verteilt seine Dokumente auf zwei kurze Wurzeln (siehe ProbeProvider.java).
    else await oeffnen(this.ctx, key, name, provider ? (/^(grenze|zu-gross)/.test(name) ? 'Dateiprobe Grenzen' : 'Dateiprobe Fehler') : 'Downloads');
    await this.ctx.sleep(1400);
    const nach = await this.zustand(key);
    const antwort = nach.bruecke.antworten.filter(a => a.methode === 'projektWaehlen').at(-1);
    const ruecktext = antwort?.data?.text;
    let ergebnis = antwort?.success === false ? antwort.error?.code : antwort?.data?.status;
    let erwarteterInput;
    try { erwarteterInput = JSON.parse(basis.toString('utf8').replace(/^\ufeff/, '')).input; } catch (_) {}
    if (ergebnis === 'ok' && !gleiche(nach.gespeichert.input, erwarteterInput)) ergebnis = name.includes('schema') ? 'schema' : 'format';
    const quelleOhneBom = basis.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? basis.subarray(3) : basis;
    const messung = { auswahl: /documentsui/.test(xml) ? 'documentsui' : '', quelleDatei: `${key}-quelle.bin`, quelleSha256: hash(basis), quelleOhneBomSha256: hash(quelleOhneBom),
      brueckeSha256: typeof ruecktext === 'string' ? hash(Buffer.from(ruecktext, 'utf8')) : null, bytes: basis.length,
      projektVor: projektWerte(vor.werte, { formular: true }), projektNach: projektWerte(nach.werte, { formular: true }), projektErwartet: erwarteterInput ? projektWerte(erwarteterInput) : null, gespeichertNach: projektWerte(nach.gespeichert.input),
      formularNach: nach.werte, aufrufe: nach.bruecke.aufrufe.slice(vor.bruecke.aufrufe.length).filter(a => a.methode === 'projektWaehlen').length,
      aktionenFrei: nach.aktionenFrei, abgebrochen: abbrechen, ergebnis, nativeStatus: antwort?.data?.status ?? null,
      parserFehler: nach.meldungen.import, meldung: nach.meldungen.import, antwort,
      mehrbyte: basis.some(b => b >= 0x80) };
    if (provider) {
      const p = JSON.parse(await this.ctx.shell(`run-as ${DATEIPROBE} cat files/provider.json`));
      const angebot = await this.ctx.adb(['exec-out', 'run-as', DATEIPROBE, 'cat', 'files/provider.bin'], { binary: true });
      if (angebot.code !== 0 || !Buffer.isBuffer(angebot.out)) throw new Error('Rohbytes des Testproviders fehlen.');
      await writeFile(join(this.ctx.ausgabe, `${key}-quelle.bin`), angebot.out);
      // JSONObject darf die Feldreihenfolge der Schema-Gegenprobe ändern.
      // Alle anderen Angebote müssen den unabhängig erzeugten Sollbytes entsprechen.
      if (!name.startsWith('schema.') && !angebot.out.equals(basis)) throw new Error('Testprovider bietet andere Bytes als die verlangte Probe an.');
      messung.quelleSha256 = hash(angebot.out); messung.quelleOhneBomSha256 = hash(angebot.out); messung.bytes = angebot.out.length;
      await this.ctx.save(`${key}-provider.json`, p);
      Object.assign(messung, { providerGroesse: p.angegebeneGroesse, provider: p });
    }
    await bild(this.ctx, `${key}-danach`);
    return { umgebung: { picker: true, ...(provider ? { provider: true } : {}) }, messung,
      belege: [`${key}-vor-zustand.json`, `${key}-zustand.json`, `${key}-danach.png`, ...(basis.length ? [`${key}-quelle.bin`] : []), ...(provider ? [`${key}-provider.json`] : [])] };
  }
  async teilen(format, key, empfangen = false, { empfaengerBehalten = false } = {}) {
    const vor = await this.zustand(`${key}-vor`), obenVor = await oben(this.ctx);
    if (empfangen) await this.ctx.shell(`run-as ${DATEIPROBE} rm -f files/empfang.json files/empfang.bin`);
    await this.klick(FORMATE[format].teilen);
    await warte(this.ctx, async () => /ChooserActivity|ResolverActivity|DevicePickerActivity|org\.example\.dateiprobe/.test(await oben(this.ctx)), 25, 500);
    const xml = await bild(this.ctx, `${key}-teilen`), obenTeilen = await oben(this.ctx);
    const referenz = await this.referenz(vor.bruecke.aufrufe.length, key);
    const hatEmpfaenger = knoten(xml).some(k => k.text === 'Dateiprobe' || k.package === DATEIPROBE);
    let empfang, ziel;
    if (empfangen) {
      if (!obenTeilen.includes(DATEIPROBE)) await nativeSchaltflaeche(this.ctx, `${key}-empfaenger`, 'Dateiprobe', undefined, { scroll: true });
      await warte(this.ctx, async () => (await oben(this.ctx)).includes(DATEIPROBE), 15, 500);
      empfang = await warte(this.ctx, async () => {
        const r = await this.ctx.adb(['shell', `run-as ${DATEIPROBE} cat files/empfang.json`]);
        if (r.code !== 0) return null;
        const p = JSON.parse(r.out);
        if (p.fehler) throw new Error(`Testempfänger: ${p.fehler}: ${p.meldung}`);
        return p.uri?.includes(`/${referenz.auftragId}/`) ? p : null;
      });
      await this.ctx.save(`${key}-empfang.json`, empfang);
      const data = await this.ctx.adb(['exec-out', 'run-as', DATEIPROBE, 'cat', 'files/empfang.bin'], { binary: true });
      if (data.code !== 0 || !Buffer.isBuffer(data.out)) throw new Error('Datei des Testempfängers nicht lesbar.');
      const datei = `${key}-empfangen.${format}`;
      await writeFile(join(this.ctx.ausgabe, datei), data.out);
      if (hash(data.out) !== empfang.sha256 || data.out.length !== empfang.groesse) throw new Error('Empfängerbericht und gezogene Bytes passen nicht zusammen.');
      ziel = dateiDeskriptor(data.out, empfang.name, empfang.mime, null, datei);
      await bild(this.ctx, `${key}-empfangen`);
    }
    if (empfangen && empfaengerBehalten) await this.ctx.start(this.ctx.app);
    else await this.ctx.shell('input keyevent KEYCODE_BACK');
    await this.ctx.sleep(900);
    // Bei Resolver vor dem Empfänger kann eine weitere Zurück-Taste nötig sein.
    if (!(await oben(this.ctx)).includes(this.ctx.app)) { await this.ctx.shell('input keyevent KEYCODE_BACK'); await this.ctx.sleep(700); }
    const obenNach = await oben(this.ctx), nach = await this.zustand(key);
    // Erneut über die UI öffnen, damit die native chooserOffen-Sperre messbar ist.
    await this.klick('open-json'); await auswahl(this.ctx, `${key}-erneut`);
    await this.ctx.shell('input keyevent KEYCODE_BACK'); await this.ctx.sleep(600);
    const antwort = nach.bruecke.antworten.filter(a => a.methode === 'teilen').at(-1)?.data;
    return { umgebung: { empfaenger: hatEmpfaenger || !!empfang }, referenz, ...(ziel ? { ziel, empfang, grants: empfang, uri: empfang.uri } : {}),
      modus: /No apps can perform|Keine App/.test(xml) ? 'ohne-empfaenger' : /ChooserActivity|ResolverActivity/.test(obenTeilen) ? 'auswahl' : 'direkt',
      hinweis: knoten(xml).find(k => /No apps can perform|Keine App/.test(k.text || ''))?.text,
      obenVor, obenTeilen, obenNach, appPaket: this.ctx.app, antwort, erneuterAuftrag: true,
      belege: [`${key}-teilen-ansicht.xml`, `${key}-teilen.png`, `${key}-zustand.json`, referenz.datei, ...(ziel ? [ziel.datei, `${key}-empfang.json`] : [])] };
  }
}

async function providerVorbereiten(s, basis) {
  const local = join(s.ctx.ausgabe, 'dateien', 'provider-basis.json');
  await writeFile(local, basis);
  const remote = `/data/local/tmp/dateiprobe-${s.prefix}.json`;
  s.ctx.defer(async () => { await s.ctx.shell(`rm -f ${quote(remote)}`); });
  const push = await s.ctx.adb(['push', local, remote]);
  if (push.code !== 0) throw new Error('Basisdatei des Testproviders konnte nicht übertragen werden.');
  await s.ctx.shell(`chmod 644 ${quote(remote)}`);
  await s.ctx.shell(`run-as ${DATEIPROBE} mkdir -p files/fixtures`);
  await s.ctx.shell(`run-as ${DATEIPROBE} cp ${quote(remote)} files/fixtures/basis.json`);
  await s.ctx.shell(`rm -f ${quote(remote)}`);
}

async function dialog(s, key, art) {
    const vor = await s.zustand(`${key}-vor`);
  await s.klick('reset-project'); await s.ctx.sleep(600);
  const xml = await bild(s.ctx, `${key}-dialog`), alle = knoten(xml);
  const frage = alle.find(k => k.text === DIALOG.frage), abbrechen = alle.find(k => k['resource-id'] === 'android:id/button2' && k.text.toLocaleLowerCase('de') === DIALOG.abbrechen.toLocaleLowerCase('de')), bestaetigen = alle.find(k => k['resource-id'] === 'android:id/button1' && k.text.toLocaleLowerCase('de') === DIALOG.bestaetigen.toLocaleLowerCase('de'));
  if (!frage || !abbrechen || !bestaetigen) throw new Error('Bestätigungsdialog nicht vollständig sichtbar.');
  const fokus = alle.find(k => k.focused === 'true');
  if (art === 'zurueck') await s.ctx.shell('input keyevent KEYCODE_BACK');
  else await tippe(s.ctx, art === 'bestaetigen' ? bestaetigen : abbrechen);
  await s.ctx.sleep(1000);
  const nach = await s.zustand(key);
  return { messung: { dialog: { frage: frage.text, abbrechen: abbrechen.text, bestaetigen: bestaetigen.text, fokus: fokus?.['resource-id'] || '' },
    projektVor: projektWerte(vor.werte, { formular: true, nurKopf: true }), projektNach: projektWerte(nach.werte, { formular: true, nurKopf: true }), gespeichertNach: projektWerte(nach.gespeichert.input, { nurKopf: true }),
    aktionenFrei: nach.aktionenFrei, fokusVor: vor.fokus, fokusNach: nach.fokus,
    resetAufrufe: nach.bruecke.aufrufe.slice(vor.bruecke.aufrufe.length).filter(a => a.methode === 'zuruecksetzenBestaetigen').length },
    belege: [`${key}-vor-zustand.json`, `${key}-dialog-ansicht.xml`, `${key}-dialog.png`, `${key}-zustand.json`] };
}

async function lebenszyklus(s, key, art) {
  await s.fuellen();
  const vor = await s.zustand(`${key}-vor`), pidVor = Number(s.c.pid), seiteVor = s.c.pageId;
  const istDialog = art === 'neuerstellung-dialog';
  await s.klick(istDialog ? 'reset-project' : 'open-json');
  const offen = await bild(s.ctx, `${key}-offen`);
  if (!istDialog && !/documentsui/.test(offen)) throw new Error('Dateiauswahl vor dem Lebenszykluswechsel fehlt.');
  if (istDialog) {
    const alle = knoten(offen);
    if (!alle.some(k => k.text === DIALOG.frage) || !alle.some(k => k['resource-id'] === 'android:id/button2' && k.text.toLocaleLowerCase('de') === 'abbrechen') || !alle.some(k => k['resource-id'] === 'android:id/button1' && k.text.toLocaleLowerCase('de') === 'zurücksetzen')) throw new Error('Offener Bestätigungsdialog vor Neuerstellung nicht belegt.');
  }
  let auswahlNach = null, hakenNach, rotation, fontScale;
  if (art.startsWith('neuerstellung')) {
    const font = (await s.ctx.shell('settings get system font_scale')).trim();
    const neu = Number(font) === 1.15 ? 1.2 : 1.15;
    await s.ctx.shell(`settings put system font_scale ${neu}`); await s.ctx.sleep(2300);
    fontScale = { vor: font, waehrend: (await s.ctx.shell('settings get system font_scale')).trim() };
    // Bei offener Auswahl bleibt die neue WebView ggf. bis Rückkehr ohne Socket.
    if (!istDialog) { await s.ctx.shell('input keyevent KEYCODE_BACK'); await s.ctx.sleep(900); }
    await s.ctx.start(s.ctx.app); s.c = await s.ctx.cdp(s.ctx.app, { neu: true });
    hakenNach = await s.c.evaluate('!!window.__dateien');
  } else if (art === 'force-stop-auswahl') {
    await s.ctx.stop(s.ctx.app); await s.ctx.start(s.ctx.app); s.c = await s.ctx.cdp(s.ctx.app, { neu: true });
    hakenNach = await s.c.evaluate('!!window.__dateien');
  } else if (art === 'hintergrund-auswahl') {
    await s.ctx.shell('input keyevent KEYCODE_HOME'); await s.ctx.sleep(900);
    // am start bringt den offenen Auftrag nach vorn, ohne den Prozess zu stoppen.
    await s.ctx.shell(`am start -W -n ${s.ctx.app}/de.baremos.fristenrechner.MainActivity`); await s.ctx.sleep(900);
    auswahlNach = /documentsui/.test(await oben(s.ctx));
    if (auswahlNach) { await s.ctx.shell('input keyevent KEYCODE_BACK'); await s.ctx.sleep(800); }
    hakenNach = await s.c.evaluate('!!window.__dateien');
  } else {
    await s.ctx.shell('settings put system accelerometer_rotation 0');
    const vorher = (await s.ctx.shell('settings get system user_rotation')).trim();
    const neu = vorher === '1' ? '0' : '1';
    await s.ctx.shell(`settings put system user_rotation ${neu}`); await s.ctx.sleep(1200);
    rotation = { vor: vorher, waehrend: (await s.ctx.shell('settings get system user_rotation')).trim() };
    auswahlNach = /documentsui/.test(await oben(s.ctx));
    if (auswahlNach) { await s.ctx.shell('input keyevent KEYCODE_BACK'); await s.ctx.sleep(800); }
    hakenNach = await s.c.evaluate('!!window.__dateien');
  }
  const seiteNach = s.c.pageId, pidNach = Number(s.c.pid);
  // Vor neuem Haken lesen: automatische Wiederholung darf nicht unsichtbar werden.
  const nachVorHaken = await s.c.evaluate(`(${lesbarerZustand.toString()})(${JSON.stringify(s.quelle.storage)})`);
  await s.verbinden();
  const nach = await s.zustand(key);
  const neuAufrufe = nachVorHaken.bruecke?.aufrufe.slice(vor.bruecke.aufrufe.length) || [];
  const messung = { pidVor, pidNach, seiteVor, seiteNach, hakenNach,
    projektVor: projektWerte(vor.werte, { formular: true }), projektNach: projektWerte(nach.werte, { formular: true }), aktionenFrei: nach.aktionenFrei,
    importAufrufe: neuAufrufe.filter(a => a.methode === 'projektWaehlen').length,
    resetAufrufe: neuAufrufe.filter(a => a.methode === 'zuruecksetzenBestaetigen').length,
    auswahlVor: true, auftragArt: istDialog ? 'dialog' : 'auswahl', auswahlNach: auswahlNach ?? /documentsui/.test(await oben(s.ctx)), ...(rotation ? { rotation } : {}), ...(fontScale ? { fontScale } : {}) };
  await bild(s.ctx, `${key}-danach`);
  // Eine neue wirkliche Auswahl prüft die Freigabe der Sperre zusätzlich.
  await s.klick('open-json'); await auswahl(s.ctx, `${key}-erneut`);
  await s.ctx.shell('input keyevent KEYCODE_BACK'); await s.ctx.sleep(600);
  await s.ctx.restoreDisplay();
  if (fontScale) fontScale.nach = (await s.ctx.shell('settings get system font_scale')).trim();
  if (rotation) rotation.nach = (await s.ctx.shell('settings get system user_rotation')).trim();
  await s.ctx.sleep(900); await s.verbinden(true);
  return { umgebung: { picker: true }, messung, belege: [`${key}-vor-zustand.json`, `${key}-offen.png`, `${key}-zustand.json`, `${key}-danach.png`, `${key}-erneut-warten-0-ansicht.xml`] };
}

async function cache(s, key) {
  const ctx = s.ctx;
  const jetzt = Number(await ctx.shell('date +%s')) * 1000;
  const pidVor = Number(await ctx.shell(`pidof ${ctx.app}`));
  const zeit = { jetzt, beimStart: jetzt, gealtert: jetzt - 3600000, phase: 'vor-uhrsprung' };
  // Die Empfänger-Activities bleiben beim Wechsel zur App am Leben. Sonst
  // könnte allein deren Ende den URI-Grant entziehen und den Test verfälschen.
  const alt = await s.teilen('json', `${key}-alt`, true, { empfaengerBehalten: true });
  ctx.defer(async () => { await ctx.restoreClock(); });
  try {
    await ctx.shell('settings put global auto_time 0');
    await ctx.shell(datumBefehl(Math.floor(jetzt / 1000) + 23 * 3600));
    const frisch = await s.teilen('xlsx', `${key}-frisch`, true, { empfaengerBehalten: true });
    const altId = alt.referenz.auftragId, frischId = frisch.referenz.auftragId;
    if (![altId, frischId].every(v => /^[0-9a-f-]{36}$/.test(v))) throw new Error('Freigabe-Kennung fehlt.');
    const praef = 'shared_prefs/dateiausgabe_freigaben.xml';
    const prefsVor = await ctx.shell(`run-as ${ctx.app} cat ${praef}`);
    const startListe = await ctx.shell(`run-as ${ctx.app} ls -1 cache/export`);
    const altVor = startListe.split('\n').includes(altId), frischVor = startListe.split('\n').includes(frischId);
    const prefsGealtert = altereFreigabe(prefsVor, altId, zeit.gealtert);
    const marker = `dateien-fremd-${s.prefix}`;
    await ctx.shell(`run-as ${ctx.app} sh -c ${quote(`printf '%s' '${marker}' > cache/dateiprobe-fremd.txt`)}`);
    const fremdVor = hash(Buffer.from(await ctx.shell(`run-as ${ctx.app} cat cache/dateiprobe-fremd.txt`)));
    const lokal = join(ctx.ausgabe, `${key}-prefs-gealtert.xml`), remote = `/data/local/tmp/dateiprobe-prefs-${s.prefix}.xml`;
    await writeFile(lokal, prefsGealtert);
    ctx.defer(async () => { await ctx.shell(`rm -f ${quote(remote)}`); });
    const push = await ctx.adb(['push', lokal, remote]); if (push.code !== 0) throw new Error('Gealterte Freigabe nicht übertragen.');
    await ctx.shell(`chmod 644 ${quote(remote)}`);
    await ctx.shell(`run-as ${ctx.app} cp ${quote(remote)} ${praef}`);
    await ctx.shell(`run-as ${ctx.app} sh -c ${quote(`touch -d @${Math.floor(zeit.gealtert / 1000)} cache/export/${altId} cache/export/${altId}/*`)}`);
    const dateizeitGealtert = Number(await ctx.shell(`run-as ${ctx.app} stat -c %Y cache/export/${altId}`)) * 1000;
    await ctx.shell(`rm -f ${quote(remote)}`);
    await ctx.save(`${key}-prefs-vor.xml`, prefsVor);
    // SharedPreferences behält im lebenden Prozess den ursprünglichen Wert.
    // Auch dieser wird durch den folgenden Uhrsprung älter als 24 Stunden;
    // der Test benötigt keinen Neustart und damit keinen fremden Grantwiderruf.
    async function zugriff(suffix) {
      await ctx.shell(`run-as ${DATEIPROBE} rm -f files/widerruf.json`);
      await ctx.shell(`am start -W -n ${DATEIPROBE}/.EmpfangActivity -a ${DATEIPROBE}.PRUEFE_WIDERRUF --es uri ${quote(alt.uri)}`);
      const p = await warte(ctx, async () => {
        const r = await ctx.adb(['shell', `run-as ${DATEIPROBE} cat files/widerruf.json`]);
        if (r.code !== 0) return null;
        const b = JSON.parse(r.out); return b.uri === alt.uri ? b : null;
      });
      await ctx.save(`${key}-${suffix}.json`, p);
      await ctx.start(ctx.app);
      return p;
    }
    const zugriffVor = await zugriff('zugriff-vor');
    if (zugriffVor.lesenVerweigert !== false || zugriffVor.pruefung?.geoeffnet !== true) throw new Error('URI ist bereits vor Bereinigung nicht mehr lesbar; Widerrufprobe ungültig.');
    await ctx.shell(datumBefehl(Math.floor(jetzt / 1000) + 25 * 3600));
    zeit.beimTeilen = Number(await ctx.shell('date +%s')) * 1000;
    await ctx.save(`${key}-uhr.json`, zeit);
    await s.teilen('pdf', `${key}-bereinigung`, false);
    const liste = await ctx.shell(`run-as ${ctx.app} ls -1 cache/export`);
    const prefsNach = await ctx.shell(`run-as ${ctx.app} cat ${praef}`);
    const fremdNach = hash(Buffer.from(await ctx.shell(`run-as ${ctx.app} cat cache/dateiprobe-fremd.txt`)));
    const widerruf = await zugriff('widerruf');
    const pidNach = Number(await ctx.shell(`pidof ${ctx.app}`));
    return { umgebung: { empfaenger: true }, messung: { altId, frischId, altVor, frischVor,
      altNach: liste.split('\n').includes(altId), frischNach: liste.split('\n').includes(frischId), fremdVor, fremdNach,
      prefsVor, prefsGealtert, prefsNach, startListe, zeit, dateizeitGealtert, pidVor, pidNach, zugriffVor, widerruf },
      belege: [`${key}-prefs-vor.xml`, `${key}-prefs-gealtert.xml`, `${key}-uhr.json`, `${key}-zugriff-vor.json`, `${key}-widerruf.json`, `${key}-alt-empfang.json`, `${key}-frisch-empfang.json`] };
  } finally { await ctx.restoreClock(); }
}

async function debugFaelle(s) {
  await s.verbinden(); await s.fuellen();
  const erstes = {};
  for (const format of Object.keys(FORMATE)) erstes[format] = await s.rohFall('D1', format, key => s.exportieren(format, key), { format });
  const basis = erstes.json.referenz?.base64 && Buffer.from(erstes.json.referenz.base64, 'base64');
  if (!basis) throw new Error('Keine geprüfte Projektdatei als Grundlage für Importfälle.');
  // Die Importdateien beginnen mit „0-“, damit sie in der alphabetisch sortierten Auswahl von Download
  // oben stehen: Eine Zeile am Ende einer langen Liste ist per Tastatur nicht zuverlässig erreichbar.
  const name = `0-${s.prefix}-import.json`;
  await s.push(basis, name, 'importbasis');
  await providerVorbereiten(s, basis);
  for (const format of ['json', 'xlsx']) {
    await s.rohFall('D2', format, async key => {
      const a = await s.exportieren(format, `${key}-eins`), b = await s.exportieren(format, `${key}-zwei`);
      return { format, exporte: [a.referenz, b.referenz], tage: [a.tag, b.tag], zeitFixiert: s.zeit, belege: [...a.belege, ...b.belege] };
    }, { format });
  }
  await s.rohFall('D3', 'abbruch', async key => {
    const vor = await s.zustand(`${key}-vor`), downloadVor = await s.downloads();
    await s.klick('export-pdf'); await auswahl(s.ctx, key);
    await s.ctx.shell('input keyevent KEYCODE_BACK'); await s.ctx.sleep(800);
    const nach = await s.zustand(key);
    return { umgebung: { picker: true }, messung: { antwortStatus: nach.bruecke.antworten.filter(a => a.methode === 'speichernUnter').at(-1)?.data?.status,
      downloadVor, downloadNach: await s.downloads(), aktionenFrei: nach.aktionenFrei, meldungenVor: vor.meldungen, meldungenNach: nach.meldungen } };
  });
  await s.rohFall('D3', 'erneut', key => s.exportieren('pdf', key), { format: 'pdf' });
  await s.rohFall('D3', 'gleicher-name', async key => ({ ...await s.exportieren('json', key), vorherigerName: erstes.json.ziel?.name }), { format: 'json' });
  await s.rohFall('D3', 'schliessfehler', async () => ({ grenze: { code: 'nicht-provozierbar', produktUnveraendert: true, grund: 'Ein Fehler ausschließlich beim Schließen des Zielstreams lässt sich mit dem vorhandenen lokalen DocumentsProvider ohne Produktänderung nicht zuverlässig auslösen. Dieser Fehlerfall bleibt offen.' } }));
  for (const format of Object.keys(FORMATE)) {
    await s.rohFall('D4', format, key => s.teilen(format, key), { format });
    await s.rohFall('D5', format, key => s.teilen(format, key, true), { format });
  }
  for (const teilfall of ['import', 'erneut', 'abbruch', 'wieder-oeffnen']) {
    if (teilfall !== 'erneut') await s.fuellen({ projektname: `${s.prefix} vor Import` });
    await s.rohFall('D6', teilfall, key => s.importieren(key, name, basis, { abbrechen: teilfall === 'abbruch' }));
  }
  for (const id of ['grenze', 'zu-gross', 'grenze-unbekannt', 'zu-gross-unbekannt', 'grenze-falsch-klein', 'zu-gross-falsch-klein', 'grenze-falsch-gross']) {
    await s.fuellen({ projektname: `${s.prefix} vor Grenze` });
    const bytes = gepolsterteProjektdatei(basis, id.startsWith('zu-gross') ? GRENZE + 1 : GRENZE);
    await s.rohFall('D7', id, key => s.importieren(key, `${id}.json`, bytes, { provider: true }));
  }
  const schema = JSON.parse(basis.toString()); schema.version = 999;
  // Das Dokument „lesefehler“ ist 512 KiB groß; der Testprovider scheitert nach 256 KiB (siehe ProbeProvider.java).
  const fehler = { leer: Buffer.alloc(0), format: Buffer.from('keine JSON-Datei'), utf8: Buffer.from([0xc3, 0x28]), schema: Buffer.from(JSON.stringify(schema)), lesefehler: gepolsterteProjektdatei(basis, 2 * 262_144) };
  for (const [id, bytes] of Object.entries(fehler)) {
    await s.fuellen({ projektname: `${s.prefix} vor Fehler` });
    await s.rohFall('D8', id, key => s.importieren(key, `${id}.json`, bytes, { provider: true }));
  }
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), basis]), bomName = `0-${s.prefix}-bom.json`;
  await s.push(bom, bomName, 'bom');
  await s.rohFall('D8', 'bom', key => s.importieren(key, bomName, bom));
  for (const art of ['abbrechen', 'zurueck', 'bestaetigen']) {
    await s.fuellen(); await s.rohFall('D9', art, key => dialog(s, key, art));
  }
  for (const art of ['neuerstellung-dialog', 'neuerstellung-auswahl', 'hintergrund-auswahl', 'force-stop-auswahl', 'drehung-auswahl']) {
    await s.rohFall('D10', art, key => lebenszyklus(s, key, art));
  }
  await s.fuellen(); await s.rohFall('D11', 'cache', key => cache(s, key));
  return { basis, name };
}

/** Installation, Netzumrahmung und Rohbelege sind absichtlich getrennt von der Auswertung. */
export async function dateien(ctx) {
  if (![30, 36].includes(ctx.api)) throw new Error('Dateiphase benötigt API 30 oder 36.');
  if (!ctx.varianten?.testempfaenger || !ctx.varianten?.gegenprobe) throw new Error('Testempfänger und Netzgegenprobe fehlen.');
  const quelle = quellvertrag(ctx.wurzel);
  const prefix = `dateiprobe-${randomUUID().slice(0, 8)}`;
  const roh = { schema: 1, api: ctx.api, faelle: [], prefix, beginn: new Date().toISOString() };
  await mkdir(join(ctx.ausgabe, 'dateien'), { recursive: true });
  ctx.dateienDateien ??= new Set();
  const anfangDownload = (await ctx.shell('ls -1 /sdcard/Download')).split('\n').filter(Boolean).sort();
  ctx.defer(async () => {
    // Auch ein Abbruch zwischen Save und Dateidifferenz darf keine Probe liegenlassen.
    await ctx.stop(ctx.app);
    const endeDownload = (await ctx.shell('ls -1 /sdcard/Download')).split('\n').filter(Boolean).sort();
    for (const name of neueDownloads(anfangDownload, endeDownload)) {
      if (name.includes(prefix)) ctx.dateienDateien.add(`/sdcard/Download/${name}`);
    }
    await ctx.save('dateien/download-abbruchinventar.json', { vorher: anfangDownload, nachher: endeDownload, laufPraefix: prefix });
  });
  await ctx.install(ctx.varianten.testempfaenger, DATEIPROBE);
  await ctx.uninstall(ctx.app); await ctx.install(ctx.debug, ctx.app);
  let fixture;
  try {
    await mitDateienNetz(ctx, 'debug', async () => { fixture = await debugFaelle(new Sitzung(ctx, roh, 'debug', prefix, quelle)); });
    await ctx.uninstall(ctx.app);
    const release = await signiereRelease(ctx, ctx.release);
    await ctx.install(release, ctx.app);
    const paket = await ctx.shell(`dumpsys package ${ctx.app}`);
    await ctx.save('dateien/release-paket.txt', paket);
    if (/\bDEBUGGABLE\b/.test(paket)) throw new Error('Release-APK ist als debuggable markiert.');
    await mitDateienNetz(ctx, 'release', async () => {
      const s = new Sitzung(ctx, roh, 'release', `${prefix}-release`, quelle);
      await s.verbinden(); await s.fuellen();
      await s.rohFall('D1', 'json', key => s.exportieren('json', key), { format: 'json' });
      await s.rohFall('D5', 'json', key => s.teilen('json', key, true), { format: 'json' });
      if (!fixture) throw new Error('Debug-Importdatei fehlt für den Release-Nachweis.');
      await s.rohFall('D6', 'import', key => s.importieren(key, fixture.name, fixture.basis), { format: 'json' });
    });
  } finally {
    roh.ende = new Date().toISOString();
    await ctx.save('dateien-roh.json', roh);
    ctx.befund('dateien-abdeckung', pruefeDateienAbdeckung(roh.faelle));
    // Der globale Rahmen führt dies auch nach SIGINT aus und prüft die Ergebnisse.
    // Nur ausdrücklich markierte Dateien werden entfernt; alte Downloads bleiben bestehen.
    await ctx.uninstall(DATEIPROBE);
  }
  return roh;
}
