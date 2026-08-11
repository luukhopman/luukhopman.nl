"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  addHarvestEntry,
  filterHarvestEntriesByCrop,
  groupHarvestEntries,
  groupHarvestCrops,
  harvestCropSymbol,
  type HarvestCropView,
  type HarvestEntryGroup,
} from "@/lib/harvest-count";
import {
  triggerHaptic,
  useBodyClass,
  useBottomSheetGesture,
  useLockedBody,
} from "@/lib/browser";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { HarvestCountData, HarvestEntry, HarvestUnit } from "@/lib/types";

const API_URL = "/api/harvest-count";
const COMMON_VEGETABLES = [
  "Tomatoes",
  "Cucumbers",
  "Courgettes",
  "Peppers",
  "Carrots",
  "Lettuce",
  "Beans",
  "Peas",
  "Radishes",
  "Onions",
  "Beetroot",
  "Potatoes",
  "Kale",
  "Spinach",
  "Broccoli",
];

const EMPTY_DATA: HarvestCountData = {
  vegetables: [],
  recent: [],
};

function HarvestIcon({ name }: { name: "calendar" | "chevron" | "close" | "edit" | "plus" | "undo" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === "calendar" ? (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" />
        </>
      ) : name === "chevron" ? (
        <path d="m9 6 6 6-6 6" />
      ) : name === "close" ? (
        <path d="m7 7 10 10M17 7 7 17" />
      ) : name === "edit" ? (
        <path d="m4 16.5-.8 3.3 3.3-.8L18.7 6.8a2.3 2.3 0 0 0-3.3-3.3L3.2 15.8M14.2 5.7l4.1 4.1" />
      ) : name === "undo" ? (
        <path d="M9 7H4V2M4 7a8 8 0 1 1 2.3 10.5" />
      ) : (
        <path d="M12 5v14M5 12h14" />
      )}
    </svg>
  );
}

