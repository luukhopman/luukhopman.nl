import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getEntryId(context: { params: Promise<Record<string, string | string[] | undefined>> }) {
  const rawEntryId = (await context.params).entryId;
  if (typeof rawEntryId !== "string") return null;
  return parsePositiveIntegerParam(rawEntryId);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const entryId = await getEntryId(context);
  if (entryId === null) return invalidParamResponse("meal id");

  const body = (await request.json()) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ detail: "A dish name is required" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ detail: "Dish name is too long" }, { status: 400 });
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM meal_plan_entries WHERE id = $1`,
    [entryId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Meal not found" }, { status: 404 });
  }

  await query(
    `UPDATE meal_plan_entries SET title = $1 WHERE id = $2`,
    [title, entryId],
  );
  return NextResponse.json({ id: entryId, title });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const entryId = await getEntryId(context);
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
