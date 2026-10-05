import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { anfrageBewerten } from './auswertung.mjs';
import { Messfehler, messbefehl, produktbefundPruefen } from './fehler.mjs';

// Instrumentierung ausschließlich im Prüfdokument, Originalaufrufe unverändert.
// Der Webadapter widerruft Blob-URLs nach 1 s; diese Zeit muss bei einem fehlenden
// Downloadbeginn neben dem echten Klick und Downloadanker sichtbar bleiben.
export const exportInstrumentationQuelle = `
globalThis.__browserLaufExportKlicks=[];
globalThis.__browserLaufDownloadAnker=[];
globalThis.__browserLaufBlobURLs=[];
document.addEventListener('click',e=>{
  const ziel=e.target.closest?.('#save-json,#export-excel,#export-pdf');
  if(ziel)globalThis.__browserLaufExportKlicks.push({id:ziel.id,isTrusted:e.isTrusted,fokus:document.hasFocus(),zeit:Date.now()});
},true);
const ankerKlick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){
  if(this.download)globalThis.__browserLaufDownloadAnker.push({download:this.download,href:this.href,zeit:Date.now()});
  return ankerKlick.call(this);
};
const blobErstellen=URL.createObjectURL,blobWiderrufen=URL.revokeObjectURL;
URL.createObjectURL=function(blob){
  const url=blobErstellen.call(this,blob);
  globalThis.__browserLaufBlobURLs.push({url,bytes:blob.size,mime:blob.type,erstellt:Date.now(),widerrufen:null});
  return url;
};
URL.revokeObjectURL=function(url){
  const eintrag=globalThis.__browserLaufBlobURLs.find(e=>e.url===url);
  if(eintrag)eintrag.widerrufen=Date.now();
  return blobWiderrufen.call(this,url);
};`;

