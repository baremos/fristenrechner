import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync,mkdtempSync,rmSync,writeFileSync,readFileSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { bestaetigeElementlage } from './belege.mjs';
import { bedienung,teilfall,teilfaelleEntscheiden,teilfallUebersicht } from './bedienung.mjs';
import { pseudoZustand } from './dom-knoten.mjs';
import { ERGEBNISKATALOG,ERGEBNISRANG,MESSGRENZEN,grenzenBestaetigt } from './ergebniskatalog.mjs';
import { auswerten,gesamtAuswerten,statusFuerCode } from './auswertung.mjs';
import { grenzenNeuEinordnen,main } from '../browser-lauf-auswertung.mjs';
import { Messfehler } from './fehler.mjs';
import { pruefeReflow } from './emulation.mjs';

const basis=resolve('scratchpad/test-entscheidungen');mkdirSync(basis,{recursive:true});
const ordner=mkdtempSync(join(basis,'lauf-'));
test.after(()=>{assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});});
const lage=(dy=0,scroll=600)=>({viewportRechteck:{links:20,oben:100+dy,rechts:120,unten:130+dy,breite:100,hoehe:30},
  rollstand:{x:0,y:scroll},scrollruhe:{bestaetigt:true},outline:3,offset:2,dokumentgroesse:{width:1280,height:3401}});
test('Rechtecke werden nach Scrollruhe in Dokument-CSS-Pixeln verglichen; Subpixel bleiben als Messwerte erhalten',()=>{
  const m={vorher:lage(),nachher:lage(0.453125)};
  bestaetigeElementlage(m);assert.equal(m.differenz.oben,0.453125);assert.equal(m.vorher.dokumentRechteck.oben,700);
  assert.equal(m.nachher.dokumentRechteck.oben,700.453125);assert.equal(m.toleranzExklusiv,1);
});
for(const [name,aendern] of [
  ['ganzer Pixel',m=>m.nachher=lage(1)],['größere Verschiebung',m=>m.nachher=lage(5)],
  ['fehlende Ruhe',m=>m.nachher.scrollruhe.bestaetigt=false],['fehlendes Rechteck',m=>m.nachher=null],
  ['Scrollbewegung trotz gleicher Dokumentlage',m=>m.nachher=lage(-10,610)],
  ['Scrollleistenbedingte Breitenänderung',m=>{m.nachher.viewportRechteck.rechts+=5;m.nachher.viewportRechteck.breite+=5;}],
])test(`Lage-Gegenprobe bleibt ungültig: ${name}`,()=>{
  const m={vorher:lage(),nachher:lage()};aendern(m);assert.throws(()=>bestaetigeElementlage(m),Messfehler);assert.ok(m.vorher);
});
test('Ein bestätigter Rollstand mit Subpixelrundung wird nicht als Viewportverschiebung verglichen',()=>{
  const m={vorher:lage(),nachher:lage(-0.5,600.5)};bestaetigeElementlage(m);assert.equal(m.differenz.oben,0);
});

test('Screenshot-Vorbereitung protokolliert 15 Pixel Scrollleistenwechsel vor der Produktmessung, danach stabile Aufnahme',async()=>{
  let clientWidth=1265;const p={},auf=[];
  const b=bedienung({protokoll:p,ausgabe:ordner,cdp:{send:async(m,a)=>{
    auf.push(m);
    if(m==='Runtime.evaluate')return {result:{value:{scrollruhe:{bestaetigt:true},innerWidth:1280,innerHeight:900,clientWidth,clientHeight:900,scrollX:0,scrollY:0,devicePixelRatio:1}}};
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width:clientWidth,height:3401}};
    if(m==='Page.captureScreenshot'){
      const bytes=Buffer.alloc(50);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(a.clip.width,16);bytes.writeUInt32BE(a.clip.height,20);
      clientWidth=1280;return {data:bytes.toString('base64')};
    }
  }}});
  await b.bildkanalVorbereiten();const n=p.aufnahmevorbereitung[0];
  assert.equal(n.bestaetigt,true);assert.equal(n.proben.length,2);assert.equal(n.proben[0].vorher.clientWidth,1265);assert.equal(n.proben[0].nachher.clientWidth,1280);
  assert.equal(auf.filter(x=>x==='Page.captureScreenshot').length,2);
});
test('Weiter wechselnde Screenshot-Geometrie wird nicht durch Vorbereitung freigegeben',async()=>{
  let width=1265;const p={};
  const b=bedienung({protokoll:p,ausgabe:ordner,cdp:{send:async(m,a)=>{
    if(m==='Runtime.evaluate')return {result:{value:{scrollruhe:{bestaetigt:true},innerWidth:1280,innerHeight:900,clientWidth:width,clientHeight:900,scrollX:0,scrollY:0,devicePixelRatio:1}}};
    if(m==='Page.getLayoutMetrics')return {cssContentSize:{width,height:3401}};
    if(m==='Page.captureScreenshot'){const bytes=Buffer.alloc(50);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(a.clip.width,16);bytes.writeUInt32BE(a.clip.height,20);width=width===1265?1280:1265;return {data:bytes.toString('base64')};}
  }}});
  await assert.rejects(()=>b.bildkanalVorbereiten(),Messfehler);assert.equal(p.aufnahmevorbereitung[0].bestaetigt,false);
});

