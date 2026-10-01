package de.baremos.fristenrechner.io;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.util.Base64;
import java.util.UUID;

/** Seriell auf dem IO-Executor; genau eine aktive Ausgabe, keine frei wählbaren Pfade. */
final class AusgabeAuftraege implements AutoCloseable {
    static final int BLOCK_BYTES = 65536;
    static final long CACHE_BYTES = 16L * 1024 * 1024;
    private static final long ALTER_MS = 24L * 60 * 60 * 1000;
    private final File cache;
    private final File export;
    private final Clock uhr;
    private SharedPreferences freigaben;
    private AusgabeAuftrag aktiv;

    enum Zustand { SCHREIBEN, ABGESCHLOSSEN, TEILEN_VORBEREITET, TEILEN_GESTARTET, BEENDET }

    static final class AusgabeAuftrag {
        final String id;
        final String name;
        final String mime;
        final long anzahlBytes;
        final File datei;
        long geschrieben;
        OutputStream stream;
        Zustand zustand = Zustand.SCHREIBEN;

        AusgabeAuftrag(String id, String name, String mime, long anzahlBytes, File datei) {
            this.id = id; this.name = name; this.mime = mime;
            this.anzahlBytes = anzahlBytes; this.datei = datei;
        }
    }

    AusgabeAuftraege(File cacheDir, Clock uhr) throws DateiablaufFehler {
        this.uhr = uhr;
        try {
            // Android darf den eigenen Cache über einen Systemalias bereitstellen.
            this.cache = cacheDir.getCanonicalFile();
            this.export = new File(cache, "export");
            pruefePfad(cache);
            if (!export.exists()) Files.createDirectory(export.toPath());
            pruefeOrdner(export);
        } catch (IOException | RuntimeException e) { throw fehler(); }
    }

