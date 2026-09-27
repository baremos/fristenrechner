# Werkzeuge und Versionen

Stand 2026-09-27 · Arbeitspaket 2.1 · Status: Versionen und Skripte festgelegt, Kreuz-Review am 2026-09-27 bestanden. Einrichtung des Projekt-SDK und Beispielbuild stehen aus, siehe Abschnitt „Nachweis".

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
- Prüfsumme des Archivs `node-v24.21.0-win-x64.zip`, SHA-256: `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`. Die Prüfsumme des Linux-Archivs legt das Build-Rezept in Arbeitspaket 2.8 fest.

### JavaScript: Kern, Oberfläche, Web-Build

| Werkzeug | Version | Lizenz | Begründung |
|---|---|---|---|
| TypeScript | 6.0.3 | Apache-2.0 | eine Version für das ganze Repository; `astro check` unterstützt TypeScript 7 noch nicht |
| Vitest | 4.1.11 | MIT | Hauptversion des Ausgangscodes; Vitest 5 ist jünger als sieben Tage |
| Astro | 7.3.3 | MIT | neueste Version mit Mindestalter; enthält die Sicherheitskorrekturen aus 7.2.4 und 7.2.8 |
| @astrojs/check | 0.9.10 | MIT | Typprüfung der Astro-Dateien |
| Vite | 8.3.0, über Astro und Vitest | MIT | im Lockfile gesperrt, kein direkter Eintrag im Manifest |

### Bibliotheken für die Exporte

Unverändert aus dem Ausgangscode übernommen. Arbeitspaket 2.4 bindet sie ein. Die Lizenzprüfung samt Transitivabhängigkeiten liegt davor.

| Bibliothek | Version | Lizenz | Zweck |
|---|---|---|---|
| jspdf | 4.2.1 | MIT | PDF |
| jspdf-autotable | 5.0.8 | MIT | Tabellen im PDF |
| exceljs | 4.4.0 | MIT | Excel |

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

Zum JDK:

- Festgelegt ist die Hauptversion 21. Ein vorhandenes JDK 21 wird mitgenutzt und nicht ein zweites Mal installiert.
- Die Skripte nehmen nur ein vollständiges JDK an: `java` und `javac` sind vorhanden, die Versionsabfrage gelingt, die Ausgabe nennt `OpenJDK`. Das JDK von Oracle gehört nicht zur Werkzeugkette und wird übersprungen.
- Festgelegter Stand für Release-Builds: 21.0.12, wie ihn Debian 13 und Eclipse Temurin liefern. Ein Zusatz wie 21.0.12.1 zählt dazu.
- Für Entwicklung und Probe genügt ein anderer Patchstand der Hauptversion 21. Das Build-Skript meldet ihn als Hinweis, mit `--streng` bricht es ab. Geprüft ist Microsoft Build of OpenJDK 21.0.8. Wer ein vorhandenes JDK mitnutzt, aktualisiert es über das Werkzeug, das es installiert hat.

Android Studio ist nicht nötig.

### API-Stufen

| Angabe | Wert | Begründung |
|---|---|---|
| Mindest-API (`minSdkVersion`) | 24, Android 7.0 | Untergrenze von Capacitor 8 |
| Übersetzungs-API (`compileSdkVersion`) | 36 | Capacitor-Vorlage 8.5.2 |
| Ziel-API (`targetSdkVersion`) | 36, Android 16 | Vorgabe von Google Play seit 2026-08-31 für neue Apps und Updates |

Google Play hebt die verlangte Ziel-API in der Regel jährlich zum 31. August an. Die Prüfung gehört deshalb in die Regelprüfung des zweiten Quartals, siehe `pflegekonzept.md`.

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
| `cmdline-tools;23.0` | 23.0 | Build | nein |
| `platforms;android-36` | 2 | Build | ja |
| `build-tools;35.0.0` | 35.0.0 | Build | ja |
| `platform-tools` | 37.0.1 | Build | nein |
| `emulator` | 37.1.11 | Test | nein |
| `system-images;android-36;default;x86_64` | 2 | Test | nein |
| `system-images;android-24;default;x86_64` | 8 | Test | nein |

Archive und Prüfsummen (SHA-1) aus den Paketlisten von Google, Stand 2026-09-27:

