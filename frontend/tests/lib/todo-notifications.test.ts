import { describe, expect, it } from "vitest";

import {
  buildTodoReminder,
  getTodoReminderLeadMinutes,
} from "@/lib/todo-notifications";

describe("todo notification scheduling", () => {
  const now = new Date("2026-08-02T10:00:00").getTime();

  it("uses two hours as the default lead time", () => {
    expect(getTodoReminderLeadMinutes()).toBe(120);
    expect(getTodoReminderLeadMinutes("2h")).toBe(120);
    expect(getTodoReminderLeadMinutes("1d")).toBe(24 * 60);
  });

  it("uses two hours before a timed task by default", () => {
    const reminder = buildTodoReminder(
      {
        id: 7,
        title: "Call the dentist",
        due_date: "2026-08-03",
        due_time: "14:30",
        reminder_setting: "default",
        completed: false,
        completed_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      now,
    );

    expect(reminder?.triggerAtMs).toBe(new Date(2026, 7, 3, 12, 30).getTime());
  });

  it("uses the previous evening at 20:00 for date-only tasks", () => {
    const reminder = buildTodoReminder(
      {
        id: 8,
        title: "Take out the bins",
        due_date: "2026-08-04",
        due_time: null,
        reminder_setting: "default",
        completed: false,
        completed_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      now,
    );

    expect(reminder?.triggerAtMs).toBe(new Date(2026, 7, 3, 20, 0).getTime());
  });

  it("supports item-specific settings and skips disabled or completed tasks", () => {
    const reminder = buildTodoReminder(
      {
        id: 9,
        title: "Start dinner",
        due_date: "2026-08-03",
        due_time: "18:00",
        reminder_setting: "30m",
        completed: false,
        completed_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      now,
    );

    expect(reminder?.id).toBe(9);
    expect(reminder?.title).toBe("Start dinner");
    expect(reminder?.triggerAtMs).toBe(new Date(2026, 7, 3, 17, 30).getTime());
    expect(
      buildTodoReminder({
        id: 10,
        title: "No reminder",
        due_date: "2026-08-03",
        due_time: "18:00",
        reminder_setting: "off",
        completed: false,
        completed_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
      }, now),
    ).toBeNull();
    expect(
      buildTodoReminder(
        {
          id: 11,
          title: "Done",
          due_date: "2026-08-03",
          due_time: null,
          reminder_setting: "default",
          completed: true,
          completed_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBeNull();
  });
});
