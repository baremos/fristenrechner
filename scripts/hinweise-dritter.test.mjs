// Synthetische Offline-Projekte; keine privaten Eingaben und keine Installation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { erzeugeHinweise, pruefeHinweisdatei } from './hinweise-dritter.mjs';
import { pruefeProjekt } from './check-licenses.mjs';
import { pruefeBuendel, pruefeGradleModell } from './hinweise-pruefung.mjs';
import { findeJdk } from './werkzeuge.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad/tmp-v8');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'hinweise-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));
const sha = x => createHash('sha256').update(x).digest('hex');
function schreibe(ort, pfad, inhalt) {
  mkdirSync(dirname(join(ort, pfad)), { recursive: true });
  writeFileSync(join(ort, pfad), typeof inhalt === 'object' && !Buffer.isBuffer(inhalt) ? JSON.stringify(inhalt, null, 2) + '\n' : inhalt);
}
function probe() {
  const ort = mkdtempSync(join(arbeit, 'projekt-'));
  const apache = readFileSync(join(wurzel, 'LICENSE'));
  const root = { name: 'probe', version: '1.0.0', license: 'Apache-2.0', workspaces: ['app'] };
  const app = { name: 'probe-app', version: '1.0.0', license: 'Apache-2.0', dependencies: { alpha: '1.0.0', beta: '2.0.0' } };
  const pakete = { '': root, app, 'node_modules/probe-app': { link: true, resolved: 'app' } };
  const npm = ['alpha', 'beta'].map((paket, index) => {
    const version = index ? '2.0.0' : '1.0.0';
    const lizenz = index ? 'Apache-2.0' : 'MIT';
    const quelle = index ? apache : Buffer.from('Copyright Probe\r\nMIT-Probetext\r\n');
    const manifest = { name: paket, version, license: index ? '(MIT OR Apache-2.0)' : 'MIT' };
    pakete['node_modules/' + paket] = { version, license: manifest.license };
    schreibe(ort, `node_modules/${paket}/package.json`, manifest);
    schreibe(ort, `node_modules/${paket}/LICENSE`, quelle);
    return { paket, version, lizenz, ort: 'node_modules/' + paket, imBuendel: true,
      lizenzdatei: { datei: 'LICENSE', sha256: sha(quelle) }, status: 'vollstaendig' };
  });
  const beh = Buffer.from('Behälter-Probe\n');
  schreibe(ort, 'node_modules/alpha/distribution.js', beh);
  const i = { formatVersion: 1, apache: { datei: 'LICENSE', sha256: sha(apache) }, npm,
    eingebettet: [{ name: 'Eingebettete Probe', paket: 'alpha', ort: 'node_modules/alpha', quelle: 'distribution.js', lizenz: 'MIT',
      behaelter: { datei: 'distribution.js', sha256: sha(beh) }, wortlaut: 'Originalhinweis der Probe.\n  Einrückung bleibt.\n', status: 'vollstaendig' }],
    buildHilfscode: [], android: { projektmodule: [{ name: 'probe-native', version: '1.0.0', ort: null, lizenz: 'MIT', wortlaut: 'Probetext Android.', status: 'vollstaendig' }],
      maven: [{ gruppe: 'org.probe', name: 'runtime', version: '3.0.0', lizenz: 'Apache-2.0', status: 'vollstaendig' }] }, ausnahmen: [] };
  schreibe(ort, 'package.json', root);
  schreibe(ort, 'app/package.json', app);
  schreibe(ort, 'package-lock.json', { lockfileVersion: 3, packages: pakete });
  schreibe(ort, 'LICENSE', apache);
  schreibe(ort, 'NOTICE', 'NOTICE-Probe\n');
  function speichern() {
    schreibe(ort, 'scripts/hinweise-dritter.json', i);
    schreibe(ort, 'app/src/hinweise-dritter.txt', erzeugeHinweise(ort, i));
  }
  speichern();
  const protokoll = { formatVersion: 1, umgebung: 'client', chunks: [{ datei: 'probe.js', einstieg: true, dynamischerEinstieg: false,
    imports: [], dynamischeImports: [], module: npm.map(e => ({ id: `${e.ort}/index.js`, renderedLength: 10 })) }] };
  return { ort, i, speichern, protokoll };
}
function bericht(p, optionen = {}) { return pruefeProjekt(p.ort, { ausnahmen: [], ...optionen }); }
function scheitert(p, muster, optionen) {
  const b = bericht(p, optionen);
  assert.equal(b.ok, false);
  assert.match(b.fehler.join('\n'), muster);
  assert.ok(!JSON.stringify(b).includes(p.ort.replaceAll('\\', '/')));
  assert.ok(!JSON.stringify(b).includes(JSON.stringify(p.ort).slice(1, -1)));
}

