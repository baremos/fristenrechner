# @baremos/fristenrechner-ui

Astro-Komponente, Bedienlogik und Dateiexporte des Fristenrechners Vergabe. Die Berechnung kommt aus `@baremos/fristenrechner-kern`.

Online nutzbar: [Fristenrechner Vergabe auf baremos.de](https://www.baremos.de/de/vergabe/fristenrechner/)

Die Bedienlogik erhält Speicher, Import, Dateiausgabe, Zeit und Bestätigung über eine `Plattform`. Der enthaltene Web-Adapter verwendet den Browser. Native Adapter gehören zum jeweiligen Gastgeber. Die Komponente wird ausdrücklich durch den Gastgeber initialisiert.

> Der Fristenrechner ist eine unverbindliche Rechenhilfe. Er ersetzt keine Rechtsberatung. Alle Angaben erfolgen ohne Gewähr.

## Voraussetzungen

Das Paket enthält Astro- und TypeScript-Quellen und wird ohne eigenen Build-Schritt ausgeliefert. Der Gastgeber bündelt sie mit Astro und dessen Vite; relative Importe ohne Dateiendung und ein CSS-Import mit `?inline` setzen das voraus. Prüft der Gastgeber Typen, prüft TypeScript die mitgelieferten Quellen mit den Einstellungen des Gastgebers. `webTexte` und `webExportInhalt` enthalten die Texte und Exportangaben der Website der BAREMOS IT GmbH, darunter deren Datenschutzhinweis, Herausgeber, Adresse und Dateipräfix. Andere Gastgeber übergeben eigene Werte.

## Einbindung

Eine Komponente je Seite verwenden. Eine zweite Komponente oder erneute Initialisierung löst einen Fehler aus; feste Formular-Kennungen bleiben damit eindeutig. `initFristenrechner(root, optionen)` erhält dieselben Texte und Exportinhalte, die beim Rendern an die Komponente übergeben wurden.

Optional aktiviert `menue={{ darstellung: 'bottom-sheet', titel: 'Fristenrechner' }}` eine feste obere Leiste und den Dialog „Dateiaktionen“. Vorgabe ist `aus`; ausgelassen oder ausdrücklich ausgeschaltet entstehen keine Menüknoten, Attribute, Listener oder Stile. Eine unbekannte Darstellung löst einen Fehler aus. Die Initialisierung liest die Option aus der Komponente; ein gleichnamiger Eintrag in `RechnerOptionen` kann sie ausdrücklich überschreiben.

Das Sheet nutzt dieselben Dateiaktionen, Sperren und Statusregionen wie die bisherigen Schaltflächen. Ohne Teilen-Fähigkeit fehlen die drei Teilen-Einträge. Eine Auswahl schließt synchron und ruft anschließend die Aktion auf. X, Escape, Außentipp und das optionale Ereignis von `plattform.zurueck` schließen mit Fokus zurück zum Knopf. Ohne diese Schnittstelle gibt es keinen Zurück-Weg. Die Komponente verwendet weder Web-Historie noch einen eigenen Wischhandler; die Android-Zurück-Geste erreicht das Menü in der App über `plattform.zurueck`.

Der Menüknopf ist ein `button` mit dem Namen „Dateiaktionen“, `aria-expanded` und `aria-controls` auf die eindeutige Dialog-ID. Er trägt kein `aria-haspopup`, damit ältere WebViews ihn nicht als Auswahlliste abbilden. Das Sheet behält seine Dialogrolle und seinen Namen.

Die Komponente reserviert die gemessene Leistenhöhe selbst vor dem Body-Inhalt, auch für Seitenabschnitte außerhalb des Rechners. Die Leiste folgt direkt auf die Reserve im Body, vor dem übrigen Seiteninhalt; das Overlay bleibt in der Komponente. Damit folgen auch in der Lesereihenfolge auf Kurztitel und Menüknopf erst die Seitenüberschrift und der Rechner. Während des Dialogs werden Hintergrundattribute gesichert, Geschwister entlang des Pfads zum Body verborgen, Fokusziele gesperrt und neue Hintergrundknoten beobachtet. Eine Fokusfalle und ein fixierter Body mit gesicherter Scrollposition ergänzen die Sperre. `dispose()` stellt Attribute und Scrollstil wieder her, entfernt Reserve, Menü und Beobachter und deaktiviert den Zurück-Weg; der Gastgeber beendet seinen Plattformadapter selbst.

Nur bei aktivem Menü ist die Metazeile zur Projektdatei (`#project-file-meta`) normaler lesbarer Text ohne Statusrolle und Live-Ansage. Das soll eine erneute Statusansage beim Einblenden des Hintergrunds vermeiden. Nachteil: Beim Import einer Projektdatei vor Rechenkern 1.9.0 wird der Migrationshinweis („… dadurch können sich Termine verschieben.“) deshalb nicht automatisch angesagt; er bleibt sichtbar und für Screenreader in der Lesereihenfolge erreichbar. Import-, Speicher- und Exportmeldungen behalten ihre Live-Regionen ohne zeitweise Stummschaltung; `dispose()` stellt auch die ursprünglichen Attribute der Metazeile wieder her. Die App meldet nach der Antwort ihres nativen Bestätigungsdialogs den unverändert verbundenen und fokussierten Bedienknopf erneut mit `blur()` und `focus({ preventScroll: true })`; dies gehört zum App-Adapter.

Das Layout verwendet die sichtbare Viewport-Höhe, lässt Text umbrechen und scrollt bei geringer Höhe das ganze Sheet. Es benötigt einen Seitenrahmen ohne transformierte oder abschneidende Vorfahren der Komponente. Bei aktivem Menü liegt die Leiste außerhalb der Komponente; Farbvariablen für Leiste und Sheet gehören deshalb an `:root` oder `body`. Zwischen `body` und der Komponente darf kein Element einen eigenen Stapelkontext bilden, etwa durch `z-index` mit Positionierung, `isolation`, `opacity` unter 1, `filter` oder `will-change`; sonst kann die Leiste über der Abdunklung des Sheets liegen. Die Umsetzung verwendet kein natives Web-Dialogelement und setzt Chromium 83 voraus. DOM-Tests prüfen den Vertrag; Schrift, Bildschirmtastatur, Systemleisten und Hilfstechnik benötigen zusätzlich eine Geräteprüfung.

```astro
---
import Fristenrechner from '@baremos/fristenrechner-ui';
import { webTexte, webExportInhalt } from '@baremos/fristenrechner-ui/ui';
---

<Fristenrechner texte={webTexte} exportInhalt={webExportInhalt}>
  <span slot="nach-hinweis">Kontaktinformationen des Gastgebers</span>
</Fristenrechner>

<script>
  import { erzeugeWebPlattform, initFristenrechner } from '@baremos/fristenrechner-ui/ui';
  import type { ExportInhalt, GastgeberTexte } from '@baremos/fristenrechner-ui/ui';

  const root = document.querySelector<HTMLElement>('[data-fristenrechner]')!;
  const plattform = erzeugeWebPlattform(root);
  const rechner = initFristenrechner(root, {
    plattform,
    texte: JSON.parse(root.dataset.gastgeberTexte!) as GastgeberTexte,
    exportInhalt: JSON.parse(root.dataset.exportInhalt!) as ExportInhalt,
  });

  // Beim Entfernen der Seite oder Komponente in dieser Reihenfolge aufräumen:
  const aufraeumen = () => {
    rechner.dispose();
    plattform.dispose();
  };
  // Der Gastgeber ruft aufraeumen in seinem eigenen Seiten-Lebenszyklus auf.
</script>
```

Die Props `texte` und `exportInhalt` sind erforderlich. Der optionale Prop `importBedienung` wählt `dateifeld` (Vorgabe, für den Web-Adapter) oder `schaltflaeche` (für einen passenden Importadapter). Beide Varianten haben genau ein aktives Element mit `data-project-import` und der Kennung `open-json`. Der optionale Prop `hinweisPosition` stellt den Hinweiskasten mit Datenschutztext und Speicherstatus (`storage-status`) über das Formular (`oben`, Vorgabe) oder unter den rechtlichen Hinweis (`unten`, so in der App); das vorgerenderte HTML der Vorgabe bleibt unverändert.

Der optionale Prop `farbschema` wählt `hell` (Vorgabe) oder `system`. Mit `hell` bleibt die Komponente unabhängig vom Gerät hell; das HTML enthält kein zusätzliches Attribut. Mit `system` trägt die Komponente `data-farbschema="system"` und folgt `prefers-color-scheme`: bei dunklem Systemfarbschema gilt eine eigene dunkle Palette einschließlich `color-scheme: dark` für Formularfelder, bei aktivem Menü auch für Leiste und Sheet (Klasse `fr-menue-system`). Die dunkle Palette gilt nur auf dem Bildschirm; Druck, PDF und Excel bleiben hell. Ein unbekannter Wert löst einen Fehler aus. Der Typ `Farbschema` und `pruefeFarbschema` sind über `@baremos/fristenrechner-ui/ui` verfügbar.

In Fenstern bis 48rem Breite zeigt die Komponente die Tabelle „Termine und Rechenwege“ als Karten je Zeile ohne seitliches Rollen; im HTML bleibt sie eine Tabelle mit ausdrücklichen Tabellenrollen, der Tabellenkopf ist nur visuell verborgen. Dieselbe Breite entfernt die äußeren Rahmen von Formular, Ergebnis und Fieldsets und zeigt „Neues Projekt“ als Schaltfläche. Breitere Fenster, Druck und die Exporte sind davon nicht betroffen. Die Komponente stellt sie als JSON in `data-gastgeber-texte` und `data-export-inhalt` bereit. Astro maskiert die Attributwerte. Das Beispiel liest diese Werte; die Bedienlogik erwartet keine eingebetteten Skripte und setzt Gastgebertexte nicht als HTML ein.

`rechner.dispose()` entfernt Ereignisbehandler, beendet den Speichertimer und verwirft noch nicht begonnene Schreibaufträge. Ein bereits laufender Schreibauftrag darf abschließen; bis dahin wird auch eine neue Initialisierung abgewiesen. Der Gastgeber besitzt den Adapter: Dessen gesondertes `dispose()` beendet eine offene Dateiauswahl und entfernt seine Ereignisbehandler. `Plattform` selbst verlangt keine `dispose`-Methode, weil die Lebensdauer anderer Adapter vom Gastgeber bestimmt wird.

## Plattform und Abläufe

Die Typen sind über `@baremos/fristenrechner-ui/ui` verfügbar, ebenso `WEB_SPEICHERSCHLUESSEL`, `FEHLERCODES`, `PlattformFehler`, `MAX_PROJEKT_BYTES` und `pruefeProjektGroesse`. App-Adapter benötigen dafür keine Importe in Paketinnereien.

| Teil der Plattform | Aufgabe |
|---|---|
| `speicher.lesen()`, `.schreiben(json)`, `.entfernen()` | Asynchrones Laden, Speichern und Löschen der Projektdatei. |
| `import.waehlen({ mime, endungen, maxBytes })` | Dateiauswahl; liefert `{ status: 'ok', wert: { name, text } }` oder `{ status: 'abgebrochen' }`. |
| `ausgabe.exportieren(datei)` | Ausgabe von Name, MIME-Typ und Bytes; liefert `{ status: 'ok' }` oder `{ status: 'abgebrochen' }`. |
| `ausgabe.teilen` | Optionale Ausgabe zum Teilen; der Web-Adapter bietet sie in dieser Fassung nicht an. |
| `zeit()` | Ein gemeinsamer UTC-Zeitpunkt und örtlicher Kalendertag für einen Export. |
| `zuruecksetzenBestaetigen()` | Asynchrone Bestätigung für ein neues Projekt. |

Der Web-Adapter nutzt `localStorage` mit dem Schlüssel `baremos-fristenrechner-projekt-v1`, das sichtbare Dateifeld `#open-json` und einen Download über Blob und Link. Ein Abbruch verändert das vorhandene Projekt nicht. Er kann im Browser nur die Bereitstellung einer Datei melden, nicht deren dauerhafte Speicherung bestätigen.

Projektdateien sind beim Import und beim Export auf 1 MiB UTF-8 begrenzt; auch die Einrückung des exportierten JSON zählt mit. Ein Import-Adapter muss die Grenze vor dem Lesen prüfen. Der Web-Adapter prüft dazu `File.size`; anschließend prüfen Adapter und Bedienlogik die UTF-8-Größe vor dem Parsen. Die Bedienlogik prüft auch geladene Speicherinhalte mit dem Projektdatei-Leser des Kerns. Eine unlesbare gespeicherte Datei bleibt erhalten; automatisches Speichern bleibt bis zum Import oder Zurücksetzen gesperrt und eine Meldung erklärt den Zustand.

Eingaben werden nach 350 ms gespeichert. Schreibvorgänge laufen der Reihe nach; Import, Zurücksetzen und Aufräumen verwerfen wartende ältere Schreibaufträge und warten vor dem Ersetzen auf den bereits laufenden Auftrag. Fehler bei einer Aktion erscheinen in deren eigener Statusregion. Berechnungen bleiben bei einem Speicherfehler möglich. Ein laufender Export verwendet den beim Start einmal festgehaltenen Eingabe- und Ergebnisstand sowie die Exportzeit. Dieselbe Aktionserzeugung übernimmt Speichern und Teilen, erzeugt genau eine Datei und ruft genau einen Adapterweg auf. Während eines Datei-Auftrags sind alle Ausgabewege, Import und Zurücksetzen gegeneinander gesperrt; nach Erfolg, Fehler oder Abbruch werden sie freigegeben. Ein Abbruch stellt die vorherige Aktionsmeldung wieder her. Schlägt nach einer Importübernahme das automatische Speichern fehl, bleibt das geöffnete Projekt sichtbar und die Meldung empfiehlt seinen Export zur Sicherung.

## Aktionsschnittstelle

`initFristenrechner(root, optionen)` liefert eine `RechnerInstanz` mit `aktionen` und `dispose()`. Die Typen `DateiAktion`, `DateiAktionsZustand`, `RechnerAktionen` und `RechnerInstanz` sind über `@baremos/fristenrechner-ui/ui` verfügbar. Aufrufer, die nur `dispose()` verwenden, bleiben kompatibel.

`aktionen.ausgeben(format, weg)` nimmt `projekt`, `excel` oder `pdf` und `exportieren` oder `teilen` entgegen. `projektImportieren()` und `neuesProjekt()` verwenden dieselben Abläufe wie die bisherigen Schaltflächen, einschließlich Bestätigung, Fortschrittsanzeige und Statusregionen. Die Methoden liefern `Promise<void>`. Ein nicht erlaubter Aufruf löst ohne Wirkung auf: während des Ladens, bei einem laufenden Dateiauftrag, nach `dispose()` sowie bei Ausgaben ohne Ergebnis oder ohne angefragte Teilen-Fähigkeit. Dadurch bleibt auch eine inzwischen überholte Bedienbarkeitsprüfung ohne zusätzliche Fehlermeldung; angenommene Aufträge melden Fehler weiterhin in ihrer Aktionsregion. Weitere optionale Parameter können später angehängt werden; ein vorbereitender Rückruf ist derzeit nicht vorgesehen.

`zustand()` liefert eine unveränderliche Momentaufnahme mit `geladen`, `beschaeftigt`, `hatErgebnis`, `kannTeilen` und `beendet`. `istErlaubt(aktion)` prüft die aktuelle Bedienbarkeit; jede Aktionsmethode prüft erneut. Die Fähigkeiten der Plattform werden für die Lebensdauer der Instanz bereitgestellt. `beobachten(fn)` liefert den Stand sofort, danach nur Änderungen; die Rückgabe meldet diesen Beobachter ab. Fehler eines Beobachters unterbrechen keine Dateiaktion. `dispose()` meldet einmal `beendet: true` und `beschaeftigt: false`, entfernt die Beobachter und nimmt keine weiteren an. Danach bleibt `zustand()` abrufbar, verspätete Dateiergebnisse verändern die Ansicht nicht. Der Gastgeber räumt seinen Plattformadapter gesondert auf.

Beim Web-Dateifeld ruft der Klickpfad den Importadapter unmittelbar vor dem ersten `await` auf. Gesperrte Klicks werden mit `preventDefault()` abgefangen. Ein direkter API-Import innerhalb einer Nutzergeste darf genau den ersten synchronen Dateifeld-Klick aus `waehlen()` passieren lassen, ohne erneut einen Import zu starten; die Ausnahme endet schon mit dem synchronen Adapteraufruf. Die Bedienlogik löst selbst keinen Dateifeld-Klick aus.

Der Web-Adapter prüft die transiente Nutzeraktivierung über `navigator.userActivation.isActive`. Ist die Schnittstelle beim Erzeugen des Adapters vorhanden, registriert er dabei nur den Capture-Listener am eigenen Dateifeld und keine Fenster-Listener. Ohne Aktivierung liefert er `{ status: 'abgebrochen' }`, ohne einen Dateifeld-Klick auszulösen. Ein laufender vertrauenswürdiger Klick auf das Dateifeld wird auch bei bereits verbrauchter Aktivierung übernommen; der Adapter löst dabei keinen zusätzlichen Klick aus. Der Schutz bleibt über Mikrotasks zwischen Ereignisbehandlern bestehen und endet mit dem Ereignis.

Fehlt `navigator.userActivation` beim Erzeugen des Adapters, registriert er zusätzlich sechs Capture-Listener am Fenster. In diesem Rückfall erkennt er nur laufende vertrauenswürdige Ereignisse, die seine Capture-Listener am Fenster oder Dateifeld bereits erfasst haben. Dazu zählen Klick, `keydown` außer Escape, `mousedown`, `pointerdown` für die Maus, `pointerup` für andere Zeiger und `touchend`. Ein API-Aufruf nach Ende des Ereignisses oder aus einem früher registrierten Fenster-Capture-Listener wird in diesem Fall als Abbruch behandelt. Gastgeber können den API-Import synchron von einer Schaltfläche oder einem nach der Adapterinitialisierung registrierten Fenster-Listener aus aufrufen. `dispose()` entfernt die Fenster-Listener nur, wenn der Adapter sie registriert hat.

`UserActivation` und `isActive` sind ab Chrome 72, Firefox 120 und Safari 16.4 vorhanden; die übrigen Einträge für Edge, WebView, Chrome für Android, Safari auf iOS und Firefox für Android sind als „mirror“ geführt und folgen ihrer Basis (Quelle: MDN browser-compat-data, `api/UserActivation.json`, gelesen am 2026-10-05).

## Texte, Inhalte und Darstellung

`GastgeberTexte` enthält `datenschutzTitel`, `datenschutzText`, `speicherNichtVerfuegbar`, `exportErfolg` und `importBeschriftung`. `webTexte` erhält die bisherigen Browsertexte. Optional ergänzen `ausgabeErfolg[weg][format]` und `ausgabeFehler[weg][format]` getrennte Texte für `exportieren`/`teilen` und `projekt`/`excel`/`pdf`; `erzeugungsFehler[format]` gilt vor der Übergabe an den Adapter. Beim Export bleibt `exportErfolg` der Rückfall, beim Teilen meldet die Vorgabe nur die Bereitstellung. Nur wenn `plattform.ausgabe.teilen` vorhanden ist, ergänzt die Bedienlogik drei Teilen-Aktionen. Eine App übergibt passende Texte zur Verarbeitung auf dem Gerät und darf erfolgreiches Speichern erst nach bestätigtem Schreiben und Schließen melden.

`bibliothekenHinweis` ersetzt optional den Satz zu den Exportbibliotheken. Ohne diesen Schlüssel bleibt der bisherige Satz erhalten. Die Einbindung in eine Website braucht eigene Hinweise des Gastgebers.

`ExportInhalt` enthält `herausgeber`, `titel`, `dateiPraefix` und optional `adresse: { text, href }`. Für `href` ist nur HTTPS zulässig. `webExportInhalt` enthält die bisherigen BAREMOS-Werte. Das Dateipräfix betrifft Excel und PDF; Projektdateien behalten ihren aus Projektname oder Vergabenummer abgeleiteten Namen. Regelversion, Rechtsstand und der Hinweis auf die unverbindliche Rechenhilfe sind keine austauschbaren Gastgebertexte.

Der optionale Slot `herausgeber` steht in der Fußzeile für ein vom Gastgeber bereitgestelltes Logo oder andere Herausgeberinhalte. `nach-hinweis` folgt auf den fachlichen Hinweis und kann Kontaktinhalte aufnehmen. Das Paket liefert kein Logo und keine festen Kontaktlinks. Die sichtbare Fußzeile nennt den Herausgeber und, sofern vorhanden, den Hostnamen der Exportadresse.

Die Rechnerstile sind auf `.fristenrechner` begrenzt. Die Komponente legt `box-sizing: border-box` für ihre Elemente selbst fest. Das aktivierte Menü verwendet eigene `fr-menue-`-Klassen und setzt zusätzlich die rücknehmbare Scrollsperre und den oberen Scrollabstand des Dokuments. Alle Farben der Komponente stehen als `--fr-*`- und `--phase-*`-Variablen in einer hellen Palette auf `.fristenrechner`; die Gastgebervariablen gehen dort mit ihren bisherigen Fallbacks ein und bleiben an denselben Stellen wirksam:

| CSS-Variable | Vorgabe | Wirkung |
|---|---|---|
| `--color-border` | `#d7d7d3` | Rahmen von Formular, Ergebnis und rechtlichem Hinweis (`--fr-rahmen-karte`) |
| `--color-accent` | `#a7303c` | Akzent, Fokusrahmen, Primärschaltfläche (`--fr-akzent`, `--fr-primaer`) |
| `--color-accent-deep` | `#862630` | Primärschaltfläche bei Hover (`--fr-primaer-hover`) |
| `--color-text` | `#343438` | Text in Feldern und Schaltflächen (`--fr-text`) |
| `--field-label-height` | `1.6rem`; das Bindefrist-Raster verwendet `2.9rem` | Beschriftungshöhe |

Die Phasenfarben der Zeitschiene heißen `--phase-einholung`, `--phase-teilnahmewettbewerb`, `--phase-verhandlung`, `--phase-bewertung`, `--phase-teststellung` und `--phase-zuschlag`; die Bedienlogik schreibt die Phase als `data-phase` an die Karte. Die dunkle Palette setzt dieselben Variablen mit eigenen Werten; Gastgebervariablen wirken dort nicht. Der Kontrasttest im Repository prüft beide Paletten.

Das Paket lädt keine Schriftdatei. Seine Druckregeln gelten nur für die Komponente. Seitenränder mit `@page` sowie Regeln für Website-Kopf, Website-Fuß, Breadcrumbs und äußere Layoutflächen gehören zum Gastgeber. Der Prüfplan zur Barrierefreiheit im Repository trennt automatische Prüfungen von ausstehenden Sicht- und Bedienprüfungen.

## Prüfungen

Tests, Referenzdaten und Prüfbefehle gehören zum Repository und sind nicht Teil dieses Pakets; siehe die Beitragsregeln im Repository.

## Exporte

Die drei Dateifunktionen liefern `{ name, mime, bytes }` ohne Download und ohne DOM:

| Funktion | Einstieg | Rückgabe |
|---|---|---|
| `projektAlsDatei(input, zeit)` | `@baremos/fristenrechner-ui/ui` | `AusgabeDatei` |
| `excelAlsDatei(input, result, zeit, inhalt)` | `@baremos/fristenrechner-ui/export-excel` | `AusgabeDatei` |
| `pdfAlsDatei(input, result, zeit, inhalt)` | `@baremos/fristenrechner-ui/export-pdf` | `Promise<AusgabeDatei>` |

`ExportZeit` enthält `zeitpunkt` in UTC und `kalendertag` im Format `JJJJ-MM-TT`. Der Web-Adapter leitet beide Werte aus einer einzigen `Date`-Instanz ab. Der XLSX-Schreiber liest weder aktuelle Uhrzeit noch Spracheinstellung und verwendet ausschließlich `zipSync` aus fflate. Die feste ZIP-Zeit und Reihenfolge machen die Ausgabe bei gleichen Eingaben wiederholbar. Die beiden Datumswerte im Excel-Kopf sind linksbündige echte Datumswerte mit dem Zahlenformat `dd.mm.yyyy`; die Datumsformate der Termintabelle bleiben unverändert.

Regelversion, Rechtsstand und Rechtsstanddatum kommen aus dem Kern-Ergebnis. Projektdateien erzeugt und liest der Kern. Die früheren Downloadfunktionen `exportScheduleExcel` und `exportSchedulePdf` entfallen; der Gastgeber übergibt die erzeugten Bytes an `plattform.ausgabe.exportieren`.

PDF und Excel enthalten den festen Pakethinweis „Unverbindliche Rechenhilfe. Ersetzt keine Rechtsberatung. Alle Angaben ohne Gewähr.“ Er ist kein Gastgebertext und kann vom Gastgeber weder ersetzt noch weggelassen werden.

Die Lizenzangaben der direkten Exportbibliotheken ersetzen keine Hinweise zu ihren mitgelieferten Abhängigkeiten. Ein Gastgeber muss die tatsächlich gebündelten Bibliotheken einschließlich optionaler Teile in seine Hinweise Dritter aufnehmen.

jsPDF lädt `html2canvas`, `dompurify` und `canvg` nur für `html()` und `addSvgAsImage()`. Die Exporte dieses Pakets verwenden diese Funktionen nicht. Ein Gastgeber kann die drei Module beim Bündeln durch ein leeres Modul ersetzen.

## English

Astro component, user interface logic and file exports of Fristenrechner Vergabe. Calculations are provided by `@baremos/fristenrechner-kern`. The user interface logic receives storage, import, file output, time and confirmation through a `Plattform`. The included web adapter uses the browser; native adapters belong to the host.

Available online: [Fristenrechner Vergabe on baremos.de](https://www.baremos.de/de/vergabe/fristenrechner/)

> Fristenrechner is a non-binding calculation aid. It does not replace legal advice. All information is provided without guarantee.

The package contains Astro and TypeScript sources and is distributed without its own build step. The host bundles them with Astro and its Vite; relative imports without file extensions and a CSS import with `?inline` require this. If the host checks types, TypeScript checks the included sources using the host's settings. `webTexte` and `webExportInhalt` contain the texts and export details of the BAREMOS IT GmbH website, including its privacy notice, publisher, address and file prefix. Other hosts supply their own values.

Use one component per page, pass `texte` and `exportInhalt` to it and explicitly initialize it with `initFristenrechner(root, optionen)` using the same values and a platform adapter. When removing the component, call the calculator's `dispose()` before the adapter's separate `dispose()`. The detailed interface documentation is in the German section.

Texts and results are in German.
