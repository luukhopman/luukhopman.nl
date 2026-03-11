import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoute(password = "secret") {
  vi.resetModules();
  process.env.APP_PASSWORD = password;
  return import("@/app/api/login/route");
}

afterEach(() => {
  delete process.env.APP_PASSWORD;
  vi.resetModules();
});

describe("POST /api/login", () => {
  it("returns 401 for a wrong password", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: "Invalid password" });
  });

  it("sets the auth cookie for a valid password", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/login", {
        method: "POST",
        body: JSON.stringify({ password: "secret" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("auth_token=");
  });
});
