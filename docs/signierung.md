# Signierung

Stand 2026-09-29 · Entwurf, nach zwei Runden des Kreuz-Reviews überarbeitet · es ist kein Schlüssel erzeugt

Dieses Dokument legt fest, wie die App signiert wird. Es steht, bevor der erste Release-Build entsteht. Festlegungen trifft der fachlich Verantwortliche. Bis dahin sind alle Punkte Vorschläge.

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

## Vorschläge zur Festlegung

| Nr. | Thema | Vorschlag | Begründung |
|---|---|---|---|
| S1 | Zahl der Schlüssel | ein klassischer App-Signierschlüssel für alle Vertriebswege, dazu ein getrennter Upload-Schlüssel für Google Play. **Bedingt:** Die Festlegung gilt erst, wenn der Nachweis N6 erbracht ist. | siehe Ziel. Geht der Upload-Schlüssel verloren, lässt er sich ersetzen, ohne dass sich die Signatur der App ändert. |
| S2 | Verfahren und Länge | RSA mit 4096 Bit, für beide selbst erzeugten Schlüssel | Google Play verlangt für eigene Schlüssel und für den Upload-Schlüssel RSA mit mindestens 2048 Bit. Die klassischen Schlüssel, die Google erzeugt, haben 4096 Bit. |
| S3 | Gültigkeit des Zertifikats | 30 Jahre. Das Enddatum wird nach dem Erzeugen geprüft. | Die Dokumentation von Android empfiehlt mindestens 25 Jahre. Google Play verlangt ein Ende nach dem 22. Oktober 2033. |
| S4 | Angaben im Zertifikat | Name und Ort des Herausgebers, Land DE, nur Angaben, die ohnehin öffentlich sind. Den Wortlaut legt der fachlich Verantwortliche fest. | Das Zertifikat ist öffentlich und soll über die Lebenszeit der App dasselbe bleiben. |
| S5 | Format der Schlüsseldatei | PKCS12, je Schlüssel eine eigene Datei. Der Typ wird beim Erzeugen und bei jeder Verwendung ausdrücklich angegeben. | PKCS12 ist die Voreinstellung von `keytool` seit Java 9. Das Skript verlässt sich nicht auf Voreinstellungen. Getrennte Dateien erlauben getrennte Ablage. |
| S6 | Signaturverfahren der APK | APK Signature Scheme v2 und v3, ausdrücklich eingestellt: v1 aus, v2 an, v3 an, v4 aus | v2 gibt es seit Android 7.0, v3 seit Android 9. Die Mindestversion der App ist Android 7.0, das ältere Verfahren v1 ist dafür nicht nötig. Das gilt für die klassische Signatur des Herausgebers, nicht für hybride Signaturen von Google Play. |
| S7 | Ort des Signierens | außerhalb des Gradle-Builds. Die APK für F-Droid signiert `apksigner` aus den Build-Tools, das AAB für Google Play `jarsigner` aus dem JDK mit dem Upload-Schlüssel. | Der Build erzeugt unsignierte Dateien. Die Konfiguration des Builds enthält weder Pfad noch Kennwort. F-Droid empfiehlt `apksigner`, weil die Übertragung der Signatur dessen Verhalten nachbildet. `apksigner` signiert keine AAB-Dateien. |
| S8 | Ablage | außerhalb des Arbeitsordners und außerhalb von Ordnern, die ein Dienst automatisch abgleicht. Der Ort steht in keiner eingecheckten Datei. | Regel 4 des Projekts |
| S9 | Kennwörter | kennt nur der fachlich Verantwortliche. Sie stehen in keiner Datei des Repositorys, in keinem Protokoll und in keinem Aufruf. Wer signiert, gibt das Kennwort im Dialog ein. | Regel 4 des Projekts |
| S10 | Sicherung | zwei Kopien auf getrennten Datenträgern an getrennten Orten, verschlüsselt. Die Wiederherstellung des echten Schlüssels wird einmal geprüft, bevor er zum ersten Mal für eine Veröffentlichung verwendet wird. | Abnahmekriterium des Arbeitspakets |
| S11 | Debug-Builds | tragen den Debug-Schlüssel, den die Build-Werkzeuge von Android auf dem Rechner erzeugen, und werden nicht veröffentlicht | Der Debug-Schlüssel entsteht auf jedem Rechner neu. |
| S12 | Fassung von `apksigner` zum Signieren | offen, bis der Nachweis N5 vorliegt. Zu prüfen sind die Fassungen aus den Build-Tools 34.0.0 und 35.0.0. | F-Droid dokumentiert: Dateien, die `apksigner` aus den Build-Tools 34 signiert, lassen sich mit `apksigcopier` prüfen, bei neueren Fassungen scheitert das. Das Projekt baut mit den Build-Tools 35.0.0. Gebaut und signiert werden kann mit verschiedenen Fassungen. |

