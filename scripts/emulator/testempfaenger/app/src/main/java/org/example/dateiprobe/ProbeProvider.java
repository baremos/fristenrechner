package org.example.dateiprobe;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.ParcelFileDescriptor;
import android.os.ProxyFileDescriptorCallback;
import android.os.storage.StorageManager;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import android.system.ErrnoException;
import android.system.OsConstants;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import org.json.JSONObject;

/** Kontrollierte Fremddokumente; keine Produktdaten und kein Netzwerkzugriff. */
public final class ProbeProvider extends DocumentsProvider {
    private static final int GRENZE = 1_048_576;
    // Der Stream des Dokuments „lesefehler“ scheitert erst nach FEHLER_AB Bytes. Ein kurzes
    // Lesen vor einem Fehler meldet der Kernel über FUSE als Dateiende, nicht als Fehler
    // (beobachtet 2026-10-01 auf API 30 mit einer Grenze von 64 Bytes); deshalb liegt die
    // Grenze oberhalb des Lesevorgriffs und das Dokument ist doppelt so groß.
    private static final int FEHLER_AB = 262_144;
    private static final int LESEFEHLER_BYTES = 2 * FEHLER_AB;
    // Zwei Wurzeln mit höchstens sieben Dokumenten: In der Android-Auswahl bleibt eine Zeile am
    // Ende einer langen Liste unter der Navigationsleiste und lässt sich per Tastatur nicht
    // zuverlässig fokussieren (beobachtet 2026-10-01 auf fr-api30 mit 13 Dokumenten).
    private static final String WURZEL_GRENZEN = "dateiprobe-grenzen";
    private static final String WURZEL_FEHLER = "dateiprobe-fehler";
    private static final List<String> IDS_GRENZEN = Arrays.asList("grenze", "zu-gross",
        "grenze-unbekannt", "zu-gross-unbekannt", "grenze-falsch-klein", "zu-gross-falsch-klein",
        "grenze-falsch-gross");
    private static final List<String> IDS_FEHLER = Arrays.asList("gueltig", "leer", "format", "utf8", "schema", "lesefehler");
    private static final List<String> IDS = Arrays.asList("gueltig", "grenze", "zu-gross",
        "grenze-unbekannt", "zu-gross-unbekannt", "grenze-falsch-klein", "zu-gross-falsch-klein",
        "grenze-falsch-gross", "leer", "format", "utf8", "schema", "lesefehler");
    private static final String[] ROOT_SPALTEN = { Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID,
        Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_MIME_TYPES };
    private static final String[] DOC_SPALTEN = { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_FLAGS };
    private Handler handler;

    @Override public boolean onCreate() {
        HandlerThread thread = new HandlerThread("dateiprobe-provider");
        thread.start();
        handler = new Handler(thread.getLooper());
        return true;
    }

    @Override public Cursor queryRoots(String[] projection) {
        MatrixCursor result = new MatrixCursor(projection == null ? ROOT_SPALTEN : projection);
        zeile(result, new Object[][] { { Root.COLUMN_ROOT_ID, WURZEL_GRENZEN }, { Root.COLUMN_DOCUMENT_ID, WURZEL_GRENZEN },
            { Root.COLUMN_TITLE, "Dateiprobe Grenzen" }, { Root.COLUMN_FLAGS, Root.FLAG_LOCAL_ONLY },
            { Root.COLUMN_MIME_TYPES, "application/json" } });
        zeile(result, new Object[][] { { Root.COLUMN_ROOT_ID, WURZEL_FEHLER }, { Root.COLUMN_DOCUMENT_ID, WURZEL_FEHLER },
            { Root.COLUMN_TITLE, "Dateiprobe Fehler" }, { Root.COLUMN_FLAGS, Root.FLAG_LOCAL_ONLY },
            { Root.COLUMN_MIME_TYPES, "application/json" } });
        return result;
    }

    private static List<String> kinder(String wurzel) {
        if (WURZEL_GRENZEN.equals(wurzel)) return IDS_GRENZEN;
        if (WURZEL_FEHLER.equals(wurzel)) return IDS_FEHLER;
        return null;
    }

    @Override public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException {
        MatrixCursor result = new MatrixCursor(projection == null ? DOC_SPALTEN : projection);
        dokument(result, id);
        return result;
    }

    @Override public Cursor queryChildDocuments(String parent, String[] projection, String sortOrder) throws FileNotFoundException {
        List<String> ids = kinder(parent);
        if (ids == null) throw new FileNotFoundException("Unbekannter Ordner");
        MatrixCursor result = new MatrixCursor(projection == null ? DOC_SPALTEN : projection);
        for (String id : ids) dokument(result, id);
        return result;
    }

    @Override public boolean isChildDocument(String parent, String id) {
        List<String> ids = kinder(parent);
        return ids != null && ids.contains(id);
    }

    private void dokument(MatrixCursor result, String id) throws FileNotFoundException {
        boolean wurzel = kinder(id) != null;
        byte[] inhalt = wurzel ? new byte[0] : bytes(id);
        zeile(result, new Object[][] { { Document.COLUMN_DOCUMENT_ID, id },
            { Document.COLUMN_DISPLAY_NAME, wurzel ? (WURZEL_GRENZEN.equals(id) ? "Dateiprobe Grenzen" : "Dateiprobe Fehler") : id + ".json" },
            { Document.COLUMN_MIME_TYPE, wurzel ? Document.MIME_TYPE_DIR : "application/json" },
            { Document.COLUMN_SIZE, wurzel ? null : groesse(id, inhalt.length) },
            { Document.COLUMN_FLAGS, 0 } });
    }