test('Generator: deterministisch, UTF-8 ohne BOM, LF, Apache einmal, Originalwortlaut unverändert', () => {
  const p = probe();
  const a = erzeugeHinweise(p.ort, p.i);
  p.i.npm.reverse();
  p.i.android.maven.reverse();
  assert.ok(a.equals(erzeugeHinweise(p.ort, p.i)));
  const s = a.toString('utf8');
  assert.ok(!s.includes('\r'));
  assert.ok(!s.startsWith('\uFEFF'));
  assert.equal(s.split('Apache License\n').length - 1, 1);
  assert.ok(s.includes(p.i.eingebettet[0].wortlaut));
  assert.doesNotThrow(() => pruefeHinweisdatei(p.ort, p.i));
  assert.equal(bericht(p).ok, true, bericht(p).fehler.join('\n'));
});

test('Generator: SHA-256 prüft Quellbytes vor CRLF-Normalisierung', () => {
  const p = probe();
  schreibe(p.ort, 'node_modules/alpha/LICENSE', 'Copyright Probe\nMIT-Probetext\n');
  assert.throws(() => erzeugeHinweise(p.ort, p.i), /abweichenden SHA-256/);
  scheitert(p, /abweichenden SHA-256/);
});
test('Generator: Apache-Wortlaut als vollständiger Eintrag wird ebenfalls nur referenziert', () => {
  const p = probe();
  p.i.android.maven[0].wortlaut = readFileSync(join(p.ort, 'LICENSE'), 'utf8');
  const s = erzeugeHinweise(p.ort, p.i).toString('utf8');
  assert.equal(s.split('Apache License\n').length - 1, 1);
});

