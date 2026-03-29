import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  requireGiftApiAuth,
  getGiftAuthenticatedUsername,
  validateGiftCredentials,
  createGiftLoginResponse,
  query,
  queryOne,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  requireGiftApiAuth: vi.fn(),
  getGiftAuthenticatedUsername: vi.fn(),
  validateGiftCredentials: vi.fn(),
  createGiftLoginResponse: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/gifts-auth", () => ({
  requireGiftApiAuth,
  getGiftAuthenticatedUsername,
  validateGiftCredentials,
  createGiftLoginResponse,
}));

vi.mock("@/lib/server/db", () => ({
  query,
  queryOne,
}));

import { POST } from "@/app/api/gifts/password/route";

describe("POST /api/gifts/password", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    requireGiftApiAuth.mockReset();
    getGiftAuthenticatedUsername.mockReset();
    validateGiftCredentials.mockReset();
    createGiftLoginResponse.mockReset();
    query.mockReset();
    queryOne.mockReset();

    requireApiAuth.mockReturnValue(null);
    requireGiftApiAuth.mockReturnValue(null);
    getGiftAuthenticatedUsername.mockReturnValue("alice");
    validateGiftCredentials.mockImplementation((value: string | null | undefined) => value?.trim() || null);
    createGiftLoginResponse.mockImplementation((_request: NextRequest, username: string) =>
      NextResponse.json({ message: `updated:${username}` }),
    );
  });

  it("returns auth errors from either auth layer", async () => {
    requireGiftApiAuth.mockReturnValueOnce(
      NextResponse.json({ detail: "Gift auth required" }, { status: 401 }),
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts/password", {
        method: "POST",
        body: JSON.stringify({ password: "new-plan" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid new passwords", async () => {
    validateGiftCredentials.mockReturnValueOnce(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts/password", {
        method: "POST",
        body: JSON.stringify({ password: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Choose a valid gifts password",
    });
  });

  it("rejects reusing the current password", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts/password", {
        method: "POST",
        body: JSON.stringify({ password: "alice" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Choose a different password for this gift plan",
    });
  });

  it("rejects a password that already belongs to another plan", async () => {
    queryOne.mockResolvedValueOnce({ id: 7 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts/password", {
        method: "POST",
        body: JSON.stringify({ password: "brenda" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      detail: "That password is already being used by another gift plan",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("moves the current plan to the new password and refreshes the cookie", async () => {
    queryOne.mockResolvedValueOnce(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/gifts/password", {
        method: "POST",
        body: JSON.stringify({ password: "brenda" }),
      }),
    );

    expect(query).toHaveBeenCalledWith(
      "UPDATE gift_ideas SET owner_username = $2 WHERE owner_username = $1",
      ["alice", "brenda"],
    );
    expect(createGiftLoginResponse).toHaveBeenCalledWith(expect.any(NextRequest), "brenda");
    expect(response.status).toBe(200);
  });
});
