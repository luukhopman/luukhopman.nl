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

    const { parseRecipeUrl } = await loadParserWithGemini();
    const result = await parseRecipeUrl("https://example.com/roast-potatoes");

    expect(result).toMatchObject({
      title: "Roast Potatoes",
      parse_source: "basic",
    });
    expect(String(result.parse_warning)).toBe(
      "Recipe imported, but AI import is not configured correctly on the server.",
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
});
