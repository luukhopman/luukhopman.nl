"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { todayIso } from "@/lib/format";
import { useBodyClass } from "@/lib/browser";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { HarvestCountData, HarvestUnit } from "@/lib/types";

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

function formatHarvestDate(value: string) {
  if (value === todayIso()) return "Today";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatAmount(value: number, unit: HarvestUnit) {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return unit === "kg" ? `${formatted} kg` : formatted;
}

export default function HarvestCountPage() {
  useBodyClass("harvest-count-body");

  const [data, setData] = useState<HarvestCountData>(EMPTY_DATA);
  const [vegetable, setVegetable] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<HarvestUnit>("count");
  const [harvestedOn, setHarvestedOn] = useState(todayIso());
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const vegetableInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}?today=${encodeURIComponent(todayIso())}`);
      if (!response.ok) throw new Error("Could not load harvest counts");
      setData((await response.json()) as HarvestCountData);
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load harvest counts");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const suggestions = useMemo(() => {
    const existing = data.vegetables.map((entry) => entry.name);
    const names = [...existing, ...COMMON_VEGETABLES].filter(
      (name, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index,
    );
    const query = vegetable.trim().toLowerCase();
    return names.filter((name) => !query || name.toLowerCase().includes(query)).slice(0, 8);
  }, [data.vegetables, vegetable]);

  async function recordHarvest(name: string, amount: number, amountUnit: HarvestUnit, actionKey: string) {
    const cleanName = name.trim();
    const validAmount =
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= 100_000 &&
      Math.abs(Math.round(amount * 100) - amount * 100) < 0.000001 &&
      (amountUnit === "kg" || Number.isInteger(amount));
    if (!cleanName || !validAmount) {
      setError(amountUnit === "kg" ? "Enter a vegetable and a positive kg amount." : "Enter a vegetable and a whole number greater than zero.");
      return;
    }

    setPendingAction(actionKey);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vegetable: cleanName, quantity: amount, unit: amountUnit, harvested_on: harvestedOn }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not record harvest");
      }
      await loadData();
      setVegetable(cleanName);
      setQuantity("1");
      setSuggestionsOpen(false);
      setStatus(`Recorded +${formatAmount(amount, amountUnit)} ${cleanName}.`);
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not record harvest");
    } finally {
      setPendingAction(null);
    }
  }

  function submitHarvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quantity);
    void recordHarvest(vegetable, amount, unit, "form");
  }

  function changeUnit(nextUnit: HarvestUnit) {
    setUnit(nextUnit);
    setQuantity("1");
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
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/${entryId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not undo harvest");
      await loadData();
      setStatus("Harvest entry removed.");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/harvest-count");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not undo harvest");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="harvest-count-shell">
      <div className="harvest-count-backdrop" aria-hidden="true" />
      <header className="harvest-count-header">
        <div className="harvest-count-title">
          <span className="harvest-count-mark"><HarvestMark /></span>
          <div>
            <p className="harvest-count-kicker">Garden log</p>
            <h1>Harvest Count</h1>
            <p className="harvest-count-intro">A quick tally of what comes out of the garden.</p>
          </div>
        </div>
        <div className="harvest-count-stats" aria-label="Harvest summary">
          <div><strong>{formatCount(data.today.count)}</strong><span>today · count</span></div>
          <div><strong>{formatAmount(data.today.kg, "kg")}</strong><span>today · weight</span></div>
          <div><strong>{formatCount(data.total.count)}</strong><span>all time · count</span></div>
          <div><strong>{formatAmount(data.total.kg, "kg")}</strong><span>all time · weight</span></div>
          <div><strong>{new Set(data.vegetables.map((crop) => crop.id)).size}</strong><span>crops</span></div>
        </div>
      </header>

      <section className="harvest-recorder" aria-labelledby="harvest-recorder-title">
        <div className="harvest-section-heading">
          <div>
            <p className="harvest-section-kicker">Add to the tally</p>
            <h2 id="harvest-recorder-title">Record a harvest</h2>
          </div>
          <span className="harvest-date-note">{formatHarvestDate(harvestedOn)}</span>
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
                placeholder="Tomatoes"
                autoComplete="off"
                maxLength={80}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && suggestions.length > 0}
              />
              {suggestionsOpen && suggestions.length > 0 ? (
                <div className="harvest-suggestions" role="listbox" aria-label="Vegetable suggestions">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <fieldset className="harvest-unit-field">
            <legend>Unit</legend>
            <div className="harvest-unit-toggle" role="group" aria-label="Harvest unit">
              {(["count", "kg"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={unit === option ? "is-active" : undefined}
                  aria-pressed={unit === option}
                  onClick={() => changeUnit(option)}
                >
                  {option === "count" ? "Count" : "kg"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="harvest-amount-field">
            <legend>{unit === "kg" ? "How much?" : "How many?"}</legend>
            <div className="harvest-quick-amounts">
              {QUICK_AMOUNTS[unit].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={quantity === String(amount) ? "is-active" : undefined}
                  onClick={() => setQuantity(String(amount))}
                >
                  +{amount}
                </button>
              ))}
              <input
                type="number"
                min={unit === "kg" ? "0.01" : "1"}
                max="100000"
                step={unit === "kg" ? "0.01" : "1"}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                aria-label={unit === "kg" ? "Custom harvest weight in kilograms" : "Custom harvest quantity"}
              />
            </div>
          </fieldset>

          <label className="harvest-field harvest-date-field">
            <span>Date</span>
            <input type="date" value={harvestedOn} onChange={(event) => setHarvestedOn(event.target.value)} />
          </label>

          <button className="harvest-submit" type="submit" disabled={pendingAction !== null || !vegetable.trim()}>
            {pendingAction === "form" ? "Saving…" : "Record harvest"}
          </button>
        </form>
      </section>

      {status ? <p className="harvest-status" role="status">{status}</p> : null}
      {error ? <p className="harvest-error" role="alert">{error}</p> : null}

      <section className="harvest-counts-section" aria-labelledby="harvest-counts-title">
        <div className="harvest-section-heading">
          <div>
            <p className="harvest-section-kicker">What’s coming in</p>
            <h2 id="harvest-counts-title">Crop totals</h2>
          </div>
          <span className="harvest-section-note">Tap a button for a quick count</span>
        </div>
        {loading ? (
          <div className="harvest-count-grid harvest-count-grid-loading" aria-label="Loading harvest counts">
            {[1, 2, 3].map((item) => <i key={item} />)}
          </div>
        ) : data.vegetables.length === 0 ? (
          <div className="harvest-empty">
            <span className="harvest-empty-icon" aria-hidden="true">✦</span>
            <strong>Your harvest tally is ready.</strong>
            <span>Add your first vegetable above.</span>
          </div>
        ) : (
          <div className="harvest-count-grid">
            {data.vegetables.map((crop) => (
              <article className="harvest-crop-card" key={`${crop.id}-${crop.unit}`}>
                <div className="harvest-crop-card-top">
                  <div>
                    <h3>{crop.name}</h3>
                    <span>{formatAmount(crop.total, crop.unit)} harvested</span>
                  </div>
                  <strong className="harvest-crop-total">{formatAmount(crop.total, crop.unit)}</strong>
                </div>
                <div className="harvest-crop-actions">
                  {QUICK_AMOUNTS[crop.unit].filter((amount) => amount !== 10).map((amount) => {
                    const actionKey = `crop:${crop.id}:${crop.unit}:${amount}`;
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => void recordHarvest(crop.name, amount, crop.unit, actionKey)}
                        disabled={pendingAction !== null}
                      >
                        {pendingAction === actionKey ? "…" : `+${formatAmount(amount, crop.unit)}`}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="harvest-history" aria-labelledby="harvest-history-title">
        <div className="harvest-section-heading">
          <div>
            <p className="harvest-section-kicker">Keep the record tidy</p>
            <h2 id="harvest-history-title">Recent harvests</h2>
          </div>
          <span className="harvest-section-note">Undo mistakes anytime</span>
        </div>
        {data.recent.length === 0 ? (
          <p className="harvest-history-empty">Your individual harvest entries will appear here.</p>
        ) : (
          <ul className="harvest-history-list">
            {data.recent.map((entry) => (
              <li key={entry.id}>
                <span className="harvest-history-dot" aria-hidden="true" />
                <div>
                  <strong>+{formatAmount(entry.quantity, entry.unit)} {entry.vegetable_name}</strong>
                  <span>{formatHarvestDate(entry.harvested_on)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void undoHarvest(entry.id)}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === `undo:${entry.id}` ? "…" : "Undo"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
