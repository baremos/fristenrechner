// Aufruf: node --test scripts/fdroid-probe-veroeffentlichung.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skript = join(wurzel, 'scripts/fdroid/probe-veroeffentlichung.sh');
const referenz = JSON.parse(readFileSync(join(wurzel, 'scripts/fdroid/app-referenz.json'), 'utf8'));
const rezeptDokument = parseDocument(readFileSync(join(wurzel, 'scripts/fdroid/veroeffentlichung/de.baremos.fristenrechner.yml'), 'utf8'),
  { version: '1.2', strict: true, uniqueKeys: true });
assert.deepEqual(rezeptDokument.errors, []);
const projektRezept = rezeptDokument.toJS({ maxAliasCount: 0 });
// Synthetische vollständige Hashes; kein Release-Commit ist im Test vorausgesetzt.
const erwarteterCommit = '0123456789abcdef0123456789abcdef01234567';
const andererCommit = 'fedcba9876543210fedcba9876543210fedcba98';
const text = readFileSync(skript, 'utf8');
const pythonCode = text.split("<<'PY'\n")[1]?.split('\nPY\n')[0];
const ohneStart = pythonCode?.split('\ntry:\n    sys.exit(main())')[0];
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-c', 'import hashlib; assert hasattr(hashlib, "file_digest")']).status === 0);
const bash = [process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : 'bash', 'bash']
  .find((name) => spawnSync(name, ['-c', 'exit 0']).status === 0);
mkdirSync(join(wurzel, 'scratchpad'), { recursive: true });
const arbeit = mkdtempSync(join(wurzel, 'scratchpad/fdroid-probe-test-'));
test.after(() => {
  assert.ok(resolve(arbeit).startsWith(join(wurzel, 'scratchpad') + sep));
  rmSync(arbeit, { recursive: true, force: true });
});

function auswerten(code, args = []) {
  const datei = join(arbeit, `fall-${Math.random().toString(16).slice(2)}.py`);
  writeFileSync(datei, `${ohneStart}\n${code}\n`, 'utf8');
  return spawnSync(python, [datei, join(wurzel, 'scripts/fdroid'), ...args], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' },
  });
}

test('Bash und eingebettetes Python sind syntaktisch gültig', { skip: !python || !bash }, () => {
  assert.ok(pythonCode && ohneStart && pythonCode !== ohneStart);
  const shell = spawnSync(bash, ['-n', skript], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  const code = auswerten('print("Syntax geprüft")');
  assert.equal(code.status, 0, code.stderr);
});

test('Abgleichsfunktion akzeptiert das echte Veröffentlichungsrezept und --help bleibt ohne Debian ausführbar', { skip: !python }, () => {
  const commit = projektRezept.Builds[0].commit;
  assert.match(commit, /^[0-9a-f]{40}$/);
  const lauf = auswerten('print(json.dumps(pruefe_rezept(*json.loads(sys.argv[2]))))',
    [JSON.stringify([projektRezept, referenz, commit])]);
  assert.equal(lauf.status, 0, lauf.stderr);
  assert.deepEqual(JSON.parse(lauf.stdout), [referenz.versionName, referenz.versionCode, `v${referenz.versionName}`]);
  const hilfe = auswerten('sys.exit(main())', ['--help']);
  assert.equal(hilfe.status, 0, hilfe.stderr);
  assert.match(hilfe.stdout, /--erwarteter-commit/);
});

for (const [name, wert, fehler] of [
  ['Tagname', `v${referenz.versionName}`, /genau 40 Hex-Zeichen/],
  ['Kurzform', projektRezept.Builds[0].commit.slice(0, 7), /genau 40 Hex-Zeichen/],
  ['Großbuchstaben', projektRezept.Builds[0].commit.toUpperCase(), /Großbuchstaben/],
  ['anderer Hash', erwarteterCommit, /weicht von --erwarteter-commit ab/],
  ['fehlendes Feld', undefined, /genau 40 Hex-Zeichen/],
  ['Zahl', 10000, /genau 40 Hex-Zeichen/],
  ['Zeilenumbruch', projektRezept.Builds[0].commit + '\n', /genau 40 Hex-Zeichen/],
]) {
  test(`Abgleichsfunktion lehnt geändertes Veröffentlichungsrezept ab: ${name}`, { skip: !python }, () => {
    const rezept = structuredClone(projektRezept);
    rezept.Builds[0].commit = wert;
    const lauf = auswerten('pruefe_rezept(*json.loads(sys.argv[2]))',
      [JSON.stringify([rezept, referenz, projektRezept.Builds[0].commit])]);
    assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stderr, fehler);
  });
}

