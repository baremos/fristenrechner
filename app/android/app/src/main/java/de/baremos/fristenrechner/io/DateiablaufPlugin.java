package de.baremos.fristenrechner.io;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import de.baremos.fristenrechner.R;
import java.io.File;
import java.time.Clock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/** Native Dateiabläufe und Bestätigung. Jeder öffentliche Aufruf hat genau einen Abschluss. */
@CapacitorPlugin(name = "Dateiablauf")
public final class DateiablaufPlugin extends Plugin {
    private final Object sperre = new Object();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private AusgabeAuftraege auftraege;
    private DokumentZugriff dokumente;
    private volatile boolean zerstoert;
    private volatile Thread arbeiter;
    private long generation;
    private Aufruf laufend;
    private Context kontext;
    private boolean chooserOffen;
    private boolean chooserHatPause;
    private AlertDialog bestaetigungDialog;

    private static final class Aufruf {
        final PluginCall call;
        final long generation;
        boolean wartet;
        String auftragId;
        Aufruf(PluginCall call, long generation) { this.call = call; this.generation = generation; }
    }

    @FunctionalInterface private interface IoAktion { void ausfuehren() throws DateiablaufFehler; }

    @Override public void load() {
        kontext = getContext().getApplicationContext();
        // Initialisierung vor jedem Benutzerauftrag in derselben Warteschlange.
        io.execute(() -> {
            try {
                auftraege = new AusgabeAuftraege(kontext.getCacheDir(), Clock.systemUTC());
                auftraege.bereinigen(kontext);
                dokumente = new DokumentZugriff(kontext.getContentResolver());
            } catch (DateiablaufFehler | RuntimeException e) {
                auftraege = null;
                dokumente = null;
            }
        });
    }

    @PluginMethod public void ausgabeBeginnen(PluginCall call) {
        aufIoThread(call, () -> {
            // Ein voller, inzwischen abgelaufener Cache darf den nächsten Teilen-Auftrag
            // nicht schon vor dessen Anlage blockieren. Frische Freigaben bleiben erhalten.
            auftraege.bereinigen(kontext);
            String id = auftraege.beginnen(call.getString("name"), call.getString("mime"), zahl(call, "anzahlBytes"));
            erledigt(call, new JSObject().put("auftragId", id));
        });
    }

    @PluginMethod public void ausgabeBlock(PluginCall call) {
        aufIoThread(call, () -> {
            auftraege.blockSchreiben(call.getString("auftragId"), zahl(call, "offset"), call.getString("base64"));
            erledigt(call, new JSObject());
        });
    }

    @PluginMethod public void ausgabeAbschliessen(PluginCall call) {
        aufIoThread(call, () -> {
            auftraege.abschliessen(call.getString("auftragId"));
            erledigt(call, new JSObject());
        });
    }

    @PluginMethod public void ausgabeVerwerfen(PluginCall call) {
        aufIoThread(call, () -> {
            auftraege.verwerfen(call.getString("auftragId"));
            erledigt(call, new JSObject());
        });
    }

