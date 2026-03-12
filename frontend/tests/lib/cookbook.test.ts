import { describe, expect, it } from "vitest";

import { toggleCheckedChecklistIndex } from "@/lib/cookbook";

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
