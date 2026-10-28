# Rechtsquellen

Diese Seite nennt die amtlichen Fundstellen der Vorschriften, mit denen der Fristenrechner rechnet, und der Feiertagsregeln der Länder. Sie ergänzt die Store-Beschreibung der App (`fastlane/metadata/android/`) und die [Regelprüfungen](regelpruefungen.md), die Umfang, Ergebnisse und offene Punkte der einzelnen Prüfungen festhalten.

Der Fristenrechner und sein Herausgeber, die BAREMOS IT Dienstleistungs GmbH, sind keine Behörde und vertreten keine staatliche Stelle. Der Fristenrechner ist eine unverbindliche Rechenhilfe. Er ersetzt keine Rechtsberatung. Maßgeblich sind allein die amtlichen Texte. Alle Angaben erfolgen ohne Gewähr.

Stand: Regelversion 1.9.1, Rechtsstand Oktober 2026 (`packages/kern/src/fristen.ts`). Die App greift im Betrieb nicht auf das Netzwerk zu; die Adressen dienen dem Nachlesen. Der Abruf aller Adressen wurde am 2026-10-28 geprüft.

## Vergaberecht und Fristberechnung (Bund)

| Vorschrift | Im Kern zugrunde gelegte Fassung | Amtliche Fundstelle |
|---|---|---|
| GWB, Teil 4 | Gesamtausgabe; verwendet werden die Informations- und Wartepflicht nach § 134 und der Verweis in § 154 Nr. 4 | [gesetze-im-internet.de/gwb](https://www.gesetze-im-internet.de/gwb/) |
| VgV | Gesamtausgabe | [gesetze-im-internet.de/vgv_2016](https://www.gesetze-im-internet.de/vgv_2016/) |
| SektVO | Gesamtausgabe | [gesetze-im-internet.de/sektvo_2016](https://www.gesetze-im-internet.de/sektvo_2016/) |
| VSVgV | Gesamtausgabe | [gesetze-im-internet.de/vsvgv](https://www.gesetze-im-internet.de/vsvgv/) |
| KonzVgV | Gesamtausgabe | [gesetze-im-internet.de/konzvgv](https://www.gesetze-im-internet.de/konzvgv/) |
| VOB/A, 1. Abschnitt | Bekanntmachung vom 31.01.2019 (BAnz AT 19.02.2019 B2) mit Änderungen vom 16.06.2023 und 06.09.2023; § 3a neu gefasst zum 01.01.2026 durch Bekanntmachung vom 24.11.2025 (BAnz AT 16.12.2025 B7) | [verwaltungsvorschriften-im-internet.de](https://www.verwaltungsvorschriften-im-internet.de/bsvwvbund_31012019_BWI781063060120180001604634.htm); [Bundesanzeiger, BAnz AT 16.12.2025 B7](https://www.bundesanzeiger.de/pub/publication/YMf6Lbag7JCWIIZdpXc) |
| VOB/A-EU, 2. Abschnitt | Ausgabe 2026, Bekanntmachung vom 22.07.2026 (BAnz AT 24.08.2026 B6); Einzelabgleich im [Normabgleich](normabgleich-vob-a-2026.md) | [Bundesanzeiger, BAnz AT 24.08.2026 B6](https://www.bundesanzeiger.de/pub/publication/73xO0rpP1jfX5HRt0Ja), [amtliches PDF](https://www.bundesanzeiger.de/pub/publication/73xO0rpP1jfX5HRt0Ja/content/73xO0rpP1jfX5HRt0Ja/BAnz%20AT%2024.08.2026%20B6.pdf) |
| UVgO | Fassung vom 02.02.2017 (BAnz AT 07.02.2017 B1); ob inzwischen eine Neufassung bekanntgemacht wurde, ist in der [Regelprüfung vom 2026-10-22](regelpruefungen.md#regelprüfung-vom-2026-10-22) als offen vermerkt | [Bundeswirtschaftsministerium, Unterschwellenvergabeordnung](https://www.bundeswirtschaftsministerium.de/Redaktion/DE/Artikel/Service/unterschwellenvergabeordnung-uvgo.html) |
| BGB, §§ 186 bis 193 | Fristberechnung und Verschiebung auf den nächsten Werktag (§ 193) bei UVgO und VOB/A, 1. Abschnitt | [gesetze-im-internet.de/bgb](https://www.gesetze-im-internet.de/bgb/) |
| Verordnung (EWG, Euratom) Nr. 1182/71 | Art. 3 Abs. 2 Buchst. b (Fristende) und Abs. 4 (Verschiebung auf den nächsten Arbeitstag) bei den Vergabeordnungen ab den EU-Schwellenwerten (`packages/kern/src/schedule.ts`) | [EUR-Lex](https://eur-lex.europa.eu/eli/reg/1971/1182/oj/deu) |

Die Seite gesetze-im-internet.de betreibt laut Impressum die Bundesrepublik Deutschland, vertreten durch das Bundesministerium der Justiz und für Verbraucherschutz, die Seite verwaltungsvorschriften-im-internet.de die Bundesrepublik Deutschland, vertreten durch das Bundesministerium des Innern. Herausgeber des Bundesanzeigers (bundesanzeiger.de) ist laut Impressum das Bundesministerium der Justiz und für Verbraucherschutz.

## Gesetzliche Feiertage (Länder)

Die App enthält die gesetzlichen Feiertage je Bundesland nach den Feiertagsgesetzen der Länder (`packages/kern/src/kalender.ts`). Amtliche Quellen je Land:

| Land | Amtliche Quelle |
|---|---|
| Baden-Württemberg | [Innenministerium, Feiertage](https://im.baden-wuerttemberg.de/de/service/feiertage) |
| Bayern | [Feiertagsgesetz (BayFTG)](https://www.gesetze-bayern.de/Content/Document/BayFTG/true) |
| Berlin | [Senatsverwaltung für Inneres](https://www.berlin.de/sen/inneres/buerger-und-staat/verfassungs-und-verwaltungsrecht/artikel.1435639.php), [Feiertage und Schulferien](https://www.berlin.de/tourismus/infos/1887651-1721039-feiertage-schulferien.html) |
| Brandenburg | [Feiertagsgesetz (BRAVORS)](https://bravors.brandenburg.de/gesetze/ftg_2015) |
| Bremen | [Gesetz über die Sonn-, Gedenk- und Feiertage (Transparenzportal)](https://www.transparenz.bremen.de/metainformationen/gesetz-ueber-die-sonn-gedenk-und-feiertage-vom-12-november-1954-296390?asl=bremen203_tpgesetz.c.55340.de&template=20_gp_ifg_meta_detail_d) |
| Hamburg | [Feiertagsgesetz (Landesrecht)](https://www.landesrecht-hamburg.de/jportal/portal/page/bshaprod.psml?doc.id=jlr-FeiertGHArahmen&doc.origin=bs&doc.part=X&showdoccase=1&st=lr), [Ferien und Feiertage](https://www.hamburg.de/leben-in-hamburg/ferien-feiertage-termine-378818) |
| Hessen | [Innenministerium, Feiertage](https://innen.hessen.de/Buerger-Staat/Feiertage), [Feiertagsgesetz (Hessenrecht)](https://www.rv.hessenrecht.hessen.de/bshe/document/jlr-FeiertGHE1952rahmen) |
| Mecklenburg-Vorpommern | [Feiertagsgesetz (Landesrecht)](https://www.landesrecht-mv.de/bsmv/?query=DOKNR:jlr-FTGMVrahmen) |
| Niedersachsen | [Innenministerium, Feiertagsgesetz](https://www.mi.niedersachsen.de/startseite/themen/allgemeine_angelegenheiten_des_inneren/feiertagsrecht/feiertagsgesetz-61491.html) |
| Nordrhein-Westfalen | [Feiertagsgesetz (recht.nrw.de)](https://recht.nrw.de/lrgv/gesetz/01012000-bekanntmachung-der-neufassung-des-gesetzes-ueber-die-sonn-und-feiertage/) |
| Rheinland-Pfalz | [Innenministerium, Sonn- und Feiertagsrecht](https://mdi.rlp.de/themen/buerger-und-staat/verfassung-und-verwaltung/sonn-und-feiertagsrecht) |
| Saarland | [Feiertagsgesetz (Landesrecht)](https://recht.saarland.de/bssl/document/jlr-FeiertGSL1976rahmen) |
| Sachsen | [Sonn- und Feiertagsgesetz (REVOSax)](https://www.revosax.sachsen.de/vorschrift/3997-SaechsSFG?follow_successor=no) |
| Sachsen-Anhalt | [Feiertagsgesetz (Landesrecht)](https://www.landesrecht.sachsen-anhalt.de/jportal/?max=true&psml=bssahprod.psml&quelle=jlink&query=FeiertG+ST) |
| Schleswig-Holstein | [Feiertagsgesetz (Landesrecht)](https://www.gesetze-rechtsprechung.sh.juris.de/perma?j=FeiertG_SH) |
| Thüringen | [Feiertagsgesetz (Landesrecht)](https://landesrecht.thueringen.de/jportal/?max=true&psml=bsthueprod.psml&quelle=jlink&query=FeiertG+TH+%C2%A7+7) |

Welche Länderquellen zuletzt vollständig gelesen wurden und wo Prüfungen offen sind, steht in der [Regelprüfung vom 2026-10-22](regelpruefungen.md#regelprüfung-vom-2026-10-22).

## Hinweise zum Landesvergaberecht

Die Hinweistexte der App zur UVgO und zur VOB/A, 1. Abschnitt, weisen darauf hin, dass einzelne Landesvergabegesetze eigene Vorabinformations- und Wartepflichten kennen (beispielhaft genannt: Mecklenburg-Vorpommern, Sachsen, Sachsen-Anhalt, Thüringen), und empfehlen, das jeweilige Landesrecht zu prüfen. Die App berechnet keine landesrechtlichen Fristen und nennt dafür keine Werte. Amtliche Fundstellen der Landesvergabegesetze dieser Länder:

| Land | Gesetz | Amtliche Fundstelle |
|---|---|---|
| Mecklenburg-Vorpommern | Tariftreue- und Vergabegesetz Mecklenburg-Vorpommern (TVgG M-V), in Kraft seit 01.01.2024; ersetzt das Vergabegesetz Mecklenburg-Vorpommern | [Landesrecht Mecklenburg-Vorpommern](https://www.landesrecht-mv.de/) |
| Sachsen | Sächsisches Vergabegesetz (SächsVergabeG) vom 14.02.2013 (SächsGVBl. S. 109), geändert durch Gesetz vom 05.04.2019 (SächsGVBl. S. 245); § 8 regelt die Information der Bieter vor dem Vertragsabschluss | [REVOSax](https://www.revosax.sachsen.de/vorschrift/12749) |
| Sachsen-Anhalt | Tariftreue- und Vergabegesetz Sachsen-Anhalt (TVergG LSA) vom 07.12.2022, in Kraft seit 01.03.2023; ersetzt das Landesvergabegesetz Sachsen-Anhalt von 2011 | [eVergabe-Portal Sachsen-Anhalt](https://evergabe.sachsen-anhalt.de/geltende-regelungen/tariftreue-und-vergabegesetz-sachsen-anhalt), [Landesrecht Sachsen-Anhalt](https://www.landesrecht.sachsen-anhalt.de/bsst/document/jlr-NNLST00004198NN00000000002) |
| Thüringen | Thüringer Vergabegesetz (ThürVgG) in der Fassung der Bekanntmachung vom 23.01.2020 (GVBl. S. 29) | [Landesrecht Thüringen](https://landesrecht.thueringen.de/jportal/?quelle=jlink&query=VergabeG+TH&psml=bsthueprod.psml&max=true) |

Stand und Fortgeltung dieser Landesregelungen werden in den Regelprüfungen geführt; die Hinweise der App nennen dazu keine Einzelheiten. Das [Pflegekonzept](pflegekonzept.md) legt fest, wann die Regeln erneut geprüft werden.
