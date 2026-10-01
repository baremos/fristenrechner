// Ausschließlich Kopien im Ausgabeordner bauen. Der normale App-Build bleibt unberührt.
import { cp, mkdir } from 'node:fs/promises';
import { copyFileSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dateiNoetig, innen, sha256 } from './rahmen.mjs';
import { ohneGradleKommentare } from '../app-pruefungen.mjs';

const groovy = value => `'${value.replaceAll('\\', '/').replaceAll("'", "\\'")}'`;
export const TESTEMPFANGER = 'org.example.dateiprobe';
const varianten = ['gegenprobe', 'fehlerseite', 'ohne-fehlerseite', 'testempfaenger'];
const ignoriert = new Set(['build', '.gradle', '.idea', 'local.properties', '.git']);
const kopieren = p => !ignoriert.has(basename(p));

function pruefeArten(arten) {
  if (!Array.isArray(arten) || new Set(arten).size !== arten.length || arten.some(art => !varianten.includes(art))) throw new Error('Unbekannte oder doppelte Build-Variante.');
}

// Erfasst auch uncommittete Änderungen, erzeugte Web-Assets und Capacitor-Quellen.
// Der Inhalt der Schlüsseldatei bleibt außerhalb der Metadaten.
export function variantenQuellenstand(ctx) {
  const daten = {};
  function walk(p, name) {
    if (!kopieren(p)) return;
    const stat = lstatSync(p);
    if (stat.isDirectory()) {
      for (const kind of readdirSync(p).sort()) walk(join(p, kind), `${name}/${kind}`);
    } else if (stat.isFile()) daten[name] = sha256(p);
    else throw new Error('Verknüpfung in den Variantenquellen.');
  }
  for (const p of ['app/android', 'node_modules/@capacitor/android/capacitor']) walk(join(ctx.wurzel, p), p);
  const testquelle = 'scripts/emulator/testempfaenger';
  if (existsSync(join(ctx.wurzel, testquelle))) walk(join(ctx.wurzel, testquelle), testquelle);
  for (const p of ['package-lock.json', 'scripts/toolchain.json']) {
    dateiNoetig(join(ctx.wurzel, p));
    daten[p] = sha256(join(ctx.wurzel, p));
  }
  dateiNoetig(ctx.debugKey);
  daten.rezept = sha256(fileURLToPath(import.meta.url));
  daten.debugSignierung = sha256(ctx.debugKey);
  return createHash('sha256').update(JSON.stringify(daten)).digest('hex');
}

function sichereMetadaten(ctx, ordner, art, apk, quellenstand) {
  const meta = { format: 1, variante: art, datei: `${art}.apk`, sha256: sha256(apk), quellenstand };
  writeFileSync(join(ordner, `build-${art}-apk.json`), `${JSON.stringify(meta, null, 2)}\n`);
  ctx.save(`build-${art}-apk.json`, meta);
}

export async function pruefeVarianten(ctx, arten, ordner) {
  pruefeArten(arten);
  const quelle = realpathSync(resolve(ordner));
  const quellenstand = variantenQuellenstand(ctx);
  const geprueft = {};
  for (const art of arten) {
    const metaDatei = join(quelle, `build-${art}-apk.json`);
    dateiNoetig(metaDatei);
    if (!lstatSync(metaDatei).isFile()) throw new Error('Variantenmetadaten dürfen keine Verknüpfung sein.');
    const meta = JSON.parse(readFileSync(metaDatei, 'utf8'));
    if (meta.format !== 1 || meta.variante !== art || meta.datei !== `${art}.apk` || !/^[0-9a-f]{64}$/.test(meta.sha256 ?? '')) throw new Error(`Variantenmetadaten für ${art} sind unvollständig oder unbekannt.`);
    if (meta.quellenstand !== quellenstand) throw new Error(`Quellenstand der Variante ${art} weicht ab; Varianten neu bauen.`);
    const apk = join(quelle, meta.datei);
    dateiNoetig(apk);
    if (!lstatSync(apk).isFile() || !innen(quelle, realpathSync(apk))) throw new Error('Varianten-APK liegt nicht als Datei im Variantenordner.');
    if (sha256(apk) !== meta.sha256) throw new Error(`Prüfsumme der Variante ${art} weicht ab.`);
    geprueft[art] = { apk, meta };
  }
  const ziel = join(ctx.ausgabe, 'varianten');
  await mkdir(ziel, { recursive: true });
  const ergebnis = {};
  for (const [art, { apk, meta }] of Object.entries(geprueft)) {
    const datei = join(ziel, `${art}.apk`);
    if (resolve(apk) !== resolve(datei)) copyFileSync(apk, datei);
    if (sha256(datei) !== meta.sha256) throw new Error(`Prüfsumme der kopierten Variante ${art} weicht ab.`);
    sichereMetadaten(ctx, ziel, art, datei, quellenstand);
    ergebnis[art] = datei;
  }
  if (variantenQuellenstand(ctx) !== quellenstand) throw new Error('Variantenquellen wurden während der Wiederverwendung verändert.');
  ctx.log(`Verwende ${arten.length} geprüfte Varianten; Quellenstand und APK-Prüfsummen stimmen überein.`);
  ctx.save('build-wiederverwendung.json', { varianten: arten, quellenstand });
  return ergebnis;
}