| Paket | Archiv | SHA-1 |
|---|---|---|
| Kommandozeilenwerkzeuge, Windows | `commandlinetools-win-16111833_latest.zip` | `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d` |
| Kommandozeilenwerkzeuge, Linux | `commandlinetools-linux-16111833_latest.zip` | `e025545c62a8e64c7559119566a569fb1dec5f60` |
| Plattform 36 | `platform-36_r02.zip` | `2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576` |
| Build-Tools 35.0.0, Windows | `build-tools_r35_windows.zip` | `af059bb67cf7786f45ee0db85e2d24985df1b4b6` |
| Build-Tools 35.0.0, Linux | `build-tools_r35_linux.zip` | `2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc` |
| Platform-Tools 37.0.1, Windows | `platform-tools_r37.0.1-win.zip` | `e03e78b1d80b396f1c3358e31251cb31740e1110` |
| Platform-Tools 37.0.1, Linux | `platform-tools_r37.0.1-linux.zip` | `477254aa5f903c15cf51001717bdf347fb6b53e0` |
| Emulator 37.1.11, Windows | `emulator-windows_x64-15917651.zip` | `54fa750822ff462d57e04fc8e98e60f08df2bb61` |
| Emulator 37.1.11, Linux | `emulator-linux_x64-15917651.zip` | `1b1f78891abf8ec268264356e1365c25519e8379` |
| Systemabbild API 36 | `x86_64-36_r02.zip` | `829c076e8ff448a336097ae25a355b495ba36e2c` |
| Systemabbild API 24 | `x86_64-24_r08.zip` | `f6559e1949a5879f31a9662f4f0e50ad60181684` |

Das Einrichtungsskript prüft das Archiv der Kommandozeilenwerkzeuge gegen die Prüfsumme und gibt zusätzlich dessen SHA-256 aus. Die übrigen Archive lädt und prüft `sdkmanager`.

So bleiben die Revisionen unter Kontrolle:

- `sdkmanager` liefert zu einem Paketnamen den jeweils aktuellen Stand. Eine spätere Installation kann deshalb eine andere Revision bringen als hier festgelegt.
- Das Einrichtungsskript vergleicht nach der Installation jede Revision mit `scripts/toolchain.json`, auch die der Kommandozeilenwerkzeuge. Bei einer Abweichung endet es mit einem Fehler.
- Das Build-Skript vergleicht vor jedem Build alle Pakete beider Gruppen:

| Befund | Folge |
|---|---|
| Paket der Gruppe „Build" fehlt | Abbruch |
| Paket, das in die App eingeht, weicht ab | Abbruch |
| Paket der Gruppe „Test" fehlt | Hinweis |
| anderes Paket weicht ab | Hinweis |
| beliebiger Hinweis bei `--streng` | Abbruch |

- Eine neue Revision wird erst nach Prüfung übernommen: Eintrag in diesem Dokument und in `scripts/toolchain.json`, Kreuz-Review.

Weitere Angaben:

- `build-tools;35.0.0` ist die Mindest- und Standardversion des Android-Gradle-Plugins 8.13. Das App-Projekt trägt sie ausdrücklich als `buildToolsVersion` ein. `apksigner` und `zipalign` kommen aus diesem Paket, `keytool` aus dem JDK.
- Die Systemabbilder der Reihe `default` enthalten keine Google-Dienste. Sie decken die Ziel-API und die Mindest-API ab.
- Beide Gruppen werden zusammen eingerichtet. Die Gruppe „Test" umfasst rund 1,6 GB.
- Das Android SDK steht unter den Lizenzbedingungen von Google. Wer es installiert, bestätigt sie selbst mit `sdkmanager --licenses`.

## Abweichungen von der Capacitor-Vorlage

Die Vorlage von Capacitor 8.5.2 enthält Stellen, die zum Zuschnitt dieser App oder zu den Grundsätzen nicht passen. Arbeitspaket 2.5 ändert sie im App-Projekt, Arbeitspaket 2.8 prüft das Ergebnis mit dem Scanner von F-Droid.

| Stelle in der Vorlage | Inhalt | Änderung |
|---|---|---|
| `android/build.gradle` | `classpath 'com.google.gms:google-services:4.4.4'` | entfernen |
| `android/app/build.gradle` | Block, der bei vorhandener `google-services.json` das Plugin `com.google.gms.google-services` anwendet | entfernen |
| `AndroidManifest.xml` | Berechtigung `android.permission.INTERNET` | entfernen |
| `AndroidManifest.xml` | `android:allowBackup="true"` | abschalten, Regeln für Sicherung und Gerätewechsel setzen |
| `gradle-wrapper.properties` | Gradle 8.14.3, keine Prüfsumme | Gradle 8.14.5, `distributionSha256Sum` |
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

