import { load } from "cheerio";

import {
  GEMINI_API_KEY,
  GEMINI_API_URL,
  GEMINI_MODEL,
} from "./config";
import {
  normalizeRecipePayload,
  normalizeRecipeText,
} from "./cookbook-text";

type GenericObject = Record<string, unknown>;
type GeminiParseResult =
  | {
      status: "disabled";
      warning: string;
    }
  | {
      status: "failed";
      warning: string;
    }
  | {
      status: "success";
      recipe: Record<string, unknown>;
    };

const recipeParseJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    course: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    parse_error: { type: "string" },
  },
};

function asList(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecipeType(nodeType: unknown): boolean {
  if (nodeType === null || nodeType === undefined) return false;
  if (Array.isArray(nodeType)) {
    return nodeType.some((item) => isRecipeType(item));
  }
  return String(nodeType).trim().toLowerCase() === "recipe";
}

function collectJsonLdNodes(data: unknown): GenericObject[] {
  const nodes: GenericObject[] = [];

  function walk(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as GenericObject;
      nodes.push(record);
      Object.values(record).forEach(walk);
    }
  }

  walk(data);
  return nodes;
}

function extractIngredients(rawIngredients: unknown): string[] {
  const ingredients: string[] = [];
  for (const item of asList(rawIngredients)) {
    if (typeof item === "string") {
      const text = normalizeRecipeText(item);
      if (text) ingredients.push(text);
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as GenericObject;
      const candidate = normalizeRecipeText(record.text ?? record.name ?? "");
      if (candidate) ingredients.push(candidate);
    }
  }
  return ingredients;
}

function extractInstructionSteps(raw: unknown): string[] {
  const steps: string[] = [];

  function walk(node: unknown) {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      const text = normalizeRecipeText(node);
      if (text) steps.push(text);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const record = node as GenericObject;
      const textValue = record.text ?? record.name;
      if (typeof textValue === "string") {
        const text = normalizeRecipeText(textValue);
        if (text) steps.push(text);
      }
      for (const key of ["itemListElement", "steps", "recipeInstructions"]) {
        if (key in record) {
          walk(record[key]);
        }
      }
    }
  }

  walk(raw);
  return steps;
}