## Probe vor dem echten Schlüssel

Der technische Nachweis in Stufe 2 braucht den echten Schlüssel nicht. Vorschlag: Die Proben laufen mit einem Probeschlüssel, der nur dafür erzeugt wird.

| Punkt | Vorschlag |
|---|---|
| Kennzeichnung | Das Zertifikat nennt im Namen das Wort „Probe“. |
| Ablage | in einem Ordner außerhalb des Arbeitsordners |
| Sicherung | eine eigene Probesicherung, nur für die Probe der Wiederherstellung. Sie wird danach gelöscht. |
| Verwendung | nur für die Minimal-App und für Testfassungen mit eigener App-ID |
| Ende | Der Probeschlüssel wird nach dem Nachweis gelöscht. Er signiert nie eine veröffentlichte Datei. |

Auch der Probeschlüssel entsteht erst nach einer Freigabe. Die Probe der Wiederherstellung mit dem Probeschlüssel ersetzt nicht die Prüfung der Sicherung des echten Schlüssels.

## Geplanter Ablauf

| Schritt | Werkzeug | Wer |
|---|---|---|
| 1. Schlüssel erzeugen | `keytool -genkeypair` aus dem JDK 21, mit ausdrücklicher Angabe des Typs PKCS12 | der fachlich Verantwortliche, am eigenen Rechner |
| 2. Zertifikat prüfen und Fingerabdruck festhalten | `keytool -list -v` | der fachlich Verantwortliche. Der Fingerabdruck ist öffentlich und kommt in dieses Dokument. |
| 3. Sicherung anlegen und Wiederherstellung prüfen | Kopie, Vergleich der Prüfsummen, Probe-Signatur mit der wiederhergestellten Datei | der fachlich Verantwortliche |
| 4. Unsignierte Release-Dateien erzeugen | `scripts/android-build.mjs`, Aufgabe `assembleRelease` für die APK, Aufgabe `bundleRelease` für das AAB | Skript |
| 5. Ausrichtung der APK prüfen | `zipalign`. Stimmt die Ausrichtung nicht, wird sie vor dem Signieren hergestellt. | Skript |
| 6. APK signieren | `apksigner sign` mit dem App-Signierschlüssel, in der Fassung nach S12. Die signierte Datei ist eine eigene Datei, die unsignierte bleibt erhalten. Nach dem Signieren wird die signierte Datei nicht mehr verändert. | der fachlich Verantwortliche, Kennwort im Dialog |
| 7. Signatur der APK prüfen | `apksigner verify --verbose --print-certs`, Vergleich der Verfahren und des Fingerabdrucks mit diesem Dokument | Skript |
| 8. AAB signieren | `jarsigner` mit dem Upload-Schlüssel | der fachlich Verantwortliche, Kennwort im Dialog, erst in Stufe 4 |
| 9. Schlüssel bei Google Play einbringen | Play Console | der fachlich Verantwortliche, erst in Stufe 4 und vor der ersten Veröffentlichung |

Die Skripte für die Schritte 4 bis 7 entstehen unter `scripts/signing/`. Sie nehmen den Ort der Schlüsseldatei als Angabe entgegen und speichern ihn nicht.

## Nachweise für die Abnahme

| Nr. | Nachweis | Wie | Stand |
|---|---|---|---|
| N1 | APK reproduzierbar gebaut | zwei Builds desselben Stands in getrennten Ordnern, danach derselbe Stand unter Windows und unter Linux. Verglichen werden die unsignierten Dateien Byte für Byte. | für die Minimal-App am 2026-09-29 belegt, siehe `fdroid-build.md`. Für die App offen. |
| N2 | Zertifikat geprüft | Verfahren, Länge, Gültigkeit mit Enddatum und Angaben gegen dieses Dokument | offen |
| N3 | Sicherung wiederhergestellt | Kopie an einem anderen Ort einlesen, damit signieren, Fingerabdruck vergleichen. Zuerst mit dem Probeschlüssel, später mit dem echten Schlüssel. | offen |
| N4 | Update ohne Datenverlust | Fassung mit Versionscode n installieren, ein Projekt speichern, Fassung mit Versionscode n+1 und derselben Signatur installieren, Projekt ist vorhanden. Gegenprobe: Eine Fassung mit anderer Signatur wird abgelehnt. | offen |
| N5 | Signatur übertragbar | Die signierte Datei des Herausgebers und ein zweiter, getrennt erzeugter unsignierter Build desselben Stands: Signatur übertragen, danach prüfen. So geht F-Droid beim Vergleich vor. Zwei gleiche unsignierte Dateien allein schließen diesen Nachweis nicht ab. Der Nachweis hält die Fassungen der Werkzeuge zum Signieren, Übertragen und Prüfen fest und prüft genau diese Kombination, siehe S12. | offen |
| N6 | Wechsel zwischen den Vertriebswegen | Zertifikate und Folge der Schlüssel in den Dateien, die Google Play tatsächlich ausliefert, mit der Fassung für F-Droid vergleichen. Updates mit steigendem Versionscode in beiden Richtungen, ohne Datenverlust, auch auf Android 17. | offen, erst mit einem Konto bei Google Play möglich, vor der ersten Veröffentlichung |

