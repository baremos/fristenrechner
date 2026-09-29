# Build für F-Droid

Stand 2026-09-29 · Arbeitspaket 2.8, vier lokale Läufe mit der Minimal-App

## Zweck

F-Droid baut jede App selbst aus den Quellen und prüft sie vorher mit einem Scanner. Dieses Dokument hält fest, wie der Nachweis dafür lokal geführt wird, was bisher geprüft ist und was offen bleibt.

Das Arbeitspaket hat zwei Teile. Die frühe Probe mit einer Minimal-App zeigt, woran der Weg scheitern kann, bevor die App entsteht. Der vollständige Build mit Scanner folgt am Ende von Stufe 2, wenn Oberfläche und App vorliegen.

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

Jede Festlegung fällt, bevor das betreffende Werkzeug installiert wird. F1 bis F4 sind getroffen. F5 und F6 sind offen.

| Nr. | Thema | Festlegung oder Vorschlag | Begründung |
|---|---|---|---|
| F1 | Fassung von fdroidserver | **festgelegt am 2026-09-28:** 2.4.2 aus Debian 13, als Stand des lokalen Nachweises | Debian liefert signierte Pakete und Sicherheitsaktualisierungen. Die Änderungen bis 2.4.5 betreffen Versionen, die Debian 13 nicht enthält (Befund 6). Eine Installation über PyPI brächte einen zweiten Paketweg. Der abschließende Nachweis hält zusätzlich fest, welchen Stand der Buildserver von F-Droid nutzt. |
| F2 | Gradle im Build für F-Droid | **festgelegt am 2026-09-29:** Gradle 8.14.5 bleibt; lokal gilt `gradlew-fdroid` mit Commit `c7227d147483979bb5c408048cee3533a8814fb0`. Quelle, SHA-256 und Ablage stehen im folgenden Abschnitt und in `scripts/toolchain.json`. | Ein Wechsel auf fdroidserver 2.4.5 löst die Frage nicht (Befund 3). Das Projekt hat laut dem gelesenen Stand keine Marken. Die Festlegung fixiert das Programm, nicht die nachgeladenen Prüfsummendaten. |
| F3 | Node.js unter Linux | **festgelegt am 2026-09-28:** Archiv von nodejs.org mit der Prüfsumme oben, abgelegt im Benutzerbereich | wie unter Windows: Referenzversion, keine Installation im System |
| F4 | Android SDK unter Linux | **festgelegt am 2026-09-28:** Kommandozeilenwerkzeuge 22.0 für Linux nach `scripts/toolchain.json`, nur die Gruppe „Build" | Der Emulator läuft unter Windows. Wer installiert, bestätigt die Lizenz selbst. Das `sdkmanager` von F-Droid wird dafür nicht verwendet. |
| F5 | Vorgebaute Programme in `node_modules` | **Vorschlag, nicht entschieden:** entbehrliche Buildwerkzeuge nach Web-Build und `cap sync` gezielt entfernen; `scandelete` ergänzend erproben. Für jede verbleibende Datei Herkunft, Lizenz, Verwendung und Behandlung einzeln festhalten. | Lauf 2 stoppt an zehn Dateien; Lauf 3 entfernt sie mit `scandelete` und baut die Minimal-App bytegleich. Die Inventare zeigen zugleich fünf weitere native Dateien, die der Scanner nicht zur Entfernung meldet. Einzelheiten und Grenzen stehen unter F5. |
| F6 | Kategorie bei F-Droid | offen | Die Liste der Kategorien gehört zu den Daten von F-Droid und liegt in der Probe nicht vor. |

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

