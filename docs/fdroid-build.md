# Build für F-Droid

Stand 2026-09-28 · Arbeitspaket 2.8, frühe Probe

## Zweck

F-Droid baut jede App selbst aus den Quellen und prüft sie vorher mit einem Scanner. Dieses Dokument hält fest, wie der Nachweis dafür lokal geführt wird, was bisher geprüft ist und was offen bleibt.

Das Arbeitspaket hat zwei Teile. Die frühe Probe mit einer Minimal-App zeigt, woran der Weg scheitern kann, bevor die App entsteht. Der vollständige Build mit Scanner folgt am Ende von Stufe 2, wenn Oberfläche und App vorliegen.

Alle Aussagen gelten für den genannten Tag und die genannten Versionen.

## Umgebung

| Punkt | Stand |
|---|---|
| Rechner | Windows 11 mit WSL 2 |
| Distribution | Debian 13.5 (trixie), Paketquellen `trixie`, `trixie-updates`, `trixie-backports` und `trixie-security`, nur `main` |
| Vor der Einrichtung | 157 Pakete, weder Git noch Python noch Java |

Unter WSL reicht der Suchpfad von Windows in die Distribution hinein. Die Skripte unter `scripts/fdroid` setzen `PATH` deshalb selbst auf die Ordner des Systems.

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

**Abweichung von `toolchain.md`:** Dort ist fdroidserver 2.4.5 genannt, der Installationsweg sollte vor der Installation feststehen. Für die frühe Probe ist die Fassung 2.4.2 aus Debian installiert worden. Die Festlegung steht aus, siehe „Offene Festlegungen".

## Frühe Probe, Schritt 1: Scanner auf dem Quelltext

Geprüft ist die Minimal-App aus Arbeitspaket 2.1: eine Seite aus dem Web-Build, Capacitor 8.5.2 mit den Plugins `filesystem` und `share`, dazu das Android-Projekt aus der Vorlage von Capacitor. Es enthält keine Einträge zu Google-Diensten und keine Berechtigung, die Sicherung ist abgeschaltet, festgelegt sind Gradle 8.14.5 und die Build-Tools 35.0.0. Die Minimal-App liegt nicht im Repository.

| Schritt | Befehl |
|---|---|
| Prüfen | `scripts/fdroid/quelltext-pruefen.sh --quelle <Ordner> --appid <App-ID>` |

Das Skript legt den Quelltext in ein lokales Git-Repository, schreibt Metadaten im Format von F-Droid und ruft `fdroid scanner` auf. Es braucht weder das Android SDK noch das Netz.

| Fall | Ergebnis am 2026-09-28 mit fdroidserver 2.4.2 |
|---|---|
| Minimal-App, 64 Dateien | keine Beanstandung |
| Gegenprobe: dieselbe App mit einer fremden JAR-Datei und einem unbekannten Maven-Repository | 3 Beanstandungen: zweimal „unknown maven repo", einmal „Java JAR file" |

Der Scanner entfernt in beiden Fällen `gradlew`, `gradlew.bat` und `gradle-wrapper.jar` und meldet das als Hinweis. F-Droid startet Gradle über sein eigenes Werkzeug.

Grenzen dieser Prüfung:

1. Geprüft ist der Quelltext, wie er im Repository steht. `node_modules` gehört nicht dazu. Beim Build prüft F-Droid nach den Vorbereitungsschritten des Rezepts, also nachdem `npm ci` gelaufen ist.
2. Die App ist nicht gebaut. Der Build braucht das Android SDK und Node.js unter Linux.
3. Geprüft ist mit der Fassung 2.4.2 aus Debian. Der Buildserver von F-Droid nutzt einen neueren Stand, seine Regeln können abweichen.

## Befunde

