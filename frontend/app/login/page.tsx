"use client";

import { FormEvent, useState } from "react";

function normalizeRedirect(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setStatus("Logging in...");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setPassword("");
        setStatus("Wrong password.");
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
    <main className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#faf8f3] px-4 py-4 text-[#2f2417] max-[600px]:items-start">
      <form
        className="w-full max-w-[360px] -translate-y-7 max-[600px]:mt-[18vh] max-[600px]:translate-y-0"
        autoComplete="on"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-2 grid h-12 w-12 place-items-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" role="img" aria-label="Lock" className="h-6 w-6 text-[#4b5563]">
            <rect
              x="5"
              y="10"
              width="14"
              height="10"
              rx="2.5"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M8 10V7.8a4 4 0 1 1 8 0V10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <input
          type="password"
          id="password"
          placeholder="Password"
          required
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (status) setStatus("");
          }}
          className="w-full rounded-xl border border-[#ddcfbc] bg-white px-4 py-[0.95rem] text-base text-[#2f2417] outline-none transition focus:border-[#c8ab85] focus:shadow-[0_0_0_3px_rgba(245,189,99,0.25)]"
        />
        <button
          id="submit-btn"
          type="submit"
          disabled={submitting}
          className="mt-[0.6rem] w-full rounded-xl border border-[#3f5d31] bg-[#4d6b3d] px-4 py-[0.82rem] text-[0.94rem] font-bold text-white transition hover:border-[#324a27] hover:bg-[#445f36] disabled:cursor-not-allowed disabled:opacity-70"
        >
          Continue
        </button>
        <div className="mt-[0.55rem] min-h-[1.2rem] text-[0.85rem] text-[#8a3f3f]">
          {status}
        </div>
      </form>
    </main>
  );
}
