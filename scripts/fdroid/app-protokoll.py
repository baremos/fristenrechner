#!/usr/bin/env python3
"""Enge Auswertung der App-Protokolle; getrennt vom Rezept der Minimal-App."""

import json
from pathlib import Path
import re


MELDUNGEN = json.loads(Path(__file__).with_name("app-meldungen.json").read_text(encoding="utf-8"))
WRAPPER = "app/android/gradle/wrapper/gradle-wrapper.jar"
PREBUILD = ('> bash -e -u -o pipefail -x -c -- cd ../../..; npm ci --ignore-scripts --no-audit --no-fund; '
            'cp package-lock.json "$FR_FDROID_LAUF/package-lock-app.json"; '
            'python3 "$FR_FDROID_INVENTAR" node_modules "$FR_FDROID_LAUF/npm-vorgebaut-vor-web.json"; '
            'node scripts/fdroid/app-vorbereiten.mjs; '
            'python3 "$FR_FDROID_INVENTAR" node_modules "$FR_FDROID_LAUF/npm-vorgebaut-nach-web.json"; ')
BEREINIGEN = 'python3 scripts/fdroid/npm-bereinigen.py --wurzel . --ausgabe "$FR_FDROID_LAUF/bereinigung.json"; '
PREBUILD_ENDE = ('python3 "$FR_FDROID_INVENTAR" node_modules "$FR_FDROID_LAUF/npm-vorgebaut-nach-bereinigung.json"; '
                 'python3 "$FR_FDROID_INVENTAR" --alle node_modules "$FR_FDROID_LAUF/npm-dateien-vor-scanner.json"')
BUILD_KOMMANDO = ('> bash -e -u -o pipefail -x -c cd ../../..; '
                  'python3 "$FR_FDROID_INVENTAR" node_modules "$FR_FDROID_LAUF/npm-vorgebaut-nach-scanner.json"; '
                  'python3 "$FR_FDROID_INVENTAR" --alle node_modules "$FR_FDROID_LAUF/npm-dateien-nach-scanner.json"; '
                  'node scripts/fdroid/app-vorbereiten.mjs --nach-scanner')


def muster_laden(basis):
    ersatz = {name: getattr(basis, name) for name in (
        "PFAD", "DAUER_NPM", "DAUER_ASTRO", "DAUER_VITE", "DAUER_CAPACITOR", "DAUER_SYNC", "DAUER_GRADLE")}
    muster = []
    for eintrag in MELDUNGEN:
        regex = eintrag["muster"]
        for name, wert in ersatz.items():
            regex = regex.replace("{" + name + "}", wert)
        muster.append((eintrag, re.compile(regex)))
    return muster


