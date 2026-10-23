// Offline-Prüfung des öffentlichen Rezepts einschließlich absichtlich ungültiger Fassungen.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { parseDocument, stringify } from 'yaml';

const lesen = (pfad) => readFileSync(new URL(pfad, import.meta.url), 'utf8');
const quelle = lesen('./fdroid/veroeffentlichung/de.baremos.fristenrechner.yml');
const referenz = JSON.parse(lesen('./fdroid/app-referenz.json'));
const werkzeuge = JSON.parse(lesen('./toolchain.json'));
const zertifikat = new X509Certificate(readFileSync(new URL('../docs/zertifikate/app-signierschluessel.cer', import.meta.url)));
const schluessel = createHash('sha256').update(zertifikat.raw).digest('hex');
const nodeArchiv = `node-v${werkzeuge.node.referenz}-linux-x64.tar.gz`;
const nodeAdresse = `https://nodejs.org/dist/v${werkzeuge.node.referenz}/${nodeArchiv}`;
const nodeSumme = werkzeuge.node.sha256[nodeArchiv];
const github = 'https://github.com/baremos/fristenrechner';
const felder = [
  'Categories', 'License', 'AuthorName', 'AuthorWebSite', 'WebSite', 'SourceCode',
  'IssueTracker', 'Changelog', 'RepoType', 'Repo', 'Binaries', 'AllowedAPKSigningKeys',
  'Builds', 'AutoUpdateMode', 'UpdateCheckMode', 'CurrentVersion', 'CurrentVersionCode',
];
const buildFelder = ['versionName', 'versionCode', 'commit', 'subdir', 'gradle', 'prebuild', 'build'];
const bashVorhanden = spawnSync('bash', ['--version'], { timeout: 10_000 }).status === 0;

function yamlLesen(text) {
  const dokument = parseDocument(text, { version: '1.2', strict: true, uniqueKeys: true });
  assert.deepEqual(dokument.errors.map((fehler) => fehler.message), [], 'Gültiges YAML ohne doppelte Schlüssel');
  return dokument.toJS({ maxAliasCount: 0 });
}

function genaueFelder(objekt, erwartet, name) {
  assert.ok(objekt && typeof objekt === 'object' && !Array.isArray(objekt), `${name}: Abbildung erwartet`);
  assert.deepEqual(Object.keys(objekt).sort(), [...erwartet].sort(), `${name}: genau die vorgesehenen Felder`);
}

function tagMuster(rezept) {
  assert.equal(typeof rezept.UpdateCheckMode, 'string');
  assert.ok(rezept.UpdateCheckMode.startsWith('Tags '), 'Tag-Prüfung mit Muster');
  const muster = rezept.UpdateCheckMode.slice('Tags '.length);
  assert.ok(muster.startsWith('^') && muster.endsWith('$'), 'Tag-Muster muss den vollständigen Namen prüfen');
  const ausdruck = new RegExp(muster);
  for (const tag of ['v0.2.0', 'v1.0.0', 'v24.100.200']) {
    assert.ok(ausdruck.test(tag), `Versionstag muss passen: ${tag}`);
  }
  for (const tag of ['v0.2.0-rc1', 'v1.0.0-beta.2', 'v1.0.0+build.1', '0.2.0', 'release-v0.2.0',
    'v0x2x0', 'v0.2', 'v1.0.0.1', 'main', 'v', 'v1.2.3suffix', 'test/1.0.1-1']) {
    assert.ok(!ausdruck.test(tag), `Fremder Tag darf nicht passen: ${tag}`);
  }
  return ausdruck;
}

