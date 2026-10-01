import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { baueVarianten, gegenprobeQuellen, TESTEMPFANGER, testempfaengerProjekt, variantenQuellenstand } from './emulator/bauen.mjs';
import { innen, schreiber } from './emulator/rahmen.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vorlage = join(repo, 'scripts/emulator/testempfaenger');
const basis = join(repo, 'scratchpad/paket-2.6/tmp');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'testempfaenger-'));
test.after(() => {
  assert.ok(innen(realpathSync(basis), realpathSync(arbeit)));
  rmSync(arbeit, { recursive: true, force: true });
});
function schreibe(datei, text) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, text);
}
function lesen(datei) { return readFileSync(join(vorlage, datei), 'utf8'); }
const java = name => lesen(`app/src/main/java/org/example/dateiprobe/${name}.java`);

function probe() {
  const ort = mkdtempSync(join(arbeit, 'bau-'));
  const wurzel = join(ort, 'quelle');
  const ausgabe = join(ort, 'ausgabe');
  const cache = join(ort, 'cache');
  mkdirSync(ausgabe);
  cpSync(vorlage, join(wurzel, 'scripts/emulator/testempfaenger'), { recursive: true });
  for (const datei of ['build.gradle', 'variables.gradle', 'gradle.properties']) {
    schreibe(join(wurzel, 'app/android', datei), readFileSync(join(repo, 'app/android', datei), 'utf8'));
  }
  schreibe(join(wurzel, 'package-lock.json'), '{}');
  schreibe(join(wurzel, 'scripts/toolchain.json'), '{}');
  schreibe(join(wurzel, 'node_modules/@capacitor/android/capacitor/build.gradle'), '// nicht verwendet');
  schreibe(join(cache, 'wrapper/dists/gradle-8.14.5-bin/cache/gradle-8.14.5/lib/gradle-launcher-8.14.5.jar'), 'nicht ausgeführt');
  schreibe(join(cache, 'caches/vorhanden.bin'), 'vorhanden');
  const debugKey = join(ort, 'debug.keystore');
  schreibe(debugKey, 'Testplatzhalter');
  const aufrufe = [];
  const ctx = { wurzel, ausgabe, debugKey, sdk: join(ort, 'sdk'), java: 'kein-java-prozess',
    env: { TEMP: basis, TMP: basis, CI: '1', ASTRO_TELEMETRY_DISABLED: '1' },
    save: schreiber(ausgabe), log() {},
    async command(programm, args, name, optionen) {
      aufrufe.push({ programm, args, name, optionen });
      assert.equal(name, 'build-testempfaenger');
      schreibe(join(ausgabe, 'tmp/testempfaenger/build/_app/outputs/apk/debug/app-debug.apk'), 'Test-APK');
      return { code: 0, out: '' };
    } };
  return { ctx, cache, aufrufe };
}
async function imCache(p, aktion) {
  const vorher = process.env.GRADLE_USER_HOME;
  process.env.GRADLE_USER_HOME = p.cache;
  try { return await aktion(); }
  finally {
    if (vorher === undefined) delete process.env.GRADLE_USER_HOME;
    else process.env.GRADLE_USER_HOME = vorher;
  }
}

