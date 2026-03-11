import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import {
  RESOURCE_WISHLIST,
  bumpResourceVersion,
} from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStoreName(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    old_store?: string | null;
    new_store?: string | null;
  };
  const oldStore = normalizeStoreName(body.old_store);
  const newStore = normalizeStoreName(body.new_store);

  if (oldStore === newStore) {
    return NextResponse.json({ message: "Store name unchanged", updated: 0 });
  }

  const match = await queryOne<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM products
      WHERE COALESCE(TRIM(store), '') = COALESCE(TRIM($1), '')
    `,
    [oldStore],
  );

  if (!match || Number(match.count) === 0) {
    return NextResponse.json({ detail: "Store not found" }, { status: 404 });
  }

  await query(
    `
      UPDATE products
      SET store = $2
      WHERE COALESCE(TRIM(store), '') = COALESCE(TRIM($1), '')
    `,
    [oldStore, newStore],
  );

  await bumpResourceVersion(RESOURCE_WISHLIST);
  return NextResponse.json({
    message: "Store renamed successfully",
    updated: Number(match.count),
  });
}
