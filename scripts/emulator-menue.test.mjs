// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { MESSUNG, MENUE_NAMEN, webviewFlaeche, bildPunkt, navOverlays, navigationZurueck, menueTipp, menueOeffnungBestaetigen } from './emulator/menue-ui.mjs';
import { MENUE_FAELLE, MENUE_SCHEMA, evaluiereMenueFall, evaluiereMenueBaum, menueAbdeckung, menueFallId, werteMenueAus, imeSichtbar } from './emulator/menue-auswertung.mjs';
import { werteLaufAus, SICHTPRUEFUNGEN } from './emulator-auswertung.mjs';
import { argumente, APP } from './emulator/rahmen.mjs';
import { variantePlan } from './emulator-lauf.mjs';
import { MenueSitzung, menue, menueRelease, gestenNavigation } from './emulator/menue.mjs';
import { Sitzung } from './emulator/dateien.mjs';
import { hash } from './emulator/dateien-ui.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const f = JSON.parse(readFileSync(join(repo,'scripts/emulator/fixtures/menue-schema1.json'),'utf8'));
const tmp = process.env.TMP ?? join(repo,'scratchpad/paket-2.6/tmp');
mkdirSync(tmp,{recursive:true});
const copy = x => structuredClone(x);
const m = more => ({...copy(f.messung),...more});
const z = more => ({messung:m(),speicher:f.projekt,activity:f.activity,...more});
const zu = () => z({messung:m({hidden:true,fokusAmKnopf:true})});
const xml = nodes => '<hierarchy>' + nodes.map(n => '<node ' + Object.entries({package:APP,enabled:'true',bounds:'[0,0][100,100]',...n}).map(([k,v])=>k+'="'+v+'"').join(' ') + '/>').join('') + '</hierarchy>';
const tree = () => ({xml:[xml([{text:'Dateiaktionen'},...['Schließen',...MENUE_NAMEN].map(text=>({text,class:'android.widget.Button',clickable:'true'}))]),xml([{text:'Dateiaktionen'}])],
  ax:{nodes:[{nodeId:'root',ignored:false,role:{value:'RootWebArea'},childIds:['d'],properties:[{name:'focusable',value:{value:true}}]},
    {nodeId:'d',parentId:'root',ignored:false,role:{value:'dialog'},name:{value:'Dateiaktionen'},childIds:MENUE_NAMEN.map((_,i)=>String(i)).concat('x')},
    ...['Schließen',...MENUE_NAMEN].map((name,i)=>({nodeId:i===0?'x':String(i-1),parentId:'d',ignored:false,role:{value:'button'},name:{value:name}}))]}});
