import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuthModules(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of ["APP_PASSWORD", "AUTH_COOKIE_DOMAIN", "DOMAIN"]) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  const auth = await import("@/lib/server/auth");
  const config = await import("@/lib/server/config");
  return { auth, config };
}

afterEach(() => {
  vi.resetModules();
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.DOMAIN;
});

describe("auth helpers", () => {
  it("creates a secure auth cookie with the configured domain", async () => {
    const { auth } = await loadAuthModules({
      APP_PASSWORD: "secret",
      AUTH_COOKIE_DOMAIN: "example.com",
    });

    const request = new NextRequest("https://example.com/api/login", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "https",
      },
    });
    const response = auth.createLoginResponse(request);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain("auth_token=");
    expect(cookie).toContain("Domain=example.com");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Secure");
  });

  it("rejects unauthenticated api requests when a password is configured", async () => {
    const { auth } = await loadAuthModules({ APP_PASSWORD: "secret" });

    const request = new NextRequest("http://localhost:3000/api/todos");
    const response = auth.requireApiAuth(request);

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ detail: "Unauthorized" });
  });

  it("accepts requests carrying the expected auth token", async () => {
    const { auth, config } = await loadAuthModules({ APP_PASSWORD: "secret" });

    const request = new NextRequest("http://localhost:3000/api/todos", {
      headers: {
        cookie: `auth_token=${config.AUTH_TOKEN}`,
      },
    });

    expect(auth.requireApiAuth(request)).toBeNull();
  });
});
