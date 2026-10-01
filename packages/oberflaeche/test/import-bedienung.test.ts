import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import * as laufzeit from 'astro/compiler-runtime';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { expect, it } from 'vitest';
import * as exportDaten from '../src/fristenrechner-export-data';
import { webExportInhalt, webTexte } from '../src/web-vorgaben';
import type { HinweisPosition, ImportBedienung } from '../src/plattform';

async function rendern(importBedienung?: ImportBedienung, importBeschriftung = webTexte.importBeschriftung, hinweisPosition?: HinweisPosition) {
  const quelle = readFileSync(new URL('../src/Fristenrechner.astro', import.meta.url), 'utf8');
  const kompiliert = transform(quelle, {
    filename: 'Fristenrechner.astro',
    internalURL: 'astro/compiler-runtime',
    resolvePath: pfad => pfad,
    compact: true,
  });
  expect(kompiliert.diagnostics.filter(meldung => meldung.severity === 'error')).toEqual([]);
  const code = transpileModule(kompiliert.code, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
  }).outputText;
  const modul = { exports: {} as { default: Parameters<AstroContainer['renderToString']>[0] } };
  // Nur die CSS-Datei wird hier ausgelassen; ihr Build bleibt Teil der App-Prüfung.
  const laden = (pfad: string): unknown => {
    if (pfad === 'astro/compiler-runtime') return laufzeit;
    if (pfad === './fristenrechner-export-data') return exportDaten;
    if (pfad === 'Fristenrechner.astro?astro&type=style&index=0&lang.css') return {};
    throw new Error(`Unerwarteter Komponentenimport: ${pfad}`);
  };
  new Function('require', 'module', 'exports', code)(laden, modul, modul.exports);
  const container = await AstroContainer.create();
  return container.renderToString(modul.exports.default, {
    props: { texte: { ...webTexte, importBeschriftung }, exportInhalt: webExportInhalt, importBedienung, hinweisPosition },
  });
}

it('behält das vorgerenderte HTML mit den Web-Vorgaben vollständig bei', async () => {
  const html = await rendern();
  // Referenz aus der unveränderten Komponente von main (427995a), mit demselben Renderer.
  expect(createHash('sha256').update(html).digest('hex')).toBe('e6465ae87407c4e1e53036ecae4f9f2ac7e1f90b90fb5362483436fab41e8898');
});

it('erhält bei ausgelassener und ausdrücklicher Dateifeld-Vorgabe dasselbe HTML', async () => {
  const vorgabe = await rendern();
  expect(await rendern('dateifeld')).toBe(vorgabe);
  expect(vorgabe.match(/data-project-import/g)).toHaveLength(1);
  expect(vorgabe).toMatch(/<input type="file" id="open-json" accept="application\/json,\.json" data-project-import/);
  expect(vorgabe).not.toMatch(/<button[^>]*data-project-import/);
});

it('stellt den Hinweiskasten bei ausgelassener und ausdrücklicher Vorgabe gleich über das Formular', async () => {
  const vorgabe = await rendern();
  expect(await rendern(undefined, undefined, 'oben')).toBe(vorgabe);
  expect(vorgabe.match(/class="privacy-note/g)).toHaveLength(1);
  expect(vorgabe.match(/id="storage-status"/g)).toHaveLength(1);
  expect(vorgabe.indexOf('class="privacy-note"')).toBeLessThan(vorgabe.indexOf('id="schedule-form"'));
});

it('stellt den Hinweiskasten für die App unter den rechtlichen Hinweis, mit demselben Speicherstatus', async () => {
  const html = await rendern('schaltflaeche', 'Projektdatei öffnen', 'unten');
  expect(html.match(/class="privacy-note/g)).toHaveLength(1);
  expect(html.match(/id="storage-status"/g)).toHaveLength(1);
  const kasten = html.indexOf('class="privacy-note privacy-note-unten"');
  expect(kasten).toBeGreaterThan(html.indexOf('id="legal-heading"'));
  expect(html.indexOf('id="storage-status"')).toBeGreaterThan(kasten);
  expect(html.slice(kasten)).toContain(webTexte.datenschutzTitel);
  expect(html.indexOf('id="project-file-meta"')).toBeLessThan(html.indexOf('id="schedule-form"'));
});

it('rendert für den App-Import genau eine aktive Schaltfläche und kein Dateifeld', async () => {
  const html = await rendern('schaltflaeche', 'Projektdatei öffnen');
  expect(html.match(/data-project-import/g)).toHaveLength(1);
  expect(html.match(/id="open-json"/g)).toHaveLength(1);
  expect(html).toContain('<button type="button" class="button button-secondary" id="open-json" data-project-import>Projektdatei öffnen</button>');
  expect(html).not.toContain('type="file"');
  expect(html).not.toContain('file-button');
});

it('verändert beim Wechsel der Import-Bedienung keine anderen Formularfelder oder Aktionen', async () => {
  const dateifeld = await rendern('dateifeld');
  const schaltflaeche = await rendern('schaltflaeche');
  const ersetzen = (html: string) => html
    .replace(/<label class="button button-secondary file-button">[\s\S]*?<\/label>/, 'IMPORT')
    .replace(/<button type="button" class="button button-secondary" id="open-json" data-project-import>[\s\S]*?<\/button>/, 'IMPORT');
  expect(ersetzen(schaltflaeche)).toBe(ersetzen(dateifeld));
});
