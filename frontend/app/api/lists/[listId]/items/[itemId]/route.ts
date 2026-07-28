import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function idsFromContext(
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const params = await context.params;
  return {
    listId: typeof params.listId === "string" ? parsePositiveIntegerParam(params.listId) : null,
    itemId: typeof params.itemId === "string" ? parsePositiveIntegerParam(params.itemId) : null,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;
  const { listId, itemId } = await idsFromContext(context);
  if (listId === null || itemId === null) return invalidParamResponse("list item id");

  const existing = await queryOne<{ id: number; title: string; checked: boolean }>(
    `SELECT id, title, checked FROM reusable_list_items WHERE id = $1 AND list_id = $2`,
    [itemId, listId],
  );
  if (!existing) return NextResponse.json({ detail: "List item not found" }, { status: 404 });

  const body = (await request.json()) as { title?: string; checked?: boolean };
  const title = body.title !== undefined ? body.title.trim() : existing.title;
  const checked = typeof body.checked === "boolean" ? body.checked : existing.checked;
  if (!title) return NextResponse.json({ detail: "Item name is required" }, { status: 400 });

  await query(
    `UPDATE reusable_list_items SET title = $3, checked = $4 WHERE id = $1 AND list_id = $2`,
    [itemId, listId, title, checked],
  );
  return NextResponse.json({ message: "Item updated" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;
  const { listId, itemId } = await idsFromContext(context);
  if (listId === null || itemId === null) return invalidParamResponse("list item id");

  const result = await queryOne<{ id: number }>(
    `DELETE FROM reusable_list_items WHERE id = $1 AND list_id = $2 RETURNING id`,
    [itemId, listId],
  );
  if (!result) return NextResponse.json({ detail: "List item not found" }, { status: 404 });
  return NextResponse.json({ message: "Item deleted" });
}
