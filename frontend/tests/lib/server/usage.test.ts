import { describe, expect, it } from "vitest";

import {
  getClientAddress,
  hashClientAddress,
  normalizeUsagePath,
} from "@/lib/server/usage";

describe("usage tracking helpers", () => {
  it("normalizes private and dynamic paths", () => {
    expect(normalizeUsagePath("/meal-planner?from=home")).toBe("/meal-planner");
    expect(normalizeUsagePath("/recipes/secret-share-token")).toBe("/recipes/[shareToken]");
    expect(normalizeUsagePath("/admin")).toBeNull();
    expect(normalizeUsagePath("/api/usage")).toBeNull();
    expect(normalizeUsagePath("https://example.com/meal-planner")).toBeNull();
  });

  it("hashes the address without storing or returning it", () => {
    const address = "203.0.113.10";
    const hash = hashClientAddress(address, "test-salt");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(address);
    expect(hash).toBe(hashClientAddress(address, "test-salt"));
    expect(hash).not.toBe(hashClientAddress(address, "other-salt"));
  });

  it("uses the trusted reverse-proxy address headers", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.7, 203.0.113.1",
      },
    });

    expect(getClientAddress(request)).toBe("203.0.113.10");
  });
});