Nach dem Build vergleicht das Skript `fdroid-cache/gradle-8.14.5-bin.zip` mit der festgelegten `bin`-Prüfsumme in `toolchain.json` und schreibt Pfad, Größe und SHA-256 nach `gradle-archiv.json`. Das ist ein zusätzlicher Nachweis nach der Ausführung, keine vorgeschaltete Prüfung durch `gradlew.py`. Innerhalb eines Laufs kann Gradle mehrfach gestartet und der entpackte Stand wiederverwendet werden. `gradle_checksums.json` und gegebenenfalls `etag` liegen ebenfalls unter `fdroid-cache`. Die Gradle-Abhängigkeiten liegen getrennt unter `gradle-home`; deren Prüfsummenfestlegung bleibt offen.

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

Der normale Aufruf hat weder `scanignore` noch `scandelete`. Für den ausdrücklich bezeichneten Vergleich gibt es `--versuch-scandelete`: Nur dessen erzeugtes Rezept erhält `scandelete: [node_modules]`, entsprechend dem Muster der gelesenen Capacitor-Rezepte. Das ist ein Versuch zur offenen F5, keine freigegebene Regel für die App. Der Scanner entfernt dabei nur erkannte beanstandete Dateien, nicht den ganzen Ordner. Eingebettetes WASM kann übrig bleiben. Die drei Gradle-Dateien von Capacitor Android, Filesystem und Share müssen nach dem Scanner noch vorhanden sein; sonst bricht der Build ab. Die vollständigen Android-Quellen werden weiterhin vom Scanner erfasst.

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

Am 2026-09-29 direkt an den vorhandenen lokalen Quellen unter Windows geprüft, ohne Download. Astro und Vite stammen aus `node_modules` einer Installation mit Versionen und Paket-Integrity nach dem Lockfile des Repositorys auf Stand `eaf3939`. Capacitor ist auf diesem Stand keine Abhängigkeit des Repositorys; seine Quellen stammen aus der vorhandenen separaten Minimal-App-Installation (`@capacitor/cli` 8.5.2, `@ionic/cli-framework-output` 2.2.8, jeweils `package.json:3`). Die npm-Quellen stammen aus der mit Node.js 24.21.0 für Windows ausgelieferten npm-Installation. Die Gradle-Quellen liegen im vorhandenen entpackten Archivbaum `gradle-8.14.5-all`, Unterordner `gradle-8.14.5`. Die folgenden Gradle-Pfade beginnen dort, npm-Pfade an der npm-Paketwurzel und alle übrigen Pfade am jeweiligen `node_modules`-Ordner.

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
| 1, `lauf-j3yi1ch9` | Kein Git-Repository im Laufordner. Vor dem Holen der Quelle Abbruch in `set_FDroidPopen_env`: `TypeError: str expected, not NoneType`. Scanner nicht erreicht, keine APK. | 0 |
| 2, `lauf-zoz605j4` | Rezept im Laufordner eingecheckt. Quelle geholt, `prebuild` und `Cleaning Gradle project` mit `BUILD SUCCESSFUL`; anschließend zehn Scannerfehler unter `node_modules`, `1 build failed`, keine APK. | 0 |
| 3, `lauf-05pd1ynl` | Als `--versuch-scandelete` gekennzeichnet. Scanner entfernt die zehn beanstandeten Dateien und `android/gradle/wrapper/gradle-wrapper.jar`. Android-Build endet erfolgreich; die unsignierte APK ist bytegleich zu den Vergleichsbuilds ohne F-Droid unter Linux und Windows. | 0 |
| 4, `lauf-9qp3h2qf` | Rezept und Skripte auf Stand `d5fe6a7`, erneut mit `--versuch-scandelete`. Build gelungen, APK bytegleich zu Lauf 3; Gradle-Archiv unter `fdroid-cache` nachgewiesen. Auswertung mit `d5fe6a7`: eine Beanstandung zur Dauer `1.53s`; neu ausgewertet mit `eaf3939`: keine Beanstandung, neun bekannte Meldungen. | 0 |

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

