import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { ReusableList, ReusableListItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const lists = await query<Omit<ReusableList, "items">>(
    `SELECT id, name, created_at FROM reusable_lists ORDER BY created_at, id`,
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

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ detail: "List name is required" }, { status: 400 });
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO reusable_lists (name, created_at)
      VALUES ($1, $2)
      RETURNING id
    `,
    [name, new Date().toISOString()],
  );
  return NextResponse.json({ id: row?.id }, { status: 201 });
}
