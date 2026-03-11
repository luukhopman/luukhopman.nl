import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  requireGiftApiAuth,
  getGiftAuthenticatedUsername,
  query,
  queryOne,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  requireGiftApiAuth: vi.fn(),
  getGiftAuthenticatedUsername: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/gifts-auth", () => ({
  requireGiftApiAuth,
  getGiftAuthenticatedUsername,
}));

vi.mock("@/lib/server/db", () => ({
  query,
  queryOne,
}));

import { GET, POST } from "@/app/api/gifts/route";
import { PATCH, DELETE } from "@/app/api/gifts/[giftId]/route";

describe("gifts routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    requireGiftApiAuth.mockReset();
    getGiftAuthenticatedUsername.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
    requireGiftApiAuth.mockReturnValue(null);
    getGiftAuthenticatedUsername.mockReturnValue("alice");
  });

  it("lists only the current user's gift ideas", async () => {
    query.mockResolvedValueOnce([]);

    const response = await GET(new NextRequest("http://localhost:3000/api/gifts"));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE owner_username = $1"),
      ["alice"],
    );
  });

  it("validates required fields when creating a gift idea", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts", {
        method: "POST",
        body: JSON.stringify({ recipient_name: "", title: "" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Recipient name is required",
    });
  });

  it("creates a gift idea for the authenticated gifts user", async () => {
    queryOne.mockResolvedValueOnce({ id: 12 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts", {
        method: "POST",
        body: JSON.stringify({
          recipient_name: "Bruna",
          title: "Ceramic vase",
          notes: "Blue tones",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(queryOne.mock.calls[0]?.[1]?.[0]).toBe("alice");
  });

  it("rejects invalid gift ids", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/gifts/nope", {
        method: "PATCH",
        body: JSON.stringify({ purchased: true }),
      }),
      { params: Promise.resolve({ giftId: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("deletes only gift ideas owned by the authenticated gifts user", async () => {
    queryOne.mockResolvedValueOnce({ id: 4 });

    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/gifts/4", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ giftId: "4" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      "DELETE FROM gift_ideas WHERE id = $1 AND owner_username = $2",
      [4, "alice"],
    );
  });

  it("returns 404 when another gifts user tries to edit a gift idea", async () => {
    queryOne.mockResolvedValueOnce(null);

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/gifts/4", {
        method: "PATCH",
        body: JSON.stringify({ title: "Hidden" }),
      }),
      { params: Promise.resolve({ giftId: "4" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: "Gift idea not found",
    });
  });

  it("returns auth responses from either auth layer", async () => {
    requireGiftApiAuth.mockReturnValueOnce(
      NextResponse.json({ detail: "Gift auth required" }, { status: 401 }),
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/gifts"));

    expect(response.status).toBe(401);
  });
});
