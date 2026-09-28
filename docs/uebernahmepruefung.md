# Übernahmeprüfung

Stand 2026-09-28 · Arbeitspaket 2.2

## Zweck

Dieses Repository wird veröffentlicht. Jede Datei, die aus einer anderen Quelle stammt, wird geprüft, bevor sie zum ersten Mal eingecheckt wird. Die `.gitignore` ersetzt diese Prüfung nicht: Sie hält Dateien fern, prüft aber keinen Inhalt.

Die Prüfung gilt für Dateien aus anderen Repositorys, für Vorlagen von Werkzeugen, für Bilder und Schriften und für Dateien, die ein Werkzeug erzeugt hat.

## Grundsätze

1. **Frischer Stand, keine Historie.** Dateien werden kopiert. Die Versionsgeschichte der Quelle kommt nicht mit.
2. **Nur was gebraucht wird.** Übernommen wird, was die Software zum Bauen, Testen und Laufen braucht.
3. **Erst prüfen, dann einchecken.** Das Ergebnis steht im Protokoll unten, bevor der Commit entsteht.
4. **Zwei Prüfer.** Wer übernimmt, prüft. Das Kreuz-Review prüft die Übernahme ein zweites Mal.

## Prüfpunkte

| Nr. | Prüfpunkt | Frage |
|---|---|---|
| 1 | Auswahl | Wird die Datei gebraucht? Gehört sie zum festgelegten Zuschnitt? |
| 2 | Rechte | Wer hält die Rechte am Inhalt? Darf er unter Apache-2.0 veröffentlicht werden? |
| 3 | Lizenzhinweise Dritter | Enthält die Datei Code oder Inhalte Dritter? Bleiben deren Lizenzhinweise erhalten? |
| 4 | Interne Verweise | Enthalten Kommentare, Namen von Dateien oder Tests Verweise, die nur intern verständlich sind: Nummern aus internen Aufgabenlisten, Namen von Personen, interne Adressen? |
| 5 | Geheimnisse | Enthält die Datei Schlüssel, Kennwörter, Token oder Zugangsdaten, auch in Kommentaren und Testdaten? |
| 6 | Testdaten | Stammen Testdaten aus echten Vorgängen? Enthalten sie Namen, Aktenzeichen oder andere Angaben zu Personen oder Auftraggebern? |
| 7 | Adressen im Netz | Verweist die Datei auf Adressen im Netz, die die Software zur Laufzeit aufrufen würde? |
| 8 | Texte | Beschreiben sichtbare Texte, was die Software rechnet? Versprechen sie weder Rechtssicherheit noch Beratung? |
| 9 | Fachliche Werte | Hat jeder fachliche Wert eine Quelle? Ist er durch einen Test belegt? |
| 10 | Erzeugte Dateien | Hat ein Werkzeug die Datei erzeugt? Dann gehört die Quelle ins Repository, die erzeugte Datei nur, wenn der Build sie braucht. |

## Ablauf

1. Liste der Dateien aufstellen, mit Quelle und Stand der Quelle.
2. Jede Datei gegen die Prüfpunkte prüfen. Fundstellen bereinigen oder die Datei weglassen.
3. Build und Tests ausführen, aus einer Kopie des Stands ohne private Dateien.
4. Neue Abhängigkeiten samt Transitivabhängigkeiten auf freie, verträgliche Lizenzen prüfen.
5. Protokoll ergänzen.
6. Kreuz-Review, danach einchecken.

## Zusätzliche Abschlussprüfung für den Rechenkern

Arbeitspaket 2.3 übernimmt den Rechenkern. Die allgemeinen Prüfpunkte reichen dafür nicht. Die Abnahme aus [arbeitspakete.md](arbeitspakete.md), Paket 2.3, wird Punkt für Punkt nachgewiesen:

| Nr. | Nachweis |
|---|---|
| K1 | Die Tabelle der Schwellenwerte ist entfernt. |
| K2 | Ihr Typ und ihr Export in der Schnittstelle sind entfernt. |
| K3 | Der Import und der Testblock zu den Schwellenwerten in den Tests sind entfernt. |
| K4 | Die Angabe zum Rechtsstand nennt keine Schwellenwert-Periode. |
| K5 | Kein Betrag der EU-Schwellenwerte steht in den übernommenen Dateien. |
| K6 | Der Rechtsstand liegt als Datum im ISO-Format vor, dazu ein Anzeigetext. |
| K7 | Die Referenzfälle rechnen wie der Rechenkern 1.9.0. |
| K8 | Typprüfung, Fachtests und Build des Pakets laufen aus einer Kopie ohne private Dateien. |
| K9 | Neue Abhängigkeiten für Test und Build sind samt Transitivabhängigkeiten auf ihre Lizenz geprüft. |

## Protokoll

Jede Übernahme erhält eine Zeile. Ein Prüfpunkt, der nicht zutrifft, steht nicht unter „Befunde".

| Datum | Arbeitspaket | Dateien | Quelle und Stand | Befunde und Bereinigung | Geprüft von |
|---|---|---|---|---|---|
| 2026-09-28 | 2.2 | `LICENSE` | https://www.apache.org/licenses/LICENSE-2.0.txt, geladen am 2026-09-28, 11.358 Byte, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | keine, Wortlaut unverändert | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.2 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0 aus den Manifesten dieses Repositorys | keine. Die Datei nennt nur die eigenen Workspaces, keine fremden Pakete und keine Adressen im Netz. `npm ci` läuft damit unter npm 11.19.0 und npm 10.9.8. | Claude Code, Kreuz-Review Codex |
