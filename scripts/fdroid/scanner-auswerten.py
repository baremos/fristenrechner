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
"""

import json
import re
import sys

STUFE = re.compile(r"(?:^|\s)(?:WARNING|ERROR|CRITICAL):\s*(.*)$")


def auswerten(lauf, appid, version_name, version_code, rueckgabe):
    probleme = []
    hinweise = []
    gemeldet = set()

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
                    gemeldet.add(f"Found {text} at {datei}")
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
    for zeile in protokoll:
        treffer = STUFE.search(zeile)
        if zeile.startswith("Traceback"):
            probleme.append("Protokoll: " + zeile.strip())
        elif treffer:
            meldung = treffer.group(1).strip()
            if meldung in gemeldet or meldung.startswith("Scanner found "):
                continue
            probleme.append("Protokoll: " + meldung)
    if not any(zeile.endswith("...scanning version " + version_name) for zeile in protokoll):
        probleme.append("Das Protokoll nennt den Beginn der Prüfung nicht.")
    if not any(zeile.endswith("INFO: Finished") for zeile in protokoll):
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
