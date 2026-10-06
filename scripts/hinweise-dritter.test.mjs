import { rolldown } from 'rolldown';
import { oxcRuntimePlugin } from 'rolldown/experimental';
// Synthetische Offline-Projekte; keine privaten Eingaben und keine Installation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { erzeugeHinweise, gruppen, pruefeHinweisdatei, schreibeHinweise } from './hinweise-dritter.mjs';
import { pruefeProjekt } from './check-licenses.mjs';
import { pruefeBuendel, pruefeGradleModell } from './hinweise-pruefung.mjs';
import { findeJdk } from './werkzeuge.mjs';
import { entschiedeneAusnahmen } from './hinweise-ausnahmen.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad/test-hinweise-dritter');
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
  const i = { formatVersion: 2, apache: { datei: 'LICENSE', sha256: sha(apache) }, npm,
    eingebettet: [{ name: 'Eingebettete Probe', paket: 'alpha', ort: 'node_modules/alpha', quelle: 'distribution.js', lizenz: 'MIT',
      behaelter: { datei: 'distribution.js', sha256: sha(beh) }, wortlaut: 'Originalhinweis der Probe.\n  Einrückung bleibt.\n', status: 'vollstaendig' }],
    buildHilfscode: [], android: { projektmodule: [{ name: 'probe-native', version: '1.0.0', ort: null, versionsbeleg: { art: 'gradle-projekt', datei: 'app/android/probe-native/build.gradle', sha256: sha('versionName \"1.0.0\"\n'), settings: { datei: 'app/android/settings.gradle', sha256: sha("include ':probe-native'\nproject(':probe-native').projectDir = new File('./probe-native/')\n") } }, lizenz: 'MIT', wortlaut: 'Probetext Android.', status: 'vollstaendig' }],
      maven: [{ gruppe: 'org.probe', name: 'runtime', version: '3.0.0', lizenz: 'Apache-2.0', status: 'vollstaendig' }] }, ausnahmen: [] };
  schreibe(ort, 'package.json', root);
  schreibe(ort, 'app/package.json', app);
  schreibe(ort, 'package-lock.json', { lockfileVersion: 3, packages: pakete });
  schreibe(ort, 'LICENSE', apache);
  schreibe(ort, 'NOTICE', 'NOTICE-Probe\n');
  schreibe(ort, 'app/android/probe-native/build.gradle', 'versionName "1.0.0"\n');
  schreibe(ort, 'app/android/settings.gradle', "include ':probe-native'\nproject(':probe-native').projectDir = new File('./probe-native/')\n");
  schreibe(ort, 'app/android/app/build/outputs/apk/release/app-release-unsigned.apk', 'APK-Probe');
  schreibe(ort, 'app/dist/probe.js', 'Probe');
  function speichern() {
    schreibe(ort, 'scripts/hinweise-dritter.json', i);
    schreibe(ort, 'app/src/hinweise-dritter.txt', erzeugeHinweise(ort, i));
  }
  speichern();
  const protokoll = { formatVersion: 2, umgebung: 'client', abgeschlossen: true, cssAssets: [], modulgraph: npm.map(e => `${e.ort}/index.js`), chunks: [{ datei: 'probe.js', groesse: 5, sha256: sha('Probe'), einstieg: true, dynamischerEinstieg: false,
    imports: [], dynamischeImports: [], module: npm.map(e => ({ id: `${e.ort}/index.js`, renderedLength: 10 })) }] };
  return { ort, i, speichern, protokoll };
}
function speichereProtokoll(p) {
  p.protokoll.modulgraph = [...new Set([...p.protokoll.modulgraph, ...p.protokoll.chunks.flatMap(c => c.module.map(m => m.id))])];
  schreibe(p.ort, 'module.json', p.protokoll);
}
function buendel(p) { speichereProtokoll(p); return pruefeBuendel(p.i, p.protokoll, join(p.ort, 'app/dist')); }
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
    speichereProtokoll(p);
    const optionen = { buendel: join(p.ort, 'module.json') };
    if (richtung === 'vollständig') assert.equal(bericht(p, optionen).ok, true);
    else scheitert(p, /abgleich:.*(?:nicht im Inventar|fehlt im Modell)/, optionen);
  });
}
test('Bündelabgleich: verschachtelte Orte werden unterschieden', () => {
  const p = probe(); p.protokoll.chunks[0].module[0].id = 'node_modules/parent/node_modules/alpha/index.js';
  speichereProtokoll(p);
  scheitert(p, /node_modules\/parent\/node_modules\/alpha/, { buendel: join(p.ort, 'module.json') });
});
test('Bündelabgleich: virtuelle Hilfen in beide Richtungen', () => {
  const p = probe();
  p.i.buildHilfscode.push({ paket: 'probe-werkzeug', version: '1.0.0', ort: null, lizenz: 'MIT',
    imBuendel: true, module: ['virtuell:probe/helper.js'], wortlaut: null, status: 'platzhalter' });
  assert.match(buendel(p).join('\n'), /Hilfscodeabgleich: Inventareintrag fehlt/);
  p.protokoll.chunks[0].module.push({ id: 'virtuell:probe/helper.js', renderedLength: 1 });
  assert.deepEqual(buendel(p), []);
  p.i.buildHilfscode[0].imBuendel = false;
  assert.match(buendel(p).join('\n'), /Hilfscodeabgleich: nicht im Inventar/);
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

function hilfe(p, lizenz = 'MIT') {
  const quelle = '// #region \\0@oxc-project+runtime@1.0.0/helpers/esm/decorate.js\n';
  schreibe(p.ort, 'node_modules/werkzeug/hilfe.js', quelle);
  const e = { paket: '@oxc-project/runtime', version: '1.0.0', ort: null, imBuendel: true,
    lizenz, status: 'vollstaendig', wortlaut: 'Hilfscode-Probetext',
    module: ['virtuell:@oxc-project+runtime@1.0.0/helpers/esm/decorate.js'],
    versionsbeleg: { art: 'oxc-modulkennung', datei: 'node_modules/werkzeug/hilfe.js', sha256: sha(quelle) } };
  p.i.buildHilfscode.push(e);
  p.protokoll.chunks[0].module.push({ id: e.module[0], renderedLength: 1 });
  return e;
}

for (const gruppe of ['npm', 'eingebettet', 'buildHilfscode', 'projektmodule', 'maven']) {
  for (const status of ['vollstaendig', 'platzhalter']) test(`Auslieferungslizenz: GPL in ${gruppe}, ${status}, scheitert auch mit Bündel`, () => {
    const p = probe();
    const e = gruppe === 'buildHilfscode' ? hilfe(p) : (p.i[gruppe] ?? p.i.android[gruppe])[0];
    e.lizenz = 'GPL-3.0-or-later'; e.status = status; e.wortlaut = 'Probetext';
    p.speichern(); speichereProtokoll(p);
    scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng: true, buendel: join(p.ort, 'module.json') });
    scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { buendel: join(p.ort, 'module.json') });
  });
}
test('Auslieferungslizenz: gerenderter Hilfscode mit Werkzeugort verwendet ausgeliefert statt entwicklung', () => {
  const p = probe();
  const manifest = { name: 'werkzeug', version: '1.0.0', license: 'MPL-2.0' };
  const root = JSON.parse(readFileSync(join(p.ort, 'package.json'))); root.devDependencies = { werkzeug: '1.0.0' };
  schreibe(p.ort, 'package.json', root);
  const lock = JSON.parse(readFileSync(join(p.ort, 'package-lock.json'))); lock.packages[''] = root;
  lock.packages['node_modules/werkzeug'] = manifest; schreibe(p.ort, 'package-lock.json', lock);
  schreibe(p.ort, 'node_modules/werkzeug/package.json', manifest);
  p.i.buildHilfscode.push({ paket: 'werkzeug', version: '1.0.0', ort: 'node_modules/werkzeug', imBuendel: true,
    lizenz: 'MPL-2.0', status: 'vollstaendig', wortlaut: 'Werkzeug-Probetext', module: ['virtuell:werkzeug/helper.js'] });
  p.protokoll.chunks[0].module.push({ id: 'virtuell:werkzeug/helper.js', renderedLength: 1 });
  p.speichern(); speichereProtokoll(p);
  scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen.*werkzeug/, { streng: true, buendel: join(p.ort, 'module.json') });
});

