import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
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
function cleanNotes(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_NOTES_LENGTH) : "";
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
  const notes = cleanNotes(body.notes);

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

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const coffees = await query<CoffeeEntry>(
    `
      SELECT
        id,
        name,
        brand,
        rating::double precision AS rating,
        purchased_on::text,
        notes,
        created_at,
        updated_at
      FROM coffee_entries
      ORDER BY purchased_on DESC, id DESC
    `,
  );

  return NextResponse.json({ coffees });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as Record<string, unknown>;
  const parsed = parseCoffeeBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ detail: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const coffee = await queryOne<CoffeeEntry>(
    `
      INSERT INTO coffee_entries
        (name, brand, rating, purchased_on, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4::date, $5, $6, $6)
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
      now,
    ],
  );

  return NextResponse.json(coffee, { status: 201 });
}
