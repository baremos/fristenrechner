// Aufruf: node --test scripts/npm-pakete.test.mjs
// Sämtliche Probedateien liegen unter scratchpad; keine Installation, kein Netz.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KERN_README_PFLICHT, argumente, pruefeAusgabe, pruefeDist, pruefePaketvertrag, relativeImporte, starte } from './npm-pakete.mjs';

const scratchpad = resolve(dirname(fileURLToPath(import.meta.url)), '../scratchpad');

function schreiben(datei, inhalt) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, inhalt);
}

function probe(t) {
  mkdirSync(scratchpad, { recursive: true });
  const wurzel = mkdtempSync(join(scratchpad, 'npm-pakete-tests-'));
  schreiben(join(wurzel, '.git'), 'gitdir: .git-probe\n');
  t.after(() => {
    const ort = relative(scratchpad, resolve(wurzel));
    assert.ok(ort && !isAbsolute(ort) && !ort.startsWith('..'));
    rmSync(wurzel, { recursive: true, force: true });
  });
  const kern = {
    name: '@baremos/fristenrechner-kern', version: '0.0.0', private: true,
    type: 'module', license: 'Apache-2.0',
    exports: { '.': { types: './dist/api.d.ts', default: './dist/api.js' } },
  };
  const ui = {
    name: '@baremos/fristenrechner-ui', version: '0.0.0', private: true,
    type: 'module', license: 'Apache-2.0',
    exports: { '.': './src/Fristenrechner.astro', './ui': './src/ui.ts' },
    dependencies: { '@baremos/fristenrechner-kern': '0.0.0' },
  };
  const f = { wurzel, kern, ui, packliste: [], kernDateien: [
    'dist/api.js', 'dist/api.d.ts', 'dist/hilfe.js', 'dist/hilfe.d.ts',
  ], oberflaecheDateien: [
    'src/Fristenrechner.astro', 'src/ui.ts', 'src/hilfe.ts', 'src/stil.css',
  ] };
  for (const [ordner, manifest, dateien] of [
    ['kern', kern, {
      'README.md': '# Kern\n',
      'dist/api.js': "export { wert } from './hilfe.js';\n",
      'dist/api.d.ts': "export { wert } from './hilfe.js';\n",
      'dist/hilfe.js': 'export const wert = 1;\n',
      'dist/hilfe.d.ts': 'export declare const wert = 1;\n',
    }],
    ['oberflaeche', ui, {
      'README.md': '# Oberfläche\n',
      'src/Fristenrechner.astro': '---\nimport { wert } from "./hilfe";\n---\n<p>{wert}</p>\n',
      'src/ui.ts': "import { wert } from './hilfe';\nimport css from './stil.css?inline';\nexport { wert, css };\n",
      'src/hilfe.ts': 'export const wert = 1;\n',
      'src/stil.css': 'p { color: black; }\n',
    }],
  ]) {
    const inhalte = {
      'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
      LICENSE: 'Apache-2.0\n', NOTICE: 'Hinweis der Probe\n', ...dateien,
    };
    for (const [pfad, inhalt] of Object.entries(inhalte)) schreiben(join(wurzel, 'packages', ordner, pfad), inhalt);
    f.packliste.push({
      id: `${manifest.name}@${manifest.version}`, name: manifest.name, version: manifest.version,
      size: 100, unpackedSize: 0, shasum: '0'.repeat(40), integrity: `sha512-${'A'.repeat(86)}==`,
      filename: `${ordner}-0.0.0.tgz`,
      files: Object.keys(inhalte).map((path) => ({ path, size: 0, mode: 0o644 })),
      entryCount: Object.keys(inhalte).length, bundled: [],
    });
  }
  aktualisieren(f);
  return f;
}

function aktualisieren(f) {
  for (const [index, ordner] of ['kern', 'oberflaeche'].entries()) {
    const paket = f.packliste[index];
    const hash = createHash('sha1');
    for (const datei of paket.files) {
      const bytes = readFileSync(join(f.wurzel, 'packages', ordner, datei.path));
      datei.size = bytes.length;
      hash.update(bytes);
    }
    paket.entryCount = paket.files.length;
    paket.unpackedSize = paket.files.reduce((summe, datei) => summe + datei.size, 0);
    paket.shasum = hash.digest('hex');
  }
}

function datei(f, ordner, pfad, inhalt, { listen = true, verfolgen = false } = {}) {
  schreiben(join(f.wurzel, 'packages', ordner, pfad), inhalt);
  const paket = f.packliste[ordner === 'kern' ? 0 : 1];
  if (listen && !paket.files.some((eintrag) => eintrag.path === pfad)) paket.files.push({ path: pfad, size: 0, mode: 0o644 });
  if (verfolgen && !f.oberflaecheDateien.includes(pfad)) f.oberflaecheDateien.push(pfad);
  aktualisieren(f);
}

function manifest(f, ordner, felder) {
  const inhalt = ordner === 'kern' ? f.kern : f.ui;
  Object.assign(inhalt, felder);
  datei(f, ordner, 'package.json', `${JSON.stringify(inhalt, null, 2)}\n`);
}

function ohneListeneintrag(f, index, pfad) {
  f.packliste[index].files = f.packliste[index].files.filter((eintrag) => eintrag.path !== pfad);
  aktualisieren(f);
}

function pruefen(f, optionen = {}) {
  return pruefePaketvertrag({ wurzel: f.wurzel, packliste: f.packliste, kernDateien: f.kernDateien,
    oberflaecheDateien: f.oberflaecheDateien, kernReadmePflicht: false, ...optionen });
}

function beanstandet(fehler, code, muster) {
  assert.ok(fehler.some((eintrag) => eintrag.code === code && (!muster || muster.test(eintrag.meldung))),
    `Erwartet ${code}${muster ? ` mit ${muster}` : ''}: ${JSON.stringify(fehler)}`);
}

test('Vollständige kombinierte Packliste erfüllt den Paketvertrag', (t) => {
  assert.deepEqual(pruefen(probe(t)), []);
});

test('Gegenprobe: Kern ohne dist scheitert an den Einstiegspunkten', (t) => {
  const f = probe(t);
  f.packliste[0].files = f.packliste[0].files.filter((eintrag) => !eintrag.path.startsWith('dist/'));
  aktualisieren(f);
  beanstandet(pruefen(f), 'NPM_EINSTIEG', /dist\/api/);
});

