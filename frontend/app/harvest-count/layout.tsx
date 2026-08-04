import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/harvest-count.css";
import { createPageMetadata } from "@/lib/metadata";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";

export const metadata = createPageMetadata({
  title: "Harvest Count",
  description: "Keep a running count of vegetables harvested from the garden",
  variant: "garden",
});
export const dynamic = "force-dynamic";

export default async function HarvestCountLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/harvest-count");
  }
  return children;
}
