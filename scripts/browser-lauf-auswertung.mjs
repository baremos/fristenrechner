#!/usr/bin/env node
// Nach einer Bildsichtung: neuer Bericht, Rohprotokolle bleiben erhalten.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sichtAuswerten } from './browser/sichtpruefung.mjs';
import { auswerten, gesamtAuswerten } from './browser/auswertung.mjs';
import { messbefehl } from './browser/fehler.mjs';
import { MESSGRENZEN, grenzenBestaetigt } from './browser/ergebniskatalog.mjs';
import { teilfaelleEntscheiden, teilfallUebersicht } from './browser/bedienung.mjs';

// Nur katalogisierte alte Entscheidungen umstufen. Fehlende Messwerte,
// Ausschnitt-/Resetfehler und unbekannte CDP-Fehler bleiben ungültig.
export function grenzenNeuEinordnen(original) {
  const p=structuredClone(original);
  for(const g of p.messungen??[]) {
    if(!['B7','B9'].includes(g.id))continue;
    let geaendert=false;
    for(const f of g.teilfaelle??[]) {
      if(g.id==='B7'&&f.name?.startsWith('zoom-')&&f.status==='ungültig'
        &&f.meldung===MESSGRENZEN.browserzoom.grund&&f.messungen?.zurueckgesetzt?.bestaetigt===true) {
        const neu={...f,status:'dokumentierte Grenze',grenzen:[{kennung:'browserzoom',...MESSGRENZEN.browserzoom}]};
        if(grenzenBestaetigt('B7',g.teilfaelle.map(v=>v===f?neu:v))) {Object.assign(f,neu);geaendert=true;}
      }
      if(g.id==='B9'&&f.status==='bestanden'&&f.grenzen?.length&&f.sichtbilder?.length
        &&f.messungen?.canvas?.bestaetigt===true&&f.messungen?.zurueckgesetzt?.bestaetigt===true
        &&f.messungen.kontraste?.anzahl>0&&f.messungen.kontraste?.befunde?.length===0&&f.messungen.kontraste?.unklar?.length===0
        &&f.grenzen.every(v=>v.kennung==='native-kontrollgrafik'&&v.selector
          &&(v.grund??v.meldung)===MESSGRENZEN['native-kontrollgrafik'].grund)) {
        f.grenzen=f.grenzen.map(v=>({...v,...MESSGRENZEN['native-kontrollgrafik']}));f.status='dokumentierte Grenze';geaendert=true;
      }
    }
    if(!geaendert)continue;
    const r=p.ergebnisse.find(r=>r.id===g.id);if(!r)continue;
    delete r.meldung;
    try {
      teilfaelleEntscheiden(g.teilfaelle,g.id);
      r.status=g.teilfaelle.some(f=>f.status==='dokumentierte Grenze')?'dokumentierte Grenze':'bestanden';
      if(p.sichtpruefung?.bilder?.some(b=>b.id===g.id))r.status='Sichtprüfung ausstehend';
    } catch(e) {r.status=e.name==='Abweichung'?'nicht bestanden':'ungültig';r.meldung=e.message;}
    r.details={teilfaelle:teilfallUebersicht(g.teilfaelle)};
  }
  return p;
}

export async function protokollNeuAuswerten(ordner,p) {
  const neu=grenzenNeuEinordnen(p);
  return neu.sichtpruefung?await sichtAuswerten(ordner,neu):neu;
}

export async function main(argv) {
  if (argv.length!==2 || argv[0]!=='--lauf') { console.error('Aufruf: node scripts/browser-lauf-auswertung.mjs --lauf <Ausgabeordner>'); return 64; }
  const wurzel = resolve(argv[1]);
  try {
    const bericht = await messbefehl(()=>JSON.parse(readFileSync(join(wurzel,'protokoll.json'),'utf8')));
    if (!bericht.optionen || !Array.isArray(bericht.laeufe)) throw new Error('Gesamtprotokoll fehlt.');
    const neu = structuredClone(bericht);
    for (const lauf of neu.laeufe) {
      if (!['edge','chrome'].includes(lauf.browser) || !['vertrag','webadapter','darstellung','tastatur'].includes(lauf.phase)
        || lauf.protokoll!==`${lauf.browser}-${lauf.phase}/protokoll.json`) throw new Error('Unbekannter Phasenpfad.');
      const ordner=join(wurzel,`${lauf.browser}-${lauf.phase}`);
      const p=await messbefehl(()=>JSON.parse(readFileSync(join(ordner,'protokoll.json'),'utf8')));
      let ausgewertet;
      try { ausgewertet = await protokollNeuAuswerten(ordner,p); }
      catch (e) { ausgewertet=structuredClone(p); ausgewertet.ergebnisse.push({id:'SICHTPROTOKOLL',status:'ungültig',meldung:e.message}); }
      const wert=auswerten(ausgewertet); ausgewertet.auswertung=wert;
      await messbefehl(()=>writeFileSync(join(ordner,'auswertung.json'),JSON.stringify(ausgewertet,null,2)+'\n'));
      Object.assign(lauf,wert,{neuesProtokoll:`${lauf.browser}-${lauf.phase}/auswertung.json`});
    }
    // Ein früherer Rahmenfehler kann durch Bildsichtung nicht verschwinden.
    neu.auswertung=gesamtAuswerten(neu); neu.code=neu.auswertung.code; neu.status=neu.auswertung.status;
    neu.neuAusgewertet=new Date().toISOString();
    await messbefehl(()=>writeFileSync(join(wurzel,'auswertung.json'),JSON.stringify(neu,null,2)+'\n'));
    console.log(`Gesamtlauf: ${neu.status}`); return neu.code;
  } catch(e) { console.error(e.message); return 2; }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.exitCode=await main(process.argv.slice(2));
