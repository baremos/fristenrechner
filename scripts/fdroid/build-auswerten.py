#!/usr/bin/env python3
"""Wertet einen einzelnen lokalen Lauf von ``fdroid build --verbose`` aus.

Aufruf: build-auswerten.py <Lauf> <App-ID> <versionName> <versionCode> <Rückgabewert>

Liest lauf.json, build.log und unsigned/<App-ID>_<versionCode>.apk. Schreibt auswertung.json
ohne eine vorhandene Datei zu ersetzen. Rückgabewerte: 0 ohne Beanstandung,
1 mit Beanstandungen, 64 bei ungültigen Angaben. Der JSON-Bericht und stdout
enthalten dieselben Beanstandungen.

Das Protokollformat wurde am 2026-09-29 mit fdroidserver 2.4.2 in Debian
13.5 beobachtet. Unbekannte Warnungen und kopflose Zeilen bleiben Befunde.
Die ZIP-Prüfung ersetzt weder die Android-Paketprüfung von F-Droid noch einen
Nachweis der Signatur oder der Reproduzierbarkeit. Pfadprüfungen fangen
Versehen ab; sie sichern keinen gleichzeitigen Austausch durch denselben
Benutzer ab.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import zipfile


KOPF = re.compile(
    r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} (DEBUG|INFO|WARNING|ERROR|CRITICAL): (.*)$"
)
OHNE_KOPF = re.compile(
    r"^\s*(?:Traceback \(most recent call last\)|warning:|error:|critical:|"
    r"npm (?:warn|error)(?:\s|$)|[we]: |FAILURE: Build failed|BUILD FAILED(?:\s|$))", re.I
)
BEANSTANDET = ("WARNING", "ERROR", "CRITICAL")
BEKANNTE_MELDUNGEN = json.loads(
    Path(__file__).with_name("bekannte-meldungen.json").read_text(encoding="utf-8")
)
ABSCHLUSS_DEBUG = "skip deploying full build logs: not enabled in config"
ANSI_SGR = re.compile(r"\x1b\[[0-9;]*m")

# Nur beobachtete Ausgabeformen; keine allgemeine Freigabe für Folgezeilen.
GRADLE_TEXT = frozenset((
    "Update checksum from gradle-transparency-log",
    "Remote gradle-transparency-log not changed, reusing cache",
    "Found 8.14.5 via distributionUrl", "Downloading missing gradle version 8.14.5",
    "Welcome to Gradle 8.14.5!", "Here are the highlights of this release:",
    " - Java 24 support", " - GraalVM Native Image toolchain selection",
    " - Enhancements to test reporting", " - Build Authoring improvements",
    "For more details see https://docs.gradle.org/8.14.5/release-notes.html",
    "Starting a Gradle Daemon (subsequent builds will be faster)",
    "Note: Some input files use unchecked or unsafe operations.",
    "Note: Recompile with -Xlint:unchecked for details.",
))
GRADLE_MUSTER = tuple(re.compile(muster) for muster in (
    r"(?:CACHEDIR set to|Using cache directory) /[^\r\n]+/fdroid-cache",
    r"Running /[^\r\n]+/fdroid-cache/versions/8\.14\.5/bin/gradle (?:clean|assembleRelease)",
    r"> Configure project :(?:app|capacitor-cordova-android-plugins)",
    r"> Task :(?:app|capacitor-android|capacitor-filesystem|capacitor-share|capacitor-cordova-android-plugins):[A-Za-z][A-Za-z0-9]*(?: (?:UP-TO-DATE|NO-SOURCE|SKIPPED|FROM-CACHE))?",
    r"BUILD SUCCESSFUL in (?:\d+m )?\d+s",
    r"\d+ actionable tasks?: \d+ (?:executed|up-to-date)(?:, \d+ (?:executed|up-to-date))*",
    r"\[Incubating\] Problems report is available at: file:///[^\r\n]+/android/build/reports/problems/problems-report\.html",
))
PREBUILD_TEXT = frozenset((
    "+ cd ../..", "+ npm ci --ignore-scripts --no-audit --no-fund", "+ npm run build",
    "> beispiel-2-1@0.0.0 build", "> astro build", " generating static routes ",
    "+ ./node_modules/.bin/cap sync android", "[info] Found 2 Capacitor plugins for android:",
    "       @capacitor/filesystem@8.1.3", "       @capacitor/share@8.0.2",
))
PREBUILD_MUSTER = tuple(re.compile(muster) for muster in (
    r"added \d+ packages in \d+s",
    r"\+ cp package-lock\.json /[^\r\n]+/package-lock-minimal-app\.json",
    r"\+ python3 /[^\r\n]+/npm-inventar\.py node_modules /[^\r\n]+/npm-vorgebaut-(?:vor|nach)-web\.json",
    r"Inventar vor dem Scanner: \d+ Dateien; eingebettetes WASM nicht vollständig erfasst\.",
    r'\d{2}:\d{2}:\d{2} \[build\] (?:output|mode): "static"',
    r"\d{2}:\d{2}:\d{2} \[build\] directory: /[^\r\n]+/dist/",
    r"\d{2}:\d{2}:\d{2} \[build\] (?:Collecting build info\.\.\.|Building static entrypoints\.\.\.|Rearranging server assets\.\.\.|Complete!)",
    r"\d{2}:\d{2}:\d{2} \[types\] Generated \d+ms",
    r"\d{2}:\d{2}:\d{2}(?: \[build\])? ✓ Completed in \d+ms\.",
    r"\d{2}:\d{2}:\d{2} \[vite\] ✓ built in \d+ms",
    r"\d{2}:\d{2}:\d{2}   ├─ /index\.html \(\+\d+ms\) ",
    r"\d{2}:\d{2}:\d{2} \[build\] \d+ page\(s\) built in \d+ms",
    r"✔ (?:Copying web assets from dist to android/app/src/main/assets/public|Creating capacitor\.config\.json in android/app/src/main/assets|copy android|Updating Android plugins|update android) in \d+(?:\.\d+)?(?:ms|μs)",
    r"\[info\] Sync finished in \d+(?:\.\d+)?s",
))


def ist_verweis(zustand):
    """Erkennt auch Verzeichnisverweise in den Tests unter Windows."""
    return stat.S_ISLNK(zustand.st_mode) or bool(
        getattr(zustand, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    )


def pruefe_pfad(wurzel, relativ, verzeichnis=False):
    """Erlaubt nur normale Dateien/Ordner innerhalb des Laufordners."""
    pfad = wurzel
    teile = Path(relativ).parts
    for nummer, teil in enumerate(teile):
        pfad = pfad / teil
        zustand = pfad.lstat()
        if ist_verweis(zustand):
            raise ValueError(f"Verweis statt Datei oder Ordner: {pfad}")
        erwartet_ordner = nummer < len(teile) - 1 or verzeichnis
        if not (stat.S_ISDIR(zustand.st_mode) if erwartet_ordner else stat.S_ISREG(zustand.st_mode)):
            raise ValueError(f"Kein regulärer {'Ordner' if erwartet_ordner else 'Dateityp'}: {pfad}")
        pfad.resolve(strict=True).relative_to(wurzel.resolve(strict=True))
    return pfad


def lies_meldungen(zeilen):
    vorspann, meldungen = [], []
    for nummer, zeile in enumerate(zeilen, 1):
        kopf = KOPF.fullmatch(zeile)
        if kopf:
            meldungen.append((kopf.group(1), kopf.group(2), [], nummer))
        elif meldungen:
            meldungen[-1][2].append((nummer, zeile))
        else:
            vorspann.append((nummer, zeile))
    return vorspann, meldungen


def lies_lauf(wurzel, probleme):
    try:
        lauf = json.loads(pruefe_pfad(wurzel, "lauf.json").read_text(encoding="utf-8"))
        if (not isinstance(lauf, dict)
                or not isinstance(lauf.get("commit"), str)
                or not re.fullmatch(r"[0-9a-f]{40}", lauf["commit"])
                or not isinstance(lauf.get("scandeleteVersuch"), bool)):
            raise ValueError("commit muss ein vollständiger Git-Commit und scandeleteVersuch ein boolescher Wert sein.")
        return lauf["commit"], lauf["scandeleteVersuch"]
    except (OSError, ValueError) as fehler:
        probleme.append(f"Die Laufangaben sind nicht prüfbar: {fehler}")
        return None, False


def normale_folgezeile(text, kontext, appid):
    if kontext == "gradle":
        return text in GRADLE_TEXT or any(m.fullmatch(text) for m in GRADLE_MUSTER)
    if kontext == "prebuild":
        return text in PREBUILD_TEXT or any(m.fullmatch(text) for m in PREBUILD_MUSTER)
    if kontext == "git-clone":
        return text == f"Cloning into 'build/{appid}'..."
    if kontext == "build":
        return text in (
            "+ test -f ../../node_modules/@capacitor/android/capacitor/build.gradle",
            "+ test -f ../../node_modules/@capacitor/filesystem/android/build.gradle",
            "+ test -f ../../node_modules/@capacitor/share/android/build.gradle",
        )
    return False


def pruefe_protokoll(wurzel, appid, version_name, version_code, commit, scandelete, probleme):
    try:
        pfad = pruefe_pfad(wurzel, "build.log")
        zeilen = pfad.read_text(encoding="utf-8").splitlines()
    except (OSError, ValueError) as fehler:
        probleme.append(f"Das Build-Protokoll ist nicht lesbar: {fehler}")
        zeilen = []
    vorspann, meldungen = lies_meldungen(zeilen)
    erwartet = (
        f"Building version {version_name} ({version_code}) of {appid}",
        "Scanning source for common problems...",
        f"Successfully built version {version_name} of {appid} from {commit}",
        f"success: {appid}", "Finished", "1 build succeeded",
    )
    namen = ("Beginn", "Scanner-Beginn", "Erfolg", "App-Erfolg", "Ende", "Zusammenfassung")
    stellen = [[] for _ in erwartet]
    bekannt, entfernt = [], []
    muster = [(eintrag, re.compile(eintrag["muster"].replace("{appid}", re.escape(appid))))
              for eintrag in BEKANNTE_MELDUNGEN]

    def bekannte_meldung(text, zeile, mit_kopf=False, **ort):
        for eintrag, regex in muster:
            if (mit_kopf == (eintrag["art"] == "fehlender_bauordner_vor_quelle")
                    and regex.fullmatch(text)):
                bekannt.append({"art": eintrag["art"], "zeile": zeile, **ort})
                return eintrag["art"]
        return None

    flatdir_stellen = set()
    filesystem_version_belegt = False
    no_such_path = f"NoSuchPathError: build/{appid}"
    no_such_stellen = [i for i, m in enumerate(meldungen) if m[0] == "WARNING" and m[1] == no_such_path]
    quellen_stellen = [i for i, m in enumerate(meldungen) if m[0] == "INFO" and m[1] == f"Getting source for revision {commit}"]
    beginn_stellen = [i for i, m in enumerate(meldungen) if m[0] == "INFO" and m[1] == erwartet[0]]
    no_such_erlaubt = (
        len(no_such_stellen) == len(quellen_stellen) == len(beginn_stellen) == 1
        and beginn_stellen[0] < no_such_stellen[0] < quellen_stellen[0]
        and all(m[0] == "DEBUG" and not any(z.strip() for _, z in m[2])
                for m in meldungen[no_such_stellen[0] + 1:quellen_stellen[0]])
    )
    for zeile_nr, zeile in vorspann:
        if zeile.strip():
            probleme.append(f"Protokoll, Zeile ohne Kopf: {zeile.strip()} (Zeile {zeile_nr})")
    for nummer, (stufe, text, folgezeilen, zeile_nr) in enumerate(meldungen):
        bekannte_warnung = (stufe == "WARNING" and bekannte_meldung(
            text, zeile_nr, mit_kopf=True, pfad=f"build/{appid}"
        ))
        if bekannte_warnung and no_such_erlaubt and not folgezeilen:
            pass
        elif stufe in BEANSTANDET:
            zusatz = f" (dazu {len(folgezeilen)} Folgezeilen)" if folgezeilen else ""
            probleme.append(f"Protokoll, {stufe}: {text}{zusatz} (Zeile {zeile_nr})")
        elif OHNE_KOPF.match(text):
            probleme.append(f"Protokoll, {stufe}: {text} (Zeile {zeile_nr})")

        kontext, phase = None, None
        if stufe == "DEBUG" and re.fullmatch(r"> /[^\r\n]+/gradlew\.py (clean|assembleRelease)", text):
            kontext, phase = "gradle", text.rsplit(" ", 1)[1]
        elif stufe == "DEBUG" and text.startswith("> bash -e -u -o pipefail -x -c -- cd ../..; npm ci --ignore-scripts --no-audit --no-fund;"):
            kontext = "prebuild"
        elif stufe == "DEBUG" and text.startswith("> git ") and text.endswith(f" build/{appid}") and " clone -- " in text:
            kontext = "git-clone"
        elif stufe == "DEBUG" and text == (
            "> bash -e -u -o pipefail -x -c test -f ../../node_modules/@capacitor/android/capacitor/build.gradle; "
            "test -f ../../node_modules/@capacitor/filesystem/android/build.gradle; "
            "test -f ../../node_modules/@capacitor/share/android/build.gradle"
        ):
            kontext = "build"
        vorzeile, task = None, None
        for folge_nr, rohzeile in folgezeilen:
            # Astro färbt seine Ausgabe auch im gespeicherten Protokoll. Nur
            # SGR-Darstellungscodes entfernen, andere Steuerzeichen nie tilgen.
            zeile = ANSI_SGR.sub("", rohzeile)
            if not zeile.strip():
                continue
            projekt = (vorzeile.removeprefix("> Configure project :")
                       if vorzeile and vorzeile.startswith("> Configure project :") else None)
            ort = (phase, projekt)
            art = bekannte_meldung(zeile, folge_nr, kontext=kontext, phase=phase, projekt=projekt, task=task)
            erlaubt = False
            if art == "gradle_flatdir":
                erlaubt = (kontext == "gradle"
                           and vorzeile in ("> Configure project :app", "> Configure project :capacitor-cordova-android-plugins")
                           and ort not in flatdir_stellen)
                if erlaubt:
                    flatdir_stellen.add(ort)
            elif art == "npm_uuid_7_0_3":
                erlaubt = kontext == "prebuild"
            elif art == "android_sdk_xml_3_4":
                erlaubt = kontext == "gradle" and phase == "assembleRelease"
            elif art in ("kotlin_filesystem_downloadfile", "kotlin_filesystem_legacy_typ"):
                erlaubt = (kontext == "gradle" and phase == "assembleRelease"
                           and task == "> Task :capacitor-filesystem:compileReleaseKotlin"
                           and filesystem_version_belegt)
            if not erlaubt and (art or OHNE_KOPF.match(zeile) or not normale_folgezeile(zeile, kontext, appid)):
                probleme.append(f"Protokoll, Zeile ohne Kopf: {rohzeile.strip()} (Zeile {folge_nr})")
            if kontext == "prebuild" and zeile == "       @capacitor/filesystem@8.1.3":
                filesystem_version_belegt = True
            if zeile.startswith("> Task :"):
                task = zeile
            vorzeile = zeile

        loeschung = re.fullmatch(r"Removing (shared library|WebAssembly binary file|binary|gzip file archive|gradle-wrapper\.jar) at ([^\r\n]+)", text)
        if loeschung:
            art, pfad = loeschung.groups()
            entfernt.append({"art": art, "pfad": pfad, "zeile": zeile_nr})
            scanner_vorher = any(m[0] == "INFO" and m[1] == erwartet[1] for m in meldungen[:nummer])
            scanner_beendet = any(m[0] == "INFO" and m[1] == "Creating source tarball..." for m in meldungen[:nummer])
            if not (stufe == "INFO" and scanner_vorher and not scanner_beendet
                    and not Path(pfad).is_absolute() and ".." not in Path(pfad).parts
                    and (pfad.startswith("node_modules/") or pfad == "android/gradle/wrapper/gradle-wrapper.jar")):
                probleme.append(f"Unerwartete Scanner-Entfernung in Zeile {zeile_nr}: {text}")
        elif text.startswith("Removing ") and " at " in text:
            probleme.append(f"Unbekannte Scanner-Entfernung in Zeile {zeile_nr}: {text}")

        marker = text.startswith(("Building version ", "Successfully built version ", "Scanning source ", "success:", "Finished")) or bool(re.fullmatch(r"\d+ builds? (?:succeeded|failed)", text))
        if marker and (stufe != "INFO" or text not in erwartet):
            probleme.append(f"Unerwartete Build-Meldung: {stufe}: {text}")
        for index, soll in enumerate(erwartet):
            if stufe == "INFO" and text == soll:
                stellen[index].append(nummer)
    if entfernt and not scandelete:
        probleme.append(f"Der Scanner hat {len(entfernt)} Dateien entfernt, aber der Lauf ist nicht als scandelete-Versuch gekennzeichnet.")
    for eintrag in BEKANNTE_MELDUNGEN:
        anzahl = sum(m["art"] == eintrag["art"] for m in bekannt)
        if anzahl > eintrag["maximal_pro_lauf"]:
            probleme.append(f"Bekannte Meldung {eintrag['art']}: {anzahl} Vorkommen, erlaubt sind höchstens {eintrag['maximal_pro_lauf']} je Lauf.")
    for name, positionen in zip(namen, stellen):
        if len(positionen) != 1:
            probleme.append(f"Das Protokoll muss {name} genau einmal nennen, gefunden: {len(positionen)}.")
    if all(len(positionen) == 1 for positionen in stellen):
        reihenfolge = [positionen[0] for positionen in stellen]
        if reihenfolge != sorted(reihenfolge):
            probleme.append("Die Reihenfolge von Beginn, Scanner-Beginn, Erfolg, App-Erfolg, Ende und Zusammenfassung stimmt nicht.")
        ende, zusammenfassung = reihenfolge[-2:]
        if zusammenfassung != ende + 1 or any(
            stufe != "DEBUG" or text != ABSCHLUSS_DEBUG or any(z.strip() for _, z in folge)
            for stufe, text, folge, _ in meldungen[zusammenfassung + 1:]
        ) or any(z.strip() for _, z in meldungen[ende][2] + meldungen[zusammenfassung][2]):
            probleme.append("Nach dem Ende stehen weitere Meldungen im Protokoll.")
    return bekannt, entfernt

def pruefe_apk(wurzel, appid, version_code, probleme):
    relativ = f"unsigned/{appid}_{version_code}.apk"
    try:
        pfad = pruefe_pfad(wurzel, relativ)
        with pfad.open("rb") as datei:
            groesse = os.fstat(datei.fileno()).st_size
            if groesse == 0:
                raise ValueError("Die APK ist leer.")
            with zipfile.ZipFile(datei) as archiv:
                eintraege = archiv.infolist()
                namen = [eintrag.filename for eintrag in eintraege]
                if len(set(namen)) != len(namen):
                    raise ValueError("Die APK enthält doppelte ZIP-Einträge.")
                for name in ("AndroidManifest.xml", "classes.dex"):
                    if name not in namen:
                        raise ValueError(f"Der ZIP-Eintrag {name} fehlt.")
                    eintrag = archiv.getinfo(name)
                    if eintrag.is_dir() or eintrag.file_size == 0:
                        raise ValueError(f"Der ZIP-Eintrag {name} ist leer oder ein Ordner.")
                    if stat.S_ISLNK(eintrag.external_attr >> 16):
                        raise ValueError(f"Der ZIP-Eintrag {name} ist ein Verweis.")
                defekt = archiv.testzip()
                if defekt is not None:
                    raise ValueError(f"Die ZIP-Prüfsumme stimmt nicht: {defekt}")
            datei.seek(0)
            sha256 = hashlib.sha256()
            for block in iter(lambda: datei.read(1024 * 1024), b""):
                sha256.update(block)
        return {"pfad": relativ, "bytes": groesse, "sha256": sha256.hexdigest()}
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as fehler:
        probleme.append(f"Die erwartete APK ist nicht prüfbar: {fehler}")
        return None


def haupt(argumente):
    if len(argumente) != 5:
        print(__doc__, file=sys.stderr)
        return 64
    lauf, appid, version_name, version_code, rueckgabe = argumente
    if (not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", appid)
            or not version_name or any(ord(zeichen) < 32 or ord(zeichen) == 127 for zeichen in version_name)
            or not re.fullmatch(r"[1-9][0-9]*", version_code)
            or not re.fullmatch(r"(?:0|[1-9][0-9]*)", rueckgabe)
            or int(rueckgabe) > 255):
        print("Ungültige App-ID, Version oder Rückgabe.", file=sys.stderr)
        return 64
    wurzel = Path(lauf).absolute()
    probleme = []
    if rueckgabe != "0":
        probleme.append(f"fdroid build endete mit Rückgabewert {rueckgabe}.")
    try:
        zustand = wurzel.lstat()
        if ist_verweis(zustand) or not stat.S_ISDIR(zustand.st_mode):
            raise ValueError("Der Laufordner ist kein regulärer Ordner.")
    except (OSError, ValueError) as fehler:
        print(f"Der Laufordner ist nicht prüfbar: {fehler}")
        print("ERGEBNIS: 1 Beanstandungen")
        return 1
    commit, scandelete = lies_lauf(wurzel, probleme)
    bekannt, entfernt = pruefe_protokoll(wurzel, appid, version_name, version_code, commit, scandelete, probleme)
    apk = pruefe_apk(wurzel, appid, version_code, probleme)
    bericht = {
        "app_id": appid,
        "version_name": version_name,
        "version_code": version_code,
        "rueckgabewert_build": int(rueckgabe),
        "commit": commit,
        "scandelete_versuch": scandelete,
        "protokollformat": "fdroidserver 2.4.2, Debian 13.5, beobachtet am 2026-09-29",
        "bekannte_meldungen": {
            "anzahl": len(bekannt), "stellen": bekannt,
            "liste": [{**eintrag, "anzahl": sum(m["art"] == eintrag["art"] for m in bekannt)}
                      for eintrag in BEKANNTE_MELDUNGEN],
        },
        "entfernte_dateien": {"anzahl": len(entfernt), "stellen": entfernt},
        "apk": apk,
        "beanstandungen": probleme,
        "bestanden": not probleme,
    }
    try:
        with (wurzel / "auswertung.json").open("x", encoding="utf-8", newline="\n") as datei:
            json.dump(bericht, datei, ensure_ascii=False, indent=2)
            datei.write("\n")
    except OSError as fehler:
        probleme.append(f"Der Bericht konnte nicht neu geschrieben werden: {fehler}")
    for problem in probleme:
        print(problem)
    for meldung in bericht["bekannte_meldungen"]["liste"]:
        print(f"Bekannte Meldung {meldung['art']}: {meldung['anzahl']} (höchstens {meldung['maximal_pro_lauf']} je Lauf)")
    if apk:
        print(f"APK: {apk['pfad']}, {apk['bytes']} Bytes, SHA-256 {apk['sha256']}")
    print(f"ERGEBNIS: {len(probleme)} Beanstandungen" if probleme else "ERGEBNIS: keine Beanstandung")
    return 1 if probleme else 0


if __name__ == "__main__":
    sys.exit(haupt(sys.argv[1:]))
