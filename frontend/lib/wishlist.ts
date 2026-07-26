import type { Product } from "./types";

export type WishlistFilter = "all" | "pending" | "acquired" | "deleted";

export function isProductVisibleInFilter(
  product: Product,
  filter: WishlistFilter,
  recentlyAcquiredIds: readonly number[] = [],
): boolean {
  if (filter === "deleted") {
    return product.is_deleted;
  }

  if (product.is_deleted) {
    return false;
  }

  if (filter === "pending") {
    return !product.acquired || recentlyAcquiredIds.includes(product.id);
  }

  if (filter === "acquired") {
    return product.acquired;
  }

  return true;
}

export function applyPendingAcquiredStates(
  serverProducts: Product[],
  currentProducts: Product[],
  pendingAcquired: ReadonlyMap<number, boolean>,
): Product[] {
  if (pendingAcquired.size === 0) {
    return serverProducts;
  }

  const currentById = new Map(currentProducts.map((product) => [product.id, product]));

  return serverProducts.map((product) => {
    const acquired = pendingAcquired.get(product.id);
    if (acquired === undefined) {
      return product;
    }

    const current = currentById.get(product.id);
    return {
      ...product,
      acquired,
      acquired_at: acquired ? current?.acquired_at ?? product.acquired_at : null,
    };
  });
}