- Die Skripte suchen das JDK in dieser Reihenfolge: `JAVA_HOME`, dann die üblichen Installationsordner von Eclipse Temurin, Microsoft Build of OpenJDK und der Android-Komponenten von Visual Studio. Sie nehmen das erste geeignete JDK.
- Ist kein JDK 21 vorhanden: Eclipse Temurin 21 nach der Anleitung von Adoptium installieren, https://adoptium.net/installation/windows. Die Skripte brauchen keinen Eintrag in `PATH`.
- Der Emulator braucht unter Windows die Funktion „Windows-Hypervisor-Plattform". Sie wird einmalig mit Administratorrechten eingeschaltet und verlangt einen Neustart: `Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All`. `emulator -accel-check` zeigt, ob die Beschleunigung verfügbar ist.

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
| fdroidserver | 2.4.5 (AGPL-3.0) | Debian 13 liefert 2.4.2. Der Installationsweg für 2.4.5 wird in 2.8 festgelegt, bevor installiert wird. |
| OpenJDK | 21.0.12.1+1 aus Debian 13 | Hauptversion 21 wie festgelegt |
| Node.js | Debian 13 liefert 20.19.2 | zu alt für Astro 7, siehe unten |

F-Droid verlangt freie Werkzeuge für den gesamten Build und bevorzugt Pakete aus Debian. Das JDK von Oracle ist ausgeschlossen.

Auf einem Windows-Rechner braucht der Nachweis aus Arbeitspaket 2.8 eine Linux-Umgebung: WSL 2 mit Debian 13 oder einen Container. Die Einrichtung ist ein eigener Schritt und nicht Teil dieses Arbeitspakets.

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
| Build-Ziel des Web-Builds und geprüfte Version der System-WebView. Die Mindest-API allein bestimmt die Fähigkeiten der WebView nicht. | 2.5 |
| Bereitstellung eines Screenreaders auf den Systemabbildern ohne Google-Dienste | 2.5, Testmatrix |
| Installationsweg und Python-Version für fdroidserver 2.4.5 | 2.8 |
| Linux-Umgebung für den F-Droid-Nachweis | 2.8 |
| Prüfsummen der Gradle-Abhängigkeiten | 2.8 |

## Bekannte Einschränkungen

1. **npm 10 löst Vitest 4 nicht frisch auf.** `npm install vitest@4.1.11` bricht mit npm 10.9.8 und 10.9.9 ab: `Cannot read properties of null (reading 'edgesOut')`. Der Fehler liegt im Resolver von npm 10 und betrifft auch Vitest 4.1.10. npm 11.19.0 löst denselben Baum fehlerfrei auf. `npm ci` aus einem vorhandenen Lockfile läuft mit npm 10 fehlerfrei. Deshalb ist npm 11.19.0 die Referenzversion.
2. **npm 11 führt Installationsskripte in der Voreinstellung aus** und weist nur auf ungeprüfte Skripte hin. Im festgelegten Baum hat `esbuild` ein solches Skript. Mit `ignore-scripts=true` läuft keines. Web-Build, Typprüfung und Tests laufen auch so.
3. **`astro check` unterstützt TypeScript 7 noch nicht.** Deshalb gilt TypeScript 6.0.3. Eine Probe mit TypeScript 7.0.2 hat ein Minimalpaket fehlerfrei übersetzt. Der Wechsel folgt, sobald `astro check` TypeScript 7 unterstützt.
4. **Betrieb ohne die Berechtigung `INTERNET`.** Capacitor lädt die Oberfläche aus den Dateien der App und nicht aus dem Netz. Dass das ohne die Berechtigung auf beiden Systemabbildern funktioniert, zeigt die Probe dieses Arbeitspakets. Den vollständigen Nachweis führt Arbeitspaket 2.5.
5. **Version der WebView.** Capacitor 8 verlangt mindestens Version 60 der System-WebView. Der Web-Build kann einen neueren Stand voraussetzen.
6. **Der Build lädt Werkzeuge und Abhängigkeiten aus dem Netz.** Das betrifft nur den Build. Die App greift im Betrieb nicht auf das Netzwerk zu.

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
| Einrichtungsskript: Syntax und Hilfsfunktionen unter Windows PowerShell 5.1 und PowerShell 7.6 | bestanden am 2026-09-27. Download, Lizenzbestätigung und Installation sind noch nicht gelaufen. |
| Web-Build enthält keine Adresse im Netz | bestanden am 2026-09-27 |
| Android-Projekt erzeugt, Abweichungen angewendet, keine Fundstelle zu Google-Diensten oder zur Berechtigung `INTERNET` | bestanden am 2026-09-27 |
| JDK 21 vorhanden | bestanden am 2026-09-27: Microsoft Build of OpenJDK 21.0.8+9 |
| Projekt-SDK mit den Gruppen „Build" und „Test" eingerichtet, Revisionen wie festgelegt | offen |
| Beispielprojekt baut eine APK | offen |
| Emulator startet beide Systemabbilder, die Probe läuft ohne die Berechtigung `INTERNET` | offen |

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