const datei = () => { const b=Buffer.from('{"input":{}}');return {name:'projekt.json',mime:'application/json',bytes:b.length,sha256:hash(b),base64:b.toString('base64'),quelle:'bruecke'}; };
const exportBeleg = () => ({referenz:datei(),ziel:datei(),umgebung:{picker:true},belege:['test.bin']});
const fall = (fall,name,messung) => ({schema:MENUE_SCHEMA,fall,name,messung});
function beispiele() {
  return [
    ...[1,2].map(n=>fall('M-1','schrift-'+n,{schrift:n,oben:m({hidden:true}),ende:m({hidden:true}),offen:m(),unten:m()})),
    ...['x','aussen','zurueck','geste'].map(n=>fall('M-2',n,{vorher:f.projekt,offen:z(),nach:zu(),systemweg:f.launcher,
      ...(n==='geste'?{navigation:f.navigation,geste:'input swipe 1 400 700 400 450'}:{})})),
    fall('M-3','tastatur',{vor:z({messung:m({hidden:true,aktivesElement:{name:'projektname',tag:'input'}}),ime:f.imeOffen}),offen:z({ime:f.imeOffen}),
      schritte:[z({ime:f.imeZu}),{...zu(),ime:f.imeZu},{activity:f.launcher}]}),
    fall('M-4','speichern',{vorher:f.projekt,button:exportBeleg(),sheet:exportBeleg(),nach:{meldungen:{json:'Projektdatei gespeichert.'}},rueckkehr:zu(),erneut:z()}),
    fall('M-4','teilen',{vorher:f.projekt,teilen:{obenTeilen:'android/ChooserActivity',modus:'auswahl',erneuterAuftrag:true},teilenXml:xml([{text:'Teilen'}]),nach:{meldungen:{xlsx:'Excel-Datei zum Teilen bereitgestellt.'}},rueckkehr:zu(),erneut:z()}),
    fall('M-4','import',{vorher:f.projekt,import:{umgebung:{picker:true},belege:['quelle.bin'],messung:{auswahl:'documentsui',projektVor:{projektname:'alt'},projektNach:{projektname:'neu'},gespeichertNach:{projektname:'neu'},projektErwartet:{projektname:'neu'},aktionenFrei:true,aufrufe:1,quelleSha256:'a'.repeat(64),brueckeSha256:'a'.repeat(64)}},nach:{meldungen:{import:'Projektdatei geöffnet (Rechenkern …)'}},rueckkehr:zu(),erneut:z()}),
    fall('M-4','neu',{vorher:f.projekt,dialog:xml(['Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?','ABBRECHEN','ZURÜCKSETZEN'].map(text=>({text}))),nach:{meldungen:{reset:''},gespeicherterText:f.projekt},rueckkehr:zu(),erneut:z()}),
    ...[1,2].map(n=>fall('M-5','schrift-'+n,{schrift:n,vorher:f.projekt,picker:xml([{package:'com.android.documentsui'}]),offen:m({gesperrt:8,sperrhinweis:true}),unten:m({gesperrt:8,sperrhinweis:true}),zu:m({hidden:true,fokusAmKnopf:true}),aufrufeVor:[{methode:'speichernUnter'}],aufrufeNach:[{methode:'speichernUnter'}],antwortenVor:[],antwortenNach:[],rueckkehr:zu()})),
    fall('M-6','neuerstellung',{vorher:f.projekt,offen:z(),seiteVor:1,seiteNach:2,nach:zu(),systemweg:f.launcher}),
    fall('M-6','querformat',{vorher:f.projekt,schrift:2,nach:z({messung:m({kompakt:true,viewport:{width:900,height:800}})}),xNachRollen:true,rueckkehr:zu(),dialog:xml([{text:'Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?'}])}),
    fall('M-7','release',{paket:f.paket,offenXml:xml(['Dateiaktionen','Schließen','Projekt speichern unter'].map(text=>({text}))),zuXml:xml([{text:'Dateiaktionen'}]),erstesZurueck:f.activity,zweitesZurueck:f.launcher,ohneCdp:true,apkSha256:'a'.repeat(64),eingangSha256:'b'.repeat(64),eingangNachherSha256:'b'.repeat(64)}),
    fall('A10','offen',tree()),
  ];
}
for (const b of beispiele()) test('Schema 1: '+menueFallId(b),()=>{
  assert.equal(evaluiereMenueFall(b).status,b.fall==='M-5'?'dokumentierte Grenze':'bestanden',JSON.stringify(evaluiereMenueFall(b)));
  const fehlt=copy(b);delete fehlt.messung;assert.equal(evaluiereMenueFall(fehlt).status,'ungültig');
  fehlt.fehler='Unterbrochen';assert.equal(evaluiereMenueFall(fehlt).status,'ungültig');
});
test('Abdeckung verlangt API und jeden einzelnen Menüfall genau einmal',()=>{
  const r={schema:1,api:30,faelle:beispiele()};
  assert.equal(r.faelle.length,MENUE_FAELLE.length);
  assert.equal(menueAbdeckung(r,30).status,'bestanden');
  assert.equal(menueAbdeckung(r,36).status,'ungültig');
  assert.equal(menueAbdeckung({...r,faelle:r.faelle.slice(1)},30).status,'ungültig');
  assert.equal(menueAbdeckung({...r,faelle:[...r.faelle,r.faelle[0]]},30).status,'ungültig');
});
for (const [id,mutate] of [
  ['menue-M-1-schrift-1',v=>{v.ende.abgeschnitten=[{element:'h2'}];}],
  ['menue-M-1-schrift-2',v=>{v.unten.letzte.bottom=900;}],
  ['menue-M-2-x',v=>{v.nach.messung.fokusAmKnopf=false;}],
  ['menue-M-2-aussen',v=>{v.nach.speicher=f.projekt+' ';}],
  ['menue-M-2-zurueck',v=>{v.nach.activity=f.launcher;}],
  ['menue-M-2-geste',v=>{v.systemweg=f.activity;}],
  ['menue-M-3-tastatur',v=>{v.schritte[0].messung.hidden=true;}],
  ['menue-M-4-speichern',v=>{v.nach.meldungen.json='';}],
  ['menue-M-4-teilen',v=>{v.nach.meldungen.xlsx='';}],
  ['menue-M-4-import',v=>{v.import.messung.aufrufe=2;}],
  ['menue-M-4-neu',v=>{v.nach.gespeicherterText='{}';}],
  ['menue-M-5-schrift-1',v=>{v.aufrufeNach.push({methode:'projektWaehlen'});}],
  ['menue-M-5-schrift-2',v=>{v.offen.gesperrt=7;}],
  ['menue-M-6-neuerstellung',v=>{v.seiteNach=v.seiteVor;}],
  ['menue-M-6-querformat',v=>{v.xNachRollen=false;}],
  ['menue-M-7-release',v=>{v.zweitesZurueck=f.activity;}],
]) test('Gegenprobe: '+id,()=>{
  const b=beispiele().find(x=>menueFallId(x)===id);mutate(b.messung);
  assert.equal(evaluiereMenueFall(b).status,'nicht bestanden');
});
test('Tastatur kann beim Öffnen verschwinden; zwei belegte Schritte reichen dann',()=>{
  const b=beispiele().find(x=>x.fall==='M-3');
  b.messung.offen.ime=f.imeZu;b.messung.schritte.shift();
  assert.equal(evaluiereMenueFall(b).status,'bestanden');
  b.messung.vor.ime=f.imeZu;assert.equal(evaluiereMenueFall(b).status,'ungültig');
  assert.throws(()=>imeSichtbar('mInputShown=true'),/nicht eindeutig/);
  assert.throws(()=>imeSichtbar(f.imeOffen+' mInputShown=false'),/nicht eindeutig/);
});
test('AX-Grenze gilt nur bei belegtem Android-Baum und bekannter Nichtverfügbarkeit',()=>{
  const t=tree();delete t.ax;t.axFehler='CDP -32601: method not found';
  assert.equal(evaluiereMenueBaum(t).status,'dokumentierte Grenze');
  t.axFehler='Verbindung verloren';assert.equal(evaluiereMenueBaum(t).status,'ungültig');
});
test('AX erkennt fehlenden Dialognamen, fehlendes X und bedienbaren Hintergrund',()=>{
  for (const mutate of [
    t=>{t.ax.nodes[1].name.value='anders';},
    t=>{t.ax.nodes.find(n=>n.nodeId==='x').ignored=true;},
    t=>{t.ax.nodes.push({nodeId:'feld',parentId:'root',ignored:false,role:{value:'textbox'},name:{value:'Projektname'}});},
    t=>{t.xml.push(xml([{class:'android.widget.EditText',focusable:'true',text:'Projektname'}]));},
  ]) {const t=tree();mutate(t);assert.equal(evaluiereMenueBaum(t).status,'nicht bestanden');}
});
test('Reale Speicheraufträge werden nicht durch pauschale Grenzen entschuldigt',()=>{
  const b=beispiele().find(x=>x.fall==='M-5');
  b.messung.antwortenVor=[{methode:'speichernUnter'}];
  b.messung.antwortenNach=copy(b.messung.antwortenVor);
  assert.equal(evaluiereMenueFall(b).status,'nicht bestanden');
});
test('WebView-Fläche: äußere Fläche, höchstens 4 px, keine verkettete Toleranz',()=>{
  const view=bounds=>({class:'android.webkit.WebView',bounds});
  assert.equal(webviewFlaeche(xml([view('[0,0][1080,1920]'),view('[2,2][1078,1918]')])).r,1080);
  assert.throws(()=>webviewFlaeche(xml([view('[0,0][1080,1920]'),view('[3,3][1080,1920]'),view('[6,6][1080,1920]')])),/nicht eindeutig/);
  assert.throws(()=>webviewFlaeche(xml([view('[0,0][0,0]')])),/nicht eindeutig/);
  assert.deepEqual(bildPunkt({x:10,y:20,width:400,height:800},{l:0,o:50,r:800,u:1650}),{x:20,y:90});
  assert.throws(()=>bildPunkt({x:500,y:20,width:400,height:800},{l:0,o:50,r:800,u:1650}),/außerhalb/);
  assert.throws(()=>bildPunkt({x:10,y:20,width:400,height:800},{l:0,o:50,r:800,u:1000}),/maßstab/);
});
test('Navigation wird vollständig wiederhergestellt und nachgemessen',async()=>{
  const liste='[ ] com.android.internal.systemui.navbar.gestural\n[x] com.android.internal.systemui.navbar.threebutton';
  const cmds=[],prev={liste:navOverlays(liste),modus:'0'};
  const ctx={shell:async c=>{cmds.push(c);return c.includes('list')?liste:c.startsWith('settings get')?'0':'';},sleep:async()=>{},save:()=>{}};
  await navigationZurueck(ctx,prev);
  assert.ok(cmds.includes('cmd overlay disable --user 0 com.android.internal.systemui.navbar.gestural'));
  assert.ok(cmds.includes('cmd overlay enable --user 0 com.android.internal.systemui.navbar.threebutton'));
  await assert.rejects(()=>navigationZurueck(ctx,{...prev,modus:'2'}),/nicht wiederhergestellt/);
});
function navigationsProbe({geschlossen=false,neu=false,projektverlust=false,unruhig=false}={}) {
  const aufrufe=[],belege={},overlays='[x] com.android.internal.systemui.navbar.gestural\n[ ] com.android.internal.systemui.navbar.threebutton';
  let gewechselt=false,verbunden=0,proben=0;
  const c={pageId:'alt',pid:'123',evaluate:async()=>{
    if(gewechselt&&geschlossen&&!verbunden)throw Error('CDP-Verbindung geschlossen');
    return {zeit:gewechselt&&neu?2:1,bereit:true,width:400,height:gewechselt?790:800,knopf:{x:350,y:20,width:48,height:48}};
  }};
  const s={c,zustand:async()=>({gespeicherterText:gewechselt&&projektverlust?'{}':f.projekt}),verbinden:async neue=>{
    assert.equal(neue,true);verbunden++;c.pageId=neu?'neu':'alt';aufrufe.push('verbinden');
  }};
  const ctx={app:APP,save:async(k,v)=>{belege[k]=copy(v);},sleep:async ms=>aufrufe.push('warten '+ms),shell:async befehl=>{
    aufrufe.push(befehl);
    if(befehl.startsWith('cmd overlay enable-exclusive')){gewechselt=true;return '';}
    if(befehl==='cmd overlay list --user 0')return overlays;
    if(befehl==='settings get secure navigation_mode')return '2';
    if(befehl==='dumpsys activity top')return 'ACTIVITY com.android.launcher3/.Launcher 0 pid=1\n Local Activity 000 State:\n'
      +'ACTIVITY '+APP+'/.MainActivity 1 pid=123\n Local Activity '+(gewechselt&&neu?'def':'abc')+' State:';
    if(befehl==='dumpsys activity activities'){
      if(gewechselt)proben++;
      return 'mResumedActivity: ActivityRecord{'+(unruhig&&gewechselt?proben:'123')+' u0 '+APP+'/.MainActivity t1}';
    }
    throw Error('Unerwarteter Befehl: '+befehl);
  }};
  return {ctx,s,aufrufe,belege,get verbunden(){return verbunden;}};
}
test('Gestenmodus wartet auf stabile App und verbindet eine geschlossene CDP-Seite neu',async()=>{
  const p=navigationsProbe({geschlossen:true,neu:true});
  const b=await gestenNavigation(p.ctx,p.s,'menue/geste');
  assert.equal(p.verbunden,1);assert.equal(b.seiteNeu,true);assert.equal(b.activityNeu,true);
  assert.equal(b.nach.projekt,f.projekt);assert.equal(b.nach.pageId,'neu');
  assert.equal(b.beobachtungen.filter(x=>x.seite).length,3);
  assert.equal(p.aufrufe[p.aufrufe.findIndex(c=>c.startsWith('cmd overlay enable-exclusive'))+1],'warten 1500');
  assert.equal(p.belege['menue/geste-navigation-stabil.json'].neuverbindungen[0].grund,'CDP-Verbindung geschlossen');
  assert.ok(!p.aufrufe.some(c=>c.startsWith('input ')));
});
test('Neue Seite bei weiter erreichbarer CDP-Verbindung wird neu angebunden',async()=>{
  const p=navigationsProbe({neu:true}),b=await gestenNavigation(p.ctx,p.s,'menue/geste');
  assert.equal(p.verbunden,1);assert.equal(b.neuverbindungen[0].grund,'Neue Seite');
  assert.equal(b.beobachtungen.length,4);
});
test('Stabiler Navigationswechsel braucht keine neue CDP-Verbindung und verschweigt keinen Projektverlust',async()=>{
  const p=navigationsProbe(),b=await gestenNavigation(p.ctx,p.s,'menue/geste');
  assert.equal(p.verbunden,0);assert.equal(b.activityNeu,false);assert.equal(b.seiteNeu,false);
  const verloren=navigationsProbe({projektverlust:true});
  await assert.rejects(()=>gestenNavigation(verloren.ctx,verloren.s,'menue/geste'),/Projektstand nach Navigationswechsel verändert/);
  assert.equal(verloren.belege['menue/geste-navigation-stabil.json'].nach.projekt,'{}');
});
test('Unruhiger Navigationswechsel bricht mit Beleg ab und führt keinen Tipp aus',async()=>{
  const p=navigationsProbe({unruhig:true});
  await assert.rejects(()=>gestenNavigation(p.ctx,p.s,'menue/geste'),/Messfrist/);
  assert.equal(p.belege['menue/geste-navigation-stabil.json'].beobachtungen.length,16);
  assert.ok(!p.aufrufe.some(c=>c.startsWith('input ')));
});
test('Menüöffnung braucht ein sichtbares Sheet mit Fläche und acht Aktionen vor der Randgeste',async()=>{
  const ctx={sleep:async()=>{}},offen=m(),zu=m({hidden:true}),leer=m({sheet:{width:0,height:0}}),weniger=m({anzahl:7});
  const folge=[zu,leer,weniger,offen];let abfrage=0;
  const ist=await menueOeffnungBestaetigen(ctx,{evaluate:async()=>folge[abfrage++]});
  assert.equal(ist,offen);assert.equal(abfrage,4);
  await assert.rejects(()=>menueOeffnungBestaetigen(ctx,{evaluate:async()=>leer}),/Messfrist/);
});
test('Projektname wird über DOM und äußere WebView-Fläche getippt, unabhängig vom nativen Feldtext',async()=>{
  const taps=[],saved=[];
  const el={scrollIntoView:()=>{},getBoundingClientRect:()=>({x:20,y:60,width:180,height:40}),contains:hit=>hit===el};
  const doc={querySelector:s=>{assert.equal(s,'#schedule-form [name="projektname"]');return el;},elementFromPoint:()=>el};
  const ctx={uiBaum:async()=>xml([{class:'android.webkit.WebView',bounds:'[0,50][400,850]'},
    {class:'android.webkit.WebView',bounds:'[2,52][398,848]'},{class:'android.widget.EditText',text:'unlesbarer Feldtext'}]),
    save:async(k,v)=>saved.push(v),shell:async c=>taps.push(c),sleep:async()=>{}};
  await menueTipp(ctx,{evaluate:async js=>runInNewContext(js,{document:doc,innerWidth:400,innerHeight:800})},'eingabe','eingabe');
  assert.deepEqual(taps,['input tap 110 130']);assert.equal(saved[0].ziel,'eingabe');assert.equal(saved[0].webview.l,0);
});
test('Menü verwendet die Dateiphasenbausteine und tippt über DOM und WebView',async()=>{
  for(const n of ['exportieren','teilen','importieren']) assert.equal(MenueSitzung.prototype[n],Sitzung.prototype[n]);
  const taps=[],cdp=[];
  const ctx={uiBaum:async()=>xml([{class:'android.webkit.WebView',bounds:'[0,0][400,800]'}]),save:()=>{},shell:async c=>taps.push(c),sleep:async()=>{}};
  const c={evaluate:async js=>{cdp.push(js);return {x:350,y:30,width:400,height:800};}};
  const s=new MenueSitzung(ctx,{},'debug','probe',{});s.c=c;s.key='test';
  await s.klick('open-json');
  assert.equal(taps.length,2);assert.ok(taps.every(t=>t==='input tap 350 30'));
  assert.match(cdp[1],/Projekt importieren/);assert.ok(cdp.every(s=>!s.includes('.click()')));
});
test('menue ist in alle; benötigt keine Gradle-Variante; API 24 wird abgelehnt',()=>{
  for(const api of [30,36]) {
    const args=a=>['--api',String(api),'--ablauf',a,'--ausgabe',join(repo,'scratchpad/paket-2.6/m3/argument-test'),'--nur-argumente'];
    assert.deepEqual(argumente(args('menue'),repo).phasen,['menue']);
    assert.ok(argumente(args('alle'),repo).phasen.includes('menue'));
    assert.deepEqual(variantePlan(['menue']),[]);
  }
  assert.throws(()=>argumente(['--api','24','--ablauf','menue','--ausgabe',join(tmp,'menu')],repo),/nicht vorgesehen/);
});
test('Neuauswertung verlangt Rohfall, Prüfsummen, Fallkopie und aktuelle API',async t=>{
  const dir=mkdtempSync(join(tmp,'menue-auswertung-'));
  t.after(()=>{assert.equal(dirname(dir),resolve(tmp));rmSync(dir,{recursive:true,force:true});});
  mkdirSync(join(dir,'menue'));
  const b=beispiele()[0],pfad='menue/m-1-schrift-1-roh.json',roh=JSON.stringify(b);
  writeFileSync(join(dir,pfad),roh);
  b.belege=[{pfad,sha256:hash(Buffer.from(roh))}];
  const daten={schema:1,api:30,faelle:[b]};
  const save=()=>writeFileSync(join(dir,'menue-roh.json'),JSON.stringify(daten));
  save();
  assert.equal((await werteMenueAus(dir,30))[1].status,'bestanden');
  b.messung.oben.dokumentBreite=900;save();
  assert.equal((await werteMenueAus(dir,30))[1].status,'ungültig');
  daten.faelle[0]=JSON.parse(roh);daten.faelle[0].belege=b.belege;save();
  writeFileSync(join(dir,pfad),'{}');
  assert.equal((await werteMenueAus(dir,30))[1].status,'ungültig');
  daten.faelle[0].belege=[{pfad:'../fremd',sha256:'a'.repeat(64)}];save();
  assert.equal((await werteMenueAus(dir,30))[1].status,'ungültig');
});
test('Hauptauswertung ersetzt grüne Altmeldung bei fehlenden Menürohbelegen',async t=>{
  const dir=mkdtempSync(join(tmp,'menue-neu-'));
  t.after(()=>{assert.equal(dirname(dir),resolve(tmp));rmSync(dir,{recursive:true,force:true});});
  writeFileSync(join(dir,'ergebnis.json'),JSON.stringify({auswahl:{api:30,phasen:['menue']},befund:[{id:'menue-M-2-x',status:'bestanden',grund:'Alt'}]}));
  const a=await werteLaufAus(dir);
  assert.equal(a.nachher.befund.find(b=>b.id==='menue-M-2-x').status,'ungültig');
  assert.equal(a.nachher.befund.find(b=>b.id==='menue-abdeckung').status,'ungültig');
  assert.equal(a.nachher.code,2);
});