for (const gruppe of ['maven', 'eingebettet', 'buildHilfscode']) {
  for (const lizenz of ['GPL-3.0-only', 'MIT AND GPL-3.0-only', 'noch zu belegen']) {
    test(`Lizenzübergang: neuer ${gruppe}-Platzhalter mit ${lizenz} scheitert in beiden Modi`, () => {
      const p = probe();
      const e = gruppe === 'buildHilfscode' ? hilfe(p) : (p.i[gruppe] ?? p.i.android[gruppe])[0];
      e.lizenz = lizenz; e.status = 'platzhalter';
      e.lizenzentscheidung = { angabe: lizenz, grund: 'Offene Probe', beleg: { ...p.i.apache } };
      p.speichern();
      for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
    });
  }
}

const bestand = JSON.parse(readFileSync(join(wurzel, 'scripts/hinweise-dritter.json')));

for (const fall of ['fehlender Kopf', 'verkürzter Kopf mit neuem Auszughash', 'verfälschter Auszughash', 'verfälschter Wortlaut']) {
  test(`jsPDF-Bündelkopf: ${fall} scheitert`, () => {
    const i = structuredClone(bestand), e = i.npm.find(e => e.paket === 'jspdf'), q = e.originale[0];
    if (fall === 'fehlender Kopf') { delete e.originale; delete e.wortlaut; }
    if (fall === 'verkürzter Kopf mit neuem Auszughash') {
      q.bis--; const bytes = readFileSync(join(wurzel, q.datei)).subarray(q.von, q.bis);
      q.auszugSha256 = sha(bytes); e.wortlaut = bytes.toString('utf8');
    }
    if (fall === 'verfälschter Auszughash') q.auszugSha256 = '0'.repeat(64);
    if (fall === 'verfälschter Wortlaut') e.wortlaut = e.wortlaut.replace('Kenneth Glassey', 'Probe');
    assert.throws(() => erzeugeHinweise(wurzel, i), /Bündelkopf fehlt|Originalauszug hat abweichenden SHA-256|Wortlaut weicht vom Original/);
  });
}

function kotlinProbe() {
  const p = probe(), e = structuredClone(bestand.android.maven.find(e => e.name === 'kotlin-stdlib'));
  for (const q of [...e.originale, ...e.bestandteile.map(b => b.lizenztext).filter(Boolean)]) schreibe(p.ort, q.datei, readFileSync(join(wurzel, q.datei)));
  p.i.android.maven.push(e); p.speichern();
  return { p, e };
}

