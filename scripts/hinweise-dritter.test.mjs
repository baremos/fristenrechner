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
import { uebergangsangaben } from './hinweise-uebergang.mjs';

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

test('Lizenzübergang: feste Länge und vollständiger Inhalt unabhängig vom Inventar', () => {
  assert.equal(uebergangsangaben.length, 12);
  // Bindet Gruppen, Identitäten, wörtliche Angaben, Belegdateien und SHA-256.
  assert.equal(sha(JSON.stringify(uebergangsangaben)), 'c9f14bd7b056e8c5b1224bdfee3704bd8430f8042977ba9a910444e1f134a07c');
});

const bestand = JSON.parse(readFileSync(join(wurzel, 'scripts/hinweise-dritter.json')));
const bestehendeUebergaenge = [
  ...bestand.eingebettet.filter(e => e.lizenzentscheidung).map(e => ['eingebettet', e]),
  ...bestand.buildHilfscode.filter(e => e.lizenzentscheidung).map(e => ['buildHilfscode', e]),
  ...bestand.android.projektmodule.filter(e => e.lizenzentscheidung).map(e => ['projektmodule', e]),
];
function uebergangsProbe(gruppe, original) {
  const p = probe(), e = structuredClone(original);
  if (gruppe === 'projektmodule') p.i.android.projektmodule = [];
  (p.i[gruppe] ?? p.i.android[gruppe]).push(e);
  for (const q of [e.behaelter, e.lizenzdatei].filter(Boolean)) {
    schreibe(p.ort, e.ort + '/' + q.datei, readFileSync(join(wurzel, e.ort, q.datei)));
  }
  for (const q of [e.versionsbeleg, e.versionsbeleg?.settings, e.lizenzentscheidung.beleg].filter(Boolean)) {
    schreibe(p.ort, q.datei, readFileSync(join(wurzel, q.datei)));
  }
  return { p, e };
}
test('Lizenzübergang: die zwölf bestehenden Angaben werden normal einzeln gezählt', () => {
  assert.equal(bestehendeUebergaenge.length, 12);
  assert.equal(gruppen(bestand).flat().filter(e => e.lizenzentscheidung).length, 12);
});
for (const [gruppe, original] of bestehendeUebergaenge) {
  const name = original.name ?? original.paket;
  test(`Lizenzübergang: ${name} besteht normal und scheitert streng`, () => {
    const { p } = uebergangsProbe(gruppe, original); p.speichern();
    const b = bericht(p);
    assert.equal(b.ok, true, b.fehler.join('\n'));
    assert.equal(b.zusammenfassung.offeneLizenzen, 1);
    assert.equal(b.offeneLizenzen[0].angabe, original.lizenz);
    scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/, { streng: true });
  });
  for (const fall of ['Angabe unbekannt', 'Angabe zugelassen', 'Identität', 'Belegdatei', 'Beleghash']) {
    test(`Lizenzübergang: ${name}, geänderte ${fall} scheitert`, () => {
      const { p, e } = uebergangsProbe(gruppe, original);
      if (fall.startsWith('Angabe')) e.lizenzentscheidung.angabe = e.lizenz = fall === 'Angabe zugelassen' ? 'MIT' : 'andere offene Angabe';
      if (fall === 'Identität') { if (e.name) e.name += '-anders'; else e.paket += '-anders'; }
      if (fall === 'Belegdatei') e.lizenzentscheidung.beleg = { ...p.i.apache };
      if (fall === 'Beleghash') e.lizenzentscheidung.beleg.sha256 = '0'.repeat(64);
      p.speichern();
      scheitert(p, /Lizenz für ausgeliefert unbekannt oder nicht zugelassen/);
    });
  }
}
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
test('Paketzuordnung: Paketzuordnung verwendet nur den Pfad, verschachtelter Abfrageinhalt bleibt ohne Wirkung', () => {
  const p = probe(); p.protokoll.chunks[0].module[0].id += '?source=relative/node_modules/extra/index.js';
  assert.deepEqual(buendel(p), []);
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
  assert.ok(text.includes('Stand: Werkzeuge vorhanden')); assert.ok(text.includes('PLATZHALTER'));
});
