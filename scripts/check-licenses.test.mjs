// Aufruf: node --test scripts/check-licenses.test.mjs
// Probedateien bleiben unter scratchpad; keine Installation, kein Netzwerk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { menschenlesbar, pruefeAusdruck, pruefePackliste, pruefeProjekt as pruefeProjektMitVorgaben, vorgabe } from './check-licenses.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const scratchpad = resolve(hier, '../scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'lizenzen-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

// Synthetische Bäume haben eigene Ausnahmen. Die echte Projektfreigabe wird
// getrennt am unveränderten Baum geprüft, auch mit festem Ablaufdatum.
function pruefeProjekt(wurzel, optionen = {}) {
  return pruefeProjektMitVorgaben(wurzel, { ausnahmen: [], ...optionen });
}

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

function ohneAbsolutenPfad(bericht, wurzel) {
  for (const ausgabe of [JSON.stringify(bericht), menschenlesbar(bericht)]) {
    for (const pfad of [wurzel, wurzel.replaceAll('\\', '/'), JSON.stringify(wurzel).slice(1, -1)]) {
      assert.ok(!ausgabe.includes(pfad), ausgabe);
    }
  }
}

function dateifehler(t, methode, datei) {
  const original = fs[methode];
  t.mock.method(fs, methode, (pfad, ...args) => {
    if (pfad === datei) throw Object.assign(new Error(`EACCES: permission denied, ${methode} '${datei}'`), { code: 'EACCES' });
    return original(pfad, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

const ausdruckFaelle = [
  ['MIT', 'ausgeliefert', true, ['MIT']],
  [' mit ', 'ausgeliefert', true, ['MIT']],
  ['(MIT AND Apache-2.0)', 'ausgeliefert', true, ['MIT', 'Apache-2.0']],
  ['MPL-2.0', 'entwicklung', true, ['MPL-2.0']],
  ['MPL-2.0', 'bereitgestellt', true, ['MPL-2.0']],
  ['(MIT OR GPL-3.0-or-later)', 'ausgeliefert', true, ['MIT']],
  ['(MIT AND Zlib)', 'ausgeliefert', true, ['MIT', 'Zlib']],
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
  assert.deepEqual(Object.entries(vorgabe.lizenzen).filter(([, b]) => b.includes('ausgeliefert')).map(([id]) => id).sort(),
    ['Apache-2.0', 'BSD-3-Clause', 'ISC', 'MIT', 'Zlib']);
  for (const b of Object.values(vorgabe.lizenzen)) assert.equal(b.includes('entwicklung'), b.includes('bereitgestellt'));
  assert.equal(vorgabe.einzelausnahmen.length, 1);
  assert.equal(vorgabe.einzelausnahmen[0].paket, 'rgbcolor');
  assert.equal(vorgabe.einzelausnahmenMaxMonate, 12);
});

// Die drei Prüfungen am echten Baum lesen den Beleg im installierten Paket.
// Ohne Installation entfallen sie. "npm run lizenzen" prüft den Baum in jedem Fall.
const amEchtenBaum = {
  skip: fs.existsSync(resolve(hier, '..', 'node_modules', 'rgbcolor', 'LICENSE.md')) ? false : 'braucht die installierten Pakete, zuerst npm ci',
};

test('Echter Baum: rgbcolor wird mit genau belegter MIT-Ausnahme angenommen', amEchtenBaum, () => {
  const b = pruefeProjektMitVorgaben(resolve(hier, '..'), { stichtag: '2026-09-29' });
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.einzelausnahmen, 1);
  const p = b.pakete.find((p) => p.name === 'rgbcolor');
  assert.equal(p.version, '1.0.1');
  assert.equal(p.bereich, 'ausgeliefert');
  assert.equal(p.lizenz, 'MIT OR SEE LICENSE IN FEEL-FREE.md');
  assert.equal(p.lizenzInstalliert, p.lizenz);
  assert.deepEqual(p.auswahl, ['MIT']);
  assert.equal(p.ausnahme.gueltigBis, '2027-09-29');
  assert.equal(p.ausnahme.beleg.datei, 'LICENSE.md');
  assert.equal(p.ausnahme.beleg.quelle, 'https://registry.npmjs.org/rgbcolor/-/rgbcolor-1.0.1.tgz');
  assert.deepEqual(p.wege.ausgeliefert.map((k) => [k.name, k.art]), [
    ['jspdf', 'dependencies'], ['canvg', 'optionalDependencies'], ['rgbcolor', 'dependencies'],
  ]);
  for (const name of ['exceljs', 'big-integer', 'buffers', 'chainsaw', 'traverse', 'jszip', 'unzipper', 'glob', 'rimraf', 'fstream', 'uuid']) {
    assert.ok(!b.pakete.some((p) => p.name === name), `${name} ist noch im Baum.`);
  }
});

test('Echter Baum: ohne Ausnahme scheitert ausschließlich rgbcolor', amEchtenBaum, () => {
  const b = pruefeProjekt(resolve(hier, '..'));
  assert.equal(b.ok, false);
  assert.deepEqual(b.pakete.filter((p) => p.fehler.length).map((p) => p.name), ['rgbcolor']);
  assert.equal(b.fehler.length, 2);
});

test('Echte Ausnahme: Ablaufdatum ist eingeschlossen, der Folgetag scheitert', amEchtenBaum, () => {
  assert.equal(pruefeProjektMitVorgaben(resolve(hier, '..'), { stichtag: '2027-09-29' }).ok, true);
  assert.throws(() => pruefeProjektMitVorgaben(resolve(hier, '..'), { stichtag: '2027-09-30' }), /Einzelausnahme abgelaufen: rgbcolor@1\.0\.1/);
});

for (const bereich of ['ausgeliefert', 'bereitgestellt', 'entwicklung']) {
  test(`GPL bleibt auch mit bekannter Kennung unzulässig: ${bereich}`, () => {
    assert.equal(pruefeAusdruck('GPL-3.0-or-later', bereich).zulaessig, false);
    assert.deepEqual(pruefeAusdruck('GPL-3.0-or-later OR MIT', bereich).auswahl, ['MIT']);
    assert.equal(pruefeAusdruck('GPL-3.0-or-later AND MIT', bereich).zulaessig, false);
  });
  for (const id of ['MPL-2.0', 'BSD-2-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Python-2.0', 'LGPL-3.0-or-later']) {
    test(`Geprüfte Werkzeuglizenz ${id} in ${bereich}`, () => {
      assert.equal(pruefeAusdruck(id, bereich).zulaessig, bereich !== 'ausgeliefert');
    });
  }
}

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

test('App und Wurzel: optionale Abhängigkeiten sind ausgeliefert, Workspace-Peers bereitgestellt', () => {
  const f = probe((f) => {
    f.app.optionalDependencies = { optional: '1.0.0' };
    f.app.peerDependencies = { peer: '1.0.0', fehlt: '*' };
    f.app.peerDependenciesMeta = { peer: { optional: true }, fehlt: { optional: true } };
    f.root.dependencies = { rootlib: '1.0.0' };
    for (const name of ['optional', 'peer', 'rootlib']) f.lock.packages[`node_modules/${name}`] = { version: '1.0.0', license: 'MIT' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.ausgeliefert, 2);
  assert.equal(b.zusammenfassung.bereitgestellt, 1);
  assert.equal(b.pakete.find((p) => p.name === 'peer').bereich, 'bereitgestellt');
});

test('Lizenzfehler verdecken keine Hinweise auf Installationsskripte und Binärdateien', () => {
  const f = probe((f) => {
    f.lock.packages['node_modules/werkzeug'].license = 'Unbekannt';
    f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: 'Unbekannt', scripts: { install: 'exit 9' } };
  });
  schreiben(join(f.wurzel, 'node_modules/werkzeug/LICENSE'), 'Ungeprüfter Text');
  schreiben(join(f.wurzel, 'node_modules/werkzeug/lib.node'), 'Binärprobe');
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, false);
  assert.equal(b.zusammenfassung.installationsskripte, 1);
  assert.equal(b.zusammenfassung.vorgebaut, 1);
  assert.deepEqual(b.pakete[0].hinweisdateien, ['LICENSE']);
});

test('Bereitgestellt geht vor Entwicklung; transitive Pfade, fremde Peers und Zyklen bleiben sichtbar', () => {
  const f = probe((f) => {
    f.kern.peerDependencies = { werkzeug: '1.0.0' };
    Object.assign(f.lock.packages['node_modules/werkzeug'], {
      license: 'MPL-2.0', dependencies: { kind: '1.0.0' }, peerDependencies: { fremderPeer: '1.0.0' },
    });
    f.lock.packages['node_modules/kind'] = { version: '1.0.0', license: 'BSD-2-Clause', dependencies: { werkzeug: '1.0.0' } };
    f.lock.packages['node_modules/fremderPeer'] = { version: '1.0.0', license: 'MPL-2.0' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.formatVersion, 2);
  assert.equal(b.zusammenfassung.bereitgestellt, 3);
  assert.equal(b.zusammenfassung.entwicklung, 0);
  assert.equal(b.zusammenfassung.ausgeliefert, 0);
  for (const p of b.pakete) {
    assert.equal(p.bereich, 'bereitgestellt');
    assert.equal(p.auchEntwicklung, true);
    assert.equal(p.auchBereitgestellt, false);
    assert.equal(p.wege.bereitgestellt[0].von, 'packages/kern');
    assert.equal(p.wege.bereitgestellt[0].art, 'peerDependencies');
    assert.equal(p.wege.entwicklung[0].art, 'devDependencies');
  }
  assert.match(menschenlesbar(b), /0 ausgeliefert, 3 bereitgestellt, 0 für Test und Build/);
});

for (const art of ['dependencies', 'optionalDependencies']) {
  test(`Peer und zugleich ${art}: strengste Regel auch für Kinder`, () => {
    const f = probe((f) => {
      f.kern.peerDependencies = { werkzeug: '1.0.0' };
      f.app[art] = { werkzeug: '1.0.0' };
      Object.assign(f.lock.packages['node_modules/werkzeug'], { license: 'MPL-2.0', dependencies: { kind: '1.0.0' } });
      f.lock.packages['node_modules/kind'] = { version: '1.0.0', license: 'MPL-2.0' };
    });
    const b = pruefeProjekt(f.wurzel);
    fehlerEnthaelt(b, /Lizenz für ausgeliefert nicht zugelassen/);
    assert.equal(b.zusammenfassung.ausgeliefert, 2);
    for (const p of b.pakete) {
      assert.equal(p.bereich, 'ausgeliefert');
      assert.equal(p.auchBereitgestellt, true);
      assert.equal(p.auchEntwicklung, true);
    }
  });
}

for (const optional of [false, true]) {
  test(`Fremder Peer im ausgelieferten Baum bleibt streng, optional=${optional}`, () => {
    const f = probe((f) => {
      f.kern.dependencies = { werkzeug: '1.0.0' };
      f.kern.peerDependencies = { peer: '1.0.0' };
      Object.assign(f.lock.packages['node_modules/werkzeug'], {
        peerDependencies: { peer: '1.0.0' }, peerDependenciesMeta: { peer: { optional } },
      });
      f.lock.packages['node_modules/peer'] = { version: '1.0.0', license: 'MPL-2.0', dependencies: { kind: '1.0.0' } };
      f.lock.packages['node_modules/kind'] = { version: '1.0.0', license: 'MPL-2.0' };
    });
    const b = pruefeProjekt(f.wurzel);
    fehlerEnthaelt(b, /Lizenz für ausgeliefert nicht zugelassen/);
    assert.equal(b.zusammenfassung.ausgeliefert, 3);
    assert.equal(b.pakete.find((p) => p.name === 'peer').wege.ausgeliefert.at(-1).art, 'peerDependencies');
  });
  for (const license of ['MPL-2.0', 'MIT OR Unbekannt']) {
    test(`Workspace-Peer ohne Installation wird geprüft: ${license}, optional=${optional}`, () => {
      const f = probe((f) => {
        f.kern.peerDependencies = { peer: '1.0.0' };
        f.kern.peerDependenciesMeta = { peer: { optional } };
        f.lock.packages['node_modules/peer'] = { version: '1.0.0', license };
      });
      const b = pruefeProjekt(f.wurzel);
      assert.equal(b.zusammenfassung.bereitgestellt, 1);
      if (license === 'MPL-2.0') assert.equal(b.ok, true, b.fehler.join('\n'));
      else fehlerEnthaelt(b, /Unbekannte oder nicht geprüfte Lizenz/);
    });
  }
}

test('Peer der Wurzel erhält keine Workspace-Erleichterung', () => {
  const f = probe((f) => {
    f.root.peerDependencies = { werkzeug: '1.0.0' };
    f.lock.packages['node_modules/werkzeug'].license = 'MPL-2.0';
  });
  fehlerEnthaelt(pruefeProjekt(f.wurzel), /Lizenz für ausgeliefert nicht zugelassen/);
});

test('Workspace-Link verschiebt dessen Peer nicht in den ausgelieferten Bereich', () => {
  const f = probe((f) => {
    f.app.dependencies = { '@probe/kern': '1.0.0' };
    f.kern.peerDependencies = { werkzeug: '1.0.0' };
    f.lock.packages['node_modules/werkzeug'].license = 'MPL-2.0';
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.pakete[0].bereich, 'bereitgestellt');
});

test('Workspace-Peers und Laufzeitpakete mit gleichem Namen in getrennten Orten bleiben getrennt', () => {
  const f = probe((f) => {
    f.kern.peerDependencies = { werkzeug: '1.0.0' };
    f.app.dependencies = { werkzeug: '2.0.0' };
    f.lock.packages['node_modules/werkzeug'].license = 'MPL-2.0';
    f.lock.packages['app/node_modules/werkzeug'] = { version: '2.0.0', license: 'MIT' };
  });
  const b = pruefeProjekt(f.wurzel);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.pakete.find((p) => p.version === '1.0.0').bereich, 'bereitgestellt');
  assert.equal(b.pakete.find((p) => p.version === '2.0.0').bereich, 'ausgeliefert');
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

function ausnahmeProbe(angabe = 'MIT/X11', bereich = 'entwicklung') {
  const f = probe((f) => {
    f.lock.packages['node_modules/werkzeug'].license = angabe;
    f.installiert['node_modules/werkzeug'] = { name: 'werkzeug', version: '1.0.0', license: angabe };
    if (bereich === 'bereitgestellt') f.kern.peerDependencies = { werkzeug: '1.0.0' };
    if (bereich === 'ausgeliefert') f.kern.dependencies = { werkzeug: '1.0.0' };
  });
  const beleg = 'Eigener Lizenzbeleg der Testprobe, kein übernommener Pakettext.\n';
  schreiben(join(f.wurzel, 'node_modules/werkzeug/LICENSE'), beleg);
  const ausnahme = { paket: 'werkzeug', version: '1.0.0', angabe, lizenz: 'MIT', bereich,
    beleg: { datei: 'LICENSE', sha256: createHash('sha256').update(beleg).digest('hex'), quelle: 'https://example.org/probe/1.0.0/LICENSE' },
    gueltigBis: '2026-10-31', begruendung: 'Nur synthetische Prüfdaten.' };
  return { ...f, ausnahme, optionen: { ausnahmen: [ausnahme], stichtag: '2026-09-29' } };
}

for (const bereich of ['ausgeliefert', 'bereitgestellt', 'entwicklung']) {
  for (const angabe of [null, 'MIT/X11', 'MIT OR SEE LICENSE IN LIZENZ']) {
    test(`Einzelausnahme für genau eine Version und Rohangabe: ${bereich}, ${angabe}`, () => {
      const f = ausnahmeProbe(angabe, bereich);
      const b = pruefeProjekt(f.wurzel, f.optionen);
      assert.equal(b.ok, true, b.fehler.join('\n'));
      assert.equal(b.zusammenfassung.einzelausnahmen, 1);
      assert.equal(b.pakete[0].lizenz, angabe);
      assert.deepEqual(b.pakete[0].auswahl, ['MIT']);
      assert.deepEqual(b.pakete[0].ausnahme, f.ausnahme);
      assert.match(menschenlesbar(b), /Einzelausnahme bis 2026-10-31: LICENSE/);
      assert.equal(pruefeProjekt(f.wurzel).ok, false, 'Ohne Probedaten bleibt die Angabe ein Fehler.');
    });
  }
}

for (const [feld, wert] of [['paket', 'anderes'], ['version', '1.0.1'], ['angabe', 'MIT / X11'], ['bereich', 'bereitgestellt']]) {
  test(`Ausnahme greift nicht bei anderem ${feld}`, () => {
    const f = ausnahmeProbe();
    f.ausnahme[feld] = wert;
    const b = pruefeProjekt(f.wurzel, f.optionen);
    fehlerEnthaelt(b, /Unbekannte|ungültiger SPDX/);
    fehlerEnthaelt(b, /Einzelausnahme trifft auf kein Paket zu/);
  });
}

for (const [feld, wert, muster] of [
  ['version', '^1.0.0', /Ungültige Einzelausnahme/],
  ['version', '*', /Ungültige Einzelausnahme/],
  ['paket', '*', /Ungültige Einzelausnahme/],
  ['angabe', undefined, /Ungültige Einzelausnahme/],
  ['bereich', '*', /Ungültige Einzelausnahme/],
  ['gueltigBis', '2026-09-28', /abgelaufen/],
  ['gueltigBis', '2026-02-30', /Ungültige Einzelausnahme/],
  ['gueltigBis', '', /Ungültige Einzelausnahme/],
  ['begruendung', '', /Ungültige Einzelausnahme/],
  ['beleg', {}, /Ungültige Einzelausnahme/],
  ['lizenz', 'GPL-3.0-or-later', /nicht zugelassen/],
  ['lizenz', 'MIT OR Unbekannt', /Unbekannte/],
  ['angabe', 'GPL-3.0-or-later', /bekannte SPDX-Angaben/],
  ['angabe', 'MIT', /bekannte SPDX-Angaben/],
]) {
  test(`Unwirksame Ausnahmedaten werden abgewiesen: ${feld}=${JSON.stringify(wert)}`, () => {
    const f = ausnahmeProbe();
    f.ausnahme[feld] = wert;
    assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), muster);
  });
}

test('Ausnahme kann eine Werkzeuglizenz nicht für die Auslieferung freigeben', () => {
  const f = ausnahmeProbe('Verweis', 'ausgeliefert');
  f.ausnahme.lizenz = 'MPL-2.0';
  assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), /nicht zugelassen/);
});

test('Ablauftag gilt einschließlich UTC; doppelte Ausnahmen und ungültiger Stichtag scheitern', () => {
  const f = ausnahmeProbe();
  f.optionen.stichtag = f.ausnahme.gueltigBis;
  assert.equal(pruefeProjekt(f.wurzel, f.optionen).ok, true);
  assert.throws(() => pruefeProjekt(f.wurzel, { ...f.optionen, stichtag: 'falsch' }), /Stichtag/);
  assert.throws(() => pruefeProjekt(f.wurzel, { ...f.optionen, ausnahmen: {} }), /Liste/);
  f.optionen.ausnahmen.push(structuredClone(f.ausnahme));
  assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), /Doppelte Einzelausnahme/);
});

