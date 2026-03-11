import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadGiftsAuthModules(env: Record<string, string | undefined>) {
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

  return import("@/lib/server/gifts-auth");
}

afterEach(() => {
  vi.resetModules();
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.DOMAIN;
});

describe("gifts auth helpers", () => {
  it("creates a secure gifts auth cookie", async () => {
    const giftsAuth = await loadGiftsAuthModules({
      AUTH_COOKIE_DOMAIN: "example.com",
    });

    const request = new NextRequest("https://example.com/api/gifts/login", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "https",
      },
    });
    const response = giftsAuth.createGiftLoginResponse(request, "my-secret-token");
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain("gifts_auth_token=");
    expect(cookie).toContain("Domain=example.com");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("validates any token securely", async () => {
    const giftsAuth = await loadGiftsAuthModules({});

    expect(giftsAuth.validateGiftCredentials("my-token")).toBe("my-token");
    expect(giftsAuth.validateGiftCredentials(" another-token ")).toBe("another-token");
    expect(giftsAuth.validateGiftCredentials("")).toBeNull();
    expect(giftsAuth.validateGiftCredentials(null)).toBeNull();
  });

  it("reads the authenticated gifts token back from the cookie", async () => {
    const giftsAuth = await loadGiftsAuthModules({
      APP_PASSWORD: "test-secret-password-pepper",
    });

    const loginRequest = new NextRequest("http://localhost:3000/api/gifts/login", {
      method: "POST",
    });
    const loginResponse = giftsAuth.createGiftLoginResponse(loginRequest, "super-secret");
    const cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const authenticatedRequest = new NextRequest("http://localhost:3000/api/gifts", {
      headers: {
        cookie,
      },
    });

    expect(giftsAuth.getGiftAuthenticatedUsername(authenticatedRequest)).toBe("super-secret");
  });
});
