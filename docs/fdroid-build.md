# Build für F-Droid

Stand 2026-09-29 · Arbeitspaket 2.8, frühe Probe und Entwurf des lokalen Rezepts

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
| F5 | Vorgebaute Programme in `node_modules` | keine pauschale Ausnahme. Zuerst trennen, was der Build der App braucht und was nur die Tests brauchen. Für jede verbleibende Datei Herkunft, Lizenz, Verwendung und Behandlung einzeln festhalten. | Die 28 Einträge aus `lizenzen.md` sind Einträge des Lockfiles für alle Betriebssysteme, nicht 28 Programme im Build unter Linux. Wie andere Rezepte vorgehen, zeigt Befund 7. |
| F6 | Kategorie bei F-Droid | offen | Die Liste der Kategorien gehört zu den Daten von F-Droid und liegt in der Probe nicht vor. |

## F2: festgehaltenes Buildwerkzeug

Am 2026-09-29 wurden die folgenden Dateien nur gelesen; das Programm wurde dabei weder unter Debian eingerichtet noch ausgeführt.

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

Der lokale Ablauf setzt deshalb einen neuen `CACHEDIR` je Lauf und bewahrt ihn auf. Nach dem Build vergleicht er außerdem das geladene Gradle-ZIP mit der schon festgelegten `bin`-Prüfsumme in `toolchain.json`. Das ist ein zusätzlicher Nachweis nach der Ausführung, keine vorgeschaltete Prüfung durch `gradlew.py`. Innerhalb eines Laufs kann Gradle mehrfach gestartet und der entpackte Stand wiederverwendet werden. Die Gradle-Abhängigkeiten liegen getrennt unter `gradle-home`; deren Prüfsummenfestlegung bleibt offen.

### Einrichtung und Prüfung

| Aufruf aus der Repository-Wurzel | Wirkung |
|---|---|
| `bash scripts/gradlew-fdroid-einrichten.sh --probelauf` | Zeigt Commit, Quelle, Prüfsumme und Ziel; kein Download, kein neuer Ordner, kein Programmstart. Einen vorhandenen Stand prüft es. |
| `bash scripts/gradlew-fdroid-einrichten.sh` | Lädt ausschließlich die festgehaltene `gradlew.py` über HTTPS, prüft SHA-256, legt sie ausführbar im Benutzerbereich ab. Installiert nichts im System und startet das Programm nicht. |
| `bash scripts/gradlew-fdroid-einrichten.sh --nur-pruefen` | Prüft Bestand, reguläre Datei, Prüfsumme und unter Linux das Ausführungsrecht. Fehlender oder abweichender Stand scheitert ohne Download. |

Die Werte liest der Python-Kern aus `scripts/toolchain.json`. Eine vorhandene Datei oder ein vorhandener Commit-Ordner wird nie ersetzt, auch kein leerer Ordner. Der eigene Ordner `einrichten-*` bleibt nach Erfolg oder Fehler erhalten. Ein Probelauf bestätigt keinen tatsächlichen HTTPS-Download. Die Bash-Hülle und der echte Transport sind erst in Debian zu prüfen.

## Lokales Rezept für die Minimal-App

`scripts/fdroid/de.baremos.fristenrechner.probe.yml` ist eine Vorlage in JSON-Schreibweise, die zugleich gültiges YAML ist. Sie gilt nur für die Minimal-App `d27fb91`, Version 1.0 (1), App-ID `de.baremos.fristenrechner.probe`. Das Ablaufskript löst den kurzen Commit gegen das lokale Git-Repository auf, prüft App-ID, Version und Wrapper-Properties aus diesem Commit und schreibt ein konkretes Rezept mit voller Commit-ID und `file://`-Quelle. Änderungen im Arbeitsbaum werden nicht übernommen.

Aufruf unter Debian: `bash scripts/fdroid/minimal-app-bauen.sh --repo "$HOME/fdroid-probe/skript/minimal-app"`. Mit `--probelauf` werden Quelle und Rezept geprüft und angezeigt; F-Droid wird nicht gestartet, nichts geladen und kein Lauf angelegt. Die tatsächlichen Werkzeugstände prüft der echte Lauf vor dem Build. Vorgabe für die Läufe ist `~/fdroid-probe/build-laeufe`, abweichend `--arbeitsordner <Ordner>`. Der Arbeitsordner darf die Quelle weder enthalten noch in ihr liegen. `--jdk` wählt das vorhandene OpenJDK 21; Node und SDK folgen ihren Standardablagen unter `XDG_DATA_HOME`.

