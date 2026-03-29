"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type FooterIconKind = "home" | "wishlist" | "todo" | "cookbook" | "gifts" | "garden";

type FooterItem = {
  href: string;
  label: string;
  icon: FooterIconKind;
  matches: string[];
};

const FOOTER_ITEMS: FooterItem[] = [
  { href: "/", label: "Home", icon: "home", matches: ["/"] },
  { href: "/wishlist", label: "Wishlist", icon: "wishlist", matches: ["/wishlist"] },
  { href: "/todo", label: "Todo", icon: "todo", matches: ["/todo"] },
  { href: "/cookbook", label: "Cookbook", icon: "cookbook", matches: ["/cookbook", "/recipes"] },
  { href: "/gifts", label: "Gifts", icon: "gifts", matches: ["/gifts", "/gifts-login"] },
  { href: "/garden", label: "Garden", icon: "garden", matches: ["/garden"] },
];

function isActivePath(pathname: string, matches: string[]) {
  return matches.some((match) => {
    if (match === "/") {
      return pathname === "/";
    }

    return pathname === match || pathname.startsWith(`${match}/`);
  });
}

function FooterIcon({ kind }: { kind: FooterIconKind }) {
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 10.5 12 4l7.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 9.8v8.2h9V9.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "wishlist") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 19.2 5.6 13a4.4 4.4 0 0 1 6.2-6.3L12 7.9l.2-.2A4.4 4.4 0 1 1 18.4 13L12 19.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "todo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6.8 12 3.1 3.1 7.3-7.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "cookbook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 5.5h9.5a2.5 2.5 0 0 1 2.5 2.5v10.5H9.2A2.2 2.2 0 0 0 7 20.7V5.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 6.2H5.8A1.8 1.8 0 0 0 4 8v10.2A1.8 1.8 0 0 0 5.8 20H19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "gifts") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 10h14v9H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3.8 10h16.4v-3H3.8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 7v12M12 4.2c0 1.7-1.4 3-3 3S6 5.9 6 4.2c1.7 0 3 .9 3.9 2.1.8-1.2 2.2-2.1 4.1-2.1 0 1.7-1.3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 19v-6.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 11.1c0-3.1 2.4-5.6 5.4-5.6 0 3.1-2.4 5.6-5.4 5.6Z" fill="currentColor" opacity="0.92" />
      <path d="M12 13c-2.8 0-5.1-2.2-5.1-4.9 2.8 0 5.1 2.2 5.1 4.9Z" fill="currentColor" opacity="0.72" />
      <path d="M9.6 19h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AppFooterNav() {
  const pathname = usePathname();

  return (
    <footer className="site-app-footer">
      <nav className="site-app-footer-nav" aria-label="App navigation">
        {FOOTER_ITEMS.map((item) => {
          const isActive = isActivePath(pathname, item.matches);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`site-app-footer-link${item.href === "/" ? " is-home-link" : ""}${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
            >
              <span className="site-app-footer-icon" aria-hidden="true">
                <FooterIcon kind={item.icon} />
              </span>
              <span className="site-app-footer-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </footer>
  );
}
