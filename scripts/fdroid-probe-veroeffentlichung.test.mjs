// Aufruf: node --test scripts/fdroid-probe-veroeffentlichung.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skript = join(wurzel, 'scripts/fdroid/probe-veroeffentlichung.sh');
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
HIER = basis / "scripts/fdroid"
HIER.mkdir(parents=True)
sys.platform = "linux"
os.getuid = lambda: 0 if modus == "root" else 1000
os.geteuid = lambda: 0 if modus == "root" else 1000
original_lesen = Path.read_text
def lesen(self, *args, **kwargs):
    if self == Path("/etc/os-release"):
        return 'ID=debian\nVERSION_ID="13"\n'
    return original_lesen(self, *args, **kwargs)
Path.read_text = lesen
shutil.which = lambda name, path=None: None if name in ("node", "nodejs", "npm", "npx") else name
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
json_schreiben(HIER.parent / "toolchain.json", vorgabe)
json_schreiben(HIER / "app-referenz.json", {"apk": {"bytes": len(apk_inhalt), "sha256": hashlib.sha256(apk_inhalt).hexdigest()}})
original = {"RepoType": "git", "Repo": REPO, "Binaries": "https://example.org/v%v/app_%c.apk",
            "Builds": [{"versionName": "0.2.0", "versionCode": 200, "commit": TAG}]}
rezept_datei = basis / "original.yml"
json_schreiben(rezept_datei, original)
aufrufe = []
abweichender_commit = "5843a92" + "0" * 33
klon_commit = abweichender_commit if modus == "tag-fehler" else COMMIT