test('Apache-Deduplizierung: Kotlin mit LICENSE als Wortlaut behält alle Herkunftssätze und Boost-Text', () => {
  const { p, e } = kotlinProbe();
  e.wortlaut = readFileSync(join(p.ort, 'LICENSE'), 'utf8');
  delete e.originale;
  p.speichern();
  const ausgabe = readFileSync(join(p.ort, 'app/src/hinweise-dritter.txt'), 'utf8');
  for (const b of e.bestandteile) assert.ok(ausgabe.includes(b.wortlaut), b.name);
  const boost = e.bestandteile.find(b => b.lizenz === 'BSL-1.0');
  assert.ok(ausgabe.includes(readFileSync(join(p.ort, boost.lizenztext.datei), 'utf8')));
  assert.equal(ausgabe.split('Boost Software License - Version 1.0').length - 1, 1);
  assert.equal(ausgabe.split('Apache License\n').length - 1, 1);
  for (const streng of [false, true]) assert.equal(bericht(p, { streng }).ok, true, bericht(p, { streng }).fehler.join('\n'));
});

test('Apache-Deduplizierung: Haupttext lässt Zusatzhinweise und separaten Lizenztext weiterhin durch', () => {
  const p = probe(), e = p.i.android.maven[0];
  e.wortlaut = readFileSync(join(p.ort, 'LICENSE'), 'utf8');
  const zusatz = '// Herkunft der Probe\n', lizenztext = 'Separater Lizenztext der Probe\n';
  schreibe(p.ort, 'scripts/zusatz.txt', zusatz);
  schreibe(p.ort, 'scripts/lizenz.txt', lizenztext);
  e.zusatzhinweise = [{ wortlaut: zusatz, originale: [{ datei: 'scripts/zusatz.txt', sha256: sha(zusatz), auszugSha256: sha(zusatz) }] }];
  e.lizenztext = { datei: 'scripts/lizenz.txt', sha256: sha(lizenztext) };
  p.speichern();
  const ausgabe = erzeugeHinweise(p.ort, p.i).toString('utf8');
  assert.ok(ausgabe.includes(zusatz)); assert.ok(ausgabe.includes(lizenztext));
  assert.equal(bericht(p, { streng: true }).ok, true);
});

for (const fall of ['soubok-Zusatz unter GWT', 'GPL-Bestandteil unter GWT']) {
  test(`Inventarform: ${fall} scheitert vor Ausgabe und in beiden Modi`, () => {
    const { p, e } = kotlinProbe(), gwt = e.bestandteile.find(b => b.name === 'GWT-Ableitung');
    if (fall === 'soubok-Zusatz unter GWT') {
      const bmp = structuredClone(bestand.eingebettet.find(b => b.name === 'src/libs/BMPDecoder.js'));
      const [zusatz] = bmp.zusatzhinweise;
      for (const q of zusatz.originale) schreibe(p.ort, q.datei, readFileSync(join(wurzel, q.datei)));
      // Erst belegen, dass der unveränderte Zusatz auf der Hauptebene zulässig ist.
      e.zusatzhinweise = [zusatz]; p.speichern();
      assert.ok(erzeugeHinweise(p.ort, p.i).toString('utf8').includes(zusatz.wortlaut));
      assert.equal(bericht(p, { streng: true }).ok, true);
      delete e.zusatzhinweise; gwt.zusatzhinweise = [zusatz];
    } else gwt.bestandteile = [{ name: 'Probe', lizenz: 'GPL-3.0-or-later' }];
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /nicht vorgesehenes Feld in Bestandteil/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /nicht vorgesehenes Feld in Bestandteil/, { streng });
  });
}

// Zusatzinhalte dürfen nur an Einträgen hängen, die die Auslieferungsprüfung sieht.
for (const [fall, feld] of [
  ['npm außerhalb des Bündels mit GPL-Bestandteil', 'bestandteile'],
  ['npm außerhalb des Bündels mit Zusatzhinweis', 'zusatzhinweise'],
  ['Lockfile-Ausnahme mit GPL-Bestandteil', 'bestandteile'],
  ['Lockfile-Ausnahme mit Zusatzhinweis', 'zusatzhinweise'],
  ['Hilfscode außerhalb des Bündels mit GPL-Bestandteil', 'bestandteile'],
]) {
  test(`Inventarform: ${fall} scheitert vor Ausgabe und in beiden Modi`, () => {
    const p = probe();
    const inhalt = feld === 'bestandteile'
      ? [{ name: 'Probe', lizenz: 'GPL-3.0-or-later', wortlaut: 'Probetext' }]
      : [{ wortlaut: 'Probetext', originale: [{ datei: 'LICENSE', sha256: '0'.repeat(64) }] }];
    let e;
    if (fall.startsWith('npm')) { e = p.i.npm[0]; e.imBuendel = false; }
    else if (fall.startsWith('Hilfscode')) {
      e = { paket: 'helfer', version: '1.0.0', ort: null, imBuendel: false, module: [], lizenz: 'MIT', status: 'vollstaendig', wortlaut: 'Hilfscode-Probe' };
      p.i.buildHilfscode.push(e);
    } else {
      e = { paket: 'gamma', version: '1.0.0', ort: 'node_modules/gamma', grund: 'Probe ohne gerendertes Modul' };
      p.i.ausnahmen.push(e);
    }
    e[feld] = inhalt;
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /Zusatzinhalte nur bei ausgelieferten Einträgen/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /Zusatzinhalte nur bei ausgelieferten Einträgen/, { streng });
  });
}