Die ursprüngliche Auswertung von Lauf 4 mit `d5fe6a7` endete mit Rückgabewert 1: Als einzige Beanstandung blieb `16:30:00 [build] 1 page(s) built in 1.53s` (Zeile 65 des Buildprotokolls). Die erneute Auswertung mit `eaf3939` endete mit Rückgabewert 0, ohne Beanstandung und mit neun bekannten Meldungen aus den sechs aufgeführten Meldungstypen. Die gesicherte ursprüngliche `auswertung.json` bleibt unverändert; die erfolgreiche Neuauswertung ist separat in `linux-28-lauf4-auswertung.log` belegt (nicht im Repository). `d5fe6a7` und `eaf3939` bezeichnen die Stände der Rezeptskripte; gebaut wurde weiterhin die Minimal-App auf `d27fb91`.

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

Beleggrundlage sind `linux-28-vorbereitung.log`, `linux-28-lauf1.log` bis `linux-28-lauf4.log`, `linux-28-lauf4-auswertung.log`, die zugehörigen `build.log`, `lauf.json`, `rueckgabe.json`, Rezepte, Konfigurationen, Inventare und Lockfiles sowie `fdroid-quelle-lesen.log`. Diese gesicherten Originalnachweise und Begleitprotokolle liegen nicht im Repository; das gilt auch für `gradle-archiv.json` aus Lauf 4. Öffentlich enthalten sind nur die unten genannten anonymisierten Testprotokolle. Die Vorbereitung der Skripte in Debian auf Stand `512e298` meldet 524 bestandene und sechs übersprungene Tests bei Rückgabewert 0; beide Probeläufe waren erfolgreich. Das ist der damalige Prüfstand, kein Testlauf der jetzt angepassten Skripte.

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

## F5: Trennung nach dem aktuellen Lockfile, Vorschlag

Gelesen am 2026-09-29: Lockfile und installierte Quellen zum Stand `908821a`. Mit Astro gilt die frühere Aussage „nur Tests“ für Rolldown, Lightning CSS und es-module-lexer nicht mehr. Die Tabelle zeigt Abhängigkeitspfade und gelesene Verwendung; sie behauptet nicht, dass jede Minimal-Seite jeden optionalen Programmteil ausführt. Lizenzangaben stammen aus dem Lockfile und ersetzen keine Prüfung eingebetteter Bestandteile.

| Paket, Version | Lizenzangabe | Verwendung im aktuellen Baum | Vorschlag für F5 |
|---|---|---|---|
| `@astrojs/compiler-binding-linux-x64-gnu` 0.4.1 | MIT | Astro 7.3.3 → compiler-rs → compiler-binding; Übersetzung von Astro | Für Web-Build; anschließend entfernen |
| `@esbuild/linux-x64` 0.28.2 | MIT | Astro → esbuild; Client-Direktiven und Umgebungsvariablen | Für Web-Build; anschließend entfernen |
| `@rolldown/binding-linux-x64-gnu` 1.2.9 | MIT | Astro → Vite 8.3.0 → Rolldown; auch Vitest → Vite | Build und Tests; anschließend entfernen |
| `lightningcss-linux-x64-gnu` 1.33.0 | MPL-2.0 | Astro/Vitest → Vite; CSS-Verarbeitung | Build und Tests; konkrete Nutzung je Build prüfen, anschließend entfernen |
| `es-module-lexer` 2.3.2 | MIT | Astro und Vitest; eingebettetes WASM | Build und Tests; ganzes entbehrliches Paket anschließend entfernen |
| `xxhash-wasm` 1.1.0 | MIT | Astro; Inhalts- und Font-Werkzeuge, WASM auch eingebettet | Nutzung im konkreten Build feststellen, anschließend entfernen |
| `@bruits/satteri-linux-x64-gnu` 0.10.5 | MIT | Astro → markdown-satteri → Satteri; bedarfsabhängige Markdown-Verarbeitung | Ohne Markdown Bedarf nicht belegt; spätestens anschließend entfernen |
| Shiki / `@shikijs/engine-oniguruma` 4.4.3 | MIT | Astro → Shiki; Syntaxfärbung mit eingebettetem WASM | Nutzung durch Minimal-Seite nicht belegt; spätestens anschließend entfernen |
| `@img/sharp-linux-x64` 0.35.4 / `@img/sharp-libvips-linux-x64` 1.3.3 | Apache-2.0 / LGPL-3.0-or-later | Astro → optionales Sharp; Bildverarbeitung | Möglichst schon vorher gezielt entfernen und Build belegen |
| `@astrojs/astro2tsx` 0.1.1 | MIT | `@astrojs/check` → language-server; WASM | Nur Typprüfung; getrennt vom App-Build behandeln |
| Vitest 4.1.11 und eigene Testpakete | MIT | Tests; die nativen Vite-Werkzeuge werden auch von Astro genutzt | Tests gesondert ausführen; Vitest allein zu entfernen beseitigt die geteilten Programme nicht |

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