test('APK-Vergleich erkennt gleiche Größe mit anderem Inhalt und fehlende Datei', { skip: !python }, () => {
  const original = join(arbeit, 'original.apk');
  const geaendert = join(arbeit, 'geaendert.apk');
  writeFileSync(original, Buffer.from('Beispiel A'));
  writeFileSync(geaendert, Buffer.from('Beispiel B'));
  const daten = auswerten('print(json.dumps([apk_daten(x) for x in sys.argv[2:]]))', [original, geaendert]);
  assert.equal(daten.status, 0, daten.stderr);
  const [a, b] = JSON.parse(daten.stdout);
  assert.equal(a.bytes, b.bytes);
  assert.notEqual(a.sha256, b.sha256);
  assert.equal(a.sha256, createHash('sha256').update(readFileSync(original)).digest('hex'));
  const fehlt = auswerten('apk_daten(sys.argv[2])', [join(arbeit, 'fehlt.apk')]);
  assert.notEqual(fehlt.status, 0);
  assert.match(fehlt.stderr, /APK fehlt/);
});

test('Berichte überschreiben keine vorhandenen Belege', { skip: !python }, () => {
  const datei = join(arbeit, 'bestehend.json');
  writeFileSync(datei, 'unverändert');
  const lauf = auswerten('json_schreiben(sys.argv[2], {"neu": True})', [datei]);
  assert.notEqual(lauf.status, 0);
  assert.equal(readFileSync(datei, 'utf8'), 'unverändert');
});

