import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { HarvestCountData, HarvestEntry, HarvestVegetable } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 80;
const MAX_QUANTITY = 100_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
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

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const requestedToday = request.nextUrl.searchParams.get("today")?.trim() || "";
  const today = isIsoDate(requestedToday)
    ? requestedToday
    : new Date().toISOString().slice(0, 10);
  const vegetables = await query<HarvestVegetable>(
    `
      SELECT
        vegetables.id,
        vegetables.name,
        COALESCE(SUM(entries.quantity), 0)::integer AS total,
        vegetables.created_at
      FROM harvest_vegetables AS vegetables
      LEFT JOIN harvest_entries AS entries ON entries.vegetable_id = vegetables.id
      GROUP BY vegetables.id, vegetables.name, vegetables.created_at
      ORDER BY total DESC, vegetables.name ASC
    `,
  );
  const recent = await query<HarvestEntry>(
    `
      SELECT
        entries.id,
        entries.vegetable_id,
        vegetables.name AS vegetable_name,
        entries.quantity,
        entries.harvested_on::text,
        entries.created_at
      FROM harvest_entries AS entries
      JOIN harvest_vegetables AS vegetables ON vegetables.id = entries.vegetable_id
      ORDER BY entries.created_at DESC, entries.id DESC
      LIMIT 60
    `,
  );
  const summary = await queryOne<{ total: number; today: number }>(
    `
      SELECT
        COALESCE(SUM(quantity), 0)::integer AS total,
        COALESCE(SUM(quantity) FILTER (WHERE harvested_on = $1::date), 0)::integer AS today
      FROM harvest_entries
    `,
    [today],
  );

  const payload: HarvestCountData = {
    vegetables,
    recent,
    total: Number(summary?.total ?? 0),
    today: Number(summary?.today ?? 0),
  };
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    vegetable?: string;
    vegetable_id?: number | null;
    quantity?: number;
    harvested_on?: string;
  };
  const quantity = Number(body.quantity);
  const harvestedOn = body.harvested_on?.trim() || new Date().toISOString().slice(0, 10);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { detail: `Quantity must be a whole number from 1 to ${MAX_QUANTITY}` },
      { status: 400 },
    );
  }
  if (!isIsoDate(harvestedOn)) {
    return NextResponse.json({ detail: "A valid harvest date is required" }, { status: 400 });
  }

  let vegetableId: number | null = null;
  let vegetableName = "";
  if (body.vegetable_id !== undefined && body.vegetable_id !== null) {
    if (!Number.isInteger(body.vegetable_id) || body.vegetable_id <= 0) {
      return NextResponse.json({ detail: "Invalid vegetable id" }, { status: 400 });
    }
    const existing = await queryOne<{ id: number; name: string }>(
      `SELECT id, name FROM harvest_vegetables WHERE id = $1`,
      [body.vegetable_id],
    );
    if (!existing) {
      return NextResponse.json({ detail: "Vegetable not found" }, { status: 404 });
    }
    vegetableId = existing.id;
    vegetableName = existing.name;
  } else {
    vegetableName = normalizeName(body.vegetable || "");
    if (!vegetableName) {
      return NextResponse.json({ detail: "Vegetable name is required" }, { status: 400 });
    }

    const vegetable = await queryOne<{ id: number; name: string }>(
      `
        INSERT INTO harvest_vegetables (name, normalized_name, created_at)
        VALUES ($1::text, $2::text, $3::text)
        ON CONFLICT (normalized_name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `,
      [vegetableName, vegetableName.toLowerCase(), new Date().toISOString()],
    );
    vegetableId = vegetable?.id ?? null;
    vegetableName = vegetable?.name ?? vegetableName;
  }

  if (!vegetableId) {
    return NextResponse.json({ detail: "Could not save vegetable" }, { status: 500 });
  }

  const entry = await queryOne<HarvestEntry>(
    `
      INSERT INTO harvest_entries (vegetable_id, quantity, harvested_on, created_at)
      VALUES ($1, $2, $3::date, $4::text)
      RETURNING id, vegetable_id, quantity, harvested_on::text, created_at
    `,
    [vegetableId, quantity, harvestedOn, new Date().toISOString()],
  );

  return NextResponse.json(
    {
      ...entry,
      vegetable_name: vegetableName,
      harvested_on: entry?.harvested_on ?? harvestedOn,
    },
    { status: 201 },
  );
}