test('Testempfänger hat eigene Paket-ID, nur Provider-Schutz und alle drei MIME-Typen', () => {
  assert.equal(TESTEMPFANGER, 'org.example.dateiprobe');
  const manifest = lesen('app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /uses-permission|android\.permission\.INTERNET|de\.baremos|LAUNCHER/);
  assert.match(manifest, /android:permission="android.permission.MANAGE_DOCUMENTS"/);
  assert.match(manifest, /android:authorities="org.example.dateiprobe.dokumente"/);
  assert.match(manifest, /android:grantUriPermissions="true"/);
  assert.match(manifest, /android:launchMode="singleTask"/);
  assert.match(manifest, /android:taskAffinity="org.example.dateiprobe"/);
  for (const mime of ['application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf']) assert.ok(manifest.includes(mime));
});

test('Frameworkprojekt verwendet Java 17 und API 30 ohne zusätzliche Bibliotheken', () => {
  const gradle = lesen('app/build.gradle');
  assert.match(gradle, /minSdkVersion 30/);
  assert.match(gradle, /sourceCompatibility JavaVersion.VERSION_17/);
  assert.match(gradle, /targetCompatibility JavaVersion.VERSION_17/);
  assert.doesNotMatch(gradle, /implementation\s|api\s+['"]|compileOnly|runtimeOnly/);
  for (const name of ['EmpfangActivity', 'ProbeProvider', 'Belege']) {
    const source = java(name);
    assert.doesNotMatch(source, /androidx\.|com\.getcapacitor|java\.net\.|android\.webkit/);
    assert.match(source, /package org.example.dateiprobe;/);
  }
});

test('Empfangsbeleg sichert Bytes und verlangt für negative Zugriffe eine SecurityException', () => {
  const source = java('EmpfangActivity');
  for (const feld of ['empfang.bin', 'empfang.json', 'name', 'mime', 'groesse', 'sha256', 'schreibenVerweigert', 'nachbarVerweigert', 'projektVerweigert']) assert.ok(source.includes(`"${feld}"`));
  assert.match(source, /while \(\(n = eingang.read\(block\)\) != -1\)/);
  assert.match(source, /zugriff\(uri, "rw"\)/);
  assert.match(source, /catch \(SecurityException verweigert\)[\s\S]*?put\("verweigert", true\)/);
  assert.match(source, /catch \(Exception unklar\)[\s\S]*?put\("verweigert", false\)/);
  assert.match(source, /PRUEFE_WIDERRUF/);
  assert.match(source, /getStringExtra\("uri"\)/);
  assert.match(source, /widerruf.json/);
  assert.match(source, /finish\(\)/);
});

test('Neue Empfänger-Intents werden in eigener Task nacheinander verarbeitet', () => {
  const source = java('EmpfangActivity');
  assert.match(source, /Executors.newSingleThreadExecutor/);
  assert.match(source, /onNewIntent\(Intent intent\)\s*\{\s*super.onNewIntent\(intent\);\s*setIntent\(intent\);\s*auftrag\(intent\);/);
  assert.match(source, /Intent kopie = new Intent\(intent\);\s*io.execute\(\(\) -> pruefen\(kopie\)\)/);
  assert.match(source, /onDestroy\(\)\s*\{\s*io.shutdown\(\);\s*super.onDestroy\(\)/);
});

test('Provider bietet Grenzfälle, falsche Metadaten und einen echten Streamfehler', () => {
  const source = java('ProbeProvider');
  for (const id of ['gueltig', 'grenze', 'zu-gross', 'grenze-unbekannt', 'zu-gross-unbekannt', 'grenze-falsch-klein', 'zu-gross-falsch-klein', 'grenze-falsch-gross', 'leer', 'format', 'utf8', 'schema', 'lesefehler']) assert.ok(source.includes(`"${id}"`));
  assert.match(source, /extends DocumentsProvider/);
  assert.match(source, /Root\.FLAG_LOCAL_ONLY/);
  assert.match(source, /1_048_576/);
  assert.match(source, /GRENZE \+ 1/);
  assert.match(source, /endsWith\("unbekannt"\)\) return null/);
  assert.match(source, /endsWith\("falsch-klein"\)\) return 1L/);
  assert.match(source, /endsWith\("falsch-gross"\)\) return 2L \* GRENZE/);
  assert.match(source, /json.put\("version", 999\)/);
  assert.match(source, /openProxyFileDescriptor/);
  assert.match(source, /FEHLER_AB = 262_144/);
  assert.match(source, /LESEFEHLER_BYTES = 2 \* FEHLER_AB/);
  assert.match(source, /offset >= FEHLER_AB/);
  assert.match(source, /throw new ErrnoException\("dateiprobe", OsConstants.EIO\)/);
  for (const feld of ['angeboteneBytes', 'geleseneBytes', 'streamFehler', 'geschlossen', 'sha256']) assert.ok(source.includes(`"${feld}"`));
  assert.match(source, /fixtures\/basis.json/);
  assert.match(source, /Files.write\(new File\(getContext\(\).getFilesDir\(\), "provider.bin"\).toPath\(\), inhalt\)/);
  assert.ok(source.indexOf('"provider.bin"') < source.indexOf('JSONObject bericht ='));
});

test('Eigenes Testprojekt übernimmt AGP/SDK-Konfiguration aus der App, aber keine App-Quellen', async () => {
  const p = probe();
  const projekt = join(p.ctx.ausgabe, 'projekt');
  await testempfaengerProjekt(p.ctx, projekt);
  for (const datei of ['build.gradle', 'variables.gradle', 'gradle.properties']) assert.equal(readFileSync(join(projekt, datei), 'utf8'), readFileSync(join(p.ctx.wurzel, 'app/android', datei), 'utf8'));
  assert.equal(existsSync(join(projekt, 'capacitor.settings.gradle')), false);
  assert.equal(existsSync(join(projekt, 'app/src/main/java/de/baremos')), false);
  assert.equal(existsSync(join(projekt, 'app/src/main/assets')), false);
});

test('Variantenbau plant Testempfänger offline im Ausgabeordner mit vorhandenem Debugschlüssel', async () => {
  const p = probe();
  const result = await imCache(p, () => baueVarianten(p.ctx, ['testempfaenger']));
  assert.deepEqual(Object.keys(result), ['testempfaenger']);
  assert.equal(p.aufrufe.length, 1);
  const a = p.aufrufe[0];
  assert.ok(a.args.includes('--offline'));
  assert.ok(a.args.includes('assembleDebug'));
  assert.equal(a.optionen.cwd, join(p.ctx.ausgabe, 'tmp/testempfaenger/android'));
  const gradle = readFileSync(join(a.optionen.cwd, 'app/build.gradle'), 'utf8');
  assert.ok(gradle.includes(p.ctx.debugKey.replaceAll('\\', '/')));
  assert.match(gradle, /storePassword file\(/);
  assert.equal(existsSync(join(p.ctx.ausgabe, 'tmp/testempfaenger/capacitor-android')), false);
  assert.equal(existsSync(join(p.ctx.ausgabe, 'tmp/gradle-home')), false);
  assert.equal(existsSync(join(p.ctx.ausgabe, 'tmp/debug-build.txt')), false);
  const meta = JSON.parse(readFileSync(join(p.ctx.ausgabe, 'varianten/build-testempfaenger-apk.json'), 'utf8'));
  assert.equal(meta.variante, 'testempfaenger');
  assert.match(meta.sha256, /^[a-f0-9]{64}$/);
});

test('Testquellen gehören zum Quellenstand und verhindern veraltete Varianten-Wiederverwendung', async () => {
  const p = probe();
  await imCache(p, () => baueVarianten(p.ctx, ['testempfaenger']));
  const vorher = variantenQuellenstand(p.ctx);
  schreibe(join(p.ctx.wurzel, 'scripts/emulator/testempfaenger/app/src/main/java/org/example/dateiprobe/Belege.java'), '// verändert');
  assert.notEqual(variantenQuellenstand(p.ctx), vorher);
  p.ctx.variantenOrdner = join(p.ctx.ausgabe, 'varianten');
  await assert.rejects(baueVarianten(p.ctx, ['testempfaenger']), /Quellenstand.*weicht ab/);
  assert.equal(p.aufrufe.length, 1);
});

test('Gegenprobe behält in den tatsächlichen C2-Quellen das Dateiablauf-Plugin', () => {
  const quelle = {
    manifest: readFileSync(join(repo, 'app/android/app/src/main/AndroidManifest.xml'), 'utf8'),
    gradle: readFileSync(join(repo, 'app/android/app/build.gradle'), 'utf8'),
    activity: readFileSync(join(repo, 'app/android/app/src/main/java/de/baremos/fristenrechner/MainActivity.java'), 'utf8'),
  };
  const result = gegenprobeQuellen(quelle);
  assert.equal(result.activity, quelle.activity.replace('registerPlugin(NavigationssperrePlugin.class);', ''));
  assert.match(result.activity, /registerPlugin\(DateiablaufPlugin.class\)/);
});