// Ausschließlich Browser.setDownloadBehavior: Page.setDownloadBehavior ist
// veraltet, kennt weder allowAndName noch eventsEnabled und würde die browserweite
// Richtlinie überschreiben. Ein fehlendes Ereignis rechtfertigt keinen Wechsel.
export async function browserDownload({ browserCdp, ausgabe, browserContextId, frameId, endung, aktivieren, nachweis },
  { jetzt = () => performance.now(), warten = ms => new Promise(r => setTimeout(r, ms)), fristMs = 15000 } = {}) {
  if (!isAbsolute(ausgabe) || typeof frameId !== 'string' || !frameId || !['json', 'xlsx', 'pdf'].includes(endung)
      || !Number.isFinite(fristMs) || fristMs < 0) throw new Messfehler('Ungültige Download-Messparameter.');
  const beginn = jetzt(), anfang = browserCdp.events.length;
  const parameter = { behavior: 'allowAndName', downloadPath: ausgabe, eventsEnabled: true };
  nachweis.steuerung = { methode: 'Browser.setDownloadBehavior', parameter, bestaetigt: false };
  nachweis.frameId = frameId;
  const bis = async (lesen, beschreibung) => {
    const start = jetzt();
    while (true) {
      const r = lesen(); if (r) return r;
      const rest = fristMs - (jetzt() - start);
      if (rest <= 0) throw new Messfehler(`Zeitüberschreitung: ${beschreibung}`);
      await warten(Math.min(50, rest));
    }
  };
  try {
    // TargetInfo kann auch die ID des Standardkontexts melden. getBrowserContexts
    // liefert nur separat angelegte Kontexte. Für den Standardkontext muss der
    // optionale Parameter entfallen, statt eine nicht adressierbare ID zu senden.
    const kontexte = await messbefehl(() => browserCdp.send('Target.getBrowserContexts', {}, 5000));
    const browserContextIds = kontexte?.browserContextIds;
    if (!Array.isArray(browserContextIds)) throw new Messfehler('Browserkontexte nicht bestätigt.');
    if (!browserContextId && browserContextIds.length !== 0) throw new Messfehler('Downloadkontext der Prüfseite nicht eindeutig.');
    if (browserContextIds.includes(browserContextId)) parameter.browserContextId = browserContextId;
    nachweis.steuerung.kontext = { targetContextId: browserContextId ?? null, browserContextIds,
      art: parameter.browserContextId ? 'separater Browserkontext' : 'Standardkontext' };
    // Für jeden Export am Kontext der Prüfseite bestätigen; kein Page-Fallback,
    // kein wiederholter Klick und kein Erfolg allein anhand einer Exportmeldung.
    await messbefehl(() => browserCdp.send('Browser.setDownloadBehavior', parameter, 5000));
    nachweis.steuerung.bestaetigt = true;
    nachweis.klick = await aktivieren();
    const start = await bis(() => browserCdp.events.slice(anfang).find(e => e.method === 'Browser.downloadWillBegin'), `Beginn des ${endung}-Downloads`);
    nachweis.start = start; nachweis.beginnNachMs = jetzt() - beginn;
    if (start.params?.frameId !== frameId) throw new Messfehler('Download gehört nicht zum belegten Frame der Prüfseite.');
    assert.ok(anfrageBewerten(start.params.url).erlaubt, 'Download stammt aus lokaler Ressource');
    assert.ok(start.params.suggestedFilename.endsWith(`.${endung}`), `Dateiendung ${endung}`);
    if (typeof start.params.guid !== 'string' || !/^[a-zA-Z0-9-]+$/.test(start.params.guid)) throw new Messfehler('Keine sichere Downloadkennung.');
    const fertig = await bis(() => browserCdp.events.slice(anfang).find(e => e.method === 'Browser.downloadProgress'
      && e.params.guid === start.params.guid && ['completed', 'canceled'].includes(e.params.state)), `Abschluss des ${endung}-Downloads`);
    nachweis.abschluss = fertig; nachweis.abschlussNachMs = jetzt() - beginn;
    assert.equal(fertig.params.state, 'completed', 'Download vollständig');
    return start.params;
  } catch (e) { nachweis.fehler = e.message; throw e; }
  finally {
    nachweis.dauerMs = jetzt() - beginn;
    nachweis.ereignisse = browserCdp.events.slice(anfang).filter(e => /^Browser\.download/.test(e.method));
  }
}

// Der Download-Hub kann in Edge ein anderes Target nach vorn holen. Eingaben
// gehen erst nach Page.bringToFront, Fokus- und Treffpunktbeleg an die Prüfseite.
// Keine HTMLElement.click()-Aktivierung und kein zweiter Versuch.
export async function echterMausklick({ send, wert, selector }) {
  const steuern = (name, parameter) => messbefehl(() => send(name, parameter));
  await steuern('Page.bringToFront');
  const punkt = produktbefundPruefen(await wert(`(() => {const selector=${JSON.stringify(selector)};const e=document.querySelector(selector);if(!e)return {produktabweichung:{art:'element-fehlt',selector}};if(e.disabled)return {produktabweichung:{art:'element-gesperrt',selector}};e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,breite:r.width,hoehe:r.height,fokus:document.hasFocus(),treffer:hit===e || e.contains(hit)};})()`));
  if (!punkt || typeof punkt !== 'object') throw new Messfehler('Klickpunkt nicht bestätigt.');
  if (!punkt.fokus) throw new Messfehler('Prüfseite hat nach Page.bringToFront keinen bestätigten Fokus.');
  assert.ok(punkt.breite > 0 && punkt.hoehe > 0 && Number.isFinite(punkt.x) && Number.isFinite(punkt.y), 'Sichtbares Bedienelement');
  assert.ok(punkt.treffer, 'Klickpunkt trifft das Bedienelement ohne Überdeckung');
  const position = { x: punkt.x, y: punkt.y };
  await steuern('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position });
  await steuern('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
  await steuern('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
  return punkt;
}
