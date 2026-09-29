import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Eine fehlende Referenzdatei lässt den Test scheitern. Neu geschrieben
    // werden die Dateien nur mit `npm run referenz:schreiben`.
    update: 'none',
    fileParallelism: false,
  },
});
