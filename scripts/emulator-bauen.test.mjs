// Dateiproben ohne Gradle/ADB; ein Test nutzt JDK und SDK mit einem Testschlüssel.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { baueVarianten, ersetzeEinmal, gegenprobeQuellen, referenzen, signiereRelease } from './emulator/bauen.mjs';
import { innen, schreiber } from './emulator/rahmen.mjs';
import { findeJdk, standardSdk, vorgabe, windows } from './werkzeuge.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(repo, 'scratchpad', 'paket-2.5-c4', 'tmp');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'emulator-bauen-test-'));
test.after(() => {
  assert.ok(innen(realpathSync(basis), realpathSync(arbeit)));
  assert.ok(relative(basis, arbeit).startsWith('emulator-bauen-test-'));
  rmSync(arbeit, { recursive: true, force: true });
});

function schreibe(datei, text) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, text);
}

const vorlage = {
  manifest: '<manifest>\n    <application android:allowBackup="false" android:dataExtractionRules="@xml/data_extraction_rules">\n    </application>\n</manifest>\n',
  gradle: 'android { defaultConfig { applicationId "de.baremos.fristenrechner" } }\n',
  activity: 'package de.baremos.fristenrechner;\nclass MainActivity { void onCreate() { registerPlugin(NavigationssperrePlugin.class); } }\n',
};

function probe() {
  const ort = mkdtempSync(join(arbeit, 'probe-'));
  const wurzel = join(ort, 'quellen');
  const ausgabe = join(ort, 'ausgabe');
  const cache = join(ort, 'vorhandener-cache');
  mkdirSync(ausgabe, { recursive: true });
  schreibe(join(wurzel, 'package-lock.json'), '{"lockfileVersion":3}');
  schreibe(join(wurzel, 'scripts/toolchain.json'), '{"gradle":"8.14.5"}');
  schreibe(join(wurzel, 'app/android/app/src/main/AndroidManifest.xml'), vorlage.manifest);
  schreibe(join(wurzel, 'app/android/app/build.gradle'), vorlage.gradle);
  schreibe(join(wurzel, 'app/android/app/src/main/java/de/baremos/fristenrechner/MainActivity.java'), vorlage.activity);
  schreibe(join(wurzel, 'app/android/app/src/main/assets/capacitor.config.json'), JSON.stringify({ android: { minWebViewVersion: 83 }, server: { errorPath: 'startfehler.html' } }));
  schreibe(join(wurzel, 'app/android/app/src/main/assets/public/startfehler.html'), '<h1>Startfehler</h1>');
  schreibe(join(wurzel, 'app/android/local.properties'), 'ursprüngliche SDK-Angabe');
  schreibe(join(wurzel, 'app/android/.gradle/cache'), 'unverändert');
  schreibe(join(wurzel, 'node_modules/@capacitor/android/capacitor/build.gradle'), 'plugins { id "com.android.library" }');
  for (const p of ['app/android/app/build', 'app/android/build', 'node_modules/@capacitor/android/capacitor/build']) schreibe(join(wurzel, p, 'referenz.txt'), 'unveränderte Referenz');
  schreibe(join(cache, 'wrapper/dists/gradle-8.14.5-bin/verteilung/gradle-8.14.5/lib/gradle-launcher-8.14.5.jar'), 'wird nicht ausgeführt');
  schreibe(join(cache, 'caches/abhaengigkeit.bin'), 'vorhandene Abhängigkeit');
  schreibe(join(cache, 'caches/gesperrt.lock'), 'nicht kopieren');
  schreibe(join(cache, 'caches/gesperrt.lck'), 'nicht kopieren');
  const debugKey = join(ort, 'android/debug.keystore');
  schreibe(debugKey, 'Testdatei, kein Schlüssel');
  const aufrufe = [];
  const ctx = {
    wurzel, ausgabe, sdk: join(ort, 'sdk'), debugKey, java: 'java-ersetzt', apksigner: 'apksigner-ersetzt.jar',
    env: { TEMP: join(ausgabe, 'tmp'), TMP: join(ausgabe, 'tmp'), CI: '1', ASTRO_TELEMETRY_DISABLED: '1' },
    save: schreiber(ausgabe), log() {},
    async command(programm, args, name, optionen) {
      aufrufe.push({ programm, args, name, optionen });
      if (name.startsWith('build-')) {
        assert.equal(readFileSync(join(ausgabe, 'tmp/gradle-home/caches/abhaengigkeit.bin'), 'utf8'), 'vorhandene Abhängigkeit');
        assert.equal(existsSync(join(ausgabe, 'tmp/gradle-home/caches/gesperrt.lock')), false);
        assert.equal(existsSync(join(ausgabe, 'tmp/gradle-home/caches/gesperrt.lck')), false);
        schreibe(join(ausgabe, 'tmp', name.slice(6), 'build/_app/outputs/apk/debug/app-debug.apk'), 'nachgestellte APK');
      }
      return { code: 0, out: 'Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\n' };
    },
  };
  return { ...ctx, ctx, cache, aufrufe };
}