test('Gegenprobe: Oberfläche ohne Einstiegsdatei scheitert', (t) => {
  const f = probe(t);
  ohneListeneintrag(f, 1, 'src/Fristenrechner.astro');
  beanstandet(pruefen(f), 'NPM_EINSTIEG', /Fristenrechner\.astro/);
});

test('Gegenprobe: unerlaubte Datei im Kern wird abgewiesen', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'geheim.txt', 'Nicht Teil des Pakets.\n');
  beanstandet(pruefen(f), 'NPM_PFAD', /geheim\.txt/);
});

test('Gegenprobe: relativer Import auf ungelistete vorhandene Datei scheitert', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/nur-lokal.ts', 'export const lokal = true;\n', { listen: false });
  datei(f, 'oberflaeche', 'src/ui.ts', "import './nur-lokal';\n");
  beanstandet(pruefen(f), 'NPM_IMPORT', /nur-lokal/);
});

test('Bedingte exports, Arrays und null werden vollständig geprüft', (t) => {
  const f = probe(t);
  manifest(f, 'kern', { exports: {
    '.': { import: [{ types: './dist/api.d.ts', default: './dist/api.js' }, null], default: './dist/hilfe.js' },
    './gesperrt': null,
  } });
  assert.deepEqual(pruefen(f), []);
  manifest(f, 'kern', { exports: { '.': [{ default: './dist/api.js' }, { browser: './dist/fehlt.js' }] } });
  beanstandet(pruefen(f), 'NPM_EINSTIEG', /fehlt\.js/);
});

for (const feld of ['main', 'module', 'types']) {
  test(`Einstieg aus ${feld} muss unabhängig von exports in der Liste stehen`, (t) => {
    const f = probe(t);
    manifest(f, 'kern', { [feld]: feld === 'types' ? './dist/api.d.ts' : './dist/api.js' });
    assert.deepEqual(pruefen(f), []);
    manifest(f, 'kern', { [feld]: './dist/fehlt.js' });
    beanstandet(pruefen(f), 'NPM_EINSTIEG', /fehlt\.js/);
  });
}

test('Ein Paket allein ist keine kombinierte Packliste', (t) => {
  const f = probe(t);
  f.packliste.pop();
  beanstandet(pruefen(f), 'NPM_LISTE');
});

test('Doppeltes Paket ersetzt kein fehlendes Paket', (t) => {
  const f = probe(t);
  f.packliste[1] = structuredClone(f.packliste[0]);
  beanstandet(pruefen(f), 'NPM_LISTE');
});

test('Nicht von Git verfolgte src-Datei darf nicht im UI-Paket stehen', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/entwurf.ts', 'export const entwurf = true;\n');
  beanstandet(pruefen(f), 'NPM_PFAD', /entwurf\.ts/);
});

test('Jede von Git verfolgte src-Datei muss im UI-Paket stehen', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/zusatz.ts', 'export const zusatz = true;\n', { listen: false, verfolgen: true });
  beanstandet(pruefen(f), 'NPM_DATEI', /zusatz\.ts/);
});

for (const pfad of ['dist/api.js.map', 'dist/quelltext.ts', 'src/api.ts', 'dist/test/probe.js', 'dist/api.test.js',
  'dist/referenz/daten.js', 'scratchpad/probe.js', 'node_modules/fremd/index.js']) {
  test(`Kern lässt den Pfad ${pfad} nicht zu`, (t) => {
    const f = probe(t);
    datei(f, 'kern', pfad, 'export const wert = 1;\n');
    beanstandet(pruefen(f), 'NPM_PFAD', new RegExp(pfad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

for (const pfad of ['src/test/probe.ts', 'src/probe.test.ts', 'src/referenz/daten.json', 'src/scratchpad/probe.ts', 'src/node_modules/fremd.ts']) {
  test(`Git-Verfolgung erlaubt keine ausgeschlossene UI-Datei ${pfad}`, (t) => {
    const f = probe(t);
    datei(f, 'oberflaeche', pfad, '\n', { verfolgen: true });
    beanstandet(pruefen(f), 'NPM_PFAD');
  });
}

test('Fehlende Datei auf dem Datenträger wird trotz Listeneintrag beanstandet', (t) => {
  const f = probe(t);
  rmSync(join(f.wurzel, 'packages/oberflaeche/src/stil.css'));
  beanstandet(pruefen(f), 'NPM_DATEI', /stil\.css/);
});

test('Kern-JavaScript benötigt den exakten ESM-Importpfad', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/api.js', "export { wert } from './hilfe';\n");
  beanstandet(pruefen(f), 'NPM_IMPORT', /hilfe/);
});

test('Endungsloser UI-Verzeichnisimport wird auf index.ts aufgelöst', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/modul/index.ts', 'export const wert = 1;\n', { verfolgen: true });
  datei(f, 'oberflaeche', 'src/ui.ts', "import './modul';\n");
  assert.deepEqual(pruefen(f), []);
  ohneListeneintrag(f, 1, 'src/modul/index.ts');
  beanstandet(pruefen(f), 'NPM_IMPORT', /modul/);
});

test('Paketnamen als Import brauchen keine Datei im eigenen Tarball', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/ui.ts', "import { wert } from '@baremos/fristenrechner-kern';\nconst pdf = import('jspdf');\n");
  assert.deepEqual(pruefen(f), []);
});

test('Relativer Import darf nicht in ein benachbartes Paket ausweichen', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/ui.ts', "import '../../kern/dist/api.js';\n");
  beanstandet(pruefen(f), 'NPM_IMPORT');
});

test('Nichtstatischer Import kann nicht als geprüfter Import gelten', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'src/ui.ts', 'const name = "./hilfe";\nconst modul = import(name);\n');
  beanstandet(pruefen(f), 'NPM_IMPORT');
});

test('CRLF ist standardmäßig erlaubt und mit ohneCr ausgeschlossen', (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', 'README.md', '# Oberfläche\r\n');
  assert.deepEqual(pruefen(f), []);
  beanstandet(pruefen(f, { ohneCr: true }), 'NPM_CR', /README\.md/);
});

test('LF-Dateien bestehen auch die Prüfung ohneCr', (t) => {
  assert.deepEqual(pruefen(probe(t), { ohneCr: true }), []);
});

test('README-Pflicht für den Kern bleibt bis zur Freigabe ausgeschaltet', (t) => {
  assert.equal(KERN_README_PFLICHT, false);
  const f = probe(t);
  rmSync(join(f.wurzel, 'packages/kern/README.md'));
  ohneListeneintrag(f, 0, 'README.md');
  assert.deepEqual(pruefen(f), []);
  beanstandet(pruefen(f, { kernReadmePflicht: true }), 'NPM_README');
  datei(f, 'kern', 'README.md', '# Kern\n');
  assert.deepEqual(pruefen(f, { kernReadmePflicht: true }), []);
});

