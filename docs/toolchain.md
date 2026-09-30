# Werkzeuge und Versionen

Stand 2026-09-28 · Arbeitspaket 2.1 · Status: Versionen und Skripte festgelegt, Kreuz-Review der Festlegung am 2026-09-27 bestanden. Am 2026-09-28 geändert: Kommandozeilenwerkzeuge 22.0 statt 23.0, Prüfung der Pakete mit `scripts/SdkPruefung.java`, Testgeräte. Projekt-SDK eingerichtet, Beispielbuild und Probe im Emulator bestanden, siehe Abschnitt „Nachweis". Kreuz-Review dieser Änderungen am 2026-09-28 bestanden. Am 2026-09-29 ergänzt: Unter Linux wird nur die Gruppe „Build" eingerichtet.

Ergänzt am 2026-09-30: Die App setzt Android 11 (API 30) und WebView ab Version 83 voraus. Ihr Wrapper verwendet Gradle 8.14.5 als `bin`-Verteilung. Die AndroidX-Versionen aus `app/android/variables.gradle` sind unten aufgeführt. Debug- und Release-Build der App unter Windows sind erfolgt; Ergebnisse und ausstehende Prüfungen stehen in [app.md](app.md).

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

Arbeitspaket 2.4 bindet sie ein. Die Lizenzprüfung samt Transitivabhängigkeiten liegt davor.

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
| @capacitor/filesystem | 8.1.3 | MIT | fest: Exportdatei schreiben |
| @capacitor/share | 8.0.2 | MIT | fest: Teilen-Dialog |
| @capacitor/app | 8.1.1 | MIT | Kandidat, Entscheidung in 2.6 |
| @capawesome/capacitor-file-picker | 8.1.0 | MIT | Kandidat, Entscheidung in 2.6 |

Zu den Kandidaten: Die WebView von Capacitor öffnet den Dateidialog des Systems auch über ein gewöhnliches Dateifeld. Die Wiederaufnahme der App meldet der Browser über `visibilitychange`. Arbeitspaket 2.6 prüft, ob die Plugins trotzdem nötig sind. Jede Abhängigkeit weniger vereinfacht Lizenzprüfung und F-Droid-Build.

`@capacitor/filesystem` bindet die Bibliothek `io.ionic.libs:ionfilesystem-android` 1.1.0 (MIT, Maven Central) und das Kotlin-Gradle-Plugin 2.2.20 (Apache-2.0) ein.

Keines der genannten Pakete enthält Google Play Services oder Firebase. Keines trägt eine Berechtigung in das Manifest ein.

### Android-Build

| Werkzeug | Version | Lizenz | Quelle der Festlegung |
|---|---|---|---|
| JDK | 21, eine freie OpenJDK-Distribution | GPL-2.0 mit Classpath Exception | Capacitor 8 verlangt Java 21 |
| Gradle | 8.14.5, über den Gradle-Wrapper | Apache-2.0 | Abweichung von der Vorlage, siehe unten |
| Android-Gradle-Plugin | 8.13.0 | Apache-2.0 | Capacitor-Vorlage 8.5.2 |
| Kotlin-Gradle-Plugin | 2.2.20 | Apache-2.0 | `@capacitor/filesystem` 8.1.3 |

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

Die Lizenzprüfung der vollständigen Gradle-Abhängigkeiten der App steht noch aus.

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

