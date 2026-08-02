import type { ReactNode } from "react";
import type { Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { createPageMetadata } from "@/lib/metadata";
import { AppFooterNav } from "@/components/app-footer-nav";
import { PageUsageTracker } from "@/components/page-usage-tracker";

export const metadata = createPageMetadata({
  title: "Website",
  description: "Household tools for meals, lists, tasks, recipes, gifts, shopping, and the garden",
  variant: "home",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isAndroidApp = userAgent.includes("HouseholdToolsAndroid/");
  // APK 1.1 padded the native WebView itself. Newer builds draw edge to edge
  // and pass the measured safe area into the page as CSS variables.
  const usesNativeInsets = userAgent.includes("HouseholdToolsAndroid/1.1");
  const htmlClassName = isAndroidApp
    ? `android-app${usesNativeInsets ? " android-native-insets" : ""}`
    : undefined;

  return (
    <html lang="en" className={htmlClassName}>
      <body>
        <div className="site-root">
          <div className="site-content">{children}</div>
          <PageUsageTracker />
          <AppFooterNav />
        </div>
      </body>
    </html>
  );
}
