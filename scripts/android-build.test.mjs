// Gegenproben mit der echten Java-Paketprüfung und Probeprojekten, ohne Gradle.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { starteGradle } from './android-build.mjs';
import { findeJdk, vorgabe, windows } from './werkzeuge.mjs';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basis = join(wurzel, 'scratchpad', 'paket-2.5-c3');
mkdirSync(basis, { recursive: true });
const arbeit = mkdtempSync(join(basis, 'android-build-test-'));
test.after(() => {
  assert.ok(relative(basis, arbeit).startsWith('android-build-test-'));
  rmSync(arbeit, { recursive: true, force: true });
});

function schreibe(datei, text) {
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, text);
}

const jdk = findeJdk();
const ohneJdk = jdk.pfad ? false : `kein JDK ${vorgabe.jdk.hauptversion} für die echte Paketprüfung gefunden`;
const skripte = join(arbeit, 'scripts');
mkdirSync(skripte);
for (const datei of ['android-build.mjs', 'werkzeuge.mjs', 'SdkPruefung.java']) {
  copyFileSync(join(wurzel, 'scripts', datei), join(skripte, datei));
}
// Nur in der Testkopie die Referenzen an die Testumgebung anpassen, damit
// --streng gezielt fehlende SDK-Pakete statt den lokalen JDK-Patchstand prüft.
const testVorgabe = structuredClone(vorgabe);
testVorgabe.node.referenz = process.versions.node;
if (jdk.pfad) testVorgabe.jdk.release = jdk.version.split(/[^\d.]/)[0].split('.').slice(0, 3).join('.');
schreibe(join(skripte, 'toolchain.json'), JSON.stringify(testVorgabe));

function probe({ fehlt, testgruppe = false } = {}) {
  const ort = mkdtempSync(join(arbeit, 'probe-'));
  const projekt = join(ort, 'android');
  const wrapper = join(projekt, 'gradle', 'wrapper');
  mkdirSync(wrapper, { recursive: true });
  for (const datei of ['gradle-wrapper.properties', 'gradle-wrapper.jar']) {
    copyFileSync(join(wurzel, 'app', 'android', 'gradle', 'wrapper', datei), join(wrapper, datei));
  }
  // Niemals den echten Wrapper kopieren: Ein versehentlicher Start darf keinen
  // Download oder Build auslösen und hinterlässt eine erkennbare Spur.
  schreibe(join(projekt, 'gradlew'), '#!/bin/sh\necho gestartet > gestartet\nexit 97\n');
  schreibe(join(projekt, 'gradlew.bat'), '@echo gestartet>gestartet\r\n@exit /b 97\r\n');
  const sdk = join(ort, 'sdk');
  mkdirSync(sdk);
  for (const p of vorgabe.android.pakete) {
    if (p.name === fehlt || (!testgruppe && p.gruppe === 'test')) continue;
    schreibe(join(sdk, p.ordner, 'source.properties'), `Pkg.Path=${p.name}\nPkg.Revision=${p.revision}\n`);
  }
  return { projekt, sdk };
}

function pruefe(p, args, { nurPruefen = true } = {}) {
  const lauf = spawnSync(process.execPath, [join(skripte, 'android-build.mjs'), '--projekt', p.projekt, '--sdk', p.sdk,
    ...(nurPruefen ? ['--nur-pruefen'] : []), ...args], {
    encoding: 'utf8', env: { ...process.env, JAVA_HOME: jdk.pfad },
  });
  assert.ifError(lauf.error);
  assert.equal(existsSync(join(p.projekt, 'gestartet')), false, 'Probe-Wrapper darf nicht gestartet werden');
  return { code: lauf.status, text: `${lauf.stdout}${lauf.stderr}` };
}

