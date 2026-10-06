import assert from 'node:assert/strict';
import test from 'node:test';
import { tastaturSichtbeleg } from './tastatur.mjs';
import { nativerFokus } from './tastatur-regeln.mjs';
import { Messfehler } from './fehler.mjs';
import { teilfall } from './bedienung.mjs';

const baum=(nodeId='98',backendNodeId=97,fokus=true)=>[
  {nodeId:'97',backendDOMNodeId:backendNodeId,ignored:false,name:{value:'Bekanntmachung'},role:{value:'Date'}},
  {nodeId,parentId:'97',ignored:false,name:{value:'Tag'},role:{value:'spinbutton'},properties:[{name:'focused',value:{value:fokus}}]},
];
const aufnahme=(nachweis,extra={})=>({sichtbild:async(name,optionen)=>{
  assert.equal(optionen.nachweis,nachweis);assert.equal(optionen.imViewport,true);assert.equal(optionen.fokuspflicht,true);assert.deepEqual(optionen.selectors,['#datum']);
  Object.assign(nachweis,{ausschnitte:[{element:{backendNodeId:97}}],...extra});return nachweis;
}});
test('Tastatur-Sichtbeleg erhält denselben nativen Teilfeldfokus nach Ausschnitt und Übersicht',async()=>{
  const nachweis={},vorher=nativerFokus(baum(),97);
  assert.equal(await tastaturSichtbeleg(aufnahme(nachweis),async()=>baum(),'fokus.png','#datum',vorher,nachweis),nachweis);
  assert.equal(nachweis.nativerFokusNachher.nodeId,'98');
});
test('Andere native Kontrollen behalten die DOM-Fokuspflicht ohne erfundenes Datumsteilfeld',async()=>{
  const nachweis={};await tastaturSichtbeleg(aufnahme(nachweis),async()=>{assert.fail('Kein Datumsteilfeld erwartet.');},'fokus.png','#datum',null,nachweis);
  assert.equal(nachweis.nativerFokusNachher,undefined);
});
for(const [name,nodes,meldung]of [['anderes-teilfeld',baum('99'),'Teilfeldfokus'],['anderes-element',baum('98',96),'nicht dem aktiven'],['fokus-verloren',baum('98',97,false),'eindeutig benannten Fokus']]) {
  test(`Native Fokus-Gegenprobe nach dem Sichtbeleg: ${name}`,async()=>{
    const nachweis={};await assert.rejects(()=>tastaturSichtbeleg(aufnahme(nachweis),async()=>nodes,'fokus.png','#datum',nativerFokus(baum(),97),nachweis),new RegExp(meldung));
    assert.ok(nachweis.ausschnitte);
  });
}
test('Fehlgeschlagener Tastaturbeleg bewahrt die beiden Rechtecke direkt im Teilfall und bleibt Messfehler',async()=>{
  const liste=[];
  await teilfall(liste,'grundzustand',async fall=>{
    const roh={};fall.messungen.rundgang={roh:[roh]};roh.sichtbeleg={};
    const b={sichtbild:async(name,{nachweis})=>{
      nachweis.lagen=[{vorher:{viewportRechteck:{breite:377.65625}},nachher:{viewportRechteck:{breite:382.65625}}}];
      throw new Messfehler('Elementlage hat sich während des Ausschnitts geändert.');
    }};
    await tastaturSichtbeleg(b,async()=>baum(),'fokus.png','#datum',nativerFokus(baum(),97),roh.sichtbeleg);
  });
  const f=JSON.parse(JSON.stringify(liste[0]));assert.equal(f.status,'ungültig');
  const lage=f.messungen.rundgang.roh[0].sichtbeleg.lagen[0];assert.equal(lage.vorher.viewportRechteck.breite,377.65625);assert.equal(lage.nachher.viewportRechteck.breite,382.65625);
});
