"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { ReusableList, ReusableListItem } from "@/lib/types";

const API_URL = "/api/lists";

export default function ListsPage() {
  const [lists, setLists] = useState<ReusableList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [copyFromListId, setCopyFromListId] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({});
  const [renameDrafts, setRenameDrafts] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadLists = useCallback(async () => {
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Could not load your lists");
      const payload = (await response.json()) as ReusableList[];
      setLists(payload);
      setRenameDrafts(Object.fromEntries(payload.map((list) => [list.id, list.name])));
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/lists");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load your lists");
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          copy_from_list_id: copyFromListId ? Number(copyFromListId) : null,
        }),
      });
      if (!response.ok) throw new Error("Could not create list");
      setNewListName("");
      setCopyFromListId("");
      await loadLists();
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else setError("Could not create list");
    } finally {
      setSaving(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>, listId: number) {
    event.preventDefault();
    const title = itemDrafts[listId]?.trim();
    if (!title) return;
    try {
      const response = await apiFetch(`${API_URL}/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error("Could not add item");
      setItemDrafts((current) => ({ ...current, [listId]: "" }));
      await loadLists();
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else setError("Could not add item");
    }
  }

  async function toggleItem(listId: number, item: ReusableListItem) {
    const checked = !item.checked;
    const previous = lists;
    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? {
              ...list,
              items: list.items.map((entry) =>
                entry.id === item.id ? { ...entry, checked } : entry,
              ),
            }
          : list,
      ),
    );
    try {
      const response = await apiFetch(`${API_URL}/${listId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      });
      if (!response.ok) throw new Error("Could not update item");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else {
        setLists(previous);
        setError("Could not update item");
      }
    }
  }

  async function removeItem(listId: number, itemId: number) {
    const previous = lists;
    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? { ...list, items: list.items.filter((item) => item.id !== itemId) }
          : list,
      ),
    );
    try {
      const response = await apiFetch(`${API_URL}/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not remove item");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else {
        setLists(previous);
        setError("Could not remove item");
      }
    }
  }

  async function renameList(list: ReusableList) {
    const name = renameDrafts[list.id]?.trim();
    if (!name || name === list.name) {
      setRenameDrafts((current) => ({ ...current, [list.id]: list.name }));
      return;
    }
    try {
      const response = await apiFetch(`${API_URL}/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Could not rename list");
      setLists((current) =>
        current.map((entry) => entry.id === list.id ? { ...entry, name } : entry),
      );
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else setError("Could not rename list");
    }
  }

  async function resetList(listId: number) {
    try {
      const response = await apiFetch(`${API_URL}/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (!response.ok) throw new Error("Could not reset list");
      setLists((current) =>
        current.map((list) =>
          list.id === listId
            ? { ...list, items: list.items.map((item) => ({ ...item, checked: false })) }
            : list,
        ),
      );
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else setError("Could not reset list");
    }
  }

  async function deleteList(listId: number) {
    try {
      const response = await apiFetch(`${API_URL}/${listId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete list");
      setLists((current) => current.filter((list) => list.id !== listId));
      setDeleteTarget(null);
    } catch (caught) {
      if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
      else setError("Could not delete list");
    }
  }

  function prepareListCopy(list: ReusableList) {
    setCopyFromListId(String(list.id));
    setNewListName(`${list.name} copy`);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>("#new-list-name");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
      input?.select();
    });
  }

  return (
    <main className="lists-shell">
      <header className="lists-header">
        <h1>Lists</h1>
      </header>

      <form className="new-list-form" onSubmit={createList}>
        <div className="new-list-heading">
          <label htmlFor="new-list-name">Create a list</label>
        </div>
        <div className="new-list-fields">
          <label>
            <span>Start with</span>
            <select
              value={copyFromListId}
              onChange={(event) => {
                const sourceId = event.target.value;
                setCopyFromListId(sourceId);
                const source = lists.find((list) => String(list.id) === sourceId);
                if (source && !newListName.trim()) {
                  setNewListName(`${source.name} copy`);
                }
              }}
            >
              <option value="">A blank list</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  Copy “{list.name}” ({list.items.length} items)
                </option>
              ))}
            </select>
          </label>
          <label className="new-list-name-field">
            <span>Name</span>
            <input
              id="new-list-name"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="e.g. Holiday packing"
            />
          </label>
          <button type="submit" disabled={!newListName.trim() || saving}>
            {saving ? "Creating…" : copyFromListId ? "Copy list" : "Create list"}
          </button>
        </div>
      </form>

      {error ? <p className="lists-error" role="alert">{error}</p> : null}

      {lists.length ? (
        <section className="lists-grid" aria-label="Your lists">
          {lists.map((list) => {
            const checkedCount = list.items.filter((item) => item.checked).length;
            const progress = list.items.length ? (checkedCount / list.items.length) * 100 : 0;
            return (
              <article className="list-card" key={list.id}>
                <header>
                  <input
                    className="list-name"
                    aria-label="List name"
                    value={renameDrafts[list.id] ?? list.name}
                    onChange={(event) =>
                      setRenameDrafts((current) => ({ ...current, [list.id]: event.target.value }))
                    }
                    onBlur={() => void renameList(list)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <span>{checkedCount} of {list.items.length} checked</span>
                  <div className="list-progress" aria-hidden="true">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </header>

                <ul>
                  {list.items.map((item) => (
                    <li key={item.id} className={item.checked ? "is-checked" : ""}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => void toggleItem(list.id, item)}
                        />
                        <span>{item.title}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => void removeItem(list.id, item.id)}
                        aria-label={`Remove ${item.title}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>

                <form className="new-item-form" onSubmit={(event) => void addItem(event, list.id)}>
                  <input
                    value={itemDrafts[list.id] ?? ""}
                    onChange={(event) =>
                      setItemDrafts((current) => ({ ...current, [list.id]: event.target.value }))
                    }
                    placeholder="Add an item"
                    aria-label={`Add item to ${list.name}`}
                  />
                  <button type="submit" disabled={!itemDrafts[list.id]?.trim()} aria-label="Add item">
                    +
                  </button>
                </form>

                <footer>
                  <span className="list-reuse-actions">
                    <button
                      type="button"
                      onClick={() => void resetList(list.id)}
                      disabled={checkedCount === 0}
                      title="Keep every item and clear all checkmarks"
                    >
                      ↻ Use again
                    </button>
                    <button type="button" onClick={() => prepareListCopy(list)}>
                      Copy
                    </button>
                  </span>
                  {deleteTarget === list.id ? (
                    <span className="delete-confirm">
                      <button type="button" onClick={() => setDeleteTarget(null)}>Keep</button>
                      <button type="button" onClick={() => void deleteList(list.id)}>Delete</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setDeleteTarget(list.id)}>Delete list</button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="lists-empty">
          <h2>No lists yet</h2>
        </section>
      )}
    </main>
  );
}
