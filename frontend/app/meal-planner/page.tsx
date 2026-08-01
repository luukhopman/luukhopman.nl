"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { todayIso } from "@/lib/format";
import { splitIngredients } from "@/lib/cookbook";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { ImportIngredientsResult, MealPlanEntry, MealType, Recipe } from "@/lib/types";

const API_URL = "/api/meal-planner";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

type MealIconName = "book" | "chevron-left" | "chevron-right" | "close" | "plus";

type ShoppingIngredient = {
  id: string;
  name: string;
};

function MealIcon({ name }: { name: MealIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "book" ? (
        <>
          <path d="M5.5 4.5h9A3.5 3.5 0 0 1 18 8v11H8.5a3 3 0 0 0-3 3V4.5Z" />
          <path d="M5.5 19h12.5" />
        </>
      ) : name === "chevron-left" ? (
        <path d="m14.5 6-6 6 6 6" />
      ) : name === "chevron-right" ? (
        <path d="m9.5 6 6 6-6 6" />
      ) : name === "close" ? (
        <>
          <path d="m7 7 10 10" />
          <path d="M17 7 7 17" />
        </>
      ) : (
        <>
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </>
      )}
    </svg>
  );
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return toIsoDate(date);
}

function startOfWeek(value: string) {
  const date = parseDate(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toIsoDate(date);
}

function formatDay(value: string) {
  return parseDate(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function dayParts(value: string) {
  const date = parseDate(value);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "long" }),
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

function formatWeek(start: string) {
  const end = addDays(start, 6);
  return `${parseDate(start).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${parseDate(end).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function mealName(entry: MealPlanEntry) {
  return entry.title || entry.recipe_title || "Untitled meal";
}

export default function MealPlannerPage() {
  const currentWeek = startOfWeek(todayIso());
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealDate, setMealDate] = useState(todayIso());
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [mealSource, setMealSource] = useState<"custom" | "recipe">("custom");
  const [recipeId, setRecipeId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [shoppingEntry, setShoppingEntry] = useState<MealPlanEntry | null>(null);
  const [wishlistStore, setWishlistStore] = useState("Meal plan");
  const [selectedShoppingIngredientIds, setSelectedShoppingIngredientIds] = useState<string[]>([]);
  const [shoppingSaving, setShoppingSaving] = useState(false);
  const [shoppingStatus, setShoppingStatus] = useState("");
  const [shoppingResultAdded, setShoppingResultAdded] = useState(false);
  const addPanelRef = useRef<HTMLElement>(null);
  const shoppingPanelRef = useRef<HTMLElement>(null);
  const mealNameInputRef = useRef<HTMLInputElement>(null);
  const recipeSelectRef = useRef<HTMLSelectElement>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const entriesByDay = useMemo(() => {
    const grouped = new Map<string, MealPlanEntry[]>();
    for (const entry of entries) {
      const current = grouped.get(entry.meal_date) ?? [];
      current.push(entry);
      grouped.set(entry.meal_date, current);
    }
    return grouped;
  }, [entries]);

  const sortedRecipes = useMemo(
    () => [...recipes].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    [recipes],
  );

  const recipesById = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  );
  const shoppingIngredients = useMemo<ShoppingIngredient[]>(
    () => {
      if (!shoppingEntry?.recipe_id) return [];
      const recipe = recipesById.get(shoppingEntry.recipe_id);
      return splitIngredients(recipe?.ingredients).map((name, index) => ({
        id: `${shoppingEntry.id}-${index}`,
        name,
      }));
    },
    [shoppingEntry, recipesById],
  );

  const loadWeek = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingWeek(true);
    try {
      const response = await apiFetch(`${API_URL}?start=${weekStart}`);
      if (!response.ok) throw new Error("Could not load this week");
      setEntries((await response.json()) as MealPlanEntry[]);
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/meal-planner");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load this week");
    } finally {
      if (showLoading) setLoadingWeek(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    async function loadRecipes() {
      try {
        const response = await apiFetch("/api/cookbook");
        if (!response.ok) throw new Error("Could not load recipes");
        setRecipes((await response.json()) as Recipe[]);
      } catch (caught) {
        if (caught instanceof UnauthorizedError) redirectToLogin("/meal-planner");
      }
    }
    void loadRecipes();
  }, []);

  function moveWeek(amount: number) {
    setShoppingEntry(null);
    const nextStart = addDays(weekStart, amount * 7);
    setLoadingWeek(true);
    setWeekStart(nextStart);
    setMealDate(nextStart);
  }

  function returnToToday() {
    setShoppingEntry(null);
    const today = todayIso();
    setLoadingWeek(true);
    setWeekStart(startOfWeek(today));
    setMealDate(today);
  }

  function openShoppingPanel(entry: MealPlanEntry) {
    const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : null;
    const ingredients = splitIngredients(recipe?.ingredients);
    if (!ingredients.length) return;

    setShoppingEntry(entry);
    setShoppingStatus("");
    setShoppingResultAdded(false);
    setWishlistStore(mealName(entry));
    setSelectedShoppingIngredientIds(ingredients.map((_, index) => `${entry.id}-${index}`));
    requestAnimationFrame(() => {
      shoppingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function closeShoppingPanel() {
    setShoppingEntry(null);
    setSelectedShoppingIngredientIds([]);
    setShoppingStatus("");
    setShoppingResultAdded(false);
  }

  async function addIngredientsToWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shoppingSaving || !shoppingEntry) return;
    const ingredients = shoppingIngredients
      .filter((ingredient) => selectedShoppingIngredientIds.includes(ingredient.id))
      .map((ingredient) => ingredient.name);
    const ingredientKeys = new Set<string>();
    const uniqueIngredients = ingredients.filter((ingredient) => {
      const key = ingredient.toLocaleLowerCase();
      if (ingredientKeys.has(key)) return false;
      ingredientKeys.add(key);
      return true;
    });
    if (!uniqueIngredients.length) {
      setShoppingStatus("Choose at least one ingredient first.");
      return;
    }

    setShoppingSaving(true);
    setShoppingStatus("");
    try {
      const store = wishlistStore.trim() || (shoppingEntry ? mealName(shoppingEntry) : "Meal plan");
      const response = await apiFetch("/api/cookbook/wishlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: uniqueIngredients,
          store,
          recipe_share_token: shoppingEntry.recipe_share_token,
          source_url: "/meal-planner",
        }),
      });
      if (!response.ok) throw new Error("Could not add ingredients to the wishlist");
      const { added, skipped } = (await response.json()) as ImportIngredientsResult;
      setShoppingResultAdded(true);
      setShoppingStatus(
        `Added ${added} ingredient${added === 1 ? "" : "s"} to Wishlist${
          skipped ? `, skipped ${skipped} already there` : ""
        }.`,
      );
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/meal-planner");
        return;
      }
      setShoppingStatus(caught instanceof Error ? caught.message : "Could not add ingredients to Wishlist");
    } finally {
      setShoppingSaving(false);
    }
  }

  function chooseDay(day: string, focus = false) {
    setMealDate(day);
    if (!focus) return;
    requestAnimationFrame(() => {
      addPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (mealSource === "recipe") recipeSelectRef.current?.focus();
      else mealNameInputRef.current?.focus();
    });
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasMeal = mealSource === "recipe" ? Boolean(recipeId) : Boolean(title.trim());
    if (!hasMeal || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_date: mealDate,
          meal_type: mealType,
          recipe_id: mealSource === "recipe" ? Number(recipeId) : null,
          title: mealSource === "custom" ? title.trim() : null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Could not add meal");
      }
      setRecipeId("");
      setTitle("");
      await loadWeek(false);
      if (mealSource === "custom") mealNameInputRef.current?.focus();
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/meal-planner");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not add meal");
    } finally {
      setSaving(false);
    }
  }

  async function removeMeal(entryId: number) {
    if (removingId !== null) return;
    if (shoppingEntry?.id === entryId) closeShoppingPanel();
    const previous = entries;
    setRemovingId(entryId);
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    try {
      const response = await apiFetch(`${API_URL}/${entryId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove meal");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/meal-planner");
        return;
      }
      setEntries(previous);
      setError("Could not remove meal");
    } finally {
      setRemovingId(null);
    }
  }

  const formIsValid = mealSource === "recipe" ? Boolean(recipeId) : Boolean(title.trim());

  return (
    <main className="meal-shell">
      <header className="meal-header">
        <div>
          <h1>Meal Planner</h1>
        </div>
        <div className="meal-header-actions">
          <a className="meal-cookbook-link" href="/cookbook" aria-label="Open cookbook">
            <MealIcon name="book" />
            <span>Cookbook</span>
          </a>
        </div>
      </header>

      <nav className="week-nav" aria-label="Choose week">
        <button type="button" onClick={() => moveWeek(-1)} aria-label="Previous week">
          <MealIcon name="chevron-left" />
        </button>
        <div>
          <strong>{formatWeek(weekStart)}</strong>
          {weekStart !== currentWeek ? (
            <button type="button" className="week-today" onClick={returnToToday}>
              Today
            </button>
          ) : (
            <span className="week-current">This week</span>
          )}
        </div>
        <button type="button" onClick={() => moveWeek(1)} aria-label="Next week">
          <MealIcon name="chevron-right" />
        </button>
      </nav>

      {shoppingEntry ? (
        <section
          className="meal-shopping-panel"
          aria-labelledby="shopping-panel-title"
          ref={shoppingPanelRef}
        >
          <div className="meal-shopping-heading">
            <div>
              <h2 id="shopping-panel-title">Add ingredients for {mealName(shoppingEntry)}</h2>
              <p>{formatDay(shoppingEntry.meal_date)} · Select only what you need for this shop.</p>
            </div>
            <button
              type="button"
              className="meal-shopping-close"
              onClick={closeShoppingPanel}
              aria-label="Close Wishlist ingredient panel"
            >
              <MealIcon name="close" />
            </button>
          </div>

          {shoppingIngredients.length ? (
            <form className="meal-shopping-form" onSubmit={addIngredientsToWishlist}>
              <fieldset className="meal-shopping-ingredients">
                <legend>
                  Ingredients · {selectedShoppingIngredientIds.length} selected
                </legend>
                {shoppingIngredients.map((ingredient) => (
                  <label key={ingredient.id}>
                    <input
                      type="checkbox"
                      checked={selectedShoppingIngredientIds.includes(ingredient.id)}
                      onChange={(event) =>
                        setSelectedShoppingIngredientIds((current) =>
                          event.target.checked
                            ? [...current, ingredient.id]
                            : current.filter((id) => id !== ingredient.id),
                        )
                      }
                    />
                    <span>{ingredient.name}</span>
                  </label>
                ))}
              </fieldset>

              <div className="meal-shopping-target">
                <label>
                  <span>Wishlist group</span>
                  <input
                    value={wishlistStore}
                    onChange={(event) => setWishlistStore(event.target.value)}
                    placeholder={shoppingEntry ? mealName(shoppingEntry) : "Recipe"}
                    maxLength={120}
                  />
                </label>
              </div>

              <div className="meal-shopping-actions">
                <button type="button" onClick={closeShoppingPanel}>Cancel</button>
                <button
                  type="submit"
                  disabled={shoppingSaving || !selectedShoppingIngredientIds.length}
                >
                  {shoppingSaving ? "Adding…" : "Add selected"}
                </button>
              </div>
            </form>
          ) : (
            <p className="meal-shopping-empty">This recipe does not have any ingredients listed.</p>
          )}
          {shoppingStatus ? (
            <p className="meal-shopping-status" role="status">
              {shoppingStatus}
              {shoppingResultAdded ? (
                <a href="/wishlist">Open Wishlist</a>
              ) : null}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="meal-add-panel" aria-labelledby="add-meal-title" ref={addPanelRef}>
        <div className="meal-add-heading">
          <div>
            <h2 id="add-meal-title">Add meal</h2>
            <span>{formatDay(mealDate)}</span>
          </div>
          <div className="meal-source-switch" role="group" aria-label="Meal source">
            <button
              type="button"
              className={mealSource === "custom" ? "is-active" : undefined}
              aria-pressed={mealSource === "custom"}
              onClick={() => {
                setMealSource("custom");
                requestAnimationFrame(() => mealNameInputRef.current?.focus());
              }}
            >
              Meal name
            </button>
            <button
              type="button"
              className={mealSource === "recipe" ? "is-active" : undefined}
              aria-pressed={mealSource === "recipe"}
              onClick={() => {
                setMealSource("recipe");
                requestAnimationFrame(() => recipeSelectRef.current?.focus());
              }}
            >
              Cookbook
            </button>
          </div>
        </div>

        <form className="meal-form" onSubmit={addMeal}>
          {mealSource === "custom" ? (
            <label className="meal-main-field">
              <span>Meal</span>
              <input
                ref={mealNameInputRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Pasta"
                maxLength={200}
              />
            </label>
          ) : (
            <label className="meal-main-field">
              <span>Recipe</span>
              <select
                ref={recipeSelectRef}
                value={recipeId}
                onChange={(event) => setRecipeId(event.target.value)}
              >
                <option value="">Choose a recipe</option>
                {sortedRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title || "Untitled recipe"}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="meal-day-field">
            <span>Day</span>
            <select value={mealDate} onChange={(event) => setMealDate(event.target.value)}>
              {days.map((day) => (
                <option key={day} value={day}>{formatDay(day)}</option>
              ))}
            </select>
          </label>

          <fieldset className="meal-type-picker">
            <legend>Time</legend>
            <div>
              {MEAL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={mealType === type ? `is-active is-${type}` : undefined}
                  aria-pressed={mealType === type}
                  onClick={() => setMealType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={saving || !formIsValid}>
            {saving ? "Adding…" : "Add meal"}
          </button>
        </form>
      </section>

      {error ? (
        <div className="meal-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
            <MealIcon name="close" />
          </button>
        </div>
      ) : null}

      {loadingWeek ? (
        <section className="meal-week-loading" aria-label="Loading week">
          {days.map((day) => <i key={day} />)}
        </section>
      ) : (
        <section className="meal-week" aria-label="Meals this week">
          {days.map((day) => {
            const dayEntries = entriesByDay.get(day) ?? [];
            const parts = dayParts(day);
            const isToday = day === todayIso();
            const isSelected = day === mealDate;
            return (
              <article
                key={day}
                className={`meal-day${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
              >
                <header>
                  <button type="button" onClick={() => chooseDay(day)} aria-label={`Select ${formatDay(day)}`}>
                    <span>{parts.weekday}</span>
                    <strong>{parts.date}</strong>
                  </button>
                  {isToday ? <span className="meal-today-badge">Today</span> : null}
                </header>

                <div className="meal-day-content">
                  {dayEntries.length ? (
                    <ul>
                      {dayEntries.map((entry) => {
                        const recipe = entry.recipe_id ? recipesById.get(entry.recipe_id) : null;
                        const canAddIngredients = Boolean(recipe && splitIngredients(recipe.ingredients).length);
                        return (
                          <li key={entry.id} className={`is-${entry.meal_type}`}>
                            <span className={`meal-type is-${entry.meal_type}`}>{entry.meal_type}</span>
                            <div>
                              {entry.recipe_share_token ? (
                                <a href={`/recipes/${entry.recipe_share_token}`}>
                                  {mealName(entry)}
                                </a>
                              ) : (
                                <strong>{mealName(entry)}</strong>
                              )}
                            </div>
                            {canAddIngredients ? (
                              <button
                                type="button"
                                className="meal-add-wishlist"
                                onClick={() => void openShoppingPanel(entry)}
                                aria-label={`Add ingredients for ${mealName(entry)} to Wishlist`}
                                title="Choose ingredients for Wishlist"
                              >
                                <MealIcon name="plus" />
                                <span>Wishlist</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void removeMeal(entry.id)}
                              disabled={removingId === entry.id}
                              aria-label={`Remove ${mealName(entry)}`}
                              title="Remove meal"
                            >
                              <MealIcon name="close" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <button type="button" className="meal-day-add" onClick={() => chooseDay(day, true)}>
                    <MealIcon name="plus" />
                    <span>{dayEntries.length ? "Add" : "Add meal"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