Die Mindest-API ist höher als die Untergrenze von Capacitor 8. Das geprüfte Abbild mit API 24 enthält WebView 52; dort scheitert bereits die Brücke. Für API 25 bis 29 gibt es keinen Nachweis mit einem geeigneten Abbild. Die App verlangt deshalb zusätzlich `android.minWebViewVersion: 83`; JavaScript und CSS werden für `chrome83` gebaut. Eine ältere WebView soll die lokale Fehlerseite `startfehler.html` über `server.errorPath` anzeigen. Die Mindest-API allein garantiert keinen bestimmten Update-Stand der WebView. Der Rauchtest vom 2026-09-30 belegt Start und Anzeige dieser App auf API 30 und 36, siehe [app.md](app.md#rauchtest-im-emulator). Die weitergehenden Emulatorprüfungen, darunter die Anzeige der Fehlerseite, stehen aus.

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
- Das Build-Skript vergleicht vor jedem Build alle Pakete beider Gruppen:

| Befund | Folge |
|---|---|
| Paket der Gruppe „Build" fehlt oder ist ungültig | Abbruch |
| Paket, das in die App eingeht, weicht ab | Abbruch |
| Paket der Gruppe „Test" fehlt oder ist ungültig | Hinweis |
| anderes Paket weicht ab | Hinweis |
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

Offen für Arbeitspaket 2.8: Prüfsummen der Gradle-Abhängigkeiten über `gradle/verification-metadata.xml`.

## Sperren der Versionen

| Ort | Maßnahme | Arbeitspaket |
|---|---|---|
| `package.json` aller Workspaces | exakte Versionen, `engines` für Node | 2.2 |
| `.npmrc` | `save-exact=true`, `engine-strict=true`, `ignore-scripts=true`, `min-release-age=7` | 2.2 |
| `package-lock.json` | eingecheckt, ein Lockfile für das ganze Repository | 2.2 |
| `scripts/toolchain.json` | Referenzversionen, Prüfsummen, Revisionen des SDK | 2.1 |
| `app/android/variables.gradle` | API-Stufen und AndroidX-Versionen | 2.5 |
| `app/android/gradle/wrapper/gradle-wrapper.properties` | Gradle-Version und Prüfsumme | 2.5 |
| Build-Rezept für F-Droid | Node-Referenzversion mit Prüfsumme des Linux-Archivs | 2.8 |

## Einrichtung unter Windows

| Schritt | Befehl |
|---|---|
| Projekt-SDK mit beiden Gruppen einrichten | `pwsh -File scripts/android-sdk-einrichten.ps1` |
| Werkzeuge prüfen | `node scripts/android-build.mjs --nur-pruefen` |
| Bauen | `node scripts/android-build.mjs` |
| Bauen für ein Release | `node scripts/android-build.mjs --streng --aufgabe assembleRelease` |
| Skripte testen | `node --test "scripts/*.test.mjs"` |

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
| fdroidserver | 2.4.2 (AGPL-3.0), Paket `fdroidserver` 2.4.2-1 aus Debian 13 | Festgelegt am 2026-09-28 als Stand des lokalen Nachweises, Begründung in `fdroid-build.md`, Festlegung F1. Bis dahin war 2.4.5 genannt. Welchen Stand der Buildserver von F-Droid nutzt, hält der abschließende Nachweis fest. |
| gradlew-fdroid | Commit `c7227d147483979bb5c408048cee3533a8814fb0` (AGPL-3.0-only) | F2 festgelegt am 2026-09-29; Gradle 8.14.5 bleibt. Quelle, SHA-256, Benutzerablage und Laufzeitdownloads: [fdroid-build.md, F2](fdroid-build.md#f2-festgehaltenes-buildwerkzeug); Werte in `scripts/toolchain.json`. |
| OpenJDK | 21.0.12.1+1 aus Debian 13 | Hauptversion 21 wie festgelegt |
| Node.js | Debian 13 liefert 20.19.2 | zu alt für Astro 7, siehe unten |

F-Droid verlangt freie Werkzeuge für den gesamten Build und bevorzugt Pakete aus Debian. Das JDK von Oracle ist ausgeschlossen.

Auf einem Windows-Rechner braucht der Nachweis aus Arbeitspaket 2.8 eine Linux-Umgebung: WSL 2 mit Debian 13 oder einen Container. Eingerichtet ist seit dem 2026-09-28 WSL 2 mit Debian 13.5, siehe `fdroid-build.md`.

### Vorgefertigte Binärdateien

Freie Lizenzen allein klären nicht, wie F-Droid vorgefertigte Binärdateien behandelt. Die Tabelle nennt alle Stellen, an denen der Build solche Dateien verwendet. Keine davon gelangt in die App.

| Datei oder Paket | Herkunft | Zweck | Absicherung | Klärung in 2.8 |
|---|---|---|---|---|
| Node.js | offizielles Archiv von nodejs.org | Web-Build | SHA-256 im Build-Rezept | Begründung, warum das Paket aus Debian nicht reicht |
| `rolldown`, `esbuild`, `lightningcss` | npm, plattformabhängige Pakete | Web-Build über Vite und Astro | Prüfsummen im Lockfile | Behandlung durch den Scanner, Zeitpunkt von `npm ci` im Rezept |
| `sharp` mit `libvips` | npm, optionale Abhängigkeit von Astro | Bildverarbeitung, von der App nicht genutzt | Prüfsummen im Lockfile | aus dem Baum entfernen, wenn möglich |
| `gradle-wrapper.jar` | Gradle, im Repository eingecheckt | Start des Gradle-Builds | SHA-256 in diesem Dokument, Prüfung im Build-Skript | Behandlung durch den Scanner |
| Gradle-Distribution | services.gradle.org | Android-Build | `distributionSha256Sum` | F-Droid nutzt die eigene Gradle-Verwaltung |
| Android SDK | Google | Android-Build | Prüfsummen der Paketliste | F-Droid stellt das SDK selbst bereit |

Die frühe F-Droid-Probe mit der Minimal-App durchläuft diesen vollständigen Weg, einschließlich Web-Build. Ausnahmen für den Scanner werden einzeln begründet und so eng wie möglich gefasst.

## Offene Festlegungen späterer Arbeitspakete

Jede dieser Festlegungen fällt, bevor das betreffende Werkzeug installiert wird.

| Thema | Arbeitspaket |
|---|---|
| Emulatorprüfung der App mit dem festgelegten Build-Ziel `chrome83`, WebView ab 83 und lokaler Fehlerseite bei zu alter WebView | 2.5 |
| Probe auf dem Gerät mit Berechnung in der Oberfläche, einem Aufruf über die Brücke von Capacitor und vollständiger Paketliste des Systemabbilds | 2.5 |
| Bereitstellung eines Screenreaders auf den Systemabbildern ohne Google-Dienste | 2.5, Testmatrix |
| Gradle im Build für F-Droid, vorgebaute Programme in `node_modules`, Kategorie bei F-Droid: Festlegungen F2, F5 und F6 in `fdroid-build.md` | 2.8 |
| Prüfsummen der Gradle-Abhängigkeiten | 2.8 |

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

   Beobachtet am 2026-09-29 in der Probe zum Update (`signierung.md`): Die WebView 83 des Abbilds API 30 bricht das gebündelte Skript der Seite mit `Uncaught SyntaxError: Unexpected token '='` ab; der Aufruf des Plugins über die Brücke findet nicht statt. Die Prüfsummen der unsignierten APK blieben trotz `vite.build.target: 'chrome60'` in `astro.config.mjs` gleich. Das gebündelte Skript wurde nicht aufbewahrt. Welcher Ausdruck den Syntaxabbruch auslöste und warum das Build-Ziel die Prüfsumme nicht änderte, ist damit nicht unabhängig nachvollziehbar. Die App setzt das JavaScript-Ziel inzwischen über `configEnvironment` für die Client-Umgebung und das CSS-Ziel über `cssTarget` auf `chrome83`. Der statische Web-Build bestand am 2026-09-30. Beim Rauchtest dieser App am selben Tag erschienen auf API 30 und 36 die Rechnerseite und ihre Eingabefelder; `logcat` enthielt keine Fehlerzeile. Berechnung, Brückenaufruf und Updateprüfung wurden dabei nicht wiederholt.
6. **Der Build lädt Werkzeuge und Abhängigkeiten aus dem Netz.** Das betrifft nur den Build. Die App greift im Betrieb nicht auf das Netzwerk zu.
7. **`sdkmanager` ist abgekündigt.** Siehe Abschnitt „Android SDK". Die Festlegung auf die Kommandozeilenwerkzeuge 22.0 ist eine Übergangslösung.
8. **Warnung des Android-Gradle-Plugins zum Format der Paketbeschreibung.** Die installierten Pakete tragen `package.xml` im Format 4. Das Android-Gradle-Plugin 8.13 versteht Format 3 und meldet das beim Build als Warnung. Der Build läuft durch.
9. **Astro meldet Nutzungsdaten.** Astro 7.3.3 schickt bei `astro build` und `astro sync` Angaben zu System, Versionen, Befehl und einer zufälligen Kennung an `https://telemetry.astro.build`, bei `astro check` nur nach bestimmten Fehlern, etwa in der Konfiguration (`@astrojs/telemetry` 3.3.3, `dist/index.js` und `dist/post.js`; `astro/dist/core/build/index.js:32`, `cli/sync/index.js:19`, `core/sync/index.js:33-38`). Kein Versand, wenn `ASTRO_TELEMETRY_DISABLED` oder `TELEMETRY_DISABLED` einen Wert hat oder im Benutzerprofil `enabled: false` steht. In der Voreinstellung ist die Telemetrie im Profil eingeschaltet. Das Repository ruft Astro deshalb über `scripts/astro.mjs` auf, das die Variable für jeden Lauf setzt und selbst nichts in das Profil schreibt. `scripts/astro.test.mjs` lädt die installierte Telemetrie mit einem abgefangenen `fetch`: Mit der Umgebung des Skripts ruft sie `fetch` nicht auf, ohne die Variable einmal. Wer Astro direkt aufruft, setzt die Variable selbst.

## Pflege der Versionen

| Anlass | Zeitpunkt | Gegenstand |
|---|---|---|
| Regelprüfung | vierteljährlich, zusammen mit der fachlichen Prüfung | Sicherheitsmeldungen zu allen festgelegten Werkzeugen und Paketen, neue Patchstände, Revisionen des SDK |
| Ziel-API | jährlich im zweiten Quartal | Vorgabe von Google Play für den folgenden 31. August |
| Capacitor | bei neuer Hauptversion | Vorlage vergleichen, Abweichungen neu anwenden |
| Node | vor Ende der Unterstützung | Wechsel auf die nächste LTS-Version |

Jede Änderung einer Version ändert dieses Dokument, `scripts/toolchain.json` und das Lockfile im selben Schritt.

## Nachweis

Beispielprojekt: eine Astro-Seite mit einem TypeScript-Modul und einem Test, Capacitor mit den Plugins `filesystem` und `share`, Android-Projekt aus der Vorlage mit allen Abweichungen dieses Dokuments.

| Prüfung | Ergebnis |
|---|---|
| Auflösung des Baums mit npm 11.19.0 und `min-release-age=7`, `ignore-scripts=true` | bestanden am 2026-09-27, 393 Pakete |
| `npm ci`, Web-Build, `astro check`, Vitest mit Node 24.21.0 und npm 11.19.0 | bestanden am 2026-09-27 |
| `npm ci`, Web-Build, `astro check`, Vitest mit npm 10.9.8 aus dem Lockfile von npm 11.19.0 | bestanden am 2026-09-27 unter Node 22.23.1. Dieser Stand liegt unter der Untergrenze. Die Wiederholung mit einem unterstützten Stand der Reihe 22 ist offen. |
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
