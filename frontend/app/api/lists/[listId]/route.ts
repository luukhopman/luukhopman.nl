import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listIdFromContext(
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const rawListId = (await context.params).listId;
  return typeof rawListId === "string" ? parsePositiveIntegerParam(rawListId) : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;
  const listId = await listIdFromContext(context);
  if (listId === null) return invalidParamResponse("list id");

  const body = (await request.json()) as {
    name?: string;
    reset?: boolean;
    clear_completed?: boolean;
    completed?: boolean;
    is_template?: boolean;
  };
  const existing = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM reusable_lists WHERE id = $1`,
    [listId],
  );
  if (!existing) return NextResponse.json({ detail: "List not found" }, { status: 404 });

  if (body.reset === true) {
    await query(`UPDATE reusable_list_items SET checked = FALSE WHERE list_id = $1`, [listId]);
  }
  if (body.clear_completed === true) {
    await query(`DELETE FROM reusable_list_items WHERE list_id = $1 AND checked = TRUE`, [listId]);
  }
  if (typeof body.completed === "boolean") {
    await query(`UPDATE reusable_lists SET completed = $2 WHERE id = $1`, [listId, body.completed]);
  }
  if (typeof body.is_template === "boolean") {
    await query(`UPDATE reusable_lists SET is_template = $2 WHERE id = $1`, [listId, body.is_template]);
  }
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ detail: "List name is required" }, { status: 400 });
    await query(`UPDATE reusable_lists SET name = $2 WHERE id = $1`, [listId, name]);
  }

  return NextResponse.json({ message: "List updated" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;
  const listId = await listIdFromContext(context);
  if (listId === null) return invalidParamResponse("list id");

  const result = await queryOne<{ id: number }>(
    `DELETE FROM reusable_lists WHERE id = $1 RETURNING id`,
    [listId],
  );
  if (!result) return NextResponse.json({ detail: "List not found" }, { status: 404 });
  return NextResponse.json({ message: "List deleted" });
}
