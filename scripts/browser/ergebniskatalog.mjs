// Neue Phasen ergänzen hier ihre Pflichtkennungen; grundlagen bleibt unverändert.
const gemeinsam = ['JS', 'ENDE', 'NETZ', 'NETZ-VERBINDUNGEN'];
export const ERGEBNISKATALOG = Object.freeze({
  vertrag: Object.freeze([...Array.from({ length: 9 }, (_, i) => `V${i + 1}`), 'V-VERTRAG', ...gemeinsam]),
  webadapter: Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5-json', 'W5-xlsx', 'W5-pdf', 'W6', 'W7', 'W8',
    'W9', 'W10', 'W11', 'W12-Enter', 'W12-Leertaste', 'BOX-320', ...gemeinsam]),
  darstellung: Object.freeze(['B7', 'B9', 'B10', 'B11', ...gemeinsam]),
  tastatur: Object.freeze(['B1', 'B3', 'B4', 'B6', 'AX', ...gemeinsam]),
});
// Diese Kennungen sind ausschließlich zusätzliche ungültige Rahmenbelege.
export const RAHMENFEHLER = Object.freeze(['LAUF', 'NETZ-CDP', 'NETZ-NACHWEIS', 'AUFRAEUMEN', 'SICHTPROTOKOLL']);

// Rangfolge: Messfehler, Produktbefund, ausstehende Sichtung, katalogisierte
// Grenze, bestanden. Die Zahl ist der Rückgabewert, nicht der Rang.
export const ERGEBNISRANG = Object.freeze([2, 1, 4, 3, 0]);
// Grenzen ersetzen keine fehlende automatische Bestätigung oder Ersatzmessung.
export const MESSGRENZEN = Object.freeze({
  'native-kontrollgrafik': Object.freeze({id:'B9',folge:'dokumentierte Grenze',grund:'Native Kontrollgrafik ist nicht aus berechneten CSS-Farben bestimmbar.',
    ersatz:'Gehashte Elementausschnitte der Ankreuzfelder im geprüften Zustand mit DOM-/AX-Zuordnung und Sichtvermerk; alle übrigen CSS-Kontraste bleiben automatisch pflichtig.'}),
  'browserzoom': Object.freeze({id:'B7',folge:'dokumentierte Grenze',grund:'Für diesen Headless-Läufer ist kein echter Browserzoom über CDP bestätigt. Unwirksame CDP-Tastenkürzel, Pinchzoom und Device-Metrics bestätigen keinen Desktopzoom.',
    ersatz:'Reflow wird gesondert bei 640 bzw. 320 CSS-Pixeln, Schriftfaktor 1 und Pixeldichte 1 gemessen (1280/2 bzw. 1280/4). Das bestätigt Layoutumbruch bei dieser Breite, keine vollständige Gleichwertigkeit mit Browserzoom oder Textvergrößerung.',
    referenz:'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html'}),
  'netzzuordnung': Object.freeze({id:'NETZ-NACHWEIS',folge:'ungültig',grund:'NetLog-Anfrage ohne sichere Seiten- oder Hintergrundzuordnung.'}),
  'prozessende': Object.freeze({id:'ENDE',folge:'ungültig',grund:'Zwang oder weiter vorhandene bekannte PID sind kein regulärer Endnachweis.'}),
});

export function grenzenBestaetigt(id, faelle) {
  if(!Array.isArray(faelle)||faelle.some(f=>!f||typeof f!=='object'))return false;
  const begrenzt=faelle.filter(f=>f.status==='dokumentierte Grenze');
  if(!begrenzt?.length)return false;
  return begrenzt.every(f=>Array.isArray(f.grenzen)&&f.grenzen.length>0&&f.grenzen.every(g=>{
    if(!g||typeof g!=='object')return false;
    const k=MESSGRENZEN[g.kennung];
    if(!k||k.id!==id||k.folge!=='dokumentierte Grenze'||!k.grund||!k.ersatz
      ||g.id!==k.id||g.folge!==k.folge||g.grund!==k.grund||g.ersatz!==k.ersatz)return false;
    if(g.kennung==='native-kontrollgrafik')return typeof g.selector==='string'&&!!g.selector&&Array.isArray(f.sichtbilder)&&f.sichtbilder.length>0;
    const faktor={'zoom-200':2,'zoom-400':4}[f.name];
    const ersatz=faelle.find(v=>v.name===`reflow-${faktor*100}`),m=ersatz?.reflow??ersatz?.messungen?.reflow;
    return !!faktor&&ersatz?.status==='bestanden'&&m?.bestaetigt===true&&m.faktor===faktor
      &&m.layoutbreite===1280/faktor&&m.dom?.innerWidth===1280/faktor&&m.dom.devicePixelRatio===1
      &&m.dom.schrift===16&&m.dom.visuelleSkala===1&&m.visuell?.scale===1
      &&Number.isFinite(m.dom.clientWidth)&&m.dom.clientWidth>0&&m.dom.clientWidth<=m.layoutbreite
      &&Number.isFinite(m.layout?.clientWidth)&&Math.abs(m.layout.clientWidth-m.dom.clientWidth)<1;
  }));
}
