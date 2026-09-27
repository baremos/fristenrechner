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
| Export | PDF, Excel und Projektdatei, Ausgabe über den Teilen-Dialog von Android |
| Rechtsstand | Regelversion und Rechtsstand sichtbar in der App und in jedem Export |
| Hinweis | unverbindliche Rechenhilfe, keine Rechtsberatung, Angaben ohne Gewähr |

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

1. Der Datenschutzhinweis der Website („Eingaben werden nur in diesem Browser verarbeitet") wird für die App neu gefasst. Inhalt: Die App verarbeitet die Eingaben auf dem Gerät und überträgt sie weder an BAREMOS IT noch an Dritte. Eine Datei verlässt das Gerät nur, wenn der Nutzer sie selbst exportiert oder teilt. Die automatische Cloud-Sicherung der Projektdaten ist ausgeschlossen, die Übertragung auf ein neues Gerät ist ausdrücklich geregelt. Die pauschale Aussage „nur auf diesem Gerät" wird nicht verwendet.
2. Exporte laufen nicht über Browser-Downloads. Die App schreibt die Datei und übergibt sie dem Teilen-Dialog.
3. Das Laden einer Projektdatei nutzt den Dateidialog von Android.
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
