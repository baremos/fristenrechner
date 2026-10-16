import { browserErgebnis, Messfehler, messbefehl, Produktabweichung } from './fehler.mjs';
import { sperrpruefungQuelle } from './bedienelement.mjs';
import { echterMausklick } from './download.mjs';
import { Abweichung, bestaetige, verlange } from './regeln.mjs';
import { bildAufnehmen, freierBildname, elementClip, obererElementClip, sichtbereichClip, bestaetigeSichtausschnitt, bestaetigeElementlage } from './belege.mjs';
import { scrollruheQuelle } from './emulation.mjs';
import { grenzenBestaetigt } from './ergebniskatalog.mjs';

export const elementlageQuelle = selector => `(async () => {
  const scrollruhe=await ${scrollruheQuelle};
  const liste=document.querySelectorAll(${JSON.stringify(selector)}),e=liste.length===1?liste[0]:null,
    r=e?.getBoundingClientRect(),c=e&&getComputedStyle(e);
  return r?{kennung:e.dataset.browserMesskennung??e.id??${JSON.stringify(selector)},scrollruhe,fokussiert:document.activeElement===e,
    viewportRechteck:{links:r.left,oben:r.top,rechts:r.right,unten:r.bottom,breite:r.width,hoehe:r.height},
    rollstand:{x:scrollX,y:scrollY},outline:parseFloat(c.outlineWidth),offset:parseFloat(c.outlineOffset),dichte:devicePixelRatio,
    fenster:{innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight}}:null;
})()`;

export const sichtbarQuelle = `(e) => {
  if(!e||e.closest('[hidden],[inert]'))return false;
  // Geschlossene details können Layoutrechtecke für ihre unsichtbaren Kinder
  // behalten. Nur ihr erstes direktes summary ist dann sichtbar/bedienbar.
  for(let p=e;p;p=p.parentElement) {
    if(p.matches('details:not([open])')&&p!==e) {
      const summary=[...p.children].find(c=>c.tagName==='SUMMARY');
      if(!summary||!summary.contains(e))return false;
    }
    const c=getComputedStyle(p);if(c.display==='none'||c.contentVisibility==='hidden')return false;
  }
  return getComputedStyle(e).visibility==='visible'&&e.getClientRects().length>0;
}`;
export const inventarQuelle = `(() => {const sichtbar=${sichtbarQuelle},gesperrt=${sperrpruefungQuelle};
  return [...document.querySelectorAll('input,select,textarea,button,a[href],[tabindex],summary')].map((e,i)=>{
    e.dataset.browserMesskennung=String(i);
    const c=getComputedStyle(e);
    return {kennung:String(i),selector:e.id?'#'+e.id:e.name?'[name="'+e.name+'"]':'[data-browser-messkennung="'+i+'"]',
      sichtbar:sichtbar(e),gesperrt:gesperrt(e),tabIndex:e.tabIndex,tag:e.tagName,typ:e.type??null,wert:e.value??null,
      erforderlich:e.required===true,ungueltig:e.getAttribute('aria-invalid'),beschreibung:e.getAttribute('aria-describedby'),
      normal:{boxSchatten:c.boxShadow,hintergrund:c.backgroundColor,rahmen:[c.borderTopColor,c.borderRightColor,c.borderBottomColor,c.borderLeftColor,c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth].join('|')}};
  });})()`;

