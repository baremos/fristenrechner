package de.baremos.fristenrechner.io;

import android.content.ContentResolver;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;

/** Nur intern mit dem Ergebnis des eigenen ACTION_CREATE_DOCUMENT aufrufen. */
final class DokumentZugriff {
    private final ContentResolver resolver;

    DokumentZugriff(ContentResolver resolver) { this.resolver = resolver; }

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
