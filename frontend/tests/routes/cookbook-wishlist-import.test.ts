import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  query,
  bumpResourceVersion,
} = vi.hoisted(() => ({
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

import { POST } from "@/app/api/cookbook/wishlist/import/route";

describe("cookbook wishlist import route", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    bumpResourceVersion.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("skips duplicate ingredients and only inserts new ones", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT name, store, is_deleted FROM products")) {
        return [{ name: "Onion", store: "Market", is_deleted: false }];
      }

      return [];
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/cookbook/wishlist/import", {
        method: "POST",
        body: JSON.stringify({
          ingredients: ["Onion", "2 cups stock"],
          store: "Market",
          recipe_share_token: "share_token_123456",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(bumpResourceVersion).toHaveBeenCalledWith("wishlist");
    await expect(response.json()).resolves.toEqual({ added: 1, skipped: 1 });
  });
});
