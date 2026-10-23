# Werkzeuge und Versionen

Stand 2026-10-04 · Arbeitspaket 2.1 · Status: Versionen und Skripte festgelegt, Kreuz-Review der Festlegung am 2026-09-27 bestanden. Am 2026-09-28 geändert: Kommandozeilenwerkzeuge 22.0 statt 23.0, Prüfung der Pakete mit `scripts/SdkPruefung.java`, Testgeräte. Projekt-SDK eingerichtet, Beispielbuild und Probe im Emulator bestanden, siehe Abschnitt „Nachweis". Kreuz-Review dieser Änderungen am 2026-09-28 bestanden. Am 2026-09-29 ergänzt: Unter Linux wird nur die Gruppe „Build" eingerichtet.

Ergänzt am 2026-09-30: Die App setzt Android 11 (API 30) und WebView ab Version 83 voraus. Ihr Wrapper verwendet Gradle 8.14.5 als `bin`-Verteilung. Die AndroidX-Versionen aus `app/android/variables.gradle` sind unten aufgeführt. Debug- und Release-Build der App unter Windows sowie zwei strenge Release-Builds unter Debian sind erfolgt. Die unsignierten Release-APKs sind bytegleich. Ergebnisse und Grenzen stehen in [app.md](app.md).

Ergänzt am 2026-10-04: Die [Abschlussnachweise vom 2026-10-03/04](app.md#build-nachweis-am-endstand-vom-2026-10-0304) prüfen den App-Endstand `c7b5230` und den Nachweisstand `8987e69` mit gleichen App-Eingaben. Belegt sind Windows nach `clean`, eine frische Windows-Kopie mit Node 22.23.2 und npm 10.9.8 sowie zwei frische Linux-Klone mit Node 24.21.0, npm 11.19.0 und OpenJDK 21.0.12.1. Die unsignierten Release-APKs sind bytegleich. Windows lief mit JDK 21.0.8 ohne `--streng`, Linux mit `--streng --ohne-testgruppe`; alles auf einem Rechner, Gradle mit Netz. Die Werkzeugfestlegungen ändern sich dadurch nicht.

## Zweck

Dieses Dokument legt fest, mit welchen Werkzeugen und in welchen Versionen der Fristenrechner gebaut wird. Die Versionen stehen fest, bevor etwas installiert wird. Wer das Repository klont, findet hier alles, was für Build und Test nötig ist.

`scripts/toolchain.json` enthält den Teil der Festlegungen, den die Skripte prüfen: Node, JDK, Gradle und das Android SDK. Maßgeblich und vollständig ist dieses Dokument. Dokument und Datei werden im selben Schritt geändert.

## Grundsätze

1. **Exakte Versionen.** Abhängigkeiten stehen ohne Bereichsangabe (`^`, `~`) in den Manifesten. Das zentrale `package-lock.json` ist eingecheckt. Installiert wird mit `npm ci`.
2. **Referenzversion und unterstützter Bereich sind getrennt.** Die Referenzversion ist exakt. Mit ihr entstehen Lockfile und Release-Builds. Der unterstützte Bereich sagt, womit Build und Test außerdem laufen.
3. **Mindestalter sieben Tage.** Eine Version wird erst übernommen, wenn sie mindestens sieben Tage veröffentlicht ist. Das gilt auch für Transitivabhängigkeiten und wird über `min-release-age=7` in der `.npmrc` durchgesetzt. Ausnahme: Sicherheitskorrekturen, mit Vermerk in diesem Dokument.
4. **Der Android-Build folgt der Capacitor-Vorlage.** Android-Gradle-Plugin, API-Stufen und AndroidX-Versionen entsprechen der Vorlage der festgelegten Capacitor-Version. Abweichungen stehen unten und sind begründet.
5. **Hauptversionen wechseln nur mit eigener Entscheidung** und Kreuz-Review.
6. **Nur freie Lizenzen, geprüft vor der Übernahme.** Jede Abhängigkeit wird samt ihren Transitivabhängigkeiten geprüft, bevor sie in ein Manifest kommt. Arbeitspaket 2.7 beginnt mit dem Gerüst und führt die Liste fortlaufend.
7. **Keine Installationsskripte.** `ignore-scripts=true` in der `.npmrc` gilt für npm 10 und npm 11. Braucht ein Paket ein Skript, wird es einzeln freigegeben und hier vermerkt.
8. **Keine systemweiten Eingriffe durch Skripte.** Die Skripte setzen `JAVA_HOME` und `ANDROID_HOME` nur für den eigenen Lauf. Sie ändern weder `PATH` noch andere Einstellungen des Rechners.

Nachtrag 2026-10-23, nur für das [Veröffentlichungsrezept für F-Droid](fdroid-build.md#werkzeuge-aus-quelltext-23102026): Auf Wunsch des Maintainers und nach Andreas' Entscheidung für Option A installiert dessen `sudo`-Block `nodejs`, `npm`, `esbuild`, `cargo`, `rustc`, `build-essential` und `cmake` systemweit mit Zielsuite forky. Die vier nativen Node-Bindungen von Rolldown, Astro compiler-rs, Satteri und Lightning CSS werden aus Quelltext mit dem unveränderten Upstream-Release-Profil gebaut; esbuild kommt aus Debian. Kein rustup und kein `pkg-config` ohne Bedarfsbeleg. Die vollständige Probe dieses Rezepts am Stand `fae0b24` bestand am 2026-10-23 als root in einer frischen, entbehrlichen Debian-13-Instanz mit Originalprofilen, Scanner und bytegleicher unsignierter APK. Paketversionen, srclib-Commits, Grenzen und die gezielte `scanignore`-Ausnahme nach E7 für das von der Hinweise-Prüfung benötigte Capacitor-Archiv sind in `fdroid-build.md` dokumentiert. Die Repo-Fassung ist inzwischen die kanonische fdroiddata-Fassung, als Fixpunkt mit fdroidserver 2.4.2 geprüft. Die Änderungen danach betreffen Darstellung, die wirkungslose `sudo`-Zeile, Probe, Tests, Doku, `.gitattributes` und den Checkout der CI; die vollständige Probe wurde nicht wiederholt. Die kanonische Fassung bestand am 2026-10-23 die Merge-Request-Pipeline 2981625855 von `fdroiddata` einschließlich Build und Binärabgleich mit der signierten APK. Die lokale Einrichtung, `build-lokal.py`, die lokalen Rezepte und deren Referenzversionen bleiben unverändert: Node-Archiv von nodejs.org und npm-Plattformpakete für die Buildwerkzeuge, danach die lokale Bereinigung nach F5.

## Festgelegte Versionen

### Node.js und npm

| Werkzeug | Referenzversion | Unterstützter Bereich | Lizenz |
|---|---|---|---|
| Node.js | 24.21.0 (LTS, veröffentlicht 2026-09-07) | Reihe 22 ab 22.23.2, Reihe 24 ab 24.18.1 | MIT |
| npm | 11.19.0 (in Node 24.21.0 enthalten) | `npm ci` auch mit npm 10.9.x | Artistic-2.0 |

- Die Untergrenzen sind die Sicherheitsversionen vom 2026-07-28. Ältere Stände und die Reihe 23 sind nicht unterstützt. Vitest 4 schließt die Reihe 23 aus.
- Als Angabe für `engines`: `^22.23.2 || ^24.18.1`.
- Node 24 wird bis 2028-04-30 unterstützt, Node 22 bis 2027-04-30.
- Änderungen am Lockfile entstehen mit der Referenzversion von npm. Auf einem Rechner mit Node 22 geht das mit `npx npm@11.19.0 install`.
- Das Build-Skript bricht außerhalb des unterstützten Bereichs ab. Weicht die Version nur von der Referenz ab, meldet es einen Hinweis. Release-Builds laufen mit `--streng` und damit nur auf der Referenzversion.
- Prüfsumme des Archivs `node-v24.21.0-win-x64.zip`, SHA-256: `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`.
- Prüfsumme des Archivs `node-v24.21.0-linux-x64.tar.gz`, SHA-256: `6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff`. Festgelegt ist das Archiv mit gzip: In der Installation von Debian 13 unter WSL, mit der die Probe lief, fehlt `xz`. Beide Werte stehen in der Datei `SHASUMS256.txt` von nodejs.org, gelesen am 2026-09-28. Die Signatur dieser Datei ist nicht geprüft.

### JavaScript: Kern, Oberfläche, Web-Build

| Werkzeug | Version | Lizenz | Begründung |
|---|---|---|---|
| TypeScript | 6.0.3 | Apache-2.0 | eine Version für das ganze Repository; `astro check` unterstützt TypeScript 7 noch nicht |
| Vitest | 4.1.11 | MIT | Hauptversion des Ausgangscodes; Vitest 5 ist jünger als sieben Tage |
| Astro | 7.3.3 | MIT | neueste Version mit Mindestalter; enthält die Sicherheitskorrekturen aus 7.2.4 und 7.2.8 |
| @astrojs/check | 0.9.10 | MIT | Typprüfung der Astro-Dateien |
| Vite | 8.3.0, über Astro und Vitest | MIT | im Lockfile gesperrt, kein direkter Eintrag im Manifest |

### Bibliotheken für die Exporte

Arbeitspaket 2.4 hat diese Bibliotheken eingebunden. Die Lizenzprüfung und ihre offenen Ergänzungen stehen in [lizenzen.md](lizenzen.md).

| Bibliothek | Version | Lizenz | Zweck |
|---|---|---|---|
| jspdf | 4.2.1 | MIT | PDF, unverändert aus dem Ausgangscode |
| jspdf-autotable | 5.0.8 | MIT | Tabellen im PDF, unverändert aus dem Ausgangscode |
| fflate | 0.8.3 | MIT | packt die Excel-Datei, keine eigenen Abhängigkeiten |

Die Excel-Datei schreibt das Paket selbst. Der Ausgangscode nutzte dafür exceljs 4.4.0. Entscheidung vom 2026-09-29: exceljs entfällt, weil zwei Pakete in seinem Baum keinen Lizenzbeleg mitbringen (`buffers` 0.1.1 und `chainsaw` 0.1.0). fflate lag schon als Abhängigkeit von jspdf im Baum.

### Capacitor

| Paket | Version | Lizenz | Status |
|---|---|---|---|
| @capacitor/core | 8.5.2 | MIT | fest |
| @capacitor/cli | 8.5.2 | MIT | fest |
| @capacitor/android | 8.5.2 | MIT | fest |

Stand 2026-10-04: Diese drei Pakete sind die Capacitor-Abhängigkeiten der App; Quelle ist [app/package.json](../app/package.json). Die Dateiabläufe nutzen das eigene Java-Plugin, siehe [app.md](app.md#dateiabläufe-speichern-unter-teilen-import-und-dialog-nativ). `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/app` und `@capawesome/capacitor-file-picker` sind keine aktuellen App-Abhängigkeiten.

Die folgenden Angaben dokumentieren nur die historische Werkzeugprobe aus dem Abschnitt [Nachweis](#nachweis) und die damaligen Kandidaten. Sie sind keine Festlegung für die aktuelle App:

| Paket | Damaliger Stand | Lizenz | Historische Verwendung |
|---|---|---|---|
| @capacitor/filesystem | 8.1.3 | MIT | Exportdatei in der Minimal-App schreiben |
| @capacitor/share | 8.0.2 | MIT | Teilen in der Minimal-App |
| @capacitor/app | 8.1.1 | MIT | damaliger Kandidat für Arbeitspaket 2.6, nicht eingebunden |
| @capawesome/capacitor-file-picker | 8.1.0 | MIT | damaliger Kandidat für Arbeitspaket 2.6, nicht eingebunden |

In dieser historischen Probe band `@capacitor/filesystem` die Bibliothek `io.ionic.libs:ionfilesystem-android` 1.1.0 (MIT, Maven Central) und das Kotlin-Gradle-Plugin 2.2.20 (Apache-2.0) ein. Das Kotlin-Gradle-Plugin ist kein Werkzeug des aktuellen App-Builds; dessen Buildscript bindet nur das Android-Gradle-Plugin ein ([app/android/build.gradle](../app/android/build.gradle)).

Keines der genannten Pakete enthält Google Play Services oder Firebase. Keines trägt eine Berechtigung in das Manifest ein.

### Android-Build

| Werkzeug | Version | Lizenz | Quelle der Festlegung |
|---|---|---|---|
| JDK | 21, eine freie OpenJDK-Distribution | GPL-2.0 mit Classpath Exception | Capacitor 8 verlangt Java 21 |
| Gradle | 8.14.5, über den Gradle-Wrapper | Apache-2.0 | Abweichung von der Vorlage, siehe unten |
| Android-Gradle-Plugin | 8.13.0 | Apache-2.0 | Capacitor-Vorlage 8.5.2 |

Zu Gradle: Die Vorlage nennt 8.14.3. Diese Version ist von zwei Sicherheitsmeldungen betroffen, die 8.14.4 behebt (GHSA-mqwm-5m85-gmcv, GHSA-w78c-w6vf-rw82, beide zur Auflösung von Abhängigkeiten). Festgelegt ist deshalb 8.14.5 vom 2026-05-07. Das Android-Gradle-Plugin 8.13 verlangt mindestens Gradle 8.13.

| Datei | SHA-256 |
|---|---|
| `gradle-8.14.5-all.zip` | `62c3769155d7d17ea05084ad498067824c1804568a408a6faa78a5ef95ed67a8` |
| `gradle-8.14.5-bin.zip` | `6f74b601422d6d6fc4e1f9a1ab6522f642c2fdcbc15ae33ebd30ba3d7198e854` |
| `gradle-wrapper.jar` | `7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172` |

Der Wrapper prüft die Distribution über `distributionSha256Sum`. Das Build-Skript prüft zusätzlich `gradle-wrapper.jar`. Die Datei ist in 8.14.3 und 8.14.5 dieselbe.

Der Wrapper der App verwendet `gradle-8.14.5-bin.zip`; Quelltexte und Dokumentation der `all`-Verteilung sind für ihren Build nicht erforderlich. Die Prüfsumme von `all` bleibt für bestehende Beispielprojekte dokumentiert. Der erste Build der App über den Wrapper mit `bin` gelang unter Windows am 2026-09-30.

### AndroidX und Cordova

Die folgenden Versionen stehen am 2026-09-30 in `app/android/variables.gradle`. Sie legen die dort benannten Bibliotheken fest; sie sind keine vollständige Liste der von Gradle aufgelösten Abhängigkeiten.

| Variable | Version |
|---|---|
| `androidxActivityVersion` | 1.11.0 |
| `androidxAppCompatVersion` | 1.7.1 |
| `androidxCoordinatorLayoutVersion` | 1.3.0 |
| `androidxCoreVersion` | 1.17.0 |
| `androidxFragmentVersion` | 1.8.9 |
| `androidxWebkitVersion` | 1.14.0 |
| `cordovaAndroidVersion` | 14.0.1 |

Die aufgelösten Laufzeitmodule von `releaseRuntimeClasspath` sind am 2026-10-04 für den Stand `7fd6c90` mit POM-Lizenzangaben und APK-/SUSS-Abgleich im [Android-Laufzeitinventar](lizenzen.md#android--und-gradle-abhängigkeiten) erfasst. Vollständige Hinweise Dritter einschließlich der eingebetteten Anteile sowie Werkzeugliste und Werkzeug-Lizenzregel bleiben offen. Die [Gradle-Prüfsummen](#gradle-prüfsummen) erfassen auch die geladenen Build-Werkzeuge.

### JDK

Zum JDK:

- Festgelegt ist die Hauptversion 21. Ein vorhandenes JDK 21 wird mitgenutzt und nicht ein zweites Mal installiert.
- Die Skripte nehmen nur ein vollständiges JDK an: `java` und `javac` sind vorhanden, die Versionsabfrage gelingt, die Ausgabe nennt `OpenJDK`. Das JDK von Oracle gehört nicht zur Werkzeugkette und wird übersprungen.
- Festgelegter Stand für Release-Builds: 21.0.12, wie ihn Debian 13 und Eclipse Temurin liefern. Ein Zusatz wie 21.0.12.1 zählt dazu.
- Für Entwicklung und Probe genügt ein anderer Patchstand der Hauptversion 21. Das Build-Skript meldet ihn als Hinweis, mit `--streng` bricht es ab. Geprüft ist Microsoft Build of OpenJDK 21.0.8. Wer ein vorhandenes JDK mitnutzt, aktualisiert es über das Werkzeug, das es installiert hat.

Android Studio ist nicht nötig.

### API-Stufen

| Angabe | Wert | Begründung |
|---|---|---|
| Mindest-API (`minSdkVersion`) | 30, Android 11 | Niedrigstes geprüftes Systemabbild mit geeigneter WebView: Version 83.0.4103.120 |
| Übersetzungs-API (`compileSdkVersion`) | 36 | Capacitor-Vorlage 8.5.2 |
| Ziel-API (`targetSdkVersion`) | 36, Android 16 | Vorgabe von Google Play seit 2026-08-31 für neue Apps und Updates |

Google Play hebt die verlangte Ziel-API in der Regel jährlich zum 31. August an. Die Prüfung gehört deshalb in die Regelprüfung des zweiten Quartals, siehe `pflegekonzept.md`.

Die Mindest-API ist höher als die Untergrenze von Capacitor 8. Das geprüfte Abbild mit API 24 enthält WebView 52; dort scheitert bereits die Brücke. Für API 25 bis 29 gibt es keinen Nachweis mit einem geeigneten Abbild. Die App verlangt deshalb zusätzlich `android.minWebViewVersion: 83`; JavaScript und CSS werden für `chrome83` gebaut. Eine ältere WebView soll die lokale Fehlerseite `startfehler.html` über `server.errorPath` anzeigen. Die Mindest-API allein garantiert keinen bestimmten Update-Stand der WebView. Die Emulatorprüfung vom 2026-09-30 belegt Start, Berechnung und Brückenaufruf dieser App auf API 30 und 36 und die Anzeige der Fehlerseite auf API 30 mit einer dafür gebauten Variante, siehe [app.md](app.md#prüfung-im-emulator). Dort stehen auch die dokumentierten Grenzen und das Ausstehende.

### Android SDK

Das Projekt nutzt ein **eigenes SDK im Benutzerbereich**, das Projekt-SDK. Ein SDK, das ein anderes Werkzeug verwaltet, etwa Visual Studio oder Android Studio, bleibt unberührt. Gründe: Das Projekt-SDK braucht keine Administratorrechte, Updates anderer Werkzeuge ändern seine Versionen nicht, und sein Inhalt entspricht genau dieser Liste.

Standardordner des Projekt-SDK:

| System | Ordner |
|---|---|
| Windows | `%LOCALAPPDATA%\fristenrechner\android-sdk` |
| Linux | `$XDG_DATA_HOME/fristenrechner/android-sdk`, ohne die Variable `~/.local/share/fristenrechner/android-sdk` |

Der Ordner ist bewusst nicht der Standardordner von Android Studio. So verwaltet kein anderes Werkzeug das Projekt-SDK mit.

| Paket für `sdkmanager` | Revision | Gruppe | Geht in die App ein |
|---|---|---|---|
| `cmdline-tools;22.0` | 22.0 | Build | nein |
| `platforms;android-36` | 2 | Build | ja |
| `build-tools;35.0.0` | 35.0.0 | Build | ja |
| `platform-tools` | 37.0.1 | Build | nein |
| `emulator` | 37.1.11 | Test | nein |
| `system-images;android-36;default;x86_64` | 2 | Test | nein |
| `system-images;android-30;default;x86_64` | 11 | Test | nein |
| `system-images;android-24;default;x86_64` | 8 | Test | nein |

Archive und Prüfsummen (SHA-1) aus den Paketlisten von Google, Stand 2026-09-27, Kommandozeilenwerkzeuge Stand 2026-09-28:

| Paket | Archiv | SHA-1 |
|---|---|---|
| Kommandozeilenwerkzeuge 22.0, Windows | `commandlinetools-win-15859902_latest.zip` | `b9862337a13e2809a5159dc3a08d058091bd59f6` |
| Kommandozeilenwerkzeuge 22.0, Linux | `commandlinetools-linux-15859902_latest.zip` | `040d3996a65543d22ec4bf73e4c37aa37a8d4af4` |
| Plattform 36 | `platform-36_r02.zip` | `2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576` |
| Build-Tools 35.0.0, Windows | `build-tools_r35_windows.zip` | `af059bb67cf7786f45ee0db85e2d24985df1b4b6` |
| Build-Tools 35.0.0, Linux | `build-tools_r35_linux.zip` | `2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc` |
| Platform-Tools 37.0.1, Windows | `platform-tools_r37.0.1-win.zip` | `e03e78b1d80b396f1c3358e31251cb31740e1110` |
| Platform-Tools 37.0.1, Linux | `platform-tools_r37.0.1-linux.zip` | `477254aa5f903c15cf51001717bdf347fb6b53e0` |
| Emulator 37.1.11, Windows | `emulator-windows_x64-15917651.zip` | `54fa750822ff462d57e04fc8e98e60f08df2bb61` |
| Emulator 37.1.11, Linux | `emulator-linux_x64-15917651.zip` | `1b1f78891abf8ec268264356e1365c25519e8379` |
| Systemabbild API 36 | `x86_64-36_r02.zip` | `829c076e8ff448a336097ae25a355b495ba36e2c` |
| Systemabbild API 30 | `x86_64-30_r11.zip` | `5e4de3946d46f88856c35efcc4d797b381456347` |
| Systemabbild API 24 | `x86_64-24_r08.zip` | `f6559e1949a5879f31a9662f4f0e50ad60181684` |

Das Einrichtungsskript prüft das Archiv der Kommandozeilenwerkzeuge gegen die Prüfsumme und gibt zusätzlich dessen SHA-256 aus. Die übrigen Archive lädt und prüft `sdkmanager`.

Zu den Kommandozeilenwerkzeugen:

- Festgelegt ist 22.0, die letzte Fassung mit dem Programm `sdkmanager`. Es läuft mit dem festgelegten JDK und lädt selbst nichts nach. Das Einrichtungsskript startet es direkt über das JDK, ohne die Batch-Datei.
- Die Fassung 23.0 enthält `sdkmanager` nicht mehr. Ihre Datei `sdkmanager.bat` reicht die Aufrufe an das Android-CLI (`android.exe`) weiter. Das Android-CLI ist für dieses Projekt nicht festgelegt. Grund sind drei Beobachtungen vom 2026-09-28 unter Windows, mit dem Starter 1.0.15498356 aus dem Archiv 23.0 und dem nachgeladenen Programm 1.0.16406183:

| Beobachtung | Folge |
|---|---|
| Der Starter hat das eigentliche Programm und eine eigene Java-Laufzeit in das Benutzerprofil geladen | Die Prüfsumme des Archivs deckt das ausgeführte Programm nicht ab, seine Version steht nicht fest |
| Die Nutzungsstatistik war in der Voreinstellung eingeschaltet | Das Skript müsste sie bei jedem Aufruf mit `--no-metrics` abschalten |
| Der Installationslauf hat auf die Lizenzbedingungen verwiesen, ihre Bestätigung nicht abgefragt und die Zustimmung im SDK abgelegt | Die Bestätigung durch die installierende Person entfällt |

- Das Archiv 22.0 enthält `android.exe` ebenfalls. Die Skripte rufen die Datei nicht auf.
- Google hat `sdkmanager` abgekündigt, 22.0 gibt dazu eine Warnung aus. Die Festlegung ist deshalb eine Übergangslösung. Die Regelprüfung prüft vierteljährlich, ob sie noch trägt. Der Ersatz wäre ein eigenes Installationsskript, das die hier genannten Archive lädt und gegen ihre Prüfsummen prüft.

So bleiben die Revisionen unter Kontrolle:

- `sdkmanager` liefert zu einem Paketnamen den jeweils aktuellen Stand. Eine spätere Installation kann deshalb eine andere Revision bringen als hier festgelegt.
- Das Einrichtungsskript vergleicht nach der Installation jede Revision mit `scripts/toolchain.json`, auch die der Kommandozeilenwerkzeuge. Bei einer Abweichung endet es mit einem Fehler.
- Den Vergleich führt für beide Skripte dasselbe Programm aus: `scripts/SdkPruefung.java`. Die Skripte starten es mit dem JDK, das sie für den Build ohnehin suchen (`java scripts/SdkPruefung.java`). Es gibt damit eine einzige Umsetzung.
- Das Programm liest die Revision aus der Datei `package.xml` des Pakets. `sdkmanager` schreibt sie aus der Paketliste von Google. Das Programm prüft dabei die Paketkennung. Fehlt `minor` oder `micro`, gilt 0.
- `package.xml` liest der XML-Leser des JDK, mit Namensräumen und ohne Dokumenttyp. Eine Datei mit Dokumenttyp gilt als ungültig.
- `source.properties` stammt aus dem Archiv und gilt nur, wenn `package.xml` fehlt. Das ist bei den Kommandozeilenwerkzeugen der Fall, die das Einrichtungsskript selbst entpackt. Die Datei kann einen älteren Stand nennen: Das Archiv `x86_64-30_r11.zip` nennt dort Revision 10. Das Programm liest die Datei mit `java.util.Properties`. Die Schlüssel `Pkg.Path` und `Pkg.Revision` gelten in genau dieser Schreibweise.
- Ist eine vorhandene `package.xml` unlesbar oder beschreibt sie ein anderes Paket, gilt das Paket als ungültig. Das Programm greift dann nicht auf `source.properties` zurück.
- Revisionen aus Zahlen und Punkten vergleicht das Programm Stelle für Stelle, fehlende Stellen gelten als 0. Revisionen mit Zusatz wie `36.0.0 rc5` vergleicht es als Text.
- `scripts/sdk-pruefung.test.mjs` prüft das Programm: `node --test "scripts/*.test.mjs"`. Der Test braucht ein JDK 21.
- Auch die XML-Quellprüfung der App nutzt dieses Muster: `java scripts/XmlQuelle.java <Datei>` liest Manifest und Exportpfade mit dem Parser des JDK, ohne DTD oder externe Entitäten. Die Tests in `scripts/app-pruefungen.test.mjs` und `scripts/xml-quelle.test.mjs` setzen deshalb ebenfalls ein JDK 21 voraus.
- Das Build-Skript vergleicht vor jedem Build die Pakete beider Gruppen. Mit `--ohne-testgruppe` übergibt es nur die Gruppe „Build" an dasselbe Prüfprogramm und nennt diese Auswahl in der Ausgabe:

| Befund | Folge |
|---|---|
| Paket der Gruppe „Build" fehlt oder ist ungültig | Abbruch |
| Paket, das in die App eingeht, weicht ab | Abbruch |
| Paket der Gruppe „Test" fehlt oder ist ungültig, ohne `--ohne-testgruppe` | Hinweis |
| Gruppe „Test" bei `--ohne-testgruppe` | nicht geprüft, kein Hinweis |
| anderes geprüftes Paket weicht ab | Hinweis |
| beliebiger Hinweis bei `--streng` | Abbruch |

- Der Vergleich prüft Revisionen, nicht den Inhalt der installierten Dateien.
- Eine neue Revision wird erst nach Prüfung übernommen: Eintrag in diesem Dokument und in `scripts/toolchain.json`, Kreuz-Review.

Weitere Angaben:

- `build-tools;35.0.0` ist die Mindest- und Standardversion des Android-Gradle-Plugins 8.13. Das App-Projekt trägt sie ausdrücklich als `buildToolsVersion` ein. `apksigner` und `zipalign` kommen aus diesem Paket, `keytool` aus dem JDK.
- Die Systemabbilder der Reihe `default` enthalten keine Google-Dienste. API 36 deckt die Ziel-API (Android 16) ab, API 30 die Mindest-API (Android 11). Das Testgerät `fr-api24` dient für diese App nur noch der Gegenprobe, dass Android die Installation wegen der Mindest-API ablehnt.
- Unter Windows werden beide Gruppen zusammen eingerichtet. Die Gruppe „Test" umfasst rund 2,3 GB. Für die Probe unter Linux richtet `--ohne-testgruppe` nur die Gruppe „Build" ein, der Emulator läuft unter Windows. Siehe F4 in `fdroid-build.md`.
- Das Android SDK steht unter den Lizenzbedingungen von Google. Alle festgelegten Pakete nennen die Lizenz `android-sdk-license`. `sdkmanager` zeigt sie vor der Installation an, solange sie im SDK nicht bestätigt ist. Wer installiert, bestätigt sie selbst. Ohne Bestätigung installiert `sdkmanager` nichts.
- Das Einrichtungsskript ruft `sdkmanager --licenses` nicht auf. Der Aufruf legt auch Bedingungen vor, die die festgelegten Pakete nicht brauchen.

## Abweichungen von der Capacitor-Vorlage

Die Vorlage von Capacitor 8.5.2 enthält Stellen, die zum Zuschnitt dieser App oder zu den Grundsätzen nicht passen. Arbeitspaket 2.5 ändert sie im App-Projekt, Arbeitspaket 2.8 prüft das Ergebnis mit dem Scanner von F-Droid.

| Stelle in der Vorlage | Inhalt | Änderung |
|---|---|---|
| `android/build.gradle` | `classpath 'com.google.gms:google-services:4.4.4'` | entfernen |
| `android/app/build.gradle` | Block, der bei vorhandener `google-services.json` das Plugin `com.google.gms.google-services` anwendet | entfernen |
| `AndroidManifest.xml` | Berechtigung `android.permission.INTERNET` | entfernen |
| `AndroidManifest.xml` | `android:allowBackup="true"` | abschalten, Regeln für Sicherung und Gerätewechsel setzen |
| `gradle-wrapper.properties` | Gradle 8.14.3, keine Prüfsumme | Gradle 8.14.5 als `bin`-Verteilung, `distributionSha256Sum` |
| `android/app/build.gradle` | keine `buildToolsVersion` | `buildToolsVersion "35.0.0"` |

Die Prüfsummen der Gradle-Abhängigkeiten stehen seit dem 2026-10-05 in `app/android/gradle/verification-metadata.xml`. Der lokale F-Droid-Lauf mit frischem Gradle-Home und aktiver Prüfung bestand nach der Ergänzung vom 2026-10-15; siehe [Lauf am eingefrorenen Stand](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15).

## Sperren der Versionen

| Ort | Maßnahme | Arbeitspaket |
|---|---|---|
| `package.json` der Wurzel und der App | exakte Versionen, `engines` für Node; die beiden npm-Pakete tragen seit dem 2026-10-11 kein `engines` mehr | 2.2 |
| `.npmrc` | `save-exact=true`, `engine-strict=true`, `ignore-scripts=true`, `min-release-age=7` | 2.2 |
| `package-lock.json` | eingecheckt, ein Lockfile für das ganze Repository | 2.2 |
| `scripts/toolchain.json` | Referenzversionen, Prüfsummen, Revisionen des SDK | 2.1 |
| `app/android/variables.gradle` | API-Stufen und AndroidX-Versionen | 2.5 |
| `app/android/gradle/wrapper/gradle-wrapper.properties` | Gradle-Version und Prüfsumme | 2.5 |
| `app/android/gradle/verification-metadata.xml` | SHA-256 der erfassten Gradle-Artefakte und Metadaten | Vorarbeit Stufe 3 |
| Lokale Build-Rezepte für F-Droid | Node-Referenzversion aus der Einrichtung im Benutzerbereich mit Prüfsumme des Linux-Archivs | 2.8 |
| Veröffentlichungsrezept für F-Droid | Node.js, npm, esbuild, cargo/rustc, build-essential und cmake über `sudo` mit Zielsuite forky; Suite festgelegt, Paketversionen nicht festgeschrieben. npm-esbuild und Debian-esbuild müssen exakt übereinstimmen, derzeit 0.28.2; die Probe prüft beide Werte. Vier native Node-Bindungen aus srclib-Tags, geprüft gegen das Lockfile des Build-Commits; Astro-`Cargo.lock` wird in `prebuild` erzeugt, danach `--locked` (Entscheidung 2026-10-23). | 2.8 |

## Gradle-Prüfsummen

Gradle findet `gradle/verification-metadata.xml` im Android-Projekt und prüft damit beim Auflösen die erfassten Abhängigkeiten einschließlich POM- und Modulmetadaten. `verify-metadata` ist `true`, `verify-signatures` ist `false`: Es werden SHA-256-Prüfsummen, keine PGP-Signaturen geprüft. Die Datei enthält keine zusätzlichen vertrauenswürdigen Prüfsummen (`also-trust`) und keine Schlüssel-Ausnahmen. Sie ersetzt weder die Versionsangaben noch eine Lizenzprüfung. Die erstmalige Erzeugung übernimmt den lokalen Bestand; eine Prüfsumme und `origin="Generated by Gradle"` allein belegen keine vertrauenswürdige Herkunft.

Der Bestand umfasst seit der Ergänzung vom 2026-10-15 **389 Komponenten und 675 Artefakte** aus 110 Gruppen. Am 2026-10-05 waren es 388 Komponenten und 673 Artefakte: Die Erzeugung unter Windows erfasste 672 Artefakte, derselbe Befehl unter Linux ergänzte ausschließlich `aapt2-8.13.0-13719691-linux.jar`. Erfasst sind App-, Werkzeug- und Testkonfigurationen, auch aus `capacitor-android`, sowie mehrere angeforderte Versionen. Die Datei ist deshalb umfangreicher als das Laufzeitinventar. Für macOS fehlt die Plattformvariante von aapt2; Erzeugung und Build sind dort nicht geprüft. Diese Grenze wird durch die Windows- und Linux-Nachweise nicht geschlossen.

Am 2026-10-05 bestanden ein Windows-Build aus `clean` mit aktiver Prüfung und `--offline` für Release-APK, Debug-APK und Release-Bundle sowie ein Linux-Release-Build aus `clean` mit aktiver Prüfung. Die Windows-Erzeugung und der Linux-Build mit aktiver Prüfung ergaben die damalige unsignierte Release-APK (7 760 765 Bytes, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`). Eine unter Linux verfälschte Prüfsumme von `coordinatorlayout-1.3.0.aar` ließ den Offline-Build mit `Dependency verification failed` abbrechen. Diese Nachweise beziehen sich auf den damaligen Stand.

Am 2026-10-15 brach der erste lokale F-Droid-Build mit `Dependency verification failed for configuration 'classpath'` ab. Die Datei war mit gefülltem Gradle-Cache erzeugt worden; im leeren Gradle-Home fehlten die Prüfsummen für das Eltern-POM von Guava und die JUnit-BOM. Die Neuerzeugung mit leerem `GRADLE_USER_HOME` und `--write-verification-metadata sha256 clean assembleRelease assembleDebug bundleRelease` ergänzte genau diese zwei Artefakte (`d3d432b`):

| Komponente | Artefakt | SHA-256 |
|---|---|---|
| `com.google.guava:guava-parent:33.3.1-jre` | `guava-parent-33.3.1-jre.pom` | `55441db27e8869dfefe053059bdf478bdc7e95585642bf391f0023345fd56287` |
| `org.junit:junit-bom:5.10.2` | `junit-bom-5.10.2.module` | `de23b114b3e4119a8fe6eb17bed5a3852816698bace67071579d6d927ebb080a` |

Die SHA-1 beider Dateien stimmten mit Maven Central überein; die SHA-256 der JUnit-BOM stimmte zusätzlich mit der dort veröffentlichten `.sha256` überein. Für das Guava-Eltern-POM war dort keine `.sha256` veröffentlicht. Ein zweites leeres Gradle-Home mit aktiver Prüfung bestand den Gegenlauf. Die Release-APK blieb bytegleich (7 668 430 Bytes, SHA-256 `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02`). `node scripts/gradle-pruefsummen.mjs` meldete 0 Fehler, die 47 Tests der Prüfsummenprüfung bestanden. Der anschließende [lokale F-Droid-Lauf](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15) und der [Windows-Release-Build](app.md#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15) am Stand `d3d432b` ergaben dieselbe APK. Die frühere Manipulationsgegenprobe und der Windows-Offline-Build wurden damit nicht am neuen Stand wiederholt.

Die beiden `trusted-artifacts`-Muster `.*-sources[.]jar` und `.*-javadoc[.]jar` erlauben den Quellen- und Javadoc-Import in Android Studio. Der aktuelle App-Build verwendet diese Archive nicht als Code oder Metadaten. Die Ausnahme gilt aber allein nach Dateinamen: Ihre Inhalte sind damit nicht abgesichert. Werden solche Archive künftig Baueingaben, müssen die Ausnahmen entfallen und die Archive Prüfsummeneinträge erhalten.

### Prüfen und pflegen

Die Formprüfung aus der Repository-Wurzel braucht Node und das festgelegte JDK, aber kein SDK, Gradle, Netz oder private Dateien:

```sh
node scripts/gradle-pruefsummen.mjs
```

K4 in `scripts/app-pruefungen.mjs` führt dieselbe Formprüfung aus. Sie erlaubt nur die vorgesehenen XML-Elemente und Einstellungen, genau die zwei IDE-Muster, eindeutige Komponenten und Artefakte sowie genau eine SHA-256 mit 64 Hex-Zeichen je Artefakt. Die exakt benannten erwarteten Gruppen und ihre Begründungen stehen in `scripts/gradle-pruefsummen.mjs`; neue Gruppen sind Fehler und verlangen ein Review ihres Abhängigkeitswegs. Das JDK liest jede XML-Datei je Prüfung einmal; die Metadatendatei fügt K4 einen Parserstart hinzu. Gegenproben sind über `node:test` in `npm test` enthalten.

Optional prüfen `--cache <files-2.1-Ordner>` und `--liste <Datei>` die verfügbaren Belege. Der Cache-Abgleich berechnet die SHA-256 jeder gefundenen Kopie unter `Gruppe/Name/Version/Cache-Hash/Datei`. Fehlende Dateien ergeben einen Hinweis mit Zählung, jede Abweichung einen Fehler. Die Liste enthält `sha256  pfad`; zusätzlich wird das Erhebungsformat `pfad<TAB>Bytes<TAB>sha256` gelesen. Pfade müssen auf dieselben Cache-Koordinaten enden. Eine ältere oder unvollständige Liste belegt nur die darin vorhandenen Artefakte; sie ersetzt keinen Vergleich mit einem frisch geladenen Bestand.

Bei Änderungen an Gradle-Abhängigkeiten, Capacitor oder AGP:

1. Lizenz und Abhängigkeitsweg der Änderung prüfen. `JAVA_HOME` auf das vollständige OpenJDK 21 und `ANDROID_HOME` auf das vorbereitete Projekt-SDK setzen; ein vorhandenes `sdk.dir` muss denselben Ort nennen. npm-Installation, Web-Build und Capacitor-Sync vorher über den vorgesehenen App-Build durchführen. Fehlende Gradle-Artefakte erfordern einen Download bei der Erzeugung.
2. Ein neues, leeres `GRADLE_USER_HOME` verwenden und die Datei im Ordner `app/android` unter Windows neu erzeugen:

   ```powershell
   .\gradlew.bat --write-verification-metadata sha256 clean assembleRelease assembleDebug bundleRelease
   ```

3. In einem Linux-Klon mit denselben Quellen, Werkzeugversionen und vorbereiteter App ebenfalls ein leeres `GRADLE_USER_HOME` verwenden und die Datei mit demselben Aufgabenumfang ergänzen:

   ```sh
   ./gradlew --write-verification-metadata sha256 clean assembleRelease assembleDebug bundleRelease
   ```

4. Jede hinzugefügte oder geänderte Komponente, Plattformvariante und Prüfsumme im Diff prüfen. Gradle ergänzt die Datei und entfernt überholte Einträge nicht automatisch. Erwartete Unterschiede zwischen Betriebssystemen sind am heutigen Stand ausschließlich die aapt2-Varianten. Andere Unterschiede müssen erklärt werden. Prüfsummen nicht von Hand ändern und Abweichungen nicht durch zusätzliche Trust-Regeln übergehen. Zum Bereinigen überholter Einträge den Bestand in einer separaten Arbeitskopie neu erzeugen und den vollständigen Diff prüfen.
5. Formprüfung, Cache-Abgleiche unter Windows und Linux sowie einen unabhängigen Listen- oder Downloadvergleich durchführen. Danach mit einem zweiten leeren Gradle-Home ohne Erzeugungsschalter aus `clean` mit aktiver Prüfung bauen, den APK-Vergleich und eine Manipulationsgegenprobe führen. Ein Lauf mit gefülltem Cache belegt die Vollständigkeit der Prüfsummendatei nicht. Den lokalen F-Droid-Lauf mit frischem Gradle-Home gesondert erneuern. Kommentare und die zwei IDE-Ausnahmen nach jeder Neuerzeugung prüfen; sie blieben beim Versuch mit Gradle 8.14.5 unter Windows erhalten.

Die Verifikation erfasst nur die von Gradle darüber aufgelösten Abhängigkeiten. Gradle-Distribution, Wrapper-JAR, Android-SDK-Pakete und npm haben eigene Prüfwege. Direkte Downloads eines Plugins, lokale Dateiabhängigkeiten und das getrennte Testempfänger-Projekt sind durch diese Datei nicht abgesichert.

## Bauen unter Linux

Unter Linux ist nur die Gruppe „Build" eingerichtet. Für den Release-Build der App mit allen Prüfungen gilt aus der Repositorywurzel:

```sh
node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe
```

`--ohne-testgruppe` gilt auch für `node scripts/android-build.mjs --nur-pruefen`. Die Prüfung der Gruppe „Build" und aller übrigen Werkzeuge bleibt unverändert; `--streng` macht weiterhin aus jedem verbleibenden Hinweis einen Abbruch.

Historischer Nachweis: Am 2026-09-30 bestand dieser Ablauf für `b7d6813` in zwei frischen Klonen unter Debian 13.5 in WSL 2 mit Node.js 24.21.0, npm 11.19.0 und OpenJDK 21.0.12.1. Beide Release-APKs waren untereinander und mit Windows bytegleich. Web-Build und Sync bestanden zusätzlich ohne Netzwerkzugriff; Gradle lief mit Netzwerkzugriff. Einzelheiten stehen im [Linux-Nachweis vom 2026-09-30](app.md#linux-nachweis-vom-2026-09-30).

Am 2026-10-03/04 wurde der Ablauf am Nachweisstand `8987e69` in zwei frischen Klonen unter Debian 13.5 in WSL 2 wiederholt: Node 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Gradle 8.14.5 `bin`, Projekt-SDK nur Gruppe „Build“. Beide strengen Release-Builds bestanden K1 bis K5 und ergaben dieselbe unsignierte APK wie Windows. Web-Build und Sync bestanden ohne Netz, die Gegenprobe ohne Ausführungsrecht für `gradlew` scheiterte mit `EACCES`. Tests und Lizenzprüfung im ersten Klon bestanden; die 79 übersprungenen Skripttests und sämtliche Zahlen sind im [Build-Nachweis am Endstand](app.md#build-nachweis-am-endstand-vom-2026-10-0304) mit ihrer Quelle erläutert. Gradle lief mit Netz. Debug unter Linux und ein zweiter Rechner sind weiterhin nicht geprüft.

## Einrichtung unter Windows

| Schritt | Befehl |
|---|---|
| Projekt-SDK mit beiden Gruppen einrichten | `pwsh -File scripts/android-sdk-einrichten.ps1` |
| Werkzeuge prüfen | `node scripts/android-build.mjs --nur-pruefen` |
| Bauen | `node scripts/android-build.mjs` |
| Bauen für ein Release | `node scripts/android-build.mjs --streng --aufgabe assembleRelease` |
| Skripte testen | `node --test "scripts/*.test.mjs" "scripts/browser/*.test.mjs"` |

Einzelne Skripttests brauchen den gebauten Rechenkern. `npm test` baut ihn seit `6ce0c7c` vor den Skripttests; die allgemeinen Build-Voraussetzungen stehen in [CONTRIBUTING, Build und Test](../CONTRIBUTING.md#build-und-test).

- Die Skripte suchen das JDK in dieser Reihenfolge: `JAVA_HOME`, dann die üblichen Installationsordner von Eclipse Temurin, Microsoft Build of OpenJDK und der Android-Komponenten von Visual Studio. Sie nehmen das erste geeignete JDK.
- Ist kein JDK 21 vorhanden: Eclipse Temurin 21 nach der Anleitung von Adoptium installieren, https://adoptium.net/installation/windows. Die Skripte brauchen keinen Eintrag in `PATH`.
- Der Emulator braucht unter Windows die Funktion „Windows-Hypervisor-Plattform". Sie wird einmalig mit Administratorrechten eingeschaltet und verlangt einen Neustart: `Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All`. `emulator -accel-check` zeigt, ob die Beschleunigung verfügbar ist.

Testgeräte für den Emulator:

| Angabe | Wert |
|---|---|
| Ort | `%LOCALAPPDATA%\fristenrechner\avd`, für den Lauf gesetzt über `ANDROID_AVD_HOME` |
| Namen | `fr-api36`, `fr-api30`, `fr-api24`, je Systemabbild ein Gerät |
| Geräteprofil | `pixel_6` |
| Datenbereich | 6 GiB, Eintrag `disk.dataPartition.size=6G` in der Datei `config.ini` des Geräts |
| Anlegen | `avdmanager create avd -n fr-api36 -k "system-images;android-36;default;x86_64" -d pixel_6` |
| Start | `emulator -avd fr-api36 -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -gpu swiftshader_indirect` |

- Der Ort liegt neben dem Projekt-SDK. Geräte anderer Werkzeuge bleiben unberührt.
- `avdmanager` gehört zu den Kommandozeilenwerkzeugen und muss im SDK liegen: Es leitet den Ort des SDK aus seinem eigenen Ort ab.
- Der Wert für den Datenbereich wird nach dem Anlegen und vor dem ersten Start eingetragen. Ein vorhandenes Gerät schrumpft durch den Eintrag nicht.
- Ein kleinerer Wert hat sich nicht gehalten: Den Eintrag `2G` hat der Emulator 37.1.11 beim ersten Start auf allen drei Geräten durch 6442450944 Byte ersetzt, das sind 6 GiB. Ob das für jedes Gerät und jedes Abbild gilt, ist nicht geprüft.
- Der Emulator hat je Gerät eine Datei für den Arbeitsspeicher angelegt, `snapshots\default_boot\ram.img` mit 2 bis 2,5 GiB, auch mit `-no-snapshot`. Nach dem Beenden kann der Ordner `snapshots` gelöscht werden.
- Die drei Geräte belegten nach einem Lauf und ohne den Ordner `snapshots` zusammen rund 7,6 GiB.
- `avdmanager` 22.0 meldet beim Anlegen je Systemabbild „Could not load devices from … devices.xml". Die Abbilder der Reihe `default` enthalten diese Datei nicht. Das Gerät entsteht trotzdem, der Rückgabewert ist 0.
- `-no-metrics` schaltet die Nutzungsstatistik des Emulators ab.
- Arbeitspaket 2.5 legt fest, wie die Testläufe automatisiert werden.

Ort des SDK, beide Skripte verwenden dieselbe Reihenfolge:

| Rang | Einrichtungsskript | Build-Skript |
|---|---|---|
| 1 | Parameter `-SdkRoot` | Parameter `--sdk` |
| 2 | – | `sdk.dir` in `local.properties` des Android-Projekts |
| 3 | `ANDROID_HOME` | `ANDROID_HOME` |
| 4 | Standardordner | Standardordner |

- `local.properties` ist von Git ausgeschlossen. Gradle zieht `sdk.dir` dem Wert von `ANDROID_HOME` vor. Nennen `--sdk` und `sdk.dir` verschiedene Orte, bricht das Build-Skript ab.
- Das Build-Skript liest `sdk.dir` wie Gradle: Trennzeichen `=`, `:` oder Leerraum, Maskierung mit `\`, relative Werte ab dem Ordner des Android-Projekts. Enthält die Datei an irgendeiner Stelle eine Fortsetzungszeile, bricht es ab.
- Relative Angaben bei `-SdkRoot` und `--sdk` gelten ab dem aktuellen Ordner der Shell.
- Das Einrichtungsskript prüft vor dem Download, ob der Zielordner beschreibbar ist. Wer einen anderen Ort als den Standardordner wählt, gibt ihn dem Build-Skript auf einem der Wege 1 bis 3 an.

## Build für F-Droid

F-Droid baut unter Debian. Die Werkzeuge von F-Droid laufen nicht unter Windows.

| Werkzeug | Version | Hinweis |
|---|---|---|
| Debian | 13 (trixie) | Mindeststand für den Buildserver von F-Droid |
| fdroidserver | 2.4.2 (AGPL-3.0), Paket `fdroidserver` 2.4.2-1 aus Debian 13 | Festgelegt am 2026-09-28 als Stand des lokalen Nachweises, Begründung in `fdroid-build.md`, Festlegung F1. Bis dahin war 2.4.5 genannt. Der [lokale Lauf vom 2026-10-04](fdroid-build.md#lauf-am-endstand-vom-2026-10-04) verwendete diesen Stand; der Stand des Buildservers von F-Droid ist nicht geprüft. |
| gradlew-fdroid | Commit `c7227d147483979bb5c408048cee3533a8814fb0` (AGPL-3.0-only) | F2 festgelegt am 2026-09-29; Gradle 8.14.5 bleibt. Quelle, SHA-256, Benutzerablage und Laufzeitdownloads: [fdroid-build.md, F2](fdroid-build.md#f2-festgehaltenes-buildwerkzeug); Werte in `scripts/toolchain.json`. |
| OpenJDK | 21.0.12.1+1 aus Debian 13 | Hauptversion 21 wie festgelegt |
| Node.js | lokal: Archiv 24.21.0; Veröffentlichungsrezept: forky, gemessen `24.21.0+dfsg+~cs24.13.4-1` am 2026-10-23 | Debian trixie liefert 20.19.2 und ist für Astro 7 zu alt |
| npm im Veröffentlichungsrezept | forky, gemessen `12.2.0+ds1-1` am 2026-10-23 | lokale Referenz 11.19.0 unverändert |
| esbuild im Veröffentlichungsrezept | forky, gemessen `0.28.2-1` am 2026-10-23 | Muss zur npm-Version 0.28.2 im Lockfile passen; npm-Plattformpaket entfernen, Debian-Paket wird über den globalen Node-Suchpfad gefunden, ohne `ESBUILD_BINARY_PATH` |
| cargo und rustc im Veröffentlichungsrezept | forky, jeweils `1.97.1+dfsg1-1` am 2026-10-23 | alle vier Bindungen damit gebaut; kein rustup, keine Übersteuerung des Release-Profils; die unterschiedlichen Rust-Pins stehen in [M2](fdroid-build.md#messungen-vom-23102026) |
| build-essential und cmake im Veröffentlichungsrezept | 12.12 und 4.3.4-1 in der vollständigen Probe und in der Pipeline 2981625855 vom 2026-10-23 | systemweit über den `sudo`-Block mit Zielsuite forky (`apt-get install -t forky`) installiert; laut apt-Protokoll kam `cmake` 4.3.4-1 aus forky und `build-essential` 12.12 aus dem trixie-Index |

F-Droid verlangt freie Werkzeuge für den gesamten Build und bevorzugt Pakete aus Debian. Das JDK von Oracle ist ausgeschlossen.

**Risiko der esbuild-Versionskopplung:** Der npm-Lader verlangt genau dieselbe Version wie das gestartete Programm. Laut Debian-madison vom 2026-10-23 liefern forky und sid `esbuild` 0.28.2-1, passend zum npm-Paket 0.28.2. Weil das Rezept nur forky festlegt, kann ein späteres Debian-Update den Web-Build ohne Änderung des Lockfiles abbrechen lassen. Die Probe vergleicht `esbuild --version` aus dem Systempfad nach den `sudo`-Schritten mit `node_modules/esbuild/package.json` im Build-Ordner und protokolliert beide Versionen. Als möglicher Ausweg ist die vorhandene fdroiddata-srclib `esbuild` aus `https://github.com/evanw/esbuild.git` mit `go build ./cmd/esbuild` zu prüfen, wie im Rezept `metadata/net.opendsp.x4x4.yml`. Das ist eine Möglichkeit für einen passenden Quelltextbau, keine beschlossene Umstellung.

Auf einem Windows-Rechner braucht der Nachweis aus Arbeitspaket 2.8 eine Linux-Umgebung: WSL 2 mit Debian 13 oder einen Container. Eingerichtet ist seit dem 2026-09-28 WSL 2 mit Debian 13.5, siehe `fdroid-build.md`.

### Prüfwerkzeug LibreOffice

Festgelegt am 2026-10-04 für die Sichtung der Excel-Ausgaben (Testmatrix B14): `libreoffice-calc-nogui` 4:25.2.3-2+deb13u7 aus `trixie-security` (MPL-2.0), installiert mit `apt-get install --no-install-recommends` in derselben Debian-Umgebung unter WSL 2. Die Simulation am 2026-10-04 ergab 73 neue Pakete, keine Aktualisierung vorhandener Pakete, kein zusätzliches JDK und kein zusätzliches Python. LibreOffice ist nur Prüfwerkzeug: Es gehört weder zum Build der App noch zum Rezept für F-Droid. Umwandlungen laufen ohne Oberfläche und ohne Netz (`unshare -r -n`). Die Paketliste vor und nach der Installation wird gesichert; die zusätzlichen Pakete liegen auch in der Umgebung späterer lokaler Läufe mit den Werkzeugen von F-Droid und sind dort zu berücksichtigen. Unter Windows wird dafür nichts installiert.

### Vorgefertigte Binärdateien

Freie Lizenzen allein klären nicht, wie F-Droid vorgefertigte Binärdateien behandelt. Die Tabelle unterscheidet die lokalen Builds vom Veröffentlichungsrezept. Die genannten Buildwerkzeuge gelangen nicht in die App.

| Datei oder Paket | Herkunft | Zweck | Absicherung | Klärung in 2.8 |
|---|---|---|---|---|
| Node.js | lokal: offizielles Archiv von nodejs.org; Veröffentlichungsrezept seit 2026-10-23: Debian forky | Web-Build | lokal: Archiv-SHA-256 in `scripts/toolchain.json`; Veröffentlichungsrezept: Debian-Paketverwaltung | Pipeline 2980491535 belegt die frühere Umstellung nur von Node.js/npm; vollständige lokale Probe von Option A am Rezeptstand `fae0b24` am 2026-10-23 mit bytegleicher APK bestanden; Pipeline 2981625855 der kanonischen Fassung mit Binärabgleich bestanden |
| Rolldown, Astro compiler-rs, Satteri, Lightning CSS | lokal: npm-Plattformpakete; Veröffentlichungsrezept: Quelltext aus vier srclib-Tags | native Node-Bindungen für den Web-Build | lokal: npm-Lockfile; Veröffentlichungsrezept: Tags und Cargo-Locks, Originalprofile; Astro-Lock im `prebuild` neu erzeugt | sieben native Plattformpakete vor dem Scanner entfernen, vier selbst gebaute Bindungen erst in `build` unter den lokalen Rückfallnamen einsetzen; Quellen und Messungen in [E1 bis E10](fdroid-build.md#werkzeuge-aus-quelltext-23102026) |
| esbuild | lokal: npm-Plattformpaket; Veröffentlichungsrezept: Debian forky | Web-Build über Astro | lokal: npm-Lockfile; Veröffentlichungsrezept: Debian-Paketverwaltung und esbuild-Versionsprüfung | `node_modules/@esbuild/linux-x64` entfernen; Debian-Paket ohne `ESBUILD_BINARY_PATH` verwenden |
| `sharp` mit `libvips` | npm, optionale Abhängigkeit von Astro | Bildverarbeitung, laut Trace vom 2026-10-23 im Web-Build nicht genutzt | Prüfsummen im Lockfile | Veröffentlichungsrezept entfernt beide Linux-Plattformpakete vor dem Scanner |
| `gradle-wrapper.jar` | Gradle, im Repository eingecheckt | Start des Gradle-Builds | SHA-256 in diesem Dokument, Prüfung im Build-Skript | Behandlung durch den Scanner |
| Gradle-Distribution | services.gradle.org | Android-Build | `distributionSha256Sum` | F-Droid nutzt die eigene Gradle-Verwaltung |
| Gradle-Artefakte, darunter AGP und aapt2 | Google Maven und Maven Central | Android-Build; aapt2 wird aus einem plattformspezifischen JAR geladen | SHA-256 in `verification-metadata.xml`, einschließlich aapt2 für Windows und Linux | lokaler F-Droid-Lauf mit frischem Gradle-Home und aktiver Prüfung am 2026-10-15 bestanden, siehe [Lauf am eingefrorenen Stand](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15); Buildserver von F-Droid nicht geprüft |
| Android SDK | Google | Android-Build | Prüfsummen der Paketliste | F-Droid stellt das SDK selbst bereit |

Die frühe F-Droid-Probe mit der Minimal-App durchlief diesen vollständigen Weg einschließlich Web-Build. Die spätere gezielte Bereinigung und der lokale Lauf mit der App am Endstand stehen in [fdroid-build.md](fdroid-build.md). Daraus folgt kein Nachweis auf dem Buildserver von F-Droid.

## Offene Festlegungen späterer Arbeitspakete

Jede dieser Festlegungen fällt, bevor das betreffende Werkzeug installiert wird.

| Thema | Arbeitspaket |
|---|---|
| Prüfung mit einem Screenreader: auf einem echten Gerät vor Stufe 4. Die Systemabbilder ohne Google-Dienste bringen keinen mit; im Emulator prüft die App-Prüfung nur den Barrierebaum und die Namen der Bedienelemente. | Testmatrix |
| Lokalen F-Droid-Lauf mit frischem Gradle-Home und aktiver Gradle-Prüfsummenprüfung belegen – erledigt am 2026-10-15, siehe [Lauf am eingefrorenen Stand](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15) | vor Stufe 5 |

## Bekannte Einschränkungen

1. **npm 10 löst Vitest 4 nicht frisch auf.** `npm install vitest@4.1.11` bricht mit npm 10.9.8 und 10.9.9 ab: `Cannot read properties of null (reading 'edgesOut')`. Der Fehler liegt im Resolver von npm 10 und betrifft auch Vitest 4.1.10. npm 11.19.0 löst denselben Baum fehlerfrei auf. `npm ci` aus einem vorhandenen Lockfile läuft mit npm 10 fehlerfrei. Deshalb ist npm 11.19.0 die Referenzversion.
2. **npm 11 führt Installationsskripte in der Voreinstellung aus** und weist nur auf ungeprüfte Skripte hin. Im festgelegten Baum hat `esbuild` ein solches Skript. Mit `ignore-scripts=true` läuft keines. Web-Build, Typprüfung und Tests laufen auch so.
3. **`astro check` unterstützt TypeScript 7 noch nicht.** Deshalb gilt TypeScript 6.0.3. Eine Probe mit TypeScript 7.0.2 hat ein Minimalpaket fehlerfrei übersetzt. Der Wechsel folgt, sobald `astro check` TypeScript 7 unterstützt.
4. **Betrieb ohne die Berechtigung `INTERNET`.** Capacitor lädt die Oberfläche aus den Dateien der App und nicht aus dem Netz. Die Probe dieses Arbeitspakets zeigt: Die App startet ohne die Berechtigung auf den drei Systemabbildern und zeigt ihre Seite an. Die Seite der Probe ist fertiges HTML. Berechnung auf dem Gerät und Plugins prüft Arbeitspaket 2.5 und führt damit den vollständigen Nachweis.
5. **Version der WebView.** Capacitor 8.5.2 verlangt in der Voreinstellung mindestens Version 60 der System-WebView und lässt als Einstellung frühestens 55 zu. Der Web-Build kann einen neueren Stand voraussetzen. Die Systemabbilder ohne Google-Dienste bringen diese Versionen mit:

   | Systemabbild | System-WebView | Ergebnis der Probe |
   |---|---|---|
   | API 36 | 133.0.6943.137 | Seite erscheint |
   | API 30 | 83.0.4103.120 | Seite erscheint |
   | API 24 | 52.0.2743.100 | Seite erscheint, Capacitor meldet „System WebView is not supported", das Skript der Brücke bricht mit einem Syntaxfehler ab |

   Die Tabelle beschreibt die frühere Minimal-App mit Mindest-API 24. Auf dem Abbild API 24 wären Plugins nicht nutzbar. Die App setzt seit dem 2026-09-30 Mindest-API 30 voraus; API 24 dient nur noch der Installationsgegenprobe. API 30 ist das niedrigste geprüfte Abbild mit geeigneter WebView. Für API 25 bis 29 gibt es keinen Nachweis. Auf Geräten hängt die Version der WebView vom Stand ihrer Updates ab, nicht allein von der API-Stufe.

   Beobachtet am 2026-09-29 in der Probe zum Update (`signierung.md`): Die WebView 83 des Abbilds API 30 bricht das gebündelte Skript der Seite mit `Uncaught SyntaxError: Unexpected token '='` ab; der Aufruf des Plugins über die Brücke findet nicht statt. Die Prüfsummen der unsignierten APK blieben trotz `vite.build.target: 'chrome60'` in `astro.config.mjs` gleich. Das gebündelte Skript wurde nicht aufbewahrt. Welcher Ausdruck den Syntaxabbruch auslöste und warum das Build-Ziel die Prüfsumme nicht änderte, ist damit nicht unabhängig nachvollziehbar. Die App setzt das JavaScript-Ziel inzwischen über `configEnvironment` für die Client-Umgebung und das CSS-Ziel über `cssTarget` auf `chrome83`. Der statische Web-Build bestand am 2026-09-30. Beim Rauchtest dieser App am selben Tag erschienen auf API 30 und 36 die Rechnerseite und ihre Eingabefelder; `logcat` enthielt keine Fehlerzeile. Berechnung, Brückenaufruf und Updateprüfung wurden dabei nicht wiederholt. Die spätere Emulatorprüfung vom selben Tag belegt Berechnung und Brückenaufruf auf beiden Abbildern, siehe [app.md](app.md#prüfung-im-emulator). Die Updateprüfung vom 2026-10-04 ist inzwischen mit der Testfassung der App unter eigener App-ID auf API 30 und 36 belegt; Quelle und Grenzen stehen in [signierung.md](signierung.md#nachweise-für-die-abnahme).
6. **Der Build lädt Werkzeuge und Abhängigkeiten aus dem Netz.** Das betrifft nur den Build. Die App greift im Betrieb nicht auf das Netzwerk zu.
7. **`sdkmanager` ist abgekündigt.** Siehe Abschnitt „Android SDK". Die Festlegung auf die Kommandozeilenwerkzeuge 22.0 ist eine Übergangslösung.
8. **Warnung des Android-Gradle-Plugins zum Format der Paketbeschreibung.** Die installierten Pakete tragen `package.xml` im Format 4. Das Android-Gradle-Plugin 8.13 versteht Format 3 und meldet das beim Build als Warnung. Der Build läuft durch.
9. **Astro meldet Nutzungsdaten.** Astro 7.3.3 schickt bei `astro build` und `astro sync` Angaben zu System, Versionen, Befehl und einer zufälligen Kennung an `https://telemetry.astro.build`, bei `astro check` nur nach bestimmten Fehlern, etwa in der Konfiguration (`@astrojs/telemetry` 3.3.3, `dist/index.js` und `dist/post.js`; `astro/dist/core/build/index.js:32`, `cli/sync/index.js:19`, `core/sync/index.js:33-38`). Kein Versand, wenn `ASTRO_TELEMETRY_DISABLED` oder `TELEMETRY_DISABLED` einen Wert hat oder im Benutzerprofil `enabled: false` steht. In der Voreinstellung ist die Telemetrie im Profil eingeschaltet. Das Repository ruft Astro deshalb über `scripts/astro.mjs` auf, das die Variable für jeden Lauf setzt und selbst nichts in das Profil schreibt. `scripts/astro.test.mjs` lädt die installierte Telemetrie mit einem abgefangenen `fetch`: Mit der Umgebung des Skripts ruft sie `fetch` nicht auf, ohne die Variable einmal. Wer Astro direkt aufruft, setzt die Variable selbst.
10. **npm 10.9.8 kennt `min-release-age` nicht.** Diese Fassung liest den Eintrag aus der `.npmrc` ohne Warnung mit, hat aber keine Definition für diese Option (geprüft am 2026-10-11 in `@npmcli/config` von npm 10.9.8 und 11.19.0) und setzt das Mindestalter nicht durch. Das Lockfile wird deshalb nur mit npm 11.19.0 geändert; `npm ci` mit npm 10.9.8 installiert den festgelegten Baum aus dem fertigen Lockfile.

## Pflege der Versionen

| Anlass | Zeitpunkt | Gegenstand |
|---|---|---|
| Regelprüfung | vierteljährlich, zusammen mit der fachlichen Prüfung | Sicherheitsmeldungen zu allen festgelegten Werkzeugen und Paketen, neue Patchstände, Revisionen des SDK |
| Ziel-API | jährlich im zweiten Quartal | Vorgabe von Google Play für den folgenden 31. August |
| Capacitor | bei neuer Hauptversion | Vorlage vergleichen, Abweichungen neu anwenden |
| Node | vor Ende der Unterstützung | Wechsel auf die nächste LTS-Version |

Jede Änderung einer Version ändert dieses Dokument, `scripts/toolchain.json` und das Lockfile im selben Schritt. Für jede neue F-Droid-Fassung sind außerdem die vier srclib-Tags und die esbuild-Version gegen das Lockfile des Build-Commits zu prüfen; geänderte Versionen erfordern einen passenden Build-Eintrag per Merge Request in fdroiddata. `AutoUpdateMode: Version` übernimmt die srclibs unverändert aus dem letzten Build-Eintrag; Ablauf und Beleg stehen im [Pflegekonzept](pflegekonzept.md#f-droid-bei-jeder-neuen-fassung).

## Nachweis

Die folgende Tabelle dokumentiert die historische Werkzeugprobe vom 2026-09-27/28 und ausdrücklich datierte Ergänzungen. Das Beispielprojekt bestand aus einer Astro-Seite mit einem TypeScript-Modul und einem Test, Capacitor mit den Plugins `filesystem` und `share` sowie einem Android-Projekt aus der Vorlage mit den damals festgelegten Abweichungen. Diese Plugins und das darüber verwendete Kotlin-Gradle-Plugin gehören nicht zur aktuellen App.

| Prüfung | Ergebnis |
|---|---|
| Auflösung des Baums mit npm 11.19.0 und `min-release-age=7`, `ignore-scripts=true` | bestanden am 2026-09-27, 393 Pakete |
| `npm ci`, Web-Build, `astro check`, Vitest mit Node 24.21.0 und npm 11.19.0 | bestanden am 2026-09-27 |
| `npm ci`, Web-Build, `astro check`, Vitest mit npm 10.9.8 aus dem Lockfile von npm 11.19.0 | bestanden am 2026-09-27 unter Node 22.23.1, der unter der Untergrenze liegt. Wiederholt am 2026-09-30 mit Node 22.23.2 und npm 10.9.8 in einer sauberen Windows-Kopie von `b7d6813`: `npm ci`, `npm test`, `npm run check`, `npm run build` und `npm run lizenzen` jeweils mit Rückgabewert 0; Arbeitskopie unverändert. |
| Frische Windows-Kopie des App-Endstands mit Node 22.23.2 und npm 10.9.8 | bestanden am 2026-10-03/04, Nachweisstand `8987e69`, `core.autocrlf=true`: `npm ci`, `npm test`, `npm run check`, `npm run build`, `npm run lizenzen` und Android-Release mit K1 bis K5. JDK 21.0.8, ohne `--streng`; Arbeitsbaum sauber. Quelle und Einzelwerte im [Build-Nachweis am Endstand](app.md#build-nachweis-am-endstand-vom-2026-10-0304). |
| Zwei frische Linux-Klone des App-Endstands | bestanden am 2026-10-03/04, Nachweisstand `8987e69`, mit Node 24.21.0, npm 11.19.0 und OpenJDK 21.0.12.1: `--streng --ohne-testgruppe`, K1 bis K5, beide Release-APKs bytegleich untereinander und mit Windows. Quelle und Grenzen im [Build-Nachweis am Endstand](app.md#build-nachweis-am-endstand-vom-2026-10-0304). |
| Build-Skript gegen ein nachgestelltes SDK: fehlendes Paket, abweichende Revision, strenge Prüfung, widersprüchliche Ortsangaben, ungeeignetes JDK | bestanden am 2026-09-27 |
| Einrichtungsskript: Syntax und Hilfsfunktionen unter Windows PowerShell 5.1 und PowerShell 7.6 | bestanden am 2026-09-27, wiederholt am 2026-09-28 |
| Einrichtungsskript gegen ein leeres SDK, Lizenzbedingungen nicht bestätigt | bestanden am 2026-09-28: Archiv der Kommandozeilenwerkzeuge 22.0 mit passender Prüfsumme geladen, `sdkmanager` zeigt die Bedingungen von `android-sdk-license`, installiert nichts und legt keine Zustimmung ab, das Skript endet mit Code 2 |
| Einrichtungsskript gegen das eingerichtete Projekt-SDK | bestanden am 2026-09-28 unter PowerShell 7.6 und Windows PowerShell 5.1, je Code 0. `sdkmanager` hat die Paketlisten abgerufen, nicht nach der Lizenz gefragt und kein Paket installiert. Alle acht Pakete wie festgelegt. |
| Prüfprogramm `scripts/SdkPruefung.java` mit `scripts/sdk-pruefung.test.mjs`: 74 Fälle mit vollständiger, unvollständiger, ungültiger und fremder Paketbeschreibung, dazu sieben Prüfungen zu Aufruf und Ausgabe. Darunter der Aufruf aus Windows PowerShell 5.1 und aus PowerShell 7.6 mit einem SDK-Ordner mit Leerzeichen, Umlauten und Schrägstrich am Ende. | bestanden am 2026-09-28 mit dem JDK 21.0.8, unter Node 24.21.0 und Node 22.23.1 |
| `sdkmanager` 22.0 mit dem JDK 21.0.8: Version, Liste der installierten Pakete, unbekanntes Paket | bestanden am 2026-09-28: Code 0, Code 0, Code 1 |
| Web-Build enthält keine Adresse im Netz | bestanden am 2026-09-27 |
| Android-Projekt erzeugt, Abweichungen angewendet, keine Fundstelle zu Google-Diensten oder zur Berechtigung `INTERNET` | bestanden am 2026-09-27 |
| JDK 21 vorhanden | bestanden am 2026-09-27: Microsoft Build of OpenJDK 21.0.8+9 |
| Gradle-Wrapper lädt Gradle 8.14.5, prüft die Prüfsumme und startet mit dem JDK 21 | bestanden am 2026-09-27 |
| Projekt-SDK mit den Gruppen „Build" und „Test" in einen leeren Ordner eingerichtet, Revisionen wie festgelegt | bestanden am 2026-09-28 mit dem Einrichtungsskript und `sdkmanager` 22.0. Die Lizenz `android-sdk-license` hat die installierende Person im Dialog von `sdkmanager` bestätigt, die Zustimmung liegt im SDK. Alle acht Pakete wie festgelegt. Die Installation lief mit dem Einrichtungsskript vor der Umstellung auf `scripts/SdkPruefung.java`. Die Umstellung betrifft die Prüfungen der Pakete vor und nach der Installation. Download, Installation und Ablauf der Lizenzbestätigung sind unverändert. Die Prüfungen wurden danach wiederholt, siehe die Zeile „Einrichtungsskript gegen das eingerichtete Projekt-SDK". |
| Vergleich mit einer Installation durch das Android-CLI | Am 2026-09-28 hatte zuvor das Android-CLI aus der Fassung 23.0 dieselben sieben Pakete in einen anderen Ordner installiert. Alle Dateien beider Installationen sind gleich (SHA-256 über 11.951 Dateien), ausgenommen `package.xml`, die das jeweilige Werkzeug schreibt. |
| Werkzeugprüfung des Build-Skripts gegen das Projekt-SDK | bestanden am 2026-09-28. Einziger Hinweis: JDK 21.0.8 statt 21.0.12. Mit `--streng` bricht der Lauf deshalb ab, wie vorgesehen. |
| Beispielprojekt baut eine APK | bestanden am 2026-09-28: `assembleDebug` in 171 Sekunden, 4,1 MB. Laut `aapt2`: Mindest-API 24, Ziel-API 36, `allowBackup=false`, keine Berechtigung `INTERNET`. Die einzige Berechtigung ist die interne `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` aus AndroidX. Wiederholt nach `clean` mit dem neu eingerichteten SDK: Die APK hat dieselbe Prüfsumme (SHA-256 `e88122143ed88220c457e5725262a9395f055731d99e538fa9731a65e610caef`). Anzahl und Gesamtgröße der Dateien im SDK waren vor und nach diesem Build gleich. |
| Emulator startet die drei Systemabbilder, die Probe läuft ohne die Berechtigung `INTERNET` | bestanden am 2026-09-28 als Start- und Anzeigetest, zwei Durchgänge. `emulator -accel-check` meldet WHPX als nutzbar. Auf API 36, 30 und 24 startet die App und zeigt ihre Seite, belegt durch Bildschirmfotos. Capacitor lädt `https://localhost` aus den Dateien der App. Befund zu API 24 siehe „Bekannte Einschränkungen", Nummer 5. |
| Pakete der Systemabbilder | geprüft am 2026-09-28 über die vollständige Liste von `pm list packages`: 181 Pakete auf API 36, 163 auf API 30, 79 auf API 24. Kein Paketname enthält `google`, `gms`, `gsf` oder `vending`. |

## Quellen

| Inhalt | Quelle |
|---|---|
| Ziel-API für Google Play | https://developer.android.com/google/play/requirements/target-sdk |
| Verträglichkeit des Android-Gradle-Plugins 8.13 | https://developer.android.com/build/releases/past-releases/agp-8-13-0-release-notes |
| Paketliste des Android SDK | https://dl.google.com/android/repository/repository2-3.xml |
| Systemabbilder ohne Google-Dienste | https://dl.google.com/android/repository/sys-img/android/sys-img2-3.xml |
| Versionen und Prüfsummen von Gradle | https://services.gradle.org/versions/all, https://gradle.org/release-checksums/ |
| Versionshinweise zu Gradle 8.14.5 | https://docs.gradle.org/8.14.5/release-notes.html |
| Versionen, Prüfsummen und Zeitplan von Node.js | https://nodejs.org/dist/, https://github.com/nodejs/Release |
| Aufnahmeregeln von F-Droid | https://f-droid.org/docs/Inclusion_Policy/ |
| Buildserver von F-Droid | https://f-droid.org/docs/Build_Server_Setup/ |
| Vorlage von Capacitor | Paket `@capacitor/cli` 8.5.2, Archiv `assets/android-template.tar.gz` |
| Versionen und Lizenzen der npm-Pakete | https://registry.npmjs.org |
