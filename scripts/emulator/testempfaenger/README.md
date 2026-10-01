# Dateiprobe für den Emulator

Die separate Test-App `org.example.dateiprobe` gehört ausschließlich zur
Emulatorumgebung. Der Variantenbau kopiert dieses Projekt und die vorhandenen
AGP-/SDK-Einstellungen in den Ausgabeordner, verwendet den vorhandenen
Gradle-Cache offline und signiert mit dem Debugschlüssel des Laufs. Java 17,
Mindest-API 30; keine Bibliotheksabhängigkeiten und keine angeforderten
Berechtigungen. `MANAGE_DOCUMENTS` schützt den exportierten Provider vor
direktem Zugriff; die App fordert diese Systemberechtigung nicht an.

Der Empfänger `.EmpfangActivity` nimmt `ACTION_SEND` für JSON, XLSX und PDF
entgegen. Seine einzige Oberfläche ist die Bestätigung „Fertig“. Der Empfänger
läuft mit `singleTask` in einer eigenen Task. Die Rückkehr zur sendenden App
entfernt ihn deshalb nicht aus deren Activity-Stapel. Neue Intents werden
über `onNewIntent` nacheinander verarbeitet. Unter
`files/empfang.bin` liegen die vollständig gelesenen Bytes, unter
`files/empfang.json` deren Name, MIME-Typ, tatsächliche Größe, SHA-256 und die
Zugriffsproben. Nur eine `SecurityException` zählt als versagte Berechtigung;
eine nicht gefundene Datei genügt dafür nicht. Die Schreibprobe öffnet mit
`rw`, damit eine fehlerhaft erteilte Schreibfreigabe keine Datei kürzt.

Ein expliziter Activity-Start mit der Aktion
`org.example.dateiprobe.PRUEFE_WIDERRUF` ohne URI-Freigabeflags prüft einen
erneuten Lesezugriff. Das String-Extra `uri` wählt eine frühere URI; ohne Extra
wird die zuletzt empfangene URI verwendet. `files/widerruf.json` enthält den
Befund. Für den Bereinigungsnachweis hält der Lauf die Empfänger-Task offen,
belegt zuerst einen noch erlaubten Zugriff, löst die Bereinigung aus und
prüft dieselbe URI erneut. So wird das Ende einer Activity-Freigabe nicht
mit einem Widerruf durch die Produkt-App verwechselt.

Der `DocumentsProvider` erscheint mit der Authority
`org.example.dateiprobe.dokumente` als zwei Wurzeln: „Dateiprobe Grenzen“ mit
den sieben Dokumenten zu `grenze` und `zu-gross`, „Dateiprobe Fehler“ mit
`gueltig`, `leer`, `format`, `utf8`, `schema` und `lesefehler`. Beide Listen
passen ohne Rollen auf den Bildschirm der Testabbilder: Eine Zeile am Ende
einer langen Liste bleibt unter der Navigationsleiste und lässt sich per
Tastatur nicht zuverlässig fokussieren (beobachtet 2026-10-01 auf fr-api30). Der Lauf muss vorher eine selbst erzeugte,
gültige UTF-8-Projektdatei nach `files/fixtures/basis.json` übertragen. Sie
muss `version: 1` enthalten. Eine fehlende oder ungültige Basis macht die
Testumgebung ungültig. Mehrbytezeichen stammen bereits aus dieser Basis.

| Dokument-ID, Dateiname jeweils mit `.json` | Bytes und Metadaten |
| --- | --- |
| `gueltig` | unveränderte Basis |
| `grenze`, `zu-gross` | Basis plus JSON-Leerraum auf 1 048 576 bzw. 1 048 577 Bytes |
| `grenze-unbekannt`, `zu-gross-unbekannt` | dieselben Bytes, `_size` ist `null` |
| `grenze-falsch-klein`, `zu-gross-falsch-klein` | dieselben Bytes, `_size` ist 1 |
| `grenze-falsch-gross` | 1 048 576 Bytes, `_size` ist 2 097 152 |
| `leer` | null Bytes |
| `format` | kein JSON |
| `utf8` | ungültige UTF-8-Folge |
| `schema` | Basis mit `version: 999` |
| `lesefehler` | Basis plus JSON-Leerraum auf 524 288 Bytes, Streamfehler `EIO` ab 262 144 Bytes (ein kurzes Lesen vor dem Fehler meldet der Kernel über FUSE als Dateiende; die Grenze liegt deshalb über dem Lesevorgriff) |

Alle Streams verwenden `StorageManager.openProxyFileDescriptor` und einen
`ProxyFileDescriptorCallback`. So ist der Lesefehler ein Fehler des Streams
und kein vorgetäuschter Formatfehler. `files/provider.json` enthält die
letzte Öffnung mit angebotenen Bytes, SHA-256, gemeldeter Größe, tatsächlich
vom Betriebssystem angeforderten Bytes, Fehler- und Schließzustand. Die
vollständigen angebotenen Rohbytes liegen unter `files/provider.bin`. Die
Bytezahl des Providers kann wegen Betriebssystem-Lesevorgriffen größer sein
als die von der Produkt-App gelesene Bytezahl; sie ersetzt keinen Nachweis
der Grenze im Produktleser.

Die Rohbelege sind per `run-as org.example.dateiprobe` lesbar. Die Test-App
wird nur während der Dateiphase installiert und danach deinstalliert. Keine
ihrer Klassen wird in die Produkt-App kopiert.
