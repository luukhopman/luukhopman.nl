import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { splitIngredients, splitInstructions } from "@/lib/cookbook";
import { findRecipeByShareToken } from "@/lib/server/recipes";
import { SharedChecklist } from "./client-checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedRecipePageProps = {
  params: Promise<{
    shareToken: string;
  }>;
};

function normalizeShareToken(raw: string) {
  const value = raw.trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(value)) {
    return null;
  }
  return value;
}

export async function generateMetadata({
  params,
}: SharedRecipePageProps): Promise<Metadata> {
  const { shareToken: rawShareToken } = await params;
  const shareToken = normalizeShareToken(rawShareToken);
  if (!shareToken) {
    return { title: "Shared Recipe" };
  }

  const recipe = await findRecipeByShareToken(shareToken);
  return {
    title: recipe?.title ? `${recipe.title} | Shared Recipe` : "Shared Recipe",
  };
}

export default async function SharedRecipePage({
  params,
}: SharedRecipePageProps) {
  const { shareToken: rawShareToken } = await params;
  const shareToken = normalizeShareToken(rawShareToken);
  if (!shareToken) {
    notFound();
  }

  const recipe = await findRecipeByShareToken(shareToken);
  if (!recipe) {
    notFound();
  }

  const ingredients = splitIngredients(recipe.ingredients);
  const instructions = splitInstructions(recipe.instructions);
  const hasNotes = Boolean((recipe.notes || "").trim());

  return (
    <main className="public-recipe-page">
      <div className="public-recipe-shell">
        <header className="recipe-header public-recipe-header">
          <div className="heading-wrap">
            <h1>{recipe.title || "Untitled Recipe"}</h1>
          </div>
        </header>

        <div className="public-recipe-content">
          <section className="ingredients-section">
            <h3><i className="fa-solid fa-carrot" /> Ingredients</h3>
            {ingredients.length ? (
              <SharedChecklist ingredients={ingredients} recipeId={recipe.id} />
            ) : (
              <p className="public-section-empty">No ingredients listed.</p>
            )}
          </section>

          <section className="instructions-section">
            <h3><i className="fa-solid fa-list-ol" /> Instructions</h3>
            {instructions.length ? (
              <div className="numbered-list">
                {instructions.map((step, index) => (
                  <div key={`${recipe.id}-${index}`} className="instruction-step">
                    <div className="step-number">{index + 1}</div>
                    <div className="step-text">{step}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="public-section-empty">No instructions listed.</p>
            )}
          </section>

          {hasNotes ? (
            <section className="notes-section">
              <h3>Cooking Notes</h3>
              <p className="view-notes-copy">{recipe.notes}</p>
            </section>
          ) : null}
        </div>

      </div>
    </main>
  );
}
