import { bestaetige } from './regeln.mjs';
import { scrollruheQuelle } from './emulation.mjs';

const stileQuelle = `e => {
  const eigenschaften=['color','backgroundColor','backgroundImage','opacity','fontSize','fontWeight','webkitTextFillColor',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'outlineColor','outlineWidth','outlineStyle','outlineOffset','boxShadow','textDecorationColor','textDecorationLine','transform'];
  return [e,...e.querySelectorAll('*')].map((v,i)=>({index:i,stile:[null,'::before','::after','::marker','::placeholder'].map(p=>{
    const c=getComputedStyle(v,p);return {pseudo:p,werte:Object.fromEntries(eigenschaften.map(k=>[k,c[k]]))};
  })}));
}`;
// Zwei Compositor-Frames und abgeschlossene Animationen/Transitionen sind
// Pflicht. Ein identisches Bild ersetzt diese Zustandsmessung nicht.
export const hoverQuelle = (selector, vorbereiten = false) => `(async()=>{
  const scrollruhe=await ${scrollruheQuelle};
  return new Promise(resolve=>{
  const e=document.querySelector(${JSON.stringify(selector)});
  if(!e){resolve(null);return;}
  ${vorbereiten ? `globalThis.__browserHoverEreignis=null;
    globalThis.__browserHoverListener=v=>{__browserHoverEreignis={x:v.clientX,y:v.clientY,vertrauenswuerdig:v.isTrusted};};
    document.addEventListener('mousemove',__browserHoverListener,true);
    e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});` : ''}
  requestAnimationFrame(()=>{
    const lage=()=>{const r=e.getBoundingClientRect();return {links:r.left,oben:r.top,rechts:r.right,unten:r.bottom,
      breite:r.width,hoehe:r.height,scrollX,scrollY,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight};};
    const stile=(${stileQuelle})(e),vorherLage=lage();
    requestAnimationFrame(()=>{
      const r=e.getBoundingClientRect(),x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2,
        y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2,hit=document.elementFromPoint(x,y);
      const ereignis=globalThis.__browserHoverEreignis,maus=ereignis&&document.elementFromPoint(ereignis.x,ereignis.y);
      resolve({hover:e.matches(':hover'),rechteck:{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height},
        punkt:{x,y},treffer:hit===e||e.contains(hit),sichtbar:r.width>0&&r.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight,
        ereignis,maustreffer:ereignis?{punkt:{x:ereignis.x,y:ereignis.y},treffer:maus===e||e.contains(maus),
          imViewport:ereignis.x>=0&&ereignis.x<document.documentElement.clientWidth&&ereignis.y>=0&&ereignis.y<document.documentElement.clientHeight}:null,
        scrollruhe,vorherLage,nachherLage:lage(),stile:(${stileQuelle})(e),
        stabil:scrollruhe.bestaetigt&&JSON.stringify(vorherLage)===JSON.stringify(lage())
          &&JSON.stringify(stile)===JSON.stringify((${stileQuelle})(e))&&!e.getAnimations({subtree:true}).some(a=>a.playState==='running')});
    });
  });
});})()`;
export function pruefeHover(m) {
  const { vorher, nachher } = m ?? {};
  bestaetige(vorher?.hover === false && nachher?.hover === true, 'Tatsächlicher Hover-Wechsel nicht bestätigt.');
  for (const p of [vorher, nachher]) bestaetige(p.stabil === true && p.treffer === true && p.sichtbar === true
    && [p.punkt?.x,p.punkt?.y,p.rechteck?.x,p.rechteck?.y,p.rechteck?.width,p.rechteck?.height].every(Number.isFinite)
    && p.rechteck.width > 0 && p.rechteck.height > 0 && Array.isArray(p.stile) && p.stile.length > 0, 'Hover-Lage oder berechnete Stile nicht bestätigt.');
  for(const p of [vorher,nachher]) {
    const v=p.vorherLage,n=p.nachherLage,keys=['links','oben','rechts','unten','breite','hoehe','scrollX','scrollY','clientWidth','clientHeight'];
    bestaetige(p.scrollruhe?.bestaetigt===true&&v&&n&&keys.every(k=>Number.isFinite(v[k])&&v[k]===n[k])
      &&n.clientWidth>0&&n.clientHeight>0&&Math.abs(n.links+n.scrollX-p.rechteck.x)<0.01
      &&Math.abs(n.oben+n.scrollY-p.rechteck.y)<0.01&&n.breite===p.rechteck.width&&n.hoehe===p.rechteck.height,
      'Scrollruhe und stabile Hover-Geometrie nicht bestätigt.');
  }
  for(const p of [vorher,nachher]) bestaetige(p.stile.every((s,i)=>s.index===i&&Array.isArray(s.stile)&&s.stile.length===5
    &&s.stile.every((v,j)=>v.pseudo===[null,'::before','::after','::marker','::placeholder'][j]&&v.werte
      &&['color','backgroundColor','outlineColor','outlineWidth'].every(k=>typeof v.werte[k]==='string'&&v.werte[k])
      &&Object.values(v.werte).every(w=>typeof w==='string'))),'Berechnete Hover-Stile fehlen.');
  const v = nachher.ereignis,hit=nachher.maustreffer;
  // Die reale Maus bleibt am gesendeten Punkt. Eine verschobene Feldmitte
  // ist kein neuer Mausauftrag; entscheidend ist der aktuelle Treffer dort.
  bestaetige(v?.vertrauenswuerdig === true && [v.x,v.y].every(Number.isFinite)
    && Math.abs(v.x-vorher.punkt.x) <= 1 && Math.abs(v.y-vorher.punkt.y) <= 1
    &&hit?.treffer===true&&hit.imViewport===true&&hit.punkt?.x===v.x&&hit.punkt?.y===v.y,
    'Vertrauenswürdige Mausposition mit aktuellem Treffer am Hover-Ziel nicht bestätigt.');
  bestaetige(vorher.stile.length === nachher.stile.length && vorher.stile.every((s,i)=>s.index===nachher.stile[i].index), 'Hover-Stilinventar hat sich verändert.');
  return { ...m, bestaetigt: true, stilAenderung: JSON.stringify(vorher.stile) !== JSON.stringify(nachher.stile) };
}
export async function hoverMessen(b, selector, nachweis = {}) {
  nachweis.selector = selector; nachweis.methode = 'Input.dispatchMouseEvent';
  await b.send('Page.bringToFront');
  await b.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:0.5, y:0.5, button:'none', buttons:0 });
  // Erst nach dem Scrollen erneut neutralisieren: der Pointer könnte durch
  // den Layoutwechsel über dem Ziel liegen, obwohl noch kein Hover gesendet ist.
  await b.wert(hoverQuelle(selector,true));
  try {
    await b.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:0.5, y:0.5, button:'none', buttons:0 });
    nachweis.vorher = await b.bis(async()=>{const m=await b.wert(hoverQuelle(selector));nachweis.vorher=m;return m?.stabil?m:false;},'Stabile Hover-Ausgangslage');
    bestaetige(nachweis.vorher?.hover === false, 'Neutraler Zustand vor Hover nicht bestätigt.');
    const { x,y } = nachweis.vorher.punkt;
    await b.send('Input.dispatchMouseEvent', { type:'mouseMoved', x,y,button:'none',buttons:0 });
    nachweis.nachher = await b.bis(async()=>{const m=await b.wert(hoverQuelle(selector));nachweis.nachher=m;return m?.stabil?m:false;},'Stabile Hover-Wirkung');
    Object.assign(nachweis,pruefeHover(nachweis));
    return nachweis;
  } finally {
    await b.wert("document.removeEventListener('mousemove',globalThis.__browserHoverListener,true);delete globalThis.__browserHoverListener;delete globalThis.__browserHoverEreignis");
  }
}