function selectBestRecipeNode(nodes: GenericObject[]) {
  let bestNode: GenericObject | null = null;
  let bestScore = -1;

  for (const node of nodes) {
    if (!isRecipeType(node["@type"])) {
      continue;
    }
    const ingredients = extractIngredients(node.recipeIngredient ?? node.ingredients);
    const instructions = extractInstructionSteps(node.recipeInstructions);
    const score =
      (instructions.length ? 4 : 0) +
      (ingredients.length ? 3 : 0) +
      (normalizeRecipeText(node.name ?? "").length ? 1 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  return bestNode;
}

function recipeSeedText(result: Record<string, string>) {
  const sections = [
    ["Title", result.title || ""],
    ["Course", result.course || ""],
    ["Ingredients", result.ingredients || ""],
    ["Instructions", result.instructions || ""],
  ];

  return sections
    .filter(([, value]) => normalizeRecipeText(value))
    .map(([label, value]) => `${label}:\n${normalizeRecipeText(value)}`)
    .join("\n\n");
}

function extractPageTextForLlm(html: string, limit = 18000) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();
  const text = normalizeRecipeText($.text());
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "").trim()}...`;
}

function formatGeminiRecipeResult(payload: GenericObject, url: string) {
  const ingredients = asList(payload.ingredients)
    .map((item) => normalizeRecipeText(item))
    .filter(Boolean);
  const instructions = asList(payload.instructions)
    .map((item) => normalizeRecipeText(item))
    .filter(Boolean);

  const formatted = {
    title: normalizeRecipeText(payload.title ?? ""),
    course: normalizeRecipeText(payload.course ?? ""),
    url: normalizeRecipeText(url),
    ingredients: ingredients.map((item) => `- ${item}`).join("\n"),
    instructions: instructions
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n"),
    notes: normalizeRecipeText(payload.notes ?? ""),
    parse_error: normalizeRecipeText(payload.parse_error ?? ""),
  };

  if (
    !formatted.ingredients &&
    !formatted.instructions &&
    !formatted.parse_error
  ) {
    formatted.parse_error = "No structured recipe fields found on this page.";
  }

  if (
    formatted.title ||
    formatted.course ||
    formatted.ingredients ||
    formatted.instructions
  ) {
    return formatted;
  }

  return null;
}

function geminiHttpWarning(status: number) {
  if (status === 401 || status === 403) {
    return "Recipe imported, but AI import is not configured correctly on the server.";
  }
  if (status === 429) {
    return "Recipe imported, but AI import is rate limited right now. Try again in a minute.";
  }
  if (status >= 500) {
    return "Recipe imported, but AI import is temporarily unavailable.";
  }
  return "Recipe imported, but AI import is unavailable right now.";
}

async function parseRecipeWithGemini(
  options: {
    url: string;
    htmlContent: string;
    seedResult: Record<string, string>;
    convertUnits: boolean;
  },
): Promise<GeminiParseResult> {
  const { url, htmlContent, seedResult, convertUnits } = options;
  if (!GEMINI_API_KEY) {
    return {
      status: "disabled",
      warning: "Recipe imported, but AI import is not configured for this server.",
    };
  }
  if (!htmlContent) {
    return {
      status: "failed",
      warning: "Recipe imported, but Gemini could not read the page HTML.",
    };
  }

  const pageText = extractPageTextForLlm(htmlContent);
  if (!pageText) {
    return {
      status: "failed",
      warning: "Recipe imported, but Gemini could not extract readable page text.",
    };
  }

  const prompt =
    "Extract the recipe from the provided webpage content.\n" +
    "Return English output.\n" +
    "If the source language is not English, translate it to English.\n" +
    `Convert measurements, oven temperatures, and kitchen conventions to EU standards: ${
      convertUnits ? "yes" : "no"
    }.\n` +
    "Prefer grams, kilograms, millilitres, litres, centimetres, and Celsius when conversion is requested.\n" +
    "Ingredients rules:\n" +
    "- Return one ingredient per array item.\n" +
    "- Keep the original quantity, unit, and ingredient name together in each item.\n" +
    "- Remove bullets, numbering, duplicated headings, serving text, and commentary that is not part of the ingredient itself.\n" +
    "- Include short preparation notes only when they matter for cooking, for example 'finely chopped' or 'melted'.\n" +
    "- Do not merge multiple ingredients into one line.\n" +
    "Instructions rules:\n" +
    "- Return one clear cooking action per array item in logical order.\n" +
    "- Use concise imperative steps.\n" +
    "- Preserve important times, temperatures, quantities, and doneness cues in the relevant step.\n" +
    "- Do not include numbering in the text; numbering is added later.\n" +
    "- Do not repeat ingredient lists, intros, outros, or serving suggestions unless they are essential instructions.\n" +
    "- Prefer complete practical steps over fragmented sentence snippets.\n" +
    "Use the seed extraction when helpful, but correct it if the page text shows better data.\n" +
    "If the page is not a recipe or lacks enough content, leave arrays empty and set parse_error.\n\n" +
    `Source URL:\n${url}\n\n` +
    `Seed extraction:\n${recipeSeedText(seedResult) || "None"}\n\n` +
    `Page text:\n${pageText}`;

  let lastWarning = "Recipe imported, but AI import could not read this recipe.";
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(
        `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseJsonSchema: recipeParseJsonSchema,
            },
          }),
        },
      );

      if (!response.ok) {
        lastWarning = geminiHttpWarning(response.status);
        if (attempt < maxAttempts && response.status >= 500) {
          continue;
        }
        break;
      }

      const data = (await response.json()) as GenericObject;
      const candidates = asList(data.candidates);
      const firstCandidate = (candidates[0] as GenericObject | undefined) ?? {};
      const content = (firstCandidate.content as GenericObject | undefined) ?? {};
      const parts = asList(content.parts);
      const textPart = parts.find(
        (part) =>
          part &&
          typeof part === "object" &&
          typeof (part as GenericObject).text === "string",
      ) as GenericObject | undefined;
      const responseText =
        typeof textPart?.text === "string" ? textPart.text : "";

      if (!responseText) {
        lastWarning = "Recipe imported, but AI import returned an empty response.";
        break;
      }

      const payload = JSON.parse(responseText) as GenericObject;
      const formatted = formatGeminiRecipeResult(payload, url);
      if (!formatted) {
        lastWarning = "Recipe imported, but AI import returned unusable recipe data.";
        break;
      }
      return {
        status: "success",
        recipe: normalizeRecipePayload(formatted, { convertUnits }),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const normalizedDetail = normalizeRecipeText(detail).toLowerCase();
      lastWarning = normalizedDetail.includes("429") || normalizedDetail.includes("rate")
        ? "Recipe imported, but AI import is rate limited right now. Try again in a minute."
        : "Recipe imported, but AI import is temporarily unavailable.";
      if (attempt < maxAttempts) {
        continue;
      }
    }
  }

  return {
    status: "failed",
    warning: lastWarning,
  };
}

function fallbackTitle(inputUrl: string) {
  try {
    const parsed = new URL(inputUrl);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) return "New Recipe";
    const slug = path.split("/").pop()?.replace(/-/g, " ").trim() || "";
    return slug ? slug.replace(/\b\w/g, (char) => char.toUpperCase()) : "New Recipe";
  } catch {
    return "New Recipe";
  }
}

