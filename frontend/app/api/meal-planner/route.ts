import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { MealPlanEntry, MealType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner", "snack"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const start = request.nextUrl.searchParams.get("start") ?? "";
  if (!isIsoDate(start)) {
    return NextResponse.json({ detail: "A valid week start is required" }, { status: 400 });
  }

  const rows = await query<MealPlanEntry>(
    `
      SELECT
        entries.id,
        entries.meal_date,
        entries.meal_type,
        entries.recipe_id,
        entries.title,
        entries.created_at,
        recipes.title AS recipe_title,
        recipes.share_token AS recipe_share_token
      FROM meal_plan_entries AS entries
      LEFT JOIN recipes ON recipes.id = entries.recipe_id
      WHERE entries.meal_date BETWEEN $1 AND $2
      ORDER BY
        entries.meal_date,
        CASE entries.meal_type
          WHEN 'breakfast' THEN 1
          WHEN 'lunch' THEN 2
          WHEN 'dinner' THEN 3
          ELSE 4
        END,
        entries.created_at,
        entries.id
    `,
    [start, addDays(start, 6)],
  );

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    meal_date?: string;
    meal_type?: MealType;
    recipe_id?: number | null;
    title?: string | null;
  };
  const mealDate = body.meal_date?.trim() ?? "";
  const mealType = body.meal_type;
  const recipeId =
    Number.isInteger(body.recipe_id) && Number(body.recipe_id) > 0
      ? Number(body.recipe_id)
      : null;
  const title = body.title?.trim() || null;

  if (!isIsoDate(mealDate)) {
    return NextResponse.json({ detail: "A valid meal date is required" }, { status: 400 });
  }
  if (!mealType || !MEAL_TYPES.has(mealType)) {
    return NextResponse.json({ detail: "A valid meal type is required" }, { status: 400 });
  }
  if (!recipeId && !title) {
    return NextResponse.json({ detail: "Choose a recipe or enter a meal name" }, { status: 400 });
  }
  if (recipeId) {
    const recipe = await queryOne<{ id: number }>(`SELECT id FROM recipes WHERE id = $1`, [recipeId]);
    if (!recipe) {
      return NextResponse.json({ detail: "Recipe not found" }, { status: 404 });
    }
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO meal_plan_entries (meal_date, meal_type, recipe_id, title, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [mealDate, mealType, recipeId, title, new Date().toISOString()],
  );

  return NextResponse.json({ id: row?.id }, { status: 201 });
}
