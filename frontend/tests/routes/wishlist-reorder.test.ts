import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, bumpResourceVersion } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  bumpResourceVersion: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/db", () => ({
  query,
}));

vi.mock("@/lib/server/realtime", () => ({
  RESOURCE_WISHLIST: "wishlist",
  bumpResourceVersion,
}));

import { PATCH } from "@/app/api/wishlist/products/reorder/route";

describe("wishlist reorder route", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    bumpResourceVersion.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("updates product positions in one query", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/wishlist/products/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [9, 3, 12] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([9, 3, 12]);
    expect(query.mock.calls[0][0]).toContain("WHEN $1 THEN 1");
    expect(query.mock.calls[0][0]).toContain("WHEN $3 THEN 3");
    expect(bumpResourceVersion).toHaveBeenCalledWith("wishlist");
  });

  it("rejects duplicate or invalid product ids", async () => {
    const duplicateResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/wishlist/products/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [2, 2] }),
      }),
    );
    const invalidResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/wishlist/products/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [] }),
      }),
    );

    expect(duplicateResponse.status).toBe(400);
    expect(invalidResponse.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
