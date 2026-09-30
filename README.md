# Fristenrechner Vergabe

Rechenhilfe für Termine und Fristen in Vergabeverfahren (Ausschreibungen) nach deutschem Recht: VgV, VOB/A, SektVO, UVgO und weitere Vergabeordnungen. Herausgeber ist die BAREMOS IT GmbH, Berlin. Der englische Name lautet „Procurement Deadline Calculator (Germany)“.

[English version](README.en.md)

> Der Fristenrechner ist eine unverbindliche Rechenhilfe. Er ersetzt keine Rechtsberatung. Alle Angaben erfolgen ohne Gewähr.

Die Oberfläche der App und ihre Exporte sind deutsch. Der Fristenrechner folgt dem deutschen Vergaberecht, seine Fachbegriffe sind deutsch.

## Stand

Das Repository ist im Aufbau. Es gibt noch keine Veröffentlichung.

| Teil | Stand |
|---|---|
| Werkzeuge und Versionen | festgelegt, siehe [docs/toolchain.md](docs/toolchain.md) |
| Projektgerüst | vorhanden |
| Rechenkern | vorhanden, mit Tests und Referenzfällen |
| Oberfläche | vorhanden, mit Schnittstellen für Speichern, Importieren und Exportieren |
| Android-App | baut und läuft im Emulator; Exportieren, Teilen und Importieren von Dateien folgen |

Die Arbeitspakete stehen in [docs/arbeitspakete.md](docs/arbeitspakete.md). Die Dokumente im Ordner `docs` sind deutsch.

## Was die Software rechnen wird

Dieser Abschnitt beschreibt den Umfang von Version 1. Im Repository sind der Rechenkern, die Oberfläche und das App-Projekt für Android umgesetzt. In der App fehlen noch die Dateiabläufe: Exportieren, Teilen und Importieren.

Aus den Eingaben entsteht ein Termin- und Fristenplan für ein Vergabeverfahren. Version 1 rechnet dasselbe wie der [Fristenrechner auf www.baremos.de](https://www.baremos.de/de/vergabe/fristenrechner/). Den Umfang legt [docs/zuschnitt-v1.md](docs/zuschnitt-v1.md) fest.

| Bereich | Inhalt |
|---|---|
| Vergabeordnungen | VgV, VOB/A-EU, SektVO, VSVgV, KonzVgV, UVgO, VOB/A |
| Auswahl | Vergabeordnung und Verfahrensart wählt der Nutzer selbst |
| Feiertage | gesetzliche Feiertage je Bundesland, berechnet ohne Netzwerkzugriff |
| Ausgabe | PDF, Excel und Projektdatei |
| Nachvollziehbarkeit | Jede Berechnung und jeder Export nennt Regelversion und Rechtsstand |

## Was die Software nicht tun wird

- Sie erinnert nicht an Termine und sendet keine Benachrichtigungen.
- Sie wählt die Vergabeordnung nicht selbst aus dem Auftragswert.
- Sie enthält keine Beträge der EU-Schwellenwerte.
- Sie kennt keine Konten, keine Anmeldung und keine Synchronisation.
- Sie enthält kein Tracking, keine Werbung und keine Analyse.
- Sie greift im Betrieb nicht auf das Netzwerk zu.

## Aufbau

Die Tabelle nennt die Ordner und ihren Inhalt. Die App ist in [docs/app.md](docs/app.md) beschrieben.

| Ordner | Inhalt | Paketname |
|---|---|---|
| `packages/kern` | Rechenkern, TypeScript ohne Abhängigkeiten, mit Tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | Oberfläche, Bedienlogik, Exporte | `@baremos/fristenrechner-ui` |
| `app` | Astro-Projekt mit Capacitor für Android | App-ID `de.baremos.fristenrechner` |
| `scripts` | Skripte für Einrichtung, Build und Prüfung | – |
| `docs` | Festlegungen und Nachweise | – |

Website und App sollen denselben Rechenkern und dieselbe Oberfläche nutzen. Die Oberfläche kennt keine Plattform: Speichern, Importieren und Exportieren übergibt ihr das einbindende Projekt.

## Voraussetzungen

| Werkzeug | Version |
|---|---|
| Node.js | 24.21.0 als Referenz, unterstützt sind die Reihe 22 ab 22.23.2 und die Reihe 24 ab 24.18.1 |
| npm | 11.19.0 als Referenz, `npm ci` läuft auch mit npm 10.9 |
| JDK | 21, eine freie OpenJDK-Distribution, für den Android-Build und die Tests der Skripte |
| Android SDK | eigenes Projekt-SDK, Einrichtung siehe [docs/toolchain.md](docs/toolchain.md) |
| Python | 3.9 oder neuer, für die Skripte unter Linux und für einen Teil der Tests der Skripte. Fehlt es, entfallen diese Tests. |

Alle Versionen und ihre Begründung stehen in [docs/toolchain.md](docs/toolchain.md).

## Build und Test

| Schritt | Befehl | Hinweis |
|---|---|---|
| Abhängigkeiten installieren | `npm ci` | – |
| Tests | `npm test` | prüft die Skripte, den Rechenkern, die Oberfläche und die App |
| Typprüfung | `npm run check` | Rechenkern, Oberfläche und App |
| Build der Pakete und der Seite der App | `npm run build` | prüft dabei die Konfiguration und die gebauten Web-Dateien der App |
| Lizenzen der Abhängigkeiten prüfen | `npm run lizenzen` | siehe [docs/lizenzen.md](docs/lizenzen.md) |
| Werkzeuge für den Android-Build prüfen | `node scripts/android-build.mjs --nur-pruefen` | braucht JDK und Projekt-SDK |
| Android-App bauen, Debug | `node scripts/app-bauen.mjs --android` | Web-Build, Übertragung nach Android, Gradle und die Prüfungen der Build-Kette in einem Lauf |
| Android-App bauen, Release ohne Signatur | `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` | mit `--streng` nur, wenn Node, JDK und die Pakete des SDK der Festlegung entsprechen; die Version von npm prüft der Build nicht |
| App im Emulator prüfen | `node scripts/emulator-lauf.mjs` | unter Windows, Aufruf und Umfang in [docs/app.md](docs/app.md) |

Build und Tests brauchen keine privaten Dateien. `npm ci` lädt die Abhängigkeiten aus dem Netz, der Android-Build lädt zusätzlich seine Werkzeuge. Die App selbst hat keine Berechtigung für den Netzwerkzugriff. Was dazu im Emulator geprüft ist und was nicht, steht in [docs/app.md](docs/app.md).

## Pflege der Regeln

Eine installierte App bleibt auf dem Stand, den der Nutzer zuletzt geladen hat. [docs/pflegekonzept.md](docs/pflegekonzept.md) legt deshalb fest, wer die Fristenregeln prüft, wann das geschieht und wie eine Änderung bei den Nutzern ankommt. Fachlich verantwortlich ist Andreas Schmidt, BAREMOS IT GmbH.

## Mitwirken

Fehlermeldungen und Beiträge sind willkommen. Der Ablauf steht in [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

Apache License 2.0. Der Wortlaut steht in der Datei [LICENSE](LICENSE). Die Datei [NOTICE](NOTICE) nennt den Herausgeber.
