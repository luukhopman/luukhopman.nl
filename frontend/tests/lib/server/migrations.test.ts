import { describe, expect, it, vi } from "vitest";

import { MIGRATIONS, runMigrations } from "@/lib/server/migrations";

describe("runMigrations", () => {
  it("applies pending migrations inside a transaction", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql.trim().replace(/\s+/g, " "));
        if (sql.includes("SELECT id FROM schema_migrations")) {
          return { rows: [] };
        }
        if (sql.includes("WHERE share_token IS NULL")) {
          return { rows: [{ id: 3 }] };
        }
        if (sql.includes("SELECT 1 FROM recipes WHERE share_token = $1")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => client),
    };

    const applied = await runMigrations(pool);

    expect(applied).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(calls.filter((sql) => sql === "BEGIN")).toHaveLength(MIGRATIONS.length);
    expect(calls.filter((sql) => sql === "COMMIT")).toHaveLength(MIGRATIONS.length);
    expect(calls.some((sql) => sql.includes("INSERT INTO schema_migrations"))).toBe(
      true,
    );
    expect(calls.some((sql) => sql.includes("UPDATE recipes SET share_token = $1 WHERE id = $2"))).toBe(
      true,
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips migrations that are already recorded", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT id FROM schema_migrations")) {
          return { rows: MIGRATIONS.map((migration) => ({ id: migration.id })) };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const applied = await runMigrations({
      query: vi.fn(),
      connect: vi.fn(async () => client),
    });

    expect(applied).toEqual([]);
    expect(
      client.query.mock.calls.some(([sql]) => String(sql).includes("BEGIN")),
    ).toBe(false);
  });
});