for (const [name, aendern, muster] of [
  ['fehlender Ort', p => p.i.npm.shift(), /ausgelieferter Ort fehlt/],
  ['falsche Version', p => p.i.npm[0].version = '9.0.0', /Version weicht ab/],
  ['falsche Lizenzwahl', p => p.i.npm[1].lizenz = 'Zlib', /Lizenzwahl.*nicht passend/],
  ['fehlende Lizenzdatei', p => { delete p.i.npm[0].lizenzdatei; p.i.npm[0].wortlaut = 'Inline-Probe'; }, /Lizenzdatei mit SHA-256.*fehlt/],
  ['Ausnahme ohne Treffer', p => p.i.ausnahmen.push({ ort: 'node_modules/nichtvorhanden', paket: 'nichtvorhanden', version: '1.0.0', lizenz: 'MIT', grund: 'Probe', status: 'vollstaendig' }), /Ausnahme ohne Treffer/],
  ['Ausnahme ohne Begründung', p => p.i.ausnahmen.push({ ort: 'node_modules/alpha', paket: 'alpha', version: '1.0.0', lizenz: 'MIT', grund: '', status: 'vollstaendig' }), /Ausnahme ohne.*Begründung/],
  ['doppelter Ort', p => p.i.npm.push({ ...p.i.npm[0] }), /doppelter Lockfile-Ort/],
]) {
  test(`Inventar-Gegenprobe: ${name}`, () => {
    const p = probe(); aendern(p);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    scheitert(p, muster);
  });
}
for (const quelle of ['lizenzdatei', 'behaelter']) {
  test(`Inventar-Gegenprobe: falscher ${quelle}-Hash`, () => {
    const p = probe();
    (quelle === 'lizenzdatei' ? p.i.npm[0] : p.i.eingebettet[0])[quelle].sha256 = '0'.repeat(64);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /abweichenden SHA-256/);
    scheitert(p, /abweichenden SHA-256/);
  });
}
test('Inventar-Gegenprobe: veraltete Hinweisdatei', () => {
  const p = probe(); schreibe(p.ort, 'app/src/hinweise-dritter.txt', 'alt\n');
  scheitert(p, /Hinweisdatei ist veraltet/);
});
test('Inventar: Platzhalter sichtbar gezählt; --streng scheitert', () => {
  const p = probe(); p.i.npm[0].status = 'platzhalter'; p.speichern();
  const b = bericht(p);
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.platzhalter, 1);
  assert.match(b.hinweise.join('\n'), /1 Platzhalter/);
  scheitert(p, /1 Platzhalter im strengen Modus/, { streng: true });
});
test('Inventar: belegte Ausnahme deckt ausgelieferten Ort ab', () => {
  const p = probe(); const e = p.i.npm.shift();
  p.i.ausnahmen.push({ ort: e.ort, paket: e.paket, version: e.version, lizenz: e.lizenz, grund: 'nur Typdeklarationen', status: 'vollstaendig' });
  p.speichern(); assert.equal(bericht(p).ok, true, bericht(p).fehler.join('\n'));
});
test('Inventar: installierte Version und Lizenzwahl werden gegen Manifest geprüft', () => {
  const p = probe();
  schreibe(p.ort, 'node_modules/alpha/package.json', { name: 'alpha', version: '9.0.0', license: 'Zlib' });
  scheitert(p, /Paketmanifest weicht ab/);
});
test('Generator: Pfad außerhalb der Wurzel scheitert', () => {
  const p = probe(); p.i.npm[0].lizenzdatei.datei = '../fremd';
  assert.throws(() => erzeugeHinweise(p.ort, p.i), /ungültiger relativer Pfad/);
});
for (const richtung of ['vollständig', 'fremdes Paket', 'fehlendes Paket', 'null Bytes', 'virtuell unbekannt']) {
  test(`Bündelabgleich: ${richtung}`, () => {
    const p = probe();
    if (richtung === 'fremdes Paket') p.protokoll.chunks[0].module.push({ id: 'node_modules/extra/index.js', renderedLength: 10 });
    if (richtung === 'fehlendes Paket') p.protokoll.chunks[0].module.pop();
    if (richtung === 'null Bytes') p.protokoll.chunks[0].module[1].renderedLength = 0;
    if (richtung === 'virtuell unbekannt') p.protokoll.chunks[0].module.push({ id: 'virtuell:extra/helper.js', renderedLength: 10 });
    schreibe(p.ort, 'module.json', p.protokoll);
    const optionen = { buendel: join(p.ort, 'module.json') };
    if (richtung === 'vollständig') assert.equal(bericht(p, optionen).ok, true);
    else scheitert(p, /abgleich:.*(?:nicht im Inventar|fehlt im Modell)/, optionen);
  });
}
test('Bündelabgleich: verschachtelte Orte werden unterschieden', () => {
  const p = probe(); p.protokoll.chunks[0].module[0].id = 'node_modules/parent/node_modules/alpha/index.js';
  schreibe(p.ort, 'module.json', p.protokoll);
  scheitert(p, /node_modules\/parent\/node_modules\/alpha/, { buendel: join(p.ort, 'module.json') });
});
test('Bündelabgleich: virtuelle Hilfen in beide Richtungen', () => {
  const p = probe();
  p.i.buildHilfscode.push({ paket: 'probe-werkzeug', version: '1.0.0', ort: null, lizenz: 'MIT',
    imBuendel: true, module: ['virtuell:probe/helper.js'], wortlaut: null, status: 'platzhalter' });
  assert.match(pruefeBuendel(p.i, p.protokoll).join('\n'), /Hilfscodeabgleich: Inventareintrag fehlt/);
  p.protokoll.chunks[0].module.push({ id: 'virtuell:probe/helper.js', renderedLength: 1 });
  assert.deepEqual(pruefeBuendel(p.i, p.protokoll), []);
  p.i.buildHilfscode[0].imBuendel = false;
  assert.match(pruefeBuendel(p.i, p.protokoll).join('\n'), /Hilfscodeabgleich: nicht im Inventar/);
});

