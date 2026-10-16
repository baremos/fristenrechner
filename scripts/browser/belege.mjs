import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bestaetige } from './regeln.mjs';
import { messbefehl } from './fehler.mjs';

// Die gespeicherten CSS-Rechtecke enthalten 1/64-Pixel-Schritte; die
// Rasteraufnahme und Scroll-Rücksetzung können auf andere Subpixel runden.
// Ausschließlich Differenzen < 1 CSS-Pixel sind erlaubt, niemals ganze Pixel.
export const LAGETOLERANZ = 1;
export function bestaetigeBildwechsel(normal,zustand,nachweis={}) {
  Object.assign(nachweis,{normal:normal?.datei,zustand:zustand?.datei,normalSha256:normal?.sha256,zustandSha256:zustand?.sha256,
    normalGeometrie:normal?.geometrie??nachweis.normalGeometrie,zustandGeometrie:zustand?.geometrie??nachweis.zustandGeometrie,
    toleranzExklusiv:LAGETOLERANZ,bestaetigt:false});
  bestaetige([normal,zustand].every(b=>/^[a-f0-9]{64}$/.test(b?.sha256??'')
    &&[b.breite,b.hoehe,b.dichte,b.clip?.x,b.clip?.y,b.clip?.width,b.clip?.height,b.clip?.scale].every(Number.isFinite)
    &&b.breite>0&&b.hoehe>0&&b.dichte>0), 'Normal- oder Zustandsbild fehlt.');
  bestaetige(typeof normal.captureBeyondViewport==='boolean'&&normal.captureBeyondViewport===zustand.captureBeyondViewport,
    'Normal- und Zustandsbild haben kein bestätigtes gemeinsames Aufnahmeverfahren.');
  for(const b of [normal,zustand]) {
    bestaetige(b.geometrie?.bestaetigt===true&&b.geometrie.imViewport===true&&b.captureBeyondViewport===false,
      'Geometrie vor und nach dem Vergleichsbild im sichtbaren Viewport nicht bestätigt.');
    bestaetigeElementlage(b.geometrie);
  }
  const v=normal.geometrie.vorher,n=zustand.geometrie.vorher;
  bestaetige(['innerWidth','clientWidth'].every(k=>v.fenster[k]===n.fenster[k])&&v.dokumentgroesse.width===n.dokumentgroesse.width,
    'Geänderte Layoutbreite zwischen Normal- und Zustandsbild (Fenster, Viewport oder Dokument).');
  bestaetige(['innerHeight','clientHeight'].every(k=>v.fenster[k]===n.fenster[k])&&normal.dichte===zustand.dichte,
    'Fensterhöhe oder Pixeldichte zwischen Normal- und Zustandsbild geändert.');
  const proben=[v,normal.geometrie.nachher,n,zustand.geometrie.nachher];
  bestaetige(['links','oben','rechts','unten','breite','hoehe'].every(k=>{
    const werte=proben.map(p=>p.dokumentRechteck[k]);return Math.max(...werte)-Math.min(...werte)<LAGETOLERANZ;
  }),
    'Elementrechteck zwischen Normal- und Zustandsbild geändert.');
  bestaetige(['x','y'].every(k=>Math.abs(n.rollstand[k]-v.rollstand[k])<LAGETOLERANZ),
    'Rollstand zwischen Normal- und Zustandsbild geändert.');
  bestaetige(normal.breite===zustand.breite&&normal.hoehe===zustand.hoehe&&normal.dichte===zustand.dichte
    &&JSON.stringify(normal.clip)===JSON.stringify(zustand.clip),'Normal- und Zustandsbild haben verschiedene Ausschnitte.');
  bestaetige(normal.sha256!==zustand.sha256,'Normal- und Fokusbild haben denselben Hash; sichtbarer Zustandswechsel nicht bestätigt.');
  nachweis.bestaetigt=true;return nachweis;
}
export function bestaetigeElementlage(m) {
  const {vorher:v,nachher:n}=m;
  bestaetige(v?.scrollruhe?.bestaetigt===true&&n?.scrollruhe?.bestaetigt===true,
    'Scrollruhe während des Ausschnitts nicht bestätigt.');
  for(const p of [v,n]) {
    bestaetige(p.rollstand&&p.viewportRechteck,'Rechteck oder Rollstand fehlt.');
    p.dokumentRechteck=elementClip(p,p.dokumentgroesse).dokumentRechteck;
  }
  m.koordinatensystem='Dokument, CSS-Pixel';m.toleranzExklusiv=LAGETOLERANZ;
  m.differenz=Object.fromEntries(['links','oben','rechts','unten','breite','hoehe'].map(k=>[k,n.dokumentRechteck[k]-v.dokumentRechteck[k]]));
  m.rollDifferenz={x:n.rollstand.x-v.rollstand.x,y:n.rollstand.y-v.rollstand.y};
  if(m.imViewport) {
    bestaetige(['innerWidth','clientWidth'].every(k=>Number.isFinite(v.fenster?.[k])&&v.fenster[k]===n.fenster?.[k])
      &&Number.isFinite(v.dokumentgroesse?.width)&&v.dokumentgroesse.width===n.dokumentgroesse?.width,
      'Layoutbreite während der Aufnahme geändert oder unbestätigt (Fenster, Viewport oder Dokument).');
    m.fensterDifferenz=Object.fromEntries(['innerWidth','innerHeight','clientWidth','clientHeight'].map(k=>[k,n.fenster?.[k]-v.fenster?.[k]]));
    bestaetige(Object.values(m.fensterDifferenz).every(x=>Number.isFinite(x)&&Math.abs(x)<LAGETOLERANZ)
      &&Number.isFinite(v.dichte)&&v.dichte===n.dichte,'Viewport oder Pixeldichte hat sich während des Ausschnitts geändert.');
  }
  bestaetige(Object.values(m.rollDifferenz).every(x=>Math.abs(x)<LAGETOLERANZ), 'Rollstand hat sich während des Ausschnitts geändert.');
  bestaetige(Object.values(m.differenz).every(x=>Math.abs(x)<LAGETOLERANZ), 'Elementlage hat sich während des Ausschnitts geändert.');
  m.bestaetigt=true;return m;
}

