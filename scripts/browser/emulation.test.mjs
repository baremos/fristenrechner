import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { pngPixel, emulation as erzeugeEmulation, browserzoomBestaetigt, scrollruheQuelle, pruefeReflow } from './emulation.mjs';
import { Messfehler } from './fehler.mjs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { bildAufnehmen, freierBildname } from './belege.mjs';

const basisDateien=resolve('scratchpad/test-bildemulation');mkdirSync(basisDateien,{recursive:true});
const dateien=mkdtempSync(join(basisDateien,'lauf-'));let sitzung=0;
test.after(()=>{assert.equal(dirname(realpathSync(dateien)),realpathSync(basisDateien));rmSync(dateien,{recursive:true,force:true});});
function emulation(b) {
  b.ausgabe=join(dateien,String(++sitzung));mkdirSync(b.ausgabe);
  b.aufnahme=(art,clip)=>bildAufnehmen(b,freierBildname(b.ausgabe,art),clip);
  const wert=b.wert;b.wert=async q=>q===scrollruheQuelle?{bestaetigt:true,proben:[]}:wert(q);
  return erzeugeEmulation(b);
}

function png(rgb=[255,0,0],filter=0) {
  const kopf=Buffer.from([137,80,78,71,13,10,26,10]),ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;
  const block=(typ,d)=>{const b=Buffer.alloc(d.length+12);b.writeUInt32BE(d.length,0);b.write(typ,4);d.copy(b,8);return b;};
  return Buffer.concat([kopf,block('IHDR',ihdr),block('IDAT',deflateSync(Buffer.from([filter,...rgb]))),block('IEND',Buffer.alloc(0))]);
}
function referenzPng(farben,versatz=0) {
  const kopf=Buffer.from([137,80,78,71,13,10,26,10]),ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(96,0);ihdr.writeUInt32BE(32,4);ihdr[8]=8;ihdr[9]=2;
  const block=(typ,d)=>{const b=Buffer.alloc(d.length+12);b.writeUInt32BE(d.length,0);b.write(typ,4);d.copy(b,8);return b;};
  const roh=Buffer.alloc(32*(96*3+1));for(let y=0;y<32;y++)for(let x=0;x<96;x++)Buffer.from(y<versatz?[255,255,255]:farben[Math.floor(x/32)]).copy(roh,y*(96*3+1)+1+x*3);
  return Buffer.concat([kopf,block('IHDR',ihdr),block('IDAT',deflateSync(roh)),block('IEND',Buffer.alloc(0))]).toString('base64');
}
const lage=extra=>({x:0,y:700,width:96,height:32,dichte:1,treffer:true,farben:['rgb(255, 0, 0)','rgb(0, 255, 0)','rgb(0, 0, 255)'],...extra});
const werte={innerWidth:1280,devicePixelRatio:1,reduziert:false,forced:false};
const wert=async q=>q.startsWith('new Promise')?lage():werte;
for(const filter of [0,1,2,3,4])test(`PNG-Farbmessung liest Filter ${filter}`,()=>{
  const bild=pngPixel(png([255,0,0],filter));assert.equal(bild.breite,1);assert.deepEqual(bild.pixel(0,0),[255,0,0]);
});
test('PNG-Messung verwirft unbekannte Kodierung, Filter, fehlenden Abschluss und abgeschnittene Daten',()=>{
  const bild=png();bild[24]=16;
  for(const b of [Buffer.alloc(50),bild,png([0,0,0],5),png().subarray(0,40),png().subarray(0,-12)])assert.throws(()=>pngPixel(b),Messfehler);
});
test('Viewport und Medien werden gemessen; unwirksamer Setter ist kein Erfolg',async()=>{
  const aufrufe=[],werte={innerWidth:1280,devicePixelRatio:1,reduziert:false,forced:false};
  const b={send:async(m,p)=>{aufrufe.push([m,p]);if(m==='Emulation.setDeviceMetricsOverride')werte.innerWidth=p.width;
    if(m==='Emulation.setEmulatedMedia'){werte.reduziert=p.features[0].value==='reduce';werte.forced=p.features[1].value==='active';}},wert:async()=>({...werte})};
  const e=emulation(b);assert.equal((await e.viewport(320)).innerWidth,320);assert.equal((await e.medien({reduziert:true,forced:true})).forced,true);
  b.send=async()=>{};await assert.rejects(()=>e.viewport(1280),Messfehler);await assert.rejects(()=>e.medien(),Messfehler);
});
test('Zoom löst feste Metrikemulation und bestätigt echte Tastenwirkung in DOM und CDP; unwirksame Setter bleiben Grenze/ungültig',async()=>{
  const tasten=[],befehle=[],basis={innerWidth:1264,devicePixelRatio:1,clientWidth:1249,visuelleSkala:1};let wirkt=false;
  const b={send:async(m)=>{befehle.push(m);return m==='Page.getLayoutMetrics'?{cssLayoutViewport:{clientWidth:wirkt?617:1249},cssVisualViewport:{scale:1}}:{};},
    taste:async(k,p)=>tasten.push([k,p]),wert:async()=>wirkt&&tasten.length%6!==1?{innerWidth:632,devicePixelRatio:2,clientWidth:617,visuelleSkala:1}:basis,
    bis:async fn=>{const r=await fn();if(!r)throw new Messfehler('Zoom nicht bestätigt');return r;}};
  const fehl={};await assert.rejects(()=>emulation(b).zoom(2,fehl),Messfehler);assert.equal(tasten.length,6);assert.ok(tasten.every(t=>t[1].modifiers===2));
  assert.equal(befehle[0],'Emulation.clearDeviceMetricsOverride');assert.equal(fehl.proben[0].dom.innerWidth,1264);assert.match(fehl.grenze,/Pinchzoom/);
  tasten.length=0;wirkt=true;const nachweis=await emulation(b).zoom(2);assert.equal(nachweis.nachher.innerWidth,632);assert.equal(nachweis.bestaetigt,true);
});

