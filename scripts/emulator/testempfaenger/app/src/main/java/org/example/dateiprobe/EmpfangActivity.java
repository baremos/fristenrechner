package org.example.dateiprobe;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.widget.Button;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Nur Testumgebung: eigene UID belegt Umfang und Ende der URI-Freigabe. */
public final class EmpfangActivity extends Activity {
    private static final String WIDERRUF = "org.example.dateiprobe.PRUEFE_WIDERRUF";
    private final ExecutorService io = Executors.newSingleThreadExecutor(r -> new Thread(r, "dateiprobe-empfang"));

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Button fertig = new Button(this);
        fertig.setText("Fertig");
        fertig.setOnClickListener(view -> finish());
        setContentView(fertig);
        auftrag(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        auftrag(intent);
    }

    private void auftrag(Intent intent) {
        // Jede Zustellung wird einmal und nacheinander verarbeitet. Die eigene
        // Task bleibt während der Rückkehr zur sendenden App bestehen.
        Intent kopie = new Intent(intent);
        io.execute(() -> pruefen(kopie));
    }

    @Override protected void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation") // Die typisierte Überladung fehlt auf API 30.
    private void pruefen(Intent intent) {
        String datei = WIDERRUF.equals(intent.getAction()) ? "widerruf.json" : "empfang.json";
        try {
            if (WIDERRUF.equals(intent.getAction())) {
                String text = intent.getStringExtra("uri");
                if (text == null) text = new String(Files.readAllBytes(new File(getFilesDir(), "empfang-uri.txt").toPath()), StandardCharsets.UTF_8);
                Uri uri = Uri.parse(text);
                JSONObject test = zugriff(uri, "r");
                Belege.schreiben(this, datei, new JSONObject().put("format", 1).put("uri", text)
                    .put("lesenVerweigert", test.getBoolean("verweigert")).put("pruefung", test));
            } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri == null || !"content".equals(uri.getScheme())) throw new IllegalArgumentException("Content-URI fehlt");
                ContentResolver resolver = getContentResolver();
                String name = null;
                Long angegebeneGroesse = null;
                try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int n = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int g = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (n >= 0) name = cursor.getString(n);
                        if (g >= 0 && !cursor.isNull(g)) angegebeneGroesse = cursor.getLong(g);
                    }
                }
                byte[] bytes;
                try (InputStream eingang = resolver.openInputStream(uri); ByteArrayOutputStream ausgang = new ByteArrayOutputStream()) {
                    if (eingang == null) throw new IllegalStateException("Stream fehlt");
                    byte[] block = new byte[65536];
                    int n;
                    while ((n = eingang.read(block)) != -1) {
                        if (ausgang.size() + n > 64 * 1024 * 1024) throw new IllegalStateException("Testdatei unerwartet groß");
                        ausgang.write(block, 0, n);
                    }
                    bytes = ausgang.toByteArray();
                }
                Files.write(new File(getFilesDir(), "empfang.bin").toPath(), bytes);
                Files.write(new File(getFilesDir(), "empfang-uri.txt").toPath(), uri.toString().getBytes(StandardCharsets.UTF_8));
                List<String> pfad = new ArrayList<>(uri.getPathSegments());
                if (pfad.size() < 3) throw new IllegalStateException("Unerwarteter Exportpfad");
                pfad.set(pfad.size() - 1, "nachbar.json");
                Uri.Builder nachbarBau = uri.buildUpon().path("");
                for (String teil : pfad) nachbarBau.appendPath(teil);
                Uri nachbar = nachbarBau.build();
                Uri projekt = uri.buildUpon().path("").appendPath(pfad.get(0)).appendPath("..").appendPath("..")
                    .appendPath("shared_prefs").appendPath("CapacitorStorage.xml").build();
                JSONObject schreiben = zugriff(uri, "rw");
                JSONObject nachbarTest = zugriff(nachbar, "r");
                JSONObject projektTest = zugriff(projekt, "r");
                Belege.schreiben(this, datei, new JSONObject().put("format", 1).put("uri", uri.toString())
                    .put("name", name == null ? JSONObject.NULL : name)
                    .put("mime", resolver.getType(uri)).put("intentMime", intent.getType())
                    .put("angegebeneGroesse", angegebeneGroesse == null ? JSONObject.NULL : angegebeneGroesse)
                    .put("groesse", bytes.length).put("sha256", Belege.sha256(bytes))
                    .put("schreibenVerweigert", schreiben.getBoolean("verweigert"))
                    .put("nachbarVerweigert", nachbarTest.getBoolean("verweigert"))
                    .put("projektVerweigert", projektTest.getBoolean("verweigert"))
                    .put("schreiben", schreiben).put("nachbar", nachbarTest).put("projekt", projektTest));
            } else throw new IllegalArgumentException("Unbekannte Testaktion");
        } catch (Exception fehler) {
            try { Belege.schreiben(this, datei, new JSONObject().put("format", 1)
                .put("fehler", fehler.getClass().getSimpleName()).put("meldung", String.valueOf(fehler.getMessage()))); }
            catch (Exception unbelegbar) { runOnUiThread(this::finish); }
        }
    }

    private JSONObject zugriff(Uri uri, String modus) throws Exception {
        JSONObject test = new JSONObject().put("uri", uri.toString()).put("modus", modus);
        try (ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, modus)) {
            return test.put("verweigert", false).put("geoeffnet", descriptor != null);
        } catch (SecurityException verweigert) {
            return test.put("verweigert", true).put("fehler", "SecurityException");
        } catch (Exception unklar) {
            // Eine fehlende Datei belegt keine versagte Berechtigung.
            return test.put("verweigert", false).put("fehler", unklar.getClass().getSimpleName());
        }
    }
}
