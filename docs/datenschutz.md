# Datenschutz

## Verarbeitung und Zwecke

Der Fristenrechner verarbeitet Ihre Eingaben, um Termine und Fristen eines Vergabeverfahrens zu berechnen. Dazu gehören die gewählte Vergabeordnung und Verfahrensart, das Bundesland, Datumsangaben, Fristen und weitere Berechnungsoptionen. Freiwillige Angaben zu Kunde oder Auftraggeber, Projektname und Vergabenummer dienen der Zuordnung Ihres Projekts und erscheinen auch in den Ausgaben.

Die Berechnung und die Erzeugung von Projektdateien, Excel-Dateien und PDF erfolgen in der App auf dem Gerät. Die App hat keine Konten, keine Anmeldung, keine Werbung, kein Tracking und keine Analysefunktion. Sie hat keine Berechtigung für den Internetzugriff und sendet Ihre Eingaben nicht selbst an BAREMOS IT oder an einen eigenen Server.

## Automatischer Projektspeicher

Die App speichert den aktuellen Projektstand im lokalen Speicher ihrer WebView. Dazu gehören Ihre Eingaben und Angaben zum Speicherzeitpunkt und zum Regelstand. Bei erneutem Start liest sie diesen Stand wieder ein. Es gibt dort einen aktuellen Projektstand, kein Archiv früherer Fassungen.

Änderungen an Eingaben werden nach einer kurzen Pause gespeichert, wenn ein Bekanntmachungs- oder Versanddatum eingetragen ist. Auch beim Berechnen, beim Übernehmen einer Projektdatei und beim Zurücksetzen wird der Projektstand gespeichert. Ein Abbruch vor dem abgeschlossenen Speichern kann die letzten Änderungen verlieren. Bei einem Speicherfehler zeigt die App eine Meldung. Der automatische Projektspeicher ersetzt keine selbst gesicherte Projektdatei.

## Sicherung und Gerätewechsel

Die Android-Konfiguration der App schließt ihre Daten von der automatischen Cloud-Sicherung und der Übertragung auf ein anderes Gerät aus. Die Ausschlüsse sind in den gebauten APKs geprüft. Auf den Emulatoren mit Android 11 und Android 16 wurden keine App-Daten in die geprüfte Systemsicherung übernommen; der Gerätewechsel wurde im Emulator mit Android 16 geprüft.

Das belegt nicht das Verhalten jedes Herstellers, Geräts oder Übertragungsprogramms. Für die eigene Sicherung und den Gerätewechsel können Sie eine Projektdatei exportieren und auf dem Zielgerät importieren. Selbst gespeicherte oder geteilte Dateien unterliegen den Regeln des gewählten Speicheranbieters oder Empfängers.

## Import

Mit „Projekt importieren“ wählen Sie eine JSON-Projektdatei in der Dateiauswahl von Android. Die App liest nur die ausgewählte Datei und übernimmt keine dauerhafte Zugriffsberechtigung auf diese Datei oder ein Verzeichnis. Die Dateigröße ist auf 1 MiB begrenzt. Zeichenkodierung, Projektformat und Inhalt werden geprüft; ungültige oder zu große Dateien werden nicht als Projekt übernommen.

Ein erfolgreicher Import ersetzt die aktuellen Eingaben. Die App versucht anschließend, diesen Stand automatisch zu speichern. Scheitert das Speichern, weist sie darauf hin, dass das Projekt geöffnet ist und zur Sicherung exportiert werden sollte. Die ausgewählte Quelldatei wird durch den Import nicht verändert. Ein Abbruch der Auswahl erhält das bisherige Projekt.

Android kann Dateien über verschiedene Anbieter bereitstellen. Ein solcher Anbieter kann für die Bereitstellung selbst eine Netzwerkverbindung verwenden. Die fehlende Internetberechtigung des Fristenrechners verhindert das nicht.

## Speichern unter

Mit „Projekt exportieren“, „Excel exportieren“ oder „PDF exportieren“ öffnen Sie die Auswahl zum Speichern von Android. Im Menü „Dateiaktionen“ heißen diese Aktionen „Projekt speichern unter“, „Excel speichern“ und „PDF speichern“. Sie bestimmen den Anbieter, den Speicherort und den Dateinamen. Die Projektdatei enthält die Eingaben sowie Angaben zum Speicherzeitpunkt und Regelstand; Excel und PDF enthalten den berechneten Terminplan mit Projektangaben und Regelstand.

