import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();

async function loadParser() {
  vi.resetModules();
  delete process.env.GEMINI_API_KEY;
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
});