test('README der Oberfläche ist schon jetzt erforderlich', (t) => {
  const f = probe(t);
  ohneListeneintrag(f, 1, 'README.md');
  beanstandet(pruefen(f), 'NPM_DATEI', /README\.md/);
});

test('Importscanner findet statische Importe, Reexporte und dynamische Stringimporte', () => {
  const quelle = [
    "import './start.js';",
    "import { wert } from './wert.js';",
    "import type { Typ } from './typen';",
    "export { wert } from './weiter.js';",
    "export * from './alle.js';",
    "const spaeter = import('./spaeter.js');",
    "type Typ = import('./typmodul').Typ;",
  ].join('\n');
  assert.deepEqual(relativeImporte(quelle, 'probe.ts').sort(), [
    './start.js', './wert.js', './typen', './weiter.js', './alle.js', './spaeter.js', './typmodul',
  ].sort());
});

test('Importscanner ignoriert Kommentare und gewöhnliche Zeichenketten', () => {
  const quelle = [
    "// import './kommentar.js';",
    "/* export * from './block.js'; */",
    'const beispiel = "import(\'./text.js\')";',
    'const vorlage = `export * from "./vorlage.js"`;',
    "import './echt.js';",
  ].join('\n');
  assert.deepEqual(relativeImporte(quelle, 'probe.ts'), ['./echt.js']);
});

test('Importscanner lehnt einen variablen dynamischen Import ab', () => {
  assert.throws(() => relativeImporte('const modul = import(pfad);', 'probe.ts'));
});

test('Importe in Template-Ausdrücken bleiben auch mit Kommentar nicht ungeprüft', () => {
  assert.deepEqual(relativeImporte("const s = `${import /* Kommentar */ ('./fehlt.js')}`;", 'probe.ts'), ['./fehlt.js']);
  assert.deepEqual(relativeImporte("const s = `${require /* Kommentar */ ('./fehlt.js')}`;", 'probe.ts'), ['./fehlt.js']);
  assert.throws(() => relativeImporte('const s = import(`./${name}.js`);', 'probe.ts'));
});

test('CSS-Importe brauchen keinen Leerraum nach dem Schlüsselwort', () => {
  assert.deepEqual(relativeImporte('@import"fehlt.css";', 'stil.css'), ['./fehlt.css']);
  assert.deepEqual(relativeImporte('@import/* Kommentar */"fehlt.css";', 'stil.css'), ['./fehlt.css']);
});

test('Relative Astro-Skriptquellen ohne Punktpräfix werden geprüft', () => {
  assert.deepEqual(relativeImporte('<script src="hilfe.js"></script>', 'Komponente.astro'), ['./hilfe.js']);
  assert.throws(() => relativeImporte('<script src={pfad}></script>', 'Komponente.astro'));
});

for (const endung of ['tsx', 'jsx']) test(`Importe in verfolgten ${endung}-Dateien werden geprüft`, (t) => {
  const f = probe(t);
  datei(f, 'oberflaeche', `src/probe.${endung}`, "import './fehlt';\n", { verfolgen: true });
  beanstandet(pruefen(f), 'NPM_IMPORT');
});

test('Importscanner erkennt relative require-Aufrufe und ignoriert fremde Pakete', () => {
  assert.deepEqual(relativeImporte("const a = require('./hilfe.js'); const b = require('fremd');", 'probe.js'), ['./hilfe.js']);
});

test('CSS-Importe und relative URLs werden erkannt', () => {
  const quelle = '/* @import "./kommentar.css"; */\n@import "./basis.css";\np { background: url(./bild.svg); }\n';
  assert.deepEqual(relativeImporte(quelle, 'stil.css').sort(), ['./basis.css', './bild.svg']);
});

for (const quelle of ["@import 'fehlend.css';", '@import url(fehlend.css);', '@import url(./fehlend.css);',
  'p { background: url(./fehlend.css); }']) {
  test(`CSS-Ziel muss im Paket enthalten sein: ${quelle}`, (t) => {
    const f = probe(t);
    datei(f, 'oberflaeche', 'src/stil.css', `${quelle}\n`);
    beanstandet(pruefen(f), 'NPM_IMPORT', /fehlend\.css/);
    datei(f, 'oberflaeche', 'src/fehlend.css', 'p { color: blue; }\n', { verfolgen: true });
    assert.deepEqual(pruefen(f), []);
  });
}

test('Astro-Importe im Vorspann und Skript werden erkannt', () => {
  const quelle = '---\nimport { wert } from "./hilfe";\n---\n<p>Text</p>\n<script>import "./ui";</script>\n';
  assert.deepEqual(relativeImporte(quelle, 'Fristenrechner.astro').sort(), ['./hilfe', './ui']);
});

for (const [name, quelle] of [
  ['Leerzeichen am öffnenden Zaun', '--- \nimport "./fehlt";\n---\n<p>Text</p>'],
  ['Tabulator am öffnenden Zaun', '---\t\nimport "./fehlt";\n---\n<p>Text</p>'],
  ['Markup am schließenden Zaun', '---\nimport "./fehlt";\n---<p>Text</p>'],
  ['Zaunzeile im Blockkommentar', '---\n/*\n---\n*/\nimport "./fehlt";\n---\n<p>Text</p>'],
  ['BOM und führendem Leerraum', '\uFEFF \n\t---\nimport "./fehlt";\n---\n<p>Text</p>'],
  ['ausschließlich Triple-Slash im Vorspann', '---\n/// <reference path="./fehlt" />\n---\n<p>Text</p>'],
]) {
  test(`Astro-Vorspann mit ${name} wird im Paket geprüft`, (t) => {
    assert.deepEqual(relativeImporte(quelle, 'Fristenrechner.astro'), ['./fehlt']);
    const f = probe(t);
    datei(f, 'oberflaeche', 'src/Fristenrechner.astro', quelle);
    beanstandet(pruefen(f), 'NPM_IMPORT', /fehlt/);
  });
}

test('Astro-Skript mit ausschließlich Triple-Slash wird geprüft', () => {
  assert.deepEqual(relativeImporte('<script>\n/// <reference path="./fehlt" />\n</script>', 'Probe.astro'), ['./fehlt']);
});

