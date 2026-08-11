"use client";

import { useBodyClass } from "../../lib/browser";

const HOME_APPS = [
  { href: "/wishlist", className: "wishlist", icon: "fa-basket-shopping", title: "Wishlist" },
  { href: "/lists", className: "lists", icon: "fa-list-check", title: "Lists" },
  { href: "/todo", className: "todo", icon: "fa-check-double", title: "Todo" },
  { href: "/cookbook", className: "cookbook", icon: "fa-utensils", title: "Cookbook" },
  { href: "/meal-planner", className: "meals", icon: "fa-calendar-week", title: "Meal Planner" },
  { href: "/garden", className: "garden", icon: "fa-seedling", title: "Garden Planner" },
  { href: "/harvest-count", className: "harvest", icon: "fa-carrot", title: "Harvest Count" },
  { href: "/energy", className: "energy", icon: "fa-bolt", title: "Energy" },
  { href: "/skull-king", className: "skull", icon: "fa-skull-crossbones", title: "Skull King" },
  { href: "/gifts", className: "gifts", icon: "fa-gift", title: "Gifts" },
];

function LandingBody() {
  useBodyClass("landing-body");

  return (
    <>
      <div className="landing-background" />
      <div className="landing-wrapper">
        <main className="home-apps-shell">
          <header className="home-apps-heading">
            <p>Apps</p>
            <h1>Choose a tool</h1>
          </header>
          <div className="apps-grid">
            {HOME_APPS.map((app) => (
              <a key={app.href} href={app.href} className={`app-card ${app.className}`}>
                <div className="app-card-content">
                  <div className="app-icon" aria-hidden="true">
                    <i className={`fa-solid ${app.icon}`} />
                  </div>
                  <div className="app-info">
                    <h2>{app.title}</h2>
                  </div>
                </div>
                <span className="app-card-arrow" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </main>
        <a
          className="android-download"
          href="/downloads/zusammen.apk?v=16"
          download="zusammen.apk"
        >
          <span className="android-download-icon" aria-hidden="true">
            <i className="fa-brands fa-android" />
          </span>
          <span className="android-download-copy">
            <strong>Download Android app</strong>
          </span>
          <i className="fa-solid fa-download android-download-arrow" aria-hidden="true" />
        </a>
      </div>
    </>
  );
}

export default function Page() {
  return <LandingBody />;
}
