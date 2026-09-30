#!/usr/bin/env python3
"""Inventar vorgebauter Dateien, einschließlich heuristisch erkanntem JS-WASM.

Erfasst Dateiendungen und Signaturen (ELF, PE, Mach-O, WASM, Archive).
In JS erkennt es WASM-Magic als Base64, Escape-Sequenz oder Byte-Array sowie
WebAssembly-Ladeaufrufe als Verdacht. Das beweist keine vollständige Erkennung
verschleierter/zusammengesetzter Daten. Skripte mit Shebang sind Quelltext und
werden nicht allein wegen des Ausführungsbits als vorgebaut klassifiziert.
Liest Dateien, folgt keinen symbolischen Verweisen oder Junctions, löscht nichts.
"""
import hashlib
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import stat
import sys

ENDUNGEN = {".node", ".wasm", ".so", ".exe", ".dll", ".dylib", ".jar", ".aar",
            ".zip", ".tar", ".tgz", ".gz", ".bz2", ".xz", ".7z", ".rar", ".a", ".lib",
            ".zst", ".lz4", ".cab", ".deb", ".rpm", ".apk", ".aab", ".class", ".dex"}
JS_WASM = re.compile(rb"AGFzbQ|\\x00asm|\\0asm|\\u0000asm|"
                     rb"(?:0|0x00)\s*,\s*(?:97|0x61)\s*,\s*(?:115|0x73)\s*,\s*(?:109|0x6[dD])|"
                     rb"WebAssembly\s*\.\s*(?:instantiate|compile|Module)\s*\(")


def ist_verweis(pfad):
    return pfad.is_symlink() or bool(getattr(pfad.lstat(), "st_file_attributes", 0) &
                                     getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def dateien(wurzel):
    """Reguläre Dateien; npm-Workspace-Links und .bin-Links werden ausgelassen."""
    wurzel = Path(wurzel)
    if not wurzel.is_dir() or ist_verweis(wurzel):
        raise ValueError("node_modules fehlt oder ist ein symbolischer Verweis")
    def lesefehler(fehler):
        raise fehler
    for ordner, unterordner, namen in os.walk(wurzel, followlinks=False, onerror=lesefehler):
        unterordner[:] = sorted(n for n in unterordner if not ist_verweis(Path(ordner) / n))
        for name in sorted(namen):
            pfad = Path(ordner) / name
            if not ist_verweis(pfad) and pfad.is_file():
                yield pfad


def arten(pfad, inhalt):
    fund = set()
    endung = pfad.suffix.lower()
    if endung in ENDUNGEN or re.search(r"\.so(?:\.[0-9]+)+$", pfad.name):
        fund.add("endung:" + (endung if endung in ENDUNGEN else ".so"))
    if inhalt.startswith(b"\x7fELF"):
        fund.add("ELF")
    if inhalt.startswith(b"MZ"):
        fund.add("PE")
    if inhalt[:4] in (b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca"):
        fund.add("Mach-O-oder-Java")
    if inhalt.startswith(b"\x00asm"):
        fund.add("WASM")
    if inhalt.startswith((b"PK\x03\x04", b"PK\x05\x06", b"\x1f\x8b", b"BZh", b"\xfd7zXZ\x00", b"7z\xbc\xaf\x27\x1c", b"Rar!", b"!<arch>", b"\x28\xb5\x2f\xfd", b"\x04\x22\x4d\x18", b"MSCF", b"\xed\xab\xee\xdb")) or inhalt[257:262] == b"ustar":
        fund.add("Archiv")
    if inhalt.startswith(b"dex\n"):
        fund.add("Android-Dex")
    if endung in (".js", ".mjs", ".cjs") and JS_WASM.search(inhalt):
        fund.add("JS-WASM-Verdacht")
    return sorted(fund)


def dateiliste(wurzel):
    wurzel = Path(wurzel)
    def lesen(pfad):
        with pfad.open("rb") as datei:
            summe = hashlib.file_digest(datei, "sha256").hexdigest()
        return {"pfad": pfad.relative_to(wurzel).as_posix(), "bytes": pfad.stat().st_size,
                "sha256": summe}
    # Windows kann jeden einzelnen Datei-Open verzögern. Acht Leser begrenzen
    # die Last; die Traversierung und Prüfung der Verweise bleiben unverändert.
    # map reicht Lesefehler weiter; kein Teilinventar wird als Erfolg geliefert.
    with ThreadPoolExecutor(max_workers=8) as pool:
        return sorted(pool.map(lesen, dateien(wurzel)), key=lambda fund: fund["pfad"])


def inventar(wurzel):
    wurzel = Path(wurzel)
    def lesen(pfad):
        with pfad.open("rb") as datei:
            inhalt = datei.read() if pfad.suffix.lower() in (".js", ".mjs", ".cjs") else datei.read(512)
            gefunden = arten(pfad, inhalt)
            if gefunden:
                datei.seek(0)
                summe = hashlib.file_digest(datei, "sha256").hexdigest()
                return {"pfad": pfad.relative_to(wurzel).as_posix(), "bytes": pfad.stat().st_size,
                        "sha256": summe, "arten": gefunden}
        return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        return sorted((fund for fund in pool.map(lesen, dateien(wurzel)) if fund is not None),
                      key=lambda fund: fund["pfad"])


def main():
    argumente = sys.argv[1:]
    alle = bool(argumente and argumente[0] == "--alle")
    if alle:
        argumente = argumente[1:]
    if len(argumente) != 2:
        raise ValueError("Aufruf: npm-inventar.py [--alle] <node_modules> <neue JSON-Datei>")
    funde = dateiliste(argumente[0]) if alle else inventar(argumente[0])
    with open(argumente[1], "x", encoding="utf-8") as datei:
        json.dump(funde, datei, ensure_ascii=False, indent=2)
        datei.write("\n")
    print(f"Inventar: {len(funde)} Dateien; " + ("alle regulären Dateien, ohne Verweise." if alle else "JS-WASM heuristisch, keine Vollständigkeitsgarantie."))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as fehler:
        print(f"Inventar gescheitert: {fehler}", file=sys.stderr)
        sys.exit(1)
