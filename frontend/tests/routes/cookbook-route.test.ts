import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  query,
  queryOne,
  generateUniqueRecipeShareToken,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  generateUniqueRecipeShareToken: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/db", () => ({
  query,
  queryOne,
}));

vi.mock("@/lib/server/recipes", () => ({
  generateUniqueRecipeShareToken,
}));

import { POST } from "@/app/api/cookbook/route";
import { PATCH } from "@/app/api/cookbook/[recipeId]/route";

describe("cookbook routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    generateUniqueRecipeShareToken.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("creates recipes with an unguessable share token", async () => {
    generateUniqueRecipeShareToken.mockResolvedValueOnce("share_token_123456");
    queryOne.mockResolvedValueOnce({ id: 11 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/cookbook", {
        method: "POST",
        body: JSON.stringify({
          title: "Soup",
          ingredients: "1 onion",
          instructions: "Cook it",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(generateUniqueRecipeShareToken).toHaveBeenCalledWith({ query });
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO recipes (share_token, title, course, url, ingredients, instructions, notes, created_at)"),
      [
        "share_token_123456",
        "Soup",
        null,
        null,
        "1 onion",
        "Cook it",
        null,
        expect.any(String),
      ],
    );
  });

  it("keeps recipe updates protected by auth", async () => {
    requireApiAuth.mockReturnValueOnce(
      NextResponse.json({ detail: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/cookbook/5", {
        method: "PATCH",
        body: JSON.stringify({ title: "Changed" }),
      }),
      { params: Promise.resolve({ recipeId: "5" }) },
    );

    expect(response.status).toBe(401);
  });
});