test('Regex-Literale nach einer Klammer verbergen keine echten Importe', () => {
  const quelle = 'if (true) /"/.test("a");\nimport "./fehlt.js";\nif (true) /"/.test("b");';
  assert.deepEqual(relativeImporte(quelle, 'probe.ts'), ['./fehlt.js']);
});

for (const [name, quelle] of [
  ['Triple-Slash path', '/// <reference path="./fehlt.js" />\n'],
  ['Triple-Slash types', '/// <reference types="./fehlt.js" />\n'],
  ['relative Moduldeklaration', 'declare module "./fehlt.js" {}'],
  ['JSDoc-Import', '/** @type {import("./fehlt.js").Typ} */\nlet x;'],
  ['URL mit import.meta.url', 'const datei = new URL("./fehlt.js", import.meta.url);'],
]) test(`Importscanner erkennt ${name}`, () => {
  assert.deepEqual(relativeImporte(quelle, 'probe.ts'), ['./fehlt.js']);
});

for (const [name, quelle, dateiname] of [
  ['berechnete URL', 'const datei = new URL(pfad, import.meta.url);', 'probe.ts'],
  ['import.meta.glob', 'const dateien = import.meta.glob("./*.ts");', 'probe.ts'],
  ['CSS image-set', 'p { background-image: image-set("./bild.png" 1x); }', 'stil.css'],
]) test(`Nicht unterstützter Verweis ${name} scheitert geschlossen`, () => {
  assert.throws(() => relativeImporte(quelle, dateiname));
});

for (const pfad of ['src/Teil.astro', 'src/Teil/index.astro']) {
  test(`Endungsloser Import darf ${pfad} nicht auflösen`, (t) => {
    const f = probe(t);
    datei(f, 'oberflaeche', pfad, '<p>Teil</p>\n', { verfolgen: true });
    datei(f, 'oberflaeche', 'src/ui.ts', "import Teil from './Teil';\n");
    beanstandet(pruefen(f), 'NPM_IMPORT', /Teil/);
    datei(f, 'oberflaeche', 'src/ui.ts', `import Teil from './${pfad.slice(4)}';\n`);
    assert.deepEqual(pruefen(f), []);
  });
}

test('Kern-Packliste ohne Deklaration scheitert bei vollständigem dist', (t) => {
  const f = probe(t);
  ohneListeneintrag(f, 0, 'dist/hilfe.d.ts');
  assert.ok(existsSync(join(f.wurzel, 'packages/kern/dist/hilfe.d.ts')));
  beanstandet(pruefen(f), 'NPM_DATEI', /hilfe\.d\.ts/);
  beanstandet(pruefen(f), 'NPM_IMPORT', /hilfe\.js|hilfe\.d\.ts/);
});

test('Nicht importierte Kern-Ausgabe muss ebenfalls im Paket stehen', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/weiter.js', 'export const weiter = true;\n', { listen: false });
  datei(f, 'kern', 'dist/weiter.d.ts', 'export declare const weiter = true;\n', { listen: false });
  f.kernDateien.push('dist/weiter.js', 'dist/weiter.d.ts');
  beanstandet(pruefen(f), 'NPM_DATEI', /weiter/);
});

test('Zusätzliche Kern-Ausgabe außerhalb des Vergleichsbuilds wird abgewiesen', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/alt.js', 'export const alt = true;\n');
  datei(f, 'kern', 'dist/alt.d.ts', 'export declare const alt = true;\n');
  beanstandet(pruefen(f), 'NPM_DATEI', /alt/);
});

test('Jede Kern-JavaScript-Datei verlangt auch bei gleicher Sollmenge ihre Deklaration', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/weiter.js', 'export const weiter = true;\n');
  f.kernDateien.push('dist/weiter.js');
  beanstandet(pruefen(f), 'NPM_DATEI', /Deklarationsdatei.*weiter\.js/);
});

test('Deklarationsimporte verlangen das Typziel auch ohne JavaScript-Import darauf', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/api.d.ts', "export { Typ } from './fehlt.js';\n");
  beanstandet(pruefen(f), 'NPM_IMPORT', /fehlt/);
});

for (const kernDateien of [undefined, [], ['api.js']]) {
  test(`Kern-Sollmenge muss gültig und vorhanden sein: ${JSON.stringify(kernDateien)}`, (t) => {
    assert.notDeepEqual(pruefen(probe(t), { kernDateien }), []);
  });
}

for (const [name, exports] of [
  ['fehlt', undefined], ['ist leer', {}], ['hat keinen Haupteinstieg', { './hilfe': './dist/hilfe.js' }],
  ['hat kein Punktpräfix', { '.': 'dist/api.js' }],
  ['mischt Unterpfade und Bedingungen', { '.': './dist/api.js', default: './dist/api.js' }],
  ['enthält einen ungültigen Unterpfad', { '.': './dist/api.js', '.falsch': './dist/hilfe.js' }],
]) test(`Kern-exports ${name} scheitert`, (t) => {
  const f = probe(t);
  manifest(f, 'kern', { exports });
  beanstandet(pruefen(f), 'NPM_EINSTIEG');
});

test('Unterpfad-Export wird unabhängig vom Haupteinstieg geprüft', (t) => {
  const f = probe(t);
  manifest(f, 'kern', { exports: { ...f.kern.exports, './weiter': './dist/weiter.js' } });
  beanstandet(pruefen(f), 'NPM_EINSTIEG', /weiter/);
});

test('UI-Unterpfad ohne Punktpräfix wird trotz vorhandener Zieldatei abgewiesen', (t) => {
  const f = probe(t);
  manifest(f, 'oberflaeche', { exports: { ...f.ui.exports, './anders': 'src/ui.ts' } });
  beanstandet(pruefen(f), 'NPM_EINSTIEG');
});

test('typings muss auf eine Datei der Packliste zeigen', (t) => {
  const f = probe(t);
  manifest(f, 'kern', { typings: './dist/api.d.ts' });
  assert.deepEqual(pruefen(f), []);
  manifest(f, 'kern', { typings: './dist/fehlt.d.ts' });
  beanstandet(pruefen(f), 'NPM_EINSTIEG', /fehlt/);
});

for (const feld of ['browser', 'typesVersions']) test(`Nicht unterstütztes Einstiegsfeld ${feld} scheitert geschlossen`, (t) => {
  const f = probe(t);
  manifest(f, 'kern', { [feld]: feld === 'browser' ? './dist/api.js' : { '*': { '*': ['dist/api.d.ts'] } } });
  beanstandet(pruefen(f), 'NPM_EINSTIEG', new RegExp(feld));
});

