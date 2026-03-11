import { type NextRequest, NextResponse } from "next/server";

import {
  APP_PASSWORD,
  AUTH_COOKIE_DOMAIN,
  AUTH_MAX_AGE_SECONDS,
  AUTH_TOKEN,
} from "./config";

function requestIsSecure(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",", 1)[0]?.trim().toLowerCase() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

function requestHostname(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.hostname || "";
  let hostname = host.split(",", 1)[0]?.trim().toLowerCase() || "";

  if (hostname.includes(":") && !hostname.startsWith("[")) {
    hostname = hostname.split(":", 1)[0] ?? hostname;
  }

  return hostname;
}

function cookieDomain(request: NextRequest): string | undefined {
  if (AUTH_COOKIE_DOMAIN) {
    return AUTH_COOKIE_DOMAIN;
  }

  const hostname = requestHostname(request);
  if (!hostname || hostname === "localhost") {
    return undefined;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return undefined;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) return undefined;
  if (labels.length === 2) return hostname;
  if (labels.length === 3) return labels.slice(1).join(".");
  return undefined;
}

export function isAuthEnabled() {
  return Boolean(APP_PASSWORD);
}

export function isAuthenticated(request: NextRequest) {
  if (!APP_PASSWORD) return true;
  return request.cookies.get("auth_token")?.value === AUTH_TOKEN;
}

export function requireApiAuth(request: NextRequest): NextResponse | null {
  if (isAuthenticated(request)) {
    return null;
  }
  return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
}

export function createLoginResponse(request: NextRequest) {
  const response = NextResponse.json({ message: "Logged in successfully" });
  response.cookies.set({
    name: "auth_token",
    value: AUTH_TOKEN ?? "",
    maxAge: AUTH_MAX_AGE_SECONDS,
    domain: cookieDomain(request),
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
  });
  return response;
}
