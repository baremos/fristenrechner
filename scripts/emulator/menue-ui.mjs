// SPDX-License-Identifier: Apache-2.0
import { APP } from './rahmen.mjs';
import { knoten, flaeche, warte } from './dateien-ui.mjs';
const muss = (wert, grund) => { if (!wert) throw new Error(grund); };

export const MESSUNG = String.raw`(function(){
  function rechteck(el){if(!el)return null;var r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
  function sichtbar(el){
    if(!el.getClientRects().length)return false;
    if(getComputedStyle(el).visibility!=='visible')return false;
    for(var a=el;a;a=a.parentElement){
      if(a.tagName==='DETAILS'&&!a.open){var summary=a.querySelector('summary');if(a!==el&&(!summary||!summary.contains(el)))return false;}
    }
    return true;
  }
  var abgeschnitten=[];
  Array.from(document.body.querySelectorAll('*')).forEach(function(el){
    if(!sichtbar(el))return;
    var r=el.getBoundingClientRect(),rollbereich=el.closest('.table-scroll');
    var innen=rollbereich&&rollbereich!==el;
    // WebView und innerWidth können um Bruchteile eines CSS-Pixels voneinander abweichen;
    // deshalb 1 px Toleranz. Textfelder rollen ihren Wert im Feld absichtlich; geprüft bleiben
    // Datum, Auswahl und alle übrigen Elemente.
    var textfeld=el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&/^(text|search|email|tel|url|number|password)$/.test(el.type));
    var scrollUeberlauf=!rollbereich&&!textfeld&&el.scrollWidth>el.clientWidth+1;
    var rechtsUeberlauf=!innen&&r.width>0&&r.right>innerWidth+1;
    if(scrollUeberlauf||rechtsUeberlauf)abgeschnitten.push({
      element:el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/).join('.'):'')+(el.tagName==='INPUT'?'[type='+el.type+'][name='+(el.name||'')+']':''),
      text:(el.textContent||'').trim().slice(0,160),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,right:r.right,
      scrollUeberlauf:!!scrollUeberlauf,rechtsUeberlauf:!!rechtsUeberlauf
    });
  });
  var overlay=document.querySelector('.fr-menue-overlay'),sheet=overlay.querySelector('[role="dialog"]'),liste=sheet.querySelector('[role="region"]');
  var buttons=Array.from(liste.querySelectorAll('button'));
  var erste=buttons.find(function(b){return b.textContent==='Projekt speichern unter'}),letzte=buttons.find(function(b){return b.textContent==='Neues Projekt'});
  return {aktivesElement:document.activeElement?{name:document.activeElement.name,tag:document.activeElement.tagName.toLowerCase()}:null,viewport:{width:innerWidth,height:innerHeight,visual:window.visualViewport?{top:visualViewport.offsetTop,height:visualViewport.height,scale:visualViewport.scale}:null},
    dokumentBreite:document.documentElement.scrollWidth,abgeschnitten:abgeschnitten,rollAusnahmen:['.table-scroll (Innenraum der Terminplantabelle)'],leiste:rechteck(document.querySelector('.fr-menue-leiste')),
    x:rechteck(sheet.querySelector('button[aria-label="Schließen"]')),sheet:rechteck(sheet),kopf:rechteck(sheet.querySelector('.fr-menue-kopf')),erste:rechteck(erste),letzte:rechteck(letzte),
    buttonSchrift:getComputedStyle(erste).fontSize,grundschrift:getComputedStyle(document.documentElement).fontSize,
    hidden:overlay.hidden,anzahl:buttons.length,gesperrt:buttons.filter(function(b){return b.disabled}).length,
    kompakt:sheet.classList.contains('fr-menue-kompakt'),liste:{height:liste.clientHeight,scrollHeight:liste.scrollHeight,scrollTop:liste.scrollTop},
    fokusAmKnopf:document.activeElement===document.querySelector('.fr-menue-leiste button[aria-controls]'),fokusImSheet:sheet.contains(document.activeElement),
    sperrhinweis:!sheet.querySelector('.fr-menue-sperre').hidden,scrollY:scrollY};
})()`;

export function inhaltPruefen(messung, ort) {
  if (!Array.isArray(messung.abgeschnitten)) throw new Error('Messung auf abgeschnittenen Inhalt fehlt.');
  return { name: 'Kein abgeschnittener Inhalt: ' + ort, ok: messung.abgeschnitten.length === 0, elemente: messung.abgeschnitten };
}

