package nl.luukhopman.household;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://luukhopman.nl/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showLauncher();

        if (savedInstanceState == null) {
            findViewById(R.id.open_embedded_app).post(this::openEmbeddedApp);
        }
    }

    private void showLauncher() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        layout.setBackgroundColor(Color.rgb(255, 253, 249));

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextColor(Color.rgb(47, 36, 23));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);

        TextView message = new TextView(this);
        message.setText(R.string.embedded_app_help);
        message.setTextColor(Color.rgb(92, 79, 65));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);

        Button open = new Button(this);
        open.setId(R.id.open_embedded_app);
        open.setText(R.string.open_app);
        open.setOnClickListener(view -> openEmbeddedApp());

        Button browser = new Button(this);
        browser.setText(R.string.open_in_browser);
        browser.setOnClickListener(view -> openBrowser());

        layout.addView(title, matchWrapParams());
        LinearLayout.LayoutParams messageParams = matchWrapParams();
        messageParams.topMargin = 12;
        layout.addView(message, messageParams);
        LinearLayout.LayoutParams openParams = wrapWrapParams();
        openParams.topMargin = 28;
        layout.addView(open, openParams);
        LinearLayout.LayoutParams browserParams = wrapWrapParams();
        browserParams.topMargin = 12;
        layout.addView(browser, browserParams);
        setContentView(layout);
        SystemBarInsets.applyAsPadding(layout, 48, 32, 48, 48);
    }

    private LinearLayout.LayoutParams matchWrapParams() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams wrapWrapParams() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private void openEmbeddedApp() {
        try {
            startActivity(new Intent(this, WebActivity.class));
        } catch (Throwable ignored) {
            openBrowser();
        }
    }

    private void openBrowser() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(START_URL)));
        } catch (Throwable ignored) {
            // The native launcher stays visible if no browser is available.
        }
    }
}