for (const bundled of [undefined, ['fremd']]) test(`npm-bundled muss eine leere Liste sein: ${JSON.stringify(bundled)}`, (t) => {
  const f = probe(t);
  f.packliste[1].bundled = bundled;
  beanstandet(pruefen(f), 'NPM_LISTE', /bundled/);
});

for (const feld of ['bundleDependencies', 'bundledDependencies']) {
  for (const wert of [['fremd'], true, false]) test(`${feld}=${JSON.stringify(wert)} wird trotz leerem npm-bundled abgewiesen`, (t) => {
    const f = probe(t);
    manifest(f, 'oberflaeche', { [feld]: wert });
    beanstandet(pruefen(f), 'NPM_LISTE', new RegExp(feld));
  });
  test(`Leeres ${feld} bleibt erlaubt`, (t) => {
    const f = probe(t);
    manifest(f, 'oberflaeche', { [feld]: [] });
    assert.deepEqual(pruefen(f), []);
  });
}

test('Kern und Oberfläche brauchen dieselbe Version', (t) => {
  const f = probe(t);
  manifest(f, 'kern', { version: '0.0.1' });
  f.packliste[0].version = '0.0.1';
  beanstandet(pruefen(f), 'NPM_VERSION');
});

for (const version of [undefined, '^0.0.0', '0.0.1']) test(`Kern-Abhängigkeit der Oberfläche muss exakt passen: ${version}`, (t) => {
  const f = probe(t);
  manifest(f, 'oberflaeche', { dependencies: { '@baremos/fristenrechner-kern': version } });
  beanstandet(pruefen(f), 'NPM_VERSION');
});

test('Größe der Packliste muss den gelesenen Bytes entsprechen', (t) => {
  const f = probe(t);
  f.packliste[0].files.find((p) => p.path === 'dist/api.js').size += 1;
  beanstandet(pruefen(f), 'NPM_DATEI', /Größe.*api\.js/);
});

test('Unterordner in Kern-dist bleiben ausgeschlossen', (t) => {
  const f = probe(t);
  datei(f, 'kern', 'dist/unter/x.js', 'export const x = 1;\n');
  beanstandet(pruefen(f), 'NPM_PFAD', /unter/);
});

test('Version der Packliste muss dem Manifest entsprechen', (t) => {
  const f = probe(t);
  f.packliste[0].version = '9.0.0';
  beanstandet(pruefen(f), 'NPM_LISTE', /Version/);
});

for (const pfad of ['LICENSE', 'NOTICE', 'package.json']) test(`Pflichtdatei ${pfad} muss in der Packliste stehen`, (t) => {
  const f = probe(t);
  ohneListeneintrag(f, 0, pfad);
  beanstandet(pruefen(f), 'NPM_DATEI', new RegExp(pfad));
});

test('Vorhandene Kern-README muss auch ohne README-Pflicht in der Packliste stehen', (t) => {
  const f = probe(t);
  ohneListeneintrag(f, 0, 'README.md');
  beanstandet(pruefen(f), 'NPM_README');
});

test('Doppelte Dateipfade und leere Dateilisten werden abgewiesen', (t) => {
  const f = probe(t);
  f.packliste[0].files.push({ ...f.packliste[0].files[0] });
  beanstandet(pruefen(f), 'NPM_LISTE', /doppelte/);
  f.packliste[0].files = [];
  beanstandet(pruefen(f), 'NPM_LISTE', /Dateiliste/);
});

function distProbe(t) {
  const f = probe(t);
  f.vergleich = join(f.wurzel, 'vergleich');
  cpSync(join(f.wurzel, 'packages/kern/dist'), f.vergleich, { recursive: true });
  return f;
}

test('Bytegleicher Kern-dist mit gleicher Dateimenge besteht', (t) => {
  const f = distProbe(t);
  assert.deepEqual(pruefeDist(f.wurzel, f.vergleich), []);
});

test('Leerer Vergleichsbuild kann nicht bestehen', (t) => {
  const f = probe(t);
  const leer = join(f.wurzel, 'vergleich-leer');
  mkdirSync(leer);
  beanstandet(pruefeDist(f.wurzel, leer), 'NPM_DIST', /leer/);
});

test('Kern-dist mit veraltetem Byteinhalt scheitert', (t) => {
  const f = distProbe(t);
  schreiben(join(f.wurzel, 'packages/kern/dist/hilfe.js'), 'export const wert = 2;\n');
  beanstandet(pruefeDist(f.wurzel, f.vergleich), 'NPM_DIST', /hilfe\.js/);
});

test('Kern-dist mit fehlender Ausgabe scheitert', (t) => {
  const f = distProbe(t);
  rmSync(join(f.wurzel, 'packages/kern/dist/hilfe.js'));
  beanstandet(pruefeDist(f.wurzel, f.vergleich), 'NPM_DIST', /hilfe\.js/);
});

test('Kern-dist mit zusätzlicher alter Ausgabe scheitert', (t) => {
  const f = distProbe(t);
  schreiben(join(f.wurzel, 'packages/kern/dist/alt.js'), 'export const alt = true;\n');
  beanstandet(pruefeDist(f.wurzel, f.vergleich), 'NPM_DIST', /alt\.js/);
});

test('Gänzlich fehlender Kern-dist scheitert am Vergleich', (t) => {
  const f = distProbe(t);
  const ziel = resolve(f.wurzel, 'packages/kern/dist');
  assert.equal(relative(f.wurzel, ziel).split('\\').join('/'), 'packages/kern/dist');
  rmSync(ziel, { recursive: true, force: true });
  beanstandet(pruefeDist(f.wurzel, f.vergleich), 'NPM_DIST');
});

for (const argv of [[], ['--ohne-cr'], ['--ausgabe'], ['--unbekannt'], ['--ausgabe', 'ziel', '--ausgabe', 'anders'],
  ['--ausgabe', 'ziel', '--ohne-cr', '--ohne-cr']]) {
  test(`Ungültiger Aufruf wird abgewiesen: ${JSON.stringify(argv)}`, () => {
    assert.throws(() => argumente(argv));
  });
}

test('Ausgabe ist Pflicht; ohneCr wird ausdrücklich eingeschaltet', () => {
  const ziel = join(scratchpad, 'npm-pakete-tests-nur-argument');
  assert.deepEqual(argumente(['--ausgabe', ziel]), { ausgabe: ziel, ohneCr: false });
  assert.deepEqual(argumente(['--ohne-cr', '--ausgabe', ziel]), { ausgabe: ziel, ohneCr: true });
});

