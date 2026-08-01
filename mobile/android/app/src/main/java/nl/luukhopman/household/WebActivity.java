package nl.luukhopman.household;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public final class WebActivity extends Activity {
    private static final String START_URL = "https://luukhopman.nl/";
    private static final int MAX_RENDERER_RECOVERIES = 1;
    private WebView webView;
    private FrameLayout webContainer;
    private int rendererRecoveryCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webContainer = new FrameLayout(this);
        webContainer.setBackgroundColor(Color.rgb(255, 253, 249));
        setContentView(webContainer);
        SystemBarInsets.applyAsPadding(webContainer, 0, 0, 0, 0);

        configureWindowSafely();
        if (WebView.getCurrentWebViewPackage() == null) {
            showPageError(R.string.webview_unavailable);
            return;
        }
        createWebView(savedInstanceState, START_URL);
    }

    private void configureWindowSafely() {
        try {
            Window window = getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
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
                );
            }
            window.setStatusBarColor(Color.rgb(255, 253, 249));
            window.setNavigationBarColor(Color.rgb(255, 253, 249));
        } catch (Throwable ignored) {
            // Some vendor Android builds reject individual edge-to-edge flags.
            // The app remains usable with the platform's default window styling.
        }
    }

    private void createWebView(Bundle savedInstanceState, String url) {
        WebView nextWebView = null;
        try {
            nextWebView = new WebView(this);
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
            WebBackForwardList restoredState = savedInstanceState == null
                    ? null
                    : nextWebView.restoreState(savedInstanceState);
            if (restoredState == null) {
                nextWebView.loadUrl(url);
            }
        } catch (Throwable error) {
            webView = null;
            if (nextWebView != null) {
                destroyWebViewSafely(nextWebView);
            }
            showPageError(R.string.webview_unavailable);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        // The first-party Next.js application requires JavaScript. Navigation is
        // kept inside the trusted luukhopman.nl origin by the WebViewClient below.
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " HouseholdToolsAndroid/1.1");
        if (rendererRecoveryCount > 0) {
            view.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }


        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != webView) {
                    return true;
                }

                // Android marks this WebView unusable once this callback starts.
                // Detach it and clear references without invoking methods on it.
                webView = null;
                webContainer.removeView(view);

                webContainer.post(() -> {
                    if (rendererRecoveryCount < MAX_RENDERER_RECOVERIES) {
                        rendererRecoveryCount++;
                        createWebView(null, START_URL);
                    } else {
                        showPageError(R.string.renderer_error);
                    }
                });
                return true;
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (view == webView && request.isForMainFrame()) {
                    view.post(() -> {
                        if (view == webView) showPageError(R.string.page_load_error);
                    });
                }
            }

            @Override
            public void onReceivedHttpError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceResponse errorResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (view == webView && request.isForMainFrame()) {
                    view.post(() -> {
                        if (view == webView) showPageError(R.string.page_load_error);
                    });
                }
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

    private void showPageError(int messageResource) {
        WebView failedWebView = webView;
        webView = null;
        if (failedWebView != null) {
            destroyWebViewSafely(failedWebView);
        }

        LinearLayout errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(48, 48, 48, 48);
        errorView.setBackgroundColor(Color.rgb(255, 253, 249));

        TextView message = new TextView(this);
        message.setText(messageResource);
        message.setTextColor(Color.rgb(47, 36, 23));
        message.setTextSize(17);
        message.setGravity(Gravity.CENTER);

        Button retry = new Button(this);
        retry.setText(R.string.try_again);
        retry.setOnClickListener(v -> {
            rendererRecoveryCount = 0;
            createWebView(null, START_URL);
        });

        Button browser = new Button(this);
        browser.setText(R.string.open_in_browser);
        browser.setOnClickListener(v -> openExternal(Uri.parse(START_URL)));

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
        LinearLayout.LayoutParams browserParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        browserParams.topMargin = 12;
        errorView.addView(browser, browserParams);
        webContainer.removeAllViews();
        webContainer.addView(
                errorView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );
    }

    private void destroyWebViewSafely(WebView view) {
        try {
            if (view.getParent() == webContainer) {
                webContainer.removeView(view);
            }
        } catch (Throwable ignored) {
            // Continue cleanup when a broken renderer rejects a view operation.
        }
        try {
            view.stopLoading();
        } catch (Throwable ignored) {
            // The WebView can already be unusable after renderer termination.
        }
        try {
            view.setWebChromeClient(null);
            view.setWebViewClient(null);
        } catch (Throwable ignored) {
            // Keep cleanup best-effort.
        }
        try {
            view.destroy();
        } catch (Throwable ignored) {
            // Native WebView cleanup must not take down the activity.
        }
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
            try {
                webView.saveState(outState);
            } catch (Throwable ignored) {
                // A failed renderer has no state worth restoring.
            }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        try {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
        } catch (Throwable ignored) {
            // Fall through to the normal activity back behavior.
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            destroyWebViewSafely(webView);
            webView = null;
        }
        super.onDestroy();
    }
}
