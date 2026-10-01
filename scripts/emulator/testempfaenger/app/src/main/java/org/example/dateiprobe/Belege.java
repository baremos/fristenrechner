package org.example.dateiprobe;

import android.content.Context;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.json.JSONObject;

final class Belege {
    private Belege() { }

    static String sha256(byte[] bytes) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder text = new StringBuilder();
            for (byte b : hash) text.append(String.format(java.util.Locale.ROOT, "%02x", b & 0xff));
            return text.toString();
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    static synchronized void schreiben(Context context, String name, JSONObject beleg) throws IOException {
        File ziel = new File(context.getFilesDir(), name);
        File temp = new File(context.getFilesDir(), name + ".tmp");
        Files.write(temp.toPath(), (beleg.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        Files.move(temp.toPath(), ziel.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
}
