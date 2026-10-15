# Arbeitspakete

Stand 2026-10-04 · geprüfter App-Endstand `5e6f230`, Nachweisstand `49dd420` · Go von Andreas Schmidt für Stufe 1 und Stufe 2 · Stufe 2 am 2026-10-04 abgenommen

## Überblick

| Stufe | Inhalt | Status |
|---|---|---|
| 1 | Fachlicher Zuschnitt und Pflegekonzept | bestätigt am 2026-09-27 |
| 2 | Technischer Nachweis: Android, F-Droid, Signierung | abgenommen am 2026-10-04 nach den Abschlussnachweisen vom 2026-10-03/04. Die Grenzen gelten als bekannte Einschränkungen, die Restpunkte stehen im [Bericht](stufe2-nachweis.md#restpunkte). |
| 3 | Pakete veröffentlichen, Website bindet sie ein | kein Go |
| 4 | Google Play: Konto, Store-Material auf Deutsch und Englisch, Einreichung | kein Go |
| 5 | F-Droid: Einreichung, Metadaten auf Deutsch und Englisch | kein Go |
| 6 | iOS | zurückgestellt |

## Stufe 1

| Nr. | Paket | Ergebnis |
|---|---|---|
| 1.1 | Zuschnitt Version 1 | `docs/zuschnitt-v1.md`, bestätigt |
| 1.2 | Pflegekonzept | `docs/pflegekonzept.md`, bestätigt |

## Vier Festlegungen, die vor dem ersten Commit gelten

1. **Übernahmeprüfung.** Jede Datei, die aus einem anderen Repository stammt, wird vor dem ersten Einchecken geprüft: Auswahl der Dateien, Rechte am Inhalt, interne Kommentare, Testdaten, Geheimnisse. Die `.gitignore` ersetzt diese Prüfung nicht.
2. **Lizenzen ab der ersten Abhängigkeit.** Geprüft werden npm-Pakete, Gradle-Abhängigkeiten, Plugins und Bilddateien. Lizenzhinweise Dritter bleiben erhalten.
3. **Versionen sind festgelegt,** bevor etwas installiert wird. Sie stehen in `docs/toolchain.md`.
4. **Das Signierkonzept steht,** bevor der erste Release-Build entsteht. Es steht in `docs/signierung.md`.

## Stufe 2

Ziel: nachweisen, dass die App auf diesem Weg baubar, F-Droid-tauglich und sauber signierbar ist. Am Ende steht eine lauffähige Testversion, keine Veröffentlichung.

| Nr. | Paket | Abnahme |
|---|---|---|
| 2.1 | **Werkzeuge und Versionen.** Festlegen und sperren: Capacitor mit Plugins, JDK 21, Node und npm, Astro, Android-Gradle-Plugin, Gradle-Wrapper, Android SDK mit Mindest-API und Ziel-API nach der aktuellen Vorgabe von Google Play. Danach einrichten: ein eigenes Projekt-SDK im Benutzerbereich mit Emulator und Systemabbildern ohne Google-Dienste. Ein vorhandenes JDK 21 wird mitgenutzt. Das Go ist erteilt, die Lizenzbedingungen des Android SDK bestätigt Andreas selbst. | `docs/toolchain.md` nennt alle Versionen, ein Beispielprojekt baut und startet im Emulator |
| 2.2 | **Gerüst.** `git init`, npm-Workspaces, Lizenzdatei Apache-2.0 im Originalwortlaut, README und Beitragsregeln mit den Befehlen für Build und Test, Checkliste der Übernahmeprüfung. | der erste Commit enthält nur geprüfte Dateien, Build und Tests laufen ohne private Dateien |
| 2.3 | **Kern übernehmen.** Dateien frisch kopieren, ohne Historie, Kommentare von internen Verweisen bereinigen. Die Schwellenwerte werden vollständig entfernt: die Tabelle, ihr Export in der Schnittstelle, der Import und der Testblock in den Tests sowie der Zusatz in der Angabe zum Rechtsstand. Der Rechtsstand wird als Datum im ISO-Format und als Anzeigetext geführt. | Typprüfung, Fachtests und Paket-Build grün, keine Schwellenwert-Beträge in den Dateien, Referenzfälle rechnen wie Kern 1.9.0 |
| 2.4 | **Oberfläche als Paket.** Astro-Komponente, Bedienlogik, Exporte. Schnittstellen für Speichern, Importieren, Exportieren, Teilen. Globale Styles und plattformabhängige Texte herauslösen. | Oberfläche läuft im Browser mit der Web-Implementierung, Prüfpunkte zur Barrierefreiheit aus der Testmatrix bestanden |
| 2.5 | **App-Projekt.** Kleines Astro-Projekt, statischer Build, Capacitor für Android. Alle Dateien gebündelt, Navigation zu entfernten Adressen in der WebView unterbunden, Sicherungsregeln gesetzt. | das Release-Manifest enthält weder die Berechtigung `INTERNET` noch andere unnötige Berechtigungen; Start, Berechnung, Speichern, Hinweise, Fehlerseite, Navigationssperre, Sicherung und Build laufen auf Emulatoren ohne Google-Dienste; bei eingeschaltetem Netzwerk baut die App keine Verbindung auf. Die Dateiabläufe nimmt 2.6 ab. Die Prüfung mit einem Screenreader läuft auf einem echten Gerät vor Stufe 4. |
| 2.6 | **Dateiabläufe und Datenschutz.** PDF, Excel und Projektdatei schreiben und teilen, Projektdatei über den Dateidialog laden, temporäre Dateien aufräumen. Datenschutzhinweise in `docs/datenschutz.md`, in der App offline lesbar. | siehe Abschnitt „Abnahme der Dateiabläufe" |
| 2.7 | **Lizenzen.** Liste aller Abhängigkeiten samt Transitivabhängigkeiten, Hinweise Dritter, Prüfskript. Beginnt mit 2.2. Vor Stufe 3 zusätzlich der tatsächliche Inhalt der npm-Pakete. | Liste ohne unfreie Lizenz und ohne proprietären Dienst, Hinweise vorhanden |
| 2.8 | **F-Droid-Nachweis.** Build-Rezept, zuerst mit einer Minimal-App, am Ende der vollständige, saubere Build unter Linux mit Scanner. Das geschieht lokal, ein öffentliches Repository ist dafür nicht nötig. | Build aus Quellen ohne Beanstandung des Scanners |
| 2.9 | **Signierung.** Eigener App-Signierschlüssel, getrennter Upload-Schlüssel, Ablage außerhalb des Repositorys, Sicherung. Der App-Signierschlüssel wird später in die App-Signatur von Google Play eingebracht, F-Droid nutzt den reproduzierbaren Build mit Entwicklersignatur. | APK reproduzierbar gebaut; Zertifikat geprüft; Sicherung des Schlüssels testweise wiederhergestellt; Update über eine installierte Version mit höherem Versionscode ohne Datenverlust |
| 2.10 | **Testmatrix und Bericht.** `docs/testmatrix.md` und `docs/stufe2-nachweis.md` mit Ergebnissen, Restpunkten und Empfehlung für Stufe 3 bis 5. | Bericht an Andreas |

### Stand der Pakete

| Nr. | Stand | Ergebnis |
|---|---|---|
| 2.1 | abgeschlossen am 2026-09-28 | `docs/toolchain.md` mit Nachweis, `scripts/` |
| 2.2 | Gerüst abgeschlossen am 2026-09-28; saubere Kopien am Endstand am 2026-10-03/04 geprüft | Projektgerüst mit Workspaces, `LICENSE`, `NOTICE`, README und Beitragsregeln auf Deutsch und Englisch, `docs/uebernahmepruefung.md`. Frische Windows-Kopie mit Node 22.23.2 und npm 10.9.8: Installation, Tests, Typprüfung, Build und Lizenzprüfung bestanden. Zwei frische Linux-Klone mit Node 24.21.0, npm 11.19.0 und strenger Werkzeugprüfung: Release-Builds bestanden; Tests und Lizenzprüfung in einem Klon bestanden. Quellen, Werkzeugstände und übersprungene Tests: [App-Buildnachweise](app.md). |
| 2.3 | abgeschlossen am 2026-09-28 | Rechenkern 1.9.0 unter `packages/kern` mit Tests und Referenzfällen, Nachweis in `docs/uebernahmepruefung.md` |
| 2.4 | Teil 1 am 2026-09-29, Teil 2 am 2026-09-30; Browser- und Exportvorarbeiten bis 2026-10-15 mit dokumentierten Grenzen | Oberfläche unter `packages/oberflaeche` mit eigenem Excel-Schreiber, Schnittstellen zur Plattform und Web-Adapter, auf die Komponente begrenzte Styles, `docs/testmatrix.md`. Browser-Vertrag und Webadapter sind ausgeführt, Darstellung und Tastatur mit Sichtprüfung dokumentiert; PDF-Kopf und Fußzeile sind korrigiert (`8b71938`, `64932cd`), die Exportsichtung ist bis 2026-10-15 dokumentiert; siehe [Testmatrix](testmatrix.md) und [Exportsichtung](testmatrix.md#exportsichtung). Offen bleiben die Handprüfungen und die Website-Einbindung sowie die Erneuerung der Nachweise beim Einfrieren; siehe [Restpunkte 3 bis 5 vor Stufe 3](stufe2-nachweis.md#vor-stufe-3). |
| 2.5 | Emulatorläufe am 2026-09-30 abgeschlossen, mit dokumentierten Grenzen; Gerätelauf am 2026-10-01 auf einem Galaxy A17 (Android 16) bestanden; abschließende Build-Nachweise am 2026-10-03/04 erbracht | App-Projekt unter `app` mit Android-Projekt, Build in einem Lauf mit den Prüfungen K1 bis K5 (`scripts/app-bauen.mjs`), Prüfung im Emulator auf Android 11 und 16 (`scripts/emulator-lauf.mjs`), unsignierte Release-APK am Endstand bytegleich zwischen Windows, Linux und lokalem F-Droid-Lauf. Quellen: [App-Buildnachweise](app.md) und [F-Droid-Nachweis](fdroid-build.md). Grenzen: ein Rechner, Windows ohne `--streng`, Gradle mit Netz, Debug-APKs zwischen Arbeitskopien nicht bytegleich, kein F-Droid-Buildserver. Weitere Ergebnisse und Ausstehendes in `docs/app.md`. Auf einem Gerät am 2026-10-01 belegt: Debugging der WebView im Release-Build aus; TalkBack gesichtet; ein Wortlautprotokoll liegt seit dem 2026-10-03 für Menüleiste und einzelne Dateiwege vor (siehe 2.6), für Formular, Berechnung und Ergebnis steht es noch aus. |
| 2.6 | Dateiabläufe C1 bis C6 am 2026-10-01 umgesetzt, freigegeben und am selben Tag auf einem Galaxy A17 von Hand geprüft; Nachtrag Menüleiste am 2026-10-02 umgesetzt und im Emulator geprüft, am 2026-10-03 auf dem Galaxy A17 mit dem Debug-Build, TalkBack und abgebrochener Zurück-Geste geprüft | „Speichern unter“ und getrenntes Teilen für Projektdatei, Excel und PDF, Import über die Android-Auswahl mit Grenze 1 MiB, deutscher Dialog zum Zurücksetzen, eigenes Android-Plugin ohne neue npm-Abhängigkeit (`app/src/adapters`, `app/android/.../io`). Emulatorphase `dateien` mit Testempfänger und Testprovider: Android 11 47 bestandene Befunde mit drei dokumentierten Grenzen, Android 16 50 mit einer (Schließfehler nicht provozierbar, UID-Zähler auf Android 11), siehe `docs/app.md`. `docs/datenschutz.md` aus einer Quelle in der App offline lesbar. Die sichtbaren Texte, der Datenschutztext und der enger gefasste Hinweistext der App sind am 2026-10-01 freigegeben. Der eigene XML-Leser der Quellprüfung ist am 2026-10-01 durch den Parser des JDK ersetzt (`scripts/XmlQuelle.java`). Die Prüfung auf einem Gerät ist am 2026-10-01 erfolgt, siehe `docs/app.md`. Nachtrag Menüleiste, umgesetzt am 2026-10-02: feste Leiste mit Kurztitel und Knopf „Dateiaktionen“, Bottom Sheet mit Speichern, Teilen, Import und Neues Projekt über dieselben Aktionen und dieselbe Sperre wie die bisherigen Schaltflächen, als Option `menue` der Komponente nur für die App (Website unverändert); Android-Zurück über ein eigenes kleines Plugin ohne neue Abhängigkeit (`MenueZurueckPlugin`), bei sichtbarer Tastatur schließt Zurück zuerst die Tastatur. Die Texte der Menüleiste sind am 2026-10-02 freigegeben. Emulatorphase `menue` auf Android 11 und 16, siehe `docs/app.md`. Die drei TalkBack-Befunde der Geräteprüfung vom 2026-10-03 sind mit Debug `99bf031d…59b7` (Stand `5b59dde`, Galaxy A17, Android 16, WebView 153.0.8010.36, Samsung TalkBack 16.2.00.13) anhand von N1 bis N4 je einmal nachgeprüft: Lesereihenfolge, Fokus nach Dialogabbruch über den Menüweg, TalkBack-Zurück und PDF-Teilen bestanden, siehe `docs/app.md`. Die Metazeile bleibt bei aktivem Menü ohne Live-Region; der Migrationshinweis beim Import älterer Projektdateien wird deshalb nicht automatisch angesagt, bleibt aber sichtbar und per Wischen lesbar. Die Emulatorphase `menue` ist am 2026-10-03 am Stand `1fdcf8b` auf Android 11 und 16 wiederholt, Ergebnis wie am 2026-10-02, siehe `docs/app.md`. Die abschließenden Build-Nachweise unter Windows, Linux und lokal mit F-Droid sind am 2026-10-03/04 erbracht; Quellen und Werkzeugstände: [App-Buildnachweise](app.md) und [F-Droid-Nachweis](fdroid-build.md). Offen sind Formularweg und weitere in `docs/app.md` als nicht geprüft genannte Fälle einschließlich Release-Build am Gerät. |
| 2.7 | npm-Lizenzprüfung am Endstand am 2026-10-03/04 bestanden | `scripts/check-licenses.mjs` mit Tests, [Lizenzen und Restarbeiten](lizenzen.md), `LICENSE` und `NOTICE` in den npm-Paketen. Die Metadatenprüfung wiederholt sich mit jeder neuen Abhängigkeit. Vollständige Fremdhinweise, Android-/Gradle-Lizenzen und die Prüfung des tatsächlichen Inhalts der npm-Pakete bleiben offen. |
| 2.8 | lokaler Lauf am Endstand am 2026-10-04 bestanden | Vollständige App am Nachweisstand `49dd420` mit fdroidserver 2.4.2-1, gezielter Bereinigung ohne `scandelete`, Scanner ohne Fehler und Auswertung ohne Beanstandung; unsignierte Release-APK bytegleich mit den Windows- und Linux-Builds. Quelle und Kennzahlen: [F-Droid-Nachweis](fdroid-build.md). Kein Build auf dem F-Droid-Buildserver, keine Annahme durch F-Droid. |
| 2.9 | N1, N4 und N5 am 2026-10-03/04 mit App bzw. Testfassung erbracht, mit Grenzen | N1: unsignierte Release-APK der App bytegleich. N4/N5: Testfassung mit eigener App-ID und Probeschlüssel; Projektstand im `localStorage` beim Update erhalten, Signaturübertragung geprüft. N2/N3 nur am Probeschlüssel belegt, echter Schlüssel und dessen Nachweise offen; N6 gehört zu Stufe 4. Probeschlüssel und Probesicherung am 2026-10-04 gelöscht. Quelle, Werkzeugstände und Grenzen: [Signierungsnachweise](signierung.md). |
| 2.10 | abgeschlossen am 2026-10-04, Bericht abgenommen | [Testmatrix](testmatrix.md) und [Bericht zur Abnahme](stufe2-nachweis.md) mit Ergebnissen, Grenzen, Restpunkten und Empfehlung für Stufe 3 bis 5. |

Ergebnis aus Paket 2.1 für Paket 2.5: Das Systemabbild mit Android 7.0 bringt eine System-WebView mit, die Capacitor nicht unterstützt. Paket 2.5 hat deshalb festgelegt: Die App verlangt Android 11 (API 30) und eine WebView ab Version 83; ist die WebView älter, zeigt die App eine Fehlerseite. Einzelheiten in `docs/app.md` und in `docs/toolchain.md`, Abschnitt „Bekannte Einschränkungen".

### Pflegeposten nach Browser- und Exportsichtung

- Im PDF prüfen, ob die Zeitschiene nach einer kurzen Tabellenfortsetzung auf derselben Seite beginnen kann; die bisherige einzelne Tabellenzeile auf Seite 2 ist als Layoutgrenze angenommen ([Testmatrix B14 und Exportsichtung](testmatrix.md#exportsichtung)).
- Exportdateinamen bei langen Vergabenummern kürzen oder ihre Länge begrenzen: Etwa 134 Zeichen Dateiname können mit einem tiefen Ordnerpfad die Excel-Pfadgrenze von 218 Zeichen erreichen ([Testmatrix B14 und Exportsichtung](testmatrix.md#exportsichtung)).
- Kürzere Optionsbezeichnungen für „Vergabeordnung“ und „Versand der Bieterinformation“ prüfen; die sichtbaren Texte wirken auf Website und Exporte und brauchen Textprüfung und Freigabe ([Testmatrix B7](testmatrix.md)).
- Konfliktmeldungen programmatisch mit dem betroffenen Feld verknüpfen (`aria-describedby`/`aria-invalid`); das ist eine Verbesserung für Screenreader, kein Befund nach B4 ([Testmatrix B4](testmatrix.md)).

### Reihenfolge

1. 2.1, dann 2.2, dann 2.3.
2. 2.7 beginnt zusammen mit 2.2.
3. Signierkonzept und F-Droid-Probe mit der Minimal-App früh, direkt nach 2.2. Ein falsch gewählter Schlüssel verhindert später Updates zwischen den Stores.
4. 2.4 bis 2.6 bauen aufeinander auf.
5. Der vollständige F-Droid-Build und der Nachweis der Reproduzierbarkeit stehen am Ende.

### Abnahme der Dateiabläufe

| Prüfpunkt | Erwartung |
|---|---|
| Projektdatei exportieren und wieder laden | Inhalt unverändert |
| Projektdatei einer älteren Version | bleibt lesbar |
| Neuberechnung mit neuerer Regelversion | die App weist auf den Versionswechsel hin |
| Beschädigte oder zu große Datei | verständliche Meldung, kein Absturz |
| Abbruch im Dateidialog oder beim Teilen | App bleibt bedienbar |
| Keine passende Ziel-App, Speicher voll | verständliche Meldung |
| Neustart der App während eines Ablaufs | keine verlorenen oder halben Dateien |
| PDF und Excel | Umlaute, Seitenumbrüche, Rechtsstand und Regelversion korrekt |
| Dateizugriff | nur auf Dateien, die der Nutzer ausgewählt hat |

### Testmatrix

| Bereich | Inhalt |
|---|---|
| Referenzfälle | Berechnungen gegen Kern 1.9.0, mit Feiertagen und Datumsgrenzen |
| Geräte | Browser, Emulator ohne Google-Dienste mit Android in der Mindestversion (Android 11) und in der für die Prüfungen gewählten neueren Version (Android 16). Das Abbild mit Android 7.0 dient nur der Gegenprobe, dass die Installation abgelehnt wird. Erste Prüfungen auf einem echten Gerät sind erfolgt; weitere stehen vor Stufe 4 aus, siehe [Geräteprüfung](app.md#prüfung-auf-einem-gerät). |
| Barrierefreiheit | Screenreader, Fokusführung, Beschriftung der Felder und Fehlermeldungen, große Schrift, Kontrast, Bedienung bei eingeblendeter Tastatur |
| Hinweis zum Rechtsstand | Monatsende, Schaltjahr, Zeitzonen, verstellte Uhr, Start und Wiederaufnahme der App |

### Bekannte Fallen

| Thema | Hinweis |
|---|---|
| Exporte | Der Ausgangscode erzeugte Browser-Downloads. Die App nutzt inzwischen native Dateiabläufe; der Web-Adapter stellt weiterhin Browser-Downloads bereit. Stand und Grenzen: [Dateiabläufe](app.md#dateiabläufe-speichern-unter-teilen-import-und-dialog-nativ). |
| Binärdaten | PDF und Excel korrekt an das Dateisystem übergeben, Dateityp und Dateiname setzen, Abbruch behandeln. |
| Globale Styles | Die Oberfläche nutzte auf der Website globale CSS-Variablen und globale Klassen. Seit Paket 2.4 Teil 2 gelten alle Regeln nur unter der Komponente, die Variablen haben Vorgabewerte. Die Druckregeln der Website gehören ins Website-Projekt. |
| Sicherung | Das Abschalten der Sicherung im Manifest deckt nicht jede Übertragung auf ein neues Gerät ab. Cloud-Sicherung und Gerätewechsel getrennt regeln. |
| F-Droid unter Windows | Die Werkzeuge laufen unter Linux. WSL oder Container einplanen. |
| App-Bundle und APK | Google Play erwartet ein App-Bundle, F-Droid baut eine APK. Beides getrennt betrachten. |
| Netzwerk beim Bauen | Der Build lädt Werkzeuge und Abhängigkeiten. Das ist vom zugesagten Betrieb ohne Netzwerk zu trennen. |

## Aufgaben für Andreas (außerhalb des Codes)

| Aufgabe | Wann nötig |
|---|---|
| Lizenzbedingungen des Android SDK bei der Installation bestätigen | Paket 2.1 |
| Windows-Funktion „Windows-Hypervisor-Plattform" für den Emulator einschalten | Paket 2.1 |
| Linux-Umgebung für die Werkzeuge von F-Droid freigeben (WSL 2 oder Container) | Paket 2.8, die frühe Probe folgt direkt auf Paket 2.2 |
| Ein Android-Gerät für den Test bereitstellen | vor Stufe 4 |
| Go für das öffentliche Repository `baremos/fristenrechner` auf GitHub | vor Stufe 3, für den lokalen F-Droid-Nachweis nicht nötig |
| npm-Organisation `baremos` anlegen | vor Stufe 3 |
| Google-Play-Organisationskonto mit D-U-N-S, einmalig 25 USD | vor Stufe 4, Verifizierung kann dauern |

## Erste Sitzung im neuen Projekt

1. `CLAUDE.md` und die lokalen Hinweise lesen.
2. Paket 2.1: Versionen festlegen, Kreuz-Review, dann installieren.
3. Pakete 2.2 und 2.3 umsetzen, jeweils mit Kreuz-Review.
