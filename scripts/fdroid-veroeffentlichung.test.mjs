// Offline-Vertragsprüfung; sie ersetzt weder Scannerlauf noch APK-Binärabgleich.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { parseDocument, stringify } from 'yaml';

const lesen = (pfad) => readFileSync(new URL(pfad, import.meta.url), 'utf8');
const quelle = lesen('./fdroid/veroeffentlichung/de.baremos.fristenrechner.yml');
const referenz = JSON.parse(lesen('./fdroid/app-referenz.json'));
const releaseCommit = '61e151091bb509240e16ef86d8a0ad04b44e4582';
const zertifikat = new X509Certificate(readFileSync(new URL('../docs/zertifikate/app-signierschluessel.cer', import.meta.url)));
const schluessel = createHash('sha256').update(zertifikat.raw).digest('hex');
const github = 'https://github.com/baremos/fristenrechner';
const bindungen = [
  ['rolldown', 'v1.2.9', 'rolldown/rolldown', 'rolldown_binding', '', 'rolldown/dist/rolldown-binding.linux-x64-gnu.node'],
  ['astro-compiler-rs', 'v0.4.1', 'withastro/compiler-rs', 'astro_napi', ' --features allocator', '@astrojs/compiler-binding/astro.linux-x64-gnu.node'],
  ['satteri', 'satteri-v0.10.5', 'bruits/satteri', 'satteri-napi', '', 'satteri/satteri_napi.linux-x64-gnu.node'],
  ['lightningcss', 'v1.33.0', 'parcel-bundler/lightningcss', 'lightningcss_node', '', 'lightningcss/lightningcss.linux-x64-gnu.node'],
];
const plattformpakete = [
  '@rolldown/binding-linux-x64-gnu', '@astrojs/compiler-binding-linux-x64-gnu',
  '@bruits/satteri-linux-x64-gnu', 'lightningcss-linux-x64-gnu', '@esbuild/linux-x64',
  '@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64',
];
const cordovaArchiv = 'node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz';
const capacitorArchive = ['android-template', 'capacitor-cordova-android-plugins', 'capacitor-cordova-ios-plugins',
  'ios-pods-template', 'ios-spm-template'].map((name) => 'node_modules/@capacitor/cli/assets/' + name + '.tar.gz');
const scannerPfade = [
  'node_modules/@capacitor/cli/assets',
  'node_modules/@astrojs/astro2tsx/astro2tsx.wasm32-wasi.wasm',
  'node_modules/shiki/dist/onig.wasm', 'node_modules/xxhash-wasm/workerd/xxhash.wasm',
];
const sudoBefehle = [
  'set -eu',
  'echo "deb http://deb.debian.org/debian forky main" > /etc/apt/sources.list.d/forky.list',
  'apt-get update',
  'apt-get install -y -t forky nodejs npm esbuild cargo rustc build-essential cmake',
];
const felder = [
  'Categories', 'License', 'AuthorName', 'AuthorWebSite', 'WebSite', 'SourceCode',
  'IssueTracker', 'Changelog', 'AutoName', 'RepoType', 'Repo', 'Binaries', 'AllowedAPKSigningKeys',
  'Builds', 'AutoUpdateMode', 'UpdateCheckMode', 'CurrentVersion', 'CurrentVersionCode',
];
const buildFelder = ['versionName', 'versionCode', 'commit', 'subdir', 'sudo', 'gradle', 'srclibs', 'prebuild', 'scanignore', 'scandelete', 'build'];
const bashVorhanden = spawnSync('bash', ['--version'], { timeout: 10_000 }).status === 0;

function yamlLesen(text) {
  const dokument = parseDocument(text, { version: '1.2', strict: true, uniqueKeys: true });
  assert.deepEqual(dokument.errors.map((fehler) => fehler.message), [], 'Gültiges YAML ohne doppelte Schlüssel');
  return dokument.toJS({ maxAliasCount: 0 });
}

