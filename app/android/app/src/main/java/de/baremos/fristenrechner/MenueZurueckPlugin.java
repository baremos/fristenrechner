package de.baremos.fristenrechner;

import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Ein abgeschlossener Zurück-Schritt für ein geöffnetes Menü. */
@CapacitorPlugin(name = "MenueZurueck")
public class MenueZurueckPlugin extends Plugin {
    private long folge = 0;
    private volatile long dokument = 0;
    private boolean beendet = false;
    private final OnBackPressedCallback callback = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            setEnabled(false);
            JSObject ereignis = new JSObject();
            ereignis.put("folge", folge);
            notifyListeners("zurueck", ereignis, false);
        }
    };
    private final WebViewListener seiten = new WebViewListener() {
        @Override
        public void onPageStarted(WebView webView) {
            getActivity().runOnUiThread(() -> {
                callback.setEnabled(false);
                dokument++;
                folge = 0;
                removeAllListeners();
            });
        }
    };

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            if (beendet) return;
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), callback);
            bridge.addWebViewListener(seiten);
        });
    }

    @PluginMethod
    public void setzen(PluginCall call) {
        JSObject daten = call.getData();
        Object aktivWert = daten.opt("aktiv");
        Object folgeWert = daten.opt("folge");
        // JS-Zahlen müssen ohne Rundungsverlust als aufsteigende Folge nutzbar sein.
        if (daten.length() != 2 || !(aktivWert instanceof Boolean) || !(folgeWert instanceof Number)) {
            call.reject("Ungültiger Zurück-Aufruf.");
            return;
        }
        double zahl = ((Number) folgeWert).doubleValue();
        if (!Double.isFinite(zahl) || zahl < 1 || zahl > 9007199254740991d || zahl != Math.floor(zahl)) {
            call.reject("Ungültiger Zurück-Aufruf.");
            return;
        }
        final long neueFolge = (long) zahl;
        final boolean aktiv = (Boolean) aktivWert;
        final long aufrufDokument = dokument;
        getActivity().runOnUiThread(() -> {
            if (!beendet && aufrufDokument == dokument && neueFolge > folge) {
                folge = neueFolge;
                callback.setEnabled(aktiv);
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> {
            beendet = true;
            dokument++;
            callback.setEnabled(false);
            callback.remove();
            bridge.removeWebViewListener(seiten);
            removeAllListeners();
        });
    }
}
