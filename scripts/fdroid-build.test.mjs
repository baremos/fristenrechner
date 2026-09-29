// Offline-Prüfung der Vorbereitung des Builds und des npm-Inventars.
// Alle externen Prozesse im Python-Kern sind nachgestellt. Jeder Fall enthält
// eine Gegenprobe, deren Rückgabewert einen Fehler anzeigen muss.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hier = dirname(fileURLToPath(import.meta.url));
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)']).status === 0);
const scratchpad = resolve(hier, '../scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'fdroid-build-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

const pruefung = String.raw`
import contextlib, copy, hashlib, io, json, os, runpy, subprocess, sys, types
from pathlib import Path
from unittest.mock import patch
d = json.load(sys.stdin)
w = Path(d["arbeit"]).resolve()
w.mkdir(exist_ok=True)
skripte = Path(sys.argv[1]).resolve()
def modul(name):
    p = skripte / "fdroid" / name
    m = types.ModuleType(name)
    m.__file__ = str(p)
    exec(compile(p.read_text(encoding="utf-8"), str(p), "exec"), m.__dict__)
    return m
b = modul("build-lokal.py")
i = modul("npm-inventar.py")
vorgabe = json.loads((skripte / "toolchain.json").read_text(encoding="utf-8"))
rezept = json.loads(b.REZEPT.read_text(encoding="utf-8"))
repo = w / "repo"
repo.mkdir()
andere = w / "laeufe"
commit = rezept["Builds"][0]["commit"] + "0" * (40 - len(rezept["Builds"][0]["commit"]))
gegen = d["gegen"]
art = d["art"]
aufrufe = []
gradle_quelle = 'applicationId "' + b.APPID + '"\nversionName "1.0"\nversionCode 1\n'
wrapper_quelle = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-' + vorgabe["gradle"]["version"] + '-all.zip\ndistributionSha256Sum=' + vorgabe["gradle"]["sha256"]["all"] + '\n'
eingecheckt = []
def git(befehl, **kwargs):
    aufrufe.append(befehl)
    assert befehl[:2] == ["git", "-C"]
    if befehl[2] != str(repo):
        # Das Rezept wird nur im neuen Laufordner eingecheckt, mit dem Zeitpunkt der Quelle.
        assert Path(befehl[2]).parent == andere
        assert befehl[3] in ("init", "add", "commit")
        assert kwargs["env"]["GIT_AUTHOR_DATE"] == "@1700000000 +0000"
        assert kwargs["env"]["GIT_COMMITTER_DATE"] == "@1700000000 +0000"
        assert kwargs["env"]["GIT_CONFIG_GLOBAL"] == "/dev/null"
        eingecheckt.append(befehl[3:])
        return subprocess.CompletedProcess(befehl, 0, "", "")
    if befehl[3] == "log":
        assert befehl[4:] == ["-1", "--format=%ct", commit]
        text = "gestern" if gegen and art == "maineinchecken" else "1700000000"
    elif befehl[3:] == ["rev-parse", "--show-toplevel"]:
        text = str(repo)
    elif befehl[3] == "rev-parse":
        assert befehl[4:7] == ["--verify", "--quiet", "--end-of-options"]
        assert befehl[7] == rezept["Builds"][0]["commit"] + "^{commit}"
        text = "f" * 40 if gegen and art == "commit" else commit
    elif befehl[3] == "show":
        assert befehl[4].startswith(commit + ":")
        pfad = befehl[4].split(":", 1)[1]
        if pfad == "android/app/build.gradle":
            text = gradle_quelle
            if gegen and art == "appid": text = text.replace(b.APPID, "de.anderes.projekt")
            if gegen and art == "version": text = text.replace("versionCode 1", "versionCode 2")
        elif pfad.endswith("gradle-wrapper.properties"):
            text = wrapper_quelle
            if gegen and art == "gradleversion": text = text.replace(vorgabe["gradle"]["version"], "0.0.0")
            if gegen and art == "gradlehash": text = text.replace(vorgabe["gradle"]["sha256"]["all"], "0" * 64)
        elif pfad == "package-lock.json": text = "{}"
        else: raise AssertionError("Unbekannte Git-Datei: " + pfad)
    else: raise AssertionError("Unerwarteter Git-Aufruf")
    return subprocess.CompletedProcess(befehl, 0, text, "")

def run():
    if art == "pfade":
        r, a = b.pruefe_pfade(repo, repo if gegen else andere)
        assert r == repo and a == andere
    elif art == "enthalten":
        r, a = b.pruefe_pfade(repo, repo / "unterordner" if gegen else andere)
        assert r == repo and a == andere
    elif art == "verweis":
        normal = Path.resolve
        alias = w / "verweis"
        def aufloesen(self, *args, **kwargs):
            if self == alias: return repo if gegen else andere
            return normal(self, *args, **kwargs)
        with patch.object(Path, "resolve", aufloesen):
            assert b.pruefe_pfade(repo, alias) == (repo, andere)
    elif art in ("commit", "appid", "version", "gradleversion", "gradlehash"):
        with patch.object(b.subprocess, "run", git):
            assert b.pruefe_quelle(repo, rezept, vorgabe) == commit
        assert any("--end-of-options" in x for x in aufrufe)
    elif art == "rezept":
        normal = b.rezept_fuer_lauf(rezept, repo, commit)
        versuch = b.rezept_fuer_lauf(rezept, repo, commit, True)
        assert "scandelete" not in rezept["Builds"][0]
        assert "scandelete" not in normal["Builds"][0]
        assert versuch["Builds"][0]["scandelete"] == ["node_modules"]
        assert normal["Repo"] == repo.as_uri()
        assert normal["Builds"][0]["commit"] == commit
        # Ein Prüfer für die Basisprobe muss den ausdrücklichen Versuch ablehnen.
        zu_pruefen = versuch if gegen else normal
        if "scandelete" in zu_pruefen["Builds"][0]:
            raise ValueError("Basisprobe darf scandelete nicht enthalten")
    elif art == "json":
        datei = w / "bericht.json"
        b.neue_json(datei, {"probe": "größer"})
        assert json.loads(datei.read_text(encoding="utf-8")) == {"probe": "größer"}
        if gegen:
            try: b.neue_json(datei, {"ersetzt": True})
            finally: assert json.loads(datei.read_text(encoding="utf-8")) == {"probe": "größer"}
    elif art == "umgebung":
        verseucht = {"PATH": "C:/fremd", "GRADLE_USER_HOME": "fremd", "CACHEDIR": "fremd", "NODE_OPTIONS": "fremd", "npm_config_cache": "fremd", "HTTPS_PROXY": "fremd", "TEMP": "fremd"}
        with patch.dict(os.environ, verseucht):
            env = b.lauf_umgebung(w, w / "node", w / "jdk", w / "sdk")
        assert env["PATH"].endswith(b.SYSTEMPFAD)
        assert env["PATH"].startswith(str(w / "node/bin") + ":" + str(w / "jdk/bin") + ":")
        assert not {"NODE_OPTIONS", "HTTPS_PROXY", "CACHEDIR"} & env.keys()
        caches = [env[k] for k in ("GRADLE_USER_HOME", "XDG_CACHE_HOME", "npm_config_cache")]
        assert len(set(caches)) == 3
        assert all(Path(x).is_relative_to(w) for x in caches)
        assert env["TEMP"] == env["TMP"] == env["TMPDIR"] == str(w / "tmp")
        assert env["npm_config_ignore_scripts"] == "true"
        if gegen: env["CACHEDIR"] = "fremd"
        if "CACHEDIR" in env:
            raise ValueError("Fremder Zwischenspeicher")
    elif art in ("archiv", "archivort"):
        (w / "fdroid-cache").mkdir()
        (w / "gradlew-cache").mkdir()
        inhalt = b"Archivprobe"
        vorgabe["gradle"]["sha256"]["bin"] = hashlib.sha256(inhalt).hexdigest()
        name = "gradle-" + vorgabe["gradle"]["version"] + "-bin.zip"
        # Ein korrektes Archiv am alten Ort darf das fehlende/falsche
        # Archiv am von F-Droid tatsächlich verwendeten Ort nicht ersetzen.
        (w / "gradlew-cache" / name).write_bytes(inhalt)
        p = w / "fdroid-cache" / name
        if not (gegen and art == "archivort"):
            p.write_bytes(b"abweichend" if gegen else inhalt)
        ergebnis = b.pruefe_gradle_archiv(w, vorgabe)
        assert ergebnis["bytes"] == len(inhalt)
        assert ergebnis["sha256"] == vorgabe["gradle"]["sha256"]["bin"]
        assert ergebnis["pfad"] == "fdroid-cache/" + name
    elif art == "inventar":
        root = w / "node_modules"
        root.mkdir()
        for name, inhalt in {"elf-ohne-endung": b"\x7fELFprobe", "wasm-ohne-endung": b"\x00asmprobe", "modul.NODE": b"datei", "unauffaellig.js": b"export {}"}.items():
            (root / name).write_bytes(inhalt)
        funde = i.inventar(root)
        assert {x["pfad"] for x in funde} == {"elf-ohne-endung", "wasm-ohne-endung", "modul.NODE"}
        for f in funde:
            assert f["sha256"] == hashlib.sha256((root / f["pfad"]).read_bytes()).hexdigest()
            assert f["bytes"] == (root / f["pfad"]).stat().st_size
        if gegen: i.inventar(w / "fehlt")
    elif art == "inventarverweis":
        root = w / "node_modules"
        root.mkdir()
        (root / "probe.wasm").write_bytes(b"\x00asm")
        normal = Path.is_symlink
        def verweis(self):
            return True if self == root and gegen else normal(self)
        with patch.object(Path, "is_symlink", verweis):
            assert len(i.inventar(root)) == 1
    elif art == "inventarlesefehler":
        root = w / "node_modules"
        root.mkdir()
        (root / "probe.wasm").write_bytes(b"\x00asm")
        normal_walk = os.walk
        def lesen(pfad, *, followlinks, onerror):
            assert followlinks is False
            assert callable(onerror)
            if gegen:
                onerror(PermissionError("Nachgestellter Lesefehler des Inventars"))
            yield from normal_walk(pfad, followlinks=followlinks, onerror=onerror)
        with patch.object(i.os, "walk", lesen):
            assert len(i.inventar(root)) == 1
    elif art == "inventarausgabe":
        root = w / "node_modules"
        root.mkdir()
        ziel = w / "npm.json"
        with patch.object(sys, "argv", ["npm-inventar.py", str(root), str(ziel)]):
            i.main()
            assert json.loads(ziel.read_text(encoding="utf-8")) == []
            if gegen:
                try: i.main()
                finally: assert json.loads(ziel.read_text(encoding="utf-8")) == []
    elif art == "mainprobelauf":
        vorher = sorted(str(p.relative_to(w)) for p in w.rglob("*"))
        try:
            with patch.object(b.subprocess, "run", git), patch.object(Path, "mkdir", side_effect=AssertionError("Probelauf darf keine Ordner anlegen")), patch.object(b.tempfile, "mkdtemp", side_effect=AssertionError("Probelauf darf keine Arbeitsdateien anlegen")), patch.dict(os.environ, {"XDG_DATA_HOME": "relativ" if gegen else str(w / "daten")}):
                code = b.main(["--repo", str(repo), "--arbeitsordner", str(andere), "--probelauf"])
            assert code == 0
            assert aufrufe and all(x[0] == "git" for x in aufrufe)
        finally:
            assert sorted(str(p.relative_to(w)) for p in w.rglob("*")) == vorher
            assert not andere.exists()
    elif art in ("mainbuild", "mainsignal", "mainauswertung", "mainarchiv", "mainjdkjava", "mainjdkjavac", "maineinchecken"):
        h = w / "skripte/fdroid"
        h.mkdir(parents=True)
        b.HIER = h
        b.REZEPT = h / b.REZEPT.name
        b.REZEPT.write_text(json.dumps(rezept), encoding="utf-8")
        (h / "npm-inventar.py").write_text("# Testkopie", encoding="utf-8")
        datenbasis = w / "daten"
        pin = vorgabe["gradlewFdroid"]
        starter = datenbasis / pin["benutzerOrdner"] / pin["commit"] / pin["datei"]
        starter.parent.mkdir(parents=True)
        starter.write_bytes(b"Buildwerkzeug wird im Test nie ausgefuehrt")
        starter.chmod(0o755)
        pin["sha256"] = hashlib.sha256(starter.read_bytes()).hexdigest()
        archivinhalt = b"Gradle-Archivprobe"
        vorgabe["gradle"]["sha256"]["bin"] = hashlib.sha256(archivinhalt).hexdigest()
        (h.parent / "toolchain.json").write_text(json.dumps(vorgabe), encoding="utf-8")
        baucode = -9 if gegen and art == "mainsignal" else (7 if gegen and art == "mainbuild" else 0)
        auswertcode = 8 if gegen and art == "mainauswertung" else 0
        aufrufarten = []
        jdk_aufrufe = []
        def extern(befehl, **kwargs):
            if befehl[0] == "git": return git(befehl, **kwargs)
            if befehl == ["fdroid", "--version"]: text = "2.4.2"
            elif befehl[0].endswith("bin" + os.sep + "node"): text = "v" + vorgabe["node"]["referenz"]
            elif befehl[0].endswith("bin" + os.sep + "npm"): text = vorgabe["npm"]["referenz"]
            elif befehl[0].endswith("bin" + os.sep + "java"):
                assert befehl[1:] == ["-version"]
                jdk_aufrufe.append("java")
                version = "17.0.1" if gegen and art == "mainjdkjava" else "21.0.12.1"
                return subprocess.CompletedProcess(befehl, 0, "", 'openjdk version "' + version + '"\n')
            elif befehl[0].endswith("bin" + os.sep + "javac"):
                assert befehl[1:] == ["-version"]
                jdk_aufrufe.append("javac")
                text = "javac 17.0.1" if gegen and art == "mainjdkjavac" else "javac 21.0.12.1"
            elif befehl[0] == "bash":
                assert "--nur-pruefen" in befehl and "--ohne-testgruppe" in befehl
                assert "--sdk-root" in befehl and "--java-home" in befehl
                aufrufarten.append("sdk")
                text = ""
            elif befehl[:2] == ["fdroid", "build"]:
                aufrufarten.append("build")
                lauf = Path(kwargs["cwd"])
                assert lauf.parent == andere
                assert kwargs["env"]["TEMP"] == str(lauf / "tmp")
                assert "CACHEDIR" not in kwargs["env"]
                kwargs["stdout"].write("Nachgestellter Build\n")
                # F-Droid setzt CACHEDIR aus config.yml, wie in den echten Läufen.
                cache = Path(json.loads((lauf / "config.yml").read_text(encoding="utf-8"))["cachedir"])
                assert cache == lauf / "fdroid-cache"
                cache.mkdir()
                archive = cache / ("gradle-" + vorgabe["gradle"]["version"] + "-bin.zip")
                archive.write_bytes(b"abweichend" if gegen and art == "mainarchiv" else archivinhalt)
                return subprocess.CompletedProcess(befehl, baucode)
            elif len(befehl) > 1 and befehl[1].endswith("build-auswerten.py"):
                aufrufarten.append("auswertung")
                assert befehl[-1] == str(128 - baucode if baucode < 0 else baucode)
                return subprocess.CompletedProcess(befehl, auswertcode)
            else: raise AssertionError("Nicht nachgestellter Prozess: " + repr(befehl))
            return subprocess.CompletedProcess(befehl, 0, text, "")
        try:
            with patch.object(b.subprocess, "run", extern), patch.object(sys, "platform", "linux"), patch.dict(os.environ, {"XDG_DATA_HOME": str(datenbasis)}):
                code = b.main(["--repo", str(repo), "--arbeitsordner", str(andere), "--jdk", str(w / "jdk")])
        finally:
            if gegen and art in ("mainjdkjava", "mainjdkjavac"):
                assert aufrufarten == []
                assert not andere.exists()
                assert jdk_aufrufe == (["java"] if art == "mainjdkjava" else ["java", "javac"])
            if gegen and art == "maineinchecken":
                # Ohne lesbaren Zeitpunkt wird nichts eingecheckt und nichts gebaut.
                assert eingecheckt == []
                assert aufrufarten == ["sdk"]
        assert aufrufarten == ["sdk", "build", "auswertung"]
        lauf = next(andere.glob("lauf-*"))
        assert eingecheckt == [["init", "--quiet", "--initial-branch=probe"],
                               ["add", "--", "metadata/" + b.REZEPT.name],
                               ["commit", "--quiet", "--message", "Rezept der lokalen Probe"]]
        assert json.loads((lauf / "lauf.json").read_text(encoding="utf-8"))["zeitpunktDesRezepts"] == 1700000000
        assert jdk_aufrufe == ["java", "javac"]
        assert repo.is_dir()
        assert len(list(andere.glob("lauf-*"))) == 1
        lauf = next(andere.glob("lauf-*"))
        assert json.loads((lauf / "rueckgabe.json").read_text(encoding="utf-8")) == {"fdroidBuild": baucode}
        if not (gegen and art == "mainarchiv"):
            nachweis = json.loads((lauf / "gradle-archiv.json").read_text(encoding="utf-8"))
            assert nachweis["pfad"].startswith("fdroid-cache/")
            assert nachweis["sha256"] == vorgabe["gradle"]["sha256"]["bin"]
        if code: raise ValueError("Build, Auswertung oder Archivprüfung meldet Fehler")
    else: raise AssertionError("Unbekannte Prüfung")

try:
    run()
except (ValueError, OSError) as exc:
    print("GEGENPROBE: " + str(exc))
    sys.exit(2)
print("PRUEFUNG: bestanden")
`;

function laufe(art, gegen) {
  const ordner = mkdtempSync(join(arbeit, 'fall-'));
  return spawnSync(python, ['-B', '-c', pruefung, hier], {
    input: JSON.stringify({ arbeit: ordner, art, gegen }),
    encoding: 'utf8',
    env: { ...process.env, TEMP: arbeit, TMP: arbeit, TMPDIR: arbeit, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  });
}

for (const [art, name, fehler] of [
  ['pfade', 'Getrennte Ordner; Gegenprobe gleicher Ordner', /einander nicht enthalten/],
  ['enthalten', 'Getrennte Ordner; Gegenprobe Arbeitsordner innerhalb Quelle', /einander nicht enthalten/],
  ['verweis', 'Aufgelöste Pfade; Gegenprobe nachgestellter Verweis auf Quelle', /einander nicht enthalten/],
  ['commit', 'Festgelegter Commit mit --end-of-options; Gegenprobe anderer Commit', /festgehaltenen Commit/],
  ['appid', 'App-ID aus eingechecktem Stand; Gegenprobe andere App-ID', /applicationId/],
  ['version', 'Version aus eingechecktem Stand; Gegenprobe anderer versionCode', /versionCode/],
  ['gradleversion', 'Gradle-Version aus Wrapper; Gegenprobe andere Version', /Gradle-Version/],
  ['gradlehash', 'Gradle-Prüfsumme aus Wrapper; Gegenprobe andere Prüfsumme', /Gradle-Prüfsumme/],
  ['rezept', 'Basisrezept ohne scandelete; Gegenprobe ausdrücklicher Versuch', /Basisprobe darf/],
  ['json', 'Neue JSON-Datei; Gegenprobe vorhandener Bericht bleibt erhalten', /GEGENPROBE:/],
  ['umgebung', 'Eigene Caches, TEMP und bereinigter PATH; Gegenprobe fremder Cache', /Fremder Zwischenspeicher/],
  ['archiv', 'Gradle-Archiv gegen Vorgabe; Gegenprobe abweichende Bytes', /weicht von toolchain.json ab/],
  ['archivort', 'Gradle-Archiv im F-Droid-Cache; Gegenprobe nur am alten Ort vorhanden', /Gradle-Archiv fehlt/],
  ['inventar', 'ELF, WASM und Endung im Inventar; Gegenprobe fehlende Wurzel', /node_modules fehlt/],
  ['inventarverweis', 'Normale Inventarwurzel; Gegenprobe nachgestellter Verweis', /symbolischer Verweis/],
  ['inventarlesefehler', 'Lesbares Inventar; Gegenprobe os.walk meldet einen Lesefehler', /Lesefehler des Inventars/],
  ['inventarausgabe', 'Inventar schreibt neue Datei; Gegenprobe bestehende Datei', /GEGENPROBE:/],
  ['mainprobelauf', 'Probelauf liest nur Git und schreibt nichts; Gegenprobe relatives XDG_DATA_HOME', /absoluter Pfad/],
  ['mainjdkjava', 'Build mit OpenJDK 21; Gegenprobe Java 17 stoppt vor SDK und Build', /java.*OpenJDK 21/],
  ['mainjdkjavac', 'Build mit javac 21; Gegenprobe javac 17 stoppt vor SDK und Build', /javac.*OpenJDK 21/],
  ['maineinchecken', 'Rezept im Laufordner eingecheckt, mit dem Zeitpunkt der Quelle; Gegenprobe Zeitpunkt nicht lesbar', /Zeitpunkt des Commits ist nicht lesbar/],
  ['mainbuild', 'Vollständiger nachgestellter Lauf; Gegenprobe fdroid scheitert', /meldet Fehler/],
  ['mainsignal', 'Vollständiger nachgestellter Lauf; Gegenprobe Signal -9 wird als 137 ausgewertet', /meldet Fehler/],
  ['mainauswertung', 'Vollständiger nachgestellter Lauf; Gegenprobe Auswertung scheitert', /meldet Fehler/],
  ['mainarchiv', 'Vollständiger nachgestellter Lauf; Gegenprobe Gradle-Archiv abweichend', /meldet Fehler/],
]) {
  test(name, { skip: !python && 'Python ab 3.11 fehlt' }, () => {
    const ok = laufe(art, false);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /PRUEFUNG: bestanden/);
    const falsch = laufe(art, true);
    assert.equal(falsch.status, 2, falsch.stdout + falsch.stderr);
    assert.match(falsch.stdout, fehler);
  });
}
