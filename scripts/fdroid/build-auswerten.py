#!/usr/bin/env python3
"""Wertet einen einzelnen lokalen Lauf von ``fdroid build --verbose`` aus.

Aufruf: build-auswerten.py <Lauf> <App-ID> <versionName> <versionCode> <Rückgabewert>

Liest build.log und unsigned/<App-ID>_<versionCode>.apk. Schreibt auswertung.json
ohne eine vorhandene Datei zu ersetzen. Rückgabewerte: 0 ohne Beanstandung,
1 mit Beanstandungen, 64 bei ungültigen Angaben. Der JSON-Bericht und stdout
enthalten dieselben Beanstandungen.

Die vier erwarteten INFO-Meldungen sind vorläufig: Ihr genauer Wortlaut muss
am ersten echten Build mit fdroidserver 2.4.2 in Debian bestätigt werden.
Nachgestellte Protokolle in den Tests sind kein Beleg für einen solchen Build.
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
    r"^\s*(?:Traceback \(most recent call last\)|WARNING:|ERROR:|CRITICAL:|"
    r"FAILURE: Build failed|BUILD FAILED(?:\s|$))"
)
BEANSTANDET = ("WARNING", "ERROR", "CRITICAL")


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
    for zeile in zeilen:
        kopf = KOPF.fullmatch(zeile)
        if kopf:
            meldungen.append((kopf.group(1), kopf.group(2), []))
        elif meldungen:
            meldungen[-1][2].append(zeile)
        else:
            vorspann.append(zeile)
    return vorspann, meldungen


def pruefe_protokoll(wurzel, appid, version_name, version_code, probleme):
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
        f"Successfully built version {version_name} of {appid}",
        "Finished",
    )
    namen = ("Beginn", "Scanner-Beginn", "Erfolg", "Ende")
    stellen = [[] for _ in erwartet]
    for zeile in vorspann:
        if OHNE_KOPF.match(zeile):
            probleme.append("Protokoll, Zeile ohne Kopf: " + zeile.strip())
    for nummer, (stufe, text, folgezeilen) in enumerate(meldungen):
        if stufe in BEANSTANDET:
            zusatz = f" (dazu {len(folgezeilen)} Folgezeilen)" if folgezeilen else ""
            probleme.append(f"Protokoll, {stufe}: {text}{zusatz}")
        else:
            if OHNE_KOPF.match(text):
                probleme.append(f"Protokoll, {stufe}: {text}")
            for zeile in folgezeilen:
                if OHNE_KOPF.match(zeile):
                    probleme.append("Protokoll, Zeile ohne Kopf: " + zeile.strip())
        marker = text.startswith(("Building version ", "Successfully built version ", "Scanning source ", "Finished"))
        if marker and (stufe != "INFO" or text not in erwartet):
            probleme.append(f"Unerwartete Build-Meldung: {stufe}: {text}")
        for index, soll in enumerate(erwartet):
            if stufe == "INFO" and text == soll:
                stellen[index].append(nummer)
    for name, positionen in zip(namen, stellen):
        if len(positionen) != 1:
            probleme.append(f"Das Protokoll muss {name} genau einmal nennen, gefunden: {len(positionen)}.")
    if all(len(positionen) == 1 for positionen in stellen):
        beginn, scanner, erfolg, ende = (positionen[0] for positionen in stellen)
        if not beginn < scanner < erfolg < ende:
            probleme.append("Die Reihenfolge von Beginn, Scanner-Beginn, Erfolg und Ende stimmt nicht.")
        if ende != len(meldungen) - 1 or any(zeile.strip() for zeile in meldungen[ende][2]):
            probleme.append("Nach dem Ende stehen weitere Meldungen im Protokoll.")


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
    pruefe_protokoll(wurzel, appid, version_name, version_code, probleme)
    apk = pruefe_apk(wurzel, appid, version_code, probleme)
    bericht = {
        "app_id": appid,
        "version_name": version_name,
        "version_code": version_code,
        "rueckgabewert_build": int(rueckgabe),
        "protokollformat": "vorläufig; an fdroidserver 2.4.2 in Debian zu bestätigen",
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
    if apk:
        print(f"APK: {apk['pfad']}, {apk['bytes']} Bytes, SHA-256 {apk['sha256']}")
    print(f"ERGEBNIS: {len(probleme)} Beanstandungen" if probleme else "ERGEBNIS: keine Beanstandung")
    return 1 if probleme else 0


if __name__ == "__main__":
    sys.exit(haupt(sys.argv[1:]))
