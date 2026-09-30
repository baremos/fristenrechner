// Führt die unabhängigen Python-Gegenproben ohne Netz und fremde Werkzeuge aus.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hier = dirname(fileURLToPath(import.meta.url));
const tmp = resolve(hier, '../scratchpad/paket-2.8-f5/tmp');
mkdirSync(tmp, { recursive: true });
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)']).status === 0);

test('Gezielte npm-Bereinigung: Python-Sicherheitsprüfungen und Gegenproben', { skip: !python && 'Python ab 3.11 fehlt' }, () => {
  const p = spawnSync(python, ['-B', resolve(hier, 'fdroid/test_bereinigung.py')], {
    encoding: 'utf8',
    env: { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stderr, /Ran 24 tests/);
  assert.match(p.stderr, /\bOK\b/);
});