function inhaltProbe({tag='H2',type='',sw=100,cw=100,right=100,rolle=null}={}) {
  const element={tagName:tag,type,name:'probe',id:'',className:'',textContent:'Langes Wort',scrollWidth:sw,clientWidth:cw,
    getBoundingClientRect:()=>({x:0,y:0,width:right,height:20,right,bottom:20}),getClientRects:()=>[{}],closest:()=>rolle};
  const btn={...element,textContent:'Projekt speichern unter',disabled:false};
  const last={...btn,textContent:'Neues Projekt'};
  const liste={clientHeight:100,scrollHeight:100,scrollTop:0,querySelectorAll:()=>[btn,last]};
  const sheet={...element,contains:()=>false,classList:{contains:()=>false},querySelector:s=>s==='[role="region"]'?liste:s==='.fr-menue-sperre'?{hidden:true}:btn};
  const overlay={hidden:true,querySelector:()=>sheet};
  const doc={body:{querySelectorAll:()=>[element]},documentElement:{scrollWidth:412},activeElement:null,querySelector:s=>s==='.fr-menue-overlay'?overlay:btn};
  return runInNewContext(MESSUNG,{document:doc,window:{visualViewport:null},innerWidth:412,innerHeight:800,scrollY:0,
    getComputedStyle:()=>({visibility:'visible',fontSize:'16px'})}).abgeschnitten;
}
test('Inhaltsmessung toleriert Pixelrundung, erkennt aber gekappte Überschriften',()=>{
  assert.equal(inhaltProbe({right:412.19,sw:413,cw:412}).length,0);
  assert.equal(inhaltProbe({right:414}).length,1);
  assert.equal(inhaltProbe({sw:120,cw:100}).length,1);
  for(const type of ['text','search','email','tel','url','number','password'])
    assert.equal(inhaltProbe({tag:'INPUT',type,sw:120,cw:100}).length,0,type);
  assert.equal(inhaltProbe({tag:'TEXTAREA',sw:120,cw:100}).length,0);
  for(const type of ['date','checkbox','button'])
    assert.equal(inhaltProbe({tag:'INPUT',type,sw:120,cw:100}).length,1,type);
  assert.equal(inhaltProbe({tag:'SELECT',sw:120,cw:100}).length,1);
  assert.equal(inhaltProbe({tag:'INPUT',type:'text',right:414,sw:120,cw:100}).length,1);
  assert.equal(inhaltProbe({rolle:{},right:500,sw:500,cw:100}).length,0);
});

