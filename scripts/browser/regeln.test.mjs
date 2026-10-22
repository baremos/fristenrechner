import assert from 'node:assert/strict';
import test from 'node:test';
import { Abweichung, farbe, schichten, kontrast, farbpaar, textSchwelle, pruefeLayout, pruefeReihenfolge, pruefeEmulation } from './regeln.mjs';
import { Messfehler } from './fehler.mjs';
import { pruefeKontraste, pruefeTextzuordnung, pruefeBewegung, LANGER_PROJEKTNAME, darstellungsSitzung, browserzoomGrenze, reflowSichtziele } from './darstellung.mjs';
import { pruefeAx, pruefeFokus, pruefeLive, pruefeFehlermeldung, nativerFokus, bestaetigeAxBaum, pruefeFehlerStatus, importReaktion, pruefeImportFehler, bestaetigeLeseprobe } from './tastatur-regeln.mjs';
import { fehlerquelle, lesefehlerQuelle } from './tastatur.mjs';
import { teilfall, teilfaelleEntscheiden, bedienung } from './bedienung.mjs';
import { auswerten, argumente, gesamtAuswerten } from './auswertung.mjs';
import { ERGEBNISKATALOG } from './ergebniskatalog.mjs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as quellen from './messquellen.mjs';
import { inventarQuelle, sichtbarQuelle } from './bedienung.mjs';

