import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/energy.css";
import { createPageMetadata } from "@/lib/metadata";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";

export const metadata = createPageMetadata({
  title: "Energy",
  description: "Track household energy use and estimated costs",
  variant: "home",
});
export const dynamic = "force-dynamic";

export default async function EnergyLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/energy");
  }
  return children;
}
