import type { ReactNode } from "react";
import "./globals.css";
import { createPageMetadata } from "@/lib/metadata";
import { AppFooterNav } from "@/components/app-footer-nav";

export const metadata = createPageMetadata({
  title: "Website",
  description: "Household tools for meals, lists, tasks, recipes, gifts, shopping, and the garden",
  variant: "home",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="site-root">
          <div className="site-content">{children}</div>
          <AppFooterNav />
        </div>
      </body>
    </html>
  );
}