function androidVorbereitungPruefen(befehl) {
  // Nur das tatsächlich geladene Node-Fragment ausführen. Seine Importe werden
  // durch isolierte Doubles ersetzt; weder Capacitor noch ein Build wird gestartet.
  const treffer = /^node --input-type=module -e '\s*([\s\S]*?)\s*'$/.exec(befehl);
  assert.ok(treffer, 'Android-Vorbereitung als eingebettetes Node-Modul');
  const importe = [];
  const code = treffer[1].replace(/^\s*import\s+\{([^}]+)\}\s+from\s+"([^"]+)";\s*$/gm, (_, namen, pfad) => {
    importe.push([pfad, namen.split(',').map((name) => name.trim()).sort()]);
    return '';
  });
  assert.deepEqual(importe, [
    ['node:child_process', ['spawnSync']],
    ['./scripts/app-pruefungen.mjs', ['leseAndroidZustand', 'pruefeGradle', 'pruefeSync']],
    ['./scripts/app-bauen.mjs', ['pruefeBuildHinweise']],
  ], 'Android-Vorbereitung verwendet die echten Prüfmodule');
  const programm = new Script(code);
  const wurzel = '/fdroid-rezept-test';
  const vorher = Object.freeze({ zustand: 'vor-sync' });
  function ausfuehren(sync = { status: 0 }, fehlerBei) {
    const aufrufe = [];
    const pruefung = (name) => {
      aufrufe.push(name);
      return name === fehlerBei ? [`Testfehler aus ${name}`] : [];
    };
    const kontext = {
      process: Object.freeze({ cwd: () => wurzel, execPath: '/test-node' }),
      leseAndroidZustand(optionen) {
        assert.equal(optionen.wurzel, wurzel);
        aufrufe.push('leseAndroidZustand');
        return vorher;
      },
      spawnSync(programm, args, optionen) {
        assert.equal(programm, '/test-node');
        assert.deepEqual([...args], ['../node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
        assert.equal(optionen.cwd, 'app');
        assert.equal(optionen.stdio, 'inherit');
        aufrufe.push('capacitor sync android');
        return sync;
      },
      pruefeSync(optionen) {
        assert.equal(optionen.wurzel, wurzel);
        assert.equal(optionen.vorher, vorher);
        return pruefung('pruefeSync');
      },
      pruefeBuildHinweise(basis, optionen) {
        assert.equal(basis, wurzel);
        assert.equal(optionen.nachAndroidSync, true);
        return pruefung('pruefeBuildHinweise');
      },
      pruefeGradle(optionen) {
        assert.equal(optionen.wurzel, wurzel);
        return pruefung('pruefeGradle');
      },
    };
    let fehler;
    try {
      programm.runInNewContext(kontext, { timeout: 1_000 });
    } catch (error) {
      fehler = error;
    }
    return { aufrufe, fehler };
  }
  const erfolgreich = ausfuehren();
  assert.equal(erfolgreich.fehler, undefined, 'Android-Vorbereitung muss ohne Fehler ausführbar sein');
  assert.deepEqual(erfolgreich.aufrufe, [
    'leseAndroidZustand', 'capacitor sync android', 'pruefeSync', 'pruefeBuildHinweise', 'pruefeGradle',
  ], 'Android-Vorbereitung führt alle Schritte in der vorgesehenen Reihenfolge aus');
  for (const name of ['pruefeSync', 'pruefeBuildHinweise', 'pruefeGradle']) {
    const ergebnis = ausfuehren({ status: 0 }, name);
    assert.ok(ergebnis.fehler?.message.includes(`Testfehler aus ${name}`), `Fehler aus ${name} müssen geworfen werden`);
  }
  for (const sync of [{ status: 23 }, { status: null }, { status: 0, error: new Error('Start fehlgeschlagen') }]) {
    const ergebnis = ausfuehren(sync);
    assert.match(ergebnis.fehler?.message ?? '', /Android-Sync gescheitert/, 'Sync-Fehler müssen geworfen werden');
    assert.deepEqual(ergebnis.aufrufe, ['leseAndroidZustand', 'capacitor sync android'], 'Nach Sync-Fehlern darf keine Prüfung weiterlaufen');
  }
}

function rezeptPruefen(text) {
  assert.doesNotMatch(text, /\$\{?FR_[A-Z_]+|@[A-Z][A-Z0-9_]*@/, 'Keine lokalen Variablen oder Platzhalter');
  assert.doesNotMatch(text, /npm-inventar\.py|scandelete\s*:/, 'Keine lokale Inventur oder pauschale Scanner-Bereinigung');
  const rezept = yamlLesen(text);
  genaueFelder(rezept, felder, 'Rezept');
  assert.deepEqual(rezept.Categories, ['Calculator']);
  assert.equal(rezept.License, 'Apache-2.0');
  assert.equal(rezept.AuthorName, 'BAREMOS IT Dienstleistungs GmbH');
  assert.equal(rezept.AuthorWebSite, 'https://www.baremos.de');
  assert.equal(rezept.WebSite, 'https://www.baremos.de/de/vergabe/fristenrechner/');
  assert.equal(rezept.SourceCode, github);
  assert.equal(rezept.IssueTracker, `${github}/issues`);
  assert.equal(rezept.Changelog, `${github}/releases`);
  assert.equal(rezept.RepoType, 'git');
  assert.equal(rezept.Repo, `${github}.git`);
  assert.equal(rezept.Binaries, `${github}/releases/download/v%v/${referenz.appId}_%v_%c.apk`);
  assert.deepEqual(rezept.AllowedAPKSigningKeys, [schluessel], 'Zertifikatsfingerabdruck aus DER-Inhalt');
  assert.equal(rezept.CurrentVersion, referenz.versionName);
  assert.equal(rezept.CurrentVersionCode, referenz.versionCode);
  assert.equal(rezept.AutoUpdateMode, 'Version');
  tagMuster(rezept);
  assert.ok(Array.isArray(rezept.Builds));
  assert.equal(rezept.Builds.length, 1, 'Genau ein Build');
  const build = rezept.Builds[0];
  genaueFelder(build, buildFelder, 'Build');
  assert.equal(build.versionName, referenz.versionName);
  assert.equal(build.versionCode, referenz.versionCode);
  assert.match(build.commit, /^[0-9a-f]{40}$/, 'Vollständiger Commit mit 40 Hex-Zeichen in Kleinschreibung');
  assert.equal(build.commit.length, 40, 'Vollständiger Commit ohne zusätzliche Zeichen');
  assert.equal(build.subdir, 'app/android/app');
  assert.deepEqual(build.gradle, ['yes']);
  for (const phase of ['prebuild', 'build']) {
    assert.ok(Array.isArray(build[phase]) && build[phase].length > 0, `${phase}: nichtleere Befehlsliste`);
    assert.ok(build[phase].every((zeile) => typeof zeile === 'string' && zeile.trim()), `${phase}: ausschließlich Befehle als Text`);
  }
  const vorbereitung = build.prebuild.join('\n');
  assert.match(vorbereitung, /^set -eu(?:\n|$)/, 'Vorbereitung bricht beim ersten Fehler ab');
  assert.ok(vorbereitung.includes(nodeAdresse), 'Festgelegtes Node-Archiv von nodejs.org');
  assert.ok(vorbereitung.includes(nodeSumme), 'Node-Prüfsumme aus toolchain.json');
  assert.match(vorbereitung, /\bsha256sum\s+(?:--check|-c)\b/, 'Node-Prüfsumme wird geprüft');
  const hashBefehl = build.prebuild.find((s) => /\bsha256sum\b/.test(s));
  assert.doesNotMatch(hashBefehl, /\|\||\btrue\b/, 'Prüfsummenfehler dürfen nicht übergangen werden');
  const pruefung = vorbereitung.indexOf('sha256sum');
  const entpacken = vorbereitung.search(/\btar\s/);
  assert.ok(pruefung > vorbereitung.indexOf(nodeAdresse) && entpacken > pruefung, 'Download, Hashprüfung und Entpacken in dieser Reihenfolge');
  assert.match(vorbereitung, /\bnpm\s+ci\s+[^\n]*--ignore-scripts\b/, 'npm ci ohne Installationsskripte');
  assert.match(vorbereitung, /npm-bereinigen\.py\b/, 'Gezielte Bereinigung');
  const web = build.prebuild.indexOf('node scripts/app-bauen.mjs --web');
  assert.ok(web >= 0, 'Web-Build muss im prebuild ausgeführt werden');
  const android = build.prebuild.findIndex((befehl) => befehl.startsWith('node --input-type=module -e '));
  assert.ok(android > web, 'Android-Vorbereitung muss nach dem Web-Build ausgeführt werden');
  androidVorbereitungPruefen(build.prebuild[android]);
  assert.ok(build.build.includes('node scripts/fdroid/app-vorbereiten.mjs --nach-scanner'), 'Nach-Scanner-Prüfung muss im build ausgeführt werden');
  return rezept;
}

function gegenprobe(name, aendern, fehler) {
  test(`Gegenprobe: ${name}`, () => {
    const rezept = yamlLesen(quelle);
    aendern(rezept);
    assert.throws(() => rezeptPruefen(stringify(rezept)), fehler);
  });
}

function schrittAendern(rezept, phase, muster, ersatz) {
  let anzahl = 0;
  rezept.Builds[0][phase] = rezept.Builds[0][phase].map((befehl) => befehl.replace(muster, () => {
    anzahl += 1;
    return ersatz;
  })).filter((befehl) => befehl.trim());
  assert.equal(anzahl, 1, 'Die Gegenprobe muss genau einen Schritt des geladenen Rezepts verändern');
}

function shellPruefen(befehle) {
  // fdroidserver verbindet diese Liste mit Semikolon und Leerzeichen.
  // Ein Heredoc-Ende mit folgendem Semikolon muss deshalb ebenfalls scheitern.
  const p = spawnSync('bash', ['--noprofile', '--norc', '-n'], {
    input: `${befehle.join('; ')}\n`, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, BASH_ENV: '/dev/null', ENV: '/dev/null' },
  });
  assert.equal(p.status, 0, `Bash-Syntax nach F-Droid-Verkettung: ${p.error?.message ?? p.stderr}`);
}

test('Veröffentlichungsrezept: gültiges YAML, Metadaten, Referenzversion, DER-Zertifikat und gepinnter Node-Download', () => {
  rezeptPruefen(quelle);
});

test('Befehlslisten bleiben nach F-Droid-Verkettung gültige Bash-Syntax; kaputte Befehle und Heredoc scheitern', { skip: !bashVorhanden && 'Bash fehlt' }, () => {
  const build = yamlLesen(quelle).Builds[0];
  shellPruefen(build.prebuild);
  shellPruefen(build.build);
  assert.throws(() => shellPruefen([...build.prebuild, 'if then']), /Bash-Syntax/);
  assert.throws(() => shellPruefen(["cat <<'ENDE'\nText\nENDE\n", 'true']), /Bash-Syntax/);
});

test('Echter Prüfsummenbefehl akzeptiert passende Bytes und bricht bei Abweichung ab', { skip: !bashVorhanden && 'Bash fehlt' }, () => {
  const befehl = yamlLesen(quelle).Builds[0].prebuild.find((s) => /\bsha256sum\b/.test(s));
  const archivPfad = befehl.match(new RegExp(`[^\\s"']*${nodeArchiv.replaceAll('.', '\\.')}\\b`))?.[0];
  assert.ok(archivPfad, 'Archivpfad im Prüfsummenbefehl');
  // /dev/null ist der unveränderliche leere Testinhalt. Nur Pfad und Sollhash
  // werden ersetzt; die Prüf- und Abbruchlogik kommt aus dem echten Rezept.
  const leerHash = createHash('sha256').update('').digest('hex');
  assert.notEqual(nodeSumme, leerHash);
  for (const passend of [true, false]) {
    const pruefung = befehl.replace(archivPfad, '/dev/null').replace(nodeSumme, passend ? leerHash : nodeSumme);
    const p = spawnSync('bash', ['--noprofile', '--norc', '-c', `set -eu; ${pruefung}; printf 'NACH_PRUEFUNG\\n'`], {
      encoding: 'utf8', timeout: 10_000, env: { ...process.env, BASH_ENV: '/dev/null', ENV: '/dev/null' },
    });
    if (passend) {
      assert.equal(p.status, 0, p.error?.message ?? p.stderr);
      assert.match(p.stdout, /NACH_PRUEFUNG/);
    } else {
      assert.notEqual(p.status, 0, 'Abweichende Bytes müssen den Prozess abbrechen');
      assert.doesNotMatch(p.stdout, /NACH_PRUEFUNG/, 'Nach fehlgeschlagener Prüfung darf kein Folgeschritt laufen');
    }
  }
});

test('YAML-Gegenproben: fehlerhafte Syntax, doppelte Schlüssel und weitere Dokumente scheitern', () => {
  for (const falsch of [`${quelle}\nBuilds: [`, `${quelle}\nLicense: Apache-2.0\n`, `${quelle}\n---\nLicense: Apache-2.0\n`]) {
    assert.throws(() => rezeptPruefen(falsch), /Gültiges YAML/);
  }
});

gegenprobe('fehlendes Feld', (r) => { delete r.License; }, /genau die vorgesehenen Felder/);
gegenprobe('zusätzliches Feld', (r) => { r.Unbekannt = true; }, /genau die vorgesehenen Felder/);
gegenprobe('pauschale Bereinigung', (r) => { r.Builds[0].scandelete = ['node_modules']; }, /pauschale Scanner-Bereinigung/);
gegenprobe('zusätzlicher Build', (r) => { r.Builds.push(structuredClone(r.Builds[0])); }, /Genau ein Build/);
gegenprobe('Versionsname weicht ab', (r) => { r.Builds[0].versionName = '9.9.9'; });
gegenprobe('Versionscode als Text', (r) => { r.CurrentVersionCode = String(referenz.versionCode); });
gegenprobe('Build-Versionscode weicht ab', (r) => { r.Builds[0].versionCode += 1; });
gegenprobe('aktuelle Version weicht ab', (r) => { r.CurrentVersion = '9.9.9'; });
gegenprobe('Tagname im Feld commit', (r) => { r.Builds[0].commit = `v${referenz.versionName}`; }, /Vollständiger Commit/);
gegenprobe('siebenstellige Commit-Kurzform', (r) => { r.Builds[0].commit = r.Builds[0].commit.slice(0, 7); }, /Vollständiger Commit/);
gegenprobe('Commit mit Großbuchstaben', (r) => { r.Builds[0].commit = r.Builds[0].commit.toUpperCase(); }, /Vollständiger Commit/);
gegenprobe('Gradle yes als boolescher Wert', (r) => { r.Builds[0].gradle = [true]; });
gegenprobe('automatisches Update deaktiviert', (r) => { r.AutoUpdateMode = 'None'; });
gegenprobe('fremdes Zertifikat', (r) => { r.AllowedAPKSigningKeys = ['0'.repeat(64)]; }, /Zertifikatsfingerabdruck/);
gegenprobe('zweites Signierzertifikat', (r) => { r.AllowedAPKSigningKeys.push('0'.repeat(64)); }, /Zertifikatsfingerabdruck/);
gegenprobe('APK-Adresse ohne Versionscode', (r) => { r.Binaries = r.Binaries.replace('_%c', ''); });
gegenprobe('bewegliche APK-Adresse', (r) => { r.Binaries = r.Binaries.replace('download/v%v', 'latest/download'); });
gegenprobe('lokales Repository', (r) => { r.Repo = '@LOKALES_REPOSITORY@'; }, /lokalen Variablen oder Platzhalter/);
for (const variable of ['$FR_FDROID_LAUF', '${FR_FDROID_INVENTAR}']) {
  gegenprobe(`lokale Variable ${variable}`, (r) => { r.Builds[0].prebuild.push(`echo "${variable}"`); }, /lokalen Variablen oder Platzhalter/);
}
gegenprobe('anderes Node-Archiv', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s.replace(nodeAdresse, nodeAdresse.replace('nodejs.org', 'example.org')));
}, /Festgelegtes Node-Archiv/);
gegenprobe('abweichende Node-Prüfsumme', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s.replace(nodeSumme, '0'.repeat(64)));
}, /Node-Prüfsumme aus toolchain.json/);
gegenprobe('entfernte Node-Prüfsummenprüfung', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s.replace(/sha256sum\s+(?:--check|-c)\b/, 'sha256sum'));
}, /Node-Prüfsumme wird geprüft/);
gegenprobe('Prüfsummenfehler wird übergangen', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s.includes('sha256sum') ? `${s} || true` : s);
}, /Prüfsummenfehler dürfen nicht übergangen werden/);
gegenprobe('Vorbereitung läuft nach Fehlern weiter', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s === 'set -eu' ? 'set -u' : s);
}, /Vorbereitung bricht beim ersten Fehler ab/);
gegenprobe('npm darf Installationsskripte starten', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.map((s) => s.replace('--ignore-scripts', ''));
}, /npm ci ohne Installationsskripte/);
gegenprobe('fehlende gezielte Bereinigung', (r) => {
  r.Builds[0].prebuild = r.Builds[0].prebuild.filter((s) => !s.includes('npm-bereinigen.py'));
}, /Gezielte Bereinigung/);
for (const [phase, name, muster, fehler] of [
  ['prebuild', 'Web-Build', /^node scripts\/app-bauen\.mjs --web$/, /Web-Build/],
  ['build', 'Nach-Scanner-Prüfung', /^node scripts\/fdroid\/app-vorbereiten\.mjs --nach-scanner$/, /Nach-Scanner-Prüfung/],
]) {
  for (const ersatz of ['', 'true']) {
    gegenprobe(`${name} ${ersatz ? 'durch true ersetzt' : 'entfernt'}`, (r) => {
      schrittAendern(r, phase, muster, ersatz);
    }, fehler);
  }
}
gegenprobe('Android-Sync entfernt', (r) => {
  schrittAendern(r, 'prebuild', /^\s*const sync = spawnSync\([^\n]+\);$/m, '');
}, /Android-Vorbereitung muss ohne Fehler/);
gegenprobe('Android-Sync durch true ersetzt', (r) => {
  schrittAendern(r, 'prebuild', /spawnSync\(process\.execPath, \[[^\n]+\], \{[^\n]+\}\)/, 'true');
}, /Android-Vorbereitung muss ohne Fehler/);
for (const name of ['pruefeSync', 'pruefeBuildHinweise', 'pruefeGradle']) {
  gegenprobe(`${name} entfernt, Import bleibt stehen`, (r) => {
    schrittAendern(r, 'prebuild', new RegExp(`\\.\\.\\.${name}\\([^\\n]*?\\)(?:, )?`), '');
  }, /Android-Vorbereitung führt alle Schritte/);
}
gegenprobe('throw bei Prüffehlern durch true ersetzt', (r) => {
  schrittAendern(r, 'prebuild', /if \(fehler\.length\) throw new Error\([^\n]+\);/, 'true;');
}, /Fehler aus pruefeSync müssen geworfen werden/);
gegenprobe('Weitergabe eines fehlerhaften Sync-Status entfernt', (r) => {
  schrittAendern(r, 'prebuild', / \|\| sync\.status !== 0/, '');
}, /Sync-Fehler müssen geworfen werden/);
gegenprobe('Weitergabe eines Sync-Startfehlers entfernt', (r) => {
  schrittAendern(r, 'prebuild', /sync\.error \|\| /, '');
}, /Sync-Fehler müssen geworfen werden/);
for (const muster of ['^v.*$', '^v[0-9]+.[0-9]+.[0-9]+$', '^v[0-9]+\\.[0-9]+\\.[0-9]+(?:-rc1)?$', 'v[0-9]+\\.[0-9]+\\.[0-9]+']) {
  gegenprobe(`zu weites Tag-Muster ${muster}`, (r) => { r.UpdateCheckMode = `Tags ${muster}`; }, /Tag-Muster|Fremder Tag/);
}