for (const ebene of ['Bestandteil', 'Zusatzhinweis']) for (const feld of ['bestandteile', 'zusatzhinweise', 'unbekannt']) {
  test(`Inventarform: ${ebene} mit ${feld} scheitert auch bei leerer Verschachtelung`, () => {
    const p = probe(), e = p.i.android.maven[0];
    const zusatz = 'Originalzusatz\n'; schreibe(p.ort, 'scripts/zusatz.txt', zusatz);
    const t = ebene === 'Bestandteil' ? { name: 'Probe', lizenz: 'MIT' }
      : { wortlaut: zusatz, originale: [{ datei: 'scripts/zusatz.txt', sha256: sha(zusatz), auszugSha256: sha(zusatz) }] };
    e[ebene === 'Bestandteil' ? 'bestandteile' : 'zusatzhinweise'] = [t];
    p.speichern(); assert.equal(bericht(p, { streng: true }).ok, true);
    t[feld] = [];
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /nicht vorgesehenes Feld/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /nicht vorgesehenes Feld/, { streng });
  });
}

for (const ebene of ['Inventar', 'Android-Gruppe', 'npm', 'eingebettet', 'buildHilfscode', 'projektmodule', 'maven', 'ausnahmen', 'Originalquelle', 'Herkunftsbeleg']) {
  test(`Inventarform: unbekanntes Feld in ${ebene} scheitert in beiden Modi`, () => {
    const p = probe();
    let t;
    if (ebene === 'Inventar') t = p.i;
    else if (ebene === 'Android-Gruppe') t = p.i.android;
    else if (ebene === 'buildHilfscode') t = hilfe(p);
    else if (ebene === 'ausnahmen') {
      t = { ...p.i.npm.pop(), grund: 'Probe' }; delete t.imBuendel; p.i.ausnahmen.push(t);
    } else if (ebene === 'Originalquelle') {
      t = { ...p.i.apache, auszugSha256: p.i.apache.sha256 }; p.i.eingebettet[0].originale = [t];
    } else if (ebene === 'Herkunftsbeleg') {
      const b = structuredClone(bestand.android.maven.find(e => e.name === 'kotlin-stdlib').bestandteile[0]);
      p.i.android.maven[0].bestandteile = [b]; t = b.herkunftsbeleg;
    } else t = (p.i[ebene] ?? p.i.android[ebene])[0];
    t.unbekannt = 'Probe';
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /nicht vorgesehenes Feld/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /nicht vorgesehenes Feld/, { streng });
  });
}

for (const gruppe of ['npm', 'eingebettet', 'buildHilfscode', 'projektmodule', 'maven']) {
  test(`Auslieferungslizenz: GPL-3.0-or-later im Bestandteil von ${gruppe} scheitert zentral`, () => {
    const p = probe(), e = gruppe === 'buildHilfscode' ? hilfe(p) : (p.i[gruppe] ?? p.i.android[gruppe])[0];
    e.bestandteile = [{ name: 'Probe', lizenz: 'GPL-3.0-or-later' }];
    p.speichern();
    for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
  });
}

for (const name of ['GWT-Ableitung', 'Guava-Ableitung', 'Boost-Ableitung']) {
  test(`Kotlin: fehlender Bestandteil ${name} scheitert in beiden Modi und vor einer Neuerzeugung`, () => {
    const { p, e } = kotlinProbe();
    e.bestandteile = e.bestandteile.filter(b => b.name !== name);
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /Kotlin-Bestandteil fehlt/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /Kotlin-Bestandteil fehlt/, { streng });
  });
  test(`Kotlin: verfälschter Herkunftsauszug ${name} scheitert`, () => {
    const { p, e } = kotlinProbe(); e.bestandteile.find(b => b.name === name).wortlaut += '.';
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /Herkunftsauszug weicht/);
  });
}

for (const fall of ['ohne Text', 'falscher Texthash', 'fehlende Datei', 'veränderte Textbytes']) {
  test(`Kotlin: BSL-1.0 ${fall} scheitert auch mit zugelassener Kennung`, () => {
    const { p, e } = kotlinProbe(), b = e.bestandteile.find(b => b.lizenz === 'BSL-1.0');
    if (fall === 'ohne Text') delete b.lizenztext;
    if (fall === 'falscher Texthash') b.lizenztext.sha256 = '0'.repeat(64);
    if (fall === 'fehlende Datei') rmSync(join(p.ort, b.lizenztext.datei));
    if (fall === 'veränderte Textbytes') schreibe(p.ort, b.lizenztext.datei, 'Boost-Probetext');
    assert.throws(() => erzeugeHinweise(p.ort, p.i), /Boost-Lizenztext|Quelle .*fehlt|abweichenden SHA-256/);
    schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i);
    for (const streng of [false, true]) scheitert(p, /Boost-Lizenztext|Quelle .*fehlt|abweichenden SHA-256/, { streng });
  });
}

test('Kotlin: Herkunftshinweise unter Android, Boost-Text einmal, Apache-Text weiterhin einmal', () => {
  const { p } = kotlinProbe(), text = erzeugeHinweise(p.ort, p.i).toString('utf8');
  const android = text.slice(text.indexOf('Android-Bestandteile'), text.indexOf('Lizenztexte'));
  for (const b of bestand.android.maven.find(e => e.name === 'kotlin-stdlib').bestandteile) assert.ok(android.includes(b.wortlaut));
  assert.equal(text.split('Boost Software License - Version 1.0').length - 1, 1);
  assert.equal(text.split('Apache License\n').length - 1, 1);
  assert.equal(bericht(p, { streng: true }).ok, true, bericht(p).fehler.join('\n'));
});