for (const [stichtag, gueltigBis, zulaessig] of [
  ['2026-09-29', '2027-09-28', true],
  ['2026-09-29', '2027-09-29', true],
  ['2026-09-29', '2027-09-30', false],
  ['2026-09-29', '2099-12-31', false],
  ['2023-03-01', '2024-03-01', true],
  ['2023-03-01', '2024-03-02', false],
  ['2024-02-29', '2025-02-28', true],
  ['2024-02-29', '2025-03-01', false],
  ['2026-12-31', '2027-12-31', true],
  ['2026-12-31', '2028-01-01', false],
]) {
  test(`Höchstens zwölf Kalendermonate ab ${stichtag}: ${gueltigBis}`, () => {
    const f = ausnahmeProbe();
    f.optionen.stichtag = stichtag;
    f.ausnahme.gueltigBis = gueltigBis;
    if (zulaessig) assert.equal(pruefeProjekt(f.wurzel, f.optionen).ok, true);
    else assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), /höchstens 12 Kalendermonate/);
  });
}

test('Die Monatsgrenze kommt aus den Prüfdaten und begrenzt den Tag am Monatsende', (t) => {
  const vorher = vorgabe.einzelausnahmenMaxMonate;
  t.after(() => { vorgabe.einzelausnahmenMaxMonate = vorher; });
  vorgabe.einzelausnahmenMaxMonate = 1;
  const f = ausnahmeProbe();
  for (const [stichtag, letzterTag, ersterUngueltigerTag] of [
    ['2026-01-31', '2026-02-28', '2026-03-01'],
    ['2024-01-31', '2024-02-29', '2024-03-01'],
  ]) {
    f.optionen.stichtag = stichtag;
    f.ausnahme.gueltigBis = letzterTag;
    assert.equal(pruefeProjekt(f.wurzel, f.optionen).ok, true);
    f.ausnahme.gueltigBis = ersterUngueltigerTag;
    assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), /höchstens 1 Kalendermonate/);
  }
});