| Nr. | Befund | Beleg |
|---|---|---|
| 1 | Der Rückgabewert von `fdroid scanner` sagt bei Quelltext nichts. Mit 3 Beanstandungen und `--exit-code` endet fdroidserver 2.4.2 mit 0. | Gegenprobe. Das Skript wertet deshalb die Ausgabe im Format JSON aus. |
| 2 | `gradlew-fdroid` aus fdroidserver kennt Gradle 8.14.5 nicht. Die Fassungen 2.4.2 und 2.4.5 enthalten dieselbe Datei, sie kennt Gradle bis 8.14.2 und bricht bei einer unbekannten Version ab. | Datei aus dem Paket und aus dem Repository von F-Droid, Stand der Marken 2.4.2 und 2.4.5 |
| 3 | Im aktuellen Stand von fdroidserver ist `gradlew-fdroid` ein eigenes Projekt. Das Prüfsummen-Protokoll von F-Droid nennt Gradle 8.14.5 mit denselben drei Prüfsummen wie `scripts/toolchain.json`. | `fdroid/gradle-transparency-log`, Datei `checksums.json`, Stand 2026-09-24 |
| 4 | Debian 13 liefert Node.js 20.19.2. Das Projekt verlangt 22.23.2 oder neuer. | `apt-cache policy nodejs` |
| 5 | Zwischen fdroidserver 2.4.2 und 2.4.5 nennt das Änderungsprotokoll drei Korrekturen: für Python 3.14, für sdkmanager 0.7 und für Androguard ab 4.1.4. Debian 13 liefert Python 3.13, sdkmanager 0.6.11 und Androguard 3.4.0. | `CHANGELOG.md` der Marke 2.4.5 |

Nicht geprüft ist, ob der Buildserver von F-Droid heute mit Gradle 8.14.5 baut. Befund 3 belegt nur, dass die Prüfsummen dort bekannt sind.

## Prüfsummen für den Build unter Linux

| Datei | SHA-256 | Quelle |
|---|---|---|
| `node-v24.21.0-linux-x64.tar.xz` | `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6` | `SHASUMS256.txt` von nodejs.org, gelesen am 2026-09-28 |

Dieselbe Datei nennt für `node-v24.21.0-win-x64.zip` die Prüfsumme aus `scripts/toolchain.json`. Die Signatur der Datei `SHASUMS256.txt` ist nicht geprüft.

## Offene Festlegungen

Jede Festlegung fällt, bevor das betreffende Werkzeug installiert wird.

| Nr. | Thema | Vorschlag | Begründung |
|---|---|---|---|
| F1 | Fassung von fdroidserver | 2.4.2 aus Debian 13 statt 2.4.5 | Debian liefert signierte Pakete und Sicherheitsaktualisierungen. Die Korrekturen bis 2.4.5 betreffen Versionen, die Debian 13 nicht enthält (Befund 5). Eine Installation über PyPI brächte einen zweiten Paketweg. |
| F2 | Gradle im Build für F-Droid | offen | Zu klären ist, ob das Rezept Gradle 8.14.5 über das eigene Projekt `gradlew-fdroid` nutzt oder ob eine Version festgelegt wird, die auch fdroidserver 2.4.x kennt. Eine ältere Version als 8.14.4 scheidet wegen der Sicherheitsmeldungen aus `toolchain.md` aus. |
| F3 | Node.js unter Linux | Archiv von nodejs.org mit der Prüfsumme oben, abgelegt im Benutzerbereich | wie unter Windows: Referenzversion, keine Installation im System |
| F4 | Android SDK unter Linux | Kommandozeilenwerkzeuge 22.0 für Linux nach `scripts/toolchain.json`, nur die Gruppe „Build" | Der Emulator läuft unter Windows. Wer installiert, bestätigt die Lizenz selbst. Das `sdkmanager` von F-Droid wird dafür nicht verwendet. |
| F5 | Vorgebaute Programme in `node_modules` | offen | Der Scanner prüft nach `npm ci`. Zu klären ist, welche Dateien er beanstandet und wie eng sich Ausnahmen fassen lassen. Siehe `toolchain.md`, Abschnitt „Vorgefertigte Binärdateien". |
| F6 | Kategorie bei F-Droid | offen | Die Liste der Kategorien gehört zu den Daten von F-Droid und liegt in der Probe nicht vor. |

## Nächste Schritte

1. Festlegungen F1, F3 und F4 treffen, danach Node.js und das Android SDK unter Linux einrichten.
2. Minimal-App unter Linux bauen, zuerst ohne die Werkzeuge von F-Droid, um den Weg zu prüfen.
3. Rezept schreiben und mit `fdroid build` bauen. Dabei F2 und F5 klären.
4. Scanner nach den Vorbereitungsschritten laufen lassen.
5. Am Ende von Stufe 2: alles mit der App wiederholen.
