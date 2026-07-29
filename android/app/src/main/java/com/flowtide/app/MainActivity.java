package com.flowtide.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件必须在 super.onCreate 之前注册
        registerPlugin(LiveTimerPlugin.class);
        super.onCreate(savedInstanceState);
        // 锁定 WebView 文字缩放：不跟随系统字体大小，避免 UI 突然变大/首屏尺寸不统一
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
