import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import {
  createGiftLoginResponse,
  isGiftsAuthEnabled,
  validateGiftCredentials,
} from "@/lib/server/gifts-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  if (!isGiftsAuthEnabled()) {
    return NextResponse.json({ message: "Gift auth is not configured" });
  }

  const body = (await request.json()) as { allowCreate?: boolean; password?: string };
  const username = validateGiftCredentials(body.password);

  if (!username) {
    return NextResponse.json({ detail: "Invalid gift credentials" }, { status: 401 });
  }

  const existingGiftIdea = await queryOne<{ id: number }>(
    "SELECT id FROM gift_ideas WHERE owner_username = $1 LIMIT 1",
    [username],
  );

  if (!existingGiftIdea && !body.allowCreate) {
    return NextResponse.json(
      {
        confirmCreate: true,
        detail: "No gift plans exist for this password yet.",
      },
      { status: 409 },
    );
  }

  return createGiftLoginResponse(request, username);
}
