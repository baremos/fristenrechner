# Übernahmeprüfung

Stand 2026-09-28 · Arbeitspaket 2.2

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

Das Paket selbst hat keine Abhängigkeiten. Für Typprüfung und Build kommt `typescript` 6.0.3 hinzu, für die Tests `vitest` 4.1.11. Das Lockfile nennt damit 70 Pakete, einschließlich der Pakete für andere Betriebssysteme.

| Lizenz | Pakete |
|---|---|
| MIT | 52 |
| MPL-2.0 | 12 |
| Apache-2.0 | 3 |
| ISC | 2 |
| BSD-3-Clause | 1 |

Geprüft ist das Feld zur Lizenz im Lockfile, bei den installierten Paketen zusätzlich gegen deren Manifest. Der tatsächliche Inhalt der Pakete ist damit nicht geprüft, das leistet Arbeitspaket 2.7.

Zwei Punkte für die folgenden Arbeitspakete:

- `vitest` bringt über `vite` vorgebaute Programme mit, etwa `rolldown` und `lightningcss`. Der Build des Pakets braucht sie nicht, er läuft allein mit `tsc`. Was das für den Build bei F-Droid bedeutet, klärt Arbeitspaket 2.8.
- Die 12 Pakete unter MPL-2.0 gehören zu `lightningcss`. Sie dienen dem Test und werden nicht mit der App ausgeliefert.

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
| 8 | `strings.xml` enthält den App-Namen, die kurze Beschriftung „Fristenrechner“, die Paketkennung und eine deutsche Meldung bei fehlender Android System WebView. Die Meldung beschreibt die fehlende Systemkomponente. Anzeige, Launcher-Beschriftung und Symbol sind im Emulator noch zu prüfen. |
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
| `gradlew` | unverändert | Unverändertes Gradle-Startskript für POSIX mit Lizenzkopf. |
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

Die App definiert kein `Theme.SplashScreen` und kein eigenes Startbild. Entfernt ist die **direkte** Abhängigkeit auf `core-splashscreen`; daraus folgt keine Aussage über das Fehlen der Bibliothek im vollständigen Gradle-Abhängigkeitsbaum oder in der APK.

### Grenzen und noch ausstehende Prüfung

Diese Übernahmeprüfung betrifft den Quellstand und die lokal erzeugten Sync-Dateien vom 2026-09-30. Claude Code hat die Übernahme kreuzweise geprüft, die Vorlage dafür unabhängig entpackt und verglichen sowie die Symbole mit dem freigegebenen Entwurf abgeglichen. Debug- und Release-Build über den Gradle-Wrapper sind am 2026-09-30 unter Windows erfolgt; die entstandenen APKs wurden mit `aapt2` aus den Build-Tools 35.0.0 statisch untersucht. Ergebnisse, Werkzeugversionen und Grenzen stehen in [app.md](app.md#build-vom-2026-09-30).

Die Prüfung dieser App im Emulator und die Lizenzprüfung der von Gradle aufgelösten Abhängigkeiten stehen aus. Insbesondere die Wirkung von Navigation, Sicherung und Gerätewechsel sowie die Anzeige des Symbols und das Verhalten ohne Startbild werden durch Quellen, Build und statische APK-Prüfung allein nicht nachgewiesen. Linux-Builds und ein Vergleich der Reproduzierbarkeit stehen ebenfalls aus.

## Protokoll

Jede Übernahme erhält eine Zeile. Ein Prüfpunkt, der nicht zutrifft, steht nicht unter „Befunde".

| Datum | Arbeitspaket | Dateien | Quelle und Stand | Befunde und Bereinigung | Geprüft von |
|---|---|---|---|---|---|
| 2026-09-28 | 2.2 | `LICENSE` | https://www.apache.org/licenses/LICENSE-2.0.txt, geladen am 2026-09-28, 11.358 Byte, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | keine, Wortlaut unverändert | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.2 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0 aus den Manifesten dieses Repositorys | keine. Die Datei nennt nur die eigenen Workspaces, keine fremden Pakete und keine Adressen im Netz. `npm ci` läuft damit unter npm 11.19.0 und npm 10.9.8. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | acht Dateien des Rechenkerns unter `packages/kern/src` | Rechenkern 1.9.0 des Fristenrechners auf www.baremos.de, Stand 2026-08-26 | Prüfpunkt 1: Die Schwellenwerte gehören nicht zum Zuschnitt, entfernt (A1, A2). Prüfpunkt 4: interne Verweise in Kommentaren und in Titeln von Tests, bereinigt (A6). Prüfpunkt 8: fünf Texte neu gefasst, Anzeigetext zum Rechtsstand gekürzt (A2, A7). Die übrigen Texte in den Quelldateien sind unverändert, neu ist die Meldung aus A3. Die Texte, die der Rechenkern im Raster ausgibt, stehen in `texte-1.9.0.txt`. Die Meldungen beim Import einer Projektdatei gehören nicht dazu, sie stehen in `projekt.ts`. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | vier Referenzdateien unter `packages/kern/test/referenz` | erzeugt aus dem Rechenkern 1.9.0, siehe Abschnitt „Referenzfälle" | Prüfpunkt 10: Die Dateien sind erzeugt. Sie gehören ins Repository, weil die Tests sie brauchen. Raster und Abbild, aus denen sie entstehen, liegen daneben. | Claude Code, Kreuz-Review Codex |
| 2026-09-28 | 2.3 | `package-lock.json` | erzeugt mit npm 11.19.0 unter Node 24.21.0, nach Aufnahme von `typescript` und `vitest` | keine, siehe Abschnitt „Abhängigkeiten für Test und Build" | Claude Code, Kreuz-Review Codex |
| 2026-09-30 | 2.5 | Android-Projekt: 52 Vorlagendateien geprüft, davon 18 übernommen; sieben neue Dateien | `@capacitor/cli` 8.5.2, `assets/android-template.tar.gz`, 217.371 Bytes, SHA-256 `5edb50a67a034556da8bb5fa54eb08211eaa952aac0949c75050ebcf0be97303` | Vorlage gezielt reduziert und an die App angepasst; vollständiger Dateivergleich, Prüfpunkte und Lizenzbelege im Abschnitt „Übernahme der Android-Vorlage“. Debug- und Release-Build mit Gradle und statische APK-Prüfung am 2026-09-30 erfolgt. Emulator- und Gradle-Lizenzprüfung stehen aus. | Codex; Kreuz-Review der Übernahme durch Claude Code erfolgt |
