import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/skull-king.css";
import { createPageMetadata } from "@/lib/metadata";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";

export const metadata = createPageMetadata({
  title: "Skull King Score Sheet",
  description: "Keep score for a game of Skull King",
  variant: "home",
});
export const dynamic = "force-dynamic";

export default async function SkullKingLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/skull-king");
  }
  return children;
}