function genaueFelder(objekt, erwartet, name) {
  assert.ok(objekt && typeof objekt === 'object' && !Array.isArray(objekt), name + ': Abbildung erwartet');
  assert.deepEqual(Object.keys(objekt).sort(), [...erwartet].sort(), name + ': genau die vorgesehenen Felder');
}

function srclibPruefen(text, repo) {
  const srclib = yamlLesen(text);
  assert.ok(srclib && typeof srclib === 'object' && !Array.isArray(srclib), 'srclib: Abbildung erwartet');
  assert.ok(Object.keys(srclib).every((feld) => ['RepoType', 'Repo', 'Subdir', 'Prepare'].includes(feld)), 'srclib: nur erlaubte Schlüssel');
  genaueFelder(srclib, ['RepoType', 'Repo'], 'srclib ohne Subdir oder Prepare');
  assert.equal(srclib.RepoType, 'git');
  assert.equal(srclib.Repo, 'https://github.com/' + repo + '.git');
}

function tagMuster(rezept) {
  assert.equal(typeof rezept.UpdateCheckMode, 'string');
  assert.ok(rezept.UpdateCheckMode.startsWith('Tags '), 'Tag-Prüfung mit Muster');
  const muster = rezept.UpdateCheckMode.slice('Tags '.length);
  assert.ok(muster.startsWith('^') && muster.endsWith('$'), 'Tag-Muster muss den vollständigen Namen prüfen');
  const ausdruck = new RegExp(muster);
  for (const tag of ['v0.2.0', 'v1.0.0', 'v24.100.200']) assert.ok(ausdruck.test(tag), 'Versionstag muss passen: ' + tag);
  for (const tag of ['v0.2.0-rc1', 'v1.0.0-beta.2', 'v1.0.0+build.1', '0.2.0', 'release-v0.2.0',
    'v0x2x0', 'v0.2', 'v1.0.0.1', 'main', 'v', 'v1.2.3suffix', 'test/1.0.1-1']) {
    assert.ok(!ausdruck.test(tag), 'Fremder Tag darf nicht passen: ' + tag);
  }
}

function schrittNach(liste, befehl, vorher = -1) {
  const index = liste.indexOf(befehl);
  assert.ok(index > vorher, 'Schritt fehlt oder ist zu früh: ' + befehl);
  assert.equal(liste.lastIndexOf(befehl), index, 'Schritt darf nur einmal vorkommen: ' + befehl);
  return index;
}

