# Android-App

Stand 2026-09-30, App-Version 0.1.0. Die App verbindet den Rechenkern und die Oberfläche des Repositorys mit einer Android-Hülle aus Capacitor 8.5.2. Sie ist eine unverbindliche Rechenhilfe für Vergabefristen. Die Vergabeordnung wird ausdrücklich gewählt. Konten, Erinnerungen, Tracking und Netzwerkzugriffe im Betrieb gehören nicht zum Zuschnitt.

## Aufbau

| Bereich | Aufgabe |
|---|---|
| `app/src/pages/index.astro` | Eine Seite mit dem Rechner und Angaben zur App; Einbindung der gemeinsamen Oberfläche über ihren Paketnamen. |
| `app/public/startfehler.html` | Lokale Fehlerseite ohne Skript für eine zu alte WebView. |
| `app/astro.config.mjs` | Statischer Web-Build nach `app/dist`, JavaScript und CSS für Chromium 83. |
| `app/capacitor.config.json` | App-ID, lokale Herkunft `https://localhost`, WebView-Untergrenze, Fehlerseite und Darstellung. |
| `app/android` | Android-Projekt, Manifest, eigene Activity, Navigationssperre und Ressourcen. |
| `scripts/app-bauen.mjs` | Web-Build, Übertragung mit Capacitor, Prüfungen und Aufruf des Android-Builds. |
| `scripts/app-pruefungen.mjs` und `.json` | Prüfungen K1 bis K5 und ihre Daten. |

`cap sync android` überträgt `app/dist` in die Assets des Android-Projekts und erzeugt die Capacitor-Konfiguration für Android. Gradle erzeugt daraus die APK. Kern und Oberfläche bleiben plattformfrei; Android-spezifischer Code liegt in der App.

## Festlegungen

| Festlegung | Begründung und Grenze |
|---|---|
| Android 11 (API 30), WebView ab 83 | API 30 ist das niedrigste geprüfte Systemabbild mit geeigneter WebView, dort Version 83.0.4103.120. Das Abbild mit API 24 enthält WebView 52; die Brücke scheitert dort. Für API 25 bis 29 fehlt ein entsprechender Nachweis. Die API-Stufe allein bestimmt den Update-Stand der WebView nicht. |
| Fehlerseite bei zu alter WebView | `server.errorPath` verweist auf `startfehler.html`. Die Seite braucht kein Skript und kann deshalb den fehlenden technischen Stand erklären. Ihre Anzeige und die Gegenprobe mit fehlender Datei sind auf API 30 geprüft; siehe den Stand der Emulatorserie unten. |
| Keine Berechtigung `INTERNET` | Die Oberfläche wird aus den mitgelieferten Dateien geladen. Eine Berechtigung für Netzwerkzugriffe ist dafür nicht vorgesehen. K5 prüft das zusammengeführte Manifest der APK. |
| Navigationssperre | Das eigene Plugin lässt nur Schema und Host der lokalen App ohne abweichenden Port zu. Andere Navigationen sollen weder laden noch an andere Apps weitergegeben werden. Auf API 30 und 36 sind je vier Wege mit wirksamer Gegenprobe belegt; fünf weitere bleiben dokumentierte Grenzen. |
| Sicherung und Gerätewechsel ausgeschlossen | `allowBackup=false` und `dataExtractionRules` schließen Cloud-Sicherung und Geräteübertragung aus. Die Regeln enthalten für beide Wege alle neun festgelegten Speicherbereiche mit `path="."`. Die statische Prüfung belegt die Regeln in der APK, nicht die Wirkung auf jedem Gerät. |
| Kein eigenes Startbild | Die App verwendet kein `Theme.SplashScreen` und keine Startbildgrafik. Der Start des Release-Builds wurde am 30.09.2026 auf API 30 und 36 gesichtet. |
| Eigenes Symbol | Ein weißer Kalender mit hervorgehobenem Tag auf rotem Hintergrund ersetzt die Symbole der Vorlage. Das adaptive Symbol enthält auch eine einfarbige Ebene. Die kurze Launcher-Beschriftung lautet „Fristenrechner“. |
| Nur deutsche Sprachressourcen | `localeFilters += ["de"]` beschränkt die Sprachvarianten der Android-Ressourcen. Sprachneutrale Ressourcen bleiben erhalten. Die App-Oberfläche ist deutsch. |
| Versionsschema | `versionName` entspricht `app/package.json`; `versionCode = Hauptversion × 10000 + Nebenversion × 100 + Patch`. Version 0.1.0 ergibt 100. |
| Kein Signierblock im Projekt | Release-Dateien werden außerhalb von Gradle signiert; das Projekt enthält keine Schlüssel oder Kennwörter. Siehe [signierung.md](signierung.md). |
| Debug-Schlüssel nur für Prüfläufe im Emulator und auf dem Testgerät | Die Android-Werkzeuge signieren den Debug-Build mit ihrem lokalen Debug-Schlüssel. Diese APK ist nicht zur Veröffentlichung bestimmt. |
| Zoom eingeschaltet | `android.zoomEnabled=true` lässt Vergrößerung in der WebView zu. Die Bedienung ist noch auf den vorgesehenen Geräten zu prüfen. |
| Eine Seite | Der Rechner braucht keine Navigation zwischen App-Seiten. Die Fehlerseite ist nur für den Startfehler vorgesehen. |
| WebView-Metadaten | `MetricsOptOut=true` und `EnableSafeBrowsing=false` sind im Manifest gesetzt. Die App lädt keine fremden Seiten; die Metadaten und die Navigationssperre ersetzen keinen Laufzeitnachweis. |

Das Build-Ziel wird aus `android.minWebViewVersion` abgeleitet. Bei Astro 7.3.3 setzt `app/astro.config.mjs` das JavaScript-Ziel über `configEnvironment` für die Client-Umgebung und das CSS-Ziel über `cssTarget`. Die statischen Prüfungen ergänzen dies um bekannte neuere Syntax und Laufzeitfunktionen.

## Vorlage und erzeugte Dateien

