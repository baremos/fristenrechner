import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bestaetige, pruefeEmulation } from './regeln.mjs';

// Kleiner Leser nur für die nicht verschachtelten 8-Bit-RGB(A)-PNG-Aufnahmen
// von CDP. Unbekannte Kodierungen sind Messfehler, keine geschätzten Pixel.
export function pngPixel(bytes) {
  bestaetige(Buffer.isBuffer(bytes) && bytes.length > 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'PNG-Kopf fehlt.');
  let breite, hoehe, kanal, ende = false; const teile = [];
  for (let pos = 8; pos < bytes.length;) {
    bestaetige(pos + 12 <= bytes.length, 'PNG-Block abgeschnitten.');
    const n = bytes.readUInt32BE(pos), typ = bytes.toString('ascii', pos + 4, pos + 8);
    bestaetige(pos + n + 12 <= bytes.length, 'PNG-Daten abgeschnitten.');
    const d = bytes.subarray(pos + 8, pos + 8 + n);
    if (typ === 'IHDR') {
      bestaetige(n === 13 && d[8] === 8 && [2,6].includes(d[9]) && d[10] === 0 && d[11] === 0 && d[12] === 0, 'PNG-Kodierung nicht unterstützt.');
      breite = d.readUInt32BE(0); hoehe = d.readUInt32BE(4); kanal = d[9] === 2 ? 3 : 4;
    }
    if (typ === 'IDAT') teile.push(d);
    if (typ === 'IEND') { ende = true; break; }
    pos += n + 12;
  }
  bestaetige(ende && breite > 0 && hoehe > 0 && breite * hoehe <= 1000000 && teile.length > 0, 'PNG-Abschluss oder begrenzte Bildgröße fehlt.');
  let roh;
  try { roh = inflateSync(Buffer.concat(teile), { maxOutputLength: hoehe * (breite * kanal + 1) }); }
  catch (e) { bestaetige(false, `PNG kann nicht entpackt werden: ${e.message}`); }
  const schritt = breite * kanal, pixel = Buffer.alloc(hoehe * schritt);
  bestaetige(roh.length === hoehe * (schritt + 1), 'PNG-Pixellänge weicht ab.');
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (schritt + 1)]; bestaetige(filter <= 4, 'Unbekannter PNG-Zeilenfilter.');
    for (let x = 0; x < schritt; x++) {
      const a = x >= kanal ? pixel[y * schritt + x - kanal] : 0, b = y ? pixel[(y - 1) * schritt + x] : 0;
      const c = y && x >= kanal ? pixel[(y - 1) * schritt + x - kanal] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      pixel[y * schritt + x] = (roh[y * (schritt + 1) + 1 + x] + pred) & 255;
    }
  }
  return { breite, hoehe, pixel: (x,y) => [...pixel.subarray((y * breite + x) * kanal, (y * breite + x) * kanal + 3)] };
}
export const emulationswerteQuelle = `({innerWidth,devicePixelRatio,clientWidth:document.documentElement.clientWidth,
  visuelleSkala:visualViewport.scale,
  schrift:parseFloat(getComputedStyle(document.documentElement).fontSize),
  reduziert:matchMedia('(prefers-reduced-motion: reduce)').matches,forced:matchMedia('(forced-colors: active)').matches})`;

// Keine Scroll-Abkürzung: die originale Bewegung muss tatsächlich enden.
// Auch ein kurzer Stillstand vor dem ersten Animationsbild genügt nicht.
export const scrollruheQuelle = `new Promise(resolve=>{
  const proben=[];let gleich=0;
  const schritt=()=>{const p={x:scrollX,y:scrollY,breite:document.documentElement.clientWidth,
    hoehe:document.documentElement.scrollHeight,zeit:performance.now(),
    offen:(globalThis.__messScroll??[]).filter(m=>m.id==='schedule-results'&&m.bilder.length<30).length};
    const v=proben.at(-1);gleich=v&&['x','y','breite','hoehe'].every(k=>p[k]===v[k])&&p.offen===0&&v.offen===0?gleich+1:0;
    proben.push(p);
    if(gleich>=6||proben.length>=180)resolve({bestaetigt:gleich>=6,proben});else requestAnimationFrame(schritt);
  };requestAnimationFrame(schritt);
})`;

