import { bedienung, teilfall, teilfaelleEntscheiden, teilfallUebersicht, inventarQuelle } from './bedienung.mjs';
import { emulation } from './emulation.mjs';
import { layoutQuelle, kontrastQuelle, textzuordnungQuelle } from './messquellen.mjs';
import { Abweichung, bestaetige, verlange, pruefeEmulation, pruefeLayout, farbe, farbpaar, kontrast, textSchwelle, KONTRAST } from './regeln.mjs';
import { schreibeSichtpruefung } from './sichtpruefung.mjs';
import { Produktabweichung } from './fehler.mjs';
import { messungAblegen, bestaetigeBildwechsel } from './belege.mjs';
import { hoverMessen, hoverQuelle } from './hover.mjs';
import { MESSGRENZEN } from './ergebniskatalog.mjs';
import { pseudoMessung } from './dom-knoten.mjs';

export function pruefeKontraste(werte) {
  bestaetige(Array.isArray(werte) && werte.length > 0, 'Kontrastinventar fehlt.');
  const messungen = [], unklar = [], befunde = [], grenzen=[],ausnahmen=[];
  const messen = (e, art, paar, schwelle) => {
    const wert = kontrast(...paar), m = { selector: e.selector, art, wert, schwelle, farben: paar, status:wert<schwelle?'nicht bestanden':'bestanden' }; messungen.push(m);
    if (wert < schwelle) befunde.push(m);
    return wert;
  };
  for (const e of werte) {
    try {
      bestaetige(!e.unbestimmt,`Visuelle Zuordnung des Bedienelements fehlt: ${e.selector}`);
      if(e.text&&e.inaktiverText) {
        const a=e.inaktiverText;
        bestaetige(a.gesperrt===true&&a.zugeordnet===true&&typeof a.selector==='string'&&a.selector&&typeof a.label==='string'&&a.label.trim(), 'Zuordnung des Texts zur inaktiven Kontrolle nicht bestätigt.');
        ausnahmen.push({selector:e.selector,grund:'Text einer bestätigt inaktiven Kontrolle',beleg:a});
      } else if (e.text) messen(e, 'Text', farbpaar(e.kette,e.farbe), textSchwelle(e.groesse, e.gewicht));
      if(e.bedienelement&&!e.gesperrt&&e.nativ)grenzen.push({kennung:'native-kontrollgrafik',...MESSGRENZEN['native-kontrollgrafik'],selector:e.selector,
        meldung:MESSGRENZEN['native-kontrollgrafik'].grund});
      if (e.bedienelement && !e.gesperrt && !e.nativ) {
        const aussen = farbpaar(e.aussen, 'rgba(0,0,0,0)')[1];
        const innen = farbpaar(e.kette, 'rgba(0,0,0,0)')[1];
        const hintergrund = kontrast(innen, aussen);
        const kanten = e.rahmen.filter(r => r.breite > 0 && !['none','hidden'].includes(r.stil));
        // Vollständig umlaufende Kante oder eine unterscheidbare Fläche.
        const rahmen = kanten.length === 4 ? Math.min(...kanten.map(r => kontrast(farbpaar(e.kette, r.farbe)[0], aussen))) : 0;
        const identifikation=e.identifikation?kontrast(...farbpaar(e.kette,e.identifikation)):0;
        const wert=Math.max(hintergrund,rahmen,identifikation);
        const m={selector:e.selector,art:'Bedienelement',wert,schwelle:KONTRAST.bedienelement,hintergrund,rahmen,identifikation,farbpaare:{innen,aussen,kanten},status:wert<KONTRAST.bedienelement?'nicht bestanden':'bestanden'};
        messungen.push(m);if(m.wert<m.schwelle)befunde.push(m);
      }
      if (e.fokus) {
        bestaetige(e.outline && e.outline.breite > 0 && !['none','hidden'].includes(e.outline.stil), `Fokusrahmen nicht eindeutig messbar: ${e.selector}`);
        const aussen = farbpaar(e.aussen, 'rgba(0,0,0,0)')[1];
        const outlineKette=[{...e.kette[0],farbe:'rgba(0,0,0,0)'},...e.kette.slice(1)];
        messen(e, 'Fokusrahmen', [farbpaar(outlineKette, e.outline.farbe)[0], aussen], KONTRAST.fokus);
      }
    } catch (fehler) { unklar.push({selector:e.selector,status:'ungültig',meldung:fehler.message}); }
  }
  return { messungen, befunde, unklar, grenzen,ausnahmen };
}
export async function kontrastMessen(b,e,fall,ausgabe) {
  fall.messungen.canvas=await e.canvas();
  const rohfarben=await b.wert(kontrastQuelle),kontraste=pruefeKontraste(rohfarben);
  const datei=await messungAblegen(ausgabe,`kontrast-${fall.name}.json`,{rohfarben,kontraste});
  // Vollständiges Inventar weiterhin messen, nach dem Ablegen aber freigeben.
  const {unklar,befunde,messungen,grenzen,ausnahmen}=kontraste;
  fall.messungen.kontraste={datei,anzahl:messungen.length,befunde,unklar,grenzen,ausnahmen};
  fall.grenzen=grenzen;
  bestaetige(!unklar.length,`Kontrastmessung unvollständig: ${unklar.map(m=>m.selector+': '+m.meldung).join('; ')}`);
  verlange(!befunde.length,`${befunde.length} Kontrastunterschreitungen.`,befunde);
}
export function pruefeTextzuordnung(m, referenz, erwartet) {
  bestaetige(m && Array.isArray(m.phasen) && Array.isArray(m.warnungen) && Array.isArray(m.fristtypen), 'Textzuordnung nicht gemessen.');
  verlange(m.phasen.length > 0 && m.warnungen.length > 0 && m.fristtypen.length > 0, 'Phase, Warnung oder Fristtyp fehlt als Text.', m);
  verlange(m.phasen.every(p => p.name && p.text.includes(p.name)) && m.warnungen.every(t => t.length > 0)
    && m.fristtypen.every(t => t.typ && t.phase.includes(t.typ) && t.termin), 'Leere oder nicht zugeordnete Beschriftung.', m);
  if (referenz) verlange(JSON.stringify(m) === JSON.stringify(referenz), 'Emulation verändert oder entfernt die Textzuordnung.', { referenz, gemessen: m });
  if(erwartet) {
    bestaetige(Array.isArray(erwartet.phasen)&&Array.isArray(erwartet.typen)&&Array.isArray(erwartet.warnungen),'Berechnete Textreferenz fehlt.');
    verlange(JSON.stringify(m.phasen.map(p=>p.name))===JSON.stringify(erwartet.phasen)
      &&JSON.stringify(m.fristtypen.map(t=>t.typ))===JSON.stringify(erwartet.typen)
      &&erwartet.warnungen.every(w=>m.warnungen.includes(w)),'Beschriftungen stimmen nicht mit den berechneten Phasen, Warnungen und Fristtypen überein.',{erwartet,gemessen:m});
  }
  return m;
}

