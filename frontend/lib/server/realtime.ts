import type { QueryResultRow } from "pg";

import { query, queryOne } from "./db";

export const RESOURCE_TODOS = "todos";
export const RESOURCE_WISHLIST = "wishlist";
export const VALID_REALTIME_RESOURCES = new Set([
  RESOURCE_TODOS,
  RESOURCE_WISHLIST,
]);

function isMissingResourceVersionsTable(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("resource_versions") || message.includes("42p01");
}

export async function bumpResourceVersion(resource: string) {
  try {
    await query(
      `
        INSERT INTO resource_versions (resource, version)
        VALUES ($1, 1)
        ON CONFLICT (resource)
        DO UPDATE SET
          version = resource_versions.version + 1,
          updated_at = NOW()
      `,
      [resource],
    );
  } catch (error) {
    if (isMissingResourceVersionsTable(error)) {
      return;
    }
    throw error;
  }
}

export async function getResourceVersion(resource: string) {
  try {
    const row = await queryOne<{ version: number } & QueryResultRow>(
      `
        SELECT version
        FROM resource_versions
        WHERE resource = $1
      `,
      [resource],
    );
    return Number(row?.version ?? 0);
  } catch (error) {
    if (isMissingResourceVersionsTable(error)) {
      return 0;
    }
    throw error;
  }
}
