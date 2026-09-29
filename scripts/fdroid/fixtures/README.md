# Protokolle der lokalen Probe

Ausgabe von `fdroid build --verbose` am 2026-09-29 mit fdroidserver 2.4.2
unter Debian 13.5, Minimal-App `de.baremos.fristenrechner.probe`, Version 1.0 (1),
Commit `d27fb91d6584822b4803ac30cf79f9e1049e9a38`.

Die drei vollständigen Build-Protokolle dienen als Prüfdaten. Absolute private
Pfade wurden durch `/opt/probe/lauf`, `/opt/probe/minimal-app` und
`/opt/gradlew-fdroid` ersetzt. Wortlaut, Reihenfolge, Zeitstempel und Zeilenzahlen
der Meldungen sind erhalten, einschließlich der ANSI-Farbcodes von Astro.
Vor der Übernahme wurden sie auf private Angaben
und Geheimnisse geprüft. Es werden keine Programme oder Binärdateien übernommen.

- Lauf 1: Abbruch in `set_FDroidPopen_env`, Rückgabewert von F-Droid trotzdem 0.
- Lauf 2: zehn Scannerfehler ohne `scandelete`, Rückgabewert trotzdem 0.
- Lauf 3: Build mit `scandelete` gelungen; die Bewertung der Warnungen ist eine
  zusätzliche Prüfung zum beobachteten Build-Erfolg.

Die Tests erzeugen kleine ZIP-Dateien als APK-Ersatz. Diese sind kein Nachweis
für Android-Paketformat, Signatur oder Reproduzierbarkeit der echten APK.