for(const neuaufbau of [false,true])test(`Pseudo-Reset löst Selector nach DOM-Inventarwechsel${neuaufbau?' und neu aufgebautem DOM':''} erneut auf`,async()=>{
  let generation=0,node=0,dom=1;const auf=[],nachweise=[];
  const b={send:async(m,a)=>{
    auf.push([m,a]);
    if(m==='DOM.getDocument'){generation++;return {root:{nodeId:generation*100}};}
    if(m==='DOM.querySelector'){assert.equal(a.nodeId,generation*100);node=generation*100+dom;return {nodeId:node};}
    if(m==='CSS.forcePseudoState'){if(a.nodeId!==node)throw new Error('CDP -32000: Could not find node with given id');return {};}
  }};
  await pseudoZustand(b,'#ziel',['focus','focus-visible'],nachweise);
  const veraltet=node;await b.send('Page.captureScreenshot');
  await b.send('CSS.forcePseudoState',{nodeId:veraltet,forcedPseudoClasses:['focus']});
  await b.send('DOM.getDocument');node=0;if(neuaufbau)dom++;
  await assert.rejects(()=>b.send('CSS.forcePseudoState',{nodeId:veraltet,forcedPseudoClasses:[]}),/Could not find node/);
  await pseudoZustand(b,'#ziel',[],nachweise);
  assert.notEqual(nachweise[0].nodeId,nachweise[1].nodeId);assert.ok(nachweise.every(n=>n.bestaetigt));
  assert.equal(auf.at(-2)[0],'DOM.querySelector');assert.equal(auf.at(-1)[0],'CSS.forcePseudoState');
});
test('Fehlender Selector und echte CDP-Fehler bleiben ungültig',async()=>{
  await assert.rejects(()=>pseudoZustand({send:async m=>m==='DOM.getDocument'?{root:{nodeId:1}}:{nodeId:0}},'#weg',[]),Messfehler);
  const liste=[];await teilfall(liste,'fokus',()=>pseudoZustand({send:async m=>{if(m==='DOM.getDocument')return {root:{nodeId:1}};if(m==='DOM.querySelector')return {nodeId:9};throw new Error('CDP -32000');}},'#ziel',[]));
  assert.equal(liste[0].status,'ungültig');
});

const reflow=faktor=>pruefeReflow({dom:{innerWidth:1280/faktor,clientWidth:1280/faktor,devicePixelRatio:1,schrift:16,visuelleSkala:1},
  layout:{clientWidth:1280/faktor},visuell:{scale:1}},faktor);
