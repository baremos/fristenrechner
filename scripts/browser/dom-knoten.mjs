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
