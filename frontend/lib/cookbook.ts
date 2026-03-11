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
