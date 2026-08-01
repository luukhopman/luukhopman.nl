export const RECIPE_COURSE_OPTIONS = [
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
] as const;

export type RecipeCourse = (typeof RECIPE_COURSE_OPTIONS)[number];

const recipeCourseAliases: Record<string, RecipeCourse> = {
  starter: "Appetizer",
  starters: "Appetizer",
  entree: "Main Course",
  entrees: "Main Course",
  "main": "Main Course",
  "main dish": "Main Course",
  "main dishes": "Main Course",
  side: "Side Dish",
  sides: "Side Dish",
  beverage: "Drink",
  beverages: "Drink",
};

export function normalizeRecipeCourse(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) return "";

  const exact = RECIPE_COURSE_OPTIONS.find(
    (course) => course.toLowerCase() === normalized,
  );
  return exact || recipeCourseAliases[normalized] || "";
}

export function countRecipeItems(text: string | null | undefined) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function splitIngredients(text: string | null | undefined) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "-" && line !== "•")
    .map((line) => line.replace(/^[-•*]\s*/, ""));
}

export function splitInstructions(text: string | null | undefined) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+\.?$/.test(line))
    .map((line) => line.replace(/^\d+[\.\)\-]?\s*/, ""));
}

export function recipeSharePath(shareToken: string) {
  return `/recipes/${shareToken}`;
}

export function toggleCheckedChecklistIndex(current: number[], index: number) {
  return current.includes(index)
    ? current.filter((entry) => entry !== index)
    : [...current, index];
}
