import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Website",
    short_name: "Website",
    description: "Household tools for meals, lists, tasks, recipes, gifts, shopping, and the garden",
    start_url: "/",
    display: "browser",
    background_color: "#fff7ee",
    theme_color: "#6b8474",
    icons: [
      {
        src: "/favicons/home?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicons/home?size=512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
