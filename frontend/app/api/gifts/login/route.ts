import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
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

  const body = (await request.json()) as { password?: string };
  const username = validateGiftCredentials(body.password);

  if (!username) {
    return NextResponse.json({ detail: "Invalid gift credentials" }, { status: 401 });
  }

  return createGiftLoginResponse(request, username);
}
