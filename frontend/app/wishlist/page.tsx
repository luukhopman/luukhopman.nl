"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { AutocompleteInput } from "../../components/autocomplete-input";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { triggerHaptic, useLockedBody } from "../../lib/browser";
import { timeAgo } from "../../lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "../../lib/http";
import type { Product } from "../../lib/types";
import {
  applyPendingAcquiredStates,
  isProductVisibleInFilter,
  isTimestampWithinDays,
  moveProductRelativeToTarget,
  type WishlistFilter,
} from "../../lib/wishlist";
import {
  createOfflineProduct,
  createOperationBase,
  readWishlistQueue,
  replayWishlistQueue,
  WISHLIST_CACHE_KEY,
  writeWishlistQueue,
  type WishlistOfflineOperation,
} from "../../lib/wishlist-offline";

const API_URL = "/api/wishlist/products";
const REORDER_URL = `${API_URL}/reorder`;
const REALTIME_URL = "/api/realtime/wishlist";
const REQUEST_TIMEOUT_MS = 12_000;
const ACQUIRED_UNDO_WINDOW_MS = 7_000;
const RECENT_HISTORY_DAYS = 30;

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
    const cached = JSON.parse(localStorage.getItem(WISHLIST_CACHE_KEY) || "[]") as unknown;
    return Array.isArray(cached) ? (cached as Product[]) : [];
  } catch {
    return [];
  }
}

