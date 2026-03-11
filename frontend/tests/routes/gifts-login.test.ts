import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoute(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of [
    "APP_PASSWORD",
    "AUTH_COOKIE_DOMAIN",
    "DOMAIN",
  ]) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  const route = await import("@/app/api/gifts/login/route");
  const config = await import("@/lib/server/config");
  return { route, config };
}

afterEach(() => {
  vi.resetModules();
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.DOMAIN;
});

describe("POST /api/gifts/login", () => {
  it("requires the main app auth cookie first", async () => {
    const { route } = await loadRoute({
      APP_PASSWORD: "main-secret",
    });

    const response = await route.POST(
      new NextRequest("http://localhost:3000/api/gifts/login", {
        method: "POST",
        body: JSON.stringify({ password: "my-token" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("sets the gifts auth cookie with any token provided", async () => {
    const { route, config } = await loadRoute({
      APP_PASSWORD: "main-secret",
    });

    const response = await route.POST(
      new NextRequest("http://localhost:3000/api/gifts/login", {
        method: "POST",
        headers: {
          cookie: `auth_token=${config.AUTH_TOKEN}`,
        },
        body: JSON.stringify({ password: "any-secret-token" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("gifts_auth_token=");
  });

  it("rejects login if token is empty", async () => {
    const { route, config } = await loadRoute({
      APP_PASSWORD: "main-secret",
    });

    const response = await route.POST(
      new NextRequest("http://localhost:3000/api/gifts/login", {
        method: "POST",
        headers: {
          cookie: `auth_token=${config.AUTH_TOKEN}`,
        },
        body: JSON.stringify({ password: "  " }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
