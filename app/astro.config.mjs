// Statischer Build der App-Seite. Das Build-Ziel folgt android.minWebViewVersion
// aus capacitor.config.json, damit beide Werte eine Quelle haben.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

const capacitor = JSON.parse(readFileSync(new URL('./capacitor.config.json', import.meta.url), 'utf8'));
const version = capacitor?.android?.minWebViewVersion;
if (!Number.isInteger(version) || version < 83) {
  throw new Error('android.minWebViewVersion fehlt oder liegt unter 83. Darunter ist der Build nicht geprüft.');
}
const ziel = `chrome${version}`;

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  vite: {
    // CSS: Vite minifiziert mit der obersten Konfiguration (vite/dist/node/chunks/node.js:29495, :30149).
    build: { cssTarget: ziel, sourcemap: false },
    plugins: [{
      // JS: Astro 7.3.3 setzt für die Client-Umgebung das Ziel "esnext" fest
      // (astro/dist/core/build/vite-build-config.js:132); configEnvironment läuft danach.
      name: 'fristenrechner:webview-ziel',
      configEnvironment(name) {
        if (name === 'client') return { build: { target: ziel } };
      },
    }],
  },
});
