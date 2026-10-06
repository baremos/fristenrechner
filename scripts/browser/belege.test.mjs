import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bildAufnehmen, dateiAblegen, elementClip, sichtbereichClip, bestaetigeSichtausschnitt } from './belege.mjs';
import { bedienung, teilfallUebersicht } from './bedienung.mjs';
import { kontrastMessen } from './darstellung.mjs';
import { Abweichung } from './regeln.mjs';
import { Messfehler } from './fehler.mjs';
import { scrollruheQuelle } from './emulation.mjs';

const basis=resolve('scratchpad/test-belege');mkdirSync(basis,{recursive:true});
const arbeit=mkdtempSync(join(basis,'lauf-'));let nummer=0;
test.after(()=>{assert.equal(dirname(realpathSync(arbeit)),realpathSync(basis));rmSync(arbeit,{recursive:true,force:true});});
function ausgabe(){const p=join(arbeit,String(++nummer));mkdirSync(p);return p;}
function bild(width,height,laenge=730061) {
  const bytes=Buffer.alloc(laenge);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;
}
test('110 Aufnahmen speichern sofort Dateien; Phase behält ausschließlich kleine Metadaten',async()=>{
  const ordner=ausgabe(),bytes=bild(1280,7287),clip={x:0,y:0,width:1280,height:7287,scale:1},p={},cdp={send:async(m)=>{
    if(m==='Page.captureScreenshot')return {data:bytes.toString('base64')};return {result:{value:1}};
  }};
  const b=bedienung({cdp,ausgabe:ordner,protokoll:p});
  for(let i=0;i<110;i++)await b.aufnahme(`beleg-${i}.png`,clip);
  assert.equal(p.bildbelege.length,110);
  assert.ok(JSON.stringify(p).length<45000);
  for(const beleg of p.bildbelege) {
    assert.equal(statSync(join(ordner,beleg.datei)).size,730061);
    assert.equal(beleg.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.ok(!('data' in beleg)&&!('pixel' in beleg));
  }
});
test('PNG-Kopf/Größe werden nach dem Dateischreiben geprüft; fehlende Daten und Dateikollisionen scheitern geschlossen',async()=>{
  const ordner=ausgabe(),clip={x:0,y:0,width:10,height:10,scale:1};
  for(const [name,bytes] of [['kopf.png',Buffer.alloc(50)],['groesse.png',bild(11,13,50)]]) {
    await assert.rejects(()=>bildAufnehmen({ausgabe:ordner,send:async()=>({data:bytes.toString('base64')})},name,clip),Messfehler);
    assert.equal(statSync(join(ordner,name)).size,bytes.length);
  }
  await assert.rejects(()=>bildAufnehmen({ausgabe:ordner,send:async()=>({})},'fehlt.png',clip),Messfehler);
  dateiAblegen(ordner,'bleibt.png',Buffer.from('original'));
  await assert.rejects(()=>bildAufnehmen({ausgabe:ordner,send:async()=>({data:bild(10,10,50).toString('base64')})},'bleibt.png',clip),Messfehler);
  assert.equal(readFileSync(join(ordner,'bleibt.png'),'utf8'),'original');
});
test('Elementbild verwendet den bestätigten Dokumentausschnitt mit Rand statt des ganzen Dokuments',async()=>{
  const ordner=ausgabe(),p={},aufrufe=[];
  const cdp={send:async(m,a)=>{
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:1280,height:7287}};
    if(m==='Runtime.evaluate')return {result:{value:a.expression==='devicePixelRatio'?1:{x:20,y:700,width:100,height:30,outline:3,offset:2}}};
    if(m==='Page.captureScreenshot'){aufrufe.push(a);return {data:bild(a.clip.width,a.clip.height,80).toString('base64')};}
  }};
  const b=bedienung({cdp,ausgabe:ordner,protokoll:p});assert.equal(await b.bild('element.png',{selector:'#ziel'}),'element.png');
  assert.deepEqual(aufrufe[0].clip,{x:0,y:676,width:144,height:78,scale:1});
  assert.equal(p.bildbelege[0].breite,144);
  cdp.send=async(m)=>m==='Page.getLayoutMetrics'?{cssContentSize:{width:1280,height:7287}}:{result:{value:NaN}};
  await assert.rejects(()=>b.bild('fehlposition.png',{selector:'#ziel'}),Messfehler);
});
const schicht={selector:'body',farbe:'rgb(255, 255, 255)',bild:'none',deckkraft:1,filter:'none',mischung:'normal',schatten:'none'};
const text=extra=>({selector:'p',text:true,bedienelement:false,farbe:'rgb(0, 0, 0)',groesse:16,gewicht:400,kette:Array(8).fill(schicht),...extra});
test('55 Hover- und 26 Fokusfälle lagern vollständige Kontrastketten aus; Rohinventar bleibt je Fall einmal messbar',async()=>{
  const ordner=ausgabe(),liste=[],roh=Array.from({length:400},(_,i)=>text({selector:`p-${i}`}));
  for(let i=0;i<81;i++) {
    const fall={name:`zustand-${i}`,status:'bestanden',messungen:{},bild:`bild-${i}.png`};liste.push(fall);
    await kontrastMessen({wert:async()=>roh},{canvas:async()=>({farbe:[255,255,255],bestaetigt:true})},fall,ordner);
    const m=fall.messungen.kontraste;
    assert.equal(m.anzahl,400);assert.ok(!('rohfarben' in fall.messungen));
    const bytes=readFileSync(join(ordner,m.datei.datei));assert.equal(m.datei.bytes,bytes.length);
    assert.equal(m.datei.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(JSON.parse(bytes).rohfarben.length,400);
  }
  assert.ok(JSON.stringify({messungen:liste,ergebnisse:teilfallUebersicht(liste)}).length<50000);
  assert.ok(teilfallUebersicht(liste).every(f=>!('messungen' in f)));
});
for(const [name,roh,fehler] of [['unterschreitung',[text({farbe:'rgb(119, 119, 119)'})],Abweichung],
  ['inventar-fehlt',[],Messfehler]]) {
  test(`Kontrast-Gegenprobe nach Auslagerung: ${name}`,async()=>{
    const fall={name,messungen:{}};
    await assert.rejects(()=>kontrastMessen({wert:async()=>roh},{canvas:async()=>({farbe:[255,255,255]})},fall,ausgabe()),fehler);
    if(roh.length)assert.ok(fall.messungen.kontraste.datei.sha256);
  });
}

test('Native Grafik lässt übrige Kontraste messbar; Grenze ersetzt weder Unterschreitung noch unbekannte Farbe',async()=>{
  const nativ=text({selector:'[name="elektronischeAbgabe"]',text:false,bedienelement:true,nativ:true});
  const fall={name:'native_grafik',messungen:{}};
  await kontrastMessen({wert:async()=>[text(),nativ]},{canvas:async()=>({bestaetigt:true})},fall,ausgabe());
  assert.equal(fall.messungen.kontraste.anzahl,1);assert.equal(fall.grenzen[0].kennung,'native-kontrollgrafik');
  for(const [roh,fehler]of [[[text({farbe:'rgb(119, 119, 119)'}),nativ],Abweichung],[[text({farbe:'lab(30 0 0)'}),nativ],Messfehler]])
    await assert.rejects(()=>kontrastMessen({wert:async()=>roh},{canvas:async()=>({bestaetigt:true})},{name:'gegenprobe',messungen:{}},ausgabe()),fehler);
});

test('Alle tatsächlichen Verfahrensnamen sind gültige Belege; Pfade, Steuerzeichen und Sonderzeichen bleiben verboten',async()=>{
  const kern=await import('@baremos/fristenrechner-kern'),ordner=ausgabe();let anzahl=0;
  for(const ordnung of Object.keys(kern.VERGABEORDNUNGEN))for(const art of kern.verfahrenFuer(ordnung)) {
    dateiAblegen(ordner,`ax-${ordnung}-${art}.json`,Buffer.from('{}'));anzahl++;
    dateiAblegen(ordner,`tastatur-b3-${ordnung}-${art}.png`,Buffer.from('beleg'));
  }
  assert.equal(anzahl,27);
  for(const name of ['../bild.png','..\\bild.png','C:\\bild.png','/bild.png','bild/anderes.png','bild\\anderes.png','bild:strom.png','bild.png\n','bild?.png'])
    assert.throws(()=>dateiAblegen(ordner,name,Buffer.from('probe')),Messfehler);
});

test('Sichtbild verbindet Ausschnitt und Vollbild mit Scrollstand, Dokumentrechteck sowie nativer AX-Identität',async()=>{
  const ordner=ausgabe(),p={},auf=[],rechteck={links:20,oben:100,rechts:120,unten:130,breite:100,hoehe:30};
  let axName='Bekanntmachung',verschoben=false,breite=1265,hoehe=3401,lagen=0,backend=97,neugebaut=false;
  const cdp={send:async(m,a)=>{
    auf.push([m,a]);
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:breite,height:hoehe}};
    if(m==='DOM.getDocument')return {root:{nodeId:1}};
    if(m==='DOM.querySelector')return {nodeId:7};
    if(m==='DOM.describeNode')return {node:{backendNodeId:backend}};
    if(m==='Accessibility.getPartialAXTree')return {nodes:[{nodeId:'97',backendDOMNodeId:97,ignored:false,role:{value:'Date'},name:{value:axName}}]};
    if(m==='Runtime.evaluate') {
      const q=a.expression;
      return {result:{value:q===scrollruheQuelle?{bestaetigt:true}:q==='devicePixelRatio'?1:q.includes('fenster:')?
        {kennung:'7',scrollruhe:{bestaetigt:true},viewportRechteck:{...rechteck,oben:100+(verschoben&&++lagen%2===0?1:0),unten:130+(verschoben&&lagen%2===0?1:0)},rollstand:{x:0,y:600},outline:3,offset:2,dichte:1,fenster:{innerWidth:1280,clientWidth:1265}}:
        q.includes('const r=document.querySelector')?{links:20,oben:verschoben?701:700,breite:100,hoehe:30}:
        {innerWidth:1280,innerHeight:900,clientWidth:breite,clientHeight:900,scrollX:0,scrollY:600}}};
    }
    if(m==='Page.captureScreenshot'){if(neugebaut)backend=98;return {data:bild(Math.round(a.clip.width),Math.round(a.clip.height),80).toString('base64')};}
  }};
  const b=bedienung({cdp,ausgabe:ordner,protokoll:p}),nativ={nodeId:'98',kette:[{nodeId:'98',name:{value:'Datumsauswahl anzeigen'},role:{value:'button'}},{nodeId:'97',backendDOMNodeId:97}]};
  const beleg=await b.sichtbild('grundzustand-fokus-1.png',{selectors:['#datum'],nativerFokus:nativ}),a=beleg.ausschnitte[0];
  assert.equal(a.dokumentRechteck.oben,700);assert.deepEqual(a.rollstand,{x:0,y:600});assert.equal(a.element.name,'Bekanntmachung');
  assert.equal(a.element.nativerFokus.name,'Datumsauswahl anzeigen');assert.equal(a.clip.y,676);assert.equal(a.clip.height,78);
  assert.equal(a.lagepruefung.bestaetigt,true);assert.equal(a.lagepruefung.nachher.dokumentRechteck.oben,700);
  assert.equal(auf.filter(([m])=>m==='Page.captureScreenshot').length,2);assert.ok(a.sha256&&beleg.vollbild.sha256);
  breite=1280;hoehe=3383;await b.sichtbild('grundzustand-fokus-2.png',{selectors:['#datum']});
  assert.deepEqual(p.bildgroessenabweichungen[0].differenz,{breite:15,hoehe:-18});assert.equal(p.bildgroessenabweichungen[0].scrollleistenBreite,0);
  verschoben=true;await assert.rejects(()=>b.sichtbild('verschoben.png',{selectors:['#datum']}),Messfehler);
  assert.equal(p.ausschnittlagen.at(-1).bestaetigt,false);assert.equal(p.ausschnittlagen.at(-1).differenz.oben,1);
  assert.equal(p.ausschnittlagen.at(-1).vorher.rollstand.y,600);assert.equal(p.ausschnittlagen.at(-1).nachher.rollstand.y,600);
  verschoben=false;neugebaut=true;await assert.rejects(()=>b.sichtbild('neugebaut.png',{selectors:['#datum']}),/Elementidentität/);
  assert.deepEqual(p.ausschnittlagen.at(-1).identitaet,{vorher:97,nachher:98});
  neugebaut=false;backend=97;axName='';await assert.rejects(()=>b.sichtbild('ohne-name.png',{selectors:['#datum']}),Messfehler);
  for(const schlecht of [{...a,rollstand:{x:0,y:0}},{...a,clip:{...a.clip,height:4}},{...a,element:{...a.element,name:''}},
    {...a,dokumentRechteck:{...a.dokumentRechteck,rechts:NaN}},{...a,breite:a.breite+3}])assert.throws(()=>bestaetigeSichtausschnitt(schlecht),Messfehler);
  assert.throws(()=>elementClip({...a,outline:3,offset:2,viewportRechteck:{...rechteck,breite:0}},{width:1280,height:3401}),Messfehler);
});

