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

import { GET, POST } from "@/app/api/wishlist/products/route";

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

  it("uses explicit text types when adding products to legacy schemas", async () => {
    queryOne.mockResolvedValue({ id: 42 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/wishlist/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Coffee",
          store: "Corner shop",
          url: "https://example.com/coffee",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const [sql, values] = queryOne.mock.calls[0];
    expect(sql).toContain("$2::text");
    expect(sql).toContain("store::text IS NOT DISTINCT FROM $2::text");
    expect(values.slice(0, 3)).toEqual([
      "Coffee",
      "Corner shop",
      "https://example.com/coffee",
    ]);
    expect(bumpResourceVersion).toHaveBeenCalledWith("wishlist");
  });
});
