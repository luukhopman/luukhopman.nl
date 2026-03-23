import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { TODO_CALENDAR_TOKEN } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  return `${protocol}://${host}`;
}

function toWebcalUrl(url: string) {
  if (url.startsWith("https://")) {
    return `webcal://${url.slice("https://".length)}`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const calendarUrl = new URL("/api/todos/calendar", requestOrigin(request));
  if (TODO_CALENDAR_TOKEN) {
    calendarUrl.searchParams.set("token", TODO_CALENDAR_TOKEN);
  }

  return NextResponse.json({
    calendar_url: calendarUrl.toString(),
    webcal_url: toWebcalUrl(calendarUrl.toString()),
  });
}
