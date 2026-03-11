import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  icons: {
    icon: "/static/login-favicon.svg",
  },
};
export const dynamic = "force-dynamic";

export default function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
