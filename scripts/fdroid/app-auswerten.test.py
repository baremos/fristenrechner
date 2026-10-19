#!/usr/bin/env python3
"""Offline-Gegenproben der App-Auswertung mit ausdrücklich künstlichen APKs."""

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

sys.dont_write_bytecode = True
HIER = Path(__file__).resolve().parent
spezifikation = importlib.util.spec_from_file_location("app_auswertung", HIER / "app-auswerten.py")
A = importlib.util.module_from_spec(spezifikation)
spezifikation.loader.exec_module(A)


def record(pfad, inhalt, fund=False):
    wert = {"pfad": pfad, "bytes": len(inhalt), "sha256": hashlib.sha256(inhalt).hexdigest()}
    if fund:
        wert["arten"] = ["WASM"]
    return wert


class AppAuswertung(unittest.TestCase):
    def setUp(self):
        tmp = HIER.parents[1] / "scratchpad/paket-2.8-f5/tmp"
        tmp.mkdir(parents=True, exist_ok=True)
        self.ordner = tempfile.TemporaryDirectory(prefix="app-auswertung-", dir=tmp)
        self.addCleanup(self.ordner.cleanup)
        self.lauf = Path(self.ordner.name)
        (self.lauf / "unsigned").mkdir()
        self.apk = self.lauf / f"unsigned/{A.APPID}_{A.VERSION_CODE}.apk"
        self.zip(self.apk)
        shutil.copyfile(self.apk, self.lauf / "referenz.apk")
        referenz = A.hash_datei(self.apk)
        self.addCleanup(patch.stopall)
        # Nur die künstlichen Fixtures ersetzen den produktiven Referenz-Pin.
        patch.object(A, "REFERENZ_BYTES", referenz["bytes"]).start()
        patch.object(A, "REFERENZ_SHA256", referenz["sha256"]).start()
        self.meta = {"projekt": "app", "variante": "gezielt", "appId": A.APPID,
                     "versionName": A.VERSION_NAME, "versionCode": A.VERSION_CODE,
                     "commit": "a" * 40, "scandeleteVersuch": False,
                     "referenzApk": {"pfad": "referenz.apk", **referenz}}
        self.json("lauf.json", self.meta)
        self.json("rueckgabe.json", {"fdroidBuild": 0})
        self.fund = record("tool/tool.wasm", b"\0asm-before", True)
        self.report = {"schemaVersion": 1, "entferntPakete": [{"paket": "tool", "pfad": "tool"}],
                       "behalten": ["node_modules/@capacitor/android/capacitor"],
                       "entfernteDateien": [{k: v for k, v in self.fund.items() if k != "arten"}],
                       "vorher": [self.fund], "nachher": [], "zugelassen": []}
        self.json("bereinigung.json", self.report)
        for phase in A.PHASEN[:-1]:
            self.json(f"npm-vorgebaut-{phase}.json", [self.fund] if phase in ("vor-web", "nach-web") else [])
        self.json("npm-dateien-vor-scanner.json", [])
        self.json("npm-dateien-nach-scanner.json", [])
        self.json("web-vor-bereinigung.json", {"schemaVersion": 1, "zeitpunkt": "nach-sync-vor-bereinigung",
                                              "dateien": [record("index.html", b"<html>gebaut</html>")]})
        meldungen = [f"Building version {A.VERSION_NAME} ({A.VERSION_CODE}) of {A.APPID}",
                     "Scanning source for common problems...",
                     f"Successfully built version {A.VERSION_NAME} of {A.APPID} from {'a' * 40}",
                     f"success: {A.APPID}", "Finished", "1 build succeeded"]
        self.log = "".join(f"2026-09-30 20:00:{nr:02d},000 INFO: {text}\n" for nr, text in enumerate(meldungen))
        (self.lauf / "build.log").write_text(self.log, encoding="utf-8")

    def json(self, name, wert):
        (self.lauf / name).write_text(json.dumps(wert), encoding="utf-8")

    def zip(self, pfad, extra=None):
        with zipfile.ZipFile(pfad, "w") as archiv:
            archiv.writestr("AndroidManifest.xml", b"manifest")
            archiv.writestr("classes.dex", b"dex")
            archiv.writestr("assets/public/index.html", b"<html>gebaut</html>")
            for name, inhalt in (extra or {}).items():
                archiv.writestr(name, inhalt)

    def auswertung(self):
        return A.auswerten(self.lauf)

    def befund(self, muster):
        ergebnis = self.auswertung()
        self.assertFalse(ergebnis["bestanden"])
        self.assertRegex("\n".join(ergebnis["beanstandungen"]), muster)
        return ergebnis

    def leerdatei_beleg(self):
        self.report["entferntPakete"].extend([
            {"paket": "node-fetch-native", "version": "1.6.7"},
            {"paket": "@capacitor/cli", "version": "8.5.2"},
        ])
        self.report["entfernteDateien"].extend(record(name, b"") for name in sorted(A.BELEGTE_LEERQUELLEN))
        self.json("bereinigung.json", self.report)
        self.zip(self.apk, {name: b"" for name in sorted(A.BELEGTE_LEERZIELE)})
        shutil.copyfile(self.apk, self.lauf / "referenz.apk")
        referenz = A.hash_datei(self.apk)
        patch.object(A, "REFERENZ_BYTES", referenz["bytes"]).start()
        patch.object(A, "REFERENZ_SHA256", referenz["sha256"]).start()
        self.meta["referenzApk"] = {"pfad": "referenz.apk", **referenz}
        self.json("lauf.json", self.meta)
        self.json("web-vor-bereinigung.json", {"schemaVersion": 1, "zeitpunkt": "nach-sync-vor-bereinigung",
                                              "dateien": [record("index.html", b"<html>gebaut</html>"),
                                                          record("cordova.js", b""), record("cordova_plugins.js", b"")]})
        return A.in_apk(A.dateiangaben(self.report["entfernteDateien"]), A.apk_dateien(self.apk))

    def test_vollstaendige_kuenstliche_nachweise(self):
        ergebnis = self.auswertung()
        self.assertTrue(ergebnis["bestanden"], ergebnis["beanstandungen"])
        self.assertTrue(ergebnis["vergleich"]["bytegleich"])
        self.assertTrue(ergebnis["vergleich"]["web"]["bestanden"])
        self.assertEqual(ergebnis["vergleich"]["entfernteDateienGeprueft"], 1)
        self.assertIn("nach-lauf", A.markdown(ergebnis))

    def test_abweichende_apk(self):
        self.zip(self.apk, {"anderes.txt": b"neu"})
        self.befund("nicht bytegleich")

    def test_pinnachweis_unabhaengig_von_bytegleichheit(self):
        self.zip(self.apk, {"anderes.txt": b"neu"})
        shutil.copyfile(self.apk, self.lauf / "referenz.apk")
        ergebnis = self.befund("Referenzdatei weicht")
        self.assertTrue(ergebnis["vergleich"]["bytegleich"])
        self.assertFalse(ergebnis["vergleich"]["referenzPinBestanden"])

    def test_referenz_fehlt(self):
        (self.lauf / "referenz.apk").unlink()
        self.befund("APK-Vergleich nicht vollständig")

    def test_web_stand_abweichend(self):
        self.json("web-vor-bereinigung.json", {"schemaVersion": 1, "zeitpunkt": "nach-sync-vor-bereinigung",
                                              "dateien": [record("index.html", b"anders")]})
        self.befund("assets/public.*nicht exakt")

    def test_web_zusaetzlicher_apk_eintrag(self):
        self.zip(self.apk, {"assets/public/extra.js": b"neu"})
        ergebnis = self.befund("assets/public.*nicht exakt")
        self.assertEqual(ergebnis["vergleich"]["web"]["zusaetzlich"], ["extra.js"])

    def test_web_manifest_falsche_phase(self):
        self.json("web-vor-bereinigung.json", {"schemaVersion": 1, "zeitpunkt": "nach-bereinigung", "dateien": []})
        self.befund("Web-Nachweis nennt nicht")

    def test_entfernter_inhalt_in_apk(self):
        self.zip(self.apk, {"assets/prebuilt.wasm": b"\0asm-before"})
        ergebnis = self.befund("Entfernte Dateiinhalte")
        self.assertEqual(ergebnis["vergleich"]["entfernteDateienInApk"][0]["apkPfade"], ["assets/prebuilt.wasm"])

    def test_auch_leere_entfernte_datei_bleibt_befund(self):
        self.report["entfernteDateien"].append(record("tool/leer", b""))
        self.json("bereinigung.json", self.report)
        self.zip(self.apk, {"assets/leer": b""})
        self.befund("Entfernte Dateiinhalte")

    def test_belegte_unabhaengige_leerdateien_bleiben_sichtbar(self):
        self.leerdatei_beleg()
        ergebnis = self.auswertung()
        self.assertTrue(ergebnis["bestanden"], ergebnis["beanstandungen"])
        vergleich = ergebnis["vergleich"]
        self.assertEqual(len(vergleich["entfernteDateienInApk"]), 2)
        self.assertEqual(len(vergleich["belegteLeerdateiGleichheiten"]), 2)
        self.assertEqual(vergleich["unbelegteEntfernteDateienInApk"], [])
        self.assertIn("Geprüfte Herkunft der Leerdateien", A.markdown(ergebnis))

    def test_leerbeleg_nur_exakte_quell_und_apk_pfade(self):
        treffer = self.leerdatei_beleg()
        for feld, wert in (("quelle", "anderes/lib/empty.cjs"),
                           ("quelle", "node-fetch-native/lib/empty.cjs.extra"),
                           ("apkPfade", ["assets/public/anderes.js", "assets/public/cordova_plugins.js"]),
                           ("apkPfade", ["assets/public/cordova.js"]),
                           ("apkPfade", [*sorted(A.BELEGTE_LEERZIELE), "assets/anderes-leer"])):
            with self.subTest(feld=feld, wert=wert):
                andere = copy.deepcopy(treffer)
                andere[0][feld] = wert
                belegt, offen = A.belege_leerdatei_gleichheiten(andere, self.report, {"bestanden": True})
                self.assertEqual(belegt, [])
                self.assertEqual(offen, andere)

    def test_leerbeleg_braucht_beide_geprueften_paketversionen(self):
        treffer = self.leerdatei_beleg()
        for paket in ("node-fetch-native", "@capacitor/cli"):
            for art in ("version", "fehlend", "doppelt"):
                with self.subTest(paket=paket, art=art):
                    bericht = copy.deepcopy(self.report)
                    eintrag = next(p for p in bericht["entferntPakete"] if p["paket"] == paket)
                    if art == "version":
                        eintrag["version"] = "999.0.0"
                    elif art == "fehlend":
                        bericht["entferntPakete"].remove(eintrag)
                    else:
                        bericht["entferntPakete"].append(dict(eintrag))
                    belegt, offen = A.belege_leerdatei_gleichheiten(treffer, bericht, {"bestanden": True})
                    self.assertEqual(belegt, [])
                    self.assertEqual(offen, treffer)

    def test_leerbeleg_nur_null_bytes_und_leerer_hash(self):
        treffer = self.leerdatei_beleg()
        for feld, wert in (("bytes", 1), ("bytes", False), ("sha256", hashlib.sha256(b"nicht leer").hexdigest())):
            with self.subTest(feld=feld):
                andere = copy.deepcopy(treffer)
                andere[0][feld] = wert
                belegt, offen = A.belege_leerdatei_gleichheiten(andere, self.report, {"bestanden": True})
                self.assertEqual(belegt, [])
                self.assertEqual(offen, andere)

    def test_leerbeleg_braucht_bestandenes_webmanifest(self):
        treffer = self.leerdatei_beleg()
        for web in (None, {}, {"bestanden": False}, {"bestanden": 1}):
            with self.subTest(web=web):
                belegt, offen = A.belege_leerdatei_gleichheiten(treffer, self.report, web)
                self.assertEqual(belegt, [])
                self.assertEqual(offen, treffer)
        self.json("web-vor-bereinigung.json", {"schemaVersion": 1, "zeitpunkt": "nach-sync-vor-bereinigung",
                                              "dateien": [record("index.html", b"anders")]})
        ergebnis = self.befund("Entfernte Dateiinhalte")
        self.assertEqual(ergebnis["vergleich"]["belegteLeerdateiGleichheiten"], [])

    def test_weitere_leerdatei_neben_beleg_bleibt_befund(self):
        self.leerdatei_beleg()
        self.report["entfernteDateien"].append(record("anderes/leer.js", b""))
        self.json("bereinigung.json", self.report)
        ergebnis = self.befund("Entfernte Dateiinhalte.*1 gezielt")
        self.assertEqual(len(ergebnis["vergleich"]["belegteLeerdateiGleichheiten"]), 2)
        self.assertEqual(ergebnis["vergleich"]["unbelegteEntfernteDateienInApk"][0]["quelle"], "anderes/leer.js")

    def test_scanner_leerdatei_erhaelt_keinen_herkunftsbeleg(self):
        self.leerdatei_beleg()
        self.meta.update(variante="gezielt-scandelete", scandeleteVersuch=True)
        self.json("lauf.json", self.meta)
        self.json("npm-dateien-vor-scanner.json", [record("anderes/leer.js", b"")])
        ergebnis = self.befund("Entfernte Dateiinhalte.*1 durch Scanner")
        self.assertEqual(len(ergebnis["vergleich"]["belegteLeerdateiGleichheiten"]), 2)
        self.assertEqual(len(ergebnis["vergleich"]["scannerDateienInApk"]), 1)

    def test_nach_lauf_ist_keine_scanner_phase(self):
        (self.lauf / "npm-vorgebaut-nach-scanner.json").unlink()
        self.json("npm-vorgebaut-nach-lauf.json", [])
        ergebnis = self.befund("Inventar nach-scanner fehlt")
        self.assertIsNone(ergebnis["vergleich"]["inventare"]["nach-scanner"])
        self.assertEqual(ergebnis["vergleich"]["inventare"]["nach-lauf"], 0)

    def test_scannerabbruch_bleibt_befund(self):
        self.json("rueckgabe.json", {"fdroidBuild": 1})
        self.apk.unlink()
        self.befund("Rückgabewert 1")

    def test_entfernter_inventarfund_fehlt_im_bericht(self):
        self.report["entfernteDateien"] = [record("tool/andere.wasm", b"anderes")]
        self.json("bereinigung.json", self.report)
        self.befund("Inventarfund fehlt")

    def test_quelle_in_entfernten_dateien(self):
        self.report["entfernteDateien"].append(record("@capacitor/android/capacitor/Bridge.java", b"Quelle"))
        self.json("bereinigung.json", self.report)
        self.befund("Zu behaltende Quelle")

    def test_widerspruechliche_inventare(self):
        self.json("npm-vorgebaut-nach-web.json", [])
        self.befund("stimmt nicht mit Inventar nach-web")

    def test_restdatei_ohne_zulassung(self):
        self.report["nachher"] = [record("other/file.wasm", b"\0asm-rest", True)]
        self.json("bereinigung.json", self.report)
        self.json("npm-vorgebaut-nach-bereinigung.json", self.report["nachher"])
        self.json("npm-vorgebaut-nach-scanner.json", self.report["nachher"])
        self.befund("Restdatei.*ohne genaue Zulassung")

    def test_vollstaendiges_scanner_manifest_fehlt(self):
        (self.lauf / "npm-dateien-nach-scanner.json").unlink()
        self.befund("Vollständiges Dateimanifest nach-scanner fehlt")

    def test_scanner_entfernt_normale_js_datei(self):
        self.meta.update(variante="gezielt-scandelete", scandeleteVersuch=True)
        self.json("lauf.json", self.meta)
        self.json("npm-dateien-vor-scanner.json", [record("other/normal.js", b"export default 1;")])
        self.zip(self.apk, {"assets/normal.js": b"export default 1;"})
        ergebnis = self.befund("Entfernte Dateiinhalte.*1 durch Scanner")
        self.assertEqual(ergebnis["vergleich"]["scannerDateienGeprueft"], 1)
        self.assertTrue(any("ohne zugeordnete Protokollmeldung" in p for p in ergebnis["beanstandungen"]))

    def test_scanner_protokoll_entfernung_braucht_dateinachweis(self):
        probleme = []
        A.scanner_dateien_pruefen(self.lauf, {"nach-bereinigung": {}, "nach-scanner": {}},
                                  [{"pfad": "node_modules/anderes/file"}], "gezielt-scandelete", probleme)
        self.assertRegex("\n".join(probleme), "nicht durch Dateimanifeste belegt")

    def test_auch_belegte_scanner_entfernung_braucht_review(self):
        self.json("npm-dateien-vor-scanner.json", [record("other/normal.js", b"export default 1;")])
        probleme = []
        entfernt, zahlen = A.scanner_dateien_pruefen(
            self.lauf, {"nach-bereinigung": {}, "nach-scanner": {}},
            [{"pfad": "node_modules/other/normal.js"}], "gezielt-scandelete", probleme)
        self.assertEqual(len(entfernt), 1)
        self.assertEqual(zahlen, {"vor-scanner": 1, "nach-scanner": 0})
        self.assertEqual(len(probleme), 1)
        self.assertIn("benötigen Einzelreview", probleme[0])

    def test_ohne_bereinigung_keinen_bericht_erfinden(self):
        self.meta["variante"] = "ohne"
        self.json("lauf.json", self.meta)
        (self.lauf / "bereinigung.json").unlink()
        for phase in ("nach-bereinigung", "nach-scanner"):
            self.json(f"npm-vorgebaut-{phase}.json", [self.fund])
        for phase in ("vor-scanner", "nach-scanner"):
            self.json(f"npm-dateien-{phase}.json", [{k: v for k, v in self.fund.items() if k != "arten"}])
        ergebnis = self.auswertung()
        self.assertTrue(ergebnis["bestanden"], ergebnis["beanstandungen"])

    def test_ohne_bereinigung_veraenderung_beanstanden(self):
        self.meta["variante"] = "ohne"
        self.json("lauf.json", self.meta)
        (self.lauf / "bereinigung.json").unlink()
        self.befund("Inventare ändern sich")

    def test_doppelte_inventardatei(self):
        self.json("npm-vorgebaut-vor-web.json", [self.fund, self.fund])
        self.befund("Doppelter Dateipfad")

    def test_unbekannte_protokollzeile_bleibt_befund(self):
        (self.lauf / "build.log").write_text("Neue App-Ausgabe\n" + self.log, encoding="utf-8")
        self.befund("Zeile ohne Kopf: Neue App-Ausgabe")

    def app_fixture(self, variante="gezielt"):
        # Die echten Protokolle gehören zu der Fassung, die die Prüfdaten selbst nennen;
        # sie bleiben gültig, wenn app-referenz.json eine neuere Fassung trägt.
        datei = json.loads((HIER / "fixtures/app-laeufe-2026-09-30.json").read_text(encoding="utf-8"))
        self.fassung = (datei["fassung"]["versionName"], datei["fassung"]["versionCode"])
        daten = datei["laeufe"]
        name = {"ohne": "lauf-bms4awvc-ohne", "gezielt": "lauf-hqj89xdz-gezielt",
                "gezielt-scandelete": "lauf-zhqctq16-gezielt-scandelete"}[variante]
        zeilen = [""] * max(e["zeile"] for e in daten[name])
        for eintrag in daten[name]:
            zeilen[eintrag["zeile"] - 1] = eintrag["text"]
        return "\n".join(zeilen) + "\n"

    def protokoll(self, log, variante="gezielt"):
        (self.lauf / "build.log").write_text(log, encoding="utf-8")
        probleme = []
        version_name, version_code = getattr(self, "fassung", (A.VERSION_NAME, A.VERSION_CODE))
        bekannt, entfernt, ergebnis = A.PROTOKOLL.pruefen(
            A.BUILD, self.lauf, A.APPID, version_name, str(version_code),
            "5c43ced5d2dfff021fab14d451415bd9181b3114", variante, probleme)
        return probleme, bekannt, entfernt, ergebnis

    def test_drei_bereinigte_echte_protokolle(self):
        for variante, anzahl, art in (("ohne", 1, "scanner_binaerfunde"), ("gezielt", 0, "build_erfolg"),
                                     ("gezielt-scandelete", 1, "scandelete_ungenutzt")):
            with self.subTest(variante=variante):
                probleme, _, entfernt, ergebnis = self.protokoll(self.app_fixture(variante), variante)
                self.assertEqual(len(probleme), anzahl, probleme)
                self.assertEqual(ergebnis["art"], art)
                self.assertEqual(len(entfernt), 1)
                self.assertTrue(entfernt[0]["erwartet"])

    def test_jedes_muster_hat_passende_originalzeilen(self):
        daten = {}
        for pfad in sorted((HIER / "fixtures").glob("app-laeufe-*.json")):
            daten.update(json.loads(pfad.read_text(encoding="utf-8"))["laeufe"])
        nach_nummer = {name: {e["zeile"]: e["text"] for e in zeilen} for name, zeilen in daten.items()}
        for eintrag, regex in A.PROTOKOLL.muster_laden(A.BUILD):
            with self.subTest(art=eintrag["art"]):
                self.assertTrue(eintrag["belege"])
                for beleg in eintrag["belege"]:
                    for nr in beleg["zeilen"]:
                        text = nach_nummer[beleg["lauf"]][nr]
                        if eintrag["art"] == "scanner_app_wrapper":
                            text = A.BUILD.KOPF.fullmatch(text)[2]
                        self.assertIsNotNone(regex.fullmatch(A.BUILD.ANSI_SGR.sub("", text)), (beleg, nr))

    def test_app_fixtures_ohne_rechnerpfade(self):
        for pfad in sorted((HIER / "fixtures").glob("app-laeufe-*.json")):
            with self.subTest(datei=pfad.name):
                text = pfad.read_text(encoding="utf-8")
                self.assertNotIn("/home/", text)
                self.assertNotRegex(text, r"[A-Za-z]:\\\\")

    def test_neue_prebuild_zeilen_bleiben_eng_begrenzt(self):
        daten = json.loads((HIER / "fixtures/app-laeufe-2026-10-15.json").read_text(encoding="utf-8"))["laeufe"]
        zeilen = {e["zeile"]: e["text"] for e in daten["lauf-4zdiuc_3-gezielt"]}
        log = self.app_fixture().replace("> @baremos/fristenrechner-kern@0.0.0 build", zeilen[48])
        log = log.replace(zeilen[78], zeilen[78] + "\n" + zeilen[79])
        probleme, bekannt, *_ = self.protokoll(log)
        self.assertEqual(probleme, [])
        for art, zeile in (("npm_kern_build", zeilen[48]), ("hinweise_dritter_bestanden", zeilen[79])):
            with self.subTest(art=art):
                self.assertEqual(sum(e["art"] == art for e in bekannt), 1)
                doppelt, *_ = self.protokoll(log.replace(zeile, zeile + "\n" + zeile))
                self.assertEqual(len(doppelt), 1, doppelt)
                self.assertIn(f"Bekannte Meldung {art}: 2 Vorkommen", doppelt[0])
                falscher_kontext, *_ = self.protokoll(log.replace(zeile + "\n", "").replace(
                    "BUILD SUCCESSFUL in 1m 52s", "BUILD SUCCESSFUL in 1m 52s\n" + zeile))
                self.assertEqual(len(falscher_kontext), 1, falscher_kontext)
                self.assertIn("Zeile ohne Kopf", falscher_kontext[0])
        for original, ersatz in (
            *((zeilen[48], zeilen[48].replace("0.1.0", version))
              for version in ("0.0.1", "0.2.0", "1.1.0", "0.1.0-beta", "0x1x0")),
            (zeilen[48], zeilen[48] + " Zusatz"),
            (zeilen[79], zeilen[79] + " Zusatz"),
            (zeilen[79], "Hinweise Dritter: nicht bestanden"),
        ):
            with self.subTest(ersatz=ersatz):
                probleme, *_ = self.protokoll(log.replace(original, ersatz))
                self.assertEqual(len(probleme), 1, probleme)
                self.assertIn("Zeile ohne Kopf", probleme[0])

    def test_unbekannte_folgezeile_in_jedem_kontext(self):
        log = self.app_fixture()
        for marker in ("== Seite der App bauen", "K4 Gradle: bestanden",
                       "Android-Quellen nach dem Scanner vorhanden: node_modules/@capacitor/android/capacitor",
                       "BUILD SUCCESSFUL in 1m 52s"):
            with self.subTest(marker=marker):
                probleme, *_ = self.protokoll(log.replace(marker, marker + "\nunerwartete zusätzliche Ausgabe", 1))
                self.assertEqual(len(probleme), 1, probleme)
                self.assertIn("Zeile ohne Kopf: unerwartete", probleme[0])

    def test_bekannte_zeile_mit_zusatz_bleibt_unbekannt(self):
        # Ein einzelnes CR direkt vor dem Zeilenende ginge in der Normalisierung von CRLF auf; deshalb CR mit Rest.
        for zusatz in (" neue Meldung", "\x1b[2J", "\x00", "\r ", "\u2028"):
            with self.subTest(zusatz=repr(zusatz)):
                probleme, *_ = self.protokoll(self.app_fixture().replace("K4 Gradle: bestanden", "K4 Gradle: bestanden" + zusatz))
                self.assertTrue(any("Zeile ohne Kopf" in p for p in probleme), probleme)

    def test_falscher_shell_kontext_schaltet_nichts_frei(self):
        log = self.app_fixture().replace(A.PROTOKOLL.PREBUILD, A.PROTOKOLL.PREBUILD + "true; ", 1)
        probleme, *_ = self.protokoll(log)
        self.assertTrue(any("Zeile ohne Kopf: + cd" in p for p in probleme), probleme)

    def test_zusaetzlicher_unbekannter_gradle_task(self):
        probleme, *_ = self.protokoll(self.app_fixture().replace("> Task :app:assembleRelease", "> Task :app:unbekannteAufgabe"))
        self.assertEqual(len(probleme), 1, probleme)
        self.assertIn("unbekannteAufgabe", probleme[0])

    def test_wrapper_ausnahme_nur_genauer_app_pfad(self):
        for pfad in ("android/gradle/wrapper/gradle-wrapper.jar", "app/android/gradle/wrapper/anderes.jar",
                     "app/android/gradle/../wrapper/gradle-wrapper.jar", "node_modules/anderes/gradle-wrapper.jar"):
            with self.subTest(pfad=pfad):
                probleme, *_ = self.protokoll(self.app_fixture().replace(A.PROTOKOLL.WRAPPER, pfad))
                self.assertTrue(any("Scanner-Entfernung" in p for p in probleme), probleme)

    def test_zweite_scanner_entfernung_ausserhalb_wrapper(self):
        log = self.app_fixture().replace("2026-09-30 18:52:35,098 INFO: Creating source tarball...",
            "2026-09-30 18:52:35,097 INFO: Removing binary at app/android/anderes.bin\n2026-09-30 18:52:35,098 INFO: Creating source tarball...")
        probleme, *_ = self.protokoll(log)
        self.assertEqual(len(probleme), 1, probleme)
        self.assertIn("Unerwartete Scanner-Entfernung", probleme[0])

    def test_wrapper_doppelt_bleibt_befund(self):
        zeile = "2026-09-30 18:52:35,095 INFO: Removing gradle-wrapper.jar at " + A.PROTOKOLL.WRAPPER
        probleme, *_ = self.protokoll(self.app_fixture().replace(zeile, zeile + "\n" + zeile))
        self.assertEqual(len(probleme), 1, probleme)
        self.assertIn("Scanner-Entfernung", probleme[0])

    def test_wrapper_ausserhalb_scanner_bleibt_befund(self):
        zeile = "2026-09-30 18:52:35,095 INFO: Removing gradle-wrapper.jar at " + A.PROTOKOLL.WRAPPER
        log = self.app_fixture().replace(zeile, "").replace("2026-09-30 18:52:34,628 INFO: Scanning source for common problems...", zeile + "\n2026-09-30 18:52:34,628 INFO: Scanning source for common problems...")
        probleme, *_ = self.protokoll(log)
        self.assertEqual(len(probleme), 1, probleme)

    def test_error_im_erfolgreichen_scanner_bleibt_befund(self):
        log = self.app_fixture().replace("2026-09-30 18:52:35,098 INFO: Creating source tarball...",
            "2026-09-30 18:52:35,097 ERROR: neuer Scannerfehler\n2026-09-30 18:52:35,098 INFO: Creating source tarball...")
        probleme, *_ = self.protokoll(log)
        self.assertEqual(len(probleme), 1, probleme)
        self.assertIn("ERROR: neuer Scannerfehler", probleme[0])

    def test_abbruchzahl_muss_zu_einzelfehlern_passen(self):
        log = self.app_fixture("gezielt-scandelete").replace("due to 1 error while scanning", "due to 2 errors while scanning")
        probleme, *_ = self.protokoll(log, "gezielt-scandelete")
        self.assertTrue(any("Zahl der einzeln belegten" in p for p in probleme), probleme)

    def test_unused_scandelete_ohne_variante_bleibt_error(self):
        probleme, *_ = self.protokoll(self.app_fixture("gezielt-scandelete"), "gezielt")
        self.assertTrue(any("ERROR: Unused scandelete path" in p for p in probleme), probleme)

    def mit_fassung(self, version_name, version_code):
        # Lässt die Gesamtauswertung gegen die Fassung der Prüfdaten laufen statt gegen
        # die aktuelle Referenz; patch.stopall in setUp nimmt die Ersetzung zurück.
        patch.object(A, "VERSION_NAME", version_name).start()
        patch.object(A, "VERSION_CODE", version_code).start()
        self.meta.update(versionName=version_name, versionCode=version_code)
        self.json("lauf.json", self.meta)

    def test_scannerabbruch_hat_eigenen_befund_ohne_folgefehler(self):
        log = self.app_fixture("gezielt-scandelete")
        self.mit_fassung(*self.fassung)
        self.meta.update(variante="gezielt-scandelete", scandeleteVersuch=True, commit="5c43ced5d2dfff021fab14d451415bd9181b3114")
        self.json("lauf.json", self.meta)
        (self.lauf / "build.log").write_text(log, encoding="utf-8")
        for name in ("npm-vorgebaut-nach-scanner.json", "npm-dateien-nach-scanner.json"):
            (self.lauf / name).unlink()
        self.apk.unlink()
        bericht = self.auswertung()
        self.assertEqual(len(bericht["beanstandungen"]), 1, bericht["beanstandungen"])
        self.assertEqual(bericht["buildErgebnis"]["art"], "scandelete_ungenutzt")
        self.assertIsNone(bericht["vergleich"]["web"])
        self.assertIsNone(bericht["vergleich"]["apk"])
        self.assertTrue(bericht["nichtGeprueft"])

    def test_scannerabbruch_mit_apk_ist_widerspruechlich(self):
        self.meta.update(variante="gezielt-scandelete", scandeleteVersuch=True, commit="5c43ced5d2dfff021fab14d451415bd9181b3114")
        self.json("lauf.json", self.meta)
        (self.lauf / "build.log").write_text(self.app_fixture("gezielt-scandelete"), encoding="utf-8")
        self.befund("APK vorhanden trotz protokolliertem Scannerabbruch")

    def test_doppelte_zip_eintraege(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.apk, "a") as archiv:
                archiv.writestr("classes.dex", b"zweites dex")
        self.befund("Doppelter ZIP-Eintrag")

    def test_zip_traversal(self):
        self.zip(self.apk, {"../anderer": b"x"})
        self.befund("Ungültiger relativer Pfad")

    def test_zip_verweis(self):
        with zipfile.ZipFile(self.apk, "a") as archiv:
            info = zipfile.ZipInfo("link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archiv.writestr(info, "ziel")
        self.befund("Unzulässiger ZIP-Dateityp")

    def test_zip_defekte_crc(self):
        daten = self.apk.read_bytes()
        self.apk.write_bytes(daten.replace(b"<html>gebaut</html>", b"<html>defekt</html>", 1))
        self.befund("CRC")

    def test_pfadformen(self):
        for name in ("../a", "/a", "a//b", "C:/a", "a\\b", "a\n", "a/./b"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                A.relativ(name)

    def test_berichte_werden_nicht_ueberschrieben(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(A.main(["--lauf", str(self.lauf)]), 0)
        self.assertTrue((self.lauf / "vergleich.md").is_file())
        with self.assertRaisesRegex(ValueError, "nicht überschrieben"):
            A.main(["--lauf", str(self.lauf)])

    def test_vergleich_dreier_laeufe(self):
        pfade = []
        for variante in A.VARIANTEN:
            pfad = self.lauf / variante
            pfad.mkdir()
            bericht = self.auswertung()
            bericht["variante"] = variante
            if variante == "ohne":
                bericht["bestanden"] = False
                bericht["vergleich"]["apk"] = None
                bericht["vergleich"]["bytegleich"] = False
                bericht["beanstandungen"] = ["APK fehlt"]
            (pfad / "auswertung.json").write_text(json.dumps(bericht), encoding="utf-8")
            pfade.append(pfad)
        vergleich, text = A.laeufe_vergleichen(pfade)
        self.assertFalse(vergleich["bestanden"])
        self.assertIsNone(vergleich["varianten"]["ohne"]["apk"])
        self.assertIn("nicht erfasst", text)
        with self.assertRaisesRegex(ValueError, "Reihenfolge"):
            A.laeufe_vergleichen(list(reversed(pfade)))
        bericht["commit"] = "b" * 40
        (pfade[-1] / "auswertung.json").write_text(json.dumps(bericht), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unterschiedliche Quellstände"):
            A.laeufe_vergleichen(pfade)


if __name__ == "__main__":
    unittest.main()
