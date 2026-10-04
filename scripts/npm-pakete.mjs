#!/usr/bin/env node
// Prüft den npm-Paketvertrag offline, ohne Lebenszyklusskripte auszuführen.
// Aufruf: node scripts/npm-pakete.mjs --ausgabe <neuer/leerer Ordner> [--ohne-cr]
// Im Repository sind Ausgaben nur unter scratchpad/ zulässig. Alle erzeugten
// Dateien einschließlich npm-Cache, Protokollen und Vergleichsbuild bleiben dort.
// Rückgabewerte: 0 bestanden, 1 Prüf-/Werkzeugfehler, 64 Aufruffehler.

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse as parseAstro } from '@astrojs/compiler-rs';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Aktivieren, sobald der Kern eine README erhält, spätestens vor Veröffentlichung.
export const KERN_README_PFLICHT = false;
export const PACK_ARGUMENTE = ['pack', '--dry-run', '--json', '--offline', '--ignore-scripts',
  '--workspace', 'packages/kern', '--workspace', 'packages/oberflaeche'];
const PAKETE = [
  { ordner: 'packages/kern', name: '@baremos/fristenrechner-kern' },
  { ordner: 'packages/oberflaeche', name: '@baremos/fristenrechner-ui' },
];
const objekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const fehler = (code, meldung) => ({ code, meldung });
const pfadGueltig = (p) => typeof p === 'string' && !/[\\:\x00-\x1f?#]/.test(p)
  && p.split('/').every((t) => t && t !== '.' && t !== '..');
const verboten = (p) => /(^|\/)(?:tests?|referenz[^/]*|__snapshots__|fixtures?|scratchpad|node_modules)(\/|$)|\.test\./i.test(p);
const kernReadme = (p) => /^README(?:\.[a-z0-9-]+)?$/i.test(p);
const darunter = (basis, p) => {
  const r = relative(basis, p);
  return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
};

// Keine symbolischen Links in Paketdateien oder ihren Eltern zulassen. Die
// Packliste soll echte Dateien innerhalb des jeweiligen Workspaces belegen.
function lesePaketdatei(basis, pfad) {
  let ort = basis;
  if (!pfadGueltig(pfad) || lstatSync(ort).isSymbolicLink()) throw new Error('Paketpfad');
  for (const teil of pfad.split('/')) {
    ort = join(ort, teil);
    if (lstatSync(ort).isSymbolicLink()) throw new Error('Paketpfad');
  }
  if (!statSync(ort).isFile() || !darunter(realpathSync(basis), realpathSync(ort))) throw new Error('Paketdatei');
  return readFileSync(ort);
}

function dateibaum(basis, prefix = '') {
  const ergebnis = [];
  for (const eintrag of readdirSync(join(basis, prefix), { withFileTypes: true })) {
    const pfad = prefix + eintrag.name;
    if (eintrag.isDirectory()) ergebnis.push(...dateibaum(basis, `${pfad}/`));
    else if (eintrag.isFile()) ergebnis.push(pfad);
    else throw new Error('Keine reguläre Datei');
  }
  return ergebnis.sort();
}

export function pruefeDist(wurzel, vergleichsOrdner) {
  const meldungen = [];
  try {
    const basis = join(wurzel, 'packages/kern/dist');
    if (lstatSync(basis).isSymbolicLink()) throw new Error('Dist-Pfad');
    const ist = dateibaum(basis);
    const soll = dateibaum(vergleichsOrdner);
    if (soll.length === 0) return [fehler('NPM_DIST', 'Der Vergleichsbuild des Kerns ist leer.')];
    for (const p of new Set([...ist, ...soll])) {
      if (!ist.includes(p)) meldungen.push(fehler('NPM_DIST', `Kern: dist/${p} fehlt; Kern zuerst selbst bauen.`));
      else if (!soll.includes(p)) meldungen.push(fehler('NPM_DIST', `Kern: zusätzliche alte Datei dist/${p}; dist bereinigen und den Kern neu bauen.`));
      else if (!lesePaketdatei(basis, p).equals(lesePaketdatei(vergleichsOrdner, p))) {
        meldungen.push(fehler('NPM_DIST', `Kern: dist/${p} weicht vom frischen Vergleichsbuild ab.`));
      }
    }
  } catch { meldungen.push(fehler('NPM_DIST', 'Kern-dist oder Vergleichsbuild fehlt oder ist nicht regulär lesbar; Kern zuerst selbst bauen.')); }
  return meldungen;
}

// Die vorhandenen Compiler bestimmen die Syntaxgrenzen. Dadurch verdecken
// reguläre Ausdrücke, Vorlagen und Astro-Vorspannformen keine Importanweisungen.
// Variable Importziele und nicht unterstützte Asset-Muster scheitern geschlossen.
function jsImporte(text, dateiname) {
  const art = /\.tsx$/.test(dateiname) ? ts.ScriptKind.TSX
    : /\.jsx$/.test(dateiname) ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(dateiname) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(dateiname, text, ts.ScriptTarget.Latest, true, art);
  if (ast.parseDiagnostics.length) throw new Error('JavaScript-/TypeScript-Syntax ist ungültig');
  const importe = [];
  const merken = (ziel, url = false) => {
    if (!ziel || !ts.isStringLiteralLike(ziel)) throw new Error('Importziel ist nicht statisch lesbar');
    const pfad = url ? relativeUrl(ziel.text) : ziel.text.startsWith('.') ? ziel.text : null;
    if (pfad) importe.push(pfad);
  };
  const importMeta = (knoten) => ts.isMetaProperty(knoten)
    && knoten.keywordToken === ts.SyntaxKind.ImportKeyword && knoten.name.text === 'meta';
  const eigenschaft = (knoten, name, objektPruefen) => ts.isPropertyAccessExpression(knoten)
    && knoten.name.text === name && objektPruefen(knoten.expression)
    || ts.isElementAccessExpression(knoten) && ts.isStringLiteralLike(knoten.argumentExpression)
      && knoten.argumentExpression.text === name && objektPruefen(knoten.expression);
  const besuchen = (knoten) => {
    if (ts.isImportDeclaration(knoten) || ts.isExportDeclaration(knoten)) {
      if (knoten.moduleSpecifier) merken(knoten.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(knoten) && ts.isExternalModuleReference(knoten.moduleReference)) {
      merken(knoten.moduleReference.expression);
    } else if (ts.isImportTypeNode(knoten)) {
      if (!ts.isLiteralTypeNode(knoten.argument)) throw new Error('Importtyp ist nicht statisch lesbar');
      merken(knoten.argument.literal);
    } else if (ts.isModuleDeclaration(knoten) && ts.isStringLiteral(knoten.name)) {
      merken(knoten.name);
    } else if (ts.isCallExpression(knoten)) {
      const ziel = knoten.expression;
      if (ziel.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(ziel) && ziel.text === 'require') {
        merken(knoten.arguments[0]);
      } else if (eigenschaft(ziel, 'glob', importMeta) || eigenschaft(ziel, 'globEager', importMeta)) {
        throw new Error('import.meta.glob ist keine einzeln prüfbare Paketdatei');
      }
    } else if (ts.isNewExpression(knoten) && ts.isIdentifier(knoten.expression) && knoten.expression.text === 'URL'
        && knoten.arguments?.[1] && eigenschaft(knoten.arguments[1], 'url', importMeta)) {
      merken(knoten.arguments[0], true);
    }
    ts.forEachChild(knoten, besuchen);
    // JSDoc ist nicht Teil von forEachChild, kann aber echte Importtypen tragen.
    for (const dokumentation of knoten.jsDoc ?? []) besuchen(dokumentation);
  };
  for (const verweis of [...ast.referencedFiles, ...ast.typeReferenceDirectives]) {
    if (verweis.fileName.startsWith('.')) importe.push(verweis.fileName);
  }
  besuchen(ast);
  return importe;
}

function cssImporte(text) {
  const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // image-set erlaubt auch Zeichenketten ohne url(). Solange dafür kein
  // CSS-Parser genutzt wird, darf diese Form keine ungeprüften Assets verbergen.
  if (/(?:^|[^\w-])(?:-webkit-)?image-set\s*\(/i.test(ohneKommentare)) {
    throw new Error('CSS image-set ist nicht statisch prüfbar');
  }
  return [...ohneKommentare.matchAll(/@import\s*["']([^"']+)["']|url\(\s*(?:["']([^"']+)["']|([^\s)'";]+))\s*\)/gi)]
    .map((m) => relativeUrl(m[1] ?? m[2] ?? m[3])).filter(Boolean);
}

function relativeUrl(p) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(p) ? null : p.startsWith('.') ? p : `./${p}`;
}

export function relativeImporte(quelltext, dateiname) {
  if (dateiname.endsWith('.css')) return cssImporte(quelltext);
  if (!dateiname.endsWith('.astro')) return jsImporte(quelltext, dateiname);
  const { ast, diagnostics } = parseAstro(quelltext);
  if (diagnostics.some((d) => d.severity === 'error')) throw new Error('Astro-Syntax ist ungültig');
  const importe = [];
  const besuchen = (knoten) => {
    if (!knoten || typeof knoten !== 'object') return;
    if (knoten.type === 'AstroFrontmatter') {
      // program.start kann führende Kommentare auslassen, etwa Triple-Slash-
      // Verweise. Deshalb die vollständigen Compilergrenzen ohne Zäune lesen.
      if (knoten.end > knoten.start) {
        const vorspann = quelltext.slice(knoten.start, knoten.end);
        const anfang = /^\s*---/.exec(vorspann);
        if (!anfang || !vorspann.endsWith('---')) throw new Error('Astro-Vorspanngrenzen sind ungültig');
        importe.push(...jsImporte(vorspann.slice(anfang[0].length, -3), `${dateiname}.ts`));
      }
      return;
    }
    if (knoten.type === 'JSXElement') {
      const oeffnung = knoten.openingElement;
      const name = oeffnung.name?.name;
      if (name === 'script') {
        const src = oeffnung.attributes.find((a) => a.type === 'JSXAttribute' && a.name?.name === 'src');
        if (src) {
          if (src.value?.type !== 'Literal' || typeof src.value.value !== 'string') {
            throw new Error('Skriptquelle ist nicht statisch lesbar');
          }
          const ziel = relativeUrl(src.value.value);
          if (ziel) importe.push(ziel);
        }
        // Datenblöcke, etwa application/json, sind beim Compiler JSXText.
        if (knoten.children.some((kind) => kind.type === 'AstroScript')) {
          const ende = knoten.closingElement?.start ?? oeffnung.end;
          importe.push(...jsImporte(quelltext.slice(oeffnung.end, ende), `${dateiname}.ts`));
        }
        return;
      } else if (name === 'style') {
        const ende = knoten.closingElement?.start ?? oeffnung.end;
        importe.push(...cssImporte(quelltext.slice(oeffnung.end, ende)));
        return;
      }
    }
    for (const wert of Object.values(knoten)) {
      if (Array.isArray(wert)) wert.forEach(besuchen);
      else if (wert && typeof wert === 'object') besuchen(wert);
    }
  };
  besuchen(ast);
  return importe;
}

function exportZiele(wert, unterpfade = true) {
  if (wert === null) return [];
  if (typeof wert === 'string') {
    if (!wert.startsWith('./')) throw new Error('Exportziel muss mit ./ beginnen');
    return [wert];
  }
  if (Array.isArray(wert)) return wert.flatMap((ziel) => exportZiele(ziel, false));
  if (objekt(wert)) {
    const keys = Object.keys(wert);
    const mitPunkt = keys.filter((k) => k.startsWith('.'));
    if (mitPunkt.length && (!unterpfade || mitPunkt.length !== keys.length)) throw new Error('Gemischte Exportschlüssel');
    if (mitPunkt.some((k) => k !== '.' && (!k.startsWith('./') || !pfadGueltig(k.slice(2)) || k.includes('*')))
        || keys.some((k) => /^(?:0|[1-9]\d*)$/.test(k))) throw new Error('Ungültiger Exportschlüssel');
    return Object.values(wert).flatMap((ziel) => exportZiele(ziel, false));
  }
  throw new Error('Ungültiges Exportziel');
}

export function pruefePaketvertrag({ wurzel, packliste, kernDateien, oberflaecheDateien, ohneCr = false, kernReadmePflicht = KERN_README_PFLICHT }) {
  const meldungen = [];
  const melden = (code, text) => meldungen.push(fehler(code, text));
  const manifeste = [];
  const kernSoll = Array.isArray(kernDateien) ? kernDateien : [];
  if (!Array.isArray(kernDateien) || !kernDateien.length || kernDateien.some((p) => !pfadGueltig(p) || !p.startsWith('dist/'))) {
    melden('NPM_DIST', 'Die Dateimenge des frischen Kern-Vergleichsbuilds fehlt oder ist ungültig.');
  }
  if (!Array.isArray(packliste) || packliste.length !== 2
      || new Set(packliste.map((p) => p?.name)).size !== 2
      || packliste.some((p) => !PAKETE.some((w) => w.name === p?.name))) {
    return [fehler('NPM_LISTE', 'Die Packliste muss genau Kern und Oberfläche enthalten.')];
  }
  for (const [index, workspace] of PAKETE.entries()) {
    const basis = join(wurzel, workspace.ordner);
    const paket = packliste.find((p) => p.name === workspace.name);
    const label = index === 0 ? 'Kern' : 'Oberfläche';
    let manifest;
    try { manifest = JSON.parse(lesePaketdatei(basis, 'package.json').toString('utf8')); }
    catch { melden('NPM_DATEI', `${label}: package.json ist nicht regulär lesbar.`); continue; }
    if (!objekt(manifest)) { melden('NPM_DATEI', `${label}: package.json enthält kein Objekt.`); continue; }
    manifeste[index] = manifest;
    if (manifest.name !== paket.name || manifest.version !== paket.version) melden('NPM_LISTE', `${label}: Name oder Version weicht vom Manifest ab.`);
    if (!Array.isArray(paket.bundled) || paket.bundled.length) melden('NPM_LISTE', `${label}: bundled muss leer sein.`);
    for (const feld of ['bundleDependencies', 'bundledDependencies']) {
      if (Object.hasOwn(manifest, feld) && (!Array.isArray(manifest[feld]) || manifest[feld].length)) {
        melden('NPM_LISTE', `${label}: ${feld} muss fehlen oder eine leere Liste sein.`);
      }
    }
    if (!Array.isArray(paket.files) || !paket.files.length) { melden('NPM_LISTE', `${label}: Dateiliste fehlt.`); continue; }
    const pfade = new Set(paket.files.map((f) => f?.path));
    if (pfade.size !== paket.files.length) melden('NPM_LISTE', `${label}: doppelte Dateipfade.`);
    const verfolgt = new Set(oberflaecheDateien);
    for (const f of paket.files) {
      const p = f?.path;
      if (!pfadGueltig(p)) { melden('NPM_PFAD', `${label}: ungültiger relativer Paketpfad.`); continue; }
      const erlaubt = ['package.json', 'LICENSE', 'NOTICE'].includes(p) || (index === 0
        ? /^dist\/[^/]+(?:\.js|\.d\.ts)$/.test(p) || kernReadme(p)
        : p === 'README.md' || p.startsWith('src/') && verfolgt.has(p));
      if (!erlaubt || verboten(p)) { melden('NPM_PFAD', `${label}: unerlaubte Datei ${p}.`); continue; }
      let bytes;
      try { bytes = lesePaketdatei(basis, p); }
      catch { melden('NPM_DATEI', `${label}: ${p} ist nicht regulär lesbar.`); continue; }
      if (f.size !== bytes.length) melden('NPM_DATEI', `${label}: Größe von ${p} weicht von der Packliste ab.`);
      if (ohneCr && bytes.includes(13)) melden('NPM_CR', `${label}: ${p} enthält CR-Zeichen.`);
      if (/\.(?:[cm]?js|[cm]?ts|jsx|tsx|astro|css)$/.test(p)) {
        try {
          for (const ziel of relativeImporte(bytes.toString('utf8'), p)) {
            const ohneZusatz = ziel.split(/[?#]/, 1)[0];
            const aufgeloest = posix.normalize(posix.join(posix.dirname(p), ohneZusatz));
            // TypeScript ersetzt .js in Deklarationsimporten durch .d.ts.
            const kandidaten = [p.endsWith('.d.ts') && aufgeloest.endsWith('.js')
              ? aufgeloest.slice(0, -3) + '.d.ts' : aufgeloest];
            if (index === 1 && !posix.extname(aufgeloest)) {
              for (const endung of ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']) {
                kandidaten.push(aufgeloest + endung, `${aufgeloest}/index${endung}`);
              }
            }
            if (!pfadGueltig(aufgeloest) || ziel.includes('\\') || !kandidaten.some((k) => pfade.has(k))) {
              melden('NPM_IMPORT', `${label}: relativer Import ${ziel} in ${p} fehlt in der Packliste.`);
            }
          }
        } catch { melden('NPM_IMPORT', `${label}: Importsyntax in ${p} ist nicht statisch prüfbar.`); }
      }
    }
    for (const p of ['package.json', 'LICENSE', 'NOTICE', ...(index === 1 ? ['README.md', ...verfolgt] : [])]) {
      if (!pfade.has(p)) melden('NPM_DATEI', `${label}: ${p} fehlt in der Packliste.`);
    }
    if (index === 0) {
      if (![...pfade].some((p) => typeof p === 'string' && p.startsWith('dist/'))) melden('NPM_DATEI', 'Kern: dist fehlt in der Packliste.');
      const ist = [...pfade].filter((p) => typeof p === 'string' && p.startsWith('dist/'));
      for (const p of kernSoll) if (!pfade.has(p)) melden('NPM_DATEI', `Kern: ${p} aus dem frischen Build fehlt in der Packliste.`);
      for (const p of ist) {
        if (!kernSoll.includes(p)) melden('NPM_DATEI', `Kern: ${p} in der Packliste gehört nicht zum frischen Build.`);
        if (p.endsWith('.js') && !pfade.has(p.slice(0, -3) + '.d.ts')) melden('NPM_DATEI', `Kern: Deklarationsdatei zu ${p} fehlt in der Packliste.`);
      }
      if (kernReadmePflicht && ![...pfade].some((p) => typeof p === 'string' && kernReadme(p))) melden('NPM_README', 'Kern: README fehlt in der Packliste.');
      for (const p of readdirSync(basis).filter(kernReadme)) if (!pfade.has(p)) melden('NPM_README', `Kern: vorhandenes ${p} fehlt in der Packliste.`);
    }
    try {
      const ziele = exportZiele(manifest.exports);
      const haupt = objekt(manifest.exports) && Object.keys(manifest.exports).some((k) => k.startsWith('.'))
        ? manifest.exports['.'] : manifest.exports;
      if (!exportZiele(haupt, false).length) throw new Error('Haupteinstieg fehlt');
      for (const k of ['main', 'module', 'types', 'typings']) {
        if (!Object.hasOwn(manifest, k)) continue;
        if (typeof manifest[k] !== 'string') throw new Error('Ungültiges Einstiegsfeld');
        ziele.push(manifest[k]);
      }
      if (Object.hasOwn(manifest, 'browser') || Object.hasOwn(manifest, 'typesVersions')) throw new Error('Nicht unterstütztes Einstiegsfeld');
      for (const ziel of ziele) {
        const p = ziel.replace(/^\.\//, '');
        if (!pfadGueltig(p) || p.includes('*') || !pfade.has(p)) melden('NPM_EINSTIEG', `${label}: Einstieg ${ziel} fehlt oder ist kein konkretes Paketdateiziel.`);
      }
    } catch { melden('NPM_EINSTIEG', `${label}: exports muss einen Haupteinstieg mit ./-Zielen und einheitlichen Schlüsseln enthalten; main/module/types/typings müssen Dateiziele sein. browser/typesVersions werden nicht unterstützt.`); }
  }
  const [kern, ui] = manifeste;
  if (kern && ui && (typeof kern.version !== 'string' || !kern.version || kern.version !== ui.version
      || ui.dependencies?.[PAKETE[0].name] !== kern.version)) {
    melden('NPM_VERSION', 'Kern und Oberfläche müssen dieselbe Version und die Oberfläche eine exakt passende Kern-Abhängigkeit haben.');
  }
  return meldungen;
}

export function argumente(argv) {
  const werte = { ohneCr: false };
  const gesehen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (gesehen.has(a)) throw new Error('Argument mehrfach angegeben.');
    gesehen.add(a);
    if (a === '--ohne-cr') werte.ohneCr = true;
    else if (a === '--ausgabe' && argv[i + 1] && !argv[i + 1].startsWith('--')) werte.ausgabe = resolve(argv[++i]);
    else throw new Error('Unbekanntes oder unvollständiges Argument.');
  }
  if (!werte.ausgabe) throw new Error('--ausgabe ist Pflicht.');
  return werte;
}

export function pruefeAusgabe(wurzel, ausgabe) {
  // Erst bestehende Vorfahren auflösen, dann prüfen; noch nichts schreiben.
  if (process.platform === 'win32' && /^[\\/]{2}/.test(ausgabe)) throw new Error('UNC- und Namensraum-Pfade sind als Ausgabe nicht zulässig.');
  let vorfahr = ausgabe;
  while (!existsSync(vorfahr)) {
    const eltern = dirname(vorfahr);
    if (eltern === vorfahr) throw new Error('Ausgabeordner ist nicht auflösbar.');
    vorfahr = eltern;
  }
  const echt = resolve(realpathSync.native(vorfahr), relative(vorfahr, ausgabe));
  const echteWurzel = realpathSync.native(wurzel);
  const grenzen = [[resolve(wurzel), ausgabe], [echteWurzel, echt]];
  // Auch ein anderer Worktree oder der Hauptcheckout darf nicht zum
  // unbemerkten Ausgabeziel außerhalb seines scratchpad/ werden.
  for (const ziel of [ausgabe, echt]) {
    let eltern = dirname(ziel);
    while (true) {
      if (existsSync(join(eltern, '.git'))) { grenzen.push([eltern, ziel]); break; }
      const weiter = dirname(eltern);
      if (weiter === eltern) break;
      eltern = weiter;
    }
  }
  for (const [basis, ziel] of grenzen) {
    if (ziel === basis || darunter(basis, ziel) && !darunter(join(basis, 'scratchpad'), ziel)) {
      throw new Error('Im Repository muss die Ausgabe in einem Unterordner von scratchpad/ liegen.');
    }
  }
  if (echt !== ausgabe && darunter(resolve(wurzel), ausgabe)) throw new Error('Ausgabe über einen symbolischen Link ist nicht zulässig.');
  if (existsSync(ausgabe) && (!statSync(ausgabe).isDirectory() || readdirSync(ausgabe).length)) throw new Error('Ausgabeordner muss neu oder leer sein.');
}

function findeNpm(umgebung) {
  const basis = dirname(process.execPath);
  const kandidaten = umgebung.npm_execpath ? [umgebung.npm_execpath] : [join(basis, 'node_modules/npm/bin/npm-cli.js'),
    join(basis, '../lib/node_modules/npm/bin/npm-cli.js'), join(basis, 'npm')];
  for (const kandidat of kandidaten) {
    try {
      const echt = realpathSync.native(kandidat);
      const paketwurzel = dirname(dirname(echt));
      const manifest = JSON.parse(readFileSync(join(paketwurzel, 'package.json'), 'utf8'));
      if (statSync(echt).isFile() && echt === join(paketwurzel, 'bin/npm-cli.js') && manifest.name === 'npm') return echt;
    } catch { /* Nächsten bekannten Installationsort prüfen. */ }
  }
  throw Object.assign(new Error(umgebung.npm_execpath
    ? 'npm_execpath verweist nicht auf eine erkennbare npm-Kommandozeile.'
    : 'npm-Kommandozeile fehlt oder ihr Paketmanifest ist nicht lesbar.'), { pruefcode: 'NPM_NPM' });
}

export function starte(argv, { wurzel = WURZEL, umgebung = process.env, spawn = spawnSync, ausgabe = console.log } = {}) {
  let werte;
  try { werte = argumente(argv); pruefeAusgabe(wurzel, werte.ausgabe); }
  catch (e) {
    ausgabe(`Fehler [NPM_AUFRUF]: ${e.message}`);
    ausgabe('Aufruf: node scripts/npm-pakete.mjs --ausgabe <neuer/leerer Ordner> [--ohne-cr]');
    ausgabe('ERGEBNIS: Nacharbeit nötig');
    return 64;
  }
  let code = 1;
  const meldungen = [];
  const bericht = { formatVersion: 1, datum: new Date().toISOString(), ok: false, ohneCr: werte.ohneCr,
    kernReadmePflicht: KERN_README_PFLICHT, pakete: [], fehler: meldungen, werkzeuge: {},
    lizenzenGeprueft: false, lizenzenStatus: null };
  try {
    mkdirSync(werte.ausgabe, { recursive: true });
    const temp = join(werte.ausgabe, 'tmp');
    mkdirSync(temp);
    const env = { ...Object.fromEntries(Object.entries(umgebung).filter(([k]) =>
      !/^(?:temp|tmp|tmpdir|npm_config_(?:cache|logs_dir|offline|ignore_scripts|update_notifier))$/i.test(k))), TEMP: temp, TMP: temp, TMPDIR: temp,
      npm_config_cache: join(werte.ausgabe, 'npm-cache'), npm_config_logs_dir: join(werte.ausgabe, 'npm-logs'),
      npm_config_offline: 'true', npm_config_ignore_scripts: 'true', npm_config_update_notifier: 'false' };
    const lauf = (name, programm, args) => {
      let r;
      try { r = spawn(programm, args, { cwd: wurzel, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true }); }
      catch (error) { r = { error, status: null }; }
      const zustand = { status: r.status ?? null, signal: r.signal ?? null, fehlercode: r.error?.code ?? null };
      bericht.werkzeuge[name] = zustand;
      writeFileSync(join(werte.ausgabe, `${name}.stdout.txt`), r.stdout ?? '');
      writeFileSync(join(werte.ausgabe, `${name}.stderr.txt`), (r.stderr ?? '')
        + (r.error ? `\nStart-/Prozessfehler ${r.error.code ?? 'ohne Code'}: ${r.error.message}\n` : ''));
      if (name === 'lizenzen') {
        bericht.lizenzenStatus = zustand.status;
        bericht.lizenzenGeprueft = !r.error && !r.signal && (r.status === 0
          || r.status === 1 && /(?:^|\n)ERGEBNIS: Nacharbeit nötig\s*$/.test(r.stdout ?? ''));
        if (bericht.lizenzenGeprueft && r.status === 1) {
          meldungen.push(fehler('NPM_LIZENZEN', 'Lizenzprüfung meldet Nacharbeit (Rückgabewert 1); Einzelbefunde in lizenzen.stdout.txt.'));
          return r.stdout;
        }
      }
      if (r.error || r.signal || r.status !== 0) {
        const ursache = [`Rückgabewert ${zustand.status ?? 'fehlt'}`, `Signal ${zustand.signal ?? 'keines'}`,
          `Fehlercode ${zustand.fehlercode ?? 'keiner'}`].join(', ');
        throw Object.assign(new Error(`${name}: Werkzeuglauf fehlgeschlagen (${ursache}); Protokoll im Ausgabeordner.`),
          { pruefcode: `NPM_${name.toUpperCase().replaceAll('-', '_')}` });
      }
      return r.stdout ?? '';
    };
    bericht.stand = lauf('stand', 'git', ['rev-parse', 'HEAD']).trim();
    bericht.standHinweis = 'HEAD des Checkouts; geprüft werden die Dateien der Arbeitskopie unter packages/.';
    const aenderungen = lauf('git-status', 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'packages'])
      .split('\0').filter(Boolean);
    bericht.arbeitskopie = { sauber: aenderungen.length === 0, aenderungen };
    if (!bericht.arbeitskopie.sauber) throw Object.assign(new Error('Ungesicherte Änderungen unter packages/; HEAD beschreibt den Paketstand nicht vollständig.'), { pruefcode: 'NPM_GIT' });
    bericht.node = process.version;
    const npm = findeNpm(env);
    bericht.npm = lauf('npm-version', process.execPath, [npm, '--offline', '--version']).trim();
    if (!/^\d+\.\d+\.\d+$/.test(bericht.npm)) throw Object.assign(new Error('npm liefert keine gültige Version im Format x.y.z.'), { pruefcode: 'NPM_NPM_VERSION' });
    const verfolgt = lauf('git-dateien', 'git', ['ls-files', '-z', '--', 'packages/oberflaeche/src'])
      .split('\0').filter(Boolean).map((p) => p.slice('packages/oberflaeche/'.length));
    if (!verfolgt.length) throw Object.assign(new Error('Keine verfolgten Oberflächendateien gefunden.'), { pruefcode: 'NPM_GIT' });
    const vergleich = join(werte.ausgabe, 'kern-dist');
    lauf('tsc', process.execPath, [join(wurzel, 'node_modules/typescript/bin/tsc'), '-p', 'packages/kern/tsconfig.build.json',
      '--outDir', vergleich, '--declarationDir', vergleich, '--noEmit', 'false', '--incremental', 'false', '--composite', 'false']);
    meldungen.push(...pruefeDist(wurzel, vergleich));
    const packtext = lauf('pack', process.execPath, [npm, ...PACK_ARGUMENTE]);
    const packdatei = join(werte.ausgabe, 'packliste.json');
    writeFileSync(packdatei, packtext);
    let packliste;
    try { packliste = JSON.parse(packtext); }
    catch { throw Object.assign(new Error('npm liefert keine gültige JSON-Packliste.'), { pruefcode: 'NPM_LISTE' }); }
    meldungen.push(...pruefePaketvertrag({ wurzel, packliste, kernDateien: dateibaum(vergleich).map((p) => `dist/${p}`),
      oberflaecheDateien: verfolgt, ohneCr: werte.ohneCr }));
    if (Array.isArray(packliste)) bericht.pakete = packliste.map((p) => ({ name: p.name, version: p.version,
      dateien: p.files?.length, size: p.size, unpackedSize: p.unpackedSize, shasum: p.shasum, bundled: p.bundled }));
    // Auch nach Vertragsfehlern die vorhandene Lizenzprüfung auswerten. Die
    // unveränderte kombinierte Packliste ist deren Eingabe.
    lauf('lizenzen', process.execPath, [join(wurzel, 'scripts/check-licenses.mjs'), '--packliste', packdatei]);
    bericht.ok = meldungen.length === 0;
    code = bericht.ok ? 0 : 1;
  } catch (e) {
    meldungen.push(fehler(e.pruefcode ?? 'NPM_WERKZEUG', e.pruefcode ? e.message
      : `Prüfung konnte nicht abgeschlossen werden (${e.code ?? e.name ?? 'unbekannte Ursache'}); Eingaben und lokale Werkzeuge prüfen.`));
  }
  for (const p of bericht.pakete) ausgabe(`${p.name}: ${p.dateien} Dateien, ${p.size} Bytes gepackt, ${p.unpackedSize} Bytes entpackt, shasum ${p.shasum}, bundled=${JSON.stringify(p.bundled)}.`);
  for (const f of meldungen) ausgabe(`Fehler [${f.code}]: ${f.meldung}`);
  try { writeFileSync(join(werte.ausgabe, 'ergebnis.json'), `${JSON.stringify(bericht, null, 2)}\n`); }
  catch { code = 1; ausgabe('Fehler [NPM_AUSGABE]: Ergebnisdatei konnte nicht geschrieben werden.'); }
  ausgabe(`ERGEBNIS: ${code === 0 ? 'bestanden' : 'Nacharbeit nötig'}`);
  return code;
}

if (import.meta.main) process.exitCode = starte(process.argv.slice(2));
