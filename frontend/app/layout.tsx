import type { ReactNode } from "react";
import "./globals.css";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Website",
  description: "Wishlist, todo, cookbook, and gifts",
  variant: "home",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