for(const kennung of [
  {text:'Dateiaktionen',class:'android.widget.Button'},
  {text:'Dateiaktionen',class:'android.widget.Spinner'},
  {'content-desc':'Dateiaktionen',class:'android.widget.Button'},
  {'content-desc':'Dateiaktionen',class:'beliebige.Klasse'},
]) test('Release wartet auf '+JSON.stringify(kennung)+' ohne CDP',async t=>{
  const dir=mkdtempSync(join(tmp,'menue-release-'));
  t.after(()=>{assert.equal(dirname(dir),resolve(tmp));rmSync(dir,{recursive:true,force:true});});
  const apk=join(dir,'probe.apk');writeFileSync(apk,'Konstruierte APK-Kopie; kein Android-Build');
  const calls=[],offen=beispiele().find(b=>b.fall==='M-7').messung.offenXml;
  let back=0,suche=0;
  const ctx={app:APP,release:apk,uninstall:async()=>calls.push('uninstall'),install:async()=>calls.push('install'),
    start:async()=>calls.push('start'),sleep:async()=>{},save:()=>{},shot:async()=>{},cdp:()=>{throw Error('CDP darf nicht verwendet werden');},
    uiBaum:async name=>name.endsWith('-offen')?offen:name.includes('-suchen-')&&++suche<3?xml([]):xml([kennung]),
    shell:async c=>{calls.push(c);if(c.startsWith('dumpsys package'))return f.paket;if(c==='input keyevent KEYCODE_BACK')back++;
      if(c==='dumpsys activity activities')return back===1?f.activity:f.launcher;return '';}};
  const m=await menueRelease(ctx,'menue/release',async()=>{calls.push('signieren');return apk;});
  assert.equal(evaluiereMenueFall(fall('M-7','release',m)).status,'bestanden');
  assert.deepEqual(calls.slice(0,4),['uninstall','signieren','install','start']);
  assert.equal(back,2);assert.equal(suche,3);assert.equal(calls.filter(c=>c==='input tap 50 50').length,1);
});

