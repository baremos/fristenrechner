import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { bedienung, teilfall } from './bedienung.mjs';
import { pseudoMessung } from './dom-knoten.mjs';
import { bestaetigeBildwechsel } from './belege.mjs';
import { fokusKontrastMessen } from './darstellung.mjs';
import { Messfehler } from './fehler.mjs';

const basis=resolve('scratchpad/test-darstellungszustand');mkdirSync(basis,{recursive:true});
const ordner=mkdtempSync(join(basis,'lauf-'));let nummer=0;
test.after(()=>{assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});});

function sitzung(art,{oben=4831,rollstand={x:0,y:0},layoutproben,warte=()=>{},auswerten}={}) {
  const ausgabe=join(ordner,String(++nummer));mkdirSync(ausgabe);
  const protokoll={},aufnahmen=[],rollaufrufe=[],pausen=[],befehle=[],hoch=art?.startsWith('hoch');
  let generation=0,aktiv=false,marker=false,layoutBreite=1265,verschiebung=0,rollX=0,rollY=0,lagen=0,layoutprobe={};
  const b=bedienung({ausgabe,protokoll,cdp:{send:async(m,a,timeout)=>{
    befehle.push({m,a,timeout});
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
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:aktiv&&art==='dokumentbreite'?1280:layoutBreite,height:hoch?8000:3000,...layoutprobe.dokumentgroesse}};
    if(m==='Runtime.evaluate') {
      const q=a.expression;let value;
      if(auswerten) {
        const ergebnis=await auswerten({quelle:q,timeout,aktiv});
        if(ergebnis!==undefined)return {result:{value:ergebnis}};
      }
      if(q.includes('document.createElement'))marker=true;
      else if(q.includes("getElementById('browser-pseudo-messung').remove"))marker=false;
      else if(q.includes("getPropertyValue('--browser-pseudo-bestaetigt')"))value=marker&&aktiv?'ja':'';
      else if(q==='devicePixelRatio')value=1;
      else if(q.includes('scrollTo(')) {
        rollaufrufe.push(q);
        const links=q.match(/left:\s*(-?\d+(?:\.\d+)?)/),oben=q.match(/top:\s*(-?\d+(?:\.\d+)?)/);
        assert.ok(links&&oben,'Referenzrollstand muss beide Koordinaten enthalten.');
        rollX=Number(links[1]);rollY=art==='rollstand-nicht-erreichbar'?0:Number(oben[1]);
      }
      else if(q.includes('scrollIntoView')||q.includes('scrollBy')) {
        rollaufrufe.push(q);
        if(!hoch&&q.includes('scrollIntoView')) {
          // Eine zweite Zentrierung würde die beobachtete Abweichung erneut auslösen.
          rollX=aktiv?0:rollstand.x;rollY=aktiv?0:rollstand.y;
        }
        if(hoch&&q.includes('scrollIntoView'))rollY=Math.round(q.includes("block:'start'")?oben:oben+(2212-900)/2);
        if(hoch&&q.includes('scrollBy')) {
          const relativ=q.match(/top:\s*Math\.floor\(e\.getBoundingClientRect\(\)\.top\s*-\s*(\d+(?:\.\d+)?)\)/),
            top=q.match(/top:\s*(-?\d+(?:\.\d+)?)/);
          assert.ok(relativ||top,'Rollkorrektur muss den Abstand enthalten.');
          const differenz=relativ?Math.floor(oben-rollY-Number(relativ[1])):Number(top[1]);
          rollY=Math.max(0,Math.round(rollY+differenz));
        }
      }
      else if(q.includes('const scrollruhe')) {
        lagen++;layoutprobe=layoutproben?.({nummer:lagen,aktiv})??{};
        value={kennung:'7',scrollruhe:{bestaetigt:true},viewportRechteck:{...(hoch?
          {links:33+verschiebung-rollX,oben:oben-rollY,rechts:1232+verschiebung-rollX,unten:oben+2212-rollY,breite:1199,hoehe:2212}:
          {links:50+verschiebung-rollX,oben:100-rollY,rechts:150+verschiebung-rollX,unten:130-rollY,breite:100,hoehe:30}),...layoutprobe.viewportRechteck},
          rollstand:{x:rollX,y:rollY},outline:aktiv&&art==='hoch-breiter-rahmen'?34:3,offset:0,dichte:1,
          fenster:{innerWidth:1280,innerHeight:900,clientWidth:layoutBreite,clientHeight:900,...layoutprobe.fenster}};
      }
      else if(q.includes('requestAnimationFrame')&&q.includes('setTimeout')) {pausen.push(q);warte();value=true;}
      else if(q.includes('getBoundingClientRect'))value={x:50,y:100,width:100,height:30,outline:3,offset:0};
      else value={innerWidth:1280,innerHeight:900,clientWidth:layoutBreite,clientHeight:900,scrollX:0,scrollY:0};
      return {result:{value}};
    }
    if(m==='Page.captureScreenshot') {
      aufnahmen.push({aktiv,generation,lagen,...a});const bytes=Buffer.alloc(80);
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
  return {b,protokoll,aufnahmen,rollaufrufe,pausen,befehle,verlieren:()=>{aktiv=false;}};
}

const fokusOptionen={selector:'#ziel',pseudo:'focus-visible',bedienelement:'#ziel',kennung:'0'};
test('Fokuspaar entsteht vor weiteren Bildern im sichtbaren Viewport und behält beide bestätigten Geometrien',async()=>{
  const {b,protokoll,aufnahmen,befehle}=sitzung(),fall={name:'fokus-0',messungen:{}};
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
    assert.equal(g.layoutruhe.bestaetigt,true);assert.equal(g.layoutruhe.erforderlicheProben,3);
    assert.equal(g.layoutruhe.pauseMs,50);assert.equal(g.layoutruhe.hoechstwartezeitMs,2000);
    assert.equal(g.layoutruhe.proben.length,3);
    assert.deepEqual(g.layoutruhe.proben.map(p=>p.stabileProben),[1,2,3]);
    assert.ok(g.layoutruhe.proben.every(p=>Number.isFinite(p.zeitMs)&&p.fenster&&p.dokumentgroesse&&p.viewportRechteck));
    for(const p of [g.vorher,g.nachher]) {
      assert.equal(p.fenster.innerWidth,1280);assert.equal(p.fenster.clientWidth,1265);assert.equal(p.dokumentgroesse.width,1265);
      assert.deepEqual(p.dokumentRechteck,{links:50,oben:100,rechts:150,unten:130,breite:100,hoehe:30});
    }
  }
  assert.ok(aufnahmen.slice(0,2).every(a=>a.captureBeyondViewport===false));
  assert.equal(aufnahmen.length,5);assert.equal(aufnahmen[0].aktiv,false);assert.ok(aufnahmen.slice(1).every(a=>a.aktiv));
  const zustandsaufnahme=befehle.map((b,i)=>b.m==='Page.captureScreenshot'?i:-1).filter(i=>i>=0)[1];
  const vorher=befehle.slice(0,zustandsaufnahme),vorbereitung=vorher.findLastIndex(b=>b.m==='CSS.forcePseudoState'&&b.a.forcedPseudoClasses.length);
  const nachVorbereitung=vorher.slice(vorbereitung+1);
  assert.ok(vorbereitung>=0);assert.equal(nachVorbereitung.filter(b=>b.a?.expression?.includes('const scrollruhe')).length,3,
    'Die erneute Fokusvorbereitung muss vor allen Ruheproben und der Aufnahme liegen.');
  assert.ok(nachVorbereitung.some(b=>b.a?.expression?.includes('scrollTo(')));
  assert.ok(new Set(nachweis.knoten.map(k=>k.nodeId)).size>=4);
  assert.ok(nachweis.aufnahmen.every(a=>a.bestaetigt));
  assert.deepEqual(nachweis.zurueckgesetzt,{nodeId:nachweis.knoten.at(-1).nodeId,aktivVorher:true,aktivNachher:false,bestaetigt:true});
});

test('Zustandsbild setzt beide Referenzkoordinaten exakt, obwohl erneute Zentrierung den Rollstand ändern würde',async()=>{
  const referenz={x:2,y:4},{b,aufnahmen,rollaufrufe}=sitzung('rollstand',{rollstand:referenz}),fall={name:'fokus-0',messungen:{}};
  await fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>assert.fail('Sitzung verworfen'),kontrastfall:async()=>{}});
  const wechsel=fall.messungen.zustand.bildwechsel;
  assert.equal(wechsel.bestaetigt,true);assert.equal(aufnahmen.length,2);
  assert.deepEqual(wechsel.normalGeometrie.vorher.rollstand,referenz);
  assert.deepEqual(wechsel.zustandGeometrie.vorher.rollstand,referenz);
  assert.deepEqual(wechsel.zustandGeometrie.referenzRollstand,{soll:referenz,ist:referenz,bestaetigt:true});
  assert.equal(rollaufrufe.filter(q=>q.includes('scrollIntoView')).length,1);
  const setzen=rollaufrufe.filter(q=>q.includes('scrollTo('));assert.equal(setzen.length,1);
  assert.match(setzen[0],/left:\s*2/);assert.match(setzen[0],/top:\s*4/);assert.match(setzen[0],/behavior:\s*'instant'/);
  assert.deepEqual(wechsel.normalGeometrie.clip,wechsel.zustandGeometrie.clip);
});