test('Ausgabe im Repository ist ausschließlich in einem scratchpad-Unterordner zulässig', (t) => {
  const f = probe(t);
  for (const ziel of [f.wurzel, join(f.wurzel, 'scratchpad'), join(f.wurzel, 'packages/kern/ausgabe'), join(f.wurzel, 'docs/ausgabe')]) {
    assert.throws(() => pruefeAusgabe(f.wurzel, ziel));
  }
  assert.doesNotThrow(() => pruefeAusgabe(f.wurzel, join(f.wurzel, 'scratchpad/lauf')));
});

for (const form of ['Datei', 'Ordner']) {
  test(`Auch ein fremder Git-Checkout mit .git als ${form} erlaubt Ausgaben nur unter scratchpad`, (t) => {
    const f = probe(t);
    const fremd = probe(t);
    const git = join(fremd.wurzel, '.git');
    if (form === 'Datei') schreiben(git, 'gitdir: .git-verweis\n');
    else { rmSync(git); mkdirSync(git); }
    assert.throws(() => pruefeAusgabe(f.wurzel, join(fremd.wurzel, 'docs/lauf')));
    assert.doesNotThrow(() => pruefeAusgabe(f.wurzel, join(fremd.wurzel, 'scratchpad/lauf')));
    assert.equal(existsSync(join(fremd.wurzel, 'docs')), false);
  });
}

test('Vorhandene Ausgabedateien dürfen nicht überschrieben werden', (t) => {
  const f = probe(t);
  const ziel = join(f.wurzel, 'scratchpad/lauf');
  schreiben(join(ziel, 'beleg.txt'), 'Erhalten.\n');
  assert.throws(() => pruefeAusgabe(f.wurzel, ziel));
  assert.equal(readFileSync(join(ziel, 'beleg.txt'), 'utf8'), 'Erhalten.\n');
});

function laufProbe(t, { lizenzStatus = 0, packText, gitStatus = '', gitDateien,
  npmVersion = '11.0.0\n', nachBuild, werkzeugFehler } = {}) {
  const f = probe(t);
  const ziel = join(f.wurzel, 'scratchpad/lauf');
  const npm = join(f.wurzel, 'werkzeuge/npm/bin/npm-cli.js');
  schreiben(npm, '// Wird vom simulierten Werkzeuglauf nicht ausgeführt.\n');
  schreiben(join(f.wurzel, 'werkzeuge/npm/package.json'), JSON.stringify({ name: 'npm', version: '11.0.0' }));
  const aufrufe = [];
  const meldungen = [];
  const spawn = (programm, args, optionen) => {
    aufrufe.push({ programm, args, optionen });
    const simuliert = werkzeugFehler?.({ programm, args, optionen, npm });
    if (simuliert) return simuliert;
    let stdout = '';
    let status = 0;
    if (programm === 'git' && args[0] === 'rev-parse') stdout = `${'1'.repeat(40)}\n`;
    else if (programm === 'git' && args[0] === 'status') stdout = gitStatus;
    else if (programm === 'git' && args[0] === 'ls-files') stdout = gitDateien ?? f.oberflaecheDateien.map((p) => `packages/oberflaeche/${p}\0`).join('');
    else if (args[0] === npm && args.includes('--version')) stdout = npmVersion;
    else if (args[0] === npm && args.includes('pack')) stdout = packText ?? JSON.stringify(f.packliste);
    else if (args[0] === join(f.wurzel, 'node_modules/typescript/bin/tsc')) {
      const vergleich = args[args.indexOf('--outDir') + 1];
      cpSync(join(f.wurzel, 'packages/kern/dist'), vergleich, { recursive: true });
      nachBuild?.(vergleich);
    } else if (args[0] === join(f.wurzel, 'scripts/check-licenses.mjs')) {
      status = lizenzStatus;
      stdout = `ERGEBNIS: ${lizenzStatus === 0 ? 'bestanden' : 'Nacharbeit nötig'}\n`;
    }
    else assert.fail(`Unerwarteter Werkzeuglauf: ${programm} ${args.join(' ')}`);
    return { status, stdout, stderr: '' };
  };
  const optionen = { wurzel: f.wurzel, umgebung: { npm_execpath: npm }, spawn, ausgabe: (m) => meldungen.push(m) };
  return { ...f, ziel, npm, aufrufe, meldungen, optionen };
}

test('Ablauf prüft beide Workspaces in einem Offline-Packlauf und anschließend die Lizenzen', (t) => {
  const f = laufProbe(t);
  const vorher = f.packliste.flatMap((p, index) => p.files.map(({ path }) => {
    const ort = join(f.wurzel, 'packages', index === 0 ? 'kern' : 'oberflaeche', path);
    return [ort, readFileSync(ort)];
  }));
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 0, f.meldungen.join('\n'));
  const pack = f.aufrufe.filter((a) => a.args[0] === f.npm && a.args.includes('pack'));
  assert.equal(pack.length, 1);
  assert.deepEqual(pack[0].args.slice(1), ['pack', '--dry-run', '--json', '--offline', '--ignore-scripts',
    '--workspace', 'packages/kern', '--workspace', 'packages/oberflaeche']);
  const lizenz = f.aufrufe.findIndex((a) => a.args[0] === join(f.wurzel, 'scripts/check-licenses.mjs'));
  assert.ok(lizenz > f.aufrufe.indexOf(pack[0]));
  assert.deepEqual(f.aufrufe[lizenz].args.slice(1), ['--packliste', join(f.ziel, 'packliste.json')]);
  assert.deepEqual(JSON.parse(readFileSync(join(f.ziel, 'packliste.json'), 'utf8')), f.packliste);
  for (const { optionen } of f.aufrufe) {
    assert.equal(optionen.env.npm_config_offline, 'true');
    assert.equal(optionen.env.npm_config_ignore_scripts, 'true');
    for (const name of ['TEMP', 'TMP', 'TMPDIR', 'npm_config_cache', 'npm_config_logs_dir']) {
      const ort = relative(f.ziel, optionen.env[name]);
      assert.ok(ort && !ort.startsWith('..') && !isAbsolute(ort));
    }
  }
  for (const [ort, bytes] of vorher) assert.deepEqual(readFileSync(ort), bytes);
  const bericht = JSON.parse(readFileSync(join(f.ziel, 'ergebnis.json'), 'utf8'));
  assert.equal(bericht.ok, true);
  assert.equal(bericht.lizenzenGeprueft, true);
  assert.equal(bericht.lizenzenStatus, 0);
  assert.deepEqual(bericht.arbeitskopie, { sauber: true, aenderungen: [] });
});

