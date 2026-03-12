"use client";

import { useState } from "react";

import { toggleCheckedChecklistIndex } from "@/lib/cookbook";

export function SharedChecklist({
  ingredients,
  recipeId,
}: {
  ingredients: string[];
  recipeId: number;
}) {
  const [checkedIngredientIndexes, setCheckedIngredientIndexes] = useState<number[]>([]);

  function toggleChecked(index: number) {
    setCheckedIngredientIndexes((current) => toggleCheckedChecklistIndex(current, index));
  }

  return (
    <ul className="checklist">
      {ingredients.map((ingredient, index) => {
        const isChecked = checkedIngredientIndexes.includes(index);
        return (
          <li
            key={`${recipeId}-${index}`}
            className={isChecked ? "checked" : ""}
            onClick={() => toggleChecked(index)}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                toggleChecked(index);
              }}
              aria-label={`Mark ${ingredient} as checked`}
            />
            <span className="ingredient-text">{ingredient}</span>
          </li>
        );
      })}
    </ul>
  );
}