const weiss=farbe('rgb(255, 255, 255)'),schwarz=farbe('rgb(0, 0, 0)');
test('Dokumentierte Headless-Zoomgrenze wird weder durch Antwortobjekte noch durch bestandenen Reflow zum Zoom-Erfolg',async()=>{
  for(const faktor of [2,4]) {
    const liste=[];await teilfall(liste,`zoom-${faktor*100}`,fall=>{fall.messungen.reflow={bestaetigt:true};fall.messungen.antwort={};browserzoomGrenze(fall,faktor);});
    assert.equal(liste[0].status,'dokumentierte Grenze');assert.equal(liste[0].grenzen[0].kennung,'browserzoom');assert.equal(liste[0].messungen.zoom.bestaetigt,false);
    assert.throws(()=>teilfaelleEntscheiden(liste,'B7'),Messfehler,'Ohne unabhängige Ersatzmessung bleibt die Gruppe ungültig.');
  }
  assert.throws(()=>browserzoomGrenze({messungen:{}},3),Messfehler);
});
test('Reflow-Sichtung erfasst auch Text-/Zahlenfelder und sämtliche Aktionen; versteckte/gesperrte Elemente erzeugen keine Scheinbelege',()=>{
  const eintrag=(typ,extra={})=>({tag:'INPUT',typ,selector:`#${typ}`,sichtbar:true,gesperrt:false,...extra});
  const inventar=['text','number','date','time','file','checkbox','radio'].map(t=>eintrag(t));
  inventar.push(eintrag('select-one',{tag:'SELECT'}),eintrag('button',{tag:'BUTTON'}),eintrag('hidden',{sichtbar:false}),eintrag('disabled',{gesperrt:true}));
  assert.deepEqual(reflowSichtziele(inventar),['#text','#number','#date','#time','#select-one','#button','.table-scroll']);
  assert.throws(()=>reflowSichtziele([]),Messfehler);assert.throws(()=>reflowSichtziele([eintrag('date',{selector:''})]),Messfehler);
});
const schicht=(farbe='rgb(255, 255, 255)',extra={})=>({selector:'body',farbe,bild:'none',filter:'none',mischung:'normal',schatten:'none',deckkraft:1,...extra});
test('WCAG: Schwarz/Weiß 21:1, identische Farben 1:1, Rot/Weiß bekannt',()=>{
  assert.equal(kontrast(schwarz,weiss),21);assert.equal(kontrast(weiss,weiss),1);
  assert.ok(Math.abs(kontrast(farbe('rgb(255, 0, 0)'),weiss)-3.9984767707539985)<1e-12);
  assert.ok(kontrast(farbe('rgb(118, 118, 118)'),weiss)>=4.5);
  assert.ok(kontrast(farbe('rgb(119, 119, 119)'),weiss)<4.5,'Gegenprobe fällt unter Schwelle');
});
test('Deckkraft von Vordergrund und verschachtelten Gruppen wird komponiert',()=>{
  assert.deepEqual(schichten(farbe('rgba(0, 0, 0, 0.5)'),weiss),[0.5,0.5,0.5,1]);
  const [a,b]=farbpaar([schicht('rgba(0, 0, 0, 0)',{deckkraft:0.5}),schicht()], 'rgb(0, 0, 0)');
  assert.deepEqual(a,[0.5,0.5,0.5,1]);assert.deepEqual(b,weiss);assert.ok(kontrast(a,b)<4.5);
  const [c,d]=farbpaar([schicht('rgb(0, 0, 0)',{deckkraft:0.5}),schicht()], 'rgb(255, 255, 255)');
  assert.deepEqual(c,weiss);assert.deepEqual(d,[0.5,0.5,0.5,1]);
});
for(const [name,css]of [['transparentes sRGB','color(srgb 0.5 0.2 1 / 0.5)'],['CSSOM mit Schrägstrich','rgb(128 64 255 / 0.5)']])test(`Farbparser: ${name}`,()=>assert.equal(farbe(css)[3],0.5));
for(const css of ['red','lab(30 10 0)','rgb(999, 0, 0)','rgba(0, 0, 0, 2)','linear-gradient(white,black)',undefined])test(`Unbestimmbare Farbe geschlossen ungültig: ${css}`,()=>assert.throws(()=>farbe(css),Messfehler));
test('Großer Text: 24 px normal bzw. 14 pt fett; Randwerte bleiben korrekt',()=>{
  assert.equal(textSchwelle(24,400),3);assert.equal(textSchwelle(23.99,400),4.5);
  assert.equal(textSchwelle(56/3,700),3);assert.equal(textSchwelle(56/3-0.001,700),4.5);assert.equal(textSchwelle(56/3,699),4.5);
  assert.throws(()=>textSchwelle(0,400),Messfehler);assert.throws(()=>textSchwelle(20,NaN),Messfehler);
});
test('Verlauf/Bild im sichtbaren Hintergrund wird nicht geschätzt; deckende Überdeckung ist belegbar',()=>{
  assert.throws(()=>farbpaar([schicht('rgba(0, 0, 0, 0)',{bild:'linear-gradient(white,black)'})],'rgb(0, 0, 0)'),Messfehler);
  assert.deepEqual(farbpaar([schicht(),schicht('rgb(0, 0, 0)',{bild:'url(bild.png)'})],'rgb(0, 0, 0)'),[schwarz,weiss]);
  assert.throws(()=>farbpaar([schicht(),schicht('rgb(0, 0, 0)',{filter:'blur(2px)'})],'rgb(0, 0, 0)'),Messfehler);
});
const text=extra=>({selector:'p',text:true,bedienelement:false,farbe:'rgb(0, 0, 0)',groesse:16,gewicht:400,kette:[schicht()],...extra});
test('Kontrastentscheidung unterscheidet bestätigte Unterschreitung, native Grafik und fehlenden Messwert',()=>{
  assert.deepEqual(pruefeKontraste([text()]).befunde,[]);
  assert.equal(pruefeKontraste([text({farbe:'rgb(119, 119, 119)'})]).befunde.length,1);
  assert.equal(pruefeKontraste([text({bedienelement:true,nativ:true})]).grenzen.length,1);
  assert.equal(pruefeKontraste([text({bedienelement:true,nativ:true})]).unklar.length,0);
  assert.throws(()=>pruefeKontraste([]),Messfehler);
});
test('Nur positiv zugeordneter Text einer inaktiven Kontrolle ist ausgenommen; aktive, unbestätigte oder bloß graue Texte bleiben pflichtig',()=>{
  const e=text({farbe:'rgb(170, 170, 170)'}),beleg={selector:'[name="verhandlungRunde1Aktiv"]',gesperrt:true,zugeordnet:true,label:'Bieterverhandlung'};
  const k=pruefeKontraste([{...e,inaktiverText:beleg}]);assert.equal(k.befunde.length,0);assert.equal(k.ausnahmen.length,1);
  assert.equal(pruefeKontraste([e]).befunde.length,1);
  for(const a of [{...beleg,gesperrt:false},{...beleg,zugeordnet:false},{...beleg,selector:''},{...beleg,label:''}])
    assert.equal(pruefeKontraste([{...e,inaktiverText:a}]).unklar.length,1);
});
test('Messquelle belegt Label.control, native Sperre und Rückzuordnung statt Ausnahmen nur aus grauer Farbe abzuleiten',()=>{
  const messen=new Function('gesperrt','selector',`return (${quellen.inaktiverTextQuelle})`)(e=>e.disabled===true,e=>'#'+e.id);
  const kontrolle={id:'option',disabled:true,labels:[]},label={control:kontrolle,textContent:'Option mit Erklärung'},text={closest:()=>label};kontrolle.labels=[label];
  assert.equal(messen(text).selector,'#option');assert.equal(messen(text).zugeordnet,true);
  kontrolle.disabled=false;assert.equal(messen(text),null);kontrolle.disabled=true;kontrolle.labels=[];assert.equal(messen(text),null);
  label.control=null;assert.equal(messen(text),null);assert.equal(messen({closest:()=>null}),null);
});
test('Bedienelement braucht vollständig kontrastierende Kante oder Fläche, nicht nur eine dunkle Seite',()=>{
  const e=text({bedienelement:true,gesperrt:false,nativ:false,aussen:[schicht()],rahmen:Array.from({length:4},()=>({farbe:'rgb(0, 0, 0)',breite:1,stil:'solid'}))});
  assert.deepEqual(pruefeKontraste([e]).befunde,[]);
  e.rahmen[2].farbe='rgb(250, 250, 250)';assert.ok(pruefeKontraste([e]).befunde.some(m=>m.art==='Bedienelement'));
  e.kette=[schicht('rgb(0, 0, 0)')];e.farbe='rgb(255, 255, 255)';assert.deepEqual(pruefeKontraste([e]).befunde,[]);
});
test('Fokusrahmen ist 3:1-pflichtig; fehlender Rahmen ist eine unvollständige Kontrastmessung',()=>{
  const e=text({fokus:true,aussen:[schicht()],outline:{breite:3,stil:'solid',farbe:'rgb(119, 119, 119)'}});
  assert.deepEqual(pruefeKontraste([e]).befunde,[]);
  e.outline.farbe='rgb(200, 200, 200)';assert.ok(pruefeKontraste([e]).befunde.some(m=>m.art==='Fokusrahmen'));
  e.outline.breite=0;assert.equal(pruefeKontraste([e]).unklar.length,1);
});
const element=extra=>({selector:'button',links:0,rechts:200,breite:200,hoehe:30,innenBreite:198,innenHoehe:28,inhaltBreite:198,inhaltHoehe:28,texteingabe:false,tabellenInnenraum:false,datentabelle:false,horizontalRollbar:false,textAbgeschnitten:false,...extra});
const layout=extra=>({clientWidth:320,scrollWidth:320,elemente:[element()],...extra});
test('Layout besteht nur mit auswertbarem Elementinventar und bestätigter Breite',()=>{
  assert.equal(pruefeLayout(layout()).elemente,1);
  for(const m of [layout({clientWidth:0}),layout({elemente:[]}),layout({elemente:[element({breite:0})]}),layout({elemente:[element({rechts:NaN})]})])assert.throws(()=>pruefeLayout(m),Messfehler);
});
test('Flächenloser Zeilenwechsel ist messbar; ein gewöhnliches Nullrechteck, ungültige Zahlen oder breites br bleiben pflichtig',()=>{
  const br=element({tag:'BR',breite:0,rechts:0,innenBreite:0,inhaltBreite:0});
  assert.doesNotThrow(()=>pruefeLayout(layout({elemente:[element(),br]})));
  for(const extra of [{tag:'BUTTON'},{breite:NaN},{hoehe:0},{textAbgeschnitten:true}])
    assert.throws(()=>pruefeLayout(layout({elemente:[{...br,...extra}]})),Messfehler);
  assert.throws(()=>pruefeLayout(layout({elemente:[element({tag:'BR',rechts:400})]})),Abweichung);
});
for(const [name,extra]of [['Seitenüberlauf',{scrollWidth:321.1}],['Elementüberlauf',{elemente:[element({rechts:325})]}],['Abschneiden innerhalb der Fläche',{elemente:[element({inhaltBreite:250})]}],['Vertikales Abschneiden',{elemente:[element({inhaltHoehe:50})]}],['Textrechteck',{elemente:[element({textAbgeschnitten:true})]}],['Rollbereich außerhalb Tabelle',{elemente:[element({horizontalRollbar:true})]}]])test(`Layout-Gegenprobe: ${name}`,()=>assert.throws(()=>pruefeLayout(layout(extra)),Abweichung));
test('Nur Tabelleninnenraum und native Texteingabe haben belegte Inhaltsausnahmen, Außenflächen bleiben pflichtig',()=>{
  assert.doesNotThrow(()=>pruefeLayout(layout({elemente:[element({tabellenInnenraum:true,rechts:1000,inhaltBreite:1000})]})));
  assert.doesNotThrow(()=>pruefeLayout(layout({elemente:[element({texteingabe:true,inhaltBreite:1000})]})));
  assert.throws(()=>pruefeLayout(layout({elemente:[element({texteingabe:true,rechts:1000})]})),Abweichung);
  assert.throws(()=>pruefeLayout(layout({elemente:[element({datentabelle:true,rechts:1000})]})),Abweichung);
});
test('Bestätigter horizontaler Datentabellen-Rollbereich ist kein Abschneiden; vertikales Abschneiden und überragende Außenfläche bleiben Fehler',()=>{
  const t=element({datentabelle:true,horizontalRollbar:true,inhaltBreite:768});
  assert.doesNotThrow(()=>pruefeLayout(layout({elemente:[t]})));
  for(const extra of [{horizontalRollbar:false},{datentabelle:false},{rechts:400},{inhaltHoehe:200}])
    assert.throws(()=>pruefeLayout(layout({elemente:[{...t,...extra}]})),Abweichung);
});
test('Layout misst eindeutig bemaltes Dateilabel; unklare Zuordnung wird nicht als native Inhaltsausnahme bestanden',()=>{
  const knoten=(extra={})=>({tagName:'LABEL',id:'',name:'',className:'file-button',childNodes:[],parentElement:null,children:[],textContent:'Projekt importieren',
    clientWidth:198,clientHeight:42,scrollWidth:198,scrollHeight:42,style:{opacity:'1'},
    getBoundingClientRect:()=>({left:0,right:200,width:200,height:44,top:0,bottom:44}),getClientRects:()=>[{}],closest:()=>null,matches:()=>false,...extra});
  const label=knoten(),datei=knoten({tagName:'INPUT',id:'open-json',className:'',labels:[label],style:{opacity:'0'},clientWidth:20,scrollWidth:269,
    getBoundingClientRect:()=>({left:20,right:42,width:22,height:44,top:0,bottom:44}),matches:q=>q==='input[type=file]'});
  const doc={querySelectorAll:()=>[label,datei],documentElement:{clientWidth:320,scrollWidth:320}},stil=e=>({display:'block',visibility:'visible',contentVisibility:'visible',overflowX:'visible',...e.style});
  const messen=()=>new Function('document','getComputedStyle','scrollX','scrollY',`return (${quellen.layoutQuelle})`)(doc,stil,0,0);
  const m=messen();assert.equal(m.elemente[1].breite,200);assert.equal(m.elemente[1].inhaltBreite,198);assert.equal(m.elemente[1].malflaeche.eindeutig,true);assert.doesNotThrow(()=>pruefeLayout(m));
  datei.labels=[label,knoten()];assert.throws(()=>pruefeLayout(messen()),Messfehler);
  datei.getClientRects=()=>[];assert.equal(messen().elemente.length,1);
});
test('Fokusreihenfolge: vorwärts und rückwärts, versteckte Ziele und Fallen scheitern',()=>{
  assert.doesNotThrow(()=>pruefeReihenfolge(['a','b'],['a','b'],['b','a']));
  for(const [v,r]of [[['b','a'],['b','a']],[['a','a'],['b','a']],[['a','versteckt','b'],['b','a']],[['a','b'],['a','b']]])assert.throws(()=>pruefeReihenfolge(['a','b'],v,r),Abweichung);
  assert.throws(()=>pruefeReihenfolge([],[],[]),Messfehler);
});
test('Emulation braucht jeden erwarteten Wert, auch Rücksetzen',()=>{
  assert.equal(pruefeEmulation({innerWidth:320,devicePixelRatio:4,reduziert:true},{innerWidth:320,devicePixelRatio:4,reduziert:true}).innerWidth,320);
  for(const m of [{innerWidth:0},{innerWidth:320,devicePixelRatio:1},{innerWidth:320,devicePixelRatio:NaN},{innerWidth:320,devicePixelRatio:4,reduziert:false}])assert.throws(()=>pruefeEmulation(m,{innerWidth:320,devicePixelRatio:4,reduziert:true}),Messfehler);
  assert.throws(()=>pruefeEmulation({},{}),Messfehler);
});
const fokus=extra=>({kennung:'1',breite:150,hoehe:40,links:1,rechts:151,oben:10,unten:50,innerWidth:320,innerHeight:900,sichtbar:true,fokusVisible:true,treffer:true,outline:'solid',outlineBreite:3,outlineFarbe:'rgb(0, 0, 0)',boxSchatten:'none',hintergrund:'rgb(255, 255, 255)',rahmen:'unverändert',normal:{boxSchatten:'none',hintergrund:'rgb(255, 255, 255)',rahmen:'unverändert'},...extra});
test('Sichtbarer Fokus: Geometrie, Treffpunkt und sichtbarer Rahmen; verdeckt, unsichtbar, Breite 0 scheitern',()=>{
  assert.doesNotThrow(()=>pruefeFokus(fokus()));
  for(const extra of [{treffer:false},{sichtbar:false},{fokusVisible:false},{outlineBreite:0},{rechts:400},{unten:1000}])assert.throws(()=>pruefeFokus(fokus(extra)),Abweichung);
  assert.throws(()=>pruefeFokus(fokus({breite:0})),Messfehler);
  assert.throws(()=>pruefeFokus(fokus({outlineFarbe:'color(srgb 0 0 0 / 0)'})),Abweichung);
  assert.throws(()=>pruefeFokus(fokus({typ:'text',outlineBreite:0,nativeGrafik:true,fokusVisible:false})),Abweichung);
  assert.throws(()=>pruefeFokus(fokus({outlineBreite:0,boxSchatten:'0 0 0 3px red'})),Messfehler);
  assert.doesNotThrow(()=>pruefeFokus(fokus({datentabelle:true,hoehe:1200,oben:0,unten:1200})));
  assert.doesNotThrow(()=>pruefeFokus(fokus({datentabelle:true,hoehe:2000,oben:-500,unten:1500})));
  assert.throws(()=>pruefeFokus(fokus({datentabelle:true,hoehe:1200,oben:901,unten:2101})),Abweichung);
  assert.throws(()=>pruefeFokus(fokus({hoehe:1200,oben:0,unten:1200})),Abweichung);
});
test('Nur native Datum-/Zeitteilfelder brauchen eine Sichtprüfung; andere Felder ohne Ring bleiben Produktbefunde',()=>{
  for(const typ of ['date','time','datetime-local','month','week']) {
    const m=fokus({typ,nativeGrafik:true,outlineBreite:0,fokusVisible:false});
    assert.equal(pruefeFokus(m).sichtpruefung,true);
    const nodes=[{nodeId:'datum',backendDOMNodeId:7,name:{value:'Datum'}},
      {nodeId:'tag',parentId:'datum',name:{value:'Teilfeld'},properties:[{name:'focused',value:{value:true}}]}];
    assert.equal(nativerFokus(nodes,7).nodeId,'tag');
    for(const extra of [{treffer:false},{sichtbar:false},{rechts:400},{nativeGrafik:false}])
      assert.throws(()=>pruefeFokus({...m,...extra}),Abweichung);
  }
  for(const typ of ['text','number','email','checkbox','select-one','textarea',null])
    for(const fokusVisible of [false,true])
      assert.throws(()=>pruefeFokus(fokus({typ,nativeGrafik:true,outlineBreite:0,fokusVisible})),Abweichung);
});
test('Fokusmessquelle kennzeichnet nur native Datum-/Zeitfelder als nicht messbare Teilfeldgrafik',()=>{
  const rechteck={left:1,right:151,top:10,bottom:50,width:150,height:40};
  const c={visibility:'visible',opacity:'1',appearance:'auto',outlineStyle:'none',outlineWidth:'0',outlineColor:'rgb(0, 0, 0)'};
  const messen=new Function('document','getComputedStyle','scrollX','scrollY','innerWidth','innerHeight',`return ${quellen.fokusQuelle}`);
  for(const [tagName,type] of [['INPUT','date'],['INPUT','time'],['INPUT','datetime-local'],['INPUT','month'],['INPUT','week'],
    ['INPUT','text'],['INPUT','number'],['SELECT','select-one'],['TEXTAREA','textarea']]) {
    const e={tagName,type,dataset:{browserMesskennung:'1'},parentElement:null,closest:()=>null,getClientRects:()=>[rechteck],getBoundingClientRect:()=>rechteck,
      matches:s=>s.split(',').includes(`input[type=${type}]`),contains:()=>false};
    const document={activeElement:e,elementFromPoint:()=>e};
    const m=messen(document,()=>c,0,0,320,900);
    assert.equal(m.nativeGrafik,['date','time','datetime-local','month','week'].includes(type));
    assert.equal(m.typ,type);
    assert.equal(messen(document,()=>({...c,appearance:'none'}),0,0,320,900).nativeGrafik,false);
  }
});
test('AX: vollständige Zuordnung verlangt Rolle und Namen jedes Elements',()=>{
  const e=[{selector:'button',backendNodeId:7}],nodes=[{nodeId:'1',backendDOMNodeId:7,role:{value:'button'},name:{value:'Berechnen'},ignored:false}];
  assert.equal(pruefeAx(nodes,e).elemente,1);
  for(const n of [[],[{...nodes[0],name:{value:''}}],[{...nodes[0],role:{value:'generic'}}],[{...nodes[0],ignored:true}]])assert.throws(()=>pruefeAx(n.length?n:[{nodeId:'root'}],e),Abweichung);
  assert.throws(()=>pruefeAx([],e),Messfehler);assert.throws(()=>pruefeAx(nodes,[{selector:'button'}]),Messfehler);
});
test('Native Datumsteile dürfen wiederholt fokussieren, wenn ein anderer benannter AX-Knoten im selben Feld belegt ist',()=>{
  const focused=[{name:'focused',value:{value:true}}];
  const nodes=[{nodeId:'datum',backendDOMNodeId:7,name:{value:'Datum'},properties:focused},{nodeId:'tag',parentId:'datum',name:{value:'Tag'},properties:focused}];
  assert.equal(nativerFokus(nodes,7).nodeId,'tag');assert.throws(()=>nativerFokus(nodes,8),Messfehler);
  assert.throws(()=>nativerFokus([...nodes,{nodeId:'anderes',name:{value:'anderes'},properties:focused}],7),Messfehler);
  assert.throws(()=>nativerFokus(nodes.map(n=>({...n,properties:[]})),7),Messfehler);
});
test('AX-Abruf bestätigt Hauptframe, eindeutige Kennungen und vollständig gelieferte Kinder vor jedem Produktbefund',()=>{
  const root={nodeId:'root',frameId:'frame',role:{value:'RootWebArea'},name:{value:'Probeseite'},ignored:false,childIds:['button']},child={nodeId:'button',parentId:'root'};
  assert.equal(bestaetigeAxBaum([root,child],'frame').length,2);
  for(const nodes of [[],[child],[root],[{...root,frameId:'fremd'},child],[root,child,child],[{...root,name:{value:''}},child]])assert.throws(()=>bestaetigeAxBaum(nodes,'frame'),Messfehler);
});
const live=extra=>({fokus:{tag:'BUTTON',verbunden:true,sichtbar:true},regionen:[{id:'form-message',sichtbar:true,text:'Terminplan aktualisiert.',rolle:'status',live:'polite',enthaeltFokus:false}],...extra});
test('Fokus/Live-Lage: Status genügt nur sichtbar, mit Text und erhaltenem Fokus',()=>{
  assert.doesNotThrow(()=>pruefeLive(live(),'form-message'));
  assert.throws(()=>pruefeLive(live({fokus:{tag:'BODY',verbunden:true,sichtbar:true}}),'form-message'),Abweichung);
  assert.throws(()=>pruefeLive(live({regionen:[{id:'form-message',sichtbar:true,text:'ok'}]}),'form-message'),Abweichung);
  assert.throws(()=>pruefeLive(live({regionen:[]}),'form-message'),Messfehler);
});
test('Fehlertext verlangt Feldbezug und darf nicht gleichzeitig einen falschen Erfolg melden',()=>{
  const vorher={statusmeldungen:[{id:'import-message',text:'Projektdatei geöffnet.'},{id:'form-message',text:''}]};
  const m={text:'Kein Terminplan: Teststellung (01.01.2000), festen Starttermin bitte korrigieren.',sichtbar:true,statusmeldungen:vorher.statusmeldungen,
    felder:[{selector:'[name="teststellungStart"]',beschriftung:'Fester Starttermin',wert:'2000-01-01',gruppentext:'Dauer der Teststellung',bezug:null,ungueltig:null,fokus:false}]};
  assert.doesNotThrow(()=>pruefeFehlermeldung(m,{vorher}));
  assert.throws(()=>pruefeFehlermeldung({...m,statusmeldungen:[{id:'form-message',text:'Terminplan aktualisiert.'},vorher.statusmeldungen[0]]},{vorher}),Abweichung);
  for(const text of ['Ein allgemeiner Fehler ist aufgetreten.','Teststellung (02.01.2000): Starttermin bitte korrigieren.'])assert.throws(()=>pruefeFehlermeldung({...m,text},{vorher}),Abweichung);
  assert.throws(()=>pruefeFehlermeldung({...m,text:null},{vorher}),Messfehler);
  assert.throws(()=>pruefeFehlermeldung(m),Messfehler);
  const importstatus=[{id:'import-message',text:''}];
  assert.doesNotThrow(()=>pruefeFehlermeldung({text:'Die Projektdatei konnte nicht geöffnet werden.',sichtbar:true,statusmeldungen:importstatus,felder:[{selector:'#open-json',beschriftung:'Projekt importieren'}]},{datei:true,vorher:{statusmeldungen:importstatus}}));
});

