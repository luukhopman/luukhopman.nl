import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne, bumpResourceVersion } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  bumpResourceVersion: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/db", () => ({
  query,
  queryOne,
}));

vi.mock("@/lib/server/realtime", () => ({
  RESOURCE_WISHLIST: "wishlist",
  bumpResourceVersion,
}));

import { GET } from "@/app/api/wishlist/products/route";

describe("wishlist products route", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    bumpResourceVersion.mockReset();
    requireApiAuth.mockReturnValue(null);
    query.mockResolvedValue([]);
  });

  it("only returns deleted products from the last 30 days", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/wishlist/products"),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, values] = query.mock.calls[1];
    expect(sql).toContain("is_deleted = FALSE");
    expect(sql).toContain("deleted_at >= $1");
    expect(values).toHaveLength(1);
    expect(Number.isNaN(new Date(values[0]).getTime())).toBe(false);
  });
});
