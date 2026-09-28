// Aufruf: node --test scripts/check-licenses.test.mjs
// Probedateien bleiben unter scratchpad; keine Installation, kein Netzwerk.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { menschenlesbar, pruefeAusdruck, pruefePackliste, pruefeProjekt, vorgabe } from './check-licenses.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const scratchpad = resolve(hier, '../scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'lizenzen-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

function schreiben(datei, inhalt) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, typeof inhalt === 'string' ? inhalt : `${JSON.stringify(inhalt, null, 2)}\n`);
}

function probe(aendern = () => {}) {
  const wurzel = mkdtempSync(join(arbeit, 'projekt-'));
  const root = { name: 'probe', version: '1.0.0', license: 'Apache-2.0', workspaces: ['packages/*', 'app'], devDependencies: { werkzeug: '1.0.0' } };
  const kern = { name: '@probe/kern', version: '1.0.0', license: 'Apache-2.0' };
  const app = { name: 'probe-app', version: '1.0.0', license: 'Apache-2.0' };
  const lock = { lockfileVersion: 3, packages: {
    '': root, 'packages/kern': kern, app,
    'node_modules/@probe/kern': { link: true, resolved: 'packages/kern' },
    'node_modules/probe-app': { link: true, resolved: 'app' },
    'node_modules/werkzeug': { version: '1.0.0', license: 'MIT', dev: true },
  } };
  const f = { wurzel, root, kern, app, lock, installiert: {} };
  aendern(f);
  schreiben(join(wurzel, 'package.json'), root);
  schreiben(join(wurzel, 'packages/kern/package.json'), kern);
  schreiben(join(wurzel, 'app/package.json'), app);
  schreiben(join(wurzel, 'package-lock.json'), lock);
  for (const [pfad, manifest] of Object.entries(f.installiert)) schreiben(join(wurzel, pfad, 'package.json'), manifest);
  schreiben(join(wurzel, 'LICENSE'), 'Lizenz der Probe\n');
  schreiben(join(wurzel, 'NOTICE'), 'Hinweis der Probe\n');
  for (const datei of ['LICENSE', 'NOTICE']) {
    schreiben(join(wurzel, 'packages/kern', datei), readFileSync(join(wurzel, datei), 'utf8'));
  }
  return f;
}

function fehlerEnthaelt(bericht, muster) {
  assert.equal(bericht.ok, false);
  assert.match(bericht.fehler.join('\n'), muster);
}

const ausdruckFaelle = [
  ['MIT', 'ausgeliefert', true, ['MIT']],
  [' mit ', 'ausgeliefert', true, ['MIT']],
  ['(MIT AND Apache-2.0)', 'ausgeliefert', true, ['MIT', 'Apache-2.0']],
  ['MPL-2.0', 'entwicklung', true, ['MPL-2.0']],
  ['MPL-2.0', 'ausgeliefert', false, []],
  ['MPL-2.0 OR MIT', 'ausgeliefert', true, ['MIT']],
  ['MIT AND MPL-2.0', 'ausgeliefert', false, []],
  ['MIT OR ISC AND MPL-2.0', 'ausgeliefert', true, ['MIT']],
  ['(MIT OR ISC) AND MPL-2.0', 'ausgeliefert', false, []],
  ['MPL-2.0 AND MIT OR ISC', 'ausgeliefert', true, ['ISC']],
  ['MIT AND (MPL-2.0 OR (ISC AND BSD-3-Clause))', 'ausgeliefert', true, ['MIT', 'ISC', 'BSD-3-Clause']],
  ['((MIT AND MIT) AND ISC)', 'ausgeliefert', true, ['MIT', 'ISC']],
];
for (const [ausdruck, bereich, zulaessig, auswahl] of ausdruckFaelle) {
  test(`SPDX: ${ausdruck} für ${bereich}`, () => {
    const ergebnis = pruefeAusdruck(ausdruck, bereich);
    assert.equal(ergebnis.zulaessig, zulaessig);
    assert.deepEqual(ergebnis.auswahl, auswahl);
  });
}

