# Signierung

Stand 2026-10-18 · eingefrorener App-Stand `8b17927` · N1 mit der App, N4/N5 mit einer Testfassung erneut belegt · Probeschlüssel gelöscht · echter Schlüssel am 2026-10-18 erzeugt, N2 belegt, N3 offen

Dieses Dokument legt fest, wie die App signiert wird. Die Festlegungen S1 bis S12 hat der fachlich Verantwortliche am 2026-09-29 getroffen; S1 bleibt unter Vorbehalt. S4 wurde am 2026-10-17 auf den eingetragenen Namen der Gesellschaft angepasst.

## Warum das früh feststehen muss

Android installiert ein Update nur, wenn dessen Signatur zur installierten App passt: dasselbe Zertifikat oder eine Folge von Schlüsselwechseln, die das System anerkennt. Passen die Fassungen bei Google Play und bei F-Droid nicht zueinander, kann niemand von einem Weg auf den anderen wechseln, ohne die App zu deinstallieren. Dabei gehen die gespeicherten Projekte verloren. Ein falsch gewählter oder verlorener Schlüssel lässt sich nach der ersten Veröffentlichung nur schwer ersetzen.

## Ziel

1. Wer die App über Google Play hat, kann auf F-Droid wechseln und umgekehrt, ohne Daten zu verlieren.
2. Der Schlüssel liegt nur beim Herausgeber und bei Google Play, soweit Google Play das verlangt.
3. Ein Verlust des Rechners führt nicht zum Verlust des Schlüssels.
4. Kein Schlüssel, kein Kennwort und keine Schlüsseldatei liegt im Repository.

Ob Ziel 1 auf allen Versionen von Android erreichbar ist, steht noch nicht fest. Siehe „Hybrides Signierverfahren bei Google Play“.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| App-Signierschlüssel | Mit ihm sind die Dateien signiert, die auf dem Gerät installiert werden. Er soll über die Lebenszeit der App derselbe bleiben. Ein Wechsel ist möglich, braucht aber einen eigenen Nachweis für alle Vertriebswege. |
| Upload-Schlüssel | Mit ihm ist signiert, was der Herausgeber bei Google Play hochlädt. Er lässt sich über die Play Console ersetzen. |
| Zertifikat | öffentlicher Teil zum Schlüssel. Es darf weitergegeben werden. |
| Fingerabdruck | SHA-256 über das Zertifikat. An ihm erkennen Stores und Prüfwerkzeuge den Schlüssel. |
| Entwicklersignatur | Signatur des Herausgebers, im Unterschied zur Signatur eines Stores |
| APK | Datei, die auf dem Gerät installiert wird |
| AAB | Android App Bundle. Diese Datei lädt der Herausgeber bei Google Play hoch, Google erzeugt daraus die APK. |

## Vertriebswege

| Weg | Wer signiert, was der Nutzer installiert | Was für eine passende Signatur nötig ist |
|---|---|---|
| Google Play | Google, mit dem App-Signierschlüssel, den Google verwahrt. Für neue Apps ist dieses Verfahren vorgeschrieben. | Der Herausgeber bringt seinen eigenen Schlüssel ein, statt Google einen erzeugen zu lassen. Ob das genügt, ist offen, siehe nächster Abschnitt. |
| F-Droid | in der Voreinstellung F-Droid, mit einem eigenen Schlüssel von F-Droid | Der Build ist reproduzierbar. F-Droid baut aus den Quellen, überträgt die Signatur der Datei des Herausgebers auf den eigenen Build und prüft sie. Gelingt das, veröffentlicht F-Droid die Datei mit der Entwicklersignatur. |

Zu Google Play: Nach der Hilfe zur Play Console lässt sich ein eigener Schlüssel nur wählen, solange keine Version im offenen Test oder in der Produktion veröffentlicht ist. Die Wahl fällt also beim Anlegen der App und vor der ersten Veröffentlichung. Die Hilfe nennt einen zweiten Weg für andere Stores: Google erzeugt den Schlüssel, und der Herausgeber lädt aus der Play Console eine signierte Datei herunter, die er anderswo verteilt. Ob F-Droid eine solche Datei nachbauen kann, ist nicht geprüft.

Zu F-Droid: Das Rezept nennt mit `Binaries` die Adresse der Datei des Herausgebers und mit `AllowedAPKSigningKeys` den Fingerabdruck des Zertifikats, als SHA-256 in kleinen Hexadezimalziffern. Stimmt der Build von F-Droid nicht mit der Datei überein, veröffentlicht F-Droid diese Version nicht. Verglichen wird alles außer der Signatur.

## Hybrides Signierverfahren bei Google Play

Gelesen am 2026-09-29 in der Hilfe zur Play Console und in der Dokumentation des Android Open Source Project.

| Punkt | Was die Quellen sagen |
|---|---|
| Voreinstellung für neue Apps | Google Play signiert mit einem hybriden Verfahren und mit Schlüsseln, die Google erzeugt. Beteiligt sind drei Schlüssel: ein klassischer Schlüssel für ältere Geräte, in der Dokumentation K0 genannt, und für den hybriden Block ein neuer Schlüssel RSA mit 4096 Bit und ein Schlüssel ML-DSA-65. |
| Eigener Schlüssel | Der Herausgeber kann die Voreinstellung ändern und einen eigenen Schlüssel einbringen, solange keine Version im offenen Test oder in der Produktion veröffentlicht ist. |
| Signaturverfahren | APK Signature Scheme v3.2, eingeführt mit Android 17 (API 37). Es verlangt eine klassische und eine zweite Signatur nach einem Verfahren, das auch Quantenrechnern standhalten soll. |
| Ältere Geräte | Bis Android 16 wertet das System den hybriden Block nicht aus und verwendet die bisherigen Verfahren. |
| Wirkung auf Updates | Android behandelt den hybriden Block wie einen Schlüsselwechsel. War die installierte App nur klassisch signiert, muss dieser Schlüssel in der Folge der Schlüssel des hybriden Blocks als Vorgänger stehen. War sie hybrid signiert und ist das Update nur mit einem Schlüssel signiert, müssen beide bisherigen Schlüssel den neuen bestätigen. |
| Rückweg | Die Dokumentation empfiehlt, dem Schlüssel K0 in der Folge der Schlüssel das Recht `ROLLBACK` zu geben. Damit kann eine App zu einer klassischen Signatur zurückkehren. |

Nicht aus den Quellen hervor geht, ob Google Play auch bei einem eigenen Schlüssel einen hybriden Block anfügt, ob der eigene Schlüssel dann K0 ist und ob Google Play ihm das Recht `ROLLBACK` gibt.

Folgerung für dieses Projekt, noch ohne Nachweis:

1. Signiert Google Play bei einem eigenen Schlüssel nur klassisch und mit demselben Zertifikat, passen die Fassungen beider Vertriebswege zueinander.
2. Fügt Google Play einen hybriden Block an, gilt auf Geräten ab Android 17: Der Wechsel von F-Droid zu Google Play setzt voraus, dass das Zertifikat der Fassung von F-Droid in der Folge der Schlüssel als Vorgänger steht. Der Wechsel von Google Play zu F-Droid setzt voraus, dass der Rückweg zur klassischen Signatur eingerichtet ist. Fehlt eine der Voraussetzungen, scheitert der Wechsel in dieser Richtung.
3. Ein gemeinsamer klassischer Schlüssel allein ist deshalb kein Nachweis für Ziel 1.

Die festgelegten Build-Tools 35.0.0 sind älter als Android 17. Ob `apksigner` aus diesem Paket hybride Signaturen prüfen oder erzeugen kann, ist nicht geprüft.

