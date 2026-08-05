"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { buildEnergyIntervals, buildEnergySummary } from "@/lib/energy";
import { formatDate, todayIso } from "@/lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import { useBodyClass } from "@/lib/browser";
import type { EnergyData, EnergyPrices } from "@/lib/types";

const API_URL = "/api/energy";
const DEFAULT_PRICES: EnergyPrices = {
  fixed_monthly_cost: 10.9,
  variable_cost_per_kwh: 0.349,
  currency: "EUR",
  updated_at: "",
};

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

function displayDate(value: string) {
  return formatDate(value);
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
  const [savingPrices, setSavingPrices] = useState(false);
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
  const intervals = useMemo(
    () => (data ? buildEnergyIntervals(data.readings, data.prices) : []),
    [data],
  );
  const summary = useMemo(
    () => buildEnergySummary(data?.readings ?? [], prices),
    [data?.readings, prices],
  );
  const displayIntervals = useMemo(() => [...intervals].reverse(), [intervals]);

  async function saveReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingReading || !meterReading.trim()) return;

    setSavingReading(true);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reading_date: readingDate,
          meter_kwh: Number(meterReading),
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
        <div>
          <p className="energy-eyebrow">Household energy</p>
          <h1>Energy</h1>
          <p>Record the meter and keep an eye on the running cost.</p>
        </div>
        {summary.latestReading ? (
          <div className="energy-latest-chip">
            <span>Latest meter</span>
            <strong>{formatNumber(summary.latestReading.meter_kwh)} kWh</strong>
            <small>{displayDate(summary.latestReading.reading_date)}</small>
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
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={meterReading}
                onChange={(event) => setMeterReading(event.target.value)}
                placeholder="e.g. 111250"
                required
              />
              <i>kWh</i>
            </div>
          </label>
          <button type="submit" disabled={savingReading || !meterReading.trim()}>
            {savingReading ? "Saving…" : "Save reading"}
          </button>
        </form>
        <p className="energy-form-note">If you enter the same date again, its reading is updated.</p>
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
          {summary.firstReading && summary.latestReading ? (
            <span className="energy-period">
              {displayDate(summary.firstReading.reading_date)} – {displayDate(summary.latestReading.reading_date)}
            </span>
          ) : null}
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

      <section className="energy-prices" aria-labelledby="energy-prices-title">
        <div className="energy-section-heading">
          <div>
            <p className="energy-section-kicker">Price settings</p>
            <h2 id="energy-prices-title">Current prices</h2>
          </div>
        </div>
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
      </section>

      <section className="energy-history" aria-labelledby="energy-history-title">
        <div className="energy-section-heading">
          <div>
            <p className="energy-section-kicker">Meter history</p>
            <h2 id="energy-history-title">Readings and usage</h2>
          </div>
          <span className="energy-reading-count">{data?.readings.length ?? 0} readings</span>
        </div>
        {loading ? (
          <div className="energy-loading" aria-label="Loading energy history"><span /><span /><span /></div>
        ) : displayIntervals.length ? (
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
                </tr>
              </thead>
              <tbody>
                {displayIntervals.map((interval) => (
                  <tr key={interval.reading.id}>
                    <td>{displayDate(interval.reading.reading_date)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.reading.meter_kwh)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.useKwh)}</td>
                    <td className="energy-number-cell">{interval.days ?? "—"}</td>
                    <td className="energy-number-cell">{formatNumber(interval.usePerDay)}</td>
                    <td className="energy-number-cell">{formatNumber(interval.annualisedUse)}</td>
                    <td className="energy-money-cell">{formatMoney(interval.estimatedDailyCost, prices.currency)}</td>
                    <td className="energy-money-cell">{formatMoney(interval.estimatedMonthlyCost, prices.currency)}</td>
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
    </main>
  );
}