export function ersetzeEinmal(text, alt, neu) {
  if (text.split(alt).length !== 2) throw new Error(`Vorlage nicht eindeutig: ${alt}`);
  return text.replace(alt, neu);
}

export function gegenprobeQuellen({ manifest, gradle, activity }) {
  manifest = ersetzeEinmal(manifest, 'android:allowBackup="false"', 'android:allowBackup="true"');
  manifest = ersetzeEinmal(manifest, 'android:dataExtractionRules="@xml/data_extraction_rules"', '');
  manifest = ersetzeEinmal(manifest, '    <application', '    <uses-permission android:name="android.permission.INTERNET" />\n    <application');
  gradle = ersetzeEinmal(gradle, 'applicationId "de.baremos.fristenrechner"', 'applicationId "de.baremos.fristenrechner.gegenprobe"');
  activity = ersetzeEinmal(activity, 'registerPlugin(NavigationssperrePlugin.class);', '');
  const registrierungen = [...ohneGradleKommentare(activity).matchAll(/\bregisterPlugin\s*\(([^)]*)\)/g)].map(m => m[1].replace(/\s/g, ''));
  if (/android:(fullBackupContent|dataExtractionRules)=/.test(manifest) || registrierungen.length !== 1 || registrierungen[0] !== 'DateiablaufPlugin.class') throw new Error('Gegenprobe enthält noch Sicherungsregeln oder abweichende Pluginregistrierungen.');
  return { manifest, gradle, activity };
}

// Das Testprojekt verwendet ausschließlich das Android-Framework. AGP und SDK
// stammen aus der vorhandenen App-Vorlage; kein weiterer Maven-Baustein ist nötig.
export async function testempfaengerProjekt(ctx, projekt) {
  const quelle = join(ctx.wurzel, 'scripts/emulator/testempfaenger');
  for (const p of ['settings.gradle', 'app/build.gradle', 'app/src/main/AndroidManifest.xml']) dateiNoetig(join(quelle, p));
  await cp(quelle, projekt, { recursive: true, dereference: true, filter: kopieren });
  for (const p of ['build.gradle', 'variables.gradle', 'gradle.properties']) {
    dateiNoetig(join(ctx.wurzel, 'app/android', p));
    copyFileSync(join(ctx.wurzel, 'app/android', p), join(projekt, p));
  }
}

function baumHash(wurzel) {
  const daten = {};
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) daten[relative(wurzel, p).replaceAll('\\', '/')] = sha256(p);
      else throw new Error('Verknüpfung in einem geschützten Build-Ordner.');
    }
  }
  walk(wurzel);
  return daten;
}

export function referenzen(wurzel) {
  return Object.fromEntries(['app/android/app/build', 'app/android/build', 'node_modules/@capacitor/android/capacitor/build']
    .map(p => [p, baumHash(join(wurzel, p))]));
}

function gradleLauncher(cache) {
  const basis = join(cache, 'wrapper/dists');
  const treffer = [];
  function scan(p, tiefe) {
    if (!existsSync(p) || tiefe > 5) return;
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const n = join(p, e.name);
      if (e.isFile() && e.name === 'gradle-launcher-8.14.5.jar') treffer.push(n);
      else if (e.isDirectory()) scan(n, tiefe + 1);
    }
  }
  scan(basis, 0);
  if (!treffer.length) throw new Error('Entpacktes Gradle 8.14.5 fehlt im vorhandenen Cache. Der Emulatorlauf lädt nichts herunter.');
  return treffer.sort()[0];
}

