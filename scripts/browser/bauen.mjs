// Baut nur aus dem Repository und dem vorhandenen Abhängigkeitsbaum.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prozess } from '../emulator/rahmen.mjs';
import { HTML_HASH } from './auswertung.mjs';

export async function bauen(wurzel, ausgabe) {
  process.env.ASTRO_TELEMETRY_DISABLED = '1';
  const laden = createRequire(join(wurzel, 'package.json'));
  const astroLaden = createRequire(laden.resolve('astro/package.json'));
  let esbuild, compiler;
  try {
    esbuild = await import(pathToFileURL(astroLaden.resolve('esbuild')).href);
    compiler = await import(pathToFileURL(astroLaden.resolve('@astrojs/compiler-rs')).href);
  } catch (e) { throw new Error(`Astro-Bauwerkzeuge fehlen im vorhandenen Baum: ${e.message}`); }
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', BROWSER_AUSGABE: ausgabe };
  const befehle = [];
  const befehl = async (name, args) => {
    const ergebnis = await prozess(process.execPath, args, { cwd: wurzel, env, timeoutMs: 180000 });
    writeFileSync(join(ausgabe, `${name}.log`), ergebnis.out + ergebnis.err);
    befehle.push({ name, code: ergebnis.code });
    if (ergebnis.code !== 0) throw new Error(`${name} fehlgeschlagen; siehe ${name}.log.`);
  };
  await befehl('kern-build', [laden.resolve('typescript/bin/tsc'), '-p', 'packages/kern/tsconfig.build.json']);

  // Derselbe Containerweg wie im HTML-Referenztest. Der Astro-Build darunter
  // prüft zusätzlich Styles und echte Modulskripte der Gastgeberseite.
  const ui = join(wurzel, 'packages/oberflaeche/src');
  const laufzeit = await import(pathToFileURL(astroLaden.resolve('astro/compiler-runtime')).href);
  const { experimental_AstroContainer: AstroContainer } = await import(pathToFileURL(astroLaden.resolve('astro/container')).href);
  const ts = laden('typescript');
  const moduleLaden = async name => {
    const r = await esbuild.build({ entryPoints: [join(ui, `${name}.ts`)], bundle: true, write: false,
      platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
    const modul = { exports: {} };
    new Function('require', 'module', 'exports', r.outputFiles[0].text)(laden, modul, modul.exports);
    return modul.exports;
  };
  const daten = await moduleLaden('fristenrechner-export-data');
  const plattform = await moduleLaden('plattform');
  const vorgaben = await moduleLaden('web-vorgaben');
  const kompiliert = compiler.transform(readFileSync(join(ui, 'Fristenrechner.astro'), 'utf8'), {
    filename: 'Fristenrechner.astro', internalURL: 'astro/compiler-runtime', resolvePath: pfad => pfad, compact: true,
  });
  if (kompiliert.diagnostics.some(d => d.severity === 'error')) throw new Error('Astro-Container: Kompilierung fehlgeschlagen.');
  const code = ts.transpileModule(kompiliert.code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modul = { exports: {} };
  const komponentenImport = name => {
    if (name === 'astro/compiler-runtime') return laufzeit;
    if (name === './fristenrechner-export-data') return daten;
    if (name === './plattform') return plattform;
    if (name === 'Fristenrechner.astro?astro&type=style&index=0&lang.css') return {};
    throw new Error(`Unerwarteter Komponentenimport: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(komponentenImport, modul, modul.exports);
  const container = await AstroContainer.create();
  const html = await container.renderToString(modul.exports.default, { props: { texte: vorgaben.webTexte, exportInhalt: vorgaben.webExportInhalt } });
  writeFileSync(join(ausgabe, 'vorgabe.html'), html);
  const hash = createHash('sha256').update(html).digest('hex');
  if (hash !== HTML_HASH) throw Object.assign(new Error(`Vorgabe-HTML abweichend: ${hash}; erwartet ${HTML_HASH}.`), { rueckgabewert: 1 });

  const publicDir = join(ausgabe, 'public');
  mkdirSync(publicDir, { recursive: true });
  const buendel = await esbuild.build({
    entryPoints: [join(wurzel, 'packages/oberflaeche/test/bedienung.browser.ts')],
    outfile: join(publicDir, 'vertrag.iife.js'), bundle: true, format: 'iife', globalName: 'browserVertrag',
    platform: 'browser', target: 'es2020', metafile: true, logLevel: 'silent',
    plugins: [{ name: 'lokale-css-als-text', setup(build) {
      build.onResolve({ filter: /\.css\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -7)), namespace: 'css-text' }));
      build.onLoad({ filter: /.*/, namespace: 'css-text' }, a => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text', resolveDir: dirname(a.path) }));
    } }],
  });
  writeFileSync(join(ausgabe, 'vertrag-buendel.json'), JSON.stringify(buendel.metafile, null, 2) + '\n');
  await befehl('astro-build', [join(wurzel, 'scripts/astro.mjs'), 'build', '--root', 'scripts/browser/probeseite']);
  const ergebnis = { htmlHash: hash, befehle, warnungen: buendel.warnings.map(w => w.text), dist: join(ausgabe, 'probeseite') };
  writeFileSync(join(ausgabe, 'bau.json'), JSON.stringify(ergebnis, null, 2) + '\n');
  return ergebnis;
}
