# Lizenzen und Abhängigkeiten

Stand der Bestandsaufnahme: **2026-09-28**, nach Übernahme des Rechenkerns. Dieses Dokument behandelt die npm-Abhängigkeiten aus `package-lock.json`. Die Werkzeuge und Android-Komponenten außerhalb dieses Lockfiles werden in `toolchain.md` und im F-Droid-Nachweis zu Paket 2.8 behandelt.

Das Projekt steht unter Apache-2.0. Der Wortlaut liegt in `LICENSE`, der Herausgeberhinweis in `NOTICE` in der Wurzel des Repositorys.

## Zulässige Lizenzen

Die verbindliche Liste für das Prüfskript steht als Daten in [`scripts/check-licenses.json`](../scripts/check-licenses.json). Es handelt sich um eine begrenzte Auswahl geprüfter Lizenzen für dieses Projekt, nicht um ein Verzeichnis aller freien Lizenzen.

| SPDX-Kennung | Test und Build | Auslieferung | Grund und zu beachtende Bedingungen |
|---|---|---|---|
| MIT | ja | ja | Freie, permissive Lizenz; Urheber- und Lizenzhinweise bei Weitergabe beibehalten. |
| Apache-2.0 | ja | ja | Freie, permissive Lizenz wie die Projektlizenz; Lizenztext, einschlägige Hinweise und gegebenenfalls vorhandene NOTICE-Inhalte erhalten, Änderungen kenntlich machen. |
| ISC | ja | ja | Freie, permissive Lizenz; Urheber- und Erlaubnistext erhalten. |
| BSD-3-Clause | ja | ja | Freie, permissive Lizenz; Hinweise und Haftungsausschluss erhalten, keine Werbung mit Namen der Rechteinhaber ohne Erlaubnis. |
| MPL-2.0 | ja | derzeit nein | Freie Lizenz mit Copyleft auf Dateiebene. Bei Weitergabe betroffener Software sind unter anderem Quelltextzugang und Hinweise zu berücksichtigen. |

