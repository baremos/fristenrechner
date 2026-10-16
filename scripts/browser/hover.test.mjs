import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { hoverQuelle, pruefeHover, hoverMessen } from './hover.mjs';
import { Messfehler } from './fehler.mjs';
import { teilfall, teilfaelleEntscheiden } from './bedienung.mjs';

const stile=farbe=>[{index:0,stile:[null,'::before','::after','::marker','::placeholder'].map(pseudo=>({pseudo,werte:{color:farbe,backgroundColor:'rgb(255, 255, 255)',outlineColor:'rgb(0, 0, 0)',outlineWidth:'0px'}}))}];
const lage=(hover=false)=>{const geometrie={links:20,oben:45,rechts:220,unten:75,breite:200,hoehe:30,scrollX:0,scrollY:655,clientWidth:1265,clientHeight:900};
  return {hover,stabil:true,treffer:true,sichtbar:true,punkt:{x:120,y:60},rechteck:{x:20,y:700,width:200,height:30},stile:stile('rgb(0, 0, 0)'),
    scrollruhe:{bestaetigt:true},vorherLage:{...geometrie},nachherLage:{...geometrie},
    maustreffer:{punkt:{x:120,y:60},treffer:true,imViewport:true},ereignis:{x:120,y:60,vertrauenswuerdig:true}};};
