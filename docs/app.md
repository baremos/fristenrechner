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
| Fehlerseite bei zu alter WebView | `server.errorPath` verweist auf `startfehler.html`. Die Seite braucht kein Skript und kann deshalb den fehlenden technischen Stand erklären. Ihre Anzeige mit dieser App ist noch im Emulator zu prüfen. |
| Keine Berechtigung `INTERNET` | Die Oberfläche wird aus den mitgelieferten Dateien geladen. Eine Berechtigung für Netzwerkzugriffe ist dafür nicht vorgesehen. K5 prüft das zusammengeführte Manifest der APK. |
| Navigationssperre | Das eigene Plugin lässt nur Schema und Host der lokalen App ohne abweichenden Port zu. Andere Navigationen sollen weder laden noch an andere Apps weitergegeben werden. Die Laufzeitprüfung dieser App steht aus. |
| Sicherung und Gerätewechsel ausgeschlossen | `allowBackup=false` und `dataExtractionRules` schließen Cloud-Sicherung und Geräteübertragung aus. Die Regeln enthalten für beide Wege alle neun festgelegten Speicherbereiche mit `path="."`. Die statische Prüfung belegt die Regeln in der APK, nicht die Wirkung auf jedem Gerät. |
| Kein eigenes Startbild | Die App verwendet kein `Theme.SplashScreen` und keine Startbildgrafik. Das tatsächliche Startverhalten, einschließlich der Darstellung durch Android, ist noch im Emulator zu prüfen. |
| Eigenes Symbol | Ein weißer Kalender mit hervorgehobenem Tag auf rotem Hintergrund ersetzt die Symbole der Vorlage. Das adaptive Symbol enthält auch eine einfarbige Ebene. Die kurze Launcher-Beschriftung lautet „Fristenrechner“. |
| Nur deutsche Sprachressourcen | `localeFilters += ["de"]` beschränkt die Sprachvarianten der Android-Ressourcen. Sprachneutrale Ressourcen bleiben erhalten. Die App-Oberfläche ist deutsch. |
| Versionsschema | `versionName` entspricht `app/package.json`; `versionCode = Hauptversion × 10000 + Nebenversion × 100 + Patch`. Version 0.1.0 ergibt 100. |
| Kein Signierblock im Projekt | Release-Dateien werden außerhalb von Gradle signiert; das Projekt enthält keine Schlüssel oder Kennwörter. Siehe [signierung.md](signierung.md). |
| Debug-Schlüssel nur für Emulatorläufe | Die Android-Werkzeuge signieren den Debug-Build mit ihrem lokalen Debug-Schlüssel. Diese APK ist nicht zur Veröffentlichung bestimmt. |
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

Diese Vergleiche belegen bytegleiche Builds auf einem Windows-Rechner, am selben Tag und mit denselben Werkzeugen. Ein zweiter Rechner und Linux sind damit nicht geprüft.

### Rauchtest im Emulator

Am 2026-09-30 lief die oben genannte Debug-APK im Emulator aus dem Projekt-SDK, ohne Fenster:

| Punkt | API 36: Android 16, WebView 133.0.6943.137 | API 30: Android 11, WebView 83.0.4103.120 |
|---|---|---|
| Installation und Start | Installation erfolgreich; `am start -W` meldet `Status: ok`, Kaltstart 1,5 bis 1,7 Sekunden. | Installation erfolgreich; `Status: ok`, Kaltstart 1,4 Sekunden. |
| Anzeige nach 12 Sekunden | Seite des Rechners mit Überschrift und Eingabefeldern. | Ebenso. |
| Protokoll (`logcat`) | Keine Zeile der WebView-Konsole und keine Fehlerzeile; Registrierung des Plugins `Navigationssperre` gemeldet. | Ebenso. |
| Symbol und Name | Infoseite der App zeigt das eigene Symbol, „Fristenrechner Vergabe“ und „No permissions requested“. | Liste der Apps zeigt das eigene Symbol; der Launcher kürzt die Beschriftung im Raster mit fünf Spalten auf „Fristenr…“. |

Beim ersten Lauf auf API 36 erschien ein Systemdialog, dass die Systemoberfläche nicht antwortet. Beim zweiten Lauf mit 45 Sekunden Wartezeit nach dem Systemstart trat er nicht auf. Nach den Proben wurden die App deinstalliert und die Emulatoren beendet.

Der Rauchtest belegt Start und Anzeige. Er ersetzt die noch ausstehenden Emulatorprüfungen auf API 30 und 36 nicht: Es gab keinen Netzmelder, keine Navigationsversuche, keine Sicherungsprüfung und keine Berechnung in der Oberfläche. Auch die Wirkung beim Gerätewechsel, die Fehlerseite und das Startbildverhalten bleiben zu prüfen. Ausstehend sind außerdem die abgelehnte Installation auf API 24, die Lizenzprüfung der Gradle-Abhängigkeiten sowie Linux-Builds unter Debian. Dort sind zwei saubere, getrennte Arbeitskopien und ein Vergleich der unsignierten APKs untereinander und mit Windows vorgesehen. Ebenso ausstehend ist der Nachweis von Web-Build und Sync ohne Netzwerk in einer vorbereiteten Linux-Umgebung.
