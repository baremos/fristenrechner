#!/usr/bin/env python3
"""Bereitet die lokale Minimal-App-Probe vor und startet fdroid build.

Kein Download im Probelauf. Der echte Lauf lädt npm-, Gradle- und Maven-
Abhängigkeiten. Er installiert nichts im System und löscht keine angegebenen
Ordner. F-Droid bearbeitet ausschließlich seinen neu angelegten Klon.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HIER = Path(__file__).resolve().parent
REZEPT = HIER / "de.baremos.fristenrechner.probe.yml"
APPID = REZEPT.stem
SYSTEMPFAD = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"


def ausgabe(befehl, **kwargs):
    lauf = subprocess.run(befehl, text=True, encoding="utf-8", errors="strict",
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if lauf.returncode:
        raise ValueError(f"{befehl[0]} endete mit {lauf.returncode}: {lauf.stderr.strip()}")
    return lauf.stdout.strip()


def pruefe_pfade(repo, arbeit):
    repo, arbeit = Path(repo).resolve(), Path(arbeit).resolve()
    if not repo.is_dir():
        raise ValueError("Das lokale Repository fehlt")
    if repo == arbeit or repo in arbeit.parents or arbeit in repo.parents:
        raise ValueError("Repository und Arbeitsordner dürfen einander nicht enthalten")
    return repo, arbeit


def pruefe_quelle(repo, rezept, vorgabe):
    if Path(ausgabe(["git", "-C", str(repo), "rev-parse", "--show-toplevel"])).resolve() != repo:
        raise ValueError("--repo muss die Wurzel des Git-Repositorys nennen")
    stand = rezept["Builds"][0]["commit"]
    commit = ausgabe(["git", "-C", str(repo), "rev-parse", "--verify", "--quiet",
                      "--end-of-options", f"{stand}^{{commit}}"])
    if not re.fullmatch(r"[0-9a-f]{40}", commit) or not commit.startswith(stand):
        raise ValueError("Die Minimal-App hat nicht den festgehaltenen Commit")
    def quelle(pfad):
        return ausgabe(["git", "-C", str(repo), "show", f"{commit}:{pfad}"])
    gradle = quelle("android/app/build.gradle")
    for schluessel, erwartet in (("applicationId", APPID), ("versionName", "1.0"), ("versionCode", "1")):
        werte = re.findall(rf'^\s*{schluessel}\s+[\'"]?([^\s\'";]+)[\'"]?\s*$', gradle, re.M)
        if werte != [erwartet]:
            raise ValueError(f"Unerwartete Angabe zu {schluessel} im eingecheckten Stand")
    wrapper = quelle("android/gradle/wrapper/gradle-wrapper.properties")
    version = vorgabe["gradle"]["version"]
    if not re.search(rf"^distributionUrl=.*?/gradle-{re.escape(version)}-all\.zip$", wrapper, re.M):
        raise ValueError("Gradle-Version im Wrapper weicht ab")
    if f'distributionSha256Sum={vorgabe["gradle"]["sha256"]["all"]}' not in wrapper.splitlines():
        raise ValueError("Gradle-Prüfsumme im Wrapper weicht ab")
    quelle("package-lock.json")
    return commit


def rezept_fuer_lauf(vorlage, repo, commit, scandelete=False):
    rezept = copy.deepcopy(vorlage)
    rezept["Repo"] = Path(repo).as_uri()
    rezept["Builds"][0]["commit"] = commit
    # Nur der gesondert bezeichnete Vergleichslauf erhält diesen Kandidaten.
    # Keine Festlegung zu F5 und keine Scan-Ausnahme für die spätere App.
    if scandelete:
        rezept["Builds"][0]["scandelete"] = ["node_modules"]
    return rezept


def neue_json(datei, inhalt):
    with Path(datei).open("x", encoding="utf-8", newline="\n") as ziel:
        json.dump(inhalt, ziel, ensure_ascii=False, indent=2)
        ziel.write("\n")


def lauf_umgebung(lauf, node, jdk, sdk):
    # Nur nötige Variablen übernehmen. Keine fremden npm-/Gradle-Optionen,
    # Windows-Pfade, Proxy-Zugangsdaten oder vorgegebenen Zwischenspeicher.
    env = {name: os.environ[name] for name in ("HOME", "USER", "LOGNAME") if name in os.environ}
    env.update({"PATH": f"{node / 'bin'}:{jdk / 'bin'}:{SYSTEMPFAD}",
                "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "CI": "true",
                "JAVA_HOME": str(jdk), "ANDROID_HOME": str(sdk), "ANDROID_SDK_ROOT": str(sdk),
                "CACHEDIR": str(lauf / "gradlew-cache"),
                "GRADLE_USER_HOME": str(lauf / "gradle-home"),
                "XDG_CACHE_HOME": str(lauf / "cache"),
                "npm_config_cache": str(lauf / "npm-cache"),
                "npm_config_userconfig": str(lauf / "npmrc"),
                "npm_config_ignore_scripts": "true", "npm_config_update_notifier": "false",
                "ASTRO_TELEMETRY_DISABLED": "1", "PYTHONDONTWRITEBYTECODE": "1",
                "TMPDIR": str(lauf / "tmp"), "TEMP": str(lauf / "tmp"), "TMP": str(lauf / "tmp"),
                "FR_FDROID_LAUF": str(lauf), "FR_FDROID_INVENTAR": str(lauf / "npm-inventar.py")})
    return env


def pruefe_gradle_archiv(lauf, vorgabe):
    gradle = vorgabe["gradle"]
    archiv = lauf / "gradlew-cache" / f'gradle-{gradle["version"]}-bin.zip'
    if archiv.is_symlink() or not archiv.is_file():
        raise ValueError("Das Gradle-Archiv fehlt im eigenen Cache")
    with archiv.open("rb") as datei:
        summe = hashlib.file_digest(datei, "sha256").hexdigest()
    if summe != gradle["sha256"]["bin"]:
        raise ValueError("Das geladene Gradle-Archiv weicht von toolchain.json ab")
    return {"datei": archiv.name, "sha256": summe, "bytes": archiv.stat().st_size}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.home() / "fdroid-probe/skript/minimal-app")
    parser.add_argument("--arbeitsordner", type=Path, default=Path.home() / "fdroid-probe/build-laeufe")
    parser.add_argument("--jdk", type=Path, default=Path("/usr/lib/jvm/java-21-openjdk-amd64"))
    parser.add_argument("--probelauf", action="store_true")
    parser.add_argument("--versuch-scandelete", action="store_true",
                        help="Vergleichsprobe: Scanner entfernt beanstandete Dateien unter node_modules")
    args = parser.parse_args(argv)
    vorgabe = json.loads((HIER.parent / "toolchain.json").read_text(encoding="utf-8"))
    vorlage = json.loads(REZEPT.read_text(encoding="utf-8"))  # JSON ist auch gültiges YAML.
    repo, arbeit = pruefe_pfade(args.repo, args.arbeitsordner)
    commit = pruefe_quelle(repo, vorlage, vorgabe)
    basis = Path(os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local/share"))
    if not basis.is_absolute():
        raise ValueError("XDG_DATA_HOME muss ein absoluter Pfad sein")
    basis = basis.resolve()
    node = basis / "fristenrechner/node" / f'node-v{vorgabe["node"]["referenz"]}-linux-x64'
    sdk = basis / vorgabe["android"]["sdkOrdner"]
    pin = vorgabe["gradlewFdroid"]
    wrapper = basis / pin["benutzerOrdner"] / pin["commit"] / pin["datei"]
    jdk = args.jdk.resolve()
    rezept = rezept_fuer_lauf(vorlage, repo, commit, args.versuch_scandelete)
    print(f"Quelle: {repo}\nCommit: {commit}\nLäufe: {arbeit}\nGradle-Starter: {wrapper}", flush=True)
    print("Netz im echten Lauf: npm-Registry, Gradle-Prüfsummen, Gradle-Archiv, Maven-Abhängigkeiten.", flush=True)
    print("Scanner: " + ("Vergleich mit scandelete=node_modules (F5 offen)" if args.versuch_scandelete
                           else "ohne scandelete; vorgebaute npm-Dateien können den Build stoppen"), flush=True)
    if args.probelauf:
        print(json.dumps(rezept, ensure_ascii=False, indent=2))
        print("PROBELAUF: kein Download, kein fdroid-Aufruf, kein neuer Ordner")
        return 0
    if sys.platform != "linux":
        raise ValueError("Der echte Build ist nur unter Linux vorgesehen")
    if wrapper.is_symlink() or not wrapper.is_file() or not os.access(wrapper, os.X_OK):
        raise ValueError("gradlew.py fehlt, ist nicht ausführbar oder ist ein Verweis")
    if hashlib.sha256(wrapper.read_bytes()).hexdigest() != pin["sha256"]:
        raise ValueError("gradlew.py weicht von der festgelegten Prüfsumme ab")
    werkzeug_env = dict(os.environ, PATH=f"{node / 'bin'}:{jdk / 'bin'}:{SYSTEMPFAD}", LC_ALL="C.UTF-8")
    if not re.fullmatch(r"(?:fdroidserver\s+)?2\.4\.2", ausgabe(["fdroid", "--version"], env=werkzeug_env)):
        raise ValueError("Es gilt fdroidserver 2.4.2")
    if ausgabe([str(node / "bin/node"), "--version"], env=werkzeug_env) != "v" + vorgabe["node"]["referenz"]:
        raise ValueError("Node-Version weicht ab")
    if ausgabe([str(node / "bin/npm"), "--version"], env=werkzeug_env) != vorgabe["npm"]["referenz"]:
        raise ValueError("npm-Version weicht ab")
    for programm in ("java", "javac"):
        java = subprocess.run([str(jdk / "bin" / programm), "-version"], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=werkzeug_env)
        text = java.stdout + java.stderr
        muster = r'openjdk version "21\.' if programm == "java" else r"javac 21\."
        if java.returncode or not re.search(muster, text):
            raise ValueError(f"{programm} im gewählten JDK entspricht nicht OpenJDK 21")
    # Die vorhandene SDK-Prüfung führt keinen Download aus; Rückgabewert zählt.
    subprocess.run(["bash", str(HIER.parent / "android-sdk-einrichten.sh"), "--nur-pruefen",
                    "--ohne-testgruppe", "--sdk-root", str(sdk), "--java-home", str(jdk)], check=True,
                   env=dict(werkzeug_env, JAVA_HOME=str(jdk)))
    arbeit.mkdir(parents=True, exist_ok=True)
    lauf = Path(tempfile.mkdtemp(prefix="lauf-", dir=arbeit))
    print(f"Lauf: {lauf}", flush=True)
    for name in ("metadata", "tmp"):
        (lauf / name).mkdir()
    (lauf / "npmrc").write_text("ignore-scripts=true\n", encoding="utf-8")
    shutil.copyfile(HIER / "npm-inventar.py", lauf / "npm-inventar.py")
    shutil.copyfile(HIER.parent / "toolchain.json", lauf / "toolchain.json")
    neue_json(lauf / "metadata" / REZEPT.name, rezept)
    neue_json(lauf / "config.yml", {"sdk_path": str(sdk), "gradle": str(wrapper),
                                   "java_paths": {"21": str(jdk)}, "cachedir": str(lauf / "fdroid-cache")})
    befehl = ["fdroid", "build", "--verbose", f"{APPID}:1"]
    neue_json(lauf / "lauf.json", {"commit": commit, "repo": str(repo), "befehl": befehl,
                                  "scandeleteVersuch": args.versuch_scandelete,
                                  "gradlewSha256": pin["sha256"]})
    env = lauf_umgebung(lauf, node, jdk, sdk)
    with (lauf / "build.log").open("x", encoding="utf-8") as protokoll:
        ergebnis = subprocess.run(befehl, cwd=lauf, env=env, stdout=protokoll, stderr=subprocess.STDOUT)
    neue_json(lauf / "rueckgabe.json", {"fdroidBuild": ergebnis.returncode})
    # Auch bei Fehlern das vollständige Protokoll auswerten.
    # Python meldet Signale negativ; für den Auswerter wie in der Shell 128+Signal.
    auswert_code = 128 - ergebnis.returncode if ergebnis.returncode < 0 else ergebnis.returncode
    auswertung = subprocess.run([sys.executable, str(HIER / "build-auswerten.py"), str(lauf),
                                APPID, "1.0", "1", str(auswert_code)], env=env)
    try:
        neue_json(lauf / "gradle-archiv.json", pruefe_gradle_archiv(lauf, vorgabe))
    except (OSError, ValueError) as fehler:
        print(f"Gradle-Nachweis fehlt: {fehler}", file=sys.stderr)
        return 1
    return 0 if ergebnis.returncode == 0 and auswertung.returncode == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as fehler:
        print(f"Build-Probe gescheitert: {fehler}", file=sys.stderr)
        sys.exit(1)
