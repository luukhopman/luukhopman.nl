import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { parseRecipeUrl } from "@/lib/server/cookbook-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ detail: "Missing url" }, { status: 400 });
  }

  try {
    const convertUnits = request.nextUrl.searchParams.get("convert_units") !== "false";
    const result = await parseRecipeUrl(url, { convertUnits });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
