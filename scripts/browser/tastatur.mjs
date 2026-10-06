import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { bedienung, inventarQuelle, teilfall, teilfaelleEntscheiden, teilfallUebersicht, sichtbarQuelle } from './bedienung.mjs';
import { sperrpruefungQuelle } from './bedienelement.mjs';
import { browserDownload } from './download.mjs';
import { dateiauswahlAbbrechen } from './webadapter.mjs';
import { messbefehl, Produktabweichung } from './fehler.mjs';
import { Abweichung, bestaetige, verlange, pruefeReihenfolge } from './regeln.mjs';
import { fokusQuelle, liveQuelle } from './messquellen.mjs';
import { pruefeAx, pruefeFokus, pruefeLive, pruefeFehlermeldung, nativerFokus, bestaetigeAxBaum, importReaktion, pruefeImportFehler, bestaetigeLeseprobe } from './tastatur-regeln.mjs';
import { schreibeSichtpruefung } from './sichtpruefung.mjs';

const SCHLUESSEL='baremos-fristenrechner-projekt-v1';
const optionenQuelle = name => `([...document.querySelector(${JSON.stringify(`[name="${name}"]`)}).options].map(o=>({wert:o.value,text:o.textContent,gesperrt:o.disabled})))`;
export const fehlerquelle=selector=>`(() => {const e=document.querySelector(${JSON.stringify(selector)}),sichtbar=${sichtbarQuelle};return {text:e?.textContent??null,sichtbar:e?sichtbar(e):false,
  statusmeldungen:['form-message','import-message','export-message','excel-message','pdf-message'].map(id=>({id,text:document.getElementById(id)?.textContent??''})),
  felder:[...document.querySelectorAll('input,select')].map(e=>({selector:e.id?'#'+e.id:'[name="'+e.name+'"]',beschriftung:[...(e.labels??[])].map(l=>l.textContent.trim()).join(' '),bezug:e.getAttribute('aria-describedby'),ungueltig:e.getAttribute('aria-invalid'),fokus:e===document.activeElement,sichtbar:sichtbar(e),wert:e.value,minimum:e.min??null,validierung:e.validationMessage,gueltig:e.validity.valid,gruppentext:e.closest('.conditional-panel')?.textContent.trim()??''}))};})()`;
export const lesefehlerQuelle=`globalThis.__browserLeseprobe=[];File.prototype.text=function(){__browserLeseprobe.push({name:this.name,bytes:this.size});return Promise.reject(new Error('Browser-Leseprobe'));};`;

export async function sichereAxBeleg(ordner,datei,nodes,elemente) {
  return messbefehl(()=>{
    // Der vollständige Baum bleibt in der Datei; das Protokoll referenziert ihn.
    const bytes=Buffer.from(JSON.stringify({elemente,nodes},null,2)+'\n');
    writeFileSync(join(ordner,datei),bytes);
    return {datei,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),knoten:nodes.length,elemente:elemente.length};
  });
}

export async function tastaturSichtbeleg(b,axBaum,name,selector,axFokus,nachweis={}) {
  const beleg=await b.sichtbild(name,{selectors:[selector],nativerFokus:axFokus,imViewport:true,fokuspflicht:true,nachweis});
  if(axFokus) {
    const danach=nativerFokus(await axBaum(),beleg.ausschnitte[0].element.backendNodeId);
    nachweis.nativerFokusNachher={nodeId:danach.nodeId};
    bestaetige(danach.nodeId===axFokus.nodeId,'Nativer Teilfeldfokus hat sich während des Sichtbelegs geändert.');
  }
  return beleg;
}

