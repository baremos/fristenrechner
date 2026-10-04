# Mitwirken

Danke für das Interesse am Fristenrechner Vergabe. Diese Seite beschreibt, wie Beiträge ablaufen.

[English version](CONTRIBUTING.en.md)

## Was das Projekt ist

Eine Rechenhilfe für Fristen in Vergabeverfahren nach deutschem Recht. Die Software ist unverbindlich, ersetzt keine Rechtsberatung, und alle Angaben erfolgen ohne Gewähr. Herausgeber ist die BAREMOS IT GmbH, die Lizenz ist Apache-2.0.

Die Oberfläche und die Dokumente im Ordner `docs` sind deutsch. Issues und Pull Requests sind auf Deutsch und auf Englisch willkommen.

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
- Die Referenzdateien unter `packages/kern/test/referenz` halten fest, was der Rechenkern rechnet. Wer eine Regel ändert, schreibt sie mit `npm run referenz:schreiben --workspace packages/kern` neu. Die Unterschiede gehören zum Pull Request.

## Regeln für Abhängigkeiten

Die App soll bei F-Droid erscheinen. Jede Abhängigkeit muss frei lizenziert sein und ohne proprietäre Dienste auskommen. Die App greift im Betrieb nicht auf das Netzwerk zu.

Welche Lizenzen zulässig sind, steht in [docs/lizenzen.md](docs/lizenzen.md). `npm run lizenzen` prüft alle Pakete aus dem Lockfile. Wer eine Abhängigkeit hinzufügt, lässt die Prüfung laufen und nennt im Pull Request, wofür das Paket gebraucht wird.

## Regeln für Texte

Texte beschreiben, was die Software rechnet. Sie versprechen keine Rechtssicherheit und keine Beratung. Die Maintainer prüfen jeden öffentlichen Text vor der Veröffentlichung und passen Formulierungen bei Bedarf an.

## Regeln für übernommene Dateien

Dateien aus anderen Quellen werden vor dem ersten Einchecken geprüft. Die Prüfpunkte stehen in [docs/uebernahmepruefung.md](docs/uebernahmepruefung.md).

## Build und Test

| Schritt | Befehl | Stand |
|---|---|---|
| Abhängigkeiten installieren | `npm ci` | läuft |
| Tests | `npm test` | läuft, prüft die Skripte, den Rechenkern, die Oberfläche und die App |
| Typprüfung | `npm run check` | läuft für den Rechenkern, die Oberfläche und die App |
| Build der Pakete | `npm run build` | läuft für den Rechenkern und den Web-Teil der App |
| Lizenzen der Abhängigkeiten prüfen | `npm run lizenzen` | läuft |
| Werkzeuge für den Android-Build prüfen | `node scripts/android-build.mjs --nur-pruefen` | braucht JDK und Projekt-SDK |
| Android-App bauen, Debug | `node scripts/app-bauen.mjs --android` | Web-Build, Übertragung nach Android, Gradle und die Prüfungen der Build-Kette in einem Lauf |
| Android-App bauen, Release ohne Signatur | `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` | mit `--streng` nur, wenn Node, JDK und die Pakete des SDK der Festlegung entsprechen; die Version von npm prüft der Build nicht |

Die Befehle funktionieren ohne private Dateien. Die Versionen der Werkzeuge stehen in [docs/toolchain.md](docs/toolchain.md).

- Abhängigkeiten stehen mit exakter Version in den Manifesten. Änderungen am Lockfile entstehen mit der Referenzversion von npm.
- Eine neue Version wird erst übernommen, wenn sie mindestens sieben Tage veröffentlicht ist.
- Installationsskripte von Paketen laufen nicht.

## Lizenz der Beiträge

Beiträge stehen unter derselben Lizenz wie das Projekt, Apache-2.0.
