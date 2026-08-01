import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  createFeedbackItem,
  getFeedbackItems,
  updateFeedbackStatus,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  createFeedbackItem: vi.fn(),
  getFeedbackItems: vi.fn(),
  updateFeedbackStatus: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/feedback", () => ({
  createFeedbackItem,
  getFeedbackItems,
  normalizeFeedbackMessage: (value: unknown) => {
    const message = String(value ?? "").trim();
    return message && message.length <= 2000 ? message : null;
  },
  normalizeFeedbackPath: (value: unknown) => {
    const path = String(value ?? "").trim();
    return path.startsWith("/") && !path.startsWith("//") && path.length <= 500 ? path : null;
  },
  parseFeedbackStatus: (value: unknown) =>
    ["open", "in_progress", "done"].includes(String(value)) ? String(value) : null,
  updateFeedbackStatus,
}));

import { GET, POST } from "@/app/api/feedback/route";
import { PATCH } from "@/app/api/feedback/[feedbackId]/route";

describe("feedback routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    createFeedbackItem.mockReset();
    getFeedbackItems.mockReset();
    updateFeedbackStatus.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("creates feedback with its page path", async () => {
    const item = {
      id: 4,
      pagePath: "/meal-planner",
      message: "Keep the recipe sheet open in the planner",
      status: "open",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    createFeedbackItem.mockResolvedValueOnce(item);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({ page_path: "/meal-planner", message: item.message }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createFeedbackItem).toHaveBeenCalledWith("/meal-planner", item.message);
    await expect(response.json()).resolves.toEqual(item);
  });

  it("rejects empty feedback", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({ page_path: "/cookbook", message: "  " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createFeedbackItem).not.toHaveBeenCalled();
  });

  it("protects backlog reads and status changes", async () => {
    const unauthorized = NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    requireApiAuth.mockReturnValueOnce(unauthorized);

    const getResponse = await GET(
      new NextRequest("http://localhost:3000/api/feedback?status=open"),
    );
    expect(getResponse).toBe(unauthorized);

    requireApiAuth.mockReturnValue(null);
    updateFeedbackStatus.mockResolvedValueOnce({ id: 4, status: "done" });
    const patchResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/feedback/4", {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      }),
      { params: Promise.resolve({ feedbackId: "4" }) },
    );

    expect(patchResponse.status).toBe(200);
    expect(updateFeedbackStatus).toHaveBeenCalledWith(4, "done");
  });
});