for (const monate of [undefined, null, 0, -1, 1.5, '12', Infinity, Number.MAX_SAFE_INTEGER]) {
  test(`Ungültige Monatsgrenze scheitert: ${monate}`, (t) => {
    const vorher = vorgabe.einzelausnahmenMaxMonate;
    t.after(() => { vorgabe.einzelausnahmenMaxMonate = vorher; });
    vorgabe.einzelausnahmenMaxMonate = monate;
    const f = ausnahmeProbe();
    assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), /einzelausnahmenMaxMonate/);
  });
}

for (const [fall, aendern] of [
  ['entferntes Paket', (f) => {
    delete f.root.devDependencies.werkzeug;
    delete f.lock.packages['node_modules/werkzeug'];
  }],
  ['neue Version mit gültiger Lizenz', (f) => {
    f.root.devDependencies.werkzeug = '2.0.0';
    f.lock.packages['node_modules/werkzeug'] = { version: '2.0.0', license: 'MIT' };
  }],
  ['berichtigte Rohangabe derselben Version', () => {}],
]) {
  test(`Veraltete Ausnahme scheitert auch bei sonst fehlerfreiem Baum: ${fall}`, () => {
    const f = probe(aendern);
    const muster = ausnahmeProbe();
    assert.equal(pruefeProjekt(f.wurzel).ok, true);
    const b = pruefeProjekt(f.wurzel, muster.optionen);
    assert.equal(b.ok, false);
    assert.deepEqual(b.fehler, ['Einzelausnahme trifft auf kein Paket zu: werkzeug@1.0.0 (entwicklung).']);
  });
}

