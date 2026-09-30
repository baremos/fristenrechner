#!/usr/bin/env python3
"""Vergleicht einen F-Droid-Lauf der App mit Referenz, Inventaren und Web-Build.

Aufruf: app-auswerten.py --lauf <Laufordner>
Schreibt neue auswertung.json, vergleich.json und vergleich.md. Rückgabe 0
bedeutet: alle vorhandenen Nachweise erfüllen die Prüfungen; 1 nennt offene
Befunde. Es gibt keine Freigabe neuer Protokollmeldungen ohne einen echten Lauf.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import stat
import sys
import zipfile


APP_REFERENZ = json.loads(Path(__file__).with_name("app-referenz.json").read_text(encoding="utf-8"))
APPID = APP_REFERENZ["appId"]
VERSION_NAME = APP_REFERENZ["versionName"]
VERSION_CODE = APP_REFERENZ["versionCode"]
REFERENZ_BYTES = APP_REFERENZ["apk"]["bytes"]
REFERENZ_SHA256 = APP_REFERENZ["apk"]["sha256"]
PHASEN = ("vor-web", "nach-web", "nach-bereinigung", "nach-scanner", "nach-lauf")
VARIANTEN = ("ohne", "gezielt", "gezielt-scandelete")
LEER_SHA256 = hashlib.sha256(b"").hexdigest()
BELEGTE_LEERQUELLEN = frozenset(("node-fetch-native/lib/empty.cjs", "node-fetch-native/lib/empty.mjs"))
BELEGTE_LEERZIELE = frozenset(("assets/public/cordova.js", "assets/public/cordova_plugins.js"))


def lade_modul(name):
    quelle = Path(__file__).with_name(name + ".py")
    spezifikation = importlib.util.spec_from_file_location(name.replace("-", "_"), quelle)
    modul = importlib.util.module_from_spec(spezifikation)
    spezifikation.loader.exec_module(modul)
    return modul


BUILD = lade_modul("build-auswerten")
PROTOKOLL = lade_modul("app-protokoll")


def relativ(pfad):
    """Nur eindeutige POSIX-Pfade; kein Traversal oder Windows-Laufwerk."""
    if (not isinstance(pfad, str) or not pfad or "\\" in pfad or ":" in pfad
            or any(ord(zeichen) < 32 or ord(zeichen) == 127 for zeichen in pfad)
            or any(teil in ("", ".", "..") for teil in pfad.split("/"))):
        raise ValueError(f"Ungültiger relativer Pfad: {pfad!r}")
    return pfad


def lies_json(wurzel, name):
    relativ(name)
    return json.loads(BUILD.pruefe_pfad(wurzel, name).read_text(encoding="utf-8"))


def dateiangaben(dateien, mit_arten=False):
    if not isinstance(dateien, list):
        raise ValueError("Dateiliste muss eine Liste sein")
    ergebnis = {}
    for eintrag in dateien:
        if not isinstance(eintrag, dict):
            raise ValueError("Dateiangabe muss ein Objekt sein")
        pfad = relativ(eintrag.get("pfad"))
        if pfad in ergebnis:
            raise ValueError(f"Doppelter Dateipfad: {pfad}")
        if (type(eintrag.get("bytes")) is not int or eintrag["bytes"] < 0
                or not isinstance(eintrag.get("sha256"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", eintrag["sha256"])):
            raise ValueError(f"Größe oder SHA-256 ungültig: {pfad}")
        if mit_arten and (not isinstance(eintrag.get("arten"), list) or not eintrag["arten"]
                          or any(not isinstance(art, str) or not art for art in eintrag["arten"])):
            raise ValueError(f"Arten des Fundes fehlen: {pfad}")
        ergebnis[pfad] = dict(eintrag)
    return ergebnis


def hash_datei(pfad):
    sha256 = hashlib.sha256()
    with pfad.open("rb") as datei:
        for block in iter(lambda: datei.read(1024 * 1024), b""):
            sha256.update(block)
    return {"bytes": pfad.stat().st_size, "sha256": sha256.hexdigest()}


def bytegleich(links, rechts):
    """Zusätzlich zu Hash und Größe ein unmittelbarer Vergleich beider Dateien."""
    with links.open("rb") as a, rechts.open("rb") as b:
        while True:
            block_a, block_b = a.read(1024 * 1024), b.read(1024 * 1024)
            if block_a != block_b:
                return False
            if not block_a:
                return True


def apk_dateien(pfad):
    """Alle regulären ZIP-Inhalte mit CRC-Prüfung, Größe und SHA-256."""
    ergebnis = {}
    gesehen = set()
    with zipfile.ZipFile(pfad) as archiv:
        for eintrag in archiv.infolist():
            name = eintrag.filename
            if name in gesehen:
                raise ValueError(f"Doppelter ZIP-Eintrag: {name}")
            gesehen.add(name)
            relativ(name[:-1] if eintrag.is_dir() else name)
            modus = eintrag.external_attr >> 16
            if stat.S_ISLNK(modus) or (stat.S_IFMT(modus) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError(f"Unzulässiger ZIP-Dateityp: {name}")
            if eintrag.is_dir():
                continue
            if stat.S_ISDIR(modus):
                raise ValueError(f"Widersprüchlicher ZIP-Dateityp: {name}")
            sha256 = hashlib.sha256()
            groesse = 0
            with archiv.open(eintrag) as datei:
                for block in iter(lambda: datei.read(1024 * 1024), b""):
                    groesse += len(block)
                    sha256.update(block)
            if groesse != eintrag.file_size:
                raise ValueError(f"Unvollständiger ZIP-Inhalt: {name}")
            ergebnis[name] = {"pfad": name, "bytes": groesse, "sha256": sha256.hexdigest()}
    for name in ("AndroidManifest.xml", "classes.dex"):
        if name not in ergebnis or not ergebnis[name]["bytes"]:
            raise ValueError(f"APK-Eintrag fehlt oder ist leer: {name}")
    return ergebnis


def gleicher_inhalt(links, rechts):
    return (links["bytes"], links["sha256"]) == (rechts["bytes"], rechts["sha256"])


def in_apk(dateien, apk):
    nach_inhalt = {}
    for name, eintrag in apk.items():
        nach_inhalt.setdefault((eintrag["bytes"], eintrag["sha256"]), []).append(name)
    return [{"quelle": eintrag["pfad"], "apkPfade": nach_inhalt[(eintrag["bytes"], eintrag["sha256"])],
             "bytes": eintrag["bytes"], "sha256": eintrag["sha256"]}
            for eintrag in dateien.values() if (eintrag["bytes"], eintrag["sha256"]) in nach_inhalt]


def belege_leerdatei_gleichheiten(treffer, bereinigung, web):
    """Nur die am 2026-09-30 quellengeprüfte, unabhängig erzeugte Leerpaarung.

    Raw-Hash-Treffer bleiben unverändert im Bericht. Andere Leerdateien,
    Paketversionen und Scanner-Entfernungen erhalten hier keine Ausnahme.
    """
    if (not isinstance(bereinigung, dict) or bereinigung.get("schemaVersion") != 1 or not isinstance(web, dict)
            or web.get("bestanden") is not True):
        return [], list(treffer)
    pakete = bereinigung.get("entferntPakete", [])
    for paket, version in (("node-fetch-native", "1.6.7"), ("@capacitor/cli", "8.5.2")):
        eintraege = [eintrag for eintrag in pakete if isinstance(eintrag, dict) and eintrag.get("paket") == paket]
        if len(eintraege) != 1 or eintraege[0].get("version") != version:
            return [], list(treffer)
    passende = [eintrag for eintrag in treffer
                if eintrag["quelle"] in BELEGTE_LEERQUELLEN
                and type(eintrag["bytes"]) is int and eintrag["bytes"] == 0 and eintrag["sha256"] == LEER_SHA256
                and len(eintrag["apkPfade"]) == 2 and set(eintrag["apkPfade"]) == BELEGTE_LEERZIELE]
    # Der gelesene Paketstand enthält beide Quelldateien; keine verkürzte
    # Teilmenge als Nachweis eines anderen oder unvollständigen Standes werten.
    if len(passende) != 2 or {eintrag["quelle"] for eintrag in passende} != BELEGTE_LEERQUELLEN:
        return [], list(treffer)
    beleg = {
        "geprueftAm": "2026-09-30",
        "quelle": "@capacitor/cli@8.5.2, dist/cordova.js: createEmptyCordovaJS",
        "aufrufer": "handleCordovaPluginsJS bei fehlenden Cordova-Plugins",
        "projektPruefung": "scripts/app-pruefungen.json: sync.leereDateien",
    }
    begruendung = ("Capacitor CLI 8.5.2 schreibt cordova.js und cordova_plugins.js selbst mit dem leeren Inhalt ''. "
                   "Die beiden leeren Dateien von node-fetch-native 1.6.7 werden dabei nicht kopiert. "
                   "Das vor der Bereinigung gesicherte Web-Manifest stimmt vollständig mit assets/public in der APK überein.")
    belegt = [{**eintrag, "grund": begruendung, "beleg": dict(beleg)} for eintrag in passende]
    return belegt, [eintrag for eintrag in treffer if eintrag not in passende]


def web_vergleich(web, apk):
    gebaut = {name.removeprefix("assets/public/"): eintrag for name, eintrag in apk.items()
              if name.startswith("assets/public/")}
    fehlt = sorted(set(web) - set(gebaut))
    zusaetzlich = sorted(set(gebaut) - set(web))
    abweichend = sorted(name for name in set(web) & set(gebaut) if not gleicher_inhalt(web[name], gebaut[name]))
    return {"dateienVorBereinigung": len(web), "dateienInApk": len(gebaut),
            "fehlend": fehlt, "zusaetzlich": zusaetzlich, "abweichend": abweichend,
            "bestanden": not (fehlt or zusaetzlich or abweichend)}


def inventare_laden(lauf, probleme, scannerabbruch=False):
    inventare = {}
    for phase in PHASEN:
        name = f"npm-vorgebaut-{phase}.json"
        # nach-lauf ist ein ausdrücklich getrennter Ersatznachweis bei Abbruch.
        if (phase == "nach-lauf" or phase == "nach-scanner" and scannerabbruch) and not (lauf / name).exists():
            inventare[phase] = None
            continue
        try:
            inventare[phase] = dateiangaben(lies_json(lauf, name), mit_arten=True)
        except (OSError, ValueError) as fehler:
            inventare[phase] = None
            probleme.append(f"Inventar {phase} fehlt oder ist ungültig: {fehler}")
    return inventare


def bereinigung_laden(lauf, variante, inventare, probleme):
    if variante == "ohne" and not (lauf / "bereinigung.json").exists():
        vorher, nachher = inventare["nach-web"], inventare["nach-bereinigung"]
        if vorher is not None and nachher is not None and vorher != nachher:
            probleme.append("Die Inventare ändern sich in der Variante ohne Bereinigung.")
        return None, {}
    try:
        bericht = lies_json(lauf, "bereinigung.json")
        if not isinstance(bericht, dict) or bericht.get("schemaVersion") != 1:
            raise ValueError("schemaVersion 1 erwartet")
        pakete, behalten = bericht.get("entferntPakete"), bericht.get("behalten")
        if not isinstance(pakete, list) or not isinstance(behalten, list) or not behalten:
            raise ValueError("Paketliste oder zu behaltende Quellen fehlen")
        for pfad in behalten:
            relativ(pfad)
            if not pfad.startswith("node_modules/"):
                raise ValueError("Zu behaltende Quelle liegt nicht unter node_modules")
        entfernt = dateiangaben(bericht.get("entfernteDateien"))
        vorher = dateiangaben(bericht.get("vorher"), mit_arten=True)
        nachher = dateiangaben(bericht.get("nachher"), mit_arten=True)
        zugelassen = dateiangaben(bericht.get("zugelassen"))
        if any(not isinstance(eintrag.get("grund"), str) or not eintrag["grund"].strip()
               for eintrag in zugelassen.values()):
            raise ValueError("Zulassung ohne Begründung")
        for phase, inhalt in (("nach-web", vorher), ("nach-bereinigung", nachher)):
            if inventare[phase] is not None and inventare[phase] != inhalt:
                probleme.append(f"Bereinigungsbericht stimmt nicht mit Inventar {phase} überein.")
        if variante == "ohne" and (pakete or entfernt or vorher != nachher):
            probleme.append("Variante ohne Bereinigung meldet entfernte Pakete oder Dateien.")
        if variante != "ohne" and (not pakete or not entfernt):
            probleme.append("Die gezielte Bereinigung hat keine entfernten Pakete oder Dateien belegt.")
        if variante != "ohne":
            for name, eintrag in nachher.items():
                if name not in zugelassen or not gleicher_inhalt(eintrag, zugelassen[name]):
                    probleme.append(f"Restdatei nach der Bereinigung ohne genaue Zulassung: {name}")
            for name in zugelassen:
                if name not in nachher:
                    probleme.append(f"Zulassung ohne verbleibenden Inventarfund: {name}")
        for name, eintrag in vorher.items():
            if name not in nachher and (name not in entfernt or not gleicher_inhalt(eintrag, entfernt[name])):
                probleme.append(f"Entfernter Inventarfund fehlt im vollständigen Bereinigungsbericht: {name}")
        for name in entfernt:
            if name in nachher:
                probleme.append(f"Als entfernt gemeldete Datei bleibt im Inventar: {name}")
            if any("node_modules/" + name == pfad or ("node_modules/" + name).startswith(pfad + "/")
                   for pfad in behalten):
                probleme.append(f"Zu behaltende Quelle wird als entfernt gemeldet: {name}")
        return bericht, entfernt
    except (OSError, ValueError, TypeError) as fehler:
        probleme.append(f"Bereinigungsbericht fehlt oder ist ungültig: {fehler}")
        return None, {}


def matrix(inventare, apk):
    namen = sorted(set().union(*(set(wert) for wert in inventare.values() if wert is not None)))
    zeilen = []
    for name in namen:
        phasen = {phase: (None if daten is None else daten.get(name, False)) for phase, daten in inventare.items()}
        vorkommen = {}
        for phase, eintrag in phasen.items():
            if isinstance(eintrag, dict):
                vorkommen[phase] = [treffer["apkPfade"] for treffer in in_apk({name: eintrag}, apk)]
        zeilen.append({"pfad": name, "phasen": phasen, "apkInhaltsgleich": vorkommen})
    return zeilen


def scanner_dateien_pruefen(lauf, inventare, protokoll_entfernt, variante, probleme, scannerabbruch=False):
    """Vergleicht alle regulären Dateien, nicht nur bereits erkannte Binärfunde."""
    voll = {}
    for phase, inventar_phase in (("vor-scanner", "nach-bereinigung"), ("nach-scanner", "nach-scanner")):
        if phase == "nach-scanner" and scannerabbruch and not (lauf / f"npm-dateien-{phase}.json").exists():
            voll[phase] = None
            continue
        try:
            voll[phase] = dateiangaben(lies_json(lauf, f"npm-dateien-{phase}.json"))
            for name, eintrag in (inventare[inventar_phase] or {}).items():
                if name not in voll[phase] or not gleicher_inhalt(eintrag, voll[phase][name]):
                    probleme.append(f"Vollständiges Dateimanifest {phase} stimmt nicht mit Inventarfund überein: {name}")
        except (OSError, ValueError) as fehler:
            voll[phase] = None
            probleme.append(f"Vollständiges Dateimanifest {phase} fehlt oder ist ungültig: {fehler}")
    vorher, nachher = voll["vor-scanner"], voll["nach-scanner"]
    if vorher is None or nachher is None:
        return {}, {phase: None if daten is None else len(daten) for phase, daten in voll.items()}
    entfernt = {name: eintrag for name, eintrag in vorher.items() if name not in nachher}
    if entfernt and variante != "gezielt-scandelete":
        probleme.append("Der Scanner hat reguläre npm-Dateien ohne scandelete entfernt.")
    elif entfernt:
        probleme.append(f"Zusätzliche Scanner-Entfernungen nach gezielter Bereinigung benötigen Einzelreview: {len(entfernt)} Dateien.")
    for name in set(vorher) & set(nachher):
        if not gleicher_inhalt(vorher[name], nachher[name]):
            probleme.append(f"Regulärer Dateiinhalt zwischen Bereinigung und Scanner verändert: {name}")
    for name in set(nachher) - set(vorher):
        probleme.append(f"Neue reguläre Datei nach dem Scanner: {name}")
    log_pfade = [eintrag["pfad"].removeprefix("node_modules/") for eintrag in protokoll_entfernt
                 if eintrag["pfad"].startswith("node_modules/")]
    if len(log_pfade) != len(set(log_pfade)):
        probleme.append("Das Protokoll meldet dieselbe npm-Datei mehrfach als durch Scanner entfernt.")
    for name in set(log_pfade) - set(entfernt):
        probleme.append(f"Scanner-Entfernung aus dem Protokoll nicht durch Dateimanifeste belegt: {name}")
    for name in set(entfernt) - set(log_pfade):
        probleme.append(f"Datei zwischen Scanner-Manifesten entfernt, ohne zugeordnete Protokollmeldung: {name}")
    return entfernt, {phase: len(daten) for phase, daten in voll.items()}


def auswerten(lauf):
    probleme = []
    meta = lies_json(lauf, "lauf.json")
    if (not isinstance(meta, dict) or meta.get("projekt") != "app" or meta.get("variante") not in VARIANTEN
            or meta.get("appId") != APPID or meta.get("versionName") != VERSION_NAME
            or meta.get("versionCode") != VERSION_CODE
            or not re.fullmatch(r"[0-9a-f]{40}", str(meta.get("commit")))
            or type(meta.get("scandeleteVersuch")) is not bool
            or meta["scandeleteVersuch"] != (meta["variante"] == "gezielt-scandelete")):
        raise ValueError("App-Laufangaben sind ungültig")
    rueckgabe = lies_json(lauf, "rueckgabe.json")
    if not isinstance(rueckgabe, dict) or type(rueckgabe.get("fdroidBuild")) is not int:
        raise ValueError("fdroidBuild muss ein ganzzahliger Rückgabewert sein")
    if rueckgabe["fdroidBuild"] != 0:
        probleme.append(f"fdroid build endete mit Rückgabewert {rueckgabe['fdroidBuild']}.")
    bekannt, scanner_entfernt, build_ergebnis = PROTOKOLL.pruefen(
        BUILD, lauf, APPID, VERSION_NAME, str(VERSION_CODE), meta["commit"], meta["variante"], probleme)
    scannerabbruch = build_ergebnis["scannerAbbruch"]
    inventare = inventare_laden(lauf, probleme, scannerabbruch)
    bereinigung, entfernt = bereinigung_laden(lauf, meta["variante"], inventare, probleme)
    vorher, nachher = inventare["nach-bereinigung"], inventare["nach-scanner"]
    if vorher is not None and nachher is not None:
        if meta["variante"] != "gezielt-scandelete" and set(vorher) - set(nachher):
            probleme.append("Der Scanner hat Inventarfunde ohne scandelete entfernt.")
        for name in set(vorher) & set(nachher):
            if not gleicher_inhalt(vorher[name], nachher[name]):
                probleme.append(f"Dateiinhalt zwischen Bereinigung und Scanner verändert: {name}")
        for name in set(nachher) - set(vorher):
            probleme.append(f"Neuer Inventarfund nach dem Scanner: {name}")
    scanner_dateien, scanner_manifeste = scanner_dateien_pruefen(
        lauf, inventare, scanner_entfernt, meta["variante"], probleme, scannerabbruch)
    apk, referenz, apk_pfade = None, None, {}
    apk_relativ = f"unsigned/{APPID}_{VERSION_CODE}.apk"
    vergleich = {"bytegleich": None if scannerabbruch else False, "referenzPinBestanden": False}
    try:
        referenz_meta = meta.get("referenzApk")
        if (not isinstance(referenz_meta, dict) or referenz_meta.get("pfad") != "referenz.apk"
                or referenz_meta.get("bytes") != REFERENZ_BYTES or referenz_meta.get("sha256") != REFERENZ_SHA256):
            raise ValueError("Referenzangaben weichen vom festgelegten APK-Nachweis ab")
        referenz_pfad = BUILD.pruefe_pfad(lauf, "referenz.apk")
        referenz = {"pfad": "referenz.apk", **hash_datei(referenz_pfad)}
        vergleich["referenzPinBestanden"] = (referenz["bytes"] == REFERENZ_BYTES
                                              and referenz["sha256"] == REFERENZ_SHA256)
        if not vergleich["referenzPinBestanden"]:
            probleme.append("Die Referenzdatei weicht in Größe oder SHA-256 vom festgelegten Nachweis ab.")
        if not scannerabbruch or (lauf / apk_relativ).exists():
            if scannerabbruch:
                probleme.append("APK vorhanden trotz protokolliertem Scannerabbruch; Herkunft ungeklärt.")
            apk_pfad = BUILD.pruefe_pfad(lauf, apk_relativ)
            apk = {"pfad": apk_relativ, **hash_datei(apk_pfad)}
            apk_pfade = apk_dateien(apk_pfad)
            vergleich["bytegleich"] = bytegleich(referenz_pfad, apk_pfad)
            if not vergleich["bytegleich"]:
                probleme.append("Die unsignierte APK ist nicht bytegleich zur Referenzdatei.")
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as fehler:
        probleme.append(f"APK-Vergleich nicht vollständig prüfbar: {fehler}")
    web = None
    try:
        web_meta = lies_json(lauf, "web-vor-bereinigung.json")
        if not isinstance(web_meta, dict) or web_meta.get("schemaVersion") != 1 or web_meta.get("zeitpunkt") != "nach-sync-vor-bereinigung":
            raise ValueError("Web-Nachweis nennt nicht den Stand nach Sync vor der Bereinigung")
        web_dateien = dateiangaben(web_meta.get("dateien"))
        if "index.html" not in web_dateien or not web_dateien["index.html"]["bytes"]:
            raise ValueError("index.html fehlt oder ist leer")
        if apk is not None or not scannerabbruch:
            web = web_vergleich(web_dateien, apk_pfade)
            if not web["bestanden"]:
                probleme.append("assets/public in der APK stimmt nicht exakt mit dem Web-Stand vor der Bereinigung überein.")
    except (OSError, ValueError) as fehler:
        probleme.append(f"Web-Nachweis fehlt oder ist ungültig: {fehler}")
    treffer = in_apk(entfernt, apk_pfade)
    scanner_treffer = in_apk(scanner_dateien, apk_pfade)
    belegt_leer, ungeklart = belege_leerdatei_gleichheiten(treffer, bereinigung, web)
    if ungeklart or scanner_treffer:
        probleme.append(f"Entfernte Dateiinhalte kommen ohne geklärten Herkunftsnachweis unverändert in der APK vor: {len(ungeklart)} gezielt, {len(scanner_treffer)} durch Scanner.")
    vergleich.update({"referenz": referenz, "apk": apk, "web": web,
                      "entfernteDateienInApk": treffer, "scannerDateienInApk": scanner_treffer,
                      "belegteLeerdateiGleichheiten": belegt_leer, "unbelegteEntfernteDateienInApk": ungeklart,
                      "apkInhalteGeprueft": apk is not None and bool(apk_pfade),
                      "entfernteDateienGeprueft": len(entfernt) if apk_pfade else 0,
                      "scannerDateienGeprueft": len(scanner_dateien) if apk_pfade else 0,
                      "entfernteDateienVerfuegbar": len(entfernt),
                      "scannerDateimanifeste": scanner_manifeste, "scannerEntfernteDateien": list(scanner_dateien.values()),
                      "inventare": {phase: None if daten is None else len(daten) for phase, daten in inventare.items()},
                      "dateien": matrix(inventare, apk_pfade), "apkDateien": list(apk_pfade.values()),
                      "grenze": "Inhaltsvergleich ganzer Dateien nach Größe und SHA-256; keine Aussage über umgeformte oder verschachtelte Inhalte. Gleiche leere Dateien oder kurze Standardtexte können unabhängig entstehen. Die Meldung einer Inhaltsgleichheit beweist keine Übernahme aus dem entfernten Paket; sie bleibt bis zur Einzelprüfung ein Befund."})
    ungeprueft = (["Inventar und Dateimanifest unmittelbar nach dem Scanner", "APK-Erzeugung und Bytevergleich", "Web-Inhalte in der APK", "Entfernte Dateiinhalte in der APK"] if scannerabbruch else [])
    return {"schemaVersion": 1, "projekt": "app", "variante": meta["variante"], "commit": meta["commit"],
            "buildErgebnis": build_ergebnis, "nichtGeprueft": ungeprueft,
            "rueckgabewertBuild": rueckgabe["fdroidBuild"], "bekannteMeldungen": bekannt,
            "scannerEntfernt": scanner_entfernt, "bereinigung": bereinigung,
            "vergleich": vergleich, "beanstandungen": probleme, "bestanden": not probleme}


def markdown(bericht):
    vergleich = bericht["vergleich"]
    def zelle(text):
        return str(text).replace("|", "&#124;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", " ")
    zeilen = ["# Vergleich des App-Laufs", "", f"Variante: `{bericht['variante']}`, Stand: `{bericht['commit']}`.", "",
              "`nach-lauf` belegt den Zustand nach dem Ende des Aufrufs; es ersetzt keinen Nachweis direkt nach dem Scanner.", "",
              "| Phase | Inventarfunde |", "|---|---:|"]
    zeilen += [f"| {phase} | {anzahl if anzahl is not None else 'nicht erfasst'} |" for phase, anzahl in vergleich["inventare"].items()]
    zeilen += ["", f"APK bytegleich zur Referenz: **{'nicht geprüft' if vergleich['bytegleich'] is None else 'ja' if vergleich['bytegleich'] else 'nein oder ungeprüft'}**.",
               f"Referenz entspricht dem festgelegten SHA-256 und der Größe: **{'ja' if vergleich['referenzPinBestanden'] else 'nein oder ungeprüft'}**.", "",
               (f"Inhaltsgleiche entfernte Dateien: {len(vergleich['entfernteDateienInApk'])}; davon unabhängig erzeugte Leerdatei-Gleichheiten mit Beleg: {len(vergleich['belegteLeerdateiGleichheiten'])}; ungeklärte Treffer: {len(vergleich['unbelegteEntfernteDateienInApk'])}." if vergleich["apkInhalteGeprueft"] else "Entfernte Dateiinhalte in der APK: nicht geprüft; kein APK-Inhaltsnachweis."), "",
               "Die vollständigen SHA-256-Werte, Web-Abweichungen und APK-Einträge stehen in `vergleich.json`.", "",
               "| Datei unter node_modules | " + " | ".join(PHASEN) + " | Inhaltsgleich in APK |",
               "|---|" + "---|" * (len(PHASEN) + 1)]
    for zeile in vergleich["dateien"]:
        werte = ["nicht erfasst" if wert is None else "fehlt" if wert is False else f"{wert['bytes']} B; {wert['sha256'][:12]}"
                 for wert in zeile["phasen"].values()]
        apk_namen = sorted({name for listen in zeile["apkInhaltsgleich"].values() for liste in listen for name in liste})
        apk_text = (", ".join(apk_namen) or "kein Fund") if vergleich["apkInhalteGeprueft"] else "nicht geprüft"
        zeilen.append("| " + " | ".join(map(zelle, [zeile["pfad"], *werte, apk_text])) + " |")
    zeilen += ["", vergleich["grenze"]]
    if vergleich["belegteLeerdateiGleichheiten"]:
        zeilen += ["", "## Geprüfte Herkunft der Leerdateien", "",
                   vergleich["belegteLeerdateiGleichheiten"][0]["grund"], "",
                   "Beleg: `@capacitor/cli@8.5.2`, `dist/cordova.js`, `createEmptyCordovaJS` und Aufruf aus `handleCordovaPluginsJS`; Projektprüfung `scripts/app-pruefungen.json: sync.leereDateien`, gelesen am 2026-09-30.", "",
                   "| Entfernte Leerdatei | Inhaltsgleiche, unabhängig erzeugte APK-Dateien |", "|---|---|"]
        zeilen += ["| " + zelle(eintrag["quelle"]) + " | " + zelle(", ".join(eintrag["apkPfade"])) + " |"
                   for eintrag in vergleich["belegteLeerdateiGleichheiten"]]
    zeilen += ["", "## Beanstandungen", ""]
    zeilen += [f"{nummer}. {zelle(problem)}" for nummer, problem in enumerate(bericht["beanstandungen"], 1)] or ["Keine."]
    if bericht.get("nichtGeprueft"):
        zeilen += ["", "Wegen Scannerabbruch nicht geprüft: " + "; ".join(bericht["nichtGeprueft"]) + "."]
    return "\n".join(zeilen) + "\n"


def laeufe_vergleichen(laeufe):
    """Stellt die drei bereits ausgewerteten Läufe ohne Neubewertung nebeneinander."""
    berichte = [lies_json(pfad, "auswertung.json") for pfad in laeufe]
    for variante, bericht in zip(VARIANTEN, berichte):
        if (not isinstance(bericht, dict) or bericht.get("schemaVersion") != 1
                or bericht.get("projekt") != "app" or bericht.get("variante") != variante
                or type(bericht.get("bestanden")) is not bool or not isinstance(bericht.get("vergleich"), dict)):
            raise ValueError("Läufe in der Reihenfolge ohne, gezielt, gezielt-scandelete mit App-Auswertung angeben")
    if len({bericht["commit"] for bericht in berichte}) != 1:
        raise ValueError("Die drei Läufe verwenden unterschiedliche Quellstände")
    varianten = {bericht["variante"]: {"lauf": str(pfad), "bestanden": bericht["bestanden"],
                 "buildErgebnis": bericht.get("buildErgebnis"), "nichtGeprueft": bericht.get("nichtGeprueft", []),
                 "rueckgabewertBuild": bericht["rueckgabewertBuild"], "beanstandungen": bericht["beanstandungen"],
                 **bericht["vergleich"]} for pfad, bericht in zip(laeufe, berichte)}
    zeilen = ["# Vergleich der drei App-Läufe", "", f"Stand: `{berichte[0]['commit']}`.", "",
              "| Nachweis | ohne | gezielt | gezielt-scandelete |", "|---|---|---|---|"]
    for phase in PHASEN:
        zellen = [str(v["inventare"][phase]) if v["inventare"][phase] is not None else "nicht erfasst" for v in varianten.values()]
        zeilen.append("| Inventar " + phase + " | " + " | ".join(zellen) + " |")
    for titel, feld in (("Build-Rückgabe", "rueckgabewertBuild"), ("APK bytegleich", "bytegleich"),
                        ("Referenz-Pin geprüft", "referenzPinBestanden"), ("Auswertung bestanden", "bestanden")):
        zeilen.append("| " + titel + " | " + " | ".join("nicht geprüft" if v[feld] is None else str(v[feld]) for v in varianten.values()) + " |")
    for titel, feld in (("Inhaltsgleiche entfernte Dateien", "entfernteDateienInApk"),
                        ("Belegte unabhängige Leerdateien", "belegteLeerdateiGleichheiten"),
                        ("Ungeklärte Inhaltsgleichheiten", "unbelegteEntfernteDateienInApk")):
        zeilen.append("| " + titel + " | " + " | ".join("nicht geprüft" if v.get("apkInhalteGeprueft") is False else str(len(v[feld])) if feld in v else "nicht erfasst" for v in varianten.values()) + " |")
    zeilen += ["", "Fehlende APKs oder Scanner-Nachweise bleiben fehlende Nachweise, auch wenn ein Scannerabbruch im Vergleichslauf erwartet wurde.",
               "Die Dateimatrizen und Beanstandungen aller Varianten stehen in der JSON-Datei."]
    return {"schemaVersion": 1, "commit": berichte[0]["commit"], "varianten": varianten,
            "bestanden": all(bericht["bestanden"] for bericht in berichte)}, "\n".join(zeilen) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    auswahl = parser.add_mutually_exclusive_group(required=True)
    auswahl.add_argument("--lauf", type=Path)
    auswahl.add_argument("--vergleich", nargs=3, type=Path, metavar=("OHNE", "GEZIELT", "SCANDELETE"))
    parser.add_argument("--ausgabe", type=Path, help="Neue JSON-Datei beim Vergleich; daneben entsteht eine Markdown-Datei")
    args = parser.parse_args(argv)
    if args.vergleich:
        if args.ausgabe is None or args.ausgabe.suffix != ".json":
            raise ValueError("Der Vergleich braucht --ausgabe mit einer neuen .json-Datei")
        textpfad = args.ausgabe.with_suffix(".md")
        for pfad in (args.ausgabe, textpfad):
            if pfad.exists() or pfad.is_symlink():
                raise ValueError(f"Bericht wird nicht überschrieben: {pfad}")
        bericht, text = laeufe_vergleichen(args.vergleich)
        with args.ausgabe.open("x", encoding="utf-8", newline="\n") as datei:
            json.dump(bericht, datei, ensure_ascii=False, indent=2)
            datei.write("\n")
        with textpfad.open("x", encoding="utf-8", newline="\n") as datei:
            datei.write(text)
        print("ERGEBNIS: drei Läufe verglichen; " + ("keine Beanstandung" if bericht["bestanden"] else "offene Befunde in mindestens einem Lauf"))
        return 0 if bericht["bestanden"] else 1
    if args.ausgabe is not None:
        raise ValueError("--ausgabe gilt nur für --vergleich")
    lauf = args.lauf.absolute()
    if BUILD.ist_verweis(lauf.lstat()) or not lauf.is_dir():
        raise ValueError("Der Laufordner ist kein regulärer Ordner")
    for name in ("auswertung.json", "vergleich.json", "vergleich.md"):
        if (lauf / name).exists() or (lauf / name).is_symlink():
            raise ValueError(f"Bericht wird nicht überschrieben: {name}")
    bericht = auswerten(lauf)
    for name, daten in (("auswertung.json", bericht), ("vergleich.json", bericht["vergleich"])):
        with (lauf / name).open("x", encoding="utf-8", newline="\n") as datei:
            json.dump(daten, datei, ensure_ascii=False, indent=2)
            datei.write("\n")
    with (lauf / "vergleich.md").open("x", encoding="utf-8", newline="\n") as datei:
        datei.write(markdown(bericht))
    for problem in bericht["beanstandungen"]:
        print(problem)
    print(f"ERGEBNIS: {len(bericht['beanstandungen'])} Beanstandungen" if bericht["beanstandungen"] else "ERGEBNIS: keine Beanstandung")
    return 0 if bericht["bestanden"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as fehler:
        print(f"App-Auswertung gescheitert: {fehler}", file=sys.stderr)
        sys.exit(1)
