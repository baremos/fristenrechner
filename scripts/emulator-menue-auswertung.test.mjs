// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluiereMenueBaum, evaluiereMenueFall } from './emulator/menue-auswertung.mjs';
import { MENUE_NAMEN } from './emulator/menue-ui.mjs';
import { APP } from './emulator/rahmen.mjs';

const fixture = JSON.parse(readFileSync(new URL('./emulator/fixtures/menue-schema1.json',import.meta.url),'utf8'));
const eigenschaft = (name,value) => ({name,value:{value}});
const axKnoten = (nodeId,role,weitere = {}) => ({nodeId,ignored:false,role:{value:role},...weitere});
function baum() {
  const namen = ['Schließen',...MENUE_NAMEN];
  const xml = '<hierarchy>' + ['Dateiaktionen',...namen].map(text =>
    `<node package="${APP}" enabled="true" text="${text}" class="android.widget.Button" clickable="true" />`).join('') + '</hierarchy>';
  return {xml:[xml,xml],ax:{nodes:[
    axKnoten('root','RootWebArea',{childIds:['dialog']}),
    axKnoten('dialog','dialog',{parentId:'root',name:{value:'Dateiaktionen'},childIds:namen.map((_,i)=>'aktion-'+i)}),
    ...namen.map((name,i)=>axKnoten('aktion-'+i,'button',{parentId:'dialog',name:{value:name}})),
  ]}};
}

for (const beziehung of ['parentId','childIds','gemischt']) test('AX: hidden schließt Nachfahren über '+beziehung+' aus',()=>{
  const t = baum();
  const container = axKnoten('verborgen','generic',{parentId:'root',properties:[eigenschaft('hidden',true)]});
  const zwischen = axKnoten('zwischen','generic');
  const feld = axKnoten('feld','textbox',{name:{value:'Projektname'}});
  if (beziehung === 'parentId') { zwischen.parentId = container.nodeId; feld.parentId = zwischen.nodeId; }
  else if (beziehung === 'childIds') { container.childIds = [zwischen.nodeId]; zwischen.childIds = [feld.nodeId]; }
  else { container.childIds = [zwischen.nodeId]; feld.parentId = zwischen.nodeId; }
  // Umgekehrte Reihenfolge verlangt eine vollständige, reihenfolgeunabhängige Suche.
  t.ax.nodes.push(feld,zwischen,container);
  assert.equal(evaluiereMenueBaum(t).status,'bestanden');
  container.properties[0].value.value = false;
  assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');
});

test('AX: verborgenes oder ignoriertes Feld zählt nicht als bedienbarer Hintergrund',()=>{
  for (const ausschluss of [{properties:[eigenschaft('hidden',true)]},{ignored:true}]) {
    const t = baum();
    t.ax.nodes.push(axKnoten('feld','textbox',{parentId:'root',...ausschluss}));
    assert.equal(evaluiereMenueBaum(t).status,'bestanden');
    t.ax.nodes.push(axKnoten('sichtbar','button',{parentId:'root',properties:[eigenschaft('hidden',false)]}));
    assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');
  }
});

test('AX: ignorierter Layoutcontainer verbirgt sichtbare Kinder nicht',()=>{
  const t = baum();
  t.ax.nodes.push(axKnoten('container','generic',{ignored:true,parentId:'root',childIds:['feld']}));
  t.ax.nodes.push(axKnoten('feld','textbox',{parentId:'container'}));
  assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');
  t.ax.nodes.pop();
  t.ax.nodes.find(n=>n.nodeId==='dialog').parentId = 'container';
  t.ax.nodes.find(n=>n.nodeId==='container').childIds = ['dialog'];
  assert.equal(evaluiereMenueBaum(t).status,'bestanden');
});

test('AX: verborgenes X oder verborgener Dialog können nicht bestehen',()=>{
  for (const id of ['aktion-0','dialog']) {
    const t = baum();
    t.ax.nodes.find(n=>n.nodeId===id).properties = [eigenschaft('hidden',true)];
    assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');
  }
});

