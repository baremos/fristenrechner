# Übernahmeprüfung

Stand 2026-10-04 · geprüfter App-Endstand `5e6f230`, Nachweisstand `49dd420` · historische Übernahmenachweise zu den Arbeitspaketen 2.2 bis 2.5 · Nachtrag zur Oberfläche

Die Nachweise und Protokollzeilen vom 2026-09-28 bis 2026-09-30 beschreiben jeweils den damaligen Stand. Der Nachweis zur Oberfläche ist am 2026-10-04 aus den damaligen Belegen nachgetragen und um eine datierte Nachprüfung ergänzt. Ihre Bestandszahlen und damals offenen Prüfungen sind keine Statusangaben zum App-Endstand. Die späteren Laufnachweise mit Werkzeugversionen stehen in [app.md](app.md), [fdroid-build.md](fdroid-build.md) und [signierung.md](signierung.md); offene Restpunkte bündelt der [Bericht zur Abnahme](stufe2-nachweis.md).

## Zweck

Dieses Repository wird veröffentlicht. Jede Datei, die aus einer anderen Quelle stammt, wird geprüft, bevor sie zum ersten Mal eingecheckt wird. Die `.gitignore` ersetzt diese Prüfung nicht: Sie hält Dateien fern, prüft aber keinen Inhalt.

Die Prüfung gilt für Dateien aus anderen Repositorys, für Vorlagen von Werkzeugen, für Bilder und Schriften und für Dateien, die ein Werkzeug erzeugt hat.

## Grundsätze

1. **Frischer Stand, keine Historie.** Dateien werden kopiert. Die Versionsgeschichte der Quelle kommt nicht mit.
2. **Nur was gebraucht wird.** Übernommen wird, was die Software zum Bauen, Testen und Laufen braucht.
3. **Erst prüfen, dann einchecken.** Das Ergebnis steht im Protokoll unten, bevor der Commit entsteht.
4. **Zwei Prüfer.** Wer übernimmt, prüft. Das Kreuz-Review prüft die Übernahme ein zweites Mal.

## Prüfpunkte

| Nr. | Prüfpunkt | Frage |
|---|---|---|
| 1 | Auswahl | Wird die Datei gebraucht? Gehört sie zum festgelegten Zuschnitt? |
| 2 | Rechte | Wer hält die Rechte am Inhalt? Darf er unter Apache-2.0 veröffentlicht werden? |
| 3 | Lizenzhinweise Dritter | Enthält die Datei Code oder Inhalte Dritter? Bleiben deren Lizenzhinweise erhalten? |
| 4 | Interne Verweise | Enthalten Kommentare, Namen von Dateien oder Tests Verweise, die nur intern verständlich sind: Nummern aus internen Aufgabenlisten, Namen von Personen, interne Adressen? |
| 5 | Geheimnisse | Enthält die Datei Schlüssel, Kennwörter, Token oder Zugangsdaten, auch in Kommentaren und Testdaten? |
| 6 | Testdaten | Stammen Testdaten aus echten Vorgängen? Enthalten sie Namen, Aktenzeichen oder andere Angaben zu Personen oder Auftraggebern? |
| 7 | Adressen im Netz | Verweist die Datei auf Adressen im Netz, die die Software zur Laufzeit aufrufen würde? |
| 8 | Texte | Beschreiben sichtbare Texte, was die Software rechnet? Versprechen sie weder Rechtssicherheit noch Beratung? |
| 9 | Fachliche Werte | Hat jeder fachliche Wert eine Quelle? Ist er durch einen Test belegt? |
| 10 | Erzeugte Dateien | Hat ein Werkzeug die Datei erzeugt? Dann gehört die Quelle ins Repository, die erzeugte Datei nur, wenn der Build sie braucht. |

## Ablauf

1. Liste der Dateien aufstellen, mit Quelle und Stand der Quelle.
2. Jede Datei gegen die Prüfpunkte prüfen. Fundstellen bereinigen oder die Datei weglassen.
3. Build und Tests ausführen, aus einer Kopie des Stands ohne private Dateien.
4. Neue Abhängigkeiten samt Transitivabhängigkeiten auf freie, verträgliche Lizenzen prüfen.
5. Protokoll ergänzen.
6. Kreuz-Review, danach einchecken.

## Zusätzliche Abschlussprüfung für den Rechenkern

Arbeitspaket 2.3 übernimmt den Rechenkern. Die allgemeinen Prüfpunkte reichen dafür nicht. Die Abnahme aus [arbeitspakete.md](arbeitspakete.md), Paket 2.3, wird Punkt für Punkt nachgewiesen:

| Nr. | Nachweis |
|---|---|
| K1 | Die Tabelle der Schwellenwerte ist entfernt. |
| K2 | Ihr Typ und ihr Export in der Schnittstelle sind entfernt. |
| K3 | Der Import und der Testblock zu den Schwellenwerten in den Tests sind entfernt. |
| K4 | Die Angabe zum Rechtsstand nennt keine Schwellenwert-Periode. |
| K5 | Kein Betrag der EU-Schwellenwerte steht in den übernommenen Dateien. |
| K6 | Der Rechtsstand liegt als Datum im ISO-Format vor, dazu ein Anzeigetext. |
| K7 | Die Referenzfälle rechnen wie der Rechenkern 1.9.0. |
| K8 | Typprüfung, Fachtests und Build des Pakets laufen aus einer Kopie ohne private Dateien. |
| K9 | Neue Abhängigkeiten für Test und Build sind samt Transitivabhängigkeiten auf ihre Lizenz geprüft. |

## Nachweis zum Rechenkern

Stand 2026-09-28 · Arbeitspaket 2.3

### Übernommene Dateien

Quelle ist der Rechenkern 1.9.0 des Fristenrechners auf www.baremos.de, Stand der Quelle 2026-08-26. Übernommen sind acht Dateien nach `packages/kern/src`: `api.ts`, `fristen.ts`, `kalender.ts`, `projekt.ts`, `schedule.ts` und die drei Testdateien dazu. Nicht übernommen ist die Datei mit der Tabelle der Schwellenwerte.

### Abweichungen vom Rechenkern 1.9.0

| Nr. | Abweichung | Wirkung auf Berechnungen |
|---|---|---|
| A1 | Die Schwellenwerte sind entfernt: Tabelle, Typ, Export und die zwei Tests dazu. | keine, die Berechnung hat die Tabelle nie verwendet |
| A2 | Der Anzeigetext zum Rechtsstand lautet „Juli 2026". Der Zusatz „; EU-Schwellenwerte 2026/2027" und die Nennung eines einzelnen Änderungsgesetzes entfallen. Den Tag nennt `RECHTSSTAND_DATUM`. | nur dieser Text |
| A3 | Neu ist `RECHTSSTAND_DATUM`. Jedes Ergebnis trägt zusätzlich `regelversion` und `rechtsstandDatum`, jede neue Projektdatei zusätzlich `rechtsstandDatum`. Projektdateien ohne dieses Feld bleiben lesbar. Ist das Feld vorhanden, muss es ein gültiges Datum enthalten. | keine, die Felder kommen hinzu |
| A4 | Neu ist der Name `REGELVERSION`. `RECHENKERN_VERSION` bleibt mit demselben Wert erhalten. | keine |
| A5 | Importe nennen die Dateiendung `.js`, wie es die Modulauflösung `NodeNext` verlangt. | keine |
| A6 | Kommentare und Titel von Tests sind von internen Verweisen bereinigt: 95 Kommentarblöcke neu gefasst, 17 weitere Kommentare und 30 Titel angepasst, ein Wert in den Testdaten ersetzt. | keine |
| A7 | Fünf sichtbare Texte sind neu gefasst, siehe die folgende Tabelle. | keine, die Termine bleiben gleich |

