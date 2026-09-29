# @baremos/fristenrechner-ui

Astro-Komponente und Browser-Bedienlogik des Fristenrechners Vergabe. Die Berechnung kommt aus `@baremos/fristenrechner-kern`. Das Paket liefert Astro- und TypeScript-Quellen; der Gastgeber bündelt sie mit Astro.

Stand 2026-09-29: Übernahme Teil 1. Die Schnittstellen zu Speicher und Dateien sowie die Eingrenzung der globalen Styles folgen in Teil 2. Eine Komponente je Seite verwenden.

## Prüfungen

Aus der Repository-Wurzel mit den bereits installierten Werkzeugen:

```powershell
node node_modules/vitest/vitest.mjs run --root packages/oberflaeche
node scripts/astro.mjs check --root packages/oberflaeche
```

Die Typprüfung umfasst Astro, TypeScript und TypeScript-Tests. Der JavaScript-Testhelfer `test/struktur.mjs` verwendet Node-Bordmittel zum Prüfen der XLSX-Ausgabe; er wird nicht ausgeliefert. Es ist kein allgemeiner XML-Leser. Die Warnung über ein fehlendes `src/pages` ist bei diesem Komponentenpaket erwartbar; die Probeseite des Gastgebers prüft den Seiten-Build.

Die Referenz unter `test/referenz` enthält SHA-256, die Liste der Teile und alle XML-Teile einer festen Beispieltabelle. Die Daten in `test/beispiel.ts` sind erfunden. Eine fehlende Referenz lässt den normalen Test scheitern. Nur nach bewusster Prüfung einer Änderung erneuern:

```powershell
node node_modules/vitest/vitest.mjs run --root packages/oberflaeche test/export-excel.test.ts --update
```

## Exporte

`createScheduleExcel` erzeugt Bytes ohne Browser. Der Aufrufer übergibt UTC-Zeitpunkt (mit Sekunden) und örtlichen Kalendertag. Der Schreiber liest weder aktuelle Uhrzeit noch Spracheinstellung und verwendet ausschließlich `zipSync` aus fflate. Die feste ZIP-Zeit und Reihenfolge machen die Ausgabe bei gleichen Eingaben wiederholbar.

`createSchedulePdf` erzeugt ein jsPDF-Dokument ohne Download. `exportScheduleExcel` und `exportSchedulePdf` führen die bisherigen Browser-Downloads aus. Regelversion, Rechtsstand und Rechtsstanddatum kommen aus dem Kern-Ergebnis. Projektdateien erzeugt und liest der Kern.

Die Lizenzangaben der direkten Exportbibliotheken ersetzen keine Hinweise zu ihren mitgelieferten Abhängigkeiten. Ein Gastgeber muss die tatsächlich gebündelten Bibliotheken einschließlich optionaler Teile in seine Hinweise Dritter aufnehmen.