## Festlegungen

Getroffen am 2026-09-29.

| Nr. | Thema | Festlegung | Begründung |
|---|---|---|---|
| S1 | Zahl der Schlüssel | ein klassischer App-Signierschlüssel für alle Vertriebswege, dazu ein getrennter Upload-Schlüssel für Google Play. **Unter Vorbehalt:** Die Festlegung gilt erst, wenn der Nachweis N6 erbracht ist. | siehe Ziel. Geht der Upload-Schlüssel verloren, lässt er sich ersetzen, ohne dass sich die Signatur der App ändert. |
| S2 | Verfahren und Länge | RSA mit 4096 Bit, für beide selbst erzeugten Schlüssel | Google Play verlangt für eigene Schlüssel und für den Upload-Schlüssel RSA mit mindestens 2048 Bit. Die klassischen Schlüssel, die Google erzeugt, haben 4096 Bit. |
| S3 | Gültigkeit des Zertifikats | 30 Jahre. Das Enddatum wird nach dem Erzeugen geprüft. | Die Dokumentation von Android empfiehlt mindestens 25 Jahre. Google Play verlangt ein Ende nach dem 22. Oktober 2033. |
| S4 | Angaben im Zertifikat | `CN=BAREMOS IT Dienstleistungs GmbH, O=BAREMOS IT Dienstleistungs GmbH, L=Berlin, C=DE` | Name und Ort des Herausgebers, nur Angaben, die ohnehin öffentlich sind. Das Zertifikat ist öffentlich und soll über die Lebenszeit der App dasselbe bleiben. Am 2026-10-17 wurde der eingetragene Name der Gesellschaft festgelegt, wie ihn Impressum und Datenschutzerklärung der Website nennen; der Schlüssel war noch nicht erzeugt. |
| S5 | Format der Schlüsseldatei | PKCS12, je Schlüssel eine eigene Datei. Der Typ wird beim Erzeugen und bei jeder Verwendung ausdrücklich angegeben. | PKCS12 ist die Voreinstellung von `keytool` seit Java 9. Das Skript verlässt sich nicht auf Voreinstellungen. Getrennte Dateien erlauben getrennte Ablage. |
| S6 | Signaturverfahren der APK | APK Signature Scheme v2 und v3, ausdrücklich eingestellt: v1 aus, v2 an, v3 an, v4 aus | v2 gibt es seit Android 7.0, v3 seit Android 9. Die Mindestversion der App ist Android 11 (API 30), das ältere Verfahren v1 ist dafür nicht nötig. Das gilt für die klassische Signatur des Herausgebers, nicht für hybride Signaturen von Google Play. |
| S7 | Ort des Signierens | außerhalb des Gradle-Builds. Die APK für F-Droid signiert `apksigner` aus den Build-Tools, das AAB für Google Play `jarsigner` aus dem JDK mit dem Upload-Schlüssel. | Der Build erzeugt unsignierte Dateien. Die Konfiguration des Builds enthält weder Pfad noch Kennwort. F-Droid empfiehlt `apksigner`, weil die Übertragung der Signatur dessen Verhalten nachbildet. `apksigner` signiert keine AAB-Dateien. |
| S8 | Ablage | außerhalb des Arbeitsordners und außerhalb von Ordnern, die ein Dienst automatisch abgleicht. Der Ort steht in keiner eingecheckten Datei. | Regel 4 des Projekts |
| S9 | Kennwörter | kennt nur der fachlich Verantwortliche. Sie stehen in keiner Datei des Repositorys, in keinem Protokoll und in keinem Aufruf. Wer signiert, gibt das Kennwort im Dialog ein. | Regel 4 des Projekts |
| S10 | Sicherung | zwei Kopien auf getrennten Datenträgern an getrennten Orten, verschlüsselt. Die Wiederherstellung des echten Schlüssels wird einmal geprüft, bevor er zum ersten Mal für eine Veröffentlichung verwendet wird. | Abnahmekriterium des Arbeitspakets |
| S11 | Debug-Builds | tragen den Debug-Schlüssel, den die Build-Werkzeuge von Android auf dem Rechner erzeugen, und werden nicht veröffentlicht | Der Debug-Schlüssel entsteht auf jedem Rechner neu. |
| S12 | Fassung und Einstellung von `apksigner` | `apksigner` aus den Build-Tools 35.0.0, immer mit `--alignment-preserved true` | F-Droid dokumentiert: Dateien, die `apksigner` aus den Build-Tools 34 signiert, lassen sich mit `apksigcopier` prüfen, bei neueren Fassungen scheitert das. Die Probe vom 2026-09-29 bestätigt das für die Voreinstellung und zeigt, dass es mit dieser Einstellung gelingt, siehe „Ergebnisse der Probe“. Eine zweite Fassung der Build-Tools ist damit nicht nötig. |

## Probe vor dem echten Schlüssel

