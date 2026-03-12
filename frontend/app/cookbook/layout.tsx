import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/cookbook.css";
import { createPageMetadata } from "@/lib/metadata";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";

export const metadata = createPageMetadata({
  title: "Bruna's Cookbook",
  variant: "cookbook",
});
export const dynamic = "force-dynamic";

export default async function CookbookLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();

  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/cookbook");
  }

  return children;
}
