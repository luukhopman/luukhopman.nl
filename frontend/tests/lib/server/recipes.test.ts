import { describe, expect, it, vi } from "vitest";

import { backfillRecipeShareTokens, generateUniqueRecipeShareToken } from "@/lib/server/recipes";

describe("recipe share tokens", () => {
  it("generates a unique token when the first candidate collides", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const token = await generateUniqueRecipeShareToken(client);

    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("backfills missing recipe share tokens", async () => {
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("SELECT id") && sql.includes("WHERE share_token IS NULL")) {
          return { rows: [{ id: 2 }, { id: 4 }] };
        }
        if (sql.includes("SELECT 1 FROM recipes WHERE share_token = $1")) {
          return { rows: [] };
        }
        if (sql.includes("UPDATE recipes SET share_token = $1 WHERE id = $2")) {
          return { rows: [{ values }] };
        }
        return { rows: [] };
      }),
    };

    await backfillRecipeShareTokens(client);

    const updateCalls = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("UPDATE recipes SET share_token = $1 WHERE id = $2"),
    );

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.[1]?.[0]).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(updateCalls[0]?.[1]?.[1]).toBe(2);
    expect(updateCalls[1]?.[1]?.[1]).toBe(4);
  });
});
