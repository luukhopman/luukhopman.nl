import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import { parsePositiveIntegerParam } from "@/lib/server/params";
import { parseFeedbackStatus, updateFeedbackStatus } from "@/lib/server/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ feedbackId: string }> },
) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const feedbackId = parsePositiveIntegerParam((await context.params).feedbackId);
  if (feedbackId === null) {
    return NextResponse.json({ detail: "Invalid feedback id" }, { status: 400 });
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ detail: "Invalid feedback payload" }, { status: 400 });
  }

  const status = parseFeedbackStatus(body.status);
  if (!status) {
    return NextResponse.json({ detail: "Invalid feedback status" }, { status: 400 });
  }

  const item = await updateFeedbackStatus(feedbackId, status);
  if (!item) {
    return NextResponse.json({ detail: "Feedback item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}
