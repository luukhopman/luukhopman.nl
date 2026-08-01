"use client";

import { useBodyClass } from "../../lib/browser";

function LandingBody() {
  useBodyClass("landing-body");

  return (
    <>
      <div className="landing-background" />
      <div className="landing-wrapper">
        <main className="apps-grid">
          <a href="/wishlist" className="app-card wishlist">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-basket-shopping" />
              </div>
              <div className="app-info">
                <h2>Wishlist</h2>
              </div>
            </div>
          </a>

          <a href="/lists" className="app-card lists">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-list-check" />
              </div>
              <div className="app-info">
                <h2>Lists</h2>
              </div>
            </div>
          </a>

          <a href="/todo" className="app-card todo">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-check-double" />
              </div>
              <div className="app-info">
                <h2>Todo</h2>
              </div>
            </div>
          </a>

          <a href="/cookbook" className="app-card cookbook">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-utensils" />
              </div>
              <div className="app-info">
                <h2>Cookbook</h2>
              </div>
            </div>
          </a>

          <a href="/meal-planner" className="app-card meals">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-calendar-week" />
              </div>
              <div className="app-info">
                <h2>Meal Planner</h2>
              </div>
            </div>
          </a>

          <a href="/garden" className="app-card garden">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-seedling" />
              </div>
              <div className="app-info">
                <h2>Garden Planner</h2>
              </div>
            </div>
          </a>

          <a href="/gifts" className="app-card gifts">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-gift" />
              </div>
              <div className="app-info">
                <h2>Gifts</h2>
              </div>
            </div>
          </a>
        </main>
        <a
          className="android-download"
          href="/downloads/zusammen.apk?v=10"
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
