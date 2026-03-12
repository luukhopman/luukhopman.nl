"use client";

import Link from "next/link";
import { FormEvent, TouchEvent, useDeferredValue, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  countRecipeItems,
  formatCountLabel,
  recipeSharePath,
  splitIngredients,
  splitInstructions,
} from "../../lib/cookbook";
import { triggerHaptic, useBodyClass, useLockedBody } from "../../lib/browser";
import { normalizeRecipeUrl, timeAgo } from "../../lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "../../lib/http";
import type { ImportIngredientsResult, Product, Recipe } from "../../lib/types";

const API_URL = "/api/cookbook";
const MOBILE_SHEET_BREAKPOINT = 760;
const SHEET_CLOSE_THRESHOLD = 156;
const SHEET_INTENT_THRESHOLD = 14;
const SHEET_FLICK_CLOSE_VELOCITY = 0.9;
const SHEET_FLICK_MIN_OFFSET = 72;
const SHEET_CONTENT_GESTURE_ZONE = 72;

type RecipeFormState = {
  id: string;
  url: string;
  title: string;
  course: string;
  ingredients: string;
  instructions: string;
};

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
} | null;

function getRecipeSourceLabel(url: string | null | undefined) {
  if (!url) return "";

  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function useBottomSheetGesture(open: boolean, onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOffsetRef = useRef(0);
  const gestureRef = useRef({
    tracking: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    offset: 0,
    velocity: 0,
  });

  function syncDragState(active: boolean) {
    if (!sheetRef.current) return;
    if (active) {
      sheetRef.current.setAttribute("data-sheet-dragging", "true");
      return;
    }
    sheetRef.current.removeAttribute("data-sheet-dragging");
  }

  function syncClosingState(active: boolean) {
    if (!sheetRef.current) return;
    if (active) {
      sheetRef.current.setAttribute("data-sheet-closing", "true");
      return;
    }
    sheetRef.current.removeAttribute("data-sheet-closing");
  }

  function applyOffset(offset: number) {
    const nextOffset = Math.max(offset, 0);
    const viewportHeight = typeof window === "undefined" ? 1 : window.innerHeight || 1;
    const dragRange = Math.max(viewportHeight * 0.42, SHEET_CLOSE_THRESHOLD * 1.75);
    const progress = Math.min(nextOffset / dragRange, 1);

    sheetRef.current?.style.setProperty("--sheet-offset", `${nextOffset}px`);
    overlayRef.current?.style.setProperty(
      "--sheet-backdrop-opacity",
      `${Math.max(0.32, 1 - progress * 0.62)}`,
    );
  }

  function dampSheetOffset(deltaY: number) {
    const viewportHeight = typeof window === "undefined" ? 1 : window.innerHeight || 1;
    const maxOffset = viewportHeight * 0.58;

    if (deltaY <= 0) return 0;
    if (deltaY <= 84) {
      return Math.min(deltaY * 0.88, maxOffset);
    }

    return Math.min(84 * 0.88 + (deltaY - 84) * 0.46, maxOffset);
  }

  function cancelQueuedFrame() {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }

  function clearScheduledClose() {
    if (!closeTimeoutRef.current) return;
    clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  }

  function queueOffset(offset: number) {
    pendingOffsetRef.current = offset;
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      applyOffset(pendingOffsetRef.current);
    });
  }

  function resetGesture(immediate = false) {
    cancelQueuedFrame();
    clearScheduledClose();
    gestureRef.current = {
      tracking: false,
      dragging: false,
      startX: 0,
      startY: 0,
      lastY: 0,
      lastTime: 0,
      offset: 0,
      velocity: 0,
    };
    pendingOffsetRef.current = 0;
    syncDragState(false);
    syncClosingState(false);

    if (immediate) {
      applyOffset(0);
      return;
    }

    queueOffset(0);
  }

  useEffect(() => {
    if (!open) {
      resetGesture(true);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      resetGesture(true);
    };
  }, []);

  function canStartGesture(target: EventTarget | null, touchY: number) {
    if (!(target instanceof HTMLElement)) return false;
    if (
      target.closest(
        "button, a, input, textarea, select, label, [role='button'], [data-no-sheet-gesture]",
      )
    ) {
      return false;
    }

    if (
      target.closest("[data-sheet-gesture-handle]") ||
      target.closest(".modal-header") ||
      target.closest(".view-modal-header")
    ) {
      return true;
    }

    const scrollContainer = scrollRef.current;
    if (!scrollContainer || !target.closest(".recipe-modal-scroll, .view-modal-scroll")) {
      return false;
    }

    const scrollBounds = scrollContainer.getBoundingClientRect();
    return touchY <= scrollBounds.top + SHEET_CONTENT_GESTURE_ZONE;
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (
      !open ||
      typeof window === "undefined" ||
      window.innerWidth > MOBILE_SHEET_BREAKPOINT ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    if (!canStartGesture(event.target, touch.clientY)) return;
    if ((scrollRef.current?.scrollTop || 0) > 4) return;

    gestureRef.current = {
      tracking: true,
      dragging: false,
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastTime: performance.now(),
      offset: 0,
      velocity: 0,
    };
    syncClosingState(false);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!gestureRef.current.tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const currentGesture = gestureRef.current;
    const deltaY = touch.clientY - currentGesture.startY;
    const deltaX = Math.abs(touch.clientX - currentGesture.startX);

    if (!currentGesture.dragging) {
      if (deltaY <= 0) return;
      if (deltaX > deltaY && deltaX > SHEET_INTENT_THRESHOLD) {
        resetGesture();
        return;
      }
      if (deltaY < SHEET_INTENT_THRESHOLD) return;

      currentGesture.dragging = true;
      syncDragState(true);
    }

    event.preventDefault();

    const now = performance.now();
    const elapsed = Math.max(now - currentGesture.lastTime, 1);
    const instantaneousVelocity = (touch.clientY - currentGesture.lastY) / elapsed;
    currentGesture.lastY = touch.clientY;
    currentGesture.lastTime = now;
    currentGesture.velocity = currentGesture.velocity * 0.32 + instantaneousVelocity * 0.68;

    const nextOffset = dampSheetOffset(deltaY);
    currentGesture.offset = nextOffset;
    queueOffset(nextOffset);
  }

  function handleTouchEnd() {
    if (!gestureRef.current.tracking) {
      resetGesture(true);
      return;
    }

    if (!gestureRef.current.dragging) {
      resetGesture(true);
      return;
    }

    const shouldClose =
      gestureRef.current.offset >= SHEET_CLOSE_THRESHOLD ||
      (gestureRef.current.offset >= SHEET_FLICK_MIN_OFFSET &&
        gestureRef.current.velocity > SHEET_FLICK_CLOSE_VELOCITY);
    const closeTarget = Math.min(
      window.innerHeight * 0.96,
      Math.max(window.innerHeight * 0.64, gestureRef.current.offset + 220),
    );

    gestureRef.current.tracking = false;
    gestureRef.current.dragging = false;
    syncDragState(false);

    if (shouldClose) {
      syncClosingState(true);
      applyOffset(closeTarget);
      clearScheduledClose();
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, 170);
      triggerHaptic("tap");
      return;
    }

    queueOffset(0);
  }

  return {
    overlayRef,
    sheetRef,
    scrollRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

export default function CookbookPage() {
  useBodyClass("recipes-body");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [courseFilter, setCourseFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<RecipeFormState>({
    id: "",
    url: "",
    title: "",
    course: "",
    ingredients: "",
    instructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [parseInFlight, setParseInFlight] = useState(false);
  const [manualImporting, setManualImporting] = useState(false);
  const [parseStatus, setParseStatus] = useState<{
    message: string;
    type: "loading" | "success" | "error";
  } | null>(null);
  const [lastParsedUrl, setLastParsedUrl] = useState("");
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [ingredientStates, setIngredientStates] = useState<Record<string, "idle" | "added">>(
    {},
  );
  const [wishlistStatus, setWishlistStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [notesStatus, setNotesStatus] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [addingIngredients, setAddingIngredients] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const parseRequestCounter = useRef(0);
  const parseStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLockedBody(Boolean(isFormOpen || viewRecipe || confirmState));

  async function fetchRecipes() {
    setLoading(true);
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Failed to fetch recipes");
      const payload = (await response.json()) as Recipe[];
      setRecipes(payload);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error fetching recipes:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRecipes();
  }, []);

  useEffect(() => {
    return () => {
      if (parseStatusTimeout.current) {
        clearTimeout(parseStatusTimeout.current);
      }
      if (shareStatusTimeout.current) {
        clearTimeout(shareStatusTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || recipes.length === 0 || viewRecipe) return;

    const recipeId = Number(new URLSearchParams(window.location.search).get("recipe"));
    if (!Number.isFinite(recipeId)) return;

    const recipe = recipes.find((entry) => entry.id === recipeId);
    if (recipe) {
      openViewModal(recipe);
    }
  }, [recipes, viewRecipe]);

  function clearParseStatusLater() {
    if (parseStatusTimeout.current) {
      clearTimeout(parseStatusTimeout.current);
    }

    parseStatusTimeout.current = setTimeout(() => {
      setParseStatus(null);
    }, 2400);
  }

  useEffect(() => {
    if (!isFormOpen) return;

    const normalizedUrl = normalizeRecipeUrl(form.url);
    const hasParsedContent = !!form.title.trim() || !!form.ingredients.trim() || !!form.instructions.trim();
    if (!normalizedUrl) return;
    if (normalizedUrl === lastParsedUrl && hasParsedContent) return;

    let active = true;
    const timeout = setTimeout(() => {
      if (active) {
        void handleParseUrl(false, normalizedUrl);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [form.url, isFormOpen, lastParsedUrl, form.title, form.ingredients, form.instructions]);

  function openModal(recipe?: Recipe) {
    if (parseStatusTimeout.current) {
      clearTimeout(parseStatusTimeout.current);
      parseStatusTimeout.current = null;
    }
    setParseStatus(null);

    if (recipe) {
      setForm({
        id: String(recipe.id),
        url: recipe.url || "",
        title: recipe.title || "",
        course: recipe.course || "",
        ingredients: recipe.ingredients || "",
        instructions: recipe.instructions || "",
      });
      setLastParsedUrl(recipe.url || "");
    } else {
      setForm({
        id: "",
        url: "",
        title: "",
        course: "",
        ingredients: "",
        instructions: "",
      });
      setLastParsedUrl("");
    }

    setIsFormOpen(true);
  }

  function closeModal() {
    setIsFormOpen(false);
    setParseStatus(null);
  }

  function openViewModal(recipe: Recipe) {
    setViewRecipe(recipe);
    setCheckedIngredients([]);
    setIngredientStates({});
    setWishlistStatus("");
    setShareStatus("");
    setNotesValue(recipe.notes || "");
    setNotesStatus("");
  }

  function closeViewModal() {
    setViewRecipe(null);
    setCheckedIngredients([]);
    setIngredientStates({});
    setWishlistStatus("");
    setShareStatus("");
    setNotesStatus("");
  }

  function clearShareStatusLater() {
    if (shareStatusTimeout.current) {
      clearTimeout(shareStatusTimeout.current);
    }

    shareStatusTimeout.current = setTimeout(() => {
      setShareStatus("");
    }, 2400);
  }

  function toggleIngredientChecked(ingredient: string) {
    triggerHaptic("tap");
    setCheckedIngredients((current) =>
      current.includes(ingredient)
        ? current.filter((entry) => entry !== ingredient)
        : [...current, ingredient],
    );
  }

  const formSheetGesture = useBottomSheetGesture(isFormOpen, closeModal);
  const viewSheetGesture = useBottomSheetGesture(Boolean(viewRecipe), closeViewModal);

  async function handleSaveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);

    try {
      const method = form.id ? "PATCH" : "POST";
      const endpoint = new URL(form.id ? `${API_URL}/${form.id}` : API_URL, window.location.origin);
      endpoint.searchParams.set("convert_units", "true");

      const response = await apiFetch(`${endpoint.pathname}${endpoint.search}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          course: form.course,
          url: form.url,
          ingredients: form.ingredients,
          instructions: form.instructions,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Failed to save recipe: ${details}`);
      }

      closeModal();
      await fetchRecipes();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error saving recipe:", error);
      alert("Could not save recipe. Please try again and check your server logs.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecipe(recipeId: number) {
    try {
      const response = await apiFetch(`${API_URL}/${recipeId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Failed to delete recipe: ${details}`);
      }

      setRecipes((current) => current.filter((recipe) => recipe.id !== recipeId));
      if (viewRecipe?.id === recipeId) {
        closeViewModal();
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error deleting recipe:", error);
      alert("Could not delete recipe right now. Please try again.");
    }
  }

  async function handleParseUrl(force: boolean, normalizedUrl?: string) {
    const url = normalizedUrl || normalizeRecipeUrl(form.url);
    if (!url) return;
    if (parseInFlight && !force) return;

    const requestId = ++parseRequestCounter.current;
    setParseInFlight(true);
    if (force) setManualImporting(true);
    setParseStatus({ message: "Importing recipe...", type: "loading" });

    try {
      const query = new URLSearchParams({
        url,
        convert_units: "true",
      });
      const response = await apiFetch(`/api/cookbook/parse?${query.toString()}`);
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Parsing failed: ${details}`);
      }

      const data = (await response.json()) as Partial<Recipe> & {
        parse_error?: string;
        parse_source?: string;
      };

      if (requestId !== parseRequestCounter.current) return;

      setForm((current) => ({
        ...current,
        url,
        title: data.title || "",
        course: data.course || "",
        ingredients: data.ingredients || "",
        instructions: data.instructions || "",
      }));
      setLastParsedUrl(url);

      const hasCoreRecipeData = !!(data.ingredients || "").trim() || !!(data.instructions || "").trim();
      const parseError = (data.parse_error || "").trim();
      const parseSource = (data.parse_source || "").trim();

      if (hasCoreRecipeData) {
        setParseStatus({
          message:
            parseSource === "gemini"
              ? "Recipe imported."
              : "Recipe imported. AI was not available.",
          type: "success",
        });
      } else if (parseError) {
        setParseStatus({ message: parseError, type: "error" });
      } else {
        setParseStatus({
          message: "Could not import recipe details from this link.",
          type: "error",
        });
      }
      clearParseStatusLater();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      if (requestId !== parseRequestCounter.current) return;
      console.error("Parse error:", error);
      setParseStatus({
        message: "Could not import this link. Try a different one.",
        type: "error",
      });
      clearParseStatusLater();
    } finally {
      if (requestId === parseRequestCounter.current) {
        setParseInFlight(false);
        setManualImporting(false);
      }
    }
  }

  async function importIngredientsViaWishlistApi(ingredients: string[]): Promise<ImportIngredientsResult> {
    const store = viewRecipe?.title || "Cookbook";
    const cookbookLink = viewRecipe?.share_token ? recipeSharePath(viewRecipe.share_token) : "/cookbook";

    const existingResponse = await apiFetch("/api/wishlist/products");
    if (!existingResponse.ok) {
      const details = await existingResponse.text();
      throw new Error(`Failed to load wishlist items: ${details}`);
    }

    const existingProducts = (await existingResponse.json()) as Product[];
    const existingKeys = new Set(
      existingProducts
        .filter((product) => !product.is_deleted)
        .map(
          (product) =>
            `${(product.name || "").trim().toLowerCase()}::${(product.store || "")
              .trim()
              .toLowerCase()}`,
        ),
    );

    let added = 0;
    let skipped = 0;

    for (const ingredient of ingredients) {
      const key = `${ingredient.trim().toLowerCase()}::${store.trim().toLowerCase()}`;
      if (!ingredient.trim() || existingKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const response = await apiFetch("/api/wishlist/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ingredient,
          store,
          url: cookbookLink,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Failed to add ingredient: ${details}`);
      }

      existingKeys.add(key);
      added += 1;
    }

    return { added, skipped };
  }

  async function importIngredientsToWishlist(ingredients: string[]): Promise<ImportIngredientsResult> {
    const response = await apiFetch("/api/cookbook/wishlist/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredients,
        store: viewRecipe?.title || "Cookbook",
        recipe_share_token: viewRecipe?.share_token || null,
        source_url: viewRecipe?.url || null,
      }),
    });

    if (!response.ok) {
      return importIngredientsViaWishlistApi(ingredients);
    }

    return (await response.json()) as ImportIngredientsResult;
  }

  function selectedIngredients() {
    if (!viewRecipe) return [];
    const allIngredients = splitIngredients(viewRecipe.ingredients);
    return checkedIngredients.length
      ? allIngredients.filter((ingredient) => checkedIngredients.includes(ingredient))
      : allIngredients;
  }

  async function addIngredientsToWishlist() {
    if (!viewRecipe) return;

    const ingredients = selectedIngredients();
    if (ingredients.length === 0) {
      setWishlistStatus("No ingredients to add.");
      return;
    }

    setAddingIngredients(true);
    setWishlistStatus("Adding ingredients...");

    try {
      const result = await importIngredientsToWishlist(ingredients);
      setWishlistStatus(
        `Added ${result.added} ingredient${result.added === 1 ? "" : "s"}${result.skipped
          ? `, skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}`
          : ""
        } to`,
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error adding ingredients to wishlist:", error);
      setWishlistStatus("Could not add ingredients right now.");
    } finally {
      setAddingIngredients(false);
    }
  }

  async function addIngredientToWishlist(ingredient: string) {
    setIngredientStates((current) => ({ ...current, [ingredient]: "added" }));

    try {
      const result = await importIngredientsToWishlist([ingredient]);
      if (result.added > 0) {
        setWishlistStatus(`Added "${ingredient}" to`);
      } else if (result.skipped > 0) {
        setWishlistStatus(`"${ingredient}" is already in`);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error adding ingredient to wishlist:", error);
      setIngredientStates((current) => ({ ...current, [ingredient]: "idle" }));
      setWishlistStatus(`Could not add "${ingredient}".`);
    }
  }

  async function copyShareLink() {
    if (!viewRecipe || typeof window === "undefined") return;

    const shareUrl = new URL(
      recipeSharePath(viewRecipe.share_token),
      window.location.origin,
    ).toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt("Copy this recipe link", shareUrl);
      }

      setShareStatus("Share link copied.");
    } catch (error) {
      console.error("Error copying share link:", error);
      setShareStatus("Could not copy the share link.");
    }

    clearShareStatusLater();
  }

  async function saveViewNotes() {
    if (!viewRecipe || savingNotes) return;

    setSavingNotes(true);
    setNotesStatus("");

    try {
      const response = await apiFetch(`${API_URL}/${viewRecipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue.trim() }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Failed to save notes: ${details}`);
      }

      setRecipes((current) =>
        current.map((recipe) =>
          recipe.id === viewRecipe.id ? { ...recipe, notes: notesValue.trim() } : recipe,
        ),
      );
      setViewRecipe((current) =>
        current ? { ...current, notes: notesValue.trim() } : current,
      );
      setNotesStatus("Saved");
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        redirectToLogin("/cookbook");
        return;
      }
      console.error("Error saving note:", error);
      setNotesStatus("Save failed");
    } finally {
      setSavingNotes(false);
    }
  }

  const courseOptions = Array.from(
    new Set(
      recipes
        .map((recipe) => (recipe.course || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filteredRecipes = recipes.filter((recipe) => {
    const normalizedSearch = deferredSearch.toLowerCase();
    const matchesSearch =
      (recipe.title || "").toLowerCase().includes(normalizedSearch) ||
      (recipe.ingredients || "").toLowerCase().includes(normalizedSearch) ||
      (recipe.course || "").toLowerCase().includes(normalizedSearch);

    const matchesCourse =
      !courseFilter || (recipe.course || "").toLowerCase() === courseFilter.toLowerCase();

    return matchesSearch && matchesCourse;
  });

  const activeIngredients = viewRecipe ? splitIngredients(viewRecipe.ingredients) : [];
  const activeInstructions = viewRecipe ? splitInstructions(viewRecipe.instructions) : [];
  const filteredRecipeCountLabel = formatCountLabel(
    filteredRecipes.length,
    "recipe",
    "recipes",
  );

  return (
    <>
      <div className="recipes-container">
        <header className="recipe-header">
          <div className="header-main">
            <div className="heading-wrap">
              <h1><i className="fa-solid fa-utensils header-icon"></i> Bruna&apos;s Cookbook</h1>
            </div>
            <button className="new-recipe-btn" onClick={() => openModal()}>
              <i className="fa-solid fa-plus" /> <span>New Recipe</span>
            </button>
          </div>

          <div className="search-filter-controls">
            <div className="search-filter-row">
              <div className="search-box">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  type="text"
                  placeholder="Search titles, ingredients..."
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="course-filter-wrap">
                <select
                  className="course-filter-select"
                  aria-label="Filter by course"
                  value={courseFilter}
                  onChange={(event) => setCourseFilter(event.target.value)}
                >
                  <option value="">All Courses</option>
                  {courseOptions.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
                <span className="course-filter-arrow" aria-hidden="true">
                  <i className="fa-solid fa-chevron-down" />
                </span>
              </div>
              <p className="results-caption">
                {search || courseFilter ? `${filteredRecipeCountLabel} shown` : `${filteredRecipeCountLabel} saved`}
              </p>
            </div>
          </div>
        </header>

        <main>
          <div className={`spinner-container ${loading ? "" : "hidden"}`}>
            <div className="spinner" />
          </div>
          <div className={`recipes-grid ${loading ? "hidden" : ""}`}>
            {filteredRecipes.length === 0 ? (
              <div className="empty-state">
                <i className="fa-solid fa-cookie-bite" />
                <p>
                  {search || courseFilter
                    ? "No recipes match your criteria."
                    : "No recipes yet. Add one!"}
                </p>
              </div>
            ) : (
              filteredRecipes.map((recipe, index) => {
                const ingredientCount = countRecipeItems(recipe.ingredients);
                const stepCount = countRecipeItems(recipe.instructions);

                return (
                  <div
                    key={recipe.id}
                    className="recipe-card"
                    style={{ animationDelay: `${index * 0.1}s` }}
                    onClick={(event) => {
                      if (
                        (event.target as HTMLElement).closest(".edit-card-btn")
                      ) {
                        return;
                      }
                      openViewModal(recipe);
                    }}
                  >
                    <div className="recipe-card-header">
                      <h3>{recipe.title || "Untitled Recipe"}</h3>
                      <button
                        className="edit-card-btn"
                        title="Edit Recipe"
                        onClick={(event) => {
                          event.stopPropagation();
                          openModal(recipe);
                        }}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                    </div>
                    <div className="recipe-card-body">
                      <div className="recipe-stat-row">
                        {recipe.course ? (
                          <div className="recipe-course-pill">{recipe.course}</div>
                        ) : null}
                        <span className="recipe-stat-pill">
                          <i className="fa-solid fa-carrot" />{" "}
                          {formatCountLabel(ingredientCount, "ingredient", "ingredients")}
                        </span>
                        <span className="recipe-stat-pill">
                          <i className="fa-solid fa-list-ol" />{" "}
                          {formatCountLabel(stepCount, "step", "steps")}
                        </span>
                      </div>
                      <div className="recipe-meta">Created {timeAgo(recipe.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {isFormOpen ? (
        <div
          ref={formSheetGesture.overlayRef}
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={formSheetGesture.sheetRef}
            className="modal-content"
            onTouchStart={formSheetGesture.handleTouchStart}
            onTouchMove={formSheetGesture.handleTouchMove}
            onTouchEnd={formSheetGesture.handleTouchEnd}
            onTouchCancel={formSheetGesture.handleTouchEnd}
          >
            <div className="sheet-drag-handle" data-sheet-gesture-handle>
              <span className="sheet-drag-indicator" />
            </div>
            <div className="modal-header">
              <h2 id="modal-title">
                <i className={`fa-solid ${form.id ? "fa-pen" : "fa-plus"}`} />{" "}
                {form.id ? "Edit Recipe" : "New Recipe"}
              </h2>
              <button type="button" className="close-btn" onClick={closeModal}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="recipe-modal-scroll" ref={formSheetGesture.scrollRef}>
              <form onSubmit={handleSaveRecipe}>
                <div className="form-group">
                  <label htmlFor="recipe-url">Recipe URL</label>
                  <div className="parse-url-row">
                    <input
                      type="url"
                      id="recipe-url"
                      placeholder="https://..."
                      autoComplete="off"
                      value={form.url}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, url: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className={`reparse-btn ${manualImporting ? "loading" : ""}`}
                      disabled={manualImporting || !normalizeRecipeUrl(form.url)}
                      onClick={() => void handleParseUrl(true)}
                    >
                      <span className="reparse-btn-icon" aria-hidden="true">
                        <i className="fa-solid fa-rotate-right reparse-idle-icon" />
                        <span className="reparse-spinner" />
                      </span>
                      <span>{manualImporting ? "Importing..." : "Import"}</span>
                    </button>
                  </div>
                  <p
                    className={`parse-status ${parseStatus ? `parse-status-${parseStatus.type}` : "hidden"
                      }`}
                  >
                    {parseStatus?.message || ""}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="recipe-title">Recipe Title</label>
                  <input
                    type="text"
                    id="recipe-title"
                    placeholder="e.g. Grandma's Pasta"
                    required
                    autoComplete="off"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="recipe-course">Course</label>
                  <div className="course-select-wrap">
                    <select
                      id="recipe-course"
                      className="course-select"
                      value={form.course}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, course: event.target.value }))
                      }
                    >
                      <option value="">Select a course</option>
                      {[
                        "Breakfast",
                        "Brunch",
                        "Lunch",
                        "Dinner",
                        "Appetizer",
                        "Main Course",
                        "Side Dish",
                        "Sauce",
                        "Dessert",
                        "Snack",
                        "Drink",
                      ].map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                    <span className="course-select-arrow" aria-hidden="true">
                      <i className="fa-solid fa-chevron-down" />
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="recipe-ingredients">Ingredients</label>
                  <textarea
                    id="recipe-ingredients"
                    rows={4}
                    placeholder="List ingredients here..."
                    required
                    value={form.ingredients}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ingredients: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="recipe-instructions">Instructions</label>
                  <textarea
                    id="recipe-instructions"
                    rows={6}
                    placeholder="How do we make it?"
                    required
                    value={form.instructions}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        instructions: event.target.value,
                      }))
                    }
                  />
                </div>
                <button type="submit" className="save-btn" disabled={saving}>
                  {saving ? "Saving..." : "Save to Cookbook"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {viewRecipe ? (
        <div
          ref={viewSheetGesture.overlayRef}
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeViewModal();
            }
          }}
        >
          <div
            ref={viewSheetGesture.sheetRef}
            className="modal-content view-modal-content"
            onTouchStart={viewSheetGesture.handleTouchStart}
            onTouchMove={viewSheetGesture.handleTouchMove}
            onTouchEnd={viewSheetGesture.handleTouchEnd}
            onTouchCancel={viewSheetGesture.handleTouchEnd}
          >
            <div className="sheet-drag-handle" data-sheet-gesture-handle>
              <span className="sheet-drag-indicator" />
            </div>
            <div className="view-modal-header">
              <div className="view-header-top">
                <div className="view-header-left">
                  <p className="view-kicker">Cookbook</p>
                  <h2 id="view-title">{viewRecipe.title || "Recipe Title"}</h2>
                </div>
                <div className="view-header-actions">
                  <button
                    className="icon-btn"
                    title="Copy share link"
                    onClick={() => void copyShareLink()}
                  >
                    <i className="fa-solid fa-share-nodes" />
                  </button>
                  <button
                    className="icon-btn delete-icon-btn"
                    title="Delete Recipe"
                    onClick={() =>
                      setConfirmState({
                        title: "Delete recipe?",
                        message: `"${(viewRecipe.title || "this recipe").trim()}" will be permanently removed. This cannot be undone.`,
                        onConfirm: () => {
                          setConfirmState(null);
                          void handleDeleteRecipe(viewRecipe.id);
                        },
                      })
                    }
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                  <button
                    className="icon-btn"
                    title="Edit"
                    onClick={() => {
                      const recipeToEdit = viewRecipe;
                      closeViewModal();
                      openModal(recipeToEdit);
                    }}
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    className="icon-btn view-close-btn"
                    id="view-close-btn"
                    title="Close"
                    onClick={closeViewModal}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>
              <div className="view-header-bottom">
                <div className="view-meta-row">
                  {viewRecipe.course ? <p className="view-course">{viewRecipe.course}</p> : null}
                </div>
                <div className="view-link-row">
                  <div className="view-link-section">
                    <Link
                      href={recipeSharePath(viewRecipe.share_token)}
                      target="_blank"
                      className="recipe-link-badge view-badge share-view-badge"
                    >
                      <i className="fa-solid fa-share-nodes" />
                      <span className="recipe-link-badge-label">Shared page</span>
                    </Link>
                    {viewRecipe.url ? (
                      <a
                        href={viewRecipe.url}
                        target="_blank"
                        rel="noreferrer"
                        className="recipe-link-badge view-badge source-view-badge"
                      >
                        <i className="fa-solid fa-link" />
                        <span className="recipe-link-badge-label">
                          Source: {getRecipeSourceLabel(viewRecipe.url)}
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className={`share-link-status ${shareStatus ? "" : "hidden"}`}>{shareStatus}</p>
            </div>

            <div className="view-modal-scroll" ref={viewSheetGesture.scrollRef}>
              <div className="view-body">
                <section className="ingredients-section">
                  <div className="ingredients-header-row">
                    <h3><i className="fa-solid fa-carrot" /> Ingredients</h3>
                    <button
                      className="add-to-wishlist-btn"
                      type="button"
                      disabled={addingIngredients}
                      onClick={() => void addIngredientsToWishlist()}
                    >
                      <i className={`fa-solid ${addingIngredients ? "fa-spinner fa-spin" : "fa-cart-plus"}`} />{" "}
                      {addingIngredients ? "Adding..." : "Add to Wishlist"}
                    </button>
                  </div>
                  <p className={`add-to-wishlist-status ${wishlistStatus ? "" : "hidden"}`}>
                    {wishlistStatus}
                    {wishlistStatus.endsWith("to") || wishlistStatus.endsWith("in") ? (
                      <>
                        {" "}
                        <Link href="/wishlist">Wishlist</Link>.
                      </>
                    ) : null}
                  </p>
                  <ul className="checklist">
                    {activeIngredients.map((ingredient) => (
                      <li
                        key={`${viewRecipe.id}-${ingredient}`}
                        className={checkedIngredients.includes(ingredient) ? "checked" : ""}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest(".ingredient-add-btn")) {
                            return;
                          }
                          toggleIngredientChecked(ingredient);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checkedIngredients.includes(ingredient)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleIngredientChecked(ingredient)}
                        />
                        <span className="ingredient-text">{ingredient}</span>
                        <button
                          type="button"
                          className={`ingredient-add-btn ${ingredientStates[ingredient] === "added" ? "added" : ""
                            }`}
                          title="Add this ingredient to wishlist"
                          onClick={(event) => {
                            event.stopPropagation();
                            void addIngredientToWishlist(ingredient);
                          }}
                        >
                          <i
                            className={`fa-solid ${ingredientStates[ingredient] === "added" ? "fa-check" : "fa-plus"
                              }`}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="instructions-section">
                  <h3><i className="fa-solid fa-list-ol" /> Instructions</h3>
                  <div className="numbered-list">
                    {activeInstructions.map((step, index) => (
                      <div key={`${viewRecipe.id}-${index}`} className="instruction-step">
                        <div className="step-number">{index + 1}</div>
                        <div className="step-text">{step}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="notes-section">
                  <div className="notes-header-row">
                    <h3><i className="fa-solid fa-pencil" /> Cooking Notes</h3>
                  </div>
                  <textarea
                    id="view-notes-input"
                    rows={3}
                    placeholder="Jot something down while cooking…"
                    value={notesValue}
                    onChange={(event) => setNotesValue(event.target.value)}
                  />
                  <div className="view-notes-actions">
                    <button
                      className="notes-save-btn"
                      type="button"
                      disabled={savingNotes}
                      onClick={() => void saveViewNotes()}
                    >
                      <i className={`fa-solid ${savingNotes ? "fa-spinner fa-spin" : "fa-check"}`} />
                      {savingNotes ? "Saving…" : "Save"}
                    </button>
                    <span className={`view-notes-status ${notesStatus ? "" : "hidden"}`}>
                      {notesStatus}
                    </span>
                  </div>
                  {(viewRecipe.notes || "").trim() ? (
                    <p id="view-notes-content">{viewRecipe.notes!.trim()}</p>
                  ) : null}
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel="Delete"
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </>
  );
}
