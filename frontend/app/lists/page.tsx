"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { ReusableList, ReusableListItem } from "@/lib/types";

const API_URL = "/api/lists";

type PendingAction = string | null;
type ConfirmAction = { kind: "delete" | "clear"; listId: number } | null;

function actionKey(kind: string, listId: number, itemId?: number) {
  return `${kind}:${listId}${itemId ? `:${itemId}` : ""}`;
}

export default function ListsPage() {
  const [lists, setLists] = useState<ReusableList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [copyFromListId, setCopyFromListId] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({});
  const [renameDrafts, setRenameDrafts] = useState<Record<number, string>>({});
  const [itemEditDraft, setItemEditDraft] = useState("");
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [collapsedLists, setCollapsedLists] = useState<Set<number>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [query, setQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const newListInputRef = useRef<HTMLInputElement>(null);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredLists = useMemo(
    () =>
      lists.filter(
        (list) =>
          !normalizedQuery ||
          list.name.toLocaleLowerCase().includes(normalizedQuery) ||
          list.items.some((item) => item.title.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [lists, normalizedQuery],
  );
  const totalItems = lists.reduce((total, list) => total + list.items.length, 0);
  const totalChecked = lists.reduce(
    (total, list) => total + list.items.filter((item) => item.checked).length,
    0,
  );

  function handleError(caught: unknown, fallback: string) {
    if (caught instanceof UnauthorizedError) redirectToLogin("/lists");
    else setError(fallback);
  }

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name || pendingAction) return;
    setPendingAction("create");
    setError("");
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
      handleError(caught, "Could not create list. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>, listId: number) {
    event.preventDefault();
    const title = itemDrafts[listId]?.trim();
    if (!title || pendingAction) return;
    const key = actionKey("add", listId);
    setPendingAction(key);
    setError("");
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
      handleError(caught, "Could not add the item. Please try again.");
    } finally {
      setPendingAction(null);
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
        setError("Could not update the item. Your change was undone.");
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
        setError("Could not remove the item. It has been restored.");
      }
    }
  }

  function startEditingItem(item: ReusableListItem) {
    setEditingItemId(item.id);
    setItemEditDraft(item.title);
  }

  async function saveItem(listId: number, item: ReusableListItem) {
    const title = itemEditDraft.trim();
    if (!title || title === item.title) {
      setEditingItemId(null);
      return;
    }
    const key = actionKey("edit", listId, item.id);
    setPendingAction(key);
    try {
      const response = await apiFetch(`${API_URL}/${listId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error("Could not rename item");
      setLists((current) =>
        current.map((list) =>
          list.id === listId
            ? {
                ...list,
                items: list.items.map((entry) =>
                  entry.id === item.id ? { ...entry, title } : entry,
                ),
              }
            : list,
        ),
      );
      setEditingItemId(null);
    } catch (caught) {
      handleError(caught, "Could not rename the item. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function renameList(list: ReusableList) {
    const name = renameDrafts[list.id]?.trim();
    if (!name || name === list.name) {
      setRenameDrafts((current) => ({ ...current, [list.id]: list.name }));
      setEditingListId(null);
      return;
    }
    const key = actionKey("rename", list.id);
    setPendingAction(key);
    try {
      const response = await apiFetch(`${API_URL}/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Could not rename list");
      setLists((current) =>
        current.map((entry) => (entry.id === list.id ? { ...entry, name } : entry)),
      );
      setEditingListId(null);
    } catch (caught) {
      handleError(caught, "Could not rename the list. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function updateList(listId: number, action: "reset" | "clear") {
    const key = actionKey(action, listId);
    setPendingAction(key);
    try {
      const response = await apiFetch(`${API_URL}/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reset" ? { reset: true } : { clear_completed: true }),
      });
      if (!response.ok) throw new Error("Could not update list");
      setLists((current) =>
        current.map((list) => {
          if (list.id !== listId) return list;
          return {
            ...list,
            items:
              action === "reset"
                ? list.items.map((item) => ({ ...item, checked: false }))
                : list.items.filter((item) => !item.checked),
          };
        }),
      );
      setConfirmAction(null);
    } catch (caught) {
      handleError(caught, "Could not update the list. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteList(listId: number) {
    setPendingAction(actionKey("delete", listId));
    try {
      const response = await apiFetch(`${API_URL}/${listId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete list");
      setLists((current) => current.filter((list) => list.id !== listId));
      setConfirmAction(null);
    } catch (caught) {
      handleError(caught, "Could not delete the list. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  function prepareListCopy(list: ReusableList) {
    setCopyFromListId(String(list.id));
    setNewListName(`${list.name} copy`);
    requestAnimationFrame(() => {
      newListInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      newListInputRef.current?.focus();
      newListInputRef.current?.select();
    });
  }

  function toggleCollapsed(listId: number) {
    setCollapsedLists((current) => {
      const next = new Set(current);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }

  return (
    <main className="lists-shell">
      <header className="lists-header">
        <div>
          <p className="lists-eyebrow">Reusable checklists</p>
          <h1>Lists</h1>
          <p className="lists-summary">
            {lists.length
              ? `${lists.length} ${lists.length === 1 ? "list" : "lists"} · ${totalItems - totalChecked} left to check`
              : "Build a checklist once, then use it whenever you need it."}
          </p>
        </div>
      </header>

      <form className="new-list-form" onSubmit={createList}>
        <div className="new-list-heading">
          <label htmlFor="new-list-name">Create a list</label>
          <span>Start fresh or reuse the items from a list you already have.</span>
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
                if (source && !newListName.trim()) setNewListName(`${source.name} copy`);
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
              ref={newListInputRef}
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="e.g. Holiday packing"
              maxLength={120}
            />
          </label>
          <button type="submit" disabled={!newListName.trim() || pendingAction === "create"}>
            {pendingAction === "create" ? "Creating…" : copyFromListId ? "Copy list" : "Create list"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="lists-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      ) : null}

      {lists.length ? (
        <>
          <section className="lists-toolbar" aria-label="List controls">
            <label className="lists-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search lists and items"
                aria-label="Search lists and items"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>
              ) : null}
            </label>
            <label className="completed-toggle">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(event) => setHideCompleted(event.target.checked)}
              />
              <span>Hide checked items</span>
            </label>
          </section>

          {filteredLists.length ? (
            <section className="lists-grid" aria-label="Your lists">
              {filteredLists.map((list) => {
                const checkedCount = list.items.filter((item) => item.checked).length;
                const progress = list.items.length ? (checkedCount / list.items.length) * 100 : 0;
                const visibleItems = hideCompleted
                  ? list.items.filter((item) => !item.checked)
                  : list.items;
                const collapsed = collapsedLists.has(list.id);
                return (
                  <article className={`list-card${collapsed ? " is-collapsed" : ""}`} key={list.id}>
                    <header>
                      <div className="list-title-row">
                        {editingListId === list.id ? (
                          <input
                            className="list-name-input"
                            aria-label="List name"
                            value={renameDrafts[list.id] ?? list.name}
                            onChange={(event) =>
                              setRenameDrafts((current) => ({
                                ...current,
                                [list.id]: event.target.value,
                              }))
                            }
                            onBlur={() => void renameList(list)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") {
                                setRenameDrafts((current) => ({ ...current, [list.id]: list.name }));
                                setEditingListId(null);
                              }
                            }}
                            autoFocus
                            maxLength={120}
                          />
                        ) : (
                          <h2>{list.name}</h2>
                        )}
                        <div className="list-title-actions">
                          <button
                            type="button"
                            onClick={() => setEditingListId(list.id)}
                            aria-label={`Rename ${list.name}`}
                            title="Rename list"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(list.id)}
                            aria-label={`${collapsed ? "Expand" : "Collapse"} ${list.name}`}
                            aria-expanded={!collapsed}
                            title={collapsed ? "Expand list" : "Collapse list"}
                          >
                            {collapsed ? "＋" : "−"}
                          </button>
                        </div>
                      </div>
                      <span>
                        {list.items.length
                          ? `${checkedCount} of ${list.items.length} checked`
                          : "Ready for your first item"}
                      </span>
                      <div
                        className="list-progress"
                        role="progressbar"
                        aria-label={`${list.name} progress`}
                        aria-valuemin={0}
                        aria-valuemax={list.items.length}
                        aria-valuenow={checkedCount}
                      >
                        <i style={{ width: `${progress}%` }} />
                      </div>
                    </header>

                    {!collapsed ? (
                      <div className="list-card-body">
                        {visibleItems.length ? (
                          <ul>
                            {visibleItems.map((item) => (
                              <li key={item.id} className={item.checked ? "is-checked" : ""}>
                                <div className="list-item-main">
                                  <input
                                    id={`list-${list.id}-item-${item.id}`}
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={() => void toggleItem(list.id, item)}
                                    aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.title}`}
                                  />
                                  {editingItemId === item.id ? (
                                    <input
                                      className="list-item-edit"
                                      value={itemEditDraft}
                                      onChange={(event) => setItemEditDraft(event.target.value)}
                                      onBlur={() => void saveItem(list.id, item)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") setEditingItemId(null);
                                      }}
                                      aria-label={`Edit ${item.title}`}
                                      autoFocus
                                      maxLength={200}
                                    />
                                  ) : (
                                    <label
                                      htmlFor={`list-${list.id}-item-${item.id}`}
                                      onDoubleClick={() => startEditingItem(item)}
                                    >
                                      {item.title}
                                    </label>
                                  )}
                                </div>
                                <span className="list-item-actions">
                                  {editingItemId !== item.id ? (
                                    <button
                                      type="button"
                                      onClick={() => startEditingItem(item)}
                                      aria-label={`Edit ${item.title}`}
                                      title="Edit item"
                                    >
                                      ✎
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => void removeItem(list.id, item.id)}
                                    aria-label={`Remove ${item.title}`}
                                    title="Remove item"
                                  >
                                    ×
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="list-items-empty">
                            {list.items.length ? "All checked — nice work." : "Add your first item below."}
                          </p>
                        )}

                        <form
                          className="new-item-form"
                          onSubmit={(event) => void addItem(event, list.id)}
                        >
                          <input
                            value={itemDrafts[list.id] ?? ""}
                            onChange={(event) =>
                              setItemDrafts((current) => ({
                                ...current,
                                [list.id]: event.target.value,
                              }))
                            }
                            placeholder="Add an item"
                            aria-label={`Add item to ${list.name}`}
                            maxLength={200}
                          />
                          <button
                            type="submit"
                            disabled={
                              !itemDrafts[list.id]?.trim() ||
                              pendingAction === actionKey("add", list.id)
                            }
                            aria-label={`Add item to ${list.name}`}
                          >
                            {pendingAction === actionKey("add", list.id) ? "…" : "+"}
                          </button>
                        </form>

                        <footer>
                          <span className="list-reuse-actions">
                            <button
                              type="button"
                              onClick={() => void updateList(list.id, "reset")}
                              disabled={checkedCount === 0 || pendingAction === actionKey("reset", list.id)}
                              title="Keep every item and clear all checkmarks"
                            >
                              ↻ Use again
                            </button>
                            <button type="button" onClick={() => prepareListCopy(list)}>Copy</button>
                            {checkedCount ? (
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ kind: "clear", listId: list.id })}
                              >
                                Clear checked
                              </button>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="delete-list-button"
                            onClick={() => setConfirmAction({ kind: "delete", listId: list.id })}
                          >
                            Delete list
                          </button>
                        </footer>

                        {confirmAction?.listId === list.id ? (
                          <div className="list-confirm" role="alertdialog" aria-modal="true">
                            <p>
                              {confirmAction.kind === "delete"
                                ? `Delete “${list.name}” and all its items?`
                                : `Remove ${checkedCount} checked ${checkedCount === 1 ? "item" : "items"}?`}
                            </p>
                            <div>
                              <button type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
                              <button
                                type="button"
                                className="is-danger"
                                disabled={pendingAction !== null}
                                onClick={() =>
                                  confirmAction.kind === "delete"
                                    ? void deleteList(list.id)
                                    : void updateList(list.id, "clear")
                                }
                              >
                                {pendingAction ? "Working…" : confirmAction.kind === "delete" ? "Delete list" : "Remove items"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="lists-empty">
              <h2>No matches</h2>
              <p>Try another search or clear the search box.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </section>
          )}
        </>
      ) : loading ? (
        <section className="lists-loading" aria-live="polite">
          <i />
          <i />
          <span>Loading your lists…</span>
        </section>
      ) : (
        <section className="lists-empty">
          <span className="lists-empty-icon" aria-hidden="true">✓</span>
          <h2>No lists yet</h2>
          <p>Create a packing list, shopping checklist, or anything you want to reuse.</p>
          <button type="button" onClick={() => newListInputRef.current?.focus()}>Create your first list</button>
        </section>
      )}
    </main>
  );
}
