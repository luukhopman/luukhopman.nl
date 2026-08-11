import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";
import type { HarvestUnit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUANTITY = 100_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function isValidQuantity(quantity: number, unit: HarvestUnit) {
  const hasAtMostTwoDecimals = Math.abs(Math.round(quantity * 100) - quantity * 100) < 0.000001;
  return (
    Number.isFinite(quantity) &&
    quantity > 0 &&
    quantity <= MAX_QUANTITY &&
    hasAtMostTwoDecimals &&
    (unit !== "count" || Number.isInteger(quantity))
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawEntryId = (await context.params).entryId;
  if (typeof rawEntryId !== "string") return invalidParamResponse("harvest entry id");
  const entryId = parsePositiveIntegerParam(rawEntryId);
  if (entryId === null) return invalidParamResponse("harvest entry id");

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM harvest_entries WHERE id = $1`,
    [entryId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Harvest entry not found" }, { status: 404 });
  }

  await query(`DELETE FROM harvest_entries WHERE id = $1`, [entryId]);
  return NextResponse.json({ message: "Harvest entry removed" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawEntryId = (await context.params).entryId;
  if (typeof rawEntryId !== "string") return invalidParamResponse("harvest entry id");
  const entryId = parsePositiveIntegerParam(rawEntryId);
  if (entryId === null) return invalidParamResponse("harvest entry id");

  const body = (await request.json()) as {
    quantity?: number;
    harvested_on?: string;
    remove_entry_ids?: number[];
  };
  const quantity = Number(body.quantity);
  const harvestedOn = body.harvested_on?.trim() || "";
  const existing = await queryOne<{ id: number; vegetable_id: number; unit: HarvestUnit }>(
    `SELECT id, vegetable_id, unit FROM harvest_entries WHERE id = $1`,
    [entryId],
  );
  if (!existing) {
    return NextResponse.json({ detail: "Harvest entry not found" }, { status: 404 });
  }
  if (!isValidQuantity(quantity, existing.unit)) {
    return NextResponse.json(
      {
        detail:
          existing.unit === "g"
            ? `Quantity must be a number from 0.01 to ${MAX_QUANTITY} g with at most two decimal places`
            : `Quantity must be a whole number from 1 to ${MAX_QUANTITY}`,
      },
      { status: 400 },
    );
  }
  if (!isIsoDate(harvestedOn)) {
    return NextResponse.json({ detail: "A valid harvest date is required" }, { status: 400 });
  }

  const removeEntryIds = [
    ...new Set(
      (Array.isArray(body.remove_entry_ids) ? body.remove_entry_ids : []).filter(
        (value): value is number => Number.isInteger(value) && value > 0,
      ),
    ),
  ];
  if (removeEntryIds.includes(entryId)) {
    return NextResponse.json({ detail: "The edited harvest entry cannot also be removed" }, { status: 400 });
  }
  if (removeEntryIds.length > 0) {
    const relatedEntries = await query<{ id: number; vegetable_id: number; unit: HarvestUnit }>(
      `SELECT id, vegetable_id, unit FROM harvest_entries WHERE id = ANY($1::bigint[])`,
      [removeEntryIds],
    );
    if (relatedEntries.length !== removeEntryIds.length) {
      return NextResponse.json({ detail: "One or more harvest entries were not found" }, { status: 404 });
    }
    if (relatedEntries.some((entry) => entry.vegetable_id !== existing.vegetable_id || entry.unit !== existing.unit)) {
      return NextResponse.json({ detail: "Harvest entries must belong to the same crop and unit" }, { status: 409 });
    }
  }

  const updated = await queryOne<{ id: number; quantity: number; unit: HarvestUnit; harvested_on: string }>(
    `
      WITH removed AS (
        DELETE FROM harvest_entries
        WHERE id = ANY($1::bigint[])
      ), updated AS (
        UPDATE harvest_entries
        SET quantity = $2,
            harvested_on = $3::date
        WHERE id = $4
        RETURNING id, quantity::double precision AS quantity, unit, harvested_on::text
      )
      SELECT id, quantity, unit, harvested_on
      FROM updated
    `,
    [removeEntryIds, quantity, harvestedOn, entryId],
  );

  return NextResponse.json(updated ?? { message: "Harvest entry changed" });
}