function rezeptPruefen(text) {
  assert.doesNotMatch(text, /\$\{?FR_[A-Z_]+|@[A-Z][A-Z0-9_]*@/, 'Keine lokalen Variablen oder Platzhalter');
  assert.doesNotMatch(text, /npm-inventar\.py|npm-bereinigen\.py|fdroid-bereinigung\.json/, 'Keine lokale Inventur oder alte Bereinigung');
  assert.doesNotMatch(text, /ESBUILD_BINARY_PATH/, 'Kein ESBUILD_BINARY_PATH; Debian-Node-Suchpfad verwenden');
  assert.doesNotMatch(text, /--omit(?:=|\s+)optional/, 'Kein --omit=optional; Hinweise Dritter brauchen optionale jsPDF-Pakete');
  assert.doesNotMatch(text, /CARGO_PROFILE_|RUSTUP_|rustup|--no-default-features/, 'Upstream-Profile und Debian-Rust unverändert verwenden');
  const rezept = yamlLesen(text);
  genaueFelder(rezept, felder, 'Rezept');
  assert.deepEqual(rezept.Categories, ['Calculator']);
  assert.equal(rezept.License, 'Apache-2.0');
  assert.equal(rezept.AuthorName, 'BAREMOS IT Dienstleistungs GmbH');
  assert.equal(rezept.AuthorWebSite, 'https://www.baremos.de');
  assert.equal(rezept.WebSite, 'https://www.baremos.de/de/vergabe/fristenrechner/');
  assert.equal(rezept.SourceCode, github);
  assert.equal(rezept.IssueTracker, github + '/issues');
  assert.equal(rezept.Changelog, github + '/releases');
  assert.equal(rezept.AutoName, lesen('../fastlane/metadata/android/de-DE/title.txt').trim());
  assert.equal(rezept.RepoType, 'git');
  assert.equal(rezept.Repo, github + '.git');
  assert.equal(rezept.Binaries, github + '/releases/download/v%v/' + referenz.appId + '_%v_%c.apk');
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
  assert.equal(build.commit, releaseCommit, 'Unveränderter vollständiger Release-Commit 1.0.0');
  assert.equal(build.subdir, 'app/android/app');
  assert.deepEqual(build.gradle, ['yes']);
  assert.deepEqual(build.srclibs, bindungen.map(([name, tag]) => name + '@' + tag), 'Jede srclib mit beschlossenem Tag');
  assert.deepEqual(build.scanignore, [cordovaArchiv], 'scanignore genau das Cordova-Android-Archiv');
  assert.deepEqual(build.scandelete, scannerPfade, 'scandelete nur Capacitor-assets-Ordner und drei WASM-Pfade');
  for (const phase of ['sudo', 'prebuild', 'build']) {
    assert.ok(Array.isArray(build[phase]) && build[phase].length > 0, phase + ': nichtleere Befehlsliste');
    assert.ok(build[phase].every((zeile) => typeof zeile === 'string' && zeile.trim()), phase + ': ausschließlich Befehle als Text');
    assert.equal(build[phase][0], 'set -eu', phase + ': beginnt mit set -eu');
  }
  assert.deepEqual(build.sudo, sudoBefehle, 'Nur die festgelegten Debian-forky-Pakete installieren');
  for (const phase of ['prebuild', 'build']) {
    assert.equal(build[phase][1], 'cd ../../..', phase + ': eigener Wechsel zur App-Repositorywurzel');
    assert.ok(build[phase].includes('export ASTRO_TELEMETRY_DISABLED=1 CI=1'), phase + ': eigene Umgebung');
    assert.doesNotMatch(build[phase].join('\n'), /\bcurl\b|nodejs\.org|\bsha256sum\b|fristenrechner-fdroid/, phase + ': kein alter Node-Download');
    assert.doesNotMatch(build[phase].join('\n'), /\bexport\s+(?:PATH\b|[^\n;]*\sPATH\b)/, phase + ': keine PATH-Exporte');
  }
  assert.doesNotMatch(build.build.join('\n'), /\b(?:curl|wget)\b|\bgit\s+clone\b|\bcargo\s+(?:fetch|generate-lockfile)\b|\bnpm\s+(?:ci|install|i)\b/, 'build ohne Installation oder Netzwerkwerkzeug');
  assert.doesNotMatch(build.prebuild.join('\n'), /app-bauen\.mjs|\bcap\s+(?:copy|sync)\b|\bcargo\s+build\b/, 'prebuild ohne Web-Build, cap copy/sync oder Rust-Build');
  let vor = schrittNach(build.prebuild, 'npm ci --ignore-scripts --no-audit --no-fund');
  vor = schrittNach(build.prebuild, 'rm -rf ' + plattformpakete.map((paket) => 'node_modules/' + paket).join(' '), vor);
  vor = schrittNach(build.prebuild, 'mkdir -p app/dist app/android/app/src/main/assets/public', vor);
  vor = schrittNach(build.prebuild, '(cd app && npx --no-install cap update android)', vor);
  for (const [name] of bindungen) {
    const manifest = '"$$' + name + '$$/Cargo.toml"';
    if (name === 'astro-compiler-rs') vor = schrittNach(build.prebuild, 'cargo generate-lockfile --manifest-path ' + manifest, vor);
    vor = schrittNach(build.prebuild, 'cargo fetch --locked --manifest-path ' + manifest, vor);
  }
  let gebaut = -1;
  for (const [name, , , paket, features] of bindungen) {
    gebaut = schrittNach(build.build, '(cd "$$' + name + '$$" && cargo build --offline --release --locked -p ' + paket + features + ')', gebaut);
  }
  for (const [name, , , paket, , ziel] of bindungen) {
    gebaut = schrittNach(build.build, 'install -m644 "$$' + name + '$$/target/release/lib' + paket.replaceAll('-', '_') + '.so" node_modules/' + ziel, gebaut);
  }
  gebaut = schrittNach(build.build, 'node scripts/app-bauen.mjs --web', gebaut);
  gebaut = schrittNach(build.build, '(cd app && npx --no-install cap copy android)', gebaut);
  schrittNach(build.build, 'node scripts/fdroid/app-vorbereiten.mjs --nach-scanner', gebaut);
  return rezept;
}

function gegenprobe(name, aendern, fehler) {
  test('Gegenprobe: ' + name, () => {
    const rezept = yamlLesen(quelle);
    aendern(rezept);
    assert.throws(() => rezeptPruefen(stringify(rezept)), fehler);
  });
}

function shellPruefen(befehle) {
  // fdroidserver verbindet Skriptfelder mit "; "; Platzhalter werden vorab ersetzt.
  const code = befehle.join('; ').replace(/\$\$([a-z-]+)\$\$/g, '/test/srclibs/$1');
  const p = spawnSync('bash', ['--noprofile', '--norc', '-n'], {
    input: code + '\n', encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, BASH_ENV: '/dev/null', ENV: '/dev/null' },
  });
  assert.equal(p.status, 0, 'Bash-Syntax nach F-Droid-Verkettung: ' + (p.error?.message ?? p.stderr));
}

