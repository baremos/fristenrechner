// SPDX-License-Identifier: Apache-2.0
// Menüphase auf dem exklusiven Emulator. Import startet weder Emulator noch Build.
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Sitzung } from './dateien.mjs';
import { quellvertrag } from './oberflaeche.mjs';
import { signiereRelease } from './bauen.mjs';
import { sha256 } from './rahmen.mjs';
import { auswahl, nativeSchaltflaeche, knoten, flaeche, tippe, hash, warte, oben } from './dateien-ui.mjs';
import { MESSUNG, MENUE_NAMEN, menueTipp, menueOeffnungBestaetigen, navigationStand, navigationZurueck } from './menue-ui.mjs';
import { MENUE_SCHEMA, MENUE_FAELLE, menueFallId, evaluiereMenueFall, menueAbdeckung, imeSichtbar, menueDateibelege } from './menue-auswertung.mjs';
import { SICHTPRUEFUNGEN, sichtpruefungAusstehend, befund } from '../emulator-auswertung.mjs';
import { stelleEinstellungZurueck } from '../emulator-lauf.mjs';

const AKTION = {'save-json':'Projekt speichern unter','share-excel':'Excel teilen','open-json':'Projekt importieren','reset-project':'Neues Projekt'};
const muss = (v,g) => { if (!v) throw new Error(g); };
const ROLLEN = '(function(){var s=document.querySelector("[role=dialog]"),l=s.classList.contains("fr-menue-kompakt")?s:s.querySelector("[role=region]");l.scrollTop=l.scrollHeight;return true;})()';
const NAVIGATION_SEITE = '(function(){var b=document.querySelector(".fr-menue-leiste button[aria-controls]"),r=b&&b.getBoundingClientRect();return {zeit:performance.timeOrigin,bereit:document.readyState==="complete"&&!!r&&!b.disabled&&r.width>0&&r.height>0,width:innerWidth,height:innerHeight,knopf:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};})()';

// Der Overlaywechsel kann Activity und WebView neu erstellen. Erst nach drei
// gleichen Beobachtungen bedienen; CDP und Messhaken gehören zur aktuellen Seite.
export async function gestenNavigation(ctx, s, key) {
  async function moment() {
    const activity = await ctx.shell('dumpsys activity top');
    const appBloecke = activity.split(/(?=^\s*ACTIVITY\s)/m).filter(b => b.trimStart().startsWith('ACTIVITY ' + ctx.app + '/'));
    const activityKennung = appBloecke.length === 1 ? /Local Activity ([a-f0-9]+) State:/i.exec(appBloecke[0])?.[1] ?? null : null;
    return {activity,activityKennung,
      vordergrund:await oben(ctx),seite:await s.c.evaluate(NAVIGATION_SEITE,5000),
      projekt:(await s.zustand()).gespeicherterText,pageId:s.c.pageId ?? null,pid:s.c.pid ?? null};
  }
  const vor = await moment(), beleg = {vor,beobachtungen:[],neuverbindungen:[]};
  let letzte, gleich = 0, angebundeneSeite = vor.seite.zeit;
  await ctx.shell('cmd overlay enable-exclusive --user 0 --category com.android.internal.systemui.navbar.gestural');
  await ctx.sleep(1500);
  try {
    const nach = await warte(ctx,async versuch => {
      try {
        const navigation = await navigationStand(ctx), m = await moment();
        beleg.beobachtungen.push({versuch,navigation,...m});
        if (m.seite.zeit !== angebundeneSeite) {
          await s.verbinden(true); angebundeneSeite = m.seite.zeit;
          beleg.neuverbindungen.push({versuch,grund:'Neue Seite'}); gleich = 0; letzte = null; return null;
        }
        const bereit = navigation.modus === '2' && navigation.liste.some(n => n.aktiv && n.name === 'com.android.internal.systemui.navbar.gestural')
          && m.vordergrund.includes(ctx.app + '/') && m.seite.bereit;
        const stand = JSON.stringify({navigation:navigation.liste,modus:navigation.modus,activity:m.activityKennung,
          vordergrund:m.vordergrund,seite:m.seite,projekt:m.projekt,pageId:m.pageId,pid:m.pid});
        gleich = bereit ? (stand === letzte ? gleich + 1 : 1) : 0; letzte = stand;
        return gleich >= 3 ? {navigation,...m} : null;
      } catch(e) {
        beleg.beobachtungen.push({versuch,fehler:e.message}); gleich = 0; letzte = null;
        const neu = {versuch,grund:e.message}; beleg.neuverbindungen.push(neu);
        try {
          await s.verbinden(true);
          angebundeneSeite = (await s.c.evaluate(NAVIGATION_SEITE,5000)).zeit;
        } catch(neuFehler) { neu.fehler = neuFehler.message; }
        return null;
      }
    },16,500);
    Object.assign(beleg,{nach,activityNeu:vor.activityKennung && nach.activityKennung ? vor.activityKennung !== nach.activityKennung : null,
      seiteNeu:vor.seite.zeit !== nach.seite.zeit});
    muss(nach.projekt === vor.projekt,'Projektstand nach Navigationswechsel verändert.');
    return beleg;
  } finally { await ctx.save(key + '-navigation-stabil.json',beleg); }
}