Der vollständige Dateivergleich mit der Android-Vorlage von Capacitor 8.5.2, die Änderungen und die Lizenzbelege stehen in [uebernahmepruefung.md](uebernahmepruefung.md#übernahme-der-android-vorlage). Ergänzend gelten folgende Beobachtungen:

- Entfernt ist die direkte Abhängigkeit auf `core-splashscreen`. Über Cordova 14.0.1 kommt weiterhin `androidx.core:core-splashscreen:1.0.1` in die APK. Die Bibliothek ist in beiden APKs vom 2026-09-30 enthalten; daraus folgt keine Aussage über die Anzeige eines Startbilds.
- Capacitor 8.5.2 erzeugt `res/xml/config.xml` mit `<access origin="*" />`. K3 erwartet genau den am 2026-09-30 beobachteten Inhalt einschließlich Leerraum. Die INTERNET-Berechtigung fehlt in beiden APKs. Die Wirkung der erzeugten Cordova-Konfiguration im Betrieb bleibt Teil der Emulatorprüfung.
- Ohne eingebundene Cordova-Plugins schreibt Capacitor zusätzlich `cordova.js` und `cordova_plugins.js` mit jeweils 0 Bytes nach `assets/public`. K3 und K5 erwarten genau diese beiden Ergänzungen neben den Dateien aus `dist`.
- Gradle schreibt den Build des Moduls `capacitor-android` nach `node_modules/@capacitor/android/capacitor/build` in der Repositorywurzel. Für getrennte Builds braucht jede Arbeitskopie ihr eigenes `node_modules`.
- Die Adressen in Kommentaren der unverändert übernommenen Dateien `app/android/app/proguard-rules.pro`, `app/android/gradle.properties` und `app/android/gradlew` bleiben mit diesen Dateien bytegleich zur Vorlage erhalten; diese Kommentaradressen werden weder zur Laufzeit noch beim Build aufgerufen.

`assets/capacitor.config.json` ist nach geparstem JSON mit der Quelle identisch, aber anders formatiert. `assets/capacitor.plugins.json` enthält `[]`. Die erzeugten Assets, `config.xml`, das Cordova-Modul und die Build-Ausgaben bleiben von Git ausgeschlossen. Die zwei erzeugten Gradle-Dateien `capacitor.settings.gradle` und `app/capacitor.build.gradle` sind dagegen eingecheckt und müssen nach erneutem Sync unverändert sein.

## Bauen

Die Werkzeuge und ihre Versionen beschreibt [toolchain.md](toolchain.md). Die folgenden Befehle laufen aus der Repositorywurzel nach Installation der festgelegten Abhängigkeiten mit `npm ci`:

```sh
npm test
npm run check
npm run build
npm run lizenzen
node scripts/app-bauen.mjs --android
node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng
node scripts/app-bauen.mjs --android-quellen
```

`--android` verwendet in der Voreinstellung `assembleDebug`. Der Ablauf ist: Rechenkern bauen, App-Seite mit Astro bauen, K1 und K2, `cap sync android`, K3 und K4, `scripts/android-build.mjs`, K5 an der erzeugten APK. Jeder Fehler beendet den Ablauf. `ASTRO_TELEMETRY_DISABLED=1` und `CI=1` gelten für alle Unterprozesse.

Unter Linux ist das Projekt-SDK nur mit der Gruppe „Build" eingerichtet. Der Release-Build mit strenger Prüfung startet dort so:

```sh
node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe
```

`--ohne-testgruppe` ist bei `app-bauen.mjs` nur zusammen mit `--android` zulässig und wird an `android-build.mjs` weitergereicht. Die Werkzeugprüfung nennt, dass sie ohne Testgruppe läuft; Emulator und Systemabbilder werden dann nicht geprüft und erzeugen keinen Hinweis. Alle übrigen Prüfungen bleiben unverändert. Ohne den Schalter führen fehlende Testpakete weiterhin zu Hinweisen und mit `--streng` zum Abbruch.

Der Kurzbefehl `npm run android --workspace app` startet denselben Ablauf und passt zu den übrigen npm-Aufrufen. Zusätzliche Argumente stehen hinter `--`, zum Beispiel `npm run android --workspace app -- --aufgabe assembleRelease --streng`.

`--aufgabe` unterstützt `assembleDebug` und `assembleRelease`, auch mit dem Präfix `:app:`. Andere Aufgaben werden vor dem Build abgewiesen, weil ihnen keine APK eindeutig für die anschließende Prüfung zugeordnet werden kann.

Die APKs liegen unter `app/android/app/build/outputs/apk/debug/app-debug.apk` beziehungsweise `app/android/app/build/outputs/apk/release/app-release-unsigned.apk`. `--streng` verlangt die festgelegten Referenzversionen der Werkzeuge und eine saubere Git-Arbeitskopie unter `app/android` vor und nach dem Sync. Das beim Windows-Build vom 2026-09-30 verwendete JDK 21.0.8 erfüllt den Release-Referenzstand 21.0.12 nicht; dieser beobachtete Build lief ohne `--streng`.

Ohne `--streng` hält die Kette den Zustand unter `app/android` unmittelbar vor dem Sync fest. Bereits vorhandene Änderungen nennt sie mit „Arbeitskopie unter app/android enthält Änderungen: …“ und baut weiter, solange der Sync diesen Zustand nicht verändert. K3 vergleicht neben dem Git-Status die Inhalte aller versionierten sowie der unversionierten, nicht ausgeschlossenen Dateien anhand von Prüfsummen. So scheitert auch eine weitere Änderung an einer bereits geänderten Datei. Neue nicht ausgeschlossene Dateien oder Änderungen an zuvor sauberen eingecheckten Dateien lassen die Prüfung ebenfalls scheitern. Ein Aufruf der Funktion `pruefeSync` ohne Zustand von vorher prüft streng.

`--android-quellen` gibt die in `capacitor.settings.gradle` referenzierten Quellordner aus. Der Aufruf baut und löscht nichts. Die Liste dient dazu, diese Quellen bei einer gesonderten Bereinigung der Build-Umgebung zu erhalten.

Ein Build kann Werkzeuge und Abhängigkeiten aus dem Netz benötigen, sofern sie noch nicht lokal vorliegen. Der Betrieb der App und ein vollständig vorbereiteter Build sind getrennt nachzuweisen.

## Prüfungen und ihre Grenzen

| Prüfung | Was sie belegt | Was sie nicht belegt |
|---|---|---|
| K1: Konfiguration | Nur zugelassene Schlüssel, festgelegte lokale Herkunft, Fehlerseite, WebView-Untergrenze und keine verbotene Netzfreigabe in der Capacitor-Konfiguration. | Tatsächliches Verhalten der WebView und Wirkung der Android-Komponenten. |
| K2: Web-Dateien | Pflichtdateien und HTML-Kopf vorhanden, Fehlerseite ohne Skript, keine Source-Maps, keine erkannten zu neuen Syntaxmerkmale; bekannte Laufzeitnamen, dynamischer Code und Adressen nur nach den begrenzten Regeln in der JSON-Datei. Kern und Oberfläche enthalten keine Capacitor-Verweise. | Vollständige Browserauswertung oder alle möglichen Laufzeitaufrufe. Berechnete Namen, zusammengesetzte Adressen, Aliase und erst zur Laufzeit erzeugter Code sind nicht vollständig erfassbar. |
| K3: Übertragung | Jeder Pfad und Dateiinhalt aus `dist` ist in `assets/public` enthalten, ergänzt um genau die zwei leeren Cordova-Dateien; Plugin-Liste leer, Capacitor-Konfiguration nach geparstem JSON gleich, Cordova-Konfiguration bytegleich zur Erwartung. Der Sync verändert den vorher festgehaltenen Git-Status und die geprüften Dateiinhalte unter `app/android` nicht. Mit `--streng` ist die Arbeitskopie dort vor und nach dem Sync sauber. | Vollständigkeit eines Quellarchivs ohne vertrauenswürdige Referenz oder das Verhalten der kopierten Dateien zur Laufzeit. |
| K4: Gradle-Dateien | Keine Vorkommen von `signingConfig`, `google-services` oder `flatDir` außerhalb von Kommentaren in den beiden eigenen `build.gradle`-Dateien; SDK-, Build-Tools-, App- und Wrapper-Versionen samt Wrapper-Prüfsumme stimmen mit ihren Vorgaben überein. `app/android/gradlew` hat im Git-Index den Dateimodus `100755`. | Vollständige Auswertung beliebigen Gradle-Codes, aller erzeugten Gradle-Dateien oder der Lizenzen und Inhalte sämtlicher Abhängigkeiten. |
| K5: APK | Mit `aapt2` aus den festgelegten Build-Tools werden Paket und Version, Mindest- und Ziel-API, Sprachressourcen, Berechtigungen, Sicherungsregeln, WebView-Metadaten, Komponenten und Debug-Kennung geprüft. Außerdem: keine nativen Bibliotheken, keine der beiden gesuchten Google-Dienst-Bytefolgen in `classes*.dex`, korrekte Web-Assets und leere Plugin-Liste. | Ausführung der App, Vollständigkeit aller denkbaren Dienstmerkmale, Lizenzprüfung, kryptografische Signaturprüfung oder Reproduzierbarkeit des Builds. |

K4 unterscheidet Kommentare und Zeichenketten: Ein auskommentiertes Verbot ist kein Fund; dieselbe Zeichenfolge in einer Zeichenkette bleibt ein Fund, auch hinter einem darin enthaltenen Kommentarzeichen. GString-Ausdrücke mit `${...}` in interpolierenden Zeichenketten werden nicht unterstützt und führen ausdrücklich zu einem Fehler.

K5 erlaubt genau `de.baremos.fristenrechner.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Exportiert sind nur `de.baremos.fristenrechner.MainActivity` und `androidx.profileinstaller.ProfileInstallReceiver`; der Receiver muss `android.permission.DUMP` verlangen. `allowBackup` ist `false`, Klartextverkehr darf nicht freigegeben sein. Beide WebView-Metadaten müssen ihre festgelegten Werte haben; `EmojiCompatInitializer` darf nicht enthalten sein. `debuggable` muss zum geprüften Debug- oder Release-Build passen. Die Bytesuche betrifft `Lcom/google/android/gms/` und `Lcom/google/firebase/`; `Lcom/google/` allein wäre wegen der enthaltenen Guava-Schnittstelle kein geeigneter Nachweis für Google-Dienste.

Ohne Git scheitern K3 und K4 mit einem ausdrücklichen Fehler. K4 prüft den Modus im Index, weil er das Ausführungsrecht in einem frischen Linux-Klon bestimmt; der lokale Dateimodus allein belegt das nicht. Für ein Quellarchiv wäre ein vom Herausgeber bereitgestelltes, vertrauenswürdig abgesichertes Dateimanifest mit relativen Pfaden, Dateimodi und Inhaltsprüfsummen als Referenz erforderlich; ein erst nach dem Sync aus demselben Archiv erzeugtes Manifest würde dessen Unverändertheit nicht belegen. Dieser alternative Prüfweg ist nicht eingerichtet. Bis dahin setzt der vollständige Android-Build eine Git-Arbeitskopie voraus.

## Build vom 2026-09-30

Der Android-Quellstand `b8b01c6`, Version 0.1.0, wurde am 2026-09-30 unter Windows gebaut: Node 24.21.0, npm 11.19.0, JDK 21.0.8, Capacitor 8.5.2, Android-Gradle-Plugin 8.13.0, Gradle 8.14.5 als `bin`-Verteilung und Build-Tools 35.0.0.

| Schritt | Beobachtetes Ergebnis |
|---|---|
| Web-Build | Rückgabewert 0, 53 Sekunden; K1 und K2 bestanden. |
| `cap sync android` | Rückgabewert 0; Git-Arbeitskopie danach unverändert. |
| Werkzeugprüfung | Rückgabewert 0; Gradle 8.14.5 (`bin`) erkannt, Hinweis zum JDK-Patchstand 21.0.8 statt 21.0.12. |
| `assembleDebug` über den Wrapper | Rückgabewert 0, 64 Sekunden einschließlich Laden der Gradle-Verteilung; 93 Aufgaben, `BUILD SUCCESSFUL`. |
| `assembleRelease` über den Wrapper | Rückgabewert 0, 50 Sekunden, `BUILD SUCCESSFUL`. |
| Git-Arbeitskopie nach beiden Builds | Unverändert; Ausgaben und erzeugte Dateien sind ausgeschlossen. |

| Datei | Bytes | SHA-256 |
|---|---|---|
| `app-debug.apk` | 9.448.566 | `5b305d7dac933c1fad83f03b298edfaff1a0d54126cdd548df25e8985506cfea` |
| `app-release-unsigned.apk` | 7.713.336 | `824259abbf10c58eddaf13f897ae897a11c2ad541f5af789ffffc3c4455da892` |

Die statische Untersuchung beider APKs mit `aapt2` ergab: Paket `de.baremos.fristenrechner`, `versionCode` 100, `versionName` 0.1.0, Mindest-API 30, Ziel-API 36, Sprachvarianten nur `de`, genau die interne Berechtigung, `allowBackup=false`, vorhandene `dataExtractionRules`, kein Attribut `usesCleartextTraffic`, beide WebView-Metadaten und kein `EmojiCompatInitializer`. Nur MainActivity und der mit `DUMP` geschützte ProfileInstallReceiver sind exportiert; `debuggable` ist nur im Debug-Build gesetzt. Es gibt keine `lib/`-Einträge oder `.so`-Dateien und keine Treffer für die beiden geprüften Dienst-Bytefolgen.

Beide APKs enthalten dieselben 15 Dateien unter `assets/public`: die 13 Dateien aus `dist` und die zwei leeren Cordova-Dateien. Nichts fehlt und kein Inhalt weicht ab. Die Plugin-Liste ist leer. Die damalige Vorprüfung meldete die zwei Cordova-Dateien noch als Abweichung; K3 und K5 berücksichtigen sie ausdrücklich als erwartete Ausgabe von Capacitor 8.5.2.

Beide Builds meldeten eine Warnung zu `flatDir` im erzeugten `capacitor-cordova-android-plugins/build.gradle` sowie eine Warnung zum SDK-XML-Format. Beide endeten erfolgreich. Das `flatDir` liegt außerhalb der zwei in K4 geprüften eigenen Gradle-Dateien.

Die ersten Builds liefen ohne vorausgehendes `clean`. Am selben Tag wurden die Builds wiederholt:

| Vergleich | Beobachtetes Ergebnis |
|---|---|
| Neubau nach `clean` | Debug- und Release-Build jeweils mit Rückgabewert 0; beide APKs bytegleich zum ersten Build, mit den oben genannten Prüfsummen. |
| Zweite Arbeitskopie in einem anderen Ordner, mit eigenem `node_modules` | Gesamte Kette über `app-bauen.mjs --android`: Debug in 73 Sekunden, Release in 45 Sekunden, jeweils Rückgabewert 0 und K1 bis K5 bestanden. Beide APKs bytegleich zu denen der ersten Arbeitskopie; `git status --porcelain -- app/android` danach leer. |

Diese Vergleiche belegen bytegleiche Builds auf einem Windows-Rechner, am selben Tag und mit denselben Werkzeugen. Der gesonderte Linux-Nachweis folgt unten; ein zweiter Rechner ist nicht geprüft.

### Rauchtest im Emulator

Am 2026-09-30 lief die oben genannte Debug-APK im Emulator aus dem Projekt-SDK, ohne Fenster:

| Punkt | API 36: Android 16, WebView 133.0.6943.137 | API 30: Android 11, WebView 83.0.4103.120 |
|---|---|---|
| Installation und Start | Installation erfolgreich; `am start -W` meldet `Status: ok`, Kaltstart 1,5 bis 1,7 Sekunden. | Installation erfolgreich; `Status: ok`, Kaltstart 1,4 Sekunden. |
| Anzeige nach 12 Sekunden | Seite des Rechners mit Überschrift und Eingabefeldern. | Ebenso. |
| Protokoll (`logcat`) | Keine Zeile der WebView-Konsole und keine Fehlerzeile; Registrierung des Plugins `Navigationssperre` gemeldet. | Ebenso. |
| Symbol und Name | Infoseite der App zeigt das eigene Symbol, „Fristenrechner Vergabe“ und „No permissions requested“. | Liste der Apps zeigt das eigene Symbol; der Launcher kürzt die Beschriftung im Raster mit fünf Spalten auf „Fristenr…“. |

Beim ersten Lauf auf API 36 erschien ein Systemdialog, dass die Systemoberfläche nicht antwortet. Beim zweiten Lauf mit 45 Sekunden Wartezeit nach dem Systemstart trat er nicht auf. Nach den Proben wurden die App deinstalliert und die Emulatoren beendet.

Der Rauchtest belegt Start und Anzeige dieses älteren Builds. Es gab keinen Netzmelder, keine Navigationsversuche, keine Sicherungsprüfung und keine Berechnung in der Oberfläche. Den späteren Stand dieser Prüfungen beschreibt der Emulatorabschnitt unten; die Lizenzprüfung der Gradle-Abhängigkeiten gehört zum gesonderten Lizenznachweis.

## Linux-Nachweis vom 2026-09-30

Der Quellstand `c7a0cd8` wurde unter Debian 13.5 in WSL 2 aus einem Git-Bundle in zwei getrennte Ordner geklont. Jeder Klon hatte sein eigenes `node_modules`. Verwendet wurden Node.js 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Gradle 8.14.5 als `bin`-Verteilung und Build-Tools 35.0.0. Das Projekt-SDK enthielt nur die Gruppe „Build“. Die bereits vorhandene und geprüfte Gradle-Verteilung wurde in den Cache des Wrappers kopiert; der Wrapper prüfte ihre Prüfsumme erneut. Bei diesem Lauf wurde die Verteilung nicht neu geladen.

| Schritt | Klon 1 | Klon 2 |
|---|---|---|
| `npm ci` | Rückgabewert 0, 16 Sekunden | Rückgabewert 0, 21 Sekunden |
| `node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe` | Rückgabewert 0, 59 Sekunden; K1 bis K5 bestanden | Rückgabewert 0, 47 Sekunden; K1 bis K5 bestanden |
| `git status --porcelain` nach dem Build | Leer | Leer |
| Unsignierte Release-APK | 7.713.336 Bytes | 7.713.336 Bytes |

Die beiden unsignierten APKs waren mit `cmp` bytegleich. Ihre SHA-256 lautet `824259abbf10c58eddaf13f897ae897a11c2ad541f5af789ffffc3c4455da892`. Sie entspricht auch der Windows-APK vom selben Tag. Dort lief der Build mit JDK 21.0.8 ohne `--streng`, unter Debian mit JDK 21.0.12.1 und `--streng`.

Die APK enthält `META-INF/version-control-info.textproto` mit 46 Bytes und dem Inhalt `generate_error_reason: NO_SUPPORTED_VCS_FOUND`. Außerdem enthält sie `assets/dexopt/baseline.prof` mit 2.496 Bytes und `baseline.profm` mit 232 Bytes. Die Bytegleichheit gilt einschließlich dieser Dateien.

Im ersten Klon bestanden unter `unshare -r -n` sowohl `node scripts/app-bauen.mjs --web` als auch `capacitor sync android`, jeweils mit Rückgabewert 0. Als Gegenprobe scheiterte `fetch('https://registry.npmjs.org/')` im selben Netzwerk-Namensraum mit `EAI_AGAIN`. Damit sind Web-Build und Sync in der vorbereiteten Umgebung ohne Netzwerkzugriff belegt. Der Gradle-Build lief mit Netzwerkzugriff; ein Gradle-Build ohne Netz aus den vorhandenen Zwischenspeichern wurde nicht geprüft.

Im zweiten Klon wurde das Ausführungsrecht des Wrappers zur Gegenprobe entfernt. `android-build.mjs` meldete daraufhin, dass `gradlew` mit `EACCES` nicht gestartet werden konnte, und endete mit Rückgabewert 1.

`npm test` bestand im ersten Klon mit 1.093 Skripttests, davon 1.090 bestanden und drei übersprungen, sowie 134 Tests des Rechenkerns, 86 der Oberfläche und neun der App. `npm run lizenzen` bestand ebenfalls. Diese Angaben beschreiben den genannten Quellstand und ersetzen keine Prüfung späterer Änderungen.

Ergänzend bestand am selben Tag eine saubere Windows-Kopie desselben Stands mit Node.js 22.23.2, npm 10.9.8 und `core.autocrlf=true`: `npm ci`, `npm test`, `npm run check`, `npm run build` und `npm run lizenzen`, jeweils mit Rückgabewert 0. Die Skripttests meldeten 1.089 bestanden und vier übersprungen; Rechenkern, Oberfläche und App bestanden mit 134, 86 und neun Tests. Die Arbeitskopie blieb unverändert.

Am selben Tag wurde der Nachweis am Quellstand `a1e7821` wiederholt, mit der Oberfläche über die Plattformschnittstelle: wieder zwei Klone, derselbe Befehl mit `--streng --ohne-testgruppe`, K1 bis K5 bestanden, Arbeitskopie danach unverändert. Die beiden unsignierten Release-APKs waren bytegleich, 7.715.483 Bytes, SHA-256 `776bba301220d1d9b3f5e4f5d4841f37449609e72d6622b8ebdab065fcab93b3`, und entsprechen der Windows-APK dieses Stands. Web-Build und Sync bestanden erneut ohne Netzwerk, die Gegenprobe zum Ausführungsrecht meldete `EACCES`. `npm test` meldete 1.445 Skripttests, davon 1.433 bestanden und zwölf übersprungen (die Prüfungen mit dem Emulator laufen nur unter Windows), `npm run lizenzen` bestand.

Der Vergleich gilt für zwei Klone auf demselben Rechner und für den genannten Tag. Nicht geprüft sind ein Debug-Build unter Linux, die Gegenprobe mit geändertem `versionName`, ein zweiter Rechner und ein Build dieser App mit dem Scanner oder dem Buildserver von F-Droid.

## Prüfung im Emulator

### Stand vom 30.09.2026

Geprüft ist die App am Quellstand `a1e7821` mit der Oberfläche über die Plattformschnittstelle und der Korrektur für große Schrift, auf den Abbildern `fr-api30`, `fr-api36` und `fr-api24`.

| APK | SHA-256 |
|---|---|
| Debug | `181bf245e67de628347067e7b8974b5babe0462a98c3ab6a85c97cc3d0185bbe` |
| Release, unsigniert | `776bba301220d1d9b3f5e4f5d4841f37449609e72d6622b8ebdab065fcab93b3` |

| Abbild, Auswahl | WebView | bestanden | nicht bestanden | ungültig | dokumentierte Grenze | Rückgabewert |
|---|---|---|---|---|---|---|
| `fr-api30`, alle | 83.0.4103.120 | 52 | 0 | 0 | 6 | 3 |
| `fr-api36`, alle | 133.0.6943.137 | 52 | 0 | 0 | 6 | 3 |
| `fr-api24`, installation | nicht erhoben | 1 | 0 | 0 | 0 | 0 |

Die Zahlen sind Einzelbefunde ohne die zwölf Aufräumschritte je Lauf, nach der Neuauswertung der Rohbelege und mit festgehaltener Sichtprüfung. Rückgabewert 3 heißt: Alles Geprüfte ist bestanden, es bleiben nur dokumentierte Grenzen. Das ist kein vollständiges Bestehen.

**Belegt auf beiden Abbildern:** Start ohne Fehlerfalle, Ausfüllen und Berechnen mit Anzeige von Regelversion und Rechtsstand, Aufruf über die Brücke, gespeicherte Eingaben nach erzwungenem Beenden und deren Löschung mit den App-Daten, Hinweis zum Rechtsstand erst am Tag nach der Grenze, keine Verbindung über zehn Zugriffswege bei wirksamer Gegenprobe, gesperrte Navigation nach außen in den vier Fällen mit wirksamer Gegenprobe, Darstellung ohne waagerechten Überlauf bei Schrift 1,3 und 2,0, im Nachtmodus, gedreht und mit Tastatur, Zurück-Taste, Barrierebaum mit benannten Bedienelementen, Release-Build ohne `DEBUGGABLE` und `ALLOW_BACKUP` mit Ruhephase ohne Verbindung, Sicherung ohne Daten der App. **Nur auf `fr-api36`:** Gerätewechsel ohne Daten der App. **Nur auf `fr-api30`:** Fehlerseite bei zu alter WebView, mit der Gegenprobe ohne diese Datei. **Auf `fr-api24`:** Android lehnt die Installation wegen der Mindest-API ab.

Auf `fr-api36` erschien nach dem Systemstart der Dialog „System UI isn't responding“ des Abbilds. Die Prüfung hat ihn einmal mit „Wait“ geschlossen und das im Ergebnis ausgewiesen. In einem früheren Lauf desselben Tages blieb der Dialog stehen und machte den Lauf ungültig; er gehört zum Abbild, nicht zur App.

**Darstellung bei 412 und 320 CSS-Pixeln:** Eine gesonderte Messung durch Claude am 30.09.2026 bestätigt auf beiden Abbildern bei den Schriftfaktoren 1,0, 1,3 und 2,0 jeweils `scrollWidth = clientWidth = 412`, ohne überragendes Element außerhalb des Rollbereichs der Tabelle. Dieselbe Messung bei 320 CSS-Pixeln Breite (Anzeigedichte des Testgeräts für den Lauf auf 540 gesetzt und danach zurückgestellt) ergab auf beiden Abbildern bei allen drei Schriftfaktoren `scrollWidth = clientWidth = 320`, ebenfalls ohne überragendes Element. Vor der Korrektur waren es bei Faktor 2,0 548 Pixel auf `fr-api36` und 549 Pixel auf `fr-api30`. Ein Bildvergleich in Edge ohne Fenster war bei 1.280 und 768 Pixeln bytegleich zur Fassung vor der Korrektur. Bei den Aufnahmen mit 412 und 320 Pixeln Fensterbreite weicht jeweils ein Bereich ab: die Karten mit den Ankreuzfeldern. In der Aufnahme mit 412 Pixeln ist ihr rechter Rand nach der Korrektur sichtbar, vorher war er abgeschnitten. Die Aufnahme mit 320 Pixeln zeigt auch nach der Korrektur rechts abgeschnittene Inhalte; die Messung im Emulator bei 320 CSS-Pixeln zeigt keinen Überlauf, die Aufnahme ist deshalb für diese Breite nicht verwertbar (das Fenster unterschreitet sie vermutlich nicht).

**Sichtprüfung durch Claude am 30.09.2026:** Auf beiden Abbildern sind die sechs Bilder je Lauf gesichtet und mit Prüfsumme im Laufordner festgehalten: Schrift 1,3 und 2,0 (die Überschrift bricht um, bei 2,0 mit Trennstrich, nichts ist abgeschnitten), Nachtmodus (die App bleibt wie festgelegt hell, die Systemleisten sind sichtbar), Querformat, Tastatur (das fokussierte Feld liegt über der Tastatur) und der Start des Release-Builds (Rechner ohne Fehlerfalle, Hinweistext der App sichtbar).

**Dokumentierte Grenzen, je Abbild sechs:** Fünf Navigationsfälle (`mailto:`, `intent:`, `file:`, `content:`, `data:`) haben auf den AOSP-Abbildern keine wirksame Gegenprobe für das Plugin. Die Prüfung auf einen offenen Devtools-Socket erlaubt auf Abbildern vom Build-Typ `userdebug` keine Aussage über einen Release-Build. Einzelheiten stehen unter „Grenzen und Bewertung“.

**Ausstehend:** Auf einem echten Gerät mit Build-Typ `user`: Nachweis, dass das Debugging der WebView im Release-Build aus ist (vorbereitet, siehe „Prüfung auf einem Gerät“), sowie Ansage der Namen und Bedienung mit TalkBack. Dateiimport, Exporte, Teilen und Bestätigungsdialog gehören zur gesonderten Geräteprüfung.

### Ablauf und Nachweise

`scripts/emulator-lauf.mjs` führt die gewählten Prüfungen unter Windows aus. Die Auswertung in `scripts/emulator-auswertung.mjs` arbeitet getrennt davon auf aufgezeichneten Texten und JSON. Die folgenden Aufrufe setzen das eingerichtete Projekt-SDK, die Testgeräte aus [toolchain.md](toolchain.md), installierte npm-Abhängigkeiten und die gebauten Debug- und Release-APKs voraus. Node.js 24.21.0 und 22.23.2 stellen den benötigten eingebauten `WebSocket` ohne zusätzlichen Schalter bereit; fehlt er, bricht das Skript ab.

Aus der Repositorywurzel, beispielsweise für die Fehlerseite und danach für alle vorgesehenen Prüfungen eines Abbilds:

```sh
node scripts/emulator-lauf.mjs --api 30 --ablauf fehlerseite --ausgabe scratchpad/emulator/api30-fehlerseite
node scripts/emulator-lauf.mjs --api 36 --ablauf alle --ausgabe scratchpad/emulator/api36
node scripts/emulator-lauf.mjs --api 30 --ablauf alle --ausgabe scratchpad/emulator/api30
node scripts/emulator-lauf.mjs --api 24 --ablauf installation --ausgabe scratchpad/emulator/api24
```

`--api`, `--ablauf` und `--ausgabe` sind Pflicht. Der Ausgabeordner muss neu oder leer sein. Innerhalb des Repositorys sind Ausgaben nur unter `scratchpad/` zulässig; vorhandene Ergebnisse werden nicht überschrieben. `--apk-debug <Datei>` und `--apk-release <Datei>` ersetzen die Vorgaben `app/android/app/build/outputs/apk/debug/app-debug.apk` und `app/android/app/build/outputs/apk/release/app-release-unsigned.apk`. `--wipe-data` setzt das Testgerät nur bei ausdrücklicher Angabe zurück und löscht dessen bisherige Daten.

`a8` und `a10` führen Darstellung beziehungsweise Barrierebaum einzeln aus. `--varianten <Ordner>` verwendet APKs aus dem Unterordner `varianten` eines früheren Laufs. Dazu müssen `build-<Art>-apk.json`, die APK-Prüfsummen und der Fingerabdruck der aktuellen Bauquellen übereinstimmen. Der Fingerabdruck erfasst auch uncommittete Android-Änderungen, erzeugte Web-Assets, Capacitor, Lockfile, Toolchain, Baurezept und den Debugschlüssel. Alte Metadaten ohne Quellenfingerabdruck reichen nicht. Geprüfte APKs und Metadaten werden im neuen Lauf aufbewahrt; die Gradle-Cache-Kopie wird auch nach einem Baufehler entfernt. Fehlen die nötigen Varianten, ist zuerst ein Lauf ohne `--varianten` nötig.

| Abbild | WebView des vorgesehenen Abbilds | Auswahl mit `--ablauf` |
|---|---|---|
| `fr-api36` | 133.0.6943.137 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `sicherung`, `alle`; Sicherung einschließlich Gerätewechsel |
| `fr-api30` | 83.0.4103.120 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `sicherung`, `fehlerseite`, `alle`; Sicherung ohne Gerätewechsel |
| `fr-api24` | 52 | `installation`, `alle`; erwartete Ablehnung mit `INSTALL_FAILED_OLDER_SDK` |

Der Lauf verwendet jeweils nur einen Emulator auf Port 5554 mit `-no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -gpu swiftshader_indirect`. Nach dem Systemstart wartet er zunächst 45 Sekunden und prüft vor dem ersten Ablauf auf einen Dialog der Systemoberfläche. Dieselbe Prüfung gilt vor der Activity-Wertung und vor Fotos: Eine oben liegende App-Activity schließt einen verdeckenden Systemdialog nicht aus. Erkennt der Rahmen „System UI isn't responding“, liest er den Ansichtsbaum und tippt ausschließlich auf die Mitte des Knotens mit exakt „Wait“ oder „Warten“. Pro Dialogprüfung sind höchstens drei Versuche mit erneuter Prüfung zulässig; Baum, Koordinaten und Ergebnis werden aufgezeichnet. Fehlt der passende Knoten oder bleibt der Dialog sichtbar, ist der Ablauf ungültig. „Close app“ und andere Knoten werden nie betätigt. Ein vollständiger Ansichtsbaum (`<hierarchy … </hierarchy>`) ist auch dann lesbar, wenn `uiautomator dump` nach dem Schreiben mit Rückgabewert 137 endet. Ein erfolgreiches Betätigen erscheint eigens als „Systemdialog mit Wait geschlossen“ im Ergebnis. Navigationsfotos und die Gegenprobe ohne Fehlerseite benötigen keinen UI-Automator-Baum; sie sind ergänzende Rohbelege. Umgebungsvariablen für SDK und Testgeräte gelten nur für den gestarteten Prozess.

| Prüfung | Umfang |
|---|---|
| Ablauf A, Debug über CDP | Start und Fehlerfalle, Formular und Berechnung mit Regelversion und Rechtsstand, Brückenaufruf, gespeicherte Eingaben nach `force-stop` und deren Löschung nach `pm clear`, Rechtsstandhinweis an der Grenze und am Folgetag, Navigation, Netz, Darstellung, Zurück-Taste und Barrierebaum. |
| Darstellung innerhalb von A | Bildschirmfotos bei Schriftgröße 1,3 und 2,0, Nachtmodus, gedrehtem Bildschirm und eingeblendeter Tastatur. Vergleich von `scrollWidth` und `clientWidth`; bei Überlauf zusätzlich Elemente mit Text und Maßen, außer dem zulässigen Tabelleninnenraum. Rotation mit begrenzten Wiederholungen und tatsächlicher Ansichtsrichtung. Tastatur mit Eingabedienst, sichtbarer IME-Fläche und Fokus auf dem Eingabefeld; ergänzende Sichtprüfung der Bilder. |
| Ablauf B, Release | Signierte Kopie der Release-APK im Ausgabeordner, Startbild und Fehlerfalle, Paketkennzeichen ohne `DEBUGGABLE` und `ALLOW_BACKUP`. Devtools-Sockets sind nur beim Build-Typ `user` als Release-Eigenschaft bewertbar. Netzmelder nach 60 Sekunden Ruhe, Hintergrund und Rückkehr. |
| Netz | TCP-Netzmelder, Gegenprobe vor und nach der App sowie je nutzbarem Zugriffsweg: Fetch, XHR, Bild, Iframe, WebSocket, Beacon, EventSource, Prefetch und CapacitorHttp. Eine `.invalid`-Adresse ergänzt die Fehlerbeobachtung. Dazu `/proc/net`, auf API 36 die UID-Tabelle von `netstats` und eine nicht automatisch ausgewertete Paketaufzeichnung. |
| Navigation | `location.href`, `window.open`, Link mit `target=_blank`, `mailto:`, `tel:`, `intent:`, `file:`, `content:` und `data:`; Prüfung von oberster Activity, lokaler Herkunft, Netzmelder und Protokollmeldungen. |
| Sicherung | App vor `backupnow` starten und `stopped=false` prüfen. LocalTransport darf keine App-Daten ablegen; die Gegenprobe muss den gespeicherten Marker unter `app_webview/Default/Local Storage` sichern. Auf API 36 zusätzlich Gerätewechsel. |
| Fehlerseite | Temporärer Debug-Build mit `minWebViewVersion=84` auf API 30: `location.pathname` ist `/startfehler.html`, kein `SyntaxError`, Seitentext sichtbar. Die Fehlerseite enthält keine Capacitor-Brücke. Eine zweite Variante ohne diese Datei dient als Gegenprobe; zehn Sekunden lang wird beobachtet, ob wiederholte Navigationen zur fehlenden Fehlerseite auftreten. CDP und Protokollmeldungen belegen diese Schleife. Der fehlende Ruhezustand kann die Ausgabe eines UI-Automator-Baums verhindern; dieser Baum ist für die Gegenprobe keine Voraussetzung. |
| Installation | API 24 muss die APK wegen der Mindest-API ablehnen. |

Die Gegenprobe-App entsteht ausschließlich in einer temporären Kopie unter dem Ausgabeordner: andere App-ID, Berechtigung `INTERNET`, ohne Registrierung der Navigationssperre sowie `allowBackup=true` ohne Sicherungsregeln. Die Varianten für die Fehlerseite entstehen ebenfalls dort. Auch die Capacitor-Quellen werden kopiert; ein Gradle-Init-Skript lenkt die Build-Verzeichnisse aller Projekte in den Ausgabeordner um. Der Build verwendet `--offline` und ein eigenes `GRADLE_USER_HOME` mit einer Kopie der vorhandenen Zwischenspeicher. Er lädt keine fehlenden Abhängigkeiten nach.

Vor und nach den Varianten-Builds werden die Datei-Prüfsummen unter `app/android/app/build`, `app/android/build` und `node_modules/@capacitor/android/capacitor/build` verglichen. Eine Veränderung ist ein Fehler. Das Skript baut die ursprüngliche App nicht erneut. Der anschließende Neubau dieser App aus `clean` und sein Vergleich mit der Referenzprüfsumme bleiben gesondert auszuführen; inkrementelle Builds nach geänderten Assets können abweichen.

Die Release-Kopie wird ausschließlich mit dem Debug-Schlüssel der Android-Werkzeuge unter `%USERPROFILE%\.android\debug.keystore` und mit v2, v3 sowie `--alignment-preserved true` signiert. Die vorübergehende Kennwortdatei enthält je eine Zeile für Store und Schlüssel; apksigner liest sie nacheinander. Die Datei wird anschließend gelöscht. Die Signaturprüfung beginnt ausdrücklich bei API 24, damit v2 und v3 geprüft werden. Diese Signatur dient nur dem Prüflauf und keinem Vertrieb.

Der Ausgabeordner enthält `ergebnis.json`, `zusammenfassung.txt`, `logcat.txt`, Bildschirmfotos und weitere Rohbelege. Dazu gehören Gerätefingerabdruck, Build-Typ (`ro.build.type`), Pakete mit UID, WebView-Version und SHA-256 der installierten APKs. Diese Laufbelege können lokale Angaben enthalten und gehören nicht ungeprüft in das öffentliche Repository. Öffentliche Prüfdaten unter `scripts/emulator/fixtures` enthalten nur gekürzte und bereinigte Ausschnitte.

Auch nach einem Fehler räumt der Lauf auf: App und Gegenprobe deinstallieren, geänderte Uhr-, Schrift-, Nachtmodus- und Sicherungseinstellungen zurücksetzen, Emulator beenden, dessen `snapshots` löschen und eigene ADB-Weiterleitungen entfernen. Fehler beim Aufräumen gehören zum Ergebnis.

### Grenzen und Bewertung
Die [Chromium-Quellen zu SharedStatics, AwInit und BuildInfo](https://chromium.googlesource.com/chromium/src/+/3546854f59..2e285ebae2) erklären das erzwungene WebView-Debugging auf `eng` und `userdebug`. Die genaue Zuordnung dieser Quellen zu den verwendeten WebView-Binärdateien wurde nicht geprüft. Die Release-App hat kein `DEBUGGABLE`; Capacitor übergibt deshalb ohne eigene Überschreibung `false`. Auf einem Abbild mit Build-Typ ungleich `user` bleibt die Socketprüfung unabhängig vom Socketfund eine dokumentierte Grenze. Bei historischen Läufen wird der Typ ausdrücklich aus dem Gerätefingerabdruck abgeleitet; neue Läufe erfassen `ro.build.type` direkt. Der Emulatorrahmen verlangt `adb root` und ist nicht direkt für den fehlenden Nachweis auf einem Gerät mit Build-Typ `user` verwendbar.

- Die Netzaussage gilt für die UID der App und für die beobachteten Zeiträume und Zugriffswege. Verkehr des WebView-Pakets und des Systems wird benannt und nicht als App-Verkehr bewertet. Ein Netzmelder mit null Annahmen ersetzt keinen Nachweis für beliebige Ziele und Zeiträume.
- `sendBeacon` kann trotz Sperre `true` liefern; ein Iframe kann `load` für die Fehlerseite von Chromium melden. Maßgeblich sind Netzmelder und die aufgezeichneten CDP-Fehler, nicht diese Rückgabewerte.
- `dumpsys dnsresolver` lieferte auch für die Gegenprobe keine Anfragen und ist kein DNS-Nachweis. Auf API 30 enthält `dumpsys netstats detail` keine auswertbaren Zeilen je UID. Die Tabelle `mAppUidStatsMap` auf API 36 ist nur ein zusätzlicher Beleg; `/proc/net` erfasst Momentaufnahmen.
- Auf den vorgesehenen AOSP-Abbildern fehlen Empfänger für `mailto:` und `intent:`. Deren Gegenproben können die Sperre nicht belegen. `file:`, `content:` und `data:` werden bereits von Chromium gesperrt; erwartet werden dessen konkrete Fehlermeldungen statt einer Meldung des Plugins. Auch hier fehlt eine wirksame Gegenprobe für das Plugin. Diese fünf Fälle bleiben ausdrücklich als Grenzen sichtbar.
- A8 baut nach Darstellungswechseln die CDP-Verbindung neu auf: In den Läufen vom 30.09.2026 wurde die Activity bei geändertem `font_scale` neu erzeugt. A10 verwendet ebenfalls eine frische Verbindung und ruft vor `Accessibility.getFullAXTree` zuerst `Accessibility.enable` auf. Bleibt allein die AX-Abfrage trotz erreichbarem DOM unbeantwortet oder ist die Methode nicht vorhanden, lautet der Befund „dokumentierte Grenze: nicht verfügbar“. Namenquellen der Bedienelemente aus DOM und ARIA werden separat geprüft. Sie ersetzen weder einen berechneten Barrierebaum noch TalkBack. Die alten Zeitüberschreitungen auf der veralteten Verbindung belegen keine fehlende AX-Unterstützung.
- Die Bilder benötigen eine Sichtprüfung, insbesondere für Systemleisten, Startverhalten, Verdeckung und Lesbarkeit. Der automatische Überlauftest deckt diese Punkte nicht ab. Dateiimport, Exporte, Teilen und Bestätigungsdialog sowie TalkBack auf einem echten Gerät sind nicht Teil dieses Emulatornachweises.
- LocalTransport prüft nur das beschriebene Verhalten dieser Abbilder. Die Meldung „Transport rejected package“ beim Gerätewechsel belegt allein keine Ursache; entscheidend sind fehlende App-Daten und die wirksame Gegenprobe. Ein fehlender oder nicht auswertbarer Transport ergibt keinen dynamischen Nachweis. Die statische Prüfung der Sicherungsregeln bleibt davon getrennt.

Die Auswertung unterscheidet „bestanden“, „nicht bestanden“, „ungültig“, „dokumentierte Grenze“ und „Sichtprüfung ausstehend“. Rückgabewert `0` bedeutet, dass alle gewählten Prüfungen und ihre Gegenproben bestanden sind; `1` kennzeichnet einen Fehler, `2` eine ungültige oder unvollständige Messung und `3` ausschließlich dokumentierte Grenzen neben bestandenen Prüfungen. `4` bedeutet ausstehende Sichtprüfungen, gegebenenfalls neben dokumentierten Grenzen: Die Messung ist dadurch nicht ungültig, aber die Abnahme ist unvollständig. Fehler und ungültige Messungen haben Vorrang vor `4`, ausstehende Sichtprüfung hat Vorrang vor `3`. `64` bedeutet falsche oder fehlende Laufargumente. Unbekannte Formate, fehlende Abschnitte und unwirksame Gegenproben sind kein Bestehen. Die bekannten Navigationsgrenzen haben eine eigene Stufe mit Begründung; andere unwirksame Gegenproben bleiben ungültig. Für die Abnahme sind Grenzen einzeln ausdrücklich als Einschränkung zu akzeptieren oder durch zusätzliche Belege zu schließen; Codes `3` und `4` dürfen nicht als vollständiges Bestehen behandelt werden.

Die Offline-Neuauswertung verändert keinen ursprünglichen Laufordner:

```sh
node scripts/emulator-auswertung.mjs --lauf scratchpad/emulator/api30 --ausgabe scratchpad/emulator/auswertung-api30
```

Sie stellt ursprüngliche und neue Einzelbefunde gegenüber und nennt ihre Rohbelege. Unverändert übernommene Befunde und rekonstruierte Zusatzbefunde sind gekennzeichnet. Ein neuer Geräteversuch wird dadurch nicht ersetzt. LocalTransport-Dateien dürfen nur dann ohne TAR-Endblöcke ausgewertet werden, wenn alle Einträge vollständig sind, das Paket erfolgreich gesichert wurde und die Bytezahlen von `backupnow`, `adb pull` und Datei übereinstimmen. Normale TAR-Dateien werden weiterhin streng geprüft.

Eine erfolgte Sichtprüfung wird ohne erneuten Gerätelauf in `sichtpruefung.json` im ursprünglichen Laufordner festgehalten. Das Format lautet `{"schema":1,"pruefungen":[…]}`. Jeder Eintrag enthält `bild` (Dateiname), `ergebnis` (`bestanden` oder `nicht bestanden`), `wer`, `wann` (Datum `JJJJ-MM-TT` oder UTC-Zeitstempel), `bemerkung` und `sha256` (64 kleine Hexadezimalzeichen). Die Prüfsumme bindet das Urteil an genau die geprüften Bildbytes. Die Neuauswertung nennt diese Angaben und die noch offenen Bilder in der Zusammenfassung.

Zugelassen sind nur die erwarteten A8- und B-Bilder als reguläre PNG-Dateien unmittelbar im Laufordner. Unbekannte oder doppelte Bilder, Pfade in Unterordner oder außerhalb des Laufordners, symbolische Verknüpfungen, fehlende Bilder, abweichende Prüfsummen und ungültige Angaben erzeugen einen ungültigen Befund zum Sichtprüfprotokoll. Ein negatives Bildurteil führt zu „nicht bestanden“. Solange in einer Gruppe noch für ein Bild ein gültiges Urteil fehlt, bleibt sie „Sichtprüfung ausstehend“; erst vollständig positive Urteile ergeben „bestanden“. Eine Sichtprüfung ändert weder dokumentierte Grenzen noch technische Fehler anderer Prüfungen.

## Prüfung auf einem Gerät

Stand 30.09.2026: Das Skript ist vorbereitet. Ein Lauf auf einem Gerät hat noch nicht stattgefunden; dieser Abschnitt beschreibt den Ablauf, keine Ergebnisse.

`scripts/geraet-lauf.mjs` ergänzt den Emulatorlauf um die Frage, die die Testabbilder nicht beantworten: ob das Debugging der WebView im Release-Build auf einem Gerät mit Build-Typ `user` aus ist. Das Skript läuft unter Windows gegen ein über USB angeschlossenes Gerät mit eingeschaltetem USB-Debugging. Es braucht keine Root-Rechte und ändert keine Einstellung des Geräts.

```sh
node scripts/geraet-lauf.mjs --seriennummer <Seriennummer aus adb devices> --ausgabe scratchpad/geraet/lauf-1
```

`--seriennummer` und `--ausgabe` sind Pflicht. Für den Ausgabeordner gelten die Regeln des Emulatorlaufs. `--apk-debug <Datei>` und `--apk-release <Datei>` ersetzen die Vorgaben. Mit `--app-behalten` bleibt die Release-Kopie nach dem Lauf installiert, etwa für die Prüfung von Hand; ohne den Schalter deinstalliert der Lauf die App wieder.

Der Lauf bricht vor jeder Installation ab, wenn das Gerät diesen Rechner noch nicht zugelassen hat, wenn die ADB-Shell als root läuft, wenn es ein Emulator ist, wenn die API unter 30 liegt oder wenn die App schon installiert ist. Vorhandene Daten der App bleiben dann erhalten. Installiert werden nur Dateien, deren Paketname laut `aapt2` `de.baremos.fristenrechner` ist, und nie über ein vorhandenes Paket. Der Lauf deinstalliert nur, wenn belegt ist, dass er selbst installiert hat: Vor dem Versuch fehlte das Paket, danach ist es da.

| Befund | Inhalt |
|---|---|
| `G-Gerät` | Hersteller, Modell, Android-Version, API, Build-Typ und WebView-Version |
| `G-Devtools-Gegenprobe`, `G-Socket-Gegenprobe`, `G-Flags-Gegenprobe` | Am Debug-Build müssen die Devtools der WebView antworten, ihr Socket muss in `/proc/net/unix` stehen, und das Paket muss `DEBUGGABLE` tragen. Ohne wirksame Gegenprobe kann die entsprechende Prüfung am Release-Build nicht bestehen. |
| `G-Activity`, `G-Start` | Die Release-Kopie startet, das Formular steht in der nativen Ansicht, die Fehlerfalle ist nicht sichtbar. Beides ist Voraussetzung für `G-Socket` und `G-Devtools`. |
| `G-Flags` | Paketkennzeichen ohne `DEBUGGABLE` und `ALLOW_BACKUP` |
| `G-Socket` | Drei Proben im Abstand von fünf Sekunden: kein Devtools-Socket der WebView in `/proc/net/unix`. |
| `G-Devtools` | Zu denselben Zeitpunkten: Weiterleitung auf den Devtools-Socket des Prozesses und Abruf von `/json/version`. Der Abruf muss genauso scheitern wie der Abruf an einem Kontrollsocket, den es nicht gibt, gemessen in derselben Probe. |

Eine Probe zählt nur, wenn vor und nach ihr derselbe Prozess der App läuft und die App im Vordergrund liegt. Ein gefundener Socket oder eine Antwort der Devtools ist immer „nicht bestanden“, auch wenn eine andere Probe unbrauchbar ist. Antwortet beim Abruf etwas anderes als die Devtools, läuft die Zeit ab oder scheitert der Abruf anders als am Kontrollsocket, ist `G-Devtools` ungültig.

Die Rückgabewerte entsprechen dem Emulatorlauf. Auf einem Gerät mit anderem Build-Typ als `user` bleiben `G-Socket` und `G-Devtools` dokumentierte Grenzen. Die Release-Datei wird wie im Emulatorlauf nur für die Prüfung mit dem Debug-Schlüssel der Android-Werkzeuge signiert. Nach dem Lauf entfernt das Aufräumen die App (ohne `--app-behalten`), die Hilfsdatei des Ansichtsbaums auf dem Gerät und die eigenen ADB-Weiterleitungen, auch nach einer Unterbrechung.

Erprobt sind die Annahmen des Laufs am 30.09.2026 auf dem Abbild `fr-api36` ohne Root: Die ADB-Shell liest `/proc/net/unix`, `adb pull` liest die installierte APK, die Devtools des Debug-Builds antworten über die Weiterleitung, und eine Weiterleitung auf einen Socket, den es nicht gibt, bleibt ohne Antwort. Am selben Tag lief das Skript auf diesem Abbild einmal vollständig durch, mit einer Hülle außerhalb des Repositorys, die nur die Erkennung des Emulators ausblendet: Die drei Gegenproben bestanden, der Abruf am Kontrollsocket scheiterte in allen Proben gleich (`UND_ERR_SOCKET`), `G-Socket` und `G-Devtools` blieben wegen des Build-Typs `userdebug` dokumentierte Grenzen, `G-Start` war ungültig, weil der Dialog „System UI isn't responding“ des Abbilds über der App lag, und das Aufräumen ließ weder Paket noch Hilfsdatei noch Weiterleitung zurück. Ob ein Gerät eines Herstellers dasselbe zulässt, zeigt erst der Lauf dort.

Grenzen:

- Die Socketliste erfasst alle Apps des Geräts. Ein Devtools-Socket der WebView einer anderen App führt ebenfalls zu „nicht bestanden“ und ist über die aufgezeichneten Prozessnummern zu klären.
- Ein Lauf belegt ein Gerät mit einer Android- und einer WebView-Version, nicht andere Geräte.
- Netz, Navigation, Sicherung und Darstellung wiederholt der Lauf nicht. Das Bild `g-start.png` ist ein ergänzender Rohbeleg und von Hand zu sichten.
- Die Bedienung mit TalkBack und die Dateiabläufe prüft der Lauf nicht; sie sind von Hand zu prüfen und mit Gerät, Version und Datum festzuhalten.
- Die Laufbelege enthalten Angaben des Geräts, darunter die Seriennummer und die Socketnamen anderer Apps. Sie gehören nicht in das öffentliche Repository.
