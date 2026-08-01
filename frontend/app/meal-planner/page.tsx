"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { todayIso } from "@/lib/format";
import { formatCountLabel, splitIngredients, splitInstructions } from "@/lib/cookbook";
import { triggerHaptic, useBottomSheetGesture, useLockedBody } from "@/lib/browser";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { ImportIngredientsResult, MealPlanEntry, MealType, Recipe } from "@/lib/types";

const API_URL = "/api/meal-planner";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

type MealIconName = "chevron-left" | "chevron-right" | "close" | "plus";

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
      {name === "chevron-left" ? (
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

function recipeSourceLabel(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Open source";
  }
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
  const [recipeToView, setRecipeToView] = useState<Recipe | null>(null);
  const [checkedRecipeIngredients, setCheckedRecipeIngredients] = useState<string[]>([]);
  const [recipeWishlistPanelOpen, setRecipeWishlistPanelOpen] = useState(false);
  const [recipeWishlistStore, setRecipeWishlistStore] = useState("Meal plan");
  const [selectedRecipeWishlistIngredientIds, setSelectedRecipeWishlistIngredientIds] = useState<string[]>([]);
  const [recipeWishlistSaving, setRecipeWishlistSaving] = useState(false);
  const [recipeWishlistStatus, setRecipeWishlistStatus] = useState("");
  const [recipeWishlistResultAdded, setRecipeWishlistResultAdded] = useState(false);
  const addPanelRef = useRef<HTMLElement>(null);
  const shoppingPanelRef = useRef<HTMLElement>(null);
  const recipeWishlistPanelRef = useRef<HTMLElement>(null);
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
  const recipeIngredients = useMemo(
    () => splitIngredients(recipeToView?.ingredients),
    [recipeToView],
  );
  const recipeInstructions = useMemo(
    () => splitInstructions(recipeToView?.instructions),
    [recipeToView],
  );

  useLockedBody(Boolean(recipeToView));

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

  function openRecipe(recipe: Recipe) {
    setRecipeToView(recipe);
    setCheckedRecipeIngredients([]);
    setRecipeWishlistPanelOpen(false);
    setRecipeWishlistStore(recipe.title?.trim() || "Meal plan");
    setSelectedRecipeWishlistIngredientIds([]);
    setRecipeWishlistSaving(false);
    setRecipeWishlistStatus("");
    setRecipeWishlistResultAdded(false);
  }

  function closeRecipe() {
    setRecipeToView(null);
    setCheckedRecipeIngredients([]);
    setRecipeWishlistPanelOpen(false);
    setSelectedRecipeWishlistIngredientIds([]);
    setRecipeWishlistStatus("");
    setRecipeWishlistResultAdded(false);
  }

  function toggleRecipeIngredient(ingredient: string) {
    triggerHaptic("tap");
    setCheckedRecipeIngredients((current) =>
      current.includes(ingredient)
        ? current.filter((entry) => entry !== ingredient)
        : [...current, ingredient],
    );
  }

  function closeRecipeWishlistPanel() {
    setRecipeWishlistPanelOpen(false);
    setSelectedRecipeWishlistIngredientIds([]);
    setRecipeWishlistStatus("");
    setRecipeWishlistResultAdded(false);
  }

  function openRecipeWishlistPanel(onlyIngredientIndex?: number) {
    if (!recipeToView || recipeIngredients.length === 0) {
      setRecipeWishlistStatus("This recipe has no ingredients to add.");
      return;
    }

    const ingredientIds = recipeIngredients.map((_, index) => String(index));
    setRecipeWishlistPanelOpen(true);
    setRecipeWishlistStatus("");
    setRecipeWishlistResultAdded(false);
    setRecipeWishlistStore(recipeToView.title?.trim() || "Meal plan");
    setSelectedRecipeWishlistIngredientIds(
      onlyIngredientIndex === undefined ? ingredientIds : [String(onlyIngredientIndex)],
    );
    requestAnimationFrame(() => {
      recipeWishlistPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function addRecipeIngredientsToWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipeToView || recipeWishlistSaving) return;

    const ingredients = recipeIngredients.filter((_, index) =>
      selectedRecipeWishlistIngredientIds.includes(String(index)),
    );
    if (ingredients.length === 0) {
      setRecipeWishlistStatus("Choose at least one ingredient first.");
      return;
    }

    setRecipeWishlistSaving(true);
    setRecipeWishlistStatus("");
    setRecipeWishlistResultAdded(false);
    try {
      const response = await apiFetch("/api/cookbook/wishlist/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          store: recipeWishlistStore.trim() || recipeToView.title?.trim() || "Meal plan",
          recipe_share_token: recipeToView.share_token,
          source_url: "/meal-planner",
        }),
      });
      if (!response.ok) throw new Error("Could not add ingredients to the wishlist");
      const result = (await response.json()) as ImportIngredientsResult;
      setRecipeWishlistResultAdded(true);
      setRecipeWishlistStatus(
        `Added ${result.added} ingredient${result.added === 1 ? "" : "s"} to Wishlist${
          result.skipped ? `, skipped ${result.skipped} already there` : ""
        }.`,
      );
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/meal-planner");
        return;
      }
      setRecipeWishlistStatus(
        caught instanceof Error ? caught.message : "Could not add ingredients to Wishlist",
      );
    } finally {
      setRecipeWishlistSaving(false);
    }
  }

  const recipeSheetGesture = useBottomSheetGesture(Boolean(recipeToView), closeRecipe);

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
        <h1>Meal Planner</h1>
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
                              {recipe ? (
                                <button
                                  type="button"
                                  className="meal-recipe-link"
                                  onClick={() => openRecipe(recipe)}
                                  aria-label={`Open ${mealName(entry)}`}
                                >
                                  {mealName(entry)}
                                </button>
                              ) : entry.recipe_share_token ? (
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

      {recipeToView ? (
        <div
          ref={recipeSheetGesture.overlayRef}
          className="modal-overlay meal-recipe-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeRecipe();
          }}
        >
          <div
            ref={recipeSheetGesture.sheetRef}
            className="modal-content view-modal-content meal-recipe-sheet"
            aria-labelledby="meal-recipe-title"
            onTouchStart={recipeSheetGesture.handleTouchStart}
            onTouchMove={recipeSheetGesture.handleTouchMove}
            onTouchEnd={recipeSheetGesture.handleTouchEnd}
            onTouchCancel={recipeSheetGesture.handleTouchEnd}
          >
            <div className="sheet-drag-handle" data-sheet-gesture-handle>
              <span className="sheet-drag-indicator" />
            </div>
            <header className="view-modal-header meal-recipe-header">
              <div className="view-header-top">
                <div className="view-header-left">
                  <h2 id="meal-recipe-title">{recipeToView.title || "Recipe"}</h2>
                </div>
                <div className="view-header-actions">
                  <button
                    className="icon-btn view-close-btn"
                    type="button"
                    title="Close"
                    aria-label="Close recipe"
                    onClick={closeRecipe}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>
              <div className="view-header-bottom">
                <div className="view-meta-row">
                  {recipeToView.course ? <p className="view-course">{recipeToView.course}</p> : null}
                  <p className="view-header-stat">
                    <i className="fa-solid fa-carrot" aria-hidden="true" />
                    {formatCountLabel(recipeIngredients.length, "ingredient", "ingredients")}
                  </p>
                  <p className="view-header-stat">
                    <i className="fa-solid fa-list-ol" aria-hidden="true" />
                    {formatCountLabel(recipeInstructions.length, "step", "steps")}
                  </p>
                </div>
                <div className="view-link-row">
                  <div className="view-link-section">
                    <a
                      className="recipe-link-badge view-badge share-view-badge"
                      href={`/recipes/${recipeToView.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fa-solid fa-share-nodes" />
                      <span className="recipe-link-badge-label">Shared page</span>
                    </a>
                    {recipeToView.url ? (
                      <a
                        className="recipe-link-badge view-badge source-view-badge"
                        href={recipeToView.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <i className="fa-solid fa-link" />
                        <span className="recipe-link-badge-label">
                          Source: {recipeSourceLabel(recipeToView.url)}
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>

            <div className="view-modal-scroll" ref={recipeSheetGesture.scrollRef}>
              <div className="view-body">
                <section className="ingredients-section">
                  <div className="ingredients-header-row">
                    <h3><i className="fa-solid fa-carrot" /> Ingredients</h3>
                    <button
                      className="add-to-wishlist-btn"
                      type="button"
                      disabled={recipeWishlistSaving || recipeIngredients.length === 0}
                      onClick={() =>
                        recipeWishlistPanelOpen
                          ? closeRecipeWishlistPanel()
                          : openRecipeWishlistPanel()
                      }
                    >
                      <i className={`fa-solid ${recipeWishlistPanelOpen ? "fa-xmark" : "fa-cart-plus"}`} />{" "}
                      {recipeWishlistPanelOpen ? "Close selection" : "Choose for Wishlist"}
                    </button>
                  </div>
                  {recipeWishlistPanelOpen ? (
                    <section
                      className="cookbook-wishlist-panel"
                      aria-labelledby="meal-recipe-wishlist-title"
                      ref={recipeWishlistPanelRef}
                    >
                      <div className="cookbook-wishlist-heading">
                        <div>
                          <h4 id="meal-recipe-wishlist-title">Add ingredients to Wishlist</h4>
                          <p>Select only what you need for this shop.</p>
                        </div>
                        <button
                          type="button"
                          className="cookbook-wishlist-close"
                          onClick={closeRecipeWishlistPanel}
                          aria-label="Close Wishlist ingredient panel"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                      <form className="cookbook-wishlist-form" onSubmit={addRecipeIngredientsToWishlist}>
                        <fieldset className="cookbook-wishlist-ingredients">
                          <legend>
                            Ingredients · {selectedRecipeWishlistIngredientIds.length} selected
                          </legend>
                          {recipeIngredients.map((ingredient, index) => (
                            <label key={`meal-recipe-wishlist-${index}`}>
                              <input
                                type="checkbox"
                                checked={selectedRecipeWishlistIngredientIds.includes(String(index))}
                                onChange={(event) =>
                                  setSelectedRecipeWishlistIngredientIds((current) =>
                                    event.target.checked
                                      ? [...current, String(index)]
                                      : current.filter((id) => id !== String(index)),
                                  )
                                }
                              />
                              <span>{ingredient}</span>
                            </label>
                          ))}
                        </fieldset>
                        <div className="cookbook-wishlist-target">
                          <label>
                            <span>Store</span>
                            <input
                              value={recipeWishlistStore}
                              onChange={(event) => setRecipeWishlistStore(event.target.value)}
                              placeholder="Meal plan"
                              maxLength={120}
                            />
                          </label>
                        </div>
                        <div className="cookbook-wishlist-actions">
                          <button type="button" onClick={closeRecipeWishlistPanel}>Cancel</button>
                          <button
                            type="submit"
                            disabled={recipeWishlistSaving || !selectedRecipeWishlistIngredientIds.length}
                          >
                            {recipeWishlistSaving ? "Adding…" : "Add selected"}
                          </button>
                        </div>
                      </form>
                      {recipeWishlistStatus ? (
                        <p className="cookbook-wishlist-status" role="status">
                          {recipeWishlistStatus}
                          {recipeWishlistResultAdded ? <a href="/wishlist">Open Wishlist</a> : null}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  <ul className="checklist">
                    {recipeIngredients.map((ingredient, index) => (
                      <li
                        key={`meal-recipe-ingredient-${index}`}
                        className={checkedRecipeIngredients.includes(ingredient) ? "checked" : ""}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest(".ingredient-add-btn")) return;
                          toggleRecipeIngredient(ingredient);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checkedRecipeIngredients.includes(ingredient)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleRecipeIngredient(ingredient)}
                        />
                        <span className="ingredient-text">{ingredient}</span>
                        <button
                          type="button"
                          className="ingredient-add-btn"
                          title="Choose this ingredient for Wishlist"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecipeWishlistPanel(index);
                          }}
                        >
                          <i className="fa-solid fa-cart-plus" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!recipeIngredients.length ? (
                    <p className="public-section-empty">No ingredients listed.</p>
                  ) : null}
                </section>

                <section className="instructions-section">
                  <h3><i className="fa-solid fa-list-ol" /> Instructions</h3>
                  {recipeInstructions.length ? (
                    <div className="numbered-list">
                      {recipeInstructions.map((step, index) => (
                        <div key={`meal-recipe-step-${index}`} className="instruction-step">
                          <div className="step-number">{index + 1}</div>
                          <div className="step-text">{step}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="public-section-empty">No instructions listed.</p>
                  )}
                </section>

                {(recipeToView.notes || "").trim() ? (
                  <section className="notes-section">
                    <h3>Cooking Notes</h3>
                    <p className="view-notes-copy">{recipeToView.notes}</p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
