package de.baremos.fristenrechner.io;

/** Ausschließlich eigene Texte; native Ausnahmen werden weder verkettet noch protokolliert. */
final class DateiablaufFehler extends Exception {
    private final String code;
    private final boolean zielrestMoeglich;

    DateiablaufFehler(String code, boolean zielrestMoeglich) {
        super(text(code) + (zielrestMoeglich ? " Am gewählten Speicherort kann eine unvollständige Datei liegen." : ""));
        this.code = code;
        this.zielrestMoeglich = zielrestMoeglich;
    }

    String code() { return code; }
    boolean zielrestMoeglich() { return zielrestMoeglich; }

    private static String text(String code) {
        switch (code) {
            case "nicht-verfuegbar": return "Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.";
            case "kein-speicher": return "Der Zwischenspeicher für Dateien ist voll. Bitte versuchen Sie es später erneut.";
            case "zu-gross": return "Die Datei ist zu groß. Erlaubt sind höchstens 2 MiB für PDF und 1 MiB für Excel- und Projektdateien.";
            case "lesen": return "Die Datei konnte nicht gelesen werden.";
            case "schreiben": return "Die Datei konnte nicht vollständig geschrieben werden. Bitte versuchen Sie es erneut.";
            case "kein-ziel": return "Es ist keine passende App zum Speichern oder Teilen verfügbar.";
            default: throw new IllegalArgumentException("Unbekannter Fehlercode.");
        }
    }
}
