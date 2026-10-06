import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auswerten, neuesProtokoll } from './auswertung.mjs';

export function fehlerUrsache(fehler, schritt) {
  const stack = String(fehler?.stack ?? '').slice(0,16000);
  return { schritt, name:String(fehler?.name ?? 'Error'), meldung:String(fehler?.message ?? fehler).slice(0,4000),
    stelle:stack.split('\n').find(s=>/\bat\b.*:\d+:\d+/.test(s))?.trim() ?? schritt, stack };
}
export function ungueltigePhase(herkunft, fehler, schritt) {
  const p=neuesProtokoll(herkunft), ursache=fehlerUrsache(fehler,schritt);
  p.ende=new Date().toISOString();
  p.ergebnisse.push({id:'LAUF',beschreibung:'Vollständiger Phasenlauf mit schreibbarem Protokoll',status:'ungültig',meldung:ursache.meldung,ursache});
  p.auswertung=auswerten(p);
  return p;
}

// Die zweite Ausgabe verwendet ausschließlich sichere Herkunft und die Ursache,
// keine Referenz auf das fehlerhafte Messobjekt oder dessen toJSON-Funktionen.
export function phaseSichern(protokoll, ausgabe, {serialisieren=JSON.stringify,schreiben=writeFileSync}={}) {
  let p=protokoll;
  try {
    mkdirSync(ausgabe,{recursive:true});
    p.auswertung=auswerten(p);
    schreiben(join(ausgabe,'protokoll.json'),serialisieren(p,null,2)+'\n');
  } catch(fehler) {
    p=ungueltigePhase({commit:protokoll.commit,arbeitsstand:protokoll.arbeitsstand,phase:protokoll.phase,browser:protokoll.browser},fehler,'Phasenauswertung oder Protokoll schreiben');
    try {
      mkdirSync(ausgabe,{recursive:true});
      schreiben(join(ausgabe,'protokoll.json'),JSON.stringify(p,null,2)+'\n');
    } catch(weitererFehler) {
      // Auch ein nicht schreibbarer Phasenordner verhindert weder nächste
      // Browser/Phasen noch die vollständig auswertbare Rahmenausgabe.
      p.protokollSchreibfehler=fehlerUrsache(weitererFehler,'Ungültiges Phasenprotokoll schreiben');
    }
  }
  return p;
}
