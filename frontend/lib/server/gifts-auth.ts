import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { APP_PASSWORD, AUTH_COOKIE_DOMAIN, AUTH_MAX_AGE_SECONDS } from "./config";

type CookieStoreLike = {
  get: (name: string) => { value: string } | undefined;
};

const GIFTS_COOKIE_NAME = "gifts_auth_token";

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

function createGiftTokenSignature(token: string) {
  return crypto
    .createHash("sha256")
    .update(`gifts:v2:${token}:${APP_PASSWORD}`)
    .digest("hex");
}

function decodeSessionToken(tokenPayload: string) {
  const [encodedToken, signature] = tokenPayload.split(".", 2);
  if (!encodedToken || !signature) {
    return null;
  }

  try {
    const token = Buffer.from(encodedToken, "base64url").toString("utf8");
    if (createGiftTokenSignature(token) === signature) {
      return token;
    }
  } catch {
    return null;
  }
  return null;
}

function sessionFromCookies(cookieStore: CookieStoreLike) {
  const tokenPayload = cookieStore.get(GIFTS_COOKIE_NAME)?.value;
  if (!tokenPayload) {
    return null;
  }

  return decodeSessionToken(tokenPayload);
}

export function isGiftsAuthEnabled() {
  return true;
}

export function validateGiftCredentials(
  password: string | null | undefined,
) {
  const token = password?.trim();
  if (!token) {
    return null;
  }
  return token;
}

export function getGiftAuthenticatedUsername(
  requestOrCookies: NextRequest | CookieStoreLike,
): string | null {
  return sessionFromCookies(
    "cookies" in requestOrCookies ? requestOrCookies.cookies : requestOrCookies,
  );
}

export function requireGiftApiAuth(request: NextRequest) {
  if (getGiftAuthenticatedUsername(request)) {
    return null;
  }

  return NextResponse.json({ detail: "Gift auth required" }, { status: 401 });
}

export function createGiftLoginResponse(request: NextRequest, username: string) {
  const tokenPayload = `${Buffer.from(username, "utf8").toString("base64url")}.${createGiftTokenSignature(
    username,
  )}`;
  const response = NextResponse.json({ message: "Gift login successful" });
  response.cookies.set({
    name: GIFTS_COOKIE_NAME,
    value: tokenPayload,
    maxAge: AUTH_MAX_AGE_SECONDS,
    domain: cookieDomain(request),
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
  });
  return response;
}

export function createGiftLogoutResponse(request: NextRequest) {
  const response = NextResponse.json({ message: "Gift login cleared" });
  response.cookies.set({
    name: GIFTS_COOKIE_NAME,
    value: "",
    maxAge: 0,
    domain: cookieDomain(request),
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(request),
    path: "/",
  });
  return response;
}