### Vorschlag für das spätere Rezept, keine Festlegung

**Empfehlung zur Erprobung: beides mit getrennten Aufgaben.** Im `prebuild` nach Web-Build **und** `cap sync android` die entbehrlichen npm-Werkzeuge anhand einer geprüften Paketliste gezielt entfernen. Das umfasst auch ganze entbehrliche Pakete mit eingebettetem WASM, native `.node`-Dateien sowie CLI-Vorlagen. Die Java-/Kotlin-Quellen und Gradle-Dateien von `@capacitor/android`, `@capacitor/filesystem` und `@capacitor/share` bleiben erhalten. Dass die zehn Scannerdateien nach `cap sync` für den Android-Build der Minimal-App entbehrlich sind, ist durch Lauf 3 belegt. Für die fünf `.node`-Dateien und weitere Pakete ist der entsprechend bereinigte Build erst noch nachzuweisen.

Ergänzend `scandelete` für die untersuchten npm-Bereiche erproben und jede dadurch entfernte Datei im Bericht behalten. Es soll neu hinzugekommene Scannerfunde sichtbar machen, aber nicht die gezielte Bereinigung ersetzen: Der beobachtete Scanner entfernt die fünf `.node`-Dateien nicht und bietet keinen Vollständigkeitsnachweis für eingebettetes WASM. Unerwartete Löschungen müssen ins Review des Rezepts; eine pauschale `scanignore`-Ausnahme wird nicht vorgeschlagen.

| Variante | Bewertung anhand von Lauf 2 und 3 |
|---|---|
| Nur `scandelete: [node_modules]` | Der Android-Build der Minimal-App gelingt; die Bereinigung erfasst aber nur die vom Scanner erkannten Dateien. |
| Nur gezieltes Löschen nach Web-Build und `cap sync` | Macht die Trennung der Werkzeuge von den Android-Quellen überprüfbar und kann auch `.node` sowie eingebettetes WASM erfassen; Liste und Build müssen bei Änderungen der Pakete erneut geprüft werden. |
| Gezielt löschen, ergänzend `scandelete` | Vorschlag für den nächsten Versuch: bewusste Paketbereinigung plus ausgewiesene Scanner-Löschungen; kein Ersatz für Inventar, Lizenzen und Prüfung des ausgelieferten Inhalts. |

Vor einer Entscheidung zu F5 fehlen ein zusätzlicher Vergleich des Inventars nach der gezielten Bereinigung, nach dem Scanner und mit dem Inhalt der APK sowie ein erfolgreicher Build der späteren App. Die breite `scandelete`-Probe allein belegt weder die vollständige Entfernung vorgebauter Programme noch die Annahme durch F-Droid.

`--omit=dev` trennt diese Rollen nicht zuverlässig. `--omit=optional` entfernt auch benötigte Compiler- und Bundler-Pakete. Plattformpakete für macOS, Windows, musl und WASM-Ausweichpakete sind von tatsächlich unter Debian x64 verwendeten Programmen zu unterscheiden.

