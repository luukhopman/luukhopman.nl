"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { buildEnergyIntervals, buildEnergySummary, daysBetween } from "@/lib/energy";
import { formatDate, todayIso } from "@/lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import { useBodyClass } from "@/lib/browser";
import type { EnergyData, EnergyPrices, EnergyReading } from "@/lib/types";

const API_URL = "/api/energy";
const DEFAULT_PRICES: EnergyPrices = {
  fixed_monthly_cost: 10.9,
  variable_cost_per_kwh: 0.349,
  currency: "EUR",
  updated_at: "",
};

type HistoryRange = "all" | "year" | "90d";

function formatNumber(value: number | null, maximumFractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

function formatMoney(value: number | null, currency = "EUR", maximumFractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function formatRate(value: number, currency = "EUR") {
  return `${formatMoney(value, currency, 4)} / kWh`;
}

function decimalSeparator() {
  return new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
}

function parseMeterReading(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayDate(value: string) {
  return formatDate(value);
}

function rangeLabel(range: HistoryRange) {
  return range === "all" ? "All readings" : range === "year" ? "Last year" : "Last 90 days";
}

function EnergyRangePicker({
  value,
  onChange,
}: {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  return (
    <div className="energy-history-filters" role="group" aria-label="Consumption range">
      {(["all", "year", "90d"] as HistoryRange[]).map((range) => (
        <button
          key={range}
          type="button"
          className={value === range ? "is-active" : undefined}
          aria-pressed={value === range}
          onClick={() => onChange(range)}
        >
          {range === "all" ? "All" : range === "year" ? "Last year" : "Last 90 days"}
        </button>
      ))}
    </div>
  );
}

export default function EnergyPage() {
  useBodyClass("energy-body");

  const [data, setData] = useState<EnergyData | null>(null);
  const [readingDate, setReadingDate] = useState(todayIso());
  const [meterReading, setMeterReading] = useState("");
  const [fixedMonthlyCost, setFixedMonthlyCost] = useState(String(DEFAULT_PRICES.fixed_monthly_cost));
  const [variableCostPerKwh, setVariableCostPerKwh] = useState(
    String(DEFAULT_PRICES.variable_cost_per_kwh),
  );
  const [loading, setLoading] = useState(true);
  const [savingReading, setSavingReading] = useState(false);
  const [deletingReadingId, setDeletingReadingId] = useState<number | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceSettingsOpen, setPriceSettingsOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Could not load energy data");
      const nextData = (await response.json()) as EnergyData;
      setData(nextData);
      setFixedMonthlyCost(String(nextData.prices.fixed_monthly_cost));
      setVariableCostPerKwh(String(nextData.prices.variable_cost_per_kwh));
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/energy");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load energy data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const prices = data?.prices ?? DEFAULT_PRICES;
  const allReadings = data?.readings ?? [];
  const intervals = useMemo(
    () => (data ? buildEnergyIntervals(data.readings, data.prices) : []),
    [data],
  );
  const overallSummary = useMemo(
    () => buildEnergySummary(allReadings, prices),
    [allReadings, prices],
  );
  const visibleReadings = useMemo(() => {
    if (historyRange === "all" || !overallSummary.latestReading) return allReadings;
    const maxAge = historyRange === "year" ? 365 : 90;
    return allReadings.filter((reading) =>
      daysBetween(reading.reading_date, overallSummary.latestReading?.reading_date ?? "") <= maxAge,
    );
  }, [allReadings, historyRange, overallSummary.latestReading]);
  const summary = useMemo(
    () => buildEnergySummary(visibleReadings, prices),
    [prices, visibleReadings],
  );
  const displayIntervals = useMemo(() => [...intervals].reverse(), [intervals]);
  const visibleIntervals = useMemo(() => {
    if (historyRange === "all" || !overallSummary.latestReading) return displayIntervals;
    const maxAge = historyRange === "year" ? 365 : 90;
    return displayIntervals.filter((interval) =>
      daysBetween(interval.reading.reading_date, overallSummary.latestReading?.reading_date ?? "") <= maxAge,
    );
  }, [displayIntervals, historyRange, overallSummary.latestReading]);

  async function saveReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingReading || !meterReading.trim()) return;

    const parsedMeterReading = parseMeterReading(meterReading);
    if (parsedMeterReading === null) {
      setError("Enter a valid kWh reading with no more than two decimal places.");
      return;
    }

    setSavingReading(true);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reading_date: readingDate,
          meter_kwh: parsedMeterReading,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Could not save meter reading");
      }
      await loadData();
      setStatus(`Saved meter reading for ${displayDate(readingDate)}.`);
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/energy");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not save meter reading");
    } finally {
      setSavingReading(false);
    }
  }

  async function deleteReading(reading: EnergyReading) {
    if (deletingReadingId !== null) return;
    if (!window.confirm(`Remove the meter reading for ${displayDate(reading.reading_date)}?`)) return;

    setDeletingReadingId(reading.id);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/${reading.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Could not remove meter reading");
      }
      await loadData();
      setStatus(`Removed meter reading for ${displayDate(reading.reading_date)}.`);
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/energy");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not remove meter reading");
    } finally {
      setDeletingReadingId(null);
    }
  }

  async function savePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPrices) return;

    setSavingPrices(true);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/prices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixed_monthly_cost: Number(fixedMonthlyCost),
          variable_cost_per_kwh: Number(variableCostPerKwh),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Could not save energy prices");
      }
      const nextPrices = (await response.json()) as EnergyPrices;
      setData((current) => (current ? { ...current, prices: nextPrices } : current));
      setStatus("Saved current energy prices.");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/energy");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not save energy prices");
    } finally {
      setSavingPrices(false);
    }
  }

  return (
    <main className="energy-shell">
      <header className="energy-header">
        <h1>Energy</h1>
        {overallSummary.latestReading ? (
          <div className="energy-latest-chip">
            <span>Latest reading</span>
            <strong>{formatNumber(overallSummary.latestReading.meter_kwh)} kWh</strong>
            <small>{displayDate(overallSummary.latestReading.reading_date)}</small>
          </div>
        ) : null}
      </header>

      <section className="energy-recorder" aria-labelledby="record-energy-title">
        <div className="energy-section-heading">
          <div>
            <p className="energy-section-kicker">New reading</p>
            <h2 id="record-energy-title">Record meter reading</h2>
          </div>
          <span className="energy-meter-icon" aria-hidden="true">kWh</span>
        </div>
        <form className="energy-reading-form" onSubmit={saveReading}>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={readingDate}
              onChange={(event) => setReadingDate(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Meter reading</span>
            <div className="energy-input-with-unit">
              <input
                type="text"
                inputMode="decimal"
                value={meterReading}
                onChange={(event) => setMeterReading(event.target.value)}
                placeholder={`e.g. 111250${decimalSeparator()}50`}
                aria-describedby="energy-reading-note"
                required
              />
              <i>kWh</i>
            </div>
          </label>
          <button type="submit" disabled={savingReading || !meterReading.trim()}>
            {savingReading ? "Saving…" : "Save reading"}
          </button>
        </form>
        <p className="energy-form-note" id="energy-reading-note">
          Use a decimal separator if needed. Entering the same date again updates its reading.
        </p>
      </section>

      {error ? (
        <div className="energy-message is-error" role="alert">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="energy-message is-success" role="status">
          {status}
        </div>
      ) : null}

      <section className="energy-summary" aria-labelledby="energy-summary-title">
        <div className="energy-section-heading">
          <div>
            <p className="energy-section-kicker">Overview</p>
            <h2 id="energy-summary-title">Consumption overall</h2>
          </div>
        </div>
        <div className="energy-summary-toolbar">
          {summary.firstReading && summary.latestReading ? (
            <span className="energy-period">
              {rangeLabel(historyRange)} · {displayDate(summary.firstReading.reading_date)} – {displayDate(summary.latestReading.reading_date)}
            </span>
          ) : <span className="energy-period">Choose a range when readings are available</span>}
          <EnergyRangePicker value={historyRange} onChange={setHistoryRange} />
        </div>
        <div className="energy-summary-grid">
          <article className="energy-summary-card is-main">
            <span>Average use per day</span>
            <strong>{formatNumber(summary.averageUsePerDay)} <i>kWh</i></strong>
          </article>
          <article className="energy-summary-card">
            <span>Average annualised use</span>
            <strong>{formatNumber(summary.averageAnnualisedUse)} <i>kWh</i></strong>
          </article>
          <article className="energy-summary-card">
            <span>Fixed monthly cost</span>
            <strong>{formatMoney(prices.fixed_monthly_cost, prices.currency)}</strong>
          </article>
          <article className="energy-summary-card">
            <span>Variable cost</span>
            <strong>{formatRate(prices.variable_cost_per_kwh, prices.currency)}</strong>
          </article>
          <article className="energy-summary-card is-cost">
            <span>Estimated monthly total</span>
            <strong>{formatMoney(summary.estimatedMonthlyCost, prices.currency)}</strong>
            <small>including fixed cost</small>
          </article>
        </div>
      </section>

      <section className="energy-history" aria-labelledby="energy-history-title">
        <div className="energy-section-heading">
          <div>
            <p className="energy-section-kicker">Meter history</p>
            <h2 id="energy-history-title">Readings and usage</h2>
          </div>
        </div>
        <div className="energy-history-toolbar">
          <span className="energy-reading-count">
            {visibleIntervals.length} of {data?.readings.length ?? 0} readings · newest first
          </span>
          <span className="energy-history-range-label">{rangeLabel(historyRange)}</span>
        </div>
        {loading ? (
          <div className="energy-loading" aria-label="Loading energy history"><span /><span /><span /></div>
        ) : visibleIntervals.length ? (
          <div className="energy-history-table-wrap">
            <table className="energy-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meter (kWh)</th>
                  <th>Use (kWh)</th>
                  <th>Days</th>
                  <th>Use per day</th>
                  <th>Annualised use</th>
                  <th>Daily cost</th>
                  <th>Monthly costs</th>
                  <th className="energy-history-action-heading" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleIntervals.map((interval) => (
                  <tr key={interval.reading.id}>
                    <td>{displayDate(interval.reading.reading_date)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.reading.meter_kwh)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.useKwh)}</td>
                    <td className="energy-number-cell">{interval.days ?? "—"}</td>
                    <td className="energy-number-cell">{formatNumber(interval.usePerDay)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.annualisedUse)}</td>
                    <td className="energy-money-cell">{formatMoney(interval.estimatedDailyCost, prices.currency)}</td>
                    <td className="energy-money-cell">{formatMoney(interval.estimatedMonthlyCost, prices.currency)}</td>
                    <td className="energy-history-action-cell">
                      <button
                        type="button"
                        className="energy-history-delete"
                        aria-label={`Remove meter reading for ${displayDate(interval.reading.reading_date)}`}
                        title="Remove reading"
                        onClick={() => void deleteReading(interval.reading)}
                        disabled={deletingReadingId !== null}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M5 7h14M9 7V5.5h6V7m-8.5 0 .8 12h9.4l.8-12M10 10.5v5.5M14 10.5v5.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="energy-empty">No meter readings yet.</p>
        )}
        <p className="energy-history-note">
          Usage and costs are calculated from the previous reading. Monthly row estimates cover variable consumption only; fixed cost is shown above.
        </p>
      </section>

      <section className={`energy-prices${priceSettingsOpen ? " is-open" : ""}`} aria-labelledby="energy-prices-title">
        <div className="energy-price-collapsed">
          <div>
            <p className="energy-section-kicker">Settings</p>
            <h2 id="energy-prices-title">Current prices</h2>
            <p>
              {formatRate(prices.variable_cost_per_kwh, prices.currency)} · {formatMoney(prices.fixed_monthly_cost, prices.currency)} / month fixed
            </p>
          </div>
          <button type="button" onClick={() => setPriceSettingsOpen((current) => !current)}>
            {priceSettingsOpen ? "Close" : "Change prices"}
          </button>
        </div>
        {priceSettingsOpen ? (
          <div className="energy-price-editor">
            <form className="energy-price-form" onSubmit={savePrices}>
              <label>
                <span>Fixed monthly cost</span>
                <div className="energy-input-with-unit">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={fixedMonthlyCost}
                    onChange={(event) => setFixedMonthlyCost(event.target.value)}
                  />
                  <i>€ / month</i>
                </div>
              </label>
              <label>
                <span>Variable cost</span>
                <div className="energy-input-with-unit">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.0001"
                    value={variableCostPerKwh}
                    onChange={(event) => setVariableCostPerKwh(event.target.value)}
                  />
                  <i>€ / kWh</i>
                </div>
              </label>
              <button type="submit" disabled={savingPrices}>
                {savingPrices ? "Saving…" : "Save prices"}
              </button>
            </form>
            <div className="energy-price-table-wrap">
              <table className="energy-price-table">
                <thead>
                  <tr><th>Charge</th><th>Current price</th><th>Used for</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Energy use</td>
                    <td>{formatRate(prices.variable_cost_per_kwh, prices.currency)}</td>
                    <td>Daily and monthly consumption estimates</td>
                  </tr>
                  <tr>
                    <td>Fixed supply cost</td>
                    <td>{formatMoney(prices.fixed_monthly_cost, prices.currency)} / month</td>
                    <td>Added to the estimated monthly total</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