test('BMPDecoder: soubok-Zusatz ist gebunden, der festgelegte Ausnahme-Wortlaut bleibt unverändert', () => {
  const e = bestand.eingebettet.find(e => e.name === 'src/libs/BMPDecoder.js');
  assert.equal(sha(e.wortlaut), entschiedeneAusnahmen.find(a => a.identitaet.name === e.name).wortlautSha256);
  assert.ok(erzeugeHinweise(wurzel, bestand).toString('utf8').includes('@author soubok'));
  const i = structuredClone(bestand), z = i.eingebettet.find(b => b.name === e.name).zusatzhinweise[0];
  z.wortlaut += 'Probe';
  assert.throws(() => erzeugeHinweise(wurzel, i), /Wortlaut weicht vom Original/);
  z.wortlaut = e.zusatzhinweise[0].wortlaut; z.originale[0].auszugSha256 = '0'.repeat(64);
  assert.throws(() => erzeugeHinweise(wurzel, i), /Originalauszug hat abweichenden SHA-256/);
});

test('fflate: beide weiteren UZIP-Kommentare sind gebunden und wörtlich ausgegeben', () => {
  const e = bestand.npm.find(e => e.paket === 'fflate'), ausgabe = erzeugeHinweise(wurzel, bestand).toString('utf8');
  assert.deepEqual(e.zusatzhinweise.map(z => z.wortlaut), ['// efficient algorithm from UZIP.js', '// more algorithms from UZIP.js']);
  for (const z of e.zusatzhinweise) {
    const q = z.originale[0], bytes = readFileSync(join(wurzel, q.datei));
    assert.equal(sha(bytes), q.sha256); assert.equal(sha(bytes.subarray(q.von, q.bis)), q.auszugSha256);
    assert.equal(bytes.subarray(q.von, q.bis).toString('utf8'), z.wortlaut);
    assert.equal(ausgabe.split(z.wortlaut).length - 1, 1);
  }
});
for (const n of [0, 1]) for (const feld of ['wortlaut', 'auszugSha256']) {
  test(`fflate: Zusatz ${n + 1} mit verändertem ${feld} scheitert`, () => {
    const i = structuredClone(bestand), z = i.npm.find(e => e.paket === 'fflate').zusatzhinweise[n];
    if (feld === 'wortlaut') z.wortlaut += 'Probe'; else z.originale[0].auszugSha256 = '0'.repeat(64);
    assert.throws(() => erzeugeHinweise(wurzel, i), /Wortlaut weicht vom Original|Originalauszug hat abweichenden SHA-256/);
  });
}

test('Entschiedene Ausnahmen: geschlossene Liste mit Identität, Angabe, Beleg, Datum, Entscheidung und Wortlauthash', () => {
  assert.equal(entschiedeneAusnahmen.length, 7);
  assert.equal(sha(JSON.stringify(entschiedeneAusnahmen)), '911812c39c3dc5308b4850737f9d992bb64b04ab4b4c2011dd897ad1999d5522');
  assert.ok(Object.isFrozen(entschiedeneAusnahmen));
  assert.ok(entschiedeneAusnahmen.every(a => Object.isFrozen(a) && Object.isFrozen(a.identitaet) && Object.isFrozen(a.beleg)));
});
function ausnahmenProbe(original) {
  const p = probe(), e = structuredClone(original);
  p.i.eingebettet.push(e);
  for (const q of [e.behaelter, e.lizenzdatei].filter(Boolean)) {
    schreibe(p.ort, e.ort + '/' + q.datei, readFileSync(join(wurzel, e.ort, q.datei)));
  }
  for (const q of [...(e.originale ?? []), ...(e.belege ?? []), e.entschiedeneAusnahme.beleg]) {
    schreibe(p.ort, q.datei, readFileSync(join(wurzel, q.datei)));
  }
  return { p, e };
}
const bestehendeAusnahmen = bestand.eingebettet.filter(e => e.entschiedeneAusnahme);
test('Inventar: 92 vollständige Einträge, keine Übergangsentscheidung, sieben entschiedene Einschränkungen', () => {
  assert.equal(gruppen(bestand).flat().length, 92);
  assert.ok(gruppen(bestand).flat().every(e => e.status === 'vollstaendig' && !e.lizenzentscheidung));
  assert.equal(bestehendeAusnahmen.length, 7);
  const b = pruefeProjekt(wurzel, { streng: true });
  assert.equal(b.ok, true, b.fehler.join('\n'));
  assert.equal(b.zusammenfassung.platzhalter, 0);
  assert.equal(b.zusammenfassung.entschiedeneLizenzen, 7);
  assert.equal(b.zusammenfassung.offeneLizenzen, 0);
  assert.ok(b.hinweise.includes('Entschiedene Einschränkungen der Hinweise Dritter: 7.'));
});
for (const original of bestehendeAusnahmen) {
  test(`Entschiedene Ausnahme: ${original.name} besteht normal und streng`, () => {
    const { p } = ausnahmenProbe(original); p.speichern();
    for (const streng of [false, true]) {
      const b = bericht(p, { streng });
      assert.equal(b.ok, true, b.fehler.join('\n'));
      assert.equal(b.zusammenfassung.entschiedeneLizenzen, 1);
      assert.equal(b.entschiedeneLizenzen[0].angabe, original.lizenz);
    }
  });
  for (const fall of ['Angabe unbekannt', 'Angabe zugelassen', 'Identität', 'Version', 'Belegdatei', 'Beleghash', 'Datum', 'Entscheidung', 'Wortlaut', 'Marker entfernt']) {
    test(`Entschiedene Ausnahme: ${original.name}, geänderte ${fall} scheitert in beiden Modi`, () => {
      const { p, e } = ausnahmenProbe(original);
      if (fall.startsWith('Angabe')) e.entschiedeneAusnahme.angabe = e.lizenz = fall === 'Angabe zugelassen' ? 'MIT' : 'andere Angabe';
      if (fall === 'Identität') e.name += '-anders';
      if (fall === 'Version') e.version = '999.0.0';
      if (fall === 'Belegdatei') e.entschiedeneAusnahme.beleg = { ...p.i.apache };
      if (fall === 'Beleghash') e.entschiedeneAusnahme.beleg.sha256 = '0'.repeat(64);
      if (fall === 'Datum') e.entschiedeneAusnahme.datum = '2026-10-05';
      if (fall === 'Entscheidung') e.entschiedeneAusnahme.entscheidung += ' anders';
      if (fall === 'Wortlaut') { e.wortlaut += ' anders'; delete e.originale; }
      if (fall === 'Marker entfernt') { delete e.entschiedeneAusnahme; e.lizenz = 'MIT'; }
      p.speichern();
      for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
    });
  }
}
for (const gruppe of ['maven', 'eingebettet', 'buildHilfscode']) test(`Entschiedene Ausnahme: Inventar kann die Liste für ${gruppe} nicht erweitern`, () => {
  const p = probe(), e = gruppe === 'buildHilfscode' ? hilfe(p) : (p.i[gruppe] ?? p.i.android[gruppe])[0];
  e.lizenz = 'GPL-3.0-only'; e.wortlaut = 'Probetext'; e.entschiedeneAusnahme = structuredClone(bestehendeAusnahmen[0].entschiedeneAusnahme);
  p.speichern(); for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
});
test('Auslieferungslizenz: unbekannte Angabe ohne Entscheidungsbeleg scheitert auch als Platzhalter', () => {
  const p = probe(); p.i.android.maven[0].lizenz = 'Unbekannt'; p.i.android.maven[0].status = 'platzhalter'; p.speichern();
  scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/);
});

