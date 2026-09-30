#!/usr/bin/env python3
"""Entfernt ausschließlich geprüfte Pakete unter <Klon>/node_modules.

Aufruf nach Web-Build und cap sync. Keine frei wählbaren Löschordner, keine
Auflösung von Verweisen bei Löschzielen. Vor jedem Löschen wird erneut geprüft.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import subprocess
import sys

HIER = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("npm_inventar_bereinigung", HIER / "npm-inventar.py")
inventur = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventur)


def unterhalb(pfad, basis):
    return pfad != basis and pfad.is_relative_to(basis)


def sicherer_pfad(basis, relativ, verzeichnis=True):
    if not isinstance(relativ, str) or not relativ or "\\" in relativ:
        raise ValueError("Unzulässiger relativer Pfad")
    teile = PurePosixPath(relativ).parts
    if PurePosixPath(relativ).is_absolute() or any(x in (".", "..") or ":" in x for x in teile) or "/".join(teile) != relativ:
        raise ValueError("Unzulässiger relativer Pfad: " + relativ)
    ziel = basis
    for teil in teile:
        ziel = ziel / teil
        if not ziel.exists() and not ziel.is_symlink():
            raise ValueError("Paket/Ordner fehlt; Bereinigungsliste veraltet: " + relativ)
        if inventur.ist_verweis(ziel):
            raise ValueError("Symbolischer Verweis/Junction ist als Lösch- oder Behalten-Pfad unzulässig: " + relativ)
    if not unterhalb(ziel.resolve(), basis.resolve()):
        raise ValueError("Aufgelöster Pfad außerhalb node_modules: " + relativ)
    if verzeichnis and not ziel.is_dir():
        raise ValueError("Paket/Quellordner ist kein Verzeichnis: " + relativ)
    return ziel


def ohne_verweise(pfad):
    def fehler(exc):
        raise exc
    if inventur.ist_verweis(pfad):
        raise ValueError("Symbolischer Verweis/Junction im Löschziel: " + str(pfad))
    for ordner, unterordner, dateien in os.walk(pfad, followlinks=False, onerror=fehler):
        for name in unterordner + dateien:
            if inventur.ist_verweis(Path(ordner) / name):
                raise ValueError("Symbolischer Verweis/Junction im Löschziel: " + str(Path(ordner) / name))


def plattform():
    betrieb = {"win32": "win32", "linux": "linux"}.get(sys.platform)
    cpu = {"AMD64": "x64", "x86_64": "x64"}.get(platform.machine())
    libc = platform.libc_ver()[0] if betrieb == "linux" else None
    if betrieb == "linux" and libc != "glibc":
        raise ValueError("Geprüfte Liste unterstützt unter Linux nur glibc")
    if not betrieb or cpu != "x64":
        raise ValueError("Geprüfte Liste unterstützt nur Windows x64 und Linux x64/glibc")
    return {"os": betrieb, "cpu": cpu, "libc": libc}


def aktiv(eintrag, system):
    return all(not eintrag.get(k) or system[k] in eintrag[k] for k in ("os", "cpu", "libc"))


def behalten_lesen(wurzel):
    prozess = subprocess.run(["node", str(wurzel / "scripts" / "app-bauen.mjs"), "--android-quellen"],
                             cwd=wurzel, capture_output=True, text=True, check=False)
    if prozess.returncode:
        raise ValueError("Android-Quellen nicht lesbar: " + prozess.stderr.strip())
    quellen = prozess.stdout.splitlines()
    if not quellen or len(quellen) != len(set(quellen)):
        raise ValueError("Android-Quellen sind leer oder doppelt")
    for quelle in quellen:
        if not quelle.startswith("node_modules/"):
            raise ValueError("Android-Quelle liegt nicht unter node_modules: " + quelle)
        sicherer_pfad(wurzel / "node_modules", quelle.removeprefix("node_modules/"))
    return sorted(quellen)


def rest_pruefen(funde, zulassungen):
    erlaubt = {}
    for z in zulassungen:
        if not isinstance(z, dict) or not z.get("grund", "").strip() or not re.fullmatch(r"[0-9a-f]{64}", z.get("sha256", "")) or not isinstance(z.get("bytes"), int):
            raise ValueError("Zulassung braucht pfad, bytes, sha256 und konkrete Begründung")
        if z.get("pfad") in erlaubt:
            raise ValueError("Doppelte Zulassung")
        erlaubt[z["pfad"]] = z
    for fund in funde:
        z = erlaubt.get(fund["pfad"])
        if not z or any(z[k] != fund[k] for k in ("bytes", "sha256")):
            raise ValueError("Restdatei ohne passende Zulassung: " + fund["pfad"])
    if set(erlaubt) != {f["pfad"] for f in funde}:
        raise ValueError("Zulassung veraltet: zugelassene Datei fehlt im Restinventar")


def bereinigen(wurzel, liste=None):
    wurzel = Path(wurzel).absolute()
    if not wurzel.is_dir() or inventur.ist_verweis(wurzel) or wurzel.resolve() != wurzel:
        raise ValueError("Klonwurzel fehlt oder enthält einen symbolischen Verweis/Junction")
    nm = wurzel / "node_modules"
    if not nm.is_dir() or inventur.ist_verweis(nm) or nm.resolve() != nm:
        raise ValueError("node_modules fehlt oder ist ein symbolischer Verweis/Junction")
    daten = json.loads(Path(liste or HIER / "bereinigungsliste.json").read_text(encoding="utf-8"))
    if daten.get("schemaVersion") != 1 or not isinstance(daten.get("pakete"), list) or not isinstance(daten.get("zulassen"), list):
        raise ValueError("Unbekanntes Format der Bereinigungsliste")
    lock = json.loads((wurzel / "package-lock.json").read_text(encoding="utf-8"))["packages"]
    system = plattform()
    behalten = behalten_lesen(wurzel)
    quellen = [wurzel / x for x in behalten]
    ziele, entfernt, inaktiv = [], [], []
    gesehen = set()
    for eintrag in daten["pakete"]:
        name = eintrag.get("paket", "")
        if not re.fullmatch(r"(?:@[a-z0-9._-]+/)?[a-z0-9._-]+", name) or name in (".", "..") or name in gesehen:
            raise ValueError("Unzulässiges oder doppeltes Paket in Liste: " + name)
        gesehen.add(name)
        if not all(isinstance(eintrag.get(k), str) and eintrag[k].strip() for k in ("version", "lizenz", "grund", "rolle")):
            raise ValueError("Unvollständige Paketbegründung: " + name)
        meta = lock.get("node_modules/" + name)
        if not meta or meta.get("version") != eintrag["version"] or meta.get("license") != eintrag["lizenz"]:
            raise ValueError("Lockfile stimmt nicht mit geprüfter Liste überein: " + name)
        if any(meta.get(k, []) != eintrag.get(k, []) for k in ("os", "cpu", "libc")):
            raise ValueError("Plattformangabe weicht vom Lockfile ab: " + name)
        ziel = nm / name
        if not aktiv(eintrag, system) and not ziel.exists() and not ziel.is_symlink():
            inaktiv.append(name)
            continue
        ziel = sicherer_pfad(nm, name)
        if any(q == ziel or unterhalb(q, ziel) or unterhalb(ziel, q) for q in quellen):
            raise ValueError("Zu behaltender Ordner in der Löschmenge: " + name)
        ohne_verweise(ziel)
        paket = json.loads((ziel / "package.json").read_text(encoding="utf-8"))
        if paket.get("name") != name or paket.get("version") != eintrag["version"]:
            raise ValueError("Installiertes Paket weicht von geprüfter Liste ab: " + name)
        ziele.append(ziel)
        entfernt.append({**eintrag, "pfad": name})
    vorher = inventur.inventar(nm)
    def wird_entfernt(pfad):
        p = nm / pfad
        return any(p == ziel or unterhalb(p, ziel) for ziel in ziele)
    # Bereits vor der Mutation abbrechen, falls die Liste bekannte Reste lässt.
    rest_pruefen([f for f in vorher if not wird_entfernt(f["pfad"])], daten["zulassen"])
    entfernte_dateien = []
    for ziel in ziele:
        for f in inventur.dateiliste(ziel):
            entfernte_dateien.append({**f, "pfad": ziel.relative_to(nm).as_posix() + "/" + f["pfad"]})
    for ziel in ziele:
        sicherer_pfad(nm, ziel.relative_to(nm).as_posix())
        ohne_verweise(ziel)
        shutil.rmtree(ziel)
    nachher = inventur.inventar(nm)
    rest_pruefen(nachher, daten["zulassen"])
    for quelle in behalten:
        sicherer_pfad(nm, quelle.removeprefix("node_modules/"))
    return {"schemaVersion": 1, "plattform": system, "entferntPakete": entfernt,
            "inaktivePakete": inaktiv, "behalten": behalten,
            "entfernteDateien": sorted(entfernte_dateien, key=lambda f: f["pfad"]),
            "vorher": vorher, "nachher": nachher, "zugelassen": daten["zulassen"]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wurzel", required=True, type=Path)
    parser.add_argument("--ausgabe", required=True, type=Path)
    parser.add_argument("--liste", type=Path)
    args = parser.parse_args(argv)
    # Ausgabe vor der Mutation reservieren: Bestehende Belege niemals überschreiben.
    with args.ausgabe.open("x", encoding="utf-8") as datei:
        bericht = bereinigen(args.wurzel, args.liste)
        json.dump(bericht, datei, ensure_ascii=False, indent=2)
        datei.write("\n")
    print(f"Bereinigung: {len(bericht['entferntPakete'])} Pakete, {len(bericht['entfernteDateien'])} Dateien entfernt; {len(bericht['nachher'])} zugelassene Restfunde.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as fehler:
        print(f"Bereinigung gescheitert: {fehler}", file=sys.stderr)
        sys.exit(1)
