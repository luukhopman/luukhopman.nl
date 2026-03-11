import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";
import {
  RESOURCE_TODOS,
  bumpResourceVersion,
} from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawTodoId = (await context.params).todoId;
  if (typeof rawTodoId !== "string") {
    return invalidParamResponse("todo id");
  }
  const todoId = parsePositiveIntegerParam(rawTodoId);
  if (todoId === null) {
    return invalidParamResponse("todo id");
  }

  const existing = await queryOne<{
    id: number;
    title: string;
    due_date: string | null;
    completed: boolean;
    completed_at: string | null;
  }>(
    `SELECT id, title, due_date, completed, completed_at FROM todos WHERE id = $1`,
    [todoId],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Todo not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string | null;
    due_date?: string | null;
    completed?: boolean | null;
  };

  const nextTitle =
    body.title !== undefined && body.title !== null
      ? body.title.trim()
      : existing.title;
  const nextDueDate =
    body.due_date !== undefined ? body.due_date || null : existing.due_date;
  const nextCompleted =
    body.completed !== undefined && body.completed !== null
      ? body.completed
      : existing.completed;
  let nextCompletedAt = existing.completed_at;

  if (body.completed !== undefined && body.completed !== null) {
    if (body.completed && !existing.completed) {
      nextCompletedAt = new Date().toISOString();
    } else if (!body.completed && existing.completed) {
      nextCompletedAt = null;
    }
  }

  await query(
    `
      UPDATE todos
      SET
        title = $2,
        due_date = $3,
        completed = $4,
        completed_at = $5
      WHERE id = $1
    `,
    [todoId, nextTitle, nextDueDate, nextCompleted, nextCompletedAt],
  );

  await bumpResourceVersion(RESOURCE_TODOS);
  return NextResponse.json({ message: "Todo updated successfully" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawTodoId = (await context.params).todoId;
  if (typeof rawTodoId !== "string") {
    return invalidParamResponse("todo id");
  }
  const todoId = parsePositiveIntegerParam(rawTodoId);
  if (todoId === null) {
    return invalidParamResponse("todo id");
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM todos WHERE id = $1`,
    [todoId],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Todo not found" }, { status: 404 });
  }

  await query(`DELETE FROM todos WHERE id = $1`, [todoId]);
  await bumpResourceVersion(RESOURCE_TODOS);
  return NextResponse.json({ message: "Todo deleted successfully" });
}
