"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { apiFetch, redirectToLogin, UnauthorizedError } from "../../lib/http";
import {
  dayDifference,
  formatDate,
  formatDateFieldValue,
  formatTime,
  normalizeDueDate,
  normalizeDueTime,
  todayIso,
} from "../../lib/format";
import type { Todo } from "../../lib/types";

const API_URL = "/api/todos";
const REALTIME_URL = "/api/realtime/todos";
const CALENDAR_LINK_URL = "/api/todos/calendar-link";

type TodoFilter = "all" | "open" | "done";
type TodoDraft = {
  title: string;
  due_date: string;
  due_time: string;
};
type CalendarFeed = {
  calendar_url: string;
  webcal_url: string | null;
};

function compareTodos(a: Todo, b: Todo) {
  const aDueDate = normalizeDueDate(a.due_date);
  const bDueDate = normalizeDueDate(b.due_date);
  const aDueTime = aDueDate ? normalizeDueTime(a.due_time) : null;
  const bDueTime = bDueDate ? normalizeDueTime(b.due_time) : null;

  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }

  if (aDueDate && bDueDate && aDueDate !== bDueDate) {
    return aDueDate.localeCompare(bDueDate);
  }

  if (aDueDate && !bDueDate) return -1;
  if (!aDueDate && bDueDate) return 1;

  if (aDueTime && bDueTime && aDueTime !== bDueTime) {
    return aDueTime.localeCompare(bDueTime);
  }

  if (aDueTime && !bDueTime) return -1;
  if (!aDueTime && bDueTime) return 1;

  return b.created_at.localeCompare(a.created_at);
}

function formatDueLabel(dueDate: string, dueTime: string | null) {
  return dueTime ? `${formatDate(dueDate)} at ${formatTime(dueTime)}` : formatDate(dueDate);
}

function describeDueDate(item: Todo) {
  const dueDate = normalizeDueDate(item.due_date);
  const dueTime = dueDate ? normalizeDueTime(item.due_time) : null;
  if (!dueDate) {
    return { label: "No due date", className: "is-none" };
  }

  if (item.completed) {
    return {
      label: `Completed - was due ${formatDueLabel(dueDate, dueTime)}`,
      className: "is-done",
    };
  }

  const diff = dayDifference(dueDate, todayIso());
  if (diff < 0) {
    return { label: `Overdue - ${formatDueLabel(dueDate, dueTime)}`, className: "is-overdue" };
  }
  if (diff === 0) {
    return {
      label: dueTime ? `Due today - ${formatTime(dueTime)}` : `Due today - ${formatDate(dueDate)}`,
      className: "is-today",
    };
  }
  if (diff <= 3) {
    return { label: `Upcoming - ${formatDueLabel(dueDate, dueTime)}`, className: "is-upcoming" };
  }
  return { label: `Due ${formatDueLabel(dueDate, dueTime)}`, className: "" };
}

