import type { ReactNode } from "react";

import "../../styles/cookbook.css";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Shared Recipe",
  variant: "cookbook",
});
export const dynamic = "force-dynamic";

export default function SharedRecipeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
