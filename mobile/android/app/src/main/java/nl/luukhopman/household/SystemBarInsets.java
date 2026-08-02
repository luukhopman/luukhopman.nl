package nl.luukhopman.household;

import android.graphics.Insets;
import android.os.Build;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;

final class SystemBarInsets {
    private SystemBarInsets() {}

    interface InsetsObserver {
        void onInsets(int left, int top, int right, int bottom);
    }

    static void observe(View view, InsetsObserver observer) {
        view.setOnApplyWindowInsetsListener((target, windowInsets) -> {
            int[] safeInsets = resolveSafeInsets(windowInsets);
            observer.onInsets(safeInsets[0], safeInsets[1], safeInsets[2], safeInsets[3]);
            return windowInsets;
        });
        view.requestApplyInsets();
    }

    static void applyAsPadding(
            View view,
            int baseLeft,
            int baseTop,
            int baseRight,
            int baseBottom
    ) {
        view.setOnApplyWindowInsetsListener((target, windowInsets) -> {
            int[] safeInsets = resolveSafeInsets(windowInsets);
            int left = safeInsets[0];
            int top = safeInsets[1];
            int right = safeInsets[2];
            int bottom = safeInsets[3];

            target.setPadding(
                    baseLeft + left,
                    baseTop + top,
                    baseRight + right,
                    baseBottom + bottom
            );

            WindowInsets consumedInsets = windowInsets.consumeSystemWindowInsets();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                consumedInsets = consumedInsets.consumeDisplayCutout();
            }
            return consumedInsets;
        });
        view.requestApplyInsets();
    }

    private static int[] resolveSafeInsets(WindowInsets windowInsets) {
        int left;
        int top;
        int right;
        int bottom;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Insets safeInsets = windowInsets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            left = safeInsets.left;
            top = safeInsets.top;
            right = safeInsets.right;
            bottom = safeInsets.bottom;
        } else {
            left = windowInsets.getSystemWindowInsetLeft();
            top = windowInsets.getSystemWindowInsetTop();
            right = windowInsets.getSystemWindowInsetRight();
            bottom = windowInsets.getSystemWindowInsetBottom();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                DisplayCutout cutout = windowInsets.getDisplayCutout();
                if (cutout != null) {
                    left = Math.max(left, cutout.getSafeInsetLeft());
                    top = Math.max(top, cutout.getSafeInsetTop());
                    right = Math.max(right, cutout.getSafeInsetRight());
                    bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                }
            }
        }

        return new int[] {left, top, right, bottom};
    }
}
