// Prüfungen der Build-Kette der App. K3 bis K5 lesen auch Dateien und Werkzeuge.
// K1: capacitor.config.json gegen die Festlegungen: nur bekannte Schlüssel,
//     Herkunft, Fehlerseite, keine Netzfreigaben, Mindestversion der WebView.
// K2: der gebaute Ordner dist: Pflichtdateien, keine Source-Maps, keine Syntax und
//     keine Laufzeitfunktionen über der Mindestversion der WebView, kein eval und
//     kein Function-Konstruktor ohne Eintrag, jede Adresse in Skripten mit Eintrag
//     in app-pruefungen.json, keine Verweise nach außen in HTML und CSS,
//     keine optionalen jsPDF-Chunks oder deren Kennzeichen und keine nackten
//     Modulnamen in import().
// K2 ist eine statische Prüfung. Sie sieht keine berechneten Namen (a[x + y]),
// keinen Code, der erst zur Laufzeit entsteht, keinen Alias oder Reflexionszugriff
// auf den Function-Konstruktor und keine Adressen, die aus Teilen zusammengesetzt
// werden. eval zählt sie bei jeder Erwähnung, auch als Schlüssel und als Zeichenkette.
// Das HTML liest sie mit regulären Ausdrücken, nicht mit dem vollständigen Tokenizer
// eines Browsers: dessen Fehlerkorrekturen (etwa "<!-->" oder "--!>"), Zeichenreferenzen
// in Attributnamen und die Sonderzustände eines Skripts, das "<!--" und "<script"
// enthält, bildet sie nicht nach. SVG, MathML, CDATA und srcdoc lehnt sie ab; den
// Inhalt von title, textarea, noscript, iframe, xmp, noembed und noframes liest sie
// als Text. Dass die App keine Verbindung aufbaut und nicht nach außen navigiert,
// belegen die Läufe im Emulator mit Netzmelder und Gegenprobe.
// Aufruf über scripts/app-bauen.mjs. Die Regeln stehen in scripts/app-pruefungen.json.
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { crc32, inflateRawSync } from 'node:zlib';
import { parse } from '@babel/parser';
import { findeJdk, standardSdk, vorgabe as werkzeugVorgabe, windows } from './werkzeuge.mjs';
import { leseQuellXml } from './xml-quelle.mjs';
export { leseQuellXml } from './xml-quelle.mjs';
import { pruefeGradlePruefsummen } from './gradle-pruefsummen.mjs';

const HIER = new URL('.', import.meta.url);
export const VORGABE = JSON.parse(readFileSync(new URL('app-pruefungen.json', HIER), 'utf8'));

function wert(objekt, pfad) {
  return pfad.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), objekt);
}

// K1 -------------------------------------------------------------------------

export function pruefeKonfiguration(config, { publicOrdner, vorgabe = VORGABE } = {}) {
  const fehler = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['Die Konfiguration ist kein Objekt.'];
  // Capacitor liest Einstellungen auch auf der obersten Ebene (etwa allowMixedContent)
  // und wandelt "true" in true um (JSONObject.getBoolean). Deshalb gilt eine
  // Liste erlaubter Schlüssel je Ebene, alles andere ist ein Fehler.
  for (const [ebene, erlaubt] of Object.entries(vorgabe.konfiguration.erlaubteSchluessel)) {
    const objekt = ebene ? wert(config, ebene) : config;
    if (objekt === undefined) continue;
    if (!objekt || typeof objekt !== 'object' || Array.isArray(objekt)) {
      fehler.push(`${ebene} muss ein Objekt sein.`);
      continue;
    }
    for (const schluessel of Object.keys(objekt)) {
      if (!erlaubt.includes(schluessel)) fehler.push(`${ebene ? `${ebene}.` : ''}${schluessel} ist keine erlaubte Einstellung.`);
    }
  }
  for (const [pfad, soll] of Object.entries(vorgabe.konfiguration.werte)) {
    if (wert(config, pfad) !== soll) fehler.push(`${pfad} muss ${JSON.stringify(soll)} sein, ist ${JSON.stringify(wert(config, pfad))}.`);
  }
  for (const pfad of vorgabe.konfiguration.verboten) {
    if (wert(config, pfad) !== undefined) fehler.push(`${pfad} ist nicht erlaubt.`);
  }
  for (const pfad of vorgabe.konfiguration.nurFalse) {
    const w = wert(config, pfad);
    if (w !== undefined && w !== false) fehler.push(`${pfad} darf nur fehlen oder false sein, ist ${JSON.stringify(w)}.`);
  }
  for (const pfad of ['loggingBehavior', 'android.loggingBehavior']) {
    const w = wert(config, pfad);
    if ((pfad === 'loggingBehavior' || w !== undefined) && w !== vorgabe.konfiguration.loggingBehavior) {
      fehler.push(`${pfad} muss ${JSON.stringify(vorgabe.konfiguration.loggingBehavior)} sein, ist ${JSON.stringify(w)}.`);
    }
  }
  if (!Array.isArray(config.includePlugins) || !config.includePlugins.every((p) => typeof p === 'string')) {
    fehler.push('includePlugins muss eine Liste von Paketnamen sein.');
  }
  if (!isDeepStrictEqual(config.includePlugins, [])) fehler.push('includePlugins muss genau [] sein.');
  const version = wert(config, 'android.minWebViewVersion');
  if (!Number.isInteger(version) || version < vorgabe.konfiguration.minWebViewVersion) {
    fehler.push(`android.minWebViewVersion muss eine ganze Zahl ab ${vorgabe.konfiguration.minWebViewVersion} sein, ist ${JSON.stringify(version)}.`);
  }
  const fehlerseite = wert(config, 'server.errorPath');
  if (publicOrdner && typeof fehlerseite === 'string' && !existsSync(join(publicOrdner, fehlerseite))) {
    fehler.push(`Die Fehlerseite ${fehlerseite} fehlt im Ordner public.`);
  }
  return fehler;
}

// K2: Hilfen ------------------------------------------------------------------

function alleDateien(ordner, basis = ordner) {
  const liste = [];
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) liste.push(...alleDateien(pfad, basis));
    else liste.push(relative(basis, pfad).split(sep).join('/'));
  }
  return liste.sort();
}

/** Dateistamm ohne den Hash von Vite: "_astro/jspdf.es.min.DrSiKu-u.js" ergibt "jspdf.es.min". */
export function dateistamm(datei) {
  return basename(datei).replace(/\.[A-Za-z0-9_-]{8}\.m?js$/, '').replace(/\.m?js$/, '');
}

const FUNKTIONEN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
const ADRESSE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)\\]*/gi;
const OHNE_SCHEMA = /(?<![\w./-])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'<>`)\\]*/gi;

function besuche(knoten, rueckruf, eltern = null, inFunktion = false) {
  if (!knoten || typeof knoten.type !== 'string') return;
  rueckruf(knoten, eltern, inFunktion);
  const innen = inFunktion || FUNKTIONEN.has(knoten.type);
  for (const [schluessel, kind] of Object.entries(knoten)) {
    if (schluessel === 'loc' || schluessel === 'extra' || schluessel.endsWith('Comments')) continue;
    if (Array.isArray(kind)) for (const k of kind) besuche(k, rueckruf, knoten, innen);
    else if (kind && typeof kind === 'object') besuche(kind, rueckruf, knoten, innen);
  }
}

/** Text einer Zeichenkette oder eines Templates ohne Ausdrücke, sonst null. */
function konstanterText(k) {
  if (k?.type === 'StringLiteral') return k.value;
  if (k?.type === 'TemplateLiteral' && k.expressions.length === 0) return k.quasis[0].value.cooked ?? null;
  return null;
}

function pruefeModulpfad(knoten, fehler) {
  const text = konstanterText(knoten);
  // Lokal heißt: relativ (./, ../) oder wurzelbezogen mit genau einem Schrägstrich.
  // „//host/…“ wäre eine protokollrelative Adresse; Rückstriche normalisiert der Browser dazu,
  // Tabulator, Zeilenumbruch und andere Steuerzeichen entfernt der URL-Parser vor der Auflösung.
  if (text !== null && (!/^(?:\.{1,2}\/|\/(?!\/))/.test(text) || text.includes('\\') || /[\s\p{Cc}]/u.test(text))) {
    fehler.push(`import(${JSON.stringify(text)}): kein lokaler Modulpfad; nackte Modulnamen und fremde Adressen sind im App-Bündel nicht erlaubt.`);
  }
}

/** Name der Eigenschaft bei a.b, a["b"] und a[`b`], sonst null. */
function eigenschaftsname(k) {
  if (!k.computed) return k.property?.type === 'Identifier' ? k.property.name : null;
  return konstanterText(k.property);
}

function adressenIn(text) {
  const treffer = [...text.matchAll(ADRESSE)].map((m) => m[0]);
  const rest = text.replace(ADRESSE, ' ');
  return [...treffer, ...[...rest.matchAll(OHNE_SCHEMA)].map((m) => m[0])];
}

const DATEIABLAUF_FELDER = {
  ausgabeBeginnen: ['anzahlBytes', 'mime', 'name'],
  ausgabeBlock: ['auftragId', 'base64', 'offset'],
  ausgabeAbschliessen: ['auftragId'],
  speichernUnter: ['auftragId'],
  teilen: ['auftragId'],
  ausgabeVerwerfen: ['auftragId'],
  projektWaehlen: [],
  zuruecksetzenBestaetigen: [],
};

// Der Adapter nutzt einen Plugin-Parameter und direkte Aufrufe. Gleichnamige
// Methoden der Oberfläche (teilen) oder anderer Funktionen zählen nicht mit.
// Dynamische Empfänger, Aliase und berechnete Methodennamen bildet dies nicht ab.
function dateiausgabeAufrufe(ast, fehler) {
  const eltern = new WeakMap(), aufrufe = [], empfaenger = new Set(), anzahl = {};
  besuche(ast.program, (k, p) => { if (p) eltern.set(k, p); });
  const bindung = (k, name) => {
    for (let p = k; p; p = eltern.get(p)) {
      if (FUNKTIONEN.has(p.type) && p.params?.some(a => (a.type === 'AssignmentPattern' ? a.left : a)?.name === name)) return `${p.start}:${name}`;
    }
    return `global:${name}`;
  };
  besuche(ast.program, k => {
    if (!['CallExpression', 'OptionalCallExpression'].includes(k.type)) return;
    const c = k.callee;
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(c?.type) || c.object?.type !== 'Identifier') return;
    const name = eigenschaftsname(c), schluessel = bindung(k, c.object.name);
    aufrufe.push({ k, name, schluessel });
    if (name !== 'teilen' && name !== 'zuruecksetzenBestaetigen' && Object.hasOwn(DATEIABLAUF_FELDER, name)) empfaenger.add(schluessel);
  });
  for (const { k, name, schluessel } of aufrufe) {
    if (!empfaenger.has(schluessel)) continue;
    if (!Object.hasOwn(DATEIABLAUF_FELDER, name)) {
      fehler.push(`Dateiablauf: unbekannte Methode ${name ?? '(berechnet)'}.`);
      continue;
    }
    anzahl[name] = (anzahl[name] ?? 0) + 1;
    if (!DATEIABLAUF_FELDER[name].length) {
      if (k.arguments.length !== 0) fehler.push(`Dateiablauf.${name}: kein Argument erwartet.`);
      continue;
    }
    const arg = k.arguments[0];
    const felder = arg?.type === 'ObjectExpression' ? arg.properties.map(p => p.type !== 'ObjectProperty' ? null
      : p.computed ? konstanterText(p.key) : p.key.type === 'Identifier' ? p.key.name : konstanterText(p.key)) : [];
    if (k.arguments.length !== 1 || arg?.type !== 'ObjectExpression' || felder.some(f => f === null)
      || !isDeepStrictEqual(felder.sort(), DATEIABLAUF_FELDER[name])) {
      fehler.push(`Dateiablauf.${name}: genau ein Objekt mit ${DATEIABLAUF_FELDER[name].join(', ')} erwartet.`);
    }
  }
  if (empfaenger.size) for (const name of Object.keys(DATEIABLAUF_FELDER)) {
    if (anzahl[name] !== 1) fehler.push(`Dateiablauf.${name}: genau eine Aufrufstelle erwartet, gefunden ${anzahl[name] ?? 0}.`);
  }
  return anzahl;
}