async function mitCache(cache, fn) {
  const vorher = process.env.GRADLE_USER_HOME;
  process.env.GRADLE_USER_HOME = cache;
  try { return await fn(); }
  finally {
    if (vorher === undefined) delete process.env.GRADLE_USER_HOME;
    else process.env.GRADLE_USER_HOME = vorher;
  }
}

test('Vorlagenersatz verlangt genau ein belegtes Vorkommen', () => {
  assert.equal(ersetzeEinmal('eins alt zwei', 'alt', 'neu'), 'eins neu zwei');
  assert.throws(() => ersetzeEinmal('eins zwei', 'alt', 'neu'), /nicht eindeutig/);
  assert.throws(() => ersetzeEinmal('alt alt', 'alt', 'neu'), /nicht eindeutig/);
});

test('Gegenprobe hat andere App-ID, INTERNET, Sicherung und keine Pluginregistrierung', () => {
  const q = gegenprobeQuellen(vorlage);
  assert.match(q.manifest, /android:allowBackup="true"/);
  assert.match(q.manifest, /android.permission.INTERNET/);
  assert.doesNotMatch(q.manifest, /dataExtractionRules|fullBackupContent/);
  assert.match(q.gradle, /applicationId "de.baremos.fristenrechner.gegenprobe"/);
  assert.doesNotMatch(q.activity, /registerPlugin\s*\(/);
  assert.match(q.activity, /package de.baremos.fristenrechner;/);
  assert.match(vorlage.manifest, /allowBackup="false"/);
  assert.throws(() => gegenprobeQuellen({ ...vorlage, manifest: vorlage.manifest.replace('<application', '<application android:fullBackupContent="false"') }), /Sicherungsregeln/);
  assert.throws(() => gegenprobeQuellen({ ...vorlage, activity: `${vorlage.activity}\nregisterPlugin(WeiteresPlugin.class);` }), /Pluginregistrierung/);
});

test('Alle Varianten bauen ausschließlich aus Kopien und mit eigenem Offline-Cache', async () => {
  const p = probe();
  const vorher = referenzen(p.wurzel);
  const result = await mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe', 'fehlerseite', 'ohne-fehlerseite']));
  assert.deepEqual(Object.keys(result), ['gegenprobe', 'fehlerseite', 'ohne-fehlerseite']);
  assert.equal(p.aufrufe.length, 3);
  for (const aufruf of p.aufrufe) {
    const art = aufruf.name.slice(6);
    const projekt = join(p.ausgabe, 'tmp', art, 'android');
    assert.equal(aufruf.optionen.cwd, projekt);
    for (const flag of ['--offline', '--no-daemon', 'clean', 'assembleDebug']) assert.ok(aufruf.args.includes(flag));
    for (const name of ['GRADLE_USER_HOME', 'ANDROID_USER_HOME', 'HOME', 'USERPROFILE']) assert.ok(innen(p.ausgabe, aufruf.optionen.env[name]), name);
    assert.equal(aufruf.optionen.env.TEMP, join(p.ausgabe, 'tmp'));
    assert.equal(aufruf.optionen.env.TMP, join(p.ausgabe, 'tmp'));
    assert.ok(innen(p.ausgabe, aufruf.args[aufruf.args.indexOf('--project-cache-dir') + 1]));
    assert.match(readFileSync(join(projekt, 'ausgaben.gradle'), 'utf8'), /gradle.beforeProject/);
    const settings = readFileSync(join(projekt, 'capacitor.settings.gradle'), 'utf8');
    assert.ok(settings.includes(join(p.ausgabe, 'tmp', art, 'capacitor-android').replaceAll('\\', '/')));
    assert.doesNotMatch(settings, /node_modules/);
    assert.equal(existsSync(join(projekt, '.gradle')), false);
    assert.equal(existsSync(join(projekt, 'app/build/referenz.txt')), false);
    assert.match(readFileSync(join(projekt, 'app/build.gradle'), 'utf8'), /storePassword file\(/);
    assert.doesNotMatch(readFileSync(join(projekt, 'app/build.gradle'), 'utf8'), /storePassword ['"]android/);
    assert.ok(innen(p.ausgabe, result[art]));
  }
  const gegen = join(p.ausgabe, 'tmp/gegenprobe/android/app/src/main');
  assert.match(readFileSync(join(gegen, 'AndroidManifest.xml'), 'utf8'), /allowBackup="true"/);
  for (const art of ['fehlerseite', 'ohne-fehlerseite']) {
    const assets = join(p.ausgabe, 'tmp', art, 'android/app/src/main/assets');
    assert.equal(JSON.parse(readFileSync(join(assets, 'capacitor.config.json'), 'utf8')).android.minWebViewVersion, 84);
    assert.equal(existsSync(join(assets, 'public/startfehler.html')), art === 'fehlerseite');
  }
  assert.equal(existsSync(join(p.ausgabe, 'tmp/gradle-home')), false);
  assert.equal(readFileSync(join(p.cache, 'caches/abhaengigkeit.bin'), 'utf8'), 'vorhandene Abhängigkeit');
  assert.equal(existsSync(join(p.ausgabe, 'tmp/debug-build.txt')), false);
  assert.deepEqual(referenzen(p.wurzel), vorher);
  assert.equal(readFileSync(join(p.wurzel, 'app/android/app/src/main/AndroidManifest.xml'), 'utf8'), vorlage.manifest);
  assert.equal(JSON.parse(readFileSync(join(p.wurzel, 'app/android/app/src/main/assets/capacitor.config.json'), 'utf8')).android.minWebViewVersion, 83);
});

test('Buildfehler entfernt die Kennwortdatei und schreibt den Nachvergleich', async () => {
  const p = probe();
  p.ctx.command = async () => { throw new Error('Nachgestellter Buildfehler'); };
  await assert.rejects(mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe'])), /Nachgestellter Buildfehler/);
  assert.equal(existsSync(join(p.ausgabe, 'tmp/debug-build.txt')), false);
  assert.equal(existsSync(join(p.ausgabe, 'tmp/gradle-home')), false);
  assert.ok(existsSync(join(p.ausgabe, 'build-referenzen-nachher.json')));
});

test('Veränderte Original-Builddatei lässt auch einen scheinbar erfolgreichen Varianten-Build scheitern', async () => {
  const p = probe();
  const command = p.ctx.command;
  p.ctx.command = async (...args) => {
    schreibe(join(p.wurzel, 'node_modules/@capacitor/android/capacitor/build/referenz.txt'), 'verändert');
    return command(...args);
  };
  await assert.rejects(mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe'])), /Build-Ausgaben.*verändert/);
  assert.equal(existsSync(join(p.ausgabe, 'tmp/debug-build.txt')), false);
});

test('Fehlendes entpacktes Gradle wird gemeldet und nicht geladen', async () => {
  const p = probe();
  const fehlend = join(p.cache, 'fehlt');
  await assert.rejects(mitCache(fehlend, () => baueVarianten(p.ctx, ['gegenprobe'])), /Gradle 8.14.5 fehlt/);
  assert.deepEqual(p.aufrufe, []);
});

test('Fehler beim Kopieren des Caches entfernt den schon angelegten Zielordner', async () => {
  const p = probe();
  const cache = realpathSync(join(p.cache, 'caches'));
  assert.ok(innen(realpathSync(arbeit), cache));
  rmSync(cache, { recursive: true });
  await assert.rejects(mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe'])), /ENOENT/);
  assert.equal(existsSync(join(p.ausgabe, 'tmp/gradle-home')), false);
  assert.ok(existsSync(join(p.ausgabe, 'build-referenzen-nachher.json')));
  assert.deepEqual(p.aufrufe, []);
});

test('Release-Signierung verwendet eine gelöschte Kennwortdatei und v2/v3 mit erhaltener Ausrichtung', async () => {
  const p = probe();
  const original = p.ctx.command;
  p.ctx.command = async (...args) => {
    const passwort = join(p.ausgabe, 'tmp/debug-signierung.txt');
    assert.ok(existsSync(passwort));
    assert.equal(readFileSync(passwort, 'utf8'), 'android\nandroid\n');
    return original(...args);
  };
  assert.equal(await signiereRelease(p.ctx, 'eingang.apk'), join(p.ausgabe, 'release-debug-signiert.apk'));
  const sign = p.aufrufe[0].args;
  assert.equal(sign[sign.indexOf('--ks') + 1], p.debugKey);
  for (const flag of ['--v2-signing-enabled', '--v3-signing-enabled', '--alignment-preserved']) assert.equal(sign[sign.indexOf(flag) + 1], 'true');
  for (const flag of ['--ks-pass', '--key-pass']) assert.equal(sign[sign.indexOf(flag) + 1], `file:${join(p.ausgabe, 'tmp/debug-signierung.txt')}`);
  assert.equal(sign.some(arg => /^pass:|^android$/.test(arg)), false);
  assert.equal(p.aufrufe[1].name, 'release-signatur-pruefen');
  assert.equal(p.aufrufe[1].args[p.aufrufe[1].args.indexOf('--min-sdk-version') + 1], '24');
  assert.equal(existsSync(join(p.ausgabe, 'tmp/debug-signierung.txt')), false);
});

for (const fehler of ['signieren', 'pruefen', 'v3-fehlt']) {
  test(`Release-Signierung bereinigt Kennwortdatei bei ${fehler}`, async () => {
    const p = probe();
    p.ctx.command = async (_programm, _args, name) => {
      if (fehler === 'signieren' && name === 'release-signieren') throw new Error('Signierfehler');
      if (fehler === 'pruefen' && name === 'release-signatur-pruefen') throw new Error('Prüffehler');
      return { code: 0, out: 'Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): false\n' };
    };
    await assert.rejects(signiereRelease(p.ctx, 'eingang.apk'), /Signierfehler|Prüffehler|v2\/v3/);
    assert.equal(existsSync(join(p.ausgabe, 'tmp/debug-signierung.txt')), false);
  });
}

async function gebauteProbe() {
  const p = probe();
  await mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe', 'fehlerseite']));
  const ausgabe = join(p.ausgabe, '..', 'weiterer-lauf');
  mkdirSync(ausgabe);
  const ctx = { ...p.ctx, ausgabe, save: schreiber(ausgabe), variantenOrdner: join(p.ausgabe, 'varianten'),
    command: async () => { assert.fail('Wiederverwendung darf kein Werkzeug starten.'); } };
  return { p, ctx };
}

test('Wiederverwendung prüft APK und Quellen, kopiert Belege und braucht keinen Gradle-Cache', async () => {
  const { p, ctx } = await gebauteProbe();
  const result = await mitCache(join(p.cache, 'nicht-vorhanden'), () => baueVarianten(ctx, ['gegenprobe', 'fehlerseite']));
  assert.deepEqual(Object.keys(result), ['gegenprobe', 'fehlerseite']);
  for (const [art, apk] of Object.entries(result)) {
    assert.equal(apk, join(ctx.ausgabe, 'varianten', `${art}.apk`));
    assert.equal(readFileSync(apk, 'utf8'), 'nachgestellte APK');
    const meta = JSON.parse(readFileSync(join(ctx.ausgabe, `build-${art}-apk.json`), 'utf8'));
    assert.equal(meta.format, 1);
    assert.equal(meta.datei, `${art}.apk`);
    assert.match(meta.quellenstand, /^[a-f0-9]{64}$/);
  }
  assert.equal(existsSync(join(ctx.ausgabe, 'tmp/gradle-home')), false);
  assert.ok(existsSync(join(ctx.ausgabe, 'build-wiederverwendung.json')));
});

for (const datei of ['app/android/app/src/main/AndroidManifest.xml',
  'app/android/app/src/main/assets/public/startfehler.html', 'app/android/app/src/main/assets/capacitor.config.json',
  'node_modules/@capacitor/android/capacitor/build.gradle', 'package-lock.json', 'scripts/toolchain.json']) {
  test(`Wiederverwendung verweigert geänderte Quellen: ${datei}`, async () => {
    const { p, ctx } = await gebauteProbe();
    schreibe(join(p.wurzel, datei), 'anderer Quellenstand');
    await assert.rejects(baueVarianten(ctx, ['gegenprobe']), /Quellenstand.*weicht ab/);
    assert.equal(existsSync(join(ctx.ausgabe, 'varianten')), false);
  });
}

for (const [name, aendern, meldung] of [
  ['geänderte APK', (p, m) => schreibe(join(p.ausgabe, 'varianten', m.datei), 'fremde APK'), /Prüfsumme.*weicht ab/],
  ['fehlende APK', (p, m) => rmSync(join(p.ausgabe, 'varianten', m.datei)), /Datei fehlt/],
  ['alte Metadaten ohne Quellenstand', (_p, m) => { delete m.format; delete m.quellenstand; }, /unvollständig/],
  ['Aufstieg im Dateinamen', (_p, m) => { m.datei = '../gegenprobe.apk'; }, /unvollständig/],
  ['andere Variante', (_p, m) => { m.variante = 'fehlerseite'; }, /unvollständig/],
  ['anderer Debugschlüssel', (p) => schreibe(p.debugKey, 'anderer Schlüssel'), /Quellenstand.*weicht ab/],
]) {
  test(`Wiederverwendung lehnt ${name} ab`, async () => {
    const { p, ctx } = await gebauteProbe();
    const datei = join(p.ausgabe, 'varianten/build-gegenprobe-apk.json');
    const meta = JSON.parse(readFileSync(datei, 'utf8'));
    aendern(p, meta);
    schreibe(datei, JSON.stringify(meta));
    await assert.rejects(baueVarianten(ctx, ['gegenprobe']), meldung);
    assert.equal(existsSync(join(ctx.ausgabe, 'varianten')), false);
  });
}

test('Quellenänderung während des Baus verhindert wiederverwendbare Metadaten', async () => {
  const p = probe();
  const command = p.ctx.command;
  p.ctx.command = async (...args) => {
    const r = await command(...args);
    schreibe(join(p.wurzel, 'app/android/app/src/main/assets/public/startfehler.html'), 'gleichzeitig verändert');
    return r;
  };
  await assert.rejects(mitCache(p.cache, () => baueVarianten(p.ctx, ['gegenprobe'])), /während des Baus verändert/);
  assert.equal(existsSync(join(p.ausgabe, 'varianten/build-gegenprobe-apk.json')), false);
  assert.equal(existsSync(join(p.ausgabe, 'tmp/gradle-home')), false);
});

const jdk = findeJdk();
const sdk = process.env.ANDROID_HOME ?? standardSdk();
const endung = windows ? '.exe' : '';
const werkzeuge = join(sdk, 'build-tools', vorgabe.android.buildTools);
const plattform = join(sdk, 'platforms', `android-${vorgabe.android.compileSdk}`, 'android.jar');
const fehlt = !jdk.pfad ? 'JDK 21 fehlt'
  : !['lib/apksigner.jar', `aapt2${endung}`, `zipalign${endung}`].every(p => existsSync(join(werkzeuge, p))) ? 'Build-Tools fehlen'
    : !existsSync(plattform) ? 'Android-Plattform fehlt' : false;

test('Echter Testschlüssel: apksigner scheitert mit einer Kennwortzeile und bestätigt v2/v3 mit zwei Zeilen', { skip: fehlt }, async () => {
  const ort = mkdtempSync(join(arbeit, 'signieren-echt-'));
  const java = join(jdk.pfad, 'bin', `java${endung}`);
  const apksigner = join(werkzeuge, 'lib/apksigner.jar');
  const pass = join(ort, 'test-passwort.txt');
  schreibe(pass, 'android\n');
  const debugKey = join(ort, 'test-debug.p12');
  function run(programm, args) {
    return spawnSync(programm, args, { encoding: 'utf8', windowsHide: true, timeout: 120000,
      env: { ...process.env, TEMP: ort, TMP: ort, TMPDIR: ort } });
  }
  function erfolgreich(programm, args) {
    const r = run(programm, args);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}${r.error ?? ''}`);
    return r;
  }
  erfolgreich(join(jdk.pfad, 'bin', `keytool${endung}`), ['-genkeypair', '-alias', 'androiddebugkey',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2', '-storetype', 'PKCS12', '-keystore', debugKey,
    '-storepass:file', pass, '-dname', 'CN=Test, O=Probe, C=DE']);
  const manifest = join(ort, 'AndroidManifest.xml');
  schreibe(manifest, '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="de.beispiel.emulatorsigniertest">\n<uses-sdk android:minSdkVersion="30" android:targetSdkVersion="36" />\n<application android:label="Signiertest" android:hasCode="false" />\n</manifest>\n');
  const roh = join(ort, 'roh.apk');
  const apk = join(ort, 'unsigniert.apk');
  erfolgreich(join(werkzeuge, `aapt2${endung}`), ['link', '-o', roh, '--manifest', manifest, '-I', plattform, '--version-code', '1', '--version-name', '1.0']);
  erfolgreich(join(werkzeuge, `zipalign${endung}`), ['-p', '4', roh, apk]);
  const ausgabe = join(ort, 'lauf');
  mkdirSync(ausgabe);
  const ctx = { ausgabe, debugKey, java, apksigner,
    async command(programm, args, name) {
      if (name === 'release-signieren') {
        const pw = join(ausgabe, 'tmp/debug-signierung.txt');
        const zwei = readFileSync(pw, 'utf8');
        schreibe(pw, 'android\n');
        const gegenprobe = run(programm, args);
        assert.equal(gegenprobe.status, 2, `${gegenprobe.stdout}${gegenprobe.stderr}`);
        assert.match(gegenprobe.stderr, /Failed to read Key "androiddebugkey" password.*end of file reached/);
        const beleg = readFileSync(join(repo, 'scripts/emulator/fixtures/signierung-kennwort-api30.txt'), 'utf8').replaceAll('\r', '').trim();
        assert.ok(gegenprobe.stderr.replaceAll('\r', '').replace(/end of file reached in [^\n]+/, 'end of file reached in <Kennwortdatei>').includes(beleg));
        schreibe(pw, zwei);
      }
      const r = erfolgreich(programm, args);
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
  };
  const signiert = await signiereRelease(ctx, apk);
  assert.ok(existsSync(signiert));
  erfolgreich(java, ['-jar', apksigner, 'verify', '-Werr', signiert]);
  assert.equal(existsSync(join(ausgabe, 'tmp/debug-signierung.txt')), false);
});
