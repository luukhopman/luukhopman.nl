import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import type { EnergyReading, EnergyPrices } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_METER_READING = 100_000_000;

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

  const [readings, prices] = await Promise.all([
    query<EnergyReading>(
      `
        SELECT
          id,
          reading_date::text,
          meter_kwh::double precision AS meter_kwh,
          created_at
        FROM energy_meter_readings
        ORDER BY reading_date DESC, id DESC
      `,
    ),
    queryOne<EnergyPrices>(
      `
        SELECT
          fixed_monthly_cost::double precision AS fixed_monthly_cost,
          variable_cost_per_kwh::double precision AS variable_cost_per_kwh,
          currency,
          updated_at
        FROM energy_price_settings
        WHERE id = 1
      `,
    ),
  ]);

  if (!prices) {
    return NextResponse.json({ detail: "Energy prices are not configured" }, { status: 500 });
  }

  return NextResponse.json({ readings, prices });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    reading_date?: string;
    meter_kwh?: number;
  };
  const readingDate = body.reading_date?.trim() || new Date().toISOString().slice(0, 10);
  const meterKwh = Number(body.meter_kwh);

  if (!isIsoDate(readingDate)) {
    return NextResponse.json({ detail: "A valid meter date is required" }, { status: 400 });
  }
  if (!Number.isFinite(meterKwh) || meterKwh < 0 || meterKwh > MAX_METER_READING) {
    return NextResponse.json(
      { detail: `Meter reading must be between 0 and ${MAX_METER_READING} kWh` },
      { status: 400 },
    );
  }
  if (!Number.isInteger(meterKwh)) {
    return NextResponse.json(
      { detail: "Meter reading must be a whole number of kWh" },
      { status: 400 },
    );
  }

  const reading = await queryOne<EnergyReading>(
    `
      INSERT INTO energy_meter_readings (reading_date, meter_kwh, created_at)
      VALUES ($1::date, $2, $3)
      ON CONFLICT (reading_date)
      DO UPDATE SET meter_kwh = EXCLUDED.meter_kwh
      RETURNING id, reading_date::text, meter_kwh::double precision AS meter_kwh, created_at
    `,
    [readingDate, meterKwh, new Date().toISOString()],
  );

  return NextResponse.json(reading, { status: 201 });
}
