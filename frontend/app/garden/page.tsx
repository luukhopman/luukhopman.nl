"use client";

import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { useBodyClass } from "@/lib/browser";

type SunExposure = "full-sun" | "part-sun" | "shade";
type WaterNeed = "low" | "medium" | "high";
type PlantStatus = "planned" | "acquired" | "planted";
type PlantStatusFilter = "all" | PlantStatus;
type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type MapPoint = {
  x: number;
  y: number;
};
type DragState = {
  bedId: string;
  pointerId: number;
  startPointer: MapPoint;
  startLayout: LayoutRect;
};
type ResizeState = {
  bedId: string;
  pointerId: number;
  startPointer: MapPoint;
  startLayout: LayoutRect;
};
type GardenSpace = {
  widthCm: number;
  heightCm: number;
};
type NormalizedGardenPlan = {
  garden: GardenSpace;
  beds: GardenBed[];
};
type GardenDimensionInputs = Record<keyof GardenSpace, string>;
type BedDimensionField = "width" | "height";
type BedDimensionInputs = Record<BedDimensionField, string>;

type PlantEntry = {
  id: string;
  crop: string;
  quantity: string;
  status: PlantStatus;
  notes: string;
};

type GardenBed = {
  id: string;
  name: string;
  size: string;
  sun: SunExposure;
  water: WaterNeed;
  notes: string;
  layout: LayoutRect;
  plants: PlantEntry[];
};

type PlantDraft = Omit<PlantEntry, "id">;

const API_URL = "/api/garden-planner";
const MIN_DRAW_SIZE = 6;
const MIN_MANUAL_BED_SIZE_CM = 10;
const MAP_GRID = 2;
const DEFAULT_GARDEN: GardenSpace = {
  widthCm: 800,
  heightCm: 500,
};
const SUN_OPTIONS: Array<{ label: string; value: SunExposure }> = [
  { label: "Full sun", value: "full-sun" },
  { label: "Part sun", value: "part-sun" },
  { label: "Shade", value: "shade" },
];
const WATER_OPTIONS: Array<{ label: string; value: WaterNeed }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const STATUS_OPTIONS: Array<{ label: string; value: PlantStatus }> = [
  { label: "Planned", value: "planned" },
  { label: "Acquired", value: "acquired" },
  { label: "Planted", value: "planted" },
];
const STATUS_FILTER_OPTIONS: Array<{ label: string; value: PlantStatusFilter }> = [
  { label: "All statuses", value: "all" },
  ...STATUS_OPTIONS,
];
const BED_PALETTE = [
  {
    base: "#ede1d0",
    strong: "#e1ceb0",
    border: "#bfa17a",
    selectedBorder: "#9d7c4f",
    text: "#4e4028",
    badge: "#b28f63",
    badgeText: "#fffaf2",
    pill: "#f8f1e7",
    pillSelected: "#ecdfcb",
  },
  {
    base: "#e7e1d8",
    strong: "#d8cdc1",
    border: "#b59f8d",
    selectedBorder: "#8d7460",
    text: "#4b4035",
    badge: "#9b7f69",
    badgeText: "#fffaf5",
    pill: "#f4efe9",
    pillSelected: "#e6ddd4",
  },
  {
    base: "#e6dfd8",
    strong: "#d8cdc4",
    border: "#b59d8f",
    selectedBorder: "#927464",
    text: "#454032",
    badge: "#a67f70",
    badgeText: "#fff8f5",
    pill: "#f5f0ec",
    pillSelected: "#e9dfd8",
  },
  {
    base: "#e1e4e9",
    strong: "#d0d5de",
    border: "#99a5b6",
    selectedBorder: "#748297",
    text: "#34404f",
    badge: "#7d8da2",
    badgeText: "#fbfcff",
    pill: "#eff2f6",
    pillSelected: "#dfe5ed",
  },
  {
    base: "#ebe1d8",
    strong: "#ddcec3",
    border: "#bf9f8c",
    selectedBorder: "#9b7862",
    text: "#52392c",
    badge: "#aa806b",
    badgeText: "#fff8f4",
    pill: "#f7efea",
    pillSelected: "#ecdcd3",
  },
  {
    base: "#e7e0d3",
    strong: "#d9cfbc",
    border: "#b7a287",
    selectedBorder: "#8e7758",
    text: "#4a3f2d",
    badge: "#a28763",
    badgeText: "#fff9f3",
    pill: "#f5f0e8",
    pillSelected: "#e9dfd0",
  },
] as const;

const STARTER_BEDS: GardenBed[] = [
  {
    id: "starter-bed-1",
    name: "Raised Bed 1",
    size: "240 x 120 cm",
    sun: "full-sun",
    water: "medium",
    notes: "Best for climbing plants. Leave room for a string trellis on the back edge.",
    layout: { x: 8, y: 12, width: 36, height: 18 },
    plants: [
      {
        id: "starter-plant-1",
        crop: "Tomatoes",
        quantity: "2 plants",
        status: "planned",
        notes: "Add basil between plants.",
      },
      {
        id: "starter-plant-2",
        crop: "Basil",
        quantity: "4 plugs",
        status: "planned",
        notes: "",
      },
    ],
  },
  {
    id: "starter-bed-2",
    name: "Kitchen Bed",
    size: "180 x 90 cm",
    sun: "part-sun",
    water: "high",
    notes: "Easy-to-pick plants for salads and herbs.",
    layout: { x: 52, y: 12, width: 28, height: 24 },
    plants: [
      {
        id: "starter-plant-3",
        crop: "Lettuce",
        quantity: "2 rows",
        status: "planted",
        notes: "Sow every two weeks.",
      },
      {
        id: "starter-plant-4",
        crop: "Parsley",
        quantity: "1 clump",
        status: "planted",
        notes: "",
      },
    ],
  },
  {
    id: "starter-bed-3",
    name: "Warm Corner",
    size: "150 x 150 cm",
    sun: "full-sun",
    water: "low",
    notes: "A sheltered spot for heat-loving plants and mulch.",
    layout: { x: 20, y: 52, width: 24, height: 22 },
    plants: [
      {
        id: "starter-plant-5",
        crop: "Courgettes",
        quantity: "1 plant",
        status: "planned",
        notes: "Needs a wide footprint.",
      },
    ],
  },
];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value: number) {
  return Math.round(value / MAP_GRID) * MAP_GRID;
}

