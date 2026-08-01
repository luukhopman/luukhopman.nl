import { describe, expect, it } from "vitest";

import { normalizeRecipeParser, toggleCheckedChecklistIndex } from "@/lib/cookbook";

describe("cookbook checklist state", () => {
  it("tracks duplicate ingredient rows independently by index", () => {
    const ingredients = ["1 egg", "1 egg", "Salt"];

    let checkedIndexes = toggleCheckedChecklistIndex([], 0);
    expect(ingredients.map((_, index) => checkedIndexes.includes(index))).toEqual([true, false, false]);

    checkedIndexes = toggleCheckedChecklistIndex(checkedIndexes, 1);
    expect(ingredients.map((_, index) => checkedIndexes.includes(index))).toEqual([true, true, false]);

    checkedIndexes = toggleCheckedChecklistIndex(checkedIndexes, 0);
    expect(ingredients.map((_, index) => checkedIndexes.includes(index))).toEqual([false, true, false]);
  });
});

describe("recipe parser selection", () => {
  it("normalizes supported parser choices and defaults unknown values to automatic", () => {
    expect(normalizeRecipeParser("gemini")).toBe("gemini");
    expect(normalizeRecipeParser("OPENAI")).toBe("openai");
    expect(normalizeRecipeParser("page-data")).toBe("auto");
    expect(normalizeRecipeParser(null)).toBe("auto");
  });
});
