# Build für F-Droid

Stand 2026-09-28 · Arbeitspaket 2.8, frühe Probe

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

Nicht installiert sind das Android SDK, Node.js und Gradle. Die empfohlenen Pakete von `fdroidserver` sind nicht installiert, darunter das Paket `android-sdk` aus Debian.

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

| Schritt | Befehl | Stand am 2026-09-28 |
|---|---|---|
| Node.js bereitstellen | `scripts/node-einrichten.sh` | geprüft ohne Download: Probelauf, Fehlbedienung, vorhandene Ordner mit passendem und mit unpassendem Inhalt. Geladen und entpackt ist noch nichts. |
| Projekt-SDK einrichten | `scripts/android-sdk-einrichten.sh --ohne-testgruppe` | geprüft ohne Download, siehe nächste Zeile. Geladen und installiert ist noch nichts. |
| Projekt-SDK prüfen | `scripts/android-sdk-einrichten.sh --nur-pruefen --ohne-testgruppe` | geprüft an einem leeren und an einem nachgebauten SDK, auch in einem Ordner mit Leerzeichen und Umlaut. Gegenproben mit einem ersetzten Prüfprogramm: Abbruch, zu wenige Zeilen, vertauschte Namen, fehlendes Feld und unbekannter Status lassen das Skript scheitern. |

Beide Skripte lesen Versionen und Prüfsummen aus `scripts/toolchain.json`. Sie schreiben nur in den Benutzerbereich und installieren nichts im System. `android-sdk-einrichten.sh` entspricht dem Skript für Windows: `sdkmanager` zeigt die Lizenzbedingungen an, wer das Skript startet, bestätigt sie selbst. `node-einrichten.sh` vergleicht nach dem Entpacken Node.js und npm mit der Festlegung.

## Festlegungen

Jede Festlegung fällt, bevor das betreffende Werkzeug installiert wird. F1, F3 und F4 sind getroffen. F2, F5 und F6 sind offen.

| Nr. | Thema | Festlegung oder Vorschlag | Begründung |
|---|---|---|---|
| F1 | Fassung von fdroidserver | **festgelegt am 2026-09-28:** 2.4.2 aus Debian 13, als Stand des lokalen Nachweises | Debian liefert signierte Pakete und Sicherheitsaktualisierungen. Die Änderungen bis 2.4.5 betreffen Versionen, die Debian 13 nicht enthält (Befund 6). Eine Installation über PyPI brächte einen zweiten Paketweg. Der abschließende Nachweis hält zusätzlich fest, welchen Stand der Buildserver von F-Droid nutzt. |
| F2 | Gradle im Build für F-Droid | Gradle 8.14.5 bleibt. Für die lokale Probe ein festgehaltener Commit des Projekts `gradlew-fdroid`. | Ein Wechsel auf fdroidserver 2.4.5 löst die Frage nicht (Befund 3). Eine ältere Version als 8.14.4 scheidet wegen der Sicherheitsmeldungen aus `toolchain.md` aus. Das Projekt hat keine Marken, festzuhalten ist deshalb ein Commit. |
| F3 | Node.js unter Linux | **festgelegt am 2026-09-28:** Archiv von nodejs.org mit der Prüfsumme oben, abgelegt im Benutzerbereich | wie unter Windows: Referenzversion, keine Installation im System |
| F4 | Android SDK unter Linux | **festgelegt am 2026-09-28:** Kommandozeilenwerkzeuge 22.0 für Linux nach `scripts/toolchain.json`, nur die Gruppe „Build" | Der Emulator läuft unter Windows. Wer installiert, bestätigt die Lizenz selbst. Das `sdkmanager` von F-Droid wird dafür nicht verwendet. |
| F5 | Vorgebaute Programme in `node_modules` | keine pauschale Ausnahme. Zuerst trennen, was der Build der App braucht und was nur die Tests brauchen. Für jede verbleibende Datei Herkunft, Lizenz, Verwendung und Behandlung einzeln festhalten. | Die 28 Einträge aus `lizenzen.md` sind Einträge des Lockfiles für alle Betriebssysteme, nicht 28 Programme im Build unter Linux. Wie andere Rezepte vorgehen, zeigt Befund 7. |
| F6 | Kategorie bei F-Droid | offen | Die Liste der Kategorien gehört zu den Daten von F-Droid und liegt in der Probe nicht vor. |

## Nächste Schritte

1. Node.js und das Android SDK unter Linux einrichten, nach F3 und F4. Geladen und installiert ist am 2026-09-28 noch nichts.
2. Minimal-App unter Linux bauen, zuerst ohne die Werkzeuge von F-Droid, um den Weg zu prüfen.
3. Rezept schreiben und mit `fdroid build` bauen. Dabei F2 und F5 klären.
4. Scanner nach den Vorbereitungsschritten laufen lassen.
5. Am Ende von Stufe 2: alles mit der App wiederholen.