Der Vergleich beider Stände ohne Kommentare zeigt genau diese Abweichungen und keine weitere. Verglichen wurde die Ausgabe des Syntaxbaums, mit Typen.

Die Texte zu A2 und A7 hat der fachlich Verantwortliche am 2026-09-28 entschieden.

| Text | Rechenkern 1.9.0 | Paket |
|---|---|---|
| Rechenweg der Wartefrist, wenn ihr Ende auf Samstag, Sonntag oder Feiertag fällt | nennt zwei Entscheidungen zur Auslegung | „… vorsorglich auf den nächsten Arbeitstag … verlängert (entsprechend Art. 3 Abs. 4 VO (EWG) 1182/71)" |
| Hinweis zur Beschränkten Ausschreibung ohne Teilnahmewettbewerb, VOB/A 1. Abschnitt | nennt die Wertgrenze als Betrag | „zulässig bis zur Wertgrenze des § 3a VOB/A oder in den Fällen des § 3a Abs. 2 Nr. 2–3 VOB/A" |
| Hinweis zur Freihändigen Vergabe, VOB/A 1. Abschnitt | nennt die Wertgrenze als Betrag | „zulässig bis zur Wertgrenze des § 3a VOB/A oder in den Fällen des § 3a Abs. 3 VOB/A" |
| Warnung bei einer Wartefrist unter der gesetzlichen Frist | nennt zusätzlich eine Rechtsfolge | endet nach der Angabe der Norm |
| Meldung beim Import einer Projektdatei mit unbekannter Schema-Version | nennt den „Terminplaner" | nennt den „Fristenrechner" |

### Ergebnis je Nachweis

| Nr. | Ergebnis | Beleg |
|---|---|---|
| K1 | erfüllt | Die Datei mit der Tabelle ist nicht übernommen. |
| K2 | erfüllt | `api.ts` enthält weder den Typ noch den Export, siehe A1. |
| K3 | erfüllt | `schedule.test.ts` enthält weder den Import noch den Testblock. Von 121 Tests der Quelle sind 119 übernommen. |
| K4 | erfüllt | siehe A2. Der Test in `rechtsstand.test.ts` prüft es bei jedem Lauf. |
| K5 | erfüllt | Die Suche nach Beträgen findet in den Dateien des Pakets keinen Betrag in Euro. Auch die Wertgrenzen des § 3a VOB/A stehen dort nicht mehr als Betrag, siehe A7. |
| K6 | erfüllt | `RECHTSSTAND_DATUM` im ISO-Format und `RECHTSSTAND` als Anzeigetext. Ein Test prüft, dass der Anzeigetext mit Monat und Jahr des Datums beginnt. |
| K7 | erfüllt | siehe Abschnitt „Referenzfälle" |
| K8 | erfüllt | `npm ci`, `npm run check`, `npm test` und `npm run build` laufen in einer Kopie, die nur die eingecheckten Dateien enthält: 81 Tests der Skripte und 134 Tests des Rechenkerns. |
| K9 | erfüllt | siehe Abschnitt „Abhängigkeiten für Test und Build" |

### Referenzfälle

Die Referenzprüfung liegt unter `packages/kern/test/referenz`. Sie rechnet ein festes Raster und vergleicht das Ergebnis mit vier Dateien, die die Regelversion im Namen tragen.

| Datei | Inhalt |
|---|---|
| `referenz-1.9.0.txt` | 1.265 Fälle: jede der 7 Vergabeordnungen mit jeder der 5 Verfahrensarten, 12 Eingabeprofile, je 3 von 8 Startterminen, alle 16 Länder. Je Fall die Termine im Klartext, dazu je ein Fingerabdruck der Struktur und der Texte. |
| `texte-1.9.0.txt` | alle Texte, die der Rechenkern im Raster ausgibt. Meldungen beim Import einer Projektdatei gehören nicht dazu. |
| `vorgaben-1.9.0.txt` | Vorschlagswerte der Fristen für 210 Kombinationen |
| `feiertage-1.9.0.txt` | Feiertage der 16 Länder für die Jahre 2026 bis 2030 |

Kombinationen, die eine Vergabeordnung nicht kennt, gehören zum Raster. Der Rechenkern meldet sie und liefert ein leeres Ergebnis, das trifft auf 289 der 1.265 Fälle zu.

So ist der Nachweis entstanden:

1. Der unveränderte Rechenkern 1.9.0 hat das Raster gerechnet. Seine 121 Tests waren dabei grün.
2. Auf seine Ausgabe wurden die Abweichungen A2, A3 und A7 angewendet, sonst nichts. Für A2 und A7 sind das sieben wörtliche Ersetzungen in den Texten.
3. Daraus sind die vier Dateien entstanden. Ein zweiter Lauf hat dieselben Dateien erzeugt.
4. Der Rechenkern im Paket rechnet dasselbe Raster und stimmt mit den vier Dateien überein.

Gegenprobe in einer Kopie des Pakets: Ein geänderter Fristwert, ein geänderter Text, ein geänderter Feiertag und eine fehlende Referenzdatei lassen die Prüfung jeweils scheitern. Eine fehlende Datei wird nicht stillschweigend neu angelegt.

Grenzen des Nachweises: Das Raster ist eine Auswahl. Es belegt die Übereinstimmung für diese Fälle, nicht für jede denkbare Eingabe. Der Vergleich der Quelltexte ohne Kommentare ergänzt es.

### Abhängigkeiten für Test und Build

Zum Stand der Übernahme am 2026-09-28 hat das Paket selbst keine Abhängigkeiten. Für Typprüfung und Build kommt `typescript` 6.0.3 hinzu, für die Tests `vitest` 4.1.11. Das damalige Lockfile nennt damit 70 Pakete, einschließlich der Pakete für andere Betriebssysteme.

| Lizenz | Pakete |
|---|---|
| MIT | 52 |
| MPL-2.0 | 12 |
| Apache-2.0 | 3 |
| ISC | 2 |
| BSD-3-Clause | 1 |

Geprüft wurde das Feld zur Lizenz im damaligen Lockfile, bei den installierten Paketen zusätzlich gegen deren Manifest. Der tatsächliche Inhalt der Pakete ist damit nicht geprüft. Der spätere Stand von Arbeitspaket 2.7 einschließlich der noch offenen Inhalts- und Lizenzprüfungen steht in [lizenzen.md](lizenzen.md).

Zwei damalige Punkte für die folgenden Arbeitspakete:

