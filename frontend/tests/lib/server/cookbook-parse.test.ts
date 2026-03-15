import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();

async function loadParser() {
  vi.resetModules();
  delete process.env.GEMINI_API_KEY;
  vi.stubGlobal("fetch", fetchMock);
  return import("@/lib/server/cookbook-parse");
}

async function loadParserWithGemini() {
  vi.resetModules();
  process.env.GEMINI_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
  return import("@/lib/server/cookbook-parse");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  fetchMock.mockReset();
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});

describe("parseRecipeUrl", () => {
  it("extracts recipe data from json-ld markup", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <title>Ignored</title>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Tomato Soup",
                  "recipeIngredient": ["2 cups stock", "1 onion"],
                  "recipeInstructions": ["Cook onions", "Add stock"]
                }
              </script>
            </head>
            <body></body>
          </html>
        `,
        { status: 200 },
      ),
    );

    const { parseRecipeUrl } = await loadParser();
    const result = await parseRecipeUrl("https://example.com/tomato-soup");

    expect(result).toMatchObject({
      title: "Tomato Soup",
      url: "https://example.com/tomato-soup",
      ingredients: "- 480 ml stock\n- 1 onion",
      instructions: "1. Cook onions\n2. Add stock",
      parse_source: "basic",
      parse_error: "",
      parse_warning: "Recipe imported, but AI import is not configured for this server.",
    });
  });

  it("returns a fallback payload when the page cannot be fetched", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    fetchMock.mockRejectedValueOnce(new Error("proxy unavailable"));

    const { parseRecipeUrl } = await loadParser();
    const result = await parseRecipeUrl("https://example.com/my-recipe");

    expect(result.title).toBe("My Recipe");
    expect(result.parse_source).toBe("fallback");
    expect(result.parse_error).toContain("Could not auto-parse this page");
  });

  it("rejects non-http urls", async () => {
    const { parseRecipeUrl } = await loadParser();

    await expect(parseRecipeUrl("ftp://example.com/recipe")).rejects.toThrow(
      "Invalid URL",
    );
  });

  it("returns a warning when Gemini fails but basic parsing succeeds", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Roast Potatoes",
                  "recipeIngredient": ["2 cups stock", "1 onion"],
                  "recipeInstructions": ["Cook onions", "Add stock"]
                }
              </script>
            </head>
            <body>
              <main>
                <h1>Roast Potatoes</h1>
                <p>Peel potatoes and roast until golden.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "API key rejected",
          },
        }),
        { status: 401 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "API key rejected",
          },
        }),
        { status: 401 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/roast-potatoes");

    expect(result).toMatchObject({
      title: "Roast Potatoes",
      parse_source: "basic",
    });
    expect(String(result.parse_warning)).toBe(
      "Recipe imported, but the Gemini API key was rejected by Google.",
    );
  });

  it("returns a rate limit warning when Gemini is throttled", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Pasta Bake",
                  "recipeIngredient": ["1 cup stock"],
                  "recipeInstructions": ["Bake it"]
                }
              </script>
            </head>
            <body>
              <main>
                <h1>Pasta Bake</h1>
                <p>Mix ingredients and bake until bubbling.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Rate limit exceeded",
          },
        }),
        { status: 429 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/pasta-bake");

    expect(result).toMatchObject({
      title: "Pasta Bake",
      parse_source: "basic",
      parse_warning: "Recipe imported, but AI import is rate limited right now. Try again in a minute.",
    });
  });

  it("uses Gemini output when the API returns structured JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <title>Fallback title</title>
            </head>
            <body>
              <main>
                <h1>Lemon Cake</h1>
                <p>A soft cake with lemon zest.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Lemon Cake",
                      course: "Dessert",
                      ingredients: ["200 g flour", "2 eggs"],
                      instructions: ["Mix everything", "Bake until golden"],
                      notes: "Use unwaxed lemons.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/lemon-cake");

    expect(result).toMatchObject({
      title: "Lemon Cake",
      course: "Dessert",
      ingredients: "- 200 g flour\n- 2 eggs",
      instructions: "1. Mix everything\n2. Bake until golden",
      notes: "Use unwaxed lemons.",
      parse_source: "gemini",
      parse_warning: "",
    });

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}"),
    ) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const prompt = requestBody.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(prompt).toContain(
      "Each ingredient should read like a canonical shopping/cooking line",
    );
    expect(prompt).toContain(
      "Start each step with a clear imperative action when possible",
    );
  });

  it("falls back to plain JSON mode when Gemini rejects the structured schema", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <title>Soup</title>
            </head>
            <body>
              <main>
                <h1>Carrot Soup</h1>
                <p>Blend cooked carrots with stock.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid argument: unsupported response schema",
            status: "INVALID_ARGUMENT",
          },
        }),
        { status: 400 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Carrot Soup",
                      ingredients: ["500 g carrots", "1 L stock"],
                      instructions: ["Boil carrots", "Blend with stock"],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/carrot-soup");

    expect(result).toMatchObject({
      title: "Carrot Soup",
      ingredients: "- 500 g carrots\n- 1 L stock",
      instructions: "1. Boil carrots\n2. Blend with stock",
      parse_source: "gemini",
      parse_warning: "",
    });
  });

  it("returns a specific warning when the configured Gemini model is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Berry Crisp",
                  "recipeIngredient": ["2 cups berries"],
                  "recipeInstructions": ["Bake until bubbling"]
                }
              </script>
            </head>
            <body>
              <main>
                <h1>Berry Crisp</h1>
                <p>Scatter berries into a baking dish and bake until bubbling.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Model gemini-2.5-flash was not found",
            status: "NOT_FOUND",
          },
        }),
        { status: 404 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/berry-crisp");

    expect(result).toMatchObject({
      title: "Berry Crisp",
      parse_source: "basic",
      parse_warning: "Recipe imported, but the configured Gemini model is unavailable.",
    });
  });

  it("normalizes noisy Gemini ingredient and instruction output", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `
          <html>
            <body>
              <main>
                <h1>Sheet Pan Gnocchi</h1>
                <p>Roast gnocchi and vegetables until crisp.</p>
              </main>
            </body>
          </html>
        `,
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Sheet Pan Gnocchi",
                      ingredients: [
                        "Ingredients:",
                        "For the tray:",
                        "1. 500 g shelf-stable gnocchi.",
                        "- 2 tbsp olive oil",
                        "2 tbsp olive oil",
                      ],
                      instructions: [
                        "Instructions:",
                        "Step 1: Heat the oven to 220 C.",
                        "2) Toss the gnocchi with the oil.",
                        "2) Toss the gnocchi with the oil.",
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/sheet-pan-gnocchi");

    expect(result).toMatchObject({
      title: "Sheet Pan Gnocchi",
      ingredients: "- 500 g shelf-stable gnocchi\n- 30 ml olive oil",
      instructions: "1. Heat the oven to 220 C.\n2. Toss the gnocchi with the oil.",
      parse_source: "gemini",
      parse_warning: "",
    });
  });
});
