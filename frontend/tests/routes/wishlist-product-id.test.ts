import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  query,
  queryOne,
  bumpResourceVersion,
} = vi.hoisted(() => ({
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

import { DELETE } from "@/app/api/wishlist/products/[productId]/route";

describe("wishlist product detail route", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    bumpResourceVersion.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("rejects invalid product ids", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/wishlist/products/nope", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ productId: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("hard deletes products when requested", async () => {
    queryOne.mockResolvedValueOnce({ id: 9 });

    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/wishlist/products/9?hard=true",
        { method: "DELETE" },
      ),
      { params: Promise.resolve({ productId: "9" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith("DELETE FROM products WHERE id = $1", [9]);
    expect(bumpResourceVersion).toHaveBeenCalledWith("wishlist");
  });
});
