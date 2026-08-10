"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

const ADMIN_LONG_PRESS_MS = 1500;

type NavIconKind =
  | "home"
  | "wishlist"
  | "todo"
  | "cookbook"
  | "meal"
  | "lists"
  | "gifts"
  | "garden"
  | "harvest"
  | "energy"
  | "skull"
  | "feedback";

type NavItem = {
  href: string;
  label: string;
  accent: string;
  icon: NavIconKind;
  matches: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", accent: "#786d63", icon: "home", matches: ["/"] },
  { href: "/wishlist", label: "Wishlist", accent: "#ed8738", icon: "wishlist", matches: ["/wishlist"] },
  { href: "/lists", label: "Lists", accent: "#4967d2", icon: "lists", matches: ["/lists"] },
  { href: "/todo", label: "Todo", accent: "#4d7c67", icon: "todo", matches: ["/todo"] },
  { href: "/cookbook", label: "Cookbook", accent: "#cc8469", icon: "cookbook", matches: ["/cookbook", "/recipes"] },
  { href: "/meal-planner", label: "Meal Planner", accent: "#bd5d43", icon: "meal", matches: ["/meal-planner"] },
  { href: "/garden", label: "Garden", accent: "#5e8648", icon: "garden", matches: ["/garden"] },
  { href: "/harvest-count", label: "Harvest", accent: "#bd713d", icon: "harvest", matches: ["/harvest-count"] },
  { href: "/energy", label: "Energy", accent: "#1e627e", icon: "energy", matches: ["/energy"] },
  { href: "/skull-king", label: "Skull King", accent: "#82434e", icon: "skull", matches: ["/skull-king"] },
  { href: "/gifts", label: "Gifts", accent: "#9b78e8", icon: "gifts", matches: ["/gifts", "/gifts-login"] },
];

const QUICK_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ["/", "/todo", "/wishlist"].includes(item.href),
);

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Planning",
    items: NAV_ITEMS.filter((item) => ["/cookbook", "/meal-planner"].includes(item.href)),
  },
  {
    label: "Household",
    items: NAV_ITEMS.filter((item) => ["/lists", "/gifts", "/energy"].includes(item.href)),
  },
  {
    label: "Garden",
    items: NAV_ITEMS.filter((item) => ["/garden", "/harvest-count"].includes(item.href)),
  },
  {
    label: "Games",
    items: NAV_ITEMS.filter((item) => item.href === "/skull-king"),
  },
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
  if (kind === "feedback") {
    return <><path d="M5 5.5h14v10H10l-4.5 3v-3H5z" /><path d="M8.5 9.5h7M8.5 12h4.5" /></>;
  }
  if (kind === "harvest") {
    return <><path d="M4.5 11h15l-1.8 9H6.3l-1.8-9Z" /><path d="M3.5 11h17M8 11V8.7a4 4 0 0 1 8 0V11" /><path d="M12 8c-2.6-2.8-1.2-5.1 1.1-5.8.7 2.2.1 4.3-1.1 5.8Z" /></>;
  }
  if (kind === "energy") {
    return <><path d="m13.2 3.5-7 9h5.2l-.7 8 7.1-9h-5.2l.6-8Z" /></>;
  }
  if (kind === "skull") {
    return <><path d="M5 11.2a7 7 0 0 1 14 0v3.1l-2.2 2.2H15v2.1h-2v-2.1h-2v2.1H9v-2.1H7.2L5 14.3v-3.1Z" /><circle cx="9" cy="11" r="1" /><circle cx="15" cy="11" r="1" /><path d="M9 14.5h6" /></>;
  }
  return <><path d="M12 20v-7" /><path d="M12 11c0-3.1 2.4-5.6 5.4-5.6 0 3.1-2.4 5.6-5.4 5.6ZM12 13c-2.8 0-5.1-2.2-5.1-4.9 2.8 0 5.1 2.2 5.1 4.9Z" /></>;
}

