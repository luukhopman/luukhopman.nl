import { normalizeDueDate, normalizeDueTime } from "./format";
import {
  isTodoReminderSetting,
  type Todo,
  type TodoReminderSetting,
} from "./types";

const MINUTE_MS = 60_000;

const REMINDER_LEAD_MINUTES: Partial<Record<TodoReminderSetting, number>> = {
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 2 * 60,
  "1d": 24 * 60,
  "1w": 7 * 24 * 60,
};

export const TODO_REMINDER_OPTIONS: ReadonlyArray<{
  value: TodoReminderSetting;
  label: string;
}> = [
  { value: "default", label: "Default (2h / evening before)" },
  { value: "off", label: "No reminder" },
  { value: "15m", label: "15 minutes before" },
  { value: "30m", label: "30 minutes before" },
  { value: "1h", label: "1 hour before" },
  { value: "2h", label: "2 hours before" },
  { value: "1d", label: "1 day before" },
  { value: "1w", label: "1 week before" },
  { value: "at_due_time", label: "At due time" },
  { value: "previous_evening", label: "Previous evening at 20:00" },
];

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

export function getTodoReminderLeadMinutes(setting: TodoReminderSetting = "default"): number | null {
  if (setting === "default") return 2 * 60;
  return REMINDER_LEAD_MINUTES[setting] ?? null;
}

export function normalizeTodoReminderSetting(value: unknown): TodoReminderSetting {
  return isTodoReminderSetting(value) ? value : "default";
}

function localDateTime(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function previousEveningAtMs(dueDate: string): number {
  const evening = localDateTime(dueDate, "20:00");
  evening.setDate(evening.getDate() - 1);
  return evening.getTime();
}

export function buildTodoReminder(item: Todo, nowMs = Date.now()): NativeTodoReminder | null {
  const dueDate = normalizeDueDate(item.due_date);
  if (!dueDate || item.completed) return null;

  const dueTime = normalizeDueTime(item.due_time);
  const dueAtMs = localDateTime(dueDate, dueTime ?? "09:00").getTime();
  if (!Number.isFinite(dueAtMs) || dueAtMs <= nowMs) return null;

  const setting = normalizeTodoReminderSetting(item.reminder_setting);
  if (setting === "off") return null;

  let triggerAtMs: number;
  if ((setting === "default" && !dueTime) || setting === "previous_evening") {
    triggerAtMs = previousEveningAtMs(dueDate);
  } else if (setting === "at_due_time") {
    triggerAtMs = dueAtMs;
  } else {
    const leadMinutes = getTodoReminderLeadMinutes(setting) ?? 2 * 60;
    triggerAtMs = dueAtMs - leadMinutes * MINUTE_MS;
  }

  return {
    id: item.id,
    title: item.title,
    dueAtMs,
    triggerAtMs: Math.max(nowMs + 5_000, triggerAtMs),
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