test('Falsche Exporterfolge werden mit allen aktuellen Web- und App-Texten erkannt; Fehlertexte bleiben Fehler',()=>{
  const web=readFileSync(new URL('../../packages/oberflaeche/src/web-vorgaben.ts',import.meta.url),'utf8');
  const app=readFileSync(new URL('../../app/src/pages/index.astro',import.meta.url),'utf8');
  const aktion=readFileSync(new URL('../../packages/oberflaeche/src/fristenrechner-export-action.ts',import.meta.url),'utf8');
  const webErfolg=/exportErfolg: '([^']+)'/.exec(web)?.[1];
  assert.equal(webErfolg,'Die Datei wurde erstellt und zum Speichern bereitgestellt.');
  const appTexte=[...app.matchAll(/(?:exportieren|teilen): \{ projekt: '([^']+)', excel: '([^']+)', pdf: '([^']+)' \}/g)].flatMap(m=>m.slice(1));
  assert.equal(appTexte.length,6);assert.ok(aktion.includes('`Die ${copy.name} wurde zum Teilen bereitgestellt.`'));
  const webTeilen=[...aktion.matchAll(/name: '([^']+)'/g)].map(m=>`Die ${m[1]} wurde zum Teilen bereitgestellt.`);assert.equal(webTeilen.length,3);
  for(const id of ['export-message','excel-message','pdf-message'])for(const text of [webErfolg,...appTexte,...webTeilen]) {
    const vorher={statusmeldungen:[{id,text:''}]},m={text:'Die Datei konnte nicht erstellt werden.',statusmeldungen:[{id,text}]};
    assert.throws(()=>pruefeFehlerStatus(m,vorher),Abweichung,text);
    assert.doesNotThrow(()=>pruefeFehlerStatus(m,m),'Unveränderter früherer Erfolg ist kein gleichzeitiger neuer Erfolg.');
  }
  for(const text of ['Die Datei konnte nicht zum Speichern bereitgestellt werden.','PDF konnte nicht gespeichert werden.']) {
    assert.doesNotThrow(()=>pruefeFehlerStatus({text,statusmeldungen:[{id:'pdf-message',text}]},{statusmeldungen:[{id:'pdf-message',text:''}]}));
  }
});
test('Farblose Darstellung: leere Zuordnung und geänderte Texte sind bestätigte Abweichungen',()=>{
  const m={phasen:[{name:'Angebotsphase',text:'Phase 1 Angebotsphase'}],warnungen:['Frist unterschritten'],fristtypen:[{typ:'Mindestfrist',phase:'Mindestfrist Angebotsphase',termin:'Angebotsabgabe'}]};
  assert.deepEqual(pruefeTextzuordnung(m,m),m);
  assert.throws(()=>pruefeTextzuordnung({...m,warnungen:[]}),Abweichung);
  assert.throws(()=>pruefeTextzuordnung({...m,warnungen:['anderer Text']},m),Abweichung);
  assert.throws(()=>pruefeTextzuordnung({}),Messfehler);
  const erwartet={phasen:['Angebotsphase'],typen:['Mindestfrist'],warnungen:['Frist unterschritten']};
  assert.doesNotThrow(()=>pruefeTextzuordnung(m,null,erwartet));
  assert.throws(()=>pruefeTextzuordnung(m,null,{...erwartet,typen:['Praxiswert']}),Abweichung);
});
test('Teilfälle trennen Messfehler, bestätigte Abweichung und unbekannte Steuerungsfehler; ungültig hat Vorrang',async()=>{
  const l=[];
  await teilfall(l,'ok',async()=>{});await teilfall(l,'Produkt',async()=>{throw new Abweichung('falsch');});
  assert.throws(()=>teilfaelleEntscheiden(l),Abweichung);
  await teilfall(l,'Steuerung',async()=>{throw new Error('Transport verloren');});
  assert.deepEqual(l.map(f=>f.status),['bestanden','nicht bestanden','ungültig']);assert.throws(()=>teilfaelleEntscheiden(l),Messfehler);
  assert.throws(()=>teilfaelleEntscheiden([{status:'unbekannt'}]),Messfehler);
});
test('Reduzierte Bewegung: Originalaufruf, CSS und tatsächliche Scrollpositionen müssen zusammenpassen',()=>{
  const m={aufrufe:[{vorher:{x:0,y:0,zielOben:100},synchron:{x:0,y:100},optionen:{behavior:'auto'},bilder:Array.from({length:30},(_,i)=>({x:0,y:100,zeit:i+1}))}],css:['html','body','section'].map(selector=>({selector,scrollBehavior:'auto'})),reduziert:true};
  assert.doesNotThrow(()=>pruefeBewegung(m));
  const kopie=()=>structuredClone(m);let n=kopie();n.aufrufe[0].bilder[2].y=50;assert.throws(()=>pruefeBewegung(n),Abweichung);
  n=kopie();n.aufrufe[0].optionen.behavior='smooth';assert.throws(()=>pruefeBewegung(n),Abweichung);
  n=kopie();n.css[0].scrollBehavior='smooth';assert.throws(()=>pruefeBewegung(n),Abweichung);
  n=kopie();n.aufrufe[0].bilder.pop();assert.throws(()=>pruefeBewegung(n),Messfehler);
  n=kopie();n.aufrufe[0].vorher.zielOben=0;assert.throws(()=>pruefeBewegung(n),Messfehler);
});
test('Neue Phasen/Gruppe vollständig; die ursprüngliche Gruppe bleibt gleich',()=>{
  assert.deepEqual(argumente(['--phase','alle','--ausgabe','scratchpad/test-lauf']).phasen,['vertrag','webadapter','darstellung','tastatur']);
  assert.deepEqual(argumente(['--phase','grundlagen','--ausgabe','scratchpad/test-lauf']).phasen,['vertrag','webadapter']);
  assert.throws(()=>argumente(['--phase','alle-v6a','--ausgabe','scratchpad/test-lauf']),/--phase muss/);
  for(const phase of ['darstellung','tastatur']) {
    const p={phase,ergebnisse:ERGEBNISKATALOG[phase].map(id=>({id,status:'bestanden'}))};assert.equal(auswerten(p).code,0);
    assert.equal(auswerten({...p,ergebnisse:p.ergebnisse.slice(1)}).code,2);
    assert.equal(auswerten({...p,ergebnisse:[...p.ergebnisse,p.ergebnisse[0]]}).code,2);
    assert.equal(auswerten({...p,ergebnisse:[...p.ergebnisse,{id:'fremd',status:'bestanden'}]}).code,2);
  }
});
test('Sichtstatus ohne Bildinventar kann weder bestehen noch als bloß ausstehend gelten',()=>{
  const p={phase:'darstellung',ergebnisse:ERGEBNISKATALOG.darstellung.map(id=>({id,status:'bestanden'}))};p.ergebnisse[0].status='Sichtprüfung ausstehend';
  assert.equal(auswerten(p).code,2);
  p.ergebnisse[0].details={teilfaelle:[{status:'bestanden',bild:'b7-320.png'}]};p.sichtpruefung={bilder:[{id:'B7',bild:'b7-320.png',sha256:'a'.repeat(64)}]};assert.equal(auswerten(p).code,4);
  p.ergebnisse[1].status='nicht bestanden';assert.equal(auswerten(p).code,1);p.ergebnisse[1].status='ungültig';assert.equal(auswerten(p).code,2);
});
test('Gesamtstatus: fehlende Kombination vor Produktfehler vor Sichtprüfung',()=>{
  const optionen=argumente(['--phase','alle','--browser','edge','--ausgabe','scratchpad/test-lauf']);
  const laeufe=optionen.phasen.map(phase=>({browser:'edge',phase,code:phase==='darstellung'?4:0}));
  assert.equal(gesamtAuswerten({optionen,laeufe}).code,4);laeufe[0].code=1;assert.equal(gesamtAuswerten({optionen,laeufe}).code,1);
  laeufe[0].code=2;assert.equal(gesamtAuswerten({optionen,laeufe}).code,2);assert.equal(gesamtAuswerten({optionen,laeufe:laeufe.slice(1)}).code,2);
});
test('Tastaturbedienung verwendet nur echte Input-Ereignisse und Evaluation ohne Nutzeraktivierung',async()=>{
  const aufrufe=[],b=bedienung({cdp:{send:async(m,p)=>{aufrufe.push({m,p});return m==='Runtime.evaluate'?{result:{value:p.expression==='__messTasten.length'?0:p.expression.includes('__messTasten.slice')?[{key:'Tab',vertrauenswuerdig:true}]:true}}:{};}},basisUrl:'http://127.0.0.1:1'});
  await b.tab();await b.tab(true);await b.taste('Enter',{text:'\r'});await b.taste(' ',{code:'Space',text:' '});
  assert.ok(aufrufe.filter(e=>e.m==='Runtime.evaluate').every(e=>e.p.userGesture===false));
  assert.ok(!aufrufe.some(e=>e.m==='DOM.focus'||e.m==='Input.insertText'));
  assert.deepEqual(aufrufe.filter(e=>e.m==='Input.dispatchKeyEvent').map(e=>[e.p.type,e.p.key,e.p.modifiers]),[['keyDown','Tab',0],['keyUp','Tab',0],['keyDown','Tab',8],['keyUp','Tab',8],['keyDown','Enter',0],['keyUp','Enter',0],['keyDown',' ',0],['keyUp',' ',0]]);
});
test('Produktwartezeit bestätigt erst den Messkanal; fehlende Bestätigung bleibt ungültig',async()=>{
  const machen=antwort=>bedienung({cdp:{send:async()=>antwort},basisUrl:'http://127.0.0.1:1'});
  await assert.rejects(()=>machen({result:{value:'messbereit'}}).bis(()=>false,'Produkt',{produkt:true,timeout:0}),Abweichung);
  await assert.rejects(()=>machen({result:{value:'falsch'}}).bis(()=>false,'Produkt',{produkt:true,timeout:0}),Messfehler);
  await assert.rejects(()=>machen({result:{value:'messbereit'}}).bis(()=>false,'Messung',{timeout:0}),Messfehler);
});
test('Alle eingebetteten Messausdrücke sind syntaktisch gültig und erzeugen keine Nutzeraktivierung',()=>{
  for(const quelle of [...Object.values(quellen),inventarQuelle,sichtbarQuelle])assert.doesNotThrow(()=>new Function(`return (${quelle})`));
});
test('Tab ohne vertrauenswürdiges Seitenereignis bleibt Messfehler',async()=>{
  const b=bedienung({cdp:{send:async(m,p)=>m==='Runtime.evaluate'?{result:{value:p.expression==='__messTasten.length'?0:p.expression.includes('__messTasten.slice')?[]:true}}:{}},basisUrl:'http://127.0.0.1:1'});
  await assert.rejects(()=>b.tab(),Messfehler);
});
test('Native Fokusgrafik braucht Sichtprüfung; Verdeckung/Überlauf bleiben auch bei nativen Feldern Produktbefunde',()=>{
  const m=fokus({typ:'date',nativeGrafik:true,fokusVisible:false,outline:'none'});
  assert.equal(pruefeFokus(m).sichtpruefung,true);
  for(const extra of [{treffer:false},{sichtbar:false},{rechts:400}])assert.throws(()=>pruefeFokus({...m,...extra}),Abweichung);
  assert.doesNotThrow(()=>pruefeFokus({...m,outline:'solid',fokusVisible:true}));
  assert.throws(()=>pruefeFokus({...m,nativeGrafik:false}),Abweichung);
});
test('Geschlossene details sind für Layout und AX keine sichtbaren Felder; erstes summary und offene Bereiche bleiben sichtbar',()=>{
  const sichtbar=new Function('getComputedStyle',`return (${sichtbarQuelle})`)(e=>({display:'block',visibility:'visible',contentVisibility:'visible',...e.style}));
  const knoten=(tag,parent=null)=>({tagName:tag,parentElement:parent,children:[],style:{},open:false,closest:()=>null,getClientRects:()=>[{}],matches(q){return q==='details:not([open])'&&this.tagName==='DETAILS'&&!this.open;},contains(e){return e===this||this.children.some(c=>c.contains(e));}});
  const d=knoten('DETAILS'),s=knoten('SUMMARY',d),feld=knoten('INPUT',d);d.children=[s,feld];
  assert.equal(sichtbar(s),true);assert.equal(sichtbar(feld),false);assert.equal(sichtbar(d),true);
  d.open=true;assert.equal(sichtbar(feld),true);d.style.display='none';assert.equal(sichtbar(feld),false);d.style.display='block';
  d.open=false;const zweites=knoten('SUMMARY',d);d.children.push(zweites);assert.equal(sichtbar(zweites),false);
  const verschachtelt=knoten('DETAILS',s),innen=knoten('INPUT',verschachtelt);s.children=[verschachtelt];verschachtelt.children=[innen];
  assert.equal(sichtbar(innen),false);verschachtelt.open=true;assert.equal(sichtbar(innen),true);
});
test('Vorheriger zutreffender Import/Terminplan ist kein neuer Erfolg der fehlerhaften Aktion; neue oder widersprüchliche Meldung scheitert',()=>{
  const vorher={statusmeldungen:[{id:'import-message',text:'Projektdatei geöffnet.'},{id:'form-message',text:'Terminplan aktualisiert.'}]};
  assert.doesNotThrow(()=>pruefeFehlerStatus({text:'Die Datei ist kein gültiges JSON.',statusmeldungen:vorher.statusmeldungen},vorher));
  assert.throws(()=>pruefeFehlerStatus({text:'Kein Terminplan berechenbar.',statusmeldungen:vorher.statusmeldungen},vorher),Abweichung);
  assert.throws(()=>pruefeFehlerStatus({text:'Die Datei ist kein gültiges JSON.',statusmeldungen:[{id:'import-message',text:'Projektdatei geöffnet.'}]},{statusmeldungen:[{id:'import-message',text:''}]}),Abweichung);
  assert.throws(()=>pruefeFehlerStatus({text:'Fehler',statusmeldungen:[]},{}),Messfehler);
  for(const liste of [[],[{id:'import-message',text:null}],[vorher.statusmeldungen[0],vorher.statusmeldungen[0]],[vorher.statusmeldungen[0]]])
    assert.throws(()=>pruefeFehlerStatus({text:'Fehler',statusmeldungen:liste},vorher),Messfehler);
});