Jeder echte Lauf bekommt einen neuen Ordner `lauf-*`, neue npm-, Gradle- und F-Droid-Caches, eine eigene Konfiguration und ein zusammengeführtes `build.log`. Die Konfiguration setzt `gradle` auf die geprüfte `gradlew.py`. Die Versionen von fdroidserver, Node und npm, das gewählte JDK und das vorhandene SDK werden vorab geprüft. Es gibt keine Installation im System, keine automatische SDK-Einrichtung und keine Bereinigung alter Läufe. Auch die Skripte löschen keine angegebenen Ordner. F-Droid darf seinen eigenen neuen Klon bearbeiten; dort entfernt sein Scanner beispielsweise den eingecheckten Gradle-Wrapper.

Die Vorbereitung läuft wie bei den am 2026-09-28 gelesenen Capacitor-Rezepten vor dem Scanner: `npm ci --ignore-scripts --no-audit --no-fund`, Web-Build, lokales `cap sync android`. Es wird kein `npx` verwendet. `npm ci` lädt und installiert Pakete ausschließlich in diesen Build-Klon; Installationsskripte bleiben abgeschaltet. Tests werden hier nicht ausgeführt. Das Lockfile und zwei Dateiinventare vor und nach dem Web-Build werden im Lauf aufbewahrt. Die Inventur sucht Endungen sowie ELF und WASM am Dateianfang, hält Größe und SHA-256 fest und scheitert bei Lesefehlern. Sie ist keine vollständige Erkennung eingebetteten WASM in JavaScript.

Der erste Lauf hat weder `scanignore` noch `scandelete`. Vorgebaute npm-Dateien können ihn erwartungsgemäß stoppen. Für den ausdrücklich bezeichneten Vergleich gibt es `--versuch-scandelete`: Nur dessen erzeugtes Rezept erhält `scandelete: [node_modules]`, entsprechend dem Muster der gelesenen Capacitor-Rezepte. Das ist ein Versuch zur offenen F5, keine freigegebene Regel für die App. Der Scanner entfernt dabei nur erkannte beanstandete Dateien, nicht den ganzen Ordner. Eingebettetes WASM kann übrig bleiben. Die drei Gradle-Dateien von Capacitor Android, Filesystem und Share müssen nach dem Scanner noch vorhanden sein; sonst bricht der Build ab. Die vollständigen Android-Quellen werden weiterhin vom Scanner erfasst.

### Auswertung und Grenzen

`build-auswerten.py` liest den Rückgabewert, `build.log` und `unsigned/de.baremos.fristenrechner.probe_1.apk`. Rückgabe 0 allein reicht nicht. Erwartet werden jeweils genau einmal und in Reihenfolge: Beginn für die richtige Version/App-ID, Scanner-Beginn, Build-Erfolg und Ende. Warnungen, Fehler, Tracebacks und `BUILD FAILED` führen zu Beanstandungen; nach dem Ende darf kein weiterer Text folgen. Die Stufe wird nur aus dem Kopf einer Protokollmeldung gelesen. Die APK muss regulär, nicht leer und ein konsistentes ZIP mit `AndroidManifest.xml` und `classes.dex` sein. Größe und SHA-256 stehen zusammen mit Beanstandungen in `auswertung.json`; vorhandene Berichte werden nicht überschrieben.

**Noch nicht durch einen echten Build belegt:** Die vier genauen INFO-Texte im Auswerter sind vorläufig. Der erste Debian-Lauf muss sie an fdroidserver 2.4.2 bestätigen. Ein anderer Wortlaut wird als unvollständiger Nachweis abgelehnt. Die ZIP-Prüfung ersetzt weder die Android-Prüfung von F-Droid noch Signaturprüfung, Vergleich der APK oder Reproduzierbarkeitsnachweis. Die Pfadprüfungen schützen vor Versehen, nicht vor einem gleichzeitigen Austausch durch Prozesse desselben Benutzers.