test('sudo-Befehle teilen Variablen, arbeiten im gewählten Ordner und brechen bei Fehler ab', { skip: !python || !bash }, () => {
  const daten = auswerten('print(json.dumps(sudo_befehl(["wert=aus-dem-rezept", "printf %s \\\"$wert\\\" > erster.txt", "false", "touch darf-nicht-entstehen.txt"])))');
  assert.equal(daten.status, 0, daten.stderr);
  const befehl = JSON.parse(daten.stdout);
  assert.deepEqual(befehl.slice(0, -1), ['bash', '-e', '-u', '-o', 'pipefail', '-x', '-c']);
  const cwd = join(arbeit, 'sudo-test');
  mkdirSync(cwd);
  const lauf = spawnSync(bash, befehl.slice(1), { cwd, encoding: 'utf8' });
  assert.notEqual(lauf.status, 0);
  assert.equal(readFileSync(join(cwd, 'erster.txt'), 'utf8'), 'aus-dem-rezept');
  assert.equal(existsSync(join(cwd, 'darf-nicht-entstehen.txt')), false);
  assert.match(text, /ausfuehren\(sudo_befehl\(sudo\), cwd=lauf \/ "fdroid"/);
});

test('sudo-Befehle brechen auch bei Fehlern innerhalb einer Pipe ab', { skip: !python || !bash }, () => {
  const daten = auswerten('print(json.dumps(sudo_befehl(["false | true", "printf unerlaubt"])))');
  assert.equal(daten.status, 0, daten.stderr);
  const befehl = JSON.parse(daten.stdout);
  const lauf = spawnSync(bash, befehl.slice(1), { encoding: 'utf8' });
  assert.notEqual(lauf.status, 0);
  assert.equal(lauf.stdout, '');
});

// Der unveränderte Python-Ablauf bekommt ausschließlich nachgestellte externe
// Prozesse. Dateiverarbeitung, Metadatenkopie, Berichte und APK-Vergleich laufen
// wirklich. Die Nachstellung ersetzt weder Debian noch einen echten Build.
const prozessNachstellung = String.raw`
import io
import types

basis = Path(sys.argv[2])
modus = sys.argv[3]
projekt_referenz = json.loads((HIER / "app-referenz.json").read_text(encoding="utf-8"))
version = "12.34.56" if modus == "andere-version" else projekt_referenz["versionName"]
versionscode = 123456 if modus == "andere-version" else projekt_referenz["versionCode"]
tag = "v" + version
test_commit = ${JSON.stringify(erwarteterCommit)}
if modus == "anderer-commit":
    test_commit = ${JSON.stringify(andererCommit)}
HIER = basis / "scripts/fdroid"
HIER.mkdir(parents=True)
sys.platform = "linux"
os.getuid = lambda: 1000 if modus == "sudo-ohne-root" else 0
os.geteuid = lambda: 1000 if modus == "sudo-ohne-root" else 0
original_lesen = Path.read_text
def lesen(self, *args, **kwargs):
    if self == Path("/etc/os-release"):
        return 'ID=debian\nVERSION_ID="13"\n'
    return original_lesen(self, *args, **kwargs)
Path.read_text = lesen
werkzeuge_installiert = False
def welches(name, path=None):
    assert path == SYSTEMPFAD
    if name in ("node", "nodejs", "npm", "npx"):
        if modus == "node-vor-rezept" and name == "node":
            return "/usr/bin/node"
        if not werkzeuge_installiert or modus == name + "-fehlt":
            return None
        return ("/usr/sbin/" if modus == name + "-falscher-pfad" else "/usr/bin/") + name
    if modus == "apt-fehlt" and name == "apt-get":
        return None
    return "/usr/bin/" + name
shutil.which = welches
yaml_modul = types.ModuleType("fdroidserver._yaml")
yaml_modul.yaml = types.SimpleNamespace(load=json.load)
sys.modules["fdroidserver"] = types.ModuleType("fdroidserver")
sys.modules["fdroidserver._yaml"] = yaml_modul
apk_inhalt = b"ungesigntes-testarchiv"
gradle_inhalt = b"gradle-testarchiv"
starter_inhalt = b"gradle-starter"
referenz = basis / "referenz.apk"
referenz.write_bytes(apk_inhalt)
starter = basis / "gradlew.py"
starter.write_bytes(starter_inhalt)
for datei in ("sdk/platforms/android-36/android.jar", "sdk/build-tools/35.0.0/aapt", "jdk/bin/java", "jdk/bin/javac"):
    ziel = basis / datei
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text("Werkzeugnachstellung")
quellenersatz = basis / "ersatz.bundle"
quellenersatz.write_bytes(b"Quellenersatznachstellung")
vorgabe = {"node": {"referenz": "24.21.0"}, "gradlewFdroid": {"sha256": hashlib.sha256(starter_inhalt).hexdigest()},
           "gradle": {"version": "8.14.5", "sha256": {"bin": hashlib.sha256(gradle_inhalt).hexdigest()}}}
if modus == "andere-node-referenz":
    vorgabe["node"]["referenz"] = "24.22.1"
json_schreiben(HIER.parent / "toolchain.json", vorgabe)
referenz_daten = {"appId": APPID, "versionName": version, "versionCode": versionscode,
                  "apk": {"bytes": len(apk_inhalt), "sha256": hashlib.sha256(apk_inhalt).hexdigest()}}
original = {"RepoType": "git", "Repo": REPO, "Binaries": "https://example.org/v%v/app_%c.apk",
            "CurrentVersion": version, "CurrentVersionCode": versionscode,
            "Builds": [{"versionName": version, "versionCode": versionscode, "commit": test_commit,
                        "sudo": ${JSON.stringify(projektRezept.Builds[0].sudo)}}]}
if modus == "ohne-sudo":
    del original["Builds"][0]["sudo"]
for fall, ziel, feld, wert in (
    ("build-version", original["Builds"][0], "versionName", "9.8.7"),
    ("build-code", original["Builds"][0], "versionCode", versionscode + 1),
    ("build-tag", original["Builds"][0], "commit", tag),
    ("build-commit-kurz", original["Builds"][0], "commit", test_commit[:7]),
    ("build-commit-gross", original["Builds"][0], "commit", test_commit.upper()),
    ("build-commit-abweichend", original["Builds"][0], "commit", ${JSON.stringify(andererCommit)}),
    ("aktuelle-version", original, "CurrentVersion", "9.8.7"),
    ("aktueller-code", original, "CurrentVersionCode", versionscode + 1),
    ("referenz-version", referenz_daten, "versionName", "9.8.7"),
    ("referenz-code", referenz_daten, "versionCode", versionscode + 1),
    ("build-code-text", original["Builds"][0], "versionCode", str(versionscode)),
    ("aktueller-code-text", original, "CurrentVersionCode", str(versionscode)),
):
    if modus == fall:
        ziel[feld] = wert
if modus == "zweiter-build":
    original["Builds"].append(dict(original["Builds"][0]))
json_schreiben(HIER / "app-referenz.json", referenz_daten)
rezept_datei = basis / "original.yml"
json_schreiben(rezept_datei, original)
aufrufe = []
abweichender_commit = test_commit[:7] + "0" * 33
klon_commit = abweichender_commit if modus == "tag-fehler" else test_commit
klon_tag_commit = abweichender_commit if modus in ("tag-fehler", "tag-head-ungleich") else test_commit

class Prozess:
    def __init__(self, befehl, cwd, env, **kwargs):
        global klon_commit, klon_tag_commit, werkzeuge_installiert
        self.code = 0
        cwd = Path(cwd)
        aufrufe.append({"befehl": befehl, "cwd": str(cwd), "env": env})
        assert env["PATH"] == SYSTEMPFAD
        assert env["HOME"] == str(cwd.parent / "home") or Path(env["HOME"]).parent == cwd or befehl[0] == "git"
        assert set(env).isdisjoint({"NODE_PATH", "NODE_OPTIONS", "FR_FDROID_LAUF", "FR_FDROID_INVENTAR"})
        text = ""
        name = Path(befehl[0]).name
        if befehl == ["fdroid", "--version"]:
            text = "2.4.2\n"
        elif name == "java":
            text = 'openjdk version "21.0.12"\n'
        elif name == "javac":
            text = "javac 21.0.12\n"
        elif name == "cp":
            shutil.copytree(befehl[-2], befehl[-1])
        elif name == "git" and "clone" in befehl:
            assert "--no-hardlinks" in befehl and befehl[befehl.index("--branch") + 1] == tag
            ziel = Path(befehl[-1])
            ziel.mkdir()
            (ziel / ".git").mkdir()
        elif name == "git" and "rev-parse" in befehl:
            assert Path(befehl[2]) == cwd / "fdroid/build" / APPID
            assert befehl[-1] in ("HEAD", tag + "^{commit}")
            text = (klon_commit if befehl[-1] == "HEAD" else klon_tag_commit) + "\n"
        elif name == "git" and "log" in befehl:
            text = "1790000000\n"
        elif name == "bash":
            assert befehl == sudo_befehl(original["Builds"][0]["sudo"])
            assert cwd.name == "fdroid"
            assert not werkzeuge_installiert
            self.code = 1 if modus == "sudo-fehler" else 0
            werkzeuge_installiert = self.code == 0
            text = "Nachgestellte Installation aus Debian forky\n"
        elif name == "fdroid":
            assert befehl == ["fdroid", "build", "--verbose", APPID + ":" + str(versionscode)]
            assert cwd.name == "fdroid"
            verwendet = json.loads((cwd / "metadata" / (APPID + ".yml")).read_text())
            assert "Binaries" not in verwendet
            assert verwendet["Builds"][0]["commit"] == test_commit
            assert json.loads(rezept_datei.read_text()) == original
            repo_erwartet = str(quellenersatz) if modus == "ersatz" else REPO
            assert verwendet["Repo"] == repo_erwartet
            assert (cwd / "build" / (".fdroidvcs-" + APPID)).read_text() == "git " + repo_erwartet
            assert not (cwd / ".git").exists()
            assert werkzeuge_installiert
            assert verwendet["Builds"][0]["sudo"] == original["Builds"][0]["sudo"]
            assert not list(Path(env["HOME"]).rglob("node"))
            gradle = cwd.parent / "fdroid-cache/versions/8.14.5/bin/gradle"
            gradle.parent.mkdir(parents=True)
            gradle.write_text("Gradle aus dem nachgestellten Build")
            (cwd.parent / "fdroid-cache/gradle-8.14.5-bin.zip").write_bytes(gradle_inhalt)
            (cwd / "unsigned").mkdir()
            (cwd / "unsigned" / (APPID + "_" + str(versionscode) + ".apk")).write_bytes(b"abweichendes-archiv!!" if modus == "apk-fehler" else apk_inhalt)
            (cwd / "logs").mkdir()
            (cwd / "logs/build-metadata.json").write_text("{}")
            self.code = 1 if modus == "build-fehler" else 0
            if modus == "head-nach-build":
                # Ein während des Builds abweichender HEAD muss erkannt werden.
                klon_commit = abweichender_commit
            if modus == "tag-nach-build":
                # Der Tag kann sich ändern, während HEAD am Rezept-Commit bleibt.
                klon_tag_commit = abweichender_commit
            text = "Nachgestellter fdroid-Build\n"
        elif name == "node":
            assert werkzeuge_installiert and befehl == ["/usr/bin/node", "--version"]
            text = {"node-alte-version": "v20.19.2", "node-andere-patchversion": "v24.21.1",
                    "andere-node-referenz": "v24.22.1"}.get(modus, "v24.21.0") + "\n"
        elif name == "npm":
            assert werkzeuge_installiert and befehl == ["/usr/bin/npm", "--version"]
            text = "12.2.0\n"
            self.code = 1 if modus == "npm-version-fehler" else 0
        elif name == "gradle":
            text = "Gradle 8.14.5\n"
        else:
            raise AssertionError("Unerwarteter Prozess: " + repr(befehl))
        self.stdout = io.StringIO(text)
    def wait(self):
        return self.code

subprocess.Popen = Prozess
sys.argv = ["probe", str(HIER), "--arbeitsordner", str(basis / "arbeit"), "--ausgabeordner", str(basis / "ausgabe"),
            "--referenz-apk", str(referenz), "--sdk", str(basis / "sdk"), "--gradlew", str(starter),
            "--jdk", str(basis / "jdk"), "--rezept", str(rezept_datei)]
if modus == "ersatz":
    sys.argv.extend(["--quelle", str(quellenersatz)])
if modus == "rezept-standard":
    standard = HIER / "veroeffentlichung" / (APPID + ".yml")
    standard.parent.mkdir()
    shutil.copyfile(rezept_datei, standard)
    sys.argv = sys.argv[:-2]
if modus == "rezept-relativ":
    os.chdir(basis)
    sys.argv[-1] = "original.yml"
if modus == "rezept-elternpfad":
    (basis / "unterordner").mkdir()
    sys.argv[-1] = str(basis / "unterordner" / ".." / "original.yml")
if modus == "rezept-verweis":
    # Windows benötigt für echte Dateisymlinks häufig Sonderrechte. Nur die
    # Auflösung dieses einen vorhandenen Eingabepfads wird nachgestellt.
    original_aufloesen = Path.resolve
    def aufloesen(self, *args, **kwargs):
        if self == rezept_datei:
            return basis / "verweisziel.yml"
        return original_aufloesen(self, *args, **kwargs)
    Path.resolve = aufloesen
commit_argumente = {
    "commit-fehlt": [],
    "commit-ohne-wert": ["--erwarteter-commit"],
    "commit-kurz": ["--erwarteter-commit", test_commit[:7]],
    "commit-ungueltig": ["--erwarteter-commit", "g" * 40],
    "commit-zu-lang": ["--erwarteter-commit", test_commit + "0"],
    "commit-leer": ["--erwarteter-commit", ""],
    "commit-zeilenumbruch": ["--erwarteter-commit", test_commit + "\n"],
    "commit-gross": ["--erwarteter-commit", test_commit.upper()],
}
sys.argv.extend(commit_argumente.get(modus, ["--erwarteter-commit", test_commit]))
try:
    code = main()
finally:
    json_schreiben(basis / "aufrufe.json", aufrufe)
sys.exit(code)
`;

for (const modus of ['erfolg', 'ersatz', 'rezept-standard', 'andere-version', 'andere-node-referenz', 'anderer-commit', 'commit-gross', 'apk-fehler', 'build-fehler']) {
  test(`Vollständiger Ablauf mit nachgestellten Prozessen: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    const bestanden = !['apk-fehler', 'build-fehler'].includes(modus);
    const version = modus === 'andere-version' ? '12.34.56' : referenz.versionName;
    const versionscode = modus === 'andere-version' ? 123456 : referenz.versionCode;
    assert.equal(lauf.status, bestanden ? 0 : 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stdout, bestanden ? /ERGEBNIS: bestanden/ : /ERGEBNIS: Nacharbeit nötig/);
    const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
    const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
    assert.equal(ergebnis.bestanden, bestanden);
    assert.equal(ergebnis.uid, 0);
    assert.equal(ergebnis.euid, 0);
    assert.equal(ergebnis.sudoSchritte, 3);
    assert.equal(ergebnis.nodePfad, '/usr/bin/node');
    assert.equal(ergebnis.nodeVersion, modus === 'andere-node-referenz' ? 'v24.22.1' : 'v24.21.0');
    assert.equal(ergebnis.npmVersion, '12.2.0');
    assert.equal(ergebnis.fdroidBuild, modus === 'build-fehler' ? 1 : 0);
    assert.equal(ergebnis.commitNachBuild, ergebnis.commit);
    assert.equal(ergebnis.tagCommitNachBuild, ergebnis.commit);
    assert.equal(ergebnis.commit, modus === 'anderer-commit' ? andererCommit : erwarteterCommit);
    assert.equal(ergebnis.tag, `v${version}`);
    assert.match(readFileSync(join(sicherung, 'build.log'), 'utf8'), /Nachgestellter fdroid-Build/);
    assert.ok(existsSync(join(sicherung, 'logs/build-metadata.json')));
    const original = JSON.parse(readFileSync(join(sicherung, 'rezept-original.yml'), 'utf8'));
    const verwendet = JSON.parse(readFileSync(join(sicherung, 'metadata/de.baremos.fristenrechner.yml'), 'utf8'));
    assert.ok(original.Binaries);
    assert.equal(original.Builds[0].commit, ergebnis.commit);
    assert.equal(verwendet.Builds[0].commit, ergebnis.commit);
    assert.equal(verwendet.Binaries, undefined);
    const abweichungen = JSON.parse(readFileSync(join(sicherung, 'abweichungen.json'), 'utf8'));
    assert.ok(abweichungen.some((x) => x.includes('Binaries')));
    assert.equal(abweichungen.some((x) => x.includes('Quellenersatz')), modus === 'ersatz');
    assert.equal(abweichungen.some((x) => x.includes('Build läuft als root')), true);
    const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
    const sudoIndex = aufrufe.findIndex((x) => x.befehl[0] === 'bash');
    assert.ok(sudoIndex >= 0);
    assert.equal(aufrufe[sudoIndex].befehl.at(-1), projektRezept.Builds[0].sudo.join('; '));
    assert.deepEqual(aufrufe.slice(sudoIndex + 1, sudoIndex + 4).map((x) => x.befehl), [
      ['/usr/bin/node', '--version'], ['/usr/bin/npm', '--version'],
      ['fdroid', 'build', '--verbose', `${referenz.appId}:${versionscode}`],
    ]);
    assert.match(readFileSync(join(sicherung, 'probe.log'), 'utf8'), /Nach den sudo-Schritten: Node.js v24\.[0-9.]+ \(\/usr\/bin\/node\), npm 12\.2\.0/);
    assert.deepEqual(aufrufe.find((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build').befehl,
      ['fdroid', 'build', '--verbose', `${referenz.appId}:${versionscode}`]);
    assert.ok(existsSync(join(sicherung, `unsigned/${referenz.appId}_${versionscode}.apk`)));
    assert.equal(aufrufe.some((x) => x.befehl.includes('commit')), false);
  });
}

for (const [modus, fehler] of [
  ['sudo-fehler', /Befehl fehlgeschlagen/],
  ...['ohne-sudo', 'node-fehlt', 'npm-fehlt', 'node-falscher-pfad', 'npm-falscher-pfad']
    .map((modus) => [modus, /Nach den sudo-Schritten werden \/usr\/bin\/node und \/usr\/bin\/npm/]),
  ...['node-alte-version', 'node-andere-patchversion']
    .map((modus) => [modus, /System-Node weicht von der Referenzversion aus scripts\/toolchain.json ab/]),
  ['npm-version-fehler', /Befehl fehlgeschlagen.*\/usr\/bin\/npm --version/],
]) {
  test(`Fehlgeschlagene Bereitstellung der Systemwerkzeuge stoppt vor fdroid build: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stdout, fehler);
    const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
    const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
    assert.equal(ergebnis.bestanden, false);
    assert.equal(ergebnis.fdroidBuild, null);
    assert.match(ergebnis.fehler, fehler);
    const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
    assert.equal(aufrufe.some((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build'), false);
    if (modus.startsWith('node-') && modus.endsWith('version')) {
      assert.match(ergebnis.nodeVersion, modus === 'node-alte-version' ? /^v20\.19\.2$/ : /^v24\.21\.1$/);
      assert.equal(ergebnis.npmVersion, '12.2.0');
    }
  });
}

for (const [modus, fehler] of [
  ['sudo-ohne-root', /sudo-Schritte.*als root in einer entbehrlichen/],
  ['node-vor-rezept', /node ist bereits im Systempfad/],
  ['apt-fehlt', /Voraussetzung fehlt im Systempfad: apt-get/],
]) {
  test(`Voraussetzungen der Systeminstallation werden vor externen Prozessen geprüft: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stderr, fehler);
    assert.equal(existsSync(join(basis, 'arbeit')), false);
    assert.equal(existsSync(join(basis, 'ausgabe')), false);
    assert.deepEqual(JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8')), []);
  });
}

for (const modus of ['tag-fehler', 'tag-head-ungleich']) {
  test(`Abweichender Tag-Commit mit gleichem Kurzpräfix bricht vor fdroid build ab und sichert Belege: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stdout, /ERGEBNIS: Nacharbeit nötig.*Tag/);
    assert.ok(lauf.stdout.includes(`Tag v${referenz.versionName} zeigt nicht auf den erwarteten Stand ${erwarteterCommit}.`));
    const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
    const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
    assert.equal(ergebnis.bestanden, false);
    assert.equal(ergebnis.fdroidBuild, null);
    assert.equal(ergebnis.commitNachBuild, null);
    assert.match(readFileSync(join(sicherung, 'probe.log'), 'utf8'), /erwarteten Stand/);
    const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
    assert.equal(aufrufe.some((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build'), false);
  });
}

for (const modus of ['head-nach-build', 'tag-nach-build']) {
test(`Abweichender HEAD oder Tag nach fdroid build scheitert trotz bytegleicher APK: ${modus}`, { skip: !python }, () => {
  const basis = join(arbeit, modus);
  mkdirSync(basis);
  const lauf = auswerten(prozessNachstellung, [basis, modus]);
  assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
  assert.match(lauf.stdout, /ERGEBNIS: Nacharbeit nötig.*(?:HEAD|Tag v[0-9.]+) nach fdroid build/);
  const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
  const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
  assert.equal(ergebnis.bestanden, false);
  assert.equal(ergebnis.fdroidBuild, 0, 'Der nachgestellte Build selbst war erfolgreich');
  assert.equal(ergebnis.commit, erwarteterCommit);
  const abweichend = erwarteterCommit.slice(0, 7) + '0'.repeat(33);
  assert.equal(ergebnis.commitNachBuild, modus === 'head-nach-build' ? abweichend : erwarteterCommit);
  assert.equal(ergebnis.tagCommitNachBuild, modus === 'tag-nach-build' ? abweichend : erwarteterCommit);
  assert.ok(ergebnis.fehler.includes(`nach fdroid build weicht vom erwarteten Release-Commit ab: ${abweichend} statt ${erwarteterCommit}`));
  assert.deepEqual(readFileSync(join(sicherung, `unsigned/${referenz.appId}_${referenz.versionCode}.apk`)),
    readFileSync(join(basis, 'referenz.apk')), 'Selbst eine bytegleiche APK darf den falschen Commit nicht verdecken');
  const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
  const buildIndex = aufrufe.findIndex((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build');
  assert.ok(buildIndex >= 0);
  const commitPruefungen = aufrufe.filter((x) => x.befehl[0] === 'git' && x.befehl.includes('rev-parse'));
  assert.deepEqual(commitPruefungen.map((x) => x.befehl.at(-1)), ['HEAD', `v${referenz.versionName}^{commit}`, 'HEAD', `v${referenz.versionName}^{commit}`]);
  assert.equal(aufrufe[buildIndex + 1], commitPruefungen[2], 'HEAD wird unmittelbar nach fdroid build erneut geprüft');
  assert.equal(commitPruefungen[2].befehl[2], commitPruefungen[0].befehl[2], 'Beide Prüfungen verwenden denselben Klon');
  assert.equal(aufrufe[buildIndex + 2], commitPruefungen[3], 'Auch der Tag wird unmittelbar nach fdroid build erneut geprüft');
  assert.match(readFileSync(join(sicherung, 'quelle.log'), 'utf8'), new RegExp(abweichend));
});
}

for (const [modus, fehler] of [
  ['commit-fehlt', /required: --erwarteter-commit/],
  ['commit-ohne-wert', /--erwarteter-commit: expected one argument/],
  ...['commit-kurz', 'commit-ungueltig', 'commit-zu-lang', 'commit-leer', 'commit-zeilenumbruch']
    .map((modus) => [modus, /--erwarteter-commit:.*genau 40 Hex-Zeichen/]),
  ...['build-tag', 'build-commit-kurz', 'build-commit-gross']
    .map((modus) => [modus, /Feld commit.*genau 40 Hex-Zeichen/]),
  ['build-commit-abweichend', /Feld commit.*weicht von --erwarteter-commit ab/],
  ...['build-version', 'build-code', 'aktuelle-version', 'aktueller-code',
    'referenz-version', 'referenz-code', 'build-code-text', 'aktueller-code-text']
    .map((modus) => [modus, /Veröffentlichungsrezept und app-referenz\.json widersprechen sich/]),
  ['zweiter-build', /genau ein Build/],
]) {
  test(`Ungültige Release-Eingaben brechen vor externen Prozessen ab: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    assert.equal(lauf.status, modus.startsWith('commit-') ? 2 : 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stderr, fehler);
    assert.equal(existsSync(join(basis, 'arbeit')), false, 'Kein Laufordner für ungültige Eingaben');
    assert.equal(existsSync(join(basis, 'ausgabe')), false, 'Keine Ausgabe für ungültige Eingaben');
    assert.deepEqual(JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8')), []);
  });
}

for (const [modus, fehler] of [
  ['rezept-relativ', /Bitte absolute Linux-Pfade verwenden/],
  ['rezept-elternpfad', /Pfad enthält einen Verweis oder '\.\.'/],
  ['rezept-verweis', /Pfad enthält einen Verweis oder '\.\.'/],
]) {
  test(`Rezeptpfad wird vor dem Lesen geprüft: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stderr, fehler);
    assert.equal(existsSync(join(basis, 'arbeit')), false, 'Kein Laufordner für einen unzulässigen Rezeptpfad');
    assert.equal(existsSync(join(basis, 'ausgabe')), false, 'Keine Ausgabe für einen unzulässigen Rezeptpfad');
  });
}
