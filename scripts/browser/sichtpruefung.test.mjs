import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sichtEntscheiden, sichtAuswerten, schreibeSichtpruefung as schreibeNeueSichtpruefung } from './sichtpruefung.mjs';
import { Messfehler } from './fehler.mjs';
import { auswerten } from './auswertung.mjs';
import { ERGEBNISKATALOG } from './ergebniskatalog.mjs';
const sha='a'.repeat(64),bilder=[{id:'B7',bild:'b7-320.png',kriterium:'Lesbarkeit',sha256:sha}];
const vermerk=extra=>({...bilder[0],ergebnis:'bestanden',wer:'Prüfperson',wann:'2026-10-05',bemerkung:'Alle Beschriftungen erkennbar.',...extra});
async function schreibeSichtpruefung(ordner,bilder) {
  const belege=bilder.map(b=>{
    const bytes=readFileSync(join(ordner,b.bild)),sha256=createHash('sha256').update(bytes).digest('hex'),datei=b.bild.replace('.png','-ausschnitt.png');
    const crop=Buffer.from(bytes);crop.write('IHDR',12);crop.writeUInt32BE(134,16);crop.writeUInt32BE(74,20);writeFileSync(join(ordner,datei),crop);
    const cropHash=createHash('sha256').update(crop).digest('hex');
    const rechteck={links:10,oben:20,rechts:110,unten:50,breite:100,hoehe:30};
    return {...b,vollbild:{datei:b.bild,sha256,breite:1280,hoehe:3401},ausschnitte:[{datei,sha256:cropHash,breite:134,hoehe:74,dichte:1,
      viewportRechteck:rechteck,rollstand:{x:0,y:0},dokumentRechteck:rechteck,clip:{x:0,y:0,width:134,height:74,scale:1},
      element:{kennung:'7',selector:'[name="bekanntmachung"]',backendNodeId:97,axNodeId:'97',rolle:'Date',name:'Bekanntmachung'}}]};
  });
  return schreibeNeueSichtpruefung(ordner,belege);
}

