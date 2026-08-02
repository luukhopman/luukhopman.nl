import { normalizeDueDate, normalizeDueTime } from "./format";
import type { Todo } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type NativeTodoReminder = {
  id: number;
  title: string;
  triggerAtMs: number;
  dueAtMs: number;
};

export type HouseholdAndroidBridge = {
  todoNotificationsEnabled: () => boolean;
  requestTodoNotifications: () => void;
  syncTodoReminders: (payload: string) => void;
};

declare global {
  interface Window {
    HouseholdAndroid?: HouseholdAndroidBridge;
  }
}

export function getTodoReminderLeadMinutes(dueAtMs: number, nowMs: number): number {
  const timeUntilDue = dueAtMs - nowMs;
  if (timeUntilDue >= 90 * DAY_MS) return 7 * 24 * 60;
  if (timeUntilDue >= 30 * DAY_MS) return 24 * 60;
  return 60;
}

export function buildTodoReminder(item: Todo, nowMs = Date.now()): NativeTodoReminder | null {
  const dueDate = normalizeDueDate(item.due_date);
  if (!dueDate || item.completed) return null;

  const dueTime = normalizeDueTime(item.due_time) ?? "09:00";
  const dueAtMs = new Date(`${dueDate}T${dueTime}:00`).getTime();
  if (!Number.isFinite(dueAtMs) || dueAtMs <= nowMs) return null;

  const leadMinutes = getTodoReminderLeadMinutes(dueAtMs, nowMs);
  return {
    id: item.id,
    title: item.title,
    dueAtMs,
    triggerAtMs: Math.max(nowMs + 5_000, dueAtMs - leadMinutes * MINUTE_MS),
  };
}

export function getHouseholdAndroidBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window.HouseholdAndroid;
  if (
    !bridge ||
    typeof bridge.todoNotificationsEnabled !== "function" ||
    typeof bridge.requestTodoNotifications !== "function" ||
    typeof bridge.syncTodoReminders !== "function"
  ) {
    return null;
  }
  return bridge;
}