Der technische Nachweis in Stufe 2 braucht den echten Schlüssel nicht. Die Proben liefen mit dafür erzeugten Probeschlüsseln. Die erste Freigabe und Erzeugung erfolgten am 2026-09-29. Für N4 und N5 entstanden Testfassungen mit eigener App-ID am [Endstand vom 2026-10-04](#testfassung-am-endstand-vom-2026-10-04) und am [eingefrorenen Stand vom 2026-10-15](#nachweise-am-eingefrorenen-stand-vom-2026-10-15); die folgende Verwendungsregel bleibt unverändert.

| Punkt | Festlegung |
|---|---|
| Kennzeichnung | Das Zertifikat nennt im Namen das Wort „Probe“. |
| Ablage | in einem Ordner außerhalb des Arbeitsordners |
| Sicherung | eine eigene Probesicherung, nur für die Probe der Wiederherstellung. Sie wird danach gelöscht. |
| Verwendung | nur für die Minimal-App und für Testfassungen mit eigener App-ID |
| Ende | Der Probeschlüssel wird nach dem Nachweis gelöscht. Er signiert nie eine veröffentlichte Datei. |

Die Probe der Wiederherstellung mit dem Probeschlüssel ersetzt nicht die Prüfung der Sicherung des echten Schlüssels. Die Werkzeuge lasen das Kennwort aus einer Datei; es stand in keinem Aufruf und in keinem Protokoll. Für den echten Schlüssel gilt S9.

Nach Abschluss von N1, N4 und N5 wurden am 2026-10-04 zwischen 00:16 und 00:17 beide Probeschlüssel („Probe App“ und „Probe Upload“), ihre Kennwortdatei und die Probesicherung einschließlich der Kopie in Debian gelöscht. Die anschließende Suche in den Arbeits- und Nachweisordnern fand keine Kopie der Schlüssel- oder Kennwortdateien mehr. Signierte Dateien bleiben als private Belege erhalten; sie enthalten keinen Schlüssel und sind nicht veröffentlicht. Quelle sind die Protokolle vom 2026-10-04; sie liegen nicht im Repository.

## Ergebnisse der Probe

Probe vom 2026-09-29 mit dem Probeschlüssel und der Minimal-App, Stand `d27fb91`. Signiert ist die unsignierte Release-Datei aus `fdroid-build.md`, 3 251 043 Bytes.

| Punkt | Ergebnis |
|---|---|
| Schlüssel | erzeugt unter Windows mit `keytool` 21.0.8: RSA mit 4096 Bit, PKCS12, gültig vom 2026-09-29 bis zum 2056-09-29. Das Zertifikat signiert `keytool` mit SHA384withRSA. |
| Probesicherung | Kopie in Debian eingelesen, Prüfsummen gleich, damit signiert. Der Fingerabdruck in der signierten Datei ist der, den `keytool` nennt. |
| Signaturverfahren | `apksigner verify` meldet: v1 nein, v2 ja, v3 ja, v3.1 nein, v4 nein. Schlüssel RSA mit 4096 Bit. |
| Zwei Fassungen von `apksigner` | Die Fassung aus den Build-Tools 35.0.0 und die Fassung 35.0.2 aus Debian erzeugen dieselbe signierte Datei, Byte für Byte. |
| Übertragung der Signatur, Voreinstellung | **gescheitert.** `apksigner` verschiebt beim Signieren 441 der 444 Einträge, die signierte Datei hat 3 263 943 Bytes. Die Funktion `verify_apks` aus fdroidserver 2.4.2 überträgt die Signatur mit `apksigcopier` 1.1.1 auf den zweiten, getrennt erzeugten Build. Die Prüfung danach meldet eine abweichende Prüfsumme. |
| Übertragung der Signatur, mit `--alignment-preserved true` | **bestanden.** Die signierte Datei hat 3 259 847 Bytes. Die Datei mit der übertragenen Signatur ist bytegleich mit der signierten Datei. |
| Gegenprobe | zweiter Build mit einer zusätzlichen Datei: Die Prüfung scheitert, wie sie soll. |
| Ausrichtung | `zipalign -c 4` bestätigt die unsignierte und die signierten Dateien. |
| Unsignierte Datei | nach dem Signieren unverändert |
| AAB | `bundleRelease` erzeugt 3 087 892 Bytes. `jarsigner` aus dem JDK 21.0.12.1 signiert mit dem Probeschlüssel für den Upload, `jarsigner -verify` bestätigt. Es warnt, dass das Zertifikat selbst signiert ist. Das ist bei Schlüsseln für Android so vorgesehen. |

Grenzen: Die Minimal-App hat keinen nativen Code. Bei Dateien mit nativem Code richtet `apksigner` in der Voreinstellung die Bibliotheken neu aus, mit `--alignment-preserved true` bleibt die Ausrichtung aus dem Build. Geprüft ist mit fdroidserver 2.4.2, der Buildserver von F-Droid nutzt einen neueren Stand. Auf einem echten Gerät installiert ist noch nichts.

### Update im Emulator (N4)

Probe vom 2026-09-29 mit dem Probeschlüssel. Zwei Fassungen der Minimal-App mit derselben App-ID: Fassung 1 mit Versionscode 1, Fassung 2 mit Versionscode 2. Beim ersten Start legt die Seite ein Probeprojekt an, einmal im Speicher der WebView (`localStorage`) und einmal als Datei im Datenbereich der App über das Dateisystem-Plugin von Capacitor. Bei jedem weiteren Start liest sie beides und meldet, was sie gefunden hat. Signiert hat `scripts/signing/apk-signieren.mjs`, installiert ist mit `adb install -r` auf den drei Systemabbildern ohne Google-Dienste.

| Schritt | API 36, WebView 133 | API 30, WebView 83 | API 24, WebView 52 |
|---|---|---|---|
| Fassung 1 installiert und gestartet | Speicher und Datei angelegt | Speicher angelegt, Datei nicht | Speicher angelegt, Datei nicht |
| Fassung 2 mit anderer Signatur | abgelehnt, `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | ebenso | ebenso |
| Fassung 2 mit derselben Signatur | installiert, Versionscode 2, Zeit der ersten Installation unverändert | ebenso | ebenso |
| Fassung 2 liest, was Fassung 1 angelegt hat | Speicher und Datei, Inhalt mit Zeitstempel gleich. Prüfsumme und Änderungszeit der Datei gleich. | Speicher, Inhalt mit Zeitstempel gleich | Speicher, Inhalt mit Zeitstempel gleich |
| Rückschritt auf Fassung 1 | abgelehnt, `INSTALL_FAILED_VERSION_DOWNGRADE` | ebenso | ebenso |
| Daten nach beiden abgelehnten Installationen | unverändert lesbar | Speicher unverändert lesbar | Speicher unverändert lesbar |

Grenzen: Geprüft ist die Minimal-App im Emulator, nicht die App, kein echtes Gerät und keine Installation über einen Vertriebsweg. Die Datei über das Plugin ist nur auf API 36 geprüft. Auf API 30 bricht die WebView das gebündelte Skript der Seite mit einem Syntaxfehler ab, auf API 24 läuft die Brücke von Capacitor nicht. Beides betrifft den Web-Build und die Mindestversion der WebView, nicht die Signatur, siehe `toolchain.md`, „Bekannte Einschränkungen“, Nummer 5.

## Testfassung am Endstand vom 2026-10-04

Quelle für alle Ergebnisse und Zahlen dieses Abschnitts sind die Protokolle der Läufe vom 2026-10-03/04; sie liegen nicht im Repository.

Die Testfassung beruht auf Nachweisstand `8987e69`, dessen App-Eingaben dem App-Endstand `c7b5230` entsprechen. In getrennten Probeklonen wurde nur die `applicationId` auf `de.baremos.fristenrechner.probe` geändert. Fassung F1 trägt `versionCode 100` und `versionName 0.1.0`; Fassung F2 zusätzlich `versionCode 101` und `versionName 0.1.1`. Diese Änderungen sind nur lokal in den Probeklonen eingecheckt. Die echte App-ID wurde mit keinem Probeschlüssel signiert.

F1 und F2 wurden nach dem vollständigen App-Build im jeweiligen Klon über `scripts/android-build.mjs` nach `clean` als Release gebaut. F1 unter Windows (Node.js 22.23.2, JDK 21.0.8, ohne `--streng`) und unter Linux (OpenJDK 21.0.12.1, `--streng --ohne-testgruppe`) sind bytegleich: 7 760 765 Bytes, SHA-256 `ca5fef7e6ea31672a4612c56d81340b3047898007b71b3f16abc611f9cad2104`. F2 unter Windows hat dieselbe Größe und SHA-256 `e53c9bc49e0df1f4ac9d6f42411e5188892ae056c2742a427ff48345770de77b`.

Signiert wurde unter Windows mit `scripts/signing/apk-signieren.mjs` und `apksigner` aus den Build-Tools 35.0.0 (Versionsausgabe 0.9): v2 und v3, ohne v1 und v4, Ausrichtung erhalten, Prüfung mit `-Werr --min-sdk-version 24`. F1 und F2 tragen „Probe App“; eine zweite F2 trägt für die Gegenprobe „Probe Upload“. Die signierten Dateien haben jeweils 7 772 613 Bytes. Ihre SHA-256 sind `b3de43f0a6276a2c20d8f459c0dbae1e2012d3bb27d90893fab8aca06cfa09a3` (F1), `cbc754cd8fd148862443bd7a6b357e7c8d1ed0a51641be3bd469e42a11ffbfa1` (F2) und `f795046a192779c1a256fec05ee1fe43e09a0a5fe3e50895947de0cc62c3834a` (F2 mit anderer Signatur).

### Reproduzierbarer App-Build (N1)

Die unsignierte Release-APK der App mit ihrer echten App-ID ist in den getrennten Builds bytegleich: Windows nach `clean` am Stand `c7b5230`, frische Windows-Kopie mit Node.js 22.23.2, zwei frische Linux-Klone mit `--streng --ohne-testgruppe` und der lokale F-Droid-Lauf am Nachweisstand `8987e69`. Ergebnis: 7 760 765 Bytes, SHA-256 `ab18ee072cf98f922ff16a139365be627ed18f5dd1d4876d54b4ef4fb3e4f1fa`. Einzelheiten stehen in den [App-Nachweisen](app.md) und im [F-Droid-Abschlusslauf](fdroid-build.md#lauf-am-endstand-vom-2026-10-04).

Grenzen: Alle Builds liefen auf einem Rechner, unter Windows und Debian 13.5 in WSL 2. Windows verwendete JDK 21.0.8 ohne `--streng`, Linux OpenJDK 21.0.12.1. Gradle lief mit Netz. Debug-APKs sind zwischen Arbeitskopien nicht bytegleich und gehören nicht zu N1.

### Update des gespeicherten Projekts (N4)

N4 bezieht sich auf den Projektstand im `localStorage`-Schlüssel `baremos-fristenrechner-projekt-v1` der App. Die Probe gab Kunde, Projektname und Vergabenummer mit Umlaut, Eurozeichen, Emoji und Laufmarke über das normale Formular ein. Sie las den Speicher über die Devtools der WebView und schrieb ihn nicht selbst. Vor der Installation prüften `aapt2 dump badging` und `apksigner verify --min-sdk-version 24 -Werr` Paket, Versionen, Release-Kennzeichen und die Zertifikate.

| Schritt | Android 11, API 30, WebView 83.0.4103.120 | Android 16, API 36, WebView 133.0.6943.137 |
|---|---|---|
| Laufzeit am 2026-10-04 | 00:11 bis 00:13 | 00:13 bis 00:16 |
| F1 installieren, Projekt speichern, App neu starten | Bestanden; Versionscode 100, Marke gespeichert und sichtbar, Speichertext nach Neustart identisch. | Ebenso bestanden. |
| F2 mit anderer Signatur | Mit `INSTALL_FAILED_UPDATE_INCOMPATIBLE` abgelehnt; Versionscode 100 und Speicher unverändert. | Ebenso bestanden. |
| F2 mit gleicher Signatur | Update auf Versionscode 101 bestanden; Speichertext einschließlich `gespeichertAm` identisch, Marke in den Feldern sichtbar. | Ebenso bestanden. |
| Rückschritt auf F1 | Mit `INSTALL_FAILED_VERSION_DOWNGRADE` abgelehnt; Versionscode 101 und Speicher unverändert. | Ebenso bestanden. |
| Aufräumen und Gesamturteil | Paket deinstalliert, Weiterleitungen entfernt, Emulator beendet. Snapshot-Löschung zunächst unterblieben, weil der Prozess noch in der Prozessliste stand; Gesamturteil deshalb **ungültig**. Anschließend von Hand gelöscht. | Aufräumen und Gesamturteil bestanden. |

Die Nachweisschritte vor dem Aufräumen auf API 30 sind vom Aufräumfehler nicht berührt. Die Probe wartet seitdem bis zu 30 s auf das Prozessende. Belegt ist das Update mit höherem Versionscode und derselben Signatur ohne Verlust des gespeicherten Projektstands auf Android 11 und 16, einschließlich der beiden abgelehnten Gegenproben.

Grenzen: eigene App-ID der Testfassung, Emulatoren mit `userdebug`, Installation über `adb install -r`; kein Store-Update und kein echtes Gerät. Auf diesen Abbildern sind Devtools auch für Release-Builds verfügbar. F2 unterscheidet sich von F1 nur in den nativen Versionsangaben; die Versionsanzeige des Web-Teils blieb 0.1.0. Die frühere Dateiprobe der Minimal-App ist kein zusätzlicher offener N4-Nachweis für den hier geprüften `localStorage`-Projektstand; ein Erhalt sonstiger Dateien im Datenbereich wird damit nicht behauptet.

### Übertragung der Signatur (N5)

Am 2026-10-04 um 00:08 unter Debian bestanden: `fdroidserver.common.verify_apks` übertrug die Signatur der unter Windows mit „Probe App“ signierten F1 auf die getrennt unter Linux erzeugte unsignierte F1. Rückgabe `None`, genau eine übertragene Datei, `cmp` mit Rückgabe 0: bytegleich mit der signierten Windows-Datei. `apksigner verify --min-sdk-version 24 --verbose --print-certs -Werr` bestätigte v2 und v3.

Werkzeuge: `apksigner` aus den Build-Tools 35.0.0 (Versionsausgabe 0.9), `apksigcopier` 1.1.1 aus fdroidserver 2.4.2-1 und OpenJDK 21.0.12.1. Die Gegenprobe mit einer zusätzlichen Datei `assets/public/fremd.txt` wurde abgelehnt; `apksigner` meldete „APK integrity check failed“ beziehungsweise „digest mismatch“. Die Eingaben blieben unverändert. Ein erster Lauf war wegen eines falschen Imports von `apksigcopier` im Probeskript ungültig; nach Korrektur des Imports bestand der zweite Lauf. Dies betrifft die Testfassung und die genannten lokalen Werkzeuge, keinen Buildserver von F-Droid.

## Nachweise am eingefrorenen Stand vom 2026-10-15

Die App-Eingaben entsprechen dem eingefrorenen Stand `8b17927`. Die Testfassung hat die eigene App-ID `de.baremos.fristenrechner.probe`. F1 trägt `versionCode 100` und `versionName 0.1.0`, F2 `versionCode 101` und `versionName 0.1.1`. F1 wurde nach `clean` unter Windows am Stand `6ce0c7c` mit Node.js 22.23.2 und getrennt unter Linux am Stand `97d07c2` mit Node.js 24.21.0 gebaut; F2 unter Windows. Die beiden unsignierten F1 sind bytegleich.

Am 2026-10-15 wurden außerhalb des Repositorys neue Probeschlüssel „Probe App“ und „Probe Upload“ erzeugt: RSA mit 4096 Bit, PKCS12. Beide Zertifikate nennen „Probe“ im Namen.

| Zertifikat | SHA-256-Fingerabdruck |
|---|---|
| Probe App | `5638285d8dee5851404f78545d55bc3193b31c8883f00c436ebb9626fdd6be42` |
| Probe Upload | `6f819b1a07f0cf82c2747d5bc72fc265463261910fb358580ecfc40c46f0f58b` |

Signiert wurde unter Windows mit `scripts/signing/apk-signieren.mjs`, JDK 21.0.8 und den Build-Tools 35.0.0 (`apksigner` 0.9). Alle drei signierten Dateien wurden geprüft: v2 und v3 aktiv, v1, v3.1 und v4 aus, Ausrichtung erhalten.

| Datei | Bytes | SHA-256 |
|---|---:|---|
| F1 unsigniert, Windows und Linux | 7 668 430 | `d5472cfd37a96ecdb0ea32bada63b00f8ce09c0dd4f18da1fb604081715205e0` |
| F2 unsigniert, Windows | 7 668 430 | `14990cf350eb2e981438f3dcda99f99ff583235c6acc88b63ef777682cf42e78` |
| F1, Probe App | 7 678 242 | `49151552c46ece521f6cb84ca5fa9520ca27b8edaff8edc3a740c286da06882a` |
| F2, Probe App | 7 678 242 | `ec20dda44bd8951ec66125fa36fe698d24f6b507bde7c468c88e081f1ba48476` |
| F2, Probe Upload | 7 678 242 | `0be0840042f27744e40114f7725b672876f3ef387892cf3bbb41b0338ec49a9b` |

Die neuen Probeschlüssel wurden am 2026-10-15 um 17:39 MESZ nach N5 und vor N4 gelöscht. Die anschließende Suche nach Schlüssel- und Kennwortdateien auf dem Rechner und in Debian fand keine Kopien. N4 lief danach mit den bereits signierten Dateien.

### Reproduzierbarer App-Build am eingefrorenen Stand (N1)

Die unsignierte Release-APK mit der echten App-ID war am 2026-10-15 in den getrennten Builds bytegleich: Windows nach `clean`, frische Windows-Kopie, zwei Linux-Klone und lokaler F-Droid-Lauf. Ergebnis: 7 668 430 Bytes, SHA-256 `0645663f481f8eca7d49d6fa91ea758a4443df9712777285424c2673db6f2a02`. Der Windows-Build und der F-Droid-Lauf nach der Ergänzung der Gradle-Prüfsummen am Stand `d3d432b` bestätigten dieselbe APK. Einzelheiten stehen im [Build-Nachweis](app.md#build-nachweis-am-eingefrorenen-stand-vom-2026-10-15) und im [F-Droid-Lauf](fdroid-build.md#lauf-am-eingefrorenen-stand-vom-2026-10-15).

Grenzen: Alle Builds liefen auf einem Rechner, unter Windows und Debian 13.5 in WSL 2. Windows verwendete JDK 21.0.8 ohne `--streng`, Linux OpenJDK 21.0.12.1. Die beiden Linux-Klone bauten mit `--streng --ohne-testgruppe`. Gradle lief mit Netz; die Gegenprobe ohne Netz umfasste nur Web-Build und Android-Sync. Debug-APKs gehören nicht zu N1.

### Update des gespeicherten Projekts am eingefrorenen Stand (N4)

Am 2026-10-15 bestand N4 auf beiden Emulatoren einschließlich des Aufräumens. Die Probe löste den regulären Speicherweg der App über DOM-Ereignisse aus; sie schrieb den `localStorage` nicht selbst.

| Schritt | API 30 | API 36 |
|---|---|---|
| Laufzeit am 2026-10-15, MESZ | 18:32:05 bis 18:34:49 | 18:34:50 bis 18:37:47 |
| Vorprüfung und Emulatorstart | Bestanden. | Bestanden. |
| F1 installieren und Projekt speichern | Bestanden. | Bestanden. |
| F2 mit fremder Signatur | Abgelehnt; Gegenprobe bestanden. | Abgelehnt; Gegenprobe bestanden. |
| F2 mit gleicher Signatur | Update mit erhaltenem Projekt bestanden. | Update mit erhaltenem Projekt bestanden. |
| Rückschritt auf F1 | Abgelehnt; Gegenprobe bestanden. | Abgelehnt; Gegenprobe bestanden. |
| Aufräumen | Bestanden; vorhandene fremde Installation unangetastet. | Bestanden; vorhandene fremde Installation unangetastet. |

Grenzen: eigene App-ID und Emulatoren, kein echtes Gerät und kein Store-Update. Geprüft ist der gespeicherte Projektstand im `localStorage`, nicht der Erhalt sonstiger Dateien im Datenbereich. Der Nachweis ersetzt N6 nicht.

### Übertragung der Signatur am eingefrorenen Stand (N5)

Am 2026-10-15 von 17:38 bis 17:39 MESZ bestand N5 unter Debian mit allen Schritten 0 bis 8. `verify_apks` übertrug die Signatur der unter Windows signierten F1 auf die getrennt unter Linux gebaute unsignierte F1 und gab `None` zurück. Es entstand genau eine übertragene Datei; `cmp` bestätigte mit Rückgabe 0 die Bytegleichheit mit der signierten F1. `apksigner verify --min-sdk-version 24 --verbose --print-certs -Werr` bestätigte v2 und v3. Protokollierte Werkzeuge: `apksigner` 0.9 aus den Build-Tools 35.0.0 des Projekt-SDK, `apksigcopier` 1.1.1 aus fdroidserver 2.4.2-1, OpenJDK 21.0.12.1.

Die Gegenprobe mit genau einem zusätzlichen APK-Eintrag wurde abgelehnt. Eine unabhängige Prüfung mit `apksigner` bestätigte „APK integrity check failed“ beziehungsweise „digest mismatch“. Die Prüfsummen der Originaleingaben und vorhandenen Arbeitskopien blieben unverändert.

Grenzen: Geprüft sind die Testfassung und die lokale Werkzeugkombination, kein Buildserver von F-Droid und kein Wechsel zwischen Vertriebswegen. N6 bleibt offen.

## Echter Schlüssel

Der fachlich Verantwortliche hat am 2026-10-18 beide Schlüssel nach Schritt 1 des Ablaufs erzeugt: `keytool` aus dem JDK 21, Typ PKCS12 ausdrücklich angegeben, RSA mit 4096 Bit, Signatur des Zertifikats SHA384withRSA, Gültigkeit 10958 Tage, Angaben nach S4. Die Kennwörter wurden im Dialog eingegeben; sie stehen in keiner Datei und in keinem Protokoll. Die Schlüsseldateien liegen außerhalb des Arbeitsordners (S8).

Schritt 2 ist belegt: Die exportierten Zertifikate liegen unter `docs/zertifikate/` und wurden mit `keytool -printcert` gelesen. Beide nennen Eigentümer und Aussteller `CN=BAREMOS IT Dienstleistungs GmbH, O=BAREMOS IT Dienstleistungs GmbH, L=Berlin, C=DE`, RSA mit 4096 Bit, SHA384withRSA, gültig vom 2026-10-18 bis zum 2056-10-18, also über den 22. Oktober 2033 hinaus, wie Google Play verlangt.

| Zertifikat | Datei | SHA-256 in kleinen Hexadezimalziffern (Form für `AllowedAPKSigningKeys` und `--fingerabdruck`) | SHA-256 nach `keytool` |
|---|---|---|---|
| App-Signierschlüssel | `docs/zertifikate/app-signierschluessel.cer` | `ae5d4d7ec4d3ee63763e128a3fb00721c7d164206f066dc26e8e968ff9a92e68` | `AE:5D:4D:7E:C4:D3:EE:63:76:3E:12:8A:3F:B0:07:21:C7:D1:64:20:6F:06:6D:C2:6E:8E:96:8F:F9:A9:2E:68` |
| Upload-Schlüssel, nur für Google Play | `docs/zertifikate/upload-schluessel.cer` | `8d99b272edbe6a375560a05cc3ddc7c48dc9b5e378a8685e7f9b13a09386920a` | `8D:99:B2:72:ED:BE:6A:37:55:60:A0:5C:C3:DD:C7:C4:8D:C9:B5:E3:78:A8:68:5E:7F:9B:13:A0:93:86:92:0A` |

Der Fingerabdruck des App-Signierschlüssels ist der Wert für `AllowedAPKSigningKeys` im Rezept für F-Droid, für `--fingerabdruck` beim Signieren mit `scripts/signing/apk-signieren.mjs` und für die Registrierung des Zertifikats bei der Developer Verification von Android. Der Upload-Schlüssel signiert nur das App-Bundle für Google Play. Die Sicherung nach S10 hat der fachlich Verantwortliche am 2026-10-18 angelegt; der Nachweis N3, die Wiederherstellung aus der Sicherung mit einer Probesignatur, steht aus und wird vor der ersten Veröffentlichung erbracht.

Nachtrag 2026-10-19: Das [Veröffentlichungsrezept für F-Droid](../scripts/fdroid/veroeffentlichung/de.baremos.fristenrechner.yml) verwendet den Fingerabdruck des App-Signierzertifikats in `AllowedAPKSigningKeys`; ein Test vergleicht den Eintrag mit dem berechneten SHA-256 der DER-kodierten Zertifikatsdatei.

## Geplanter Ablauf

| Schritt | Werkzeug | Wer |
|---|---|---|
| 1. Schlüssel erzeugen | `keytool -genkeypair` aus dem JDK 21, mit ausdrücklicher Angabe des Typs PKCS12 | der fachlich Verantwortliche, am eigenen Rechner |
| 2. Zertifikat prüfen und Fingerabdruck festhalten | `keytool -list -v` | der fachlich Verantwortliche. Der Fingerabdruck ist öffentlich und kommt in dieses Dokument. |
| 3. Sicherung anlegen und Wiederherstellung prüfen | Kopie, Vergleich der Prüfsummen, Probe-Signatur mit der wiederhergestellten Datei | der fachlich Verantwortliche |
| 4. Unsignierte Release-Dateien erzeugen | `scripts/android-build.mjs`, Aufgabe `assembleRelease` für die APK, Aufgabe `bundleRelease` für das AAB | Skript |
| 5. Ausrichtung der APK prüfen | `zipalign -c`. Stimmt die Ausrichtung nicht, bricht das Skript ab. Ausrichten ist dann ein eigener Schritt mit `zipalign` vor dem Signieren. | Skript |
| 6. APK signieren | `apksigner sign` mit dem App-Signierschlüssel, in der Fassung und mit der Einstellung nach S12. Die signierte Datei ist eine eigene Datei, die unsignierte bleibt erhalten. Nach dem Signieren wird die signierte Datei nicht mehr verändert. | der fachlich Verantwortliche, Kennwort im Dialog |
| 7. Signatur der APK prüfen | `apksigner verify --min-sdk-version 24 --verbose --print-certs`, Vergleich der Verfahren und des Fingerabdrucks mit diesem Dokument | Skript |
| 8. AAB signieren | `jarsigner` mit dem Upload-Schlüssel | der fachlich Verantwortliche, Kennwort im Dialog, erst in Stufe 4 |
| 9. Schlüssel bei Google Play einbringen | Play Console | der fachlich Verantwortliche, erst in Stufe 4 und vor der ersten Veröffentlichung |

Schritt 4 übernimmt `scripts/android-build.mjs`, die Schritte 5 bis 7 `scripts/signing/apk-signieren.mjs`. Das Skript nimmt den Ort der Schlüsseldatei als Angabe entgegen, speichert ihn nicht und nennt ihn in keiner eigenen Meldung. Für Meldungen von `apksigner` gilt die Zeile „Meldungen der Werkzeuge“ in der Tabelle.

Nachtrag 2026-10-19: Für die Fassung 0.2.0 (`versionCode` 200) ist das unsignierte App-Bundle am Stand `b066d5e` über `scripts/android-build.mjs` mit der Gradle-Aufgabe `bundleRelease` erzeugt (3 010 617 Bytes, SHA-256 `937657868f973901b24d8cb1b885b1713c570ee32f90ab51a96897805d515031`); die Release-APK im Ausgabeordner blieb dabei unverändert (siehe [app.md](app.md#build-nachweis-zur-fassung-020-vom-2026-10-19)). Schritt 8 führt der fachlich Verantwortliche mit `jarsigner` aus dem JDK 21 und dem Upload-Schlüssel aus (`-sigalg SHA256withRSA -digestalg SHA-256`, Kennwort im Dialog), gefolgt von `jarsigner -verify` und dem Vergleich des Zertifikats mit dem Fingerabdruck oben; Ausgeführt am 2026-10-19 um 14:10 durch den fachlich Verantwortlichen mit `jarsigner` aus dem JDK 21.0.8: Die signierte Datei hat 3 051 619 Bytes und die SHA-256 `5214692d69e5827eacbc38fc9b5b5cf68654f4a1d6544320094b0ec22ee4125f`. `jarsigner -verify -verbose:summary -certs` meldet „JAR-Datei verifiziert“, Signaturgeber `CN=BAREMOS IT Dienstleistungs GmbH, O=BAREMOS IT Dienstleistungs GmbH, L=Berlin, C=DE`, Digest SHA-256 und Signaturalgorithmus SHA256withRSA mit 4096-Bit-Schlüssel (das Zertifikat selbst trägt SHA384withRSA), dazu die bei selbstsignierten Zertifikaten üblichen Warnungen (keine Zertifikatskette, kein Zeitstempel); `keytool -printcert -jarfile` nennt den Fingerabdruck des Upload-Zertifikats aus der Tabelle oben. Die Signatur liegt in `META-INF/MANIFEST.MF`, `META-INF/FRISTENR.SF` und `META-INF/FRISTENR.RSA`; alle 425 Einträge des Bundles stimmen in Name, Größe und CRC mit der unsignierten Datei überein. Die Datei ist nicht hochgeladen; der Upload in den internen Test braucht ein eigenes Go.

```text
node scripts/signing/apk-signieren.mjs --apk <unsignierte.apk> --aus <signierte.apk> --schluessel <Datei.p12> --alias <Alias> --fingerabdruck <SHA-256 des Zertifikats>
```

| Eigenschaft des Skripts | Umsetzung |
|---|---|
| Kennwort | fragt `apksigner` im Dialog ab. Für Proben gibt es `--kennwort-datei`. Ein Kennwort als Argument gibt es nicht. Meldungen zu einem falschen Aufruf nennen nie den Wert eines Arguments. |
| Schlüssel im Repository | Eine Schlüssel- oder Kennwortdatei, die in einem Arbeitsordner des Repositorys liegt, lehnt das Skript ab. Dazu zählen der Hauptordner und jeder Worktree, die Liste liefert `git worktree list`. Gibt Git keine Auskunft, etwa in einer Kopie ohne `.git`, prüft das Skript nur den eigenen Ordner und sagt das. |
| Vorhandene Dateien | Das Skript überschreibt nichts. Die unsignierte Datei bleibt unverändert, das prüft es am Ende. Es löscht nur, was es im selben Lauf selbst angelegt hat. |
| Prüfung vor der Ausgabe | Das Skript arbeitet in einem eigenen Ordner, der für jeden Lauf neu im Temp-Ordner des Benutzers entsteht. Die Ausgabe legt es erst an, wenn Verfahren, Zahl der Signaturen, Schlüssel, Fingerabdruck und Ausrichtung stimmen. Es schreibt sie aus dem Speicher: genau die Bytes, deren Prüfsumme vor und nach der Prüfung gleich ist. Besteht die Ausgabe inzwischen, scheitert das exklusive Anlegen; diese fremde Datei bleibt unberührt. Nach erfolgreichem Anlegen entfernt das Skript die eigene Ausgabe bei einem Schreib-, Schließ- oder Prüffehler. Scheitert auch das Entfernen, nennt die Fehlermeldung die verbliebene Datei. Scheitert die Prüfung, bleibt der Ordner mit der ungeprüften Datei liegen, die Meldung nennt ihn. |
| Auswertung der Prüfung | Jedes Signaturverfahren, das `apksigner verify --min-sdk-version 24` nennt, muss bekannt sein und den festgelegten Wert haben: v1 nein, v2 ja, v3 ja, v3.1 nein, v4 nein. Ein weiteres Verfahren, eine doppelte oder eine nicht lesbare Angabe und jede Warnung lassen das Skript scheitern. Die Prüfung läuft mit `-Werr`, damit endet `apksigner verify` bei einer Warnung mit einem Fehler. Schreibt es bei bestandener Prüfung etwas auf die Fehlerausgabe, scheitert das Skript ebenfalls. |
| Meldungen der Werkzeuge | Mit `--kennwort-datei` fängt das Skript die Ausgabe von `apksigner sign` ab und gibt höchstens drei Zeilen weiter, ohne Stacktrace. Den Ort der Schlüsseldatei und der Kennwortdatei ersetzt es durch einen Platzhalter. Ohne `--kennwort-datei` fragt `apksigner` das Kennwort im Dialog ab und braucht dafür die Konsole. Seine Meldungen erscheinen dann unverändert und können den Ort der Schlüsseldatei nennen. |
| Rückgabewert | 0: signiert und geprüft. 64: falscher Aufruf, auch wenn die Ausgabe schon besteht oder ein Schlüssel im Arbeitsordner liegt. 66: Die eigene Vorprüfung erkennt eine fehlende oder falsche Eingabedatei (APK, Schlüssel, Kennwort) oder einen fehlenden oder falschen Ausgabeordner; eine eigene Pfadauflösung oder das eigene Lesen der unsignierten APK scheitert. 69: JDK oder Werkzeug fehlt. 1: alles andere, auch Fehler beim Anlegen, Schreiben oder Prüfen der Ausgabe, eine Änderung während des Laufs und jeder unerwartete Fehler. Erst von Werkzeugen bemerkte fehlende oder gesperrte Eingaben sowie ein nach der Vorprüfung entfernter oder ersetzter Ausgabeordner ergeben ebenfalls 1. Das Skript gibt selbst keinen Stacktrace aus. |
| Werkzeuge | `apksigner` und `zipalign` aus den festgelegten Build-Tools, JDK nach denselben Regeln wie beim Build. Die Suche liegt in `scripts/werkzeuge.mjs`, beide Skripte nutzen sie. Das Skript ruft `apksigner.jar` direkt auf, mit denselben Angaben zum Speicher wie die Hülle aus den Build-Tools. |
| Tests | `scripts/signing.test.mjs`, Stand 2026-09-29: 86 Fälle. 38 laufen ohne Android-Werkzeuge: Auswertung der Prüfung, Kürzung der Meldungen, Pfadprüfung und Aufruf. 48 brauchen ein JDK 21, die Build-Tools und die Plattform aus dem Projekt-SDK, sonst entfallen sie; einer davon ist nur für Windows. Sie arbeiten mit einer kleinen echten APK. Enthalten sind vier Fälle zur Bereinigung der eigenen Ausgabe (Teil-Schreibfehler nach 16 Bytes, Lesefehler, abweichende Prüfsumme, fehlgeschlagenes Entfernen), acht Fälle zur Fehlercode-Grenze sowie der bestehende Test für eine während des Laufs entstandene fremde Ausgabe. Lesesperren und Datenträgerfehler werden an den Schnittstellen simuliert. Die Tests verwenden unveränderte Skriptkopien in einer eigenen Testwurzel unter `scratchpad`; Testschlüssel liegen daneben und werden nach dem Lauf gelöscht. Git sucht dabei nicht im umgebenden Repository. |

Beobachtet am 2026-09-30 mit `apksigner` aus den Build-Tools 35.0.0: Mit der Mindest-API 30 aus dem Manifest prüft das Werkzeug v2 nicht mit und meldet `v2: false`, obwohl die APK eine v2-Signatur trägt. `--min-sdk-version 24` bezieht v2 in die Prüfung ein. Der Schalter gilt auch bei einer Prüfung von Hand; er ändert weder die Mindest-API der App noch die Signaturfestlegungen.

Die Übertragung der Signatur auf einen zweiten Build (N5) ist kein Teil dieses Skripts. Sie braucht fdroidserver und läuft unter Linux.

### Was das Skript absichert

Das Skript fängt Versehen ab. Es ist kein Schutz gegen einen Angreifer, der auf dem Rechner mit den Rechten des Benutzers arbeitet, der signiert.

| Fall | Verhalten |
|---|---|
| Die Ausgabe besteht schon oder entsteht während des Laufs | Das Skript überschreibt nichts und scheitert. |
| Die Prüfung vor dem Anlegen der Ausgabe scheitert | Unter dem Namen der Ausgabe entsteht keine Datei. |
| Schreiben, Schließen oder Prüfen der selbst neu angelegten Ausgabe scheitert | Das Skript versucht, die Datei zu schließen und zu entfernen. Scheitert das Entfernen ebenfalls, meldet es den Fehler samt Dateipfad. Der Lauf endet mit 1. |
| Die unsignierte oder die signierte Datei ändert sich während des Laufs, und die Änderung ist beim nächsten Vergleich der Prüfsummen noch da | Das Skript scheitert. |
| Ein Schlüssel oder ein Kennwort liegt in einem Arbeitsordner des Repositorys | Das Skript lehnt den Aufruf ab. |
| Vorgänge anderer Benutzer | Unter Linux und macOS ist der Arbeitsordner nur für den Benutzer zugänglich, das Skript prüft die Rechte nach dem Anlegen. Unter Windows gelten die Rechte des Temp-Ordners, das Skript prüft sie nicht. Für die Ordner der Eingabe und der Ausgabe sorgt, wer das Skript aufruft. |
| Ein Vorgang mit den Rechten desselben Benutzers tauscht die signierte Datei gezielt im Takt der Prüfung: vor der Prüfung die unsignierte, während der Prüfung die signierte, danach wieder die unsignierte | **Nicht erkannt.** Das Skript meldet Erfolg und veröffentlicht die unsignierte Datei. Der Test „Grenze“ in `scripts/signing.test.mjs` stellt den Fall nach. |
| Ausgetauschte Werkzeuge: JDK, Build-Tools, die Skripte selbst | nicht geprüft. Die Prüfsummen der Werkzeuge stehen in `docs/toolchain.md`, ihre Prüfung gehört zur Einrichtung. |

Die Grenze ist gewollt. `apksigner verify` liest eine Datei von der Platte, und wer dort mit denselben Rechten schreibt, bestimmt, was es zu lesen bekommt. Weitere Prüfsummen zu anderen Zeitpunkten ändern daran nichts. Derselbe Vorgang könnte auch die Schlüsseldatei lesen. Dagegen hilft nur die Umgebung: Signiert wird auf einem Rechner und unter einem Benutzerkonto, die der fachlich Verantwortliche kontrolliert.

Für den Ablauf folgt daraus: Die Prüfsumme aus der Meldung des Skripts wird festgehalten. Vor jeder Veröffentlichung wird die Datei, die hochgeladen wird, noch einmal mit `apksigner verify --min-sdk-version 24 --verbose --print-certs -Werr` geprüft und ihre Prüfsumme mit der festgehaltenen verglichen. Dabei gelten dieselben Anforderungen an Verfahren und Fingerabdruck wie im Skript.

## Nachweise für die Abnahme

| Nr. | Nachweis | Wie | Stand |
|---|---|---|---|
| N1 | APK reproduzierbar gebaut | zwei Builds desselben Stands in getrennten Ordnern, danach derselbe Stand unter Windows und unter Linux. Verglichen werden die unsignierten Dateien Byte für Byte. | für die App am 2026-10-15 erneut belegt: Windows nach `clean`, frische Windows-Kopie mit Node.js 22, zwei Linux-Klone und lokaler F-Droid-Lauf; Grenzen siehe [Nachweis am eingefrorenen Stand](#reproduzierbarer-app-build-am-eingefrorenen-stand-n1). |
| N2 | Zertifikat geprüft | Verfahren, Länge, Gültigkeit mit Enddatum und Angaben gegen dieses Dokument | für den Probeschlüssel am 2026-09-29 belegt. Für den echten Schlüssel am 2026-10-18 belegt, siehe [Echter Schlüssel](#echter-schlüssel). |
| N3 | Sicherung wiederhergestellt | Kopie an einem anderen Ort einlesen, damit signieren, Fingerabdruck vergleichen. Zuerst mit dem Probeschlüssel, später mit dem echten Schlüssel. | für den Probeschlüssel am 2026-09-29 belegt. Für den echten Schlüssel offen. |
| N4 | Update ohne Datenverlust | Fassung mit Versionscode n installieren, Projekt über die App im `localStorage` speichern, Fassung mit Versionscode n+1 und derselben Signatur installieren, Projekt ist unverändert vorhanden. Gegenproben: andere Signatur und Rückschritt werden abgelehnt. | am 2026-10-15 mit der Testfassung mit eigener App-ID auf API 30 und 36 erneut bestanden, einschließlich beider Gegenproben und Aufräumen; siehe [N4 am eingefrorenen Stand](#update-des-gespeicherten-projekts-am-eingefrorenen-stand-n4). |
| N5 | Signatur übertragbar | Die signierte Datei des Herausgebers und ein zweiter, getrennt erzeugter unsignierter Build desselben Stands: Signatur übertragen, danach prüfen. So geht F-Droid beim Vergleich vor. Zwei gleiche unsignierte Dateien allein schließen diesen Nachweis nicht ab. Der Nachweis hält die Fassungen der Werkzeuge zum Signieren, Übertragen und Prüfen fest und prüft genau diese Kombination, siehe S12. | am 2026-10-15 mit der Testfassung erneut bestanden, einschließlich Gegenprobe: Build-Tools 35.0.0 (`apksigner` 0.9), `apksigcopier` 1.1.1 aus fdroidserver 2.4.2-1; siehe [N5 am eingefrorenen Stand](#übertragung-der-signatur-am-eingefrorenen-stand-n5). |
| N6 | Wechsel zwischen den Vertriebswegen | Zertifikate und Folge der Schlüssel in den Dateien, die Google Play tatsächlich ausliefert, mit der Fassung für F-Droid vergleichen. Updates mit steigendem Versionscode in beiden Richtungen, ohne Datenverlust, auch auf Android 17. | offen, erst mit einem Konto bei Google Play möglich, vor der ersten Veröffentlichung |

N1 bis N5 gehören zu Stufe 2: N1 prüft die unsignierte App; N2 und N3 waren in Stufe 2 nur für die Probeschlüssel belegt, N4 und N5 für die Testfassung mit eigener App-ID. Der echte Schlüssel ist seit dem 2026-10-18 erzeugt und N2 dafür belegt; N3 bleibt vor der ersten Veröffentlichung offen. N6 gehört zu Stufe 4.

## Verlust und Missbrauch

| Fall | Folge |
|---|---|
| Upload-Schlüssel verloren oder in fremder Hand | In der Play Console lässt sich ein neuer Upload-Schlüssel eintragen. Die Signatur der App bleibt. |
| App-Signierschlüssel verloren, keine Sicherung | Der Herausgeber kann nicht mehr selbst signieren. Ist der Schlüssel schon bei Google Play eingebracht, signiert Google weiter. Ob eine aus Google Play bezogene signierte Datei für F-Droid taugt, wäre dann zu prüfen. Ist der Schlüssel noch nirgends eingebracht, ist er verloren. |
| App-Signierschlüssel in fremder Hand | Wer ihn hat, kann Dateien signieren, die Android als Update der App annimmt. Google Play kennt dafür einen Wechsel des Schlüssels. Wie er wirkt, hängt vom Signaturverfahren und von der Version von Android ab. Beim klassischen Wechsel mit dem Verfahren v3.1 verwenden Geräte ab Android 13 den neuen Schlüssel, ältere Geräte den bisherigen. |

Der Wechsel eines Schlüssels ist ein Notfall und kein Teil des gewöhnlichen Ablaufs. Er verlangt einen eigenen Nachweis für alle Vertriebswege.

## Offene Punkte

1. S1 bleibt unter Vorbehalt, bis N6 erbracht ist.
2. N4 ist für den `localStorage`-Projektstand der Testfassung auf den Testabbildern mit Android 11 und 16 am 2026-10-15 erneut belegt, siehe [Nachweis am eingefrorenen Stand](#update-des-gespeicherten-projekts-am-eingefrorenen-stand-n4). Die Datei im Datenbereich gehörte zur historischen Minimal-App-Probe und bleibt keine Voraussetzung für diesen Nachweis. Ein Store-Update mit der echten App-ID bleibt Teil von N6.
3. Klären, ob Google Play bei einem eigenen Schlüssel einen hybriden Block anfügt. Das zeigt sich erst an einer Datei, die Google Play ausliefert. Scheitert N6, sind diese Wege zu prüfen:
   - der Rückweg zur klassischen Signatur über das Recht `ROLLBACK` für K0. Ob Google Play ihn einrichtet und beibehält, ist offen.
   - eine hybride Signatur auch für die Fassung bei F-Droid. Sie braucht passende Schlüssel und einen Nachweis mit den Werkzeugen von F-Droid.
   - die signierte Datei aus der Play Console als Datei des Herausgebers für F-Droid.
   - Bleiben nur Signaturen, die nicht zueinander passen, entfällt Ziel 1. Dann nehmen Nutzer ihre Daten über den Export und den Import der Projektdatei mit. Dieser Weg wäre eigens zu beschreiben und zu prüfen.
4. Prüfen, mit welcher Version der Build-Tools `apksigner` das Verfahren v3.2 kennt.
5. Der echte Schlüssel ist am 2026-10-18 erzeugt, N2 ist belegt. N3 ist mit ihm vor der ersten Veröffentlichung zu erbringen.
6. N1 belegt Gleichheit nur für die genannten Eingaben und Umgebungen. Bei Änderungen bleiben mögliche Ursachen abweichender Builds zu prüfen: Werkzeugversionen, Zeitangaben in Archiven, Bildverarbeitung, Zeilenenden und Zahl der Prozessorkerne.

## Was nicht ins Repository gehört

Schlüsseldateien, Kennwörter, Pfade zu Schlüsseldateien, Dateien mit Zugangsdaten. `.gitignore` schließt `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `keystore.properties` und `signing.properties` aus. Das ist eine zweite Sicherung, keine Ablage: Die Dateien liegen nicht im Arbeitsordner.

Ins Repository gehören das Zertifikat und sein Fingerabdruck. Beide sind öffentlich; sie liegen unter `docs/zertifikate/` und im Abschnitt [Echter Schlüssel](#echter-schlüssel).

## Quellen

Gelesen am 2026-09-29.

| Thema | Quelle |
|---|---|
| Schlüssel, Gültigkeit, Verfahren bei Google Play, derselbe Schlüssel in mehreren Stores, Debug-Schlüssel | https://developer.android.com/studio/publish/app-signing |
| Anforderungen an die Schlüssel, Zeitpunkt der Wahl, hybrides Verfahren, Wechsel des Schlüssels, signierte Datei für andere Stores | https://support.google.com/googleplay/android-developer/answer/9842756 |
| Signaturverfahren der APK | https://source.android.com/docs/security/features/apksigning |
| Verfahren v3.1 | https://source.android.com/docs/security/features/apksigning/v3-1 |
| Verfahren v3.2 | https://source.android.com/docs/security/features/apksigning/v3-2 |
| Build und Signieren auf der Kommandozeile, AAB mit `jarsigner` | https://developer.android.com/build/building-cmdline |
| `apksigner` | https://developer.android.com/tools/apksigner |
| `keytool` im JDK 21 | https://docs.oracle.com/en/java/javase/21/docs/specs/man/keytool.html |
| Reproduzierbare Builds bei F-Droid | https://f-droid.org/docs/Reproducible_Builds/ |
| Felder `Binaries` und `AllowedAPKSigningKeys` | https://f-droid.org/docs/Build_Metadata_Reference/ |
| Developer Verification von Android (Registrierung des Zertifikats des App-Signierschlüssels), gelesen am 2026-10-16 als Zusammenfassung | https://developer.android.com/developer-verification |
