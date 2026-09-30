# Prüfdaten der Emulatorauswertung

Die JSON- und Textausschnitte stammen aus der Emulatorprobe vom 29.09.2026 sowie den Läufen der App vom 30.09.2026 auf Android API 24, 30 und 36. Übernommen sind nur die für die Auswertung nötigen Felder und Zeilen. Rechnerpfade, Benutzernamen, Rechnernamen und Geräteseriennummern gehören nicht zu den Prüfdaten. Android-Paketnamen, generische Emulator-Adressen und die geprüften Android-Datenpfade bleiben als technische Testwerte erhalten.

| Dateien | Ursprüngliche Aufzeichnung und Auswahl |
|---|---|
| `netz-api*.json` | `p4-ergebnis.json`, `schritte.gueltigkeitVorher`, `gueltigkeitNachher`, `appAngriffe`, `gegenAngriffe`; Annahmen, Ergebnis und einschlägige CDP-Meldungen. |
| `navigation-api*.json` | `p4-ergebnis.json`, `schritte.appNavigation` und `gegenNavigation`; Activity-Zeilen, PID, Ort, Annahmen, logcat und CDP. Die Schlüssel der drei HTTPS-Wege sind auf `href`, `open`, `blank` abgebildet. |
| `proc-net-gegen-api*.json` | `p4-ergebnis.json`, `schritte.gueltigkeitVorher.uid` und `procNetWaehrend`. |
| `netstats-api36-*.txt` | `netstats-vor.txt` und `netstats-nach.txt`; Tabelle `mAppUidStatsMap` samt Anfang der folgenden Tabelle als Abschnittsgrenze. |
| `sicherung-api*.json` | `p6-ergebnis.json`, `phasen`; auf API 36 der korrigierte zweite Lauf. Fortschrittszeilen von `backupnow` entfallen. `stopped=false`, Lesbarkeit, leere Appablage und Markerfund sind aus den aufgezeichneten Zuständen und Archivbefunden übernommen. Gerätewechsel zusätzlich mit den Zeilen des Regelparsers. |
| `flags-*.txt` | `p6-ergebnis.json`, `dumpsysFlags`; nur Version und benannte Flags. |
| `fehlerseite-api30.json` | `p5-ergebnis.json`, `varianten.mwv84`; Ort, Seitentext, Ausnahmen nach Neuladen und lokale Anfragen. Der Seitentext gehört zur damaligen Probe-App. |
| `fehlerseite-gegenprobe-api30.txt` | `logcat-mwv84-ohne-fehlerseite-gesamt.txt`; die ersten zwei Zeilen zur fehlenden lokalen Datei. |
| `rahmen-api24-api30.json` | 30.09.: `api30-netz-versuch1/adb.jsonl`, Zeile 9, AVD-Name mit CR CR LF; `api24-installation`, leeres `webviewupdate`, unbekannte Option `-U` und generischer Build-Fingerabdruck. Der Paketlisten-Fallback im Test ist konstruiert. |
| `signierung-kennwort-api30.txt` | 30.09.: `release-signieren.txt`, Zeilen 2–3; Meldung zum Dateiende bei der zweiten Kennwortabfrage, lokaler Dateipfad ersetzt. |
| `anzeige-api*.json`, `cdp-fehler-2026-09-30.json` | 30.09.: Befehle und Antworten zu `font_scale` aus `adb.jsonl`, CDP-Fehler aus `lauf.log`; `logcat.txt` belegt die erneute Activity-Erzeugung. Zeit-/PID-Kopf der logcat-Zeilen entfernt. Die abschließende Wiederherstellung ist separat erkennbar. |
| `uiautomator-api36-beendet.json` | 30.09.: `api36-alle/adb.jsonl`, Zeile 320, UI-Automator mit Rückgabewert 137 trotz ausgegebener Erfolgsmeldung. |
| `proc-2026-09-30-api*.json` | 30.09.: `/proc/net`-Tabellen aus `netz.json`, App-/Gegenprobe-UID; aus `b-debug-unix.txt` nur Kopf und WebView-Debugsocket. |
| `navigation-api*-20260930.json` | 30.09.: einzelne Navigations-JSONs, gekürzt auf relevante Activity-Zeilen, Sperrmeldungen, Ort, PID und CDP. API 30 enthält neun Paare; API 36 sieben einschließlich `file`, dessen JSON vor dem UI-Automator-Abbruch geschrieben wurde. `content` und `data` fehlen dort. |
| `localtransport-api*-20260930.tar` und `.json` | 30.09.: zwei bytegleiche Einträge aus den originalen `_full`-Dateien, zusammen 3072 Bytes: LevelDB-Marker und letzter Eintrag `WebViewChromiumPrefs.xml`. Keine TAR-Nullblöcke hinzugefügt. JSON nennt ursprüngliche Offsets, Gesamtgröße, Marker sowie bereinigte `backupnow`-/`pull`-Ausgaben. Tests des Ausschnitts passen dessen Bytezahlen ausdrücklich als Konstruktion an; die Offline-Neuauswertung prüft die vollständigen Originaldateien. |

Die Tests verändern Kopien dieser Ausschnitte für Gegenbeispiele. Änderungen sind keine weiteren Gerätebeobachtungen. Releaseflags ohne `DEBUGGABLE` werden für den Test aus den echten Debugflags abgeleitet.

Noch keine echte Vorlage liegt für den Release-Lauf nach der Signierung, die Installationsablehnung auf API 24, den Barrierebaum, den DOM/ARIA-Namenbaum, die vollständigen Darstellungsprüfungen einschließlich Schriftgröße 2,0, Nachtmodus, Drehung und Bildschirmtastatur sowie die Signaturprüfung der vollständigen Release-Datei vor. Der Gerätewechsel mit der heutigen App ist ebenfalls nicht ausgeführt; die Vorlage vom 29.09. betrifft die damalige Probe-App. A1 bis A5 und A9 der heutigen Oberfläche sind in Laufbelegen vorhanden, aber noch nicht als eigene öffentliche Fixtures übernommen; ihre Tests verwenden weiterhin konstruierte Soll-Ist-Beispiele. Ein echter Testschlüssel mit einer kleinen Test-APK belegt die Kennwortübergabe und v2/v3-Prüfung, ersetzt aber keinen Release-Lauf. Die Loopback-Tests für IPv4 und IPv6 sind konstruiert; die Adressumrechnung setzt die Little-Endian-Wortfolge der x86_64-Testabbilder voraus. `INSTALL_FAILED_OLDER_SDK` bleibt bis zum tatsächlichen Installationsversuch ein vorgegebener Fehlercode.

Der Bau der Android-Temp-Kopien und die Umlenkung ihrer Gradle-Ausgaben wurden am 30.09. auf beiden Abbildern ausgeführt; die geschützten Build-Verzeichnisse blieben bytegleich. Die neue Wiederverwendung gespeicherter Varianten und das automatische Entfernen der Cache-Kopie benötigen noch einen Laufnachweis. Tests mit ersetzten Prozessaufrufen ersetzen ihn nicht.
