import { describe, expect, it, vi } from "vitest";

import {
  createOfflineProduct,
  replayWishlistQueue,
  type WishlistOfflineOperation,
} from "@/lib/wishlist-offline";

describe("wishlist offline support", () => {
  it("creates a temporary product at the top of its store", () => {
    const product = createOfflineProduct(
      -10,
      { name: "Coffee", store: "Market", url: null },
      [
        {
          id: 1,
          name: "Tea",
          store: "Market",
          url: null,
          acquired: false,
          is_deleted: false,
          acquired_at: null,
          deleted_at: null,
          created_at: "",
          sort_order: 4,
        },
      ],
    );

    expect(product.id).toBe(-10);
    expect(product.sort_order).toBe(3);
  });

  it("replays changes in order and maps temporary ids", async () => {
    const operations: WishlistOfflineOperation[] = [
      {
        id: "one",
        kind: "add",
        tempId: -10,
        clientId: "client-one",
        payload: { name: "Coffee", store: null, url: null },
        createdAt: "",
      },
      {
        id: "two",
        kind: "patch",
        productId: -10,
        payload: { acquired: true },
        createdAt: "",
      },
    ];
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42 }), { status: 201 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const progress = vi.fn();

    const result = await replayWishlistQueue(operations, request, progress);

    expect(result.remaining).toEqual([]);
    expect(request.mock.calls[1][0]).toBe("/api/wishlist/products/42");
    expect(progress).toHaveBeenLastCalledWith([]);
  });

  it("keeps the failed operation and everything after it", async () => {
    const operations: WishlistOfflineOperation[] = [
      {
        id: "one",
        kind: "patch",
        productId: 5,
        payload: { name: "Updated" },
        createdAt: "",
      },
      {
        id: "two",
        kind: "delete",
        productId: 6,
        hard: false,
        createdAt: "",
      },
    ];

    const result = await replayWishlistQueue(
      operations,
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );

    expect(result.completed).toBe(0);
    expect(result.remaining).toEqual(operations);
  });

  it("persists real ids after an offline addition has synced", async () => {
    const operations: WishlistOfflineOperation[] = [
      {
        id: "one",
        kind: "add",
        tempId: -3,
        clientId: "client-three",
        payload: { name: "Bread", store: null, url: null },
        createdAt: "",
      },
      {
        id: "two",
        kind: "patch",
        productId: -3,
        payload: { name: "Brown bread" },
        createdAt: "",
      },
    ];
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 77 }), { status: 201 }))
      .mockRejectedValueOnce(new TypeError("Offline"));
    const progress = vi.fn();

    const result = await replayWishlistQueue(operations, request, progress);

    expect(result.remaining[0]).toMatchObject({ kind: "patch", productId: 77 });
    expect(progress).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "patch", productId: 77 }),
    ]);
  });
});
