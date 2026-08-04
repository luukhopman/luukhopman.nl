"use client";

import { useBodyClass } from "../../lib/browser";

function LandingBody() {
  useBodyClass("landing-body");

  return (
    <>
      <div className="landing-background" />
      <div className="landing-wrapper">
        <header className="landing-header">
          <span className="landing-kicker">Home</span>
          <h1>Household tools</h1>
          <p>Choose a tool</p>
        </header>
        <main className="apps-grid">
          <a href="/wishlist" className="app-card wishlist">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-basket-shopping" />
              </div>
              <div className="app-info">
                <h2>Wishlist</h2>
                <p>Things to buy</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/lists" className="app-card lists">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-list-check" />
              </div>
              <div className="app-info">
                <h2>Lists</h2>
                <p>Shared lists</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/todo" className="app-card todo">
            <div className="app-card-content">
              <div className="app-icon shadow-todo">
                <i className="fa-solid fa-check-double" />
              </div>
              <div className="app-info">
                <h2>Todo</h2>
                <p>Tasks and reminders</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/cookbook" className="app-card cookbook">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-utensils" />
              </div>
              <div className="app-info">
                <h2>Cookbook</h2>
                <p>Saved recipes</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/meal-planner" className="app-card meals">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-calendar-week" />
              </div>
              <div className="app-info">
                <h2>Meal Planner</h2>
                <p>Plan meals for the week</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/garden" className="app-card garden">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-seedling" />
              </div>
              <div className="app-info">
                <h2>Garden Planner</h2>
                <p>Plan what to grow</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/harvest-count" className="app-card harvest">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-carrot" />
              </div>
              <div className="app-info">
                <h2>Harvest Count</h2>
                <p>Record what you pick</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>

          <a href="/gifts" className="app-card gifts">
            <div className="app-card-content">
              <div className="app-icon shadow-recipes">
                <i className="fa-solid fa-gift" />
              </div>
              <div className="app-info">
                <h2>Gifts</h2>
                <p>Gift ideas and notes</p>
              </div>
            </div>
            <span className="app-card-arrow" aria-hidden="true">›</span>
          </a>
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