class Prozess:
    def __init__(self, befehl, cwd, env, **kwargs):
        global klon_commit
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
            assert "--no-hardlinks" in befehl and befehl[befehl.index("--branch") + 1] == TAG
            ziel = Path(befehl[-1])
            ziel.mkdir()
            (ziel / ".git").mkdir()
        elif name == "git" and "rev-parse" in befehl:
            assert Path(befehl[2]) == cwd / "fdroid/build" / APPID
            assert befehl[-1] in ("HEAD", TAG + "^{commit}")
            text = klon_commit + "\n"
        elif name == "git" and "log" in befehl:
            text = "1790000000\n"
        elif name == "fdroid":
            assert befehl == ["fdroid", "build", "--verbose", APPID + ":200"]
            assert cwd.name == "fdroid"
            verwendet = json.loads((cwd / "metadata" / (APPID + ".yml")).read_text())
            assert "Binaries" not in verwendet
            assert json.loads(rezept_datei.read_text()) == original
            repo_erwartet = str(quellenersatz) if modus == "ersatz" else REPO
            assert verwendet["Repo"] == repo_erwartet
            assert (cwd / "build" / (".fdroidvcs-" + APPID)).read_text() == "git " + repo_erwartet
            assert not (cwd / ".git").exists()
            node = Path(env["HOME"]) / ".cache/fristenrechner-fdroid/node-v24.21.0-linux-x64/bin/node"
            node.parent.mkdir(parents=True)
            node.write_text("Node aus dem nachgestellten Rezept")
            gradle = cwd.parent / "fdroid-cache/versions/8.14.5/bin/gradle"
            gradle.parent.mkdir(parents=True)
            gradle.write_text("Gradle aus dem nachgestellten Build")
            (cwd.parent / "fdroid-cache/gradle-8.14.5-bin.zip").write_bytes(gradle_inhalt)
            (cwd / "unsigned").mkdir()
            (cwd / "unsigned" / (APPID + "_200.apk")).write_bytes(b"abweichendes-archiv!!" if modus == "apk-fehler" else apk_inhalt)
            (cwd / "logs").mkdir()
            (cwd / "logs/build-metadata.json").write_text("{}")
            self.code = 1 if modus == "build-fehler" else 0
            if modus == "tag-nach-build":
                # Der erste Klon war korrekt. Erst fdroidservers erneuter
                # Fetch/Checkout während des Builds übernimmt den verschobenen Tag.
                klon_commit = abweichender_commit
            text = "Nachgestellter fdroid-Build\n"
        elif name == "node":
            text = "v24.21.0\n"
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
code = main()
json_schreiben(basis / "aufrufe.json", aufrufe)
sys.exit(code)
`;

for (const modus of ['erfolg', 'ersatz', 'root', 'rezept-standard', 'apk-fehler', 'build-fehler']) {
  test(`Vollständiger Ablauf mit nachgestellten Prozessen: ${modus}`, { skip: !python }, () => {
    const basis = join(arbeit, modus);
    mkdirSync(basis);
    const lauf = auswerten(prozessNachstellung, [basis, modus]);
    const bestanden = ['erfolg', 'ersatz', 'root', 'rezept-standard'].includes(modus);
    assert.equal(lauf.status, bestanden ? 0 : 1, lauf.stdout + lauf.stderr);
    assert.match(lauf.stdout, bestanden ? /ERGEBNIS: bestanden/ : /ERGEBNIS: Nacharbeit nötig/);
    const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
    const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
    assert.equal(ergebnis.bestanden, bestanden);
    assert.equal(ergebnis.uid, modus === 'root' ? 0 : 1000);
    assert.equal(ergebnis.euid, modus === 'root' ? 0 : 1000);
    assert.equal(ergebnis.fdroidBuild, modus === 'build-fehler' ? 1 : 0);
    assert.equal(ergebnis.commitNachBuild, ergebnis.commit);
    assert.match(readFileSync(join(sicherung, 'build.log'), 'utf8'), /Nachgestellter fdroid-Build/);
    assert.ok(existsSync(join(sicherung, 'logs/build-metadata.json')));
    const original = JSON.parse(readFileSync(join(sicherung, 'rezept-original.yml'), 'utf8'));
    const verwendet = JSON.parse(readFileSync(join(sicherung, 'metadata/de.baremos.fristenrechner.yml'), 'utf8'));
    assert.ok(original.Binaries);
    assert.equal(verwendet.Binaries, undefined);
    const abweichungen = JSON.parse(readFileSync(join(sicherung, 'abweichungen.json'), 'utf8'));
    assert.ok(abweichungen.some((x) => x.includes('Binaries')));
    assert.equal(abweichungen.some((x) => x.includes('Quellenersatz')), modus === 'ersatz');
    assert.equal(abweichungen.some((x) => x.includes('Build läuft als root')), modus === 'root');
    const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
    assert.deepEqual(aufrufe.find((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build').befehl,
      ['fdroid', 'build', '--verbose', 'de.baremos.fristenrechner:200']);
    assert.equal(aufrufe.some((x) => x.befehl.includes('commit')), false);
  });
}

test('Abweichender Commit mit gleichem Kurzpräfix bricht vor fdroid build ab und sichert Belege', { skip: !python }, () => {
  const basis = join(arbeit, 'tag-fehler');
  mkdirSync(basis);
  const lauf = auswerten(prozessNachstellung, [basis, 'tag-fehler']);
  assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
  assert.match(lauf.stdout, /ERGEBNIS: Nacharbeit nötig.*Tag v0\.2\.0/);
  const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
  const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
  assert.equal(ergebnis.bestanden, false);
  assert.equal(ergebnis.fdroidBuild, null);
  assert.equal(ergebnis.commitNachBuild, null);
  assert.match(readFileSync(join(sicherung, 'probe.log'), 'utf8'), /erwarteten Stand/);
  const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
  assert.equal(aufrufe.some((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build'), false);
});

test('Erneuter Checkout eines verschobenen Tags während fdroid build scheitert trotz bytegleicher APK und sichert den Commit', { skip: !python }, () => {
  const basis = join(arbeit, 'tag-nach-build');
  mkdirSync(basis);
  const lauf = auswerten(prozessNachstellung, [basis, 'tag-nach-build']);
  assert.equal(lauf.status, 1, lauf.stdout + lauf.stderr);
  assert.match(lauf.stdout, /ERGEBNIS: Nacharbeit nötig.*HEAD nach fdroid build/);
  const sicherung = join(basis, 'ausgabe', readdirSync(join(basis, 'ausgabe'))[0]);
  const ergebnis = JSON.parse(readFileSync(join(sicherung, 'ergebnis.json'), 'utf8'));
  assert.equal(ergebnis.bestanden, false);
  assert.equal(ergebnis.fdroidBuild, 0, 'Der nachgestellte Build selbst war erfolgreich');
  assert.equal(ergebnis.commit, '5843a92bcc362e4169dc3b3804159006acefc8ac');
  assert.equal(ergebnis.commitNachBuild, '5843a92' + '0'.repeat(33));
  assert.match(ergebnis.fehler, /HEAD nach fdroid build.*5843a92/);
  assert.deepEqual(readFileSync(join(sicherung, 'unsigned/de.baremos.fristenrechner_200.apk')),
    readFileSync(join(basis, 'referenz.apk')), 'Selbst eine bytegleiche APK darf den falschen Commit nicht verdecken');
  const aufrufe = JSON.parse(readFileSync(join(basis, 'aufrufe.json'), 'utf8'));
  const buildIndex = aufrufe.findIndex((x) => x.befehl[0] === 'fdroid' && x.befehl[1] === 'build');
  assert.ok(buildIndex >= 0);
  const commitPruefungen = aufrufe.filter((x) => x.befehl[0] === 'git' && x.befehl.includes('rev-parse'));
  assert.deepEqual(commitPruefungen.map((x) => x.befehl.at(-1)), ['HEAD', 'v0.2.0^{commit}', 'HEAD']);
  assert.equal(aufrufe[buildIndex + 1], commitPruefungen[2], 'HEAD wird unmittelbar nach fdroid build erneut geprüft');
  assert.equal(commitPruefungen[2].befehl[2], commitPruefungen[0].befehl[2], 'Beide Prüfungen verwenden denselben Klon');
  assert.match(readFileSync(join(sicherung, 'quelle.log'), 'utf8'), new RegExp(ergebnis.commitNachBuild));
});

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