    private static void zeile(MatrixCursor cursor, Object[][] werte) {
        MatrixCursor.RowBuilder zeile = cursor.newRow();
        for (String spalte : cursor.getColumnNames()) {
            Object wert = null;
            for (Object[] eintrag : werte) if (spalte.equals(eintrag[0])) wert = eintrag[1];
            zeile.add(wert);
        }
    }

    private static Long groesse(String id, int laenge) {
        if (id.endsWith("unbekannt")) return null;
        if (id.endsWith("falsch-klein")) return 1L;
        if (id.endsWith("falsch-gross")) return 2L * GRENZE;
        return (long) laenge;
    }

    private byte[] bytes(String id) throws FileNotFoundException {
        if (!IDS.contains(id)) throw new FileNotFoundException("Unbekanntes Dokument");
        try {
            if ("leer".equals(id)) return new byte[0];
            if ("format".equals(id)) return "keine JSON-Datei".getBytes(StandardCharsets.UTF_8);
            if ("utf8".equals(id)) return new byte[] { (byte) 0xc3, 0x28 };
            byte[] basis = Files.readAllBytes(new File(getContext().getFilesDir(), "fixtures/basis.json").toPath());
            // Fehlt die vom Lauf gesetzte Basis, ist die Testumgebung ungültig.
            JSONObject json = new JSONObject(new String(basis, StandardCharsets.UTF_8));
            if (json.optInt("version", -1) != 1) throw new IOException("Testbasis hat keine Version 1");
            if ("schema".equals(id)) return json.put("version", 999).toString().getBytes(StandardCharsets.UTF_8);
            if (id.startsWith("grenze") || id.startsWith("zu-gross") || "lesefehler".equals(id)) {
                int ziel = "lesefehler".equals(id) ? LESEFEHLER_BYTES : id.startsWith("grenze") ? GRENZE : GRENZE + 1;
                if (basis.length >= ziel) throw new IOException("Testbasis zu groß");
                byte[] gepolstert = Arrays.copyOf(basis, ziel);
                Arrays.fill(gepolstert, basis.length, ziel, (byte) ' ');
                return gepolstert;
            }
            return basis;
        } catch (Exception e) {
            FileNotFoundException fehler = new FileNotFoundException("Testbasis nicht verfügbar: " + e.getClass().getSimpleName());
            fehler.initCause(e);
            throw fehler;
        }
    }

    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Nur lesbare Testdokumente");
        if (signal != null) signal.throwIfCanceled();
        byte[] inhalt = bytes(id);
        try {
            // Der Rohbeleg enthält genau die vom Provider angebotenen Bytes,
            // auch wenn JSONObject die unbekannte Schemafassung neu serialisiert.
            Files.write(new File(getContext().getFilesDir(), "provider.bin").toPath(), inhalt);
            JSONObject bericht = new JSONObject().put("format", 1).put("id", id).put("name", id + ".json")
                .put("angegebeneGroesse", groesse(id, inhalt.length) == null ? JSONObject.NULL : groesse(id, inhalt.length))
                .put("angeboteneBytes", inhalt.length).put("sha256", Belege.sha256(inhalt))
                .put("geleseneBytes", 0).put("streamFehler", false).put("geschlossen", false);
            Belege.schreiben(getContext(), "provider.json", bericht);
            StorageManager storage = getContext().getSystemService(StorageManager.class);
            return storage.openProxyFileDescriptor(ParcelFileDescriptor.MODE_READ_ONLY, new ProxyFileDescriptorCallback() {
                private long gelesen;
                @Override public long onGetSize() { return inhalt.length; }
                @Override public int onRead(long offset, int size, byte[] data) throws ErrnoException {
                    try {
                        if ("lesefehler".equals(id) && offset >= FEHLER_AB) {
                            bericht.put("streamFehler", true);
                            Belege.schreiben(getContext(), "provider.json", bericht);
                            throw new ErrnoException("dateiprobe", OsConstants.EIO);
                        }
                        if (offset >= inhalt.length) return 0;
                        int count = (int) Math.min(size, inhalt.length - offset);
                        if ("lesefehler".equals(id)) count = (int) Math.min(count, FEHLER_AB - offset);
                        System.arraycopy(inhalt, (int) offset, data, 0, count);
                        gelesen += count;
                        bericht.put("geleseneBytes", gelesen);
                        Belege.schreiben(getContext(), "provider.json", bericht);
                        return count;
                    } catch (ErrnoException e) { throw e; }
                    catch (Exception e) { throw new ErrnoException("dateiprobe-beleg", OsConstants.EIO); }
                }
                @Override public void onRelease() {
                    try {
                        bericht.put("geschlossen", true);
                        Belege.schreiben(getContext(), "provider.json", bericht);
                    } catch (Exception e) { /* Der letzte vollständige Rohbeleg bleibt erhalten. */ }
                }
            }, handler);
        } catch (Exception e) {
            FileNotFoundException fehler = new FileNotFoundException("Proxy-Datei nicht verfügbar: " + e.getClass().getSimpleName());
            fehler.initCause(e);
            throw fehler;
        }
    }
}