Die Minimal-App `d27fb91` hat ein anderes Lockfile: 488 Einträge mit `resolved`, nach `npm ci` 394 installierte Pakete. Beispielsweise enthält sie astro2tsx 0.1.0 statt 0.1.1 aus der ersten Tabelle. Die aktuelle saubere Linux-Kopie des Paket-Repositorys hat 321 installierte Pakete und 412 Fremdpakete laut Lizenzprüfung; sie ist ebenfalls kein vollständiger App-Build. Die erste Tabelle darf deshalb nicht als beobachtete Paketliste der Minimal-App oder der fertigen Android-App gelesen werden.

## Prüfung der ersten Fassung der Skripte unter Windows

Geprüft am 2026-09-29 mit Node.js 22.23.2 und npm 10.9.8, ohne Downloads: 107 neue Tests mit `node:test`, davon 18 für die Einrichtung, 66 für die Build-Auswertung und 23 für Vorbereitung und Inventar. Jeder Test enthält einen gültigen Fall und eine Gegenprobe, die scheitern muss. Die Tests stellen HTTPS, Git- und Buildprozesse nach; Protokolle und APK-ZIPs sind Testdaten. Sie sind kein Nachweis eines echten F-Droid-Builds. Die Syntaxprüfung beider neuen Bash-Einstiege mit dem vorhandenen Git Bash ist bestanden.

Der damalige gesamte Aufruf `npm test` bestand mit 530 Skripttests, 134 Kerntests und 68 Oberflächentests, ohne Fehler oder übersprungene Tests. `npm run check` bestand: 15 Dateien der Oberfläche, 0 Fehler, 1 Hinweis auf eine ungenutzte Variable; Astro meldete außerdem das fehlende Seitenverzeichnis des Komponentenpakets. `npm run build` bestand und baute nur den Rechenkern. `npm run lizenzen` bestand für 412 Fremdpakete. Diese Zahlen beschreiben die erste Fassung vor der Anpassung an die drei echten Protokolle. Die Lizenzprüfung erteilt keine F-Droid-Freigabe für vorgebaute Programme.

## Prüfung der angepassten Skripte unter Windows

Erneut geprüft am 2026-09-29 mit Node.js 24.21.0, npm 11.19.0 und Python 3.14.6: Zuerst besteht `node --test scripts/fdroid-build-auswertung.test.mjs` mit 190 Tests, danach `npm test` mit 656 Skripttests, 134 Kerntests und 68 Oberflächentests; beide Aufrufe mit Rückgabewert 0, ohne Fehler oder übersprungene Tests. Die Skripttests enthalten die 190 Prüfungen der Build-Auswertung sowie 25 Prüfungen der Build-Vorbereitung und Inventur. Die Dauerprüfungen umfassen 796 Fälle: 158 gültige Ausgaben und 638 Gegenproben. Weitere Gegenproben prüfen ASCII-Ziffern, die Laufzeit des Inventarmusters, Warnungstext und Steuerzeichen in Pfadteilen sowie die sichtbare Darstellung beanstandeter Rohzeilen. Der Erfolgstest mit `scandelete` verwendet das echte anonymisierte Lauf-3-Protokoll einschließlich der Legacy-Warnung. Die übrigen Tests prüfen unter anderem andere uuid-Versionen, andere veraltete npm-Pakete, geänderte SDK-Zahlen, andere Kotlin-Dateien, Zeilen, Spalten und Wortlaute, falsche Kontexte sowie überschrittene Höchstzahlen für jeden bekannten Meldungstyp. Protokolle aus den ersten drei Debian-Läufen liegen anonymisiert unter `scripts/fdroid/fixtures/`; die Tests benötigen keine privaten Dateien.