export function pruefeBewegung({aufrufe,css,reduziert}) {
  bestaetige(Array.isArray(aufrufe)&&aufrufe.length===1&&Array.isArray(css)&&css.length===3,'Scrollaufruf oder CSS-Messung fehlt.');
  const m=aufrufe[0];
  bestaetige([m.vorher?.x,m.vorher?.y,m.vorher?.zielOben,m.synchron?.x,m.synchron?.y].every(Number.isFinite)
    &&Array.isArray(m.bilder)&&m.bilder.length===30&&m.bilder.every(p=>[p.x,p.y,p.zeit].every(Number.isFinite))
    &&m.bilder.every((p,i)=>i===0||p.zeit>m.bilder[i-1].zeit), 'Scrollpositionen nicht vollständig und zeitlich geordnet gemessen.');
  bestaetige(Math.abs(m.vorher.zielOben)>2&&Math.abs(m.bilder.at(-1).y-m.vorher.y)>2,'Scrollweg zum Ergebnis nicht bestätigt.');
  bestaetige(['auto','smooth','instant'].includes(m.optionen?.behavior)&&css.every(c=>['auto','smooth'].includes(c.scrollBehavior)),'Scrollverhalten nicht bestimmt.');
  if(reduziert) verlange(m.optionen.behavior!=='smooth'&&css.every(c=>c.scrollBehavior==='auto')
    &&m.bilder.every(p=>Math.abs(p.y-m.synchron.y)<=1&&Math.abs(p.x-m.synchron.x)<=1),'Berechnung erzwingt trotz reduzierter Bewegung animiertes Scrollen.',{aufrufe,css});
  return {aufrufe,css};
}

