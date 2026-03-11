import type { Metadata } from "next";

import { notFound } from "next/navigation";

import {
  formatCountLabel,
  splitIngredients,
  splitInstructions,
} from "@/lib/cookbook";
import { timeAgo } from "@/lib/format";
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
          <p className="view-kicker">Shared recipe</p>
          <div className="public-recipe-title-row">
            <div className="heading-wrap">
              <h1>{recipe.title || "Untitled Recipe"}</h1>
              <p className="subtitle">
                From Bruna&apos;s Cookbook.
              </p>
            </div>
            {recipe.url ? (
              <a
                href={recipe.url}
                target="_blank"
                rel="noreferrer"
                className="recipe-link-badge public-share-badge"
              >
                <i className="fa-solid fa-link" />
                <span className="recipe-link-badge-label">
                  {(() => {
                    try {
                      return `Source: ${new URL(recipe.url || "").hostname.replace("www.", "")}`;
                    } catch {
                      return "Open source";
                    }
                  })()}
                </span>
              </a>
            ) : null}
          </div>
          <div className="view-meta-row public-recipe-meta">
            {recipe.course ? <p className="view-course">{recipe.course}</p> : null}
            {ingredients.length ? (
              <p className="view-header-stat">
                <i className="fa-solid fa-carrot" />{" "}
                {formatCountLabel(ingredients.length, "ingredient", "ingredients")}
              </p>
            ) : null}
            {instructions.length ? (
              <p className="view-header-stat">
                <i className="fa-solid fa-list-ol" />{" "}
                {formatCountLabel(instructions.length, "step", "steps")}
              </p>
            ) : null}
            {recipe.created_at ? (
              <p className="view-header-stat">Saved {timeAgo(recipe.created_at)}</p>
            ) : null}
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
