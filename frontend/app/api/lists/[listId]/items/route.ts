import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawListId = (await context.params).listId;
  const listId = typeof rawListId === "string" ? parsePositiveIntegerParam(rawListId) : null;
  if (listId === null) return invalidParamResponse("list id");

  const body = (await request.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ detail: "Item name is required" }, { status: 400 });

  const list = await queryOne<{ id: number }>(`SELECT id FROM reusable_lists WHERE id = $1`, [listId]);
  if (!list) return NextResponse.json({ detail: "List not found" }, { status: 404 });

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO reusable_list_items (list_id, title, checked, sort_order, created_at)
      VALUES (
        $1,
        $2,
        FALSE,
        COALESCE((SELECT MAX(sort_order) + 1 FROM reusable_list_items WHERE list_id = $1), 0),
        $3
      )
      RETURNING id
    `,
    [listId, title, new Date().toISOString()],
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
}
