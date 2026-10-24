# R8-Regeln des Release-Builds. Nur Ergänzungen zu den Vorgaben des
# Android-Gradle-Plugins (proguard-android-optimize.txt): Die Regeln für
# Capacitor-Plugins, @PluginMethod-Methoden und Cordova-Klassen liefert das
# Modul capacitor-android als Consumer-Regeln mit; Activity und Provider
# aus dem Manifest hält das Android-Gradle-Plugin selbst; Methoden mit
# @JavascriptInterface hält die Vorgabedatei.

# Keine Umbenennung von Klassen und Methoden. Dadurch bleiben Stacktraces
# weitgehend ohne Zuordnungsdatei lesbar, die Namenssuche der Prüfung K5 in
# den DEX-Dateien findet erhaltene Klassen unter ihrem Namen, und Dritte
# können den Inhalt der APK mit dexdump nachvollziehen. Eingebetteter oder
# zusammengelegter Code erscheint nicht unter eigenem Namen. Entfernen
# ungenutzten Codes und Optimierung bleiben eingeschaltet.
-dontobfuscate

# Dateinamen und Zeilennummern für lesbare Stacktraces behalten.
-keepattributes SourceFile,LineNumberTable

# Empfehlung der F-Droid-Anleitung zu reproduzierbaren Builds für Apps mit
# kotlinx.coroutines: die beiden über META-INF/services angemeldeten Typen
# behalten. Die App ruft keine Coroutines auf; im geprüften Build entfernt R8
# die Dienstdateien selbst, die Regeln halten nur diese zwei Typen.
-keep class kotlinx.coroutines.CoroutineExceptionHandler
-keep class kotlinx.coroutines.internal.MainDispatcherFactory
