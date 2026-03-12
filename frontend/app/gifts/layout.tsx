import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/gifts.css";
import { createPageMetadata } from "@/lib/metadata";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";
import { getGiftAuthenticatedUsername } from "@/lib/server/gifts-auth";

export const metadata = createPageMetadata({
  title: "Gifts",
  variant: "gifts",
});
export const dynamic = "force-dynamic";

export default async function GiftsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();

  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/gifts");
  }

  if (!getGiftAuthenticatedUsername(cookieStore)) {
    redirect("/gifts-login?redirect=/gifts");
  }

  return children;
}