test('Lesefehler mit negiertem gespeichert ist kein Erfolg; tatsächlicher neuer Speicher- oder Importerfolg bleibt Produktbefund',()=>{
  const vorher={statusmeldungen:[{id:'import-message',text:''},{id:'form-message',text:''}]};
  const text='Die Projektdatei konnte nicht vollständig geladen und gespeichert werden. Bitte versuchen Sie es erneut.';
  const messung=t=>({text,statusmeldungen:[{id:'import-message',text:t},vorher.statusmeldungen[1]]});
  assert.doesNotThrow(()=>pruefeFehlerStatus(messung(text),vorher));
  for(const t of ['Projektdatei gespeichert.','Excel-Datei gespeichert.','PDF gespeichert.','Projektdatei geöffnet (Rechenkern 1.9.0, Rechtsstand: Juli 2026).','Projektdatei geöffnet (Rechenkern 1.9.1, Rechtsstand: Oktober 2026).','Terminplan aktualisiert.','Terminplan aktualisiert. Weiterer Text.'])
    assert.throws(()=>pruefeFehlerStatus(messung(t),vorher),Abweichung);
});

test('Tasten warten auf tatsächlichen Seitenfokus; ohne Fokus wird keine Taste gesendet',async()=>{
  let proben=0;const auf=[],p={};
  const b=bedienung({protokoll:p,cdp:{send:async(m,a)=>{auf.push(m);return m==='Runtime.evaluate'?{result:{value:++proben>1}}:{};}}});
  await b.taste('Enter');assert.equal(proben,2);assert.deepEqual(p.fokusnachweise[0].proben,[false,true]);
  const ohne=bedienung({cdp:{send:async(m)=>{auf.push(m);return {result:{value:false}};}}});
  const start=auf.length;await assert.rejects(()=>ohne.taste('Enter'),Messfehler);
  assert.ok(!auf.slice(start).includes('Input.dispatchKeyEvent'));
});
test('Import wartet auf Abschluss statt einzelne Fehlerwörter: gültiges JSON, Schema-Version, Größe und Lesen; Erfolg und falsche Reaktion scheitern',()=>{
  for(const text of ['Die Datei ist kein gültiges JSON.','Unbekannte Schema-Version "undefined" — bitte die Datei neu exportieren.','Die Projektdatei ist größer als 1 MiB.','Die Projektdatei konnte nicht gelesen werden.']) {
    assert.equal(importReaktion(text,''),true);assert.doesNotThrow(()=>pruefeImportFehler(text,text));
    assert.throws(()=>pruefeImportFehler('Projektdatei geöffnet.',text),Abweichung);
    assert.throws(()=>pruefeImportFehler('Die Datei hat einen anderen Fehler.',text),Abweichung);
  }
  for(const text of [null,'','Projektdatei auswählen …','alt'])assert.equal(importReaktion(text,'alt'),false);
  assert.throws(()=>pruefeImportFehler('irgendwas',''),Messfehler);
});
test('Lesefehler wird am tatsächlich verwendeten File.text nachgestellt und gezählt, nicht am unbenutzten FileReader',async()=>{
  class Datei {constructor(name,size){this.name=name;this.size=size;}text(){return Promise.resolve('{}');}}
  const starten=new Function('File',lesefehlerQuelle);starten(Datei);
  try {
    await assert.rejects(()=>new Datei('probe.json',2).text(),/Browser-Leseprobe/);
    assert.deepEqual(globalThis.__browserLeseprobe,[{name:'probe.json',bytes:2}]);
    assert.doesNotThrow(()=>new Function(`return (${fehlerquelle('#import-message')})`));
  } finally {delete globalThis.__browserLeseprobe;}
});
test('Lesefehlerbeleg braucht genau die ausgewählte Datei einmal; fehlender/doppelter Aufruf, fremde Datei oder Größe sind Messfehler',()=>{
  const erwartet={name:'probe.json',bytes:2};assert.deepEqual(bestaetigeLeseprobe([erwartet],erwartet),erwartet);
  for(const liste of [undefined,[],[erwartet,erwartet],[{...erwartet,name:'fremd.json'}],[{...erwartet,bytes:3}]])assert.throws(()=>bestaetigeLeseprobe(liste,erwartet),Messfehler);
});
test('Langer Projektname bleibt an der realen 200-Zeichen-Grenze; unzulässige Testeingabe ist Messfehler vor jeder Aktivierung',async()=>{
  assert.equal(LANGER_PROJEKTNAME.length,200);
  const auf=[],b=bedienung({basisUrl:'http://127.0.0.1:1',cdp:{send:async(m,p)=>{auf.push(m);return {result:{value:p.expression.includes('maxLength')?200:true}};}}});
  await assert.rejects(()=>b.textEingeben('[name="projektname"]',LANGER_PROJEKTNAME+'x'),Messfehler);
  assert.ok(!auf.includes('Input.dispatchKeyEvent'));
});
test('Nach verworfener Darstellungsseite bekommt nur der nächste Teilfall ein frisches Target; ohne bestätigte Ersatzseite kein Bestehen',async()=>{
  let neu=0;
  const kanal=wert=>({cdp:{send:async()=>({result:{value:wert}})},basisUrl:'http://127.0.0.1:1'});
  const s=darstellungsSitzung({...kanal('alt'),neueSeite:async()=>{neu++;return kanal('neu');}}),faelle=[];
  await teilfall(faelle,'fehler',async()=>{s.verwerfen();throw new Messfehler('Reset nicht bestätigt');});
  await teilfall(faelle,'unabhängig',async()=>{await s.bereit();assert.equal(await s.b.wert('probe'),'neu');});
  assert.deepEqual(faelle.map(f=>f.status),['ungültig','bestanden']);assert.equal(neu,1);await s.bereit();assert.equal(neu,1);
  const ohne=darstellungsSitzung(kanal('alt'));ohne.verwerfen();await assert.rejects(()=>ohne.bereit(),Messfehler);
  const fehler=darstellungsSitzung({...kanal('alt'),neueSeite:async()=>{throw new Messfehler('Keine überwachte Seite');}});fehler.verwerfen();await assert.rejects(()=>fehler.bereit(),Messfehler);
});
test('Sichtstatus für B1 braucht vollständige automatische Rundgänge und unveränderte Bildbelege jedes unmessbaren Fokus',()=>{
  const p={phase:'tastatur',ergebnisse:ERGEBNISKATALOG.tastatur.map(id=>({id,status:'bestanden'})),sichtpruefung:{bilder:[{id:'B1',bild:'fokus.png',sha256:'a'.repeat(64)}]}};
  const r=p.ergebnisse[0];r.status='Sichtprüfung ausstehend';r.details={teilfaelle:[{status:'bestanden',sichtbilder:['fokus.png']},{status:'bestanden'}]};
  assert.equal(auswerten(p).code,4);r.details.teilfaelle[0].status='ungültig';assert.equal(auswerten(p).code,2);
  r.details.teilfaelle[0].status='bestanden';r.details.teilfaelle[0].sichtbilder.push('fehlt.png');assert.equal(auswerten(p).code,2);
});
test('Vorabinstrumentierung für Tastatur, Dateiauswahl und Scrollmessung ist syntaktisch gültig und wird entfernt',async()=>{
  const skripte=[],auf=[];
  const b=bedienung({basisUrl:'http://127.0.0.1:1',navigieren:async()=>{},cdp:{send:async(m,p)=>{
    auf.push([m,p]);if(m==='Page.addScriptToEvaluateOnNewDocument'){skripte.push(p.source);return {identifier:'messung'};}
    if(m==='Runtime.evaluate')return {result:{value:p.expression==='location.href'?'about:blank':p.expression.includes('#storage-status')?'bereit':p.expression.includes('bekanntmachung')?'2026-10-05':true}};
    return {};
  }}});
  await b.frisch();assert.equal(skripte.length,1);assert.doesNotThrow(()=>new Function(skripte[0]));
  assert.ok(auf.some(([m,p])=>m==='Page.removeScriptToEvaluateOnNewDocument'&&p.identifier==='messung'));
  assert.ok(auf.filter(([m])=>m==='Runtime.evaluate').every(([,p])=>p.userGesture===false));
});
test('Bildbeleg erfasst das ganze bestätigte Dokument; kleinere Aufnahme und Breite 0 sind Messfehler',async()=>{
  const basis=resolve('scratchpad/test-browser-bilder');mkdirSync(basis,{recursive:true});const ausgabe=mkdtempSync(join(basis,'lauf-'));
  try {
    const png=Buffer.alloc(40);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(320,16);png.writeUInt32BE(1800,20);
    let width=320;const aufrufe=[];
    const b=bedienung({ausgabe,basisUrl:'http://127.0.0.1:1',cdp:{send:async(m,p)=>{
      aufrufe.push([m,p]);return m==='Page.getLayoutMetrics'?{cssContentSize:{width,height:1800}}:m==='Page.captureScreenshot'?{data:png.toString('base64')}:{result:{value:1}};
    }}});
    assert.equal(await b.bild('vollstaendig.png'),'vollstaendig.png');assert.ok(readFileSync(join(ausgabe,'vollstaendig.png')).equals(png));
    assert.deepEqual(aufrufe.find(([m])=>m==='Page.captureScreenshot')[1].clip,{x:0,y:0,width:320,height:1800,scale:1});
    png.writeUInt32BE(900,20);await assert.rejects(()=>b.bild('halb.png'),Messfehler);width=0;await assert.rejects(()=>b.bild('leer.png'),Messfehler);
  } finally {assert.equal(dirname(resolve(ausgabe)),basis);rmSync(ausgabe,{recursive:true,force:true});}
});