test('Bestätigtes Hover ohne Stiländerung ist ein Messwert; geänderte berechnete Stile werden ausdrücklich belegt',()=>{
  const m={vorher:lage(),nachher:lage(true)};
  assert.equal(pruefeHover(m).stilAenderung,false);
  m.nachher.stile=stile('rgb(100, 0, 0)');assert.equal(pruefeHover(m).stilAenderung,true);
});
for(const [name,extra] of [['pseudo-fehlt',{hover:false}],['position',{ereignis:{x:121.01,y:60,vertrauenswuerdig:true}}],
  ['vertrauen',{ereignis:{x:120,y:60,vertrauenswuerdig:false}}],['treffer',{treffer:false}],['frame',{stabil:false}],
  ['unsichtbar',{sichtbar:false}],['rechteck',{rechteck:{x:0,y:0,width:0,height:20}}],['stile',{stile:[]}],
  ['stilwerte',{stile:[{index:0,stile:Array(5).fill({pseudo:null,werte:{}})}]}],
  ['maustreffer-fehlt',{maustreffer:undefined}],['maustreffer-falsch',{maustreffer:{punkt:{x:120,y:60},treffer:false,imViewport:true}}],
  ['maus-ausserhalb',{maustreffer:{punkt:{x:120,y:60},treffer:true,imViewport:false}}],
  ['mauspunkt-falsch',{maustreffer:{punkt:{x:119,y:60},treffer:true,imViewport:true}}],['scrollruhe',{scrollruhe:{bestaetigt:false}}],
  ['geometrie-fehlt',{nachherLage:undefined}],['geometrie-bewegt',{nachherLage:{...lage().nachherLage,links:21}}]]) {
  test(`Hover-Gegenprobe bleibt Messfehler: ${name}`,()=>assert.throws(()=>pruefeHover({vorher:lage(),nachher:{...lage(true),...extra}}),Messfehler));
}
test('Bereits vorher aktives Hover und veränderte Ziele werden nicht als gemessener Wechsel anerkannt',()=>{
  assert.throws(()=>pruefeHover({vorher:lage(true),nachher:lage(true)}),Messfehler);
  const nachher=lage(true);nachher.stile.push(...stile('rot'));assert.throws(()=>pruefeHover({vorher:lage(),nachher}),Messfehler);
});
test('Verschobene Feldmitte verlangt einen Treffer an der tatsächlichen Maus, keinen zweiten Mausauftrag',()=>{
  const vorher=lage(),nachher=lage(true);nachher.punkt.x=108.75;
  nachher.rechteck.x=12.5;nachher.rechteck.width=192.5;
  for(const g of [nachher.vorherLage,nachher.nachherLage])Object.assign(g,{links:12.5,rechts:205,breite:192.5,clientWidth:1250});
  assert.equal(pruefeHover({vorher,nachher}).bestaetigt,true);
  nachher.maustreffer.treffer=false;
  assert.throws(()=>pruefeHover({vorher,nachher}),/aktuellem Treffer/);
});
test('Echter Mausweg neutralisiert, wartet auf Frames/Stile und sendet mouseMoved zum bestätigten Treffpunkt',async()=>{
  let hover=false;const aufrufe=[],b={send:async(m,p)=>{aufrufe.push([m,p]);if(m==='Input.dispatchMouseEvent')hover=p.x===120;},
    wert:async q=>{aufrufe.push(['messen',q]);return lage(hover);},bis:async fn=>{const m=await fn();if(!m)throw new Messfehler('Instabil');return m;}};
  const m=await hoverMessen(b,'#ziel');assert.equal(m.bestaetigt,true);
  assert.deepEqual(aufrufe.filter(([m])=>m==='Input.dispatchMouseEvent').map(([,p])=>[p.type,p.x,p.y]),
    [['mouseMoved',0.5,0.5],['mouseMoved',0.5,0.5],['mouseMoved',120,60]]);
  assert.ok(aufrufe.filter(([m])=>m==='messen').slice(0,-1).every(([,q])=>q.includes('requestAnimationFrame')));
  assert.ok(aufrufe.at(-1)[1].includes('removeEventListener'));
  b.send=async()=>{};hover=false;
  const liste=[];await teilfall(liste,'hover-unbestaetigt',()=>hoverMessen(b,'#ziel'));await teilfall(liste,'danach',async()=>{});
  assert.deepEqual(liste.map(f=>f.status),['ungültig','bestanden']);assert.throws(()=>teilfaelleEntscheiden(liste),Messfehler);
});
test('Messquelle bestätigt echte Pseudoklasse, Treffpunkt, Ereignis, zwei Frames und laufende Transitionen',async()=>{
  const e={matches:q=>q===':hover',getBoundingClientRect:()=>({left:20,top:40,right:220,bottom:70,width:200,height:30}),contains:()=>false,
    querySelectorAll:()=>[],getAnimations:()=>[{playState:'running'}]};let frames=0;
  const m=await vm.runInNewContext(hoverQuelle('#ziel'),{document:{querySelector:()=>e,elementFromPoint:()=>e,documentElement:{clientWidth:1265,clientHeight:900,scrollHeight:3401}},scrollX:0,scrollY:660,innerWidth:1280,innerHeight:900,
    getComputedStyle:()=>new Proxy({},{get:()=> 'none'}),requestAnimationFrame:fn=>{frames++;fn();},performance:{now:()=>frames},
    __browserHoverEreignis:{x:120,y:55,vertrauenswuerdig:true}});
  assert.equal(frames,9);assert.equal(m.hover,true);assert.equal(m.treffer,true);assert.equal(m.rechteck.y,700);assert.equal(m.stabil,false);
  assert.equal(m.maustreffer.treffer,true);assert.equal(m.scrollruhe.bestaetigt,true);
});
test('DOM-Hover und ein treffender Mittelpunkt ersetzen keinen Treffer an der realen Maus; Bewegung zwischen Frames bleibt instabil',async()=>{
  let frames=0,verschieben=false;
  const e={matches:()=>true,getBoundingClientRect:()=>({left:20+(verschieben&&frames>=9?1:0),top:40,right:220,bottom:70,width:200,height:30}),
    contains:()=>false,querySelectorAll:()=>[],getAnimations:()=>[]};
  const kontext={document:{querySelector:()=>e,elementFromPoint:x=>x===120?e:null,documentElement:{clientWidth:1265,clientHeight:900,scrollHeight:3401}},
    scrollX:0,scrollY:660,innerWidth:1280,innerHeight:900,getComputedStyle:()=>new Proxy({},{get:()=> 'none'}),
    requestAnimationFrame:fn=>{frames++;fn();},performance:{now:()=>frames},__browserHoverEreignis:{x:121,y:55,vertrauenswuerdig:true}};
  let m=await vm.runInNewContext(hoverQuelle('#ziel'),kontext);assert.equal(m.treffer,true);assert.equal(m.maustreffer.treffer,false);
  verschieben=true;frames=0;m=await vm.runInNewContext(hoverQuelle('#ziel'),kontext);assert.equal(m.stabil,false);
});
