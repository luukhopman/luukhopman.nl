import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawProductId = (await context.params).productId;
  if (typeof rawProductId !== "string") {
    return invalidParamResponse("product id");
  }
  const productId = parsePositiveIntegerParam(rawProductId);
  if (productId === null) {
    return invalidParamResponse("product id");
  }

  const existing = await queryOne<{
    id: number;
    name: string;
    store: string | null;
    url: string | null;
    acquired: boolean;
    acquired_at: string | null;
    is_deleted: boolean;
    deleted_at: string | null;
  }>(
    `
      SELECT id, name, store, url, acquired, acquired_at, is_deleted, deleted_at
      FROM products
      WHERE id = $1
    `,
    [productId],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    acquired?: boolean | null;
    is_deleted?: boolean | null;
    name?: string | null;
    store?: string | null;
    url?: string | null;
  };

  const nextAcquired =
    body.acquired !== undefined && body.acquired !== null
      ? body.acquired
      : existing.acquired;
  let nextAcquiredAt = existing.acquired_at;
  if (body.acquired !== undefined && body.acquired !== null) {
    if (body.acquired && !existing.acquired) {
      nextAcquiredAt = new Date().toISOString();
    } else if (!body.acquired && existing.acquired) {
      nextAcquiredAt = null;
    }
  }

  const nextDeleted =
    body.is_deleted !== undefined && body.is_deleted !== null
      ? body.is_deleted
      : existing.is_deleted;
  let nextDeletedAt = existing.deleted_at;
  if (body.is_deleted !== undefined && body.is_deleted !== null) {
    if (body.is_deleted && !existing.is_deleted) {
      nextDeletedAt = new Date().toISOString();
    } else if (!body.is_deleted && existing.is_deleted) {
      nextDeletedAt = null;
    }
  }

  const nextName =
    body.name !== undefined && body.name !== null ? body.name.trim() : existing.name;
  const nextStore =
    body.store !== undefined ? normalizeStoreName(body.store) : existing.store;
  const nextUrl = body.url !== undefined ? body.url?.trim() || null : existing.url;

  await query(
    `
      UPDATE products
      SET
        name = $2,
        store = $3,
        url = $4,
        acquired = $5,
        is_deleted = $6,
        acquired_at = $7,
        deleted_at = $8
      WHERE id = $1
    `,
    [
      productId,
      nextName,
      nextStore,
      nextUrl,
      nextAcquired,
      nextDeleted,
      nextAcquiredAt,
      nextDeletedAt,
    ],
  );
  await bumpResourceVersion(RESOURCE_WISHLIST);

  return NextResponse.json({ message: "Product status updated" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawProductId = (await context.params).productId;
  if (typeof rawProductId !== "string") {
    return invalidParamResponse("product id");
  }
  const productId = parsePositiveIntegerParam(rawProductId);
  if (productId === null) {
    return invalidParamResponse("product id");
  }

  const hardDelete = request.nextUrl.searchParams.get("hard") === "true";
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM products WHERE id = $1`,
    [productId],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  }

  if (hardDelete) {
    await query(`DELETE FROM products WHERE id = $1`, [productId]);
    await bumpResourceVersion(RESOURCE_WISHLIST);
    return NextResponse.json({ message: "Product permanently deleted" });
  }

  await query(
    `
      UPDATE products
      SET is_deleted = TRUE, deleted_at = $2
      WHERE id = $1
    `,
    [productId, new Date().toISOString()],
  );
  await bumpResourceVersion(RESOURCE_WISHLIST);
  return NextResponse.json({ message: "Product soft-deleted successfully" });
}
