// SPDX-License-Identifier: Apache-2.0
import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { isDeepStrictEqual as gleich } from 'node:util';
import { createHash } from 'node:crypto';
import { APP } from './rahmen.mjs';
import { MENUE_NAMEN } from './menue-ui.mjs';
import { knoten } from './dateien-ui.mjs';
import { befund, evaluiereActivity, evaluiereZurueck, evaluiereReleaseFlags, evaluiereDateiFall } from '../emulator-auswertung.mjs';

export const MENUE_SCHEMA = 1;
export const MENUE_FAELLE = Object.freeze([
  ['M-1','schrift-1'], ['M-1','schrift-2'],
  ...['x','aussen','zurueck','geste'].map(n => ['M-2',n]),
  ['M-3','tastatur'], ...['speichern','teilen','import','neu'].map(n => ['M-4',n]),
  ['M-5','schrift-1'], ['M-5','schrift-2'], ['M-6','neuerstellung'], ['M-6','querformat'],
  ['M-7','release'], ['A10','offen'],
]);
export const menueFallId = m => 'menue-' + m?.fall + '-' + m?.name;
const ok = g => befund('bestanden',g);
const nein = g => befund('nicht bestanden',g);
const invalid = g => befund('ungültig',g);
const grenze = g => befund('dokumentierte Grenze',g);
const muss = (v,g) => { if (!v) throw new Error(g); };
const bool = v => typeof v === 'boolean';
const text = v => typeof v === 'string' && v.length > 0;
const rect = r => r && ['x','y','width','height','right','bottom'].every(k => Number.isFinite(r[k])) && r.width >= 0 && r.height >= 0;
const oben = a => { const r = evaluiereActivity(a); muss(r.status !== 'ungültig',r.grund); return r.status === 'bestanden'; };
const weg = a => { const r = evaluiereZurueck(a); muss(r.status !== 'ungültig',r.grund); return r.status === 'bestanden'; };
const hash = b => createHash('sha256').update(b).digest('hex');
export function imeSichtbar(roh) {
  muss(text(roh),'IME-Rohtext fehlt.');
  const signale = ['InputShown','WindowVisible','DecorViewVisible'].map(n =>
    [...roh.matchAll(new RegExp('\\bm' + n + '=(true|false)\\b','g'))].map(m => m[1]));
  muss(signale.every(s => s.length) && new Set(signale.flat()).size === 1,'IME-Sichtbarkeit nicht eindeutig lesbar.');
  return signale[0][0] === 'true';
}
export function messungGueltig(m) {
  muss(m && bool(m.hidden) && bool(m.fokusAmKnopf) && bool(m.kompakt) && bool(m.sperrhinweis)
    && Number.isInteger(m.anzahl) && Number.isInteger(m.gesperrt)
    && Number.isFinite(m.dokumentBreite) && m.viewport?.width > 0 && m.viewport?.height > 0
    && ['sheet','leiste','kopf','erste','letzte','x'].every(k => rect(m[k]))
    && Array.isArray(m.abgeschnitten),'Menümessung unvollständig.');
  return m;
}
function layout(m, ende = false) {
  messungGueltig(m);
  const breite = m.dokumentBreite <= m.viewport.width + 1 && m.abgeschnitten.length === 0;
  if (m.hidden) return breite && m.leiste.y >= -1 && m.leiste.bottom <= m.viewport.height + 1;
  const r = ende ? m.letzte : m.erste;
  return breite && m.anzahl === 8 && m.sheet.y >= m.leiste.bottom + 7
    && m.sheet.bottom <= (m.viewport.visual ? m.viewport.visual.top + m.viewport.visual.height : m.viewport.height) + 1
    && r.y >= (ende || m.kompakt ? m.sheet.y : m.kopf.bottom) - 1 && r.bottom <= m.sheet.bottom + 1;
}
function vollstaendigImSheet(r, m, abY = m.sheet.y) {
  const oben = m.viewport.visual?.top ?? 0;
  const unten = m.viewport.visual ? oben + m.viewport.visual.height : m.viewport.height;
  return r.width > 0 && r.height > 0 && r.x >= Math.max(0,m.sheet.x) - 1
    && r.right <= Math.min(m.viewport.width,m.sheet.right) + 1
    && r.y >= Math.max(oben,abY) - 1 && r.bottom <= Math.min(unten,m.sheet.bottom) + 1;
}
function stand(z) {
  muss(z && text(z.speicher) && text(z.activity),'Projekt- oder Activitybeleg fehlt.');
  const projekt = JSON.parse(z.speicher);
  muss(projekt?.input?.projekt?.projektname,'Gespeichertes Testprojekt fehlt.');
  messungGueltig(z.messung);
  return z;
}
function geschlossen(z, vorher) {
  stand(z); return oben(z.activity) && z.messung.hidden && z.messung.fokusAmKnopf && z.speicher === vorher;
}
function offen(z) { stand(z); return oben(z.activity) && !z.messung.hidden && z.messung.anzahl === 8; }