- `vitest` bringt über `vite` vorgebaute Programme mit, etwa `rolldown` und `lightningcss`. Der Build des Pakets braucht sie nicht, er läuft allein mit `tsc`. Was das für den Build bei F-Droid bedeutet, klärt Arbeitspaket 2.8.
- Die 12 Pakete unter MPL-2.0 gehören zu `lightningcss`. Sie dienen dem Test und werden nicht mit der App ausgeliefert.

Die Behandlung vorgebauter Programme beim lokalen F-Droid-Build am Endstand ist inzwischen in [fdroid-build.md](fdroid-build.md) nachgewiesen. Die historische Paketanzahl oben wird damit nicht als neuer Bestand bestätigt.

## Übernahme der Android-Vorlage

Stand 2026-09-30 · Arbeitspaket 2.5 · Capacitor 8.5.2

### Quelle und Lizenzbelege

Geprüft wurde das lokal installierte npm-Paket `@capacitor/cli` **8.5.2**, darin `assets/android-template.tar.gz`. Das Archiv hat **217.371 Bytes** und die SHA-256 **`5edb50a67a034556da8bb5fa54eb08211eaa952aac0949c75050ebcf0be97303`**. Es enthält 52 Dateien. Grundlage des Vergleichs ist der frisch entpackte Archivinhalt ohne Versionsgeschichte.

`node_modules/@capacitor/cli/package.json` nennt die Lizenz `MIT` und das Ionic Team als Autor. Die Datei `node_modules/@capacitor/cli/LICENSE` enthält den unten erhaltenen MIT-Lizenztext mit dem Urheberhinweis auf Drifty Co.; ihre SHA-256 ist `9c6ebf3e5ab832ba4d5af38f340978e1fedbfee6e3d23662dfdb8917a9d864dd`. Im Vorlagenarchiv liegt kein eigener Lizenztext. Dieser Abschnitt erhält deshalb den vollständigen Text für die übernommenen Vorlagenanteile. Deren MIT-Lizenz bleibt bestehen; eigene Ergänzungen stehen unter der Apache-2.0-Lizenz des Repositorys.

Der mitgelieferte Gradle-Wrapper enthält gesonderte Apache-2.0-Hinweise: in den unverändert übernommenen Köpfen von `gradlew` und `gradlew.bat` sowie als `META-INF/LICENSE` in `gradle-wrapper.jar`. Die Jar-Datei enthält keinen `NOTICE`-Eintrag. Ihr Inhalt und beide Startskripte sind bytegleich mit der Vorlage. Die SHA-256 der Jar-Datei ist `7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172` und stimmt mit `scripts/toolchain.json` überein.

MIT-Lizenztext aus dem Paket, unveränderter Wortlaut:

