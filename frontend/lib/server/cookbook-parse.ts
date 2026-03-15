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
      detail?: string;
    }
  | {
      status: "failed";
      warning: string;
      detail?: string;
    }
  | {
      status: "success";
      recipe: Record<string, unknown>;
    };

type GeminiAuthMode = "header" | "query";
type GeminiRequestMode = {
  authMode: GeminiAuthMode;
  structured: boolean;
};

const recipeParseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    course: { type: "STRING" },
    ingredients: { type: "ARRAY", items: { type: "STRING" } },
    instructions: { type: "ARRAY", items: { type: "STRING" } },
    notes: { type: "STRING" },
    parse_error: { type: "STRING" },
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

function stripRecipeListMarker(text: string) {
  return text
    .replace(/^(?:[-*+•]\s*)+/, "")
    .replace(/^step\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/^\d+\s*[\].):_-]\s*/, "")
    .trim();
}

function isStandaloneSectionHeading(text: string) {
  const normalized = normalizeRecipeText(text).trim();
  if (!normalized) return true;

  const withoutColon = normalized.replace(/:$/, "").trim().toLowerCase();
  return (
    /:$/.test(normalized) ||
    [
      "ingredient",
      "ingredients",
      "ingredient list",
      "instruction",
      "instructions",
      "method",
      "direction",
      "directions",
    ].includes(withoutColon)
  );
}

function normalizeGeminiIngredientItem(value: unknown) {
  let text = stripRecipeListMarker(normalizeRecipeText(value));
  text = text.replace(/^(?:ingredients?|ingredient list)\s*[:.-]\s*/i, "");

  if (!text || isStandaloneSectionHeading(text)) {
    return "";
  }

  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/[;,.:]+$/, "").trim();

  return text;
}

function normalizeGeminiInstructionStep(value: unknown) {
  let text = stripRecipeListMarker(normalizeRecipeText(value));
  text = text.replace(/^(?:instructions?|method|directions?)\s*[:.-]\s*/i, "");

  if (!text || isStandaloneSectionHeading(text)) {
    return "";
  }

  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function dedupeRecipeItems(items: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function formatGeminiRecipeResult(payload: GenericObject, url: string) {
  const ingredients = dedupeRecipeItems(
    asList(payload.ingredients)
      .map((item) => normalizeGeminiIngredientItem(item))
      .filter(Boolean),
  );
  const instructions = dedupeRecipeItems(
    asList(payload.instructions)
      .map((item) => normalizeGeminiInstructionStep(item))
      .filter(Boolean),
  );

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

function clampGeminiDetail(value: string, limit = 240) {
  const normalized = normalizeRecipeText(value);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trim()}...`;
}

function extractGeminiErrorMessage(payload: GenericObject) {
  const errorPayload = (payload.error as GenericObject | undefined) ?? payload;
  const parts = [
    normalizeRecipeText(errorPayload.message ?? ""),
    normalizeRecipeText(errorPayload.status ?? ""),
  ].filter(Boolean);
  return parts.join(" | ");
}

async function readGeminiErrorDetail(response: Response) {
  const bodyText = await response.text();
  if (!bodyText) return "";

  try {
    return clampGeminiDetail(
      extractGeminiErrorMessage(JSON.parse(bodyText) as GenericObject) || bodyText,
    );
  } catch {
    return clampGeminiDetail(bodyText);
  }
}

function geminiHttpWarning(status: number, detail = "") {
  const normalizedDetail = normalizeRecipeText(detail).toLowerCase();

  if (status === 400) {
    if (
      normalizedDetail.includes("model") &&
      (normalizedDetail.includes("not found") || normalizedDetail.includes("unsupported"))
    ) {
      return "Recipe imported, but the configured Gemini model is unavailable.";
    }
    if (
      normalizedDetail.includes("schema") ||
      normalizedDetail.includes("invalid argument") ||
      normalizedDetail.includes("responsemime")
    ) {
      return "Recipe imported, but the server sent an unsupported Gemini request.";
    }
    return "Recipe imported, but Gemini rejected the AI import request.";
  }
  if (status === 401 || status === 403) {
    if (normalizedDetail.includes("api key")) {
      return "Recipe imported, but the Gemini API key was rejected by Google.";
    }
    if (normalizedDetail.includes("permission") || normalizedDetail.includes("access")) {
      return "Recipe imported, but this Gemini key cannot access the configured model.";
    }
    return "Recipe imported, but AI import is not configured correctly on the server.";
  }
  if (status === 404 && normalizedDetail.includes("model")) {
    return "Recipe imported, but the configured Gemini model is unavailable.";
  }
  if (status === 429) {
    return "Recipe imported, but AI import is rate limited right now. Try again in a minute.";
  }
  if (status >= 500) {
    return "Recipe imported, but AI import is temporarily unavailable.";
  }
  return "Recipe imported, but AI import is unavailable right now.";
}

function shouldRetryGeminiRequest(
  status: number,
  detail: string,
  mode: GeminiRequestMode,
) {
  const normalizedDetail = normalizeRecipeText(detail).toLowerCase();

  if (
    mode.structured &&
    status === 400 &&
    (
      normalizedDetail.includes("schema") ||
      normalizedDetail.includes("invalid argument") ||
      normalizedDetail.includes("unknown name") ||
      normalizedDetail.includes("responsemime")
    )
  ) {
    return { authMode: mode.authMode, structured: false } satisfies GeminiRequestMode;
  }

  if (
    mode.authMode === "header" &&
    (status === 401 || status === 403)
  ) {
    return { authMode: "query", structured: mode.structured } satisfies GeminiRequestMode;
  }

  return null;
}

function parseGeminiPayloadText(responseText: string) {
  const normalized = normalizeRecipeText(responseText);
  if (!normalized) return null;

  const withoutFence = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [withoutFence];
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(withoutFence.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as GenericObject;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractGeminiResponseText(data: GenericObject) {
  const promptFeedback = (data.promptFeedback as GenericObject | undefined) ?? {};
  const promptBlockReason = normalizeRecipeText(promptFeedback.blockReason ?? "");
  if (promptBlockReason) {
    return {
      responseText: "",
      warning:
        "Recipe imported, but Gemini blocked this page content and could not extract the recipe.",
      detail: `Prompt blocked: ${promptBlockReason}`,
    };
  }

  const candidates = asList(data.candidates);
  const firstCandidate = (candidates[0] as GenericObject | undefined) ?? {};
  const finishReason = normalizeRecipeText(firstCandidate.finishReason ?? "");
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

  if (responseText) {
    return {
      responseText,
      warning: "",
      detail: finishReason ? `Finish reason: ${finishReason}` : "",
    };
  }

  if (finishReason) {
    return {
      responseText: "",
      warning: "Recipe imported, but Gemini returned no usable recipe content.",
      detail: `Finish reason: ${finishReason}`,
    };
  }

  return {
    responseText: "",
    warning: "Recipe imported, but AI import returned an empty response.",
    detail: "No text part was present in the Gemini response.",
  };
}

function buildGeminiRequest(
  prompt: string,
  apiKey: string,
  mode: GeminiRequestMode,
) {
  const endpoint =
    mode.authMode === "query"
      ? `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
      : `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`;

  const promptText = mode.structured
    ? prompt
    : `${prompt}\n\nReturn exactly one JSON object with keys title, course, ingredients, instructions, notes, and parse_error. Do not use markdown fences.`;

  return {
    endpoint,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(mode.authMode === "header" ? { "x-goog-api-key": apiKey } : {}),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          ...(mode.structured ? { responseSchema: recipeParseSchema } : {}),
        },
      }),
    } satisfies RequestInit,
  };
}

