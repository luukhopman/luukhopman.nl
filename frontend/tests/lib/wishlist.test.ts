import { describe, expect, it } from "vitest";

import {
  applyPendingAcquiredStates,
  isProductVisibleInFilter,
} from "@/lib/wishlist";
import type { Product } from "@/lib/types";

function product(id: number, acquired = false): Product {
  return {
    id,
    name: `Item ${id}`,
    store: null,
    url: null,
    acquired,
    is_deleted: false,
    acquired_at: acquired ? "2026-07-23T06:00:00.000Z" : null,
    deleted_at: null,
    created_at: "2026-07-23T05:00:00.000Z",
  };
}

describe("applyPendingAcquiredStates", () => {
  it("keeps rapid optimistic checks when an older server snapshot arrives", () => {
    const serverProducts = [product(1), product(2), product(3)];
    const currentProducts = [
      { ...product(1), acquired: true, acquired_at: "2026-07-23T06:01:00.000Z" },
      { ...product(2), acquired: true, acquired_at: "2026-07-23T06:02:00.000Z" },
      product(3),
    ];

    const result = applyPendingAcquiredStates(
      serverProducts,
      currentProducts,
      new Map([
        [1, true],
        [2, true],
      ]),
    );

    expect(result.map(({ id, acquired }) => ({ id, acquired }))).toEqual([
      { id: 1, acquired: true },
      { id: 2, acquired: true },
      { id: 3, acquired: false },
    ]);
    expect(result[0].acquired_at).toBe("2026-07-23T06:01:00.000Z");
  });

  it("uses the server state for items that are no longer pending", () => {
    const result = applyPendingAcquiredStates(
      [product(1, true), product(2)],
      [product(1), { ...product(2), acquired: true }],
      new Map([[2, true]]),
    );

    expect(result[0].acquired).toBe(true);
    expect(result[1].acquired).toBe(true);
  });
});

describe("isProductVisibleInFilter", () => {
  it("keeps a newly acquired item in Pending during its undo window", () => {
    const acquiredProduct = product(1, true);

    expect(isProductVisibleInFilter(acquiredProduct, "pending")).toBe(false);
    expect(isProductVisibleInFilter(acquiredProduct, "pending", [1])).toBe(true);
  });

  it("does not expose deleted items outside the Deleted filter", () => {
    const deletedProduct = { ...product(1), is_deleted: true };

    expect(isProductVisibleInFilter(deletedProduct, "all", [1])).toBe(false);
    expect(isProductVisibleInFilter(deletedProduct, "pending", [1])).toBe(false);
    expect(isProductVisibleInFilter(deletedProduct, "deleted", [1])).toBe(true);
  });
});