export function bedienung({ cdp, basisUrl, navigieren, ausgabe, protokoll }) {
  const send = (name, parameter = {}, timeout) => messbefehl(() => cdp.send(name, parameter, timeout));
  const wert = async (expression, optionen) => browserErgebnis(await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: false,
  }), optionen);
  async function bis(fn, beschreibung, { produkt = false, timeout = 8000 } = {}) {
    const ende = Date.now() + timeout;
    while (Date.now() < ende) { const r = await fn(); if (r) return r; await new Promise(r => setTimeout(r, 50)); }
    if (produkt) {
      bestaetige(await wert('"messbereit"') === 'messbereit', `Messfähigkeit nicht bestätigt: ${beschreibung}`);
      throw new Abweichung(`Ausbleibende Produktreaktion: ${beschreibung}`);
    }
    throw new Messfehler(`Messung nicht bestätigt: ${beschreibung}`);
  }
  const bedienbar = selector => wert(`(() => {const gesperrt=${sperrpruefungQuelle},selector=${JSON.stringify(selector)},e=document.querySelector(selector);
    if(!e)return {produktabweichung:{art:'element-fehlt',selector}};
    if(gesperrt(e))return {produktabweichung:{art:'element-gesperrt',selector}};return true;})()`, { produktbefund: true });
  const inhalt = selector => wert(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const feld = name => wert(`document.querySelector(${JSON.stringify(`[name="${name}"]`)})?.value ?? null`);
  async function frisch(quelle = '') {
    await send('Page.navigate', { url: 'about:blank' });
    await bis(async () => await wert('location.href') === 'about:blank', 'Leerseite');
    await send('Storage.clearDataForOrigin', { origin: new URL(basisUrl).origin, storageTypes: 'local_storage' });
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      globalThis.__messTasten=[];globalThis.__messDatei=[];globalThis.__messScroll=[];globalThis.__messForm=[];
      globalThis.__browserLaufDateifeldEreignisse=globalThis.__messDatei;
      document.addEventListener('keydown',e=>__messTasten.push({key:e.key,code:e.code,vertrauenswuerdig:e.isTrusted}),true);
      for(const typ of ['submit','invalid'])document.addEventListener(typ,e=>__messForm.push({typ,name:e.target.name??null,vertrauenswuerdig:e.isTrusted}),true);
      for(const typ of ['input','change','cancel'])document.addEventListener(typ,e=>{if(e.target.id==='open-json')__messDatei.push({typ,isTrusted:e.isTrusted,vertrauenswuerdig:e.isTrusted});},true);
      const original=Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView=function(optionen){
        const messung={id:this.id,optionen,vorher:{x:scrollX,y:scrollY,zielOben:this.getBoundingClientRect().top},bilder:[]};__messScroll.push(messung);
        const antwort=original.call(this,optionen);messung.synchron={x:scrollX,y:scrollY};
        if(this.id==='schedule-results'){
          const aufnehmen=()=>{messung.bilder.push({x:scrollX,y:scrollY,zeit:performance.now()});if(messung.bilder.length<30)requestAnimationFrame(aufnehmen);};requestAnimationFrame(aufnehmen);
        }
        return antwort;
      };
      ${quelle}` });
    bestaetige(typeof identifier === 'string' && identifier, 'Vorabmessung nicht eingerichtet.');
    try {
      await navigieren('/');
      await bis(async () => { const s = await inhalt('#storage-status'); return typeof s === 'string' && !s.includes('wird geladen') && await feld('bekanntmachung'); }, 'Initialisierung', { produkt: true });
      await send('Page.bringToFront');
      await fokusBestaetigen('nach Navigation');
      if(protokoll?.phase==='darstellung')await bildkanalVorbereiten();
    } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
  }
  async function fokusBestaetigen(anlass) {
    const proben=[];
    try {
      return await bis(async()=>{const fokus=await wert('document.hasFocus()');proben.push(fokus);return fokus===true;},
        `Seitenfokus ${anlass}`,{timeout:2000});
    } finally {
      if(protokoll&&(proben.length>1||proben[0]!==true))
        (protokoll.fokusnachweise??=[]).push({anlass,proben,bestaetigt:proben.at(-1)===true});
    }
  }
  async function taste(key, { code, vk, modifiers = 0, text } = {}) {
    await send('Page.bringToFront');
    await fokusBestaetigen('vor der Tasteneingabe');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code ?? key, windowsVirtualKeyCode: vk ?? ({ Tab: 9, Enter: 13, ' ': 32, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38 })[key], modifiers, ...(text === undefined ? {} : { text }) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code ?? key, windowsVirtualKeyCode: vk ?? ({ Tab: 9, Enter: 13, ' ': 32, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38 })[key], modifiers });
  }
  const tab = async (zurueck = false) => {
    const anfang=await wert('__messTasten.length');bestaetige(Number.isInteger(anfang),'Tastaturmessung nicht eingerichtet.');
    await taste('Tab', { modifiers: zurueck ? 8 : 0 });
    const ereignisse=await wert(`__messTasten.slice(${anfang})`);
    bestaetige(Array.isArray(ereignisse)&&ereignisse.some(e=>e.key==='Tab'&&e.vertrauenswuerdig),'Vertrauenswürdiger Tab-Eingang nicht bestätigt.');
  };
  const aktiv = () => wert(`(() => {const e=document.activeElement;return {kennung:e?.dataset.browserMesskennung??null,selector:e?.id?'#'+e.id:e?.name?'[name="'+e.name+'"]':null,tag:e?.tagName,fokus:document.hasFocus()};})()`);
  async function erreichen(selector) {
    await bedienbar(selector);
    const inventar = await wert(inventarQuelle);
    bestaetige(Array.isArray(inventar) && inventar.length > 0, 'Bedieninventar fehlt.');
    // Jeder Weg beginnt am tatsächlichen Fokus. Keine DOM.focus()-Abkürzung.
    for (let i = 0; i < inventar.length * 6 + 4; i++) {
      if (await wert(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`)) return;
      await tab();
    }
    bestaetige(await wert('"messbereit"') === 'messbereit', 'Messkanal beim Tastaturweg fehlt.');
    throw new Abweichung(`Mit Tab nicht erreichbar: ${selector}`);
  }
  async function aktivieren(selector, key = 'Enter') {
    await erreichen(selector); await bedienbar(selector);
    const anfang = await wert('__messTasten.length');
    await taste(key, { code: key === ' ' ? 'Space' : 'Enter', text: key === ' ' ? ' ' : '\r' });
    const tasten = await wert(`__messTasten.slice(${anfang})`);
    bestaetige(tasten.some(e => e.key === key && e.vertrauenswuerdig), `Vertrauenswürdige Aktivierung nicht bestätigt: ${selector}`);
  }
  async function textEingeben(selector, text, { maus = false } = {}) {
    const max=await wert(`document.querySelector(${JSON.stringify(selector)})?.maxLength ?? -1`);
    bestaetige(Number.isInteger(max)&&(max<0||text.length<=max), `Testeingabe überschreitet die Feldgrenze: ${selector}`);
    if (maus) await echterMausklick({ send, wert, selector }); else await erreichen(selector);
    await bedienbar(selector);
    await taste('a', { code: 'KeyA', vk: 65, modifiers: 2 });
    for (const zeichen of text) await taste(zeichen, { code: '', vk: 0, text: zeichen });
    verlange(await wert(`document.querySelector(${JSON.stringify(selector)})?.value`) === text, `Eingabe nicht übernommen: ${selector}`);
  }
  async function auswaehlen(name, ziel) {
    const selector=`[name="${name}"]`;await erreichen(selector);await bedienbar(selector);
    const optionen=await wert(`([...document.querySelector(${JSON.stringify(selector)}).options].map(o=>({wert:o.value,text:o.textContent,gesperrt:o.disabled})))`);
    bestaetige(Array.isArray(optionen)&&optionen.length>0,'Auswahlinventar fehlt.');
    verlange(optionen.some(o=>o.wert===ziel&&!o.gesperrt),`Auswahl fehlt: ${name}=${ziel}`,optionen);
    await taste('Home');await taste('Enter',{text:'\r'});
    verlange(await feld(name)===optionen[0].wert,`Home wählt nicht die erste Option: ${name}`);
    for(let i=0;i<optionen.findIndex(o=>o.wert===ziel);i++)await taste('ArrowDown');
    await taste('Enter',{text:'\r'});
    verlange(await feld(name)===ziel,`Auswahl nicht übernommen: ${name}`,{ziel,gemessen:await feld(name)});
    verlange(await wert(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`),'Auswahlwechsel verliert den Fokus.');
    return optionen;
  }
  async function berechnen({ maus = false } = {}) {
    const selector = '#schedule-form button[type="submit"]';
    if (maus) await echterMausklick({ send, wert, selector }); else await aktivieren(selector);
    await bis(async () => (await inhalt('#form-message')) === 'Terminplan aktualisiert.', 'Berechnung', { produkt: true });
  }
  let bildzustand;
  async function mitBildzustand(zustand, fn) {
    bestaetige(!bildzustand && typeof zustand?.vorbereiten==='function' && typeof zustand?.bestaetigen==='function', 'Bildzustand nicht eindeutig eingerichtet.');
    bildzustand=zustand;
    try { return await fn(); } finally { bildzustand=null; }
  }
  async function aufnahme(art, clip, dichte = 1, optionen) {
    const name = art.endsWith('.png') ? art : freierBildname(ausgabe, art);
    await bildzustand?.vorbereiten(name);
    const beleg = await bildAufnehmen({send,ausgabe},name,clip,dichte,optionen);
    if (protokoll) (protokoll.bildbelege ??= []).push(beleg);
    await bildzustand?.bestaetigen(name);
    return beleg;
  }
  async function bildkanalVorbereiten() {
    // Vor den Produktmessungen: captureBeyondViewport kann beim ersten Bild
    // die Scrollleisten-/Layoutgröße ändern. Keine solche Änderung wird später
    // mit einer großzügigen Rechtecktoleranz als unveränderte Lage gewertet.
    const quelle=`(async()=>({scrollruhe:await ${scrollruheQuelle},innerWidth,innerHeight,
      clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollX,scrollY,devicePixelRatio}))()`;
    const nachweis={proben:[],bestaetigt:false};(protokoll.aufnahmevorbereitung??=[]).push(nachweis);
    for(let i=0;i<3;i++) {
      const vorher=await wert(quelle),layout=await send('Page.getLayoutMetrics');
      const bild=await aufnahme(freierBildname(ausgabe,'aufnahmeprobe'),{x:0,y:0,width:layout.cssContentSize?.width,height:layout.cssContentSize?.height,scale:1},vorher.devicePixelRatio),nachher=await wert(quelle),layoutNachher=await send('Page.getLayoutMetrics');
      nachweis.proben.push({vorher,layout,bild,nachher,layoutNachher});
      if(vorher.scrollruhe?.bestaetigt&&nachher.scrollruhe?.bestaetigt
        &&['innerWidth','innerHeight','clientWidth','clientHeight','scrollX','scrollY','devicePixelRatio'].every(k=>Number.isFinite(vorher[k])&&vorher[k]===nachher[k])
        &&['width','height'].every(k=>layout.cssContentSize[k]===layoutNachher.cssContentSize?.[k])) {
        nachweis.bestaetigt=true;return;
      }
    }
    bestaetige(false,'Aufnahmekanal verändert weiterhin die Ausgangsgeometrie.');
  }
  async function bild(name, { selector, rand = 24, imViewport = protokoll?.phase==='tastatur', geometrie={}, fokusvergleich=false, referenzGeometrie } = {}) {
    if(imViewport&&selector) {
      Object.assign(geometrie,{bild:name,selector,imViewport:true,captureBeyondViewport:false,vorher:null,nachher:null,bestaetigt:false});
      let beleg,aufnahmefehler;
      try {
        await wert(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});})()`);
        let lage=geometrie.vorher=await wert(elementlageQuelle(selector));
        if(lage)lage.dokumentgroesse=(await send('Page.getLayoutMetrics')).cssContentSize;
        bestaetige(lage?.scrollruhe?.bestaetigt===true,'Scrollruhe vor dem Vergleichsbild nicht bestätigt.');
        const vollstaendig=elementClip(lage,lage.dokumentgroesse,rand);
        geometrie.ausschnittart=fokusvergleich?(referenzGeometrie?.ausschnittart
          ??(vollstaendig.clip.height>lage.fenster.clientHeight?'oberer Teil':'vollständig')):'vollständig';
        bestaetige(['vollständig','oberer Teil'].includes(geometrie.ausschnittart),'Ausschnittart für Vergleichsbild nicht bestätigt.');
        geometrie.abstand=Math.max(rand,lage.outline+Math.abs(lage.offset)+2,referenzGeometrie?.abstand??0);
        geometrie.abgeschnitteneHoehe=0;
        if(geometrie.ausschnittart==='oberer Teil') {
          // Höhere Elemente nur oben aufnehmen: Bilder über den Viewport hinaus
          // verändern die Layoutbreite. Nach start Platz für Fokusrahmen und Rand lassen.
          await wert(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)return;e.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});scrollBy({top:Math.floor(e.getBoundingClientRect().top-${geometrie.abstand}),behavior:'instant'});})()`);
          lage=geometrie.vorher=await wert(elementlageQuelle(selector));
          if(lage)lage.dokumentgroesse=(await send('Page.getLayoutMetrics')).cssContentSize;
          bestaetige(lage?.scrollruhe?.bestaetigt===true,'Scrollruhe vor dem Vergleichsbild nicht bestätigt.');
        }
        const ausschnitt=geometrie.ausschnittart==='oberer Teil'?obererElementClip(lage,lage.dokumentgroesse,geometrie.abstand)
          :elementClip(lage,lage.dokumentgroesse,rand,true);
        const {clip}=ausschnitt;geometrie.abgeschnitteneHoehe=ausschnitt.abgeschnitteneHoehe??0;
        geometrie.clip=clip;geometrie.dichte=lage.dichte;
        beleg=await aufnahme(name,clip,lage.dichte,{captureBeyondViewport:false});
        Object.assign(beleg,{aufnahmeart:'Sichtbarer Viewport',rollstand:lage.rollstand,fenster:lage.fenster,geometrie});
      } catch(fehler) {aufnahmefehler=fehler;geometrie.fehler=fehler.message;}
      finally {
        try {
          geometrie.nachher=await wert(elementlageQuelle(selector));
          if(geometrie.nachher)geometrie.nachher.dokumentgroesse=(await send('Page.getLayoutMetrics')).cssContentSize;
        } catch(fehler) {geometrie.nachherFehler=fehler.message;aufnahmefehler??=fehler;}
      }
      if(aufnahmefehler)throw aufnahmefehler;
      bestaetigeElementlage(geometrie);
      return name;
    }
    const {cssContentSize}=await send('Page.getLayoutMetrics');
    bestaetige(cssContentSize&&[cssContentSize.width,cssContentSize.height].every(v=>Number.isFinite(v)&&v>0),'Dokumentgröße für vollständigen Bildbeleg fehlt.');
    const dichte=await wert('devicePixelRatio');bestaetige(Number.isFinite(dichte)&&dichte>0,'Pixeldichte für Bildbeleg nicht bestätigt.');
    if(imViewport) {
      const lage=await wert(selector?elementlageQuelle(selector):`(async()=>({scrollruhe:await ${scrollruheQuelle},rollstand:{x:scrollX,y:scrollY},fenster:{clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight}}))()`);
      bestaetige(lage?.scrollruhe?.bestaetigt===true,'Scrollruhe vor dem Viewportbild nicht bestätigt.');
      const clip=selector?elementClip(lage,cssContentSize,rand,true).clip:sichtbereichClip(lage,cssContentSize);
      const beleg=await aufnahme(name,clip,dichte,{captureBeyondViewport:false});
      beleg.aufnahmeart='Sichtbarer Viewport';beleg.rollstand=lage.rollstand;beleg.fenster=lage.fenster;
      return name;
    }
    let clip={x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1};
    if (selector) {
      const r = await wert(`(() => {const e=document.querySelector(${JSON.stringify(selector)}),r=e?.getBoundingClientRect(),c=e&&getComputedStyle(e);return r?{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,outline:parseFloat(c.outlineWidth),offset:parseFloat(c.outlineOffset)}:null;})()`);
      bestaetige(r && [r.x,r.y,r.width,r.height,r.outline,r.offset,rand].every(Number.isFinite) && r.width>0 && r.height>0 && rand>=0, 'Elementausschnitt nicht bestätigt.');
      const abstand=Math.max(rand,r.outline+Math.abs(r.offset)+2),x=Math.max(0,r.x-abstand),y=Math.max(0,r.y-abstand);
      clip={x,y,width:Math.min(cssContentSize.width,r.x+r.width+abstand)-x,height:Math.min(cssContentSize.height,r.y+r.height+abstand)-y,scale:1};
    }
    const fensterQuelle='({innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollX,scrollY})';
    const fenster=selector?null:await wert(fensterQuelle);
    const beleg=await aufnahme(name,clip,dichte);
    if(!selector) {
      // captureBeyondViewport kann Scrollleisten/Layout vorübergehend ändern.
      // Jede tatsächlich gemessene Größe bleibt erhalten, keine Normierung
      // durch CSS oder Metrikänderungen mitten im zu prüfenden Fokuszustand.
      beleg.dokumentmessung={vorher:cssContentSize,nachher:(await send('Page.getLayoutMetrics')).cssContentSize,
        fensterVorher:fenster,fensterNachher:await wert(fensterQuelle)};
      beleg.dokumentmessung.scrollleistenBreite=fenster.innerWidth-fenster.clientWidth;
      const gruppe=name.replace(/-fokus-\d+\.png$/,'.png');
      const referenz=protokoll?.bildbelege?.find(b=>b!==beleg&&b.dokumentmessung&&b.datei.replace(/-fokus-\d+\.png$/,'.png')===gruppe);
      if(referenz&&(referenz.breite!==beleg.breite||referenz.hoehe!==beleg.hoehe))
        (protokoll.bildgroessenabweichungen??=[]).push({gruppe,referenz:referenz.datei,bild:name,
          vorher:{breite:referenz.breite,hoehe:referenz.hoehe},gemessen:{breite:beleg.breite,hoehe:beleg.hoehe},
          differenz:{breite:beleg.breite-referenz.breite,hoehe:beleg.hoehe-referenz.hoehe},
          scrollleistenBreite:beleg.dokumentmessung.scrollleistenBreite,captureBeyondViewport:true});
    }
    return name;
  }
  async function sichtbild(name,{selectors,nativerFokus,imViewport=protokoll?.phase==='tastatur',fokuspflicht=!!nativerFokus,nachweis={}}={}) {
    bestaetige(Array.isArray(selectors)&&selectors.length>0&&selectors.every(s=>typeof s==='string'&&s)
      &&new Set(selectors).size===selectors.length,'Elementinventar für Sichtbild fehlt.');
    const ausschnitte=[];nachweis.lagen=[];nachweis.imViewport=imViewport;
    // Zuerst Ausschnitte aufnehmen: das Vollbild darf ihre Geometrie durch
    // captureBeyondViewport nicht rückwirkend bestimmen.
    for(const [i,selector] of selectors.entries()) {
      const lagepruefung={bild:name,selector,vorher:null,nachher:null,bestaetigt:false,imViewport};
      nachweis.lagen.push(lagepruefung);
      if(protokoll)(protokoll.ausschnittlagen??=[]).push(lagepruefung);
      let lage,groesse,geometrie,element,beleg,aufnahmefehler;
      try {
        if(imViewport)await wert(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});})()`);
        lage=lagepruefung.vorher=await wert(elementlageQuelle(selector));
        groesse=await send('Page.getLayoutMetrics');
        if(lage)lage.dokumentgroesse=groesse.cssContentSize;
        bestaetige(lage?.scrollruhe?.bestaetigt===true,'Scrollruhe vor dem Sichtbeleg nicht bestätigt.');
        geometrie=elementClip(lage,groesse.cssContentSize,24,imViewport);
        bestaetige(Number.isFinite(lage.dichte)&&lage.dichte>0,'Sichtelement ohne bestätigte Pixeldichte.');
        const {root}=await send('DOM.getDocument');bestaetige(root?.nodeId>0,'DOM für Sichtausschnitt fehlt.');
        const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector});bestaetige(nodeId>0,'Sichtelement nicht eindeutig ausgewählt.');
        const {node}=await send('DOM.describeNode',{nodeId});
        const {nodes}=await send('Accessibility.getPartialAXTree',{backendNodeId:node?.backendNodeId,fetchRelatives:false});
        const ax=nodes?.filter(n=>!n.ignored&&n.backendDOMNodeId===node?.backendNodeId);
        bestaetige(ax?.length===1,'Sichtelement nicht eindeutig im Barrierebaum.');
        element={kennung:lage.kennung||selector,selector,backendNodeId:node.backendNodeId,axNodeId:ax[0].nodeId,name:ax[0].name?.value,rolle:ax[0].role?.value};
        lagepruefung.element=element;
        if(nativerFokus) {
          const n=nativerFokus.kette?.find(n=>n.nodeId===nativerFokus.nodeId);
          bestaetige(n?.name?.value&&nativerFokus.kette.some(n=>n.backendDOMNodeId===node.backendNodeId),'Nativer Fokus nicht dem Sichtelement zugeordnet.');
          element.nativerFokus={axNodeId:n.nodeId,name:n.name.value,rolle:n.role?.value};
        }
        beleg=await aufnahme(name.replace(/\.png$/,`-ausschnitt-${i+1}.png`),geometrie.clip,lage.dichte,{captureBeyondViewport:!imViewport});
        lagepruefung.ausschnitt=beleg;
      } catch(fehler) {aufnahmefehler=fehler;lagepruefung.fehler=fehler.message;}
      finally {
        // Auch PNG-, Identitäts- und Steuerungsfehler behalten beide Lageproben.
        try {
          lagepruefung.nachher=await wert(elementlageQuelle(selector));
          if(lagepruefung.nachher)lagepruefung.nachher.dokumentgroesse=(await send('Page.getLayoutMetrics')).cssContentSize;
        } catch(fehler) {lagepruefung.nachherFehler=fehler.message;aufnahmefehler??=fehler;}
      }
      if(aufnahmefehler)throw aufnahmefehler;
      const nachDom=await send('DOM.getDocument'),nachAuswahl=await send('DOM.querySelector',{nodeId:nachDom.root?.nodeId,selector}),nachKnoten=await send('DOM.describeNode',{nodeId:nachAuswahl.nodeId});
      lagepruefung.identitaet={vorher:element.backendNodeId,nachher:nachKnoten.node?.backendNodeId};
      bestaetige(lagepruefung.identitaet.vorher===lagepruefung.identitaet.nachher,'Elementidentität hat sich während des Ausschnitts geändert.');
      bestaetigeElementlage(lagepruefung);
      if(imViewport&&fokuspflicht)bestaetige(lage.fokussiert===true&&lagepruefung.nachher?.fokussiert===true,'DOM-Fokus während des Ausschnitts nicht bestätigt.');
      const a=bestaetigeSichtausschnitt({...beleg,...geometrie,element,fenster:lage.fenster,dokumentgroesse:groesse.cssContentSize,lagepruefung});
      ausschnitte.push(a);
    }
    // In der Tastaturphase auch das Übersichtsbild ohne Aufnahme über den
    // Viewport hinaus: kein Vollbild darf den nächsten Tab-Schritt verändern.
    if(imViewport) {
      nachweis.uebersichtlagen=nachweis.lagen.map(l=>({bild:name,selector:l.selector,vorher:l.nachher,nachher:null,bestaetigt:false,imViewport:true}));
      let bildfehler;
      try {await bild(name,{imViewport:true});}
      catch(fehler) {bildfehler=fehler;nachweis.uebersichtFehler=fehler.message;}
      finally {
        for(const l of nachweis.uebersichtlagen)try {
          l.nachher=await wert(elementlageQuelle(l.selector));
          if(l.nachher)l.nachher.dokumentgroesse=(await send('Page.getLayoutMetrics')).cssContentSize;
        } catch(fehler) {l.nachherFehler=fehler.message;bildfehler??=fehler;}
      }
      if(bildfehler)throw bildfehler;
      nachweis.uebersichtlagen.forEach(bestaetigeElementlage);
      if(fokuspflicht)bestaetige(nachweis.uebersichtlagen.every(l=>l.nachher?.fokussiert===true),'DOM-Fokus während des Übersichtsbilds nicht bestätigt.');
    } else await bild(name,{imViewport:false});
    const vollbild=protokoll?.bildbelege?.find(b=>b.datei===name);
    bestaetige(vollbild,'Vollbildbeleg für Sichtinventar fehlt.');
    return Object.assign(nachweis,{bild:name,ausschnitte,vollbild});
  }
  return { send, wert, bis, bedienbar, frisch, taste, tab, aktiv, erreichen, aktivieren, textEingeben, auswaehlen, berechnen, bild, sichtbild, aufnahme, mitBildzustand, bildkanalVorbereiten, ausgabe, protokoll, inhalt, feld };
}