function tastaturAufnahme(fehler) {
  const p={phase:'tastatur'},auf=[],ordner=ausgabe();let scrollY=0,aufgenommen=false,bilder=0;
  const cdp={send:async(m,a)=>{
    auf.push([m,a]);
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:1265,height:3401}};
    if(m==='DOM.getDocument')return {root:{nodeId:1}};
    if(m==='DOM.querySelector')return {nodeId:7};
    if(m==='DOM.describeNode')return {node:{backendNodeId:aufgenommen&&fehler==='identitaet'?98:97}};
    if(m==='Accessibility.getPartialAXTree')return {nodes:[{nodeId:'97',backendDOMNodeId:97,ignored:false,role:{value:'Date'},name:{value:'Bekanntmachung'}}]};
    if(m==='Runtime.evaluate') {
      const q=a.expression;
      if(q==='devicePixelRatio')return {result:{value:1}};
      if(q.includes('scrollIntoView')){scrollY=600;return {result:{value:null}};}
      return {result:{value:{kennung:'7',fokussiert:!(aufgenommen&&fehler==='fokus'),scrollruhe:{bestaetigt:true},
        viewportRechteck:{links:50,oben:100,rechts:427.65625+(aufgenommen&&fehler==='lage'?5:0),unten:153,
          breite:377.65625+(aufgenommen&&fehler==='lage'?5:0),hoehe:53},
        rollstand:{x:0,y:scrollY},outline:3,offset:0,dichte:1,
        fenster:{innerWidth:1280,innerHeight:900,clientWidth:aufgenommen&&fehler==='viewport'||bilder>=2&&fehler==='uebersicht'?1280:1265,clientHeight:900}}}};
    }
    if(m==='Page.captureScreenshot') {
      aufgenommen=true;bilder++;
      const bytes=fehler==='png'?Buffer.alloc(80):bild(Math.round(a.clip.width),Math.round(a.clip.height),80);
      return {data:bytes.toString('base64')};
    }
  }};
  return {p,auf,ordner,b:bedienung({cdp,ausgabe:ordner,protokoll:p})};
}
const nativ={nodeId:'98',kette:[{nodeId:'98',name:{value:'Tag'},role:{value:'spinbutton'}},{nodeId:'97',backendDOMNodeId:97}]};
test('18 native Tastaturbelege rollen zuerst; Ausschnitt und Übersicht bleiben im Viewport und behalten Hash, AX und Rechtecke',async()=>{
  const {p,b,auf}=tastaturAufnahme();
  for(let i=1;i<=18;i++) {
    const nachweis={},beleg=await b.sichtbild(`tastatur-fokus-${i}.png`,{selectors:['#datum'],nativerFokus:nativ,nachweis});
    assert.equal(beleg,nachweis);const a=beleg.ausschnitte[0];
    assert.equal(a.lagepruefung.vorher.dokumentRechteck.oben,700);assert.equal(a.lagepruefung.nachher.dokumentRechteck.oben,700);
    assert.equal(a.lagepruefung.bestaetigt,true);assert.equal(a.element.nativerFokus.name,'Tag');
    assert.equal(nachweis.uebersichtlagen[0].bestaetigt,true);
    assert.equal(a.captureBeyondViewport,false);assert.equal(beleg.vollbild.captureBeyondViewport,false);
    assert.equal(beleg.vollbild.aufnahmeart,'Sichtbarer Viewport');assert.ok(a.sha256&&beleg.vollbild.sha256);
    assert.equal(a.clip.y,676);assert.equal(a.lagepruefung.nachher.fenster.clientWidth,1265);
  }
  const bilder=auf.filter(([m])=>m==='Page.captureScreenshot');assert.equal(bilder.length,36);
  assert.ok(bilder.every(([,a])=>a.captureBeyondViewport===false&&a.clip.y>=600&&a.clip.y+a.clip.height<=1500&&a.clip.x+a.clip.width<=1265));
  assert.ok(!auf.some(([m])=>m.startsWith('Emulation.')));assert.equal(p.ausschnittlagen.length,18);
  await b.bild('tastatur-fehler.png');assert.equal(auf.at(-1)[1].captureBeyondViewport,false);
});
for(const [art,meldung]of [['lage','Elementlage'],['viewport','Viewport'],['fokus','DOM-Fokus'],['png','kein PNG'],['identitaet','Elementidentität']]) {
  test(`Tastatur-Aufnahmefehler ${art} behält beide Rechtecke direkt am Fokusnachweis und bleibt ungültig`,async()=>{
    const {p,b}=tastaturAufnahme(art),nachweis={};
    await assert.rejects(()=>b.sichtbild(`tastatur-${art}.png`,{selectors:['#datum'],nativerFokus:nativ,nachweis}),new RegExp(meldung));
    const lage=nachweis.lagen[0];assert.equal(lage,p.ausschnittlagen[0]);assert.equal(lage.vorher.rollstand.y,600);assert.equal(lage.nachher.rollstand.y,600);
    assert.ok(lage.vorher.viewportRechteck&&lage.nachher.viewportRechteck);
    if(art==='lage')assert.equal(lage.differenz.breite,5);
    if(art==='png')assert.match(lage.fehler,/kein PNG/);
  });
}
test('Auch eine Geometrieänderung erst beim Übersichtsbild bleibt ungültig und behält beide Lageproben',async()=>{
  const {b}=tastaturAufnahme('uebersicht'),nachweis={};
  await assert.rejects(()=>b.sichtbild('tastatur-uebersicht.png',{selectors:['#datum'],nativerFokus:nativ,nachweis}),/Viewport/);
  const l=nachweis.uebersichtlagen[0];assert.equal(l.vorher.fenster.clientWidth,1265);assert.equal(l.nachher.fenster.clientWidth,1280);assert.equal(l.bestaetigt,false);
});
test('Viewport-Clips werden an allen Rändern begrenzt; fehlender Fokusrahmen und unbekannte Maße scheitern geschlossen',()=>{
  const lage={viewportRechteck:{links:10,oben:10,rechts:110,unten:40,breite:100,hoehe:30},rollstand:{x:0,y:600},outline:3,offset:0,
    fenster:{clientWidth:1265,clientHeight:900}},groesse={width:1265,height:3401};
  assert.deepEqual(elementClip(lage,groesse,24,true).clip,{x:0,y:600,width:134,height:64,scale:1});
  assert.deepEqual(sichtbereichClip(lage,groesse),{x:0,y:600,width:1265,height:900,scale:1});
  assert.throws(()=>elementClip({...lage,outline:11},groesse,24,true),/Fokusrahmen/);
  assert.throws(()=>sichtbereichClip({...lage,fenster:undefined},groesse),Messfehler);
  const a={element:{kennung:'7',selector:'#datum',name:'Datum',rolle:'Date',axNodeId:'97',backendNodeId:97},
    ...elementClip(lage,groesse),fenster:lage.fenster,dokumentgroesse:groesse,captureBeyondViewport:false,sha256:'a'.repeat(64),dichte:1,breite:134,hoehe:78};
  assert.throws(()=>bestaetigeSichtausschnitt(a),/außerhalb des bestätigten Viewports/);
});