export async function pruefeTastatur(kontext) {
  const { cdp,browserCdp,ausgabe,protokoll,pruefung }=kontext,b=bedienung(kontext), axFaelle=[],sicht=[];
  const messungen=protokoll.messungen??=[];
  async function axBaum() {
    const {frameTree}=await b.send('Page.getFrameTree');const frameId=frameTree?.frame?.id;
    bestaetige(typeof frameId==='string'&&frameId,'Hauptframe für AX-Abzug fehlt.');
    const {nodes}=await b.send('Accessibility.getFullAXTree',{frameId});return bestaetigeAxBaum(nodes,frameId);
  }
  async function gruppe(id,beschreibung,faelle) {
    const liste=[];messungen.push({id,teilfaelle:liste});
    const r=await pruefung(id,beschreibung,async()=>{
      for(const [name,fn] of faelle) await teilfall(liste,name,async fall=>{
        try {await fn(fall);}
        catch(fehler){fall.ursprungsfehler={status:fehler instanceof Abweichung||fehler instanceof Produktabweichung?'nicht bestanden':'ungültig',meldung:fehler.message,befund:fehler.befund};throw fehler;}
        finally {fall.bild=await b.bild(`tastatur-${id.toLowerCase()}-${name}.png`);}
      });
      return teilfaelleEntscheiden(liste);
    });
    r.details={teilfaelle:teilfallUebersicht(liste)};
    if(r.status==='bestanden'&&sicht.some(s=>s.id===id))r.status='Sichtprüfung ausstehend';
  }
  async function ax(name) {
    const fall=await teilfall(axFaelle,name,async fall=>{
      const inventar=await b.wert(inventarQuelle),elemente=[];
      const {root}=await b.send('DOM.getDocument');bestaetige(root?.nodeId>0,'DOM für AX-Zuordnung fehlt.');
      for(const e of inventar.filter(e=>e.sichtbar&&!e.gesperrt)) {
        const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:e.selector});
        bestaetige(nodeId>0,`DOM-Auswahl nicht bestätigt: ${e.selector}`);
        const {node}=await b.send('DOM.describeNode',{nodeId});elemente.push({...e,backendNodeId:node?.backendNodeId});
      }
      const nodes=await axBaum();
      const bildname=`ax-${axFaelle.length}.json`;
      fall.messungen=await sichereAxBeleg(ausgabe,bildname,nodes,elemente);
      fall.datei=bildname;pruefeAx(nodes,elemente);
    });
    return fall;
  }
  async function rundgang(fall) {
    const inventar=await b.wert(inventarQuelle);
    bestaetige(Array.isArray(inventar)&&inventar.length>0,'Tastaturinventar fehlt.');
    const aktiv=inventar.filter(e=>e.sichtbar&&!e.gesperrt&&e.tabIndex>=0);
    verlange(aktiv.every(e=>e.tabIndex===0),'Positive tabindex-Werte verändern die logische Reihenfolge.',aktiv);
    const erwartet=aktiv.map(e=>e.kennung),roh=[],vorwaerts=[],rueckwaerts=[];
    fall.messungen.rundgang={inventar,roh,erwartet,vorwaerts,rueckwaerts};
    async function richtung(zurueck,liste) {
      let letzte=null,letzterAx=null,grenze=false;
      for(let i=0;i<inventar.length*8+8;i++) {
        await b.tab(zurueck);const fokus=await b.wert(fokusQuelle);roh.push({richtung:zurueck?'rückwärts':'vorwärts',...fokus});
        if(fokus.tag==='BODY') {grenze=true;break;}
        bestaetige(typeof fokus.kennung==='string','Fokus liegt an einem nicht inventarisierten Knoten.');
        fokus.normal=inventar.find(e=>e.kennung===fokus.kennung)?.normal;
        let axFokus=null;
        if(['date','time','datetime-local','month','week'].includes(fokus.typ)) {
          const nodes=await axBaum();
          const element=inventar.find(e=>e.kennung===fokus.kennung);
          const {root}=await b.send('DOM.getDocument'),{nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:element.selector}),{node}=await b.send('DOM.describeNode',{nodeId});
          axFokus=nativerFokus(nodes,node?.backendNodeId);roh.at(-1).nativerFokus=axFokus;
        }
        const entscheidung=pruefeFokus(fokus);
        if(entscheidung?.sichtpruefung) {
          const element=inventar.find(e=>e.kennung===fokus.kennung);
          const nachweis={};roh.at(-1).sichtbeleg=nachweis;
          const beleg=await tastaturSichtbeleg(b,axBaum,`tastatur-b1-${fall.name}-fokus-${roh.length}.png`,element.selector,axFokus,nachweis);
          (fall.sichtbilder??=[]).push(beleg.bild);
          sicht.push({id:'B1',...beleg,kriterium:entscheidung.kriterium});
          roh.at(-1).sichtpruefung={...beleg,kriterium:entscheidung.kriterium};
        }
        if(fokus.kennung===letzte) {
          // Datums-/Zeitfelder können mehrere native Unterfelder besitzen.
          // Eine Wiederholung ist nur mit einem anderen fokussierten AX-Knoten
          // innerhalb genau dieses DOM-Elements belegbar, sonst ungültig.
          if(!axFokus)throw new Abweichung('Vertrauenswürdiges Tab verlässt das Bedienelement nicht.',fokus);
          verlange(axFokus.nodeId!==letzterAx,'Tab bleibt im selben nativen Unterfeld hängen.',{vorher:letzterAx,nachher:axFokus});
        } else {liste.push(fokus.kennung);letzte=fokus.kennung;}
        letzterAx=axFokus?.nodeId??null;
      }
      bestaetige(grenze,'Ende des Tastaturrundgangs nicht bestätigt.');
    }
    // Die erste Tab-Position muss aus dem neutralen Dokumentfokus entstehen.
    bestaetige((await b.aktiv()).tag==='BODY','Neutraler Ausgangsfokus für Rundgang fehlt.');
    await richtung(false,vorwaerts);await richtung(true,rueckwaerts);
    pruefeReihenfolge(erwartet,vorwaerts,rueckwaerts);
  }
  const waehlen=b.auswaehlen;
  async function projektDatei(name,aendern) {
    const p=await b.bis(async()=>{const s=await b.wert(`localStorage.getItem(${JSON.stringify(SCHLUESSEL)})`);return s?JSON.parse(s):false;},'Projektdatei gespeichert',{produkt:true});
    bestaetige(p?.input?.projekt&&p?.input?.optionen,'Projektfixture nicht aus gespeicherter Eingabe bestimmbar.');
    if(aendern)aendern(p);
    const pfad=join(ausgabe,name);await messbefehl(()=>writeFileSync(pfad,JSON.stringify(p)+'\n'));return pfad;
  }
  async function importieren(pfad,taste='Enter') {
    const start=cdp.events.length;await b.aktivieren('#open-json',taste);
    const ev=await b.bis(()=>cdp.events.slice(start).find(e=>e.method==='Page.fileChooserOpened'),'Dateiauswahl',{timeout:8000});
    bestaetige(ev.params?.backendNodeId>0,'Dateiauswahl ohne belegtes Eingabefeld.');
    await b.send('DOM.setFileInputFiles',{backendNodeId:ev.params.backendNodeId,files:[pfad]});
    const ereignisse=await b.bis(async()=>{const e=await b.wert('__messDatei');return e.some(e=>e.typ==='change'&&e.vertrauenswuerdig)?e:false;},'Vertrauenswürdiger Dateiwechsel');
    return {auswahl:ev,ereignisse};
  }
  async function importErfolg(pfad,taste='Enter') {
    const ev=await importieren(pfad,taste);await b.bis(async()=>/geöffnet/.test(await b.inhalt('#import-message')),'Importmeldung',{produkt:true});return ev;
  }
  async function reset(accept) {
    await b.erreichen('#reset-project');const start=cdp.events.length;let fehler;
    // JavaScript-Dialoge können den Input-Aufruf bis zur Antwort anhalten.
    const aktivierung=b.aktivieren('#reset-project').catch(e=>{fehler=e;});
    try {
      const ev=await b.bis(()=>{if(fehler)throw fehler;return cdp.events.slice(start).find(e=>e.method==='Page.javascriptDialogOpening');},'Bestätigungsdialog');
      bestaetige(ev.params?.type==='confirm'&&typeof ev.params.message==='string','Bestätigungsdialog nicht erkannt.');
      await b.send('Page.handleJavaScriptDialog',{accept});await aktivierung;if(fehler)throw fehler;
      return {dialog:ev,accept};
    } finally {await aktivierung;}
  }
  await b.send('Accessibility.enable');
  await b.frisch();await ax('ausgangszustand');
  await gruppe('B1','Vollständige Tastaturwege mit Tab, Umschalt+Tab, Eingabe und Leertaste',[
    ['grundzustand',async fall=>{await b.frisch();await rundgang(fall);await ax('grundzustand');}],
    ['erweiterungen',async fall=>{
      await b.frisch();await waehlen('verfahrensart','verhandlung_mit_tnw');
      await b.aktivieren('.advanced-settings summary',' ');
      for(const name of ['elektronischeAbgabe','ortsbegehung','dringlichkeit']) {
        const selector=`[name="${name}"]`,vorher=await b.wert(`document.querySelector('${selector}').checked`);
        await b.aktivieren(selector,' ');verlange(await b.wert(`document.querySelector('${selector}').checked`)===!vorher,'Ankreuzfeld reagiert nicht auf Leertaste.',{name,vorher});
        await b.aktivieren(selector,' ');verlange(await b.wert(`document.querySelector('${selector}').checked`)===vorher,'Ankreuzfeld lässt sich nicht zurückstellen.',{name,vorher});
      }
      for(const name of ['teststellungAktiv','praesentationAktiv','verhandlungRunde1Aktiv','verhandlungRunde2Aktiv'])await b.aktivieren(`[name="${name}"]`,' ');
      await b.textEingeben('[name="kunde"]','Tastaturprobe');await b.textEingeben('[name="projektname"]','Vollständige Eingabe');await b.textEingeben('[name="vergabenummer"]','PROBE-2026');
      await b.berechnen();fall.messungen.live=await b.wert(liveQuelle);await ax('erweiterungen');
      // Zum neutralen Dokumentfokus wird ausschließlich weitergetabbt.
      const inventar=await b.wert(inventarQuelle);
      for(let i=0;i<inventar.length*8&&((await b.aktiv()).tag!=='BODY');i++)await b.tab();
      await rundgang(fall);
    }],
    ['import-abbruch',async fall=>{
      await b.frisch();const pfad=await projektDatei('tastatur-import.json',p=>{p.input.projekt.projektname='Import über Tastatur';});
      fall.messungen.import=await importErfolg(pfad,' ');
      verlange(await b.feld('projektname')==='Import über Tastatur','Importierte Eingabe fehlt.');
      const vorher=await b.wert(`localStorage.getItem(${JSON.stringify(SCHLUESSEL)})`),meldung=await b.inhalt('#import-message');
      fall.messungen.abbruch=await dateiauswahlAbbrechen({send:b.send,wert:b.wert,bis:(fn,text)=>b.bis(fn,text),aktivieren:()=>b.aktivieren('#open-json')});
      verlange(await b.wert(`localStorage.getItem(${JSON.stringify(SCHLUESSEL)})`)===vorher&&await b.inhalt('#import-message')===meldung,'Importabbruch verändert Eingaben oder Meldung.');
    }],
    ['feldeingaben',async fall=>{
      await b.frisch();const pfad=await projektDatei('tastatur-felder.json',p=>{
        p.input.verfahrensart='verhandlung_mit_tnw';p.input.angebotsaufforderung='2028-06-15';
        p.input.optionen.abgabeUhrzeit='12:00';
        for(const [name,jahr]of [['teststellung',2030],['praesentation',2032],['verhandlungRunde1',2034],['verhandlungRunde2',2036]])p.input.optionen[name]={aktiv:true,dauerAT:5,start:`${jahr}-06-15`};
        p.input.fristen={...p.input.fristen,optimiertesAngebotKT:5,finalesAngebotKT:5,bindefrist:{termin:'2040-06-15'}};
      });
      await importErfolg(pfad);await b.aktivieren('.advanced-settings summary',' ');
      const inventar=await b.wert(inventarQuelle);fall.messungen.eingaben=[];
      for(const feld of inventar.filter(e=>e.sichtbar&&!e.gesperrt&&e.tag==='INPUT'&&!['checkbox','radio','file'].includes(e.typ))) {
        const m={selector:feld.selector,typ:feld.typ,vorher:await b.wert(`document.querySelector(${JSON.stringify(feld.selector)}).value`)};fall.messungen.eingaben.push(m);
        if(['date','time'].includes(feld.typ)) {
          bestaetige(m.vorher,'Datum-/Zeitfixture hat kein vollständig vorbelegtes Feld.');await b.erreichen(feld.selector);
          const {root}=await b.send('DOM.getDocument'),{nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:feld.selector}),{node}=await b.send('DOM.describeNode',{nodeId});
          const nodes=await axBaum();m.fokus=nativerFokus(nodes,node?.backendNodeId);
          bestaetige(m.fokus.kette[0].role?.value==='spinbutton','Natives Datum-/Zeitunterfeld bestätigt keine Pfeiltastenbedienung.');
          const start=await b.wert('__messTasten.length');await b.taste('ArrowUp');
          const tasten=await b.wert(`__messTasten.slice(${start})`);bestaetige(tasten.some(e=>e.key==='ArrowUp'&&e.vertrauenswuerdig),'Native Pfeiltasteneingabe nicht bestätigt.');
          m.nachher=await b.wert(`document.querySelector(${JSON.stringify(feld.selector)}).value`);
          verlange(m.nachher&&m.nachher!==m.vorher,'Datum-/Zeitfeld übernimmt keine Änderung durch die Tastatur.',m);
        } else {
          const ziel=feld.typ==='number'?'2':'Tastatureingabe';await b.textEingeben(feld.selector,ziel);
          m.nachher=await b.wert(`document.querySelector(${JSON.stringify(feld.selector)}).value`);
        }
      }
      bestaetige(fall.messungen.eingaben.length>0,'Keine Eingabefelder gemessen.');
      for(const name of ['bundesland','versandBieterinformation','bindefristArt']) {
        const optionen=await b.wert(optionenQuelle(name));await waehlen(name,optionen.at(-1).wert);await waehlen(name,optionen[0].wert);
      }
    }],
    ...[['json','#save-json'],['xlsx','#export-excel'],['pdf','#export-pdf']].map(([endung,selector])=>[`export-${endung}`,async fall=>{
      await b.frisch();await b.berechnen();const {frameTree}=await b.send('Page.getFrameTree');
      const nachweis={};fall.messungen.download=nachweis;
      const start=await browserDownload({browserCdp,ausgabe,browserContextId:protokoll.pruefTarget?.browserContextId,frameId:frameTree?.frame?.id,endung,nachweis,aktivieren:()=>b.aktivieren(selector,endung==='xlsx'?' ':'Enter')});
      const bytes=await messbefehl(()=>readFileSync(join(ausgabe,start.guid)));bestaetige(bytes.length>0,'Downloaddatei nicht lesbar.');
      fall.messungen.bytes=bytes.length;await b.bedienbar(selector);
    }]),
    ['zuruecksetzen',async fall=>{
      await b.frisch();await b.textEingeben('[name="projektname"]','Erhalten nach Abbruch');
      const vorher=await b.feld('projektname');fall.messungen.abbruch=await reset(false);
      verlange(await b.feld('projektname')===vorher,'Resetabbruch verliert Eingabe.');
      fall.messungen.bestaetigt=await reset(true);await b.bis(async()=>await b.inhalt('#reset-message')==='Neues Projekt angelegt.','Neues Projekt',{produkt:true});
      verlange(await b.feld('projektname')===''&&await b.feld('vergabeordnung')==='vgv','Zurücksetzen unvollständig.');
    }],
  ]);
  const kern=await messbefehl(()=>import('@baremos/fristenrechner-kern'));
  bestaetige(typeof kern.verfahrenFuer==='function'&&kern.VERGABEORDNUNGEN,'Verfahrensreferenz des gebauten Kerns fehlt.');
  await gruppe('B3','Alle Ordnungen und Verfahren, passende Pflichtfelder und Fokus beim Ausblenden',Object.keys(kern.VERGABEORDNUNGEN).flatMap(ordnung=>kern.verfahrenFuer(ordnung).map(art=>[`${ordnung}-${art}`,async fall=>{
    await b.frisch();await waehlen('vergabeordnung',ordnung);
    const optionen=await b.wert(optionenQuelle('verfahrensart'));
    const erwartet=kern.verfahrenFuer(ordnung).map(a=>({wert:a,text:kern.VERGABEORDNUNGEN[ordnung].verfahren[a].label,gesperrt:false}));
    fall.messungen.optionen={erwartet,gemessen:optionen};verlange(JSON.stringify(optionen)===JSON.stringify(erwartet),'Verfahrensoptionen passen nicht zur Ordnung.',fall.messungen.optionen);
    await waehlen('verfahrensart',art);const inventar=await b.wert(inventarQuelle);fall.messungen.felder=inventar;
    await b.aktivieren('.advanced-settings summary',' ');
    const sichtInventar=await b.wert(inventarQuelle);fall.messungen.felder=sichtInventar;
    for(const f of sichtInventar.filter(f=>f.erforderlich)) verlange(f.sichtbar&&!f.gesperrt||!f.sichtbar&&f.gesperrt,`Pflichtfeld und Ausblendung passen nicht: ${f.selector}`,f);
    const zweistufig=['nicht_offen_mit_tnw','verhandlung_mit_tnw'].includes(art),wartepflicht=kern.VERGABEORDNUNGEN[ordnung].wartepflicht;
    for(const [name,sichtbar]of [['teilnahmefristKT',zweistufig],['angebotsaufforderungTermin',zweistufig],['wartefristKT',wartepflicht],['versandBieterinformation',wartepflicht]]) {
      const f=sichtInventar.find(f=>f.selector===`[name="${name}"]`);bestaetige(f,'Feld im Messinventar fehlt.');verlange(f.sichtbar===sichtbar&&f.gesperrt===!sichtbar,'Bedingtes Feld passt nicht zum Verfahren.',{name,sichtbar,gemessen:f});
    }
    const verhandlung=['verhandlung_mit_tnw','verhandlung_ohne_tnw'].includes(art);
    const runde1=sichtInventar.find(f=>f.selector==='[name="verhandlungRunde1Aktiv"]');
    bestaetige(runde1,'Verhandlungsoption fehlt im Inventar.');verlange(runde1.gesperrt===!verhandlung,'Verhandlungsoption passt nicht zur Verfahrensart.',{art,runde1});
    if(verhandlung) {
      await b.aktivieren('[name="verhandlungRunde1Aktiv"]',' ');await b.aktivieren('[name="verhandlungRunde2Aktiv"]',' ');
      await b.erreichen('[name="verhandlungRunde2DauerAT"]');fall.messungen.verhandlungFokus=await b.aktiv();
      await b.aktivieren('[name="verhandlungRunde1Aktiv"]',' ');
      const danach=await b.wert(inventarQuelle);fall.messungen.verhandlungDanach=danach.filter(f=>f.selector.includes('verhandlungRunde'));
      const zweite=danach.find(f=>f.selector==='[name="verhandlungRunde2Aktiv"]');
      bestaetige(zweite,'Zweite Verhandlungsrunde fehlt im Inventar.');verlange(zweite.gesperrt,'Zweite Runde bleibt ohne erste Runde bedienbar.',zweite);
      verlange(await b.wert('document.activeElement===document.querySelector("[name=verhandlungRunde1Aktiv]")'),'Ausblenden der Verhandlungsrunden verliert den Fokus.');
    }
    // Option öffnen, hinein tabben, rückwärts zum Schalter und schließen:
    // aktives Feld war erreichbar, der schließende Schalter behält den Fokus.
    for(const [name,feld] of [['teststellungAktiv','teststellungDauerAT'],['praesentationAktiv','praesentationDauerAT']]) {
      await b.aktivieren(`[name="${name}"]`,' ');await b.erreichen(`[name="${feld}"]`);const innerhalb=await b.aktiv();fall.messungen[name]={innerhalb};
      verlange(innerhalb.selector===`[name="${feld}"]`,'Optionales Feld nach Öffnen nicht fokussierbar.',innerhalb);
      await b.erreichen(`[name="${name}"]`);await b.aktivieren(`[name="${name}"]`,' ');
      verlange(await b.wert(`document.activeElement===document.querySelector('[name="${name}"]')`),'Ausblenden verliert Fokus.');
      const nachher=(await b.wert(inventarQuelle)).find(f=>f.selector===`[name="${feld}"]`);
      bestaetige(nachher,'Optionales Feld fehlt im Inventar.');verlange(!nachher.sichtbar&&nachher.gesperrt,'Ausgeblendetes Feld bleibt bedienbar.',nachher);
    }
    await ax(`${ordnung}-${art}`);
  }])));
  async function dateifehler(fall,art) {
    await b.frisch(art==='lesen'?lesefehlerQuelle:'');
    const inhalt=art==='json'?'{ungültig':art==='schema'?'{}':art==='groesse'?Buffer.alloc(1024*1024+1,0x20):'{}';
    const pfad=join(ausgabe,`tastatur-fehler-${art}.json`);await messbefehl(()=>writeFileSync(pfad,inhalt));
    const parse=art==='json'||art==='schema'?(await import('@baremos/fristenrechner-kern')).parseProjektDatei(String(inhalt)):null;
    bestaetige(!parse||parse.ok===false&&parse.fehler.length>0,'Testdatei erzeugt keinen bestätigten Parserfehler.');
    const erwartet=parse?parse.fehler.join(' '):art==='groesse'?'Die Projektdatei ist größer als 1 MiB.':'Die Projektdatei konnte nicht vollständig geladen und gespeichert werden. Bitte versuchen Sie es erneut.';
    fall.messungen.datei={art,bytes:Buffer.byteLength(inhalt),erwartet};
    await b.erreichen('#open-json');fall.messungen.vorher=await b.wert(liveQuelle);
    fall.messungen.statusVorher=await b.wert(fehlerquelle('#import-message'));
    try {
      fall.messungen.import=await importieren(pfad);
      await b.bis(async()=>importReaktion(await b.inhalt('#import-message'),fall.messungen.statusVorher.text),'Abschluss der Dateiprüfung',{produkt:true});
    } finally {
      fall.messungen.fehler=await b.wert(fehlerquelle('#import-message'));
      fall.messungen.lage=await b.wert(liveQuelle);
      if(art==='lesen')fall.messungen.leseprobe=await b.wert('__browserLeseprobe');
    }
    if(art==='lesen')bestaetigeLeseprobe(fall.messungen.leseprobe,{name:basename(pfad),bytes:fall.messungen.datei.bytes});
    pruefeImportFehler(fall.messungen.fehler.text,erwartet);
    return fall.messungen.fehler;
  }
  await gruppe('B4','Startkonflikt und fehlerhafte Datei: Erklärung, Feldbezug, keine falsche Erfolgsmeldung',[
    ['startkonflikt',async fall=>{
      await b.frisch();const pfad=await projektDatei('startkonflikt.json',p=>{p.input.optionen.teststellung={aktiv:true,dauerAT:5,start:'2000-01-01'};});
      await importErfolg(pfad);await b.bis(async()=>/Kein Terminplan/.test(await b.inhalt('#result-konflikte')),'Startkonflikt',{produkt:true});
      // Öffnen und Berechnungsversuch getrennt erfassen. Die native min-
      // Validierung kann den submit verhindern und selbst zum Feld fokussieren.
      fall.messungen.statusVorher=await b.wert(fehlerquelle('#result-konflikte'));
      const start=await b.wert('__messForm.length');
      await b.aktivieren('#schedule-form button[type="submit"]');
      fall.messungen.formularereignisse=await b.wert(`__messForm.slice(${start})`);
      fall.messungen.fehler=await b.wert(fehlerquelle('#result-konflikte'));pruefeFehlermeldung(fall.messungen.fehler,{vorher:fall.messungen.statusVorher});
    }],
    ['dateifehler',async fall=>{
      await dateifehler(fall,'json');pruefeFehlermeldung(fall.messungen.fehler,{datei:true,vorher:fall.messungen.statusVorher});
    }],
    ...['groesse','lesen'].map(art=>[`datei-${art}`,async fall=>{await dateifehler(fall,art);pruefeFehlermeldung(fall.messungen.fehler,{datei:true,vorher:fall.messungen.statusVorher});}]),
  ]);
  await gruppe('B6','Fokus und sichtbare Live-Region nach Berechnung und Import; kein Screenreader-Ersatz',[
    ['berechnung',async fall=>{await b.frisch();await b.erreichen('#schedule-form button[type="submit"]');fall.messungen.vorher=await b.wert(liveQuelle);await b.berechnen();fall.messungen.lage=await b.wert(liveQuelle);pruefeLive(fall.messungen.lage,'form-message');}],
    ['import',async fall=>{await b.frisch();const pfad=await projektDatei('fokus-import.json');await b.erreichen('#open-json');fall.messungen.vorher=await b.wert(liveQuelle);await importErfolg(pfad);fall.messungen.lage=await b.wert(liveQuelle);pruefeLive(fall.messungen.lage,'import-message');}],
    ['importfehler',async fall=>{await dateifehler(fall,'schema');pruefeLive(fall.messungen.lage,'import-message');}],
  ]);
  await pruefung('AX','Vollständige Barrierebäume: jedes bedienbare Element mit Rolle und zugänglichem Namen',()=>teilfaelleEntscheiden(axFaelle));
  protokoll.messungen.push({id:'AX',teilfaelle:axFaelle});
  protokoll.sichtpruefung={datei:'sichtpruefung.json',bilder:await schreibeSichtpruefung(ausgabe,sicht)};
  protokoll.grenzen.push('Dateiauswahl und Bestätigungsdialog werden nach echter Tastaturaktivierung über CDP bedient. Tastaturwege innerhalb der sichtbaren Betriebssystemdialoge und Escape dort bleiben Handprüfungen.',
    'AX-, Fokus- und Live-Region-Messungen belegen keine tatsächliche Sprachausgabe und keinen virtuellen Screenreader-Cursor.');
}
