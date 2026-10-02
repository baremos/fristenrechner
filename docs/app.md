# Android-App

Stand 2026-10-01, App-Version 0.1.0. Die App verbindet den Rechenkern und die Oberfläche des Repositorys mit einer Android-Hülle aus Capacitor 8.5.2. Sie ist eine unverbindliche Rechenhilfe für Vergabefristen. Die Vergabeordnung wird ausdrücklich gewählt. Konten, Erinnerungen, Tracking und Netzwerkzugriffe im Betrieb gehören nicht zum Zuschnitt.

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

## Dateiabläufe: Speichern unter, Teilen, Import und Dialog nativ

Der optionale Zurück-Baustein der App verwendet das eigene `MenueZurueckPlugin` ohne zusätzliche Abhängigkeit. Ein an die Activity gebundener, anfangs deaktivierter Callback prüft zuerst über AndroidX die Insets der Decor-View: Ist die Bildschirmtastatur sichtbar, blendet er nur diese aus, bleibt aktiv und sendet kein Ereignis. Andernfalls, auch bei fehlenden Insets, deaktiviert er sich und meldet einmal `zurueck`; `setzen` überträgt nur `aktiv` und eine aufsteigende `folge`. Dokumentwechsel und Activity-Abbau deaktivieren ihn. Der App-Adapter registriert den Listener vor der ersten Aktivierung, ignoriert späte Ereignisse und meldet ihn bei `dispose` ab. Brückenfehler erzeugen keine Projektfehlermeldung; Öffnen und Schließen bleiben unabhängig von der Bestätigung. Die Website stellt diese optionale Schnittstelle nicht bereit. Die Menübedienung nutzt sie noch nicht; es entsteht keine Web-Historie. Stand nach Ergänzung des Tastaturzweigs: **Probe am 2026-10-02 auf API 30 (WebView 83.0.4103.120) und API 36 (WebView 133.0.6943.137) bestanden**, Debug-Build `35fe571d…f9c1`, je sechs Fälle: Zurück ohne Aktivierung verlässt die App; aktiv genau ein Ereignis, App bleibt, zweites Zurück verlässt die App; nach Deaktivieren kein Ereignis; Tastaturfolge wie unten; abgeschlossene Randgeste im Gestenmodus mit einem Ereignis; ältere Folge ohne Wirkung; Projektdaten jeweils unverändert. Ohne Tastaturzweig hatte API 36 im Lauf davor bei sichtbarer Tastatur zuerst das Ereignis gemeldet und die Tastatur offen gelassen; API 30 schloss die Tastatur selbst. Die Tastaturprobe verlangt je Zurück-Schritt: zuerst Tastatur zu ohne neues Ereignis und App weiter resumed; dann genau ein neues Ereignis mit `folge: 1`, Tastatur weiter zu und App resumed; zuletzt kein neues Ereignis und App verlassen. `input swipe` belegt keine abgebrochene Predictive-Back-Geste. Sheet und Release-Lauf sind nicht Teil dieser Probe.

Die App bindet über [app-plattform.ts](../app/src/adapters/app-plattform.ts) die native Ausgabe, den Import und die Bestätigung beim Zurücksetzen ein. Die Website behält ihr Dateifeld und ihre Web-Adapter. Der automatische Projektspeicher der App bleibt `localStorage` unter `baremos-fristenrechner-projekt-v1`; die Uhr liefert Zeitpunkt und Kalenderfelder der Ortszeit. Beide Funktionen stammen unverändert aus dem gemeinsamen Web-Adapter.

| Weg | Verhalten und Grenze |
|---|---|
| Speichern unter | Projektdatei, Excel und PDF öffnen die Android-Auswahl. Erfolg erst nach Schreiben und Schließen, mit „Projektdatei gespeichert.“, „Excel-Datei gespeichert.“ oder „PDF gespeichert.“. Abbruch stellt die vorherige Meldung wieder her. Nicht entfernbarer Zielrest wird im Fehlertext benannt. |
| Teilen | Eigene Aktion je Format. Erfolg bedeutet nur „Projektdatei zum Teilen bereitgestellt.“, „Excel-Datei zum Teilen bereitgestellt.“ oder „PDF zum Teilen bereitgestellt.“. Die gestartete Auswahl bestätigt keinen Versand oder Empfang. |
| Import | „Projekt importieren“ öffnet `ACTION_OPEN_DOCUMENT` mit `CATEGORY_OPENABLE` und `application/json`. Nur eine ausgewählte `content`-URI, keine dauerhafte URI-Berechtigung. Kein Ausschluss fremder Cloud-Anbieter durch diesen Aufruf. |
| Zurücksetzen | Deutscher `AlertDialog`, initialer Fokus auf „Abbrechen“. Nur die positive Auswahl bestätigt das Zurücksetzen; Abbrechen, Zurück und Dialog- oder Activity-Abbau bestätigen es nicht. |

Der [Plugin-Vertrag](../app/src/adapters/dateiablauf-vertrag.ts) hat acht Methoden: `ausgabeBeginnen`, `ausgabeBlock`, `ausgabeAbschliessen`, `speichernUnter`, `teilen`, `ausgabeVerwerfen`, `projektWaehlen` und `zuruecksetzenBestaetigen`. Beginn erhält `name`, `mime`, `anzahlBytes` und liefert `auftragId`; Blöcke enthalten `auftragId`, `offset`, `base64`. Die vier übrigen Ausgabemethoden verwenden nur `auftragId`, Import und Bestätigung keine Felder. Speichern liefert `ok` oder `abgebrochen`, Teilen `bereitgestellt`, Import `abgebrochen` oder `{ status: 'ok', name, text }`, der Dialog `{ bestaetigt: boolean }`.