function buildGeminiPrompt(options: {
  url: string;
  seedResult: Record<string, string>;
  pageText: string;
  convertUnits: boolean;
}) {
  const { url, seedResult, pageText, convertUnits } = options;

  return [
    "Extract one clean, canonical recipe from the provided webpage content.",
    "You are preparing structured recipe data for a shopping list and step-by-step cooking UI.",
    "Return English output only.",
    "If the source language is not English, translate it to natural English.",
    "Ignore webpage chrome, ads, popups, newsletter text, affiliate copy, comments, ratings, nutrition widgets, and author storytelling unless it contains essential recipe data.",
    `Convert measurements, oven temperatures, and kitchen conventions to EU standards: ${convertUnits ? "yes" : "no"}.`,
    "Prefer grams, kilograms, millilitres, litres, centimetres, and Celsius when conversion is requested.",
    "Never invent quantities, times, temperatures, pan sizes, or ingredients that are not supported by the source.",
    "",
    "Title rules:",
    "- Return the clearest recipe name only.",
    "- Remove branding, SEO filler, dates, and decorative subtitles unless they are part of the actual dish name.",
    "",
    "Ingredients rules:",
    "- Return one ingredient per array item.",
    "- Each ingredient should read like a canonical shopping/cooking line: quantity + unit + ingredient name + essential preparation note when needed.",
    "- Good examples: '250 g plain flour', '1 onion, finely chopped', '2 eggs, beaten'.",
    "- Keep quantity, unit, and ingredient together in the same item.",
    "- Standardize wording when possible: translate to English, normalize obvious abbreviations, and prefer concise ingredient names.",
    "- Remove bullets, numbering, duplicated headings, serving text, promotional wording, and commentary that is not part of the ingredient itself.",
    "- Do not output standalone section headers such as 'Ingredients' or 'For the sauce'.",
    "- If ingredient groups are essential, prefix the affected ingredients with a short group label, for example 'Sauce: 2 tbsp olive oil'. Do not emit the group label on its own line.",
    "- Keep optional ingredients marked as optional.",
    "- Include short preparation notes only when they materially affect shopping or cooking, for example 'melted', 'room temperature', or 'finely chopped'.",
    "- Do not merge multiple ingredients into one line.",
    "- Do not repeat duplicate ingredients unless the source clearly treats them as separate grouped entries.",
    "",
    "Instructions rules:",
    "- Return one practical cooking step per array item in chronological order.",
    "- Start each step with a clear imperative action when possible, for example 'Heat', 'Whisk', 'Bake', 'Fold'.",
    "- Keep each step self-contained enough to cook from it without relying on vague references like 'do the same' or 'add the above'.",
    "- Preserve important times, temperatures, quantities, vessel sizes, and doneness cues in the relevant step.",
    "- Prefer explicit ingredient names over ambiguous pronouns when that improves clarity.",
    "- Combine tiny fragments only when they are clearly part of one action; otherwise split them into separate steps.",
    "- Do not include numbering, bullets, 'Step 1', or section headers in the text.",
    "- Do not repeat ingredient lists, introductions, outros, or serving suggestions unless they are essential instructions.",
    "- Rewrite noisy or fragmented source wording into clean, direct kitchen language without changing the meaning.",
    "",
    "Notes rules:",
    "- Use notes for concise but useful extras such as make-ahead advice, storage, yield, substitutions, garnish, or serving suggestions.",
    "- Keep notes short and skip them if there is nothing useful.",
    "",
    "Failure rule:",
    "- If the page is not a recipe or lacks enough content to extract a trustworthy recipe, leave arrays empty and set parse_error.",
    "",
    "Use the seed extraction when helpful, but correct it whenever the main page text provides better data.",
    "",
    `Source URL:\n${url}`,
    "",
    `Seed extraction:\n${recipeSeedText(seedResult) || "None"}`,
    "",
    `Page text:\n${pageText}`,
  ].join("\n");
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

  const prompt = buildGeminiPrompt({
    url,
    seedResult,
    pageText,
    convertUnits,
  });

  let lastWarning = "Recipe imported, but AI import could not read this recipe.";
  let lastDetail = "";
  const requestQueue: GeminiRequestMode[] = [
    { authMode: "header", structured: true },
  ];
  const attemptedModes = new Set<string>();
  let transientRetries = 0;

  while (requestQueue.length) {
    const mode = requestQueue.shift() as GeminiRequestMode;
    const modeKey = `${mode.authMode}:${mode.structured ? "structured" : "plain"}`;
    if (attemptedModes.has(modeKey)) {
      continue;
    }
    attemptedModes.add(modeKey);

    try {
      const request = buildGeminiRequest(prompt, GEMINI_API_KEY, mode);
      const response = await fetch(request.endpoint, request.init);

      if (!response.ok) {
        lastDetail = await readGeminiErrorDetail(response);
        lastWarning = geminiHttpWarning(response.status, lastDetail);

        const retryMode = shouldRetryGeminiRequest(response.status, lastDetail, mode);
        if (retryMode) {
          requestQueue.unshift(retryMode);
          continue;
        }

        if (response.status >= 500 && transientRetries < 1) {
          transientRetries += 1;
          attemptedModes.delete(modeKey);
          requestQueue.unshift(mode);
          continue;
        }

        continue;
      }

      const data = (await response.json()) as GenericObject;
      const responseInfo = extractGeminiResponseText(data);
      const responseText = responseInfo.responseText;

      if (!responseText) {
        lastWarning = responseInfo.warning;
        lastDetail = responseInfo.detail;
        continue;
      }

      const payload = parseGeminiPayloadText(responseText);
      if (!payload) {
        lastWarning = "Recipe imported, but Gemini returned invalid JSON recipe data.";
        lastDetail = clampGeminiDetail(responseText);
        if (mode.structured) {
          requestQueue.unshift({ authMode: mode.authMode, structured: false });
        }
        continue;
      }

      const formatted = formatGeminiRecipeResult(payload, url);
      if (!formatted) {
        lastWarning = "Recipe imported, but AI import returned unusable recipe data.";
        lastDetail = clampGeminiDetail(JSON.stringify(payload));
        continue;
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
      lastDetail = clampGeminiDetail(detail);
      if (transientRetries < 1) {
        transientRetries += 1;
        attemptedModes.delete(modeKey);
        requestQueue.unshift(mode);
      }
    }
  }

  return {
    status: "failed",
    warning: lastWarning,
    detail: lastDetail,
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
          detail: geminiResult.detail,
          model: GEMINI_MODEL,
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