for (const ausdruck of [undefined, null, '', ' ', { type: 'MIT' }, ['MIT'], 'UNLICENSED', 'Unbekannt',
  'MIT OR Unbekannt', 'MIT OR (ISC AND Unbekannt)', 'SEE LICENSE IN LICENSE.txt', 'LicenseRef-Eigen',
  'MIT WITH LLVM-exception', 'MIT+', 'MIT OR', 'AND MIT', 'MIT and ISC', 'MIT || ISC', '(MIT', 'MIT)', '()', 'MIT ISC', 'MIT/ISC']) {
  test(`Fehlende, unbekannte und ungültige Lizenz abweisen: ${JSON.stringify(ausdruck)}`, () => {
    assert.throws(() => pruefeAusdruck(ausdruck, 'entwicklung'));
  });
}

test('Umordnung und gleichartige Klammern ergeben dieselbe Lizenzangabe', () => {
  const a = pruefeAusdruck('MIT OR (Apache-2.0 OR ISC)', 'entwicklung');
  const b = pruefeAusdruck('(ISC OR MIT) OR Apache-2.0', 'entwicklung');
  assert.equal(a.normalisiert, b.normalisiert);
  assert.notEqual(a.normalisiert, pruefeAusdruck('MIT AND Apache-2.0 AND ISC', 'entwicklung').normalisiert);
});

test('Alle Regeln sind zentral erfasst; Auslieferung ist eine echte Teilmenge', () => {
  assert.deepEqual(Object.keys(vorgabe.lizenzen).sort(), ['Apache-2.0', 'BSD-3-Clause', 'ISC', 'MIT', 'MPL-2.0']);
  assert.equal(Object.values(vorgabe.lizenzen).every((b) => b.includes('entwicklung')), true);
  assert.equal(pruefeAusdruck('MPL-2.0', 'ausgeliefert').zulaessig, false);
});

test('Ohne node_modules werden alle Lockfile-Pakete geprüft', () => {
  const f = probe();
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.pakete, 1);
  assert.equal(b.zusammenfassung.nurLockfile, 1);
  assert.equal(b.zusammenfassung.ausgeliefert, 0);
  assert.equal(b.packlisteGeprueft, false);
  assert.match(b.hinweise.join('\n'), /npm-Packlisten wurden nicht geprüft/);
});

test('Installierte Metadaten und Hinweisdateien werden gelesen, aber kein Skript ausgeführt', () => {
  const f = probe((f) => {
    f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: 'mit', scripts: { postinstall: 'exit 9' } };
  });
  schreiben(join(f.wurzel, 'node_modules/werkzeug/LICENSE.txt'), 'Lizenz');
  schreiben(join(f.wurzel, 'node_modules/werkzeug/THIRD-PARTY-LICENSE'), 'Weitere Anteile');
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.installiert, 1);
  assert.deepEqual(b.pakete[0].hinweisdateien, ['LICENSE.txt', 'THIRD-PARTY-LICENSE']);
  assert.deepEqual(b.pakete[0].installationsskripte, ['package.json: postinstall']);
});

for (const [feld, wert, muster] of [
  ['license', 'ISC', /Lizenzangaben.*weichen ab/],
  ['license', undefined, /Lizenzangabe fehlt/],
  ['license', 'Unbekannt', /Unbekannte/],
  ['version', '2.0.0', /Installierte Version weicht ab/],
  ['name', 'anderes', /Installierter Paketname weicht ab/],
]) {
  test(`Abweichendes installiertes Feld ablehnen: ${feld}=${wert}`, () => {
    const f = probe((f) => {
      f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: 'MIT', [feld]: wert };
    });
    fehlerEnthaelt(pruefeProjekt(f.wurzel), muster);
  });
}

test('Unvollständige oder unlesbare Installation ist kein nur-Lockfile-Erfolg', () => {
  const f = probe();
  mkdirSync(join(f.wurzel, 'node_modules/werkzeug'), { recursive: true });
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /Installation nicht vollständig prüfbar/);
  schreiben(join(f.wurzel, 'node_modules/werkzeug/package.json'), '{');
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /Installation nicht vollständig prüfbar/);
});

