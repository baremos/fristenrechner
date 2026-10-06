import { sichtbarQuelle } from './bedienung.mjs';
import { sperrpruefungQuelle } from './bedienelement.mjs';

// Eine transparente Dateieingabe ist in dieser Oberfläche durch genau ein
// zugehöriges Label bemalt. Die Zuordnung wird pro Messung belegt; andere
// transparente Steuerelemente werden nicht pauschal ausgenommen.
const malflaecheQuelle=`e => {
  if(e.matches('input[type=file]')&&Number(getComputedStyle(e).opacity)===0){
    if(e.labels?.length!==1)return {element:e,unbestimmt:true};
    const label=e.labels[0];return {element:label,unbestimmt:false,beleg:{id:e.id,label:label.textContent.trim(),eindeutig:e.labels.length===1}};
  }
  return {element:e,unbestimmt:false};
}`;

export const inaktiverTextQuelle=`e => {
  const label=e.closest('label'),kontrolle=label?.control;
  return kontrolle&&gesperrt(kontrolle)&&[...(kontrolle.labels??[])].includes(label)
    ?{selector:selector(kontrolle),gesperrt:true,label:label.textContent.trim(),zugeordnet:true}:null;
}`;

export const layoutQuelle = `(() => {
  const sichtbar=${sichtbarQuelle},malflaeche=${malflaecheQuelle};
  const elemente=[...document.querySelectorAll('body *')].filter(e=>sichtbar(e)&&!['SCRIPT','STYLE','OPTION'].includes(e.tagName)).map((e,i)=>{
    const flaeche=malflaeche(e),v=flaeche.element,r=v.getBoundingClientRect(),c=getComputedStyle(v),scroll=e.closest('.table-scroll');
    const texteingabe=e.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select');
    const textRects=[...v.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).flatMap(n=>{const range=document.createRange();range.selectNodeContents(n);return [...range.getClientRects()];});
    return {selector:e.id?'#'+e.id:e.name?'[name="'+e.name+'"]':e.tagName.toLowerCase()+'.'+e.className+' ('+i+')',
      tag:e.tagName,display:c.display,malflaeche:flaeche.beleg,unbestimmt:flaeche.unbestimmt,links:r.left+scrollX,rechts:r.right+scrollX,breite:r.width,hoehe:r.height,
      innenBreite:v.clientWidth,innenHoehe:v.clientHeight,inhaltBreite:v.scrollWidth,inhaltHoehe:v.scrollHeight,
      texteingabe,datentabelle:e.matches('.table-scroll'),tabellenInnenraum:!!scroll&&scroll!==e&&!!e.closest('table'),
      horizontalRollbar:['auto','scroll'].includes(c.overflowX)&&v.scrollWidth>v.clientWidth+1,
      textAbgeschnitten:!texteingabe&&textRects.some(t=>t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1)};
  });
  return {clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,elemente};
})()`;

export const kontrastQuelle = `(() => {
  const sichtbar=${sichtbarQuelle},gesperrt=${sperrpruefungQuelle},malflaeche=${malflaecheQuelle};
  const selector=e=>e.id?'#'+e.id:e.name?'[name="'+e.name+'"]':e.tagName.toLowerCase()+'.'+e.className;
  const kette=e=>{const k=[];for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p);k.push({selector:selector(p),farbe:c.backgroundColor,bild:c.backgroundImage,deckkraft:Number(c.opacity),filter:c.filter,mischung:c.mixBlendMode,schatten:c.textShadow});}return k;};
  return [...document.querySelectorAll('body *')].filter(e=>sichtbar(e)&&!['SCRIPT','STYLE','OPTION'].includes(e.tagName)).flatMap(e=>{
    const flaeche=malflaeche(e),v=flaeche.element,c=getComputedStyle(v),bedienelement=e.matches('input,select,textarea,button,summary,a[href],[tabindex]'),
      text=[...v.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select');
    if(!text&&!bedienelement)return [];
    const inaktiverText=(${inaktiverTextQuelle})(v);
    const eintraege=[{selector:selector(e),text,bedienelement,gesperrt:gesperrt(e),farbe:c.webkitTextFillColor||c.color,groesse:parseFloat(c.fontSize),gewicht:Number(c.fontWeight),kette:kette(v),malflaeche:flaeche.beleg,unbestimmt:flaeche.unbestimmt,
      inaktiverText,
      nativ:e.matches('input[type=checkbox],input[type=radio]')&&c.appearance!=='none',
      rahmen:['Top','Right','Bottom','Left'].map(s=>({farbe:c['border'+s+'Color'],breite:parseFloat(c['border'+s+'Width']),stil:c['border'+s+'Style']})),
      fokus:bedienelement&&(e.matches(':focus-visible')||v!==e&&v.matches(':focus-within')),outline:{farbe:c.outlineColor,breite:parseFloat(c.outlineWidth),stil:c.outlineStyle},
      aussen:v.parentElement?kette(v.parentElement):[],boxSchatten:c.boxShadow,
      identifikation:e.matches('summary')?getComputedStyle(e,'::marker').color:c.textDecorationLine.includes('underline')?c.textDecorationColor:null}];
    if(e.matches('input,textarea')&&!e.value&&e.getAttribute('placeholder')){
      const p=getComputedStyle(e,'::placeholder');eintraege.push({selector:selector(e)+'::placeholder',text:true,bedienelement:false,farbe:p.webkitTextFillColor||p.color,groesse:parseFloat(p.fontSize),gewicht:Number(p.fontWeight),
        kette:[{selector:'::placeholder',farbe:'rgba(0,0,0,0)',bild:p.backgroundImage,deckkraft:Number(p.opacity),filter:p.filter,mischung:p.mixBlendMode,schatten:p.textShadow},...kette(e)]});
    }
    return eintraege;
  });
})()`;

