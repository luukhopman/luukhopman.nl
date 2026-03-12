import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Login",
  variant: "login",
});
export const dynamic = "force-dynamic";

export default function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
