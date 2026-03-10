const API_URL = "/api/todos";
const REALTIME_URL = "/api/realtime/todos";

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const dueDateInput = document.getElementById("todo-due-date");
const list = document.getElementById("todo-list");
const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
const itemTemplate = document.getElementById("todo-item-template");

let activeFilter = "all";
let items = [];
let syncPromise = null;
let syncRequested = false;
let realtimeSource = null;

init();

async function init() {
  bindEvents();
  await fetchTodos();
  setupRealtimeSync();
}

function bindEvents() {
  form.addEventListener("submit", handleCreateTodo);

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      render();
    });
  });
}

async function fetchTodos({ silent = false } = {}) {
  if (syncPromise) {
    syncRequested = true;
    return syncPromise;
  }

  if (!silent) {
    setStatus("Loading tasks...");
  }

  syncPromise = (async () => {
    try {
      const response = await fetch(API_URL);
      if (response.status === 401) {
        window.location.href = "/login?redirect=/todo";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch todos");
      }
      items = await response.json();
      render();
      if (!silent) {
        setStatus("Synced with database.");
      }
    } catch (error) {
      console.error("Error fetching todos:", error);
      if (!silent) {
        setStatus("Could not load tasks.");
      }
      render();
    } finally {
      syncPromise = null;
      if (syncRequested) {
        syncRequested = false;
        void fetchTodos({ silent: true });
      }
    }
  })();

  return syncPromise;
}

function setupRealtimeSync() {
  if (!window.EventSource) {
    return;
  }

  realtimeSource = new EventSource(REALTIME_URL);
  realtimeSource.addEventListener("changed", () => {
    void fetchTodos({ silent: true });
  });
  window.addEventListener(
    "beforeunload",
    () => {
      realtimeSource?.close();
    },
    { once: true },
  );
}

async function handleCreateTodo(event) {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    input.focus();
    return;
  }

  const dueDate = dueDateInput.value || null;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        due_date: dueDate,
      }),
    });

    if (response.status === 401) {
      window.location.reload();
      return;
    }
    if (!response.ok) {
      throw new Error("Failed to create todo");
    }

    form.reset();
    input.focus();
    await fetchTodos();
  } catch (error) {
    console.error("Error creating todo:", error);
    setStatus("Could not add the task.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

async function toggleTodo(item, completed) {
  const previous = items;
  items = items.map((entry) =>
    entry.id === item.id ? { ...entry, completed } : entry,
  );
  render();

  try {
    const response = await fetch(`${API_URL}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    if (!response.ok) {
      throw new Error("Failed to update todo");
    }
    await fetchTodos();
  } catch (error) {
    console.error("Error updating todo:", error);
    items = previous;
    render();
    setStatus("Could not update the task.");
  }
}

async function deleteTodo(item) {
  try {
    const response = await fetch(`${API_URL}/${item.id}`, {
      method: "DELETE",
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    if (!response.ok) {
      throw new Error("Failed to delete todo");
    }
    items = items.filter((entry) => entry.id !== item.id);
    render();
    setStatus("Task deleted.");
  } catch (error) {
    console.error("Error deleting todo:", error);
    setStatus("Could not delete the task.");
  }
}

function render() {
  list.replaceChildren();

  const visibleItems = filteredItems().sort(compareTodos);
  for (const item of visibleItems) {
    const fragment = itemTemplate.content.cloneNode(true);
    const listItem = fragment.querySelector(".todo-item");
    const checkbox = fragment.querySelector('input[type="checkbox"]');
    const text = fragment.querySelector(".todo-text");
    const meta = fragment.querySelector(".todo-meta");
    const dueChip = fragment.querySelector(".todo-due-chip");
    const removeButton = fragment.querySelector(".todo-delete");

    checkbox.checked = item.completed;
    text.textContent = item.title;
    listItem.classList.toggle("is-done", item.completed);

    const duePresentation = describeDueDate(item);
    if (duePresentation) {
      meta.hidden = false;
      dueChip.hidden = false;
      dueChip.textContent = duePresentation.label;
      dueChip.className = `todo-due-chip ${duePresentation.className}`;
      listItem.classList.toggle("is-overdue", duePresentation.className === "is-overdue");
      listItem.classList.toggle("is-urgent", duePresentation.className === "is-today");
    } else {
      meta.hidden = true;
      dueChip.hidden = true;
      dueChip.textContent = "";
      dueChip.className = "todo-due-chip";
      listItem.classList.remove("is-overdue", "is-urgent");
    }

    checkbox.addEventListener("change", () => {
      toggleTodo(item, checkbox.checked);
    });

    removeButton.addEventListener("click", () => {
      deleteTodo(item);
    });

    list.appendChild(fragment);
  }

  if (!list.children.length) {
    const emptyState = document.createElement("li");
    emptyState.className = "todo-item empty-state";
    emptyState.textContent = "Nothing in this view yet.";
    list.appendChild(emptyState);
  }
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === activeFilter);
  });
}

function filteredItems() {
  if (activeFilter === "open") {
    return items.filter((item) => !item.completed);
  }
  if (activeFilter === "done") {
    return items.filter((item) => item.completed);
  }
  return [...items];
}

function compareTodos(a, b) {
  const aDueDate = normalizeDueDate(a.due_date);
  const bDueDate = normalizeDueDate(b.due_date);

  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }

  if (aDueDate && bDueDate && aDueDate !== bDueDate) {
    return aDueDate.localeCompare(bDueDate);
  }

  if (aDueDate && !bDueDate) {
    return -1;
  }
  if (!aDueDate && bDueDate) {
    return 1;
  }

  return b.created_at.localeCompare(a.created_at);
}

function describeDueDate(item) {
  const dueDate = normalizeDueDate(item.due_date);
  if (!dueDate) {
    return {
      label: "No due date",
      className: "is-none",
    };
  }

  if (item.completed) {
    return {
      label: `Completed - was due ${formatDate(dueDate)}`,
      className: "is-done",
    };
  }

  const diff = dayDifference(dueDate, todayIso());
  if (diff < 0) {
    return {
      label: `Overdue - ${formatDate(dueDate)}`,
      className: "is-overdue",
    };
  }
  if (diff === 0) {
    return {
      label: `Due today - ${formatDate(dueDate)}`,
      className: "is-today",
    };
  }
  if (diff <= 3) {
    return {
      label: `Upcoming - ${formatDate(dueDate)}`,
      className: "is-upcoming",
    };
  }
  return {
    label: `Due ${formatDate(dueDate)}`,
    className: "",
  };
}

function normalizeDueDate(value) {
  const text = `${value || ""}`.trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return text;
}

function dayDifference(targetDate, referenceDate) {
  const target = new Date(`${targetDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  return Math.round((target - reference) / 86400000);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function setStatus(message) {
  void message;
}
