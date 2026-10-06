import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { bestaetige } from './regeln.mjs';
import { messbefehl } from './fehler.mjs';
import { bestaetigeSichtausschnitt } from './belege.mjs';
import { grenzenBestaetigt } from './ergebniskatalog.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function sichtstatusBestaetigt(p,r) {
  if(!((p.phase==='darstellung'&&['B7','B9','B10'].includes(r.id))||(p.phase==='tastatur'&&r.id==='B1')))return false;
  const faelle=r.details?.teilfaelle;
  if(!Array.isArray(faelle)||!faelle.length||faelle.some(f=>!f||!['bestanden','dokumentierte Grenze'].includes(f.status))
    ||faelle.some(f=>f.status==='dokumentierte Grenze')&&!grenzenBestaetigt(r.id,faelle))return false;
  if(r.id==='B9'&&(!faelle.some(f=>f.grenzen?.length)||faelle.some(f=>f.grenzen?.length&&(!f.sichtbilder?.length||f.grenzen.some(g=>g.kennung!=='native-kontrollgrafik'||!g.selector)))))return false;
  const bilder=p.phase==='darstellung'&&r.id!=='B9'?faelle.filter(f=>f.status!=='dokumentierte Grenze').map(f=>f.bild):faelle.flatMap(f=>f.sichtbilder??[]);
  return bilder.length>0&&new Set(bilder).size===bilder.length&&bilder.every(bild=>typeof bild==='string'&&p.sichtpruefung?.bilder?.some(b=>{
    if(b.id!==r.id||b.bild!==bild||!/^[a-f0-9]{64}$/.test(b.sha256??''))return false;
    if(b.belegart!=='Elementausschnitte')return true; // Archivierte Vollbildvermerke.
    try {
      bestaetige(b.ausschnitte?.length>0&&b.vollbild?.datei===bild&&b.vollbild.sha256===b.sha256,'Ausschnittinventar fehlt.');
      b.ausschnitte.forEach(bestaetigeSichtausschnitt);return true;
    } catch{return false;}
  }));
}
export function grenzstatusBestaetigt(p,r) {
  if(!grenzenBestaetigt(r.id,r.details?.teilfaelle)||!sichtstatusBestaetigt(p,r))return false;
  const bilder=p.sichtpruefung.bilder.filter(b=>b.id===r.id),vermerke=r.sichtvermerke;
  return Array.isArray(vermerke)&&vermerke.length===bilder.length&&bilder.every(b=>vermerke.some(v=>
    v.bild===b.bild&&v.sha256===b.sha256&&v.id===b.id&&v.ergebnis==='bestanden'&&v.wer&&v.wann&&v.bemerkung));
}
const namePruefen = name => bestaetige(typeof name === 'string' && /^[a-z0-9][a-z0-9_.-]*\.png$/.test(name), 'Ungültiger Bildname.');
function lesen(wurzel, name) {
  const p = join(wurzel, name), info = lstatSync(p);
  bestaetige(info.isFile() && !info.isSymbolicLink() && dirname(realpathSync(p)) === realpathSync(wurzel), 'Beleg liegt nicht als reguläre Datei im Laufordner.');
  return readFileSync(p);
}
export async function schreibeSichtpruefung(ordner, bilder) {
  return messbefehl(() => {
    const pruefungen = bilder.map(({ id, bild, kriterium, ausschnitte, vollbild }) => {
      namePruefen(bild);
      bestaetige(Array.isArray(ausschnitte)&&ausschnitte.length>0,'Neue Sichtbelege benötigen Elementausschnitte.');
      bestaetige(vollbild?.datei===bild&&vollbild.sha256===hash(lesen(ordner,bild)),'Vollbild-Messbeleg fehlt oder ist verändert.');
      for(const a of ausschnitte){bestaetigeSichtausschnitt(a);namePruefen(a.datei);bestaetige(a.sha256===hash(lesen(ordner,a.datei)),'Ausschnitt stimmt nicht mit dem Messbeleg überein.');}
      bestaetige(new Set(ausschnitte.map(a=>a.datei)).size===ausschnitte.length&&!ausschnitte.some(a=>a.datei===bild),'Doppelter Ausschnitt oder Vollbild als Ausschnitt.');
      return { id, bild, kriterium, sha256:vollbild.sha256, belegart:'Elementausschnitte', ausschnitte, vollbild,
        ergebnis:'Sichtprüfung ausstehend', wer:'', wann:'', bemerkung:'' };
    });
    writeFileSync(join(ordner,'sichtpruefung.json'), JSON.stringify({ schema:2, beurteilt:'Die gehashten Elementausschnitte; das Vollbild bleibt ergänzender Beleg.', pruefungen },null,2)+'\n');
    return pruefungen.map(({ergebnis,wer,wann,bemerkung,...beleg})=>beleg);
  });
}
export function sichtEntscheiden(daten, bilder) {
  bestaetige([1,2].includes(daten?.schema) && Array.isArray(daten.pruefungen) && Array.isArray(bilder) && bilder.length > 0, 'Sichtprüfbelege fehlen.');
  bestaetige(bilder.every(b=>daten.schema===(b.belegart==='Elementausschnitte'?2:1)),'Sichtschema passt nicht zum ursprünglichen Lauf.');
  const erwartet = bilder.map(b=>b.bild), gesehen = new Set();
  bestaetige(new Set(erwartet).size === erwartet.length, 'Doppeltes Bild im Sichtinventar.');
  for (const p of daten.pruefungen) {
    const b = bilder.find(b=>b.bild===p.bild);
    bestaetige(b && !gesehen.has(p.bild) && p.id === b.id && p.kriterium === b.kriterium && p.sha256 === b.sha256, 'Unbekannter, doppelter oder veränderter Sichtbeleg.');
    if(daten.schema===2) {
      bestaetige(p.belegart===b.belegart&&JSON.stringify(p.ausschnitte)===JSON.stringify(b.ausschnitte)
        &&JSON.stringify(p.vollbild)===JSON.stringify(b.vollbild),'Ausschnitthash, Elementidentität oder Messgeometrie des Sichtvermerks verändert.');
    }
    gesehen.add(p.bild);
    bestaetige(['bestanden','nicht bestanden','Sichtprüfung ausstehend'].includes(p.ergebnis), 'Unbekanntes Sichtergebnis.');
    if (p.ergebnis === 'Sichtprüfung ausstehend') {
      bestaetige(p.wer === '' && p.wann === '' && p.bemerkung === '', 'Unvollständiger Prüfvermerk.');
    } else {
      bestaetige([p.wer,p.bemerkung].every(v=>typeof v==='string' && v.trim() && v.length<=4000 && !/[\u0000-\u001f\u007f]/.test(v))
        && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(p.wann ?? '')
        && Number.isFinite(Date.parse(p.wann)) && new Date(p.wann).toISOString().slice(0,10) === p.wann.slice(0,10), 'Prüfvermerk braucht Person, gültiges Datum und Bemerkung.');
    }
  }
  bestaetige(gesehen.size === erwartet.length, 'Sichtprüfkennung fehlt.');
  return daten.pruefungen;
}
export async function sichtAuswerten(ordner, protokoll) {
  return messbefehl(() => {
    bestaetige(['darstellung','tastatur'].includes(protokoll.phase) && Array.isArray(protokoll.sichtpruefung?.bilder), 'Phasenprotokoll mit Sichtinventar fehlt.');
    const bilder = protokoll.sichtpruefung.bilder.map(b => {
      namePruefen(b.bild); const bytes = lesen(ordner,b.bild);
      bestaetige(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Sichtbeleg ist kein PNG.');
      bestaetige(/^[a-f0-9]{64}$/.test(b.sha256??'')&&b.sha256===hash(bytes),'Bild stimmt nicht mit dem ursprünglichen Laufbeleg überein.');
      if(b.belegart==='Elementausschnitte') {
        bestaetige(Array.isArray(b.ausschnitte)&&b.ausschnitte.length>0&&b.vollbild?.sha256===b.sha256&&b.vollbild.datei===b.bild,'Sichtinventar ohne Ausschnitte oder Vollbild.');
        for(const a of b.ausschnitte) {
          bestaetigeSichtausschnitt(a);namePruefen(a.datei);const bytes=lesen(ordner,a.datei);
          bestaetige(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&hash(bytes)===a.sha256,'Ausschnitt stimmt nicht mit dem ursprünglichen Laufbeleg überein.');
        }
      }
      return { ...b };
    });
    if(!bilder.length) {
      bestaetige(!protokoll.ergebnisse.some(r=>r.status==='Sichtprüfung ausstehend'),'Sichtstatus ohne Bilder.');
      return structuredClone(protokoll);
    }
    // Elementausschnitte tragen Geometrie und AX-Zuordnung; keine Bilddaten.
    const grenze=bilder.every(b=>b.belegart==='Elementausschnitte')?16*1024*1024:1024*1024;
    const roh = lesen(ordner,'sichtpruefung.json'); bestaetige(roh.length<=grenze,'Sichtprotokoll zu groß.');
    const vermerke = sichtEntscheiden(JSON.parse(roh.toString('utf8')),bilder);
    const neu = structuredClone(protokoll);
    for (const r of neu.ergebnisse.filter(r=>['Sichtprüfung ausstehend','dokumentierte Grenze'].includes(r.status))) {
      bestaetige(sichtstatusBestaetigt(protokoll,r),
        'Sichtstatus besitzt keine vollständig bestandenen automatischen Teilfälle.');
      const gruppe = vermerke.filter(p=>p.id===r.id);
      bestaetige(gruppe.length>0,'Sichtgruppe fehlt.');
      r.status = gruppe.some(p=>p.ergebnis==='nicht bestanden') ? 'nicht bestanden'
        : gruppe.some(p=>p.ergebnis==='Sichtprüfung ausstehend') ? 'Sichtprüfung ausstehend'
        : r.details.teilfaelle.some(f=>f.status==='dokumentierte Grenze')?'dokumentierte Grenze':'bestanden';
      r.sichtvermerke=gruppe;
    }
    return neu;
  });
}
