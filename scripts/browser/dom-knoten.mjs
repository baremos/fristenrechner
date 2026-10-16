import { bestaetige } from './regeln.mjs';

// Frontend-nodeId gilt nur für das aktuelle DOM-Agent-Inventar. Jede
// zustandsändernde Verwendung löst den Selector unmittelbar neu auf.
export async function pseudoZustand(b,selector,klassen,nachweise=[]) {
  const {root}=await b.send('DOM.getDocument');
  bestaetige(root?.nodeId>0,'DOM für Pseudozustand fehlt.');
  const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  bestaetige(nodeId>0,'Pseudozustand ohne bestätigten DOM-Knoten.');
  const nachweis={selector,nodeId,forcedPseudoClasses:[...klassen],bestaetigt:false};nachweise.push(nachweis);
  await b.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:klassen});
  nachweis.bestaetigt=true;return nachweis;
}

// DOM.getDocument kann erzwungene Zustände aufheben. Deshalb vor jeder
// tatsächlichen Aufnahme neu binden und danach ohne neuen DOM-Abruf prüfen.
export async function pseudoMessung(b,selector,pseudo,nachweis={}) {
  const klassen=pseudo==='focus-visible'?['focus','focus-visible']:[pseudo];
  const quelle=`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).getPropertyValue('--browser-pseudo-bestaetigt').trim()`;
  nachweis.knoten=[];nachweis.aufnahmen=[];
  let aktuell,backendNodeId;
  await b.wert(`(() => {const s=document.createElement('style');s.id='browser-pseudo-messung';s.textContent=${JSON.stringify(`${selector}:${pseudo}{--browser-pseudo-bestaetigt:ja}`)};document.head.append(s);})()`);
  async function bestaetigen(bild) {
    const probe={bild,phase:'nachher',bestaetigt:false};nachweis.aufnahmen.push(probe);
    bestaetige(await b.wert(quelle)==='ja','Erzwungener Pseudozustand während der Aufnahme nicht bestätigt.');
    probe.bestaetigt=true;
  }
  async function vorbereiten(bild) {
    aktuell=await pseudoZustand(b,selector,klassen,nachweis.knoten);
    const {node}=await b.send('DOM.describeNode',{nodeId:aktuell.nodeId});
    bestaetige(Number.isInteger(node?.backendNodeId)&&node.backendNodeId>0,'Pseudozustand ohne Elementidentität.');
    backendNodeId??=node.backendNodeId;
    bestaetige(node.backendNodeId===backendNodeId,'Elementidentität des Pseudozustands hat sich geändert.');
    await b.wert('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    bestaetige(await b.wert(quelle)==='ja','Erzwungener Pseudozustand vor der Aufnahme nicht bestätigt.');
    nachweis.aufnahmen.push({bild,phase:'vorher',nodeId:aktuell.nodeId,backendNodeId,bestaetigt:true});
  }
  await vorbereiten('Kontrastmessung');
  return {vorbereiten,bestaetigen,async zuruecksetzen(){
    nachweis.zurueckgesetzt={nodeId:aktuell.nodeId,aktivVorher:null,aktivNachher:null,bestaetigt:false};
    const reset=nachweis.zurueckgesetzt;
    // Kein DOM.getDocument: der Reset muss den noch aktiven Zustand auf genau
    // demselben Knoten aufheben, statt einen bereits verlorenen zu bestätigen.
    reset.aktivVorher=await b.wert(quelle)==='ja';
    bestaetige(reset.aktivVorher,'Pseudozustand vor dem Zurücksetzen verloren.');
    await b.send('CSS.forcePseudoState',{nodeId:aktuell.nodeId,forcedPseudoClasses:[]});
    reset.aktivNachher=await b.wert(quelle)==='ja';
    bestaetige(!reset.aktivNachher,'Pseudozustand nicht bestätigt zurückgesetzt.');
    await b.wert("document.getElementById('browser-pseudo-messung').remove()");reset.bestaetigt=true;
  }};
}
