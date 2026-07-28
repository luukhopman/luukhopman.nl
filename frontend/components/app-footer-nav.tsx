"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavIconKind =
  | "home"
  | "wishlist"
  | "todo"
  | "cookbook"
  | "meal"
  | "lists"
  | "gifts"
  | "garden";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: NavIconKind;
  matches: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", description: "All your tools", icon: "home", matches: ["/"] },
  { href: "/meal-planner", label: "Meal Planner", description: "Plan the week", icon: "meal", matches: ["/meal-planner"] },
  { href: "/lists", label: "Lists", description: "Reusable checklists", icon: "lists", matches: ["/lists"] },
  { href: "/wishlist", label: "Wishlist", description: "Things to buy", icon: "wishlist", matches: ["/wishlist"] },
  { href: "/todo", label: "Todo", description: "Tasks and dates", icon: "todo", matches: ["/todo"] },
  { href: "/cookbook", label: "Cookbook", description: "Recipes and meals", icon: "cookbook", matches: ["/cookbook", "/recipes"] },
  { href: "/gifts", label: "Gifts", description: "Private gift ideas", icon: "gifts", matches: ["/gifts", "/gifts-login"] },
  { href: "/garden", label: "Garden", description: "Beds and crops", icon: "garden", matches: ["/garden"] },
];

function isActivePath(pathname: string, matches: string[]) {
  return matches.some((match) =>
    match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`),
  );
}

function NavIcon({ kind }: { kind: NavIconKind }) {
  if (kind === "home") {
    return <><path d="M4.5 10.5 12 4l7.5 6.5" /><path d="M7.5 9.8v8.2h9V9.8" /></>;
  }
  if (kind === "wishlist") {
    return <path d="M12 19.2 5.6 13a4.4 4.4 0 0 1 6.2-6.3L12 7.9l.2-.2A4.4 4.4 0 1 1 18.4 13L12 19.2Z" />;
  }
  if (kind === "todo") {
    return <><path d="m6.8 12 3.1 3.1 7.3-7.3" /><rect x="4" y="4" width="16" height="16" rx="4" /></>;
  }
  if (kind === "cookbook") {
    return <><path d="M7 5.5h9.5A2.5 2.5 0 0 1 19 8v10.5H9.2A2.2 2.2 0 0 0 7 20.7V5.5Z" /><path d="M7 6.2H5.8A1.8 1.8 0 0 0 4 8v10.2A1.8 1.8 0 0 0 5.8 20H19" /></>;
  }
  if (kind === "meal") {
    return <><path d="M7 4v6M4.5 4v3.5A2.5 2.5 0 0 0 7 10M9.5 4v3.5A2.5 2.5 0 0 1 7 10v10" /><path d="M15 13V7.5A3.5 3.5 0 0 1 18.5 4v16M15 13h3.5" /></>;
  }
  if (kind === "lists") {
    return <><path d="m5 7 1.3 1.3L9 5.5M5 13l1.3 1.3L9 11.5M11.5 7H19M11.5 13H19M5 19h14" /></>;
  }
  if (kind === "gifts") {
    return <><path d="M5 10h14v9H5zM3.8 10h16.4V7H3.8zM12 7v12" /><path d="M12 7c-3.5 0-5.5-1.1-5.5-3 2.6 0 4.4 1 5.5 3Zm0 0c3.5 0 5.5-1.1 5.5-3-2.6 0-4.4 1-5.5 3Z" /></>;
  }
  return <><path d="M12 20v-7" /><path d="M12 11c0-3.1 2.4-5.6 5.4-5.6 0 3.1-2.4 5.6-5.4 5.6ZM12 13c-2.8 0-5.1-2.2-5.1-4.9 2.8 0 5.1 2.2 5.1 4.9Z" /></>;
}

export function AppFooterNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!navigationRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`floating-navigation${open ? " is-open" : ""}`} ref={navigationRef}>
      <nav className="floating-navigation-panel" aria-label="App navigation" aria-hidden={!open}>
        <div className="floating-navigation-header">
          <div>
            <strong>Navigate</strong>
            <span>Where would you like to go?</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            tabIndex={open ? 0 : -1}
          >
            ×
          </button>
        </div>
        <div className="floating-navigation-grid">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.matches);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
              >
                <span className="floating-navigation-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><NavIcon kind={item.icon} /></svg>
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {active ? <i aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <button
        type="button"
        className="floating-navigation-trigger"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>{open ? "Close" : "Menu"}</strong>
      </button>
    </div>
  );
}
