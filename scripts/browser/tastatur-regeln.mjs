import { bestaetige, verlange, farbe } from './regeln.mjs';

export function pruefeTastaturzyklus(weg,fokus,axFokus=null) {
  bestaetige(typeof fokus?.kennung==='string','Fokus liegt an einem nicht inventarisierten Knoten.');
  const schritt={kennung:fokus.kennung,selector:fokus.selector??null,axNodeId:axFokus?.nodeId??null};
  const anfang=weg.findIndex(s=>s.kennung===schritt.kennung&&s.axNodeId===schritt.axNodeId);
  weg.push(schritt);
  verlange(anfang<0,'Tastaturfalle: wiederkehrender Fokuszyklus ohne Erreichen des Dokumentendes.',
    {art:'Tastaturfalle',elemente:[...new Set(weg.slice(anfang).map(s=>s.kennung))],zyklus:weg.slice(anfang)});
}

export function pruefeFokus(m) {
  bestaetige(m&&!m.unbestimmt,'Visuelle Zuordnung des Tastaturfokus fehlt.');
  bestaetige(m && [m.breite,m.hoehe,m.links,m.rechts,m.oben,m.unten,m.innerWidth,m.innerHeight].every(Number.isFinite)
    && m.breite>0 && m.hoehe>0 && m.innerWidth>0 && m.innerHeight>0, 'Fokusrechteck nicht messbar.');
  // Eine höhere Datentabelle kann mit ihren beiden seitlichen Fokuslinien
  // sichtbar sein, während Ober- und Unterkante außerhalb des Viewports liegen.
  const vertikal=m.datentabelle&&m.hoehe>m.innerHeight ? Math.min(m.unten,m.innerHeight)-Math.max(m.oben,0)>2 : m.oben>=-1&&m.unten<=m.innerHeight+1;
  verlange(m.sichtbar && m.treffer && m.links>=-1 && m.rechts<=m.innerWidth+1 && vertikal,
    'Tastaturfokus ist unsichtbar, verdeckt oder außerhalb des Viewports.',m);
  const ring=m.outlineBreite>0 && !['none','hidden'].includes(m.outline) && farbe(m.outlineFarbe)[3]>0;
  // :focus-visible am Host bildet den Fokus der nativen Datumsteile nicht ab.
  // Geometrie/Verdeckung bleiben pflichtig, der innere Indikator braucht Bilder.
  if(m.nativeGrafik&&['date','time','datetime-local','month','week'].includes(m.typ)&&!ring)
    return {sichtpruefung:true,kriterium:'Der native Fokusindikator ist am fokussierten Teilfeld sichtbar.'};
  verlange(m.fokusVisible,'Tastaturfokus ist nicht als sichtbar bestätigt.',m);
  if(!ring)bestaetige(m.normal&&m.boxSchatten==='none'&&m.normal.boxSchatten===m.boxSchatten&&m.normal.hintergrund===m.hintergrund
    &&m.normal.rahmen===m.rahmen,'Möglicher alternativer Fokusindikator ist nicht eindeutig bestimmt.');
  verlange(ring, 'Kein bestätigter sichtbarer Fokusrahmen.',m);
}
export function pruefeAx(nodes, elemente) {
  bestaetige(Array.isArray(nodes) && nodes.length>0 && nodes.every(n=>typeof n.nodeId==='string') && Array.isArray(elemente) && elemente.length>0, 'Barrierebaum oder Bedieninventar fehlt.');
  const befunde=[];
  for (const e of elemente) {
    bestaetige(Number.isInteger(e.backendNodeId) && e.backendNodeId>0, `DOM-Zuordnung fehlt: ${e.selector}`);
    const kandidaten=nodes.filter(n=>n.backendDOMNodeId===e.backendNodeId);
    // Vollständiger AX-Abruf und positive DOM-Zuordnung sind zuerst bestätigt.
    // Erst dann ist das Fehlen eines zugänglichen Knotens ein Produktbefund.
    const n=kandidaten.find(n=>!n.ignored);
    if(!n || typeof n.role?.value!=='string' || !n.role.value.trim() || ['none','generic','Unknown'].includes(n.role.value)
      || typeof n.name?.value!=='string' || !n.name.value.trim()) befunde.push({selector:e.selector,knoten:kandidaten});
  }
  verlange(!befunde.length,'Bedienbare Elemente ohne Rolle oder zugänglichen Namen.',befunde);
  return {elemente:elemente.length,knoten:nodes.length};
}
export function bestaetigeAxBaum(nodes, frameId) {
  bestaetige(Array.isArray(nodes)&&nodes.length>0&&typeof frameId==='string'&&frameId,'AX-Frame oder Baum fehlt.');
  const ids=nodes.map(n=>n.nodeId);
  bestaetige(ids.every(id=>typeof id==='string'&&id)&&new Set(ids).size===ids.length,'AX-Knotenkennungen fehlen oder sind doppelt.');
  const wurzeln=nodes.filter(n=>n.role?.value==='RootWebArea');
  bestaetige(wurzeln.length===1&&wurzeln[0].frameId===frameId&&!wurzeln[0].ignored&&wurzeln[0].name?.value,'AX-Baum gehört nicht zum bestätigten Hauptframe.');
  bestaetige(nodes.every(n=>(n.childIds??[]).every(id=>ids.includes(id))),'Vollständiger AX-Baum enthält nicht gelieferte Kinder.');
  return nodes;
}
export function nativerFokus(nodes, backendNodeId) {
  bestaetige(Array.isArray(nodes)&&nodes.length>0&&Number.isInteger(backendNodeId)&&backendNodeId>0,'Natives Fokusinventar fehlt.');
  const vorfahren=n=>{
    const kette=[],besucht=new Set();
    while(n&&!besucht.has(n.nodeId)){besucht.add(n.nodeId);kette.push(n);n=nodes.find(p=>p.nodeId===n.parentId);}
    return kette;
  };
  const fokussiert=nodes.filter(n=>!n.ignored&&n.properties?.some(p=>p.name==='focused'&&p.value?.value===true));
  const blaetter=fokussiert.filter(n=>!fokussiert.some(anderer=>anderer.nodeId!==n.nodeId&&vorfahren(anderer).some(p=>p.nodeId===n.nodeId)));
  bestaetige(blaetter.length===1&&blaetter[0].name?.value,'Natives Unterfeld hat keinen eindeutig benannten Fokus.');
  const kette=vorfahren(blaetter[0]);
  bestaetige(kette.some(n=>n.backendDOMNodeId===backendNodeId),'Natives Unterfeld ist nicht dem aktiven Datum-/Zeitfeld zugeordnet.');
  return {nodeId:blaetter[0].nodeId,kette};
}
export function pruefeLive(m, ziel) {
  bestaetige(m?.fokus && Array.isArray(m.regionen) && m.regionen.length>0, 'Fokus- und Live-Region-Lage fehlt.');
  const region=m.regionen.find(r=>r.id===ziel);
  verlange(region?.sichtbar && region.text && (region.enthaeltFokus || region.rolle==='alert' || region.rolle==='status' || ['polite','assertive'].includes(region.live)),
    `Ergebnis oder Fehler weder fokussiert noch in einer sichtbaren Live-Region: ${ziel}`,m);
  verlange(m.fokus.verbunden && m.fokus.sichtbar && m.fokus.tag!=='BODY','Fokus nach der Aktion verloren.',m);
  return {ziel,region,fokus:m.fokus};
}
export function pruefeFehlerStatus(m,vorher) {
  bestaetige(m&&typeof m.text==='string'&&Array.isArray(m.statusmeldungen)&&Array.isArray(vorher?.statusmeldungen), 'Vorher-/Nachher-Zuordnung der Statusmeldungen fehlt.');
  const vollstaendig=liste=>liste.length>0&&liste.every(s=>typeof s.id==='string'&&s.id&&typeof s.text==='string')&&new Set(liste.map(s=>s.id)).size===liste.length;
  bestaetige(vollstaendig(m.statusmeldungen)&&vollstaendig(vorher.statusmeldungen)
    &&JSON.stringify(m.statusmeldungen.map(s=>s.id).sort())===JSON.stringify(vorher.statusmeldungen.map(s=>s.id).sort()),'Statusregionen vor und nach der Aktion sind nicht vollständig zugeordnet.');
  // Nur vollständige Erfolgsaussagen. Insbesondere ist "konnte nicht ...
  // gespeichert werden" eine Fehlererklärung, keine Erfolgsmeldung.
  // Exporttexte: web-vorgaben.ts, fristenrechner-export-action.ts (Web-Teilen)
  // und app/src/pages/index.astro (Speichern/Teilen in der App).
  const erfolg=/^(?:Terminplan aktualisiert\.|Projektdatei geöffnet(?:\.| \([^\n]+\)\.)|(?:Projektdatei|Excel-Datei|PDF) (?:gespeichert|zum Teilen bereitgestellt)\.|Die Datei wurde erstellt und zum Speichern bereitgestellt\.|Die (?:Projektdatei|Excel-Datei|PDF-Datei) wurde zum Teilen bereitgestellt\.)(?:\s|$)/;
  const falsch=m.statusmeldungen.filter(s=>erfolg.test(s.text)
    && (s.id==='form-message'&&/Kein Terminplan/.test(m.text)||s.text!==vorher.statusmeldungen.find(v=>v.id===s.id)?.text));
  verlange(!falsch.length,'Gleichzeitige falsche Erfolgsmeldung.',falsch);
  return {vorher:vorher.statusmeldungen,nachher:m.statusmeldungen};
}
export function pruefeFehlermeldung(m, { datei=false, vorher }={}) {
  bestaetige(m && typeof m.text==='string' && Array.isArray(m.felder), 'Fehlermeldung oder Feldlage nicht gemessen.');
  verlange(m.sichtbar && m.text.trim().length>15, 'Fehlende verständliche Fehlererklärung.',m);
  pruefeFehlerStatus(m,vorher);
  return pruefeFeldbezug(m,{datei});
}
export function pruefeFeldbezug(m,{datei=false}={}) {
  bestaetige(m&&typeof m.text==='string'&&Array.isArray(m.felder),'Feldbezug nicht gemessen.');
  if(datei) verlange(/Datei|Projekt|JSON|Schema|lesen|öffnen/i.test(m.text) && m.felder.some(f=>f.selector==='#open-json' && f.beschriftung), 'Dateifehler ohne erkennbaren Bezug zum Import.',m);
  else {
    const f=m.felder.find(f=>f.selector==='[name="teststellungStart"]');
    bestaetige(f&&typeof f.wert==='string'&&typeof f.gruppentext==='string','Wert und Umgebung des Konfliktfelds nicht gemessen.');
    const datum=/^\d{4}-\d{2}-\d{2}$/.test(f.wert)?f.wert.split('-').reverse().join('.'):null;
    // Die Matrix verlangt einen verständlichen Bezug, keine bestimmte ARIA-
    // Technik. Benannte Phase, aktueller Termin und beschriftete Gruppe zählen.
    verlange(f.beschriftung&&datum&&m.text.includes(datum)&&/Teststellung/i.test(m.text)&&/Teststellung/i.test(f.gruppentext), 'Startkonflikt ohne Bezug zu einem betroffenen Feld.',m);
  }
  return m;
}
export function importReaktion(text,vorher) {
  return typeof text==='string'&&text.trim()!==''&&text!==vorher&&text!=='Projektdatei auswählen …';
}
export function pruefeImportFehler(text,erwartet) {
  bestaetige(typeof erwartet==='string'&&erwartet.length>15,'Erwarteter Fehler der Testdatei fehlt.');
  verlange(typeof text==='string'&&text===erwartet,'Import meldet nicht den belegten Dateifehler.',{erwartet,gemessen:text});
}
export function bestaetigeLeseprobe(liste,{name,bytes}) {
  bestaetige(typeof name==='string'&&name&&Number.isInteger(bytes)&&bytes>=0&&Array.isArray(liste)
    &&liste.length===1&&liste[0].name===name&&liste[0].bytes===bytes,'Lesefehler-Simulation nicht genau einmal am ausgewählten File.text bestätigt.');
  return liste[0];
}
