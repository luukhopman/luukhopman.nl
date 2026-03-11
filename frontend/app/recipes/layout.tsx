import type { ReactNode } from "react";
import type { Metadata } from "next";

import "../../styles/cookbook.css";

export const metadata: Metadata = {
  title: "Shared Recipe",
  icons: {
    icon: "/static/cookbook-favicon.svg",
  },
};

export default function SharedRecipeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