Die Bedingungen ergeben sich aus den Lizenztexten: [MIT](https://spdx.org/licenses/MIT.html), [Apache-2.0, Abschnitt 4](https://www.apache.org/licenses/LICENSE-2.0), [ISC](https://spdx.org/licenses/ISC.html), [BSD-3-Clause](https://spdx.org/licenses/BSD-3-Clause.html) und [MPL-2.0, Abschnitt 3](https://www.mozilla.org/en-US/MPL/2.0/). Die [MPL-FAQ von Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) erläutert den Unterschied zwischen eigener Nutzung und Weitergabe. Quellen abgerufen am 2026-09-28.

**Strengere Regeln für die Auslieferung:** Zunächst sind dort nur die vier permissiven Lizenzen zugelassen. So bleiben die Pflichten bei Einbindung in npm-Pakete, Browser-Dateien und die Android-App überschaubar. MPL-2.0 ist frei und wird hier nicht als proprietär eingestuft. Ihre Aufnahme in ausgelieferte Software benötigt jedoch vorher einen konkreten Plan für Quelltextzugang und Hinweise sowie eine Anpassung der Prüfdaten mit Review. Die heutige Nutzung von Lightning CSS als Werkzeug überträgt dessen Lizenz nicht allein dadurch auf selbst geschriebenes CSS. Übernommener Code und eingebettete Fremdanteile sind gesondert zu prüfen.

Fehlende Angaben, unbekannte Kennungen, `UNLICENSED`, Verweise wie `SEE LICENSE IN ...` und ältere Lizenzobjekte statt eines SPDX-Texts führen zum Fehler. Eine nicht gelistete Lizenz ist nicht automatisch unfrei; sie ist für diese Prüfung noch nicht freigegeben. Eine Aufnahme setzt Prüfung des Lizenztexts, des Nutzungszwecks und der Weitergabepflichten voraus.

### Zusammengesetzte Angaben

Das Skript verarbeitet `AND`, `OR` und geschachtelte Klammern entsprechend der [SPDX-Spezifikation, Anhang D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/):

- `AND`: Alle Bestandteile müssen für den Verwendungsbereich zulässig sein.
- `OR`: Ein zulässiger Zweig genügt. Die Ausgabe nennt die erste passende Alternative von links als gewählte Lizenz. Bei `AND` nennt sie alle erforderlichen Lizenzen.
- `AND` bindet stärker als `OR`; Klammern ändern die Reihenfolge.
- Kennungen werden ohne Beachtung der Großschreibung verglichen, Operatoren sind großzuschreiben. Für den Gegenvergleich werden Reihenfolge und gleichartige Klammergruppen normalisiert. Eine darüber hinausgehende algebraische Gleichwertigkeit wird nicht hergeleitet.

`MPL-2.0 OR MIT` ist daher für die Auslieferung unter MIT zulässig, `MPL-2.0 AND MIT` derzeit nicht. Der gesamte Ausdruck wird zuerst geprüft: Auch `MIT OR Unbekannt` ist ein Fehler. `WITH`-Ausnahmen, `+`-Kennungen und `LicenseRef` sind noch nicht freigegeben und werden nicht still entfernt.

## Beobachteter Bestand

Das Lockfile im Format 3 enthält **70 Fremdpakete**, einschließlich aller transitiven und plattformabhängigen optionalen Pakete. Die Wurzel und drei eigene Workspaces sowie deren Links zählen nicht zu diesen 70 Paketen.

| Lizenz laut Lockfile | Anzahl |
|---|---:|
| MIT | 52 |
| MPL-2.0 | 12 |
| Apache-2.0 | 3 |
| ISC | 2 |
| BSD-3-Clause | 1 |
| **Gesamt** | **70** |

Alle 70 sind derzeit **Abhängigkeiten für Test und Build**. Direkte Entwicklungsabhängigkeiten der Wurzel sind `typescript` 6.0.3 und `vitest` 4.1.11. `@baremos/fristenrechner-kern` hat keine Abhängigkeiten; auch die Manifeste der Oberfläche und der App enthalten noch keine. Der Build des Kerns startet nur `tsc`. Im aktuellen Kern wird kein fremdes Laufzeitpaket gebündelt. Oberfläche und App sind noch nicht vollständig umgesetzt.

Unter Windows wurden **45 installierte Paketmanifeste** gegen das Lockfile geprüft: Name, Version und Lizenz stimmen überein. **25 Pakete** sind in dieser Installation nicht vorhanden und wurden anhand des Lockfiles geprüft. Eine nicht vorhandene Installation ist kein Nachweis über ihren tatsächlichen Inhalt. Der Lizenzlauf endete mit Code 0, ohne Lizenzfehler.

### Vollständige npm-Liste einschließlich Transitivabhängigkeiten

Alle Zeilen der folgenden Bestandsaufnahme gehören zu Test und Build. „Ja“ bedeutet Gegenprüfung des installierten Manifests. „Nein“ bedeutet nur Lockfile. „Nativ“ und „Wasm“ sind Prüfpunkte für Paket 2.8, keine Aussage über eine unfreie Lizenz. Das Skript gibt zusätzlich den eindeutigen Lockfile-Pfad aus; die JSON-Ausgabe enthält die aufgelösten Abhängigkeiten jedes Fremdpakets.

| Paket | Version | Lizenz | Lokal gegengeprüft | Besonderheit |
|---|---|---|---|---|
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | ja |  |
| `@oxc-project/types` | 0.150.0 | MIT | ja |  |
| `@rolldown/binding-android-arm-eabi` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-android-arm64` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-darwin-arm64` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-darwin-x64` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-freebsd-x64` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-arm-gnueabihf` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-arm64-gnu` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-arm64-musl` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-ppc64-gnu` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-s390x-gnu` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-x64-gnu` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-linux-x64-musl` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-openharmony-arm64` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-win32-arm64-msvc` | 1.2.9 | MIT | nein | nativ |
| `@rolldown/binding-win32-x64-msvc` | 1.2.9 | MIT | ja | nativ |
| `@rolldown/pluginutils` | 1.0.1 | MIT | ja |  |
| `@standard-schema/spec` | 1.1.0 | MIT | ja |  |
| `@types/chai` | 5.2.3 | MIT | ja |  |
| `@types/deep-eql` | 4.0.2 | MIT | ja |  |
| `@types/estree` | 1.0.9 | MIT | ja |  |
| `@vitest/expect` | 4.1.11 | MIT | ja |  |
| `@vitest/mocker` | 4.1.11 | MIT | ja |  |
| `@vitest/pretty-format` | 4.1.11 | MIT | ja |  |
| `@vitest/runner` | 4.1.11 | MIT | ja |  |
| `@vitest/snapshot` | 4.1.11 | MIT | ja |  |
| `@vitest/spy` | 4.1.11 | MIT | ja |  |
| `@vitest/utils` | 4.1.11 | MIT | ja |  |
| `assertion-error` | 2.0.1 | MIT | ja |  |
| `chai` | 6.2.2 | MIT | ja |  |
| `convert-source-map` | 2.0.0 | MIT | ja |  |
| `detect-libc` | 2.1.2 | Apache-2.0 | ja |  |
| `es-module-lexer` | 2.3.2 | MIT | ja | Wasm |
| `estree-walker` | 3.0.3 | MIT | ja |  |
| `expect-type` | 1.4.0 | Apache-2.0 | ja |  |
| `fdir` | 6.5.0 | MIT | ja |  |
| `fsevents` | 2.3.3 | MIT | nein | nativ, Installationsskript |
| `lightningcss` | 1.33.0 | MPL-2.0 | ja |  |
| `lightningcss-android-arm64` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 | nein | nativ |
| `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 | ja | nativ |
| `magic-string` | 0.30.21 | MIT | ja |  |
| `nanoid` | 3.3.19 | MIT | ja |  |
| `obug` | 2.2.1 | MIT | ja |  |
| `pathe` | 2.0.3 | MIT | ja |  |
| `picocolors` | 1.1.1 | ISC | ja |  |
| `picomatch` | 4.0.7 | MIT | ja |  |
| `postcss` | 8.5.28 | MIT | ja |  |
| `rolldown` | 1.2.9 | MIT | ja |  |
| `siginfo` | 2.0.0 | ISC | ja |  |
| `source-map-js` | 1.2.1 | BSD-3-Clause | ja |  |
| `stackback` | 0.0.2 | MIT | ja |  |
| `std-env` | 4.2.0 | MIT | ja |  |
| `tinybench` | 2.9.0 | MIT | ja |  |
| `tinyexec` | 1.3.1 | MIT | ja |  |
| `tinyglobby` | 0.2.17 | MIT | ja |  |
| `tinyrainbow` | 3.1.1 | MIT | ja |  |
| `typescript` | 6.0.3 | Apache-2.0 | ja |  |
| `vite` | 8.3.0 | MIT | ja |  |
| `vitest` | 4.1.11 | MIT | ja |  |
| `why-is-node-running` | 2.3.0 | MIT | ja |  |

### Installationsskripte und vorgebaute Programme

`fsevents` 2.3.3 ist der einzige Lockfile-Eintrag mit `hasInstallScript: true`. Es wird auf diesem Windows-System nicht installiert. Das Skript meldet zusätzlich vorhandene `preinstall`, `install` und `postinstall`-Einträge installierter Pakete sowie `binding.gyp` als möglichen impliziten `node-gyp`-Installationsschritt. Es führt sie nicht aus. `prepare` und `prepack` sind keine hier geprüften Installationshaken für Registry-Pakete; Quellinstallationen aus Git sind gesondert zu untersuchen.

**28 Pakete** tragen einen Hinweis auf vorgebaute Programme:

- 15 Varianten von `@rolldown/binding-*` 1.2.9, über `vitest → vite → rolldown`;
- 11 Varianten von `lightningcss-*` 1.33.0, über `vitest → vite → lightningcss`;
- `fsevents` 2.3.3, optional über `vitest → vite`;
- `es-module-lexer` 2.3.2, über `vitest`: die installierte README und `dist/lexer.js` beschreiben beziehungsweise enthalten eingebettetes WebAssembly. Eine reine Suche nach `.wasm`-Dateien würde diesen Fall übersehen.

Von den nativen Bindungen liegen lokal die beiden Windows-x64-Varianten als `.node`-Dateien vor. Die zwölf MPL-Einträge bestehen aus `lightningcss` selbst und seinen elf Plattformpaketen. Das Abschalten von Installationsskripten entfernt keine bereits im npm-Paket enthaltenen Programme.

Namensmuster für bekannte Fälle und Dateiendungen stehen in den Prüfdaten. Zusätzlich durchsucht das Skript vorhandene Paketdateien nach Binärendungen, ohne fremde `node_modules`-Unterbäume oder symbolische Verknüpfungen zu verfolgen. Diese Erkennung ist eine Hilfestellung, kein vollständiger Binärscanner. Paket 2.8 muss den tatsächlich verwendeten Build-Baum einschließlich solcher Dateien mit dem F-Droid-Scanner prüfen und Herkunft beziehungsweise einen Build aus Quellen behandeln.

## Hinweise Dritter

**Heute wird keine zusätzliche Datei mit Hinweisen Dritter angelegt.** Die 70 Fremdpakete werden für Test und Build verwendet; weder `node_modules` noch Bestandteile dieser Werkzeuge werden mit dem aktuellen Rechenkern ausgeliefert. Ihre installierten Lizenz- und Hinweisdateien bleiben unverändert. Die JSON-Ausgabe führt gefundene Dateien auf, bewertet deren Inhalt aber nicht.

Die Tabelle oben ist ein Abhängigkeitsverzeichnis, kein Ersatz für Lizenztexte und Urheberhinweise einer späteren Auslieferung. Einzelne Werkzeuge enthalten weitere gebündelte Anteile; etwa führt `rolldown/THIRD-PARTY-LICENSE` Hinweise auf solche Anteile. Sie sind nicht als separate npm-Pakete im Lockfile erfasst. Das Lizenzfeld des äußeren Pakets allein belegt deren Lizenzen nicht.

Sobald Oberfläche oder App fremden Code, Fonts, Bilder, Exportbibliotheken oder native Komponenten ausliefern, werden die einschlägigen Originalhinweise und Lizenztexte gesammelt, beispielsweise in `THIRD-PARTY-NOTICES.txt` mit ergänzenden Lizenzdateien. Diese gehören dann in die betroffenen npm-Pakete und offline lesbar in die App. Dass eine Bibliothek als `devDependency` eingetragen ist, reicht nicht als Begründung für ihre Abwesenheit im Bundle.

## Prüfung ausführen

Ohne Netzwerk, ohne zusätzliche Node-Abhängigkeit und ohne Aufruf von npm:

```text
node scripts/check-licenses.mjs
node scripts/check-licenses.mjs --json
node --test scripts/check-licenses.test.mjs
```

Die erste Form liefert eine vollständige Liste für Menschen. Die zweite liefert nur JSON, einschließlich Zusammenfassung, Lizenzwahl, Abhängigkeiten, Hinweisen und Fehlern (`formatVersion: 1`). Beide verwenden Code **0** nur bei bestandener Prüfung, sonst **1**, auch bei nicht lesbaren Eingabedateien. `--wurzel <Ordner>` erlaubt die Prüfung einer anderen lokalen Projektkopie. Es werden keine Registry-Adressen aus dem Lockfile aufgerufen.

Der Ablauf:

1. Workspaces aus dem Wurzelmanifest ermitteln, ihre Manifeste mit dem Lockfile vergleichen. Unterstützt sind konkrete Pfade und Muster wie `packages/*`; andere Muster werden mit einem Fehler abgewiesen.
2. Von `dependencies`, `optionalDependencies` und vorhandenen `peerDependencies` der Workspaces und vorsorglich auch der Wurzel alle transitiven Pfade verfolgen. Diese bilden den Bereich „ausgeliefert“. Das ist eine konservative Einordnung nach Manifesten, keine Bundle-Analyse. `devDependencies` der lokalen Pakete bilden mit ihren transitiven Pfaden den Bereich „entwicklung“. Bei Überschneidung gilt die strengere Regel.
3. Verschachtelte Versionen, Aliasse und Workspace-Links auflösen. Das `dev`-Flag des Lockfiles ist nicht allein entscheidend. Nicht zuordenbare Einträge und fehlende erforderliche Kanten sind Fehler. Optionale Abhängigkeiten müssen im Lockfile stehen, auch wenn sie lokal fehlen; fehlende ausdrücklich optionale Peers sind zulässig.
4. Alle Lizenzfelder prüfen, vorhandene Installationen nach Name, Version und Lizenz gegenprüfen. Ein vorhandener Paketordner mit fehlendem oder defektem Manifest ist ein Fehler. Eine gültige installierte Lizenz ersetzt keine fehlende Lockfile-Angabe. Nicht installierte Plattformpakete bleiben Bestandteil der Prüfung.
5. Installationshaken, vorgebaute Programme und gefundene Hinweisdateien aufführen. `LICENSE` und `NOTICE` in der Wurzel müssen lesbar und nicht leer sein. Die Kopien in allen npm-Paketordnern unter `packages/` müssen lesbar, nicht leer und bytegleich mit der jeweiligen Wurzeldatei sein. Fehlende, leere oder abweichende Kopien führen schon im normalen Lauf zu Code 1.

Die Tests verwenden eigene kleine Projektbäume unter `scratchpad/`. Sie prüfen insbesondere SPDX-Priorität und Klammern, unbekannte OR-Zweige, beide Verwendungsbereiche, verschachtelte und transitive Abhängigkeiten, Peers, Zyklen, Aliasse, Workspace-Links, abweichende Installationen, Plattformpakete, Installationshaken, Binärhinweise, Packlisten und CLI-Exit-Codes. Sie benötigen weder private Dateien noch ein bestehendes `node_modules`. `npm test` nimmt sie über `scripts/*.test.mjs` bereits mit.

### Grenzen der automatischen Prüfung

Ein erfolgreicher Lauf bestätigt die ausgewerteten Metadaten nach der Projektliste. Er belegt weder die Vollständigkeit fremder Lizenzangaben noch die Freiheit aller eingebetteten Anteile, die Erfüllung sämtlicher Weitergabepflichten oder die F-Droid-Tauglichkeit. Die Prüfung erkennt auch keine proprietären Dienste anhand eines SPDX-Felds.

**Beobachtung heute:** Die Manifeste enthalten keine externen Laufzeitabhängigkeiten und damit keine darüber eingebundenen proprietären Dienste. Die 70 npm-Lizenzangaben enthalten keine unfreie Lizenz. Daraus folgt keine Aussage über eine künftige vollständige App. Jede neue Abhängigkeit benötigt zusätzlich eine Sichtung ihrer Nutzung: kein erforderliches Konto, kein proprietärer Backend-Dienst und kein nachgeladener Bestandteil im Betrieb. Der tatsächliche Offline-Betrieb und das Android-Manifest gehören zur Abnahme der App.

## npm-Paketinhalt und verbleibende Arbeit vor Stufe 3

Am 2026-09-28 liegen `LICENSE` und `NOTICE` als bytegleiche Kopien der Wurzeldateien in `packages/kern/` und `packages/oberflaeche/`. Beide Manifeste führen sie unter `files` auf: beim Kern `["dist", "LICENSE", "NOTICE"]`, bei der noch nicht umgesetzten Oberfläche `["LICENSE", "NOTICE"]`. Der Trockenlauf von `npm pack` nach dem Build enthält beide Hinweisdateien in beiden Paketen; die Prüfung mit `--packliste` endet mit Code 0.

Die Wurzeldateien werden von npm nicht automatisch aus dem übergeordneten Repository in den Paketordner übernommen. Die eingecheckten Kopien sind bei jeder Änderung der Wurzeldateien zu synchronisieren; schon der normale Lizenzlauf vergleicht sie byteweise. `.gitattributes` legt für alle Dateien namens `LICENSE` und `NOTICE` auch in der Arbeitskopie LF fest. Ein automatischer `prepack`-Hook wird nicht benötigt; `.npmrc` setzt `ignore-scripts=true`.

Grundlage sind die npm-Dokumentationen zu [`files`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) und [`npm pack` / `ignore-scripts`](https://docs.npmjs.com/cli/v11/commands/npm-pack/#ignore-scripts), abgerufen am 2026-09-28.

Die Zusatzprüfung läuft mit den vorhandenen Manifesten. PowerShell aus der Projektwurzel, mit Probedateien und npm-Cache unter `scratchpad`:

```powershell
New-Item -ItemType Directory -Force scratchpad/tmp | Out-Null
$env:TEMP = Join-Path $PWD 'scratchpad/tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $PWD 'scratchpad/npm-cache'
npm run build
npm pack --dry-run --json --offline --ignore-scripts --workspace packages/kern --workspace packages/oberflaeche |
  Set-Content -Encoding utf8 scratchpad/npm-pack.json
if ($LASTEXITCODE -ne 0) { throw 'npm pack ist fehlgeschlagen.' }
node scripts/check-licenses.mjs --packliste scratchpad/npm-pack.json
```

`--packliste` lässt den Lauf mit Code **1** scheitern, wenn `LICENSE` oder `NOTICE` nicht enthalten sind, Kopien fehlen oder vom Original abweichen, Größen nicht passen, Paketnamen beziehungsweise Versionen abweichen oder ein npm-Workspace unter `packages/` in der Liste fehlt. Die App wird nicht als npm-Paket erwartet. Auch die heute noch privaten npm-Workspaces werden geprüft. `--json` ist mit diesem Modus kombinierbar. Die Packliste muss aus dem unmittelbar vorherigen Lauf stammen; sie ist kein signierter Nachweis über ein Archiv und darf nicht von Hand ergänzt werden.

Vor Stufe 3 bleiben:

1. Für die vollständige Oberfläche in Paket 2.4 die `files`-Liste um die vorgesehenen Komponenten, Styles und sonstigen Auslieferungsdateien ergänzen. Die Packlistenprüfung nach dem Build beider fertigen Pakete erneut ausführen.
2. Mit den bis dahin vollständigen Abhängigkeiten das Verzeichnis erneuern, gebündelte Fremdanteile und ihre Originalhinweise prüfen. Bei notwendiger Weitergabe Hinweise Dritter ergänzen.
3. Die wirklich erzeugten `.tgz`-Archive und die Web-/App-Bundles sichten: Lizenz- und Hinweisdateien mit richtigem Inhalt, ausschließlich vorgesehene Dateien, keine Testdaten oder privaten Dateien. Auch vom Compiler eingefügter oder vom Bundler eingebetteter Fremdcode ist zu berücksichtigen.
4. Die Android-/Gradle-Abhängigkeiten ergänzen und Paket 2.8 mit dem tatsächlichen Build-Baum abschließen. Die npm-Liste erfasst diese Komponenten nicht.

Das Wurzelmanifest enthält `"lizenzen": "node scripts/check-licenses.mjs"`; `npm run lizenzen` startet die normale Lizenzprüfung. Sie sollte außerdem in die spätere CI aufgenommen werden; die Packlistenprüfung gehört nach Build und Paketvorbereitung in den Ablauf für die Veröffentlichung.
