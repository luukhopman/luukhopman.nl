import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import "../../styles/landing.css";
import { APP_PASSWORD, AUTH_TOKEN } from "@/lib/server/config";

export const metadata: Metadata = {
  title: "Welcome Home",
  icons: {
    icon: "/static/home-favicon.svg",
  },
};
export const dynamic = "force-dynamic";

export default async function LandingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();

  if (APP_PASSWORD && cookieStore.get("auth_token")?.value !== AUTH_TOKEN) {
    redirect("/login?redirect=/");
  }

  return children;
}
