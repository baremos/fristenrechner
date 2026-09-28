#!/usr/bin/env python3
"""Wertet einen Lauf von "fdroid scanner" auf Quelltext aus.

Aufruf:
  scanner-auswerten.py <Lauf> <App-ID> <versionName> <versionCode> <Rückgabewert>

Im Ordner <Lauf> liegen scanner.json (Ausgabe mit --json) und scanner.log
(Protokoll mit --verbose). Rückgabewert: 0 ohne Beanstandung, 1 mit
Beanstandungen.

Der Rückgabewert des Scanners allein belegt nichts: fdroidserver 2.4.2 endet
bei Quelltext auch mit Beanstandungen und nach einem abgefangenen Abbruch
mit 0. Ein Abbruch steht nur im Protokoll. Ohne Beanstandung und ohne Hinweis
ist die Ausgabe im Format JSON leer. Als geprüft gilt ein Stand deshalb nur,
wenn das Protokoll Beginn und Ende der Prüfung nennt.

So liest die Auswertung das Protokoll:

- Eine Meldung beginnt mit dem Kopf "JJJJ-MM-TT HH:MM:SS,mmm STUFE: ". Die
  Stufe steht nur dort. Zeilen ohne Kopf gehören zur Meldung davor.
- Jede Meldung der Stufen WARNING, ERROR und CRITICAL ist eine Beanstandung,
  samt ihren Folgezeilen eine einzige. Steht dieselbe Beanstandung schon in
  der Ausgabe im Format JSON, zählt sie einmal.
- Die Zusammenfassung "Scanner found <Zahl> problems in <App-ID>:<versionCode>:"
  muss zum geprüften Stand und zur Zahl der erfassten Fehler passen. Der
  Scanner zählt dort Fehler, keine Warnungen.
- Ein Traceback und eine Zeile, die mit einer der drei Stufen beginnt, sind
  auch ohne Kopf eine Beanstandung.
"""

import collections
import json
import re
import sys

KOPF = re.compile(
    r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} (DEBUG|INFO|WARNING|ERROR|CRITICAL): (.*)$"
)
ZUSAMMENFASSUNG = re.compile(r"^Scanner found (\d+) problems in (.*):$")
BEANSTANDET = ("WARNING", "ERROR", "CRITICAL")
OHNE_KOPF = re.compile(r"^(?:Traceback \(most recent call last\)|WARNING:|ERROR:|CRITICAL:)")


def lies_meldungen(zeilen):
    """Fasst die Zeilen zu Meldungen zusammen: Stufe, Text, Folgezeilen."""
    vorspann = []
    meldungen = []
    for zeile in zeilen:
        kopf = KOPF.match(zeile)
        if kopf:
            meldungen.append((kopf.group(1), kopf.group(2).strip(), []))
        elif meldungen:
            meldungen[-1][2].append(zeile)
        else:
            vorspann.append(zeile)
    return vorspann, meldungen


def auswerten(lauf, appid, version_name, version_code, rueckgabe):
    probleme = []
    hinweise = []
    gemeldet = collections.Counter()
    fehler_erfasst = 0

    if rueckgabe != "0":
        probleme.append(f"Der Scanner endete mit Rückgabewert {rueckgabe}.")

    # Beanstandungen des Scanners
    try:
        with open(f"{lauf}/scanner.json", encoding="utf-8") as datei:
            ergebnis = json.load(datei)
        if not isinstance(ergebnis, dict) or any(schluessel != appid for schluessel in ergebnis):
            raise ValueError("unerwarteter Aufbau")
        for version, befund in sorted(ergebnis.get(appid, {}).items()):
            if version != version_code:
                probleme.append(f"Die Ausgabe nennt eine andere Version: {version}")
            for art, name in (("errors", "Fehler"), ("warnings", "Warnung")):
                for text, datei in befund.get(art, []):
                    probleme.append(f"{name}: {text} ({datei})")
                    gemeldet[f"Found {text} at {datei}"] += 1
                    if art == "errors":
                        fehler_erfasst += 1
            for text, datei in befund.get("infos", []):
                hinweise.append(text)
    except (OSError, ValueError, AttributeError, TypeError) as fehler:
        probleme.append(f"Die Ausgabe des Scanners ist nicht lesbar: {fehler}")

    # Abbrüche und alles Weitere, das nur im Protokoll steht
    try:
        with open(f"{lauf}/scanner.log", encoding="utf-8", errors="replace") as datei:
            protokoll = datei.read().splitlines()
    except OSError as fehler:
        protokoll = []
        probleme.append(f"Das Protokoll des Scanners ist nicht lesbar: {fehler}")
    vorspann, meldungen = lies_meldungen(protokoll)

    zusammenfassungen = []
    for zeile in vorspann:
        if OHNE_KOPF.match(zeile):
            probleme.append("Protokoll, Zeile ohne Kopf: " + zeile.strip())
    for stufe, text, folgezeilen in meldungen:
        if stufe not in BEANSTANDET:
            for zeile in folgezeilen:
                if OHNE_KOPF.match(zeile):
                    probleme.append("Protokoll, Zeile ohne Kopf: " + zeile.strip())
            continue
        treffer = ZUSAMMENFASSUNG.match(text)
        if treffer:
            zusammenfassungen.append((int(treffer.group(1)), treffer.group(2)))
            continue
        if gemeldet[text] > 0:
            gemeldet[text] -= 1
            continue
        if stufe == "ERROR":
            fehler_erfasst += 1
        zusatz = f" (dazu {len(folgezeilen)} Folgezeilen)" if folgezeilen else ""
        probleme.append("Protokoll: " + text + zusatz)

    stand = f"{appid}:{version_code}"
    for zahl, genannt in zusammenfassungen:
        if genannt != stand:
            probleme.append(f"Die Zusammenfassung des Scanners nennt einen anderen Stand: {genannt}")
    zahl_genannt = sum(zahl for zahl, genannt in zusammenfassungen)
    if zahl_genannt != fehler_erfasst:
        probleme.append(
            f"Die Zusammenfassung des Scanners nennt {zahl_genannt} Probleme, erfasst sind {fehler_erfasst} Fehler."
        )

    if not any(stufe == "INFO" and text == "...scanning version " + version_name for stufe, text, _ in meldungen):
        probleme.append("Das Protokoll nennt den Beginn der Prüfung nicht.")
    if not any(stufe == "INFO" and text == "Finished" for stufe, text, _ in meldungen):
        probleme.append("Das Protokoll nennt das Ende der Prüfung nicht.")

    return hinweise, probleme


def haupt(argumente):
    if len(argumente) != 5:
        print(__doc__, file=sys.stderr)
        return 64
    hinweise, probleme = auswerten(*argumente)
    for hinweis in hinweise:
        print("Hinweis: " + hinweis)
    for problem in probleme:
        print(problem)
    if probleme:
        print(f"ERGEBNIS: {len(probleme)} Beanstandungen")
        return 1
    print("ERGEBNIS: keine Beanstandung")
    return 0


if __name__ == "__main__":
    sys.exit(haupt(sys.argv[1:]))