export class MenueSitzung extends Sitzung {
  async klick(id) {
    const name = AKTION[id];
    if (!name) throw new Error('Nicht vorgesehene Menüaktion: ' + id);
    const weg = this.key + '-weg-' + (this.klickNr = (this.klickNr ?? 0) + 1);
    await menueTipp(this.ctx,this.c,weg + '-oeffnen','knopf');
    await menueTipp(this.ctx,this.c,weg + '-aktion',name);
  }
}

export async function menue(original) {
  const roh = {schema:MENUE_SCHEMA,api:original.api,faelle:[]};
  let belege = new Set(), fallNr = 0, s, key;
  const ctx = {...original,
    async save(name,wert) { await original.save(name,wert); if (belege) belege.add(name); },
    async shot(name,opt) { await original.shot(name,opt); if (belege) belege.add(name); },
  };
  await mkdir(join(ctx.ausgabe,'menue'),{recursive:true});
  await mkdir(join(ctx.ausgabe,'dateien'),{recursive:true});
  ctx.dateienDateien ??= new Set();
  const quelle = quellvertrag(ctx.wurzel), prefix = 'm' + randomUUID().slice(0,8);
  const anfangDownload = (await ctx.shell('ls -1 /sdcard/Download')).split('\n').filter(Boolean);
  // Auch nach Abbruch während speichern: nur neu entstandene eigene Dateinamen übernehmen.
  ctx.defer(async () => {
    const nachher = (await ctx.shell('ls -1 /sdcard/Download')).split('\n').filter(Boolean);
    for (const n of nachher) if (!anfangDownload.includes(n) && n.includes(prefix) && !/[\/\\\r\n]/.test(n)) ctx.dateienDateien.add('/sdcard/Download/' + n);
    await original.save('menue/download-aufraeuminventar.json',{vorher:anfangDownload,nachher,prefix});
  });
  const navVorher = await navigationStand(ctx);
  await original.save('menue/navigation-vorher.json',navVorher);
  let navGeaendert = false;
  const navRestore = async () => { if (navGeaendert) { await navigationZurueck(original,navVorher); navGeaendert = false; } };
  ctx.defer(navRestore);
  const hardware = await ctx.shell('settings get secure show_ime_with_hard_keyboard');
  muss(/^(?:null|0|1)$/.test(hardware),'Hardwaretastatureinstellung fehlt.');
  ctx.defer(() => stelleEinstellungZurueck(original,'secure','show_ime_with_hard_keyboard',hardware));
  await ctx.uninstall(ctx.app); await ctx.install(ctx.debug,ctx.app);
  const debugPaket = await ctx.shell('dumpsys package ' + ctx.app);
  await original.save('menue/debug-paket.txt',debugPaket);
  muss(/\bDEBUGGABLE\b/.test(debugPaket),'Menüphase braucht einen Debug-Build.');

  async function schrift(wert) {
    await ctx.shell('settings put system font_scale ' + wert); await ctx.sleep(1500);
    const ist = Number(await ctx.shell('settings get system font_scale'));
    muss(ist === wert,'Systemschrift nicht gesetzt.'); return ist;
  }
  async function vorbereiten(font = 1) {
    await ctx.shell('settings put system accelerometer_rotation 0');
    await ctx.shell('settings put system user_rotation 0');
    await schrift(font);
    await ctx.stop(ctx.app); await ctx.start(ctx.app);
    s = new MenueSitzung(ctx,roh,'debug',prefix,quelle); s.key = key;
    await s.verbinden(true); await s.fuellen();
    await s.c.evaluate('if(document.activeElement)document.activeElement.blur();window.scrollTo(0,0);true');
    await ctx.sleep(500);
    const z = await s.zustand();
    return z.gespeicherterText;
  }
  async function messen(name, rollen = false, bild) {
    if (rollen) await s.c.evaluate(ROLLEN);
    await ctx.sleep(350);
    const m = await s.c.evaluate(MESSUNG);
    await ctx.save(name + '.json',m);
    if (bild) await ctx.shot(bild);
    return m;
  }
  async function activity(name) {
    const a = await ctx.shell('dumpsys activity activities'); await ctx.save(name + '-activity.txt',a); return a;
  }
  async function stand(name, mitIme = false) {
    const z = {messung:await messen(name),speicher:await s.c.evaluate('localStorage.getItem(' + JSON.stringify(quelle.storage) + ')'),activity:await activity(name)};
    if (mitIme) {
      z.ime = await ctx.shell('dumpsys input_method');
      z.fenster = await ctx.shell('dumpsys window windows');
      await ctx.save(name + '-ime.txt',z.ime); await ctx.save(name + '-fenster.txt',z.fenster);
    }
    return z;
  }
  async function back() { await ctx.shell('input keyevent KEYCODE_BACK'); await ctx.sleep(1000); }
  async function tipp(ziel) { await menueTipp(ctx,s.c,key + '-' + (++fallNr),ziel); }
  async function rueckkehr() {
    const nach = await s.zustand(key + '-nach');
    const rueck = await stand(key + '-rueckkehr');
    await tipp('knopf'); const erneut = await stand(key + '-erneut'); await tipp('x');
    return {nach,rueckkehr:rueck,erneut};
  }
  async function fall(f, n, fn) {
    key = 'menue/' + f.toLowerCase() + '-' + n;
    belege = new Set();
    const m = {schema:MENUE_SCHEMA,fall:f,name:n};
    ctx.log('Menü: ' + f + ' ' + n);
    try { m.messung = await fn(); }
    catch(e) {
      m.fehler = e.message;
      try { await ctx.shot(key + '-fehler.png'); } catch { /* Ursprünglicher Fehler bleibt. */ }
    }
    // Die Fallkopie enthält die Beobachtungen vor der Auswertung, keine Soll-Ist-Markierungen.
    await ctx.save(key + '-roh.json',m);
    for (const pfad of menueDateibelege(m.messung)) belege.add(pfad);
    m.belege = [];
    for (const pfad of belege) m.belege.push({pfad,sha256:hash(await readFile(join(ctx.ausgabe,pfad)))});
    belege = null;
    roh.faelle.push(m); await original.save('menue-roh.json',roh);
    ctx.befund(menueFallId(m),{...evaluiereMenueFall(m),details:{belege:m.belege.map(b=>b.pfad)}});
  }
  try {
    for (const font of [1,2]) {
      await fall('M-1','schrift-' + font,async () => {
        await vorbereiten(font);
        const oben = await messen(key + '-oben',false,'menue-schrift-' + font + '-oben.png');
        await s.c.evaluate('Array.from(document.querySelectorAll("details.app-abschnitt")).forEach(function(d){d.open=true});window.scrollTo(0,document.documentElement.scrollHeight);true');
        const ende = await messen(key + '-ende',false,'menue-schrift-' + font + '-ende.png');
        await tipp('knopf');
        const offen = await messen(key + '-offen',false,'menue-schrift-' + font + '-offen.png');
        const unten = await messen(key + '-unten',true,'menue-schrift-' + font + '-unten.png');
        await tipp('x');
        return {schrift:font,oben,ende,offen,unten};
      });
    }
    for (const art of ['x','aussen','zurueck','geste']) {
      await fall('M-2',art,async () => {
        let vorher = await vorbereiten();
        let navigation, geste, umschaltung;
        try {
          if (art === 'geste') {
            muss(navVorher.liste.some(n => n.name === 'com.android.internal.systemui.navbar.gestural'),'Gesten-Overlay fehlt.');
            navGeaendert = true;
            umschaltung = await gestenNavigation(ctx,s,key);
            navigation = umschaltung.nach.navigation; vorher = umschaltung.nach.projekt;
          }
          await tipp('knopf'); await menueOeffnungBestaetigen(ctx,s.c);
          const offen = await stand(key + '-offen');
          if (art === 'geste') {
            const groesse = await ctx.shell('wm size');
            await ctx.save(key + '-bildschirm.txt',groesse);
            const m = /(?:Override|Physical) size: (\d+)x(\d+)/.exec(groesse);
            muss(m,'Bildschirmmaße fehlen.');
            geste = 'input swipe 1 ' + Math.floor(Number(m[2])/2) + ' ' + Math.floor(Number(m[1])*.65) + ' ' + Math.floor(Number(m[2])/2) + ' 450';
            await ctx.shell(geste); await ctx.sleep(1000);
          } else if (art === 'zurueck') await back(); else await tipp(art);
          const nach = await stand(key + '-nach'); await ctx.shot(key + '-nach.png');
          await back(); const systemweg = await activity(key + '-systemweg');
          return {vorher,offen,nach,systemweg,...(navigation?{navigation,geste,umschaltung}:{})};
        } finally { await navRestore(); }
      });
    }
    await fall('M-3','tastatur',async () => {
      await vorbereiten();
      await ctx.shell('settings put secure show_ime_with_hard_keyboard 1');
      await menueTipp(ctx,s.c,key + '-eingabe','eingabe'); await ctx.sleep(500);
      const vor = await stand(key + '-vor',true); await ctx.shot('menue-tastatur-vor.png');
      muss(imeSichtbar(vor.ime),'Tastatur vor Menüöffnung nicht sichtbar.');
      await tipp('knopf'); const offen = await stand(key + '-offen',true); await ctx.shot('menue-tastatur-offen.png');
      const schritte = [], anzahl = imeSichtbar(offen.ime) ? 3 : 2;
      for (let i=0;i<anzahl;i++) {
        await back();
        schritte.push(i===anzahl-1 ? {activity:await activity(key + '-zurueck-' + (i+1))}
          : await stand(key + '-zurueck-' + (i+1),true));
        await ctx.shot(key + '-zurueck-' + (i+1) + '.png');
      }
      return {vor,offen,schritte};
    });
    await fall('M-4','speichern',async () => {
      const vorher = await vorbereiten();
      // Derselbe Dateiphasenbaustein, zuerst bisherige Schaltfläche, danach das Sheet.
      const menueKlick = s.klick.bind(s);
      s.klick = Sitzung.prototype.klick.bind(s);
      const button = await s.exportieren('json',key + '-button');
      s.klick = menueKlick;
      const sheet = await s.exportieren('json',key + '-sheet');
      return {vorher,button,sheet,...await rueckkehr()};
    });
    await fall('M-4','teilen',async () => {
      const vorher = await vorbereiten();
      const teilen = await s.teilen('xlsx',key);
      const teilenXml = await readFile(join(ctx.ausgabe,key + '-teilen-ansicht.xml'),'utf8');
      await ctx.save(key + '-teilen-roh.xml',teilenXml);
      return {vorher,teilen,teilenXml,...await rueckkehr()};
    });
    await fall('M-4','import',async () => {
      const vorher = await vorbereiten();
      // Ein echter Export liefert die gültige Quelldatei; anschließend anderes Projekt anzeigen.
      const basis = await s.exportieren('json',key + '-basis');
      const bytes = Buffer.from(basis.ziel.base64,'base64'), name = '0-' + prefix + '-import.json';
      await s.push(bytes,name,prefix);
      await s.fuellen({projektname:prefix + ' vor Import'});
      const importVorher = (await s.zustand()).gespeicherterText;
      const imp = await s.importieren(key,name,bytes);
      const erwartet = (await s.zustand()).gespeicherterText;
      return {vorher:importVorher,erwartet,import:imp,...await rueckkehr()};
    });
    await fall('M-4','neu',async () => {
      const vorher = await vorbereiten();
      await s.klick('reset-project');
      const dialog = await ctx.uiBaum(key + '-dialog');
      await ctx.save(key + '-dialog.xml',dialog); await ctx.shot(key + '-dialog.png');
      const abbrechen = knoten(dialog).find(n => n.class === 'android.widget.Button' && n.text?.toLowerCase() === 'abbrechen' && flaeche(n));
      muss(abbrechen,'Deutsche Abbrechen-Schaltfläche fehlt.'); await tippe(ctx,abbrechen); await ctx.sleep(700);
      return {vorher,dialog,...await rueckkehr()};
    });
    for (const font of [1,2]) await fall('M-5','schrift-' + font,async () => {
      const vorher = await vorbereiten(font);
      await s.klick('save-json');
      const picker = await auswahl(ctx,key);
      await ctx.save(key + '-picker.xml',picker); await ctx.shot('menue-sperre-' + font + '-systemauswahl.png');
      const vor = await s.zustand();
      // Die native Auswahl verdeckt die App. Nur das normale DOM bedienen; keine
      // angehaltene Promise, keine Diagnosemethode und kein künstlicher Auftrag.
      await s.c.evaluate('document.querySelector(".fr-menue-leiste button[aria-controls]").click();true');
      const offen = await messen(key + '-offen'), unten = await messen(key + '-unten',true);
      await s.c.evaluate('Array.from(document.querySelectorAll("[role=dialog] [role=region] button")).forEach(function(b){b.click()});true');
      await ctx.sleep(500);
      await s.c.evaluate('document.querySelector("[role=dialog] button[aria-label=Schließen]").click();true');
      const zu = await messen(key + '-zu'), nach = await s.zustand();
      await back();
      const rueck = await stand(key + '-rueckkehr');
      return {schrift:font,vorher,picker,offen,unten,zu,aufrufeVor:vor.bruecke.aufrufe,aufrufeNach:nach.bruecke.aufrufe,
        antwortenVor:vor.bruecke.antworten,antwortenNach:nach.bruecke.antworten,rueckkehr:rueck};
    });
    await fall('M-6','neuerstellung',async () => {
      const vorher = await vorbereiten(); await tipp('knopf');
      const offen = await stand(key + '-offen'), seiteVor = await s.c.evaluate('performance.timeOrigin');
      await schrift(1.3); await ctx.sleep(1800);
      await s.verbinden(true);
      const seiteNach = await s.c.evaluate('performance.timeOrigin'), nach = await stand(key + '-nach');
      await ctx.shot(key + '-nach.png'); await back();
      return {vorher,offen,seiteVor,seiteNach,nach,systemweg:await activity(key + '-systemweg')};
    });
    await fall('M-6','querformat',async () => {
      const vorher = await vorbereiten(2); await tipp('knopf');
      await ctx.shell('settings put system user_rotation 1'); await ctx.sleep(1800);
      const nach = await stand(key + '-nach');
      nach.messung = await messen(key + '-unten',true,'menue-querformat-unten.png');
      await tipp('x'); const rueck = await stand(key + '-nach-x');
      await tipp('knopf'); await tipp('Neues Projekt');
      const dialog = await ctx.uiBaum(key + '-aktion');
      await ctx.save(key + '-aktion.xml',dialog); await ctx.shot('menue-querformat-aktion.png');
      await back();
      return {vorher,schrift:2,nach,xNachRollen:true,rueckkehr:rueck,dialog};
    });
    await fall('A10','offen',async () => {
      await vorbereiten(); await tipp('knopf');
      const xml = [];
      // Überlappende Abschnitte erfassen auch mittlere Einträge auf kleinen Flächen.
      for (let i=0;i<5;i++) {
        const x = await ctx.uiBaum(key + '-' + i); xml.push(x); await ctx.save(key + '-' + i + '.xml',x);
        await s.c.evaluate('(function(){var s=document.querySelector("[role=dialog]"),l=s.classList.contains("fr-menue-kompakt")?s:s.querySelector("[role=region]");l.scrollTop+=l.clientHeight*.6;return true;})()');
        await ctx.sleep(250);
      }
      let ax, axFehler;
      try { await s.c.send('Accessibility.enable'); ax = await s.c.send('Accessibility.getFullAXTree'); }
      catch(e) { axFehler = e.message; }
      await ctx.save(key + '-ax.json',ax ?? {axFehler});
      await tipp('x');
      return {xml,...(ax?{ax}:{axFehler})};
    });
    await navRestore(); await schrift(1);
    await ctx.shell('settings put system user_rotation 0'); await ctx.sleep(1200);
    await fall('M-7','release',() => menueRelease(ctx,key));
  } finally {
    // Vollständigkeit auch nach einem vorzeitig beendeten Lauf aus den Rohdaten sichtbar.
    for (const [fall,name] of MENUE_FAELLE) if (!roh.faelle.some(m => m.fall===fall && m.name===name))
      { const fehlt = {schema:MENUE_SCHEMA,fall,name,fehler:'Nicht ausgeführt.',belege:[]};
        roh.faelle.push(fehlt); ctx.befund(menueFallId(fehlt),evaluiereMenueFall(fehlt)); }
    await original.save('menue-roh.json',roh);
    ctx.befund('menue-abdeckung',menueAbdeckung(roh,ctx.api));
    ctx.befund('M-Sichtprüfung',sichtpruefungAusstehend(SICHTPRUEFUNGEN['M-Sichtprüfung']));
    ctx.befund('menue-grenzen',befund('dokumentierte Grenze','Abgeschlossene Randgeste mit input swipe, kein Abbruch einer Predictive-Back-Geste. DOM-Fokus und Barrierebäume ersetzen keine TalkBack-Prüfung auf dem Gerät.'));
  }
}

