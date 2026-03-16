"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiFetch, redirectToLogin, UnauthorizedError } from "../../lib/http";
import { dayDifference, formatDate, normalizeDueDate, todayIso } from "../../lib/format";
import type { Todo } from "../../lib/types";

const API_URL = "/api/todos";
const REALTIME_URL = "/api/realtime/todos";

type TodoFilter = "all" | "open" | "done";
type TodoDraft = {
  title: string;
  due_date: string;
};

function compareTodos(a: Todo, b: Todo) {
  const aDueDate = normalizeDueDate(a.due_date);
  const bDueDate = normalizeDueDate(b.due_date);

  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }

  if (aDueDate && bDueDate && aDueDate !== bDueDate) {
    return aDueDate.localeCompare(bDueDate);
  }

  if (aDueDate && !bDueDate) return -1;
  if (!aDueDate && bDueDate) return 1;

  return b.created_at.localeCompare(a.created_at);
}

function describeDueDate(item: Todo) {
  const dueDate = normalizeDueDate(item.due_date);
  if (!dueDate) {
    return { label: "No due date", className: "is-none" };
  }

  if (item.completed) {
    return {
      label: `Completed - was due ${formatDate(dueDate)}`,
      className: "is-done",
    };
  }

  const diff = dayDifference(dueDate, todayIso());
  if (diff < 0) {
    return { label: `Overdue - ${formatDate(dueDate)}`, className: "is-overdue" };
  }
  if (diff === 0) {
    return { label: `Due today - ${formatDate(dueDate)}`, className: "is-today" };
  }
  if (diff <= 3) {
    return { label: `Upcoming - ${formatDate(dueDate)}`, className: "is-upcoming" };
  }
  return { label: `Due ${formatDate(dueDate)}`, className: "" };
}

export default function TodoPage() {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [items, setItems] = useState<Todo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>({ title: "", due_date: "" });
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    void fetchTodos();

    if (!window.EventSource) return;

    const source = new EventSource(REALTIME_URL);
    source.addEventListener("changed", () => {
      void fetchTodos();
    });

    return () => {
      source.close();
    };
  }, []);

  async function handleCreateTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || submitting) return;

    setSubmitting(true);

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          due_date: dueDate || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to create todo");

      setTitle("");
      setDueDate("");
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
    });
  }

  function stopEditing() {
    setEditingId(null);
    setEditDraft({ title: "", due_date: "" });
    setSavingEdit(false);
  }

  async function saveTodoEdit(item: Todo) {
    const nextTitle = editDraft.title.trim();
    if (!nextTitle || savingEdit) return;

    const previous = items;
    const nextDueDate = editDraft.due_date || null;

    setSavingEdit(true);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              title: nextTitle,
              due_date: nextDueDate,
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
          <div className="field-group field-date">
            <label className="sr-only" htmlFor="todo-due-date">
              Due date
            </label>
            <input
              id="todo-due-date"
              name="due_date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
          </button>
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
                        <input
                          id={`todo-edit-date-${item.id}`}
                          className="todo-edit-date"
                          type="date"
                          value={editDraft.due_date}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              due_date: event.target.value,
                            }))
                          }
                          disabled={savingEdit}
                        />
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
                          <button
                            type="button"
                            className="todo-action-button todo-delete"
                            onClick={() => void deleteTodo(item)}
                            disabled={savingEdit}
                          >
                            Delete
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
                            <span className="todo-meta" hidden={!duePresentation}>
                              <span
                                className={`todo-due-chip ${duePresentation.className}`}
                                hidden={!duePresentation}
                              >
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
      </main>
    </div>
  );
}