```text
MIT License

Copyright (c) 2017-present Drifty Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Prüfung nach den zehn Prüfpunkten

| Nr. | Ergebnis am 2026-09-30 |
|---|---|
| 1 | Übernommen werden Android-Buildgerüst, Wrapper und die benötigten Ressourcen. Beispieltests, Beispielklasse, Rastergrafiken, Startbilder, unbenutztes Layout und die breite Dateifreigabe der Vorlage entfallen. Die folgende Tabelle führt jede Vorlagendatei einzeln auf. |
| 2 | Paketmanifest und Paketlizenz sind gelesen. MIT-Text sowie die vorhandenen Apache-2.0-Hinweise des Wrappers bleiben erhalten. Die eigenen Java-Klassen und Vektorsymbole ergänzen die Vorlage. Die Lizenzen der erst durch Gradle aufgelösten Abhängigkeiten sind mit dieser Prüfung nicht abgedeckt. |
| 3 | Die Wrapperdateien einschließlich ihrer Lizenzhinweise bleiben unverändert. Der vollständige MIT-Text steht oben. Die Symbole der Vorlage sind vollständig durch eigene Vektorsymbole ersetzt. |
| 4 | Die neu geschriebenen Kommentare in Java und den Symbolressourcen sind deutsch und enthalten keine internen Dokumentverweise. Die ursprüngliche Beispiel-Paketkennung und deren Testdateien sind nicht übernommen. Unveränderte Werkzeugkommentare und die automatisch erzeugten Hinweise von Capacitor bleiben erhalten. |
| 5 | Die gelesenen Textdateien enthalten keine gefundenen Schlüssel, Kennwörter, Token oder Zugangsdaten. Ein Signierungsblock ist nicht eingerichtet; lokale Einstellungen und erzeugte Build-Dateien bleiben ausgeschlossen. Das ist eine Sichtprüfung der übernommenen Quellen, keine Aussage über beliebige spätere Build-Ausgaben. |
| 6 | Die Beispieltests der Vorlage entfallen. Es wurden keine Testdaten aus Vergabeverfahren in das Android-Projekt aufgenommen. |
| 7 | Das Quellmanifest enthält keine INTERNET-Berechtigung und keine Freigabe von Klartextverkehr. Das eigene Plugin begrenzt Navigationen auf die lokale App. Wrapperadresse und Maven-Repositories dienen dem Build; die Adressen der XML-Namensräume und der erhaltenen Kommentare werden zur Laufzeit nicht aufgerufen. Das erzeugte `res/xml/config.xml` enthält `<access origin="*" />`; die statische APK-Prüfung vom 2026-09-30 bestätigt das Fehlen der INTERNET-Berechtigung, die Wirkung im Betrieb ist noch im Emulator zu prüfen. |
| 8 | `strings.xml` enthält den App-Namen, die kurze Beschriftung „Fristenrechner“, die Paketkennung und eine deutsche Meldung bei fehlender Android System WebView. Die Meldung beschreibt die fehlende Systemkomponente; ihre Anzeige ist noch zu prüfen. Der Rauchtest vom 2026-09-30 belegt die Anzeige der Rechnerseite und des eigenen Symbols auf API 30 und 36. Auf API 36 zeigt die Infoseite „Fristenrechner Vergabe“; auf API 30 kürzt der Launcher die Beschriftung im Raster mit fünf Spalten auf „Fristenr…“. |
| 9 | Die Android-Dateien ergänzen keine fachlichen Fristenwerte, Schwellenwerte oder Berechnungsregeln. SDK-, Werkzeug- und App-Versionen sind technische Angaben. |
| 10 | `capacitor.settings.gradle` und `app/capacitor.build.gradle` sind mit Capacitor 8.5.2 erzeugt und für das Android-Projekt vorgesehen. Kopierte Web-Assets, Capacitor-JSON-Dateien, `res/xml/config.xml` und das Cordova-Modul bleiben erzeugte, ausgeschlossene Dateien. Der leere Build-Platzhalter der Vorlage wird nicht übernommen. Die eigenen Vektorsymbole liegen als direkt von Android gelesene XML-Quellen vor. |

### Vergleich aller Dateien

Die Pfade beziehen sich auf `app/android/`. „Entfernt“ bedeutet, dass die Datei aus dem Vorlagenarchiv nicht übernommen wird. „Neu“ bezeichnet einen Pfad, den das Archiv nicht enthält. „Unverändert“ beruht auf einem Bytevergleich. Von den **52 Vorlagendateien** sind **6 unverändert**, **12 geändert** und **34 entfernt**. Hinzu kommen **7 neue Dateien**, insgesamt also **25 Dateien** für die Übernahme. Die ersten 52 Tabellenzeilen gehören zur Vorlage, die letzten sieben sind neu.

| Datei | unverändert / geändert / entfernt / neu | Grund |
|---|---|---|
| `.gitignore` | geändert | Ausschlüsse für Build-Ausgaben, lokale Einstellungen und durch Capacitor erzeugte Dateien. |
| `app/.gitignore` | geändert | Erzeugte Build-Dateien vollständig ausschließen; der Platzhalter der Vorlage wird nicht benötigt. |
| `app/build.gradle` | geändert | App-ID, Version, SDK und deutsche Ressourcen festlegen; lokale Jar-Suche, Testabhängigkeiten, direkte Startbildbibliothek und Google-Services-Block entfernen. |
| `app/build/.npmkeep` | entfernt | Platzhalter eines erzeugten Build-Ordners; für den Build nicht erforderlich. |
| `app/proguard-rules.pro` | unverändert | Vorlage für ProGuard-Regeln; keine zusätzliche Regel aktiviert. |
| `app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | entfernt | Beispieltest und Beispiel-Paket gehören nicht zur App. |
| `app/src/main/AndroidManifest.xml` | geändert | App-Komponenten und Metadaten festlegen; Netzwerkberechtigung und FileProvider entfernen, Sicherung ausschließen. |
| `app/src/main/java/com/getcapacitor/myapp/MainActivity.java` | entfernt | Beispielklasse durch die Activity im eigenen Paket ersetzen. |
| `app/src/main/res/drawable-land-hdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-land-mdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-land-xhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-land-xxhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-land-xxxhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-port-hdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-port-mdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-port-xhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-port-xxhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-port-xxxhdpi/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | entfernt | Vordergrund der Vorlage durch eigenes Vektorsymbol im Ordner drawable ersetzen. |
| `app/src/main/res/drawable/ic_launcher_background.xml` | entfernt | Hintergrundgrafik der Vorlage durch die eigene Farbressource ersetzen. |
| `app/src/main/res/drawable/splash.png` | entfernt | Startbild der Vorlage wird nicht verwendet. |
| `app/src/main/res/layout/activity_main.xml` | entfernt | Nicht verwendet; die Activity übernimmt das Layout von Capacitor. |
| `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | geändert | Eigenes adaptives Symbol; Vordergrund verweist auf @drawable/ic_launcher_foreground, ergänzt um die einfarbige Ebene. |
| `app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | geändert | Eigenes rundes adaptives Symbol mit denselben vorhandenen Zeichen- und Farbressourcen. |
| `app/src/main/res/mipmap-hdpi/ic_launcher.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-mdpi/ic_launcher.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xhdpi/ic_launcher.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | entfernt | Rastergrafik der Vorlage durch das eigene adaptive Vektorsymbol ersetzen. |
| `app/src/main/res/values/ic_launcher_background.xml` | geändert | Hintergrundfarbe des eigenen Symbols. |
| `app/src/main/res/values/strings.xml` | geändert | Deutscher App-Name, kurze Beschriftung, eigenes Paket und Meldung bei fehlender WebView. |
| `app/src/main/res/values/styles.xml` | geändert | AppCompat-Theme mit weißen Systemleisten, ohne Theme.SplashScreen oder eigenes Startbild. |
| `app/src/main/res/xml/file_paths.xml` | entfernt | Breite Freigabe externer Dateien entfällt zusammen mit dem FileProvider. |
| `app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | entfernt | Beispieltest ohne Bezug zur App entfernen. |
| `build.gradle` | geändert | Google-Services-Klassenpfad entfernen; clean verwendet rootProject.layout.buildDirectory. Übrige Bytes einschließlich Leerraum bleiben erhalten. |
| `gradle.properties` | unverändert | Vorhandene Einstellungen für JVM und AndroidX. |
| `gradle/wrapper/gradle-wrapper.jar` | unverändert | Unveränderter Gradle-Wrapper; Prüfsumme mit der Werkzeugfestlegung verglichen. |
| `gradle/wrapper/gradle-wrapper.properties` | geändert | Gradle 8.14.5 als bin-Verteilung mit festgelegter SHA-256. |
| `gradlew` | unverändert | Unverändertes Gradle-Startskript für POSIX mit Lizenzkopf. Der Dateimodus 755 der Vorlage ist im Git-Index als 100755 übernommen. Unter Windows übernimmt Git das Ausführungsrecht nicht automatisch; dafür ist `git update-index --chmod=+x -- app/android/gradlew` nötig. K4 prüft diesen Indexeintrag. |
| `gradlew.bat` | unverändert | Unverändertes Gradle-Startskript für Windows mit Lizenzkopf. |
| `settings.gradle` | unverändert | Bindet App, Cordova-Modul und die von Capacitor erzeugten Projekteinstellungen ein. |
| `variables.gradle` | geändert | Mindest-API 30 und feste AndroidX-/Cordova-Versionen; unbenötigte Test- und Startbildvariablen entfallen. |
| `app/capacitor.build.gradle` | neu | Von Capacitor 8.5.2 durch sync erzeugte Build-Einstellungen; wird eingecheckt. |
| `app/src/main/java/de/baremos/fristenrechner/MainActivity.java` | neu | Eigene Activity registriert die Navigationssperre vor der Initialisierung der Brücke. |
| `app/src/main/java/de/baremos/fristenrechner/NavigationssperrePlugin.java` | neu | Navigation auf Schema und Host der lokalen App ohne abweichenden Port begrenzen. |
| `app/src/main/res/drawable/ic_launcher_foreground.xml` | neu | Eigenes Vektorsymbol als Vordergrund, ohne Rastergrafik der Vorlage. |
| `app/src/main/res/drawable/ic_launcher_monochrome.xml` | neu | Einfarbige Ebene des eigenen adaptiven Symbols. |
| `app/src/main/res/xml/data_extraction_rules.xml` | neu | Cloud-Sicherung und Gerätewechsel schließen jeweils alle neun festgelegten Speicherbereiche aus. |
| `capacitor.settings.gradle` | neu | Von Capacitor 8.5.2 durch sync erzeugter relativer Pfad zum Android-Modul im Wurzel-node_modules; wird eingecheckt. |

### Ausschlüsse und erzeugte Dateien

Die Änderungen an den beiden übernommenen `.gitignore`-Dateien sind vollständig:

- `app/android/.gitignore`: Die erste Kommentarzeile mit der Adresse der GitHub-Vorlage ist durch `# Erzeugte Dateien und lokale Einstellungen der Android-Werkzeuge.` ersetzt. Die beiden Kommentarzeilen `# Google Services (e.g. APIs or Firebase)` und `# google-services.json` sowie die folgende Leerzeile entfallen. Keine Ausschlussregel dieser Datei ist geändert.
- `app/android/app/.gitignore`: `/build/*` ist durch `/build/` ersetzt; `!/build/.npmkeep` entfällt. Damit gibt es keine Ausnahme für einen Platzhalter im erzeugten Build-Ordner.

Die `.gitignore` der Repositorywurzel ist unverändert. Unter Android bleiben insbesondere `.gradle`, `build`, `local.properties`, `capacitor-cordova-android-plugins`, `app/src/main/assets/public`, `app/src/main/assets/capacitor.config.json`, `app/src/main/assets/capacitor.plugins.json` und `app/src/main/res/xml/config.xml` ausgeschlossen.