def pruefen(basis, wurzel, appid, version_name, version_code, commit, variante, probleme):
    try:
        with basis.pruefe_pfad(wurzel, "build.log").open(encoding="utf-8", newline="") as datei:
            zeilen = datei.read().replace("\r\n", "\n").split("\n")
    except (OSError, ValueError) as fehler:
        probleme.append(f"Das Build-Protokoll ist nicht lesbar: {fehler}")
        zeilen = []
    vorspann, meldungen = basis.lies_meldungen(zeilen)
    beginn = f"Building version {version_name} ({version_code}) of {appid}"
    scanner = "Scanning source for common problems..."
    erfolg = f"Successfully built version {version_name} of {appid} from {commit}"
    bekannt, entfernt, scannerfehler, abbruch = [], [], [], []
    muster = muster_laden(basis)
    im_scanner = False
    flatdir = set()
    for nr, zeile in vorspann:
        if zeile:
            probleme.append(f"Protokoll, Zeile ohne Kopf: {basis.sichtbar(zeile)} (Zeile {nr})")
    no_such = [i for i, m in enumerate(meldungen) if m[:2] == ("WARNING", f"NoSuchPathError: build/{appid}")]
    quelle = [i for i, m in enumerate(meldungen) if m[:2] == ("INFO", f"Getting source for revision {commit}")]
    start = [i for i, m in enumerate(meldungen) if m[:2] == ("INFO", beginn)]
    no_such_erlaubt = (len(no_such) == len(quelle) == len(start) == 1 and start[0] < no_such[0] < quelle[0]
                       and all(m[0] == "DEBUG" and not any(z for _, z in m[2])
                               for m in meldungen[no_such[0] + 1:quelle[0]]))
    for index, (stufe, text, folge, nr) in enumerate(meldungen):
        scanner_vorher = im_scanner
        if stufe == "INFO" and text == scanner:
            im_scanner = True
        elif text == "Creating source tarball...":
            im_scanner = False
        fehler = re.fullmatch(rf"Found (shared library|WebAssembly binary file|binary|gzip file archive) at (node_modules/{basis.PFAD})", text)
        abgebrochen = re.fullmatch(re.escape(f"Could not build app {appid}: Can't build due to ") + r"([1-9][0-9]*) errors? while scanning", text)
        if stufe == "WARNING" and index in no_such and no_such_erlaubt and not any(z for _, z in folge):
            bekannt.append({"art": "fehlender_bauordner_vor_quelle", "zeile": nr})
        elif stufe == "ERROR" and scanner_vorher and fehler:
            art, pfad = fehler.groups()
            if any(teil in ("", ".", "..") for teil in pfad.split("/")):
                probleme.append(f"Ungültiger Scanner-Fund: {basis.sichtbar(text)} (Zeile {nr})")
            else:
                scannerfehler.append({"art": art, "pfad": pfad, "zeile": nr, "text": text})
        elif stufe == "ERROR" and scanner_vorher and text == "Unused scandelete path: node_modules" and variante == "gezielt-scandelete":
            scannerfehler.append({"art": "unused_scandelete", "pfad": "node_modules", "zeile": nr, "text": text})
        elif stufe == "ERROR" and scanner_vorher and abgebrochen:
            abbruch.append({"anzahl": int(abgebrochen[1]), "zeile": nr, "index": index})
            im_scanner = False
        elif stufe in basis.BEANSTANDET or basis.OHNE_KOPF.match(text):
            probleme.append(f"Protokoll, {stufe}: {basis.sichtbar(text)} (Zeile {nr})")
        elif not text.isprintable():
            probleme.append(f"Protokoll, {stufe} mit Steuer- oder Trennzeichen: {basis.sichtbar(text)} (Zeile {nr})")

        kontext, phase = None, None
        gradle = re.fullmatch(rf"> /{basis.PFAD}/gradlew-fdroid/[0-9a-f]{{40}}/gradlew\.py (clean|assembleRelease)", text)
        if stufe == "DEBUG" and gradle:
            kontext, phase = "gradle", gradle[1]
        elif stufe == "DEBUG" and text == PREBUILD + ("" if variante == "ohne" else BEREINIGEN) + PREBUILD_ENDE:
            kontext = "prebuild"
        elif stufe == "DEBUG" and text == BUILD_KOMMANDO:
            kontext = "build"
        elif stufe == "DEBUG" and text.startswith("> git ") and text.endswith(f" build/{appid}") and " clone -- " in text:
            kontext = "git-clone"
        vorzeile = None
        for folge_nr, rohzeile in folge:
            zeile = basis.ANSI_SGR.sub("", rohzeile)
            if not zeile:
                continue
            passend = None
            for eintrag, regex in muster:
                if kontext in eintrag["kontexte"] and regex.fullmatch(zeile):
                    passend = eintrag
                    break
            erlaubt = passend is not None
            if erlaubt and passend["art"] == "gradle_flatdir":
                ort = (phase, vorzeile)
                erlaubt = vorzeile == "> Configure project :capacitor-cordova-android-plugins" and ort not in flatdir
                if erlaubt:
                    flatdir.add(ort)
            if erlaubt and passend["art"] == "android_sdk_xml_3_4":
                erlaubt = phase == "assembleRelease"
            if erlaubt:
                bekannt.append({"art": passend["art"], "zeile": folge_nr, "kontext": kontext, "phase": phase})
            else:
                probleme.append(f"Protokoll, Zeile ohne Kopf: {basis.sichtbar(rohzeile)} (Zeile {folge_nr})")
            vorzeile = zeile

        loeschung = re.fullmatch(rf"Removing (shared library|WebAssembly binary file|binary|gzip file archive|gradle-wrapper\.jar) at ({basis.PFAD})", text)
        if loeschung:
            art, pfad = loeschung.groups()
            erlaubt = stufe == "INFO" and scanner_vorher and art == "gradle-wrapper.jar" and pfad == WRAPPER and not any(e["erwartet"] for e in entfernt)
            entfernt.append({"art": art, "pfad": pfad, "zeile": nr, "erwartet": erlaubt})
            if erlaubt:
                bekannt.append({"art": "scanner_app_wrapper", "zeile": nr})
            else:
                probleme.append(f"Unerwartete Scanner-Entfernung in Zeile {nr}: {basis.sichtbar(text)}")
        elif text.startswith("Removing ") and " at " in text:
            probleme.append(f"Unbekannte Scanner-Entfernung in Zeile {nr}: {basis.sichtbar(text)}")

    scannerabbruch = len(abbruch) == 1 and abbruch[0]["anzahl"] == len(scannerfehler) and bool(scannerfehler)
    if abbruch and not scannerabbruch:
        probleme.append("Scannerabbruch und Zahl der einzeln belegten Scannerfehler stimmen nicht überein.")
    if scannerabbruch:
        nur_unused = len(scannerfehler) == 1 and scannerfehler[0]["art"] == "unused_scandelete"
        ergebnis = {"art": "scandelete_ungenutzt" if nur_unused else "scanner_binaerfunde",
                    "scannerAbbruch": True, "scannerFehler": scannerfehler,
                    "apkNachweis": "nicht erbracht; Build vor der APK-Erzeugung abgebrochen"}
        if nur_unused:
            probleme.append("Scannerabbruch durch ungenutztes scandelete: Unused scandelete path: node_modules; kein APK-Nachweis.")
        elif any(e["art"] == "unused_scandelete" for e in scannerfehler):
            ergebnis["art"] = "scanner_fehler_gemischt"
            probleme.append(f"Scannerabbruch durch {len(scannerfehler)} Scannerfehler: " + "; ".join(e["text"] for e in scannerfehler) + "; kein APK-Nachweis.")
        else:
            probleme.append(f"Scannerabbruch durch {len(scannerfehler)} Binärfunde: " + "; ".join(e["pfad"] for e in scannerfehler) + "; kein APK-Nachweis.")
        erwartet = [("INFO", beginn), ("INFO", scanner), ("ERROR", meldungen[abbruch[0]["index"]][1]), ("INFO", "Finished"), ("INFO", "1 build failed")]
    else:
        for eintrag in scannerfehler:
            probleme.append(f"Scannerfehler ohne passenden Build-Abbruch: {eintrag['text']} (Zeile {eintrag['zeile']})")
        ergebnis = {"art": "build_erfolg", "scannerAbbruch": False, "scannerFehler": scannerfehler}
        erwartet = [("INFO", text) for text in (beginn, scanner, erfolg, f"success: {appid}", "Finished", "1 build succeeded")]
    positionen = []
    for stufe, text in erwartet:
        stellen = [i for i, m in enumerate(meldungen) if m[:2] == (stufe, text)]
        if len(stellen) != 1:
            probleme.append(f"Das Protokoll muss {text} genau einmal nennen, gefunden: {len(stellen)}.")
        positionen.extend(stellen)
    for stufe, text, _, nr in meldungen:
        marker = text.startswith(("Building version ", "Successfully built version ", "Scanning source ", "success:", "Finished")) or text.endswith((" build succeeded", " builds succeeded", " build failed", " builds failed"))
        if marker and (stufe, text) not in erwartet:
            probleme.append(f"Unerwartete Build-Meldung: {stufe}: {basis.sichtbar(text)} (Zeile {nr})")
    if len(positionen) == len(erwartet):
        if positionen != sorted(positionen):
            probleme.append("Die Reihenfolge der Build-Meldungen stimmt nicht.")
        ende, zusammenfassung = positionen[-2:]
        if zusammenfassung != ende + 1 or any(m[0] != "DEBUG" or m[1] != basis.ABSCHLUSS_DEBUG or any(z for _, z in m[2]) for m in meldungen[zusammenfassung + 1:]) or any(z for _, z in meldungen[ende][2] + meldungen[zusammenfassung][2]):
            probleme.append("Nach dem Ende stehen weitere Meldungen im Protokoll.")
    for eintrag in MELDUNGEN:
        anzahl = sum(m["art"] == eintrag["art"] for m in bekannt)
        if anzahl > eintrag["maximal_pro_lauf"]:
            probleme.append(f"Bekannte Meldung {eintrag['art']}: {anzahl} Vorkommen, erlaubt sind höchstens {eintrag['maximal_pro_lauf']} je Lauf.")
    return bekannt, entfernt, ergebnis