N1 bis N5 gehören zu Stufe 2 und laufen mit dem Probeschlüssel. N6 gehört zu Stufe 4.

## Verlust und Missbrauch

| Fall | Folge |
|---|---|
| Upload-Schlüssel verloren oder in fremder Hand | In der Play Console lässt sich ein neuer Upload-Schlüssel eintragen. Die Signatur der App bleibt. |
| App-Signierschlüssel verloren, keine Sicherung | Der Herausgeber kann nicht mehr selbst signieren. Ist der Schlüssel schon bei Google Play eingebracht, signiert Google weiter. Ob eine aus Google Play bezogene signierte Datei für F-Droid taugt, wäre dann zu prüfen. Ist der Schlüssel noch nirgends eingebracht, ist er verloren. |
| App-Signierschlüssel in fremder Hand | Wer ihn hat, kann Dateien signieren, die Android als Update der App annimmt. Google Play kennt dafür einen Wechsel des Schlüssels. Wie er wirkt, hängt vom Signaturverfahren und von der Version von Android ab. Beim klassischen Wechsel mit dem Verfahren v3.1 verwenden Geräte ab Android 13 den neuen Schlüssel, ältere Geräte den bisherigen. |

Der Wechsel eines Schlüssels ist ein Notfall und kein Teil des gewöhnlichen Ablaufs. Er verlangt einen eigenen Nachweis für alle Vertriebswege.

## Offene Punkte

1. Festlegungen S1 bis S12 durch den fachlich Verantwortlichen. S1 bleibt bedingt, bis N6 erbracht ist. S12 bleibt offen, bis N5 erbracht ist.
2. Freigabe für einen Probeschlüssel.
3. Klären, ob Google Play bei einem eigenen Schlüssel einen hybriden Block anfügt. Das zeigt sich erst an einer Datei, die Google Play ausliefert. Scheitert N6, sind diese Wege zu prüfen:
   - der Rückweg zur klassischen Signatur über das Recht `ROLLBACK` für K0. Ob Google Play ihn einrichtet und beibehält, ist offen.
   - eine hybride Signatur auch für die Fassung bei F-Droid. Sie braucht passende Schlüssel und einen Nachweis mit den Werkzeugen von F-Droid.
   - die signierte Datei aus der Play Console als Datei des Herausgebers für F-Droid.
   - Bleiben nur Signaturen, die nicht zueinander passen, entfällt Ziel 1. Dann nehmen Nutzer ihre Daten über den Export und den Import der Projektdatei mit. Dieser Weg wäre eigens zu beschreiben und zu prüfen.
4. Prüfen, mit welcher Version der Build-Tools `apksigner` das Verfahren v3.2 kennt.
5. Die Mindestversion von Android kann in Arbeitspaket 2.5 steigen. S6 ändert sich dadurch nicht.
6. Ursachen für abweichende Builds, die F-Droid nennt: Versionen der Werkzeuge, Zeitangaben in Archiven, Verarbeitung von Bildern, Zeilenenden unter Windows und Linux, Zahl der Prozessorkerne. Welche davon diese App betreffen, zeigt erst der Nachweis.

## Was nicht ins Repository gehört

Schlüsseldateien, Kennwörter, Pfade zu Schlüsseldateien, Dateien mit Zugangsdaten. `.gitignore` schließt `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `keystore.properties` und `signing.properties` aus. Das ist eine zweite Sicherung, keine Ablage: Die Dateien liegen nicht im Arbeitsordner.

Ins Repository gehören das Zertifikat und sein Fingerabdruck. Beide sind öffentlich.

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
