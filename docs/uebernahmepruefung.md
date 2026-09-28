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

## Nachweis zum Rechenkern

Stand 2026-09-28 · Arbeitspaket 2.3

### Übernommene Dateien

Quelle ist der Rechenkern 1.9.0 des Fristenrechners auf www.baremos.de, Stand der Quelle 2026-08-26. Übernommen sind acht Dateien nach `packages/kern/src`: `api.ts`, `fristen.ts`, `kalender.ts`, `projekt.ts`, `schedule.ts` und die drei Testdateien dazu. Nicht übernommen ist die Datei mit der Tabelle der Schwellenwerte.

### Abweichungen vom Rechenkern 1.9.0

| Nr. | Abweichung | Wirkung auf Berechnungen |
|---|---|---|
| A1 | Die Schwellenwerte sind entfernt: Tabelle, Typ, Export und die zwei Tests dazu. | keine, die Berechnung hat die Tabelle nie verwendet |
| A2 | Der Anzeigetext zum Rechtsstand endet vor dem Zusatz „; EU-Schwellenwerte 2026/2027". | nur dieser Text |
| A3 | Neu ist `RECHTSSTAND_DATUM`. Jedes Ergebnis trägt zusätzlich `regelversion` und `rechtsstandDatum`, jede neue Projektdatei zusätzlich `rechtsstandDatum`. Projektdateien ohne dieses Feld bleiben lesbar. | keine, die Felder kommen hinzu |
| A4 | Neu ist der Name `REGELVERSION`. `RECHENKERN_VERSION` bleibt mit demselben Wert erhalten. | keine |
| A5 | Importe nennen die Dateiendung `.js`, wie es die Modulauflösung `NodeNext` verlangt. | keine |
| A6 | Kommentare und Titel von Tests sind von internen Verweisen bereinigt: 95 Kommentarblöcke neu gefasst, 15 weitere Kommentare und 27 Titel angepasst, ein Wert in den Testdaten ersetzt. | keine |

Der Vergleich beider Stände ohne Kommentare zeigt genau diese Abweichungen und keine weitere. Verglichen wurde die Ausgabe des Syntaxbaums, mit Typen.

### Ergebnis je Nachweis

| Nr. | Ergebnis | Beleg |
|---|---|---|
| K1 | erfüllt | Die Datei mit der Tabelle ist nicht übernommen. |
| K2 | erfüllt | `api.ts` enthält weder den Typ noch den Export, siehe A1. |
| K3 | erfüllt | `schedule.test.ts` enthält weder den Import noch den Testblock. Von 121 Tests der Quelle sind 119 übernommen. |
| K4 | erfüllt | siehe A2. Der Test in `rechtsstand.test.ts` prüft es bei jedem Lauf. |
| K5 | erfüllt | Die Suche nach Beträgen findet keinen Betrag der EU-Schwellenwerte. Zwei Hinweise zur VOB/A, 1. Abschnitt, nennen Wertgrenzen des § 3a VOB/A. Das sind keine EU-Schwellenwerte. |
| K6 | erfüllt | `RECHTSSTAND_DATUM` im ISO-Format und `RECHTSSTAND` als Anzeigetext. Ein Test prüft, dass der Anzeigetext mit Monat und Jahr des Datums beginnt. |
| K7 | erfüllt | siehe Abschnitt „Referenzfälle" |
| K8 | erfüllt | `npm ci`, `npm run check`, `npm test` und `npm run build` laufen in einer Kopie, die nur die eingecheckten Dateien enthält: 81 Tests der Skripte und 134 Tests des Rechenkerns. |
| K9 | erfüllt | siehe Abschnitt „Abhängigkeiten für Test und Build" |

### Referenzfälle

Die Referenzprüfung liegt unter `packages/kern/test/referenz`. Sie rechnet ein festes Raster und vergleicht das Ergebnis mit vier Dateien, die die Regelversion im Namen tragen.

| Datei | Inhalt |
|---|---|
| `referenz-1.9.0.txt` | 1.265 Fälle: jede der 7 Vergabeordnungen mit jeder der 5 Verfahrensarten, 12 Eingabeprofile, je 3 von 8 Startterminen, alle 16 Länder. Je Fall die Termine im Klartext, dazu je ein Fingerabdruck der Struktur und der Texte. |
| `texte-1.9.0.txt` | alle Texte, die der Rechenkern im Raster ausgibt |
| `vorgaben-1.9.0.txt` | Vorschlagswerte der Fristen für 210 Kombinationen |
| `feiertage-1.9.0.txt` | Feiertage der 16 Länder für die Jahre 2026 bis 2030 |

