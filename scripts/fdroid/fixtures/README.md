# Protokolle der lokalen Probe

Ausgabe von `fdroid build --verbose` am 2026-09-29 mit fdroidserver 2.4.2
unter Debian 13.5, Minimal-App `de.baremos.fristenrechner.probe`, Version 1.0 (1),
Commit `d27fb91d6584822b4803ac30cf79f9e1049e9a38`.

Die drei vollständigen Build-Protokolle dienen als Prüfdaten. Absolute private
Pfade wurden durch `/opt/probe/lauf`, `/opt/probe/minimal-app` und
`/opt/gradlew-fdroid` ersetzt. Wortlaut, Reihenfolge, Zeitstempel und Zeilenzahlen
der Meldungen sind erhalten, einschließlich der ANSI-Farbcodes von Astro.
Vor der Übernahme wurden sie auf private Angaben
und Geheimnisse geprüft. Es werden keine Programme oder Binärdateien übernommen.

- Lauf 1: Abbruch in `set_FDroidPopen_env`, Rückgabewert von F-Droid trotzdem 0.
- Lauf 2: zehn Scannerfehler ohne `scandelete`, Rückgabewert trotzdem 0.
- Lauf 3: Build mit `scandelete` gelungen; die Bewertung der Warnungen ist eine
  zusätzliche Prüfung zum beobachteten Build-Erfolg.

Die Tests erzeugen kleine ZIP-Dateien als APK-Ersatz. Diese sind kein Nachweis
für Android-Paketformat, Signatur oder Reproduzierbarkeit der echten APK.

## App-Läufe vom 2026-09-30

Die JSON-Datei app-laeufe-2026-09-30.json enthält gekürzte Auszüge von
fdroidserver 2.4.2 unter Debian 13.5, Python 3.13.5, WSL 2, App-Version 0.1.0 (100),
Stand 5c43ced5d2dfff021fab14d451415bd9181b3114. Die ursprünglichen Zeilennummern
stehen neben jeder übernommenen Zeile. Absolute Rechnerpfade wurden durch
/lauf und /werkzeug ersetzt; der Git-Klonbefehl auf seinen Zweck und das
neutrale Ziel gekürzt. Dateiinhalte, APKs und Zwischenspeicher sind nicht enthalten.
Das Feld `fassung` nennt Version und `versionCode` der App, mit der die Protokolle
entstanden sind. Die Tests werten die Protokolle gegen diese Fassung aus, nicht gegen
die aktuelle Referenz in `app-referenz.json`; die Prüfdaten bleiben damit auch nach
einer neuen App-Fassung gültige Belege.

- (a) lauf-hqj89xdz-gezielt: gezielte Bereinigung; Build gelungen.
- (b) lauf-zhqctq16-gezielt-scandelete: gezielte Bereinigung mit scandelete;
  Scannerabbruch durch Unused scandelete path: node_modules (Zeilen 120–121, 125).
- (c) lauf-bms4awvc-ohne: zehn Scannerfehler ohne Bereinigung
  (Zeilen 116–124, 126, 128, 132).

app-meldungen.json beschreibt vollständige Zeilenmuster, zulässige Kontexte und
die größte belegte Anzahl je Lauf. Alle Belegzeilen stehen dort; die Tabelle nennt
jeweils die erste pro Lauf. Die Python-Tests prüfen jeden Beleg gegen sein Muster.
Die bestehenden Dauerformate aus build-auswerten.py werden wiederverwendet;
die Auswertung der Minimal-App bleibt unverändert.

