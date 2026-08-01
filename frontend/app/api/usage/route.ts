import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  getClientAddress,
  normalizeUsagePath,
  recordPageView,
} from "@/lib/server/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  let body: { path?: unknown };
  try {
    body = (await request.json()) as { path?: unknown };
  } catch {
    return NextResponse.json({ detail: "Invalid usage payload" }, { status: 400 });
  }

  const pagePath = normalizeUsagePath(body.path);
  const clientAddress = getClientAddress(request);
  if (!pagePath || !clientAddress) {
    return NextResponse.json({ detail: "Invalid usage payload" }, { status: 400 });
  }

  await recordPageView(pagePath, clientAddress);
  return new NextResponse(null, { status: 204 });
}
