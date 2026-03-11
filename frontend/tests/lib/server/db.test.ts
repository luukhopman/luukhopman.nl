import { describe, expect, it } from "vitest";

import { resolveDatabaseConfig } from "@/lib/server/db";

describe("resolveDatabaseConfig", () => {
  it("parses postgres urls and keeps managed-host ssl enabled", () => {
    const config = resolveDatabaseConfig(
      "postgres://user:pass@db.example.com:6543/website?sslmode=require",
    );

    expect(config).toMatchObject({
      host: "db.example.com",
      port: 6543,
      user: "user",
      password: "pass",
      database: "website",
    });
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("disables ssl for localhost connections", () => {
    const config = resolveDatabaseConfig(
      "postgresql://user:pass@localhost:5432/website?sslmode=disable",
    );

    expect(config.ssl).toBeUndefined();
  });
});
