#!/bin/bash
# Debian 13: frischer lokaler Build des Veröffentlichungsrezepts.
# Alle temporären Dateien und Werkzeugkopien bleiben im Arbeitsordner.
# Python liest YAML und Dateiprüfsummen; es werden keine Pakete installiert.
set -euo pipefail
hier="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 \
  PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 - "$hier" "$@" <<'PY'
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

HIER = Path(sys.argv[1])
APPID = "de.baremos.fristenrechner"
REPO = "https://github.com/baremos/fristenrechner.git"
SYSTEMPFAD = "/usr/sbin:/usr/bin:/sbin:/bin"


def sha256(datei):
    with Path(datei).open("rb") as quelle:
        return hashlib.file_digest(quelle, "sha256").hexdigest()


def apk_daten(datei):
    datei = Path(datei)
    if not datei.is_file() or datei.is_symlink():
        raise ValueError("APK fehlt oder ist ein symbolischer Verweis: " + str(datei))
    return {"bytes": datei.stat().st_size, "sha256": sha256(datei)}


def json_schreiben(datei, daten):
    with Path(datei).open("x", encoding="utf-8") as ziel:
        json.dump(daten, ziel, ensure_ascii=False, indent=2)
        ziel.write("\n")


def sudo_befehl(zeilen):
    # Dieselbe Verkettung und dieselben Bash-Optionen wie fdroidserver 2.4.2.
    return ["bash", "-e", "-u", "-o", "pipefail", "-x", "-c", "; ".join(zeilen)]


def pfad(wert):
    datei = Path(wert)
    if not datei.is_absolute():
        raise ValueError("Bitte absolute Linux-Pfade verwenden: " + wert)
    if any(teil in str(datei) for teil in ("\n", "\r", "\0")):
        raise ValueError("Steuerzeichen im Pfad")
    if datei.absolute() != datei.resolve():
        raise ValueError("Pfad enthält einen Verweis oder '..': " + wert)
    return datei


def vollstaendiger_commit(wert):
    if not re.fullmatch(r"[0-9a-fA-F]{40}", wert):
        raise argparse.ArgumentTypeError("Erwartet werden genau 40 Hex-Zeichen; Commit-Kurzformen sind nicht zulässig.")
    return wert.lower()


