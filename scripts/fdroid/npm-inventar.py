#!/usr/bin/env python3
"""Inventar vor dem Scanner; keine vollständige Erkennung eingebetteter Programme.

Sucht Dateiendungen, ELF und WebAssembly am Dateianfang, hält SHA-256 und
Größe fest. Eingebettetes WASM in JavaScript muss zusätzlich geprüft werden.
Liest Dateien, folgt keinen symbolischen Verweisen und löscht nichts.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

ENDUNGEN = {".node", ".wasm", ".so", ".exe", ".dll", ".dylib", ".jar", ".aar"}


def inventar(wurzel):
    wurzel = Path(wurzel)
    if not wurzel.is_dir() or wurzel.is_symlink():
        raise ValueError("node_modules fehlt oder ist ein symbolischer Verweis")
    funde = []
    def lesefehler(fehler):
        raise fehler
    for ordner, unterordner, dateien in os.walk(wurzel, followlinks=False, onerror=lesefehler):
        unterordner[:] = sorted(n for n in unterordner if not (Path(ordner) / n).is_symlink())
        for name in sorted(dateien):
            pfad = Path(ordner) / name
            if pfad.is_symlink() or not pfad.is_file():
                continue
            with pfad.open("rb") as datei:
                kopf = datei.read(4)
                if pfad.suffix.lower() not in ENDUNGEN and kopf not in (b"\x7fELF", b"\x00asm"):
                    continue
                datei.seek(0)
                summe = hashlib.file_digest(datei, "sha256").hexdigest()
            funde.append({"pfad": pfad.relative_to(wurzel).as_posix(),
                          "bytes": pfad.stat().st_size, "sha256": summe})
    return funde


def main():
    if len(sys.argv) != 3:
        raise ValueError("Aufruf: npm-inventar.py <node_modules> <neue JSON-Datei>")
    funde = inventar(sys.argv[1])
    with open(sys.argv[2], "x", encoding="utf-8") as datei:
        json.dump(funde, datei, ensure_ascii=False, indent=2)
        datei.write("\n")
    print(f"Inventar vor dem Scanner: {len(funde)} Dateien; eingebettetes WASM nicht vollständig erfasst.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as fehler:
        print(f"Inventar gescheitert: {fehler}", file=sys.stderr)
        sys.exit(1)
