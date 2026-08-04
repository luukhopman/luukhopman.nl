import { describe, expect, it } from "vitest";

import { addHarvestEntry, groupHarvestCrops, harvestCropSymbol } from "@/lib/harvest-count";
import type { HarvestCountData, HarvestEntry, HarvestVegetable } from "@/lib/types";

const vegetables: HarvestVegetable[] = [
  { id: 1, name: "Tomatoes", unit: "count", total: 12, created_at: "2026-07-01T09:00:00Z" },
  { id: 1, name: "Tomatoes", unit: "kg", total: 2.5, created_at: "2026-07-01T09:00:00Z" },
  { id: 2, name: "Courgettes", unit: "count", total: 4, created_at: "2026-07-02T09:00:00Z" },
];

const recent: HarvestEntry[] = [
  {
    id: 5,
    vegetable_id: 2,
    vegetable_name: "Courgettes",
    quantity: 1,
    unit: "count",
    harvested_on: "2026-08-04",
    created_at: "2026-08-04T11:00:00Z",
  },
  {
    id: 4,
    vegetable_id: 1,
    vegetable_name: "Tomatoes",
    quantity: 0.5,
    unit: "kg",
    harvested_on: "2026-08-04",
    created_at: "2026-08-04T10:00:00Z",
  },
];

describe("groupHarvestCrops", () => {
  it("merges unit rows and orders recently harvested crops first", () => {
    const crops = groupHarvestCrops(vegetables, recent);

    expect(crops.map((crop) => crop.name)).toEqual(["Courgettes", "Tomatoes"]);
    expect(crops[1]).toMatchObject({
      totals: { count: 12, kg: 2.5 },
      preferred_unit: "kg",
    });
  });

  it("fills missing unit totals with zero", () => {
    expect(groupHarvestCrops(vegetables, recent)[0].totals).toEqual({ count: 4, kg: 0 });
  });
});

describe("harvestCropSymbol", () => {
  it("matches known crops and falls back to a leaf", () => {
    expect(harvestCropSymbol("Cherry tomatoes").glyph).toBe("🍅");
    expect(harvestCropSymbol("Mystery crop")).toEqual({ glyph: "🌱", tone: "green" });
  });
});

describe("addHarvestEntry", () => {
  it("updates unit totals, today's summary, and recent history", () => {
    const data: HarvestCountData = {
      vegetables,
      recent,
      total: { count: 16, kg: 2.5 },
      today: { count: 1, kg: 0.5 },
    };
    const entry: HarvestEntry = {
      id: 6,
      vegetable_id: 1,
      vegetable_name: "Tomatoes",
      quantity: 1.25,
      unit: "kg",
      harvested_on: "2026-08-04",
      created_at: "2026-08-04T12:00:00Z",
    };

    const result = addHarvestEntry(data, entry, "2026-08-04");

    expect(result.vegetables.find((crop) => crop.id === 1 && crop.unit === "kg")?.total).toBe(3.75);
    expect(result.total.kg).toBe(3.75);
    expect(result.today.kg).toBe(1.75);
    expect(result.recent[0]).toEqual(entry);
  });
});
