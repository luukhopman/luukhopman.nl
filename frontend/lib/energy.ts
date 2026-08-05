import type { EnergyPrices, EnergyReading } from "./types";

export const DAYS_PER_YEAR = 365;
export const MONTHS_PER_YEAR = 12;

export type EnergyInterval = {
  reading: EnergyReading;
  previousReading: EnergyReading | null;
  days: number | null;
  useKwh: number | null;
  usePerDay: number | null;
  annualisedUse: number | null;
  estimatedDailyCost: number | null;
  estimatedMonthlyCost: number | null;
};

export type EnergySummary = {
  averageUsePerDay: number | null;
  averageAnnualisedUse: number | null;
  variableMonthlyCost: number | null;
  estimatedMonthlyCost: number | null;
  firstReading: EnergyReading | null;
  latestReading: EnergyReading | null;
  totalUseKwh: number | null;
  totalDays: number | null;
};

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function daysBetween(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

export function buildEnergyIntervals(
  readings: EnergyReading[],
  prices: EnergyPrices,
): EnergyInterval[] {
  const chronological = [...readings].sort((a, b) => {
    const dateOrder = a.reading_date.localeCompare(b.reading_date);
    return dateOrder || a.id - b.id;
  });

  return chronological.map((reading, index) => {
    const previousReading = chronological[index - 1] ?? null;
    if (!previousReading) {
      return {
        reading,
        previousReading: null,
        days: null,
        useKwh: null,
        usePerDay: null,
        annualisedUse: null,
        estimatedDailyCost: null,
        estimatedMonthlyCost: null,
      };
    }

    const days = daysBetween(previousReading.reading_date, reading.reading_date);
    const useKwh = reading.meter_kwh - previousReading.meter_kwh;
    const usePerDay = days > 0 && useKwh >= 0 ? useKwh / days : null;
    const annualisedUse = usePerDay === null ? null : usePerDay * DAYS_PER_YEAR;
    const estimatedDailyCost =
      usePerDay === null ? null : usePerDay * prices.variable_cost_per_kwh;
    const estimatedMonthlyCost =
      estimatedDailyCost === null
        ? null
        : estimatedDailyCost * (DAYS_PER_YEAR / MONTHS_PER_YEAR);

    return {
      reading,
      previousReading,
      days,
      useKwh,
      usePerDay,
      annualisedUse,
      estimatedDailyCost,
      estimatedMonthlyCost,
    };
  });
}

export function buildEnergySummary(
  readings: EnergyReading[],
  prices: EnergyPrices,
): EnergySummary {
  const chronological = [...readings].sort((a, b) => {
    const dateOrder = a.reading_date.localeCompare(b.reading_date);
    return dateOrder || a.id - b.id;
  });
  const firstReading = chronological[0] ?? null;
  const latestReading = chronological[chronological.length - 1] ?? null;
  const totalDays =
    firstReading && latestReading
      ? daysBetween(firstReading.reading_date, latestReading.reading_date)
      : null;
  const totalUseKwh =
    firstReading && latestReading ? latestReading.meter_kwh - firstReading.meter_kwh : null;
  const averageUsePerDay =
    totalDays !== null && totalDays > 0 && totalUseKwh !== null && totalUseKwh >= 0
      ? totalUseKwh / totalDays
      : null;
  const averageAnnualisedUse =
    averageUsePerDay === null ? null : averageUsePerDay * DAYS_PER_YEAR;
  const variableMonthlyCost =
    averageUsePerDay === null
      ? null
      : averageUsePerDay * prices.variable_cost_per_kwh * (DAYS_PER_YEAR / MONTHS_PER_YEAR);
  const estimatedMonthlyCost =
    variableMonthlyCost === null ? null : variableMonthlyCost + prices.fixed_monthly_cost;

  return {
    averageUsePerDay,
    averageAnnualisedUse,
    variableMonthlyCost,
    estimatedMonthlyCost,
    firstReading,
    latestReading,
    totalUseKwh,
    totalDays,
  };
}