// Kein CDP-Zugriff: auch die Tippkoordinaten kommen ausschließlich aus uiautomator.
export async function menueRelease(ctx, key, signieren = signiereRelease) {
  await ctx.uninstall(ctx.app);
  const eingangSha256 = sha256(ctx.release);
  const apk = await signieren(ctx,ctx.release);
  const eingangNachherSha256 = sha256(ctx.release);
  await ctx.install(apk,ctx.app); await ctx.start(ctx.app);
  const paket = await ctx.shell('dumpsys package ' + ctx.app); await ctx.save(key + '-paket.txt',paket);
  await warte(ctx,async i => {
    try { await nativeSchaltflaeche(ctx,key + '-oeffnen-' + i,'Dateiaktionen',ctx.app); return true; }
    catch(e) { if (e.message !== 'Schaltfläche Dateiaktionen nicht sichtbar oder gesperrt.') throw e; return false; }
  },20,500);
  const offenXml = await ctx.uiBaum(key + '-offen'); await ctx.save(key + '-offen.xml',offenXml); await ctx.shot('menue-release-offen.png');
  await ctx.shell('input keyevent KEYCODE_BACK'); await ctx.sleep(1000);
  const zuXml = await ctx.uiBaum(key + '-zu'); await ctx.save(key + '-zu.xml',zuXml);
  const erstesZurueck = await ctx.shell('dumpsys activity activities'); await ctx.save(key + '-erstes-zurueck-activity.txt',erstesZurueck);
  await ctx.shell('input keyevent KEYCODE_BACK'); await ctx.sleep(1000);
  const zweitesZurueck = await ctx.shell('dumpsys activity activities'); await ctx.save(key + '-zweites-zurueck-activity.txt',zweitesZurueck);
  return {paket,offenXml,zuXml,erstesZurueck,zweitesZurueck,ohneCdp:true,apkSha256:sha256(apk),eingangSha256,eingangNachherSha256};
}
