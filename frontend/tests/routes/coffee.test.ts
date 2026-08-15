import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/db", () => ({ query, queryOne }));

import { DELETE, PATCH } from "@/app/api/coffee/[coffeeId]/route";
import { GET, POST } from "@/app/api/coffee/route";

const coffeeEntry = {
  id: 4,
  name: "Morning Blend",
  brand: "North Roasters",
  kind: "Beans",
  rating: 5,
  verdict: "liked",
  purchased_on: "2026-08-15",
  notes: "Chocolate and hazelnut.",
  created_at: "2026-08-15T08:00:00.000Z",
  updated_at: "2026-08-15T08:00:00.000Z",
};

describe("coffee routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("loads coffee entries", async () => {
    query.mockResolvedValueOnce([coffeeEntry]);

    const response = await GET(new NextRequest("http://localhost:3000/api/coffee"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ coffees: [coffeeEntry] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM coffee_entries"));
  });

  it("records a coffee entry", async () => {
    queryOne.mockResolvedValueOnce(coffeeEntry);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/coffee", {
        method: "POST",
        body: JSON.stringify({
          name: "  Morning   Blend ",
          brand: "North Roasters",
          kind: "Beans",
          rating: 5,
          verdict: "liked",
          purchased_on: "2026-08-15",
          notes: "Chocolate and hazelnut.",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(coffeeEntry);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO coffee_entries"),
      ["Morning Blend", "North Roasters", "Beans", 5, "liked", "2026-08-15", "Chocolate and hazelnut.", expect.any(String)],
    );
  });

  it("rejects invalid ratings without writing", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/coffee", {
        method: "POST",
        body: JSON.stringify({
          name: "Morning Blend",
          kind: "Beans",
          rating: 6,
          verdict: "liked",
          purchased_on: "2026-08-15",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("updates an existing coffee entry", async () => {
    queryOne.mockResolvedValueOnce({ ...coffeeEntry, rating: 4, verdict: "okay" });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/coffee/4", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Morning Blend",
          brand: "North Roasters",
          kind: "Beans",
          rating: 4,
          verdict: "okay",
          purchased_on: "2026-08-15",
          notes: "Still good, but less bright than expected.",
        }),
      }),
      { params: Promise.resolve({ coffeeId: "4" }) },
    );

    expect(response.status).toBe(200);
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("UPDATE coffee_entries"), [
      "Morning Blend",
      "North Roasters",
      "Beans",
      4,
      "okay",
      "2026-08-15",
      "Still good, but less bright than expected.",
      expect.any(String),
      4,
    ]);
  });

  it("deletes an existing coffee entry", async () => {
    queryOne.mockResolvedValueOnce({ id: 4 });

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/coffee/4", { method: "DELETE" }),
      { params: Promise.resolve({ coffeeId: "4" }) },
    );

    expect(response.status).toBe(200);
    expect(queryOne).toHaveBeenCalledWith("SELECT id FROM coffee_entries WHERE id = $1", [4]);
    expect(query).toHaveBeenCalledWith("DELETE FROM coffee_entries WHERE id = $1", [4]);
  });
});
