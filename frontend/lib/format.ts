export function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function normalizeRecipeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("www.")) return `https://${value}`;
  if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
  return value;
}

export function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateFieldValue(value: string | null | undefined): string {
  const normalized = normalizeDueDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

export function formatTime(value: string): string {
  return new Date(`1970-01-01T${value}:00`).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDueDate(value: string | null | undefined): string | null {
  const text = `${value ?? ""}`.trim();
  if (!text) return null;

  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return text;
}

export function normalizeDueTime(value: string | null | undefined): string | null {
  const text = `${value ?? ""}`.trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
}

export function parseDateFieldValue(value: string | null | undefined): string | null {
  const text = `${value ?? ""}`.trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return normalizeDueDate(text);
  }

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const isoValue = `${`${year}`.padStart(4, "0")}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  return normalizeDueDate(isoValue);
}

export function dayDifference(targetDate: string, referenceDate: string): number {
  const target = new Date(`${targetDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  return Math.round((target.getTime() - reference.getTime()) / 86400000);
}
