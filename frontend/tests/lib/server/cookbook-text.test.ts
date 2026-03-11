import { describe, expect, it } from "vitest";

import {
  convertUsToMetric,
  normalizeRecipePayload,
  normalizeRecipeText,
} from "@/lib/server/cookbook-text";

describe("cookbook text normalization", () => {
  it("normalizes whitespace and html entities", () => {
    expect(normalizeRecipeText("  Cr&egrave;me\u00a0brûlée \r\n\t ")).toBe("Crème brûlée");
  });

  it("converts common US units and temperatures to metric", () => {
    expect(convertUsToMetric("Bake at 350 F with 2 cups milk in a 9\" pan")).toBe(
      "Bake at 175 C with 480 ml milk in a 22.9 cm pan",
    );
  });

  it("normalizes payload text fields and only converts recipe body fields", () => {
    const payload = normalizeRecipePayload({
      title: "  Pancakes  ",
      ingredients: "1 cup milk",
      instructions: "Bake at 400 F",
      url: " https://example.com/recipe ",
    });

    expect(payload).toMatchObject({
      title: "Pancakes",
      ingredients: "240 ml milk",
      instructions: "Bake at 205 C",
      url: "https://example.com/recipe",
    });
  });
});