Der [Ausgabeadapter](../app/src/adapters/dateiausgabe.ts) prüft höchstens 2 MiB PDF oder 1 MiB Excel beziehungsweise Projektdatei vor Beginn. Er übergibt den vorgeschlagenen Namen unverändert; nativ wird der Basename auf ASCII-Zeichen bereinigt, auch Umlaute werden dabei ersetzt. Er kodiert höchstens 64 KiB je Base64-Block ohne Zeilenumbrüche und wartet jeden Brückenaufruf ab. Offsets, Längen, Zustände und Pfade werden nativ geprüft; erst nach vollständigem Schreiben und Schließen ist Speichern oder Teilen möglich. Ein serieller IO-Pfad verarbeitet Dateien, Auswahlfenster starten auf dem UI-Thread. Ausgabe, Import und Dialog teilen eine Sperre; auch nativ wird die Belegung geprüft. Bei Transportfehlern versucht der Adapter, den eigenen Auftrag zu verwerfen, ohne den ursprünglichen Fehler zu verdecken.

Der [Importadapter](../app/src/adapters/dateiimport.ts) lässt nativ höchstens 1 MiB plus ein Prüfbyte lesen, unabhängig von Größenmetadaten des Anbieters. Das zusätzliche Byte ergibt `zu-gross`; sichtbar ist „Die Projektdatei ist größer als 1 MiB.“. Strenges UTF-8 weist ungültige Bytefolgen mit `lesen` ab; eine führende BOM wird erst nach der Byteprüfung entfernt. Streams und Cursor werden auch bei Fehlern geschlossen. Der Anzeigename stammt aus `DISPLAY_NAME`, ersatzweise `Projekt.json`, ohne Pfadangaben. Adapter und Oberfläche prüfen Textgröße und Projektformat erneut; der Adapter berücksichtigt ein kleineres Limit des Aufrufers. Ein erfolgreicher Import übernimmt die Eingaben und versucht anschließend, sie automatisch zu speichern. Ein dabei auftretender Speicherfehler benennt den bereits geöffneten Stand.

Bekannte Ausgabefehler zeigen die eigenen deutschen Plugintexte einschließlich eines möglichen Zielresthinweises; unbekannte Fehler verwenden allgemeine Texte. Gastgebertexte haben Vorrang. Beim Import zeigt die Oberfläche außer dem Größenfehler ihren allgemeinen Importfehlertext. Betriebssystemmeldungen, URI, Pfad und Dateiinhalt werden nicht als Transportfehlertext ausgegeben. Die [Adaptertests](../app/test/dateiausgabe.test.ts) verwenden ein Plugin-Testdoppel; sie belegen keinen Android-Dateidialog.

Der Rücksetzdialog bindet die Ressourcen `projekt_zuruecksetzen_frage` („Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?“), `projekt_zuruecksetzen_abbrechen` („Abbrechen“) und `projekt_zuruecksetzen_bestaetigen` („Zurücksetzen“) über `R.string`. Jeder Aufruf endet höchstens einmal. Fehler oder unerwartete Ergebnisse des Dialogs wirken wie Abbrechen, ohne zusätzliche Meldung. Ein Activity-Neustart nimmt keinen alten Datei-Auftrag wieder auf; verspätete Ergebnisse werden nicht als neuer Auftrag übernommen. Zielreste werden nur für das Ergebnis der noch zugeordneten eigenen Speichern-Auswahl bestmöglich entfernt.

Laufende und zum Teilen bereitgestellte Ausgaben liegen unter `cacheDir/export/<zufällige Kennung>/<bereinigter Basename>`. Der Provider ist nicht exportiert; nur die konkrete geteilte URI erhält Leserecht. Die Präferenzdatei enthält Kennungen und Bereitstellungszeiten, keine Dateinamen oder Inhalte. Das Budget der eigenen Ausgabedateien beträgt 16 MiB; eine neue Ausgabe verdrängt keine frische geteilte Datei. Beim Start, vor einer neuen Ausgabe und vor weiterem Teilen werden nicht aktive Reste ohne Freigabemarkierung sowie mindestens 24 Stunden alte Bereitstellungen bereinigt. Maßgeblich ist die Gerätezeit; bei Fehlern kann die Bereinigung ausbleiben. Android kann Cachedateien früher entfernen. Der Widerruf löscht keine Empfängerkopien und schließt keine dort bereits offenen Deskriptoren.

Capacitor-Protokollierung ist mit `loggingBehavior: "none"` abgeschaltet. K1 verlangt diesen Wert und eine leere npm-Pluginliste. K2 prüft im Bündel jede der acht Brückenmethoden mit genau einer Aufrufstelle und den vereinbarten Feldern. K3/K4 prüfen Registrierungen, Provider, Pfadressource und Dialogressourcen. K5 prüft Komponentenverzeichnis, Provider-Authority und Ressourcen in der APK. Import und Dialog ergänzen keine Android-Komponente. Die Navigations-Gegenprobe behält das Datei-Plugin. `datei_teilen_titel` bleibt mit Quellkommentar erhalten; die unterstützten Android-Versionen zeigen diesen Titel nicht an.

[Datenschutz](datenschutz.md) beschreibt Verarbeitung, Speicherung und Grenzen; der Text ist am 2026-10-01 freigegeben, ebenso der Hinweistext im Kasten der App („Die App verarbeitet Ihre Eingaben auf diesem Gerät. Sie hat keinen Internetzugriff. Von Ihnen gewählte Dateianbieter und Ziel-Apps können Dateien übertragen.“). Die App bindet dieselbe Markdown-Datei beim Build im offline lesbaren Abschnitt „Datenschutz“ ein; es gibt keine zweite Textfassung und keinen Abruf zur Laufzeit.

### Frühere Builds und Handläufe

