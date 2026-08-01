"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function PageUsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/admin" || pathname === "/login") return;

    const body = JSON.stringify({ path: pathname });
    const payload = new Blob([body], { type: "application/json" });
    const sent = typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon("/api/usage", payload)
      : false;

    if (!sent) {
      void fetch("/api/usage", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
      });
    }
  }, [pathname]);

  return null;
}
