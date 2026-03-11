import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoute(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const key of ["APP_PASSWORD", "AUTH_COOKIE_DOMAIN", "DOMAIN"]) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  const route = await import("@/app/api/gifts/logout/route");
  const config = await import("@/lib/server/config");
  return { route, config };
}

afterEach(() => {
  vi.resetModules();
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.DOMAIN;
});

describe("POST /api/gifts/logout", () => {
  it("requires the main app auth cookie", async () => {
    const { route } = await loadRoute({
      APP_PASSWORD: "main-secret",
    });

    const response = await route.POST(
      new NextRequest("http://localhost:3000/api/gifts/logout", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("clears the gifts auth cookie", async () => {
    const { route, config } = await loadRoute({
      APP_PASSWORD: "main-secret",
    });

    const response = await route.POST(
      new NextRequest("http://localhost:3000/api/gifts/logout", {
        method: "POST",
        headers: {
          cookie: `auth_token=${config.AUTH_TOKEN}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("gifts_auth_token=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