export function AppFooterNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const navigationRef = useRef<HTMLDivElement | null>(null);
  const adminLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminLongPressTriggered = useRef(false);

  useEffect(() => {
    setOpen(false);
    setFeedbackOpen(false);
    setFeedbackStatus("idle");
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

  useEffect(() => {
    return () => {
      if (adminLongPressTimer.current) clearTimeout(adminLongPressTimer.current);
    };
  }, []);

  function clearAdminLongPress() {
    if (adminLongPressTimer.current) {
      clearTimeout(adminLongPressTimer.current);
      adminLongPressTimer.current = null;
    }
  }

  function startAdminLongPress() {
    clearAdminLongPress();
    adminLongPressTriggered.current = false;
    adminLongPressTimer.current = setTimeout(() => {
      adminLongPressTimer.current = null;
      adminLongPressTriggered.current = true;
      window.location.assign("/admin");
    }, ADMIN_LONG_PRESS_MS);
  }

  function startAdminPointerLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    startAdminLongPress();
  }

  function startAdminTouchLongPress(event: ReactTouchEvent<HTMLButtonElement>) {
    if (event.touches.length !== 1) return;
    startAdminLongPress();
  }

  function endAdminLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    clearAdminLongPress();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleNavigationTriggerClick() {
    if (adminLongPressTriggered.current) {
      adminLongPressTriggered.current = false;
      return;
    }
    setOpen((current) => !current);
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = feedbackMessage.trim();
    if (!message || feedbackStatus === "saving") {
      setFeedbackStatus("error");
      return;
    }

    setFeedbackStatus("saving");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_path: pathname || "/", message }),
      });
      if (response.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(pathname || "/")}`;
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not save feedback");
      }

      setFeedbackMessage("");
      setFeedbackStatus("success");
    } catch (error) {
      console.error("Feedback submission failed:", error);
      setFeedbackStatus("error");
    }
  }

  if (
    pathname === "/" ||
    pathname.startsWith("/recipes/") ||
    pathname === "/login"
  ) {
    return null;
  }

  function renderNavItem(item: NavItem, variant: "quick" | "standard") {
    const active = isActivePath(pathname, item.matches);
    return (
      // Each tool currently owns global CSS, so cross-tool navigation needs
      // a fresh document to prevent the previous tool's styles leaking in.
      <a
        key={item.href}
        href={item.href}
        className={`floating-navigation-link${variant === "quick" ? " is-quick" : ""}${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        tabIndex={open ? 0 : -1}
        style={{ "--nav-accent": item.accent } as CSSProperties}
      >
        <span className="floating-navigation-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><NavIcon kind={item.icon} /></svg>
        </span>
        <span>
          <strong>{item.label}</strong>
        </span>
        <span className="floating-navigation-arrow" aria-hidden="true">›</span>
        {active ? <i aria-hidden="true" /> : null}
      </a>
    );
  }

  return (
    <div className={`floating-navigation${open ? " is-open" : ""}`} ref={navigationRef}>
      <nav className="floating-navigation-panel" aria-label="App navigation" aria-hidden={!open}>
        <section className="floating-navigation-quick" aria-labelledby="navigation-quick-title">
          <h2 id="navigation-quick-title">Quick access</h2>
          <div className="floating-navigation-quick-grid">
            {QUICK_NAV_ITEMS.map((item) => renderNavItem(item, "quick"))}
          </div>
        </section>
        <div className="floating-navigation-groups">
          {NAV_GROUPS.map((group) => (
            <section className="floating-navigation-group" key={group.label} aria-labelledby={`navigation-group-${group.label.toLowerCase()}`}>
              <h2 id={`navigation-group-${group.label.toLowerCase()}`}>{group.label}</h2>
              <div className="floating-navigation-grid">
                {group.items.map((item) => renderNavItem(item, "standard"))}
              </div>
            </section>
          ))}
        </div>
        <button
          type="button"
          className="floating-navigation-feedback-trigger"
          aria-expanded={feedbackOpen}
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setFeedbackOpen((current) => !current);
            setFeedbackStatus("idle");
          }}
        >
          <span className="floating-navigation-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><NavIcon kind="feedback" /></svg>
          </span>
          <span><strong>Feedback</strong></span>
          <span className="floating-navigation-arrow" aria-hidden="true">›</span>
        </button>
        {feedbackOpen ? (
          <form className="floating-navigation-feedback" onSubmit={submitFeedback}>
            <label htmlFor="navigation-feedback-message">Feedback</label>
            <textarea
              id="navigation-feedback-message"
              value={feedbackMessage}
              onChange={(event) => {
                setFeedbackMessage(event.target.value);
                if (feedbackStatus !== "idle") setFeedbackStatus("idle");
              }}
              placeholder="What should change?"
              maxLength={2000}
              rows={4}
              autoFocus
            />
            <p>Page: {pathname || "/"}</p>
            <button type="submit" disabled={feedbackStatus === "saving"}>
              {feedbackStatus === "saving" ? "Saving…" : "Add to backlog"}
            </button>
            {feedbackStatus === "success" ? (
              <span className="floating-navigation-feedback-status is-success" role="status">
                Added to backlog.
              </span>
            ) : feedbackStatus === "error" ? (
              <span className="floating-navigation-feedback-status is-error" role="alert">
                Enter feedback and try again.
              </span>
            ) : null}
          </form>
        ) : null}
      </nav>

      <button
        type="button"
        className="floating-navigation-trigger"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        title="Hold for 1.5 seconds to open admin"
        onPointerDown={startAdminPointerLongPress}
        onPointerUp={endAdminLongPress}
        onPointerCancel={endAdminLongPress}
        onTouchStart={startAdminTouchLongPress}
        onTouchEnd={clearAdminLongPress}
        onTouchCancel={clearAdminLongPress}
        onContextMenu={(event) => event.preventDefault()}
        onClick={handleNavigationTriggerClick}
      >
        <span className="floating-navigation-trigger-icon" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
    </div>
  );
}