def main():
    parser = argparse.ArgumentParser(description="Veröffentlichungsrezept mit fdroidserver 2.4.2 unter Debian 13 bauen.")
    parser.add_argument("--erwarteter-commit", required=True, type=vollstaendiger_commit, help="erwarteter Commit des Tags: genau 40 Hex-Zeichen")
    parser.add_argument("--arbeitsordner", required=True, help="Basis für einen neuen probe-* Ordner; nichts wird gelöscht")
    parser.add_argument("--ausgabeordner", required=True, help="Basis für eine neue Kopie der Protokolle und Metadaten")
    parser.add_argument("--referenz-apk", required=True, help="unsignierte Referenz-APK")
    parser.add_argument("--sdk", required=True, help="vorhandenes Android SDK; wird in den Laufordner kopiert")
    parser.add_argument("--gradlew", required=True, help="vorhandenes gepinntes gradlew.py; wird geprüft und kopiert")
    parser.add_argument("--jdk", default="/usr/lib/jvm/java-21-openjdk-amd64")
    parser.add_argument("--quelle", help="lokaler Klon oder Git-Bundle als ausdrücklich gewählter Quellenersatz")
    parser.add_argument("--rezept", default=str(HIER / "veroeffentlichung" / (APPID + ".yml")))
    args = parser.parse_args(sys.argv[2:])
    if sys.platform != "linux":
        raise ValueError("Diese Probe benötigt Debian 13 unter Linux/WSL.")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    if release.get("ID", "").strip('"') != "debian" or release.get("VERSION_ID", "").strip('"') != "13":
        raise ValueError("Diese Probe setzt Debian 13 voraus.")
    for name in ("node", "nodejs", "npm", "npx"):
        if shutil.which(name, path=SYSTEMPFAD):
            raise ValueError(name + " ist bereits im Systempfad. Eine Umgebung ohne systemweite Node-Installation verwenden; die Probe entfernt keine Pakete.")
    for name in ("fdroid", "git", "bash", "curl", "tar", "sha256sum", "cp"):
        if not shutil.which(name, path=SYSTEMPFAD):
            raise ValueError("Voraussetzung fehlt im Systempfad: " + name)
    from fdroidserver._yaml import yaml
    rezept_datei = pfad(args.rezept)
    with rezept_datei.open(encoding="utf-8") as quelle:
        rezept = yaml.load(quelle)
    soll = json.loads((HIER / "app-referenz.json").read_text(encoding="utf-8"))
    version = soll.get("versionName")
    versionscode = soll.get("versionCode")
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) or type(versionscode) is not int or versionscode <= 0:
        raise ValueError("app-referenz.json muss einen Versionsnamen mit drei numerischen Bestandteilen und einen positiven ganzzahligen Versionscode enthalten.")
    tag = "v" + version
    builds = rezept.get("Builds", [])
    if not isinstance(builds, list) or len(builds) != 1 or not isinstance(builds[0], dict):
        raise ValueError("Erwartet wird genau ein Build im Veröffentlichungsrezept.")
    if (builds[0].get("commit") != tag or builds[0].get("versionName") != version
            or type(builds[0].get("versionCode")) is not int or builds[0]["versionCode"] != versionscode
            or rezept.get("CurrentVersion") != version
            or type(rezept.get("CurrentVersionCode")) is not int or rezept["CurrentVersionCode"] != versionscode):
        raise ValueError("Veröffentlichungsrezept und app-referenz.json widersprechen sich: erwartet wird "
                         + version + " / " + str(versionscode) + " am Tag " + tag
                         + " mit übereinstimmenden CurrentVersion/CurrentVersionCode.")
    if rezept.get("RepoType") != "git" or rezept.get("Repo", "").removesuffix(".git") != REPO.removesuffix(".git"):
        raise ValueError("Das Originalrezept muss auf das öffentliche GitHub-Repository zeigen.")
    sudo = builds[0].get("sudo", [])
    if isinstance(sudo, str):
        sudo = [sudo]
    if not isinstance(sudo, list) or any(not isinstance(zeile, str) or not zeile.strip() for zeile in sudo):
        raise ValueError("sudo muss eine Liste von Shell-Befehlen sein.")
    if sudo and os.geteuid() != 0:
        raise ValueError("Das Rezept enthält sudo-Schritte. Diese Probe dafür als root in einer entbehrlichen WSL-Distribution starten.")
    arbeit, ausgabe, referenz, sdk, starter, jdk = map(pfad, (
        args.arbeitsordner, args.ausgabeordner, args.referenz_apk, args.sdk, args.gradlew, args.jdk))
    ersatz = pfad(args.quelle) if args.quelle else None
    if ersatz and not ersatz.exists():
        raise ValueError("Der angegebene Quellenersatz fehlt.")
    vorgabe = json.loads((HIER.parent / "toolchain.json").read_text(encoding="utf-8"))
    vergleich = apk_daten(referenz)
    if vergleich != soll["apk"]:
        raise ValueError("Die Referenz-APK stimmt nicht mit app-referenz.json überein.")
    if not starter.is_file() or sha256(starter) != vorgabe["gradlewFdroid"]["sha256"]:
        raise ValueError("gradlew.py fehlt oder weicht von scripts/toolchain.json ab.")
    if not (jdk / "bin/java").is_file() or not (jdk / "bin/javac").is_file():
        raise ValueError("JDK fehlt.")
    if not (sdk / "platforms/android-36/android.jar").is_file() or not (sdk / "build-tools/35.0.0/aapt").is_file():
        raise ValueError("SDK mit Plattform 36 und Build-Tools 35.0.0 fehlt.")
    for datei in sdk.rglob("*"):
        if datei.is_symlink() and (os.path.isabs(os.readlink(datei)) or not datei.resolve().is_relative_to(sdk)):
            raise ValueError("Die SDK-Kopie darf keinen Verweis außerhalb der Kopie erhalten: " + str(datei))
    # Nie ein SDK in sich selbst kopieren; Ausgaben dürfen keine Eingaben überlagern.
    for basis in (arbeit, ausgabe):
        for eingabe in (sdk, starter, jdk, referenz, rezept_datei):
            if basis == eingabe or basis.is_relative_to(eingabe):
                raise ValueError("Arbeits-/Ausgabeordner darf nicht innerhalb einer Eingabe liegen.")
    arbeit.mkdir(parents=True, exist_ok=True)
    lauf = Path(tempfile.mkdtemp(prefix="probe-", dir=arbeit))
    ausgabe.mkdir(parents=True, exist_ok=True)
    sicherung = ausgabe / lauf.name
    if sicherung.exists():
        raise ValueError("Der Ausgabeordner existiert bereits: " + str(sicherung))
    protokoll = (lauf / "probe.log").open("x", encoding="utf-8")
    ergebnis = {"bestanden": False, "fdroidBuild": None, "commitNachBuild": None, "referenzApk": vergleich,
                "beginn": datetime.now(timezone.utc).isoformat(), "sudoSchritte": len(sudo),
                "uid": os.getuid(), "euid": os.geteuid()}
    abweichungen = ["Lokaler Build mit fdroidserver 2.4.2 unter Debian 13; kein echter Buildserver.",
                   "Eigenes HOME, eigene Caches sowie kopiertes Android SDK und gepinnter Gradle-Starter."]
    if os.geteuid() == 0:
        abweichungen.append("Probe als root gestartet; auch der lokale Build läuft als root. Die Berechtigungen des regulären Buildnutzers sind damit nicht nachgewiesen.")

    def melden(text):
        print(text, flush=True)
        protokoll.write(text + "\n")
        protokoll.flush()

    def ausfuehren(befehl, cwd=None, protokolldatei=None, pruefen=True):
        melden("$ " + shlex.join(str(x) for x in befehl))
        with (lauf / (protokolldatei or "werkzeuge.log")).open("a", encoding="utf-8") as log:
            prozess = subprocess.Popen([str(x) for x in befehl], cwd=cwd or lauf, env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       encoding="utf-8", errors="replace")
            ausgabe_zeilen = []
            for zeile in prozess.stdout:
                print(zeile, end="", flush=True)
                log.write(zeile)
                log.flush()
                ausgabe_zeilen.append(zeile)
            code = prozess.wait()
        if pruefen and code:
            raise ValueError("Befehl fehlgeschlagen (" + str(code) + "): " + shlex.join(str(x) for x in befehl))
        return code, "".join(ausgabe_zeilen)

    try:
        melden("Lauf: " + str(lauf))
        melden("Sicherung: " + str(sicherung))
        for name in ("home", "tmp", "fdroid", "fdroid/metadata", "fdroid/build", "werkzeuge"):
            (lauf / name).mkdir(exist_ok=True)
        env = {"PATH": SYSTEMPFAD, "HOME": str(lauf / "home"), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
               "USER": str(os.getuid()), "LOGNAME": str(os.getuid()), "PYTHONDONTWRITEBYTECODE": "1",
               "JAVA_HOME": str(jdk), "ANDROID_HOME": str(lauf / "android-sdk"),
               "ANDROID_SDK_ROOT": str(lauf / "android-sdk"), "GRADLE_USER_HOME": str(lauf / "gradle-home"),
               "XDG_CACHE_HOME": str(lauf / "home/.cache"), "XDG_DATA_HOME": str(lauf / "home/.local/share"),
               "XDG_CONFIG_HOME": str(lauf / "home/.config"), "TMPDIR": str(lauf / "tmp"),
               "TMP": str(lauf / "tmp"), "TEMP": str(lauf / "tmp"),
               "JAVA_TOOL_OPTIONS": "-Djava.io.tmpdir=" + str(lauf / "tmp"),
               "npm_config_cache": str(lauf / "npm-cache"), "npm_config_userconfig": str(lauf / "home/.npmrc"),
               "npm_config_update_notifier": "false", "ASTRO_TELEMETRY_DISABLED": "1", "CI": "1",
               "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_TERMINAL_PROMPT": "0"}
        json_schreiben(lauf / "umgebung.json", env)
        json_schreiben(lauf / "toolchain.json", vorgabe)
        shutil.copyfile(rezept_datei, lauf / "rezept-original.yml")
        shutil.copyfile(HIER / "app-referenz.json", lauf / "app-referenz.json")
        melden("Vor dem Rezept: kein node/nodejs/npm/npx im Systempfad; HOME ist neu und leer.")
        melden("Die Probe übernimmt keine Benutzerpfade oder Node-Caches aus der aufrufenden Sitzung.")
        _, fdroid_version = ausfuehren(["fdroid", "--version"])
        if not re.fullmatch(r"(?:fdroidserver\s+)?2\.4\.2", fdroid_version.strip()):
            raise ValueError("Erforderlich ist fdroidserver 2.4.2.")
        _, java_version = ausfuehren([jdk / "bin/java", "-version"])
        ausfuehren([jdk / "bin/javac", "-version"])
        if not re.search(r'openjdk version "21\.', java_version):
            raise ValueError("Erforderlich ist OpenJDK 21.")
        # Kopien halten auch mögliche Schreibzugriffe der Buildwerkzeuge im Laufordner.
        ausfuehren(["cp", "-a", "--reflink=auto", "--", sdk, lauf / "android-sdk"])
        shutil.copyfile(starter, lauf / "werkzeuge/gradlew.py")
        (lauf / "werkzeuge/gradlew.py").chmod(0o755)
        if sha256(lauf / "werkzeuge/gradlew.py") != vorgabe["gradlewFdroid"]["sha256"]:
            raise ValueError("Die kopierte gradlew.py weicht ab.")
        quelle = str(ersatz) if ersatz else rezept["Repo"]
        klon = lauf / "fdroid/build" / APPID
        ausfuehren(["git", "-c", "core.autocrlf=false", "clone", "--no-hardlinks", "--branch", tag, "--", quelle, klon],
                   protokolldatei="quelle.log")
        _, commit = ausfuehren(["git", "-C", klon, "rev-parse", "HEAD"], protokolldatei="quelle.log")
        _, tag_commit = ausfuehren(["git", "-C", klon, "rev-parse", tag + "^{commit}"], protokolldatei="quelle.log")
        if commit.strip() != tag_commit.strip() or commit.strip() != args.erwarteter_commit:
            raise ValueError("Tag " + tag + " zeigt nicht auf den erwarteten Stand " + args.erwarteter_commit + ".")
        _, zeitpunkt = ausfuehren(["git", "-C", klon, "log", "-1", "--format=%ct"], protokolldatei="quelle.log")
        ergebnis.update({"commit": commit.strip(), "tag": tag, "sourceDateEpoch": zeitpunkt.strip()})
        # fdroidserver 2.4.2 liest SOURCE_DATE_EPOCH aus diesem vorhandenen Klon.
        # Die passende Herkunftsdatei verhindert sein Entfernen vor dem ersten Fetch.
        # Dadurch ist kein zusätzlicher Commit im Rezept-Arbeitsordner nötig.
        if ersatz:
            rezept["Repo"] = str(ersatz)
            abweichungen.append("Quellenersatz ausdrücklich gewählt: " + str(ersatz) + "; Repo nur in der Probenkopie geändert. Weitere Build-Downloads brauchen weiterhin Netz.")
        (lauf / "fdroid/build" / (".fdroidvcs-" + APPID)).write_text("git " + rezept["Repo"], encoding="utf-8")
        if "Binaries" in rezept:
            ergebnis["binariesNichtGeprueft"] = rezept.pop("Binaries")
            abweichungen.append("Binaries nur aus der Probenkopie entfernt: diese Probe vergleicht die unsignierte APK; Release-Anhang und Signaturübernahme werden nicht geprüft.")
        json_schreiben(lauf / "abweichungen.json", abweichungen)
        for text in abweichungen:
            melden("Abweichung: " + text)
        # JSON ist YAML 1.2; das Original-YAML wird unverändert separat gesichert.
        json_schreiben(lauf / "fdroid/metadata" / (APPID + ".yml"), rezept)
        json_schreiben(lauf / "fdroid/config.yml", {"sdk_path": str(lauf / "android-sdk"),
            "gradle": str(lauf / "werkzeuge/gradlew.py"), "java_paths": {"21": str(jdk)},
            "cachedir": str(lauf / "fdroid-cache")})
        sudo_datei = lauf / "sudo-aus-rezept.sh"
        sudo_datei.write_text("#!/bin/bash\n" + shlex.join(sudo_befehl(sudo)) + "\n", encoding="utf-8")
        if sudo:
            melden("Root-Schritte aus dem Rezept (vor fdroid build):\n" + "\n".join(sudo))
            ausfuehren(sudo_befehl(sudo), cwd=lauf / "fdroid", protokolldatei="sudo.log")
        else:
            melden("Das Rezept enthält keine sudo-Schritte. Node wird im prebuild ohne Root-Rechte bereitgestellt.")
        # Kein --server: dessen virtuelle Buildmaschine ist nicht Teil dieser Probe.
        code, _ = ausfuehren(["fdroid", "build", "--verbose", APPID + ":" + str(versionscode)], cwd=lauf / "fdroid",
                             protokolldatei="build.log", pruefen=False)
        ergebnis["fdroidBuild"] = code
        # fdroidserver holt den Tag erneut und checkt ihn während des Builds aus.
        # Deshalb muss auch der anschließend gebaute Stand dem Release entsprechen.
        _, commit_nach_build = ausfuehren(["git", "-C", klon, "rev-parse", "HEAD"], protokolldatei="quelle.log")
        ergebnis["commitNachBuild"] = commit_nach_build.strip()
        if ergebnis["commitNachBuild"] != args.erwarteter_commit:
            raise ValueError("HEAD nach fdroid build weicht vom erwarteten Release-Commit ab: "
                             + ergebnis["commitNachBuild"] + " statt " + args.erwarteter_commit)
        node_kandidaten = list((lauf / "home").glob(".cache/fristenrechner-fdroid/node-*/bin/node"))
        if len(node_kandidaten) != 1:
            raise ValueError("Genau ein vom Rezept bereitgestelltes Node im neuen HOME erwartet.")
        _, node_version = ausfuehren([node_kandidaten[0], "--version"])
        if node_version.strip() != "v" + vorgabe["node"]["referenz"]:
            raise ValueError("Node aus dem Rezept hat eine unerwartete Version.")
        gradle = lauf / "fdroid-cache/versions" / vorgabe["gradle"]["version"] / "bin/gradle"
        _, gradle_version = ausfuehren([gradle, "--version"])
        if not re.search(r"(?m)^Gradle " + re.escape(vorgabe["gradle"]["version"]) + r"\s*$", gradle_version):
            raise ValueError("Gradle-Version weicht ab.")
        gradle_archiv = lauf / "fdroid-cache" / ("gradle-" + vorgabe["gradle"]["version"] + "-bin.zip")
        if sha256(gradle_archiv) != vorgabe["gradle"]["sha256"]["bin"]:
            raise ValueError("Gradle-Archiv weicht von scripts/toolchain.json ab.")
        apk = lauf / "fdroid/unsigned" / (APPID + "_" + str(versionscode) + ".apk")
        ergebnis["erzeugteApk"] = apk_daten(apk)
        if code or ergebnis["erzeugteApk"] != vergleich:
            raise ValueError("Build fehlgeschlagen oder Größe/SHA-256 der APK weichen von der Referenz ab.")
        ergebnis["bestanden"] = True
        melden("APK: " + json.dumps(ergebnis["erzeugteApk"]))
        melden("ERGEBNIS: bestanden — unsignierte APK nach Größe und SHA-256 bytegleich zur Referenz")
    except (OSError, ValueError, subprocess.SubprocessError) as fehler:
        ergebnis["fehler"] = str(fehler)
        melden("ERGEBNIS: Nacharbeit nötig — " + str(fehler))
    finally:
        ergebnis["ende"] = datetime.now(timezone.utc).isoformat()
        json_schreiben(lauf / "ergebnis.json", ergebnis)
        protokoll.close()
        sicherung.mkdir()
        for datei in lauf.iterdir():
            if datei.is_file():
                shutil.copyfile(datei, sicherung / datei.name)
        for name in ("metadata", "logs", "unsigned"):
            quelle = lauf / "fdroid" / name
            if quelle.is_dir():
                shutil.copytree(quelle, sicherung / name, symlinks=True)
        if (lauf / "fdroid/config.yml").exists():
            shutil.copyfile(lauf / "fdroid/config.yml", sicherung / "config.yml")
        print("Protokolle und Metadaten: " + str(sicherung), flush=True)
        print("Vollständiger Lauf bleibt erhalten: " + str(lauf), flush=True)
    return 0 if ergebnis["bestanden"] else 1


try:
    sys.exit(main())
except (OSError, ValueError, ImportError) as fehler:
    print("ERGEBNIS: Nacharbeit nötig — " + str(fehler), file=sys.stderr)
    sys.exit(1)
PY