test('Nicht erreichbarer Referenzrollstand bleibt mit Soll und Ist ungültig und erzeugt kein Zustandsbild',async()=>{
  const referenz={x:2,y:4},{b,aufnahmen}=sitzung('rollstand-nicht-erreichbar',{rollstand:referenz}),faelle=[];
  await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
  const f=faelle[0],wechsel=f.messungen.zustand.bildwechsel;
  assert.equal(f.status,'ungültig');assert.match(f.meldung,/Rollstand aus dem Normalbild nicht exakt erreichbar/);
  assert.match(f.meldung,/4/);assert.match(f.meldung,/0/);
  assert.equal(wechsel.bestaetigt,false);assert.equal(wechsel.zustandGeometrie.bestaetigt,false);
  assert.deepEqual(wechsel.zustandGeometrie.referenzRollstand,{soll:referenz,ist:{x:2,y:0},bestaetigt:false});
  assert.equal(aufnahmen.length,1);assert.equal(aufnahmen[0].aktiv,false);
});

const layoutwechsel=[
  ...['innerWidth','innerHeight','clientWidth','clientHeight'].map(k=>[k,{fenster:{[k]:k.endsWith('Width')?1281:901}}]),
  ['Dokumentbreite',{dokumentgroesse:{width:1280}}],['Dokumenthöhe',{dokumentgroesse:{height:3418}}],
  ['Elementrechteck',{viewportRechteck:{links:51,rechts:151}}],
];
for(const [feld,anfang] of layoutwechsel)test(`Vergleichsbilder warten bei späterer Änderung von ${feld} auf drei neue gleiche Layoutproben`,async()=>{
  const anzahl={normal:0,zustand:0};
  const {b,aufnahmen,pausen}=sitzung(undefined,{layoutproben:({aktiv})=>++anzahl[aktiv?'zustand':'normal']<=2?anfang:{}}),fall={name:'fokus-0',messungen:{}};
  await fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>assert.fail('Sitzung verworfen'),kontrastfall:async()=>{}});
  const wechsel=fall.messungen.zustand.bildwechsel;
  assert.equal(wechsel.bestaetigt,true);assert.equal(aufnahmen.length,2);
  for(const g of [wechsel.normalGeometrie,wechsel.zustandGeometrie]) {
    assert.equal(g.layoutruhe.bestaetigt,true);
    assert.equal(g.layoutruhe.proben.length,5,'Zwei frühe gleiche Proben dürfen den späteren Layoutwechsel nicht übergehen.');
    assert.deepEqual(g.layoutruhe.proben.map(p=>p.stabileProben),[1,2,1,2,3]);
    assert.deepEqual(g.vorher.fenster,{innerWidth:1280,innerHeight:900,clientWidth:1265,clientHeight:900});
    assert.deepEqual(g.vorher.dokumentgroesse,{width:1265,height:3000});
    assert.deepEqual(g.vorher.dokumentRechteck,{links:50,oben:100,rechts:150,unten:130,breite:100,hoehe:30});
  }
  assert.equal(aufnahmen[0].lagen,5);assert.ok(aufnahmen[1].lagen>=11);
  assert.ok(pausen.length>=8);assert.ok(pausen.every(q=>(q.match(/requestAnimationFrame/g)??[]).length>=2&&/setTimeout/.test(q)));
});

