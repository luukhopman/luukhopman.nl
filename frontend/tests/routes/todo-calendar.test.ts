import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  query,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/db", () => ({
  query,
}));

afterEach(() => {
  delete process.env.APP_PASSWORD;
  vi.resetModules();
});

describe("todo calendar routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("returns only open dated todos in the calendar feed", async () => {
    process.env.APP_PASSWORD = "";
    query.mockResolvedValueOnce([
      {
        id: 1,
        title: "With date",
        due_date: "2026-03-24",
        due_time: null,
        completed: false,
        created_at: "2026-03-20T10:00:00.000Z",
      },
    ]);

    const { GET } = await import("@/app/api/todos/calendar/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/todos/calendar"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(body).toContain("SUMMARY:With date");
    expect(body).not.toContain("(done)");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND completed = FALSE"),
    );
  });

  it("returns the authenticated calendar link payload", async () => {
    process.env.APP_PASSWORD = "secret";

    const { GET } = await import("@/app/api/todos/calendar-link/route");
    const response = await GET(
      new NextRequest("https://todo.example.com/api/todos/calendar-link", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "todo.example.com",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      calendar_url: expect.stringContaining("/api/todos/calendar?token="),
      webcal_url: expect.stringContaining("webcal://todo.example.com/api/todos/calendar?token="),
    });
  });

  it("rejects unauthenticated calendar-link requests", async () => {
    process.env.APP_PASSWORD = "secret";
    requireApiAuth.mockReturnValueOnce(
      NextResponse.json({ detail: "Unauthorized" }, { status: 401 }),
    );

    const { GET } = await import("@/app/api/todos/calendar-link/route");
    const response = await GET(
      new NextRequest("https://todo.example.com/api/todos/calendar-link"),
    );

    expect(response.status).toBe(401);
  });
});
