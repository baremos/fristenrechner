# Mitwirken

Danke für das Interesse am Fristenrechner Vergabe. Diese Seite beschreibt, wie Beiträge ablaufen.

[English version](CONTRIBUTING.en.md)

## Was das Projekt ist

Eine Rechenhilfe für Fristen in Vergabeverfahren nach deutschem Recht. Die Software ist unverbindlich, ersetzt keine Rechtsberatung, und alle Angaben erfolgen ohne Gewähr. Herausgeber ist die BAREMOS IT GmbH, die Lizenz ist Apache-2.0.

## Fehler melden und Vorschläge machen

Bitte ein Issue anlegen. Hilfreich sind:

- die gewählte Vergabeordnung und Verfahrensart,
- die eingegebenen Daten,
- das erwartete und das tatsächliche Ergebnis,
- die Rechtsgrundlage, auf die sich die Erwartung stützt.

## Änderungen einreichen

1. Repository forken und einen Branch anlegen.
2. Änderung umsetzen, mit Test.
3. Build und Tests lokal ausführen.
4. Pull Request stellen und beschreiben, was sich ändert und warum.

## Regeln für fachliche Änderungen

- Jede Fristenregel nennt ihre Rechtsgrundlage mit Fundstelle.
- Jede Änderung einer Regel hat einen Test, der sie belegt.
- Kein Wert wird geschätzt. Fehlt eine belastbare Quelle, bleibt die Regel unverändert.
- Regelversion und Rechtsstand hebt nur der fachlich Verantwortliche an.

## Regeln für Abhängigkeiten

Die App soll bei F-Droid erscheinen. Jede Abhängigkeit muss frei lizenziert sein und ohne proprietäre Dienste auskommen. Die App greift im Betrieb nicht auf das Netzwerk zu.

## Regeln für Texte

Texte beschreiben, was die Software rechnet. Sie versprechen keine Rechtssicherheit und keine Beratung. Die Maintainer prüfen jeden öffentlichen Text vor der Veröffentlichung und passen Formulierungen bei Bedarf an.

## Regeln für übernommene Dateien

Dateien aus anderen Quellen werden vor dem ersten Einchecken geprüft. Die Prüfpunkte stehen in [docs/uebernahmepruefung.md](docs/uebernahmepruefung.md).

## Build und Test

| Schritt | Befehl |
|---|---|
| Abhängigkeiten installieren | `npm ci` |
| Tests | `npm test` |
| Typprüfung | `npm run check` |
| Build der Pakete | `npm run build` |
| Werkzeuge für den Android-Build prüfen | `node scripts/android-build.mjs --nur-pruefen` |

Die Befehle funktionieren ohne private Dateien. Die Versionen der Werkzeuge stehen in [docs/toolchain.md](docs/toolchain.md).

- Abhängigkeiten stehen mit exakter Version in den Manifesten. Änderungen am Lockfile entstehen mit der Referenzversion von npm.
- Eine neue Version wird erst übernommen, wenn sie mindestens sieben Tage veröffentlicht ist.
- Installationsskripte von Paketen laufen nicht.

## Lizenz der Beiträge

Beiträge stehen unter derselben Lizenz wie das Projekt, Apache-2.0.