test('Geerbte Schreiborte verschiedener Großschreibung werden eindeutig ersetzt', (t) => {
  const f = laufProbe(t);
  const bisher = join(f.wurzel, 'alter-ausgabeort');
  Object.assign(f.optionen.umgebung, {
    NPM_CONFIG_CACHE: bisher, npm_config_cache: bisher,
    NPM_CONFIG_LOGS_DIR: bisher, npm_config_logs_dir: bisher,
    TEMP: bisher, temp: bisher, Tmp: bisher, TMP: bisher, tmpdir: bisher,
    NPM_CONFIG_OFFLINE: 'false', NPM_CONFIG_IGNORE_SCRIPTS: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'true', PROBE_ERHALTEN: 'ja',
  });
  const vorher = { ...f.optionen.umgebung };
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 0, f.meldungen.join('\n'));
  const erwartet = {
    TEMP: join(f.ziel, 'tmp'), TMP: join(f.ziel, 'tmp'), TMPDIR: join(f.ziel, 'tmp'),
    npm_config_cache: join(f.ziel, 'npm-cache'), npm_config_logs_dir: join(f.ziel, 'npm-logs'),
    npm_config_offline: 'true', npm_config_ignore_scripts: 'true', npm_config_update_notifier: 'false',
  };
  for (const { optionen: { env } } of f.aufrufe) {
    for (const [name, wert] of Object.entries(erwartet)) {
      const schluessel = Object.keys(env).filter((k) => k.toLowerCase() === name.toLowerCase());
      assert.deepEqual(schluessel, [name], `Mehrdeutige Umgebung für ${name}`);
      assert.equal(env[name], wert);
    }
    assert.equal(env.PROBE_ERHALTEN, 'ja');
  }
  assert.deepEqual(f.optionen.umgebung, vorher);
  assert.equal(existsSync(bisher), false);
});

test('Fehlschlag der Lizenzprüfung wird als Rückgabewert und Meldung weitergegeben', (t) => {
  const f = laufProbe(t, { lizenzStatus: 1 });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  assert.match(f.meldungen.join('\n'), /NPM_LIZENZEN/);
  const bericht = JSON.parse(readFileSync(join(f.ziel, 'ergebnis.json'), 'utf8'));
  assert.equal(bericht.ok, false);
  assert.equal(bericht.lizenzenGeprueft, true);
  assert.equal(bericht.lizenzenStatus, 1);
  assert.match(f.meldungen.join('\n'), /Lizenzprüfung.*Nacharbeit/);
});

test('Beschädigte npm-Ausgabe kann keinen erfolgreichen Prüflauf ergeben', (t) => {
  const f = laufProbe(t, { packText: 'keine JSON-Liste' });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  assert.match(f.meldungen.join('\n'), /NPM_LISTE/);
});

test('Aufruffehler beendet vor Werkzeugstart und erzeugt keine Ausgabe', (t) => {
  const f = laufProbe(t);
  assert.equal(starte(['--ohne-cr'], f.optionen), 64);
  assert.equal(f.aufrufe.length, 0);
  assert.equal(existsSync(f.ziel), false);
  assert.match(f.meldungen.join('\n'), /NPM_AUFRUF/);
});

function berichtLesen(f) {
  return JSON.parse(readFileSync(join(f.ziel, 'ergebnis.json'), 'utf8'));
}

for (const [name, manipulieren, code] of [
  ['unerlaubte Datei', (f) => datei(f, 'kern', 'geheim.txt', 'Probe\n'), 'NPM_PFAD'],
  ['fehlende Kerndeklaration', (f) => ohneListeneintrag(f, 0, 'dist/hilfe.d.ts'), 'NPM_DATEI'],
  ['fehlende UI-Einstiegsdatei', (f) => ohneListeneintrag(f, 1, 'src/Fristenrechner.astro'), 'NPM_EINSTIEG'],
  ['fehlendes relatives Importziel', (f) => datei(f, 'oberflaeche', 'src/ui.ts', "import './fehlt';\n"), 'NPM_IMPORT'],
]) test(`Ablauf gibt bei Vertragsfehler ${name} 1 zurück und prüft trotzdem Lizenzen`, (t) => {
  const f = laufProbe(t);
  manipulieren(f);
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  const bericht = berichtLesen(f);
  assert.equal(bericht.ok, false);
  assert.equal(bericht.lizenzenGeprueft, true);
  assert.equal(bericht.lizenzenStatus, 0);
  beanstandet(bericht.fehler, code);
});

test('Ablauf gibt bei abweichendem Vergleichsbuild 1 zurück', (t) => {
  const f = laufProbe(t, { nachBuild: (vergleich) => schreiben(join(vergleich, 'hilfe.js'), 'export const wert = 2;\n') });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  const bericht = berichtLesen(f);
  assert.equal(bericht.ok, false);
  assert.equal(bericht.lizenzenGeprueft, true);
  beanstandet(bericht.fehler, 'NPM_DIST');
});

test('Ablauf reicht ohne-cr an den Paketvertrag weiter', (t) => {
  for (const streng of [false, true]) {
    const f = laufProbe(t);
    datei(f, 'oberflaeche', 'README.md', '# Oberfläche\r\n');
    assert.equal(starte(['--ausgabe', f.ziel, ...(streng ? ['--ohne-cr'] : [])], f.optionen), streng ? 1 : 0);
    const bericht = berichtLesen(f);
    assert.equal(bericht.ok, !streng);
    assert.equal(bericht.lizenzenGeprueft, true);
    if (streng) beanstandet(bericht.fehler, 'NPM_CR');
  }
});

for (const status of [' M packages/kern/src/api.ts\0', 'A  packages/oberflaeche/src/neu.ts\0',
  '?? packages/oberflaeche/src/entwurf.ts\0']) {
  test(`Ungesicherte Paketdateien verhindern eine irreführende HEAD-Angabe: ${status.slice(0, 2)}`, (t) => {
    const f = laufProbe(t, { gitStatus: status });
    assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
    const bericht = berichtLesen(f);
    assert.equal(bericht.stand, '1'.repeat(40));
    assert.equal(bericht.arbeitskopie.sauber, false);
    assert.ok(bericht.arbeitskopie.aenderungen.length > 0);
    assert.match(JSON.stringify(bericht.arbeitskopie.aenderungen), /packages\//);
    beanstandet(bericht.fehler, 'NPM_GIT');
    assert.equal(bericht.lizenzenGeprueft, false);
    assert.equal(f.aufrufe.some((a) => a.args.includes('pack')), false);
    const statusAufruf = f.aufrufe.find((a) => a.programm === 'git' && a.args[0] === 'status');
    assert.deepEqual(statusAufruf.args, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'packages']);
  });
}