Die App meldet den Speichervorgang erst nach dem Schreiben und Schließen der Datei als erfolgreich. Bei einem Fehler kann am gewählten Speicherort eine unvollständige Datei verbleiben; die App weist darauf hin, wenn sie einen solchen Rest nicht entfernen konnte. Sie prüft nicht, ob der Anbieter die Datei anschließend synchronisiert oder weitere Kopien anlegt. Gespeicherte Dateien verwalten und löschen Sie beim gewählten Anbieter.

## Teilen und temporäre Dateien

„Projekt teilen“, „Excel teilen“ und „PDF teilen“ stellen die jeweilige Datei über die Auswahl von Android bereit. Die Meldung „zum Teilen bereitgestellt“ bestätigt keinen Versand und keinen erfolgreichen Empfang. Sie wählen die Ziel-App und bestimmen dort die weiteren Schritte.

Für Dateiaktionen erzeugt die App vorübergehende Dateien in ihrem eigenen Cache. Beim Teilen vergibt sie Leserechte für die konkrete bereitgestellte Datei. Der Empfänger erhält dadurch keine allgemeine Freigabe für den Projektspeicher oder andere Dateien der App. Die App merkt sich für die Bereinigung zufällige Dateikennungen und Bereitstellungszeiten.

Beim Start, vor einer neuen Ausgabe und vor einem weiteren Teilen prüft die App diesen Cache. Für mindestens 24 Stunden alte Bereitstellungen versucht sie, die Lesefreigabe zu widerrufen und die Datei zu entfernen. Maßgeblich ist die Gerätezeit. Es gibt keinen Hintergrundtimer und keine Zusage einer Löschung genau nach 24 Stunden. Nicht bereitgestellte Reste werden beim nächsten Start bereinigt. Android kann Cachedateien schon früher entfernen.

Eine Ziel-App kann eine eigene Kopie anlegen oder die Datei weitergeben. Ein Widerruf entfernt solche Kopien nicht und beendet keinen beim Empfänger bereits geöffneten Dateizugriff. Aufbewahrung, Übertragung und Löschung beim Empfänger richten sich nach dessen Verhalten und Einstellungen.

## Zurücksetzen und Löschen

„Neues Projekt“ fragt nach Ihrer Bestätigung und legt nach „Zurücksetzen“ ein neues, leeres Projekt mit den Vorgabewerten an. „Abbrechen“ und die Zurück-Taste erhalten das bisherige Projekt. Das Zurücksetzen löscht weder selbst gespeicherte Dateien noch Empfängerkopien und löst keine sofortige Löschung bereits zum Teilen bereitgestellter Cachedateien aus.

Das Löschen der App-Daten in Android entfernt den lokalen Projektstand; dies wurde im Emulator geprüft. Auch eine Deinstallation ist kein Sicherungsweg: Exportieren Sie benötigte Projekte vorher. Dateien an selbst gewählten Speicherorten und Kopien bei Empfängern müssen Sie dort gesondert löschen. Die App bietet keine Funktion zur sicheren, unwiederbringlichen Löschung auf dem Speichermedium.

## Abgrenzung zum Betriebssystem

Die Angaben zum fehlenden Internetzugriff beziehen sich auf den Fristenrechner. Android, die System-WebView, Dokumentanbieter und gewählte Ziel-Apps sind davon zu unterscheiden. Deren Verarbeitung und Netzwerkverkehr werden durch die App nicht allgemein gesteuert. Durch die von Ihnen veranlasste Dateiauswahl, Speicherung oder Weitergabe können Daten auch außerhalb des Geräts verarbeitet werden.

Die bisherigen Laufzeitprüfungen fanden auf Emulatoren mit Android 11 und Android 16 sowie auf einem Gerät mit Android 16 statt. Auf dem Gerät wurden der Start der App sowie Speichern, Teilen, Import und Zurücksetzen in einzelnen Abläufen geprüft. Netzwerkverkehr, Sicherung, Gerätewechsel und das Löschen der App-Daten wurden nur im Emulator geprüft. Diese Prüfungen ersetzen keine Prüfung aller Herstellergeräte, Dokumentanbieter und Ziel-Apps. Insbesondere verzögertes Lesen durch Empfänger, voller Speicher sowie Schreib- und Schließfehler sind damit nicht für alle Umgebungen nachgewiesen.

## Stand und Verantwortlichkeit

Stand: 12. Oktober 2026, App-Version 0.1.0. Es gibt noch keine Veröffentlichung dieser App.

Herausgeber: BAREMOS IT GmbH, Berlin. Verantwortlich: Andreas Schmidt.
