import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import {
  RESOURCE_TODOS,
  bumpResourceVersion,
} from "@/lib/server/realtime";
import type { Todo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rows = await query<Todo>(
    `
      SELECT id, title, due_date, due_time, completed, completed_at, created_at
      FROM todos
      ORDER BY created_at DESC
    `,
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    title?: string;
    due_date?: string | null;
    due_time?: string | null;
  };
  const title = body.title?.trim();
  const dueDate = body.due_date?.trim() || null;
  const dueTime = dueDate ? body.due_time?.trim() || null : null;

  if (!title) {
    return NextResponse.json({ detail: "Title is required" }, { status: 400 });
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO todos (title, due_date, due_time, completed, completed_at, created_at)
      VALUES ($1, $2, $3, FALSE, NULL, $4)
      RETURNING id
    `,
    [
      title,
      dueDate,
      dueTime,
      new Date().toISOString(),
    ],
  );

  await bumpResourceVersion(RESOURCE_TODOS);
  return NextResponse.json(
    { id: row?.id, message: "Todo added successfully" },
    { status: 201 },
  );
}
