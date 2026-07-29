import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { parsePositiveIntegerParam } from "@/lib/server/params";
import type { ReusableList, ReusableListItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const lists = await query<Omit<ReusableList, "items">>(
    `SELECT id, name, completed, created_at FROM reusable_lists ORDER BY completed, created_at, id`,
  );
  const items = await query<ReusableListItem>(
    `
      SELECT id, list_id, title, checked, sort_order, created_at
      FROM reusable_list_items
      ORDER BY list_id, sort_order, id
    `,
  );
  const itemsByList = new Map<number, ReusableListItem[]>();
  for (const item of items) {
    const current = itemsByList.get(item.list_id) ?? [];
    current.push(item);
    itemsByList.set(item.list_id, current);
  }

  return NextResponse.json(
    lists.map((list) => ({ ...list, items: itemsByList.get(list.id) ?? [] })),
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    name?: string;
    copy_from_list_id?: number | null;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ detail: "List name is required" }, { status: 400 });
  }

  const copyFromListId =
    body.copy_from_list_id === undefined || body.copy_from_list_id === null
      ? null
      : parsePositiveIntegerParam(String(body.copy_from_list_id));
  if (
    body.copy_from_list_id !== undefined &&
    body.copy_from_list_id !== null &&
    copyFromListId === null
  ) {
    return NextResponse.json({ detail: "Invalid source list id" }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  if (copyFromListId !== null) {
    const copiedRow = await queryOne<{ id: number }>(
      `
        WITH source_list AS (
          SELECT id
          FROM reusable_lists
          WHERE id = $3
        ),
        new_list AS (
          INSERT INTO reusable_lists (name, completed, created_at)
          SELECT $1, FALSE, $2
          FROM source_list
          RETURNING id
        ),
        copied_items AS (
          INSERT INTO reusable_list_items (
            list_id,
            title,
            checked,
            sort_order,
            created_at
          )
          SELECT
            new_list.id,
            items.title,
            FALSE,
            items.sort_order,
            $2
          FROM new_list
          JOIN reusable_list_items AS items ON items.list_id = $3
        )
        SELECT id FROM new_list
      `,
      [name, createdAt, copyFromListId],
    );
    if (!copiedRow) {
      return NextResponse.json({ detail: "Source list not found" }, { status: 404 });
    }
    return NextResponse.json({ id: copiedRow.id }, { status: 201 });
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO reusable_lists (name, completed, created_at)
      VALUES ($1, FALSE, $2)
      RETURNING id
    `,
    [name, createdAt],
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
}
