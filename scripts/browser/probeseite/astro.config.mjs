import { isAbsolute, join } from 'node:path';
import { defineConfig } from 'astro/config';

const ausgabe = process.env.BROWSER_AUSGABE;
if (!ausgabe || !isAbsolute(ausgabe)) {
  throw new Error('BROWSER_AUSGABE muss auf den absoluten Ausgabeordner des Browserlaufs zeigen.');
}

const ordner = name => join(ausgabe, name);

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  outDir: ordner('probeseite'),
  cacheDir: ordner('astro-cache'),
  // Der Läufer stellt hier das gebündelte Vertragsskript bereit.
  publicDir: ordner('public'),
});
