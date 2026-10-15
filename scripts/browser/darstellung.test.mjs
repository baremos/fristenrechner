import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bedienung, teilfall } from './bedienung.mjs';
import { pseudoMessung } from './dom-knoten.mjs';
import { bestaetigeBildwechsel } from './belege.mjs';
import { Messfehler } from './fehler.mjs';

const basis=resolve('scratchpad/test-darstellungszustand');mkdirSync(basis,{recursive:true});
const ordner=mkdtempSync(join(basis,'lauf-'));let nummer=0;
test.after(()=>{assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});});

function sitzung(art) {
  const ausgabe=join(ordner,String(++nummer));mkdirSync(ausgabe);
  const protokoll={},aufnahmen=[];let generation=0,aktiv=false,marker=false;
  const b=bedienung({ausgabe,protokoll,cdp:{send:async(m,a)=>{
    if(m==='DOM.getDocument'){generation++;aktiv=false;return {root:{nodeId:generation*100}};}
    if(m==='DOM.querySelector')return {nodeId:generation*100+(a.selector==='#ziel'?7:8)};
    if(m==='DOM.describeNode')return {node:{backendNodeId:a.nodeId%100===7?97:98}};
    if(m==='Accessibility.getPartialAXTree')return {nodes:[{nodeId:String(a.backendNodeId),backendDOMNodeId:a.backendNodeId,ignored:false,role:{value:'checkbox'},name:{value:'Kontrolle'}}]};
    if(m==='CSS.forcePseudoState'){
      assert.equal(a.nodeId,generation*100+7,'Veraltete nodeId darf nicht verwendet werden.');
      if(a.forcedPseudoClasses.length)aktiv=art!=='wirkungslos';else if(art!=='reset-wirkungslos')aktiv=false;
      return {};
    }
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:1280,height:1000}};
    if(m==='Runtime.evaluate') {
      const q=a.expression;let value;
      if(q.includes('document.createElement'))marker=true;
      else if(q.includes("getElementById('browser-pseudo-messung').remove"))marker=false;
      else if(q.includes("getPropertyValue('--browser-pseudo-bestaetigt')"))value=marker&&aktiv?'ja':'';
      else if(q==='devicePixelRatio')value=1;
      else if(q.includes('const scrollruhe'))value={kennung:'7',scrollruhe:{bestaetigt:true},viewportRechteck:{links:50,oben:100,rechts:150,unten:130,breite:100,hoehe:30},
        rollstand:{x:0,y:0},outline:3,offset:0,dichte:1,fenster:{innerWidth:1280,innerHeight:900,clientWidth:1280,clientHeight:900}};
      else if(q.includes('getBoundingClientRect'))value={x:50,y:100,width:100,height:30,outline:3,offset:0};
      else value={innerWidth:1280,innerHeight:900,clientWidth:1280,clientHeight:900,scrollX:0,scrollY:0};
      return {result:{value}};
    }
    if(m==='Page.captureScreenshot') {
      aufnahmen.push({aktiv,generation});const bytes=Buffer.alloc(80);
      Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);
      bytes.writeUInt32BE(a.clip.width,16);bytes.writeUInt32BE(a.clip.height,20);
      bytes[79]=aktiv&&art!=='identisches-bild'?1:0;
      if(art==='verlust-bei-aufnahme')aktiv=false;
      return {data:bytes.toString('base64')};
    }
    assert.fail(m);
  }}});
  return {b,protokoll,aufnahmen,verlieren:()=>{aktiv=false;}};
}

test('Fokus wird nach jedem DOM-Inventarwechsel vor allen Sichtausschnitten und Bildern erneut erzwungen und bestätigt',async()=>{
  const {b,protokoll,aufnahmen}=sitzung(),nachweis={};
  const normal=await b.bild('normal.png',{selector:'#ziel'});
  const zustand=await pseudoMessung(b,'#ziel','focus-visible',nachweis);
  await b.mitBildzustand(zustand,async()=>{
    await b.sichtbild('nativ-fokus.png',{selectors:['#ziel','#anders']});
    await b.bild('fokus.png',{selector:'#ziel'});
  });
  const belege=protokoll.bildbelege;
  assert.equal(bestaetigeBildwechsel(belege.find(b=>b.datei===normal),belege.at(-1)).bestaetigt,true);
  assert.equal(aufnahmen.length,5);assert.equal(aufnahmen[0].aktiv,false);assert.ok(aufnahmen.slice(1).every(a=>a.aktiv));
  assert.ok(new Set(nachweis.knoten.map(k=>k.nodeId)).size>=4);
  assert.ok(nachweis.aufnahmen.every(a=>a.bestaetigt));
  await zustand.zuruecksetzen();assert.deepEqual(nachweis.zurueckgesetzt,{nodeId:nachweis.knoten.at(-1).nodeId,aktivVorher:true,aktivNachher:false,bestaetigt:true});
});

for(const art of ['wirkungslos','verlust-bei-aufnahme','identisches-bild','reset-wirkungslos','verlust-vor-reset']) {
  test(`Fokus-Gegenprobe bleibt ungültig: ${art}`,async()=>{
    const {b,protokoll,verlieren}=sitzung(art),faelle=[];
    await teilfall(faelle,'fokus',async()=>{
      await b.bild('normal.png',{selector:'#ziel'});
      const zustand=await pseudoMessung(b,'#ziel','focus-visible',{});
      await b.mitBildzustand(zustand,async()=>{
        await b.sichtbild('nativ-fokus.png',{selectors:['#ziel']});
        await b.bild('fokus.png',{selector:'#ziel'});
        const bilder=protokoll.bildbelege;
        bestaetigeBildwechsel(bilder[0],bilder.at(-1));
      });
      if(art==='verlust-vor-reset')verlieren();
      await zustand.zuruecksetzen();
    });
    assert.equal(faelle[0].status,'ungültig');
    if(art==='identisches-bild')assert.match(faelle[0].meldung,/denselben Hash/);
    if(art==='verlust-vor-reset')assert.match(faelle[0].meldung,/vor dem Zurücksetzen verloren/);
  });
}

test('Fehlende Referenz und geänderte Ausschnitte bestätigen keinen Bildwechsel',()=>{
  const b={sha256:'a'.repeat(64),breite:100,hoehe:30,dichte:1,clip:{x:0,y:0,width:100,height:30}};
  assert.throws(()=>bestaetigeBildwechsel(null,b),Messfehler);
  assert.throws(()=>bestaetigeBildwechsel(b,{...b,sha256:'b'.repeat(64),clip:{...b.clip,x:1}}),Messfehler);
});