function formatHarvestDate(value: string) {
  if (value === deviceTodayIso()) return "Today";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deviceTodayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatAmount(value: number, unit: HarvestUnit) {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return unit === "g" ? `${formatted} g` : formatted;
}

function defaultQuantity(unit: HarvestUnit) {
  return unit === "g" ? "100" : "1";
}

function quickAddLabel(unit: HarvestUnit) {
  return unit === "g" ? "+100 g" : "+1";
}

function adjustQuantity(value: string, unit: HarvestUnit, direction: -1 | 1) {
  const current = Number(value);
  const fallback = unit === "g" ? 100 : 1;
  const step = unit === "g" ? 10 : 1;
  const minimum = unit === "g" ? 0.01 : 1;
  const next = Math.max(minimum, (Number.isFinite(current) && current > 0 ? current : fallback) + step * direction);
  return String(Number(next.toFixed(2)));
}

function UnitPicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: HarvestUnit;
  onChange: (unit: HarvestUnit) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="harvest-unit-field">
      <legend>{label}</legend>
      <div className="harvest-unit-toggle">
        {(["count", "g"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "is-active" : undefined}
            aria-pressed={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            {option === "count" ? "Count" : "Grams"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AmountPicker({
  unit,
  value,
  onChange,
  id,
}: {
  unit: HarvestUnit;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <fieldset className="harvest-amount-field">
      <legend>{unit === "g" ? "Weight" : "Amount"}</legend>
      <div className="harvest-amount-picker">
        <button
          className="harvest-amount-stepper"
          type="button"
          aria-label={`Decrease ${unit === "g" ? "grams" : "count"}`}
          onClick={() => onChange(adjustQuantity(value, unit, -1))}
        >
          −
        </button>
        <label className="harvest-custom-amount" htmlFor={id}>
          <span>Quantity</span>
          <div>
            <input
              id={id}
              type="number"
              inputMode={unit === "g" ? "decimal" : "numeric"}
              min={unit === "g" ? "0.01" : "1"}
              max="100000"
              step={unit === "g" ? "0.01" : "1"}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
            {unit === "g" ? <i>g</i> : null}
          </div>
        </label>
        <button
          className="harvest-amount-stepper"
          type="button"
          aria-label={`Increase ${unit === "g" ? "grams" : "count"}`}
          onClick={() => onChange(adjustQuantity(value, unit, 1))}
        >
          +
        </button>
      </div>
    </fieldset>
  );
}

type RecordHarvestOptions = {
  name: string;
  vegetableId?: number;
  quantity: number;
  unit: HarvestUnit;
  harvestedOn: string;
  actionKey: string;
  source: "form" | "quick" | "sheet";
};

export default function HarvestCountPage() {
  useBodyClass("harvest-count-body");

  const [data, setData] = useState<HarvestCountData>(EMPTY_DATA);
  const [vegetable, setVegetable] = useState("");
  const [selectedVegetableId, setSelectedVegetableId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<HarvestUnit>("count");
  const [harvestedOn, setHarvestedOn] = useState(deviceTodayIso());
  const [dateOpen, setDateOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sheetError, setSheetError] = useState("");
  const [quickCrop, setQuickCrop] = useState<HarvestCropView | null>(null);
  const [editingGroup, setEditingGroup] = useState<HarvestEntryGroup | null>(null);
  const [quickUnit, setQuickUnit] = useState<HarvestUnit>("count");
  const [quickQuantity, setQuickQuantity] = useState("1");
  const [quickDate, setQuickDate] = useState(deviceTodayIso());
  const [quickDateOpen, setQuickDateOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyCropId, setHistoryCropId] = useState<number | null>(null);
  const [toastEntry, setToastEntry] = useState<HarvestEntry | null>(null);
  const vegetableInputRef = useRef<HTMLInputElement>(null);
  const quickAmountRef = useRef<HTMLDivElement>(null);
  const cropTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Could not load harvests");
      setData((await response.json()) as HarvestCountData);
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load harvests");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const crops = useMemo(
    () => groupHarvestCrops(data.vegetables, data.recent),
    [data.recent, data.vegetables],
  );

  useEffect(() => {
    if (historyCropId !== null && !crops.some((crop) => crop.id === historyCropId)) {
      setHistoryCropId(null);
    }
  }, [crops, historyCropId]);

  const suggestions = useMemo(() => {
    const names = [...crops.map((crop) => crop.name), ...COMMON_VEGETABLES].filter(
      (name, index, all) =>
        all.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index,
    );
    const query = vegetable.trim().toLowerCase();
    return names.filter((name) => !query || name.toLowerCase().includes(query)).slice(0, 8);
  }, [crops, vegetable]);

  const filteredHistory = useMemo(
    () => filterHarvestEntriesByCrop(data.recent, historyCropId),
    [data.recent, historyCropId],
  );
  const groupedHistory = useMemo(() => groupHarvestEntries(filteredHistory), [filteredHistory]);
  const visibleHistory = historyExpanded ? groupedHistory : groupedHistory.slice(0, 5);

  function showSavedToast(entry: HarvestEntry) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastEntry(entry);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastEntry(null);
    }, 6500);
  }

  function closeQuickAdd(restoreFocus = true) {
    setQuickCrop(null);
    setEditingGroup(null);
    setSheetError("");
    setQuickDateOpen(false);
    if (restoreFocus) requestAnimationFrame(() => cropTriggerRef.current?.focus());
  }

  const quickSheetGesture = useBottomSheetGesture(Boolean(quickCrop), () => closeQuickAdd());
  useLockedBody(Boolean(quickCrop));

  useEffect(() => {
    if (!quickCrop) return;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && pendingAction === null) closeQuickAdd();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [pendingAction, quickCrop]);

  function openQuickAdd(crop: HarvestCropView, trigger: HTMLButtonElement) {
    cropTriggerRef.current = trigger;
    setEditingGroup(null);
    setQuickCrop(crop);
    setQuickUnit(crop.preferred_unit);
    setQuickQuantity(defaultQuantity(crop.preferred_unit));
    setQuickDate(deviceTodayIso());
    setQuickDateOpen(false);
    setSheetError("");
    triggerHaptic("tap");
    requestAnimationFrame(() => quickAmountRef.current?.focus());
  }

  function openEditHarvest(group: HarvestEntryGroup) {
    const crop = crops.find((candidate) => candidate.id === group.vegetable_id);
    if (!crop) return;
    cropTriggerRef.current = null;
    setEditingGroup(group);
    setQuickCrop(crop);
    setQuickUnit(group.unit);
    setQuickQuantity(String(group.quantity));
    setQuickDate(group.harvested_on);
    setQuickDateOpen(false);
    setSheetError("");
    triggerHaptic("tap");
    requestAnimationFrame(() => quickAmountRef.current?.focus());
  }

  function cropMatchingName(name: string) {
    const normalized = name.trim().toLowerCase();
    return crops.find((crop) => crop.name.toLowerCase() === normalized) ?? null;
  }

  function handleVegetableChange(value: string) {
    setVegetable(value);
    const matchingCrop = cropMatchingName(value);
    setSelectedVegetableId(matchingCrop?.id ?? null);
    if (matchingCrop) {
      setUnit(matchingCrop.preferred_unit);
      setQuantity(defaultQuantity(matchingCrop.preferred_unit));
    }
    setSuggestionsOpen(true);
  }

  async function recordHarvest(options: RecordHarvestOptions) {
    const cleanName = options.name.trim();
    const hasAtMostTwoDecimals =
      Math.abs(Math.round(options.quantity * 100) - options.quantity * 100) < 0.000001;
    const validAmount =
      Number.isFinite(options.quantity) &&
      options.quantity > 0 &&
      options.quantity <= 100_000 &&
      hasAtMostTwoDecimals &&
      (options.unit !== "count" || Number.isInteger(options.quantity));
    if (!cleanName || !validAmount) {
      const message =
        options.unit === "g"
          ? "Enter a vegetable and a positive weight with no more than two decimal places."
          : "Enter a vegetable and a whole number greater than zero.";
      if (options.source === "sheet") setSheetError(message);
      else setError(message);
      triggerHaptic("error");
      return;
    }

    setPendingAction(options.actionKey);
    if (options.source === "sheet") setSheetError("");
    else setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vegetable: cleanName,
          vegetable_id: options.vegetableId,
          quantity: options.quantity,
          unit: options.unit,
          harvested_on: options.harvestedOn,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not record harvest");
      }

      const entry = (await response.json()) as HarvestEntry;
      setData((current) => addHarvestEntry(current, entry));
      showSavedToast(entry);
      triggerHaptic("success");

      if (options.source === "sheet") {
        closeQuickAdd(false);
      } else if (options.source === "form") {
        setVegetable("");
        setSelectedVegetableId(null);
        setQuantity(defaultQuantity(options.unit));
        setHarvestedOn(deviceTodayIso());
        setDateOpen(false);
        setSuggestionsOpen(false);
        requestAnimationFrame(() => vegetableInputRef.current?.focus());
      }
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      const message = caught instanceof Error ? caught.message : "Could not record harvest";
      if (options.source === "sheet") setSheetError(message);
      else setError(message);
      triggerHaptic("error");
    } finally {
      setPendingAction(null);
    }
  }

  function submitHarvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void recordHarvest({
      name: vegetable,
      vegetableId: selectedVegetableId ?? undefined,
      quantity: Number(quantity),
      unit,
      harvestedOn,
      actionKey: "form",
      source: "form",
    });
  }

  function submitQuickHarvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickCrop) return;
    if (editingGroup) {
      void changeHarvest(editingGroup);
      return;
    }
    void recordHarvest({
      name: quickCrop.name,
      vegetableId: quickCrop.id,
      quantity: Number(quickQuantity),
      unit: quickUnit,
      harvestedOn: quickDate,
      actionKey: "sheet",
      source: "sheet",
    });
  }

  function addQuickHarvest(crop: HarvestCropView) {
    const quickQuantity = crop.preferred_unit === "g" ? 100 : 1;
    void recordHarvest({
      name: crop.name,
      vegetableId: crop.id,
      quantity: quickQuantity,
      unit: crop.preferred_unit,
      harvestedOn: deviceTodayIso(),
      actionKey: `quick:${crop.id}`,
      source: "quick",
    });
  }

  function selectSuggestion(name: string) {
    setVegetable(name);
    const matchingCrop = cropMatchingName(name);
    setSelectedVegetableId(matchingCrop?.id ?? null);
    if (matchingCrop) {
      setUnit(matchingCrop.preferred_unit);
      setQuantity(defaultQuantity(matchingCrop.preferred_unit));
    }
    setSuggestionsOpen(false);
    requestAnimationFrame(() => vegetableInputRef.current?.focus());
  }

  function handleVegetableKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
    } else if (event.key === "Enter" && suggestionsOpen && suggestions.length > 0) {
      event.preventDefault();
      selectSuggestion(suggestions[0]);
    }
  }

  async function undoHarvest(entryId: number) {
    setPendingAction(`undo:${entryId}`);
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/${entryId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not undo harvest");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
      setToastEntry(null);
      await loadData();
      triggerHaptic("delete");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not undo harvest");
      triggerHaptic("error");
    } finally {
      setPendingAction(null);
    }
  }

  async function undoHarvestGroup(group: HarvestEntryGroup) {
    setPendingAction(`undo-group:${group.id}`);
    setError("");
    try {
      const responses = await Promise.all(
        group.entryIds.map((entryId) => apiFetch(`${API_URL}/${entryId}`, { method: "DELETE" })),
      );
      if (responses.some((response) => !response.ok)) throw new Error("Could not undo harvest");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
      setToastEntry(null);
      await loadData();
      triggerHaptic("delete");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not undo harvest");
      triggerHaptic("error");
    } finally {
      setPendingAction(null);
    }
  }

  async function changeHarvest(group: HarvestEntryGroup) {
    const quantity = Number(quickQuantity);
    const hasAtMostTwoDecimals = Math.abs(Math.round(quantity * 100) - quantity * 100) < 0.000001;
    const validAmount =
      Number.isFinite(quantity) &&
      quantity > 0 &&
      quantity <= 100_000 &&
      hasAtMostTwoDecimals &&
      (group.unit !== "count" || Number.isInteger(quantity));
    if (!validAmount) {
      setSheetError(
        group.unit === "g"
          ? "Enter a positive weight with no more than two decimal places."
          : "Enter a whole number greater than zero.",
      );
      triggerHaptic("error");
      return;
    }

    setPendingAction(`edit:${group.id}`);
    setSheetError("");
    try {
      const response = await apiFetch(`${API_URL}/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          harvested_on: quickDate,
          remove_entry_ids: group.entryIds.filter((entryId) => entryId !== group.id),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not change harvest");
      }
      closeQuickAdd(false);
      await loadData();
      triggerHaptic("success");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setSheetError(caught instanceof Error ? caught.message : "Could not change harvest");
      triggerHaptic("error");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="harvest-count-shell">
      <div className="harvest-count-backdrop" aria-hidden="true">
        <i className="harvest-sun" />
        <i className="harvest-leaf harvest-leaf-one" />
        <i className="harvest-leaf harvest-leaf-two" />
      </div>

      <header className="harvest-count-header">
        <h1>Harvest Count</h1>
      </header>

      <section className="harvest-recorder" aria-labelledby="harvest-recorder-title">
        <div className="harvest-recorder-heading">
          <div>
            <span className="harvest-section-icon" aria-hidden="true"><HarvestIcon name="plus" /></span>
            <div>
              <h2 id="harvest-recorder-title">Add harvest</h2>
            </div>
          </div>
          <button
            className="harvest-date-trigger"
            type="button"
            aria-expanded={dateOpen}
            onClick={() => setDateOpen((current) => !current)}
          >
            <HarvestIcon name="calendar" />
            {formatHarvestDate(harvestedOn)}
          </button>
        </div>

        <form className="harvest-form" onSubmit={submitHarvest}>
          <div className="harvest-field harvest-vegetable-field">
            <label htmlFor="harvest-vegetable">Vegetable</label>
            <div className="harvest-combobox">
              <input
                id="harvest-vegetable"
                ref={vegetableInputRef}
                value={vegetable}
                onChange={(event) => handleVegetableChange(event.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                onKeyDown={handleVegetableKeyDown}
                placeholder="Start typing, e.g. tomatoes"
                autoComplete="off"
                maxLength={80}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && suggestions.length > 0}
              />
              {suggestionsOpen && suggestions.length > 0 ? (
                <div className="harvest-suggestions" role="listbox" aria-label="Vegetable suggestions">
                  {suggestions.map((name) => {
                    const symbol = harvestCropSymbol(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectSuggestion(name)}
                      >
                        <span aria-hidden="true">{symbol.glyph}</span>
                        {name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <UnitPicker
            value={unit}
            label="Unit"
            disabled={selectedVegetableId !== null}
            onChange={(nextUnit) => {
              setUnit(nextUnit);
              setQuantity(defaultQuantity(nextUnit));
            }}
          />
          <AmountPicker unit={unit} value={quantity} onChange={setQuantity} id="harvest-custom-amount" />

          {dateOpen ? (
            <label className="harvest-field harvest-date-field">
              <span>Harvest date</span>
              <input
                type="date"
                value={harvestedOn}
                onChange={(event) => setHarvestedOn(event.target.value)}
              />
            </label>
          ) : null}

          <button
            className="harvest-submit"
            type="submit"
            disabled={pendingAction !== null || !vegetable.trim()}
          >
            <HarvestIcon name="plus" />
            {pendingAction === "form" ? "Adding…" : "Add to harvest"}
          </button>
        </form>
        {error ? <p className="harvest-error" role="alert">{error}</p> : null}
      </section>

      <section className="harvest-counts-section" aria-labelledby="harvest-counts-title">
        <div className="harvest-section-heading">
          <div>
            <h2 id="harvest-counts-title">Crops</h2>
          </div>
        </div>

        {loading ? (
          <div className="harvest-count-grid harvest-count-grid-loading" aria-label="Loading crops">
            {[1, 2, 3, 4].map((item) => <i key={item} />)}
          </div>
        ) : crops.length === 0 ? (
          <div className="harvest-empty">
            <span aria-hidden="true">🌱</span>
            <strong>No crops yet.</strong>
            <p>Add a harvest above to start tracking.</p>
          </div>
        ) : (
          <div className="harvest-count-grid">
            {crops.map((crop) => (
              <div
                className={`harvest-crop-card is-${crop.symbol.tone}`}
                key={crop.id}
              >
                <button
                  className="harvest-crop-main"
                  type="button"
                  onClick={(event) => openQuickAdd(crop, event.currentTarget)}
                >
                  <span className="harvest-crop-symbol" aria-hidden="true">{crop.symbol.glyph}</span>
                  <span className="harvest-crop-copy">
                    <strong>{crop.name}</strong>
                    <span className="harvest-crop-totals">
                      {crop.totals.count > 0 ? <i>{formatCount(crop.totals.count)} items</i> : null}
                      {crop.totals.g > 0 ? <i>{formatAmount(crop.totals.g, "g")}</i> : null}
                    </span>
                  </span>
                  <span className="harvest-crop-arrow" aria-hidden="true"><HarvestIcon name="chevron" /></span>
                </button>
                <button
                  className="harvest-crop-quick-add"
                  type="button"
                  aria-label={`Add ${crop.preferred_unit === "g" ? "100 grams" : "1"} of ${crop.name}`}
                  disabled={pendingAction !== null}
                  onClick={() => addQuickHarvest(crop)}
                >
                  {quickAddLabel(crop.preferred_unit)}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="harvest-history" aria-labelledby="harvest-history-title">
        <div className="harvest-section-heading">
          <div>
            <h2 id="harvest-history-title">Recent harvests</h2>
          </div>
          <div className="harvest-history-controls">
            {crops.length > 0 ? (
              <label className="harvest-history-filter" htmlFor="harvest-history-crop">
                <span>Crop</span>
                <select
                  id="harvest-history-crop"
                  value={historyCropId ?? "all"}
                  onChange={(event) => {
                    const value = event.target.value;
                    setHistoryCropId(value === "all" ? null : Number(value));
                    setHistoryExpanded(false);
                  }}
                >
                  <option value="all">All crops</option>
                  {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}
                </select>
              </label>
            ) : null}
            {groupedHistory.length > 5 ? (
              <button
                className="harvest-history-toggle"
                type="button"
                onClick={() => setHistoryExpanded((current) => !current)}
              >
                {historyExpanded ? "Show less" : `Show all ${groupedHistory.length}`}
              </button>
            ) : null}
          </div>
        </div>
        {data.recent.length === 0 ? (
          <p className="harvest-history-empty">Your recent harvests will appear here.</p>
        ) : groupedHistory.length === 0 ? (
          <p className="harvest-history-empty">No recent harvests for this crop.</p>
        ) : (
          <ul className="harvest-history-list">
            {visibleHistory.map((group) => {
              const symbol = harvestCropSymbol(group.vegetable_name);
              return (
                <li key={group.id}>
                  <span className={`harvest-history-symbol is-${symbol.tone}`} aria-hidden="true">
                    {symbol.glyph}
                  </span>
                  <div className="harvest-history-detail">
                    <strong>{group.vegetable_name}</strong>
                    <span>{formatHarvestDate(group.harvested_on)}</span>
                  </div>
                  <div className="harvest-history-actions">
                    <strong className="harvest-history-amount">+{formatAmount(group.quantity, group.unit)}</strong>
                    <button
                      className="harvest-history-action harvest-history-undo"
                      type="button"
                      aria-label="Undo harvest"
                      title="Undo"
                      onClick={() => void undoHarvestGroup(group)}
                      disabled={pendingAction !== null}
                    >
                      <HarvestIcon name="undo" />
                    </button>
                    <button
                      className="harvest-history-action harvest-history-change"
                      type="button"
                      aria-label="Change harvest"
                      title="Change"
                      onClick={() => openEditHarvest(group)}
                      disabled={pendingAction !== null}
                    >
                      <HarvestIcon name="edit" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {quickCrop ? (
        <div
          ref={quickSheetGesture.overlayRef}
          className="harvest-sheet-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && pendingAction === null) closeQuickAdd();
          }}
        >
          <section
            ref={quickSheetGesture.sheetRef}
            className="harvest-quick-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="harvest-quick-title"
            onTouchStart={quickSheetGesture.handleTouchStart}
            onTouchMove={quickSheetGesture.handleTouchMove}
            onTouchEnd={quickSheetGesture.handleTouchEnd}
            onTouchCancel={quickSheetGesture.handleTouchEnd}
          >
            <div className="harvest-sheet-handle" data-sheet-gesture-handle><span /></div>
            <header className="harvest-sheet-header view-modal-header">
              <span className={`harvest-sheet-symbol is-${quickCrop.symbol.tone}`} aria-hidden="true">
                {quickCrop.symbol.glyph}
              </span>
              <div>
                <p>{editingGroup ? "Change harvest" : "Quick add"}</p>
                <h2 id="harvest-quick-title">{quickCrop.name}</h2>
              </div>
              <button
                type="button"
                aria-label={editingGroup ? "Close change harvest" : "Close quick add"}
                onClick={() => closeQuickAdd()}
                disabled={pendingAction !== null}
              >
                <HarvestIcon name="close" />
              </button>
            </header>
            <div className="harvest-sheet-scroll view-modal-scroll" ref={quickSheetGesture.scrollRef}>
              <form onSubmit={submitQuickHarvest}>
                <div className="harvest-fixed-unit" aria-label={`Unit: ${quickUnit === "g" ? "grams" : "count"}`}>
                  <span>Unit</span>
                  <strong>{quickUnit === "g" ? "Grams" : "Count"}</strong>
                </div>
                <div ref={quickAmountRef} tabIndex={-1}>
                  <AmountPicker
                    unit={quickUnit}
                    value={quickQuantity}
                    onChange={setQuickQuantity}
                    id="harvest-quick-custom-amount"
                  />
                </div>
                <div className="harvest-sheet-date-row">
                  <button
                    className="harvest-date-trigger"
                    type="button"
                    aria-expanded={quickDateOpen}
                    onClick={() => setQuickDateOpen((current) => !current)}
                  >
                    <HarvestIcon name="calendar" />
                    {formatHarvestDate(quickDate)}
                  </button>
                  {quickDateOpen ? (
                    <label className="harvest-field">
                      <span>Harvest date</span>
                      <input
                        type="date"
                        value={quickDate}
                        onChange={(event) => setQuickDate(event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
                {sheetError ? <p className="harvest-error" role="alert">{sheetError}</p> : null}
                <button className="harvest-submit" type="submit" disabled={pendingAction !== null}>
                  <HarvestIcon name={editingGroup ? "edit" : "plus"} />
                  {editingGroup
                    ? pendingAction === `edit:${editingGroup.id}` ? "Saving…" : "Save change"
                    : pendingAction === "sheet" ? "Adding…" : `Add ${quickCrop.name}`}
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {toastEntry ? (
        <div className="harvest-toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <p>
            <strong>Harvest added</strong>
            <span>+{formatAmount(toastEntry.quantity, toastEntry.unit)} {toastEntry.vegetable_name}</span>
          </p>
          <button
            type="button"
            onClick={() => void undoHarvest(toastEntry.id)}
            disabled={pendingAction !== null}
          >
            {pendingAction === `undo:${toastEntry.id}` ? "Undoing…" : "Undo"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