for (const gruppe of ['Hilfscode', 'Projektmodul']) for (const fall of ['Version', 'Identität', 'Beleg fehlt', 'Beleg verändert']) {
  test(`Versionsbeleg: Null-Ort-${gruppe}, ${fall}`, () => {
    const p = probe(); const e = gruppe === 'Hilfscode' ? hilfe(p) : p.i.android.projektmodule[0];
    if (fall === 'Version') e.version = '999.0.0';
    if (fall === 'Identität') { if (gruppe === 'Hilfscode') e.paket = 'fremd'; else e.name = 'fremd'; }
    if (fall === 'Beleg fehlt') delete e.versionsbeleg;
    if (fall === 'Beleg verändert') schreibe(p.ort, e.versionsbeleg.datei, 'verändert');
    if (fall === 'Beleg fehlt') { schreibe(p.ort, 'scripts/hinweise-dritter.json', p.i); scheitert(p, /ohne Versionsbeleg/); }
    else { p.speichern(); scheitert(p, /Identität oder Version|abweichenden SHA-256/); }
  });
}
test('Versionsbeleg: eine abweichende Version im unabhängigen Client-Protokoll scheitert', () => {
  const p = probe(); const e = hilfe(p); p.speichern();
  p.protokoll.chunks[0].module.at(-1).id = e.module[0].replace('@1.0.0/', '@999.0.0/'); speichereProtokoll(p);
  scheitert(p, /Version weicht von Modulkennungen ab/, { buendel: join(p.ort, 'module.json') });
});

for (const id of ['node_modules/fremd/stil.css', 'node_modules/fremd/bild.svg', 'node_modules/fremd/index.js?raw']) {
  test(`Stil-/Asset-Schutz: fremde Stil-/Asset-Kennung trotz null JS-Bytes: ${id}`, () => {
    const p = probe(); p.protokoll.chunks[0].module.push({ id, renderedLength: 0 });
    assert.throws(() => buendel(p), /Stil- oder Asset-Modul/);
  });
  test(`Stil-/Asset-Schutz: fremde Stil-/Asset-Kennung nur im Graphen: ${id}`, () => {
    const p = probe(); p.protokoll.modulgraph.push(id);
    assert.throws(() => buendel(p), /Stil- oder Asset-Modul/);
  });
}
test('Paketzuordnung: Abfrageanhang an einem Modul aus node_modules scheitert geschlossen, auch mit relativem Inhalt', () => {
  const p = probe(); p.protokoll.chunks[0].module[0].id += '?source=relative/node_modules/extra/index.js';
  assert.throws(() => buendel(p), /Stil- oder Asset-Modul/);
});
for (const anhang of ['/node_modules/extra/index.js', '//server/freigabe/modul.js', 'C:/privat/modul.js', 'C:modul.js', '\\\\?\\C:\\privat\\modul.js', '%2Fprivat%2Fmodul.js']) {
  test(`Abfragepfad: absoluter Abfrageinhalt scheitert im Abgleich: ${anhang}`, () => {
    const p = probe(); p.protokoll.chunks[0].module[0].id += '?source=' + anhang;
    assert.throws(() => buendel(p), /Abfrageanhang/);
  });
}

