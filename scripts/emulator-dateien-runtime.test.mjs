// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dateien, Sitzung, gepolsterteProjektdatei, neueDownloads, altereFreigabe, dateiDeskriptor, projektWerte, dokumentMetadaten, festeUhr } from './emulator/dateien.mjs';
import { knoten, flaeche, fokusRichtung, tippe, warte, oben, wurzel, zeileOeffnen, nativeSchaltflaeche, brueckenHaken, ausgabeReferenz, FORMATE } from './emulator/dateien-ui.mjs';
import { evaluiereDateiFall, dateiFallId } from './emulator/dateien-auswertung.mjs';

const xml = (...nodes) => `<?xml version='1.0'?><hierarchy rotation="0">${nodes.map(n => `<node ${Object.entries(n).map(([k,v]) => `${k}="${String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ')}/>`).join('')}</hierarchy>`;
const node = (text, bounds = '[10,20][210,80]', extra = {}) => ({ text, bounds, enabled: 'true', package: 'com.android.documentsui', ...extra });
const row = (name, focus = true, y = 80) => [node('', `[0,${y}][400,${y+80}]`, { focused: String(focus), 'resource-id': 'com.android.documentsui:id/item_root' }), node(name, `[20,${y+10}][300,${y+60}]`, { 'resource-id': 'android:id/title' })];
const mini = Buffer.from('{"version":1,"input":{"projekt":{"projektname":"ä € 😀"}}}');

test('Grenzproben zählen Bytes einschließlich mehrbyteigem UTF-8', () => {
  for (const bytes of [1_048_576, 1_048_577]) {
    const b = gepolsterteProjektdatei(mini, bytes);
    assert.equal(b.length, bytes);
    assert.deepEqual(JSON.parse(b.toString()), JSON.parse(mini.toString()));
    assert.ok(b.toString().length < bytes);
  }
});
test('Grenzproben verwerfen ungültige Größen, JSON und UTF-8', () => {
  for (const n of [-1, 3, NaN, 1048578, 2.2]) assert.throws(() => gepolsterteProjektdatei(mini, n));
  assert.throws(() => gepolsterteProjektdatei(Buffer.from('{'), 100));
  assert.throws(() => gepolsterteProjektdatei(Buffer.from([0xc3,0x28]), 100));
});
test('Download-Differenz schont alte Dateien und erkennt mehrere neue', () => {
  assert.deepEqual(neueDownloads(['alt.json', 'plan.xlsx'], ['plan.xlsx', 'neu.json', 'neu (1).json', 'alt.json']), ['neu.json', 'neu (1).json']);
  for (const n of ['../x', 'a\\b', '..', 'a\nb', '/x']) assert.throws(() => neueDownloads([], [n]));
});
test('Freigabenalterung verändert nur genau eine bekannte Kennung', () => {
  const id = '12345678-1234-1234-1234-123456789012';
  const old = `<map><long name="${id}" value="123456" /><long name="sonstige" value="987" /></map>`;
  assert.equal(altereFreigabe(old, id, 123), old.replace('123456"', '123"'));
  assert.throws(() => altereFreigabe(old + old, id, 123));
  assert.throws(() => altereFreigabe(old, 'pfad/..', 123));
  assert.throws(() => altereFreigabe(old, id, 0));
});
test('Formularwerte und Speicher werden getrennt auf Projektwerte abgebildet', () => {
  const f = { projektname: 'Probe', kunde: 'Ä', vergabenummer: 'P-1', bekanntmachung: '2026-10-01', bundesland: 'BE' };
  const p = { projekt: { projektname: f.projektname, kunde: f.kunde, vergabenummer: f.vergabenummer }, bekanntmachung: f.bekanntmachung, bundesland: f.bundesland };
  assert.deepEqual(projektWerte(f, { formular:true }), projektWerte(p));
  assert.deepEqual(projektWerte({ projekt:{} }, { nurKopf:true }), { kunde:'',projektname:'',vergabenummer:'' });
  assert.notDeepEqual(projektWerte({ ...f, projektname:'falsch' }, { formular:true }), projektWerte(p));
});
test('Metadaten stammen aus eindeutiger Providerzeile mit exaktem Dateinamen', () => {
  assert.deepEqual(dokumentMetadaten('Row: 0 _display_name=Probe (1).json, mime_type=application/json, _size=42', 'Probe (1).json'), {name:'Probe (1).json',mime:'application/json',bytes:42});
  assert.throws(() => dokumentMetadaten('No result found.', 'Probe.json'));
  assert.throws(() => dokumentMetadaten('Row: 0 _display_name=Probe.json, mime_type=application/json, _size=null', 'Probe.json'));
  assert.throws(() => dokumentMetadaten('Row: 0 _display_name=Probe.json, mime_type=application/json, _size=42', 'falsch.json'));
});
test('Dateideskriptor enthält kontrollierbare Rohbytes statt Erfolgsbehauptung', () => {
  const d = dateiDeskriptor(mini, 'probe.json', FORMATE.json.mime, 'bruecke', 'dateien/probe.json');
  assert.equal(d.bytes, mini.length); assert.equal(Buffer.from(d.base64,'base64').compare(mini), 0); assert.match(d.sha256, /^[a-f0-9]{64}$/);
  const fall = { schema:1,fall:'D1',name:'json',format:'json',variante:'debug',umgebung:{picker:true},belege:['dateien/probe.json'],referenz:d,ziel:{...d,mime:'application/json'} };
  assert.equal(evaluiereDateiFall(fall).status,'bestanden');
  assert.equal(evaluiereDateiFall({...fall,ziel:{...d,sha256:'0'.repeat(64)}}).status,'ungültig');
});
test('Feste externe Uhr lässt Konstruktion mit Argumenten sowie parse/UTC erhalten', () => {
  const context = vm.createContext({}); vm.runInContext('window=this', context);
  const iso = '2026-10-01T12:34:56.000Z';
  const result = vm.runInContext(`(${festeUhr.toString()})(${JSON.stringify(iso)})`, context);
  assert.equal(result.iso, iso);
  assert.equal(vm.runInContext('Date.now()',context), Date.parse(iso));
  assert.equal(vm.runInContext('new Date(2000,0,1).getFullYear()',context),2000);
  assert.equal(vm.runInContext('Date.UTC(2000,0,1)',context),Date.UTC(2000,0,1));
  vm.runInContext(`(${festeUhr.toString()})('2026-10-02T00:00:00Z')`,context);
  assert.equal(vm.runInContext('new Date().toISOString()',context),'2026-10-02T00:00:00.000Z');
});
test('Brückenhaken beobachtet echte Calls und dedupliziert zwei Rückkanäle', () => {
  const calls=[], replies=[];
  const context = vm.createContext({ Capacitor:{toNative(...a){calls.push(a); return 42;},fromNative(r){replies.push(r);}}, androidBridge:{onmessage(){} }});
  vm.runInContext('window=this',context);
  assert.equal(vm.runInContext(`(${brueckenHaken.toString()})()`,context),'gesetzt');
  assert.equal(vm.runInContext(`(${brueckenHaken.toString()})()`,context),'vorhanden');
  assert.equal(vm.runInContext(`Capacitor.toNative('Dateiablauf','ausgabeBlock',{auftragId:'id',base64:'eA=='})`,context),42);
  const response={pluginId:'Dateiablauf',methodName:'ausgabeBeginnen',callbackId:'1',success:true,data:{auftragId:'id'}};
  vm.runInContext(`Capacitor.fromNative(${JSON.stringify(response)}); androidBridge.onmessage({data:${JSON.stringify(JSON.stringify(response))}})`,context);
  assert.equal(calls.length,1);assert.equal(replies.length,1);
  assert.equal(vm.runInContext('__dateien.antworten.length',context),1);
  vm.runInContext('Object.assign(__dateien,{aufrufe:[],antworten:[],bloecke:{},gesehen:{}})',context);
  vm.runInContext(`Capacitor.toNative('Dateiablauf','ausgabeBlock',{auftragId:'neu',base64:'eQ=='})`,context);
  assert.equal(vm.runInContext('__dateien.aufrufe.length',context),1);
});
test('Referenz dekodiert Blöcke einzeln, einschließlich Base64-Padding', () => {
  const z={bruecke:{aufrufe:[{methode:'ausgabeBeginnen',optionen:{name:'p.json',mime:FORMATE.json.mime,anzahlBytes:3}}],antworten:[{methode:'ausgabeBeginnen',success:true,data:{auftragId:'id'}}],bloecke:{id:['YQ==','YmM=']}}};
  assert.equal(ausgabeReferenz(z).bytes.toString(),'abc');
  assert.throws(() => ausgabeReferenz({...z,bruecke:{...z.bruecke,bloecke:{id:['YQ=']}}}));
  assert.throws(() => ausgabeReferenz({...z,bruecke:{...z.bruecke,bloecke:{id:['YQ==']}}}));
  assert.throws(() => ausgabeReferenz(z,1));
});
test('Ansichtsattribute dekodieren Entities und lehnen unvollständige Bäume ab', () => {
  assert.equal(knoten(xml(node('ä " & <')))[0].text,'ä " & <');
  assert.throws(()=>knoten('<hierarchy><node/>'));
  assert.throws(()=>knoten('<!DOCTYPE x><hierarchy></hierarchy>'));
  assert.throws(()=>knoten('<hierarchy><node text="x" text="y"/></hierarchy>'));
  assert.equal(flaeche({bounds:'[0,0][0,0]'}),null);
  assert.deepEqual(flaeche(node('x')), {l:10,o:20,r:210,u:80,x:110,y:50});
});
test('Fokusöffnung verlangt Item-Root-Fläche passend zum sichtbaren Titel', () => {
  assert.equal(fokusRichtung(row('probe.json'),'probe.json'),'KEYCODE_ENTER');
  assert.equal(fokusRichtung([...row('anderes.json',true,200),...row('probe.json',false,80)],'probe.json'),'KEYCODE_DPAD_UP');
  assert.equal(fokusRichtung([...row('anderes.json',true,80),...row('probe.json',false,200)],'probe.json'),'KEYCODE_DPAD_DOWN');
  assert.equal(fokusRichtung([node('probe.json','[0,0][0,0]'),node('','[0,0][400,100]',{focused:'true','resource-id':'a:id/item_root'})],'probe.json'),'KEYCODE_DPAD_DOWN');
  // Fokussierte Zeile ohne Fläche liegt unter der Navigationsleiste: bei sichtbarem Titel zurück, sonst ans Ende.
  assert.equal(fokusRichtung([...row('probe.json',false,200),node('','[0,0][0,0]',{focused:'true','resource-id':'a:id/item_root'})],'probe.json'),'KEYCODE_DPAD_UP');
  assert.equal(fokusRichtung([...row('anderes.json',false,200),node('','[0,0][0,0]',{focused:'true','resource-id':'a:id/item_root'})],'probe.json'),'KEYCODE_DPAD_DOWN');
  assert.equal(fokusRichtung([...row('anderes.json',false,200)],'probe.json'),'KEYCODE_DPAD_DOWN');
});
test('Ansichtsbaum liest auch einfach angeführte Werte mit doppelten Anführungszeichen', () => {
  const alle = knoten(`<hierarchy><node text='Schema "999"' resource-id="import-message" bounds="[0,0][10,10]" /></hierarchy>`);
  assert.equal(alle[0].text, 'Schema "999"');
  assert.equal(alle[0]['resource-id'], 'import-message');
});
test('Tippen arbeitet nur mit sichtbarem freigegebenem Ziel', async () => {
  const commands=[],ctx={shell:async s=>commands.push(s)};
  await tippe(ctx,node('Save'));
  assert.deepEqual(commands,['input tap 110 50']);
  await assert.rejects(tippe(ctx,node('Save',undefined,{enabled:'false'})));
  await assert.rejects(tippe(ctx,node('Save','[0,0][0,0]')));
});
test('Warten ist endlich und leitet Fehler weiter', async () => {
  let n=0;assert.equal(await warte({sleep:async()=>{}},()=>++n===3?'ja':null,4),'ja');
  await assert.rejects(warte({sleep:async()=>{}},()=>null,2),/Messfrist/);
  await assert.rejects(warte({sleep:async()=>{}},()=>{throw Error('Abbruch');}),/Abbruch/);
});
test('Activitybeobachtung braucht Resumed-Zeile',async()=>{
  assert.match(await oben({shell:async()=> 'x\n mResumedActivity: ActivityRecord{ p/.Main }\n'}),/mResumedActivity/);
  let aufrufe=0;
  await assert.rejects(oben({shell:async()=>{aufrufe++;return 'keine Activity';}}));
  assert.equal(aufrufe,5);
  // Während eines Activity-Wechsels fehlt die Zeile kurz; der zweite Versuch liest sie.
  let n=0;
  assert.match(await oben({shell:async()=> ++n<2?'':' mResumedActivity: ActivityRecord{ p/.Main }',sleep:async()=>{}}),/mResumedActivity/);
});
test('Wurzelauswahl tippt den Drawer-Titel, nicht die gleichnamige Toolbar',async()=>{
  const commands=[],root=node('',undefined,{'content-desc':'Show roots'});
  const drawer=xml(node('Downloads','[10,20][210,80]',{'resource-id':'toolbar'}),node('Downloads','[10,200][210,260]',{'resource-id':'android:id/title'}));
  const ctx={shell:async s=>commands.push(s),sleep:async()=>{},uiBaum:async n=>n.endsWith('-wurzeln')?drawer:xml(node('Datei'))};
  await wurzel(ctx,xml(root),'probe','Downloads');
  assert.deepEqual(commands,['input tap 110 50','input tap 110 230']);
});
test('Listenzeile wird mit Enter statt Tap geöffnet; Ordner dürfen Auswahl offenlassen',async()=>{
  const commands=[],bilder=[],ctx={shell:async s=>{commands.push(s);return 'mResumedActivity: ActivityRecord{ p/.Main }';},sleep:async()=>{},uiBaum:async()=>xml(...row('probe.json')),shot:async n=>bilder.push(n),save:async()=>{}};
  await zeileOeffnen(ctx,'probe','probe.json',xml(...row('probe.json')));
  assert.equal(commands.filter(s=>s.includes('KEYCODE_ENTER')).length,1);assert.equal(commands.filter(s=>s.startsWith('input tap')).length,0);
  assert.ok(bilder.includes('probe-fokus.png'));
  commands.length=0;
  await zeileOeffnen(ctx,'probe','probe.json',xml(...row('probe.json')),{schliessen:false});
  assert.ok(!commands.includes('dumpsys activity activities'));
});
// Verdeckter Fokus am Listenende (Fläche [0,0][0,0]) ohne sichtbaren Titel: weiter nach unten,
// bei unverändertem Baum abwechselnd Ende und Pos1, nach 80 Schritten Abbruch ohne Enter.
const verdeckt=()=>xml(...row('anderes.json',false,200),node('','[0,0][0,0]',{focused:'true','resource-id':'com.android.documentsui:id/item_root'}));
test('Stillstand am Listenende wechselt zwischen Ende und Pos1 und endet nach 80 Schritten ohne Enter',async()=>{
  const commands=[],ctx={shell:async s=>{commands.push(s);return '';},sleep:async()=>{},uiBaum:async()=>verdeckt(),shot:async()=>{},save:async()=>{}};
  await assert.rejects(zeileOeffnen(ctx,'probe','probe.json',verdeckt(),{schliessen:false}),/nicht eindeutig fokussieren/);
  const tasten=commands.filter(s=>s.startsWith('input keyevent ')).map(s=>s.slice('input keyevent '.length));
  assert.equal(tasten[0],'KEYCODE_MOVE_HOME');
  assert.equal(tasten.length,81);
  assert.deepEqual(tasten.slice(1,5),['KEYCODE_DPAD_DOWN','KEYCODE_DPAD_DOWN','KEYCODE_MOVE_END','KEYCODE_MOVE_HOME']);
  assert.ok(tasten.filter(t=>t==='KEYCODE_MOVE_END').length>=39);
  assert.ok(!tasten.includes('KEYCODE_ENTER'));
  assert.equal(commands.filter(s=>s.startsWith('input tap')).length,0);
});
test('Nach dem Stillstand öffnet ein veränderter Baum mit passendem Fokus die Zeile',async()=>{
  let abzug=0;
  const commands=[],ctx={shell:async s=>{commands.push(s);return '';},sleep:async()=>{},uiBaum:async()=>(++abzug<=4?verdeckt():xml(...row('probe.json'))),shot:async()=>{},save:async()=>{}};
  await zeileOeffnen(ctx,'probe','probe.json',verdeckt(),{schliessen:false});
  const tasten=commands.filter(s=>s.startsWith('input keyevent ')).map(s=>s.slice('input keyevent '.length));
  assert.deepEqual(tasten,['KEYCODE_MOVE_HOME','KEYCODE_DPAD_DOWN','KEYCODE_DPAD_DOWN','KEYCODE_MOVE_END','KEYCODE_MOVE_HOME','KEYCODE_ENTER']);
});
test('Empfänger-Schaltfläche wird gescrollt gesucht und exakt getroffen',async()=>{
  let n=0;const commands=[],ctx={uiBaum:async()=>xml(node(n++?'Dateiprobe':'Andere','[0,0][500,1000]')),shell:async s=>commands.push(s),sleep:async()=>{}};
  await nativeSchaltflaeche(ctx,'probe','Dateiprobe',undefined,{scroll:true});
  assert.ok(commands[0].startsWith('input swipe ')); assert.ok(commands.at(-1).startsWith('input tap '));
});
test('Fallaufzeichnung nutzt gemeinsame Kennung, leert die History und hält Fehler ungültig',async()=>{
  const saves=[],befunde=[],aufrufe=[],ctx={save:async(n,v)=>saves.push([n,v]),befund:(n,v)=>befunde.push([n,v]),stop:async()=>aufrufe.push('stop'),start:async()=>aufrufe.push('start'),shot:async()=>{},uiBaum:async()=>xml()};
  const s=new Sitzung(ctx,{faelle:[]},'debug','probe',{storage:'k'});
  s.c={evaluate:async str=>aufrufe.push(str)};s.verbinden=async()=>aufrufe.push('verbinden');
  const d=dateiDeskriptor(mini,'p.json',FORMATE.json.mime,'bruecke');
  const m=await s.rohFall('D1','json',async()=>({umgebung:{picker:true},referenz:d,ziel:d}),{format:'json'});
  assert.equal(befunde[0][0],dateiFallId(m));assert.equal(befunde[0][1].status,'bestanden');
  assert.ok(aufrufe[0].includes('p.antworten.length=0'));
  const f=await s.rohFall('D1','kaputt',async()=>{throw Error('Picker fehlt');},{format:'json'});
  assert.equal(f.fehler,'Picker fehlt');assert.equal(befunde.at(-1)[1].status,'ungültig');assert.deepEqual(aufrufe.slice(-3),['stop','start','verbinden']);
  assert.ok(saves.some(([n])=>n==='dateien-roh.json'));
});
test('Lauf verweigert unpassende API und fehlende Testumgebung vor Installation',async()=>{
  await assert.rejects(dateien({api:24}),/API 30 oder 36/);
  await assert.rejects(dateien({api:30,varianten:{}}),/Testempfänger/);
});
test('Speichern wartet nach einem früheren Erfolg auf den neuen Streamabschluss',async()=>{
  const picker=xml(node('',undefined,{'content-desc':'Show roots'}),node('probe.json',undefined,{class:'android.widget.EditText'}),node('Save',undefined,{class:'android.widget.Button'}));
  const roots=xml(node('Downloads',undefined,{'resource-id':'android:id/title'}));
  const ctx={app:'de.baremos.fristenrechner',save:async()=>{},shot:async()=>{},sleep:async()=>{},shell:async()=> 'mResumedActivity: ActivityRecord{ de.baremos.fristenrechner/.MainActivity }',uiBaum:async n=>n.endsWith('-wurzeln')?roots:picker};
  const s=new Sitzung(ctx,{faelle:[]},'debug','probe',{});s.uhr={tag:'2026-10-01'};s.zeit='2026-10-01T00:00:00Z';
  let polls=0,geholt=false;
  s.zustand=async()=>({aktionenFrei:true,bruecke:{aufrufe:[],antworten:Array.from({length:++polls<3?1:2},()=>({methode:'speichernUnter',data:{status:'ok'}}))}});
  s.downloads=async()=>[];s.klick=async()=>{};
  s.referenz=async()=>dateiDeskriptor(mini,'probe.json',FORMATE.json.mime,'bruecke','dateien/referenz.json');
  s.holen=async()=>{assert.ok(polls>=3,'alter Erfolgsbeleg darf das Ziehen nicht freigeben');geholt=true;return dateiDeskriptor(mini,'probe.json','application/json',null,'dateien/ziel.json');};
  const m=await s.exportieren('json','dateien/probe');
  assert.equal(geholt,true);assert.equal(m.ziel.sha256,m.referenz.sha256);
});
test('Speichern merkt bei einem Fehler schon erzeugte Dateien für das Aufräumen',async()=>{
  const ctx={dateienDateien:new Set()};
  const s=new Sitzung(ctx,{faelle:[]},'debug','probe',{});
  let n=0;s.downloads=async()=>n++?['alt.json','probe.json']:['alt.json'];
  s.zustand=async()=>({bruecke:{aufrufe:[],antworten:[]}});s.klick=async()=>{throw Error('unterbrochen');};
  await assert.rejects(s.exportieren('json','dateien/probe'),/unterbrochen/);
  assert.deepEqual([...ctx.dateienDateien],['/sdcard/Download/probe.json']);
});
test('Privater Zustand der Produkt-App wird nur gelesen; Runtime enthält keine Gradle-Ausführung',async()=>{
  const runtime=await readFile(new URL('./emulator/dateien.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(runtime,/gradlew|assembleDebug|setInputFiles|localStorage\.setItem/);
  assert.match(runtime,/vergabenummer: this\.prefix/);
  assert.match(runtime,/name\.includes\(prefix\)/);
});
