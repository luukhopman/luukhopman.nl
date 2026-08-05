import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import type { EnergyPrices } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    fixed_monthly_cost?: number;
    variable_cost_per_kwh?: number;
  };
  const fixedMonthlyCost = Number(body.fixed_monthly_cost);
  const variableCostPerKwh = Number(body.variable_cost_per_kwh);

  if (
    !Number.isFinite(fixedMonthlyCost) ||
    fixedMonthlyCost < 0 ||
    fixedMonthlyCost > 1_000_000
  ) {
    return NextResponse.json({ detail: "Enter a valid fixed monthly cost" }, { status: 400 });
  }
  if (
    !Number.isFinite(variableCostPerKwh) ||
    variableCostPerKwh < 0 ||
    variableCostPerKwh > 1_000
  ) {
    return NextResponse.json({ detail: "Enter a valid variable cost per kWh" }, { status: 400 });
  }

  const prices = await queryOne<EnergyPrices>(
    `
      UPDATE energy_price_settings
      SET fixed_monthly_cost = $1,
          variable_cost_per_kwh = $2,
          updated_at = $3
      WHERE id = 1
      RETURNING
        fixed_monthly_cost::double precision AS fixed_monthly_cost,
        variable_cost_per_kwh::double precision AS variable_cost_per_kwh,
        currency,
        updated_at
    `,
    [fixedMonthlyCost, variableCostPerKwh, new Date().toISOString()],
  );

  if (!prices) {
    return NextResponse.json({ detail: "Energy prices are not configured" }, { status: 500 });
  }
  return NextResponse.json(prices);
}