function clampLayout(layout: LayoutRect): LayoutRect {
  const width = clamp(snapToGrid(layout.width), MIN_DRAW_SIZE, 88);
  const height = clamp(snapToGrid(layout.height), MIN_DRAW_SIZE, 88);
  const x = clamp(snapToGrid(layout.x), 0, 100 - width);
  const y = clamp(snapToGrid(layout.y), 0, 100 - height);

  return { x, y, width, height };
}

function clampMovedLayout(layout: LayoutRect): LayoutRect {
  const width = clamp(layout.width, 0.1, 100);
  const height = clamp(layout.height, 0.1, 100);
  const x = clamp(snapToGrid(layout.x), 0, 100 - width);
  const y = clamp(snapToGrid(layout.y), 0, 100 - height);

  return { x, y, width, height };
}

function clampResizedLayout(layout: LayoutRect): LayoutRect {
  const x = clamp(snapToGrid(layout.x), 0, 100 - MIN_DRAW_SIZE);
  const y = clamp(snapToGrid(layout.y), 0, 100 - MIN_DRAW_SIZE);
  const width = clamp(snapToGrid(layout.width), MIN_DRAW_SIZE, 100 - x);
  const height = clamp(snapToGrid(layout.height), MIN_DRAW_SIZE, 100 - y);

  return { x, y, width, height };
}

function clampExactResizedLayout(layout: LayoutRect, minWidth: number, minHeight: number): LayoutRect {
  const width = clamp(layout.width, minWidth, 100);
  const height = clamp(layout.height, minHeight, 100);
  const x = clamp(layout.x, 0, 100 - width);
  const y = clamp(layout.y, 0, 100 - height);

  return { x, y, width, height };
}

function createLayoutFromPoints(start: MapPoint, end: MapPoint): LayoutRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return clampLayout({ x, y, width, height });
}

function defaultLayout(index: number): LayoutRect {
  const column = index % 2;
  const row = Math.floor(index / 2);

  return clampLayout({
    x: 8 + column * 40,
    y: 10 + row * 24,
    width: 28,
    height: 18,
  });
}

function createEmptyDraft(): PlantDraft {
  return {
    crop: "",
    quantity: "1",
    status: "planned",
    notes: "",
  };
}

function createBed(nextIndex: number, layout: LayoutRect): GardenBed {
  return {
    id: createId("bed"),
    name: `Bed ${nextIndex}`,
    size: "",
    sun: "full-sun",
    water: "medium",
    notes: "",
    layout,
    plants: [],
  };
}

function createPlant(draft: PlantDraft): PlantEntry {
  return {
    id: createId("plant"),
    crop: draft.crop.trim(),
    quantity: draft.quantity.trim(),
    status: draft.status,
    notes: draft.notes.trim(),
  };
}

function getPlantStatusLabel(status: PlantStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatPlantSummary(plant: PlantEntry) {
  return plant.quantity.trim() || "No quantity yet";
}

function formatMeters(cm: number) {
  return `${(cm / 100).toFixed(2)} m`;
}

function formatCentimeters(cm: number) {
  return `${Math.round(cm)} cm`;
}

function formatMeasuredSize(widthCm: number, heightCm: number) {
  return `${formatCentimeters(widthCm)} x ${formatCentimeters(heightCm)}`;
}

function getBedMeasuredSize(layout: LayoutRect, garden: GardenSpace) {
  return {
    widthCm: (garden.widthCm * layout.width) / 100,
    heightCm: (garden.heightCm * layout.height) / 100,
  };
}

function getBedMapSizeClass(layout: LayoutRect) {
  const minSide = Math.min(layout.width, layout.height);
  const area = layout.width * layout.height;

  if (minSide <= 7 || area <= 70) {
    return " is-micro";
  }

  if (minSide <= 11 || area <= 130) {
    return " is-tiny";
  }

  if (minSide <= 16 || area <= 220) {
    return " is-compact";
  }

  return "";
}

function getLayoutDistanceCm(field: keyof LayoutRect, layout: LayoutRect, garden: GardenSpace) {
  if (field === "x" || field === "width") {
    return (garden.widthCm * layout[field]) / 100;
  }

  return (garden.heightCm * layout[field]) / 100;
}

function isSunExposure(value: unknown): value is SunExposure {
  return value === "full-sun" || value === "part-sun" || value === "shade";
}

function isWaterNeed(value: unknown): value is WaterNeed {
  return value === "low" || value === "medium" || value === "high";
}

function isPlantStatus(value: unknown): value is PlantStatus {
  return value === "planned" || value === "acquired" || value === "planted";
}

function normalizePlantStatus(value: unknown): PlantStatus | null {
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

function normalizeStoredBeds(value: unknown): GardenBed[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedBeds = value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const rawBed = entry as Record<string, unknown>;

    const plants = Array.isArray(rawBed.plants)
      ? rawBed.plants.flatMap((plant) => {
          if (!plant || typeof plant !== "object") {
            return [];
          }

          const rawPlant = plant as Record<string, unknown>;

          const status = normalizePlantStatus(rawPlant.status);

          if (typeof rawPlant.crop !== "string" || !status) {
            return [];
          }

          return [
            {
              id: typeof rawPlant.id === "string" && rawPlant.id ? rawPlant.id : createId("plant"),
              crop: rawPlant.crop,
              quantity: typeof rawPlant.quantity === "string" ? rawPlant.quantity : "",
              status,
              notes: typeof rawPlant.notes === "string" ? rawPlant.notes : "",
            },
          ];
        })
      : [];

    const rawLayout =
      rawBed.layout && typeof rawBed.layout === "object" ? (rawBed.layout as Record<string, unknown>) : null;

    const layout =
      rawLayout &&
      typeof rawLayout.x === "number" &&
      typeof rawLayout.y === "number" &&
      typeof rawLayout.width === "number" &&
      typeof rawLayout.height === "number"
        ? clampLayout({
            x: rawLayout.x,
            y: rawLayout.y,
            width: rawLayout.width,
            height: rawLayout.height,
          })
        : defaultLayout(index);

    return [
      {
        id: typeof rawBed.id === "string" && rawBed.id ? rawBed.id : `bed-${index + 1}`,
        name: typeof rawBed.name === "string" && rawBed.name ? rawBed.name : `Bed ${index + 1}`,
        size: typeof rawBed.size === "string" ? rawBed.size : "",
        sun: isSunExposure(rawBed.sun) ? rawBed.sun : "full-sun",
        water: isWaterNeed(rawBed.water) ? rawBed.water : "medium",
        notes: typeof rawBed.notes === "string" ? rawBed.notes : "",
        layout,
        plants,
      },
    ];
  });

  return normalizedBeds.length > 0 ? normalizedBeds : null;
}