test('Leere Liste verfolgter UI-Dateien verhindert einen Prüflauf', (t) => {
  const f = laufProbe(t, { gitDateien: '' });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  beanstandet(berichtLesen(f).fehler, 'NPM_GIT');
});

for (const [name, ergebnis, muster] of [
  ['Startfehler ENOENT', { status: null, error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) }, /ENOENT/],
  ['Signal SIGTERM', { status: null, signal: 'SIGTERM' }, /SIGTERM/],
  ['Rückgabewert 3', { status: 3 }, /3/],
  ['Pufferfehler ENOBUFS', { status: null, error: Object.assign(new Error('Ausgabe zu groß'), { code: 'ENOBUFS' }) }, /ENOBUFS/],
]) test(`Werkzeugursache ${name} bleibt in Meldung und Bericht erhalten`, (t) => {
  const f = laufProbe(t, { werkzeugFehler: ({ programm, args }) => programm === 'git' && args[0] === 'rev-parse'
    ? { stdout: '', stderr: '', ...ergebnis } : null });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  assert.match(f.meldungen.join('\n'), muster);
  const bericht = berichtLesen(f);
  beanstandet(bericht.fehler, 'NPM_STAND', muster);
  assert.deepEqual(bericht.werkzeuge.stand, { status: ergebnis.status, signal: ergebnis.signal ?? null,
    fehlercode: ergebnis.error?.code ?? null });
  assert.equal(bericht.lizenzenGeprueft, false);
  assert.equal(bericht.lizenzenStatus, null);
  if (ergebnis.error) assert.match(readFileSync(join(f.ziel, 'stand.stderr.txt'), 'utf8'), new RegExp(ergebnis.error.message));
});

test('Startfehler der Lizenzprüfung gilt nicht als geprüfte Lizenzlage', (t) => {
  const f = laufProbe(t, { werkzeugFehler: ({ args }) => args[0]?.endsWith('check-licenses.mjs')
    ? { status: null, stdout: '', stderr: '', error: Object.assign(new Error('Start EACCES'), { code: 'EACCES' }) } : null });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  const bericht = berichtLesen(f);
  assert.equal(bericht.lizenzenGeprueft, false);
  assert.equal(bericht.lizenzenStatus, null);
  beanstandet(bericht.fehler, 'NPM_LIZENZEN', /EACCES/);
});

test('Fehlendes Lizenzskript mit Node-Status 1 wird nicht als reguläre Nacharbeit gewertet', (t) => {
  const f = laufProbe(t, { werkzeugFehler: ({ args }) => args[0]?.endsWith('check-licenses.mjs')
    ? { status: 1, stdout: '', stderr: 'Cannot find module\n' } : null });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  const bericht = berichtLesen(f);
  assert.equal(bericht.lizenzenGeprueft, false);
  assert.equal(bericht.lizenzenStatus, 1);
  beanstandet(bericht.fehler, 'NPM_LIZENZEN');
});

test('Werkzeugcodes verwenden Unterstriche auch bei mehrteiligen Schrittnamen', (t) => {
  const f = laufProbe(t, { werkzeugFehler: ({ args, npm }) => args[0] === npm && args.includes('--version')
    ? { status: 2, stdout: '', stderr: '' } : null });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  beanstandet(berichtLesen(f).fehler, 'NPM_NPM_VERSION');
});

for (const version of ['kein npm\n', '11.0\n']) test(`Ungültige npm-Versionsausgabe wird abgewiesen: ${version.trim()}`, (t) => {
  const f = laufProbe(t, { npmVersion: version });
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  beanstandet(berichtLesen(f).fehler, 'NPM_NPM_VERSION');
  assert.equal(f.aufrufe.some((a) => a.args.includes('pack')), false);
});

for (const [name, manipulieren] of [
  ['fremdes Manifest', (f) => schreiben(join(f.wurzel, 'werkzeuge/npm/package.json'), '{"name":"anderes-cli","version":"11.0.0"}')],
  ['fehlendes Manifest', (f) => rmSync(join(f.wurzel, 'werkzeuge/npm/package.json'))],
  ['fehlende Kommandozeile', (f) => rmSync(f.npm)],
]) test(`npm_execpath mit ${name} wird vor Ausführung abgewiesen`, (t) => {
  const f = laufProbe(t);
  manipulieren(f);
  assert.equal(starte(['--ausgabe', f.ziel], f.optionen), 1);
  const bericht = berichtLesen(f);
  assert.ok(bericht.fehler.some((fehler) => /npm/i.test(fehler.meldung)));
  assert.equal(f.aufrufe.some((a) => a.args[0] === f.npm), false);
});

test('Direkter Skriptaufruf ohne Argumente gibt 64 zurück', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./npm-pakete.mjs', import.meta.url))],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 64, r.stderr);
  assert.match(r.stdout, /NPM_AUFRUF/);
});

test('Skriptaufruf über Junction oder Symlink führt die Aufrufprüfung aus', (t) => {
  const f = probe(t);
  const echt = join(f.wurzel, 'echt');
  mkdirSync(echt);
  cpSync(fileURLToPath(new URL('./npm-pakete.mjs', import.meta.url)), join(echt, 'npm-pakete.mjs'));
  const link = join(f.wurzel, 'verweis');
  symlinkSync(echt, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const r = spawnSync(process.execPath, [join(link, 'npm-pakete.mjs')], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 64, r.stderr);
    assert.match(r.stdout, /NPM_AUFRUF/);
    assert.match(r.stdout, /ERGEBNIS: Nacharbeit nötig/);
  } finally { unlinkSync(link); }
});

test('Bekannte Probewurzel schützt den Ausgabeort auch ohne eigenen Git-Marker', (t) => {
  const f = probe(t);
  rmSync(join(f.wurzel, '.git'));
  assert.throws(() => pruefeAusgabe(f.wurzel, join(f.wurzel, 'docs/lauf')));
  assert.equal(existsSync(join(f.wurzel, 'docs')), false);
});

test('Windows-Namensraum- und UNC-Ausgabeformen werden abgewiesen', { skip: process.platform !== 'win32' }, (t) => {
  const f = probe(t);
  for (const ziel of ['\\\\?\\C:\\ausgabe', '\\\\localhost\\C$\\ausgabe']) {
    assert.throws(() => pruefeAusgabe(f.wurzel, ziel));
  }
});