test('Eine zusätzliche unbenutzte Ausnahme scheitert neben einer passenden Ausnahme', () => {
  const f = ausnahmeProbe();
  f.optionen.ausnahmen.push({ ...structuredClone(f.ausnahme), paket: 'alt' });
  const b = pruefeProjekt(f.wurzel, f.optionen);
  assert.equal(b.zusammenfassung.einzelausnahmen, 1);
  assert.deepEqual(b.fehler, ['Einzelausnahme trifft auf kein Paket zu: alt@1.0.0 (entwicklung).']);
});

for (const pfad of ['../LICENSE', '/LICENSE', 'C:/LICENSE', 'dir\\LICENSE']) {
  test(`Ausnahme akzeptiert keinen fremden Belegpfad: ${pfad}`, () => {
    const f = ausnahmeProbe();
    f.ausnahme.beleg.datei = pfad;
    assert.throws(() => pruefeProjekt(f.wurzel, f.optionen), { message: 'Ungültiger relativer Paketpfad.' });
  });
}

test('Ausnahme braucht einen vorhandenen, nicht leeren, unveränderten Beleg', () => {
  const f = ausnahmeProbe();
  const pfad = join(f.wurzel, 'node_modules/werkzeug/LICENSE');
  for (const text of ['Veränderter Beleg', '']) {
    schreiben(pfad, text);
    fehlerEnthaelt(pruefeProjekt(f.wurzel, f.optionen), /Beleg der Einzelausnahme weicht ab/);
  }
  rmSync(pfad);
  const b = pruefeProjekt(f.wurzel, f.optionen);
  fehlerEnthaelt(b, /Beleg der Einzelausnahme fehlt: node_modules\/werkzeug\/LICENSE/);
  assert.equal(b.fehler.length, 2);
  ohneAbsolutenPfad(b, f.wurzel);
});

