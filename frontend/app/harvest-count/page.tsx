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
  groupHarvestCrops,
  harvestCropSymbol,
  type HarvestCropView,
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
const QUICK_AMOUNTS: Record<HarvestUnit, readonly number[]> = {
  count: [1, 5, 10, 50],
  kg: [0.5, 1, 5, 10],
};
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
  total: { count: 0, kg: 0 },
  today: { count: 0, kg: 0 },
};

function HarvestMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M9 21h30l-3 18H12L9 21Z" />
      <path d="M7 21h34M15 21v-4.5a9 9 0 0 1 18 0V21" />
      <path d="M19 11c-1.8-4.2 1-7.2 4.7-7.7-.1 3.8-1.6 6.2-4.7 7.7Z" />
      <path d="M25 11c2.7-3.8 6.4-3.5 8.8-1.3-2.9 2.5-5.7 2.3-8.8 1.3Z" />
    </svg>
  );
}

function HarvestIcon({ name }: { name: "calendar" | "chevron" | "close" | "plus" }) {
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

function formatTodayDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatAmount(value: number, unit: HarvestUnit) {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return unit === "kg" ? `${formatted} kg` : formatted;
}

function defaultQuantity(unit: HarvestUnit) {
  return unit === "kg" ? "0.5" : "1";
}

function UnitPicker({
  value,
  onChange,
  label,
}: {
  value: HarvestUnit;
  onChange: (unit: HarvestUnit) => void;
  label: string;
}) {
  return (
    <fieldset className="harvest-unit-field">
      <legend>{label}</legend>
      <div className="harvest-unit-toggle">
        {(["count", "kg"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "is-active" : undefined}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option === "count" ? "Count" : "kg"}
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
      <legend>{unit === "kg" ? "Weight" : "Amount"}</legend>
      <div className="harvest-amount-picker">
        <div className="harvest-quick-amounts">
          {QUICK_AMOUNTS[unit].map((amount) => (
            <button
              key={amount}
              type="button"
              className={value === String(amount) ? "is-active" : undefined}
              aria-pressed={value === String(amount)}
              onClick={() => onChange(String(amount))}
            >
              {unit === "kg" ? formatAmount(amount, unit) : `+${amount}`}
            </button>
          ))}
        </div>
        <label className="harvest-custom-amount" htmlFor={id}>
          <span>Custom</span>
          <div>
            <input
              id={id}
              type="number"
              inputMode={unit === "kg" ? "decimal" : "numeric"}
              min={unit === "kg" ? "0.01" : "1"}
              max="100000"
              step={unit === "kg" ? "0.01" : "1"}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
            {unit === "kg" ? <i>kg</i> : null}
          </div>
        </label>
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
  source: "form" | "sheet";
};

export default function HarvestCountPage() {
  useBodyClass("harvest-count-body");

  const [data, setData] = useState<HarvestCountData>(EMPTY_DATA);
  const [vegetable, setVegetable] = useState("");
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
  const [quickUnit, setQuickUnit] = useState<HarvestUnit>("count");
  const [quickQuantity, setQuickQuantity] = useState("1");
  const [quickDate, setQuickDate] = useState(deviceTodayIso());
  const [quickDateOpen, setQuickDateOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [toastEntry, setToastEntry] = useState<HarvestEntry | null>(null);
  const vegetableInputRef = useRef<HTMLInputElement>(null);
  const quickAmountRef = useRef<HTMLDivElement>(null);
  const cropTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}?today=${encodeURIComponent(deviceTodayIso())}`);
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

  const suggestions = useMemo(() => {
    const names = [...crops.map((crop) => crop.name), ...COMMON_VEGETABLES].filter(
      (name, index, all) =>
        all.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index,
    );
    const query = vegetable.trim().toLowerCase();
    return names.filter((name) => !query || name.toLowerCase().includes(query)).slice(0, 8);
  }, [crops, vegetable]);

  const visibleHistory = historyExpanded ? data.recent : data.recent.slice(0, 5);

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
    setSheetError("");
    setQuickDateOpen(false);
    if (restoreFocus) requestAnimationFrame(() => cropTriggerRef.current?.focus());
  }

  const quickSheetGesture = useBottomSheetGesture(Boolean(quickCrop), () => closeQuickAdd());
  useLockedBody(Boolean(quickCrop));

  useEffect(() => {
    if (!quickCrop) return;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && pendingAction !== "sheet") closeQuickAdd();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [pendingAction, quickCrop]);

  function openQuickAdd(crop: HarvestCropView, trigger: HTMLButtonElement) {
    cropTriggerRef.current = trigger;
    setQuickCrop(crop);
    setQuickUnit(crop.preferred_unit);
    setQuickQuantity(defaultQuantity(crop.preferred_unit));
    setQuickDate(deviceTodayIso());
    setQuickDateOpen(false);
    setSheetError("");
    triggerHaptic("tap");
    requestAnimationFrame(() => quickAmountRef.current?.focus());
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
      (options.unit === "kg" || Number.isInteger(options.quantity));
    if (!cleanName || !validAmount) {
      const message =
        options.unit === "kg"
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
      setData((current) => addHarvestEntry(current, entry, deviceTodayIso()));
      showSavedToast(entry);
      triggerHaptic("success");

      if (options.source === "sheet") {
        closeQuickAdd(false);
      } else {
        setVegetable("");
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

  function selectSuggestion(name: string) {
    setVegetable(name);
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

  return (
    <main className="harvest-count-shell">
      <div className="harvest-count-backdrop" aria-hidden="true">
        <i className="harvest-sun" />
        <i className="harvest-leaf harvest-leaf-one" />
        <i className="harvest-leaf harvest-leaf-two" />
      </div>

      <header className="harvest-count-header">
        <div>
          <p className="harvest-count-kicker">Garden basket</p>
          <h1>Harvest Count</h1>
          <p>Record what you picked while it is still in your hands.</p>
        </div>
        <span className="harvest-count-mark"><HarvestMark /></span>
      </header>

      <section className="harvest-recorder" aria-labelledby="harvest-recorder-title">
        <div className="harvest-recorder-heading">
          <div>
            <span className="harvest-section-icon" aria-hidden="true"><HarvestIcon name="plus" /></span>
            <div>
              <p className="harvest-section-kicker">Add harvest</p>
              <h2 id="harvest-recorder-title">What did you pick?</h2>
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
                onChange={(event) => {
                  setVegetable(event.target.value);
                  setSuggestionsOpen(true);
                }}
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

      <section className="harvest-today" aria-label="Today's harvest">
        <div className="harvest-today-label">
          <span>Today</span>
          <strong>{formatTodayDate()}</strong>
        </div>
        <div><strong>{formatCount(data.today.count)}</strong><span>items</span></div>
        <div><strong>{formatAmount(data.today.kg, "kg")}</strong><span>weight</span></div>
        <div><strong>{crops.length}</strong><span>crops</span></div>
      </section>

      <section className="harvest-counts-section" aria-labelledby="harvest-counts-title">
        <div className="harvest-section-heading">
          <div>
            <p className="harvest-section-kicker">Quick add</p>
            <h2 id="harvest-counts-title">Your crops</h2>
            <span>Tap a crop to record another harvest.</span>
          </div>
          <div className="harvest-season-totals" aria-label="Season totals">
            <span><strong>{formatCount(data.total.count)}</strong> items</span>
            <span><strong>{formatAmount(data.total.kg, "kg")}</strong> total</span>
          </div>
        </div>

        {loading ? (
          <div className="harvest-count-grid harvest-count-grid-loading" aria-label="Loading crops">
            {[1, 2, 3, 4].map((item) => <i key={item} />)}
          </div>
        ) : crops.length === 0 ? (
          <div className="harvest-empty">
            <span aria-hidden="true">🌱</span>
            <strong>Your garden is ready.</strong>
            <p>Add the first harvest above and its crop tile will appear here.</p>
          </div>
        ) : (
          <div className="harvest-count-grid">
            {crops.map((crop) => (
              <button
                className={`harvest-crop-card is-${crop.symbol.tone}`}
                key={crop.id}
                type="button"
                onClick={(event) => openQuickAdd(crop, event.currentTarget)}
              >
                <span className="harvest-crop-symbol" aria-hidden="true">{crop.symbol.glyph}</span>
                <span className="harvest-crop-copy">
                  <strong>{crop.name}</strong>
                  <span className="harvest-crop-totals">
                    {crop.totals.count > 0 ? <i>{formatCount(crop.totals.count)} items</i> : null}
                    {crop.totals.kg > 0 ? <i>{formatAmount(crop.totals.kg, "kg")}</i> : null}
                  </span>
                </span>
                <span className="harvest-crop-arrow" aria-hidden="true"><HarvestIcon name="chevron" /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="harvest-history" aria-labelledby="harvest-history-title">
        <div className="harvest-section-heading">
          <div>
            <p className="harvest-section-kicker">Garden log</p>
            <h2 id="harvest-history-title">Recent harvests</h2>
          </div>
          {data.recent.length > 5 ? (
            <button
              className="harvest-history-toggle"
              type="button"
              onClick={() => setHistoryExpanded((current) => !current)}
            >
              {historyExpanded ? "Show less" : `Show all ${data.recent.length}`}
            </button>
          ) : null}
        </div>
        {data.recent.length === 0 ? (
          <p className="harvest-history-empty">Your recent harvests will appear here.</p>
        ) : (
          <ul className="harvest-history-list">
            {visibleHistory.map((entry) => {
              const symbol = harvestCropSymbol(entry.vegetable_name);
              return (
                <li key={entry.id}>
                  <span className={`harvest-history-symbol is-${symbol.tone}`} aria-hidden="true">
                    {symbol.glyph}
                  </span>
                  <div>
                    <strong>{entry.vegetable_name}</strong>
                    <span>{formatHarvestDate(entry.harvested_on)}</span>
                  </div>
                  <strong className="harvest-history-amount">+{formatAmount(entry.quantity, entry.unit)}</strong>
                  <button
                    type="button"
                    onClick={() => void undoHarvest(entry.id)}
                    disabled={pendingAction !== null}
                  >
                    {pendingAction === `undo:${entry.id}` ? "…" : "Undo"}
                  </button>
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
            if (event.target === event.currentTarget && pendingAction !== "sheet") closeQuickAdd();
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
                <p>Quick add</p>
                <h2 id="harvest-quick-title">{quickCrop.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Close quick add"
                onClick={() => closeQuickAdd()}
                disabled={pendingAction === "sheet"}
              >
                <HarvestIcon name="close" />
              </button>
            </header>
            <div className="harvest-sheet-scroll view-modal-scroll" ref={quickSheetGesture.scrollRef}>
              <form onSubmit={submitQuickHarvest}>
                <UnitPicker
                  value={quickUnit}
                  label="Record as"
                  onChange={(nextUnit) => {
                    setQuickUnit(nextUnit);
                    setQuickQuantity(defaultQuantity(nextUnit));
                  }}
                />
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
                  <HarvestIcon name="plus" />
                  {pendingAction === "sheet" ? "Adding…" : `Add ${quickCrop.name}`}
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