export async function signiereRelease(ctx, eingang) {
  const datei = join(ctx.ausgabe, 'release-debug-signiert.apk');
  const passwort = join(ctx.ausgabe, 'tmp', 'debug-signierung.txt');
  await mkdir(join(ctx.ausgabe, 'tmp'), { recursive: true });
  dateiNoetig(ctx.debugKey);
  // Öffentlich bekannter Standard des Android-Debugschlüssels, nie als Prozessargument.
  // apksigner liest dieselbe Datei fortlaufend: je eine Zeile für Store und Key.
  writeFileSync(passwort, 'android\nandroid\n', { mode: 0o600 });
  try {
    await ctx.command(ctx.java, ['-jar', ctx.apksigner,
      'sign', '--ks', ctx.debugKey, '--ks-key-alias', 'androiddebugkey',
      '--ks-pass', `file:${passwort}`, '--key-pass', `file:${passwort}`,
      '--v1-signing-enabled', 'false', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
      '--v4-signing-enabled', 'false', '--alignment-preserved', 'true', '--out', datei, eingang], 'release-signieren');
    // Ab API 24 prüfen, damit apksigner neben v3 auch die vorhandene v2-Signatur prüft.
    const r = await ctx.command(ctx.java, ['-jar', ctx.apksigner, 'verify', '--verbose', '--print-certs', '--min-sdk-version', '24', datei], 'release-signatur-pruefen');
    if (!/Verified using v2 scheme[^\r\n]*: true/.test(r.out) || !/Verified using v3 scheme[^\r\n]*: true/.test(r.out)) throw new Error('v2/v3-Signatur nicht bestätigt.');
    return datei;
  } finally { rmSync(passwort, { force: true }); }
}