for (const fall of ['erfundene Datei', 'erfundener Import', 'falscher Hash', 'falsche Größe', 'nicht abgeschlossen', 'zusätzliches JS', 'fehlendes CSS']) {
  test(`Artefaktbindung: Artefaktbindung ${fall}`, () => {
    const p = probe(), c = p.protokoll.chunks[0];
    if (fall === 'erfundene Datei') c.datei = 'erfunden.js';
    if (fall === 'erfundener Import') c.imports.push('erfunden.js');
    if (fall === 'falscher Hash') c.sha256 = '0'.repeat(64);
    if (fall === 'falsche Größe') c.groesse++;
    if (fall === 'nicht abgeschlossen') p.protokoll.abgeschlossen = false;
    if (fall === 'zusätzliches JS') schreibe(p.ort, 'app/dist/extra.js', 'Extra');
    if (fall === 'fehlendes CSS') schreibe(p.ort, 'app/dist/probe.css', 'body{}');
    if (['zusätzliches JS', 'fehlendes CSS'].includes(fall)) assert.match(buendel(p).join('\n'), /Ausgabeabgleich: nicht im Inventar/);
    else assert.throws(() => buendel(p), /Bündelabgleich/);
  });
}

for (const fall of ['Wurzelkind', 'Wurzelattribut', 'Packageattribut', 'Dependencyattribut', 'Compileattribut', 'Compilekind']) {
  test(`Gradle-Modell: unbekannte XML-Erweiterung ${fall}`, { skip: !jdk.pfad }, () => {
    const p = probe(); let xml = readFileSync(join(wurzel, 'scripts/pruefdaten/gradle-release-ausschnitt.xml'), 'utf8');
    if (fall === 'Wurzelkind') xml = xml.replace('</dependencies>', '<unbekannt/></dependencies>');
    if (fall === 'Wurzelattribut') xml = xml.replace('<dependencies>', '<dependencies extra="x">');
    if (fall === 'Packageattribut') xml = xml.replace('<package roots=', '<package extra="x" roots=');
    if (fall === 'Dependencyattribut') xml = xml.replace('simpleName="org.probe:runtime"', 'extra="x" simpleName="org.probe:runtime"');
    if (fall === 'Compileattribut') xml = xml.replace('<compile roots=', '<compile extra="x" roots=');
    if (fall === 'Compilekind') xml = xml.replace('</compile>', '<unbekannt/></compile>');
    schreibe(p.ort, 'modell.xml', xml);
    assert.throws(() => pruefeGradleModell(p.i, join(p.ort, 'modell.xml')), /unbekannt/);
  });
}
test('Gradle-Abgleich: wiederverwendete APK und beliebige Modellzeiten beeinflussen den Inhaltsabgleich nicht', { skip: !jdk.pfad }, () => {
  const p = probe(); schreibe(p.ort, 'modell.xml', readFileSync(join(wurzel, 'scripts/pruefdaten/gradle-release-ausschnitt.xml')));
  const datei = join(p.ort, 'modell.xml'), apk = join(p.ort, 'app/android/app/build/outputs/apk/release/app-release-unsigned.apk');
  const jetzt = new Date(); utimesSync(datei, jetzt, jetzt); utimesSync(apk, jetzt, jetzt);
  assert.deepEqual(pruefeGradleModell(p.i, datei), []);
  for (const offset of [-3600_000, 1, 1000]) {
    utimesSync(datei, jetzt, new Date(jetzt.getTime() + offset));
    assert.deepEqual(pruefeGradleModell(p.i, datei), []);
  }
});
test('Gradle-Abgleich: fehlendes Modell scheitert', { skip: !jdk.pfad }, () => {
  const p = probe();
  scheitert(p, /XML-Quellprüfung/, { gradleModell: join(p.ort, 'fehlt.xml') });
});

test('Apache-Text: übernommene zusammengesetzte Lizenzdatei mit Apache wird klar abgelehnt', () => {
  const p = probe(), e = p.i.npm[0]; const bytes = Buffer.concat([Buffer.from('MIT-Probetext\n'), readFileSync(join(p.ort, 'LICENSE'))]);
  e.lizenz = 'MIT AND Apache-2.0'; e.lizenzdatei.sha256 = sha(bytes); schreibe(p.ort, e.ort + '/LICENSE', bytes);
  assert.throws(() => erzeugeHinweise(p.ort, p.i), /Apache-Text in Lizenzdatei.*getrennt/);
});
for (const fall of ['Ausgabedatei', 'Elternordner', 'hängender Link']) {
  test(`Ausgabeort: ${fall} verweist aus der synthetischen Repositorywurzel hinaus`, t => {
    const p = probe(), extern = join(arbeit, 'ausserhalb-' + fall.replaceAll(' ', '-'));
    mkdirSync(extern, { recursive: true }); const ziel = join(extern, 'hinweise-dritter.txt');
    if (fall !== 'hängender Link') writeFileSync(ziel, 'unverändert');
    if (fall === 'Elternordner') { rmSync(join(p.ort, 'app/src'), { recursive: true }); symlinkSync(extern, join(p.ort, 'app/src'), process.platform === 'win32' ? 'junction' : 'dir'); }
    else {
      rmSync(join(p.ort, 'app/src/hinweise-dritter.txt'));
      try { symlinkSync(ziel, join(p.ort, 'app/src/hinweise-dritter.txt')); }
      catch (e) { if (e.code === 'EPERM') return t.skip('Dateisymlink benötigt hier eine Betriebssystemberechtigung. Die Eltern-Junction wird separat geprüft.'); throw e; }
    }
    assert.throws(() => schreibeHinweise(p.ort), /Ausgabeort.*außerhalb/);
    if (fall !== 'hängender Link') assert.equal(readFileSync(ziel, 'utf8'), 'unverändert');
  });
}
test('Nutzerhinweis: Lockfile-Ausnahmen bleiben geprüft, erscheinen aber nicht im Nutzerhinweis', () => {
  const p = probe(), e = p.i.npm.shift();
  p.i.ausnahmen.push({ ort: e.ort, paket: e.paket, version: e.version, lizenz: e.lizenz, grund: 'Kontrollbegründung', status: 'platzhalter' });
  p.i.npm[0].status = 'platzhalter';
  p.speichern(); assert.equal(bericht(p).ok, true);
  const text = erzeugeHinweise(p.ort, p.i).toString('utf8');
  assert.ok(!text.includes('Begründete Lockfile-Ausnahmen')); assert.ok(!text.includes('Kontrollbegründung'));
  assert.ok(!text.includes('Stand: Werkzeuge vorhanden')); assert.ok(!text.includes('PLATZHALTER'));
});

