import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { HarvestCountData, HarvestEntry, HarvestUnit, HarvestVegetable } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 80;
const MAX_QUANTITY = 100_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HARVEST_UNITS = new Set<HarvestUnit>(["count", "kg"]);

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
        entries.unit,
        COALESCE(SUM(entries.quantity), 0)::double precision AS total,
        vegetables.created_at
      FROM harvest_vegetables AS vegetables
      JOIN harvest_entries AS entries ON entries.vegetable_id = vegetables.id
      GROUP BY vegetables.id, vegetables.name, entries.unit, vegetables.created_at
      ORDER BY total DESC, vegetables.name ASC
    `,
  );
  const recent = await query<HarvestEntry>(
    `
      SELECT
        entries.id,
        entries.vegetable_id,
        vegetables.name AS vegetable_name,
        entries.quantity::double precision AS quantity,
        entries.unit,
        entries.harvested_on::text,
        entries.created_at
      FROM harvest_entries AS entries
      JOIN harvest_vegetables AS vegetables ON vegetables.id = entries.vegetable_id
      ORDER BY entries.created_at DESC, entries.id DESC
      LIMIT 60
    `,
  );
  const summary = await queryOne<{
    total_count: number;
    total_kg: number;
    today_count: number;
    today_kg: number;
  }>(
    `
      SELECT
        COALESCE(SUM(quantity) FILTER (WHERE unit = 'count'), 0)::double precision AS total_count,
        COALESCE(SUM(quantity) FILTER (WHERE unit = 'kg'), 0)::double precision AS total_kg,
        COALESCE(SUM(quantity) FILTER (WHERE unit = 'count' AND harvested_on = $1::date), 0)::double precision AS today_count,
        COALESCE(SUM(quantity) FILTER (WHERE unit = 'kg' AND harvested_on = $1::date), 0)::double precision AS today_kg
      FROM harvest_entries
    `,
    [today],
  );

  const payload: HarvestCountData = {
    vegetables,
    recent,
    total: {
      count: Number(summary?.total_count ?? 0),
      kg: Number(summary?.total_kg ?? 0),
    },
    today: {
      count: Number(summary?.today_count ?? 0),
      kg: Number(summary?.today_kg ?? 0),
    },
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
    unit?: HarvestUnit;
    harvested_on?: string;
  };
  const quantity = Number(body.quantity);
  const unit = body.unit || "count";
  const harvestedOn = body.harvested_on?.trim() || new Date().toISOString().slice(0, 10);

  const hasAtMostTwoDecimals = Math.abs(Math.round(quantity * 100) - quantity * 100) < 0.000001;
  const validQuantity =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    quantity <= MAX_QUANTITY &&
    hasAtMostTwoDecimals &&
    (unit === "kg" || Number.isInteger(quantity));

  if (!HARVEST_UNITS.has(unit) || !validQuantity) {
    return NextResponse.json(
      {
        detail: HARVEST_UNITS.has(unit)
          ? unit === "kg"
            ? `Quantity must be a number from 0.01 to ${MAX_QUANTITY} kg with at most two decimal places`
            : `Quantity must be a whole number from 1 to ${MAX_QUANTITY}`
          : "A valid harvest unit is required",
      },
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
      INSERT INTO harvest_entries (vegetable_id, quantity, unit, harvested_on, created_at)
      VALUES ($1, $2, $3::text, $4::date, $5::text)
      RETURNING id, vegetable_id, quantity::double precision AS quantity, unit, harvested_on::text, created_at
    `,
    [vegetableId, quantity, unit, harvestedOn, new Date().toISOString()],
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
