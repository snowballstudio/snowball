package com.snowball.health;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceDataPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
