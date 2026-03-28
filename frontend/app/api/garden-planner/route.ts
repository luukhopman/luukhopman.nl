import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GardenSpace = {
  widthCm: number;
  heightCm: number;
};

type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PlantEntry = {
  id: string;
  crop: string;
  quantity: string;
  status: "planned" | "acquired" | "planted";
  notes: string;
};

type GardenBed = {
  id: string;
  name: string;
  location: string;
  size: string;
  sun: "full-sun" | "part-sun" | "shade";
  water: "low" | "medium" | "high";
  notes: string;
  layout: LayoutRect;
  plants: PlantEntry[];
};

const DEFAULT_GARDEN: GardenSpace = {
  widthCm: 800,
  heightCm: 500,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isSunExposure(value: unknown): value is GardenBed["sun"] {
  return value === "full-sun" || value === "part-sun" || value === "shade";
}

function isWaterNeed(value: unknown): value is GardenBed["water"] {
  return value === "low" || value === "medium" || value === "high";
}

function isPlantStatus(value: unknown): value is PlantEntry["status"] {
  return value === "planned" || value === "acquired" || value === "planted";
}

function normalizePlantStatus(value: unknown): PlantEntry["status"] | null {
  if (value === "planned" || value === "acquired" || value === "planted") {
    return value;
  }

  if (value === "growing" || value === "harvested") {
    return "planted";
  }

  return null;
}

function normalizeGardenSpace(value: unknown): GardenSpace {
  if (!value || typeof value !== "object") {
    return DEFAULT_GARDEN;
  }

  const rawGarden = value as Record<string, unknown>;
  const widthCm =
    typeof rawGarden.widthCm === "number" && Number.isFinite(rawGarden.widthCm) ? rawGarden.widthCm : DEFAULT_GARDEN.widthCm;
  const heightCm =
    typeof rawGarden.heightCm === "number" && Number.isFinite(rawGarden.heightCm)
      ? rawGarden.heightCm
      : DEFAULT_GARDEN.heightCm;

  return {
    widthCm: clamp(Math.round(widthCm), 100, 5000),
    heightCm: clamp(Math.round(heightCm), 100, 5000),
  };
}

function normalizeLayout(value: unknown, index: number): LayoutRect {
  if (!value || typeof value !== "object") {
    return {
      x: clamp(8 + (index % 2) * 40, 0, 92),
      y: clamp(10 + Math.floor(index / 2) * 24, 0, 92),
      width: 28,
      height: 18,
    };
  }

  const rawLayout = value as Record<string, unknown>;
  const x = typeof rawLayout.x === "number" && Number.isFinite(rawLayout.x) ? rawLayout.x : 8;
  const y = typeof rawLayout.y === "number" && Number.isFinite(rawLayout.y) ? rawLayout.y : 10;
  const width = typeof rawLayout.width === "number" && Number.isFinite(rawLayout.width) ? rawLayout.width : 28;
  const height = typeof rawLayout.height === "number" && Number.isFinite(rawLayout.height) ? rawLayout.height : 18;

  const clampedWidth = clamp(Math.round(width), 6, 100);
  const clampedHeight = clamp(Math.round(height), 6, 100);

  return {
    x: clamp(Math.round(x), 0, 100 - clampedWidth),
    y: clamp(Math.round(y), 0, 100 - clampedHeight),
    width: clampedWidth,
    height: clampedHeight,
  };
}

function normalizePlants(value: unknown): PlantEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const rawPlant = entry as Record<string, unknown>;

    const status = normalizePlantStatus(rawPlant.status);

    if (typeof rawPlant.crop !== "string" || !status) {
      return [];
    }

    return [
      {
        id: typeof rawPlant.id === "string" && rawPlant.id ? rawPlant.id : `plant-${Date.now()}`,
        crop: rawPlant.crop,
        quantity: typeof rawPlant.quantity === "string" ? rawPlant.quantity : "",
        status,
        notes: typeof rawPlant.notes === "string" ? rawPlant.notes : "",
      },
    ];
  });
}

function normalizeBeds(value: unknown): GardenBed[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const rawBed = entry as Record<string, unknown>;

    return [
      {
        id: typeof rawBed.id === "string" && rawBed.id ? rawBed.id : `bed-${index + 1}`,
        name: typeof rawBed.name === "string" && rawBed.name ? rawBed.name : `Bed ${index + 1}`,
        location: typeof rawBed.location === "string" ? rawBed.location : "",
        size: typeof rawBed.size === "string" ? rawBed.size : "",
        sun: isSunExposure(rawBed.sun) ? rawBed.sun : "full-sun",
        water: isWaterNeed(rawBed.water) ? rawBed.water : "medium",
        notes: typeof rawBed.notes === "string" ? rawBed.notes : "",
        layout: normalizeLayout(rawBed.layout, index),
        plants: normalizePlants(rawBed.plants),
      },
    ];
  });
}

function normalizePlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      garden: DEFAULT_GARDEN,
      beds: [],
    };
  }

  const rawPlan = value as Record<string, unknown>;

  return {
    garden: normalizeGardenSpace(rawPlan.garden),
    beds: normalizeBeds(rawPlan.beds),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const row = await queryOne<{ garden: unknown; beds: unknown }>(
    `
      SELECT garden, beds
      FROM garden_plans
      WHERE id = 1
    `,
  );

  if (!row) {
    return NextResponse.json(null);
  }

  return NextResponse.json(normalizePlan(row));
}

export async function PUT(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const normalized = normalizePlan(await request.json());

  await queryOne<{ id: number }>(
    `
      INSERT INTO garden_plans (id, garden, beds, updated_at)
      VALUES (1, $1::jsonb, $2::jsonb, $3)
      ON CONFLICT (id)
      DO UPDATE SET
        garden = EXCLUDED.garden,
        beds = EXCLUDED.beds,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      JSON.stringify(normalized.garden),
      JSON.stringify(normalized.beds),
      new Date().toISOString(),
    ],
  );

  return NextResponse.json(normalized);
}
