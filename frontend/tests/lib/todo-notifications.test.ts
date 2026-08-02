import { describe, expect, it } from "vitest";

import {
  buildTodoReminder,
  getTodoReminderLeadMinutes,
} from "@/lib/todo-notifications";

describe("todo notification scheduling", () => {
  const now = new Date("2026-08-02T10:00:00").getTime();

  it("uses one hour for near-term tasks", () => {
    const dueAt = now + 2 * 24 * 60 * 60 * 1000;
    expect(getTodoReminderLeadMinutes(dueAt, now)).toBe(60);
  });

  it("uses longer lead times for distant tasks", () => {
    expect(getTodoReminderLeadMinutes(now + 45 * 24 * 60 * 60 * 1000, now)).toBe(24 * 60);
    expect(getTodoReminderLeadMinutes(now + 120 * 24 * 60 * 60 * 1000, now)).toBe(7 * 24 * 60);
  });

  it("builds a local-time reminder and skips completed or undated tasks", () => {
    const reminder = buildTodoReminder(
      {
        id: 7,
        title: "Call the dentist",
        due_date: "2026-08-03",
        due_time: "14:30",
        completed: false,
        completed_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      now,
    );

    expect(reminder?.id).toBe(7);
    expect(reminder?.title).toBe("Call the dentist");
    expect(reminder?.triggerAtMs).toBe(reminder!.dueAtMs - 60 * 60 * 1000);
    expect(
      buildTodoReminder(
        {
          id: 8,
          title: "Done",
          due_date: "2026-08-03",
          due_time: null,
          completed: true,
          completed_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBeNull();
  });
});