test('Rezept erfüllt E1–E10 strukturell; Ausführbarkeit und Bytegleichheit sind getrennte Nachweise', () => {
  rezeptPruefen(quelle);
});
test('Vier srclib-Dateien enthalten nur die erlaubten Quellenfelder', () => {
  assert.deepEqual(readdirSync(new URL('./fdroid/veroeffentlichung/srclibs/', import.meta.url)).sort(),
    bindungen.map(([name]) => name + '.yml').sort());
  for (const [name, , repo] of bindungen) srclibPruefen(lesen('./fdroid/veroeffentlichung/srclibs/' + name + '.yml'), repo);
});
test('E7: Hinweise Dritter scheitern ohne scanignore und bestehen mit erhaltenem Cordova-Archiv', () => {
  // Die seit 61e1510 unveränderte Hinweise-Prüfung ausführen; nur die Dateisicht
  // nach den bekannten Scannerfunden simulieren (2.4.2: handleproblem prüft
  // scanignore vor scandelete). Dies ersetzt keinen Scanner- oder Web-Build-Lauf.
  // Keine installierte Datei verschieben oder löschen.
  const build = yamlLesen(quelle).Builds[0];
  const code = String.raw`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const { pruefeHinweisdatei } = await import('./scripts/hinweise-dritter.mjs');
    const { scanignore, scandelete, funde, archiv } = JSON.parse(process.argv[1]);
    const geloeschteDateien = (ausnahmen) => new Set(funde.filter(pfad =>
      !ausnahmen.some(anfang => pfad.startsWith(anfang)) && scandelete.some(anfang => pfad.startsWith(anfang))));
    const wurzel = process.cwd();
    pruefeHinweisdatei(wurzel);
    let geloescht = geloeschteDateien([]);
    assert.deepEqual([...geloescht], funde, 'Ohne Ausnahme gehen alle bekannten Funde verloren');
    const gelesen = new Set();
    const fundFuer = pfad => funde.find(datei => String(pfad).replaceAll('\\', '/').endsWith('/' + datei));
    const original = fs.realpathSync;
    const originalLesen = fs.readFileSync;
    fs.realpathSync = function(pfad, ...args) {
      if (geloescht.has(fundFuer(pfad))) throw new Error('Vom Scanner entfernt');
      return original.call(this, pfad, ...args);
    };
    fs.readFileSync = function(pfad, ...args) {
      const fund = fundFuer(pfad);
      if (geloescht.has(fund)) throw new Error('Vom Scanner entfernt');
      const bytes = originalLesen.call(this, pfad, ...args);
      if (fund) gelesen.add(fund);
      return bytes;
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => pruefeHinweisdatei(wurzel), {
        message: 'Hinweise Dritter: Quelle ' + archiv + ' fehlt, ist nicht lesbar oder liegt außerhalb der Wurzel.',
      });
      geloescht = geloeschteDateien(scanignore);
      assert.deepEqual([...geloescht], funde.filter(pfad => pfad !== archiv),
        'Mit Ausnahme fehlen weiterhin die anderen vier Archive und drei WASM-Dateien');
      assert.doesNotThrow(() => pruefeHinweisdatei(wurzel));
      assert.deepEqual([...gelesen], [archiv], 'Hinweise-Prüfung liest von diesen Funden nur das Cordova-Archiv');
    } finally {
      fs.realpathSync = original;
      fs.readFileSync = originalLesen;
      syncBuiltinESMExports();
    }
  `;
  const lauf = spawnSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify({
    scanignore: build.scanignore, scandelete: build.scandelete,
    funde: [...capacitorArchive, ...scannerPfade.slice(1)], archiv: cordovaArchiv,
  })], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(lauf.status, 0, lauf.error?.message ?? lauf.stdout + lauf.stderr);
});
test('Befehlslisten bleiben nach F-Droid-Verkettung gültige Bash-Syntax; kaputte Syntax scheitert', { skip: !bashVorhanden && 'Bash fehlt' }, () => {
  const build = yamlLesen(quelle).Builds[0];
  for (const phase of ['sudo', 'prebuild', 'build']) shellPruefen(build[phase]);
  assert.throws(() => shellPruefen([...build.build, 'if then']), /Bash-Syntax/);
  assert.throws(() => shellPruefen(["cat <<'ENDE'\nText\nENDE\n", 'true']), /Bash-Syntax/);
});
test('YAML-Gegenproben: fehlerhafte Syntax, doppelte Schlüssel und weitere Dokumente scheitern', () => {
  for (const falsch of [quelle + '\nBuilds: [', quelle + '\nLicense: Apache-2.0\n', quelle + '\n---\nLicense: Apache-2.0\n']) {
    assert.throws(() => rezeptPruefen(falsch), /Gültiges YAML/);
  }
});
for (const feld of ['Unknown', 'Build', 'License', 'Binaries']) {
  test('srclib-Gegenprobe: unerlaubter Schlüssel ' + feld, () => {
    assert.throws(() => srclibPruefen('RepoType: git\nRepo: https://github.com/rolldown/rolldown.git\n' + feld + ': falsch\n', 'rolldown/rolldown'), /nur erlaubte Schlüssel/);
  });
}
test('srclib-Gegenprobe: falsche Quelle, fehlendes RepoType und doppelte Schlüssel', () => {
  for (const text of ['RepoType: git\nRepo: https://example.org/falsch.git\n', 'Repo: https://github.com/rolldown/rolldown.git\n',
    'RepoType: git\nRepoType: git\nRepo: https://github.com/rolldown/rolldown.git\n']) {
    assert.throws(() => srclibPruefen(text, 'rolldown/rolldown'));
  }
});
gegenprobe('fehlendes Feld', (r) => { delete r.License; }, /genau die vorgesehenen Felder/);
gegenprobe('zusätzliches Feld', (r) => { r.Unbekannt = true; }, /genau die vorgesehenen Felder/);
gegenprobe('zusätzlicher Build', (r) => { r.Builds.push(structuredClone(r.Builds[0])); }, /Genau ein Build/);
gegenprobe('Versionsname weicht ab', (r) => { r.Builds[0].versionName = '9.9.9'; });
gegenprobe('Versionscode als Text', (r) => { r.CurrentVersionCode = String(referenz.versionCode); });
gegenprobe('Build-Versionscode weicht ab', (r) => { r.Builds[0].versionCode += 1; });
gegenprobe('aktuelle Version weicht ab', (r) => { r.CurrentVersion = '9.9.9'; });
for (const commit of ['v1.0.0', releaseCommit.slice(0, 7), releaseCommit.toUpperCase(), '0'.repeat(40)]) {
  gegenprobe('abweichender Commit ' + commit, (r) => { r.Builds[0].commit = commit; }, /Release-Commit/);
}
gegenprobe('Gradle yes als boolescher Wert', (r) => { r.Builds[0].gradle = [true]; });
gegenprobe('automatisches Update deaktiviert', (r) => { r.AutoUpdateMode = 'None'; });
gegenprobe('fremdes Zertifikat', (r) => { r.AllowedAPKSigningKeys = ['0'.repeat(64)]; }, /Zertifikatsfingerabdruck/);
gegenprobe('zweites Signierzertifikat', (r) => { r.AllowedAPKSigningKeys.push('0'.repeat(64)); }, /Zertifikatsfingerabdruck/);
gegenprobe('APK-Adresse ohne Versionscode', (r) => { r.Binaries = r.Binaries.replace('_%c', ''); });
gegenprobe('bewegliche APK-Adresse', (r) => { r.Binaries = r.Binaries.replace('download/v%v', 'latest/download'); });
gegenprobe('lokales Repository', (r) => { r.Repo = '@LOKALES_REPOSITORY@'; }, /lokalen Variablen/);
gegenprobe('alte Bereinigung', (r) => { r.Builds[0].prebuild.push('python3 scripts/fdroid/npm-bereinigen.py'); }, /alte Bereinigung/);
gegenprobe('esbuild-Override', (r) => { r.Builds[0].build.push('export ESBUILD_BINARY_PATH=/usr/bin/esbuild'); }, /Kein ESBUILD_BINARY_PATH/);
gegenprobe('optionale Pakete weggelassen', (r) => { r.Builds[0].prebuild[3] += ' --omit=optional'; }, /Kein --omit=optional/);
gegenprobe('Release-Profil übersteuert', (r) => { r.Builds[0].build.push('export CARGO_PROFILE_RELEASE_LTO=off'); }, /Upstream-Profile/);
gegenprobe('falsche Debian-Suite', (r) => { r.Builds[0].sudo = r.Builds[0].sudo.map(s => s.replaceAll('forky', 'trixie')); }, /Debian-forky-Pakete/);
gegenprobe('pkg-config ohne Bedarfsbeleg', (r) => { r.Builds[0].sudo[3] += ' pkg-config'; }, /Debian-forky-Pakete/);
for (const phase of ['sudo', 'prebuild', 'build']) {
  gegenprobe(phase + ' ohne Fehlerabbruch', (r) => { r.Builds[0][phase][0] = 'set -u'; }, /beginnt mit set -eu/);
}
for (const phase of ['prebuild', 'build']) {
  gegenprobe(phase + ' ohne cd', (r) => { r.Builds[0][phase][1] = 'true'; }, /eigener Wechsel/);
  gegenprobe(phase + ' mit PATH-Override', (r) => { r.Builds[0][phase].push('export PATH=/falsch/bin:$PATH'); }, /keine PATH-Exporte/);
}
for (const befehl of ['npm ci', 'npm install foo', 'curl https://example.org', 'wget https://example.org',
  'git clone https://example.org/a.git', 'cargo fetch --locked', 'cargo generate-lockfile']) {
  gegenprobe('Netzwerk/Installation im build: ' + befehl, (r) => { r.Builds[0].build.push(befehl); }, /ohne Installation oder Netzwerkwerkzeug|kein alter Node-Download/);
}
for (const paket of plattformpakete) {
  gegenprobe('Plattformpaket bleibt: ' + paket, (r) => {
    r.Builds[0].prebuild = r.Builds[0].prebuild.map(s => s.replace(' node_modules/' + paket, ''));
  }, /Schritt fehlt/);
}
gegenprobe('scanignore fehlt', (r) => { delete r.Builds[0].scanignore; }, /genau die vorgesehenen Felder/);
gegenprobe('scanignore leer', (r) => { r.Builds[0].scanignore = []; }, /scanignore genau/);
gegenprobe('weiteres scanignore', (r) => { r.Builds[0].scanignore.push(capacitorArchive[0]); }, /scanignore genau/);
gegenprobe('fremder scanignore-Pfad', (r) => { r.Builds[0].scanignore = ['node_modules/anderes.tar.gz']; }, /scanignore genau/);
for (const pfad of capacitorArchive) {
  gegenprobe('Archiv einzeln statt Ordner in scandelete: ' + pfad, (r) => {
    r.Builds[0].scandelete[0] = pfad;
  }, /scandelete nur/);
}
gegenprobe('Archiv zusätzlich in scandelete', (r) => { r.Builds[0].scandelete.push(cordovaArchiv); }, /scandelete nur/);
for (const pfad of ['node_modules', 'node_modules/anderes.wasm', ...scannerPfade]) {
  gegenprobe('scandelete abweichend: ' + pfad, (r) => {
    if (scannerPfade.includes(pfad)) r.Builds[0].scandelete = r.Builds[0].scandelete.filter(p => p !== pfad);
    else r.Builds[0].scandelete.push(pfad);
  }, /scandelete nur/);
}
for (const [name, tag] of bindungen) {
  gegenprobe('srclib ohne Tag: ' + name, (r) => { r.Builds[0].srclibs = r.Builds[0].srclibs.map(s => s === name + '@' + tag ? name : s); }, /srclib mit beschlossenem Tag/);
}
for (const [name, phase, muster] of [
  ['npm ohne ignore-scripts', 'prebuild', '--ignore-scripts'],
  ['fehlendes assets/public', 'prebuild', 'mkdir -p app/dist app/android/app/src/main/assets/public'],
  ['fehlendes cap update', 'prebuild', '(cd app && npx --no-install cap update android)'],
  ['fehlendes Compiler-Lockfile', 'prebuild', 'cargo generate-lockfile'],
  ['Cargo ohne offline', 'build', '--offline'],
  ['Cargo ohne locked', 'build', '--locked'],
  ['Compiler ohne allocator', 'build', '--features allocator'],
  ['fehlender Web-Build', 'build', 'node scripts/app-bauen.mjs --web'],
  ['fehlendes cap copy', 'build', '(cd app && npx --no-install cap copy android)'],
  ['fehlende Nachscanner-Prüfung', 'build', 'node scripts/fdroid/app-vorbereiten.mjs --nach-scanner'],
]) {
  gegenprobe(name, (r) => { r.Builds[0][phase] = r.Builds[0][phase].map(s => s.replace(muster, '')); }, /Schritt fehlt|ausschließlich Befehle/);
}
gegenprobe('Web-Build zurück im prebuild', (r) => { r.Builds[0].prebuild.push('node scripts/app-bauen.mjs --web'); }, /prebuild ohne Web-Build/);
gegenprobe('cap copy vor Web-Build', (r) => {
  const befehle = r.Builds[0].build;
  const copy = befehle.splice(befehle.indexOf('(cd app && npx --no-install cap copy android)'), 1)[0];
  befehle.splice(befehle.indexOf('node scripts/app-bauen.mjs --web'), 0, copy);
}, /Schritt fehlt oder ist zu früh/);
for (const muster of ['^v.*$', '^v[0-9]+.[0-9]+.[0-9]+$', '^v[0-9]+\\.[0-9]+\\.[0-9]+(?:-rc1)?$', 'v[0-9]+\\.[0-9]+\\.[0-9]+']) {
  gegenprobe('zu weites Tag-Muster ' + muster, (r) => { r.UpdateCheckMode = 'Tags ' + muster; }, /Tag-Muster|Fremder Tag/);
}
