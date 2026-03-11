import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/gifts.css";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";
import { getGiftAuthenticatedUsername } from "@/lib/server/gifts-auth";

export const metadata: Metadata = {
  title: "Gift Ideas",
  icons: {
    icon: "/static/gifts-favicon.svg",
  },
};
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