function nachfahren(nodes, wurzeln) {
  const kinder = new Map();
  const verbinden = (parent, child) => {
    if (parent === undefined || child === undefined) return;
    if (!kinder.has(parent)) kinder.set(parent,new Set());
    kinder.get(parent).add(child);
  };
  for (const n of nodes) {
    verbinden(n.parentId,n.nodeId);
    for (const child of n.childIds ?? []) verbinden(n.nodeId,child);
  }
  const erfasst = new Set(wurzeln), offen = [...erfasst];
  for (let i=0;i<offen.length;i++) for (const child of kinder.get(offen[i]) ?? []) {
    if (!erfasst.has(child)) { erfasst.add(child); offen.push(child); }
  }
  return erfasst;
}

export function evaluiereMenueBaum(m) {
  muss(m && Array.isArray(m.xml) && m.xml.length >= 2,'Ansichtsbäume oben und unten fehlen.');
  const nodes = m.xml.flatMap(knoten).filter(n => n.package === APP && n.enabled !== 'false');
  const namen = nodes.flatMap(n => [n.text,n['content-desc']]);
  const hintergrund = nodes.filter(n => (n.clickable === 'true' || n.focusable === 'true')
    && (n.class === 'android.widget.EditText' || /^(?:Berechnen|Projekt exportieren|Neues Projekt anlegen)$/.test(n.text || '')));
  if (hintergrund.length) return nein('Bedienbarer Hintergrund im Android-Ansichtsbaum.');
  if (!namen.includes('Dateiaktionen') || !namen.includes('Schließen') || MENUE_NAMEN.some(n => !namen.includes(n))) return nein('Dialogname, Schließen oder Menüeinträge fehlen im Android-Ansichtsbaum.');
  if (m.axFehler) {
    if (/^CDP-Zeitüberschreitung: Accessibility\.(?:enable|getFullAXTree)$|^CDP -32601:/.test(m.axFehler))
      return grenze('Android-Ansichtsbaum mit Namen vorhanden; CDP-Barrierebaum nicht verfügbar. Dialogrolle und vollständiger Hintergrundausschluss bleiben offen. uiautomator ist nicht TalkBack.');
    return invalid('Barrierebaum nicht auswertbar: ' + m.axFehler);
  }
  muss(Array.isArray(m.ax?.nodes) && m.ax.nodes.length,'CDP-Barrierebaum fehlt.');
  // Ältere WebViews liefern aria-hidden im vollständigen AX-Baum als hidden,
  // ohne ignored zu setzen. Der Ausschluss gilt für den ganzen Teilbaum.
  // ignored allein kann dagegen einen neutralen Container sichtbarer Kinder markieren.
  const verborgen = nachfahren(m.ax.nodes,m.ax.nodes.filter(n => n.properties?.some(p => p.name === 'hidden' && p.value?.value === true)).map(n => n.nodeId));
  const sichtbar = m.ax.nodes.filter(n => n.ignored === false && !verborgen.has(n.nodeId));
  const dialogs = sichtbar.filter(n => n.role?.value === 'dialog' && n.name?.value === 'Dateiaktionen');
  if (dialogs.length !== 1) return nein('Dialog mit Namen Dateiaktionen fehlt oder ist nicht eindeutig.');
  const innen = nachfahren(m.ax.nodes,[dialogs[0].nodeId]);
  const buttons = sichtbar.filter(n => innen.has(n.nodeId) && n.role?.value === 'button').map(n => n.name?.value);
  if (!buttons.includes('Schließen') || MENUE_NAMEN.some(n => !buttons.includes(n))) return nein('Menübuttons fehlen im Dialog des Barrierebaums.');
  const bedienbar = n => ['button','textbox','combobox','checkbox','radio','link','spinbutton','Date','DisclosureTriangle'].includes(n.role?.value)
    || n.properties?.some(p => p.name === 'focusable' && p.value?.value === true);
  if (sichtbar.some(n => !innen.has(n.nodeId) && !['RootWebArea','WebArea'].includes(n.role?.value) && bedienbar(n))) return nein('Bedienbarer Hintergrund außerhalb des Dialogs im Barrierebaum.');
  return ok('Dialog, Schließen und acht Aktionen im Baum; kein bedienbarer Hintergrund. uiautomator und CDP ersetzen kein TalkBack.');
}