// Enger Vertrag für den direkten Plugin-Parameter des Menüadapters, auch minifiziert.
// Wie beim Dateiweg werden keine beliebigen Alias- oder Datenflussketten ausgewertet.
function menueAufrufe(ast, fehler) {
  const eltern = new WeakMap(), aufrufe = [], empfaenger = new Set(), registrierungen = [];
  besuche(ast.program, (k, p) => { if (p) eltern.set(k, p); });
  const bindung = (k, name) => {
    for (let p = k; p; p = eltern.get(p)) {
      if (FUNKTIONEN.has(p.type) && p.params?.some(a => (a.type === 'AssignmentPattern' ? a.left : a)?.name === name)) return p;
    }
    return ast.program;
  };
  const schluessel = (k, name) => `${bindung(k, name).start}:${name}`;
  besuche(ast.program, k => {
    if (!['CallExpression', 'OptionalCallExpression'].includes(k.type)) return;
    if (konstanterText(k.arguments[0]) === 'MenueZurueck') registrierungen.push(k);
    const c = k.callee;
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(c?.type) || c.object?.type !== 'Identifier') return;
    const name = eigenschaftsname(c), key = schluessel(k, c.object.name);
    aufrufe.push({ k, name, key, scope: bindung(k, c.object.name) });
    if (name === 'addListener' && konstanterText(k.arguments[0]) === 'zurueck') empfaenger.add(key);
    if (name === 'setzen' && k.arguments[0]?.type === 'ObjectExpression'
      && k.arguments[0].properties.some(p => p.key?.name === 'folge')) empfaenger.add(key);
  });
  if (!registrierungen.length && !empfaenger.size) return {};
  // Auch bei entfernten/umbenannten Aufrufen den Parameter der Registrierung finden.
  const namen = registrierungen.map(k => eltern.get(k)).filter(p => p?.type === 'VariableDeclarator').map(p => p.id.name);
  besuche(ast.program, k => {
    if (k.type === 'AssignmentPattern' && namen.includes(k.right?.name)) empfaenger.add(schluessel(k, k.left.name));
  });
  const anzahl = { registrierung: registrierungen.length, setzen: 0, addListener: 0, remove: 0 };
  if (registrierungen.length !== 1 || registrierungen[0].arguments.length !== 1) fehler.push('MenueZurueck: genau eine Registrierung erwartet.');
  const scopes = new Set();
  for (const { k, name, key, scope } of aufrufe) {
    if (!empfaenger.has(key)) continue;
    scopes.add(scope);
    if (!['setzen', 'addListener'].includes(name)) { fehler.push(`MenueZurueck: unbekannte Methode ${name ?? '(berechnet)'}.`); continue; }
    anzahl[name]++;
    if (name === 'setzen') {
      const arg = k.arguments[0];
      const felder = arg?.type === 'ObjectExpression' ? arg.properties.map(p => p.type !== 'ObjectProperty' ? null
        : p.computed ? konstanterText(p.key) : p.key.name ?? konstanterText(p.key)) : [];
      if (k.arguments.length !== 1 || !isDeepStrictEqual(felder.sort(), ['aktiv', 'folge'])) fehler.push('MenueZurueck.setzen: genau aktiv und folge erwartet.');
    } else if (k.arguments.length !== 2 || konstanterText(k.arguments[0]) !== 'zurueck') fehler.push('MenueZurueck: genau das Ereignis zurueck erwartet.');
  }
  for (const scope of scopes) besuche(scope, k => {
    if (k.type === 'CallExpression' && k.callee?.type === 'MemberExpression' && eigenschaftsname(k.callee) === 'remove') {
      anzahl.remove++;
      if (k.arguments.length) fehler.push('MenueZurueck: remove ohne Argumente erwartet.');
    }
  });
  for (const name of ['setzen', 'addListener', 'remove']) if (anzahl[name] !== 1) fehler.push(`MenueZurueck.${name}: genau eine Aufrufstelle erwartet, gefunden ${anzahl[name]}.`);
  return anzahl;
}

/**
 * Wertet ein Skript aus. art: "module" oder "script".
 * Ergebnis: { syntax: {Merkmal: Anzahl}, laufzeit: {Name: Anzahl}, dynamisch: {Name: Anzahl},
 *            adressen: [Wortlaut], fehler }
 */
export function analysiereSkript(quelltext, art, { laufzeitNamen = VORGABE.laufzeitNamen } = {}) {
  const ergebnis = { syntax: {}, laufzeit: {}, dynamisch: {}, dateiausgabe: {}, menue: {}, adressen: [], fehler: [] };
  let ast;
  try {
    ast = parse(quelltext, {
      sourceType: art === 'module' ? 'module' : 'script',
      allowAwaitOutsideFunction: true,
      errorRecovery: false,
      plugins: ['importAttributes'],
    });
  } catch (fehler) {
    ergebnis.fehler.push(`Nicht lesbar: ${fehler.message}`);
    return ergebnis;
  }
  ergebnis.dateiausgabe = dateiausgabeAufrufe(ast, ergebnis.fehler);
  ergebnis.menue = menueAufrufe(ast, ergebnis.fehler);
  const zaehle = (feld, name) => { ergebnis[feld][name] = (ergebnis[feld][name] ?? 0) + 1; };
  const methoden = new Set(laufzeitNamen.filter((n) => n.art === 'methode').map((n) => n.name));
  const globale = new Set(laufzeitNamen.filter((n) => n.art === 'global').map((n) => n.name));
  const alleNamen = new Set([...methoden, ...globale]);
  besuche(ast.program, (k, eltern, inFunktion) => {
    switch (k.type) {
      case 'AssignmentExpression':
        if (['||=', '&&=', '??='].includes(k.operator)) zaehle('syntax', 'logische Zuweisung');
        break;
      case 'ClassPrivateMethod':
        zaehle('syntax', k.kind === 'get' || k.kind === 'set' ? 'privater Accessor' : 'private Methode');
        break;
      case 'BinaryExpression':
        if (k.operator === 'in' && k.left?.type === 'PrivateName') zaehle('syntax', '#x in');
        break;
      case 'StaticBlock':
        zaehle('syntax', 'statischer Block');
        break;
      case 'AwaitExpression':
        if (!inFunktion) zaehle('syntax', 'Top-Level-await');
        break;
      case 'ForOfStatement':
        if (k.await && !inFunktion) zaehle('syntax', 'Top-Level-await');
        break;
      case 'RegExpLiteral':
        if (/[dv]/.test(k.flags)) zaehle('syntax', `RegExp-Flag ${k.flags.replace(/[^dv]/g, '')}`);
        break;
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (k.attributes?.length || k.assertions?.length) zaehle('syntax', 'Import-Attribute');
        break;
      case 'ImportExpression':
        if (k.options) zaehle('syntax', 'Import-Attribute');
        pruefeModulpfad(k.source, ergebnis.fehler);
        break;
      case 'CallExpression':
      case 'OptionalCallExpression':
      case 'NewExpression': {
        if (k.callee?.type === 'Import' && k.arguments.length > 1) zaehle('syntax', 'Import-Attribute');
        if (k.callee?.type === 'Import') pruefeModulpfad(k.arguments[0], ergebnis.fehler);
        // Code aus Zeichenketten: Function, setTimeout und setInterval mit Text. eval
        // zählt schon jede Erwähnung (unten), auch als Alias oder in (0, eval)(…).
        let c = k.callee;
        if (c?.type === 'SequenceExpression') c = c.expressions.at(-1);
        const name = c?.type === 'Identifier' ? c.name
          : (c?.type === 'MemberExpression' || c?.type === 'OptionalMemberExpression') ? eigenschaftsname(c) : null;
        if (name === 'Function') zaehle('dynamisch', name);
        if ((name === 'setTimeout' || name === 'setInterval') && k.arguments[0]
          && (k.arguments[0].type === 'StringLiteral' || k.arguments[0].type === 'TemplateLiteral' || k.arguments[0].type === 'BinaryExpression')) {
          zaehle('dynamisch', `${name} mit Text`);
        }
        break;
      }
      case 'ImportSpecifier':
        if (k.imported?.type === 'StringLiteral') zaehle('syntax', 'Modulname als Zeichenkette');
        break;
      case 'ExportSpecifier':
      case 'ExportNamespaceSpecifier':
        if (k.exported?.type === 'StringLiteral' || k.local?.type === 'StringLiteral') zaehle('syntax', 'Modulname als Zeichenkette');
        break;
      case 'MemberExpression':
      case 'OptionalMemberExpression': {
        const name = eigenschaftsname(k);
        if (name && alleNamen.has(name)) zaehle('laufzeit', name);
        if (name === 'eval') zaehle('dynamisch', 'eval');
        break;
      }
      case 'Identifier': {
        const alsEigenschaft = (eltern?.type === 'MemberExpression' || eltern?.type === 'OptionalMemberExpression') && eltern.property === k && !eltern.computed;
        const alsSchluessel = (eltern?.type === 'ObjectProperty' || eltern?.type === 'ObjectMethod' || eltern?.type === 'ClassMethod' || eltern?.type === 'ClassProperty') && eltern.key === k && !eltern.computed;
        if (globale.has(k.name) && !alsEigenschaft && !alsSchluessel) zaehle('laufzeit', k.name);
        // eval zählt auch als Schlüssel, etwa in const { eval: e } = globalThis.
        if (k.name === 'eval' && !alsEigenschaft) zaehle('dynamisch', 'eval');
        break;
      }
      case 'StringLiteral':
      case 'TemplateLiteral': {
        // Konstante Namen zählen auch außerhalb eines Zugriffs, etwa Reflect.get(o, "at").
        const text = konstanterText(k);
        const alsEigenschaft = (eltern?.type === 'MemberExpression' || eltern?.type === 'OptionalMemberExpression') && eltern.property === k;
        if (text !== null && alleNamen.has(text) && !alsEigenschaft) zaehle('laufzeit', text);
        // "eval" als Zeichenkette: Reflect.get(globalThis, "eval"), { ["eval"]: e } = …
        if (text === 'eval' && !alsEigenschaft) zaehle('dynamisch', 'eval');
        if (k.type === 'StringLiteral') ergebnis.adressen.push(...adressenIn(k.value));
        // Das optionale Sheet setzt CSS erst bei Aktivierung ein. Auch der im
        // Skript gebündelte Stil unterliegt K2, wie eine ausgelieferte CSS-Datei.
        if (text !== null && text.includes('.fr-menue-overlay')) pruefeCss(text, 'Menüstil im Skript', ergebnis.fehler);
        break;
      }
      case 'TemplateElement':
        ergebnis.adressen.push(...adressenIn(k.value.cooked ?? k.value.raw));
        break;
      default:
        break;
    }
  });
  return ergebnis;
}

