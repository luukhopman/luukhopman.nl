import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuth,
  query,
  queryOne,
  bumpResourceVersion,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  bumpResourceVersion: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireApiAuth,
}));

vi.mock("@/lib/server/db", () => ({
  query,
  queryOne,
}));

vi.mock("@/lib/server/realtime", () => ({
  RESOURCE_TODOS: "todos",
  bumpResourceVersion,
}));

import { GET, POST } from "@/app/api/todos/route";
import { PATCH } from "@/app/api/todos/[todoId]/route";

describe("todo routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    bumpResourceVersion.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("returns the auth response when the list endpoint is unauthorized", async () => {
    requireApiAuth.mockReturnValueOnce(
      NextResponse.json({ detail: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET(new NextRequest("http://localhost:3000/api/todos"));

    expect(response.status).toBe(401);
  });

  it("rejects empty todo titles", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ detail: "Title is required" });
  });

  it("creates todos and bumps the realtime version", async () => {
    queryOne.mockResolvedValueOnce({ id: 7 });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: "Buy milk", due_date: "2026-03-12" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(queryOne).toHaveBeenCalledTimes(1);
    expect(bumpResourceVersion).toHaveBeenCalledWith("todos");
    await expect(response.json()).resolves.toMatchObject({ id: 7 });
  });

  it("rejects invalid todo ids before reaching the database", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/todos/nope", {
        method: "PATCH",
        body: JSON.stringify({ completed: true }),
      }),
      { params: Promise.resolve({ todoId: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("rejects empty titles when updating a todo", async () => {
    queryOne.mockResolvedValueOnce({
      id: 3,
      title: "Existing todo",
      due_date: "2026-03-15",
      completed: false,
      completed_at: null,
    });

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/todos/3", {
        method: "PATCH",
        body: JSON.stringify({ title: "   " }),
      }),
      { params: Promise.resolve({ todoId: "3" }) },
    );

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ detail: "Title is required" });
  });
});
