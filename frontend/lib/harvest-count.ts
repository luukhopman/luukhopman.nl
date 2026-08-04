import type {
  HarvestCountData,
  HarvestEntry,
  HarvestUnit,
  HarvestUnitTotals,
  HarvestVegetable,
} from "@/lib/types";

export type HarvestCropTone = "red" | "green" | "orange" | "yellow" | "purple" | "earth";

export type HarvestCropSymbol = {
  glyph: string;
  tone: HarvestCropTone;
};

export type HarvestCropView = {
  id: number;
  name: string;
  created_at: string;
  totals: HarvestUnitTotals;
  preferred_unit: HarvestUnit;
  last_harvest_at: string | null;
  symbol: HarvestCropSymbol;
};

const CROP_SYMBOLS: Array<{ terms: string[]; symbol: HarvestCropSymbol }> = [
  { terms: ["tomato"], symbol: { glyph: "🍅", tone: "red" } },
  { terms: ["pepper", "chilli", "chili"], symbol: { glyph: "🫑", tone: "red" } },
  { terms: ["carrot"], symbol: { glyph: "🥕", tone: "orange" } },
  { terms: ["pumpkin", "squash"], symbol: { glyph: "🎃", tone: "orange" } },
  { terms: ["cucumber", "courgette", "zucchini"], symbol: { glyph: "🥒", tone: "green" } },
  { terms: ["lettuce", "kale", "spinach", "cabbage"], symbol: { glyph: "🥬", tone: "green" } },
  { terms: ["broccoli"], symbol: { glyph: "🥦", tone: "green" } },
  { terms: ["pea"], symbol: { glyph: "🫛", tone: "green" } },
  { terms: ["bean"], symbol: { glyph: "🫘", tone: "earth" } },
  { terms: ["onion", "shallot", "garlic"], symbol: { glyph: "🧅", tone: "purple" } },
  { terms: ["potato"], symbol: { glyph: "🥔", tone: "earth" } },
  { terms: ["corn", "maize"], symbol: { glyph: "🌽", tone: "yellow" } },
  { terms: ["aubergine", "eggplant"], symbol: { glyph: "🍆", tone: "purple" } },
  { terms: ["radish", "beet"], symbol: { glyph: "🌱", tone: "purple" } },
];

export function harvestCropSymbol(name: string): HarvestCropSymbol {
  const normalized = name.trim().toLocaleLowerCase();
  return (
    CROP_SYMBOLS.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.symbol ?? {
      glyph: "🌱",
      tone: "green",
    }
  );
}

export function groupHarvestCrops(
  vegetables: HarvestVegetable[],
  recent: HarvestEntry[],
): HarvestCropView[] {
  const recentByCrop = new Map<number, HarvestEntry>();
  for (const entry of recent) {
    if (!recentByCrop.has(entry.vegetable_id)) recentByCrop.set(entry.vegetable_id, entry);
  }

  const grouped = new Map<number, HarvestCropView>();
  for (const vegetable of vegetables) {
    const latest = recentByCrop.get(vegetable.id);
    const existing = grouped.get(vegetable.id) ?? {
      id: vegetable.id,
      name: vegetable.name,
      created_at: vegetable.created_at,
      totals: { count: 0, g: 0 },
      preferred_unit: latest?.unit ?? "count",
      last_harvest_at: latest?.created_at ?? null,
      symbol: harvestCropSymbol(vegetable.name),
    };
    existing.totals[vegetable.unit] += vegetable.total;
    grouped.set(vegetable.id, existing);
  }

  // Keep the crop cards in the order supplied by the API. The API returns
  // existing crops alphabetically, and preserving that order prevents a
  // harvest from moving a crop to a different position on every save.
  return [...grouped.values()];
}

export function addHarvestEntry(
  data: HarvestCountData,
  entry: HarvestEntry,
): HarvestCountData {
  const rowIndex = data.vegetables.findIndex(
    (vegetable) => vegetable.id === entry.vegetable_id && vegetable.unit === entry.unit,
  );
  const vegetables = [...data.vegetables];

  if (rowIndex >= 0) {
    vegetables[rowIndex] = {
      ...vegetables[rowIndex],
      name: entry.vegetable_name,
      total: vegetables[rowIndex].total + entry.quantity,
    };
  } else {
    vegetables.push({
      id: entry.vegetable_id,
      name: entry.vegetable_name,
      unit: entry.unit,
      total: entry.quantity,
      created_at: entry.created_at,
    });
  }

  return {
    vegetables,
    recent: [entry, ...data.recent.filter((recentEntry) => recentEntry.id !== entry.id)].slice(0, 60),
  };
}