test('Oxc-Herkunft: die vier ausgelieferten virtuellen Originalquellen sind bytegleich zu MIT-lizenzierten Babel-Hilfen', async () => {
  const e = bestand.buildHilfscode.find(e => e.paket === '@oxc-project/runtime');
  const gesehen = new Set();
  const b = await rolldown({ input: 'hinweisprobe', logLevel: 'silent', plugins: [{
    name: 'hinweisprobe',
    resolveId(id) { if (id === 'hinweisprobe') return '\0hinweisprobe'; },
    load(id) { if (id === '\0hinweisprobe') return e.belege.map((q, k) => `import h${k} from '@oxc-project/runtime/helpers/esm/${q.datei.split('/').pop()}'; export {h${k}};`).join('\n'); },
    moduleParsed(info) {
      if (!info.id.includes('@oxc-project')) return;
      const id = 'virtuell:' + info.id.slice(1);
      assert.ok(e.module.includes(id));
      const q = e.belege.find(q => q.datei.endsWith('/' + info.id.split('/').pop()));
      const bytes = readFileSync(join(wurzel, q.datei));
      assert.equal(sha(bytes), q.sha256);
      assert.equal(info.code, bytes.toString('utf8'));
      gesehen.add(id);
    },
  }, oxcRuntimePlugin()] });
  try { await b.generate({ minify: false }); } finally { await b.close(); }
  assert.deepEqual([...gesehen].sort(), [...e.module].sort());
});

const hinweisUeberschriften = ['Im Web-Teil der App enthalten', 'In jsPDF eingebettete Bestandteile', 'In jsPDF-AutoTable eingebettete Bestandteile', 'Vom Build-Werkzeug eingefügter Hilfscode', 'Android-Bestandteile', 'Lizenztexte'];
test('Nutzerhinweis: freigegebene Überschriften in Reihenfolge, ohne doppelte Einleitung oder Kontrolltexte', () => {
  const text = erzeugeHinweise(wurzel, bestand).toString('utf8');
  let vorher = -1;
  for (const titel of hinweisUeberschriften) {
    assert.equal(text.split('\n').filter(z => z === titel).length, 1);
    assert.ok(text.indexOf(titel) > vorher); vorher = text.indexOf(titel);
  }
  for (const s of ['Hinweise zu Komponenten Dritter', 'Diese App enthält Komponenten Dritter.', 'PLATZHALTER', 'Stand: Werkzeuge vorhanden', 'noch zu belegen', 'nicht im aktuellen Bündel', 'node_modules/', 'Entscheidung der Maintainer']) assert.ok(!text.includes(s), s);
  assert.equal(text.split('Die Quelle nennt für diesen Bestandteil keine Lizenz. Wiedergegeben ist der Hinweis aus jsPDF.').length - 1, 3);
  assert.equal(text.split('Apache License\n').length - 1, 1);
});
test('Originalbeleg: Wortlaut und Auszughash werden unabhängig vom Behälter geprüft', () => {
  const p = probe(), e = p.i.eingebettet[0];
  const bytes = Buffer.from('Vorher\r\nCopyright Original\r\nNachher\r\n');
  schreibe(p.ort, 'scripts/original.txt', bytes);
  const von = Buffer.byteLength('Vorher\r\n'), bis = von + Buffer.byteLength('Copyright Original\r\n');
  e.originale = [{ datei: 'scripts/original.txt', sha256: sha(bytes), von, bis, auszugSha256: sha(bytes.subarray(von, bis)) }];
  e.wortlaut = 'Copyright Original\n';
  p.speichern(); assert.equal(bericht(p, { streng: true }).ok, true);
  e.wortlaut += 'anders'; assert.throws(() => erzeugeHinweise(p.ort, p.i), /Wortlaut weicht vom Original/);
  e.wortlaut = 'Copyright Original\n'; e.originale[0].auszugSha256 = '0'.repeat(64);
  assert.throws(() => erzeugeHinweise(p.ort, p.i), /Originalauszug hat abweichenden SHA-256/);
});
test('Android-Zusatzbestandteil: unzulässige Lizenz scheitert zentral in beiden Modi', () => {
  const p = probe(); p.i.android.maven[0].bestandteile = [{name:'Probe', lizenz:'GPL-3.0-only'}];
  p.speichern(); for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
});

test('Entschiedene Ausnahme: zusätzlicher unzulässiger Bestandteil bleibt gesperrt', () => {
  const { p, e } = ausnahmenProbe(bestehendeAusnahmen[0]);
  e.bestandteile = [{ name: 'Probe', lizenz: 'GPL-3.0-only' }];
  p.speichern(); for (const streng of [false, true]) scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng });
});
