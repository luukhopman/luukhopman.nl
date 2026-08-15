import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";
import type { CoffeeEntry, CoffeeVerdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_BRAND_LENGTH = 80;
const MAX_KIND_LENGTH = 60;
const MAX_NOTES_LENGTH = 600;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COFFEE_VERDICTS = new Set<CoffeeVerdict>(["liked", "okay", "disliked"]);

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
  const kind = cleanText(body.kind, MAX_KIND_LENGTH);
  const rating = Number(body.rating);
  const verdict = body.verdict;
  const purchasedOn = cleanText(body.purchased_on, 10);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) : "";

  if (!name) return { error: "Coffee name is required" };
  if (!kind) return { error: "Coffee kind is required" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Rating must be a whole number from 1 to 5" };
  }
  if (!COFFEE_VERDICTS.has(verdict as CoffeeVerdict)) {
    return { error: "Choose whether you liked this coffee" };
  }
  if (!isIsoDate(purchasedOn)) return { error: "A valid purchase date is required" };

  return {
    value: {
      name,
      brand: brand || null,
      kind,
      rating,
      verdict: verdict as CoffeeVerdict,
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
          kind = $3,
          rating = $4,
          verdict = $5,
          purchased_on = $6::date,
          notes = $7,
          updated_at = $8
      WHERE id = $9
      RETURNING
        id,
        name,
        brand,
        kind,
        rating,
        verdict,
        purchased_on::text,
        notes,
        created_at,
        updated_at
    `,
    [
      parsed.value.name,
      parsed.value.brand,
      parsed.value.kind,
      parsed.value.rating,
      parsed.value.verdict,
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
