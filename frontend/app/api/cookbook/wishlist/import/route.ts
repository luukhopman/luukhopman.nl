import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { recipeSharePath } from "@/lib/cookbook";
import { normalizeRecipeText } from "@/lib/server/cookbook-text";
import { query } from "@/lib/server/db";
import {
  RESOURCE_WISHLIST,
  bumpResourceVersion,
} from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanIngredient(value: string) {
  return normalizeRecipeText(value).replace(
    /^\s*(?:[-*•]\s*|\[\s*[xX ]?\s*\]\s*|\d+[.)-]\s*)/,
    "",
  ).trim();
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    ingredients?: string[];
    store?: string | null;
    recipe_share_token?: string | null;
    source_url?: string | null;
  };

  const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const store = normalizeRecipeText(body.store || "");
  const sourceUrl = normalizeRecipeText(body.source_url || "") || null;
  const shareToken = normalizeRecipeText(body.recipe_share_token || "");
  const sharedRecipeUrl = shareToken ? recipeSharePath(shareToken) : null;
  const productUrl = sharedRecipeUrl || sourceUrl || "/cookbook";

  const existingProducts = await query<{
    name: string;
    store: string | null;
    is_deleted: boolean;
  }>(
    `SELECT name, store, is_deleted FROM products`,
  );
  const existingKeys = new Set(
    existingProducts
      .filter((product) => !product.is_deleted)
      .map(
        (product) =>
          `${normalizeRecipeText(product.name).toLowerCase()}::${normalizeRecipeText(
            product.store || "",
          ).toLowerCase()}`,
      ),
  );

  let added = 0;
  let skipped = 0;

  for (const raw of ingredients) {
    const name = cleanIngredient(raw);
    if (!name) {
      skipped += 1;
      continue;
    }
    const key = `${name.toLowerCase()}::${store.toLowerCase()}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    await query(
      `
        INSERT INTO products (name, store, url, acquired, is_deleted, acquired_at, deleted_at, created_at)
        VALUES ($1, $2, $3, FALSE, FALSE, NULL, NULL, $4)
      `,
      [name, store || null, productUrl, new Date().toISOString()],
    );
    existingKeys.add(key);
    added += 1;
  }

  if (added) {
    await bumpResourceVersion(RESOURCE_WISHLIST);
  }

  return NextResponse.json({ added, skipped });
}
