import crypto from "node:crypto";

function normalizeCookieDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let normalized = value.trim().toLowerCase();
  if (normalized.includes("://")) {
    normalized = normalized.split("://", 2)[1] ?? normalized;
  }
  normalized = normalized.replace(/^\.+/, "").split("/", 1)[0] ?? normalized;

  if (normalized.includes(":") && !normalized.startsWith("[")) {
    normalized = normalized.split(":", 1)[0] ?? normalized;
  }

  return normalized || undefined;
}

export const APP_PASSWORD = process.env.APP_PASSWORD;
export const AUTH_MAX_AGE_SECONDS = Number(
  process.env.AUTH_MAX_AGE_SECONDS ?? `${10 * 365 * 24 * 60 * 60}`,
);
export const AUTH_TOKEN = APP_PASSWORD
  ? crypto.createHash("sha256").update(APP_PASSWORD).digest("hex")
  : undefined;
export const TODO_CALENDAR_TOKEN = APP_PASSWORD
  ? crypto.createHash("sha256").update(`todo-calendar:${APP_PASSWORD}`).digest("hex")
  : undefined;
export const AUTH_COOKIE_DOMAIN = normalizeCookieDomain(
  process.env.AUTH_COOKIE_DOMAIN ?? process.env.DOMAIN,
);
export const DATABASE_URL = process.env.DATABASE_URL;
const rawGeminiApiKey =
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_API_KEY ??
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;
export const GEMINI_API_KEY = rawGeminiApiKey?.trim() || undefined;
export const GEMINI_MODEL =
  (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash";
export const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
