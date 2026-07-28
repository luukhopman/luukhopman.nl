import type { Product } from "./types";

export type WishlistFilter = "all" | "pending" | "acquired" | "deleted";

export function isTimestampWithinDays(
  value: string | null | undefined,
  days: number,
  now = Date.now(),
): boolean {
  if (!value || days < 0) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return timestamp >= now - days * 24 * 60 * 60 * 1000;
}

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

export function moveProductRelativeToTarget(
  products: Product[],
  sourceId: number,
  targetId: number,
  placeAfter: boolean,
): Product[] {
  const sourceIndex = products.findIndex((product) => product.id === sourceId);
  const targetIndex = products.findIndex((product) => product.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return products;
  }

  const next = [...products];
  const [source] = next.splice(sourceIndex, 1);
  const nextTargetIndex = next.findIndex((product) => product.id === targetId);
  next.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, source);
  return next;
}
