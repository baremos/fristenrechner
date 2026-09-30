// Führt die Python-Gegenproben zu Inventaren, APK und Web-Nachweisen offline aus.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const python = ['python3', 'python'].find((name) => spawnSync(name, [
  '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)',
]).status === 0);

test('F-Droid-App: Python-Gegenproben für Inventare, APK und Referenz', {
  skip: python ? false : 'Python 3.11 fehlt',
}, () => {
  const lauf = spawnSync(python, [join(hier, 'fdroid/app-auswerten.test.py'), '-v'], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(lauf.status, 0, lauf.stdout + lauf.stderr);
  assert.match(lauf.stderr, /Ran 53 tests/);
});
