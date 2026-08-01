# Zusammen Android app

This is a small native WebView shell for `https://luukhopman.nl/`. The website remains the shared UI and backend, so users get the same login, wishlist, cookbook, meal planner, and other tools in the app.

## Build a debug APK

Install JDK 17 and Android SDK 35, then run:

```bash
./gradlew assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Build a release APK

Keep the release keystore outside the repository and provide its details as environment variables:

```bash
export HOUSEHOLD_RELEASE_KEYSTORE=/secure/path/household-tools-release.keystore
export HOUSEHOLD_RELEASE_STORE_PASSWORD='...'
export HOUSEHOLD_RELEASE_KEY_ALIAS='household-tools'
export HOUSEHOLD_RELEASE_KEY_PASSWORD='...'
./gradlew assembleRelease
```

The signing key must be retained for future updates, otherwise Android will treat an update as a different app.
