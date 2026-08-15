import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";
import type { CoffeeEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_BRAND_LENGTH = 80;
const MAX_NOTES_LENGTH = 600;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}
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

function parseCoffeeBody(body: Record<string, unknown>) {
  const name = cleanText(body.name, MAX_NAME_LENGTH);
  const brand = cleanText(body.brand, MAX_BRAND_LENGTH);
  const rating = Number(body.rating);
  const purchasedOn = cleanText(body.purchased_on, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) : "";

  if (!name) return { error: "Coffee name is required" };
  if (!Number.isFinite(rating) || rating < 0 || rating > 10 || Math.abs(rating * 10 - Math.round(rating * 10)) > 1e-8) {
    return { error: "Rating must be between 0 and 10 with one decimal place at most" };
  }
  if (!isIsoDate(purchasedOn)) return { error: "A valid purchase date is required" };

  return {
    value: {
      name,
      brand: brand || null,
      rating,
      purchasedOn,
      notes: notes || null,
    },
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawCoffeeId = (await context.params).coffeeId;
  if (typeof rawCoffeeId !== "string") return invalidParamResponse("coffee id");
  const coffeeId = parsePositiveIntegerParam(rawCoffeeId);
  if (coffeeId === null) return invalidParamResponse("coffee id");

  const body = (await request.json()) as Record<string, unknown>;
  const parsed = parseCoffeeBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ detail: parsed.error }, { status: 400 });
  }

  const updated = await queryOne<CoffeeEntry>(
    `
      UPDATE coffee_entries
      SET name = $1,
          brand = $2,
          rating = $3,
          purchased_on = $4::date,
          notes = $5,
          updated_at = $6
      WHERE id = $7
      RETURNING
        id,
        name,
        brand,
        rating::double precision AS rating,
        purchased_on::text,
        notes,
        created_at,
        updated_at
    `,
    [
      parsed.value.name,
      parsed.value.brand,
      parsed.value.rating,
      parsed.value.purchasedOn,
      parsed.value.notes,
      new Date().toISOString(),
      coffeeId,
    ],
  );

  if (!updated) return NextResponse.json({ detail: "Coffee entry not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawCoffeeId = (await context.params).coffeeId;
  if (typeof rawCoffeeId !== "string") return invalidParamResponse("coffee id");
  const coffeeId = parsePositiveIntegerParam(rawCoffeeId);
  if (coffeeId === null) return invalidParamResponse("coffee id");

  const existing = await queryOne<{ id: number }>(`SELECT id FROM coffee_entries WHERE id = $1`, [coffeeId]);
  if (!existing) return NextResponse.json({ detail: "Coffee entry not found" }, { status: 404 });

  await query(`DELETE FROM coffee_entries WHERE id = $1`, [coffeeId]);
  return NextResponse.json({ message: "Coffee entry removed" });
}
