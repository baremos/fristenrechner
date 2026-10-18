# Android-App

Stand 2026-10-16, App-Version 0.1.0, eingefrorener App-Stand `8b17927`, Build-Nachweise bis `d3d432b`. Die App verbindet den Rechenkern und die Oberfläche des Repositorys mit einer Android-Hülle aus Capacitor 8.5.2. Sie ist eine unverbindliche Rechenhilfe für Vergabefristen. Die Vergabeordnung wird ausdrücklich gewählt. Konten, Erinnerungen, Tracking und Netzwerkzugriffe im Betrieb gehören nicht zum Zuschnitt.

## Aufbau

| Bereich | Aufgabe |
|---|---|
| `app/src/pages/index.astro` | Eine Seite mit dem Rechner und Angaben zur App; Einbindung der gemeinsamen Oberfläche über ihren Paketnamen. |
| `app/src/hinweise-dritter.txt` | Offline lesbare Originalhinweise zum Web- und Android-Laufzeitbestand, aus dem gehashten Inventar erzeugt. |
| `app/public/startfehler.html` | Lokale Fehlerseite ohne Skript für eine zu alte WebView. |
| `app/astro.config.mjs` | Statischer Web-Build nach `app/dist`, JavaScript und CSS für Chromium 83. |
| `app/capacitor.config.json` | App-ID, lokale Herkunft `https://localhost`, WebView-Untergrenze, Fehlerseite und Darstellung. |
| `app/android` | Android-Projekt, Manifest, eigene Activity, Navigationssperre und Ressourcen. |
| `scripts/app-bauen.mjs` | Web-Build, Übertragung mit Capacitor, Prüfungen und Aufruf des Android-Builds. |
| `scripts/app-pruefungen.mjs` und `.json` | Prüfungen K1 bis K5 und ihre Daten. |

`cap sync android` überträgt `app/dist` in die Assets des Android-Projekts und erzeugt die Capacitor-Konfiguration für Android. Gradle erzeugt daraus die APK. Kern und Oberfläche bleiben plattformfrei; Android-spezifischer Code liegt in der App.

## Hinweise zu Komponenten Dritter

