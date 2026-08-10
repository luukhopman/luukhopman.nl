"use client";

import { useBodyClass } from "../../lib/browser";

function LandingBody() {
  useBodyClass("landing-body");

  return (
    <>
      <div className="landing-background" />
      <div className="landing-wrapper">
        <main className="home-landing-card">
          <span className="home-landing-icon" aria-hidden="true">
            <i className="fa-solid fa-house" />
          </span>
          <p className="home-landing-kicker">Home</p>
          <h1>Choose a tool</h1>
          <p className="home-landing-copy">Use the dock for your everyday tools. Open More for everything else.</p>
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
