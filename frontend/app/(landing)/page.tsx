"use client";

import Link from "next/link";

import { useBodyClass } from "../../lib/browser";

function LandingBody() {
  useBodyClass("landing-body");

  return (
    <>
      <div className="landing-background" />
      <div className="landing-wrapper">
        <main className="apps-grid">
          <Link href="/wishlist" className="app-card wishlist">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-basket-shopping" />
              </div>
              <div className="app-info">
                <h2>Wishlist</h2>
                <p>Track the items we need to buy and things we want.</p>
              </div>
            </div>
            <div className="app-card-arrow">
              <i className="fa-solid fa-chevron-right" />
            </div>
          </Link>

          <Link href="/todo" className="app-card todo">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-check-double" />
              </div>
              <div className="app-info">
                <h2>Todo</h2>
                <p>Keep a lightweight list of tasks and tick them off quickly.</p>
              </div>
            </div>
            <div className="app-card-arrow">
              <i className="fa-solid fa-chevron-right" />
            </div>
          </Link>

          <Link href="/cookbook" className="app-card cookbook">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-utensils" />
              </div>
              <div className="app-info">
                <h2>Cookbook</h2>
                <p>Explore recipes and save our favorite family meals.</p>
              </div>
            </div>
            <div className="app-card-arrow">
              <i className="fa-solid fa-chevron-right" />
            </div>
          </Link>

          <Link href="/gifts" className="app-card gifts">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-gift" />
              </div>
              <div className="app-info">
                <h2>Gifts</h2>
                <p>Save private gift ideas for different people behind a separate gifts login.</p>
              </div>
            </div>
            <div className="app-card-arrow">
              <i className="fa-solid fa-chevron-right" />
            </div>
          </Link>
        </main>
      </div>
    </>
  );
}

export default function Page() {
  return <LandingBody />;
}
