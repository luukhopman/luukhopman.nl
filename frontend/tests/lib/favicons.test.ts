import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getFaviconVariant,
  getPngFaviconPath,
  getSvgFaviconPath,
  type FaviconVariant,
} from "@/lib/favicons";

const variants: FaviconVariant[] = [
  "cookbook",
  "garden",
  "gifts",
  "home",
  "login",
  "todo",
  "wishlist",
];

describe("favicons", () => {
  it("uses static SVG and PNG assets for every page variant", async () => {
    for (const variant of variants) {
      expect(getSvgFaviconPath(variant)).toBe(`/static/${variant}-favicon.svg`);

      for (const size of [32, 180, 192, 512]) {
        const publicPath = getPngFaviconPath(variant, size);
        expect(publicPath).toBe(`/static/${variant}-favicon-${size}.png`);

        const file = await readFile(join(process.cwd(), "public", publicPath));
        expect(file.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      }
    }
  });

  it("falls back to the home icon for unknown variants", () => {
    expect(getFaviconVariant("unknown")).toBe("home");
  });
});