Danach liefen nacheinander `npm run check`, `npm run build` und `npm run lizenzen`, jeweils mit Rückgabewert 0. Die Typprüfung umfasst 15 Dateien der Oberfläche: 0 Fehler, 0 Warnungen im Diagnoseergebnis, 1 Hinweis auf die ungenutzte Variable `runde2Aktiv`. Astro meldet zusätzlich das fehlende Seitenverzeichnis des Komponentenpakets. Der Build baut weiterhin nur den Rechenkern; die Lizenzprüfung umfasst 412 Fremdpakete: 24 ausgeliefert, 288 bereitgestellt, 100 für Tests und Build. Ein neuer Android- oder F-Droid-Build wurde dabei nicht ausgeführt.

Zusätzliche Gegenproben vergleichen das Verhalten vor und nach der Korrektur: Eine Unicode-Ziffer sowie Warnungstext und ESC in Pfadteilen wurden vorher angenommen und werden jetzt beanstandet. Eine Inventarzeile mit 64 000 wiederholten Trennern überschritt vorher das Zeitlimit von fünf Sekunden (Abbruch nach 5,02 Sekunden); die eingegrenzte Fassung war nach 0,187 Sekunden fertig. Der Vergleich endete wie erwartet mit Rückgabewert 0. Diese Laufzeitmessung gilt für den genannten lokalen Prüflauf.

Nach Ergänzung der Prüfungen für Steuerzeichen, Leerraum und sichtbare Unicode-Darstellung am 2026-09-29 erneut mit Node.js 24.21.0, npm 11.19.0 und Python 3.14.6 geprüft: Die Build-Auswertung besteht mit 202 Tests; `npm test` besteht mit 675 Skripttests, 134 Kerntests und 68 Oberflächentests. Beide Aufrufe enden mit Rückgabewert 0, ohne Fehler oder übersprungene Tests. Unter Debian 13.5 mit Node.js 24.21.0 und Python 3.13.5 besteht die Build-Auswertung ebenfalls mit 202 Tests. Die zwölf zusätzlichen Tests prüfen INFO- und DEBUG-Kopftexte mit Steuer- oder Trennzeichen, LF und CRLF gegenüber anderen Trennern, ein einzelnes CR am Dateiende, sichtbare Unicode-Escapes, reine Leerraumzeilen an mehreren Stellen und den zusätzlichen Marker `x build succeeded`. Typprüfung, Build und Lizenzprüfung enden ebenfalls jeweils mit Rückgabewert 0; Umfang und Hinweise dieser drei Prüfungen sind gegenüber dem oben beschriebenen Stand unverändert. Die vier echten Protokolle ergeben weiterhin die Rückgabewerte 1, 1, 0 und 0; Lauf 3 und 4 bleiben als `scandelete`-Versuche gekennzeichnet.

## Nächste Schritte

1. Erledigt am 2026-09-29: Node.js und das Android SDK unter Linux eingerichtet, nach F3 und F4.
2. Erledigt am 2026-09-29: Minimal-App unter Linux gebaut, ohne die Werkzeuge von F-Droid.
3. Erledigt am 2026-09-29: vier lokale Aufrufe von `fdroid build` in Debian; Lauf 3 und 4 mit `--versuch-scandelete` ergaben die bytegleiche Minimal-APK.
4. Erledigt am 2026-09-29: Legacy-Warnung als eng begrenzte bekannte Meldung bewertet, Archivprüfung durch Lauf 4 belegt; dessen Neuauswertung mit `eaf3939` besteht ohne Beanstandung mit neun bekannten Meldungen.
5. Den vorgeschlagenen bereinigten Build erproben und F5 anhand der Inventare und Vergleichsläufe entscheiden; F6 bleibt offen.
6. Am Ende von Stufe 2: alles mit der App wiederholen; den Nachweis mit dem dann verwendeten Buildserver von F-Droid gesondert führen.