test('Fehlende Lockfile-Lizenz bleibt trotz gültiger Installation ein Fehler', () => {
  const f = probe((f) => {
    delete f.lock.packages['node_modules/werkzeug'].license;
    f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: 'MIT' };
  });
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /Lizenzangabe fehlt/);
});

test('Transitive Laufzeitabhängigkeit wird trotz dev-Markierung streng geprüft', () => {
  const f = probe((f) => {
    f.kern.dependencies = { werkzeug: '1.0.0' };
    f.lock.packages['node_modules/werkzeug'].dependencies = { transitiv: '1.0.0' };
    f.lock.packages['node_modules/transitiv'] = { version: '1.0.0', license: 'MPL-2.0', dev: true };
  });
  const b = pruefeProjekt(f.wurzel);
  fehlerEnthaelt(b, /Lizenz für ausgeliefert nicht zugelassen/);
  assert.equal(b.zusammenfassung.ausgeliefert, 2);
  assert.equal(b.pakete.find((p) => p.name === 'werkzeug').auchEntwicklung, true);
});

test('App, Wurzel, optionale Abhängigkeiten und installierte Peers gehören zur Auslieferung', () => {
  const f = probe((f) => {
    f.app.optionalDependencies = { optional: '1.0.0' };
    f.app.peerDependencies = { peer: '1.0.0', fehlt: '*' };
    f.app.peerDependenciesMeta = { peer: { optional: true }, fehlt: { optional: true } };
    f.root.dependencies = { rootlib: '1.0.0' };
    for (const name of ['optional', 'peer', 'rootlib']) f.lock.packages[`node_modules/${name}`] = { version: '1.0.0', license: 'MIT' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.ausgeliefert, 3);
});

test('Workspace-Verknüpfungen werden verfolgt, eigene Pakete nicht als Fremdpakete gezählt', () => {
  const f = probe((f) => {
    f.app.dependencies = { '@probe/kern': '1.0.0' };
    f.kern.dependencies = { laufzeit: '1.0.0' };
    f.lock.packages['node_modules/laufzeit'] = { version: '1.0.0', license: 'MIT' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.pakete, 2);
  assert.equal(b.zusammenfassung.ausgeliefert, 1);
});

test('Verschachtelte Versionen bleiben getrennt; Auflösung steigt für hoisted Pakete auf', () => {
  const f = probe((f) => {
    f.kern.dependencies = { gleichnamig: '1.0.0' };
    f.lock.packages['node_modules/gleichnamig'] = { version: '1.0.0', license: 'MIT', dependencies: { gemeinsam: '1.0.0' } };
    f.lock.packages['node_modules/werkzeug'].dependencies = { gleichnamig: '2.0.0', gemeinsam: '1.0.0' };
    f.lock.packages['node_modules/werkzeug/node_modules/gleichnamig'] = { version: '2.0.0', license: 'MPL-2.0' };
    f.lock.packages['node_modules/gemeinsam'] = { version: '1.0.0', license: 'ISC' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.pakete.find((p) => p.version === '2.0.0').bereich, 'entwicklung');
  assert.equal(b.pakete.find((p) => p.name === 'gemeinsam').auchEntwicklung, true);
});

test('Zyklen enden und npm-Aliasse werden anhand des echten Paketnamens gegengeprüft', () => {
  const f = probe((f) => {
    f.kern.dependencies = { alias: 'npm:echt@1.0.0' };
    f.lock.packages['node_modules/alias'] = { name: 'echt', version: '1.0.0', license: 'MIT', dependencies: { werkzeug: '1.0.0' } };
    f.lock.packages['node_modules/werkzeug'].dependencies = { alias: 'npm:echt@1.0.0' };
    f.installiert['node_modules/alias'] = { name: 'echt', version: '1.0.0', license: 'MIT' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.ausgeliefert, 2);
});

for (const feld of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
  test(`Fehlende Kante im Lockfile ablehnen: ${feld}`, () => {
    const f = probe((f) => { f.kern[feld] = { fehlt: '1.0.0' }; });
    fehlerEnthaelt(pruefeProjekt(f.wurzel), /fehlt im Lockfile/);
  });
}

test('Verwaistes Paket wird nicht still zum Build-Werkzeug erklärt', () => {
  const f = probe((f) => { f.lock.packages['node_modules/verwaist'] = { version: '1.0.0', license: 'MPL-2.0', dev: true }; });
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /Keinem Abhängigkeitspfad zugeordnet/);
});

test('Änderung eines Workspace-Manifests ohne Lockfile wird erkannt', () => {
  const f = probe();
  schreiben(join(f.wurzel, 'packages/kern/package.json'), { ...f.kern, dependencies: { werkzeug: '1.0.0' } });
  const b = pruefeProjekt(f.wurzel);
  fehlerEnthaelt(b, /dependencies weicht/);
  assert.equal(b.zusammenfassung.ausgeliefert, 1);
});

test('Neu angelegter Workspace ohne Lockfile-Eintrag wird erkannt', () => {
  const f = probe();
  schreiben(join(f.wurzel, 'packages/neu/package.json'), { name: 'neu', license: 'MIT', version: '1.0.0' });
  assert.throws(() => pruefeProjekt(f.wurzel), /Workspace oder Wurzel fehlt/);
});

for (const pfad of ['../fremd', '/absolut', 'C:/fremd', 'node_modules/../../fremd', 'node_modules\\fremd']) {
  test(`Paketpfad außerhalb des Projekts ablehnen: ${pfad}`, () => {
    const f = probe((f) => { f.lock.packages[pfad] = { version: '1.0.0', license: 'MIT' }; });
    assert.throws(() => pruefeProjekt(f.wurzel), /Ungültiger relativer Paketpfad/);
  });
}

test('Externe file-Links und unbekannte Lockfile-Formate werden abgelehnt', () => {
  const f = probe((f) => { f.lock.packages['node_modules/werkzeug'] = { link: true, resolved: 'extern' }; });
  assert.throws(() => pruefeProjekt(f.wurzel), /Link außerhalb/);
  f.lock.lockfileVersion = 1;
  schreiben(join(f.wurzel, 'package-lock.json'), f.lock);
  assert.throws(() => pruefeProjekt(f.wurzel), /Format 3/);
});

test('Plattformfremde Binärpakete und Installationsskripte erscheinen ohne Installation', () => {
  const f = probe((f) => {
    for (const name of ['@rolldown/binding-linux-x64-gnu', 'lightningcss-darwin-arm64', 'fsevents', 'es-module-lexer']) {
      f.lock.packages['node_modules/werkzeug'].optionalDependencies ??= {};
      f.lock.packages['node_modules/werkzeug'].optionalDependencies[name] = '1.0.0';
      f.lock.packages[`node_modules/${name}`] = { version: '1.0.0', license: 'MIT', hasInstallScript: name === 'fsevents' };
    }
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.vorgebaut, 4);
  assert.equal(b.zusammenfassung.installationsskripte, 1);
  assert.match(menschenlesbar(b), /fsevents@1.0.0[\s\S]*Installationsskript/);
});

test('Neue Binärdateien und binding.gyp werden gefunden; bloße JS-bin-Einträge nicht', () => {
  const f = probe((f) => { f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: 'MIT', bin: 'cli.js' }; });
  const ordner = join(f.wurzel, 'node_modules/werkzeug');
  schreiben(join(ordner, 'cli.js'), '// JavaScript');
  assert.equal(pruefeProjekt(f.wurzel).zusammenfassung.vorgebaut, 0);
  for (const p of ['dist/a.node', 'dist/b.wasm', 'dist/lib.so.1', 'binding.gyp']) schreiben(join(ordner, p), 'Probe');
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.zusammenfassung.vorgebaut, 1);
  assert.equal(b.zusammenfassung.installationsskripte, 1);
  assert.equal(b.pakete[0].vorgebaut.length, 3);
});

function packProbe() {
  const f = probe();
  const workspace = { pfad: 'packages/kern', name: f.kern.name, version: f.kern.version };
  const files = [{ path: 'package.json', size: 100 }];
  for (const datei of ['LICENSE', 'NOTICE']) {
    const inhalt = readFileSync(join(f.wurzel, datei), 'utf8');
    schreiben(join(f.wurzel, workspace.pfad, datei), inhalt);
    files.push({ path: datei, size: Buffer.byteLength(inhalt) });
  }
  return { ...f, workspaces: [workspace], liste: [{ name: f.kern.name, version: f.kern.version, files }] };
}

test('Packliste: LICENSE und NOTICE müssen tatsächlich enthalten sein', () => {
  const f = packProbe();
  assert.deepEqual(pruefePackliste(f.liste, f.workspaces, f.wurzel), []);
  f.liste[0].files = [{ path: 'package.json', size: 100 }];
  const fehler = pruefePackliste(f.liste, f.workspaces, f.wurzel);
  assert.match(fehler.join('\n'), /LICENSE fehlt in der Packliste/);
  assert.match(fehler.join('\n'), /NOTICE fehlt in der Packliste/);
});

test('Packliste: Abweichende Hinweisdateien und falsche Größen sind Fehler', () => {
  const f = packProbe();
  schreiben(join(f.wurzel, 'packages/kern/NOTICE'), 'Veraltet');
  const fehler = pruefePackliste(f.liste, f.workspaces, f.wurzel);
  assert.match(fehler.join('\n'), /stimmt nicht mit der Wurzeldatei/);
  assert.match(fehler.join('\n'), /Größe von NOTICE/);
});

for (const [fall, aendern, muster] of [
  ['leer', (f) => { f.liste = []; }, /nicht leere/],
  ['kein Array', (f) => { f.liste = {}; }, /JSON-Liste/],
  ['Version', (f) => { f.liste[0].version = '2.0.0'; }, /Version.*weicht/],
  ['fremdes Paket', (f) => { f.liste[0].name = 'fremd'; }, /Unbekanntes npm-Paket/],
  ['doppeltes Paket', (f) => { f.liste.push(f.liste[0]); }, /Doppeltes npm-Paket/],
  ['fehlendes Paket', (f) => { f.workspaces.push({ pfad: 'packages/ui', name: 'ui', version: '1.0.0' }); }, /npm-Packliste fehlt/],
  ['fehlende Dateien', (f) => { delete f.liste[0].files; }, /Dateiliste fehlt/],
  ['Manifest', (f) => { f.liste[0].files.shift(); }, /package.json fehlt/],
  ['doppelte Pfade', (f) => { f.liste[0].files.push(f.liste[0].files[0]); }, /Doppelte Dateipfade/],
  ['Kopie fehlt', (f) => { rmSync(join(f.wurzel, 'packages/kern/NOTICE')); }, /nicht lesbar/],
]) {
  test(`Ungültige Packliste: ${fall}`, () => {
    const f = packProbe();
    aendern(f);
    assert.match(pruefePackliste(f.liste, f.workspaces, f.wurzel).join('\n'), muster);
  });
}

test('Fehlende eigene Wurzelhinweise lassen schon die normale Prüfung scheitern', () => {
  const f = probe();
  rmSync(join(f.wurzel, 'NOTICE'));
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /NOTICE in der Wurzel fehlt/);
});

function cli(f, args) {
  return spawnSync(process.execPath, [join(hier, 'check-licenses.mjs'), '--wurzel', f.wurzel, ...args], {
    encoding: 'utf8', cwd: arbeit, env: { ...process.env, TEMP: arbeit, TMP: arbeit },
  });
}

for (const datei of ['LICENSE', 'NOTICE']) {
  for (const [fall, aendern, muster] of [
    ['gleich', () => {}, null],
    ['abweichend', (pfad) => schreiben(pfad, 'Veraltet\n'), /stimmt nicht mit der Wurzeldatei/],
    ['andere Zeilenenden', (pfad) => schreiben(pfad, readFileSync(pfad, 'utf8').replaceAll('\n', '\r\n')), /stimmt nicht mit der Wurzeldatei/],
    ['leer', (pfad) => schreiben(pfad, ''), /ist leer/],
    ['fehlend', (pfad) => rmSync(pfad), /fehlt oder ist nicht lesbar/],
  ]) {
    test(`Normaler CLI-Lauf prüft Paketkopie ${datei}: ${fall}`, () => {
      const f = probe();
      aendern(join(f.wurzel, 'packages/kern', datei));
      const lauf = cli(f, ['--json']);
      assert.equal(lauf.status, muster ? 1 : 0, lauf.stdout || lauf.stderr);
      assert.equal(lauf.stderr, '');
      const bericht = JSON.parse(lauf.stdout);
      assert.equal(bericht.packlisteGeprueft, false);
      assert.equal(bericht.ok, !muster);
      if (muster) {
        const meldung = bericht.fehler.find((f) => f.startsWith(`packages/kern/${datei} `));
        assert.match(meldung ?? '', muster);
      } else assert.deepEqual(bericht.fehler, []);
    });
  }
}

for (const pfad of ['package-lock.json', 'package.json', 'packages/kern/package.json', 'node_modules/werkzeug/package.json', 'packliste.json']) {
  test(`JSON-Fehler nennt den wurzelrelativen Dateipfad: ${pfad}`, () => {
    const f = probe();
    schreiben(join(f.wurzel, pfad), '{');
    const args = pfad === 'packliste.json' ? ['--packliste', join(f.wurzel, pfad)] : [];
    for (const json of [false, true]) {
      const lauf = cli(f, [...args, ...(json ? ['--json'] : [])]);
      assert.equal(lauf.status, 1);
      assert.equal(lauf.stderr, '');
      const meldung = json ? JSON.parse(lauf.stdout).fehler.join('\n') : lauf.stdout;
      assert.ok(meldung.includes(`JSON-Datei ${pfad} ist nicht lesbar oder ungültig:`), meldung);
      assert.ok(!meldung.includes(f.wurzel), meldung);
    }
  });
}

test('Nicht lesbare JSON-Datei wird mit relativem Pfad und Fehlercode gemeldet', () => {
  const f = probe();
  rmSync(join(f.wurzel, 'package-lock.json'));
  const lauf = cli(f, ['--json']);
  assert.equal(lauf.status, 1);
  assert.deepEqual(JSON.parse(lauf.stdout).fehler, ['JSON-Datei package-lock.json ist nicht lesbar oder ungültig: ENOENT']);
});

test('CLI liefert sauberes JSON sowie deutsche Ausgabe und passende Exit-Codes', () => {
  const f = probe();
  const json = cli(f, ['--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).ok, true);
  assert.equal(json.stderr, '');
  const text = cli(f, []);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Lizenzprüfung: 1 Fremdpakete/);
  assert.match(text.stdout, /ERGEBNIS: bestanden/);
  f.lock.packages['node_modules/werkzeug'].license = 'UNLICENSED';
  schreiben(join(f.wurzel, 'package-lock.json'), f.lock);
  const nein = cli(f, ['--json']);
  assert.equal(nein.status, 1);
  assert.equal(JSON.parse(nein.stdout).ok, false);
});

test('CLI behandelt ungültige Eingaben auch im JSON-Modus mit Code 1', () => {
  const f = probe();
  for (const args of [['--falsch'], ['--packliste']]) {
    const lauf = cli(f, ['--json', ...args]);
    assert.equal(lauf.status, 1);
    assert.equal(JSON.parse(lauf.stdout).ok, false);
  }
  schreiben(join(f.wurzel, 'package-lock.json'), '{');
  const lauf = cli(f, ['--json']);
  assert.equal(lauf.status, 1);
  assert.equal(JSON.parse(lauf.stdout).ok, false);
});

test('CLI-Packlistenprüfung schlägt bei fehlender NOTICE fehl und mit beiden Dateien besteht sie', () => {
  const f = packProbe();
  const datei = join(f.wurzel, 'packliste.json');
  schreiben(datei, f.liste);
  const ja = cli(f, ['--json', '--packliste', datei]);
  assert.equal(ja.status, 0, ja.stdout);
  assert.equal(JSON.parse(ja.stdout).packlisteGeprueft, true);
  f.liste[0].files = f.liste[0].files.filter((d) => d.path !== 'NOTICE');
  schreiben(datei, f.liste);
  const nein = cli(f, ['--json', '--packliste', datei]);
  assert.equal(nein.status, 1);
  assert.match(JSON.parse(nein.stdout).fehler.join('\n'), /NOTICE fehlt/);
});
