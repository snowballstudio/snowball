package com.snowball.health;

import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;

import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private WebView snowballWebView;
    private int snowballSafeTopPx = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceDataPlugin.class);
        registerPlugin(AndroidPhotoIndexPlugin.class);

        super.onCreate(savedInstanceState);

        /*
         背景延伸到 Android 状态栏和挖孔区域后面。
         页面内容的顶部安全距离由网页统一使用 --snowball-safe-top。
        */
        EdgeToEdge.enable(this);

        snowballWebView = getBridge().getWebView();
        View decorView = getWindow().getDecorView();

        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, windowInsets) -> {
            Insets topInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars()
                    | WindowInsetsCompat.Type.displayCutout()
            );

            snowballSafeTopPx = Math.max(0, topInsets.top);
            applySnowballSafeTop();
            return windowInsets;
        });

        ViewCompat.requestApplyInsets(decorView);

        /*
         Capacitor 页面首次载入后再补写一次，避免首次 DOM 尚未完成。
        */
        if (snowballWebView != null) {
            snowballWebView.postDelayed(this::applySnowballSafeTop, 500);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applySnowballSafeTop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            applySnowballSafeTop();
        }
    }

    private void applySnowballSafeTop() {
        if (snowballWebView == null) return;

        final int nativeTopPx = Math.max(0, snowballSafeTopPx);

        snowballWebView.post(() ->
            snowballWebView.evaluateJavascript(
                "(function(){" +
                    "var root=document.documentElement;" +
                    "if(!root){return;}" +
                    "var ratio=window.devicePixelRatio||1;" +
                    "var safeTop=" + nativeTopPx + "/ratio;" +
                    "root.classList.add('snowball-native-edge');" +
                    "root.style.setProperty('--snowball-safe-top',safeTop+'px');" +
                "})();",
                null
            )
        );
    }
}