Debug- und Release-Build samt K1 bis K5 sind mit der angeschlossenen Ausgabe am 2026-09-30 unter Windows gelaufen (Debug `c4b3ccdd…731c`, 9 874 075 Bytes; Release unsigniert `092cf913…b355`, 7 741 661 Bytes). Mit Import und Dialog sind sie am 2026-10-01 erneut gelaufen (Debug `9dd552d0…690d`, 9 730 977 Bytes; Release unsigniert `06dadbca…b64e`, 7 749 401 Bytes); mit dem Datenschutzabschnitt am selben Tag noch einmal (Debug `a7eda425…a105`, 9 730 977 Bytes; Release unsigniert `4bd9eb9b…442b`, 7 752 293 Bytes) und nach der Textfreigabe mit dem enger gefassten Hinweistext (Debug `dd19e14f…1988`, 9 730 977 Bytes; Release unsigniert `5a8e751d…8699`, 7 752 245 Bytes).

Erster Handlauf am 2026-09-30 mit der Debug-APK auf den Abbildern fr-api30 (WebView 83) und fr-api36 ohne Root, gesteuert über die Devtools der WebView und `uiautomator`; die Bytes jedes Auftrags wurden an der Brücke mitgeschrieben und mit der gespeicherten Datei verglichen: Projektdatei, Excel und PDF über „Speichern unter“ in der Android-Auswahl gespeichert, die Datei in `Download` ist jeweils bytegleich zu den gesendeten Bytes (1 359, 6 437 bis 6 439 und 23 212 Bytes, je ein Block); Aufruffolge Beginn, Block, Abschluss, Speichern mit genau den vereinbarten Feldern; Erfolgsmeldung erst nach `ok`; Abbruch der Auswahl liefert `abgebrochen`, lässt alle Meldungen stehen und legt keine Datei an; Teilen aller drei Formate öffnet die Auswahl von Android und meldet „bereitgestellt“; nach dem Schließen der Auswahl ist ein weiteres Speichern möglich; der Cache enthält danach genau die drei bereitgestellten Dateien mit Freigabemarkierung, nach dem Speichern keine; logcat ohne Fehlerzeile und ohne Pfad oder Dateiname aus dem eigenen Prozess. Beobachtungen der Abbilder, keine Fehler der App: Android ab Version 10 zeigt den Titel der Teilen-Auswahl nicht an (die Ressource `datei_teilen_titel` bleibt ohne sichtbare Wirkung); bei genau einem Empfänger (Excel: Bluetooth) startet Android ihn direkt; ohne Empfänger (Projektdatei auf den Abbildern ohne weitere Apps) zeigt die Auswahl nur den Hinweis, dass keine App die Aktion ausführen kann, die Meldung der Oberfläche bleibt bei „bereitgestellt“. Auf fr-api36 steht nach dem Start gelegentlich der Dialog „System UI isn't responding“ des Abbilds, der mit „Wait“ geschlossen wird.

Handlauf zu Import und Dialog am 2026-10-01 mit der Debug-APK `9dd552d0…690d` auf fr-api30 (WebView 83) und fr-api36 ohne Root, gesteuert über die Devtools der WebView, `uiautomator` und Tasteneingaben; je Abbild 63 Befunde bestanden: Eine über „Speichern unter“ erzeugte Projektdatei wurde mit geändertem Projektnamen nach `Download` gelegt und über „Projekt importieren“ in der Android-Auswahl geöffnet; `projektWaehlen` wird genau einmal ohne Felder aufgerufen, die Antwort trägt Anzeigename und Text, die Meldung lautet „Projektdatei geöffnet (Rechenkern 1.9.0, Rechtsstand: Juli 2026).“, Formular und Speicher zeigen den importierten Stand. Abbruch der Auswahl mit Zurück liefert `abgebrochen` und lässt Meldung, Formular und Speicher unverändert. Eine Datei mit genau 1 048 576 Bytes wird gelesen und scheitert erst am Format; ein Byte mehr ergibt `zu-gross` mit „Die Projektdatei ist größer als 1 MiB.“; ungültiges UTF-8 ergibt `lesen`, die Oberfläche zeigt dazu wie auf der Website ihren allgemeinen Text; eine führende BOM wird entfernt und die Datei geöffnet. Nach jedem Fehler bleibt das Projekt unverändert, und die Schaltflächen sind wieder frei. Der Dialog zum Zurücksetzen zeigt die drei Ressourcen, „Abbrechen“ (`android:id/button2`) hat vor der ersten Eingabe `focused="true"`; Abbrechen und Zurück liefern `bestaetigt: false` ohne Änderung, nur „Zurücksetzen“ liefert `true` und legt ein neues Projekt an. Das Thema der App zeigt die Schaltflächen in Großbuchstaben. Eine echte Neuerstellung der Activity bei offenem Dialog, ausgelöst über eine geänderte Systemschrift (`fontScale` steht nicht in `android:configChanges`), schließt den Dialog, setzt nichts zurück, erhält das gespeicherte Projekt und baut die WebView neu auf (neue Seitenkennung in den Devtools, derselbe Prozess); Dialog und Import sind danach wieder bedienbar. logcat ohne Fehlerzeile und ohne Namen oder Inhalt der Projektdateien aus dem eigenen Prozess. Beobachtungen der Abbilder, keine Fehler der App: `input tap` auf eine Zeile der Dateiauswahl wirkt nicht, Chips und Schaltflächen daneben reagieren; die Zeile lässt sich mit den Pfeiltasten fokussieren und mit Enter öffnen. In der Kachelansicht hat der Dateiname im Abzug von `uiautomator` keine Fläche. Auf fr-api36 erschien der Dialog „System UI isn't responding“ einmal und wurde mit „Wait“ geschlossen. Dieser Handlauf belegte noch keine Neuerstellung bei offener Dateiauswahl, keinen Prozessverlust und keinen Hintergrundwechsel ohne Neuerstellung. Diese Fälle wurden anschließend in der Dateiphase geprüft; ein echtes Gerät bleibt offen.