for (const methode of ['realpathSync', 'readFileSync']) {
  test(`Nicht lesbarer Ausnahmebeleg nennt nur den relativen Pfad: ${methode}`, (t) => {
    const f = ausnahmeProbe();
    dateifehler(t, methode, join(f.wurzel, 'node_modules/werkzeug/LICENSE'));
    const b = pruefeProjekt(f.wurzel, f.optionen);
    fehlerEnthaelt(b, /Beleg der Einzelausnahme ist nicht lesbar: node_modules\/werkzeug\/LICENSE/);
    ohneAbsolutenPfad(b, f.wurzel);
  });
}

test('Nicht lesbarer Paketunterordner nennt nur den relativen Pfad', (t) => {
  const f = ausnahmeProbe();
  const ordner = join(f.wurzel, 'node_modules/werkzeug/unterordner');
  mkdirSync(ordner);
  dateifehler(t, 'readdirSync', ordner);
  const b = pruefeProjekt(f.wurzel, f.optionen);
  fehlerEnthaelt(b, /Paketordner ist nicht lesbar: node_modules\/werkzeug\/unterordner/);
  ohneAbsolutenPfad(b, f.wurzel);
});

test('Beleg einer Ausnahme darf auch per Verknüpfung nicht aus dem Paket führen', () => {
  const f = ausnahmeProbe();
  const fremd = join(f.wurzel, 'beleg-ausserhalb-des-pakets');
  schreiben(join(fremd, 'LICENSE'), readFileSync(join(f.wurzel, 'node_modules/werkzeug/LICENSE'), 'utf8'));
  symlinkSync(fremd, join(f.wurzel, 'node_modules/werkzeug/beleg'), process.platform === 'win32' ? 'junction' : 'dir');
  f.ausnahme.beleg.datei = 'beleg/LICENSE';
  fehlerEnthaelt(pruefeProjekt(f.wurzel, f.optionen), /außerhalb des Pakets/);
});

