package com.thecontroller.android;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.*;

public class MainActivity extends Activity {
    private WebView webView;
    private final BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String state = intent.getStringExtra("state");
            String details = intent.getStringExtra("details");
            if (webView != null && state != null) {
                String js = "window.__controllerAndroidState && window.__controllerAndroidState(" + JSONObjectQuote(state) + "," + JSONObjectQuote(details == null ? "" : details) + ");";
                webView.evaluateJavascript(js, null);
            }
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 15);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        webView.getSettings().setSupportMultipleWindows(true);
        webView.addJavascriptInterface(new AndroidHost(this), "AndroidHost");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(true);
                popup.getSettings().setDomStorageEnabled(true);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        Uri uri = request.getUrl();
                        if (uri.getHost() != null && (uri.getHost().endsWith("google.com") || uri.getHost().endsWith("firebaseapp.com"))) return false;
                        return true;
                    }
                    @Override public WebResourceResponse shouldInterceptRequest(WebView popupView, WebResourceRequest request) {
                        Uri uri = request.getUrl();
                        if (!"the-controller-982de.firebaseapp.com".equals(uri.getHost()) || (uri.getPath() != null && uri.getPath().startsWith("/__/auth/"))) return super.shouldInterceptRequest(popupView, request);
                        String path = uri.getPath() == null ? "/" : uri.getPath();
                        String relative = path.equals("/") ? "index.html" : path.substring(1);
                        try { return new WebResourceResponse("text/html", "UTF-8", getAssets().open("site/" + relative)); }
                        catch (IOException error) { return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0])); }
                    }
                });
                android.widget.FrameLayout root = (android.widget.FrameLayout) webView.getParent();
                root.addView(popup, new android.widget.FrameLayout.LayoutParams(-1, -1));
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup); resultMsg.sendToTarget(); return true;
            }
            @Override public void onCloseWindow(WebView window) {
                if (window.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) window.getParent()).removeView(window);
                window.destroy();
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.getPath() != null && uri.getPath().startsWith("/__/auth/")) return false;
                if ("https".equals(uri.getScheme()) && "the-controller-982de.firebaseapp.com".equals(uri.getHost())) return false;
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"the-controller-982de.firebaseapp.com".equals(uri.getHost())) return super.shouldInterceptRequest(view, request);
                String path = uri.getPath() == null ? "/" : uri.getPath();
                if (path.startsWith("/__/auth/")) return super.shouldInterceptRequest(view, request);
                String relative = path.equals("/") ? "index.html" : path.substring(1);
                try {
                    InputStream stream = getAssets().open("site/" + relative);
                    String mime = relative.endsWith(".js") ? "application/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".svg") ? "image/svg+xml" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", stream);
                } catch (IOException ignored) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0])); }
            }
        });
        setContentView(webView, new FrameLayout.LayoutParams(-1, -1));
        IntentFilter filter = new IntentFilter(AndroidAgentService.ACTION_STATE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(stateReceiver, filter);
        webView.loadUrl("https://the-controller-982de.firebaseapp.com/");
    }

    void openSection(String section) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('controller-open-section',{detail:" + JSONObjectQuote(section) + "}));", null);
        });
    }
    private String JSONObjectQuote(String value) { return org.json.JSONObject.quote(value == null ? "" : value); }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('controller-open-section',{detail:'restore'}));", null));
    }
@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == 9001) {
        AndroidHost.handleGoogleSignInResult(this, data);
    }
}

void sendGoogleAuthResult(String idToken, String accessToken, String error) {
    if (webView == null) return;

    String idTokenJson = JSONObjectQuote(idToken == null ? "" : idToken);
    String accessTokenJson = JSONObjectQuote(accessToken == null ? "" : accessToken);
    String errorJson = JSONObjectQuote(error == null ? "" : error);

    String js =
            "window.__controllerGoogleAuthResult && " +
            "window.__controllerGoogleAuthResult(" +
            idTokenJson + "," +
            accessTokenJson + "," +
            errorJson +
            ");";

    runOnUiThread(() -> webView.evaluateJavascript(js, null));
}
    @Override protected void onDestroy() {
        try { unregisterReceiver(stateReceiver); } catch (Exception ignored) {}
        if (webView != null) { webView.removeJavascriptInterface("AndroidHost"); webView.destroy(); webView = null; }
        super.onDestroy();
    }
    @Override public void onBackPressed() { moveTaskToBack(true); }
}
