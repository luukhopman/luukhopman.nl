"use client";

import { FormEvent, useState } from "react";

function normalizeRedirect(value: string | null): string {
  if (!value) return "/gifts";
  if (!value.startsWith("/")) return "/gifts";
  if (value.startsWith("//")) return "/gifts";
  return value;
}

export function GiftsLoginForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setStatus("Unlocking gifts...");

    try {
      const response = await fetch("/api/gifts/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setPassword("");
        setStatus("Invalid gift login.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      window.location.href = normalizeRedirect(params.get("redirect"));
    } catch (error) {
      console.error(error);
      setStatus("Connection error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="gifts-login-main">
      <form
        className="gifts-login-card"
        autoComplete="on"
        onSubmit={handleSubmit}
      >
        <div
          className="gifts-login-icon"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path d="M4 9.5h16V20H4V9.5Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 9.5h16V6.5H4v3Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 6.5V20" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M9.2 6.3c-1.6 0-2.7-1-2.7-2.3 0-1.1.9-2 2.1-2 .9 0 1.7.5 2.3 1.5l1.1 2.8H9.2Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M14.8 6.3c1.6 0 2.7-1 2.7-2.3 0-1.1-.9-2-2.1-2-.9 0-1.7.5-2.3 1.5L12 6.3h2.8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="gifts-login-title">
          Gifts
        </h1>
        <input
          type="password"
          id="gift-password"
          placeholder="Token / Password"
          required
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (status) setStatus("");
          }}
          className="gifts-login-input"
        />
        <button
          type="submit"
          disabled={submitting}
          className="gifts-login-btn"
        >
          Continue
        </button>
        <div className="gifts-login-status">
          {status}
        </div>
      </form>
    </main>
  );
}
