"use client";

import { useState } from "react";

export function SharedChecklist({
    ingredients,
    recipeId,
}: {
    ingredients: string[];
    recipeId: number;
}) {
    const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);

    function toggleChecked(ingredient: string) {
        setCheckedIngredients((current) =>
            current.includes(ingredient)
                ? current.filter((i) => i !== ingredient)
                : [...current, ingredient]
        );
    }

    return (
        <ul className="checklist">
            {ingredients.map((ingredient) => {
                const isChecked = checkedIngredients.includes(ingredient);
                return (
                    <li
                        key={`${recipeId}-${ingredient}`}
                        className={isChecked ? "checked" : ""}
                        onClick={() => toggleChecked(ingredient)}
                    >
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                                e.stopPropagation();
                                toggleChecked(ingredient);
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