    synchronized String beginnen(String name, String mime, long anzahlBytes) throws DateiablaufFehler {
        if (aktiv != null || freigaben == null) throw fehler();
        long grenze;
        String endung;
        if ("application/pdf".equals(mime)) { grenze = 2L * 1024 * 1024; endung = ".pdf"; }
        else if ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mime)) {
            grenze = 1024 * 1024; endung = ".xlsx";
        } else if ("application/json;charset=utf-8".equals(mime)) { grenze = 1024 * 1024; endung = ".json"; }
        else throw fehler();
        if (anzahlBytes <= 0) throw fehler();
        if (anzahlBytes > grenze) throw new DateiablaufFehler("zu-gross", false);
        if (name == null || name.length() > 240) throw fehler();
        // ASCII-Basename ohne Pfadtrenner, Steuerzeichen, führende Punkte oder fremde Endung.
        String basis = name.replaceAll("[^A-Za-z0-9_-]", "_");
        if (name.toLowerCase(java.util.Locale.ROOT).endsWith(endung)) {
            basis = name.substring(0, name.length() - endung.length()).replaceAll("[^A-Za-z0-9_-]", "_");
        }
        if (basis.isEmpty()) basis = "Datei";
        basis = basis.substring(0, Math.min(100, basis.length())) + endung;
        if (cacheGroesse() + anzahlBytes > CACHE_BYTES) throw new DateiablaufFehler("kein-speicher", false);
        String id = UUID.randomUUID().toString();
        File ordner = new File(export, id);
        try {
            pruefeOrdner(export);
            Files.createDirectory(ordner.toPath());
            aktiv = new AusgabeAuftrag(id, basis, mime, anzahlBytes, new File(ordner, basis));
            pruefePfad(aktiv.datei);
            aktiv.stream = Files.newOutputStream(aktiv.datei.toPath(), StandardOpenOption.CREATE_NEW,
                StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
            return id;
        } catch (IOException | RuntimeException e) {
            aktiveAuftraegeAbbrechen();
            throw fehler();
        }
    }

    synchronized void blockSchreiben(String id, long offset, String base64) throws DateiablaufFehler {
        AusgabeAuftrag a = hole(id, Zustand.SCHREIBEN);
        try {
            if (offset != a.geschrieben || base64 == null || base64.isEmpty() || base64.length() > 87384
                || base64.length() % 4 != 0) throw fehler();
            // Alphabet und Padding vor der Dekodierung prüfen, ohne rekursiven Regex.
            int padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
            int laenge = base64.length() / 4 * 3 - padding;
            if (laenge > BLOCK_BYTES) throw new DateiablaufFehler("zu-gross", false);
            for (int i = 0; i < base64.length() - padding; i++) {
                char c = base64.charAt(i);
                if (!(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/')) throw fehler();
            }
            if (laenge <= 0 || a.geschrieben + laenge > a.anzahlBytes) throw fehler();
            pruefeDatei(a);
            if (cacheGroesse() - a.geschrieben + a.anzahlBytes > CACHE_BYTES) throw new DateiablaufFehler("kein-speicher", false);
            byte[] bytes = Base64.getDecoder().decode(base64);
            if (bytes.length != laenge || !Base64.getEncoder().encodeToString(bytes).equals(base64)) throw fehler();
            a.stream.write(bytes);
            a.geschrieben += bytes.length;
        } catch (IOException | RuntimeException e) {
            aktiveAuftraegeAbbrechen();
            throw fehler();
        } catch (DateiablaufFehler e) {
            aktiveAuftraegeAbbrechen();
            throw e;
        }
    }

    synchronized void abschliessen(String id) throws DateiablaufFehler {
        AusgabeAuftrag a = hole(id, Zustand.SCHREIBEN);
        try {
            if (a.geschrieben != a.anzahlBytes) throw fehler();
            a.stream.close();
            a.stream = null;
            pruefeDatei(a);
            a.zustand = Zustand.ABGESCHLOSSEN;
        } catch (IOException | RuntimeException e) {
            aktiveAuftraegeAbbrechen(); throw fehler();
        } catch (DateiablaufFehler e) { aktiveAuftraegeAbbrechen(); throw e; }
    }

    synchronized AusgabeAuftrag holeAbgeschlossen(String id) throws DateiablaufFehler {
        AusgabeAuftrag a = hole(id, Zustand.ABGESCHLOSSEN);
        pruefeDatei(a);
        return a;
    }

    synchronized boolean hatAktivenAuftrag() { return aktiv != null; }

    synchronized File zumTeilenBereitstellen(String id) throws DateiablaufFehler {
        AusgabeAuftrag a = holeAbgeschlossen(id);
        // Vor dem Chooser persistent machen: ein Prozessende darf freigegebene Bytes nicht entfernen.
        if (!freigaben.edit().putLong(id, uhr.millis()).commit()) throw fehler();
        a.zustand = Zustand.TEILEN_VORBEREITET;
        return a.datei;
    }

    synchronized void teilenGestartet(String id, Uri uri) throws DateiablaufFehler {
        AusgabeAuftrag a = hole(id, Zustand.TEILEN_VORBEREITET);
        a.zustand = Zustand.TEILEN_GESTARTET;
        aktiv = null;
    }

    synchronized void verwerfen(String id) throws DateiablaufFehler {
        // Bereits geteilte Aufträge bleiben bis zur altersabhängigen Bereinigung bestehen.
        if (aktiv == null && gueltigeId(id) && freigaben.contains(id)) return;
        if (aktiv == null || !aktiv.id.equals(id)) throw fehler();
        aktiveAuftraegeAbbrechen();
    }

    synchronized void bereinigen(Context context) throws DateiablaufFehler {
        if (freigaben == null) freigaben = context.getSharedPreferences("dateiausgabe_freigaben", Context.MODE_PRIVATE);
        try {
            for (File ordner : kinder(export)) {
                if (aktiv != null && ordner.getName().equals(aktiv.id)) continue;
                if (!gueltigeId(ordner.getName())) throw fehler();
                pruefeOrdner(ordner);
                long zeit = freigaben.getLong(ordner.getName(), 0);
                if (zeit > 0 && (uhr.millis() < zeit || uhr.millis() - zeit < ALTER_MS)) continue;
                for (File datei : kinder(ordner)) {
                    pruefeRegulaer(datei);
                    Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".exportdateien", datei);
                    // Widerruf schlägt fehl: Datei bleibt für einen späteren Versuch erhalten.
                    context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                entferneOrdner(ordner);
                if (!freigaben.edit().remove(ordner.getName()).commit()) throw fehler();
            }
            // Auch Markierungen zu inzwischen durch Android entfernten Cachedateien entfernen.
            for (String id : freigaben.getAll().keySet()) {
                if (gueltigeId(id) && !new File(export, id).exists() && !freigaben.edit().remove(id).commit()) throw fehler();
            }
        } catch (IOException | RuntimeException e) { throw fehler(); }
    }

    synchronized void aktiveAuftraegeAbbrechen() throws DateiablaufFehler {
        AusgabeAuftrag a = aktiv;
        if (a == null) return;
        aktiv = null;
        a.zustand = Zustand.BEENDET;
        boolean fehlgeschlagen = false;
        try { if (a.stream != null) a.stream.close(); } catch (IOException e) { fehlgeschlagen = true; }
        try {
            entferneOrdner(a.datei.getParentFile());
            if (freigaben != null && !freigaben.edit().remove(a.id).commit()) fehlgeschlagen = true;
        } catch (IOException | RuntimeException e) { fehlgeschlagen = true; }
        if (fehlgeschlagen) throw fehler();
    }

    @Override public synchronized void close() throws DateiablaufFehler { aktiveAuftraegeAbbrechen(); }

    private AusgabeAuftrag hole(String id, Zustand zustand) throws DateiablaufFehler {
        if (!gueltigeId(id) || aktiv == null || !aktiv.id.equals(id) || aktiv.zustand != zustand) throw fehler();
        return aktiv;
    }

    private static boolean gueltigeId(String id) {
        return id != null && id.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    private void pruefeDatei(AusgabeAuftrag a) throws DateiablaufFehler {
        try {
            pruefeRegulaer(a.datei);
            if (Files.size(a.datei.toPath()) != a.geschrieben) throw fehler();
        } catch (IOException | RuntimeException e) { throw fehler(); }
    }

    private long cacheGroesse() throws DateiablaufFehler {
        try {
            long summe = 0;
            for (File ordner : kinder(export)) {
                if (!gueltigeId(ordner.getName())) throw fehler();
                for (File datei : kinder(ordner)) {
                    pruefeRegulaer(datei);
                    summe += Files.size(datei.toPath());
                    if (summe > CACHE_BYTES) return summe;
                }
            }
            return summe;
        } catch (IOException | RuntimeException e) { throw fehler(); }
    }

    private void pruefePfad(File datei) throws IOException {
        File absolut = datei.getAbsoluteFile();
        if (!absolut.equals(absolut.getCanonicalFile()) || !(absolut.equals(cache) || absolut.toPath().startsWith(cache.toPath()))) throw new IOException();
        for (File p = absolut; !p.equals(cache); p = p.getParentFile()) if (Files.isSymbolicLink(p.toPath())) throw new IOException();
    }

    private void pruefeOrdner(File datei) throws IOException {
        pruefePfad(datei);
        if (!Files.isDirectory(datei.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException();
    }

    private void pruefeRegulaer(File datei) throws IOException {
        pruefePfad(datei);
        if (!Files.isRegularFile(datei.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException();
    }

    private File[] kinder(File ordner) throws IOException {
        pruefeOrdner(ordner);
        File[] kinder = ordner.listFiles();
        if (kinder == null) throw new IOException();
        return kinder;
    }

    private void entferneOrdner(File ordner) throws IOException {
        for (File datei : kinder(ordner)) { pruefeRegulaer(datei); Files.delete(datei.toPath()); }
        Files.delete(ordner.toPath());
    }

    private static DateiablaufFehler fehler() { return new DateiablaufFehler("schreiben", false); }
}
