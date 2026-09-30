// Vorbereitung und Laufsteuerung offline; kein npm ci und kein Android-Build.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { dateiManifest, vorbereiten } from './fdroid/app-vorbereiten.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const arbeit = mkdtempSync(join(tmpdir(), 'fdroid-app-vorbereitung-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)']).status === 0);

function probe(aenderung = {}) {
  const schritte = [];
  const vorher = { status: ['?? app/android/app/local.properties'], dateien: [] };
  const fehler = [];
  const konfig = {
    wurzel: arbeit, umgebung: { FR_FDROID_LAUF: arbeit, ASTRO_TELEMETRY_DISABLED: '0' },
    spawn(node, args, optionen) {
      assert.equal(node, process.execPath);
      assert.equal(optionen.env.ASTRO_TELEMETRY_DISABLED, '1');
      assert.equal(optionen.env.CI, '1');
      schritte.push(args[0].endsWith('app-bauen.mjs') ? 'web' : 'sync');
      if (schritte.at(-1) === 'web') assert.deepEqual(args.slice(1), ['--web']);
      else assert.deepEqual(args.slice(1), ['sync', 'android']);
      return { status: 0 };
    },
    pruefungen: {
      leseAndroidZustand() { schritte.push('zustand'); return vorher; },
      pruefeSync(werte) { assert.equal(werte.vorher, vorher); schritte.push('k3'); return []; },
      pruefeGradle() { schritte.push('k4'); return []; },
    },
    manifest() { schritte.push('manifest'); return { dateien: [{ pfad: 'index.html' }] }; },
    schreiben(datei, text, optionen) {
      assert.equal(datei, join(arbeit, 'web-vor-bereinigung.json'));
      assert.equal(optionen.flag, 'wx');
      assert.deepEqual(JSON.parse(text).dateien, [{ pfad: 'index.html' }]);
      schritte.push('schreiben');
    },
    ausgabe() {}, fehlerausgabe(text) { fehler.push(text); }, ...aenderung,
  };
  return { konfig, schritte, fehler };
}

test('Web-Build K1/K2, Zustand, Sync, K3/K4 und Manifest laufen ohne Gradle in Reihenfolge', () => {
  const p = probe();
  assert.equal(vorbereiten([], p.konfig), 0);
  assert.deepEqual(p.schritte, ['web', 'zustand', 'sync', 'k3', 'k4', 'manifest', 'schreiben']);
  assert.deepEqual(p.fehler, []);
});

for (const phase of ['web', 'sync', 'k3', 'k4']) {
  test(`Fehler in ${phase} stoppt vor dem Manifest`, () => {
    const p = probe();
    if (phase === 'web' || phase === 'sync') {
      const normal = p.konfig.spawn;
      p.konfig.spawn = (...args) => { normal(...args); return { status: p.schritte.at(-1) === phase ? 9 : 0 }; };
    } else p.konfig.pruefungen[phase === 'k3' ? 'pruefeSync' : 'pruefeGradle'] = () => ['Gegenprobe'];
    assert.equal(vorbereiten([], p.konfig), 1);
    assert.ok(!p.schritte.includes('manifest'));
    if (phase === 'k3') assert.ok(!p.schritte.includes('k4'));
    assert.equal(p.fehler.length, 1);
  });
}

test('Fehlender Laufordner und unbekannte Argumente scheitern vor dem Build', () => {
  for (const [argv, env] of [[[], {}], [['--unbekannt'], { FR_FDROID_LAUF: arbeit }], [['--nach-scanner', '--nach-scanner'], {}]]) {
    const p = probe({ umgebung: env });
    assert.equal(vorbereiten(argv, p.konfig), 1);
    assert.deepEqual(p.schritte, []);
  }
});

