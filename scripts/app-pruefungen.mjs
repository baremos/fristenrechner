// Prüfungen der Build-Kette der App, als reine Funktionen.
// K1: capacitor.config.json gegen die Festlegungen (Herkunft, Fehlerseite, keine
//     Netzfreigaben, Mindestversion der WebView).
// K2: der gebaute Ordner dist: Pflichtdateien, keine Source-Maps, keine Syntax und
//     keine Laufzeitfunktionen über der Mindestversion der WebView, jede Adresse
//     mit Eintrag in app-pruefungen.json, keine Verweise nach außen im HTML und CSS.
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
  for (const [pfad, soll] of Object.entries(vorgabe.konfiguration.werte)) {
    if (wert(config, pfad) !== soll) fehler.push(`${pfad} muss ${JSON.stringify(soll)} sein, ist ${JSON.stringify(wert(config, pfad))}.`);
  }
  for (const pfad of vorgabe.konfiguration.verboten) {
    if (wert(config, pfad) !== undefined) fehler.push(`${pfad} ist nicht erlaubt.`);
  }
  for (const pfad of vorgabe.konfiguration.nichtWahr) {
    if (wert(config, pfad) === true) fehler.push(`${pfad} darf nicht true sein.`);
  }
  for (const pfad of ['loggingBehavior', 'android.loggingBehavior']) {
    const w = wert(config, pfad);
    if (w !== undefined && w !== vorgabe.konfiguration.loggingBehavior) {
      fehler.push(`${pfad} muss ${JSON.stringify(vorgabe.konfiguration.loggingBehavior)} sein, ist ${JSON.stringify(w)}.`);
    }
  }
  if (!Array.isArray(config.includePlugins)) fehler.push('includePlugins muss eine Liste sein.');
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

function adressenIn(text) {
  const treffer = [...text.matchAll(ADRESSE)].map((m) => m[0]);
  const rest = text.replace(ADRESSE, ' ');
  return [...treffer, ...[...rest.matchAll(OHNE_SCHEMA)].map((m) => m[0])];
}

/**
 * Wertet ein Skript aus. art: "module" oder "script".
 * Ergebnis: { syntax: {Merkmal: Anzahl}, laufzeit: {Name: Anzahl}, adressen: [Wortlaut], fehler }
 */
export function analysiereSkript(quelltext, art, { laufzeitNamen = VORGABE.laufzeitNamen } = {}) {
  const ergebnis = { syntax: {}, laufzeit: {}, adressen: [], fehler: [] };
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
        if (k.callee?.type === 'Import' && k.arguments.length > 1) zaehle('syntax', 'Import-Attribute');
        break;
      case 'ImportSpecifier':
        if (k.imported?.type === 'StringLiteral') zaehle('syntax', 'Modulname als Zeichenkette');
        break;
      case 'ExportSpecifier':
      case 'ExportNamespaceSpecifier':
        if (k.exported?.type === 'StringLiteral' || k.local?.type === 'StringLiteral') zaehle('syntax', 'Modulname als Zeichenkette');
        break;
      case 'MemberExpression':
      case 'OptionalMemberExpression': {
        const p = k.property;
        const name = !k.computed && p?.type === 'Identifier' ? p.name : k.computed && p?.type === 'StringLiteral' ? p.value : null;
        if (name && alleNamen.has(name)) zaehle('laufzeit', name);
        break;
      }
      case 'Identifier': {
        const alsEigenschaft = (eltern?.type === 'MemberExpression' || eltern?.type === 'OptionalMemberExpression') && eltern.property === k && !eltern.computed;
        const alsSchluessel = (eltern?.type === 'ObjectProperty' || eltern?.type === 'ObjectMethod' || eltern?.type === 'ClassMethod' || eltern?.type === 'ClassProperty') && eltern.key === k && !eltern.computed;
        if (globale.has(k.name) && !alsEigenschaft && !alsSchluessel) zaehle('laufzeit', k.name);
        break;
      }
      case 'StringLiteral':
        if (alleNamen.has(k.value) && !(eltern?.type === 'MemberExpression' || eltern?.type === 'OptionalMemberExpression')) zaehle('laufzeit', k.value);
        ergebnis.adressen.push(...adressenIn(k.value));
        break;
      case 'TemplateElement':
        ergebnis.adressen.push(...adressenIn(k.value.cooked ?? k.value.raw));
        break;
      default:
        break;
    }
  });
  return ergebnis;
}

const ATTRIBUT = /\s(href|src|action|srcset|formaction|poster|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const NACH_AUSSEN = /^\s*(?:https?:|\/\/|mailto:|tel:|intent:|javascript:|file:|content:|ftp:|wss?:)/i;
const SKRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const STIL = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

function pruefeCss(css, ort, fehler) {
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!/^data:/i.test(m[2])) fehler.push(`${ort}: url(${m[2]}) ist nicht erlaubt, nur data:.`);
  }
  if (/@import\b/i.test(css)) fehler.push(`${ort}: @import ist nicht erlaubt.`);
}

// K2 -------------------------------------------------------------------------

/**
 * Prüft den gebauten Ordner. Liefert { fehler, bericht }.
 * bericht.syntax, bericht.laufzeit und bericht.adressen sind nach Dateistamm gezählt.
 */
export function pruefeDist(distOrdner, { fehlerseite = 'startfehler.html', vorgabe = VORGABE, quellOrdner = [] } = {}) {
  const fehler = [];
  const bericht = { dateien: 0, syntax: {}, laufzeit: {}, adressen: {} };
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
      for (const m of html.matchAll(ATTRIBUT)) {
        const w = m[2] ?? m[3] ?? m[4] ?? '';
        if (NACH_AUSSEN.test(w)) fehler.push(`${datei}: ${m[1]}="${w}" verweist nach außen.`);
      }
      for (const m of html.matchAll(STIL)) pruefeCss(m[1], `${datei} <style>`, fehler);
      for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) pruefeCss(m[1], `${datei} style=`, fehler);
      let nummer = 0;
      for (const m of html.matchAll(SKRIPT)) {
        nummer++;
        if (/\ssrc\s*=/i.test(m[1]) || !m[2].trim()) continue;
        const art = /\btype\s*=\s*["']?module\b/i.test(m[1]) ? 'module' : 'script';
        werteSkriptAus(m[2], art, datei, `${datei} Skript ${nummer} (${art})`);
      }
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