test('Frische Tastaturseite hat keine Vollbildvorbereitung; Darstellung behält ihre bestätigte Aufnahmevorbereitung',async()=>{
  for(const phase of ['tastatur','darstellung']) {
    const p={phase},auf=[],ordner=ausgabe(),cdp={send:async(m,a)=>{
      auf.push([m,a]);
      if(m==='Page.addScriptToEvaluateOnNewDocument')return {identifier:'probe'};
      if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:1265,height:3401}};
      if(m==='Page.captureScreenshot')return {data:bild(a.clip.width,a.clip.height,80).toString('base64')};
      if(m==='Runtime.evaluate')return {result:{value:a.expression.includes('scrollruhe:')?
        {scrollruhe:{bestaetigt:true},innerWidth:1280,innerHeight:900,clientWidth:1265,clientHeight:900,scrollX:0,scrollY:0,devicePixelRatio:1}:
        a.expression==='location.href'?'about:blank':a.expression==='document.hasFocus()'?true:'bereit'}};
      return {};
    }};
    await bedienung({cdp,basisUrl:'http://127.0.0.1:1/',navigieren:async()=>{},ausgabe:ordner,protokoll:p}).frisch();
    assert.equal(auf.filter(([m])=>m==='Page.captureScreenshot').length,phase==='tastatur'?0:1);
    assert.equal(p.aufnahmevorbereitung?.[0]?.bestaetigt,phase==='tastatur'?undefined:true);
  }
});
