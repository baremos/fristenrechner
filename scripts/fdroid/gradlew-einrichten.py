#!/usr/bin/env python3
"""Stellt das festgehaltene Buildwerkzeug bereit, ohne es auszuführen."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import urllib.parse
import urllib.request


class Fehler(Exception):
    def __init__(self, text, code=65):
        super().__init__(text)
        self.code = code


class Argumente(argparse.ArgumentParser):
    def error(self, message):
        raise Fehler("Ungültiger Aufruf: " + message, 64)


class NurHTTPS(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise Fehler("Die Umleitung verwendet kein HTTPS.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def festlegung(datei):
    try:
        daten = json.loads(Path(datei).read_text(encoding="utf-8"))["gradlewFdroid"]
        quelle = daten["quelle"]
        commit = daten["commit"]
        name = daten["datei"]
        summe = daten["sha256"]
        lizenz = daten["lizenz"]
        python = daten["pythonMindestens"]
        ordner = daten["benutzerOrdner"]
        if quelle != "https://gitlab.com/fdroid/gradlew-fdroid":
            raise ValueError("Quelle")
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError("Commit")
        if name != "gradlew.py" or not re.fullmatch(r"[0-9a-f]{64}", summe):
            raise ValueError("Datei oder SHA-256")
        if lizenz != "AGPL-3.0-only" or not re.fullmatch(r"[0-9]+\.[0-9]+", python):
            raise ValueError("Lizenz oder Python-Version")
        if not re.fullmatch(r"[a-z0-9-]+(?:/[a-z0-9-]+)*", ordner):
            raise ValueError("Benutzerordner")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise Fehler("Ungültige Festlegung für gradlew-fdroid: " + str(exc)) from exc
    if sys.version_info[:2] < tuple(map(int, python.split("."))):
        raise Fehler("Das Buildwerkzeug braucht Python ab " + python + ".", 69)
    return daten


def benutzerziel(ziel, vorgabe):
    heimat = Path.home().resolve()
    if ziel is None:
        daten = os.environ.get("XDG_DATA_HOME")
        if daten and not Path(daten).is_absolute():
            raise Fehler("XDG_DATA_HOME muss ein absoluter Pfad sein.", 64)
        ziel = (Path(daten) if daten else heimat / ".local/share") / vorgabe
    ziel = Path(ziel).expanduser().resolve()
    if ziel == heimat or heimat not in ziel.parents:
        raise Fehler("Der Zielordner muss innerhalb des Benutzerordners liegen.", 64)
    return ziel


def pruefe_datei(datei, summe):
    if datei.is_symlink() or not datei.is_file():
        raise Fehler("gradlew.py fehlt oder ist keine reguläre Datei.")
    berechnet = hashlib.sha256(datei.read_bytes()).hexdigest()
    if berechnet != summe:
        raise Fehler("Die Prüfsumme weicht ab. Erwartet: " + summe)
    if os.name != "nt" and not datei.stat().st_mode & stat.S_IXUSR:
        raise Fehler("gradlew.py ist für den Benutzer nicht ausführbar.")


def laden(adresse, datei):
    # Die Standardbibliothek prüft das TLS-Zertifikat. Auch Weiterleitungen
    # müssen HTTPS verwenden; über den Inhalt entscheidet die festgelegte SHA.
    aufrufer = urllib.request.build_opener(NurHTTPS())
    with aufrufer.open(adresse, timeout=60) as quelle, datei.open("xb") as ziel:
        shutil.copyfileobj(quelle, ziel)


def main(argv=None):
    parser = Argumente(description=__doc__)
    parser.add_argument("festlegung", help=argparse.SUPPRESS)
    parser.add_argument("--ziel", help="Basisordner innerhalb des Benutzerordners")
    modus = parser.add_mutually_exclusive_group()
    modus.add_argument("--probelauf", action="store_true")
    modus.add_argument("--nur-pruefen", action="store_true")
    try:
        args = parser.parse_args(argv)
        daten = festlegung(args.festlegung)
        basis = benutzerziel(args.ziel, daten["benutzerOrdner"])
        ordner = basis / daten["commit"]
        datei = ordner / daten["datei"]
        adresse = daten["quelle"] + "/-/raw/" + daten["commit"] + "/" + daten["datei"]
        print("Commit:  " + daten["commit"])
        print("Quelle:  " + adresse)
        print("SHA-256: " + daten["sha256"])
        print("Lizenz:  " + daten["lizenz"])
        print("Ziel:    " + str(datei))
        if ordner.is_symlink() or (ordner.exists() and not ordner.is_dir()):
            raise Fehler("Der Zielstand ist keine reguläre Ablage. Nichts überschrieben.")
        if ordner.exists():
            pruefe_datei(datei, daten["sha256"])
            print("Der festgehaltene Stand ist vorhanden und geprüft; nichts geladen.")
            return 0
        if args.nur_pruefen:
            raise Fehler("Der festgehaltene Stand fehlt; nichts geladen.", 66)
        if args.probelauf:
            print("Probelauf: nichts geladen, nichts geschrieben, nichts ausgeführt.")
            return 0

        basis.mkdir(parents=True, exist_ok=True)
        arbeit = Path(tempfile.mkdtemp(prefix="einrichten-", dir=basis))
        print("Arbeitsordner (bleibt erhalten): " + str(arbeit))
        geladen = arbeit / daten["datei"]
        print("Lade " + adresse)
        laden(adresse, geladen)
        geladen.chmod(0o755)
        pruefe_datei(geladen, daten["sha256"])
        # mkdir und link scheitern, falls ein anderer Lauf das Ziel anlegt.
        # So kann auch ein leerer vorhandener Ordner nicht ersetzt werden.
        ordner.mkdir()
        os.link(geladen, datei)
        print("gradlew-fdroid ist eingerichtet und geprüft; nicht ausgeführt.")
        return 0
    except Fehler as exc:
        print(str(exc), file=sys.stderr)
        return exc.code
    except (OSError, ValueError) as exc:
        print("Einrichtung oder Prüfung gescheitert: " + str(exc), file=sys.stderr)
        return 74


if __name__ == "__main__":
    sys.exit(main())
