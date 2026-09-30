package de.baremos.fristenrechner;

import android.net.Uri;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lässt in der WebView nur Adressen der App selbst zu. Alles andere wird weder geladen noch an andere Apps übergeben. */
@CapacitorPlugin(name = "Navigationssperre")
public class NavigationssperrePlugin extends Plugin {
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String schema = url.getScheme();
        String host = url.getHost();
        boolean eigen = schema != null && host != null
            && schema.equals(getBridge().getScheme())
            && host.equals(getBridge().getHost())
            && url.getPort() == -1;
        if (eigen) return null;            // Capacitor entscheidet wie bisher und lädt lokal
        Logger.debug("Navigationssperre", "gesperrt: " + schema); // nur im Debug-Build sichtbar
        return Boolean.TRUE;               // nicht laden, keinen Intent starten
    }
}
