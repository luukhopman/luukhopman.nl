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

  const rawEntryId = (await context.params).entryId;
  if (typeof rawEntryId !== "string") return invalidParamResponse("meal id");
  const entryId = parsePositiveIntegerParam(rawEntryId);
  if (entryId === null) return invalidParamResponse("meal id");

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM meal_plan_entries WHERE id = $1`,
    [entryId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Meal not found" }, { status: 404 });
  }

  await query(`DELETE FROM meal_plan_entries WHERE id = $1`, [entryId]);
  return NextResponse.json({ message: "Meal removed" });
}