function zoomFaelle(){return [2,4].flatMap(faktor=>[
  {name:`reflow-${faktor*100}`,status:'bestanden',bild:`reflow-${faktor*100}.png`,messungen:{reflow:reflow(faktor)}},
  {name:`zoom-${faktor*100}`,status:'dokumentierte Grenze',grenzen:[{kennung:'browserzoom',...MESSGRENZEN.browserzoom}]},
]);}
function phaseMitGrenze(id='B7',status='dokumentierte Grenze') {
  const faelle=id==='B7'?teilfallUebersicht(zoomFaelle()):[{name:'normal',status:'dokumentierte Grenze',sichtbilder:['native.png'],grenzen:[{kennung:'native-kontrollgrafik',...MESSGRENZEN['native-kontrollgrafik'],selector:'#checkbox'}]}];
  const bilder=(id==='B7'?['reflow-200.png','reflow-400.png']:['native.png']).map(bild=>({id,bild,kriterium:'Sichtprüfung',sha256:'a'.repeat(64)}));
  return {phase:'darstellung',ergebnisse:ERGEBNISKATALOG.darstellung.map(k=>k===id?{id,status,details:{teilfaelle:faelle},sichtvermerke:bilder.map(b=>({...b,ergebnis:'bestanden',wer:'Prüfperson',wann:'2026-10-06',bemerkung:'Gelesen.'}))}:{id:k,status:'bestanden'}),sichtpruefung:{bilder}};
}
for(const id of ['B7','B9'])test(`${id}: dokumentierte Grenze Code 3, ausstehende Sichtung Code 4, Produktbefund Code 1, Messfehler Code 2`,()=>{
  const p=phaseMitGrenze(id),r=p.ergebnisse.find(r=>r.id===id);assert.equal(auswerten(p).code,3);
  r.status='Sichtprüfung ausstehend';assert.equal(auswerten(p).code,4);
  p.ergebnisse.at(-1).status='nicht bestanden';assert.equal(auswerten(p).code,1);
  p.ergebnisse.at(-2).status='ungültig';assert.equal(auswerten(p).code,2);
});
for(const [name,aendern] of [
  ['fehlender Grund',f=>delete f[1].grenzen[0].grund],['fehlender Ersatz',f=>delete f[1].grenzen[0].ersatz],
  ['unbekannte Grenze',f=>f[1].grenzen[0].kennung='unbekannt'],['falsche Prüfkennung',f=>f[1].grenzen[0]={kennung:'netzzuordnung',...MESSGRENZEN.netzzuordnung}],
  ['veränderte Katalogkennung',f=>f[1].grenzen[0].id='B10'],['veränderte Katalogfolge',f=>f[1].grenzen[0].folge='bestanden'],
  ['fehlende 640-Messung',f=>f.splice(0,1)],['unbestätigte Ersatzmessung',f=>f[0].messungen.reflow.bestaetigt=false],
  ['falsche Ersatzbreite',f=>f[0].messungen.reflow.dom.innerWidth=320],['negative Ersatzmessung',f=>f[0].status='nicht bestanden'],
])test(`Grenzen-Gegenprobe: ${name}`,()=>{const f=zoomFaelle();aendern(f);assert.equal(grenzenBestaetigt('B7',f),false);assert.throws(()=>teilfaelleEntscheiden(f,'B7'),Messfehler);});
test('Native Grenze ohne Bild und Grenze ohne Sichtvermerk bleiben ungültig',()=>{
  const p=phaseMitGrenze('B9'),r=p.ergebnisse.find(r=>r.id==='B9');r.sichtvermerke=[];assert.equal(auswerten(p).code,2);
  r.status='Sichtprüfung ausstehend';r.details.teilfaelle[0].sichtbilder=[];assert.equal(auswerten(p).code,2);
});
test('Fehlerhafte Grenzenstrukturen ergeben Messfehler statt Produktabweichung oder Ausnahme aus der Auswertung',()=>{
  for(const falsch of [null,{},'Grenze',[null],[{status:'dokumentierte Grenze',grenzen:{length:1}}],[{status:'dokumentierte Grenze',grenzen:[null]}]]) {
    const p=phaseMitGrenze(),r=p.ergebnisse.find(r=>r.id==='B7');r.details.teilfaelle=falsch;
    assert.equal(auswerten(p).code,2);assert.throws(()=>teilfaelleEntscheiden(falsch,'B7'),Messfehler);
  }
});
test('Gesamtkatalog hält die Rangfolge für jede Kombination der fünf Rückgabewerte ein',()=>{
  assert.deepEqual(ERGEBNISRANG,[2,1,4,3,0]);assert.equal(statusFuerCode(3),'dokumentierte Grenze');
  for(const a of ERGEBNISRANG)for(const b of ERGEBNISRANG){const r=gesamtAuswerten({optionen:{browser:'beide',phasen:['darstellung']},laeufe:[{browser:'edge',phase:'darstellung',code:a},{browser:'chrome',phase:'darstellung',code:b}]});
    assert.equal(r.code,ERGEBNISRANG.find(c=>c===a||c===b));}
});
test('Alte Zoomentscheidung wird nur mit vollständiger unabhängiger Ersatzmessung umgestuft',()=>{
  const p=phaseMitGrenze();p.messungen=[{id:'B7',teilfaelle:zoomFaelle()}];
  for(const f of p.messungen[0].teilfaelle.filter(f=>f.name.startsWith('zoom'))){f.status='ungültig';f.meldung=MESSGRENZEN.browserzoom.grund;f.messungen={zurueckgesetzt:{bestaetigt:true}};}
  assert.equal(grenzenNeuEinordnen(p).messungen[0].teilfaelle[1].status,'dokumentierte Grenze');
  p.messungen[0].teilfaelle[0].messungen.reflow.bestaetigt=false;assert.equal(grenzenNeuEinordnen(p).messungen[0].teilfaelle[1].status,'ungültig');
  p.messungen[0].teilfaelle[3].meldung='Elementlage hat sich während des Ausschnitts geändert.';assert.equal(grenzenNeuEinordnen(p).messungen[0].teilfaelle[3].status,'ungültig');
});
test('Nachauswertung erhält Code 3 und Rohdateien; fehlende Bilder, fehlerhafte Phase und früherer Rahmenfehler haben Vorrang',async()=>{
  const lauf=join(ordner,'auswertung'),phasenordner=join(lauf,'edge-darstellung');mkdirSync(phasenordner,{recursive:true});
  const p=phaseMitGrenze('B7','Sichtprüfung ausstehend');
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]),sha256=createHash('sha256').update(bytes).digest('hex');
  for(const b of p.sichtpruefung.bilder){b.sha256=sha256;writeFileSync(join(phasenordner,b.bild),bytes);}
  const vermerke=p.sichtpruefung.bilder.map(b=>({...b,ergebnis:'bestanden',wer:'Prüfperson',wann:'2026-10-06',bemerkung:'Gelesen.'}));
  writeFileSync(join(phasenordner,'sichtpruefung.json'),JSON.stringify({schema:1,pruefungen:vermerke}));
  const gespeichert=JSON.stringify(p);writeFileSync(join(phasenordner,'protokoll.json'),gespeichert);
  let bericht={optionen:{browser:'edge',phasen:['darstellung']},laeufe:[{browser:'edge',phase:'darstellung',code:3,protokoll:'edge-darstellung/protokoll.json'}]};
  writeFileSync(join(lauf,'protokoll.json'),JSON.stringify(bericht));
  assert.equal(await main(['--lauf',lauf]),3);
  assert.equal(readFileSync(join(phasenordner,'protokoll.json'),'utf8'),gespeichert);
  const bestanden=readFileSync(join(lauf,'auswertung.json'),'utf8');assert.equal(JSON.parse(bestanden).code,3);
  vermerke[0]={...vermerke[0],ergebnis:'Sichtprüfung ausstehend',wer:'',wann:'',bemerkung:''};
  writeFileSync(join(phasenordner,'sichtpruefung.json'),JSON.stringify({schema:1,pruefungen:vermerke}));assert.equal(await main(['--lauf',lauf]),4);
  vermerke[0]={...vermerke[1],bild:vermerke[0].bild,ergebnis:'nicht bestanden'};
  writeFileSync(join(phasenordner,'sichtpruefung.json'),JSON.stringify({schema:1,pruefungen:vermerke}));assert.equal(await main(['--lauf',lauf]),1);
  rmSync(join(phasenordner,'reflow-200.png'));assert.equal(await main(['--lauf',lauf]),2);
  bericht.fehler='Früherer Rahmenfehler';writeFileSync(join(lauf,'protokoll.json'),JSON.stringify(bericht));assert.equal(await main(['--lauf',lauf]),2);
  bericht.laeufe[0].protokoll='../fremd.json';writeFileSync(join(lauf,'protokoll.json'),JSON.stringify(bericht));assert.equal(await main(['--lauf',lauf]),2);
});
