import type { ReactNode } from "react";
import type { Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { createPageMetadata } from "@/lib/metadata";
import { AppFooterNav } from "@/components/app-footer-nav";

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

  return (
    <html lang="en" className={isAndroidApp ? "android-app" : undefined}>
      <body>
        <div className="site-root">
          <div className="site-content">{children}</div>
          <AppFooterNav />
        </div>
      </body>
    </html>
  );
}
