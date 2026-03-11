import { type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { createGiftLogoutResponse } from "@/lib/server/gifts-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  return createGiftLogoutResponse(request);
}
