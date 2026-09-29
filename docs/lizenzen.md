# Lizenzen und Abhängigkeiten

Stand: **2026-09-29**, mit den vorbereiteten Abhängigkeiten der Oberfläche. Die Bestandsaufnahme umfasst das npm-Lockfile im Format 3 und die vorhandene Windows-Installation. Sie beschreibt die Projektregeln und gelesene Paketbelege, keine Rechtsauskunft. Werkzeuge und Android-Komponenten außerhalb dieses Lockfiles behandeln [toolchain.md](toolchain.md) und [fdroid-build.md](fdroid-build.md).

Das Projekt steht unter Apache-2.0. Der Wortlaut liegt in `LICENSE`, der Herausgeberhinweis in `NOTICE` in der Wurzel des Repositorys.

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

Heute ist `astro` 7.3.3 zugleich Peer der Oberfläche und Entwicklungsabhängigkeit der Wurzel. Sein bereitgestellter Baum überschneidet sich mit Testwerkzeugen und ausgelieferten Paketen; die Rangfolge wird für jeden Ort einzeln angewendet.

## Zulässige Lizenzen

Die verbindliche Liste steht in [`scripts/check-licenses.json`](../scripts/check-licenses.json). Sie ist eine begrenzte Auswahl geprüfter Kennungen für dieses Projekt. Eine nicht aufgenommene Lizenz ist dadurch nicht als unfrei bewertet. Die Quellen der neuen Einträge wurden am 2026-09-29 gelesen.