export function webviewFlaeche(xml) {
  const alle = knoten(xml).filter(k => k.class === 'android.webkit.WebView' && k.package === APP && flaeche(k));
  // View und Dokumentwurzel: erste, äußere Fläche verwenden; bis 4 px je Kante.
  // Jeder Knoten muss zur ersten Fläche passen, keine verkettete Toleranz.
  const erste = alle.length ? flaeche(alle[0]) : null;
  muss(erste && alle.every(k => ['l', 'o', 'r', 'u'].every(s => Math.abs(erste[s] - flaeche(k)[s]) <= 4)), 'WebView-Fläche nicht eindeutig.');
  return erste;
}

export const MENUE_NAMEN = Object.freeze(['Projekt speichern unter', 'Excel speichern', 'PDF speichern',
  'Projekt teilen', 'Excel teilen', 'PDF teilen', 'Projekt importieren', 'Neues Projekt']);
export const MENUE_ZIELE = Object.freeze({
  knopf: '.fr-menue-leiste button[aria-controls]', x: '[role="dialog"] button[aria-label="Schließen"]',
  aussen: '.fr-menue-overlay', eingabe: '#schedule-form [name="projektname"]',
});

// Läuft nur als externer Messcode in der Debug-WebView; keine Produktmethode.
export function domPunkt(ziel, namen) {
  var el = namen[ziel] ? document.querySelector(namen[ziel])
    : Array.from(document.querySelectorAll('[role="dialog"] [role="region"] button')).find(function(b) { return b.textContent === ziel; });
  if (!el) throw Error('Tippziel fehlt: ' + ziel);
  if (ziel !== 'aussen' && ziel !== 'knopf') el.scrollIntoView({block:'center'});
  var r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  if (ziel === 'aussen') {
    var s = document.querySelector('[role="dialog"]').getBoundingClientRect();
    y = r.y + (s.y - r.y) / 2;
  }
  var hit = document.elementFromPoint(x, y);
  if (r.width <= 0 || r.height <= 0 || !el.contains(hit) || (ziel === 'aussen' && hit !== el)) throw Error('Tippziel verdeckt: ' + ziel);
  return {x:x,y:y,width:innerWidth,height:innerHeight};
}
export function bildPunkt(p, r) {
  if (![p.x,p.y,p.width,p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0
    || p.x < 0 || p.x >= p.width || p.y < 0 || p.y >= p.height) throw new Error('DOM-Tippziel außerhalb der WebView.');
  const sx = (r.r-r.l)/p.width, sy = (r.u-r.o)/p.height;
  if (Math.abs(sx-sy) >= .08) throw new Error('Koordinatenmaßstab nicht eindeutig; Tastatur oder Skalierung prüfen.');
  return {x:Math.round(r.l+p.x*sx),y:Math.round(r.o+p.y*sy)};
}
export async function menueTipp(ctx, c, id, ziel) {
  const punkt = await c.evaluate('(' + domPunkt.toString() + ')(' + JSON.stringify(ziel) + ',' + JSON.stringify(MENUE_ZIELE) + ')');
  const xml = await ctx.uiBaum(id + '-tipp');
  const webview = webviewFlaeche(xml), p = bildPunkt(punkt, webview);
  await ctx.save(id + '-tipp.json', {ziel, punkt, webview, ...p});
  await ctx.shell('input tap ' + p.x + ' ' + p.y); await ctx.sleep(700);
}
export async function menueOeffnungBestaetigen(ctx, c) {
  return warte(ctx,async () => {
    const m = await c.evaluate(MESSUNG);
    return !m.hidden && m.sheet.width > 0 && m.sheet.height > 0 && m.anzahl === 8 ? m : null;
  },10,300);
}
export function navOverlays(text) {
  const liste = [...text.matchAll(/^\[([ x])\]\s+(com\.android\.internal\.systemui\.navbar\.[a-zA-Z0-9_.]+)\s*$/gm)]
    .map(m => ({name:m[2],aktiv:m[1]==='x'}));
  if (!liste.length || liste.filter(o => o.aktiv).length > 1) throw new Error('Navigations-Overlays nicht eindeutig lesbar.');
  return liste;
}
export async function navigationStand(ctx) {
  const roh = await ctx.shell('cmd overlay list --user 0');
  return {roh,liste:navOverlays(roh),modus:await ctx.shell('settings get secure navigation_mode')};
}
export async function navigationZurueck(ctx, vorher) {
  for (const item of vorher.liste) await ctx.shell('cmd overlay ' + (item.aktiv?'enable':'disable') + ' --user 0 ' + item.name);
  await ctx.sleep(1500);
  const nachher = await navigationStand(ctx);
  await ctx.save('menue/navigation-wiederhergestellt.json', {vorher,nachher});
  if (JSON.stringify(vorher.liste)!==JSON.stringify(nachher.liste) || vorher.modus!==nachher.modus) throw new Error('Navigationsmodus nicht wiederhergestellt.');
}
