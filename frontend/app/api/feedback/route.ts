import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  createFeedbackItem,
  getFeedbackItems,
  normalizeFeedbackMessage,
  normalizeFeedbackPath,
  parseFeedbackStatus,
} from "@/lib/server/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawStatus = request.nextUrl.searchParams.get("status");
  const status = rawStatus ? parseFeedbackStatus(rawStatus) : null;
  if (rawStatus && !status) {
    return NextResponse.json({ detail: "Invalid feedback status" }, { status: 400 });
  }

  return NextResponse.json(await getFeedbackItems(status ?? undefined));
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  let body: { page_path?: unknown; message?: unknown };
  try {
    body = (await request.json()) as { page_path?: unknown; message?: unknown };
  } catch {
    return NextResponse.json({ detail: "Invalid feedback payload" }, { status: 400 });
  }

  const pagePath = normalizeFeedbackPath(body.page_path);
  const message = normalizeFeedbackMessage(body.message);
  if (!pagePath || !message) {
    return NextResponse.json(
      { detail: "Enter feedback and include a valid page path" },
      { status: 400 },
    );
  }

  return NextResponse.json(await createFeedbackItem(pagePath, message), { status: 201 });
}
