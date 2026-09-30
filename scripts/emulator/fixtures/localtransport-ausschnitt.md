Der TAR-Ausschnitt enthält einen unveränderten Dateieintrag aus einer
LocalTransport-Sicherung auf API 30 vom 29. September 2026: die Datei
`app_webview/Default/Local Storage/leveldb/000003.log` der Gegenprobe.
Header und Daten stammen aus der Aufzeichnung; zwei leere TAR-Endblöcke
wurden angefügt. Der Dateninhalt wurde vor der Übernahme gelesen: nur
LevelDB-Metadaten, `https://localhost`, der Schlüssel `p6-probe` und der
zufällige Prüfwert `P6WERTGEGENdoklhku3`. Es sind keine lokalen Pfade,
Benutzer- oder Rechnernamen und keine Seriennummern enthalten.

Die Tests verändern Kopien dieses Ausschnitts und verpacken ihn zusätzlich
als gzip und zlib. Diese komprimierten Varianten sind synthetische
Gegenproben; die echte LocalTransport-Datei ist unkomprimiertes TAR.
