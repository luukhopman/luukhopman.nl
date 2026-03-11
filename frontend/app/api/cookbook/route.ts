import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { normalizeRecipePayload } from "@/lib/server/cookbook-text";
import { query, queryOne } from "@/lib/server/db";
import { generateUniqueRecipeShareToken } from "@/lib/server/recipes";
import type { Recipe } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rows = await query<Recipe>(
    `
      SELECT id, share_token, title, course, url, ingredients, instructions, notes, created_at
      FROM recipes
      ORDER BY created_at DESC
    `,
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const convertUnits = request.nextUrl.searchParams.get("convert_units") !== "false";
  const body = (await request.json()) as Record<string, unknown>;
  const normalized = normalizeRecipePayload(body, { convertUnits });
  const shareToken = await generateUniqueRecipeShareToken({ query });
  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO recipes (share_token, title, course, url, ingredients, instructions, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      shareToken,
      normalized.title || null,
      normalized.course || null,
      normalized.url || null,
      normalized.ingredients || null,
      normalized.instructions || null,
      normalized.notes || null,
      new Date().toISOString(),
    ],
  );

  return NextResponse.json(
    { id: row?.id, message: "Recipe added successfully" },
    { status: 201 },
  );
}
