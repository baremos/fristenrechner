// Werkzeugprüfung des F-Droid-Rezepts: offline, nur mit Probe-Lockfiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { WERKZEUGE, lockVersion, main, pruefeWerkzeuge, zerlegeAngabe } from './fdroid/werkzeuge-pruefen.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const passendeAngaben = ['rolldown@v1.2.9', 'astro-compiler-rs@v0.4.1', 'satteri@satteri-v0.10.5', 'lightningcss@v1.33.0', 'esbuild@v0.28.2'];

function probeLock(abweichung = {}) {
  const versionen = { rolldown: '1.2.9', '@astrojs/compiler-binding': '0.4.1', satteri: '0.10.5', lightningcss: '1.33.0', esbuild: '0.28.2', ...abweichung };
  const packages = { '': { name: 'probe' } };
  for (const [paket, version] of Object.entries(versionen)) if (version) packages[`node_modules/${paket}`] = { version };
  return { lockfileVersion: 3, packages };
}

function lauf(argv, lock) {
  const aus = [];
  const fehler = [];
  const rc = main(argv, { wurzel: 'C:/probe', lesen: () => JSON.stringify(lock), ausgabe: (t) => aus.push(t), fehlerausgabe: (t) => fehler.push(t) });
  return { rc, aus, fehler };
}

test('passende srclibs bestehen', () => {
  const { rc, aus, fehler } = lauf(passendeAngaben, probeLock());
  assert.equal(rc, 0);
  assert.deepEqual(fehler, []);
  assert.match(aus[0], /bestanden: rolldown 1\.2\.9, @astrojs\/compiler-binding 0\.4\.1, satteri 0\.10\.5, lightningcss 1\.33\.0, esbuild 0\.28\.2/);
});

test('abweichende Version nennt den richtigen Tag', () => {
  const { rc, fehler } = lauf(passendeAngaben, probeLock({ esbuild: '0.28.3', satteri: '0.11.0' }));
  assert.equal(rc, 1);
  assert.ok(fehler.some((z) => z.includes('esbuild@v0.28.2') && z.includes('esbuild@v0.28.3 eintragen')));
  assert.ok(fehler.some((z) => z.includes('satteri@satteri-v0.10.5') && z.includes('satteri@satteri-v0.11.0 eintragen')));
});

test('fehlende srclib für ein Paket im Lockfile ist ein Befund', () => {
  const { rc, fehler } = lauf(passendeAngaben.filter((a) => !a.startsWith('lightningcss@')), probeLock());
  assert.equal(rc, 1);
  assert.ok(fehler.some((z) => z.includes('lightningcss@v1.33.0 ergänzen')));
});

test('srclib ohne Paket im Lockfile ist ein Befund', () => {
  const { rc, fehler } = lauf(passendeAngaben, probeLock({ esbuild: null }));
  assert.equal(rc, 1);
  assert.ok(fehler.some((z) => z.includes('enthält esbuild nicht')));
});

test('falscher Aufruf endet mit 64', () => {
  for (const argv of [[], ['rolldown'], ['rolldown@'], ['@v1.2.9'], ['unbekannt@v1'], ['rolldown@v1.2.9', 'rolldown@v1.2.9'], ['rolldown@v1@2']]) {
    const { rc, fehler } = lauf(argv, probeLock());
    assert.equal(rc, 64, `Aufruf ${JSON.stringify(argv)}`);
    assert.ok(fehler.some((z) => z.startsWith('Aufruf:')));
  }
});

test('unlesbares Lockfile endet mit 1', () => {
  const rc = main(passendeAngaben, { wurzel: 'C:/probe', lesen: () => '{kein json', ausgabe: () => {}, fehlerausgabe: () => {} });
  assert.equal(rc, 1);
});

test('Hilfsfunktionen', () => {
  assert.deepEqual(zerlegeAngabe('satteri@satteri-v0.10.5'), { name: 'satteri', tag: 'satteri-v0.10.5' });
  assert.equal(lockVersion(probeLock(), 'rolldown'), '1.2.9');
  assert.equal(lockVersion(probeLock(), 'fehlt'), null);
  assert.deepEqual(Object.keys(WERKZEUGE), ['rolldown', 'astro-compiler-rs', 'satteri', 'lightningcss', 'esbuild']);
});

test('das Lockfile des Repositorys passt zu den srclibs des Veröffentlichungsrezepts', () => {
  const rezept = readFileSync(join(wurzel, 'scripts/fdroid/veroeffentlichung/de.baremos.fristenrechner.yml'), 'utf8');
  const angaben = [...rezept.matchAll(/^\s+-\s+([a-z-]+@[\w.-]+)\s*$/gm)].map((m) => m[1]).filter((a) => Object.hasOwn(WERKZEUGE, a.split('@')[0]));
  const lock = JSON.parse(readFileSync(join(wurzel, 'package-lock.json'), 'utf8'));
  assert.ok(angaben.length >= 4, `srclibs im Rezept gefunden: ${angaben.join(', ')}`);
  const { befunde } = pruefeWerkzeuge(angaben.concat(angaben.some((a) => a.startsWith('esbuild@')) ? [] : [`esbuild@v${lockVersion(lock, 'esbuild')}`]), lock);
  assert.deepEqual(befunde, []);
});
