# Pflegekonzept

Stand 2026-09-27 · bestätigt von Andreas Schmidt am 2026-09-27 · nach Kreuz-Review präzisiert

## Warum ein Pflegekonzept

Eine Website übernimmt eine geänderte Regel mit dem nächsten Deploy. Eine installierte App bleibt auf dem Stand, den der Nutzer zuletzt geladen hat. Rechnet sie mit überholten Regeln, merkt es niemand. Das Pflegekonzept legt fest, wer die Regeln prüft, wann, und wie eine Änderung bei den Nutzern ankommt.

## Verantwortung

| Rolle | Wer |
|---|---|
| Fachlich verantwortlich für Rechtsstand und Freigabe | Andreas Schmidt, BAREMOS IT GmbH |
| Umsetzung und Tests | Claude Code und Codex, kreuzweise Review |
| Veröffentlichung in den Stores | nach Freigabe durch Andreas Schmidt |

Alle Angaben der Software erfolgen ohne Gewähr. Der Hinweis entbindet nicht von der Pflege.

## Vier Angaben, die nicht verwechselt werden dürfen

| Angabe | Bedeutung | Form |
|---|---|---|
| Version der App und der Pakete | technischer Stand der Software | Versionsnummer |
| Regelversion | Stand der Fristenregeln im Rechenkern | Versionsnummer, beim Start 1.9.0 |
| Rechtsstand | Tag, bis zu dem die Rechtslage geprüft und bestätigt ist | Datum JJJJ-MM-TT |
| Geltungsbeginn | Tag, ab dem eine geänderte Regel anzuwenden ist | Datum JJJJ-MM-TT |

Der Rechtsstand wird als Datum im ISO-Format geführt. Eine Angabe wie „Juli 2026" reicht nicht, weil sie keinen Tag nennt. Für die Anzeige gibt es zusätzlich einen Text.

## Prüfanlässe

| Anlass | Zeitpunkt | Gegenstand |
|---|---|---|
| Regelprüfung | vierteljährlich | Änderungen an VgV, VOB/A, SektVO, VSVgV, KonzVgV, UVgO, GWB |
| EU-Schwellenwerte | alle zwei Jahre zum 1. Januar gerader Jahre, nächster Wechsel 01.01.2028 | Die App enthält keine Beträge. Zu prüfen ist nur, ob ein Text der App oder des Stores auf Beträge oder eine Periode verweist. |
| Feiertage | jährlich im vierten Quartal | Feiertagsgesetze der Länder |
| Anlassbezogen | sofort | Gesetzesänderung, Hinweis eines Nutzers, Fehler in einer Berechnung |

Die Ergebnisse einschließlich Quellen, Entscheidungen und verbleibender Prüflücken werden unter [Regelprüfungen](regelpruefungen.md) dokumentiert. Der Eintrag vom 2026-10-22 enthält den VOB/A-2026-Abgleich und die noch offenen Nachprüfungen.

## Prüfung ohne Befund

Auch eine Regelprüfung ohne Änderung wird festgehalten, mit Datum und geprüften Quellen. Der bestätigte Rechtsstand erreicht installierte Apps aber nur mit einem Update. Deshalb erscheint **mindestens einmal in zwölf Monaten** ein Update mit aktuellem Rechtsstand, auch wenn sich keine Regel geändert hat. Sonst würde der Hinweis auf eine veraltete Installation erscheinen, obwohl die Regeln stimmen.

## Ablauf einer fachlichen Änderung

1. Quelle prüfen und festhalten: Fundstelle, Datum, Geltungsbeginn.
2. Änderung im Rechenkern mit Test, der die neue Regel belegt.
3. Regelversion und Rechtsstand anheben.
4. Kreuz-Review, Freigabe durch den fachlich Verantwortlichen.
5. Veröffentlichung der Pakete.
6. Website aktualisieren.
7. Android-Release für Google Play und F-Droid.

Eine fachliche Änderung gilt erst als abgeschlossen, wenn Schritt 6 und 7 erledigt sind.

## Dringende Korrekturen

- Jeder Kanal wird einzeln bedient: Pakete, Website, Google Play, F-Droid.
- Pakete und Website warten nicht auf die Freigabe eines Stores.
- Verzögert ein Store die Freigabe, wird das mit Datum festgehalten.
- Die Versionshinweise nennen die Korrektur, ihre Quelle und den Geltungsbeginn.

## Gültigkeit der Daten

- Version 1 enthält keine Werte mit befristeter Geltung. Die Beträge der EU-Schwellenwerte sind nicht Teil der App, die Feiertage werden berechnet. Damit gibt es keinen festen Kalendertermin, zu dem die App wegen ablaufender Werte ein Update braucht.
- Pflegebedarf entsteht durch Änderungen an den Fristenregeln selbst: Vergabeordnungen, GWB, Feiertagsgesetze der Länder.
- Kommt später ein befristeter Wert hinzu, trägt er einen Gültigkeitszeitraum. Maßgeblich ist dann der Zeitpunkt, zu dem das Verfahren eingeleitet wird. Außerhalb des hinterlegten Zeitraums gibt die Software keinen Wert als aktuell aus.

## Hinweis auf veraltete Installationen

Die App greift nicht auf das Netzwerk zu und kann deshalb nicht nach Updates fragen. Sie vergleicht das eingebaute Datum des Rechtsstands mit dem Datum des Geräts.

| Punkt | Festlegung |
|---|---|
| Bedingung | das heutige Datum liegt mehr als zwölf Kalendermonate nach dem Rechtsstand, nicht pauschal 365 Tage |
| Zeitpunkt der Prüfung | beim Start und bei jeder Wiederaufnahme der App |
| Wirkung | ein Hinweis, dass eine neuere Version vorliegen kann. Die Berechnung bleibt möglich. |
| Tests | Monatsende, Schaltjahr, Zeitzonen, verstellte Uhr |

Zwei Grenzen des Hinweises:

1. Er erkennt keine Gesetzesänderung, die jünger ist als zwölf Monate. Dagegen helfen nur die Regelprüfung und ein zügiges Update.
2. Ein falsch eingestelltes Datum des Geräts lässt sich ohne Netzwerk nicht zuverlässig erkennen.

## Nachvollziehbarkeit

- Jede Berechnung und jeder Export nennt Regelversion und Rechtsstand.
- Gespeicherte Projekte bleiben lesbar. Wird ein altes Projekt mit neuer Regelversion neu berechnet, macht die Software den Versionswechsel kenntlich.
- Versionshinweise nennen jede fachliche Änderung mit Quelle.

## Fehlermeldungen

- Öffentlich über die Issues des Repositorys.
- Per E-Mail an die im Impressum der Website genannte Adresse.
