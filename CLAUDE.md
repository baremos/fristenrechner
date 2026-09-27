# CLAUDE.md — Projekt: Fristenrechner Vergabe (App und Pakete)

Dieses Repository ist **zur Veröffentlichung vorgesehen**. Alles, was hier eingecheckt wird, kann später jeder lesen: Code, Doku, Commit-Nachrichten, Pull Requests, Issues. Deshalb gilt von Anfang an: nichts einchecken, was nicht öffentlich sein darf.

## Projektziel

Der Fristenrechner für Vergabeverfahren der BAREMOS IT GmbH wird als quelloffene Software veröffentlicht:

- als **Android-App** bei Google Play und F-Droid,
- als **npm-Pakete**, die auch die Website www.baremos.de einbindet.

Website und App teilen denselben Rechenkern und dieselbe Oberfläche. Es gibt eine Fachlogik, nicht zwei.

## Herausgeber und Haftung

- Herausgeber: BAREMOS IT GmbH, Berlin. Fachlich verantwortlich: Andreas Schmidt.
- Der Fristenrechner ist eine unverbindliche Rechenhilfe. Er ersetzt keine Rechtsberatung. Alle Angaben erfolgen ohne Gewähr.
- Lizenz: Apache-2.0.

## Zuschnitt (entschieden)

- **Nur Fristenberechnung.** Keine Erinnerungen, keine Benachrichtigungen, keine Konten, keine Synchronisation.
- **Die Vergabeordnung wird ausdrücklich gewählt.** Kein automatischer Wechsel zwischen VgV und UVgO über den Auftragswert.
- **Keine Beträge der EU-Schwellenwerte.**
- **Betrieb ohne Netzwerkzugriff.** Keine externen Fonts, kein CDN, kein Tracking, keine Analyse-Bibliotheken, keine Google-Dienste.
- **iOS ist zurückgestellt.** Die Architektur hält den Weg offen.

Details: `docs/zuschnitt-v1.md`, `docs/pflegekonzept.md`, `docs/arbeitspakete.md`.

## Architektur

Monorepo mit npm-Workspaces:

| Bereich | Inhalt | Paketname |
|---|---|---|
| `packages/kern` | Rechenkern, reines TypeScript ohne Abhängigkeiten, mit Tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | Astro-Komponente, Bedienlogik, Exporte (PDF, Excel, Projektdatei) | `@baremos/fristenrechner-ui` |
| `app` | Kleines Astro-Projekt plus Capacitor-Hülle für Android | App-ID `de.baremos.fristenrechner` |

Die Oberfläche kennt keine Plattform. Speichern, Importieren, Exportieren und Teilen laufen über schmale Schnittstellen. Website und App liefern je ihre Implementierung.

## Regeln

1. **F-Droid-Tauglichkeit ist Pflicht.** Jede Abhängigkeit muss frei lizenziert sein und ohne proprietäre Dienste funktionieren. Vor jeder neuen Abhängigkeit Lizenz und Transitivabhängigkeiten prüfen.
2. **Rechtsstand und Regelversion** erscheinen in jeder Berechnung und in jedem Export.
3. **Fachliche Änderungen nur mit Quelle und Test.** Jede Regel verweist auf ihre Rechtsgrundlage. Kein Wert wird geschätzt oder erfunden.
4. **Geheimnisse gehören nicht ins Repository.** Signierschlüssel, Passwörter und Schlüsseldateien liegen außerhalb des Arbeitsordners.
5. **Öffentliche Texte sind sachlich.** README, Store-Beschreibung, Screenshots und Versionshinweise beschreiben, was die Software rechnet. Sie versprechen keine Rechtssicherheit und keine Beratung. Die Maintainer prüfen jeden öffentlichen Text vor der Veröffentlichung.
6. **Übernahmeprüfung vor dem Einchecken.** Dateien aus anderen Repositories werden als frischer Stand kopiert, ohne Git-Historie. Vor dem ersten Einchecken werden Rechte, interne Kommentare, Testdaten und Geheimnisse geprüft.
7. **Build und Tests laufen ohne private Dateien.** Wer das Repository klont, kann bauen und testen.

## Arbeitsweise

- Sprache: Deutsch, auch in Commits und Doku. Ausnahme: README, Beitragsregeln und Store-Texte gibt es zusätzlich auf Englisch.
- Größere Schritte erst abstimmen: Software installieren, externe Konten oder Repositories anlegen, veröffentlichen, einreichen. Dafür braucht es ein ausdrückliches Go von Andreas.
- Zwei Agents arbeiten im Repository: Claude Code liest diese Datei, Codex liest `AGENTS.md`. Beide implementieren, kreuzweise Review vor jedem Merge nach `main`.
- Beiträge von außen: siehe `CONTRIBUTING.md`.
- Falls vorhanden, zuerst `CLAUDE.local.md` lesen. Die Datei ist lokal und von Git ausgeschlossen.

## Prüfungen vor jedem Merge

- Typprüfung und Tests des Kerns grün.
- Build der App grün, Betrieb ohne Netzwerkzugriff.
- Bei neuen Abhängigkeiten: Lizenzprüfung bestanden.
- Bei Textänderungen: Textprüfung durch die Maintainer bestanden.
- Review durch den jeweils anderen Agenten.