test('Dateideskriptor und gezogene Rohbytes müssen auch bei passenden Inventarhashes übereinstimmen',async t=>{
  const dir=mkdtempSync(join(tmp,'menue-bytevergleich-'));
  t.after(()=>{assert.equal(dirname(dir),resolve(tmp));rmSync(dir,{recursive:true,force:true});});
  mkdirSync(join(dir,'menue'));
  const b=beispiele().find(x=>x.fall==='M-4'&&x.name==='speichern');
  writeFileSync(join(dir,'test.bin'),'{}');
  b.messung.sheet.ziel.datei='test.bin';
  const pfad='menue/m-4-speichern-roh.json',roh=JSON.stringify(b);
  writeFileSync(join(dir,pfad),roh);
  b.belege=[{pfad,sha256:hash(Buffer.from(roh))},{pfad:'test.bin',sha256:hash(Buffer.from('{}'))}];
  writeFileSync(join(dir,'menue-roh.json'),JSON.stringify({schema:1,api:30,faelle:[b]}));
  const r=await werteMenueAus(dir,30);
  assert.equal(r[1].status,'ungültig');assert.match(r[1].grund,/Rohbytes/);
});
test('Beschädigte Fallliste endet als ungültig und wirft nicht aus der Neuauswertung',()=>{
  assert.equal(menueAbdeckung({schema:1,api:30,faelle:[null]}).status,'ungültig');
});

test('Release braucht App-Knoten nach Zurück und eine unveränderte Eingabe-APK',()=>{
  for (const mutate of [
    v=>{v.zuXml='<hierarchy></hierarchy>';},
    v=>{v.offenXml=v.offenXml.replaceAll(APP,'com.android.documentsui');},
    v=>{v.eingangNachherSha256='c'.repeat(64);},
  ]) {const b=beispiele().find(x=>x.fall==='M-7');mutate(b.messung);assert.equal(evaluiereMenueFall(b).status,'nicht bestanden');}
});
