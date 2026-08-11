import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { HarvestCountData, HarvestEntry, HarvestUnit, HarvestVegetable } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 80;
const MAX_QUANTITY = 100_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HARVEST_UNITS = new Set<HarvestUnit>(["count", "g"]);

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

  const vegetables = await query<HarvestVegetable>(
    `
      SELECT
        vegetables.id,
        vegetables.name,
        vegetables.unit,
        COALESCE(SUM(entries.quantity), 0)::double precision AS total,
        vegetables.created_at
      FROM harvest_vegetables AS vegetables
      LEFT JOIN harvest_entries AS entries
        ON entries.vegetable_id = vegetables.id
        AND entries.unit = vegetables.unit
      WHERE EXISTS (
        SELECT 1
        FROM harvest_entries AS any_entries
        WHERE any_entries.vegetable_id = vegetables.id
      )
      GROUP BY vegetables.id, vegetables.name, vegetables.unit, vegetables.created_at
      ORDER BY vegetables.name ASC, vegetables.unit ASC
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
      WHERE entries.unit = vegetables.unit
      ORDER BY entries.created_at DESC, entries.id DESC
      LIMIT 60
    `,
  );
  const payload: HarvestCountData = {
    vegetables,
    recent,
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
    (unit !== "count" || Number.isInteger(quantity));

  if (!HARVEST_UNITS.has(unit) || !validQuantity) {
    return NextResponse.json(
      {
        detail: HARVEST_UNITS.has(unit)
          ? unit === "g"
            ? `Quantity must be a number from 0.01 to ${MAX_QUANTITY} g with at most two decimal places`
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
    const existing = await queryOne<{ id: number; name: string; unit: HarvestUnit }>(
      `SELECT id, name, unit FROM harvest_vegetables WHERE id = $1`,
      [body.vegetable_id],
    );
    if (!existing) {
      return NextResponse.json({ detail: "Vegetable not found" }, { status: 404 });
    }
    vegetableId = existing.id;
    vegetableName = existing.name;
    if (existing.unit !== unit) {
      return NextResponse.json(
        {
          detail: `${existing.name} is recorded as ${existing.unit === "g" ? "grams" : "count"}. Use the same unit for this crop.`,
        },
        { status: 409 },
      );
    }
  } else {
    vegetableName = normalizeName(body.vegetable || "");
    if (!vegetableName) {
      return NextResponse.json({ detail: "Vegetable name is required" }, { status: 400 });
    }

    const vegetable = await queryOne<{ id: number; name: string; unit: HarvestUnit }>(
      `
        INSERT INTO harvest_vegetables (name, normalized_name, unit, created_at)
        VALUES ($1::text, $2::text, $3::text, $4::text)
        ON CONFLICT (normalized_name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name, unit
      `,
      [vegetableName, vegetableName.toLowerCase(), unit, new Date().toISOString()],
    );
    vegetableId = vegetable?.id ?? null;
    vegetableName = vegetable?.name ?? vegetableName;
    if (vegetable && vegetable.unit !== unit) {
      return NextResponse.json(
        {
          detail: `${vegetable.name} is recorded as ${vegetable.unit === "g" ? "grams" : "count"}. Use the same unit for this crop.`,
        },
        { status: 409 },
      );
    }
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
