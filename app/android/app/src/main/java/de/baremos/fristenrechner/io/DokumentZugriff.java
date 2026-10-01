package de.baremos.fristenrechner.io;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;

/** Nur intern mit dem Ergebnis der eigenen Dokumentauswahl aufrufen. */
final class DokumentZugriff {
    static final int MAX_PROJEKT_BYTES = 1_048_576;
    private final ContentResolver resolver;

    DokumentZugriff(ContentResolver resolver) { this.resolver = resolver; }

    static final class GelesenesProjekt {
        final String name;
        final String text;
        GelesenesProjekt(String name, String text) { this.name = name; this.text = text; }
    }

    GelesenesProjekt leseProjekt(Uri quelle, int maxBytes) throws DateiablaufFehler {
        if (maxBytes < 0 || Thread.currentThread().isInterrupted()) throw new DateiablaufFehler("lesen", false);
        int grenze = Math.min(maxBytes, MAX_PROJEKT_BYTES);
        try {
            byte[] bytes;
            try (InputStream eingang = resolver.openInputStream(quelle);
                 ByteArrayOutputStream ausgang = new ByteArrayOutputStream()) {
                if (eingang == null) throw new IOException();
                byte[] block = new byte[65536];
                while (ausgang.size() < grenze + 1) {
                    if (Thread.currentThread().isInterrupted()) throw new IOException();
                    int gelesen = eingang.read(block, 0, Math.min(block.length, grenze + 1 - ausgang.size()));
                    if (gelesen == -1) break;
                    if (gelesen == 0) {
                        // Auch ein Anbieter ohne Fortschritt darf keine Endlosschleife auslösen.
                        int einzelnesByte = eingang.read();
                        if (einzelnesByte == -1) break;
                        ausgang.write(einzelnesByte);
                    } else {
                        ausgang.write(block, 0, gelesen);
                    }
                }
                bytes = ausgang.toByteArray();
            }
            // Die Grenze gilt für die Datei einschließlich einer möglichen UTF-8-BOM.
            if (Thread.currentThread().isInterrupted()) throw new IOException();
            if (bytes.length > grenze) throw new DateiablaufFehler("zu-gross", false);
            int anfang = bytes.length >= 3 && (bytes[0] & 0xff) == 0xef
                && (bytes[1] & 0xff) == 0xbb && (bytes[2] & 0xff) == 0xbf ? 3 : 0;
            String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes, anfang, bytes.length - anfang)).toString();
            String name = projektName(quelle);
            if (Thread.currentThread().isInterrupted()) throw new IOException();
            return new GelesenesProjekt(name, text);
        } catch (IOException | RuntimeException e) {
            throw new DateiablaufFehler("lesen", false);
        }
    }

    private String projektName(Uri quelle) {
        try (Cursor cursor = resolver.query(quelle, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int spalte = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                String name = spalte >= 0 ? cursor.getString(spalte) : null;
                // DISPLAY_NAME ist Fremdeingabe; nie einen Pfad als Namen weitergeben.
                if (name != null && !name.trim().isEmpty() && !".".equals(name) && !"..".equals(name)
                    && name.indexOf('/') < 0 && name.indexOf('\\') < 0 && name.indexOf(':') < 0) {
                    boolean steuerzeichen = false;
                    for (int i = 0; i < name.length(); i++) {
                        if (Character.isISOControl(name.charAt(i))) { steuerzeichen = true; break; }
                    }
                    if (!steuerzeichen) return name;
                }
            }
            return "Projekt.json";
        }
    }

    void schreibeDokument(Uri ziel, File quelle) throws DateiablaufFehler {
        if (Thread.currentThread().isInterrupted()) throw new DateiablaufFehler("schreiben", false);
        try (InputStream eingang = Files.newInputStream(quelle.toPath(), LinkOption.NOFOLLOW_LINKS);
             OutputStream ausgang = resolver.openOutputStream(ziel, "wt")) {
            if (ausgang == null) throw new IOException();
            byte[] block = new byte[65536];
            int gelesen;
            while ((gelesen = eingang.read(block)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new IOException();
                ausgang.write(block, 0, gelesen);
            }
            ausgang.flush();
        } catch (IOException | RuntimeException e) {
            throw new DateiablaufFehler("schreiben", false);
        }
        // Erst nach dem Schließen beider Streams ist der Auftrag erfolgreich.
    }

    boolean entferneNeuAngelegtesDokument(Uri ziel) {
        try { return DocumentsContract.deleteDocument(resolver, ziel); }
        catch (Exception e) { return false; }
    }
}