| SPDX-Kennung | Test, Build und bereitgestellt | Auslieferung | Grund, Bedingungen und Quelle |
|---|---|---|---|
| MIT | ja | ja | Permissiv; Urheber- und Erlaubnistext bei Weitergabe erhalten. [Text](https://spdx.org/licenses/MIT.html). |
| Apache-2.0 | ja | ja | Projektlizenz; Lizenztext und einschlägige Hinweise einschließlich vorhandener NOTICE-Inhalte erhalten, Änderungen kennzeichnen. [Abschnitt 4](https://www.apache.org/licenses/LICENSE-2.0). |
| ISC | ja | ja | Permissiv; Urheber- und Erlaubnistext erhalten. [Text](https://spdx.org/licenses/ISC.html). |
| BSD-3-Clause | ja | ja | Hinweise und Haftungsausschluss erhalten; Namen nicht ohne Erlaubnis für Werbung verwenden. [Text](https://spdx.org/licenses/BSD-3-Clause.html). |
| MPL-2.0 | ja | nein | Copyleft auf Dateiebene; Weitergabe erfordert unter anderem Quelltextzugang und Hinweise. Für Werkzeuge aufgenommen, für Auslieferung erst nach einem konkreten Plan. [Abschnitt 3](https://www.mozilla.org/en-US/MPL/2.0/). |
| Zlib | ja | ja | Permissiv; Herkunft nicht falsch darstellen, geänderte Quellen kennzeichnen, Hinweis in Quellweitergaben erhalten. Neu für die Auslieferung zugelassen. [Text](https://spdx.org/licenses/Zlib.html); lokal auch `pako/lib/zlib/deflate.js` in beiden installierten Versionen. |
| GPL-3.0-or-later | nein, nur bekannt | nein, nur bekannt | Freie Copyleft-Lizenz mit Pflichten insbesondere bei Weitergabe von Quellen und Binärdateien. Die Projektliste erlaubt keinen GPL-Zweig, kennt aber die Kennung zur vollständigen Prüfung von Alternativen. Das ist keine Einstufung als proprietär. [GPL, insbesondere Abschnitte 4–6 und 14](https://spdx.org/licenses/GPL-3.0-or-later.html); lokal `jszip/LICENSE.markdown`. |
| BSD-2-Clause | ja | nein | Permissiv; Urheberhinweis, Bedingungen und Haftungsausschluss in Quellen bzw. bei Binärweitergabe in Dokumentation oder Begleitmaterial erhalten. [Text](https://spdx.org/licenses/BSD-2-Clause.html); lokale LICENSE-Dateien der acht Pakete unten. |
| 0BSD | ja | nein | Erlaubt Nutzung, Änderung und Weitergabe ohne zusätzliche Hinweispflicht im Lizenztext; Haftungsausschluss. Vorhandene Hinweise bleiben erhalten. [Text](https://spdx.org/licenses/0BSD.html); `tslib/LICENSE.txt`. |
| BlueOak-1.0.0 | ja | nein | Weite Urheber- und Patenterlaubnis; Empfänger müssen Lizenztext oder Lizenzlink erhalten. Bei schriftlich gerügtem Hinweisverstoß nennt der Text eine Heilungsfrist von 30 Tagen. [Text](https://spdx.org/licenses/BlueOak-1.0.0.html); lokale LICENSE.md-Dateien der drei Pakete unten. |
| CC0-1.0 | ja | nein | Verzicht auf die erfassten Rechte mit ersatzweiser Nutzungserlaubnis; keine Freigabe von Marken- oder Patentrechten, Haftungsausschlüsse beachten. [Text](https://spdx.org/licenses/CC0-1.0.html); `mdn-data/LICENSE` in beiden Versionen. |
| Python-2.0 | ja | nein | Erlaubt Nutzung und Bearbeitung unter Erhalt der Lizenz- und Urheberhinweise; bei Weitergabe von Bearbeitungen Änderungen zusammenfassen, Namens-/Markenbeschränkungen beachten. [Text](https://spdx.org/licenses/Python-2.0.html); `argparse/LICENSE` mit PSF-, BeOpen-, CNRI- und CWI-Abschnitten. |
| LGPL-3.0-or-later | ja | nein | Für den optionalen Werkzeugbaum aufgenommen. Bei Weitergabe betroffener Bibliotheken bzw. kombinierter Werke sind unter anderem Lizenzhinweise, Quelltext und Möglichkeiten zum erneuten Verbinden mit geänderter Bibliothek zu behandeln. Keine Freigabe eines App-Bundles. [LGPL, insbesondere Abschnitte 3–6 und einbezogene GPL](https://spdx.org/licenses/LGPL-3.0-or-later.html); Paketbeleg und Grenzen unten. |

Für ausgelieferte Anteile bleiben genau **MIT, Apache-2.0, ISC, BSD-3-Clause und Zlib** zugelassen. Die sechs neu geprüften Werkzeugkennungen erweitern diesen Bereich nicht. Nutzung eines Werkzeugs allein ist kein Nachweis dafür, dass dessen Code im Ergebnis enthalten oder nicht enthalten ist; übernommene und eingebettete Anteile sind gesondert zu sichten.

### Zusammengesetzte Angaben

Das Skript verarbeitet `AND`, `OR` und geschachtelte Klammern nach der [SPDX-Spezifikation, Anhang D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/): `AND` verlangt alle Teile, `OR` mindestens einen zugelassenen Zweig. Gewählt wird die erste zulässige Alternative von links; `AND` bindet stärker. Kennungen werden ohne Beachtung der Großschreibung verglichen, Operatoren sind großzuschreiben. Für den Gegenvergleich werden Reihenfolge und gleichartige Klammergruppen normalisiert, keine allgemeine algebraische Gleichwertigkeit hergeleitet.

Der **gesamte** Ausdruck muss bekannt sein. `MIT OR Unbekannt` bleibt ein Fehler. Dagegen wählt `(MIT OR GPL-3.0-or-later)` MIT; GPL allein bleibt in allen drei Bereichen unzulässig. `(MIT AND Zlib)` ist ausgeliefert zulässig. `(MPL-2.0 OR Apache-2.0)` besteht bereits unter Apache-2.0; DOMPurify braucht keine neue Freigabe. `WITH`, `+`-Kennungen und `LicenseRef` werden nicht still entfernt.

Fehlende Angaben, unbekannte Kennungen, `UNLICENSED`, Lizenzobjekte und Texte wie `SEE LICENSE IN ...` sind grundsätzlich Fehler. Nur eine ausdrücklich geprüfte Einzelausnahme kann unbrauchbare Metadaten einer bestimmten Version berichtigen.

## Einzelausnahmen

`einzelausnahmen` in den Prüfdaten ist **leer**. Insbesondere ist keine Ausnahme für ausgelieferte Pakete eingetragen. Die Mechanik wird mit eigenen Probedaten getestet.

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

### Vorschläge für einzelne Versionen, noch nicht freigegeben

| Paket und Version | Angegebener Wortlaut | Festgestellte Lizenz | Beleg im installierten Paket | Bereich | Vorgeschlagene Befristung |
|---|---|---|---|---|---|
| `traverse` 0.3.9 | `MIT/X11` | MIT; vollständiger Text vorhanden | `node_modules/traverse/LICENSE`, SHA-256 `309dff61c243e706fac25101a9bdb585f7e2db45e32915b08cf47518d2075863` | ausgeliefert | 2026-12-31; zusätzlich erneute Sichtung vor Stufe 3 |
| `rgbcolor` 1.0.1 | `MIT OR SEE LICENSE IN FEEL-FREE.md` | MIT als ausdrücklich wählbare Alternative | `node_modules/rgbcolor/LICENSE.md`, SHA-256 `86045408b01f66f9319a2fe7bc7f7e115f272956ac44d2d840fc00127124a78c`; auch `FEEL-FREE.md` gelesen | ausgeliefert | 2026-12-31; zusätzlich erneute Sichtung vor Stufe 3 |
| `chainsaw` 0.1.0 | `MIT/X11` | Nicht anhand eines vollständigen Texts im Paket festgestellt | Nur `package.json` nennt MIT/X11; keine Lizenzdatei und kein Lizenztext in README oder den gesichteten Quellen | ausgeliefert | Noch keine Ausnahme vorschlagen; zuerst versionsbezogenen Beleg beschaffen |
| `buffers` 0.1.1 | keine Angabe | nicht festgestellt | Manifest, README, Quellen und Dateiliste enthalten keinen Lizenzbeleg | ausgeliefert | Keine Ausnahme ohne nachgewiesene Lizenz |

Für die beiden belegten Vorschläge kann als öffentlicher, versionsgebundener Quellenverweis das jeweilige npm-Archiv dienen: `https://registry.npmjs.org/traverse/-/traverse-0.3.9.tgz` bzw. `https://registry.npmjs.org/rgbcolor/-/rgbcolor-1.0.1.tgz`. Diese Adressen stehen im Lockfile; die Archive wurden hier nicht erneut geladen. Gelesen wurden ausschließlich die bereits installierten Dateien. Die Befristung betrifft die Projektfreigabe der Metadatenberichtigung, nicht die Laufzeit der fremden Lizenz. Ein früherer Übergang zu Stufe 3 wird nicht automatisch am Datum erkannt.

## Bestandsaufnahme nach der Umstellung

Am 2026-09-29: **509 fremde Lockfile-Orte**, davon **122 ausgeliefert**, **287 bereitgestellt**, **100 für Test und Build**. **414 installierte Manifeste** wurden gelesen, **95 Einträge nur anhand des Lockfiles** geprüft. Die fünf unten genannten Pakete enthalten weiterhin Fehler; bei den übrigen installierten Manifesten stimmen Name, Version und normalisierte Lizenzangabe mit dem Lockfile überein. Eigene Workspaces und deren Links zählen nicht mit.

Die vollständige Liste aller npm-Abhängigkeiten samt Transitivabhängigkeiten steht im eingecheckten [`package-lock.json`](../package-lock.json), unter `packages` mit Version, Paketort und Lizenzangabe je Paket, soweit die Metadaten eine solche enthalten. Fehlende oder unbrauchbare Lizenzangaben sind unten ausdrücklich als offene Befunde erfasst. `node scripts/check-licenses.mjs --json` ergänzt die vollständige Liste aus dem aktuellen Baum um die Bereiche, gewählten Lizenzen, Belegpfade unter `wege` und Fehler. Diese beiden Quellen bilden die npm-Liste für Arbeitspaket 2.7; die frühere Tabelle mit 70 Entwicklungsabhängigkeiten ist durch diesen Bestand überholt. Eine zusätzliche erzeugte Liste ist derzeit nicht eingecheckt. Nicht im Lockfile erfasste Bündelinhalte sowie Android- und Gradle-Abhängigkeiten bleiben gesondert zu ergänzen.

### Angaben, die nach den Entscheidungen zu Peers, Zlib und GPL noch zu behandeln waren

Jede unterschiedliche verbleibende Lizenzangabe hat eine Zeile. Alle genannten Versionen stammen aus dem aktuellen Lockfile, nicht aus dem ExcelJS-Bündel. Pfadkürzel:

- **A:** Oberfläche → Peer `astro` 7.3.3; zugleich Wurzel → Entwicklungsabhängigkeit `astro` 7.3.3.
- **E:** Oberfläche → `exceljs` 4.4.0 → `unzipper` 0.10.14.
- **J:** Oberfläche → `jspdf` 4.2.1. „Optional“ bezeichnet die betreffende Kante; die Pakete bleiben Teil der Prüfung.

| Angabe | Pakete mit Version | Bereich | Weg in den Baum | Vorschlag, Begründung und Quelle; Stand |
|---|---|---|---|---|
| `BSD-2-Clause` | `css-select` 6.0.0, `css-what` 7.0.0, `domelementtype` 2.3.0, `domhandler` 5.0.3, `domutils` 3.2.2, `entities` 4.5.0, `nth-check` 2.1.1, `http-cache-semantics` 4.2.0 | bereitgestellt | A → `svgo` → `css-select` / `css-what`; `css-select` → `domhandler` → `domelementtype`, → `domutils` → `dom-serializer` → `entities`, → `nth-check`; A → `http-cache-semantics` | Für Werkzeuge aufnehmen: permissiver Text in jeder lokalen `LICENSE`, mit Hinweispflichten; [BSD-2-Clause](https://spdx.org/licenses/BSD-2-Clause.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `0BSD` | `tslib` 2.8.1 | bereitgestellt, auch entwicklung | A → `@astrojs/markdown-satteri` → `satteri` → optional `@bruits/satteri-wasm32-wasi` → dessen `@emnapi/core` → `tslib`; außerdem Wurzel → `@astrojs/check` → `@astrojs/language-server` → `@astrojs/astro2tsx` → `@emnapi/core` → `tslib` | Werkzeugnutzung aufnehmen: `node_modules/tslib/LICENSE.txt` enthält den [0BSD-Text](https://spdx.org/licenses/0BSD.html). **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `BlueOak-1.0.0` | `common-ancestor-path` 2.0.0, `lru-cache` 11.5.3, `sax` 1.6.1 | bereitgestellt | A → `common-ancestor-path`; A → `unstorage` → `lru-cache`; A → `svgo` → `sax` | Für Werkzeuge aufnehmen; alle drei `LICENSE.md` enthalten denselben [Blue-Oak-Text](https://spdx.org/licenses/BlueOak-1.0.0.html), einschließlich Pflicht zu Lizenztext oder Link. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `CC0-1.0` | `mdn-data` 2.27.1 und 2.0.28 | bereitgestellt | A → `svgo` → `css-tree` → 2.27.1; A → `svgo` → `csso` → dessen `css-tree` → 2.0.28 | Für Werkzeugdaten aufnehmen; beide lokalen `LICENSE` enthalten [CC0](https://spdx.org/licenses/CC0-1.0.html), einschließlich ersatzweiser Erlaubnis und Beschränkungen. **Umgesetzt**, Auslieferung bleibt gesperrt. |
| `Python-2.0` | `argparse` 2.0.1 | bereitgestellt | A → `js-yaml` → `argparse` | Werkzeugnutzung aufnehmen; vollständige Lizenzabschnitte in `node_modules/argparse/LICENSE`, [Vergleichstext](https://spdx.org/licenses/Python-2.0.html). **Umgesetzt**, Hinweise und Änderungsvermerk bei Weitergabe beachten. |
| `LGPL-3.0-or-later` | `@img/sharp-libvips-darwin-arm64`, `-darwin-x64`, `-linux-arm`, `-linux-arm64`, `-linux-ppc64`, `-linux-riscv64`, `-linux-s390x`, `-linux-x64`, `-linuxmusl-arm64`, `-linuxmusl-x64`, jeweils 1.3.3 (voller Präfix jeweils `@img/sharp-libvips`) | bereitgestellt | A → optional `sharp` 0.35.4 → optionale Plattformpakete | Werkzeugkennung aufnehmen, Entfernung des optionalen Baums weiter prüfen. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html); diese zehn Pakete sind lokal **nicht installiert**, ihr Inhalt ist nicht gegengeprüft. **Umgesetzt als Metadatenregel**, keine Bestätigung ihrer vollständigen Inhalte. |
| `Apache-2.0 AND LGPL-3.0-or-later` | `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64`, jeweils 0.35.4 | bereitgestellt | A → optional `sharp` → optionale Plattformpakete | Werkzeugregel aufnehmen. Lokal nur x64: `LICENSE` enthält Apache-2.0, `README.md` nennt libvips und weitere LGPL-Anteile samt „any later version“. [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt**, weitere eingebettete Lizenzen bleiben gesondert zu prüfen. |
| `Apache-2.0 AND LGPL-3.0-or-later AND MIT` | `@img/sharp-wasm32` 0.35.4 | bereitgestellt | A → optional `sharp` → optional `@img/sharp-freebsd-wasm32` bzw. `@img/sharp-webcontainers-wasm32` → `@img/sharp-wasm32` | Zusammengesetzte Werkzeugangabe nach denselben Regeln aufnehmen. Nur Lockfile, kein lokal gelesener Paketinhalt; [LGPL-Text](https://spdx.org/licenses/LGPL-3.0-or-later.html). **Umgesetzt als Metadatenregel**. |
| `Unlicense` | `big-integer` 1.6.52 | ausgeliefert | E → `big-integer` | **Offen:** Aufnahme von Unlicense für diesen Nutzungszweck vorschlagen. `node_modules/big-integer/LICENSE` enthält die umfassende Nutzungserlaubnis und Gemeinfreiheitserklärung des [Unlicense-Texts](https://spdx.org/licenses/Unlicense.html). Keine neue Kennung eingetragen. |
| keine Angabe | `buffers` 0.1.1 | ausgeliefert | E → `binary` 0.3.0 → `buffers` | **Offen:** Sperre beibehalten, bis ein versionsbezogener Lizenzbeleg vorliegt oder der Pfad entfällt. In Manifest, README, Quell-/Testdateien und Dateiliste kein Lizenznachweis gefunden. Keine Lizenz aus benachbarten Paketen ableiten. |
| `MIT/X11` | `chainsaw` 0.1.0; `traverse` 0.3.9 | ausgeliefert | E → `binary` → `chainsaw` → `traverse` | **Offen:** Für `traverse` genaue MIT-Ausnahme vorschlagen: vollständiger Text in `LICENSE`. Für `chainsaw` zuerst einen versionsbezogenen Volltext beschaffen; das Manifest allein trägt nur das alte Kürzel. Kein globaler Alias MIT/X11. [MIT-Vergleichstext](https://spdx.org/licenses/MIT.html). |
| `MIT OR SEE LICENSE IN FEEL-FREE.md` | `rgbcolor` 1.0.1 | ausgeliefert | J → optional `canvg` 3.0.11 → `rgbcolor` | **Offen:** genaue MIT-Ausnahme vorschlagen; `LICENSE.md` enthält MIT und erlaubt ausdrücklich die Wahl gegenüber `FEEL-FREE.md`. Letztere Datei ist ebenfalls gelesen, wird aber nicht zur allgemeinen Kennung erklärt. [MIT-Vergleichstext](https://spdx.org/licenses/MIT.html). |

**Bereits erledigte Angaben im ausgelieferten Baum:** `jszip` 3.10.2 über `exceljs` besteht mit `(MIT OR GPL-3.0-or-later)` unter MIT; `jszip/LICENSE.markdown` enthält den MIT-Text und die Alternative. `pako` 1.0.11 über `exceljs → jszip` und `pako` 2.2.0 über `jspdf` bestehen mit `(MIT AND Zlib)`; beide Pakete enthalten MIT in `LICENSE` und Zlib-Hinweise in `lib/zlib/deflate.js`. `dompurify` 3.4.15 über die optionale Kante von `jspdf` besteht bereits mit `(MPL-2.0 OR Apache-2.0)` unter Apache-2.0; gelesen sind Manifest, `LICENSE` und `LICENSE-MPL`. Dafür ist keine neue Ausnahme nötig.

### Optionaler Baum von sharp und libvips

Im beobachteten Graphen führt der einzige Eingang zu `sharp` 0.35.4 über `astro.optionalDependencies`. Auch dessen Plattformpakete werden optional eingebunden. `@img/sharp-wasm32` folgt als normale Abhängigkeit zweier optionaler Plattformpakete; der gesamte Weg bleibt damit optional. Ohne optionale Kanten ist keines dieser Pakete von den lokalen Manifesten aus erreichbar. Die betreffenden Lockfile-Einträge tragen außerdem `optional: true`.

[toolchain.md](toolchain.md) beschreibt sharp mit libvips als optionale Bildverarbeitung, die von der App nicht genutzt wird, und verlangt, den Baum wenn möglich zu entfernen. Diese Vorgabe bleibt bestehen. Die Aufnahme von LGPL als Werkzeugkennung ersetzt weder diese Prüfung noch die Prüfung vorgebauter Programme für F-Droid. Manifest, Lockfile und Installation wurden hier nicht geändert.

Das installierte `@img/sharp-win32-x64` 0.35.4 zeigt eine weitere Grenze: Seine README nennt zahlreiche eingebettete Bibliotheken und zusätzliche Lizenztexte, unter anderem für fontconfig, FreeType, libpng und mozjpeg sowie eine Patentlizenz für aom. Das äußere SPDX-Feld bildet diese Tabelle nicht vollständig ab. Gelesen wurden hier die README und die Apache-Lizenz des Pakets sowie der LGPL-Vergleichstext; die weiteren eingebetteten Texte und die nicht installierten Plattformpakete sind damit nicht vollständig geprüft.

## ExcelJS: beobachtetes vorgebautes Bündel

**ExcelJS 4.4.0 bleibt für Arbeitspaket 2.4.** Über einen Ersatz wird vor Stufe 3 entschieden. Das ist keine Freigabe der noch offenen Lizenzangaben.

Die Auswertung vom 2026-09-28 wurde am 2026-09-29 mit `buendel-inhalt.log`, dem aktuellen Lockfile und der lokal installierten Source-Map abgeglichen:

- Das Paketmanifest benennt für den Browser `dist/exceljs.min.js`. Die Datei ist **947.702 Bytes** groß und trägt den Kopf `ExcelJS 19-10-2023`. Das ist ein Datum im ausgelieferten Dateikopf, kein hier nachgewiesener reproduzierbarer Buildzeitpunkt.
- `dist/exceljs.min.js.map` enthält **534 Quellen**, davon **145 ohne `node_modules` im Pfad**. Aus den übrigen Pfaden ergeben sich **68 unterschiedliche Paketnamen**, einschließlich verschachtelter Namen. Die lokale Source-Map bestätigt die Namensliste des Protokolls.
- **39 dieser 68 Namen fehlen im aktuellen Lockfile**, beispielsweise `asn1.js`, `bn.js`, `elliptic` und `crypto-browserify`. Die Lockfile-Prüfung sieht diese eingebetteten Pakete nicht. `core-js` ist dagegen inzwischen als eigener Name im Lockfile enthalten; daraus folgt keine Versionsgleichheit mit dem Bündel.
- Die Versionen neben einigen Namen im Protokoll wurden aus der damaligen Installation gelesen. Sie belegen **nicht** die Versionen der eingebetteten Quellen. Auch die 29 im Lockfile vorhandenen Namen sind damit nicht als inhalts- oder versionsgleich bestätigt. Die Lizenztexte der 39 nicht erfassten Paketnamen sind noch nicht vollständig geprüft.
- Im protokollierten Website-Build vom **2026-09-26** wurde `_astro/exceljs.min.*.js` mit **929.905 Bytes** und Anteilen von `elliptic` beobachtet. Dieser Befund spricht dort für die Einbindung des vorgebauten Browser-Bündels. Der Website-Build wurde hier nicht erneut ausgeführt oder vollständig gesichtet. Im Protokoll zur Source-Map fehlen `unzipper`, `buffers`, `big-integer`, `chainsaw` und `traverse` unter den 68 Namen; das hebt deren Einordnung nach dem Lockfile nicht auf.

**Der Build der App mit der Oberfläche ist noch nicht geprüft.** Aus der Website-Beobachtung folgt keine Aussage über den späteren App-Inhalt. Die Prüfung der eingebetteten Anteile und ihres Buildwegs bleibt Teil des offenen Punkts F5 in [fdroid-build.md](fdroid-build.md).

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

Der Lauf mit dem beschriebenen Bestand hat **zehn Fehlermeldungen bei fünf Paketen**, jeweils einmal für das Lockfile und einmal für die installierte Angabe:

| Paket | Beide Befunde betreffen |
|---|---|
| `big-integer` 1.6.52 | Unlicense noch nicht in den Prüfdaten |
| `buffers` 0.1.1 | fehlende Lizenzangabe |
| `chainsaw` 0.1.0 | nicht unterstützte Angabe MIT/X11 |
| `traverse` 0.3.9 | nicht unterstützte Angabe MIT/X11 |
| `rgbcolor` 1.0.1 | nicht unterstützter SEE-LICENSE-Zweig |

**Offen ist die Entscheidung über diese Vorschläge.** Bis zur Bearbeitung besteht die Lizenzprüfung nicht; die Manifeste der Oberfläche können diese Voraussetzung für einen Merge noch nicht erfüllen.

### Installationsskripte und vorgebaute Programme

Drei Pakete tragen Installationshaken: `core-js` 3.50.0, `esbuild` 0.28.2 und das hier nicht installierte `fsevents` 2.3.3. Insgesamt melden Namensmuster und gefundene Binärdateien bei **35 Paketen** vorgebaute Programme. Diese Zahl ist eine Hilfestellung, kein vollständiger Binärnachweis. Für nur im Lockfile vorhandene Pakete stehen keine lokalen Dateien zur Suche zur Verfügung. Das bekannte eingebettete WebAssembly von `es-module-lexer` wird zusätzlich über ein Namensmuster erfasst.

Das Skript erfasst `preinstall`, `install`, `postinstall` und `binding.gyp`. `prepare` und `prepack` sind keine hier geprüften Installationshaken für Registry-Pakete; Quellinstallationen aus Git benötigen eine eigene Prüfung. Lizenzfehler unterdrücken die Suche nach Hinweis- und Binärdateien nicht. Weder die Bereichseinordnung noch das Abschalten von Installationsskripten entfernt bereits enthaltene Programme. Der tatsächliche Build-Baum bleibt für Paket 2.8 zu prüfen.

## Hinweise Dritter, Paketinhalt und verbleibende Arbeit

Die Prüfung liest Lizenz- und Hinweisdateien, bewertet deren Vollständigkeit jedoch nicht automatisch. Für die spätere Auslieferung der Oberfläche fehlen noch gesammelte Originalhinweise und Lizenztexte der tatsächlich enthaltenen Fremdanteile. Sie müssen in die betroffenen npm-Pakete und offline lesbar in die App aufgenommen werden. Eine Kennung in diesem Dokument ersetzt diese Texte nicht. Auch Werkzeugpakete wie Rolldown und sharp enthalten weitere, nicht als eigene Lockfile-Pakete erfasste Anteile.

`LICENSE` und `NOTICE` in der Wurzel müssen lesbar und nicht leer sein. Ihre Kopien in jedem npm-Workspace unter `packages/` werden bei jedem Lauf byteweise verglichen. `.gitattributes` legt LF fest. Die Oberfläche führt bisher nur `LICENSE` und `NOTICE` unter `files`; die Auslieferungsdateien ergänzt die weitere Arbeit an Paket 2.4. Am 2026-09-28 bestand eine Packlistenprobe des damaligen Gerüsts; sie wurde mit dem jetzigen Stand nicht wiederholt.

`--packliste <Datei>` prüft zusätzlich die unveränderte JSON-Ausgabe eines vorherigen `npm pack --dry-run --json --offline --ignore-scripts`: erwartete npm-Pakete und Versionen, `package.json`, vollständige Hinweisdateien und passende Größen. Die App wird nicht als npm-Paket erwartet. Leere, doppelte oder unvollständige Listen führen zu Code 1. Der Trockenlauf ersetzt keine Sichtung eines tatsächlich erzeugten Archivs. Grundlage: npm-Dokumentation zu [`files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) und [`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/).

Vor Stufe 3 bleiben:

1. Die fünf offenen Paketbefunde entscheiden und bearbeiten; danach muss die Lizenzprüfung bestehen. Einzelausnahmen benötigen Review, genaue Belege und Befristung.
2. Die `files`-Liste der vollständigen Oberfläche ergänzen und beide npm-Packlisten nach dem Build erneut prüfen.
3. Die erzeugten `.tgz`-Archive sowie Website- und App-Bundles sichten, eingebettete Pakete mit genauen Versionen und Originalhinweisen erfassen; über einen Ersatz für ExcelJS entscheiden.
4. Den optionalen sharp-Baum und die weiteren vorgebauten Bestandteile im tatsächlichen F-Droid-Build behandeln. Der Befund zu ExcelJS ist bei F5 zu berücksichtigen.
5. Android- und Gradle-Abhängigkeiten ergänzen; diese werden von der npm-Liste nicht erfasst.
6. Entscheiden, ob zusätzlich zu `package-lock.json` eine erzeugte vollständige Abhängigkeitsliste mit Bereichen und Wegen eingecheckt wird, und ihren Aktualisierungsweg festlegen. Die Entscheidung ist offen; derzeit wird diese Liste mit `node scripts/check-licenses.mjs --json` erzeugt.

Ein erfolgreicher Metadatenlauf belegt weder die Vollständigkeit fremder Lizenzangaben noch sämtliche Weitergabepflichten oder die F-Droid-Tauglichkeit. Proprietäre Dienste werden nicht anhand eines Lizenzfelds erkannt. Der tatsächliche Offline-Betrieb und das Android-Manifest gehören zur Abnahme der vollständigen App.
