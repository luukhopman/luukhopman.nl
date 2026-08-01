plugins {
    id("com.android.application")
}

android {
    namespace = "nl.luukhopman.household"
    compileSdk = 35

    signingConfigs {
        create("release") {
            val keystorePath = providers.environmentVariable("HOUSEHOLD_RELEASE_KEYSTORE").orNull
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = providers.environmentVariable("HOUSEHOLD_RELEASE_STORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("HOUSEHOLD_RELEASE_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("HOUSEHOLD_RELEASE_KEY_PASSWORD").get()
            }
        }
    }

    defaultConfig {
        applicationId = "nl.luukhopman.household"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
