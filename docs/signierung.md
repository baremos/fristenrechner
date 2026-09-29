# Signierung

Stand 2026-09-29 · Entwurf, noch nicht im Kreuz-Review · es ist kein Schlüssel erzeugt

Dieses Dokument legt fest, wie die App signiert wird. Es steht, bevor der erste Release-Build entsteht. Festlegungen trifft der fachlich Verantwortliche. Bis dahin sind alle Punkte Vorschläge.

## Warum das früh feststehen muss

Android installiert ein Update nur, wenn es mit demselben Schlüssel signiert ist wie die installierte App. Tragen die Fassungen bei Google Play und bei F-Droid verschiedene Signaturen, kann niemand von einem Weg auf den anderen wechseln, ohne die App zu deinstallieren. Dabei gehen die gespeicherten Projekte verloren. Ein falsch gewählter oder verlorener Schlüssel lässt sich nach der ersten Veröffentlichung nur schwer ersetzen.

## Ziel

1. Eine Signatur für alle Vertriebswege.
2. Der Schlüssel liegt nur beim Herausgeber und bei Google Play, soweit Google Play das verlangt.
3. Ein Verlust des Rechners führt nicht zum Verlust des Schlüssels.
4. Kein Schlüssel, kein Kennwort und keine Schlüsseldatei liegt im Repository.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| App-Signierschlüssel | Mit ihm sind die Dateien signiert, die auf dem Gerät installiert werden. Er bleibt über die Lebenszeit der App derselbe. |
| Upload-Schlüssel | Mit ihm ist signiert, was der Herausgeber bei Google Play hochlädt. Er lässt sich über die Play Console ersetzen. |
| Zertifikat | öffentlicher Teil zum Schlüssel. Es darf weitergegeben werden. |
| Fingerabdruck | SHA-256 über das Zertifikat. An ihm erkennen Stores und Prüfwerkzeuge den Schlüssel. |
| Entwicklersignatur | Signatur des Herausgebers, im Unterschied zur Signatur eines Stores |

## Vertriebswege

| Weg | Wer signiert, was der Nutzer installiert | Was für dieselbe Signatur nötig ist |
|---|---|---|
| Google Play | Google, mit dem App-Signierschlüssel, den Google verwahrt. Für neue Apps ist dieses Verfahren vorgeschrieben. | Der Herausgeber bringt seinen eigenen Schlüssel ein, statt Google einen erzeugen zu lassen. |
| F-Droid | in der Voreinstellung F-Droid, mit einem eigenen Schlüssel von F-Droid | Der Build ist reproduzierbar. F-Droid baut aus den Quellen, vergleicht mit der Datei des Herausgebers und veröffentlicht bei Übereinstimmung die Datei mit der Entwicklersignatur. |

Zu Google Play: Nach der Hilfe zur Play Console lässt sich ein eigener Schlüssel nur wählen, solange keine Version im offenen Test oder in der Produktion veröffentlicht ist. Die Voreinstellung ist ein Schlüssel, den Google erzeugt. Die Wahl fällt also beim Anlegen der App und vor der ersten Veröffentlichung.

Zu F-Droid: Das Rezept nennt mit `Binaries` den Ort der Datei des Herausgebers und mit `AllowedAPKSigningKeys` den Fingerabdruck des Zertifikats. Stimmt der Build von F-Droid nicht mit der Datei überein, veröffentlicht F-Droid diese Version nicht. Verglichen wird alles außer der Signatur.

## Vorschläge zur Festlegung

