import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, recordPageView } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  recordPageView: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/usage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/usage")>("@/lib/server/usage");
  return { ...actual, recordPageView };
});

describe("POST /api/usage", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    recordPageView.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("records an authenticated page view", async () => {
    const { POST } = await import("@/app/api/usage/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/usage", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" },
        body: JSON.stringify({ path: "/meal-planner?source=home" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(recordPageView).toHaveBeenCalledWith("/meal-planner", "203.0.113.10");
  });

  it("does not record an unauthorized request", async () => {
    const unauthorized = new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
    requireApiAuth.mockReturnValue(unauthorized);
    const { POST } = await import("@/app/api/usage/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/usage", {
        method: "POST",
        body: JSON.stringify({ path: "/meal-planner" }),
      }),
    );

    expect(response).toBe(unauthorized);
    expect(recordPageView).not.toHaveBeenCalled();
  });
});