// Teilfälle werden unabhängig protokolliert; unerwartete Steuerungsfehler sind
// geschlossen ungültig. Nur ausdrücklich bestätigte Abweichungen sind negativ.
export async function teilfall(liste, name, fn) {
  const fall = { name, status: 'bestanden', messungen: {} }; liste.push(fall);
  try { await fn(fall); }
  catch (e) { fall.status = e instanceof Abweichung || e instanceof Produktabweichung ? 'nicht bestanden' : 'ungültig'; fall.meldung = e.message; if (e.befund) fall.befund = e.befund; }
  return fall;
}
export function teilfaelleEntscheiden(liste,id) {
  bestaetige(Array.isArray(liste)&&liste.length > 0 && liste.every(f => f&&['bestanden','nicht bestanden','dokumentierte Grenze'].includes(f.status))
    &&(!liste.some(f=>f.status==='dokumentierte Grenze')||grenzenBestaetigt(id,liste)), 'Mindestens ein Teilfall ist nicht bestätigt; siehe Teilfälle.');
  verlange(!liste.some(f => f.status === 'nicht bestanden'), 'Mindestens ein Teilfall zeigt eine Produktabweichung; siehe Teilfälle.', teilfallUebersicht(liste.filter(f => f.status === 'nicht bestanden')));
  return { teilfaelle: liste };
}
export const teilfallUebersicht = liste => liste.map(({name,status,meldung,bild,sichtbilder,grenzen,messungen})=>({name,status,meldung,bild,sichtbilder,...(grenzen?.length?{grenzen}:{}),...(messungen?.reflow?{reflow:messungen.reflow}:{})}));
