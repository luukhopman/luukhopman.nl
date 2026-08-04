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
      totals: { count: 0, kg: 0 },
      preferred_unit: latest?.unit ?? "count",
      last_harvest_at: latest?.created_at ?? null,
      symbol: harvestCropSymbol(vegetable.name),
    };
    existing.totals[vegetable.unit] += vegetable.total;
    grouped.set(vegetable.id, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.last_harvest_at && right.last_harvest_at) {
      const recentOrder = right.last_harvest_at.localeCompare(left.last_harvest_at);
      if (recentOrder !== 0) return recentOrder;
    } else if (left.last_harvest_at) {
      return -1;
    } else if (right.last_harvest_at) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function addHarvestEntry(
  data: HarvestCountData,
  entry: HarvestEntry,
  localToday: string,
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
    total: {
      ...data.total,
      [entry.unit]: data.total[entry.unit] + entry.quantity,
    },
    today:
      entry.harvested_on === localToday
        ? {
            ...data.today,
            [entry.unit]: data.today[entry.unit] + entry.quantity,
          }
        : data.today,
  };
}
