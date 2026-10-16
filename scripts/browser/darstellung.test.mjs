import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bedienung, teilfall } from './bedienung.mjs';
import { pseudoMessung } from './dom-knoten.mjs';
import { bestaetigeBildwechsel } from './belege.mjs';
import { fokusKontrastMessen } from './darstellung.mjs';
import { Messfehler } from './fehler.mjs';

const basis=resolve('scratchpad/test-darstellungszustand');mkdirSync(basis,{recursive:true});
const ordner=mkdtempSync(join(basis,'lauf-'));let nummer=0;
test.after(()=>{assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});});

function sitzung(art,{oben=4831}={}) {
  const ausgabe=join(ordner,String(++nummer));mkdirSync(ausgabe);
  const protokoll={},aufnahmen=[],rollaufrufe=[],hoch=art?.startsWith('hoch');
  let generation=0,aktiv=false,marker=false,layoutBreite=1265,verschiebung=0,rollY=0;
  const b=bedienung({ausgabe,protokoll,cdp:{send:async(m,a)=>{
    if(m==='DOM.getDocument'){generation++;aktiv=false;return {root:{nodeId:generation*100}};}
    if(m==='DOM.querySelector')return {nodeId:generation*100+(a.selector==='#ziel'?7:8)};
    if(m==='DOM.describeNode')return {node:{backendNodeId:a.nodeId%100===7?97:98}};
    if(m==='Accessibility.getPartialAXTree')return {nodes:[{nodeId:String(a.backendNodeId),backendDOMNodeId:a.backendNodeId,ignored:false,role:{value:'checkbox'},name:{value:'Kontrolle'}}]};
    if(m==='CSS.forcePseudoState'){
      assert.equal(a.nodeId,generation*100+7,'Veraltete nodeId darf nicht verwendet werden.');
      if(a.forcedPseudoClasses.length)aktiv=art!=='wirkungslos';else if(art!=='reset-wirkungslos')aktiv=false;
      if(aktiv&&art==='layoutbreite')layoutBreite=1280;
      if(aktiv&&art==='elementlage')verschiebung=1;
      return {};
    }
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:aktiv&&art==='dokumentbreite'?1280:layoutBreite,height:hoch?8000:3000}};
    if(m==='Runtime.evaluate') {
      const q=a.expression;let value;
      if(q.includes('document.createElement'))marker=true;
      else if(q.includes("getElementById('browser-pseudo-messung').remove"))marker=false;
      else if(q.includes("getPropertyValue('--browser-pseudo-bestaetigt')"))value=marker&&aktiv?'ja':'';
      else if(q==='devicePixelRatio')value=1;
      else if(q.includes('scrollIntoView')||q.includes('scrollBy')) {
        rollaufrufe.push(q);
        if(hoch&&q.includes('scrollIntoView'))rollY=Math.round(q.includes("block:'start'")?oben:oben+(2212-900)/2);
        if(hoch&&q.includes('scrollBy')) {
          const relativ=q.match(/top:\s*Math\.floor\(e\.getBoundingClientRect\(\)\.top\s*-\s*(\d+(?:\.\d+)?)\)/),
            top=q.match(/top:\s*(-?\d+(?:\.\d+)?)/);
          assert.ok(relativ||top,'Rollkorrektur muss den Abstand enthalten.');
          const differenz=relativ?Math.floor(oben-rollY-Number(relativ[1])):Number(top[1]);
          rollY=Math.max(0,Math.round(rollY+differenz));
        }
      }
      else if(q.includes('const scrollruhe'))value={kennung:'7',scrollruhe:{bestaetigt:true},viewportRechteck:hoch?
        {links:33+verschiebung,oben:oben-rollY,rechts:1232+verschiebung,unten:oben+2212-rollY,breite:1199,hoehe:2212}:
        {links:50+verschiebung,oben:100,rechts:150+verschiebung,unten:130,breite:100,hoehe:30},
        rollstand:{x:0,y:rollY},outline:aktiv&&art==='hoch-breiter-rahmen'?34:3,offset:0,dichte:1,
        fenster:{innerWidth:1280,innerHeight:900,clientWidth:layoutBreite,clientHeight:900}};
      else if(q.includes('getBoundingClientRect'))value={x:50,y:100,width:100,height:30,outline:3,offset:0};
      else value={innerWidth:1280,innerHeight:900,clientWidth:layoutBreite,clientHeight:900,scrollX:0,scrollY:0};
      return {result:{value}};
    }
    if(m==='Page.captureScreenshot') {
      aufnahmen.push({aktiv,generation,...a});const bytes=Buffer.alloc(80);
      Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);
      bytes.writeUInt32BE(a.clip.width,16);bytes.writeUInt32BE(a.clip.height,20);
      bytes[79]=aktiv&&!['identisches-bild','hoch-identisches-bild'].includes(art)?1:0;
      if(art==='verlust-bei-aufnahme')aktiv=false;
      if(aktiv&&art==='lage-bei-aufnahme')verschiebung=1;
      // Zusätzliche Dokumentaufnahmen bilden den beobachteten Layoutwechsel ab.
      if(a.captureBeyondViewport)layoutBreite=1280;
      return {data:bytes.toString('base64')};
    }
    assert.fail(m);
  }}});
  return {b,protokoll,aufnahmen,rollaufrufe,verlieren:()=>{aktiv=false;}};
}

