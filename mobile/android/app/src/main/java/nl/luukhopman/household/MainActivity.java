package nl.luukhopman.household;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://luukhopman.nl/";
    private static final int MAX_RENDERER_RECOVERIES = 1;
    private WebView webView;
    private FrameLayout webContainer;
    private int rendererRecoveryCount;
    private int safeInsetLeft;
    private int safeInsetTop;
    private int safeInsetRight;
    private int safeInsetBottom;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }
        window.setStatusBarColor(Color.rgb(255, 253, 249));
        window.setNavigationBarColor(Color.rgb(255, 253, 249));

        webContainer = new FrameLayout(this);
        setContentView(webContainer);
        createWebView(savedInstanceState, START_URL);
    }

    private void createWebView(Bundle savedInstanceState, String url) {
        WebView nextWebView = new WebView(this);
        webView = nextWebView;
        configureWebView(nextWebView);
        webContainer.removeAllViews();
        webContainer.addView(
                nextWebView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );
        nextWebView.requestApplyInsets();

        if (savedInstanceState == null) {
            nextWebView.loadUrl(url);
        } else {
            nextWebView.restoreState(savedInstanceState);
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

        view.setOnApplyWindowInsetsListener((v, insets) -> {
            int topInset = 0;
            int bottomInset = 0;
            int leftInset = 0;
            int rightInset = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets systemInsets = insets.getInsets(
                        WindowInsets.Type.statusBars()
                                | WindowInsets.Type.navigationBars()
                                | WindowInsets.Type.displayCutout()
                );
                topInset = systemInsets.top;
                bottomInset = systemInsets.bottom;
                leftInset = systemInsets.left;
                rightInset = systemInsets.right;
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                topInset = insets.getSystemWindowInsetTop();
                bottomInset = insets.getSystemWindowInsetBottom();
                leftInset = insets.getSystemWindowInsetLeft();
                rightInset = insets.getSystemWindowInsetRight();
            }
            safeInsetLeft = leftInset;
            safeInsetTop = topInset;
            safeInsetRight = rightInset;
            safeInsetBottom = bottomInset;
            // Keep the WebView itself edge-to-edge. The shared web app applies these
            // values to its root layout, so normal flow and fixed overlays get the
            // same safe area treatment on every route.
            v.setPadding(0, 0, 0, 0);
            updateSafeAreaVariables();
            return insets;
        });

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != webView) {
                    return true;
                }

                webView = null;
                webContainer.removeView(view);
                view.setWebChromeClient(null);
                view.setWebViewClient(null);
                view.destroy();

                if (rendererRecoveryCount < MAX_RENDERER_RECOVERIES) {
                    rendererRecoveryCount++;
                    createWebView(null, START_URL);
                } else {
                    showRendererError();
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                updateSafeAreaVariables();
            }

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

    private void showRendererError() {
        LinearLayout errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(48, 48, 48, 48);
        errorView.setBackgroundColor(Color.rgb(255, 253, 249));

        TextView message = new TextView(this);
        message.setText("Zusammen could not load this page. Please try again.");
        message.setTextColor(Color.rgb(47, 36, 23));
        message.setTextSize(17);
        message.setGravity(Gravity.CENTER);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> {
            rendererRecoveryCount = 0;
            createWebView(null, START_URL);
        });

        errorView.addView(
                message,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                )
        );
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        retryParams.topMargin = 24;
        errorView.addView(retry, retryParams);
        webContainer.removeAllViews();
        webContainer.addView(
                errorView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );
    }

    private void updateSafeAreaVariables() {
        if (webView == null) {
            return;
        }

        String script = "(() => {"
                + "const root = document.documentElement;"
                + "if (!root) return;"
                + "root.style.setProperty('--app-safe-area-top', '" + safeInsetTop + "px');"
                + "root.style.setProperty('--app-safe-area-right', '" + safeInsetRight + "px');"
                + "root.style.setProperty('--app-safe-area-bottom', '" + safeInsetBottom + "px');"
                + "root.style.setProperty('--app-safe-area-left', '" + safeInsetLeft + "px');"
                + "})();";
        webView.evaluateJavascript(script, null);
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
        if (webView != null) {
            webView.saveState(outState);
        }
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
