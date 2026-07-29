import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireApiAuth, query, queryOne } = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireApiAuth }));
vi.mock("@/lib/server/db", () => ({ query, queryOne }));

import { GET, POST as createList } from "@/app/api/lists/route";
import { PATCH as updateList } from "@/app/api/lists/[listId]/route";
import { POST as createItem } from "@/app/api/lists/[listId]/items/route";
import { PATCH as updateItem } from "@/app/api/lists/[listId]/items/[itemId]/route";

describe("reusable list routes", () => {
  beforeEach(() => {
    requireApiAuth.mockReset();
    query.mockReset();
    queryOne.mockReset();
    requireApiAuth.mockReturnValue(null);
  });

  it("combines list rows with their items", async () => {
    query
      .mockResolvedValueOnce([
        { id: 1, name: "Packing", created_at: "2026-07-28T12:00:00Z" },
        { id: 2, name: "Camping", created_at: "2026-07-28T13:00:00Z" },
      ])
      .mockResolvedValueOnce([
        { id: 4, list_id: 1, title: "Passport", checked: false, sort_order: 0, created_at: "" },
      ]);

    const response = await GET(new NextRequest("http://localhost:3000/api/lists"));
    const payload = await response.json();

    expect(payload[0].items).toHaveLength(1);
    expect(payload[1].items).toEqual([]);
  });

  it("rejects blank list and item names", async () => {
    const listResponse = await createList(
      new NextRequest("http://localhost:3000/api/lists", {
        method: "POST",
        body: JSON.stringify({ name: " " }),
      }),
    );
    const itemResponse = await createItem(
      new NextRequest("http://localhost:3000/api/lists/1/items", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
      }),
      { params: Promise.resolve({ listId: "1" }) },
    );

    expect(listResponse.status).toBe(400);
    expect(itemResponse.status).toBe(400);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("copies all items from a previous list with checks cleared", async () => {
    queryOne.mockResolvedValueOnce({ id: 9 });

    const response = await createList(
      new NextRequest("http://localhost:3000/api/lists", {
        method: "POST",
        body: JSON.stringify({
          name: "Summer holiday",
          copy_from_list_id: 3,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reusable_list_items"),
      ["Summer holiday", expect.any(String), 3],
    );
    expect(queryOne.mock.calls[0][0]).toContain("FALSE");
    await expect(response.json()).resolves.toEqual({ id: 9 });
  });

  it("does not create a copy when the source list no longer exists", async () => {
    queryOne.mockResolvedValueOnce(null);

    const response = await createList(
      new NextRequest("http://localhost:3000/api/lists", {
        method: "POST",
        body: JSON.stringify({
          name: "Old packing list",
          copy_from_list_id: 404,
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ detail: "Source list not found" });
  });

  it("resets all checks in a reusable list", async () => {
    queryOne.mockResolvedValueOnce({ id: 3, name: "Holiday packing" });

    const response = await updateList(
      new NextRequest("http://localhost:3000/api/lists/3", {
        method: "PATCH",
        body: JSON.stringify({ reset: true }),
      }),
      { params: Promise.resolve({ listId: "3" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET checked = FALSE"),
      [3],
    );
  });

  it("clears completed items from a reusable list", async () => {
    queryOne.mockResolvedValueOnce({ id: 3, name: "Holiday packing" });

    const response = await updateList(
      new NextRequest("http://localhost:3000/api/lists/3", {
        method: "PATCH",
        body: JSON.stringify({ clear_completed: true }),
      }),
      { params: Promise.resolve({ listId: "3" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("checked = TRUE"),
      [3],
    );
  });

  it("only updates an item inside its parent list", async () => {
    queryOne.mockResolvedValueOnce({ id: 8, title: "Passport", checked: false });

    const response = await updateItem(
      new NextRequest("http://localhost:3000/api/lists/3/items/8", {
        method: "PATCH",
        body: JSON.stringify({ checked: true }),
      }),
      { params: Promise.resolve({ listId: "3", itemId: "8" }) },
    );

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND list_id = $2"),
      [8, 3, "Passport", true],
    );
  });
});