    @PluginMethod public void speichernUnter(PluginCall call) {
        aufIoThread(call, () -> {
            nurKennung(call);
            AusgabeAuftraege.AusgabeAuftrag a = auftraege.holeAbgeschlossen(call.getString("auftragId"));
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(androidMime(a.mime));
            intent.putExtra(Intent.EXTRA_TITLE, a.name);
            synchronized (sperre) {
                if (!istLebenderAufruf(call, "speichernUnter")) return;
                laufend.auftragId = a.id;
            }
            getBridge().executeOnMainThread(() -> {
                synchronized (sperre) {
                    if (!istLebenderAufruf(call, "speichernUnter")) return;
                    try {
                        if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) throw new IllegalStateException();
                        laufend.wartet = true;
                        startActivityForResult(call, intent, "nachSpeichernUnter");
                    } catch (RuntimeException e) {
                        laufend.wartet = false;
                        fortsetzen(call, () -> { auftraege.verwerfen(a.id); throw new DateiablaufFehler("kein-ziel", false); });
                    }
                }
            });
        });
    }

    @ActivityCallback private void nachSpeichernUnter(PluginCall call, ActivityResult result) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, "speichernUnter") || !laufend.wartet) return;
            laufend.wartet = false; // Doppelte Rückgabe derselben Auswahl wird ignoriert.
            String id = laufend.auftragId;
            fortsetzen(call, () -> {
                if (result != null && result.getResultCode() == Activity.RESULT_CANCELED) {
                    auftraege.verwerfen(id);
                    erledigt(call, new JSObject().put("status", "abgebrochen"));
                    return;
                }
                Uri ziel = result != null && result.getResultCode() == Activity.RESULT_OK && result.getData() != null
                    ? result.getData().getData() : null;
                if (ziel == null || !"content".equals(ziel.getScheme())) {
                    auftraege.verwerfen(id);
                    throw new DateiablaufFehler("schreiben", false);
                }
                // Herkunft ist nur für die noch lebende eigene CREATE_DOCUMENT-Auswahl belegt.
                try {
                    File quelle = auftraege.holeAbgeschlossen(id).datei;
                    dokumente.schreibeDokument(ziel, quelle);
                    boolean verloren;
                    synchronized (sperre) {
                        verloren = !istLebenderAufruf(call, "speichernUnter");
                        if (!verloren) {
                            erledigt(call, new JSObject().put("status", "ok"));
                        }
                    }
                    if (verloren) dokumente.entferneNeuAngelegtesDokument(ziel);
                } catch (DateiablaufFehler | RuntimeException e) {
                    boolean entfernt = dokumente.entferneNeuAngelegtesDokument(ziel);
                    throw new DateiablaufFehler("schreiben", !entfernt);
                } finally {
                    try { auftraege.verwerfen(id); }
                    catch (DateiablaufFehler e) { /* Zielergebnis erhalten; Cache beim nächsten Start bereinigen. */ }
                }
            });
        }
    }

    @PluginMethod public void projektWaehlen(PluginCall call) {
        aufIoThread(call, () -> {
            ohneFelder(call, "lesen");
            if (auftraege.hatAktivenAuftrag()) throw new DateiablaufFehler("nicht-verfuegbar", false);
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            getBridge().executeOnMainThread(() -> {
                synchronized (sperre) {
                    if (!istLebenderAufruf(call, "projektWaehlen")) return;
                    try {
                        if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) throw new IllegalStateException();
                        laufend.wartet = true;
                        startActivityForResult(call, intent, "nachProjektWaehlen");
                    } catch (RuntimeException e) {
                        laufend.wartet = false;
                        // Die Auswahl ist nicht verfügbar; der Text zu kein-ziel betrifft die Ausgabe.
                        gescheitert(call, new DateiablaufFehler("nicht-verfuegbar", false));
                    }
                }
            });
        });
    }

    @ActivityCallback private void nachProjektWaehlen(PluginCall call, ActivityResult result) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, "projektWaehlen") || !laufend.wartet) return;
            laufend.wartet = false;
            fortsetzen(call, () -> {
                if (result != null && result.getResultCode() == Activity.RESULT_CANCELED) {
                    erledigt(call, new JSObject().put("status", "abgebrochen"));
                    return;
                }
                Uri quelle = result != null && result.getResultCode() == Activity.RESULT_OK && result.getData() != null
                    ? result.getData().getData() : null;
                if (quelle == null || !"content".equals(quelle.getScheme())) throw new DateiablaufFehler("lesen", false);
                DokumentZugriff.GelesenesProjekt projekt = dokumente.leseProjekt(quelle, DokumentZugriff.MAX_PROJEKT_BYTES);
                erledigt(call, new JSObject().put("status", "ok").put("name", projekt.name).put("text", projekt.text));
            });
        }
    }

    @PluginMethod public void zuruecksetzenBestaetigen(PluginCall call) {
        aufIoThread(call, () -> {
            ohneFelder(call, "nicht-verfuegbar");
            if (auftraege.hatAktivenAuftrag()) throw new DateiablaufFehler("nicht-verfuegbar", false);
            getBridge().executeOnMainThread(() -> zeigeZuruecksetzenDialog(call));
        });
    }

    private void zeigeZuruecksetzenDialog(PluginCall call) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, "zuruecksetzenBestaetigen")) return;
            try {
                if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) throw new IllegalStateException();
                AlertDialog dialog = new AlertDialog.Builder(getActivity())
                    .setMessage(R.string.projekt_zuruecksetzen_frage)
                    .setNegativeButton(R.string.projekt_zuruecksetzen_abbrechen, (auswahl, taste) -> bestaetigungBeenden(call, false))
                    .setPositiveButton(R.string.projekt_zuruecksetzen_bestaetigen, (auswahl, taste) -> bestaetigungBeenden(call, true))
                    .setCancelable(true)
                    .create();
                bestaetigungDialog = dialog;
                dialog.setOnCancelListener(auswahl -> bestaetigungBeenden(call, false));
                dialog.setOnDismissListener(auswahl -> bestaetigungBeenden(call, false));
                dialog.show();
                dialog.getButton(DialogInterface.BUTTON_NEGATIVE).setFocusableInTouchMode(true);
                dialog.getButton(DialogInterface.BUTTON_NEGATIVE).requestFocus();
            } catch (RuntimeException e) {
                // Ein nicht anzeigbarer Dialog ist keine belegte Bestätigung.
                bestaetigungBeenden(call, false);
            }
        }
    }

    private void bestaetigungBeenden(PluginCall call, boolean bestaetigt) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, "zuruecksetzenBestaetigen")) return;
            AlertDialog dialog = bestaetigungDialog;
            bestaetigungDialog = null;
            erledigt(call, new JSObject().put("bestaetigt", bestaetigt));
            // Der Aufruf ist bereits beendet; OnDismiss und OnCancel bleiben idempotent.
            if (dialog != null) {
                try { dialog.dismiss(); }
                catch (RuntimeException e) { /* Activity bereits abgebaut; keine zweite Rückgabe. */ }
            }
        }
    }

    @PluginMethod public void teilen(PluginCall call) {
        aufIoThread(call, () -> {
            nurKennung(call);
            String id = call.getString("auftragId");
            AusgabeAuftraege.AusgabeAuftrag a = auftraege.holeAbgeschlossen(id);
            try {
                auftraege.bereinigen(kontext);
                File datei = auftraege.zumTeilenBereitstellen(id);
                final Uri uri;
                try { uri = FileProvider.getUriForFile(kontext, kontext.getPackageName() + ".exportdateien", datei); }
                catch (RuntimeException e) { auftraege.verwerfen(id); throw new DateiablaufFehler("kein-ziel", false); }
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType(androidMime(a.mime));
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                ClipData clip = ClipData.newRawUri("", uri);
                intent.setClipData(clip);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                // Android ab 10 blendet diesen Titel aus, also auch alle unterstützten Versionen.
                // Die feste Ressource bleibt als deklarierter Titel der Auswahl erhalten.
                Intent chooser = Intent.createChooser(intent, getContext().getString(R.string.datei_teilen_titel));
                chooser.setClipData(clip);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getBridge().executeOnMainThread(() -> {
                    synchronized (sperre) {
                        if (!istLebenderAufruf(call, "teilen")) return;
                        try {
                            if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) throw new IllegalStateException();
                            chooserOffen = true;
                            chooserHatPause = false;
                            getActivity().startActivity(chooser);
                            // Nur Zustandswechsel, kein IO auf dem UI-Thread; atomar gegenüber Destroy.
                            auftraege.teilenGestartet(id, uri);
                            erledigt(call, new JSObject().put("status", "bereitgestellt"));
                        } catch (DateiablaufFehler | RuntimeException e) {
                            chooserOffen = false;
                            fortsetzen(call, () -> {
                                try { kontext.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                                finally { auftraege.verwerfen(id); }
                                throw new DateiablaufFehler("kein-ziel", false);
                            });
                        }
                    }
                });
            } catch (DateiablaufFehler | RuntimeException e) {
                try { auftraege.verwerfen(id); } catch (DateiablaufFehler ignoriert) { /* Startbereinigung. */ }
                if (e instanceof DateiablaufFehler) throw (DateiablaufFehler) e;
                throw new DateiablaufFehler("kein-ziel", false);
            }
        });
    }

    private static String androidMime(String mime) {
        return "application/json;charset=utf-8".equals(mime) ? "application/json" : mime;
    }

    private static long zahl(PluginCall call, String name) throws DateiablaufFehler {
        Object wert = call.getData().opt(name);
        if (!(wert instanceof Number)) throw new DateiablaufFehler("schreiben", false);
        double zahl = ((Number) wert).doubleValue();
        if (!Double.isFinite(zahl) || zahl < 0 || zahl > Integer.MAX_VALUE || zahl != Math.floor(zahl)) throw new DateiablaufFehler("schreiben", false);
        return (long) zahl;
    }

    private static void nurKennung(PluginCall call) throws DateiablaufFehler {
        if (call.getData().length() != 1 || call.getString("auftragId") == null) throw new DateiablaufFehler("schreiben", false);
    }

    private static void ohneFelder(PluginCall call, String fehlercode) throws DateiablaufFehler {
        if (call.getData().length() != 0) throw new DateiablaufFehler(fehlercode, false);
    }

    private void aufIoThread(PluginCall call, IoAktion aktion) {
        synchronized (sperre) {
            if (zerstoert || laufend != null || chooserOffen || PluginCall.CALLBACK_ID_DANGLING.equals(call.getCallbackId())) {
                fehlerMelden(call, new DateiablaufFehler("nicht-verfuegbar", false));
                return;
            }
            laufend = new Aufruf(call, generation);
            fortsetzen(call, aktion);
        }
    }

    private void fortsetzen(PluginCall call, IoAktion aktion) {
        try {
            io.execute(() -> {
                synchronized (sperre) {
                    if (!istLebenderAufruf(call, call.getMethodName())) return;
                    arbeiter = Thread.currentThread();
                }
                try {
                    if (zerstoert || Thread.currentThread().isInterrupted() || auftraege == null || dokumente == null) throw new DateiablaufFehler("nicht-verfuegbar", false);
                    aktion.ausfuehren();
                } catch (DateiablaufFehler e) { fehlerImIo(call, e); }
                catch (RuntimeException e) {
                    String code = "projektWaehlen".equals(call.getMethodName()) ? "lesen"
                        : "zuruecksetzenBestaetigen".equals(call.getMethodName()) ? "nicht-verfuegbar" : "schreiben";
                    fehlerImIo(call, new DateiablaufFehler(code, false));
                }
                finally { arbeiter = null; }
            });
        } catch (RejectedExecutionException e) { gescheitert(call, new DateiablaufFehler("nicht-verfuegbar", false)); }
    }

    private void fehlerImIo(PluginCall call, DateiablaufFehler fehler) {
        // Auch ungültige Brückenargumente beenden nur den zugehörigen eigenen Auftrag.
        try {
            if (auftraege != null && !"projektWaehlen".equals(call.getMethodName())
                && !"zuruecksetzenBestaetigen".equals(call.getMethodName())) auftraege.verwerfen(call.getString("auftragId"));
        }
        catch (DateiablaufFehler | RuntimeException e) { /* Unbekannte Kennung oder spätere Startbereinigung. */ }
        gescheitert(call, fehler);
    }

    // Aufrufer halten sperre; keine Zusage über alte Promises nach WebView-/Prozessverlust.
    private boolean istLebenderAufruf(PluginCall call, String methode) {
        return !zerstoert && call != null && laufend != null && laufend.call == call
            && laufend.generation == generation && methode.equals(call.getMethodName())
            && !PluginCall.CALLBACK_ID_DANGLING.equals(call.getCallbackId());
    }

    private void erledigt(PluginCall call, JSObject ergebnis) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, call.getMethodName())) return;
            aufrufBeenden(call);
            call.resolve(ergebnis);
        }
    }

    private void gescheitert(PluginCall call, DateiablaufFehler fehler) {
        synchronized (sperre) {
            if (!istLebenderAufruf(call, call.getMethodName())) return;
            aufrufBeenden(call);
            fehlerMelden(call, fehler);
        }
    }

    private void aufrufBeenden(PluginCall call) {
        laufend = null;
        getBridge().releaseCall(call);
    }

    private void fehlerMelden(PluginCall call, DateiablaufFehler fehler) {
        call.reject(fehler.getMessage(), fehler.code(), new JSObject().put("zielrestMoeglich", fehler.zielrestMoeglich()));
    }

    @Override protected Bundle saveInstanceState() { return null; }
    @Override protected void restoreState(Bundle state) { /* Keine Wiederaufnahme. */ }

    @Override protected void handleOnPause() {
        synchronized (sperre) { if (chooserOffen) chooserHatPause = true; }
    }

    @Override protected void handleOnResume() {
        synchronized (sperre) {
            // Nur die Sperre lösen; Rückkehr ist weder Versandbeleg noch Wiederholungsauftrag.
            if (chooserOffen && chooserHatPause) { chooserOffen = false; chooserHatPause = false; }
        }
    }

    @Override protected void handleOnDestroy() {
        synchronized (sperre) {
            if (zerstoert) return;
            if (laufend != null && "zuruecksetzenBestaetigen".equals(laufend.call.getMethodName())) {
                bestaetigungBeenden(laufend.call, false);
            } else if (laufend != null && "projektWaehlen".equals(laufend.call.getMethodName())) {
                gescheitert(laufend.call, new DateiablaufFehler("nicht-verfuegbar", false));
            }
            zerstoert = true;
            generation++;
            if (laufend != null) getBridge().releaseCall(laufend.call);
            laufend = null;
            Thread thread = arbeiter;
            if (thread != null) thread.interrupt();
            // Seriell nach einem eventuell unterbrochenen Kopieren; kein IO auf dem UI-Thread.
            io.execute(() -> {
                try { if (auftraege != null) auftraege.close(); }
                catch (DateiablaufFehler | RuntimeException e) { /* Nächster Start bereinigt Reste. */ }
            });
            io.shutdown();
        }
    }
}