Kombinationen, die eine Vergabeordnung nicht kennt, gehören zum Raster. Der Rechenkern meldet sie und liefert ein leeres Ergebnis, das trifft auf 289 der 1.265 Fälle zu.

So ist der Nachweis entstanden:

1. Der unveränderte Rechenkern 1.9.0 hat das Raster gerechnet. Seine 121 Tests waren dabei grün.
2. Auf seine Ausgabe wurden die Abweichungen A2 und A3 angewendet, sonst nichts.
3. Daraus sind die vier Dateien entstanden. Ein zweiter Lauf hat dieselben Dateien erzeugt.
4. Der Rechenkern im Paket rechnet dasselbe Raster und stimmt mit den vier Dateien überein.

Gegenprobe in einer Kopie des Pakets: Ein geänderter Fristwert, ein geänderter Text, ein geänderter Feiertag und eine fehlende Referenzdatei lassen die Prüfung jeweils scheitern. Eine fehlende Datei wird nicht stillschweigend neu angelegt.

Grenzen des Nachweises: Das Raster ist eine Auswahl. Es belegt die Übereinstimmung für diese Fälle, nicht für jede denkbare Eingabe. Der Vergleich der Quelltexte ohne Kommentare ergänzt es.

### Abhängigkeiten für Test und Build

Das Paket selbst hat keine Abhängigkeiten. Für Typprüfung und Build kommt `typescript` 6.0.3 hinzu, für die Tests `vitest` 4.1.11. Das Lockfile nennt damit 70 Pakete, einschließlich der Pakete für andere Betriebssysteme.

| Lizenz | Pakete |
|---|---|
| MIT | 52 |
| MPL-2.0 | 12 |
| Apache-2.0 | 3 |
| ISC | 2 |
| BSD-3-Clause | 1 |

Geprüft ist das Feld zur Lizenz im Lockfile, bei den installierten Paketen zusätzlich gegen deren Manifest. Der tatsächliche Inhalt der Pakete ist damit nicht geprüft, das leistet Arbeitspaket 2.7.

Zwei Punkte für die folgenden Arbeitspakete:

- `vitest` bringt über `vite` vorgebaute Programme mit, etwa `rolldown` und `lightningcss`. Der Build des Pakets braucht sie nicht, er läuft allein mit `tsc`. Was das für den Build bei F-Droid bedeutet, klärt Arbeitspaket 2.8.
- Die 12 Pakete unter MPL-2.0 gehören zu `lightningcss`. Sie dienen dem Test und werden nicht mit der App ausgeliefert.

## Protokoll

Jede Übernahme erhält eine Zeile. Ein Prüfpunkt, der nicht zutrifft, steht nicht unter „Befunde".

| Datum | Arbeitspaket | Dateien | Quelle und Stand | Befunde und Bereinigung | Geprüft von |
|---|---|---|---|---|---|
| 2026-09-28 | 2.2 | `LICENSE` | https://www.apache.org/licenses/LICENSE-2.0.txt, geladen am 2026-09-28, 11.358 Byte, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | keine, Wortlaut unverändert | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.2 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0 aus den Manifesten dieses Repositorys | keine. Die Datei nennt nur die eigenen Workspaces, keine fremden Pakete und keine Adressen im Netz. `npm ci` läuft damit unter npm 11.19.0 und npm 10.9.8. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | acht Dateien des Rechenkerns unter `packages/kern/src` | Rechenkern 1.9.0 des Fristenrechners auf www.baremos.de, Stand 2026-08-26 | Prüfpunkt 1: Die Schwellenwerte gehören nicht zum Zuschnitt, entfernt (A1, A2). Prüfpunkt 4: interne Verweise in Kommentaren und in Titeln von Tests, bereinigt (A6). Die sichtbaren Texte sind bis auf A2 unverändert, sie stehen in `texte-1.9.0.txt`. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | vier Referenzdateien unter `packages/kern/test/referenz` | erzeugt aus dem Rechenkern 1.9.0, siehe Abschnitt „Referenzfälle" | Prüfpunkt 10: Die Dateien sind erzeugt. Sie gehören ins Repository, weil die Tests sie brauchen. Raster und Abbild, aus denen sie entstehen, liegen daneben. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0, nach Aufnahme von `typescript` und `vitest` | keine, siehe Abschnitt „Abhängigkeiten für Test und Build" | Claude Code, Kreuz-Review Codex |
