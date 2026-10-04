# Lizenzen und Abhängigkeiten

Stand: **2026-10-04**, geprüfter App-Endstand `5e6f230`, Nachweisstand `49dd420`; Android-Laufzeitinventar am Stand `9ae4cd9`. Die npm-Bestandszahlen und einzeln gelesenen npm-Paketbelege unten stammen aus der Bestandsaufnahme vom **2026-09-29** mit Capacitor 8.5.2, dem npm-Lockfile im Format 3 und der damaligen Windows-Installation. Sie sind historische Angaben, keine neu erhobene npm-Bestandsliste. Dieses Dokument beschreibt Projektregeln und Paketbelege, keine Rechtsauskunft. Die [Android- und Gradle-Abhängigkeiten](#android--und-gradle-abhängigkeiten) sind unten gesondert erfasst; Werkzeugfestlegungen und Build-Nachweise behandeln [toolchain.md](toolchain.md) und [fdroid-build.md](fdroid-build.md).

Das Projekt steht unter Apache-2.0. Der Wortlaut liegt in `LICENSE`, der Herausgeberhinweis in `NOTICE` in der Wurzel des Repositorys.

## Lizenzprüfung am Endstand

Am 2026-10-03/04 bestand die npm-Lizenzprüfung in einer frischen Windows-Kopie mit Node 22.23.2 und npm 10.9.8 sowie unter Debian 13.5 mit Node 24.21.0 und npm 11.19.0, auch in der sauberen Kopie vor dem F-Droid-Lauf. Quelle sind die Abschlussprotokolle vom 2026-10-03/04, zusammengefasst in [app.md](app.md) und [fdroid-build.md](fdroid-build.md). Diese Ergebnisse erneuern den Nachweis der Metadatenprüfung; sie belegen weder vollständige Originalhinweise noch die Lizenzen aller eingebetteten und von Gradle geladenen Anteile.

Der lokale F-Droid-Lauf am 2026-10-04 mit fdroidserver 2.4.2-1 am Nachweisstand `49dd420` bestand mit gezielter Bereinigung ohne `scandelete`, ohne Scannerfehler und ohne Beanstandung der Auswertung. Die Bereinigung und die Inventare sind in [fdroid-build.md](fdroid-build.md) belegt. Ein F-Droid-Buildserver war nicht beteiligt. Die unten beschriebenen Weitergabepflichten und offenen Prüfungen bleiben davon getrennt.

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
| Zlib | ja | ja | Permissiv; Herkunft nicht falsch darstellen, geänderte Quellen kennzeichnen, Hinweis in Quellweitergaben erhalten. Für die Auslieferung zugelassen. [Text](https://spdx.org/licenses/Zlib.html); lokal auch `pako/lib/zlib/deflate.js`. |
| GPL-3.0-or-later | nein, nur bekannt | nein, nur bekannt | Freie Copyleft-Lizenz mit Pflichten insbesondere bei Weitergabe von Quellen und Binärdateien. Die Projektliste erlaubt keinen GPL-Zweig, kennt aber die Kennung zur vollständigen Prüfung von Alternativen. Das ist keine Einstufung als proprietär. [GPL, insbesondere Abschnitte 4–6 und 14](https://spdx.org/licenses/GPL-3.0-or-later.html). Im aktuellen Baum kommt die Kennung nicht mehr vor. |
| BSD-2-Clause | ja | nein | Permissiv; Urheberhinweis, Bedingungen und Haftungsausschluss in Quellen bzw. bei Binärweitergabe in Dokumentation oder Begleitmaterial erhalten. [Text](https://spdx.org/licenses/BSD-2-Clause.html); lokale LICENSE-Dateien der acht Pakete unten. |
| 0BSD | ja | ja | Erlaubt Nutzung, Änderung und Weitergabe ohne zusätzliche Hinweispflicht im Lizenztext; Haftungsausschluss. Verlangt weniger als MIT. Vorhandene Hinweise bleiben erhalten. Für die Auslieferung zugelassen, seit `tslib` über `@capacitor/core` zur App gehört. [Text](https://spdx.org/licenses/0BSD.html); `tslib/LICENSE.txt`. |
| Unlicense | ja | nein | Widmung an die Gemeinfreiheit mit ersatzweiser, uneingeschränkter Erlaubnis und Haftungsausschluss. Nur für Werkzeuge aufgenommen. [Text](https://spdx.org/licenses/Unlicense.html); `big-integer/LICENSE`, `stream-buffers/UNLICENSE`. |
| BlueOak-1.0.0 | ja | nein | Weite Urheber- und Patenterlaubnis; Empfänger müssen Lizenztext oder Lizenzlink erhalten. Bei schriftlich gerügtem Hinweisverstoß nennt der Text eine Heilungsfrist von 30 Tagen. [Text](https://spdx.org/licenses/BlueOak-1.0.0.html); lokale LICENSE.md-Dateien der drei Pakete unten. |
| CC0-1.0 | ja | nein | Verzicht auf die erfassten Rechte mit ersatzweiser Nutzungserlaubnis; keine Freigabe von Marken- oder Patentrechten, Haftungsausschlüsse beachten. [Text](https://spdx.org/licenses/CC0-1.0.html); `mdn-data/LICENSE` in beiden Versionen. |
| Python-2.0 | ja | nein | Erlaubt Nutzung und Bearbeitung unter Erhalt der Lizenz- und Urheberhinweise; bei Weitergabe von Bearbeitungen Änderungen zusammenfassen, Namens-/Markenbeschränkungen beachten. [Text](https://spdx.org/licenses/Python-2.0.html); `argparse/LICENSE` mit PSF-, BeOpen-, CNRI- und CWI-Abschnitten. |
| LGPL-3.0-or-later | ja | nein | Für den optionalen Werkzeugbaum aufgenommen. Bei Weitergabe betroffener Bibliotheken bzw. kombinierter Werke sind unter anderem Lizenzhinweise, Quelltext und Möglichkeiten zum erneuten Verbinden mit geänderter Bibliothek zu behandeln. Keine Freigabe eines App-Bundles. [LGPL, insbesondere Abschnitte 3–6 und einbezogene GPL](https://spdx.org/licenses/LGPL-3.0-or-later.html); Paketbeleg und Grenzen unten. |

Für ausgelieferte Anteile sind genau **MIT, Apache-2.0, ISC, BSD-3-Clause, Zlib und 0BSD** zugelassen. Die übrigen Werkzeugkennungen erweitern diesen Bereich nicht. Nutzung eines Werkzeugs allein ist kein Nachweis dafür, dass dessen Code im Ergebnis enthalten oder nicht enthalten ist; übernommene und eingebettete Anteile sind gesondert zu sichten.

### Zusammengesetzte Angaben

Das Skript verarbeitet `AND`, `OR` und geschachtelte Klammern nach der [SPDX-Spezifikation, Anhang D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/): `AND` verlangt alle Teile, `OR` mindestens einen zugelassenen Zweig. Gewählt wird die erste zulässige Alternative von links; `AND` bindet stärker. Kennungen werden ohne Beachtung der Großschreibung verglichen, Operatoren sind großzuschreiben. Für den Gegenvergleich werden Reihenfolge und gleichartige Klammergruppen normalisiert, keine allgemeine algebraische Gleichwertigkeit hergeleitet.

Der **gesamte** Ausdruck muss bekannt sein. `MIT OR Unbekannt` bleibt ein Fehler. Dagegen wählt `(MIT OR GPL-3.0-or-later)` MIT; GPL allein bleibt in allen drei Bereichen unzulässig. `(MIT AND Zlib)` ist ausgeliefert zulässig. `(MPL-2.0 OR Apache-2.0)` besteht bereits unter Apache-2.0; DOMPurify braucht keine neue Freigabe. `WITH`, `+`-Kennungen und `LicenseRef` werden nicht still entfernt.

Fehlende Angaben, unbekannte Kennungen, `UNLICENSED`, Lizenzobjekte und Texte wie `SEE LICENSE IN ...` sind grundsätzlich Fehler. Nur eine ausdrücklich geprüfte Einzelausnahme kann unbrauchbare Metadaten einer bestimmten Version berichtigen.

## Einzelausnahmen

`einzelausnahmen` in den Prüfdaten enthält **eine Ausnahme für `rgbcolor` 1.0.1**, im Bereich `ausgeliefert`, als MIT und gültig bis einschließlich **2027-09-29**. Die allgemeinen Lizenzregeln bleiben unverändert. Die Tests prüfen sowohl eigene Probedaten als auch die Ausnahme am echten Baum und ihren Ablauftag.

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

Die vollständige Liste aller npm-Abhängigkeiten samt Transitivabhängigkeiten steht im eingecheckten [`package-lock.json`](../package-lock.json), unter `packages` mit Version, Paketort und Lizenzangabe je Paket. `node scripts/check-licenses.mjs --json` ergänzt diese Liste aus dem aktuellen Baum um die Bereiche, gewählten Lizenzen, Einzelausnahmen, Belegpfade unter `wege` und Fehler. Diese Quellen bilden die npm-Liste. Eine zusätzliche erzeugte npm-Liste ist derzeit nicht eingecheckt. Die von Gradle aufgelösten Laufzeitmodule sind im [Android-Laufzeitinventar](#android--und-gradle-abhängigkeiten) erfasst. Nicht im Lockfile erfasste Bündelinhalte, vollständige Hinweise Dritter und der Gradle-Werkzeugteil bleiben gesondert zu ergänzen.

### Geprüfte Angaben im verbleibenden Baum

Die folgende Auswahl erläutert die Werkzeugkennungen und die verbleibende Einzelausnahme. Die Versionen und Pfade stammen aus dem Lauf vom 2026-09-29. Pfadkürzel:

- **A:** Oberfläche → Peer `astro` 7.3.3; zugleich Wurzel → Entwicklungsabhängigkeit `astro` 7.3.3.
- **J:** Oberfläche → `jspdf` 4.2.1. „Optional“ bezeichnet die betreffende Kante; die Pakete bleiben Teil der Prüfung.
- **K:** App → `@capacitor/core` 8.5.2.
- **C:** App → Entwicklungsabhängigkeit `@capacitor/cli` 8.5.2.

| Angabe | Pakete mit Version | Bereich | Weg in den Baum | Vorschlag, Begründung und Quelle; Stand |
|---|---|---|---|---|
| `BSD-2-Clause` | `css-select` 6.0.0, `css-what` 7.0.0, `domelementtype` 2.3.0, `domhandler` 5.0.3, `domutils` 3.2.2, `entities` 4.5.0, `nth-check` 2.1.1, `http-cache-semantics` 4.2.0 | bereitgestellt | A → `svgo` → `css-select` / `css-what`; `css-select` → `domhandler` → `domelementtype`, → `domutils` → `dom-serializer` → `entities`, → `nth-check`; A → `http-cache-semantics` | Für Werkzeuge aufnehmen: permissiver Text in jeder lokalen `LICENSE`, mit Hinweispflichten; [BSD-2-Clause](https://spdx.org/licenses/BSD-2-Clause.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `0BSD` | `tslib` 2.8.1 | ausgeliefert | K → `tslib`; außerdem wie bisher über A und über Wurzel → `@astrojs/check` → `@astrojs/language-server` → `@astrojs/astro2tsx` → `@emnapi/core` → `tslib` | Für die Auslieferung aufgenommen: `node_modules/tslib/LICENSE.txt` (SHA-256 `210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751`) enthält Urheberhinweis und [0BSD-Text](https://spdx.org/licenses/0BSD.html). Ob Code von `tslib` im Bündel der App landet, zeigt erst deren Build. **Umgesetzt.** |
| `Unlicense` | `big-integer` 1.6.52, `stream-buffers` 2.2.0 | entwicklung | C → `native-run` → `bplist-parser` → `big-integer`; C → `xcode` → `simple-plist` → `bplist-creator` → `stream-buffers` | Für Werkzeuge aufgenommen: `node_modules/big-integer/LICENSE` (SHA-256 `e9b0e94f628e00b5ed98046cfa041696ff89eebbbdd54108ee350625bc6d0363`) und `node_modules/stream-buffers/UNLICENSE` (SHA-256 `ca2abdf695884c77ea4b4a5b64ca7b732d9d9dbade4eebc1c2e76c53e9e3bc83`) enthalten den [Unlicense-Text](https://spdx.org/licenses/Unlicense.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `BlueOak-1.0.0` | `common-ancestor-path` 2.0.0, `lru-cache` 11.5.3, `sax` 1.6.1; neu `chownr` 3.0.0, `glob` 13.0.6, `minimatch` 10.2.6, `minipass` 7.1.3, `package-json-from-dist` 1.0.1, `path-scurry` 2.0.2, `rimraf` 6.1.3, `tar` 7.5.22, `yallist` 5.0.0 | bereitgestellt; die neun neuen entwicklung | A → `common-ancestor-path`; A → `unstorage` → `lru-cache`; A → `svgo` → `sax`; C → `tar` → `chownr`, `minipass`, `yallist`; C → `rimraf` → `glob` → `minimatch`, `path-scurry`; C → `rimraf` → `package-json-from-dist` | Für Werkzeuge aufnehmen; die drei ersten `LICENSE.md` enthalten denselben [Blue-Oak-Text](https://spdx.org/licenses/BlueOak-1.0.0.html), einschließlich Pflicht zu Lizenztext oder Link. Die neun Pakete über C sind nach der Kennung im Manifest eingeordnet, ihre Lizenzdateien nicht einzeln gelesen. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `CC0-1.0` | `mdn-data` 2.27.1 und 2.0.28 | bereitgestellt | A → `svgo` → `css-tree` → 2.27.1; A → `svgo` → `csso` → dessen `css-tree` → 2.0.28 | Für Werkzeugdaten aufnehmen; beide lokalen `LICENSE` enthalten [CC0](https://spdx.org/licenses/CC0-1.0.html), einschließlich ersatzweiser Erlaubnis und Beschränkungen. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `Python-2.0` | `argparse` 2.0.1 | bereitgestellt | A → `js-yaml` → `argparse` | Werkzeugnutzung aufnehmen; vollständige Lizenzabschnitte in `node_modules/argparse/LICENSE`, [Vergleichstext](https://spdx.org/licenses/Python-2.0.html). **Umgesetzt**, Hinweise und Änderungsvermerk bei Weitergabe beachten. |
| `LGPL-3.0-or-later` | `@img/sharp-libvips-darwin-arm64`, `-darwin-x64`, `-linux-arm`, `-linux-arm64`, `-linux-ppc64`, `-linux-riscv64`, `-linux-s390x`, `-linux-x64`, `-linuxmusl-arm64`, `-linuxmusl-x64`, jeweils 1.3.3 (voller Präfix jeweils `@img/sharp-libvips`) | bereitgestellt | A → optional `sharp` 0.35.4 → optionale Plattformpakete | Werkzeugkennung aufnehmen, Entfernung des optionalen Baums weiter prüfen. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html); diese zehn Pakete sind lokal **nicht installiert**, ihr Inhalt ist nicht gegengeprüft. **Umgesetzt als Metadatenregel**, keine Bestätigung ihrer vollständigen Inhalte. |
| `Apache-2.0 AND LGPL-3.0-or-later` | `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64`, jeweils 0.35.4 | bereitgestellt | A → optional `sharp` → optionale Plattformpakete | Werkzeugregel aufnehmen. Lokal nur x64: `LICENSE` enthält Apache-2.0, `README.md` nennt libvips und weitere LGPL-Anteile samt „any later version“. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt**, weitere eingebettete Lizenzen bleiben gesondert zu prüfen. |
| `Apache-2.0 AND LGPL-3.0-or-later AND MIT` | `@img/sharp-wasm32` 0.35.4 | bereitgestellt | A → optional `sharp` → optional `@img/sharp-freebsd-wasm32` bzw. `@img/sharp-webcontainers-wasm32` → `@img/sharp-wasm32` | Zusammengesetzte Werkzeugangabe nach denselben Regeln aufnehmen. Nur Lockfile, kein lokal gelesener Paketinhalt; [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt als Metadatenregel**. |
| `MIT OR SEE LICENSE IN FEEL-FREE.md` | `rgbcolor` 1.0.1 | ausgeliefert | J → optional `canvg` 3.0.11 → `rgbcolor` | **Umgesetzt:** genaue MIT-Ausnahme bis einschließlich 2027-09-29; `LICENSE.md` enthält MIT und erlaubt ausdrücklich die Wahl gegenüber `FEEL-FREE.md`. Letztere Datei ist ebenfalls gelesen, wird aber nicht zur allgemeinen Kennung erklärt. [MIT-Vergleichstext](https://spdx.org/licenses/MIT.html). |

**Weitere Angaben im ausgelieferten Baum:** `pako` 2.2.0 über `jspdf` besteht mit `(MIT AND Zlib)`; das Paket enthält MIT in `LICENSE` und Zlib-Hinweise in `lib/zlib/deflate.js`. `dompurify` 3.4.15 über die optionale Kante von `jspdf` besteht mit `(MPL-2.0 OR Apache-2.0)` unter Apache-2.0. Dafür ist keine Einzelausnahme nötig.

### Optionaler Baum von sharp und libvips

Im beobachteten Graphen führt der einzige Eingang zu `sharp` 0.35.4 über `astro.optionalDependencies`. Auch dessen Plattformpakete werden optional eingebunden. `@img/sharp-wasm32` folgt als normale Abhängigkeit zweier optionaler Plattformpakete; der gesamte Weg bleibt damit optional. Ohne optionale Kanten ist keines dieser Pakete von den lokalen Manifesten aus erreichbar. Die betreffenden Lockfile-Einträge tragen außerdem `optional: true`.

[toolchain.md](toolchain.md) beschreibt sharp mit libvips als optionale Bildverarbeitung, die von der App nicht genutzt wird, und verlangt, den Baum wenn möglich zu entfernen. Diese Vorgabe bleibt bestehen. Die Aufnahme von LGPL als Werkzeugkennung ersetzt weder diese Prüfung noch die Prüfung vorgebauter Programme für F-Droid. Der optionale sharp-Baum ist im aktuellen Lockfile und in der Installation weiterhin enthalten.

Das installierte `@img/sharp-win32-x64` 0.35.4 zeigt eine weitere Grenze: Seine README nennt zahlreiche eingebettete Bibliotheken und zusätzliche Lizenztexte, unter anderem für fontconfig, FreeType, libpng und mozjpeg sowie eine Patentlizenz für aom. Das äußere SPDX-Feld bildet diese Tabelle nicht vollständig ab. Gelesen wurden hier die README und die Apache-Lizenz des Pakets sowie der LGPL-Vergleichstext; die weiteren eingebetteten Texte und die nicht installierten Plattformpakete sind damit nicht vollständig geprüft.

## Ersatz von ExcelJS

Am 2026-09-29 nennt das Manifest der Oberfläche `fflate` 0.8.3 als direkte Abhängigkeit für das Packen selbst geschriebener Excel-Dateien. `fflate` trägt MIT, hat keine eigenen Abhängigkeiten und kein Installationsskript. Diese Angaben stammen aus Manifest, Lockfile und installiertem Paket.

`exceljs` und sein bisheriger Abhängigkeitspfad sind aus Manifest, Lockfile und Installation entfernt. Der aktuelle Lauf enthält `buffers`, `chainsaw`, `traverse`, `jszip`, `unzipper` und `fstream` nicht mehr. `big-integer` 1.6.52, `glob`, `rimraf` und `uuid` sind mit Capacitor zurückgekehrt, drei davon in anderer Version, und zwar nur über die Kommandozeile von Capacitor im Bereich `entwicklung`. Für die entfallenen Pakete werden keine Ausnahmen oder zusätzlichen Lizenzkennungen eingetragen.

## Capacitor 8.5.2 für die App

Die App nennt `@capacitor/core` und `@capacitor/android` 8.5.2 unter `dependencies` und `@capacitor/cli` 8.5.2 unter `devDependencies`. Das Lockfile wächst dadurch am 2026-09-29 um **95 Orte**: MIT 72, ISC 10, BlueOak-1.0.0 9, Apache-2.0 2, Unlicense 2. Kein bisheriger Eintrag eines Fremdpakets ist entfallen oder in Version, Quelle, Prüfsumme oder Lizenz geändert; geändert ist nur die Version des eigenen Workspaces `app`. Jeder neue Eintrag stammt von `registry.npmjs.org` und trägt eine Prüfsumme. Keiner hat ein Installationsskript.

Ausgeliefert sind neu nur `@capacitor/core`, `@capacitor/android` (beide MIT) und `tslib` (0BSD). Die Kommandozeile ist eine Entwicklungsabhängigkeit. Orte, die ihr Baum mit anderen Bäumen teilt, behalten den vorrangigen Bereich: Von den 95 neuen Orten sind 2 ausgeliefert (`@capacitor/core`, `@capacitor/android`), 91 für Test und Build und 2 bereitgestellt (`@types/node`, `undici-types`, zusätzlich über Astro erreichbar). `tslib` stand schon im Lockfile und ist jetzt ausgeliefert. Ohne die Kennungen 0BSD für die Auslieferung und Unlicense für Werkzeuge scheitert die Prüfung genau an `tslib`, `big-integer` und `stream-buffers`.

Im npm-Lauf vom 2026-09-29 waren die Abhängigkeiten, die Gradle für `@capacitor/android` lädt, darunter AndroidX und das Cordova-Framework, nicht erfasst. Der [Laufzeitteil mit POM-Lizenzangaben und APK-Abgleich](#android--und-gradle-abhängigkeiten) ist am 2026-10-04 für `9ae4cd9` ergänzt; vollständige Hinweise Dritter und der Gradle-Werkzeugteil bleiben offen.

Damit gehörte das vorgebaute Browser-Bündel von ExcelJS nicht mehr zum npm-Bestand vom 2026-09-29. Seine frühere Auswertung ist kein Nachweis für den Inhalt eines neuen Website- oder App-Builds. Der eigene Excel-Schreiber und die vollständige Oberfläche wurden im damaligen Metadatenlauf nicht gebaut. Die späteren vollständigen App-Builds sind in [app.md](app.md) belegt. Die erzeugten Bündel und die Originalhinweise ihrer tatsächlich enthaltenen Fremdanteile bleiben vor der Auslieferung zu prüfen; das gilt auch für die übrigen Exportbibliotheken.

## Android- und Gradle-Abhängigkeiten

Erhoben am **2026-10-04**, Stand **`9ae4cd9`**. Erfasst ist ausschließlich `:app:releaseRuntimeClasspath`, einschließlich transitiver Module und der beiden Projektmodule. Grundlage sind der gespeicherte Bericht dieses Laufs, eine Auswertung der POM-Dateien im Gradle-Cache und die Prüfprotokolle zur APK. Diese Belege werden gesondert aufbewahrt und sind nicht Teil des Repositorys. Der Offline-Lauf mit Gradle 8.14.5 und JDK 21.0.8 endete mit Rückgabewert 0 und `BUILD SUCCESSFUL in 13s`.

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

Geprüft wurde die unsignierte Release-APK mit **7 760 765 Bytes**, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`, entsprechend dem [Build-Nachweis am Endstand](app.md#build-nachweis-am-endstand-vom-2026-10-0304). Die DEX-Auswertung erfasst **5 318 definierte Klassen**. Alle 4 769 Klassen aus den 46 Laufzeitartefakten sind darin enthalten. Hinzu kommen 132 Capacitor-Klassen, 49 eigene Klassen, 141 erzeugte R-Klassen und 227 von D8 erzeugte Synthetikklassen.

Von 35 Dateien unter `META-INF` mit Endung `.version` enthalten **28 eine konkrete Versionsnummer**; alle 28 stimmen mit der Gradle-Auflösung überein. Die übrigen sieben enthalten Platzhalter aus den vorgelagerten Artefakten und liefern keinen Versionsnachweis.

Die Prüfung mit den in fdroidserver 2.4.2 enthaltenen SUSS-Signaturen verwendete 114 Gradle- und 471 Code-Signaturen. Das Protokoll `suss-pruefen.log` meldet **keine Treffer** gegen die geprüften Cache-Koordinaten und gegen die 5 318 APK-Klassen. Die ergänzende DEX-Suche fand keine Merkmale für Google Play Services (`gms`), Firebase, Play, DataTransport oder Crashlytics. Der einzige Treffer für `measurement` war ein Fehlertext von CoordinatorLayout. Die einzige Klasse unter `com/google` ist die Guava-Schnittstelle `ListenableFuture`.

Damit ergab diese SUSS-/DEX-Prüfung keinen Hinweis auf Google-Dienste, Firebase, Play Services oder proprietäre Artefakte in der untersuchten APK. Das Ergebnis gilt für die verwendeten Signaturen und Suchmuster; es ersetzt weder die vollständigen Hinweise Dritter noch einen Laufzeitnachweis.

### Eingebettete Anteile und offene Hinweise Dritter

Die folgenden Anteile haben keine eigene Modulkoordinate in der Auflösung. Die POM-Lizenz des umgebenden Moduls wird ihnen hier nicht als eigene Lizenz unterstellt:

| Eingebetteter Anteil | Enthalten in | APK-Abgleich | Stand |
|---|---|---|---|
| `org.chromium.support_lib_boundary` | `androidx.webkit:webkit` 1.14.0 | 58 Klassen | **Lizenzwortlaut noch zu klären (Hinweise Dritter)** |
| FlatBuffers | `androidx.emoji2:emoji2` 1.3.0, `libs/repackaged.jar` | 49 Ursprungsklassen und eine zusätzliche D8-Synthetikklasse | **Lizenzwortlaut noch zu klären (Hinweise Dritter)** |

Die Erfassung der Module und ihrer POM-Angaben erledigt die Zusammenstellung und Mitgabe der Originalhinweise nicht. Diese bleibt offen.

### Neuerzeugung und Abgrenzung der Build-Werkzeuge

Der Bericht vom 2026-10-04 am Stand `9ae4cd9` wurde mit folgendem Aufruf erzeugt (`gradlew` bezeichnet den Projekt-Wrapper):

```text
gradlew -p app/android :app:dependencies --configuration releaseRuntimeClasspath --offline
```

Aus der Repository-Wurzel ist der Wrapper unter Windows als `.\app\android\gradlew.bat`, unter Linux als `./app/android/gradlew` aufzurufen. `JAVA_HOME` muss auf ein vollständiges OpenJDK 21 zeigen; im belegten Lauf war es 21.0.8. Für strenge Release-Builds gilt weiterhin der [festgelegte Patchstand](toolchain.md#jdk). `ANDROID_HOME` muss das vorbereitete Projekt-SDK nennen; ein vorhandenes `sdk.dir` in `app/android/local.properties` darf nicht auf ein anderes SDK verweisen. Gradle-Verteilung, Abhängigkeiten, npm-Installation mit `@capacitor/android` und das erzeugte Android-Projekt müssen bereits vorhanden sein. `--offline` unterbindet das Nachladen von Abhängigkeiten durch Gradle; die Wrapper-Verteilung muss vorher im Cache liegen. Der Befehl erneuert den Abhängigkeitsbaum, nicht den APK-/SUSS-Abgleich oder die Sichtung der POM-Lizenzen.

Die Gradle-Werkzeuge des Buildscripts, insbesondere das Android-Gradle-Plugin und dessen Abhängigkeiten, gehen nicht als Build-Werkzeuge in die APK ein. Soweit dieselben Module auch Laufzeitabhängigkeiten sind, sind sie oben gesondert erfasst. **Ihre vollständige Werkzeugliste, die dafür geltende Lizenzregel und die Prüfsummenabsicherung folgen gesondert und sind noch offen.** Der Laufzeitbericht ist kein Inventar des Buildscripts; eine abschließende Zahl der Werkzeug-Artefakte wird hier nicht angegeben.

## Testempfänger und Testvarianten der App

Der Testempfänger mit DocumentsProvider unter `scripts/emulator/testempfaenger` besteht aus eigenen Java-Quellen und nutzt das Android-Framework ohne zusätzliche Bibliotheksabhängigkeiten. Er enthält keinen übernommenen Fremdcode. Für diese Quellen gilt wie für das Repository Apache-2.0. Das Gradle-Projekt verwendet beim Variantenbau die bereits vorhandenen Build-Werkzeuge und das Projekt-SDK; daraus folgt keine zusätzliche Laufzeitabhängigkeit der Produkt-App.

Der Emulatorrahmen baut den Testempfänger sowie die Gegenprobe und die Varianten für die Fehlerseite ausschließlich in seinem Ausgabeordner. Die Gegenprobe und die Fehlerseitenvarianten verwenden Kopien der App und ihrer vorhandenen Abhängigkeiten; deren Lizenzpflichten bleiben bestehen. Diese Test-APKs und der nur für die Prüfläufe verwendete Testempfänger gehören zur Testumgebung und werden nicht mit der Produkt-App oder den npm-Paketen ausgeliefert. Keine Klasse des Testempfängers wird in die Produkt-App kopiert. Einzelheiten stehen in der [Beschreibung der Test-App](../scripts/emulator/testempfaenger/README.md) und in [app.md](app.md#dateiphase-auf-api-30-und-36).

## Lauf und Befund

Die Prüfung läuft offline, ohne npm-Aufruf und ohne Ausführung von Code oder Installationsskripten aus Abhängigkeiten:

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

### Installationsskripte und vorgebaute Programme

Im Lauf vom 2026-09-29 trugen drei Pakete Installationshaken: `core-js` 3.50.0, `esbuild` 0.28.2 und das damals nicht installierte `fsevents` 2.3.3. Insgesamt meldeten Namensmuster und gefundene Binärdateien bei **35 Paketen** vorgebaute Programme. Diese Zahl ist eine Hilfestellung, kein vollständiger Binärnachweis. Für nur im Lockfile vorhandene Pakete stehen keine lokalen Dateien zur Suche zur Verfügung. Das bekannte eingebettete WebAssembly von `es-module-lexer` wird zusätzlich über ein Namensmuster erfasst.

Das Skript erfasst `preinstall`, `install`, `postinstall` und `binding.gyp`. `prepare` und `prepack` sind keine hier geprüften Installationshaken für Registry-Pakete; Quellinstallationen aus Git benötigen eine eigene Prüfung. Lizenzfehler unterdrücken die Suche nach Hinweis- und Binärdateien nicht. Weder die Bereichseinordnung noch das Abschalten von Installationsskripten entfernt bereits enthaltene Programme. Der tatsächliche Build-Baum wurde für den lokalen Endstandlauf geprüft, siehe [F-Droid-Nachweis](fdroid-build.md); bei Änderungen ist diese Prüfung zu erneuern.

## Hinweise Dritter, Paketinhalt und verbleibende Arbeit

Die Prüfung liest Lizenz- und Hinweisdateien, bewertet deren Vollständigkeit jedoch nicht automatisch. Die beiden npm-Pakete bündeln im unten geprüften Stand keinen Fremdcode. Ihre Fremdabhängigkeiten werden über die Paketmanifeste angegeben. Gesammelte Originalhinweise und Lizenztexte tatsächlich gebündelter Fremdanteile gehören zum bündelnden Gastgeber, etwa zur Website, und offline lesbar in die App. Diese Hinweise bleiben anhand der jeweiligen Bündel zu vervollständigen. Eine Kennung in diesem Dokument ersetzt die Texte nicht. Auch Werkzeugpakete wie Rolldown und sharp enthalten weitere, nicht als eigene Lockfile-Pakete erfasste Anteile.

`LICENSE` und `NOTICE` in der Wurzel müssen lesbar und nicht leer sein. Ihre Kopien in jedem npm-Workspace unter `packages/` werden bei jedem Lauf byteweise verglichen. `.gitattributes` legt LF fest. Das [Manifest der Oberfläche](../packages/oberflaeche/package.json) führt am unten geprüften Stand `src`, `README.md`, `LICENSE` und `NOTICE` unter `files`. Die frühere Angabe, die Auslieferungsdateien seien noch einzutragen, ist damit überholt.

`--packliste <Datei>` prüft zusätzlich die unveränderte JSON-Ausgabe eines vorherigen `npm pack --dry-run --json --offline --ignore-scripts`: erwartete npm-Pakete und Versionen, `package.json`, vollständige Hinweisdateien und passende Größen. Die App wird nicht als npm-Paket erwartet. Leere, doppelte oder unvollständige Listen führen zu Code 1. Der Trockenlauf ersetzt keine Sichtung eines tatsächlich erzeugten Archivs. Grundlage: npm-Dokumentation zu [`files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) und [`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/).

### Paketinhalt

Beide Workspaces gehören in **einen** Aufruf. Die unveränderte Ausgabe enthält dann beide Paketbeschreibungen und kann vollständig an die Lizenzprüfung übergeben werden:

```text
npm pack --dry-run --json --offline --ignore-scripts --workspace packages/kern --workspace packages/oberflaeche
```

Die Messungen vom **2026-10-04** ergaben unter Windows mit Node **22.23.2** und npm **10.9.8** sowie unter Debian **13.5** mit Node **24.21.0** und npm **11.19.0** dieselben Werte. Die Paketquellen sind in beiden Messungen gleich (unverändert seit `9ae4cd9`): unter Windows im Arbeitsstand auf Basis `9ae4cd9`, unter Debian in einem frischen Checkout von `bca6d2a`. Beide Messungen verwenden die Regeln aus `.gitattributes` einschließlich der LF-Festlegung für `packages/*/package.json` und `packages/*/README*.md`; die Paketdateien enthalten LF:

| Paket, Version | Dateien | `size` in Bytes | `unpackedSize` in Bytes | `shasum` | `bundled` |
|---|---:|---:|---:|---|---|
| `@baremos/fristenrechner-kern`, `0.0.0` | 13 | 42 438 | 177 155 | `97fa402039df83156c721df0553fdf50e4065b70` | `[]` |
| `@baremos/fristenrechner-ui`, `0.0.0` | 19 | 58 114 | 212 915 | `fb7850e153497b2d360b633d0465a753a5bc5ffb` | `[]` |

Das sind die von npm im Trockenlauf gemeldeten Archivgrößen, entpackten Größen und SHA-1-Prüfsummen. Die Packliste enthält beim Kern zehn Dateien unter `dist` sowie `package.json`, `LICENSE` und `NOTICE`; bei der Oberfläche fünfzehn Quelldateien unter `src` sowie `package.json`, `LICENSE`, `NOTICE` und `README.md`. `bundled` ist bei beiden leer. Andere Zeilenenden verändern Größen und Prüfsummen.

Am **2026-10-04** bestätigte der Offline-Gegencheck in einem frischen Linux-Checkout die Tabellenwerte, und die Offline-Verbraucherprobe nach dem README-Beispiel mit **Astro 7.3.3** bestand `astro build` und `astro check` ohne Fehler: Alle 16 Quellen im Bündel kamen aus den tatsächlich erzeugten npm-Archiven, keine aus dem Workspace.

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

Beim Kern sind nur `dist/*.js`, `dist/*.d.ts`, `package.json`, `LICENSE`, `NOTICE` und eine vorhandene README erlaubt. Die `dist`-Dateimenge in der Packliste muss dem frischen Vergleichsbuild entsprechen; jede JavaScript-Datei benötigt ihre zugehörige `.d.ts`. Bei der Oberfläche werden genau die von Git verfolgten Dateien unter `src` sowie `package.json`, `LICENSE`, `NOTICE` und `README.md` erwartet. Tests, Referenzdaten, `scratchpad` und `node_modules` sind ausgeschlossen. Die Konstante `KERN_README_PFLICHT` ist vorerst `false`; die Pflicht wird aktiviert, sobald der Kern eine README erhält, spätestens vor der Veröffentlichung.

Die Prüfung verlangt `exports` mit einem nutzbaren Haupteinstieg, Zielen mit `./` und ohne gemischte Schlüssel für Bedingungen und Unterpfade. Ziele aus `exports`, `main`, `module`, `types` und `typings` müssen konkrete Dateien der Packliste sein. Die zusätzlichen Auflösungsfelder `browser` und `typesVersions` werden derzeit abgewiesen.

Statisch erkennbare relative Verweise werden gegen die Packliste geprüft. Der vorhandene TypeScript-Parser liest JavaScript- und TypeScript-Verweise; der Astro-Compiler bestimmt Vorspann, Skript- und Stilbereiche. Erfasst werden Import- und Exportanweisungen einschließlich Importtypen und `require`, relative Triple-Slash-Verweise und Moduldeklarationen, statische `new URL(..., import.meta.url)`-Ziele, Astro-Skriptquellen sowie CSS-`@import` und `url`. Berechnete Import- und URL-Ziele, dynamische Astro-Skriptquellen, `import.meta.glob` beziehungsweise `globEager` und CSS-`image-set` beziehungsweise `-webkit-image-set` scheitern ausdrücklich.

Relative `.js`-Ziele in `.d.ts` müssen zur entsprechenden `.d.ts` führen. Bei endungslosen Importen der Oberfläche werden `.mjs`, `.js`, `.mts`, `.ts`, `.jsx`, `.tsx` und `.json` sowie entsprechende `index`-Dateien gesucht; `.astro` ist keine ergänzte Endung. Paketimporte werden nicht gegen Abhängigkeitsangaben oder die `exports` des Zielpakets aufgelöst. Die Prüfung ersetzt deshalb keinen Build im einbindenden Projekt. Beide Pakete müssen dieselbe Version tragen, und die Kern-Abhängigkeit der Oberfläche muss genau diese Version angeben. `bundled` in der Packliste muss leer sein; `bundleDependencies` und `bundledDependencies` im Manifest dürfen nur fehlen oder leere Listen sein.

### Interner Ablauf für Stufe 3: spätere Veröffentlichung

Dieser Ablauf ist vorbereitet, aber **nicht durchgeführt oder freigegeben**. `private: true` bleibt bestehen. Veröffentlichung, öffentliches Repository und npm-Organisation gehören zu Stufe 3 und benötigen eine gesonderte Freigabe.

1. Aus einem sauberen Linux-Checkout mit den festgelegten Werkzeugversionen arbeiten und die Versionen von Kern und Oberfläche im Gleichschritt halten.
2. `packages/kern/dist` entfernen und den Kern ausdrücklich mit `npm run build --workspace packages/kern --offline` neu bauen. Der Kern hat kein `prepack`- oder `prepublishOnly`-Skript; außerdem schaltet `.npmrc` mit `ignore-scripts=true` Lebenszyklusskripte ab. `npm pack` und `npm publish` bauen den Kern daher nicht.
3. `node scripts/npm-pakete.mjs --ausgabe scratchpad/npm-pakete-freigabe --ohne-cr` ausführen und Packliste, Prüfbericht sowie anschließend die tatsächlich erzeugten Archive prüfen. Die README-Pflicht des Kerns muss bis dahin aktiviert sein.
4. Nach gesonderter Veröffentlichungsfreigabe zuerst den Kern, danach die Oberfläche mit derselben Version veröffentlichen.

### Verbleibende Arbeit

Vor Stufe 3 bleiben:

1. Die MIT-Ausnahme für `rgbcolor` spätestens zu ihrem Ablauf am 2027-09-29 erneut prüfen; bei Versions- oder Metadatenänderungen muss sie angepasst oder entfernt werden.
2. Die README-Pflicht aktivieren, sobald der Kern eine README erhält, und die Paketprüfung beim späteren Veröffentlichungsstand aus einem sauberen Linux-Checkout mit `--ohne-cr` wiederholen.
3. Die erzeugten `.tgz`-Archive sowie Website- und App-Bundles sichten, eingebettete Pakete mit genauen Versionen und Originalhinweisen erfassen.
4. Die im lokalen Endstandlauf belegte Behandlung des optionalen sharp-Baums und der weiteren vorgebauten Bestandteile bei Änderungen am Build-Baum erneut prüfen; Quelle und Grenzen: [F-Droid-Nachweis](fdroid-build.md).
5. Android- und Gradle-Abhängigkeiten ergänzen; **teilweise erledigt am 2026-10-04 für `9ae4cd9`**: [Laufzeitmodule mit POM-Lizenzangaben und APK-/SUSS-Abgleich](#android--und-gradle-abhängigkeiten) sind erfasst. Vollständige Hinweise Dritter einschließlich der eingebetteten Anteile sowie Werkzeugliste, Werkzeug-Lizenzregel und Prüfsummenabsicherung bleiben offen. Die npm-Liste erfasst diese Gradle-Abhängigkeiten weiterhin nicht.
6. Entscheiden, ob zusätzlich zu `package-lock.json` eine erzeugte vollständige Abhängigkeitsliste mit Bereichen und Wegen eingecheckt wird, und ihren Aktualisierungsweg festlegen. Die Entscheidung ist offen; derzeit wird diese Liste mit `node scripts/check-licenses.mjs --json` erzeugt.

Ein erfolgreicher Metadatenlauf belegt weder die Vollständigkeit fremder Lizenzangaben noch sämtliche Weitergabepflichten oder die F-Droid-Tauglichkeit. Proprietäre Dienste werden nicht anhand eines Lizenzfelds erkannt. Der tatsächliche Offline-Betrieb und das Android-Manifest gehören zur Abnahme der vollständigen App.
