# Prüfdaten der Emulatorauswertung

Die JSON- und Textausschnitte stammen aus der Emulatorprobe vom 29.09.2026 sowie den Läufen der App vom 30.09.2026 auf Android API 24, 30 und 36. Übernommen sind nur die für die Auswertung nötigen Felder und Zeilen. Rechnerpfade, Benutzernamen, Rechnernamen und Geräteseriennummern gehören nicht zu den Prüfdaten. Android-Paketnamen, generische Emulator-Adressen und die geprüften Android-Datenpfade bleiben als technische Testwerte erhalten.

Der Quellvertrag erwartet die eigene App-Plattform: „Speichern unter“, „Teilen“, Import und die Bestätigung zum Zurücksetzen laufen über den nativen Dateiablauf; Speicher und Uhr verwenden dieselben Funktionen wie die Website über die WebView. Die Importbedienung ist eine Schaltfläche. Seine Tests enthalten konstruierte Änderungen an der Adapterkomposition, der gemeinsamen Sperre, den acht Brückenaufrufen und den Erfolgstexten. Die aufgezeichneten Prüfdaten bleiben unverändert und belegen keinen erneuten Emulatorlauf mit diesem Anschluss. Der Handlauf zur nativen Ausgabe vom 30.09.2026 ist gesondert in `docs/app.md` beschrieben; er belegt weder den neuen Import noch den Dialog. Import und Dialog sind inzwischen auf API 30 und 36 belegt: durch den [Handlauf zu Import und Dialog](../../../docs/app.md#frühere-builds-und-handläufe) vom 01.10.2026 und die [Dateiphase](../../../docs/app.md#dateiphase-auf-api-30-und-36) vom selben Tag, diese auch in Zusammensetzung mit der Ausgabe; Ausschnitte stehen unten unter „Dateiabläufe“.

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

Ergänzungen aus der dritten Serie am 30.09.2026, **noch mit der alten Oberfläche vor Paket 2.4 Teil 2**:

| Dateien | Ursprüngliche Aufzeichnung und Auswahl |
|---|---|
| `barrierebaum-api*-r3.json` | `api30-a10` und `api36-a10`, `a10-barrierebaum.json`: Wurzel, Buttons, unbenannter fokussierbarer Knoten und direkte Eltern; nur Rollen, Namen, Fokus, Knotenbezüge. Kind- und Elternverweise außerhalb des Ausschnitts sind entfernt. Version aus `geraet.json` ergänzt. Kein vollständiger Baum und keine nachträglich erfundene DOM-Beschreibung. |
| `release-api30-r3.json` | `api30-b`: Kopf und Socket-Zeilen aus `b-unix.txt`/`b-debug-unix.txt`, Version und Flags aus `b-package.txt`, generischer Abbild-Fingerabdruck aus `geraet.json`. `ro.build.type` wurde damals nicht gesondert gelesen. |
| `ueberlauf-api*-r3.json` | `a8-schrift-2-0.json` unverändert: `scrollWidth=549`, `clientWidth=412`. Elementdiagnosen waren noch nicht vorhanden. |
| `tastatur-api36-r3.txt`, `tastatur-fenster-api36-r3.txt` | `a8-tastatur.txt`: Anzeigezustände und Insets; `a8-tastatur.png.activity.txt`: App-Fokus und IME-Inset mit Höhe null. Die widersprüchliche Anzeige ist kein Beleg einer sichtbaren Tastatur. |
| `installation-api24-r3.json` | `adb.jsonl`: Rückgabewert und vollständiger `Failure [INSTALL_FAILED_OLDER_SDK: ...]`-Teil des echten Installationsversuchs. Lokale APK-Adresse und übrige Prozessausgaben entfallen. |
| `systemui-api36-r3.json` | `b-start.png.activity.txt`: oberste Activity und ANR-Fokus; `logcat.txt`: SystemUI-ANR mit `failed to complete startup`. |

Die Tests verändern Kopien dieser Ausschnitte für Gegenbeispiele. Änderungen sind keine weiteren Gerätebeobachtungen. Dazu zählen benannte Gruppen statt der unbenannten Rollbereiche, ein angenommener Build-Typ `user`, positive Tastaturhöhen und geänderte Anzeigesignale. Ältere Tests leiten Releaseflags weiterhin aus Debugflags ab; `release-api30-r3.json` enthält echte Releaseflags.

Die dritte Serie belegt die Installationsablehnung auf API 24 sowie Standardsicherung auf API 30/36 und Gerätewechsel auf API 36. Release auf API 30 ist mit der dokumentierten Socketgrenze aufgezeichnet; API 36 brach am SystemUI-Dialog ab. Die älteren Sicherungsfixtures vom 29.09. bleiben Ausschnitte der damaligen Probe-App; die Neuauswertung verwendet die vollständigen Originaldateien der jeweiligen Serie. Der DOM/ARIA-Namenbaum und A1 bis A5/A9 sind noch nicht als eigene öffentliche Fixtures übernommen. Ein echter Testschlüssel mit einer kleinen Test-APK belegt die Kennwortübergabe und v2/v3-Prüfung, ersetzt aber keinen Release-Lauf. Die Loopback-Tests für IPv4 und IPv6 sind konstruiert; die Adressumrechnung setzt die Little-Endian-Wortfolge der x86_64-Testabbilder voraus.

Ergänzungen aus der vierten Serie am 30.09.2026 mit der neuen Oberfläche:

| Dateien | Ursprüngliche Aufzeichnung und Auswahl |
|---|---|
| `systemui-wait-api36.json` | ANR-Fokus aus `start-1-systemui-0.activity.txt`, Zeile 131, der vierten Serie. Diese Serie enthält keinen Dialogbaum: Der damalige Rahmen übersprang ihn bei erkanntem ANR. Die drei unveränderten Dialogknoten (Titel, „Close app“, „Wait“) stammen deshalb ausdrücklich aus `b-start-ansicht.xml`, Zeile 1, der dritten Serie. Deutschsprachige und fehlerhafte Varianten in Tests sind Konstruktionen. |
| `tastatur-api30-r4.json` | `a8-tastatur-nachweis.json`: Anzeigezustände des Eingabedienstes, sichtbare IME-Fläche, `mInputMethodInputTarget` und DOM-Fokus vor/nach dem Tippen. Dieselben Rohtexte stehen in `a8-tastatur.txt`, Zeilen 83/252, und `a8-tastatur-fenster.txt`, Zeile 360. Der direkte Fensterfokus fehlt in dieser API-30-Ausgabe. |
| `tastatur-api36-r5.json` | `a8-tastatur-nachweis.json` der fünften Serie (fr-api36, WebView 133.0.6943.137), gekürzt auf die ausgewerteten Zeilen: Anzeigezustände des Eingabedienstes, Kopf und Rahmen des Fensters `InputMethod` mit `isOnScreen` und `isVisible`, `imeLayeringTarget` und `imeInputTarget` sowie DOM-Fokus vor und nach dem Tippen. API 36 nennt den Eingabeempfänger `imeInputTarget in display# 0`; `mCurrentFocus` und eine Zeile `type=ime` stehen in dieser Ausgabe nicht. |
| `ohne-fehlerseite-api30-r4.json` | `adb.jsonl`, Zeilen 857–858: `dump` meldet trotz Code 0 fehlenden Ruhezustand, `cat` danach Code 1 wegen fehlender Datei. Android-Dateiname auf `ansicht.xml` gekürzt. Drei Zeilen aus `ohne-fehlerseite-logcat.txt` ab Zeile 10712 belegen wiederholte Anfragen nach der fehlenden Fehlerseite; Ort aus `ohne-fehlerseite.json`. Der vollständige Logcat-Beleg enthält 807 solche Anfragen und ist über den erfolgreichen ADB-Aufruf in Zeile 851 nachprüfbar. |

Die vierte Serie belegt auf API 30 auch die korrigierte Oberfläche, A8-Messungen und A10. Die separate Überlaufnachmessung gilt auf API 30 und 36 bei 412 CSS-Pixeln und den Schriftfaktoren 1,0, 1,3 und 2,0. Der vollständige API-36-Lauf der vierten Serie brach erneut am Systemdialog ab. Die Wait-Betätigung ist mit den Prüfdaten getestet; im Lauf der fünften Serie vom 2026-09-30 auf API 36 erschien der Dialog nach dem Systemstart und war nach einer Wait-Betätigung nicht mehr sichtbar. Sichturteile werden getrennt von diesen automatisierten Tests mit Bildprüfsumme im jeweiligen Lauf protokolliert.

Der Bau der Android-Temp-Kopien und die Umlenkung ihrer Gradle-Ausgaben wurden am 30.09. auf beiden Abbildern ausgeführt; die geschützten Build-Verzeichnisse blieben bytegleich. Die vierte Serie auf API 36 bestätigt in `lauf.log`, Zeile 1, die Wiederverwendung einer Variante mit übereinstimmendem Quellenstand und übereinstimmenden APK-Prüfsummen. Ein eigener öffentlicher Rohbeleg für das automatische Entfernen der Cache-Kopie ist hier nicht enthalten. Tests mit ersetzten Prozessaufrufen ersetzen keinen Laufnachweis.

Dateiabläufe: Ausschnitte der Proben vom 30.09. und 01.10.2026:

| Dateien | Ursprüngliche Aufzeichnung und Auswahl |
|---|---|
| `dateien-c3-api30.json` | `probe.log` und `befunde.json` der Speichern-/Teilen-Probe auf API 30: Bytezahlen und SHA-256 der drei Formate, MIME des Brückenauftrags, Abbruchantwort, Activity-Namen von Auswahl und direktem Bluetooth-Empfänger. Der fehlende JSON-Empfänger ist eine Umgebungsgrenze. Pfade, Zeitstempel, Dateinamen und Projektinhalte entfallen. Die Binärdateien lagen in diesem Ausschnitt nicht vor: Ein Hash allein darf in den Tests ausdrücklich keinen Transfer bestehen lassen. |
| `dateien-c4-api30.json`, `dateien-c4-api36.json` | `zustand-3-import-projekt.json`, `zustand-4-import-abbruch.json`, `zustand-5-import-gross.json`, `zustand-6-import-grenze.json`, `zustand-7-import-kaputt.json`, `reset-abbrechen-dialog.xml` und `probe.log`: native Antworten, Fokus auf Abbrechen, Seitenkennung und PID vor/nach Neuerstellung sowie Schriftfaktor. Nur die synthetischen Projektfelder der Probe bleiben; keine Rechnerpfade oder Benutzernamen. Die damalige Grenzdatei hatte kein gültiges Projektschema: native Größenprüfung und Parserantwort werden getrennt aufgezeichnet. |

Die neuen Tests erzeugen kleine JSON-, ZIP- und PDF-Dateien selbst. Diese Bytes,
zusätzliche Zustandsfelder, Providerdaten und negative Varianten sind ausdrücklich
konstruierte Prüfdaten. Die Ausschnitte beweisen keinen Lauf der neuen Dateiphase,
des Testproviders oder der Release-APK. Das aktuelle Rohschema steht bei den
Auswertern in `../dateien-auswertung.mjs`; Feldnamen entsprechen deren einzelnen
Fallprüfungen. `dateien-roh.json` enthält Schema 1, die API und `faelle`. Jeder Fall
nennt Variante, D-Nummer, Teilfallname, Umgebung und relative Rohbelegpfade.
Dateibelege nennen Name, MIME, Bytezahl, SHA-256 und entweder eine relative Datei
oder kanonische Base64-Rohbytes. Die Neuauswertung liest Dateien selbst und prüft
deren Größe, SHA-256 und Struktur. Ein ursprünglicher Status oder UI-Erfolgstext
ersetzt weder Bytes noch die übrigen Messwerte. D12 verwendet gesonderte
Netzrohbelege sowie die bisherigen Sicherungsbelege.

Pflichtfelder innerhalb des Dateischemas (zusätzlich zu den gemeinsamen Feldern):

| Fall | Rohwerte und Prüfung |
|---|---|
| D1, D5 | `format`, `referenz`, `ziel`; Quelle der Referenz ist `bruecke`, auch für Release. Beide Dateibelege enthalten `name`, `mime`, `bytes`, `sha256`, `base64` oder `datei`. D5 ergänzt den vollständigen Empfängerbericht mit den tatsächlich versuchten URIs und `SecurityException` für verbotene Zugriffe. |
| D2 | Genau zwei `exporte`, bei JSON `zeitFixiert`, bei XLSX beide `tage`. Gleiche Rohbytes werden neu gehasht; ein Tageswechsel bleibt eine Grenze. |
| D3 | Abbruch: native Antwort, Download-Inventare vorher/nachher und freie Aktionen. Wiederholung: vollständiger Transferbeleg. Gleicher Name: zusätzlich tatsächliche `kopie`. Schließfehler: ausdrücklich begründete, nicht provozierbare Grenze. |
| D4 | Modus, oberste Activity vor/während/nach Teilen, native Antwort und erneuter Auftrag. Ohne Empfänger ist dessen Systemhinweis Pflicht; das Ergebnis bleibt eine Grenze. |
| D6 | Dokumentauswahl, Quellen- und empfangener Texthash, Projekt vorher/nachher/erwartet, gespeicherter Stand, genau ein Aufruf, freigegebene Aktionen. BOM wird vor dem Texthash ausdrücklich entfernt. |
| D7, D8 | Zusätzlich tatsächliche Bytezahl und Providerbericht mit Dokumentkennung, Dateiname, Quellenhash, angegebener Größe, angebotenen und gelesenen Bytes, Streamabschluss und Fehler. Größenmetadaten dürfen von den Bytes abweichen, die 1-MiB-Grenze nicht. |
| D9 | Deutsche Frage und Schaltflächen, fokussierte Resource-ID, Projekt und gespeicherter Stand vor/nach der Entscheidung, genau ein Rücksetzaufruf. Nur die frei eingegebenen Projektfelder werden beim Zurücksetzen auf Leerung geprüft. |
| D10 | PID und Devtools-Seitenkennung vorher/nachher, Fortbestand des externen Hakens, Projektzustand und Aufrufzahlen. Schriftfaktor beziehungsweise Drehung werden mit Ausgangs-, Zwischen- und wiederhergestelltem Wert aufgezeichnet. |
| D11 | Alte und frische Freigabe, Präferenzrohtexte, Zeiten und Dateizeit, Kontrollhash außerhalb von `export/`, gleiche PID. Vor dem bereinigenden Teilen muss die alte URI nachweisbar zu öffnen sein; danach muss dieselbe URI mit `SecurityException` scheitern. |

Fehlende Pflichtfälle, doppelte Fallkennungen, unlesbare Rohdateien, beschädigte
Base64-Daten, abweichende Hashes und nicht wiederhergestellte Messzustände werden
gesondert ausgewiesen. Die Datei-Neuauswertung verlangt außerdem die beiden
Netzfenster und die zum gewählten Abbild gehörenden Sicherungsrohbelege. Ein
berichteter Laufabbruch bleibt ungültig, selbst wenn ein Teil der Daten lesbar ist.