Nach „Lizenzen“ steht der eigene aufklappbare Abschnitt „Hinweise zu Komponenten Dritter“. Die App liest `app/src/hinweise-dritter.txt` beim Web-Build mit `?raw` und zeigt den Originaltext in einem `<pre>` mit Zeilenumbruch an; Web- und Android-Komponenten stehen gemeinsam darin. Adressen in den Fremdtexten bleiben Textknoten ohne Links. Die Quelle, der Generator, die gehashten Originalbelege und die bekannten Einschränkungen stehen in [lizenzen.md](lizenzen.md#hinweise-dritter-paketinhalt-und-verbleibende-arbeit).

Der Hinweisbestand vom 2026-10-06 umfasst 92 Haupteinträge und fünf eingebettete Android-Bestandteile (zusammen 97 statt zuvor 94), zehn separate Fremdtextdateien und 70 433 Bytes Hinweistext. Die Eintragszahl schließt die fünf Untereinträge der Android-Artefakte ein; die 92 Haupteinträge bleiben unverändert. Die Herkunftsabdeckung hat die in der Lizenzdokumentation genannten Grenzen.

Der optionale Gastgebertext `bibliothekenHinweis` setzt in der App den freigegebenen Verweis auf diesen Abschnitt. Die Vorgabe der gemeinsamen Komponente bleibt bytegleich. Der Emulator-Quellvertrag prüft Titel, Einleitung, Quelle, Position und Satz. Die Menüphase öffnet den neuen Abschnitt zusammen mit allen `details.app-abschnitt` bei Schriftfaktor 1,0 und 2,0 und verlangt dessen geöffnetes `<pre>`. Menüphase am 2026-10-06 auf API 36 und 30 mit diesem Hinweisbestand (Debug `4d1462b4…5ad4`, Release `90a212c5…3dbb`): Abschnitt bei Schriftfaktor 1,0 und 2,0 geöffnet, Seitenende erreicht und gesichtet, Sichtprüfung der je 15 Bilder ohne Befund; API 36 nur dokumentierte Grenzen, API 30 zusätzlich die bekannte Gestengrenze. Der Quellvertrag allein ist kein Sichtnachweis.

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

Der Menüknopf (drei Punkte) ist ein `button` mit dem Namen „Dateiaktionen“. `aria-expanded` beschreibt seinen Zustand, `aria-controls` verweist auf den Dialog. `aria-haspopup` entfällt, weil WebView 83 den Knopf damit als Auswahlliste abbildete. Nach der Änderung zeigt der Android-Ansichtsbaum den Knopf auf API 30 und 36 als `android.widget.Button` mit dem Text „Dateiaktionen“ (Phase `menue` vom 2026-10-02).

Die Export-Schaltflächen im Ergebnisbereich dürfen bei großer Schrift innerhalb ihrer Spalten umbrechen und in der Höhe wachsen. Die bisherige Mindesthöhe bleibt erhalten. Damit wird auch der Inhalt der einzelnen Schaltfläche geprüft, nicht nur die Seitenbreite.

Die App aktiviert die feste Menüleiste mit dem Kurztitel „Fristenrechner“ und dem Knopf „Dateiaktionen“. Der modale Dialog am unteren Rand bietet Speichern, Teilen, Import und Neues Projekt über die gemeinsamen Dateiaktionen. Die bisherigen Schaltflächen bleiben verfügbar. Die Komponente stellt ihre Platzreserve selbst bereit; die Leiste bleibt auch beim Datenschutzabschnitt erreichbar. Das Overlay bleibt innerhalb des Rechners. Hintergrund- und Scrollsperre gelten bis zum synchronen Schließen; anschließend liegt der Fokus am Menüknopf. Ein sichtbarer Fokusrahmen erscheint in Leiste und Sheet nach Tastaturbedienung; Pointer- und Touch-Eingaben blenden ihn aus. Das Fokusziel und die Fokus-Rückkehr bleiben erhalten. Android-Zurück verwendet den vorhandenen Zurück-Baustein ohne Web-Historie. Sichtprobe am 2026-10-02 mit dem Debug-Build auf API 30 (WebView 83.0.4103.120) und API 36 (WebView 133.0.6943.137), jeweils Systemschrift 1,0 und 2,0, bestanden: Leiste geschlossen oben und am Seitenende, Sheet offen und mit gesperrtem Zustand über einen angehaltenen Import, Rollen bis zur letzten Aktion, Schließen über X, Tipp auf die Abdunklung und Zurück mit Fokus am Knopf, zweites Zurück verlässt die App, kein abgeschnittener Inhalt einzelner Elemente (Textfelder ausgenommen, deren Wert im Feld rollt), kein Fokusrahmen nach Tipp; Bilder von Claude gesichtet. Dateiwege über das Sheet, Tastatur bei offenem Sheet, Neuerstellung, Querformat und Release-Build sind inzwischen in der Phase `menue` geprüft (siehe [Menüphase](#menüphase-auf-api-30-und-36)). Am 2026-10-03 wurden auf dem Galaxy A17 mit dem Debug-Build TalkBack für Menüleiste, Sheet und einzelne Einträge sowie die abgebrochene Randgeste ohne TalkBack geprüft. Die drei dabei beobachteten Befunde wurden mit Debug `99bf031d…59b7` (Stand `4e21b7c`, Android 16, WebView 153.0.8010.36, Samsung TalkBack 16.2.00.13) anhand von N1 bis N4 nachgeprüft: Lesereihenfolge, Fokus nach Abbruch des Dialogs über den Menüweg, Schließen über die TalkBack-Zurück-Geste und PDF-Teilen bestanden. Bei aktivem Menü bleibt die Metazeile ohne Live-Region; dadurch wird ihr Migrationshinweis beim Import älterer Projektdateien nicht automatisch angesagt. Formularweg, Sperrhinweis und Release-Build mit TalkBack sind dort nicht geprüft (siehe [Prüfung auf einem Gerät](#prüfung-auf-einem-gerät)). Die Phase `menue` ist am 2026-10-03 am Stand `27859db` auf API 30 und 36 wiederholt (siehe [Menüphase](#menüphase-auf-api-30-und-36)). Die unten belegte Zurück-Probe betrifft nur den Baustein.

Der optionale Zurück-Baustein der App verwendet das eigene `MenueZurueckPlugin` ohne zusätzliche Abhängigkeit. Ein an die Activity gebundener, anfangs deaktivierter Callback prüft zuerst über AndroidX die Insets der Decor-View: Ist die Bildschirmtastatur sichtbar, blendet er nur diese aus, bleibt aktiv und sendet kein Ereignis. Andernfalls, auch bei fehlenden Insets, deaktiviert er sich und meldet einmal `zurueck`; `setzen` überträgt nur `aktiv` und eine aufsteigende `folge`. Dokumentwechsel und Activity-Abbau deaktivieren ihn. Der App-Adapter registriert den Listener vor der ersten Aktivierung, ignoriert späte Ereignisse und meldet ihn bei `dispose` ab. Brückenfehler erzeugen keine Projektfehlermeldung; Öffnen und Schließen bleiben unabhängig von der Bestätigung. Die Website stellt diese optionale Schnittstelle nicht bereit. Die Menübedienung nutzt sie zum Schließen des Sheets; es entsteht keine Web-Historie. Stand nach Ergänzung des Tastaturzweigs: **Probe am 2026-10-02 auf API 30 (WebView 83.0.4103.120) und API 36 (WebView 133.0.6943.137) bestanden**, Debug-Build `35fe571d…f9c1`, je sechs Fälle: Zurück ohne Aktivierung verlässt die App; aktiv genau ein Ereignis, App bleibt, zweites Zurück verlässt die App; nach Deaktivieren kein Ereignis; Tastaturfolge wie unten; abgeschlossene Randgeste im Gestenmodus mit einem Ereignis; ältere Folge ohne Wirkung. In den vier Fällen mit aktivem Callback (aktiv, Tastatur, Randgeste, ältere Folge) wurden die Projektdaten geprüft und blieben unverändert. Ohne Tastaturzweig hatte API 36 im Lauf davor bei sichtbarer Tastatur zuerst das Ereignis gemeldet und die Tastatur offen gelassen; API 30 schloss die Tastatur selbst. Die Tastaturprobe verlangt je Zurück-Schritt: zuerst Tastatur zu ohne neues Ereignis und App weiter resumed; dann genau ein neues Ereignis mit `folge: 1`, Tastatur weiter zu und App resumed; zuletzt kein neues Ereignis und App verlassen. `input swipe` belegt keine abgebrochene Predictive-Back-Geste; eine abgebrochene Randgeste ist am 2026-10-03 von Hand auf einem Gerät geprüft (Debug-Build, ohne TalkBack; siehe [Prüfung auf einem Gerät](#prüfung-auf-einem-gerät)). Sheet und Release-Lauf sind nicht Teil dieser Probe.

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

Handlauf zu Import und Dialog am 2026-10-01 mit der Debug-APK `9dd552d0…690d` auf fr-api30 (WebView 83) und fr-api36 ohne Root, gesteuert über die Devtools der WebView, `uiautomator` und Tasteneingaben; je Abbild 63 Befunde bestanden: Eine über „Speichern unter“ erzeugte Projektdatei wurde mit geändertem Projektnamen nach `Download` gelegt und über „Projekt importieren“ in der Android-Auswahl geöffnet; `projektWaehlen` wird genau einmal ohne Felder aufgerufen, die Antwort trägt Anzeigename und Text, die Meldung lautet „Projektdatei geöffnet (Rechenkern 1.9.0, Rechtsstand: Juli 2026).“, Formular und Speicher zeigen den importierten Stand. Abbruch der Auswahl mit Zurück liefert `abgebrochen` und lässt Meldung, Formular und Speicher unverändert. Eine Datei mit genau 1 048 576 Bytes wird gelesen und scheitert erst am Format; ein Byte mehr ergibt `zu-gross` mit „Die Projektdatei ist größer als 1 MiB.“; ungültiges UTF-8 ergibt `lesen`, die Oberfläche zeigt dazu wie auf der Website ihren allgemeinen Text; eine führende BOM wird entfernt und die Datei geöffnet. Nach jedem Fehler bleibt das Projekt unverändert, und die Schaltflächen sind wieder frei. Der Dialog zum Zurücksetzen zeigt die drei Ressourcen, „Abbrechen“ (`android:id/button2`) hat vor der ersten Eingabe `focused="true"`; Abbrechen und Zurück liefern `bestaetigt: false` ohne Änderung, nur „Zurücksetzen“ liefert `true` und legt ein neues Projekt an. Das Thema der App zeigt die Schaltflächen in Großbuchstaben. Eine echte Neuerstellung der Activity bei offenem Dialog, ausgelöst über eine geänderte Systemschrift (`fontScale` steht nicht in `android:configChanges`), schließt den Dialog, setzt nichts zurück, erhält das gespeicherte Projekt und baut die WebView neu auf (neue Seitenkennung in den Devtools, derselbe Prozess); Dialog und Import sind danach wieder bedienbar. logcat ohne Fehlerzeile und ohne Namen oder Inhalt der Projektdateien aus dem eigenen Prozess. Beobachtungen der Abbilder, keine Fehler der App: `input tap` auf eine Zeile der Dateiauswahl wirkt nicht, Chips und Schaltflächen daneben reagieren; die Zeile lässt sich mit den Pfeiltasten fokussieren und mit Enter öffnen. In der Kachelansicht hat der Dateiname im Abzug von `uiautomator` keine Fläche. Auf fr-api36 erschien der Dialog „System UI isn't responding“ einmal und wurde mit „Wait“ geschlossen. Dieser Handlauf belegte noch keine Neuerstellung bei offener Dateiauswahl, keinen Prozessverlust und keinen Hintergrundwechsel ohne Neuerstellung. Diese Fälle wurden anschließend in der Dateiphase geprüft; ein echtes Gerät stand zu diesem Zeitpunkt noch aus (Prüfung auf einem Gerät am 2026-10-01, siehe unten).

Die Dateiphase vom 2026-10-01 ergänzt diese Handläufe, siehe [Ergebnisse und Rohbelege](#dateiphase-auf-api-30-und-36). Am 01.10.2026 sind Speichern, Teilen, Import und Dialog auf einem Gerät von Hand geprüft (siehe „Prüfung auf einem Gerät“). Ein Wortlautprotokoll mit TalkBack liegt seit dem 03.10.2026 für die Menüleiste, „Projekt speichern unter“ einschließlich der Erfolgsmeldung, den Ablauf von „PDF teilen“ einschließlich der Meldung in der Nachprobe sowie die Frage im Dialog zum Zurücksetzen und „ABBRECHEN, Schaltfläche“ vor. Weiter offen sind die übrigen Dateiwege mit TalkBack, verzögertes Lesen durch echte Empfänger, fehlende Speicherziele, voller Speicher beziehungsweise Cache sowie Schreib- und Schließfehler mit und ohne Zielrest. Die Importgrößengrenzen, Cache-Bereinigung, Freigaben und die genannten Lebenszyklusfälle sind auf den beiden Abbildern belegt; daraus folgt kein Nachweis aller Fehlerfälle. Der Schließfehler blieb eine dokumentierte Grenze, ebenso die fehlenden UID-Zähler auf API 30.

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

`--android` verwendet in der Voreinstellung `assembleDebug`. Der Ablauf ist: Rechenkern bauen, App-Seite mit Astro bauen, K1 und K2, Hinweise Dritter mit Bündelabgleich, `cap sync android`, K3 und K4, `scripts/android-build.mjs`, bei `assembleRelease` Hinweise Dritter mit Gradle-Abgleich, K5 an der erzeugten APK. Jeder Fehler beendet den Ablauf. `ASTRO_TELEMETRY_DISABLED=1` und `CI=1` gelten für alle Unterprozesse.

Auch `node scripts/app-bauen.mjs --web` führt nach K2 den Inventar- und
Bündelabgleich aus. `--pruefen` verwendet das bereits vorhandene Modulprotokoll;
für einen neuen Stand ist vorher zu bauen. Der Build liest
`app/.astro/module-client.json`; nach `assembleRelease`, auch mit `:app:`-Präfix,
liest er zusätzlich
`app/android/app/build/intermediates/lint_vital_report_lint_model/release/generateReleaseLintVitalReportModel/release-artifact-dependencies.xml`.
Das Modell wird im selben Lauf nach erfolgreichem `assembleRelease` gelesen.
Ein fehlendes Modell beendet die Kette. Eine Zeitregel zwischen Modell und APK
wird nicht geprüft. **Grenze: kein kausaler Herkunftsnachweis zwischen Modell
und APK.** Die Prüfung belegt weder die Erzeugung des Modells im aktuellen Lauf
noch zugehörige Artefakthashes; Gradle kann Ausgaben wiederverwenden.
Der Android-Build im Debug-Modus benötigt
kein Release-Modell. Beide Abgleiche verwenden den Normalmodus des Inventars:
Platzhalter sind hier noch zugelassen. `app-bauen.mjs --streng` behält seine
bisherige Bedeutung für Werkzeuge und Android-Arbeitskopie; für ein Inventar ohne
Platzhalter ist gesondert `node scripts/check-licenses.mjs --streng` erforderlich.

Inventar- und Bündelabgleich bleiben im Erfolgsfall ohne Ausgabe; Fehler brechen
den Build ab. Die gesonderte Hinweisprüfung im F-Droid-prebuild meldet nach dem
Sync dagegen „Hinweise Dritter: bestanden“. Der F-Droid-Lauf vom 2026-10-15
belegt diese Zeile und den Kern-Build mit Version 0.1.0. Die beiden Muster in
`scripts/fdroid/app-meldungen.json` und
die zugehörige Prüfdatei wurden mit `39092de` ergänzt. Die Neuauswertung desselben
Laufs ergab danach keine Beanstandung; siehe den
[F-Droid-Nachweis](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15).

Der Bündelabgleich bestätigt Paketorte mit gerenderten Modulen und die erfassten
virtuellen Hilfen in beiden Richtungen. Er entdeckt keine zusätzlichen Fremdteile
innerhalb einer Distribution. Der Gradle-Abgleich bestätigt Maven-Koordinaten und
Projektmodule des `package`-Abschnitts des Release-Modells in beiden Richtungen;
er prüft weder den Wortlaut noch die Vollständigkeit von Lizenz- und
Urheberhinweisen in den Artefakten. Das Inventar und der Generator sind in
[lizenzen.md](lizenzen.md#werkzeuge-für-die-hinweise-der-app) beschrieben.
Am 2026-10-15 bestanden Lizenzprüfung, Bündelabgleich und Hinweisprüfung; die
Android-Builds bestanden einschließlich Gradle-Abgleich und K1 bis K5.

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
| K2: Web-Dateien | Pflichtdateien und HTML-Kopf vorhanden, Fehlerseite ohne Skript, keine Source-Maps, keine erkannten zu neuen Syntaxmerkmale; bekannte Laufzeitnamen, dynamischer Code und Adressen nur nach den begrenzten Regeln in der JSON-Datei. Die optionalen jsPDF-Chunks mit den Dateistämmen `html2canvas`, `purify.es` und `index.es` sowie die festgelegten Kennzeichen fehlen in JavaScript, HTML und CSS; `import()` enthält keine nackten Modulnamen. Kern und Oberfläche enthalten keine Capacitor-Verweise. | Vollständige Browserauswertung oder alle möglichen Laufzeitaufrufe. Berechnete Namen, zusammengesetzte Adressen, Aliase und erst zur Laufzeit erzeugter Code sind nicht vollständig erfassbar. |
| K3: Übertragung | Jeder Pfad und Dateiinhalt aus `dist` ist in `assets/public` enthalten, ergänzt um genau die zwei leeren Cordova-Dateien; Plugin-Liste leer, Capacitor-Konfiguration nach geparstem JSON gleich, Cordova-Konfiguration bytegleich zur Erwartung. Der Sync verändert den vorher festgehaltenen Git-Status und die geprüften Dateiinhalte unter `app/android` nicht. Mit `--streng` ist die Arbeitskopie dort vor und nach dem Sync sauber. | Vollständigkeit eines Quellarchivs ohne vertrauenswürdige Referenz oder das Verhalten der kopierten Dateien zur Laufzeit. |
| K4: Gradle-Dateien | Keine Vorkommen von `signingConfig`, `google-services` oder `flatDir` außerhalb von Kommentaren in den beiden eigenen `build.gradle`-Dateien; SDK-, Build-Tools-, App- und Wrapper-Versionen samt Wrapper-Prüfsumme stimmen mit ihren Vorgaben überein. `app/android/gradlew` hat im Git-Index den Dateimodus `100755`. | Vollständige Auswertung beliebigen Gradle-Codes, aller erzeugten Gradle-Dateien oder der Lizenzen und Inhalte sämtlicher Abhängigkeiten. |
| K5: APK | Mit `aapt2` aus den festgelegten Build-Tools werden Paket und Version, Mindest- und Ziel-API, Sprachressourcen, Berechtigungen, Sicherungsregeln, WebView-Metadaten, Komponenten und Debug-Kennung geprüft. Außerdem: keine nativen Bibliotheken, keine der beiden gesuchten Google-Dienst-Bytefolgen in `classes*.dex`, korrekte Web-Assets und leere Plugin-Liste. | Ausführung der App, Vollständigkeit aller denkbaren Dienstmerkmale, Lizenzprüfung, kryptografische Signaturprüfung oder Reproduzierbarkeit des Builds. |

Die Quellprüfung in K3/K4 liest XML über den Parser des JDK.

K4 unterscheidet Kommentare und Zeichenketten: Ein auskommentiertes Verbot ist kein Fund; dieselbe Zeichenfolge in einer Zeichenkette bleibt ein Fund, auch hinter einem darin enthaltenen Kommentarzeichen. GString-Ausdrücke mit `${...}` in interpolierenden Zeichenketten werden nicht unterstützt und führen ausdrücklich zu einem Fehler.

K5 erlaubt genau `de.baremos.fristenrechner.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Exportiert sind nur `de.baremos.fristenrechner.MainActivity` und `androidx.profileinstaller.ProfileInstallReceiver`; der Receiver muss `android.permission.DUMP` verlangen. `allowBackup` ist `false`, Klartextverkehr darf nicht freigegeben sein. Beide WebView-Metadaten müssen ihre festgelegten Werte haben; `EmojiCompatInitializer` darf nicht enthalten sein. `debuggable` muss zum geprüften Debug- oder Release-Build passen. Die Bytesuche betrifft `Lcom/google/android/gms/` und `Lcom/google/firebase/`; `Lcom/google/` allein wäre wegen der enthaltenen Guava-Schnittstelle kein geeigneter Nachweis für Google-Dienste.

Ohne Git scheitern K3 und K4 mit einem ausdrücklichen Fehler. K4 prüft den Modus im Index, weil er das Ausführungsrecht in einem frischen Linux-Klon bestimmt; der lokale Dateimodus allein belegt das nicht. Für ein Quellarchiv wäre ein vom Herausgeber bereitgestelltes, vertrauenswürdig abgesichertes Dateimanifest mit relativen Pfaden, Dateimodi und Inhaltsprüfsummen als Referenz erforderlich; ein erst nach dem Sync aus demselben Archiv erzeugtes Manifest würde dessen Unverändertheit nicht belegen. Dieser alternative Prüfweg ist nicht eingerichtet. Bis dahin setzt der vollständige Android-Build eine Git-Arbeitskopie voraus.

## Build-Nachweis am eingefrorenen Stand vom 2026-10-15

Die App-Eingaben entsprechen `8b17927`. Die frische Windows-Kopie und die beiden Linux-Klone wurden zunächst am Stand `97d07c2` geprüft; dieser ergänzt nur die F-Droid-Referenz und ihre Dokumentation. `6ce0c7c` korrigiert die Reihenfolge in `npm test`, `d3d432b` ergänzt zwei Gradle-Prüfsummen. Diese Änderungen verändern die App-Eingaben nicht. Alle folgenden Zeiten sind MESZ.

| Lauf | Werkzeuge und Ablauf | Beobachtetes Ergebnis |
|---|---|---|
| Windows, Neubau nach `clean`, 2026-10-15, 16:14 bis 16:16 | Node 24.21.0, npm 11.19.0, JDK 21.0.8, Gradle 8.14.5 `bin`, Build-Tools 35.0.0; ohne `--streng`. Zuerst `node scripts/android-build.mjs --projekt app/android --aufgabe clean`, danach `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` und `node scripts/app-bauen.mjs --android`. | Release und Debug mit K1 bis K5 bestanden; Release unsigniert 7 668 430 Bytes, Debug 9 409 175 Bytes. Arbeitsbaum danach sauber. |
| Windows, frische Kopie aus einem Bundle außerhalb des Repositorys, 2026-10-15, 16:24 bis 16:43 | Rechnerweites Node 22.23.2, npm 10.9.8, `core.autocrlf=true`, JDK 21.0.8; ohne `--streng`. `npm ci` in 101 Sekunden, `npm run check`, `npm run build`, `npm run lizenzen` und `node scripts/app-bauen.mjs --android --aufgabe assembleRelease`. | Genannte Prüfungen und K1 bis K5 bestanden; Release 7 668 430 Bytes und bytegleich zum Windows-Neubau. Arbeitsbaum danach sauber. `npm test` scheiterte zunächst an einem Testfall; Korrektur und Wiederholung siehe unten. |
| Linux, zwei frische Klone, 2026-10-15, 16:24 bis 16:39 | Debian 13.5 in WSL 2, Node 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Projekt-SDK nur Gruppe „Build“, Gradle 8.14.5 `bin`. Je `npm ci` und `node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe`. | K1 bis K5 in beiden Klonen bestanden. Beide Release-APKs 7 668 430 Bytes, untereinander und zum Windows-Neubau bytegleich; beide Arbeitsbäume danach sauber. |

| Datei aus dem Windows-Neubau | SHA-256 |
|---|---|
| Release, unsigniert | `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02` |
| Debug | `aecc556fa382846737a38fe0f1e0f0477673e1076efd13d511872308c5af69f6` |

Die Release-Prüfsumme gilt für alle vier Builds. Nach der Ergänzung der Gradle-Prüfsummen bestand am Stand `d3d432b` ein weiterer Windows-Release-Build mit K1 bis K5. Er lief inkrementell; Gradle schrieb die APK nicht neu, sie blieb bei derselben Prüfsumme. Die Release-APK enthält `META-INF/version-control-info.textproto` mit `NO_SUPPORTED_VCS_FOUND` (46 Bytes), `assets/dexopt/baseline.prof` mit 2 499 Bytes und `baseline.profm` mit 233 Bytes; diese Dateien sind Teil des Vergleichs.

| Tests mit `npm test` | Skripte insgesamt | Bestanden | Übersprungen | Fehlgeschlagen | Kern / Oberfläche / App (Vitest, bestanden) |
|---|---|---|---|---|---|
| Windows, Gesamtprüfung mit Node 24.21.0 | 3 107 | 3 100 | 7 | 0 | 134 / 466 / 258 |
| Frische Windows-Kopie mit Node 22.23.2, Wiederholung am Stand `6ce0c7c` ohne vorhandenes `packages/kern/dist` | 3 107 | 3 100 | 7 | 0 | 134 / 466 / 258 |
| Erster Linux-Klon mit Node 24.21.0, Kern bereits gebaut | 3 107 | 3 027 | 80 | 0 | 134 / 466 / 258 |

In der frischen Windows-Kopie scheiterte zunächst genau ein Testfall: `scripts/browser/belege.test.mjs` importiert den gebauten Rechenkern, die Skripttests liefen aber vor dessen Build. Ein vorhandenes `packages/kern/dist` verdeckte den Fehler in vorbereiteten Arbeitskopien. Seit `6ce0c7c` baut `npm test` den Kern zuerst. Die Wiederholung in derselben frischen Kopie ohne `packages/kern/dist` bestand mit den Zahlen der Tabelle. Im ersten Linux-Klon war der Kern vor `npm test` bereits gebaut; auch die Lizenzprüfung bestand dort.

Ohne Netzwerkzugriff unter `unshare -r -n` bestanden im ersten Linux-Klon Web-Build und Android-Sync mit Rückgabewert 0. Die Gegenprobe im selben Netzwerk-Namensraum scheiterte bei der Namensauflösung mit `EAI_AGAIN`. Im zweiten Klon brach die Gegenprobe ohne Ausführungsrecht für `gradlew` mit `EACCES` und Rückgabewert 1 ab. Nach Rücknahme der Änderung war der Arbeitsbaum wieder sauber. Die Netzprobe betrifft die vorbereitete Umgebung; Gradle lief mit Netz.

N1 ist damit für die unsignierte Release-APK auf diesem Rechner erneut belegt. Der [lokale F-Droid-Lauf vom 2026-10-15](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15) lieferte am Stand `d3d432b` dieselbe Release-APK. Grenzen bleiben: Windows und Debian unter WSL auf einem Rechner, Windows ohne `--streng` mit JDK 21.0.8 statt der für Release-Builds festgelegten 21.0.12, Gradle mit Netz. Die Debug-Prüfsumme bezeichnet nur den Windows-Neubau; Debug-APKs gehören nicht zu N1. Ein Build auf dem F-Droid-Buildserver ist nicht belegt.

## Build-Nachweis am Endstand vom 2026-10-03/04

Dieser historische Abschnitt bleibt als Nachweis des damaligen Stands erhalten; der [Build-Nachweis am eingefrorenen Stand vom 2026-10-15](#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15) steht oben.

Quelle sind die Protokolle der Läufe vom 2026-10-03/04; sie liegen nicht im Repository. Der Windows-Neubau nach `clean` prüfte `c7b5230`, die frische Windows-Kopie und die beiden Linux-Klone prüften `8987e69`. Dieser Nachweisstand ergänzt nur die F-Droid-Referenz und ihre Dokumentation; die App-Eingaben sind gleich und entsprechen `27859db`.

| Lauf | Werkzeuge und Ablauf | Beobachtetes Ergebnis |
|---|---|---|
| Windows, Neubau nach `clean`, 2026-10-03, 23:44 bis 23:47 | Node 24.21.0, npm 11.19.0, JDK 21.0.8, Gradle 8.14.5 `bin`, Build-Tools 35.0.0; ohne `--streng`. Zuerst `node scripts/android-build.mjs --projekt app/android --aufgabe clean`, danach `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` und `node scripts/app-bauen.mjs --android`. | Release mit K1 bis K5 bestanden; unsigniert 7 760 765 Bytes. Debug 9 516 334 Bytes. Arbeitsbaum vor und nach dem Lauf sauber. |
| Windows, frische Kopie aus einem Bundle außerhalb des Repositorys, 2026-10-03, 23:51 bis 2026-10-04, 00:04 | Rechnerweites Node 22.23.2, npm 10.9.8, `core.autocrlf=true`, JDK 21.0.8; ohne `--streng`. `npm ci` in 35 Sekunden; `npm test`, `npm run check`, `npm run build`, `npm run lizenzen`; anschließend `node scripts/app-bauen.mjs --android --aufgabe assembleRelease`. | Alle genannten Prüfungen bestanden, K1 bis K5 bestanden; Release 7 760 765 Bytes und bytegleich zum Windows-Neubau. Arbeitsbaum sauber. Tests siehe unten. |
| Linux, zwei frische Klone aus einem Bundle, 2026-10-03, 23:49 bis 2026-10-04, 00:00 | Debian 13.5 in WSL 2, Node 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Projekt-SDK nur Gruppe „Build“, Gradle 8.14.5 `bin`. Je `npm ci` in 10 Sekunden und `node scripts/app-bauen.mjs --android --aufgabe assembleRelease --streng --ohne-testgruppe`. | K1 bis K5 in beiden Klonen bestanden; Builds in 57 und 33 Sekunden. Beide Release-APKs 7 760 765 Bytes, mit `cmp` untereinander bytegleich und gleich der Windows-Referenz; beide Arbeitsbäume sauber. |

| Datei aus dem Windows-Neubau | SHA-256 |
|---|---|
| Release, unsigniert | `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa` |
| Debug | `d05ca6b02574bc58e113136475c2ef40d7f44e51a7780308888993a8a5fd914c` |

Die Release-Prüfsumme gilt für alle vier Builds. Die APK enthält `META-INF/version-control-info.textproto` mit `NO_SUPPORTED_VCS_FOUND` (46 Bytes), `assets/dexopt/baseline.prof` mit 2 499 Bytes und `baseline.profm` mit 233 Bytes; diese Dateien sind Teil des Vergleichs.

| Tests mit `npm test` | Skripte insgesamt | Bestanden | Übersprungen | Fehlgeschlagen | Kern / Oberfläche / App (Vitest, bestanden) |
|---|---|---|---|---|---|
| Frische Windows-Kopie mit Node 22.23.2 | 1 985 | 1 981 | 4 | 0 | 134 / 343 / 258 |
| Erster Linux-Klon mit Node 24.21.0 | 1 985 | 1 906 | 79 | 0 | 134 / 343 / 258 |

Unter Linux bestand auch die Lizenzprüfung. Die 79 übersprungenen Skripttests sind 76 Simulationen der Geräte- und Emulatorlaufskripte, die nur unter Windows laufen (`skip: process.platform !== 'win32'` in `scripts/geraet-lauf.test.mjs` und `scripts/emulator-lauf.test.mjs`), zwei Fälle mit PowerShell und ein Signierfall zum „Pfad im Namensraum von Windows“. Der historische Lauf am Stand `b34b483` hatte 1 445 Tests mit zwölf übersprungenen. Seitdem sind Tests hinzugekommen, die nur unter Windows laufen, darunter die Tests der Geräte-Laufskripte; daher die höhere Zahl übersprungener Tests.

Ohne Netzwerkzugriff unter `unshare -r -n` bestanden Web-Build und `cap sync` jeweils mit Rückgabewert 0; die Gegenprobe im selben Netzwerk-Namensraum scheiterte mit `EAI_AGAIN`. Die Gegenprobe ohne Ausführungsrecht für `gradlew` brach mit `EACCES` und Rückgabewert 1 ab; die Änderung am Ausführungsrecht wurde danach zurückgenommen. Diese Proben betreffen die vorbereitete Linux-Umgebung. Gradle lief mit Netz.

N1 ist damit für die unsignierte Release-APK auf diesem Rechner belegt. Der [lokale F-Droid-Lauf am Endstand](fdroid-build.md#lauf-am-endstand-vom-2026-10-04) lieferte einen fünften Build mit derselben Prüfsumme. Grenzen bleiben: Windows und Debian unter WSL auf einem Rechner, Windows ohne `--streng` mit JDK 21.0.8 statt der für Release-Builds festgelegten 21.0.12, Gradle mit Netz. Debug-APKs sind zwischen Arbeitskopien nicht bytegleich und gehören nicht zu N1. Ein Build auf dem F-Droid-Buildserver ist nicht belegt.

## Build vom 2026-09-30

Dieser historische Abschnitt beschreibt den damaligen Stand; der [Build-Nachweis am eingefrorenen Stand vom 2026-10-15](#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15) steht oben.

Der Android-Quellstand `83f0a10`, Version 0.1.0, wurde am 2026-09-30 unter Windows gebaut: Node 24.21.0, npm 11.19.0, JDK 21.0.8, Capacitor 8.5.2, Android-Gradle-Plugin 8.13.0, Gradle 8.14.5 als `bin`-Verteilung und Build-Tools 35.0.0.

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

Der Rauchtest belegt Start und Anzeige dieses älteren Builds. Es gab keinen Netzmelder, keine Navigationsversuche, keine Sicherungsprüfung und keine Berechnung in der Oberfläche. Den späteren Stand dieser Prüfungen beschreibt der Emulatorabschnitt unten. Der gesonderte [Lizenznachweis der Gradle-Laufzeitmodule](lizenzen.md#android--und-gradle-abhängigkeiten) wurde am 2026-10-04 für `7fd6c90` um POM-Lizenzangaben und APK-/SUSS-Abgleich ergänzt; vollständige Hinweise Dritter und der Gradle-Werkzeugteil bleiben offen. Das erweitert nicht den Umfang dieses historischen Rauchtests.

## Linux-Nachweis vom 2026-09-30

Dieser historische Abschnitt bleibt als Nachweis der damaligen Quellstände erhalten. Den eingefrorenen App-Stand beschreibt der [Build-Nachweis vom 2026-10-15](#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15).

Der Quellstand `b7d6813` wurde unter Debian 13.5 in WSL 2 aus einem Git-Bundle in zwei getrennte Ordner geklont. Jeder Klon hatte sein eigenes `node_modules`. Verwendet wurden Node.js 24.21.0, npm 11.19.0, OpenJDK 21.0.12.1, Gradle 8.14.5 als `bin`-Verteilung und Build-Tools 35.0.0. Das Projekt-SDK enthielt nur die Gruppe „Build“. Die bereits vorhandene und geprüfte Gradle-Verteilung wurde in den Cache des Wrappers kopiert; der Wrapper prüfte ihre Prüfsumme erneut. Bei diesem Lauf wurde die Verteilung nicht neu geladen.

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

Am selben Tag wurde der Nachweis am Quellstand `b34b483` wiederholt, mit der Oberfläche über die Plattformschnittstelle: wieder zwei Klone, derselbe Befehl mit `--streng --ohne-testgruppe`, K1 bis K5 bestanden, Arbeitskopie danach unverändert. Die beiden unsignierten Release-APKs waren bytegleich, 7.715.483 Bytes, SHA-256 `776bba301220d1d9b3f5e4f5d4841f37449609e72d6622b8ebdab065fcab93b3`, und entsprechen der Windows-APK dieses Stands. Web-Build und Sync bestanden erneut ohne Netzwerk, die Gegenprobe zum Ausführungsrecht meldete `EACCES`. `npm test` meldete 1.445 Skripttests, davon 1.433 bestanden und zwölf übersprungen (die Prüfungen mit dem Emulator laufen nur unter Windows), `npm run lizenzen` bestand.

Der Vergleich gilt für zwei Klone auf demselben Rechner und für den genannten Tag. Der damalige Lauf prüfte keinen Debug-Build unter Linux, keine Gegenprobe mit geändertem `versionName`, keinen zweiten Rechner und keinen Build mit dem Scanner oder dem Buildserver von F-Droid. Inzwischen ist der [lokale Lauf mit dem Scanner von F-Droid am Endstand](fdroid-build.md) belegt; ein Build auf dem F-Droid-Buildserver bleibt offen.

## Prüfung im Emulator

### Screenshots für die Store-Einträge

`node scripts/store-screenshots.mjs --api 36 --apk-debug app/android/app/build/outputs/apk/debug/app-debug.apk --ausgabe scratchpad/store-screenshots/lauf-01` erstellt vier native PNG-Aufnahmen (1080 × 2400) im bereits laufenden Emulator `fr-api36`: Formular, Terminplantabelle, Zeitschiene und geöffnetes Bottom Sheet „Dateiaktionen“. Voraussetzungen sind die eingerichteten Android-Werkzeuge, Node 22 oder 24 und eine gebaute Debug-APK in diesem Worktree; eine vorhandene App-Installation wird nicht überschrieben. Das Skript startet keinen Emulator und baut keine APK. Es befüllt das reguläre Formular einschließlich Eingabeereignissen und Berechnung mit festen, erfundenen Probedaten („Musterstadt“, Versanddatum 02.11.2026); damit werden dieselben Oberflächenfunktionen wie bei der Eingabe verwendet. Die Gerätebilder entstehen nach Ausrichtung und Layoutruhe per ADB einschließlich Statusleiste im Demo-Modus. Der Lauf protokolliert Werkzeugversionen, Auflösung, APK- und Bildprüfsummen, Daten, Rollstände und Dauer in `protokoll.json`, stellt veränderte Einstellungen zurück und entfernt seine Installation und Weiterleitungen. Temporäre Dateien bleiben unter dem neuen, anfangs leeren Ausgabeordner; externe Netzverbindungen sind nicht vorgesehen, CDP verwendet ausschließlich die lokale ADB-Weiterleitung. `--nur-argumente` prüft den Aufruf ohne Gerätezugriff. Die menschliche Sichtprüfung steht zunächst mit Rückgabewert 4 aus: `sichtpruefung.json` verwendet Schema 2 mit Prüfperson, Datum, Bemerkung und Hashbindung nach dem Muster der Browserprüfung, jedoch die eigene Belegart „Gerätevollbild“ statt Elementausschnitten. Nach der Sichtung wertet `node scripts/store-screenshots.mjs --auswerten --ausgabe scratchpad/store-screenshots/lauf-01` die unveränderten Bilder erneut aus (0 bestanden, 1 Sichtprüfung nicht bestanden, 2 ungültig, 3 dokumentierte Grenze, 4 Sichtprüfung ausstehend). Bytegleichheit muss durch Wiederholung geprüft werden; insbesondere Systemabbild, WebView, Dichte und Systemleisten können Abweichungen verursachen. Ein sichtbarer Warnhinweis, auch zum Rechtsstand bei späterem Gerätedatum, macht die Aufnahme ungültig; das Skript blendet ihn nicht aus. Der Lauf ersetzt weder die Sichtprüfung noch eine Freigabe zur Veröffentlichung.

Das optionale Argument `--profil` akzeptiert `telefon` (Vorgabe, native 1080 × 2400 ohne Übersteuerung), `tablet-7` (`wm size 1080x1920`, `wm density 320`) oder `tablet-10` (`wm size 1080x1920`, `wm density 240`). Beide Tablet-Profile liefern unveränderte Gerätebilder mit 1080 × 1920 Pixeln im Hochformat 9:16; Bildnamen und Probedaten bleiben gleich. Vor Änderungen müssen native 1080 × 2400 und eine lesbare native Dichte ohne Override vorliegen; eine vorhandene Übersteuerung beendet den Lauf als dokumentierte Grenze ohne Änderungen am Emulator. Die Tablet-Übersteuerung erfolgt vor Installation und App-Start; erst drei aufeinanderfolgende Bestätigungen über `wm size`, `wm density` und die Größe von Display 0 in `dumpsys window` erlauben die Fortsetzung. Auch bei Fehlern oder Unterbrechung werden die gesetzten Übersteuerungen mit `wm size reset` und `wm density reset` zurückgesetzt und die nativen Werte ohne Override erneut geprüft; eine unbestätigte Rücksetzung macht den Lauf ungültig. `protokoll.json` hält Profil, native und wirksame Auflösung und Dichte, erwartete Bildmaße sowie Rücksetzbelege fest. `--nur-argumente` akzeptiert das Profil ebenfalls; die Neuauswertung liest es aus dem Protokoll und verwirft fehlende Profile oder widersprüchliche Maße.

Stand vom 18.10.2026 am Quellstand `f1f3db3` (Debug-APK aus diesem Stand, Emulator `fr-api36` mit System-WebView 133.0.6943.137, Dichte 420, Schaltflächennavigation): Acht Läufe: Lauf 01 und 03 lieferten vollständige, bytegleiche Bildsätze; Lauf 01 endete trotzdem ungültig, weil das Aufräumen den Installationspfad von Android 11 und neuer (`/data/app/~~…/`) nicht erkannte und die Deinstallation unterblieb; Lauf 02 endete ungültig, weil eine einzelne Layoutprobe direkt nach dem Rollen abgelehnt wurde; Lauf 04 lieferte Bild 1 um neun Gerätepixel vertikal verschoben, weil `scrollIntoView` bei gleicher Dokumentlage des Ankers nicht immer denselben Rollstand ergab. Seitdem erkennt das Aufräumen die Pfadform, der Rollstand wird nach dem Rollen fest aus Ankerlage und Leistenunterkante abgeleitet und auf Gerätepixel gerundet (`rollziel` im Protokoll), vor der Aufnahme zählt erst die dritte gleiche gültige Probe in Folge und eine abgelehnte Probe setzt die Zählung zurück; nach der Aufnahme ist jede abgelehnte Probe und jede beobachtete Bewegung ein Fehler, auch wenn die Seite danach zur Ausgangslage zurückkehrt, damit ein Bild aus einem verdeckten oder rollenden Zustand nicht durch eine spätere Beruhigung gedeckt wird. Die Fehlermeldung nennt die abgelehnte Messung, das Protokoll die Probenfolge. Lauf 05 und 06 lieferten mit festem Rollstand alle vier Bilder bytegleich, Lauf 07 und 08 mit der Bewegungsprüfung ebenfalls. Die vier Bilder aus Lauf 06 liegen nach Sichtprüfung als `fastlane/metadata/android/de-DE/images/phoneScreenshots/1.png` bis `4.png` (gleich in `en-US`) im Repository; die Bilder tragen die bereinigte Statusleiste und die Probedaten des Skripts, keine Gerätedaten. Jede Änderung an Oberfläche oder App-Seite verlangt einen neuen Lauf, weil die Bilder sonst einen alten Stand zeigen.

Tablet-Profile, Stand vom 18.10.2026 mit derselben Debug-APK (die Quellen der App sind seit `f1f3db3` unverändert), Emulator `fr-api36` wie oben: `tablet-7` Lauf 01 und 02 endeten ungültig mit „App-WebView fehlt oder Systemdialog verdeckt sie“: Bei der ersten Aufnahme stand der Dialog „System UI isn't responding“ des Abbilds. Die Laufprotokolle belegen den Dialog erst an dieser Stelle; das Geräteprotokoll (`logcat`) des Emulators nannte einen einzigen ANR der Systemoberfläche, und zwar unmittelbar nach dem Systemstart vor beiden Läufen („failed to complete startup“), keinen weiteren nach der Übersteuerung. Beide Läufe setzten Größe und Dichte vollständig zurück. Das Skript schließt keine Systemdialoge; ein offener Dialog „System UI isn't responding“ muss vor dem Lauf von Hand mit „Wait“ geschlossen werden (nie „Close app“). Nach dem Schließen lieferten `tablet-7` Lauf 03 und 04 je vier bytegleiche Bilder 1080 × 1920 bei Dichte 320 und `tablet-10` Lauf 01 und 02 je vier bytegleiche Bilder bei Dichte 240; die Anzeigeumstellung war jeweils mit drei Proben bestätigt, die Rücksetzung auf 1080 × 2400 und Dichte 420 belegt, die Dauer je Lauf unter einer Minute. Sichtprüfung je Profil an einem Lauf: Bei Dichte 240 (720 dp Breite) zeigt Android die Taskleiste des Tablet-Layouts mit den Symbolen der Systemapps des Abbilds statt der Dreitasten-Navigation; das gehört zum Tablet-Bild. Die Spalten am rechten Rand des waagerecht rollbaren Tabellenbereichs sind wie bei den Telefonbildern abgeschnitten. Die Bilder aus `tablet-7` Lauf 03 und `tablet-10` Lauf 01 liegen als `fastlane/metadata/android/de-DE/images/sevenInchScreenshots/1.png` bis `4.png` und `tenInchScreenshots/1.png` bis `4.png` (gleich in `en-US`) im Repository.

### Stand vom 30.09.2026

Geprüft ist die App am Quellstand `b34b483` mit der Oberfläche über die Plattformschnittstelle und der Korrektur für große Schrift, auf den Abbildern `fr-api30`, `fr-api36` und `fr-api24`.

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

**Ausstehend:** Auf einem Gerät mit Build-Typ `user` ist am 01.10.2026 belegt, dass das Debugging der WebView im Release-Build aus ist; Dateiimport, Exporte, Teilen und Bestätigungsdialog sind dort von Hand geprüft (siehe „Prüfung auf einem Gerät“). Ein Wortlautprotokoll mit TalkBack liegt seit dem 03.10.2026 für die Menüleiste und einzelne Dateiwege vor; offen bleiben das Wortlautprotokoll für Formular, Berechnung, Ergebnis und Import (B2, B5 und B6 der Testmatrix), die übrigen Dateiwege mit TalkBack sowie weitere Geräte und Hersteller.

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
| `fr-api36` | 133.0.6943.137 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `dateien`, `menue`, `sicherung`, `alle`; Sicherung einschließlich Gerätewechsel |
| `fr-api30` | 83.0.4103.120 | `a`, `a8`, `a10`, `b`, `netz`, `navigation`, `dateien`, `menue`, `sicherung`, `fehlerseite`, `alle`; Sicherung ohne Gerätewechsel |
| `fr-api24` | 52 | `installation`, `alle`; erwartete Ablehnung mit `INSTALL_FAILED_OLDER_SDK` |

Der Lauf verwendet jeweils nur einen Emulator auf Port 5554 mit `-no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -gpu swiftshader_indirect`. Nach dem Systemstart wartet er zunächst 45 Sekunden und prüft vor dem ersten Ablauf auf einen Dialog der Systemoberfläche. Dieselbe Prüfung gilt vor der Activity-Wertung und vor Fotos: Eine oben liegende App-Activity schließt einen verdeckenden Systemdialog nicht aus. Erkennt der Rahmen „System UI isn't responding“, liest er den Ansichtsbaum und tippt ausschließlich auf die Mitte des Knotens mit exakt „Wait“ oder „Warten“. Pro Dialogprüfung sind höchstens drei Versuche mit erneuter Prüfung zulässig; Baum, Koordinaten und Ergebnis werden aufgezeichnet. Fehlt der passende Knoten oder bleibt der Dialog sichtbar, ist der Ablauf ungültig. „Close app“ und andere Knoten werden nie betätigt. Ein vollständiger Ansichtsbaum (`<hierarchy … </hierarchy>`) ist auch dann lesbar, wenn `uiautomator dump` nach dem Schreiben mit Rückgabewert 137 endet. Ein erfolgreiches Betätigen erscheint eigens als „Systemdialog mit Wait geschlossen“ im Ergebnis. Navigationsfotos und die Gegenprobe ohne Fehlerseite benötigen keinen UI-Automator-Baum; sie sind ergänzende Rohbelege. Umgebungsvariablen für SDK und Testgeräte gelten nur für den gestarteten Prozess.

| Prüfung | Umfang |
|---|---|
| Ablauf A, Debug über CDP | Start und Fehlerfalle, Formular und Berechnung mit Regelversion und Rechtsstand, Brückenaufruf, gespeicherte Eingaben nach `force-stop` und deren Löschung nach `pm clear`, Rechtsstandhinweis an der Grenze und am Folgetag, Navigation, Netz, Darstellung, Zurück-Taste und Barrierebaum. |
| Darstellung innerhalb von A | Bildschirmfotos bei Schriftgröße 1,3 und 2,0, Nachtmodus, gedrehtem Bildschirm und eingeblendeter Tastatur. Vergleich von `scrollWidth` und `clientWidth`; bei Überlauf zusätzlich Elemente mit Text und Maßen, außer dem zulässigen Tabelleninnenraum. Rotation mit begrenzten Wiederholungen und tatsächlicher Ansichtsrichtung. Tastatur mit Eingabedienst, sichtbarer IME-Fläche und Fokus auf dem Eingabefeld; ergänzende Sichtprüfung der Bilder. |
| Ablauf B, Release | Signierte Kopie der Release-APK im Ausgabeordner, Startbild und Fehlerfalle, Paketkennzeichen ohne `DEBUGGABLE` und `ALLOW_BACKUP`. Devtools-Sockets sind nur beim Build-Typ `user` als Release-Eigenschaft bewertbar. Netzmelder nach 60 Sekunden Ruhe, Hintergrund und Rückkehr. |
| Dateien, Debug und Release | Speichern und Teilen mit SHA-256 gegen die Bytes vor dem nativen Transport, Import über DocumentsUI, Fehlerfälle über den Testprovider, Fokus und Lebenszyklus, Freigaben und Cache-Bereinigung. UID-Netzbeobachtung während aller Dateiwege; anschließend bestehende Sicherungsprüfung. Lauf am 2026-10-01 auf fr-api30 (47 bestanden, 3 dokumentierte Grenzen) und fr-api36 (50 bestanden, 1 dokumentierte Grenze), siehe unten. |
| Menü, Debug und Release | Eigene Phase `menue`, auch in `alle`: Darstellung, Schließwege, Tastatur, Dateiaktionen, Sperre, Lebensdauer und Barrierebaum. Release ausschließlich über native Ansichts- und Activitybelege. Ergebnis vom 2026-10-02, Umfang und Grenzen siehe unten. |
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

### Menüphase auf API 30 und 36

**Ergebnis am eingefrorenen Stand (2026-10-15):** Geprüft wurden Debug `aecc556f…69f6` und Release `0645663f…2a02` aus dem Windows-Neubau. Nach Sichtprüfung der je 15 Bilder am 2026-10-16 ergab API 36 (17:13 bis 17:30 MESZ) 18 bestandene Befunde und 4 dokumentierte Grenzen, Rückgabewert 3. API 30 (17:30 bis 17:44 MESZ) ergab 16 bestandene Befunde, 4 dokumentierte Grenzen und einen ungültigen Fall, Rückgabewert 2. Die Grenzen betreffen M-4 teilen, M-5 bei beiden Schriftgrößen sowie `input swipe` und TalkBack. Auf API 30 blieb M-2 geste nach dem Umschalten auf Gestennavigation mit Neuerstellung der Activity ungültig. Ein vollständiger Gestenfall mit offenem Menü auf API 30 ist damit weiterhin nicht belegt.

**Ergebnis vom 2026-10-02** (Debug `e3fdd301…fcdf`, Release `2e95b5ac…2bb0`, Stand `0d84fd2`): **API 36 (WebView 133.0.6943.137):** 18 Befunde bestanden, 4 dokumentierte Grenzen, keiner nicht bestanden oder ungültig. Die Grenzen: M-4 teilen (das System öffnet einen Empfänger direkt oder hat keinen, die Teilen-Auswahl ist nicht sichtbar), M-5 bei beiden Schriftgrößen (Sperre nur im Hintergrund-DOM belegt, die Android-Auswahl verdeckt die App) und die allgemeine Grenze zu `input swipe` und TalkBack. 15 Bilder von Claude gesichtet; Neuauswertung mit Sichtprüfung Rückgabewert 3. **API 30 (WebView 83.0.4103.120):** 16 Befunde bestanden, 4 dokumentierte Grenzen wie auf API 36, 1 ungültig: M-2 geste blieb in zwei Läufen ungültig. Beobachtet wurde: Nach dem Umschalten auf Gestennavigation meldet der Beleg eine neue Activity bei unveränderter Seitenkennung, danach bestätigte die Probe die Menüöffnung nicht in der Messfrist; die Wischgeste wurde deshalb nicht ausgeführt. Die genaue Ursache ist nicht geklärt. Als Teilnachweis belegen die Zurück-Probe (F5, mit dem älteren Debug-Build `35fe571d…f9c1`) die Randgeste mit genau einem Callback und M-2 zurueck mit dem aktuellen Build das Schließen des Menüs über denselben Callback; ein vollständiger Gestenfall mit offenem Menü auf API 30 ist damit nicht belegt. Auf API 36 besteht M-2 geste. 15 Bilder gesichtet, Neuauswertung Rückgabewert 2. Laufzeit aus Beginn und Ende der Läufe: API 30 15:10 und 14:34 Minuten, API 36 18:09 Minuten. Am Endstand `2b7c396` (Debug `5ad312d5…6b50`, Release `3007fa7c…7d09`) wurde die Phase auf API 36 wiederholt: 18 bestanden, 4 dokumentierte Grenzen, 15 Bilder gesichtet, Neuauswertung Rückgabewert 3. Die Änderung zwischen beiden Ständen betrifft nur die Folgenzählung des Zurück-Adapters bei einer zweiten Instanz im selben Dokument und die Doku. Erste Läufe derselben Phase am Stand vor `4c11a2e` und `0d84fd2` fanden zwei echte Befunde: Export-Schaltflächen liefen im Querformat bei Schrift 2,0 über (korrigiert in `4c11a2e`), und WebView 83 meldete den Menüknopf wegen `aria-haspopup` als Auswahlliste (korrigiert in `0d84fd2`). Am 2026-10-03 sind mit dem Debug-Build auf einem Gerät mit Android 16 die abgebrochene Randgeste (je einmal bei offenem und geschlossenem Sheet) und TalkBack für Menüleiste, Sheet und einzelne Einträge geprüft; die Teilen-Auswahl erschien dort einmal aus dem Sheet (siehe [Prüfung auf einem Gerät](#prüfung-auf-einem-gerät)). Die Nachprobe N1 bis N4 am 03.10.2026 mit Debug `99bf031d…59b7` (Stand `4e21b7c`) auf dem Galaxy A17 ist im Geräteabschnitt belegt. Am Stand `27859db` (M5 und M5b; Debug `8d89775c…54df`, Release `ab18ee07…f1fa`) wurde die Phase am 2026-10-03 auf beiden Abbildern wiederholt. **API 36:** 17 bestanden, 4 dokumentierte Grenzen wie oben, keiner nicht bestanden oder ungültig; dieselben Menüfälle wie am Endstand vom 2026-10-02, dort kam ein bestandener Befund zum geschlossenen Systemdialog hinzu. 15 Bilder gesichtet, Neuauswertung Rückgabewert 3, Laufzeit 15:47 Minuten. Auf dem Bild vor dem Öffnen im Tastaturfall (`menue-tastatur-vor.png`) ist die Bildschirmtastatur nicht gezeichnet; die Messung desselben Schritts meldet sie sichtbar und gezeichnet, Rollstand und Feldlage gleichen dem Lauf vom 2026-10-02, auf dessen Bild das Feld oberhalb der Tastatur liegt. **API 30:** 16 bestanden, 4 dokumentierte Grenzen wie auf API 36, M-2 geste ungültig mit demselben Ablauf wie am 2026-10-02; 15 Bilder gesichtet, auf dem Tastaturbild liegt das Feld oberhalb der sichtbaren Tastatur; Neuauswertung Rückgabewert 2, Laufzeit 12:59 Minuten. Offen bleiben der Release-Build am Gerät, die Grenze M-5 und der Gestenfall mit offenem Menü auf API 30.

Ein Aufruf prüft zuerst den Debug-Build und danach die vorhandene Release-APK. Die Release-Kopie wird mit dem eingerichteten Android-Debugschlüssel wie in Ablauf B signiert; die Eingabe-APK bleibt unverändert. Für `menue` allein werden keine Testvarianten gebaut und keine zusätzlichen Pakete installiert. Erforderlich sind die vorhandenen APKs desselben Quellstands, das eingerichtete SDK, JDK und der Debugschlüssel. Es darf kein anderer Emulator laufen.

```powershell
node scripts/emulator-lauf.mjs --api 30 --ablauf menue --apk-debug app/android/app/build/outputs/apk/debug/app-debug.apk --apk-release app/android/app/build/outputs/apk/release/app-release-unsigned.apk --ausgabe scratchpad/paket-2.6/m3/api30-lauf1 --nur-argumente
node scripts/emulator-lauf.mjs --api 36 --ablauf menue --apk-debug app/android/app/build/outputs/apk/debug/app-debug.apk --apk-release app/android/app/build/outputs/apk/release/app-release-unsigned.apk --ausgabe scratchpad/paket-2.6/m3/api36-lauf1 --nur-argumente
```

Für die wirklichen Läufe `--nur-argumente` entfernen und die Abbilder nacheinander prüfen. Die Argumentprüfung greift weder auf APKs noch auf den Emulator zu. `menue` ist außerdem in `alle` für API 30 und 36 enthalten. API 24 lehnt `menue` ab; dort bleibt `alle` auf die Installationsablehnung beschränkt. Für `alle` gelten zusätzlich die Voraussetzungen der anderen Phasen einschließlich ihrer Testvarianten.

| Fall | Messung und Belege | Grenze |
|---|---|---|
| M-1 | Schrift 1,0 und 2,0; geschlossen oben und am Seitenende mit geöffneten App-Abschnitten; offen und bis zur letzten Aktion gerollt. DOM-Rechtecke, Elementbreiten und Bilder. Gesperrter Zustand unter M-5. | DOM-Maße ersetzen keine Sichtprüfung. Bei Breiten gilt 1 CSS-px Rundungstoleranz. Rollende Textfeldwerte und der Innenraum der Terminplantabelle sind ausgenommen; Datum, Auswahl und äußere Feldränder bleiben geprüft. |
| M-2 | X, Abdunklung, Zurück-Taste und abgeschlossene Randgeste mit nachgewiesenem Gestenmodus. Nach dem Umschalten erst System und App stabil erfassen, CDP bei Bedarf neu verbinden und Seite sowie Projekt erneut lesen. Eine Neuerstellung wird protokolliert. Erst nach bestätigter Menüöffnung wischen. Danach geschlossenes Sheet, App im Vordergrund, Fokus am Menüknopf, unveränderte Projektdaten und normaler Systemweg. | `input swipe` belegt keinen Abbruch einer Predictive-Back-Geste. |
| M-3 | Projektname über DOM-Rechteck und äußere WebView-Fläche fokussieren, unabhängig vom Eingabetext. Nahezu deckungsgleiche WebView-Knoten für Ansicht und Dokumentwurzel sind zulässig. Sichtbare Bildschirmtastatur durch Eingabedienst und IME-Fensterzustand belegen. Zustand nach Menüöffnung und jeden Zurück-Schritt mit Sheet, Fokus, Projektdaten und Activity erfassen. | Verschwindet die Tastatur beim Öffnen, folgen zwei Zurück-Schritte; bleibt sie sichtbar, zuerst nur Tastatur schließen, dann Sheet, zuletzt App. Bilder und Fensterrohtexte bleiben zur Sichtprüfung erhalten. |
| M-4 | Projekt über bisherige Schaltfläche und Sheet in Android speichern, Bytes bei derselben extern festgehaltenen Messzeit vergleichen; Excel teilen und abbrechen; Projekt aus Download importieren; deutschen Dialog für Neues Projekt abbrechen. Bestehende Dateihelfer, Statusregionen, Fokus und erneute Menübedienung. | Ohne Auswahl mehrerer Empfänger kann Android direkt einen Empfänger öffnen. Dann bleibt die Teilen-Auswahl eine dokumentierte Grenze. |
| M-5 | Bei echter offener Android-Speicherauswahl das normale Menü-DOM im Hintergrund erneut öffnen: acht gesperrte Einträge, Hinweis, Maße bis zur letzten Aktion, Schließen und identisches Brückenprotokoll ohne zweiten Auftrag. Anschließend Auswahl abbrechen und Rückkehr prüfen. Je Schriftfaktor eigener Fall. | Die Systemauswahl verdeckt die App. Hintergrund-DOM und Bild der Auswahl belegen keine sichtbare Bedienung des gesperrten Sheets. Keine künstlich angehaltene Brücken-Promise und keine Diagnosemethode in der App. |
| M-6 | Schriftwechsel bei offenem Sheet: neuer Seitenzeitpunkt, geschlossenes Sheet, Projekt erhalten, Zurück verlässt die App. Querformat mit Schrift 2,0: kein Überlauf, X und mindestens eine vollständige Aktion erreichbar; die Probe tippt die letzte Aktion und öffnet den echten Dialog. | Der kompakte Modus ist keine Voraussetzung. Exemplarische Neuerstellung und Drehung, keine vollständige Prüfung aller Android-Lebenszyklen. |
| M-7 | Vorhandene Release-APK signieren und installieren; Menü nativ öffnen; erstes Zurück schließt, zweites verlässt die App. Den sichtbaren Knopf über `text` oder `content-desc` „Dateiaktionen“ finden, unabhängig von seiner nativen Klasse. Paketkennzeichen, APK-Prüfsummen, uiautomator-Bäume, Bild und dumpsys. | Kein Devtools-Zugriff und keine Aussage über TalkBack-Fokus. |
| A10, Menü offen | Android-Ansichtsbäume beim Rollen und CDP-Barrierebaum: Dialog mit Namen „Dateiaktionen“, X „Schließen“, alle acht Aktionen; Hintergrund nicht als bedienbar. CDP-Knoten mit `hidden=true` samt Nachfahren bleiben wie ignorierte Knoten außerhalb der sichtbaren Auswertung. Eine Gegenprobe erkennt weiterhin sichtbare bedienbare Hintergrundknoten. | Bekannte Nichtverfügbarkeit von Accessibility-CDP ist eine dokumentierte Grenze. DOM oder uiautomator ersetzen weder die Dialogrolle im vollständigen Barrierebaum noch TalkBack. |

Die Phase verwendet `scripts/emulator/menue.mjs`, `menue-ui.mjs` und `menue-auswertung.mjs`. `menue-roh.json` enthält Schema 1, API, alle 17 Teilfälle, Rohbeobachtungen und Prüfsummen der Belege. Die konstruierten Prüfdaten in `scripts/emulator/fixtures/menue-schema1.json` sind keine Emulatorergebnisse. Fallkopien, Messungen, Ansichtsbäume, Tastatur- und Activitytexte liegen unter `menue/`; Datei- und Brückenbelege entstehen mit den vorhandenen Dateihelfern. Die 15 Bilder `menue-*.png` in der Laufwurzel werden über das bestehende `sichtpruefung.json` mit Name, Datum, Bemerkung und Bildprüfsumme gesichtet.

```powershell
node scripts/emulator-auswertung.mjs --lauf scratchpad/paket-2.6/m3/api30-lauf1 --ausgabe scratchpad/paket-2.6/m3/api30-neuauswertung
node scripts/emulator-auswertung.mjs --lauf scratchpad/paket-2.6/m3/api36-lauf1 --ausgabe scratchpad/paket-2.6/m3/api36-neuauswertung
```

Die Neuauswertung prüft Vollständigkeit, API, Fallkopien und unveränderte Belege; alte Ergebnisbehauptungen reichen nicht. Rückgabewerte: 0 vollständig bestanden, 1 nicht bestanden, 2 ungültig, 3 ausschließlich dokumentierte Grenzen, 4 Sichtprüfung ausstehend, gegebenenfalls zusätzlich Grenzen. Die Sperrprobe bleibt auch nach grüner Sichtprüfung eine Grenze. Der Rahmen stellt Schrift, Drehung, Tastatureinstellung und Navigation zurück, entfernt eigene Download-Dateien, Installationen und Weiterleitungen und beendet den Emulator. Fehlgeschlagenes Aufräumen wird gesondert gemeldet.

Gemessen am 2026-10-02: 14:34 und 15:10 Minuten auf API 30, 18:09 Minuten auf API 36 je Lauf, zuzüglich Sichtung und gegebenenfalls Wiederholung ungültiger Fälle. Langsame uiautomator-Abzüge oder Systemdialoge können den Lauf verlängern. Die beiden Abbilder dürfen wegen des gemeinsamen Emulatorports nicht parallel laufen.

### Dateiphase auf API 30 und 36

**Ergebnis am eingefrorenen Stand (2026-10-15):** Die Dateiphase auf API 36 lief von 17:45 bis 18:31 MESZ mit Debug `aecc556f…69f6` und Release `0645663f…2a02`. Das Ergebnis umfasst 51 bestandene Befunde einschließlich des geschlossenen Systemdialogs und eine dokumentierte Grenze, keine fehlgeschlagenen oder ungültigen Befunde; Rückgabewert 3. Ein Fehler ausschließlich beim Schließen des Zielstreams ließ sich weiterhin nicht zuverlässig auslösen. Die Sicherungsprüfung mit `standard` und die Prüfung des Gerätewechsels bestanden.

**Ergebnis am eingefrorenen Stand (2026-10-16):** Die Dateiphase auf API 30 (Android 11, `userdebug`, WebView 83.0.4103.120) lief von 07:21 bis 08:01 MESZ mit denselben APKs und ergab 47 bestandene Befunde, keine fehlgeschlagenen oder ungültigen Befunde und drei dokumentierte Grenzen; Rückgabewert 3. Grenzen bleiben der nicht zuverlässig auslösbare Schließfehler sowie die fehlenden auswertbaren UID-Zähler von `netstats` bei Debug und Release: Netzmelder und UID-Socketproben waren unauffällig, kurze Verbindungen zwischen den Proben sind damit nicht ausgeschlossen. Die Sicherungsprüfung mit `standard` bestand; ein Gerätewechsel wird auf API 30 nicht geprüft.

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
Echte Empfängerprogramme, TalkBack für die übrigen Dateiwege, Herstelleranbieter und voller Speicher
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

Erster Lauf auf einem Gerät am 01.10.2026 am Stand `b0c46bb` (Debug `dd19e14f…1988`, Release `5a8e751d…8699`): Samsung Galaxy A17 (SM-A176B), Android 16 (API 36), Build-Typ `user`, One UI 8.5, System-WebView 143.0.7499.192. Alle neun Befunde bestanden, Rückgabewert 0, ohne Anpassung an die Ausgaben von One UI: Die drei Gegenproben am Debug-Build wirkten, die Release-Kopie startete mit dem Formular in der nativen Ansicht, das Paket trägt weder `DEBUGGABLE` noch `ALLOW_BACKUP`, in drei Proben stand kein Devtools-Socket der WebView in `/proc/net/unix`, und der Abruf von `/json/version` endete in jeder Probe wie am Kontrollsocket. Damit ist auf diesem Gerät belegt, dass das Debugging der WebView im Release-Build aus ist. Beobachtungen am Gerät: Mit eingeschaltetem Auto Blocker von Samsung bleibt USB-Debugging in den Entwickleroptionen ausgegraut; das Umschalten des Auto Blockers verwirft die ADB-Freigabe des Rechners, die danach am Gerät erneut zu bestätigen ist. Die Belege des Laufs liegen außerhalb des Repositorys.

Prüfung von Hand am selben Tag mit der installierten Release-Kopie durch den Maintainer: Projektdatei, Excel und PDF über „Speichern unter“ in der Dateiauswahl von One UI nach `Download` gespeichert, Abbruch der Auswahl ohne Änderung; die Dateien wurden mit `adb pull` geholt und sind vollständig (gültige Projektdateien, vollständiges XLSX-Archiv, PDF mit Kopf und `%%EOF`). PDF an Gmail geteilt und im Entwurf geöffnet, Teilen des Projekts abgebrochen; gültige Projektdatei importiert, ungültiges UTF-8 abgewiesen bei unverändertem Formular, Abbruch der Auswahl ohne Änderung; Dialog zum Zurücksetzen mit „Abbrechen“ vorgewählt, Abbrechen und Zurück-Geste ohne Änderung, Bestätigung legt ein neues Projekt an. Das Geräteprotokoll enthält keine Fehlerzeile des App-Prozesses. TalkBack (Samsung TalkBack mit Samsung TTS) war rund zweieinhalb Minuten eingeschaltet; der Maintainer meldet keine Abweichung bei der Ansage der Felder, bei Berechnung, Export und Fokus. Ein Protokoll der Ansagen im Wortlaut wurde nicht geführt; B2, B5 und B6 der Testmatrix gelten damit als auf einem Gerät gesichtet, nicht als vollständig protokolliert. Nach dieser Sichtung ist der Hinweiskasten einschließlich Speicherstatus in der App unter den rechtlichen Hinweis gewandert (Prop `hinweisPosition` der Komponente). Bei der Prüfung der Menüleiste am 03.10.2026 wurde der Speicherstatus an der neuen Position beim Wischen vorgelesen (siehe unten); eine Live-Ansage nach einer Änderung durch Eingaben wurde dabei nicht ausgelöst.

Prüfung der Menüleiste am 03.10.2026 am Stand `c3c409e` mit dem Debug-Build `8735973a…9011`, per `adb install -r` über die zuvor installierte App; die Prüfsumme der installierten APK stimmt überein. Dasselbe Gerät mit One UI 8.5, inzwischen mit System-WebView 153.0.8010.36, Samsung TalkBack 16.2.00.13 mit Samsung TTS, Systemschrift 1,0. Mitgeschnitten wurden das Geräteprotokoll, Bildschirmfotos bei jeder Änderung (ohne TalkBack etwa alle 2 bis 4 Sekunden, mit TalkBack meist jede Sekunde) und im Teil mit TalkBack der DOM-Zustand über die Devtools der WebView, alles nur lesend. Die Prüfung ohne TalkBack stützt sich auf Geräteprotokoll und Bildschirmfotos. „Kam nicht“ heißt im Folgenden: auf keinem Bildschirmfoto zu sehen. Den Wortlaut der Ansagen liefert die TalkBack-Entwickleroption „Sprachausgabe anzeigen“ auf den Bildschirmfotos. Ansagen zur App standen in diesem Lauf auch bei der Protokollstufe VERBOSE nicht im Geräteprotokoll; dort erschien nur vereinzelt ein Text wie „TalkBack aktiviert“ in einer Fehlermeldung. `uiautomator` blieb bei eingeschaltetem TalkBack ungenutzt, weil UiAutomation Bedienungshilfedienste unterdrückt.

Ohne TalkBack, zuerst mit Schaltflächen-, dann mit Gestennavigation: Das Sheet schloss über X, die Abdunklung und die Zurück-Taste; die Taste löste genau einen Aufruf des Callbacks der App aus. Bei offenem Sheet zeigte eine abgebrochene Randgeste (einmal, vom linken Rand) nur den Pfeil des Systems: Das System meldete Beginn und Abbruch der Geste, die App erhielt kein Zurück, und das Sheet blieb offen. Die anschließend vollständige Geste schloss es mit genau einem Aufruf. Bei geschlossenem Sheet und Startbildschirm dahinter zeigte die Geste dessen Vorschau; abgebrochen blieb die App ohne Neuerstellung der Activity im Vordergrund, vollständig ausgeführt ging die über ihr Symbol gestartete App einmal in den Hintergrund. In den übrigen beobachteten Fällen mit geschlossenem Sheet beendete Android die Activity; dabei war die App jeweils zuvor per `adb shell am start` gestartet oder nach vorn geholt worden, zweimal lag zudem eine andere App dahinter. Die Ursache ist nicht geklärt; der Callback der App war in allen diesen Fällen nicht aktiv. Das Umschalten der Navigationsart baute die Activity neu auf.

Mit TalkBack, Ansagen im Wortlaut: TalkBack sagt den Menüknopf als „Minimiert, Dateiaktionen, Schaltfläche“ an (Zustand, Name, Rolle). Nach Doppeltippen liest TalkBack zuerst den Inhalt des Sheets in einem Zug („Dateiaktionen, Speichern, Projekt speichern unter, Excel speichern, PDF speichern, Teilen, Projekt teilen, Excel teilen, PDF teilen, Import, Projekt importieren, Neues Projekt“), danach „Fristenrechner“ und „Dateiaktionen, Überschrift 2“ (dreimal so beobachtet; der Fokusrahmen stand dabei auf der Überschrift, woher „Fristenrechner“ stammt, ist offen); das Wort „Dialog“ kam nicht. Beim Wischen folgen „Schließen, Schaltfläche“, der Bereich als eigener Halt („Region, Speichern, Überschrift 3, Liste, Teilen, Überschrift 3, Liste, Import, Überschrift 3, Liste, Liste, In Dateiaktionen“), „Speichern, Überschrift 3“, „Projekt speichern unter, Schaltfläche, 1 von 3, In der Liste, 3 Einträge“ und entsprechend die übrigen Einträge, „Import, Überschrift 3, Liste verlassen“ und „Neues Projekt, Schaltfläche“. Vor der Überschrift meldet TalkBack „Keine vorherige Standard“, nach „Neues Projekt“ „Keine weitere Standard“. Elemente der Leiste oder des Hintergrunds erreichte das Wischen nicht; nach „Keine weitere Standard“ hielt der nächste Wisch einmal auf der Webansicht als Ganzes („Webansicht, Nicht in Dateiaktionen“), danach begann das Sheet von vorn. Erkunden durch Berühren ist nicht geprüft. X schloss das Sheet; der Wisch mit zwei Fingern vom linken Rand und die TalkBack-Geste „nach unten, dann nach links“ schlossen es mit genau einem Zurück. Danach stand der TalkBack-Fokus jeweils auf dem Menüknopf. Die TalkBack-Geste kam als eingespeiste Zurück-Taste in der App an, der Wisch mit zwei Fingern als Systemgeste. „Projekt speichern unter“ führte mit TalkBack bis zur gespeicherten Datei in `Download`, einer gültigen Projektdatei; zurück in der App folgte „Projektdatei gespeichert., Status“, der Fokus stand am Menüknopf. Die Fortschrittsmeldung „Projektdatei wird erstellt …“ kam nicht. „PDF teilen“ öffnete die Teilen-Auswahl von Android; nach deren Schließen stand der Fokus am Menüknopf. Die Meldung „PDF zum Teilen bereitgestellt.“ kam nicht, stattdessen las TalkBack die Metazeile zur Projektdatei (`#project-file-meta`, damals mit Statusrolle; Befund 3). Der Dialog zu „Neues Projekt“ wird mit „Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?“ vorgelesen, der Fokus steht auf „Abbrechen“; die Ansage der Schaltflächen (in der Nachprobe N2 nur „Abbrechen“ belegt), Zurück und Bestätigen im Dialog sind mit TalkBack nicht geprüft. Der Speicherstatus unter dem rechtlichen Hinweis wird beim Wischen vorgelesen („Lokales Projekt geladen (03.10.2026, 16:50 Uhr).“).

Beim Gerätetest traten drei Befunde auf. (1) Die Leiste steht oben, folgt in der Lesereihenfolge aber auf den Rechner: Unmittelbar vor dem Kurztitel stehen der rechtliche Hinweis und der Hinweiskasten mit dem Speicherstatus (beobachtet beim Wischen vom Kurztitel nach links). Wer von oben wischt, erreicht „Dateiaktionen“ erst nach dem Rechner. (2) Nach „Abbrechen“ im Dialog zu „Neues Projekt“ stand der TalkBack-Fokus auf der gesamten Webansicht („Fristenrechner“, „Webansicht“), obwohl der DOM-Fokus am Menüknopf lag; nach der Speichern- und der Teilen-Auswahl stimmte er. (3) Nach dem Schließen des Sheets über die TalkBack-Geste und beim Start des Teilens las TalkBack die Metazeile zur Projektdatei vor („Projektdatei: Rechenkern 1.9.0 · Rechtsstand: Juli 2026, Status“); nach dem Schließen über X und über den Wisch mit zwei Fingern kam diese Ansage nicht (je ein Lauf; beim Wisch war die Seite ans Ende gerollt). Was die Ansage auslöst, ist nicht geklärt. Nicht geprüft sind der Sperrhinweis mit TalkBack (von Hand nicht erreichbar, solange die Android-Auswahl die App verdeckt), Schließen über die Abdunklung und Bestätigen von „Neues Projekt“ mit TalkBack, die übrigen Einträge mit TalkBack, TalkBack mit Schaltflächennavigation, eine abgebrochene Geste mit zwei Fingern, Tastatur, Escape, große Schrift, Querformat und Neuerstellung bei offenem Sheet am Gerät sowie der Release-Build mit Menüleiste am Gerät. Beobachtungen ohne Bezug zur App: Beim Einschalten zeigte TalkBack seine Anleitung beziehungsweise fragte nach dem Telefonzugriff (abgelehnt), und TalkBack blendete zeitweise oben seinen Hinweis zum Abschalten ein (Einstellung „Anleitung zum Deaktivieren von TalkBack anzeigen“), der die Leiste teilweise verdeckte. Die Belege liegen außerhalb des Repositorys.

Nachprobe der Korrekturen am 03.10.2026, 19:58 bis 20:07, mit dem Debug-Build `99bf031d…59b7` (Stand `4e21b7c`): Samsung Galaxy A17, Android 16, WebView 153.0.8010.36, Samsung TalkBack 16.2.00.13. Die Ansagen wurden über „Sprachausgabe anzeigen“ auf Bildschirmfotos erfasst, der DOM-Zustand per Devtools; die Belege liegen außerhalb des Repositorys. N1 bis N4 wurden je einmal ausgeführt. Beim Start der App vor N1 sagte TalkBack den Speicherstatus live an („Lokales Projekt geladen (03.10.2026, 16:50 Uhr)., Status“).

- **N1 Lesereihenfolge:** Kurztitel „Fristenrechner“ → nach rechts „Minimiert, Dateiaktionen, Schaltfläche“ → nach rechts „Fristenrechner Vergabe, Überschrift 1“ → „Projektdatei: Rechenkern 1.9.0 · Rechtsstand: Juli 2026“ (ohne „Status“). Bestanden.
- **N2 Fokus nach dem Dialog:** Menü → „Neues Projekt, Schaltfläche“ → Dialog mit vorgelesener Frage und „ABBRECHEN, Schaltfläche, Nicht in Dateiaktionen“ → „Abbrechen“ → TalkBack-Fokus auf dem Menüknopf, Ansagen „Fristenrechner“ und „Minimiert, Dateiaktionen, Schaltfläche“ (vorher „Webansicht“). Bestanden.
- **N3 Schließen über die TalkBack-Zurück-Geste bei offenem Sheet (Seite oben):** Sheet zu, „Minimiert, Dateiaktionen, Schaltfläche“, keine Ansage der Metazeile. Bestanden.
- **N4 „PDF teilen“ aus dem Sheet:** „PDF teilen, Schaltfläche, 3 von 3, In der Liste, 3 Einträge“, danach während der Android-Auswahl „PDF zum Teilen bereitgestellt., Status“ (vorher stattdessen die Metazeile); Auswahl mit der TalkBack-Zurück-Geste geschlossen, Fokus am Menüknopf, keine Ansage der Metazeile. Bestanden.

Damit ist Befund 1 auf diesem Gerät nachgeprüft: Die Leiste steht direkt nach ihrer Reserve im Body; Kurztitel und Menüknopf werden vor der Seitenüberschrift gelesen. Hintergrundsperre und Abbau erfassen sie weiterhin. **Befund 2 ist für den Menüweg korrigiert und durch N2 am Gerät belegt.** Der App-Adapter meldet den Fokus unmittelbar nach der Brückenantwort mit `blur()` und `focus({ preventScroll: true })` erneut, sofern das ursprüngliche Element noch verbunden und fokussiert ist. Bei „Abbrechen“ und „Zurücksetzen“ sendet Java die Antwort vor `dialog.dismiss()`; bei Zurück und anderen Abbrüchen schließt Android den Dialog zuerst, die Antwort folgt danach. In N2 (ein Lauf, „Abbrechen“ über den Menüweg) war die Fokusmeldung auf dem Galaxy A17 mit WebView 153.0.8010.36 und Samsung TalkBack 16.2.00.13 wirksam; für „Zurücksetzen“, Zurück im Dialog und andere Geräte ist sie nicht belegt. Ein inzwischen gewähltes Ziel wird nicht ersetzt.

Merkposten zum Formularweg: Die Schaltfläche „Neues Projekt“ im Formular wird während des Auftrags deaktiviert (auch auf der Website, schon vor dieser Änderung so). In einer Edge-Probe mit nachgebildeter nativer Antwort verlor sie dabei den DOM-Fokus an `body`, und nach dem Dialog war kein Bedienelement fokussiert; dieser Weg erhält deshalb keine erneute Fokusmeldung. Am Gerät, in WebView 83 und auf der Website ist das nicht beobachtet; es ist nicht Teil dieser Runde. Die Export-Schaltflächen werden vor Android-Auswahl beziehungsweise Chooser ebenfalls deaktiviert; ihr Fokusverhalten ist nicht geprüft.

Zu Befund 3: Bei aktivem Menü hat nur die Metazeile (`#project-file-meta`) keine Statusrolle und kein `aria-live` mehr. Das soll die zusätzliche Ansage beim Wiedererscheinen des Hintergrunds vermeiden; N3 und N4 belegen das beobachtete Verhalten auf diesem Gerät. Die Zeile bleibt sichtbar und lesbar; Schließen und Teilen schreiben ihren Text nicht neu. Ihr Wiedererscheinen im Barrierebaum ist eine plausible, weiterhin unbewiesene Ursache der früheren Ansage. `#storage-status` und frühere Meldungen unter verborgenen Vorfahren wurden am Gerät nicht erneut angesagt. Die eigentlichen Aktions- und Speichermeldungen bleiben ohne Wartezeit live, ebenso die Importmeldung mit Version und Rechtsstand (so im Code und in den DOM-Tests; am Gerät war in der Nachprobe davon nur „PDF zum Teilen bereitgestellt.“ zu sehen). Ohne Menü bleiben HTML und Website-Verhalten unverändert.

Entscheidung vom 03.10.2026: Die Metazeile bleibt bei aktivem Menü ohne Live-Region (in N3 und N4 je einmal am Gerät bestätigt); eine eigene Ansage des Migrationshinweises, etwa über eine zusätzliche Live-Region oder eine Meldung beim Import, ist nicht vorgesehen. **Nachteil:** Beim Import einer Projektdatei vor Rechenkern 1.9.0 wird der Migrationshinweis („… dadurch können sich Termine verschieben.“) bei aktivem Menü in der App nicht automatisch angesagt; er bleibt sichtbar und per Wischen lesbar. Ein Import einer älteren Projektdatei war nicht Teil der Nachprobe.

Weiterer Merkposten: `#app-startfehler` (`role="alert"`) und `#app-rechtsstand-hinweis` (`role="status"`) der App-Seite sind direkte Geschwister auf dem Pfad vom Sheet zum Body und erhalten beim Öffnen selbst `aria-hidden`. Im Normalbetrieb sind sie verborgen. Ob sie beim Schließen angesagt würden, ist nicht geprüft; der Rechtsstand-Hinweis erscheint ab dem 18.07.2027.

In der Nachprobe nicht erneut geprüft: X und Zwei-Finger-Wisch sowie „Projekt speichern unter“ mit der Speicherbestätigung; außerdem Formularweg „Neues Projekt“, Import einer älteren Projektdatei und Release-Build. Die übrigen oben genannten nicht geprüften Fälle bleiben offen, insbesondere „Zurücksetzen“, Zurück und Bestätigen im Dialog mit TalkBack. Die Emulatorphase `menue` ist am 2026-10-03 am Stand `27859db` auf API 30 und 36 wiederholt (siehe [Menüphase](#menüphase-auf-api-30-und-36)).

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
