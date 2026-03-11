import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { normalizeRecipePayload } from "@/lib/server/cookbook-text";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawRecipeId = (await context.params).recipeId;
  if (typeof rawRecipeId !== "string") {
    return invalidParamResponse("recipe id");
  }
  const recipeId = parsePositiveIntegerParam(rawRecipeId);
  if (recipeId === null) {
    return invalidParamResponse("recipe id");
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM recipes WHERE id = $1`,
    [recipeId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Recipe not found" }, { status: 404 });
  }

  const convertUnits = request.nextUrl.searchParams.get("convert_units") !== "false";
  const body = normalizeRecipePayload((await request.json()) as Record<string, unknown>, {
    convertUnits,
  });

  const updates: string[] = [];
  const values: unknown[] = [recipeId];
  let index = 2;

  for (const key of ["title", "course", "url", "ingredients", "instructions", "notes"] as const) {
    if (key in body) {
      updates.push(`${key} = $${index++}`);
      values.push((body[key] as string) || null);
    }
  }

  if (updates.length) {
    await query(`UPDATE recipes SET ${updates.join(", ")} WHERE id = $1`, values);
  }

  return NextResponse.json({ message: "Recipe updated successfully" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawRecipeId = (await context.params).recipeId;
  if (typeof rawRecipeId !== "string") {
    return invalidParamResponse("recipe id");
  }
  const recipeId = parsePositiveIntegerParam(rawRecipeId);
  if (recipeId === null) {
    return invalidParamResponse("recipe id");
  }

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM recipes WHERE id = $1`,
    [recipeId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Recipe not found" }, { status: 404 });
  }

  await query(`DELETE FROM recipes WHERE id = $1`, [recipeId]);
  return NextResponse.json({ message: "Recipe deleted successfully" });
}