test('AX: ein sichtbarer bedienbarer Hintergrund bleibt trotz verborgenem Nachbarn ein Fehler',()=>{
  const t = baum();
  t.ax.nodes.push(axKnoten('verborgen','button',{parentId:'root',properties:[eigenschaft('hidden',true)]}));
  t.ax.nodes.push(axKnoten('sichtbar','generic',{parentId:'root',properties:[eigenschaft('focusable',true)]}));
  assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');
});

test('AX: verschachtelte childIds unterhalb des Dialogs werden erkannt',()=>{
  const t = baum(), dialog = t.ax.nodes.find(n=>n.nodeId==='dialog');
  const kinder = dialog.childIds;
  dialog.childIds = ['liste'];
  for (const n of t.ax.nodes.filter(n=>n.nodeId.startsWith('aktion-'))) delete n.parentId;
  t.ax.nodes.push(axKnoten('liste','generic',{ignored:true,childIds:kinder}));
  assert.equal(evaluiereMenueBaum(t).status,'bestanden');
});

const rechteck = (x,y,width,height) => ({x,y,width,height,right:x+width,bottom:y+height});
function querformat(kompakt = false) {
  const messung = {...structuredClone(fixture.messung),kompakt,viewport:{width:867,height:388},dokumentBreite:867,
    leiste:rechteck(0,0,867,56),sheet:rechteck(113,65,640,323),kopf:rechteck(114,66,638,69),
    x:rechteck(688,82,48,48),erste:rechteck(122,-228,622,63),letzte:rechteck(122,316,622,63)};
  const stand = messung => ({messung,speicher:fixture.projekt,activity:fixture.activity});
  return {schema:1,fall:'M-6',name:'querformat',messung:{vorher:fixture.projekt,schrift:2,nach:stand(messung),
    xNachRollen:true,rueckkehr:stand({...structuredClone(messung),hidden:true,fokusAmKnopf:true}),dialog:'Alle Eingaben'}};
}

for (const kompakt of [false,true]) test('Querformat: getipptes X und vollständige letzte Aktion reichen, kompakt='+kompakt,()=>{
  assert.equal(evaluiereMenueFall(querformat(kompakt)).status,'bestanden');
});

test('Querformat: kompaktes Sheet darf X erst nach Zurückrollen wieder erreichen',()=>{
  const fall = querformat(true);
  fall.messung.nach.messung.x = rechteck(688,-420,48,48);
  fall.messung.nach.messung.kopf = rechteck(114,-436,638,69);
  assert.equal(evaluiereMenueFall(fall).status,'bestanden');
  fall.messung.xNachRollen = false;
  assert.equal(evaluiereMenueFall(fall).status,'nicht bestanden');
  fall.messung.xNachRollen = true;
  fall.messung.rueckkehr.messung.hidden = false;
  assert.equal(evaluiereMenueFall(fall).status,'nicht bestanden');
});

for (const [name,aendern] of [
  ['Überlauf',m=>{m.nach.messung.abgeschnitten=[{element:'button'}];}],
  ['zu breites Dokument',m=>{m.nach.messung.dokumentBreite=900;}],
  ['Aktion abgeschnitten',m=>{m.nach.messung.letzte=rechteck(122,360,622,63);}],
  ['Aktion hinter Kopf',m=>{m.nach.messung.letzte=rechteck(122,66,622,63);}],
  ['Aktion zu breit',m=>{m.nach.messung.letzte=rechteck(122,316,750,63);}],
  ['Aktion ohne Fläche',m=>{m.nach.messung.letzte=rechteck(122,316,0,0);}],
  ['X nicht getippt',m=>{m.xNachRollen=false;}],
  ['Aktionsdialog fehlt',m=>{m.dialog='';}],
]) test('Querformat: '+name+' bleibt nicht bestanden',()=>{
  const fall = querformat(); aendern(fall.messung);
  assert.equal(evaluiereMenueFall(fall).status,'nicht bestanden');
});