// HTML in einem Durchlauf von links nach rechts, wie ein Browser: Kommentar, Skript,
// Stil oder Tag, je nachdem, was zuerst beginnt. Ein "<!--" in einem Skript bleibt
// so Teil des Skripts. Leerraum im Sinn von HTML ist nur Tab, LF, FF, CR und Leerzeichen.
const WS = String.raw`[\t\n\f\r ]`;
const ATTRIBUTE_TEIL = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const ENDE = (name) => String.raw`<\/${name}(?=[\t\n\f\r />])[^>]*>`;
const HTML_TEILE = new RegExp(
  String.raw`(<!--[\s\S]*?(?:-->|$))`
  + String.raw`|<script(?=[\t\n\f\r />])(${ATTRIBUTE_TEIL})>([\s\S]*?)(?:${ENDE('script')}|$)`
  + String.raw`|<style(?=[\t\n\f\r />])(${ATTRIBUTE_TEIL})>([\s\S]*?)(?:${ENDE('style')}|$)`
  // Inhalt dieser Elemente ist für den Browser Text (RCDATA, RAWTEXT; noscript bei
  // eingeschalteten Skripten). Ein "<!--" darin beginnt keinen Kommentar.
  + String.raw`|<(title|textarea|xmp|iframe|noembed|noframes|noscript)(?=[\t\n\f\r />])(${ATTRIBUTE_TEIL})>([\s\S]*?)(?:<\/\6(?=[\t\n\f\r />])[^>]*>|$)`
  + String.raw`|(<!\[CDATA\[)`
  + String.raw`|<([a-zA-Z][a-zA-Z0-9:-]*)(${ATTRIBUTE_TEIL})>`,
  'gi',
);
const ATTRIBUT = new RegExp(String.raw`([^\t\n\f\r "'>\/=]+)(?:${WS}*=${WS}*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r "'=<>\x60]+)))?`, 'g');
// Attribute, deren Wert eine Adresse ist oder Adressen enthält.
const ADRESS_ATTRIBUTE = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'cite', 'longdesc', 'manifest', 'icon', 'codebase']);
const LISTEN_ATTRIBUTE = new Set(['ping', 'archive']);
const KANDIDATEN_ATTRIBUTE = new Set(['srcset', 'imagesrcset']);
const ZEICHENREFERENZEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', sol: '/', bsol: '\\', period: '.', num: '#', Tab: '\t', NewLine: '\n', nbsp: '\xa0' };
const ERSATZZEICHEN = String.fromCodePoint(0xfffd);
// Nach HTML ist ein Skript ohne type oder mit einem dieser Typen klassisches JavaScript.
const JS_TYPEN = new Set(['', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3',
  'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
const DATEN_TYPEN = new Set(['application/json', 'application/ld+json']);
const html_trim = (s) => s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');

/** Attribute eines Tags; Namen klein, bei doppelten gilt wie in HTML das erste. */
export function attributeVon(text) {
  const attribute = new Map();
  for (const m of text.matchAll(ATTRIBUT)) {
    const name = m[1].toLowerCase();
    if (!attribute.has(name)) attribute.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attribute;
}

function dekodiere(wert, ort, fehler) {
  return wert.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/g, (ganz, ref) => {
    if (ref[0] === '#') {
      const n = /^#[xX]/.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ERSATZZEICHEN;
    }
    if (Object.hasOwn(ZEICHENREFERENZEN, ref)) return ZEICHENREFERENZEN[ref];
    fehler.push(`${ort}: Zeichenreferenz &${ref}; ist nicht auswertbar.`);
    return ganz;
  });
}

/** Eine Adresse im HTML darf nur ein Pfad in der App sein: kein Schema, nicht // und nicht /\. */
function pruefeAdresseImHtml(roh, name, ort, fehler, schonDekodiert = false) {
  // Wie der URL-Parser: Tab und Zeilenumbruch fallen weg, Steuerzeichen und Leerzeichen am Rand auch.
  const wert = (schonDekodiert ? roh : dekodiere(roh, ort, fehler)).replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(wert) || /^[\\/]{2}/.test(wert)) fehler.push(`${ort}: ${name}="${roh}" verweist nach außen oder nutzt ein Schema.`);
}

function pruefeCss(css, ort, fehler) {
  if (css.includes('\\')) fehler.push(`${ort}: Escapes im CSS sind nicht auswertbar.`);
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const w = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!/^data:/i.test(w)) fehler.push(`${ort}: url(${w}) ist nicht erlaubt, nur data:.`);
  }
  if (/@import\b/i.test(css)) fehler.push(`${ort}: @import ist nicht erlaubt.`);
  if (/image-set\(/i.test(css)) fehler.push(`${ort}: image-set() ist nicht erlaubt.`);
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(css.replace(/url\(\s*["']?data:[^)]*\)/gi, ''))) fehler.push(`${ort}: Adresse im CSS.`);
}

/** Art eines Skript-Elements nach HTML: script, module, daten oder unbekannt. */
export function skriptArt(attribute) {
  let typ = attribute.get('type');
  if ((typ === undefined || typ === '') && attribute.get('language')) typ = `text/${attribute.get('language')}`;
  typ = html_trim(typ ?? '').toLowerCase();
  if (JS_TYPEN.has(typ)) return 'script';
  if (typ === 'module') return 'module';
  if (DATEN_TYPEN.has(typ)) return 'daten';
  return 'unbekannt';
}

function pruefeTag(tagName, attribute, datei, fehler) {
  const ort = `${datei} <${tagName}>`;
  for (const [name, wert] of attribute) {
    if (name.startsWith('on')) fehler.push(`${ort}: Ereignis-Attribut ${name} ist nicht erlaubt.`);
    else if (name === 'srcdoc') fehler.push(`${ort}: srcdoc ist nicht erlaubt, es enthält ein eigenes Dokument.`);
    else if (ADRESS_ATTRIBUTE.has(name)) pruefeAdresseImHtml(wert, name, ort, fehler);
    else if (LISTEN_ATTRIBUTE.has(name)) {
      for (const teil of dekodiere(wert, ort, fehler).split(/[\t\n\f\r ]+/).filter(Boolean)) pruefeAdresseImHtml(teil, name, ort, fehler, true);
    } else if (KANDIDATEN_ATTRIBUTE.has(name)) {
      for (const kandidat of dekodiere(wert, ort, fehler).split(',')) {
        const adresse = html_trim(kandidat).split(/[\t\n\f\r ]+/)[0];
        if (adresse) pruefeAdresseImHtml(adresse, name, ort, fehler, true);
      }
    } else if (name === 'style') pruefeCss(dekodiere(wert, ort, fehler), `${ort} style=`, fehler);
  }
  if (tagName === 'meta' && html_trim(dekodiere(attribute.get('http-equiv') ?? '', ort, fehler)).toLowerCase() === 'refresh') {
    fehler.push(`${datei}: <meta http-equiv="refresh"> ist nicht erlaubt.`);
  }
}

function pruefeHtml(html, datei, fehler, werteSkriptAus, zaehleAdresse) {
  let nummer = 0;
  for (const m of html.matchAll(HTML_TEILE)) {
    if (m[1] !== undefined) continue;
    if (m[2] !== undefined) {
      nummer++;
      const attribute = attributeVon(m[2]);
      pruefeTag('script', attribute, datei, fehler);
      const inhalt = m[3] ?? '';
      const art = skriptArt(attribute);
      const ort = `${datei} Skript ${nummer} (${art})`;
      if (art === 'unbekannt') { fehler.push(`${ort}: Skripttyp ${JSON.stringify(attribute.get('type') ?? attribute.get('language'))} ist nicht erlaubt.`); continue; }
      if (art === 'daten') { for (const a of adressenIn(inhalt)) zaehleAdresse(a); continue; }
      if (attribute.has('src')) {
        if (inhalt.trim()) fehler.push(`${ort}: Skript mit src und Inhalt.`);
        continue;
      }
      if (inhalt.trim()) werteSkriptAus(inhalt, art, datei, ort);
    } else if (m[4] !== undefined) {
      pruefeTag('style', attributeVon(m[4]), datei, fehler);
      pruefeCss(m[5] ?? '', `${datei} <style>`, fehler);
    } else if (m[6] !== undefined) {
      pruefeTag(m[6].toLowerCase(), attributeVon(m[7]), datei, fehler);
    } else if (m[9] !== undefined) {
      fehler.push(`${datei}: CDATA ist im HTML der App nicht erlaubt.`);
    } else {
      const tagName = m[10].toLowerCase();
      // SVG und MathML folgen eigenen Regeln für Skripte, Stile und CDATA. Die App
      // braucht sie im HTML nicht, K2 lehnt sie deshalb ab, statt sie nachzubilden.
      if (tagName === 'svg' || tagName === 'math') fehler.push(`${datei}: <${tagName}> ist im HTML der App nicht erlaubt.`);
      pruefeTag(tagName, attributeVon(m[11]), datei, fehler);
    }
  }
}

// K2 -------------------------------------------------------------------------

/**
 * Prüft den gebauten Ordner. Liefert { fehler, bericht }.
 * bericht.syntax, bericht.laufzeit und bericht.adressen sind nach Dateistamm gezählt.
 */
export function pruefeDist(distOrdner, { fehlerseite = 'startfehler.html', vorgabe = VORGABE, quellOrdner = [] } = {}) {
  const fehler = [];
  const bericht = { dateien: 0, skriptBytes: {}, syntax: {}, laufzeit: {}, dynamisch: {}, dateiausgabe: {}, menue: {}, adressen: {} };
  // Jeder Eintrag der Regeldatei braucht Datei, eine Höchstzahl ab 1 und einen Grund.
  for (const liste of ['laufzeitAusnahmen', 'dynamischerCode', 'adressen']) {
    if (!Array.isArray(vorgabe[liste])) { fehler.push(`app-pruefungen.json: ${liste} fehlt oder ist keine Liste.`); continue; }
    const namensfeld = liste === 'adressen' ? 'wortlaut' : 'name';
    const text = (w) => typeof w === 'string' && w.trim() !== '';
    for (const e of vorgabe[liste]) {
      if (!text(e?.datei) || !text(e[namensfeld]) || !Number.isInteger(e.hoechstzahl) || e.hoechstzahl < 1 || !text(e.grund)) {
        fehler.push(`app-pruefungen.json: Eintrag in ${liste} ohne Datei, ${namensfeld}, gültige Höchstzahl oder Grund: ${JSON.stringify(e)}`);
      }
    }
  }
  for (const feld of ['dateistaemme', 'kennzeichen']) {
    const liste = vorgabe.jspdfZusatzmodule?.[feld];
    if (!Array.isArray(liste) || !liste.length || !liste.every(w => typeof w === 'string' && w.trim() !== '')) {
      fehler.push(`app-pruefungen.json: jspdfZusatzmodule.${feld} muss eine nicht leere Liste von Texten sein.`);
    }
  }
  if (fehler.length) return { fehler, bericht };
  if (!existsSync(distOrdner) || !statSync(distOrdner).isDirectory()) return { fehler: [`Der Ordner ${distOrdner} fehlt.`], bericht };
  const dateien = alleDateien(distOrdner);
  bericht.dateien = dateien.length;
  for (const pflicht of ['index.html', fehlerseite]) {
    if (!dateien.includes(pflicht)) fehler.push(`${pflicht} fehlt in dist.`);
  }
  const zaehle = (feld, stamm, name, anzahl) => {
    bericht[feld][stamm] ??= {};
    bericht[feld][stamm][name] = (bericht[feld][stamm][name] ?? 0) + anzahl;
  };
  const werteSkriptAus = (quelltext, art, stamm, ort) => {
    const a = analysiereSkript(quelltext, art, { laufzeitNamen: vorgabe.laufzeitNamen });
    for (const f of a.fehler) fehler.push(`${ort}: ${f}`);
    for (const [name, n] of Object.entries(a.syntax)) zaehle('syntax', stamm, name, n);
    for (const [name, n] of Object.entries(a.laufzeit)) zaehle('laufzeit', stamm, name, n);
    for (const [name, n] of Object.entries(a.dynamisch)) zaehle('dynamisch', stamm, name, n);
    for (const [name, n] of Object.entries(a.dateiausgabe)) zaehle('dateiausgabe', stamm, name, n);
    for (const [name, n] of Object.entries(a.menue)) zaehle('menue', stamm, name, n);
    for (const adresse of a.adressen) zaehle('adressen', stamm, adresse, 1);
  };
  for (const datei of dateien) {
    const pfad = join(distOrdner, ...datei.split('/'));
    const endung = extname(datei).toLowerCase();
    if (endung === '.map') { fehler.push(`${datei}: Source-Maps gehören nicht in die App.`); continue; }
    const inhalt = ['.js', '.mjs', '.css', '.html'].includes(endung) ? readFileSync(pfad) : null;
    const text = inhalt?.toString('utf8') ?? null;
    if (text !== null) {
      // Optionale jsPDF-Module auch ohne Referenz und in HTML/CSS ablehnen.
      if (vorgabe.jspdfZusatzmodule.dateistaemme.includes(dateistamm(datei))) {
        fehler.push(`${datei}: optionaler jsPDF-Chunk ist im App-Bündel nicht erlaubt.`);
      }
      for (const kennzeichen of vorgabe.jspdfZusatzmodule.kennzeichen) {
        if (text.includes(kennzeichen)) fehler.push(`${datei}: Kennzeichen eines optionalen jsPDF-Moduls ist im App-Bündel nicht erlaubt: ${kennzeichen}`);
      }
    }
    if (endung === '.js' || endung === '.mjs') {
      bericht.skriptBytes[datei] = inhalt.length;
      werteSkriptAus(text, 'module', dateistamm(datei), datei);
    } else if (endung === '.css') {
      pruefeCss(text, datei, fehler);
    } else if (endung === '.html') {
      const html = text;
      if (!/<head[\s>]/i.test(html)) fehler.push(`${datei}: <head> fehlt; Capacitor fügt seine Brücke dort ein.`);
      if (datei === fehlerseite && /<script\b/i.test(html)) fehler.push(`${datei}: Die Fehlerseite darf kein Skript enthalten.`);
      pruefeHtml(html, datei, fehler, werteSkriptAus, (adresse) => zaehle('adressen', datei, adresse, 1));
    }
  }
  // Auch zwei einzeln gültige Menüadapter in verschiedenen Bündeln sind nicht erlaubt.
  if (Object.keys(bericht.menue).length) {
    for (const name of ['registrierung', 'setzen', 'addListener', 'remove']) {
      const summe = Object.values(bericht.menue).reduce((n, werte) => n + (werte[name] ?? 0), 0);
      if (summe !== 1) fehler.push(`MenueZurueck.${name}: insgesamt genau eine Aufrufstelle erwartet, gefunden ${summe}.`);
    }
  }
  // Code aus Zeichenketten: nur mit Eintrag und bis zur Höchstzahl.
  for (const [stamm, namen] of Object.entries(bericht.dynamisch)) {
    for (const [name, n] of Object.entries(namen)) {
      const ausnahme = vorgabe.dynamischerCode.find((a) => a.datei === stamm && a.name === name);
      if (!ausnahme) fehler.push(`${stamm}: ${n} × ${name} ohne Eintrag in dynamischerCode.`);
      else if (n > ausnahme.hoechstzahl) fehler.push(`${stamm}: ${n} × ${name}, erlaubt sind ${ausnahme.hoechstzahl}.`);
    }
  }
  // Syntax: jeder Fund ist ein Fehler.
  for (const [stamm, merkmale] of Object.entries(bericht.syntax)) {
    for (const [name, n] of Object.entries(merkmale)) fehler.push(`${stamm}: ${n} × ${name} (über Chromium ${vorgabe.konfiguration.minWebViewVersion}).`);
  }
  // Laufzeit: nur mit Ausnahme und bis zur Höchstzahl.
  for (const [stamm, namen] of Object.entries(bericht.laufzeit)) {
    for (const [name, n] of Object.entries(namen)) {
      const ausnahme = vorgabe.laufzeitAusnahmen.find((a) => a.datei === stamm && a.name === name);
      if (!ausnahme) fehler.push(`${stamm}: ${n} × ${name} ohne Eintrag in laufzeitAusnahmen.`);
      else if (n > ausnahme.hoechstzahl) fehler.push(`${stamm}: ${n} × ${name}, erlaubt sind ${ausnahme.hoechstzahl}.`);
    }
  }
  // Adressen: Wortlaut, Datei und Höchstzahl.
  for (const [stamm, adressen] of Object.entries(bericht.adressen)) {
    for (const [adresse, n] of Object.entries(adressen)) {
      const eintrag = vorgabe.adressen.find((a) => a.datei === stamm && a.wortlaut === adresse);
      if (!eintrag) fehler.push(`${stamm}: Adresse ohne Eintrag in app-pruefungen.json: ${adresse}`);
      else if (n > eintrag.hoechstzahl) fehler.push(`${stamm}: ${n} × ${adresse}, erlaubt sind ${eintrag.hoechstzahl}.`);
    }
  }
  // Die Oberfläche und der Rechenkern kennen keine Plattform.
  for (const ordner of quellOrdner) {
    for (const datei of existsSync(ordner) ? alleDateien(ordner) : []) {
      if (readFileSync(join(ordner, ...datei.split('/')), 'utf8').includes('@capacitor')) {
        fehler.push(`${relative(process.cwd(), join(ordner, datei)).split(sep).join('/')}: Verweis auf @capacitor in einer plattformfreien Quelle.`);
      }
    }
  }
  return { fehler, bericht };
}

// K3: Ausgabe von cap sync ----------------------------------------------------

function dateiBaum(ordner) {
  if (!statSync(ordner).isDirectory()) throw new Error(`${ordner}: kein Ordner.`);
  return new Map(alleDateien(ordner).map((name) => [name, readFileSync(join(ordner, name))]));
}

function pruefePublic(ist, soll, leereDateien) {
  const fehler = [];
  for (const name of leereDateien) {
    if (soll.has(name)) fehler.push(`dist/${name}: reservierter Name der leeren Cordova-Datei.`);
  }
  const erwartet = new Map([...soll, ...leereDateien.map((name) => [name, Buffer.alloc(0)])]);
  for (const [name, inhalt] of erwartet) {
    if (!ist.has(name)) fehler.push(`assets/public/${name}: Datei fehlt.`);
    else if (!ist.get(name).equals(inhalt)) fehler.push(`assets/public/${name}: ${leereDateien.includes(name) ? 'muss genau 0 Bytes haben' : 'Inhalt weicht von dist ab'}.`);
  }
  for (const name of ist.keys()) {
    if (!erwartet.has(name)) fehler.push(`assets/public/${name}: zusätzliche Datei.`);
  }
  return fehler;
}

function jsonDatei(pfad) { return JSON.parse(readFileSync(pfad, 'utf8')); }
function versucht(fehler, name, funktion) {
  try { funktion(); } catch (e) { fehler.push(`${name}: ${e.message}`); }
}

function gitImProjekt(wurzel, umgebung, ohneGit) {
  // Ein Archiv unter einem fremden Repository darf dessen sauberen Status nicht erben.
  if (!existsSync(join(wurzel, '.git'))) throw new Error(ohneGit);
  const optionen = { cwd: wurzel, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...umgebung, CI: '1', ASTRO_TELEMETRY_DISABLED: '1' } };
  const git = (...argumente) => {
    const ergebnis = spawnSync('git', argumente, optionen);
    if (ergebnis.error) throw new Error(`git ${argumente[0]} ist fehlgeschlagen: ${ergebnis.error.message}`);
    if (ergebnis.status !== 0) throw new Error(`git ${argumente[0]} ist fehlgeschlagen (Rückgabewert ${ergebnis.status}).`);
    return ergebnis.stdout;
  };
  if (realpathSync(git('rev-parse', '--show-toplevel').replace(/\r?\n$/, '')) !== realpathSync(wurzel)) throw new Error(ohneGit);
  return git;
}

/** Zustand unmittelbar vor cap sync: Git-Status und Inhalt der nicht ausgeschlossenen
 * Dateien. Auch saubere versionierte Dateien werden erfasst, damit Git etwa einen
 * vom Sync geänderten Zeilenumbruch nicht durch seine Normalisierung verdeckt. */
export function leseAndroidZustand({ wurzel, umgebung = process.env } = {}) {
  const git = gitImProjekt(wurzel, umgebung, 'Kein zugehöriges Git-Repository: K3 kann die unveränderten Android-Quellen nicht belegen. Für Quellarchive ist ein unabhängig vertrauenswürdiges Dateimanifest nötig; derzeit bitte einen Git-Checkout verwenden.');
  const basis = realpathSync(wurzel);
  const status = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', 'app/android')
    .split('\0').filter(Boolean).map((zeile) => `${zeile.slice(0, 3)}${JSON.stringify(zeile.slice(3))}`);
  const pfade = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'app/android').split('\0').filter(Boolean))].sort();
  const dateien = pfade.map((pfad) => {
    const absolut = join(basis, pfad);
    let info;
    try { info = lstatSync(absolut); } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return { pfad, typ: 'geloescht' };
      throw e;
    }
    const modus = info.mode & 0o777;
    const hash = (inhalt) => createHash('sha256').update(inhalt).digest('hex');
    if (info.isSymbolicLink()) return { pfad, typ: 'symlink', modus, sha256: hash(readlinkSync(absolut, { encoding: 'buffer' })) };
    if (info.isFile()) return { pfad, typ: 'datei', modus, sha256: hash(readFileSync(absolut)) };
    if (info.isDirectory()) return { pfad, typ: 'ordner', modus };
    throw new Error(`${JSON.stringify(pfad)}: nicht unterstützter Dateityp.`);
  });
  return { wurzel: basis, status, dateien };
}