const fokusOptionen={selector:'#ziel',pseudo:'focus-visible',bedienelement:'#ziel',kennung:'0'};
test('Fokuspaar entsteht vor weiteren Bildern im sichtbaren Viewport und behält beide bestätigten Geometrien',async()=>{
  const {b,protokoll,aufnahmen}=sitzung(),fall={name:'fokus-0',messungen:{}};
  await fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>assert.fail('Sitzung verworfen'),kontrastfall:async()=>{
    assert.equal(fall.messungen.zustand.bildwechsel.bestaetigt,true);
    await b.sichtbild('nativ-fokus.png',{selectors:['#ziel','#anders']});
  }});
  const nachweis=fall.messungen.zustand,wechsel=nachweis.bildwechsel;
  assert.deepEqual(protokoll.bildbelege.slice(0,2).map(b=>b.datei),['b9-normal-0.png','b9-fokus-0.png']);
  assert.equal(wechsel.bestaetigt,true);assert.notEqual(wechsel.normalSha256,wechsel.zustandSha256);
  for(const g of [wechsel.normalGeometrie,wechsel.zustandGeometrie]) {
    assert.equal(g.bestaetigt,true);assert.equal(g.captureBeyondViewport,false);
    assert.equal(g.ausschnittart,'vollständig');assert.equal(g.abgeschnitteneHoehe,0);
    for(const p of [g.vorher,g.nachher]) {
      assert.equal(p.fenster.innerWidth,1280);assert.equal(p.fenster.clientWidth,1265);assert.equal(p.dokumentgroesse.width,1265);
      assert.deepEqual(p.dokumentRechteck,{links:50,oben:100,rechts:150,unten:130,breite:100,hoehe:30});
    }
  }
  assert.ok(aufnahmen.slice(0,2).every(a=>a.captureBeyondViewport===false));
  assert.equal(aufnahmen.length,5);assert.equal(aufnahmen[0].aktiv,false);assert.ok(aufnahmen.slice(1).every(a=>a.aktiv));
  assert.ok(new Set(nachweis.knoten.map(k=>k.nodeId)).size>=4);
  assert.ok(nachweis.aufnahmen.every(a=>a.bestaetigt));
  assert.deepEqual(nachweis.zurueckgesetzt,{nodeId:nachweis.knoten.at(-1).nodeId,aktivVorher:true,aktivNachher:false,bestaetigt:true});
});

for(const oben of [4831,4831.75])test(`Hohes Fokuselement bei ${oben} bestätigt den oberen Teil mit gleichem Ausschnitt und sichtbarem Bildwechsel`,async()=>{
  const {b,protokoll,aufnahmen,rollaufrufe}=sitzung('hoch',{oben}),fall={name:'fokus-0',messungen:{}};
  await fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>assert.fail('Sitzung verworfen'),kontrastfall:async()=>{}});
  const wechsel=fall.messungen.zustand.bildwechsel;
  const rest=oben-Math.floor(oben),clip={x:9,y:oben-24,width:1247,height:900-rest,scale:1};
  assert.equal(wechsel.bestaetigt,true);assert.notEqual(wechsel.normalSha256,wechsel.zustandSha256);
  assert.equal(aufnahmen.length,2);
  for(const g of [wechsel.normalGeometrie,wechsel.zustandGeometrie]) {
    assert.equal(g.ausschnittart,'oberer Teil');assert.equal(g.abgeschnitteneHoehe,1360+rest);
    assert.equal(g.bestaetigt,true);assert.equal(g.captureBeyondViewport,false);assert.deepEqual(g.clip,clip);
    for(const p of [g.vorher,g.nachher]) {
      assert.equal(p.rollstand.y,Math.floor(oben)-24);assert.equal(p.viewportRechteck.oben,24+rest);
      assert.deepEqual(p.dokumentRechteck,{links:33,oben,rechts:1232,unten:oben+2212,breite:1199,hoehe:2212});
      assert.equal(p.fenster.clientWidth,1265);assert.equal(p.dokumentgroesse.width,1265);
    }
  }
  assert.ok(protokoll.bildbelege.every(b=>b.captureBeyondViewport===false&&JSON.stringify(b.clip)===JSON.stringify(clip)));
  assert.ok(rollaufrufe.some(q=>q.includes("block:'start'")&&q.includes("inline:'nearest'")&&q.includes("behavior:'instant'")));
  assert.ok(rollaufrufe.some(q=>q.includes('scrollBy')));
});