| Nr. | Thema | Vorschlag | Begründung |
|---|---|---|---|
| S1 | Zahl der Schlüssel | ein App-Signierschlüssel für alle Vertriebswege, dazu ein getrennter Upload-Schlüssel für Google Play | siehe Ziel. Geht der Upload-Schlüssel verloren, lässt er sich ersetzen, ohne dass sich die Signatur der App ändert. |
| S2 | Verfahren und Länge | RSA mit 4096 Bit, für beide Schlüssel | Google Play verlangt RSA mit mindestens 2048 Bit. Die von Google erzeugten Schlüssel haben 4096 Bit. |
| S3 | Gültigkeit des Zertifikats | 30 Jahre | Die Dokumentation von Android nennt mindestens 25 Jahre. Google Play verlangt ein Ende nach dem 22. Oktober 2033. |
| S4 | Angaben im Zertifikat | Name und Ort des Herausgebers, Land DE. Den Wortlaut legt der fachlich Verantwortliche fest. | Das Zertifikat ist öffentlich und bleibt über die Lebenszeit der App dasselbe. |
| S5 | Format der Schlüsseldatei | PKCS12, je Schlüssel eine eigene Datei | Voreinstellung von `keytool` im JDK 21. Getrennte Dateien erlauben getrennte Ablage. |
| S6 | Signaturverfahren der APK | APK Signature Scheme v2 und v3 | v2 gibt es seit Android 7.0, v3 seit Android 9. Die Mindestversion der App ist Android 7.0, das ältere Verfahren v1 ist dafür nicht nötig. |
| S7 | Ort des Signierens | außerhalb des Gradle-Builds, mit `apksigner` aus den Build-Tools 35.0.0 | Der Build erzeugt eine unsignierte Datei. Die Konfiguration des Builds enthält weder Pfad noch Kennwort. Dieselbe unsignierte Datei ist der Gegenstand des Vergleichs bei F-Droid. |
| S8 | Ablage | außerhalb des Arbeitsordners und außerhalb von Ordnern, die ein Dienst automatisch abgleicht. Der Ort steht in keiner eingecheckten Datei. | Regel 4 des Projekts |
| S9 | Kennwörter | kennt nur der fachlich Verantwortliche. Sie stehen in keiner Datei des Repositorys und in keinem Protokoll. Wer signiert, gibt das Kennwort im Dialog ein. | Regel 4 des Projekts |
| S10 | Sicherung | zwei Kopien auf getrennten Datenträgern an getrennten Orten, verschlüsselt. Die Wiederherstellung wird einmal geprüft, bevor der Schlüssel zum ersten Mal für eine Veröffentlichung verwendet wird. | Abnahmekriterium des Arbeitspakets |
| S11 | Debug-Builds | tragen den Debug-Schlüssel des Android SDK und werden nicht veröffentlicht | Der Debug-Schlüssel entsteht auf jedem Rechner neu. |

## Probe vor dem echten Schlüssel

Der technische Nachweis in Stufe 2 braucht den echten Schlüssel nicht. Vorschlag: Die Proben laufen mit einem Probeschlüssel, der nur dafür erzeugt wird.

| Punkt | Vorschlag |
|---|---|
| Kennzeichnung | Das Zertifikat nennt im Namen das Wort „Probe“. |
| Ablage | in einem Ordner außerhalb des Arbeitsordners, nicht in der Sicherung |
| Verwendung | nur für die Minimal-App und für Testfassungen mit eigener App-ID |
| Ende | Der Probeschlüssel wird nach dem Nachweis gelöscht. Er signiert nie eine veröffentlichte Datei. |

Auch der Probeschlüssel entsteht erst nach einer Freigabe.

## Geplanter Ablauf

| Schritt | Werkzeug | Wer |
|---|---|---|
| 1. Schlüssel erzeugen | `keytool -genkeypair` aus dem JDK 21 | der fachlich Verantwortliche, am eigenen Rechner |
| 2. Zertifikat prüfen und Fingerabdruck festhalten | `keytool -list -v` | der fachlich Verantwortliche. Der Fingerabdruck ist öffentlich und kommt in dieses Dokument. |
| 3. Sicherung anlegen und Wiederherstellung prüfen | Kopie, Vergleich der Prüfsummen, Probe-Signatur mit der wiederhergestellten Datei | der fachlich Verantwortliche |
| 4. Unsignierten Release-Build erzeugen | `scripts/android-build.mjs` mit der Aufgabe `assembleRelease` | Skript |
| 5. Signieren | `apksigner sign` | der fachlich Verantwortliche, Kennwort im Dialog |
| 6. Signatur prüfen | `apksigner verify --print-certs`, Vergleich mit dem festgehaltenen Fingerabdruck | Skript |
| 7. Schlüssel bei Google Play einbringen | Play Console | der fachlich Verantwortliche, erst in Stufe 4 |

Die Skripte für die Schritte 4 bis 6 entstehen unter `scripts/signing/`. Sie nehmen den Ort der Schlüsseldatei als Angabe entgegen und speichern ihn nicht.