export function pruefeReflow(probe,faktor) {
  bestaetige([2,4].includes(faktor),'Unbekannter Reflow-Faktor.');
  const breite=1280/faktor,{dom,layout,visuell}=probe??{};
  pruefeEmulation(dom,{innerWidth:breite,devicePixelRatio:1,schrift:16,visuelleSkala:1});
  bestaetige(Number.isFinite(dom.clientWidth)&&dom.clientWidth>0&&dom.clientWidth<=breite
    &&Number.isFinite(layout?.clientWidth)&&Math.abs(layout.clientWidth-dom.clientWidth)<=1
    &&visuell?.scale===1,'Reflow-Layoutbreite nicht unabhängig bestätigt.');
  return {faktor,ausgangsbreite:1280,layoutbreite:breite,schriftfaktor:1,
    methode:'Viewport-Breite bei unveränderter Schrift und Pixeldichte',...probe,bestaetigt:true};
}

export function emulation(b) {
  const messen = () => b.wert(emulationswerteQuelle);
  let basis;
  async function viewport(breite) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: breite, height: 900, deviceScaleFactor: 1, mobile: false });
    return pruefeEmulation(await messen(), { innerWidth: breite, devicePixelRatio: 1 });
  }
  async function reflow(faktor) {
    bestaetige([2,4].includes(faktor),'Unbekannter Reflow-Faktor.');
    await viewport(1280/faktor);
    const dom=await messen(),cdp=await b.send('Page.getLayoutMetrics');
    return pruefeReflow({dom,layout:cdp.cssLayoutViewport,visuell:cdp.cssVisualViewport},faktor);
  }
  async function zoom(faktor,nachweis={}) {
    // Echter Desktop-Browserzoom per Tastatur. PageScaleFactor wäre Pinchzoom
    // ohne Umbruch und deviceScaleFactor allein nur Pixeldichte.
    // Eine feste emulierte Breite/Pixeldichte verdeckt die Wirkung eines
    // Desktopzooms. Erst die echte Fenstergeometrie als Referenz messen.
    nachweis.methode='Desktop-Tastenkürzel nach Emulation.clearDeviceMetricsOverride';
    nachweis.antwort=await b.send('Emulation.clearDeviceMetricsOverride');
    await b.taste('0', { code: 'Digit0', vk: 48, modifiers: 2 });
    nachweis.basis=await messen();
    bestaetige(nachweis.basis.innerWidth>0&&nachweis.basis.devicePixelRatio>0&&nachweis.basis.visuelleSkala===1,'Zoom-Ausgangsgeometrie nicht bestätigt.');
    const schritte = { 1: 0, 2: 5, 4: 8 }[faktor]; bestaetige(schritte !== undefined, 'Unbekannte Zoomstufe.');
    for (let i = 0; i < schritte; i++) await b.taste('+', { code: 'Equal', vk: 187, modifiers: 2 });
    nachweis.faktor=faktor;nachweis.proben=[];
    try {
      await b.bis(async () => {
        const dom=await messen(),cdp=await b.send('Page.getLayoutMetrics');
        const probe={dom,layout:cdp.cssLayoutViewport,visuell:cdp.cssVisualViewport};nachweis.proben.push(probe);
        return browserzoomBestaetigt(nachweis.basis,probe,faktor);
      }, `Browserzoom ${faktor * 100} Prozent (CDP-Tastenkürzel können ohne Browserwirkung bleiben)`, { timeout: 2000 });
      nachweis.nachher=nachweis.proben.at(-1).dom;nachweis.bestaetigt=true;return nachweis;
    } catch(fehler) {
      nachweis.grenze='Nicht bestätigter Desktopzoom bleibt ungültig. Emulation.setPageScaleFactor liefert nur eine Befehlantwort und Pinchzoom ohne belegten Layoutumbruch; er ersetzt diese Messung nicht.';
      throw fehler;
    }
  }
  async function medien({ reduziert = false, forced = false } = {}) {
    await b.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-reduced-motion', value: reduziert ? 'reduce' : 'no-preference' },
      { name: 'forced-colors', value: forced ? 'active' : 'none' },
    ] });
    return pruefeEmulation(await messen(), { reduziert, forced });
  }
  async function farbreferenz() {
    const nachweis={};if(b.protokoll)(b.protokoll.farblagen??=[]).push(nachweis);
    nachweis.scrollruhe=await b.wert(scrollruheQuelle);
    bestaetige(nachweis.scrollruhe?.bestaetigt===true,'Scrollruhe vor der Farbprobe nicht bestätigt.');
    await b.wert(`(() => {document.getElementById('browser-farbreferenz')?.remove();const e=document.createElement('div');e.id='browser-farbreferenz';e.setAttribute('aria-hidden','true');e.style.cssText='position:absolute;left:0;top:'+scrollY+'px;width:96px;height:32px;z-index:2147483647;display:flex;forced-color-adjust:none;';for(const farbe of ['rgb(255,0,0)','rgb(0,255,0)','rgb(0,0,255)']){const s=document.createElement('span');s.style.cssText='display:block;width:32px;height:32px;background:'+farbe;e.append(s);}document.body.append(e);})()`);
    // Dokumentfeste Probe: captureBeyondViewport darf den Viewport vorübergehend
    // versetzen, ohne die Probe wie ein fixed-Element zu verschieben.
    const lage=nachweis.lage=await b.wert(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const e=document.getElementById('browser-farbreferenz'),r=e.getBoundingClientRect();
      resolve({x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,dichte:devicePixelRatio,
        viewport:{links:r.left,oben:r.top,rechts:r.right,unten:r.bottom},rollstand:{x:scrollX,y:scrollY},
        treffer:e.contains(document.elementFromPoint(r.left+16,r.top+16)),farben:[...e.children].map(s=>getComputedStyle(s).backgroundColor)});
    })))`);
    bestaetige(lage&&[lage.x,lage.y].every(Number.isFinite)&&lage.x>=0&&lage.y>=0&&lage.width===96&&lage.height===32&&lage.dichte===1&&lage.treffer,
      'Position der sichtbaren Farbflächen nicht bestätigt.');
    bestaetige(JSON.stringify(lage.farben)===JSON.stringify(['rgb(255, 0, 0)','rgb(0, 255, 0)','rgb(0, 0, 255)']), 'Definierte CSS-Farbflächen nicht bestätigt.');
    const clip={x:lage.x,y:lage.y,width:96,height:32,scale:1};
    const bild = nachweis.bild=await b.aufnahme('farbreferenz',clip);
    const png = pngPixel(readFileSync(join(b.ausgabe,bild.datei)));
    pruefeEmulation(png, { breite: 96, hoehe: 32 });
    const proben=[8,16,24].map(y=>[16,48,80].map(x=>png.pixel(x,y)));
    const probe={farben:proben[1],proben,lage,clip,bild};
    if(b.protokoll)(b.protokoll.farbproben??=[]).push(probe);
    bestaetige(proben.every(p=>JSON.stringify(p)===JSON.stringify(proben[1])), 'Farbflächen im Messbild nicht durchgehend an der bestätigten Position.');
    return probe;
  }
  async function canvas() {
    const lage=await b.wert(`(() => {const c=getComputedStyle(document.documentElement),r=document.body.getBoundingClientRect();return {bild:c.backgroundImage,links:r.left+scrollX,oben:r.top+scrollY,treffer:document.elementFromPoint(0.5,0.5)===document.documentElement,before:getComputedStyle(document.documentElement,'::before').content,after:getComputedStyle(document.documentElement,'::after').content};})()`);
    bestaetige(lage?.bild==='none'&&lage.links>1&&lage.oben>1&&lage.treffer&&['none','normal'].includes(lage.before)&&['none','normal'].includes(lage.after), 'Unbemalte Canvas-Probestelle nicht bestätigt.');
    const bild=await b.aufnahme('canvas',{x:0,y:0,width:1,height:1,scale:1});
    const png=pngPixel(readFileSync(join(b.ausgabe,bild.datei)));pruefeEmulation(png,{breite:1,hoehe:1});
    const farbe=png.pixel(0,0);bestaetige(JSON.stringify(farbe)==='[255,255,255]','Weißer Browser-Canvas nicht bestätigt.');
    return {lage,farbe,bild,bestaetigt:true};
  }
  async function sehschwaeche(typ) {
    await zuruecksetzen();
    try {
      const vorher = await farbreferenz();
      const antwort=await b.send('Emulation.setEmulatedVisionDeficiency', { type: typ });
      const nachher = await farbreferenz();
      bestaetige(JSON.stringify(vorher.farben) !== JSON.stringify(nachher.farben), `Sehschwäche ${typ} hat keine bestätigte Bildwirkung.`);
      if (typ === 'achromatopsia') bestaetige(nachher.farben.every(c => Math.max(...c) - Math.min(...c) <= 1), 'Farblosigkeit nicht bestätigt.');
      return { typ, antwort, vorher, nachher, wirkungBestaetigt: true };
    } finally { await b.wert("document.getElementById('browser-farbreferenz')?.remove()"); }
  }
  async function zuruecksetzen(nachweis={}) {
    if(b.protokoll)(b.protokoll.emulationsresets??=[]).push(nachweis);
    // Nur beim ersten Aufruf auf dem frischen, noch nicht emulierten Target.
    // Die Antwort des CDP-Setters bestätigt den Befehl, keinen Pixelzustand.
    await b.taste('0', { code: 'Digit0', vk: 48, modifiers: 2 }); await viewport(1280);
    await medien();
    try {
      if(!basis) {
        const probe=await farbreferenz();
        bestaetige(probe.farben.every((c,i)=>c[i]>Math.max(...c.filter((_,j)=>j!==i))+20), 'Nicht emulierte Ausgangsfarben nicht bestätigt.');
        basis=probe;
      }
      nachweis.basis=basis;
      nachweis.antwort=await b.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
      nachweis.nachher=await farbreferenz();
      bestaetige(JSON.stringify(nachweis.nachher.farben) === JSON.stringify(basis.farben), 'Zurücksetzen der Sehschwäche nicht bestätigt.');
      nachweis.metriken=pruefeEmulation(await messen(), { innerWidth: 1280, devicePixelRatio: 1, reduziert: false, forced: false });
      nachweis.bestaetigt=true;return nachweis;
    } finally { await b.wert("document.getElementById('browser-farbreferenz')?.remove()"); }
  }
  return { messen, viewport, reflow, zoom, medien, sehschwaeche, canvas, zuruecksetzen };
}

export function browserzoomBestaetigt(basis,{dom,layout,visuell},faktor) {
  return [basis?.innerWidth,basis?.devicePixelRatio,dom?.innerWidth,dom?.devicePixelRatio,dom?.clientWidth,layout?.clientWidth,visuell?.scale].every(Number.isFinite)
    && [1,2,4].includes(faktor)&&basis.innerWidth>0&&basis.devicePixelRatio>0
    && Math.abs(dom.devicePixelRatio/basis.devicePixelRatio-faktor)<0.02
    && Math.abs(dom.innerWidth-basis.innerWidth/faktor)<1
    && Math.abs(layout.clientWidth-dom.clientWidth)<=1&&dom.visuelleSkala===1&&visuell.scale===1;
}
