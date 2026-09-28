# Fristenrechner Vergabe

Rechenhilfe für Termine und Fristen in Vergabeverfahren nach deutschem Recht. Herausgeber ist die BAREMOS IT GmbH, Berlin.

[English version](README.en.md)

> Der Fristenrechner ist eine unverbindliche Rechenhilfe. Er ersetzt keine Rechtsberatung. Alle Angaben erfolgen ohne Gewähr.

## Stand

Das Repository ist im Aufbau. Es gibt noch keine Veröffentlichung.

| Teil | Stand |
|---|---|
| Werkzeuge und Versionen | festgelegt, siehe [docs/toolchain.md](docs/toolchain.md) |
| Projektgerüst | vorhanden |
| Rechenkern | folgt |
| Oberfläche | folgt |
| Android-App | folgt |

Die Arbeitspakete stehen in [docs/arbeitspakete.md](docs/arbeitspakete.md).

## Was die Software rechnet

Aus den Eingaben entsteht ein Termin- und Fristenplan für ein Vergabeverfahren. Version 1 rechnet dasselbe wie der Fristenrechner auf www.baremos.de. Den Umfang legt [docs/zuschnitt-v1.md](docs/zuschnitt-v1.md) fest.

| Bereich | Inhalt |
|---|---|
| Vergabeordnungen | VgV, VOB/A-EU, SektVO, VSVgV, KonzVgV, UVgO, VOB/A |
| Auswahl | Vergabeordnung und Verfahrensart wählt der Nutzer selbst |
| Feiertage | gesetzliche Feiertage je Bundesland, berechnet ohne Netzwerkzugriff |
| Ausgabe | PDF, Excel und Projektdatei |
| Nachvollziehbarkeit | Jede Berechnung und jeder Export nennt Regelversion und Rechtsstand |

## Was die Software nicht tut

- Sie erinnert nicht an Termine und sendet keine Benachrichtigungen.
- Sie wählt die Vergabeordnung nicht selbst aus dem Auftragswert.
- Sie enthält keine Beträge der EU-Schwellenwerte.
- Sie kennt keine Konten, keine Anmeldung und keine Synchronisation.
- Sie enthält kein Tracking, keine Werbung und keine Analyse.
- Sie greift im Betrieb nicht auf das Netzwerk zu.

## Aufbau

| Ordner | Inhalt | Paketname |
|---|---|---|
| `packages/kern` | Rechenkern, TypeScript ohne Abhängigkeiten, mit Tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | Oberfläche, Bedienlogik, Exporte | `@baremos/fristenrechner-ui` |
| `app` | Astro-Projekt mit Capacitor für Android | App-ID `de.baremos.fristenrechner` |
| `scripts` | Skripte für Einrichtung, Build und Prüfung | – |
| `docs` | Festlegungen und Nachweise | – |

Website und App nutzen denselben Rechenkern und dieselbe Oberfläche.

## Voraussetzungen

| Werkzeug | Version |
|---|---|
| Node.js | 24.21.0 als Referenz, unterstützt sind die Reihe 22 ab 22.23.2 und die Reihe 24 ab 24.18.1 |
| npm | 11.19.0 als Referenz, `npm ci` läuft auch mit npm 10.9 |
| JDK | 21, eine freie OpenJDK-Distribution, für den Android-Build und die Tests der Skripte |
| Android SDK | eigenes Projekt-SDK, Einrichtung siehe [docs/toolchain.md](docs/toolchain.md) |

Alle Versionen und ihre Begründung stehen in [docs/toolchain.md](docs/toolchain.md).

## Build und Test

| Schritt | Befehl |
|---|---|
| Abhängigkeiten installieren | `npm ci` |
| Tests | `npm test` |
| Typprüfung | `npm run check` |
| Build der Pakete | `npm run build` |
| Werkzeuge für den Android-Build prüfen | `node scripts/android-build.mjs --nur-pruefen` |
| Android-App bauen | `node scripts/android-build.mjs` |

Build und Tests brauchen keine privaten Dateien. Der Build lädt Werkzeuge und Abhängigkeiten aus dem Netz. Die App selbst greift im Betrieb nicht auf das Netzwerk zu.

## Pflege der Regeln

Eine installierte App bleibt auf dem Stand, den der Nutzer zuletzt geladen hat. [docs/pflegekonzept.md](docs/pflegekonzept.md) legt deshalb fest, wer die Fristenregeln prüft, wann das geschieht und wie eine Änderung bei den Nutzern ankommt. Fachlich verantwortlich ist Andreas Schmidt, BAREMOS IT GmbH.

## Mitwirken

Fehlermeldungen und Beiträge sind willkommen. Der Ablauf steht in [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

Apache License 2.0. Der Wortlaut steht in der Datei [LICENSE](LICENSE), der Urhebervermerk in der Datei [NOTICE](NOTICE).
