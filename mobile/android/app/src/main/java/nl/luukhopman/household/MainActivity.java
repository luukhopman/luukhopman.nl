package nl.luukhopman.household;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://luukhopman.nl/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(255, 253, 249));
        window.setNavigationBarColor(Color.rgb(255, 253, 249));
        window.getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                        | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        webView = new WebView(this);
        configureWebView(webView);
        setContentView(webView);

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " HouseholdToolsAndroid/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isInternalUrl(uri)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri uri = Uri.parse(url);
                if (isInternalUrl(uri)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }
        });
    }

    private static boolean isInternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) {
            return false;
        }
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return "https".equalsIgnoreCase(scheme)
                && ("luukhopman.nl".equals(normalizedHost)
                || normalizedHost.endsWith(".luukhopman.nl"));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // Some devices do not have a browser capable of handling every URL scheme.
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
