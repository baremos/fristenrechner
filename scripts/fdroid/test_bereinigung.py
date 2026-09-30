#!/usr/bin/env python3
"""Offline-Gegenproben der Löschgrenzen, Paketliste und WASM-Heuristik."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HIER = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bereinigung_test", HIER / "npm-bereinigen.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
i = b.inventur


class Bereinigung(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="bereinigung-", dir=os.environ.get("TMP"))
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.nm = self.root / "node_modules"
        self.tool = self.nm / "werkzeug"
        self.tool.mkdir(parents=True)
        (self.tool / "package.json").write_text(json.dumps({"name": "werkzeug", "version": "1"}), encoding="utf-8")
        (self.tool / "bin.node").write_bytes(b"\x7fELFprobe")
        self.keep = self.nm / "@capacitor" / "android" / "capacitor"
        self.keep.mkdir(parents=True)
        (self.keep / "Bridge.java").write_text("class Bridge {}", encoding="utf-8")
        self.entry = {"paket": "werkzeug", "version": "1", "lizenz": "MIT", "grund": "Nur für den abgeschlossenen Web-Build.", "rolle": "Web-Build"}
        self.data = {"schemaVersion": 1, "pakete": [self.entry], "zulassen": []}
        self.lock = {"packages": {"node_modules/werkzeug": {"version": "1", "license": "MIT"}}}
        self.list = self.root / "liste.json"
        self.system = patch.object(b, "plattform", return_value={"os": "win32", "cpu": "x64", "libc": None})
        self.system.start()
        self.addCleanup(self.system.stop)
        self.node = patch.object(b.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "node_modules/@capacitor/android/capacitor\n", ""))
        self.node.start()
        self.addCleanup(self.node.stop)

    def run_cleanup(self):
        self.list.write_text(json.dumps(self.data), encoding="utf-8")
        (self.root / "package-lock.json").write_text(json.dumps(self.lock), encoding="utf-8")
        return b.bereinigen(self.root, self.list)

    def reject(self, phrase):
        with self.assertRaisesRegex(ValueError, phrase):
            self.run_cleanup()
        self.assertTrue((self.keep / "Bridge.java").is_file())
        self.assertTrue(self.tool.is_dir(), "Vorprüfung muss vor dem Löschen abbrechen")

    def test_entfernt_alle_dateien_und_behaelt_quellen(self):
        report = self.run_cleanup()
        self.assertFalse(self.tool.exists())
        self.assertTrue(self.keep.exists())
        self.assertEqual(report["nachher"], [])
        self.assertEqual(len(report["vorher"]), 1)
        self.assertEqual({f["pfad"] for f in report["entfernteDateien"]}, {"werkzeug/bin.node", "werkzeug/package.json"})
        self.assertEqual(report["behalten"], ["node_modules/@capacitor/android/capacitor"])
        self.assertEqual(report["entferntPakete"][0]["lizenz"], "MIT")

    def test_liste_fehlendes_paket(self):
        self.entry["paket"] = "fehlt"
        self.lock["packages"]["node_modules/fehlt"] = self.lock["packages"]["node_modules/werkzeug"]
        self.reject("fehlt.*veraltet")

    def test_liste_version_veraltet(self):
        self.entry["version"] = "2"
        self.reject("Lockfile")

    def test_liste_lizenz_veraltet(self):
        self.entry["lizenz"] = "BSD-2-Clause"
        self.reject("Lockfile")

    def test_liste_plattform_veraltet(self):
        self.entry["os"] = ["linux"]
        self.reject("Plattformangabe")

    def test_installierte_version_abweichend(self):
        (self.tool / "package.json").write_text('{"name":"werkzeug","version":"2"}', encoding="utf-8")
        self.reject("Installiertes Paket")

    def test_behaltenes_paket_in_loeschmenge(self):
        eintrag = {**self.entry, "paket": "@capacitor/android"}
        self.data["pakete"].append(eintrag)
        self.lock["packages"]["node_modules/@capacitor/android"] = {"version": "1", "license": "MIT"}
        self.reject("Zu behaltender Ordner")

    def test_restdatei_ohne_zulassung(self):
        (self.keep / "fremd.wasm").write_bytes(b"\x00asm")
        self.reject("Restdatei ohne passende Zulassung")

    def test_echte_zulassung_genauer_bytes(self):
        rest = self.keep / "fremd.wasm"
        rest.write_bytes(b"\x00asm")
        fund = i.inventar(self.nm)[0]
        self.data["zulassen"] = [{**fund, "grund": "Synthetische Gegenprobe; keine Produkt-Ausnahme."}]
        self.assertEqual(len(self.run_cleanup()["nachher"]), 1)

    def test_zulassung_hash_abweichend(self):
        (self.keep / "fremd.wasm").write_bytes(b"\x00asm")
        fund = i.inventar(self.nm)[0]
        self.data["zulassen"] = [{**fund, "sha256": "0" * 64, "grund": "Prüfung"}]
        self.reject("Restdatei ohne passende Zulassung")

    def test_zulassung_ohne_grund(self):
        self.data["zulassen"] = [{"pfad": "fremd", "bytes": 1, "sha256": "0" * 64}]
        self.reject("konkrete Begründung")

    def test_zulassung_veraltet(self):
        self.data["zulassen"] = [{"pfad": "fremd", "bytes": 1, "sha256": "0" * 64, "grund": "Probe"}]
        self.reject("Zulassung veraltet")

    def test_plattformfremdes_paket_darf_fehlen(self):
        self.data["pakete"].append({**self.entry, "paket": "fremde-plattform", "os": ["linux"]})
        self.lock["packages"]["node_modules/fremde-plattform"] = {"version": "1", "license": "MIT", "os": ["linux"]}
        self.assertEqual(self.run_cleanup()["inaktivePakete"], ["fremde-plattform"])

    def test_pfadausbruch(self):
        self.entry["paket"] = "../werkzeug"
        self.reject("Unzulässiges")

    def test_doppeltes_paket(self):
        self.data["pakete"].append(copy.deepcopy(self.entry))
        self.reject("doppeltes Paket")

    def test_node_quellenfehler(self):
        b.subprocess.run.return_value = subprocess.CompletedProcess([], 1, "", "Quelle nicht lesbar")
        self.reject("Android-Quellen nicht lesbar")

    def test_node_quelle_ausserhalb(self):
        b.subprocess.run.return_value = subprocess.CompletedProcess([], 0, "app/android\n", "")
        self.reject("nicht unter node_modules")

    def test_junction_an_paketgrenze(self):
        original = i.ist_verweis
        with patch.object(i, "ist_verweis", side_effect=lambda p: p == self.tool or original(p)):
            self.reject("Verweis/Junction")

    def test_junction_in_paket(self):
        original = i.ist_verweis
        with patch.object(i, "ist_verweis", side_effect=lambda p: p == self.tool / "bin.node" or original(p)):
            self.reject("Verweis/Junction im Löschziel")

    def test_echter_verweis_wird_nie_verfolgt(self):
        aussen = self.root / "aussen"
        aussen.mkdir()
        (aussen / "bleibt").write_bytes(b"bleibt")
        link = self.tool / "link"
        try:
            link.symlink_to(aussen, target_is_directory=True)
        except OSError:
            # Windows-Junctions brauchen keine Entwickler-Symlinkberechtigung.
            if os.name != "nt":
                raise
            self.node.stop()
            p = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(aussen)], capture_output=True)
            self.node.start()
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.reject("Verweis/Junction im Löschziel")
        self.assertEqual((aussen / "bleibt").read_bytes(), b"bleibt")
        self.assertNotIn("werkzeug/link/bleibt", {f["pfad"] for f in i.dateiliste(self.nm)})

    def test_inventar_magische_header_und_wasm_varianten(self):
        samples = {"pe": b"MZprobe", "elf": b"\x7fELF", "wasm": b"\0asm", "zip": b"PK\x03\x04", "gzip": b"\x1f\x8b", "lib.so.3": b"other",
                   "a.js": b'const wasm="AGFzbQEAAAA=";', "b.js": b'"\\x00asm"', "c.mjs": b'new Uint8Array([0,97,115,109,1,0,0,0])',
                   "d.cjs": b'WebAssembly.instantiate(buffer)', "mach": b"\xcf\xfa\xed\xfe"}
        for name, content in samples.items():
            self.assertTrue(i.arten(Path(name), content), name)
        self.assertEqual(i.arten(Path("quelle.js"), b"#!/usr/bin/env node\nconsole.log(1)"), [])
        self.assertEqual(i.arten(Path("quelle.js"), b"const word='WebAssembly';"), [])

    def test_vollinventar_erfasst_auch_unauffaellige_dateien(self):
        files = i.dateiliste(self.nm)
        self.assertEqual(len(files), 3)
        self.assertEqual([f["pfad"] for f in files], sorted(f["pfad"] for f in files))
        for f in files:
            self.assertEqual(f["sha256"], hashlib.sha256((self.nm / f["pfad"]).read_bytes()).hexdigest())

    def test_lesefehler_im_thread_beendet_das_ganze_inventar(self):
        normal = Path.open
        def oeffnen(pfad, *args, **kwargs):
            if pfad == self.tool / "bin.node":
                raise PermissionError("Nachgestellter Datei-Lesefehler")
            return normal(pfad, *args, **kwargs)
        with patch.object(Path, "open", oeffnen):
            for lesen in (i.inventar, i.dateiliste):
                with self.assertRaisesRegex(PermissionError, "Datei-Lesefehler"):
                    lesen(self.nm)

    def test_main_ueberschreibt_keinen_beleg(self):
        ziel = self.root / "bericht.json"
        ziel.write_text("vorhanden", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            b.main(["--wurzel", str(self.root), "--ausgabe", str(ziel)])
        self.assertTrue(self.tool.is_dir())
        self.assertEqual(ziel.read_text(encoding="utf-8"), "vorhanden")


if __name__ == "__main__":
    unittest.main(verbosity=2)
