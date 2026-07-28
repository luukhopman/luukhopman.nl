"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { todayIso } from "@/lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { MealPlanEntry, MealType, Recipe } from "@/lib/types";

const API_URL = "/api/meal-planner";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

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

export default function MealPlannerPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayIso()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealDate, setMealDate] = useState(todayIso());
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [recipeId, setRecipeId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const loadWeek = useCallback(async () => {
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
    const nextStart = addDays(weekStart, amount * 7);
    setWeekStart(nextStart);
    setMealDate(nextStart);
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!recipeId && !title.trim()) || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_date: mealDate,
          meal_type: mealType,
          recipe_id: recipeId ? Number(recipeId) : null,
          title: title.trim() || null,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Could not add meal");
      }
      setRecipeId("");
      setTitle("");
      await loadWeek();
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
    const previous = entries;
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
    }
  }

  return (
    <main className="meal-shell">
      <header className="meal-header">
        <div>
          <p className="meal-kicker">What are we eating?</p>
          <h1>Meal Planner</h1>
          <p>Plan the week with Cookbook recipes or simple meal ideas.</p>
        </div>
        <Link className="meal-cookbook-link" href="/cookbook">
          Open Cookbook
        </Link>
      </header>

      <section className="meal-add-panel" aria-labelledby="add-meal-title">
        <h2 id="add-meal-title">Add a meal</h2>
        <form className="meal-form" onSubmit={addMeal}>
          <label>
            <span>Day</span>
            <select value={mealDate} onChange={(event) => setMealDate(event.target.value)}>
              {days.map((day) => (
                <option key={day} value={day}>{formatDay(day)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Meal</span>
            <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="meal-recipe-field">
            <span>Cookbook recipe (optional)</span>
            <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              <option value="">Choose a recipe</option>
              {[...recipes]
                .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
                .map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.title || "Untitled recipe"}</option>
                ))}
            </select>
          </label>
          <label className="meal-custom-field">
            <span>Meal name (optional)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Leftovers or takeaway"
            />
          </label>
          <button type="submit" disabled={saving || (!recipeId && !title.trim())}>
            {saving ? "Adding…" : "Add meal"}
          </button>
        </form>
        {error ? <p className="meal-error" role="alert">{error}</p> : null}
      </section>

      <nav className="week-nav" aria-label="Choose week">
        <button type="button" onClick={() => moveWeek(-1)} aria-label="Previous week">←</button>
        <div>
          <strong>{formatWeek(weekStart)}</strong>
          {weekStart !== startOfWeek(todayIso()) ? (
            <button
              type="button"
              className="week-today"
              onClick={() => {
                const today = todayIso();
                setWeekStart(startOfWeek(today));
                setMealDate(today);
              }}
            >
              This week
            </button>
          ) : null}
        </div>
        <button type="button" onClick={() => moveWeek(1)} aria-label="Next week">→</button>
      </nav>

      <section className="meal-week">
        {days.map((day) => {
          const dayEntries = entries.filter((entry) => entry.meal_date === day);
          return (
            <article key={day} className={`meal-day${day === todayIso() ? " is-today" : ""}`}>
              <header>
                <time dateTime={day}>{formatDay(day)}</time>
                {day === todayIso() ? <span>Today</span> : null}
              </header>
              {dayEntries.length ? (
                <ul>
                  {dayEntries.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <span className={`meal-type is-${entry.meal_type}`}>{entry.meal_type}</span>
                        {entry.recipe_share_token ? (
                          <Link href={`/recipes/${entry.recipe_share_token}`}>
                            {entry.title || entry.recipe_title || "Untitled recipe"}
                          </Link>
                        ) : (
                          <strong>{entry.title || entry.recipe_title}</strong>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeMeal(entry.id)}
                        aria-label={`Remove ${entry.title || entry.recipe_title || "meal"}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  className="meal-empty"
                  onClick={() => {
                    setMealDate(day);
                    document.querySelector<HTMLInputElement>(".meal-custom-field input")?.focus();
                  }}
                >
                  + Add something
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
