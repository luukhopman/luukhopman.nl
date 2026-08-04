import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/db", () => ({ query, queryOne }));

import { DELETE } from "@/app/api/harvest-count/[entryId]/route";
import { POST } from "@/app/api/harvest-count/route";

describe("harvest count routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("records a positive harvest quantity for a vegetable", async () => {
    queryOne
      .mockResolvedValueOnce({ id: 4, name: "Tomatoes" })
      .mockResolvedValueOnce({
        id: 9,
        vegetable_id: 4,
        quantity: 50,
        unit: "count",
        harvested_on: "2026-08-04",
        created_at: "2026-08-04T10:00:00.000Z",
      });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/harvest-count", {
        method: "POST",
        body: JSON.stringify({
          vegetable: "Tomatoes",
          quantity: 50,
          harvested_on: "2026-08-04",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: 9,
      vegetable_name: "Tomatoes",
      quantity: 50,
      unit: "count",
    });
    expect(queryOne).toHaveBeenCalledTimes(2);
  });

  it("accepts decimal gram quantities", async () => {
    queryOne
      .mockResolvedValueOnce({ id: 4, name: "Tomatoes" })
      .mockResolvedValueOnce({
        id: 10,
        vegetable_id: 4,
        quantity: 1.25,
        unit: "g",
        harvested_on: "2026-08-04",
        created_at: "2026-08-04T11:00:00.000Z",
      });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/harvest-count", {
        method: "POST",
        body: JSON.stringify({
          vegetable: "Tomatoes",
          quantity: 1.25,
          unit: "g",
          harvested_on: "2026-08-04",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      quantity: 1.25,
      unit: "g",
    });
  });

  it("rejects invalid quantities before touching the database", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/harvest-count", {
        method: "POST",
        body: JSON.stringify({ vegetable: "Carrots", quantity: 0 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("rejects fractional count quantities", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/harvest-count", {
        method: "POST",
        body: JSON.stringify({ vegetable: "Carrots", quantity: 1.5, unit: "count" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("validates harvest entry ids before deleting", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/harvest-count/nope", { method: "DELETE" }),
      { params: Promise.resolve({ entryId: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });
});