export const fokusQuelle = `(() => {
  const e=document.activeElement,flaeche=(${malflaecheQuelle})(e),v=flaeche.element,c=getComputedStyle(v),r=v.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2);
  return {kennung:e.dataset.browserMesskennung??null,tag:e.tagName,typ:e.type??null,sichtbar:(${sichtbarQuelle})(v),fokusVisible:e.matches(':focus-visible')||v!==e&&v.matches(':focus-within'),
    breite:r.width,hoehe:r.height,oben:r.top,unten:r.bottom,links:r.left,rechts:r.right,rollstand:{x:scrollX,y:scrollY},
    dokumentRechteck:{links:r.left+scrollX,oben:r.top+scrollY,rechts:r.right+scrollX,unten:r.bottom+scrollY},
    innerHeight,innerWidth,treffer:hit===v||v.contains(hit),malflaeche:flaeche.beleg,unbestimmt:flaeche.unbestimmt,
    outline:c.outlineStyle,outlineBreite:parseFloat(c.outlineWidth),outlineFarbe:c.outlineColor,boxSchatten:c.boxShadow,farbe:c.color,hintergrund:c.backgroundColor,
    rahmen:[c.borderTopColor,c.borderRightColor,c.borderBottomColor,c.borderLeftColor,c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth].join('|'),
    nativeGrafik:e.matches('input,select,textarea')&&c.appearance!=='none',datentabelle:e.matches('.table-scroll')};
})()`;

export const textzuordnungQuelle = `(() => {
  const sichtbar=${sichtbarQuelle};
  return {phasen:[...document.querySelectorAll('.timeline-phase')].filter(sichtbar).map(e=>({name:e.querySelector('strong')?.textContent?.trim(),text:e.textContent.trim()})),
    warnungen:[...document.querySelectorAll('#result-warnings li,.milestone-warning')].filter(sichtbar).map(e=>e.textContent.trim()),
    fristtypen:[...document.querySelectorAll('#schedule-table-body tr')].filter(sichtbar).map(e=>({typ:e.querySelector('.type-badge')?.textContent.trim(),phase:e.cells[2]?.textContent.trim(),termin:e.cells[1]?.textContent.trim()}))};
})()`;

export const liveQuelle = `(() => {
  const sichtbar=${sichtbarQuelle};const aktiv=document.activeElement;
  return {fokus:{tag:aktiv.tagName,id:aktiv.id,name:aktiv.name??null,verbunden:aktiv.isConnected,sichtbar:sichtbar(aktiv)},
    regionen:[...document.querySelectorAll('[aria-live],[role=status],[role=alert],#schedule-results,#result-konflikte,#import-message')].map(e=>({id:e.id,rolle:e.getAttribute('role'),live:e.getAttribute('aria-live'),sichtbar:sichtbar(e),text:e.textContent.trim(),enthaeltFokus:e===aktiv||e.contains(aktiv),bezug:e.getAttribute('aria-labelledby')}))};
})()`;
