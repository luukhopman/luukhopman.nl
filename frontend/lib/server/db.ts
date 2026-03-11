import { Pool, type PoolConfig, type QueryResultRow } from "pg";

import { DATABASE_URL } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __websitePool: Pool | undefined;
}

function normalizeDatabaseUrl(databaseUrl: string) {
  return databaseUrl.startsWith("postgres://")
    ? databaseUrl.replace("postgres://", "postgresql://")
    : databaseUrl;
}

function shouldUseSsl(hostname: string, sslMode: string | null) {
  return (
    sslMode !== "disable" &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  );
}

export function resolveDatabaseConfig(databaseUrl: string): PoolConfig {
  const parsed = new URL(normalizeDatabaseUrl(databaseUrl));
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase() ?? null;
  const port = Number(parsed.port || "5432");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DATABASE_URL contains an invalid port.");
  }

  return {
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    ssl: shouldUseSsl(parsed.hostname, sslMode)
      ? sslMode === "verify-full"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false }
      : undefined,
  };
}

export function createPool(databaseUrl = DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return new Pool(resolveDatabaseConfig(databaseUrl));
}

export function getPool() {
  if (global.__websitePool) {
    return global.__websitePool;
  }

  const pool = createPool();
  global.__websitePool = pool;

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}
