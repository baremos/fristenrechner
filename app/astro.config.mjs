// Statischer Build der App-Seite. Das Build-Ziel folgt android.minWebViewVersion
// aus capacitor.config.json, damit beide Werte eine Quelle haben.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const capacitor = JSON.parse(readFileSync(new URL('./capacitor.config.json', import.meta.url), 'utf8'));
const version = capacitor?.android?.minWebViewVersion;
if (!Number.isInteger(version) || version < 83) {
  throw new Error('android.minWebViewVersion fehlt oder liegt unter 83. Darunter ist der Build nicht geprüft.');
}
const ziel = `chrome${version}`;

// Nur Metadaten lesen; weder Chunk-Inhalte noch die Ausgabe nach dist ändern.
export function modulprotokoll(wurzel = fileURLToPath(new URL('../', import.meta.url))) {
  const basis = resolve(wurzel).replaceAll('\\', '/');
  function kennung(id) {
    let wert = id.replaceAll('\\', '/').replaceAll(basis + '/', '');
    if (wert.startsWith('\0')) wert = 'virtuell:' + wert.slice(1);
    if (isAbsolute(wert) || /(?:^|[\s:=?(])[A-Za-z]:\//.test(wert)
        || wert.includes(basis) || /(?:^|[\s:=?(])\/(?:[^/])/.test(wert)) {
      throw new Error('Modulprotokoll: Kennung außerhalb der Repositorywurzel.');
    }
    return wert;
  }
  return {
    name: 'hinweise-dritter:modulprotokoll',
    generateBundle(_optionen, bundle) {
      if (this.environment?.name !== 'client') return;
      const chunks = Object.values(bundle).filter(c => c.type === 'chunk').map(c => ({
        datei: c.fileName,
        einstieg: c.isEntry,
        dynamischerEinstieg: c.isDynamicEntry,
        imports: [...c.imports].sort(),
        dynamischeImports: [...c.dynamicImports].sort(),
        module: Object.entries(c.modules).map(([id, d]) => ({
          id: kennung(id), renderedLength: d.renderedLength,
          originalLength: d.originalLength,
        })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      })).sort((a, b) => a.datei < b.datei ? -1 : a.datei > b.datei ? 1 : 0);
      const ordner = join(wurzel, 'app', '.astro');
      mkdirSync(ordner, { recursive: true });
      writeFileSync(join(ordner, 'module-client.json'),
        JSON.stringify({ formatVersion: 1, umgebung: 'client', chunks }, null, 2) + '\n', 'utf8');
    },
  };
}

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  vite: {
    // D6: jsPDF 4.2.1 lädt diese Module nur für html() und addSvgAsImage().
    // node_modules/jspdf/dist/jspdf.es.js:13485 (html2canvas), :13497 (dompurify),
    // :21294 (canvg); die App nutzt diese Funktionen nicht. Der Browser-Eintrag
    // dist/jspdf.es.min.js enthält dieselben Importe. K2 prüft den Ausschluss.
    resolve: {
      alias: [{
        find: /^(html2canvas|dompurify|canvg)$/,
        replacement: fileURLToPath(new URL('./src/build/jspdf-zusatzmodule-leer.js', import.meta.url)),
      }],
    },
    // CSS: Vite minifiziert mit der obersten Konfiguration (vite/dist/node/chunks/node.js:29495, :30149).
    build: { cssTarget: ziel, sourcemap: false },
    plugins: [{
      // JS: Astro 7.3.3 setzt für die Client-Umgebung das Ziel "esnext" fest
      // (astro/dist/core/build/vite-build-config.js:132); configEnvironment läuft danach.
      name: 'fristenrechner:webview-ziel',
      configEnvironment(name) {
        if (name === 'client') return { build: { target: ziel } };
      },
    }, modulprotokoll()],
  },
});