function normalizeStoreName(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function shouldQueueAfterError(error: unknown) {
  return (
    !navigator.onLine ||
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export default function WishlistPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<WishlistFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [store, setStore] = useState("");
  const [url, setUrl] = useState("");
  const [showAddDetails, setShowAddDetails] = useState(false);
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
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [pendingAcquiredIds, setPendingAcquiredIds] = useState<number[]>([]);
  const [recentlyAcquiredIds, setRecentlyAcquiredIds] = useState<number[]>([]);
  const [itemActions, setItemActions] = useState<Product | null>(null);
  const [draggingProductId, setDraggingProductId] = useState<number | null>(null);
  const pendingAcquiredRef = useRef(new Map<number, boolean>());
  const acquiredUndoTimersRef = useRef(new Map<number, number>());
  const latestProductsRequestRef = useRef(0);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const productsRef = useRef<Product[]>([]);
  const dragStateRef = useRef<{
    productId: number;
    storeName: string;
    originalProducts: Product[];
  } | null>(null);
  const cacheReadyRef = useRef(false);
  const syncingRef = useRef(false);

  useLockedBody(Boolean(editing || renamingStore || confirmState || itemActions));
  const queueChangesLocally = !isOnline || pendingSyncCount > 0 || syncing;

  useEffect(() => {
    productsRef.current = products;
    if (cacheReadyRef.current) {
      localStorage.setItem(WISHLIST_CACHE_KEY, JSON.stringify(products));
    }
  }, [products]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let active = true;
    navigator.serviceWorker
      .register("/wishlist-sw.js", { scope: "/wishlist" })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (!active) return;
        if (navigator.storage?.persist) {
          void navigator.storage.persist();
        }
        const urls = performance
          .getEntriesByType("resource")
          .filter((entry) =>
            ["script", "link", "css", "img"].includes(
              (entry as PerformanceResourceTiming).initiatorType,
            ),
          )
          .map((entry) => entry.name)
          .filter((url) => {
            try {
              const parsed = new URL(url);
              return ["http:", "https:"].includes(parsed.protocol);
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({ type: "WARM_WISHLIST_CACHE", urls });
      })
      .catch((error) => console.error("Offline wishlist setup failed:", error));

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      acquiredUndoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      acquiredUndoTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    function closeOpenMenus(event: PointerEvent) {
      const target = event.target as HTMLElement;
      document.querySelectorAll<HTMLDetailsElement>(".action-menu[open]").forEach((menu) => {
        if (!menu.contains(target)) {
          menu.removeAttribute("open");
        }
      });
    }

    function closeOpenMenusWithKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(".action-menu[open]").forEach((menu) => {
        menu.removeAttribute("open");
      });
      setItemActions(null);
    }

    document.addEventListener("pointerdown", closeOpenMenus);
    document.addEventListener("keydown", closeOpenMenusWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOpenMenus);
      document.removeEventListener("keydown", closeOpenMenusWithKeyboard);
    };
  }, []);

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
      void syncOfflineChanges();
    };

    const cachedProducts = readCachedProducts();
    const queuedOperations = readWishlistQueue();
    setPendingSyncCount(queuedOperations.length);
    setIsOnline(navigator.onLine);
    setProducts(cachedProducts);
    cacheReadyRef.current = true;
    if (navigator.onLine && queuedOperations.length > 0) {
      setLoading(false);
      void syncOfflineChanges();
    } else if (navigator.onLine) {
      if (cachedProducts.length > 0) {
        setLoading(false);
        void fetchProducts(true);
      } else {
        void fetchProducts();
      }
    } else {
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
    if (readWishlistQueue().length > 0) {
      if (!silent) setLoading(false);
      return;
    }
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
      localStorage.setItem(WISHLIST_CACHE_KEY, JSON.stringify(nextProducts));

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

  function queueOfflineOperation(operation: WishlistOfflineOperation) {
    const nextQueue = [...readWishlistQueue(), operation];
    writeWishlistQueue(nextQueue);
    setPendingSyncCount(nextQueue.length);
  }

  async function syncOfflineChanges() {
    if (!navigator.onLine || syncingRef.current) return;
    const operations = readWishlistQueue();
    if (operations.length === 0) {
      setPendingSyncCount(0);
      await fetchProducts(true);
      return;
    }

    syncingRef.current = true;
    setSyncing(true);
    setConnectionError(null);
    const replayedIds = new Set(operations.map((operation) => operation.id));
    const mergeNewOperations = (remaining: WishlistOfflineOperation[]) => [
      ...remaining,
      ...readWishlistQueue().filter((operation) => !replayedIds.has(operation.id)),
    ];
    const result = await replayWishlistQueue(
      operations,
      async (input, init) => {
        try {
          return await apiFetch(input, init);
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return new Response(null, { status: 401 });
          }
          throw error;
        }
      },
      (remaining) => {
        const nextQueue = mergeNewOperations(remaining);
        writeWishlistQueue(nextQueue);
        setPendingSyncCount(nextQueue.length);
      },
    );

    const nextQueue = mergeNewOperations(result.remaining);
    writeWishlistQueue(nextQueue);
    setPendingSyncCount(nextQueue.length);
    syncingRef.current = false;
    setSyncing(false);

    if (result.unauthorized) {
      redirectToLogin("/wishlist");
      return;
    }
    if (result.remaining.length > 0) {
      setConnectionError(
        `${result.remaining.length} offline ${
          result.remaining.length === 1 ? "change is" : "changes are"
        } still waiting to sync.`,
      );
      return;
    }
    if (nextQueue.length > 0) {
      void syncOfflineChanges();
      return;
    }

    await fetchProducts(true);
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
        .filter((product) =>
          isTimestampWithinDays(product.created_at, RECENT_HISTORY_DAYS),
        )
        .map((product) => product.store?.trim() || "")
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  async function handleAddProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || submitting) return;

    const payload = {
      name: nextName,
      store: normalizeStoreName(store),
      url: url.trim() || null,
    };
    const base = createOperationBase();
    const tempId = Math.min(-1, ...products.map((product) => product.id)) - 1;
    const offlineOperation: WishlistOfflineOperation = {
      ...base,
      kind: "add",
      tempId,
      clientId: base.id,
      payload,
    };

    const saveOffline = () => {
      queueOfflineOperation(offlineOperation);
      setProducts((current) => [createOfflineProduct(tempId, payload, current), ...current]);
      setName("");
      setUrl("");
      setShowAddDetails(false);
      setConnectionError(null);
      triggerHaptic("success");
    };

    if (queueChangesLocally) {
      saveOffline();
      return;
    }

    setSubmitting(true);
    try {
      const response = await wishlistFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          offline_client_id: base.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to add product");

      setName("");
      setUrl("");
      setShowAddDetails(false);
      await fetchProducts();
      triggerHaptic("success");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      if (!navigator.onLine || error instanceof TypeError) {
        setIsOnline(navigator.onLine);
        saveOffline();
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
    if (!editing) return;

    const nextName = editName.trim();
    if (!nextName) return;
    const payload = {
      name: nextName,
      store: editStore.trim() || null,
      url: editUrl.trim() || null,
    };

    if (queueChangesLocally) {
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "patch",
        productId: editing.id,
        payload,
      });
      setProducts((current) =>
        current.map((product) =>
          product.id === editing.id ? { ...product, ...payload } : product,
        ),
      );
      setEditing(null);
      triggerHaptic("success");
      return;
    }

    try {
      const response = await wishlistFetch(`${API_URL}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      if (shouldQueueAfterError(error)) {
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "patch",
          productId: editing.id,
          payload,
        });
        setProducts((current) =>
          current.map((product) =>
            product.id === editing.id ? { ...product, ...payload } : product,
          ),
        );
        setEditing(null);
        setIsOnline(navigator.onLine);
        triggerHaptic("success");
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
    if (!renamingStore || renameSubmitting) return;

    const nextStore = renameValue.trim() || "Other Location";
    if (nextStore === renamingStore) {
      setRenamingStore(null);
      return;
    }

    if (queueChangesLocally) {
      const oldStore = renamingStore === "Other Location" ? null : renamingStore;
      const normalizedNewStore = nextStore === "Other Location" ? null : nextStore;
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "rename-store",
        oldStore,
        newStore: normalizedNewStore,
      });
      setProducts((current) =>
        current.map((product) =>
          normalizeStoreName(product.store) === oldStore
            ? { ...product, store: normalizedNewStore }
            : product,
        ),
      );
      syncStoreStateName(renamingStore, nextStore);
      setRenamingStore(null);
      triggerHaptic("success");
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
      if (shouldQueueAfterError(error)) {
        const oldStore = renamingStore === "Other Location" ? null : renamingStore;
        const normalizedNewStore = nextStore === "Other Location" ? null : nextStore;
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "rename-store",
          oldStore,
          newStore: normalizedNewStore,
        });
        setProducts((current) =>
          current.map((product) =>
            normalizeStoreName(product.store) === oldStore
              ? { ...product, store: normalizedNewStore }
              : product,
          ),
        );
        syncStoreStateName(renamingStore, nextStore);
        setRenamingStore(null);
        setIsOnline(navigator.onLine);
        triggerHaptic("success");
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
    if (pendingAcquiredRef.current.has(product.id)) return;

    const nextAcquired = !product.acquired;
    const existingUndoTimer = acquiredUndoTimersRef.current.get(product.id);
    if (existingUndoTimer) {
      window.clearTimeout(existingUndoTimer);
      acquiredUndoTimersRef.current.delete(product.id);
    }

    setRecentlyAcquiredIds((current) =>
      nextAcquired
        ? current.includes(product.id)
          ? current
          : [...current, product.id]
        : current.filter((id) => id !== product.id),
    );
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

    if (queueChangesLocally) {
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "patch",
        productId: product.id,
        payload: { acquired: nextAcquired },
      });
      if (nextAcquired) {
        const undoTimer = window.setTimeout(() => {
          acquiredUndoTimersRef.current.delete(product.id);
          setRecentlyAcquiredIds((current) => current.filter((id) => id !== product.id));
        }, ACQUIRED_UNDO_WINDOW_MS);
        acquiredUndoTimersRef.current.set(product.id, undoTimer);
      }
      return;
    }

    try {
      const response = await wishlistFetch(`${API_URL}/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acquired: nextAcquired }),
      });

      if (!response.ok) throw new Error("Failed to update status");
      await fetchProducts(true, { id: product.id, acquired: nextAcquired });
      if (nextAcquired) {
        const undoTimer = window.setTimeout(() => {
          acquiredUndoTimersRef.current.delete(product.id);
          setRecentlyAcquiredIds((current) =>
            current.filter((id) => id !== product.id),
          );
        }, ACQUIRED_UNDO_WINDOW_MS);
        acquiredUndoTimersRef.current.set(product.id, undoTimer);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      if (shouldQueueAfterError(error)) {
        if (pendingAcquiredRef.current.get(product.id) === nextAcquired) {
          pendingAcquiredRef.current.delete(product.id);
          setPendingAcquiredIds((current) => current.filter((id) => id !== product.id));
        }
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "patch",
          productId: product.id,
          payload: { acquired: nextAcquired },
        });
        setIsOnline(navigator.onLine);
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
      setRecentlyAcquiredIds((current) =>
        current.filter((id) => id !== product.id),
      );
      triggerHaptic("error");
      setConnectionError("That change was not saved. Check your connection and try again.");
    }
  }

  async function deleteProduct(product: Product, hardDelete: boolean) {
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

    if (queueChangesLocally) {
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "delete",
        productId: product.id,
        hard: hardDelete,
      });
      return;
    }

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
      if (shouldQueueAfterError(error)) {
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "delete",
          productId: product.id,
          hard: hardDelete,
        });
        setIsOnline(navigator.onLine);
        return;
      }
      console.error("Error deleting product:", error);
      setProducts(previous);
      triggerHaptic("error");
      setConnectionError("The item was not deleted. Check your connection and try again.");
    }
  }

  async function recoverProduct(product: Product) {
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

    if (queueChangesLocally) {
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "patch",
        productId: product.id,
        payload: { is_deleted: false, acquired: false },
      });
      triggerHaptic("tap");
      return;
    }

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
      if (shouldQueueAfterError(error)) {
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "patch",
          productId: product.id,
          payload: { is_deleted: false, acquired: false },
        });
        setIsOnline(navigator.onLine);
        return;
      }
      console.error("Error recovering product:", error);
      setProducts(previous);
      setConnectionError("The item was not recovered. Check your connection and try again.");
    }
  }

  function handleDragStart(
    event: ReactPointerEvent<HTMLButtonElement>,
    product: Product,
    storeName: string,
  ) {
    if (product.is_deleted) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      productId: product.id,
      storeName,
      originalProducts: productsRef.current,
    };
    setDraggingProductId(product.id);
    triggerHaptic("tap");
  }

  function handleDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-product-id]");
    const targetId = Number(target?.dataset.productId);
    const targetStore = target?.dataset.storeName;

    if (
      !target ||
      !Number.isInteger(targetId) ||
      targetId === dragState.productId ||
      targetStore !== dragState.storeName
    ) {
      return;
    }

    const targetBounds = target.getBoundingClientRect();
    const placeAfter = event.clientY > targetBounds.top + targetBounds.height / 2;
    setProducts((current) => {
      const next = moveProductRelativeToTarget(
        current,
        dragState.productId,
        targetId,
        placeAfter,
      );
      productsRef.current = next;
      return next;
    });
  }

  async function handleDragEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setDraggingProductId(null);

    const orderedIds = productsRef.current
      .filter(
        (product) =>
          !product.is_deleted &&
          (product.store?.trim() || "Other Location") === dragState.storeName,
      )
      .map((product) => product.id);

    const originalIds = dragState.originalProducts
      .filter(
        (product) =>
          !product.is_deleted &&
          (product.store?.trim() || "Other Location") === dragState.storeName,
      )
      .map((product) => product.id);

    if (orderedIds.join(",") === originalIds.join(",")) return;

    if (queueChangesLocally) {
      queueOfflineOperation({
        ...createOperationBase(),
        kind: "reorder",
        productIds: orderedIds,
      });
      triggerHaptic("success");
      return;
    }

    try {
      const response = await wishlistFetch(REORDER_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: orderedIds }),
      });
      if (!response.ok) throw new Error("Failed to reorder products");
      triggerHaptic("success");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/wishlist");
        return;
      }
      if (shouldQueueAfterError(error)) {
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "reorder",
          productIds: orderedIds,
        });
        setIsOnline(navigator.onLine);
        return;
      }
      console.error("Error reordering products:", error);
      setProducts(dragState.originalProducts);
      triggerHaptic("error");
      setConnectionError("The new item order was not saved. Please try again.");
    }
  }

  async function clearStoreProducts(storeName: string, itemsToDelete: Product[], hardDelete: boolean) {
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

    if (queueChangesLocally) {
      for (const id of ids) {
        queueOfflineOperation({
          ...createOperationBase(),
          kind: "delete",
          productId: id,
          hard: hardDelete,
        });
      }
      return;
    }

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
      if (shouldQueueAfterError(error)) {
        for (const id of ids) {
          queueOfflineOperation({
            ...createOperationBase(),
            kind: "delete",
            productId: id,
            hard: hardDelete,
          });
        }
        setIsOnline(navigator.onLine);
        return;
      }
      console.error("Error clearing store items:", error);
      setProducts(previous);
      setConnectionError("Those items were not cleared. Check your connection and try again.");
    }
  }

  const filteredProducts = products.filter(
    (product) =>
      isProductVisibleInFilter(product, filter) &&
      (!product.is_deleted ||
        isTimestampWithinDays(product.deleted_at, RECENT_HISTORY_DAYS)),
  );

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

  const activeProducts = products.filter((product) => !product.is_deleted);
  const filterCounts: Record<WishlistFilter, number> = {
    all: activeProducts.length,
    pending: activeProducts.filter((product) => !product.acquired).length,
    acquired: activeProducts.filter((product) => product.acquired).length,
    deleted: products.filter(
      (product) =>
        product.is_deleted &&
        isTimestampWithinDays(product.deleted_at, RECENT_HISTORY_DAYS),
    ).length,
  };

  function closeActionMenu(target: HTMLElement) {
    target.closest("details")?.removeAttribute("open");
  }

  function undoRecentlyAcquired(productId: number) {
    const product = products.find((entry) => entry.id === productId);
    if (!product?.acquired || pendingAcquiredRef.current.has(productId)) return;
    void toggleAcquired(product);
  }

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
            <i className="fa-solid fa-cloud" />
            <div>
              <strong>Offline mode</strong>
              <span>
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} ${
                      pendingSyncCount === 1 ? "change is" : "changes are"
                    } saved on this device and will sync automatically.`
                  : products.length > 0
                    ? "You can keep using the wishlist. Changes will sync when you reconnect."
                    : "No saved wishlist is available on this device yet."}
              </span>
            </div>
          </div>
        ) : syncing ? (
          <div className="connection-banner is-syncing" role="status" aria-live="polite">
            <i className="fa-solid fa-arrows-rotate fa-spin" />
            <div>
              <strong>Syncing changes</strong>
              <span>
                {pendingSyncCount} {pendingSyncCount === 1 ? "change" : "changes"} remaining
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
            <button
              type="button"
              onClick={() =>
                pendingSyncCount > 0 ? void syncOfflineChanges() : void fetchProducts()
              }
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className="add-product-section">
          <form id="add-product-form" className="glass-panel" onSubmit={handleAddProduct}>
            <div className="add-form-field">
              <label className="add-field-label" htmlFor="product-name">
                Item name
              </label>
              <div className="quick-add-row">
                <input
                  ref={productNameInputRef}
                  type="text"
                  id="product-name"
                  placeholder="What do we need?"
                  required
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <button
                  type="submit"
                  className="quick-add-submit"
                  disabled={submitting || !name.trim()}
                  aria-label={submitting ? "Adding item" : "Add item"}
                  title="Add item"
                >
                  <i
                    className={`fa-solid ${submitting ? "fa-spinner fa-spin" : "fa-plus"}`}
                  />
                </button>
              </div>
            </div>
            <div className="add-form-field">
              <div className="add-field-heading">
                <label className="add-field-label" htmlFor="product-store">
                  Store
                </label>
                <div className="add-form-tools">
                  <button
                    type="button"
                    className="add-details-toggle"
                    aria-expanded={showAddDetails}
                    aria-controls="add-product-details"
                    onClick={() => setShowAddDetails((current) => !current)}
                  >
                    <i
                      className={`fa-solid fa-chevron-${showAddDetails ? "up" : "down"}`}
                    />
                    {showAddDetails ? "Hide link" : "Add link"}
                  </button>
                </div>
              </div>
              <AutocompleteInput
                id="product-store"
                value={store}
                onChange={setStore}
                values={storeValues}
                className="input-group add-default-store"
                inputClassName=""
                iconClassName="fa-solid fa-tag input-icon"
                placeholder="Optional"
                clearLabel="Clear store"
              />
            </div>
            <div
              id="add-product-details"
              className={`row-group add-product-details ${showAddDetails ? "is-open" : ""}`}
            >
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
          </form>
        </section>

        <section className="products-section">
          <div className="filters">
            {([
              ["pending", "Need"],
              ["acquired", "Got"],
              ["deleted", "Deleted"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={`filter-btn filter-${value} ${filter === value ? "active" : ""}`}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                aria-label={`${label}, ${filterCounts[value]} items`}
              >
                {value === "deleted" ? (
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                ) : (
                  label
                )}
                {value !== "deleted" ? (
                  <span className="filter-count">{filterCounts[value]}</span>
                ) : null}
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
                        <span className="store-item-count" aria-label={`${itemsInStore.length} items`}>
                          {itemsInStore.length}
                        </span>
                      </div>
                      <div className="store-header-actions">
                        <button
                          className="quick-add-btn"
                          aria-label={`Add item to ${storeName}`}
                          onClick={() => {
                            setStore(storeName === "Other Location" ? "" : storeName);
                            setShowAddDetails(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                            window.setTimeout(() => productNameInputRef.current?.focus(), 350);
                          }}
                        >
                          <i className="fa-solid fa-plus" />
                        </button>
                        <details className="action-menu store-action-menu">
                          <summary aria-label={`More actions for ${storeName}`}>
                            <i className="fa-solid fa-ellipsis-vertical" />
                          </summary>
                          <div className="action-menu-popover">
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                togglePin(storeName);
                              }}
                            >
                              <i className="fa-solid fa-thumbtack" />
                              {isPinned ? "Unpin store" : "Pin store"}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                closeActionMenu(event.currentTarget);
                                openRenameStoreModal(storeName);
                              }}
                            >
                              <i className="fa-solid fa-pen-to-square" />
                              Rename store
                            </button>
                            {filter === "acquired" || filter === "deleted" ? (
                              <button
                                type="button"
                                className="danger-menu-action"
                                onClick={(event) => {
                                  closeActionMenu(event.currentTarget);
                                  setConfirmState({
                                    title:
                                      filter === "deleted" ? "Delete Forever?" : "Clear All?",
                                    message: `This will ${
                                      filter === "deleted" ? "permanently delete" : "clear"
                                    } all ${itemsInStore.length} ${filter} item${
                                      itemsInStore.length === 1 ? "" : "s"
                                    } from ${
                                      storeName === "Other Location"
                                        ? "this location"
                                        : storeName
                                    }.`,
                                    confirmLabel:
                                      filter === "deleted" ? "Delete" : "Clear All",
                                    onConfirm: () => {
                                      setConfirmState(null);
                                      void clearStoreProducts(
                                        storeName,
                                        itemsInStore,
                                        filter === "deleted",
                                      );
                                    },
                                  });
                                }}
                              >
                                <i className="fa-solid fa-eraser" />
                                {filter === "deleted" ? "Delete all forever" : "Clear acquired"}
                              </button>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </h2>

                    <ul className={`store-list ${isCollapsed ? "hidden" : ""}`}>
                      {itemsInStore.map((product) => {
                        let itemClass = "product-item";
                        if (product.is_deleted) itemClass += " deleted-item";
                        else if (product.acquired) itemClass += " acquired";
                        const isSavingAcquired = pendingAcquiredIds.includes(product.id);
                        if (isSavingAcquired) itemClass += " is-saving";
                        if (draggingProductId === product.id) itemClass += " is-dragging";

                        let displayUrl = product.url;
                        if (displayUrl) {
                          try {
                            displayUrl = new URL(displayUrl).hostname;
                          } catch {
                            // Keep original URL.
                          }
                        }

                        return (
                          <li
                            key={product.id}
                            className={itemClass}
                            data-product-id={product.id}
                            data-store-name={storeName}
                            onClick={(event) => {
                              if (
                                product.is_deleted ||
                                (event.target as HTMLElement).closest("button, a")
                              ) {
                                return;
                              }
                              void toggleAcquired(product);
                            }}
                          >
                            {!product.is_deleted ? (
                              <button
                                type="button"
                                className="drag-handle"
                                aria-label={`Drag to reorder ${product.name}`}
                                onPointerDown={(event) =>
                                  handleDragStart(event, product, storeName)
                                }
                                onPointerMove={handleDragMove}
                                onPointerUp={(event) => void handleDragEnd(event)}
                                onPointerCancel={(event) => void handleDragEnd(event)}
                              >
                                <i className="fa-solid fa-grip-vertical" />
                              </button>
                            ) : null}
                            {!product.is_deleted ? (
                              <div className="checkbox-container">
                                <button
                                  className="custom-checkbox"
                                  disabled={isSavingAcquired}
                                  title={isSavingAcquired ? "Saving change" : undefined}
                                  aria-busy={isSavingAcquired}
                                  aria-label={
                                    product.acquired ? "Mark as pending" : "Mark as acquired"
                                  }
                                  onClick={() => void toggleAcquired(product)}
                                >
                                  <i className="fa-solid fa-check" />
                                </button>
                              </div>
                            ) : null}
                            <div className="product-details">
                              <div className="product-header">
                                <h3 className="product-name">{product.name}</h3>
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
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="item-more-btn"
                                aria-label={`More actions for ${product.name}`}
                                onClick={() => setItemActions(product)}
                              >
                                <i className="fa-solid fa-ellipsis-vertical" />
                              </button>
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

      {itemActions ? (
        <div
          className="modal-overlay item-action-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setItemActions(null);
            }
          }}
        >
          <div
            className="item-action-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-actions-title"
          >
            <div className="item-action-sheet-header">
              <div>
                <span>Item options</span>
                <h2 id="item-actions-title">{itemActions.name}</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                aria-label="Close item options"
                onClick={() => setItemActions(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="item-action-sheet-buttons">
              {itemActions.url ? (
                <a
                  href={itemActions.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setItemActions(null)}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                  <span>
                    <strong>Open link</strong>
                    <small>View this item in a new tab</small>
                  </span>
                </a>
              ) : null}
              {itemActions.is_deleted ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const product = itemActions;
                      setItemActions(null);
                      void recoverProduct(product);
                    }}
                  >
                    <i className="fa-solid fa-rotate-left" />
                    <span>
                      <strong>Recover item</strong>
                      <small>Return it to the wishlist</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="danger-menu-action"
                    onClick={() => {
                      const product = itemActions;
                      setItemActions(null);
                      setConfirmState({
                        title: "Delete item forever?",
                        message: `"${product.name}" will be permanently removed.`,
                        confirmLabel: "Delete",
                        onConfirm: () => {
                          setConfirmState(null);
                          void deleteProduct(product, true);
                        },
                      });
                    }}
                  >
                    <i className="fa-solid fa-trash-can" />
                    <span>
                      <strong>Delete forever</strong>
                      <small>Permanently remove this item</small>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const product = itemActions;
                      setItemActions(null);
                      openEditModal(product);
                    }}
                  >
                    <i className="fa-solid fa-pen" />
                    <span>
                      <strong>Edit item</strong>
                      <small>Change its name, store, or link</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="danger-menu-action"
                    onClick={() => {
                      const product = itemActions;
                      setItemActions(null);
                      void deleteProduct(product, false);
                    }}
                  >
                    <i className="fa-solid fa-trash" />
                    <span>
                      <strong>Delete item</strong>
                      <small>Remove it from the wishlist</small>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
              <button type="submit" className="primary-btn">
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
                disabled={renameSubmitting}
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

      {recentlyAcquiredIds.length > 0 ? (
        <div className="undo-snackbar" role="status" aria-live="polite">
          <span>
            <i className="fa-solid fa-check" />{" "}
            {products.find(
              (product) => product.id === recentlyAcquiredIds[recentlyAcquiredIds.length - 1],
            )?.name || "Item"}{" "}
            marked as acquired
          </span>
          <button
            type="button"
            disabled={pendingAcquiredIds.includes(
              recentlyAcquiredIds[recentlyAcquiredIds.length - 1],
            )}
            onClick={() =>
              undoRecentlyAcquired(recentlyAcquiredIds[recentlyAcquiredIds.length - 1])
            }
          >
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}
