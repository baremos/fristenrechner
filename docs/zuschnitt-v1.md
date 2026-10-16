# Fachlicher Zuschnitt Version 1

Stand 2026-09-27 · bestätigt von Andreas Schmidt am 2026-09-27

## Grundsatz

Version 1 der App rechnet dasselbe wie der Fristenrechner auf www.baremos.de. Sie bringt keine neue Fachlogik mit. Ausgangsstand ist der Rechenkern 1.9.0 mit Rechtsstand Juli 2026.

## Enthalten

| Funktion | Beschreibung |
|---|---|
| Fristenberechnung | Termin- und Fristenplan für ein Vergabeverfahren aus den Eingaben des Nutzers |
| Vergabeordnungen | VgV, VOB/A-EU, SektVO, VSVgV, KonzVgV, UVgO, VOB/A. Der Nutzer wählt die Ordnung ausdrücklich. |
| Verfahrensarten | je Vergabeordnung wie im Rechenkern hinterlegt |
| Feiertage | gesetzliche Feiertage je Bundesland, berechnet ohne Netzwerkzugriff |
| Abgabe-Uhrzeit | optionale Uhrzeit für die Angebotsabgabe |
| Projekt speichern und laden | lokal auf dem Gerät, zusätzlich als Projektdatei |
| Export | PDF, Excel und Projektdatei über „Speichern unter“ in der Android-Auswahl; zusätzlich getrenntes Teilen jedes Formats |
| Rechtsstand | Regelversion und Rechtsstand sichtbar in der App und in jedem Export |
| Hinweis | in der App sowie als fester Pakethinweis in PDF und Excel: „Unverbindliche Rechenhilfe. Ersetzt keine Rechtsberatung. Alle Angaben ohne Gewähr.“; in den Exporten nicht durch den Gastgeber austauschbar oder abwählbar (entschieden am 2026-10-04) |

## Nicht enthalten

| Thema | Entscheidung |
|---|---|
| Erinnerungen und Benachrichtigungen | gestrichen |
| Automatische Wahl der Vergabeordnung über den Auftragswert | nicht in Version 1. Der Wert allein bestimmt die Ordnung nicht zuverlässig. Auftraggebertyp, Leistungsart, Zeitpunkt und Landesrecht gehören dazu. |
| Beträge der EU-Schwellenwerte | nicht in der App, entschieden am 2026-09-27. Die Berechnung braucht sie nicht, weil der Nutzer die Vergabeordnung wählt. Die Auswahl unterscheidet nur „EU-weit (ab den Schwellenwerten)" und „National (unterhalb der Schwellenwerte)". Die Angabe zum Rechtsstand nennt deshalb keine Schwellenwert-Periode. |
| Konten, Anmeldung, Synchronisation | nein |
| Tracking, Werbung, Analyse | nein |
| Netzwerkzugriff zur Laufzeit | nein |
| iOS | zurückgestellt |
| Landesvergabegesetze über den Stand des Rechenkerns hinaus | nicht in Version 1 |

## Anpassungen gegenüber der Website

1. Der Datenschutzhinweis der Website („Eingaben werden nur in diesem Browser verarbeitet") wird für die App neu gefasst. Wortlaut im Kasten der App, freigegeben am 2026-10-01: „Die App verarbeitet Ihre Eingaben auf diesem Gerät. Sie hat keinen Internetzugriff. Von Ihnen gewählte Dateianbieter und Ziel-Apps können Dateien übertragen.“ Die automatische Cloud-Sicherung der Projektdaten ist ausgeschlossen, die Übertragung auf ein neues Gerät ist ausdrücklich geregelt; Einzelheiten und Grenzen stehen in `datenschutz.md`, das die App offline anzeigt. Die pauschale Aussage „nur auf diesem Gerät" wird nicht verwendet.
2. Exporte laufen über „Speichern unter“ in der Android-Auswahl. Der Nutzer bestimmt den Speicherort. Daneben gibt es für Projektdatei, Excel und PDF jeweils eine eigene Teilen-Aktion; sie bestätigt die Bereitstellung, keinen Versand.
3. „Projekt importieren“ öffnet die Android-Auswahl für eine JSON-Projektdatei. Die App liest die ausgewählte Datei mit einer Grenze von 1 MiB und prüft anschließend das Projektformat. Bei Abbruch bleibt das bisherige Projekt erhalten.
4. Die App zeigt einen Hinweis, wenn ihr Rechtsstand älter ist als im Pflegekonzept festgelegt. Siehe `pflegekonzept.md`.

## Plattform

- Android. Mindestversion und Zielversion werden in Stufe 2 festgelegt, nach den Vorgaben von Capacitor und Google Play.
- Die App verlangt keine Berechtigungen außer denen, die der Teilen- und Dateidialog des Systems mitbringen.

## Sprachen

| Bereich | Sprache | Stand |
|---|---|---|
| Store-Präsenz (Google Play, F-Droid): Name, Kurzbeschreibung, Beschreibung | **Deutsch und Englisch** | entschieden am 2026-09-27 |
| README und Beitragsregeln des Repositorys | Deutsch und Englisch | redaktionelle Festlegung, Ausnahme von der Regel „Doku auf Deutsch" |
| Oberfläche der App und Exporte | Deutsch | entschieden am 2026-09-27 |

Die App rechnet nach deutschem Vergaberecht, ihre Fachbegriffe sind deutsch. Version 1 hat deshalb eine deutsche Oberfläche. Die englische Store-Präsenz sagt das ausdrücklich, damit niemand eine englische App erwartet. Eine englische Oberfläche wäre ein eigenes Arbeitspaket: alle Texte der Bedienung, der Exporte und der Hinweise müssten übersetzt und fachlich geprüft werden.

## Name

| Store-Eintrag | Name |
|---|---|
| deutsch | Fristenrechner Vergabe |
| englisch | Fristenrechner Vergabe, ergänzt um „Procurement Deadline Calculator (Germany)“ |

Die Namensfelder der Stores sind in der Länge begrenzt. Passt die englische Ergänzung nicht in das Namensfeld, steht sie am Anfang der Kurzbeschreibung.

## Offene fachliche Fragen

Keine. Alle Punkte des Zuschnitts sind entschieden.
