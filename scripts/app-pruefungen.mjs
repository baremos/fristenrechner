// Prüfungen der Build-Kette der App, als reine Funktionen.
// K1: capacitor.config.json gegen die Festlegungen: nur bekannte Schlüssel,
//     Herkunft, Fehlerseite, keine Netzfreigaben, Mindestversion der WebView.
// K2: der gebaute Ordner dist: Pflichtdateien, keine Source-Maps, keine Syntax und
//     keine Laufzeitfunktionen über der Mindestversion der WebView, kein eval und
//     kein Function-Konstruktor ohne Eintrag, jede Adresse in Skripten mit Eintrag
//     in app-pruefungen.json, keine Verweise nach außen in HTML und CSS.
// K2 ist eine statische Prüfung. Sie sieht keine berechneten Namen (a[x + y]),
// keinen Code, der erst zur Laufzeit entsteht, keinen Alias des Function-Konstruktors
// und keine Adressen, die aus Teilen zusammengesetzt werden. Das HTML liest sie mit
// regulären Ausdrücken, nicht mit dem vollständigen Tokenizer eines Browsers: dessen
// Fehlerkorrekturen, Zeichenreferenzen in Attributnamen und die Sonderzustände eines
// Skripts, das "<!--" und "<script" enthält, bildet sie nicht nach. Dass die App keine
// Verbindung aufbaut und nicht nach außen navigiert, belegen die Läufe im Emulator
// mit Netzmelder und Gegenprobe.
// Aufruf über scripts/app-bauen.mjs. Die Regeln stehen in scripts/app-pruefungen.json.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { parse } from '@babel/parser';

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
    if (w !== undefined && w !== vorgabe.konfiguration.loggingBehavior) {
      fehler.push(`${pfad} muss ${JSON.stringify(vorgabe.konfiguration.loggingBehavior)} sein, ist ${JSON.stringify(w)}.`);
    }
  }
  if (!Array.isArray(config.includePlugins) || !config.includePlugins.every((p) => typeof p === 'string')) {
    fehler.push('includePlugins muss eine Liste von Paketnamen sein.');
  }
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
  return basename(datei).replace(/\.[A-Za-z0-9_-]{8}\.js$/, '').replace(/\.js$/, '');
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

/**
 * Wertet ein Skript aus. art: "module" oder "script".
 * Ergebnis: { syntax: {Merkmal: Anzahl}, laufzeit: {Name: Anzahl}, dynamisch: {Name: Anzahl},
 *            adressen: [Wortlaut], fehler }
 */
export function analysiereSkript(quelltext, art, { laufzeitNamen = VORGABE.laufzeitNamen } = {}) {
  const ergebnis = { syntax: {}, laufzeit: {}, dynamisch: {}, adressen: [], fehler: [] };
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
        break;
      case 'CallExpression':
      case 'OptionalCallExpression':
      case 'NewExpression': {
        if (k.callee?.type === 'Import' && k.arguments.length > 1) zaehle('syntax', 'Import-Attribute');
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
        if (k.name === 'eval' && !alsEigenschaft && !alsSchluessel) zaehle('dynamisch', 'eval');
        break;
      }
      case 'StringLiteral':
      case 'TemplateLiteral': {
        // Konstante Namen zählen auch außerhalb eines Zugriffs, etwa Reflect.get(o, "at").
        const text = konstanterText(k);
        const alsEigenschaft = (eltern?.type === 'MemberExpression' || eltern?.type === 'OptionalMemberExpression') && eltern.property === k;
        if (text !== null && alleNamen.has(text) && !alsEigenschaft) zaehle('laufzeit', text);
        if (k.type === 'StringLiteral') ergebnis.adressen.push(...adressenIn(k.value));
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
    } else {
      pruefeTag(m[6].toLowerCase(), attributeVon(m[7]), datei, fehler);
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
  const bericht = { dateien: 0, syntax: {}, laufzeit: {}, dynamisch: {}, adressen: {} };
  // Jeder Eintrag der Regeldatei braucht Datei, eine Höchstzahl ab 1 und einen Grund.
  for (const liste of ['laufzeitAusnahmen', 'dynamischerCode', 'adressen']) {
    if (!Array.isArray(vorgabe[liste])) { fehler.push(`app-pruefungen.json: ${liste} fehlt oder ist keine Liste.`); continue; }
    for (const e of vorgabe[liste]) {
      if (typeof e?.datei !== 'string' || !e.datei || !Number.isInteger(e.hoechstzahl) || e.hoechstzahl < 1
        || typeof e.grund !== 'string' || !e.grund.trim() || typeof (e.name ?? e.wortlaut) !== 'string') {
        fehler.push(`app-pruefungen.json: Eintrag in ${liste} ohne Datei, Name, gültige Höchstzahl oder Grund: ${JSON.stringify(e)}`);
      }
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
    for (const adresse of a.adressen) zaehle('adressen', stamm, adresse, 1);
  };
  for (const datei of dateien) {
    const pfad = join(distOrdner, ...datei.split('/'));
    const endung = extname(datei).toLowerCase();
    if (endung === '.map') { fehler.push(`${datei}: Source-Maps gehören nicht in die App.`); continue; }
    if (endung === '.js' || endung === '.mjs') {
      werteSkriptAus(readFileSync(pfad, 'utf8'), 'module', dateistamm(datei), datei);
    } else if (endung === '.css') {
      pruefeCss(readFileSync(pfad, 'utf8'), datei, fehler);
    } else if (endung === '.html') {
      const html = readFileSync(pfad, 'utf8');
      if (!/<head[\s>]/i.test(html)) fehler.push(`${datei}: <head> fehlt; Capacitor fügt seine Brücke dort ein.`);
      if (datei === fehlerseite && /<script\b/i.test(html)) fehler.push(`${datei}: Die Fehlerseite darf kein Skript enthalten.`);
      pruefeHtml(html, datei, fehler, werteSkriptAus, (adresse) => zaehle('adressen', datei, adresse, 1));
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