for(const zustandsbild of [false,true])test(`Dauernder Layoutwechsel vor dem ${zustandsbild?'Zustandsbild':'Normalbild'} bleibt innerhalb der Höchstwartezeit ungültig`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  const {b,aufnahmen,pausen}=sitzung(undefined,{warte:()=>t.mock.timers.tick(50),
    layoutproben:({nummer,aktiv})=>aktiv===zustandsbild?{dokumentgroesse:{height:3000+nummer%2}}:{}}),faelle=[];
  await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
  const f=faelle[0],wechsel=f.messungen.zustand.bildwechsel,g=zustandsbild?wechsel.zustandGeometrie:wechsel.normalGeometrie;
  assert.equal(f.status,'ungültig');assert.match(f.meldung,/Layout vor dem Vergleichsbild nicht zur Ruhe gekommen/);
  assert.equal(g.bestaetigt,false);assert.equal(g.layoutruhe.bestaetigt,false);
  assert.ok(g.layoutruhe.proben.length>=3);assert.ok(g.layoutruhe.proben.every(p=>p.stabileProben===1));
  assert.ok(g.layoutruhe.proben.at(-1).zeitMs<=g.layoutruhe.hoechstwartezeitMs);
  assert.equal(aufnahmen.length,zustandsbild?1:0);assert.ok(pausen.length<=42);
});

