import { NextResponse, type NextRequest } from "next/server";

import { requireApiAuth } from "@/lib/server/auth";
import {
  getGiftAuthenticatedUsername,
  requireGiftApiAuth,
} from "@/lib/server/gifts-auth";
import { query, queryOne } from "@/lib/server/db";
import { invalidParamResponse, parsePositiveIntegerParam } from "@/lib/server/params";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request) ?? requireGiftApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawGiftId = (await context.params).giftId;
  if (typeof rawGiftId !== "string") {
    return invalidParamResponse("gift id");
  }
  const giftId = parsePositiveIntegerParam(rawGiftId);
  if (giftId === null) {
    return invalidParamResponse("gift id");
  }

  const username = getGiftAuthenticatedUsername(request);
  const existing = await queryOne<{
    id: number;
    recipient_name: string;
    title: string;
    url: string | null;
    notes: string | null;
    purchased: boolean;
  }>(
    `
      SELECT id, recipient_name, title, url, notes, purchased
      FROM gift_ideas
      WHERE id = $1 AND owner_username = $2
    `,
    [giftId, username],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Gift idea not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    recipient_name?: string | null;
    title?: string | null;
    url?: string | null;
    notes?: string | null;
    purchased?: boolean | null;
  };

  const nextRecipientName =
    body.recipient_name !== undefined && body.recipient_name !== null
      ? body.recipient_name.trim()
      : existing.recipient_name;
  const nextTitle =
    body.title !== undefined && body.title !== null ? body.title.trim() : existing.title;

  if (!nextRecipientName) {
    return NextResponse.json({ detail: "Recipient name is required" }, { status: 400 });
  }

  if (!nextTitle) {
    return NextResponse.json({ detail: "Gift idea is required" }, { status: 400 });
  }

  await query(
    `
      UPDATE gift_ideas
      SET
        recipient_name = $3,
        title = $4,
        url = $5,
        notes = $6,
        purchased = $7
      WHERE id = $1 AND owner_username = $2
    `,
    [
      giftId,
      username,
      nextRecipientName,
      nextTitle,
      body.url !== undefined ? body.url?.trim() || null : existing.url,
      body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
      body.purchased !== undefined && body.purchased !== null
        ? body.purchased
        : existing.purchased,
    ],
  );

  return NextResponse.json({ message: "Gift idea updated successfully" });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) {
  const unauthorized = requireApiAuth(request) ?? requireGiftApiAuth(request);
  if (unauthorized) return unauthorized;

  const rawGiftId = (await context.params).giftId;
  if (typeof rawGiftId !== "string") {
    return invalidParamResponse("gift id");
  }
  const giftId = parsePositiveIntegerParam(rawGiftId);
  if (giftId === null) {
    return invalidParamResponse("gift id");
  }

  const username = getGiftAuthenticatedUsername(request);
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM gift_ideas WHERE id = $1 AND owner_username = $2`,
    [giftId, username],
  );

  if (!existing) {
    return NextResponse.json({ detail: "Gift idea not found" }, { status: 404 });
  }

  await query(`DELETE FROM gift_ideas WHERE id = $1 AND owner_username = $2`, [
    giftId,
    username,
  ]);

  return NextResponse.json({ message: "Gift idea deleted successfully" });
}
