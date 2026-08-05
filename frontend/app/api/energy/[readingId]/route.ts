import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawReadingId = (await context.params).readingId;
  if (typeof rawReadingId !== "string") return invalidParamResponse("energy reading id");
  const readingId = parsePositiveIntegerParam(rawReadingId);
  if (readingId === null) return invalidParamResponse("energy reading id");

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM energy_meter_readings WHERE id = $1`,
    [readingId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Energy reading not found" }, { status: 404 });
  }

  await query(`DELETE FROM energy_meter_readings WHERE id = $1`, [readingId]);
  return NextResponse.json({ message: "Energy reading removed" });
}