test('Native B9-Grenze braucht ein gebundenes Bild; Sichtung ersetzt keine fehlenden oder negativen automatischen Kontraste',async()=>{
  const basis=resolve('scratchpad/test-sichtpruefung');mkdirSync(basis,{recursive:true});const ordner=mkdtempSync(join(basis,'lauf-'));
  try {
    const bild='b9-native-verfahren_mit_tnw.png';
    writeFileSync(join(ordner,bild),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)]));
    const original=await schreibeSichtpruefung(ordner,[{id:'B9',bild,kriterium:'Native Kontrollgrafik'}]);
    const p={phase:'darstellung',ergebnisse:ERGEBNISKATALOG.darstellung.map(id=>({id,status:'bestanden'})),sichtpruefung:{bilder:original}};
    const r=p.ergebnisse.find(r=>r.id==='B9');Object.assign(r,{status:'Sichtprüfung ausstehend',details:{teilfaelle:[{status:'bestanden',sichtbilder:[bild],grenzen:[{kennung:'native-kontrollgrafik',selector:'[name="elektronischeAbgabe"]'}]}]}});
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,4);
    const daten=JSON.parse(readFileSync(join(ordner,'sichtpruefung.json'),'utf8'));Object.assign(daten.pruefungen[0],{ergebnis:'bestanden',wer:'Prüfperson',wann:'2026-10-06',bemerkung:'Markierung sichtbar.'});writeFileSync(join(ordner,'sichtpruefung.json'),JSON.stringify(daten));
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,0);
    for(const status of ['ungültig','nicht bestanden']){r.details.teilfaelle[0].status=status;await assert.rejects(()=>sichtAuswerten(ordner,p),Messfehler);}
    r.details.teilfaelle[0].status='bestanden';r.details.teilfaelle[0].sichtbilder=[];assert.equal(auswerten(p).code,2);
    r.details.teilfaelle[0].sichtbilder=[bild];r.details.teilfaelle[0].grenzen[0].kennung='unbekannt';assert.equal(auswerten(p).code,2);
  } finally {assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});}
});
test('Sichtprüfung: vollständiger Vermerk oder vollständig ausstehend, niemals automatisch bestanden',()=>{
  assert.equal(sichtEntscheiden({schema:1,pruefungen:[vermerk()]},bilder)[0].ergebnis,'bestanden');
  assert.equal(sichtEntscheiden({schema:1,pruefungen:[vermerk({ergebnis:'Sichtprüfung ausstehend',wer:'',wann:'',bemerkung:''})]},bilder)[0].ergebnis,'Sichtprüfung ausstehend');
});
for(const [name,aenderung]of [['falsche Prüfsumme',{sha256:'b'.repeat(64)}],['unbekanntes Bild',{bild:'anders.png'}],['fehlende Person',{wer:''}],['fehlende Bemerkung',{bemerkung:''}],['ungültiges Datum',{wann:'2026-02-30'}],['falsche Gruppe',{id:'B10'}],['verändertes Kriterium',{kriterium:'anderes'}],['unbekannter Status',{ergebnis:'ok'}],['unvollständiger Vermerk',{ergebnis:'Sichtprüfung ausstehend'}]])test(`Sichtprüfung-Gegenprobe: ${name}`,()=>assert.throws(()=>sichtEntscheiden({schema:1,pruefungen:[vermerk(aenderung)]},bilder),Messfehler));
test('Sichtprüfung verwirft doppelte/fehlende Kennungen und unbekanntes Format',()=>{
  for(const d of [{schema:2,pruefungen:[vermerk()]},{schema:1,pruefungen:[]},{schema:1,pruefungen:[vermerk(),vermerk()]}])assert.throws(()=>sichtEntscheiden(d,bilder),Messfehler);
});
test('Dateiauswertung bindet den menschlichen Vermerk an das Originalbild und lässt automatische Fehler stehen',async()=>{
  const basis=resolve('scratchpad/test-sichtpruefung');mkdirSync(basis,{recursive:true});const ordner=mkdtempSync(join(basis,'lauf-'));
  try {
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)]);writeFileSync(join(ordner,'b7-320.png'),png);
    const original=await schreibeSichtpruefung(ordner,bilder.map(({sha256,...b})=>b));
    const p={phase:'darstellung',ergebnisse:ERGEBNISKATALOG.darstellung.map(id=>({id,status:'bestanden'})),sichtpruefung:{bilder:original}};
    p.ergebnisse[0].status='Sichtprüfung ausstehend';p.ergebnisse[0].details={teilfaelle:[{status:'bestanden',bild:'b7-320.png'}]};
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,4);
    const daten=JSON.parse(readFileSync(join(ordner,'sichtpruefung.json'),'utf8'));Object.assign(daten.pruefungen[0],vermerk({sha256:original[0].sha256}));writeFileSync(join(ordner,'sichtpruefung.json'),JSON.stringify(daten));
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,0);assert.equal(p.ergebnisse[0].status,'Sichtprüfung ausstehend','Rohprotokoll unverändert');
    p.ergebnisse[1].status='nicht bestanden';assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,1);
    const veraendert=Buffer.concat([png,Buffer.from('verändert')]);writeFileSync(join(ordner,'b7-320.png'),veraendert);daten.pruefungen[0].sha256=createHash('sha256').update(veraendert).digest('hex');writeFileSync(join(ordner,'sichtpruefung.json'),JSON.stringify(daten));
    await assert.rejects(()=>sichtAuswerten(ordner,p),Messfehler);
  } finally {assert.ok(ordner.startsWith(basis));rmSync(ordner,{recursive:true,force:true});}
});
test('B1-Sichtung bindet jedes native Fokusbild; ein unvollständiger Rundgang wird durch Bildsichtung niemals bestanden',async()=>{
  const basis=resolve('scratchpad/test-sichtpruefung');mkdirSync(basis,{recursive:true});const ordner=mkdtempSync(join(basis,'lauf-'));
  try {
    writeFileSync(join(ordner,'fokus.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)]));
    const original=await schreibeSichtpruefung(ordner,[{id:'B1',bild:'fokus.png',kriterium:'Nativer Fokus'}]);
    const p={phase:'tastatur',ergebnisse:ERGEBNISKATALOG.tastatur.map(id=>({id,status:'bestanden'})),sichtpruefung:{bilder:original}};
    p.ergebnisse[0]={id:'B1',status:'Sichtprüfung ausstehend',details:{teilfaelle:[{status:'bestanden',sichtbilder:['fokus.png']}]}};
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,4);
    const daten=JSON.parse(readFileSync(join(ordner,'sichtpruefung.json'),'utf8'));Object.assign(daten.pruefungen[0],{ergebnis:'bestanden',wer:'Prüfperson',wann:'2026-10-05',bemerkung:'Fokus im Teilfeld sichtbar.'});writeFileSync(join(ordner,'sichtpruefung.json'),JSON.stringify(daten));
    assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,0);
    p.ergebnisse[0].details.teilfaelle[0].status='ungültig';await assert.rejects(()=>sichtAuswerten(ordner,p),Messfehler);
    p.ergebnisse[0].status='ungültig';assert.equal(auswerten(await sichtAuswerten(ordner,p)).code,2);
  } finally {assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});}
});
test('Neue Sichtvermerke binden Ausschnitthash, Dokumentlage und AX-Namen; archivierte Vollbildvermerke bleiben lesbar',async()=>{
  const basis=resolve('scratchpad/test-sichtpruefung');mkdirSync(basis,{recursive:true});const ordner=mkdtempSync(join(basis,'lauf-'));
  try {
    writeFileSync(join(ordner,'fokus.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)]));
    const original=await schreibeSichtpruefung(ordner,[{id:'B1',bild:'fokus.png',kriterium:'Nativer Fokus'}]);
    const daten=JSON.parse(readFileSync(join(ordner,'sichtpruefung.json'),'utf8'));assert.equal(daten.schema,2);
    const p={phase:'tastatur',ergebnisse:ERGEBNISKATALOG.tastatur.map(id=>({id,status:'bestanden'})),sichtpruefung:{bilder:original}};
    p.ergebnisse[0]={id:'B1',status:'Sichtprüfung ausstehend',details:{teilfaelle:[{status:'bestanden',sichtbilder:['fokus.png']}]}};
    for(const aendern of [d=>d.pruefungen[0].ausschnitte[0].sha256='b'.repeat(64),d=>d.pruefungen[0].ausschnitte[0].element.name='Fremdes Feld',
      d=>d.pruefungen[0].ausschnitte[0].dokumentRechteck.oben++,d=>d.schema=1]) {
      const d=structuredClone(daten);aendern(d);assert.throws(()=>sichtEntscheiden(d,original),Messfehler);
    }
    const a=original[0].ausschnitte[0],bytes=readFileSync(join(ordner,a.datei));bytes[bytes.length-1]^=1;writeFileSync(join(ordner,a.datei),bytes);
    await assert.rejects(()=>sichtAuswerten(ordner,p),Messfehler);
    bytes[bytes.length-1]^=1;writeFileSync(join(ordner,a.datei),bytes);
    writeFileSync(join(ordner,'sichtpruefung.json'),' '.repeat(16*1024*1024+1));
    await assert.rejects(()=>sichtAuswerten(ordner,p),/Sichtprotokoll zu groß/);
    original[0].ausschnitte=[];assert.equal(auswerten(p).code,2);
    await assert.rejects(()=>schreibeNeueSichtpruefung(ordner,[{id:'B1',bild:'fokus.png',kriterium:'Nativer Fokus'}]),Messfehler);
    assert.equal(sichtEntscheiden({schema:1,pruefungen:[vermerk()]},bilder)[0].ergebnis,'bestanden');
  } finally {assert.equal(dirname(resolve(ordner)),basis);rmSync(ordner,{recursive:true,force:true});}
});