function normalizeStoredPlan(value: unknown): NormalizedGardenPlan | null {
  if (Array.isArray(value)) {
    const beds = normalizeStoredBeds(value);

    if (!beds) {
      return null;
    }

    return {
      garden: DEFAULT_GARDEN,
      beds,
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const rawPlan = value as Record<string, unknown>;
  const beds = normalizeStoredBeds(rawPlan.beds);

  if (!beds) {
    return null;
  }

  return {
    garden: normalizeGardenSpace(rawPlan.garden),
    beds,
  };
}

function getBedTone(bedId: string, isSelected: boolean) {
  const paletteIndex = Array.from(bedId).reduce((hash, character) => hash + character.charCodeAt(0), 0) % BED_PALETTE.length;
  const tone = BED_PALETTE[paletteIndex];

  return {
    background: isSelected ? tone.strong : tone.base,
    border: isSelected ? tone.selectedBorder : tone.border,
    text: tone.text,
    badge: tone.badge,
    badgeText: tone.badgeText,
    pillBackground: isSelected ? tone.pillSelected : tone.pill,
    pillBorder: isSelected ? tone.selectedBorder : tone.border,
    pillText: tone.text,
  };
}

function getCropTone(crop: string) {
  const key = crop.trim().toLowerCase();

  if (key.includes("tomato")) {
    return { background: "#ffe6da", border: "#f6b18d", color: "#9b4420" };
  }
  if (key.includes("lettuce") || key.includes("herb") || key.includes("basil") || key.includes("parsley")) {
    return { background: "#e5f6dc", border: "#abd28f", color: "#386128" };
  }
  if (key.includes("carrot") || key.includes("pepper")) {
    return { background: "#fff1d6", border: "#e6c481", color: "#855719" };
  }
  if (key.includes("bean") || key.includes("pea")) {
    return { background: "#e7f4ee", border: "#9ec8b0", color: "#2c5f4f" };
  }
  if (key.includes("strawberry")) {
    return { background: "#ffe1eb", border: "#f3a4bb", color: "#8f2c49" };
  }

  return { background: "#eef1e8", border: "#c3cdb6", color: "#43513b" };
}

function createDimensionInputs(space: GardenSpace): GardenDimensionInputs {
  return {
    widthCm: String(space.widthCm),
    heightCm: String(space.heightCm),
  };
}

function createBedDimensionInputs(layout: LayoutRect, garden: GardenSpace): BedDimensionInputs {
  return {
    width: String(Math.round(getLayoutDistanceCm("width", layout, garden))),
    height: String(Math.round(getLayoutDistanceCm("height", layout, garden))),
  };
}

function parseDimensionInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return clamp(Math.round(numericValue), 100, 5000);
}

export default function GardenPlannerPage() {
  useBodyClass("garden-body");

  const mapRef = useRef<HTMLDivElement | null>(null);
  const drawStartRef = useRef<MapPoint | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const [garden, setGarden] = useState<GardenSpace>(DEFAULT_GARDEN);
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [draftPlant, setDraftPlant] = useState<PlantDraft>(createEmptyDraft());
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Set your garden size to start planning.");
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<LayoutRect | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupDraft, setSetupDraft] = useState<GardenSpace>(DEFAULT_GARDEN);
  const [setupInputs, setSetupInputs] = useState<GardenDimensionInputs>(() => createDimensionInputs(DEFAULT_GARDEN));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gardenInputs, setGardenInputs] = useState<GardenDimensionInputs>(() => createDimensionInputs(DEFAULT_GARDEN));
  const [bedPendingDelete, setBedPendingDelete] = useState<GardenBed | null>(null);
  const [plantPendingMoveId, setPlantPendingMoveId] = useState<string | null>(null);
  const [movePlantTargetBedId, setMovePlantTargetBedId] = useState("");
  const [isBedSettingsOpen, setIsBedSettingsOpen] = useState(false);
  const [isAddPlantOpen, setIsAddPlantOpen] = useState(false);
  const [isPlantListOpen, setIsPlantListOpen] = useState(false);
  const [bedDimensionInputs, setBedDimensionInputs] = useState<BedDimensionInputs>({ width: "", height: "" });
  const [plantStatusFilter, setPlantStatusFilter] = useState<PlantStatusFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      try {
        const response = await fetch(API_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Failed to load garden plan: ${response.status}`);
        }

        const serverPlan = (await response.json()) as unknown;
        const parsedServerPlan = serverPlan ? normalizeStoredPlan(serverPlan) : null;

        if (!cancelled && parsedServerPlan) {
          setGarden(parsedServerPlan.garden);
          setSetupDraft(parsedServerPlan.garden);
          setGardenInputs(createDimensionInputs(parsedServerPlan.garden));
          setSetupInputs(createDimensionInputs(parsedServerPlan.garden));
          setBeds(parsedServerPlan.beds);
          setSelectedBedId(parsedServerPlan.beds[0]?.id ?? null);
          setShowSetup(false);
          setIsSettingsOpen(false);
          setStatusMessage("Loaded your saved garden plan.");
          return;
        }

        if (!cancelled) {
          setGarden(DEFAULT_GARDEN);
          setSetupDraft(DEFAULT_GARDEN);
          setSetupInputs(createDimensionInputs(DEFAULT_GARDEN));
          setGardenInputs(createDimensionInputs(DEFAULT_GARDEN));
          setBeds([]);
          setSelectedBedId(null);
          setShowSetup(true);
          setIsSettingsOpen(true);
          setStatusMessage("Set your garden size to start planning.");
        }
      } catch (error) {
        console.error("Failed to load garden planner data:", error);
        if (!cancelled) {
          setGarden(DEFAULT_GARDEN);
          setSetupDraft(DEFAULT_GARDEN);
          setSetupInputs(createDimensionInputs(DEFAULT_GARDEN));
          setGardenInputs(createDimensionInputs(DEFAULT_GARDEN));
          setBeds([]);
          setSelectedBedId(null);
          setShowSetup(true);
          setIsSettingsOpen(true);
          setStatusMessage("Could not load the saved garden plan from the database.");
        }
      } finally {
        if (!cancelled) {
          setHasLoaded(true);
        }
      }
    }

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    saveAbortRef.current?.abort();

    const controller = new AbortController();
    saveAbortRef.current = controller;

    void (async () => {
      try {
        const response = await fetch(API_URL, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ garden, beds }),
          keepalive: true,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to save garden plan: ${response.status}`);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to save garden planner data:", error);
        setStatusMessage("Could not save the garden plan to the database.");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [beds, garden, hasLoaded]);

  useEffect(() => {
    if (!beds.length) {
      setSelectedBedId(null);
      return;
    }

    if (!selectedBedId || !beds.some((bed) => bed.id === selectedBedId)) {
      setSelectedBedId(beds[0].id);
    }
  }, [beds, selectedBedId]);

  useEffect(() => {
    setIsBedSettingsOpen(false);
    setPlantPendingMoveId(null);
    setMovePlantTargetBedId("");
  }, [selectedBedId]);

  useEffect(() => {
    setIsAddPlantOpen(false);
    setDraftPlant(createEmptyDraft());
  }, [selectedBedId]);

  const selectedBed = beds.find((bed) => bed.id === selectedBedId) ?? null;
  const selectedBedMeasured = selectedBed ? getBedMeasuredSize(selectedBed.layout, garden) : null;
  const selectedPlant = selectedBed?.plants.find((plant) => plant.id === selectedPlantId) ?? null;
  const allPlants = beds.flatMap((bed) =>
    bed.plants.map((plant) => ({
      bedId: bed.id,
      bedName: bed.name,
      plant,
    })),
  );
  const filteredPlants =
    plantStatusFilter === "all"
      ? allPlants
      : allPlants.filter(({ plant }) => plant.status === plantStatusFilter);

  useEffect(() => {
    if (!selectedBed) {
      setBedDimensionInputs({ width: "", height: "" });
      return;
    }

    setBedDimensionInputs(createBedDimensionInputs(selectedBed.layout, garden));
  }, [selectedBed, garden]);

  useEffect(() => {
    if (!selectedBed?.plants.length) {
      setSelectedPlantId(null);
      return;
    }

    if (selectedPlantId && !selectedBed.plants.some((plant) => plant.id === selectedPlantId)) {
      setSelectedPlantId(null);
    }
  }, [selectedBed, selectedPlantId]);

  function getMapPoint(clientX: number, clientY: number): MapPoint | null {
    const mapElement = mapRef.current;

    if (!mapElement) {
      return null;
    }

    const rect = mapElement.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function updateBed(bedId: string, updates: Partial<GardenBed>) {
    setBeds((currentBeds) => currentBeds.map((bed) => (bed.id === bedId ? { ...bed, ...updates } : bed)));
  }

  function updateBedLayout(
    bedId: string,
    updates: Partial<LayoutRect>,
    mode: "move" | "resize" | "resize-exact" = "move",
  ) {
    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id === bedId
          ? {
              ...bed,
              layout:
                mode === "resize"
                  ? clampResizedLayout({ ...bed.layout, ...updates })
                  : mode === "resize-exact"
                    ? clampExactResizedLayout({ ...bed.layout, ...updates }, MIN_DRAW_SIZE, MIN_DRAW_SIZE)
                    : clampMovedLayout({ ...bed.layout, ...updates }),
            }
          : bed,
      ),
    );
  }

  function updateGardenInput(field: keyof GardenSpace, value: string) {
    setGardenInputs((currentGarden) => ({
      ...currentGarden,
      [field]: value,
    }));

    const parsedValue = parseDimensionInput(value);

    if (parsedValue === null) {
      return;
    }

    setGarden((currentGarden) => ({
      ...currentGarden,
      [field]: parsedValue,
    }));
  }

  function commitGardenInput(field: keyof GardenSpace) {
    const parsedValue = parseDimensionInput(gardenInputs[field]);

    if (parsedValue === null) {
      setGardenInputs((currentGarden) => ({
        ...currentGarden,
        [field]: String(garden[field]),
      }));
      return;
    }

    setGarden((currentGarden) => ({
      ...currentGarden,
      [field]: parsedValue,
    }));
  }

  function updateSetupInput(field: keyof GardenSpace, value: string) {
    setSetupInputs((currentGarden) => ({
      ...currentGarden,
      [field]: value,
    }));

    const parsedValue = parseDimensionInput(value);

    if (parsedValue === null) {
      return;
    }

    setSetupDraft((currentGarden) => ({
      ...currentGarden,
      [field]: parsedValue,
    }));

    setGarden((currentGarden) => ({
      ...currentGarden,
      [field]: parsedValue,
    }));
  }

  function commitSetupInput(field: keyof GardenSpace) {
    const parsedValue = parseDimensionInput(setupInputs[field]);

    if (parsedValue === null) {
      setSetupInputs((currentGarden) => ({
        ...currentGarden,
        [field]: String(setupDraft[field]),
      }));
      return;
    }

    setSetupDraft((currentGarden) => ({
      ...currentGarden,
      [field]: parsedValue,
    }));
  }

  function handleSetupGarden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const widthCm = parseDimensionInput(setupInputs.widthCm);
    const heightCm = parseDimensionInput(setupInputs.heightCm);

    if (widthCm === null || heightCm === null) {
      setSetupInputs(createDimensionInputs(setupDraft));
      return;
    }

    const nextGarden = { widthCm, heightCm };

    setSetupDraft(nextGarden);
    setGarden(nextGarden);
    setShowSetup(false);
    setIsSettingsOpen(false);
    setStatusMessage("Garden size saved. Draw your first bed on the map.");
  }

  function updatePlant(plantId: string, updates: Partial<PlantEntry>) {
    if (!selectedBed) {
      return;
    }

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id !== selectedBed.id
          ? bed
          : {
              ...bed,
              plants: bed.plants.map((plant) => (plant.id === plantId ? { ...plant, ...updates } : plant)),
            },
      ),
    );
  }

  function toggleDrawMode() {
    setIsDrawMode((currentValue) => {
      const nextValue = !currentValue;
      drawStartRef.current = null;
      setDraftLayout(null);
      setStatusMessage(nextValue ? "Drag on the map to draw a new bed." : "Drawing cancelled.");
      return nextValue;
    });
  }

  function handleFinalizeDraw() {
    const completedLayout = draftLayout;

    drawStartRef.current = null;
    setDraftLayout(null);
    setIsDrawMode(false);

    if (!completedLayout || completedLayout.width < MIN_DRAW_SIZE || completedLayout.height < MIN_DRAW_SIZE) {
      setStatusMessage("Draw a slightly larger bed shape.");
      return;
    }

    const newBed = createBed(beds.length + 1, completedLayout);
    setBeds((currentBeds) => [...currentBeds, newBed]);
    setSelectedBedId(newBed.id);
    setStatusMessage(`${newBed.name} drawn on the plan.`);
  }

  function handleDrawPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    drawStartRef.current = point;
    setDraftLayout(clampLayout({ x: point.x, y: point.y, width: MIN_DRAW_SIZE, height: MIN_DRAW_SIZE }));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDrawPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawStartRef.current) {
      return;
    }

    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    setDraftLayout(createLayoutFromPoints(drawStartRef.current, point));
  }

  function handleDrawPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawStartRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    handleFinalizeDraw();
  }

  function handleDrawPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drawStartRef.current = null;
    setDraftLayout(null);
    setIsDrawMode(false);
    setStatusMessage("Drawing cancelled.");
  }

  function handleBedPointerDown(event: ReactPointerEvent<HTMLButtonElement>, bed: GardenBed) {
    if (isDrawMode) {
      return;
    }

    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedBedId(bed.id);
    setDragState({
      bedId: bed.id,
      pointerId: event.pointerId,
      startPointer: point,
      startLayout: bed.layout,
    });
  }

  function handleBedPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resizeState || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const deltaX = point.x - dragState.startPointer.x;
    const deltaY = point.y - dragState.startPointer.y;

    updateBedLayout(dragState.bedId, {
      x: dragState.startLayout.x + deltaX,
      y: dragState.startLayout.y + deltaY,
    }, "move");
  }

  function handleBedPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragState(null);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLSpanElement>, bed: GardenBed) {
    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedBedId(bed.id);
    setDragState(null);
    setResizeState({
      bedId: bed.id,
      pointerId: event.pointerId,
      startPointer: point,
      startLayout: bed.layout,
    });
    setStatusMessage(`Resizing ${bed.name}.`);
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const point = getMapPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const deltaX = point.x - resizeState.startPointer.x;
    const deltaY = point.y - resizeState.startPointer.y;

    updateBedLayout(resizeState.bedId, {
      width: resizeState.startLayout.width + deltaX,
      height: resizeState.startLayout.height + deltaY,
    }, "resize");
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const resizedBed = beds.find((bed) => bed.id === resizeState.bedId);
    setResizeState(null);
    if (resizedBed) {
      setStatusMessage(`${resizedBed.name} resized.`);
    }
  }

  function handleDeleteBed() {
    if (!selectedBed) {
      return;
    }

    setBedPendingDelete(selectedBed);
  }

  function confirmDeleteBed() {
    if (!bedPendingDelete) {
      return;
    }

    setBeds((currentBeds) => currentBeds.filter((bed) => bed.id !== bedPendingDelete.id));
    setStatusMessage(`${bedPendingDelete.name} removed.`);
    setBedPendingDelete(null);
  }

  function handleAddPlant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBed || !draftPlant.crop.trim()) {
      return;
    }

    const nextPlant = createPlant(draftPlant);

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id !== selectedBed.id
          ? bed
          : {
              ...bed,
              plants: [...bed.plants, nextPlant],
            },
      ),
    );
    setDraftPlant(createEmptyDraft());
    setSelectedPlantId(null);
    setIsAddPlantOpen(false);
    setStatusMessage(`Added ${draftPlant.crop.trim()} to ${selectedBed.name}.`);
  }

  function handleDeletePlant(plantId: string, plantName: string) {
    if (!selectedBed) {
      return;
    }

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id !== selectedBed.id
          ? bed
          : {
              ...bed,
              plants: bed.plants.filter((plant) => plant.id !== plantId),
            },
      ),
    );
    if (selectedPlantId === plantId) {
      setSelectedPlantId(null);
    }
    setStatusMessage(`${plantName} removed from ${selectedBed.name}.`);
  }

  function handleMovePlant(plantId: string, targetBedId: string) {
    if (!selectedBed || !targetBedId || targetBedId === selectedBed.id) {
      return;
    }

    const targetBed = beds.find((bed) => bed.id === targetBedId);
    const plantToMove = selectedBed.plants.find((plant) => plant.id === plantId);

    if (!targetBed || !plantToMove) {
      return;
    }

    setBeds((currentBeds) =>
      currentBeds.map((bed) => {
        if (bed.id === selectedBed.id) {
          return {
            ...bed,
            plants: bed.plants.filter((plant) => plant.id !== plantId),
          };
        }

        if (bed.id === targetBedId) {
          return {
            ...bed,
            plants: [...bed.plants, plantToMove],
          };
        }

        return bed;
      }),
    );
    setSelectedPlantId(null);
    setSelectedBedId(targetBedId);
    setStatusMessage(`${plantToMove.crop} moved to ${targetBed.name}.`);
  }

  function handleOpenMovePlant(plantId: string) {
    if (!selectedBed) {
      return;
    }

    const firstTargetBed = beds.find((bed) => bed.id !== selectedBed.id);
    setPlantPendingMoveId(plantId);
    setMovePlantTargetBedId(firstTargetBed?.id ?? "");
  }

  function confirmMovePlant() {
    if (!plantPendingMoveId || !movePlantTargetBedId) {
      return;
    }

    handleMovePlant(plantPendingMoveId, movePlantTargetBedId);
    setPlantPendingMoveId(null);
    setMovePlantTargetBedId("");
  }

  function updateBedDimensionInput(field: BedDimensionField, value: string) {
    setBedDimensionInputs((currentInputs) => ({
      ...currentInputs,
      [field]: value,
    }));
  }

  function commitBedDimensionInput(field: BedDimensionField) {
    if (!selectedBed) {
      return;
    }

    const numericValue = Number(bedDimensionInputs[field]);

    if (!Number.isFinite(numericValue)) {
      setBedDimensionInputs(createBedDimensionInputs(selectedBed.layout, garden));
      return;
    }

    const percentageValue =
      field === "width"
        ? (numericValue / garden.widthCm) * 100
        : (numericValue / garden.heightCm) * 100;

    const minWidth = (MIN_MANUAL_BED_SIZE_CM / garden.widthCm) * 100;
    const minHeight = (MIN_MANUAL_BED_SIZE_CM / garden.heightCm) * 100;

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id !== selectedBed.id
          ? bed
          : {
              ...bed,
              layout: clampExactResizedLayout(
                { ...bed.layout, [field]: percentageValue },
                minWidth,
                minHeight,
              ),
            },
      ),
    );
  }

  function handleOpenSettings() {
    if (showSetup) {
      setSetupInputs(createDimensionInputs(setupDraft));
      setIsSettingsOpen(true);
      return;
    }

    setGardenInputs(createDimensionInputs(garden));
    setIsSettingsOpen((currentValue) => !currentValue);
  }

  function handleSelectPlant(bedId: string, plantId: string) {
    setSelectedBedId(bedId);
    setSelectedPlantId(plantId);
    setIsAddPlantOpen(false);
    setIsPlantListOpen(false);
  }

  return (
    <main className="garden-shell">
      <div className="garden-backdrop" aria-hidden="true" />

      <header className="garden-topbar">
        <h1>Garden Planner</h1>
        <button
          type="button"
          className={`garden-secondary-button${showSetup || isSettingsOpen ? " is-active" : ""}`}
          onClick={handleOpenSettings}
          aria-expanded={showSetup || isSettingsOpen}
          aria-controls="garden-settings-panel"
        >
          Settings
        </button>
      </header>

      {showSetup || isSettingsOpen ? (
        <div
          className="garden-settings-modal"
          onClick={() => {
            if (!showSetup) {
              setIsSettingsOpen(false);
            }
          }}
        >
          <section
            className="garden-settings-panel"
            id="garden-settings-panel"
            aria-labelledby="garden-settings-title"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="garden-settings-header">
              <div className="garden-settings-header-copy">
                <p className="garden-section-kicker">Setup</p>
                <h2 id="garden-settings-title">Garden settings</h2>
              </div>
              {!showSetup ? (
                <button type="button" className="garden-settings-close" onClick={() => setIsSettingsOpen(false)}>
                  Close
                </button>
              ) : null}
            </div>

            {showSetup ? (
              <form className="garden-form-grid garden-settings-form" onSubmit={handleSetupGarden}>
                <label className="garden-field">
                  <span>Garden width (cm)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={setupInputs.widthCm}
                    onChange={(event) => updateSetupInput("widthCm", event.target.value)}
                    onBlur={() => commitSetupInput("widthCm")}
                    min={100}
                    max={5000}
                    required
                  />
                </label>

                <label className="garden-field">
                  <span>Garden height (cm)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={setupInputs.heightCm}
                    onChange={(event) => updateSetupInput("heightCm", event.target.value)}
                    onBlur={() => commitSetupInput("heightCm")}
                    min={100}
                    max={5000}
                    required
                  />
                </label>

                <div className="garden-form-actions garden-field-wide">
                  <button type="submit" className="garden-primary-button">
                    Save garden size
                  </button>
                </div>
              </form>
            ) : (
              <div className="garden-form-grid garden-settings-form">
                <label className="garden-field">
                  <span>Garden width (cm)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gardenInputs.widthCm}
                    onChange={(event) => updateGardenInput("widthCm", event.target.value)}
                    onBlur={() => commitGardenInput("widthCm")}
                    min={100}
                    max={5000}
                  />
                </label>

                <label className="garden-field">
                  <span>Garden height (cm)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gardenInputs.heightCm}
                    onChange={(event) => updateGardenInput("heightCm", event.target.value)}
                    onBlur={() => commitGardenInput("heightCm")}
                    min={100}
                    max={5000}
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {bedPendingDelete ? (
        <div className="garden-dialog-modal" onClick={() => setBedPendingDelete(null)}>
          <section
            className="garden-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="garden-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="garden-dialog-copy">
              <h2 id="garden-delete-title">Delete bed?</h2>
              <p>
                Remove <strong>{bedPendingDelete.name}</strong> and all of its plantings from the garden plan.
              </p>
            </div>

            <div className="garden-dialog-actions">
              <button type="button" className="garden-secondary-button" onClick={() => setBedPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="garden-danger-button" onClick={confirmDeleteBed}>
                Delete bed
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {plantPendingMoveId && selectedBed ? (
        <div
          className="garden-dialog-modal"
          onClick={() => {
            setPlantPendingMoveId(null);
            setMovePlantTargetBedId("");
          }}
        >
          <section
            className="garden-dialog-panel"
            aria-labelledby="garden-move-plant-title"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="garden-dialog-copy">
              <h2 id="garden-move-plant-title">Move plant</h2>
              <p>Choose the bed you want to move this plant into.</p>
            </div>

            <label className="garden-field garden-field-wide">
              <span>Destination bed</span>
              <select value={movePlantTargetBedId} onChange={(event) => setMovePlantTargetBedId(event.target.value)}>
                {beds
                  .filter((bed) => bed.id !== selectedBed.id)
                  .map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.name}
                    </option>
                  ))}
              </select>
            </label>

            <div className="garden-dialog-actions">
              <button
                type="button"
                className="garden-secondary-button"
                onClick={() => {
                  setPlantPendingMoveId(null);
                  setMovePlantTargetBedId("");
                }}
              >
                Cancel
              </button>
              <button type="button" className="garden-primary-button" onClick={confirmMovePlant}>
                Move plant
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isPlantListOpen ? (
        <div className="garden-dialog-modal" onClick={() => setIsPlantListOpen(false)}>
          <section
            className="garden-dialog-panel garden-plant-list-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="garden-all-plants-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="garden-settings-header">
              <div className="garden-settings-header-copy">
                <p className="garden-section-kicker">Overview</p>
                <h2 id="garden-all-plants-title">All plants</h2>
              </div>
              <button type="button" className="garden-settings-close" onClick={() => setIsPlantListOpen(false)}>
                Close
              </button>
            </div>

            <div className="garden-subheading garden-plant-table-heading">
              <div>
                <p>
                  {filteredPlants.length} of {allPlants.length} showing
                </p>
              </div>

              <label className="garden-field garden-table-filter">
                <span>Status</span>
                <select value={plantStatusFilter} onChange={(event) => setPlantStatusFilter(event.target.value as PlantStatusFilter)}>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {allPlants.length ? (
              <div className="garden-plant-table-wrap">
                <table className="garden-plant-table">
                  <thead>
                    <tr>
                      <th scope="col">Plant</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Status</th>
                      <th scope="col">Bed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlants.length ? (
                      filteredPlants.map(({ bedId, bedName, plant }) => {
                        const isSelected = bedId === selectedBedId && plant.id === selectedPlantId;

                        return (
                          <tr
                            key={plant.id}
                            className={isSelected ? "is-selected" : ""}
                            onClick={() => handleSelectPlant(bedId, plant.id)}
                          >
                            <td>
                              <button
                                type="button"
                                className="garden-plant-table-button"
                                onClick={() => handleSelectPlant(bedId, plant.id)}
                              >
                                {plant.crop}
                              </button>
                            </td>
                            <td>{formatPlantSummary(plant)}</td>
                            <td>
                              <span className={`garden-plant-status is-${plant.status}`}>{getPlantStatusLabel(plant.status)}</span>
                            </td>
                            <td>{bedName}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4}>
                          <div className="garden-empty-state">No plants match that status filter.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="garden-empty-state">No plants yet.</div>
            )}
          </section>
        </div>
      ) : null}

      <p className="garden-live-region" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <div className="garden-workspace">
        <section className="garden-board-panel" aria-labelledby="garden-board-title">
          <div className="garden-section-heading">
            <h2 id="garden-board-title">Garden map</h2>
            <div className="garden-board-actions">
              <button
                type="button"
                className="garden-secondary-button"
                onClick={() => setIsPlantListOpen(true)}
              >
                All plants
              </button>
              <button
                type="button"
                className={isDrawMode ? "garden-secondary-button is-active" : "garden-primary-button"}
                onClick={toggleDrawMode}
              >
                {isDrawMode ? "Cancel drawing" : "Add bed"}
              </button>
            </div>
          </div>

          <div
            ref={mapRef}
            className={`garden-map-stage${isDrawMode ? " is-drawing" : ""}`}
            style={{ aspectRatio: `${garden.widthCm} / ${garden.heightCm}` }}
          >
            <div className="garden-map-grid" aria-hidden="true" />
            <div className="garden-map-measure garden-map-measure-width" aria-hidden="true">
              <span className="garden-map-measure-line" />
              <span className="garden-map-measure-label">{formatMeters(garden.widthCm)}</span>
            </div>
            <div className="garden-map-measure garden-map-measure-height" aria-hidden="true">
              <span className="garden-map-measure-line" />
              <span className="garden-map-measure-label">{formatMeters(garden.heightCm)}</span>
            </div>

            {beds.map((bed, index) => {
              const isSelected = bed.id === selectedBedId;
              const tone = getBedTone(bed.id, isSelected);
              const bedNumber = index + 1;
              const mapSizeClass = getBedMapSizeClass(bed.layout);
              const bedStyle = {
                left: `${bed.layout.x}%`,
                top: `${bed.layout.y}%`,
                width: `${bed.layout.width}%`,
                height: `${bed.layout.height}%`,
                "--bed-fill": tone.background,
                "--bed-border": tone.border,
                "--bed-text": tone.text,
                "--bed-badge": tone.badge,
                "--bed-badge-text": tone.badgeText,
              } as CSSProperties;

              return (
                <button
                  key={bed.id}
                  type="button"
                  className={`garden-map-bed${isSelected ? " is-selected" : ""}${mapSizeClass}`}
                  style={bedStyle}
                  onClick={() => setSelectedBedId(bed.id)}
                  onPointerDown={(event) => handleBedPointerDown(event, bed)}
                  onPointerMove={handleBedPointerMove}
                  onPointerUp={handleBedPointerUp}
                  onPointerCancel={handleBedPointerUp}
                >
                  <span className="garden-map-bed-badge">{bedNumber}</span>
                  {isSelected ? (
                    <span
                      className="garden-map-bed-resize"
                      role="presentation"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => handleResizePointerDown(event, bed)}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      onPointerCancel={handleResizePointerUp}
                    />
                  ) : null}
                </button>
              );
            })}

            {draftLayout ? (
              <div
                className="garden-map-preview"
                style={{
                  left: `${draftLayout.x}%`,
                  top: `${draftLayout.y}%`,
                  width: `${draftLayout.width}%`,
                  height: `${draftLayout.height}%`,
                }}
              />
            ) : null}

            {isDrawMode ? (
              <div
                className="garden-map-overlay"
                onPointerDown={handleDrawPointerDown}
                onPointerMove={handleDrawPointerMove}
                onPointerUp={handleDrawPointerUp}
                onPointerCancel={handleDrawPointerCancel}
              />
            ) : null}

          </div>

          <div className="garden-bed-list" aria-label="Beds">
            {beds.map((bed, index) => {
              const isSelected = bed.id === selectedBedId;
              const tone = getBedTone(bed.id, isSelected);
              const bedNumber = index + 1;

              return (
                <button
                  key={bed.id}
                  type="button"
                  className={`garden-bed-pill${isSelected ? " is-selected" : ""}`}
                  style={{
                    background: tone.pillBackground,
                    borderColor: tone.pillBorder,
                    color: tone.pillText,
                  }}
                  onClick={() => setSelectedBedId(bed.id)}
                >
                  <span className="garden-bed-pill-badge">{bedNumber}</span>
                  <span className="garden-bed-pill-label">{bed.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="garden-editor-panel">
          <div className="garden-section-heading">
            <div>
              <p className="garden-section-kicker">Editor</p>
              <h2>{selectedBed ? selectedBed.name : "Select a bed"}</h2>
            </div>
            {selectedBed ? (
              <button type="button" className="garden-danger-button" onClick={handleDeleteBed}>
                Delete bed
              </button>
            ) : null}
          </div>

          {selectedBed ? (
            <>
              <section className="garden-plantings">
                {selectedBed.plants.length ? (
                  <>
                    <div className="garden-planting-list" role="list">
                      {selectedBed.plants.map((plant) => {
                        const isSelected = plant.id === selectedPlantId;

                        return (
                          <button
                            key={plant.id}
                            type="button"
                            className={`garden-plant-row${isSelected ? " is-selected" : ""}`}
                            onClick={() => {
                              setIsAddPlantOpen(false);
                              setSelectedPlantId(plant.id);
                            }}
                          >
                            <span className="garden-plant-row-main">
                              <span className="garden-plant-row-copy">
                                <strong>{plant.crop}</strong>
                                <span className="garden-plant-row-meta">{formatPlantSummary(plant)}</span>
                              </span>
                            </span>

                            <span className={`garden-plant-status is-${plant.status}`}>{getPlantStatusLabel(plant.status)}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedPlant && !isAddPlantOpen ? (
                      <article className="garden-plant-detail">
                        <div className="garden-plant-detail-head">
                          <div className="garden-plant-detail-copy">
                            <h3>{selectedPlant.crop}</h3>
                            <p>{formatPlantSummary(selectedPlant)}</p>
                          </div>

                          <div className="garden-plant-detail-actions">
                            {beds.length > 1 ? (
                              <button
                                type="button"
                                className="garden-inline-action"
                                onClick={() => handleOpenMovePlant(selectedPlant.id)}
                              >
                                Move
                              </button>
                            ) : null}

                            <button
                              type="button"
                              className="garden-inline-delete"
                              onClick={() => handleDeletePlant(selectedPlant.id, selectedPlant.crop)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="garden-form-grid garden-plant-form-grid">
                          <label className="garden-field">
                            <span>Plant</span>
                            <input
                              type="text"
                              value={selectedPlant.crop}
                              onChange={(event) => updatePlant(selectedPlant.id, { crop: event.target.value })}
                            />
                          </label>

                          <label className="garden-field">
                            <span>Quantity</span>
                            <input
                              type="text"
                              value={selectedPlant.quantity}
                              onChange={(event) => updatePlant(selectedPlant.id, { quantity: event.target.value })}
                              placeholder="3"
                            />
                          </label>

                          <label className="garden-field">
                            <span>Status</span>
                            <select
                              value={selectedPlant.status}
                              onChange={(event) => updatePlant(selectedPlant.id, { status: event.target.value as PlantStatus })}
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="garden-field garden-field-wide">
                            <span>Notes</span>
                            <textarea
                              value={selectedPlant.notes}
                              onChange={(event) => updatePlant(selectedPlant.id, { notes: event.target.value })}
                              placeholder="Spacing, support, sowing window, feeding reminders..."
                            />
                          </label>
                        </div>
                      </article>
                    ) : null}
                  </>
                ) : (
                  <div className="garden-empty-state">No plants yet.</div>
                )}

                  {!isAddPlantOpen ? (
                    <div className="garden-add-crop-bar">
                      <button
                        type="button"
                        className="garden-primary-button"
                        onClick={() => {
                          setSelectedPlantId(null);
                          setIsAddPlantOpen(true);
                        }}
                      >
                        Add plant
                      </button>
                    </div>
                  ) : null}

                  {isAddPlantOpen ? (
                    <section className="garden-add-form-panel">
                      <div className="garden-add-form-head">
                        <p className="garden-add-form-title">New planting</p>
                        <button
                          type="button"
                          className="garden-add-form-close"
                          aria-label="Close new planting form"
                          onClick={() => setIsAddPlantOpen(false)}
                        >
                          <span className="garden-add-form-close-icon" aria-hidden="true" />
                        </button>
                      </div>

                      <form className="garden-form-grid garden-add-plant-grid" onSubmit={handleAddPlant}>
                        <label className="garden-field">
                          <span>Plant</span>
                          <input
                            type="text"
                            value={draftPlant.crop}
                            onChange={(event) => setDraftPlant((current) => ({ ...current, crop: event.target.value }))}
                            placeholder="Beetroot"
                            required
                          />
                        </label>

                        <label className="garden-field">
                          <span>Quantity</span>
                          <input
                            type="text"
                            value={draftPlant.quantity}
                            onChange={(event) => setDraftPlant((current) => ({ ...current, quantity: event.target.value }))}
                            placeholder="3"
                          />
                        </label>

                        <label className="garden-field">
                          <span>Status</span>
                          <select
                            value={draftPlant.status}
                            onChange={(event) =>
                              setDraftPlant((current) => ({ ...current, status: event.target.value as PlantStatus }))
                            }
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="garden-field garden-field-wide">
                          <span>Notes</span>
                          <textarea
                            value={draftPlant.notes}
                            onChange={(event) => setDraftPlant((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Companion plants, spacing, planting date..."
                          />
                        </label>

                        <div className="garden-form-actions">
                          <button type="submit" className="garden-primary-button">
                            Add plant
                          </button>
                        </div>
                      </form>
                    </section>
                  ) : null}
              </section>

              <section className="garden-bed-settings-panel" aria-labelledby="garden-bed-settings-title">
                <button
                  type="button"
                  className={`garden-bed-settings-toggle${isBedSettingsOpen ? " is-open" : ""}`}
                  onClick={() => setIsBedSettingsOpen((currentValue) => !currentValue)}
                  aria-expanded={isBedSettingsOpen}
                  aria-controls="garden-bed-settings-body"
                >
                  <span className="garden-bed-settings-copy">
                    <strong id="garden-bed-settings-title">Bed settings</strong>
                    <span>
                      {selectedBedMeasured
                        ? `${formatMeasuredSize(selectedBedMeasured.widthCm, selectedBedMeasured.heightCm)}`
                        : selectedBed.name}
                    </span>
                  </span>
                  <span className="garden-bed-settings-chevron" aria-hidden="true" />
                </button>

                {isBedSettingsOpen ? (
                  <div className="garden-bed-settings-body" id="garden-bed-settings-body">
                    <div className="garden-form-grid">
                      <label className="garden-field garden-field-wide">
                        <span>Bed name</span>
                        <input
                          type="text"
                          value={selectedBed.name}
                          onChange={(event) => updateBed(selectedBed.id, { name: event.target.value })}
                        />
                      </label>

                      <label className="garden-field">
                        <span>Width (cm)</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={bedDimensionInputs.width}
                          onChange={(event) => updateBedDimensionInput("width", event.target.value)}
                          onBlur={() => commitBedDimensionInput("width")}
                          min={MIN_MANUAL_BED_SIZE_CM}
                          max={garden.widthCm}
                        />
                      </label>

                      <label className="garden-field">
                        <span>Height (cm)</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={bedDimensionInputs.height}
                          onChange={(event) => updateBedDimensionInput("height", event.target.value)}
                          onBlur={() => commitBedDimensionInput("height")}
                          min={MIN_MANUAL_BED_SIZE_CM}
                          max={garden.heightCm}
                        />
                      </label>

                      <label className="garden-field">
                        <span>Sun</span>
                        <select
                          value={selectedBed.sun}
                          onChange={(event) => updateBed(selectedBed.id, { sun: event.target.value as SunExposure })}
                        >
                          {SUN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="garden-field">
                        <span>Water</span>
                        <select
                          value={selectedBed.water}
                          onChange={(event) => updateBed(selectedBed.id, { water: event.target.value as WaterNeed })}
                        >
                          {WATER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="garden-field garden-field-wide">
                        <span>Notes</span>
                        <textarea
                          value={selectedBed.notes}
                          onChange={(event) => updateBed(selectedBed.id, { notes: event.target.value })}
                          placeholder="Rotation ideas, companion planting notes, support structures..."
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="garden-empty-state">Draw a bed on the map or select one to start editing.</div>
          )}
        </aside>
      </div>
    </main>
  );
}