const jdk = findeJdk();
for (const variante of ['vollständig', 'zusätzlich', 'fehlend', 'Projekt fehlt', 'DTD', 'unbekannte Form', 'compile statt package']) {
  test(`Gradle-Abgleich mit JDK-Parser: ${variante}`, { skip: !jdk.pfad && 'JDK nicht vorhanden' }, () => {
    const p = probe();
    let artefakte = ['org.probe:runtime:3.0.0@jar'];
    if (variante === 'zusätzlich') artefakte.push('org.probe:extra:1.0.0@aar');
    if (variante === 'fehlend') artefakte = [];
    let deps = [...(variante === 'Projekt fehlt' ? [] : [':@@:probe-native::release']), ...artefakte];
    if (variante === 'unbekannte Form') deps.push('unbekannt');
    const art = variante === 'compile statt package' ? 'compile' : 'package';
    const xml = `${variante === 'DTD' ? '<!DOCTYPE dependencies [<!ENTITY x SYSTEM "file:///nicht-lesen">]>' : ''}<dependencies><${art}>${deps.map(name => `<dependency name="${name}"/>`).join('')}</${art}></dependencies>`;
    schreibe(p.ort, 'modell.xml', xml);
    if (variante === 'vollständig') assert.deepEqual(pruefeGradleModell(p.i, join(p.ort, 'modell.xml')), []);
    else scheitert(p, /Gradle-Abgleich|Gradle-Projektabgleich|XML-Quellprüfung/, { gradleModell: join(p.ort, 'modell.xml') });
  });
}
test('CLI: --streng und Generator --pruefen scheitern am Platzhalter bzw. veraltetem Inhalt', () => {
  const p = probe(); p.i.npm[0].status = 'platzhalter'; p.speichern();
  const lauf = spawnSync(process.execPath, [join(wurzel, 'scripts/check-licenses.mjs'), '--json', '--wurzel', p.ort, '--streng'], { encoding: 'utf8' });
  assert.equal(lauf.status, 1);
  assert.match(lauf.stdout, /1 Platzhalter im strengen Modus/);
  const skript = join(p.ort, 'scripts/hinweise-dritter.mjs');
  schreibe(p.ort, 'scripts/hinweise-dritter.mjs', readFileSync(join(wurzel, 'scripts/hinweise-dritter.mjs')));
  const generator = spawnSync(process.execPath, [skript, '--pruefen'], { encoding: 'utf8' });
  assert.equal(generator.status, 0, generator.stderr);
  assert.equal(generator.stdout, '');
  schreibe(p.ort, 'app/src/hinweise-dritter.txt', 'veraltet\n');
  const alt = spawnSync(process.execPath, [skript, '--pruefen'], { encoding: 'utf8' });
  assert.equal(alt.status, 1);
  assert.match(alt.stderr, /Hinweisdatei ist veraltet/);
  const neu = spawnSync(process.execPath, [skript, '--schreiben'], { encoding: 'utf8' });
  assert.equal(neu.status, 0, neu.stderr);
  assert.equal(neu.stdout, '');
  assert.ok(readFileSync(join(p.ort, 'app/src/hinweise-dritter.txt')).equals(erzeugeHinweise(p.ort, p.i)));
});
