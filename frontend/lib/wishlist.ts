import type { Product } from "./types";

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