## Nachweise für die Abnahme

| Nachweis | Wie | Stand |
|---|---|---|
| APK reproduzierbar gebaut | zwei Builds desselben Stands in getrennten Ordnern, danach derselbe Stand unter Windows und unter Linux. Verglichen werden die unsignierten Dateien Byte für Byte. | offen |
| Zertifikat geprüft | Verfahren, Länge, Gültigkeit und Angaben gegen dieses Dokument | offen |
| Sicherung wiederhergestellt | Kopie an einem anderen Ort einlesen, damit signieren, Fingerabdruck vergleichen | offen |
| Update ohne Datenverlust | Fassung mit Versionscode n installieren, ein Projekt speichern, Fassung mit Versionscode n+1 und derselben Signatur installieren, Projekt ist vorhanden. Gegenprobe: Eine Fassung mit anderer Signatur wird abgelehnt. | offen |
| Signatur übertragbar | Signatur der Datei des Herausgebers auf einen zweiten, getrennt erzeugten Build desselben Stands kopieren, danach prüfen. So geht F-Droid beim Vergleich vor. | offen |

## Verlust und Missbrauch

| Fall | Folge |
|---|---|
| Upload-Schlüssel verloren oder in fremder Hand | In der Play Console lässt sich ein neuer Upload-Schlüssel eintragen. Die Signatur der App bleibt. |
| App-Signierschlüssel verloren, keine Sicherung | Ist der Schlüssel schon bei Google Play eingebracht, signiert Google weiter, dort bleiben Updates möglich. Für F-Droid kann der Herausgeber keine Datei mit Entwicklersignatur mehr liefern. Ist der Schlüssel noch nirgends eingebracht, ist er verloren. |
| App-Signierschlüssel in fremder Hand | Wer ihn hat, kann Dateien signieren, die Android als Update der App annimmt. Google Play kennt dafür einen Wechsel des Schlüssels. Geräte ab Android 13 verwenden danach den neuen Schlüssel, ältere Geräte den alten. |

Der Wechsel eines Schlüssels ist ein Notfall und kein Teil des gewöhnlichen Ablaufs.

## Offene Punkte

1. Festlegungen S1 bis S11 durch den fachlich Verantwortlichen.
2. Freigabe für einen Probeschlüssel.
3. Die Hilfe zur Play Console beschreibt am 2026-09-29 für neue Apps ein zusätzliches Signierverfahren mit Schlüsseln, die Google erzeugt. Was das für einen eigenen Schlüssel bedeutet, ist vor Stufe 4 zu prüfen.
4. Die Mindestversion von Android kann in Arbeitspaket 2.5 steigen. S6 ändert sich dadurch nicht.
5. Ursachen für abweichende Builds, die F-Droid nennt: Versionen der Werkzeuge, Zeitangaben in Archiven, Verarbeitung von Bildern, Zeilenenden unter Windows und Linux, Zahl der Prozessorkerne. Welche davon diese App betreffen, zeigt erst der Nachweis.

## Was nicht ins Repository gehört

Schlüsseldateien, Kennwörter, Pfade zu Schlüsseldateien, Dateien mit Zugangsdaten. `.gitignore` schließt `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `keystore.properties` und `signing.properties` aus. Das ist eine zweite Sicherung, keine Ablage: Die Dateien liegen nicht im Arbeitsordner.

Ins Repository gehören das Zertifikat und sein Fingerabdruck. Beide sind öffentlich.

## Quellen

Gelesen am 2026-09-29.

| Thema | Quelle |
|---|---|
| Schlüssel, Gültigkeit, Verfahren bei Google Play, derselbe Schlüssel in mehreren Stores | https://developer.android.com/studio/publish/app-signing |
| Anforderungen an die Schlüssel, Zeitpunkt der Wahl, Wechsel des Schlüssels | https://support.google.com/googleplay/android-developer/answer/9842756 |
| Signaturverfahren der APK | https://source.android.com/docs/security/features/apksigning und https://source.android.com/docs/security/features/apksigning/v3-1 |
| Reproduzierbare Builds bei F-Droid | https://f-droid.org/docs/Reproducible_Builds/ |
| Felder `Binaries` und `AllowedAPKSigningKeys` | https://f-droid.org/docs/Build_Metadata_Reference/ |
