# AGENTS.md — Hinweise für Codex

Dieses Repository ist **zur Veröffentlichung vorgesehen**. Es gelten dieselben Regeln wie in `CLAUDE.md`. Bitte zuerst dort lesen: Projektziel, Zuschnitt, Architektur, Regeln.

## Kurzfassung

- Fristenrechner für Vergabeverfahren als quelloffene Android-App und als npm-Pakete. Herausgeber BAREMOS IT Dienstleistungs GmbH, Lizenz Apache-2.0.
- Nur Fristenberechnung. Keine Erinnerungen, kein Tracking, kein Netzwerkzugriff im Betrieb, keine Google-Dienste, keine Beträge der EU-Schwellenwerte.
- Die Vergabeordnung wird ausdrücklich gewählt.
- F-Droid-Tauglichkeit ist Pflicht: nur frei lizenzierte Abhängigkeiten.
- Geheimnisse und Signierschlüssel nie ins Repository.
- Übernahmeprüfung vor dem ersten Einchecken fremder Dateien.
- Build und Tests laufen ohne private Dateien.

## Zusammenarbeit

- Claude Code und Codex implementieren beide, kreuzweise Review vor jedem Merge nach `main`.
- Codex arbeitet auf `codex/*`-Branches, Claude auf `claude/*`-Branches.
- Review-Ergebnisse nummeriert, am Ende vollständig wiederholt, Fazit als Zeile `ERGEBNIS: bestanden` oder `ERGEBNIS: Nacharbeit nötig`.
- Größere Schritte (Software installieren, externe Konten, veröffentlichen, einreichen) nur nach ausdrücklichem Go von Andreas.

## Lokale Hinweise

Falls die Datei `CLAUDE.local.md` im Arbeitsordner liegt, enthält sie die Koordination und weitere Vorgaben. Sie ist von Git ausgeschlossen und bleibt es.