export function sichtbereichClip(lage,groesse) {
  const {rollstand:s,fenster:f}=lage??{};
  bestaetige(s&&f&&[s.x,s.y,f.clientWidth,f.clientHeight,groesse?.width,groesse?.height].every(Number.isFinite)
    &&s.x>=0&&s.y>=0&&f.clientWidth>0&&f.clientHeight>0,'Sichtbarer Aufnahmebereich nicht bestätigt.');
  const clip={x:s.x,y:s.y,width:Math.min(f.clientWidth,groesse.width-s.x),height:Math.min(f.clientHeight,groesse.height-s.y),scale:1};
  bestaetige(clip.width>0&&clip.height>0,'Sichtbarer Aufnahmebereich liegt außerhalb des Dokuments.');
  return clip;
}
export function elementClip(lage,groesse,rand=24,imViewport=false) {
  const {viewportRechteck:r,rollstand:s}=lage??{};
  bestaetige(r&&s&&[r.links,r.oben,r.rechts,r.unten,r.breite,r.hoehe,s.x,s.y,
    groesse?.width,groesse?.height,lage.outline,lage.offset,rand].every(Number.isFinite)
    &&r.breite>0&&r.hoehe>0&&s.x>=0&&s.y>=0&&rand>=0
    &&Math.abs(r.rechts-r.links-r.breite)<0.01&&Math.abs(r.unten-r.oben-r.hoehe)<0.01,
    'Elementrechteck und Rollstand nicht bestätigt.');
  const dokumentRechteck={links:r.links+s.x,oben:r.oben+s.y,rechts:r.rechts+s.x,unten:r.unten+s.y,breite:r.breite,hoehe:r.hoehe};
  bestaetige(dokumentRechteck.links>=0&&dokumentRechteck.oben>=0
    &&dokumentRechteck.rechts<=groesse.width+1&&dokumentRechteck.unten<=groesse.height+1,'Element liegt außerhalb des gemessenen Dokuments.');
  const abstand=Math.max(rand,lage.outline+Math.abs(lage.offset)+2),x=Math.max(0,dokumentRechteck.links-abstand),y=Math.max(0,dokumentRechteck.oben-abstand);
  let clip={x,y,width:Math.min(groesse.width,dokumentRechteck.rechts+abstand)-x,height:Math.min(groesse.height,dokumentRechteck.unten+abstand)-y,scale:1};
  if(imViewport) {
    const bereich=sichtbereichClip(lage,groesse),ring=lage.outline+Math.abs(lage.offset);
    bestaetige(dokumentRechteck.links-ring>=bereich.x&&dokumentRechteck.oben-ring>=bereich.y
      &&dokumentRechteck.rechts+ring<=bereich.x+bereich.width&&dokumentRechteck.unten+ring<=bereich.y+bereich.height,
      'Sichtelement mit Fokusrahmen liegt nicht vollständig im Viewport.');
    const rechts=Math.min(clip.x+clip.width,bereich.x+bereich.width),unten=Math.min(clip.y+clip.height,bereich.y+bereich.height);
    clip={x:Math.max(clip.x,bereich.x),y:Math.max(clip.y,bereich.y),width:0,height:0,scale:1};
    clip.width=rechts-clip.x;clip.height=unten-clip.y;
  }
  return {viewportRechteck:r,rollstand:s,dokumentRechteck,clip};
}
export function bestaetigeSichtausschnitt(a) {
  const e=a?.element;
  bestaetige(e&&['kennung','selector','name','rolle','axNodeId'].every(k=>typeof e[k]==='string'&&e[k].trim())
    &&Number.isInteger(e.backendNodeId)&&e.backendNodeId>0,'Elementidentität aus DOM und Barrierebaum fehlt.');
  const r=a.dokumentRechteck,v=a.viewportRechteck,s=a.rollstand,c=a.clip;
  bestaetige(r&&v&&s&&c&&[r.links,r.oben,r.rechts,r.unten,r.breite,r.hoehe,v.links,v.oben,v.rechts,v.unten,v.breite,v.hoehe,s.x,s.y,c.x,c.y,c.width,c.height,c.scale].every(Number.isFinite)
    &&r.breite>0&&r.hoehe>0&&c.width>0&&c.height>0&&c.x>=0&&c.y>=0&&c.scale===1
    &&Math.abs(r.links-v.links-s.x)<0.01&&Math.abs(r.oben-v.oben-s.y)<0.01
    &&Math.abs(r.rechts-v.rechts-s.x)<0.01&&Math.abs(r.unten-v.unten-s.y)<0.01
    &&Math.abs(r.rechts-r.links-r.breite)<0.01&&Math.abs(r.unten-r.oben-r.hoehe)<0.01
    &&Math.abs(r.breite-v.breite)<0.01&&Math.abs(r.hoehe-v.hoehe)<0.01
    &&c.x<=r.links&&c.y<=r.oben&&c.x+c.width>=r.rechts-1&&c.y+c.height>=r.unten-1,
    'Sichtausschnitt deckt das bestätigte Dokumentrechteck nicht ab.');
  bestaetige(/^[a-f0-9]{64}$/.test(a.sha256??'')&&Number.isFinite(a.dichte)&&a.dichte>0
    &&Math.abs(a.breite-c.width*a.dichte)<=1&&Math.abs(a.hoehe-c.height*a.dichte)<=1,'Sichtausschnitt ohne Bildhash oder bestätigte Pixelgröße.');
  if(a.lagepruefung) {
    bestaetigeElementlage(a.lagepruefung);
    bestaetige(['links','oben','rechts','unten','breite','hoehe'].every(k=>a.lagepruefung.vorher.dokumentRechteck[k]===r[k]),'Ausschnitt gehört nicht zur geprüften Elementlage.');
  }
  if(a.captureBeyondViewport===false) {
    const bereich=sichtbereichClip(a,a.dokumentgroesse);
    bestaetige(c.x>=bereich.x&&c.y>=bereich.y&&c.x+c.width<=bereich.x+bereich.width&&c.y+c.height<=bereich.y+bereich.height,
      'Sichtausschnitt liegt außerhalb des bestätigten Viewports.');
  }
  return a;
}

