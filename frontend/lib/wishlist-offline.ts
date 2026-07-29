import type { Product } from "./types";

export const WISHLIST_CACHE_KEY = "wishlistCachedProducts";
export const WISHLIST_QUEUE_KEY = "wishlistOfflineQueueV1";

type AddPayload = {
  name: string;
  store: string | null;
  url: string | null;
};

type PatchPayload = Partial<
  Pick<Product, "name" | "store" | "url" | "acquired" | "is_deleted">
>;

type OperationBase = {
  id: string;
  createdAt: string;
};

export type WishlistOfflineOperation =
  | (OperationBase & {
      kind: "add";
      tempId: number;
      clientId: string;
      payload: AddPayload;
    })
  | (OperationBase & {
      kind: "patch";
      productId: number;
      payload: PatchPayload;
    })
  | (OperationBase & {
      kind: "delete";
      productId: number;
      hard: boolean;
    })
  | (OperationBase & {
      kind: "rename-store";
      oldStore: string | null;
      newStore: string | null;
    })
  | (OperationBase & {
      kind: "reorder";
      productIds: number[];
    });

export type WishlistReplayResult = {
  completed: number;
  remaining: WishlistOfflineOperation[];
  unauthorized: boolean;
};

function isOperation(value: unknown): value is WishlistOfflineOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<WishlistOfflineOperation>;
  return (
    typeof operation.id === "string" &&
    typeof operation.createdAt === "string" &&
    ["add", "patch", "delete", "rename-store", "reorder"].includes(
      String(operation.kind),
    )
  );
}

export function readWishlistQueue(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(WISHLIST_QUEUE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isOperation) : [];
  } catch {
    return [];
  }
}

export function writeWishlistQueue(
  operations: WishlistOfflineOperation[],
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(WISHLIST_QUEUE_KEY, JSON.stringify(operations));
}

export function createOperationBase() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function createOfflineProduct(
  tempId: number,
  payload: AddPayload,
  products: Product[],
): Product {
  const store = payload.store?.trim() || null;
  const storeProducts = products.filter(
    (product) => (product.store?.trim() || null) === store,
  );
  const firstOrder = storeProducts.length
    ? Math.min(...storeProducts.map((product) => product.sort_order))
    : 0;

  return {
    id: tempId,
    name: payload.name,
    store,
    url: payload.url,
    acquired: false,
    is_deleted: false,
    acquired_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    sort_order: firstOrder - 1,
  };
}

function remapOperations(
  operations: WishlistOfflineOperation[],
  tempIds: ReadonlyMap<number, number>,
): WishlistOfflineOperation[] {
  return operations.map((operation) => {
    if (operation.kind === "patch" || operation.kind === "delete") {
      return {
        ...operation,
        productId: tempIds.get(operation.productId) ?? operation.productId,
      };
    }
    if (operation.kind === "reorder") {
      return {
        ...operation,
        productIds: operation.productIds.map(
          (productId) => tempIds.get(productId) ?? productId,
        ),
      };
    }
    return operation;
  });
}

export async function replayWishlistQueue(
  operations: WishlistOfflineOperation[],
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  onProgress?: (remaining: WishlistOfflineOperation[]) => void,
): Promise<WishlistReplayResult> {
  const tempIds = new Map<number, number>();
  let completed = 0;

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    try {
      let response: Response;
      if (operation.kind === "add") {
        response = await request("/api/wishlist/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...operation.payload,
            offline_client_id: operation.clientId,
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { id?: number };
          if (!Number.isInteger(payload.id)) throw new Error("Missing product id");
          tempIds.set(operation.tempId, Number(payload.id));
        }
      } else if (operation.kind === "patch") {
        const productId = tempIds.get(operation.productId) ?? operation.productId;
        response = await request(`/api/wishlist/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(operation.payload),
        });
      } else if (operation.kind === "delete") {
        const productId = tempIds.get(operation.productId) ?? operation.productId;
        response = await request(
          `/api/wishlist/products/${productId}${operation.hard ? "?hard=true" : ""}`,
          { method: "DELETE" },
        );
      } else if (operation.kind === "rename-store") {
        response = await request("/api/wishlist/products/rename-store", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_store: operation.oldStore,
            new_store: operation.newStore,
          }),
        });
      } else {
        response = await request("/api/wishlist/products/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productIds: operation.productIds.map(
              (productId) => tempIds.get(productId) ?? productId,
            ),
          }),
        });
      }

      const idempotentNotFound =
        response.status === 404 &&
        (operation.kind === "delete" || operation.kind === "rename-store");
      if (!response.ok && !idempotentNotFound) {
        return {
          completed,
          remaining: remapOperations(operations.slice(index), tempIds),
          unauthorized: response.status === 401,
        };
      }

      completed += 1;
      onProgress?.(remapOperations(operations.slice(index + 1), tempIds));
    } catch {
      return {
        completed,
        remaining: remapOperations(operations.slice(index), tempIds),
        unauthorized: false,
      };
    }
  }

  return { completed, remaining: [], unauthorized: false };
}
