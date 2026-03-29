"use client";

import { FormEvent, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLockedBody } from "@/lib/browser";

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
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);

  useLockedBody(Boolean(pendingPassword));

  async function submitPassword(nextPassword: string, allowCreate = false) {
    return fetch("/api/gifts/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: nextPassword, allowCreate }),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setStatus("Opening gifts...");

    try {
      const response = await submitPassword(password);

      if (response.status === 409) {
        const body = (await response.json()) as { confirmCreate?: boolean; detail?: string };

        if (body.confirmCreate) {
          setPendingPassword(password);
          setStatus("");
          return;
        }

        setStatus(body.detail || "Couldn't open gifts.");
        return;
      }

      if (!response.ok) {
        setPassword("");
        setStatus("Wrong gifts password. Try again.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      window.location.href = normalizeRedirect(params.get("redirect"));
    } catch (error) {
      console.error(error);
      setStatus("Couldn't connect. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmCreate() {
    if (submitting || !pendingPassword) return;

    setPendingPassword(null);
    setSubmitting(true);
    setStatus("Opening new gift plan...");

    try {
      const response = await submitPassword(pendingPassword, true);

      if (!response.ok) {
        setStatus("Couldn't open new gift plan. Try again.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      window.location.href = normalizeRedirect(params.get("redirect"));
    } catch (error) {
      console.error(error);
      setStatus("Couldn't connect. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
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
          <h1 className="gifts-login-title">Gifts</h1>
          <p className="gifts-login-copy">
            This section has its own password. Use the gifts password to see and manage private gift plans.
          </p>
          <label className="gifts-login-label" htmlFor="gift-password">
            Gifts password
          </label>
          <input
            type="password"
            id="gift-password"
            name="password"
            placeholder="Enter gifts password"
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
            Open gifts
          </button>
          <div className="gifts-login-status" aria-live="polite">
            {status}
          </div>
        </form>
      </main>

      <ConfirmDialog
        open={Boolean(pendingPassword)}
        title="Open a new gift plan?"
        message="No gift plans exist for this password yet. You can open a new empty plan and start adding ideas."
        confirmLabel="Open new plan"
        cancelLabel="Not now"
        confirmTone="primary"
        iconClassName="fa-solid fa-gift"
        confirmIconClassName="fa-solid fa-arrow-right"
        onCancel={() => {
          setPendingPassword(null);
          setStatus("Open cancelled.");
        }}
        onConfirm={() => void handleConfirmCreate()}
      />
    </>
  );
}
