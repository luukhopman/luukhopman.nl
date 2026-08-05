import { describe, expect, it } from "vitest";

import { buildEnergyIntervals, buildEnergySummary } from "@/lib/energy";
import type { EnergyPrices, EnergyReading } from "@/lib/types";

const prices: EnergyPrices = {
  fixed_monthly_cost: 10.9,
  variable_cost_per_kwh: 0.349,
  currency: "EUR",
  updated_at: "2026-08-05T00:00:00.000Z",
};

const readings: EnergyReading[] = [
  { id: 2, reading_date: "2026-01-11", meter_kwh: 1050, created_at: "" },
  { id: 1, reading_date: "2026-01-01", meter_kwh: 1000, created_at: "" },
  { id: 3, reading_date: "2026-01-21", meter_kwh: 1120, created_at: "" },
];

describe("energy calculations", () => {
  it("builds intervals in chronological order", () => {
    const intervals = buildEnergyIntervals(readings, prices);

    expect(intervals.map((interval) => interval.reading.reading_date)).toEqual([
      "2026-01-01",
      "2026-01-11",
      "2026-01-21",
    ]);
    expect(intervals[1]).toMatchObject({ days: 10, useKwh: 50, usePerDay: 5 });
    expect(intervals[2]).toMatchObject({ days: 10, useKwh: 70, usePerDay: 7 });
  });

  it("calculates overall average and monthly cost including fixed costs", () => {
    const summary = buildEnergySummary(readings, prices);

    expect(summary.totalDays).toBe(20);
    expect(summary.totalUseKwh).toBe(120);
    expect(summary.averageUsePerDay).toBe(6);
    expect(summary.averageAnnualisedUse).toBe(2190);
    expect(summary.variableMonthlyCost).toBeCloseTo(63.69, 2);
    expect(summary.estimatedMonthlyCost).toBeCloseTo(74.59, 2);
  });
});
