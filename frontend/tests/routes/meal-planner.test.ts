import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/db", () => ({ query, queryOne }));

import { GET, POST } from "@/app/api/meal-planner/route";
import { DELETE, PATCH } from "@/app/api/meal-planner/[entryId]/route";

describe("meal planner routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("loads exactly one requested week", async () => {
    query.mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/meal-planner?start=2026-07-27"),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("entries.meal_date BETWEEN $1 AND $2"),
      ["2026-07-27", "2026-08-02"],
    );
  });

  it("rejects invalid dates and empty meals", async () => {
    const invalidDate = await POST(
      new NextRequest("http://localhost:3000/api/meal-planner", {
        method: "POST",
        body: JSON.stringify({ meal_date: "2026-02-31", meal_type: "dinner", title: "Pasta" }),
      }),
    );
    const emptyMeal = await POST(
      new NextRequest("http://localhost:3000/api/meal-planner", {
        method: "POST",
        body: JSON.stringify({ meal_date: "2026-07-28", meal_type: "dinner" }),
      }),
    );

    expect(invalidDate.status).toBe(400);
    expect(emptyMeal.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("creates a custom meal without requiring a recipe", async () => {
    queryOne.mockResolvedValueOnce({ id: 12 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/meal-planner", {
        method: "POST",
        body: JSON.stringify({
          meal_date: "2026-07-28",
          meal_type: "dinner",
          recipe_id: null,
          title: "Takeaway",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO meal_plan_entries"),
      ["2026-07-28", "dinner", null, "Takeaway", expect.any(String)],
    );
  });

  it("validates ids before deleting meals", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/meal-planner/nope", { method: "DELETE" }),
      { params: Promise.resolve({ entryId: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("updates a dish name without unlinking its recipe", async () => {
    queryOne.mockResolvedValueOnce({ id: 12 });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/meal-planner/12", {
        method: "PATCH",
        body: JSON.stringify({ title: "Friday pasta" }),
      }),
      { params: Promise.resolve({ entryId: "12" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      "UPDATE meal_plan_entries SET title = $1 WHERE id = $2",
      ["Friday pasta", 12],
    );
  });

  it("rejects empty dish names", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/meal-planner/12", {
        method: "PATCH",
        body: JSON.stringify({ title: "   " }),
      }),
      { params: Promise.resolve({ entryId: "12" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