function fallbackRecipePayload(
  url: string,
  message: string,
  options: { convertUnits: boolean },
) {
  return normalizeRecipePayload(
    {
      title: fallbackTitle(url),
      course: "",
      url: normalizeRecipeText(url),
      ingredients: "",
      instructions: "",
      notes: "",
      parse_error: normalizeRecipeText(message),
      parse_source: "fallback",
    },
    { convertUnits: options.convertUnits },
  );
}

export async function parseRecipeUrl(
  url: string,
  options: { convertUnits?: boolean } = {},
) {
  const convertUnits = options.convertUnits ?? true;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("URL must be http or https");
    }
  } catch (error) {
    throw new Error(`Invalid URL: ${error}`);
  }

  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.google.com/",
  };

  const result: Record<string, string> = {
    title: "",
    course: "",
    url: normalizeRecipeText(url),
    ingredients: "",
    instructions: "",
      notes: "",
      parse_error: "",
      parse_warning: "",
      parse_source: "basic",
    };

  let htmlContent = "";
  let lastError = "";

  try {
    const response = await fetch(url, {
      headers: browserHeaders,
      redirect: "follow",
    });
    if (response.ok) {
      htmlContent = await response.text();
    } else {
      lastError = `HTTP ${response.status}`;
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  if (!htmlContent) {
    try {
      const response = await fetch(`https://r.jina.ai/${url}`);
      if (response.ok) {
        htmlContent = await response.text();
      } else {
        lastError = `Proxy HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!htmlContent) {
    return fallbackRecipePayload(
      url,
      `Could not auto-parse this page (${lastError || "unknown error"}).`,
      { convertUnits },
    );
  }

  try {
    const $ = load(htmlContent);
    const recipeNodes: GenericObject[] = [];

    $('script[type="application/ld+json"]').each((_, element) => {
      const text = $(element).html()?.trim();
      if (!text) return;
      try {
        recipeNodes.push(...collectJsonLdNodes(JSON.parse(text)));
      } catch {
        // Ignore invalid JSON-LD blocks.
      }
    });

    const bestRecipeNode = selectBestRecipeNode(recipeNodes);
    if (bestRecipeNode) {
      result.title = result.title || normalizeRecipeText(bestRecipeNode.name ?? "");
      const ingredients = extractIngredients(
        bestRecipeNode.recipeIngredient ?? bestRecipeNode.ingredients,
      );
      if (ingredients.length && !result.ingredients) {
        result.ingredients = ingredients.map((item) => `- ${item}`).join("\n");
      }
      const steps = extractInstructionSteps(bestRecipeNode.recipeInstructions);
      if (steps.length && !result.instructions) {
        result.instructions = steps
          .map((step, index) => `${index + 1}. ${step}`)
          .join("\n");
      }
    }

    if (!result.title) {
      result.title =
        $('meta[property="og:title"]').attr("content")?.trim() ||
        $("title").text().trim();
    }

    if (!result.ingredients) {
      const cleanIngredients = $(
        '[itemprop="recipeIngredient"], .recipe-ingredients li, .ingredients li',
      )
        .toArray()
        .map((element) => normalizeRecipeText($(element).text()))
        .filter(Boolean);

      if (cleanIngredients.length) {
        result.ingredients = cleanIngredients.map((item) => `- ${item}`).join("\n");
      }
    }

    if (!result.instructions) {
      const cleanSteps = $(
        '[itemprop="recipeInstructions"] li, .recipe-instructions li, .instructions li',
      )
        .toArray()
        .map((element) => normalizeRecipeText($(element).text()))
        .filter(Boolean);

      if (cleanSteps.length) {
        result.instructions = cleanSteps
          .map((step, index) => `${index + 1}. ${step}`)
          .join("\n");
      }
    }

    for (const key of ["title", "course", "ingredients", "instructions", "notes"] as const) {
      result[key] = result[key] ? normalizeRecipeText(result[key]) : "";
    }

    const geminiResult = await parseRecipeWithGemini({
      url,
      htmlContent,
      seedResult: result,
      convertUnits,
    });
    if (geminiResult.status === "success") {
      for (const [key, value] of Object.entries(geminiResult.recipe)) {
        if (key !== "url" && normalizeRecipeText(value)) {
          result[key] = String(value);
        }
      }
      result.parse_source = "gemini";
      result.parse_warning = "";
    } else {
      result.parse_warning = geminiResult.warning;
      if (geminiResult.status === "failed") {
        console.error("Gemini cookbook parsing failed:", {
          url,
          warning: geminiResult.warning,
        });
      }
    }

    if (!result.title) {
      result.title = fallbackTitle(url);
    }
    if (!result.ingredients && !result.instructions) {
      result.parse_error = "No structured recipe fields found on this page.";
    }

    return normalizeRecipePayload(result, { convertUnits });
  } catch (error) {
    return fallbackRecipePayload(
      url,
      `Could not fully parse this page (${error}).`,
      { convertUnits },
    );
  }
}
