# Lizenzen und Abhängigkeiten

Stand der erneuerten Prüfungen: **2026-10-15/16**, eingefrorener App- und Paketstand `8b17927`, ergänzte Gradle-Prüfsummen `d3d432b`; Android-Laufzeitinventar weiterhin am Stand `7fd6c90` vom 2026-10-04. Die npm-Bestandszahlen und einzeln gelesenen npm-Paketbelege unten stammen aus der Bestandsaufnahme vom **2026-09-29** mit Capacitor 8.5.2, dem npm-Lockfile im Format 3 und der damaligen Windows-Installation. Sie sind historische Angaben, keine neu erhobene npm-Bestandsliste. Dieses Dokument beschreibt Projektregeln und Paketbelege, keine Rechtsauskunft. Die [Android- und Gradle-Abhängigkeiten](#android--und-gradle-abhängigkeiten) sind unten gesondert erfasst; Werkzeugfestlegungen und Build-Nachweise behandeln [toolchain.md](toolchain.md) und [fdroid-build.md](fdroid-build.md).

Das Projekt steht unter Apache-2.0. Der Wortlaut liegt in `LICENSE`, der Herausgeberhinweis in `NOTICE` in der Wurzel des Repositorys.

## Lizenzprüfung am Endstand

Am 2026-10-03/04 bestand die npm-Lizenzprüfung in einer frischen Windows-Kopie mit Node 22.23.2 und npm 10.9.8 sowie unter Debian 13.5 mit Node 24.21.0 und npm 11.19.0, auch in der sauberen Kopie vor dem F-Droid-Lauf. Quelle sind die Abschlussprotokolle vom 2026-10-03/04, zusammengefasst in [app.md](app.md) und [fdroid-build.md](fdroid-build.md). Diese Ergebnisse erneuern den Nachweis der Metadatenprüfung; sie belegen weder vollständige Originalhinweise noch die Lizenzen aller eingebetteten und von Gradle geladenen Anteile.

Der lokale F-Droid-Lauf am 2026-10-04 mit fdroidserver 2.4.2-1 am Nachweisstand `8987e69` bestand mit gezielter Bereinigung ohne `scandelete`, ohne Scannerfehler und ohne Beanstandung der Auswertung. Die Bereinigung und die Inventare sind in [fdroid-build.md](fdroid-build.md) belegt. Ein F-Droid-Buildserver war nicht beteiligt. Die unten beschriebenen Weitergabepflichten und offenen Prüfungen bleiben davon getrennt. Die Hinweise Dritter sind am 2026-10-05 für den damaligen Web- und Android-Laufzeitbestand ergänzt; dieser Nachtrag erneuert die früheren APK- und F-Droid-Nachweise nicht.

## Lizenzprüfung am eingefrorenen Stand vom 2026-10-15

Am App- und Paketstand `8b17927` bestanden unter Windows mit Node 24.21.0 und npm 11.19.0 `npm run lizenzen`, der Bündelabgleich mit `node scripts/check-licenses.mjs --buendel app/.astro/module-client.json` und die Hinweisprüfung mit `node scripts/hinweise-dritter.mjs --pruefen`. Die Paketprüfung mit `scripts/npm-pakete.mjs --ohne-cr` bestand ebenfalls; ihre Werte stehen unter [Paketinhalt](#paketinhalt). Die Lizenzprüfung bestand auch in der frischen Windows-Kopie mit Node 22.23.2 und npm 10.9.8, im ersten Linux-Klon mit Node 24.21.0 und npm 11.19.0 sowie in der sauberen Kopie am Stand `d3d432b` vor dem F-Droid-Lauf.

Die Release-Builds bestanden K1 bis K5 einschließlich des Gradle-Modellabgleichs im App-Build. Die unsignierte Release-APK hatte 7 668 430 Bytes und SHA-256 `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02`; siehe [Build-Nachweis](app.md#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15). Der [lokale F-Droid-Lauf](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15) ergab dieselbe APK; nach Ergänzung der zwei Protokollmuster blieb die Auswertung ohne Beanstandung. Die Gradle-Prüfsummendatei umfasst nach der Ergänzung vom selben Tag 389 Komponenten und 675 Artefakte; Anlass und Gegenprüfung stehen unter [Gradle-Prüfsummen](toolchain.md#gradle-prüfsummen).

Diese automatischen Abgleiche erneuern keine Sichtung des APK-Inhalts von Hand und keine vollständige Inhalts- oder Herkunftsprüfung aller eingebetteten Anteile. Die älteren APK-, DEX-, SUSS- und Quelltextprüfungen unten behalten ihr jeweiliges Datum. Auch der Gradle-Modellabgleich belegt keinen kausalen Zusammenhang zwischen Modell und APK und keine vollständigen Lizenzhinweise.

## Bereiche und Rangfolge

Die Prüfung ordnet jeden fremden **Lockfile-Ort** genau einem Bereich zu. Gleichnamige Pakete an verschiedenen Orten bleiben getrennt. Das ist eine Einordnung nach Manifesten, keine Aussage über den tatsächlichen Inhalt eines Bundles.

| Bereich in Ausgabe und JSON | Bedeutung | Rang bei mehreren Pfaden |
|---|---|---:|
| `ausgeliefert` | Über `dependencies` oder `optionalDependencies` der Workspaces oder Wurzel erreichbar; vorsorglich auch über Peers der Wurzel. Alle transitiven Abhängigkeiten einschließlich fremder Peers gehören dazu. | 1, strengste Regel |
| `bereitgestellt` | Über `peerDependencies` eines Workspaces und deren transitive Pfade erreichbar: vom einbindenden Projekt bereitgestellt. Nur soweit kein ausgelieferter Pfad besteht. | 2 |
| `entwicklung` | Über `devDependencies` der Workspaces oder Wurzel und deren transitive Pfade erreichbar. | 3 |

Für `bereitgestellt` gelten dieselben Lizenzregeln wie für Test und Build (`entwicklung`). Die Einordnung als Peer geht vor Entwicklung, weil sie den Vertrag mit dem einbindenden Projekt sichtbar macht. Bei gemeinsamen Pfaden bleiben die zusätzlichen Zuordnungen im JSON unter `auchEntwicklung`, `auchBereitgestellt` und `wege` erkennbar. `wege` enthält je erreichbarem Bereich einen kurzen Belegpfad mit Ausgangsort, Abhängigkeitsart, Name und Zielort; es ist keine Aufzählung aller möglichen Pfade.

- **Workspace-Peers:** Ihre Kanten starten den Bereich `bereitgestellt`, auch wenn der Workspace selbst über einen Workspace-Link eingebunden ist. Eigene `dependencies` und `optionalDependencies` jedes Workspaces starten weiterhin `ausgeliefert`.
- **Optionale Peers:** Ein im Lockfile vorhandener Peer wird einschließlich seiner Kinder geprüft, unabhängig von der lokalen Installation. Nur ein ausdrücklich über `peerDependenciesMeta` als optional markierter, im Lockfile fehlender Peer darf fehlen. Ein erforderlicher fehlender Peer ist ein Fehler.
- **Peers von Fremdpaketen:** Sie erben den Bereich des Wegs, auf dem sie erreicht werden. Ein fremder Peer innerhalb eines ausgelieferten Baums bleibt deshalb ausgeliefert, auch wenn er optional ist oder zusätzlich als Workspace-Peer vorkommt. Hier gibt es keine Lockerung.
- **Optionale Abhängigkeiten:** Sie bleiben Teil des jeweiligen Baums und müssen im Lockfile stehen. Ein Plattformfilter oder das Fehlen unter Windows nimmt sie nicht aus der Lizenzprüfung.
- **Wurzel-Peers:** Die neue Regel gilt ausdrücklich für Workspaces. Peers der Wurzel bleiben vorsorglich ausgeliefert. Nicht zuordenbare Lockfile-Einträge verursachen einen Fehler, auch wenn ihre Ausgabe ersatzweise `entwicklung` nennt.

Im Bestand vom 2026-09-29 ist `astro` 7.3.3 zugleich Peer der Oberfläche und Entwicklungsabhängigkeit der Wurzel. Sein bereitgestellter Baum überschneidet sich mit Testwerkzeugen und ausgelieferten Paketen; die Rangfolge wird für jeden Ort einzeln angewendet.

## Zulässige Lizenzen

Die verbindliche Liste steht in [`scripts/check-licenses.json`](../scripts/check-licenses.json). Sie ist eine begrenzte Auswahl geprüfter Kennungen für dieses Projekt. Eine nicht aufgenommene Lizenz ist dadurch nicht als unfrei bewertet. Die Quellen der neuen Einträge wurden am 2026-09-29 gelesen.

| SPDX-Kennung | Test, Build und bereitgestellt | Auslieferung | Grund, Bedingungen und Quelle |
|---|---|---|---|
| MIT | ja | ja | Permissiv; Urheber- und Erlaubnistext bei Weitergabe erhalten. [Text](https://spdx.org/licenses/MIT.html). |
| Apache-2.0 | ja | ja | Projektlizenz; Lizenztext und einschlägige Hinweise einschließlich vorhandener NOTICE-Inhalte erhalten, Änderungen kennzeichnen. [Abschnitt 4](https://www.apache.org/licenses/LICENSE-2.0). |
| ISC | ja | ja | Permissiv; Urheber- und Erlaubnistext erhalten. [Text](https://spdx.org/licenses/ISC.html). |
| BSD-3-Clause | ja | ja | Hinweise und Haftungsausschluss erhalten; Namen nicht ohne Erlaubnis für Werbung verwenden. [Text](https://spdx.org/licenses/BSD-3-Clause.html). |
| MPL-2.0 | ja | nein | Copyleft auf Dateiebene; Weitergabe erfordert unter anderem Quelltextzugang und Hinweise. Für Werkzeuge aufgenommen, für Auslieferung erst nach einem konkreten Plan. [Abschnitt 3](https://www.mozilla.org/en-US/MPL/2.0/). |
| BSL-1.0 | ja | ja | BSL-1.0 ist für Auslieferung, Test, Build und bereitgestellte Abhängigkeiten zugelassen (Entscheidung der Maintainer vom 2026-10-05; die Alternative, den einzigen betroffenen Bestandteil als weitere fest gebundene Einschränkung zu führen, wurde nicht gewählt). Urheberhinweise und der vollständige Lizenztext bleiben in Quellen und Bearbeitungen erhalten; der Text nennt eine Ausnahme für ausschließlich maschinell erzeugten Objektcode. Die App gibt Herkunftshinweis und Text dennoch mit. [Originaltext aus Kotlin 2.0.21](https://raw.githubusercontent.com/JetBrains/kotlin/v2.0.21/license/third_party/boost_LICENSE.txt). |
| Zlib | ja | ja | Permissiv; Herkunft nicht falsch darstellen, geänderte Quellen kennzeichnen, Hinweis in Quellweitergaben erhalten. Für die Auslieferung zugelassen. [Text](https://spdx.org/licenses/Zlib.html); lokal auch `pako/lib/zlib/deflate.js`. |
| GPL-3.0-or-later | nein, nur bekannt | nein, nur bekannt | Freie Copyleft-Lizenz mit Pflichten insbesondere bei Weitergabe von Quellen und Binärdateien. Die Projektliste erlaubt keinen GPL-Zweig, kennt aber die Kennung zur vollständigen Prüfung von Alternativen. Das ist keine Einstufung als proprietär. [GPL, insbesondere Abschnitte 4–6 und 14](https://spdx.org/licenses/GPL-3.0-or-later.html). Im aktuellen Baum kommt die Kennung nicht mehr vor. |
| BSD-2-Clause | ja | nein | Permissiv; Urheberhinweis, Bedingungen und Haftungsausschluss in Quellen bzw. bei Binärweitergabe in Dokumentation oder Begleitmaterial erhalten. [Text](https://spdx.org/licenses/BSD-2-Clause.html); lokale LICENSE-Dateien der acht Pakete unten. |
| 0BSD | ja | ja | Erlaubt Nutzung, Änderung und Weitergabe ohne zusätzliche Hinweispflicht im Lizenztext; Haftungsausschluss. Verlangt weniger als MIT. Vorhandene Hinweise bleiben erhalten. Für die Auslieferung zugelassen, seit `tslib` über `@capacitor/core` zur App gehört. [Text](https://spdx.org/licenses/0BSD.html); `tslib/LICENSE.txt`. |
| Unlicense | ja | nein | Widmung an die Gemeinfreiheit mit ersatzweiser, uneingeschränkter Erlaubnis und Haftungsausschluss. Nur für Werkzeuge aufgenommen. [Text](https://spdx.org/licenses/Unlicense.html); `big-integer/LICENSE`, `stream-buffers/UNLICENSE`. |
| BlueOak-1.0.0 | ja | nein | Weite Urheber- und Patenterlaubnis; Empfänger müssen Lizenztext oder Lizenzlink erhalten. Bei schriftlich gerügtem Hinweisverstoß nennt der Text eine Heilungsfrist von 30 Tagen. [Text](https://spdx.org/licenses/BlueOak-1.0.0.html); lokale LICENSE.md-Dateien der drei Pakete unten. |
| CC0-1.0 | ja | nein | Verzicht auf die erfassten Rechte mit ersatzweiser Nutzungserlaubnis; keine Freigabe von Marken- oder Patentrechten, Haftungsausschlüsse beachten. [Text](https://spdx.org/licenses/CC0-1.0.html); `mdn-data/LICENSE` in beiden Versionen. |
| Python-2.0 | ja | nein | Erlaubt Nutzung und Bearbeitung unter Erhalt der Lizenz- und Urheberhinweise; bei Weitergabe von Bearbeitungen Änderungen zusammenfassen, Namens-/Markenbeschränkungen beachten. [Text](https://spdx.org/licenses/Python-2.0.html); `argparse/LICENSE` mit PSF-, BeOpen-, CNRI- und CWI-Abschnitten. |
| LGPL-3.0-or-later | ja | nein | Für den optionalen Werkzeugbaum aufgenommen. Bei Weitergabe betroffener Bibliotheken bzw. kombinierter Werke sind unter anderem Lizenzhinweise, Quelltext und Möglichkeiten zum erneuten Verbinden mit geänderter Bibliothek zu behandeln. Keine Freigabe eines App-Bundles. [LGPL, insbesondere Abschnitte 3–6 und einbezogene GPL](https://spdx.org/licenses/LGPL-3.0-or-later.html); Paketbeleg und Grenzen unten. |

Für ausgelieferte Anteile sind genau **MIT, Apache-2.0, ISC, BSD-3-Clause, Zlib, 0BSD und BSL-1.0** zugelassen. Die übrigen Werkzeugkennungen erweitern diesen Bereich nicht. Nutzung eines Werkzeugs allein ist kein Nachweis dafür, dass dessen Code im Ergebnis enthalten oder nicht enthalten ist; übernommene und eingebettete Anteile sind gesondert zu sichten.

### Zusammengesetzte Angaben

Das Skript verarbeitet `AND`, `OR` und geschachtelte Klammern nach der [SPDX-Spezifikation, Anhang D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/): `AND` verlangt alle Teile, `OR` mindestens einen zugelassenen Zweig. Gewählt wird die erste zulässige Alternative von links; `AND` bindet stärker. Kennungen werden ohne Beachtung der Großschreibung verglichen, Operatoren sind großzuschreiben. Für den Gegenvergleich werden Reihenfolge und gleichartige Klammergruppen normalisiert, keine allgemeine algebraische Gleichwertigkeit hergeleitet.

Der **gesamte** Ausdruck muss bekannt sein. `MIT OR Unbekannt` bleibt ein Fehler. Dagegen wählt `(MIT OR GPL-3.0-or-later)` MIT; GPL allein bleibt in allen drei Bereichen unzulässig. `(MIT AND Zlib)` ist ausgeliefert zulässig. `(MPL-2.0 OR Apache-2.0)` besteht bereits unter Apache-2.0; DOMPurify braucht keine neue Freigabe. `WITH`, `+`-Kennungen und `LicenseRef` werden nicht still entfernt.

Fehlende Angaben, unbekannte Kennungen, `UNLICENSED`, Lizenzobjekte und Texte wie `SEE LICENSE IN ...` sind grundsätzlich Fehler. Nur eine ausdrücklich geprüfte Einzelausnahme kann unbrauchbare Metadaten einer bestimmten Version berichtigen.

## Einzelausnahmen

`einzelausnahmen` in den Prüfdaten enthält **eine Ausnahme für `rgbcolor` 1.0.1**, im Bereich `ausgeliefert`, als MIT und gültig bis einschließlich **2027-09-29**. Die übrigen allgemeinen Lizenzregeln bleiben unverändert. Die Tests prüfen sowohl eigene Probedaten als auch die Ausnahme am echten Baum und ihren Ablauftag.

Eine Ausnahme enthält folgende Pflichtfelder:

| Feld | Bedeutung |
|---|---|
| `paket`, `version` | Exakter echter Paketname und eine feste Version, keine Versionsbereiche oder Platzhalter. Gilt nicht für Kinder oder andere Versionen. |
| `angabe` | Exakter angegebener Wortlaut, ohne Normalisierung; `null` für fehlende bzw. leere JSON-Angabe `null`. Eine leere Zeichenkette wird gesondert als `""` erfasst. |
| `lizenz` | Am Paketbeleg festgestellter SPDX-Ausdruck. Er muss nach den normalen Regeln im genannten Bereich zugelassen sein. |
| `beleg.datei`, `beleg.sha256`, `beleg.quelle` | Relativer Dateipfad **innerhalb dieses installierten Pakets**, SHA-256 der unveränderten Bytes und öffentlicher HTTPS-Quellenverweis. Die URL wird nicht aufgerufen. Der Lauf liest den lokalen Beleg. |
| `bereich` | Genau einer der drei Bereiche, keine automatische Übertragung bei strengerer Einordnung. |
| `gueltigBis` | Echtes ISO-Datum; gültig einschließlich dieses UTC-Tages, höchstens `einzelausnahmenMaxMonate` Kalendermonate ab Stichtag. Der normale Lauf verwendet den aktuellen UTC-Tag. |
| `begruendung` | Begründung der geprüften Zuordnung und ihrer Begrenzung. |

Die Prüfdaten begrenzen die verbleibende Gültigkeit mit **`einzelausnahmenMaxMonate: 12`** auf zwölf Kalendermonate ab Stichtag, passend zum mindestens jährlichen Update im [Pflegekonzept](pflegekonzept.md). Der Grenztag ist eingeschlossen. Fehlt der entsprechende Tag im Zielmonat, gilt dessen letzter Tag: vom 29.02.2024 höchstens bis zum 28.02.2025. Eine Verlängerung erfordert eine erneute Prüfung und Änderung des festen Ablaufdatums.

Die Prüfung lehnt ungültige, doppelte, abgelaufene und zu weit befristete Ausnahmen ab. Außerdem ist jede Ausnahme ein Fehler, auf die kein fremder Lockfile-Eintrag mit genau passendem Namen, Version, Rohangabe und maßgeblichem Bereich zutrifft. So fallen nach einem Versionswechsel oder einer Berichtigung der Metadaten veraltete Ausnahmen sofort auf. Ein passender Eintrag mit fehlendem Beleg meldet stattdessen den Belegfehler. Eine bekannte SPDX-Angabe darf damit nicht umgedeutet werden, auch keine bekannte, abgelehnte GPL-Angabe. Die Mechanik ist kein vollständiges SPDX-Verzeichnis: Im Review muss zusätzlich feststehen, dass eine Metadatenberichtigung und keine verdeckte Freigabe einer neuen Kennung vorliegt.

Ohne vorhandenen, nicht leeren Paketbeleg mit passender Prüfsumme gibt es keinen Erfolg durch Ausnahme. Ein Belegpfad darf auch über Verknüpfungen nicht aus dem Paket hinausführen. Name und Version der Installation werden weiterhin geprüft; bei einer Ausnahme müssen Lockfile und installiertes Manifest dieselbe Rohangabe tragen. Ein gültiges installiertes MIT-Feld ersetzt daher nicht still eine abweichende Lockfile-Angabe. Der Originalwortlaut und die angewandte Ausnahme einschließlich Beleg und Befristung stehen im JSON, in der Textausgabe erscheint die Ausnahme ausdrücklich. Die Lizenzwahl ersetzt keine Pflicht zur Mitgabe von Originalhinweisen.

### Geprüfte Einzelausnahme vom 2026-09-29

| Paket und Version | Angegebener Wortlaut | Festgestellte Lizenz | Beleg im installierten Paket | Bereich | Gültig bis einschließlich |
|---|---|---|---|---|---|
| `rgbcolor` 1.0.1 | `MIT OR SEE LICENSE IN FEEL-FREE.md` | MIT als ausdrücklich wählbare Alternative | `node_modules/rgbcolor/LICENSE.md`, SHA-256 `86045408b01f66f9319a2fe7bc7f7e115f272956ac44d2d840fc00127124a78c`; auch `FEEL-FREE.md` gelesen | ausgeliefert | 2027-09-29 (UTC) |

`LICENSE.md` enthält den vollständigen MIT-Text samt Urheberhinweis und erlaubt im Abschnitt „Exemptions“ ausdrücklich die Wahl zwischen MIT und `FEEL-FREE.md`. Das trägt die Wahl von MIT. Öffentliche, versionsgebundene Quelle ist das [npm-Archiv von rgbcolor 1.0.1](https://registry.npmjs.org/rgbcolor/-/rgbcolor-1.0.1.tgz), dessen Adresse im Lockfile steht. Das Archiv wurde hier nicht erneut geladen; geprüft wurden die installierten Dateien. Die Befristung betrifft die Projektfreigabe der Metadatenberichtigung, nicht die Laufzeit der fremden Lizenz.

## Bestandsaufnahme nach der Umstellung

Der Lauf am 2026-09-29 mit Capacitor erfasst **507 fremde Lockfile-Orte**, davon **27 ausgeliefert**, **289 bereitgestellt**, **191 für Test und Build**. **412 installierte Manifeste** wurden gelesen, **95 Einträge nur anhand des Lockfiles** geprüft. Es gibt **keine Fehler und eine angewandte Einzelausnahme**. Name, Version und Lizenzangaben der Installation bestehen den Gegenvergleich; bei `rgbcolor` wird die identische Rohangabe in Lockfile und Manifest über den geprüften Beleg als MIT eingeordnet. Eigene Workspaces und deren Links zählen nicht mit.

Verteilung der unveränderten Lizenzangaben aus demselben Lauf; zusammengesetzte Angaben zählen je Paketort einmal:

| Angabe im Lockfile | Ausgeliefert | Bereitgestellt | Test und Build | Gesamt |
|---|---:|---:|---:|---:|
| `(MIT AND Zlib)` | 1 | 0 | 0 | 1 |
| `(MPL-2.0 OR Apache-2.0)` | 1 | 0 | 0 | 1 |
| `0BSD` | 1 | 0 | 0 | 1 |
| `Apache-2.0` | 0 | 16 | 4 | 20 |
| `Apache-2.0 AND LGPL-3.0-or-later` | 0 | 3 | 0 | 3 |
| `Apache-2.0 AND LGPL-3.0-or-later AND MIT` | 0 | 1 | 0 | 1 |
| `BSD-2-Clause` | 0 | 8 | 0 | 8 |
| `BSD-3-Clause` | 0 | 3 | 1 | 4 |
| `BlueOak-1.0.0` | 0 | 3 | 9 | 12 |
| `CC0-1.0` | 0 | 2 | 0 | 2 |
| `ISC` | 0 | 9 | 16 | 25 |
| `LGPL-3.0-or-later` | 0 | 10 | 0 | 10 |
| `MIT` | 23 | 221 | 159 | 403 |
| `MIT OR SEE LICENSE IN FEEL-FREE.md` | 1 | 0 | 0 | 1 |
| `MPL-2.0` | 0 | 12 | 0 | 12 |
| `Python-2.0` | 0 | 1 | 0 | 1 |
| `Unlicense` | 0 | 0 | 2 | 2 |
| **Gesamt** | **27** | **289** | **191** | **507** |

Für die SEE-LICENSE-Angabe wählt die Einzelausnahme MIT; die Tabelle bewahrt den ursprünglichen Wortlaut. Ebenso bleibt bei DOMPurify die zusammengesetzte Angabe sichtbar, obwohl für die Auslieferung Apache-2.0 gewählt wird.

Die vollständige Liste aller npm-Abhängigkeiten samt Transitivabhängigkeiten steht im eingecheckten [`package-lock.json`](../package-lock.json), unter `packages` mit Version, Paketort und Lizenzangabe je Paket. `node scripts/check-licenses.mjs --json` ergänzt diese Liste aus dem aktuellen Baum um die Bereiche, gewählten Lizenzen, Einzelausnahmen, Belegpfade unter `wege` und Fehler. Diese Quellen bilden die npm-Liste. Eine zusätzliche erzeugte npm-Liste ist derzeit nicht eingecheckt. Die von Gradle aufgelösten Laufzeitmodule sind im [Android-Laufzeitinventar](#android--und-gradle-abhängigkeiten) erfasst. Die Hinweise der App zu den nicht im Lockfile erfassten Bündelinhalten sind unten ergänzt. Der Gradle-Werkzeugteil bleibt gesondert zu prüfen.

### Geprüfte Angaben im verbleibenden Baum

Die folgende Auswahl erläutert die Werkzeugkennungen und die verbleibende Einzelausnahme. Die Versionen und Pfade stammen aus dem Lauf vom 2026-09-29; die seit den Lockfile-Updates vom 2026-10-11 neueren Versionen sind so gekennzeichnet. Pfadkürzel:

- **A:** Oberfläche → Peer `astro` 7.3.3; zugleich Wurzel → Entwicklungsabhängigkeit `astro` 7.3.3.
- **J:** Oberfläche → `jspdf` 4.2.1. „Optional“ bezeichnet die betreffende Kante; die Pakete bleiben Teil der Prüfung.
- **K:** App → `@capacitor/core` 8.5.2.
- **C:** App → Entwicklungsabhängigkeit `@capacitor/cli` 8.5.2.

| Angabe | Pakete mit Version | Bereich | Weg in den Baum | Vorschlag, Begründung und Quelle; Stand |
|---|---|---|---|---|
| `BSD-2-Clause` | `css-select` 6.0.0, `css-what` 7.0.0, `domelementtype` 2.3.0, `domhandler` 5.0.3, `domutils` 3.2.2, `entities` 4.5.0, `nth-check` 2.1.1, `http-cache-semantics` 4.3.0 (seit dem 2026-10-11, vorher 4.2.0) | bereitgestellt | A → `svgo` → `css-select` / `css-what`; `css-select` → `domhandler` → `domelementtype`, → `domutils` → `dom-serializer` → `entities`, → `nth-check`; A → `http-cache-semantics` | Für Werkzeuge aufnehmen: permissiver Text in jeder lokalen `LICENSE`, mit Hinweispflichten; [BSD-2-Clause](https://spdx.org/licenses/BSD-2-Clause.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `0BSD` | `tslib` 2.8.1 | ausgeliefert | K → `tslib`; außerdem wie bisher über A und über Wurzel → `@astrojs/check` → `@astrojs/language-server` → `@astrojs/astro2tsx` → `@emnapi/core` → `tslib` | Für die Auslieferung aufgenommen: `node_modules/tslib/LICENSE.txt` (SHA-256 `210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751`) enthält Urheberhinweis und [0BSD-Text](https://spdx.org/licenses/0BSD.html). Ob Code von `tslib` im Bündel der App landet, zeigt erst deren Build. **Umgesetzt.** |
| `Unlicense` | `big-integer` 1.6.52, `stream-buffers` 2.2.0 | entwicklung | C → `native-run` → `bplist-parser` → `big-integer`; C → `xcode` → `simple-plist` → `bplist-creator` → `stream-buffers` | Für Werkzeuge aufgenommen: `node_modules/big-integer/LICENSE` (SHA-256 `e9b0e94f628e00b5ed98046cfa041696ff89eebbbdd54108ee350625bc6d0363`) und `node_modules/stream-buffers/UNLICENSE` (SHA-256 `ca2abdf695884c77ea4b4a5b64ca7b732d9d9dbade4eebc1c2e76c53e9e3bc83`) enthalten den [Unlicense-Text](https://spdx.org/licenses/Unlicense.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `BlueOak-1.0.0` | `common-ancestor-path` 2.0.0, `lru-cache` 11.5.3, `sax` 1.6.1; neu `chownr` 3.0.0, `glob` 13.0.6, `minimatch` 10.2.6, `minipass` 7.1.3, `package-json-from-dist` 1.0.1, `path-scurry` 2.0.2, `rimraf` 6.1.3, `tar` 7.5.22, `yallist` 5.0.0 | bereitgestellt; die neun neuen entwicklung | A → `common-ancestor-path`; A → `unstorage` → `lru-cache`; A → `svgo` → `sax`; C → `tar` → `chownr`, `minipass`, `yallist`; C → `rimraf` → `glob` → `minimatch`, `path-scurry`; C → `rimraf` → `package-json-from-dist` | Für Werkzeuge aufnehmen; die drei ersten `LICENSE.md` enthalten denselben [Blue-Oak-Text](https://spdx.org/licenses/BlueOak-1.0.0.html), einschließlich Pflicht zu Lizenztext oder Link. Die neun Pakete über C sind nach der Kennung im Manifest eingeordnet, ihre Lizenzdateien nicht einzeln gelesen. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `CC0-1.0` | `mdn-data` 2.27.1 und 2.0.28 | bereitgestellt | A → `svgo` → `css-tree` → 2.27.1; A → `svgo` → `csso` → dessen `css-tree` → 2.0.28 | Für Werkzeugdaten aufnehmen; beide lokalen `LICENSE` enthalten [CC0](https://spdx.org/licenses/CC0-1.0.html), einschließlich ersatzweiser Erlaubnis und Beschränkungen. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `Python-2.0` | `argparse` 2.0.1 | bereitgestellt | A → `js-yaml` → `argparse` | Werkzeugnutzung aufnehmen; vollständige Lizenzabschnitte in `node_modules/argparse/LICENSE`, [Vergleichstext](https://spdx.org/licenses/Python-2.0.html). **Umgesetzt**, Hinweise und Änderungsvermerk bei Weitergabe beachten. |
| `LGPL-3.0-or-later` | `@img/sharp-libvips-darwin-arm64`, `-darwin-x64`, `-linux-arm`, `-linux-arm64`, `-linux-ppc64`, `-linux-riscv64`, `-linux-s390x`, `-linux-x64`, `-linuxmusl-arm64`, `-linuxmusl-x64`, jeweils 1.3.4 (seit dem 2026-10-11, vorher 1.3.3; voller Präfix jeweils `@img/sharp-libvips`) | bereitgestellt | A → optional `sharp` 0.35.4 → optionale Plattformpakete | Werkzeugkennung aufnehmen, Entfernung des optionalen Baums weiter prüfen. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html); diese zehn Pakete sind lokal **nicht installiert**, ihr Inhalt ist nicht gegengeprüft. **Umgesetzt als Metadatenregel**, keine Bestätigung ihrer vollständigen Inhalte. |
| `Apache-2.0 AND LGPL-3.0-or-later` | `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64`, jeweils 0.35.5 (seit dem 2026-10-11, vorher 0.35.4) | bereitgestellt | A → optional `sharp` → optionale Plattformpakete | Werkzeugregel aufnehmen. Lokal nur x64: `LICENSE` enthält Apache-2.0, `README.md` nennt libvips und weitere LGPL-Anteile samt „any later version“. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt**, weitere eingebettete Lizenzen bleiben gesondert zu prüfen. |
| `Apache-2.0 AND LGPL-3.0-or-later AND MIT` | `@img/sharp-wasm32` 0.35.5 (seit dem 2026-10-11, vorher 0.35.4) | bereitgestellt | A → optional `sharp` → optional `@img/sharp-freebsd-wasm32` bzw. `@img/sharp-webcontainers-wasm32` → `@img/sharp-wasm32` | Zusammengesetzte Werkzeugangabe nach denselben Regeln aufnehmen. Nur Lockfile, kein lokal gelesener Paketinhalt; [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt als Metadatenregel**. |
| `MIT OR SEE LICENSE IN FEEL-FREE.md` | `rgbcolor` 1.0.1 | ausgeliefert | J → optional `canvg` 3.0.11 → `rgbcolor` | **Umgesetzt:** genaue MIT-Ausnahme bis einschließlich 2027-09-29; `LICENSE.md` enthält MIT und erlaubt ausdrücklich die Wahl gegenüber `FEEL-FREE.md`. Letztere Datei ist ebenfalls gelesen, wird aber nicht zur allgemeinen Kennung erklärt. [MIT-Vergleichstext](https://spdx.org/licenses/MIT.html). |

**Weitere Angaben im ausgelieferten Baum:** `pako` 2.2.0 über `jspdf` besteht mit `(MIT AND Zlib)`; das Paket enthält MIT in `LICENSE` und Zlib-Hinweise in `lib/zlib/deflate.js`. `dompurify` 3.4.16 (seit dem 2026-10-11, vorher 3.4.15) über die optionale Kante von `jspdf` besteht mit `(MPL-2.0 OR Apache-2.0)` unter Apache-2.0. Dafür ist keine Einzelausnahme nötig.

Die optionalen Module von jsPDF (`html2canvas`, `dompurify`, `canvg` und über `canvg` unter anderem `core-js` und `rgbcolor`) bleiben im npm-Baum; die Lizenzprüfung zählt sie weiter als ausgeliefert. jsPDF lädt die drei Module für `html()` und `addSvgAsImage()`; der PDF-Export der Oberfläche verwendet diese Funktionen nicht. Der App-Build ersetzt sie durch ein Ersatzmodul, das beim Laden einen Fehler meldet. K2 prüft das Fehlen der optionalen Chunks und ihrer Kennzeichen im App-Bündel sowie nackte Modulnamen in `import()`. Die Website entscheidet über einen solchen Ausschluss in ihrem eigenen PR.

### Optionaler Baum von sharp und libvips

Im beobachteten Graphen führt der einzige Eingang zu `sharp` (0.35.4, seit dem 2026-10-11 0.35.5) über `astro.optionalDependencies`. Auch dessen Plattformpakete werden optional eingebunden. `@img/sharp-wasm32` folgt als normale Abhängigkeit zweier optionaler Plattformpakete; der gesamte Weg bleibt damit optional. Ohne optionale Kanten ist keines dieser Pakete von den lokalen Manifesten aus erreichbar. Die betreffenden Lockfile-Einträge tragen außerdem `optional: true`.

[toolchain.md](toolchain.md) beschreibt sharp mit libvips als optionale Bildverarbeitung, die von der App nicht genutzt wird, und verlangt, den Baum wenn möglich zu entfernen. Diese Vorgabe bleibt bestehen. Die Aufnahme von LGPL als Werkzeugkennung ersetzt weder diese Prüfung noch die Prüfung vorgebauter Programme für F-Droid. Der optionale sharp-Baum ist im aktuellen Lockfile und in der Installation weiterhin enthalten.

Das installierte `@img/sharp-win32-x64` 0.35.4 (am 2026-10-11 für 0.35.5 erneut gelesen, gleiche Angaben) zeigt eine weitere Grenze: Seine README nennt zahlreiche eingebettete Bibliotheken und zusätzliche Lizenztexte, unter anderem für fontconfig, FreeType, libpng und mozjpeg sowie eine Patentlizenz für aom. Das äußere SPDX-Feld bildet diese Tabelle nicht vollständig ab. Gelesen wurden hier die README und die Apache-Lizenz des Pakets sowie der LGPL-Vergleichstext; die weiteren eingebetteten Texte und die nicht installierten Plattformpakete sind damit nicht vollständig geprüft.

## Ersatz von ExcelJS

Am 2026-09-29 nennt das Manifest der Oberfläche `fflate` 0.8.3 als direkte Abhängigkeit für das Packen selbst geschriebener Excel-Dateien. `fflate` trägt MIT, hat keine eigenen Abhängigkeiten und kein Installationsskript. Diese Angaben stammen aus Manifest, Lockfile und installiertem Paket.

`exceljs` und sein bisheriger Abhängigkeitspfad sind aus Manifest, Lockfile und Installation entfernt. Der aktuelle Lauf enthält `buffers`, `chainsaw`, `traverse`, `jszip`, `unzipper` und `fstream` nicht mehr. `big-integer` 1.6.52, `glob`, `rimraf` und `uuid` sind mit Capacitor zurückgekehrt, drei davon in anderer Version, und zwar nur über die Kommandozeile von Capacitor im Bereich `entwicklung`. Für die entfallenen Pakete werden keine Ausnahmen oder zusätzlichen Lizenzkennungen eingetragen.

## Capacitor 8.5.2 für die App

Die App nennt `@capacitor/core` und `@capacitor/android` 8.5.2 unter `dependencies` und `@capacitor/cli` 8.5.2 unter `devDependencies`. Das Lockfile wächst dadurch am 2026-09-29 um **95 Orte**: MIT 72, ISC 10, BlueOak-1.0.0 9, Apache-2.0 2, Unlicense 2. Kein bisheriger Eintrag eines Fremdpakets ist entfallen oder in Version, Quelle, Prüfsumme oder Lizenz geändert; geändert ist nur die Version des eigenen Workspaces `app`. Jeder neue Eintrag stammt von `registry.npmjs.org` und trägt eine Prüfsumme. Keiner hat ein Installationsskript.

Ausgeliefert sind neu nur `@capacitor/core`, `@capacitor/android` (beide MIT) und `tslib` (0BSD). Die Kommandozeile ist eine Entwicklungsabhängigkeit. Orte, die ihr Baum mit anderen Bäumen teilt, behalten den vorrangigen Bereich: Von den 95 neuen Orten sind 2 ausgeliefert (`@capacitor/core`, `@capacitor/android`), 91 für Test und Build und 2 bereitgestellt (`@types/node`, `undici-types`, zusätzlich über Astro erreichbar). `tslib` stand schon im Lockfile und ist jetzt ausgeliefert. Ohne die Kennungen 0BSD für die Auslieferung und Unlicense für Werkzeuge scheitert die Prüfung genau an `tslib`, `big-integer` und `stream-buffers`.

Im npm-Lauf vom 2026-09-29 waren die Abhängigkeiten, die Gradle für `@capacitor/android` lädt, darunter AndroidX und das Cordova-Framework, nicht erfasst. Der [Laufzeitteil mit POM-Lizenzangaben und APK-Abgleich](#android--und-gradle-abhängigkeiten) ist am 2026-10-04 für `7fd6c90` ergänzt; die Hinweise Dritter zum Laufzeitteil sind am 2026-10-05 ergänzt; der Gradle-Werkzeugteil bleibt offen.

Damit gehörte das vorgebaute Browser-Bündel von ExcelJS nicht mehr zum npm-Bestand vom 2026-09-29. Seine frühere Auswertung ist kein Nachweis für den Inhalt eines neuen Website- oder App-Builds. Der eigene Excel-Schreiber und die vollständige Oberfläche wurden im damaligen Metadatenlauf nicht gebaut. Die späteren vollständigen App-Builds sind in [app.md](app.md) belegt. Die erzeugten Bündel und die Originalhinweise ihrer tatsächlich enthaltenen Fremdanteile bleiben vor der Auslieferung zu prüfen; das gilt auch für die übrigen Exportbibliotheken.

## Android- und Gradle-Abhängigkeiten

Erhoben am **2026-10-04**, Stand **`7fd6c90`**. Erfasst ist ausschließlich `:app:releaseRuntimeClasspath`, einschließlich transitiver Module und der beiden Projektmodule. Grundlage sind der gespeicherte Bericht dieses Laufs, eine Auswertung der POM-Dateien im Gradle-Cache und die Prüfprotokolle zur APK. Diese Belege werden gesondert aufbewahrt und sind nicht Teil des Repositorys. Der Offline-Lauf mit Gradle 8.14.5 und JDK 21.0.8 endete mit Rückgabewert 0 und `BUILD SUCCESSFUL in 13s`.

### Aufgelöste Laufzeitmodule

Der Abgleich des Gradle-Berichts mit der Auswertung ergibt dieselben **50 externen Module mit identischen Versionen**: **46 mit AAR- oder JAR-Artefakt**, davon **39 AndroidX**, und **vier nur mit Metadaten**. Gezählt wird jede aufgelöste Kombination aus Gruppe, Artefakt und Version einmal; wiederholte Baumknoten, Versionsanforderungen vor `->` und zusätzliche Constraints erhöhen die Zahl nicht. Insgesamt sind es 41 AndroidX-Module: 39 mit Artefakt und zwei nur mit Metadaten.

Die Lizenzspalte nennt die Lizenz laut POM, als SPDX-Kennung wiedergegeben. Bei `com.google.guava:listenablefuture` stammt die Angabe aus dem Eltern-POM `com.google.guava:guava-parent:26.0-android`. Diese Metadaten erfassen nicht automatisch die Lizenzwortlaute eingebetteter Anteile.

| Gruppe:Artefakt | Version | Bestand | Lizenz laut POM |
|---|---|---|---|
| `androidx.activity:activity` | 1.11.0 | AAR | Apache-2.0 |
| `androidx.annotation:annotation` | 1.8.1 | nur Metadaten | Apache-2.0 |
| `androidx.annotation:annotation-experimental` | 1.4.1 | AAR | Apache-2.0 |
| `androidx.annotation:annotation-jvm` | 1.8.1 | JAR | Apache-2.0 |
| `androidx.appcompat:appcompat` | 1.7.1 | AAR | Apache-2.0 |
| `androidx.appcompat:appcompat-resources` | 1.7.1 | AAR | Apache-2.0 |
| `androidx.arch.core:core-common` | 2.2.0 | JAR | Apache-2.0 |
| `androidx.arch.core:core-runtime` | 2.2.0 | AAR | Apache-2.0 |
| `androidx.collection:collection` | 1.4.2 | nur Metadaten | Apache-2.0 |
| `androidx.collection:collection-jvm` | 1.4.2 | JAR | Apache-2.0 |
| `androidx.concurrent:concurrent-futures` | 1.1.0 | JAR | Apache-2.0 |
| `androidx.coordinatorlayout:coordinatorlayout` | 1.3.0 | AAR | Apache-2.0 |
| `androidx.core:core` | 1.17.0 | AAR | Apache-2.0 |
| `androidx.core:core-ktx` | 1.17.0 | AAR | Apache-2.0 |
| `androidx.core:core-splashscreen` | 1.0.1 | AAR | Apache-2.0 |
| `androidx.core:core-viewtree` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.cursoradapter:cursoradapter` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.customview:customview` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.drawerlayout:drawerlayout` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.emoji2:emoji2` | 1.3.0 | AAR | Apache-2.0 |
| `androidx.emoji2:emoji2-views-helper` | 1.3.0 | AAR | Apache-2.0 |
| `androidx.fragment:fragment` | 1.8.9 | AAR | Apache-2.0 |
| `androidx.interpolator:interpolator` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-common` | 2.6.2 | JAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-livedata` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-livedata-core` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-process` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-runtime` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-viewmodel` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.lifecycle:lifecycle-viewmodel-savedstate` | 2.6.2 | AAR | Apache-2.0 |
| `androidx.loader:loader` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.profileinstaller:profileinstaller` | 1.4.0 | AAR | Apache-2.0 |
| `androidx.resourceinspection:resourceinspection-annotation` | 1.0.1 | JAR | Apache-2.0 |
| `androidx.savedstate:savedstate` | 1.2.1 | AAR | Apache-2.0 |
| `androidx.startup:startup-runtime` | 1.1.1 | AAR | Apache-2.0 |
| `androidx.tracing:tracing` | 1.2.0 | AAR | Apache-2.0 |
| `androidx.vectordrawable:vectordrawable` | 1.1.0 | AAR | Apache-2.0 |
| `androidx.vectordrawable:vectordrawable-animated` | 1.1.0 | AAR | Apache-2.0 |
| `androidx.versionedparcelable:versionedparcelable` | 1.1.1 | AAR | Apache-2.0 |
| `androidx.viewpager:viewpager` | 1.0.0 | AAR | Apache-2.0 |
| `androidx.webkit:webkit` | 1.14.0 | AAR | Apache-2.0 |
| `com.google.guava:listenablefuture` | 1.0 | JAR | Apache-2.0 |
| `org.apache.cordova:framework` | 14.0.1 | AAR | Apache-2.0 |
| `org.jetbrains:annotations` | 23.0.0 | JAR | Apache-2.0 |
| `org.jetbrains.kotlin:kotlin-stdlib` | 2.0.21 | JAR | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-android` | 1.8.1 | JAR | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-bom` | 1.8.1 | nur Metadaten | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core` | 1.8.1 | nur Metadaten | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm` | 1.8.1 | JAR | Apache-2.0 |
| `org.jspecify:jspecify` | 1.0.0 | JAR | Apache-2.0 |

Hinzu kommen zwei Projektmodule, die nicht in den 50 externen Modulen mitgezählt sind:

| Projektmodul | Herkunft und Einordnung |
|---|---|
| `:capacitor-android` | Quellen aus `@capacitor/android` 8.5.2 unter MIT; in der APK sind 132 Capacitor-Klassen nachgewiesen. |
| `:capacitor-cordova-android-plugins` | Von `cap sync` erzeugtes Projekt; unter `src` im untersuchten Stand nur Manifest und Platzhalterdateien, keine eigenen Plugin-Klassen. Das Cordova-Framework ist als externes Laufzeitmodul oben aufgeführt. |

### Abgleich mit der APK und Dienstprüfung

Am 2026-10-04 wurde die unsignierte Release-APK mit **7 760 765 Bytes**, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`, entsprechend dem [Build-Nachweis am Endstand](app.md#build-nachweis-am-endstand-vom-2026-10-0304) geprüft. Die folgenden APK-, DEX- und SUSS-Ergebnisse beziehen sich auf diesen älteren Stand; sie wurden am 2026-10-15 nicht erneut erhoben. Die DEX-Auswertung erfasst **5 318 definierte Klassen**. Alle 4 769 Klassen aus den 46 Laufzeitartefakten sind darin enthalten. Hinzu kommen 132 Capacitor-Klassen, 49 eigene Klassen, 141 erzeugte R-Klassen und 227 von D8 erzeugte Synthetikklassen.

Von 35 Dateien unter `META-INF` mit Endung `.version` enthalten **28 eine konkrete Versionsnummer**; alle 28 stimmen mit der Gradle-Auflösung überein. Die übrigen sieben enthalten Platzhalter aus den vorgelagerten Artefakten und liefern keinen Versionsnachweis.

Die Prüfung mit den in fdroidserver 2.4.2 enthaltenen SUSS-Signaturen verwendete 114 Gradle- und 471 Code-Signaturen. Das Protokoll `suss-pruefen.log` meldet **keine Treffer** gegen die geprüften Cache-Koordinaten und gegen die 5 318 APK-Klassen. Die ergänzende DEX-Suche fand keine Merkmale für Google Play Services (`gms`), Firebase, Play, DataTransport oder Crashlytics. Der einzige Treffer für `measurement` war ein Fehlertext von CoordinatorLayout. Die einzige Klasse unter `com/google` ist die Guava-Schnittstelle `ListenableFuture`.

Damit ergab diese SUSS-/DEX-Prüfung keinen Hinweis auf Google-Dienste, Firebase, Play Services oder proprietäre Artefakte in der untersuchten APK. Das Ergebnis gilt für die verwendeten Signaturen und Suchmuster; es ersetzt weder die vollständigen Hinweise Dritter noch einen Laufzeitnachweis.

### Eingebettete Android-Anteile und Hinweise Dritter

Die folgenden Anteile haben keine eigene Modulkoordinate in der Auflösung. Die POM-Lizenz des umgebenden Moduls wird ihnen hier nicht als eigene Lizenz unterstellt:

| Eingebetteter Anteil | Enthalten in | APK-Abgleich | Stand |
|---|---|---|---|
| `org.chromium.support_lib_boundary` | `androidx.webkit:webkit` 1.14.0 | 58 Klassen | BSD-3-Clause: Chromium-LICENSE und die Originalköpfe aus dem Quellarchiv übernommen |
| FlatBuffers | `androidx.emoji2:emoji2` 1.3.0, `libs/repackaged.jar` | 49 Ursprungsklassen und eine zusätzliche D8-Synthetikklasse | Apache-2.0: gemeinsamer Wortlaut; Version der eingebetteten Kopie nicht bestimmbar |
| GWT-Ableitung | `org.jetbrains.kotlin:kotlin-stdlib` 2.0.21, `libraries/stdlib/src/kotlin/collections` | `kotlin/collections/AbstractList` definiert | Apache-2.0: Herkunftssatz aus der Kotlin-README; gemeinsamer Lizenztext |
| Guava-Ableitung | dasselbe JAR, `libraries/stdlib/jvm/src/kotlin/util/UnsignedJVM.kt` | `kotlin/UnsignedKt` definiert | Apache-2.0: Herkunftssatz aus der Kotlin-README; gemeinsamer Lizenztext |
| Boost-Ableitung | dasselbe JAR, `libraries/stdlib/jvm/src/kotlin/util/MathJVM.kt` | `kotlin/math/MathKt__MathJVMKt` definiert | BSL-1.0: Herkunftssatz aus der Kotlin-README und vollständiger Boost-Lizenztext |

Die Hinweise sind am 2026-10-05 ergänzt. Das Quellarchiv von WebKit enthält 47 Java-Quellen unter `org.chromium.support_lib_boundary` mit sieben unterschiedlichen Urheberköpfen. Alle sieben Köpfe stehen zusammen mit der Chromium-Lizenz in den Hinweisen. Das Emoji2-Quellarchiv enthält keine FlatBuffers-Quellen. Für die belegte Kopie in `libs/repackaged.jar` wird keine Version behauptet; der Apache-2.0-Vergleichstext aus FlatBuffers v1.12.0 ist bytegleich zur gemeinsamen `LICENSE`. Cordova 14.0.1 und Kotlin 2.0.21 erhalten zusätzlich ihre vollständigen NOTICE-Inhalte. Die Kotlin-NOTICE bezeichnet die Compilerdistribution; ihr Wortlaut bleibt unverändert. Für kotlinx.coroutines 1.8.1 ist am geprüften Quellort keine NOTICE vorhanden (HTTP 404); der tatsächliche JetBrains-Urheberhinweis aus LICENSE wird zusätzlich zum gemeinsamen Apache-Text wiedergegeben.

Die vollständige `license/README.md` aus Kotlin v2.0.21 wurde lokal gelesen (18 558 Bytes, SHA-256 `8a82f8702ea943f008c84a61b8df7b053b7d36cfa293e3abd59f839b728a5999`). Sie benennt genau die drei oben erfassten Pfade für die ausgelieferte JVM-Standardbibliothek. Die übrigen dort genannten Pfade betreffen Compiler, IDEA-/Compose-/Lint-/Power-Assert-Plugins, JavaScript, Native, Wasm, Tests, Werkzeuge oder Beispiele; solche Kotlin-Artefakte stehen nicht unter den 46 Laufzeitartefakten. Aus `org.jetbrains.kotlin` wird nur `kotlin-stdlib` 2.0.21 ausgeliefert. Herkunftssätze, README-Stelle, Quell- und Auszughash sowie JAR-, Klassen-, APK- und DEX-Belege stehen bei den drei Bestandteilen im Inventar. Die README selbst bleibt in der privaten Belegablage der Maintainer; Generator und Tests benötigen sie nicht. Die protokollierten Herkunftsauszüge werden gegen ihren Wortlauthash geprüft, nicht bei jedem Lauf erneut gegen die gesamte externe README.

Der lokale Klassenbeleg vom 2026-10-05 betrifft das JAR `kotlin-stdlib-2.0.21.jar` (SHA-256 `f31cc53f105a7e48c093683bbd5437561d1233920513774b470805641bedbc09`) und die vorhandene unsignierte Release-APK (7 666 170 Bytes, SHA-256 `714e1868ee00f9d2a6b946f7dec798ae4a495b77c38aba62f8b2190271cc6728`). Alle drei Beispielklassen sind als Klassen in `classes.dex` definiert (DEX-SHA-256 `9886ef92da16453e913cbbc46630d222b1651e85b79fbd4957d2b24bbab222c7`); es wurden die DEX-Klassendefinitionen gelesen, nicht nur Zeichenketten gesucht. `minifyEnabled` ist im Release-Build ausgeschaltet. Das ist eine erneuerbare Momentaufnahme, keine automatische Bindung späterer APKs an diese Hashes. Bei R8/Minify oder geänderten Artefakten ist der Klassenbeleg neu zu prüfen; unklare enthaltene Anteile bleiben vorsorglich erfasst.

Für alle 46 Laufzeitartefakte wurden die lokalen POMs und JAR-/AAR-Dateien samt enthaltenen JARs, `META-INF`, Lizenz-, NOTICE-, COPYING- und Third-Party-Dateinamen sowie Klassenpaketen gesichtet. `listenablefuture` erhält seine POM-Lizenz über `guava-parent:26.0-android`. Sieben Archive enthalten denselben reinen Apache-2.0-Bedingungstext ohne zusätzliche Urheberangabe (activity, coordinatorlayout, core-ktx, core-viewtree, core, profileinstaller, webkit). Daneben wurden keine weiteren eingebetteten Lizenz- oder NOTICE-Dateien gefunden. Die beiden kotlinx.coroutines-JARs enthalten keine solchen Dateien; ihre POMs nennen Apache-2.0, der gesondert übernommene LICENSE-Zusatz nennt JetBrains und Kotlin-Mitwirkende. Lokale Quellenarchive der beiden kotlinx.coroutines-Artefakte fehlen. Aus Bytecode und POMs lässt sich die Herkunft aller intern übernommenen Algorithmen nicht abschließend feststellen.

**Grenze: Fremdanteile innerhalb von Maven-Artefakten sind nur erfasst, soweit Paketunterlagen oder Quellen sie benennen.** Die Suche in den lokalen Archiven belegt keine vollständige Freiheit von weiteren übernommenen Quellen oder abweichenden Herkunftshinweisen. Die vollständige Quellprüfung von kotlinx.coroutines und der übrigen Maven-Artefakte ist damit nicht belegt.

### Neuerzeugung und Abgrenzung der Build-Werkzeuge

Der Bericht vom 2026-10-04 am Stand `7fd6c90` wurde mit folgendem Aufruf erzeugt (`gradlew` bezeichnet den Projekt-Wrapper):

```text
gradlew -p app/android :app:dependencies --configuration releaseRuntimeClasspath --offline
```

Aus der Repository-Wurzel ist der Wrapper unter Windows als `.\app\android\gradlew.bat`, unter Linux als `./app/android/gradlew` aufzurufen. `JAVA_HOME` muss auf ein vollständiges OpenJDK 21 zeigen; im belegten Lauf war es 21.0.8. Für strenge Release-Builds gilt weiterhin der [festgelegte Patchstand](toolchain.md#jdk). `ANDROID_HOME` muss das vorbereitete Projekt-SDK nennen; ein vorhandenes `sdk.dir` in `app/android/local.properties` darf nicht auf ein anderes SDK verweisen. Gradle-Verteilung, Abhängigkeiten, npm-Installation mit `@capacitor/android` und das erzeugte Android-Projekt müssen bereits vorhanden sein. `--offline` unterbindet das Nachladen von Abhängigkeiten durch Gradle; die Wrapper-Verteilung muss vorher im Cache liegen. Der Befehl erneuert den Abhängigkeitsbaum, nicht den APK-/SUSS-Abgleich oder die Sichtung der POM-Lizenzen.

Die Gradle-Werkzeuge des Buildscripts, insbesondere das Android-Gradle-Plugin und dessen Abhängigkeiten, gehen nicht als Build-Werkzeuge in die APK ein. Soweit dieselben Module auch Laufzeitabhängigkeiten sind, sind sie oben gesondert erfasst. **Ihre vollständige Werkzeugliste und die dafür geltende Lizenzregel bleiben offen.** Die SHA-256-Absicherung der erfassten Gradle-Artefakte und Metadaten ist seit dem 2026-10-05 in `app/android/gradle/verification-metadata.xml` umgesetzt; Umfang, Pflege und Grenzen stehen unter [Gradle-Prüfsummen](toolchain.md#gradle-prüfsummen). Das ersetzt keine Lizenzprüfung. Der Laufzeitbericht ist kein Inventar des Buildscripts; eine abschließende Zahl der Werkzeug-Artefakte wird hier nicht angegeben.

## Testempfänger und Testvarianten der App

Der Testempfänger mit DocumentsProvider unter `scripts/emulator/testempfaenger` besteht aus eigenen Java-Quellen und nutzt das Android-Framework ohne zusätzliche Bibliotheksabhängigkeiten. Er enthält keinen übernommenen Fremdcode. Für diese Quellen gilt wie für das Repository Apache-2.0. Das Gradle-Projekt verwendet beim Variantenbau die bereits vorhandenen Build-Werkzeuge und das Projekt-SDK; daraus folgt keine zusätzliche Laufzeitabhängigkeit der Produkt-App.

Der Emulatorrahmen baut den Testempfänger sowie die Gegenprobe und die Varianten für die Fehlerseite ausschließlich in seinem Ausgabeordner. Die Gegenprobe und die Fehlerseitenvarianten verwenden Kopien der App und ihrer vorhandenen Abhängigkeiten; deren Lizenzpflichten bleiben bestehen. Diese Test-APKs und der nur für die Prüfläufe verwendete Testempfänger gehören zur Testumgebung und werden nicht mit der Produkt-App oder den npm-Paketen ausgeliefert. Keine Klasse des Testempfängers wird in die Produkt-App kopiert. Einzelheiten stehen in der [Beschreibung der Test-App](../scripts/emulator/testempfaenger/README.md) und in [app.md](app.md#dateiphase-auf-api-30-und-36).

## Lauf und Befund

Die Prüfung läuft offline, ohne npm-Aufruf und ohne Ausführung von Installationsskripten aus Abhängigkeiten:

```text
node scripts/check-licenses.mjs
node scripts/check-licenses.mjs --json
node --test scripts/check-licenses.test.mjs
npm run lizenzen
```

Die Ausgabe verwendet **`formatVersion: 2`**, auch bei einem vorzeitig abgebrochenen JSON-Lauf. Neu sind der Bereich und Zähler `bereitgestellt`, `auchBereitgestellt`, `wege`, `ausnahme`, der Ausnahmezähler und `stichtag`. `auchEntwicklung` erfasst jetzt auch bereitgestellte Pakete mit Entwicklungspfad. Aufgelöste Kanten enthalten `optionalerPeer`. Erfolg hat Exit-Code 0, jeder Fehler Exit-Code 1. `--wurzel <Ordner>` prüft eine andere lokale Kopie; Registry-Adressen werden nicht aufgerufen.

Workspaces werden aus konkreten Pfaden und Mustern wie `packages/*` aufgelöst. Ihre Manifeste müssen mit dem Lockfile übereinstimmen. Das Skript prüft verschachtelte Versionen, Aliasse, Workspace-Links und Zyklen; die `dev`-Markierung im Lockfile entscheidet nicht allein. Ein vorhandener Paketordner ohne lesbares Manifest ist ein Fehler. Fehlende Installationen bleiben ausdrücklich nur anhand des Lockfiles geprüft.

Dateizugriffsfehler nennen eigene Meldungen und Pfade relativ zur geprüften Wurzel, beispielsweise `Beleg der Einzelausnahme fehlt: node_modules/alt/LICENSE`. Betriebssystemmeldungen mit absoluten Pfaden und Ausschnitte fehlerhafter JSON-Inhalte werden nicht ausgegeben. Bei einer Packliste außerhalb der Wurzel erscheint nur `[außerhalb der Wurzel]/Dateiname`.

`npm run lizenzen` endet am 2026-09-29 mit **Code 0**, ohne Fehlermeldung, auch mit Capacitor. Die einzige Metadatenberichtigung ist die oben belegte MIT-Ausnahme für `rgbcolor` 1.0.1. Ohne diese Ausnahme meldet die Gegenprobe ausschließlich für dieses Paket zwei Fehler: jeweils für Lockfile und installiertes Manifest. Es gibt keinen weiteren offenen Paketbefund aus diesem Metadatenlauf.

### Lockfile-Update und `npm audit` vom 2026-10-11

Am 2026-10-11 wurde das Lockfile mit npm 11.19.0 erneuert (`npm update dompurify http-cache-semantics --package-lock-only`): `dompurify` 3.4.15 → 3.4.16 (laut npm-Registry veröffentlicht am 2026-09-23) und `http-cache-semantics` 4.2.0 → 4.3.0 (laut npm-Registry veröffentlicht am 2026-10-04 um 04:56 MESZ; das Mindestalter von sieben Tagen war am 2026-10-11 erreicht). Beide Lizenzangaben sind unverändert, die Apache-Lizenzdatei von `dompurify` ist bytegleich zur Vorversion. Im selben Schritt tragen Kern und Oberfläche die Version 0.1.0, Oberfläche und App verlangen den Kern exakt in dieser Version, und die Felder `engines` der beiden Pakete sind entfernt (Festlegung der Maintainer vom 2026-10-04; `private: true` bleibt). Das Lockfile ändert sonst nichts. Am selben Tag folgte ein zweites Update mit npm 11.19.0 (`npm update sharp source-map-js smol-toml --package-lock-only`), siehe unten. `npm run lizenzen` endet mit Code 0 (507 Pakete: 27 ausgeliefert, 289 bereitgestellt, 191 für Test und Build), und `node scripts/hinweise-dritter.mjs --pruefen` besteht mit der auf 3.4.16 gesetzten Angabe in `scripts/hinweise-dritter.json`.

`npm audit` meldete am 2026-10-11 vor dem zweiten Update sechs Einträge, zwei davon als hoch, vier als mittel eingestuft. Keines der betroffenen Pakete gehört zu den ausgelieferten Anteilen. `npm audit fix --force` wird nicht angewendet.

| Paket | Version vor dem Update | Bereich und Weg | Meldung | Einordnung und Stand am 2026-10-11 |
|---|---|---|---|---|
| `sharp` | 0.35.4 | bereitgestellt; A → optional `sharp` | hoch, GHSA-wq5f-xc86-pv6w (librsvg); behoben ab 0.35.5 (veröffentlicht am 2026-09-27) | Optionale Bildverarbeitung von Astro; die App nutzt sie nicht, und [toolchain.md](toolchain.md) führt den Baum als zu entfernen, sobald möglich. Nicht ausgeliefert. **Nachgezogen auf 0.35.5** mit den Plattformpaketen 0.35.5 und `@img/sharp-libvips-*` 1.3.4. |
| `source-map-js` | 1.2.1 | bereitgestellt; A → `vite` → `postcss`, A → `magicast`, A → `svgo` → `css-tree`, A → `svgo` → `csso` → `css-tree` | hoch, GHSA-68fv-2mgg-jv7q (Blockieren der Ereignisschleife durch Abschnittsversätze indizierter Source-Maps); behoben ab 1.2.2 (veröffentlicht am 2026-09-30) | Werkzeug des Web-Builds; der Build verarbeitet nur Dateien aus dem Repository und den festgelegten Paketen. Nicht ausgeliefert. **Nachgezogen auf 1.2.2.** |
| `smol-toml` | 1.8.0 | bereitgestellt; A → `smol-toml`, A → `@astrojs/internal-helpers` → `smol-toml` | mittel, GHSA-r4xh-jqrq-34v2 (quadratische Laufzeit beim Lesen); behoben ab 1.9.0 (veröffentlicht am 2026-09-22) | Werkzeug des Web-Builds; der Build verarbeitet nur Dateien aus dem Repository und den festgelegten Paketen. Nicht ausgeliefert. **Nachgezogen auf 1.9.0**; 1.9.1 vom 2026-10-09 lag unter dem Mindestalter. |
| `uuid` | 7.0.3 | entwicklung; C → `xcode` → `uuid` | mittel, GHSA-w5hq-g745-h8pq (fehlende Grenzprüfung bei v3, v5 und v6 mit übergebenem Puffer); behoben ab 11.1.1 (veröffentlicht am 2026-10-10) | Werkzeug der Capacitor-Kommandozeile für iOS-Projekte; die App hat kein iOS-Projekt. `xcode` 3.0.1 verlangt `uuid` 7; der von npm vorgeschlagene Weg ist ein Rückschritt auf `@capacitor/cli` 8.4.3 und wird nicht gegangen. Hingenommen, bei jeder Regelprüfung erneut ansehen. |
| `xcode` | 3.0.1 | entwicklung; C → `xcode` | mittel, über `uuid` | wie `uuid`. |
| `@capacitor/cli` | 8.5.2 | entwicklung | mittel, über `xcode` | wie `uuid`. |

Die Korrekturversionen und ihre Veröffentlichungsdaten stammen aus der npm-Registry (`npm view <Paket> time`), abgefragt am 2026-10-11. Die Zuordnung zu den Bereichen bereitgestellt und entwicklung belegt keine Ungefährlichkeit der Werkzeuge; sie hält fest, dass keines dieser Pakete in die App oder in die npm-Pakete gelangt und der Build keine Eingaben von außen verarbeitet. Die Maintainer haben `sharp`, `source-map-js` und `smol-toml` am 2026-10-11 mit einem zweiten Lockfile-Update nachgezogen (Entscheidung vom selben Tag). Geändert sind nur Lockfile, die drei sharp-Einträge der [Bereinigungsliste](fdroid-build.md) für den F-Droid-Lauf und diese Dokumentation; die App-Quellen sind unverändert, die Build-Ergebnisse wurden erneut geprüft. `npm audit` meldet danach nur noch die drei mittleren Einträge zu `@capacitor/cli`, `uuid` und `xcode`.

### `npm audit` am eingefrorenen Stand vom 2026-10-15

Der erneute Lauf von `npm audit` mit Node 24.21.0 und npm 11.19.0 meldete drei bekannte mittlere Einträge zu `@capacitor/cli`, `uuid` und `xcode`. Es gab keine niedrigen, hohen oder kritischen Meldungen. Die oben dokumentierte Einordnung und die offenen Werkzeuggrenzen bleiben bestehen.

### Installationsskripte und vorgebaute Programme

Im Lauf vom 2026-09-29 trugen drei Pakete Installationshaken: `core-js` 3.50.0, `esbuild` 0.28.2 und das damals nicht installierte `fsevents` 2.3.3. Insgesamt meldeten Namensmuster und gefundene Binärdateien bei **35 Paketen** vorgebaute Programme. Diese Zahl ist eine Hilfestellung, kein vollständiger Binärnachweis. Für nur im Lockfile vorhandene Pakete stehen keine lokalen Dateien zur Suche zur Verfügung. Das bekannte eingebettete WebAssembly von `es-module-lexer` wird zusätzlich über ein Namensmuster erfasst.

Das Skript erfasst `preinstall`, `install`, `postinstall` und `binding.gyp`. `prepare` und `prepack` sind keine hier geprüften Installationshaken für Registry-Pakete; Quellinstallationen aus Git benötigen eine eigene Prüfung. Lizenzfehler unterdrücken die Suche nach Hinweis- und Binärdateien nicht. Weder die Bereichseinordnung noch das Abschalten von Installationsskripten entfernt bereits enthaltene Programme. Der tatsächliche Build-Baum wurde für den lokalen Endstandlauf geprüft, siehe [F-Droid-Nachweis](fdroid-build.md); bei Änderungen ist diese Prüfung zu erneuern.

## Hinweise Dritter, Paketinhalt und verbleibende Arbeit

### Werkzeuge für die Hinweise der App

Stand des Hinweisbestands: **2026-10-06, 92 Haupteinträge und fünf eingebettete Android-Bestandteile (zusammen 97 statt zuvor 94), zehn separate Fremdtextdateien und 70 433 Bytes Hinweistext; sieben entschiedene Einschränkungen, in der App eingebunden.**
[`scripts/hinweise-dritter.json`](../scripts/hinweise-dritter.json) führt den am 2026-10-05 inhaltlich geprüften Bestand. Die erzeugte Datei [`app/src/hinweise-dritter.txt`](../app/src/hinweise-dritter.txt) wird offline als eigener Abschnitt „Hinweise zu Komponenten Dritter“ nach „Lizenzen“ angezeigt. Sie enthält Web- und Android-Anteile zusammen, ohne Links. Titel und Einleitung stehen einmal in der App-Seite. Die Einbindung in eine Website braucht eigene Hinweise des Gastgebers.

Das Inventar verwendet `formatVersion: 2`. Seine Felder:

| Gruppe oder Feld | Bedeutung |
|---|---|
| `apache` | Repositorydatei `LICENSE` mit SHA-256 für den einmaligen Apache-2.0-Text. |
| `npm` | Paketname, Version, gewählte Lizenz, Lockfile-Ort, Bündelmarkierung und Lizenzdatei mit SHA-256. |
| `eingebettet` | Bestandteil, enthaltendes Paket und dessen Version, Quelle, vollständiger Wortlaut sowie gehashte Behälterdatei. |
| `buildHilfscode` | Werkzeugpaket, Version, Lizenz, Paketort oder `null`, genaue virtuelle Modulkennungen, Bündelmarkierung, Quellbelege und Wortlaut. |
| `android.projektmodule` | Modulname, belegte Version, Lizenz, Paketort oder `null` und Lizenzdatei beziehungsweise Wortlaut. |
| `android.maven` | Koordinate mit Lizenz und Zusatzhinweisen; `bestandteile` erfasst Chromium-Boundary, FlatBuffers und die drei Kotlin-Ableitungen. Ihre Lizenz wird ebenfalls für den Auslieferungsbereich geprüft. |
| `ausnahmen` | Begründete Lockfile-Orte ohne eigenes gerendertes Web-Modul; keine sichtbaren Prüfverwaltungstexte. |
| `status` | Alle 92 Haupteinträge stehen auf `vollstaendig`; das ist der Bearbeitungsstatus der erfassten Texte, keine Zusage zur vollständigen Herkunftsabdeckung. Platzhalter führen im strengen Modus weiterhin zu einem Fehler. |
| `originale` | Repositoryrelative Quelldatei, SHA-256, gegebenenfalls Quellkarte und Bytebereich des Auszugs; zusätzlicher `auszugSha256` vor der Zeilenendennormalisierung. Der Wortlaut muss exakt daraus entstehen. |
| `belege` | Zusätzlich gelesene, gehashte Herkunfts- oder Vergleichsdateien. |
| `zusatzhinweise` | Separat an Originaldatei, Auszug und Hash gebundene Texte; der gebundene Hauptwortlaut einer entschiedenen Einschränkung bleibt unverändert. |
| `herkunftsbeleg` / `artefaktbeleg` | Protokollierte externe README-Stelle mit Quell- und Wortlauthash bzw. Klassenbeleg der lokal geprüften JAR-/APK-Momentaufnahme; ohne private Laufzeiteingaben. |
| `lizenztext` | Repositorydatei mit Hash für den einmal benötigten vollständigen Boost-Text beim Android-Bestandteil. |
| `versionsbeleg` | Unabhängiger gehashter Versionsbeleg bei Null-Ort-Einträgen. |
| `entschiedeneAusnahme` | Angabe, Beleg, Datum und Wortlaut der Entscheidung; nur die geschlossene Liste im Prüfcode kann sie zulassen. |

Der Bestand umfasst acht gerenderte npm-Pakete, 15 eingebettete Einträge, drei Hilfscodeeinträge, zwei Android-Projektmodule, 46 Maven-Artefakte und 18 begründete Lockfile-Ausnahmen. Der erneute Abgleich mit dem abgeschlossenen Client-Modulprotokoll bestätigt die acht Pakete `@capacitor/core`, `fflate`, `jspdf`, `pako`, `fast-png`, `iobuffer`, `@babel/runtime` und `jspdf-autotable`. Gerendert sind Vites Preload-Hilfe und vier Oxc-Hilfen. `virtuell:rolldown/runtime.js` hat keinen gerenderten Code; sein Eintrag bleibt mit `imBuendel: false` geprüft und wird nicht angezeigt. Die Lockfile-Kategorie „ausgeliefert“ beschreibt den Abhängigkeitsgraphen; sie ist keine Aussage über gerenderten Code.

Die Oxc-Herkunftsprüfung lädt die vier Originalmodule über Rolldowns `oxcRuntimePlugin` ausschließlich im Speicher und vergleicht `moduleParsed.code` byteweise mit den entsprechenden Dateien aus `@babel/runtime/helpers/esm`. Alle vier Quellen sind bytegleich; deshalb ist ihr mitgelieferter Babel-MIT-Wortlaut belegt. Dieser Befund betrifft genau diese vier Hilfen, keine pauschale Lizenzfreigabe des Oxc-Pakets. Das erzeugte Cordova-Projektmodul stammt aus dem Archiv der MIT-lizenzierten Capacitor CLI 8.5.2. Das Archiv enthält nur Gradle-Gerüst, Manifest und Platzhalter, keine Plugin-Quellen. Beide Herkunftsbelege und ihre Prüfsummen stehen im Inventar.

Die Befehle laufen offline aus der Repositorywurzel:

```text
node scripts/hinweise-dritter.mjs --schreiben
node scripts/hinweise-dritter.mjs --pruefen
npm run lizenzen
node scripts/check-licenses.mjs --streng
node scripts/check-licenses.mjs --buendel app/.astro/module-client.json
node scripts/check-licenses.mjs --gradle-modell app/android/app/build/intermediates/lint_vital_report_lint_model/release/generateReleaseLintVitalReportModel/release-artifact-dependencies.xml
```

Generator und Prüfungen lesen ausschließlich Repository und `node_modules`. Extern erhobene Wortlaute liegen je Quelle unter `scripts/hinweistexte/`: Das hält ihre Originalbytes und Prüfsummen getrennt von den Inventarmetadaten. Quelle, Datum, Größe, SHA-256 und genaue Auszüge stehen im [Übernahmeprotokoll](uebernahmepruefung.md#hinweistexte-dritter). Private Erhebungsdateien werden nicht benötigt.

Quell- und Auszughashes werden **vor** jeder Textnormalisierung geprüft. Ausschließlich CRLF beziehungsweise CR wird zu LF. Einrückungen, Leerzeichen und übriger Wortlaut bleiben erhalten; `.gitattributes` bewahrt deshalb die absichtlichen Leerzeichen am Zeilenende der fremden Texte in der erzeugten Datei. Die Datei hat UTF-8 ohne BOM, LF und feste Gruppenreihenfolge: „Im Web-Teil der App enthalten“, „In jsPDF eingebettete Bestandteile“, „In jsPDF-AutoTable eingebettete Bestandteile“, „Vom Build-Werkzeug eingefügter Hilfscode“, „Android-Bestandteile“, „Lizenztexte“. Apache-2.0 steht einmal im letzten Abschnitt; die Komponenten nennen ihre Lizenzkennung. Die erfassten Zusatzhinweise bleiben im Originalwortlaut. `--pruefen` vergleicht die Ausgabe bytegenau. Erfolg bleibt ohne Konsolenausgabe.

Die zentrale Auslieferungsprüfung umfasst npm-Pakete, eingebettete Einträge, gerenderten Hilfscode, Android-Projektmodule, Maven-Artefakte und deren eingebettete Bestandteile. Metadaten und installierte Paketmanifeste werden zusätzlich gegen Name, Version und Lizenzwahl geprüft. Werkzeugregeln dürfen gerenderten Code nicht freigeben. `scripts/check-licenses.json` führt zusätzlich BSL-1.0 in allen drei Bereichen. Die zwölf Übergangsangaben sind aufgelöst: FileSaver und omggif sind MIT, JPEGEncoder BSD-3-Clause, die vier Oxc-Hilfen und das Cordova-Gerüst MIT; sieben Fälle bleiben als entschiedene Einschränkungen gesondert erfasst.

### Bekannte Einschränkungen nach Entscheidung der Maintainer vom 2026-10-04

Die Entscheidung lautet: „In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.“

| Bestandteil in jsPDF 4.2.1 | Angabe und Originalhinweis |
|---|---|
| `src/libs/md5.js` | Joseph Myers nennt keine bestimmte Lizenz. Der Originalkopf einschließlich Bearbeitung durch Owen Leong wird wiedergegeben. |
| `src/libs/BMPDecoder.js` | Keine Lizenzangabe; Originalhinweis des Autors shaozilee und der getrennt gebundene Zusatz `@author soubok` werden wiedergegeben. |
| `src/libs/ttffont.js` | Keine Lizenzangabe; beide ursprünglichen Kopfkommentare werden wiedergegeben. |
| `src/libs/rgbcolor.js` | `@license Use it if you like it` mit dem vollständigen Originalkopf. |
| `src/libs/rc4.js` | Vollständiger FPDF-Wortlaut zu Nutzung und Einbettung. |
| `src/modules/standard_fonts_metrics.js` | MIT-Kopf und vollständiger Adobe-AFM-Hinweis. Der Bedingungsabsatz stimmt nach Entfernung der Kommentarmarken und Zusammenführung der Zeilen mit SPDX APAFML überein; die Urheberzeile in jsPDF nennt weniger Jahre als der SPDX-Vergleichstext. Der jsPDF-Originalwortlaut bleibt erhalten. |
| `src/libs/WebPDecoder.js` | Beide Originalköpfe: Google/WebM und MIT-Port von Dominik Homberger; zusätzlich die vollständigen libwebp-Texte COPYING und PATENTS als Bezug zu den von jsPDF genannten WebM-Adressen. |

Die feste Liste [`scripts/hinweise-ausnahmen.mjs`](../scripts/hinweise-ausnahmen.mjs) bindet Gruppe, Paketversion, Identität, wörtliche Angabe, Belegdatei und SHA-256, Datum und Entscheidung sowie den SHA-256 des vollständigen Wortlauts. Das Inventar kann sie nicht erweitern. Geänderte Angaben, Belege, Versionen, Entscheidungen oder Wortlaute und zusätzliche Ausnahmen scheitern im Normalmodus und im strengen Modus. Ein eigener gezählter Berichtseintrag nennt die sieben entschiedenen Einschränkungen; JSON enthält `zusammenfassung.entschiedeneLizenzen` und die einzelnen `entschiedeneLizenzen`. Neue unbekannte oder unzulässige Lizenzangaben bleiben in jedem Modus Fehler. Diese Prüfung kontrolliert den beschriebenen Bestand.

Weitere offen benannte Herkunftsgrenzen: `addimage.js` sagt wörtlich `// Image functionality ported from pdf.js`. Der Unicode-Datenkommentar in `bidiEngine.js` nennt `Based on:` und `https://github.com/mathiasbynens/unicode-8.0.0`. An diesen Stellen stehen weder Lizenz- noch Urheberangaben zum genannten Ursprung; Version und übernommener Umfang sind daraus nicht bestimmbar. Der vorhandene MIT-Kopf von bidiEngine nennt Alex Shensis, ist aber kein eigener Lizenzbeleg für das referenzierte Datenpaket. Beide Kommentare sind beim Eintrag der jsPDF-Modulköpfe bzw. bei bidiEngine wörtlich wiedergegeben. Der zusätzliche Kommentar in `context2d.js` verweist auf A. Riškus, einen Aufsatz zur Bézier-/Kreisbogen-Approximation aus 2006; er benennt einen algorithmischen Literaturbezug ohne eigenständige Lizenzangabe. Auch dieser Kommentar wird bei den Modulköpfen wiedergegeben. Die sieben festgelegten Einschränkungen werden dadurch nicht erweitert.

Die tatsächlich gebündelte fflate-Quelle vergleicht Teile des Codes mit UZIP.js und verlinkt `https://github.com/photopea/UZIP.js`; sie sagt zugleich, dass sich der überwiegende Code für Leistung und Bündelgröße davon entfernt hat. Zusätzlich stehen `// efficient algorithm from UZIP.js` und `// more algorithms from UZIP.js` wörtlich als gebundene Zusatzhinweise beim fflate-Eintrag. Die Kommentare nennen keine weitere Lizenz oder Urheberzeile. AutoTables `autoTableText` nennt einen Stack-Overflow-Beitrag als Inspiration, ohne dort eine weitere Lizenz oder einen Autor zu nennen. Diese Herkunftskommentare sind bei den Pakettexten erfasst; eigene Lizenzzuordnungen zu den referenzierten Ursprüngen werden daraus nicht abgeleitet.

Erfolgreiche CLI-Prüfungen sind ohne Ausgabe. `--json` gibt den Bericht ausdrücklich aus, einschließlich der gezählten Zeile zu den entschiedenen Einschränkungen. Fehler werden weiterhin mit ihren deutschen Meldungen und Exit-Code 1 ausgegeben.

Null-Ort-Versionen bleiben unabhängig belegt: Oxc durch die Quellkennung in Rolldown und zusätzlich durch die virtuellen Client-Modulkennungen, das Cordova-Gerüst durch `settings.gradle` und seine erzeugte `versionName`-Angabe `1.0`. Fehlende oder veränderte Belege sind Fehler; das erzeugte Projekt muss vor der Inventarprüfung vorhanden sein.

`--buendel` liest ein abgeschlossenes Client-Modulprotokoll im Format 2 aus
`app/.astro/`. Es nennt je Chunk Dateiname, Größe und SHA-256 der tatsächlich
geschriebenen Ausgabe. Der Abgleich prüft diese Bytes gegen `app/dist`, die
Importziele sowie die vollständige Menge der JS- und CSS-Ausgaben. Fehlende und
zusätzliche Dateien scheitern. CSS-Ausgaben haben ebenfalls Größe und SHA-256;
ihre genaue Zuordnung zu Quellmodulen liefert Vite/Rolldown hier nicht zuverlässig.
Deshalb scheitern **im Modulgraphen sichtbare** Stil- und Asset-Module aus
`node_modules` im gesamten Client-
**und Server-Modulgraphen** ausdrücklich, auch mit null gerenderten JS-Bytes.
Die Prüfung bildet die Abfrageleser von Vite und Astro nicht nach, sondern
verlangt eine geschlossene Form: Ein Modul aus `node_modules` wird nur
akzeptiert, wenn seine ganze Kennung ein einfacher Pfad mit der Endung `.js`,
`.mjs`, `.cjs` oder `.json` ist, ohne jeden Abfrageanhang. Jede andere Form
scheitert, auch übliche wie Teilmodule einer `.astro`-Datei aus einem Paket;
im App-Build kommt keine solche Form vor. Pfadsegmente, die ein Dateisystem
ohne Unterscheidung der Schreibweise oder Windows demselben Ordner zuordnet
(andere Groß-/Kleinschreibung von `node_modules`, Segmente mit Punkt oder
Leerzeichen am Ende, Kurzformen mit `~` und Ziffer), scheitern ebenfalls.
Virtuelle Kennungen scheitern bei Stil-Endungen und bei Abfragen für
Ressourcen (`url`, `raw`, `inline`, `worker`, `sharedworker`).
**Grenze:** CSS-`@import` und CSS-`url(...)` in eigenen CSS-Dateien oder
Style-Blöcken sowie `new URL(..., import.meta.url)` können Fremdinhalte
übernehmen, ohne deren Herkunft als Fremdmodul im Graphen auszuweisen. Diese
Wege werden nicht durch eine statische Prüfung der eigenen Quellen gesperrt.
Der Abgleich bestätigt dafür keine Herkunftsabdeckung; sie benötigen eine
gesonderte Inhaltsprüfung. Eine Mustersuche wäre kein belastbarer Ersatz für
die Auswertung der CSS-, Astro- und Skriptsyntax.
Serverseitig erzeugtes HTML, eingebettete Assets, Inhalte aus öffentlichen
Dateien und von Erweiterungen direkt erzeugte Assets brauchen weiterhin eine
Inhaltsprüfung; das Modulprotokoll beweist ihre vollständige Herkunft nicht.

Jeder Paketort mit `renderedLength > 0` muss erfasst sein, und jeder mit
`imBuendel: true` markierte Eintrag muss vorkommen. Verschachtelte Paketorte
werden unterschieden. Nur der bereinigte Dateipfad entscheidet über den Paketort;
Abfrageanhänge werden getrennt geprüft. Repositoryinterne absolute Modulpfade
werden vor der Prüfung relativiert, auch in virtuellen Kennungen. Absolute Pfade,
Laufwerkskennungen, UNC- und Windows-Namensraumpfade sind im gespeicherten
Dateipfad verboten. Im einmal URL-dekodierten Abfrageanhang sind `//`, jeder
Backslash und jedes Laufwerksmuster wie `C:` an jeder Stelle verboten;
ein `/` am Anfang oder nach den geprüften Trennzeichen (auch Anführungszeichen)
scheitert ebenfalls. Virtuelle
Hilfen werden in beiden Richtungen anhand ihrer genauen Kennungen abgeglichen.
Reine JS-Re-Exporte ohne gerenderte Bytes gelten nicht als eigener ausgelieferter
Code; der Stil-/Asset-Schutz gilt trotzdem.

Das Plugin in `scripts/modulprotokoll.mjs` sammelt mehrere Client-Ausgaben und
lehnt gleiche Chunk-Dateinamen ab. Vor dem Build werden altes Protokoll und
Zwischendatei entwertet. Bis zum vollständigen Astro-Build liegt nur eine
Zwischendatei mit `abgeschlossen: false` vor; erst der Abschluss prüft die
Ausgaben erneut und veröffentlicht das Protokoll atomar mit
`abgeschlossen: true`. Ein abgebrochener Build hinterlässt kein gültiges
Protokoll. Das sortierte JSON mit LF wird ausschließlich nach `app/.astro/`
geschrieben, ohne Konsolenausgabe und ohne Änderungen an `dist`.
`.astro/` ist von Git ausgeschlossen. Vites `build.license` wird nicht verwendet.

`--gradle-modell` liest den `package`-Abschnitt des Release-Lint-Modells über
`leseQuellXml` und den Parser des JDK. Zugelassen sind ausschließlich die am
Release-Modell geprüften Formen: `dependencies` ohne Attribute,
`compile` und `package` mit optionalem `roots` sowie blattförmige
`dependency` mit `name` und optionalem `simpleName`. Unbekannte Knoten
und Attribute scheitern auch im Compile-Abschnitt. Ein konstruierter Ausschnitt
steht unter `scripts/pruefdaten/gradle-release-ausschnitt.xml`. Maven-Koordinaten
und Projektmodule werden in beiden Richtungen verglichen; DTD und externe
Entitäten sind ausgeschlossen. Ein Compile-Abschnitt ersetzt Package nicht.

`app-bauen.mjs` liest das Modell im selben Lauf nach erfolgreichem
`assembleRelease` (auch mit `:app:`-Präfix); fehlt es, scheitert der Lauf. Der
direkte Lizenzlauf mit `--gradle-modell` liest die angegebene Datei. Es gibt keine
Zeitregel zwischen Modell und APK. **Grenze: kein kausaler Herkunftsnachweis
zwischen Modell und APK.** Weder Erzeugung im aktuellen Lauf noch zugehörige
Artefakthashes werden belegt; Gradle kann Ausgaben wiederverwenden. Das Modell
belegt weder vollständige Lizenzhinweise noch jeden eingebetteten AAR-/JAR-Anteil.

Die Inhaltsprüfung vom 2026-10-05 umfasst die tatsächlich aufgelöste Browserquelle `dist/jspdf.es.min.js` und alle 46 Quellen ihrer Quellkarte. Der vollständige Bündelkopf einschließlich Contributor-Zeilen steht beim npm-Eintrag und ist an Datei, [0, 2700), Quellhash und Auszughash gebunden. Die Paket-LICENSE bleibt zusätzlich: Ihre Urheberzeilen sind nicht wortgleich zum Bündelkopf (unter anderem URL-Schreibweise und zusätzliche Namen im Kopf), obwohl beide denselben MIT-Erlaubnis- und Haftungstext enthalten. Die 13 eingebetteten jsPDF-Einträge enthalten die Bibliotheksköpfe, beide WebP-Köpfe, Adobe-AFM, die Modulköpfe und die ergänzten Autoren-/Herkunftskommentare. JPEGEncoder nennt zusätzlich Andreas Ritter; BMPDecoder erhält den soubok-Kommentar als unabhängig geprüften Zusatz, damit seine feste Ausnahmebindung bytegleich bleibt.

Die systematische Kommentarsuche nach `@author`, `ported`, `based on`, `derived`, `adapted`, `Copyright`, `(c)` und `License` wurde um Autoren-, Inspirations- und Ähnlichkeitsangaben ergänzt. Die erfassten Autoren- und Lizenzhinweise sowie die oben ausdrücklich als wiedergegeben bezeichneten Herkunftskommentare stehen im Hinweistext. Technische Treffer wie `supported`, `exported`, `(color...)`, Implementierungsbeschreibungen mit `based on` sowie `Store copyright information` sind keine zusätzlichen Urheber- oder Herkunftsangaben. Die übrigen sieben Web-Pakete wurden anhand der erfassten Client-Ursprungsmodule gelesen. Ihre Urheber- und Lizenzköpfe nennen keine zusätzlich fehlenden Urheber; der Microsoft-0BSD-Kopf in AutoTable und die Zlib-/Port-Urheber in pako waren bereits erfasst. Die Paketauflösung bestätigt jsPDFs Browser-Eintrag und AutoTables Import-Eintrag; ein neuer Projektbuild wurde für diese Inhaltsprüfung nicht ausgeführt.

Die erneute Offline-Suche vom 2026-10-06 nach den Teilzeichenfolgen `from`, `UZIP`, `zlib` und `port` (ohne Beachtung der Groß-/Kleinschreibung) umfasst 27 Client-Ursprungsmodule der acht Web-Pakete und alle 46 jsPDF-Quellkartenquellen. Sie ergibt 283 Kommentarblöcke: Babel 0, Capacitor 1, fast-png 1, fflate 30, iobuffer 2, jsPDF 126, AutoTable 8 und pako 115. Die Treffer umfassen auch technische Wörter wie `supported` und `exports`, Formatbeschreibungen und bereits wiedergegebene Lizenztexte. Zusätzlich zu den erfassten Köpfen und Herkunftssätzen wurden folgende Verweise gelesen:

| Quelle | Kommentar / Einordnung |
|---|---|
| `fflate/esm/browser.js`, Zeilen 5–7, 434 und 454 | UZIP-Eingangskommentar und beide Algorithmuskommentare; wörtlich im Hinweistext. |
| `fflate/esm/browser.js`, Zeilen 60 und 438 | `// reverse table algorithm from SO` und `// see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/`; Algorithmus-/Diskussionsverweise ohne zusätzliche Urheber- oder Lizenzangabe. |
| `jspdf-autotable/dist/jspdf.plugin.autotable.mjs`, Zeile 1 | Stack-Overflow-Inspiration; bereits wörtlich im Hinweistext. |
| jsPDF-Quellkarte, `../src/libs/md5.js`, Zeile 1; auch Bündelzeile 58 | `Accessed from: http://www.myersdaily.org/joseph/javascript/md5.js`, Joseph Myers und Owen Leong; bereits erfasster Originalkopf und bestehende Einschränkung. |
| jsPDF-Quellkarte, `../src/modules/addimage.js`, Zeile 200 | `// Image functionality ported from pdf.js`; bereits erfasster Herkunftssatz ohne eigenen Lizenzbeleg. |
| jsPDF-Quellkarte, `../src/libs/JPEGEncoder.js`, Zeile 33 | Port von Andreas Ritter; bereits erfasster Originalkommentar. |
| jsPDF-Quellkarte, `../src/libs/JPEGEncoder.js`, Zeilen 854 und 910 | `/* The rotator is modified from fig 4-8 to avoid extra negations. */`; technischer Figurenbezug ohne Autor oder Lizenz. |
| jsPDF-Quellkarte, `../src/modules/context2d.js`, Zeile 2528 | Kreisbogen-/Bézier-Literaturbezug zu A. Riškus; bereits erfasster Kommentar. |
| jsPDF-Quellkarte, `../src/modules/jpeg_support.js`, Zeile 33 | `//Algorithm from: http://www.64lines.com/jpeg-width-height`; Algorithmusverweis ohne Autor oder Lizenz. |
| jsPDF-Quellkarte, `../src/libs/omggif.js`, Zeile 172; `../src/libs/bidiEngine.js`, Zeilen 2082, 2222, 2255, 2407, 2475 und 2521 | Technische Spezifikationsverweise (`From the spec`, Unicode TR9); keine zusätzliche Urheber- oder Lizenzangabe. |
| `pako/dist/pako.esm.mjs`, Zeilen 45 und 56 | `// From zutil.h` und `// From deflate.h`; interne Zlib-Quellverweise innerhalb des bereits erfassten Zlib-/Port-Bestands. Weitere Zlib-Treffer beschreiben das Datenformat oder gehören zu den erfassten Lizenzbedingungen. |

Diese Suche ist keine vollständige Herkunfts- oder Lizenzzuordnung aller algorithmischen Verweise. Kommentare ohne Urheber- oder Lizenzangabe begründen keine zusätzliche Lizenzwahl; die sieben entschiedenen Einschränkungen bleiben unverändert.

Der Generator verlangt für die geprüften Versionen den vollständigen jsPDF-Bündelkopf und genau die drei benannten Kotlin-Bestandteile. Fehlende Köpfe oder Bestandteile, geänderte Auszüge und BSL-1.0 ohne vollständigen Text scheitern bereits vor der Neuerzeugung. Geschlossene Feldlisten lassen Bestandteile und Zusatzhinweise nur auf der Hauptebene zu; verschachtelte oder unbekannte Felder scheitern in jedem Modus. Zusatzinhalte sind außerdem nur an Einträgen zulässig, die der Auslieferungsprüfung unterliegen: nicht bei Lockfile-Ausnahmen und nicht bei npm- oder Hilfscode-Einträgen außerhalb des Bündels. Ausgabe und zentrale Lizenzprüfung verarbeiten damit dieselbe flache Struktur; alle Bestandteillizenzen unterliegen der Auslieferungsregel. Gegenproben belegen auch, dass ein Hauptwortlaut gleich der gemeinsamen Apache-LICENSE die Zusatzhinweise, drei Kotlin-Herkunftssätze und den Boost-Text weiter ausgibt. Das Entfernen anderer eingebetteter Inventareinträge fällt weiterhin nicht automatisch auf. Der Abgleich ersetzt deshalb die eigenständige Inhaltsprüfung nicht; sie ist bei einem veränderten Bündel zu erneuern.

Die Prüfung liest Lizenz- und Hinweisdateien, bewertet deren Vollständigkeit jedoch nicht automatisch. Die beiden npm-Pakete bündeln im unten geprüften Stand keinen Fremdcode. Ihre Fremdabhängigkeiten werden über die Paketmanifeste angegeben. Gesammelte Originalhinweise und Lizenztexte tatsächlich gebündelter Fremdanteile gehören zum bündelnden Gastgeber, etwa zur Website, und offline lesbar in die App. Die Hinweise der App sind für den oben genannten Bestand ergänzt und bei geänderten Bündeln zu erneuern. Eine Kennung in diesem Dokument ersetzt die Texte nicht. Auch Werkzeugpakete wie Rolldown und sharp enthalten weitere, nicht als eigene Lockfile-Pakete erfasste Anteile.

`LICENSE` und `NOTICE` in der Wurzel müssen lesbar und nicht leer sein. Ihre Kopien in jedem npm-Workspace unter `packages/` werden bei jedem Lauf byteweise verglichen. `.gitattributes` legt LF fest. Das [Manifest der Oberfläche](../packages/oberflaeche/package.json) führt am unten geprüften Stand `src`, `README.md`, `LICENSE` und `NOTICE` unter `files`. Die frühere Angabe, die Auslieferungsdateien seien noch einzutragen, ist damit überholt.

`--packliste <Datei>` prüft zusätzlich die unveränderte JSON-Ausgabe eines vorherigen `npm pack --dry-run --json --offline --ignore-scripts`: erwartete npm-Pakete und Versionen, `package.json`, vollständige Hinweisdateien und passende Größen. Die App wird nicht als npm-Paket erwartet. Leere, doppelte oder unvollständige Listen führen zu Code 1. Der Trockenlauf ersetzt keine Sichtung eines tatsächlich erzeugten Archivs. Grundlage: npm-Dokumentation zu [`files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) und [`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/).

### Paketinhalt

Beide Workspaces gehören in **einen** Aufruf. Die unveränderte Ausgabe enthält dann beide Paketbeschreibungen und kann vollständig an die Lizenzprüfung übergeben werden:

```text
npm pack --dry-run --json --offline --ignore-scripts --workspace packages/kern --workspace packages/oberflaeche
```

Die Messungen vom **2026-10-04** ergaben unter Windows mit Node **22.23.2** und npm **10.9.8** sowie unter Debian **13.5** mit Node **24.21.0** und npm **11.19.0** dieselben Werte. Die Paketquellen sind in beiden Messungen gleich (unverändert seit `7fd6c90`): unter Windows im Arbeitsstand auf Basis `7fd6c90`, unter Debian in einem frischen Checkout von `4337bb2`. Beide Messungen verwenden die Regeln aus `.gitattributes` einschließlich der LF-Festlegung für `packages/*/package.json` und `packages/*/README*.md`; die Paketdateien enthalten LF:

| Paket, Version | Dateien | `size` in Bytes | `unpackedSize` in Bytes | `shasum` | `bundled` |
|---|---:|---:|---:|---|---|
| `@baremos/fristenrechner-kern`, `0.0.0` | 13 | 42 438 | 177 155 | `97fa402039df83156c721df0553fdf50e4065b70` | `[]` |
| `@baremos/fristenrechner-ui`, `0.0.0` | 19 | 58 114 | 212 915 | `fb7850e153497b2d360b633d0465a753a5bc5ffb` | `[]` |

Das sind die von npm im Trockenlauf gemeldeten Archivgrößen, entpackten Größen und SHA-1-Prüfsummen. Die Packliste enthält beim Kern zehn Dateien unter `dist` sowie `package.json`, `LICENSE` und `NOTICE`; bei der Oberfläche fünfzehn Quelldateien unter `src` sowie `package.json`, `LICENSE`, `NOTICE` und `README.md`. `bundled` ist bei beiden leer. Andere Zeilenenden verändern Größen und Prüfsummen.

Am **2026-10-04** bestätigte der Offline-Gegencheck in einem frischen Linux-Checkout die Tabellenwerte, und die Offline-Verbraucherprobe nach dem README-Beispiel mit **Astro 7.3.3** bestand `astro build` und `astro check` ohne Fehler: Alle 16 Quellen im Bündel kamen aus den tatsächlich erzeugten npm-Archiven, keine aus dem Workspace.

Am **2026-10-15** bestand `scripts/npm-pakete.mjs --ohne-cr` am Stand `8b17927` unter Windows mit Node **24.21.0** und npm **11.19.0** mit folgenden Werten:

| Paket, Version | Dateien | Gepackt in Bytes | Entpackt in Bytes | SHA-1 (`shasum`) | Gebündelte Abhängigkeiten |
|---|---:|---:|---:|---|---|
| `@baremos/fristenrechner-kern`, `0.1.0` | 14 | 43 103 | 178 680 | `6de117f02d02cf3713f04c88e12fc04e00403fad` | keine |
| `@baremos/fristenrechner-ui`, `0.1.0` | 19 | 61 345 | 223 928 | `ed5c7417b693d6cbca0e30946223d2f171c9c2f3` | keine |

Am **2026-10-16** wurden die beiden Archive aus dem seit `8b17927` unveränderten Paketstand mit `npm pack --ignore-scripts` tatsächlich erzeugt; Dateizahlen, gepackte und entpackte Größen sowie SHA-1-Prüfsummen bestätigen die Tabellenwerte vom Vortag. Die SHA-256-Prüfsummen der Archive lauten:

| Paket, Version | SHA-256 |
|---|---|
| `@baremos/fristenrechner-kern`, `0.1.0` | `4445468d7569a1be9fcca5358122a7bc19f04a4b0a88fbd0997fe040bf2b6b70` |
| `@baremos/fristenrechner-ui`, `0.1.0` | `51ead4ec734febdfa1717e2548c37f820e8e2c1e9872f659ad552004671f4900` |

Die Verbraucherprobe vom **2026-10-16** unter Windows mit Node **22.23.2**, npm **10.9.8** und Astro **7.3.3** aus der Repository-Wurzel band beide Archive in ein leeres Astro-Projekt ein. `astro build` und `astro check` bestanden ohne Fehler und ohne Warnungen. Laut Quellkarten stammen alle 16 eingebundenen Quellen der beiden Pakete aus den Archiven, keine aus dem Workspace.

Die Linux-Gegenprobe vom **2026-10-16** unter Debian **13** mit Node **24.21.0** und npm **11.19.0** ohne Netz und ohne Lebenszyklusskripte ergab zu Windows bytegleiche Archive mit identischen SHA-256- und SHA-1-Prüfsummen. Veröffentlicht waren die Pakete damit nicht; die Herkunftsangaben `homepage` und `repository` fehlten in diesem Paketstand noch.

Das Prüfskript [`scripts/npm-pakete.mjs`](../scripts/npm-pakete.mjs) führt den kombinierten Trockenlauf und anschließend `node scripts/check-licenses.mjs --packliste <Datei>` selbst aus:

```text
node scripts/npm-pakete.mjs --ausgabe scratchpad/npm-pakete-lauf
node scripts/npm-pakete.mjs --ausgabe scratchpad/npm-pakete-lauf-lf --ohne-cr
```

`--ohne-cr` verlangt zusätzlich Paketdateien ohne CR-Zeichen und ist auch unter Windows für einen Checkout mit den geltenden LF-Regeln vorgesehen. In einer älteren Windows-Arbeitskopie können trotz aktualisierter `.gitattributes` noch CRLF-Dateien liegen; ein sauberer Git-Status schließt das nicht aus. Betroffene Paketmanifeste und READMEs müssen dann unter Erhalt eigener Änderungen mit den neuen Regeln erneut ausgecheckt werden, bevor dieser Aufruf bestehen kann.

Der Ausgabeordner ist Pflicht und muss neu oder leer sein. Innerhalb des eigenen oder eines anderen Git-Checkouts sind dafür nur Unterordner von dessen `scratchpad/` zulässig; außerhalb eines Checkouts ist auch ein anderer neuer oder leerer Ordner erlaubt. Die Prüfung löst vorhandene Verknüpfungen auf; Ausgaben über symbolische Links aus dem eigenen Repository sowie UNC- und Windows-Namensraumpfade werden abgelehnt. Alle erzeugten Dateien bleiben im Ausgabeordner: `ergebnis.json`, `packliste.json`, der Vergleichsbuild unter `kern-dist/`, temporäre Dateien unter `tmp/`, npm-Zwischenspeicher unter `npm-cache/` und npm-Protokolle unter `npm-logs/`. Je erreichtem Werkzeugschritt entstehen außerdem `<Schritt>.stdout.txt` und `<Schritt>.stderr.txt`; die Schritte heißen `stand`, `git-status`, `npm-version`, `git-dateien`, `tsc`, `pack` und `lizenzen`.

Der Bericht nennt `HEAD` unter `stand` und erläutert die Bezugsgröße unter `standHinweis`. Vor dem Build und Packlauf prüft das Skript mit Git alle verfolgten, vorgemerkten und unverfolgten Änderungen unter `packages/`; ignorierte Build-Ausgaben wie `dist` sind davon ausgenommen. Der Bericht enthält den Zustand unter `arbeitskopie.sauber` und die Änderungen unter `arbeitskopie.aenderungen`. Ungesicherte Paketänderungen brechen den Lauf ab. Die eigentlichen Bytes des ignorierten `dist` prüft der folgende Vergleichsbuild. Werkzeugergebnisse stehen unter `werkzeuge` mit Rückgabewert, Signal und Fehlercode; `lizenzenGeprueft` und `lizenzenStatus` nennen den Zustand der Lizenzprüfung.

Rückgabewerte sind 0 für bestanden, 1 für Prüf- oder Werkzeugfehler und 64 für einen fehlerhaften Aufruf. Die vollständigen Meldungskennungen sind:

| Kennung | Bedeutung |
|---|---|
| `NPM_AUFRUF` | Argumente oder Ausgabeort unzulässig. |
| `NPM_DIST` | Kern-Ausgabe fehlt oder weicht vom Vergleichsbuild ab. |
| `NPM_LISTE` | Packliste, Paketmetadaten oder Angaben zu gebündelten Abhängigkeiten unzulässig. |
| `NPM_PFAD`, `NPM_DATEI` | Paketpfad, Dateimenge, Lesbarkeit oder Dateigröße unzulässig. |
| `NPM_CR` | Paketdatei enthält bei `--ohne-cr` ein CR-Zeichen. |
| `NPM_IMPORT` | Relativer Import fehlt oder die Verweisform kann nicht statisch geprüft werden. |
| `NPM_README`, `NPM_EINSTIEG` | README oder Paket-Einstieg fehlt beziehungsweise ist unzulässig. |
| `NPM_VERSION` | Paketversionen oder Kern-Abhängigkeit stimmen nicht überein. |
| `NPM_GIT`, `NPM_NPM` | Ungesicherte Paketänderungen, leere Git-Dateiliste oder unbrauchbare lokale npm-Kommandozeile. |
| `NPM_STAND`, `NPM_GIT_STATUS`, `NPM_NPM_VERSION`, `NPM_GIT_DATEIEN`, `NPM_TSC`, `NPM_PACK`, `NPM_LIZENZEN` | Fehler im jeweils benannten Werkzeugschritt. |
| `NPM_WERKZEUG`, `NPM_AUSGABE` | Sonstiger Ausführungsfehler beziehungsweise Ergebnisdatei nicht schreibbar. |

Vor dem Packlauf baut das Skript den Kern mit dem vorhandenen TypeScript-Compiler in einen Vergleichsordner und vergleicht Dateiliste und Inhalt byteweise mit `packages/kern/dist`. Das lässt den Paketbaum unverändert und erkennt auch zusätzliche alte Dateien, die ein bloßer Neubau stehen lässt. Fehlt `dist` oder weicht es ab, scheitert die Prüfung; vor einem neuen Lauf muss `packages/kern/dist` entfernt und der Kern ausdrücklich neu gebaut werden.

Beim Kern sind nur `dist/*.js`, `dist/*.d.ts`, `package.json`, `LICENSE`, `NOTICE` und eine vorhandene README erlaubt. Die `dist`-Dateimenge in der Packliste muss dem frischen Vergleichsbuild entsprechen; jede JavaScript-Datei benötigt ihre zugehörige `.d.ts`. Bei der Oberfläche werden genau die von Git verfolgten Dateien unter `src` sowie `package.json`, `LICENSE`, `NOTICE` und `README.md` erwartet. Tests, Referenzdaten, `scratchpad` und `node_modules` sind ausgeschlossen. Die Konstante `KERN_README_PFLICHT` ist `true`; die README-Pflicht des Kerns ist aktiviert.

Die Prüfung verlangt `exports` mit einem nutzbaren Haupteinstieg, Zielen mit `./` und ohne gemischte Schlüssel für Bedingungen und Unterpfade. Ziele aus `exports`, `main`, `module`, `types` und `typings` müssen konkrete Dateien der Packliste sein. Die zusätzlichen Auflösungsfelder `browser` und `typesVersions` werden derzeit abgewiesen.

Statisch erkennbare relative Verweise werden gegen die Packliste geprüft. Der vorhandene TypeScript-Parser liest JavaScript- und TypeScript-Verweise; der Astro-Compiler bestimmt Vorspann, Skript- und Stilbereiche. Erfasst werden Import- und Exportanweisungen einschließlich Importtypen und `require`, relative Triple-Slash-Verweise und Moduldeklarationen, statische `new URL(..., import.meta.url)`-Ziele, Astro-Skriptquellen sowie CSS-`@import` und `url`. Berechnete Import- und URL-Ziele, dynamische Astro-Skriptquellen, `import.meta.glob` beziehungsweise `globEager` und CSS-`image-set` beziehungsweise `-webkit-image-set` scheitern ausdrücklich.

Relative `.js`-Ziele in `.d.ts` müssen zur entsprechenden `.d.ts` führen. Bei endungslosen Importen der Oberfläche werden `.mjs`, `.js`, `.mts`, `.ts`, `.jsx`, `.tsx` und `.json` sowie entsprechende `index`-Dateien gesucht; `.astro` ist keine ergänzte Endung. Paketimporte werden nicht gegen Abhängigkeitsangaben oder die `exports` des Zielpakets aufgelöst. Die Prüfung ersetzt deshalb keinen Build im einbindenden Projekt. Beide Pakete müssen dieselbe Version tragen, und die Kern-Abhängigkeit der Oberfläche muss genau diese Version angeben. `bundled` in der Packliste muss leer sein; `bundleDependencies` und `bundledDependencies` im Manifest dürfen nur fehlen oder leere Listen sein.

### Ablauf der Veröffentlichung

Die Maintainer haben die Veröffentlichung am 2026-10-16 freigegeben. Am selben Tag sind `@baremos/fristenrechner-kern` und `@baremos/fristenrechner-ui` in Version 0.1.0 durch das npm-Konto `baremos` im Namensraum `@baremos` veröffentlicht worden. Die Archive stammen nach den Schritten 1 bis 3 aus einem sauberen Linux-Checkout des öffentlichen Repositorys am Stand `541d0a3`. Die Archive in der Registry sind bytegleich zu den vorher geprüften (SHA-1 `0218127bd750466635eef2efa055362a350b580b` für den Kern, `20f44b9f3806e324f41e5cd3bdf74d21a258fe4e` für die Oberfläche). Eine Installation der Oberfläche aus der Registry in einem leeren Ordner bezog den Kern 0.1.0 aus der Registry. In beiden Paketen ist `private: true` entfernt, `publishConfig.access` steht auf `public`, und `homepage`, `author`, `repository` und `bugs` sind gesetzt. Für jede weitere Version gelten dieselben Schritte:

1. Aus einem sauberen Linux-Checkout mit den festgelegten Werkzeugversionen arbeiten und die Versionen von Kern und Oberfläche im Gleichschritt halten.
2. `packages/kern/dist` entfernen und den Kern ausdrücklich mit `npm run build --workspace packages/kern --offline` neu bauen. Der Kern hat kein `prepack`- oder `prepublishOnly`-Skript; außerdem schaltet `.npmrc` mit `ignore-scripts=true` Lebenszyklusskripte ab. `npm pack` und `npm publish` bauen den Kern daher nicht.
3. `node scripts/npm-pakete.mjs --ausgabe scratchpad/npm-pakete-freigabe --ohne-cr` ausführen und Packliste, Prüfbericht sowie anschließend die tatsächlich erzeugten Archive prüfen. Die README-Pflicht des Kerns ist aktiviert.
4. Nach gesonderter Veröffentlichungsfreigabe zuerst den Kern, danach die Oberfläche mit derselben Version veröffentlichen. Die Oberfläche erst veröffentlichen, wenn die Registry den Kern mit der erwarteten Prüfsumme liefert.

Am 2026-10-22 sind beide Pakete in Version 0.1.1 durch das npm-Konto `baremos` veröffentlicht worden, zuerst der Kern, danach die Oberfläche. Die Archive stammen nach den Schritten 1 bis 3 aus einem sauberen Linux-Checkout des öffentlichen Repositorys am Stand `97a8860`. Die Archive in der Registry sind bytegleich zu den vorher geprüften (SHA-1 `dbc543a3accd209816ea3c5fc53413cbd1c013cf` für den Kern, `1e253797b7a69a39a830964b8b412e88f2e98b42` für die Oberfläche).

### Verbleibende Arbeit

Offen bleiben:

1. Die MIT-Ausnahme für `rgbcolor` spätestens zu ihrem Ablauf am 2027-09-29 erneut prüfen; bei Versions- oder Metadatenänderungen muss sie angepasst oder entfernt werden.
2. Die Paketprüfung bei jeder neuen Paketversion aus einem sauberen Linux-Checkout mit `--ohne-cr` wiederholen; für Version 0.1.0 erledigt am 2026-10-16, für Version 0.1.1 am 2026-10-22.
3. Vor jeder Veröffentlichung die erzeugten `.tgz`-Archive sichten (für Version 0.1.0 erledigt am 2026-10-16) und vor der Einbindung in eine Website deren eigene Hinweise prüfen; die Einbindung der Archive am eingefrorenen Paketstand ist durch die Verbraucherprobe vom 2026-10-16 bestätigt. Die Inhaltsprüfung des App-Web- und Android-Laufzeitbestands mit Originalhinweisen stammt vom 2026-10-05; die automatischen Bündel-, Hinweis- und Gradle-Modellabgleiche sind am 2026-10-15 erneuert. Nach Bündeländerungen ist die Inhaltsprüfung zu erneuern.
4. Die im lokalen Endstandlauf belegte Behandlung des optionalen sharp-Baums und der weiteren vorgebauten Bestandteile bei Änderungen am Build-Baum erneut prüfen; Quelle und Grenzen: [F-Droid-Nachweis](fdroid-build.md).
5. Android- und Gradle-Abhängigkeiten ergänzen; **teilweise erledigt am 2026-10-04 für `7fd6c90`**: [Laufzeitmodule mit POM-Lizenzangaben und APK-/SUSS-Abgleich](#android--und-gradle-abhängigkeiten) sind erfasst. Die [Gradle-Prüfsummen](toolchain.md#gradle-prüfsummen) sind seit dem 2026-10-05 umgesetzt. Die Hinweise Dritter einschließlich der eingebetteten Laufzeitanteile sind am 2026-10-05 ergänzt; Werkzeugliste und Werkzeug-Lizenzregel bleiben offen. Die npm-Liste erfasst diese Gradle-Abhängigkeiten weiterhin nicht.
6. Entscheiden, ob zusätzlich zu `package-lock.json` eine erzeugte vollständige Abhängigkeitsliste mit Bereichen und Wegen eingecheckt wird, und ihren Aktualisierungsweg festlegen. Die Entscheidung ist offen; derzeit wird diese Liste mit `node scripts/check-licenses.mjs --json` erzeugt.

Ein erfolgreicher Metadatenlauf belegt weder die Vollständigkeit fremder Lizenzangaben noch sämtliche Weitergabepflichten oder die F-Droid-Tauglichkeit. Proprietäre Dienste werden nicht anhand eines Lizenzfelds erkannt. Der tatsächliche Offline-Betrieb und das Android-Manifest gehören zur Abnahme der vollständigen App.