Der Sync mit Capacitor 8.5.2 erzeugt in `capacitor.settings.gradle` den Pfad `../../node_modules/@capacitor/android/capacitor`. Vom Android-Projekt aus aufgelöst zeigt er auf das vorhandene `node_modules` der Repositorywurzel. `app/capacitor.build.gradle` setzt Java 21 und enthält keine zusätzlichen Plugin-Abhängigkeiten. `capacitor.plugins.json` enthält `[]`.

Die App definiert kein `Theme.SplashScreen` und kein eigenes Startbild. Entfernt ist die **direkte** Abhängigkeit auf `core-splashscreen`; `androidx.core:core-splashscreen` 1.0.1 ist jedoch transitiv über das Cordova-Framework 14.0.1 in der APK enthalten. Belegt sind die Module und der APK-Abgleich in [lizenzen.md, Android- und Gradle-Abhängigkeiten](lizenzen.md#android--und-gradle-abhängigkeiten).

### Grenzen und noch ausstehende Prüfung

Diese Übernahmeprüfung betrifft den Quellstand und die lokal erzeugten Sync-Dateien vom 2026-09-30. Claude Code hat die Übernahme kreuzweise geprüft, die Vorlage dafür unabhängig entpackt und verglichen sowie die Symbole mit dem freigegebenen Entwurf abgeglichen. Debug- und Release-Build über den Gradle-Wrapper sind am 2026-09-30 unter Windows erfolgt; die entstandenen APKs wurden mit `aapt2` aus den Build-Tools 35.0.0 statisch untersucht. Ergebnisse, Werkzeugversionen und Grenzen stehen in [app.md](app.md#build-vom-2026-09-30).

Ein Rauchtest vom 2026-09-30 belegt Installation, Start, Anzeige der Rechnerseite und das eigene Symbol auf API 30 und 36. Er ersetzte die damals ausstehenden Emulatorprüfungen nicht: Netzwerkzugriffe, Navigation, Sicherung, Gerätewechsel, Berechnung, Fehlerseite und Startbildverhalten wurden dabei nicht geprüft. Die Lizenzprüfung der von Gradle aufgelösten Abhängigkeiten steht weiterhin aus. Der Neubau nach `clean` und der Vergleich zweier Arbeitskopien in verschiedenen Ordnern ergaben bytegleiche Debug- und Release-APKs auf einem Windows-Rechner am selben Tag. Zwei frische Klone von `c7a0cd8` unter Debian 13.5 ergaben am 2026-09-30 mit strenger Werkzeugprüfung bytegleiche Release-APKs, auch im Vergleich mit Windows. Web-Build und Sync bestanden dort zusätzlich ohne Netz; Gradle lief mit Netz. Ein Debug-Build unter Linux, die Gegenprobe mit geändertem `versionName` und ein zweiter Rechner waren in diesem historischen Lauf nicht geprüft. Siehe [Linux-Nachweis](app.md#linux-nachweis-vom-2026-09-30).

Die späteren Emulator- und Geräteprüfungen sowie der Buildvergleich vom 2026-10-03/04 sind gesondert in [app.md](app.md) dokumentiert. Am Endstand sind die unsignierten Release-APKs zwischen Windows, Linux und lokalem F-Droid-Lauf bytegleich; Debug-APKs sind zwischen Arbeitskopien nicht bytegleich und gehören nicht zum Reproduzierbarkeitsnachweis. Die Updateprobe mit der Testfassung und eigener App-ID steht in [signierung.md](signierung.md). Diese Ergebnisse ändern die Grenzen des damaligen Übernahmenachweises nicht.

## Übernahme der Oberfläche

Stand der Übernahme 2026-09-29 (Teil 1, `c7397eb`), Anpassung 2026-09-30 (Teil 2, `8ec15e8`) · Arbeitspaket 2.4 · nachgetragen am 2026-10-04

### Quelle, Auswahl und Rechte

Quelle ist die Oberfläche des Fristenrechners auf www.baremos.de, Stand der Quelle 2026-08-26. Gelesen wurden die sechs Dateien der Website-Komponente: Komponente, Bedienlogik, Exportdaten, Exportaktion, PDF-Export und Excel-Export. Die ersten fünf sind als frischer Stand ohne Versionsgeschichte nach `packages/oberflaeche/src` übernommen. Den Excel-Export der Website ersetzt ein eigener Schreiber. Die Seite der Website, die die Komponente einbindet, ist nur gelesen. Spätere Änderungen der Website sind nicht übernommen.

Schreiber und neuer Excel-Export entstanden aus einer nicht eingecheckten Machbarkeitsprobe vom 2026-09-29. Übernommen sind Aufbau und Reihenfolge der Dateiteile, Maskierung, Kalenderkodierung und feste ZIP-Angaben, in TypeScript neu gefasst. Vergleichsprogramme und Probeschalter sind nicht übernommen.

Die übernommenen Dateien stammen aus der Website des Herausgebers. Der Herausgeber hat am 2026-09-27 entschieden, Rechenkern und Oberfläche unter Apache-2.0 zu veröffentlichen. Das Logo der Website ist nicht übernommen; an ihm bestehen Rechte, die nicht unter diese Lizenz fallen. Eine unabhängige Prüfung der Rechtekette gehört nicht zu diesem Nachweis.

### Abweichungen vom Stand der Website

Die Abweichungen O1 bis O9 beschreiben Teil 1 am Übernahmecommit `c7397eb`. Teil 2 ist gesondert darunter beschrieben.

| Nr. | Abweichung | Grund und Wirkung |
|---|---|---|
| O1 | Die Importe zeigen auf `@baremos/fristenrechner-kern`. | Paketgrenze. Die Abweichungen A1 bis A7 des Rechenkerns gelten mit; die Oberfläche rechnet nicht selbst. |
| O2 | Das Logo der Website und der Absatz mit Verweisen auf Seiten der Website entfallen. | Rechte am Logo, keine festen Verweise auf Seiten eines Gastgebers. Seit Teil 2 gibt es dafür Plätze für Inhalte des Gastgebers. |
| O3 | Berechnung, PDF und Excel zeigen Regelversion, Rechtsstand und das Datum des Rechtsstands aus dem Ergebnis des Rechenkerns. | Pflichtangabe. Der PDF-Kopf hat eine Zeile mehr, Tabelle und Bindefrist beginnen 7 mm tiefer. Der Excel-Kopf nennt zusätzlich die Regelversion. |
| O4 | Die Excel-Datei schreibt ein eigener Schreiber, gepackt mit fflate, statt ExcelJS. | Festgelegter Ersatz. Gleiche Eingabe ergibt gleiche Bytes. Tabelleninhalt, Stile, Filter, Verweise und Seiteneinrichtung bleiben im festgelegten Umfang, der Dateiaufbau ist schlanker. |
| O5 | Zeitpunkt und Kalendertag des Excel-Exports übergibt der Aufrufer. | Der Kalendertag folgt der Ortszeit, nicht UTC. |
| O6 | Der Excel-Kopf entfernt Leerraum am Rand von Kunde, Projektname und Vergabenummer. | Wie bisher im Kopf des PDF. Wirkt bei direktem Aufruf der Exportfunktionen mit ungekürzten Werten; in der Komponente kürzt schon die Formularauswertung, auch nach dem Laden einer Projektdatei. |
| O7 | Die Fußzeilen von Excel, PDF und Druck nennen „BAREMOS IT GmbH“ ohne Urheberrechtszeichen. | Festlegung des Herausgebers vom 2026-09-29 für Excel und PDF, im Druckfuß entsprechend übernommen; Tests prüfen Excel und PDF. |
| O8 | Kommentare sind von internen Verweisen bereinigt. Reine Hilfsfunktionen sind für Tests zugänglich, die PDF-Erzeugung ist vom Download getrennt. | Keine geänderten Eingaben oder Rechenwege. |
| O9 | Der Hinweis nennt fflate statt ExcelJS. | Nennt die tatsächlich verwendete Bibliothek. |

### Prüfung nach den zehn Prüfpunkten

Die Ergebnisse zur Übernahme sind aus dem Nachweisentwurf vom 2026-09-29 nachgetragen. Spätere Anpassungen und offene Arbeiten sind ausdrücklich benannt; ein damaliges schriftliches Urteil des Kreuz-Reviews je Prüfpunkt liegt nicht vor.

| Nr. | Ergebnis zur Übernahme und spätere Einordnung |
|---|---|
| 1 | Übernommen sind Komponente, Bedienlogik, Exportdaten, Exportaktion und PDF-Export. Der Excel-Export der Website ist durch einen eigenen Schreiber ersetzt, die einbindende Seite der Website ist nicht übernommen. Ein Attribut für die Suchfunktion der Website bleibt in der Komponente. |
| 2 | Siehe „Quelle, Auswahl und Rechte“. Eine unabhängige Prüfung der Rechtekette ist nicht belegt. |
| 3 | In den Quelldateien wurden keine kopierten Fremdanteile oder gesonderten Lizenzhinweise Dritter erkannt. jsPDF, jsPDF-AutoTable und fflate werden importiert, nicht kopiert. Die Hinweise zu den gebündelten Anteilen behandelt [lizenzen.md](lizenzen.md#hinweise-dritter-paketinhalt-und-verbleibende-arbeit); ihre Vervollständigung ist offen. Der Ersatz von ExcelJS ist [gesondert dokumentiert](lizenzen.md#ersatz-von-exceljs). |
| 4 | Kommentare mit Verweisen auf interne Vorgänge, Personen, Werkzeuge und Pull Requests sind neutralisiert, ihr fachlicher Gehalt bleibt (O8). Die Nachprüfung beschreibt verbleibende kosmetische Kommentarreste. |
| 5 | Keine Schlüssel, Kennwörter, Token oder Zugangsdaten gefunden. Der Speicherschlüssel im Browser ist kein Zugangsschlüssel. |
| 6 | Die Quelle enthielt keine Tests. Die neuen Tests verwenden frei erfundene Daten (`test/beispiel.ts`). Das Formular hat keine vorbelegten Projektangaben. |
| 7 | Bildaufruf und Verweise auf Seiten der Website entfallen (O2). Die Oberfläche ruft zur Laufzeit keine Adressen im Netz auf; die Exportbibliotheken bündelt der Gastgeber. Die Adresse des Fristenrechners auf www.baremos.de steht als Text und Verweis in den Exportdateien. Seit Teil 2 ist sie einstellbar; sie ist Vorgabe des Web-Gastgebers, und die App verwendet sie ebenfalls. Die Adressen der XML-Namensräume im Excel-Schreiber sind Kennungen, keine Abrufe. |
| 8 | Die sichtbaren Texte entsprechen der Website, mit den Abweichungen O2, O3, O7 und O9. Der Hinweis auf die unverbindliche Rechenhilfe ohne Gewähr bleibt unverändert. |
| 9 | Die Oberfläche enthält keine eigenen Fristregeln; sie rechnet über den Rechenkern. Vorschlagswerte und Eingabegrenzen des Formulars sind unverändert. Beträge der Schwellenwerte kommen nicht vor. |
| 10 | Das Paket liefert Quellen, kein vorgebautes Bündel. Die Referenzdateien des Excel-Exports sind erzeugt und eingecheckt, weil die Tests sie brauchen. Von Astro erzeugte Typdateien sind ausgeschlossen. |

### Dateien des Übernahmecommits

Der Übernahmecommit `c7397eb` vom 2026-09-29 umfasst 29 Dateien unter `packages/oberflaeche/`. Die Tabelle gruppiert diese Dateien; die Anzahl ergibt sich aus der Dateiliste des Commits. Fünf Dateien stammen aus der Website, zwei aus der eigenen Machbarkeitsprobe.

| Datei | Art | Grund |
|---|---|---|
| `src/Fristenrechner.astro` | übernommen, angepasst | O2, O3, O7, O8, O9 |
| `src/fristenrechner-ui.ts` | übernommen, angepasst | O1, O3, O8 |
| `src/fristenrechner-export-data.ts` | übernommen, angepasst | O1, O3, O8 |
| `src/fristenrechner-export-pdf.ts` | übernommen, angepasst | O1, O3, O7, O8 |
| `src/fristenrechner-export-action.ts` | übernommen, angepasst | nur Importpfad (O1) |
| `src/fristenrechner-export-excel.ts` | neu im Paket, aus eigener Probe | ersetzt den Excel-Export der Website (O3 bis O7) |
| `src/xlsx-schreiber.ts` | neu im Paket, aus eigener Probe | eigener Schreiber (O4) |
| sieben Dateien direkt unter `test/`: `beispiel.ts`, `struktur.mjs`, `export-action.test.ts`, `export-data.test.ts`, `export-excel.test.ts`, `export-pdf.test.ts`, `xlsx-schreiber.test.ts` | neu | Tests mit frei erfundenen Daten, Strukturprüfung der Excel-Datei |
| elf Dateien unter `test/referenz/` | erzeugt | Prüfsumme, Teileliste und neun XML-Teile der Beispieltabelle |
| `README.md`, `tsconfig.json`, `vitest.config.ts` | neu | Beschreibung und Prüfeinstellungen |
| `package.json` | geändert | Einträge für Exporte, Dateien und Skripte |

### Anpassung in Teil 2

Am 2026-09-30 hat Teil 2 (`8ec15e8`) die Inhalte des Gastgebers einstellbar gemacht: Herausgeber, Titel, Adresse und Vorsatz des Dateinamens der Exporte sowie die Hinweis- und Statustexte. Die bisherigen Werte der Website sind die Vorgabe des Web-Gastgebers in `web-vorgaben.ts`; bis auf den Erfolgstext der Exporte lassen sie sich auf den Ausgangsstand vom 2026-08-26 zurückführen. Den Erfolgstext „Die Datei wurde erstellt und zum Speichern bereitgestellt.“ hat Teil 2 neu eingeführt. Die bisherigen formatbezogenen Meldungen „Excel-Datei wurde erstellt.“ und „PDF-Datei wurde erstellt.“ sind damit ersetzt. Teil 2 hat weitere neue Laufzeittexte eingeführt, darunter „Die Projektdatei ist größer als 1 MiB.“ sowie Lade-, Import- und Rücksetzmeldungen. Die App verwendet die Exportvorgaben ebenfalls. Für Logo und Kontakt hat die Komponente Plätze, die der Gastgeber füllt. Die globalen Druckregeln der Website sind entfallen. Teil 2 hat keine neuen Dateien aus anderen Quellen übernommen.

Die zwei Datumswerte im Excel-Kopf sind seit Teil 2 linksbündig; die Werte bleiben unverändert. Dafür wurden zwei Referenzdateien neu erzeugt: `test/referenz/terminplan.sha256` und `test/referenz/xml/xl/styles.xml`. Belegt ist die begrenzte Änderung im Commit `8ec15e8` und im Exportvergleich vom 2026-09-30. Die abschließende Sichtung der Ausgaben bleibt offen, siehe „Grenzen“.

### Ablauf und Kreuz-Review

Codex hat die Dateien am 2026-09-29 übernommen und jede nach den zehn Prüfpunkten geprüft. Die Quelle wurde damals aus der Arbeitskopie gelesen; die Zuordnung zum Stand vom 2026-08-26 ist durch die unten beschriebene Rekonstruktion vom 2026-10-04 belegt. Claude Code hat vor dem Commit die Abweichungen der übernommenen Dateien zur Quelle und den Schreiber vollständig gelesen, vom Excel-Export nur die Kernstellen. Außerdem hat Claude Code Tests, Typprüfung, Build und Lizenzprüfung ausgeführt: 68 Tests der Oberfläche, 134 des Rechenkerns und 423 der Skripte bestanden, die Lizenzprüfung ebenfalls. Das belegt das Prüfprotokoll vom 2026-09-29 vor `c7397eb`. Das Kreuz-Review fand vor dem Commit statt; ein schriftliches Urteil je Prüfpunkt liegt nicht vor. Codex hat die Ergänzungen von Claude Code im Übernahmecommit und die beiden folgenden Commits am selben Tag ohne Befund geprüft; dieses Urteil gilt für die Ergänzungen, nicht als zweites vollständiges Urteil über die Übernahme.

Abweichend von Grundsatz 3 stand das Ergebnis nicht vor dem Commit im Protokoll; auch Schritt 5 des Ablaufs war damit nicht erfüllt. Der Übernahmecommit nannte den Nachweis als offen; Teil 2 hat ihn nicht nachgeholt. Abschnitt und Protokollzeilen sind am 2026-10-04 aus den Belegen vom 2026-09-29 und 2026-09-30 nachgetragen.

Abweichend von Schritt 3 des Ablaufs liefen Build und Tests aus Kopien ohne private Dateien erst nach dem Commit und vor dem Merge. Vor dem Merge kamen zwei Korrekturen hinzu: feste Zeilenenden für die Referenzdateien (`030d356`) und der Build des Rechenkerns vor Tests und Typprüfung der Oberfläche (`908821a`). Die Festlegung der Zeilenenden entstand aus der Durchsicht vor der ersten Kopie. Den fehlenden Build zeigte die erste Kopie unter Windows. Danach bestanden die Prüfungen am Stand `908821a` in Kopien unter Windows mit Node 22.23.2 und unter Linux mit Node 24.21.0; Grundlage sind die damaligen Laufprotokolle. Im Linux-Lauf waren drei Skripttests übersprungen.

Teil 2 hat Codex umgesetzt und Claude Code geprüft. Die Ergänzungen von Claude Code hat Codex am 2026-09-30 geprüft; eine dabei verbliebene Kommentarauflage wurde mit `f7f4d1e` erledigt. Ein eigener Prüfbericht von Claude Code mit einem schriftlichen Urteil je Übernahmeprüfpunkt liegt für Teil 2 nicht vor.

### Nachprüfung vom 2026-10-04

Claude Code hat den Nachweis am 2026-10-04 lesend nachgeprüft. Die damals verwendeten Übernahmeskripte, angewendet auf die Quelldateien im Stand vom 2026-08-26, ergeben im Vergleich mit `c7397eb` drei Dateien bytegleich: Exportdaten, Exportaktion und PDF-Export. Bei den zwei übrigen übernommenen Dateien bleiben nur Änderungen in Kommentaren, an zwei Stellen in der Komponente und an zwölf Stellen in der Bedienlogik. Schreiber und Excel-Export ergeben sich bytegleich aus der Machbarkeitsprobe. Grundlage ist das Rekonstruktions- und Vergleichsprotokoll vom 2026-10-04.

Ohne Kommentare stimmen die Syntaxbäume von Bedienlogik, Exportdaten und Exportaktion nach Rücknahme der benannten Anpassungen mit der Quelle überein. Die PDF-Anpassungen O3, O7 und O8 sind in diesem Syntaxbaumvergleich nicht zurückgenommen; daraus folgt keine Syntaxbaumgleichheit für den PDF-Export. Der Vergleich der Formularvorgaben vom selben Tag zeigt: Die 64 Formularelemente mit Name, Typ, Vorgabewert und Grenzen sind in der Quelle, im Übernahmestand `c7397eb` und am App-Endstand `5e6f230` gleich.

Die Suche am App-Endstand in `packages/oberflaeche` ergab keinen inhaltlichen Fund zu internen Vorgängen, Personen oder Pull Requests, zum Website-Logo oder zu Verweisen auf Seiten der Website. In Komponente und Exporten wurde kein Urheberrechtszeichen gefunden; Tests prüfen dessen Fehlen. Auch die Suche nach Beträgen und Netz-APIs blieb ohne Fund. In den Quellen verbleiben die XML-Namensräume und die Web-Vorgabe-Adresse aus Prüfpunkt 7. Suchkategorien und Treffer sind im Gegenprüfungsprotokoll vom 2026-10-04 festgehalten; sie sind kein Nachweis für beliebige andere Suchmuster oder das gesamte Laufzeitverhalten.

Neun kosmetische Kommentarreste bleiben am App-Endstand: fünf in `Fristenrechner.astro`, je einer in `fristenrechner-export-data.ts` und `fristenrechner-export-pdf.ts`, zwei in `fristenrechner-ui.ts`. Das sind doppelte Leerzeichen oder Leerzeichen vor Satzzeichen aus der Bereinigung, keine verbliebenen internen Verweise. Sie sind in der erneuten Nachprüfung vom 2026-10-04 erfasst, einschließlich der zweiten Stelle in `fristenrechner-ui.ts`, und mit diesem Dokumentationsnachtrag nicht geändert.

### Grenzen

Der Nachweis beschreibt die Übernahme vom 2026-09-29, die Anpassung vom 2026-09-30 und die ausdrücklich benannten Nachprüfungen am App-Endstand `5e6f230`. Er ist kein vollständiges Review aller späteren Änderungen an der Oberfläche. Eine unabhängige Prüfung der Rechtekette gehört nicht dazu. Die datierte Rekonstruktion ergänzt die damaligen Belege; sie ersetzt weder den damals fehlenden Protokolleintrag noch ein schriftliches Urteil je Prüfpunkt des damaligen Kreuz-Reviews.

Offen sind die vollständigen Hinweise Dritter zu den gebündelten Anteilen, einschließlich der optionalen jsPDF-Module ([lizenzen.md](lizenzen.md#hinweise-dritter-paketinhalt-und-verbleibende-arbeit)), und die abschließende Sichtung der Teil-2-Exporte in Excel und LibreOffice sowie des PDF ([testmatrix.md](testmatrix.md), B14). Die automatischen Vergleiche ersetzen diese Sichtung nicht. Die ergänzenden Rekonstruktions- und Laufprotokolle werden gesondert aufbewahrt und sind nicht Teil des Repositorys.

## Protokoll

Jede Übernahme erhält eine Zeile. Ein Prüfpunkt, der nicht zutrifft, steht nicht unter „Befunde". Die vorhandenen Zeilen bewahren die Befunde und offenen Punkte zum jeweiligen Datum; sie werden nicht als aktueller Abschlussstand gelesen.

| Datum | Arbeitspaket | Dateien | Quelle und Stand | Befunde und Bereinigung | Geprüft von |
|---|---|---|---|---|---|
| 2026-09-28 | 2.2 | `LICENSE` | https://www.apache.org/licenses/LICENSE-2.0.txt, geladen am 2026-09-28, 11.358 Byte, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | keine, Wortlaut unverändert | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.2 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0 aus den Manifesten dieses Repositorys | keine. Die Datei nennt nur die eigenen Workspaces, keine fremden Pakete und keine Adressen im Netz. `npm ci` läuft damit unter npm 11.19.0 und npm 10.9.8. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | acht Dateien des Rechenkerns unter `packages/kern/src` | Rechenkern 1.9.0 des Fristenrechners auf www.baremos.de, Stand 2026-08-26 | Prüfpunkt 1: Die Schwellenwerte gehören nicht zum Zuschnitt, entfernt (A1, A2). Prüfpunkt 4: interne Verweise in Kommentaren und in Titeln von Tests, bereinigt (A6). Prüfpunkt 8: fünf Texte neu gefasst, Anzeigetext zum Rechtsstand gekürzt (A2, A7). Die übrigen Texte in den Quelldateien sind unverändert, neu ist die Meldung aus A3. Die Texte, die der Rechenkern im Raster ausgibt, stehen in `texte-1.9.0.txt`. Die Meldungen beim Import einer Projektdatei gehören nicht dazu, sie stehen in `projekt.ts`. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | vier Referenzdateien unter `packages/kern/test/referenz` | erzeugt aus dem Rechenkern 1.9.0, siehe Abschnitt „Referenzfälle" | Prüfpunkt 10: Die Dateien sind erzeugt. Sie gehören ins Repository, weil die Tests sie brauchen. Raster und Abbild, aus denen sie entstehen, liegen daneben. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0, nach Aufnahme von `typescript` und `vitest` | keine, siehe Abschnitt „Abhängigkeiten für Test und Build" | Claude Code, Kreuz-Review Codex |
| 2026-09-29 | 2.4 Teil 1 | fünf Dateien der Oberfläche unter `packages/oberflaeche/src`: Komponente, Bedienlogik, Exportdaten, Exportaktion, PDF-Export | Oberfläche des Fristenrechners auf www.baremos.de, Stand 2026-08-26 | Prüfpunkte 2 und 7: Logo der Website und Absatz mit Verweisen auf Seiten der Website entfernt (O2). Prüfpunkt 4: interne Verweise in Kommentaren neutralisiert (O8). Prüfpunkt 8: Regelversion und Datum des Rechtsstands ergänzt, Fußzeilen ohne Urheberrechtszeichen, Bibliotheksnennung angepasst (O3, O7, O9). Der Excel-Export der Website ist nicht übernommen. Siehe [Übernahme der Oberfläche](#übernahme-der-oberfläche); nachgetragen am 2026-10-04. | Codex; Kreuz-Review Claude Code vor dem Commit, ohne schriftliches Urteil je Prüfpunkt; Nachprüfung Claude Code am 2026-10-04 |
| 2026-09-29 | 2.4 Teil 1 | `packages/oberflaeche/src/xlsx-schreiber.ts`, `src/fristenrechner-export-excel.ts` und elf Referenzdateien unter `test/referenz/` desselben Pakets | Machbarkeitsprobe eines eigenen Excel-Schreibers vom 2026-09-29, nicht eingecheckt; Referenzen mit dem eigenen Schreiber aus `test/beispiel.ts` erzeugt | Prüfpunkte 1 und 3: in TypeScript neu gefasst, nur Schreiben, einziger Fremdimport des Schreibers ist `zipSync` aus fflate 0.8.3 (MIT); Vergleichsprogramme und Probeschalter nicht übernommen (O3 bis O7). Prüfpunkte 6 und 10: Referenzen mit frei erfundenen Daten, für die Tests erforderlich; eine fehlende Referenz lässt den Test scheitern. Nachgetragen am 2026-10-04. | Codex; Kreuz-Review Claude Code vor dem Commit, ohne schriftliches Urteil je Prüfpunkt; Nachprüfung Claude Code am 2026-10-04 |
| 2026-09-30 | 2.4 Teil 2 | Gastgeberinhalte in `packages/oberflaeche/src/web-vorgaben.ts`, Anpassungen der Komponente und Exporte; zwei geänderte Excel-Referenzdateien | bisherige Website-Werte aus dem Stand 2026-08-26 und ein in Teil 2 neu gefasster Erfolgstext der Exporte; Weiterentwicklung des Übernahmestands `c7397eb` in `8ec15e8`, keine neuen Dateien aus anderen Quellen | Prüfpunkte 7 und 8: Gastgeberinhalte einstellbar, Plätze für Logo und Kontakt, globale Druckregeln entfallen; App verwendet die Exportvorgaben ebenfalls. Prüfpunkt 8: Erfolgstext der Exporte neu gefasst, Größenmeldung „Die Projektdatei ist größer als 1 MiB.“ und weitere Laufzeittexte eingeführt. Prüfpunkt 10: Prüfsumme und Stilreferenz für die linksbündigen Datumswerte im Kopf neu erzeugt. Siehe „Anpassung in Teil 2“ und „Ablauf und Kreuz-Review“; nachgetragen am 2026-10-04. | Codex; Kreuz-Review Claude Code, kein eigener schriftlicher Prüfbericht je Übernahmeprüfpunkt; Ergänzungen von Claude Code durch Codex geprüft |
| 2026-09-30 | 2.5 | Android-Projekt: 52 Vorlagendateien geprüft, davon 18 übernommen; sieben neue Dateien | `@capacitor/cli` 8.5.2, `assets/android-template.tar.gz`, 217.371 Bytes, SHA-256 `5edb50a67a034556da8bb5fa54eb08211eaa952aac0949c75050ebcf0be97303` | Vorlage gezielt reduziert und an die App angepasst; vollständiger Dateivergleich, Prüfpunkte und Lizenzbelege im Abschnitt „Übernahme der Android-Vorlage“. Debug- und Release-Build mit Gradle, statische APK-Prüfung und Rauchtest auf API 30 und 36 am 2026-09-30 erfolgt. Weitergehende Emulatorprüfungen und Gradle-Lizenzprüfung stehen aus. | Codex; Kreuz-Review der Übernahme durch Claude Code erfolgt |
