package de.baremos.fristenrechner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import de.baremos.fristenrechner.io.DateiablaufPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NavigationssperrePlugin.class); // Vor dem Aufbau der Bridge registrieren.
        registerPlugin(DateiablaufPlugin.class);
        registerPlugin(MenueZurueckPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