for (const ohneTestgruppe of [false, true]) {
  for (const streng of [false, true]) {
    test(`Nur Build-Gruppe: ohneTestgruppe=${ohneTestgruppe}, streng=${streng}`, { skip: ohneJdk }, (t) => {
      const p = probe();
      const r = pruefe(p, [...(ohneTestgruppe ? ['--ohne-testgruppe'] : []), ...(streng ? ['--streng'] : [])]);
      assert.equal(r.code, streng && !ohneTestgruppe ? 1 : 0, r.text);
      const hinweise = r.text.split('\n').filter((zeile) => zeile.startsWith('Hinweis:'));
      assert.equal(hinweise.length, ohneTestgruppe ? 0 : 4, r.text);
      for (const paket of vorgabe.android.pakete.filter((p) => p.gruppe === 'test')) {
        assert.equal(hinweise.some((h) => h.includes(`fehlt das Paket ${paket.name}.`)), !ohneTestgruppe);
      }
      assert.equal(r.text.includes('SDK-Prüfung ohne Testgruppe'), ohneTestgruppe);
      assert.equal(r.text.includes('Fehler: Strenge Prüfung:'), streng && !ohneTestgruppe);
      t.diagnostic(`rc=${r.code}\n${r.text}`);
    });
  }
  for (const paket of vorgabe.android.pakete.filter((p) => p.gruppe === 'build')) {
    test(`Build-Paket ${paket.name} fehlt, ohneTestgruppe=${ohneTestgruppe}`, { skip: ohneJdk }, (t) => {
      const r = pruefe(probe({ fehlt: paket.name, testgruppe: true }), ohneTestgruppe ? ['--ohne-testgruppe'] : []);
      assert.equal(r.code, 1, r.text);
      assert.ok(r.text.includes(`fehlt das Paket ${paket.name}.`), r.text);
      assert.match(r.text, /Fehler:/);
      t.diagnostic(`rc=${r.code}\n${r.text}`);
    });
  }
}

test('Startfehler des Wrappers: fehlender Arbeitsordner liefert echten ENOENT auch unter Windows', (t) => {
  const meldungen = [];
  const code = starteGradle(join(arbeit, 'nicht-vorhanden'), 'assembleRelease', process.env, {
    fehlerausgabe: (text) => meldungen.push(text),
  });
  assert.equal(code, 1);
  assert.match(meldungen.join('\n'), /Fehler: gradlew ließ sich nicht starten \(ENOENT\)/);
  t.diagnostic(`rc=${code}\n${meldungen.join('\n')}`);
});

test('Startfehler EACCES nennt fehlendes Ausführungsrecht und chmod', (t) => {
  const meldungen = [];
  const code = starteGradle(arbeit, 'assembleRelease', process.env, {
    spawn: () => ({ status: null, error: Object.assign(new Error('Gegenprobe EACCES'), { code: 'EACCES' }) }),
    fehlerausgabe: (text) => meldungen.push(text),
  });
  assert.equal(code, 1);
  assert.match(meldungen.join('\n'), /Fehler: gradlew ließ sich nicht starten \(EACCES\).*Ausführungsrecht.*chmod \+x gradlew/);
  t.diagnostic(`rc=${code}\n${meldungen.join('\n')}`);
});

test('Linux-Gegenprobe: gradlew ohne Ausführungsrecht scheitert im CLI mit EACCES', {
  skip: windows ? 'Windows hat kein POSIX-Ausführungsrecht; echter ENOENT wird gesondert geprüft' : ohneJdk,
}, (t) => {
  const p = probe();
  chmodSync(join(p.projekt, 'gradlew'), 0o644);
  const r = pruefe(p, ['--ohne-testgruppe', '--streng'], { nurPruefen: false });
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /Fehler: gradlew ließ sich nicht starten \(EACCES\).*Ausführungsrecht/);
  t.diagnostic(`rc=${r.code}\n${r.text}`);
});

test('Signalabbruch des Wrappers bleibt nicht ohne Meldung', (t) => {
  const meldungen = [];
  assert.equal(starteGradle(arbeit, 'assembleRelease', process.env, {
    spawn: () => ({ status: null, signal: 'SIGTERM' }), fehlerausgabe: (text) => meldungen.push(text),
  }), 1);
  assert.match(meldungen.join('\n'), /Fehler: gradlew.*Signal SIGTERM/);
  t.diagnostic(meldungen.join('\n'));
});

for (const status of [0, 7]) {
  test(`Wrapper-Rückgabewert ${status} bleibt erhalten`, () => {
    assert.equal(starteGradle(arbeit, 'assembleRelease', process.env, {
      spawn: () => ({ status }), fehlerausgabe: () => assert.fail('Kein Startfehler'),
    }), status);
  });
}