test('Eine Ausnahme kann ohne Installation nicht nur anhand des Lockfiles bestehen', () => {
  const f = probe((f) => { f.lock.packages['node_modules/werkzeug'].license = 'MIT/X11'; });
  const muster = ausnahmeProbe();
  const b = pruefeProjekt(f.wurzel, muster.optionen);
  assert.equal(b.ok, false);
  assert.equal(b.zusammenfassung.nurLockfile, 1);
  assert.equal(b.zusammenfassung.einzelausnahmen, 0);
  assert.deepEqual(b.fehler, ['node_modules/werkzeug: Beleg der Einzelausnahme fehlt: node_modules/werkzeug/LICENSE']);
  ohneAbsolutenPfad(b, f.wurzel);
});

for (const [feld, wert] of [['license', 'MIT'], ['license', 'MIT / X11'], ['version', '1.0.1'], ['name', 'anderes']]) {
  test(`Ausnahme verdeckt keine abweichende Installation: ${feld}=${wert}`, () => {
    const f = ausnahmeProbe();
    schreiben(join(f.wurzel, 'node_modules/werkzeug/package.json'), { ...f.installiert['node_modules/werkzeug'], [feld]: wert });
    assert.equal(pruefeProjekt(f.wurzel, f.optionen).ok, false);
  });
}

