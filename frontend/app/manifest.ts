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
        src: "/static/home-favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/static/home-favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