test('Manifest bewahrt Pfade, Bytezahlen und Hashes sämtlicher Assets einschließlich leerer Dateien', () => {
  const root = mkdtempSync(join(arbeit, 'web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<h1>ü</h1>');
  writeFileSync(join(root, 'assets', 'leer.js'), '');
  const m = dateiManifest(root);
  assert.equal(m.zeitpunkt, 'nach-sync-vor-bereinigung');
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.dateien.length, 2);
  for (const f of m.dateien) {
    const daten = readFileSync(join(root, f.pfad));
    assert.equal(f.bytes, daten.length);
    assert.equal(f.sha256, createHash('sha256').update(daten).digest('hex'));
  }
  const leer = mkdtempSync(join(arbeit, 'leer-'));
  assert.throws(() => dateiManifest(leer), /leer/);
});

test('Manifest folgt keinem Verzeichnisverweis', (t) => {
  const root = mkdtempSync(join(arbeit, 'link-'));
  const extern = mkdtempSync(join(arbeit, 'extern-'));
  writeFileSync(join(extern, 'index.html'), 'extern');
  try { symlinkSync(extern, join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Verweise hier nicht erlaubt'); return; } throw e; }
  assert.throws(() => dateiManifest(root), /Verweise/);
  assert.throws(() => dateiManifest(join(root, 'alias')), /Verweise/);
});

test('Nach dem Scanner werden nur erhaltene Android-Quellen geprüft', () => {
  const root = mkdtempSync(join(arbeit, 'quellen-'));
  mkdirSync(join(root, 'node_modules', 'quelle'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'quelle', 'build.gradle'), '');
  const p = probe({ wurzel: root, umgebung: {}, quellen: () => ['node_modules/quelle'] });
  assert.equal(vorbereiten(['--nach-scanner'], p.konfig), 0);
  assert.deepEqual(p.schritte, []);
  p.konfig.quellen = () => ['node_modules/fehlt'];
  assert.equal(vorbereiten(['--nach-scanner'], p.konfig), 1);
});

const pythonPruefung = String.raw`
import copy, hashlib, json, os, subprocess, sys, types, unittest
from pathlib import Path
from unittest.mock import patch
p = Path(sys.argv[1]) / 'fdroid/build-lokal.py'
b = types.ModuleType('build_lokal'); b.__file__ = str(p)
exec(compile(p.read_text(encoding='utf-8'), str(p), 'exec'), b.__dict__)
w = Path(sys.argv[2]).resolve()
rezept = json.loads(b.APP_REZEPT.read_text(encoding='utf-8'))
vorgabe = json.loads((p.parent.parent / 'toolchain.json').read_text(encoding='utf-8'))
commit = 'a' * 40
class Pruefung(unittest.TestCase):
    def test_varianten(self):
        original = copy.deepcopy(rezept)
        for variante in ['ohne', 'gezielt', 'gezielt-scandelete']:
            r = b.app_rezept_fuer_lauf(rezept, w, commit, variante)
            build = r['Builds'][0]
            self.assertEqual(r['Categories'], ['Calculator'])
            self.assertEqual(build['subdir'], 'app/android/app')
            self.assertEqual(build['commit'], commit)
            self.assertEqual(any('npm-bereinigen.py' in x for x in build['prebuild']), variante != 'ohne')
            self.assertEqual('scandelete' in build, variante == 'gezielt-scandelete')
            self.assertTrue(any('nach-bereinigung.json' in x for x in build['prebuild']))
            self.assertTrue(any('nach-scanner.json' in x for x in build['build']))
        self.assertEqual(rezept, original)
        with self.assertRaises(ValueError): b.app_rezept_fuer_lauf(rezept, w, commit, 'beliebig')
    def test_referenz(self):
        ref = w / 'ref.apk'; ref.write_bytes(b'APK-Test')
        werte = {'bytes': 8, 'sha256': hashlib.sha256(b'APK-Test').hexdigest()}
        with patch.object(b, 'APP_REFERENZ', werte):
            self.assertEqual(b.pruefe_referenz(ref), werte)
            ref.write_bytes(b'APK-Falsch')
            with self.assertRaisesRegex(ValueError, 'weicht'): b.pruefe_referenz(ref)
        with self.assertRaises(ValueError): b.pruefe_referenz(w / 'fehlt')
    def test_argumente(self):
        for args in [['--stand','HEAD'], ['--variante','ohne'], ['--referenz-apk','probe.apk'],
                     ['--app'], ['--app','--versuch-scandelete'], ['--app','--variante','ohne']]:
            with self.subTest(args=args), self.assertRaises(ValueError): b.main(args)
    def test_quelle(self):
        falscher_pfad = None
        gesehen = []
        def git(args, **kwargs):
            gesehen.append(args)
            if args[3:] == ['rev-parse','--show-toplevel']: return str(w)
            if args[3] == 'rev-parse':
                self.assertEqual(args[4:], ['--verify','--quiet','--end-of-options','--help^{commit}'])
                return commit
            pfad = args[4].split(':',1)[1]
            if pfad == falscher_pfad: raise ValueError('Datei fehlt')
            if pfad == 'app/android/app/build.gradle': return 'applicationId "de.baremos.fristenrechner"\nversionName "0.1.0"\nversionCode 100\n'
            if pfad.endswith('gradle-wrapper.properties'): return 'distributionUrl=https://services.gradle.org/distributions/gradle-' + vorgabe['gradle']['version'] + '-bin.zip\ndistributionSha256Sum=' + vorgabe['gradle']['sha256']['bin']
            return '{}'
        with patch.object(b, 'ausgabe', git):
            self.assertEqual(b.pruefe_app_quelle(w, rezept, vorgabe, '--help'), commit)
            falscher_pfad = 'scripts/fdroid/npm-bereinigen.py'
            with self.assertRaisesRegex(ValueError, 'Datei fehlt'): b.pruefe_app_quelle(w,rezept,vorgabe,'--help')
        self.assertTrue(any('bereinigungsliste.json' in ' '.join(x) for x in gesehen))
    def test_probelauf(self):
        vorher = list(w.rglob('*'))
        with patch.object(b,'pruefe_app_quelle',return_value=commit), patch.object(b,'pruefe_pfade',return_value=(w,w.parent/'laeufe')), patch.object(b.subprocess,'run',side_effect=AssertionError('Kein Prozess im Probelauf')), patch.object(b.tempfile,'mkdtemp',side_effect=AssertionError('Kein neuer Ordner')):
            self.assertEqual(b.main(['--app','--variante','ohne','--probelauf']), 0)
        self.assertEqual(list(w.rglob('*')),vorher)
    def test_app_lauf_und_scannerabbruch(self):
        # Vollständiger Lauf mit nachgestellten externen Programmen. Prüft auch,
        # dass ein Abbruch des Scanners die Auswertung nicht überspringt.
        for scannerabbruch in [False, True]:
            basis = w / ('abbruch' if scannerabbruch else 'erfolg'); basis.mkdir()
            arbeit = basis / 'laeufe'; repo = basis / 'repo'; repo.mkdir()
            daten = basis / 'daten'; pin = vorgabe['gradlewFdroid']
            starter = daten / pin['benutzerOrdner'] / pin['commit'] / pin['datei']
            starter.parent.mkdir(parents=True); starter.write_bytes(b'')
            gesehen = []
            def extern(args, **kwargs):
                gesehen.append(args)
                if args == ['fdroid','--version']: text = '2.4.2'
                elif args[0].endswith('bin' + os.sep + 'node'): text = 'v' + vorgabe['node']['referenz']
                elif args[0].endswith('bin' + os.sep + 'npm'): text = vorgabe['npm']['referenz']
                elif args[0].endswith('bin' + os.sep + 'java'): text = 'openjdk version "21.0.12"'
                elif args[0].endswith('bin' + os.sep + 'javac'): text = 'javac 21.0.12'
                elif args[0] == 'bash': text = ''
                elif args[:2] == ['fdroid','build']:
                    self.assertEqual(args[-1], 'de.baremos.fristenrechner:100')
                    lauf = Path(kwargs['cwd'])
                    meta = json.loads((lauf/'lauf.json').read_text(encoding='utf-8'))
                    self.assertEqual(meta['projekt'], 'app')
                    self.assertEqual(meta['variante'], 'gezielt-scandelete')
                    self.assertEqual(meta['referenzApk']['pfad'], 'referenz.apk')
                    self.assertTrue(meta['scandeleteVersuch'])
                    self.assertEqual((lauf/'referenz.apk').read_bytes(), b'')
                    rezept_lauf = json.loads((lauf/'metadata/de.baremos.fristenrechner.yml').read_text(encoding='utf-8'))
                    self.assertEqual(rezept_lauf['Builds'][0]['scandelete'], ['node_modules'])
                    if scannerabbruch: (lauf/'build/de.baremos.fristenrechner/node_modules').mkdir(parents=True)
                    else: (lauf/'npm-vorgebaut-nach-scanner.json').write_text('[]',encoding='utf-8')
                    kwargs['stdout'].write('Nachgestellter Lauf\n')
                    return subprocess.CompletedProcess(args, 1 if scannerabbruch else 0)
                elif args[1].endswith('npm-inventar.py'):
                    self.assertTrue(scannerabbruch)
                    self.assertTrue(args[-1].endswith('npm-dateien-nach-lauf.json' if '--alle' in args else 'npm-vorgebaut-nach-lauf.json'))
                    Path(args[-1]).write_text('[]',encoding='utf-8'); text = ''
                elif args[1].endswith('app-auswerten.py'):
                    self.assertEqual(args[-2], '--lauf')
                    return subprocess.CompletedProcess(args, 1 if scannerabbruch else 0)
                else: raise AssertionError('Nicht nachgestellter Prozess: ' + repr(args))
                return subprocess.CompletedProcess(args, 0, text, '')
            ref = basis/'quelle.apk'; ref.write_bytes(b'')
            # Leere Testdateien simulieren nur die Übergabe. Reale Prüfsummen-
            # Prüfung bleibt oben separat mit gültiger und falscher Referenz.
            with patch.dict(os.environ, {'XDG_DATA_HOME':str(daten)}), patch.object(sys,'platform','linux'), patch.object(b,'pruefe_app_quelle',return_value=commit), patch.object(b,'pruefe_referenz',return_value=b.APP_REFERENZ), patch.object(b,'rezept_einchecken',return_value=1700000000), patch.object(b,'pruefe_gradle_archiv',return_value={'probe':True}), patch.object(b.os,'access',return_value=True), patch.object(b.hashlib,'sha256',return_value=types.SimpleNamespace(hexdigest=lambda:pin['sha256'])), patch.object(b.subprocess,'run',extern):
                code = b.main(['--app','--repo',str(repo),'--arbeitsordner',str(arbeit),'--variante','gezielt-scandelete','--referenz-apk',str(ref)])
            self.assertEqual(code, 1 if scannerabbruch else 0)
            lauf = next(arbeit.glob('lauf-*'))
            self.assertEqual(json.loads((lauf/'auswertung-rueckgabe.json').read_text(encoding='utf-8')),{'appAuswertung':1 if scannerabbruch else 0})
            self.assertEqual(sum(len(x)>1 and x[1].endswith('app-auswerten.py') for x in gesehen),1)
            self.assertEqual(sum(len(x)>1 and x[1].endswith('npm-inventar.py') for x in gesehen),2*int(scannerabbruch))
unittest.main(argv=['Pruefung'], verbosity=2)
`;

test('Python-Laufsteuerung: Varianten, Byte-Referenz, Argumentgrenzen, Commitquellen und schreibfreier Probelauf', { skip: !python && 'Python ab 3.11 fehlt' }, () => {
  const r = spawnSync(python, ['-B', '-c', pythonPruefung, hier, arbeit], {
    encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /Ran 6 tests/);
});