test('Zoom braucht Umbruch und Pixeldichte zugleich; Pinchzoom, nur Pixeldichte, fremde CDP-Geometrie und fehlende Werte bestehen nicht',()=>{
  const basis={innerWidth:1280,devicePixelRatio:1},gut={dom:{innerWidth:640,devicePixelRatio:2,clientWidth:625,visuelleSkala:1},layout:{clientWidth:625},visuell:{scale:1}};
  assert.equal(browserzoomBestaetigt(basis,gut,2),true);
  for(const m of [{...gut,dom:{...gut.dom,innerWidth:1280}},{...gut,dom:{...gut.dom,devicePixelRatio:1}},
    {...gut,visuell:{scale:2}},{...gut,layout:{clientWidth:1280}},{...gut,dom:{...gut.dom,visuelleSkala:2}},{...gut,visuell:{}}])
    assert.equal(browserzoomBestaetigt(basis,m,2),false);
});
test('Emulationsreset bestätigt Metriken und Medien; unwirksames Zurücksetzen bleibt ungültig',async()=>{
  const b={send:async()=>{},taste:async()=>{},wert:async()=>({innerWidth:1280,devicePixelRatio:1,reduziert:true,forced:true})};
  await assert.rejects(()=>emulation(b).zuruecksetzen(),Messfehler);
});
test('Sehschwäche muss ein verändertes Messbild liefern; Farblosigkeit braucht gleiche RGB-Kanäle',async()=>{
  let typ='none',wirkung=true;const basis=[[255,0,0],[0,255,0],[0,0,255]];
  const b={taste:async()=>{},wert,send:async(m,p)=>{
    if(m==='Emulation.setEmulatedVisionDeficiency'){typ=p.type;return {};}
    if(m==='Page.captureScreenshot')return {data:referenzPng(typ==='none'||!wirkung?basis:[[50,50,50],[180,180,180],[20,20,20]])};
  }};
  const e=emulation(b);assert.equal((await e.sehschwaeche('achromatopsia')).wirkungBestaetigt,true);
  wirkung=false;await assert.rejects(()=>e.sehschwaeche('protanopia'),Messfehler);
});
test('Ein bestätigter Setter allein genügt nicht; weiße oder graue Ausgangsflächen bleiben ungültig',async()=>{
  const b={taste:async()=>{},wert,send:async(m)=>m==='Page.captureScreenshot'?{data:referenzPng([[50,50,50],[50,50,50],[50,50,50]])}:{}};
  await assert.rejects(()=>emulation(b).zuruecksetzen(),Messfehler);
});
test('Farbprobe nimmt Dokumentkoordinaten einschließlich Scrollversatz und vergleicht gemessene Farben statt CSS-Sollwerte',async()=>{
  const auf=[],basis=[[253,2,1],[1,252,2],[2,1,253]];
  let farben=basis,resetWirkt=true;
  const b={taste:async()=>{},wert,send:async(m,p)=>{
    auf.push([m,p]);
    if(m==='Emulation.setEmulatedVisionDeficiency'&&resetWirkt)farben=p.type==='none'?basis:[[50,50,50],[170,170,170],[20,20,20]];
    return m==='Page.captureScreenshot'?{data:referenzPng(farben)}:{};
  }};
  const e=emulation(b),nachweis=await e.zuruecksetzen();assert.equal(nachweis.bestaetigt,true);assert.deepEqual(nachweis.basis.farben,basis);
  assert.ok(auf.filter(([m])=>m==='Page.captureScreenshot').every(([,p])=>p.clip.y===700));
  await e.sehschwaeche('achromatopsia');resetWirkt=false;
  const fehl={};await assert.rejects(()=>e.zuruecksetzen(fehl),Messfehler);assert.deepEqual(fehl.nachher.farben,[[50,50,50],[170,170,170],[20,20,20]]);
  resetWirkt=true;assert.equal((await e.zuruecksetzen()).bestaetigt,true);
});
test('Dokumentfeste Referenz verhindert eine beim Screenshot versetzte fixed-Probe; verschobene Pixel bleiben mit Beleg ungültig',async()=>{
  let absolut=false,versetzt=false;const p={},farben=[[255,0,0],[0,255,0],[0,0,255]];
  const b={protokoll:p,taste:async()=>{},wert:async q=>{
    if(q.includes("e.style.cssText='position:"))absolut=q.includes('position:absolute;')&&!q.includes('position:fixed;');
    return wert(q);
  },send:async m=>m==='Page.captureScreenshot'?{data:referenzPng(farben,versetzt||!absolut?23:0)}:{}};
  const e=emulation(b);assert.equal((await e.zuruecksetzen()).bestaetigt,true);assert.equal(absolut,true);
  versetzt=true;await assert.rejects(()=>e.zuruecksetzen(),Messfehler);
  assert.equal(p.emulationsresets.length,2);assert.deepEqual(p.emulationsresets[1].antwort,{});
  assert.deepEqual(p.farbproben.at(-1).farben,[[255,255,255],[255,255,255],[255,255,255]]);
  assert.deepEqual(p.farbproben.at(-1).proben[2],farben);assert.ok(p.farbproben.at(-1).bild.sha256);
});
for(const extra of [{treffer:false},{dichte:2},{x:NaN},{width:95},{farben:['weiß','weiß','weiß']}])test(`Farbprobe verwirft unbestätigte Lage ${JSON.stringify(extra)}`,async()=>{
  const b={taste:async()=>{},wert:async q=>q.startsWith('new Promise')?lage(extra):werte,send:async()=>({data:referenzPng([[255,0,0],[0,255,0],[0,0,255]])})};
  await assert.rejects(()=>emulation(b).zuruecksetzen(),Messfehler);
});
test('Scrollruhe wartet laufende Originalanimation und ausstehende 30 Messbilder ab; dauerhaft bewegte Seite besteht nicht',async()=>{
  async function probe(bewegt,offen=false) {
    let frame=0;const aufrufe=[{id:'schedule-results',bilder:offen?[]:Array(30).fill({})}];
    return new Function('requestAnimationFrame','performance','document','globalThis','scrollX','scrollY',`return ${scrollruheQuelle}`)(
      fn=>{frame++;if(frame===30)aufrufe[0].bilder=Array(30).fill({});queueMicrotask(fn);},
      {now:()=>frame*16},{documentElement:{clientWidth:1265,get scrollHeight(){return 3776;}}},
      {__messScroll:aufrufe},0,0).then(r=>({r,frame}));
  }
  const still=await probe(false,true);assert.equal(still.r.bestaetigt,true);assert.ok(still.frame>=36);
  let frame=0;
  const bewegt=await new Function('requestAnimationFrame','performance','document','globalThis','scrollX','scrollY',`return ${scrollruheQuelle}`)(
    fn=>{frame++;queueMicrotask(fn);},{now:()=>frame*16},{documentElement:{get clientWidth(){return frame%2?1265:1280;},scrollHeight:3776}},
    {__messScroll:[]},0,0);
  assert.equal(bewegt.bestaetigt,false);assert.equal(bewegt.proben.length,180);
});
test('Farbprobe bewahrt eine fehlgeschlagene Lage und prüft sie vor jeder Pixelaufnahme',async()=>{
  const p={},b={protokoll:p,taste:async()=>{},wert:async q=>q.startsWith('new Promise')?lage({treffer:false}):werte,send:async()=>({})};
  await assert.rejects(()=>emulation(b).zuruecksetzen(),Messfehler);
  assert.equal(p.farblagen[0].lage.treffer,false);assert.equal(p.farblagen[0].scrollruhe.bestaetigt,true);
  assert.ok(!p.farblagen[0].bild);
});
test('Animierter Rollstand reproduziert die alte verdeckte Farbprobe; neuer Ablauf setzt sie erst nach bestätigtem Ende',async()=>{
  let frame=0,position=1461,referenzOben=position;const aufrufe=[{id:'schedule-results',bilder:[]}],p={};
  const umgebung={document:{documentElement:{clientWidth:1265,scrollHeight:3776}},globalThis:{__messScroll:aufrufe},
    performance:{now:()=>frame*16},scrollX:0,requestAnimationFrame:fn=>{frame++;position=frame<30?1461+frame*17.3:1980;
      aufrufe[0].bilder=Array(Math.min(frame,30)).fill({});queueMicrotask(fn);}};
  Object.defineProperty(umgebung,'scrollY',{get:()=>position});
  // Alter Ablauf: top=scrollY, zwei Animationsbilder später liegt die 32px-Probe oberhalb des Viewports.
  await new Promise(r=>umgebung.requestAnimationFrame(()=>umgebung.requestAnimationFrame(r)));
  assert.ok(referenzOben-position+16<0);
  const b={ausgabe:ausgabeFuerProbe(),protokoll:p,taste:async()=>{},send:async m=>m==='Page.captureScreenshot'?{data:referenzPng([[255,0,0],[0,255,0],[0,0,255]])}:{},
    wert:async q=>{
      if(q===scrollruheQuelle)return runInNewContext(q,umgebung);
      if(q.includes("e.style.cssText='position:"))referenzOben=position;
      if(q.startsWith('new Promise'))return lage({y:referenzOben,treffer:referenzOben-position+16>=0});
      return werte;
    }};
  b.aufnahme=(art,clip)=>bildAufnehmen(b,freierBildname(b.ausgabe,art),clip);
  assert.equal((await erzeugeEmulation(b).zuruecksetzen()).bestaetigt,true);
  assert.ok(p.farblagen.every(n=>n.scrollruhe.bestaetigt&&n.lage.y===1980&&n.lage.treffer));
  b.wert=async q=>q===scrollruheQuelle?{bestaetigt:false,proben:[]}:werte;
  await assert.rejects(()=>erzeugeEmulation(b).zuruecksetzen(),Messfehler);
});
function ausgabeFuerProbe(){const p=join(dateien,String(++sitzung));mkdirSync(p);return p;}
for(const faktor of [2,4])test(`Reflow ${faktor}: Breite, Schrift, Pixeldichte und unabhängiges Layout sind Pflicht; keine Zoom-Bestätigung`,async()=>{
  const breite=1280/faktor,gut={dom:{innerWidth:breite,clientWidth:breite-15,devicePixelRatio:1,schrift:16,visuelleSkala:1},layout:{clientWidth:breite-15},visuell:{scale:1}};
  assert.equal(pruefeReflow(gut,faktor).bestaetigt,true);
  assert.equal(browserzoomBestaetigt({innerWidth:1280,devicePixelRatio:1},gut,faktor),false);
  for(const schlecht of [{...gut,dom:{...gut.dom,innerWidth:1280}},{...gut,dom:{...gut.dom,schrift:32}},
    {...gut,dom:{...gut.dom,devicePixelRatio:faktor}},{...gut,layout:{clientWidth:1280}},{...gut,visuell:{scale:faktor}}])
    assert.throws(()=>pruefeReflow(schlecht,faktor),Messfehler);
  const b={wert:async()=>gut.dom,send:async m=>m==='Page.getLayoutMetrics'?{cssLayoutViewport:gut.layout,cssVisualViewport:gut.visuell}:{}};
  assert.equal((await emulation(b).reflow(faktor)).layoutbreite,breite);
});
test('Transparente Hintergrundketten verwenden nur einen gemessenen weißen Canvas, keinen geschätzten Browserhintergrund',async()=>{
  let rgb=[255,255,255],links=8;
  const b={wert:async()=>({bild:'none',links,oben:8,treffer:true,before:'none',after:'none'}),send:async()=>({data:png(rgb).toString('base64')})};
  assert.equal((await emulation(b).canvas()).bestaetigt,true);
  rgb=[0,0,0];await assert.rejects(()=>emulation(b).canvas(),Messfehler);links=0;await assert.rejects(()=>emulation(b).canvas(),Messfehler);
});