export function evaluiereMenueFall(m) {
  try {
    muss(m?.schema === MENUE_SCHEMA && MENUE_FAELLE.some(([f,n]) => f === m.fall && n === m.name),'Unbekanntes Menüfallschema.');
    if (m.fehler) return invalid('Messung abgebrochen: ' + m.fehler);
    const v = m.messung;
    muss(v && typeof v === 'object','Rohmessung fehlt.');
    switch (m.fall) {
      case 'M-1': {
        muss(v.schrift === Number(m.name.slice(-1)),'Systemschrift nicht belegt.');
        const werte = ['oben','ende','offen','unten'].map(k => messungGueltig(v[k]));
        return werte[0].hidden && werte[1].hidden && !werte[2].hidden && !werte[3].hidden
          && werte.every((x,i) => layout(x,i===3)) ? ok('Maße und Inhalt oben, am Seitenende, offen und bis zur letzten Aktion geprüft. Gesperrter Zustand separat in M-5.')
          : nein('Abgeschnittener Inhalt oder nicht erreichbare Menüaktion.');
      }
      case 'M-2':
        muss(text(v.vorher) && text(v.systemweg),'Ausgangsstand oder normaler Systemweg fehlt.');
        if (m.name === 'geste') muss(v.navigation?.modus === '2' && v.navigation.liste?.some(n => n.aktiv && n.name === 'com.android.internal.systemui.navbar.gestural') && /^input swipe 1 \d+ \d+ \d+ 450$/.test(v.geste),'Abgeschlossene Randgeste im Gestenmodus nicht belegt.');
        return offen(v.offen) && geschlossen(v.nach,v.vorher) && weg(v.systemweg) ? ok('Schließweg schließt Sheet, erhält Projekt und App mit Fokus am Knopf; danach normaler Systemweg.')
          : nein('Schließweg, Fokus, Projektdaten oder folgender Systemweg weichen ab.');
      case 'M-3': {
        stand(v.vor); stand(v.offen);
        muss(imeSichtbar(v.vor.ime) && v.vor.messung.aktivesElement?.name === 'projektname','Tastatur mit Fokus auf Projektname vor Öffnen nicht belegt.');
        muss(Array.isArray(v.schritte) && v.schritte.length >= 2,'Zurück-Folge fehlt.');
        const imeOffen = imeSichtbar(v.offen.ime), anzahl = imeOffen ? 3 : 2;
        if (!offen(v.offen) || v.schritte.length !== anzahl) return nein('Menüöffnung oder Länge der Zurück-Folge weicht ab.');
        let i = 0;
        if (imeOffen) {
          const z = stand(v.schritte[i++]);
          if (!offen(z) || imeSichtbar(z.ime) || z.speicher !== v.vor.speicher) return nein('Erstes Zurück muss nur die Tastatur schließen.');
        }
        const zu = v.schritte[i++];
        return geschlossen(zu,v.vor.speicher) && !imeSichtbar(zu.ime) && weg(v.schritte[i].activity)
          ? ok('Tastatur vor Öffnen belegt; danach ' + (imeOffen?'sichtbar, drei':'verborgen, zwei') + ' Zurück-Schritte bis zum Verlassen.')
          : nein('Tastaturfolge verändert Projekt, Fokus oder Systemweg.');
      }
      case 'M-4': {
        muss(text(v.vorher) && v.nach?.meldungen,'Ausgangsstand oder Statusregionen fehlen.');
        if (!geschlossen(v.rueckkehr,v.erwartet ?? v.vorher) || !offen(v.erneut)) return nein('Rückkehr oder erneute Menübedienung fehlgeschlagen.');
        if (m.name === 'speichern') {
          for (const e of [v.button,v.sheet]) {
            const b = evaluiereDateiFall({schema:1,fall:'D1',name:'json',variante:'debug',format:'json',...e});
            if (b.status !== 'bestanden') return b;
          }
          return v.button.ziel.base64 === v.sheet.ziel.base64 && v.nach.meldungen.json === 'Projektdatei gespeichert.'
            ? ok('Beide Android-Speicherwege bytegleich bei fester Messzeit; gemeinsame Statusregion und Fokus bestätigt.')
            : nein('Speicherwege oder Statusregion weichen ab.');
        }
        if (m.name === 'teilen') {
          muss(text(v.teilen?.obenTeilen) && text(v.teilenXml),'Teilenbeleg fehlt.');
          if (v.nach.meldungen.xlsx !== 'Excel-Datei zum Teilen bereitgestellt.' || !v.teilen.erneuterAuftrag) return nein('Teilenstatus oder erneuter Auftrag fehlt.');
          if (v.teilen.modus !== 'auswahl') return grenze('System öffnet einen Empfänger direkt oder hat keinen Empfänger. Öffnung, Abbruch und Rückkehr belegt; Teilen-Auswahl nicht sichtbar.');
          return /ChooserActivity|ResolverActivity/.test(v.teilen.obenTeilen) ? ok('Teilen-Auswahl, Abbruch, Statusregion und erneute Bedienung belegt.') : nein('Teilen-Auswahl fehlt.');
        }
        if (m.name === 'import') {
          const b = evaluiereDateiFall({schema:1,fall:'D6',name:'import',variante:'debug',...v.import});
          if (b.status !== 'bestanden') return b;
          return v.nach.meldungen.import ? ok('Download importiert; Formular, Speicher, Statusregion und Fokus bestätigt.') : nein('Importstatus fehlt.');
        }
        const namen = knoten(v.dialog).flatMap(n => [n.text,n['content-desc']]).filter(Boolean).map(n => n.toLocaleLowerCase('de'));
        return ['Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?','Abbrechen','Zurücksetzen'].every(n => namen.includes(n.toLocaleLowerCase('de')))
          && v.nach.gespeicherterText === v.vorher && v.nach.meldungen.reset === ''
          ? ok('Deutscher Dialog; Abbrechen erhält Projekt und Status ohne Erfolgsmeldung.') : nein('Dialog oder Abbruch verändert den Stand.');
      }
      case 'M-5': {
        muss(v.schrift === Number(m.name.slice(-1)) && text(v.picker) && /documentsui/.test(v.picker),'Echte offene Speicherauswahl fehlt.');
        muss(Array.isArray(v.aufrufeVor) && Array.isArray(v.aufrufeNach) && Array.isArray(v.antwortenVor) && Array.isArray(v.antwortenNach),'Brückenprotokoll fehlt.');
        for (const k of ['offen','unten','zu']) messungGueltig(v[k]);
        const pending = v.aufrufeVor.filter(a => a.methode === 'speichernUnter').length === 1 && !v.antwortenVor.some(a => a.methode === 'speichernUnter');
        if (!pending || !gleich(v.aufrufeVor,v.aufrufeNach) || !gleich(v.antwortenVor,v.antwortenNach)
          || v.offen.hidden || v.offen.gesperrt !== 8 || !v.offen.sperrhinweis || !layout(v.offen) || !layout(v.unten,true)
          || !v.zu.hidden || !v.zu.fokusAmKnopf || !geschlossen(v.rueckkehr,v.vorher)) return nein('Laufender Auftrag, Vollsperre, Schließen oder Ausschluss eines zweiten Auftrags nicht bestätigt.');
        return grenze('Echter laufender Speicherauftrag: acht Einträge gesperrt, Hinweis, Maße und Schließen im Hintergrund-DOM belegt, kein zweiter Auftrag. Android-Auswahl verdeckt die App; gesperrtes Sheet nicht per Bildschirmtipp oder Sichtbild abgenommen.');
      }
      case 'M-6':
        muss(text(v.vorher),'Projekt vor Lebensdauerprobe fehlt.');
        if (m.name === 'neuerstellung') {
          muss(Number.isFinite(v.seiteVor) && Number.isFinite(v.seiteNach),'Seitenidentität fehlt.');
          return offen(v.offen) && v.seiteVor !== v.seiteNach && stand(v.nach).messung.hidden && oben(v.nach.activity)
            && v.nach.speicher === v.vorher && weg(v.systemweg)
            ? ok('Neue Seite nach Schriftwechsel, Sheet geschlossen, Projektdaten erhalten; Zurück verlässt die App.')
            : nein('Neuerstellung, geschlossenes Menü oder deaktivierter Zurück-Weg nicht bestätigt.');
        }
        return v.schrift === 2 && offen(v.nach) && v.nach.messung.viewport.width > v.nach.messung.viewport.height
          && layout(v.nach.messung,true)
          && vollstaendigImSheet(v.nach.messung.letzte,v.nach.messung,v.nach.messung.kompakt ? v.nach.messung.sheet.y : v.nach.messung.kopf.bottom)
          // Im kompakten Sheet rollen Kopf und Aktionen gemeinsam. Der folgende
          // X-Tipp darf deshalb erst zum Kopf zurückrollen; die Rückkehr belegt ihn.
          && v.xNachRollen === true && geschlossen(v.rueckkehr,v.vorher) && /Alle Eingaben/.test(v.dialog)
          ? ok('Querformat mit Schrift 2,0 ohne Überlauf; X und vollständige Aktion Neues Projekt per Tipp erreicht.')
          : nein('Querformat ohne Überlauf, erreichbares X oder vollständige Aktion nicht bestätigt.');
      case 'M-7': {
        const flags = evaluiereReleaseFlags({dumpsys:v.paket,paket:APP});
        if (flags.status !== 'bestanden') return flags;
        const b = knoten(v.offenXml).filter(n => n.package === APP), z = knoten(v.zuXml).filter(n => n.package === APP), namen = b.flatMap(n => [n.text,n['content-desc']]);
        muss(v.ohneCdp === true && [v.apkSha256,v.eingangSha256,v.eingangNachherSha256].every(h => /^[a-f0-9]{64}$/.test(h ?? '')),'Release-Identität oder Messweg fehlt.');
        if (v.eingangSha256 !== v.eingangNachherSha256) return nein('Eingabe-APK beim Signieren verändert.');
        return namen.includes('Dateiaktionen') && namen.includes('Schließen') && namen.includes('Projekt speichern unter')
          && z.some(n => n.text === 'Dateiaktionen' || n['content-desc'] === 'Dateiaktionen')
          && !z.some(n => n.text === 'Schließen' || n['content-desc'] === 'Schließen') && oben(v.erstesZurueck) && weg(v.zweitesZurueck)
          ? ok('Release ausschließlich über uiautomator und dumpsys: Menü geöffnet, erstes Zurück schließt, zweites verlässt App.')
          : nein('Release-Menü oder Zurück-Folge weicht ab.');
      }
      case 'A10': return evaluiereMenueBaum(v);
    }
  } catch(e) { return invalid(e.message); }
}

