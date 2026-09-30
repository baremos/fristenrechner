package de.baremos.fristenrechner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NavigationssperrePlugin.class); // Vor dem Aufbau der Bridge registrieren.
        super.onCreate(savedInstanceState);
    }
}