/** K3 liefert wie K1 eine Liste der Fehler; [] bedeutet bestanden. Ohne vorher
 * gilt der strenge Modus (sauberer Git-Status), sonst darf cap sync den zuvor
 * erfassten Zustand nicht verändern. Ohne Git kein Bestehen. */
export function pruefeSync({ wurzel, vorher, vorgabe = VORGABE, umgebung = process.env } = {}) {
  const fehler = [];
  fehler.push(...pruefeNativeQuellen({ wurzel, umgebung }));
  versucht(fehler, 'K3 Dateien', () => {
    const haupt = join(wurzel, 'app/android/app/src/main');
    fehler.push(...pruefePublic(dateiBaum(join(haupt, 'assets/public')), dateiBaum(join(wurzel, 'app/dist')), vorgabe.sync.leereDateien));
    if (!isDeepStrictEqual(jsonDatei(join(haupt, 'assets/capacitor.plugins.json')), [])) fehler.push('assets/capacitor.plugins.json muss inhaltlich [] sein.');
    if (!isDeepStrictEqual(jsonDatei(join(haupt, 'assets/capacitor.config.json')), jsonDatei(join(wurzel, 'app/capacitor.config.json')))) {
      fehler.push('assets/capacitor.config.json weicht inhaltlich von app/capacitor.config.json ab.');
    }
    if (readFileSync(join(haupt, 'res/xml/config.xml'), 'utf8') !== vorgabe.sync.configXml) {
      fehler.push('res/xml/config.xml weicht vom erwarteten Inhalt von cap sync ab.');
    }
  });
  versucht(fehler, 'K3 Git', () => {
    const nachher = leseAndroidZustand({ wurzel, umgebung });
    if (vorher === undefined) {
      if (nachher.status.length) fehler.push(`git status --porcelain -- app/android ist nicht leer:\n${nachher.status.join('\n')}`);
      return;
    }
    if (!vorher || vorher.wurzel !== nachher.wurzel || !Array.isArray(vorher.status) || !Array.isArray(vorher.dateien)) {
      throw new Error('Der Zustand vor cap sync fehlt oder gehört nicht zu dieser Arbeitskopie.');
    }
    const alt = new Map(vorher.dateien.map((datei) => [datei.pfad, datei]));
    const neu = new Map(nachher.dateien.map((datei) => [datei.pfad, datei]));
    for (const pfad of [...new Set([...alt.keys(), ...neu.keys()])].sort()) {
      if (!isDeepStrictEqual(alt.get(pfad), neu.get(pfad))) fehler.push(`cap sync hat den Zustand unter app/android verändert: ${JSON.stringify(pfad)}.`);
    }
    if (!isDeepStrictEqual(vorher.status, nachher.status)) {
      fehler.push(`cap sync hat den Git-Status unter app/android verändert.\nVorher:\n${vorher.status.join('\n') || '(sauber)'}\nNachher:\n${nachher.status.join('\n') || '(sauber)'}`);
    }
  });
  return fehler;
}