for(const [art,meldung] of [['hoch-breiter-rahmen',/Fokusrahmen|Breite/],['hoch-identisches-bild',/denselben Hash/]]) {
  test(`Oberer Fokus-Teilausschnitt bleibt ungültig: ${art}`,async()=>{
    const {b}=sitzung(art),faelle=[];
    await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
    const f=faelle[0],w=f.messungen.zustand.bildwechsel;
    assert.equal(f.status,'ungültig');assert.match(f.meldung,meldung);assert.equal(w.bestaetigt,false);
    assert.equal(w.normalGeometrie.ausschnittart,'oberer Teil');
    assert.ok(w.normalGeometrie.vorher&&w.normalGeometrie.nachher);
    assert.ok(w.zustandGeometrie.vorher&&w.zustandGeometrie.nachher);
  });
}

for(const art of ['wirkungslos','verlust-bei-aufnahme','identisches-bild','reset-wirkungslos','verlust-vor-reset']) {
  test(`Fokus-Gegenprobe bleibt ungültig: ${art}`,async()=>{
    const {b,verlieren}=sitzung(art),faelle=[];
    await teilfall(faelle,'fokus',async()=>{
      await fokusKontrastMessen(b,{name:'fokus-0',messungen:{}},{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>{
        await b.sichtbild('nativ-fokus.png',{selectors:['#ziel']});
        if(art==='verlust-vor-reset')verlieren();
      }});
    });
    assert.equal(faelle[0].status,'ungültig');
    if(art==='identisches-bild')assert.match(faelle[0].meldung,/denselben Hash/);
    if(art==='verlust-vor-reset')assert.match(faelle[0].meldung,/vor dem Zurücksetzen verloren/);
  });
}

for(const [art,meldung] of [['layoutbreite',/Layoutbreite/],['dokumentbreite',/Layoutbreite/],['elementlage',/Elementrechteck/],
  ['lage-bei-aufnahme',/Elementlage/]]) {
  test(`Geometrie-Gegenprobe ${art} bleibt mit Ursache und Lageproben ungültig`,async()=>{
    const {b}=sitzung(art),faelle=[];
    await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
    const f=faelle[0],w=f.messungen.zustand.bildwechsel;
    assert.equal(f.status,'ungültig');assert.match(f.meldung,meldung);assert.equal(w.bestaetigt,false);
    assert.ok(w.normalGeometrie.vorher&&w.normalGeometrie.nachher);
    assert.ok(w.zustandGeometrie.vorher&&w.zustandGeometrie.nachher);
    assert.equal(f.bild,'b9-fokus-0.png','Die Gruppen-Nachaufnahme darf kein bereits geschriebenes Bild erneut anlegen.');
  });
}

test('Verschiedene Ausschnitte und gleicher Hash bleiben bei bestätigter gleicher Geometrie ungültig',async()=>{
  const {b,protokoll}=sitzung(),nachweis={};
  await b.bild('normal.png',{selector:'#ziel',imViewport:true});
  const zustand=await pseudoMessung(b,'#ziel','focus-visible',{});
  await b.mitBildzustand(zustand,()=>b.bild('fokus.png',{selector:'#ziel',imViewport:true}));
  const [normal,fokus]=protokoll.bildbelege;
  assert.equal(bestaetigeBildwechsel(normal,fokus).bestaetigt,true);
  for(const [probe,meldung] of [[{...fokus,clip:{...fokus.clip,x:fokus.clip.x+1}},/verschiedene Ausschnitte/],
    [{...fokus,sha256:normal.sha256},/denselben Hash/],
    [{...fokus,geometrie:{...fokus.geometrie,ausschnittart:'oberer Teil'}},/Ausschnittart/],
    [{...fokus,geometrie:undefined},/Geometrie/],[{...fokus,captureBeyondViewport:true},/Aufnahmeverfahren/]]) {
    const faelle=[];
    await teilfall(faelle,'gegenprobe',()=>bestaetigeBildwechsel(normal,probe,nachweis));
    assert.equal(faelle[0].status,'ungültig');assert.match(faelle[0].meldung,meldung);assert.equal(nachweis.bestaetigt,false);
    assert.ok(nachweis.normalGeometrie&&nachweis.zustandGeometrie);
  }
  assert.throws(()=>bestaetigeBildwechsel(null,fokus),Messfehler);
  const verschieben=(beleg,abstand)=>{
    const kopie=structuredClone(beleg),r=kopie.geometrie.nachher.viewportRechteck;
    r.links+=abstand;r.rechts+=abstand;return kopie;
  };
  assert.equal(bestaetigeBildwechsel(normal,verschieben(fokus,0.5)).bestaetigt,true);
  assert.throws(()=>bestaetigeBildwechsel(normal,verschieben(fokus,1)),/Elementlage/);
  assert.throws(()=>bestaetigeBildwechsel(verschieben(normal,-0.5),verschieben(fokus,0.5)),/Elementrechteck/);
  await zustand.zuruecksetzen();
});