Zu sichern sind der ganze Laufordner, `lauf.json`, Rezept, Konfiguration, `rueckgabe.json`, `build.log`, `auswertung.json`, Lockfile, beide npm-Inventare, Gradle-Prüfsummendaten samt ETag und `gradle-archiv.json`. Ein fehlgeschlagener Lauf bleibt genauso erhalten. Die vollständige Umgebung und der Programmstand der Skripte gehören in das Begleitprotokoll. Als Vergleichswert aus dem Build ohne F-Droid dient die oben genannte unsignierte APK mit SHA-256 `a491907e4b44ba1306bf67651e9d36d363b717bf1a7f760ebe481bf9fccf9350`.

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

**Empfehlung, noch nicht entschieden:** Den Web-Build mit dokumentierten freien Werkzeugen ausführen, danach die entbehrlichen npm-Werkzeuge einschließlich eingebettetem WASM gezielt entfernen und erst dann Scanner und Android-Build laufen lassen. Die Java-/Kotlin-Quellen und Gradle-Dateien von `@capacitor/android`, `@capacitor/filesystem` und `@capacitor/share` bleiben erhalten. Keine pauschale `scanignore`-Ausnahme. Der breite `scandelete`-Vergleich allein belegt weder vollständige Entfernung noch die Annahme durch F-Droid.

`--omit=dev` trennt diese Rollen nicht zuverlässig. `--omit=optional` entfernt auch benötigte Compiler- und Bundler-Pakete. Plattformpakete für macOS, Windows, musl und WASM-Ausweichpakete sind von tatsächlich unter Debian x64 verwendeten Programmen zu unterscheiden.

Die Minimal-App `d27fb91` hat ein anderes Lockfile: Im vorhandenen Nachweis stehen 488 Einträge mit `resolved`, nach `npm ci` 394 installierte Pakete. Eine vollständige Binärinventur dieser App liegt noch nicht vor. Die aktuelle saubere Linux-Kopie des Paket-Repositorys hat 321 installierte Pakete und 412 Fremdpakete laut Lizenzprüfung; sie ist ebenfalls kein vollständiger App-Build. Die Tabelle darf deshalb nicht als beobachtete Paketliste der Minimal-App oder der fertigen Android-App gelesen werden.

## Prüfung der neuen Skripte unter Windows

Geprüft am 2026-09-29 mit Node.js 22.23.2 und npm 10.9.8, ohne Downloads: 107 neue Tests mit `node:test`, davon 18 für die Einrichtung, 66 für die Build-Auswertung und 23 für Vorbereitung und Inventar. Jeder Test enthält einen gültigen Fall und eine Gegenprobe, die scheitern muss. Die Tests stellen HTTPS, Git- und Buildprozesse nach; Protokolle und APK-ZIPs sind Testdaten. Sie sind kein Nachweis eines echten F-Droid-Builds. Die Syntaxprüfung beider neuen Bash-Einstiege mit dem vorhandenen Git Bash ist bestanden.

Der gesamte Aufruf `npm test` besteht mit 530 Skripttests, 134 Kerntests und 68 Oberflächentests, ohne Fehler oder übersprungene Tests. `npm run check` besteht: 15 Dateien der Oberfläche, 0 Fehler, 1 Hinweis auf eine ungenutzte Variable; Astro meldet außerdem das fehlende Seitenverzeichnis des Komponentenpakets. `npm run build` besteht und baut weiterhin nur den Rechenkern. `npm run lizenzen` besteht für 412 Fremdpakete. Diese Lizenzprüfung erteilt keine F-Droid-Freigabe für vorgebaute Programme.

## Nächste Schritte

1. Erledigt am 2026-09-29: Node.js und das Android SDK unter Linux eingerichtet, nach F3 und F4.
2. Erledigt am 2026-09-29: Minimal-App unter Linux gebaut, ohne die Werkzeuge von F-Droid.
3. Rezept und Skripte sind vorbereitet und unter Windows mit nachgestellten Abläufen geprüft. Der echte Aufruf von `fdroid build` in Debian steht aus.
4. Scanner nach den Vorbereitungsschritten prüfen, F5 anhand der Vergleichsläufe entscheiden.
5. Am Ende von Stufe 2: alles mit der App wiederholen.