// Nur Dateiverweise verlassen diese Funktionen. CDP-Bilddaten werden sofort
// abgelegt; weder Buffer noch Base64 oder entpackte Pixel sind Messwerte.
export function dateiAblegen(ausgabe, name, bytes) {
  bestaetige(typeof name === 'string' && basename(name) === name && /^[a-z0-9][a-z0-9_.-]+$/.test(name), 'Ungültiger Belegname.');
  writeFileSync(join(ausgabe, name), bytes, { flag: 'wx' });
  return { datei: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export async function bildAufnehmen({ send, ausgabe }, name, clip, dichte = 1, {captureBeyondViewport=true}={}) {
  return messbefehl(async () => {
    if (clip !== undefined) bestaetige(clip && [clip.x, clip.y, clip.width, clip.height, clip.scale, dichte].every(Number.isFinite)
      && clip.x >= 0 && clip.y >= 0 && clip.width > 0 && clip.height > 0 && clip.scale === 1 && dichte > 0, 'Bildausschnitt nicht bestätigt.');
    bestaetige(typeof captureBeyondViewport==='boolean','Aufnahmemodus nicht bestätigt.');
    const antwort = await send('Page.captureScreenshot', { format: 'png', ...(clip ? {clip} : {}), captureBeyondViewport });
    bestaetige(typeof antwort?.data === 'string' && antwort.data.length > 30, 'Bildbeleg fehlt.');
    const bytes = Buffer.from(antwort.data, 'base64');
    const beleg = dateiAblegen(ausgabe, name, bytes);
    // Auch ein ungültiges Messbild bleibt als Datei für die Diagnose erhalten.
    bestaetige(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      && bytes.toString('ascii',12,16) === 'IHDR', 'Bildbeleg ist kein PNG.');
    const breite = bytes.readUInt32BE(16), hoehe = bytes.readUInt32BE(20);
    bestaetige(breite>0&&hoehe>0,'Bildbeleg hat keine Fläche.');
    if(clip) bestaetige(Math.abs(breite - clip.width * dichte) <= 1 && Math.abs(hoehe - clip.height * dichte) <= 1,
      'Bildbeleg deckt nicht den bestätigten Ausschnitt ab.');
    return { ...beleg, breite, hoehe, captureBeyondViewport, ...(clip ? {clip: { ...clip }, dichte} : {}) };
  });
}
export function freierBildname(ausgabe, art) {
  bestaetige(/^[a-z]+$/.test(art), 'Ungültige Messbildart.');
  let n = 1;
  while (existsSync(join(ausgabe, `${art}-${n}.png`))) n++;
  return `${art}-${n}.png`;
}
export async function messungAblegen(ausgabe, name, daten) {
  return messbefehl(() => dateiAblegen(ausgabe, name, Buffer.from(JSON.stringify(daten) + '\n')));
}