| Meldungsform | Beleg (Lauf: ursprüngliche Zeile) |
|---|---|
| git_clone | c: 18, a: 18, b: 18 |
| shell_cd | c: 37, a: 37, b: 37 |
| npm_ci | c: 38, a: 38, b: 38 |
| npm_uuid_7_0_3 | c: 39, a: 39, b: 39 |
| gradle_flatdir | c: 109, a: 111, b: 111 |
| android_sdk_xml_3_4 | a: 142 |
| npm_installiert | c: 41, a: 41, b: 41 |
| shell_lockkopie | c: 42, a: 42, b: 42 |
| shell_inventar_vor_scanner | c: 43, a: 43, b: 43 |
| shell_inventar_nach_scanner | a: 125 |
| shell_vollinventar_vor_scanner | c: 84, a: 86, b: 86 |
| shell_vollinventar_nach_scanner | a: 127 |
| inventar_vorgebaut | c: 44, a: 44, b: 44 |
| inventar_alle_dateien | c: 85, a: 87, b: 87 |
| shell_app_vorbereiten | c: 45, a: 45, b: 45 |
| shell_app_nach_scanner | a: 129 |
| npm_kern_build | c: 48, a: 48, b: 48 |
| tsc_build | c: 49, a: 49, b: 49 |
| astro_statische_routen | c: 63, a: 63, b: 63 |
| k1_bestanden | c: 70, a: 70, b: 70 |
| k3_bestanden | c: 78, a: 78, b: 78 |
| k4_bestanden | c: 79, a: 79, b: 79 |
| android_quellen_vorhanden | a: 130 |
| app_bauschritt | c: 46, a: 46, b: 46 |
| k2_bestanden | c: 71, a: 71, b: 71 |
| astro_output | c: 53, a: 53, b: 53 |
| astro_ziel | c: 55, a: 55, b: 55 |
| astro_fortschritt | c: 56, a: 56, b: 56 |
| astro_typen | c: 52, a: 52, b: 52 |
| astro_teil_erfolg | c: 57, a: 57, b: 57 |
| vite_erfolg | c: 59, a: 59, b: 59 |
| astro_route | c: 64, a: 64, b: 64 |
| astro_seite_fertig | c: 68, a: 68, b: 68 |
| capacitor_teil_erfolg | c: 72, a: 72, b: 72 |
| capacitor_sync_erfolg | c: 77, a: 77, b: 77 |
| shell_bereinigung | a: 82, b: 82 |
| bereinigung_ergebnis | a: 83, b: 83 |
| gradle_text | c: 90, a: 92, b: 92 |
| gradle_cache | c: 89, a: 91, b: 91 |
| gradle_aufruf | c: 94, a: 96, b: 96 |
| gradle_projekt | c: 108, a: 110, b: 110 |
| gradle_task | c: 111, a: 113, b: 113 |
| gradle_erfolg | c: 113, a: 115, b: 115 |
| gradle_taskzahl | c: 114, a: 116, b: 116 |
| gradle_problembericht | a: 287 |
| scanner_app_wrapper | c: 127, a: 119, b: 119 |

Die drei bereits für die Minimal-App bekannten Warnungsformen npm_uuid_7_0_3,
gradle_flatdir und android_sdk_xml_3_4 werden in der App-Liste mit eigenen
App-Belegen und Kontexten wiederholt. NoSuchPathError bleibt ausschließlich
zwischen Build-Beginn und Quellenabruf erlaubt (alle drei Läufe: Zeilen 13–16).

Die Wrapper-Ausnahme gilt nur für die einmalige INFO-Meldung innerhalb der
Scannerphase am exakten Pfad app/android/gradle/wrapper/gradle-wrapper.jar.
Jede weitere Entfernung bleibt ein Befund. Die Scannerfehler in (b) und (c)
werden als benannter Abbruch geführt; fehlende Nachweise nach diesem Abbruch
werden ausdrücklich als nicht geprüft ausgewiesen.

## App-Lauf vom 2026-10-15

Die JSON-Datei app-laeufe-2026-10-15.json enthält einen gekürzten Auszug aus
lauf-4zdiuc_3-gezielt, App-Version 0.1.0 (100), Stand
d3d432b87704cdb09e8b1eacb7c6108d777e0ca3; der Build ist gelungen.
Die ursprünglichen Zeilennummern sind erhalten: Zeile 36 belegt den Kontext
prebuild, Zeile 48 npm_kern_build mit Kern-Version 0.1.0 und Zeile 79
hinweise_dritter_bestanden zwischen K3 (78) und K4 (80). Das Kern-Muster
erlaubt genau 0.0.0 und 0.1.0, damit die bisherigen echten Belege gültig bleiben.
Die übernommenen Zeilen enthalten keine absoluten Rechnerpfade, Benutzernamen
oder Geheimnisse; Dateiinhalte, APKs und Zwischenspeicher sind nicht enthalten.
