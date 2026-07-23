import { describe, expect, it } from "vitest";

import { applyPendingAcquiredStates } from "@/lib/wishlist";
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
