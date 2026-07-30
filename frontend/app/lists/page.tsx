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
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [query, setQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [wishlistItemIds, setWishlistItemIds] = useState<Set<number>>(new Set());
  const [success, setSuccess] = useState("");
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
  const activeLists = useMemo(() => lists.filter((list) => !list.completed), [lists]);
  const completedLists = useMemo(() => lists.filter((list) => list.completed), [lists]);
  const filteredLists = useMemo(
    () =>
      activeLists.filter(
        (list) =>
          !normalizedQuery ||
          list.name.toLocaleLowerCase().includes(normalizedQuery) ||
          list.items.some((item) => item.title.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [activeLists, normalizedQuery],
  );
  const selectedList =
    activeLists.find((list) => list.id === selectedListId) ?? activeLists[0] ?? null;
  const totalItems = activeLists.reduce((total, list) => total + list.items.length, 0);
  const totalChecked = activeLists.reduce(
    (total, list) => total + list.items.filter((item) => item.checked).length,
    0,
  );

  useEffect(() => {
    if (selectedList && selectedList.id !== selectedListId) {
      setSelectedListId(selectedList.id);
    } else if (!selectedList && selectedListId !== null) {
      setSelectedListId(null);
    }
  }, [selectedList, selectedListId]);

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
      const created = (await response.json()) as { id?: number };
      setNewListName("");
      setCopyFromListId("");
      await loadLists();
      if (created.id) setSelectedListId(created.id);
      setShowCreateForm(false);
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

  async function addToWishlist(list: ReusableList, item: ReusableListItem) {
    const key = actionKey("wishlist", list.id, item.id);
    if (pendingAction || wishlistItemIds.has(item.id)) return;
    setPendingAction(key);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch("/api/wishlist/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.title, store: list.name }),
      });
      if (!response.ok) throw new Error("Could not add item to wishlist");
      setWishlistItemIds((current) => new Set(current).add(item.id));
      setSuccess(`“${item.title}” was added to your wishlist under “${list.name}”.`);
    } catch (caught) {
      handleError(caught, "Could not add the item to your wishlist. Please try again.");
    } finally {
      setPendingAction(null);
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

  async function setListCompleted(list: ReusableList, completed: boolean) {
    const key = actionKey(completed ? "complete" : "reopen", list.id);
    setPendingAction(key);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch(`${API_URL}/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) throw new Error("Could not update list");
      setLists((current) =>
        current.map((entry) => (entry.id === list.id ? { ...entry, completed } : entry)),
      );
    } catch (caught) {
      handleError(
        caught,
        completed
          ? "Could not complete the list. Please try again."
          : "Could not reopen the list. Please try again.",
      );
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
    setShowCreateForm(true);
    requestAnimationFrame(() => {
      newListInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      newListInputRef.current?.focus();
      newListInputRef.current?.select();
    });
  }

  const selectedCheckedCount =
    selectedList?.items.filter((item) => item.checked).length ?? 0;
  const selectedProgress =
    selectedList?.items.length
      ? (selectedCheckedCount / selectedList.items.length) * 100
      : 0;
  const visibleSelectedItems = selectedList
    ? hideCompleted
      ? selectedList.items.filter((item) => !item.checked)
      : selectedList.items
    : [];
  const shouldShowCreateForm = showCreateForm || (!loading && lists.length === 0);

  return (
    <main className="lists-shell">
      <header className="lists-header">
        <div>
          <h1>Lists</h1>
          {activeLists.length ? (
            <p className="lists-summary">
              {activeLists.length} {activeLists.length === 1 ? "list" : "lists"} · {totalItems - totalChecked} unchecked
            </p>
          ) : null}
        </div>
        {lists.length ? (
          <button
            type="button"
            className="new-list-button"
            onClick={() => {
              setShowCreateForm((current) => !current);
              requestAnimationFrame(() => newListInputRef.current?.focus());
            }}
            aria-expanded={shouldShowCreateForm}
          >
            {shouldShowCreateForm ? "Cancel" : "New list"}
          </button>
        ) : null}
      </header>

      {shouldShowCreateForm ? (
        <form className="new-list-form" onSubmit={createList}>
          <label className="new-list-name-field">
            <span>List name</span>
            <input
              id="new-list-name"
              ref={newListInputRef}
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="Holiday packing"
              maxLength={120}
            />
          </label>
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
              <option value="">Blank list</option>
              {activeLists.length ? (
                <optgroup label="Current lists">
                  {activeLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.items.length})
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {completedLists.length ? (
                <optgroup label="Completed lists">
                  {completedLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.items.length})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <button type="submit" disabled={!newListName.trim() || pendingAction === "create"}>
            {pendingAction === "create" ? "Creating…" : copyFromListId ? "Create copy" : "Create"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="lists-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      ) : null}

      {success ? (
        <div className="lists-success" role="status">
          <span>{success}</span>
          <span className="lists-success-actions">
            <a href="/wishlist">View wishlist</a>
            <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss message">×</button>
          </span>
        </div>
      ) : null}

      {loading ? (
        <section className="lists-loading" aria-live="polite">
          <i />
          <i />
          <span>Loading…</span>
        </section>
      ) : (
        <div className="lists-workspace">
          <aside className="lists-sidebar">
            <label className="lists-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search lists"
                aria-label="Search lists and items"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>
              ) : null}
            </label>

            {activeLists.length ? (
              <label className="lists-mobile-select">
                <span>Current list</span>
                <select
                  value={selectedList?.id ?? ""}
                  onChange={(event) => setSelectedListId(Number(event.target.value))}
                >
                  {activeLists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <nav className="list-navigation" aria-label="Current lists">
              {filteredLists.map((list) => {
                const checkedCount = list.items.filter((item) => item.checked).length;
                return (
                  <button
                    type="button"
                    key={list.id}
                    className={selectedList?.id === list.id ? "is-selected" : ""}
                    onClick={() => setSelectedListId(list.id)}
                    aria-current={selectedList?.id === list.id ? "page" : undefined}
                  >
                    <span>{list.name}</span>
                    <small>{checkedCount}/{list.items.length}</small>
                  </button>
                );
              })}
              {activeLists.length && !filteredLists.length ? (
                <div className="no-list-results">
                  <span>No matches</span>
                  <button type="button" onClick={() => setQuery("")}>Clear search</button>
                </div>
              ) : null}
            </nav>

            {completedLists.length ? (
              <section className="completed-lists">
                <button
                  type="button"
                  className="completed-lists-toggle"
                  onClick={() => setShowCompleted((current) => !current)}
                  aria-expanded={showCompleted}
                >
                  <span>Completed</span>
                  <small>{completedLists.length}</small>
                </button>
                {showCompleted ? (
                  <ul>
                    {completedLists.map((list) => (
                      <li key={list.id}>
                        <span title={list.name}>{list.name}</span>
                        <div>
                          <button type="button" onClick={() => prepareListCopy(list)}>Use</button>
                          <button
                            type="button"
                            onClick={() => void setListCompleted(list, false)}
                            disabled={pendingAction === actionKey("reopen", list.id)}
                          >
                            {pendingAction === actionKey("reopen", list.id) ? "…" : "Reopen"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </aside>

          {selectedList ? (
            <article className="list-detail">
              <header className="list-detail-header">
                <div className="list-title-row">
                  <div className="list-title">
                    {editingListId === selectedList.id ? (
                      <input
                        className="list-name-input"
                        aria-label="List name"
                        value={renameDrafts[selectedList.id] ?? selectedList.name}
                        onChange={(event) =>
                          setRenameDrafts((current) => ({
                            ...current,
                            [selectedList.id]: event.target.value,
                          }))
                        }
                        onBlur={() => void renameList(selectedList)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            setRenameDrafts((current) => ({
                              ...current,
                              [selectedList.id]: selectedList.name,
                            }));
                            setEditingListId(null);
                          }
                        }}
                        autoFocus
                        maxLength={120}
                      />
                    ) : (
                      <h2>{selectedList.name}</h2>
                    )}
                    <p>
                      {selectedList.items.length
                        ? `${selectedCheckedCount} of ${selectedList.items.length} checked`
                        : "No items"}
                    </p>
                  </div>
                  <div className="list-header-actions">
                    <button
                      type="button"
                      className="rename-list-button"
                      onClick={() => setEditingListId(selectedList.id)}
                    >
                      Rename
                    </button>
                    <details className="list-actions-menu">
                      <summary aria-label={`More actions for ${selectedList.name}`}>More</summary>
                      <div>
                        <button
                          type="button"
                          onClick={() => void updateList(selectedList.id, "reset")}
                          disabled={selectedCheckedCount === 0 || pendingAction === actionKey("reset", selectedList.id)}
                        >
                          Use again
                        </button>
                        <button type="button" onClick={() => prepareListCopy(selectedList)}>
                          Make a copy
                        </button>
                        {selectedCheckedCount ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ kind: "clear", listId: selectedList.id })}
                          >
                            Remove checked items
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void setListCompleted(selectedList, true)}
                          disabled={pendingAction === actionKey("complete", selectedList.id)}
                        >
                          {pendingAction === actionKey("complete", selectedList.id) ? "Completing…" : "Complete list"}
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => setConfirmAction({ kind: "delete", listId: selectedList.id })}
                        >
                          Delete list
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
                <div
                  className="list-progress"
                  role="progressbar"
                  aria-label={`${selectedList.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={selectedList.items.length}
                  aria-valuenow={selectedCheckedCount}
                >
                  <i style={{ width: `${selectedProgress}%` }} />
                </div>
              </header>

              <div className="list-item-toolbar">
                <span>Items</span>
                <label>
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(event) => setHideCompleted(event.target.checked)}
                  />
                  Hide checked
                </label>
              </div>

              {visibleSelectedItems.length ? (
                <ul className="list-items">
                  {visibleSelectedItems.map((item) => (
                    <li key={item.id} className={item.checked ? "is-checked" : ""}>
                      <div className="list-item-main">
                        <input
                          id={`list-${selectedList.id}-item-${item.id}`}
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => void toggleItem(selectedList.id, item)}
                          aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.title}`}
                        />
                        {editingItemId === item.id ? (
                          <input
                            className="list-item-edit"
                            value={itemEditDraft}
                            onChange={(event) => setItemEditDraft(event.target.value)}
                            onBlur={() => void saveItem(selectedList.id, item)}
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
                            htmlFor={`list-${selectedList.id}-item-${item.id}`}
                            onDoubleClick={() => startEditingItem(item)}
                          >
                            {item.title}
                          </label>
                        )}
                      </div>
                      <div className="list-item-actions">
                        <button
                          type="button"
                          className={`add-to-wishlist-button${
                            wishlistItemIds.has(item.id) ? " is-added" : ""
                          }`}
                          onClick={() => void addToWishlist(selectedList, item)}
                          disabled={
                            wishlistItemIds.has(item.id) ||
                            pendingAction === actionKey("wishlist", selectedList.id, item.id)
                          }
                        >
                          {pendingAction === actionKey("wishlist", selectedList.id, item.id)
                            ? "Adding…"
                            : wishlistItemIds.has(item.id)
                              ? "In wishlist"
                              : "Add to wishlist"}
                        </button>
                        {editingItemId !== item.id ? (
                          <button
                            type="button"
                            className="item-icon-button"
                            onClick={() => startEditingItem(item)}
                            aria-label={`Edit ${item.title}`}
                            title="Edit item"
                          >
                            ✎
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="item-icon-button remove-item-button"
                          onClick={() => void removeItem(selectedList.id, item.id)}
                          aria-label={`Remove ${item.title}`}
                          title="Remove item"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="list-items-empty">
                  {selectedList.items.length && hideCompleted ? "All items are checked." : "No items yet."}
                </p>
              )}

              <form
                className="new-item-form"
                onSubmit={(event) => void addItem(event, selectedList.id)}
              >
                <input
                  value={itemDrafts[selectedList.id] ?? ""}
                  onChange={(event) =>
                    setItemDrafts((current) => ({
                      ...current,
                      [selectedList.id]: event.target.value,
                    }))
                  }
                  placeholder="Add an item"
                  aria-label={`Add item to ${selectedList.name}`}
                  maxLength={200}
                />
                <button
                  type="submit"
                  disabled={
                    !itemDrafts[selectedList.id]?.trim() ||
                    pendingAction === actionKey("add", selectedList.id)
                  }
                >
                  {pendingAction === actionKey("add", selectedList.id) ? "Adding…" : "Add"}
                </button>
              </form>

              {confirmAction?.listId === selectedList.id ? (
                <div className="list-confirm" role="alertdialog" aria-modal="true">
                  <p>
                    {confirmAction.kind === "delete"
                      ? `Delete “${selectedList.name}” and all its items?`
                      : `Remove ${selectedCheckedCount} checked ${
                          selectedCheckedCount === 1 ? "item" : "items"
                        }?`}
                  </p>
                  <div>
                    <button type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        confirmAction.kind === "delete"
                          ? void deleteList(selectedList.id)
                          : void updateList(selectedList.id, "clear")
                      }
                    >
                      {pendingAction
                        ? "Working…"
                        : confirmAction.kind === "delete"
                          ? "Delete list"
                          : "Remove items"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ) : (
            <section className="lists-empty">
              <h2>No current lists</h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(true);
                  requestAnimationFrame(() => newListInputRef.current?.focus());
                }}
              >
                Create list
              </button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
