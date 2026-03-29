import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  createGiftLoginResponse,
  getGiftAuthenticatedUsername,
  requireGiftApiAuth,
  validateGiftCredentials,
} from "@/lib/server/gifts-auth";
import { query, queryOne } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request) ?? requireGiftApiAuth(request);
  if (unauthorized) return unauthorized;

  const currentUsername = getGiftAuthenticatedUsername(request);
  const body = (await request.json()) as { password?: string };
  const nextUsername = validateGiftCredentials(body.password);

  if (!currentUsername) {
    return NextResponse.json({ detail: "Gift auth required" }, { status: 401 });
  }

  if (!nextUsername) {
    return NextResponse.json({ detail: "Choose a valid gifts password" }, { status: 400 });
  }

  if (nextUsername === currentUsername) {
    return NextResponse.json(
      { detail: "Choose a different password for this gift plan" },
      { status: 400 },
    );
  }

  const existingGiftIdea = await queryOne<{ id: number }>(
    "SELECT id FROM gift_ideas WHERE owner_username = $1 LIMIT 1",
    [nextUsername],
  );

  if (existingGiftIdea) {
    return NextResponse.json(
      { detail: "That password is already being used by another gift plan" },
      { status: 409 },
    );
  }

  await query("UPDATE gift_ideas SET owner_username = $2 WHERE owner_username = $1", [
    currentUsername,
    nextUsername,
  ]);

  return createGiftLoginResponse(request, nextUsername);
}