export function menueAbdeckung(roh, api) {
  if (roh?.schema !== MENUE_SCHEMA || ![30,36].includes(roh.api) || (api !== undefined && roh.api !== api) || !Array.isArray(roh.faelle))
    return invalid('Menü-Rohschema oder API stimmt nicht.');
  const ids = roh.faelle.map(menueFallId), soll = MENUE_FAELLE.map(([fall,name]) => menueFallId({fall,name}));
  return ids.length === soll.length && new Set(ids).size === soll.length && soll.every(id => ids.includes(id))
    ? ok('Alle Menüfälle einschließlich Release und Barrierebaum vorhanden.') : invalid('Menüfälle fehlen, sind doppelt oder unbekannt.');
}
export async function werteMenueAus(lauf, api) {
  let roh;
  try { roh = JSON.parse(await readFile(resolve(lauf,'menue-roh.json'),'utf8')); }
  catch(e) { return [{id:'menue-abdeckung',...invalid('Menü-Rohdaten fehlen: ' + e.message)}]; }
  const result = [{id:'menue-abdeckung',...menueAbdeckung(roh,api)}];
  if (!Array.isArray(roh.faelle)) return result;
  const basis = await realpath(lauf);
  for (const m of roh.faelle) {
    let wert;
    try {
      muss(Array.isArray(m.belege) && m.belege.length > 0,'Belegliste fehlt.');
      for (const b of m.belege) {
        muss(typeof b.pfad === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(b.pfad) && !b.pfad.split('/').some(s => !s || s === '.' || s === '..'),'Ungültiger Belegpfad.');
        const p = resolve(basis,b.pfad), info = await lstat(p), wirklich = await realpath(p), rel = relative(basis,wirklich);
        muss(info.isFile() && !info.isSymbolicLink() && rel && !rel.startsWith('..') && !isAbsolute(rel),'Beleg außerhalb des Laufordners.');
        const bytes = await readFile(p);
        muss(hash(bytes) === b.sha256,'Beleg verändert: ' + b.pfad);
      }
      const name = 'menue/' + m.fall.toLowerCase() + '-' + m.name + '-roh.json';
      muss(m.belege.some(b => b.pfad === name),'Fallkopie fehlt.');
      const kopie = JSON.parse(await readFile(resolve(basis,name),'utf8'));
      const {belege: ignoriert, ...daten} = m;
      muss(gleich(kopie,daten),'Fallkopie und Rohsammlung unterscheiden sich.');
      for (const pfad of menueDateibelege(m.messung)) muss(m.belege.some(b => b.pfad === pfad),'Dateibeleg fehlt im Inventar: ' + pfad);
      async function dateiInhalte(v) {
        if (!v || typeof v !== 'object') return;
        if (typeof v.datei === 'string') {
          const bytes = await readFile(resolve(basis,v.datei));
          muss(v.base64 === bytes.toString('base64') && v.bytes === bytes.length && v.sha256 === hash(bytes),
            'Dateideskriptor weicht von den Rohbytes ab: ' + v.datei);
        }
        if (typeof v.quelleDatei === 'string') {
          const bytes = await readFile(resolve(basis,v.quelleDatei));
          muss(v.quelleSha256 === hash(bytes) && v.bytes === bytes.length,'Importquelle weicht von den Rohbytes ab.');
        }
        for (const a of Object.values(v)) await dateiInhalte(a);
      }
      await dateiInhalte(m.messung);
      wert = evaluiereMenueFall(m);
    } catch(e) { wert = invalid(e.message); }
    result.push({id:menueFallId(m),...wert,details:{belege:Array.isArray(m?.belege)?m.belege.map(b=>b.pfad):[]}});
  }
  return result;
}

// Die vorhandenen Dateihelfer schreiben Dateien teils direkt; diese Referenzen
// werden zusätzlich ins Prüfsummenverzeichnis aufgenommen.
export function menueDateibelege(v) {
  const result = new Set();
  function visit(x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(visit); return; }
    for (const [k,a] of Object.entries(x)) {
      if (['datei','quelleDatei'].includes(k) && typeof a === 'string') result.add(a);
      else if (k === 'belege' && Array.isArray(a)) a.filter(p => typeof p === 'string').forEach(p => result.add(p));
      else visit(a);
    }
  }
  visit(v); return [...result];
}