Die Dateiphase vom 2026-10-01 ergänzt diese Handläufe, siehe [Ergebnisse und Rohbelege](#dateiphase-auf-api-30-und-36). Am 01.10.2026 sind Speichern, Teilen, Import und Dialog auf einem Gerät von Hand geprüft (siehe „Prüfung auf einem Gerät“). Weiter offen sind ein Wortlautprotokoll der Ansagen mit TalkBack, verzögertes Lesen durch echte Empfänger, fehlende Speicherziele, voller Speicher beziehungsweise Cache sowie Schreib- und Schließfehler mit und ohne Zielrest. Die Importgrößengrenzen, Cache-Bereinigung, Freigaben und die genannten Lebenszyklusfälle sind auf den beiden Abbildern belegt; daraus folgt kein Nachweis aller Fehlerfälle. Der Schließfehler blieb eine dokumentierte Grenze, ebenso die fehlenden UID-Zähler auf API 30.

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

Die Quellprüfung in K3/K4 liest XML über den Parser des JDK.

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

**Ausstehend:** Auf einem Gerät mit Build-Typ `user` ist am 01.10.2026 belegt, dass das Debugging der WebView im Release-Build aus ist; Dateiimport, Exporte, Teilen und Bestätigungsdialog sind dort von Hand geprüft (siehe „Prüfung auf einem Gerät“). Offen bleiben ein Wortlautprotokoll der Ansagen mit TalkBack sowie weitere Geräte und Hersteller.

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
| `fr-api36` | 133.0.6943.137 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `dateien`, `sicherung`, `alle`; Sicherung einschließlich Gerätewechsel |
| `fr-api30` | 83.0.4103.120 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `dateien`, `sicherung`, `fehlerseite`, `alle`; Sicherung ohne Gerätewechsel |
| `fr-api24` | 52 | `installation`, `alle`; erwartete Ablehnung mit `INSTALL_FAILED_OLDER_SDK` |

Der Lauf verwendet jeweils nur einen Emulator auf Port 5554 mit `-no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -gpu swiftshader_indirect`. Nach dem Systemstart wartet er zunächst 45 Sekunden und prüft vor dem ersten Ablauf auf einen Dialog der Systemoberfläche. Dieselbe Prüfung gilt vor der Activity-Wertung und vor Fotos: Eine oben liegende App-Activity schließt einen verdeckenden Systemdialog nicht aus. Erkennt der Rahmen „System UI isn't responding“, liest er den Ansichtsbaum und tippt ausschließlich auf die Mitte des Knotens mit exakt „Wait“ oder „Warten“. Pro Dialogprüfung sind höchstens drei Versuche mit erneuter Prüfung zulässig; Baum, Koordinaten und Ergebnis werden aufgezeichnet. Fehlt der passende Knoten oder bleibt der Dialog sichtbar, ist der Ablauf ungültig. „Close app“ und andere Knoten werden nie betätigt. Ein vollständiger Ansichtsbaum (`<hierarchy … </hierarchy>`) ist auch dann lesbar, wenn `uiautomator dump` nach dem Schreiben mit Rückgabewert 137 endet. Ein erfolgreiches Betätigen erscheint eigens als „Systemdialog mit Wait geschlossen“ im Ergebnis. Navigationsfotos und die Gegenprobe ohne Fehlerseite benötigen keinen UI-Automator-Baum; sie sind ergänzende Rohbelege. Umgebungsvariablen für SDK und Testgeräte gelten nur für den gestarteten Prozess.

| Prüfung | Umfang |
|---|---|
| Ablauf A, Debug über CDP | Start und Fehlerfalle, Formular und Berechnung mit Regelversion und Rechtsstand, Brückenaufruf, gespeicherte Eingaben nach `force-stop` und deren Löschung nach `pm clear`, Rechtsstandhinweis an der Grenze und am Folgetag, Navigation, Netz, Darstellung, Zurück-Taste und Barrierebaum. |
| Darstellung innerhalb von A | Bildschirmfotos bei Schriftgröße 1,3 und 2,0, Nachtmodus, gedrehtem Bildschirm und eingeblendeter Tastatur. Vergleich von `scrollWidth` und `clientWidth`; bei Überlauf zusätzlich Elemente mit Text und Maßen, außer dem zulässigen Tabelleninnenraum. Rotation mit begrenzten Wiederholungen und tatsächlicher Ansichtsrichtung. Tastatur mit Eingabedienst, sichtbarer IME-Fläche und Fokus auf dem Eingabefeld; ergänzende Sichtprüfung der Bilder. |
| Ablauf B, Release | Signierte Kopie der Release-APK im Ausgabeordner, Startbild und Fehlerfalle, Paketkennzeichen ohne `DEBUGGABLE` und `ALLOW_BACKUP`. Devtools-Sockets sind nur beim Build-Typ `user` als Release-Eigenschaft bewertbar. Netzmelder nach 60 Sekunden Ruhe, Hintergrund und Rückkehr. |
| Dateien, Debug und Release | Speichern und Teilen mit SHA-256 gegen die Bytes vor dem nativen Transport, Import über DocumentsUI, Fehlerfälle über den Testprovider, Fokus und Lebenszyklus, Freigaben und Cache-Bereinigung. UID-Netzbeobachtung während aller Dateiwege; anschließend bestehende Sicherungsprüfung. Lauf am 2026-10-01 auf fr-api30 (47 bestanden, 3 dokumentierte Grenzen) und fr-api36 (50 bestanden, 1 dokumentierte Grenze), siehe unten. |
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

### Dateiphase auf API 30 und 36

Die Phase `dateien` ist am 2026-10-01 auf beiden Abbildern gelaufen, mit der
Debug-APK `9dd552d0…690d` und der unveränderten Release-APK `06dadbca…b64e`:
fr-api30 (WebView 83) 47 bestanden, 0 nicht bestanden, 0 ungültig,
3 dokumentierte Grenzen, Rückgabewert 3, 45 Minuten; fr-api36 50 bestanden,
0 nicht bestanden, 0 ungültig, 1 dokumentierte Grenze, Rückgabewert 3,
45 Minuten. Die Neuauswertung aus den Rohbelegen ergibt dasselbe. Dokumentierte
Grenzen sind der nicht provozierbare Schließfehler (beide Abbilder) und auf
API 30 die fehlenden UID-Zähler von `netstats` im Datei-Netzfenster (Debug und
Release). Alle übrigen Teilfälle D1 bis D12 und die Release-Fälle sind
bestanden, darunter der Empfang im Testempfänger mit verweigertem Schreib-,
Nachbar- und Projektzugriff, die Größenprüfung unabhängig von den Metadaten des
Testproviders, der Streamfehler, die Cache-Bereinigung mit Widerruf und die
Lebenszyklusfälle einschließlich `force-stop`. Vier Läufe davor auf fr-api30
scheiterten an der Testumgebung, nicht an der App, und führten zu Korrekturen am
Rahmen: Ein vorübergehend fehlender Wurzelknoten von `uiautomator` wird mit
bis zu drei Versuchen behandelt; Werte mit doppelten Anführungszeichen schreibt
`uiautomator` in einfache; die Resumed-Zeile von `dumpsys` fehlt im
Activity-Wechsel kurz; eine Zeile am Ende einer langen Liste der
Android-Auswahl bleibt unter der Navigationsleiste und lässt sich per Tastatur
nicht zuverlässig fokussieren, deshalb verteilt der Testprovider seine
Dokumente auf zwei kurze Wurzeln und die Importdateien in `Download` stehen
mit dem Vorsatz `0-` bei alphabetischer Sortierung oben; der Streamfehler des Testproviders liegt bei
256 KiB, weil ein kurzes Lesen vor dem Fehler über FUSE als Dateiende ankommt.
Ein Lauf brach ab, weil der Testempfänger von einem Handversuch noch
installiert war; der Rahmen lehnt vorhandene Pakete ab.
Die zuvor beschriebenen Handläufe ersetzen ihre Abnahme nicht. `alle` führt nach A
und B die Dateiphase und anschließend die bisherige Sicherungsprüfung aus.
Auch `--ablauf dateien` enthält diese Sicherungsprüfung; auf API 36 kommt
der Gerätewechsel hinzu.

Zuerst die Argumente ohne Build, APK-Zugriff oder Emulatorstart prüfen, dann
die beiden Abbilder nacheinander ausführen. Die Ausgabeordner der echten
Läufe müssen neu oder leer sein:

```sh
node scripts/emulator-lauf.mjs --api 30 --ablauf dateien --ausgabe scratchpad/paket-2.6/api30-dateien --nur-argumente
node scripts/emulator-lauf.mjs --api 36 --ablauf dateien --ausgabe scratchpad/paket-2.6/api36-dateien --nur-argumente
node scripts/emulator-lauf.mjs --api 30 --ablauf dateien --ausgabe scratchpad/paket-2.6/api30-dateien
node scripts/emulator-lauf.mjs --api 36 --ablauf dateien --ausgabe scratchpad/paket-2.6/api36-dateien --varianten scratchpad/paket-2.6/api30-dateien/varianten
```

Die Wiederverwendung prüft auch den Quellstand der Test-App. Nach Änderungen
ist ein neuer Variantenbau ohne `--varianten` erforderlich. Für einen ersten
Durchlauf sind etwa 40 bis 75 Minuten je Abbild einzuplanen, zusätzlich der
isolierte Variantenbau und die Cache-Kopie beim ersten Lauf. Dies ist ein
Planwert, keine gemessene Laufzeit. Einzelne UI-Automator-Aufrufe oder eine
gestörte Systemoberfläche können den Lauf verlängern oder ungültig machen.

Der Rahmen installiert Debug-App, Gegenprobe und die separate Test-App
`org.example.dateiprobe`. Der Testempfänger und dessen DocumentsProvider
entstehen ausschließlich aus [Testquellen](../scripts/emulator/testempfaenger/README.md)
im Ausgabeordner: Java 17, Mindest-API 30, Android-Framework ohne zusätzliche
Bibliotheken oder angeforderte Berechtigungen. Gebaut wird offline aus dem
vorhandenen Gradle-Cache, signiert mit dem vorhandenen Emulator-Debugschlüssel.
Anschließend laufen Speichern, Teilen und Import auch gegen eine mit diesem
Schlüssel signierte Kopie der unveränderten Release-APK. Ihre Ergebnisse
werden getrennt von Debug ausgewiesen. Der Devtools-Zugang dieser
`userdebug`-Abbilder ist keine zugesagte Eigenschaft eines Release-Geräts.

`dateien-roh.json` enthält die Fälle D1 bis D11 und die Release-Fälle mit
Schemafassung und Verweisen auf ihre Rohbelege. Dazu gehören Brückenaufträge
und Antworten, Referenzbytes je Auftrag, gezogene Zieldateien, Empfänger- und
Providerberichte, Formular- und Speicherzustände, Activity-/Seitenkennungen,
Ansichtsbäume und Bilder. D12 steht in `dateien-netz-debug.json` und
`dateien-netz-release.json`: Netzmelder vor/nach dem Fenster, UID-Socketproben
während aller Wege und UID-Zähler auf API 36. `netz.pcap` bleibt ein
ergänzender Rohbeleg. Die Sicherungsbelege, Installationsprüfsummen und
`dateien-aufraeumen.json` bleiben ebenfalls im Laufordner.

Speichern und Empfang können nur mit SHA-256-Gleichheit der gesammelten
Brückenbytes und der tatsächlichen Zieldatei bestehen, einschließlich Name,
MIME-Typ, Größe und JSON-/ZIP-/PDF-Struktur. Für zwei JSON- und XLSX-Exporte
wird die WebView-Uhr für den Vergleich festgehalten; XLSX enthält einen
Kalendertag. PDF wird gegen die Referenz genau seines Auftrags geprüft.
Eine Erfolgsmeldung oder eine Datei im App-Cache allein genügt nicht.

DocumentsUI wird in der Listenansicht bedient. Dateizeilen werden anhand
des fokussierten `item_root` und der Titelfläche mit den Richtungstasten
gewählt und mit Enter geöffnet. Neue Download-Dateien werden aus der
Verzeichnisdifferenz ermittelt; vorhandene Dateien anderer Läufe bleiben
erhalten. Bei Wiederholung kann Android den Namen um ` (1)` ergänzen.
Neuerstellung wird über `font_scale` und den Wechsel der Devtools-Seite bei
gleicher PID belegt; Rotation zählt dafür nicht. Einstellungen werden
gesichert und auch nach einem Abbruch wiederhergestellt. Nur im Lauf
registrierte Download-Dateien und Testinstallationen werden entfernt.

Für D11 wird die Gerätezeit vorübergehend vorgestellt. Eine alte Freigabe
wird zusätzlich über Präferenzdatei und Dateizeit gealtert; die frische
Freigabe entsteht mit zeitlichem Abstand. Der App-Prozess bleibt bestehen.
Vor dem nächsten Teilen muss die alte URI noch lesbar sein, danach muss ihr
Zugriff verweigert werden. Die ursprüngliche Zeitautomatik und Gerätezeit
werden anschließend wiederhergestellt, auch beim Aufräumen nach Abbruch.

Die Neuauswertung prüft die binären Dateien erneut:

```sh
node scripts/emulator-auswertung.mjs --lauf scratchpad/paket-2.6/api30-dateien --ausgabe scratchpad/paket-2.6/api30-auswertung
node scripts/emulator-auswertung.mjs --lauf scratchpad/paket-2.6/api36-dateien --ausgabe scratchpad/paket-2.6/api36-auswertung
```

Als dokumentierte Grenzen kommen ein nicht ohne Produktänderung auslösbarer
Schließfehler, eine Auswahl ohne externen Empfänger und die fehlenden
UID-Zähler von API 30 in Betracht. Damit ist der jeweilige Nachweis nicht
bestanden. Der eigene Testempfänger und Testprovider müssen dagegen vorhanden
und auswertbar sein; ihr Fehlen, ein fehlender Picker, fehlende Rohbytes oder
unvollständige Lebenszyklusdaten machen den betroffenen Fall ungültig.
Echte Empfängerprogramme, TalkBack, Herstelleranbieter und voller Speicher
bleiben zusätzlich auf einem Gerät zu prüfen.

### Grenzen und Bewertung
Die [Chromium-Quellen zu SharedStatics, AwInit und BuildInfo](https://chromium.googlesource.com/chromium/src/+/3546854f59..2e285ebae2) erklären das erzwungene WebView-Debugging auf `eng` und `userdebug`. Die genaue Zuordnung dieser Quellen zu den verwendeten WebView-Binärdateien wurde nicht geprüft. Die Release-App hat kein `DEBUGGABLE`; Capacitor übergibt deshalb ohne eigene Überschreibung `false`. Auf einem Abbild mit Build-Typ ungleich `user` bleibt die Socketprüfung unabhängig vom Socketfund eine dokumentierte Grenze. Bei historischen Läufen wird der Typ ausdrücklich aus dem Gerätefingerabdruck abgeleitet; neue Läufe erfassen `ro.build.type` direkt. Der Emulatorrahmen verlangt `adb root` und ist nicht direkt für den fehlenden Nachweis auf einem Gerät mit Build-Typ `user` verwendbar.

- Die Netzaussage gilt für die UID der App und für die beobachteten Zeiträume und Zugriffswege. Verkehr des WebView-Pakets und des Systems wird benannt und nicht als App-Verkehr bewertet. Ein Netzmelder mit null Annahmen ersetzt keinen Nachweis für beliebige Ziele und Zeiträume.
- `sendBeacon` kann trotz Sperre `true` liefern; ein Iframe kann `load` für die Fehlerseite von Chromium melden. Maßgeblich sind Netzmelder und die aufgezeichneten CDP-Fehler, nicht diese Rückgabewerte.
- `dumpsys dnsresolver` lieferte auch für die Gegenprobe keine Anfragen und ist kein DNS-Nachweis. Auf API 30 enthält `dumpsys netstats detail` keine auswertbaren Zeilen je UID. Die Tabelle `mAppUidStatsMap` auf API 36 ist nur ein zusätzlicher Beleg; `/proc/net` erfasst Momentaufnahmen.
- Auf den vorgesehenen AOSP-Abbildern fehlen Empfänger für `mailto:` und `intent:`. Deren Gegenproben können die Sperre nicht belegen. `file:`, `content:` und `data:` werden bereits von Chromium gesperrt; erwartet werden dessen konkrete Fehlermeldungen statt einer Meldung des Plugins. Auch hier fehlt eine wirksame Gegenprobe für das Plugin. Diese fünf Fälle bleiben ausdrücklich als Grenzen sichtbar.
- A8 baut nach Darstellungswechseln die CDP-Verbindung neu auf: In den Läufen vom 30.09.2026 wurde die Activity bei geändertem `font_scale` neu erzeugt. A10 verwendet ebenfalls eine frische Verbindung und ruft vor `Accessibility.getFullAXTree` zuerst `Accessibility.enable` auf. Bleibt allein die AX-Abfrage trotz erreichbarem DOM unbeantwortet oder ist die Methode nicht vorhanden, lautet der Befund „dokumentierte Grenze: nicht verfügbar“. Namenquellen der Bedienelemente aus DOM und ARIA werden separat geprüft. Sie ersetzen weder einen berechneten Barrierebaum noch TalkBack. Die alten Zeitüberschreitungen auf der veralteten Verbindung belegen keine fehlende AX-Unterstützung.
- Die Bilder benötigen eine Sichtprüfung, insbesondere für Systemleisten, Startverhalten, Verdeckung und Lesbarkeit. Der automatische Überlauftest deckt diese Punkte nicht ab. Die Dateiphase ergänzt Import, Exporte, Teilen und Bestätigung; sie ersetzt weder TalkBack noch die Prüfung echter Empfänger und Dokumentanbieter auf einem Gerät.
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

Stand 01.10.2026: Erster Lauf auf einem Gerät am 01.10.2026 am Stand `d5cc31a` (Debug `dd19e14f…1988`, Release `5a8e751d…8699`): Samsung Galaxy A17 (SM-A176B), Android 16 (API 36), Build-Typ `user`, One UI 8.5, System-WebView 143.0.7499.192. Alle neun Befunde bestanden, Rückgabewert 0, ohne Anpassung an die Ausgaben von One UI: Die drei Gegenproben am Debug-Build wirkten, die Release-Kopie startete mit dem Formular in der nativen Ansicht, das Paket trägt weder `DEBUGGABLE` noch `ALLOW_BACKUP`, in drei Proben stand kein Devtools-Socket der WebView in `/proc/net/unix`, und der Abruf von `/json/version` endete in jeder Probe wie am Kontrollsocket. Damit ist auf diesem Gerät belegt, dass das Debugging der WebView im Release-Build aus ist. Beobachtungen am Gerät: Mit eingeschaltetem Auto Blocker von Samsung bleibt USB-Debugging in den Entwickleroptionen ausgegraut; das Umschalten des Auto Blockers verwirft die ADB-Freigabe des Rechners, die danach am Gerät erneut zu bestätigen ist. Die Belege des Laufs liegen außerhalb des Repositorys.

Prüfung von Hand am selben Tag mit der installierten Release-Kopie durch den Maintainer: Projektdatei, Excel und PDF über „Speichern unter“ in der Dateiauswahl von One UI nach `Download` gespeichert, Abbruch der Auswahl ohne Änderung; die Dateien wurden mit `adb pull` geholt und sind vollständig (gültige Projektdateien, vollständiges XLSX-Archiv, PDF mit Kopf und `%%EOF`). PDF an Gmail geteilt und im Entwurf geöffnet, Teilen des Projekts abgebrochen; gültige Projektdatei importiert, ungültiges UTF-8 abgewiesen bei unverändertem Formular, Abbruch der Auswahl ohne Änderung; Dialog zum Zurücksetzen mit „Abbrechen“ vorgewählt, Abbrechen und Zurück-Geste ohne Änderung, Bestätigung legt ein neues Projekt an. Das Geräteprotokoll enthält keine Fehlerzeile des App-Prozesses. TalkBack (Samsung TalkBack mit Samsung TTS) war rund zweieinhalb Minuten eingeschaltet; der Maintainer meldet keine Abweichung bei der Ansage der Felder, bei Berechnung, Export und Fokus. Ein Protokoll der Ansagen im Wortlaut wurde nicht geführt; B2, B5 und B6 der Testmatrix gelten damit als auf einem Gerät gesichtet, nicht als vollständig protokolliert. Nach dieser Sichtung ist der Hinweiskasten einschließlich Speicherstatus in der App unter den rechtlichen Hinweis gewandert (Prop `hinweisPosition` der Komponente); Ansage und Auffindbarkeit des Speicherstatus an der neuen Position sind noch zu prüfen.

`scripts/geraet-lauf.mjs` ergänzt den Emulatorlauf um die Frage, die die Testabbilder nicht beantworten: ob das Debugging der WebView im Release-Build auf einem Gerät mit Build-Typ `user` aus ist. Das Skript läuft unter Windows gegen ein über USB angeschlossenes Gerät mit eingeschaltetem USB-Debugging. Es braucht keine Root-Rechte und ändert keine Einstellung des Geräts.

```sh
node scripts/geraet-lauf.mjs --seriennummer <Seriennummer aus adb devices> --ausgabe scratchpad/geraet/lauf-1
```

`--seriennummer` und `--ausgabe` sind Pflicht. Für den Ausgabeordner gelten die Regeln des Emulatorlaufs. `--apk-debug <Datei>` und `--apk-release <Datei>` ersetzen die Vorgaben. Mit `--app-behalten` bleibt die Release-Kopie nach dem Lauf installiert, etwa für die Prüfung von Hand; ohne den Schalter deinstalliert der Lauf die App wieder.

Der Lauf bricht vor jeder Installation ab, wenn das Gerät diesen Rechner noch nicht zugelassen hat, wenn die ADB-Shell als root läuft, wenn es ein Emulator ist, wenn die API unter 30 liegt oder wenn die App schon installiert ist. Vorhandene Daten der App bleiben dann erhalten. Installiert werden nur Dateien, deren Paketname laut `aapt2` `de.baremos.fristenrechner` ist, und nie über ein vorhandenes Paket. Der Lauf deinstalliert nur seine eigene Installation: Vor dem Versuch fehlte das Paket nachweislich, vor jeder Deinstallation liest er die installierte APK und vergleicht ihre Prüfsumme mit seiner Eingabedatei, und die Berechtigung erlischt mit der bestätigten Deinstallation. Ein Paket mit anderem Inhalt, auch eines, das zwischenzeitlich von außen kommt, bleibt unberührt; das Aufräumen meldet es als Fehler, statt es zu entfernen. Bleibt ein Installationsaufruf ohne Ergebnis (unterbrochen oder mit abgerissener Rückmeldung), fragt das Aufräumen das Gerät 60 Sekunden lang alle zwei Sekunden nach dem Paket (länger, wenn einzelne Befehle langsam antworten), prüft bei Erscheinen die Prüfsumme und entfernt es; erscheint es nicht, meldet es den ungeklärten Zustand. Voraussetzung für den Lauf ist, dass während Lauf und Aufräumen niemand dieselbe App auf dem Gerät installiert, aktualisiert oder entfernt; die Prüfsumme fängt Verwechslungen ab, nicht jedes Zeitfenster. Mit `--app-behalten` bleibt eine bereits installierte Release-Kopie auch nach einer Unterbrechung auf dem Gerät.

| Befund | Inhalt |
|---|---|
| `G-Gerät` | Hersteller, Modell, Android-Version, API, Build-Typ und WebView-Version |
| `G-Devtools-Gegenprobe`, `G-Socket-Gegenprobe`, `G-Flags-Gegenprobe` | Am Debug-Build müssen die Devtools der WebView antworten, ihr Socket muss in `/proc/net/unix` stehen, und das Paket muss `DEBUGGABLE` tragen. Ohne wirksame Gegenprobe kann die entsprechende Prüfung am Release-Build nicht bestehen. |
| `G-Activity`, `G-Start` | Die Release-Kopie startet, das Formular steht in der nativen Ansicht in Knoten des eigenen Pakets, die Fehlerfalle ist nicht sichtbar. Der Ansichtsbaum wird bis zu dreimal abgezogen, weil die WebView ihren Inhalt erst nach der ersten Anfrage liefert. Beides ist Voraussetzung für `G-Socket` und `G-Devtools`, belegt für denselben Prozess davor und danach. |
| `G-Flags` | Paketkennzeichen ohne `DEBUGGABLE` und `ALLOW_BACKUP` |
| `G-Socket` | Drei Proben im Abstand von fünf Sekunden: kein Devtools-Socket der WebView in `/proc/net/unix`. Der Socket des eigenen Prozesses zählt auch dann, wenn die Gegenprobe ohne Wirkung war. |
| `G-Devtools` | Zu denselben Zeitpunkten: Weiterleitung auf den Devtools-Socket des Prozesses (über `adb forward --list` belegt) und Abruf von `/json/version`. Der Abruf muss so enden wie der Abruf an einem Kontrollsocket, den es nicht gibt: Die Weiterleitung nimmt die Verbindung an, das Gerät schließt sie sofort. Das wird in derselben Probe und in der Debugphase gemessen, in der die Devtools über denselben Weg geantwortet haben. Der Befund belegt, wie der Verbindungsversuch endet; dass kein Socket vorhanden ist, belegt die Socketliste. |

Eine Probe zählt nur, wenn vor und nach ihr derselbe Prozess der App läuft wie beim Beleg von Start und Formular (Prozessnummer und Startzeit aus `/proc/<pid>/stat`) und die App im Vordergrund liegt. Die drei Proben sind Stichproben; zwischen ihnen ist der Prozess als derselbe belegt, sein Verhalten dazwischen nicht. Ein Devtools-Socket des eigenen Prozesses oder eine Antwort der Devtools ist immer „nicht bestanden“, auch wenn eine andere Probe unbrauchbar ist oder die Messung danach abbricht. Ein Devtools-Socket eines anderen Prozesses ist „nicht bestanden“, wenn die Gegenprobe wirksam war, sonst „ungültig“. Antwortet beim Abruf etwas anderes als die Devtools, läuft die Zeit ab, fehlt die Weiterleitung in der Liste oder endet der Abruf anders als am Kontrollsocket, ist `G-Devtools` ungültig.

Die Rückgabewerte entsprechen dem Emulatorlauf. Auf einem Gerät mit anderem Build-Typ als `user` bleiben `G-Socket` und `G-Devtools` dokumentierte Grenzen. Die Release-Datei wird wie im Emulatorlauf nur für die Prüfung mit dem Debug-Schlüssel der Android-Werkzeuge signiert. Nach dem Lauf entfernt das Aufräumen die App (ohne `--app-behalten`), die Hilfsdatei des Ansichtsbaums auf dem Gerät und die eigenen ADB-Weiterleitungen, auch nach einer Unterbrechung.

Erprobt sind die Annahmen des Laufs am 30.09.2026 auf dem Abbild `fr-api36` ohne Root: Die ADB-Shell liest `/proc/net/unix`, `adb pull` liest die installierte APK, die Devtools des Debug-Builds antworten über die Weiterleitung, und eine Weiterleitung auf einen Socket, den es nicht gibt, bleibt ohne Antwort. Am selben Tag lief das Skript auf den Abbildern `fr-api36` und `fr-api30` vollständig durch, mit einer Hülle außerhalb des Repositorys, die nur die Erkennung des Emulators ausblendet: Die drei Gegenproben bestanden, `/proc/<pid>/stat` war für die ADB-Shell lesbar, die Weiterleitungen standen in `adb forward --list`, der Abruf am Kontrollsocket endete in allen Proben gleich (`UND_ERR_SOCKET`), `G-Socket` und `G-Devtools` blieben wegen des Build-Typs `userdebug` dokumentierte Grenzen, und das Aufräumen ließ weder Paket noch Hilfsdatei noch Weiterleitung zurück. Auf `fr-api30` bestand `G-Start` mit dem zweiten Abzug des Ansichtsbaums; der erste zeigte die WebView noch ohne Inhalt. Auf `fr-api36` war `G-Start` ungültig, weil der Dialog „System UI isn't responding“ des Abbilds über der App lag. Ob ein Gerät eines Herstellers dasselbe zulässt, zeigt erst der Lauf dort.

Grenzen:

- Die Socketliste erfasst alle Apps des Geräts. Ein Devtools-Socket der WebView einer anderen App führt bei wirksamer Gegenprobe ebenfalls zu „nicht bestanden“ und ist über die aufgezeichneten Prozessnummern zu klären.
- Ein Lauf belegt ein Gerät mit einer Android- und einer WebView-Version, nicht andere Geräte.
- Netz, Navigation, Sicherung und Darstellung wiederholt der Lauf nicht. Das Bild `g-start.png` ist ein ergänzender Rohbeleg und von Hand zu sichten.
- Die Bedienung mit TalkBack und die Dateiabläufe prüft der Lauf nicht; sie sind von Hand zu prüfen und mit Gerät, Version und Datum festzuhalten.
- Die Laufbelege enthalten Angaben des Geräts, darunter die Seriennummer und die Socketnamen anderer Apps. Sie gehören nicht in das öffentliche Repository.