// Ein nicht bestätigter Reset darf keine nächste Messung kontaminieren.
export function darstellungsSitzung(kontext) {
  let b=bedienung(kontext),e=emulation(b),verworfen=false;
  return {get b(){return b;},get e(){return e;},verwerfen(){verworfen=true;},async bereit(){
    if(verworfen) {
      bestaetige(typeof kontext.neueSeite==='function','Frische Ersatzseite nach Messfehler nicht verfügbar.');
      const neu=await kontext.neueSeite();
      bestaetige(neu?.cdp&&typeof neu.cdp.send==='function'&&typeof neu.basisUrl==='string','Frische Ersatzsitzung nicht bestätigt.');
      b=bedienung({...neu,protokoll:kontext.protokoll});e=emulation(b);verworfen=false;
    }
  }};
}
export const LANGER_PROJEKTNAME='Projekt '+'W'.repeat(120)+' mit langen Bezeichnungen '.repeat(4).slice(0,72);
export function browserzoomGrenze(fall,faktor) {
  bestaetige([2,4].includes(faktor)&&fall?.messungen,'Zoom-Teilfall oder Faktor fehlt.');
  const grenze=MESSGRENZEN.browserzoom;fall.grenzen=[{kennung:'browserzoom',...grenze}];
  fall.messungen.zoom={faktor,grenze:grenze.grund,ersatz:grenze.ersatz,bestaetigt:false};
  fall.status='dokumentierte Grenze';
}
export function reflowSichtziele(inventar) {
  bestaetige(Array.isArray(inventar)&&inventar.length>0,'Reflow-Sichtinventar fehlt.');
  const ziele=inventar.filter(z=>z.sichtbar&&!z.gesperrt&&['INPUT','SELECT','TEXTAREA','BUTTON'].includes(z.tag)
    &&!['file','checkbox','radio'].includes(z.typ)).map(z=>z.selector);
  bestaetige(ziele.length>0&&ziele.every(s=>typeof s==='string'&&s),'Native Felder und Aktionen für Reflow-Sichtung fehlen.');
  return [...new Set([...ziele,'.table-scroll'])];
}
export async function pruefeDarstellung(kontext) {
  const { protokoll, pruefung, ausgabe } = kontext,sitzung=darstellungsSitzung(kontext);
  let b=sitzung.b,e=sitzung.e;
  const sicht = [];
  async function gruppe(id, beschreibung, faelle) {
    const liste = []; (protokoll.messungen ??= []).push({ id, teilfaelle: liste });
    const r = await pruefung(id, beschreibung, async () => {
      for (const [name, fn, kriterium] of faelle) await teilfall(liste, name, async fall => {
        try { await sitzung.bereit();b=sitzung.b;e=sitzung.e;await fn(fall); }
        catch(fehler) { fall.ursprungsfehler={status:fehler instanceof Abweichung||fehler instanceof Produktabweichung?'nicht bestanden':'ungültig',meldung:fehler.message,befund:fehler.befund};throw fehler; }
        finally {
          // Bilder auch bei bestätigter Produktabweichung; fehlendes Bild oder
          // nicht bestätigtes Zurücksetzen macht genau diesen Teilfall ungültig.
          try {
            if(kriterium) {
              const selectors=id==='B10'?['#schedule-results','[aria-labelledby="timeline-heading"]','.table-scroll']:
                reflowSichtziele(await b.wert(inventarQuelle));
              const beleg=await b.sichtbild(`${id.toLowerCase()}-${name}.png`,{selectors});
              fall.bild=beleg.bild;sicht.push({id,kriterium,...beleg});
            } else fall.bild ??= await b.bild(`${id.toLowerCase()}-${name}.png`);
          } finally {
            fall.messungen.zurueckgesetzt={};
            try { await e.zuruecksetzen(fall.messungen.zurueckgesetzt); }
            catch(fehler) {sitzung.verwerfen();throw fehler;}
          }
        }
      });
      return teilfaelleEntscheiden(liste,id);
    });
    if(r.status==='bestanden'&&liste.some(f=>f.status==='dokumentierte Grenze'))r.status='dokumentierte Grenze';
    if (['bestanden','dokumentierte Grenze'].includes(r.status) && sicht.some(s => s.id === id)) r.status = 'Sichtprüfung ausstehend';
    // Messwerte nur einmal im Phasenprotokoll. Die Entscheidung und Sichtung
    // brauchen hier lediglich Teilfallstatus und Dateinamen.
    r.details = { teilfaelle: teilfallUebersicht(liste) };
  }
  const langerName = LANGER_PROJEKTNAME;
  const vorbereiten = async () => {
    await b.frisch(); await b.textEingeben('[name="projektname"]', langerName, { maus: true }); await b.berechnen({ maus: true });
    await b.wert('scrollTo({left:0,top:0,behavior:"instant"})');
  };
  await gruppe('B7', 'Umbruch bei 320/640 CSS-Pixeln; echter Browserzoom als gesonderte Läufergrenze',
    [['320', 320, 1], ['reflow-200',640,2], ['reflow-400',320,4], ['zoom-200', 1280, 2], ['zoom-400', 1280, 4]].map(([name, breite, faktor]) => [name, async fall => {
      await e.zuruecksetzen(); await e.viewport(breite); await vorbereiten();
      if(name.startsWith('zoom-'))return browserzoomGrenze(fall,faktor);
      await b.bildkanalVorbereiten();
      if(name.startsWith('reflow-'))fall.messungen.reflow=await e.reflow(faktor);
      const ist = await e.messen();
      pruefeEmulation(ist,{innerWidth:breite,devicePixelRatio:1,schrift:16,visuelleSkala:1});
      fall.messungen.emulation = ist; fall.messungen.layout = await b.wert(layoutQuelle);
      pruefeLayout(fall.messungen.layout);
    }, name.startsWith('zoom-')?null:'Native Feldinhalte und Verdeckung vollständig lesen; alle Aktionen bleiben erkennbar. Die automatisch gemessenen Überläufe sind gesondert entschieden.']));

  async function warnung() {
    await e.zuruecksetzen(); await b.frisch();
    await b.aktivieren('.advanced-settings summary',' ');
    await b.textEingeben('[name="angebotsfristKT"]', '1', { maus: true }); await b.berechnen({ maus: true });
    const m = await b.wert(textzuordnungQuelle);
    bestaetige(m.warnungen.length > 0, 'Warnzustand für die Messung nicht hergestellt.');
  }
  const kontrastfall = async fall => {
    try {await kontrastMessen(b,e,fall,ausgabe);}
    finally {
      if(fall.grenzen?.length) {
        // Aufnahme noch vor dem Aufheben des Hover-/Fokuszustands. Der kleine
        // Zielausschnitt allein zeigt nicht alle nativen Kontrollen im Inventar.
        const beleg=await b.sichtbild(`b9-native-${fall.name}.png`,{selectors:[...new Set(fall.grenzen.map(g=>g.selector))]});fall.sichtbilder=[beleg.bild];
        sicht.push({id:'B9',...beleg,kriterium:'Native Kontrollgrafik: Markierung und Abgrenzung mit ausreichendem Kontrast sichtbar prüfen: '+fall.grenzen.map(g=>g.selector).join(', ')});
      }
    }
    if(fall.grenzen?.length)fall.status='dokumentierte Grenze';
  };
  // Zustandsinventar einmal aus einer bestätigten Seite, danach jeden Zustand
  // einzeln neu aufbauen. Fehlendes Inventar lässt keine Teilgruppe bestehen.
  async function erweitern() {
    await e.zuruecksetzen();await b.frisch();await b.auswaehlen('verfahrensart','verhandlung_mit_tnw');
    await b.aktivieren('.advanced-settings summary',' ');
    for(const name of ['teststellungAktiv','praesentationAktiv','verhandlungRunde1Aktiv','verhandlungRunde2Aktiv'])await b.aktivieren(`[name="${name}"]`,' ');
    await b.textEingeben('[name="optimiertesAngebotKT"]','5',{maus:true});await b.textEingeben('[name="finalesAngebotKT"]','5',{maus:true});
    await b.auswaehlen('bindefristArt','termin');await b.berechnen({maus:true});
  }
  let ziele=[],inventarfehler;
  try {
    await sitzung.bereit();b=sitzung.b;e=sitzung.e;
    await e.zuruecksetzen();await b.frisch();const grund=await b.wert(inventarQuelle);
    await erweitern(); const erweitert = await b.wert(inventarQuelle);
    const inventar=new Map();
    for(const z of grund.filter(z=>z.sichtbar&&!z.gesperrt&&z.tabIndex>=0))inventar.set(z.selector,{...z,aufbau:'grund'});
    for(const z of erweitert.filter(z=>z.sichtbar&&!z.gesperrt&&z.tabIndex>=0))inventar.set(z.selector,{...z,aufbau:'erweitert'});
    ziele=[...inventar.values()];
    bestaetige(Array.isArray(ziele) && ziele.length > 0, 'Inventar für Pseudozustände fehlt.');
  } catch(fehler) {inventarfehler=fehler;ziele=[];sitzung.verwerfen();}
  const kontrastfaelle = [['normal', async fall => { await e.zuruecksetzen(); await b.frisch(); await kontrastfall(fall); }],
    ['erweiterungen',async fall=>{await erweitern();await kontrastfall(fall);}],
    ['warnung', async fall => { await warnung(); await kontrastfall(fall); }]];
  if(inventarfehler)kontrastfaelle.push(['zustandsinventar',async()=>{throw inventarfehler;}]);
  for (const ziel of ziele.filter(z => z.sichtbar && !z.gesperrt && z.tabIndex >= 0)) for (const zustand of ['hover','focus-visible']) {
    kontrastfaelle.push([`${zustand === 'hover' ? 'hover' : 'fokus'}-${ziel.kennung}`, async fall => {
      if(ziel.aufbau==='erweitert')await erweitern();else{await e.zuruecksetzen();await b.frisch();}
      await b.send('CSS.enable');
      await b.send('Input.dispatchMouseEvent', { type:'mousePressed', x:1, y:1, button:'left',clickCount:1 });
      await b.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:1, y:1, button:'left',clickCount:1 });
      const selector=ziel.typ==='file'?'.file-button':ziel.selector;
      const pseudo=ziel.typ==='file'&&zustand==='focus-visible'?'focus-within':zustand;
      if(ziel.typ==='file')bestaetige(await b.wert(`(() => {const e=document.querySelector(${JSON.stringify(ziel.selector)});return e.labels?.length===1&&e.labels[0].matches('.file-button');})()`),'Bemalte Dateiauswahl nicht eindeutig zugeordnet.');
      if(zustand==='hover') {
        fall.messungen.zustand={};
        await hoverMessen(b,selector,fall.messungen.zustand);
        const proben=fall.messungen.zustand.aufnahmen=[];
        const bestaetigen=async bild=>{
          const m=await b.wert(hoverQuelle(selector));proben.push({bild,hover:m?.hover,stabil:m?.stabil});
          bestaetige(m?.hover===true&&m.stabil===true,'Hoverzustand während der Aufnahme nicht bestätigt.');
        };
        try {
          await b.mitBildzustand({vorbereiten:bestaetigen,bestaetigen},async()=>{
            try { await kontrastfall(fall); }
            finally { fall.bild=await b.bild(`b9-${fall.name}.png`,{selector}); }
          });
        } finally {
          try {
            await bestaetigen('vor Zurücksetzen');
            await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0.5,y:0.5,button:'none',buttons:0});
            const m=await b.wert(hoverQuelle(selector));
            fall.messungen.zustand.zurueckgesetzt={hover:m?.hover,stabil:m?.stabil,bestaetigt:m?.hover===false&&m.stabil===true};
            bestaetige(fall.messungen.zustand.zurueckgesetzt.bestaetigt,'Hoverzustand nicht bestätigt zurückgesetzt.');
          } catch(fehler) {sitzung.verwerfen();throw fehler;}
        }
        return;
      }
      const normalbild=await b.bild(`b9-normal-${ziel.kennung}.png`,{selector});
      fall.messungen.zustand={selector,zustand:pseudo,bedienelement:ziel.selector};
      let messung;
      try {messung=await pseudoMessung(b,selector,pseudo,fall.messungen.zustand);}
      catch(fehler) {sitzung.verwerfen();throw fehler;}
      try {
        await b.mitBildzustand(messung,async()=>{
          try { await kontrastfall(fall); }
          finally {
            fall.bild=await b.bild(`b9-${fall.name}.png`,{selector});
            const beleg=name=>protokoll.bildbelege?.find(b=>b.datei===name);
            fall.messungen.zustand.bildwechsel=bestaetigeBildwechsel(beleg(normalbild),beleg(fall.bild));
          }
        });
      } finally {
        try {await messung.zuruecksetzen();}
        catch(fehler) {sitzung.verwerfen();throw fehler;}
      }
    }]);
  }
  await gruppe('B9', 'WCAG-Kontrast aus berechneten Farben in allen sichtbaren Zuständen', kontrastfaelle);
  await gruppe('B10', 'Phase, Warnung und Fristtyp bleiben ohne Farbinformation beschriftet',
    ['achromatopsia','protanopia','deuteranopia','tritanopia','forced-colors'].map(typ => [typ, async fall => {
      await warnung();
      const {calculateSchedule}=await import('@baremos/fristenrechner-kern');
      const projekt=await b.bis(async()=>{
        const roh=await b.wert('localStorage.getItem("baremos-fristenrechner-projekt-v1")');
        if(!roh)return false;const p=JSON.parse(roh);return p.input?.fristen?.angebotsfristKT===1?p:false;
      },'Gespeicherte Eingabe zur Textreferenz',{produkt:true});
      const rechnung=calculateSchedule(projekt.input),typtexte={gesetzlich:'Gesetzliche Frist',praxis:'Praxiswert',intern:'Interne Planung',eingabe:'Eingabe'};
      bestaetige(rechnung.meilensteine.every(m=>typtexte[m.fristTyp]),'Unbekannter Fristtyp in der berechneten Referenz.');
      const erwartet={phasen:rechnung.phasen.map(p=>p.label),typen:rechnung.meilensteine.map(m=>typtexte[m.fristTyp]),warnungen:[...rechnung.warnungen,...rechnung.meilensteine.flatMap(m=>m.warnungen)]};
      fall.messungen.referenz={input:projekt.input,erwartet};
      const vorher = await b.wert(textzuordnungQuelle); pruefeTextzuordnung(vorher,null,erwartet);
      fall.messungen.emulation = typ === 'forced-colors' ? await e.medien({ forced:true }) : await e.sehschwaeche(typ);
      await b.bildkanalVorbereiten();
      fall.messungen.aufnahmeEmulation=await e.messen();
      pruefeEmulation(fall.messungen.aufnahmeEmulation,{innerWidth:1280,devicePixelRatio:1,schrift:16,visuelleSkala:1,forced:typ==='forced-colors'});
      fall.messungen.text = await b.wert(textzuordnungQuelle); pruefeTextzuordnung(fall.messungen.text, vorher,erwartet);
    }, 'Phase, Warnung und Fristtyp sind im Bild ohne Farbinformation verständlich und ihrem Termin zuzuordnen.']));
  await gruppe('B11', 'Reduzierte Bewegung: Berechnen fordert kein animiertes Scrollen an', [false,true].map(reduziert => [reduziert ? 'reduziert' : 'normal', async fall => {
    await e.zuruecksetzen(); await b.frisch(); fall.messungen.emulation = await e.medien({ reduziert });
    await b.wert('__messScroll.length=0'); await b.berechnen({ maus:true });
    const aufrufe = await b.bis(async()=>{const a=await b.wert('__messScroll.filter(e=>e.id==="schedule-results")');return a.length===1&&a[0].bilder?.length===30?a:false;},'30 Zeitpunkte der Scrollbewegung');
    const css = await b.wert(`['html','body','#schedule-results'].map(s=>({selector:s,scrollBehavior:getComputedStyle(document.querySelector(s)).scrollBehavior}))`);
    fall.messungen.scroll = { aufrufe, css };
    pruefeBewegung({...fall.messungen.scroll,reduziert});
  }]));
  const bilder=await schreibeSichtpruefung(ausgabe, sicht);
  protokoll.sichtpruefung = { datei:'sichtpruefung.json', bilder };
  protokoll.grenzen.push(MESSGRENZEN.browserzoom.grund+' '+MESSGRENZEN.browserzoom.ersatz,
    'Native Kontrollgrafiken, nicht bestimmbare Farben und Hintergründe sind keine geschätzten Kontrastwerte.',
    'Bildsichtung beurteilt Lesbarkeit und Zuordnung. Scrollmessung erfasst die Originalaufrufe und CSS, keine Wahrnehmung durch Screenreader.');
}
