import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/db", () => ({ query, queryOne }));

import { GET, POST } from "@/app/api/energy/route";
import { PATCH } from "@/app/api/energy/prices/route";

describe("energy routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("loads readings together with current prices", async () => {
    query.mockResolvedValueOnce([]);
    queryOne.mockResolvedValueOnce({
      fixed_monthly_cost: 10.9,
      variable_cost_per_kwh: 0.349,
      currency: "EUR",
      updated_at: "2026-08-05T00:00:00.000Z",
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/energy"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      readings: [],
      prices: {
        fixed_monthly_cost: 10.9,
        variable_cost_per_kwh: 0.349,
        currency: "EUR",
        updated_at: "2026-08-05T00:00:00.000Z",
      },
    });
  });

  it("upserts a meter reading for a date", async () => {
    queryOne.mockResolvedValueOnce({
      id: 21,
      reading_date: "2026-08-05",
      meter_kwh: 111111,
      created_at: "2026-08-05T00:00:00.000Z",
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/energy", {
        method: "POST",
        body: JSON.stringify({ reading_date: "2026-08-05", meter_kwh: 111111 }),
      }),
    );

    expect(response.status).toBe(201);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (reading_date)"),
      ["2026-08-05", 111111, expect.any(String)],
    );
  });

  it("updates both energy price fields", async () => {
    queryOne.mockResolvedValueOnce({
      fixed_monthly_cost: 12,
      variable_cost_per_kwh: 0.31,
      currency: "EUR",
      updated_at: "2026-08-05T00:00:00.000Z",
    });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/energy/prices", {
        method: "PATCH",
        body: JSON.stringify({ fixed_monthly_cost: 12, variable_cost_per_kwh: 0.31 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE energy_price_settings"),
      [12, 0.31, expect.any(String)],
    );
  });

  it("rejects invalid readings and prices", async () => {
    const invalidReading = await POST(
      new NextRequest("http://localhost:3000/api/energy", {
        method: "POST",
        body: JSON.stringify({ reading_date: "2026-02-31", meter_kwh: 1 }),
      }),
    );
    const invalidPrice = await PATCH(
      new NextRequest("http://localhost:3000/api/energy/prices", {
        method: "PATCH",
        body: JSON.stringify({ fixed_monthly_cost: -1, variable_cost_per_kwh: 0.31 }),
      }),
    );

    expect(invalidReading.status).toBe(400);
    expect(invalidPrice.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });
});
