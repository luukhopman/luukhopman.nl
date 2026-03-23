import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { APP_PASSWORD, TODO_CALENDAR_TOKEN } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CalendarTodo = {
  id: number;
  title: string;
  due_date: string;
  due_time: string | null;
  completed: boolean;
  created_at: string;
};

function requestHost(request: NextRequest) {
  return request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim()
    || request.headers.get("host")
    || request.nextUrl.host
    || "localhost";
}

function isCalendarRequestAuthorized(request: NextRequest) {
  if (!APP_PASSWORD) {
    return true;
  }

  const token = request.nextUrl.searchParams.get("token");
  if (token && token === TODO_CALENDAR_TOKEN) {
    return true;
  }

  return requireApiAuth(request) === null;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(value: string) {
  return value.replace(/-/g, "");
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatIcsTimestamp(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatTimedDateTime(date: string, time: string) {
  return `${formatIcsDate(date)}T${time.replace(":", "")}00`;
}

function addHour(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const nextDate = new Date(
    Date.UTC(year || 0, (month || 1) - 1, day || 1, hour || 0, minute || 0),
  );
  nextDate.setUTCHours(nextDate.getUTCHours() + 1);
  return nextDate.toISOString().slice(0, 16);
}

function buildEvent(todo: CalendarTodo, host: string) {
  const summary = escapeIcsText(todo.completed ? `${todo.title} (done)` : todo.title);
  const uid = `todo-${todo.id}@${host.replace(/:\d+$/, "")}`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsTimestamp(todo.created_at)}`,
    `SUMMARY:${summary}`,
  ];

  if (todo.due_time) {
    const endDateTime = addHour(todo.due_date, todo.due_time);
    lines.push(`DTSTART:${formatTimedDateTime(todo.due_date, todo.due_time)}`);
    lines.push(`DTEND:${formatTimedDateTime(endDateTime.slice(0, 10), endDateTime.slice(11, 16))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(todo.due_date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDays(todo.due_date, 1))}`);
  }

  if (todo.completed) {
    lines.push("STATUS:CONFIRMED");
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export async function GET(request: NextRequest) {
  if (!isCalendarRequestAuthorized(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const todos = await query<CalendarTodo>(
    `
      SELECT id, title, due_date, due_time, completed, created_at
      FROM todos
      WHERE due_date IS NOT NULL
        AND due_date <> ''
      ORDER BY due_date ASC, due_time ASC NULLS LAST, created_at ASC
    `,
  );

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Website Todo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Todo",
    ...todos.map((todo) => buildEvent(todo, requestHost(request))),
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="todo-calendar.ics"',
    },
  });
}