// K4: Gradle-Quellen ----------------------------------------------------------

/** Entfernt Groovy-Kommentare, erhält aber Zeichenketten einschließlich // und /*.
 * Kein Groovy-Interpreter: geprüfte Versionsangaben müssen einfache Literale sein.
 * Slashy- und Dollar-Slashy-Zeichenketten bleiben ebenfalls erhalten. */
export function ohneGradleKommentare(text, { zeichenkettenAusblenden = false } = {}) {
  let aus = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('//', i)) {
      const ende = text.indexOf('\n', i);
      aus += ' '.repeat((ende < 0 ? text.length : ende) - i);
      i = ende < 0 ? text.length : ende;
    } else if (text.startsWith('/*', i)) {
      const ende = text.indexOf('*/', i + 2);
      if (ende < 0) throw new Error('Nicht abgeschlossener Gradle-Kommentar.');
      aus += text.slice(i, ende + 2).replace(/[^\r\n]/g, ' ');
      i = ende + 2;
    } else {
      const start = i;
      const dollar = text.startsWith('$/', i);
      const quote = ['"""', "'''", '"', "'"].find((q) => text.startsWith(q, i));
      // Slashy ist an einer Ausdrucksposition möglich; Division bleibt Quelltext.
      const slashy = text[i] === '/' && /(?:^|[=(:,\[!~])\s*$/.test(aus);
      const oeffner = dollar ? '$/' : quote ?? (slashy ? '/' : null);
      if (!oeffner) { aus += text[i++]; continue; }
      const schliesser = dollar ? '/$' : oeffner;
      i += oeffner.length;
      let fertig = false;
      while (i < text.length) {
        if ((dollar || slashy || quote?.startsWith('"')) && text.startsWith('${', i)) throw new Error('Gradle-Interpolation mit ${...} wird nicht unterstützt; geprüfte Werte müssen statisch sein.');
        if (dollar && text[i] === '$' && ['$', '/'].includes(text[i + 1])) { i += 2; continue; }
        if (!dollar && text[i] === '\\') { i += 2; continue; }
        if (text.startsWith(schliesser, i)) { i += schliesser.length; fertig = true; break; }
        i += 1;
      }
      if (!fertig) throw new Error('Nicht abgeschlossene Gradle-Zeichenkette.');
      aus += zeichenkettenAusblenden ? text.slice(start, i).replace(/[^\r\n]/g, ' ') : text.slice(start, i);
    }
  }
  return aus;
}

function versionscode(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('app/package.json: version muss Haupt.Neben.Patch sein.');
  const [haupt, neben, patch] = version.split('.').map(Number);
  if (neben > 99 || patch > 99) throw new Error('app/package.json: Neben und Patch müssen für versionCode kleiner als 100 sein.');
  const code = haupt * 10000 + neben * 100 + patch;
  if (!Number.isSafeInteger(code) || code < 1 || code > 2100000000) throw new Error('app/package.json: versionCode außerhalb des Android-Bereichs.');
  return code;
}

