// Aufruf: node --test scripts/astro.test.mjs
// Prüft scripts/astro.mjs. Der zweite Teil lädt die installierte Telemetrie von
// Astro in einem eigenen Prozess, mit Profilordnern im temporären Ordner und
// einem abgefangenen fetch. Es geht nichts ins Netz, das Profil bleibt unberührt.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASTRO, starte, umgebungFuerAstro } from './astro.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..');
const arbeit = mkdtempSync(join(tmpdir(), 'astro-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

test('umgebungFuerAstro setzt ASTRO_TELEMETRY_DISABLED und übernimmt den Rest', () => {
  const umgebung = umgebungFuerAstro({ PATH: 'x', ASTRO_TELEMETRY_DISABLED: '', ANDERES: 'bleibt' });
  assert.equal(umgebung.ASTRO_TELEMETRY_DISABLED, '1');
  assert.equal(umgebung.PATH, 'x');
  assert.equal(umgebung.ANDERES, 'bleibt');
});

test('ASTRO zeigt auf die Kommandozeile von Astro in der Wurzel', () => {
  assert.equal(ASTRO, join(wurzel, 'node_modules', 'astro', 'bin', 'astro.mjs'));
});

test('starte reicht Argumente, Umgebung und Rückgabewert durch', () => {
  const bericht = join(arbeit, 'bericht.json');
  const falsch = join(arbeit, 'falsches-astro.mjs');
  writeFileSync(falsch, [
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(bericht)}, JSON.stringify({ argumente: process.argv.slice(2), aus: process.env.ASTRO_TELEMETRY_DISABLED ?? null }));`,
    'process.exit(7);',
  ].join('\n'));
  const code = starte(['check', '--root', 'packages/oberflaeche'], { astro: falsch, umgebung: { ...process.env, ASTRO_TELEMETRY_DISABLED: '' }, stdio: 'ignore' });
  assert.equal(code, 7);
  assert.deepEqual(JSON.parse(readFileSync(bericht, 'utf8')), { argumente: ['check', '--root', 'packages/oberflaeche'], aus: '1' });
});

test('starte meldet 1, wenn Astro fehlt', () => {
  assert.equal(starte(['check'], { astro: join(arbeit, 'gibt-es-nicht.mjs'), stdio: 'ignore' }), 1);
});

// Lädt die Telemetrie von Astro und lässt sie ein Ereignis aufzeichnen.
const telemetrie = join(wurzel, 'node_modules', '@astrojs', 'telemetry', 'dist', 'index.js');
const probe = [
  "import { pathToFileURL } from 'node:url';",
  'const { AstroTelemetry } = await import(pathToFileURL(process.argv[2]).href);',
  'let aufrufe = 0;',
  "globalThis.fetch = async () => { aufrufe += 1; throw new Error('Im Test geht nichts ins Netz.'); };",
  "const t = new AstroTelemetry({ astroVersion: '0.0.0', viteVersion: '0.0.0' });",
  "await t.record([{ eventName: 'PROBE', payload: {} }]);",
  'console.log(JSON.stringify({ aus: t.isDisabled, aufrufe }));',
].join('\n');

function telemetrieLauf(name, mitSkript) {
  const profil = mkdtempSync(join(arbeit, `${name}-`));
  const basis = { ...process.env, APPDATA: profil, XDG_CONFIG_HOME: profil, HOME: profil, USERPROFILE: profil };
  delete basis.ASTRO_TELEMETRY_DISABLED;
  delete basis.TELEMETRY_DISABLED;
  delete basis.DEBUG;
  const datei = join(profil, 'probe.mjs');
  writeFileSync(datei, probe);
  const lauf = spawnSync(process.execPath, [datei, telemetrie], {
    cwd: profil, encoding: 'utf8', env: mitSkript ? umgebungFuerAstro(basis) : basis,
  });
  assert.equal(lauf.status, 0, `${lauf.stdout}${lauf.stderr}`);
  return JSON.parse(lauf.stdout.trim().split('\n').at(-1));
}

const ohneInstallation = { skip: existsSync(telemetrie) ? false : 'braucht die installierten Pakete, zuerst npm ci' };

test('Telemetrie von Astro: mit der Umgebung des Skripts abgeschaltet, kein Aufruf von fetch', ohneInstallation, () => {
  assert.deepEqual(telemetrieLauf('mit', true), { aus: true, aufrufe: 0 });
});

test('Telemetrie von Astro, Gegenprobe: ohne die Variable eingeschaltet, fetch wird aufgerufen', ohneInstallation, () => {
  assert.deepEqual(telemetrieLauf('ohne', false), { aus: false, aufrufe: 1 });
});
