import { randomBytes } from "node:crypto";

import { queryOne } from "@/lib/server/db";
import type { Recipe } from "@/lib/types";

type QueryResult = {
  rows: Array<Record<string, unknown>>;
};

type Queryable = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult | Array<Record<string, unknown>>>;
};

function resultRows(result: QueryResult | Array<Record<string, unknown>>) {
  return Array.isArray(result) ? result : result.rows;
}

function recipeSelectSql(whereClause: string) {
  return `
      SELECT id, share_token, title, course, url, ingredients, instructions, notes, created_at
      FROM recipes
      ${whereClause}
    `;
}

export function createRecipeShareToken() {
  return randomBytes(18).toString("base64url");
}

export async function generateUniqueRecipeShareToken(client: Queryable) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = createRecipeShareToken();
    const existing = await client.query(
      `SELECT 1 FROM recipes WHERE share_token = $1`,
      [token],
    );
    if (resultRows(existing).length === 0) {
      return token;
    }
  }

  throw new Error("Could not generate a unique recipe share token.");
}

export async function backfillRecipeShareTokens(client: Queryable) {
  const result = await client.query(
    `
      SELECT id
      FROM recipes
      WHERE share_token IS NULL OR share_token = ''
      ORDER BY id ASC
    `,
  );

  for (const row of resultRows(result)) {
    const recipeId = Number(row.id);
    if (!Number.isInteger(recipeId) || recipeId <= 0) {
      continue;
    }

    const shareToken = await generateUniqueRecipeShareToken(client);
    await client.query(
      `UPDATE recipes SET share_token = $1 WHERE id = $2`,
      [shareToken, recipeId],
    );
  }
}

export async function findRecipeById(recipeId: number): Promise<Recipe | null> {
  return queryOne<Recipe>(
    recipeSelectSql("WHERE id = $1"),
    [recipeId],
  );
}

export async function findRecipeByShareToken(shareToken: string): Promise<Recipe | null> {
  return queryOne<Recipe>(
    recipeSelectSql("WHERE share_token = $1"),
    [shareToken],
  );
}