for(const blockiert of ['Lageprobe','Zwischenpause'])test(`Ausbleibende Frames in der ${blockiert} enden lokal und lassen den Fokuszustand zurücksetzen`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  const abbrueche=[];let abgelaufen=false;
  const {b,aufnahmen}=sitzung(undefined,{auswerten:async({quelle,timeout,aktiv})=>{
    if(!aktiv||!quelle.includes('requestAnimationFrame')||!quelle.includes('Promise.race'))return;
    if(blockiert==='Zwischenpause'&&!abgelaufen&&quelle.includes('const scrollruhe'))return;
    const timer=[],geloescht=[],frames=[];
    // Ohne Frame-Antwort muss der echte Seitenausdruck selbst zeitlich begrenzen.
    const antwort=runInNewContext(quelle,{
      requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
      setTimeout:(fn,ms)=>{timer.push({fn,ms});return timer.length;},
      clearTimeout:kennung=>geloescht.push(kennung),
    });
    assert.equal(frames.length,1);assert.equal(timer.length,1,'Ein eigener Timer muss ohne weitere Frames angelegt werden.');
    assert.equal(timeout,timer[0].ms+1000,'Der Seitentimer muss vor dem schließenden Transport-Timeout antworten.');
    t.mock.timers.tick(timer[0].ms);timer[0].fn();
    const ergebnis=await antwort;
    assert.equal(ergebnis.wartezeitAbgelaufen,true);assert.deepEqual(geloescht,[1]);
    abbrueche.push({lokal:timer[0].ms,transport:timeout});abgelaufen=true;return ergebnis;
  }}),faelle=[];
  await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>assert.fail('Sitzung muss nach lokalem Timeout bedienbar bleiben'),
    kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
  const f=faelle[0],nachweis=f.messungen.zustand,g=nachweis.bildwechsel.zustandGeometrie;
  assert.equal(f.status,'ungültig');assert.match(f.meldung,/Layout vor dem Vergleichsbild nicht zur Ruhe gekommen/);
  assert.equal(g.layoutruhe.bestaetigt,false);assert.match(g.nachherFehler,/Scrollruhe nach dem Vergleichsbild nicht bestätigt/);
  assert.deepEqual(abbrueche,[{lokal:2000,transport:3000},{lokal:1000,transport:2000}]);
  assert.equal(aufnahmen.length,1);assert.equal(aufnahmen[0].aktiv,false);
  assert.equal(nachweis.zurueckgesetzt.bestaetigt,true);assert.equal(nachweis.zurueckgesetzt.aktivNachher,false);
});

for(const [feld,fehlend] of [['Viewporthöhe',{fenster:{clientHeight:undefined}}],['Dokumenthöhe',{dokumentgroesse:{height:undefined}}],
  ['Elementbreite',{viewportRechteck:{breite:undefined}}]])test(`Fehlende ${feld} bestätigt auch bei gleichen Proben keine Layoutruhe`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:10000});
  const {b,aufnahmen}=sitzung(undefined,{warte:()=>t.mock.timers.tick(50),layoutproben:()=>fehlend}),faelle=[];
  await teilfall(faelle,'fokus-0',fall=>fokusKontrastMessen(b,fall,{...fokusOptionen,verwerfen:()=>{},kontrastfall:async()=>assert.fail('Ungültiges Paar')}));
  const f=faelle[0],g=f.messungen.zustand.bildwechsel.normalGeometrie;
  assert.equal(f.status,'ungültig');assert.match(f.meldung,/Layout vor dem Vergleichsbild nicht zur Ruhe gekommen/);
  assert.equal(g.layoutruhe.bestaetigt,false);assert.ok(g.layoutruhe.proben.every(p=>p.stabileProben===0));
  assert.equal(aufnahmen.length,0);
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
  assert.equal(rollaufrufe.filter(q=>q.includes("block:'center'")).length,1);
  assert.equal(rollaufrufe.filter(q=>q.includes("block:'start'")&&q.includes("inline:'nearest'")&&q.includes("behavior:'instant'")).length,1);
  assert.equal(rollaufrufe.filter(q=>q.includes('scrollBy')).length,1);
  assert.equal(rollaufrufe.filter(q=>q.includes('scrollTo(')).length,1);
  assert.equal(wechsel.normalGeometrie.layoutruhe.proben.length,6);
  assert.deepEqual(wechsel.normalGeometrie.layoutruhe.proben.map(p=>p.stabileProben),[1,2,3,1,2,3]);
  assert.equal(wechsel.zustandGeometrie.layoutruhe.proben.length,3);
  assert.deepEqual(wechsel.zustandGeometrie.referenzRollstand,{soll:{x:0,y:Math.floor(oben)-24},ist:{x:0,y:Math.floor(oben)-24},bestaetigt:true});
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