export default function TodoPage() {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [items, setItems] = useState<Todo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>({
    title: "",
    due_date: "",
    due_time: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [calendarFeed, setCalendarFeed] = useState<CalendarFeed | null>(null);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const calendarPopoverRef = useRef<HTMLDetailsElement | null>(null);

  async function fetchTodos() {
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch todos");
      const payload = (await response.json()) as Todo[];
      setItems(payload);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error fetching todos:", error);
    }
  }

  async function fetchCalendarFeed() {
    try {
      const response = await apiFetch(CALENDAR_LINK_URL);
      if (!response.ok) throw new Error("Failed to fetch calendar link");
      setCalendarFeed((await response.json()) as CalendarFeed);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error fetching calendar link:", error);
    }
  }

  useEffect(() => {
    void fetchTodos();
    void fetchCalendarFeed();

    if (!window.EventSource) return;

    const source = new EventSource(REALTIME_URL);
    source.addEventListener("changed", () => {
      void fetchTodos();
    });

    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const popover = calendarPopoverRef.current;
      if (!popover?.open) return;
      if (popover.contains(event.target as Node)) return;
      popover.open = false;
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  async function handleCreateTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || submitting) return;
    const nextDueDate = dueDate || null;
    const nextDueTime = nextDueDate ? normalizeDueTime(dueTime) : null;

    setSubmitting(true);

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          due_date: nextDueDate,
          due_time: nextDueTime,
        }),
      });

      if (!response.ok) throw new Error("Failed to create todo");

      setTitle("");
      setDueDate("");
      setDueTime("");
      await fetchTodos();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error creating todo:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTodo(item: Todo, completed: boolean) {
    const previous = items;
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, completed } : entry)),
    );

    try {
      const response = await apiFetch(`${API_URL}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error("Failed to update todo");
      await fetchTodos();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error updating todo:", error);
      setItems(previous);
    }
  }

  async function deleteTodo(item: Todo) {
    try {
      const response = await apiFetch(`${API_URL}/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete todo");
      if (editingId === item.id) {
        stopEditing();
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error deleting todo:", error);
    }
  }

  function startEditing(item: Todo) {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      due_date: normalizeDueDate(item.due_date) || "",
      due_time: item.due_date ? normalizeDueTime(item.due_time) || "" : "",
    });
  }

  function stopEditing() {
    setEditingId(null);
    setEditDraft({ title: "", due_date: "", due_time: "" });
    setSavingEdit(false);
  }

  async function saveTodoEdit(item: Todo) {
    const nextTitle = editDraft.title.trim();
    if (!nextTitle || savingEdit) return;

    const previous = items;
    const nextDueDate = editDraft.due_date || null;
    const nextDueTime = nextDueDate ? normalizeDueTime(editDraft.due_time) : null;

    setSavingEdit(true);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              title: nextTitle,
              due_date: nextDueDate,
              due_time: nextDueTime,
            }
          : entry,
      ),
    );

    try {
      const response = await apiFetch(`${API_URL}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          due_date: nextDueDate,
          due_time: nextDueTime,
        }),
      });
      if (!response.ok) throw new Error("Failed to update todo");
      stopEditing();
      await fetchTodos();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/todo");
        return;
      }
      console.error("Error updating todo:", error);
      setItems(previous);
      setSavingEdit(false);
    }
  }

  async function copyCalendarFeed() {
    const nextValue = calendarFeed?.webcal_url || calendarFeed?.calendar_url;
    if (!nextValue || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextValue);
      setCalendarCopied(true);
      window.setTimeout(() => setCalendarCopied(false), 1500);
    } catch (error) {
      console.error("Error copying calendar link:", error);
    }
  }

  const visibleItems = [...items]
    .filter((item) => {
      if (filter === "open") return !item.completed;
      if (filter === "done") return item.completed;
      return true;
    })
    .sort(compareTodos);

  return (
    <div className="todo-shell">
      <main className="todo-panel">
        <header className="todo-header">
          <h1>Todo</h1>
        </header>

        <form className="todo-form" onSubmit={handleCreateTodo}>
          <div className="field-group field-title">
            <label className="sr-only" htmlFor="todo-input">
              Add a task
            </label>
            <input
              id="todo-input"
              name="todo"
              type="text"
              maxLength={120}
              placeholder="Write the next thing that matters"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="todo-form-row">
            <div className="field-schedule">
              <div className="field-group field-date">
                <label className="sr-only" htmlFor="todo-due-date">
                  Date
                </label>
                <div className="picker-field">
                  <span className={`picker-value ${dueDate ? "" : "is-placeholder"}`}>
                    {dueDate ? formatDateFieldValue(dueDate) : "dd/mm/yyyy"}
                  </span>
                  <span className="picker-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="17" rx="3" ry="3" />
                      <line x1="16" y1="2.5" x2="16" y2="6" />
                      <line x1="8" y1="2.5" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <input
                    id="todo-due-date"
                    className="picker-native-input"
                    name="due_date"
                    type="date"
                    value={dueDate}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDueDate(nextValue);
                      if (!nextValue) {
                        setDueTime("");
                      }
                    }}
                  />
                </div>
              </div>
              <div className="field-group field-time">
                <label className="sr-only" htmlFor="todo-due-time">
                  Time
                </label>
                <div className="picker-field">
                  <span className={`picker-value ${dueTime ? "" : "is-placeholder"}`}>
                    {dueTime || "hh:mm"}
                  </span>
                  <span className="picker-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <input
                    id="todo-due-time"
                    className="picker-native-input"
                    name="due_time"
                    type="time"
                    value={dueTime}
                    onChange={(event) => setDueTime(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>

        <div className="todo-toolbar">
          {(["all", "open", "done"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`toolbar-button ${filter === value ? "is-active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "open" ? "Open" : "Done"}
            </button>
          ))}
        </div>

        <ul className="todo-list">
          {visibleItems.length === 0 ? (
            <li className="todo-item empty-state">Nothing in this view yet.</li>
          ) : (
            visibleItems.map((item) => {
              const duePresentation = describeDueDate(item);
              const isEditing = editingId === item.id;
              return (
                <li
                  key={item.id}
                  className={[
                    "todo-item",
                    isEditing ? "is-editing" : "",
                    item.completed ? "is-done" : "",
                    duePresentation.className === "is-overdue" ? "is-overdue" : "",
                    duePresentation.className === "is-today" ? "is-urgent" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isEditing ? (
                    <div className="todo-edit-shell">
                      <form
                        className="todo-edit-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveTodoEdit(item);
                        }}
                      >
                        <label className="sr-only" htmlFor={`todo-edit-title-${item.id}`}>
                          Edit task title
                        </label>
                        <input
                          id={`todo-edit-title-${item.id}`}
                          className="todo-edit-input"
                          type="text"
                          maxLength={120}
                          value={editDraft.title}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          disabled={savingEdit}
                          autoFocus
                        />
                        <label className="sr-only" htmlFor={`todo-edit-date-${item.id}`}>
                          Edit due date
                        </label>
                        <div className="picker-field picker-field-edit">
                          <span className={`picker-value ${editDraft.due_date ? "" : "is-placeholder"}`}>
                            {editDraft.due_date ? formatDateFieldValue(editDraft.due_date) : "dd/mm/yyyy"}
                          </span>
                          <span className="picker-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <rect x="3" y="4" width="18" height="17" rx="3" ry="3" />
                              <line x1="16" y1="2.5" x2="16" y2="6" />
                              <line x1="8" y1="2.5" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </span>
                          <input
                            id={`todo-edit-date-${item.id}`}
                            className="picker-native-input"
                            type="date"
                            value={editDraft.due_date}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                due_date: event.target.value,
                                due_time: event.target.value ? current.due_time : "",
                              }))
                            }
                            disabled={savingEdit}
                          />
                        </div>
                        <label className="sr-only" htmlFor={`todo-edit-time-${item.id}`}>
                          Edit due time
                        </label>
                        <div className="picker-field picker-field-edit">
                          <span className={`picker-value ${editDraft.due_time ? "" : "is-placeholder"}`}>
                            {editDraft.due_time || "hh:mm"}
                          </span>
                          <span className="picker-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="8" />
                              <path d="M12 7v5l3 2" />
                            </svg>
                          </span>
                          <input
                            id={`todo-edit-time-${item.id}`}
                            className="picker-native-input"
                            type="time"
                            value={editDraft.due_time}
                            disabled={savingEdit}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                due_time: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="todo-edit-actions">
                          <button
                            type="submit"
                            className="todo-action-button todo-save"
                            disabled={savingEdit || !editDraft.title.trim()}
                          >
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="todo-action-button todo-cancel"
                            onClick={stopEditing}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <>
                      <div className="todo-item-main">
                        <label className="todo-check">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={(event) => void toggleTodo(item, event.target.checked)}
                          />
                          <span className="todo-mark" />
                        </label>
                        <button
                          type="button"
                          className="todo-edit-trigger"
                          aria-label={`Edit ${item.title}`}
                          onClick={() => startEditing(item)}
                        >
                          <span className="todo-copy">
                            <span className="todo-text">{item.title}</span>
                            <span className="todo-meta">
                              <span className={`todo-due-chip ${duePresentation.className}`}>
                                {duePresentation.label}
                              </span>
                            </span>
                          </span>
                        </button>
                      </div>
                      <div className="todo-actions">
                        <button
                          type="button"
                          className="todo-edit todo-icon-button"
                          aria-label="Edit task"
                          onClick={() => startEditing(item)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
                            <path d="m13 7 4 4" />
                            <path d="M15 5 19 9" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="todo-delete todo-icon-button todo-delete-icon"
                          aria-label="Delete task"
                          onClick={() => void deleteTodo(item)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                            <path d="M6 7h12l-1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7Z" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })
          )}
        </ul>

        <footer className="todo-footer">
          <details ref={calendarPopoverRef} className="todo-footer-popover">
            <summary className="todo-footer-trigger">Calendar Feed</summary>
            <div className="todo-feed-popup">
              <div className="todo-feed-header">
                <p className="todo-feed-title">Calendar Feed</p>
                <p className="todo-feed-description">Copy this link into your calendar app.</p>
              </div>
              <input
                className="todo-feed-input"
                type="text"
                readOnly
                value={calendarFeed?.webcal_url || calendarFeed?.calendar_url || ""}
                placeholder="Loading calendar feed..."
              />
              <div className="todo-feed-actions">
                <button
                  type="button"
                  className="todo-feed-button"
                  onClick={() => void copyCalendarFeed()}
                  disabled={!calendarFeed}
                >
                  {calendarCopied ? "Copied" : "Copy Link"}
                </button>
              </div>
            </div>
          </details>
        </footer>
      </main>
    </div>
  );
}
