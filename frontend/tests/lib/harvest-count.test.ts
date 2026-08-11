import { describe, expect, it } from "vitest";

import {
  addHarvestEntry,
  filterHarvestEntriesByCrop,
  groupHarvestEntries,
  groupHarvestCrops,
  harvestCropSymbol,
} from "@/lib/harvest-count";
import type { HarvestCountData, HarvestEntry, HarvestVegetable } from "@/lib/types";

const vegetables: HarvestVegetable[] = [
  { id: 1, name: "Tomatoes", unit: "count", total: 12, created_at: "2026-07-01T09:00:00Z" },
  { id: 2, name: "Courgettes", unit: "g", total: 2500, created_at: "2026-07-02T09:00:00Z" },
];

const recent: HarvestEntry[] = [
  {
    id: 5,
    vegetable_id: 2,
    vegetable_name: "Courgettes",
    quantity: 500,
    unit: "g",
    harvested_on: "2026-08-04",
    created_at: "2026-08-04T11:00:00Z",
  },
  {
    id: 4,
    vegetable_id: 1,
    vegetable_name: "Tomatoes",
    quantity: 1,
    unit: "count",
    harvested_on: "2026-08-04",
    created_at: "2026-08-04T10:00:00Z",
  },
];

describe("groupHarvestCrops", () => {
  it("keeps each crop on its fixed unit while preserving crop order", () => {
    const crops = groupHarvestCrops(vegetables, recent);

    expect(crops.map((crop) => crop.name)).toEqual(["Tomatoes", "Courgettes"]);
    expect(crops[0]).toMatchObject({
      totals: { count: 12, g: 0 },
      preferred_unit: "count",
    });
  });

  it("fills missing unit totals with zero", () => {
    expect(groupHarvestCrops(vegetables, recent)[1].totals).toEqual({ count: 0, g: 2500 });
  });

  it("ignores a stale second unit instead of displaying mixed totals", () => {
    const mixedRows: HarvestVegetable[] = [
      ...vegetables,
      { id: 1, name: "Tomatoes", unit: "g", total: 900, created_at: "2026-07-01T09:00:00Z" },
    ];

    expect(groupHarvestCrops(mixedRows, recent)[0].totals).toEqual({ count: 12, g: 0 });
  });
});

describe("harvestCropSymbol", () => {
  it("matches known crops and falls back to a leaf", () => {
    expect(harvestCropSymbol("Cherry tomatoes").glyph).toBe("🍅");
    expect(harvestCropSymbol("Mystery crop")).toEqual({ glyph: "🌱", tone: "green" });
  });
});

describe("addHarvestEntry", () => {
  it("updates the crop unit total and recent history", () => {
    const data: HarvestCountData = {
      vegetables,
      recent,
    };
    const entry: HarvestEntry = {
      id: 6,
      vegetable_id: 2,
      vegetable_name: "Courgettes",
      quantity: 1250,
      unit: "g",
      harvested_on: "2026-08-04",
      created_at: "2026-08-04T12:00:00Z",
    };

    const result = addHarvestEntry(data, entry);

    expect(result.vegetables.find((crop) => crop.id === 2 && crop.unit === "g")?.total).toBe(3750);
    expect(result.recent[0]).toEqual(entry);
  });
});

describe("filterHarvestEntriesByCrop", () => {
  it("returns all entries or only the selected crop", () => {
    expect(filterHarvestEntriesByCrop(recent, null)).toEqual(recent);
    expect(filterHarvestEntriesByCrop(recent, 1).map((entry) => entry.vegetable_name)).toEqual(["Tomatoes"]);
  });
});

describe("groupHarvestEntries", () => {
  it("combines rapid additions for the same crop and date", () => {
    const entries: HarvestEntry[] = [
      { ...recent[0], id: 8, quantity: 1, created_at: "2026-08-04T11:00:05Z" },
      { ...recent[0], id: 7, quantity: 1, created_at: "2026-08-04T11:00:03Z" },
      { ...recent[0], id: 6, quantity: 1, created_at: "2026-08-04T11:00:01Z" },
      { ...recent[0], id: 5, quantity: 1, created_at: "2026-08-04T11:01:00Z" },
    ];

    expect(groupHarvestEntries(entries)).toMatchObject([
      { id: 8, entryIds: [8, 7, 6], quantity: 3 },
      { id: 5, entryIds: [5], quantity: 1 },
    ]);
  });

  it("does not combine different crops", () => {
    expect(groupHarvestEntries(recent)).toHaveLength(2);
  });
});
