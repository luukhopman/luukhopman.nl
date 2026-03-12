import type { Metadata } from "next";

import type { FaviconVariant } from "@/lib/favicons";
import { getPngFaviconPath, getSvgFaviconPath } from "@/lib/favicons";

type PageMetadataOptions = {
  description?: string;
  title: string;
  variant: FaviconVariant;
};

export function createPageMetadata({
  description,
  title,
  variant,
}: PageMetadataOptions): Metadata {
  const png32 = getPngFaviconPath(variant, 32);
  const apple180 = getPngFaviconPath(variant, 180);

  return {
    title,
    ...(description ? { description } : {}),
    icons: {
      icon: [
        { url: getSvgFaviconPath(variant), type: "image/svg+xml" },
        { url: png32, type: "image/png", sizes: "32x32" },
      ],
      shortcut: [{ url: png32, type: "image/png" }],
      apple: [{ url: apple180, type: "image/png", sizes: "180x180" }],
    },
  };
}
