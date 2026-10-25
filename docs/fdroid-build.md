# Build für F-Droid

Stand 2026-10-25 · Arbeitspaket 2.8 · Fassung 1.0.0 (`versionCode` 10000), Build-Commit `61e151091bb509240e16ef86d8a0ad04b44e4582` unverändert · signierte APK im GitHub-Release `v1.0.0` · Rezeptform 1.1 (Stufe 1): vier Node-Bindungen und esbuild aus Quelltext, Debian-Werkzeuge und Web-Build in `build` · vollständige Probe und Merge-Request-Pipeline 2981625855 belegen die frühere Rezeptfassung · Merge Request 53867 wegen der Drei-Monats-Regel geschlossen, Wiederöffnung Anfang Januar 2027 vorgesehen

Der [Lauf an der Referenz 1.0.0](#lauf-an-der-referenz-100-vom-2026-10-22) besteht mit gezielter Bereinigung und Scanner nach Erweiterung des Protokollmusters `npm_kern_build` um die Kern-Version 0.1.1 (`dfd1fb8`) und Neuauswertung. Die unsignierte Release-APK ist bytegleich mit den Builds ohne F-Droid unter Windows und Linux. Die Läufe vom September bis zum 2026-10-19 bleiben als historische Nachweise erhalten.

Ergänzt am 2026-09-30: Die App wurde ohne die Werkzeuge von F-Droid in zwei frischen Debian-Klonen gebaut. Die unsignierten Release-APKs sind untereinander und mit Windows bytegleich; Web-Build und Sync bestanden zusätzlich ohne Netz. Versionen und Grenzen stehen im [Linux-Nachweis der App](app.md#linux-nachweis-vom-2026-09-30). Anschließend gelang der lokale Build mit fdroidserver 2.4.2, Scanner und gezielter Bereinigung; auch diese APK ist bytegleich zur Referenz. Die drei Vergleichsläufe stehen unten. Ein Build auf dem Buildserver von F-Droid bleibt ausstehend.

## Zweck

F-Droid baut jede App selbst aus den Quellen und prüft sie vorher mit einem Scanner. Dieses Dokument hält fest, wie der Nachweis dafür lokal geführt wird, was bisher geprüft ist und was offen bleibt.

Das Arbeitspaket hat zwei Teile. Die frühe Probe mit einer Minimal-App zeigt, woran der Weg scheitern kann, bevor die App entsteht. Die drei lokalen Läufe der App belegen den Build mit Scanner für den damaligen Stand. Die Wiederholung mit dem fertigen App-Stand von Stufe 2 ist am 2026-10-04 erfolgt und am 2026-10-15 für die eingefrorenen App-Eingaben, am 2026-10-19 für die Fassung 0.2.0 und am 2026-10-22 für die Fassung 1.0.0 erneuert worden.

Alle Aussagen gelten für den genannten Tag, die genannten Versionen und die beschriebene Umgebung.

## Umgebung

| Punkt | Stand |
|---|---|
| Rechner | Windows 11 mit WSL 2 |
| Distribution | Debian 13.5 (trixie), Paketquellen `trixie`, `trixie-updates`, `trixie-backports` und `trixie-security`, nur `main` |
| Vor der Einrichtung | 157 Pakete, weder Git noch Python noch Java |

Unter WSL reicht der Suchpfad von Windows in die Distribution hinein. Die Skripte für Linux setzen `PATH` deshalb selbst auf die Ordner des Systems.

## Installierte Werkzeuge

Installiert am 2026-09-28 mit `apt-get install --no-install-recommends fdroidserver git curl unzip wget ca-certificates rsync`. Das waren 306 neue Pakete, belegt waren danach 2,4 GiB statt 474 MiB.

| Werkzeug | Version | Paket aus Debian |
|---|---|---|
| fdroidserver | 2.4.2 | `fdroidserver` 2.4.2-1 |
| OpenJDK | 21.0.12.1 | `openjdk-21-jdk-headless` 21.0.12.1+1-1~deb13u1 |
| apksigner | 35.0.2 | `apksigner` 35.0.2-1 |
| Androguard | 3.4.0 | `androguard` 3.4.0~a1-17 |
| sdkmanager von F-Droid | 0.6.11 | `sdkmanager` 0.6.11-2 |
| Python | 3.13.5 | `python3` 3.13.5-1 |
| Git | 2.47.3 | `git` 1:2.47.3-0+deb13u1 |

Im System sind das Android SDK, Node.js und Gradle nicht installiert. Node.js und das Projekt-SDK liegen seit dem 2026-09-29 im Benutzerbereich, siehe „Einrichtung unter Linux“. Gradle lädt der Gradle-Wrapper beim ersten Build dorthin. Die empfohlenen Pakete von `fdroidserver` sind nicht installiert, darunter das Paket `android-sdk` aus Debian.

**Zur Fassung von fdroidserver:** `toolchain.md` nannte bis zum 2026-09-28 die Fassung 2.4.5, der Installationsweg sollte vor der Installation feststehen. Installiert worden ist für die frühe Probe die Fassung 2.4.2 aus Debian, also vor der Festlegung. Der fachlich Verantwortliche hat danach am selben Tag 2.4.2 aus Debian festgelegt, siehe F1.

## Frühe Probe, Schritt 1: Scanner auf dem Quelltext

| Schritt | Befehl |
|---|---|
| Prüfen | `scripts/fdroid/quelltext-pruefen.sh --repo <Ordner> --appid <App-ID>` |

So arbeitet das Skript:

- Es prüft einen festgelegten Stand eines Git-Repositorys, ohne Angabe `HEAD`. Den Stand holt sich der Scanner selbst aus dem Repository. Dateien des Arbeitsbaums, die nicht eingecheckt sind, zählen nicht.
- Es kopiert und löscht keine Quelldateien. Jeder Lauf bekommt einen neuen Ordner im Arbeitsordner. Der Arbeitsordner darf weder im Repository liegen noch es umschließen.
- Die Ordner der Läufe bleiben liegen, auch nach einem gescheiterten Lauf: Metadaten, Ausgabe, Protokoll und der Stand des Quelltexts, den der Scanner geholt hat. Sie sind der Nachweis des Laufs. Das Skript räumt nicht auf. Wer Platz braucht, löscht einzelne Ordner `lauf-*` von Hand. Fünf Läufe mit der Minimal-App belegten am 2026-09-28 zusammen 9,6 MiB.
- Der Scanner läuft in einem eigenen Namensraum ohne Netzwerk (`unshare -r -n`). Mit `--mit-netz` entfällt das.
- Das Skript braucht das Android SDK nicht.
- Die Auswertung liegt in `scripts/fdroid/scanner-auswerten.py`. Sie liest die Ausgabe im Format JSON und das Protokoll.

Geprüft ist die Minimal-App aus Arbeitspaket 2.1: eine Seite aus dem Web-Build, Capacitor 8.5.2 mit den Plugins `filesystem` und `share`, dazu das Android-Projekt aus der Vorlage von Capacitor. Es enthält keine Einträge zu Google-Diensten und keine Berechtigung, die Sicherung ist abgeschaltet, festgelegt sind Gradle 8.14.5 und die Build-Tools 35.0.0. Die Minimal-App liegt nicht im Repository. Für die Probe ist ihr Quelltext in ein eigenes Git-Repository gelegt worden, ohne `node_modules`, `dist`, `.astro`, Protokolle und Build-Ordner. Das sind 64 Dateien.

| Fall | Ergebnis am 2026-09-28 mit fdroidserver 2.4.2, ohne Netzwerk |
|---|---|
| Minimal-App, 64 Dateien | keine Beanstandung |
| Gegenprobe: zweiter Stand mit einer fremden JAR-Datei und einem unbekannten Maven-Repository | 3 Beanstandungen: zweimal „unknown maven repo", einmal „Java JAR file" |
| Gegenprobe: eingecheckte JAR-Datei in einem Ordner namens `build` | 1 Beanstandung |
| Gegenprobe: JAR-Dateien im Arbeitsbaum, nicht eingecheckt | keine Beanstandung, sie gehören nicht zum Stand |
| Quelltext ohne jede Meldung des Scanners | keine Beanstandung, die Ausgabe im Format JSON ist leer |
| Gegenprobe: Metadaten mit einem Commit, den es nicht gibt | 1 Beanstandung. Der Scanner endet mit 0 und gibt leeres JSON aus, der Abbruch steht mit drei Folgezeilen im Protokoll. |
| Gegenprobe: eingecheckte JAR-Datei und eine Datei `settings.gradle`, die kein gültiges UTF-8 ist | 2 Beanstandungen: der Fehler „Java JAR file“ und der Abbruch. Der Scanner endet mit 0 und schreibt keine Zusammenfassung. |
| Gegenprobe: Protokoll ohne Beanstandung, ergänzt um die Zusammenfassung „Scanner found 3 problems“, JSON leer | 1 Beanstandung: Die Zusammenfassung passt nicht zu den erfassten Fehlern. |
| Stand mit einem Namen wie eine Option: Zweige `--help` und `-q` | werden als Stand gelesen und geprüft |

Der Scanner entfernt bei der Minimal-App `gradlew`, `gradlew.bat` und `gradle-wrapper.jar` und meldet das als Hinweis. F-Droid startet Gradle über sein eigenes Werkzeug.

Grenzen dieser Prüfung:

1. Geprüft ist der Quelltext, wie er eingecheckt ist. `node_modules` gehört nicht dazu. Beim Build prüft F-Droid nach den Vorbereitungsschritten des Rezepts, also nachdem `npm ci` gelaufen ist.
2. Die App ist nicht gebaut. Der Build braucht das Android SDK und Node.js unter Linux.
3. Geprüft ist mit der Fassung 2.4.2 aus Debian und den Signaturdaten, die sie mitbringt. Der Buildserver von F-Droid nutzt einen neueren Stand, seine Regeln können abweichen.
4. Die Auswertung erkennt einen Abbruch an Meldungen der Stufen `WARNING`, `ERROR` und `CRITICAL` und daran, dass Beginn oder Ende der Prüfung im Protokoll fehlen. Die Stufe liest sie nur aus dem Kopf der Meldung, Zeilen ohne Kopf zählen zur Meldung davor. Die Zusammenfassung des Scanners muss zum geprüften Stand und zur Zahl der erfassten Fehler passen. Nach einem abgefangenen Abbruch schreibt der Scanner keine Zusammenfassung. Dann gilt die Prüfung als unvollständig, und der Abgleich der Zahl entfällt. Geprüft ist das mit zwei echten Abbrüchen, einer davon nach einem schon erfassten Fehler, mit einem echten Lauf mit drei Fehlern und mit nachgestellten Protokollen. Die Form des Protokolls ist die von fdroidserver 2.4.2. Ändert eine spätere Fassung den Kopf der Meldungen, findet die Auswertung Beginn und Ende nicht und meldet Beanstandungen.

## Befunde

| Nr. | Befund | Beleg |
|---|---|---|
| 1 | Der Rückgabewert 0 von `fdroid scanner` belegt bei Quelltext keine Beanstandungsfreiheit. Mit 3 Beanstandungen und `--exit-code` endet fdroidserver 2.4.2 mit 0. Der Schalter wirkt dort nur bei der Prüfung von APK-Dateien. | Gegenprobe und Quelltext des Scanners |
| 2 | Ein abgefangener Abbruch steht nur im Protokoll. Beispiel: Den Stand gibt es im Repository nicht, der Scanner meldet `VCS error` als Warnung, endet mit 0 und gibt leeres JSON aus. Leeres JSON liefert auch ein Lauf ohne Beanstandung und ohne Hinweis. | Gegenprobe. Das Skript wertet deshalb JSON und Protokoll aus. |
| 3 | `gradlew-fdroid` aus fdroidserver kennt Gradle 8.14.5 nicht. Die Fassungen 2.4.2 und 2.4.5 enthalten dieselbe Datei, sie kennt Gradle bis 8.14.2 und bricht bei einer unbekannten Version ab. | Datei aus dem Paket und aus dem Repository von F-Droid, Stand der Marken 2.4.2 und 2.4.5, bytegleich |
| 4 | Im aktuellen Stand von F-Droid ist `gradlew-fdroid` ein eigenes Projekt. Es liest die Prüfsummen aus dem Prüfsummen-Protokoll von F-Droid. Das Protokoll nennt Gradle 8.14.5 mit denselben drei Prüfsummen wie `scripts/toolchain.json`. | `fdroid/gradlew-fdroid`, Datei `gradlew.py`, letzter Commit 2026-07-21; `fdroid/gradle-transparency-log`, Datei `checksums.json`, Stand 2026-09-24 |
| 5 | Debian 13 liefert Node.js 20.19.2. Das Projekt unterstützt die Bereiche `^22.23.2 || ^24.18.1`. | `apt-cache policy nodejs` |
| 6 | Das Änderungsprotokoll von fdroidserver nennt nach 2.4.2: in 2.4.3 die Unterstützung von Python 3.14 und Korrekturen der Tests unter macOS, in 2.4.4 die Anpassung der Tests an sdkmanager 0.7, in 2.4.5 die Korrektur eines Absturzes mit Androguard ab 4.1.4. Debian 13 liefert Python 3.13, sdkmanager 0.6.11 und Androguard 3.4.0. | `CHANGELOG.md` der Marke 2.4.5 |
| 7 | Zwei Rezepte für Apps mit Capacitor bei F-Droid stellen Node.js selbst bereit oder installieren es aus Debian, bauen die Web-Anteile in den Vorbereitungsschritten, nennen `node_modules` unter `scandelete` und bauen mitgelieferte native Anteile über `srclibs` aus den Quellen. Eines davon lädt Node.js als Archiv von nodejs.org und prüft die SHA-256. | Metadaten von `us.materialio.app` und `com.logseq.app` in `fdroid/fdroiddata`, gelesen am 2026-09-28 |

Nicht geprüft ist, ob der Buildserver von F-Droid heute mit Gradle 8.14.5 baut. Befund 4 belegt nur, dass die Prüfsummen dort bekannt sind. Befund 7 zeigt, wie andere vorgehen. Er belegt nicht, dass derselbe Weg für diese App trägt.

## Prüfsummen für den Build unter Linux

| Datei | SHA-256 | Quelle |
|---|---|---|
| `node-v24.21.0-linux-x64.tar.gz` | `6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff` | `SHASUMS256.txt` von nodejs.org, gelesen am 2026-09-28 |

Dieselbe Datei nennt für `node-v24.21.0-win-x64.zip` die Prüfsumme aus `scripts/toolchain.json`. Die Signatur der Datei `SHASUMS256.txt` ist nicht geprüft. Festgelegt ist das Archiv mit gzip, weil `xz` in der Installation der Probe fehlt. Die Prüfsumme steht auch in `scripts/toolchain.json`.

## Einrichtung unter Linux

| Schritt | Befehl | Stand |
|---|---|---|
| Node.js bereitstellen | `scripts/node-einrichten.sh` | eingerichtet am 2026-09-29 unter `~/.local/share/fristenrechner/node`: Archiv geladen, Prüfsumme stimmt, Node.js 24.21.0 und npm 11.19.0, 4797 Dateien, 208 MiB. Ein zweiter Lauf erkennt die Einrichtung und lädt nichts. Im Suchpfad des Systems liegt kein Node.js. Am 2026-09-28 ohne Download geprüft: Probelauf, Fehlbedienung, vorhandene Ordner mit passendem und mit unpassendem Inhalt. |
| Projekt-SDK einrichten | `scripts/android-sdk-einrichten.sh --ohne-testgruppe` | eingerichtet am 2026-09-29 unter `~/.local/share/fristenrechner/android-sdk`. Der fachlich Verantwortliche hat das Skript gestartet und die Lizenzbedingungen im Dialog bestätigt. Das war der erste Lauf mit Download. Ergebnis: 11 667 Dateien, rund 490 MiB, im Ordner `licenses` liegt nur `android-sdk-license`. |
| Projekt-SDK prüfen | `scripts/android-sdk-einrichten.sh --nur-pruefen --ohne-testgruppe` | am 2026-09-29 am eingerichteten SDK: vier von vier Paketen wie festgelegt, Rückgabewert 0. Gegenprobe ohne `--ohne-testgruppe`: Emulator und drei Systemabbilder fehlen, Rückgabewert 2. Am 2026-09-28 geprüft an einem leeren und an einem nachgebauten SDK, auch in einem Ordner mit Leerzeichen und Umlaut. Gegenproben mit einem ersetzten Prüfprogramm: Abbruch, zu wenige Zeilen, vertauschte Namen, fehlendes Feld und unbekannter Status lassen das Skript scheitern. |

| Paket im SDK | Revision |
|---|---|
| `cmdline-tools;22.0` | 22.0 |
| `platforms;android-36` | 2 |
| `build-tools;35.0.0` | 35.0.0 |
| `platform-tools` | 37.0.1 |

`sdkmanager` hat außerhalb des SDK den Ordner `~/.android/cache` angelegt und im SDK den Ordner `.temp`.

Beide Skripte lesen Versionen und Prüfsummen aus `scripts/toolchain.json`. Sie schreiben nur in den Benutzerbereich und installieren nichts im System. `android-sdk-einrichten.sh` entspricht dem Skript für Windows: `sdkmanager` zeigt die Lizenzbedingungen an, wer das Skript startet, bestätigt sie selbst. `node-einrichten.sh` vergleicht nach dem Entpacken Node.js und npm mit der Festlegung.

## Saubere Kopie unter Linux

Geprüft am 2026-09-29 in Debian 13.5 mit Node.js 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Python 3.13.5 und Git 2.47.3. Der Stand `main` ist in einen neuen Ordner geklont worden, 61 Dateien, keine davon mit Zeilenenden von Windows.

| Schritt | Ergebnis |
|---|---|
| `npm ci` | 48 Pakete installiert. Die Lizenzprüfung zählt 45 der 70 Einträge des Lockfiles als installiert, 25 stehen nur im Lockfile. |
| `npm test` | Skripte: 221 Tests, 219 bestanden, 2 übersprungen. Die beiden prüfen das Skript für Windows mit PowerShell. Rechenkern: 134 Tests bestanden. |
| `npm run check` | bestanden |
| `npm run build` | bestanden, gebaut ist der Rechenkern |
| `npm run lizenzen` | bestanden |
| Arbeitsbaum danach | laut Git unverändert |

Vorgebaute Programme nach `npm ci` unter Linux, gesucht nach den Endungen `node`, `wasm`, `so`, `exe`, `dll`, `dylib` und `jar` und nach ELF-Dateien:

| Datei | Größe | Verwendung |
|---|---|---|
| `@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node` | 19,1 MB | Rolldown, über Vite für die Tests |
| `lightningcss-linux-x64-gnu/lightningcss.linux-x64-gnu.node` | 10,0 MB | Lightning CSS, über Vite für die Tests |

Dazu kommt `es-module-lexer` mit WebAssembly, das in JavaScript eingebettet ist. Der Build des Rechenkerns ruft nur `tsc` auf. Das gilt für den Stand vom 2026-09-29 ohne die Oberfläche und ohne die App. Mit Astro kommen weitere Pakete hinzu, die Aufstellung ist dann zu wiederholen (F5).

## Build der Minimal-App unter Linux

Gebaut am 2026-09-29 in Debian 13.5, ohne die Werkzeuge von F-Droid. Quelle ist der Stand der Minimal-App, den auch der Scanner geprüft hat, 64 Dateien, frisch geklont in einen neuen Ordner. Das Build-Skript stammt aus der sauberen Kopie von `main`.

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Abhängigkeiten | `npm ci` | 394 Pakete |
| Test des Web-Anteils | `npm test` | 1 Test bestanden |
| Web-Build | `npm run build` | `dist` mit einer Seite |
| Abgleich mit Capacitor | `npx --no-install cap sync android` | 2 Plugins erkannt, `filesystem` 8.1.3 und `share` 8.0.2. Der Arbeitsbaum ist danach laut Git unverändert. |
| Prüfung der Werkzeuge | `scripts/android-build.mjs --nur-pruefen` | Node.js 24.21.0, JDK 21.0.12.1 aus Debian, SDK im Standardordner, Gradle 8.14.5. Hinweise nur auf die fehlende Testgruppe. |
| Debug-Build | `scripts/android-build.mjs --aufgabe assembleDebug` | bestanden nach 2 Minuten 56 Sekunden, 154 Aufgaben. In dieser Zeit lädt der Wrapper Gradle und Gradle die Abhängigkeiten. |
| Release-Build | `scripts/android-build.mjs --aufgabe assembleRelease` | bestanden nach 52 Sekunden, 204 Aufgaben. Die Datei ist unsigniert. |

Die Tabelle hält die damaligen Aufrufe der Minimal-App fest. Für die App unter `app/android` startet der Release-Build mit strenger Prüfung und dem nur für Builds eingerichteten Projekt-SDK aus der Repositorywurzel so:

```sh
node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe
```

`--ohne-testgruppe` nimmt Emulator und Systemabbilder aus der Werkzeugprüfung. Alle anderen Prüfungen bleiben bestehen; ein fehlendes Paket der Gruppe „Build" lässt den Aufruf weiterhin scheitern.

| Datei | Größe | Berechtigungen laut `aapt2` |
|---|---|---|
| `app-debug.apk` | 4 247 132 Bytes | nur `de.baremos.fristenrechner.probe.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, keine Berechtigung `INTERNET` |
| `app-release-unsigned.apk` | 3 251 043 Bytes | wie oben |

Die genannte Berechtigung legt die Bibliothek AndroidX Core für die App selbst an. Sie gewährt keinen Zugriff auf das Netzwerk.

Geladen hat der Build in den Benutzerbereich: Gradle 8.14.5 über den Wrapper mit Prüfung der Prüfsumme und die Abhängigkeiten des Android-Builds, zusammen 1,3 GiB unter `~/.gradle`. Die Abhängigkeiten aus npm belegen 311 MiB.

Gradle meldet zweimal „Using flatDir should be avoided“. Die Meldung stammt aus der Vorlage von Capacitor.

### Erste Probe zur Reproduzierbarkeit

Verglichen ist die unsignierte Release-Datei der Minimal-App, Stand `d27fb91`, gebaut am 2026-09-29.

| Vergleich | Ergebnis |
|---|---|
| zwei Builds unter Linux in getrennten Ordnern mit verschieden langen Pfaden, jeweils frisch geklont, mit eigenem `npm ci` | bytegleich, 3 251 043 Bytes, SHA-256 `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350` |
| Build unter Windows 11 gegen den Build unter Linux, unter Windows geklont ohne Umwandlung der Zeilenenden | bytegleich |
| Gegenprobe: Build unter Windows, geklont mit `core.autocrlf=true`, 37 Dateien mit Zeilenenden von Windows im Arbeitsbaum | bytegleich |

| Umgebung | Windows | Linux |
|---|---|---|
| Betriebssystem | Windows 11 | Debian 13.5 unter WSL 2 |
| JDK | 21.0.8 | 21.0.12.1 |
| Node.js und npm | 24.21.0 und 11.19.0 | 24.21.0 und 11.19.0 |
| Gradle, Android-Gradle-Plugin, Build-Tools | 8.14.5, 8.13.0, 35.0.0 | 8.14.5, 8.13.0, 35.0.0 |

Was das belegt und was nicht:

1. Alle Builds liefen am selben Tag auf demselben Rechner. Unter Linux teilten sich beide Builds den Zwischenspeicher von Gradle.
2. Die Minimal-App hat eine Seite, keine Bilder aus eigenen Quellen und keinen nativen Code. Die Zeilenenden der Quellen erreichen bei ihr das Ergebnis nicht. Bei der App kann das anders sein.
3. Belegt ist die Gleichheit der Datei nach dem ganzen Ablauf, nicht die Gleichheit aller Eingabedateien. In der Gegenprobe hatten nach dem Klonen 37 Dateien Zeilenenden von Windows. `cap sync` schreibt zwei davon neu, `android/app/capacitor.build.gradle` und `android/capacitor.settings.gradle`, mit Zeilenenden von Linux. Git meldet sie danach als geändert, ihr Inhalt ist sonst gleich. Im Lauf ohne Umwandlung hat eine Datei Zeilenenden von Windows, `android/gradlew.bat`. Sie ist so eingecheckt.
4. Verglichen ist die unsignierte Datei. Signiert ist nichts.
5. Das ist kein Build mit den Werkzeugen von F-Droid und kein Build auf dem Buildserver von F-Droid.
6. Das Build-Skript meldet unter Windows, dass das JDK 21.0.8 vom Stand für Release-Builds abweicht. Auf das Ergebnis hatte das hier keinen Einfluss.

## Festlegungen

Jede Festlegung fällt, bevor das betreffende Werkzeug installiert wird. F1 bis F6 sind getroffen. F5 ist am 2026-09-30 nach dem Versuch mit der App anhand der Inventare und Vergleichsläufe festgelegt worden.

| Nr. | Thema | Festlegung oder Vorschlag | Begründung |
|---|---|---|---|
| F1 | Fassung von fdroidserver | **festgelegt am 2026-09-28:** 2.4.2 aus Debian 13, als Stand des lokalen Nachweises | Debian liefert signierte Pakete und Sicherheitsaktualisierungen. Die Änderungen bis 2.4.5 betreffen Versionen, die Debian 13 nicht enthält (Befund 6). Eine Installation über PyPI brächte einen zweiten Paketweg. Der abschließende Nachweis hält zusätzlich fest, welchen Stand der Buildserver von F-Droid nutzt. |
| F2 | Gradle im Build für F-Droid | **festgelegt am 2026-09-29:** Gradle 8.14.5 bleibt; lokal gilt `gradlew-fdroid` mit Commit `c7227d147483979bb5c408048cee3533a8814fb0`. Quelle, SHA-256 und Ablage stehen im folgenden Abschnitt und in `scripts/toolchain.json`. | Ein Wechsel auf fdroidserver 2.4.5 löst die Frage nicht (Befund 3). Das Projekt hat laut dem gelesenen Stand keine Marken. Die Festlegung fixiert das Programm, nicht die nachgeladenen Prüfsummendaten. |
| F3 | Node.js unter Linux | **festgelegt am 2026-09-28:** Archiv von nodejs.org mit der Prüfsumme oben, abgelegt im Benutzerbereich | wie unter Windows: Referenzversion, keine Installation im System |
| F4 | Android SDK unter Linux | **festgelegt am 2026-09-28:** Kommandozeilenwerkzeuge 22.0 für Linux nach `scripts/toolchain.json`, nur die Gruppe „Build" | Der Emulator läuft unter Windows. Wer installiert, bestätigt die Lizenz selbst. Das `sdkmanager` von F-Droid wird dafür nicht verwendet. |
| F5 | Vorgebaute Programme in `node_modules` | **festgelegt am 2026-09-30: gezielte Bereinigung nach Web-Build und `cap sync` anhand der geprüften Paketliste, ohne `scandelete`** | Die App baut nach gezielter Bereinigung ohne Scannerfehler und bytegleich zur Referenz. Ohne Bereinigung stoppt der Scanner an zehn Dateien. Ergänzendes `scandelete: [node_modules]` bricht mit `Unused scandelete path: node_modules` ab, weil die Bereinigung keine entsprechenden Scannerfunde übrig lässt. |
| F6 | Kategorie bei F-Droid | **festgelegt am 2026-09-30: `Calculator`** | `config/categories.yml` aus `fdroiddata`, gelesen am 2026-09-30: „Arithmetic, scientific, and mathematical calculation tools“. SHA-256 der gelesenen Datei: `edf68d8d70073fe52a52c6a33f490399ce9dc884acff3a761a3a1e34acf9d541`. |

F3 gilt für die lokale Einrichtung und die lokalen Build-Rezepte. Das [Veröffentlichungsrezept](#node-und-vorbereitung-des-builds) verwendet seit der Entscheidung vom 2026-10-23 Node.js und npm aus Debian forky. **Abgrenzung vom 2026-10-23:** F5 gilt nur noch für lokale Reproduzierbarkeitsläufe mit `scripts/fdroid/build-lokal.py`. Im Veröffentlichungsrezept ersetzt [E9](#werkzeuge-aus-quelltext-23102026) die Bereinigung nach dem Web-Build durch das Entfernen der sieben Plattformpakete vor dem Scanner und den späteren Bau der vier benötigten Bindungen aus Quelltext.

## F2: festgehaltenes Buildwerkzeug

Am 2026-09-29 wurden zunächst die folgenden Dateien gelesen. Anschließend wurde der festgehaltene Stand unter Debian eingerichtet und in den unten beschriebenen Läufen ausgeführt.

| Angabe | Festlegung |
|---|---|
| Projekt | [fdroid/gradlew-fdroid](https://gitlab.com/fdroid/gradlew-fdroid) |
| Commit | `c7227d147483979bb5c408048cee3533a8814fb0`, 2026-07-21, „Update MIN_GRADLE_VERSION“ |
| Datei | [gradlew.py aus diesem Commit](https://gitlab.com/fdroid/gradlew-fdroid/-/raw/c7227d147483979bb5c408048cee3533a8814fb0/gradlew.py), 23 977 Bytes |
| SHA-256 | `a6e2366c3499f9ba92b4a6f52883d2d0db24b38b4523b186d4ae5e4a69a607ea`, an der gelesenen Datei bestätigt |
| Lizenz / Python | AGPL-3.0-only / Python ab 3.9 laut `pyproject.toml`; Debian der Probe hat Python 3.13.5 |
| Standardablage | `~/.local/share/fristenrechner/gradlew-fdroid/c7227d147483979bb5c408048cee3533a8814fb0/gradlew.py` |

`XDG_DATA_HOME` ersetzt bei Bedarf `~/.local/share`. Das Einrichtungsskript erlaubt ausschließlich Ziele innerhalb des Benutzerordners. Die Datei mit dem Namen `gradlew-fdroid` ist im gelesenen Repository ein Verweis auf `gradlew.py`; ihr Inhalt von zehn Bytes ist nicht das Programm.

Die Lizenz betrifft hier ein Werkzeug des Builds, nichts Ausgeliefertes: Der gelesene Quelltext startet Gradle als eigenen Prozess und enthält keinen Schritt, der seine eigenen Dateien in die APK aufnimmt. Der Inhalt einer mit diesem Werkzeug erzeugten APK ist damit noch nicht untersucht. Es wird keine Kopie des fremden Programms in dieses Repository übernommen.

### Verhalten laut Quelltext

1. Jeder normale Programmaufruf versucht, die Prüfsummendaten des Projekts `gradle-transparency-log` zu aktualisieren. Die Quellen werden der Reihe nach versucht: `https://gitlab.com/fdroid/gradle-transparency-log/-/raw/master/checksums.json`, `https://fdroid.gitlab.io/gradle-transparency-log/checksums.json`, `https://raw.githubusercontent.com/f-droid/gradle-transparency-log/master/checksums.json`.
2. Die Datei wird als `gradle_checksums.json` gespeichert, der HTTP-ETag als `etag`. Bei vorhandenem ETag wird `If-None-Match` gesendet; HTTP 304 führt zur Wiederverwendung des Bestands. Die JSON-Daten ergänzen und überschreiben eingebaute Prüfsummen. Gradle 8.14.5 steht nicht in der eingebauten Liste. Ohne passende nachgeladene oder zwischengespeicherte Prüfsumme lässt sich diese Version nicht neu laden.
3. Der Quelltext prüft keine Signatur dieser JSON-Datei. Die Aussage der Projekt-README über signierte Daten ist durch das gelesene Programm nicht belegt. HTTPS und die anschließende Archiv-Prüfsumme sind die dort sichtbaren Prüfungen.
4. Die Version kommt zuerst aus `--gradle-version`, sonst aus `distributionUrl` in `gradle-wrapper.properties` im Startordner oder einem seiner beiden Elternordner. Danach folgen die Zuordnung aus der Android-Gradle-Plugin-Version beziehungsweise `gradleVersion` in `build.gradle` oder `build.gradle.kts`. Die lokale Probe behält die Wrapper-Properties mit 8.14.5. Sie übergibt keine zusätzliche Versionsoption; das Programm reicht seine Argumente auch an Gradle weiter.
5. Geladen wird `https://downloads.gradle.org/distributions/gradle-<Version>-bin.zip`, für diese Probe also `gradle-8.14.5-bin.zip`. Vor dem Entpacken wird SHA-256 mit dem ermittelten Wert verglichen, auch bei einem bereits zwischengespeicherten ZIP. `distributionSha256Sum` aus den Wrapper-Properties wertet das Programm nicht aus.
6. Ablage ist `CACHEDIR`, sonst der von `platformdirs` ermittelte Benutzer-Cache, ohne dieses Modul `~/.cache/gradlew-fdroid`. ZIP und Prüfsummendaten bleiben dort; entpackt wird nach `versions/<Version>`. Ein bereits vorhandener Versionsordner wird ohne erneute Archiv- oder Inhaltsprüfung verwendet.

Der lokale Ablauf setzt `cachedir` in `config.yml` auf den neuen Ordner `fdroid-cache` des jeweiligen Laufs. fdroidserver 2.4.2 übergibt diesen Wert als `CACHEDIR` an seine Unterprozesse; `gradlew.py` übernimmt ihn. Die Protokolle von Lauf 2 bis 4 nennen genau diesen Cache und starten daraus `versions/8.14.5/bin/gradle`. Die in Lauf 2 und 3 zusätzlich gesetzte Umgebungsvariable für `gradlew-cache` hatte dort keine Wirkung und ließ die nachträgliche Archivprüfung am falschen Ort suchen. Ab Lauf 4 entfällt diese zusätzliche Variable.

Nach dem Build vergleicht das Skript `fdroid-cache/gradle-8.14.5-bin.zip` mit der festgelegten `bin`-Prüfsumme in `toolchain.json` und schreibt Pfad, Größe und SHA-256 nach `gradle-archiv.json`. Das ist ein zusätzlicher Nachweis nach der Ausführung, keine vorgeschaltete Prüfung durch `gradlew.py`. Innerhalb eines Laufs kann Gradle mehrfach gestartet und der entpackte Stand wiederverwendet werden. `gradle_checksums.json` und gegebenenfalls `etag` liegen ebenfalls unter `fdroid-cache`. Die Gradle-Abhängigkeiten liegen getrennt unter `gradle-home`. Ihre SHA-256-Prüfsummen sind seit dem 2026-10-05 in `app/android/gradle/verification-metadata.xml` erfasst, einschließlich der Linux-Variante von aapt2 und der Metadaten; Signaturen werden nicht geprüft. Umfang, IDE-Ausnahmen und Pflege stehen unter [Gradle-Prüfsummen](toolchain.md#gradle-prüfsummen). Der lokale F-Droid-Lauf mit frischem Gradle-Home und aktiver Prüfung bestand nach der Ergänzung vom 2026-10-15; siehe [Lauf am eingefrorenen Stand](#lauf-am-eingefrorenen-stand-vom-2026-10-15). Die früheren F-Droid-Läufe bis zum 2026-10-04 entstanden ohne diese Datei; ein Abgleich ihrer Cacheliste ersetzt diesen Build-Nachweis nicht.

### Einrichtung und Prüfung

| Aufruf aus der Repository-Wurzel | Wirkung |
|---|---|
| `bash scripts/gradlew-fdroid-einrichten.sh --probelauf` | Zeigt Commit, Quelle, Prüfsumme und Ziel; kein Download, kein neuer Ordner, kein Programmstart. Einen vorhandenen Stand prüft es. |
| `bash scripts/gradlew-fdroid-einrichten.sh` | Lädt ausschließlich die festgehaltene `gradlew.py` über HTTPS, prüft SHA-256, legt sie ausführbar im Benutzerbereich ab. Installiert nichts im System und startet das Programm nicht. |
| `bash scripts/gradlew-fdroid-einrichten.sh --nur-pruefen` | Prüft Bestand, reguläre Datei, Prüfsumme und unter Linux das Ausführungsrecht. Fehlender oder abweichender Stand scheitert ohne Download. |

Die Werte liest der Python-Kern aus `scripts/toolchain.json`. Eine vorhandene Datei oder ein vorhandener Commit-Ordner wird nie ersetzt, auch kein leerer Ordner. Der eigene Ordner `einrichten-*` bleibt nach Erfolg oder Fehler erhalten. Am 2026-09-29 lief die Einrichtung unter Debian erfolgreich: 23 977 Bytes, SHA-256 wie oben, Rückgabewert 0. Der anschließende Aufruf mit `--nur-pruefen` bestätigte den Bestand ohne Download, ebenfalls mit Rückgabewert 0 (`linux-28-lauf1.log`).

## Lokales Rezept für die Minimal-App

`scripts/fdroid/de.baremos.fristenrechner.probe.yml` ist eine Vorlage in JSON-Schreibweise, die zugleich gültiges YAML ist. Sie gilt nur für die Minimal-App `d27fb91`, Version 1.0 (1), App-ID `de.baremos.fristenrechner.probe`. Das Ablaufskript löst den kurzen Commit gegen das lokale Git-Repository auf, prüft App-ID, Version und Wrapper-Properties aus diesem Commit und schreibt ein konkretes Rezept mit voller Commit-ID und `file://`-Quelle. Änderungen im Arbeitsbaum werden nicht übernommen.

Aufruf unter Debian: `bash scripts/fdroid/minimal-app-bauen.sh --repo "$HOME/fdroid-probe/skript/minimal-app"`. Mit `--probelauf` werden Quelle und Rezept geprüft und angezeigt; F-Droid wird nicht gestartet, nichts geladen und kein Lauf angelegt. Die tatsächlichen Werkzeugstände prüft der echte Lauf vor dem Build. Vorgabe für die Läufe ist `~/fdroid-probe/build-laeufe`, abweichend `--arbeitsordner <Ordner>`. Der Arbeitsordner darf die Quelle weder enthalten noch in ihr liegen. `--jdk` wählt das vorhandene OpenJDK 21; Node und SDK folgen ihren Standardablagen unter `XDG_DATA_HOME`.

Jeder echte Lauf bekommt einen neuen Ordner `lauf-*`, neue npm-, Gradle- und F-Droid-Caches, eine eigene Konfiguration und ein zusammengeführtes `build.log`. Die Konfiguration setzt `gradle` auf die geprüfte `gradlew.py`. Die Versionen von fdroidserver, Node und npm, das gewählte JDK und das vorhandene SDK werden vorab geprüft. Es gibt keine Installation im System, keine automatische SDK-Einrichtung und keine Bereinigung alter Läufe. Auch die Skripte löschen keine angegebenen Ordner. F-Droid darf seinen eigenen neuen Klon bearbeiten; dort entfernt sein Scanner beispielsweise den eingecheckten Gradle-Wrapper.

Der Laufordner wird außerdem zu einem eigenen Git-Repository; nur das Rezept unter `metadata/<App-ID>.yml` wird dort eingecheckt. Autor- und Commitzeit entsprechen dem Commit der gebauten App, hier Unix-Zeit `1790607692`. Das ist für fdroidserver 2.4.2 vor dem ersten Holen der Quelle nötig: `common.get_source_date_epoch` findet den Bauordner noch nicht und greift auf den letzten Commit des Rezepts zurück. Ohne dieses Repository liefert die Funktion keinen Zeitwert; `set_FDroidPopen_env` bricht dann beim Setzen von `SOURCE_DATE_EPOCH` ab. Der Quelltextauszug in `fdroid-quelle-lesen.log` und der Übergang von Lauf 1 zu Lauf 2 belegen diesen Ablauf.

Die Vorbereitung läuft wie bei den am 2026-09-28 gelesenen Capacitor-Rezepten vor dem Scanner: `npm ci --ignore-scripts --no-audit --no-fund`, Web-Build, lokales `cap sync android`. Es wird kein `npx` verwendet. `npm ci` lädt und installiert Pakete ausschließlich in diesen Build-Klon; Installationsskripte bleiben abgeschaltet. Tests werden hier nicht ausgeführt. Das Lockfile und zwei Dateiinventare vor und nach dem Web-Build werden im Lauf aufbewahrt. Die Inventur sucht Endungen sowie ELF und WASM am Dateianfang, hält Größe und SHA-256 fest und scheitert bei Lesefehlern. Sie ist keine vollständige Erkennung eingebetteten WASM in JavaScript.

Der normale Aufruf hat weder `scanignore` noch `scandelete`. Für den ausdrücklich bezeichneten Vergleich gibt es `--versuch-scandelete`: Nur dessen erzeugtes Rezept erhält `scandelete: [node_modules]`, entsprechend dem Muster der gelesenen Capacitor-Rezepte. Das war ein Versuch zu F5 vor deren Festlegung, keine Regel für die App. Der Scanner entfernt dabei nur erkannte beanstandete Dateien, nicht den ganzen Ordner. Eingebettetes WASM kann übrig bleiben. Die drei Gradle-Dateien von Capacitor Android, Filesystem und Share müssen nach dem Scanner noch vorhanden sein; sonst bricht der Build ab. Die vollständigen Android-Quellen werden weiterhin vom Scanner erfasst.

### Auswertung und Grenzen

`build-auswerten.py` liest den Rückgabewert, `lauf.json`, `build.log` und `unsigned/de.baremos.fristenrechner.probe_1.apk`. Rückgabe 0 allein reicht nicht. Der erwartete Commit und die Kennzeichnung `scandeleteVersuch` stammen aus `lauf.json`. Die Erfolgsmeldung muss neben App-ID und Version genau diesen vollen Commit nennen. Auch Scanner-Beginn, `success: <App-ID>`, `Finished` und `1 build succeeded` gehören zum vollständigen Nachweis; sie müssen in der erwarteten Reihenfolge stehen. Nach dem Abschluss sind nur die beobachteten DEBUG-Meldungen zum deaktivierten Bereitstellen der Buildprotokolle zulässig.

Die bekannten Meldungen stehen einzeln in [`scripts/fdroid/bekannte-meldungen.json`](../scripts/fdroid/bekannte-meldungen.json) neben der Auswertung. Diese eigene Datendatei hält für jeden Meldungstyp das vollständige Muster, die Höchstzahl je Lauf, den Kontext, die Herkunft, den Grund und das Beobachtungsdatum fest. Die Auswertung verwendet die Muster als vollständigen Zeilenvergleich; zusätzliche Kontextprüfungen bleiben im Skript. Die Liste ist bei jeder Änderung an Abhängigkeiten zu prüfen.

| Bekannte Meldung / enges Muster | Höchstens je Lauf | Herkunft | Grund | Beobachtet |
|---|---|---|---|---|
| `NoSuchPathError: build/<App-ID>`; nur vor dem ersten Holen des erwarteten Commits, ohne Folgezeilen | 1 | fdroidserver 2.4.2, Ermittlung von `SOURCE_DATE_EPOCH` | Der Bauordner fehlt noch; der Rezept-Commit liefert den Zeitpunkt. | 2026-09-29 |
| `WARNING: Using flatDir should be avoided because it doesn't support any meta-data formats.` | 4; je einmal für `:app` und `:capacitor-cordova-android-plugins` in `clean` und `assembleRelease` | Gradle, Android-Vorlage von Capacitor 8.5.2 | Die Vorlage verwendet `flatDir`; die fehlenden Metadaten verhindern den beobachteten Build nicht. | 2026-09-29 |
| `npm warn deprecated uuid@7.0.3: …`; kompletter Wortlaut einschließlich Jahreszahl 2028 festgelegt | 1, nur im `prebuild` | npm, Abhängigkeit `uuid` 7.0.3 der Minimal-App | Veraltet-Markierung genau dieser Paketversion; Installation und Build laufen damit durch. | 2026-09-29 |
| `Warning: SDK processing. This version only understands SDK XML versions up to 3 but an SDK XML file of version 4 was encountered. …`; kompletter Wortlaut festgelegt | 1, nur in `assembleRelease` | Android-Gradle-Plugin 8.13.0; bekannte Einschränkung 8 in [toolchain.md](toolchain.md#bekannte-einschränkungen) | Paketbeschreibungen in Format 4 treffen auf einen Leser bis Format 3; der Build läuft durch. | 2026-09-29 |
| `FilesystemPlugin.kt:335:31 'fun downloadFile(call: PluginCall): Unit' is deprecated. Use @capacitor/file-transfer plugin instead.` | 1, nur im Task `:capacitor-filesystem:compileReleaseKotlin` in `assembleRelease` | Plugin-Quelltext `@capacitor/filesystem` 8.1.3 | Das Plugin verwendet seine veraltete Methode; die Stelle gehört nicht zum Projektcode. | 2026-09-29 |
| `LegacyFilesystemImplementation.kt:66:29 Java type mismatch: inferred type is 'String?', but 'String' was expected.` | 1, nur im Task `:capacitor-filesystem:compileReleaseKotlin` in `assembleRelease` | Plugin-Quelltext `@capacitor/filesystem` 8.1.3 | Der Compiler meldet im Plugin einen Typ, der leer sein kann, wo ein fester erwartet ist; die Stelle gehört nicht zum Projektcode. | 2026-09-29 |

Bei Kotlin ist der vollständige Dateipfad ab `node_modules/@capacitor/filesystem/android/src/main/kotlin/com/capacitorjs/plugins/filesystem/` festgelegt; nur der absolute Pfadanfang darf wechseln. Außerdem muss `prebuild` die Plugin-Version 8.1.3 ausweisen. Andere Dateien, Zeilen, Spalten, Versionen und Wortlaute erhalten keine Ausnahme.

JSON-Bericht und Konsolenausgabe nennen jeden bekannten Meldungstyp mit seiner Zahl, auch mit 0. Einzelne Fundstellen behalten Zeile und Kontext. Fehlende bekannte Meldungen sind zulässig; jede Überschreitung der Höchstzahl ist eine Beanstandung und bleibt vollständig gezählt. Andere Warnungen, Fehler, Tracebacks, `BUILD FAILED` und unbekannte Zeilen ohne Kopf bleiben Beanstandungen. Das gilt auch für andere veraltete npm-Pakete und andere Kotlin-Warnungen. Entfernte Dateien werden mit Ort aufgeführt; ein Lauf mit Scanner-Löschungen kann nur als ausdrücklich gekennzeichneter `scandelete`-Versuch bestehen.

Die APK muss regulär, nicht leer und ein konsistentes ZIP mit `AndroidManifest.xml` und `classes.dex` sein. Größe und SHA-256 stehen mit Beanstandungen, bekannten Meldungen und entfernten Dateien in `auswertung.json`; vorhandene Berichte werden nicht überschrieben. Das Protokollformat ist an den vier Läufen vom 2026-09-29 mit fdroidserver 2.4.2 geprüft. Die ZIP-Prüfung ersetzt weder die Android-Prüfung von F-Droid noch Signaturprüfung, Vergleich der APK oder Reproduzierbarkeitsnachweis. Die Pfadprüfungen schützen vor Versehen, nicht vor einem gleichzeitigen Austausch durch Prozesse desselben Benutzers.

Die variablen Pfadteile der normalen Ausgabeformen verwenden `PFAD = [A-Za-z0-9_./@%+-]+`: ASCII-Buchstaben, Ziffern und die genannten Pfadzeichen, ohne Leerraum, Doppelpunkt oder Steuerzeichen. In den vier echten Debian-Protokollen wurden dafür nach Entfernung der SGR-Farbcodes 0, 9, 23 und 23 Zeilen geprüft, einschließlich `DEBUG: > …/gradlew.py` und `Removing … at …`. Die Inventar-Aufrufe enthalten jeweils zwei Pfade; insgesamt sind es 61 Pfadwerte in 55 Zeilen. Keiner enthält Leerraum oder Steuerzeichen. Die Pfade werden dort ungequotet ausgegeben; die festen Argumenttrenner und Dateiendungen bleiben Teil des vollständigen Zeilenmusters. So kann ein Pfadplatzhalter weder weitere Shell-Argumente noch einen durch Leerraum oder Doppelpunkt abgesetzten Warnungstext aufnehmen. Diese Einschränkung gilt für die belegten Debian-Ausgaben, nicht für beliebige Dateinamen anderer Buildumgebungen. Bekannte Kotlin-Warnungen behalten ihr gesondertes Muster in `bekannte-meldungen.json`.

Beanstandungen behalten ihren vollständigen Grund und Wortlaut. Direkt dargestellt werden druckbares ASCII und die sechs Nicht-ASCII-Zeichen der bekannten Ausgabeformen: `ä`, `μ` (U+03BC), `─`, `├`, `✓` und `✔`. Alle anderen Zeichen sowie Backslashes erscheinen als sichtbare Escape-Folgen; Rand-Leerzeichen als `\x20`. So bleibt etwa `µ` (U+00B5, dargestellt als `\xb5`) vom erwarteten `μ` unterscheidbar. Beanstandete Rohzeilen werden ohne `strip()` dargestellt. Nur LF und CRLF trennen Zeilen; einzelne CR, VT, FF und andere Steuer- oder Trennzeichen bleiben Teil der Zeile. INFO- und DEBUG-Kopftexte müssen nach `str.isprintable()` druckbar sein, sonst werden sie mit sichtbaren Escape-Folgen beanstandet. Nur tatsächlich leere Zeilen werden übersprungen; bei Folgezeilen werden davor SGR-Darstellungscodes entfernt. Für die Ausnahmen vor dem Holen der Quelle und nach dem Abschluss zählen nur unverändert leere Folgezeilen als leer. Reine Leerraumzeilen bleiben damit prüfpflichtig. Die numerischen Zeilenmuster verwenden durchgehend `[0-9]`, damit nur ASCII-Ziffern gelten.

Zu sichern sind der ganze Laufordner, `lauf.json`, Rezept, Konfiguration, `rueckgabe.json`, `build.log`, `auswertung.json`, Lockfile, beide npm-Inventare, Gradle-Prüfsummendaten samt ETag und `gradle-archiv.json`. Ein fehlgeschlagener Lauf bleibt genauso erhalten. Die vollständige Umgebung und der Programmstand der Skripte gehören in das Begleitprotokoll. Als Vergleichswert aus dem Build ohne F-Droid dient die oben genannte unsignierte APK mit SHA-256 `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350`.

### Dauerformate der festgelegten Werkzeuge

Am 2026-09-29 direkt an den vorhandenen lokalen Quellen unter Windows geprüft, ohne Download. Astro und Vite stammen aus `node_modules` einer Installation mit Versionen und Paket-Integrity nach dem Lockfile des Repositorys auf Stand `4c66c04`. Capacitor ist auf diesem Stand keine Abhängigkeit des Repositorys; seine Quellen stammen aus der vorhandenen separaten Minimal-App-Installation (`@capacitor/cli` 8.5.2, `@ionic/cli-framework-output` 2.2.8, jeweils `package.json:3`). Die npm-Quellen stammen aus der mit Node.js 24.21.0 für Windows ausgelieferten npm-Installation. Die Gradle-Quellen liegen im vorhandenen entpackten Archivbaum `gradle-8.14.5-all`, Unterordner `gradle-8.14.5`. Die folgenden Gradle-Pfade beginnen dort, npm-Pfade an der npm-Paketwurzel und alle übrigen Pfade am jeweiligen `node_modules`-Ordner.

Der Abgleich mit den gesicherten Debian-Nachweisen ergibt: Das Lockfile der lokalen Minimal-App und die Lockfiles der Läufe 2 bis 4 sind bytegleich (SHA-256 `ebb1c446a701eef0f560cb1682ced382d4a6bb0925361b4edfe9dd6b0b897ed9`). Für Astro 7.3.3, Vite 8.3.0, Capacitor CLI 8.5.2 und `@ionic/cli-framework-output` 2.2.8 stimmen Version und Paket-Integrity der jeweils gelesenen Installation laut `node_modules/.package-lock.json` mit diesem Lockfile überein. Astros `dist/core/build/util.js` und Vites `dist/node/chunks/node.js` sind außerdem zwischen der Repository-Installation und der lokalen Minimal-App bytegleich. Das belegt die Paketzuordnung, nicht einen Hashvergleich der installierten JavaScript-Dateien mit Debian.

Die beiden Node-Archive liefern npm 11.19.0: für Windows nach `npm/package.json:2`, für Linux nach dem gesicherten Einrichtungsprotokoll `node-einrichten-lauf.log:21–22` (nicht im Repository). `scripts/fdroid/build-lokal.py:184–187` prüft Node.js und npm vor jedem echten Build gegen `scripts/toolchain.json:4,15`. Die unter Windows gelesene npm-Kopie enthält ms 2.1.3; die Dateien dieser Bibliothek wurden nicht unmittelbar mit der Linux-Installation verglichen. Bei Gradle gilt ebenfalls eine Grenze: Die Quelle stammt aus `8.14.5-all`, der Debian-Build verwendet `8.14.5-bin`. Das gesicherte `gradle-archiv.json` von Lauf 4 belegt für `bin` 138 068 841 Bytes und die SHA-256 aus `scripts/toolchain.json:27`; die lokale Wrapper-Konfiguration nennt für `all` die Prüfsumme aus `scripts/toolchain.json:26`. Das lokale `all`-Archiv liegt nicht mehr vor; vorhanden sind der entpackte Baum, die Abschlussdatei `.ok` und die Sperrdatei `.lck` des Wrappers. Die Prüfsumme des Archivs und die Bytegleichheit der Klassen zwischen `all` und `bin` wurden bei dieser Prüfung nicht erneut nachgewiesen. Die Muster stützen sich daher auf die festgelegten gleichen Werkzeugversionen, den gelesenen Quelltext und die Ausgaben der vier Debian-Läufe.

| Werkzeug / Ausgabe | Formen und Grenzen je Einheit | Muster in `build-auswerten.py` | Bewusste Obermenge | Quellbeleg mit Zeile |
|---|---|---|---|---|
| Gradle 8.14.5, `BUILD SUCCESSFUL in` | Ganze `0`–`999ms`; danach `1`–`59s`, `1`–`59m` mit optional `1`–`59s`, oder Stunden ab `1h` mit optional Minuten und Sekunden je 1–59. Nullkomponenten entfallen, keine führenden Nullen; Stunden werden nicht in Tage umgerechnet. | `DAUER_GRADLE` | Ja: Stunden | `src/time/org/gradle/internal/time/TimeFormatting.java:44–63`; Auswahl des Formatters in `src/core/org/gradle/internal/buildevents/BuildLogger.java:62`, Delegation in `src/logging/org/gradle/internal/logging/format/TersePrettyDurationFormatter.java:24–25`, Ausgabe in `src/core/org/gradle/internal/buildevents/BuildResultLogger.java:70–76` |
| npm 11.19.0, `added … packages in` | Ganze `0`–`999ms`, `1`–`60s`, `1`–`60m`, `1`–`24h`, Tage ab `1d`; jeweils auch negativ, ausgenommen `-0ms`. Keine führenden Nullen; gerundete `60s`, `60m` und `24h` sind vor dem Einheitenwechsel möglich. | `DAUER_NPM` | Ja: Tage | ms 2.1.3: `node_modules/ms/index.js:113–127`; Aufruf in `lib/utils/reify-output.js:219–220` |
| Astro 7.3.3, `Generated`, `Completed in`, Route und `page(s) built in` | Ganze `0`–`1000ms`; Sekunden `1.00`–`60.00s` mit genau zwei Nachkommastellen; ab einer Minute `Minutenm Sekundens` mit ganzem Sekundenrest 0–60. Keine führenden Nullen; `1m 0s` und der gerundete Rest `1m 60s` sind möglich. | `DAUER_ASTRO` | Ja: Minuten | `astro/dist/core/build/util.js:1–10`, insbesondere Millisekundenrundung in :3–4; Aufrufe in `astro/dist/core/sync/index.js:148`, `astro/dist/core/build/index.js:144,225–232`, `astro/dist/core/build/static-build.js:71`, `astro/dist/core/build/generate.js:225,249,459–461` |
| Vite 8.3.0, `✓ built in` | Ganze `0`–`999ms` sowie negative ganze Millisekunden; Sekunden `1.00`–`60.00s` mit genau zwei Nachkommastellen; Minuten ab `1m`, optional mit ganzem Sekundenrest 1–59. Keine führenden Nullen oder `-0ms`. Gerundete 60 Restsekunden werden in Minuten übertragen, Nullsekunden entfallen. | `DAUER_VITE` | Ja: negative Millisekunden, Minuten | `vite/dist/node/chunks/node.js:3019–3027`; Aufruf und Zeitmessung in derselben Datei:34079–34084 |
| Capacitor 8.5.2, Aufgaben mit `✔` | Genau zwei Nachkommastellen: `0.00`–`1000.00μs`, `1.00`–`1000.00ms`, Sekunden ab `1.00s`. `1000.00` in μs und ms entsteht durch Rundung; keine führenden Nullen oder negativen Werte. μ ist U+03BC. | `DAUER_CAPACITOR` | Ja: Sekunden | `@ionic/cli-framework-output/dist/utils.js:28–37`, Ausgabe in `@ionic/cli-framework-output/dist/output.js:22,45`; angebunden über `@capacitor/cli/dist/common.js:174–179` und `@capacitor/cli/dist/log.js:5,12` |
| Capacitor 8.5.2, `Sync finished in` | `0s`, positive oder negative ganze Sekunden oder ein bis drei Nachkommastellen; bei einem Bruchteil ist die letzte Nachkommastelle 1–9. Keine führenden Nullen, kein `-0s`, keine überflüssigen Endnullen oder Dezimalpunkte. | `DAUER_SYNC` | Ja: Sekunden | `@capacitor/cli/dist/tasks/sync.js:25–32`: Differenz ganzzahliger `Date`-Werte geteilt durch 1000, anschließend direkte Umwandlung in Text, ohne `toFixed` |

**Bewusste Abweichung von „sonst nichts zusätzlich“:** Nur die jeweils oberste Einheit, negative Vite-Millisekunden und der ganzzahlige Teil der Sync-Sekunden bleiben als kanonische Dezimalzahlen ohne Maschinen- oder Uhrhöchstwert zugelassen. Auch die bei extremen Zahlen entstehenden Lücken durch die begrenzte Genauigkeit von JavaScript `Number` werden nicht nachgebildet. Eine vollständige Kopplung von Uhrbereich, Ganzzahlgrenze und Gleitkommarundung würde unverhältnismäßig lange Muster erfordern. Die Abweichung betrifft ausschließlich solche Maschinenzahlgrenzen; Einheitenwechsel, Vorzeichen, Nullformen, führende Nullen, Nachkommastellen und Textzusätze bleiben wie beschrieben begrenzt. Die Tabelle behauptet damit keine exakte Erzeugbarkeit jeder beliebig großen Maschinenzahl. In den begrenzten Einheitenbereichen besteht keine bewusste Obermenge.

Die zentralen Muster werden in die bekannten Ausgabezeilen eingebettet. `DAUER_MS` teilt die Millisekundenform 0–999 von Astro und Vite, `DAUER_S60` die Sekundenform 1.00–60.00; Astro erlaubt zusätzlich genau `1000ms`. `DAUER_REST` begrenzt Minuten-/Sekundenreste auf 1–59. Ein einziges Muster mit allen Einheiten für jedes Werkzeug wäre zu weit gefasst. Kontextprüfung und `fullmatch` der vollständigen Zeile bleiben erhalten. Die Grenzen, Nullformen und Rundungsübergänge jeder Tabellenzeile werden je Werkzeug mit gültigen Randwerten und unmittelbar benachbarten Gegenfällen geprüft.

npm, Vite und Capacitor-Sync messen mit der Kalenderuhr; bei deren Rückstellung können negative Werte entstehen. Zugelassen sind deshalb auch negative ganze npm-Dauern, negative Millisekunden bei Vite und negative Sekunden beim Sync. Astro verwendet `performance.now()` (`astro/dist/core/build/index.js:2,77,144`), Capacitor-Aufgaben verwenden `process.hrtime()` (`@ionic/cli-framework-output/dist/tasks.js:42,67`). Gradle begrenzt den Start auf die aktuelle monotone Uhr (`src/core/org/gradle/internal/service/scopes/CoreBuildSessionServices.java:153–155`, `src/time/org/gradle/internal/time/MonotonicClock.java:109–117`). Für diese drei Ausgaben bleiben negative Dauern ausgeschlossen. Die Tests prüfen je Ausgabe alle Formatklassen und Rundungsgrenzen sowie andere Einheiten, zusätzliche Texte direkt nach der Dauer, Warnungen in derselben Zeile und einen falschen Kontext.

## Vier lokale Läufe am 2026-09-29

Die Läufe erfolgten in Debian 13.5 unter WSL 2 mit fdroidserver 2.4.2-1, Python 3.13.5, Node.js 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Gradle 8.14.5, Android-Gradle-Plugin 8.13.0 und den Build-Tools 35.0.0. Gebaut wurde ausschließlich die Minimal-App `de.baremos.fristenrechner.probe`, Version 1.0 (1), Commit `d27fb91d6584822b4803ac30cf79f9e1049e9a38`. Ihr Lockfile nennt Astro 7.3.3, Capacitor 8.5.2, Filesystem 8.1.3 und Share 8.0.2.

| Lauf | Ablauf und beobachtetes Ergebnis | Rückgabewert von `fdroid build` |
|---|---|---|
| 1 | Kein Git-Repository im Laufordner. Vor dem Holen der Quelle Abbruch in `set_FDroidPopen_env`: `TypeError: str expected, not NoneType`. Scanner nicht erreicht, keine APK. | 0 |
| 2 | Rezept im Laufordner eingecheckt. Quelle geholt, `prebuild` und `Cleaning Gradle project` mit `BUILD SUCCESSFUL`; anschließend zehn Scannerfehler unter `node_modules`, `1 build failed`, keine APK. | 0 |
| 3 | Als `--versuch-scandelete` gekennzeichnet. Scanner entfernt die zehn beanstandeten Dateien und `android/gradle/wrapper/gradle-wrapper.jar`. Android-Build endet erfolgreich; die unsignierte APK ist bytegleich zu den Vergleichsbuilds ohne F-Droid unter Linux und Windows. | 0 |
| 4 | Rezept und Skripte auf Stand `75fa13f`, erneut mit `--versuch-scandelete`. Build gelungen, APK bytegleich zu Lauf 3; Gradle-Archiv unter `fdroid-cache` nachgewiesen. Auswertung mit `75fa13f`: eine Beanstandung zur Dauer `1.53s`; neu ausgewertet mit `4c66c04`: keine Beanstandung, neun bekannte Meldungen. | 0 |

Der erfolgreiche Abschluss von Lauf 3 lautet in `build.log`:

```text
INFO: Successfully built version 1.0 of de.baremos.fristenrechner.probe from d27fb91d6584822b4803ac30cf79f9e1049e9a38
INFO: success: de.baremos.fristenrechner.probe
INFO: Finished
INFO: 1 build succeeded
```

Damit ist auch für `fdroid build` in 2.4.2 belegt: Rückgabewert 0 unterscheidet diese Erfolge und Fehlschläge nicht. `BUILD SUCCESSFUL` beim Bereinigen in Lauf 2 ist ebenfalls kein Erfolg des App-Builds.

| Nachweis | Größe / SHA-256 |
|---|---|
| APK aus Lauf 3, `unsigned/de.baremos.fristenrechner.probe_1.apk` | 3 251 043 Bytes; `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350` |
| APK aus Lauf 4, gleicher relativer Dateiname | 3 251 043 Bytes; `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350` |
| Gradle-Archiv unter `fdroid-cache/gradle-8.14.5-bin.zip`, Archivnachweis aus Lauf 4 | 138 068 841 Bytes; `6f74b601422d6d6fc4e1f9a1ab6522f642c2fdcbc15ae33ebd30ba3d7198e854`, gleich `bin` in `scripts/toolchain.json` |
| Lockfile der Minimal-App, in Lauf 2 bis 4 bytegleich | 243 994 Bytes; `ebb1c446a701eef0f560cb1682ced382d4a6bb0925361b4edfe9dd6b0b897ed9` |
| Jeweils beide npm-Inventare aus Lauf 2 bis 4, alle sechs bytegleich | je 1 764 Bytes; `0990feb942ca3a534c8b81ac16d5761de9cda18e0ac5f3fde522802b0993eb7c` |

Die Archivprüfung des damaligen Ablaufskripts in Lauf 3 suchte unter `gradlew-cache`; deshalb meldete sie „Gradle-Nachweis fehlt“ und erzeugte kein `gradle-archiv.json`. Der tatsächliche Cacheort steht in `config.yml` und in den Ausgaben von `gradlew.py` in den Buildprotokollen von Lauf 2 bis 4. Der Archivhash zu Lauf 3 stammt aus der anschließenden Prüfung des Debian-Laufordners; das Archiv selbst gehört nicht zur hier ausgewerteten Kopie der Textnachweise. **Mit Lauf 4 ist die korrigierte Archivprüfung im echten Debian-Ablauf belegt:** `gradle-archiv.json` nennt `fdroid-cache/gradle-8.14.5-bin.zip`, 138 068 841 Bytes und die oben aufgeführte Prüfsumme `bin` aus `scripts/toolchain.json`.

Die ursprüngliche Auswertung von Lauf 4 mit `75fa13f` endete mit Rückgabewert 1: Als einzige Beanstandung blieb `16:30:00 [build] 1 page(s) built in 1.53s` (Zeile 65 des Buildprotokolls). Die erneute Auswertung mit `4c66c04` endete mit Rückgabewert 0, ohne Beanstandung und mit neun bekannten Meldungen aus den sechs aufgeführten Meldungstypen. Die gesicherte ursprüngliche `auswertung.json` bleibt unverändert; die erfolgreiche Neuauswertung ist separat in `linux-28-lauf4-auswertung.log` belegt (nicht im Repository). `75fa13f` und `4c66c04` bezeichnen die Stände der Rezeptskripte; gebaut wurde weiterhin die Minimal-App auf `d27fb91`.

Die damalige `auswertung.json` aus Lauf 3 enthält sieben Beanstandungen: die Warnung zum noch fehlenden Bauordner, viermal `flatDir`, den damals nicht erkannten Erfolgstext und den dadurch fehlenden Erfolgsmarker. Diese historischen Berichte bleiben unverändert. Die erneute Prüfung berücksichtigt zusätzlich die Warnungen ohne F-Droid-Kopf: npm meldet `uuid@7.0.3` als veraltet; das SDK meldet XML-Version 4 bei einem Leser bis Version 3; Kotlin meldet in Capacitor Filesystem die veraltete Methode `downloadFile` und eine Typabweichung `String?` gegenüber `String`. Die oben aufgeführte Liste begrenzt die bekannten Meldungen auf ihre genaue Herkunft und ihren Wortlaut.

Die frühere vollständige Auswertung der ersten drei Läufe am 2026-09-29 endete für Lauf 1 mit 31 Beanstandungen und für Lauf 2 mit 17 Beanstandungen, darunter dessen zehn Scannerfehler. Diese Zahlen schließen bei Lauf 1 und 2 jeweils die fehlende APK ein. Lauf 3 bestand mit Kennzeichnung `scandelete` ohne Beanstandung. Ohne Kennzeichnung scheiterte er mit einer Beanstandung wegen der elf Entfernungen durch den Scanner.

Mit den jetzt eingegrenzten Mustern wurden am selben Tag alle vier unveränderten Originalprotokolle erneut direkt mit `pruefe_protokoll` geprüft. Die Metadaten des jeweiligen Laufs liefern den erwarteten Commit und die Kennzeichnung `scandelete`; `fdroid build` hatte in allen vier Läufen Rückgabewert 0. Die reine Protokollprüfung ergibt:

| Lauf | Beanstandungen | Bekannte Meldungen | Entfernte Dateien | `scandelete` | Rückgabe der Einzelprüfung |
|---|---|---|---|---|---|
| 1 | 30 | 1 | 0 | nein | 1 |
| 2 | 16 | 4 | 1 | nein | 1 |
| 3 | 0 | 9 | 11 | ja | 0 |
| 4 | 0 | 9 | 11 | ja | 0 |

Diese erneute Protokollprüfung umfasst selbst keine APK-Prüfung; der zusätzliche APK-Nachweis für Lauf 3 ist unten ausgewiesen. Die APK aus Lauf 4 liegt in den hier verfügbaren gesicherten Dateien nicht vor; Größe und SHA-256 in der Nachweistabelle stammen aus dem damaligen Debian-Begleitprotokoll. Es wurde keine Ersatz-APK für diese Auswertung verwendet. Die frühere vollständige Auswertung und die jetzige Protokollprüfung sind deshalb getrennt ausgewiesen.

Lauf 3 weist neun bekannte Meldungen aus: einmal `NoSuchPathError`, viermal `flatDir`, einmal `uuid@7.0.3`, einmal die SDK-XML-Warnung, einmal `downloadFile` aus `FilesystemPlugin.kt:335:31` und einmal die Typabweichung aus `LegacyFilesystemImplementation.kt:66:29`. Die beiden Warnungen von Kotlin sind zwei verschiedene Meldungen an zwei Stellen desselben Plugins und stehen einzeln in der Liste. Gegenproben mit anderer Zeile, anderer Datei, anderem Wortlaut und mit einer Meldung zu oft scheitern.

Die echte APK aus Lauf 3 wurde zusätzlich mit `pruefe_apk` erneut geprüft, ohne Beanstandung und mit Rückgabewert 0: konsistentes ZIP mit `AndroidManifest.xml` und `classes.dex`, 3 251 043 Bytes, SHA-256 `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350`. Der Wert entspricht dem bisherigen Vergleichswert. Die Originalnachweise wurden nur gelesen, neue Berichte liegen im ausgeschlossenen lokalen Probeordner. Die APK wird nicht in das Repository übernommen. Automatische Tests erzeugen weiterhin kleine ZIP-Dateien und benötigen keine privaten Nachweise.

Beleggrundlage sind `linux-28-vorbereitung.log`, `linux-28-lauf1.log` bis `linux-28-lauf4.log`, `linux-28-lauf4-auswertung.log`, die zugehörigen `build.log`, `lauf.json`, `rueckgabe.json`, Rezepte, Konfigurationen, Inventare und Lockfiles sowie `fdroid-quelle-lesen.log`. Diese gesicherten Originalnachweise und Begleitprotokolle liegen nicht im Repository; das gilt auch für `gradle-archiv.json` aus Lauf 4. Öffentlich enthalten sind nur die unten genannten anonymisierten Testprotokolle. Die Vorbereitung der Skripte in Debian auf Stand `e6f959e` meldet 524 bestandene und sechs übersprungene Tests bei Rückgabewert 0; beide Probeläufe waren erfolgreich. Das ist der damalige Prüfstand, kein Testlauf der jetzt angepassten Skripte.

**Grenzen:** Minimal-App mit einer Seite, ein Rechner und ein Tag, lokale Builds mit fdroidserver 2.4.2 aus Debian. Kein Lauf auf dem Buildserver von F-Droid, keine Annahme durch F-Droid und kein Nachweis für das Rezept der späteren App. Der bytegleiche APK-Vergleich gilt nur für die genannten Eingaben und Umgebungen. Die Fassung des aktuellen Buildservers und seine Scanregeln sind damit nicht geprüft.

### Die zehn Scannerdateien als Beleg zu F5

Alle Pfade in der Tabelle liegen unter `node_modules/`. Lauf 2 meldet sie als Fehler, Lauf 3 als entfernt. Die Reihenfolge entspricht den Protokollen.

| Datei | Meldung des Scanners / Paketversion laut Lockfile |
|---|---|
| `@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6` | `shared library`; Paket 1.3.3 |
| `shiki/dist/onig.wasm` | `WebAssembly binary file`; Shiki 4.4.3 |
| `@astrojs/astro2tsx/astro2tsx.wasm32-wasi.wasm` | `WebAssembly binary file`; astro2tsx 0.1.0 |
| `@esbuild/linux-x64/bin/esbuild` | `binary`; esbuild 0.28.2 |
| `@capacitor/cli/assets/ios-pods-template.tar.gz` | `gzip file archive`; Capacitor CLI 8.5.2 |
| `@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz` | `gzip file archive`; Capacitor CLI 8.5.2 |
| `@capacitor/cli/assets/capacitor-cordova-ios-plugins.tar.gz` | `gzip file archive`; Capacitor CLI 8.5.2 |
| `@capacitor/cli/assets/ios-spm-template.tar.gz` | `gzip file archive`; Capacitor CLI 8.5.2 |
| `@capacitor/cli/assets/android-template.tar.gz` | `gzip file archive`; Capacitor CLI 8.5.2 |
| `xxhash-wasm/workerd/xxhash.wasm` | `WebAssembly binary file`; xxhash-wasm 1.1.0 |

Die zusätzliche Entfernung von `android/gradle/wrapper/gradle-wrapper.jar` gehört zur Behandlung des Gradle-Wrappers durch F-Droid; sie ist keiner der zehn npm-Funde.

## F5: Trennung nach dem aktuellen Lockfile

Dieser Abschnitt hält die Festlegung vom 2026-09-30 und ihre Nachweise fest. Seit dem 2026-10-23 gilt F5 nur noch für die lokalen Läufe mit `scripts/fdroid/build-lokal.py`; für das Veröffentlichungsrezept gelten die [Festlegungen E1 bis E10](#werkzeuge-aus-quelltext-23102026).

Erneut gelesen am 2026-09-30: Lockfile und installierte Quellen zum Stand `990eac6`. Capacitor Android, CLI und Core sind hinzugekommen; `exceljs` ist nicht mehr enthalten. Mit Astro gilt die frühere Aussage „nur Tests“ für Rolldown, Lightning CSS und es-module-lexer nicht mehr. Die Tabelle zeigt Abhängigkeitspfade und gelesene Verwendung; sie behauptet nicht, dass jeder Build jeden optionalen Programmteil ausführt. Lizenzangaben stammen aus dem Lockfile und ersetzen keine Prüfung eingebetteter Bestandteile. Die Paketliste des Versuchs steht maschinenlesbar in `scripts/fdroid/bereinigungsliste.json`.

| Paket, Version | Lizenzangabe | Verwendung im aktuellen Baum | Behandlung nach F5 |
|---|---|---|---|
| `@astrojs/compiler-binding-linux-x64-gnu` 0.4.1 | MIT | Astro 7.3.3 → compiler-rs → compiler-binding; Übersetzung von Astro | Für Web-Build; anschließend entfernen |
| `@esbuild/linux-x64` 0.28.2 | MIT | Astro → esbuild; Client-Direktiven und Umgebungsvariablen | Für Web-Build; anschließend entfernen |
| `@rolldown/binding-linux-x64-gnu` 1.2.9 | MIT | Astro → Vite 8.3.0 → Rolldown; auch Vitest → Vite | Build und Tests; anschließend entfernen |
| `lightningcss-linux-x64-gnu` 1.33.0 | MPL-2.0 | Astro/Vitest → Vite; CSS-Verarbeitung | Build und Tests; konkrete Nutzung je Build prüfen, anschließend entfernen |
| `es-module-lexer` 2.3.2 | MIT | Astro und Vitest; eingebettetes WASM | Build und Tests; ganzes entbehrliches Paket anschließend entfernen |
| `xxhash-wasm` 1.1.0 | MIT | Astro; Inhalts- und Font-Werkzeuge, WASM auch eingebettet | Nutzung im konkreten Build feststellen, anschließend entfernen |
| `@bruits/satteri-linux-x64-gnu` 0.10.5 | MIT | Astro → markdown-satteri → Satteri; bedarfsabhängige Markdown-Verarbeitung | Ohne Markdown Bedarf nicht belegt; spätestens anschließend entfernen |
| Shiki / `@shikijs/engine-oniguruma` 4.4.3 | MIT | Astro → Shiki; Syntaxfärbung mit WASM als Datei und eingebettet | Nutzung durch die App nicht belegt; beide Pakete nach Sync entfernen |
| `@img/sharp-linux-x64` 0.35.4 / `@img/sharp-libvips-linux-x64` 1.3.3 | Apache-2.0 / LGPL-3.0-or-later | Astro → optionales Sharp; Bildverarbeitung | Nach Web-Build und Sync entfernen; Ergebnis vergleichen |
| `@astrojs/astro2tsx` 0.1.1 | MIT | `@astrojs/check` → language-server; WASM | Nur Typprüfung; getrennt vom App-Build behandeln |
| Vitest / `@vitest/mocker` 4.1.11 | MIT | Testwerkzeuge; gebündeltes WASM und vorsorglich erfasste Ladeaufrufe | Tests gesondert ausführen; beide Pakete nach Sync entfernen, ebenso die geteilten nativen Werkzeuge |
| Vite 8.3.0 | MIT | Astro und Vitest; enthält eigene gebündelte WASM-Kopien von Lexer und xxhash | Nach Sync das ganze Paket entfernen |
| `@capacitor/cli` 8.5.2 | MIT | `cap sync`, enthält fünf vorgebaute Vorlagenarchive | Nach Sync das ganze Paket entfernen |
| `@capacitor/android` 8.5.2 | MIT | Java-Quellen und Gradle-Projekt für die Android-Hülle | Behalten: `node_modules/@capacitor/android/capacitor` ist derzeit der einzige von `--android-quellen` genannte Ordner |
| `@capacitor/core` 8.5.2 | MIT | JavaScript-Brücke, vom Web-Build verarbeitet | Keine pauschale Entfernung; ausgelieferten Web-Anteil über das Manifest vergleichen |
| `prettier` 3.9.8 | MIT | Formatierer der Sprachwerkzeuge, Flow-Parser mit eingebettetem WASM | Ganzes Paket nach Sync entfernen |
| `undici` 8.10.2 | MIT | HTTP-Client der Entwicklungswerkzeuge mit eingebettetem llhttp-WASM | Ganzes Paket nach Sync entfernen |
| `@tybys/wasm-util` 0.10.4 | MIT | WASM-Ladehilfe von astro2tsx; Ladeaufrufe werden vorsorglich erfasst | Ganzes Paket nach Sync entfernen; der Treffer allein beweist kein eingebettetes Binärprogramm |
| `@emnapi/core` 1.11.3 | MIT | WASM-Ladehilfe der Entwicklungswerkzeuge | Ganzes Paket nach Sync entfernen; vorsorglicher Treffer von Ladeaufrufen |
| `node-fetch-native` 1.6.7 | MIT | HTTP-Werkzeug mit gebündeltem llhttp-WASM | Ganzes Paket nach Sync entfernen |

### Was die Inventare der Minimal-App zeigen

In Lauf 2 bis 4 enthalten die Inventare vor dem Web-Build und nach Web-Build plus `cap sync` jeweils dieselben zehn Dateien mit gleicher Größe und SHA-256. Fünf davon sind die oben aufgeführten Scannerfunde libvips, esbuild und die drei WASM-Dateien. Die übrigen fünf sind native Node-Bindungen:

| Datei unter `node_modules/` | Paketversion laut Lockfile |
|---|---|
| `@astrojs/compiler-binding-linux-x64-gnu/astro.linux-x64-gnu.node` | 0.4.1 |
| `@bruits/satteri-linux-x64-gnu/satteri_napi.linux-x64-gnu.node` | 0.10.5 |
| `@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.4.node` | 0.35.4 |
| `@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node` | 1.2.9 |
| `lightningcss-linux-x64-gnu/lightningcss.linux-x64-gnu.node` | 1.33.0 |

Für diese fünf `.node`-Dateien enthält Lauf 3 keine Entfernungsmeldung. Umgekehrt erfasst die Inventur die fünf `.tar.gz`-Archive nicht, die der Scanner beanstandet. Die Zahl zehn ist daher bei Scanner und Inventar zufällig gleich; die Mengen sind verschieden. Ein Inventar nach dem Scanner liegt nicht vor. Ebenso wenig beweist das unveränderte Inventar, welche Programme der Web-Build tatsächlich ausgeführt hat. Es belegt aber, dass Web-Build und `cap sync` die erfassten Werkzeuge nicht selbst wegräumen. Die Inventur erfasst außerdem nicht vollständig WASM, das in JavaScript eingebettet ist.

### Versuch und Festlegung

**Versuch freigegeben und durchgeführt am 2026-09-30.** Im `prebuild` nach Web-Build **und** `cap sync android` werden die entbehrlichen npm-Werkzeuge anhand einer geprüften Paketliste gezielt entfernt. Das umfasst auch ganze entbehrliche Pakete mit eingebettetem WASM, native `.node`-Dateien sowie CLI-Vorlagen. Die Java-Quellen und Gradle-Dateien von `@capacitor/android` bleiben erhalten. Filesystem und Share sind keine Abhängigkeiten der App; bei späteren Plugins muss die Liste erneut geprüft werden. Maßgeblich für die geschützten Ordner ist die Ausgabe von `node scripts/app-bauen.mjs --android-quellen`. Dass die zehn Scannerdateien nach `cap sync` für den Android-Build der Minimal-App entbehrlich sind, ist durch Lauf 3 belegt. Der entsprechende Nachweis für die gezielt bereinigte App liegt mit Variante (a) vom 2026-09-30 vor.

Ergänzendes `scandelete` wurde mit der App erprobt. Es ist beim beobachteten bereinigten Stand nicht nur entbehrlich: Der ungenutzte Eintrag lässt fdroidserver 2.4.2 den Build abbrechen. Scanner und Inventur bleiben unterschiedliche Prüfungen; der frühere Scannerlauf der Minimal-App erfasste etwa fünf `.node`-Dateien nicht. Auch ein erfolgreicher Lauf bietet keinen Vollständigkeitsnachweis für beliebig eingebettetes WASM. Unerwartete Löschungen müssen ins Review des Rezepts; eine pauschale `scanignore`-Ausnahme wird nicht vorgeschlagen.

| Variante | Bewertung anhand der Minimal-App und der drei App-Läufe |
|---|---|
| Nur `scandelete: [node_modules]` | Der Android-Build der Minimal-App gelingt; die Bereinigung erfasst aber nur die vom Scanner erkannten Dateien. |
| Nur gezieltes Löschen nach Web-Build und `cap sync` | App-Build erfolgreich und bytegleich zur Referenz; 43 Inventarfunde vor und 0 nach der Bereinigung sowie nach dem Scanner. Festlegung für F5; Liste und Build müssen bei Änderungen der Pakete erneut geprüft werden. |
| Gezielt löschen, ergänzend `scandelete` | App-Build abgebrochen: `Unused scandelete path: node_modules`. Kein APK-Nachweis für diese Variante. |

Die Inventare nach gezielter Bereinigung und Scanner sowie der Vergleich mit dem APK-Inhalt liegen für Variante (a) vor. Auf dieser Grundlage ist F5 am 2026-09-30 festgelegt: gezielte Bereinigung ohne `scandelete`. Das Rezept der App trägt deshalb keinen `scandelete`-Eintrag; die Variante mit `scandelete` bleibt nur als Vergleichslauf in der Laufsteuerung. Die lokalen Ergebnisse belegen keine Annahme durch F-Droid.

`--omit=dev` trennt diese Rollen nicht zuverlässig. `--omit=optional` entfernt auch benötigte Compiler- und Bundler-Pakete. Plattformpakete für macOS, Windows, musl und WASM-Ausweichpakete sind von tatsächlich unter Debian x64 verwendeten Programmen zu unterscheiden.

Die Minimal-App `d27fb91` hat ein anderes Lockfile: 488 Einträge mit `resolved`, nach `npm ci` 394 installierte Pakete. Beispielsweise enthält sie astro2tsx 0.1.0 statt 0.1.1 aus der ersten Tabelle. Die am 2026-09-29 untersuchte saubere Linux-Kopie des Paket-Repositorys hatte 321 installierte Pakete und 412 Fremdpakete laut Lizenzprüfung; sie war ebenfalls kein vollständiger App-Build. Die erste Tabelle darf deshalb nicht als beobachtete Paketliste der Minimal-App oder der inzwischen unter Debian gebauten Android-App gelesen werden.

## Rezept der App: Versuch vom 2026-09-30

Das eigene Rezept `scripts/fdroid/de.baremos.fristenrechner.yml` gilt für `de.baremos.fristenrechner`, Version `1.0.0` / Code `10000` (bis zum 2026-10-22 `0.2.0` / `200`, davor `0.1.0` / `100`), Kategorie `Calculator`, Unterordner `app/android/app`. Das Rezept der Minimal-App und ihre vier historischen Läufe bleiben unverändert. Dies ist weiterhin ein lokaler Nachweis mit fdroidserver 2.4.2; ein Veröffentlichungsrezept und die Annahme durch F-Droid sind damit nicht belegt.

App-ID, Version und Referenzwerte stehen gemeinsam in `scripts/fdroid/app-referenz.json`. Laufsteuerung und Auswertung lesen diese Datei; die Laufsteuerung setzt die Versionsplatzhalter der Rezeptvorlage vor der Verwendung ein. Eine neue App-Referenz erfordert damit eine Änderung an einer Stelle.

Die Referenz ist seit dem 2026-10-22 die ohne F-Droid gebaute unsignierte APK der Fassung 1.0.0: 7 668 710 Bytes, SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`, festgehalten mit `2a9ea85`. Sie entstand unter Windows nach `clean` am Release-Stand `7ec93f4` mit Node.js 24.21.0, npm 11.19.0 und JDK 21.0.8 (siehe [app.md, Build-Nachweis zur Fassung 1.0.0](app.md#build-nachweis-zur-fassung-100-vom-2026-10-22)). Gegenüber 0.2.0 haben sich an den ausgelieferten App-Inhalten Version und `versionCode`, Regelversion 1.9.1 und Rechtsstand 2026-10-22 („Oktober 2026“) im Kern mit Hinweis auf die Ausgabe 2026 und neuem Hinweis zu § 12 EU Abs. 3 Nr. 4 VOB/A (nur VOB/A-EU) sowie der Datenschutz-Stand geändert. Ohne Wirkung auf die APK sind Doku, Skripte, Tests, die Versionshinweise `changelogs/10000.txt` unter `fastlane/metadata/android/`, die Paketmanifeste 0.1.1 und das Lockfile (nur Versionsangaben der eigenen Workspaces, keine Fremdpakete). Der neue Lauf ist im Abschnitt [Lauf an der Referenz 1.0.0](#lauf-an-der-referenz-100-vom-2026-10-22) dokumentiert; der Lauf vom 2026-10-19 gilt für die vorige Referenz 0.2.0.

Die Referenz vom 2026-10-19 war die ohne F-Droid gebaute unsignierte APK der Fassung 0.2.0: 7 668 594 Bytes, SHA-256 `e9becd9f8106fc5dd85509d373c22993e3fb687283bb229f8ccf9be6ecc3452f`. Sie entstand unter Windows nach `clean` am Release-Stand `1f6d39f` mit Node.js 24.21.0, npm 11.19.0 und JDK 21.0.8 (siehe [app.md, Build-Nachweis zur Fassung 0.2.0](app.md#build-nachweis-zur-fassung-020-vom-2026-10-19)). Gegenüber der Referenz vom 2026-10-15 haben sich an den ausgelieferten App-Inhalten Version und `versionCode`, die Herausgeber-Zeile der App-Seite, der Schlussabschnitt des Datenschutztextes und die in der App angezeigte `NOTICE` (Rechtsname des Herausgebers) geändert; dazu kommen ohne Wirkung auf die APK die Paketmanifeste und READMEs der npm-Pakete, zwei Einträge der Gradle-Prüfsummendatei, `.gitattributes` und Skripte außerhalb des Builds. Der Lauf an dieser Referenz vom 2026-10-19 ist unten im Abschnitt [Lauf an der Referenz 0.2.0](#lauf-an-der-referenz-020-vom-2026-10-19) dokumentiert; der Lauf vom 2026-10-15 gilt für die davor verwendete Referenz.

Die Referenz vom 2026-10-15 war die ohne F-Droid gebaute unsignierte APK mit 7 668 430 Bytes, SHA-256 `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02`. Sie entstand unter Windows nach `clean` am Stand `8b17927`; eine frische Arbeitskopie mit Node.js 22.23.2 und npm 10.9.8 am Stand `97d07c2` mit denselben App-Eingaben ergab am selben Tag ebenfalls diese Datei. Gegenüber der Referenz vom 2026-10-03 (7 760 765 Bytes, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`, Stand `c7b5230`) haben sich App-Quellen, Lockfile, Paketmanifeste, die Gradle-Prüfsummendatei und die Bereinigungsliste geändert. Der Lauf erhält die tatsächliche Referenzdatei und prüft deren Größe und Prüfsumme; eine abweichende APK darf nicht stillschweigend als neue Referenz dienen.

### Vorbereitung, Bereinigung und Nachweise

Der `prebuild` installiert mit `npm ci --ignore-scripts --no-audit --no-fund`, sichert Lockfile und Inventar, baut Kern und Web und führt `cap sync android` aus. Die vorhandenen K1/K2-Prüfungen laufen über `app-bauen.mjs --web`; K3/K4 werden über dieselben exportierten Prüffunktionen wie in der vollständigen App-Kette ausgeführt. K3 vergleicht den Zustand unmittelbar vor und nach dem Sync, damit von F-Droid angelegte `local.properties` den Vergleich nicht verfälschen. Diese Wahl vermeidet einen zweiten Android-Build im `prebuild`. Git steht zur Verfügung, weil F-Droid in einem Klon arbeitet. Gradle startet später über das nach F2 festgehaltene `gradlew-fdroid`.

Nachtrag vom 2026-10-11: Mit dem Lockfile-Update wurden die drei sharp-Einträge der Bereinigungsliste auf `@img/sharp-linux-x64` 0.35.5, `@img/sharp-win32-x64` 0.35.5 und `@img/sharp-libvips-linux-x64` 1.3.4 angehoben; die Liste bindet Versionen exakt. Der [Lauf vom 2026-10-15](#lauf-am-eingefrorenen-stand-vom-2026-10-15) belegt die Liste und die Inventare am neuen Stand.

Vor der Bereinigung werden das Inventar nach Sync und ein Manifest aller Dateien unter `assets/public` gesichert. Die gezielte Bereinigung ermittelt die geschützten Quellordner mit `app-bauen.mjs --android-quellen`. Sie löscht ausschließlich geprüfte Pakete unter dem aufgelösten `node_modules` dieses Klons. Paketnamen, Versionen, Lizenzangaben, Build-Rollen und Gründe stehen in `bereinigungsliste.json`. Ein fehlendes Paket der für die Plattform geltenden Liste, abweichende Lockfile-Angaben, ein Löschziel mit geschützten Quellen oder ein nicht zugelassener Restfund lassen den Schritt scheitern. Die Paketliste ist keine Erlaubnis zum Löschen beliebiger vom Aufrufer angegebener Ordner.

Die Inventur erfasst native Dateien, ausführbare Binärformate, WASM und Archive anhand von Namen und Dateiköpfen. Bei JavaScript sucht sie zusätzlich nach WASM-Merkmalen wie Base64-Magic, Bytefolgen und Ladeaufrufen. Das ist eine bewusst vorsichtige Heuristik; beliebig verschleierter oder dynamisch zusammengesetzter Programmcode lässt sich damit nicht vollständig erkennen. Die erkannten entbehrlichen Pakete mit eingebettetem WASM werden vollständig entfernt. Es gibt keine pauschale Ausnahme für JavaScript-Dateien.

| Variante | Vorbereitung vor dem Scanner | Zweck |
|---|---|---|
| (c) `ohne` | Inventare und Web-Manifest, keine Bereinigung | Heutige Fundmenge des App-Baums beobachten |
| (a) `gezielt` | Geprüfte Paketliste entfernen, Restinventar prüfen | Entbehrlichkeit der Werkzeuge mit APK-Vergleich nachweisen |
| (b) `gezielt-scandelete` | Wie (a), zusätzlich `scandelete: [node_modules]` | Zusätzliche Scanner-Entfernungen sichtbar machen |

Der Build-Hook sichert das Inventar nach dem Scanner und vor dem Android-Build. Zusätzlich werden vor und nach dem Scanner alle regulären Dateien unter `node_modules` mit Größe und Prüfsumme erfasst. Damit sind auch Scanner-Entfernungen vergleichbar, die nicht zur Fundmenge der eigenen Inventur gehören. Verweise auf die eigenen npm-Workspaces werden nicht durchlaufen. Bricht der Scanner vorher ab, ist diese Phase nicht erreicht; zusätzliche Inventare nach dem Lauf werden ausdrücklich getrennt ausgewiesen. Insbesondere (c) kann an Scannerfunden abbrechen und dann keine APK liefern. Das bleibt ein fehlender APK-Nachweis, kein bestandener Gleichheitsvergleich.

Die Auswertung ordnet die Inventare nach Phase und vergleicht Größe und SHA-256. Jede erzeugte APK wird byteweise mit der geprüften Referenz verglichen. Alle Dateien der entfernten Pakete werden anhand ihrer Inhalte gegen die entpackten ZIP-Einträge geprüft; Treffer bleiben sichtbar. Ungeklärte Treffer sind Beanstandungen. Für zwei lokal nachgewiesene, unabhängig erzeugte Leerdateien gilt die unten beschriebene enge Einordnung. Das Web-Manifest muss genau mit `assets/public` in der APK übereinstimmen. Dieser Vergleich belegt die unveränderte Übernahme des vor der Bereinigung gebauten Bündels; er beweist keine allgemeine Abwesenheit beliebig transformierter Programmbestandteile.

Unbekannte Folgezeilen ohne Protokollkopf und neue Warnungen bleiben Beanstandungen. Der bestehende Parser lässt gewöhnliche druckbare INFO-/DEBUG-Kopfmeldungen zu; besondere Ablaufmarker werden gesondert geprüft. Die App-Auswertung erkennt die belegten Ausgaben aus `prebuild` und `build` anhand enger vollständiger Zeilenmuster mit festem Kontext. Die eigene Liste [`app-meldungen.json`](../scripts/fdroid/app-meldungen.json) enthält 47 feste Muster mit Lauf und Protokollzeile als Beleg. `npm_kern_build` erlaubt genau die belegten Kern-Versionen 0.0.0, 0.1.0 und 0.1.1 im Kontext `prebuild`, höchstens einmal je Lauf. [`app-protokoll.py`](../scripts/fdroid/app-protokoll.py) wertet sie aus; die gekürzten und bereinigten Prüfdaten stehen in [`fixtures/app-laeufe-2026-09-30.json`](../scripts/fdroid/fixtures/app-laeufe-2026-09-30.json), [`fixtures/app-laeufe-2026-10-15.json`](../scripts/fdroid/fixtures/app-laeufe-2026-10-15.json) und [`fixtures/app-laeufe-2026-10-22.json`](../scripts/fdroid/fixtures/app-laeufe-2026-10-22.json). Die Auswertung der Minimal-App bleibt unverändert. Es gibt keine pauschale Freigabe weiterer Folgezeilen. Alte Berichte werden bei einer Neuauswertung nicht überschrieben.

### Befehle unter Debian

Zuerst die geprüften Änderungen einchecken und diesen Stand in einen Debian-Klon übernehmen. Der folgende Aufruf erfolgt aus dessen Repositorywurzel. `--stand` bezeichnet den eingecheckten Stand einschließlich der neuen Rezeptskripte. Die Referenzdatei muss bereits vorhanden sein; ihr absoluter Pfad ist einzusetzen. Die vorhandenen Werkzeuge werden verwendet, es ist keine erneute Einrichtung erforderlich.

```sh
repo="$PWD"
stand="$(git rev-parse HEAD)"
referenz="/absoluter/Pfad/zur/geprueften/app-release-unsigned.apk"

python3 scripts/fdroid/build-lokal.py --app --repo "$repo" --stand "$stand" --variante ohne --referenz-apk "$referenz" --probelauf
python3 scripts/fdroid/build-lokal.py --app --repo "$repo" --stand "$stand" --variante ohne --referenz-apk "$referenz"
python3 scripts/fdroid/build-lokal.py --app --repo "$repo" --stand "$stand" --variante gezielt --referenz-apk "$referenz"
python3 scripts/fdroid/build-lokal.py --app --repo "$repo" --stand "$stand" --variante gezielt-scandelete --referenz-apk "$referenz"
```

Die drei echten Aufrufe einzeln ausführen und den Rückgabewert jeweils festhalten; ein Fehler von (c) darf die folgenden Versuche nicht überspringen. Jeder Aufruf nennt seinen neuen Ordner unter `~/fdroid-probe/build-laeufe`. Den ganzen Laufordner behalten: Rezept und Konfiguration, Commit und Werkzeugstände, `build.log`, Rückgabewerte, Lockfile, alle Inventare, Bereinigungsbericht, Web-Manifest, Referenzkopie, Auswertung, Gradle-Archivnachweis und vorhandene unsignierte APK. Auch fehlgeschlagene Läufe bleiben als Beleg bestehen.

Anschließend die drei ausgegebenen Laufordner einsetzen und nebeneinander auswerten. Die Ausgabedatei und die daneben entstehende Markdown-Datei müssen neu sein:

```sh
python3 scripts/fdroid/app-auswerten.py --vergleich \
  "$HOME/fdroid-probe/build-laeufe/lauf-C" \
  "$HOME/fdroid-probe/build-laeufe/lauf-A" \
  "$HOME/fdroid-probe/build-laeufe/lauf-B" \
  --ausgabe "$HOME/fdroid-probe/build-laeufe/app-f5-vergleich.json"
```

Der Vergleich übernimmt Befunde der Einzelläufe. Die beobachteten Abbrüche von (c) und (b) führen deshalb auch im Gesamtvergleich zu Rückgabe 1; der erfolgreiche APK-Vergleich von (a) bleibt einzeln sichtbar.

Gemessen am 2026-09-30 für die vollständigen Aufrufe von `build-lokal.py`: (c) 184 Sekunden, (a) 343 Sekunden, (b) 238 Sekunden. Die Läufe verwenden eigene npm-/Gradle-Zwischenspeicher. Diese Messungen ersetzen die frühere Schätzung; Netz und Maven-Downloads können andere Läufe deutlich verlängern.

### Lokale Prüfung des App-Rezepts am 2026-09-30

Geprüft unter Windows mit Node.js 24.21.0, npm 11.19.0 und Python 3.14.6, ohne Download. Build- und Testausgaben liegen in einer ausgeschlossenen Prüfkopie. Die echte Installation von `node_modules` wurde nicht bereinigt.

| Prüfung | Rückgabe und Ergebnis |
|---|---|
| `npm test` | 1: 1 512 Skripttests, davon 1 507 bestanden, 4 übersprungen und ein Timeout des bestehenden echten Signiertests beim Aufruf von `keytool.exe` nach 120 Sekunden. Der unveränderte Einzeltest bestand danach mit Rückgabe 0 in rund 22 Sekunden. |
| Nachgeholter Kern-Build und Workspace-Tests | jeweils 0; Kern 134, Oberfläche 184, App 9 Tests bestanden. Der erste Gesamtlauf bleibt als fehlgeschlagener Lauf dokumentiert. |
| `npm run check` | 0; keine Diagnosefehler, bekannter Hinweis auf die ungenutzte Variable `runde2Aktiv`; Astro meldet das fehlende Seitenverzeichnis des Komponentenpakets. |
| `npm run build` | 0, einschließlich Web-Build und K1/K2 |
| `npm run lizenzen` | 0 |
| Neuer Vorbereitungshelfer an den echten Dateien | 0; Web-Build, Sync und K1 bis K4 bestanden; 15 Dateien im Web-Manifest einschließlich der beiden leeren Cordova-Dateien |

Die Bereinigung auf der vollständigen Kopie entfernte 20 unter Windows aktive Pakete mit insgesamt 1 577 Dateien. Das Inventar sank von 44 auf 0 Funde; der von `--android-quellen` genannte Capacitor-Ordner blieb erhalten und bestand die anschließende Quellenprüfung. Die Gegenproben mit fehlendem Listenpaket, geschütztem Android-Ordner in der Löschmenge und einer zusätzlichen WASM-Datei ohne Zulassung brachen jeweils mit Rückgabe 1 ab, vor einer Paketlöschung. Die vollständige Liste umfasst zusätzlich sieben Plattformpakete für Debian x64/glibc; die nachfolgenden Debian-Läufe belegen deren Einsatz.

Das zuerst kopierte installierte Verzeichnis enthielt außerdem 355 Artefakte eines vorherigen Android-Builds unter `@capacitor/android/capacitor/build`. Die Restprüfung wies sie anhand des vollständigen Ist-Inventars zurück. Nur dieser ausdrücklich geprüfte Buildordner wurde in der Kopie entfernt, um den Zustand nach einem frischen `npm ci` nachzustellen. Es wurde keine Ausnahme für Buildartefakte in geschützten Android-Quellen hinzugefügt.

Zusätzlich wurde die vorhandene Referenz-APK direkt gelesen: Größe und SHA-256 stimmen mit dem oben genannten Wert überein. Alle 15 Dateien aus dem neuen Web-Manifest stimmen mit `assets/public` der Referenz überein. Von den 1 577 entfernten Dateien trifft kein nichtleerer Dateiinhalt auf einen APK-Eintrag. Dies ist ein Vergleich mit der vorhandenen Referenz, kein Android-Build nach der Bereinigung.

Zwei leere Dateien aus `node-fetch-native` 1.6.7 (`lib/empty.cjs`, `lib/empty.mjs`) haben zwangsläufig denselben SHA-256 wie die leeren APK-Dateien `assets/public/cordova.js` und `assets/public/cordova_plugins.js`. Die Herkunft ist einzeln geprüft: `@capacitor/cli` 8.5.2 schreibt beide Zieldateien in `dist/cordova.js`, Funktion `createEmptyCordovaJS`, ausdrücklich mit leerem Inhalt; `handleCordovaPluginsJS` wählt diesen Weg ohne Cordova-Plugins. Auch `scripts/app-pruefungen.json` verlangt genau diese beiden leeren Sync-Dateien. Die Auswertung behält die Rohübereinstimmungen und kennzeichnet ausschließlich dieses vollständige Paar bei genau diesen Paketversionen, leerem Inhalt und bestandenem Web-Vergleich als belegte Leerdatei-Gleichheit. Andere leere Dateien, andere Pfade, andere Versionen, nichtleerer Inhalt oder Scanner-Treffer erhalten keine solche Einordnung.

Die abschließende gezielte Wiederholung besteht mit 12 Node-Tests, darin 67 Python-Prüfungen: sechs zur Laufsteuerung, 24 zur Bereinigung und 37 zur Auswertung. Sie prüfen Vorbereitung, Pfadgrenzen, Listenalterung, vollständige Inventare, APK-Vergleich und die enge Leerdatei-Einordnung. Zusätzlich bestehen die 26 Tests für Bereinigung und bestehende Build-Vorbereitung gemeinsam. Lesefehler aus der auf acht Leser begrenzten Inventur führen zum Abbruch. Diese lokalen Prüfungen ersetzen weder die drei Debian-Läufe noch das Kreuzreview vor dem Merge.

## Drei lokale App-Läufe am 2026-09-30

Gebaut wurde Stand `5c43ced5d2dfff021fab14d451415bd9181b3114` aus einem aus Git-Bundle angelegten Klon: App `de.baremos.fristenrechner`, Version 0.1.0 (100). Umgebung: Debian 13.5 unter WSL 2, fdroidserver 2.4.2, Python 3.13.5, Node.js 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Gradle 8.14.5, Android-Gradle-Plugin 8.13.0 und Build-Tools 35.0.0. Jeder Lauf verwendete eigene Zwischenspeicher. Die Dauern stammen aus der Zeitmessung der vollständigen Aufrufe von `build-lokal.py`, einschließlich Auswertung.

| Variante | Gemessene Dauer | `fdroid build` | Scanner | APK |
|---|---|---|---|---|
| (c) ohne Bereinigung | 184 s | Rückgabewert 0, `1 build failed` | 10 Fehler | keine |
| (a) gezielte Bereinigung | 343 s | Rückgabewert 0, `1 build succeeded` | kein Fehler | 7 715 483 Bytes, bytegleich zur Referenz |
| (b) gezielte Bereinigung und `scandelete` | 238 s | Rückgabewert 0, `1 build failed` | 1 Fehler: `Unused scandelete path: node_modules` | keine |

Die APK aus (a) hat SHA-256 `776bba301220d1d9b3f5e4f5d4841f37449609e72d6622b8ebdab065fcab93b3`. In allen drei Läufen ist der Rückgabewert von `fdroid build` allein kein Erfolgsbeleg. Die erste Auswertung auf Stand `5c43ced` meldete 65, 55 und 57 Beanstandungen und ließ deshalb alle drei Aufrufe von `build-lokal.py` mit 1 enden. Überwiegend fehlten ihr noch die engen Muster für die App-Ausgaben ohne Protokollkopf. Diese Auswertungen bleiben als Erstbefund erhalten; für die Neuauswertung wurden Kopien der Laufordner verwendet.

Die Neuauswertung mit den belegten App-Mustern ergibt:

| Variante | Rückgabe der Auswertung | Beanstandungen | Ergebnis |
|---|---|---|---|
| (c) ohne Bereinigung | 1 | 1 | Scannerabbruch durch 10 Binärfunde; die zehn Dateien stehen unten. Kein APK-Nachweis. |
| (a) gezielte Bereinigung | 0 | 0 | Bestanden; APK bytegleich zur Referenz. |
| (b) gezielte Bereinigung und `scandelete` | 1 | 1 | Scannerabbruch durch ungenutztes `scandelete`: `Unused scandelete path: node_modules`; kein APK-Nachweis. |

`--vergleich` endet wegen der beiden belegten Scannerabbrüche mit Rückgabe 1; die Gegenüberstellung selbst meldet keinen zusätzlichen Fehler. Die Beanstandungen von (c) und (b) benennen jeweils die Ursache einschließlich des fehlenden APK-Nachweises, ohne die bekannten Folgeerscheinungen desselben Abbruchs mehrfach zu zählen. Die Prüfsummen der ursprünglichen Materialdateien blieben bei der Neuauswertung unverändert.

Die zehn Scannerfehler von (c), jeweils relativ zu `node_modules`:

| Datei | Fund im `build.log` von Variante (c) |
|---|---|
| `@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6` | Zeile 116: shared library |
| `shiki/dist/onig.wasm` | Zeile 117: WebAssembly binary file |
| `@astrojs/astro2tsx/astro2tsx.wasm32-wasi.wasm` | Zeile 118: WebAssembly binary file |
| `@esbuild/linux-x64/bin/esbuild` | Zeile 119: binary |
| `@capacitor/cli/assets/ios-pods-template.tar.gz` | Zeile 120: gzip file archive |
| `@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz` | Zeile 121: gzip file archive |
| `@capacitor/cli/assets/capacitor-cordova-ios-plugins.tar.gz` | Zeile 122: gzip file archive |
| `@capacitor/cli/assets/ios-spm-template.tar.gz` | Zeile 123: gzip file archive |
| `@capacitor/cli/assets/android-template.tar.gz` | Zeile 124: gzip file archive |
| `xxhash-wasm/workerd/xxhash.wasm` | Zeile 126: WebAssembly binary file |

### Inventare und entfernte Pakete

Die folgende Tabelle zählt Dateien unter `node_modules`. Die Vorbau-Inventur erfasst auch die beschriebenen JS-WASM-Verdachtsfälle; ihre Fundzahl ist nicht mit der Zahl der Scannerfehler gleichzusetzen.

| Phase / Inventar | (c) ohne | (a) gezielt | (b) gezielt-scandelete |
|---|---|---|---|
| Vor Web-Build: Vorbau-Funde | 43 | 43 | 43 |
| Nach Web-Build und Sync: Vorbau-Funde | 43 | 43 | 43 |
| Nach Vorbereitung/Bereinigung: Vorbau-Funde | 43, keine Bereinigung | 0 | 0 |
| Vor Scanner: alle regulären Dateien | 19 892 | 18 312 | 18 312 |
| Build-Hook nach Scanner: Vorbau-Funde | nicht erreicht | 0 | nicht erreicht |
| Build-Hook nach Scanner: alle regulären Dateien | nicht erreicht | 18 312 | nicht erreicht |
| Zusätzliche Erfassung nach gescheitertem Lauf: Vorbau-Funde | 43 | entfällt | 0 |
| Zusätzliche Erfassung nach gescheitertem Lauf: alle regulären Dateien | 19 892 | entfällt | 18 312 |

Die Inventare vor und nach Web-Build stimmen je Lauf vollständig überein. Bei (a) sind auch die Inventare aller regulären Dateien vor und nach dem Scanner einschließlich Größe und SHA-256 gleich. Für (c) und (b) stimmt der Bestand vor dem Scanner mit der zusätzlichen Erfassung nach dem gescheiterten Lauf überein; dies ersetzt keinen erfolgreichen Durchlauf des Build-Hooks nach dem Scanner. Der entfernte Gradle-Wrapper liegt außerhalb von `node_modules` und gehört daher nicht zu diesen Inventaren.

Die Berichte `bereinigung.json` aus (a) und (b) weisen jeweils Linux x64/glibc, 21 entfernte Pakete, 1 580 entfernte Dateien und 0 zugelassene Restfunde aus. Tatsächlich entfernt wurden:

| Paket | Version |
|---|---|
| `@astrojs/astro2tsx` | 0.1.1 |
| `@astrojs/compiler-binding-linux-x64-gnu` | 0.4.1 |
| `@bruits/satteri-linux-x64-gnu` | 0.10.5 |
| `@capacitor/cli` | 8.5.2 |
| `@emnapi/core` | 1.11.3 |
| `@esbuild/linux-x64` | 0.28.2 |
| `@img/sharp-libvips-linux-x64` | 1.3.3 |
| `@img/sharp-linux-x64` | 0.35.4 |
| `@rolldown/binding-linux-x64-gnu` | 1.2.9 |
| `@shikijs/engine-oniguruma` | 4.4.3 |
| `@tybys/wasm-util` | 0.10.4 |
| `@vitest/mocker` | 4.1.11 |
| `es-module-lexer` | 2.3.2 |
| `lightningcss-linux-x64-gnu` | 1.33.0 |
| `node-fetch-native` | 1.6.7 |
| `prettier` | 3.9.8 |
| `shiki` | 4.4.3 |
| `undici` | 8.10.2 |
| `vite` | 8.3.0 |
| `vitest` | 4.1.11 |
| `xxhash-wasm` | 1.1.0 |

Die sechs Windows-Pakete der Liste waren unter Linux inaktiv: `@astrojs/compiler-binding-win32-x64-msvc`, `@bruits/satteri-win32-x64-msvc`, `@esbuild/win32-x64`, `@img/sharp-win32-x64`, `@rolldown/binding-win32-x64-msvc` und `lightningcss-win32-x64-msvc`. Sie sind keine unter Linux entfernten Pakete. Der geschützte Ordner `node_modules/@capacitor/android/capacitor` blieb erhalten. Im erfolgreichen Lauf (a) bestätigen `build.log:78–79` K3 und K4 und `build.log:130` die Android-Quellen nach dem Scanner.

In (a) stimmen alle 15 Dateien des vor der Bereinigung gesicherten Web-Manifests mit `assets/public` in der APK überein. Für alle 1 580 entfernten Dateien wurde der Inhalt mit den APK-Einträgen verglichen: kein nichtleerer Inhalt stimmt überein. Die einzigen Rohübereinstimmungen betreffen die beiden oben erläuterten leeren Dateien aus `node-fetch-native` und die unabhängig erzeugten leeren Cordova-Dateien. Ihre enge Einordnung bleibt sichtbar.

### Wrapper und ungenutztes `scandelete`

In allen drei Varianten meldet der Scanner genau einmal `Removing gradle-wrapper.jar at app/android/gradle/wrapper/gradle-wrapper.jar`: (c) Zeile 127, (a) Zeile 119 und (b) Zeile 119 des jeweiligen `build.log`. Die App-Auswertung behandelt ausschließlich diese eine Datei als bekannte erwartete Entfernung außerhalb von `node_modules`; eine zusätzliche oder andere Entfernung bleibt Beanstandung.

Das Verhalten wurde an einer bereits vorhandenen Quelltextkopie der Marke 2.4.2 geprüft: [`fdroidserver/scanner.py`](https://gitlab.com/fdroid/fdroidserver/-/blob/2.4.2/fdroidserver/scanner.py#L953-954) entfernt Dateien namens `gradle-wrapper.jar` unmittelbar über `removeproblem`, unabhängig von `scandelete`. Die Funktion protokolliert die Entfernung auf Stufe INFO, löscht die Datei und liefert 0 zurück (Zeilen 813–824). Dies stimmt mit allen drei Protokollen überein; der aktuell installierte Debian-Quelltext wurde bei der Neuauswertung nicht erneut direkt gelesen.

Der Build von (a) startet danach das nach F2 festgelegte `gradlew-fdroid` (`build.log:133`) und dessen Gradle 8.14.5 (`build.log:138`). Alle drei Berichte `gradle-archiv.json` nennen dasselbe geprüfte `gradle-8.14.5-bin.zip`: 138 068 841 Bytes, SHA-256 `6f74b601422d6d6fc4e1f9a1ab6522f642c2fdcbc15ae33ebd30ba3d7198e854`, passend zu `toolchain.json`. Damit hängt dieser Build nicht vom entfernten Wrapper-JAR ab. Die Materialkopien enthalten die Archivberichte, nicht die Archive selbst; bei der Neuauswertung wurden die Berichte und Aufrufe abgeglichen, keine Archiv-Prüfsumme neu berechnet.

Bei (b) folgt nach der Wrapper-Entfernung der Scannerfehler `Unused scandelete path: node_modules` (`build.log:120`), danach der Scanabbruch mit einem Fehler (Zeile 121) und `1 build failed` (Zeile 125). In derselben Scannerquelle markiert nur `todelete` einen `scandelete`-Eintrag als benutzt (Zeilen 767–773); ein unbenutzter Eintrag führt zu ERROR und erhöht den Fehlerzähler (Zeilen 1117–1122). Die gezielte Bereinigung lässt hier keinen entsprechenden Fund übrig. Die Wrapper-Entfernung benutzt den Eintrag nicht. Der eigene Befund für (b) lautet deshalb: Buildabbruch durch ungenutztes `scandelete`, kein APK-Nachweis. Er ist keine Folge unbekannter Protokollzeilen. Die Festlegung zu F5 verzichtet deshalb auf `scandelete`.

### Grenzen dieses Nachweises

1. Alle drei Läufe erfolgten an einem Tag auf einem Rechner, unter Debian in WSL 2. Es sind lokale Aufrufe von `fdroid build`, keine Läufe auf einem Buildserver von F-Droid.
2. Nur (a) liefert eine APK und belegt deren Gleichheit mit der Referenz. Für (c) und (b) gibt es wegen des Scannerabbruchs keinen APK-Nachweis.
3. Verglichen ist eine unsignierte APK. Keine Signatur, Einreichung oder Annahme durch F-Droid ist geprüft.
4. Die Aussage gilt für den genannten Commit, das Lockfile, die Werkzeugversionen und die belegte Bereinigungsliste. Neue Abhängigkeiten, Plugins oder Regeln des Scanners erfordern neue Inventare und Vergleichsläufe.
5. Die Erkennung eingebetteten WASM bleibt heuristisch. Inventar, Scanner und APK-Vergleich decken unterschiedliche Eigenschaften ab; keiner dieser Schritte allein belegt die Abwesenheit beliebig transformierter Programmbestandteile.

## Lauf am Endstand vom 2026-10-04

Quelle sind die Protokolle der Läufe vom 2026-10-03/04; sie liegen nicht im Repository.

Geprüft ist `8987e69`; dessen App-Eingaben entsprechen dem App-Endstand `c7b5230`. Umgebung: Debian 13.5 in WSL 2, fdroidserver 2.4.2-1, OpenJDK 21.0.12.1 und Node.js 24.21.0. `gradlew-fdroid` stammt aus Commit `c7227d147483979bb5c408048cee3533a8814fb0` (SHA-256 des Programms `a6e2366c…07ea`). Das im Lauf geladene Gradle-Archiv 8.14.5 `bin` hat 138 068 841 Bytes und SHA-256 `6f74b601…e854`.

| Schritt | Beobachtetes Ergebnis |
|---|---|
| Saubere Kopie vor dem Lauf | `npm ci` in 10 s; `npm test`: 1 985 Skripttests, davon 1 906 bestanden, 79 übersprungen und 0 fehlgeschlagen; Lizenzprüfung bestanden, Arbeitsbaum sauber. Die Gründe für die übersprungenen Tests stehen im [Build-Nachweis der App](app.md). |
| Lokaler Build | Am 2026-10-04 von 00:07 bis 00:11, Variante `gezielt` nach F5, ohne `scandelete`; `fdroid build --verbose de.baremos.fristenrechner:100`. Laufsteuerung: 198 s. |
| Scanner | Keine Fehler; entfernt nur das erwartete `app/android/gradle/wrapper/gradle-wrapper.jar`. Gradle startet über `gradlew-fdroid`. |
| Bereinigung | 21 Pakete mit 1 580 Dateien entfernt; 6 Pakete inaktiv, 1 Paket behalten. |
| Inventar vorgebauter Programme | Vor und nach Web-Build je 43 Funde, nach Bereinigung und nach Scanner je 0. Die Dateimanifeste vor und nach dem Scanner enthalten je 18 312 Dateien. |
| Web-Abgleich | 14 Dateien vor der Bereinigung und 14 in der APK, Vergleich bestanden. Am 2026-09-30 waren es 15; `dist` enthält nun 12 statt 13 Dateien. |
| Inhaltsvergleich entfernter Dateien | 2 belegte Gleichheiten leerer Dateien: `assets/public/cordova.js` und `cordova_plugins.js` gegenüber den entfernten leeren `node-fetch-native/lib/empty.*`; 0 unbelegte Gleichheiten. |
| Auswertung | 226 bekannte Meldungen, 0 Beanstandungen, „ERGEBNIS: keine Beanstandung“; Rückgabewerte `fdroidBuild` und `appAuswertung` jeweils 0. |
| APK | `unsigned/de.baremos.fristenrechner_100.apk`, 7 760 765 Bytes, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`; bytegleich zur Referenz, Referenz-Pin bestanden. Der Lauf belegt 1,2 GB. |

Der lokale Abschlusslauf ist bestanden. Er liefert dieselbe unsignierte Release-APK wie die getrennten Builds unter Linux und Windows; siehe [N1](signierung.md#nachweise-für-die-abnahme). Die bisherigen Grenzen bleiben gültig: ein Rechner, Debian unter WSL, lokaler Lauf mit den Werkzeugen von F-Droid, kein Build auf dem Buildserver und keine Annahme durch F-Droid. Gradle lief mit Netz. Die Gleichheit gilt für die belegten Eingaben und Werkzeugversionen; Scanner und Inventar erkennen beliebig eingebetteten Programmcode nicht vollständig.

## Lauf am eingefrorenen Stand vom 2026-10-15

Geprüft ist `d3d432b`; dessen App-Eingaben entsprechen dem eingefrorenen Stand `8b17927`. Der lokale Lauf erfolgte unter Debian 13.5 in WSL 2. Er erneuert den Nachweis vom 2026-10-04.

Der erste Versuch am Stand `97d07c2` von 16:39 bis 16:53 brach im Gradle-Build mit „Dependency verification failed for configuration 'classpath'“ ab. In der Prüfsummendatei fehlten `guava-parent-33.3.1-jre.pom` und `junit-bom-5.10.2.module`. Die Datei war am 2026-10-05 mit gefülltem Gradle-Cache erzeugt worden; der eigene leere Gradle-Zwischenspeicher des F-Droid-Laufs erforderte zusätzlich diese beiden Dateien. In der sauberen Kopie scheiterte außerdem der Skripttest, der den noch nicht gebauten Rechenkern importiert. Commit `6ce0c7c` korrigiert dafür die Reihenfolge in `npm test`.

Die Neuerzeugung am 2026-10-15 mit leerem `GRADLE_USER_HOME` und `--write-verification-metadata sha256 clean assembleRelease assembleDebug bundleRelease` ergab genau zwei zusätzliche Artefakte in acht Zeilen. Die Prüfung gegen Maven Central bestätigte die SHA-1 beider Dateien und die dort veröffentlichte SHA-256 der JUnit-BOM; für das Guava-Eltern-POM veröffentlicht Central keine SHA-256-Datei. Die Gegenprobe mit einem zweiten leeren Gradle-Home und aktiver Prüfung bestand; die Release-APK blieb bytegleich. Commit `d3d432b` ergänzt die beiden Einträge. Die Prüfsummendatei umfasst danach 389 Komponenten und 675 Artefakte aus 110 Gruppen; `node scripts/gradle-pruefsummen.mjs` meldete 0 Fehler.

| Schritt | Beobachtetes Ergebnis |
|---|---|
| Werkzeuge | Node.js 24.21.0 und npm 11.19.0; Gradle 8.14.5 `bin` über `gradlew-fdroid` aus Commit `c7227d1`, Programm-SHA-256 `a6e2366c3499f9ba92b4a6f52883d2d0db24b38b4523b186d4ae5e4a69a607ea`. SDK-Prüfung: Command-line Tools 22.0, Plattform Android 36 Revision 2, Build-Tools 35.0.0, Platform-Tools 37.0.1. |
| Werkzeugvorgaben | Die zum Lauf festgehaltenen Vorgaben nennen OpenJDK 21.0.12 und Android-Gradle-Plugin 8.13.0. Installiert waren fdroidserver 2.4.2-1 und OpenJDK 21.0.12.1; so protokolliert vom [N5-Lauf](signierung.md#übertragung-der-signatur-am-eingefrorenen-stand-n5) desselben Tages in derselben Debian-Umgebung. Die Paketverwaltung zeigt seit dem 2026-10-04 keine Änderung. |
| Gradle-Archiv | 138 068 841 Bytes, SHA-256 `6f74b601422d6d6fc4e1f9a1ab6522f642c2fdcbc15ae33ebd30ba3d7198e854`; stimmt mit der festgelegten Prüfsumme überein. |
| Saubere Kopie vor dem Lauf | Ab 17:03: `npm ci` in 9 s; `npm test` in 356 s mit 3 107 Skripttests, davon 3 027 bestanden, 80 übersprungen und 0 fehlgeschlagen; Lizenzprüfung bestanden, Arbeitsbaum sauber. |
| Lokaler Build | Von 17:09 bis 17:12, Variante `gezielt` nach F5, ohne `scandelete`; `fdroid build --verbose de.baremos.fristenrechner:100`. Laufsteuerung: 191 s; F-Droid-Build erfolgreich. |
| Scanner | Keine Scannerfehler; entfernt nur das erwartete `app/android/gradle/wrapper/gradle-wrapper.jar`. Gradle startet über `gradlew-fdroid`. |
| Bereinigung | 21 Pakete mit 1 580 Dateien entfernt; 6 Pakete inaktiv, 1 Paket behalten, 0 zugelassene Restfunde. |
| Inventar vorgebauter Programme | Vor und nach Web-Build je 43 Funde, nach Bereinigung und nach Scanner je 0. Die Dateimanifeste vor und nach dem Scanner enthalten je 18 312 Dateien. |
| Web-Abgleich | 12 Dateien vor der Bereinigung und 12 in der APK, Vergleich bestanden. |
| Inhaltsvergleich entfernter Dateien | 2 belegte Gleichheiten unabhängig erzeugter Leerdateien, 0 ungeklärte Gleichheiten. |
| Erste Auswertung | 225 bekannte Meldungen und 2 Beanstandungen wegen unbekannter Protokollzeilen; F-Droid-Build mit Rückgabewert 0, Auswertung mit Rückgabewert 1. |
| Neuauswertung | Nach Ergänzung der Protokollmuster mit `39092de`: derselbe Laufordner ohne neuen Build, 0 Beanstandungen, APK-Vergleich bestanden. |
| APK | `unsigned/de.baremos.fristenrechner_100.apk`, 7 668 430 Bytes, SHA-256 `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02`; bytegleich zur Referenz, Referenzprüfung bestanden. |

Die zwei beanstandeten Zeilen waren `> @baremos/fristenrechner-kern@0.1.0 build` und `Hinweise Dritter: bestanden`. Das Kern-Build-Muster erwartete zuvor nur Version `0.0.0`; das zweite Muster erfasst die neue Hinweisprüfung nach dem Android-Sync. Beide gelten ausschließlich im Vorbereitungsschritt und höchstens einmal je Lauf. Die ergänzten Muster und die gekürzten Prüfdaten liegen in [`app-meldungen.json`](../scripts/fdroid/app-meldungen.json) und [`app-laeufe-2026-10-15.json`](../scripts/fdroid/fixtures/app-laeufe-2026-10-15.json).

Der lokale Nachweis ist nach der Neuauswertung bestanden. Die unsignierte Release-APK stimmt mit den getrennten Builds unter Windows und Linux überein. Die Grenzen bleiben: ein Rechner, Debian unter WSL 2, lokaler F-Droid-Lauf mit Netz, kein Build auf einem Buildserver von F-Droid, keine geprüfte Signatur und keine Einreichung oder Annahme. Die Gleichheit gilt für die belegten Eingaben und Werkzeugversionen; Scanner und Inventar erkennen beliebig eingebetteten oder transformierten Programmcode nicht vollständig.

## Prüfung der ersten Fassung der Skripte unter Windows

Geprüft am 2026-09-29 mit Node.js 22.23.2 und npm 10.9.8, ohne Downloads: 107 neue Tests mit `node:test`, davon 18 für die Einrichtung, 66 für die Build-Auswertung und 23 für Vorbereitung und Inventar. Jeder Test enthält einen gültigen Fall und eine Gegenprobe, die scheitern muss. Die Tests stellen HTTPS, Git- und Buildprozesse nach; Protokolle und APK-ZIPs sind Testdaten. Sie sind kein Nachweis eines echten F-Droid-Builds. Die Syntaxprüfung beider neuen Bash-Einstiege mit dem vorhandenen Git Bash ist bestanden.

Der damalige gesamte Aufruf `npm test` bestand mit 530 Skripttests, 134 Kerntests und 68 Oberflächentests, ohne Fehler oder übersprungene Tests. `npm run check` bestand: 15 Dateien der Oberfläche, 0 Fehler, 1 Hinweis auf eine ungenutzte Variable; Astro meldete außerdem das fehlende Seitenverzeichnis des Komponentenpakets. `npm run build` bestand und baute nur den Rechenkern. `npm run lizenzen` bestand für 412 Fremdpakete. Diese Zahlen beschreiben die erste Fassung vor der Anpassung an die drei echten Protokolle. Die Lizenzprüfung erteilt keine F-Droid-Freigabe für vorgebaute Programme.

## Prüfung der angepassten Skripte unter Windows

Erneut geprüft am 2026-09-29 mit Node.js 24.21.0, npm 11.19.0 und Python 3.14.6: Zuerst besteht `node --test scripts/fdroid-build-auswertung.test.mjs` mit 190 Tests, danach `npm test` mit 656 Skripttests, 134 Kerntests und 68 Oberflächentests; beide Aufrufe mit Rückgabewert 0, ohne Fehler oder übersprungene Tests. Die Skripttests enthalten die 190 Prüfungen der Build-Auswertung sowie 25 Prüfungen der Build-Vorbereitung und Inventur. Die Dauerprüfungen umfassen 796 Fälle: 158 gültige Ausgaben und 638 Gegenproben. Weitere Gegenproben prüfen ASCII-Ziffern, die Laufzeit des Inventarmusters, Warnungstext und Steuerzeichen in Pfadteilen sowie die sichtbare Darstellung beanstandeter Rohzeilen. Der Erfolgstest mit `scandelete` verwendet das echte anonymisierte Lauf-3-Protokoll einschließlich der Legacy-Warnung. Die übrigen Tests prüfen unter anderem andere uuid-Versionen, andere veraltete npm-Pakete, geänderte SDK-Zahlen, andere Kotlin-Dateien, Zeilen, Spalten und Wortlaute, falsche Kontexte sowie überschrittene Höchstzahlen für jeden bekannten Meldungstyp. Protokolle aus den ersten drei Debian-Läufen liegen anonymisiert unter `scripts/fdroid/fixtures/`; die Tests benötigen keine privaten Dateien.

Danach liefen nacheinander `npm run check`, `npm run build` und `npm run lizenzen`, jeweils mit Rückgabewert 0. Die Typprüfung umfasst 15 Dateien der Oberfläche: 0 Fehler, 0 Warnungen im Diagnoseergebnis, 1 Hinweis auf die ungenutzte Variable `runde2Aktiv`. Astro meldet zusätzlich das fehlende Seitenverzeichnis des Komponentenpakets. Der Build baut weiterhin nur den Rechenkern; die Lizenzprüfung umfasst 412 Fremdpakete: 24 ausgeliefert, 288 bereitgestellt, 100 für Tests und Build. Ein neuer Android- oder F-Droid-Build wurde dabei nicht ausgeführt.

Zusätzliche Gegenproben vergleichen das Verhalten vor und nach der Korrektur: Eine Unicode-Ziffer sowie Warnungstext und ESC in Pfadteilen wurden vorher angenommen und werden jetzt beanstandet. Eine Inventarzeile mit 64 000 wiederholten Trennern überschritt vorher das Zeitlimit von fünf Sekunden (Abbruch nach 5,02 Sekunden); die eingegrenzte Fassung war nach 0,187 Sekunden fertig. Der Vergleich endete wie erwartet mit Rückgabewert 0. Diese Laufzeitmessung gilt für den genannten lokalen Prüflauf.

Nach Ergänzung der Prüfungen für Steuerzeichen, Leerraum und sichtbare Unicode-Darstellung am 2026-09-29 erneut mit Node.js 24.21.0, npm 11.19.0 und Python 3.14.6 geprüft: Die Build-Auswertung besteht mit 202 Tests; `npm test` besteht mit 675 Skripttests, 134 Kerntests und 68 Oberflächentests. Beide Aufrufe enden mit Rückgabewert 0, ohne Fehler oder übersprungene Tests. Unter Debian 13.5 mit Node.js 24.21.0 und Python 3.13.5 besteht die Build-Auswertung ebenfalls mit 202 Tests. Die zwölf zusätzlichen Tests prüfen INFO- und DEBUG-Kopftexte mit Steuer- oder Trennzeichen, LF und CRLF gegenüber anderen Trennern, ein einzelnes CR am Dateiende, sichtbare Unicode-Escapes, reine Leerraumzeilen an mehreren Stellen und den zusätzlichen Marker `x build succeeded`. Typprüfung, Build und Lizenzprüfung enden ebenfalls jeweils mit Rückgabewert 0; Umfang und Hinweise dieser drei Prüfungen sind gegenüber dem oben beschriebenen Stand unverändert. Die vier echten Protokolle ergeben weiterhin die Rückgabewerte 1, 1, 0 und 0; Lauf 3 und 4 bleiben als `scandelete`-Versuche gekennzeichnet.

## Lauf an der Referenz 0.2.0 vom 2026-10-19

Gebaut wurde `main` am Stand `5843a92` (Fassung 0.2.0, `versionCode` 200) aus einem Bundle-Klon unter Debian 13.5 in WSL 2 mit fdroidserver 2.4.2-1, OpenJDK 21.0.12.1, Node.js 24.21.0 aus dem Benutzerbereich und `gradlew-fdroid` aus Commit `c7227d1`. Vor dem Lauf bestanden in der sauberen Kopie `npm ci`, `npm test` (3 270 Skripttests, 80 übersprungen, 0 fehlgeschlagen) und `npm run lizenzen`. Die Laufsteuerung `build-lokal.py` in der Variante „gezielt“ brauchte einschließlich Vorbereitung und Auswertung 189 Sekunden (08:44 bis 08:47 MESZ); `fdroid build --verbose de.baremos.fristenrechner:200` endete mit Rückgabewert 0. Die Auswertung meldet keine Beanstandung: 227 bekannte Meldungen, Scannerlauf ohne Fehler, der Scanner entfernte nur `gradle-wrapper.jar` der App, die gezielte Bereinigung entfernte 21 Pakete mit 1 580 Dateien; das Inventar meldete nach Bereinigung und nach dem Scanner jeweils 0 vorgebaute Funde, die Android-Quellen unter `node_modules/@capacitor/android/capacitor` blieben erhalten. Die zwölf Web-Dateien in der APK entsprechen dem Stand vor der Bereinigung. Die unsignierte APK `unsigned/de.baremos.fristenrechner_200.apk` hat 7 668 594 Bytes und die SHA-256 der damaligen Referenz 0.2.0. Grenzen wie bisher: ein Rechner, Debian in WSL, lokaler Aufruf von `fdroid build`, kein Buildserver von F-Droid.

## Lauf an der Referenz 1.0.0 vom 2026-10-22

Gebaut wurde Stand `2a9ea85` (Fassung 1.0.0, `versionCode` 10000) aus einer sauberen Bundle-Kopie unter Debian mit fdroidserver 2.4.2-1 und `gradlew-fdroid` aus Commit `c7227d1`. Der Nachweis lief von 15:38:10 bis 15:49:26 MESZ. Vor dem Build bestanden `npm ci`, `npm test` (3 331 Skripttests, davon 3 251 bestanden, 80 übersprungen und 0 fehlgeschlagen) und `npm run lizenzen`. Die Laufsteuerung `build-lokal.py --app --variante gezielt` brauchte ab 15:45:57 MESZ einschließlich Vorbereitung und Auswertung 208 Sekunden; `fdroid build` endete mit Rückgabewert 0.

Die Erstauswertung meldete genau eine Beanstandung: die unbekannte Zeile 48 `> @baremos/fristenrechner-kern@0.1.1 build`. Mit `dfd1fb8` wurde das oben im Abschnitt [Vorbereitung, Bereinigung und Nachweise](#vorbereitung-bereinigung-und-nachweise) beschriebene Muster `npm_kern_build` um die belegte Paketversion 0.1.1 erweitert. Die Neuauswertung desselben Laufs ohne neuen Build meldete keine Beanstandung; der APK-Vergleich bestand.

Die Neuauswertung erfasst 227 bekannte Meldungen; die Erstauswertung erfasste 226, weil Zeile 48 dort noch als unbekannt galt. Der Scanner entfernte nur `gradle-wrapper.jar` der App, die gezielte Bereinigung entfernte 21 Pakete mit 1 580 Dateien; das Inventar meldete nach Bereinigung und nach dem Scanner jeweils 0 Funde. Die unsignierte APK `unsigned/de.baremos.fristenrechner_10000.apk` hat 7 668 710 Bytes und SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`; sie ist bytegleich zur Referenz. Dies ist ein lokaler F-Droid-Nachweis.

## Veröffentlichungsrezept

Stand 2026-10-25. Das [Veröffentlichungsrezept](../scripts/fdroid/veroeffentlichung/de.baremos.fristenrechner.yml) ist für `metadata/de.baremos.fristenrechner.yml` im Repository `fdroiddata` vorbereitet. Es bleibt auf App 1.0.0, Versionscode 10000 und den vollständigen Commit `61e151091bb509240e16ef86d8a0ad04b44e4582` des öffentlichen Tags `v1.0.0` eingestellt. Die signierte APK liegt seit dem 2026-10-23 im GitHub-Release `v1.0.0`. Der [Merge Request 53867](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/53867) wurde wegen der Drei-Monats-Regel geschlossen; die Wiederöffnung ist für Anfang Januar 2027 vorgesehen. Die vollständige Probe am Rezeptstand `fae0b24` und die Merge-Request-Pipeline 2981625855 mit dem Rezept-Commit `c3a69a9c` belegen die frühere Fassung mit esbuild aus Debian. Sie sind historische Nachweise und belegen keinen vollständigen Build der folgenden Rezeptform 1.1. Review, Annahme und Build auf dem Buildserver von F-Droid stehen aus.

### Rezeptform 1.1 (Stufe 1)

Diese Rezeptänderung gilt bereits für den bestehenden Build-Eintrag 1.0.0; sie setzt keine neuen Skripte im Release-Commit voraus. Version, Versionscode, Commit, Scanner-Ausnahmen und Löschpfade bleiben unverändert. Das Rezept enthält weiterhin keine YAML-Kommentare; lange Befehle stehen mit eingerückten Fortsetzungszeilen in der Form von `fdroid rewritemeta`.

Das npm-Paket esbuild verlangt eine exakt gleiche Programmversion und bricht andernfalls ab. Debian forky übernimmt neue esbuild-Versionen binnen Tagen; eine ungepinnte Debian-Version kann deshalb einen unveränderten Build-Eintrag unbrauchbar machen. Statt des Debian-Pakets wird die bereits in fdroiddata vorhandene srclib `esbuild` aus `https://github.com/evanw/esbuild.git` mit dem Tag `v0.28.2` verwendet. Eine zusätzliche srclib-Datei im Veröffentlichungsordner ist dafür nicht erforderlich. Die fünf Verweise stehen in der Reihenfolge `rolldown@v1.2.9`, `astro-compiler-rs@v0.4.1`, `satteri@satteri-v0.10.5`, `lightningcss@v1.33.0`, `esbuild@v0.28.2`. `golang-go` ersetzt `esbuild` in der Debian-Paketliste. `go build -C "$$esbuild$$" ./cmd/esbuild` baut das Programm vor dem Web-Build; `ESBUILD_BINARY_PATH="$$esbuild$$/esbuild"` legt dessen Pfad fest. `scripts/app-bauen.mjs` reicht die Umgebung an den Web-Build weiter.

`sudo`, `prebuild` und `build` enthalten je einen Befehl pro Listeneintrag, ohne Verknüpfung durch `;` oder `&&` und ohne Teilshell. Ein eigenes `set -eu` entfällt: fdroidserver 2.4.2 verbindet die Einträge einer Phase mit `; ` und führt das resultierende Skript bereits mit `bash -e -u -o pipefail -x -c` aus (für `prebuild` und `build`: `build.py:639`, `common.py:2681`; für `sudo`: `build.py:491`). Ein `cd` gilt deshalb auch für die folgenden Einträge derselben Phase. `prebuild` und `build` beginnen jeweils mit `cd ../../..`.

In `prebuild` steht `npx --no-install cap telemetry off` im Ordner `app` vor `npx --no-install cap update android`. Die Cargo-Vorbereitung bleibt erhalten, einschließlich `cargo generate-lockfile` für Astro compiler-rs. In `build` steht jeder Rust-Build zwischen eigenen Einträgen `pushd "$$<srclib>$$"` und `popd`. So bleibt die Wurzel des vollständigen Quell-Workspaces das Arbeitsverzeichnis, und dessen `.cargo/config.toml` gilt wie beim bisherigen `cd`. `--manifest-path` ersetzt diesen Verzeichniswechsel nicht. Die vier `install -m644`-Aufrufe bleiben erhalten; Web-Build, `cap copy android` und die Vorbereitung nach dem Scanner folgen anschließend. In `build` stehen keine Installations- oder Downloadbefehle.

**Offen für Stufe 2 mit App 1.1.0:** feste `Cargo.lock` für Astro compiler-rs, Aufruf von `scripts/fdroid/werkzeuge-pruefen.mjs` in `prebuild` und `MaintainerNotes`. Diese Schritte sind nicht Teil der Rezeptform 1.1 (Stufe 1). Die neue Rezeptform benötigt vor der erneuten Einreichung einen vollständigen Build mit Scanner und Binärabgleich sowie die Prüfung mit `fdroid rewritemeta` und `fdroid lint`.

### Felder und getroffene Auswahl

Das Rezept nennt die Kategorie `Calculator`, die Lizenz `Apache-2.0`, BAREMOS IT Dienstleistungs GmbH als Herausgeber sowie dessen Website, die Rechnerseite, Quellcode und Fehlerberichte. `RepoType: git` und die öffentliche HTTPS-Adresse bestimmen die Quelle. `subdir: app/android/app` und `gradle: [yes]` wählen den Android-Release-Build. Name und Beschreibungen kommen aus den vorhandenen mehrsprachigen fastlane-Metadaten; eigene Felder dafür würden diese Angaben übersteuern. `AutoName: Fristenrechner Vergabe` nennt den Namen, den fdroidserver aus der App ausliest; der Job `checkupdates` der CI von `fdroiddata` verlangt dieses Feld (ergänzt am 2026-10-23). Die [F-Droid-Metadatenreferenz](https://f-droid.org/docs/Build_Metadata_Reference/) beschreibt die Felder.

`UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$` lässt nur Tags mit drei numerischen Versionsbestandteilen und dem Präfix `v` zu; Vorabversionen sind ausgeschlossen. Die aktuelle Version ist ausdrücklich als 1.0.0 / 10000 gesetzt. Der Build-Eintrag nennt den vollständigen Commit `61e151091bb509240e16ef86d8a0ad04b44e4582` des Tags `v1.0.0` (Entscheidung des fachlich Verantwortlichen vom 2026-10-23). Der Hinweis zum Feld `commit` in der Metadatenreferenz, gelesen am 2026-10-23, verlangt den vollständigen Commit statt eines Branch- oder Tagnamens; eine Begründung nennt die Seite nicht. Für `AutoUpdateMode: Version` mit `UpdateCheckMode: Tags` beschreibt dieselbe Referenz, dass automatisch erzeugte Build-Einträge den gefundenen Tag im Feld `commit` tragen. Die Probe verlangt für jeden Build-Eintrag, den die Maintainer selbst einreichen, den vollständigen Commit.

Testfassungen für Google Play, die nicht veröffentlicht werden, erhalten nie einen Tag der Form `v<Zahl>.<Zahl>.<Zahl>`; ist ein Tag nötig, gilt `test/<Version>-<Zähler>`, etwa `test/1.0.1-1` (Entscheidung des fachlich Verantwortlichen vom 2026-10-23). Der Tagfilter unterscheidet nicht zwischen Test- und Veröffentlichungsfassungen; `test/…` passt nicht auf den Filter.

Für `Binaries` gilt das Namensmuster `de.baremos.fristenrechner_%v_%c.apk` (Entscheidung des fachlich Verantwortlichen vom 2026-10-19): für diese Version also `de.baremos.fristenrechner_1.0.0_10000.apk` als signierter Anhang unter `https://github.com/baremos/fristenrechner/releases/download/v1.0.0/`. Beide Versionsangaben gehen in die feste Adresse ein; eine veränderliche Adresse wie `latest` wird nicht verwendet. Der Anhang muss vor der Prüfung durch F-Droid vorhanden sein. Seit dem 2026-10-23 liegt er im GitHub-Release `v1.0.0`: 7 678 242 Bytes, SHA-256 `05f376e3e83f0e015f524dbf38085b938463194babd08344ca10cca8b5aa1615`. Ein Abruf über die Adresse nach diesem Muster lieferte am selben Tag genau diese Datei. `AllowedAPKSigningKeys` enthält den SHA-256-Fingerabdruck des echten App-Signierzertifikats; der Test berechnet ihn aus dessen DER-Darstellung.

Als `Changelog` gelten die GitHub-Releases (Entscheidung vom 2026-10-19), weil dort Versionshinweise, Tag und signierter Anhang zusammen erreichbar sind. Die sprachabhängigen fastlane-Dateien `changelogs/10000.txt` bleiben die Quelle der Versionshinweise für die Anzeige im F-Droid-Client. Vor der Veröffentlichung müssen die Release-Texte dazu passen. Die Notiz des GitHub-Release `v1.0.0` enthält die Versionshinweise `changelogs/10000.txt` in de-DE und en-US im Wortlaut, ergänzt um Dateiname und SHA-256 der APK sowie den Fingerabdruck des Signaturzertifikats.

### Bei jeder neuen Fassung

1. Das `package-lock.json` des im Build-Eintrag genannten Commits prüfen, nicht das eines neueren Arbeitsbaums. Die fünf srclib-Tags müssen zu `node_modules/rolldown`, `node_modules/@astrojs/compiler-binding`, `node_modules/satteri`, `node_modules/lightningcss` und `node_modules/esbuild` passen: `rolldown@v<Version>`, `astro-compiler-rs@v<Version>`, `satteri@satteri-v<Version>`, `lightningcss@v<Version>` und `esbuild@v<Version>`.
2. Die fünf entfernten Plattformpakete für diese vier Bindungen und esbuild müssen im Lockfile jeweils dieselbe Version wie ihr Hauptpaket tragen. Der esbuild-Tag muss damit auch die exakt benötigte Binärversion festlegen. Der Rezepttest liest dazu `git show <commit>:package-lock.json`; CI holt die vollständige Historie. In einem flachen lokalen Klon ohne diesen Commit wird nur dieser Test mit klarer Meldung übersprungen; das ist kein Versionsnachweis.
3. Bei geänderten Paketversionen die srclib-Tags und die esbuild-Beschaffung prüfen und den Build-Eintrag in fdroiddata per Merge Request nachziehen. `AutoUpdateMode: Version` erledigt das nicht: Nach dem Quelltext von fdroidserver 2.4.2 (`checkupdates.py:626, 642–663`) übernimmt `checkupdates` den letzten Build-Eintrag per `deepcopy` einschließlich `srclibs` und setzt darin Version, Versionscode und Commit neu. Außerdem hebt es ein gesetztes `disable` auf und ändert `sudo` nur bei OpenJDK-11/17-Zeilen oder wenn der Block nur aus `apt-get update` besteht. Die `srclibs` bleiben unverändert. Auch die lokalen Rückfallnamen der Node-Bindungen ersetzen diesen Abgleich nicht.
4. Das Repo-Rezept in der kanonischen fdroiddata-Form halten, Rezepttests und `fdroid lint` ausführen, `rewritemeta` auf einen unveränderten zweiten Durchlauf prüfen und die fdroiddata-Pipeline einschließlich Binärabgleich der neuen Fassung auswerten. Vor der Veröffentlichung bleiben die Prüfschritte aus dem [Pflegekonzept](pflegekonzept.md#f-droid-bei-jeder-neuen-fassung) und die Freigabe durch den fachlich Verantwortlichen ([Verantwortung](pflegekonzept.md#verantwortung)) erforderlich.
5. Ab der Fassung nach 1.0.0 baut `assembleRelease` mit R8 ohne Umbenennung (siehe [app.md](app.md#r8-im-release-build)); der Code-Qualitäts-Hinweis „APK has no R8 Marker, R8 is not used“ der Pipeline sollte damit entfallen. Am Rezept ändert sich nichts; R8 liegt im Android-Gradle-Plugin. Belegt ist bisher nur die Bytegleichheit zweier frischer Windows-Builds; der Abgleich der R8-Fassung zwischen Linux-Build und signierter APK steht mit der nächsten Fassung an.

### Node und Vorbereitung des Builds

Node.js, npm, golang-go, cargo, rustc, build-essential und cmake werden über den `sudo`-Block mit Zielsuite forky (`apt-get install -t forky`) installiert. esbuild und die vier nativen Node-Bindungen werden aus den srclibs gebaut. Die Messungen und Festlegungen vom 23.10.2026 im folgenden Abschnitt dokumentieren die frühere Fassung mit Debian-esbuild; die Änderungen daran stehen unter [Rezeptform 1.1](#rezeptform-11-stufe-1). Der Block steht direkt nach `subdir`:

```yaml
    sudo:
      - echo "deb http://deb.debian.org/debian forky main" > /etc/apt/sources.list.d/forky.list
      - apt-get update
      - apt-get install -y -t forky nodejs npm golang-go cargo rustc build-essential
        cmake
```

Das Rezept legt die Suite, aber keine exakten Debian-Paketversionen fest. `prebuild` und `build` verwenden die Debian-Werkzeuge im Systempfad und für esbuild den ausdrücklich gesetzten srclib-Pfad; Download, Archivprüfung und Entpacken des Node-Archivs entfallen. `prebuild` und `build` wechseln jeweils mit dem ersten Eintrag `cd ../../..` von `app/android/app` in die Repositorywurzel. Der `sudo`-Block benötigt keinen Verzeichniswechsel. Alle drei Phasen verwenden die Fehleroptionen von fdroidserver und enthalten kein zusätzliches `set -eu`.

**Ersetzte Festlegung vom 2026-10-19:** Das frühere Veröffentlichungsrezept lud Node.js 24.21.0 in `prebuild` von `nodejs.org`, prüfte vor dem Entpacken mit `sha256sum --check --strict` die feste Prüfsumme aus `scripts/toolchain.json` und ergänzte den Suchpfad in `prebuild` und `build`. Archiv und Werkzeug lagen unter `$HOME/.cache/fristenrechner-fdroid`; die Bereitstellung erfolgte als Buildnutzer ohne Root-Rechte. Die unten dokumentierten lokalen Läufe bis zum 2026-10-23 vor der Umstellung gelten für diese frühere Fassung. Die Festlegung F3 und `scripts/node-einrichten.sh` betreffen weiterhin die lokale Einrichtung im Benutzerbereich; `scripts/fdroid/build-lokal.py` und die lokalen Rezepte bleiben bei diesem Weg ohne Root-Rechte.

**Ersetzte Fassung vom 2026-10-23 vor Option A:** Zunächst installierte `sudo` nur `npm` aus forky und damit Node.js als Abhängigkeit. Web-Build und `cap sync android` lagen weiterhin in `prebuild`; ein eingebettetes Node-Skript prüfte Sync-Zustand, Hinweise Dritter und Gradle-Konfiguration. Danach entfernte `npm-bereinigen.py` die Werkzeuge und schrieb `fdroid-bereinigung.json`; `scandelete` war nicht gesetzt. Pipeline 2980491535 bestand für genau diese Fassung. Das ist kein Nachweis für den folgenden Ablauf.

`prebuild` installiert die npm-Abhängigkeiten ohne Installationsskripte, entfernt sieben native Plattformpakete, legt `app/dist` und `app/android/app/src/main/assets/public` an und führt `npx --no-install cap telemetry off` vor `npx --no-install cap update android` im Ordner `app` aus. Danach wechselt es zurück in die Repositorywurzel und lädt die Cargo-Abhängigkeiten der vier Rust-srclibs. Der Scanner entfernt über `scandelete` die beanstandeten Dateien unter `node_modules/@capacitor/cli/assets` und drei einzeln benannte WASM-Dateien. Genau das Archiv `capacitor-cordova-android-plugins.tar.gz` bleibt durch `scanignore` für die Hinweise-Prüfung erhalten. In `build` werden esbuild mit Go und die vier Bindungen mit `cargo build --offline --release --locked` gebaut; `install -m644` setzt die Bindungen unter den lokalen Rückfallnamen der npm-Lader ein. Danach folgen `node scripts/app-bauen.mjs --web`, `npx --no-install cap copy android` im Ordner `app` und `node scripts/fdroid/app-vorbereiten.mjs --nach-scanner`; Gradle startet anschließend durch F-Droid. Die Befehle verwenden ausschließlich Skriptoptionen des Release-Commits; neue Prüfmodi werden nicht vorausgesetzt. E7 löst den Konflikt zwischen Archivlöschung und Hinweise-Prüfung. Der Probenachweis am Rezeptstand `fae0b24` und die Pipeline 2981625855 gelten für die frühere Fassung (siehe [Eingereichte Fassung](#eingereichte-fassung)).

`npm-bereinigen.py`, `fdroid-bereinigung.json` und das alte eingebettete Sync-Skript entfallen im Veröffentlichungsrezept. `--nach-scanner` prüft die erhaltenen Android-Quellen und braucht keinen Bereinigungsbericht. Maßgeblich bleibt der vollständige Binärabgleich durch F-Droid über `Binaries` und `AllowedAPKSigningKeys`. Die früheren zusätzlichen Sync-Prüfungen sind kein Nachweis für den neuen Ablauf.

### Werkzeuge aus Quelltext (23.10.2026)

Anlass ist der Maintainer-Kommentar vom 23.10.2026 im [Merge Request 53867](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/53867): sinngemäß Web-Build und Capacitor-Schritt nach `build` verlegen, keine vorgefertigten Binärdateien in `node_modules` verwenden und Werkzeuge aus Debian nehmen oder zuvor aus Quelltext bauen. Nach dem übermittelten Kommentar hat der Maintainer ausdrücklich erlaubt, ein Capacitor-Android-Vorlagenarchiv beim Scan zu überspringen; E7 setzt diese Ausnahme nach den unten genannten fdroiddata-Präzedenzfällen um. Andreas hat Option A entschieden. Die Messungen M1 bis M6 stammen vom 23.10.2026 aus einer WSL-Kopie mit Debian 13.5 und Paketen aus forky; die Bauzeiten mit Upstream-Release-Profil stehen im unten nachgetragenen vollständigen Probenachweis. Ergänzend baute eine Cloud-Gegenprobe unter Ubuntu 24.04 die vier Bindungen mit der Rust-Toolchain 1.97.1 über rustup und mit den Profilübersteuerungen aus M5 sowie esbuild 0.28.2 mit Go aus Quelltext; der Web-Build mit diesen Werkzeugen war auch dort bytegleich zum Lauf mit vorgefertigten Bindungen. Diese Angaben und der unten nachgetragene vollständige Probenachweis sind übernommene Laufbelege, keine Ausführung während der Rezeptbearbeitung.

#### Messungen vom 23.10.2026

**M1 – Debian-Werkzeuge.** Installiert waren `nodejs` `24.21.0+dfsg+~cs24.13.4-1`, `npm` `12.2.0+ds1-1`, `esbuild` `0.28.2-1` sowie `cargo` und `rustc` jeweils `1.97.1+dfsg1-1`, außerdem `build-essential` und `cmake`. `pkg-config` war installiert; für keinen der vier Builds ist seine Notwendigkeit belegt. Die Einzelmessungen protokollierten `build-essential` 12.12, `cmake` 4.3.4-1 und `pkg-config` 2.5.1-4; die vollständige Probe am selben Tag ergab für `build-essential` und `cmake` dieselben Versionen.

**M2 – Vier Bindungen bauen mit Debian-cargo 1.97.1.** Ohne rustup werden die Pins aus `rust-toolchain.toml` nicht ausgewertet: Rolldown 1.98.1, Astro compiler-rs 1.96.1, Satteri 1.95.0 und Lightning CSS 1.96.0. Debian forky liefert `rustc` und `cargo` 1.97.1. Damit liegt Rolldowns Pin über der tatsächlich verwendeten Fassung und der Build besteht trotzdem. Astro nennt in `Cargo.toml` zusätzlich `rust-version = 1.91.0`; ein künftiges `rust-version` oberhalb der Debian-Fassung würde den Build abbrechen. Im Rezept baut jedes Paket in der Wurzel seines vollständigen Quell-Workspaces; `prebuild` lädt die Abhängigkeiten vorher mit `cargo fetch --locked` (E6), `build` übersetzt mit `cargo build --offline --release --locked` (E8):

| srclib, Tag und gemessener Commit | Paket und Ergebnis |
|---|---|
| `rolldown@v1.2.9`, `5b4746e442989d770c606ce08d2737e6aafbd25d` | `-p rolldown_binding` → `target/release/librolldown_binding.so` |
| `astro-compiler-rs@v0.4.1`, `16dc5d1a51da8c77714e048f69f4ab51b0a04a89` | Kein `Cargo.lock` im Repository: zuerst `cargo generate-lockfile`, dann `-p astro_napi --features allocator` → `target/release/libastro_napi.so` |
| `satteri@satteri-v0.10.5`, `b3d38e1e341c809b20b76a655e9b1601d11bd1f0` | `-p satteri-napi` → `target/release/libsatteri_napi.so` |
| `lightningcss@v1.33.0`, `c6a0c3cebf3395635e61075d2c81a96a710d4910` | `-p lightningcss_node` → `target/release/liblightningcss_node.so` |

Alle vier Builds bestanden mit Debian-cargo 1.97.1: zuerst als Einzelbuilds in der WSL-Kopie mit den unter M5 genannten Abweichungen, dann in der vollständigen Probe mit den Befehlen des Rezepts und dem Upstream-Release-Profil. Deren Bauzeiten stehen im [Probenachweis](#vollständige-probe-am-rezeptstand-fae0b24); den Arbeitsspeicher hat die vollständige Probe nicht gemessen.

**M3 – damaliger Versuch mit esbuild aus Debian ohne Umgebungsvariable.** Der npm-Lader verwirft den wörtlichen Wert `ESBUILD_BINARY_PATH=/usr/bin/esbuild` absichtlich (`node_modules/esbuild/lib/main.js:1894`, `isValidBinaryPath = (x) => !!x && x !== "/usr/bin/esbuild"`). Debian installierte `/usr/lib/x86_64-linux-gnu/nodejs/@esbuild/linux-x64/bin/esbuild` als Verweis auf `/usr/bin/esbuild`; der Paketordner lag im globalen Node-Suchpfad. Wenn `node_modules/@esbuild/linux-x64` fehlte, startete der Web-Build `/usr/bin/esbuild --service=0.28.2 --ping`. Die Versionsprüfung auf 0.28.2 bestand. Ein eigener Verweis und `ESBUILD_BINARY_PATH` waren in diesem Versuch nicht nötig. Die Rezeptform 1.1 ersetzt diesen Weg durch den Quelltextbau und einen ausdrücklichen srclib-Pfad.

**Behobene Debian-Versionskopplung:** Das npm-Paket esbuild und das gestartete Programm müssen dieselbe Version haben, hier 0.28.2. Laut Debian-madison vom 2026-10-23 führten forky und sid jeweils `esbuild` 0.28.2-1; die frühere Rezeptfassung pinnte diese Paketversion nicht. Ein späterer Wechsel in forky konnte den Web-Build trotz unverändertem Lockfile abbrechen lassen. Rezeptform 1.1 baut deshalb die zur Lockfile-Version passende srclib `esbuild`. Der Binärversionsabgleich der Probe bleibt erforderlich; der vollständige Build dieser neuen Beschaffung ist gesondert nachzuweisen.

**M4 – `--omit=optional` verworfen.** `npm ci --omit=optional` entfernt auch optionale Abhängigkeiten von jsPDF: `canvg`, `dompurify`, `html2canvas`, `core-js`, `raf`, `rgbcolor`, `stackblur-canvas`, `svg-pathdata`, `text-segmentation`, `utrie`, `performance-now`, `regenerator-runtime`, `base64-arraybuffer`, `css-line-break`, `@types/raf` und `@types/trusted-types`. Die Prüfung „Hinweise Dritter“ in `node scripts/app-bauen.mjs --web` scheitert damit (Rückgabewert 1), obwohl die Web-Dateien gleich bleiben.

**M5 – Variante (a) mit lokalen Rückfallnamen bestanden.** Am Tag `v1.0.0` in einem GitHub-Klon mit Debian-Node und Debian-npm lief `npm ci --ignore-scripts --no-audit --no-fund`. Danach wurden `node_modules/@rolldown/binding-linux-x64-gnu`, `node_modules/@astrojs/compiler-binding-linux-x64-gnu`, `node_modules/@bruits/satteri-linux-x64-gnu`, `node_modules/lightningcss-linux-x64-gnu` und `node_modules/@esbuild/linux-x64` entfernt. Die selbst gebauten Bindungen lagen unter folgenden Rückfallnamen:

```text
node_modules/rolldown/dist/rolldown-binding.linux-x64-gnu.node
node_modules/@astrojs/compiler-binding/astro.linux-x64-gnu.node
node_modules/satteri/satteri_napi.linux-x64-gnu.node
node_modules/lightningcss/lightningcss.linux-x64-gnu.node
```

`node scripts/app-bauen.mjs --web` bestand mit Rückgabewert 0 einschließlich Rechenkern, Astro, K1, K2 und Hinweisen Dritter. Alle zehn Dateien unter `app/dist` waren bytegleich zum Lauf mit vorgefertigten Bindungen. Der Ladetrace erfasste genau diese vier Bindungen und `/usr/bin/esbuild`. **Grenze dieser Einzelmessung:** Diese Vergleichsprobe verwendete `CARGO_PROFILE_RELEASE_LTO=off` und `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16`, baute ohne `--locked` und die Astro-Bindung ohne `--features allocator`; für sich belegt sie keinen vollständigen APK-Build mit dem Originalprofil nach E2 und den Befehlen nach E8. Diesen Nachweis liefert die unten dokumentierte vollständige Probe am Rezeptstand `fae0b24`.

**M6 – Verbleibende Dateien nach Variante (a).** Im Baum lagen die folgenden Dateien; keine wurde laut Ladetrace als Programm, native Bindung oder WASM im Web-Build geladen. Das schließt das Lesen eines Archivs als Hashbeleg durch die Hinweise-Prüfung nicht aus:

```text
node_modules/@capacitor/cli/assets/android-template.tar.gz
node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz
node_modules/@capacitor/cli/assets/capacitor-cordova-ios-plugins.tar.gz
node_modules/@capacitor/cli/assets/ios-pods-template.tar.gz
node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz
node_modules/@astrojs/astro2tsx/astro2tsx.wasm32-wasi.wasm
node_modules/shiki/dist/onig.wasm
node_modules/xxhash-wasm/workerd/xxhash.wasm
node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node
node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7
```

#### Festlegungen vom 23.10.2026

Die folgende Tabelle dokumentiert den damaligen Stand. Für das aktuelle Rezept ersetzt [Rezeptform 1.1](#rezeptform-11-stufe-1) die esbuild-Beschaffung aus E3 und E10 sowie die Befehlsform aus E6 und E8.

| Nr. | Festlegung für das Veröffentlichungsrezept |
|---|---|
| E1 | Version 1.0.0, Code 10000 und Commit `61e151091bb509240e16ef86d8a0ad04b44e4582` bleiben unverändert. Aufgerufen werden nur Skripte und Optionen dieses Commits; neue Abläufe stehen direkt im Rezept. Neue Prüfoptionen entfallen. Der Binärabgleich mit der signierten Release-APK über `Binaries` und `AllowedAPKSigningKeys` bleibt maßgeblich. |
| E2 | `cargo` und `rustc` aus Debian forky, kein rustup. Die vier Builds verwenden das jeweilige Upstream-Release-Profil ohne LTO-/Codegen-Übersteuerung. Die vollständige Probe am Rezeptstand `fae0b24` hat die Bytegleichheit am 2026-10-23 nachgewiesen. |
| E3 | esbuild ausschließlich aus Debian; `node_modules/@esbuild/linux-x64` wird entfernt. Keine Zeile mit `ESBUILD_BINARY_PATH`. |
| E4 | Normales `npm ci --ignore-scripts --no-audit --no-fund`, kein `--omit=optional`. Vor dem Scanner werden die fünf Plattformpakete aus M5 sowie `node_modules/@img/sharp-linux-x64` und `node_modules/@img/sharp-libvips-linux-x64` entfernt. Damit bleiben keine vorgefertigten `.node`-Dateien dieser sieben Pakete im Baum. |
| E5 | Vier Dateien unter `scripts/fdroid/veroeffentlichung/srclibs/`, für die Übernahme nach `fdroiddata/srclibs/`: `rolldown.yml`, `astro-compiler-rs.yml`, `satteri.yml`, `lightningcss.yml`. Jede enthält nur `RepoType: git` und `Repo`; zulässig wären außerdem `Subdir` und `Prepare`, beide werden nicht benötigt. Quellen sind `https://github.com/rolldown/rolldown.git`, `https://github.com/withastro/compiler-rs.git`, `https://github.com/bruits/satteri.git` und `https://github.com/parcel-bundler/lightningcss.git`. Die Rezeptverweise verwenden die Tags aus M2 nach dem Muster von `au.how2vote.app`. Der Name `astro-compiler-rs` ordnet das sonst allgemeine `compiler-rs` Astro zu. Im lokal vorhandenen fdroiddata-Stand vom 23.10.2026 gab es für die vier Namen und Repository-URLs keine Kollision; das Minimalformat entspricht den vorhandenen srclibs `esbuild` und `rollup`. |
| E6 | `prebuild` darf Abhängigkeiten laden: npm-Installation, Entfernen der sieben Pakete, Vorbereiten des Web- und Assets-Verzeichnisses für `npx --no-install cap update android` im Ordner `app`, dann Cargo-Fetch. Für Rolldown, Satteri und Lightning CSS jeweils `cargo fetch --locked --manifest-path $$<srclib>$$/Cargo.toml`; für Astro davor `cargo generate-lockfile --manifest-path $$astro-compiler-rs$$/Cargo.toml`, danach ebenfalls Fetch mit `--locked`. |
| E7 | `scanignore` enthält genau `node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz`. `scandelete` enthält genau den Ordner `node_modules/@capacitor/cli/assets` sowie `node_modules/@astrojs/astro2tsx/astro2tsx.wasm32-wasi.wasm`, `node_modules/shiki/dist/onig.wasm` und `node_modules/xxhash-wasm/workerd/xxhash.wasm`. Die Ausnahme hat Vorrang: Das für die Hinweise-Prüfung benötigte Archiv bleibt erhalten; die übrigen vier Capacitor-Archive und drei WASM-Dateien werden entfernt. Jeder Eintrag muss einen Scannerfund treffen. Dies ersetzt die erste Fassung von E7 mit fünf einzelnen Archivlöschungen. |
| E8 | `build` verwendet für die vier Pakete und Features aus M2 `cargo build --offline --release --locked` jeweils in der Wurzel der srclib, damit die `.cargo`-Konfigurationen gelten (Rolldown: `WORKSPACE_DIR`; Lightning CSS: GNU-Linkerflags). Danach kopiert es die vier `.so` mit `install -m644` an die Rückfallnamen aus M5, baut das Web mit `node scripts/app-bauen.mjs --web`, führt `npx --no-install cap copy android` im Ordner `app` und danach `node scripts/fdroid/app-vorbereiten.mjs --nach-scanner` aus. Keine npm-Installation oder Downloadbefehle in `build`. `prebuild` und `build` beginnen mit `set -eu` und setzen jeweils das nötige Arbeitsverzeichnis. |
| E9 | `python3 scripts/fdroid/npm-bereinigen.py …` entfällt im Veröffentlichungsrezept. F5 vom 30.09.2026 gilt nur noch für lokale Reproduzierbarkeitsläufe mit `scripts/fdroid/build-lokal.py`; deren Rezepte und Nachweise bleiben erhalten. |
| E10 | `sudo`: genau drei Zeilen, die forky-Quelle schreiben, `apt-get update`, `apt-get install -y -t forky nodejs npm esbuild cargo rustc build-essential cmake`. Die frühere erste Zeile `set -eu` entfällt ohne Änderung der Wirkung, weil fdroidserver 2.4.2 bereits `bash -e -u -o pipefail -x -c` verwendet. `pkg-config` wird ohne Bedarfsbeleg nicht ergänzt. |

**Präzedenzfälle für E7:** Im lokal vorhandenen fdroiddata-Stand vom 23.10.2026 behalten die Rezepte `au.how2vote.app`, `com.degeder.yam`, `com.iTrack.app`, `com.noorconnect.app` und `io.github.nyxar77.pulse` in ihren entsprechenden Build-Einträgen genau `capacitor-cordova-android-plugins.tar.gz` per `scanignore` und setzen daneben `scandelete` für den übergeordneten npm-Baum. Bei `au.how2vote.app` liegt das Archiv unter dem pnpm-Pfad, bei `com.iTrack.app` unter `project/node_modules`. Unser Rezept begrenzt den Ordner für die Archivlöschungen auf `node_modules/@capacitor/cli/assets` und nennt die drei WASM-Dateien einzeln.

**Scannerbeleg:** In der lokal gelesenen Fassung 2.4.2 löst `common.py:2727–2743` die Metadatenpfade mit `glob` gegen den vorhandenen Quellbaum auf; schon ein Pfad ohne Treffer führt zu einer Ausnahme. `scanner.py:759–773` prüft diese Pfade als Präfixe der beanstandeten Datei und markiert den jeweiligen Metadateneintrag als benutzt. `scanner.py:868–871` prüft dabei `scanignore` vor `scandelete`. Der Scanner durchläuft einzelne Dateien (`scanner.py:932–951`), und `removeproblem` löscht nur die betreffende Datei mit `os.remove(filepath)` (`scanner.py:813–824`), nicht den ganzen in `scandelete` genannten Ordner. Daher bleibt das ausgenommene Archiv erhalten. Die fünf `.tar.gz`-Dateien liefern „gzip file archive“-Funde (`scanner.py:982–985`): Das Cordova-Android-Archiv nutzt den `scanignore`-Eintrag, die übrigen vier nutzen den Ordner in `scandelete`. Die drei WASM-Dateien liefern jeweils einen „WebAssembly binary file“-Fund (`scanner.py:1006–1012`) für ihren eigenen `scandelete`-Eintrag. Aufgelöste, aber bei keinem Fund verwendete Einträge erzeugen „Unused scanignore path“ beziehungsweise „Unused scandelete path“ und erhöhen den Fehlerzähler (`scanner.py:1112–1120`). Damit sind bei den unter M6 belegten Dateien alle fünf Metadateneinträge genutzt. Dies belegt die Regel von 2.4.2, nicht den tatsächlichen Lauf des neuen Rezepts oder die aktuelle CI-Scannerfassung.

**Archivzugriff am Release-Stand:** Mit `git show 61e1510:…` wurde die Aufrufkette von `node scripts/app-bauen.mjs --web` geprüft: `scripts/app-bauen.mjs:100–101` → `scripts/check-licenses.mjs:439` → `scripts/hinweise-pruefung.mjs:235` → `scripts/hinweise-dritter.mjs:319–320`, `271–275`, `244–245`, `117–123` und `128–138`. Die Hinweise-Prüfung liest und hasht von den Capacitor-Archiven ausschließlich das in `scripts/hinweise-dritter.json:1031–1032` belegte `capacitor-cordova-android-plugins.tar.gz`. `android-template.tar.gz` und die iOS-Archive werden dort nicht gelesen. Der Web-Modus endet in `scripts/app-bauen.mjs:164` vor dem Capacitor-Sync in Zeile 173. Die neue E7-Ausnahme erhält damit genau den für diesen Aufruf benötigten Archivbeleg.

**Verlauf – Prüfung der Rezeptbearbeitung am Rezeptstand `fae0b24` (23.10.2026):** `node --test scripts/fdroid-veroeffentlichung.test.mjs scripts/fdroid-probe-veroeffentlichung.test.mjs` besteht mit 162 von 162 Tests, ohne übersprungene Tests. Die Prüfungen umfassen die genaue `scanignore`-/`scandelete`-Belegung und Gegenproben für fehlende oder zusätzliche Ausnahmen und falsche Löschpfade. Die tatsächliche Hinweise-Prüfung scheitert bei simulierter Löschung aller fünf Archive und besteht, wenn nur das Cordova-Android-Archiv erhalten bleibt; die Lesezugriffe bestätigen dabei genau dieses eine Archiv, während die übrigen vier Archive und drei WASM-Dateien verborgen sind. Die Syntaxprüfung des Probeskripts mit Git Bash (`bash -n`) und `git diff --check` bestehen ebenfalls. Die Prüfungen liefen ohne Netz, WSL oder Build und ergänzen den statischen Scannerbeleg; sie ersetzen keinen vollständigen Web-, Scanner- oder APK-Lauf des Rezepts.

**Offline-Prüfung nach der Kanonisierung am 2026-10-23:** Beide Testdateien bestehen gemeinsam mit 202 von 202 Tests, ohne übersprungene Tests. Ergänzt sind Gegenproben zur kanonischen Rezeptform, zum Lockfile des Build-Commits, zum Bytevergleich nach `rewritemeta`, zur nichtinteraktiven Root-Umgebung und zum Versions-/Tagabgleich von esbuild und den vier srclibs. Die Bash-Syntaxprüfung besteht; `git diff --check` meldet keine Whitespace-Fehler. Danach wurden die Zeilenenden des Rezepts nach den neuen Attributen auf LF umgestellt; die Datei ist bytegleich zur fdroiddata-Fassung (SHA-256 `6f2c9bcae98041812c875eda9adb191bd07ee1c1733304b93813d71fc4000f50`), und beide Testdateien bestanden auch danach mit 202 von 202 Tests. Diese Offline-Prüfung führte keinen vollständigen Build aus.

#### Vollständige Probe am Rezeptstand fae0b24

Nachtrag vom 2026-10-23: Die vollständige Probe des Rezepts aus `fae0b24` bestand in einer frischen, entbehrlichen WSL-Instanz mit Debian 13. Sie lief mit der unmittelbar vor dem Commit erstellten Rezeptfassung; diese unterschied sich von `fae0b24` nur durch drei YAML-Kommentarzeilen, die übergebenen Metadaten waren gleich. Probe und Build liefen als root; die forky-Pakete wurden durch den `sudo`-Block des Rezepts installiert. Die Probe lief von 13:21 bis 13:58 UTC (37 Minuten). Darin führte fdroidserver 2.4.2-1 aus Debian `fdroid build --verbose de.baremos.fristenrechner:10000` von 13:23 bis 13:58 UTC aus (35 Minuten), Rückgabewert 0. Die Quelle wurde von GitHub am Tag `v1.0.0` geklont; nach dem Build waren Tag-Commit und Build-Commit weiterhin `61e151091bb509240e16ef86d8a0ad04b44e4582`.

| Debian-Paket | Installierte Version |
|---|---|
| build-essential | 12.12 |
| cargo | 1.97.1+dfsg1-1 |
| cmake | 4.3.4-1 |
| esbuild | 0.28.2-1 |
| nodejs | 24.21.0+dfsg+~cs24.13.4-1 |
| npm | 12.2.0+ds1-1 |
| rustc | 1.97.1+dfsg1-1 |

Node meldete `v24.21.0` aus `/usr/bin/node`, npm `12.2.0`. Die vier srclib-Commits stimmten mit den Tags aus M2 überein:

| srclib | Tag | Commit | Cargo-Build mit Upstream-Release-Profil |
|---|---|---|---|
| rolldown | v1.2.9 | `5b4746e442989d770c606ce08d2737e6aafbd25d` | `rolldown_binding`: 11 min 14 s |
| astro-compiler-rs | v0.4.1 | `16dc5d1a51da8c77714e048f69f4ab51b0a04a89` | `astro_napi`: 6 min 27 s |
| satteri | satteri-v0.10.5 | `b3d38e1e341c809b20b76a655e9b1601d11bd1f0` | `satteri-napi`: 4 min 29 s |
| lightningcss | v1.33.0 | `c6a0c3cebf3395635e61075d2c81a96a710d4910` | `lightningcss_node`: 6 min 2 s |

Die Probe lief in WSL 2 auf einem Rechner mit vier Kernen und acht Threads, ohne Begrenzung der Cargo-Jobs und ohne Übersteuerung von LTO oder Codegen-Einheiten. Der Rechner war dabei nicht exklusiv belegt; die Bauzeiten sind Anhaltswerte. Der Scanner entfernte `app/android/gradle/wrapper/gradle-wrapper.jar`, die drei WASM-Dateien aus E7 und vier Capacitor-Archive: `ios-pods-template.tar.gz`, `ios-spm-template.tar.gz`, `android-template.tar.gz` und `capacitor-cordova-ios-plugins.tar.gz`. Für `capacitor-cordova-android-plugins.tar.gz` meldete er „Ignoring“; es gab keinen weiteren Befund.

`node scripts/app-bauen.mjs --web` bestand mit K1 und K2 für die zehn Dateien unter `app/dist`. Die Hinweise-Prüfung meldete keinen Fehler; am gebauten Commit `61e1510` gibt sie nur Fehler aus. `cap copy android` war erfolgreich. Gradle meldete `BUILD SUCCESSFUL` nach 1 min 37 s. Die unsignierte APK hat 7 668 710 Bytes und SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`; sie ist bytegleich zur unsignierten Release-Referenz 1.0.0.

**Grenzen:** Kein echter Buildserver; eigenes `HOME` und eigene Caches, kopiertes Android SDK und gepinnter Gradle-Starter. Probe und Build als root belegen nicht die Berechtigungen eines regulären Buildnutzers. `Binaries` wurde nur aus der Probenkopie entfernt; Release-Anhang und Signaturübernahme wurden in dieser Probe nicht geprüft. Nach der Probe erfolgten nur die kanonische Darstellung des Rezepts, das Entfernen der wirkungslosen `sudo`-Zeile sowie Änderungen an Probe, Tests, Doku, `.gitattributes` und am Checkout der CI; keine davon wirkt auf den Build. Ein vollständiger lokaler Neubau wurde dafür nicht wiederholt; die kanonische Fassung hat die Merge-Request-Pipeline 2981625855 gebaut (siehe [Eingereichte Fassung](#eingereichte-fassung)).

#### Pflegeposten und verbleibende Grenzen

1. Der neu aufgelöste Astro-`Cargo.lock` und die installierten Debian-Paketversionen müssen bei weiteren Proben im Laufnachweis erhalten bleiben. `generate-lockfile` kann später andere transitive Versionen wählen; `--locked` fixiert nur das innerhalb des jeweiligen Laufs erzeugte Ergebnis. Die sieben Debian-Paketversionen der bestandenen Probe sind oben beziffert.
2. Die genaue Versionskopplung von npm-esbuild und dem gebauten Programm bleibt erforderlich; Rezeptform 1.1 legt sie über den srclib-Tag statt über die bewegliche Debian-Version fest. Bei jeder neuen Fassung sind alle fünf srclib-Tags gegen das Lockfile des Build-Commits zu prüfen und erforderliche Änderungen per Merge Request in fdroiddata nachzuziehen.
3. Vollständige Probe, kanonischer Fixpunkt und Review der Rezeptform 1.1 sowie die Annahme durch F-Droid stehen aus. Die gezielte Archiv-Ausnahme nach E7 bleibt erhalten. Der vollständige lokale APK-Abgleich und der kanonische Fixpunkt vom 2026-10-23 sowie die Pipeline 2981625855 belegen die frühere Rezeptfassung einschließlich Abruf des Release-Anhangs, Binärabgleich mit der signierten APK und Prüfung des zugelassenen Signierers. Ein Build auf dem Buildserver von F-Droid ist damit nicht nachgewiesen.

### Eingereichte Fassung

**Eingereichter Stand vom 23.10.2026:** Das damalige Repo-Rezept war zugleich die kanonische fdroiddata-Fassung für Option A nach E1 bis E10. `fdroid rewritemeta` mit fdroidserver 2.4.2 unter Debian 13 erzeugte die Form; erneutes Umschreiben einer Kopie ließ die Bytes unverändert (Fixpunkt). `AllowedAPKSigningKeys` steht als Skalar nach `Builds`, und `UpdateCheckMode` bleibt dieselbe Zeichenkette ohne YAML-Anführungszeichen; YAML-Kommentare enthält die Datei wie schon `fae0b24` nicht (`rewritemeta` würde sie nicht übernehmen). Die einzige Änderung am Ablauf gegenüber `fae0b24` ist das Entfernen des wirkungslosen `set -eu` im `sudo`-Block. `fdroid lint` mit `config/categories.yml` aus fdroiddata hatte keinen Befund außer der yamllint-Meldung „trailing spaces“ für `Binaries: ` in Zeile 15. Dieses Leerzeichen gehört zur kanonischen Form mit umbrochener URL; 1 014 übrige Rezepte im lokal vorhandenen fdroiddata-Stand vom 23.10.2026 hatten dieselbe Zeile. Die LF-Fassung hat SHA-256 `6f2c9bcae98041812c875eda9adb191bd07ee1c1733304b93813d71fc4000f50`; `.gitattributes` schreibt LF für das Rezept und die srclibs vor und nimmt nur dieses Rezept von der Prüfung auf Leerzeichen am Zeilenende aus. Rezept und vier bytegleiche srclib-Dateien liegen im fdroiddata-Fork als Commit `c3a69a9c`; der fachlich Verantwortliche hat ihn am 2026-10-23 in den Merge Request gepusht.

Die vollständige Probe am Rezeptstand `fae0b24` mit Originalprofilen, Scanner und unsigniertem APK-Abgleich bestand. Nach der damaligen Kanonisierung und den Änderungen an Probe, Tests, Dokumentation, `.gitattributes` und am Checkout der CI wurde sie nicht erneut ausgeführt: Die kanonische Darstellung und die entfernte `sudo`-Zeile änderten den Build nicht. Für Rezeptform 1.1 bleibt eine neue vollständige Probe offen.

**Pipeline der kanonischen Fassung vom 2026-10-23:** Mit `c3a69a9c` bestand die Merge-Request-Pipeline 2981625855 mit allen neun Jobs, wieder mit der CI-Konfiguration von `fdroiddata` im Fork und dem Image `fdroidserver:buildserver-trixie`. Der Job `fdroid build` dauerte 21 min 28 s. Er installierte die Pakete aus dem `sudo`-Block in denselben Versionen wie die vollständige Probe; `build-essential` 12.12 kam auch hier aus dem trixie-Index. Der Scanner entfernte dieselben Dateien wie in der Probe und meldete für `capacitor-cordova-android-plugins.tar.gz` „Ignoring“. Die vier Cargo-Builds mit Upstream-Release-Profil meldeten 6 min 31 s (`rolldown_binding`), 3 min 4 s (`astro_napi`), 1 min 42 s (`satteri-napi`) und 4 min 29 s (`lightningcss_node`). K1 und K2 bestanden für die zehn Dateien unter `app/dist`, `cap copy android` war erfolgreich, und Gradle meldete `BUILD SUCCESSFUL` nach 1 min 25 s. Der Job meldete „Successfully built de.baremos.fristenrechner:10000 from 61e151091bb509240e16ef86d8a0ad04b44e4582“, verglich die gebaute APK erfolgreich mit der signierten APK aus dem GitHub-Release `v1.0.0` („compared built binary to supplied reference binary successfully“) und bestätigte den Signierer `ae5d4d7ec4d3ee63763e128a3fb00721c7d164206f066dc26e8e968ff9a92e68` als zugelassen. Belegt ist damit der reproduzierbare Build von Option A mit dem Build-Image von F-Droid; ein Lauf auf dem Buildserver von F-Droid, das Review und die Annahme durch die Maintainer stehen aus. Stand der Labels am 2026-10-23: `New App` und `waiting-for-upstream`. Die folgenden Angaben zur abweichenden lesbaren und eingereichten Fassung bleiben als Verlauf erhalten. Der damalige Stand des Merge Requests war: in Prüfung.

**Verlauf bis zum dritten Commit `d1d4578b`:** Die Datei `metadata/de.baremos.fristenrechner.yml` im Merge Request wurde mit `fdroid rewritemeta` aus fdroidserver 2.4.2 in die von `fdroiddata` verwendete Form gebracht. Nach der ersten Umstellung auf Debian forky unterschieden sich die damalige eingereichte und die lesbare Fassung nur in Darstellung und Reihenfolge: `AllowedAPKSigningKeys` stand als einzelner Wert nach den Builds, lange Zeilen waren umbrochen, und das mehrzeilige Node-Skript im `prebuild` stand als Zeichenkette mit Zeilenumbruch-Escapes statt als Block. Der damalige `sudo`-Block und die übrigen Build-Schritte stimmten inhaltlich überein. Am 2026-10-23 trug keines der 7 165 übrigen Rezepte in `fdroiddata` einen mehrzeiligen `|-`-Block für das Node-Skript, 33 verwendeten die Zeichenkettenform. Beim Umbrechen fügte `rewritemeta` 2.4.2 vor `const sync` im Node-Skript ein Leerzeichen am Zeilenanfang ein; für JavaScript war das ohne Wirkung. Ein zweiter Lauf änderte die Datei nicht mehr, `fdroid lint` meldete keine Beanstandung. Diese Formatprüfung erfolgte vor und nach der ersten Umstellung auf forky jeweils in einem Prüfordner unter Linux mit der Konfiguration aus `fdroiddata`, weil ein Klon unter Windows die symbolischen Links unter `srclibs` als Textdateien auscheckt und fdroidserver daran abbricht.

Der damalige Stand des Merge Requests enthielt drei Commits für diese eine Datei: die Datei selbst, das Feld `AutoName`, das der Job `checkupdates` verlangte, und `d1d4578b` mit der Umstellung auf Debian forky. Alle drei Commits tragen den Autor „BAREMOS IT GmbH“ mit der privaten Commit-Adresse des GitLab-Kontos `baremos`. Die ersten Pipelines im eigenen Fork starteten keinen Job, weil GitLab für das Konto eine Identitätsprüfung verlangte. Die Merge-Request-Pipeline 2980263409 lief am 2026-10-23 mit der CI-Konfiguration von `fdroiddata` im Fork; alle neun Jobs bestanden, darunter `fdroid lint`, `fdroid rewritemeta`, `checkupdates`, `check apk` und `fdroid build`. Der Build-Job auf dem Image `fdroidserver:buildserver-trixie` meldete „Successfully built de.baremos.fristenrechner:10000 from 61e151091bb509240e16ef86d8a0ad04b44e4582“, lud die signierte APK aus dem GitHub-Release `v1.0.0`, verglich sie erfolgreich mit dem eigenen Build („compared built binary to supplied reference binary successfully“) und bestätigte den Signierer `ae5d4d7ec4d3ee63763e128a3fb00721c7d164206f066dc26e8e968ff9a92e68` als zugelassen.

**Pipeline der vorherigen Rezeptfassung vom 2026-10-23:** Nach dem dritten Commit `d1d4578b` bestand die Merge-Request-Pipeline 2980491535 mit allen neun Jobs, erneut mit der CI-Konfiguration von `fdroiddata` im Fork und dem Image `fdroidserver:buildserver-trixie`. Der Job `fdroid build` installierte Node.js `24.21.0+dfsg+~cs24.13.4-1` und npm `12.2.0+ds1-1` aus forky, baute `de.baremos.fristenrechner:10000` aus `61e151091bb509240e16ef86d8a0ad04b44e4582`, verglich die gebaute APK erfolgreich mit der signierten Referenz und bestätigte denselben zugelassenen Signierer. Die Code-Qualitäts-Hinweise enthalten einen Eintrag der Stufe `minor` („APK has no R8 Marker, R8 is not used“), alle übrigen sind Info-Einträge. Der Maintainer setzte die Labels `New App` und `waiting-for-upstream`. Belegt ist der reproduzierbare Build dieser vorherigen Rezeptfassung mit dem Build-Image von F-Droid; daraus folgt kein Nachweis für Option A. Ein Lauf auf dem Buildserver von F-Droid und die Annahme durch die Maintainer stehen aus.

### Probe unter Debian

[`probe-veroeffentlichung.sh`](../scripts/fdroid/probe-veroeffentlichung.sh) setzt Debian 13, fdroidserver 2.4.2, OpenJDK 21, die im Skript geprüften Werkzeuge sowie das vorhandene Android SDK und den in `scripts/toolchain.json` festgelegten Gradle-Starter voraus. Im Systempfad darf vorher kein `node`, `nodejs`, `npm` oder `npx` vorhanden sein; andernfalls bricht die Probe ab. Ein bereits eingerichtetes Node im bisherigen Benutzerverzeichnis wird nicht übernommen. Ein neues `HOME`, eigene Zwischenspeicher, eine SDK-Kopie und der geprüfte Gradle-Starter liegen im übergebenen Arbeitsordner. Node.js und npm werden durch die `sudo`-Schritte des Rezepts systemweit installiert. Alle Pfade werden als absolute Linux-Pfade übergeben; `--help` nennt die Argumente.

Beim Aufruf von `bash scripts/fdroid/probe-veroeffentlichung.sh` ist zusätzlich zu den Pfadargumenten `--erwarteter-commit <40-Hex-Zeichen>` Pflicht: anzugeben ist der erwartete vollständige Commit des nach dem Merge erstellten Release-Tags. Die Probe gleicht Version und Versionscode zwischen `app-referenz.json` und Veröffentlichungsrezept ab. Das Feld `commit` im Build-Eintrag muss aus genau 40 Hex-Zeichen in Kleinschreibung bestehen und mit `--erwarteter-commit` übereinstimmen; Tagnamen, Kurzformen, Großbuchstaben und abweichende Hashes führen zum Abbruch. Die Probe klont das öffentliche Repository am Tag `v<versionName>` und prüft vor und nach dem Build, dass der Tag auf den erwarteten Commit zeigt; die Metadaten legt sie in einem frischen F-Droid-Arbeitsordner ab. Als ausdrücklich gewählter Ersatz ist mit `--quelle` ein lokaler Klon oder ein Git-Bundle möglich; diese Abweichung wird protokolliert. Das ersetzt nur den Zugriff auf GitHub, nicht die weiteren Downloads des Builds. Ein vorab geklonter Quellbaum liefert fdroidserver den Zeitpunkt des Quellstands; dafür wird kein zusätzlicher Commit angelegt.

Die Probe kopiert die vier Dateien aus `scripts/fdroid/veroeffentlichung/srclibs/` in `srclibs/` ihres frischen fdroiddata-Arbeitsverzeichnisses. Für esbuild stellt sie dort zusätzlich die bereits in fdroiddata vorhandene Definition mit `RepoType: git` und `Repo: https://github.com/evanw/esbuild.git` bereit; im Veröffentlichungsordner wird keine fünfte srclib-Datei angelegt. fdroidserver holt die fünf Quellbäume anhand dieser Definitionen und der Tags im Rezept selbst über das Netz. Ein vorhandener manueller Quellklon wird nicht als Ersatz vorausgesetzt.

Die `sudo`-Schritte liest die Probe aus der YAML-Datei und führt sie vor dem lokalen `fdroid build` selbst aus; dieser führt sie lokal nicht aus. Entsprechend fdroidserver 2.4.2 verwendet sie `DEBIAN_FRONTEND=noninteractive bash -e -u -o pipefail -x -c`; als root braucht die Probe dafür kein vorgeschaltetes `sudo`. Mit solchen Schritten ist der Start als root in einer entbehrlichen, eigens dafür vorgesehenen Distribution erforderlich. Dabei läuft auch der lokale Build als root; die Probe protokolliert dies als Abweichung und weist damit keine Ausführung mit den Rechten eines regulären Buildnutzers nach. Der Servermodus wird nicht nachgestellt.

Nach den `sudo`-Schritten und vor `fdroid build` protokolliert die Probe mit `dpkg-query` die installierten Debian-Paketversionen von `nodejs`, `npm`, `golang-go`, `cargo`, `rustc`, `build-essential` und `cmake`. Außerdem prüft sie die Systempfade `/usr/bin/node` und `/usr/bin/npm` und protokolliert beide Programmversionen. Für Node.js verlangt sie die exakte Referenzversion aus `scripts/toolchain.json`, derzeit 24.21.0. So bleibt der Nachweis an eine definierte Werkzeugversion gebunden; eine spätere abweichende Version aus forky führt bewusst zum Abbruch und erfordert einen erneuten Abgleich. Der unterstützte `engines`-Bereich allein genügt der Probe nicht. Für npm wird die Debian-Version protokolliert; die lokale Referenz 11.19.0 gilt hier nicht als Prüfvorgabe.

Vor den bewussten Probe-Anpassungen an `Repo` und `Binaries` schreibt die Probe zunächst die unveränderte Rezeptkopie mit `fdroid rewritemeta de.baremos.fristenrechner` um und vergleicht sie byteweise mit dem Stand davor; eine Abweichung bricht mit „Rezept ist nicht in der kanonischen Form von fdroid rewritemeta“ ab. Nach diesen Anpassungen wird die für den Build bestimmte Kopie mit einem zweiten `rewritemeta`-Aufruf erneut kanonisiert; erst dann folgt `fdroid build`. Die INFO-Meldung „Rewriting …“ von `--list` wäre dafür kein Nachweis. Nach dem Build vergleicht sie `build/srclib/esbuild/esbuild --version` aus dem F-Droid-Arbeitsordner mit `node_modules/esbuild/package.json` des App-Build-Ordners und schreibt beide Werte in `ergebnis.json`. Für jede srclib protokolliert sie den gebauten Commit und verlangt dessen Gleichheit mit `git rev-parse '<tag>^{commit}'`. `git describe` genügt nicht, weil mehrere Tags auf denselben Commit zeigen können, wie bei Satteri und Astro compiler-rs. Diese Prüfungen wurden nach dem vollständigen Lauf am Rezeptstand `fae0b24` ergänzt; dessen Nachweis wird dadurch nicht rückwirkend erweitert.

**Vollständige Probe von Option A bestanden:** Am 2026-10-23 bestand das Rezept am Stand `fae0b24` in einer frischen, entbehrlichen Debian-13-Instanz einschließlich E7 und APK-Abgleich; der ausführliche Nachweis steht unter [Werkzeuge aus Quelltext](#vollständige-probe-am-rezeptstand-fae0b24). Die `sudo`-Schritte tragen forky in das Debian-System ein und können Systempakete einschließlich `libc6` aktualisieren. Deshalb bleibt die entbehrliche Distribution Voraussetzung. Als Verlauf gilt: Die erste Umstellung allein von Node.js und npm auf forky wurde lokal nicht wiederholt; für sie bestand die Pipeline 2980491535. Die folgenden datierten lokalen Läufe dokumentieren die frühere Fassung ohne `sudo`.

Nur aus der Metadatenkopie für die Probe wird `Binaries` entfernt. fdroidserver 2.4.2 würde sonst nach dem Build bereits den signierten Release-Anhang laden und prüfen; siehe [Implementierung der Binärprüfung](https://github.com/f-droid/fdroidserver/blob/2.4.2/fdroidserver/build.py#L1210-L1297). Originalrezept, verwendete Metadaten und Abweichung werden gesichert. Der Aufruf lautet `fdroid build --verbose de.baremos.fristenrechner:10000`. Die Probe protokolliert fdroid-, Node-, npm-, Java- und Gradle-Version, vergleicht Größe und SHA-256 der erzeugten unsignierten APK mit der übergebenen Referenz und sichert Protokolle und Metadaten im Ausgabeordner. Die Referenz wird zusätzlich gegen `app-referenz.json` geprüft: 7 668 710 Bytes, SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`. Der vollständige Arbeitsordner bleibt erhalten.

Ein bestandener Lauf belegt den lokalen Build mit der jeweils geprüften Rezeptfassung, die darin enthaltene Node-Beschaffung und den Vergleich der unsignierten APK in dieser Umgebung. Er belegt keinen echten F-Droid-Buildserver, keinen funktionierenden Release-Anhang, keine Signaturübernahme, keinen Merge Request und keine Annahme durch F-Droid.

**Lauf zur Fassung 0.2.0 vom 2026-10-19:** Die Probe lief unter Debian 13.5 in WSL 2 als regulärer Benutzer ohne Root-Rechte, mit fdroidserver 2.4.2-1, OpenJDK 21.0.12.1 und einem neuen, leeren Benutzerverzeichnis; im Systempfad war kein Node vorhanden. Der Klon von GitHub am Tag `v0.2.0` zeigte auf `5843a92`. Das Rezept lud Node.js 24.21.0 selbst, die Prüfsumme stimmte, `fdroid build` endete mit Rückgabewert 0 (Beginn 09:19, Ende 09:22 MESZ), Gradle 8.14.5 kam über den gepinnten Starter aus dem geprüften Archiv. Die unsignierte APK `unsigned/de.baremos.fristenrechner_200.apk` hat 7 668 594 Bytes und die SHA-256 der damaligen Referenz 0.2.0; dies ist ein weiterer bytegleicher Build dieser Fassung; die übrigen Builds sind im [Build-Nachweis zur Fassung 0.2.0 in app.md](app.md#build-nachweis-zur-fassung-020-vom-2026-10-19) dokumentiert. Protokollierte Abweichungen: lokaler Build statt Buildserver, eigenes Benutzerverzeichnis mit SDK-Kopie und gepinntem Gradle-Starter, `Binaries` nur aus der Probenkopie entfernt. Der Merge Request wird erst nach dem [Nachweis N6 zum Wechsel zwischen den Vertriebswegen](signierung.md#nachweise-für-die-abnahme) und mit einem eigenen ausdrücklichen Go gestellt.

**Lauf zur Fassung 1.0.0 vom 2026-10-22:** Die Probe lief unter Debian 13 in WSL 2 als regulärer Benutzer ohne Root-Rechte, mit fdroidserver 2.4.2, OpenJDK 21.0.12.1 und einem neuen, leeren Benutzerverzeichnis; im Systempfad war kein Node vorhanden, das Rezept enthält keine `sudo`-Schritte. Aufgerufen mit `--erwarteter-commit 61e151091bb509240e16ef86d8a0ad04b44e4582`, klonte sie das öffentliche Repository von GitHub am Tag `v1.0.0`; der Commit vor und nach dem Build war `61e1510`. Das Rezept lud Node.js 24.21.0 selbst, `sha256sum --check --strict` bestätigte die Prüfsumme. `fdroid build` endete mit Rückgabewert 0 und meldete den Build der Version 1.0.0 aus diesem Commit (Beginn 19:51, Ende 19:54 MESZ); Gradle 8.14.5 kam über den gepinnten Starter. Die unsignierte APK `unsigned/de.baremos.fristenrechner_10000.apk` hat 7 668 710 Bytes und die SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`; sie ist bytegleich zur Referenz und damit der sechste bytegleiche Build dieser Fassung; die übrigen sind im [Build-Nachweis zur Fassung 1.0.0 in app.md](app.md#build-nachweis-zur-fassung-100-vom-2026-10-22) dokumentiert. Protokollierte Abweichungen wie bei 0.2.0: lokaler Build statt Buildserver, eigenes Benutzerverzeichnis mit SDK-Kopie und gepinntem Gradle-Starter, `Binaries` nur aus der Probenkopie entfernt. Release-Anhang und Signaturübernahme prüft die Probe nicht; sie stehen im Nachtrag zur Fassung 1.0.0 in [signierung.md](signierung.md#geplanter-ablauf). Der Merge Request an `fdroiddata` folgte am 2026-10-23, siehe [Eingereichte Fassung](#eingereichte-fassung).

**Lauf mit vollständigem Commit im Build-Eintrag vom 2026-10-23:** Nach der Umstellung des Build-Eintrags auf `commit: 61e151091bb509240e16ef86d8a0ad04b44e4582` lief die Probe erneut unter Debian 13 in WSL 2 als regulärer Benutzer ohne Root-Rechte, mit `--erwarteter-commit 61e151091bb509240e16ef86d8a0ad04b44e4582`. Der Klon von GitHub am Tag `v1.0.0` zeigte auf diesen Commit. fdroidserver meldete „Getting source for revision 61e151091bb509240e16ef86d8a0ad04b44e4582“, holte die Quelle mit `git fetch` und checkte sie mit `git checkout -f` am vollständigen Commit aus; HEAD und Tag zeigten nach dem Build weiterhin auf `61e1510`. `fdroid build` endete mit Rückgabewert 0 (Beginn 08:28, Ende 08:33 MESZ). Die unsignierte APK `unsigned/de.baremos.fristenrechner_10000.apk` hat 7 668 710 Bytes und die SHA-256 `42b592a8ad5f8443e763f3df598a7c5c77ae8a544c531a9c96d5b1f2b5aa16cd`; sie ist bytegleich zur Referenz. Protokollierte Abweichungen wie beim Lauf vom 2026-10-22.

## Nächste Schritte

1. Erledigt am 2026-09-29: Node.js und das Android SDK unter Linux eingerichtet, nach F3 und F4.
2. Erledigt am 2026-09-29: Minimal-App unter Linux gebaut, ohne die Werkzeuge von F-Droid.
3. Erledigt am 2026-09-29: vier lokale Aufrufe von `fdroid build` in Debian; Lauf 3 und 4 mit `--versuch-scandelete` ergaben die bytegleiche Minimal-APK.
4. Erledigt am 2026-09-29: Legacy-Warnung als eng begrenzte bekannte Meldung bewertet, Archivprüfung durch Lauf 4 belegt; dessen Neuauswertung mit `4c66c04` besteht ohne Beanstandung mit neun bekannten Meldungen.
5. Erledigt am 2026-09-30: drei App-Läufe auf `5c43ced`; gezielte Bereinigung ohne `scandelete` baut erfolgreich und bytegleich. Ohne Bereinigung zehn Scannerfehler; mit ergänzendem `scandelete` Abbruch am ungenutzten Eintrag. F6 ist mit `Calculator` festgelegt.
6. Erledigt am 2026-09-30: F5 ist anhand dieser Nachweise festgelegt, gezielte Bereinigung ohne `scandelete`.
7. Erledigt, Stand 2026-10-04: angepasste Auswertung kreuzweise geprüft; vollständige Testläufe unter Windows und Linux am Nachweisstand `8987e69` liegen vor, siehe [Abschlusslauf](#lauf-am-endstand-vom-2026-10-04) und [App-Nachweise](app.md).
8. Erledigt am 2026-10-04: Release-Builds ohne F-Droid in zwei Linux-Klonen und unter Windows sowie Wiederholung mit Bereinigung und Scanner am fertigen App-Stand; APKs bytegleich. Der Nachweis mit dem dann verwendeten Buildserver von F-Droid bleibt gesondert offen.
9. Erledigt am 2026-10-22 und 2026-10-23: Probe der früheren Fassung des Veröffentlichungsrezepts am Tag `v1.0.0` bestanden, signierte APK im GitHub-Release `v1.0.0`. Ebenfalls erledigt am 2026-10-23: vollständiger Commit im Build-Eintrag und Tag-Muster für unveröffentlichte Testfassungen für Google Play festgelegt (siehe [Felder und getroffene Auswahl](#felder-und-getroffene-auswahl)). Am selben Tag festgelegt: Commits im Merge Request tragen den Namen „BAREMOS IT GmbH“ und die private Commit-Adresse des GitLab-Kontos `baremos`. Ebenfalls am 2026-10-23 eingereicht: [Merge Request 53867](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/53867), inzwischen mit dem dritten Commit `d1d4578b` für Node.js und npm aus Debian forky auf Wunsch des Maintainers. Die Merge-Request-Pipeline 2980491535 dieser Fassung bestand mit allen neun Jobs, einschließlich Build und Abgleich mit der signierten APK; die lokale Probe wurde wegen der systemweiten Paketänderungen nicht wiederholt. Stand der Labels am 2026-10-23: `New App` und `waiting-for-upstream`. Offen sind der Abschluss der Prüfung durch F-Droid, die Annahme und der Build auf dem Buildserver von F-Droid.
10. Am 2026-10-23 wurde Option A mit vier Bindungen aus Quelltext, esbuild und Rust aus Debian sowie Web-Build in `build` umgesetzt; Fassung 1.0.0 blieb unverändert. Die vollständige Probe am Rezeptstand `fae0b24` bestand am selben Tag mit Originalprofilen, Scanner ohne weiteren Befund und bytegleicher unsignierter APK. E7 erhält das für die Hinweise-Prüfung benötigte Archiv. Nach der damaligen Kanonisierung erfolgte keine weitere vollständige lokale Probe; die kanonische Fassung bestand am selben Tag die Merge-Request-Pipeline 2981625855 einschließlich Build und Binärabgleich. Diese Nachweise gelten für die damalige Rezeptfassung.
11. Rezeptform 1.1 (Stufe 1) ersetzt esbuild aus Debian durch die passende srclib und vereinfacht die Befehlslisten für den bestehenden Build-Eintrag 1.0.0. Vollständige Probe, kanonischer Fixpunkt und Review bleiben offen. Merge Request 53867 ist wegen der Drei-Monats-Regel geschlossen; die Wiederöffnung ist Anfang Januar 2027 vorgesehen. Die drei Änderungen der Stufe 2 bleiben bis App 1.1.0 offen (siehe [Rezeptform 1.1](#rezeptform-11-stufe-1)).