export function pruefeGradle({ wurzel, vorgabe = VORGABE, umgebung = process.env } = {}) {
  const fehler = [];
  fehler.push(...pruefeNativeQuellen({ wurzel, umgebung }));
  versucht(fehler, 'K4 Prüfsummen', () => {
    fehler.push(...pruefeGradlePruefsummen({ datei: join(wurzel, 'app/android/gradle/verification-metadata.xml'), umgebung }).fehler);
  });
  versucht(fehler, 'K4 Git', () => {
    // Nur der Index legt den Modus künftiger Klone fest. Der Dateisystemmodus
    // unter Windows belegt das Ausführungsrecht für einen Linux-Klon nicht.
    const git = gitImProjekt(wurzel, umgebung, 'Kein zugehöriges Git-Repository: K4 kann den Dateimodus von app/android/gradlew im Git-Index nicht belegen. Bitte einen Git-Checkout verwenden.');
    const eintraege = git('ls-files', '--stage', '-z', '--', 'app/android/gradlew').split('\0').filter(Boolean);
    if (eintraege.length !== 1 || !/^[0-7]{6} [0-9a-f]+ 0\tapp\/android\/gradlew$/.test(eintraege[0])) {
      throw new Error('app/android/gradlew: ein eindeutiger Eintrag ohne Konflikt im Git-Index fehlt. Datei mit git add --chmod=+x -- app/android/gradlew aufnehmen.');
    }
    const modus = eintraege[0].slice(0, 6);
    if (modus !== '100755') {
      const behebung = modus === '100644' ? ' Beheben mit: git update-index --chmod=+x -- app/android/gradlew' : ' Erwartet wird eine reguläre ausführbare Datei.';
      throw new Error(`app/android/gradlew: Dateimodus im Git-Index muss 100755 sein, gefunden ${modus}.${behebung}`);
    }
  });
  versucht(fehler, 'K4', () => {
    const werkzeuge = jsonDatei(join(wurzel, 'scripts/toolchain.json'));
    const version = jsonDatei(join(wurzel, 'app/package.json')).version;
    const android = join(wurzel, 'app/android');
    const texte = {};
    const code = {};
    for (const name of ['app/build.gradle', 'build.gradle', 'variables.gradle']) {
      texte[name] = ohneGradleKommentare(readFileSync(join(android, name), 'utf8'));
      code[name] = ohneGradleKommentare(readFileSync(join(android, name), 'utf8'), { zeichenkettenAusblenden: true });
    }
    for (const name of vorgabe.gradle.dateienMitVerboten) {
      for (const verboten of vorgabe.gradle.verboten) {
        if (texte[name].includes(verboten)) fehler.push(`${name}: ${verboten} ist nicht erlaubt (außer in Kommentaren).`);
      }
    }
    const erwarte = (datei, namen, soll) => {
      const muster = new RegExp(`^\\s*(?:${namen.join('|')})\\b\\s*(?:=\\s*)?([^\\r\\n]+)`, 'gm');
      const funde = [...code[datei].matchAll(muster)].map((m) => m[1].trim().replace(/;$/, '').trim());
      const alle = [...code[datei].matchAll(new RegExp(`(?<![\\w.$])(?:${namen.join('|')})\\b`, 'g'))];
      if (funde.length !== 1 || alle.length !== 1 || funde[0] !== soll) fehler.push(`${datei}: ${namen.join('/')} muss genau einmal ${soll} sein, gefunden ${JSON.stringify(funde)}.`);
    };
    for (const [schluessel, variable, namen] of [['minSdk', 'minSdkVersion', ['minSdk', 'minSdkVersion']], ['compileSdk', 'compileSdkVersion', ['compileSdk', 'compileSdkVersion']], ['targetSdk', 'targetSdkVersion', ['targetSdk', 'targetSdkVersion']]]) {
      if (werkzeuge.android[schluessel] !== undefined) {
        erwarte('variables.gradle', [variable], String(werkzeuge.android[schluessel]));
        erwarte('app/build.gradle', namen, `rootProject.ext.${variable}`);
      }
    }
    const erwarteText = (datei, name, soll) => {
      const funde = [...texte[datei].matchAll(new RegExp(`^\\s*${name}\\s*(?:=\\s*)?(['"])(.*?)\\1\\s*;?\\s*$`, 'gm'))]
        .filter((m) => new RegExp(`^\\s*${name}\\b`).test(code[datei].slice(m.index, m.index + m[0].length)));
      const alle = [...code[datei].matchAll(new RegExp(`(?<![\\w.$])${name}\\b`, 'g'))];
      if (funde.length !== 1 || alle.length !== 1 || funde[0][2] !== soll) fehler.push(`${datei}: ${name} muss genau einmal ${JSON.stringify(soll)} sein.`);
    };
    erwarteText('app/build.gradle', 'buildToolsVersion', werkzeuge.android.buildTools);
    erwarteText('app/build.gradle', 'versionName', version);
    erwarte('app/build.gradle', ['versionCode'], String(versionscode(version)));
    const wrapper = readFileSync(join(android, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8');
    for (const [name, soll] of Object.entries({ distributionUrl: `https://services.gradle.org/distributions/gradle-${werkzeuge.gradle.version}-bin.zip`, distributionSha256Sum: werkzeuge.gradle.sha256.bin })) {
      const funde = [...wrapper.matchAll(new RegExp(`^\\s*${name}\\s*[=:]\\s*(.*?)\\s*$`, 'gm'))].map((m) => m[1].replace(/\\:/g, ':'));
      if (!isDeepStrictEqual(funde, [soll])) fehler.push(`gradle-wrapper.properties: ${name} muss genau einmal ${soll} sein.`);
    }
  });
  return fehler;
}

function pruefeExportPfade(baum) {
  const p = baum.kinder[0];
  return baum.kinder.length === 1 && p.name === 'paths'
    && Object.keys(p.attribute).every(k => k === 'xmlns:android')
    && p.kinder.length === 1 && p.kinder[0].name === 'cache-path' && !p.kinder[0].kinder.length
    && isDeepStrictEqual(p.kinder[0].attribute, { name: 'exportdateien', path: 'export/' });
}

// Diese eigenen Texte müssen unabhängig von der Gerätesprache deutsch bleiben.
// Sie sind Ressourcen vorhandener Komponenten und erweitern deren Inventar nicht.
const DATEIABLAUF_TEXTE = {
  datei_teilen_titel: 'Datei teilen',
  projekt_zuruecksetzen_frage: 'Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?',
  projekt_zuruecksetzen_abbrechen: 'Abbrechen',
  projekt_zuruecksetzen_bestaetigen: 'Zurücksetzen',
};

/** K3/K4: Quellenvertrag ergänzt die Prüfung des zusammengeführten APK-Manifests. */
export function pruefeNativeQuellen({ wurzel, umgebung = process.env } = {}) {
  const fehler = [];
  versucht(fehler, 'Native Quellen', () => {
    const src = join(wurzel, 'app/android/app/src');
    const dateien = alleDateien(src);
    if (!isDeepStrictEqual(dateien.filter(p => p.endsWith('AndroidManifest.xml')), ['main/AndroidManifest.xml'])) throw new Error('Genau ein Quellmanifest erwartet.');
    const jdk = findeJdk(umgebung);
    if (!jdk.pfad) throw new Error(`Kein JDK ${werkzeugVorgabe.jdk.hauptversion} für die XML-Quellprüfung gefunden. Siehe docs/toolchain.md.`);
    const java = join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java');
    const baum = leseQuellXml(join(src, 'main/AndroidManifest.xml'), java, umgebung);
    const manifests = nachfahren(baum, 'manifest');
    const apps = nachfahren(baum, 'application');
    if (manifests.length !== 1 || apps.length !== 1) throw new Error('Manifest/application ist nicht eindeutig.');
    if (nachfahren(baum, 'uses-permission').length || nachfahren(baum, 'permission').length
        || manifests[0].kinder.some(k => k.name !== 'application')) fehler.push('Quellmanifest: zusätzliche Berechtigung oder Komponente.');
    const komponenten = apps[0].kinder.filter(k => k.name !== 'meta-data');
    const namen = komponenten.map(k => `${k.name}:${k.attribute['android:name']}`).sort();
    if (!isDeepStrictEqual(namen, ['activity:.MainActivity', 'provider:.io.ExportFileProvider', 'provider:androidx.startup.InitializationProvider'])) fehler.push('Quellmanifest: Komponentenbestand weicht ab.');
    for (const k of komponenten) {
      if (k.attribute['android:exported'] !== (k.name === 'activity' ? 'true' : 'false')) fehler.push('Quellmanifest: exportierte Komponenten weichen ab.');
    }
    const p = komponenten.filter(k => k.attribute['android:name'] === '.io.ExportFileProvider');
    const soll = { 'android:name': '.io.ExportFileProvider', 'android:authorities': '${applicationId}.exportdateien', 'android:exported': 'false', 'android:grantUriPermissions': 'true' };
    if (p.length !== 1 || !isDeepStrictEqual(p[0].attribute, soll) || p[0].kinder.length !== 1
      || p[0].kinder[0].name !== 'meta-data' || p[0].kinder[0].kinder.length
      || !isDeepStrictEqual(p[0].kinder[0].attribute, { 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': '@xml/export_paths' })) fehler.push('ExportFileProvider: Klasse, Authority, exported, Grants oder Pfadressource weichen ab.');
    const pfade = dateien.filter(p => /\/res\/xml[^/]*\/export_paths\.xml$/.test(p));
    if (!isDeepStrictEqual(pfade, ['main/res/xml/export_paths.xml'])) fehler.push('export_paths: genau eine unqualifizierte Pfadressource, keine Varianten erwartet.');
    if (!pruefeExportPfade(leseQuellXml(join(src, 'main/res/xml/export_paths.xml'), java, umgebung))) fehler.push('export_paths: genau ein cache-path export/ ohne weitere Pfadtypen erwartet.');
    const wertDateien = dateien.filter(p => /\/res\/values[^/]*\/[^/]+\.xml$/.test(p))
      .map(p => ({ pfad: p, text: readFileSync(join(src, p), 'utf8').replace(/<!--[\s\S]*?-->/g, '') }));
    for (const { text } of wertDateien) {
      if (/\bname\s*=\s*["']export_paths["']/.test(text)) fehler.push('export_paths: Ressourcenalias ist nicht erlaubt.');
    }
    for (const [name, text] of Object.entries(DATEIABLAUF_TEXTE)) {
      const funde = wertDateien.flatMap(datei => [...datei.text.matchAll(new RegExp(`\\bname\\s*=\\s*["']${name}["']`, 'g'))].map(() => datei));
      if (funde.length !== 1 || funde[0].pfad !== 'main/res/values/strings.xml'
        || !funde[0].text.includes(`<string name="${name}">${text}</string>`)) {
        fehler.push(`${name}: genau eine unqualifizierte String-Ressource mit erwartetem Wortlaut in strings.xml, ohne Alias oder Varianten erwartet.`);
      }
    }
    const activity = readFileSync(join(src, 'main/java/de/baremos/fristenrechner/MainActivity.java'), 'utf8');
    const erwarteteActivity = `package de.baremos.fristenrechner;
      import android.os.Bundle;
      import com.getcapacitor.BridgeActivity;
      import de.baremos.fristenrechner.io.DateiablaufPlugin;
      public class MainActivity extends BridgeActivity {
        @Override protected void onCreate(Bundle savedInstanceState) {
          registerPlugin(NavigationssperrePlugin.class);
          registerPlugin(DateiablaufPlugin.class);
          registerPlugin(MenueZurueckPlugin.class);
          super.onCreate(savedInstanceState);
        }
      }`;
    const normal = text => ohneGradleKommentare(text).replace(/\s+/g, '');
    if (normal(activity) !== normal(erwarteteActivity)) fehler.push('MainActivity: genau NavigationssperrePlugin, DateiablaufPlugin und MenueZurueckPlugin vor super.onCreate registrieren.');
    fehler.push(...pruefeMenueQuelle(readFileSync(join(src, 'main/java/de/baremos/fristenrechner/MenueZurueckPlugin.java'), 'utf8')));
  });
  return fehler;
}

/** Bewusst enger Quellvertrag, kein Ersatz für Java-Übersetzung und Geräteprobe. */
export function pruefeMenueQuelle(java) {
  const text = ohneGradleKommentare(java).replace(/\s+/g, ' '), fehler = [];
  const noetig = [
    '@CapacitorPlugin(name = "MenueZurueck")', 'new OnBackPressedCallback(false)',
    'getOnBackPressedDispatcher().addCallback(getActivity(), callback)',
    'public void handleOnBackPressed() { View decor = getActivity().getWindow().getDecorView(); WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor); if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) { WindowCompat.getInsetsController(getActivity().getWindow(), decor).hide(WindowInsetsCompat.Type.ime()); return; } setEnabled(false); JSObject ereignis = new JSObject(); ereignis.put("folge", folge); notifyListeners("zurueck", ereignis, false); }',
    'public void onPageStarted(WebView webView) { getActivity().runOnUiThread(() -> { callback.setEnabled(false); dokument++; folge = 0; removeAllListeners(); }); }',
    'protected void handleOnDestroy() { getActivity().runOnUiThread(() -> { beendet = true; dokument++; callback.setEnabled(false); callback.remove(); bridge.removeWebViewListener(seiten); removeAllListeners(); }); }',
    'bridge.addWebViewListener(seiten)', 'daten.length() != 2', 'aktivWert instanceof Boolean', 'folgeWert instanceof Number',
    '!Double.isFinite(zahl)', 'zahl < 1', 'zahl > 9007199254740991d', 'zahl != Math.floor(zahl)',
    'getActivity().runOnUiThread(() -> { if (!beendet && aufrufDokument == dokument && neueFolge > folge) { folge = neueFolge; callback.setEnabled(aktiv); } call.resolve(); });',
  ];
  for (const s of noetig) if (!text.includes(s)) fehler.push(`MenueZurueck: Quellvertrag geändert: ${s}`);
  if ((text.match(/new OnBackPressedCallback\(/g) ?? []).length !== 1
    || (text.match(/@PluginMethod\b/g) ?? []).length !== 1
    || !/@PluginMethod public void setzen\(PluginCall call\)/.test(text)
    || (text.match(/notifyListeners\(/g) ?? []).length !== 1) fehler.push('MenueZurueck: genau ein Callback, setzen und Ereignis erwartet.');
  if (/\b(?:onBackPressed|KEYCODE_BACK|goBack|canGoBack|loadUrl|setWebViewClient|handleOnPause|handleOnStop)\b/.test(text)) fehler.push('MenueZurueck: unerlaubter Navigations- oder Lebensdauerweg.');
  return fehler;
}

// K5: APK und die Textausgaben von aapt2 ---------------------------------------

/** Liest nur das eingerückte Ausgabeformat von aapt2 dump xmltree, kein XML. */
function aaptBaum(text) {
  const wurzel = { name: '#', tiefe: -1, attribute: {}, kinder: [] };
  const stapel = [wurzel];
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile.trim()) continue;
    const m = /^( *)([EAN]): (.+)$/.exec(zeile);
    if (!m) throw new Error(`aapt2 xmltree: unbekannte Ausgabe ${zeile.trim()}.`);
    if (m[2] === 'N') continue;
    const tiefe = m[1].length;
    while (stapel.at(-1).tiefe >= tiefe) stapel.pop();
    const eltern = stapel.at(-1);
    if (!eltern) throw new Error('aapt2 xmltree: fehlerhafte Einrückung.');
    if (m[2] === 'E') {
      const element = /^([^ ]+) \(line=\d+\)$/.exec(m[3]);
      if (!element) throw new Error('aapt2 xmltree: Element nicht lesbar.');
      const knoten = { name: element[1], tiefe, attribute: {}, kinder: [] };
      eltern.kinder.push(knoten);
      stapel.push(knoten);
    } else {
      const a = /^(?:(http:\/\/schemas.android.com\/apk\/res\/android):)?([A-Za-z][A-Za-z0-9_.-]*)(?:\(0x[0-9a-f]+\))?=(.*)$/.exec(m[3]);
      if (!a) throw new Error('aapt2 xmltree: Attribut nicht lesbar.');
      const name = `${a[1] ? 'android:' : ''}${a[2]}`;
      if (Object.hasOwn(eltern.attribute, name)) throw new Error(`aapt2 xmltree: doppeltes Attribut ${name}.`);
      const roh = a[3].replace(/ \(Raw: .*\)$/, '');
      eltern.attribute[name] = roh.startsWith('"') ? JSON.parse(roh) : roh;
    }
  }
  return wurzel;
}
function nachfahren(knoten, name) {
  return knoten.kinder.flatMap((kind) => [...(kind.name === name ? [kind] : []), ...nachfahren(kind, name)]);
}
const aWahr = (wert) => ['true', '(type 0x12)0xffffffff'].includes(wert);
const aFalsch = (wert) => ['false', '(type 0x12)0x0'].includes(wert);

/** APKs sind ZIPs mit Stored/Deflate. Keine Extraktion, keine neuen Werkzeuge.
 * ZIP64, Mehrdatenträgerarchive, doppelte Namen und beschädigte Einträge sind Fehler. */
export function leseApkEintraege(pfad) {
  const bytes = readFileSync(pfad);
  let ende = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { ende = i; break; }
  }
  if (ende < 0) throw new Error('APK: ZIP-Verzeichnis fehlt.');
  const zahl = bytes.readUInt16LE(ende + 10);
  const start = bytes.readUInt32LE(ende + 16);
  if (bytes.readUInt32LE(ende + 4) !== 0 || bytes.readUInt16LE(ende + 8) !== zahl || zahl === 65535 || start + bytes.readUInt32LE(ende + 12) !== ende) throw new Error('APK: ZIP64 oder ungültiges ZIP-Verzeichnis.');
  const eintraege = new Map();
  let pos = start;
  let gesamt = 0;
  for (let i = 0; i < zahl; i += 1) {
    if (pos + 46 > ende || bytes.readUInt32LE(pos) !== 0x02014b50) throw new Error('APK: beschädigter ZIP-Eintrag.');
    const flags = bytes.readUInt16LE(pos + 8);
    const methode = bytes.readUInt16LE(pos + 10);
    const summe = bytes.readUInt32LE(pos + 16);
    const gepackt = bytes.readUInt32LE(pos + 20);
    const groesse = bytes.readUInt32LE(pos + 24);
    const namenLaenge = bytes.readUInt16LE(pos + 28);
    const name = bytes.subarray(pos + 46, pos + 46 + namenLaenge).toString('utf8');
    const lokal = bytes.readUInt32LE(pos + 42);
    if (eintraege.has(name) || !name || name.includes('\\') || name.startsWith('/') || name.split('/').some((teil) => teil === '..' || teil === '.')) throw new Error(`APK: doppelter oder ungültiger ZIP-Name ${name}.`);
    if ((flags & 1) || ![0, 8].includes(methode) || groesse > 128 * 1024 * 1024 || (gesamt += groesse) > 512 * 1024 * 1024) throw new Error(`APK: ZIP-Eintrag nicht unterstützt: ${name}.`);
    if (lokal + 30 > start || bytes.readUInt32LE(lokal) !== 0x04034b50 || bytes.readUInt16LE(lokal + 8) !== methode || bytes.readUInt16LE(lokal + 6) !== flags) throw new Error(`APK: lokaler ZIP-Eintrag abweichend: ${name}.`);
    const lokalerName = bytes.subarray(lokal + 30, lokal + 30 + bytes.readUInt16LE(lokal + 26)).toString('utf8');
    const daten = lokal + 30 + bytes.readUInt16LE(lokal + 26) + bytes.readUInt16LE(lokal + 28);
    if (lokalerName !== name || daten + gepackt > start) throw new Error(`APK: ZIP-Daten abweichend: ${name}.`);
    const komprimiert = bytes.subarray(daten, daten + gepackt);
    const inhalt = methode === 0 ? komprimiert : inflateRawSync(komprimiert, { maxOutputLength: Math.max(1, groesse) });
    if (inhalt.length !== groesse || crc32(inhalt) !== summe) throw new Error(`APK: ZIP-Prüfsumme oder Länge abweichend: ${name}.`);
    eintraege.set(name, inhalt);
    pos += 46 + namenLaenge + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32);
  }
  if (pos !== ende) throw new Error('APK: ZIP-Verzeichnis hat zusätzliche Daten.');
  return eintraege;
}

// Gleiche Auswahl und Properties-Maskierung wie android-build.mjs. Ein SDK aus
// local.properties hat Vorrang vor ANDROID_HOME; Fortsetzungen sind Fehler.
function apkSdk(wurzel, angabe, umgebung) {
  const projekt = join(wurzel, 'app/android');
  const datei = join(projekt, 'local.properties');
  const entmaskiere = (text) => text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, z) => z.length === 5 ? String.fromCharCode(parseInt(z.slice(1), 16)) : ({ t: '\t', n: '\n', r: '\r', f: '\f' }[z] ?? z));
  let lokal = null;
  if (existsSync(datei)) for (const roh of readFileSync(datei, 'utf8').split(/\r\n|\r|\n/)) {
    const zeile = roh.replace(/^[ \t\f]+/, '');
    if (!zeile || /^[#!]/.test(zeile)) continue;
    if (/(?:^|[^\\])(?:\\\\)*\\$/.test(zeile)) throw new Error('local.properties verwendet eine nicht unterstützte Fortsetzungszeile.');
    const treffer = /^((?:\\.|[^\\=: \t\f])*)[ \t\f]*[=:]?[ \t\f]*(.*)$/.exec(zeile);
    if (treffer && entmaskiere(treffer[1]) === 'sdk.dir') lokal = entmaskiere(treffer[2]);
  }
  if (lokal === '') throw new Error('sdk.dir in local.properties ist leer.');
  if (lokal !== null) lokal = resolve(projekt, lokal);
  const vergleich = (pfad) => windows ? resolve(pfad).toLowerCase() : resolve(pfad);
  if (angabe && lokal && vergleich(angabe) !== vergleich(lokal)) throw new Error('SDK-Angabe weicht von sdk.dir in local.properties ab.');
  return angabe ? resolve(angabe) : lokal ?? umgebung.ANDROID_HOME ?? standardSdk(umgebung);
}

/** K5: statische Prüfung; keine Aussage über Laufzeit, Signatur oder Reproduzierbarkeit.
 * bericht nimmt bei Bedarf die beobachteten Werte und aapt2-Ausgaben auf. */
export function pruefeApk(apkPfad, { wurzel, debug, vorgabe = VORGABE, sdk, umgebung = process.env, bericht = {} } = {}) {
  const fehler = [];
  versucht(fehler, 'K5', () => {
    if (typeof debug !== 'boolean') throw new Error('Build-Art muss mit debug: true oder false ausdrücklich gewählt werden.');
    const werkzeuge = jsonDatei(join(wurzel, 'scripts/toolchain.json'));
    const version = jsonDatei(join(wurzel, 'app/package.json')).version;
    const aapt2 = join(apkSdk(wurzel, sdk, umgebung), 'build-tools', werkzeuge.android.buildTools, windows ? 'aapt2.exe' : 'aapt2');
    if (!existsSync(aapt2)) throw new Error(`aapt2 aus den Build-Tools ${werkzeuge.android.buildTools} fehlt; K5 ist nicht ausgeführt.`);
    const dump = (art, ...args) => {
      const lauf = spawnSync(aapt2, ['dump', art, ...args, resolve(apkPfad)], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...umgebung, CI: '1', ASTRO_TELEMETRY_DISABLED: '1' } });
      if (lauf.status !== 0 || lauf.error) throw new Error(`aapt2 ${art} fehlgeschlagen (Rückgabewert ${lauf.status}): ${lauf.error?.message ?? lauf.stderr?.trim()}`);
      bericht[`aapt2-${art}${args.length ? `-${args.at(-1)}` : ''}`] = lauf.stdout;
      return lauf.stdout;
    };
    const permissions = dump('permissions');
    const badging = dump('badging');
    const manifest = aaptBaum(dump('xmltree', '--file', 'AndroidManifest.xml'));
    const anwendungen = nachfahren(manifest, 'application');
    if (anwendungen.length !== 1) throw new Error('Manifest muss genau eine application enthalten.');
    const app = anwendungen[0];
    const a = app.attribute;
    const genutzt = [...permissions.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gm)].map((m) => m[1]).sort();
    const deklariert = [...permissions.matchAll(/^permission: ([^\s]+)\s*$/gm)].map((m) => m[1]).sort();
    const berechtigung = vorgabe.apk.berechtigung;
    bericht.berechtigungen = { genutzt, deklariert };
    if (!isDeepStrictEqual(genutzt, [berechtigung]) || !isDeepStrictEqual(deklariert, [berechtigung])) fehler.push(`Berechtigungen: erwartet ausschließlich ${berechtigung}, genutzt ${JSON.stringify(genutzt)}, deklariert ${JSON.stringify(deklariert)}.`);
    // Auch SDK-bedingte permission-Tags müssen sichtbar bleiben, unabhängig vom badging-Format.
    const tags = nachfahren(manifest, 'manifest')[0]?.kinder.filter((k) => k.name.startsWith('uses-permission')) ?? [];
    if (tags.length !== 1 || tags[0].name !== 'uses-permission' || tags[0].attribute['android:name'] !== berechtigung || tags[0].attribute['android:maxSdkVersion'] !== undefined) fehler.push('Manifest: genau eine unbedingte uses-permission erwartet.');
    const paket = /^package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/m.exec(badging);
    if (!paket || paket[1] !== vorgabe.konfiguration.werte.appId || paket[2] !== String(versionscode(version)) || paket[3] !== version) fehler.push(`Paket und Versionen: erwartet ${vorgabe.konfiguration.werte.appId}, ${versionscode(version)}, ${version}.`);
    for (const [name, muster, soll] of [['minSdk', /^(?:minSdkVersion|sdkVersion):'(\d+)'/gm, werkzeuge.android.minSdk], ['targetSdk', /^targetSdkVersion:'(\d+)'/gm, werkzeuge.android.targetSdk]]) {
      const funde = [...badging.matchAll(muster)].map((m) => m[1]);
      if (!isDeepStrictEqual(funde, [String(soll)])) fehler.push(`${name}: erwartet ${soll}, gefunden ${JSON.stringify(funde)}.`);
    }
    const sprachen = /^locales:(.*)$/m.exec(badging);
    const locale = sprachen ? [...sprachen[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((s) => s !== '--_--').sort() : [];
    bericht.sprachen = locale;
    if (!isDeepStrictEqual(locale, vorgabe.apk.sprachen)) fehler.push(`Sprachen: erwartet ${JSON.stringify(vorgabe.apk.sprachen)}, gefunden ${JSON.stringify(locale)}.`);
    if (!aFalsch(a['android:allowBackup'])) fehler.push('application: allowBackup muss false sein.');
    if (a['android:usesCleartextTraffic'] !== undefined && !aFalsch(a['android:usesCleartextTraffic'])) fehler.push('application: usesCleartextTraffic darf nur fehlen oder false sein.');
    for (const [name, soll] of Object.entries(vorgabe.apk.webViewMetadaten)) {
      const funde = app.kinder.filter((k) => k.name === 'meta-data' && k.attribute['android:name'] === name);
      if (funde.length !== 1 || !(soll ? aWahr : aFalsch)(funde[0].attribute['android:value'])) fehler.push(`WebView-Metadatum ${name} muss genau einmal ${soll} sein.`);
    }
    if (nachfahren(app, 'meta-data').some((k) => k.attribute['android:name'] === vorgabe.apk.verbotenerInitializer)) fehler.push(`Initializer ${vorgabe.apk.verbotenerInitializer} ist nicht erlaubt.`);
    const komponenten = app.kinder.filter((k) => ['activity', 'activity-alias', 'receiver', 'service', 'provider'].includes(k.name));
    for (const k of komponenten) {
      if (!aWahr(k.attribute['android:exported']) && !aFalsch(k.attribute['android:exported'])) fehler.push(`Komponente ${k.attribute['android:name']}: exported muss ausdrücklich true oder false sein.`);
    }
    const exportierte = komponenten.filter((k) => aWahr(k.attribute['android:exported'])).map((k) => ({ art: k.name, name: k.attribute['android:name'], berechtigung: k.attribute['android:permission'] ?? null })).sort((x, y) => x.name.localeCompare(y.name));
    bericht.exportierteKomponenten = exportierte;
    if (!isDeepStrictEqual(exportierte, [...vorgabe.apk.exportierteKomponenten].sort((x, y) => x.name.localeCompare(y.name)))) fehler.push('Exportierte Komponenten: erwartet nur MainActivity und ProfileInstallReceiver mit android.permission.DUMP.');
    const inventar = komponenten.map(k => ({ art: k.name, name: k.attribute['android:name'], exportiert: aWahr(k.attribute['android:exported']),
      berechtigung: k.attribute['android:permission'] ?? null, authority: k.attribute['android:authorities'] ?? null,
      grants: aWahr(k.attribute['android:grantUriPermissions']) })).sort((x, y) => x.name.localeCompare(y.name));
    bericht.komponenten = inventar;
    if (!isDeepStrictEqual(inventar, [...vorgabe.apk.komponenten].sort((x, y) => x.name.localeCompare(y.name)))) fehler.push('Gesamtinventar der Komponenten weicht ab.');
    const badgingDebug = /^application-debuggable\s*$/m.test(badging);
    if (debug ? !aWahr(a['android:debuggable']) || !badgingDebug : (a['android:debuggable'] !== undefined && !aFalsch(a['android:debuggable'])) || badgingDebug) fehler.push(`debuggable: erwartet ${debug ? 'true im Debug-Build' : 'fehlend oder false im Release-Build'}.`);
    const resources = dump('resources');
    bericht.dateiablaufTexte = {};
    for (const [name, text] of Object.entries(DATEIABLAUF_TEXTE)) {
      const abschnitte = [...resources.matchAll(new RegExp(`(?:^|\\n) *resource 0x[0-9a-f]+ string/${name}\\r?\\n([\\s\\S]*?)(?=\\n *resource |\\n *type |$)`, 'g'))];
      const zeilen = abschnitte.length === 1 ? abschnitte[0][1].trim().split(/\r?\n/).filter(z => z.trim()) : [];
      if (zeilen.length !== 1 || zeilen[0].trim() !== `() "${text}"`) {
        fehler.push(`${name}: genau eine unqualifizierte String-Ressource mit erwartetem Wortlaut, ohne Alias oder Varianten erwartet.`);
      } else bericht.dateiablaufTexte[name] = text;
    }
    const exportAbschnitte = [...resources.matchAll(/(?:^|\n) *resource (0x[0-9a-f]+) xml\/export_paths\r?\n([\s\S]*?)(?=\n *resource |\n *type |$)/g)];
    const exportZeilen = exportAbschnitte.length === 1 ? exportAbschnitte[0][2].trim().split(/\r?\n/).filter(z => z.trim()) : [];
    const exportDatei = exportZeilen.length === 1 ? /^\s*\(\) \(file\) (res\/[^\s]+\.xml) type=XML\s*$/.exec(exportZeilen[0]) : null;
    if (!exportDatei) fehler.push('export_paths: genau eine unqualifizierte XML-Ressource erwartet; zusätzliche Varianten sind nicht erlaubt.');
    const provider = komponenten.filter(k => k.name === 'provider' && k.attribute['android:name'] === 'de.baremos.fristenrechner.io.ExportFileProvider');
    const p = provider[0];
    if (provider.length !== 1 || !aFalsch(p.attribute['android:exported']) || !aWahr(p.attribute['android:grantUriPermissions'])
      || p.attribute['android:authorities'] !== `${vorgabe.konfiguration.werte.appId}.exportdateien`
      || Object.keys(p.attribute).some(k => !['android:name', 'android:exported', 'android:authorities', 'android:grantUriPermissions'].includes(k))
      || p.kinder.length !== 1 || p.kinder[0].name !== 'meta-data' || p.kinder[0].kinder.length
      || !exportDatei || !isDeepStrictEqual(p.kinder[0].attribute, { 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': `@${exportAbschnitte[0]?.[1]}` })) fehler.push('ExportFileProvider: Klasse, Authority, exported, Grants oder Pfadressource weichen ab.');
    if (exportDatei && !pruefeExportPfade(aaptBaum(dump('xmltree', '--file', exportDatei[1])))) fehler.push('export_paths: genau ein cache-path export/ ohne weitere Pfadtypen erwartet.');
    // Release kann Dateipfade kürzen. Maßgeblich sind Ressourcenname, ID und
    // dessen tatsächliche Datei, nicht der ursprüngliche Quellpfad.
    const abschnitt = /(?:^|\n) *resource (0x[0-9a-f]+) xml\/data_extraction_rules\r?\n([\s\S]*?)(?=\n *resource |\n *type |$)/.exec(resources);
    const dateien = abschnitt?.[2].trim().split(/\r?\n/).filter((z) => z.trim()) ?? [];
    const standard = dateien.length === 1 ? /^\s*\(\) \(file\) (res\/[^\s]+\.xml) type=XML\s*$/.exec(dateien[0]) : null;
    const regeln = standard ? [null, abschnitt[1], standard[1]] : null;
    if (abschnitt && !standard) fehler.push('dataExtractionRules: genau eine unqualifizierte XML-Ressource erwartet; zusätzliche Varianten sind nicht erlaubt.');
    if (!regeln || a['android:dataExtractionRules'] !== `@${regeln[1]}`) fehler.push('dataExtractionRules muss auf xml/data_extraction_rules verweisen.');
    if (regeln) {
      const baum = aaptBaum(dump('xmltree', '--file', regeln[2]));
      const regelnWurzel = baum.kinder[0];
      if (baum.kinder.length !== 1 || regelnWurzel.name !== 'data-extraction-rules' || !isDeepStrictEqual(regelnWurzel.kinder.map((k) => k.name).sort(), ['cloud-backup', 'device-transfer'])) fehler.push('dataExtractionRules: genau cloud-backup und device-transfer erwartet.');
      for (const art of ['cloud-backup', 'device-transfer']) {
        const abschnitte = nachfahren(baum, art);
        const kinder = abschnitte[0]?.kinder ?? [];
        if (abschnitte.length !== 1 || kinder.length !== vorgabe.apk.sicherungsDomaenen.length || !isDeepStrictEqual(kinder.map((k) => k.attribute.domain).sort(), [...vorgabe.apk.sicherungsDomaenen].sort()) || kinder.some((k) => k.name !== 'exclude' || k.attribute.path !== '.' || k.kinder.length)) fehler.push(`dataExtractionRules ${art}: alle neun Domänen müssen mit path="." ausgeschlossen sein.`);
      }
    }
    const eintraege = leseApkEintraege(apkPfad);
    bericht.eintraege = eintraege.size;
    for (const name of eintraege.keys()) if (name.startsWith('lib/') || name.endsWith('.so')) fehler.push(`Native Bibliothek ist nicht erlaubt: ${name}.`);
    const dex = [...eintraege].filter(([name]) => /^classes[^/]*\.dex$/.test(name));
    bericht.dexDateien = dex.map(([name]) => name);
    if (!dex.length) fehler.push('Keine classes*.dex in der APK.');
    for (const [name, inhalt] of dex) for (const folge of vorgabe.apk.verboteneDexBytes) {
      if (inhalt.includes(Buffer.from(folge))) fehler.push(`${name}: verbotene Bytefolge ${folge}.`);
    }
    const pub = new Map([...eintraege].filter(([name]) => name.startsWith('assets/public/') && !name.endsWith('/')).map(([name, inhalt]) => [name.slice('assets/public/'.length), inhalt]));
    fehler.push(...pruefePublic(pub, dateiBaum(join(wurzel, 'app/dist')), vorgabe.sync.leereDateien));
    const plugins = eintraege.get('assets/capacitor.plugins.json');
    if (!plugins || !isDeepStrictEqual(JSON.parse(plugins.toString('utf8')), [])) fehler.push('assets/capacitor.plugins.json muss inhaltlich [] sein.');
    const config = eintraege.get('assets/capacitor.config.json');
    if (!config || !isDeepStrictEqual(JSON.parse(config.toString('utf8')), jsonDatei(join(wurzel, 'app/capacitor.config.json')))) fehler.push('assets/capacitor.config.json weicht inhaltlich von app/capacitor.config.json ab.');
    bericht.publicDateien = pub.size;
  });
  return fehler;
}