export async function baueVarianten(ctx, arten) {
  pruefeArten(arten);
  if (!arten.length) return {};
  if (ctx.variantenOrdner) return pruefeVarianten(ctx, arten, ctx.variantenOrdner);
  const original = referenzen(ctx.wurzel);
  ctx.save('build-referenzen-vorher.json', original);
  const quellenstand = variantenQuellenstand(ctx);
  const privat = join(ctx.ausgabe, 'tmp');
  const cacheQuelle = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const launcher = gradleLauncher(cacheQuelle);
  const cache = join(privat, 'gradle-home');
  const password = join(privat, 'debug-build.txt');
  const ergebnis = {};
  try {
    await mkdir(cache, { recursive: true });
    ctx.log('Kopiere vorhandenen Gradle-Cache; Varianten werden offline im Ausgabeordner gebaut.');
    // Eigenes GRADLE_USER_HOME vermeidet selbst Cache-/Daemon-Schreibzugriffe im Benutzerprofil.
    await cp(join(cacheQuelle, 'caches'), join(cache, 'caches'), { recursive: true, dereference: true,
      filter: p => !/\.lock$|\.lck$/.test(p) });
    const tempHome = join(privat, 'home');
    await mkdir(tempHome, { recursive: true });
    dateiNoetig(ctx.debugKey);
    writeFileSync(password, 'android\n', { mode: 0o600 });
    const dauerhaft = join(ctx.ausgabe, 'varianten');
    await mkdir(dauerhaft, { recursive: true });
    for (const art of arten) {
      const projekt = join(privat, art, 'android');
      await mkdir(projekt, { recursive: true });
      if (art === 'testempfaenger') {
        await testempfaengerProjekt(ctx, projekt);
      } else {
        await cp(join(ctx.wurzel, 'app/android'), projekt, { recursive: true, dereference: true,
          filter: kopieren });
        // Nicht nur Build-Ausgaben umlenken: auch das Capacitor-Projekt selbst wird kopiert.
        const capacitor = join(privat, art, 'capacitor-android');
        await cp(join(ctx.wurzel, 'node_modules/@capacitor/android/capacitor'), capacitor, { recursive: true, dereference: true,
          filter: kopieren });
        writeFileSync(join(projekt, 'capacitor.settings.gradle'), `include ':capacitor-android'\nproject(':capacitor-android').projectDir = new File(${groovy(capacitor)})\n`);
      }
      writeFileSync(join(projekt, 'local.properties'), `sdk.dir=${ctx.sdk.replaceAll('\\', '/').replaceAll(':', '\\:')}\n`);
      const init = join(projekt, 'ausgaben.gradle');
      writeFileSync(init, `gradle.beforeProject { p ->\n    p.layout.buildDirectory.set(new File(${groovy(join(privat, art, 'build'))}, p.path.replace(':', '_')))\n}\n`);
      const mf = join(projekt, 'app/src/main/AndroidManifest.xml');
      const gf = join(projekt, 'app/build.gradle');
      const af = join(projekt, 'app/src/main/java/de/baremos/fristenrechner/MainActivity.java');
      if (art === 'gegenprobe') {
        const q = gegenprobeQuellen({ manifest: readFileSync(mf, 'utf8'), gradle: readFileSync(gf, 'utf8'), activity: readFileSync(af, 'utf8') });
        writeFileSync(mf, q.manifest); writeFileSync(gf, q.gradle); writeFileSync(af, q.activity);
      } else if (art !== 'testempfaenger') {
        const cf = join(projekt, 'app/src/main/assets/capacitor.config.json');
        const config = JSON.parse(readFileSync(cf, 'utf8'));
        if (config.android?.minWebViewVersion !== 83 || config.server?.errorPath !== 'startfehler.html') throw new Error('Unerwartete Ausgangskonfiguration der Fehlerseite.');
        config.android.minWebViewVersion = 84;
        writeFileSync(cf, `${JSON.stringify(config, null, 2)}\n`);
        if (art === 'ohne-fehlerseite') rmSync(join(projekt, 'app/src/main/assets/public/startfehler.html'));
      }
      // Verwendet den vorhandenen Debugschlüssel. AGP soll keinen neuen Schlüssel erzeugen.
      writeFileSync(gf, `${readFileSync(gf, 'utf8')}\nandroid.signingConfigs.debug {\n    storeFile file(${groovy(ctx.debugKey)})\n    storePassword file(${groovy(password)}).text.trim()\n    keyAlias 'androiddebugkey'\n    keyPassword file(${groovy(password)}).text.trim()\n}\n`);
      const env = { ...ctx.env, GRADLE_USER_HOME: cache, ANDROID_USER_HOME: join(tempHome, '.android'), HOME: tempHome, USERPROFILE: tempHome };
      await ctx.command(ctx.java, [`-Duser.home=${tempHome}`, `-Djava.io.tmpdir=${join(ctx.ausgabe, 'tmp')}`, '-classpath', launcher,
        'org.gradle.launcher.GradleMain', '--offline', '--no-daemon', '--console=plain', '-g', cache,
        '--project-cache-dir', join(privat, art, 'project-cache'), '-I', init, 'clean', 'assembleDebug'], `build-${art}`, { cwd: projekt, env, timeoutMs: 900000 });
      const apk = join(privat, art, 'build/_app/outputs/apk/debug/app-debug.apk');
      dateiNoetig(apk);
      const ziel = join(dauerhaft, `${art}.apk`);
      copyFileSync(apk, ziel);
      ergebnis[art] = ziel;
    }
    if (variantenQuellenstand(ctx) !== quellenstand) throw new Error('Variantenquellen wurden während des Baus verändert.');
    for (const [art, apk] of Object.entries(ergebnis)) sichereMetadaten(ctx, dauerhaft, art, apk, quellenstand);
    return ergebnis;
  } finally {
    rmSync(password, { force: true });
    if (existsSync(cache)) {
      const wirklich = realpathSync(cache);
      const ausgabe = realpathSync(ctx.ausgabe);
      if (!innen(ausgabe, wirklich) || wirklich === ausgabe) throw new Error('Cache-Kopie liegt außerhalb des Ausgabeordners.');
      rmSync(cache, { recursive: true, force: true });
      ctx.log('Temporäre Gradle-Cache-Kopie gelöscht.');
    }
    const nachher = referenzen(ctx.wurzel);
    ctx.save('build-referenzen-nachher.json', nachher);
    if (JSON.stringify(original) !== JSON.stringify(nachher)) throw new Error('Build-Ausgaben der echten App oder von node_modules wurden verändert.');
  }
}
