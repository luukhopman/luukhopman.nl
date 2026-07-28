import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import {
  RESOURCE_WISHLIST,
  bumpResourceVersion,
} from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as { productIds?: unknown };
  if (
    !Array.isArray(body.productIds) ||
    body.productIds.length === 0 ||
    body.productIds.length > 500 ||
    body.productIds.some(
      (id) => !Number.isInteger(id) || Number(id) <= 0,
    )
  ) {
    return NextResponse.json(
      { detail: "productIds must be a non-empty list of product ids" },
      { status: 400 },
    );
  }

  const productIds = body.productIds.map(Number);
  if (new Set(productIds).size !== productIds.length) {
    return NextResponse.json(
      { detail: "productIds must not contain duplicates" },
      { status: 400 },
    );
  }

  const caseParts = productIds.map(
    (_, index) => `WHEN $${index + 1} THEN ${index + 1}`,
  );
  const placeholders = productIds.map((_, index) => `$${index + 1}`);

  await query(
    `
      UPDATE products
      SET sort_order = CASE id
        ${caseParts.join("\n        ")}
        ELSE sort_order
      END
      WHERE id IN (${placeholders.join(", ")})
    `,
    productIds,
  );

  await bumpResourceVersion(RESOURCE_WISHLIST);
  return NextResponse.json({ message: "Product order updated" });
}
