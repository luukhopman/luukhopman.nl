"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { AutocompleteInput } from "../../components/autocomplete-input";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { triggerHaptic, useLockedBody } from "../../lib/browser";
import { timeAgo } from "../../lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "../../lib/http";
import type { Product } from "../../lib/types";
import { applyPendingAcquiredStates } from "../../lib/wishlist";

const API_URL = "/api/wishlist/products";
const REALTIME_URL = "/api/realtime/wishlist";
const CACHE_KEY = "wishlistCachedProducts";
const REQUEST_TIMEOUT_MS = 12_000;

type Filter = "all" | "pending" | "acquired" | "deleted";

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

async function wishlistFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!navigator.onLine) {
    throw new TypeError("Offline");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const handleOffline = () => controller.abort();
  window.addEventListener("offline", handleOffline, { once: true });

  try {
    return await apiFetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    window.removeEventListener("offline", handleOffline);
  }
}

function readCachedProducts(): Product[] {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]") as unknown;
    return Array.isArray(cached) ? (cached as Product[]) : [];
  } catch {
    return [];
  }
}

function normalizeStoreName(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export default function WishlistPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [store, setStore] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editStore, setEditStore] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [renamingStore, setRenamingStore] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [pinnedStores, setPinnedStores] = useState<string[]>([]);
  const [collapsedStores, setCollapsedStores] = useState<string[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pendingAcquiredIds, setPendingAcquiredIds] = useState<number[]>([]);
  const pendingAcquiredRef = useRef(new Map<number, boolean>());
  const latestProductsRequestRef = useRef(0);

  useLockedBody(Boolean(editing || renamingStore || confirmState));

  useEffect(() => {
    try {
      setPinnedStores(JSON.parse(localStorage.getItem("wishlistPinnedStores") || "[]"));
      setCollapsedStores(
        JSON.parse(localStorage.getItem("wishlistCollapsedStores") || "[]"),
      );
    } catch (error) {
      console.error(error);
    }

    const handleOffline = () => {
      setIsOnline(false);
      setLoading(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionError(null);
      void fetchProducts(true);
    };

    const cachedProducts = readCachedProducts();
    setIsOnline(navigator.onLine);
    if (navigator.onLine) {
      if (cachedProducts.length > 0) {
        setProducts(cachedProducts);
        setLoading(false);
        void fetchProducts(true);
      } else {
        void fetchProducts();
      }
    } else {
      setProducts(cachedProducts);
      setLoading(false);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (!window.EventSource) {
      return () => {
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener("online", handleOnline);
      };
    }
    const source = new EventSource(REALTIME_URL);
    source.addEventListener("changed", () => {
      void fetchProducts(true);
    });
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      source.close();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("wishlistPinnedStores", JSON.stringify(pinnedStores));
  }, [pinnedStores]);

  useEffect(() => {
    localStorage.setItem("wishlistCollapsedStores", JSON.stringify(collapsedStores));
  }, [collapsedStores]);

  async function fetchProducts(
    silent = false,
    settledAcquired?: { id: number; acquired: boolean },
  ) {
    if (!navigator.onLine) {
      setIsOnline(false);
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setConnectionError(null);
    const requestId = ++latestProductsRequestRef.current;

    try {
      const response = await wishlistFetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch products");
      const nextProducts = (await response.json()) as Product[];
      localStorage.setItem(CACHE_KEY, JSON.stringify(nextProducts));

      if (requestId === latestProductsRequestRef.current) {
        setProducts((current) =>
          applyPendingAcquiredStates(
            nextProducts,
            current,
            pendingAcquiredRef.current,
          ),
        );
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error fetching products:", error);
      setConnectionError(
        navigator.onLine
          ? "Could not reach the wishlist. Your last saved list is still shown."
          : null,
      );
      setProducts((current) => (current.length > 0 ? current : readCachedProducts()));
    } finally {
      if (!silent) {
        setLoading(false);
      }
      if (
        settledAcquired &&
        pendingAcquiredRef.current.get(settledAcquired.id) === settledAcquired.acquired
      ) {
        pendingAcquiredRef.current.delete(settledAcquired.id);
        setPendingAcquiredIds((current) =>
          current.filter((id) => id !== settledAcquired.id),
        );
      }
    }
  }

  function syncStoreStateName(oldStore: string, newStore: string) {
    if (oldStore === newStore) return;

    const updateValues = (values: string[]) =>
      Array.from(
        new Set(
          values
            .map((value) => (value === oldStore ? newStore : value))
            .filter(Boolean),
        ),
      );

    setPinnedStores((current) => updateValues(current));
    setCollapsedStores((current) => updateValues(current));
  }

  function togglePin(nextStore: string) {
    setPinnedStores((current) =>
      current.includes(nextStore)
        ? current.filter((value) => value !== nextStore)
        : [...current, nextStore],
    );
  }

  function toggleCollapse(nextStore: string) {
    setCollapsedStores((current) =>
      current.includes(nextStore)
        ? current.filter((value) => value !== nextStore)
        : [...current, nextStore],
    );
  }

  const storeValues = Array.from(
    new Set(
      products
        .map((product) => product.store?.trim() || "")
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  async function handleAddProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || submitting || !isOnline) return;

    setSubmitting(true);

    try {
      const response = await wishlistFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          store: normalizeStoreName(store),
          url: url.trim() || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to add product");

      setName("");
      setStore("");
      setUrl("");
      await fetchProducts();
      triggerHaptic("success");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error adding product:", error);
      triggerHaptic("error");
      setConnectionError("The item was not added. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(product: Product) {
    setEditing(product);
    setEditName(product.name || "");
    setEditStore(product.store || "");
    setEditUrl(product.url || "");
  }

  async function handleEditProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !isOnline) return;

    const nextName = editName.trim();
    if (!nextName) return;

    try {
      const response = await wishlistFetch(`${API_URL}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          store: editStore.trim(),
          url: editUrl.trim(),
        }),
      });

      if (!response.ok) throw new Error("Failed to edit product");

      setEditing(null);
      await fetchProducts();
      triggerHaptic("success");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error editing product:", error);
      triggerHaptic("error");
      setConnectionError("The item was not updated. Check your connection and try again.");
    }
  }

  function openRenameStoreModal(nextStore: string) {
    setRenamingStore(nextStore);
    setRenameValue(nextStore === "Other Location" ? "" : nextStore);
  }

  async function handleRenameStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingStore || renameSubmitting || !isOnline) return;

    const nextStore = renameValue.trim() || "Other Location";
    if (nextStore === renamingStore) {
      setRenamingStore(null);
      return;
    }

    setRenameSubmitting(true);

    try {
      const response = await wishlistFetch(`${API_URL}/rename-store`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_store: renamingStore === "Other Location" ? null : renamingStore,
          new_store: nextStore === "Other Location" ? null : nextStore,
        }),
      });

      if (!response.ok) throw new Error("Failed to rename store");

      syncStoreStateName(renamingStore, nextStore);
      setRenamingStore(null);
      await fetchProducts();
      triggerHaptic("success");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error renaming store:", error);
      triggerHaptic("error");
      setConnectionError("The store was not renamed. Check your connection and try again.");
    } finally {
      setRenameSubmitting(false);
    }
  }

  async function toggleAcquired(product: Product) {
    if (!isOnline || pendingAcquiredRef.current.has(product.id)) return;

    const nextAcquired = !product.acquired;
    pendingAcquiredRef.current.set(product.id, nextAcquired);
    setPendingAcquiredIds((current) => [...current, product.id]);

    setProducts((current) =>
      current.map((entry) =>
        entry.id === product.id
          ? {
              ...entry,
              acquired: nextAcquired,
              acquired_at: nextAcquired ? new Date().toISOString() : null,
            }
          : entry,
      ),
    );
    triggerHaptic(nextAcquired ? "success" : "tap");

    try {
      const response = await wishlistFetch(`${API_URL}/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquired: nextAcquired }),
      });

      if (!response.ok) throw new Error("Failed to update status");
      await fetchProducts(true, { id: product.id, acquired: nextAcquired });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error updating product:", error);
      if (pendingAcquiredRef.current.get(product.id) === nextAcquired) {
        pendingAcquiredRef.current.delete(product.id);
        setPendingAcquiredIds((current) => current.filter((id) => id !== product.id));
        setProducts((current) =>
          current.map((entry) =>
            entry.id === product.id
              ? {
                  ...entry,
                  acquired: product.acquired,
                  acquired_at: product.acquired_at,
                }
              : entry,
          ),
        );
      }
      triggerHaptic("error");
      setConnectionError("That change was not saved. Check your connection and try again.");
    }
  }

  async function deleteProduct(product: Product, hardDelete: boolean) {
    if (!isOnline) return;

    const previous = products;

    if (hardDelete) {
      setProducts((current) => current.filter((entry) => entry.id !== product.id));
    } else {
      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id
            ? {
                ...entry,
                is_deleted: true,
                deleted_at: new Date().toISOString(),
              }
            : entry,
        ),
      );
    }
    triggerHaptic("delete");

    try {
      const response = await wishlistFetch(
        hardDelete ? `${API_URL}/${product.id}?hard=true` : `${API_URL}/${product.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) throw new Error("Failed to delete product");
      await fetchProducts(true);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error deleting product:", error);
      setProducts(previous);
      triggerHaptic("error");
      setConnectionError("The item was not deleted. Check your connection and try again.");
    }
  }

  async function recoverProduct(product: Product) {
    if (!isOnline) return;

    const previous = products;
    setProducts((current) =>
      current.map((entry) =>
        entry.id === product.id
          ? {
              ...entry,
              is_deleted: false,
              deleted_at: null,
              acquired: false,
              acquired_at: null,
            }
          : entry,
      ),
    );

    try {
      const response = await wishlistFetch(`${API_URL}/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_deleted: false, acquired: false }),
      });

      if (!response.ok) throw new Error("Failed to recover item");
      await fetchProducts(true);
      triggerHaptic("tap");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error recovering product:", error);
      setProducts(previous);
      setConnectionError("The item was not recovered. Check your connection and try again.");
    }
  }

  async function clearStoreProducts(storeName: string, itemsToDelete: Product[], hardDelete: boolean) {
    if (!isOnline) return;

    const previous = products;
    const ids = itemsToDelete.map((product) => product.id);

    if (hardDelete) {
      setProducts((current) => current.filter((entry) => !ids.includes(entry.id)));
    } else {
      const deletedAt = new Date().toISOString();
      setProducts((current) =>
        current.map((entry) =>
          ids.includes(entry.id)
            ? { ...entry, is_deleted: true, deleted_at: deletedAt }
            : entry,
        ),
      );
    }
    triggerHaptic("delete");

    try {
      const responses = await Promise.all(
        ids.map((id) =>
          wishlistFetch(hardDelete ? `${API_URL}/${id}?hard=true` : `${API_URL}/${id}`, {
            method: "DELETE",
          }),
        ),
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error(`Failed to clear items for ${storeName}`);
      }
      await fetchProducts(true);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      console.error("Error clearing store items:", error);
      setProducts(previous);
      setConnectionError("Those items were not cleared. Check your connection and try again.");
    }
  }

  const filteredProducts = products.filter((product) => {
    if (filter === "pending") return !product.acquired && !product.is_deleted;
    if (filter === "acquired") return product.acquired && !product.is_deleted;
    if (filter === "deleted") return product.is_deleted;
    return !product.is_deleted;
  });

  const groupedProducts = filteredProducts.reduce<Record<string, Product[]>>((acc, product) => {
    const groupStore = product.store?.trim() || "Other Location";
    if (!acc[groupStore]) {
      acc[groupStore] = [];
    }
    acc[groupStore].push(product);
    return acc;
  }, {});

  const sortedStores = Object.keys(groupedProducts).sort((a, b) => {
    const aPinned = pinnedStores.includes(a);
    const bPinned = pinnedStores.includes(b);

    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (a === "Other Location") return 1;
    if (b === "Other Location") return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <div className="app-container">
        <header>
          <h1>
            <i className="fa-solid fa-basket-shopping" /> Wishlist
          </h1>
        </header>

        {!isOnline ? (
          <div className="connection-banner is-offline" role="status" aria-live="polite">
            <i className="fa-solid fa-cloud-arrow-down" />
            <div>
              <strong>You’re offline</strong>
              <span>
                {products.length > 0
                  ? "Viewing your last saved list. Changes are available when you reconnect."
                  : "Reconnect to load and change your wishlist."}
              </span>
            </div>
          </div>
        ) : connectionError ? (
          <div className="connection-banner is-error" role="alert">
            <i className="fa-solid fa-triangle-exclamation" />
            <div>
              <strong>Connection problem</strong>
              <span>{connectionError}</span>
            </div>
            <button type="button" onClick={() => void fetchProducts()}>
              Retry
            </button>
          </div>
        ) : null}

        <section className="add-product-section">
          <form id="add-product-form" className="glass-panel" onSubmit={handleAddProduct}>
            <div className="input-group">
              <input
                type="text"
                id="product-name"
                placeholder="What do we need?"
                required
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="row-group">
              <AutocompleteInput
                value={store}
                onChange={setStore}
                values={storeValues}
                className="input-group"
                inputClassName=""
                iconClassName="fa-solid fa-tag input-icon"
                placeholder="Store (Optional)"
              />
              <div className="input-group">
                <i className="fa-solid fa-link input-icon" />
                <input
                  type="url"
                  id="product-url"
                  placeholder="Link (Optional)"
                  autoComplete="off"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="primary-btn"
              disabled={submitting || !isOnline}
              title={!isOnline ? "Reconnect to add an item" : undefined}
            >
              <i className={`fa-solid ${submitting ? "fa-spinner fa-spin" : "fa-plus"}`} />{" "}
              {submitting ? "Adding..." : isOnline ? "Add Item" : "Offline"}
            </button>
          </form>
        </section>

        <section className="products-section">
          <div className="filters">
            {([
              ["all", "All Items"],
              ["pending", "Pending"],
              ["acquired", "Acquired"],
              ["deleted", "Deleted"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={`filter-btn ${filter === value ? "active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`spinner-container ${loading ? "" : "hidden"}`}>
            <div className="spinner" />
          </div>

          <div className={`product-list-container ${loading ? "hidden" : ""}`}>
            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <i className="fa-regular fa-clipboard" />
                <p>
                  {filter === "all"
                    ? "Your list is empty. Add something you need!"
                    : `No ${filter} items found.`}
                </p>
              </div>
            ) : (
              sortedStores.map((storeName) => {
                const isPinned = pinnedStores.includes(storeName);
                const isCollapsed = collapsedStores.includes(storeName);
                const itemsInStore = groupedProducts[storeName];
                return (
                  <div key={storeName} className="group-container">
                    <h2 className="store-header">
                      <div
                        className="store-header-title"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleCollapse(storeName)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleCollapse(storeName);
                          }
                        }}
                      >
                        <i
                          className={`fa-solid fa-chevron-${
                            isCollapsed ? "right" : "down"
                          } fa-sm toggle-collapse-icon`}
                        />
                        <i className="fa-solid fa-tag fa-sm" />
                        <span className="store-header-name">{storeName}</span>
                      </div>
                      <div className="store-header-actions">
                        {filter === "acquired" || filter === "deleted" ? (
                          <button
                            className="clear-store-btn"
                            title="Clear All"
                            disabled={!isOnline}
                            onClick={() =>
                              setConfirmState({
                                title: filter === "deleted" ? "Delete Forever?" : "Clear All?",
                                message: `This will ${
                                  filter === "deleted" ? "permanently delete" : "clear"
                                } all ${itemsInStore.length} ${filter} item${
                                  itemsInStore.length === 1 ? "" : "s"
                                } from ${
                                  storeName === "Other Location" ? "this location" : storeName
                                }.`,
                                confirmLabel: filter === "deleted" ? "Delete" : "Clear All",
                                onConfirm: () => {
                                  setConfirmState(null);
                                  void clearStoreProducts(
                                    storeName,
                                    itemsInStore,
                                    filter === "deleted",
                                  );
                                },
                              })
                            }
                          >
                            <i className="fa-solid fa-eraser" />
                          </button>
                        ) : null}
                        <button
                          className="quick-add-btn"
                          title="Quick Add"
                          onClick={() => {
                            setStore(storeName === "Other Location" ? "" : storeName);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <i className="fa-solid fa-plus" />
                        </button>
                        <button
                          className="rename-store-btn"
                          title="Rename Store"
                          disabled={!isOnline}
                          onClick={() => openRenameStoreModal(storeName)}
                        >
                          <i className="fa-solid fa-pen-to-square" />
                        </button>
                        <button
                          className={`pin-btn ${isPinned ? "pinned" : ""}`}
                          onClick={() => togglePin(storeName)}
                        >
                          <i className="fa-solid fa-thumbtack" />
                        </button>
                      </div>
                    </h2>

                    <ul className={`store-list ${isCollapsed ? "hidden" : ""}`}>
                      {itemsInStore.map((product) => {
                        let itemClass = "product-item";
                        if (product.is_deleted) itemClass += " deleted-item";
                        else if (product.acquired) itemClass += " acquired";
                        const isSavingAcquired = pendingAcquiredIds.includes(product.id);
                        if (isSavingAcquired) itemClass += " is-saving";

                        let displayUrl = product.url;
                        if (displayUrl) {
                          try {
                            displayUrl = new URL(displayUrl).hostname;
                          } catch {
                            // Keep original URL.
                          }
                        }

                        return (
                          <li key={product.id} className={itemClass}>
                            <div className="checkbox-container">
                              <button
                                className="custom-checkbox"
                                disabled={!isOnline || isSavingAcquired}
                                title={
                                  !isOnline
                                    ? "Reconnect to update this item"
                                    : isSavingAcquired
                                      ? "Saving change"
                                      : undefined
                                }
                                aria-busy={isSavingAcquired}
                                aria-label={
                                  product.acquired ? "Mark as pending" : "Mark as acquired"
                                }
                                onClick={() => void toggleAcquired(product)}
                              >
                                <i className="fa-solid fa-check" />
                              </button>
                            </div>
                            <div className="product-details">
                              <div className="product-header">
                                <h3 className="product-name">{product.name}</h3>
                                <div className="action-buttons">
                                  {product.is_deleted ? (
                                    <>
                                      <button
                                        className="action-btn recover-btn"
                                        aria-label="Recover item"
                                        disabled={!isOnline}
                                        onClick={() => void recoverProduct(product)}
                                      >
                                        <i className="fa-solid fa-rotate-left" />
                                      </button>
                                      <button
                                        className="action-btn delete-btn"
                                        aria-label="Permanently delete item"
                                        disabled={!isOnline}
                                        onClick={() =>
                                          setConfirmState({
                                            title: "Delete item forever?",
                                            message: `"${product.name}" will be permanently removed.`,
                                            confirmLabel: "Delete",
                                            onConfirm: () => {
                                              setConfirmState(null);
                                              void deleteProduct(product, true);
                                            },
                                          })
                                        }
                                      >
                                        <i className="fa-solid fa-trash-can" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        className="action-btn edit-btn"
                                        aria-label="Edit item"
                                        disabled={!isOnline}
                                        onClick={() => openEditModal(product)}
                                      >
                                        <i className="fa-solid fa-pen" />
                                      </button>
                                      <button
                                        className="action-btn delete-btn"
                                        aria-label="Delete item"
                                        disabled={!isOnline}
                                        onClick={() => void deleteProduct(product, false)}
                                      >
                                        <i className="fa-solid fa-trash" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="product-meta">
                                {product.url ? (
                                  <span className="meta-item">
                                    <i className="fa-solid fa-link fa-sm" />
                                    <a
                                      href={product.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="meta-link"
                                    >
                                      {displayUrl}
                                    </a>
                                  </span>
                                ) : null}
                                {product.is_deleted && product.deleted_at ? (
                                  <span className="meta-item">
                                    <i className="fa-regular fa-clock fa-sm" /> Deleted{" "}
                                    {timeAgo(product.deleted_at)}
                                  </span>
                                ) : null}
                                {!product.is_deleted && product.acquired && product.acquired_at ? (
                                  <span className="meta-item">
                                    <i className="fa-regular fa-clock fa-sm" /> Acquired{" "}
                                    {timeAgo(product.acquired_at)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {editing ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h2>
                <i className="fa-solid fa-pen" /> Edit Item
              </h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setEditing(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form id="edit-product-form" onSubmit={handleEditProduct}>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Item name"
                  required
                  autoComplete="off"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </div>
              <div className="row-group">
                <AutocompleteInput
                  value={editStore}
                  onChange={setEditStore}
                  values={storeValues}
                  className="input-group"
                  inputClassName=""
                  iconClassName="fa-solid fa-tag input-icon"
                  placeholder="Store (Optional)"
                />
                <div className="input-group">
                  <i className="fa-solid fa-link input-icon" />
                  <input
                    type="url"
                    placeholder="Link (Optional)"
                    autoComplete="off"
                    value={editUrl}
                    onChange={(event) => setEditUrl(event.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="primary-btn" disabled={!isOnline}>
                <i className="fa-solid fa-save" /> Save Changes
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {renamingStore ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setRenamingStore(null);
            }
          }}
        >
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h2>
                <i className="fa-solid fa-store" /> Rename Store
              </h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setRenamingStore(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form id="rename-store-form" onSubmit={handleRenameStore}>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="New store name"
                  required
                  autoComplete="off"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
              </div>
              <p className="modal-help-text">
                This updates every wishlist item in that store.
              </p>
              <button
                type="submit"
                className="primary-btn"
                disabled={renameSubmitting || !isOnline}
              >
                <i
                  className={`fa-solid ${
                    renameSubmitting ? "fa-spinner fa-spin" : "fa-pen-to-square"
                  }`}
                />{" "}
                {renameSubmitting ? "Renaming..." : "Rename Store"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel={confirmState?.confirmLabel || "Delete"}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </>
  );
}
