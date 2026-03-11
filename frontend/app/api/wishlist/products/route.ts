import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import {
  RESOURCE_WISHLIST,
  bumpResourceVersion,
} from "@/lib/server/realtime";
import type { Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function cleanupExpiredAcquiredProducts() {
  const products = await query<{
    id: number;
    acquired_at: string | null;
  }>(
    `
      SELECT id, acquired_at
      FROM products
      WHERE acquired = TRUE
        AND is_deleted = FALSE
        AND acquired_at IS NOT NULL
    `,
  );

  const now = Date.now();
  let changed = 0;

  for (const product of products) {
    if (!product.acquired_at) continue;
    const acquiredAt = new Date(product.acquired_at).getTime();
    if (Number.isNaN(acquiredAt)) continue;
    if (now - acquiredAt <= 7 * 24 * 60 * 60 * 1000) continue;

    await query(
      `
        UPDATE products
        SET is_deleted = TRUE, deleted_at = $2
        WHERE id = $1
      `,
      [product.id, new Date().toISOString()],
    );
    changed += 1;
  }

  if (changed > 0) {
    await bumpResourceVersion(RESOURCE_WISHLIST);
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  await cleanupExpiredAcquiredProducts();

  const rows = await query<Product>(
    `
      SELECT id, name, store, url, acquired, is_deleted, acquired_at, deleted_at, created_at
      FROM products
      ORDER BY created_at DESC
    `,
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    name?: string;
    store?: string | null;
    url?: string | null;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ detail: "Name is required" }, { status: 400 });
  }

  const row = await queryOne<{ id: number }>(
    `
      INSERT INTO products (name, store, url, acquired, is_deleted, acquired_at, deleted_at, created_at)
      VALUES ($1, $2, $3, FALSE, FALSE, NULL, NULL, $4)
      RETURNING id
    `,
    [name, body.store?.trim() || null, body.url?.trim() || null, new Date().toISOString()],
  );

  await bumpResourceVersion(RESOURCE_WISHLIST);
  return NextResponse.json(
    { id: row?.id, message: "Product added successfully" },
    { status: 201 },
  );
}
