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
| Oberfläche | folgt |
| Android-App | folgt |

Die Arbeitspakete stehen in [docs/arbeitspakete.md](docs/arbeitspakete.md). Die Dokumente im Ordner `docs` sind deutsch.

## Was die Software rechnen wird

Dieser Abschnitt beschreibt den Umfang von Version 1. Im Repository ist bisher der Rechenkern umgesetzt, Oberfläche und App folgen.

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

Der Ordner `packages/kern` enthält den Rechenkern. Oberfläche und App sind noch nicht umgesetzt, die Tabelle nennt den vorgesehenen Inhalt.

| Ordner | Inhalt | Paketname |
|---|---|---|
| `packages/kern` | Rechenkern, TypeScript ohne Abhängigkeiten, mit Tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | Oberfläche, Bedienlogik, Exporte | `@baremos/fristenrechner-ui` |
| `app` | Astro-Projekt mit Capacitor für Android | App-ID `de.baremos.fristenrechner` |
| `scripts` | Skripte für Einrichtung, Build und Prüfung | – |
| `docs` | Festlegungen und Nachweise | – |

Website und App sollen denselben Rechenkern und dieselbe Oberfläche nutzen.

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

| Schritt | Befehl | Stand |
|---|---|---|
| Abhängigkeiten installieren | `npm ci` | läuft |
| Tests | `npm test` | läuft, prüft die Skripte, den Rechenkern und die Oberfläche |
| Typprüfung | `npm run check` | läuft für den Rechenkern und die Oberfläche |
| Build der Pakete | `npm run build` | läuft für den Rechenkern |
| Lizenzen der Abhängigkeiten prüfen | `npm run lizenzen` | läuft, siehe [docs/lizenzen.md](docs/lizenzen.md) |
| Werkzeuge für den Android-Build prüfen | `node scripts/android-build.mjs --nur-pruefen` | braucht das Android-Projekt unter `app/android`, es folgt mit der App |
| Android-App bauen | `node scripts/android-build.mjs` | braucht das Android-Projekt unter `app/android`, es folgt mit der App |

Build und Tests brauchen keine privaten Dateien. `npm ci` lädt die Abhängigkeiten aus dem Netz, der Android-Build lädt zusätzlich seine Werkzeuge. Die App selbst soll im Betrieb nicht auf das Netzwerk zugreifen.

## Pflege der Regeln

Eine installierte App bleibt auf dem Stand, den der Nutzer zuletzt geladen hat. [docs/pflegekonzept.md](docs/pflegekonzept.md) legt deshalb fest, wer die Fristenregeln prüft, wann das geschieht und wie eine Änderung bei den Nutzern ankommt. Fachlich verantwortlich ist Andreas Schmidt, BAREMOS IT GmbH.

## Mitwirken

Fehlermeldungen und Beiträge sind willkommen. Der Ablauf steht in [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

Apache License 2.0. Der Wortlaut steht in der Datei [LICENSE](LICENSE). Die Datei [NOTICE](NOTICE) nennt den Herausgeber.
