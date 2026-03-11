import { NextResponse, type NextRequest } from "next/server";

import { createLoginResponse } from "@/lib/server/auth";
import { APP_PASSWORD } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string };

  if (!APP_PASSWORD) {
    return NextResponse.json({ message: "No password configured" });
  }

  if (body.password !== APP_PASSWORD) {
    return NextResponse.json({ detail: "Invalid password" }, { status: 401 });
  }

  return createLoginResponse(request);
}