test('Einzelausnahme gilt weder für Kinder noch für andere verschachtelte Versionen', () => {
  const f = ausnahmeProbe();
  f.lock.packages['node_modules/werkzeug'].dependencies = { kind: '1.0.0' };
  f.lock.packages['node_modules/kind'] = { version: '1.0.0', license: 'MIT/X11', dependencies: { werkzeug: '2.0.0' } };
  f.lock.packages['node_modules/kind/node_modules/werkzeug'] = { version: '2.0.0', license: 'MIT/X11' };
  schreiben(join(f.wurzel, 'package-lock.json'), f.lock);
  const b = pruefeProjekt(f.wurzel, f.optionen);
  assert.equal(b.ok, false);
  assert.equal(b.pakete.filter((p) => p.fehler.length).length, 2);
  assert.equal(b.zusammenfassung.einzelausnahmen, 1);
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
  // Derselbe Skriptinhalt mit eigenen Prüfdaten für den synthetischen Baum.
  const skript = join(f.wurzel, 'scripts/check-licenses.mjs');
  schreiben(skript, readFileSync(join(hier, 'check-licenses.mjs'), 'utf8'));
  schreiben(join(f.wurzel, 'scripts/check-licenses.json'), { ...vorgabe, einzelausnahmen: [] });
  return spawnSync(process.execPath, [skript, '--wurzel', f.wurzel, ...args], {
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

test('Fehlender Workspace-Ordner meldet keinen Betriebssystempfad', () => {
  const f = probe((f) => { f.root.workspaces.push('fehlend/*'); });
  for (const args of [[], ['--json']]) {
    const lauf = cli(f, args);
    assert.equal(lauf.status, 1);
    assert.equal(lauf.stderr, '');
    assert.match(lauf.stdout, /Workspace-Ordner fehlt: fehlend/);
    assert.ok(!lauf.stdout.includes(f.wurzel));
    assert.ok(!lauf.stdout.includes(JSON.stringify(f.wurzel).slice(1, -1)));
  }
});

test('JSON-Syntaxfehler geben keine Ausschnitte des Dateiinhalts weiter', () => {
  const f = probe();
  schreiben(join(f.wurzel, 'package-lock.json'), `${JSON.stringify(f.wurzel)} unvollstaendig`);
  const lauf = cli(f, ['--json']);
  assert.equal(lauf.status, 1);
  assert.equal(lauf.stderr, '');
  const b = JSON.parse(lauf.stdout);
  assert.deepEqual(b.fehler, ['JSON-Datei package-lock.json ist nicht lesbar oder ungültig: JSON-Syntaxfehler']);
  ohneAbsolutenPfad(b, f.wurzel);
});

test('Externe Packliste gibt bei Lesefehlern keine fremde Ordnerstruktur aus', () => {
  const f = probe();
  const datei = join(arbeit, 'externe-ablage/packliste.json');
  const lauf = cli(f, ['--json', '--packliste', datei]);
  assert.equal(lauf.status, 1);
  assert.equal(lauf.stderr, '');
  const b = JSON.parse(lauf.stdout);
  assert.deepEqual(b.fehler, ['JSON-Datei [außerhalb der Wurzel]/packliste.json ist nicht lesbar oder ungültig: ENOENT']);
  ohneAbsolutenPfad(b, arbeit);
  assert.ok(!lauf.stdout.includes('externe-ablage'));
});

for (const inhalt of [null, '{']) {
  test(`Fehlende oder ungültige Prüfdaten ergeben eine Ausgabe ohne Stacktrace: ${inhalt}`, () => {
    const f = probe();
    const skript = join(f.wurzel, 'scripts/check-licenses.mjs');
    schreiben(skript, readFileSync(join(hier, 'check-licenses.mjs'), 'utf8'));
    if (inhalt !== null) schreiben(join(f.wurzel, 'scripts/check-licenses.json'), inhalt);
    const lauf = spawnSync(process.execPath, [skript, '--json', '--wurzel', f.wurzel], {
      encoding: 'utf8', cwd: arbeit, env: { ...process.env, TEMP: arbeit, TMP: arbeit },
    });
    assert.equal(lauf.status, 1);
    assert.equal(lauf.stderr, '');
    const b = JSON.parse(lauf.stdout);
    assert.deepEqual(b.fehler, [`JSON-Datei scripts/check-licenses.json ist nicht lesbar oder ungültig: ${inhalt === null ? 'ENOENT' : 'JSON-Syntaxfehler'}`]);
    ohneAbsolutenPfad(b, f.wurzel);
  });
}

test('Ungültiger absoluter CLI-Parameter wird nicht in der Meldung wiederholt', () => {
  const f = probe();
  const lauf = cli(f, ['--json', f.wurzel]);
  assert.equal(lauf.status, 1);
  assert.equal(lauf.stderr, '');
  const b = JSON.parse(lauf.stdout);
  assert.deepEqual(b.fehler, ['Unbekanntes oder unvollständiges Argument.']);
  ohneAbsolutenPfad(b, f.wurzel);
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
    assert.equal(JSON.parse(lauf.stdout).formatVersion, 2);
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
